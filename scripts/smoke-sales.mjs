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
  throw new Error('temporary sales API did not become healthy');
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'filatrix-sales-'));
  const dataFile = join(tempDir, 'erp-data.json');
  const data = createSeedData();
  data.sales.orders.unshift({
    code: 'SO-SMOKE-SIGNED-001',
    companyCode: 'COM-FILATRIX',
    company: 'Filatrix 增材材料有限公司',
    customerCode: 'CUS-00002',
    customer: '苏州维创三维科技',
    contact: '顾经理',
    contactPhone: '139-0512-8036',
    sourceQuote: '',
    products: [{ lineId: 'L1', materialCode: 'M-FG-PLA-175-MBK', name: 'PLA 1.75mm 哑光黑耗材 1kg', qty: '1 卷', unitPrice: '69.00', amount: '￥69.00', uom: '卷' }],
    amount: '￥69.00',
    owner: '周宁',
    priority: '正常',
    documentStatus: '已确认',
    status: '待签收',
    date: '2026-07-16',
    delivery: '2026-07-17',
    plannedShipDate: '2026-07-16',
    deliveryMethod: '本厂配送',
    paymentMethod: '月结 30 天',
    freightPayer: '供方',
    taxMode: '含税',
    taxRate: '13%',
    logisticsMode: '本厂配送',
    shipAddress: '苏州市测试地址',
    shipContact: '顾经理',
    shipPhone: '139-0512-8036',
    internalRemark: '销售专项冒烟测试。',
    remark: '',
    attachments: [],
    revision: 1,
  });
  data.sales.orders.unshift({
    ...data.sales.orders[0],
    code: 'SO-SMOKE-TEST-ONLY-001',
    testOnly: true,
  });
  data.sales.outboundRequests.unshift({
    code: 'SR-SMOKE-SIGNED-001',
    companyCode: 'COM-FILATRIX',
    company: 'Filatrix 增材材料有限公司',
    sourceOrder: 'SO-SMOKE-SIGNED-001',
    customerCode: 'CUS-00002',
    customer: '苏州维创三维科技',
    contact: '顾经理',
    contactPhone: '139-0512-8036',
    products: [{ sourceLineId: 'L1', materialCode: 'M-FG-PLA-175-MBK', name: 'PLA 1.75mm 哑光黑耗材 1kg', qty: '1 卷', requestQty: '1 卷', uom: '卷' }],
    applicant: '周宁',
    status: '已出库',
    requestDate: '2026-07-16',
    expectedDate: '2026-07-16',
    deliveryDate: '2026-07-17',
    deliveryMethod: '本厂配送',
    warehouseCode: 'WH-FG',
    warehouse: '成品仓',
    address: '苏州市测试地址',
    remark: '',
    attachments: [],
  });
  data.warehouse.salesIssues.unshift({
    code: 'WS-SMOKE-SIGNED-001',
    companyCode: 'COM-FILATRIX',
    company: 'Filatrix 增材材料有限公司',
    sourceDoc: 'SR-SMOKE-SIGNED-001',
    sourceOrder: 'SO-SMOKE-SIGNED-001',
    customerCode: 'CUS-00002',
    customer: '苏州维创三维科技',
    contact: '顾经理',
    contactPhone: '139-0512-8036',
    products: [{ sourceLineId: 'L1', materialCode: 'M-FG-PLA-175-MBK', name: 'PLA 1.75mm 哑光黑耗材 1kg', qty: '1 卷', batch: 'SMOKE-BATCH-001', uom: '卷' }],
    warehouseCode: 'WH-FG',
    warehouse: '成品仓',
    deliveryMethod: '本厂配送',
    owner: '仓库主管',
    status: '已出库',
    date: '2026-07-16',
    expectedDate: '2026-07-16',
    note: '',
  });
  data.warehouse.salesIssues.unshift({
    ...data.warehouse.salesIssues[0],
    code: 'WS-SMOKE-TEST-ONLY-001',
    sourceOrder: 'SO-SMOKE-TEST-ONLY-001',
  });
  await writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8');

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: rootDir,
    env: { ...process.env, FILATRIX_API_HOST: '127.0.0.1', FILATRIX_API_PORT: String(port), FILATRIX_DATA_FILE: dataFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  try {
    await waitForHealth(baseUrl, child);

    const ordinaryOrderList = await request(baseUrl, '/sales/orders');
    assert(
      !(ordinaryOrderList.items || []).some((order) => order.code === 'SO-SMOKE-TEST-ONLY-001'),
      'test-only sales order leaked into the ordinary order list',
    );
    const orderReferenceList = await request(baseUrl, '/reference/sales-orders?limit=200');
    assert(
      !(orderReferenceList.items || []).some((item) => item.code === 'SO-SMOKE-TEST-ONLY-001' || item.raw?.code === 'SO-SMOKE-TEST-ONLY-001'),
      'test-only sales order leaked into sales-order references',
    );
    const testOnlyOrder = await request(baseUrl, '/sales/orders/SO-SMOKE-TEST-ONLY-001');
    assert(testOnlyOrder.order?.testOnly === true, 'test-only order lost direct regression access');
    const deliveryRecordList = await request(baseUrl, '/sales/delivery-records');
    assert(
      !(deliveryRecordList.items || []).some((record) => record.sourceOrder === 'SO-SMOKE-TEST-ONLY-001'),
      'test-only sales order leaked into sales delivery records',
    );
    const filteredTestDeliveryRecords = await request(baseUrl, '/sales/delivery-records?sourceOrder=SO-SMOKE-TEST-ONLY-001');
    assert(
      (filteredTestDeliveryRecords.items || []).length === 0,
      'source-order delivery filtering bypassed test-only isolation',
    );

    const salesMaterialReference = await request(baseUrl, '/reference/materials?kind=%E9%94%80%E5%94%AE&limit=50');
    assert(salesMaterialReference.items.length > 0, 'sales quote material reference returned no candidates');
    assert(
      salesMaterialReference.items.every((item) => (
        item.raw?.status !== '停用'
        && (item.raw?.isSaleable === true || item.raw?.category === '成品' || item.raw?.type === '成品')
      )),
      'sales quote material reference included a disabled or non-saleable material',
    );

    const salesMaterial = salesMaterialReference.items[0].raw;
    const recipeBackedSalesMaterial = salesMaterialReference.items.find(
      (item) => item.raw?.code === 'M-FG-PLA-175-MBK',
    )?.raw;
    const recipePendingSalesMaterial = salesMaterialReference.items.find(
      (item) => item.raw?.code === 'M-FG-PETG-175-BLK',
    )?.raw;
    assert(recipeBackedSalesMaterial, 'sales production-demand smoke requires a saleable product with an enabled recipe');
    assert(recipePendingSalesMaterial, 'sales production-demand smoke requires a saleable product awaiting recipe setup');
    const quotePayload = {
      code: '系统自动生成',
      companyCode: 'COM-FILATRIX',
      company: 'Filatrix 增材材料有限公司',
      companyPrintSnapshot: {
        name: '伪造 PDF 抬头',
        address: '伪造地址',
        email: 'forged@example.com',
        website: 'https://forged.example.com',
      },
      customerCode: 'CUS-00001',
      customer: '伪造客户名称',
      contact: '林经理',
      contactPhone: '138-0571-6218',
      products: [{
        materialCode: salesMaterial.code,
        name: '伪造物料名称',
        qty: `2 ${salesMaterial.uom || '件'}`,
        unitPrice: '100.00',
        netUnitPrice: '1.00',
        grossUnitPrice: '1.00',
        netAmount: '￥1.00',
        taxAmount: '￥1.00',
        grossAmount: '￥1.00',
        amount: '￥1.00',
        uom: '伪造单位',
        englishName: 'Forged English Name',
        englishModel: 'FORGED-EN-MODEL',
        englishSpec: 'Forged English specification',
      }],
      amount: '￥1.00',
      owner: '伪造报价人',
      ownerAccountCode: 'ACC-FAKE',
      status: '已确认',
      date: '2026-07-24',
      validUntil: '2099-12-31',
      tradeType: '外贸',
      currency: 'CNY',
      incoterm: 'CIF',
      incotermLocation: 'Hamburg Port, Germany',
      destinationCountry: 'Germany',
      transportMode: 'Sea Freight',
      documentLanguage: '英文',
      deliveryMethod: '本厂配送',
      paymentMethod: '月结 30 天',
      freightPayer: '供方',
      taxMode: '含税',
      taxRate: '13%',
      remark: '',
      attachments: [],
    };
    const createdQuote = await request(baseUrl, '/sales/quotes', { method: 'POST', body: quotePayload });
    assert(createdQuote.quote.owner === '张三', 'new quote person was not derived from the active account');
    assert(createdQuote.quote.ownerAccountCode === 'ACC-ZHANGSAN', 'new quote person account identity was not preserved');
    assert(createdQuote.quote.status === '草稿', 'client forged the quote lifecycle during draft creation');
    assert(
      createdQuote.quote.companyPrintSnapshot?.name === 'Filatrix 增材材料有限公司'
      && createdQuote.quote.companyPrintSnapshot?.address === '浙江省杭州市滨江区江南大道 1688 号'
      && createdQuote.quote.companyPrintSnapshot?.email === 'ops@filatrix.example'
      && createdQuote.quote.companyPrintSnapshot?.website === 'https://www.filatrix.com',
      'quote PDF company snapshot was missing or trusted forged client values',
    );
    assert(createdQuote.quote.customer === '杭州千层增材科技', 'quote customer snapshot trusted a forged client name');
    assert(createdQuote.quote.products[0].name === salesMaterial.name, 'quote material snapshot trusted a forged client name');
    assert(createdQuote.quote.products[0].uom === salesMaterial.uom, 'quote material snapshot trusted a forged client unit');
    assert(createdQuote.quote.products[0].priceInputMode === '含税', 'legacy quote-level input mode did not migrate to the line');
    assert(createdQuote.quote.products[0].taxRate === '13%', 'quote line tax rate was not retained');
    assert(createdQuote.quote.products[0].netUnitPrice === '88.4956', 'gross-price quote did not derive the net unit price');
    assert(createdQuote.quote.products[0].grossUnitPrice === '100.00', 'gross-price quote changed the input unit price');
    assert(createdQuote.quote.products[0].netAmount === '￥176.99', 'gross-price quote did not derive the net line amount');
    assert(createdQuote.quote.products[0].taxAmount === '￥23.01', 'gross-price quote did not derive the line tax');
    assert(createdQuote.quote.products[0].grossAmount === '￥200.00', 'gross-price quote trusted the forged gross amount');
    assert(createdQuote.quote.products[0].amount === '￥200.00', 'quote line amount trusted the client value');
    assert(createdQuote.quote.netAmount === '￥176.99', 'gross-price quote did not derive the net total');
    assert(createdQuote.quote.taxAmount === '￥23.01', 'gross-price quote did not derive the tax total');
    assert(createdQuote.quote.amount === '￥200.00', 'quote total amount trusted the client value');
    assert(createdQuote.quote.currency === 'CNY', 'quote currency was not retained from the active currency master');
    assert(
      ['tradeType', 'incoterm', 'incotermLocation', 'destinationCountry', 'transportMode', 'documentLanguage']
        .every((key) => !Object.hasOwn(createdQuote.quote, key)),
      'deferred export quote fields returned through the save boundary',
    );
    assert(
      ['englishName', 'englishModel', 'englishSpec'].every((key) => !Object.hasOwn(createdQuote.quote.products[0], key)),
      'optional material English fields were referenced by the sales quote snapshot',
    );

    const netPriceQuote = await request(baseUrl, '/sales/quotes', {
      method: 'POST',
      body: {
        ...quotePayload,
        products: [{
          materialCode: salesMaterial.code,
          qty: `2 ${salesMaterial.uom || '件'}`,
          priceInputMode: '不含税',
          unitPrice: '100.00',
          taxRate: '13%',
          netUnitPrice: '999.00',
          grossUnitPrice: '999.00',
          netAmount: '￥999.00',
          taxAmount: '￥999.00',
          grossAmount: '￥999.00',
          amount: '￥999.00',
        }],
        taxMode: '含税',
        amount: '￥999.00',
      },
    });
    assert(netPriceQuote.quote.products[0].priceInputMode === '不含税', 'line-level net-price input mode was not retained');
    assert(netPriceQuote.quote.products[0].netUnitPrice === '100.00', 'net-price quote changed the input unit price');
    assert(netPriceQuote.quote.products[0].grossUnitPrice === '113.00', 'net-price quote did not derive the gross unit price');
    assert(netPriceQuote.quote.products[0].netAmount === '￥200.00', 'net-price quote trusted the forged net amount');
    assert(netPriceQuote.quote.products[0].taxAmount === '￥26.00', 'net-price quote trusted the forged line tax');
    assert(netPriceQuote.quote.products[0].grossAmount === '￥226.00', 'net-price quote trusted the forged gross amount');
    assert(netPriceQuote.quote.netAmount === '￥200.00', 'net-price quote did not derive the net total');
    assert(netPriceQuote.quote.taxAmount === '￥26.00', 'net-price quote did not derive the tax total');
    assert(netPriceQuote.quote.amount === '￥226.00', 'net-price quote did not derive the payable total');

    assert(salesMaterialReference.items.length > 1, 'mixed-rate quote test requires two saleable materials');
    const secondSalesMaterial = salesMaterialReference.items[1].raw;
    const mixedRateQuote = await request(baseUrl, '/sales/quotes', {
      method: 'POST',
      body: {
        ...quotePayload,
        products: [
          {
            materialCode: salesMaterial.code,
            qty: `1 ${salesMaterial.uom || '件'}`,
            priceInputMode: '不含税',
            unitPrice: '100.00',
            taxRate: '13%',
          },
          {
            materialCode: secondSalesMaterial.code,
            qty: `1 ${secondSalesMaterial.uom || '件'}`,
            priceInputMode: '含税',
            unitPrice: '109.00',
            taxRate: '9%',
          },
        ],
        taxMode: '含税',
      },
    });
    assert(mixedRateQuote.quote.products[0].priceInputMode === '不含税', 'mixed quote lost the net-price source line');
    assert(mixedRateQuote.quote.products[1].priceInputMode === '含税', 'mixed quote lost the gross-price source line');
    assert(mixedRateQuote.quote.taxRate === '多税率', 'mixed-rate quote did not derive the compatibility summary');
    assert(mixedRateQuote.quote.netAmount === '￥200.00', 'mixed-rate quote net total is incorrect');
    assert(mixedRateQuote.quote.taxAmount === '￥22.00', 'mixed-rate quote tax total is incorrect');
    assert(mixedRateQuote.quote.amount === '￥222.00', 'mixed-rate quote payable total is incorrect');

    const addedRateQuote = await request(baseUrl, '/sales/quotes', {
      method: 'POST',
      body: {
        ...quotePayload,
        products: [
          {
            materialCode: salesMaterial.code,
            qty: `1 ${salesMaterial.uom || '件'}`,
            priceInputMode: '不含税',
            unitPrice: '100.00',
            taxRate: '6%',
          },
          {
            materialCode: secondSalesMaterial.code,
            qty: `1 ${secondSalesMaterial.uom || '件'}`,
            priceInputMode: '不含税',
            unitPrice: '100.00',
            taxRate: '3%',
          },
        ],
      },
    });
    assert(
      addedRateQuote.quote.products.map((product) => product.taxRate).join(',') === '6%,3%',
      'quote did not retain the added 6% and 3% tax rates',
    );
    assert(addedRateQuote.quote.netAmount === '￥200.00', '6%/3% quote net total is incorrect');
    assert(addedRateQuote.quote.taxAmount === '￥9.00', '6%/3% quote tax total is incorrect');
    assert(addedRateQuote.quote.amount === '￥209.00', '6%/3% quote payable total is incorrect');

    assert(salesMaterialReference.items.length > 2, 'special-rate quote test requires three saleable materials');
    const thirdSalesMaterial = salesMaterialReference.items[2].raw;
    const specialRateQuote = await request(baseUrl, '/sales/quotes', {
      method: 'POST',
      body: {
        ...quotePayload,
        products: [
          {
            materialCode: salesMaterial.code,
            qty: `1 ${salesMaterial.uom || '件'}`,
            priceInputMode: '不含税',
            unitPrice: '100.00',
            taxRate: '1%',
          },
          {
            materialCode: secondSalesMaterial.code,
            qty: `1 ${secondSalesMaterial.uom || '件'}`,
            priceInputMode: '不含税',
            unitPrice: '100.00',
            taxRate: '0%',
          },
          {
            materialCode: thirdSalesMaterial.code,
            qty: `1 ${thirdSalesMaterial.uom || '件'}`,
            priceInputMode: '不含税',
            unitPrice: '100.00',
            taxRate: '免税',
          },
        ],
      },
    });
    assert(
      specialRateQuote.quote.products.map((product) => product.taxRate).join(',') === '1%,0%,免税',
      'quote did not retain the 1%, 0%, and exempt tax semantics separately',
    );
    assert(specialRateQuote.quote.netAmount === '￥300.00', 'special-rate quote net total is incorrect');
    assert(specialRateQuote.quote.taxAmount === '￥1.00', 'special-rate quote tax total is incorrect');
    assert(specialRateQuote.quote.amount === '￥301.00', 'special-rate quote payable total is incorrect');

    const updatedQuote = await request(baseUrl, `/sales/quotes/${encodeURIComponent(createdQuote.quote.code)}`, {
      method: 'PUT',
      body: { ...createdQuote.quote, owner: '李明', ownerEmployeeCode: 'EMP-LM', ownerAccountCode: 'ACC-FAKE', remark: '报价人可按单调整。' },
    });
    assert(updatedQuote.quote.owner === '李明', 'quote person could not be changed to another active employee');
    assert(updatedQuote.quote.ownerEmployeeCode === 'EMP-LM', 'quote person employee identity was not retained');
    assert(updatedQuote.quote.ownerAccountCode !== 'ACC-FAKE', 'quote trusted a forged owner account identity');
    assert(updatedQuote.flowRecords.at(-1)?.actor === '张三', 'quote edit flow actor was not the active account');
    const concurrentQuoteUpdate = await request(baseUrl, `/sales/quotes/${encodeURIComponent(createdQuote.quote.code)}`, {
      method: 'PUT',
      body: { ...updatedQuote.quote, remark: '并发用户先保存的报价说明。' },
    });
    assert(
      concurrentQuoteUpdate.quote.revision > updatedQuote.quote.revision,
      'quote update did not advance the optimistic-lock revision',
    );
    let staleQuoteRevisionBlocked = false;
    try {
      await request(baseUrl, `/sales/quotes/${encodeURIComponent(createdQuote.quote.code)}`, {
        method: 'PUT',
        body: { ...updatedQuote.quote, remark: '不应覆盖的新说明。' },
      });
    } catch (error) {
      staleQuoteRevisionBlocked = String(error).includes('HTTP 409');
    }
    assert(staleQuoteRevisionBlocked, 'stale quote revision overwrote a newer update');
    const refreshedConcurrentQuote = await request(baseUrl, `/sales/quotes/${encodeURIComponent(createdQuote.quote.code)}`);
    const recoveredQuoteUpdate = await request(baseUrl, `/sales/quotes/${encodeURIComponent(createdQuote.quote.code)}`, {
      method: 'PUT',
      body: { ...refreshedConcurrentQuote.quote, remark: '刷新后保存成功。' },
    });
    assert(
      recoveredQuoteUpdate.quote.remark === '刷新后保存成功。',
      'quote could not save after refreshing to the latest revision',
    );
    const confirmedQuote = await request(baseUrl, `/sales/quotes/${encodeURIComponent(createdQuote.quote.code)}/confirm`, {
      method: 'POST',
      body: { revision: recoveredQuoteUpdate.quote.revision },
    });
    assert(confirmedQuote.quote.status === '已确认', 'complete sales quote could not be confirmed');
    assert(confirmedQuote.flowRecords.at(-1)?.actor === '张三', 'quote confirmation flow actor was not the active account');

    const invalidOwnerQuoteDraft = await request(baseUrl, '/sales/quotes', { method: 'POST', body: quotePayload });
    const invalidOwnerQuote = await request(baseUrl, `/sales/quotes/${encodeURIComponent(invalidOwnerQuoteDraft.quote.code)}`, {
      method: 'PUT',
      body: { ...invalidOwnerQuoteDraft.quote, owner: '周宁', ownerEmployeeCode: 'EMP-ZN' },
    });
    let invalidQuoteOwnerBlocked = false;
    try {
      await request(baseUrl, `/sales/quotes/${encodeURIComponent(invalidOwnerQuote.quote.code)}/confirm`, {
        method: 'POST',
        body: { revision: invalidOwnerQuote.quote.revision },
      });
    } catch (error) {
      invalidQuoteOwnerBlocked = String(error).includes('未关联启用的销售账号');
    }
    assert(invalidQuoteOwnerBlocked, 'quote confirmation accepted an employee without an active sales account');

    const orderPayload = {
      code: '系统自动生成',
      currency: 'CNY',
      companyCode: 'COM-FILATRIX',
      company: '伪造公司名称',
      companyPrintSnapshot: {
        name: '伪造订单抬头',
        address: '伪造订单地址',
        email: 'forged-order@example.com',
        website: 'https://forged-order.example.com',
      },
      supplierPrintSnapshot: {
        contact: '伪造供方联系人',
        phone: '伪造供方手机号',
        contactInfo: '伪造旧联系方式',
      },
      customerPrintSnapshot: {
        name: '伪造需方名称',
        address: '伪造需方公司地址',
        contact: '伪造需方联系人',
        phone: '伪造需方手机号',
      },
      customerCode: 'CUS-00001',
      customer: '伪造客户名称',
      contact: '林经理',
      contactPhone: '138-0571-6218',
      sourceQuote: confirmedQuote.quote.code,
      products: [{
        lineId: 'CLIENT-LINE',
        materialCode: salesMaterial.code,
        name: '伪造物料名称',
        qty: `2 ${salesMaterial.uom || '件'}`,
        unitPrice: '100.00',
        amount: '￥1.00',
        uom: '伪造单位',
        fulfillmentLinks: [{ type: '库存预留', documentCode: 'FAKE', qty: '999 件', status: '已完成' }],
      }],
      amount: '￥1.00',
      owner: '李明',
      ownerEmployeeCode: 'EMP-LM',
      priority: '正常',
      documentStatus: '已确认',
      status: '已完成',
      date: '2026-07-24',
      delivery: '2026-07-31',
      deliveryMethod: '本厂配送',
      paymentMethod: '月结 30 天',
      freightPayer: '供方',
      taxMode: '含税',
      taxRate: '13%',
      logisticsMode: '本厂配送',
      plannedShipDate: '2026-07-29',
      shipAddress: '杭州市测试收货地址',
      shipContact: '林经理',
      shipPhone: '138-0571-6218',
      supplementaryRequirement: '外箱贴客户项目标签，生产与仓库均需复核。',
      internalNote: '仅销售内部查看：客户正在评估下一批价格。',
      remark: '',
      attachments: [],
    };
    const createdOrder = await request(baseUrl, '/sales/orders', { method: 'POST', body: orderPayload });
    assert(createdOrder.order.status === '草稿', 'client forged the sales order lifecycle during draft creation');
    assert(createdOrder.order.documentStatus === '草稿', 'client forged the sales order document status during draft creation');
    assert(createdOrder.order.customer === '杭州千层增材科技', 'sales order customer snapshot trusted a forged client name');
    assert(createdOrder.order.products[0].name === salesMaterial.name, 'sales order material snapshot trusted a forged client name');
    assert(createdOrder.order.products[0].uom === salesMaterial.uom, 'sales order material snapshot trusted a forged client unit');
    assert(createdOrder.order.products[0].amount === '￥200.00', 'sales order line amount trusted the client value');
    assert(createdOrder.order.amount === '￥200.00', 'sales order total amount trusted the client value');
    assert(createdOrder.order.currency === 'CNY', 'sales order currency was not retained from the active currency master');
    assert(
      createdOrder.order.companyPrintSnapshot?.name === 'Filatrix 增材材料有限公司'
      && createdOrder.order.companyPrintSnapshot?.address === '浙江省杭州市滨江区江南大道 1688 号'
      && createdOrder.order.companyPrintSnapshot?.email === 'ops@filatrix.example'
      && createdOrder.order.companyPrintSnapshot?.website === 'https://www.filatrix.com',
      'sales order PDF company snapshot was missing or trusted forged client values',
    );
    assert(createdOrder.order.ownerEmployeeCode === 'EMP-LM', 'sales order owner employee identity was not retained');
    assert(createdOrder.order.supplementaryRequirement === '外箱贴客户项目标签，生产与仓库均需复核。', 'sales order lost the cross-document supplementary requirement');
    assert(createdOrder.order.internalNote === '仅销售内部查看：客户正在评估下一批价格。', 'sales order lost its sales-only internal note');
    assert(
      createdOrder.order.supplierPrintSnapshot?.contact === '李明'
      && createdOrder.order.supplierPrintSnapshot?.phone === '138-0000-0002'
      && !Object.prototype.hasOwnProperty.call(createdOrder.order.supplierPrintSnapshot, 'contactInfo'),
      'sales order PDF supplier contact snapshot was missing or trusted forged client values',
    );
    assert(
      createdOrder.order.customerPrintSnapshot?.name === '杭州千层增材科技'
      && createdOrder.order.customerPrintSnapshot?.address === '浙江省杭州市滨江区滨安路 1197 号 3D 打印中心'
      && createdOrder.order.customerPrintSnapshot?.contact === '林经理'
      && createdOrder.order.customerPrintSnapshot?.phone === '138-0571-6218',
      'sales order PDF customer company snapshot was missing, confused with shipping data, or trusted forged client values',
    );
    assert(createdOrder.order.products[0].priceInputMode === '含税', 'legacy gross-price order line did not normalize to a line input mode');
    assert(createdOrder.order.products[0].grossUnitPrice === '100.00', 'gross-price order did not retain the input unit price');
    assert(createdOrder.order.products[0].netAmount === '￥176.99', 'gross-price order did not derive the net amount');
    assert(createdOrder.order.products[0].taxAmount === '￥23.01', 'gross-price order did not derive the line tax');
    assert(createdOrder.order.products[0].fulfillmentLinks.length === 0, 'sales order draft accepted forged fulfillment links');
    assert(createdOrder.flowRecords.at(-1)?.actor === '张三', 'sales order save flow actor was not the active account');

    const netPriceOrder = await request(baseUrl, '/sales/orders', {
      method: 'POST',
      body: {
        ...orderPayload,
        sourceQuote: '',
        supplementaryRequirement: '  production and warehouse requirement  ',
        internalNote: '   \n  ',
        products: [{
          ...orderPayload.products[0],
          priceInputMode: '不含税',
          unitPrice: '100.00',
          taxRate: '6%',
          netUnitPrice: '999.00',
          grossUnitPrice: '999.00',
          netAmount: '￥999.00',
          taxAmount: '￥999.00',
          grossAmount: '￥999.00',
          amount: '￥999.00',
        }],
        netAmount: '￥999.00',
        taxAmount: '￥999.00',
        amount: '￥999.00',
      },
    });
    assert(netPriceOrder.order.products[0].priceInputMode === '不含税', 'sales order lost the net-price input mode');
    assert(netPriceOrder.order.products[0].netUnitPrice === '100.00', 'sales order changed the net input unit price');
    assert(netPriceOrder.order.products[0].taxRate === '6%', 'sales order did not retain the added 6% tax rate');
    assert(netPriceOrder.order.products[0].grossUnitPrice === '106.00', 'sales order did not derive the gross unit price');
    assert(netPriceOrder.order.products[0].netAmount === '￥200.00', 'sales order trusted a forged net amount');
    assert(netPriceOrder.order.products[0].taxAmount === '￥12.00', 'sales order trusted a forged line tax');
    assert(netPriceOrder.order.products[0].grossAmount === '￥212.00', 'sales order trusted a forged gross amount');
    assert(netPriceOrder.order.netAmount === '￥200.00', 'sales order did not derive the net total');
    assert(netPriceOrder.order.taxAmount === '￥12.00', 'sales order did not derive the tax total');
    assert(netPriceOrder.order.amount === '￥212.00', 'sales order did not derive the payable total');
    assert(
      netPriceOrder.order.supplementaryRequirement === 'production and warehouse requirement'
      && netPriceOrder.order.internalRemark === 'production and warehouse requirement',
      'sales order did not trim the cross-document supplementary requirement and its legacy alias',
    );
    assert(netPriceOrder.order.internalNote === '', 'sales order retained a whitespace-only sales internal note');

    const missingShippingOrder = await request(baseUrl, '/sales/orders', {
      method: 'POST',
      body: {
        ...orderPayload,
        sourceQuote: '',
        shipContact: '',
        shipPhone: '',
        shipAddress: '',
        supplementaryRequirement: '保持生产任务承接原文。',
      },
    });
    assert(missingShippingOrder.order.shipContact === '', 'sales order draft replaced missing ship contact with company contact');
    assert(missingShippingOrder.order.shipPhone === '', 'sales order draft replaced missing ship phone with company phone');
    assert(missingShippingOrder.order.shipAddress === '', 'sales order draft invented a shipping address');
    assert(
      missingShippingOrder.order.supplementaryRequirement === '保持生产任务承接原文。'
      && missingShippingOrder.order.internalRemark === '保持生产任务承接原文。',
      'sales order draft rewrote the supplementary requirement or lost the legacy compatibility value',
    );
    let missingShippingOrderBlocked = false;
    try {
      await request(baseUrl, `/sales/orders/${encodeURIComponent(missingShippingOrder.order.code)}/confirm`, {
        method: 'POST',
        body: { revision: missingShippingOrder.order.revision },
      });
    } catch (error) {
      missingShippingOrderBlocked = String(error).includes('收货人')
        && String(error).includes('收货联系方式')
        && String(error).includes('收货地址');
    }
    assert(missingShippingOrderBlocked, 'sales order confirmation accepted missing shipping requirements');

    const invalidOwnerOrder = await request(baseUrl, '/sales/orders', {
      method: 'POST',
      body: {
        ...orderPayload,
        sourceQuote: '',
        owner: '周宁',
        ownerEmployeeCode: 'EMP-ZN',
      },
    });
    let invalidOrderOwnerBlocked = false;
    try {
      await request(baseUrl, `/sales/orders/${encodeURIComponent(invalidOwnerOrder.order.code)}/confirm`, {
        method: 'POST',
        body: { revision: invalidOwnerOrder.order.revision },
      });
    } catch (error) {
      invalidOrderOwnerBlocked = String(error).includes('未关联启用的销售账号');
    }
    assert(invalidOrderOwnerBlocked, 'sales order confirmation accepted an employee without an active sales account');

    const convertedQuote = await request(baseUrl, `/sales/quotes/${encodeURIComponent(confirmedQuote.quote.code)}`);
    assert(convertedQuote.quote.status === '已转订单', 'source quote did not enter converted status with the order draft');
    assert(convertedQuote.quote.convertedOrderCode === createdOrder.order.code, 'source quote did not retain the converted order relation');

    const confirmedOrder = await request(baseUrl, `/sales/orders/${encodeURIComponent(createdOrder.order.code)}/confirm`, {
      method: 'POST',
      body: { revision: createdOrder.order.revision },
    });
    assert(confirmedOrder.order.documentStatus === '已确认', 'complete sales order could not be confirmed');
    assert(confirmedOrder.flowRecords.at(-1)?.actor === '张三', 'sales order confirmation flow actor was not the active account');
    assert(
      confirmedOrder.outboundRequest?.sourceOrder === confirmedOrder.order.code,
      'sales order confirmation did not create the delivery tracking document',
    );
    assert(
      confirmedOrder.outboundRequest?.supplementaryRequirement === confirmedOrder.order.supplementaryRequirement
      && !Object.prototype.hasOwnProperty.call(confirmedOrder.outboundRequest || {}, 'internalNote'),
      'delivery tracking lost the supplementary requirement or leaked the sales-only order note',
    );
    assert(
      !confirmedOrder.outboundRequest?.warehouseCode && !confirmedOrder.outboundRequest?.warehouse,
      'delivery tracking still froze a planned warehouse before warehouse picking',
    );
    const frozenTrackingUpdate = await request(
      baseUrl,
      `/sales/outbound-requests/${encodeURIComponent(confirmedOrder.outboundRequest.code)}`,
      {
        method: 'PUT',
        body: {
          ...confirmedOrder.outboundRequest,
          warehouseCode: 'WH-FG',
          warehouse: '成品仓',
          supplementaryRequirement: '客户端伪造的下游补充要求',
          remark: '客户端伪造的下游补充要求',
        },
      },
    );
    assert(
      !frozenTrackingUpdate.request.warehouseCode
      && !frozenTrackingUpdate.request.warehouse
      && frozenTrackingUpdate.request.supplementaryRequirement === confirmedOrder.order.supplementaryRequirement,
      'delivery tracking accepted a client-planned warehouse or rewrote the order-derived supplementary requirement',
    );
    assert(
      confirmedOrder.order.products[0].fulfillmentLinks.some((link) => link.type === '库存预留'),
      'sales order confirmation did not persist the real inventory reservation',
    );

    const shortageOrderDraft = await request(baseUrl, '/sales/orders', {
      method: 'POST',
      body: {
        ...orderPayload,
        sourceQuote: '',
        products: [{
          ...orderPayload.products[0],
          materialCode: recipeBackedSalesMaterial.code,
          name: recipeBackedSalesMaterial.name,
          qty: `100000 ${recipeBackedSalesMaterial.uom || '件'}`,
          uom: recipeBackedSalesMaterial.uom,
        }],
      },
    });
    const shortageOrder = await request(baseUrl, `/sales/orders/${encodeURIComponent(shortageOrderDraft.order.code)}/confirm`, {
      method: 'POST',
      body: { revision: shortageOrderDraft.order.revision },
    });
    const shortageLine = shortageOrder.order.products[0];
    const shortageTaskLink = shortageLine.fulfillmentLinks.find((link) => link.type === '生产任务');
    assert(shortageOrder.outboundRequest?.sourceOrder === shortageOrder.order.code, 'shortage order did not create delivery tracking at confirmation');
    assert(shortageTaskLink?.documentCode === shortageOrder.productionTask?.code, 'shortage order did not link its production task by document identity');
    assert(shortageTaskLink?.documentLineId === shortageLine.lineId, 'shortage order production task did not retain the sales order line identity');
    assert(shortageOrder.productionTask?.sourceType === '销售订单缺口', 'shortage order created a production task with the wrong source type');
    assert(shortageOrder.productionTask?.sourceCode === shortageOrder.order.code, 'shortage production task lost its source sales order');
    assert(
      shortageOrder.productionTask?.supplementaryRequirement === shortageOrder.order.supplementaryRequirement
      && !Object.prototype.hasOwnProperty.call(shortageOrder.productionTask || {}, 'internalNote'),
      'production task lost the supplementary requirement or leaked the sales-only order note',
    );
    assert(shortageOrder.productionTask?.documentStatus === '已确认', 'shortage production task was not ready for work-order planning');
    assert(shortageOrder.productionTask?.products[0]?.sourceLineId === shortageLine.lineId, 'production task product lost the source sales order line identity');
    assert(shortageOrder.productionTask?.products[0]?.recipeCode === 'BOM-PLA-175-MBK-V1', 'production task did not bind the unique enabled recipe');
    assert(shortageOrder.productionTask?.materialPlanningStatus === '已展开物料需求', 'production task did not expose its material-planning result');
    assert(shortageOrder.productionTask?.materialNeeds?.length === 3, 'production task did not expand the enabled recipe into material demand');
    assert(
      shortageOrder.productionTask.materialNeeds.every((need) => (
        need.estimatedQty > 0
        && need.sourceLines?.[0]?.sourceLineId === shortageLine.lineId
        && need.sourceLines?.[0]?.recipeCode === 'BOM-PLA-175-MBK-V1'
      )),
      'production task material demand lost the sales-order line or recipe evidence',
    );
    assert(shortageOrder.order.productionProgress.status === '待建工单', 'shortage order falsely claimed production had started before a work order existed');
    const shortageTaskDetail = await request(baseUrl, `/production/tasks/${encodeURIComponent(shortageOrder.productionTask.code)}`);
    assert(shortageTaskDetail.record?.sourceCode === shortageOrder.order.code, 'persisted production task cannot trace back to the shortage sales order');
    assert(shortageTaskDetail.record?.materialNeeds?.length === 3, 'persisted production task lost its recipe-derived material demand');
    assert(shortageTaskDetail.flowRecords.at(-1)?.action === '系统生成生产任务', 'automatic production-task creation left no auditable flow record');

    const spoofedShortageTask = await request(baseUrl, `/production/tasks/${encodeURIComponent(shortageOrder.productionTask.code)}`, {
      method: 'PUT',
      body: {
        ...shortageTaskDetail.record,
        command: 'submit',
        idempotencyKey: `${shortageOrder.productionTask.code}-supplementary-source-guard`,
        supplementaryRequirement: 'client-forged stale requirement',
      },
    });
    assert(
      spoofedShortageTask.record?.supplementaryRequirement === shortageOrder.order.supplementaryRequirement
      && !Object.prototype.hasOwnProperty.call(spoofedShortageTask.record || {}, 'internalNote'),
      'production task accepted a client-forged source requirement or leaked the sales-only note',
    );
    const refreshedShortageTracking = await request(
      baseUrl,
      `/sales/outbound-requests/${encodeURIComponent(shortageOrder.outboundRequest.code)}`,
    );
    assert(
      refreshedShortageTracking.request?.supplementaryRequirement === shortageOrder.order.supplementaryRequirement
      && !Object.prototype.hasOwnProperty.call(refreshedShortageTracking.request || {}, 'internalNote'),
      'delivery tracking lost the authoritative source requirement or leaked the sales-only note',
    );

    const recipePendingOrderDraft = await request(baseUrl, '/sales/orders', {
      method: 'POST',
      body: {
        ...orderPayload,
        sourceQuote: '',
        products: [{
          ...orderPayload.products[0],
          materialCode: recipePendingSalesMaterial.code,
          name: recipePendingSalesMaterial.name,
          qty: `100000 ${recipePendingSalesMaterial.uom || '件'}`,
          uom: recipePendingSalesMaterial.uom,
        }],
      },
    });
    const recipePendingOrder = await request(baseUrl, `/sales/orders/${encodeURIComponent(recipePendingOrderDraft.order.code)}/confirm`, {
      method: 'POST',
      body: { revision: recipePendingOrderDraft.order.revision },
    });
    assert(recipePendingOrder.outboundRequest?.sourceOrder === recipePendingOrder.order.code, 'recipe-pending production demand blocked delivery tracking');
    assert(recipePendingOrder.productionTask?.materialPlanningStatus === '待配置配方', 'recipe-pending production demand was not exposed as a planning blocker');
    assert(recipePendingOrder.productionTask?.materialPlanningBlockers?.[0]?.productCode === recipePendingSalesMaterial.code, 'recipe-pending task lost its blocked product identity');
    assert(recipePendingOrder.productionTask?.materialNeeds?.length === 0, 'recipe-pending task fabricated material demand without an enabled recipe');

    const incompleteOrder = await request(baseUrl, '/sales/orders', {
      method: 'POST',
      body: {
        ...orderPayload,
        sourceQuote: '',
        products: [
          orderPayload.products[0],
          { lineId: 'EMPTY-LINE', materialCode: '', name: '', qty: '', unitPrice: '', amount: '', uom: '' },
        ],
      },
    });
    let incompleteOrderBlocked = false;
    try {
      await request(baseUrl, `/sales/orders/${encodeURIComponent(incompleteOrder.order.code)}/confirm`, {
        method: 'POST',
        body: { revision: incompleteOrder.order.revision },
      });
    } catch (error) {
      incompleteOrderBlocked = String(error).includes('完整且不重复的销售物料明细');
    }
    assert(incompleteOrderBlocked, 'sales order confirmation ignored an incomplete material line');

    const duplicateOrder = await request(baseUrl, '/sales/orders', {
      method: 'POST',
      body: {
        ...orderPayload,
        sourceQuote: '',
        products: [
          orderPayload.products[0],
          { ...orderPayload.products[0], lineId: 'DUPLICATE-LINE', qty: `1 ${salesMaterial.uom || '件'}` },
        ],
      },
    });
    let duplicateOrderBlocked = false;
    try {
      await request(baseUrl, `/sales/orders/${encodeURIComponent(duplicateOrder.order.code)}/confirm`, {
        method: 'POST',
        body: { revision: duplicateOrder.order.revision },
      });
    } catch (error) {
      duplicateOrderBlocked = String(error).includes('完整且不重复的销售物料明细');
    }
    assert(duplicateOrderBlocked, 'sales order confirmation ignored duplicate material lines');

    const invalidDateOrder = await request(baseUrl, '/sales/orders', {
      method: 'POST',
      body: {
        ...orderPayload,
        sourceQuote: '',
        delivery: '2026-07-25',
        plannedShipDate: '2026-07-26',
      },
    });
    let invalidDateOrderBlocked = false;
    try {
      await request(baseUrl, `/sales/orders/${encodeURIComponent(invalidDateOrder.order.code)}/confirm`, {
        method: 'POST',
        body: { revision: invalidDateOrder.order.revision },
      });
    } catch (error) {
      invalidDateOrderBlocked = String(error).includes('计划发货日期必须介于');
    }
    assert(invalidDateOrderBlocked, 'sales order confirmation ignored an impossible ship-date sequence');

    const incompleteQuote = await request(baseUrl, '/sales/quotes', {
      method: 'POST',
      body: {
        ...quotePayload,
        products: [
          quotePayload.products[0],
          { materialCode: '', name: '', qty: '', unitPrice: '', amount: '', uom: '' },
        ],
      },
    });
    let incompleteQuoteBlocked = false;
    try {
      await request(baseUrl, `/sales/quotes/${encodeURIComponent(incompleteQuote.quote.code)}/confirm`, {
        method: 'POST',
        body: { revision: incompleteQuote.quote.revision },
      });
    } catch (error) {
      incompleteQuoteBlocked = String(error).includes('完整且不重复的销售物料明细');
    }
    assert(incompleteQuoteBlocked, 'quote confirmation ignored an incomplete material line');

    const voidableQuote = await request(baseUrl, '/sales/quotes', { method: 'POST', body: quotePayload });
    const voidedQuote = await request(baseUrl, `/sales/quotes/${encodeURIComponent(voidableQuote.quote.code)}/void`, {
      method: 'POST',
      body: { revision: voidableQuote.quote.revision },
    });
    assert(voidedQuote.quote.status === '已作废', 'quote void action did not accept the latest revision');

    const voidableOrder = await request(baseUrl, '/sales/orders', {
      method: 'POST',
      body: { ...orderPayload, sourceQuote: '' },
    });
    const voidedOrder = await request(baseUrl, `/sales/orders/${encodeURIComponent(voidableOrder.order.code)}/void`, {
      method: 'POST',
      body: { revision: voidableOrder.order.revision },
    });
    assert(
      voidedOrder.order.documentStatus === '已作废' && voidedOrder.order.status === '已作废',
      'sales order void action did not accept the latest revision',
    );

    const completed = await request(baseUrl, '/sales/orders/SO-20260528-008');
    assert(completed.order.deliveryProgress.status === '已签收', 'historical order delivery evidence is inconsistent');
    assert(completed.order.deliveryProgress.outboundQty === 180, 'historical order outbound evidence is missing');
    assert(completed.order.invoiceProgress.invoicedAmount === 12420, 'historical order invoice evidence is missing');
    assert(completed.order.paymentProgress.settledAmount === 12420, 'historical order payment evidence is missing');

    const fullReservation = await request(baseUrl, '/sales/orders/SO-20260617-021');
    assert(
      fullReservation.order.products.every((product) => product.fulfillmentLinks.some((link) => link.type === '库存预留')),
      'full-reservation scenario is missing inventory reservation evidence',
    );

    const mixedSupply = await request(baseUrl, '/sales/orders/SO-20260715-022');
    assert(
      mixedSupply.order.productionProgress.status === '待释放'
        && mixedSupply.order.productionProgress.lines?.[0]?.productionDemandQty === 180
        && mixedSupply.order.productionProgress.plannedQty === 180
        && mixedSupply.order.productionProgress.lines?.[0]?.workOrderCodes?.includes('MO2-260715-006'),
      'mixed-supply scenario did not distinguish its production demand from the real planned work order',
    );
    assert(
      mixedSupply.order.products[0].fulfillmentLinks.some((link) => link.type === '库存预留')
        && mixedSupply.order.products[0].fulfillmentLinks.some((link) => link.type === '生产任务'),
      'mixed-supply scenario is missing inventory or production evidence',
    );
    assert(mixedSupply.order.invoiceProgress.status === '未开票', 'draft sales invoice incorrectly counted as issued invoice progress');
    assert(mixedSupply.order.invoiceProgress.invoicedAmount === 0, 'draft sales invoice incorrectly occupied issued invoice amount');
    assert(mixedSupply.order.paymentProgress.status === '未收款', 'sales order without a receivable was incorrectly marked as collected');

    const partialDelivery = await request(baseUrl, '/sales/orders/SO-20260712-018');
    assert(partialDelivery.order.deliveryProgress.status === '部分出库', 'partial-delivery scenario did not preserve split shipment progress');
    assert(partialDelivery.order.deliveryProgress.outboundQty === 80, 'partial-delivery scenario shipped quantity is inconsistent');
    assert(
      partialDelivery.order.deliveryProgress.lines?.[0]?.orderedQty === 160
        && partialDelivery.order.deliveryProgress.lines?.[0]?.remainingQty === 80,
      'partial-delivery scenario did not expose the original order and real remaining quantities by line',
    );
    const pendingIssuesBeforeClosure = await request(baseUrl, '/warehouse/sales-issues');
    const pendingIssue = pendingIssuesBeforeClosure.items.find((item) => (
      item.sourceOrder === partialDelivery.order.code && item.status === '待拣货'
    ));
    assert(pendingIssue, 'partial-delivery scenario did not have a clean remaining sales issue task');

    const closedDelivery = await request(baseUrl, `/sales/orders/${encodeURIComponent(partialDelivery.order.code)}/close-remainder`, {
      method: 'POST',
      body: {
        revision: partialDelivery.order.revision,
        reason: '客户确认取消剩余交付，双方同意按实发完成',
      },
    });
    const closedLine = closedDelivery.order.deliveryProgress.lines?.[0];
    assert(closedDelivery.order.status === '待签收', 'closed sales remainder did not move the order to customer receipt');
    assert(
      closedLine?.orderedQty === 160
        && closedLine?.deliveryTargetQty === 80
        && closedLine?.outboundQty === 80
        && closedLine?.closedQty === 80
        && closedLine?.remainingQty === 0,
      `sales remainder closure facts are inconsistent: ${JSON.stringify(closedLine)}`,
    );
    const issuesAfterClosure = await request(baseUrl, '/warehouse/sales-issues');
    assert(
      issuesAfterClosure.items.find((item) => item.code === pendingIssue.code)?.status === '已取消',
      'closing sales remainder did not cancel the untouched picking task',
    );
    const trackingAfterClosure = await request(baseUrl, '/sales/outbound-requests/SR-20260712-004');
    assert(trackingAfterClosure.request.status === '按实发完成', 'shipment tracking did not distinguish short delivery from full outbound');

    let noOutboundClosureBlocked = false;
    try {
      await request(baseUrl, `/sales/orders/${encodeURIComponent(fullReservation.order.code)}/close-remainder`, {
        method: 'POST',
        body: {
          revision: fullReservation.order.revision,
          reason: '客户取消整单交付测试',
        },
      });
    } catch (error) {
      noOutboundClosureBlocked = String(error).includes('尚未发生任何实际出库');
    }
    assert(noOutboundClosureBlocked, 'sales order without actual outbound was allowed to close delivery remainder');

    const returnOrder = await request(baseUrl, '/sales/orders/SO-20260705-011');
    assert(returnOrder.order.attentionFlags.status === '售后处理中', 'return/refund scenario did not expose the after-sales attention state');
    assert(returnOrder.order.invoiceProgress.invoicedAmount === 2460, 'return/refund scenario invoice evidence is missing');
    assert(returnOrder.order.paymentProgress.settledAmount === 2460, 'return/refund scenario receipt evidence is missing');
    const goldenAfterSales = await request(baseUrl, '/sales/after-sales/SA-20260716-002');
    assert(goldenAfterSales.record.amountImpact === '预计退款 ￥492.00', 'return/refund scenario amount impact is inconsistent');
    const salesAfterSaleRelatedTypes = new Set((goldenAfterSales.record.relatedDocuments || []).map((item) => item.type));
    assert(salesAfterSaleRelatedTypes.has('销售出库'), 'sales after-sales related records omitted the source outbound document');
    assert(salesAfterSaleRelatedTypes.has('开票记录'), 'sales after-sales related records omitted the commercial invoice evidence');
    assert(salesAfterSaleRelatedTypes.has('回款记录'), 'sales after-sales related records omitted the commercial payment evidence');

    const beforeReceipt = await request(baseUrl, '/sales/orders/SO-SMOKE-SIGNED-001');
    assert(beforeReceipt.order.deliveryProgress.status === '待签收', 'fully shipped order did not enter waiting-for-receipt progress');
    const receipt = await request(baseUrl, '/sales/orders/SO-SMOKE-SIGNED-001/confirm-receipt', {
      method: 'POST',
      body: { revision: beforeReceipt.order.revision },
    });
    assert(receipt.order.documentStatus === '已确认', 'receipt confirmation changed the order lifecycle');
    assert(receipt.order.deliveryProgress.status === '已签收', 'receipt confirmation did not update delivery facts');

    const signedTracking = await request(baseUrl, '/sales/outbound-requests/SR-SMOKE-SIGNED-001');
    let signedTrackingLocked = false;
    try {
      await request(baseUrl, '/sales/outbound-requests/SR-SMOKE-SIGNED-001', {
        method: 'PUT',
        body: { ...signedTracking.request, remark: '不应写入的签收后变更' },
      });
    } catch (error) {
      signedTrackingLocked = String(error).includes('当前状态为已签收') && String(error).includes('变更交付信息');
    }
    assert(signedTrackingLocked, 'signed shipment tracking was still editable');

    const afterSale = await request(baseUrl, '/sales/after-sales', {
      method: 'POST',
      body: {
        code: '系统自动生成',
        sourceOrder: 'SO-SMOKE-SIGNED-001',
        issueType: '包装/标签',
        issueDescription: '客户反馈部分外箱标签破损，需要补寄。',
        action: '补发',
        responsibility: '仓库补寄，销售跟进',
        amountImpact: '无',
        owner: beforeReceipt.order.afterSalesOwner,
        ownerEmployeeCode: beforeReceipt.order.afterSalesOwnerEmployeeCode,
        nextStep: '确认补寄签收',
        date: '2026-07-17',
        products: [{ sourceLineId: 'L1', materialCode: 'M-FG-PLA-175-MBK', name: 'PLA 1.75mm 哑光黑耗材 1kg', qty: '1 卷', uom: '卷' }],
        attachments: [],
      },
    });
    assert(afterSale.record.status === '待受理', 'after-sales document was not persisted');
    assert(afterSale.record.action === '', 'after-sales registration accepted a treatment plan too early');
    const afterSaleWithPlan = await request(baseUrl, `/sales/after-sales/${encodeURIComponent(afterSale.record.code)}`, {
      method: 'PUT',
      body: {
        ...afterSale.record,
        action: '补发',
        goodsDisposition: '无实物退回',
        financialTreatment: '无金额调整',
        amountImpactType: '补发成本',
        estimatedAmount: 20,
        planNote: '仓库补寄，销售跟进。',
      },
    });
    const advanced = await request(baseUrl, `/sales/after-sales/${encodeURIComponent(afterSaleWithPlan.record.code)}/advance`, {
      method: 'POST',
      body: { revision: afterSaleWithPlan.record.revision },
    });
    assert(advanced.record.status === '处理中', 'after-sales status did not advance');
    const voidedAfterSale = await request(baseUrl, `/sales/after-sales/${encodeURIComponent(advanced.record.code)}/void`, {
      method: 'POST',
      body: { revision: advanced.record.revision },
    });
    assert(voidedAfterSale.record.status === '已作废', 'after-sales void action did not accept the latest revision');

    let unsignedBlocked = false;
    try {
      await request(baseUrl, '/sales/after-sales', {
        method: 'POST',
        body: { ...afterSale.record, code: '系统自动生成', sourceOrder: 'SO-20260617-021' },
      });
    } catch (error) {
      unsignedBlocked = String(error).includes('尚无实际出库或签收数量');
    }
    assert(unsignedBlocked, 'unsigned order was allowed to create after-sales');

    console.log('Sales module smoke passed (quote/order boundaries, golden scenarios, delivery, commercial follow-up evidence, receipt lock, after-sales).');
  } catch (error) {
    if (logs.trim()) console.error(logs.trim());
    throw error;
  } finally {
    child.kill();
    await rm(tempDir, { recursive: true, force: true });
  }
}

await main();
