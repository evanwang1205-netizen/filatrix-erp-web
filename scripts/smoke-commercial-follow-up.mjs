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

async function request(baseUrl, path, options = {}, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-filatrix-account': 'ACC-ZHANGSAN',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  assert(response.status === expectedStatus, `${path} expected ${expectedStatus}, got ${response.status}: ${payload.error || ''}`);
  return payload;
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const health = await request(baseUrl, '/health');
      if (health.ok) return;
    } catch {
      // Temporary API may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('temporary commercial follow-up API did not become healthy');
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'filatrix-commercial-'));
  const dataFile = join(tempDir, 'erp-data.json');
  const data = createSeedData();
  data.sales.orders.unshift({
    code: 'SMOKE-COM-SO-001',
    companyCode: 'COMP-FILATRIX',
    company: 'Filatrix',
    customerCode: 'CUST-SMOKE',
    customer: '商务跟进测试客户',
    products: [{
      lineId: 'L1',
      materialCode: 'MAT-SMOKE',
      name: '商务跟进测试品',
      qty: '1',
      uom: '个',
      priceInputMode: '含税',
      unitPrice: '￥1,000.00',
      taxRate: '13%',
      amount: '￥1,000.00',
    }],
    amount: '￥1,000.00',
    currency: 'CNY',
    owner: '张三',
    status: '已确认',
    documentStatus: '已确认',
    date: '2026-07-28',
    delivery: '2026-07-30',
    plannedShipDate: '2026-07-29',
    attachments: [],
  });
  data.purchase.orders.unshift({
    code: 'SMOKE-COM-PO-001',
    purchaseType: '物料采购',
    companyCode: 'COMP-FILATRIX',
    company: 'Filatrix',
    supplierCode: 'SUP-SMOKE',
    supplier: '商务跟进测试供应商',
    products: [{
      lineId: 'L1',
      materialCode: 'M-RM-PLA-VIRGIN',
      name: 'PLA 原生粒子',
      qty: '100',
      uom: 'kg',
      unitPrice: '12',
      amount: '￥1,200.00',
    }],
    amount: '￥1,200.00',
    currency: 'CNY',
    owner: '张三',
    status: '已确认',
    documentStatus: '已确认',
    date: '2026-07-28',
    expectedDate: '2026-07-30',
    attachments: [],
  });
  await writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8');

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

    await request(baseUrl, '/sales/orders/SMOKE-COM-SO-001/commercial-follow-ups', {
      method: 'POST',
      body: {
        kind: 'sales_payment',
        amount: 1,
        occurredOn: '2099-01-01',
        idempotencyKey: 'smoke-sales-payment-future-date',
      },
    }, 400);

    const salesInvoice = await request(baseUrl, '/sales/orders/SMOKE-COM-SO-001/commercial-follow-ups', {
      method: 'POST',
      body: {
        kind: 'sales_invoice',
        amount: 400,
        occurredOn: '2026-07-28',
        note: '首期开票',
        idempotencyKey: 'smoke-sales-invoice-001',
      },
    }, 201);
    assert(
      salesInvoice.order.invoiceProgress.status === '部分开票',
      `sales invoice progress was not derived from commercial events: ${JSON.stringify(salesInvoice.order.invoiceProgress)}`,
    );
    assert(salesInvoice.order.commercialFollowUps.length === 1, 'sales commercial event was not returned on the order');
    assert(!salesInvoice.event.referenceNo, 'new commercial event still required or generated a reference number');
    assert(!salesInvoice.event.attachments, 'new commercial event still generated an attachment field');

    const repeatedInvoice = await request(baseUrl, '/sales/orders/SMOKE-COM-SO-001/commercial-follow-ups', {
      method: 'POST',
      body: {
        kind: 'sales_invoice',
        amount: 400,
        occurredOn: '2026-07-28',
        idempotencyKey: 'smoke-sales-invoice-001',
      },
    });
    assert(repeatedInvoice.repeated === true, 'sales commercial idempotency was not enforced');
    assert(repeatedInvoice.order.invoiceProgress.invoicedAmount === 400, 'repeated event was counted twice');

    const salesPayment = await request(baseUrl, '/sales/orders/SMOKE-COM-SO-001/commercial-follow-ups', {
      method: 'POST',
      body: {
        kind: 'sales_payment',
        amount: 250,
        occurredOn: '2026-07-28',
        idempotencyKey: 'smoke-sales-payment-001',
      },
    }, 201);
    assert(salesPayment.order.paymentProgress.status === '部分收款', 'sales payment progress was not derived');
    assert(salesPayment.order.paymentProgress.settledAmount === 250, 'sales payment amount projection is incorrect');

    await request(baseUrl, '/sales/orders/SMOKE-COM-SO-001/commercial-follow-ups', {
      method: 'POST',
      body: {
        kind: 'sales_payment',
        amount: 800,
        occurredOn: '2026-07-28',
        idempotencyKey: 'smoke-sales-payment-over',
      },
    }, 409);

    const deletedSalesPayment = await request(
      baseUrl,
      `/sales/orders/SMOKE-COM-SO-001/commercial-follow-ups/${encodeURIComponent(salesPayment.event.id)}`,
      { method: 'DELETE' },
    );
    assert(deletedSalesPayment.order.paymentProgress.status === '未收款', 'deleting sales payment did not recalculate progress');
    assert(deletedSalesPayment.order.commercialFollowUps.length === 1, 'deleted sales payment is still visible');
    const repeatedSalesDelete = await request(
      baseUrl,
      `/sales/orders/SMOKE-COM-SO-001/commercial-follow-ups/${encodeURIComponent(salesPayment.event.id)}`,
      { method: 'DELETE' },
    );
    assert(repeatedSalesDelete.repeated === true, 'commercial deletion retry was not idempotent');

    const purchaseInvoice = await request(baseUrl, '/purchase/orders/SMOKE-COM-PO-001/commercial-follow-ups', {
      method: 'POST',
      body: {
        kind: 'purchase_invoice',
        amount: 600,
        occurredOn: '2026-07-28',
        idempotencyKey: 'smoke-purchase-invoice-001',
      },
    }, 201);
    assert(purchaseInvoice.order.progressFacts.invoice === '部分收票', 'purchase invoice progress was not derived');

    const purchasePayment = await request(baseUrl, '/purchase/orders/SMOKE-COM-PO-001/commercial-follow-ups', {
      method: 'POST',
      body: {
        kind: 'purchase_payment',
        amount: 100,
        occurredOn: '2026-07-28',
        idempotencyKey: 'smoke-purchase-payment-001',
      },
    }, 201);
    assert(purchasePayment.order.progressFacts.payment === '部分付款', 'purchase payment progress was not derived');
    assert(purchasePayment.order.commercialFollowUps.length === 2, 'purchase commercial events were not returned');

    const deletedPurchaseInvoice = await request(
      baseUrl,
      `/purchase/orders/SMOKE-COM-PO-001/commercial-follow-ups/${encodeURIComponent(purchaseInvoice.event.id)}`,
      { method: 'DELETE' },
    );
    assert(deletedPurchaseInvoice.order.progressFacts.invoice === '未收票', 'deleting purchase invoice did not recalculate progress');
    assert(deletedPurchaseInvoice.order.commercialFollowUps.length === 1, 'deleted purchase invoice is still visible');

    console.log('Commercial follow-up smoke flow passed.');
  } finally {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    await rm(tempDir, { recursive: true, force: true });
    if (child.exitCode && child.exitCode !== 0) {
      throw new Error(`temporary API exited unexpectedly\n${logs}`);
    }
  }
}

await main();
