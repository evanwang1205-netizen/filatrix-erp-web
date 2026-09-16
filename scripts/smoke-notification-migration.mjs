import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDataFile = join(rootDir, 'server/data/erp-data.json');

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

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Temporary API may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('temporary notification migration API did not become healthy');
}

async function requestJson(baseUrl, path, account = 'ACC-ZHANGSAN') {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'x-filatrix-account': account },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${payload.message || 'unknown error'}`);
  return payload;
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'filatrix-notification-migration-'));
  const dataFile = join(tempDir, 'erp-data.json');
  await copyFile(sourceDataFile, dataFile);

  const fixture = JSON.parse(await readFile(dataFile, 'utf8'));
  const salesAfterSalesCode = fixture.sales?.afterSales?.find((row) => String(row.code || '').startsWith('SA-'))?.code;
  const purchaseAfterSalesCode = fixture.purchase?.afterSales?.find((row) => String(row.code || '').startsWith('PA-'))?.code;
  assert(salesAfterSalesCode && purchaseAfterSalesCode, 'notification migration smoke requires sales and purchase after-sales fixtures');
  fixture.system.notificationInbox.unshift({
    code: 'NTF-FAS-SALES-SMOKE',
    ruleCode: 'SYSTEM-AFTER-SALES-TASK',
    ruleName: '售后协同任务',
    module: '财务',
    action: '售后任务生成',
    title: '旧销售售后财务待办',
    message: `${salesAfterSalesCode} 旧财务处理记录。`,
    sourceDoc: salesAfterSalesCode,
    sourcePath: `/finance/after-sales/${salesAfterSalesCode}`,
    actor: '系统',
    targetRoles: 'ROLE-FINANCE',
    targetAccounts: 'ACC-FINANCE',
    readBy: '',
    createdAt: '2026-07-01 00:02',
  }, {
    code: 'NTF-FAS-PURCHASE-SMOKE',
    ruleCode: 'SYSTEM-AFTER-SALES-TASK',
    ruleName: '售后协同任务',
    module: '财务',
    action: '售后任务生成',
    title: '旧采购售后财务待办',
    message: `${purchaseAfterSalesCode} 旧财务处理记录。`,
    sourceDoc: purchaseAfterSalesCode,
    sourcePath: `/finance/after-sales/${purchaseAfterSalesCode}`,
    actor: '系统',
    targetRoles: 'ROLE-FINANCE',
    targetAccounts: 'ACC-FINANCE',
    readBy: '',
    createdAt: '2026-07-01 00:01',
  }, {
    code: 'NTF-FAS-UNKNOWN-SMOKE',
    ruleCode: 'SYSTEM-AFTER-SALES-TASK',
    ruleName: '售后协同任务',
    module: '财务',
    action: '售后任务生成',
    title: '无法解析的旧财务待办',
    message: '旧财务任务缺少来源售后单。',
    sourceDoc: 'FAS-UNKNOWN-SMOKE',
    sourcePath: '/finance/after-sales/FAS-UNKNOWN-SMOKE',
    actor: '系统',
    targetRoles: 'ROLE-FINANCE',
    targetAccounts: 'ACC-FINANCE',
    readBy: '',
    createdAt: '2026-07-01 00:00',
  });
  await writeFile(dataFile, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const api = spawn(process.execPath, ['server/index.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
      FILATRIX_API_HOST: '127.0.0.1',
      FILATRIX_API_PORT: String(port),
      FILATRIX_DATA_FILE: dataFile,
      FILATRIX_ALLOW_ACCOUNT_HEADER: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let apiLogs = '';
  api.stdout.on('data', (chunk) => { apiLogs += chunk; });
  api.stderr.on('data', (chunk) => { apiLogs += chunk; });

  try {
    await waitForHealth(baseUrl, api);
    const adminInbox = await requestJson(baseUrl, '/notifications?limit=200');
    const smokeCodes = new Set(['NTF-FAS-SALES-SMOKE', 'NTF-FAS-PURCHASE-SMOKE', 'NTF-FAS-UNKNOWN-SMOKE']);
    const migrated = adminInbox.items.filter((row) => smokeCodes.has(row.code));
    assert(migrated.length === smokeCodes.size, 'legacy finance notification fixtures were not returned to the admin audit view');
    assert(
      migrated.every((row) => !String(row.sourcePath || '').startsWith('/finance/')),
      'legacy finance notification still exposes a retired finance route',
    );
    assert(
      migrated.every((row) => !String(row.targetRoles || '').includes('ROLE-FINANCE')
        && !String(row.targetAccounts || '').includes('ACC-FINANCE')),
      'legacy finance notification still targets retired finance recipients',
    );
    assert(migrated.every((row) => row.historical === true && row.unread === false), 'migrated history must never become a new unread task');

    const safeRows = migrated.filter((row) => row.code !== 'NTF-FAS-UNKNOWN-SMOKE');
    assert(
      safeRows.every((row) => /^\/(sales|purchase)\/after-sales\/(SA|PA)-/.test(row.sourcePath)),
      'resolvable finance history did not migrate to the responsible sales or purchase after-sales page',
    );
    const unresolved = migrated.find((row) => row.code === 'NTF-FAS-UNKNOWN-SMOKE');
    assert(unresolved?.sourcePath === '', 'unresolvable finance history should be non-clickable');

    const notificationRules = await requestJson(baseUrl, '/system/notifications');
    assert(
      notificationRules.items.every((row) => !String(row.receiverRoles || '').includes('ROLE-FINANCE')),
      'notification rules still retain the retired finance role',
    );

    const secondInbox = await requestJson(baseUrl, '/notifications?limit=200');
    assert(
      secondInbox.items.filter((row) => smokeCodes.has(row.code)).length === migrated.length,
      'notification migration is not idempotent',
    );
    console.log('legacy finance after-sales notification migration: ok');
  } catch (error) {
    if (apiLogs) process.stderr.write(apiLogs);
    throw error;
  } finally {
    api.kill('SIGTERM');
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
