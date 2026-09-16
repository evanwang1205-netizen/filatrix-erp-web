const COMPANY = {
  companyCode: 'COM-FILATRIX',
  company: 'Filatrix 增材材料有限公司',
};

function addMissingByCode(target, rows) {
  const codes = new Set(target.map((row) => row.code));
  rows.forEach((row) => {
    if (!codes.has(row.code)) target.push(row);
  });
}

function mergeFlowRecords(target, additions) {
  Object.entries(additions).forEach(([code, rows]) => {
    if (!Array.isArray(target[code]) || target[code].length === 0) target[code] = rows;
  });
}

const orders = [
  {
    code: 'SO-20260715-022',
    ...COMPANY,
    customerCode: 'CUS-00002',
    customer: '苏州维创三维科技',
    contact: '顾经理',
    contactPhone: '139-0512-8036',
    sourceQuote: 'QT-20260616-019',
    products: [
      {
        lineId: 'L1',
        materialCode: 'M-FG-PETG-175-CLR',
        name: 'PETG 1.75mm 透明耗材 1kg',
        qty: '300 卷',
        unitPrice: '85.00',
        amount: '￥25,500.00',
        uom: '卷',
        imageLabel: 'PETG',
        imageTone: '#dbe8e3',
        fulfillmentLinks: [
          {
            type: '库存预留',
            documentCode: 'RES-SO-20260715-022-L1',
            documentLineId: 'L1',
            qty: '120 卷',
            status: '有效',
            path: '/warehouse/inventory',
          },
          {
            type: '生产任务',
            documentCode: 'PT2-260715-006',
            documentLineId: 'L1',
            qty: '180 卷',
            status: '生产中',
            path: '/production/tasks',
          },
        ],
      },
    ],
    amount: '￥25,500.00',
    owner: '李明',
    priority: '正常',
    documentStatus: '已确认',
    status: '生产中',
    date: '2026-07-15',
    delivery: '2026-07-26',
    deliveryMethod: '送货到厂',
    freightPayer: '客户',
    paymentMethod: '预付款 30%',
    taxMode: '含税',
    taxRate: '13%',
    logisticsMode: '整车货运',
    plannedShipDate: '2026-07-24',
    shipAddress: '江苏省苏州市吴中区兴创路 26 号 2 号仓',
    shipContact: '顾经理',
    shipPhone: '139-0512-8036',
    internalRemark: '现货预留 120 卷，余量由生产任务承接；透明 PETG 按 12 卷/箱包装。',
    productionProgress: { status: '生产中', plannedQty: 180, completedQty: 0 },
    deliveryProgress: { status: '待出库', orderedQty: 300, outboundQty: 0, signedQty: 0 },
    invoiceProgress: { status: '未开票', orderAmount: 25500, invoicedAmount: 0 },
    paymentProgress: { status: '未收款', receivableAmount: 0, settledAmount: 0 },
    attentionFlags: { status: '正常' },
    remark: '用于验证同一订单由库存预留和生产任务共同承接。',
    attachments: [],
  },
  {
    code: 'SO-20260712-018',
    ...COMPANY,
    customerCode: 'CUS-00001',
    customer: '杭州千层增材科技',
    contact: '林经理',
    contactPhone: '138-0571-6218',
    sourceQuote: '',
    products: [
      {
        lineId: 'L1',
        materialCode: 'M-FG-PLA-175-MBK',
        name: 'PLA 1.75mm 哑光黑耗材 1kg',
        qty: '160 卷',
        unitPrice: '69.00',
        amount: '￥11,040.00',
        uom: '卷',
        imageLabel: 'PLA',
        imageTone: '#25272a',
        fulfillmentLinks: [
          {
            type: '销售出库',
            documentCode: 'WS-20260716-004',
            documentLineId: 'L1',
            qty: '80 卷',
            status: '已出库',
            path: '/warehouse/sales-issues/WS-20260716-004',
          },
        ],
      },
    ],
    amount: '￥11,040.00',
    owner: '李明',
    priority: '正常',
    documentStatus: '已确认',
    status: '部分发货',
    date: '2026-07-12',
    delivery: '2026-07-22',
    deliveryMethod: '分批送货',
    freightPayer: '供方',
    paymentMethod: '月结 30 天',
    taxMode: '含税',
    taxRate: '13%',
    logisticsMode: '本厂配送',
    plannedShipDate: '2026-07-16',
    shipAddress: '浙江省杭州市余杭区创景路 88 号 A3 仓',
    shipContact: '林经理',
    shipPhone: '138-0571-6218',
    internalRemark: '首批 80 卷已出库，剩余 80 卷按客户仓位安排第二批发货。',
    productionProgress: { status: '无需生产', plannedQty: 0, completedQty: 0 },
    deliveryProgress: { status: '部分出库', orderedQty: 160, outboundQty: 80, signedQty: 0 },
    invoiceProgress: { status: '未开票', orderAmount: 11040, invoicedAmount: 0 },
    paymentProgress: { status: '未收款', receivableAmount: 0, settledAmount: 0 },
    attentionFlags: { status: '发货逾期' },
    remark: '用于验证分批出库时订单数量、交付进度和剩余待发数量。',
    attachments: [],
  },
  {
    code: 'SO-20260705-011',
    ...COMPANY,
    customerCode: 'CUS-00002',
    customer: '苏州维创三维科技',
    contact: '顾经理',
    contactPhone: '139-0512-8036',
    sourceQuote: '',
    products: [
      {
        lineId: 'L1',
        materialCode: 'M-FG-PETG-175-BLK',
        name: 'PETG 1.75mm 黑色耗材 1kg',
        qty: '30 卷',
        unitPrice: '82.00',
        amount: '￥2,460.00',
        uom: '卷',
        imageLabel: 'PETG',
        imageTone: '#22262b',
        fulfillmentLinks: [
          {
            type: '销售出库',
            documentCode: 'WS-20260707-005',
            documentLineId: 'L1',
            qty: '30 卷',
            status: '已出库',
            path: '/warehouse/sales-issues/WS-20260707-005',
          },
        ],
      },
    ],
    amount: '￥2,460.00',
    owner: '李明',
    priority: '正常',
    documentStatus: '已关闭',
    status: '退货处理中',
    date: '2026-07-05',
    delivery: '2026-07-08',
    deliveryMethod: '送货到厂',
    freightPayer: '供方',
    paymentMethod: '现款',
    taxMode: '含税',
    taxRate: '13%',
    logisticsMode: '第三方物流',
    plannedShipDate: '2026-07-07',
    shipAddress: '江苏省苏州市吴中区兴创路 26 号 2 号仓',
    shipContact: '顾经理',
    shipPhone: '139-0512-8036',
    internalRemark: '订单已完成签收和收款；其中 6 卷进入售后退货退款流程。',
    productionProgress: { status: '无需生产', plannedQty: 0, completedQty: 0 },
    deliveryProgress: { status: '已签收', orderedQty: 30, outboundQty: 30, signedQty: 30 },
    invoiceProgress: { status: '已开票', orderAmount: 2460, invoicedAmount: 2460 },
    paymentProgress: { status: '已收款', receivableAmount: 2460, settledAmount: 2460 },
    attentionFlags: { status: '退货处理中' },
    remark: '用于验证已完成订单进入售后退货退款后的独立状态表达。',
    attachments: [],
  },
];

