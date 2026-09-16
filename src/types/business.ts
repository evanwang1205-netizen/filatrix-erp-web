export type Attachment = {
  name: string;
  size: string;
  uploader: string;
  date: string;
};

export type FlowRecord = {
  time: string;
  actor: string;
  action: string;
  remark: string;
};

export type CommercialFollowUpKind =
  | 'sales_invoice'
  | 'sales_payment'
  | 'purchase_invoice'
  | 'purchase_payment';

export type CommercialFollowUpEvent = {
  id: string;
  module: 'sales' | 'purchase';
  sourceOrder: string;
  kind: CommercialFollowUpKind;
  amount: number;
  currency?: string;
  occurredOn: string;
  referenceNo?: string;
  attachments?: Attachment[];
  note?: string;
  actor: string;
  createdAt: string;
  source?: 'commercial' | 'legacy';
  status?: 'active' | 'voided';
};

export type SalesOrderProduct = {
  lineId?: string;
  materialCode?: string;
  name: string;
  model?: string;
  spec?: string;
  qty: string;
  /** 售后候选行中的原订单数量；qty 在该场景表示已出库的可售后基数。 */
  orderedQty?: string;
  afterSalesEligibleQty?: number;
  /** 用户最后直接录入的单价类型；另一单价由税率自动换算。 */
  priceInputMode?: '含税' | '不含税';
  unitPrice: string;
  amount: string;
  taxRate?: string;
  netUnitPrice?: string;
  grossUnitPrice?: string;
  netAmount?: string;
  taxAmount?: string;
  grossAmount?: string;
  uom?: string;
  imageLabel?: string;
  imageTone?: string;
  fulfillmentLinks?: SalesOrderFulfillmentLink[];
};

export type SalesOrderFulfillmentLink = {
  type: '库存预留' | '生产任务' | '销售出库';
  documentCode: string;
  documentLineId?: string;
  qty: string;
  status: string;
  path?: string;
};

export type SalesProductionProgressLine = {
  sourceLineId: string;
  materialCode: string;
  name: string;
  unit: string;
  orderQty: number;
  productionDemandQty: number;
  plannedQty: number;
  releasedQty: number;
  reportedQty: number;
  qualifiedQty: number;
  releasedInboundQty: number;
  inboundQty: number;
  workOrderCodes: string[];
  status: string;
};

export type SalesProductionProgress = {
  status: string;
  productionDemandQty?: number;
  plannedQty?: number;
  releasedQty?: number;
  reportedQty?: number;
  qualifiedQty?: number;
  releasedInboundQty?: number;
  inboundQty?: number;
  /** 兼容旧字段；含义固定为质检合格量，不代表已报工或已入库。 */
  completedQty?: number;
  unit?: string;
  mixedUnits?: boolean;
  lineCount?: number;
  lines?: SalesProductionProgressLine[];
};

export type SalesDeliveryProgressLine = {
  lineId: string;
  materialCode: string;
  name: string;
  uom: string;
  orderedQty: number;
  deliveryTargetQty: number;
  closedQty: number;
  outboundQty: number;
  remainingQty: number;
};

export type SalesDeliveryProgress = {
  status: string;
  orderedQty?: number;
  deliveryTargetQty?: number;
  closedQty?: number;
  outboundQty?: number;
  signedQty?: number;
  lines?: SalesDeliveryProgressLine[];
};

export type SalesQuoteProduct = {
  materialCode?: string;
  name: string;
  model?: string;
  spec?: string;
  qty: string;
  /** 用户最后直接录入的单价类型；另一单价由税率自动换算。 */
  priceInputMode?: '含税' | '不含税';
  unitPrice: string;
  amount: string;
  taxRate: string;
  netUnitPrice?: string;
  grossUnitPrice?: string;
  netAmount?: string;
  taxAmount?: string;
  grossAmount?: string;
  uom?: string;
  imageLabel?: string;
  imageTone?: string;
};

export type SalesQuote = {
  code: string;
  revision?: number;
  /** 报价结算币种代码；当前候选来自启用币种主档。 */
  currency?: string;
  companyCode?: string;
  company?: string;
  /** 报价保存时冻结的中文 PDF 抬头；后续公司主档变化不改写历史报价。 */
  companyPrintSnapshot?: {
    name: string;
    address: string;
    email: string;
    website: string;
  };
  customerCode?: string;
  customer: string;
  contact: string;
  contactPhone?: string;
  products: SalesQuoteProduct[];
  amount: string;
  netAmount?: string;
  taxAmount?: string;
  owner: string;
  ownerEmployeeCode?: string;
  ownerAccountCode?: string;
  status: string;
  convertedOrderCode?: string;
  date: string;
  validUntil: string;
  deliveryMethod: string;
  paymentMethod: string;
  freightPayer?: string;
  taxMode?: string;
  /** 兼容旧消费者的整单税率摘要；逐行税率不一致时为“多税率”。 */
  taxRate?: string;
  remark: string;
  attachments: Attachment[];
};

