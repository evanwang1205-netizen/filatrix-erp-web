import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function shanghaiDate(offsetDays = 0) {
  return new Date(Date.now() + (8 * 60 * 60 + offsetDays * 24 * 60 * 60) * 1000).toISOString().slice(0, 10);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function requestResult(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function request(baseUrl, path, options = {}) {
  const { response, payload } = await requestResult(baseUrl, path, options);
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path}: HTTP ${response.status} ${payload.error || ''}`.trim());
  }

  return payload;
}

async function waitForHealth(baseUrl, child) {
  const errors = [];
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const data = await request(baseUrl, '/health');
      if (data.ok) return;
    } catch (error) {
      errors.push(error.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`API did not become healthy. ${errors.slice(-3).join(' | ')}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseMoney(value) {
  return Number(String(value || '').replace(/[^\d.-]/g, '')) || 0;
}

function inventoryRow(payload, receipt, materialCode) {
  const batch = receipt.products.find((product) => product.materialCode === materialCode)?.batch;
  return (payload.items || payload.inventory || []).find((row) => (
    row.materialCode === materialCode
    && row.warehouseCode === receipt.warehouseCode
    && (!batch || row.batch === batch)
  ));
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'filatrix-flow-'));
  const dataFile = join(tempDir, 'erp-data.json');
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const runId = String(port);
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
      FILATRIX_API_HOST: '127.0.0.1',
      FILATRIX_API_PORT: String(port),
      FILATRIX_DATA_FILE: dataFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  try {
    await waitForHealth(baseUrl, child);

    const productionRuntimeProjection = await request(baseUrl, '/production/work-orders', {
      headers: { 'x-filatrix-account': 'ACC-PRODUCTION' },
    });
    assert(
      Array.isArray(productionRuntimeProjection.qualityTasks)
        && productionRuntimeProjection.qualityTasks.some((item) => item.code === 'QC2-260630-003'),
      'production runtime did not project linked quality tasks for visible work orders',
    );
    const blockedBatchProjection = await request(baseUrl, '/production/execution-cards/EC2-260630-006', {
      headers: { 'x-filatrix-account': 'ACC-PRODUCTION' },
    });
    assert(
      blockedBatchProjection.qualityTasks.some(
        (item) => item.code === 'QC2-260630-003' && item.dispositionStatus === '待处置',
      ),
      'quality-blocked production batch lost its current disposition handoff',
    );
    const productionQualityListDenied = await requestResult(baseUrl, '/quality/production', {
      headers: { 'x-filatrix-account': 'ACC-PRODUCTION' },
    });
    assert(
      productionQualityListDenied.response.status === 403,
      'production quality projection accidentally granted the full quality module permission',
    );
    const partialInboundBatchProjection = await request(baseUrl, '/production/execution-cards/EC2-260701-001', {
      headers: { 'x-filatrix-account': 'ACC-PRODUCTION' },
    });
    assert(
      partialInboundBatchProjection.reports.some((item) => item.code === 'PRPT2-260701-001')
        && partialInboundBatchProjection.qualityTasks.some((item) => item.code === 'QC2-260701-003')
        && partialInboundBatchProjection.qualityTasks.some((item) => item.code === 'QC2-260701-004')
        && partialInboundBatchProjection.packagingRecords.some((item) => item.code === 'PPK2-260701-001')
        && partialInboundBatchProjection.productionReceipts.some((item) => item.code === 'WPR2-20260701-001'),
      'partial inbound production batch lost its report-quality-packaging-receipt history chain',
    );

    const planningTaskBody = {
      command: 'submit',
      code: 'PT2-FLOW-TASK',
      revision: 0,
      idempotencyKey: 'flow:production-task:create:1',
      sourceType: '销售订单缺口',
      sourceCode: 'SO-FLOW-001',
      sourceLineId: 'L1',
      deliveryDate: shanghaiDate(7),
      ownerEmployeeCode: 'EMP-ZN',
      owner: '周宁',
      products: [{
        lineId: 'PT2-FLOW-TASK-L1',
        productCode: 'M-FG-PLA-175-MBK',
        productName: 'PLA 1.75mm 哑光黑耗材 1kg',
        demandQty: 20000,
        unit: '卷',
        recipeCode: 'BOM-PLA-175-MBK-V1',
      }],
      materialNeeds: [{
        lineId: 'PT2-FLOW-TASK-M1',
        materialCode: 'M-RM-PLA-VIRGIN',
        materialName: 'PLA 原生粒子',
        estimatedQty: 20000,
        availableQty: 0,
        shortageQty: 20000,
        procurementGapQty: 20000,
        unit: 'kg',
      }],
    };
    const planningTask = await request(baseUrl, '/production/tasks', {
      method: 'POST',
      body: planningTaskBody,
    });
    assert(planningTask.record.sourceLineId === 'L1', 'production task lost its sales-order source line');
    const planningTaskPlaNeed = planningTask.record.materialNeeds.find(
      (line) => line.materialCode === 'M-RM-PLA-VIRGIN',
    );
    assert(planningTask.record.materialNeeds.length === 3, 'production task did not derive every material from its enabled recipe');
    assert(
      planningTaskPlaNeed?.estimatedQty > 0
        && planningTaskPlaNeed.estimatedQty !== planningTaskBody.materialNeeds[0].estimatedQty
        && planningTaskPlaNeed.procurementGapQty > 0,
      'production task trusted the forged client material plan or failed to calculate a real procurement gap',
    );
    const repeatedPlanningTask = await request(baseUrl, '/production/tasks', {
      method: 'POST',
      body: planningTaskBody,
    });
    assert(repeatedPlanningTask.repeated === true, 'production task create retry was not idempotent');
    assert(repeatedPlanningTask.record.code === planningTask.record.code, 'production task create retry returned another record');

    let confirmedTaskDowngradeBlocked = false;
    try {
      await request(baseUrl, '/production/tasks/PT2-FLOW-TASK', {
        method: 'PUT',
        body: { ...planningTask.record, command: 'save', idempotencyKey: 'flow:production-task:downgrade:1' },
      });
    } catch (error) {
      confirmedTaskDowngradeBlocked = String(error).includes('不能重新保存为草稿');
    }
    assert(confirmedTaskDowngradeBlocked, 'confirmed production task could be downgraded to draft');

    const taskOwnerChange = await request(baseUrl, '/production/tasks/PT2-FLOW-TASK', {
      method: 'PUT',
      body: {
        ...planningTask.record,
        command: 'submit',
        sourceCode: 'SO-MALICIOUS',
        sourceLineId: 'L9',
        ownerEmployeeCode: 'EMP-ZS',
        owner: '张三',
        idempotencyKey: 'flow:production-task:update:1',
      },
    });
    assert(taskOwnerChange.record.owner === '张三' && taskOwnerChange.record.ownerEmployeeCode === 'EMP-ZS', 'production task responsibility change was not saved');
    assert(taskOwnerChange.record.sourceCode === 'SO-FLOW-001' && taskOwnerChange.record.sourceLineId === 'L1', 'production task source facts were rewritten during a change');

    const submittedMaterialRequestBody = {
      command: 'submit',
      code: 'PMR2-FLOW-TASK',
      revision: 0,
      idempotencyKey: 'flow:production-material-request:create:1',
      requestType: '缺料申请',
      sourceTaskCode: 'PT2-FLOW-TASK',
      sourceDocument: 'SO-FLOW-001 / L1',
      department: '生产部',
      requester: '生产计划',
      requestDate: shanghaiDate(),
      expectedDate: shanghaiDate(-1),
      lines: [{
        lineId: 'PMR2-FLOW-TASK-L1',
        materialCode: 'M-RM-PLA-VIRGIN',
        materialName: 'PLA 原生粒子',
        requestedQty: planningTaskPlaNeed.procurementGapQty,
        purchaseQty: planningTaskPlaNeed.procurementGapQty,
        unit: 'kg',
      }],
    };
    const submittedMaterialRequest = await request(baseUrl, '/production/material-requests', {
      method: 'POST',
      body: submittedMaterialRequestBody,
    });
    const repeatedMaterialRequest = await request(baseUrl, '/production/material-requests', {
      method: 'POST',
      body: submittedMaterialRequestBody,
    });
    assert(repeatedMaterialRequest.repeated === true, 'production material-request create retry was not idempotent');
    assert(repeatedMaterialRequest.record.code === submittedMaterialRequest.record.code, 'material-request create retry returned another record');

    assert(submittedMaterialRequest.record.status === '已转采购', 'material-request submission did not automatically route the inventory gap to procurement');
    assert(submittedMaterialRequest.record.requestType === '任务缺口补料', 'task-driven material request did not normalize to the fixed request type');
    assert(
      submittedMaterialRequest.record.lines[0].availableQty === 0
        && submittedMaterialRequest.record.lines[0].taskAvailableQty > 0
        && submittedMaterialRequest.record.lines[0].purchaseQty === planningTaskPlaNeed.procurementGapQty,
      'task shortage routing did not preserve the gross availability evidence and the net purchase gap',
    );
    assert(
      submittedMaterialRequest.record.inventoryEvaluationBasis === '任务当前采购缺口快照（已扣除已分配、可用、待检、待入库和在途；不预留、不占用）',
      'automatic task-gap evaluation did not disclose its net, non-reserving planning basis',
    );
    assert(submittedMaterialRequest.purchaseRequisition?.status === '待采购受理', 'automatic shortage routing did not create a submitted purchase requisition');
    assert(
      submittedMaterialRequest.purchaseRequisition?.sourceMaterialRequest === 'PMR2-FLOW-TASK',
      'generated purchase requisition lost its material-request source',
    );
    assert(
      submittedMaterialRequest.purchaseRequisition?.sourceType === '生产任务缺口'
        && submittedMaterialRequest.purchaseRequisition?.sourceProductionTask === 'PT2-FLOW-TASK',
      'generated purchase requisition lost its production demand origin',
    );
    assert(
      submittedMaterialRequest.purchaseRequisition?.sourceExpectedDate === shanghaiDate(-1),
      'generated purchase requisition lost the overdue source demand date',
    );
    assert(
      submittedMaterialRequest.purchaseRequisition?.expectedDate
        >= submittedMaterialRequest.purchaseRequisition?.date,
      'generated purchase requisition retained an impossible demand date before its request date',
    );
    const materialRequestRequisitions = await request(baseUrl, '/purchase/requisitions');
    assert(
      materialRequestRequisitions.items.filter((row) => row.sourceMaterialRequest === 'PMR2-FLOW-TASK').length === 1,
      'automatic shortage routing created duplicate purchase requisitions for one material request',
    );

    const repeatedTaskGap = await requestResult(baseUrl, '/production/material-requests', {
      method: 'POST',
      body: {
        ...submittedMaterialRequestBody,
        code: 'PMR2-FLOW-TASK-SECOND',
        idempotencyKey: 'flow:production-material-request:create:second-gap',
      },
    });
    assert(
      repeatedTaskGap.response.status === 409
        && /当前采购缺口|当前没有新增采购缺口/.test(String(repeatedTaskGap.payload.error || '')),
      'the same production-task procurement gap could be submitted twice',
    );

    const forgedTaskGapType = await requestResult(baseUrl, '/production/material-requests', {
      method: 'POST',
      body: {
        command: 'submit',
        code: 'PMR2-FLOW-FORGED-TYPE',
        idempotencyKey: 'flow:production-material-request:forged-type',
        requestType: '任务缺口补料',
        expectedDate: shanghaiDate(),
        lines: [{
          lineId: 'PMR2-FLOW-FORGED-TYPE-L1',
          materialCode: 'M-RM-PLA-VIRGIN',
          materialName: 'PLA 原生粒子',
          requestedQty: 1,
          unit: 'kg',
        }],
      },
    });
    assert(
      forgedTaskGapType.response.status === 400
        && String(forgedTaskGapType.payload.error || '').includes('必须从已确认的生产任务发起'),
      'a standalone material request could forge the task-gap request type',
    );

    const backdatedStandaloneRequest = await requestResult(baseUrl, '/production/material-requests', {
      method: 'POST',
      body: {
        command: 'submit',
        code: 'PMR2-FLOW-BACKDATED',
        idempotencyKey: 'flow:production-material-request:backdated',
        requestType: '临时备料',
        expectedDate: shanghaiDate(-1),
        lines: [{
          lineId: 'PMR2-FLOW-BACKDATED-L1',
          materialCode: 'M-RM-PLA-VIRGIN',
          materialName: 'PLA 原生粒子',
          requestedQty: 1,
          unit: 'kg',
          purpose: '验证独立申请日期门禁',
        }],
      },
    });
    assert(
      backdatedStandaloneRequest.response.status === 400
        && String(backdatedStandaloneRequest.payload.error || '').includes('需求日期不能早于申请日期'),
      'a standalone material request accepted a demand date before its application date',
    );

    const purposeMissingRequest = await requestResult(baseUrl, '/production/material-requests', {
      method: 'POST',
      body: {
        command: 'submit',
        code: 'PMR2-FLOW-PURPOSE-MISSING',
        idempotencyKey: 'flow:production-material-request:purpose-missing',
        requestType: '临时备料',
        expectedDate: shanghaiDate(),
        lines: [{
          lineId: 'PMR2-FLOW-PURPOSE-MISSING-L1',
          materialCode: 'M-RM-PLA-VIRGIN',
          materialName: 'PLA 原生粒子',
          requestedQty: 1,
          unit: 'kg',
        }],
      },
    });
    assert(
      purposeMissingRequest.response.status === 400
        && String(purposeMissingRequest.payload.error || '').includes('必须填写具体用途'),
      'a standalone material request accepted a line without a concrete purpose',
    );

    const retiredWarehouseAcceptance = await requestResult(baseUrl, '/production/material-requests/PMR2-FLOW-TASK/accept', {
      method: 'POST',
      body: { actor: '仓库主管' },
    });
    assert(
      retiredWarehouseAcceptance.response.status === 410
        && String(retiredWarehouseAcceptance.payload.error || '').includes('仓库受理备料申请已取消'),
      'retired warehouse material-request acceptance endpoint was still executable',
    );

    let submittedMaterialRequestEditBlocked = false;
    try {
      await request(baseUrl, '/production/material-requests/PMR2-FLOW-TASK', {
        method: 'PUT',
        body: {
          ...submittedMaterialRequest.record,
          command: 'submit',
          requester: '恶意改写',
          idempotencyKey: 'flow:production-material-request:blocked-edit:1',
        },
      });
    } catch (error) {
      submittedMaterialRequestEditBlocked = String(error).includes('已提交备料申请不能直接修改');
    }
    assert(submittedMaterialRequestEditBlocked, 'submitted production material request remained directly editable');

    let downstreamTaskStructureBlocked = false;
    try {
      await request(baseUrl, '/production/tasks/PT2-FLOW-TASK', {
        method: 'PUT',
        body: {
          ...taskOwnerChange.record,
          command: 'submit',
          idempotencyKey: 'flow:production-task:blocked-structure:1',
          products: taskOwnerChange.record.products.map((line) => ({ ...line, demandQty: 21 })),
        },
      });
    } catch (error) {
      downstreamTaskStructureBlocked = String(error).includes('成品、数量、单位和配方不可直接变更');
    }
    assert(downstreamTaskStructureBlocked, 'production task structure changed after downstream documents existed');

    const standards = await request(baseUrl, '/quality/standards');
    assert(standards.items.length >= 6, 'quality standard baseline was not initialized');
    const firstStandard = standards.items.find((item) => item.code === 'QSTD-PQC-FIRST-V1');
    assert(firstStandard?.checkpointRules?.every((item) => item.name && item.requirement), 'quality standard item requirements are incomplete');
    const nextFirstStandard = await request(baseUrl, `/quality/standards/${encodeURIComponent(firstStandard.code)}`, {
      method: 'PUT',
      body: {
        ...firstStandard,
        note: '自动流程验证：启用版本维护时应建立新版本草稿。',
        actor: '质量负责人',
      },
    });
    assert(nextFirstStandard.createdVersion === true, 'editing an active quality standard overwrote the active version');
    assert(nextFirstStandard.record.code === 'QSTD-PQC-FIRST-V2', 'quality standard version code did not advance');
    assert(nextFirstStandard.record.status === '草稿', 'new quality standard version was not kept as a draft');
    const activatedFirstStandard = await request(
      baseUrl,
      `/quality/standards/${encodeURIComponent(nextFirstStandard.record.code)}/activate`,
      { method: 'POST', body: { revision: nextFirstStandard.record.revision, actor: '质量负责人' } },
    );
    assert(activatedFirstStandard.record.status === '启用', 'quality standard draft was not activated');
    const standardsAfterActivation = await request(baseUrl, '/quality/standards');
    assert(
      standardsAfterActivation.items.find((item) => item.code === firstStandard.code)?.status === '停用',
      'activating a new quality standard version did not retire the old family version',
    );
    const activeFirstStandardCode = activatedFirstStandard.record.code;

    const recipeOutputCandidates = await request(baseUrl, `/reference/materials?kind=${encodeURIComponent('生产产出')}&limit=50`);
    assert(recipeOutputCandidates.items.length > 0, 'production recipe output picker returned no candidates');
    assert(
      recipeOutputCandidates.items.every((item) => {
        const raw = item.raw || {};
        const producible = Object.prototype.hasOwnProperty.call(raw, 'isProducible')
          ? Boolean(raw.isProducible)
          : ['自制', '采购+自制', '委外'].includes(raw.supplyStrategy || '');
        return ['成品', '半成品'].includes(raw.type || raw.category) && producible;
      }),
      'production recipe output picker included a non-producible or non-output material',
    );

    let emptyEstimatedLossBlocked = false;
    try {
      await request(baseUrl, '/production/recipes', {
        method: 'POST',
        body: {
          productCode: 'M-FG-PLA-175-MBK',
          version: 'v99',
          productUnitWeightKg: 1,
          status: '草稿',
          materials: [
            { materialCode: 'M-RM-PLA-VIRGIN', usageMode: 'percent', percent: 100 },
          ],
          estimatedLosses: [
            { materialCode: 'M-RM-PLA-VIRGIN', fixedLossQty: 0, lossRatePercent: 0 },
          ],
        },
      });
    } catch (error) {
      emptyEstimatedLossBlocked = String(error).includes('至少填写固定损耗或比例损耗');
    }
    assert(emptyEstimatedLossBlocked, 'production recipe accepted an empty zero-value estimated loss rule');

    let nonWeightPercentMaterialBlocked = false;
    try {
      await request(baseUrl, '/production/recipes', {
        method: 'POST',
        body: {
          productCode: 'M-FG-PLA-175-MBK',
          version: 'v98',
          productUnitWeightKg: 1,
          materials: [
            { materialCode: 'M-PKG-SPOOL-1KG', usageMode: 'percent', percent: 100 },
          ],
          estimatedLosses: [],
        },
      });
    } catch (error) {
      nonWeightPercentMaterialBlocked = String(error).includes('不能按净重占比投料');
    }
    assert(nonWeightPercentMaterialBlocked, 'production recipe allowed a non-kg material in percent-based input');

    let changedSourceProductBlocked = false;
    try {
      await request(baseUrl, '/production/recipes', {
        method: 'POST',
        body: {
          sourceRecipeCode: 'BOM-PETG-175-CLR-V1',
          productCode: 'M-FG-PLA-175-MBK',
          version: 'v97',
          productUnitWeightKg: 1,
          materials: [
            { materialCode: 'M-RM-PLA-VIRGIN', usageMode: 'percent', percent: 100 },
          ],
          estimatedLosses: [],
        },
      });
    } catch (error) {
      changedSourceProductBlocked = String(error).includes('必须沿用来源配方的产出物料');
    }
    assert(changedSourceProductBlocked, 'production recipe allowed a new version to switch away from its source product');

    const recipeDraft = await request(baseUrl, '/production/recipes', {
      method: 'POST',
      headers: { 'x-filatrix-account': 'production01' },
      body: {
        productCode: 'M-FG-PLA-175-MBK',
        sourceRecipeCode: 'BOM-PLA-175-MBK-V1',
        productName: 'PLA 1.75mm 哑光黑耗材 1kg',
        version: 'v2',
        productUnitWeightKg: 1,
        outputUnit: '卷',
        status: '草稿',
        owner: '工艺工程',
        materials: [
          { materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', usageMode: 'percent', percent: 95, unit: 'kg', incomingQcRequired: true },
          { materialCode: 'M-CM-MATTE-BLK', materialName: '哑光黑色母', usageMode: 'percent', percent: 5, unit: 'kg', incomingQcRequired: true },
          { materialCode: 'M-PKG-SPOOL-1KG', materialName: '小盘线轴 1kg', usageMode: 'fixed', perUnitQty: 1, unit: '个', incomingQcRequired: false },
        ],
        estimatedLosses: [
          { materialCode: 'M-RM-PLA-VIRGIN', fixedLossQty: 0, lossRatePercent: 2, unit: '个' },
        ],
        note: '自动流程配方草稿。',
        attachments: [],
      },
    });
    assert(recipeDraft.record.code === 'BOM-PLA-175-MBK-V2' && recipeDraft.record.status === '草稿', 'production recipe draft was not created with the expected version code');
    assert(recipeDraft.record.sourceRecipeCode === 'BOM-PLA-175-MBK-V1', 'production recipe lost its source version lineage');
    assert(recipeDraft.record.owner === '周宁', 'production recipe trusted a client-side maintainer instead of the authenticated account');
    assert(recipeDraft.record.estimatedLosses[0]?.unit === 'kg', 'production recipe trusted a client-side loss unit instead of the material unit');
    assert(
      recipeDraft.record.materials.find((line) => line.materialCode === 'M-PKG-SPOOL-1KG')?.incomingQcRequired === true,
      'production recipe trusted a client-side QC flag instead of the material incoming-inspection rule',
    );
    const revisedRecipe = await request(baseUrl, `/production/recipes/${encodeURIComponent(recipeDraft.record.code)}`, {
      method: 'PUT',
      body: { ...recipeDraft.record, command: 'save', note: '自动流程配方草稿已修订。', revision: recipeDraft.record.revision },
    });
    assert(revisedRecipe.record.revision === 2 && revisedRecipe.record.note.includes('已修订'), 'production recipe revision was not persisted');
    let duplicateEnabledRecipeBlocked = false;
    try {
      await request(baseUrl, `/production/recipes/${encodeURIComponent(recipeDraft.record.code)}`, {
        method: 'PUT',
        body: { ...revisedRecipe.record, command: 'activate', revision: revisedRecipe.record.revision },
      });
    } catch (error) {
      duplicateEnabledRecipeBlocked = String(error).includes('请先停用原版本');
    }
    assert(duplicateEnabledRecipeBlocked, 'production recipe allowed two enabled versions for one product');

    const completedSalesOrder = await request(baseUrl, '/sales/orders/SO-20260528-008');
    assert(completedSalesOrder.order.documentStatus === '已关闭', 'completed demo order lifecycle was not retained');
    assert(completedSalesOrder.order.deliveryProgress.status === '已签收', 'completed demo order lacked signed delivery evidence');
    assert(completedSalesOrder.order.deliveryProgress.outboundQty === 180, 'completed demo order lacked outbound quantity evidence');
    assert(completedSalesOrder.order.invoiceProgress.invoicedAmount === 12420, 'completed demo order lacked invoice evidence');
    assert(completedSalesOrder.order.paymentProgress.settledAmount === 12420, 'completed demo order lacked settlement evidence');

    let noOutboundAfterSaleBlocked = false;
    try {
      await request(baseUrl, '/sales/after-sales', {
        method: 'POST',
        body: {
          code: '系统自动生成',
          sourceOrder: 'SO-20260617-021',
          issueType: '自动边界检查',
          action: '不应保存',
          responsibility: '销售',
          amountImpact: '无',
          owner: '李明',
          nextStep: '不应生成',
          date: shanghaiDate(),
          attachments: [],
        },
      });
    } catch (error) {
      noOutboundAfterSaleBlocked = String(error).includes('尚无实际出库或签收数量');
    }
    assert(noOutboundAfterSaleBlocked, 'sales order without actual outbound quantity was allowed to create an after-sales document');

    let prematureReceiptBlocked = false;
    try {
      const prematureOrder = await request(baseUrl, '/sales/orders/SO-20260617-021');
      await request(baseUrl, '/sales/orders/SO-20260617-021/confirm-receipt', {
        method: 'POST',
        body: { revision: prematureOrder.order.revision || 1 },
      });
    } catch (error) {
      prematureReceiptBlocked = String(error).includes('只有全部出库后才能确认客户签收');
    }
    assert(prematureReceiptBlocked, 'sales order receipt was confirmed before outbound completion');

    const department = await request(baseUrl, '/master-data/departments', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        name: '流程验证部',
        owner: 'COM-FILATRIX',
        status: '启用',
      },
    });
    assert(department.record.code.startsWith('DEP-'), 'department code was not generated');

    const quote = await request(baseUrl, '/sales/quotes', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        customerCode: 'CUS-00001',
        customer: '杭州晨星科技',
        contact: '陈经理',
        contactPhone: '138-0571-6001',
        products: [{ materialCode: 'M-FG-PLA-175-MBK', name: 'PLA 1.75mm 哑光黑耗材 1kg', qty: '2 卷', unitPrice: '142.00' }],
        owner: '李明',
        validUntil: shanghaiDate(7),
        deliveryMethod: '送货到厂',
        paymentMethod: '月结 30 天',
        remark: '自动流程冒烟检查',
        attachments: [],
      },
    });
    const concurrentQuoteBodies = ['并发写入 A', '并发写入 B'].map((remark) => ({
      code: '系统自动生成',
      customerCode: 'CUS-00001',
      customer: '杭州晨星科技',
      contact: '陈经理',
      contactPhone: '138-0571-6001',
      products: [{ materialCode: 'M-FG-PLA-175-MBK', name: 'PLA 1.75mm 哑光黑耗材 1kg', qty: '1 卷', unitPrice: '142.00' }],
      owner: '李明',
      validUntil: shanghaiDate(7),
      deliveryMethod: '送货到厂',
      paymentMethod: '月结 30 天',
      remark,
      attachments: [],
    }));
    const concurrentQuotes = await Promise.all(concurrentQuoteBodies.map((body) => request(baseUrl, '/sales/quotes', {
      method: 'POST',
      body,
    })));
    const concurrentCodes = concurrentQuotes.map((item) => item.quote?.code).filter(Boolean);
    const quoteListAfterConcurrentWrites = await request(baseUrl, '/sales/quotes');
    assert(concurrentCodes.length === 2 && new Set(concurrentCodes).size === 2, 'concurrent quote writes did not allocate unique codes');
    assert(
      concurrentCodes.every((code) => quoteListAfterConcurrentWrites.items?.some((item) => item.code === code)),
      'concurrent quote writes lost a persisted record',
    );
    const confirmedQuote = await request(baseUrl, `/sales/quotes/${encodeURIComponent(quote.quote.code)}/confirm`, {
      method: 'POST',
      body: { revision: quote.quote.revision },
    });
    assert(confirmedQuote.quote.status === '已确认', 'quote was not confirmed');

    const order = await request(baseUrl, '/sales/orders', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        sourceQuote: quote.quote.code,
        customerCode: quote.quote.customerCode,
        customer: quote.quote.customer,
        contact: quote.quote.contact,
        contactPhone: quote.quote.contactPhone,
        products: quote.quote.products,
        owner: '李明',
        priority: '正常',
        delivery: shanghaiDate(10),
        plannedShipDate: shanghaiDate(5),
        shipContact: quote.quote.contact,
        shipPhone: quote.quote.contactPhone,
        shipAddress: '浙江省杭州市滨江区流程验证路 8 号',
        deliveryMethod: quote.quote.deliveryMethod,
        paymentMethod: quote.quote.paymentMethod,
        attachments: [],
      },
    });
    const confirmedOrder = await request(baseUrl, `/sales/orders/${encodeURIComponent(order.order.code)}/confirm`, {
      method: 'POST',
      body: { revision: order.order.revision },
    });
    assert(['生产中', '待发货'].includes(confirmedOrder.order.status), 'sales order was not confirmed');

    const outboundQueue = await request(baseUrl, '/sales/outbound-requests');
    const outbound = {
      request: outboundQueue.items.find((requestDoc) => requestDoc.sourceOrder === order.order.code),
    };
    assert(outbound.request, 'confirmed sales order did not generate delivery tracking');
    assert(outbound.request.status === '待发货', 'delivery tracking changed before warehouse outbound posting');
    const salesIssueQueue = await request(baseUrl, '/warehouse/sales-issues');
    const generatedSalesIssue = salesIssueQueue.items.find((issue) => issue.sourceDoc === outbound.request.code);
    assert(generatedSalesIssue?.status === '待拣货', 'delivery tracking did not generate a warehouse picking task');
    assert(generatedSalesIssue?.owner === '待分配', 'generated sales picking task assigned an operator before work started');
    assert(generatedSalesIssue.address === outbound.request.address, 'generated sales issue dropped the delivery address');
    assert(
      generatedSalesIssue.products.every((product) => product.batchControl && typeof product.batchTracked === 'boolean'),
      'generated sales issue did not freeze material-control attributes',
    );

    const requisition = await request(baseUrl, '/purchase/requisitions', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        department: '采购部',
        requester: '张三',
        reason: '自动流程冒烟检查',
        products: [
          { materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '5 kg', uom: 'kg', qcRequired: true },
          { materialCode: 'M-AM-DESICCANT', name: '干燥剂 5g', qty: '2 个', uom: '个', qcRequired: false },
        ],
        expectedDate: shanghaiDate(5),
        attachments: [],
      },
    });
    const submittedRequisition = await request(
      baseUrl,
      `/purchase/requisitions/${encodeURIComponent(requisition.requisition.code)}/submit`,
      { method: 'POST' },
    );
    assert(submittedRequisition.requisition.status === '待采购受理', 'purchase requisition was not submitted');

    const purchaseOrder = await request(baseUrl, '/purchase/orders', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        sourceRequisition: requisition.requisition.code,
        supplierCode: 'SUP-JXJC',
        supplier: '嘉兴聚材高分子',
        contact: '王经理',
        contactPhone: '139-0000-0001',
        products: [
          { materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '5 kg', uom: 'kg', unitPrice: '18.00', qcRequired: true },
          { materialCode: 'M-AM-DESICCANT', name: '干燥剂 5g', qty: '2 个', uom: '个', unitPrice: '0.10', qcRequired: false },
        ],
        owner: '陈晨',
        expectedDate: shanghaiDate(6),
        deliveryMethod: '送货到厂',
        paymentMethod: '验收后付款',
        freightPayer: '供方',
        taxMode: '含税',
        taxRate: '13%',
        warehouseCode: 'WH-QC-HOLD',
        warehouse: '采购暂存区',
        receivingAddress: '浙江省杭州市滨江区江南大道 1688 号 2 号仓',
        receivingContact: '吴磊',
        receivingPhone: '138-0000-0002',
        attachments: [],
      },
    });
    const confirmedPurchaseOrder = await request(
      baseUrl,
      `/purchase/orders/${encodeURIComponent(purchaseOrder.order.code)}/confirm`,
      { method: 'POST' },
    );
    assert(confirmedPurchaseOrder.order.status === '已确认', 'purchase order was not confirmed');

    const receiptQueue = await request(baseUrl, '/warehouse/purchase-receipts');
    const generatedReceipt = receiptQueue.items.find((item) => item.sourceDoc === purchaseOrder.order.code);
    assert(generatedReceipt, 'purchase confirmation did not generate a warehouse receiving task');
    const receiptStagingBatch = `SMK-IQC-${Date.now()}`;
    const purchaseReceipt = await request(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(generatedReceipt.code)}`, {
      method: 'PUT',
      body: {
        ...generatedReceipt,
        products: generatedReceipt.products.map((product) => ({
          ...product,
          batch: '',
          stagingBatch: product.qcRequired ? receiptStagingBatch : '',
          arrivalQty: product.plannedQty || product.qty,
          acceptedQty: product.plannedQty || product.qty,
        })),
        location: 'QC-04',
        owner: '吴磊',
        date: shanghaiDate(),
        note: '库存事实链自动验证',
      },
    });
    assert(purchaseReceipt.receipt.location === 'QC-04', 'purchase receipt did not retain the selected normal staging location');
    assert(purchaseReceipt.receipt.owner === '待分配', 'purchase receipt fabricated an operator before arrival submission');
    const receiptCode = purchaseReceipt.receipt.code;
    const incomingCode = `IQC-${receiptCode.replace(/^WR-?/, '')}`;
    const receiptMaterial = purchaseOrder.order.products[0].materialCode;
    const exemptMaterial = purchaseOrder.order.products[1].materialCode;

    let sourceLessIncomingBlocked = false;
    try {
      await request(baseUrl, '/quality/incoming/IQC-SOURCELESS-SMOKE', {
        method: 'PUT',
        body: { sourceDoc: receiptCode, status: '待检验', version: 0 },
      });
    } catch (error) {
      sourceLessIncomingBlocked = String(error).includes('HTTP 404');
    }
    assert(sourceLessIncomingBlocked, 'source-less incoming quality task could still be created manually');

    let directDraftBypassBlocked = false;
    try {
      await request(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(receiptCode)}/status`, {
        method: 'POST',
        body: { status: '待入库', action: '直接待入库', remark: '需质检收货单不应从草稿直接进入待入库。' },
      });
    } catch (error) {
      directDraftBypassBlocked = String(error).includes('HTTP 409');
    }
    assert(directDraftBypassBlocked, 'draft purchase receipt bypassed incoming quality');

    const submittedArrival = await request(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(receiptCode)}/arrival-result`,
      {
        method: 'POST',
        body: { idempotencyKey: `${receiptCode}:arrival:1` },
      },
    );
    const receivedForQuality = {
      ...submittedArrival,
      record: submittedArrival.receipt,
    };
    assert(receivedForQuality.record.stockStage === 'qc_hold', 'purchase receipt did not enter QC hold');
    assert(receivedForQuality.record.qualityTaskCode === incomingCode, 'purchase receipt did not retain its generated incoming quality task');
    assert(receivedForQuality.qualityTask?.code === incomingCode, 'purchase receipt transition did not return its generated incoming quality task');
    assert(receivedForQuality.qualityTask?.sourceDoc === receiptCode, 'generated incoming quality task lost its receipt source');
    assert(receivedForQuality.qualityTask?.products?.length === 1, 'incoming quality task included exempt receipt lines');
    assert(receivedForQuality.qualityTask?.products?.[0]?.materialCode === receiptMaterial, 'incoming quality task lost the QC-required receipt line');
    assert(receivedForQuality.qualityTask?.products?.[0]?.batch === receiptStagingBatch, 'incoming quality task lost the staging batch');
    assert(
      receivedForQuality.record.arrivalLineFacts?.find((line) => line.materialCode === receiptMaterial)?.stage === 'qc_hold',
      'QC-required receipt line did not enter QC hold',
    );
    assert(
      receivedForQuality.record.arrivalLineFacts?.find((line) => line.materialCode === exemptMaterial)?.stage === 'pending_inbound',
      'exempt receipt line did not enter pending inbound directly',
    );
    assert(receivedForQuality.qualityTask?.qualityStandardSnapshot?.code === 'QSTD-IQC-RM-V1', 'generated incoming quality task did not freeze the active standard');
    assert(
      receivedForQuality.qualityTask?.qualityStandardSnapshot?.checkpointRules?.every((item) => item.name && item.requirement),
      'generated incoming quality task did not freeze item-level standard requirements',
    );
    const generatedIncomingTask = await request(baseUrl, `/quality/incoming/${encodeURIComponent(incomingCode)}`);
    assert(generatedIncomingTask.record.sourceDoc === receiptCode, 'generated incoming quality task could not be loaded by code');
    assert(generatedIncomingTask.record.products?.[0]?.batch === receiptStagingBatch, 'incoming quality read model lost the staging batch');
    assert(
      generatedIncomingTask.record.dueDate >= (generatedIncomingTask.record.date || receivedForQuality.record.date),
      'incoming quality due date was earlier than the actual quality task or receipt date',
    );
    const incomingTasksAfterArrival = await request(baseUrl, '/quality/incoming');
    assert(
      incomingTasksAfterArrival.items.filter((item) => item.sourceDoc === receiptCode).length === 1,
      'purchase receipt generated duplicate incoming quality tasks',
    );
    const qcInventory = inventoryRow(await request(baseUrl, '/warehouse/inventory'), purchaseReceipt.receipt, receiptMaterial);
    assert(qcInventory?.onHandNumber === 5, 'arrival did not increase physical on-hand');
    assert(qcInventory?.qualifiedOnHandNumber === 0, 'QC hold incorrectly increased qualified stock');
    assert(qcInventory?.qcHoldNumber === 5, 'arrival did not increase QC hold');
    assert(qcInventory?.availableNumber === 0, 'QC hold incorrectly increased available stock');
    const exemptArrivalInventory = inventoryRow(await request(baseUrl, '/warehouse/inventory'), purchaseReceipt.receipt, exemptMaterial);
    assert(exemptArrivalInventory?.onHandNumber === 2, 'exempt arrival did not increase physical on-hand');
    assert(exemptArrivalInventory?.qcHoldNumber === 0, 'exempt arrival incorrectly entered QC hold');
    assert(exemptArrivalInventory?.pendingInboundNumber === 2, 'exempt arrival did not enter pending inbound');
    assert(exemptArrivalInventory?.qualifiedOnHandNumber === 0, 'exempt arrival became qualified stock before warehouse posting');
    assert(exemptArrivalInventory?.availableNumber === 0, 'exempt arrival became available stock before warehouse posting');

    let warehouseBypassBlocked = false;
    try {
      await request(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(receiptCode)}/status`, {
        method: 'POST',
        body: { status: '待入库', action: '质检放行', remark: '仓库不应直接放行。' },
      });
    } catch (error) {
      warehouseBypassBlocked = String(error).includes('HTTP 409');
    }
    assert(warehouseBypassBlocked, 'warehouse bypassed the incoming quality decision');

    const frozenIncomingItems = receivedForQuality.qualityTask.products[0].inspectionItems;
    const savedIncomingDraft = await request(baseUrl, `/quality/incoming/${encodeURIComponent(incomingCode)}`, {
      method: 'PUT',
      body: {
        sourceDoc: receiptCode,
        sourceType: '客户端伪造来源',
        party: '客户端伪造供应商',
        contact: '客户端伪造联系人',
        warehouse: '客户端伪造质检仓',
        date: '2099-01-01',
        dueDate: '2099-01-02',
        status: '合格',
        version: 0,
        inspector: '来料检验员',
        products: [{
          ...receivedForQuality.qualityTask.products[0],
          name: '客户端伪造物料',
          qty: '999 kg',
          sampleQty: '2 kg',
          inspectionItems: frozenIncomingItems.map((item, index) => ({
            ...item,
            standard: '客户端不可覆盖冻结标准',
            actual: index === 0 ? '草稿已检查' : '',
            result: index === 0 ? '合格' : '待检验',
          })),
        }],
      },
    });
    assert(savedIncomingDraft.record.products[0].name === receivedForQuality.qualityTask.products[0].name, 'incoming quality draft overwrote the frozen source material');
    assert(savedIncomingDraft.record.products[0].qty === receivedForQuality.qualityTask.products[0].qty, 'incoming quality draft overwrote the frozen receipt quantity');
    assert(savedIncomingDraft.record.sourceType !== '客户端伪造来源', 'incoming quality draft overwrote the frozen source type');
    assert(savedIncomingDraft.record.party !== '客户端伪造供应商', 'incoming quality draft overwrote the frozen supplier');
    assert(savedIncomingDraft.record.contact !== '客户端伪造联系人', 'incoming quality draft overwrote the frozen source contact');
    assert(savedIncomingDraft.record.warehouse !== '客户端伪造质检仓', 'incoming quality draft overwrote the frozen quality warehouse');
    assert(savedIncomingDraft.record.date !== '2099-01-01', 'incoming quality draft overwrote the frozen inspection date');
    assert(savedIncomingDraft.record.dueDate !== '2099-01-02', 'incoming quality draft overwrote the frozen due date');
    assert(savedIncomingDraft.record.status === '待检验', 'incoming quality draft overwrote the workflow status');
    assert(savedIncomingDraft.record.products[0].inspectionItems[0].standard === frozenIncomingItems[0].standard, 'incoming quality draft overwrote the frozen checkpoint standard');
    assert(savedIncomingDraft.record.products[0].inspectionItems[0].actual === '草稿已检查', 'incoming quality draft did not persist the mutable checkpoint record');

    let missingIncomingCheckpointsBlocked = false;
    try {
      await request(baseUrl, `/quality/incoming/${encodeURIComponent(incomingCode)}/decision`, {
        method: 'POST',
        body: {
          sourceDoc: receiptCode,
          standardVersionId: 'QSTD-IQC-RM-V1',
          version: 0,
          idempotencyKey: `${incomingCode}:missing-checkpoints`,
          actor: '质检员',
          lines: [{
            receiptLineId: receivedForQuality.record.products[0].lineId,
            materialCode: receiptMaterial,
            receivedQty: 5,
            acceptedQty: 2,
            concessionQty: 0,
            rejectedQty: 0,
            pendingQty: 3,
            sampleQty: '2 kg',
            disposition: '待复检',
          }],
        },
      });
    } catch (error) {
      missingIncomingCheckpointsBlocked = String(error).includes('HTTP 409');
    }
    assert(missingIncomingCheckpointsBlocked, 'incoming quality decision bypassed the frozen checkpoint records');

    let contradictoryIncomingDecisionBlocked = false;
    try {
      await request(baseUrl, `/quality/incoming/${encodeURIComponent(incomingCode)}/decision`, {
        method: 'POST',
        body: {
          sourceDoc: receiptCode,
          standardVersionId: 'QSTD-IQC-RM-V1',
          version: 0,
          idempotencyKey: `${incomingCode}:contradictory-checkpoints`,
          actor: '质检员',
          lines: [{
            receiptLineId: receivedForQuality.record.products[0].lineId,
            materialCode: receiptMaterial,
            receivedQty: 5,
            acceptedQty: 2,
            concessionQty: 0,
            rejectedQty: 0,
            pendingQty: 3,
            sampleQty: '2 kg',
            inspectionItems: frozenIncomingItems.map((item, index) => ({
              ...item,
              actual: index === 0 ? '包装破损' : '符合要求',
              result: index === 0 ? '不合格' : '合格',
              note: index === 0 ? '存在异常但未登记不合格数量' : '',
            })),
            disposition: '待复检',
          }],
        },
      });
    } catch (error) {
      contradictoryIncomingDecisionBlocked = String(error).includes('HTTP 409');
    }
    assert(contradictoryIncomingDecisionBlocked, 'incoming quality accepted an abnormal checkpoint with zero rejected quantity');

    const partialQualityDecision = await request(baseUrl, `/quality/incoming/${encodeURIComponent(incomingCode)}/decision`, {
      method: 'POST',
      body: {
        sourceDoc: receiptCode,
        standardVersionId: 'QSTD-IQC-RM-V1',
        version: 0,
        idempotencyKey: `${incomingCode}:1`,
        actor: '质检员',
        lines: [{
          receiptLineId: receivedForQuality.record.products[0].lineId,
          materialCode: receiptMaterial,
          receivedQty: 5,
          acceptedQty: 2,
          concessionQty: 0,
          rejectedQty: 0,
          pendingQty: 3,
          sampleQty: '2 kg',
          sampleIssueQty: '0 kg',
          inspectionItems: frozenIncomingItems.map((item) => ({
            ...item,
            standard: '客户端不可覆盖冻结标准',
            actual: '符合要求',
            result: '合格',
            note: '',
          })),
          disposition: '待复检',
        }],
      },
    });
    assert(partialQualityDecision.receipt.status === '待质检', 'partial quality decision closed pending quantity');
    assert(
      partialQualityDecision.record.inspector === partialQualityDecision.decision.actor,
      'incoming quality decision did not persist the actual inspector',
    );
    assert(
      partialQualityDecision.record.date === String(partialQualityDecision.decision.decidedAt || '').slice(0, 10),
      'incoming quality decision did not persist the actual decision date',
    );
    assert(partialQualityDecision.decision.inspectionTotals.pending === 3, 'QC-only pending total is incorrect');
    assert(partialQualityDecision.decision.lines[0].inspectionItems.every((item) => item.result === '合格'), 'incoming quality checkpoint results were not persisted');
    assert(partialQualityDecision.decision.lines[0].inspectionItems[0].standard === frozenIncomingItems[0].standard, 'incoming quality decision overwrote the frozen checkpoint standard');
    assert(partialQualityDecision.decision.totals.released === 4, 'mixed receipt total did not include the exempt released line');
    assert(
      partialQualityDecision.decision.lines.some((line) => line.materialCode === exemptMaterial && line.result === '免检放行'),
      'server did not preserve the exempt line as an automatic release fact',
    );
    assert(partialQualityDecision.decision.qualityStandardSnapshot?.code === 'QSTD-IQC-RM-V1', 'incoming quality decision did not freeze its standard version');
    assert(
      partialQualityDecision.decision.qualityStandardSnapshot?.checkpointRules?.every((item) => item.name && item.requirement),
      'incoming quality decision did not freeze item-level standard requirements',
    );
    assert(partialQualityDecision.receipt.stockStage === 'quality_partial', 'partial quality decision lost its mixed stock stage');
    let partialPostBlocked = false;
    try {
      await request(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(receiptCode)}/post`, { method: 'POST' });
    } catch (error) {
      partialPostBlocked = String(error).includes('HTTP 409') || String(error).includes('HTTP 400');
    }
    assert(partialPostBlocked, 'warehouse posted a receipt with pending quality quantity');

    const qualityDecision = await request(baseUrl, `/quality/incoming/${encodeURIComponent(incomingCode)}/decision`, {
      method: 'POST',
      body: {
        sourceDoc: receiptCode,
        standardVersionId: 'QSTD-IQC-RM-V1',
        version: 1,
        idempotencyKey: `${incomingCode}:2`,
        actor: '质检员',
        lines: [{
          receiptLineId: receivedForQuality.record.products[0].lineId,
          materialCode: receiptMaterial,
          receivedQty: 5,
          acceptedQty: 3,
          concessionQty: 0,
          rejectedQty: 2,
          pendingQty: 0,
          sampleQty: '2 kg',
          sampleIssueQty: '1 kg',
          inspectionItems: frozenIncomingItems.map((item, index) => ({
            ...item,
            actual: index === 0 ? '抽样包装存在破损' : '符合要求',
            result: index === 0 ? '不合格' : '合格',
            note: index === 0 ? '破损批量进入隔离处置' : '',
          })),
          disposition: '隔离',
        }],
      },
    });
    assert(qualityDecision.decision.inspectionTotals.released === 3, 'QC decision released quantity is incorrect');
    assert(qualityDecision.decision.totals.released === 5, 'mixed receipt released total is incorrect');
    assert(qualityDecision.decision.totals.rejected === 2, 'quality decision rejected quantity is incorrect');
    assert(qualityDecision.decision.lines[0].inspectionItems.filter((item) => item.result === '不合格').length === 1, 'incoming quality abnormal checkpoint was not persisted');
    assert(qualityDecision.receipt.stockStage === 'pending_inbound', 'quality decision did not enter pending inbound');
    const pendingInventory = inventoryRow(await request(baseUrl, '/warehouse/inventory'), purchaseReceipt.receipt, receiptMaterial);
    assert(pendingInventory?.onHandNumber === 5, 'quality release changed physical on-hand');
    assert(pendingInventory?.qcHoldNumber === 0, 'quality release did not clear QC hold');
    assert(pendingInventory?.pendingInboundNumber === 3, 'quality release did not create the accepted pending inbound quantity');
    assert(pendingInventory?.rejectedHoldNumber === 2, 'quality rejection did not create rejected hold quantity');
    assert(pendingInventory?.availableNumber === 0, 'quality release incorrectly increased available stock');
    const exemptAfterQuality = inventoryRow(await request(baseUrl, '/warehouse/inventory'), purchaseReceipt.receipt, exemptMaterial);
    assert(exemptAfterQuality?.qcHoldNumber === 0, 'quality decision incorrectly moved exempt stock through QC hold');
    assert(exemptAfterQuality?.pendingInboundNumber === 2, 'quality decision duplicated or removed exempt pending inbound stock');

    const reinspection = await request(baseUrl, `/quality/incoming/${encodeURIComponent(incomingCode)}/reinspections`, {
      method: 'POST',
      body: {
        receiptLineId: receivedForQuality.record.products[0].lineId,
        quantity: 1,
        reason: '抽样争议，安排独立复检',
        inspector: '复检员',
        actor: '质检负责人',
        decisionVersion: qualityDecision.decision.version,
        dispositionVersion: 0,
        idempotencyKey: `${incomingCode}:reinspect:1`,
      },
    });
    assert(reinspection.task.status === '待复检', 'incoming reinspection task was not created');
    const frozenReinspectionItems = reinspection.task.inspectionItems || [];
    assert(frozenReinspectionItems.length === 1, 'incoming reinspection did not inherit only the abnormal original checkpoint');
    assert(frozenReinspectionItems[0].originalResult === '不合格', 'incoming reinspection lost the original abnormal result');
    assert(frozenReinspectionItems[0].standard === qualityDecision.decision.lines[0].inspectionItems[0].standard, 'incoming reinspection did not freeze the original standard requirement');

    let missingReinspectionItemsBlocked = false;
    try {
      await request(
        baseUrl,
        `/quality/incoming/${encodeURIComponent(incomingCode)}/reinspections/${encodeURIComponent(reinspection.task.code)}/decide`,
        {
          method: 'POST',
          body: {
            acceptedQty: 0.5,
            rejectedQty: 0.5,
            actor: '复检员',
            taskRevision: reinspection.task.revision,
            idempotencyKey: `${reinspection.task.code}:missing-items`,
          },
        },
      );
    } catch (error) {
      missingReinspectionItemsBlocked = String(error).includes('HTTP 409');
    }
    assert(missingReinspectionItemsBlocked, 'incoming reinspection completed without checkpoint evidence');

    let contradictoryReinspectionItemsBlocked = false;
    try {
      await request(
        baseUrl,
        `/quality/incoming/${encodeURIComponent(incomingCode)}/reinspections/${encodeURIComponent(reinspection.task.code)}/decide`,
        {
          method: 'POST',
          body: {
            acceptedQty: 0.5,
            rejectedQty: 0.5,
            inspectionItems: frozenReinspectionItems.map((item) => ({ ...item, actual: '复检正常', result: '合格', note: '' })),
            actor: '复检员',
            taskRevision: reinspection.task.revision,
            idempotencyKey: `${reinspection.task.code}:contradictory-items`,
          },
        },
      );
    } catch (error) {
      contradictoryReinspectionItemsBlocked = String(error).includes('HTTP 409');
    }
    assert(contradictoryReinspectionItemsBlocked, 'incoming reinspection accepted rejected quantity without an abnormal checkpoint');

    const completedReinspection = await request(
      baseUrl,
      `/quality/incoming/${encodeURIComponent(incomingCode)}/reinspections/${encodeURIComponent(reinspection.task.code)}/decide`,
      {
        method: 'POST',
        body: {
          acceptedQty: 0.5,
          rejectedQty: 0.5,
          inspectionItems: frozenReinspectionItems.map((item) => ({
            ...item,
            actual: '水分复测仍有部分超标',
            result: '不合格',
            note: '0.5 kg 继续保留隔离',
          })),
          actor: '复检员',
          taskRevision: reinspection.task.revision,
          idempotencyKey: `${reinspection.task.code}:decide:1`,
        },
      },
    );
    assert(completedReinspection.task.status === '已完成', 'incoming reinspection result was not persisted');
    assert(completedReinspection.task.inspectionItems[0].result === '不合格', 'incoming reinspection checkpoint result was not persisted');
    assert(completedReinspection.task.resultReason.includes('复检仍不合格'), 'incoming reinspection did not derive a concise result summary');
    const reinspectionInventory = inventoryRow(await request(baseUrl, '/warehouse/inventory'), purchaseReceipt.receipt, receiptMaterial);
    assert(reinspectionInventory?.pendingInboundNumber === 3.5, 'reinspection accepted quantity did not enter pending inbound');
    assert(reinspectionInventory?.rejectedHoldNumber === 1.5, 'reinspection accepted quantity did not leave rejected hold');

    const receiptReadyForInbound = await request(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(receiptCode)}`);
    await request(baseUrl, `/warehouse/purchase-receipts/${encodeURIComponent(receiptCode)}`, {
      method: 'PUT',
      body: {
        ...receiptReadyForInbound.receipt,
        products: receiptReadyForInbound.receipt.products.map((product, index) => ({
          ...product,
          destinationWarehouseCode: index === 0 ? 'WH-RM' : 'WH-PKG',
          destinationWarehouse: index === 0 ? '原料仓' : '包材仓',
          destinationLocation: index === 0 ? 'RM-01' : 'PKG-01',
        })),
      },
    });
    const postedReceipt = await request(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(receiptCode)}/post`,
      { method: 'POST' },
    );
    assert(
      postedReceipt.receipt.stockStage === 'exception_pending'
        && postedReceipt.receipt.status === '部分入库',
      'purchase receipt with unresolved rejected stock did not remain in partial inbound',
    );
    const inventoryAfterPosting = await request(baseUrl, '/warehouse/inventory');
    const postedInventory = (inventoryAfterPosting.items || []).find((row) => (
      row.materialCode === receiptMaterial
      && row.warehouseCode === 'WH-RM'
      && row.batch === postedReceipt.receipt.products[0].batch
    ));
    const stagedRejectedInventory = inventoryRow(inventoryAfterPosting, purchaseReceipt.receipt, receiptMaterial);
    assert(stagedRejectedInventory?.onHandNumber === 1.5, 'formal inbound did not leave rejected physical stock in staging');
    assert(stagedRejectedInventory?.rejectedHoldNumber === 1.5, 'formal inbound released rejected hold');
    assert(postedInventory?.qualifiedOnHandNumber === 3.5, 'warehouse posting did not move released stock into formal qualified inventory');
    assert(
      postedInventory?.availableNumber === Math.max(
        0,
        Number(postedInventory?.qualifiedOnHandNumber || 0)
          - Number(postedInventory?.reservedNumber || 0)
          - Number(postedInventory?.allocatedNumber || 0)
          - Number(postedInventory?.frozenNumber || 0),
      ),
      'warehouse posting did not derive available stock from qualified stock and active occupations',
    );
    const exemptPostedInventory = (inventoryAfterPosting.items || []).find((row) => (
      row.materialCode === exemptMaterial
      && row.warehouseCode === 'WH-PKG'
      && row.batch === postedReceipt.receipt.products[1].batch
    ));
    assert(exemptPostedInventory?.onHandNumber === 2, 'warehouse posting did not move exempt physical stock');
    assert(exemptPostedInventory?.qualifiedOnHandNumber === 2, 'warehouse posting did not qualify exempt stock');
    assert(exemptPostedInventory?.availableNumber === 2, 'warehouse posting did not make exempt stock available');
    assert(postedReceipt.receipt.postedQuantities?.total === undefined, 'mixed-unit receipt exposed a meaningless scalar posted total');
    assert(postedReceipt.receipt.postedQuantities?.totalsByUnit?.kg === 3.5, 'mixed-unit receipt kg posting total is incorrect');
    assert(postedReceipt.receipt.postedQuantities?.totalsByUnit?.['个'] === 2, 'mixed-unit receipt unit posting total is incorrect');
    const purchaseOrderAfterReceipt = await request(baseUrl, `/purchase/orders/${encodeURIComponent(purchaseOrder.order.code)}`);
    assert(purchaseOrderAfterReceipt.order.status !== '已完成', 'rejected quantity incorrectly completed the purchase order');
    const returnedDisposition = await request(baseUrl, `/quality/incoming/${encodeURIComponent(incomingCode)}/dispose`, {
      method: 'POST',
      body: {
        receiptLineId: receivedForQuality.record.products[0].lineId,
        action: 'return_to_supplier',
        quantity: 0.5,
        reason: '自动流程验证供应商退货处置',
        actor: '质检负责人',
        decisionVersion: qualityDecision.decision.version,
        dispositionVersion: 0,
        idempotencyKey: `${incomingCode}:dispose:return:1`,
      },
    });
    assert(returnedDisposition.disposition.action === 'return_to_supplier', 'incoming rejection was not transferred to purchase after-sales');
    assert(returnedDisposition.returnDocument?.status === '待采购受理', 'purchase after-sales handoff document was not created');
    assert(returnedDisposition.returnDocument?.afterSaleCode, 'purchase after-sales handoff did not include its source case');
    const repeatedDisposition = await request(baseUrl, `/quality/incoming/${encodeURIComponent(incomingCode)}/dispose`, {
      method: 'POST',
      body: {
        receiptLineId: receivedForQuality.record.products[0].lineId,
        action: 'return_to_supplier',
        quantity: 0.5,
        reason: '自动流程验证供应商退货处置',
        actor: '质检负责人',
        decisionVersion: qualityDecision.decision.version,
        dispositionVersion: 0,
        idempotencyKey: `${incomingCode}:dispose:return:1`,
      },
    });
    assert(repeatedDisposition.repeated === true, 'incoming disposition retry was not idempotent');
    const returnedInventory = inventoryRow(await request(baseUrl, '/warehouse/inventory'), purchaseReceipt.receipt, receiptMaterial);
    assert(returnedInventory?.onHandNumber === 1.5, 'quality handoff incorrectly reduced physical on-hand');
    assert(returnedInventory?.rejectedHoldNumber === 1.5, 'quality handoff incorrectly released rejected hold');
    const lateConcession = await request(baseUrl, `/quality/incoming/${encodeURIComponent(incomingCode)}/dispose`, {
      method: 'POST',
      body: {
        receiptLineId: receivedForQuality.record.products[0].lineId,
        action: 'approve_concession',
        quantity: 1,
        reason: '部分入库后经质量经理批准让步接收',
        approvedBy: '质量经理',
        actor: '质检负责人',
        decisionVersion: qualityDecision.decision.version,
        dispositionVersion: 1,
        idempotencyKey: `${incomingCode}:dispose:late-concession`,
      },
    });
    assert(
      lateConcession.receipt.stockStage === 'pending_inbound'
        && lateConcession.receipt.status === '待入库',
      'late concession did not release a supplemental inbound quantity',
    );
    const supplementalPosting = await request(
      baseUrl,
      `/warehouse/purchase-receipts/${encodeURIComponent(receiptCode)}/post`,
      {
        method: 'POST',
        body: {
          idempotencyKey: `${receiptCode}:post:supplemental-concession`,
          allocations: [{
            receiptLineId: receivedForQuality.record.products[0].lineId,
            quantity: 1,
            warehouseCode: 'WH-RM',
            warehouse: '原料仓',
            location: 'RM-01',
          }],
        },
      },
    );
    assert(
      supplementalPosting.posting.lines.length === 1
        && supplementalPosting.posting.lines[0].postedQty === 1,
      'late concession was not posted as an independent supplemental inbound fact',
    );
    assert(
      supplementalPosting.receipt.inboundPostings.length === 2,
      'supplemental inbound overwrote the original posting instead of appending history',
    );

    let invalidOtherMoveWarehouseBlocked = false;
    try {
      await request(baseUrl, '/warehouse/other-moves', {
        method: 'POST',
        body: {
          code: '系统自动生成',
          moveType: '样品出库',
          direction: '出库',
          reason: '验证无效仓库拦截',
          warehouseCode: 'WH-NOT-EXISTS',
          warehouse: '客户端伪造仓库',
          targetWarehouse: '试样室',
          owner: '王倩',
          date: shanghaiDate(),
          products: [{
            materialCode: exemptPostedInventory.materialCode,
            name: exemptPostedInventory.item,
            qty: `1 ${exemptPostedInventory.uom}`,
            batch: exemptPostedInventory.batch,
            uom: exemptPostedInventory.uom,
          }],
        },
      });
    } catch (error) {
      invalidOtherMoveWarehouseBlocked = String(error).includes('HTTP 400');
    }
    assert(invalidOtherMoveWarehouseBlocked, 'other move accepted a nonexistent warehouse');

    let placeholderOtherMoveLocationBlocked = false;
    try {
      await request(baseUrl, '/warehouse/other-moves', {
        method: 'POST',
        body: {
          code: '系统自动生成',
          moveType: '样品出库',
          direction: '出库',
          reason: '占位库位门禁回归',
          targetWarehouse: '客户验证现场',
          warehouseCode: 'WH-PKG',
          location: '默认库位',
          owner: '王倩',
          date: '2026-08-02',
          products: [{
            materialCode: exemptMaterial,
            name: exemptPostedInventory.item,
            qty: '1',
            batch: exemptPostedInventory.batch,
            uom: exemptPostedInventory.uom,
          }],
        },
      });
    } catch (error) {
      placeholderOtherMoveLocationBlocked = String(error).includes('HTTP 400');
    }
    assert(placeholderOtherMoveLocationBlocked, 'other move accepted a placeholder warehouse location');

    const usageMove = await request(baseUrl, '/warehouse/other-moves', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        moveType: '领用出库',
        direction: '入库',
        reason: '设备维修更换备件',
        warehouseCode: 'WH-PKG',
        warehouse: '客户端伪造仓库名称',
        location: exemptPostedInventory.location,
        targetWarehouse: '设备维修组',
        owner: '王倩',
        date: shanghaiDate(),
        products: [{
          materialCode: exemptPostedInventory.materialCode,
          name: exemptPostedInventory.item,
          qty: `1 ${exemptPostedInventory.uom}`,
          batch: exemptPostedInventory.batch,
          uom: exemptPostedInventory.uom,
        }],
      },
    });
    assert(usageMove.move.moveType === '领用出库', 'usage issue was not accepted as an other-move business type');
    assert(usageMove.move.direction === '出库', 'usage issue did not enforce outbound inventory direction');
    const submittedUsageMove = await request(
      baseUrl,
      `/warehouse/other-moves/${encodeURIComponent(usageMove.move.code)}/status`,
      {
        method: 'POST',
        body: { status: '待审核', action: '提交审核', remark: '维修领用用途和数量待审核。' },
      },
    );
    assert(submittedUsageMove.record.status === '待审核', 'usage issue could not enter the standard approval flow');

    const otherMove = await request(baseUrl, '/warehouse/other-moves', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        moveType: '样品出库',
        direction: '入库',
        reason: '客户材料验证样品',
        warehouseCode: 'WH-PKG',
        warehouse: '客户端伪造仓库名称',
        location: exemptPostedInventory.location,
        targetWarehouse: '客户材料验证室',
        owner: '王倩',
        date: shanghaiDate(),
        note: '',
        attachments: [{ name: '样品申请.pdf', size: '8 KB', uploader: '王倩', date: shanghaiDate() }],
        products: [{
          materialCode: exemptPostedInventory.materialCode,
          name: '客户端伪造物料名称',
          qty: `1 ${exemptPostedInventory.uom}`,
          batch: exemptPostedInventory.batch,
          uom: exemptPostedInventory.uom,
        }],
      },
    });
    const otherMoveCode = otherMove.move.code;
    assert(otherMove.move.status === '草稿', 'other move did not start as draft');
    assert(otherMove.move.direction === '出库', 'other move trusted a direction inconsistent with its business type');
    assert(otherMove.move.warehouse === '包材仓', 'other move did not canonicalize the warehouse name');
    assert(otherMove.move.location === exemptPostedInventory.location, 'other move lost its exact inventory location');
    assert(otherMove.move.products[0].name !== '客户端伪造物料名称', 'other move trusted the client material name');
    assert(otherMove.move.note === '', 'other move invented a default note');
    assert(otherMove.move.attachments.length === 1, 'other move did not persist its attachment');
    const submittedOtherMove = await request(baseUrl, `/warehouse/other-moves/${encodeURIComponent(otherMoveCode)}/status`, {
      method: 'POST',
      body: { status: '待审核', action: '提交审核', remark: '等待核对用途与数量。' },
    });
    assert(submittedOtherMove.record.status === '待审核' && submittedOtherMove.record.submittedAt, 'other move did not record the submission milestone');
    const approvedOtherMove = await request(baseUrl, `/warehouse/other-moves/${encodeURIComponent(otherMoveCode)}/status`, {
      method: 'POST',
      body: { status: '待过账', action: '审核通过', remark: '用途与数量已核对。' },
    });
    assert(approvedOtherMove.record.status === '待过账' && approvedOtherMove.record.approvedAt, 'other move did not separate approval from posting');
    const replayedApproval = await request(baseUrl, `/warehouse/other-moves/${encodeURIComponent(otherMoveCode)}/status`, {
      method: 'POST',
      body: { status: '待过账', action: '审核通过', remark: '重复审核请求不应重复写入。' },
    });
    assert(replayedApproval.record.status === '待过账', 'other move approval retry was not safely replayable');
    const postedOtherMove = await request(baseUrl, `/warehouse/other-moves/${encodeURIComponent(otherMoveCode)}/post`, {
      method: 'POST',
    });
    assert(postedOtherMove.move.status === '已过账' && postedOtherMove.move.postedAt, 'other move did not record the posting milestone');
    const replayedOtherMovePost = await request(baseUrl, `/warehouse/other-moves/${encodeURIComponent(otherMoveCode)}/post`, {
      method: 'POST',
    });
    assert(replayedOtherMovePost.move.status === '已过账', 'other move posting retry was not safely replayable');
    const inventoryAfterOtherMovePayload = await request(baseUrl, '/warehouse/inventory');
    const inventoryAfterOtherMove = inventoryAfterOtherMovePayload.items.find((row) => (
      row.materialCode === exemptMaterial
      && row.warehouseCode === 'WH-PKG'
      && row.batch === exemptPostedInventory.batch
    ));
    assert(inventoryAfterOtherMove?.onHandNumber === 1, 'other move posting did not reduce physical on-hand once');
    assert(inventoryAfterOtherMove?.availableNumber === 1, 'other move posting did not reduce available inventory once');

    const transfer = await request(baseUrl, '/warehouse/transfers', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        fromWarehouseCode: 'WH-PKG',
        fromWarehouse: '客户端伪造调出仓名称',
        toWarehouseCode: 'WH-RM',
        toWarehouse: '客户端伪造调入仓名称',
        toLocation: 'RM-01',
        owner: '王倩',
        date: shanghaiDate(),
        reason: '包装材料内部补给',
        note: '',
        attachments: [{ name: '调拨交接.pdf', size: '9 KB', uploader: '王倩', date: shanghaiDate() }],
        products: [{
          materialCode: inventoryAfterOtherMove.materialCode,
          name: '客户端伪造调拨物料名称',
          qty: `1 ${inventoryAfterOtherMove.uom}`,
          batch: inventoryAfterOtherMove.batch,
          uom: inventoryAfterOtherMove.uom,
        }],
      },
    });
    const transferCode = transfer.transfer.code;
    assert(transfer.transfer.fromWarehouse === '包材仓', 'transfer did not canonicalize the outbound warehouse');
    assert(transfer.transfer.toWarehouse === '原料仓', 'transfer did not canonicalize the inbound warehouse');
    assert(transfer.transfer.products[0].name !== '客户端伪造调拨物料名称', 'transfer trusted the client material name');
    assert(transfer.transfer.attachments.length === 1 && transfer.transfer.note === '', 'transfer did not preserve its real attachment and blank note');
    const submittedTransfer = await request(baseUrl, `/warehouse/transfers/${encodeURIComponent(transferCode)}/submit`, { method: 'POST' });
    assert(submittedTransfer.transfer.status === '待出库' && submittedTransfer.transfer.submittedAt, 'transfer did not record its submission milestone');
    const dispatchedTransfer = await request(baseUrl, `/warehouse/transfers/${encodeURIComponent(transferCode)}/status`, {
      method: 'POST',
      body: { status: '调拨中', action: '确认调出', remark: '调出仓已交接。' },
    });
    assert(dispatchedTransfer.record.status === '调拨中' && dispatchedTransfer.record.dispatchedAt, 'transfer did not record its dispatch milestone');
    assert(dispatchedTransfer.record.transitLines.length === 1, 'transfer did not create a structured transit line');
    const transferTransitLine = dispatchedTransfer.record.transitLines[0];
    const repeatedDispatch = await request(baseUrl, `/warehouse/transfers/${encodeURIComponent(transferCode)}/status`, {
      method: 'POST',
      body: { status: '调拨中', action: '确认调出', remark: '重复确认不应再次扣减。' },
    });
    assert(repeatedDispatch.idempotentReplay === true, 'transfer repeated dispatch was not idempotent');
    const sourceAfterDispatchPayload = await request(baseUrl, '/warehouse/inventory');
    const sourceAfterDispatch = sourceAfterDispatchPayload.items.find((row) => row.key === transferTransitLine.inventoryKey);
    assert(Number(sourceAfterDispatch?.onHandNumber || 0) === 0, 'transfer dispatch deducted the source inventory more than once');
    const transitPayload = await request(baseUrl, '/warehouse/inventory');
    const targetTransitRow = transitPayload.items.find((row) => row.key === transferTransitLine.targetInventoryKey);
    assert(targetTransitRow?.inTransitNumber === 1 && targetTransitRow?.onHandNumber === 0, 'transfer dispatch did not separate in-transit from inbound stock');
    const completedTransfer = await request(baseUrl, `/warehouse/transfers/${encodeURIComponent(transferCode)}/post`, { method: 'POST' });
    assert(completedTransfer.transfer.status === '已完成' && completedTransfer.transfer.receivedAt, 'transfer did not complete directly from in-transit to received');
    const repeatedTransferReceipt = await request(baseUrl, `/warehouse/transfers/${encodeURIComponent(transferCode)}/post`, { method: 'POST' });
    assert(repeatedTransferReceipt.idempotentReplay === true, 'transfer repeated receipt was not idempotent');
    const targetAfterReceiptPayload = await request(baseUrl, '/warehouse/inventory');
    const targetAfterReceipt = targetAfterReceiptPayload.items.find((row) => row.key === transferTransitLine.targetInventoryKey);
    assert(targetAfterReceipt?.inTransitNumber === 0 && targetAfterReceipt?.onHandNumber === 1, 'transfer receipt did not consume transit and increase target inventory once');

    const stocktake = await request(baseUrl, '/warehouse/stocktakes', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        warehouseCode: 'WH-RM',
        warehouse: '原料仓',
        scope: exemptPostedInventory.materialCode,
        owner: '王倩',
        plannedCount: 1,
        checkedCount: 0,
        differenceCount: 0,
        note: '自动流程冒烟检查',
      },
    });
    const startedStocktake = await request(
      baseUrl,
      `/warehouse/stocktakes/${encodeURIComponent(stocktake.stocktake.code)}/start`,
      { method: 'POST' },
    );
    assert(startedStocktake.stocktake.status === '盘点中', 'stocktake was not started');
    const countedStocktake = await request(
      baseUrl,
      `/warehouse/stocktakes/${encodeURIComponent(stocktake.stocktake.code)}`,
      {
        method: 'PUT',
        body: {
          ...startedStocktake.stocktake,
          lines: startedStocktake.stocktake.lines.map((line) => ({ ...line, countedQty: line.bookQty })),
        },
      },
    );
    assert(countedStocktake.stocktake.checkedCount === countedStocktake.stocktake.plannedCount, 'stocktake count was not saved');
    const submittedStocktake = await request(
      baseUrl,
      `/warehouse/stocktakes/${encodeURIComponent(stocktake.stocktake.code)}/submit`,
      { method: 'POST' },
    );
    assert(submittedStocktake.stocktake.status === '待复核', 'stocktake was not submitted for review');
    const completedStocktake = await request(
      baseUrl,
      `/warehouse/stocktakes/${encodeURIComponent(stocktake.stocktake.code)}/complete`,
      { method: 'POST' },
    );
    assert(completedStocktake.stocktake.status === '已完成', 'stocktake was not completed');

    const removedSalesFinance = await requestResult(baseUrl, '/finance/sales-invoices', {
      method: 'POST',
      body: { code: '系统自动生成', sourceDoc: order.order.code },
    });
    assert(
      removedSalesFinance.response.status === 410
        && String(removedSalesFinance.payload.error || '').includes('独立财务模块已移除'),
      'removed finance API did not remain explicitly unavailable',
    );

    const productionSalesOrderDraft = await request(baseUrl, '/sales/orders', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        customerCode: 'CUS-00001',
        customer: '杭州晨星科技',
        contact: '陈经理',
        contactPhone: '138-0571-6001',
        products: [{
          lineId: 'L1',
          materialCode: 'M-FG-PLA-175-MBK',
          name: 'PLA 1.75mm 哑光黑耗材 1kg',
          qty: '2 卷',
          unitPrice: '69.00',
          amount: '138.00',
          uom: '卷',
        }],
        owner: '李明',
        priority: '正常',
        delivery: shanghaiDate(10),
        plannedShipDate: shanghaiDate(5),
        shipContact: '陈经理',
        shipPhone: '138-0571-6001',
        shipAddress: '浙江省杭州市滨江区流程验证路 8 号',
        deliveryMethod: '送货到厂',
        paymentMethod: '月结 30 天',
        supplementaryRequirement: '包装前核对项目标签，生产与仓库都要留意。',
        internalNote: '仅销售内部：客户可能追加同款订单。',
        attachments: [],
      },
    });
    const productionSalesOrder = await request(
      baseUrl,
      `/sales/orders/${encodeURIComponent(productionSalesOrderDraft.order.code)}/confirm`,
      { method: 'POST', body: { revision: productionSalesOrderDraft.order.revision } },
    );
    assert(productionSalesOrder.order.documentStatus === '已确认', 'production-linked sales order was not confirmed');

    const processStageCodes = [
      'P2-STEP-MATERIAL-ISSUE',
      'P2-STEP-STARTUP',
      'P2-STEP-FIRST-INSPECTION',
      'P2-STEP-WIP-REPORT-LARGE-REEL',
      'P2-STEP-WIP-QC',
      'P2-STEP-FINISHED-REPORT-SMALL-REEL',
      'P2-STEP-FINISHED-QC',
      'P2-STEP-PACKAGING',
      'P2-STEP-INBOUND-SAMPLING',
      'P2-STEP-FINISHED-INBOUND',
    ];
    const processZoneNames = ['水槽', '10区', '9区', '4区', '3区', '2区', '1区', '13区', '12区', '11区', '8区', '7区', '6区', '5区'];
    const processTemperatureZones = processZoneNames.map((name, index) => ({
      name,
      value: String(index === 0 ? 60 : 185 + (index % 4) * 5),
    }));
    const invalidProcessRoute = await requestResult(baseUrl, '/production/process-templates', {
      method: 'POST',
      body: {
        name: '自动流程乱序工艺',
        version: 'v1',
        routeType: '大盘复绕',
        productFamily: 'PLA 自动流程验证',
        lineTypes: ['拉丝机'],
        temperatureTolerance: '±3℃',
        temperatureZones: processTemperatureZones,
        stepCodes: [processStageCodes[1], processStageCodes[0], ...processStageCodes.slice(2)],
      },
    });
    assert(
      invalidProcessRoute.response.status === 400
        && String(invalidProcessRoute.payload.error || '').includes('系统规定的'),
      'production process template accepted a reordered system route',
    );
    const invalidProcessZones = await requestResult(baseUrl, '/production/process-templates', {
      method: 'POST',
      body: {
        name: '自动流程缺温区工艺',
        version: 'v1',
        routeType: '大盘复绕',
        productFamily: 'PLA 自动流程验证',
        lineTypes: ['拉丝机'],
        temperatureTolerance: '±3℃',
        temperatureZones: processTemperatureZones.slice(0, -1),
        stepCodes: processStageCodes,
      },
    });
    assert(
      invalidProcessZones.response.status === 400
        && String(invalidProcessZones.payload.error || '').includes('固定的 14 个区域'),
      `production process template accepted an incomplete temperature skeleton (${invalidProcessZones.response.status}: ${invalidProcessZones.payload.error || '-'})`,
    );
    const switchedProcessRoute = await requestResult(baseUrl, '/production/process-templates', {
      method: 'POST',
      body: {
        sourceProcessTemplateCode: 'PRC2-EXTRUSION-V1',
        name: '挤出成品标准工艺',
        version: 'v2',
        routeType: '大盘复绕',
        productFamily: '挤出类成品',
        lineTypes: ['挤出 A 线'],
        temperatureTolerance: '±5℃',
        temperatureZones: processTemperatureZones,
        stepCodes: processStageCodes,
      },
    });
    assert(
      switchedProcessRoute.response.status === 409
        && String(switchedProcessRoute.payload.error || '').includes('必须沿用来源工艺的生产路线'),
      'production process version was allowed to switch away from its source route',
    );
    const packagingAsProductionLine = await requestResult(baseUrl, '/production/process-templates', {
      method: 'POST',
      body: {
        name: '错误包装产线工艺',
        version: 'v1',
        routeType: '大盘复绕',
        productFamily: 'PLA 自动流程验证',
        lineTypes: ['拉丝机', '包装工位'],
        temperatureTolerance: '±3℃',
        temperatureZones: processTemperatureZones,
        stepCodes: processStageCodes,
      },
    });
    assert(
      packagingAsProductionLine.response.status === 400
        && String(packagingAsProductionLine.payload.error || '').includes('包装工位请在包装阶段维护'),
      'production process template accepted a packaging workstation as a schedulable production line',
    );
    const processTemplateDraft = await request(baseUrl, '/production/process-templates', {
      method: 'POST',
      headers: { 'x-filatrix-account': 'production01' },
      body: {
        name: '自动流程复绕工艺',
        version: 'v1',
        routeType: '大盘复绕',
        productFamily: 'PLA 自动流程验证',
        lineTypes: ['拉丝机', '复绕机'],
        temperatureTolerance: '±3℃',
        temperatureZones: processTemperatureZones,
        stepCodes: processStageCodes,
        stepInstructions: [
          {
            stepCode: 'P2-STEP-MATERIAL-ISSUE',
            coreEquipment: '自动流程备料区',
            workContent: '按冻结配方核对物料和批次。',
            controlPoints: '仓库确认发料 + 生产确认领料烘干。',
            commonIssues: '缺料或批次不符时登记异常。',
          },
          {
            stepCode: 'P2-STEP-FINISHED-REPORT-SMALL-REEL',
            coreEquipment: '自动流程专用复绕机',
            workContent: '按自动流程验证要求复绕并保留来源大盘。',
            controlPoints: '自动流程验证小盘批次生成且来源关系完整。',
            commonIssues: '自动流程验证异常时阻断并登记。',
          },
        ],
        owner: '工艺工程',
        attachments: [],
      },
    });
    assert(processTemplateDraft.record.owner === '周宁', 'production process template trusted a payload owner instead of the authenticated actor');
    assert(processTemplateDraft.record.createdBy === '周宁', 'production process template did not stamp the authenticated creator');
    assert(
      processTemplateDraft.record.stepInstructions?.find((step) => step.stepCode === 'P2-STEP-MATERIAL-ISSUE')?.controlPoints === '生产领料已过账，实际发料数量和原料批次已记录。',
      'retired material-preparation confirmation survived process template normalization',
    );
    const activeProcessTemplate = await request(
      baseUrl,
      `/production/process-templates/${encodeURIComponent(processTemplateDraft.record.code)}`,
      {
        method: 'PUT',
        headers: { 'x-filatrix-account': 'production01' },
        body: { ...processTemplateDraft.record, command: 'activate' },
      },
    );
    assert(activeProcessTemplate.record.status === '启用', 'production process template was not activated');
    assert(activeProcessTemplate.flowRecords?.length === 2, 'production process template flow records were not persisted');
    const immutableActiveProcessTemplate = await requestResult(
      baseUrl,
      `/production/process-templates/${encodeURIComponent(activeProcessTemplate.record.code)}`,
      {
        method: 'PUT',
        headers: { 'x-filatrix-account': 'production01' },
        body: { ...activeProcessTemplate.record, command: 'save', name: '不应原地改写的启用工艺' },
      },
    );
    assert(
      immutableActiveProcessTemplate.response.status === 409
        && String(immutableActiveProcessTemplate.payload.error || '').includes('不能直接编辑'),
      'an activated production process version was edited in place',
    );
    const nextProcessTemplateVersion = await request(baseUrl, '/production/process-templates', {
      method: 'POST',
      headers: { 'x-filatrix-account': 'production01' },
      body: {
        ...activeProcessTemplate.record,
        code: '系统自动生成',
        sourceProcessTemplateCode: activeProcessTemplate.record.code,
        version: 'v2',
        status: '草稿',
        revision: 0,
      },
    });
    assert(
      nextProcessTemplateVersion.record.sourceProcessTemplateCode === activeProcessTemplate.record.code,
      'production process next version lost its source lineage',
    );
    assert(nextProcessTemplateVersion.record.version === 'v2', 'production process next version was not generated in sequence');
    assert(nextProcessTemplateVersion.record.routeType === activeProcessTemplate.record.routeType, 'production process next version changed route');
    const parallelProcessVersionActivation = await requestResult(
      baseUrl,
      `/production/process-templates/${encodeURIComponent(nextProcessTemplateVersion.record.code)}`,
      {
        method: 'PUT',
        headers: { 'x-filatrix-account': 'production01' },
        body: { ...nextProcessTemplateVersion.record, command: 'activate' },
      },
    );
    assert(
      parallelProcessVersionActivation.response.status === 409
        && String(parallelProcessVersionActivation.payload.error || '').includes('请先停用原版本'),
      'production process allowed two enabled versions in the same version family',
    );

    const sourceProductionTask = await request(baseUrl, '/production/tasks', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        command: 'submit',
        idempotencyKey: `smoke-production-task-${runId}`,
        sourceType: '销售订单',
        sourceCode: productionSalesOrder.order.code,
        deliveryDate: shanghaiDate(10),
        ownerEmployeeCode: 'EMP-ZN',
        owner: '周宁',
        note: '生产任务备注：优先安排白班。',
        products: [{
          lineId: 'L1',
          productCode: 'M-FG-PLA-175-MBK',
          productName: 'PLA 1.75mm 哑光黑耗材 1kg',
          demandQty: 2,
          unit: '卷',
          recipeCode: 'BOM-PLA-175-MBK-V1',
        }],
        materialNeeds: [{
          lineId: 'MAT-1',
          materialCode: 'M-RM-PLA-VIRGIN',
          materialName: 'PLA 原生粒子',
          estimatedQty: 2,
          availableQty: 2,
          shortageQty: 0,
          procurementGapQty: 0,
          unit: 'kg',
        }],
      },
    });
    assert(
      sourceProductionTask.record.supplementaryRequirement === productionSalesOrder.order.supplementaryRequirement
      && sourceProductionTask.record.note === '生产任务备注：优先安排白班。'
      && !Object.prototype.hasOwnProperty.call(sourceProductionTask.record, 'internalNote'),
      'production task did not isolate the sales requirement, task note, and sales-only order note',
    );
    const workOrderDraft = await request(baseUrl, '/production/work-orders', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        sourceTask: sourceProductionTask.record.code,
        sourceDocument: productionSalesOrder.order.code,
        sourceLineId: 'L1',
        productCode: 'M-FG-PLA-175-MBK',
        productName: 'PLA 1.75mm 哑光黑耗材 1kg',
        planQty: 2,
        unit: '卷',
        recipeCode: 'BOM-PLA-175-MBK-V1',
        processTemplateCode: activeProcessTemplate.record.code,
        plannedDate: shanghaiDate(1),
        dueDate: shanghaiDate(10),
        ownerEmployeeCode: 'EMP-ZN',
        owner: '周宁',
        note: '生产工单备注：首件确认后再连续生产。',
        command: 'save',
        idempotencyKey: `smoke-work-order-save-${runId}`,
        materialNeeds: [{
          lineId: 'MAT-1',
          materialCode: 'M-RM-PLA-VIRGIN',
          materialName: 'PLA 原生粒子',
          perUnitQty: 1,
          estimatedQty: 2,
          unit: 'kg',
        }],
      },
    });
    const persistedWorkOrder = await request(baseUrl, `/production/work-orders/${encodeURIComponent(workOrderDraft.record.code)}`);
    assert(persistedWorkOrder.record.sourceLineId === 'L1', 'work order source line was not persisted');
    assert(
      persistedWorkOrder.record.sourceAllocations?.[0]?.supplementaryRequirement === productionSalesOrder.order.supplementaryRequirement
      && persistedWorkOrder.record.sourceAllocations?.[0]?.taskNote === sourceProductionTask.record.note
      && persistedWorkOrder.record.note === '生产工单备注：首件确认后再连续生产。',
      'work order did not preserve per-task requirement context and its own independent note',
    );
    const workOrderBootstrap = await request(baseUrl, '/production/work-orders');
    assert(
      Array.isArray(workOrderBootstrap.items)
        && Array.isArray(workOrderBootstrap.tasks)
        && Array.isArray(workOrderBootstrap.materialRequests)
        && Array.isArray(workOrderBootstrap.executionCards)
        && Array.isArray(workOrderBootstrap.releaseBatches)
        && Array.isArray(workOrderBootstrap.productionLines),
      'production work-order bootstrap did not return the related read-model collections',
    );
    assert(
      workOrderBootstrap.productionLines.some((line) => line.code === 'LINE-PLA-01' && line.status === '启用'),
      'production work-order bootstrap did not consume the enabled production-line master',
    );
    assert(
      workOrderBootstrap.items.some((item) => item.code === workOrderDraft.record.code),
      'production work-order bootstrap omitted the newly saved work order',
    );
    let invalidVersionBlocked = false;
    try {
      await request(baseUrl, `/production/work-orders/${encodeURIComponent(workOrderDraft.record.code)}`, {
        method: 'PUT',
        body: {
          ...workOrderDraft.record,
          recipeCode: 'BOM2-NOT-EXISTS',
          command: 'submit',
          idempotencyKey: `smoke-work-order-invalid-version-${runId}`,
        },
      });
    } catch (error) {
      invalidVersionBlocked = String(error).includes('HTTP 409');
    }
    assert(invalidVersionBlocked, 'work order accepted an unknown recipe version');
    const submittedWorkOrder = await request(baseUrl, `/production/work-orders/${encodeURIComponent(workOrderDraft.record.code)}`, {
      method: 'PUT',
      body: {
        ...workOrderDraft.record,
        command: 'submit',
        idempotencyKey: `smoke-work-order-submit-${runId}`,
      },
    });
    assert(submittedWorkOrder.record.documentStatus === '已确认', 'work order was not submitted');
    assert(submittedWorkOrder.record.snapshot?.recipeVersionId === 'BOM-PLA-175-MBK-V1', 'work order recipe snapshot was not frozen');
    assert(submittedWorkOrder.record.snapshot?.snapshotStatus === 'server_frozen', 'work order snapshot was not frozen by the server');
    assert(submittedWorkOrder.record.snapshot?.recipe?.materials?.length === 3, 'work order recipe material snapshot is incomplete');
    assert(submittedWorkOrder.record.snapshot?.processTemplate?.code === activeProcessTemplate.record.code, 'work order process template snapshot is missing');
    assert(submittedWorkOrder.record.snapshot?.processTemplate?.temperatureZones?.length === 14, 'work order process temperature snapshot must keep all 14 zones');
    assert(submittedWorkOrder.record.snapshot?.processTemplate?.temperatureZones?.[0]?.name === '水槽', 'work order process temperature snapshot starts in the wrong zone');
    assert(submittedWorkOrder.record.snapshot?.processTemplate?.temperatureZones?.at(-1)?.name === '5区', 'work order process temperature snapshot ends in the wrong zone');
    assert(submittedWorkOrder.record.snapshot?.processSteps?.length === 10, 'work order process stage snapshot is incomplete');
    assert(Boolean(submittedWorkOrder.record.snapshot?.processSteps?.[0]?.workInstruction), 'work order process stage guidance was not frozen');
    assert(submittedWorkOrder.record.snapshot?.processSteps?.[0]?.name === '物料准备', 'work order snapshot kept a legacy material stage name');
    assert(submittedWorkOrder.record.snapshot?.processSteps?.[0]?.actionCodes?.join(',') === 'SA2-CREATE-MATERIAL-ISSUE', 'material stage snapshot is not bound to the warehouse issue capability');
    assert(!JSON.stringify(submittedWorkOrder.record.snapshot?.processSteps).includes('领料烘干确认'), 'work order snapshot contains a retired system action');
    assert(
      submittedWorkOrder.record.snapshot?.processSteps?.find((stage) => stage.code === 'P2-STEP-STARTUP')?.executionMode === '生产动作',
      'production stage execution type was confused with the system-action capability catalog',
    );
    const frozenFinishedStage = submittedWorkOrder.record.snapshot?.processSteps?.find((stage) => stage.code === 'P2-STEP-FINISHED-REPORT-SMALL-REEL');
    assert(frozenFinishedStage?.name === '复绕成品与报工', 'rewinding route stage name was not frozen with the correct route meaning');
    assert(frozenFinishedStage?.coreEquipment === '自动流程专用复绕机', 'maintained process equipment was replaced by generic guidance');
    assert(frozenFinishedStage?.workInstruction === '按自动流程验证要求复绕并保留来源大盘。', 'maintained process work instruction was not frozen');
    assert(frozenFinishedStage?.completionRule === '自动流程验证小盘批次生成且来源关系完整。', 'maintained process completion rule was not frozen');
    assert(frozenFinishedStage?.abnormalRule === '自动流程验证异常时阻断并登记。', 'maintained process abnormal rule was not frozen');
    assert(Boolean(submittedWorkOrder.record.snapshot?.payloadHash), 'work order snapshot payload fingerprint is missing');
    assert(submittedWorkOrder.record.materialNeeds?.length === 3, 'submitted work order did not persist every frozen recipe material');
    assert(
      submittedWorkOrder.record.materialNeeds.some((line) => line.materialCode === 'M-PKG-SPOOL-1KG' && Number(line.estimatedQty) > 2),
      'submitted work order omitted the spool requirement or its configured loss',
    );
    let freeTextLineBlocked = false;
    try {
      await request(
        baseUrl,
        `/production/work-orders/${encodeURIComponent(submittedWorkOrder.record.code)}/release`,
        {
          method: 'POST',
          body: {
            releaseQty: 2,
            workOrderRevision: submittedWorkOrder.record.revision,
            idempotencyKey: `${submittedWorkOrder.record.code}:release:free-text-line`,
            line: '不存在的自由文本产线',
            shift: '白班',
            leader: '生产主管',
          },
        },
      );
    } catch (error) {
      freeTextLineBlocked = String(error).includes('HTTP 409');
    }
    assert(freeTextLineBlocked, 'work order release accepted a free-text production line');
    let incompatibleLineBlocked = false;
    try {
      await request(
        baseUrl,
        `/production/work-orders/${encodeURIComponent(submittedWorkOrder.record.code)}/release`,
        {
          method: 'POST',
          body: {
            releaseQty: 2,
            workOrderRevision: submittedWorkOrder.record.revision,
            idempotencyKey: `${submittedWorkOrder.record.code}:release:wrong-capability`,
            lineCode: 'LINE-REWIND-01',
            line: '一号复绕线',
            shift: '白班',
            leader: '生产主管',
          },
        },
      );
    } catch (error) {
      incompatibleLineBlocked = String(error).includes('HTTP 409');
    }
    assert(incompatibleLineBlocked, 'work order release accepted a line with the wrong process capability');
    let incompleteFrozenMaterialBlocked = false;
    try {
      await request(
        baseUrl,
        `/production/work-orders/${encodeURIComponent(submittedWorkOrder.record.code)}/release`,
        {
          method: 'POST',
          body: {
            releaseQty: 2,
            workOrderRevision: submittedWorkOrder.record.revision,
            idempotencyKey: `${submittedWorkOrder.record.code}:release:missing-spool`,
            lineCode: 'LINE-PLA-01',
            line: 'PLA 一号挤出线',
            shift: '白班',
            leader: '生产主管',
          },
        },
      );
    } catch (error) {
      incompleteFrozenMaterialBlocked = String(error).includes('小盘线轴 1kg 缺');
    }
    assert(incompleteFrozenMaterialBlocked, 'work order release ignored a material that exists only in the frozen recipe');

    const flowData = JSON.parse(await readFile(dataFile, 'utf8'));
    flowData.warehouse.inventory.push({
      key: `M-PKG-SPOOL-1KG::WH-PKG::PKG-01::FLOW-SPOOL-${runId}`,
      item: '小盘线轴 1kg',
      itemType: '包材',
      materialCode: 'M-PKG-SPOOL-1KG',
      warehouseCode: 'WH-PKG',
      warehouse: '包材仓',
      location: 'PKG-01',
      batch: `FLOW-SPOOL-${runId}`,
      onHandNumber: 10,
      qualifiedOnHandNumber: 10,
      reservedNumber: 0,
      allocatedNumber: 0,
      frozenNumber: 0,
      availableNumber: 10,
      qcHoldNumber: 0,
      pendingInboundNumber: 0,
      inTransitNumber: 0,
      outboundPlanNumber: 0,
      onHand: '10 个',
      available: '10 个',
      status: '正常',
      uom: '个',
      updatedAt: `${shanghaiDate()} 08:00`,
    });
    const nonIssueWarehouseInventoryKey = `M-RM-PLA-VIRGIN::WH-FG::FG-RAW-HOLD::FLOW-NON-ISSUE-${runId}`;
    const stocktakeFrozenInventoryKey = `M-RM-PLA-VIRGIN::WH-RM::RM-FROZEN::FLOW-FROZEN-${runId}`;
    flowData.warehouse.inventory.unshift(
      {
        key: nonIssueWarehouseInventoryKey,
        item: 'PLA 原生粒子',
        itemType: '原料',
        materialCode: 'M-RM-PLA-VIRGIN',
        warehouseCode: 'WH-FG',
        warehouse: '成品仓',
        location: 'FG-RAW-HOLD',
        batch: `FLOW-NON-ISSUE-${runId}`,
        batchDate: '2019-01-01',
        expiryDate: '2039-01-01',
        onHandNumber: 9999,
        qualifiedOnHandNumber: 9999,
        reservedNumber: 0,
        allocatedNumber: 0,
        frozenNumber: 0,
        availableNumber: 9999,
        qcHoldNumber: 0,
        pendingInboundNumber: 0,
        inTransitNumber: 0,
        outboundPlanNumber: 0,
        onHand: '9,999 kg',
        available: '9,999 kg',
        status: '正常',
        uom: 'kg',
        updatedAt: `${shanghaiDate()} 08:00`,
      },
      {
        key: stocktakeFrozenInventoryKey,
        item: 'PLA 原生粒子',
        itemType: '原料',
        materialCode: 'M-RM-PLA-VIRGIN',
        warehouseCode: 'WH-RM',
        warehouse: '原料仓',
        location: 'RM-FROZEN',
        batch: `FLOW-FROZEN-${runId}`,
        batchDate: '2020-01-01',
        expiryDate: '2040-01-01',
        onHandNumber: 8888,
        qualifiedOnHandNumber: 8888,
        reservedNumber: 0,
        allocatedNumber: 0,
        frozenNumber: 0,
        availableNumber: 8888,
        qcHoldNumber: 0,
        pendingInboundNumber: 0,
        inTransitNumber: 0,
        outboundPlanNumber: 0,
        onHand: '8,888 kg',
        available: '8,888 kg',
        status: '正常',
        uom: 'kg',
        updatedAt: `${shanghaiDate()} 08:00`,
        freezeSources: [{
          type: '盘点冻结',
          sourceDoc: `ST-FLOW-ACTIVE-${runId}`,
          sourceLineId: stocktakeFrozenInventoryKey,
          quantityNumber: 0,
          qty: '0 kg',
          status: '盘点中',
          path: `/warehouse/stocktakes/ST-FLOW-ACTIVE-${runId}`,
        }],
      },
    );
    await writeFile(dataFile, JSON.stringify(flowData, null, 2), 'utf8');
    const inventoryBeforeRelease = await request(baseUrl, '/warehouse/inventory');
    const nonIssueWarehouseRow = inventoryBeforeRelease.items.find((row) => row.key === nonIssueWarehouseInventoryKey);
    const stocktakeFrozenRow = inventoryBeforeRelease.items.find((row) => row.key === stocktakeFrozenInventoryKey);
    assert(nonIssueWarehouseRow?.allowProductionIssue === false, 'inventory API did not project the warehouse production-issue function');
    assert(stocktakeFrozenRow?.stocktakeFrozen === true, 'inventory API did not project the active stocktake freeze');
    const workOrderRelease = await request(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(submittedWorkOrder.record.code)}/release`,
      {
        method: 'POST',
        body: {
          releaseQty: 2,
          workOrderRevision: submittedWorkOrder.record.revision,
          idempotencyKey: `${submittedWorkOrder.record.code}:release:1`,
          lineCode: 'LINE-PLA-01',
          line: 'PLA 一号挤出线',
          shift: '白班',
          leader: '生产主管',
          actor: '生产主管',
        },
      },
    );
    assert(workOrderRelease.release.releasedQty === 2, 'work order release quantity was not persisted');
    assert(workOrderRelease.release.lineCode === 'LINE-PLA-01', 'work order release did not persist the stable production-line reference');
    assert(workOrderRelease.release.line === 'PLA 一号挤出线', 'work order release did not preserve the canonical production-line name');
    assert(workOrderRelease.release.lineType === '挤出产线', 'work order release did not preserve the canonical production-line type');
    assert(workOrderRelease.release.materialAllocations.length === 3, 'work order release did not allocate every frozen recipe material');
    assert(
      !workOrderRelease.release.materialAllocations.some((allocation) => allocation.inventoryKey === nonIssueWarehouseInventoryKey),
      'work order release allocated material from a warehouse without the production-issue function',
    );
    assert(
      !workOrderRelease.release.materialAllocations.some((allocation) => allocation.inventoryKey === stocktakeFrozenInventoryKey),
      'work order release allocated stock that is under an active stocktake freeze',
    );
    assert(workOrderRelease.record.releasedQty === 2, 'work order released total was not updated');
    const repeatedRelease = await request(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(submittedWorkOrder.record.code)}/release`,
      {
        method: 'POST',
        body: {
          releaseQty: 2,
          workOrderRevision: submittedWorkOrder.record.revision,
          idempotencyKey: `${submittedWorkOrder.record.code}:release:1`,
        },
      },
    );
    assert(repeatedRelease.repeated === true, 'work order release retry was not idempotent');
    let releasedWorkOrderStructureBlocked = false;
    try {
      await request(baseUrl, `/production/work-orders/${encodeURIComponent(submittedWorkOrder.record.code)}`, {
        method: 'PUT',
        body: {
          ...workOrderRelease.record,
          planQty: Number(workOrderRelease.record.planQty) + 1,
          command: 'submit',
          idempotencyKey: `smoke-work-order-frozen-change-${runId}`,
        },
      });
    } catch (error) {
      releasedWorkOrderStructureBlocked = String(error).includes('HTTP 409');
    }
    assert(releasedWorkOrderStructureBlocked, 'released work order allowed its frozen production structure to change');
    const workOrderAfterRelease = await request(baseUrl, `/production/work-orders/${encodeURIComponent(submittedWorkOrder.record.code)}`);
    assert(workOrderAfterRelease.releaseBatches.length === 1, 'work order detail did not return release batches');
    const releaseAllocation = workOrderRelease.release.materialAllocations[0];
    const inventoryAfterRelease = await request(baseUrl, '/warehouse/inventory');
    const allocatedRowBeforeIssue = inventoryAfterRelease.items.find((row) => row.key === releaseAllocation.inventoryKey);
    const allocatedBeforeIssue = allocatedRowBeforeIssue.allocatedNumber;
    const qualifiedBeforeIssue = allocatedRowBeforeIssue.qualifiedOnHandNumber;
    const materialIssueSource = await request(
      baseUrl,
      `/warehouse/production-issues/source?releaseBatch=${encodeURIComponent(workOrderRelease.release.code)}`,
    );
    assert(workOrderRelease.productionIssue?.code, 'work order release did not automatically create a warehouse material issue task');
    assert(materialIssueSource.autoGenerated === true, 'production issue source did not return the auto-generated warehouse task');
    assert(materialIssueSource.issue.code === workOrderRelease.productionIssue.code, 'production issue handoff returned a different task identity');
    assert(materialIssueSource.issue.status === '待出库', 'auto-generated production material issue did not enter the warehouse queue');
    assert(materialIssueSource.issue.workOrder === submittedWorkOrder.record.code, 'production issue source lost work order lineage');
    assert(materialIssueSource.issue.products.length === workOrderRelease.release.materialAllocations.length, 'production issue task did not project every allocation');
    assert(materialIssueSource.issue.products[0].plannedQty === releaseAllocation.allocatedQty, 'production issue task quantity differs from the release allocation');
    assert(materialIssueSource.issue.products[0].batch === releaseAllocation.batch, 'production issue task batch differs from the release allocation');
    assert(materialIssueSource.issue.products[0].warehouseCode === releaseAllocation.warehouseCode, 'production issue task warehouse differs from the release allocation');
    assert(typeof materialIssueSource.issue.products[0].batchTracked === 'boolean', 'production issue line did not freeze the material batch-control snapshot');
    const materialIssue = { issue: materialIssueSource.issue };
    assert(materialIssue.issue.products[0].plannedQty === releaseAllocation.allocatedQty, 'material issue did not use authoritative release allocation');
    assert(materialIssue.issue.products[0].materialCode === releaseAllocation.materialCode, 'material issue accepted a client-tampered material');
    assert(materialIssue.issue.warehouseCode === allocatedRowBeforeIssue.warehouseCode, 'material issue accepted a client-tampered source warehouse');
    assert(materialIssue.issue.targetWarehouse === 'PLA 一号挤出线边仓', 'material issue accepted a client-tampered destination warehouse');
    assert(materialIssue.issue.reason === '生产领料', 'material issue accepted a client-tampered business reason');
    const materialIssuePostKey = `${materialIssue.issue.code}:post:1`;
    const postedMaterialIssue = await request(
      baseUrl,
      `/warehouse/production-issues/${encodeURIComponent(materialIssue.issue.code)}/post`,
      { method: 'POST', body: { idempotencyKey: materialIssuePostKey, actor: '仓库主管' } },
    );
    assert(postedMaterialIssue.issue.status === '已完成', 'production material issue was not posted');
    assert(postedMaterialIssue.executionCard.materialStatus === '已领料', 'production batch did not preserve the material handoff status');
    assert(
      !Object.prototype.hasOwnProperty.call(postedMaterialIssue.executionCard, 'issuedQty'),
      'production batch incorrectly summarized multi-unit material issues in the finished-product unit',
    );
    assert(postedMaterialIssue.release.materialStatus === '已领料', 'release batch did not enter issued material status');
    assert(postedMaterialIssue.executionCard.releaseBatchCode === workOrderRelease.release.code, 'execution card lost release batch lineage');
    assert(postedMaterialIssue.executionCard.currentStageCode === 'P2-STEP-STARTUP', 'execution card did not enter the instantiated startup stage');
    assert(postedMaterialIssue.executionCard.stageInstances?.length === 10, 'execution card process stage instances are missing');
    assert(postedMaterialIssue.executionCard.stageInstances?.[0]?.status === '已完成', 'material preparation stage was not completed from warehouse posting');
    const instantiatedActions = postedMaterialIssue.executionCard.stageInstances.flatMap((stage) => stage.actionInstances || []);
    const materialIssueActionInstance = instantiatedActions.find((action) => action.actionCode === 'SA2-CREATE-MATERIAL-ISSUE');
    const unusedMaterialPrepActionInstance = instantiatedActions.find((action) => action.actionCode === 'SA2-RECORD-MATERIAL-PREP');
    const startActionInstance = instantiatedActions.find((action) => action.actionCode === 'SA2-START-EXECUTION');
    const startupQcActionInstance = instantiatedActions.find((action) => action.actionCode === 'SA2-CREATE-STARTUP-QC');
    assert(materialIssueActionInstance?.status === '已完成', 'warehouse issue action should be completed from its own result fact');
    assert(materialIssueActionInstance?.resultDocument === materialIssue.issue.code, 'warehouse issue action lost its result document');
    assert(materialIssueActionInstance?.idempotencyScope === '工单释放批次 + 领料类型', 'warehouse issue action lost the shared idempotency contract');
    assert(!unusedMaterialPrepActionInstance, 'an unimplemented material-preparation command must not be bound to the standard runtime route');
    assert(startActionInstance?.executionMode === '人工操作', 'start production action lost its manual trigger mode');
    assert(startActionInstance?.completionMode === '提交成功即完成', 'start production action lost its immediate completion mode');
    assert(startActionInstance?.status === '可执行', 'start production action should be independently actionable after material issue');
    assert(startupQcActionInstance?.actionName === '创建开机首检', 'startup inspection action identity is inconsistent with the fixed action contract');
    assert(startupQcActionInstance?.executionMode === '事件自动触发', 'startup inspection creation should be event-triggered');
    assert(startupQcActionInstance?.completionMode === '等待后续完成', 'startup inspection creation should wait for the quality result');
    const repeatedMaterialIssuePost = await request(
      baseUrl,
      `/warehouse/production-issues/${encodeURIComponent(materialIssue.issue.code)}/post`,
      { method: 'POST', body: { idempotencyKey: materialIssuePostKey, actor: '仓库主管' } },
    );
    assert(repeatedMaterialIssuePost.repeated === true, 'production material issue post retry was not idempotent');
    const inventoryAfterMaterialIssue = await request(baseUrl, '/warehouse/inventory');
    const allocatedRowAfterIssue = inventoryAfterMaterialIssue.items.find((row) => row.key === releaseAllocation.inventoryKey);
    assert(
      Math.abs(allocatedRowAfterIssue.allocatedNumber - (allocatedBeforeIssue - releaseAllocation.allocatedQty)) < 0.0001,
      'production material issue did not consume the release allocation',
    );
    assert(
      Math.abs(allocatedRowAfterIssue.qualifiedOnHandNumber - (qualifiedBeforeIssue - releaseAllocation.allocatedQty)) < 0.0001,
      'production material issue did not deduct qualified physical stock',
    );
    const returnQty = Math.min(0.1, Number(postedMaterialIssue.issue.products[0].postedQty || 0) / 2);
    const productionReturn = await request(baseUrl, '/warehouse/production-returns', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        materialIssue: postedMaterialIssue.issue.code,
        products: [{
          ...postedMaterialIssue.issue.products[0],
          qty: `${returnQty} ${postedMaterialIssue.issue.products[0].uom}`,
          plannedQty: returnQty,
          postedQty: 0,
        }],
        workOrder: 'MO-TAMPERED',
        releaseBatch: 'RB-TAMPERED',
        executionCard: 'EC-TAMPERED',
        warehouseCode: 'WH-TAMPERED-FROM',
        warehouse: '篡改现场仓',
        targetWarehouseCode: 'WH-TAMPERED-TO',
        targetWarehouse: '篡改退回仓',
        reason: '篡改退料原因',
        owner: '仓库主管',
        date: shanghaiDate(),
        note: '自动流程验证未消耗余料退回',
      },
    });
    assert(productionReturn.record.status === '草稿', 'production return draft was not created');
    assert(productionReturn.record.materialIssue === postedMaterialIssue.issue.code, 'production return lost original issue lineage');
    assert(productionReturn.record.workOrder === postedMaterialIssue.issue.workOrder, 'production return accepted a tampered work-order source');
    assert(productionReturn.record.releaseBatch === postedMaterialIssue.issue.releaseBatch, 'production return accepted a tampered release-batch source');
    assert(productionReturn.record.executionCard === postedMaterialIssue.issue.executionCard, 'production return accepted a tampered execution-card source');
    assert(productionReturn.record.warehouse === postedMaterialIssue.issue.targetWarehouse, 'production return accepted a tampered line-side source');
    assert(productionReturn.record.targetWarehouse === postedMaterialIssue.issue.warehouse, 'production return accepted a tampered return warehouse');
    assert(productionReturn.record.reason === '生产余料退回', 'production return accepted a tampered reason');
    let aggregateProductionReturnBlocked = false;
    try {
      await request(baseUrl, '/warehouse/production-returns', {
        method: 'POST',
        body: {
          code: '系统自动生成',
          materialIssue: postedMaterialIssue.issue.code,
          products: [{
            ...postedMaterialIssue.issue.products[0],
            qty: postedMaterialIssue.issue.products[0].qty,
            plannedQty: Number(postedMaterialIssue.issue.products[0].postedQty || 0),
            postedQty: 0,
          }],
          owner: '仓库主管',
          date: shanghaiDate(),
        },
      });
    } catch (error) {
      aggregateProductionReturnBlocked = String(error).includes('HTTP 409');
    }
    assert(aggregateProductionReturnBlocked, 'production return ignored quantities reserved by another return document');
    const submittedProductionReturn = await request(
      baseUrl,
      `/warehouse/production-returns/${encodeURIComponent(productionReturn.record.code)}/submit`,
      { method: 'POST' },
    );
    assert(submittedProductionReturn.record.status === '待入库', 'production return was not submitted');
    const productionReturnPostKey = `${productionReturn.record.code}:post:1`;
    const postedProductionReturn = await request(
      baseUrl,
      `/warehouse/production-returns/${encodeURIComponent(productionReturn.record.code)}/post`,
      { method: 'POST', body: { idempotencyKey: productionReturnPostKey, actor: '仓库主管' } },
    );
    assert(postedProductionReturn.record.status === '已完成', 'production return was not posted');
    const inventoryAfterProductionReturn = await request(baseUrl, '/warehouse/inventory');
    const returnedInventoryRow = inventoryAfterProductionReturn.items.find((row) => row.key === releaseAllocation.inventoryKey);
    assert(
      Math.abs(returnedInventoryRow.qualifiedOnHandNumber - (allocatedRowAfterIssue.qualifiedOnHandNumber + returnQty)) < 0.0001,
      'production return did not restore the original qualified inventory batch',
    );
    const repeatedProductionReturnPost = await request(
      baseUrl,
      `/warehouse/production-returns/${encodeURIComponent(productionReturn.record.code)}/post`,
      { method: 'POST', body: { idempotencyKey: productionReturnPostKey, actor: '仓库主管' } },
    );
    assert(repeatedProductionReturnPost.repeated === true, 'production return post retry was not idempotent');
    const workOrderAfterMaterialIssue = await request(baseUrl, `/production/work-orders/${encodeURIComponent(submittedWorkOrder.record.code)}`);
    assert(workOrderAfterMaterialIssue.executionCards.length === 1, 'work order detail did not return generated execution card');
    const executionCardCode = postedMaterialIssue.executionCard.code;
    const startedExecution = await request(baseUrl, `/production/execution-cards/${encodeURIComponent(executionCardCode)}/start`, {
      method: 'POST',
      body: {
        revision: postedMaterialIssue.executionCard.revision,
        leader: '生产主管',
        operator: '生产主管',
        actor: '生产主管',
        idempotencyKey: `${executionCardCode}:start:1`,
      },
    });
    assert(startedExecution.record.node === '待首检', 'execution card did not enter first inspection');
    assert(startedExecution.qualityTask.kind === '开机首检', 'execution start did not create first inspection task');
    assert(startedExecution.qualityTask.quantity === startedExecution.record.planQty, 'startup inspection did not inherit the controlled batch quantity');
    assert(startedExecution.qualityTask.unit === startedExecution.record.unit, 'startup inspection did not inherit the production unit');
    assert(startedExecution.qualityTask.sampleQty === '1 组', 'startup inspection sample quantity is not one first-article group');
    assert(startedExecution.qualityTask.standardVersionId === activeFirstStandardCode, 'new production quality task did not use the active standard version');
    assert(startedExecution.qualityTask.qualityStandardSnapshot?.code === activeFirstStandardCode, 'production quality task did not freeze the standard version');
    assert(
      startedExecution.qualityTask.sourceRequirements?.[0]?.supplementaryRequirement === productionSalesOrder.order.supplementaryRequirement
      && startedExecution.qualityTask.sourceRequirements?.[0]?.taskNote === sourceProductionTask.record.note
      && startedExecution.qualityTask.workOrderNote === submittedWorkOrder.record.note,
      'production quality task did not receive the read-only source requirement and document notes',
    );
    assert(
      startedExecution.qualityTask.qualityStandardSnapshot?.checkpointRules?.every((item) => item.name && item.requirement),
      'production quality task did not freeze item-level requirements',
    );
    assert(startedExecution.record.currentStageCode === 'P2-STEP-FIRST-INSPECTION', 'execution card stage instance did not advance to first inspection');
    const startedActionInstances = startedExecution.record.stageInstances.flatMap((stage) => stage.actionInstances || []);
    assert(
      startedActionInstances.find((action) => action.actionCode === 'SA2-START-EXECUTION')?.status === '已完成',
      'start production action should complete from its own start record',
    );
    assert(
      startedActionInstances.find((action) => action.actionCode === 'SA2-CREATE-STARTUP-QC')?.status === '等待结果',
      'startup inspection action should wait for the external quality result',
    );
    const repeatedExecutionStart = await request(baseUrl, `/production/execution-cards/${encodeURIComponent(executionCardCode)}/start`, {
      method: 'POST',
      body: {
        revision: postedMaterialIssue.executionCard.revision,
        leader: '生产主管',
        operator: '生产主管',
        actor: '生产主管',
        idempotencyKey: `${executionCardCode}:start:1`,
      },
    });
    assert(repeatedExecutionStart.repeated === true, 'execution start retry was not idempotent');
    const passedFirstInspection = await request(
      baseUrl,
      `/quality/production/${encodeURIComponent(startedExecution.qualityTask.code)}/decision`,
      {
        method: 'POST',
        body: {
          result: '合格',
          acceptedQty: 0,
          rejectedQty: 0,
          version: startedExecution.qualityTask.version,
          actor: '质检员',
          remark: '自动流程首检合格',
          idempotencyKey: `${startedExecution.qualityTask.code}:decision:1`,
        },
      },
    );
    assert(passedFirstInspection.executionCard.node === '半成品报工', 'first inspection did not release large-reel reporting');
    const pausedExecution = await request(baseUrl, `/production/execution-cards/${encodeURIComponent(executionCardCode)}/pause`, {
      method: 'POST',
      body: {
        revision: passedFirstInspection.executionCard.revision,
        reason: '自动流程设备点检',
        actor: '生产主管',
        idempotencyKey: `${executionCardCode}:pause:1`,
      },
    });
    assert(pausedExecution.record.status === '已暂停', 'execution card did not enter paused status');
    assert(pausedExecution.record.node === '半成品报工', 'pause did not preserve the execution node');
    const repeatedPause = await request(baseUrl, `/production/execution-cards/${encodeURIComponent(executionCardCode)}/pause`, {
      method: 'POST',
      body: {
        revision: passedFirstInspection.executionCard.revision,
        reason: '自动流程设备点检',
        actor: '生产主管',
        idempotencyKey: `${executionCardCode}:pause:1`,
      },
    });
    assert(repeatedPause.repeated === true, 'execution pause retry was not idempotent');
    const emptyHandoverNote = await requestResult(baseUrl, '/production/shifts/handover', {
      method: 'POST',
      body: {
        shiftCode: 'SHIFT2-FLOW-D1',
        shiftName: '白班',
        leader: '生产主管',
        members: ['生产主管'],
        note: '',
        activeCards: [{ executionCardCode, revision: pausedExecution.record.revision }],
        reportSummary: { count: 0, good: 0, defect: 0 },
        exceptionCount: 0,
        actor: '生产主管',
        idempotencyKey: 'SHIFT2-FLOW-D1:handover:empty-note',
      },
    });
    assert(
      emptyHandoverNote.response.status === 400
        && String(emptyHandoverNote.payload.error || '').includes('交班备注至少填写 4 个字'),
      'shift handover accepted unfinished work without a meaningful note',
    );
    const shiftHandover = await request(baseUrl, '/production/shifts/handover', {
      method: 'POST',
      body: {
        shiftCode: 'SHIFT2-FLOW-D1',
        shiftName: '白班',
        leader: '生产主管',
        members: ['生产主管'],
        note: '设备点检完成后由夜班恢复生产',
        activeCards: [{ executionCardCode, revision: pausedExecution.record.revision }],
        reportSummary: { count: 0, good: 0, defect: 0 },
        exceptionCount: 0,
        actor: '生产主管',
        idempotencyKey: 'SHIFT2-FLOW-D1:handover:1',
      },
    });
    assert(shiftHandover.handover.code.startsWith('SHF2-'), 'shift handover code was not generated');
    assert(shiftHandover.handover.status === '待接班', 'shift handover did not enter pending receive status');
    assert(
      shiftHandover.handover.activeCards[0].operationJobCode
        && shiftHandover.handover.activeCards[0].operationStatus === '暂停',
      'shift handover did not freeze the active operation context for the incoming shift',
    );
    assert(shiftHandover.cards[0].status === '已暂停', 'shift handover changed the execution business status');
    const receivedShift = await request(baseUrl, `/production/shifts/${encodeURIComponent(shiftHandover.handover.code)}/receive`, {
      method: 'POST',
      body: {
        version: shiftHandover.handover.revision,
        shiftCode: 'SHIFT2-FLOW-N1',
        shiftName: '夜班',
        leader: '夜班班长',
        members: ['夜班班长'],
        actor: '夜班班长',
        idempotencyKey: 'SHIFT2-FLOW-N1:receive:1',
      },
    });
    assert(receivedShift.handover.status === '已接班', 'shift receive did not close the handover');
    assert(receivedShift.cards[0].shift === '夜班', 'shift receive did not update execution card shift ownership');
    const resumedExecution = await request(baseUrl, `/production/execution-cards/${encodeURIComponent(executionCardCode)}/resume`, {
      method: 'POST',
      body: {
        revision: receivedShift.cards[0].revision,
        reason: '点检完成并确认可恢复',
        actor: '夜班班长',
        idempotencyKey: `${executionCardCode}:resume:1`,
      },
    });
    assert(resumedExecution.record.status === '进行中', 'execution card did not resume running status');
    assert(resumedExecution.record.node === '半成品报工', 'execution resume did not restore the original node');
    const blockedManualQualityException = await requestResult(baseUrl, '/production/exceptions', {
      method: 'POST',
      body: {
        executionCardCode,
        revision: resumedExecution.record.revision,
        type: '质检不合格',
        reason: '错误地从生产现场重复登记质量异常',
        outcome: '异常停机',
        actor: '夜班班长',
        idempotencyKey: `${executionCardCode}:invalid-quality-exception:1`,
      },
    });
    assert(blockedManualQualityException.response.status === 409, 'production site incorrectly created a quality-owned exception');
    assert(String(blockedManualQualityException.payload.error || '').includes('生产质检'), 'manual quality exception rejection did not point to the owning quality document');
    const transientShortageException = await request(baseUrl, '/production/exceptions', {
      method: 'POST',
      body: {
        executionCardCode,
        revision: resumedExecution.record.revision,
        type: '缺料',
        reason: '自动流程验证齐套复核可以解除现场缺料阻断',
        outcome: '异常停机',
        level: '紧急',
        responsibility: '仓库 / 生产计划',
        actor: '夜班班长',
        idempotencyKey: `${executionCardCode}:shortage-exception:1`,
      },
    });
    const autoClosedShortageException = await request(
      baseUrl,
      `/production/exceptions/${encodeURIComponent(transientShortageException.record.code)}`,
    );
    assert(autoClosedShortageException.record.status === '已关闭', 'live material readiness did not auto-close a resolved shortage exception');
    assert(autoClosedShortageException.executionCard.status === '进行中', 'shortage auto-closure did not restore the blocked execution card');
    assert(autoClosedShortageException.flowRecords?.some((item) => item.action === '物料储备复核'), 'shortage auto-closure did not append a material readiness audit record');
    assert(autoClosedShortageException.task?.code === sourceProductionTask.record.code, 'shortage exception detail lost its source production task');
    const productionException = await request(baseUrl, '/production/exceptions', {
      method: 'POST',
      body: {
        executionCardCode,
        revision: autoClosedShortageException.executionCard.revision,
        type: '设备异常',
        reason: '自动流程设备报警',
        outcome: '异常停机',
        level: '紧急',
        responsibility: '夜班 / 自动流程产线',
        actor: '夜班班长',
        idempotencyKey: `${executionCardCode}:exception:1`,
      },
    });
    assert(productionException.record.code.startsWith('EX2-'), 'production exception code was not generated');
    assert(productionException.executionCard.status === '异常', 'production exception did not stop the execution card');
    assert(productionException.executionCard.releaseBatchCode === workOrderRelease.release.code, 'production exception lost release lineage');
    assert(productionException.flowRecords?.some((item) => item.action === '登记生产异常'), 'production exception did not return its own creation log');
    const resolvedException = await request(baseUrl, `/production/exceptions/${encodeURIComponent(productionException.record.code)}/resolve`, {
      method: 'POST',
      body: {
        version: productionException.record.revision,
        cardRevision: productionException.executionCard.revision,
        disposition: '恢复生产',
        resolution: '报警原因已排除并完成复核',
        actor: '夜班班长',
        idempotencyKey: `${productionException.record.code}:resolve:1`,
      },
    });
    assert(resolvedException.record.status === '已关闭', 'production exception was not closed');
    assert(resolvedException.executionCard.node === '半成品报工', 'exception resolution did not restore the original execution node');
    assert(resolvedException.executionCard.status === '进行中', 'exception resolution did not resume production');
    assert(resolvedException.flowRecords?.some((item) => item.action === '解除停机'), 'production exception recovery was not appended to its own log');
    const wipReport = await request(baseUrl, `/production/execution-cards/${encodeURIComponent(executionCardCode)}/wip-report`, {
      method: 'POST',
      body: {
        revision: resolvedException.executionCard.revision,
        reelCode: 'LRL2-SMOKE-001',
        netWeightKg: 2.2,
        equipment: 'RW-R1',
        actor: '生产主管',
        remark: '自动流程大盘半成品报工',
        idempotencyKey: `${executionCardCode}:wip-report:1`,
      },
    });
    assert(wipReport.wipBatch.code === 'LRL2-SMOKE-001', 'large-reel WIP batch was not generated');
    assert(wipReport.qualityTask.kind === '半成品质检', 'large-reel report did not create WIP inspection task');
    assert(wipReport.record.currentStageCode === 'P2-STEP-WIP-QC', 'large-reel report did not advance to WIP quality gate');
    const repeatedWipReport = await request(baseUrl, `/production/execution-cards/${encodeURIComponent(executionCardCode)}/wip-report`, {
      method: 'POST',
      body: {
        revision: resolvedException.executionCard.revision,
        reelCode: 'LRL2-SMOKE-001',
        netWeightKg: 2.2,
        actor: '生产主管',
        idempotencyKey: `${executionCardCode}:wip-report:1`,
      },
    });
    assert(repeatedWipReport.repeated === true, 'large-reel report retry was not idempotent');
    const passedWipInspection = await request(
      baseUrl,
      `/quality/production/${encodeURIComponent(wipReport.qualityTask.code)}/decision`,
      {
        method: 'POST',
        body: {
          result: '合格',
          acceptedQty: 2.2,
          rejectedQty: 0,
          version: wipReport.qualityTask.version,
          actor: '质检员',
          remark: '大盘线径、颜色和收卷状态合格',
          idempotencyKey: `${wipReport.qualityTask.code}:decision:1`,
        },
      },
    );
    assert(passedWipInspection.executionCard.node === '生产报工', 'WIP inspection did not release finished reporting');
    assert(passedWipInspection.wipBatch.availableWeightKg === 2.2, 'WIP inspection did not release large-reel available weight');
    assert(passedWipInspection.executionCard.status === '待处理', 'WIP inspection should enqueue rewind instead of starting it implicitly');
    const extrusionJob = passedWipInspection.executionCard.operationJobs.find((job) => job.operationType === '挤出生产');
    const rewindJob = passedWipInspection.executionCard.operationJobs.find((job) => job.operationType === '复绕生产');
    assert(extrusionJob?.status === '已完成', 'large-reel report did not release the extrusion operation');
    assert(rewindJob?.status === '可开工', 'qualified WIP did not create a ready rewind operation');
    assert(rewindJob?.sourceWipBatchCode === 'LRL2-SMOKE-001', 'rewind operation lost its source large reel');
    const startedRewind = await request(
      baseUrl,
      `/production/execution-cards/${encodeURIComponent(executionCardCode)}/operation-jobs/${encodeURIComponent(rewindJob.code)}/start`,
      {
        method: 'POST',
        body: {
          revision: passedWipInspection.executionCard.revision,
          line: rewindJob.assignedLine,
          leader: '复绕班长',
          operator: '复绕班长',
          actor: '复绕班长',
          idempotencyKey: `${rewindJob.code}:start:1`,
        },
      },
    );
    assert(startedRewind.operationJob.status === '执行中', 'rewind operation did not start');
    assert(startedRewind.record.status === '进行中', 'production batch did not enter running state after rewind start');
    const productionReport = await request(baseUrl, `/production/execution-cards/${encodeURIComponent(executionCardCode)}/report`, {
      method: 'POST',
      body: {
        revision: startedRewind.record.revision,
        goodQty: 2,
        defectQty: 0,
        sourceWipBatchCode: 'LRL2-SMOKE-001',
        consumedWeightKg: 2,
        lossWeightKg: 0.2,
        actor: '生产主管',
        remark: '自动流程报工',
        idempotencyKey: `${executionCardCode}:report:1`,
      },
    });
    assert(productionReport.report.code.startsWith('PRPT2-'), 'production report code was not generated');
    assert(productionReport.qualityTask.kind === '报工全检', 'production report did not create full inspection task');
    const pendingReportInspection = await request(
      baseUrl,
      `/quality/production/${encodeURIComponent(productionReport.qualityTask.code)}`,
    );
    assert(pendingReportInspection.record.dispositionStatus === '待判定', 'undecided production quality was incorrectly marked complete');
    assert(productionReport.lineageRecords.length === 2, 'rewind report did not create small-reel lineage records');
    assert(productionReport.wipBatch.status === '已用尽', 'rewind report did not consume the source large reel');
    assert(productionReport.wipBatch.usedWeightKg === 2, 'rewind report did not preserve actual kg used separately');
    assert(productionReport.wipBatch.lossWeightKg === 0.2, 'rewind report did not preserve process loss kg separately');
    assert(productionReport.wipBatch.outputWeightKg === 2, 'small-reel lineage weight did not reconcile to rewind output kg');
    assert(productionReport.wipBatch.consumedWeightKg === 2.2, 'large-reel total deduction did not equal used plus loss kg');
    assert(productionReport.record.operationJobs.find((job) => job.code === rewindJob.code)?.status === '已完成', 'rewind report did not release the rewind line');
    const orderAfterProductionReport = await request(baseUrl, `/sales/orders/${encodeURIComponent(productionSalesOrder.order.code)}`);
    assert(orderAfterProductionReport.order.productionProgress.status === '待质检', 'sales order did not expose pending production inspection');
    assert(orderAfterProductionReport.order.productionProgress.reportedQty === 2, 'sales order reported quantity did not use execution-card facts');
    assert(orderAfterProductionReport.order.productionProgress.qualifiedQty === 0, 'sales order qualified quantity advanced before quality decision');
    assert(orderAfterProductionReport.order.productionProgress.inboundQty === 0, 'sales order inbound quantity advanced before warehouse posting');
    const reportCheckpointResults = (productionReport.qualityTask.qualityStandardSnapshot?.checkpointRules || []).map((item) => ({
      name: item.name,
      standard: item.requirement,
      actual: '',
      result: '待检验',
      note: '',
    }));
    assert(reportCheckpointResults.some((item) => item.name === '绕线'), 'production report inspection did not freeze the winding checkpoint');
    const partialReportInspection = await request(
      baseUrl,
      `/quality/production/${encodeURIComponent(productionReport.qualityTask.code)}/decision`,
      {
        method: 'POST',
        body: {
          result: '部分合格',
          acceptedQty: 1,
          rejectedQty: 1,
          version: productionReport.qualityTask.version,
          actor: '质检员',
          remark: '自动流程报工全检部分合格',
          checkpointResults: reportCheckpointResults.map((item) => ({
            ...item,
            actual: item.name === '绕线' ? '1 卷排线偏松' : '检查合格',
            result: item.name === '绕线' ? '不合格' : '合格',
            note: item.name === '绕线' ? '需重新复绕并复检排线张力' : '',
          })),
          idempotencyKey: `${productionReport.qualityTask.code}:decision:1`,
        },
      },
    );
    assert(partialReportInspection.executionCard.node === '待过程检', 'partial report inspection did not block packaging');
    assert(partialReportInspection.record.remainingDispositionQty === 1, 'partial report inspection did not expose remaining disposition quantity');
    assert(partialReportInspection.productionException?.code?.startsWith('EX2-'), 'rejected production quality did not create a production exception');
    assert(partialReportInspection.productionException?.source === productionReport.qualityTask.code, 'quality exception did not preserve the exact source quality task');
    assert(partialReportInspection.productionException?.type === '质检不合格', 'quality exception used the wrong exception type');
    assert(partialReportInspection.productionException?.code !== productionException.record.code, 'quality handling reused an unrelated onsite exception from the same batch');
    const generatedQualityExceptionDetail = await request(
      baseUrl,
      `/production/exceptions/${encodeURIComponent(partialReportInspection.productionException.code)}`,
    );
    assert(generatedQualityExceptionDetail.flowRecords?.some((item) => item.action === '质量异常生成'), 'quality decision did not create a truthful exception-owned log');
    assert(generatedQualityExceptionDetail.task?.code === sourceProductionTask.record.code, 'production exception detail did not return its authoritative source task');
    const blockedQualityShortcut = await requestResult(
      baseUrl,
      `/production/exceptions/${encodeURIComponent(partialReportInspection.productionException.code)}/resolve`,
      {
        method: 'POST',
        body: {
          version: partialReportInspection.productionException.revision,
          cardRevision: partialReportInspection.executionCard.revision,
          disposition: '恢复生产',
          resolution: '错误地绕过质量处置',
          actor: '生产主管',
          idempotencyKey: `${partialReportInspection.productionException.code}:invalid-resolve:1`,
        },
      },
    );
    assert(blockedQualityShortcut.response.status === 409, 'quality exception was incorrectly closed by the onsite recovery endpoint');
    assert(String(blockedQualityShortcut.payload.error || '').includes('生产质检单'), 'quality shortcut rejection did not point to the owning quality document');
    const orderAfterPartialInspection = await request(baseUrl, `/sales/orders/${encodeURIComponent(productionSalesOrder.order.code)}`);
    assert(orderAfterPartialInspection.order.productionProgress.status === '质量待处置', 'sales order did not expose quality disposition blocker');
    assert(orderAfterPartialInspection.order.productionProgress.qualifiedQty === 1, 'sales order did not expose partially qualified quantity');
    const productionRework = await request(
      baseUrl,
      `/quality/production/${encodeURIComponent(productionReport.qualityTask.code)}/rework`,
      {
        method: 'POST',
        body: {
          quantity: 1,
          reason: '自动流程验证返工任务与复检闭环',
          assignee: '复绕操作员',
          actor: '质检员',
          decisionVersion: partialReportInspection.decision.version,
          idempotencyKey: `${productionReport.qualityTask.code}:rework:1`,
        },
      },
    );
    assert(productionRework.reworkTask.status === '待返工', 'production rework task was not created');
    assert(productionRework.reworkTask.sourceInspectionItems?.length === 1, 'production rework did not freeze only the original abnormal checkpoint');
    assert(productionRework.reworkTask.sourceInspectionItems?.[0]?.name === '绕线', 'production rework lost the original abnormal checkpoint identity');
    assert(productionRework.record.inProcessDispositionQty === 1, 'production rework did not reserve rejected quantity');
    const completedProductionRework = await request(
      baseUrl,
      `/quality/production/${encodeURIComponent(productionReport.qualityTask.code)}/rework/${encodeURIComponent(productionRework.reworkTask.code)}/complete`,
      {
        method: 'POST',
        body: {
          revision: productionRework.reworkTask.revision,
          resultNote: '重新复绕并校验张力',
          inspector: '复检员',
          actor: '复绕操作员',
          idempotencyKey: `${productionRework.reworkTask.code}:complete:1`,
        },
      },
    );
    assert(completedProductionRework.reworkTask.status === '已完成', 'production rework task did not close when actual rework finished');
    assert(completedProductionRework.reinspectionTask.status === '待复检', 'production rework completion did not create an independent reinspection task');
    const frozenProductionReinspectionItems = completedProductionRework.reinspectionTask.inspectionItems || [];
    assert(frozenProductionReinspectionItems.length === 1, 'production reinspection did not inherit the frozen abnormal checkpoint');
    assert(completedProductionRework.record.dispositionStatus === '待复检', 'production quality did not expose reinspection as an independent disposition stage');
    assert(completedProductionRework.release?.qualityStatus === '待复检', 'production release did not project the reinspection stage');
    assert(completedProductionRework.release?.nextAction?.includes(completedProductionRework.reinspectionTask.code), 'production release kept the completed rework action');
    assert(completedProductionRework.workOrder?.nextAction?.includes(completedProductionRework.reinspectionTask.code), 'production work order kept a stale quality action');
    assert(completedProductionRework.productionException?.nextAction?.includes(completedProductionRework.reinspectionTask.code), 'production exception kept the completed rework action');
    const releasesWaitingForReinspection = await request(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(submittedWorkOrder.record.code)}/releases`,
    );
    const releaseWaitingForReinspection = releasesWaitingForReinspection.items.find(
      (item) => item.code === workOrderRelease.release.code,
    );
    assert(releaseWaitingForReinspection?.qualityStatus === '待复检', 'release query lost the reinspection stage');
    assert(releaseWaitingForReinspection?.nextAction?.includes(completedProductionRework.reinspectionTask.code), 'release query returned a stale next action');
    const exceptionWaitingForReinspection = await request(
      baseUrl,
      `/production/exceptions/${encodeURIComponent(completedProductionRework.productionException.code)}`,
    );
    assert(exceptionWaitingForReinspection.record.nextAction.includes(completedProductionRework.reinspectionTask.code), 'exception detail returned a stale next action');
    assert(exceptionWaitingForReinspection.flowRecords?.some((item) => item.action === '转返工'), 'quality exception log lost the rework transition');
    assert(exceptionWaitingForReinspection.flowRecords?.some((item) => item.action === '返工完成'), 'quality exception log lost the rework-complete transition');

    let missingProductionReinspectionItemsBlocked = false;
    try {
      await request(
        baseUrl,
        `/quality/production/${encodeURIComponent(productionReport.qualityTask.code)}/reinspection/${encodeURIComponent(completedProductionRework.reinspectionTask.code)}/decision`,
        {
          method: 'POST',
          body: {
            revision: completedProductionRework.reinspectionTask.revision,
            acceptedQty: 1,
            rejectedQty: 0,
            actor: '复检员',
            idempotencyKey: `${completedProductionRework.reinspectionTask.code}:missing-items`,
          },
        },
      );
    } catch (error) {
      missingProductionReinspectionItemsBlocked = String(error).includes('HTTP 409');
    }
    assert(missingProductionReinspectionItemsBlocked, 'production reinspection completed without checkpoint evidence');

    let contradictoryProductionReinspectionItemsBlocked = false;
    try {
      await request(
        baseUrl,
        `/quality/production/${encodeURIComponent(productionReport.qualityTask.code)}/reinspection/${encodeURIComponent(completedProductionRework.reinspectionTask.code)}/decision`,
        {
          method: 'POST',
          body: {
            revision: completedProductionRework.reinspectionTask.revision,
            acceptedQty: 0,
            rejectedQty: 1,
            inspectionItems: frozenProductionReinspectionItems.map((item) => ({ ...item, actual: '复检正常', result: '合格', note: '' })),
            actor: '复检员',
            idempotencyKey: `${completedProductionRework.reinspectionTask.code}:contradictory-items`,
          },
        },
      );
    } catch (error) {
      contradictoryProductionReinspectionItemsBlocked = String(error).includes('HTTP 409');
    }
    assert(contradictoryProductionReinspectionItemsBlocked, 'production reinspection accepted rejected quantity without an abnormal checkpoint');
    const disposedReportInspection = await request(
      baseUrl,
      `/quality/production/${encodeURIComponent(productionReport.qualityTask.code)}/reinspection/${encodeURIComponent(completedProductionRework.reinspectionTask.code)}/decision`,
      {
        method: 'POST',
        body: {
          revision: completedProductionRework.reinspectionTask.revision,
          acceptedQty: 1,
          rejectedQty: 0,
          inspectionItems: frozenProductionReinspectionItems.map((item) => ({
            ...item,
            actual: '重新复绕后排线平整，张力稳定',
            result: '合格',
            note: '',
          })),
          actor: '复检员',
          idempotencyKey: `${completedProductionRework.reinspectionTask.code}:decision:1`,
        },
      },
    );
    assert(disposedReportInspection.record.dispositionStatus === '已完成', 'production quality disposition did not close the rejected quantity');
    assert(disposedReportInspection.reinspectionTask.inspectionItems[0].result === '合格', 'production reinspection checkpoint result was not persisted');
    assert(disposedReportInspection.reinspectionTask.resultReason.includes('全部合格'), 'production reinspection did not derive a concise result summary');
    assert(disposedReportInspection.executionCard.node === '待包装', 'completed disposition did not release packaging');
    assert(disposedReportInspection.executionCard.qualifiedQty === 2, 'reinspection release did not update qualified quantity');
    const closedQualityExceptionDetail = await request(
      baseUrl,
      `/production/exceptions/${encodeURIComponent(partialReportInspection.productionException.code)}`,
    );
    assert(closedQualityExceptionDetail.flowRecords?.some((item) => item.action === '质量处置关闭'), 'quality exception log did not record disposition closure');
    assert(closedQualityExceptionDetail.flowRecords?.some((item) => item.action === '返工复检判定'), 'quality exception log did not record the reinspection result');
    const orderAfterDisposition = await request(baseUrl, `/sales/orders/${encodeURIComponent(productionSalesOrder.order.code)}`);
    assert(orderAfterDisposition.order.productionProgress.status === '待入库放行', 'sales order did not keep qualified quantity separate from inbound release');
    assert(orderAfterDisposition.order.productionProgress.qualifiedQty === 2, 'sales order lost concession-qualified quantity');
    assert(orderAfterDisposition.order.productionProgress.inboundQty === 0, 'sales order treated qualified quantity as inbound quantity');
    const repeatedReportDisposition = await request(
      baseUrl,
      `/quality/production/${encodeURIComponent(productionReport.qualityTask.code)}/reinspection/${encodeURIComponent(completedProductionRework.reinspectionTask.code)}/decision`,
      {
        method: 'POST',
        body: {
          revision: completedProductionRework.reinspectionTask.revision,
          acceptedQty: 1,
          rejectedQty: 0,
          inspectionItems: frozenProductionReinspectionItems.map((item) => ({
            ...item,
            actual: '重新复绕后排线平整，张力稳定',
            result: '合格',
            note: '',
          })),
          actor: '复检员',
          idempotencyKey: `${completedProductionRework.reinspectionTask.code}:decision:1`,
        },
      },
    );
    assert(repeatedReportDisposition.repeated === true, 'production quality reinspection retry was not idempotent');
    const repeatedQualityExceptionDetail = await request(
      baseUrl,
      `/production/exceptions/${encodeURIComponent(partialReportInspection.productionException.code)}`,
    );
    assert(repeatedQualityExceptionDetail.flowRecords.length === closedQualityExceptionDetail.flowRecords.length, 'idempotent reinspection retry duplicated exception log records');
    const packedExecution = await request(baseUrl, `/production/execution-cards/${encodeURIComponent(executionCardCode)}/pack`, {
      method: 'POST',
      body: {
        revision: disposedReportInspection.executionCard.revision,
        quantity: 1,
        packageRef: `${executionCardCode}-BOX-1`,
        actor: '生产主管',
        idempotencyKey: `${executionCardCode}:pack:1`,
      },
    });
    assert(packedExecution.qualityTask.kind === '入库抽检', 'packaging did not create inbound inspection task');
    assert(packedExecution.packagingRecord?.packageRef === `${executionCardCode}-BOX-1`, 'first package did not persist an independent packaging record');
    assert(packedExecution.qualityTask.quantity === 1, 'partial packaging did not freeze the controlled package quantity');
    assert(packedExecution.qualityTask.sampleQty === '1 卷', 'single-roll package inspection did not use the controlled package quantity');
    const passedInboundInspection = await request(
      baseUrl,
      `/quality/production/${encodeURIComponent(packedExecution.qualityTask.code)}/decision`,
      {
        method: 'POST',
        body: {
          result: '合格',
          acceptedQty: 1,
          rejectedQty: 0,
          version: packedExecution.qualityTask.version,
          actor: '质检员',
          remark: '自动流程入库抽检合格',
          idempotencyKey: `${packedExecution.qualityTask.code}:decision:1`,
        },
      },
    );
    assert(passedInboundInspection.executionCard.node === '待入库', 'inbound inspection did not release warehouse receipt');
    assert(passedInboundInspection.productionReceipt?.code, 'quality release did not automatically create a warehouse production receipt task');
    assert(passedInboundInspection.productionReceipt.status === '待入库', 'auto-generated production receipt did not enter the warehouse queue');
    const orderAfterInboundRelease = await request(baseUrl, `/sales/orders/${encodeURIComponent(productionSalesOrder.order.code)}`);
    assert(orderAfterInboundRelease.order.productionProgress.status === '待入库', 'sales order did not expose warehouse-pending quantity');
    assert(orderAfterInboundRelease.order.productionProgress.releasedInboundQty === 1, 'sales order did not expose the first quality-released package quantity');
    assert(orderAfterInboundRelease.order.productionProgress.inboundQty === 0, 'sales order advanced inbound before warehouse posting');

    const productionReceipt = { receipt: passedInboundInspection.productionReceipt };
    assert(productionReceipt.receipt.code.startsWith('WPR2-'), 'production receipt code was not generated');
    assert(productionReceipt.receipt.workOrder === submittedWorkOrder.record.code, 'production receipt lost work order lineage');
    assert(productionReceipt.receipt.releaseBatch === workOrderRelease.release.code, 'production receipt lost release batch lineage');
    assert(productionReceipt.receipt.executionCard === executionCardCode, 'production receipt lost its authoritative execution card');
    assert(productionReceipt.receipt.products[0].materialCode === passedInboundInspection.executionCard.productCode, 'production receipt lost the released product');
    assert(
      productionReceipt.receipt.products[0].batchTracked === false
        ? productionReceipt.receipt.products[0].batch === ''
        : productionReceipt.receipt.products[0].batch === executionCardCode,
      'production receipt batch did not follow the frozen material attribute',
    );
    assert(typeof productionReceipt.receipt.products[0].batchTracked === 'boolean', 'production receipt did not freeze batch-control attributes');
    assert(productionReceipt.receipt.products[0].uom === passedInboundInspection.executionCard.unit, 'production receipt lost the base unit');
    assert(productionReceipt.receipt.quantity === 1, 'production receipt did not use the first quality-released package quantity');
    assert(productionReceipt.receipt.targetWarehouseCode === 'WH-FG' && productionReceipt.receipt.targetWarehouse === '成品仓', 'production receipt did not use the material default warehouse');
    assert(!productionReceipt.receipt.targetLocation, 'auto-generated production receipt fabricated a target location before warehouse selection');

    let duplicatePendingProductionReceiptBlocked = false;
    try {
      await request(baseUrl, '/warehouse/production-receipts', {
        method: 'POST',
        body: {
          executionCard: executionCardCode,
          targetWarehouseCode: 'WH-FG',
          targetWarehouse: '成品仓',
          owner: '仓库主管',
          date: shanghaiDate(),
          products: [{ qty: '1 卷' }],
        },
      });
    } catch (error) {
      duplicatePendingProductionReceiptBlocked = String(error).includes('HTTP 409');
    }
    assert(duplicatePendingProductionReceiptBlocked, 'production receipt allowed duplicate pending documents to exceed released quantity');

    const productionReceiptWithoutLocation = await requestResult(
      baseUrl,
      `/warehouse/production-receipts/${encodeURIComponent(productionReceipt.receipt.code)}/post`,
      { method: 'POST', body: { idempotencyKey: `${productionReceipt.receipt.code}:missing-location` } },
    );
    assert(productionReceiptWithoutLocation.response.status === 400, 'production receipt posted without an explicit target location');
    for (const invalidLocation of ['FG-AUTO', 'FG-NOT-EXISTS']) {
      const invalidDestination = await requestResult(
        baseUrl,
        `/warehouse/production-receipts/${encodeURIComponent(productionReceipt.receipt.code)}`,
        {
          method: 'PUT',
          body: {
            ...productionReceipt.receipt,
            targetWarehouseCode: 'WH-FG',
            targetWarehouse: '成品仓',
            targetLocation: invalidLocation,
          },
        },
      );
      assert(
        invalidDestination.response.status === 400,
        `production receipt accepted invalid or placeholder target location ${invalidLocation}`,
      );
    }
    const selectedProductionReceiptDestination = await request(
      baseUrl,
      `/warehouse/production-receipts/${encodeURIComponent(productionReceipt.receipt.code)}`,
      {
        method: 'PUT',
        body: {
          ...productionReceipt.receipt,
          targetWarehouseCode: 'WH-FG',
          targetWarehouse: '成品仓',
          targetLocation: 'FG-01',
        },
      },
    );
    productionReceipt.receipt = selectedProductionReceiptDestination.receipt;
    assert(
      productionReceipt.receipt.targetLocation === 'FG-01',
      'warehouse could not select the production receipt target location before posting',
    );

    const productionReceiptPostKey = `${productionReceipt.receipt.code}:post:1`;
    const postedProductionReceipt = await request(
      baseUrl,
      `/warehouse/production-receipts/${encodeURIComponent(productionReceipt.receipt.code)}/post`,
      { method: 'POST', body: { idempotencyKey: productionReceiptPostKey, actor: '仓库主管' } },
    );
    assert(postedProductionReceipt.receipt.status === '已完成', 'production receipt was not posted');
    assert(postedProductionReceipt.card.inboundQty === 1, 'first production receipt did not update execution card inbound quantity');
    assert(postedProductionReceipt.card.node === '待包装' && postedProductionReceipt.card.status === '进行中', 'partial production receipt closed the batch before the remaining qualified output was packaged');
    const orderAfterFirstProductionInbound = await request(baseUrl, `/sales/orders/${encodeURIComponent(productionSalesOrder.order.code)}`);
    assert(orderAfterFirstProductionInbound.order.productionProgress.status === '部分入库', 'sales order did not expose partial production inbound');
    assert(orderAfterFirstProductionInbound.order.productionProgress.inboundQty === 1, 'sales order did not expose the first posted package quantity');
    const repeatedProductionReceiptPost = await request(
      baseUrl,
      `/warehouse/production-receipts/${encodeURIComponent(productionReceipt.receipt.code)}/post`,
      { method: 'POST', body: { idempotencyKey: productionReceiptPostKey, actor: '仓库主管' } },
    );
    assert(repeatedProductionReceiptPost.repeated === true, 'production receipt post retry was not idempotent');

    let duplicatePackageRefBlocked = false;
    try {
      await request(baseUrl, `/production/execution-cards/${encodeURIComponent(executionCardCode)}/pack`, {
        method: 'POST',
        body: {
          revision: postedProductionReceipt.card.revision,
          quantity: 1,
          packageRef: `${executionCardCode}-BOX-1`,
          actor: '生产主管',
          idempotencyKey: `${executionCardCode}:pack:duplicate-ref`,
        },
      });
    } catch (error) {
      duplicatePackageRefBlocked = String(error).includes('HTTP 409');
    }
    assert(duplicatePackageRefBlocked, 'production packaging reused an existing package reference and duplicated the packed quantity');

    const secondPackedExecution = await request(baseUrl, `/production/execution-cards/${encodeURIComponent(executionCardCode)}/pack`, {
      method: 'POST',
      body: {
        revision: postedProductionReceipt.card.revision,
        quantity: 1,
        packageRef: `${executionCardCode}-BOX-2`,
        actor: '生产主管',
        idempotencyKey: `${executionCardCode}:pack:2`,
      },
    });
    assert(secondPackedExecution.record.packedQty === 2, 'second package did not accumulate packed quantity');
    assert(secondPackedExecution.record.packagingRecords?.length === 2, 'second package did not preserve both packaging records on the execution card');
    const secondInboundInspection = await request(
      baseUrl,
      `/quality/production/${encodeURIComponent(secondPackedExecution.qualityTask.code)}/decision`,
      {
        method: 'POST',
        body: {
          result: '合格',
          acceptedQty: 1,
          rejectedQty: 0,
          version: secondPackedExecution.qualityTask.version,
          actor: '质检员',
          remark: '自动流程第二包装批入库抽检合格',
          idempotencyKey: `${secondPackedExecution.qualityTask.code}:decision:1`,
        },
      },
    );
    assert(secondInboundInspection.productionReceipt?.quantity === 1, 'second inbound release did not create an independent warehouse receipt task');
    const secondReceipt = await request(
      baseUrl,
      `/warehouse/production-receipts/${encodeURIComponent(secondInboundInspection.productionReceipt.code)}`,
      {
        method: 'PUT',
        body: {
          ...secondInboundInspection.productionReceipt,
          targetWarehouseCode: 'WH-FG',
          targetWarehouse: '成品仓',
          targetLocation: 'FG-01',
        },
      },
    );
    const secondPostedProductionReceipt = await request(
      baseUrl,
      `/warehouse/production-receipts/${encodeURIComponent(secondReceipt.receipt.code)}/post`,
      { method: 'POST', body: { idempotencyKey: `${secondReceipt.receipt.code}:post:1`, actor: '仓库主管' } },
    );
    assert(secondPostedProductionReceipt.card.inboundQty === 2, 'second production receipt did not complete cumulative inbound quantity');
    assert(secondPostedProductionReceipt.card.node === '已入库' && secondPostedProductionReceipt.card.status === '已完成', 'batch did not complete after every qualified package was inspected and posted');
    const orderAfterProductionInbound = await request(baseUrl, `/sales/orders/${encodeURIComponent(productionSalesOrder.order.code)}`);
    assert(orderAfterProductionInbound.order.productionProgress.status === '已入库', 'sales order did not close production progress after all package receipts were posted');
    assert(orderAfterProductionInbound.order.productionProgress.reportedQty === 2, 'sales order lost reported quantity after inbound');
    assert(orderAfterProductionInbound.order.productionProgress.qualifiedQty === 2, 'sales order lost qualified quantity after inbound');
    assert(orderAfterProductionInbound.order.productionProgress.inboundQty === 2, 'sales order did not expose cumulative posted inbound quantity');
    const executionAfterInbound = await request(baseUrl, `/production/execution-cards/${encodeURIComponent(executionCardCode)}`);
    assert(executionAfterInbound.productionReceipts.length === 2, 'execution card detail did not return both production receipt records');
    assert(executionAfterInbound.packagingRecords.length === 2, 'execution card detail did not return both packaging records');
    assert(executionAfterInbound.record.node === '已入库', 'execution card did not enter inbound completion node');
    assert(executionAfterInbound.record.stageInstances.every((stage) => stage.status === '已完成'), 'execution card stages were not closed after inbound completion');
    const workOrderBeforeClose = await request(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(submittedWorkOrder.record.code)}`,
    );
    const workOrderCloseKey = `smoke-work-order-close-${runId}`;
    const closedWorkOrder = await request(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(submittedWorkOrder.record.code)}/close`,
      {
        method: 'POST',
        body: {
          actor: '生产主管',
          revision: workOrderBeforeClose.record.revision,
          idempotencyKey: workOrderCloseKey,
        },
      },
    );
    assert(closedWorkOrder.record.documentStatus === '已关闭', 'fully inbound work order did not enter the closed document lifecycle');
    assert(closedWorkOrder.record.status === '已完成', 'closing work order overwrote its completed execution fact');
    const repeatedWorkOrderClose = await request(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(submittedWorkOrder.record.code)}/close`,
      {
        method: 'POST',
        body: {
          actor: '生产主管',
          revision: workOrderBeforeClose.record.revision,
          idempotencyKey: workOrderCloseKey,
        },
      },
    );
    assert(repeatedWorkOrderClose.repeated === true, 'work order close retry was not idempotent');

    const removedPurchaseFinance = await requestResult(baseUrl, '/finance/purchase-invoices', {
      method: 'POST',
      body: { code: '系统自动生成', sourceDoc: receiptCode },
    });
    assert(
      removedPurchaseFinance.response.status === 410
        && String(removedPurchaseFinance.payload.error || '').includes('独立财务模块已移除'),
      'removed purchase finance API did not remain explicitly unavailable',
    );

    const patrolDraft = {
      code: '系统自动生成',
      kind: 'patrol',
      sourceDoc: submittedWorkOrder.record.code,
      sourceType: '产线巡检',
      party: '挤出 A1 线',
      contact: '班组长',
      products: [{
        name: '线径与收卷状态',
        qty: '1 次',
        batch: executionCardCode,
        sampleQty: '3 点',
        failedQty: '1 点',
        result: '预警',
        inspectionItems: [
          { name: '在线线径', standard: '连续趋势稳定', actual: '1.75mm', result: '合格' },
          { name: '收卷状态', standard: '排线平整', actual: '边缘轻微松散', result: '预警', defectLevel: '轻微' },
        ],
      }],
      inspector: '质检员',
      status: '待巡检',
      date: shanghaiDate(),
      dueDate: shanghaiDate(1),
      warehouse: '挤出 A1 线',
      productionLine: '挤出 A1 线',
      leader: '班组长',
      operator: '操作员',
      defectLevel: '轻微',
      disposition: '现场整改',
      conclusion: '发现收卷边缘轻微松散，已调整张力。',
      note: '自动流程质量巡检闭环。',
    };
    const createdPatrol = await request(baseUrl, '/quality/patrol', {
      method: 'POST',
      body: { draft: patrolDraft, attachments: [], actor: '质检员', idempotencyKey: 'flow:patrol:create:1' },
    });
    assert(createdPatrol.record.status === '待巡检' && createdPatrol.record.revision === 1, 'quality patrol was not created with an independent lifecycle');
    assert(createdPatrol.record.draft.qualityStandardSnapshot?.code === 'QSTD-QC-PATROL-V1', 'quality patrol did not freeze the active patrol standard');
    const savedPatrol = await request(baseUrl, `/quality/patrol/${encodeURIComponent(createdPatrol.record.code)}`, {
      method: 'PUT',
      body: {
        draft: { ...patrolDraft, code: createdPatrol.record.code },
        attachments: [{ id: 'ATT-PATROL-1', name: '整改照片.jpg', size: '128 KB', type: 'image/jpeg', uploadedAt: shanghaiDate(), uploadedBy: '班组长' }],
        actor: '班组长',
        revision: createdPatrol.record.revision,
        idempotencyKey: 'flow:patrol:save:1',
      },
    });
    assert(savedPatrol.record.revision === 2 && savedPatrol.attachments.length === 1, 'quality patrol draft or attachment metadata was not persisted');
    const inspectedPatrol = await request(baseUrl, `/quality/patrol/${encodeURIComponent(createdPatrol.record.code)}/transition`, {
      method: 'POST',
      body: { nextStatus: '待整改', action: '提交巡检', remark: '异常项进入整改。', draft: savedPatrol.record.draft, attachments: savedPatrol.attachments, actor: '质检员', revision: savedPatrol.record.revision, idempotencyKey: 'flow:patrol:transition:1' },
    });
    assert(inspectedPatrol.record.draft.disposition === '现场整改', 'patrol finding did not derive the整改 destination');
    const tamperedPatrolEvidence = {
      ...inspectedPatrol.record.draft,
      party: '篡改后的巡检位置',
      products: inspectedPatrol.record.draft.products.map((line) => ({ ...line, name: '篡改后的巡检对象' })),
      conclusion: '篡改后的原始巡检结论',
      rectificationAction: '已调整收卷张力并连续观察 30 分钟。',
    };
    const reviewedPatrol = await request(baseUrl, `/quality/patrol/${encodeURIComponent(createdPatrol.record.code)}/transition`, {
      method: 'POST',
      body: { nextStatus: '待复查', action: '提交整改', remark: '整改已完成。', draft: tamperedPatrolEvidence, attachments: inspectedPatrol.attachments, actor: '班组长', revision: inspectedPatrol.record.revision, idempotencyKey: 'flow:patrol:transition:2' },
    });
    assert(reviewedPatrol.record.draft.party === patrolDraft.party, 'patrol整改阶段 overwrote the frozen patrol location');
    assert(reviewedPatrol.record.draft.products[0].name === patrolDraft.products[0].name, 'patrol整改阶段 overwrote the frozen inspection evidence');
    assert(reviewedPatrol.record.draft.conclusion === patrolDraft.conclusion, 'patrol整改阶段 overwrote the frozen inspection conclusion');
    const closedPatrol = await request(baseUrl, `/quality/patrol/${encodeURIComponent(createdPatrol.record.code)}/transition`, {
      method: 'POST',
      body: { nextStatus: '已关闭', action: '复查通过', remark: '复查通过。', draft: { ...reviewedPatrol.record.draft, conclusion: '复查阶段试图覆盖原始结论', verificationConclusion: '复查线径与排线恢复稳定。' }, attachments: reviewedPatrol.attachments, actor: '质检员', revision: reviewedPatrol.record.revision, idempotencyKey: 'flow:patrol:transition:3' },
    });
    assert(closedPatrol.record.status === '已关闭' && closedPatrol.flowRecords.length >= 4, 'quality patrol did not complete the整改/复查 closure');
    assert(closedPatrol.record.draft.conclusion === patrolDraft.conclusion, 'patrol复查阶段 overwrote the frozen inspection conclusion');

    const escalationPatrol = await request(baseUrl, '/quality/patrol', {
      method: 'POST',
      body: { draft: { ...patrolDraft, conclusion: '复查前仍存在持续排线松散风险。' }, attachments: [], actor: '质检员', idempotencyKey: 'flow:patrol-escalation:create:1' },
    });
    const escalationInspected = await request(baseUrl, `/quality/patrol/${encodeURIComponent(escalationPatrol.record.code)}/transition`, {
      method: 'POST',
      body: { nextStatus: '待整改', action: '提交巡检', remark: '异常项进入整改。', draft: escalationPatrol.record.draft, attachments: [], actor: '质检员', revision: escalationPatrol.record.revision, idempotencyKey: 'flow:patrol-escalation:transition:1' },
    });
    const escalationReviewed = await request(baseUrl, `/quality/patrol/${encodeURIComponent(escalationPatrol.record.code)}/transition`, {
      method: 'POST',
      body: { nextStatus: '待复查', action: '提交整改', remark: '整改完成待复查。', draft: { ...escalationInspected.record.draft, rectificationAction: '重新调整张力并更换导轮。' }, attachments: [], actor: '班组长', revision: escalationInspected.record.revision, idempotencyKey: 'flow:patrol-escalation:transition:2' },
    });
    const escalatedPatrol = await request(baseUrl, `/quality/patrol/${encodeURIComponent(escalationPatrol.record.code)}/transition`, {
      method: 'POST',
      body: { nextStatus: '已关闭', action: '升级不良', remark: '复查仍异常，升级不良。', draft: { ...escalationReviewed.record.draft, verificationConclusion: '复查仍出现间歇性排线松散，需要专项处置。' }, attachments: [], actor: '质检员', revision: escalationReviewed.record.revision, idempotencyKey: 'flow:patrol-escalation:transition:3' },
    });
    assert(escalatedPatrol.record.draft.verificationResult === '未通过' && escalatedPatrol.linkedDefect?.status === '待处理', 'failed patrol review did not create a linked defect record');
    assert(escalatedPatrol.linkedDefect?.draft.sourcePatrolCode === escalationPatrol.record.code, 'linked defect lost its patrol source');

    const defectDraft = {
      ...patrolDraft,
      kind: 'defects',
      sourceType: '生产质检',
      products: [{ name: '收卷成品', qty: '8 卷', batch: executionCardCode, sampleQty: '8 卷', failedQty: '1 卷', result: '不合格' }],
      party: '挤出 A1 线',
      status: '待处理',
      disposition: '返绕',
      conclusion: '一卷排线偏松，返绕后独立验证。',
      note: '自动流程不良处置闭环。',
    };
    const createdDefect = await request(baseUrl, '/quality/defects', {
      method: 'POST',
      body: { draft: defectDraft, attachments: [], actor: '质检员', idempotencyKey: 'flow:defect:create:1' },
    });
    const processingDefect = await request(baseUrl, `/quality/defects/${encodeURIComponent(createdDefect.record.code)}/transition`, {
      method: 'POST',
      body: { nextStatus: '处置中', action: '开始处置', remark: '返绕方案已确认。', draft: createdDefect.record.draft, attachments: [], actor: '班组长', revision: createdDefect.record.revision, idempotencyKey: 'flow:defect:transition:1' },
    });
    const verifyingDefect = await request(baseUrl, `/quality/defects/${encodeURIComponent(createdDefect.record.code)}/transition`, {
      method: 'POST',
      body: { nextStatus: '待验证', action: '提交验证', remark: '返绕完成，等待质量验证。', draft: { ...processingDefect.record.draft, sourceType: '客户反馈', party: '错误责任方', products: [{ ...processingDefect.record.draft.products[0], qty: '999 卷' }], disposition: '报废', rectificationAction: '已完成返绕并隔离原不良盘。' }, attachments: [], actor: '班组长', revision: processingDefect.record.revision, idempotencyKey: 'flow:defect:transition:2' },
    });
    assert(verifyingDefect.record.draft.sourceType === defectDraft.sourceType, 'defect handling overwrote the frozen source type');
    assert(verifyingDefect.record.draft.party === defectDraft.party, 'defect handling overwrote the frozen responsibility source');
    assert(verifyingDefect.record.draft.products[0].qty === defectDraft.products[0].qty, 'defect handling overwrote the frozen affected quantity');
    assert(verifyingDefect.record.draft.disposition === defectDraft.disposition, 'defect handling overwrote the approved disposition plan');
    const returnedDefect = await request(baseUrl, `/quality/defects/${encodeURIComponent(createdDefect.record.code)}/transition`, {
      method: 'POST',
      body: { nextStatus: '处置中', action: '退回处置', remark: '验证未通过。', draft: { ...verifyingDefect.record.draft, verificationConclusion: '抽检仍有一处排线松散，需要再次返绕。' }, attachments: [], actor: '质检员', revision: verifyingDefect.record.revision, idempotencyKey: 'flow:defect:transition:3' },
    });
    assert(returnedDefect.record.status === '处置中' && returnedDefect.record.draft.verificationResult === '未通过', 'failed defect verification did not return to disposition');
    const reVerifyingDefect = await request(baseUrl, `/quality/defects/${encodeURIComponent(createdDefect.record.code)}/transition`, {
      method: 'POST',
      body: { nextStatus: '待验证', action: '提交验证', remark: '再次返绕完成。', draft: { ...returnedDefect.record.draft, rectificationAction: '二次返绕并重新调整张力参数。', verificationConclusion: '' }, attachments: [], actor: '班组长', revision: returnedDefect.record.revision, idempotencyKey: 'flow:defect:transition:4' },
    });
    const closedDefect = await request(baseUrl, `/quality/defects/${encodeURIComponent(createdDefect.record.code)}/transition`, {
      method: 'POST',
      body: { nextStatus: '已关闭', action: '验证通过', remark: '验证通过。', draft: { ...reVerifyingDefect.record.draft, sourceDoc: '错误来源单据', disposition: '让步接收', rectificationAction: '错误覆盖处置结果', verificationConclusion: '二次返绕后抽检合格，允许关闭。' }, attachments: [], actor: '质检员', revision: reVerifyingDefect.record.revision, idempotencyKey: 'flow:defect:transition:5' },
    });
    assert(closedDefect.record.status === '已关闭', 'nonconformance did not preserve the 处置/验证 lifecycle');
    assert(closedDefect.record.draft.sourceDoc === defectDraft.sourceDoc, 'defect verification overwrote the frozen source document');
    assert(closedDefect.record.draft.disposition === defectDraft.disposition, 'defect verification overwrote the approved disposition plan');
    assert(closedDefect.record.draft.rectificationAction === '二次返绕并重新调整张力参数。', 'defect verification overwrote the executed disposition result');

    console.log(`Flow smoke passed: ${baseUrl}`);
    console.log(`- production recipe: ${recipeDraft.record.code} -> revision ${revisedRecipe.record.revision}`);
    console.log(`- department: ${department.record.code}`);
    console.log(`- concurrent writes preserved: ${concurrentCodes.join(', ')}`);
    console.log(`- sales quote/order/outbound: ${quote.quote.code} -> ${order.order.code} -> ${outbound.request.code}`);
    console.log(`- purchase requisition/order/receipt: ${requisition.requisition.code} -> ${purchaseOrder.order.code} -> ${receiptCode}`);
    console.log(`- incoming quality: ${incomingCode} -> ${reinspection.task.code} -> ${returnedDisposition.returnDocument.code}`);
    console.log(`- stocktake: ${stocktake.stocktake.code}`);
    console.log('- finance boundary: independent finance APIs return 410; commercial progress remains in sales and purchase');
    console.log(`- production: ${submittedWorkOrder.record.code} -> ${workOrderRelease.release.code} -> ${postedMaterialIssue.issue.code} -> ${postedMaterialIssue.executionCard.code} -> ${pausedExecution.event.code} -> ${shiftHandover.handover.code} -> ${productionException.record.code} -> ${productionReport.report.code} -> ${productionReceipt.receipt.code}`);
    console.log(`- quality closure: ${createdPatrol.record.code} -> 已关闭; ${createdDefect.record.code} -> 已关闭`);
  } catch (error) {
    console.error(logs.trim());
    throw error;
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

await main();
