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

const snapshot = readFileSync(dataFile, 'utf8');

try {
  const source = await request('/master-data/company/COM-FILATRIX');
  if (
    source.record?.englishName !== 'Filatrix Additive Materials Co., Ltd.'
    || source.record?.englishAddress !== 'No. 1688 Jiangnan Avenue, Binjiang District, Hangzhou, Zhejiang, China'
  ) {
    throw new Error(`company bilingual facts are missing: ${JSON.stringify(source.record)}`);
  }

  const updated = await request('/master-data/company/COM-FILATRIX', {
    method: 'PUT',
    body: {
      ...source.record,
      englishName: '  Filatrix Additive Materials Company Limited  ',
      address: '  浙江省杭州市滨江区江南大道 1688 号  ',
      englishAddress: '  No. 1688 Jiangnan Avenue, Binjiang District, Hangzhou, Zhejiang, China  ',
    },
  });
  if (
    updated.record?.englishName !== 'Filatrix Additive Materials Company Limited'
    || updated.record?.address !== '浙江省杭州市滨江区江南大道 1688 号'
    || updated.record?.englishAddress !== 'No. 1688 Jiangnan Avenue, Binjiang District, Hangzhou, Zhejiang, China'
  ) {
    throw new Error(`company bilingual normalization failed: ${JSON.stringify(updated.record)}`);
  }

  const created = await request('/master-data/company', {
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: 'Smoke 新公司',
      englishName: '  Smoke New Company Ltd.  ',
      type: '分支机构',
      primary: 'Smoke',
      taxNumber: '91330108MA2SMOK001',
      secondary: '6',
      website: 'smoke.filatrix.example',
      address: '  浙江省杭州市滨江区测试路 1 号  ',
      englishAddress: '  No. 1 Test Road, Hangzhou, Zhejiang, China  ',
      invoiceTitle: '',
      status: '启用',
      seal: 9,
    },
  });
  if (
    created.record?.invoiceTitle !== 'Smoke 新公司'
    || created.record?.englishName !== 'Smoke New Company Ltd.'
    || created.record?.address !== '浙江省杭州市滨江区测试路 1 号'
    || created.record?.englishAddress !== 'No. 1 Test Road, Hangzhou, Zhejiang, China'
    || created.record?.secondary !== '6%'
    || created.record?.website !== 'https://smoke.filatrix.example'
    || created.record?.seal !== 3
  ) {
    throw new Error(`company creation normalization failed: ${JSON.stringify(created.record)}`);
  }

  const renameError = await request('/master-data/company/COM-FILATRIX', {
    method: 'PUT',
    status: 400,
    body: { ...updated.record, name: 'Filatrix 新主体有限公司' },
  });
  if (!String(renameError.error || '').includes('不能直接改名')) {
    throw new Error(`company rename guard returned an unclear error: ${JSON.stringify(renameError)}`);
  }

  const disableError = await request('/master-data/company/COM-FILATRIX', {
    method: 'PUT',
    status: 400,
    body: { ...updated.record, status: '停用' },
  });
  if (
    !String(disableError.error || '').includes('启用部门')
    || !String(disableError.error || '').includes('启用仓库')
  ) {
    throw new Error(`company disable guard returned an unclear error: ${JSON.stringify(disableError)}`);
  }

  console.log('Company smoke passed');
  console.log('- English name and English address persist and normalize with the Chinese address');
  console.log('- fiscal and website defaults remain normalized');
  console.log('- referenced company rename and disable guards remain active without a visible reference summary');
} finally {
  writeFileSync(dataFile, snapshot);
}