export type SalesOrder = {
  code: string;
  revision?: number;
  /** 订单结算币种代码；当前候选来自启用币种主档。 */
  currency?: string;
  companyCode?: string;
  company?: string;
  /** 订单保存时冻结的中文 PDF 品牌抬头；后续公司主档变化不改写历史订单。 */
  companyPrintSnapshot?: {
    name: string;
    address: string;
    email: string;
    website: string;
  };
  /** 订单保存时冻结的供方联系人，用于对外销售订单 PDF。 */
  supplierPrintSnapshot?: {
    contact: string;
    phone: string;
  };
  /** 订单保存时冻结的需方公司联系资料；公司地址不得回退为默认收货地址。 */
  customerPrintSnapshot?: {
    name: string;
    address: string;
    contact: string;
    phone: string;
  };
  customerCode?: string;
  customer: string;
  contact: string;
  contactPhone?: string;
  sourceQuote: string;
  products: SalesOrderProduct[];
  /** 销售对已发生部分出库的未发余量作出的终止交付决定。 */
  deliveryClosures?: Array<{
    sourceLineId: string;
    materialCode?: string;
    name: string;
    closedQty: number;
    uom: string;
    reason: string;
    closedAt: string;
    closedBy: string;
  }>;
  deliveryRemainderStatus?: '已关闭';
  deliveryRemainderReason?: string;
  deliveryRemainderClosedAt?: string;
  deliveryRemainderClosedBy?: string;
  /** 实际已出库或已签收、允许登记销售售后的逐行数量快照。 */
  afterSalesEligibleProducts?: SalesOrderProduct[];
  /** 售后登记默认协调人；从拥有销售角色的启用账号中解析。 */
  afterSalesOwner?: string;
  afterSalesOwnerEmployeeCode?: string;
  amount: string;
  netAmount?: string;
  taxAmount?: string;
  owner: string;
  ownerEmployeeCode?: string;
  priority: string;
  documentStatus?: '草稿' | '已确认' | '已关闭' | '已作废' | string;
  status: string;
  date: string;
  delivery: string;
  deliveryMethod: string;
  paymentMethod: string;
  freightPayer?: string;
  taxMode?: string;
  taxRate?: string;
  logisticsMode?: string;
  plannedShipDate?: string;
  shipAddress?: string;
  shipContact?: string;
  shipPhone?: string;
  /** 跨销售、生产、仓库及必要质检环节传递的订单补充要求。 */
  supplementaryRequirement?: string;
  /** 仅供销售内部查看，不进入生产、仓库或质检单据。 */
  internalNote?: string;
  /** @deprecated 旧数据兼容字段；读取时迁移为 supplementaryRequirement。 */
  internalRemark?: string;
  remark: string;
  attachments: Attachment[];
  productionProgress?: SalesProductionProgress;
  deliveryProgress?: SalesDeliveryProgress;
  invoiceProgress?: { status: string; orderAmount?: number; invoicedAmount?: number };
  paymentProgress?: { status: string; receivableAmount?: number; settledAmount?: number; afterSalesAdjustmentAmount?: number };
  commercialSummary?: {
    eventIds: string[];
    invoicedAmount: number;
    receivableAmount: number;
    settledAmount: number;
  };
  commercialFollowUps?: CommercialFollowUpEvent[];
  attentionFlags?: { status: string };
  progressFacts?: {
    documentStatus?: string;
    production?: SalesProductionProgress;
    delivery?: SalesDeliveryProgress;
    invoice?: { status: string; orderAmount?: number; invoicedAmount?: number };
    payment?: { status: string; receivableAmount?: number; settledAmount?: number; afterSalesAdjustmentAmount?: number };
    attention?: { status: string };
  };
  relatedDocuments?: RelatedBusinessDocument[];
};

export type SalesOutboundRequestProduct = {
  sourceLineId?: string;
  materialCode?: string;
  name: string;
  model?: string;
  spec?: string;
  qty: string;
  requestQty: string;
  uom?: string;
  imageLabel?: string;
  imageTone?: string;
};

export type SalesOutboundRequest = {
  code: string;
  companyCode?: string;
  company?: string;
  sourceOrder: string;
  customerCode?: string;
  customer: string;
  contact: string;
  contactPhone?: string;
  products: SalesOutboundRequestProduct[];
  applicant: string;
  status: string;
  requestDate: string;
  expectedDate: string;
  deliveryDate?: string;
  deliveryMethod: string;
  warehouseCode?: string;
  warehouse: string;
  address: string;
  supplementaryRequirement?: string;
  /** @deprecated 旧数据兼容字段；等同于 supplementaryRequirement。 */
  remark: string;
  attachments: Attachment[];
};

export type SalesAfterSaleProduct = {
  sourceLineId?: string;
  materialCode?: string;
  name: string;
  model?: string;
  spec?: string;
  imageLabel?: string;
  imageTone?: string;
  qty: string;
  sourceQty?: string;
  uom?: string;
  batch?: string;
  batchControl?: '批次管理' | '不追踪批次' | string;
  batchTracked?: boolean;
};

export type AfterSalesExecutionModule = '销售' | '采购' | '仓库' | '质检' | '生产';

export type AfterSalesExecutionTask = {
  code: string;
  taskKey?: string;
  afterSaleKind?: 'sales' | 'purchase';
  afterSaleCode?: string;
  sourceOrder?: string;
  party?: string;
  module: AfterSalesExecutionModule;
  kind: string;
  status: '待前置' | '待处理' | '处理中' | '已完成' | '已取消';
  predecessorCodes?: string[];
  predecessors?: Array<{
    code: string;
    module: AfterSalesExecutionModule;
    kind: string;
    status: '待前置' | '待处理' | '处理中' | '已完成' | '已取消';
    disposition?: string;
    evidence?: string;
    note?: string;
    actualDate?: string;
    completedAt?: string;
    completedBy?: string;
  }>;
  path?: string;
  direction?: '入库' | '出库' | '检验' | '返修' | '跟进';
  products?: SalesAfterSaleProduct[];
  /** 采购退货允许选择的来源订单有效入库物料批次键：materialCode|batch。 */
  sourceBatchKeys?: string[];
  warehouseCode?: string;
  warehouse?: string;
  location?: string;
  disposition?: string;
  amount?: number;
  currency?: 'CNY';
  adjustmentCode?: string;
  evidence?: string;
  note?: string;
  actualDate?: string;
  attachments?: Attachment[];
  allocations?: AfterSalesWarehouseAllocation[];
  receiptAllocations?: AfterSalesReceiptAllocation[];
  executionRecords?: AfterSalesExecutionRecord[];
  createdAt?: string;
  startedAt?: string;
  startedBy?: string;
  completedAt?: string;
  completedBy?: string;
  caseIssueType?: string;
  caseIssueDescription?: string;
  caseAction?: string;
  caseGoodsDisposition?: string;
};

