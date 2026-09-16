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

function quantity(value) {
  return Number(String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0] || 0);
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
      'x-filatrix-account': options.account || 'ACC-ZHANGSAN',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function ok(baseUrl, path, options = {}) {
  const result = await request(baseUrl, path, options);
  if (!result.response.ok) {
    throw new Error(`HTTP ${result.response.status}: ${result.payload.error || path}`);
  }
  return result.payload;
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const health = await ok(baseUrl, '/health');
      if (health.ok) return;
    } catch {
      // The isolated API may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('temporary replenishment API did not become healthy');
}

function forceAlert(seed, relationCode) {
  const relation = seed.masterRelations.warehouseMaterials.find((row) => row.code === relationCode);
  assert(relation, `missing replenishment relation ${relationCode}`);
  Object.assign(relation, {
    safetyStock: 100000,
    reorderPoint: 110000,
    maxStock: 150000,
    replenishmentLot: 10000,
  });
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'filatrix-replenishment-'));
  const dataFile = join(tempDir, 'erp-data.json');
  const seed = createSeedData();
  forceAlert(seed, 'WMR-00001');
  forceAlert(seed, 'WMR-00005');
  seed.system ||= {};
  seed.system.notificationInbox = (seed.system.notificationInbox || []).filter((row) => (
    row.action !== '库存预警'
    || !['WMR-00001:', 'WMR-00005:'].some((prefix) => String(row.sourceDoc || '').startsWith(prefix))
  ));
  await writeFile(dataFile, JSON.stringify(seed, null, 2), 'utf8');

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
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });

  try {
    await waitForHealth(baseUrl, child);

    const notificationsBeforeSignals = await ok(baseUrl, '/notifications?limit=100');
    assert(
      !notificationsBeforeSignals.items.some((row) => (
        row.action === '库存预警'
        && ['WMR-00001:', 'WMR-00005:'].some((prefix) => String(row.sourceDoc || '').startsWith(prefix))
      )),
      'dynamic replenishment alert fixture was already present before signal calculation',
    );
    const initial = await ok(baseUrl, '/warehouse/replenishments');
    const purchaseSignal = initial.items.find((row) => row.code === 'WMR-00005');
    const productionSignal = initial.items.find((row) => row.code === 'WMR-00001');

    assert(purchaseSignal?.thresholdStatus === '库存告急', 'purchase material did not enter critical inventory alert');
    assert(purchaseSignal.actionRequired, 'purchase material alert is not actionable');
    assert(purchaseSignal.availableRoutes.includes('采购申请'), 'purchased material has no purchase requisition route');
    assert(
      purchaseSignal.projectedQty === purchaseSignal.availableQty + purchaseSignal.pendingInboundQty + purchaseSignal.inTransitQty,
      'projected inventory does not include available, pending inbound and in-transit quantities',
    );
    const purchaseTarget = Math.min(purchaseSignal.maxStock, purchaseSignal.reorderPoint + purchaseSignal.replenishmentLot);
    assert(
      purchaseSignal.suggestedQty === Number(Math.max(0, purchaseTarget - purchaseSignal.projectedQty).toFixed(4)),
      'purchase replenishment suggestion does not use the documented target formula',
    );

    assert(productionSignal?.thresholdStatus === '库存告急', 'finished material did not enter critical inventory alert');
    assert(productionSignal.actionRequired, 'finished material alert is not actionable');
    assert(productionSignal.availableRoutes.includes('生产任务'), 'self-produced material has no production task route');
    const purchaseAlertSourceDoc = `${purchaseSignal.code}:${purchaseSignal.thresholdStatus}`;
    const productionAlertSourceDoc = `${productionSignal.code}:${productionSignal.thresholdStatus}`;
    const persistedSignalNotifications = await ok(baseUrl, '/notifications?limit=100');
    assert(
      persistedSignalNotifications.items.some((row) => (
        row.action === '库存预警' && row.sourceDoc === purchaseAlertSourceDoc
      ))
        && persistedSignalNotifications.items.some((row) => (
          row.action === '库存预警' && row.sourceDoc === productionAlertSourceDoc
        )),
      'dynamic inventory alerts were not persisted for the next request',
    );
    await ok(baseUrl, '/warehouse/replenishments');
    const notificationsAfterRepeatedSignalRead = await ok(baseUrl, '/notifications?limit=100');
    assert(
      notificationsAfterRepeatedSignalRead.items.filter((row) => (
        row.action === '库存预警' && row.sourceDoc === purchaseAlertSourceDoc
      )).length === 1
        && notificationsAfterRepeatedSignalRead.items.filter((row) => (
          row.action === '库存预警' && row.sourceDoc === productionAlertSourceDoc
        )).length === 1,
      're-reading replenishment signals created duplicate dynamic inventory alerts',
    );

    const unauthorized = await request(
      baseUrl,
      `/warehouse/replenishments/${encodeURIComponent(purchaseSignal.code)}/replenish`,
      { method: 'POST', account: 'ACC-SALES', body: { routeType: '采购申请' } },
    );
    assert(unauthorized.response.status === 403, 'sales role bypassed the warehouse replenishment permission');

    const purchaseCreated = await request(
      baseUrl,
      `/warehouse/replenishments/${encodeURIComponent(purchaseSignal.code)}/replenish`,
      { method: 'POST', body: { routeType: '采购申请', actor: '专项回归仓库主管' } },
    );
    assert(purchaseCreated.response.status === 201, 'purchase replenishment did not create a requisition');
    assert(purchaseCreated.payload.document.type === '采购申请', 'purchase replenishment created the wrong document type');
    assert(purchaseCreated.payload.signal.status === '补货处理中', 'purchase signal did not switch to processing');

    const purchaseDetail = await ok(
      baseUrl,
      `/purchase/requisitions/${encodeURIComponent(purchaseCreated.payload.document.code)}`,
    );
    assert(purchaseDetail.requisition.sourceReplenishmentCode === purchaseSignal.code, 'purchase requisition lost its replenishment source');
    assert(purchaseDetail.requisition.sourceWarehouseCode === purchaseSignal.warehouseCode, 'purchase requisition lost its warehouse source');
    assert(purchaseDetail.requisition.sourceType === '库存补货', 'purchase requisition lost its replenishment source type');
    assert(purchaseDetail.requisition.sourceWarehouseName === purchaseSignal.warehouseName, 'purchase requisition lost its warehouse source name');
    assert(purchaseDetail.requisition.status === '待采购受理', 'purchase requisition was not handed to purchasing');
    assert(purchaseDetail.requisition.products[0].materialCode === purchaseSignal.materialCode, 'purchase requisition material is incorrect');
    assert(quantity(purchaseDetail.requisition.products[0].qty) === purchaseSignal.suggestedQty, 'purchase requisition quantity is incorrect');

    const purchaseRepeated = await request(
      baseUrl,
      `/warehouse/replenishments/${encodeURIComponent(purchaseSignal.code)}/replenish`,
      { method: 'POST', body: { routeType: '采购申请' } },
    );
    assert(purchaseRepeated.response.status === 200, 'repeated purchase replenishment did not return the existing document');
    assert(purchaseRepeated.payload.repeated === true, 'repeated purchase replenishment was not marked idempotent');
    assert(
      purchaseRepeated.payload.document.code === purchaseCreated.payload.document.code,
      'repeated purchase replenishment created a duplicate requisition',
    );

    const productionCreated = await request(
      baseUrl,
      `/warehouse/replenishments/${encodeURIComponent(productionSignal.code)}/replenish`,
      { method: 'POST', body: { routeType: '生产任务', actor: '专项回归仓库主管' } },
    );
    assert(productionCreated.response.status === 201, 'production replenishment did not create a task');
    assert(productionCreated.payload.document.type === '生产任务', 'production replenishment created the wrong document type');
    assert(productionCreated.payload.signal.status === '补货处理中', 'production signal did not switch to processing');

    const productionDetail = await ok(
      baseUrl,
      `/production/tasks/${encodeURIComponent(productionCreated.payload.document.code)}`,
    );
    assert(productionDetail.record.sourceType === '安全库存补货', 'production task source type is incorrect');
    assert(productionDetail.record.sourceReplenishmentCode === productionSignal.code, 'production task lost its replenishment source');
    assert(productionDetail.record.sourceWarehouseCode === productionSignal.warehouseCode, 'production task lost its warehouse source');
    assert(productionDetail.record.products[0].productCode === productionSignal.materialCode, 'production task material is incorrect');
    assert(
      quantity(productionDetail.record.products[0].demandQty) === productionSignal.suggestedQty,
      'production task quantity is incorrect',
    );

    const notifications = await ok(baseUrl, '/notifications?limit=100');
    assert(
      notifications.items.some((row) => row.action === '库存预警' && row.sourceDoc === purchaseAlertSourceDoc),
      'warehouse inventory alert notification was not generated',
    );
    assert(
      notifications.items.some((row) => row.action === '采购申请生成' && row.sourceDoc === purchaseCreated.payload.document.code),
      'purchasing handoff notification was not generated',
    );
    assert(
      notifications.items.some((row) => row.action === '补货任务生成' && row.sourceDoc === productionCreated.payload.document.code),
      'production handoff notification was not generated',
    );

    console.log('replenishment smoke passed: thresholds, notifications, permissions, purchase/production handoff and duplicate prevention');
  } catch (error) {
    if (logs) console.error(logs);
    throw error;
  } finally {
    child.kill('SIGTERM');
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
