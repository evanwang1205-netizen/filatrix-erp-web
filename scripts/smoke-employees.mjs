import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataFile = process.env.FILATRIX_DATA_FILE || join(rootDir, 'server/data/erp-data.json');
const baseUrl = (process.env.FILATRIX_SMOKE_API_BASE || process.env.VITE_API_BASE || 'http://127.0.0.1:5175/api').replace(
  /\/$/,
  '',
);

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

function assertConciseEmployee(record, expectedAccount, expectedAccountStatus) {
  if (
    !record?.code
    || !record?.name
    || !record?.owner
    || !record?.position
    || record?.linkedAccount !== expectedAccount
    || record?.linkedAccountStatus !== expectedAccountStatus
    || 'type' in (record || {})
    || 'employmentStatus' in (record || {})
    || 'supervisor' in (record || {})
  ) {
    throw new Error(`employee field boundary failed: ${JSON.stringify(record)}`);
  }
}

const snapshot = readFileSync(dataFile, 'utf8');

try {
  const source = await request('/master-data/employees/EMP-LM');
  assertConciseEmployee(source.record, 'sales01', '启用');

  const updated = await request('/master-data/employees/EMP-LM', {
    method: 'PUT',
    body: {
      ...source.record,
      type: '外协人员',
      employmentStatus: '离职',
      supervisor: 'EMP-LM',
      linkedAccount: 'forged-account',
      linkedAccountStatus: '停用',
    },
  });
  assertConciseEmployee(updated.record, 'sales01', '启用');

  const created = await request('/master-data/employees', {
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: '流程协调员',
      type: '兼职人员',
      employmentStatus: '休假',
      supervisor: 'EMP-LM',
      owner: '运营管理部',
      position: '流程协调',
      linkedAccount: 'forged-account',
      linkedAccountStatus: '启用',
      phone: '138-0000-0099',
      status: '启用',
    },
  });
  assertConciseEmployee(created.record, '', '未分配');

  const departmentError = await request('/master-data/employees/EMP-LM', {
    method: 'PUT',
    status: 400,
    body: { ...updated.record, owner: '不存在部门', status: '启用' },
  });
  if (!String(departmentError.error || '').includes('有效的所属部门')) {
    throw new Error(`employee department guard returned an unclear error: ${JSON.stringify(departmentError)}`);
  }

  const accountError = await request('/master-data/employees/EMP-LM', {
    method: 'PUT',
    status: 400,
    body: { ...updated.record, status: '停用' },
  });
  if (!String(accountError.error || '').includes('启用账号')) {
    throw new Error(`employee account guard returned an unclear error: ${JSON.stringify(accountError)}`);
  }

  console.log('Employee smoke passed');
  console.log('- employment type, employment status, and direct supervisor are stripped on read and write');
  console.log('- linked account remains a read-only system-account projection');
  console.log('- department and active-account usage guards remain active');
} finally {
  writeFileSync(dataFile, snapshot);
}