export type AfterSalesWarehouseAllocation = {
  allocationId?: string;
  sourceLineId?: string;
  materialCode?: string;
  inventoryKey: string;
  warehouseCode?: string;
  warehouse: string;
  location: string;
  batch: string;
  qty: string;
  uom?: string;
};

export type AfterSalesReceiptAllocation = {
  allocationId?: string;
  sourceLineId?: string;
  materialCode?: string;
  batch: string;
  qty: string;
  uom?: string;
};

export type AfterSalesExecutionRecord = {
  code: string;
  kind: string;
  actualDate: string;
  products: SalesAfterSaleProduct[];
  allocations?: AfterSalesWarehouseAllocation[];
  receiptAllocations?: AfterSalesReceiptAllocation[];
  stockFacts?: Array<Record<string, unknown>>;
  warehouseCode?: string;
  warehouse?: string;
  location?: string;
  disposition?: string;
  evidence?: string;
  note?: string;
  attachments?: Attachment[];
  completedAt: string;
  completedBy: string;
};

export type SalesAfterSaleExecutionTask = AfterSalesExecutionTask;

export type SalesAfterSale = {
  code: string;
  revision?: number;
  companyCode?: string;
  company?: string;
  sourceOrder: string;
  customerCode?: string;
  customer: string;
  contact: string;
  contactPhone?: string;
  issueType: string;
  issueDescription: string;
  action: string;
  goodsDisposition?: string;
  financialTreatment?: string;
  responsibility: string;
  amountImpact: string;
  amountImpactType?: '无金额影响' | '待评估' | '退款' | '折让' | '补发成本' | '返修成本';
  estimatedAmount?: number;
  confirmedAmount?: number;
  currency?: 'CNY';
  planNote?: string;
  /** 返修品复检结论，用于把最终仓库任务明确分支为返还或报废处置。 */
  salesRepairQualityDisposition?: '合格' | '报废';
  /** 销售退回物的独立质检结论；不得由补发、换货、退款或返修方案预先替代。 */
  salesReturnQualityDisposition?: '可再次销售' | '返修返工' | '报废';
  executionTasks?: SalesAfterSaleExecutionTask[];
  processingResult?: string;
  confirmationNote?: string;
  owner: string;
  ownerEmployeeCode?: string;
  status: '待受理' | '处理中' | '待确认' | '已关闭' | '已作废';
  nextStep: string;
  date: string;
  sourceStatus: string;
  sourceAmount: string;
  sourceDate: string;
  sourceDueDate: string;
  sourceRemark: string;
  products: SalesAfterSaleProduct[];
  attachments: Attachment[];
  relatedDocuments?: RelatedBusinessDocument[];
};

export type PurchaseOrderSourceAllocation = {
  requisitionCode: string;
  sourceLineId: string;
  quantity: number;
  unit: string;
  expectedDate?: string;
};

export type PurchaseOrderProduct = {
  lineId?: string;
  sourceRequisition?: string;
  sourceLineId?: string;
  sourceAllocations?: PurchaseOrderSourceAllocation[];
  materialCode?: string;
  name: string;
  model?: string;
  spec?: string;
  qty: string;
  sourceQty?: string;
  /** 用户最后直接录入的单价类型；另一单价由税率自动换算。 */
  priceInputMode?: '含税' | '不含税';
  unitPrice: string;
  amount: string;
  taxRate?: string;
  netUnitPrice?: string;
  grossUnitPrice?: string;
  netAmount?: string;
  taxAmount?: string;
  grossAmount?: string;
  qcRequired?: boolean;
  incomingQualityControl?: string;
  uom?: string;
  imageLabel?: string;
  imageTone?: string;
};

export type PurchaseRequisitionProduct = {
  lineId?: string;
  materialCode?: string;
  name: string;
  model?: string;
  spec?: string;
  qty: string;
  qcRequired?: boolean;
  incomingQualityControl?: string;
  uom?: string;
  imageLabel?: string;
  imageTone?: string;
};

export type PurchaseRequisition = {
  code: string;
  companyCode?: string;
  company?: string;
  documentStatus?: string;
  purchaseType?: string;
  sourceType?: '手工申请' | '生产任务缺口' | '临时备料缺口' | '库存补货' | string;
  sourceMaterialRequest?: string;
  sourceProductionTask?: string;
  sourceReplenishmentCode?: string;
  sourceWarehouseCode?: string;
  sourceWarehouseName?: string;
  /** 系统补货申请的原始需求日；当生成采购申请时已逾期，保留该日期用于风险提示。 */
  sourceExpectedDate?: string;
  department: string;
  requester: string;
  reason: string;
  products: PurchaseRequisitionProduct[];
  status: string;
  date: string;
  expectedDate: string;
  attachments: Attachment[];
  conversionFacts?: PurchaseRequisitionConversionFacts;
};

export type PurchaseRequisitionConversionLine = {
  lineId: string;
  materialCode: string;
  name: string;
  requestedQty: number;
  orderedQty: number;
  remainingQty: number;
  uom: string;
  status: '未承接' | '部分承接' | '已承接';
};

export type PurchaseRequisitionConversionFacts = {
  status: '未转单' | '部分转单' | '已转单';
  nextStep: string;
  linkedOrderCodes: string[];
  coveredLineCount: number;
  completedLineCount: number;
  totalLineCount: number;
  lines: PurchaseRequisitionConversionLine[];
};

