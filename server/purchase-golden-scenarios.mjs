const company = {
  companyCode: 'COM-FILATRIX',
  company: 'Filatrix 增材材料有限公司',
};

function addMissingByCode(target, rows) {
  const codes = new Set(target.map((row) => row.code));
  rows.forEach((row) => {
    if (!codes.has(row.code)) target.push(row);
  });
}

function ensureObject(target, key) {
  target[key] ||= {};
  return target[key];
}

export function applyPurchaseGoldenScenarios(data) {
  data.purchase ||= {};
  data.purchase.requisitions ||= [];
  data.purchase.orders ||= [];
  data.purchase.afterSales ||= [];
  data.purchase.requisitionFlowRecords ||= {};
  data.purchase.orderFlowRecords ||= {};
  data.purchase.afterSalesFlowRecords ||= {};

  data.warehouse ||= {};
  data.warehouse.purchaseReceipts ||= [];
  data.warehouse.receiptFlowRecords ||= {};

  data.quality ||= {};
  data.quality.incomingDocuments ||= [];
  data.quality.incomingDecisions ||= {};
  data.quality.incomingDecisionHistory ||= {};
  data.quality.incomingDispositions ||= {};
  data.quality.incomingReinspections ||= {};
  data.quality.incomingReturnDocuments ||= [];
  data.quality.incomingFlowRecords ||= {};

  data.finance ||= {};
  data.finance.purchaseInvoices ||= [];
  data.finance.payables ||= [];
  data.finance.payablePayments ||= {};
  data.finance.invoiceFlowRecords ||= {};
  data.finance.payableFlowRecords ||= {};

  const plaLine = {
    lineId: 'L1',
    materialCode: 'M-RM-PLA-VIRGIN',
    name: 'PLA 原生粒子',
    model: 'PLA-4032D',
    spec: '挤出级，高流动，高透明',
    qty: '2500',
    unitPrice: '12.60',
    amount: '￥31,500.00',
    qcRequired: true,
    uom: 'kg',
  };
  const petgLine = {
    lineId: 'L1',
    materialCode: 'M-RM-PETG-VIRGIN',
    name: 'PETG 原生粒子',
    model: 'PETG-T110',
    spec: '挤出级，高透明，高韧性',
    qty: '1800',
    unitPrice: '10.80',
    amount: '￥19,440.00',
    qcRequired: true,
    uom: 'kg',
  };
  const matteLine = {
    lineId: 'L1',
    materialCode: 'M-CM-MATTE-BLK',
    name: '哑光黑色母',
    model: 'MB-MATTE-BLK',
    spec: '哑光黑，耐温 220℃',
    qty: '300',
    unitPrice: '28.00',
    amount: '￥8,400.00',
    qcRequired: true,
    uom: 'kg',
  };

  addMissingByCode(data.purchase.requisitions, [
    {
      code: 'PR-20260717-002',
      ...company,
      purchaseType: '物料采购',
      department: '生产管理部',
      requester: '周宁',
      reason: '零售耗材包装排产增加，补充 1kg 线盘和真空包装袋，避免包装工位待料。',
      products: [
        { lineId: 'L1', materialCode: 'M-PKG-SPOOL-1KG', name: '小盘线轴 1kg', model: 'SPOOL-1KG', spec: '外径 200mm，黑色可回收线盘', qty: '3000', qcRequired: true, uom: '个' },
        { lineId: 'L2', materialCode: 'M-PKG-VAC-BAG-1KG', name: '真空包装袋 1kg', model: 'VAC-BAG-1KG', spec: '尼龙复合袋，适配 1kg 线盘', qty: '5000', qcRequired: true, uom: '个' },
      ],
      status: '待采购受理',
      date: '2026-07-17',
      expectedDate: '2026-07-25',
      attachments: [],
    },
    {
      code: 'PR-20260716-003',
      ...company,
      purchaseType: '物料采购',
      department: '生产管理部',
      requester: '周宁',
      reason: 'PLA 珍珠白排产缺料，需在下一批生产释放前补齐原料与色母。',
      products: [
        { ...plaLine, unitPrice: undefined, amount: undefined },
        { lineId: 'L2', materialCode: 'M-CM-PEARL-WHT', name: '珍珠白色母', model: 'MB-PEARL-WHT', spec: '珠光白，耐温 220℃', qty: '90', qcRequired: true, uom: 'kg' },
      ],
      status: '待采购受理',
      date: '2026-07-16',
      expectedDate: '2026-07-24',
      attachments: [],
    },
  ]);

  addMissingByCode(data.purchase.orders, [
    {
      code: 'PO-20260716-005',
      ...company,
      purchaseType: '物料采购',
      supplierCode: 'SUP-JXJC',
      supplier: '嘉兴聚材高分子',
      contact: '李经理',
      contactPhone: '136-0000-7108',
      sourceRequisition: 'PR-20260716-003',
      sourceRequisitions: ['PR-20260716-003'],
      products: [{ ...plaLine, sourceRequisition: 'PR-20260716-003', sourceLineId: 'L1' }],
      amount: '￥31,500.00',
      owner: '陈晨',
      status: '已确认',
      date: '2026-07-16',
      expectedDate: '2026-07-24',
      deliveryMethod: '供应商送货',
      paymentMethod: '月结 30 天',
      freightPayer: '供方',
      taxMode: '含税',
      taxRate: '13%',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      receivingAddress: '滨江区江南大道 1688 号 2 号仓库',
      receivingContact: '王倩',
      receivingPhone: '138-0000-5216',
      remark: '每批提供 COA；到货后按批次抽检熔指、水分和色差。',
      attachments: [],
    },
    {
      code: 'PO-20260710-004',
      ...company,
      purchaseType: '物料采购',
      supplierCode: 'SUP-JXJC',
      supplier: '嘉兴聚材高分子',
      contact: '李经理',
      contactPhone: '136-0000-7108',
      sourceRequisition: '',
      products: [petgLine],
      amount: '￥19,440.00',
      owner: '陈晨',
      status: '已确认',
      date: '2026-07-10',
      expectedDate: '2026-07-18',
      deliveryMethod: '供应商送货',
      paymentMethod: '月结 30 天',
      freightPayer: '供方',
      taxMode: '含税',
      taxRate: '13%',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      receivingAddress: '滨江区江南大道 1688 号 2 号仓库',
      receivingContact: '王倩',
      receivingPhone: '138-0000-5216',
      remark: '首批 1000kg 已到货，剩余 800kg 等待供应商排车。',
      attachments: [],
    },
    {
      code: 'PO-20260625-009',
      ...company,
      purchaseType: '物料采购',
      supplierCode: 'SUP-SZCS',
      supplier: '苏州彩塑科技',
      contact: '王经理',
      contactPhone: '139-0000-8126',
      sourceRequisition: '',
      products: [matteLine],
      amount: '￥8,400.00',
      owner: '陈晨',
      status: '已关闭',
      date: '2026-06-25',
      expectedDate: '2026-07-02',
      deliveryMethod: '物流配送',
      paymentMethod: '验收后付款',
      freightPayer: '供方',
      taxMode: '含税',
      taxRate: '13%',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      receivingAddress: '滨江区江南大道 1688 号 2 号仓库',
      receivingContact: '王倩',
      receivingPhone: '138-0000-5216',
      remark: '已完成来料检验、入库、收票与付款。',
      attachments: [],
    },
  ]);

  const partialDecision = {
    code: 'IQ-20260712-001',
    sourceDoc: 'WR-20260712-001',
    status: '部分判定',
    version: 1,
    totals: { received: 1000, accepted: 650, concession: 0, rejected: 80, pending: 270, released: 650 },
    lines: [{ receiptLineId: 'L1', materialCode: 'M-RM-PETG-VIRGIN', name: 'PETG 原生粒子', receivedQty: 1000, acceptedQty: 650, concessionQty: 0, rejectedQty: 80, pendingQty: 270, releasedQty: 650, uom: 'kg' }],
    conclusion: '首批已判定 730kg；其中 80kg 水分偏高隔离，270kg 等待复检。',
    actor: '林珊',
    decidedAt: '2026-07-12 14:20',
  };
  const completedDecision = {
    code: 'IQ-20260702-001',
    sourceDoc: 'WR-20260702-001',
    status: '合格',
    version: 1,
    totals: { received: 300, accepted: 300, concession: 0, rejected: 0, pending: 0, released: 300 },
    lines: [{ receiptLineId: 'L1', materialCode: 'M-CM-MATTE-BLK', name: '哑光黑色母', receivedQty: 300, acceptedQty: 300, concessionQty: 0, rejectedQty: 0, pendingQty: 0, releasedQty: 300, uom: 'kg' }],
    conclusion: '外观、分散性和耐温抽检合格。',
    actor: '林珊',
    decidedAt: '2026-07-02 15:10',
  };
  const plaPartialDecision = {
    code: 'IQ-20260717-003',
    sourceDoc: 'WR-20260717-003',
    status: '合格',
    version: 1,
    totals: { received: 600, accepted: 600, concession: 0, rejected: 0, pending: 0, released: 600 },
    lines: [{ receiptLineId: 'L1', materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', receivedQty: 600, acceptedQty: 600, concessionQty: 0, rejectedQty: 0, pendingQty: 0, releasedQty: 600, uom: 'kg' }],
    conclusion: '首批 600kg 水分、熔指和外观检验合格，准予入库。',
    actor: '林珊',
    decidedAt: '2026-07-17 11:10',
  };

  addMissingByCode(data.warehouse.purchaseReceipts, [
    {
      code: 'WR-20260712-001',
      ...company,
      sourceDoc: 'PO-20260710-004',
      supplierCode: 'SUP-JXJC',
      supplier: '嘉兴聚材高分子',
      contact: '李经理',
      contactPhone: '136-0000-7108',
      products: [{ ...petgLine, qty: '1000', unitPrice: undefined, amount: undefined, batch: 'PETG-260712-A', destinationWarehouseCode: '', destinationWarehouse: '', destinationLocation: '' }],
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      location: 'QC-AUTO',
      owner: '王倩',
      status: '待质检',
      date: '2026-07-12',
      expectedDate: '2026-07-12',
      note: '首批到货 1000kg，按批次进入待检暂存。',
      stockStage: 'qc_hold',
      qualityDecision: partialDecision,
      attachments: [],
    },
    {
      code: 'WR-20260702-001',
      ...company,
      sourceDoc: 'PO-20260625-009',
      supplierCode: 'SUP-SZCS',
      supplier: '苏州彩塑科技',
      contact: '王经理',
      contactPhone: '139-0000-8126',
      products: [{ ...matteLine, unitPrice: undefined, amount: undefined, batch: 'MB-MBK-260702-A', destinationWarehouseCode: 'WH-RM', destinationWarehouse: '原料仓', destinationLocation: 'RM-02-05' }],
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      location: 'QC-AUTO',
      owner: '王倩',
      status: '已入库',
      date: '2026-07-02',
      expectedDate: '2026-07-02',
      note: '到货质检合格后已完成入库过账。',
      stockStage: 'posted',
      qualityDecision: completedDecision,
      postedQuantities: { total: 300, lines: [{ receiptLineId: 'L1', postedQty: 300, uom: 'kg', warehouseCode: 'WH-RM', warehouse: '原料仓', location: 'RM-02-05' }] },
      attachments: [],
    },
    {
      code: 'WR-20260717-003',
      ...company,
      sourceDoc: 'PO-20260716-005',
      supplierCode: 'SUP-JXJC',
      supplier: '嘉兴聚材高分子',
      contact: '李经理',
      contactPhone: '136-0000-7108',
      products: [{ ...plaLine, qty: '600', unitPrice: undefined, amount: undefined, batch: 'PLA-260717-A', destinationWarehouseCode: 'WH-RM', destinationWarehouse: '原料仓', destinationLocation: 'RM-01-01' }],
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      location: 'QC-AUTO',
      owner: '王倩',
      status: '已入库',
      date: '2026-07-17',
      expectedDate: '2026-07-17',
      note: 'PLA 原生粒子首批到货 600kg，来料检验合格后正式入库。',
      stockStage: 'posted',
      qualityDecision: plaPartialDecision,
      postedQuantities: { total: 600, lines: [{ receiptLineId: 'L1', postedQty: 600, uom: 'kg', warehouseCode: 'WH-RM', warehouse: '原料仓', location: 'RM-01-01' }] },
      attachments: [],
    },
  ]);

  addMissingByCode(data.quality.incomingDocuments, [
    { code: 'IQ-20260712-001', sourceDoc: 'WR-20260712-001', status: '部分判定', version: 1, updatedAt: '2026-07-12 14:20' },
    { code: 'IQ-20260702-001', sourceDoc: 'WR-20260702-001', status: '合格', version: 1, updatedAt: '2026-07-02 15:10' },
    { code: 'IQ-20260717-003', sourceDoc: 'WR-20260717-003', status: '合格', version: 1, updatedAt: '2026-07-17 11:10' },
  ]);
  data.quality.incomingDecisions['IQ-20260712-001'] ||= partialDecision;
  data.quality.incomingDecisions['IQ-20260702-001'] ||= completedDecision;
  data.quality.incomingDecisions['IQ-20260717-003'] ||= plaPartialDecision;

  addMissingByCode(data.purchase.afterSales, [
    {
      code: 'PA-20260712-001',
      ...company,
      sourceOrder: 'PO-20260710-004',
      supplierCode: 'SUP-JXJC',
      supplier: '嘉兴聚材高分子',
      contact: '李经理',
      contactPhone: '136-0000-7108',
      issueType: '来料质量',
      issueDescription: '首批到货中 80kg 水分偏高，已按来料质检结果隔离，等待复检和供应商处置。',
      action: '补发',
      responsibility: '采购跟进供应商，质检负责复检，仓库保持隔离',
      amountImpact: '￥864.00 暂停结算',
      processingResult: '',
      confirmationNote: '',
      owner: '陈晨',
      status: '处理中',
      nextStep: '确认复检结论和供应商补发日期',
      date: '2026-07-12',
      sourceStatus: '已确认',
      sourceAmount: '￥19,440.00',
      sourceDate: '2026-07-10',
      sourceDueDate: '2026-07-18',
      sourceRemark: '首批 1000kg 到货，80kg 水分偏高已隔离。',
      products: [{ ...petgLine, sourceLineId: 'L1', qty: '80 kg', sourceQty: petgLine.qty, unitPrice: undefined, amount: undefined }],
      attachments: [],
    },
  ]);

  addMissingByCode(data.finance.purchaseInvoices, [
    {
      code: 'PI-20260717-005',
      ...company,
      sourceDoc: 'WR-20260712-001',
      sourceOrder: 'PO-20260710-004',
      partyCode: 'SUP-JXJC',
      party: '嘉兴聚材高分子',
      contact: '李经理',
      contactPhone: '136-0000-7108',
      amount: '￥6,212.39',
      taxAmount: '￥807.61',
      totalAmount: '￥7,020.00',
      settledAmount: '￥0.00',
      owner: '王倩',
      status: '待收票',
      date: '2026-07-17',
      dueDate: '2026-08-16',
      invoiceType: '增值税专用发票',
      paymentMethod: '月结 30 天',
      bankAccount: '',
      lines: [{ ...petgLine, qty: '650', amount: '￥7,020.00', sourceOrder: 'PO-20260710-004', sourceLineId: 'L1', sourceReceiptLineId: 'L1', taxRate: '13%' }],
      note: '供应商发票已到，首批物料尚未完成正式入库，暂不能确认收票。',
    },
    {
      code: 'PI-20260717-004',
      ...company,
      sourceDoc: 'WR-20260717-003',
      sourceOrder: 'PO-20260716-005',
      partyCode: 'SUP-JXJC',
      party: '嘉兴聚材高分子',
      contact: '李经理',
      contactPhone: '136-0000-7108',
      amount: '￥6,690.27',
      taxAmount: '￥869.73',
      totalAmount: '￥7,560.00',
      settledAmount: '￥2,500.00',
      owner: '王倩',
      status: '部分付款',
      date: '2026-07-17',
      dueDate: '2026-08-16',
      invoiceType: '增值税专用发票',
      paymentMethod: '月结 30 天',
      bankAccount: '',
      lines: [{ ...plaLine, qty: '600', amount: '￥7,560.00', sourceOrder: 'PO-20260716-005', sourceLineId: 'L1', sourceReceiptLineId: 'L1', taxRate: '13%' }],
      note: '首批 600kg 已正式入库并收票；已支付预付款，余款按账期支付。',
    },
    {
      code: 'PI-20260703-001',
      ...company,
      sourceDoc: 'WR-20260702-001',
      sourceOrder: 'PO-20260625-009',
      partyCode: 'SUP-SZCS',
      party: '苏州彩塑科技',
      contact: '王经理',
      contactPhone: '139-0000-8126',
      amount: '￥7,433.63',
      taxAmount: '￥966.37',
      totalAmount: '￥8,400.00',
      settledAmount: '￥8,400.00',
      owner: '王倩',
      status: '已付款',
      date: '2026-07-03',
      dueDate: '2026-07-10',
      invoiceType: '增值税专用发票',
      paymentMethod: '验收后付款',
      bankAccount: '',
      lines: [{ ...matteLine, sourceOrder: 'PO-20260625-009', sourceLineId: 'L1', taxRate: '13%' }],
      note: '采购订单全额收票。',
    },
  ]);
  addMissingByCode(data.finance.payables, [
    {
      code: 'AP-20260717-004',
      ...company,
      sourceDoc: 'PI-20260717-004',
      sourceOrder: 'PO-20260716-005',
      partyCode: 'SUP-JXJC',
      party: '嘉兴聚材高分子',
      contact: '李经理',
      contactPhone: '136-0000-7108',
      amount: '￥6,690.27',
      taxAmount: '￥869.73',
      totalAmount: '￥7,560.00',
      settledAmount: '￥2,500.00',
      owner: '王倩',
      status: '部分付款',
      date: '2026-07-17',
      dueDate: '2026-08-16',
      invoiceType: '应付账款',
      paymentMethod: '月结 30 天',
      bankAccount: '',
      lines: [{ ...plaLine, qty: '600', amount: '￥7,560.00', sourceOrder: 'PO-20260716-005', sourceLineId: 'L1', sourceReceiptLineId: 'L1', taxRate: '13%' }],
      note: '由采购发票 PI-20260717-004 生成，已部分付款。',
    },
    {
      code: 'AP-20260703-001',
      ...company,
      sourceDoc: 'PI-20260703-001',
      sourceOrder: 'PO-20260625-009',
      partyCode: 'SUP-SZCS',
      party: '苏州彩塑科技',
      contact: '王经理',
      contactPhone: '139-0000-8126',
      amount: '￥7,433.63',
      taxAmount: '￥966.37',
      totalAmount: '￥8,400.00',
      settledAmount: '￥8,400.00',
      owner: '王倩',
      status: '已付款',
      date: '2026-07-03',
      dueDate: '2026-07-10',
      invoiceType: '应付账款',
      paymentMethod: '验收后付款',
      bankAccount: '',
      lines: [{ ...matteLine, sourceOrder: 'PO-20260625-009', sourceLineId: 'L1', taxRate: '13%' }],
      note: '由采购发票 PI-20260703-001 生成并完成付款。',
    },
  ]);
  data.finance.payablePayments['AP-20260717-004'] ||= [
    {
      code: 'PAY2-20260717-001',
      payableCode: 'AP-20260717-004',
      sourceInvoice: 'PI-20260717-004',
      sourceOrder: 'PO-20260716-005',
      direction: '付款',
      amount: '￥2,500.00',
      transactionDate: '2026-07-17',
      method: '银行转账',
      account: '基本户',
      reference: 'BANK-260717-0250',
      note: '首批货款部分支付。',
      actor: '王倩',
      idempotencyKey: 'GOLDEN-PAY-20260717-001',
      createdAt: '2026-07-17 15:20',
    },
  ];

  const requisitionFlows = ensureObject(data.purchase, 'requisitionFlowRecords');
  requisitionFlows['PR-20260717-002'] ||= [
    { time: '2026-07-17 09:10', actor: '周宁', action: '提交采购受理', remark: '提交 1kg 线盘与真空包装袋补料需求。' },
  ];
  requisitionFlows['PR-20260716-003'] ||= [
    { time: '2026-07-16 08:40', actor: '周宁', action: '提交采购受理', remark: 'PLA 珍珠白排产缺料，申请采购原料与色母。' },
    { time: '2026-07-16 10:10', actor: '陈晨', action: '生成采购订单', remark: '已生成 PO-20260716-005；珍珠白色母将与其他需求合并采购。' },
  ];
  data.purchase.orderFlowRecords['PO-20260710-004'] ||= [
    { time: '2026-07-10 11:15', actor: '陈晨', action: '确认采购订单', remark: '供应商承诺分两批交付 1800kg PETG 原生粒子。' },
    { time: '2026-07-12 11:05', actor: '王倩', action: '首批到货', remark: 'WR-20260712-001 登记首批到货 1000kg。' },
    { time: '2026-07-12 14:20', actor: '林珊', action: '部分判定', remark: '650kg 放行，80kg 隔离，270kg 待复检。' },
  ];
  data.purchase.afterSalesFlowRecords['PA-20260712-001'] ||= [
    { time: '2026-07-12 15:00', actor: '陈晨', action: '登记采购售后', remark: '80kg 来料水分偏高，暂停结算并通知供应商。' },
    { time: '2026-07-13 09:30', actor: '陈晨', action: '受理售后', remark: '供应商同意等待复检结论后补发或折让。' },
  ];
  data.warehouse.receiptFlowRecords['WR-20260712-001'] ||= [
    { time: '2026-07-12 11:05', actor: '王倩', action: '登记到货', remark: '首批 PETG 原生粒子 1000kg 进入待检暂存。' },
  ];
  data.warehouse.receiptFlowRecords['WR-20260717-003'] ||= [
    { time: '2026-07-17 09:45', actor: '王倩', action: '登记到货', remark: 'PLA 原生粒子首批到货 600kg。' },
    { time: '2026-07-17 11:20', actor: '王倩', action: '正式入库', remark: '来料检验合格，600kg 已正式入原料仓。' },
  ];
  data.quality.incomingFlowRecords['IQ-20260712-001'] ||= [
    { time: '2026-07-12 14:20', actor: '林珊', action: '部分判定', remark: '650kg 合格放行，80kg 不合格隔离，270kg 待复检。' },
  ];
  data.quality.incomingFlowRecords['IQ-20260717-003'] ||= [
    { time: '2026-07-17 11:10', actor: '林珊', action: '检验合格', remark: '600kg 水分、熔指和外观检验合格，准予入库。' },
  ];
  data.finance.invoiceFlowRecords['PI-20260717-004'] ||= [
    { time: '2026-07-17 14:30', actor: '王倩', action: '确认收票', remark: '采购订单、正式入库与供应商发票核对一致。' },
    { time: '2026-07-17 15:20', actor: '王倩', action: '付款进度更新', remark: '登记付款 ￥2,500.00，发票进入部分付款。' },
  ];
  data.finance.invoiceFlowRecords['PI-20260717-005'] ||= [
    { time: '2026-07-17 16:10', actor: '王倩', action: '保存采购发票', remark: '供应商发票已登记；等待采购收货完成正式入库后再确认收票。' },
  ];
  data.finance.payableFlowRecords['AP-20260717-004'] ||= [
    { time: '2026-07-17 14:30', actor: '王倩', action: '生成应付款', remark: '由采购发票 PI-20260717-004 生成应付款。' },
    { time: '2026-07-17 15:20', actor: '王倩', action: '登记付款', remark: '本次付款 ￥2,500.00，累计 ￥2,500.00。' },
  ];

  return data;
}
