import { existsSync } from 'node:fs';
import { copyFile, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSeedData } from './seed-data.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.FILATRIX_DATA_FILE || join(__dirname, 'data', 'erp-data.json');
const backupFile = join(dirname(dataFile), 'erp-data.before-v2-cleanup.json');

const requiredMaterialFields = [
  'code',
  'name',
  'category',
  'isSaleable',
  'isPurchasable',
  'isProducible',
  'supplyStrategy',
  'defaultWarehouse',
  'batchControl',
  'shelfLife',
  'incomingQualityControl',
  'inboundQualityControl',
  'uom',
  'status',
];

function assertUniqueCodes(rows, label) {
  const seen = new Set();
  for (const row of rows) {
    if (!row.code) throw new Error(`${label}存在缺少编码的记录。`);
    if (seen.has(row.code)) throw new Error(`${label}存在重复编码：${row.code}`);
    seen.add(row.code);
  }
}

function validateDemoData(data) {
  const masterData = data.masterData || {};
  const materials = masterData.materials || [];
  const warehouses = masterData.warehouses || [];
  const customers = masterData.customers || [];
  const suppliers = masterData.suppliers || [];

  for (const [label, rows] of [
    ['物料', materials],
    ['客户', customers],
    ['供应商', suppliers],
    ['仓库', warehouses],
  ]) {
    assertUniqueCodes(rows, label);
  }

  const warehouseNames = new Set(warehouses.map((row) => row.name));
  for (const material of materials) {
    const missing = requiredMaterialFields.filter((field) => {
      if (['isSaleable', 'isPurchasable', 'isProducible'].includes(field)) return typeof material[field] !== 'boolean';
      return material[field] === undefined || material[field] === null || material[field] === '';
    });
    if (missing.length) {
      throw new Error(`物料 ${material.code} 缺少新版字段：${missing.join('、')}`);
    }
    if (!warehouseNames.has(material.defaultWarehouse)) {
      throw new Error(`物料 ${material.code} 的默认仓库不存在：${material.defaultWarehouse}`);
    }
  }

  const materialCodes = new Set(materials.map((row) => row.code));
  const customerCodes = new Set(customers.map((row) => row.code));
  for (const quote of data.sales?.quotes || []) {
    if (quote.customerCode && !customerCodes.has(quote.customerCode)) {
      throw new Error(`报价单 ${quote.code} 引用了不存在的客户：${quote.customerCode}`);
    }
    for (const product of quote.products || []) {
      if (!materialCodes.has(product.materialCode)) {
        throw new Error(`报价单 ${quote.code} 引用了不存在的物料：${product.materialCode}`);
      }
    }
  }
  for (const order of data.sales?.orders || []) {
    if (order.customerCode && !customerCodes.has(order.customerCode)) {
      throw new Error(`销售订单 ${order.code} 引用了不存在的客户：${order.customerCode}`);
    }
    for (const product of order.products || []) {
      if (!materialCodes.has(product.materialCode)) {
        throw new Error(`销售订单 ${order.code} 引用了不存在的物料：${product.materialCode}`);
      }
    }
  }
}

const currentData = JSON.parse(await readFile(dataFile, 'utf8'));
const nextData = createSeedData();

nextData.masterData.materials = nextData.masterData.materials.map((material) => ({
  ...material,
  isPurchasable: material.isPurchasable ?? ['采购', '采购+自制'].includes(material.supplyStrategy || ''),
  isProducible: material.isProducible ?? ['自制', '采购+自制', '委外'].includes(material.supplyStrategy || ''),
}));

nextData.version = 2;
nextData.updatedAt = new Date().toISOString();
nextData.purchase = {};
nextData.warehouse = { inventory: [], stockLedger: [] };
nextData.finance = {};
nextData.quality = {};
nextData.purchaseOrders = [];
nextData.flowRecords = [];

if (currentData.system) {
  nextData.system = {
    ...currentData.system,
    logs: [],
    notificationInbox: [],
  };
}

validateDemoData(nextData);

if (!existsSync(backupFile)) {
  await copyFile(dataFile, backupFile);
}

const tempFile = `${dataFile}.reset.tmp`;
await writeFile(tempFile, `${JSON.stringify(nextData, null, 2)}\n`, 'utf8');
await rename(tempFile, dataFile);

console.log('Filatrix ERP 演示数据已重建。');
console.log(`物料 ${nextData.masterData.materials.length} 条，客户 ${nextData.masterData.customers.length} 条，供应商 ${nextData.masterData.suppliers.length} 条，仓库 ${nextData.masterData.warehouses.length} 条。`);
console.log(`原数据备份：${backupFile}`);