export type PurchaseSuggestionSource = PurchaseOrderSourceAllocation & {
  department: string;
  requester: string;
  sourceType: string;
  requestedQty?: number;
  orderedQty?: number;
  remainingQty?: number;
};

export type PurchaseSuggestionSupplierOption = {
  supplierCode: string;
  supplierName: string;
  supplierMaterialCode: string;
  minOrderQty: number;
  leadTimeDays: number;
  referenceOrderQty: number;
  referenceSupplementQty: number;
};

export type PurchaseSuggestionItem = {
  key: string;
  companyCode: string;
  company: string;
  materialCode: string;
  materialName: string;
  model?: string;
  spec?: string;
  unit: string;
  demandQty: number;
  orderedQty: number;
  openQty: number;
  earliestExpectedDate: string;
  sourceCount: number;
  sources: PurchaseSuggestionSource[];
  supplierCount: number;
  suppliers: PurchaseSuggestionSupplierOption[];
  supplierStatus: 'available' | 'no-supplier';
  supplierStatusLabel: string;
};

export type RelatedBusinessDocument = {
  type:
    | '销售出库'
    | '销售发票'
    | '应收账款'
    | '采购申请'
    | '采购收货'
    | '到货/入库'
    | '来料质检'
    | '采购售后'
    | '采购发票'
    | '应付账款'
    | '来源报价'
    | '出库申请'
    | '开票记录'
    | '回款记录'
    | '收票记录'
    | '付款记录';
  code: string;
  status: string;
  path: string;
};

export type PurchaseOrder = {
  code: string;
  companyCode?: string;
  company?: string;
  /** 采购订单保存时冻结的需方品牌抬头。 */
  companyPrintSnapshot?: {
    name: string;
    address: string;
    email: string;
    website: string;
  };
  /** 采购订单保存时冻结的需方采购联系人。 */
  buyerPrintSnapshot?: {
    contact: string;
    phone: string;
  };
  /** 采购订单保存时冻结的供方公司联系资料。 */
  supplierPrintSnapshot?: {
    name: string;
    address: string;
    contact: string;
    phone: string;
  };
  purchaseType?: string;
  supplierCode?: string;
  supplier: string;
  contact: string;
  contactPhone?: string;
  sourceRequisition: string;
  sourceRequisitions?: string[];
  products: PurchaseOrderProduct[];
  /** 订单确认时冻结的自动超收容差；原型阶段默认 5%。 */
  overReceiptTolerancePercent?: number;
  /** 采购对未到货余量作出的关闭决定；仓库只执行收货，不维护此事实。 */
  receiptClosures?: Array<{
    sourceLineId: string;
    materialCode?: string;
    name: string;
    closedQty: number;
    uom: string;
    reason: string;
    closedAt: string;
    closedBy: string;
  }>;
  receiptRemainderStatus?: '已关闭';
  receiptRemainderReason?: string;
  receiptRemainderClosedAt?: string;
  receiptRemainderClosedBy?: string;
  amount: string;
  owner: string;
  ownerEmployeeCode?: string;
  /** 售后登记默认协调人；从拥有采购角色的启用账号中解析。 */
  afterSalesOwner?: string;
  afterSalesOwnerEmployeeCode?: string;
  /** 售后处理中、应付款生成前也必须保留的付款控制事实。 */
  paymentHoldStatus?: '正常' | '已暂缓';
  paymentHoldReason?: string;
  paymentHoldAfterSaleCode?: string;
  status: string;
  date: string;
  expectedDate: string;
  deliveryMethod: string;
  paymentMethod: string;
  freightPayer?: string;
  taxMode?: string;
  taxRate?: string;
  warehouseCode?: string;
  warehouse: string;
  receivingAddress: string;
  receivingContact: string;
  receivingPhone: string;
  remark: string;
  attachments: Attachment[];
  progressFacts?: PurchaseOrderProgressFacts;
  commercialFollowUps?: CommercialFollowUpEvent[];
  relatedDocuments?: RelatedBusinessDocument[];
};

export type PurchaseOrderProgressFacts = {
  arrival: string;
  quality: string;
  inbound: string;
  invoice: string;
  payment: string;
  attention: string;
  attentionTone: 'normal' | 'warning' | 'danger' | 'paused';
  nextStep: string;
  commercial?: {
    orderAmount: number;
    invoicedAmount: number;
    payableAmount: number;
    settledAmount: number;
  };
  lines?: Array<{
    lineId: string;
    materialCode: string;
    name: string;
    uom: string;
    orderedQty: number;
    receiptTargetQty: number;
    closedQty: number;
    remainingQty: number;
    maxReceivableQty: number;
    remainingReceivableQty: number;
    overReceivedQty: number;
    overReceiptTolerancePercent: number;
    arrivedQty: number;
    pendingQcQty: number;
    releasedQty: number;
    rejectedQty: number;
    inboundQty: number;
  }>;
};

export type PurchaseAfterSale = {
  code: string;
  revision?: number;
  companyCode?: string;
  company?: string;
  sourceOrder: string;
  supplierCode?: string;
  supplier: string;
  contact: string;
  contactPhone?: string;
  issueType: string;
  issueDescription?: string;
  action: string;
  goodsDisposition?: string;
  financialTreatment?: string;
  responsibility: string;
  amountImpact: string;
  amountImpactType?: '无金额影响' | '待评估' | '退款' | '折让' | '补发成本' | '返修成本' | '应付扣减';
  estimatedAmount?: number;
  confirmedAmount?: number;
  currency?: 'CNY';
  planNote?: string;
  /** 补发、换货或返工品的来料结论，用于决定正式入库或退回供应商。 */
  purchaseQualityDisposition?: '合格' | '让步接收' | '不合格退回';
  executionTasks?: AfterSalesExecutionTask[];
  processingResult?: string;
  confirmationNote?: string;
  owner: string;
  ownerEmployeeCode?: string;
  status: '待受理' | '处理中' | '待确认' | '已关闭' | '已作废';
  nextStep: string;
  date: string;
  sourceStatus: string;
  sourceAmount: string;
  sourceDate: string;
  sourceDueDate: string;
  sourceRemark: string;
  products: PurchaseOrderProduct[];
  attachments: Attachment[];
  remedyReceipt?: RelatedBusinessDocument;
  relatedDocuments?: RelatedBusinessDocument[];
};

