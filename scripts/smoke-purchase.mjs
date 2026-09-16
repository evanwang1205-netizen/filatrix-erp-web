import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

import { createSeedData } from '../server/seed-data.mjs';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'x-filatrix-account': 'ACC-ZHANGSAN',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function ok(baseUrl, path) {
  const result = await request(baseUrl, path);
  if (!result.response.ok) throw new Error(`HTTP ${result.response.status} ${result.payload.error || ''}`.trim());
  return result.payload;
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const health = await ok(baseUrl, '/health');
      if (health.ok) return;
    } catch {
      // The temporary API may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('temporary purchase API did not become healthy');
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'filatrix-purchase-'));
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

    const partial = await ok(baseUrl, '/purchase/requisitions/PR-20260716-003');
    assert(partial.requisition.status === '待采购受理', 'conversion overwrote the requisition main status');
    assert(partial.requisition.documentStatus === '已提交', 'partially converted request did not keep a separate lifecycle status');
    assert(partial.requisition.conversionFacts.status === '部分转单', 'partial conversion status was not derived');
    const pearl = partial.requisition.conversionFacts.lines.find((line) => line.lineId === 'L2');
    assert(pearl?.remainingQty === 90, 'remaining quantity for the unconverted line is incorrect');

    const unallocated = await ok(baseUrl, '/purchase/requisitions/PR-20260717-002');
    assert(unallocated.requisition.documentStatus === '已提交', 'unallocated submitted request lifecycle status is incorrect');
    assert(unallocated.requisition.conversionFacts.status === '未转单', 'new material request should remain unallocated');

    const retiredAssetRequest = await request(baseUrl, '/purchase/requisitions/PR-20260714-006');
    assert(retiredAssetRequest.response.status === 404, 'retired asset requisition still exists');

    const incompleteDraft = await request(baseUrl, '/purchase/requisitions', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        purchaseType: '物料采购',
        products: [{ materialCode: '', name: '', qty: '', uom: '' }],
      },
    });
    assert(incompleteDraft.response.status === 201, 'incomplete request draft could not be retained for correction');
    assert(incompleteDraft.payload.requisition.documentStatus === '草稿', 'incomplete request draft lost its lifecycle');
    assert(incompleteDraft.payload.requisition.conversionFacts.status === '未转单', 'zero-quantity draft was incorrectly treated as converted');
    assert(incompleteDraft.payload.requisition.conversionFacts.totalLineCount === 0, 'blank draft line was counted as real demand');

    const references = await ok(baseUrl, '/reference/purchase-requisitions?limit=50');
    const referenceCodes = new Set(references.items.map((item) => item.code));
    assert(referenceCodes.has('PR-20260716-003'), 'partially converted request is missing from the source picker');
    assert(referenceCodes.has('PR-20260717-002'), 'unallocated request is missing from the source picker');
    assert(!referenceCodes.has('PR-20260714-006'), 'retired asset requisition is still selectable');
    const rejectedAssetRequest = await request(baseUrl, '/purchase/requisitions', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        companyCode: 'COM-FILATRIX',
        company: 'Filatrix 增材材料有限公司',
        purchaseType: '资产采购',
        department: '生产管理部',
        requester: '周宁',
        reason: '验证停用的资产采购入口不能继续写入数据。',
        date: '2026-07-22',
        expectedDate: '2026-08-20',
        products: [],
        assetName: '扫码复核台',
        assetSpec: '双工位扫码校验',
        assetPurpose: '用于包装线末端标签和箱码复核。',
        budgetAmount: '￥28,000.00',
        acceptanceOwner: '周宁',
      },
    });
    assert(rejectedAssetRequest.response.status === 400, 'retired asset requisition API still accepts new documents');
    const materialReferences = await ok(baseUrl, '/reference/purchase-requisitions?kind=%E7%89%A9%E6%96%99%E9%87%87%E8%B4%AD&limit=50');
    const assetReferences = await ok(baseUrl, '/reference/purchase-requisitions?kind=%E8%B5%84%E4%BA%A7%E9%87%87%E8%B4%AD&limit=50');
    assert(materialReferences.items.some((item) => item.code === 'PR-20260717-002'), 'material source picker omitted an active material requisition');
    assert(assetReferences.items.length === 0, 'retired asset requisition picker still returns candidates');

    const qualityRuleRequest = await request(baseUrl, '/purchase/requisitions', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        companyCode: 'COM-FILATRIX',
        company: 'Filatrix 增材材料有限公司',
        purchaseType: '物料采购',
        department: '生产管理部',
        requester: '刘强',
        reason: '验证到货检验规则由物料基础资料自动带入。',
        date: '2026-07-22',
        expectedDate: '2026-07-30',
        products: [{
          materialCode: 'M-PKG-SPOOL-1KG',
          name: '小盘线轴 1kg',
          qty: '10',
          uom: '个',
          qcRequired: false,
          incomingQualityControl: '免检',
        }],
      },
    });
    assert(qualityRuleRequest.response.status === 201, 'quality-rule requisition draft could not be created');
    assert(qualityRuleRequest.payload.requisition.documentStatus === '草稿', 'draft request lifecycle status is incorrect');
    assert(qualityRuleRequest.payload.requisition.conversionFacts.nextStep === '提交采购受理', 'draft request skipped directly to purchase conversion');
    assert(qualityRuleRequest.payload.requisition.products[0].qcRequired === true, 'client bypassed the material incoming-quality rule');
    assert(qualityRuleRequest.payload.requisition.products[0].incomingQualityControl === '抽检', 'sampling rule was not preserved on the requisition line');
    const submittedRequest = await request(baseUrl, `/purchase/requisitions/${encodeURIComponent(qualityRuleRequest.payload.requisition.code)}/submit`, { method: 'POST' });
    assert(
      submittedRequest.response.status === 200,
      `quality-rule requisition could not be submitted: ${submittedRequest.payload?.error || submittedRequest.response.status}`,
    );
    const submittedEdit = await request(baseUrl, `/purchase/requisitions/${encodeURIComponent(qualityRuleRequest.payload.requisition.code)}`, {
      method: 'PUT',
      body: { ...qualityRuleRequest.payload.requisition, reason: '不应覆盖已提交事实' },
    });
    assert(submittedEdit.response.status === 400, 'submitted purchase requisition was still directly editable');

    const invalidNeedDateRequest = await request(baseUrl, '/purchase/requisitions', {
      method: 'POST',
      body: {
        ...qualityRuleRequest.payload.requisition,
        code: '系统自动生成',
        date: '2026-08-01',
        expectedDate: '2026-07-31',
      },
    });
    assert(invalidNeedDateRequest.response.status === 201, 'invalid-date draft could not be retained for correction');
    const invalidNeedDateSubmit = await request(
      baseUrl,
      `/purchase/requisitions/${encodeURIComponent(invalidNeedDateRequest.payload.requisition.code)}/submit`,
      { method: 'POST' },
    );
    assert(invalidNeedDateSubmit.response.status === 400, 'request with a need date before its application date was submitted');

    const nonPurchasableRequest = await request(baseUrl, '/purchase/requisitions', {
      method: 'POST',
      body: {
        ...qualityRuleRequest.payload.requisition,
        code: '系统自动生成',
        date: '2026-07-22',
        expectedDate: '2026-07-30',
        products: [{ materialCode: 'M-FG-PETG-175-BLK', name: 'PETG 1.75mm 黑色耗材 1kg', qty: '10', uom: '卷' }],
      },
    });
    assert(nonPurchasableRequest.response.status === 201, 'non-purchasable draft could not be retained for correction');
    const nonPurchasableSubmit = await request(
      baseUrl,
      `/purchase/requisitions/${encodeURIComponent(nonPurchasableRequest.payload.requisition.code)}/submit`,
      { method: 'POST' },
    );
    assert(nonPurchasableSubmit.response.status === 400, 'request bypassed the material purchase-usage boundary');

    const retiredAssetOrder = await request(baseUrl, '/purchase/orders/PO-20260714-007');
    assert(retiredAssetOrder.response.status === 404, 'retired asset purchase order still exists');
    const retiredAssetArrival = await request(baseUrl, '/purchase/orders/PO-20260714-007/asset-arrival', {
      method: 'POST',
      body: { date: '2026-07-22', note: 'retired endpoint guard' },
    });
    assert(retiredAssetArrival.response.status === 404, 'retired asset arrival endpoint still responds');

    const closed = await ok(baseUrl, '/purchase/orders/PO-20260625-009');
    const relatedTypes = new Set(closed.order.relatedDocuments.map((item) => item.type));
    ['采购收货', '来料质检', '收票记录', '付款记录'].forEach((type) => {
      assert(relatedTypes.has(type), `closed order is missing related document: ${type}`);
    });
    const closeAgain = await request(baseUrl, '/purchase/orders/PO-20260625-009/close', { method: 'POST' });
    assert(closeAgain.response.status === 200, 'closing an already closed purchase order was not idempotent');
    assert(closeAgain.payload.order.status === '已关闭', 'idempotent close changed the purchase order lifecycle');

    const existing = await ok(baseUrl, '/purchase/orders/PO-20260716-005');
    assert(existing.order.companyPrintSnapshot?.name === 'Filatrix 增材材料有限公司', 'purchase order PDF company snapshot was missing');
    assert(existing.order.buyerPrintSnapshot?.contact === existing.order.owner, 'purchase order PDF buyer snapshot was missing');
    assert(existing.order.supplierPrintSnapshot?.name === existing.order.supplier, 'purchase order PDF supplier snapshot was missing');
    assert(existing.order.supplierPrintSnapshot?.address, 'purchase order PDF supplier address snapshot was missing');

    const directLineWithStaleHeader = await request(baseUrl, '/purchase/orders', {
      method: 'POST',
      body: {
        ...existing.order,
        code: '系统自动生成',
        status: '草稿',
        sourceRequisition: submittedRequest.payload.requisition.code,
        sourceRequisitions: [submittedRequest.payload.requisition.code],
        relatedDocuments: [],
        progressFacts: undefined,
        products: [{
          ...submittedRequest.payload.requisition.products[0],
          lineId: 'L1',
          sourceRequisition: '',
          sourceLineId: '',
          qty: '2',
          unitPrice: '109.00',
        }],
      },
    });
    assert(directLineWithStaleHeader.response.status === 201, 'direct purchase line with a stale header source could not be saved');
    assert(directLineWithStaleHeader.payload.order.sourceRequisition === '', 'stale order-header source was kept without a sourced line');
    assert(directLineWithStaleHeader.payload.order.sourceRequisitions.length === 0, 'header source summary was not derived from line identities');
    assert(directLineWithStaleHeader.payload.order.products[0].sourceRequisition === '', 'manual purchase line inherited the first requisition from the order header');
    const directLineSourceFacts = await ok(baseUrl, `/purchase/requisitions/${encodeURIComponent(submittedRequest.payload.requisition.code)}`);
    assert(directLineSourceFacts.requisition.conversionFacts.lines[0].orderedQty === 0, 'manual purchase line polluted requisition conversion quantities');

    const invalidLineSource = await request(baseUrl, '/purchase/orders', {
      method: 'POST',
      body: {
        ...existing.order,
        code: '系统自动生成',
        status: '草稿',
        relatedDocuments: [],
        progressFacts: undefined,
        products: [{
          ...submittedRequest.payload.requisition.products[0],
          lineId: 'L1',
          sourceRequisition: submittedRequest.payload.requisition.code,
          sourceLineId: 'L999',
          qty: '1',
          unitPrice: '109.00',
        }],
      },
    });
    assert(invalidLineSource.response.status === 409, 'purchase order accepted a nonexistent requisition line identity');

    const prematureClose = await request(baseUrl, '/purchase/orders/PO-20260716-005/close', { method: 'POST' });
    assert(prematureClose.response.status === 409, 'partially fulfilled purchase order was closed before all tracks completed');
    const downstreamChange = await request(baseUrl, '/purchase/orders/PO-20260716-005', {
      method: 'PUT',
      body: { ...existing.order, _operation: 'change', expectedDate: '2026-07-30' },
    });
    assert(downstreamChange.response.status === 409, 'purchase order with downstream documents was still editable');

    const taxExclusiveDraft = await request(baseUrl, '/purchase/orders', {
      method: 'POST',
      body: {
        ...existing.order,
        code: '系统自动生成',
        status: '草稿',
        sourceRequisition: '',
        sourceRequisitions: [],
        relatedDocuments: [],
        progressFacts: undefined,
        taxMode: '不含税',
        taxRate: '13%',
        products: [{
          materialCode: 'M-RM-PLA-VIRGIN',
          name: 'PLA 原生粒子',
          qty: '10',
          unitPrice: '￥10.00',
          uom: 'kg',
        }],
      },
    });
    assert(taxExclusiveDraft.response.status === 201, 'tax-exclusive purchase order draft could not be created');
    assert(taxExclusiveDraft.payload.order.amount === '￥113.00', 'purchase order payable total ignored tax-exclusive pricing');
    assert(taxExclusiveDraft.payload.order.products[0].priceInputMode === '不含税', 'purchase line lost its direct-input tax basis');
    assert(taxExclusiveDraft.payload.order.products[0].netUnitPrice === '10.00', 'purchase line net unit-price snapshot is incorrect');
    assert(taxExclusiveDraft.payload.order.products[0].grossUnitPrice === '11.30', 'purchase line gross unit-price snapshot is incorrect');

    const mixedTaxDraft = await request(baseUrl, '/purchase/orders', {
      method: 'POST',
      body: {
        ...existing.order,
        code: '系统自动生成',
        status: '草稿',
        sourceRequisition: '',
        sourceRequisitions: [],
        relatedDocuments: [],
        progressFacts: undefined,
        products: [
          {
            materialCode: 'M-RM-PLA-VIRGIN',
            name: 'PLA 原生粒子',
            qty: '10',
            priceInputMode: '不含税',
            unitPrice: '10.00',
            taxRate: '13%',
            uom: 'kg',
          },
          {
            materialCode: 'M-PKG-SPOOL-1KG',
            name: '小盘线轴 1kg',
            qty: '2',
            priceInputMode: '含税',
            unitPrice: '109.00',
            taxRate: '9%',
            uom: '个',
          },
        ],
      },
    });
    assert(mixedTaxDraft.response.status === 201, 'mixed-rate purchase order draft could not be created');
    assert(mixedTaxDraft.payload.order.taxRate === '多税率', 'mixed purchase line tax rates were not summarized');
    assert(mixedTaxDraft.payload.order.amount === '￥331.00', 'mixed purchase line gross total is incorrect');
    assert(mixedTaxDraft.payload.order.products[1].netUnitPrice === '100.00', 'gross-input purchase line did not reverse-calculate the net unit price');
    assert(mixedTaxDraft.payload.order.products[1].taxAmount === '￥18.00', 'gross-input purchase line tax amount is incorrect');

    const mergedOrderResult = await request(baseUrl, '/purchase/orders', {
      method: 'POST',
      body: {
        ...existing.order,
        code: '系统自动生成',
        status: '草稿',
        sourceRequisition: partial.requisition.code,
        sourceRequisitions: [partial.requisition.code, unallocated.requisition.code],
        products: [
          {
            ...partial.requisition.products.find((line) => line.lineId === 'L2'),
            lineId: 'L1',
            sourceRequisition: partial.requisition.code,
            sourceLineId: 'L2',
            qty: '45',
            unitPrice: '18.00',
            amount: '￥999,999.00',
          },
          {
            ...unallocated.requisition.products.find((line) => line.lineId === 'L1'),
            lineId: 'L2',
            sourceRequisition: unallocated.requisition.code,
            sourceLineId: 'L1',
            unitPrice: '3.20',
          },
          {
            ...unallocated.requisition.products.find((line) => line.lineId === 'L2'),
            lineId: 'L3',
            sourceRequisition: unallocated.requisition.code,
            sourceLineId: 'L2',
            unitPrice: '0.85',
          },
        ],
      },
    });
    assert(mergedOrderResult.response.status === 201, 'multiple requisitions could not be merged into one purchase order');
    const mergedOrder = mergedOrderResult.payload.order;
    assert(mergedOrder.products[0].amount === '￥810.00', 'purchase line amount trusted the client instead of quantity × unit price');

    const partialAfterMerge = await ok(baseUrl, '/purchase/requisitions/PR-20260716-003');
    const pearlAfterMerge = partialAfterMerge.requisition.conversionFacts.lines.find((line) => line.lineId === 'L2');
    assert(pearlAfterMerge?.orderedQty === 45, 'same line ids from another requisition polluted the allocated quantity');
    const packagingAfterMerge = await ok(baseUrl, '/purchase/requisitions/PR-20260717-002');
    assert(packagingAfterMerge.requisition.conversionFacts.lines.find((line) => line.lineId === 'L1')?.orderedQty === 3000, 'merged spool allocation is incorrect');
    assert(packagingAfterMerge.requisition.conversionFacts.lines.find((line) => line.lineId === 'L2')?.orderedQty === 5000, 'merged bag allocation is incorrect');

    const confirmedMergedOrder = await request(baseUrl, `/purchase/orders/${encodeURIComponent(mergedOrder.code)}/confirm`, { method: 'POST' });
    assert(
      confirmedMergedOrder.response.status === 200
      && confirmedMergedOrder.payload.receiptTask?.status === '待收货'
      && confirmedMergedOrder.payload.receiptTask?.sourceDoc === mergedOrder.code,
      'confirming a material purchase order did not create its warehouse receiving task',
    );
    const manualReceipt = await request(baseUrl, '/warehouse/purchase-receipts', {
      method: 'POST',
      body: { sourceDoc: mergedOrder.code },
    });
    assert(manualReceipt.response.status === 405, 'warehouse could still create a blank purchase receipt');
    const synchronizedOrderChange = await request(baseUrl, `/purchase/orders/${encodeURIComponent(mergedOrder.code)}`, {
      method: 'PUT',
      body: {
        ...confirmedMergedOrder.payload.order,
        _operation: 'change',
        expectedDate: '2026-08-05',
      },
    });
    assert(synchronizedOrderChange.response.status === 200, 'untouched automatic receipt task blocked a controlled order change');
    assert(
      synchronizedOrderChange.payload.receiptTask?.code === confirmedMergedOrder.payload.receiptTask.code
      && synchronizedOrderChange.payload.receiptTask?.expectedDate === '2026-08-05',
      'controlled order change did not synchronize the untouched receiving task',
    );
    const receiptTask = synchronizedOrderChange.payload.receiptTask;
    const overToleranceReceipt = await request(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(receiptTask.code)}`, {
      method: 'PUT',
      body: {
        ...receiptTask,
        sourceDoc: mergedOrder.code,
        supplierCode: mergedOrder.supplierCode,
        supplier: mergedOrder.supplier,
        contact: mergedOrder.contact,
        products: [{ ...mergedOrder.products[2], qty: '5251', qcRequired: false }],
        warehouseCode: mergedOrder.warehouseCode,
        warehouse: mergedOrder.warehouse,
        location: 'QC-01',
        owner: '吴磊',
        date: '2026-07-17',
      },
    });
    assert(overToleranceReceipt.response.status === 409, 'receipt quantity exceeded the frozen 5% over-receipt tolerance');
    const placeholderReceipt = await request(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(receiptTask.code)}`, {
      method: 'PUT',
      body: {
        ...receiptTask,
        sourceDoc: mergedOrder.code,
        supplierCode: mergedOrder.supplierCode,
        supplier: mergedOrder.supplier,
        contact: mergedOrder.contact,
        products: [{ ...mergedOrder.products[2], qty: '5001', qcRequired: false }],
        warehouseCode: mergedOrder.warehouseCode,
        warehouse: mergedOrder.warehouse,
        location: 'QC-AUTO',
        owner: '吴磊',
        date: '2026-07-17',
      },
    });
    assert(placeholderReceipt.response.status === 400, 'purchase receipt accepted a historical placeholder staging location');
    const overReceiptResult = await request(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(receiptTask.code)}`, {
      method: 'PUT',
      body: {
        ...receiptTask,
        sourceDoc: mergedOrder.code,
        supplierCode: mergedOrder.supplierCode,
        supplier: mergedOrder.supplier,
        contact: mergedOrder.contact,
        products: [{ ...mergedOrder.products[2], qty: '5001', qcRequired: false }],
        warehouseCode: mergedOrder.warehouseCode,
        warehouse: mergedOrder.warehouse,
        location: 'QC-01',
        owner: '吴磊',
        date: '2026-07-17',
      },
    });
    assert(overReceiptResult.response.status === 200, 'receipt within the frozen 5% over-receipt tolerance was blocked');
    const receiptResult = await request(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(receiptTask.code)}`, {
      method: 'PUT',
      body: {
        ...receiptTask,
        sourceDoc: mergedOrder.code,
        supplierCode: mergedOrder.supplierCode,
        supplier: mergedOrder.supplier,
        contact: mergedOrder.contact,
        products: [{
          ...mergedOrder.products[2],
          qty: '4000',
          arrivalQty: '4000',
          acceptedQty: '4000',
          refusedQty: '0',
          exceptionHeldQty: '0',
          qcRequired: false,
        }],
        warehouseCode: mergedOrder.warehouseCode,
        warehouse: mergedOrder.warehouse,
        location: 'QC-01',
        owner: '吴磊',
        date: '2026-07-17',
      },
    });
    assert(receiptResult.response.status === 200, 'automatically generated purchase receipt task could not record actual arrival data');
    assert(receiptResult.payload.receipt.products[0].qcRequired === true, 'receipt bypassed the source order quality requirement');
    const startedReceiptChange = await request(baseUrl, `/purchase/orders/${encodeURIComponent(mergedOrder.code)}`, {
      method: 'PUT',
      body: {
        ...synchronizedOrderChange.payload.order,
        _operation: 'change',
        expectedDate: '2026-08-06',
      },
    });
    assert(startedReceiptChange.response.status === 409, 'warehouse arrival draft did not freeze the purchase order');
    const registeredPartialReceipt = await request(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(receiptResult.payload.receipt.code)}/arrival-result`, {
      method: 'POST',
      body: {
        idempotencyKey: `${receiptResult.payload.receipt.code}-partial-arrival`,
        receipt: {
          ...receiptResult.payload.receipt,
          date: '2026-07-17',
          location: 'QC-01',
        },
      },
    });
    assert(
      registeredPartialReceipt.response.status === 201
      && registeredPartialReceipt.payload.nextReceiptTask?.status === '待收货'
      && registeredPartialReceipt.payload.nextReceiptTask?.sourceDoc === mergedOrder.code,
      `partial arrival did not create the next pending receiving task: ${JSON.stringify(registeredPartialReceipt.payload)}`,
    );
    const mergedProgress = await ok(baseUrl, `/purchase/orders/${encodeURIComponent(mergedOrder.code)}`);
    const mergedReceiptRows = await ok(baseUrl, '/warehouse/purchase-receipts');
    const mergedReceiptSummary = mergedReceiptRows.items
      .filter((item) => item.sourceDoc === mergedOrder.code)
      .map((item) => ({
        code: item.code,
        status: item.status,
        lines: item.products.map((line) => ({ sourceLineId: line.sourceLineId, qty: line.qty })),
      }));
    assert(mergedProgress.order.progressFacts.arrival === '部分到货', 'over-receipt on one line hid the missing lines');
    assert(
      mergedProgress.order.progressFacts.lines.find((line) => line.lineId === 'L1')?.arrivedQty === 0,
      `line-level arrival facts are incorrect: ${JSON.stringify(mergedProgress.order.progressFacts.lines)}`,
    );
    assert(
      mergedProgress.order.progressFacts.lines.find((line) => line.lineId === 'L3')?.arrivedQty === 4000,
      `received line quantity is incorrect: ${JSON.stringify(mergedProgress.order.progressFacts.lines)} / receipts ${JSON.stringify(mergedReceiptSummary)}`,
    );
    const closeRemainder = await request(baseUrl, `/purchase/orders/${encodeURIComponent(mergedOrder.code)}/close-remainder`, {
      method: 'POST',
      body: { reason: '供应商确认本批不再补交，采购接受短收' },
    });
    assert(closeRemainder.response.status === 200, `purchase receipt remainder could not be closed: ${JSON.stringify(closeRemainder.payload)}`);
    assert(closeRemainder.payload.closures.length > 0, 'closing purchase receipt remainder did not create line-level closure facts');
    assert(
      closeRemainder.payload.order.progressFacts.lines.every((line) => line.remainingQty <= 0.0001),
      'closed purchase receipt remainder still appeared as pending supplier delivery',
    );
    assert(closeRemainder.payload.order.progressFacts.arrival === '已到货', 'short-received order did not become operationally complete after procurement closed the remainder');
    const cancelledNextReceipt = await ok(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(registeredPartialReceipt.payload.nextReceiptTask.code)}`,
    );
    assert(
      cancelledNextReceipt.receipt.status === '已取消',
      `closing purchase receipt remainder did not cancel the untouched warehouse receiving task: ${JSON.stringify(cancelledNextReceipt.receipt)}`,
    );

    const purchaseAfterSale = await ok(baseUrl, '/purchase/after-sales/PA-20260712-001');
    const afterSaleRelatedTypes = new Set(purchaseAfterSale.record.relatedDocuments.map((item) => item.type));
    assert(afterSaleRelatedTypes.has('采购收货') && afterSaleRelatedTypes.has('来料质检'), 'purchase after-sales is missing its source facts');
    const prematureAfterSaleAdvance = await request(baseUrl, '/purchase/after-sales/PA-20260712-001/advance', {
      method: 'POST',
      body: { revision: Number(purchaseAfterSale.record.revision || 1) },
    });
    assert(prematureAfterSaleAdvance.response.status === 409, 'purchase after-sales advanced without a processing result');
    const frozenAfterSale = await request(baseUrl, '/purchase/after-sales/PA-20260712-001', {
      method: 'PUT',
      body: {
        ...purchaseAfterSale.record,
        revision: Number(purchaseAfterSale.record.revision || 1),
        sourceOrder: 'PO-20260716-005',
        products: [],
      },
    });
    assert(frozenAfterSale.response.status === 200, 'purchase after-sales frozen-source check could not be saved');
    assert(frozenAfterSale.payload.record.sourceOrder === purchaseAfterSale.record.sourceOrder, 'purchase after-sales source order changed after registration');
    assert(frozenAfterSale.payload.record.products.length === purchaseAfterSale.record.products.length, 'purchase after-sales affected lines changed after registration');
    const prematureResult = await request(baseUrl, '/purchase/after-sales/PA-20260712-001', {
      method: 'PUT',
      body: {
        ...frozenAfterSale.payload.record,
        processingResult: '不应在协同任务完成前写入。',
      },
    });
    assert(
      purchaseAfterSale.record.executionTasks.length
        ? prematureResult.response.status === 409
        : prematureResult.response.status === 200,
      'purchase after-sales did not respect the distinction between physical execution tasks and purchase-owned commercial results',
    );
    const currentAfterSale = prematureResult.response.ok
      ? prematureResult.payload.record
      : frozenAfterSale.payload.record;
    const forgedTask = currentAfterSale.executionTasks.find((task) => task.status !== '已完成');
    if (forgedTask) {
      const forgedTaskUpdate = await request(baseUrl, '/purchase/after-sales/PA-20260712-001', {
        method: 'PUT',
        body: {
          ...currentAfterSale,
          executionTasks: currentAfterSale.executionTasks.map((task) => (
            task.code === forgedTask.code ? { ...task, status: '已完成', evidence: '采购伪造完成' } : task
          )),
        },
      });
      assert(forgedTaskUpdate.response.status === 409, 'purchase after-sales allowed procurement to complete another role task');
    }
    const missingAfterSaleSource = await request(baseUrl, '/purchase/after-sales', {
      method: 'POST',
      body: { ...purchaseAfterSale.record, code: '系统自动生成', sourceOrder: '' },
    });
    assert(missingAfterSaleSource.response.status === 409, 'purchase after-sales was created without a source order');
    const retiredOrderAfterSale = await request(baseUrl, '/purchase/after-sales', {
      method: 'POST',
      body: { ...purchaseAfterSale.record, code: '系统自动生成', sourceOrder: 'PO-20260714-007' },
    });
    assert(retiredOrderAfterSale.response.status === 409, 'retired purchase order incorrectly entered material purchase after-sales');
    const overQtyAfterSale = await request(baseUrl, '/purchase/after-sales', {
      method: 'POST',
      body: {
        ...purchaseAfterSale.record,
        code: '系统自动生成',
        products: purchaseAfterSale.record.products.map((line) => ({ ...line, qty: '999999 kg' })),
      },
    });
    assert(overQtyAfterSale.response.status === 409, 'purchase after-sales accepted an affected quantity above the source line');

    const overAllocated = await request(baseUrl, '/purchase/orders', {
      method: 'POST',
      body: {
        ...existing.order,
        code: '系统自动生成',
        status: '草稿',
        products: existing.order.products.map((line, index) => index === 0 ? { ...line, qty: '2501' } : line),
      },
    });
    assert(overAllocated.response.status === 409, 'source request over-allocation was not blocked');

    const rejectedAssetOrder = await request(baseUrl, '/purchase/orders', {
      method: 'POST',
      body: {
        ...existing.order,
        code: '系统自动生成',
        status: '草稿',
        purchaseType: '资产采购',
        sourceRequisition: '',
        sourceRequisitions: [],
      },
    });
    assert(rejectedAssetOrder.response.status === 400, 'retired asset purchase order API still accepts new documents');

    console.log('Purchase module smoke passed (quality rule, submitted lock, calculated amount, line allocation, receipt limit, role-owned after-sales tasks, progress, retired asset boundary, related documents).');
  } catch (error) {
    if (logs.trim()) console.error(logs.trim());
    throw error;
  } finally {
    child.kill();
    await rm(tempDir, { recursive: true, force: true });
  }
}

await main();