const outboundRequests = [
  {
    code: 'SR-20260715-003',
    ...COMPANY,
    sourceOrder: 'SO-20260715-022',
    customerCode: 'CUS-00002',
    customer: '苏州维创三维科技',
    contact: '顾经理',
    contactPhone: '139-0512-8036',
    products: [{ sourceLineId: 'L1', materialCode: 'M-FG-PETG-175-CLR', name: 'PETG 1.75mm 透明耗材 1kg', qty: '300 卷', requestQty: '300 卷', uom: '卷' }],
    applicant: '周宁',
    status: '待发货',
    requestDate: '2026-07-15',
    expectedDate: '2026-07-24',
    deliveryDate: '2026-07-26',
    deliveryMethod: '整车货运',
    warehouseCode: 'WH-FG',
    warehouse: '成品仓',
    address: '江苏省苏州市吴中区兴创路 26 号 2 号仓',
    remark: '现货部分已预留，等待生产任务完成后合并发货。',
    attachments: [],
  },
  {
    code: 'SR-20260712-004',
    ...COMPANY,
    sourceOrder: 'SO-20260712-018',
    customerCode: 'CUS-00001',
    customer: '杭州千层增材科技',
    contact: '林经理',
    contactPhone: '138-0571-6218',
    products: [{ sourceLineId: 'L1', materialCode: 'M-FG-PLA-175-MBK', name: 'PLA 1.75mm 哑光黑耗材 1kg', qty: '160 卷', requestQty: '160 卷', uom: '卷' }],
    applicant: '李明',
    status: '部分出库',
    requestDate: '2026-07-12',
    expectedDate: '2026-07-16',
    deliveryDate: '2026-07-22',
    deliveryMethod: '本厂配送',
    warehouseCode: 'WH-FG',
    warehouse: '成品仓',
    address: '浙江省杭州市余杭区创景路 88 号 A3 仓',
    remark: '首批 80 卷已出库，剩余 80 卷待安排。',
    attachments: [],
  },
  {
    code: 'SR-20260705-005',
    ...COMPANY,
    sourceOrder: 'SO-20260705-011',
    customerCode: 'CUS-00002',
    customer: '苏州维创三维科技',
    contact: '顾经理',
    contactPhone: '139-0512-8036',
    products: [{ sourceLineId: 'L1', materialCode: 'M-FG-PETG-175-BLK', name: 'PETG 1.75mm 黑色耗材 1kg', qty: '30 卷', requestQty: '30 卷', uom: '卷' }],
    applicant: '周宁',
    status: '已签收',
    requestDate: '2026-07-05',
    expectedDate: '2026-07-07',
    deliveryDate: '2026-07-08',
    deliveryMethod: '第三方物流',
    warehouseCode: 'WH-FG',
    warehouse: '成品仓',
    address: '江苏省苏州市吴中区兴创路 26 号 2 号仓',
    signedAt: '2026-07-08 15:20',
    signedBy: '周宁',
    remark: '客户已签收 30 卷，后续 6 卷因线径偏差进入售后。',
    attachments: [],
  },
];