export type WarehouseReceiptProduct = {
  lineId?: string;
  sourceLineId?: string;
  materialCode?: string;
  name: string;
  model?: string;
  spec?: string;
  qty: string;
  plannedQty?: string;
  arrivalQty?: string;
  acceptedQty?: string;
  refusedQty?: string;
  exceptionHeldQty?: string;
  refusalReason?: string;
  exceptionNote?: string;
  supplierBatch?: string;
  stagingBatch?: string;
  batch?: string;
  batchControl?: '批次管理' | '不追踪批次' | string;
  batchTracked?: boolean;
  shelfLife?: string;
  qcRequired?: boolean;
  incomingQualityControl?: string;
  inboundQualityControl?: string;
  defaultWarehouse?: string;
  uom?: string;
  imageLabel?: string;
  imageTone?: string;
  destinationWarehouseCode?: string;
  destinationWarehouse?: string;
  destinationLocation?: string;
};

export type PurchaseInboundStageLine = {
  key: string;
  sourceLineId?: string;
  materialCode?: string;
  name: string;
  model?: string;
  spec?: string;
  uom: string;
  plannedQty: number;
  arrivalQty: number;
  acceptedQty: number;
  refusedQty: number;
  exceptionHeldQty: number;
  qcPendingQty: number;
  releasedQty: number;
  rejectedQty: number;
  postedQty: number;
  availableQty: number;
  remainingQty: number;
};

export type PurchaseArrivalRecordLine = {
  key: string;
  receiptLineId: string;
  sourceLineId?: string;
  materialCode?: string;
  name: string;
  model?: string;
  spec?: string;
  uom: string;
  supplierBatch?: string;
  arrivalQty: number;
  acceptedQty: number;
  refusedQty: number;
  exceptionHeldQty: number;
  qcPendingQty: number;
  releasedQty: number;
  rejectedQty: number;
  postedQty: number;
  availableQty: number;
};

export type PurchaseArrivalRecord = {
  receiptCode: string;
  date: string;
  submittedAt?: string;
  submittedBy?: string;
  warehouse: string;
  location: string;
  sourceType?: string;
  sourceAfterSale?: string;
  note?: string;
  lines: PurchaseArrivalRecordLine[];
};

export type PurchaseInboundDetailProjection = {
  scopeType: 'purchase_order' | 'purchase_after_sale';
  scopeCode: string;
  sourceOrderReceiving: {
    expectedDate: string;
    deliveryMethod: string;
    warehouseCode?: string;
    warehouse: string;
    receivingAddress: string;
    receivingContact: string;
    receivingPhone: string;
  };
  aggregateLines: PurchaseInboundStageLine[];
  arrivalRecords: PurchaseArrivalRecord[];
};

export type PurchaseReceipt = {
  code: string;
  companyCode?: string;
  company?: string;
  sourceDoc: string;
  sourceType?: 'purchase_order' | 'purchase_after_sale' | string;
  sourceAfterSale?: string;
  remedyType?: string;
  supplierCode?: string;
  supplier: string;
  contact: string;
  contactPhone?: string;
  products: WarehouseReceiptProduct[];
  warehouseCode?: string;
  warehouse: string;
  location: string;
  owner: string;
  status: string;
  date: string;
  expectedDate: string;
  note: string;
  generatedFromPurchaseOrder?: boolean;
  generatedAt?: string;
  purchaseAfterSaleCode?: string;
  arrivalResult?: {
    submittedAt?: string;
    submittedBy?: string;
    totals?: {
      arrival?: number;
      accepted?: number;
      refused?: number;
      exceptionHeld?: number;
    };
    totalsByUnit?: Record<string, {
      arrival: number;
      accepted: number;
      refused: number;
      exceptionHeld: number;
    }>;
  };
  purchaseException?: {
    code?: string;
    status?: string;
    kind?: string;
    refusedQty?: number;
    exceptionHeldQty?: number;
    purchaseAfterSaleCode?: string;
  };
  exceptionCustodyReturns?: Array<{
    receiptLineId: string;
    materialCode?: string;
    quantity: number;
    unit?: string;
    taskCode?: string;
    returnedAt?: string;
    returnedBy?: string;
  }>;
  inboundAllocations?: Array<{
    id?: string;
    receiptLineId: string;
    quantity: string;
    warehouseCode: string;
    warehouse: string;
    location: string;
  }>;
  inboundPostings?: Array<{
    code: string;
    idempotencyKey?: string;
    postedAt?: string;
    postedBy?: string;
    reversalCode?: string;
    reversedAt?: string;
    reversedBy?: string;
    lines?: Array<{
      id?: string;
      receiptLineId: string;
      materialCode?: string;
      name?: string;
      model?: string;
      spec?: string;
      postedQty: number;
      unit?: string;
      uom?: string;
      warehouseCode?: string;
      warehouse?: string;
      location?: string;
      batch?: string;
    }>;
  }>;
  attachments?: Attachment[];
  arrivalDraftSavedAt?: string;
  arrivalDraftSavedBy?: string;
  stockStage?: string;
  arrivalLineFacts?: Array<{
    receiptLineId: string;
    materialCode?: string;
    quantity: number;
    arrivalQty?: number;
    acceptedQty?: number;
    refusedQty?: number;
    exceptionHeldQty?: number;
    unit: string;
    qualityRequired: boolean;
    stage: 'qc_hold' | 'pending_inbound' | string;
  }>;
  postedQuantities?: {
    total?: number;
    lines?: Array<{
      receiptLineId: string;
      postedQty: number;
      unit?: string;
      uom?: string;
      warehouseCode?: string;
      warehouse?: string;
      location?: string;
    }>;
    totalsByUnit?: Record<string, number>;
    postedAt?: string;
  };
  qualityDecision?: {
    status?: string;
    lines?: Array<{
      receiptLineId?: string;
      lineId?: string;
      materialCode?: string;
      name?: string;
      batch?: string;
      receivedQty?: number | string;
      acceptedQty?: number | string;
      concessionQty?: number | string;
      releasedQty?: number | string;
      pendingQty?: number | string;
      rejectedQty?: number | string;
      disposition?: string;
      unit?: string;
      uom?: string;
    }>;
  } | null;
  qualityDispositionQuantities?: Record<string, {
    approvedConcessionQty?: number;
    returnedQty?: number;
    reinspectionAcceptedQty?: number;
  }>;
  qualityTaskCode?: string;
  reversalCode?: string;
  reversalStatus?: '已冲销' | string;
  reversalReason?: string;
  reversedAt?: string;
  reversedBy?: string;
  submittedAt?: string;
  submittedBy?: string;
  dispatchedAt?: string;
  dispatchedBy?: string;
  receivedAt?: string;
  receivedBy?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  cancelledBy?: string;
};

