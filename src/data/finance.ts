export type FinanceTabKey = 'salesInvoices' | 'purchaseInvoices' | 'receivables' | 'payables';

export type FinanceLine = {
  name: string;
  qty: string;
  unitPrice: string;
  amount: string;
  taxRate: string;
};

export type FinanceRecord = {
  code: string;
  companyCode?: string;
  company?: string;
  sourceDoc: string;
  party: string;
  contact: string;
  amount: string;
  taxAmount: string;
  totalAmount: string;
  settledAmount: string;
  owner: string;
  status: string;
  date: string;
  dueDate: string;
  invoiceType: string;
  paymentMethod: string;
  bankAccount: string;
  lines: FinanceLine[];
  note: string;
};

export type FinanceFlowRecord = {
  time: string;
  actor: string;
  action: string;
  remark: string;
};

export const salesInvoiceRows: FinanceRecord[] = [
  {
    code: 'SI-20260618-006',
    sourceDoc: 'SO-20260614-017',
    party: '苏州衡远制造',
    contact: '顾经理',
    amount: '￥18,900',
    taxAmount: '￥2,457',
    totalAmount: '￥21,357',
    settledAmount: '￥0',
    owner: '赵敏',
    status: '待开票',
    date: '2026-06-18',
    dueDate: '2026-07-18',
    invoiceType: '增值税专用发票',
    paymentMethod: '月结 30 天',
    bankAccount: '招商银行 6222 **** 8801',
    lines: [{ name: 'FTX-B200 传感模块', qty: '300 件', unitPrice: '￥63.00', amount: '￥18,900', taxRate: '13%' }],
    note: '销售出库完成后生成开票任务，等待财务确认发票信息。',
  },
  {
    code: 'SI-20260616-004',
    sourceDoc: 'SO-20260615-028',
    party: '深圳星桥设备',
    contact: '赵经理',
    amount: '￥76,800',
    taxAmount: '￥9,984',
    totalAmount: '￥86,784',
    settledAmount: '￥30,000',
    owner: '赵敏',
    status: '部分收款',
    date: '2026-06-16',
    dueDate: '2026-07-16',
    invoiceType: '增值税专用发票',
    paymentMethod: '预收 30% + 到货后结清',
    bankAccount: '工商银行 6222 **** 1209',
    lines: [{ name: 'FTX-C410 成品套件', qty: '80 套', unitPrice: '￥960.00', amount: '￥76,800', taxRate: '13%' }],
    note: '已收到预收款，剩余款项待客户验收后收取。',
  },
  {
    code: 'SI-20260615-003',
    sourceDoc: 'SO-20260613-009',
    party: '宁波嘉合电子',
    contact: '赵经理',
    amount: '￥42,600',
    taxAmount: '￥5,538',
    totalAmount: '￥48,138',
    settledAmount: '￥48,138',
    owner: '李明',
    status: '已收款',
    date: '2026-06-15',
    dueDate: '2026-06-30',
    invoiceType: '普通发票',
    paymentMethod: '到货后 15 天',
    bankAccount: '建设银行 6222 **** 2810',
    lines: [{ name: 'FTX-A120 控制组件', qty: '300 件', unitPrice: '￥142.00', amount: '￥42,600', taxRate: '13%' }],
    note: '款项已核销完成。',
  },
];

