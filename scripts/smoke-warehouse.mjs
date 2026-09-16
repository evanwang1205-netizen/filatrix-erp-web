import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

import { createSeedData } from '../server/seed-data.mjs';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function qty(row, numberKey, displayKey) {
  const explicit = Number(row?.[numberKey]);
  if (Number.isFinite(explicit)) return explicit;
  return Number(String(row?.[displayKey] || '').replace(/[^\d.-]/g, '')) || 0;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

async function request(baseUrl, path, options = {}) {
  const { account = 'ACC-ZHANGSAN', ...requestOptions } = options;
  const response = await fetch(`${baseUrl}${path}`, {
    ...requestOptions,
    headers: {
      accept: 'application/json',
      'x-filatrix-account': account,
      ...(requestOptions.body ? { 'content-type': 'application/json' } : {}),
    },
    body: requestOptions.body ? JSON.stringify(requestOptions.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function ok(baseUrl, path, options = {}) {
  const result = await request(baseUrl, path, options);
  if (!result.response.ok) throw new Error(`HTTP ${result.response.status}: ${result.payload.error || path}`);
  return result.payload;
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const health = await ok(baseUrl, '/health');
      if (health.ok) return;
    } catch {
      // Temporary API may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('temporary warehouse API did not become healthy');
}

function inventoryRow(rows, materialCode, warehouseCode, batch = '', location = '') {
  return rows.find((row) => (
    row.materialCode === materialCode
    && row.warehouseCode === warehouseCode
    && (!batch || row.batch === batch)
    && (!location || row.location === location)
  ));
}

function salesIssueDispatchable(rows, issue, product) {
  return rows
    .filter((row) => (
      (product.materialCode ? row.materialCode === product.materialCode : row.item === product.name)
      && (issue.warehouseCode ? row.warehouseCode === issue.warehouseCode : issue.warehouse ? row.warehouse === issue.warehouse : true)
    ))
    .reduce((sum, row) => {
      const reservedForIssue = (row.reservationSources || [])
        .filter((source) => (
          source.sourceDoc === issue.sourceOrder
          && (!product.sourceLineId || !source.sourceLineId || source.sourceLineId === product.sourceLineId)
          && !['已释放', '已作废', '已消耗'].includes(source.status)
        ))
        .reduce((reserved, source) => reserved + qty(source, 'quantityNumber', 'qty'), 0);
      const available = qty(row, 'availableNumber', 'available');
      const onHand = qty(row, 'onHandNumber', 'onHand');
      return sum + Math.max(0, Math.min(onHand, available + reservedForIssue));
    }, 0);
}

function salesIssuePickingAllocations(rows, issue, product, requestedQuantity) {
  const unit = product.uom || '';
  const candidates = rows
    .filter((row) => (
      (product.materialCode ? row.materialCode === product.materialCode : row.item === product.name)
      && (issue.warehouseCode ? row.warehouseCode === issue.warehouseCode : issue.warehouse ? row.warehouse === issue.warehouse : true)
    ))
    .map((row) => {
      const reservedForIssue = (row.reservationSources || [])
        .filter((source) => (
          source.sourceDoc === issue.sourceOrder
          && (!product.sourceLineId || !source.sourceLineId || source.sourceLineId === product.sourceLineId)
          && !['已释放', '已作废', '已消耗'].includes(source.status)
        ))
        .reduce((reserved, source) => reserved + qty(source, 'quantityNumber', 'qty'), 0);
      const available = qty(row, 'availableNumber', 'available');
      const onHand = qty(row, 'onHandNumber', 'onHand');
      return {
        row,
        reservedForIssue,
        dispatchable: Math.max(0, Math.min(onHand, available + reservedForIssue)),
      };
    })
    .filter((candidate) => candidate.dispatchable > 0)
    .sort((left, right) => {
      if (Boolean(left.reservedForIssue) !== Boolean(right.reservedForIssue)) {
        return left.reservedForIssue ? -1 : 1;
      }
      return [
        left.row.expiryDate || '9999-12-31',
        left.row.batch || '',
        left.row.location || '',
      ].join('|').localeCompare([
        right.row.expiryDate || '9999-12-31',
        right.row.batch || '',
        right.row.location || '',
      ].join('|'));
    });
  let remaining = Math.max(0, requestedQuantity);
  const allocations = candidates.map(({ row, dispatchable }, index) => {
    const allocated = Math.min(remaining, dispatchable);
    remaining -= allocated;
    return {
      allocationId: `${product.sourceLineId || product.materialCode || 'line'}-A${index + 1}`,
      inventoryKey: row.key || '',
      warehouseCode: row.warehouseCode || '',
      warehouse: row.warehouse || '',
      location: row.location || '',
      batch: row.batch || '',
      qty: `${allocated}${unit ? ` ${unit}` : ''}`,
      uom: unit,
    };
  }).filter((allocation) => qty({ display: allocation.qty }, 'number', 'display') > 0);
  if (remaining > 0 && allocations.length) {
    const firstQuantity = qty({ display: allocations[0].qty }, 'number', 'display');
    allocations[0].qty = `${firstQuantity + remaining}${unit ? ` ${unit}` : ''}`;
  }
  return allocations;
}

function purchaseReturnAllocations(rows, task, product, requestedQuantity) {
  const unit = product.uom || '';
  const candidates = rows
    .filter((row) => (product.materialCode ? row.materialCode === product.materialCode : row.item === product.name))
    .map((row) => {
      const onHand = qty(row, 'onHandNumber', 'onHand');
      const held = qty(row, 'rejectedHoldNumber', 'rejectedHold')
        + qty(row, 'qcHoldNumber', 'qcHold')
        + qty(row, 'pendingInboundNumber', 'pendingInbound');
      const qualifiedAvailable = Math.min(
        qty(row, 'qualifiedOnHandNumber', 'qualifiedOnHand'),
        qty(row, 'availableNumber', 'available'),
      );
      return { row, returnable: Math.max(0, Math.min(onHand, held + qualifiedAvailable)) };
    })
    .filter((candidate) => candidate.returnable > 0)
    .sort((left, right) => [
      left.row.warehouse || '',
      left.row.expiryDate || '9999-12-31',
      left.row.batch || '',
      left.row.location || '',
    ].join('|').localeCompare([
      right.row.warehouse || '',
      right.row.expiryDate || '9999-12-31',
      right.row.batch || '',
      right.row.location || '',
    ].join('|')));
  let remaining = Math.max(0, requestedQuantity);
  const allocations = candidates.map(({ row, returnable }, index) => {
    const allocated = Math.min(remaining, returnable);
    remaining -= allocated;
    return {
      allocationId: `${task.code}-A${index + 1}`,
      sourceLineId: product.sourceLineId || '',
      materialCode: product.materialCode || '',
      inventoryKey: row.key || '',
      warehouseCode: row.warehouseCode || '',
      warehouse: row.warehouse || '',
      location: row.location || '',
      batch: row.batch || '',
      qty: `${allocated}${unit ? ` ${unit}` : ''}`,
      uom: unit,
    };
  }).filter((allocation) => qty({ display: allocation.qty }, 'number', 'display') > 0);
  assert(remaining < 0.0001, `${task.code} did not have enough returnable inventory for exact allocation`);
  return allocations;
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'filatrix-warehouse-'));
  const dataFile = join(tempDir, 'erp-data.json');
  await writeFile(dataFile, JSON.stringify(createSeedData(), null, 2), 'utf8');
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: rootDir,
    env: { ...process.env, FILATRIX_API_HOST: '127.0.0.1', FILATRIX_API_PORT: String(port), FILATRIX_DATA_FILE: dataFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });

  try {
    await waitForHealth(baseUrl, child);

    const productionReceipts = await ok(baseUrl, '/warehouse/production-receipts');
    const finishedGoodsReceipt = productionReceipts.items.find((row) => row.warehouseCode === 'WH-FG');
    assert(
      !finishedGoodsReceipt || finishedGoodsReceipt.warehouse === '成品仓',
      'warehouse document kept a non-canonical name for WH-FG',
    );
    const beforeSales = await ok(baseUrl, '/warehouse/inventory');
    const inventoryKeys = beforeSales.items.map((row) => row.key).filter(Boolean);
    assert(new Set(inventoryKeys).size === inventoryKeys.length, 'inventory endpoint returned duplicate fact keys');
    assert(beforeSales.items.every((row) => (
      [
        ['onHandNumber', 'onHand'],
        ['qualifiedOnHandNumber', 'qualifiedOnHand'],
        ['reservedNumber', 'reserved'],
        ['allocatedNumber', 'allocated'],
        ['frozenNumber', 'frozen'],
        ['qcHoldNumber', 'qcHold'],
        ['pendingInboundNumber', 'pendingInbound'],
        ['rejectedHoldNumber', 'rejectedHold'],
        ['exceptionHoldNumber', 'exceptionHold'],
        ['inTransitNumber', 'inTransit'],
        ['inboundPlanNumber', 'inboundPlan'],
        ['outboundPlanNumber', 'outboundPlan'],
      ].some(([numberKey, displayKey]) => Math.abs(qty(row, numberKey, displayKey)) > 0.0001)
    )), 'inventory endpoint mixed zero-balance history into the current balance view');
    assert(beforeSales.items.every((row) => Math.abs(
      qty(row, 'onHandNumber', 'onHand')
      - qty(row, 'qualifiedOnHandNumber', 'qualifiedOnHand')
      - qty(row, 'qcHoldNumber', 'qcHold')
      - qty(row, 'pendingInboundNumber', 'pendingInbound')
      - qty(row, 'rejectedHoldNumber', 'rejectedHold')
      - qty(row, 'exceptionHoldNumber', 'exceptionHold')
    ) < 0.0001), 'inventory physical quantity is not fully partitioned by quality and inbound state');
    const dataStatBeforeRepeatedRead = await stat(dataFile);
    const repeatedInventoryRead = await ok(baseUrl, '/warehouse/inventory');
    const dataStatAfterRepeatedRead = await stat(dataFile);
    assert(repeatedInventoryRead.items.length === beforeSales.items.length, 'repeated inventory read generated additional fact rows');
    assert(
      dataStatAfterRepeatedRead.mtimeMs === dataStatBeforeRepeatedRead.mtimeMs,
      'read-only inventory request rewrote the persisted data file',
    );
    const completedReceiptStock = inventoryRow(beforeSales.items, 'M-CM-MATTE-BLK', 'WH-RM', 'MB-MBK-260702-A');
    assert(qty(completedReceiptStock, 'onHandNumber', 'onHand') === 300, 'completed purchase receipt stock fact is missing');
    const partialReceiptStock = inventoryRow(beforeSales.items, 'M-RM-PETG-VIRGIN', 'WH-QC-HOLD', 'PETG-260712-A', 'QC-AUTO');
    assert(qty(partialReceiptStock, 'onHandNumber', 'onHand') === 1000, 'partial-quality receipt physical stock is missing');
    assert(qty(partialReceiptStock, 'qcHoldNumber', 'qcHold') === 270, 'partial-quality receipt QC hold is incorrect');
    assert(qty(partialReceiptStock, 'pendingInboundNumber', 'pendingInbound') === 650, 'partial-quality receipt released quantity is incorrect');
    assert(qty(partialReceiptStock, 'rejectedHoldNumber', 'rejectedHold') === 80, 'partial-quality receipt rejected hold is incorrect');
    assert(
      beforeSales.items.filter((row) => (
        row.materialCode === 'M-RM-PETG-VIRGIN' && row.batch === 'PETG-260712-A'
      )).length === 1,
      'the same purchase batch was duplicated between staging and formal warehouses',
    );
    assert(
      !inventoryRow(beforeSales.items, 'M-RM-PETG-VIRGIN', 'WH-RM', 'PETG-260712-A'),
      'purchase staging stock was prematurely copied into the formal warehouse',
    );
    const initialLedger = await ok(baseUrl, '/warehouse/stock-ledger');
    assert(initialLedger.items.some((row) => row.sourceDoc === 'WR-20260702-001'), 'completed purchase receipt ledger is missing');
    assert(initialLedger.items.some((row) => row.sourceDoc === 'WR-20260717-003' && row.movement === '入库'), 'partial-order completed receipt ledger is missing');
    assert(initialLedger.items.some((row) => row.sourceDoc === 'WR-20260712-001' && row.movement === '质检冻结'), 'quality hold ledger is missing');
    assert(initialLedger.items.some((row) => row.sourceDoc === 'WR-20260712-001' && row.movement === '质检放行'), 'quality release ledger is missing');
    assert(initialLedger.items.some((row) => row.sourceDoc === 'WR-20260712-001' && row.movement === '采购到货'), 'purchase physical-arrival ledger is missing');
    assert(initialLedger.items.some((row) => row.sourceDoc === 'WR-20260712-001' && row.movement === '质检解冻'), 'quality hold release ledger is missing');
    assert(initialLedger.items.some((row) => row.sourceDoc === 'WR-20260712-001' && row.movement === '不合格隔离'), 'quality rejection ledger is missing');
    const legacyPurchaseStagingRows = initialLedger.items.filter((row) => (
      row.sourceDoc === 'WR-20260712-001'
      && ['待检', '待入库', '不合格隔离'].includes(row.balanceFact)
    ));
    assert(legacyPurchaseStagingRows.length >= 3, 'legacy purchase arrival should retain QC hold, pending-inbound, and rejected-hold ledger facts');
    assert(
      legacyPurchaseStagingRows.every((row) => row.warehouse === '采购暂存区' && row.location === 'QC-AUTO'),
      'legacy QC hold and pending-inbound ledger facts must remain in the purchase staging bin',
    );
    const legacyIncomingQuality = await ok(baseUrl, '/quality/incoming/IQ-20260712-001');
    assert(
      legacyIncomingQuality.record.warehouse === '采购暂存区',
      'incoming quality read model exposed a second legacy name for the purchase staging area',
    );
    const reservedRowBefore = inventoryRow(beforeSales.items, 'M-FG-PLA-175-WHT', 'WH-FG');
    assert(reservedRowBefore, 'reserved sales inventory row is missing');
    let reservedOnHandBefore = qty(reservedRowBefore, 'onHandNumber', 'onHand');
    assert(qty(reservedRowBefore, 'reservedNumber', 'reserved') === 240, 'sales reservation fixture is incorrect');
    const allocatedRow = beforeSales.items.find((row) => qty(row, 'allocatedNumber', 'allocated') > 0);
    assert(allocatedRow?.allocationSources?.some((source) => source.type === '生产分配' && source.sourceLineId), 'production allocation fixture is missing');
    const transitRow = beforeSales.items.find((row) => qty(row, 'inTransitNumber', 'inTransit') > 0);
    assert(transitRow?.transitSources?.some((source) => source.sourceDoc && source.path), 'transfer in-transit fixture is missing');
    const goldenTransitTransfer = await ok(baseUrl, '/warehouse/transfers/TR-20260716-002');
    assert(goldenTransitTransfer.transfer.submittedAt === '2026-07-16 15:05', 'golden transfer submission milestone is missing');
    assert(goldenTransitTransfer.transfer.submittedBy === '王倩', 'golden transfer submitter is missing');
    assert(goldenTransitTransfer.transfer.dispatchedAt === '2026-07-16 15:20', 'golden transfer dispatch milestone is missing');
    assert(goldenTransitTransfer.transfer.dispatchedBy === '王倩', 'golden transfer dispatcher is missing');
    const goldenStocktake = await ok(baseUrl, '/warehouse/stocktakes/ST-20260717-001');
    assert(goldenStocktake.stocktake.lines.length === 1, 'golden stocktake has summary counts but no snapshot line');
    const goldenFrozenRow = beforeSales.items.find((row) => row.key === goldenStocktake.stocktake.lines[0].inventoryKey);
    assert(qty(goldenFrozenRow, 'frozenNumber', 'frozen') > 0, 'golden stocktake did not freeze its inventory line');

    const purchaseOrders = await ok(baseUrl, '/purchase/orders');
    const purchaseReceipts = await ok(baseUrl, '/warehouse/purchase-receipts');
    const pendingReceiptTasks = purchaseReceipts.items.filter((receipt) => (
      receipt.status === '待收货' && receipt.sourceType !== 'purchase_after_sale'
    ));
    const seededRemedyReceipt = purchaseReceipts.items.find((receipt) => (
      receipt.status === '待收货'
      && receipt.sourceType === 'purchase_after_sale'
      && receipt.sourceAfterSale === 'PA-20260712-001'
    ));
    const receiptCandidates = await ok(baseUrl, '/reference/purchase-orders?kind=warehouse-receipt');
    assert(pendingReceiptTasks.length === 2, 'confirmed material purchase orders did not expose their pending receiving tasks');
    assert(seededRemedyReceipt, 'active purchase after-sales did not migrate to the unified purchase inbound queue');
    assert(receiptCandidates.items.length === 0, 'orders already represented by pending receiving tasks remained available for manual receipt creation');
    const petgReceiptTask = pendingReceiptTasks.find((item) => item.sourceDoc === 'PO-20260710-004');
    assert(qty({ display: petgReceiptTask?.products?.[0]?.plannedQty }, 'number', 'display') === 800, 'pending receipt task did not project the remaining PETG plan quantity');
    assert(qty({ display: petgReceiptTask?.products?.[0]?.arrivalQty }, 'number', 'display') === 0, 'pending receipt task fabricated a PETG actual arrival quantity');
    const plaReceiptTask = pendingReceiptTasks.find((item) => item.sourceDoc === 'PO-20260716-005');
    assert(qty({ display: plaReceiptTask?.products?.[0]?.plannedQty }, 'number', 'display') === 1900, 'pending receipt task did not project the remaining PLA plan quantity');
    assert(qty({ display: plaReceiptTask?.products?.[0]?.acceptedQty }, 'number', 'display') === 0, 'pending receipt task fabricated a PLA accepted quantity');
    const draftPreservationTask = plaReceiptTask || pendingReceiptTasks[0];
    const savedArrivalDraft = await ok(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(draftPreservationTask.code)}`, {
      method: 'PUT',
      body: {
        ...draftPreservationTask,
        date: '',
        location: 'QC-01',
        products: draftPreservationTask.products.map((line) => ({ ...line, batch: 'USER-BATCH-MUST-BE-IGNORED' })),
      },
    });
    assert(savedArrivalDraft.receipt.date === '', 'saving pending receipt content fabricated an actual arrival date');
    assert(savedArrivalDraft.receipt.location === 'QC-01', 'saving pending receipt did not retain the selected normal staging location');
    assert(savedArrivalDraft.receipt.owner === '待分配', 'saving pending receipt fabricated an operator before arrival submission');
    assert(savedArrivalDraft.receipt.arrivalDraftSavedAt, 'saving pending receipt did not mark the explicit arrival draft');
    assert(savedArrivalDraft.receipt.products.every((line) => !line.batch), 'pending receipt accepted a user-entered batch instead of keeping it system-generated');
    const missingActualDateSubmit = await request(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(draftPreservationTask.code)}/arrival-result`,
      {
        method: 'POST',
        body: {
          idempotencyKey: `${draftPreservationTask.code}-missing-date`,
          receipt: savedArrivalDraft.receipt,
        },
      },
    );
    assert(missingActualDateSubmit.response.status === 400, 'pending receipt without an actual arrival date was confirmed');
    assert(String(missingActualDateSubmit.payload.error || '').includes('实际到货日期'), 'missing actual arrival date error was not explicit');
    const actualArrivalProducts = savedArrivalDraft.receipt.products.map((line) => ({
      ...line,
      qty: line.plannedQty,
      arrivalQty: line.plannedQty,
      acceptedQty: line.plannedQty,
    }));
    const futureArrivalDraft = await ok(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(draftPreservationTask.code)}`, {
      method: 'PUT',
      body: {
        ...savedArrivalDraft.receipt,
        date: '2099-01-01',
        products: actualArrivalProducts,
      },
    });
    const futureActualDateSubmit = await request(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(draftPreservationTask.code)}/arrival-result`,
      {
        method: 'POST',
        body: {
          idempotencyKey: `${draftPreservationTask.code}-future-date`,
          receipt: futureArrivalDraft.receipt,
        },
      },
    );
    assert(futureActualDateSubmit.response.status === 400, 'pending receipt with a future actual arrival date was confirmed');
    assert(String(futureActualDateSubmit.payload.error || '').includes('不能晚于今天'), 'future actual arrival date error was not explicit');
    const datedArrivalDraft = await ok(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(draftPreservationTask.code)}`, {
      method: 'PUT',
      body: { ...futureArrivalDraft.receipt, date: '2026-07-28' },
    });
    const confirmedArrival = await ok(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(draftPreservationTask.code)}/arrival-result`,
      {
        method: 'POST',
        body: {
          idempotencyKey: `${draftPreservationTask.code}-arrival`,
          actor: '伪造仓库操作人',
          receipt: datedArrivalDraft.receipt,
        },
      },
    );
    assert(confirmedArrival.receipt.owner !== '待分配', 'arrival submission did not record the actual warehouse operator');
    assert(
      confirmedArrival.receipt.owner === '张三',
      'confirmed arrival did not set the authenticated execution actor as the warehouse operator',
    );
    assert(
      confirmedArrival.receipt.arrivalResult.submittedBy === '张三',
      'confirmed arrival trusted a client-supplied actor instead of the authenticated warehouse operator',
    );
    assert(confirmedArrival.receipt.products.every((line) => !line.batch), 'arrival result generated inventory batches before formal inbound');
    assert(datedArrivalDraft.receipt.products.every((line) => !line.batch), 'saving an actual date generated batches before arrival confirmation');
    const salesIssueCandidates = await ok(baseUrl, '/reference/outbound-requests?kind=warehouse-sales-issue');
    assert(salesIssueCandidates.items.length === 0, 'active delivery tracking still required a manual warehouse sales-issue source pick');
    const autoSalesIssues = await ok(baseUrl, '/warehouse/sales-issues');
    const partialSalesIssueTask = autoSalesIssues.items.find((item) => item.sourceDoc === 'SR-20260712-004');
    assert(partialSalesIssueTask?.status === '待拣货', 'remaining delivery quantity did not generate a warehouse picking task');
    assert(partialSalesIssueTask?.products?.[0]?.qty === '80 卷', 'auto sales-issue task did not project the remaining dispatch quantity');
    assert(
      partialSalesIssueTask.products.every((line) => line.batchControl && typeof line.batchTracked === 'boolean'),
      'auto sales-issue task did not freeze material-control attributes',
    );
    const newPickingTask = autoSalesIssues.items.find((item) => item.sourceDoc === 'SR-20260715-003');
    assert(newPickingTask?.status === '待拣货', 'new sales-issue task did not enter warehouse picking directly');
    assert(newPickingTask?.owner === '待分配', 'new sales-issue task assigned an operator before picking started');
    assert(
      !newPickingTask?.warehouseCode && !newPickingTask?.warehouse,
      'new sales-issue task still restricted picking to a preselected warehouse',
    );
    assert(newPickingTask?.address, 'sales-issue task dropped the delivery address from its source tracking');
    assert(
      newPickingTask?.supplementaryRequirement
      && newPickingTask.sourceRemark === newPickingTask.supplementaryRequirement
      && !newPickingTask.note,
      'sales issue lost the supplementary requirement or mixed it into the warehouse picking note',
    );
    const trackingBeforePicking = await ok(baseUrl, '/sales/outbound-requests/SR-20260715-003');
    assert(
      trackingBeforePicking.request.status === '待发货',
      'creating a sales-issue task changed its source tracking before actual outbound posting',
    );
    const pickingInventory = await ok(baseUrl, '/warehouse/inventory');
    const pickableProducts = newPickingTask.products.map((product) => {
      const dispatchable = salesIssueDispatchable(pickingInventory.items, newPickingTask, product);
      const taskQuantity = qty({ display: product.taskQty || product.qty }, 'number', 'display');
      const pickingQuantity = Math.min(taskQuantity, dispatchable);
      return {
        ...product,
        qty: `${pickingQuantity} ${product.uom || ''}`.trim(),
        allocations: salesIssuePickingAllocations(pickingInventory.items, newPickingTask, product, pickingQuantity),
      };
    });
    const overPickProduct = newPickingTask.products.find((product, index) => (
      qty({ display: product.qty }, 'number', 'display')
      > qty({ display: pickableProducts[index].qty }, 'number', 'display')
    ));
    if (overPickProduct) {
      const rejectedOverPick = await request(
        baseUrl,
        `/warehouse/sales-issues/${encodeURIComponent(newPickingTask.code)}/picking-result`,
        {
          method: 'POST',
          body: {
            idempotencyKey: `${newPickingTask.code}-over-pick`,
            date: '2026-07-30',
            products: newPickingTask.products.map((product) => ({
              ...product,
              allocations: salesIssuePickingAllocations(
                pickingInventory.items,
                newPickingTask,
                product,
                qty({ display: product.qty }, 'number', 'display'),
              ),
            })),
            note: '',
            attachments: [],
          },
        },
      );
      assert(
        rejectedOverPick.response.status === 409 && /(当前可供|当前可拣)/.test(rejectedOverPick.payload.error || ''),
        'sales picking review accepted a quantity above current dispatchable stock',
      );
    }
    const submittedPickingResult = await ok(
      baseUrl,
      `/warehouse/sales-issues/${encodeURIComponent(newPickingTask.code)}/picking-result`,
      {
        method: 'POST',
        body: {
          idempotencyKey: `${newPickingTask.code}-picking`,
          date: '2026-07-30',
          products: pickableProducts,
          note: '专项回归：开始登记销售出库拣货。',
          attachments: [],
        },
      },
    );
    assert(
      submittedPickingResult.issue.owner === '张三'
        && submittedPickingResult.issue.reviewSubmittedBy === '张三'
        && submittedPickingResult.issue.reviewSubmittedAt
        && submittedPickingResult.issue.status === '待复核',
      'atomic picking submission did not record the authenticated operator or enter review',
    );
    assert(!submittedPickingResult.issue.pickingStartedAt, 'atomic picking submission fabricated a separate picking-start milestone');
    assert(
      submittedPickingResult.issue.products
        .filter((product) => qty({ display: product.qty }, 'number', 'display') > 0)
        .every((product) => product.allocations?.length && product.allocations.every((allocation) => allocation.inventoryKey)),
      'picking result did not freeze exact batch/location allocations',
    );
    const trackingAfterPickingStart = await ok(baseUrl, '/sales/outbound-requests/SR-20260715-003');
    assert(
      trackingAfterPickingStart.request.status === '待发货',
      'starting warehouse picking introduced a redundant sales-facing acceptance status',
    );

    const lockedReceipt = await ok(baseUrl, '/warehouse/purchase-receipts/WR-20260712-001');
    const lockedReceiptProjection = lockedReceipt.detailProjection;
    const lockedAggregateLine = lockedReceiptProjection?.aggregateLines?.find((line) => (
      line.materialCode === 'M-RM-PETG-VIRGIN'
    ));
    assert(lockedReceiptProjection?.scopeType === 'purchase_order', 'purchase receipt detail did not expose its source-order aggregation scope');
    assert(
      lockedReceiptProjection?.arrivalRecords?.some((record) => record.receiptCode === 'WR-20260712-001'),
      'purchase receipt detail did not retain the immutable arrival history',
    );
    assert(
      Number(lockedAggregateLine?.arrivalQty || 0) > 0
        && Number(lockedAggregateLine?.arrivalQty || 0) < Number(lockedAggregateLine?.plannedQty || 0)
        && Number(lockedAggregateLine.qcPendingQty || 0) > 0
        && Number(lockedAggregateLine.releasedQty || 0) > 0
        && Number(lockedAggregateLine.availableQty || 0) > 0,
      'purchase receipt aggregate did not retain simultaneous arrival, quality, and inbound quantities',
    );
    const supplementedReceipt = await ok(baseUrl, '/warehouse/purchase-receipts/WR-20260712-001', {
      method: 'PUT',
      body: {
        ...lockedReceipt.receipt,
        note: '专项回归：补充随货记录。',
        attachments: [{ name: 'supplier-coa.pdf', size: '28 KB', uploader: '张三', date: '2026-07-22' }],
      },
    });
    assert(supplementedReceipt.receipt.note === '专项回归：补充随货记录。', 'arrived purchase receipt did not retain a safe note update');
    assert(supplementedReceipt.receipt.attachments?.[0]?.name === 'supplier-coa.pdf', 'purchase receipt attachment was not persisted');
    const tamperedLockedReceipt = await request(baseUrl, '/warehouse/purchase-receipts/WR-20260712-001', {
      method: 'PUT',
      body: {
        ...supplementedReceipt.receipt,
        products: supplementedReceipt.receipt.products.map((line, index) => index === 0 ? { ...line, qty: '1001 kg' } : line),
      },
    });
    assert(tamperedLockedReceipt.response.status === 409, 'arrived purchase receipt allowed its frozen quantity to change');
    const sourceReceiptTask = pendingReceiptTasks.find((receipt) => (
      receipt.code !== draftPreservationTask.code && receipt.products?.length
    ));
    const receiptSourceOrder = purchaseOrders.items.find((order) => order.code === sourceReceiptTask?.sourceDoc);
    assert(receiptSourceOrder, 'confirmed material purchase order fixture is missing');
    const receiptSourceLine = receiptSourceOrder.products[0];
    const authoritativeReceipt = await ok(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(sourceReceiptTask.code)}`, {
      method: 'PUT',
      body: {
        ...sourceReceiptTask,
        sourceDoc: receiptSourceOrder.code,
        supplierCode: 'SUP-TAMPERED',
        supplier: '被改写的供应商',
        products: [{
          sourceLineId: receiptSourceLine.lineId,
          materialCode: 'M-TAMPERED',
          name: '被改写的物料',
          model: 'TAMPERED',
          spec: 'TAMPERED',
          qty: '1',
          batch: 'AUTHORITY-TEST',
          uom: '箱',
        }],
        warehouseCode: 'WH-QC-HOLD',
        warehouse: '采购暂存区',
        location: 'QC-02',
        owner: '王倩',
        date: '2026-07-17',
        attachments: [{ name: 'delivery-note.pdf', size: '12 KB', uploader: '王倩', date: '2026-07-17' }],
      },
    });
    assert(authoritativeReceipt.receipt.supplierCode === receiptSourceOrder.supplierCode, 'purchase receipt supplier was not restored from source order');
    assert(authoritativeReceipt.receipt.products[0].sourceLineId === receiptSourceLine.lineId, 'purchase receipt source line was not retained');
    assert(authoritativeReceipt.receipt.products[0].materialCode === receiptSourceLine.materialCode, 'purchase receipt material identity was not restored from source line');
    assert(authoritativeReceipt.receipt.products[0].uom === receiptSourceLine.uom, 'purchase receipt base UOM was not restored from source line');
    assert(!authoritativeReceipt.receipt.products[0].batch, 'pending purchase receipt accepted a user-entered batch');
    assert(authoritativeReceipt.receipt.location === 'QC-02', 'pending purchase receipt did not retain the selected staging location');
    assert(authoritativeReceipt.receipt.owner === '待分配', 'pending purchase receipt trusted a client-supplied operator before arrival submission');
    assert(qty({ display: authoritativeReceipt.receipt.products[0].qty }, 'number', 'display') === 1, 'purchase receipt execution quantity should remain editable');
    assert(authoritativeReceipt.receipt.attachments?.[0]?.name === 'delivery-note.pdf', 'pending purchase receipt task did not persist its attachment');
    const exceptionUnit = authoritativeReceipt.receipt.products[0].uom || '件';
    const exceptionDraft = await ok(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(sourceReceiptTask.code)}`, {
      method: 'PUT',
      body: {
        ...authoritativeReceipt.receipt,
        date: '2026-07-28',
        products: authoritativeReceipt.receipt.products.map((line) => ({
          ...line,
          qty: `0 ${exceptionUnit}`,
          arrivalQty: `1 ${exceptionUnit}`,
          acceptedQty: `0 ${exceptionUnit}`,
          refusedQty: `0.4 ${exceptionUnit}`,
          exceptionHeldQty: `0.6 ${exceptionUnit}`,
          refusalReason: '包装破损、受潮或污染',
          exceptionNote: '专项回归：0.4 当场拒收，0.6 受控暂存并交采购售后处理。',
        })),
      },
    });
    const exceptionArrival = await ok(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(sourceReceiptTask.code)}/arrival-result`,
      {
        method: 'POST',
        body: { idempotencyKey: `${sourceReceiptTask.code}-exception-arrival` },
      },
    );
    assert(exceptionArrival.receipt.status === '异常暂收', 'exception-only arrival did not enter exception custody status');
    assert(exceptionArrival.purchaseAfterSale?.sourceReceipt === sourceReceiptTask.code, 'arrival rejection did not create a linked purchase after-sale record');
    const exceptionInventory = inventoryRow(
      exceptionArrival.inventory,
      exceptionDraft.receipt.products[0].materialCode,
      exceptionDraft.receipt.warehouseCode,
    );
    assert(qty(exceptionInventory, 'exceptionHoldNumber', 'exceptionHold') === 0.6, 'exception-held quantity was not isolated in purchase staging inventory');
    assert(qty(exceptionInventory, 'qualifiedOnHandNumber', 'qualifiedOnHand') === 0, 'exception-held quantity leaked into qualified inventory');
    const exceptionAfterSale = await ok(
      baseUrl,
      `/purchase/after-sales/${encodeURIComponent(exceptionArrival.purchaseAfterSale.code)}`,
    );
    const plannedExceptionAfterSale = await ok(
      baseUrl,
      `/purchase/after-sales/${encodeURIComponent(exceptionArrival.purchaseAfterSale.code)}`,
      {
        method: 'PUT',
        body: {
          ...exceptionAfterSale.record,
          action: '退货换货',
          goodsDisposition: '退回供应商',
          financialTreatment: '无金额调整',
          amountImpactType: '无金额影响',
          estimatedAmount: 0,
          planNote: '异常暂存实物由仓库退回供应商，换货品重新进入统一采购入库流程。',
        },
      },
    );
    assert(plannedExceptionAfterSale.record.status === '待受理', 'warehouse exception after-sale plan changed status before acceptance');
    const acceptedExceptionAfterSale = await ok(
      baseUrl,
      `/purchase/after-sales/${encodeURIComponent(exceptionArrival.purchaseAfterSale.code)}/advance`,
      {
        method: 'POST',
        body: { revision: plannedExceptionAfterSale.record.revision },
      },
    );
    const exceptionReturnTask = acceptedExceptionAfterSale.record.executionTasks.find((task) => (
      task.module === '仓库' && task.kind === '异常暂存退回'
    ));
    assert(exceptionReturnTask?.status === '待处理', 'accepted warehouse exception did not create an exception-hold return task');
    const receiptQueueAfterExceptionPlan = await ok(baseUrl, '/warehouse/purchase-receipts');
    const replacementReceipt = receiptQueueAfterExceptionPlan.items.find((receipt) => (
      receipt.sourceType === 'purchase_after_sale'
      && receipt.sourceAfterSale === exceptionArrival.purchaseAfterSale.code
      && receipt.status === '待收货'
    ));
    assert(replacementReceipt, 'replacement plan did not create a unified purchase inbound task');
    const replacementUnit = replacementReceipt.products[0].uom || 'kg';
    const replacementPlannedQty = qty(
      { display: replacementReceipt.products[0].plannedQty || replacementReceipt.products[0].qty },
      'number',
      'display',
    );
    const excessiveReplacement = await request(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(replacementReceipt.code)}`,
      {
        method: 'PUT',
        body: {
          ...replacementReceipt,
          date: '2026-07-28',
          products: replacementReceipt.products.map((line) => ({
            ...line,
            arrivalQty: `${replacementPlannedQty + 1} ${replacementUnit}`,
            acceptedQty: `${replacementPlannedQty + 1} ${replacementUnit}`,
          })),
        },
      },
    );
    assert(excessiveReplacement.response.status === 409, 'purchase remedy receipt accepted more than its frozen remedy plan');
    const savedReplacementReceipt = await ok(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(replacementReceipt.code)}`,
      {
        method: 'PUT',
        body: {
          ...replacementReceipt,
          date: '2026-07-28',
          location: 'QC-03',
          products: replacementReceipt.products.map((line) => ({
            ...line,
            qty: line.plannedQty,
            arrivalQty: line.plannedQty,
            acceptedQty: line.plannedQty,
          })),
        },
      },
    );
    assert(
      qty(
        { display: savedReplacementReceipt.receipt.products[0].plannedQty },
        'number',
        'display',
      ) === replacementPlannedQty,
      'saving a purchase remedy receipt lost its frozen remedy quantity',
    );
    const submittedReplacementArrival = await ok(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(replacementReceipt.code)}/arrival-result`,
      {
        method: 'POST',
        body: { idempotencyKey: `${replacementReceipt.code}:replacement-arrival` },
      },
    );
    assert(
      submittedReplacementArrival.receipt.status === '待质检'
        && submittedReplacementArrival.qualityTask?.sourceDoc === replacementReceipt.code,
      'purchase remedy arrival did not re-enter the unified incoming quality gate',
    );
    await ok(
      baseUrl,
      `/warehouse/after-sales-tasks/${encodeURIComponent(exceptionReturnTask.code)}/start`,
      { method: 'POST' },
    );
    const completedExceptionReturn = await ok(
      baseUrl,
      `/warehouse/after-sales-tasks/${encodeURIComponent(exceptionReturnTask.code)}/complete`,
      {
        method: 'POST',
        body: { evidence: '仓库异常暂存退回单 RET-SMOKE-001' },
      },
    );
    assert(completedExceptionReturn.task.status === '已完成', 'warehouse exception-hold return task was not completed');
    const exceptionReceiptAfterReturn = await ok(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(sourceReceiptTask.code)}`,
    );
    assert(
      exceptionReceiptAfterReturn.receipt.status === '已拒收'
        && exceptionReceiptAfterReturn.receipt.stockStage === 'exception_returned',
      'fully returned exception-only receipt did not close as rejected',
    );
    const inventoryAfterExceptionReturn = await ok(baseUrl, '/warehouse/inventory');
    const returnedExceptionInventory = inventoryRow(
      inventoryAfterExceptionReturn.items,
      exceptionDraft.receipt.products[0].materialCode,
      exceptionDraft.receipt.warehouseCode,
    );
    assert(qty(returnedExceptionInventory, 'exceptionHoldNumber', 'exceptionHold') === 0, 'returned exception stock remained in exception hold');
    assert(
      qty(returnedExceptionInventory, 'onHandNumber', 'onHand') === replacementPlannedQty,
      'exception return removed or duplicated the separately received replacement stock',
    );

    const sourceIssue = await ok(baseUrl, '/warehouse/sales-issues/WS-20260717-006');
    assert(sourceIssue.issue.address, 'sales picking task did not retain its delivery address');
    const skippedReviewPost = await request(baseUrl, '/warehouse/sales-issues/WS-20260717-006/post', { method: 'POST' });
    assert(skippedReviewPost.response.status === 400, 'sales issue was posted directly from picking without review');
    const retiredSalesIssueSave = await request(baseUrl, '/warehouse/sales-issues/WS-20260717-006', {
      method: 'PUT',
      body: {
        ...sourceIssue.issue,
        note: '专项回归：补充拣货记录。',
        attachments: [{ name: 'picking-list.pdf', size: '16 KB', uploader: '王倩', date: '2026-07-22' }],
      },
    });
    assert(retiredSalesIssueSave.response.status === 405, 'retired sales issue ordinary save endpoint remained writable');
    const retiredSalesIssueCreate = await request(baseUrl, '/warehouse/sales-issues', {
      method: 'POST',
      body: {
        ...sourceIssue.issue,
        code: '系统自动生成',
      },
    });
    assert(retiredSalesIssueCreate.response.status === 405, 'warehouse still allowed manual sales issue task creation');
    const retiredSalesIssueStatusSubmit = await request(baseUrl, '/warehouse/sales-issues/WS-20260717-006/status', {
      method: 'POST',
      body: { status: '待复核', action: '绕过登记拣货' },
    });
    assert(retiredSalesIssueStatusSubmit.response.status === 409, 'generic status endpoint bypassed atomic sales picking submission');

    const partialPickingInventory = await ok(baseUrl, '/warehouse/inventory');
    const selectedPickingProduct = sourceIssue.issue.products[0];
    const selectedPickingQuantity = qty({ display: selectedPickingProduct.qty }, 'number', 'display');
    const partialPickingProducts = [{
      ...selectedPickingProduct,
      allocations: salesIssuePickingAllocations(
        partialPickingInventory.items,
        sourceIssue.issue,
        selectedPickingProduct,
        selectedPickingQuantity,
      ),
    }];
    const invalidLinePicking = await request(baseUrl, '/warehouse/sales-issues/WS-20260717-006/picking-result', {
      method: 'POST',
      body: {
        idempotencyKey: 'WS-20260717-006-invalid-line',
        date: sourceIssue.issue.date || '2026-07-30',
        products: [{ ...partialPickingProducts[0], sourceLineId: 'NO-SUCH-LINE' }],
      },
    });
    assert(invalidLinePicking.response.status === 400, 'sales picking accepted a product outside the frozen task lines');
    await ok(baseUrl, '/warehouse/sales-issues/WS-20260717-006/picking-result', {
      method: 'POST',
      body: {
        idempotencyKey: 'WS-20260717-006-picking-1',
        date: sourceIssue.issue.date || '2026-07-30',
        products: partialPickingProducts,
        note: '专项回归：补充拣货记录。',
        attachments: [{ name: 'picking-list.pdf', size: '16 KB', uploader: '王倩', date: '2026-07-22' }],
      },
    });
    const reviewIssue = await ok(baseUrl, '/warehouse/sales-issues/WS-20260717-006');
    assert(reviewIssue.issue.attachments?.[0]?.name === 'picking-list.pdf', 'atomic picking command did not persist its attachment');
    assert(
      reviewIssue.issue.products.length === 2
        && qty({ display: reviewIssue.issue.products[1].qty }, 'number', 'display') === 0,
      'sales picking did not preserve the deferred material in the current task progress snapshot',
    );
    const reviewedWarehouseCode = reviewIssue.issue.products
      .flatMap((product) => product.allocations || [])
      .find((allocation) => qty({ display: allocation.qty }, 'number', 'display') > 0)?.warehouseCode;
    const dataBeforeWarehouseDisable = JSON.parse(await readFile(dataFile, 'utf8'));
    const reviewedWarehouse = dataBeforeWarehouseDisable.masterData.warehouses
      .find((warehouse) => warehouse.code === reviewedWarehouseCode);
    assert(reviewedWarehouse, 'reviewed sales allocation warehouse was not found in master data');
    reviewedWarehouse.status = '停用';
    await writeFile(dataFile, JSON.stringify(dataBeforeWarehouseDisable, null, 2), 'utf8');
    const disabledWarehousePost = await request(baseUrl, '/warehouse/sales-issues/WS-20260717-006/post', { method: 'POST' });
    assert(disabledWarehousePost.response.status === 409, 'sales issue post did not revalidate warehouse eligibility after review');
    reviewedWarehouse.status = '启用';
    await writeFile(dataFile, JSON.stringify(dataBeforeWarehouseDisable, null, 2), 'utf8');
    const tamperedReviewIssue = await request(baseUrl, '/warehouse/sales-issues/WS-20260717-006', {
      method: 'PUT',
      body: {
        ...reviewIssue.issue,
        products: reviewIssue.issue.products.map((line, index) => index === 0 ? { ...line, qty: '239 卷' } : line),
      },
    });
    assert(tamperedReviewIssue.response.status === 405, 'sales issue ordinary save reopened after review submission');
    const returnedIssue = await ok(baseUrl, '/warehouse/sales-issues/WS-20260717-006/status', {
      method: 'POST',
      body: { status: '待拣货', action: '退回拣货', remark: '专项回归：复核退回重新拣货。' },
    });
    assert(returnedIssue.record.status === '待拣货', 'sales issue review could not return to picking');
    await ok(baseUrl, '/warehouse/sales-issues/WS-20260717-006/picking-result', {
      method: 'POST',
      body: {
        idempotencyKey: 'WS-20260717-006-picking-2',
        date: reviewIssue.issue.date || '2026-07-30',
        products: reviewIssue.issue.products.filter((product) => qty({ display: product.qty }, 'number', 'display') > 0),
        note: reviewIssue.issue.note,
        attachments: reviewIssue.issue.attachments,
      },
    });
    const fullyReservedPostingData = JSON.parse(await readFile(dataFile, 'utf8'));
    const reviewedAllocation = reviewIssue.issue.products
      .flatMap((product) => product.allocations || [])
      .find((allocation) => qty({ display: allocation.qty }, 'number', 'display') > 0);
    const fullyReservedRow = fullyReservedPostingData.warehouse.inventory
      .find((row) => row.key === reviewedAllocation?.inventoryKey);
    assert(fullyReservedRow, 'fully reserved sales posting regression row is missing');
    const fullyReservedQty = qty({ display: reviewedAllocation.qty }, 'number', 'display');
    const currentIssueReservationQty = (fullyReservedRow.reservationSources || [])
      .filter((source) => (
        source.sourceDoc === reviewIssue.issue.sourceOrder
        && !['已释放', '已作废', '已消耗'].includes(source.status)
      ))
      .reduce((sum, source) => sum + qty(source, 'quantityNumber', 'qty'), 0);
    assert(
      fullyReservedQty === currentIssueReservationQty,
      'fully reserved sales posting regression fixture does not match the reviewed allocation',
    );
    fullyReservedRow.onHandNumber = fullyReservedQty;
    fullyReservedRow.qualifiedOnHandNumber = fullyReservedQty;
    fullyReservedRow.reservedNumber = fullyReservedQty;
    fullyReservedRow.lockedNumber = fullyReservedQty;
    fullyReservedRow.availableNumber = 0;
    fullyReservedRow.onHand = `${fullyReservedQty} 卷`;
    fullyReservedRow.qualifiedOnHand = `${fullyReservedQty} 卷`;
    fullyReservedRow.reserved = `${fullyReservedQty} 卷`;
    fullyReservedRow.locked = `${fullyReservedQty} 卷`;
    fullyReservedRow.available = '0 卷';
    reservedOnHandBefore = fullyReservedQty;
    await writeFile(dataFile, JSON.stringify(fullyReservedPostingData, null, 2), 'utf8');
    const postedSalesIssue = await ok(baseUrl, '/warehouse/sales-issues/WS-20260717-006/post', { method: 'POST' });
    assert(
      postedSalesIssue.issue.products.length === 2
        && qty({ display: postedSalesIssue.issue.products[1].qty }, 'number', 'display') === 0,
      `posted sales issue dropped the deferred material from the original task progress: ${JSON.stringify(postedSalesIssue.issue.products.map((product) => ({ materialCode: product.materialCode, qty: product.qty, taskQty: product.taskQty })))}`,
    );
    const salesIssuesAfterPartialPost = await ok(baseUrl, '/warehouse/sales-issues');
    const deferredMaterialTask = salesIssuesAfterPartialPost.items.find((item) => (
      item.sourceDoc === postedSalesIssue.issue.sourceDoc
      && item.status === '待拣货'
      && item.code !== postedSalesIssue.issue.code
    ));
    assert(
      deferredMaterialTask?.products?.length === 1
        && deferredMaterialTask.products[0].materialCode === sourceIssue.issue.products[1].materialCode
        && qty({ display: deferredMaterialTask.products[0].qty }, 'number', 'display') === 120,
      'deferred sales material did not generate a clean follow-up warehouse task',
    );
    assert(
      postedSalesIssue.issue.owner === reviewIssue.issue.owner,
      'sales issue posting overwrote the assigned owner with the execution actor',
    );
    assert(postedSalesIssue.issue.postedBy === '张三', 'sales issue posting did not record the authenticated warehouse operator');
    assert(
      postedSalesIssue.stockLedger
        .filter((row) => row.sourceDoc === 'WS-20260717-006')
        .every((row) => row.operator === '张三'),
      'sales issue ledger did not retain the authenticated operator',
    );
    const reviewedAllocationKeys = new Set(
      reviewIssue.issue.products
        .flatMap((product) => product.allocations || [])
        .map((allocation) => allocation.inventoryKey),
    );
    assert(
      postedSalesIssue.stockLedger
        .filter((row) => row.sourceDoc === 'WS-20260717-006')
        .every((row) => reviewedAllocationKeys.has(row.inventoryKey)),
      'posted sales issue ignored reviewed picking allocations',
    );
    const salesPostedNotifications = await ok(baseUrl, '/notifications?limit=100', { account: 'ACC-SALES' });
    assert(
      salesPostedNotifications.items.some((row) => (
        row.action === '库存过账'
        && row.sourceDoc === postedSalesIssue.issue.sourceOrder
        && row.sourcePath === `/sales/orders/${encodeURIComponent(postedSalesIssue.issue.sourceOrder)}/delivery`
      )),
      'sales outbound notification did not return sales to the source-order delivery page',
    );
    const afterSales = await ok(baseUrl, '/warehouse/inventory');
    const rawInventoryAfterSales = JSON.parse(await readFile(dataFile, 'utf8')).warehouse.inventory;
    const reservedRowAfter = inventoryRow(afterSales.items, 'M-FG-PLA-175-WHT', 'WH-FG')
      || inventoryRow(rawInventoryAfterSales, 'M-FG-PLA-175-WHT', 'WH-FG');
    assert(reservedRowAfter, 'posted fully reserved inventory row is missing from persisted facts');
    assert(qty(reservedRowAfter, 'onHandNumber', 'onHand') === reservedOnHandBefore - 240, 'sales issue did not reduce on-hand stock');
    assert(qty(reservedRowAfter, 'reservedNumber', 'reserved') === 0, 'sales issue did not consume its reservation');
    assert(reservedRowAfter.reservationSources.some((source) => source.sourceDoc === 'SO-20260617-021' && source.status === '已消耗'), 'consumed reservation evidence is missing');

    const transferInventoryBefore = await ok(baseUrl, '/warehouse/inventory');
    const sourceBag = inventoryRow(transferInventoryBefore.items, 'M-PKG-VAC-BAG-1KG', 'WH-PKG');
    assert(sourceBag, 'transfer source inventory is missing');
    const transferTargetLocation = 'FG-01';
    const targetBagBefore = inventoryRow(
      transferInventoryBefore.items,
      'M-PKG-VAC-BAG-1KG',
      'WH-FG',
      sourceBag.batch,
      transferTargetLocation,
    );
    const sourceBagOnHand = qty(sourceBag, 'onHandNumber', 'onHand');
    const targetBagOnHand = qty(targetBagBefore, 'onHandNumber', 'onHand');
    const targetBagInTransit = qty(targetBagBefore, 'inTransitNumber', 'inTransit');
    const invalidTransferLocation = await request(baseUrl, '/warehouse/transfers', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        products: [{ materialCode: sourceBag.materialCode, name: sourceBag.item, qty: '1', batch: sourceBag.batch, uom: '个' }],
        fromWarehouseCode: 'WH-PKG',
        fromWarehouse: '包材仓',
        toWarehouseCode: 'WH-FG',
        toWarehouse: '成品仓',
        toLocation: 'FG-NOT-EXISTS',
        owner: '吴磊',
        date: '2026-07-17',
        reason: '验证调入库位',
      },
    });
    assert(invalidTransferLocation.response.status === 400, 'transfer accepted a target location outside the destination warehouse');
    const placeholderTransferLocation = await request(baseUrl, '/warehouse/transfers', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        products: [{ materialCode: sourceBag.materialCode, name: sourceBag.item, qty: '1', batch: sourceBag.batch, uom: '个' }],
        fromWarehouseCode: 'WH-PKG',
        fromWarehouse: '包材仓',
        toWarehouseCode: 'WH-FG',
        toWarehouse: '成品仓',
        toLocation: 'FG-AUTO',
        owner: '吴磊',
        date: '2026-07-17',
        reason: '验证占位库位门禁',
      },
    });
    assert(
      placeholderTransferLocation.response.status === 400
      && String(placeholderTransferLocation.payload.error || '').includes('占位库位'),
      'transfer accepted or ambiguously rejected a technical placeholder location',
    );
    const transferWithoutLocation = await ok(baseUrl, '/warehouse/transfers', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        products: [{ materialCode: sourceBag.materialCode, name: sourceBag.item, qty: '1', batch: sourceBag.batch, uom: '个' }],
        fromWarehouseCode: 'WH-PKG',
        fromWarehouse: '包材仓',
        toWarehouseCode: 'WH-FG',
        toWarehouse: '成品仓',
        date: '2026-07-17',
        reason: '验证多库位仓不得默认首个库位',
      },
    });
    assert(!transferWithoutLocation.transfer.toLocation, 'multi-location transfer silently selected the first target location');
    assert(transferWithoutLocation.transfer.owner === '张三', 'transfer without an assigned owner did not default to the authenticated creator');
    const missingTransferLocationSubmit = await request(
      baseUrl,
      `/warehouse/transfers/${encodeURIComponent(transferWithoutLocation.transfer.code)}/submit`,
      { method: 'POST' },
    );
    assert(missingTransferLocationSubmit.response.status === 400, 'transfer without an explicit target location was submitted');
    const cancelledIncompleteTransfer = await ok(
      baseUrl,
      `/warehouse/transfers/${encodeURIComponent(transferWithoutLocation.transfer.code)}/cancel`,
      { method: 'POST', body: { reason: '测试数据缺少目标库位，取消后重建', actor: '伪造取消人' } },
    );
    assert(cancelledIncompleteTransfer.transfer.status === '已取消', 'incomplete draft transfer could not be cancelled safely');
    assert(cancelledIncompleteTransfer.transfer.cancelledBy === '张三', 'transfer cancellation trusted a client-supplied actor');
    assert(cancelledIncompleteTransfer.transfer.cancellationReason.includes('取消后重建'), 'transfer cancellation reason was not retained');
    const transferWithUnknownBatch = await ok(baseUrl, '/warehouse/transfers', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        products: [{ materialCode: sourceBag.materialCode, name: sourceBag.item, qty: '1', batch: 'BATCH-NOT-AVAILABLE', uom: '个' }],
        fromWarehouseCode: 'WH-PKG',
        fromWarehouse: '包材仓',
        toWarehouseCode: 'WH-FG',
        toWarehouse: '成品仓',
        toLocation: transferTargetLocation,
        owner: '吴磊',
        date: '2026-07-17',
        reason: '验证调出批次门禁',
      },
    });
    const unknownBatchSubmit = await request(
      baseUrl,
      `/warehouse/transfers/${encodeURIComponent(transferWithUnknownBatch.transfer.code)}/submit`,
      { method: 'POST' },
    );
    assert(
      unknownBatchSubmit.response.status === 400
      && String(unknownBatchSubmit.payload.error || '').includes('没有可用库存'),
      'transfer submitted a freely entered batch without source inventory',
    );
    const transferToCancel = await ok(baseUrl, '/warehouse/transfers', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        products: [{ materialCode: sourceBag.materialCode, name: sourceBag.item, qty: '2', batch: sourceBag.batch, uom: '个' }],
        fromWarehouseCode: 'WH-PKG',
        fromWarehouse: '包材仓',
        toWarehouseCode: 'WH-FG',
        toWarehouse: '成品仓',
        toLocation: transferTargetLocation,
        owner: '吴磊',
        date: '2026-07-17',
        reason: '验证调出前取消',
      },
    });
    await ok(baseUrl, `/warehouse/transfers/${encodeURIComponent(transferToCancel.transfer.code)}/submit`, { method: 'POST' });
    const cancelledTransfer = await ok(
      baseUrl,
      `/warehouse/transfers/${encodeURIComponent(transferToCancel.transfer.code)}/cancel`,
      { method: 'POST', body: { reason: '业务需求撤回' } },
    );
    assert(cancelledTransfer.transfer.status === '已取消', 'submitted transfer did not enter the cancelled terminal state');
    const cancelledTransferPost = await request(
      baseUrl,
      `/warehouse/transfers/${encodeURIComponent(transferToCancel.transfer.code)}/post`,
      { method: 'POST' },
    );
    assert(
      !cancelledTransferPost.response.ok
      && String(cancelledTransferPost.payload.error || '').includes('当前状态为已取消'),
      'cancelled transfer could still be posted',
    );
    const inventoryAfterTransferCancel = await ok(baseUrl, '/warehouse/inventory');
    const sourceAfterTransferCancel = inventoryRow(inventoryAfterTransferCancel.items, sourceBag.materialCode, 'WH-PKG', sourceBag.batch);
    assert(qty(sourceAfterTransferCancel, 'onHandNumber', 'onHand') === sourceBagOnHand, 'pre-dispatch transfer cancellation changed source inventory');
    const transferCreated = await ok(baseUrl, '/warehouse/transfers', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        products: [{ materialCode: sourceBag.materialCode, name: sourceBag.item, qty: '10', batch: sourceBag.batch, uom: '个' }],
        fromWarehouseCode: 'WH-PKG',
        fromWarehouse: '包材仓',
        toWarehouseCode: 'WH-FG',
        toWarehouse: '成品仓',
        toLocation: transferTargetLocation,
        owner: '吴磊',
        date: '2026-07-17',
        reason: '仓库专项回归',
        note: '',
      },
    });
    assert(transferCreated.transfer.toLocation === transferTargetLocation, 'transfer did not preserve the selected target location');
    const transferCode = transferCreated.transfer.code;
    await ok(baseUrl, `/warehouse/transfers/${encodeURIComponent(transferCode)}/submit`, { method: 'POST' });
    const lockedTransferEdit = await request(baseUrl, `/warehouse/transfers/${encodeURIComponent(transferCode)}`, {
      method: 'PUT',
      body: { ...transferCreated.transfer, reason: '不应允许提交后改写' },
    });
    assert(!lockedTransferEdit.response.ok, 'submitted transfer still allowed direct content edits');
    const dispatched = await ok(baseUrl, `/warehouse/transfers/${encodeURIComponent(transferCode)}/status`, {
      method: 'POST',
      body: {
        status: '调拨中',
        action: '确认调出',
        remark: '专项回归：确认调出。',
        actor: '伪造调拨操作人',
      },
    });
    assert(dispatched.record.transitLines.length > 0, 'transfer did not create transit lines');
    assert(dispatched.record.dispatchedBy === '张三', 'transfer dispatch trusted a client-supplied actor');
    const invalidInTransitTermination = await request(baseUrl, `/warehouse/transfers/${encodeURIComponent(transferCode)}/status`, {
      method: 'POST',
      body: { status: '已作废', action: '直接作废', remark: '不应允许跳过在途结算' },
    });
    assert(
      invalidInTransitTermination.response.status === 409
      && String(invalidInTransitTermination.payload.error || '').includes('不能用通用状态接口终止'),
      'in-transit transfer could be terminated without settling transit inventory',
    );
    const transferInventoryMid = await ok(baseUrl, '/warehouse/inventory');
    const sourceBagMid = inventoryRow(transferInventoryMid.items, sourceBag.materialCode, 'WH-PKG', sourceBag.batch);
    const targetBagMid = inventoryRow(
      transferInventoryMid.items,
      sourceBag.materialCode,
      'WH-FG',
      sourceBag.batch,
      transferTargetLocation,
    );
    assert(qty(sourceBagMid, 'onHandNumber', 'onHand') === sourceBagOnHand - 10, 'transfer dispatch did not reduce source stock');
    assert(
      qty(targetBagMid, 'inTransitNumber', 'inTransit') === targetBagInTransit + 10,
      `transfer dispatch did not create in-transit stock at ${transferTargetLocation}: ${JSON.stringify(
        transferInventoryMid.items.filter((row) => (
          row.materialCode === sourceBag.materialCode
          && row.warehouseCode === 'WH-FG'
          && row.batch === sourceBag.batch
        )).map((row) => ({
          key: row.key,
          location: row.location,
          inTransitNumber: row.inTransitNumber,
          inTransit: row.inTransit,
        })),
      )}`,
    );
    assert(qty(targetBagMid, 'onHandNumber', 'onHand') === targetBagOnHand, 'transfer dispatch increased target stock too early');
    assert(targetBagMid.transitSources.some((source) => source.sourceDoc === transferCode && source.status === '调拨中' && source.path), 'transfer occupation source is missing');
    const completedTransfer = await ok(baseUrl, `/warehouse/transfers/${encodeURIComponent(transferCode)}/post`, {
      method: 'POST',
      body: { actor: '伪造调入操作人' },
    });
    assert(completedTransfer.transfer.receivedBy === '张三', 'transfer receipt trusted a client-supplied actor');
    const transferInventoryAfter = await ok(baseUrl, '/warehouse/inventory');
    const targetBagAfter = inventoryRow(
      transferInventoryAfter.items,
      sourceBag.materialCode,
      'WH-FG',
      sourceBag.batch,
      transferTargetLocation,
    );
    assert(qty(targetBagAfter, 'inTransitNumber', 'inTransit') === targetBagInTransit, 'transfer receipt did not clear this transfer in-transit stock');
    assert(qty(targetBagAfter, 'onHandNumber', 'onHand') === targetBagOnHand + 10, 'transfer receipt did not increase target stock');
    assert(targetBagAfter.transitSources.some((source) => source.sourceDoc === transferCode && source.status === '已入库' && qty(source, 'quantityNumber', 'qty') === 0), 'completed transfer occupation was not released');

    const invalidStocktakeWarehouse = await request(baseUrl, '/warehouse/stocktakes', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        warehouseCode: 'WH-NOT-EXISTS',
        warehouse: '伪造仓库',
        scopeMode: '全仓盘点',
        owner: '吴磊',
        plannedCount: 999,
        checkedCount: 999,
        differenceCount: 999,
      },
    });
    assert(invalidStocktakeWarehouse.response.status === 400, 'stocktake accepted a nonexistent warehouse');

    const invalidStocktakeOwner = await request(baseUrl, '/warehouse/stocktakes', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        warehouseCode: 'WH-FG',
        scopeMode: '按物料',
        scope: sourceBag.materialCode,
        ownerEmployeeCode: 'EMP-ZN',
        owner: '周宁',
      },
    });
    assert(invalidStocktakeOwner.response.status === 400, 'stocktake accepted an employee without the warehouse role as owner');

    const stocktakeCreated = await ok(baseUrl, '/warehouse/stocktakes', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        warehouseCode: 'WH-FG',
        warehouse: '伪造成品仓名称',
        scopeMode: '按物料',
        scope: sourceBag.materialCode,
        scopeLabel: sourceBag.item,
        ownerEmployeeCode: 'EMP-WQ',
        owner: '王倩',
        date: '2026-07-17',
        note: '',
        plannedCount: 999,
        checkedCount: 999,
        differenceCount: 999,
        lines: [{ inventoryKey: 'forged-client-line', item: '伪造库存', bookQty: 999, countedQty: 999 }],
      },
    });
    const stocktakeCode = stocktakeCreated.stocktake.code;
    assert(stocktakeCreated.stocktake.warehouse === '成品仓', 'stocktake warehouse was not canonicalized from master data');
    assert(stocktakeCreated.stocktake.scopeMode === '按物料', 'stocktake did not preserve its structured scope mode');
    assert(stocktakeCreated.stocktake.plannedCount === 0 && stocktakeCreated.stocktake.checkedCount === 0 && stocktakeCreated.stocktake.differenceCount === 0, 'stocktake accepted forged progress metrics');
    assert(stocktakeCreated.stocktake.lines.length === 0, 'new stocktake accepted client-supplied snapshot lines');
    const started = await ok(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}/start`, { method: 'POST' });
    assert(started.stocktake.startedAt, 'stocktake start milestone was not recorded');
    assert(started.stocktake.lines.length > 0, 'stocktake did not capture inventory snapshot lines');
    assert(started.stocktake.lines.every((line) => line.materialCode === sourceBag.materialCode), 'stocktake snapshot ignored its material scope');
    const overlappingStocktake = await ok(baseUrl, '/warehouse/stocktakes', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        warehouseCode: 'WH-FG',
        warehouse: '成品仓',
        scopeMode: '按物料',
        scope: sourceBag.materialCode,
        scopeLabel: sourceBag.item,
        ownerEmployeeCode: 'EMP-WQ',
        owner: '王倩',
        date: '2026-07-17',
        note: '不应重复冻结同一库存。',
      },
    });
    const overlappingStart = await request(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(overlappingStocktake.stocktake.code)}/start`, { method: 'POST' });
    assert(overlappingStart.response.status === 409, 'overlapping stocktake was allowed to freeze the same inventory');

    const blockedInboundMove = await ok(baseUrl, '/warehouse/other-moves', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        moveType: '借用归还',
        direction: '入库',
        products: [{ materialCode: sourceBag.materialCode, name: sourceBag.item, qty: '1', batch: sourceBag.batch, uom: sourceBag.uom || '个' }],
        warehouseCode: 'WH-FG',
        warehouse: '成品仓',
        location: started.stocktake.lines[0].location,
        targetWarehouse: '外部归还',
        owner: '吴磊',
        date: '2026-07-17',
        reason: '验证盘点范围内禁止库存变动',
      },
    });
    await ok(baseUrl, `/warehouse/other-moves/${encodeURIComponent(blockedInboundMove.move.code)}/status`, {
      method: 'POST',
      body: { status: '待审核', action: '提交', remark: '专项回归：提交盘点范围内入库。' },
    });
    await ok(baseUrl, `/warehouse/other-moves/${encodeURIComponent(blockedInboundMove.move.code)}/submit`, { method: 'POST' });
    const blockedInboundPost = await request(baseUrl, `/warehouse/other-moves/${encodeURIComponent(blockedInboundMove.move.code)}/post`, { method: 'POST' });
    assert(blockedInboundPost.response.status === 409, 'inbound mutation bypassed an active stocktake scope');

    const partialCount = await ok(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}`, {
      method: 'PUT',
      body: {
        ...started.stocktake,
        lines: [
          { ...started.stocktake.lines[0], countedQty: Number(started.stocktake.lines[0].bookQty) },
          { inventoryKey: 'forged-client-line', item: '伪造库存', countedQty: 888 },
        ],
      },
    });
    assert(partialCount.stocktake.lines.length === started.stocktake.lines.length, 'counting update deleted frozen snapshot lines');
    assert(!partialCount.stocktake.lines.some((line) => line.inventoryKey === 'forged-client-line'), 'counting update inserted a forged snapshot line');
    assert(partialCount.stocktake.checkedCount === 1, 'partial stocktake progress was not derived from preserved snapshot lines');
    const negativeCount = await request(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}`, {
      method: 'PUT',
      body: {
        ...partialCount.stocktake,
        lines: partialCount.stocktake.lines.map((line, index) => ({ ...line, countedQty: index === 0 ? -1 : line.countedQty })),
      },
    });
    assert(negativeCount.response.status === 400, 'stocktake accepted a negative counted quantity');

    const countedLines = started.stocktake.lines.map((line, index) => ({
      ...line,
      countedQty: index === 0 ? Math.max(0, Number(line.bookQty) - 1) : Number(line.bookQty),
    }));
    const counted = await ok(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}`, {
      method: 'PUT',
      body: { ...started.stocktake, warehouseCode: 'WH-RM', warehouse: '原料仓', scope: '全仓盘点', owner: '伪造负责人', lines: countedLines },
    });
    assert(counted.stocktake.warehouseCode === 'WH-FG' && counted.stocktake.scope === sourceBag.materialCode && counted.stocktake.owner === '王倩' && counted.stocktake.ownerEmployeeCode === 'EMP-WQ', 'counting update changed the frozen stocktake header');
    assert(counted.stocktake.checkedCount === countedLines.length, 'stocktake checked count is not derived from lines');
    assert(counted.stocktake.differenceCount === 1, 'stocktake difference count is not derived from lines');
    const submitted = await ok(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}/submit`, { method: 'POST' });
    assert(submitted.stocktake.status === '待复核' && submitted.stocktake.submittedAt, 'stocktake submit milestone was not recorded');
    const emptyReviewReturn = await request(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}/return`, {
      method: 'POST',
      body: { reason: '', actor: '仓库主管' },
    });
    assert(emptyReviewReturn.response.status === 400, 'stocktake review return accepted an empty reason');
    const returned = await ok(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}/return`, {
      method: 'POST',
      body: { reason: '专项回归：复核要求重新确认第一行数量', actor: '伪造盘点复核人' },
    });
    assert(returned.stocktake.status === '盘点中' && returned.stocktake.reviewReturnedAt && returned.stocktake.reviewReturnReason, 'stocktake review return did not preserve its reason and milestone');
    assert(returned.stocktake.reviewReturnedBy === '张三', 'stocktake review return trusted a client-supplied actor');
    const resubmitted = await ok(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}/submit`, { method: 'POST' });
    assert(resubmitted.stocktake.status === '待复核', 'returned stocktake could not be resubmitted for review');
    const completed = await ok(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}/complete`, { method: 'POST' });
    assert(completed.stocktake.status === '已完成' && completed.stocktake.completedAt, 'stocktake completion milestone was not recorded');
    assert(completed.stocktake.completedBy === '张三', 'stocktake completion did not record the authenticated operator');
    const ledger = await ok(baseUrl, '/warehouse/stock-ledger');
    assert(ledger.items.some((row) => row.sourceDoc === stocktakeCode && row.reason === '盘亏'), 'stocktake difference was not posted to the stock ledger');
    assert(
      ledger.items
        .filter((row) => [transferCode, stocktakeCode].includes(row.sourceDoc))
        .every((row) => row.operator === '张三'),
      'warehouse transfer or stocktake ledger trusted an assigned owner instead of the authenticated operator',
    );
    assert(ledger.items.filter((row) => [transferCode, stocktakeCode, 'WS-20260717-006'].includes(row.sourceDoc)).every((row) => row.beforeBalance && row.afterBalance && row.documentLineId), 'warehouse ledger is missing before/after balance or document-line evidence');

    const cancellableStocktake = await ok(baseUrl, '/warehouse/stocktakes', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        warehouseCode: 'WH-FG',
        scopeMode: '按库位',
        scope: targetBagAfter.location,
        ownerEmployeeCode: 'EMP-WQ',
        owner: '王倩',
        date: '2026-07-17',
      },
    });
    const cancellableStarted = await ok(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(cancellableStocktake.stocktake.code)}/start`, { method: 'POST' });
    const inventoryDuringCancellationTest = await ok(baseUrl, '/warehouse/inventory');
    const cancellationTargetDuring = inventoryRow(
      inventoryDuringCancellationTest.items,
      sourceBag.materialCode,
      'WH-FG',
      sourceBag.batch,
      targetBagAfter.location,
    );
    assert(qty(cancellationTargetDuring, 'frozenNumber', 'frozen') > 0, 'started stocktake did not create a cancellable freeze');
    const cancelled = await ok(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(cancellableStarted.stocktake.code)}/cancel`, {
      method: 'POST',
      body: { reason: '专项回归：盘点范围选择错误', actor: '伪造盘点取消人' },
    });
    assert(cancelled.stocktake.status === '已取消' && cancelled.stocktake.cancelledAt && cancelled.stocktake.cancellationReason, 'stocktake cancellation did not preserve its reason and milestone');
    assert(cancelled.stocktake.cancelledBy === '张三', 'stocktake cancellation trusted a client-supplied actor');
    const inventoryAfterCancellation = await ok(baseUrl, '/warehouse/inventory');
    const cancellationTargetAfter = inventoryRow(
      inventoryAfterCancellation.items,
      sourceBag.materialCode,
      'WH-FG',
      sourceBag.batch,
      targetBagAfter.location,
    );
    assert(qty(cancellationTargetAfter, 'frozenNumber', 'frozen') === 0, 'stocktake cancellation did not release the inventory freeze');

    const stocktakeReversalKey = `warehouse-smoke-stocktake-reversal-${stocktakeCode}`;
    const reversedStocktake = await ok(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}/reverse`, {
      method: 'POST',
      body: { reason: '专项回归：盘点结果录入错误', actor: '仓库主管', idempotencyKey: stocktakeReversalKey },
    });
    assert(reversedStocktake.record.status === '已完成', 'stocktake reversal overwrote the original lifecycle status');
    assert(reversedStocktake.record.reversalStatus === '已冲销' && reversedStocktake.record.reversalCode === reversedStocktake.reversal.code, 'stocktake reversal fact was not linked to its source');
    const stocktakeReversalRetry = await ok(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}/reverse`, {
      method: 'POST',
      body: { reason: '专项回归：盘点结果录入错误', actor: '仓库主管', idempotencyKey: stocktakeReversalKey },
    });
    assert(stocktakeReversalRetry.repeated === true && stocktakeReversalRetry.reversal.code === reversedStocktake.reversal.code, 'stocktake reversal retry was not idempotent');
    const duplicateStocktakeReversal = await request(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}/reverse`, {
      method: 'POST',
      body: { reason: '不应再次冲销', actor: '仓库主管', idempotencyKey: `${stocktakeReversalKey}-new` },
    });
    assert(duplicateStocktakeReversal.response.status === 409, 'stocktake accepted a second reversal fact');

    const transferReversalKey = `warehouse-smoke-transfer-reversal-${transferCode}`;
    const reversedTransfer = await ok(baseUrl, `/warehouse/transfers/${encodeURIComponent(transferCode)}/reverse`, {
      method: 'POST',
      body: { reason: '专项回归：调拨目标仓选择错误', actor: '仓库主管', idempotencyKey: transferReversalKey },
    });
    assert(reversedTransfer.record.status === '已完成' && reversedTransfer.record.reversalStatus === '已冲销', 'transfer reversal overloaded the original main status');
    const transferInventoryReversed = await ok(baseUrl, '/warehouse/inventory');
    const sourceBagReversed = inventoryRow(transferInventoryReversed.items, sourceBag.materialCode, 'WH-PKG', sourceBag.batch);
    const targetBagReversed = inventoryRow(
      transferInventoryReversed.items,
      sourceBag.materialCode,
      'WH-FG',
      sourceBag.batch,
      transferTargetLocation,
    );
    assert(qty(sourceBagReversed, 'onHandNumber', 'onHand') === sourceBagOnHand, 'transfer reversal did not restore source stock');
    assert(qty(targetBagReversed, 'onHandNumber', 'onHand') === targetBagOnHand, 'transfer reversal did not remove target stock');
    const reversalLedger = await ok(baseUrl, '/warehouse/stock-ledger');
    assert(reversalLedger.items.filter((row) => row.sourceDoc === reversedTransfer.reversal.code).length === 2, 'transfer reversal did not create two-sided reverse ledger rows');
    assert(reversalLedger.items.filter((row) => row.sourceDoc === reversedTransfer.reversal.code).every((row) => row.reversalOf === transferCode && row.sourcePath), 'reverse ledger rows are missing source evidence');

    const occupiedInventory = afterSales.items.find((row) => qty(row, 'reservedNumber', 'reserved') > 0);
    assert(occupiedInventory, 'occupied inventory fixture for stocktake guard is missing');
    const occupiedStocktake = await ok(baseUrl, '/warehouse/stocktakes', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        warehouseCode: occupiedInventory.warehouseCode,
        warehouse: occupiedInventory.warehouse,
        scope: occupiedInventory.location,
        ownerEmployeeCode: 'EMP-WQ',
        owner: '王倩',
        date: '2026-07-17',
        note: '验证盘亏不能吞掉销售预留。',
      },
    });
    const occupiedStarted = await ok(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(occupiedStocktake.stocktake.code)}/start`, { method: 'POST' });
    const occupiedCounted = occupiedStarted.stocktake.lines.map((line) => ({
      ...line,
      countedQty: line.materialCode === occupiedInventory.materialCode ? 0 : Number(line.bookQty),
    }));
    await ok(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(occupiedStocktake.stocktake.code)}`, {
      method: 'PUT',
      body: { ...occupiedStarted.stocktake, lines: occupiedCounted },
    });
    await ok(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(occupiedStocktake.stocktake.code)}/submit`, { method: 'POST' });
    const occupiedComplete = await request(baseUrl, `/warehouse/stocktakes/${encodeURIComponent(occupiedStocktake.stocktake.code)}/complete`, { method: 'POST' });
    assert(occupiedComplete.response.status === 409, 'stocktake completion was allowed to reduce qualified stock below reserved quantity');

    const salesReversalKey = 'warehouse-smoke-sales-reversal-WS-20260717-006';
    const reversedSalesIssue = await ok(baseUrl, '/warehouse/sales-issues/WS-20260717-006/reverse', {
      method: 'POST',
      body: { reason: '专项回归：销售出库批次选择错误', actor: '客户端伪造人员', idempotencyKey: salesReversalKey },
    });
    assert(reversedSalesIssue.record.status === '已出库' && reversedSalesIssue.record.reversalStatus === '已冲销', 'sales reversal overwrote the original lifecycle status');
    assert(reversedSalesIssue.reversal.actor === '张三', 'warehouse reversal trusted a client-supplied actor instead of the authenticated operator');
    assert(
      reversedSalesIssue.stockLedger
        .filter((row) => row.sourceDoc === reversedSalesIssue.reversal.code)
        .every((row) => row.operator === '张三'),
      'warehouse reversal ledger did not retain the authenticated operator',
    );
    const salesInventoryReversed = await ok(baseUrl, '/warehouse/inventory');
    const restoredSalesRow = inventoryRow(salesInventoryReversed.items, 'M-FG-PLA-175-WHT', 'WH-FG');
    assert(qty(restoredSalesRow, 'onHandNumber', 'onHand') === reservedOnHandBefore, 'sales reversal did not restore on-hand stock');
    assert(qty(restoredSalesRow, 'reservedNumber', 'reserved') === 240, 'sales reversal did not restore the active order reservation');
    assert(restoredSalesRow.reservationSources.some((source) => source.sourceDoc === 'SO-20260617-021' && source.status === '有效'), 'sales reversal reservation evidence is missing');
    const salesIssuesAfterReversal = await ok(baseUrl, '/warehouse/sales-issues');
    const refreshedDeferredTask = salesIssuesAfterReversal.items.find((item) => (
      item.sourceDoc === reversedSalesIssue.record.sourceDoc
      && item.status === '待拣货'
      && !item.reversalCode
    ));
    assert(
      refreshedDeferredTask?.products?.length === 2,
      'sales reversal did not merge restored quantities into the unstarted follow-up picking task',
    );
    const salesReversalNotifications = await ok(baseUrl, '/notifications?limit=100', { account: 'ACC-SALES' });
    assert(
      salesReversalNotifications.items.some((row) => (
        row.action === '库存冲销'
        && row.sourceDoc === reversedSalesIssue.record.sourceOrder
        && row.sourcePath === `/sales/orders/${encodeURIComponent(reversedSalesIssue.record.sourceOrder)}/delivery`
      )),
      'sales reversal notification did not return sales to the source-order delivery page',
    );

    const invalidMove = await ok(baseUrl, '/warehouse/other-moves', {
      method: 'POST',
      body: { code: '系统自动生成', moveType: '样品出库', direction: '出库', products: [], warehouseCode: 'WH-FG', warehouse: '成品仓', owner: '吴磊', date: '2026-07-17' },
    });
    const invalidSubmit = await request(baseUrl, `/warehouse/other-moves/${encodeURIComponent(invalidMove.move.code)}/status`, {
      method: 'POST',
      body: { status: '待审核', action: '提交', remark: '不完整单据不应通过。' },
    });
    assert(invalidSubmit.response.status === 400, 'incomplete other-move document passed submit validation');

    const invalidTypeMove = await ok(baseUrl, '/warehouse/other-moves', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        moveType: '采购收货',
        direction: '出库',
        products: [{ materialCode: sourceBag.materialCode, name: sourceBag.item, qty: '1', batch: sourceBag.batch, uom: '个' }],
        warehouseCode: 'WH-PKG',
        warehouse: '包材仓',
        owner: '吴磊',
        date: '2026-07-17',
        reason: '不应绕过主流程',
      },
    });
    const invalidTypeSubmit = await request(baseUrl, `/warehouse/other-moves/${encodeURIComponent(invalidTypeMove.move.code)}/status`, {
      method: 'POST',
      body: { status: '待审核', action: '提交', remark: '非法用途不应通过。' },
    });
    assert(invalidTypeSubmit.response.status === 400, 'disallowed other-move type passed submit validation');

    const splitQualityTask = confirmedArrival.qualityTask;
    assert(splitQualityTask?.products?.length === 1, 'QC-required receipt did not expose its incoming quality task');
    const splitQualityLine = splitQualityTask.products[0];
    const splitQualityQty = qty({ display: splitQualityLine.qty }, 'number', 'display');
    const splitRejectedQty = Number((splitQualityQty * 0.3).toFixed(3));
    const splitReinspectionQty = Number((splitRejectedQty / 3).toFixed(3));
    const splitConcessionQty = Number((splitRejectedQty / 3).toFixed(3));
    const splitReturnQty = Number((splitRejectedQty - splitReinspectionQty - splitConcessionQty).toFixed(3));
    const splitInitiallyReleasedQty = Number((splitQualityQty - splitRejectedQty).toFixed(3));
    const splitPostableQty = Number((splitQualityQty - splitReturnQty).toFixed(3));
    const splitInspectionItems = (splitQualityLine.inspectionItems || []).map((item, itemIndex) => ({
      ...item,
      actual: itemIndex === 0
        ? '专项回归：首项指标超出冻结标准'
        : '专项回归：检验结果符合要求',
      result: itemIndex === 0 ? '不合格' : '合格',
      note: itemIndex === 0 ? '拆分验证复检、让步与退供数量闭环' : '',
    }));
    const decidedSplitReceipt = await ok(
      baseUrl,
      `/quality/incoming/${encodeURIComponent(splitQualityTask.code)}/decision`,
      {
        method: 'POST',
        body: {
          sourceDoc: confirmedArrival.receipt.code,
          standardVersionId: splitQualityTask.standardVersionId,
          version: 0,
          idempotencyKey: `${splitQualityTask.code}:warehouse-split:decision`,
          actor: '林珊',
          lines: [{
            receiptLineId: splitQualityLine.lineId,
            materialCode: splitQualityLine.materialCode,
            receivedQty: splitQualityQty,
            acceptedQty: splitInitiallyReleasedQty,
            concessionQty: 0,
            rejectedQty: splitRejectedQty,
            pendingQty: 0,
            sampleQty: `2 ${splitQualityLine.uom}`,
            sampleIssueQty: `1 ${splitQualityLine.uom}`,
            inspectionItems: splitInspectionItems,
            disposition: '隔离并处置',
          }],
        },
      },
    );
    assert(
      decidedSplitReceipt.receipt.status === '待入库'
        && decidedSplitReceipt.receipt.stockStage === 'pending_inbound',
      'mixed incoming-quality decision did not expose its released portion for formal inbound',
    );
    const orderAfterSplitDecision = await ok(
      baseUrl,
      `/purchase/orders/${encodeURIComponent(confirmedArrival.receipt.sourceDoc)}`,
    );
    const splitProgressAfterDecision = orderAfterSplitDecision.order.progressFacts.lines.find((line) => (
      line.lineId === splitQualityLine.sourceLineId
      || line.materialCode === splitQualityLine.materialCode
    ));
    assert(
      Math.abs(Number(splitProgressAfterDecision?.rejectedQty || 0) - splitRejectedQty) < 0.0001,
      'purchase progress did not expose the initial unresolved incoming-quality rejection',
    );

    const splitReinspection = await ok(
      baseUrl,
      `/quality/incoming/${encodeURIComponent(splitQualityTask.code)}/reinspections`,
      {
        method: 'POST',
        body: {
          receiptLineId: splitQualityLine.lineId,
          quantity: splitReinspectionQty,
          reason: '专项回归：复检放行部分隔离数量',
          inspector: '林珊',
          decisionVersion: decidedSplitReceipt.decision.version,
          dispositionVersion: 0,
          idempotencyKey: `${splitQualityTask.code}:warehouse-split:reinspection`,
        },
      },
    );
    const completedSplitReinspection = await ok(
      baseUrl,
      `/quality/incoming/${encodeURIComponent(splitQualityTask.code)}/reinspections/${encodeURIComponent(splitReinspection.task.code)}/decide`,
      {
        method: 'POST',
        body: {
          acceptedQty: splitReinspectionQty,
          rejectedQty: 0,
          inspectionItems: (splitReinspection.task.inspectionItems || []).map((item) => ({
            ...item,
            actual: '专项回归：复检结果符合冻结标准',
            result: '合格',
            note: '',
          })),
          taskRevision: splitReinspection.task.revision,
          idempotencyKey: `${splitReinspection.task.code}:warehouse-split:decision`,
        },
      },
    );
    assert(
      Math.abs(Number(
        completedSplitReinspection.receipt.qualityDispositionQuantities?.[splitQualityLine.lineId]?.reinspectionAcceptedQty || 0,
      ) - splitReinspectionQty) < 0.0001,
      'reinspection release was not recorded against the receipt line',
    );
    const orderAfterSplitReinspection = await ok(
      baseUrl,
      `/purchase/orders/${encodeURIComponent(confirmedArrival.receipt.sourceDoc)}`,
    );
    const splitProgressAfterReinspection = orderAfterSplitReinspection.order.progressFacts.lines.find((line) => (
      line.lineId === splitQualityLine.sourceLineId
      || line.materialCode === splitQualityLine.materialCode
    ));
    assert(
      Math.abs(
        Number(splitProgressAfterReinspection?.rejectedQty || 0)
        - (splitRejectedQty - splitReinspectionQty)
      ) < 0.0001,
      'reinspection release did not reduce unresolved rejected quantity in purchase progress',
    );

    const splitConcession = await ok(
      baseUrl,
      `/quality/incoming/${encodeURIComponent(splitQualityTask.code)}/dispose`,
      {
        method: 'POST',
        body: {
          receiptLineId: splitQualityLine.lineId,
          action: 'approve_concession',
          quantity: splitConcessionQty,
          reason: '专项回归：质量经理批准限定用途让步接收',
          approvedBy: '质量经理',
          decisionVersion: decidedSplitReceipt.decision.version,
          dispositionVersion: 0,
          idempotencyKey: `${splitQualityTask.code}:warehouse-split:concession`,
        },
      },
    );
    assert(splitConcession.disposition.status === '已执行', 'incoming concession was not executed');
    const orderAfterSplitConcession = await ok(
      baseUrl,
      `/purchase/orders/${encodeURIComponent(confirmedArrival.receipt.sourceDoc)}`,
    );
    const splitProgressAfterConcession = orderAfterSplitConcession.order.progressFacts.lines.find((line) => (
      line.lineId === splitQualityLine.sourceLineId
      || line.materialCode === splitQualityLine.materialCode
    ));
    assert(
      Math.abs(Number(splitProgressAfterConcession?.rejectedQty || 0) - splitReturnQty) < 0.0001,
      'concession release did not reduce unresolved rejected quantity in purchase progress',
    );

    const splitReturnDisposition = await ok(
      baseUrl,
      `/quality/incoming/${encodeURIComponent(splitQualityTask.code)}/dispose`,
      {
        method: 'POST',
        body: {
          receiptLineId: splitQualityLine.lineId,
          action: 'return_to_supplier',
          quantity: splitReturnQty,
          reason: '专项回归：剩余不合格数量退回供应商',
          decisionVersion: decidedSplitReceipt.decision.version,
          dispositionVersion: 1,
          idempotencyKey: `${splitQualityTask.code}:warehouse-split:return`,
        },
      },
    );
    assert(
      splitReturnDisposition.returnDocument?.afterSaleCode,
      'incoming supplier return did not create a linked purchase after-sale case',
    );
    const splitReturnAfterSaleCode = splitReturnDisposition.returnDocument.afterSaleCode;
    const splitReturnAfterSale = await ok(
      baseUrl,
      `/purchase/after-sales/${encodeURIComponent(splitReturnAfterSaleCode)}`,
    );
    const plannedSplitReturnAfterSale = await ok(
      baseUrl,
      `/purchase/after-sales/${encodeURIComponent(splitReturnAfterSaleCode)}`,
      {
        method: 'PUT',
        body: {
          ...splitReturnAfterSale.record,
          action: '退货退款',
          goodsDisposition: '退回供应商',
          financialTreatment: '供应商退款',
          amountImpactType: '应付扣减',
          estimatedAmount: 100,
          planNote: '专项回归：仓库从采购暂存区退回不合格实物，采购完成供应商确认。',
        },
      },
    );
    const acceptedSplitReturnAfterSale = await ok(
      baseUrl,
      `/purchase/after-sales/${encodeURIComponent(splitReturnAfterSaleCode)}/advance`,
      {
        method: 'POST',
        body: { revision: plannedSplitReturnAfterSale.record.revision },
      },
    );
    const splitReturnTask = acceptedSplitReturnAfterSale.record.executionTasks.find((task) => (
      task.module === '仓库' && task.kind === '采购退货出库'
    ));
    assert(splitReturnTask?.status === '待处理', 'supplier-return after-sale did not create a warehouse return task');
    const splitReturnInventory = await ok(baseUrl, '/warehouse/inventory');
    const splitReturnProduct = splitReturnTask.products[0];
    const splitReturnAllocations = purchaseReturnAllocations(
      splitReturnInventory.items,
      splitReturnTask,
      splitReturnProduct,
      splitReturnQty,
    );
    await ok(
      baseUrl,
      `/warehouse/after-sales-tasks/${encodeURIComponent(splitReturnTask.code)}/start`,
      { method: 'POST' },
    );
    await ok(
      baseUrl,
      `/warehouse/after-sales-tasks/${encodeURIComponent(splitReturnTask.code)}/complete`,
      {
        method: 'POST',
        body: {
          actualDate: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10),
          allocations: splitReturnAllocations,
          evidence: '专项回归采购退供单 RET-SPLIT-001',
        },
      },
    );
    const orderBeforeSplitReturnClosure = await ok(
      baseUrl,
      `/purchase/orders/${encodeURIComponent(confirmedArrival.receipt.sourceDoc)}`,
    );
    const splitProgressBeforeReturnClosure = orderBeforeSplitReturnClosure.order.progressFacts.lines.find((line) => (
      line.lineId === splitQualityLine.sourceLineId
      || line.materialCode === splitQualityLine.materialCode
    ));
    assert(
      Math.abs(Number(splitProgressBeforeReturnClosure?.rejectedQty || 0) - splitReturnQty) < 0.0001,
      'supplier return was treated as resolved before the purchase after-sale case closed',
    );
    const splitReturnCaseAfterWarehouse = await ok(
      baseUrl,
      `/purchase/after-sales/${encodeURIComponent(splitReturnAfterSaleCode)}`,
    );
    const splitReturnResultSaved = await ok(
      baseUrl,
      `/purchase/after-sales/${encodeURIComponent(splitReturnAfterSaleCode)}`,
      {
        method: 'PUT',
        body: {
          ...splitReturnCaseAfterWarehouse.record,
          processingResult: '不合格实物已退回供应商，退款金额已由采购确认。',
          confirmedAmount: 100,
        },
      },
    );
    const splitReturnWaitingConfirmation = await ok(
      baseUrl,
      `/purchase/after-sales/${encodeURIComponent(splitReturnAfterSaleCode)}/advance`,
      {
        method: 'POST',
        body: { revision: splitReturnResultSaved.record.revision },
      },
    );
    const confirmedSplitReturnAfterSale = await ok(
      baseUrl,
      `/purchase/after-sales/${encodeURIComponent(splitReturnAfterSaleCode)}`,
      {
        method: 'PUT',
        body: {
          ...splitReturnWaitingConfirmation.record,
          confirmationNote: '供应商已确认接收退货并完成商务处理。',
        },
      },
    );
    const closedSplitReturnAfterSale = await ok(
      baseUrl,
      `/purchase/after-sales/${encodeURIComponent(splitReturnAfterSaleCode)}/advance`,
      {
        method: 'POST',
        body: { revision: confirmedSplitReturnAfterSale.record.revision },
      },
    );
    assert(closedSplitReturnAfterSale.record.status === '已关闭', 'supplier-return after-sale did not close');
    const orderAfterSplitReturnClosure = await ok(
      baseUrl,
      `/purchase/orders/${encodeURIComponent(confirmedArrival.receipt.sourceDoc)}`,
    );
    const splitProgressAfterReturnClosure = orderAfterSplitReturnClosure.order.progressFacts.lines.find((line) => (
      line.lineId === splitQualityLine.sourceLineId
      || line.materialCode === splitQualityLine.materialCode
    ));
    assert(
      Number(splitProgressAfterReturnClosure?.rejectedQty || 0) <= 0.0001
        && Number(splitProgressAfterReturnClosure?.returnedQty || 0) + 0.0001 >= splitReturnQty,
      'closed supplier return remained a permanent incoming-quality exception',
    );

    const firstInboundQty = Number((splitPostableQty * 0.4).toFixed(3));
    const secondInboundQty = Number((splitPostableQty - firstInboundQty).toFixed(3));
    const orderBeforeFirstPartialInbound = await ok(
      baseUrl,
      `/purchase/orders/${encodeURIComponent(confirmedArrival.receipt.sourceDoc)}`,
    );
    const inboundProgressBeforeFirstPosting = orderBeforeFirstPartialInbound.order.progressFacts.lines.find((line) => (
      line.lineId === splitQualityLine.sourceLineId
      || line.materialCode === splitQualityLine.materialCode
    ));
    const inboundQtyBeforeFirstPosting = Number(inboundProgressBeforeFirstPosting?.inboundQty || 0);
    const firstPartialInbound = await ok(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(confirmedArrival.receipt.code)}/post`,
      {
        method: 'POST',
        body: {
          idempotencyKey: `${confirmedArrival.receipt.code}:warehouse-split:first`,
          actor: '伪造采购入库人',
          allocations: [{
            receiptLineId: splitQualityLine.lineId,
            quantity: firstInboundQty,
            warehouseCode: 'WH-RM',
            warehouse: '原料仓',
            location: 'RM-01',
          }],
        },
      },
    );
    assert(
      firstPartialInbound.receipt.status === '部分入库'
        && firstPartialInbound.receipt.stockStage === 'pending_inbound',
      'first allocation did not preserve the remaining released quantity as partial inbound',
    );
    assert(firstPartialInbound.receipt.products[0].batch, 'batch-managed material did not generate a batch at first formal inbound');
    assert(firstPartialInbound.posting.postedBy === '张三', 'purchase inbound posting trusted a client-supplied actor');
    const firstPartialInboundDetail = await ok(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(firstPartialInbound.receipt.code)}`,
    );
    const firstPartialInboundAggregate = firstPartialInboundDetail.detailProjection?.aggregateLines?.find((line) => (
      line.materialCode === splitQualityLine.materialCode
    ));
    assert(
      Number(firstPartialInboundAggregate?.postedQty || 0) >= firstInboundQty
        && (
          Number(firstPartialInboundAggregate?.remainingQty || 0) > 0
          || Number(firstPartialInboundAggregate?.qcPendingQty || 0) > 0
          || Number(firstPartialInboundAggregate?.availableQty || 0) > 0
          || Number(firstPartialInboundAggregate?.rejectedQty || 0) > 0
        ),
      'purchase receipt aggregate did not update after a partial formal inbound posting',
    );
    const orderAfterFirstPartialInbound = await ok(
      baseUrl,
      `/purchase/orders/${encodeURIComponent(firstPartialInbound.receipt.sourceDoc)}`,
    );
    const firstPartialInboundProgress = orderAfterFirstPartialInbound.order.progressFacts.lines.find((line) => (
      line.lineId === splitQualityLine.sourceLineId
      || line.materialCode === splitQualityLine.materialCode
    ));
    assert(
      Math.abs(
        Number(firstPartialInboundProgress?.inboundQty || 0)
        - inboundQtyBeforeFirstPosting
        - firstInboundQty
      ) < 0.0001,
      'purchase follow-up ignored an effective partial inbound posting until the whole receipt completed',
    );
    const purchasePostedNotifications = await ok(baseUrl, '/notifications?limit=100', { account: 'ACC-PURCHASE' });
    assert(
      purchasePostedNotifications.items.some((row) => (
        row.action === '库存过账'
        && row.sourceDoc === firstPartialInbound.receipt.sourceDoc
        && row.sourcePath === `/purchase/orders/${encodeURIComponent(firstPartialInbound.receipt.sourceDoc)}/follow-up`
      )),
      'purchase inbound notification did not return purchase to the source-order follow-up page',
    );
    const completedSplitInbound = await ok(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(confirmedArrival.receipt.code)}/post`,
      {
        method: 'POST',
        body: {
          idempotencyKey: `${confirmedArrival.receipt.code}:warehouse-split:second`,
          allocations: [{
            receiptLineId: splitQualityLine.lineId,
            quantity: secondInboundQty,
            warehouseCode: 'WH-PKG',
            warehouse: '包材仓',
            location: 'PKG-02',
          }],
        },
      },
    );
    assert(
      completedSplitInbound.receipt.status === '已入库'
        && completedSplitInbound.receipt.stockStage === 'posted',
      'remaining released quantity did not complete the receipt in the second warehouse',
    );
    assert(completedSplitInbound.receipt.inboundPostings.length === 2, 'partial inbound history did not retain both postings');
    assert(
      completedSplitInbound.receipt.inboundPostings[0].lines[0].warehouseCode === 'WH-RM'
        && completedSplitInbound.receipt.inboundPostings[1].lines[0].warehouseCode === 'WH-PKG',
      'one receipt line was not preserved across two destination warehouses',
    );
    const postingMaterialSnapshot = completedSplitInbound.receipt.inboundPostings[0].lines[0];
    const sourceReceiptProduct = confirmedArrival.receipt.products.find((line) => (
      (line.lineId || line.materialCode) === (postingMaterialSnapshot.receiptLineId || postingMaterialSnapshot.materialCode)
    ));
    assert(
      postingMaterialSnapshot.name === (sourceReceiptProduct?.name || sourceReceiptProduct?.materialCode || '物料')
        && postingMaterialSnapshot.model === (sourceReceiptProduct?.model || '')
        && postingMaterialSnapshot.spec === (sourceReceiptProduct?.spec || ''),
      'purchase inbound posting did not freeze the material name, model, and specification snapshot',
    );
    const repeatedSplitInbound = await ok(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(confirmedArrival.receipt.code)}/post`,
      {
        method: 'POST',
        body: {
          idempotencyKey: `${confirmedArrival.receipt.code}:warehouse-split:second`,
          allocations: [{
            receiptLineId: splitQualityLine.lineId,
            quantity: secondInboundQty,
            warehouseCode: 'WH-PKG',
            warehouse: '包材仓',
            location: 'PKG-02',
          }],
        },
      },
    );
    assert(repeatedSplitInbound.repeated === true, 'partial inbound retry was not idempotent');
    const splitReceiptLedger = await ok(baseUrl, '/warehouse/stock-ledger');
    const splitReceiptLedgerRows = splitReceiptLedger.items.filter((row) => row.sourceDoc === confirmedArrival.receipt.code);
    const movementTotal = (movement) => splitReceiptLedgerRows
      .filter((row) => row.movement === movement)
      .reduce((total, row) => total + Number(row.quantityNumber || 0), 0);
    assert(
      Math.abs(movementTotal('采购到货') - splitQualityQty) < 0.0001,
      'purchase arrival did not post the full physical quantity to the stock ledger',
    );
    assert(
      Math.abs(movementTotal('质检解冻') + splitQualityQty) < 0.0001,
      'quality release did not fully clear the QC-hold stock ledger fact',
    );
    assert(
      Math.abs(movementTotal('待入库转出') + splitPostableQty) < 0.0001,
      'split formal inbound did not fully clear the pending-inbound stock ledger fact',
    );
    assert(
      Math.abs(movementTotal('采购入库') - splitPostableQty) < 0.0001,
      'split formal inbound did not post the full qualified quantity to destination warehouses',
    );
    const splitBatch = completedSplitInbound.receipt.products[0].batch;
    const splitStagingBatch = completedSplitInbound.receipt.products[0].stagingBatch || '';
    const splitInventoryAfterPosting = await ok(baseUrl, '/warehouse/inventory');
    const firstDestinationAfterPosting = inventoryRow(
      splitInventoryAfterPosting.items,
      splitQualityLine.materialCode,
      'WH-RM',
      splitBatch,
      'RM-01',
    );
    const secondDestinationAfterPosting = inventoryRow(
      splitInventoryAfterPosting.items,
      splitQualityLine.materialCode,
      'WH-PKG',
      splitBatch,
      'PKG-02',
    );
    assert(
      Math.abs(qty(firstDestinationAfterPosting, 'onHandNumber', 'onHand') - firstInboundQty) < 0.0001
        && Math.abs(qty(secondDestinationAfterPosting, 'onHandNumber', 'onHand') - secondInboundQty) < 0.0001,
      'split formal inbound did not create the expected two destination inventory facts',
    );
    const orderBeforeSplitReversal = await ok(
      baseUrl,
      `/purchase/orders/${encodeURIComponent(completedSplitInbound.receipt.sourceDoc)}`,
    );
    const progressBeforeSplitReversal = orderBeforeSplitReversal.order.progressFacts.lines.find((line) => (
      line.lineId === splitQualityLine.sourceLineId
      || line.materialCode === splitQualityLine.materialCode
    ));
    const reversedSplitInbound = await ok(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(completedSplitInbound.receipt.code)}/reverse`,
      {
        method: 'POST',
        body: {
          reason: '专项回归：同一收货行拆分入错两个正式库位，整体冲销后重新入库',
          idempotencyKey: `${completedSplitInbound.receipt.code}:warehouse-split:reverse`,
        },
      },
    );
    assert(
      reversedSplitInbound.reversal.lines.length === 2
        && new Set(reversedSplitInbound.reversal.lines.map((line) => line.warehouseCode)).size === 2,
      'split receipt reversal did not reverse both destination warehouse facts',
    );
    assert(
      reversedSplitInbound.record.status === '待入库'
        && reversedSplitInbound.record.stockStage === 'pending_inbound'
        && reversedSplitInbound.record.reversalStatus === '已冲销',
      'split receipt reversal did not restore the receipt to a re-postable pending-inbound state',
    );
    const splitInventoryAfterReversal = await ok(baseUrl, '/warehouse/inventory');
    const firstDestinationAfterReversal = inventoryRow(
      splitInventoryAfterReversal.items,
      splitQualityLine.materialCode,
      'WH-RM',
      splitBatch,
      'RM-01',
    );
    const secondDestinationAfterReversal = inventoryRow(
      splitInventoryAfterReversal.items,
      splitQualityLine.materialCode,
      'WH-PKG',
      splitBatch,
      'PKG-02',
    );
    const stagingAfterSplitReversal = inventoryRow(
      splitInventoryAfterReversal.items,
      splitQualityLine.materialCode,
      confirmedArrival.receipt.warehouseCode,
      splitStagingBatch,
      confirmedArrival.receipt.location,
    );
    assert(
      Math.abs(qty(firstDestinationAfterReversal, 'onHandNumber', 'onHand')) < 0.0001
        && Math.abs(qty(secondDestinationAfterReversal, 'onHandNumber', 'onHand')) < 0.0001,
      'split receipt reversal did not roll both destination balances back',
    );
    assert(
      Math.abs(qty(stagingAfterSplitReversal, 'onHandNumber', 'onHand') - splitPostableQty) < 0.0001
        && Math.abs(qty(stagingAfterSplitReversal, 'pendingInboundNumber', 'pendingInbound') - splitPostableQty) < 0.0001,
      'split receipt reversal did not restore the postable quantity to purchase staging',
    );
    const splitReceiptAfterReversal = await ok(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(completedSplitInbound.receipt.code)}`,
    );
    const reversedDecisionLine = splitReceiptAfterReversal.receipt.qualityDecision?.lines?.find((line) => (
      line.receiptLineId === splitQualityLine.lineId
    ));
    const reversedDisposition = splitReceiptAfterReversal.receipt.qualityDispositionQuantities?.[splitQualityLine.lineId];
    const reversedArrivalRecord = splitReceiptAfterReversal.detailProjection?.arrivalRecords?.find((record) => (
      record.receiptCode === completedSplitInbound.receipt.code
    ));
    assert(
      Math.abs(Number(splitReceiptAfterReversal.receipt.arrivalResult?.totals?.accepted || 0) - splitQualityQty) < 0.0001
        && Math.abs(Number(reversedDecisionLine?.rejectedQty || 0) - splitRejectedQty) < 0.0001
        && Math.abs(Number(reversedDisposition?.reinspectionAcceptedQty || 0) - splitReinspectionQty) < 0.0001
        && Math.abs(Number(reversedDisposition?.approvedConcessionQty || 0) - splitConcessionQty) < 0.0001,
      'receipt reversal erased the original arrival or incoming-quality decision facts',
    );
    assert(
      splitReceiptAfterReversal.receipt.inboundPostings.every((posting) => (
        posting.reversalCode === reversedSplitInbound.reversal.code
      )),
      'receipt reversal did not mark historical inbound postings as reversed',
    );
    assert(
      reversedArrivalRecord?.lines?.every((line) => Number(line.postedQty || 0) < 0.0001)
        && reversedArrivalRecord?.lines?.some((line) => Number(line.availableQty || 0) > 0.0001),
      'reversed inbound postings still appeared as effective posted quantity in the detail projection',
    );
    assert(
      splitReceiptAfterReversal.receipt.qualityDispositions?.some((row) => (
        row.action === 'return_to_supplier' && Math.abs(Number(row.quantity || 0) - splitReturnQty) < 0.0001
      )),
      'receipt reversal erased the supplier-return quality disposition fact',
    );
    const orderAfterSplitReversal = await ok(
      baseUrl,
      `/purchase/orders/${encodeURIComponent(completedSplitInbound.receipt.sourceDoc)}`,
    );
    const progressAfterSplitReversal = orderAfterSplitReversal.order.progressFacts.lines.find((line) => (
      line.lineId === splitQualityLine.sourceLineId
      || line.materialCode === splitQualityLine.materialCode
    ));
    assert(
      Math.abs(Number(progressAfterSplitReversal?.arrivedQty || 0) - Number(progressBeforeSplitReversal?.arrivedQty || 0)) < 0.0001
        && Math.abs(Number(progressAfterSplitReversal?.releasedQty || 0) - Number(progressBeforeSplitReversal?.releasedQty || 0)) < 0.0001
        && Math.abs(Number(progressAfterSplitReversal?.rejectedQty || 0) - Number(progressBeforeSplitReversal?.rejectedQty || 0)) < 0.0001
        && Math.abs(Number(progressAfterSplitReversal?.returnedQty || 0) - Number(progressBeforeSplitReversal?.returnedQty || 0)) < 0.0001
        && Math.abs(
          Number(progressBeforeSplitReversal?.inboundQty || 0)
          - Number(progressAfterSplitReversal?.inboundQty || 0)
          - splitPostableQty
        ) < 0.0001,
      'receipt reversal did not preserve arrival/quality facts while rolling back only formal inbound progress',
    );
    const repostedSplitInbound = await ok(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(completedSplitInbound.receipt.code)}/post`,
      {
        method: 'POST',
        body: {
          idempotencyKey: `${completedSplitInbound.receipt.code}:warehouse-split:repost`,
          allocations: [
            {
              receiptLineId: splitQualityLine.lineId,
              quantity: firstInboundQty,
              warehouseCode: 'WH-RM',
              warehouse: '原料仓',
              location: 'RM-01',
            },
            {
              receiptLineId: splitQualityLine.lineId,
              quantity: secondInboundQty,
              warehouseCode: 'WH-PKG',
              warehouse: '包材仓',
              location: 'PKG-02',
            },
          ],
        },
      },
    );
    assert(
      repostedSplitInbound.receipt.status === '已入库'
        && repostedSplitInbound.receipt.stockStage === 'posted'
        && !repostedSplitInbound.receipt.reversalCode
        && repostedSplitInbound.receipt.reversalHistory?.some((row) => row.code === reversedSplitInbound.reversal.code),
      'reversed split receipt could not be formally inbounded again with reversal history retained',
    );
    assert(
      repostedSplitInbound.receipt.inboundPostings.filter((posting) => posting.reversalCode).length === 2
        && repostedSplitInbound.receipt.inboundPostings.filter((posting) => !posting.reversalCode).length === 1,
      're-posting did not preserve reversed posting history separately from the new effective posting',
    );
    const orderAfterSplitRepost = await ok(
      baseUrl,
      `/purchase/orders/${encodeURIComponent(completedSplitInbound.receipt.sourceDoc)}`,
    );
    const progressAfterSplitRepost = orderAfterSplitRepost.order.progressFacts.lines.find((line) => (
      line.lineId === splitQualityLine.sourceLineId
      || line.materialCode === splitQualityLine.materialCode
    ));
    assert(
      Math.abs(Number(progressAfterSplitRepost?.inboundQty || 0) - Number(progressBeforeSplitReversal?.inboundQty || 0)) < 0.0001,
      're-posting the reversed split receipt did not restore purchase formal-inbound progress',
    );
    const purchaseReversal = await ok(
      baseUrl,
      '/warehouse/purchase-receipts/WR-20260702-001/reverse',
      {
        method: 'POST',
        body: {
          reason: '专项回归：采购入库目标库位登记错误',
          idempotencyKey: 'WR-20260702-001:warehouse-smoke:reverse',
        },
      },
    );
    const purchaseReversalNotifications = await ok(baseUrl, '/notifications?limit=100', { account: 'ACC-PURCHASE' });
    assert(
      purchaseReversalNotifications.items.some((row) => (
        row.action === '库存冲销'
        && row.sourceDoc === purchaseReversal.record.sourceDoc
        && row.sourcePath === `/purchase/orders/${encodeURIComponent(purchaseReversal.record.sourceDoc)}/follow-up`
      )),
      'purchase reversal notification did not return purchase to the source-order follow-up page',
    );

    console.log('warehouse smoke passed: arrival/QC dispositions, split inbound reversal/re-post, supplier-return closure, receipt facts, reservations, transfer locks, stocktake, reversals and move validation');
  } catch (error) {
    if (logs) console.error(logs);
    throw error;
  } finally {
    child.kill('SIGTERM');
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
