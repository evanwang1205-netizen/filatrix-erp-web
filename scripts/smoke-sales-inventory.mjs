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

async function request(baseUrl, path) {
  const response = await fetch(`${baseUrl}/api${path}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP ${response.status} ${payload.error || ''}`.trim());
  return payload;
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const health = await request(baseUrl, '/health');
      if (health.ok) return;
    } catch {
      // Temporary API may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('temporary sales inventory API did not become healthy');
}

function sourceKey(source) {
  return `${source.type || ''}::${source.sourceDoc || ''}::${source.sourceLineId || ''}`;
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'filatrix-sales-inventory-'));
  const dataFile = join(tempDir, 'erp-data.json');
  const seed = createSeedData();
  const reservationSource = {
    type: '销售预留',
    sourceDoc: 'SO-20260617-021',
    sourceLineId: 'L1',
    qty: '240 卷',
    quantityNumber: 240,
    status: '有效',
    path: '/sales/orders/SO-20260617-021',
  };
  const whiteBase = {
    item: 'PLA 1.75mm 珍珠白耗材 1kg',
    itemType: '成品',
    materialCode: 'M-FG-PLA-175-WHT',
    warehouseCode: 'WH-FG',
    warehouse: '成品仓',
    uom: '卷',
    status: '正常',
    updatedAt: '2026-07-18 07:29',
  };
  seed.warehouse.inventory = [
    {
      ...whiteBase,
      key: 'M-FG-PLA-175-WHT::WH-FG::FG-AUTO::TEST',
      location: 'FG-AUTO',
      batch: 'TEST',
      onHandNumber: 4,
      qualifiedOnHandNumber: 4,
      reservedNumber: 240,
      reservationSources: [reservationSource],
    },
    {
      ...whiteBase,
      key: 'M-FG-PLA-175-WHT::WH-FG::FG-01-01::PLA-WHT-260712-A',
      location: 'FG-01-01',
      batch: 'PLA-WHT-260712-A',
      onHandNumber: 520,
      qualifiedOnHandNumber: 520,
      reservedNumber: 240,
      reservationSources: [reservationSource],
    },
  ];
  await writeFile(dataFile, JSON.stringify(seed, null, 2), 'utf8');

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
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
    const warehousePayload = await request(baseUrl, '/warehouse/inventory');
    const salesPayload = await request(baseUrl, '/sales/inventory');
    const deliveryPayload = await request(baseUrl, '/sales/delivery-records');
    const rows = warehousePayload.items || [];
    const finishedGoods = salesPayload.items || [];
    const deliveryRecords = deliveryPayload.items || [];
    assert(finishedGoods.length > 0, 'warehouse inventory does not expose finished goods');
    assert(finishedGoods.every((row) => row.materialCode && row.uom), 'finished-good inventory is missing material code or base unit');
    assert(finishedGoods.every((row) => row.itemType === '成品'), 'sales inventory projection exposed a non-finished-good row');
    assert(
      finishedGoods.every((row) => (
        !Object.prototype.hasOwnProperty.call(row, 'reservationSources')
        && !Object.prototype.hasOwnProperty.call(row, 'allocationSources')
        && !Object.prototype.hasOwnProperty.call(row, 'warehouse')
        && !Object.prototype.hasOwnProperty.call(row, 'location')
        && !Object.prototype.hasOwnProperty.call(row, 'batch')
        && !Object.prototype.hasOwnProperty.call(row, 'qualifiedOnHand')
        && !Object.prototype.hasOwnProperty.call(row, 'qualifiedOnHandNumber')
        && !Object.prototype.hasOwnProperty.call(row, 'locked')
        && !Object.prototype.hasOwnProperty.call(row, 'lockedNumber')
        && Array.isArray(row.salesReservationSources)
        && Object.prototype.hasOwnProperty.call(row, 'model')
        && Object.prototype.hasOwnProperty.call(row, 'spec')
      )),
      'sales inventory projection exposed warehouse detail or occupation sources, or omitted the sales reservation summary or material identity fields',
    );

    for (const row of rows) {
      const qualified = Number(row.qualifiedOnHandNumber || 0);
      const occupied = Number(row.lockedNumber || 0);
      const expectedAvailable = Math.max(0, qualified - occupied);
      assert(Number(row.availableNumber || 0) === expectedAvailable, `${row.key} available quantity is not derived from qualified stock minus occupations`);
    }

    const sourceLocations = new Map();
    for (const row of rows) {
      for (const source of row.reservationSources || []) {
        if (['已释放', '已作废', '已消耗'].includes(source.status)) continue;
        const key = sourceKey(source);
        sourceLocations.set(key, [...(sourceLocations.get(key) || []), row.key]);
      }
    }
    for (const [key, locations] of sourceLocations) {
      assert(locations.length === 1, `${key} is attached to multiple inventory batches: ${locations.join(', ')}`);
    }

    const whiteWarehouseRows = rows.filter((row) => row.materialCode === 'M-FG-PLA-175-WHT');
    const whiteSalesRows = finishedGoods.filter((row) => row.materialCode === 'M-FG-PLA-175-WHT');
    assert(whiteSalesRows.length === 1, 'sales inventory did not collapse one material into one summary row');
    const whiteQualified = whiteWarehouseRows.reduce((sum, row) => sum + Number(row.qualifiedOnHandNumber || 0), 0);
    const whiteOccupied = whiteWarehouseRows.reduce((sum, row) => sum + Number(row.lockedNumber || 0), 0);
    const whiteAvailable = whiteWarehouseRows.reduce((sum, row) => sum + Number(row.availableNumber || 0), 0);
    assert(whiteQualified - whiteOccupied === whiteAvailable, 'finished-good summary no longer conserves qualified, occupied, and available quantities');
    assert(
      Number(whiteSalesRows[0].availableNumber || 0) === whiteAvailable,
      'sales material summary does not match the warehouse availability fact',
    );
    assert(deliveryRecords.length > 0, 'sales delivery projection returned no records');
    assert(
      deliveryRecords.every((record) => (
        typeof record.warehouse === 'string'
        && typeof record.owner === 'string'
        && !Object.prototype.hasOwnProperty.call(record, 'warehouseCode')
        && !Object.prototype.hasOwnProperty.call(record, 'contact')
        && !Object.prototype.hasOwnProperty.call(record, 'contactPhone')
        && !Object.prototype.hasOwnProperty.call(record, 'attachments')
        && (record.products || []).every((product) => (
          !Object.prototype.hasOwnProperty.call(product, 'batch')
          && !Object.prototype.hasOwnProperty.call(product, 'imageLabel')
          && !Object.prototype.hasOwnProperty.call(product, 'imageTone')
        ))
      )),
      'sales delivery projection omitted approved read-only results or exposed warehouse execution details',
    );
    const sampleSourceOrder = deliveryRecords[0].sourceOrder;
    const filteredDeliveryPayload = await request(baseUrl, `/sales/delivery-records?sourceOrder=${encodeURIComponent(sampleSourceOrder)}`);
    assert(
      (filteredDeliveryPayload.items || []).every((record) => record.sourceOrder === sampleSourceOrder),
      'sales delivery projection ignored the source-order filter',
    );

    console.log('Sales projection smoke passed (inventory summary, delivery boundary and source-order filtering).');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve();
      else {
        child.once('exit', resolve);
        setTimeout(resolve, 1000);
      }
    });
    await rm(tempDir, { recursive: true, force: true });
    if (child.exitCode && child.exitCode !== 0) throw new Error(logs || `temporary API exited with ${child.exitCode}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
