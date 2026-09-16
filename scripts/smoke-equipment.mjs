import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataFile = process.env.FILATRIX_DATA_FILE || join(rootDir, 'server/data/erp-data.json');
const baseUrl = (process.env.FILATRIX_SMOKE_API_BASE || process.env.VITE_API_BASE || 'http://127.0.0.1:5175/api').replace(
  /\/$/,
  '',
);
const removedFields = ['type', 'manager', 'operatingState', 'maintenanceCycleWeeks', 'sourcePurchase'];

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

function assertConciseEquipment(record) {
  if (
    !record?.code
    || !record?.name
    || !record?.owner
    || removedFields.some((key) => key in (record || {}))
  ) {
    throw new Error(`equipment field boundary failed: ${JSON.stringify(record)}`);
  }
}

const snapshot = readFileSync(dataFile, 'utf8');

try {
  const source = await request('/master-data/equipment/EQ-DIA-01');
  assertConciseEquipment(source.record);

  const updated = await request('/master-data/equipment/EQ-DIA-01', {
    method: 'PUT',
    body: {
      ...source.record,
      type: '生产资产',
      manager: '周宁',
      operatingState: '维修中',
      maintenanceCycleWeeks: 2,
      note: '用于在线测径；镜头清洁和标准棒校验由后续维护单记录。',
    },
  });
  assertConciseEquipment(updated.record);

  const invalidDepartment = await request('/master-data/equipment', {
    method: 'POST',
    status: 400,
    body: {
      ...source.record,
      code: '系统自动生成',
      name: 'Smoke 错误部门设备',
      serialNumber: 'SMOKE-EQ-WRONG-DEPARTMENT',
      owner: '不存在部门',
      sourcePurchase: '',
    },
  });
  if (!String(invalidDepartment.error || '').includes('有效且启用的部门')) {
    throw new Error(`equipment department guard returned an unclear error: ${JSON.stringify(invalidDepartment)}`);
  }

  const duplicateSerial = await request('/master-data/equipment', {
    method: 'POST',
    status: 400,
    body: {
      ...source.record,
      code: '系统自动生成',
      name: 'Smoke 重复序列号设备',
      sourcePurchase: '',
    },
  });
  if (!String(duplicateSerial.error || '').includes('出厂编号已存在')) {
    throw new Error(`equipment serial guard returned an unclear error: ${JSON.stringify(duplicateSerial)}`);
  }

  const created = await request('/master-data/equipment', {
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: '自动贴标机',
      type: '生产设备',
      brand: 'Smoke',
      model: 'AL-01',
      spec: '适配 1kg 彩盒',
      serialNumber: 'SMOKE-ASSET-PO-001',
      operatingState: '维修中',
      primary: '包装车间',
      owner: '生产管理部',
      manager: '周宁',
      maintenanceCycleWeeks: 4,
      startDate: '2026-07-01',
      sourcePurchase: 'PO-20260714-007',
      status: '启用',
      note: 'Smoke 独立生产设备登记。',
    },
  });
  assertConciseEquipment(created.record);

  console.log('Equipment smoke passed');
  console.log('- legacy asset, fixed manager, static operating state, and inert maintenance fields are stripped');
  console.log('- department and serial number guards remain active');
  console.log('- equipment remains an independent production resource without a purchase-ledger link');
} finally {
  writeFileSync(dataFile, snapshot);
}
