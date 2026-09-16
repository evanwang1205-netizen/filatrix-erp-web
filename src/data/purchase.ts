export type PurchaseTabKey = 'suggestions' | 'requisitions' | 'orders' | 'afterSales' | 'prices';

export type PurchaseAttachment = {
  name: string;
  size: string;
  uploader: string;
  date: string;
};

export type PurchaseProduct = {
  name: string;
  qty: string;
  requestQty?: string;
  unitPrice?: string;
  amount?: string;
  qcRequired?: boolean;
};

export type PurchaseFlowRecord = {
  time: string;
  actor: string;
  action: string;
  remark: string;
};

export const purchaseMaterialVisuals: Record<string, { label: string; tone: string; url?: string }> = {
  '铝合金外壳 A120': { label: 'A120', tone: '#e4ebf1' },
  'M3 不锈钢螺钉': { label: 'M3', tone: '#ecebea' },
  '防静电周转盒': { label: 'ESD', tone: '#e5f0e8' },
  '客户标签纸 80mm': { label: '80', tone: '#f1eadc' },
  'B200 传感芯片': { label: 'B200', tone: '#ece7f1' },
};

export const requisitionRows = [
  {
    code: 'PR-20260701-011',
    department: '生产管理部',
    requester: '张三',
    reason: '生产备料申请 PMR2-260701-001 自动转采购',
    products: [{ name: 'B200 传感芯片', qty: '80 件', qcRequired: true }],
    status: '待采购受理',
    date: '2026-07-01',
    expectedDate: '2026-07-03',
    attachments: [],
  },
  {
    code: 'PR-20260617-008',
    department: '生产管理部',
    requester: '赵云',
    reason: 'A120 控制组件备料',
    products: [
      { name: '铝合金外壳 A120', qty: '600 件', qcRequired: true },
      { name: 'M3 不锈钢螺钉', qty: '8,000 件', qcRequired: false },
    ],
    status: '待采购受理',
    date: '2026-06-17',
    expectedDate: '2026-06-22',
    attachments: [{ name: 'A120-备料需求.xlsx', size: '180 KB', uploader: '赵云', date: '2026-06-17' }],
  },
  {
    code: 'PR-20260616-005',
    department: '质检部',
    requester: '林珊',
    reason: '来料抽检耗材补充',
    products: [{ name: '防静电周转盒', qty: '120 个', qcRequired: false }],
    status: '草稿',
    date: '2026-06-16',
    expectedDate: '2026-06-24',
    attachments: [],
  },
  {
    code: 'PR-20260615-002',
    department: '仓储中心',
    requester: '王倩',
    reason: '出库包装耗材',
    products: [{ name: '客户标签纸 80mm', qty: '40 卷', qcRequired: false }],
    status: '已转采购',
    date: '2026-06-15',
    expectedDate: '2026-06-20',
    attachments: [{ name: '标签纸样张.pdf', size: '96 KB', uploader: '王倩', date: '2026-06-15' }],
  },
];

export const purchaseOrderRows = [
  {
    code: 'PO-20260617-012',
    supplier: '上海铭创精密',
    contact: '何经理',
    sourceRequisition: 'PR-20260617-008',
    products: [
      { name: '铝合金外壳 A120', qty: '600 件', unitPrice: '￥18.50', amount: '￥11,100', qcRequired: true },
      { name: 'M3 不锈钢螺钉', qty: '8,000 件', unitPrice: '￥0.08', amount: '￥640', qcRequired: false },
    ],
    amount: '￥11,740',
    owner: '陈晨',
    status: '待质检',
    date: '2026-06-17',
    expectedDate: '2026-06-23',
    attachments: [{ name: '上海铭创-采购合同.pdf', size: '1.2 MB', uploader: '陈晨', date: '2026-06-17' }],
  },
  {
    code: 'PO-20260616-009',
    supplier: '苏州恒远电子',
    contact: '顾经理',
    sourceRequisition: '-',
    products: [{ name: 'B200 传感芯片', qty: '300 件', unitPrice: '￥46.00', amount: '￥13,800', qcRequired: true }],
    amount: '￥13,800',
    owner: '陈晨',
    status: '待质检',
    date: '2026-06-16',
    expectedDate: '2026-06-21',
    attachments: [{ name: 'PO-20260616-009确认回签.pdf', size: '760 KB', uploader: '陈晨', date: '2026-06-16' }],
  },
  {
    code: 'PO-20260615-006',
    supplier: '宁波嘉海包装',
    contact: '沈经理',
    sourceRequisition: 'PR-20260615-002',
    products: [{ name: '客户标签纸 80mm', qty: '40 卷', unitPrice: '￥85.00', amount: '￥3,400', qcRequired: false }],
    amount: '￥3,400',
    owner: '陈晨',
    status: '已完成',
    date: '2026-06-15',
    expectedDate: '2026-06-19',
    attachments: [],
  },
];

export const purchasePriceRows = [
  {
    material: '铝合金外壳 A120',
    supplier: '上海铭创精密',
    contact: '何经理',
    latestPrice: '￥18.50',
    quantity: '600 件',
    sourceDoc: 'PO-20260617-012',
    owner: '陈晨',
    updatedAt: '2026-06-17',
  },
  {
    material: 'B200 传感芯片',
    supplier: '苏州恒远电子',
    contact: '顾经理',
    latestPrice: '￥46.00',
    quantity: '300 件',
    sourceDoc: 'PO-20260616-009',
    owner: '陈晨',
    updatedAt: '2026-06-16',
  },
  {
    material: '客户标签纸 80mm',
    supplier: '宁波嘉海包装',
    contact: '沈经理',
    latestPrice: '￥85.00',
    quantity: '40 卷',
    sourceDoc: 'PO-20260615-006',
    owner: '陈晨',
    updatedAt: '2026-06-15',
  },
  {
    material: '防静电周转盒',
    supplier: '杭州瑞禾包装',
    contact: '刘经理',
    latestPrice: '￥22.00',
    quantity: '120 个',
    sourceDoc: 'PO-20260612-018',
    owner: '陈晨',
    updatedAt: '2026-06-12',
  },
];

export const purchaseFlowRecords: Record<string, PurchaseFlowRecord[]> = {
  'PR-20260617-008': [
    { time: '2026-06-17 09:10', actor: '赵云', action: '保存采购申请', remark: '提交 A120 控制组件生产备料需求。' },
    { time: '2026-06-17 10:20', actor: '采购主管', action: '提交采购受理', remark: '需求清晰，等待采购受理并转采购订单。' },
  ],
  'PR-20260701-011': [
    { time: '2026-07-01 11:20', actor: '张三', action: '生产备料申请转采购申请', remark: '由 PMR2-260701-001 自动生成，补齐 PT2-260701-003 缺口物料。' },
    { time: '2026-07-01 11:25', actor: '系统', action: '提交采购受理', remark: '生产任务缺口补料，等待采购确认供应商与到料日期。' },
  ],
  'PO-20260617-012': [
    { time: '2026-06-17 11:02', actor: '陈晨', action: '创建采购订单', remark: '由采购申请 PR-20260617-008 转入。' },
    { time: '2026-06-17 11:30', actor: '陈晨', action: '确认采购订单', remark: '供应商已确认交期和价格。' },
    { time: '2026-06-17 15:10', actor: '系统', action: '进入来料质检', remark: '订单含需质检物料，入库前先进入来料质检。' },
  ],
};