const salesIssues = [
  {
    code: 'WS-20260716-004',
    ...COMPANY,
    sourceDoc: 'SR-20260712-004',
    sourceOrder: 'SO-20260712-018',
    customerCode: 'CUS-00001',
    customer: '杭州千层增材科技',
    contact: '林经理',
    contactPhone: '138-0571-6218',
    products: [{ sourceLineId: 'L1', materialCode: 'M-FG-PLA-175-MBK', name: 'PLA 1.75mm 哑光黑耗材 1kg', qty: '80 卷', batch: 'PLA-MBK-260714-A', uom: '卷' }],
    warehouseCode: 'WH-FG',
    warehouse: '成品仓',
    deliveryMethod: '本厂配送',
    owner: '王倩',
    status: '已出库',
    date: '2026-07-16',
    expectedDate: '2026-07-16',
    note: '首批交付 80 卷，保留第二批待发数量。',
  },
  {
    code: 'WS-20260707-005',
    ...COMPANY,
    sourceDoc: 'SR-20260705-005',
    sourceOrder: 'SO-20260705-011',
    customerCode: 'CUS-00002',
    customer: '苏州维创三维科技',
    contact: '顾经理',
    contactPhone: '139-0512-8036',
    products: [{ sourceLineId: 'L1', materialCode: 'M-FG-PETG-175-BLK', name: 'PETG 1.75mm 黑色耗材 1kg', qty: '30 卷', batch: 'PETG-BLK-260713-A', uom: '卷' }],
    warehouseCode: 'WH-FG',
    warehouse: '成品仓',
    deliveryMethod: '第三方物流',
    owner: '王倩',
    status: '已出库',
    date: '2026-07-07',
    expectedDate: '2026-07-07',
    note: '订单全量出库并进入签收追踪。',
  },
];

const afterSales = [
  {
    code: 'SA-20260716-002',
    ...COMPANY,
    sourceOrder: 'SO-20260705-011',
    customerCode: 'CUS-00002',
    customer: '苏州维创三维科技',
    contact: '顾经理',
    contactPhone: '139-0512-8036',
    issueType: '质量问题',
    issueDescription: '客户反馈 6 卷 PETG 黑色耗材线径偏差，检测记录已确认超出约定公差。',
    action: '退货退款',
    responsibility: '质量复核，仓库收回，财务退款',
    amountImpact: '预计退款 ￥492.00',
    processingResult: '',
    confirmationNote: '',
    owner: '李明',
    status: '处理中',
    nextStep: '等待仓库确认退回批次',
    date: '2026-07-16',
    sourceStatus: '已关闭',
    sourceAmount: '￥2,460.00',
    sourceDate: '2026-07-05',
    sourceDueDate: '2026-07-08',
    sourceRemark: '用于验证已完成订单进入售后退货退款后的独立状态表达。',
    products: [{ sourceLineId: 'L1', materialCode: 'M-FG-PETG-175-BLK', name: 'PETG 1.75mm 黑色耗材 1kg', qty: '6 卷', sourceQty: '30 卷', uom: '卷' }],
    attachments: [{ name: 'PETG线径检测记录-SA20260716.pdf', size: '580 KB', uploader: '周宁', date: '2026-07-16' }],
  },
];