export const purchaseInvoiceRows: FinanceRecord[] = [
  {
    code: 'PI-20260618-002',
    sourceDoc: 'PO-20260617-012',
    party: '上海铭创精密',
    contact: '何经理',
    amount: '￥11,740',
    taxAmount: '￥1,526.20',
    totalAmount: '￥13,266.20',
    settledAmount: '￥0',
    owner: '陈晨',
    status: '待收票',
    date: '2026-06-18',
    dueDate: '2026-07-18',
    invoiceType: '增值税专用发票',
    paymentMethod: '验收后付款',
    bankAccount: '供应商账户待确认',
    lines: [
      { name: '铝合金外壳 A120', qty: '600 件', unitPrice: '￥18.50', amount: '￥11,100', taxRate: '13%' },
      { name: 'M3 不锈钢螺钉', qty: '8,000 件', unitPrice: '￥0.08', amount: '￥640', taxRate: '13%' },
    ],
    note: '来料仍有复判，付款需等质检结论。',
  },
  {
    code: 'PI-20260617-004',
    sourceDoc: 'PO-20260616-009',
    party: '苏州恒远电子',
    contact: '顾经理',
    amount: '￥13,800',
    taxAmount: '￥1,794',
    totalAmount: '￥15,594',
    settledAmount: '￥0',
    owner: '赵敏',
    status: '待付款',
    date: '2026-06-17',
    dueDate: '2026-07-17',
    invoiceType: '增值税专用发票',
    paymentMethod: '月结 30 天',
    bankAccount: '农业银行 6222 **** 5130',
    lines: [{ name: 'B200 传感芯片', qty: '300 件', unitPrice: '￥46.00', amount: '￥13,800', taxRate: '13%' }],
    note: '质检合格，入库完成，等待付款审批。',
  },
  {
    code: 'PI-20260615-001',
    sourceDoc: 'PO-20260615-006',
    party: '宁波嘉海包装',
    contact: '沈经理',
    amount: '￥3,400',
    taxAmount: '￥442',
    totalAmount: '￥3,842',
    settledAmount: '￥3,842',
    owner: '赵敏',
    status: '已付款',
    date: '2026-06-15',
    dueDate: '2026-06-25',
    invoiceType: '普通发票',
    paymentMethod: '到票后 10 天',
    bankAccount: '中国银行 6222 **** 6811',
    lines: [{ name: '客户标签纸 80mm', qty: '40 卷', unitPrice: '￥85.00', amount: '￥3,400', taxRate: '13%' }],
    note: '付款已核销完成。',
  },
];

export const receivableRows: FinanceRecord[] = [
  {
    ...salesInvoiceRows[0],
    code: 'AR-20260618-006',
    sourceDoc: 'SI-20260618-006',
    status: '待收款',
    invoiceType: '应收账款',
    note: '对应销售发票 SI-20260618-006，账期 30 天。',
  },
  {
    ...salesInvoiceRows[1],
    code: 'AR-20260616-004',
    sourceDoc: 'SI-20260616-004',
    status: '部分收款',
    invoiceType: '应收账款',
    note: '已收预付款，剩余应收等待客户验收。',
  },
  {
    ...salesInvoiceRows[2],
    code: 'AR-20260615-003',
    sourceDoc: 'SI-20260615-003',
    status: '已核销',
    invoiceType: '应收账款',
    note: '收款与发票已完全核销。',
  },
];

export const payableRows: FinanceRecord[] = [
  {
    ...purchaseInvoiceRows[0],
    code: 'AP-20260618-002',
    sourceDoc: 'PI-20260618-002',
    status: '暂缓付款',
    invoiceType: '应付账款',
    note: '等待来料复判，暂缓付款。',
  },
  {
    ...purchaseInvoiceRows[1],
    code: 'AP-20260617-004',
    sourceDoc: 'PI-20260617-004',
    status: '待付款',
    invoiceType: '应付账款',
    note: '已完成三单匹配，等待付款审批。',
  },
  {
    ...purchaseInvoiceRows[2],
    code: 'AP-20260615-001',
    sourceDoc: 'PI-20260615-001',
    status: '已核销',
    invoiceType: '应付账款',
    note: '付款与发票已完全核销。',
  },
];

export const financeFlowRecords: Record<string, FinanceFlowRecord[]> = {
  'SI-20260618-006': [
    { time: '2026-06-18 11:10', actor: '系统', action: '生成开票任务', remark: '销售出库完成后进入待开票。' },
  ],
  'PI-20260617-004': [
    { time: '2026-06-17 16:20', actor: '系统', action: '完成三单匹配', remark: '采购订单、入库和供应商发票金额一致。' },
  ],
  'AR-20260616-004': [
    { time: '2026-06-16 09:30', actor: '赵敏', action: '登记预收款', remark: '客户预付 ￥30,000。' },
  ],
  'AP-20260618-002': [
    { time: '2026-06-18 10:30', actor: '财务', action: '暂缓付款', remark: '来料质检仍待复判。' },
  ],
};
