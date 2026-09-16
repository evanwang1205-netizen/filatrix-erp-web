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

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'x-filatrix-account': 'ACC-ZHANGSAN',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP ${response.status} ${payload.error || ''}`.trim());
  return payload;
}

async function expectError(action, expectedText) {
  try {
    await action();
  } catch (error) {
    assert(String(error).includes(expectedText), `expected error containing “${expectedText}”, received “${error}”`);
    return;
  }
  throw new Error(`expected request to fail with “${expectedText}”`);
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const health = await request(baseUrl, '/health');
      if (health.ok) return;
    } catch {
      // The temporary API may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('temporary currency API did not become healthy');
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'filatrix-currencies-'));
  const dataFile = join(tempDir, 'erp-data.json');
  await writeFile(dataFile, JSON.stringify(createSeedData(), null, 2), 'utf8');

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}/api`;
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
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  try {
    await waitForHealth(baseUrl, child);

    const seeded = await request(baseUrl, '/master-data/currencies');
    assert(seeded.items.length === 1 && seeded.items[0].code === 'CNY', 'currency seed is not limited to CNY');
    assert(seeded.items.every((row) => !Object.hasOwn(row, 'englishName')), 'currency master still exposed a redundant English name');

    const created = await request(baseUrl, '/master-data/currencies', {
      method: 'POST',
      body: {
        code: 'AUD',
        name: '澳大利亚元',
        symbol: 'A$',
        decimalPlaces: 2,
        status: '启用',
        note: '币种专项烟测。',
      },
    });
    assert(created.record.code === 'AUD', 'currency code was replaced by a generated identifier');
    assert(created.record.decimalPlaces === 2, 'currency decimals were not normalized');

    await expectError(
      () => request(baseUrl, '/master-data/currencies', {
        method: 'POST',
        body: { ...created.record, revision: undefined },
      }),
      '已存在',
    );
    await expectError(
      () => request(baseUrl, '/master-data/currencies', {
        method: 'POST',
        body: { code: 'AU1', name: '无效币种', symbol: '?', decimalPlaces: 2, status: '启用' },
      }),
      '3 位大写英文字母',
    );

    const customer = (await request(baseUrl, '/master-data/customers/CUS-00001')).record;
    const updatedCustomer = await request(baseUrl, '/master-data/customers/CUS-00001', {
      method: 'PUT',
      body: { ...customer, phone: 'WeChat: hz-filatrix' },
    });
    assert(updatedCustomer.record.phone === 'WeChat: hz-filatrix', 'customer contact still enforced telephone-only input');

    const stopped = await request(baseUrl, '/master-data/currencies/AUD', {
      method: 'PUT',
      body: { ...created.record, status: '停用' },
    });
    assert(stopped.record.status === '停用', 'unused future currency could not be stopped');

    console.log('Currency master smoke passed (CNY-only seed, extensible master, generic contacts).');
  } finally {
    child.kill();
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