export type SalesIssueProduct = {
  lineId?: string;
  sourceLineId?: string;
  materialCode?: string;
  name: string;
  model?: string;
  spec?: string;
  taskQty?: string;
  qty: string;
  batch?: string;
  allocations?: SalesIssuePickingAllocation[];
  batchControl?: '批次管理' | '不追踪批次' | string;
  batchTracked?: boolean;
  shelfLife?: string;
  incomingQualityControl?: string;
  inboundQualityControl?: string;
  defaultWarehouse?: string;
  uom?: string;
  imageLabel?: string;
  imageTone?: string;
};

export type SalesIssuePickingAllocation = {
  allocationId?: string;
  inventoryKey: string;
  warehouseCode?: string;
  warehouse: string;
  location: string;
  batch: string;
  qty: string;
  uom?: string;
};

export type SalesDeliveryRecord = {
  code: string;
  sourceOrder: string;
  products: SalesIssueProduct[];
  warehouse?: string;
  actualWarehouses?: Array<{ code?: string; name: string }>;
  deliveryMethod: string;
  owner?: string;
  status: string;
  date: string;
  reversalCode?: string;
};

export type SalesIssue = {
  code: string;
  companyCode?: string;
  company?: string;
  sourceDoc: string;
  sourceOrder: string;
  customerCode?: string;
  customer: string;
  contact: string;
  contactPhone?: string;
  products: SalesIssueProduct[];
  warehouseCode?: string;
  warehouse: string;
  actualWarehouses?: Array<{
    code?: string;
    name: string;
  }>;
  deliveryMethod: string;
  address?: string;
  supplementaryRequirement?: string;
  /** @deprecated 旧数据兼容字段；等同于 supplementaryRequirement。 */
  sourceRemark?: string;
  owner: string;
  status: string;
  date: string;
  expectedDate: string;
  note: string;
  attachments?: Attachment[];
  pickingStartedAt?: string;
  pickingStartedBy?: string;
  acceptedAt?: string;
  acceptedBy?: string;
  reviewSubmittedAt?: string;
  reviewSubmittedBy?: string;
  reviewReturnedAt?: string;
  reviewReturnedBy?: string;
  postedAt?: string;
  postedBy?: string;
  pickingResult?: {
    idempotencyKey: string;
    submittedAt?: string;
    submittedBy?: string;
  };
  reversalCode?: string;
  reversalStatus?: '已冲销' | string;
  reversalReason?: string;
  reversedAt?: string;
  reversedBy?: string;
};

export type WarehouseMoveProduct = {
  lineId?: string;
  materialCode?: string;
  sourceLineId?: string;
  name: string;
  model?: string;
  spec?: string;
  qty: string;
  batch?: string;
  batchControl?: '批次管理' | '不追踪批次' | string;
  batchTracked?: boolean;
  shelfLife?: string;
  incomingQualityControl?: string;
  inboundQualityControl?: string;
  defaultWarehouse?: string;
  uom?: string;
  plannedQty?: number;
  postedQty?: number;
  imageLabel?: string;
  imageTone?: string;
};

export type WarehouseOtherMove = {
  code: string;
  companyCode?: string;
  company?: string;
  moveType: string;
  direction: '入库' | '出库' | string;
  reason: string;
  products: WarehouseMoveProduct[];
  warehouseCode?: string;
  warehouse: string;
  location?: string;
  targetWarehouse: string;
  owner: string;
  status: string;
  date: string;
  note: string;
  attachments?: Attachment[];
  submittedAt?: string;
  submittedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  postedAt?: string;
  postedBy?: string;
  workOrder?: string;
  releaseBatch?: string;
  executionCard?: string;
  revision?: number;
  idempotencyKey?: string;
  reversalCode?: string;
  reversalStatus?: '已冲销' | string;
  reversalReason?: string;
  reversedAt?: string;
  reversedBy?: string;
};

export type WarehouseProductionIssue = WarehouseOtherMove & {
  moveType: '生产领料';
  direction: '出库';
  workOrder: string;
  releaseBatch: string;
  status: '草稿' | '待出库' | '已完成';
  revision: number;
};