const salesInvoices = [
  {
    code: 'SI-20260717-003',
    ...COMPANY,
    sourceDoc: 'SO-20260715-022',
    sourceOrder: 'SO-20260715-022',
    partyCode: 'CUS-00002',
    party: '苏州维创三维科技',
    contact: '顾经理',
    contactPhone: '139-0512-8036',
    amount: '￥9,026.55',
    taxAmount: '￥1,173.45',
    totalAmount: '￥10,200.00',
    settledAmount: '￥0.00',
    owner: '赵敏',
    status: '待开票',
    date: '2026-07-17',
    dueDate: '2026-08-16',
    invoiceType: '增值税专用发票',
    paymentMethod: '预付款 30%',
    bankAccount: 'Filatrix 对公收款账户',
    lines: [{ lineId: 'L1', sourceOrder: 'SO-20260715-022', sourceLineId: 'L1', materialCode: 'M-FG-PETG-175-CLR', name: 'PETG 1.75mm 透明耗材 1kg', qty: '120 卷', unitPrice: '85.00', amount: '￥10,200.00', taxRate: '13%', uom: '卷' }],
    note: '按已预留现货 120 卷建立待开票任务，尚未确认开具。',
  },
  {
    code: 'SI-20260717-002',
    ...COMPANY,
    sourceDoc: 'SO-20260712-018',
    sourceOrder: 'SO-20260712-018',
    partyCode: 'CUS-00001',
    party: '杭州千层增材科技',
    contact: '林经理',
    contactPhone: '138-0571-6218',
    amount: '￥4,884.96',
    taxAmount: '￥635.04',
    totalAmount: '￥5,520.00',
    settledAmount: '￥2,000.00',
    owner: '赵敏',
    status: '部分收款',
    date: '2026-07-17',
    dueDate: '2026-08-16',
    invoiceType: '增值税专用发票',
    paymentMethod: '月结 30 天',
    bankAccount: 'Filatrix 对公收款账户',
    lines: [{ lineId: 'L1', sourceOrder: 'SO-20260712-018', sourceLineId: 'L1', materialCode: 'M-FG-PLA-175-MBK', name: 'PLA 1.75mm 哑光黑耗材 1kg', qty: '80 卷', unitPrice: '69.00', amount: '￥5,520.00', taxRate: '13%', uom: '卷' }],
    note: '首批 80 卷已开票，客户先支付 2,000 元，余款按账期收取。',
  },
  {
    code: 'SI-20260708-006',
    ...COMPANY,
    sourceDoc: 'SO-20260705-011',
    sourceOrder: 'SO-20260705-011',
    partyCode: 'CUS-00002',
    party: '苏州维创三维科技',
    contact: '顾经理',
    contactPhone: '139-0512-8036',
    amount: '￥2,176.99',
    taxAmount: '￥283.01',
    totalAmount: '￥2,460.00',
    settledAmount: '￥2,460.00',
    owner: '赵敏',
    status: '已收款',
    date: '2026-07-08',
    dueDate: '2026-07-08',
    invoiceType: '增值税专用发票',
    paymentMethod: '现款',
    bankAccount: '',
    lines: [{ lineId: 'L1', sourceOrder: 'SO-20260705-011', sourceLineId: 'L1', materialCode: 'M-FG-PETG-175-BLK', name: 'PETG 1.75mm 黑色耗材 1kg', qty: '30 卷', unitPrice: '82.00', amount: '￥2,460.00', taxRate: '13%', uom: '卷' }],
    note: '客户签收后全额开票，售后退款完成后再生成退款凭据。',
  },
];

