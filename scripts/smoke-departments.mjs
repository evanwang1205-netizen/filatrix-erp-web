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

function assertConciseDepartment(record, expectedEmployeeCount) {
  if (
    !record?.code
    || !record?.name
    || !record?.owner
    || record?.employeeCount !== expectedEmployeeCount
    || 'type' in (record || {})
    || 'manager' in (record || {})
    || 'primary' in (record || {})
    || 'secondary' in (record || {})
  ) {
    throw new Error(`department field boundary failed: ${JSON.stringify(record)}`);
  }
}

const snapshot = readFileSync(dataFile, 'utf8');

try {
  const source = await request('/master-data/departments/DEP-SALES');
  assertConciseDepartment(source.record, 1);

  const updated = await request('/master-data/departments/DEP-SALES', {
    method: 'PUT',
    body: {
      ...source.record,
      employeeCount: 99,
      type: '业务部门',
      manager: '李明',
      primary: '旧主要职责',
      secondary: '旧职责说明',
      note: '销售业务的组织归属部门。',
    },
  });
  assertConciseDepartment(updated.record, 1);

  const created = await request('/master-data/departments', {
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: '流程协调部',
      owner: 'Filatrix 增材材料有限公司',
      parentDepartment: '',
      status: '启用',
      type: '管理部门',
      manager: '张三',
      primary: '旧主要职责',
      secondary: '旧职责说明',
    },
  });
  assertConciseDepartment(created.record, 0);

  const renameError = await request('/master-data/departments/DEP-SALES', {
    method: 'PUT',
    status: 400,
    body: { ...updated.record, name: '销售业务部' },
  });
  if (!String(renameError.error || '').includes('不能直接改名')) {
    throw new Error(`referenced department rename guard returned an unclear error: ${JSON.stringify(renameError)}`);
  }

  const disableError = await request('/master-data/departments/DEP-SALES', {
    method: 'PUT',
    status: 400,
    body: { ...updated.record, status: '停用' },
  });
  if (!String(disableError.error || '').includes('启用员工')) {
    throw new Error(`referenced department disable guard returned an unclear error: ${JSON.stringify(disableError)}`);
  }

  console.log('Department smoke passed');
  console.log('- type, fixed manager, and responsibility fields are stripped on read and write');
  console.log('- employee count remains a server projection');
  console.log('- company, hierarchy, rename, and disable guards remain active');
} finally {
  writeFileSync(dataFile, snapshot);
}