export type WarehouseProductionReturn = WarehouseOtherMove & {
  moveType: '生产退料';
  direction: '入库';
  materialIssue: string;
  workOrder: string;
  releaseBatch: string;
  executionCard?: string;
  targetWarehouseCode?: string;
  status: '草稿' | '待入库' | '已完成';
  revision: number;
};

export type WarehouseProductionReceipt = WarehouseOtherMove & {
  moveType: '完工入库';
  direction: '入库';
  workOrder: string;
  releaseBatch: string;
  executionCard: string;
  quantity: number;
  unit: string;
  targetWarehouseCode?: string;
  targetLocation?: string;
  qualityTaskCodes?: string[];
  status: '草稿' | '待入库' | '已完成';
  revision: number;
};

export type WarehouseTransfer = {
  code: string;
  companyCode?: string;
  company?: string;
  products: WarehouseMoveProduct[];
  fromWarehouseCode?: string;
  fromWarehouse: string;
  toWarehouseCode?: string;
  toWarehouse: string;
  toLocation?: string;
  owner: string;
  status: string;
  date: string;
  reason: string;
  note: string;
  attachments?: Attachment[];
  transitLines?: Array<{
    lineId?: string;
    sourceLineId?: string;
    inventoryKey: string;
    targetInventoryKey: string;
    materialCode?: string;
    name: string;
    batch: string;
    qty: number;
    uom: string;
  }>;
  reversalCode?: string;
  reversalStatus?: '已冲销' | string;
  reversalReason?: string;
  reversedAt?: string;
  reversedBy?: string;
};

export type WarehouseStocktakeLine = {
  lineId?: string;
  inventoryKey: string;
  materialCode?: string;
  item: string;
  itemType?: string;
  model?: string;
  spec?: string;
  imageLabel?: string;
  imageTone?: string;
  location: string;
  batch: string;
  uom: string;
  bookQty: number;
  countedQty?: number | null;
  differenceQty: number;
  frozenQty?: number;
};

export type WarehouseStocktake = {
  code: string;
  companyCode?: string;
  company?: string;
  warehouseCode?: string;
  warehouse: string;
  scopeMode?: '全仓盘点' | '按库位' | '按物料' | '按批次' | '指定范围' | string;
  scope: string;
  scopeLabel?: string;
  ownerEmployeeCode?: string;
  owner: string;
  status: string;
  date: string;
  plannedCount: number;
  checkedCount: number;
  differenceCount: number;
  note: string;
  attachments?: Attachment[];
  lines?: WarehouseStocktakeLine[];
  startedAt?: string;
  startedBy?: string;
  submittedAt?: string;
  submittedBy?: string;
  reviewReturnedAt?: string;
  reviewReturnReason?: string;
  reviewReturnedBy?: string;
  completedAt?: string;
  completedBy?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  reversalCode?: string;
  reversalStatus?: '已冲销' | string;
  reversalReason?: string;
  reversedAt?: string;
  reversedBy?: string;
};

export type WarehouseReversalLine = {
  lineId: string;
  sourceLineId?: string;
  inventoryKey?: string;
  materialCode?: string;
  name: string;
  warehouseCode?: string;
  warehouse: string;
  location?: string;
  batch?: string;
  quantity: number;
  uom: string;
  beforeBalance: string;
  afterBalance: string;
  originalReason?: string;
};

export type WarehouseReversal = {
  code: string;
  companyCode?: string;
  company?: string;
  sourceType: 'purchase-receipts' | 'sales-issues' | 'other-moves' | 'transfers' | 'stocktakes';
  sourceDoc: string;
  sourceStatus: string;
  sourcePath: string;
  reason: string;
  actor: string;
  status: '已完成' | string;
  idempotencyKey: string;
  lines: WarehouseReversalLine[];
  createdAt: string;
};

export type WarehouseInventoryRow = {
  key?: string;
  materialCode?: string;
  item: string;
  itemType: string;
  warehouse: string;
  warehouseCode?: string;
  warehouseStatus?: string;
  allowProductionIssue?: boolean;
  stocktakeFrozen?: boolean;
  stocktakeCode?: string;
  location: string;
  batch: string;
  batchDate?: string;
  expiryDate?: string;
  uom?: string;
  onHand: string;
  available: string;
  locked: string;
  qcHold: string;
  inboundPlan: string;
  outboundPlan: string;
  qualifiedOnHand?: string;
  reserved?: string;
  allocated?: string;
  frozen?: string;
  pendingInbound?: string;
  rejectedHold?: string;
  exceptionHold?: string;
  inTransit?: string;
  onHandNumber?: number;
  qualifiedOnHandNumber?: number;
  reservedNumber?: number;
  allocatedNumber?: number;
  frozenNumber?: number;
  qcHoldNumber?: number;
  pendingInboundNumber?: number;
  rejectedHoldNumber?: number;
  exceptionHoldNumber?: number;
  inTransitNumber?: number;
  availableNumber?: number;
  lockedNumber?: number;
  inboundPlanNumber?: number;
  outboundPlanNumber?: number;
  status: string;
  lastMovement: string;
  updatedAt: string;
  lockedSources?: string[];
  reservationSources?: InventoryOccupationSource[];
  allocationSources?: InventoryOccupationSource[];
  freezeSources?: InventoryOccupationSource[];
  transitSources?: InventoryOccupationSource[];
};

export type SalesInventoryProjectionRow = {
  key: string;
  materialCode: string;
  item: string;
  itemType: string;
  model?: string;
  spec?: string;
  uom: string;
  available: string;
  inboundPlan: string;
  outboundPlan: string;
  inTransit: string;
  inTransitNumber: number;
  availableNumber: number;
  inboundPlanNumber: number;
  outboundPlanNumber: number;
  status: string;
  updatedAt: string;
  salesReservationSources?: Array<Pick<
    InventoryOccupationSource,
    'sourceDoc' | 'sourceLineId' | 'qty' | 'quantityNumber' | 'status'
  >>;
};

