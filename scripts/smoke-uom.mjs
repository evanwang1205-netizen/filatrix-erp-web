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

function assertConciseUnit(record, expectedName, expectedEnglishAbbreviation) {
  const legacyFields = ['englishName', 'symbol', 'type', 'baseUom', 'conversionRate', 'decimalPrecision'];
  if (
    record?.name !== expectedName
    || record?.englishAbbreviation !== expectedEnglishAbbreviation
    || legacyFields.some((key) => key in (record || {}))
  ) {
    throw new Error(`unit field boundary failed: ${JSON.stringify(record)}`);
  }
}

const snapshot = readFileSync(dataFile, 'utf8');

try {
  const source = await request('/master-data/uom/UOM-KG');
  assertConciseUnit(source.record, 'kg', 'kg');

  const updated = await request('/master-data/uom/UOM-KG', {
    method: 'PUT',
    body: {
      ...source.record,
      englishAbbreviation: 'kgs',
      englishName: 'Kilogram',
      symbol: 'KGX',
      type: '重量',
      baseUom: 'g',
      conversionRate: 1000,
      decimalPrecision: 6,
    },
  });
  assertConciseUnit(updated.record, 'kg', 'kgs');

  const renameError = await request('/master-data/uom/UOM-KG', {
    method: 'PUT',
    status: 400,
    body: { ...updated.record, name: '公斤' },
  });
  if (!String(renameError.error || '').includes('不能修改')) {
    throw new Error(`referenced unit rename guard returned an unclear error: ${JSON.stringify(renameError)}`);
  }

  const disableError = await request('/master-data/uom/UOM-KG', {
    method: 'PUT',
    status: 400,
    body: { ...updated.record, status: '停用' },
  });
  if (!String(disableError.error || '').includes('不能停用')) {
    throw new Error(`referenced unit disable guard returned an unclear error: ${JSON.stringify(disableError)}`);
  }

  const created = await request('/master-data/uom', {
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: '米',
      englishAbbreviation: 'm',
      englishName: 'Meter',
      status: '启用',
      symbol: 'm',
      type: '长度',
      baseUom: '厘米',
      conversionRate: 100,
      decimalPrecision: 3,
    },
  });
  assertConciseUnit(created.record, '米', 'm');

  console.log('UOM smoke passed');
  console.log('- unit and English abbreviation are the only display values');
  console.log('- legacy symbol, type, conversion, and precision fields are stripped');
  console.log('- referenced unit name and status remain protected');
} finally {
  writeFileSync(dataFile, snapshot);
}
