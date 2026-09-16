import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataFile = process.env.FILATRIX_DATA_FILE || join(rootDir, 'server/data/erp-data.json');
const baseUrl = (process.env.FILATRIX_SMOKE_API_BASE || process.env.VITE_API_BASE || 'http://127.0.0.1:5175/api').replace(
  /\/$/,
  '',
);
const removedFields = ['manager', 'operatingState', 'primary', 'secondary'];
const smokeRunSuffix = Date.now().toString(36);

async function request(path, { method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status !== status) {
    throw new Error(`${method} ${path}: expected HTTP ${status}, got ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function assertConciseProductionLine(record) {
  if (
    !record?.code
    || !record?.name
    || !record?.type
    || !record?.owner
    || !record?.workshop
    || !record?.capacityValue
    || !record?.capacityUnit
    || !record?.processScope
    || removedFields.some((key) => key in (record || {}))
  ) {
    throw new Error(`production-line field boundary failed: ${JSON.stringify(record)}`);
  }
}

const snapshot = readFileSync(dataFile, 'utf8');

try {
  const source = await request('/master-data/productionLines/LINE-PLA-01');
  assertConciseProductionLine(source.record);

  const updated = await request('/master-data/productionLines/LINE-PLA-01', {
    method: 'PUT',
    body: {
      ...source.record,
      manager: '周宁',
      operatingState: '维修中',
      primary: '伪造位置',
      secondary: '伪造范围',
    },
  });
  assertConciseProductionLine(updated.record);

  const invalidDepartment = await request('/master-data/productionLines', {
    method: 'POST',
    status: 400,
    body: {
      ...source.record,
      code: '系统自动生成',
      name: `Smoke 错误部门产线 ${smokeRunSuffix}`,
      owner: '不存在部门',
    },
  });
  if (!String(invalidDepartment.error || '').includes('有效且启用的部门')) {
    throw new Error(`production-line department guard returned an unclear error: ${JSON.stringify(invalidDepartment)}`);
  }

  const invalidCapacityUnit = await request('/master-data/productionLines', {
    method: 'POST',
    status: 400,
    body: {
      ...source.record,
      code: '系统自动生成',
      name: `Smoke 错误产能单位产线 ${smokeRunSuffix}`,
      type: '挤出产线',
      capacityUnit: '卷/班',
    },
  });
  if (!String(invalidCapacityUnit.error || '').includes('统一使用 kg/小时')) {
    throw new Error(`production-line capacity-unit guard returned an unclear error: ${JSON.stringify(invalidCapacityUnit)}`);
  }

  const created = await request('/master-data/productionLines', {
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: `Smoke 二号复绕线 ${smokeRunSuffix}`,
      type: '复绕产线',
      workshop: '复绕车间',
      capacityValue: 320,
      capacityUnit: '卷/班',
      processScope: '大盘半成品复绕为 1kg 小盘成品',
      manager: '周宁',
      operatingState: '维修中',
      primary: '伪造位置',
      secondary: '伪造范围',
      owner: '生产管理部',
      status: '启用',
      note: 'Smoke 复绕产线。',
    },
  });
  assertConciseProductionLine(created.record);
  if (created.record.type !== '复绕产线' || created.record.capacityUnit !== '卷/班') {
    throw new Error(`production-line normalization failed: ${JSON.stringify(created.record)}`);
  }

  const data = JSON.parse(readFileSync(dataFile, 'utf8'));
  const duplicateCard = data.production?.executionCards?.find((card) => card.node === '待包装')
    || data.production?.executionCards?.[0];
  if (!duplicateCard) throw new Error('production-line operation-job canonicalization smoke: execution card missing');
  const duplicateJobCode = `OP-SMOKE-DUPLICATE-${smokeRunSuffix}`;
  duplicateCard.operationJobs = [
    ...(Array.isArray(duplicateCard.operationJobs) ? duplicateCard.operationJobs : []),
    {
      code: duplicateJobCode,
      operationType: '挤出生产',
      assignedLine: 'PLA 一号挤出线',
      recommendedLine: 'PLA 一号挤出线',
      status: '已完成',
      actualQty: Number(duplicateCard.reportedQty || 0),
      actualEnd: '2026-08-05 10:00',
    },
    {
      code: duplicateJobCode,
      operationType: '挤出生产',
      assignedLine: 'PLA 一号挤出线',
      recommendedLine: 'PLA 一号挤出线',
      status: '执行中',
    },
  ];
  writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`);

  const normalizedCard = await request(`/production/execution-cards/${duplicateCard.code}`);
  const normalizedDuplicateJobs = normalizedCard.record?.operationJobs?.filter((job) => job.code === duplicateJobCode) || [];
  if (normalizedDuplicateJobs.length !== 1 || normalizedDuplicateJobs[0].status !== '已完成') {
    throw new Error(`duplicate operation-job canonicalization failed: ${JSON.stringify(normalizedDuplicateJobs)}`);
  }

  const activeCard = data.production?.executionCards?.find((card) => ['待首件', '待首检', '半成品报工', '生产报工'].includes(card.node));
  if (!activeCard) throw new Error('production-line active-job guard smoke: active execution card missing');
  activeCard.operationJobs = [
    ...(Array.isArray(activeCard.operationJobs) ? activeCard.operationJobs : []),
    {
      code: `OP-SMOKE-LINE-LOCK-${smokeRunSuffix}`,
      operationType: '挤出生产',
      assignedLine: 'PLA 一号挤出线',
      recommendedLine: 'PLA 一号挤出线',
      status: '执行中',
    },
  ];
  writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`);

  const blocked = await request('/master-data/productionLines/LINE-PLA-01', {
    method: 'PUT',
    status: 400,
    body: { ...updated.record, status: '停用' },
  });
  if (!String(blocked.error || '').includes('未结束设备作业')) {
    throw new Error(`production-line active-job guard returned an unclear error: ${JSON.stringify(blocked)}`);
  }

  console.log('Production-line smoke passed');
  console.log('- fixed manager, static operating state, and duplicate summary fields are stripped');
  console.log('- duplicate operation jobs are canonicalized before line capacity and master-data guards');
  console.log('- department, capacity-unit, and genuine active-operation guards remain active');
  console.log('- rewind capacity continues to use a separate roll-based unit');
} finally {
  writeFileSync(dataFile, snapshot);
}