export type WarehouseReplenishmentDocument = {
  type: '采购申请' | '采购订单' | '生产任务';
  code: string;
  status: string;
  path: string;
};

export type WarehouseReplenishmentSignal = {
  code: string;
  warehouseCode: string;
  warehouseName: string;
  materialCode: string;
  materialName: string;
  uom: string;
  availableQty: number;
  pendingInboundQty: number;
  inTransitQty: number;
  projectedQty: number;
  safetyStock: number;
  reorderPoint: number;
  maxStock: number;
  replenishmentLot: number;
  suggestedQty: number;
  thresholdStatus: '库存告急' | '需补货' | '在途覆盖' | '正常';
  status: '库存告急' | '需补货' | '补货处理中' | '在途覆盖' | '正常';
  actionRequired: boolean;
  availableRoutes: Array<'采购申请' | '生产任务'>;
  linkedDocument: WarehouseReplenishmentDocument | null;
  updatedAt: string;
  sourcePath: string;
  message: string;
};

export type InventoryOccupationSource = {
  type: '销售预留' | '生产分配' | '手动冻结' | '调拨占用';
  sourceDoc: string;
  sourceLineId?: string;
  qty: string;
  quantityNumber?: number;
  status: string;
  path?: string;
};

export type StockLedgerRow = {
  time: string;
  occurredAt?: string;
  inventoryKey?: string;
  materialCode?: string;
  item: string;
  itemType: string;
  batch: string;
  warehouse: string;
  warehouseCode?: string;
  location: string;
  movement: string;
  movementDirection?: '入库' | '出库' | '状态变更' | string;
  qty: string;
  quantityNumber?: number;
  uom?: string;
  balance: string;
  balanceFact?: string;
  beforeBalance?: string;
  afterBalance?: string;
  beforeBalanceNumber?: number;
  afterBalanceNumber?: number;
  sourceLineId?: string;
  documentLineId?: string;
  sourceDoc: string;
  reason: string;
  operator: string;
  reversalOf?: string;
  sourcePath?: string;
};

export type FinanceLine = {
  lineId?: string;
  sourceOrder?: string;
  sourceLineId?: string;
  sourceReceiptLineId?: string;
  materialCode?: string;
  name: string;
  model?: string;
  spec?: string;
  qty: string;
  unitPrice: string;
  amount: string;
  taxRate: string;
  uom?: string;
  imageLabel?: string;
  imageTone?: string;
  orderQty?: string;
  orderAmount?: string;
  previouslyInvoicedQty?: number;
  previouslyInvoicedAmount?: number;
  remainingQty?: number;
  remainingAmount?: number;
};

export type FinanceRecord = {
  code: string;
  companyCode?: string;
  company?: string;
  sourceDoc: string;
  sourceOrder?: string;
  partyCode?: string;
  party: string;
  contact: string;
  contactPhone?: string;
  amount: string;
  taxAmount: string;
  totalAmount: string;
  settledAmount: string;
  afterSalesAdjustmentAmount?: number;
  owner: string;
  status: string;
  documentStatus?: string;
  settlementStatus?: string;
  reversalCode?: string;
  redInvoiceCode?: string;
  refundCode?: string;
  refundStatus?: string;
  holdStatus?: '正常' | '已暂缓';
  holdReason?: string;
  holdAfterSaleCode?: string;
  heldAt?: string;
  heldBy?: string;
  resumedAt?: string;
  resumedBy?: string;
  reversedAt?: string;
  reversedBy?: string;
  date: string;
  dueDate: string;
  invoiceType: string;
  taxMode?: string;
  paymentMethod: string;
  bankAccount: string;
  lines: FinanceLine[];
  note: string;
};

export type FinanceSettlementEvent = {
  code: string;
  receivableCode?: string;
  payableCode?: string;
  sourceInvoice?: string;
  sourceOrder?: string;
  direction: '收款' | '付款';
  amount: string;
  transactionDate: string;
  method: string;
  account: string;
  reference?: string;
  note?: string;
  actor: string;
  idempotencyKey: string;
  createdAt: string;
};

export type PurchaseInvoiceMatchLine = {
  sourceLineId: string;
  materialCode: string;
  name: string;
  unit: string;
  orderedQty: number;
  postedQty: number;
  previouslyInvoicedQty: number;
  remainingQty: number;
  unitPrice: number;
  taxRate: string;
  orderAmount: number;
  previouslyInvoicedAmount: number;
  remainingAmount: number;
};

export type PurchaseInvoiceMatch = {
  sourceType?: 'purchase-receipt';
  sourceReceipt: string;
  sourceOrder: string;
  receiptStatus: string;
  lines: PurchaseInvoiceMatchLine[];
  blockedReasons: string[];
  warnings: string[];
  matched: boolean;
};

export type SalesInvoiceReversal = {
  code: string;
  sourceInvoice: string;
  sourceOrder: string;
  redInvoiceCode: string;
  refundCode?: string;
  reason: string;
  actor: string;
  status: '已生效';
  idempotencyKey: string;
  createdAt: string;
};

export type SalesRefund = {
  code: string;
  sourceInvoice: string;
  redInvoiceCode: string;
  partyCode?: string;
  party: string;
  amount: string;
  status: '待退款' | '已退款';
  reason: string;
  paymentMethod?: string;
  transactionRef?: string;
  createdAt: string;
  completedAt?: string;
  completedBy?: string;
};

export type ReferenceOption<T = Record<string, unknown>> = {
  id: string;
  code: string;
  name: string;
  primary: string;
  secondary: string;
  meta: string[];
  status: string;
  raw: T;
};

export type ReferenceResponse<T = Record<string, unknown>> = {
  items: ReferenceOption<T>[];
  total: number;
};