const receivables = [
  {
    code: 'AR-20260717-002',
    ...COMPANY,
    sourceDoc: 'SI-20260717-002',
    sourceOrder: 'SO-20260712-018',
    partyCode: 'CUS-00001',
    party: '杭州千层增材科技',
    contact: '林经理',
    contactPhone: '138-0571-6218',
    amount: '￥4,884.96',
    taxAmount: '￥635.04',
    totalAmount: '￥5,520.00',
    settledAmount: '￥2,000.00',
    owner: '赵敏',
    status: '部分收款',
    date: '2026-07-17',
    dueDate: '2026-08-16',
    invoiceType: '应收账款',
    paymentMethod: '月结 30 天',
    bankAccount: 'Filatrix 对公收款账户',
    lines: [{ lineId: 'L1', sourceOrder: 'SO-20260712-018', sourceLineId: 'L1', materialCode: 'M-FG-PLA-175-MBK', name: 'PLA 1.75mm 哑光黑耗材 1kg', qty: '80 卷', unitPrice: '69.00', amount: '￥5,520.00', taxRate: '13%', uom: '卷' }],
    note: '已到账 2,000 元，剩余 3,520 元继续按本应收登记。',
  },
  {
    code: 'AR-20260708-006',
    ...COMPANY,
    sourceDoc: 'SI-20260708-006',
    sourceOrder: 'SO-20260705-011',
    partyCode: 'CUS-00002',
    party: '苏州维创三维科技',
    contact: '顾经理',
    contactPhone: '139-0512-8036',
    amount: '￥2,176.99',
    taxAmount: '￥283.01',
    totalAmount: '￥2,460.00',
    settledAmount: '￥2,460.00',
    owner: '赵敏',
    status: '已收款',
    date: '2026-07-08',
    dueDate: '2026-07-08',
    invoiceType: '应收账款',
    paymentMethod: '现款',
    bankAccount: '',
    lines: [{ lineId: 'L1', sourceOrder: 'SO-20260705-011', sourceLineId: 'L1', materialCode: 'M-FG-PETG-175-BLK', name: 'PETG 1.75mm 黑色耗材 1kg', qty: '30 卷', unitPrice: '82.00', amount: '￥2,460.00', taxRate: '13%', uom: '卷' }],
    note: '订单已全额收款，当前售后预计退款 6 卷货款。',
  },
];

