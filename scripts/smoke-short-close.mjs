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

function checkpointResults(task, failedName = '', actual = '') {
  return (task.checkpoints || []).map((name) => ({
    name,
    standard: `烟测检查：${name}`,
    actual: name === failedName ? actual : '',
    result: name === failedName ? '不合格' : '合格',
    note: name === failedName ? actual : '',
  }));
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

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: HTTP ${response.status} ${payload.error || ''}`.trim());
  return payload;
}

async function confirmFinishedGoodsDestination(baseUrl, receipt) {
  return request(baseUrl, `/warehouse/production-receipts/${encodeURIComponent(receipt.code)}`, {
    method: 'PUT',
    body: {
      targetWarehouseCode: 'WH-FG',
      targetWarehouse: '成品仓',
      targetLocation: 'FG-01',
      note: '短关完整链路烟测',
    },
  });
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const payload = await request(baseUrl, '/health');
      if (payload.ok) return;
    } catch {
      // Retry while the isolated server starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error('isolated short-close API did not become healthy');
}

function addShortCloseScenario(data, suffix) {
  const cardCode = `EC2-SHORT-${suffix}`;
  const workOrderCode = `MO2-SHORT-${suffix}`;
  const releaseCode = `RB2-SHORT-${suffix}`;
  const reportCode = `PRPT2-SHORT-${suffix}`;
  const qualityCode = `PQC2-SHORT-${suffix}`;
  const wipCode = `LRL2-SHORT-${suffix}`;
  const now = '2026-07-19 08:00';
  data.production.workOrders.unshift({
    code: workOrderCode,
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    planQty: 10,
    unit: '卷',
    processTemplateCode: 'PRC2-WIRE-DRAWING-REWIND-V1',
    linePlans: [{ lineType: '复绕机', line: '复绕 R1 线', leader: '复绕班长' }],
    documentStatus: '已确认',
    status: '生产中',
    currentNode: '待过程检',
    revision: 1,
  });
  data.production.workOrderReleases.unshift({
    code: releaseCode,
    workOrderCode,
    planQty: 10,
    unit: '卷',
    line: '复绕 R1 线',
    lineType: '复绕机',
    releaseStatus: '已释放',
    materialStatus: '已领料',
    executionStatus: '待质检',
    qualityStatus: '待检',
    inboundStatus: '待放行',
    executionCardCodes: [cardCode],
    qualityTaskCodes: [qualityCode],
  });
  data.production.executionCards.unshift({
    code: cardCode,
    releaseBatchCode: releaseCode,
    workOrderCode,
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    line: '复绕 R1 线',
    lineType: '复绕机',
    shift: '白班',
    leader: '复绕班长',
    operator: '复绕操作员',
    planQty: 10,
    issuedQty: 10,
    reportedQty: 6,
    qualifiedQty: 0,
    packedQty: 0,
    releasedInboundQty: 0,
    inboundQty: 0,
    defectQty: 0,
    unit: '卷',
    node: '待过程检',
    status: '待质检',
    nextAction: `完成报工全检 ${qualityCode}`,
    processTemplateCode: 'PRC2-WIRE-DRAWING-REWIND-V1',
    materialIssueCode: `WMI2-SHORT-${suffix}`,
    qualityTaskCodes: [qualityCode],
    reportCodes: [reportCode],
    wipBatchCodes: [wipCode],
    operationJobs: [
      {
        code: `${cardCode}-OP-EXT`, productionBatchCode: cardCode, operationType: '挤出生产', lineType: '拉丝机', assignedLine: '挤出 A1 线', recommendedLine: '挤出 A1 线', sequence: 10,
        plannedQty: 9, plannedUnit: 'kg', actualQty: 9, actualUnit: 'kg', status: '已完成', nextAction: '挤出设备作业已结束', createdAt: now, actualStart: now, actualEnd: now,
      },
      {
        code: `${cardCode}-OP-RW-${wipCode}`, productionBatchCode: cardCode, operationType: '复绕生产', lineType: '复绕机', assignedLine: '复绕 R1 线', recommendedLine: '复绕 R1 线', sequence: 20,
        sourceWipBatchCode: wipCode, plannedQty: 9, plannedUnit: 'kg', actualQty: 6, actualUnit: '卷', status: '已完成', nextAction: '复绕设备作业已结束', createdAt: now, actualStart: now, actualEnd: now,
        completionMode: '短关', shortCloseReason: '换色计划提前结束', remainingQtyAtClose: 4,
      },
    ],
    activeOperationJobCode: '',
    shortClosedAt: now,
    shortClosedBy: '复绕班长',
    shortCloseReason: '换色计划提前结束',
    shortCloseRemainingQty: 4,
    shortCloseResolution: '待处理',
    revision: 1,
    startedAt: now,
    updatedAt: now,
  });
  data.production.productionReports.unshift({
    code: reportCode,
    executionCardCode: cardCode,
    releaseBatchCode: releaseCode,
    workOrderCode,
    operationJobCode: `${cardCode}-OP-RW-${wipCode}`,
    kind: '成品报工',
    sourceWipBatchCode: wipCode,
    consumedWeightKg: 5.8,
    lossWeightKg: 0.2,
    goodQty: 6,
    defectQty: 0,
    acceptedQty: 0,
    rejectedQty: 0,
    unit: '卷',
    status: '待质检',
    reporter: '复绕班长',
    reportedAt: now,
    qualityTaskCode: qualityCode,
    closeOperation: true,
    shortCloseReason: '换色计划提前结束',
    idempotencyKey: `${cardCode}:report:1`,
  });
  data.production.wipBatches.unshift({
    code: wipCode,
    executionCardCode: cardCode,
    workOrderCode,
    releaseBatchCode: releaseCode,
    sourceReportCode: `PRPT2-WIP-${suffix}`,
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    netWeightKg: 9,
    qualifiedWeightKg: 9,
    usedWeightKg: 5.8,
    lossWeightKg: 0.2,
    outputWeightKg: 5.8,
    consumedWeightKg: 6,
    availableWeightKg: 3,
    unit: 'kg',
    line: '挤出 A1 线',
    operator: '挤出操作员',
    shift: '白班',
    status: '部分使用',
    producedAt: now,
  });
  data.production.qualityTasks.unshift({
    code: qualityCode,
    taskKey: `${cardCode}:报工全检:${reportCode}`,
    sourceCard: cardCode,
    sourceDoc: cardCode,
    workOrderCode,
    releaseBatchCode: releaseCode,
    sourceReportCode: reportCode,
    kind: '报工全检',
    sourceType: '报工全检',
    node: '待过程检',
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    line: '复绕 R1 线',
    lineType: '复绕机',
    shift: '白班',
    leader: '复绕班长',
    operator: '复绕操作员',
    quantity: 6,
    unit: '卷',
    sampleQty: '6 卷',
    inspector: '质检员',
    status: '待检',
    checkpoints: ['外观', '线径'],
    result: '待检验',
    disposition: '合格产出进入包装确认',
    version: 0,
    idempotencyKey: `${qualityCode}:create`,
    createdAt: now,
  });
  return { cardCode, workOrderCode, releaseCode, reportCode, qualityCode, wipCode };
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'filatrix-short-close-'));
  const dataFile = join(tempDir, 'erp-data.json');
  const data = createSeedData();
  const supplement = addShortCloseScenario(data, 'SUP');
  const accept = addShortCloseScenario(data, 'ACC');
  const direct = addShortCloseScenario(data, 'DIR');
  const directWorkOrder = data.production.workOrders.find((item) => item.code === direct.workOrderCode);
  const directRelease = data.production.workOrderReleases.find((item) => item.code === direct.releaseCode);
  const directCard = data.production.executionCards.find((item) => item.code === direct.cardCode);
  const directReport = data.production.productionReports.find((item) => item.code === direct.reportCode);
  const directQuality = data.production.qualityTasks.find((item) => item.code === direct.qualityCode);
  directWorkOrder.processTemplateCode = 'PRC2-EXTRUSION-V1';
  directWorkOrder.linePlans = [{ lineType: '挤出产线', line: '挤出 A1 线', leader: '挤出班长' }];
  directRelease.line = '挤出 A1 线';
  directRelease.lineType = '挤出产线';
  directCard.processTemplateCode = 'PRC2-EXTRUSION-V1';
  directCard.line = '挤出 A1 线';
  directCard.lineType = '挤出产线';
  directCard.wipBatchCodes = [];
  directCard.operationJobs = [{
    code: `${direct.cardCode}-OP-EXT`, productionBatchCode: direct.cardCode, operationType: '挤出生产', lineType: '挤出产线', assignedLine: '挤出 A1 线', recommendedLine: '挤出 A1 线', sequence: 10,
    plannedQty: 10, plannedUnit: '卷', actualQty: 6, actualUnit: '卷', status: '已完成', nextAction: '挤出设备作业已结束', createdAt: '2026-07-19 08:00', actualStart: '2026-07-19 08:00', actualEnd: '2026-07-19 08:00',
    completionMode: '短关', shortCloseReason: '换色计划提前结束', remainingQtyAtClose: 4,
  }];
  directReport.operationJobCode = `${direct.cardCode}-OP-EXT`;
  delete directReport.sourceWipBatchCode;
  delete directReport.consumedWeightKg;
  delete directReport.lossWeightKg;
  directQuality.line = '挤出 A1 线';
  directQuality.lineType = '挤出产线';
  data.production.wipBatches = data.production.wipBatches.filter((item) => item.code !== direct.wipCode);
  await writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8');
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: rootDir,
    env: { ...process.env, FILATRIX_API_HOST: '127.0.0.1', FILATRIX_API_PORT: String(port), FILATRIX_DATA_FILE: dataFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  try {
    await waitForHealth(baseUrl, child);
    const supplementDecision = await request(baseUrl, `/production/execution-cards/${supplement.cardCode}/short-close-resolution`, {
      method: 'POST',
      body: { revision: 1, action: '安排补产', reason: '订单仍需足量交付', actor: '计划主管', idempotencyKey: `${supplement.cardCode}:resolve:1` },
    });
    assert(supplementDecision.record.shortCloseResolution === '安排补产', 'supplement decision was not saved');
    assert(supplementDecision.operationJob?.status === '待排程', 'supplement job should wait for current report inspection');
    assert(supplementDecision.operationJob?.sourceWipBatchCode === supplement.wipCode, 'supplement job lost source large reel');
    const supplementQualityBeforeDecision = await request(baseUrl, `/quality/production/${supplement.qualityCode}`);
    assert(supplementQualityBeforeDecision.record.disposition === '合格后激活短关补产作业', 'report inspection did not explain supplement consequence');
    const releasesAfterDecision = await request(baseUrl, `/production/work-orders/${supplement.workOrderCode}/releases`);
    assert(releasesAfterDecision.items.length === 1, 'supplement decision created another release batch');
    const passedInspection = await request(baseUrl, `/quality/production/${supplement.qualityCode}/decision`, {
      method: 'POST',
      body: { result: '合格', acceptedQty: 6, rejectedQty: 0, version: 0, actor: '质检员', remark: '短关报工合格', idempotencyKey: `${supplement.qualityCode}:decision:1` },
    });
    const readyJob = passedInspection.executionCard.operationJobs.find((job) => job.code === supplementDecision.operationJob.code);
    assert(readyJob?.status === '可开工', 'quality release did not activate supplement job');
    assert(passedInspection.executionCard.status === '待处理', 'supplement batch did not return to ready state');
    const started = await request(baseUrl, `/production/execution-cards/${supplement.cardCode}/operation-jobs/${encodeURIComponent(readyJob.code)}/start`, {
      method: 'POST',
      body: { revision: passedInspection.executionCard.revision, line: readyJob.assignedLine, leader: '复绕班长', operator: '复绕班长', actor: '复绕班长', idempotencyKey: `${readyJob.code}:start:1` },
    });
    assert(started.operationJob.status === '执行中', 'supplement rewind job did not start');
    assert(!started.qualityTask, 'supplement rewind should not repeat startup inspection');
    const completedSupplement = await request(baseUrl, `/production/execution-cards/${supplement.cardCode}/report`, {
      method: 'POST',
      body: { revision: started.record.revision, goodQty: 4, defectQty: 0, sourceWipBatchCode: supplement.wipCode, consumedWeightKg: 2.8, lossWeightKg: 0.2, actor: '复绕班长', remark: '补产完成', idempotencyKey: `${supplement.cardCode}:report:2` },
    });
    assert(completedSupplement.record.reportedQty === 10, 'supplement report did not restore planned output');
    assert(completedSupplement.operationJob?.status === '已完成', 'supplement job did not auto-complete at plan quantity');
    assert(completedSupplement.operationJob?.actualQty === 4, 'supplement job should only carry its own reported output');
    const baseRewindJob = completedSupplement.record.operationJobs.find((job) => job.code === `${supplement.cardCode}-OP-RW-${supplement.wipCode}`);
    assert(baseRewindJob?.actualQty === 6, 'base rewind job was incorrectly overwritten by supplement output');
    const supplementReportInspection = await request(baseUrl, `/quality/production/${completedSupplement.qualityTask.code}/decision`, {
      method: 'POST',
      body: { result: '合格', acceptedQty: 4, rejectedQty: 0, version: 0, actor: '质检员', remark: '补产报工合格', idempotencyKey: `${completedSupplement.qualityTask.code}:decision:1` },
    });
    assert(supplementReportInspection.executionCard.node === '待包装', 'completed supplement inspection did not enter packaging');
    assert(supplementReportInspection.executionCard.qualifiedQty === 10, 'supplement inspection did not preserve cumulative qualified quantity');
    const packed = await request(baseUrl, `/production/execution-cards/${supplement.cardCode}/pack`, {
      method: 'POST',
      body: { revision: supplementReportInspection.executionCard.revision, quantity: 10, packageRef: `${supplement.cardCode}-PKG-01`, actor: '包装班长', idempotencyKey: `${supplement.cardCode}:pack:1` },
    });
    assert(packed.record.node === '待抽检', 'packaging did not create the inbound inspection gate');
    assert(packed.qualityTask?.kind === '入库抽检', 'packaging did not create an inbound inspection task');
    assert(packed.qualityTask?.sampleQty === '2 卷', 'inbound inspection did not sample 10% with the two-roll minimum');
    const inboundInspection = await request(baseUrl, `/quality/production/${packed.qualityTask.code}/decision`, {
      method: 'POST',
      body: { result: '合格', acceptedQty: 10, rejectedQty: 0, version: 0, actor: '质检员', remark: '入库抽检合格', idempotencyKey: `${packed.qualityTask.code}:decision:1` },
    });
    assert(inboundInspection.executionCard.node === '待入库', 'inbound inspection did not release the warehouse receipt gate');
    assert(inboundInspection.executionCard.status === '待仓库', 'inbound inspection should wait for warehouse posting');
    assert(inboundInspection.executionCard.releasedInboundQty === 10, 'inbound inspection released the wrong quantity');
    const receiptTask = inboundInspection.productionReceipt;
    assert(receiptTask?.code, 'inbound inspection did not automatically create a warehouse production receipt task');
    assert(receiptTask.status === '待入库', 'auto-generated production receipt did not enter the warehouse queue');
    assert(receiptTask.quantity === 10, 'auto-generated production receipt did not use the cumulative released quantity');
    const supplementDestination = await confirmFinishedGoodsDestination(baseUrl, receiptTask);
    assert(supplementDestination.receipt.targetLocation === 'FG-01', 'supplement receipt destination was not saved');
    const postedReceipt = await request(baseUrl, `/warehouse/production-receipts/${receiptTask.code}/post`, {
      method: 'POST',
      body: { actor: '仓库主管', idempotencyKey: `${receiptTask.code}:post:1` },
    });
    assert(postedReceipt.receipt.status === '已完成', 'production receipt was not posted');
    assert(postedReceipt.card.node === '已入库' && postedReceipt.card.status === '已完成', 'warehouse posting did not close the production batch');
    assert(postedReceipt.card.inboundQty === 10, 'warehouse posting did not preserve the full inbound quantity');

    const acceptDecision = await request(baseUrl, `/production/execution-cards/${accept.cardCode}/short-close-resolution`, {
      method: 'POST',
      body: { revision: 1, action: '接受短缺', reason: '客户确认接受少交', actor: '计划主管', idempotencyKey: `${accept.cardCode}:resolve:1` },
    });
    assert(acceptDecision.record.acceptedShortageQty === 4, 'accepted shortage quantity was not preserved');
    assert(!acceptDecision.operationJob, 'accepted shortage should not create a supplement job');
    const acceptQualityBeforeDecision = await request(baseUrl, `/quality/production/${accept.qualityCode}`);
    assert(acceptQualityBeforeDecision.record.disposition === '合格后按实际数量进入包装', 'report inspection did not explain accepted-shortage consequence');
    const acceptedInspection = await request(baseUrl, `/quality/production/${accept.qualityCode}/decision`, {
      method: 'POST',
      body: { result: '合格', acceptedQty: 6, rejectedQty: 0, version: 0, actor: '质检员', remark: '短交批次报工合格', idempotencyKey: `${accept.qualityCode}:decision:1` },
    });
    assert(acceptedInspection.executionCard.node === '待包装', 'accepted shortage did not release actual qualified quantity to packaging');
    assert(acceptedInspection.executionCard.planQty === 10, 'accepted shortage rewrote the original plan quantity');
    const acceptedEffectiveTarget = Number(acceptedInspection.executionCard.planQty || 0)
      - Number(acceptedInspection.executionCard.acceptedShortageQty || 0);
    assert(acceptedEffectiveTarget === 6, 'accepted shortage did not reduce the effective inbound target to actual output');
    const acceptedPacked = await request(baseUrl, `/production/execution-cards/${accept.cardCode}/pack`, {
      method: 'POST',
      body: {
        revision: acceptedInspection.executionCard.revision,
        quantity: acceptedEffectiveTarget,
        packageRef: `${accept.cardCode}-PKG-01`,
        actor: '包装班长',
        idempotencyKey: `${accept.cardCode}:pack:1`,
      },
    });
    assert(acceptedPacked.record.node === '待抽检', 'accepted-shortage packaging did not enter inbound inspection');
    assert(acceptedPacked.record.packedQty === 6, 'accepted-shortage packaging did not use the effective target');
    assert(acceptedPacked.qualityTask?.kind === '入库抽检', 'accepted-shortage packaging did not create inbound inspection');
    const acceptedInboundInspection = await request(
      baseUrl,
      `/quality/production/${acceptedPacked.qualityTask.code}/decision`,
      {
        method: 'POST',
        body: {
          result: '合格',
          acceptedQty: acceptedEffectiveTarget,
          rejectedQty: 0,
          version: 0,
          actor: '质检员',
          remark: '接受短缺批次入库抽检合格',
          idempotencyKey: `${acceptedPacked.qualityTask.code}:decision:1`,
        },
      },
    );
    assert(
      acceptedInboundInspection.executionCard.releasedInboundQty === acceptedEffectiveTarget,
      'accepted-shortage inbound inspection released the wrong effective quantity',
    );
    assert(
      acceptedInboundInspection.executionCard.acceptedShortageQty === 4,
      'accepted-shortage inbound inspection lost the shortage quantity',
    );
    const acceptedReceipt = acceptedInboundInspection.productionReceipt;
    assert(acceptedReceipt?.code, 'accepted-shortage inbound inspection did not create a warehouse receipt');
    assert(acceptedReceipt.quantity === acceptedEffectiveTarget, 'accepted-shortage warehouse receipt used the original plan');
    const acceptedDestination = await confirmFinishedGoodsDestination(baseUrl, acceptedReceipt);
    assert(acceptedDestination.receipt.targetLocation === 'FG-01', 'accepted-shortage receipt destination was not saved');
    const acceptedPostedReceipt = await request(
      baseUrl,
      `/warehouse/production-receipts/${acceptedReceipt.code}/post`,
      {
        method: 'POST',
        body: {
          actor: '仓库主管',
          idempotencyKey: `${acceptedReceipt.code}:post:1`,
        },
      },
    );
    assert(acceptedPostedReceipt.receipt.status === '已完成', 'accepted-shortage production receipt was not posted');
    assert(
      acceptedPostedReceipt.card.node === '已入库' && acceptedPostedReceipt.card.status === '已完成',
      'accepted-shortage production batch did not complete after warehouse posting',
    );
    assert(
      acceptedPostedReceipt.card.inboundQty === acceptedEffectiveTarget,
      'accepted-shortage production batch did not preserve the effective inbound quantity',
    );
    assert(
      acceptedPostedReceipt.card.acceptedShortageQty === 4,
      'accepted-shortage production batch lost its shortage quantity after inbound posting',
    );
    const acceptedWorkOrderBeforeClose = await request(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(accept.workOrderCode)}`,
    );
    const acceptedCloseBody = {
      revision: acceptedWorkOrderBeforeClose.record.revision,
      actor: '生产主管',
      idempotencyKey: `${accept.workOrderCode}:close:1`,
    };
    const acceptedClosedWorkOrder = await request(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(accept.workOrderCode)}/close`,
      { method: 'POST', body: acceptedCloseBody },
    );
    const acceptedCloseReplay = await request(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(accept.workOrderCode)}/close`,
      { method: 'POST', body: acceptedCloseBody },
    );
    assert(acceptedCloseReplay.repeated === true, 'accepted-shortage work-order close retry did not replay');
    assert(
      acceptedCloseReplay.record.revision === acceptedClosedWorkOrder.record.revision,
      'accepted-shortage work-order close retry advanced revision twice',
    );
    assert(
      acceptedClosedWorkOrder.record.documentStatus === '已关闭'
        && acceptedClosedWorkOrder.record.status === '已完成',
      'accepted-shortage work order did not reach its final closed state',
    );
    assert(
      acceptedClosedWorkOrder.record.inboundQty === acceptedEffectiveTarget,
      'closed work order did not preserve the effective inbound target',
    );
    assert(
      acceptedClosedWorkOrder.record.acceptedShortageQty === 4,
      'closed work order did not preserve the accepted shortage quantity',
    );

    const directDecision = await request(baseUrl, `/production/execution-cards/${direct.cardCode}/short-close-resolution`, {
      method: 'POST',
      body: { revision: 1, action: '安排补产', reason: '直接收卷需要补足数量', actor: '计划主管', idempotencyKey: `${direct.cardCode}:resolve:1` },
    });
    assert(directDecision.operationJob?.operationType === '挤出生产', 'direct route did not create an extrusion supplement job');
    assert(directDecision.operationJob?.plannedQty === 4 && directDecision.operationJob?.plannedUnit === '卷', 'direct supplement job did not preserve the remaining controlled quantity');
    const directPassedInspection = await request(baseUrl, `/quality/production/${direct.qualityCode}/decision`, {
      method: 'POST',
      body: { result: '部分合格', acceptedQty: 5, rejectedQty: 1, version: 0, actor: '质检员', remark: '直接收卷短关报工一卷不合格', idempotencyKey: `${direct.qualityCode}:decision:1` },
    });
    const directReportScrap = await request(baseUrl, `/quality/production/${direct.qualityCode}/dispose`, {
      method: 'POST',
      body: { action: 'scrap', quantity: 1, reason: '成品全检不合格卷确认报废', actor: '质检员', decisionVersion: 1, dispositionVersion: 0, idempotencyKey: `${direct.qualityCode}:dispose:1` },
    });
    assert(directReportScrap.executionCard.defectQty === 1, 'scrapping a report-quality reject erased the historical defect quantity');
    assert(
      directReportScrap.executionCard.reportedQty - directReportScrap.executionCard.qualifiedQty - directReportScrap.executionCard.defectQty === 0,
      'scrapping a report-quality reject recreated a phantom pending-inspection quantity',
    );
    const directReadyJob = directReportScrap.executionCard.operationJobs.find((job) => job.code === directDecision.operationJob.code);
    assert(directReadyJob?.status === '可开工', 'direct supplement job was not activated after report inspection');
    const directStarted = await request(baseUrl, `/production/execution-cards/${direct.cardCode}/operation-jobs/${encodeURIComponent(directReadyJob.code)}/start`, {
      method: 'POST',
      body: { revision: directReportScrap.executionCard.revision, line: directReadyJob.assignedLine, leader: '挤出班长', operator: '挤出班长', actor: '挤出班长', idempotencyKey: `${directReadyJob.code}:start:1` },
    });
    assert(directStarted.qualityTask?.kind === '开机首检', 'direct supplement start did not create startup inspection');
    assert(directStarted.qualityTask?.quantity === 4 && directStarted.qualityTask?.unit === '卷', 'direct supplement startup inspection did not inherit the supplement quantity and unit');
    assert(directStarted.qualityTask?.sampleQty === '1 组', 'direct supplement startup inspection sample is not one first-article group');
    const directStartupPassed = await request(baseUrl, `/quality/production/${directStarted.qualityTask.code}/decision`, {
      method: 'POST',
      body: { result: '合格', acceptedQty: 0, rejectedQty: 0, version: 0, actor: '质检员', remark: '补产首检合格', idempotencyKey: `${directStarted.qualityTask.code}:decision:1` },
    });
    const directSupplementReport = await request(baseUrl, `/production/execution-cards/${direct.cardCode}/report`, {
      method: 'POST',
      body: { revision: directStartupPassed.executionCard.revision, goodQty: 4, defectQty: 0, actor: '挤出班长', remark: '直接收卷补产完成', idempotencyKey: `${direct.cardCode}:report:2` },
    });
    const directReportPassed = await request(baseUrl, `/quality/production/${directSupplementReport.qualityTask.code}/decision`, {
      method: 'POST',
      body: { result: '合格', acceptedQty: 4, rejectedQty: 0, version: 0, actor: '质检员', remark: '直接收卷补产全检合格', idempotencyKey: `${directSupplementReport.qualityTask.code}:decision:1` },
    });
    assert(directReportPassed.executionCard.node === '待包装', 'direct supplement did not enter packaging after full inspection');
    const directPacked = await request(baseUrl, `/production/execution-cards/${direct.cardCode}/pack`, {
      method: 'POST',
      body: { revision: directReportPassed.executionCard.revision, quantity: 9, packageRef: `${direct.cardCode}-PKG-01`, actor: '包装班长', idempotencyKey: `${direct.cardCode}:pack:1` },
    });
    assert(directPacked.qualityTask.sampleQty === '2 卷', 'direct inbound inspection did not apply the two-roll minimum sample');
    let inconsistentPassWasRejected = false;
    try {
      await request(baseUrl, `/quality/production/${directPacked.qualityTask.code}/decision`, {
        method: 'POST',
        body: {
          result: '合格',
          acceptedQty: 9,
          rejectedQty: 0,
          sampleDefectQty: 0,
          checkpointResults: checkpointResults(directPacked.qualityTask, '包装规格', '外箱封口松脱'),
          version: 0,
          actor: '质检员',
          idempotencyKey: `${directPacked.qualityTask.code}:invalid-checkpoint-pass`,
        },
      });
    } catch (error) {
      inconsistentPassWasRejected = String(error).includes('存在不合格检查项');
    }
    assert(inconsistentPassWasRejected, 'production quality allowed a passed document with a failed checkpoint');
    let inboundPartialWasRejected = false;
    try {
      await request(baseUrl, `/quality/production/${directPacked.qualityTask.code}/decision`, {
        method: 'POST',
        body: { result: '部分合格', acceptedQty: 8, rejectedQty: 1, sampleDefectQty: 1, version: 0, actor: '质检员', idempotencyKey: `${directPacked.qualityTask.code}:invalid-partial` },
      });
    } catch (error) {
      inboundPartialWasRejected = String(error).includes('整批放行或整批冻结');
    }
    assert(inboundPartialWasRejected, 'inbound sampling incorrectly allowed a partial initial release');
    const directInboundRejected = await request(baseUrl, `/quality/production/${directPacked.qualityTask.code}/decision`, {
      method: 'POST',
      body: {
        result: '不合格',
        acceptedQty: 0,
        rejectedQty: 9,
        sampleDefectQty: 1,
        checkpointResults: checkpointResults(directPacked.qualityTask, '包装规格', '抽检发现一卷外箱封口松脱'),
        version: 0,
        actor: '质检员',
        remark: '抽检发现一卷包装异常，整批冻结',
        idempotencyKey: `${directPacked.qualityTask.code}:decision:1`,
      },
    });
    assert(directInboundRejected.record.sampleDefectQty === 1, 'inbound inspection did not preserve the sample defect count');
    assert(directInboundRejected.record.checkpointResults?.filter((item) => item.result === '不合格').length === 1, 'production quality did not persist its failed checkpoint');
    assert(directInboundRejected.executionCard.releasedInboundQty === 0, 'failed inbound sampling incorrectly released part of the batch');
    assert(directInboundRejected.executionCard.inboundHoldQty === 9, 'failed inbound sampling did not freeze the whole controlled batch');
    assert(directInboundRejected.executionCard.defectQty === 1, 'inbound hold overwrote the independent report defect quantity');
    const directConcession = await request(baseUrl, `/quality/production/${directPacked.qualityTask.code}/dispose`, {
      method: 'POST',
      body: { action: 'approve_concession', quantity: 4, reason: '包装复核后四卷满足让步条件', approvedBy: '质量经理', actor: '质检员', decisionVersion: 1, dispositionVersion: 0, idempotencyKey: `${directPacked.qualityTask.code}:dispose:1` },
    });
    assert(directConcession.executionCard.releasedInboundQty === 4 && directConcession.executionCard.inboundHoldQty === 5, 'partial concession did not split released and held inbound quantities');
    assert(directConcession.executionCard.status === '异常', 'partially disposed inbound batch should remain blocked');
    const directScrap = await request(baseUrl, `/quality/production/${directPacked.qualityTask.code}/dispose`, {
      method: 'POST',
      body: { action: 'scrap', quantity: 5, reason: '剩余包装批次确认报废', actor: '质检员', decisionVersion: 1, dispositionVersion: 1, idempotencyKey: `${directPacked.qualityTask.code}:dispose:2` },
    });
    assert(directScrap.executionCard.releasedInboundQty === 4 && directScrap.executionCard.inboundHoldQty === 0, 'final inbound disposition did not preserve the released quantity and clear the hold');
    assert(directScrap.executionCard.inboundScrappedQty === 5, 'inbound scrap was not retained as an independent closed quantity');
    assert(
      directScrap.executionCard.packedQty
        === directScrap.executionCard.releasedInboundQty + directScrap.executionCard.inboundHoldQty + directScrap.executionCard.inboundScrappedQty,
      'packaged quantity did not reconcile to released, frozen, and scrapped inbound outcomes',
    );
    assert(directScrap.executionCard.node === '待入库' && directScrap.executionCard.status === '待仓库', 'completed inbound disposition did not release the accepted quantity to warehouse');

    console.log(`Short-close smoke passed: ${supplement.cardCode} 复绕补产；${accept.cardCode} 接受短缺；${direct.cardCode} 直接收卷补产`);
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
