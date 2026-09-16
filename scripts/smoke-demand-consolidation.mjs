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

async function request(baseUrl, path, { account = 'ACC-ZHANGSAN', ...options } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'x-filatrix-account': account,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) break;
    const result = await request(baseUrl, '/health').catch(() => null);
    if (result?.response.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('isolated API did not become healthy');
}

function purchaseRequisition(code, requester, quantity, expectedDate) {
  return {
    code,
    companyCode: 'COM-FILATRIX',
    company: 'Filatrix 增材材料有限公司',
    documentStatus: '已提交',
    purchaseType: '物料采购',
    sourceType: '手工申请',
    department: '生产管理部',
    requester,
    reason: '采购建议归并回归测试',
    products: [{
      lineId: 'L1',
      materialCode: 'M-CM-MATTE-BLK',
      name: '哑光黑色母',
      qty: `${quantity} kg`,
      uom: 'kg',
    }],
    status: '已提交',
    date: '2026-08-06',
    expectedDate,
    attachments: [],
  };
}

function productionTask(code, quantity, dueDate, sourceCode) {
  return {
    code,
    sourceType: '销售订单缺口',
    sourceCode,
    source: sourceCode,
    sourceLineId: 'L1',
    createdAt: '2026-08-06 09:00',
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    demandQty: quantity,
    productionQty: quantity,
    unit: '卷',
    deliveryDate: dueDate,
    priority: '正常',
    status: '待建工单',
    documentStatus: '已确认',
    recipeCode: 'BOM-PLA-175-MBK-V1',
    materialNeeds: [],
    products: [{
      lineId: 'L1',
      sourceLineId: 'L1',
      productCode: 'M-FG-PLA-175-MBK',
      productName: 'PLA 1.75mm 哑光黑耗材 1kg',
      qty: quantity,
      demandQty: quantity,
      productionQty: quantity,
      unit: '卷',
      recipeCode: 'BOM-PLA-175-MBK-V1',
    }],
    ownerEmployeeCode: 'EMP-ZN',
    owner: '周宁',
    revision: 1,
  };
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'filatrix-demand-consolidation-'));
  const dataFile = join(tempDir, 'erp-data.json');
  const data = createSeedData();
  data.purchase.requisitions = data.purchase.requisitions.filter((requisition) => (
    !requisition.products?.some((product) => product.materialCode === 'M-CM-MATTE-BLK')
  ));
  data.purchase.requisitions.push(
    purchaseRequisition('PR-CONSOLIDATE-001', '周宁', 12, '2026-08-12'),
    purchaseRequisition('PR-CONSOLIDATE-002', '林洁', 18, '2026-08-10'),
  );
  data.production.tasks = [
    productionTask('PT-CONSOLIDATE-001', 30, '2026-08-11', 'SO-CONSOLIDATE-001'),
    productionTask('PT-CONSOLIDATE-002', 20, '2026-08-13', 'SO-CONSOLIDATE-002'),
  ];
  await writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8');

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

    const suggestionsResult = await request(baseUrl, '/purchase/suggestions');
    assert(suggestionsResult.response.ok, 'purchase suggestions should load');
    const suggestion = suggestionsResult.payload.items.find((candidate) => (
      candidate.materialCode === 'M-CM-MATTE-BLK'
      && candidate.sources.some((source) => source.requisitionCode === 'PR-CONSOLIDATE-001')
    ));
    assert(suggestion?.demandQty === 30, 'same material demand should be consolidated without inflating original demand');
    assert(suggestion?.orderedQty === 0 && suggestion?.openQty === 30, 'suggestion should separate ordered and open demand quantities');
    assert(suggestion?.supplierStatus === 'available' && suggestion?.supplierCount === 2, 'suggestion should expose all supplier candidates without choosing one');
    const primaryCandidate = suggestion?.suppliers.find((supplier) => supplier.supplierCode === 'SUP-SZCS');
    const alternateCandidate = suggestion?.suppliers.find((supplier) => supplier.supplierCode === 'SUP-NBCM');
    assert(primaryCandidate?.referenceOrderQty === 50 && primaryCandidate?.referenceSupplementQty === 20, 'each supplier should calculate its own MOQ reference');
    assert(alternateCandidate?.referenceOrderQty === 30 && alternateCandidate?.referenceSupplementQty === 0, 'a lower-MOQ supplier should retain open demand without extra stock');
    assert(!('recommendedSupplierCode' in suggestion) && !('recommendationStatus' in suggestion), 'purchase suggestions must not expose a preferred supplier decision');
    assert(suggestion?.sources.some((source) => source.requisitionCode === 'PR-CONSOLIDATE-001'), 'first demand source should be retained');
    assert(suggestion?.sources.some((source) => source.requisitionCode === 'PR-CONSOLIDATE-002'), 'second demand source should be retained');

    const directConversionResult = await request(baseUrl, '/purchase/suggestions/create-order', {
      method: 'POST',
      body: { materialKey: suggestion.key },
    });
    assert(directConversionResult.response.status === 410, 'read-only suggestions must not create purchase orders directly');

    const workOrderBody = {
      sourceTask: 'PT-CONSOLIDATE-001',
      sourceDocument: 'SO-CONSOLIDATE-001',
      sourceLineId: 'L1',
      sourceAllocations: [
        { taskCode: 'PT-CONSOLIDATE-001', sourceLineId: 'L1', sourceDocument: 'CLIENT-FAKE', productCode: 'M-FG-PLA-175-MBK', productName: 'CLIENT-FAKE', quantity: 30, unit: '卷', dueDate: '2099-12-31' },
        { taskCode: 'PT-CONSOLIDATE-002', sourceLineId: 'L1', sourceDocument: 'SO-CONSOLIDATE-002', productCode: 'M-FG-PLA-175-MBK', productName: 'PLA 1.75mm 哑光黑耗材 1kg', quantity: 20, unit: '卷', dueDate: '2026-08-13' },
      ],
      productCode: 'M-FG-PLA-175-MBK',
      productName: 'PLA 1.75mm 哑光黑耗材 1kg',
      planQty: 50,
      unit: '卷',
      recipeCode: 'BOM-PLA-175-MBK-V1',
      processTemplateCode: 'PRC2-WIRE-DRAWING-REWIND-V1',
      plannedDate: '2026-08-07',
      dueDate: '2026-08-11',
      ownerEmployeeCode: 'EMP-ZN',
      owner: '周宁',
      note: '多任务合并工单回归测试',
      materialNeeds: [],
      command: 'save',
      revision: 0,
      idempotencyKey: 'smoke-demand-consolidation-work-order',
    };
    const workOrderResult = await request(baseUrl, '/production/work-orders', {
      account: 'ACC-PRODUCTION',
      method: 'POST',
      body: workOrderBody,
    });
    assert(workOrderResult.response.ok, `combined work order creation failed: ${workOrderResult.payload.error || ''}`);
    assert(workOrderResult.payload.record.sourceAllocations.length === 2, 'work order should retain two task allocations');
    assert(workOrderResult.payload.record.planQty === 50, 'work order plan should equal allocation total');
    const canonicalFirstAllocation = workOrderResult.payload.record.sourceAllocations.find((allocation) => allocation.taskCode === 'PT-CONSOLIDATE-001');
    assert(canonicalFirstAllocation?.sourceDocument === 'SO-CONSOLIDATE-001', 'work order should canonicalize the source document from the task');
    assert(canonicalFirstAllocation?.productName !== 'CLIENT-FAKE', 'work order should canonicalize the source product identity from the task line');
    assert(canonicalFirstAllocation?.dueDate === '2026-08-11', 'work order should canonicalize the source due date from the task');

    const overflowResult = await request(baseUrl, '/production/work-orders', {
      account: 'ACC-PRODUCTION',
      method: 'POST',
      body: {
        ...workOrderBody,
        planQty: 1,
        sourceAllocations: [{ ...workOrderBody.sourceAllocations[0], quantity: 1 }],
        idempotencyKey: 'smoke-demand-consolidation-overflow',
      },
    });
    assert(overflowResult.response.status === 409, 'exhausted task demand should reject a second work order');

    console.log('demand consolidation smoke passed');
  } catch (error) {
    if (logs) console.error(logs);
    throw error;
  } finally {
    child.kill();
    await rm(tempDir, { recursive: true, force: true });
  }
}

await main();
