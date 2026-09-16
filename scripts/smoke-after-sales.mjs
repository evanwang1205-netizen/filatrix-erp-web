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

function quantityNumber(value) {
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

function warehouseLocation(warehouse) {
  return warehouse.locationOptions?.[0] || `${warehouse.binPrefix || 'LOC'}-01`;
}

function receiptAllocations(task, batchPrefix) {
  return (task.products || []).map((product, index) => ({
    allocationId: `${task.code}-B${index + 1}`,
    sourceLineId: product.sourceLineId || '',
    materialCode: product.materialCode || '',
    batch: `${batchPrefix}-${String(index + 1).padStart(2, '0')}`,
    qty: product.qty,
    uom: product.uom || '',
  }));
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
  const response = await fetch(`${baseUrl}/api${path}`, {
    method: options.method || 'GET',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${payload.error || ''}`.trim());
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function expectFailure(action, text) {
  let blocked = false;
  let actual = '';
  try {
    await action();
  } catch (error) {
    actual = String(error);
    blocked = actual.includes(text);
  }
  assert(blocked, `expected request to fail with “${text}”, received “${actual || 'success'}”`);
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const health = await request(baseUrl, '/health');
      if (health.ok) return;
    } catch {
      // Temporary API may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('temporary after-sales API did not become healthy');
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'filatrix-after-sales-'));
  const dataFile = join(tempDir, 'erp-data.json');
  await writeFile(dataFile, JSON.stringify(createSeedData(), null, 2), 'utf8');
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
      FILATRIX_API_PORT: String(port),
      FILATRIX_DATA_FILE: dataFile,
      FILATRIX_ALLOW_ACCOUNT_HEADER: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  try {
    await waitForHealth(baseUrl, child);

    const legacyTaskDetail = await request(
      baseUrl,
      '/warehouse/after-sales-tasks/WAS-SA-20260716-002-01',
    );
    assert(
      legacyTaskDetail.task.products?.[0]?.model === 'PETG-175-BLK-1KG'
        && legacyTaskDetail.task.products?.[0]?.spec === '线径 1.75mm，净重 1kg，黑色'
        && legacyTaskDetail.task.products?.[0]?.batchTracked === true,
      'legacy after-sales task did not recover its frozen identity and batch control from the source order line',
    );
    assert(
      legacyTaskDetail.afterSale.products?.[0]?.model === 'PETG-175-BLK-1KG',
      'legacy after-sales document did not recover its frozen material identity',
    );

    const sourcePayload = await request(baseUrl, '/sales/orders/SO-20260528-008');
    const sourceOrder = sourcePayload.order;
    const sourceProduct = sourceOrder.products[0];
    const affectedProduct = {
      sourceLineId: sourceProduct.lineId,
      materialCode: sourceProduct.materialCode,
      name: sourceProduct.name,
      model: sourceProduct.model || '',
      spec: sourceProduct.spec || '',
      qty: `1 ${sourceProduct.uom}`,
      uom: sourceProduct.uom,
    };
    const salesAfterSaleReferences = await request(baseUrl, '/reference/sales-orders?kind=after-sales');
    const partialDeliveryReference = salesAfterSaleReferences.items.find((item) => item.code === 'SO-20260712-018');
    assert(partialDeliveryReference, 'partially delivered sales order was missing from after-sales references');
    assert(
      partialDeliveryReference.raw.afterSalesEligibleProducts?.[0]?.qty === '80 卷',
      'sales after-sales reference did not limit the source line to the actual outbound quantity',
    );
    const purchaseAfterSaleReferences = await request(baseUrl, '/reference/purchase-orders?kind=after-sales');
    assert(
      purchaseAfterSaleReferences.items.every((item) => item.raw.purchaseType === '物料采购'),
      'purchase after-sales references leaked asset purchase orders',
    );
    const salesOwnerReferences = await request(baseUrl, '/reference/employees?kind=sales-after-sales-owner');
    const salesDocumentOwnerReferences = await request(baseUrl, '/reference/employees?kind=sales-document-owner');
    const purchaseOwnerReferences = await request(baseUrl, '/reference/employees?kind=purchase-after-sales-owner');
    assert(
      salesOwnerReferences.items.some((item) => item.code === sourceOrder.afterSalesOwnerEmployeeCode)
        && salesOwnerReferences.items.every((item) => item.code !== 'EMP-ZN'),
      'sales after-sales owner reference was not restricted to sales-role employees',
    );
    assert(
      salesDocumentOwnerReferences.items.some((item) => item.code === sourceOrder.afterSalesOwnerEmployeeCode)
        && salesDocumentOwnerReferences.items.every((item) => item.code !== 'EMP-ZN'),
      'sales document owner reference was not restricted to sales-role employees',
    );
    assert(
      purchaseOwnerReferences.items.length === 1 && purchaseOwnerReferences.items[0].code === 'EMP-CC',
      'purchase after-sales owner reference was not restricted to purchase-role employees',
    );
    await expectFailure(
      () => request(baseUrl, '/sales/after-sales', {
        method: 'POST',
        body: {
          code: '系统自动生成',
          sourceOrder: sourceOrder.code,
          issueType: '包装/标签',
          issueDescription: '验证生产角色员工不能被指定为销售售后负责人。',
          owner: '周宁',
          ownerEmployeeCode: 'EMP-ZN',
          products: [affectedProduct],
          attachments: [],
        },
      }),
      '请选择已关联启用销售账号的售后负责人',
    );

    await expectFailure(
      () => request(baseUrl, '/sales/after-sales', {
        method: 'POST',
        body: {
          code: '系统自动生成',
          sourceOrder: sourceOrder.code,
          issueType: '包装/标签',
          owner: sourceOrder.afterSalesOwner,
          ownerEmployeeCode: sourceOrder.afterSalesOwnerEmployeeCode,
          products: [affectedProduct],
          attachments: [],
        },
      }),
      '必须填写问题说明',
    );

    const created = await request(baseUrl, '/sales/after-sales', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        sourceOrder: sourceOrder.code,
        issueType: '包装/标签',
        issueDescription: '客户反馈外箱标签破损，产品本体无异常。',
        owner: sourceOrder.afterSalesOwner,
        ownerEmployeeCode: sourceOrder.afterSalesOwnerEmployeeCode,
        products: [affectedProduct],
        attachments: [],
      },
    });
    assert(created.record.status === '待受理', 'registration did not remain pending acceptance');
    assert(created.record.action === '', 'registration incorrectly required a treatment plan');
    assert(created.record.executionTasks.length === 0, 'registration created tasks before acceptance');
    assert(created.record.products[0].sourceQty, 'source quantity snapshot was not frozen');
    assert(
      created.record.sourceRemark === sourceOrder.supplementaryRequirement
        && created.record.sourceRemark !== sourceOrder.internalNote,
      'sales after-sales did not inherit the execution supplementary requirement or leaked the sales-only order note',
    );

    const forged = await request(baseUrl, `/sales/after-sales/${encodeURIComponent(created.record.code)}`, {
      method: 'PUT',
      body: {
        ...created.record,
        sourceOrder: 'SO-20260617-021',
        customer: '伪造客户',
        products: [{ ...created.record.products[0], qty: '999 卷' }],
      },
    });
    assert(forged.record.sourceOrder === sourceOrder.code, 'source order was mutable');
    assert(forged.record.customer !== '伪造客户', 'customer snapshot was mutable');
    assert(forged.record.products[0].qty === '1 卷', 'affected quantity snapshot was mutable');

    await expectFailure(
      () => request(baseUrl, `/sales/after-sales/${encodeURIComponent(created.record.code)}/advance`, {
        method: 'POST',
        body: { revision: forged.record.revision },
      }),
      '必须先填写处理方案',
    );

    const planned = await request(baseUrl, `/sales/after-sales/${encodeURIComponent(created.record.code)}`, {
      method: 'PUT',
      body: {
        ...forged.record,
        action: '记录并回访',
        goodsDisposition: '无实物退回',
        financialTreatment: '无金额调整',
        amountImpactType: '无金额影响',
        estimatedAmount: 0,
        planNote: '补充标签粘贴说明并完成客户回访。',
      },
    });
    const accepted = await request(baseUrl, `/sales/after-sales/${encodeURIComponent(created.record.code)}/advance`, {
      method: 'POST',
      body: { revision: planned.record.revision },
    });
    assert(accepted.record.status === '处理中', 'planned after-sales was not accepted');
    assert(accepted.record.executionTasks.length === 0, 'follow-up-only plan should not create fake role tasks');

    const resultSaved = await request(baseUrl, `/sales/after-sales/${encodeURIComponent(created.record.code)}`, {
      method: 'PUT',
      body: {
        ...accepted.record,
        processingResult: '已向客户补充标签粘贴说明，客户确认产品可继续使用。',
      },
    });
    const waitingConfirmation = await request(
      baseUrl,
      `/sales/after-sales/${encodeURIComponent(created.record.code)}/advance`,
      {
        method: 'POST',
        body: { revision: resultSaved.record.revision },
      },
    );
    assert(resultSaved.record.processingResult, 'processing result was not persisted');
    assert(waitingConfirmation.record.status === '待确认', 'result was not submitted for confirmation');

    await expectFailure(
      () => request(baseUrl, `/sales/after-sales/${encodeURIComponent(created.record.code)}/advance`, {
        method: 'POST',
        body: { revision: waitingConfirmation.record.revision },
      }),
      '必须先填写客户确认依据',
    );
    const confirmationSaved = await request(baseUrl, `/sales/after-sales/${encodeURIComponent(created.record.code)}`, {
      method: 'PUT',
      body: {
        ...waitingConfirmation.record,
        confirmationNote: '客户于 2026-07-27 通过企业微信确认问题已解决。',
      },
    });
    const closed = await request(baseUrl, `/sales/after-sales/${encodeURIComponent(created.record.code)}/advance`, {
      method: 'POST',
      body: { revision: confirmationSaved.record.revision },
    });
    assert(closed.record.status === '已关闭', 'after-sales did not close after confirmation evidence');

    const seededCase = await request(baseUrl, '/sales/after-sales/SA-20260716-002');
    const protectedTask = seededCase.record.executionTasks.find((task) => task.status !== '已完成');
    assert(protectedTask, 'seeded after-sales did not expose a pending role task');
    await expectFailure(
      () => request(baseUrl, '/sales/after-sales/SA-20260716-002', {
        method: 'PUT',
        body: {
          ...seededCase.record,
          revision: Number(seededCase.record.revision || 1),
          executionTasks: seededCase.record.executionTasks.map((task) => (
            task.code === protectedTask.code
              ? { ...task, status: '已完成', evidence: '销售伪造完成依据' }
              : task
          )),
        },
      }),
      `必须由${protectedTask.module}模块执行`,
    );

    const supplementQueue = await request(baseUrl, '/warehouse/after-sales-tasks');
    const supplementTask = supplementQueue.items.find((task) => (
      task.afterSaleCode === 'SA-20260605-001'
      && task.kind === '补发出库'
      && task.status === '待处理'
    ));
    assert(supplementTask, 'warehouse queue did not expose the seeded supplement outbound task');
    const allocationWarehouseRows = await request(baseUrl, '/master-data/warehouses');
    const saleWarehouseCodes = new Set(allocationWarehouseRows.items
      .filter((row) => row.status === '启用' && (row.warehouseFunctions || []).includes('可销售出库'))
      .map((row) => row.code));
    const supplementInventoryBefore = await request(baseUrl, '/warehouse/inventory');
    const supplementProduct = supplementTask.products[0];
    let allocationRemaining = quantityNumber(supplementProduct.qty);
    const supplementAllocations = supplementInventoryBefore.items
      .filter((row) => (
        row.materialCode === supplementProduct.materialCode
        && saleWarehouseCodes.has(row.warehouseCode)
        && quantityNumber(row.availableNumber ?? row.available) > 0
      ))
      .map((row, index) => {
        const quantity = Math.min(allocationRemaining, quantityNumber(row.availableNumber ?? row.available));
        allocationRemaining = Math.max(0, allocationRemaining - quantity);
        return {
          allocationId: `${supplementTask.code}-A${index + 1}`,
          sourceLineId: supplementProduct.sourceLineId,
          materialCode: supplementProduct.materialCode,
          inventoryKey: row.key,
          warehouseCode: row.warehouseCode,
          warehouse: row.warehouse,
          location: row.location,
          batch: row.batch,
          qty: String(quantity),
          uom: supplementProduct.uom,
        };
      })
      .filter((allocation) => quantityNumber(allocation.qty) > 0);
    assert(allocationRemaining === 0, 'seed inventory could not satisfy the supplement outbound quantity');
    const supplementStarted = await request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(supplementTask.code)}/start`, { method: 'POST' });
    await expectFailure(
      () => request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(supplementTask.code)}/complete`, {
        method: 'POST',
        body: { evidence: '只填任务级仓库，不提交精确分配' },
      }),
      '必须按仓库、库位和批次登记实际库存来源',
    );
    const supplementCompleted = await request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(supplementTask.code)}/complete`, {
      method: 'POST',
      body: {
        actualDate: String(supplementStarted.task.startedAt || '').slice(0, 10),
        allocations: supplementAllocations,
        evidence: '已按仓库、库位和批次完成补发出库',
      },
    });
    assert(
      supplementCompleted.task.status === '已完成'
        && supplementCompleted.task.allocations?.length === supplementAllocations.length
        && supplementCompleted.task.executionRecords?.[0]?.allocations?.length === supplementAllocations.length,
      'supplement outbound did not retain exact allocations in its immutable execution record',
    );
    const supplementInventoryAfter = await request(baseUrl, '/warehouse/inventory');
    supplementAllocations.forEach((allocation) => {
      const beforeRow = supplementInventoryBefore.items.find((row) => row.key === allocation.inventoryKey);
      const afterRow = supplementInventoryAfter.items.find((row) => row.key === allocation.inventoryKey);
      assert(
        Math.abs(
          quantityNumber(beforeRow?.availableNumber ?? beforeRow?.available)
          - quantityNumber(afterRow?.availableNumber ?? afterRow?.available)
          - quantityNumber(allocation.qty),
        ) < 0.0001,
        `supplement outbound did not deduct the selected inventory fact ${allocation.inventoryKey}`,
      );
    });

    const warehouseQueue = await request(baseUrl, '/warehouse/after-sales-tasks');
    const warehouseTask = warehouseQueue.items.find((task) => (
      task.afterSaleCode === 'SA-20260716-002'
      && task.kind === '客户退货接收'
      && task.status === '待处理'
    ));
    assert(warehouseTask, 'warehouse queue did not receive the sales-return task');
    const warehouseRows = await request(baseUrl, '/master-data/warehouses');
    const returnWarehouse = warehouseRows.items.find((row) => (
      row.status === '启用'
      && (row.warehouseFunctions || []).includes('销售退货暂存')
    ));
    assert(returnWarehouse, 'no active sales-return staging warehouse was available');
    await expectFailure(
      () => request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(warehouseTask.code)}/complete`, {
        method: 'POST',
        body: { evidence: '不允许绕过开始作业' },
      }),
      '请先开始',
    );
    await request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(warehouseTask.code)}/start`, {
      method: 'POST',
    });
    const warehouseReceiptAllocations = receiptAllocations(warehouseTask, 'RETURN-SMOKE');
    await expectFailure(
      () => request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(warehouseTask.code)}/complete`, {
        method: 'POST',
        body: {
          warehouseCode: returnWarehouse.code,
          warehouse: returnWarehouse.name,
          location: warehouseLocation(returnWarehouse),
          evidence: '缺少实际退回批次',
        },
      }),
      '必须按物料登记实际批次和数量',
    );
    await expectFailure(
      () => request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(warehouseTask.code)}/complete`, {
        method: 'POST',
        body: {
          warehouseCode: returnWarehouse.code,
          warehouse: returnWarehouse.name,
          location: 'NOT-A-REAL-LOCATION',
          receiptAllocations: warehouseReceiptAllocations,
          evidence: '自由文本库位不应通过',
        },
      }),
      '不属于仓库',
    );
    const warehouseCompleted = await request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(warehouseTask.code)}/complete`, {
      method: 'POST',
      body: {
        warehouseCode: returnWarehouse.code,
        warehouse: returnWarehouse.name,
        location: warehouseLocation(returnWarehouse),
        receiptAllocations: warehouseReceiptAllocations,
        evidence: '客户退货实物已清点并进入售后暂存区',
      },
    });
    assert(
      warehouseCompleted.task.receiptAllocations?.length === warehouseReceiptAllocations.length
        && warehouseCompleted.task.executionRecords?.[0]?.receiptAllocations?.length === warehouseReceiptAllocations.length,
      'customer return receipt did not retain actual batches in its immutable execution record',
    );
    const afterWarehouse = await request(baseUrl, '/sales/after-sales/SA-20260716-002');
    const synchronizedTask = afterWarehouse.record.executionTasks.find((task) => task.code === warehouseTask.code);
    assert(synchronizedTask?.status === '已完成', 'warehouse completion did not synchronize to the sales after-sales case');
    assert(
      afterWarehouse.record.executionTasks.some((task) => task.module === '质检' && task.status === '待处理'),
      'completion did not release the next quality task',
    );

    const qualityQueue = await request(baseUrl, '/quality/after-sales-tasks');
    const qualityTask = qualityQueue.items.find((task) => (
      task.afterSaleCode === 'SA-20260716-002'
      && task.kind === '销售退货检验'
      && task.status === '待处理'
    ));
    assert(qualityTask, 'quality queue did not receive the sales-return inspection');
    await request(baseUrl, `/quality/after-sales-tasks/${encodeURIComponent(qualityTask.code)}/start`, { method: 'POST' });
    await expectFailure(
      () => request(baseUrl, `/quality/after-sales-tasks/${encodeURIComponent(qualityTask.code)}/complete`, {
        method: 'POST',
        body: { disposition: '可再次销售' },
      }),
      '售后检验必须保留检验依据',
    );
    const qualityCompleted = await request(baseUrl, `/quality/after-sales-tasks/${encodeURIComponent(qualityTask.code)}/complete`, {
      method: 'POST',
      body: {
        disposition: '可再次销售',
        evidence: '售后退货检验记录 QAS-SMOKE-001',
      },
    });
    assert(
      qualityCompleted.task.actualDate
        && qualityCompleted.task.executionRecords?.[0]?.actualDate === qualityCompleted.task.actualDate,
      'quality completion did not persist its actual business date in an execution record',
    );

    const warehouseQueueAfterQuality = await request(baseUrl, '/warehouse/after-sales-tasks');
    const dispositionTask = warehouseQueueAfterQuality.items.find((task) => (
      task.afterSaleCode === 'SA-20260716-002'
      && task.kind === '销售退货处置'
      && task.status === '待处理'
    ));
    assert(dispositionTask, 'quality completion did not release warehouse return disposition');
    assert(
      dispositionTask.predecessors?.[0]?.kind === '销售退货检验'
        && dispositionTask.predecessors[0].status === '已完成',
      'warehouse task did not expose a readable predecessor projection',
    );
    const salesWarehouse = warehouseRows.items.find((row) => (
      row.status === '启用'
      && (row.warehouseFunctions || []).includes('可销售出库')
    ));
    assert(salesWarehouse, 'no active sales-issue warehouse was available');
    await request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(dispositionTask.code)}/start`, { method: 'POST' });
    await request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(dispositionTask.code)}/complete`, {
      method: 'POST',
      body: {
        warehouseCode: salesWarehouse.code,
        warehouse: salesWarehouse.name,
        location: warehouseLocation(salesWarehouse),
        evidence: '退货检验合格，已转入可销售库存',
      },
    });

    const afterPhysicalWork = await request(baseUrl, '/sales/after-sales/SA-20260716-002');
    assert(
      afterPhysicalWork.record.executionTasks.every((task) => task.status === '已完成'),
      `physical role task chain did not synchronize all completions to the sales case: ${JSON.stringify(afterPhysicalWork.record.executionTasks)}`,
    );
    assert(
      !afterPhysicalWork.record.executionTasks.some((task) => task.module === '财务'),
      'sales after-sales still generated a finance execution task',
    );
    const afterCommercialResult = await request(baseUrl, '/sales/after-sales/SA-20260716-002', {
      method: 'PUT',
      body: {
        ...afterPhysicalWork.record,
        revision: Number(afterPhysicalWork.record.revision || 1),
        processingResult: '退货已完成，销售已与客户确认退款安排。',
        confirmedAmount: 100,
      },
    });
    assert(
      Number(afterCommercialResult.record.confirmedAmount) === 100,
      'sales did not retain its commercial after-sales result',
    );
    const afterCommercialAdvance = await request(baseUrl, '/sales/after-sales/SA-20260716-002/advance', {
      method: 'POST',
      body: { revision: afterCommercialResult.record.revision },
    });
    assert(afterCommercialAdvance.record.status === '待确认', 'sales commercial result did not advance to customer confirmation');
    await expectFailure(
      () => request(baseUrl, '/sales/after-sales/SA-20260716-002', {
        method: 'PUT',
        body: {
          ...afterCommercialAdvance.record,
          confirmedAmount: 101,
        },
      }),
      '处理结果和确认金额只能在处理中',
    );

    const purchaseCase = await request(baseUrl, '/purchase/after-sales/PA-20260712-001');
    assert(purchaseCase.record.goodsDisposition, 'purchase after-sales lacked a structured goods disposition');
    assert(purchaseCase.record.financialTreatment, 'purchase after-sales lacked a structured financial treatment');
    assert(
      !purchaseCase.record.executionTasks.some((task) => (
        task.kind === '供应商补发收货'
        || task.kind === '补发来料检验'
        || task.kind === '补发正式入库'
      )),
      'purchase replacement still projected the retired parallel after-sales receipt chain',
    );
    assert(
      !purchaseCase.record.executionTasks.some((task) => task.module === '财务'),
      'purchase after-sales still projected finance-owned work',
    );
    if (purchaseCase.record.sourceReceipt || purchaseCase.record.remedyReceipt?.code) {
      const focusedReceiptCodes = new Set([
        purchaseCase.record.sourceReceipt,
        purchaseCase.record.remedyReceipt?.code,
      ].filter(Boolean));
      assert(
        purchaseCase.record.relatedDocuments
          .filter((document) => document.type === '采购收货')
          .every((document) => focusedReceiptCodes.has(document.code)),
        'purchase after-sales related records mixed unrelated receipts from the source order',
      );
    }
    const purchaseInboundQueue = await request(baseUrl, '/warehouse/purchase-receipts');
    const seededUnifiedRemedyReceipt = purchaseInboundQueue.items.find((receipt) => (
      receipt.sourceType === 'purchase_after_sale'
      && receipt.sourceAfterSale === purchaseCase.record.code
      && receipt.status === '待收货'
    ));
    assert(seededUnifiedRemedyReceipt, 'active purchase replacement did not migrate to the unified purchase inbound queue');
    assert(
      purchaseCase.record.financialTreatment !== '付款暂缓'
        || purchaseCase.record.amountImpactType === '无金额影响',
      'purchase payment hold was not kept as a purchase-owned commercial treatment',
    );

    const rejectedPurchaseOrderPayload = await request(
      baseUrl,
      `/purchase/orders/${encodeURIComponent(purchaseCase.record.sourceOrder)}`,
    );
    const rejectedPurchaseOrder = rejectedPurchaseOrderPayload.order;
    const rejectedPurchaseProduct = rejectedPurchaseOrder.products[0];
    const rejectedPurchaseCreated = await request(baseUrl, '/purchase/after-sales', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        sourceOrder: rejectedPurchaseOrder.code,
        issueType: '来料质量',
        issueDescription: '供应商补发物料到货后复检仍不合格，需要从采购暂存区原路退回供应商。',
        owner: rejectedPurchaseOrder.afterSalesOwner,
        ownerEmployeeCode: rejectedPurchaseOrder.afterSalesOwnerEmployeeCode,
        products: [{
          sourceLineId: rejectedPurchaseProduct.lineId,
          materialCode: rejectedPurchaseProduct.materialCode,
          name: rejectedPurchaseProduct.name,
          model: rejectedPurchaseProduct.model || '',
          spec: rejectedPurchaseProduct.spec || '',
          qty: `1 ${rejectedPurchaseProduct.uom}`,
          uom: rejectedPurchaseProduct.uom,
        }],
        attachments: [],
      },
    });
    const rejectedPurchasePlanned = await request(
      baseUrl,
      `/purchase/after-sales/${encodeURIComponent(rejectedPurchaseCreated.record.code)}`,
      {
        method: 'PUT',
        body: {
          ...rejectedPurchaseCreated.record,
          action: '要求补发',
          goodsDisposition: '供应商补发到货',
          financialTreatment: '无金额调整',
          amountImpactType: '无金额影响',
          estimatedAmount: 0,
          planNote: '补发到货后按来料标准复检，不合格则由仓库直接退回供应商。',
        },
      },
    );
    const rejectedPurchaseAccepted = await request(
      baseUrl,
      `/purchase/after-sales/${encodeURIComponent(rejectedPurchasePlanned.record.code)}/advance`,
      {
        method: 'POST',
        body: { revision: rejectedPurchasePlanned.record.revision },
      },
    );
    const rejectedPurchaseCode = rejectedPurchaseAccepted.record.code;
    const replacementInboundQueue = await request(baseUrl, '/warehouse/purchase-receipts');
    const replacementInboundTask = replacementInboundQueue.items.find((receipt) => (
      receipt.sourceType === 'purchase_after_sale'
      && receipt.sourceAfterSale === rejectedPurchaseCode
      && receipt.status === '待收货'
    ));
    assert(replacementInboundTask, 'accepted supplier replacement did not create a unified purchase inbound task');
    assert(
      !rejectedPurchaseAccepted.record.executionTasks.some((task) => (
        task.afterSaleCode === rejectedPurchaseCode
        && ['供应商补发收货', '补发来料检验', '补发正式入库'].includes(task.kind)
      )),
      'accepted supplier replacement retained the retired parallel receipt chain',
    );

    const holdOrderPayload = await request(baseUrl, '/purchase/orders/PO-20260716-005');
    const holdOrder = holdOrderPayload.order;
    const holdProduct = holdOrder.products[0];
    const holdCaseCreated = await request(baseUrl, '/purchase/after-sales', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        sourceOrder: holdOrder.code,
        issueType: '交付延期',
        issueDescription: '供应商交付异常，采购申请在问题澄清前暂停付款。',
        owner: holdOrder.afterSalesOwner,
        ownerEmployeeCode: holdOrder.afterSalesOwnerEmployeeCode,
        products: [{
          sourceLineId: holdProduct.lineId,
          materialCode: holdProduct.materialCode,
          name: holdProduct.name,
          model: holdProduct.model || '',
          spec: holdProduct.spec || '',
          qty: `1 ${holdProduct.uom}`,
          uom: holdProduct.uom,
        }],
        attachments: [],
      },
    });
    assert(holdCaseCreated.record.action === '', 'purchase registration accepted a treatment plan too early');
    const holdCasePlanned = await request(baseUrl, `/purchase/after-sales/${encodeURIComponent(holdCaseCreated.record.code)}`, {
      method: 'PUT',
      body: {
        ...holdCaseCreated.record,
        action: '记录并跟进',
        goodsDisposition: '无实物流转',
        financialTreatment: '付款暂缓',
        amountImpactType: '无金额影响',
        planNote: '供应商澄清并经采购确认后，由采购更新付款跟进。',
      },
    });
    const holdCaseAccepted = await request(
      baseUrl,
      `/purchase/after-sales/${encodeURIComponent(holdCaseCreated.record.code)}/advance`,
      {
        method: 'POST',
        body: { revision: holdCasePlanned.record.revision },
      },
    );
    assert(
      holdCaseAccepted.record.executionTasks.length === 0,
      'purchase payment hold incorrectly created a cross-module execution task',
    );
    const holdCaseResult = await request(baseUrl, `/purchase/after-sales/${encodeURIComponent(holdCaseCreated.record.code)}`, {
      method: 'PUT',
      body: {
        ...holdCaseAccepted.record,
        processingResult: '采购已暂停后续付款跟进，待供应商澄清交付计划后再恢复。',
        confirmedAmount: 0,
      },
    });
    assert(
      holdCaseResult.record.processingResult.includes('采购已暂停'),
      'purchase-owned payment hold result was not retained',
    );

    const repairOrderPayload = await request(baseUrl, '/sales/orders/SO-20260712-018');
    const repairOrder = repairOrderPayload.order;
    const repairProduct = repairOrder.products[0];
    const repairCreated = await request(baseUrl, '/sales/after-sales', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        sourceOrder: repairOrder.code,
        issueType: '质量问题',
        issueDescription: '自动化返修闭环测试：客户退回两卷物料，返修并复检合格后重新交付。',
        owner: repairOrder.afterSalesOwner,
        ownerEmployeeCode: repairOrder.afterSalesOwnerEmployeeCode,
        products: [{
          sourceLineId: repairProduct.lineId,
          materialCode: repairProduct.materialCode,
          name: repairProduct.name,
          model: repairProduct.model || '',
          spec: repairProduct.spec || '',
          qty: `2 ${repairProduct.uom}`,
          uom: repairProduct.uom,
        }],
        attachments: [],
      },
    });
    const repairPlanned = await request(baseUrl, `/sales/after-sales/${encodeURIComponent(repairCreated.record.code)}`, {
      method: 'PUT',
      body: {
        ...repairCreated.record,
        action: '返修/返工',
        goodsDisposition: '客户退回待检',
        financialTreatment: '无金额调整',
        amountImpactType: '无金额影响',
        estimatedAmount: 0,
        planNote: '客户退回，质检判定返修，生产返修完成后复检，合格后仓库返还客户。',
      },
    });
    const repairAccepted = await request(
      baseUrl,
      `/sales/after-sales/${encodeURIComponent(repairCreated.record.code)}/advance`,
      {
        method: 'POST',
        body: { revision: repairPlanned.record.revision },
      },
    );
    const repairCode = repairAccepted.record.code;
    const repairReceiptTask = repairAccepted.record.executionTasks.find((task) => task.kind === '客户退货接收');
    assert(repairReceiptTask?.status === '待处理', 'repair flow did not release customer return receipt');
    const repairReceiptNotifications = await request(baseUrl, '/notifications?limit=200');
    assert(
      repairReceiptNotifications.items.some((row) => (
        row.code === `NTF-${repairReceiptTask.code}`
        && row.action === '售后任务生成'
        && row.sourceDoc === repairReceiptTask.code
        && row.sourcePath === repairReceiptTask.path
      )),
      'dynamically created warehouse after-sales task notification was not persisted',
    );
    await request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(repairReceiptTask.code)}/start`, { method: 'POST' });
    await request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(repairReceiptTask.code)}/complete`, {
      method: 'POST',
      body: {
        warehouseCode: returnWarehouse.code,
        warehouse: returnWarehouse.name,
        location: warehouseLocation(returnWarehouse),
        receiptAllocations: receiptAllocations(repairReceiptTask, 'REPAIR-SMOKE'),
        evidence: '返修闭环测试退货接收记录',
      },
    });
    const repairQualityQueue = await request(baseUrl, '/quality/after-sales-tasks');
    const repairInspectionTask = repairQualityQueue.items.find((task) => (
      task.afterSaleCode === repairCode
      && task.kind === '销售退货检验'
      && task.status === '待处理'
    ));
    assert(repairInspectionTask, 'repair flow did not release initial quality inspection');
    const repairInspectionNotifications = await request(baseUrl, '/notifications?limit=200');
    assert(
      repairInspectionNotifications.items.some((row) => (
        row.code === `NTF-${repairInspectionTask.code}`
        && row.action === '售后任务生成'
        && row.sourceDoc === repairInspectionTask.code
        && row.sourcePath === repairInspectionTask.path
      )),
      'next-step quality after-sales task notification was not persisted',
    );
    await request(baseUrl, `/quality/after-sales-tasks/${encodeURIComponent(repairInspectionTask.code)}/start`, { method: 'POST' });
    await request(baseUrl, `/quality/after-sales-tasks/${encodeURIComponent(repairInspectionTask.code)}/complete`, {
      method: 'POST',
      body: {
        disposition: '返修返工',
        evidence: 'QAS-REPAIR-SMOKE-01',
      },
    });
    const repairProductionQueue = await request(baseUrl, '/production/after-sales-tasks');
    const repairProductionTask = repairProductionQueue.items.find((task) => (
      task.afterSaleCode === repairCode
      && task.kind === '售后返修或返工'
      && task.status === '待处理'
    ));
    assert(repairProductionTask, 'repair flow did not release production repair');
    assert(
      repairProductionTask.caseIssueType === '质量问题'
      && repairProductionTask.caseIssueDescription === '自动化返修闭环测试：客户退回两卷物料，返修并复检合格后重新交付。',
      'production repair queue did not expose the frozen after-sales problem basis',
    );
    assert(
      repairProductionTask.predecessors?.[0]?.disposition === '返修返工'
      && repairProductionTask.predecessors[0].evidence === 'QAS-REPAIR-SMOKE-01',
      'production repair queue did not expose the completed inspection conclusion and evidence',
    );
    const repairProductionStarted = await request(baseUrl, `/production/after-sales-tasks/${encodeURIComponent(repairProductionTask.code)}/start`, { method: 'POST' });
    const repairStartedDate = String(repairProductionStarted.task.startedAt || '').slice(0, 10);
    await expectFailure(
      () => request(baseUrl, `/production/after-sales-tasks/${encodeURIComponent(repairProductionTask.code)}/complete`, {
        method: 'POST',
        body: { actualDate: repairStartedDate },
      }),
      '返修记录号或返修备注',
    );
    const repairBackdatedDate = new Date(`${repairStartedDate}T00:00:00Z`);
    repairBackdatedDate.setUTCDate(repairBackdatedDate.getUTCDate() - 1);
    await expectFailure(
      () => request(baseUrl, `/production/after-sales-tasks/${encodeURIComponent(repairProductionTask.code)}/complete`, {
        method: 'POST',
        body: {
          actualDate: repairBackdatedDate.toISOString().slice(0, 10),
          evidence: 'PAR-REPAIR-BACKDATED',
        },
      }),
      '实际作业日期不能早于任务开始日期',
    );
    const repairProductionCompleted = await request(baseUrl, `/production/after-sales-tasks/${encodeURIComponent(repairProductionTask.code)}/complete`, {
      method: 'POST',
      body: {
        evidence: 'PAR-REPAIR-SMOKE-01',
        note: '完成返绕和外观整理，提交复检。',
      },
    });
    assert(
      repairProductionCompleted.task.completedBy
      && !repairProductionCompleted.task.completedBy.includes('ACC-'),
      'after-sales business projection exposed a technical account code',
    );
    const repairReinspectionQueue = await request(baseUrl, '/quality/after-sales-tasks');
    const repairReinspectionTask = repairReinspectionQueue.items.find((task) => (
      task.afterSaleCode === repairCode
      && task.kind === '返修品复检'
      && task.status === '待处理'
    ));
    assert(repairReinspectionTask, 'production completion did not release repaired-item reinspection');
    await request(baseUrl, `/quality/after-sales-tasks/${encodeURIComponent(repairReinspectionTask.code)}/start`, { method: 'POST' });
    await request(baseUrl, `/quality/after-sales-tasks/${encodeURIComponent(repairReinspectionTask.code)}/complete`, {
      method: 'POST',
      body: {
        disposition: '合格',
        evidence: 'QAS-REPAIR-SMOKE-02',
      },
    });
    const repairOutboundQueue = await request(baseUrl, '/warehouse/after-sales-tasks');
    const repairOutboundTask = repairOutboundQueue.items.find((task) => (
      task.afterSaleCode === repairCode
      && task.kind === '返修品出库'
      && task.status === '待处理'
    ));
    assert(repairOutboundTask, 'reinspection completion did not release repaired-item outbound');
    await request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(repairOutboundTask.code)}/start`, { method: 'POST' });
    await request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(repairOutboundTask.code)}/complete`, {
      method: 'POST',
      body: { evidence: 'OUT-REPAIR-SMOKE-01' },
    });
    const repairClosedLoop = await request(baseUrl, `/sales/after-sales/${encodeURIComponent(repairCode)}`);
    assert(
      repairClosedLoop.record.executionTasks.every((task) => task.status === '已完成'),
      'repair flow did not complete customer return, repair, reinspection, and outbound as one closed loop',
    );
    assert(
      repairClosedLoop.record.executionTasks.every((task) => !String(task.completedBy || '').includes('ACC-')),
      'after-sales closed-loop projection exposed technical account codes',
    );

    const dynamicBranchCreated = await request(baseUrl, '/sales/after-sales', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        sourceOrder: repairOrder.code,
        issueType: '质量问题',
        issueDescription: '自动化动态分支测试：商务方案为退货退款，实物检验后确认可以返修再入库。',
        owner: repairOrder.afterSalesOwner,
        ownerEmployeeCode: repairOrder.afterSalesOwnerEmployeeCode,
        products: [{
          sourceLineId: repairProduct.lineId,
          materialCode: repairProduct.materialCode,
          name: repairProduct.name,
          model: repairProduct.model || '',
          spec: repairProduct.spec || '',
          qty: `1 ${repairProduct.uom}`,
          uom: repairProduct.uom,
        }],
        attachments: [],
      },
    });
    const dynamicBranchPlanned = await request(
      baseUrl,
      `/sales/after-sales/${encodeURIComponent(dynamicBranchCreated.record.code)}`,
      {
        method: 'PUT',
        body: {
          ...dynamicBranchCreated.record,
          action: '退货退款',
          goodsDisposition: '客户退回待检',
          financialTreatment: '退款',
          amountImpactType: '退款',
          estimatedAmount: 69,
          planNote: '商务退款与退回物后续物理处置分别管理。',
        },
      },
    );
    const dynamicBranchAccepted = await request(
      baseUrl,
      `/sales/after-sales/${encodeURIComponent(dynamicBranchCreated.record.code)}/advance`,
      { method: 'POST', body: { revision: dynamicBranchPlanned.record.revision } },
    );
    const dynamicReceiptTask = dynamicBranchAccepted.record.executionTasks.find((task) => task.kind === '客户退货接收');
    await request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(dynamicReceiptTask.code)}/start`, { method: 'POST' });
    await request(baseUrl, `/warehouse/after-sales-tasks/${encodeURIComponent(dynamicReceiptTask.code)}/complete`, {
      method: 'POST',
      body: {
        warehouseCode: returnWarehouse.code,
        warehouse: returnWarehouse.name,
        location: warehouseLocation(returnWarehouse),
        receiptAllocations: receiptAllocations(dynamicReceiptTask, 'DYNAMIC-BRANCH'),
        evidence: '动态分支退货接收记录',
      },
    });
    const dynamicQualityQueue = await request(baseUrl, '/quality/after-sales-tasks');
    const dynamicInspectionTask = dynamicQualityQueue.items.find((task) => (
      task.afterSaleCode === dynamicBranchCreated.record.code
      && task.kind === '销售退货检验'
      && task.status === '待处理'
    ));
    assert(dynamicInspectionTask, 'commercial return plan did not release independent sales-return inspection');
    await request(baseUrl, `/quality/after-sales-tasks/${encodeURIComponent(dynamicInspectionTask.code)}/start`, { method: 'POST' });
    await request(baseUrl, `/quality/after-sales-tasks/${encodeURIComponent(dynamicInspectionTask.code)}/complete`, {
      method: 'POST',
      body: { disposition: '返修返工', evidence: 'QAS-DYNAMIC-BRANCH-01' },
    });
    const dynamicBranchCase = await request(
      baseUrl,
      `/sales/after-sales/${encodeURIComponent(dynamicBranchCreated.record.code)}`,
    );
    assert(
      dynamicBranchCase.record.salesReturnQualityDisposition === '返修返工',
      'sales-return quality result was not retained independently from the commercial plan',
    );
    assert(
      dynamicBranchCase.record.executionTasks.some((task) => task.kind === '售后返修或返工' && task.status === '待处理'),
      'return-refund plan did not dynamically branch to production after a repairable quality result',
    );
    assert(
      !dynamicBranchCase.record.executionTasks.some((task) => task.kind === '销售退货处置'),
      'obsolete ordinary return disposition remained active after the quality result changed the physical branch',
    );

    console.log('After-sales smoke passed (eligible source quantities, role-owned physical tasks, independent quality branching, exact warehouse/location/batch allocations, stock synchronization, repair/reinspection/outbound, unified purchase remedy inbound, and owner-recorded commercial results).');
  } catch (error) {
    if (logs.trim()) console.error(logs.trim());
    throw error;
  } finally {
    child.kill();
    await rm(tempDir, { recursive: true, force: true });
  }
}

await main();