export function applySalesGoldenScenarios(data) {
  data.sales ||= {};
  data.sales.orders ||= [];
  data.sales.orderFlowRecords ||= {};
  data.sales.outboundRequests ||= [];
  data.sales.outboundRequestFlowRecords ||= {};
  data.sales.afterSales ||= [];
  data.sales.afterSalesFlowRecords ||= {};
  data.warehouse ||= {};
  data.warehouse.salesIssues ||= [];
  data.warehouse.salesIssueFlowRecords ||= {};
  data.finance ||= {};
  data.finance.salesInvoices ||= [];
  data.finance.receivables ||= [];
  data.finance.receivablePayments ||= {};
  data.finance.salesInvoiceFlowRecords ||= {};
  data.finance.receivableFlowRecords ||= {};

  addMissingByCode(data.sales.orders, orders);
  addMissingByCode(data.sales.outboundRequests, outboundRequests);
  addMissingByCode(data.sales.afterSales, afterSales);
  addMissingByCode(data.warehouse.salesIssues, salesIssues);
  addMissingByCode(data.finance.salesInvoices, salesInvoices);
  addMissingByCode(data.finance.receivables, receivables);

  if (!Array.isArray(data.finance.receivablePayments['AR-20260708-006'])) {
    data.finance.receivablePayments['AR-20260708-006'] = [
      { code: 'RCV-20260708-006', receivableCode: 'AR-20260708-006', sourceOrder: 'SO-20260705-011', amount: 2460, date: '2026-07-08', method: '银行转账', actor: '赵敏', idempotencyKey: 'seed-so-20260705-011-payment', createdAt: '2026-07-08 16:40' },
    ];
  }
  if (!Array.isArray(data.finance.receivablePayments['AR-20260717-002'])) {
    data.finance.receivablePayments['AR-20260717-002'] = [
      { code: 'RCV2-20260717-001', receivableCode: 'AR-20260717-002', sourceInvoice: 'SI-20260717-002', sourceOrder: 'SO-20260712-018', direction: '收款', amount: '￥2,000.00', transactionDate: '2026-07-17', method: '银行转账', account: 'Filatrix 对公收款账户', reference: 'BANK-RCV-260717-001', note: '客户支付首笔货款。', actor: '赵敏', idempotencyKey: 'seed-ar-20260717-002-payment-1', createdAt: '2026-07-17 11:20' },
    ];
  }

  mergeFlowRecords(data.sales.orderFlowRecords, {
    'SO-20260715-022': [
      { time: '2026-07-15 09:40', actor: '李明', action: '确认订单', remark: '确认 300 卷透明 PETG 订单。' },
      { time: '2026-07-15 10:05', actor: '李明', action: '分配交付来源', remark: '库存预留 120 卷，生产任务承接 180 卷。' },
    ],
    'SO-20260712-018': [
      { time: '2026-07-12 14:10', actor: '李明', action: '确认订单', remark: '客户确认 160 卷分批交付。' },
      { time: '2026-07-16 16:20', actor: '王倩', action: '首批出库', remark: 'WS-20260716-004 已出库 80 卷。' },
    ],
    'SO-20260705-011': [
      { time: '2026-07-05 11:30', actor: '李明', action: '确认订单', remark: '确认 30 卷 PETG 黑色耗材订单。' },
      { time: '2026-07-08 15:20', actor: '李明', action: '确认签收', remark: '客户已签收全部 30 卷。' },
      { time: '2026-07-16 10:15', actor: '李明', action: '登记售后', remark: '其中 6 卷进入退货退款流程。' },
    ],
  });
  mergeFlowRecords(data.sales.outboundRequestFlowRecords, {
    'SR-20260715-003': [{ time: '2026-07-15 10:06', actor: '系统', action: '生成交付追踪', remark: '等待库存与生产共同备货。' }],
    'SR-20260712-004': [{ time: '2026-07-16 16:20', actor: '王倩', action: '部分出库', remark: '首批出库 80 卷，剩余 80 卷。' }],
    'SR-20260705-005': [{ time: '2026-07-08 15:20', actor: '李明', action: '确认客户签收', remark: '客户签收全部 30 卷。' }],
  });
  mergeFlowRecords(data.sales.afterSalesFlowRecords, {
    'SA-20260716-002': [
      { time: '2026-07-16 10:15', actor: '李明', action: '登记销售售后', remark: '客户反馈 6 卷 PETG 线径偏差。' },
      { time: '2026-07-16 14:20', actor: '林珊', action: '确认退货退款', remark: '同意退回问题批次并按 6 卷退款。' },
    ],
  });
  mergeFlowRecords(data.warehouse.salesIssueFlowRecords, {
    'WS-20260716-004': [{ time: '2026-07-16 16:20', actor: '王倩', action: '确认出库', remark: '首批 80 卷完成复核并出库。' }],
    'WS-20260707-005': [{ time: '2026-07-07 15:10', actor: '王倩', action: '确认出库', remark: '30 卷 PETG 黑色耗材完成出库。' }],
  });
  mergeFlowRecords(data.finance.salesInvoiceFlowRecords, {
    'SI-20260717-003': [{ time: '2026-07-17 14:20', actor: '赵敏', action: '保存销售发票', remark: '按销售订单首批 120 卷保存待开票草稿。' }],
    'SI-20260717-002': [
      { time: '2026-07-17 10:45', actor: '赵敏', action: '确认销售发票', remark: 'SO-20260712-018 首批 80 卷已开票。' },
      { time: '2026-07-17 11:20', actor: '赵敏', action: '收款进度更新', remark: 'AR-20260717-002 本次收款 ￥2,000.00。' },
    ],
    'SI-20260708-006': [{ time: '2026-07-08 16:10', actor: '赵敏', action: '确认销售发票', remark: 'SO-20260705-011 已全额开票。' }],
  });
  mergeFlowRecords(data.finance.receivableFlowRecords, {
    'AR-20260717-002': [
      { time: '2026-07-17 10:45', actor: '系统', action: '生成应收账款', remark: '由销售发票 SI-20260717-002 自动生成。' },
      { time: '2026-07-17 11:20', actor: '赵敏', action: '登记收款', remark: '本次收款 ￥2,000.00，剩余 ￥3,520.00。' },
    ],
    'AR-20260708-006': [
      { time: '2026-07-08 16:10', actor: '系统', action: '生成应收账款', remark: '由销售发票 SI-20260708-006 自动生成。' },
      { time: '2026-07-08 16:40', actor: '赵敏', action: '登记收款', remark: '已全额收款 ￥2,460.00。' },
    ],
  });

  return data;
}
