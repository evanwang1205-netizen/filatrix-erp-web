export type Quantity = {
  value: number
  uomId: string
}

export type Money = {
  amount: number
  currency: string
  taxMode: 'tax_included' | 'tax_excluded' | 'tax_exempt'
  taxRate: number
  taxAmount: number
  amountExcludingTax: number
  amountIncludingTax: number
}

export type DocumentType =
  | 'sales_quote'
  | 'sales_order'
  | 'sales_delivery'
  | 'sales_return'
  | 'ecommerce_order'
  | 'purchase_requisition'
  | 'purchase_order'
  | 'purchase_receipt'
  | 'purchase_return'
  | 'production_task'
  | 'production_material_request'
  | 'work_order'
  | 'work_order_release'
  | 'production_batch'
  | 'process_instance'
  | 'quality_order'
  | 'warehouse_move'
  | 'inventory_reservation'
  | 'inventory_ledger'
  | 'invoice'
  | 'settlement'
  | 'material'
  | 'warehouse'

export type DocumentLineRef = {
  docType: DocumentType
  docId: string
  lineId?: string
}

export type LifecycleStatus =
  | 'draft'
  | 'pending_confirm'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'closed'
  | 'voided'

export type ProgressStatus =
  | 'not_started'
  | 'partial'
  | 'completed'
  | 'blocked'
  | 'cancelled'

export type ExceptionStatus = 'normal' | 'has_exception' | 'exception_processing' | 'exception_closed'

export type AllocationRelationType =
  | 'stock_reservation'
  | 'production_fulfillment'
  | 'material_request'
  | 'purchase_requisition'
  | 'purchase_order'
  | 'receiving'
  | 'quality_release'
  | 'warehouse_issue'
  | 'warehouse_receipt'
  | 'invoice_matching'
  | 'payment_matching'
  | 'return_reversal'

export type AllocationLink = {
  id: string
  relationType: AllocationRelationType
  source: DocumentLineRef
  target: DocumentLineRef
  materialId?: string
  quantity?: Quantity
  status: 'planned' | 'active' | 'consumed' | 'released' | 'closed' | 'cancelled'
  createdAt: string
  updatedAt: string
}

export type InventoryStockStatus =
  | 'qualified'
  | 'qc_hold'
  | 'frozen'
  | 'quarantine'
  | 'in_transit'
  | 'returned'
  | 'scrapped'

export type InventoryBalance = {
  id: string
  materialId: string
  warehouseId: string
  batchId?: string
  onHand: Quantity
  qualifiedOnHand: Quantity
  reserved: Quantity
  allocated: Quantity
  frozen: Quantity
  qcHold: Quantity
  pendingInbound: Quantity
  inTransit: Quantity
  available: Quantity
  updatedAt: string
}

export type InventoryReservation = {
  id: string
  materialId: string
  warehouseId: string
  batchId?: string
  source: DocumentLineRef
  reservedQuantity: Quantity
  consumedQuantity: Quantity
  releasedQuantity: Quantity
  requiredAt?: string
  status: 'active' | 'partially_consumed' | 'consumed' | 'released' | 'expired' | 'cancelled'
  createdAt: string
  updatedAt: string
}

export type InventoryLedgerEventType =
  | 'reserve'
  | 'release_reservation'
  | 'receive_to_qc_hold'
  | 'quality_release'
  | 'quality_reject'
  | 'issue_to_work_order'
  | 'return_from_work_order'
  | 'finished_goods_receipt'
  | 'sales_issue'
  | 'transfer_out'
  | 'transfer_in'
  | 'stocktake_adjustment'
  | 'scrap'

export type InventoryLedgerEntry = {
  id: string
  eventType: InventoryLedgerEventType
  materialId: string
  warehouseId: string
  batchId?: string
  quantity: Quantity
  stockStatus: InventoryStockStatus
  source: DocumentLineRef
  occurredAt: string
  actorId: string
  balanceAfter?: Quantity
  remark?: string
}

export type ReceivingLineFact = {
  lineId: string
  materialId: string
  purchaseOrderLine?: DocumentLineRef
  receivedQuantity: Quantity
  qcRequired: boolean
  qcHoldQuantity: Quantity
  acceptedQuantity: Quantity
  rejectedQuantity: Quantity
  stockStatus: 'waiting_qc' | 'partial_released' | 'released' | 'rejected' | 'returned'
}

export type ReceivingFact = {
  id: string
  supplierId: string
  warehouseId: string
  purchaseOrder?: DocumentLineRef
  receivedAt: string
  lifecycleStatus: LifecycleStatus
  lines: ReceivingLineFact[]
}

export type QualityDecisionType =
  | 'accept'
  | 'concession'
  | 'return_to_supplier'
  | 'quarantine'
  | 'rework'
  | 'scrap'
  | 'reinspect'

export type QualityDisposition = {
  id: string
  qualityOrderId: string
  source: DocumentLineRef
  materialId: string
  inspectedQuantity: Quantity
  decisions: Array<{
    type: QualityDecisionType
    quantity: Quantity
    reason?: string
    approvedBy?: string
  }>
  conclusion: 'pending' | 'accepted' | 'partially_accepted' | 'rejected' | 'concession'
  decidedAt?: string
}

export type SalesOrderFact = {
  id: string
  customerId: string
  lifecycleStatus: LifecycleStatus
  productionProgress: ProgressStatus
  deliveryProgress: ProgressStatus
  invoiceProgress: ProgressStatus
  collectionProgress: ProgressStatus
  exceptionStatus: ExceptionStatus
  lines: Array<{
    lineId: string
    materialId: string
    demandQuantity: Quantity
    reservedQuantity: Quantity
    productionQuantity: Quantity
    deliveredQuantity: Quantity
    invoicedAmount: Money
    collectedAmount: Money
    internalDeliveryDate: string
  }>
}

export type ProductionTaskFact = {
  id: string
  lifecycleStatus: LifecycleStatus
  priority: 'normal' | 'urgent'
  source?: DocumentLineRef
  ownerId: string
  dueDate?: string
  materialReadiness: 'kit_ready' | 'partial_ready' | 'shortage' | 'waiting_qc'
  workOrderProgress: ProgressStatus
  inboundProgress: ProgressStatus
  exceptionStatus: ExceptionStatus
  lines: Array<{
    lineId: string
    finishedMaterialId: string
    demandQuantity: Quantity
    reservedStockQuantity: Quantity
    productionGapQuantity: Quantity
    workOrderPlannedQuantity: Quantity
    inboundQuantity: Quantity
  }>
}

export type ProductionMaterialRequest = {
  id: string
  lifecycleStatus: LifecycleStatus
  requestReason: 'task_shortage' | 'extra_stock' | 'substitution' | 'rework' | 'manual'
  sourceTask?: DocumentLineRef
  requestedBy: string
  requiredAt?: string
  lines: Array<{
    lineId: string
    materialId: string
    requestedQuantity: Quantity
    warehouseFulfilledQuantity: Quantity
    purchaseRequestedQuantity: Quantity
    shortageQuantity: Quantity
    purchaseRequisition?: DocumentLineRef
  }>
}

export type WorkOrderFact = {
  id: string
  task?: DocumentLineRef
  lifecycleStatus: LifecycleStatus
  materialReleaseStatus: 'not_released' | 'partial_released' | 'released' | 'blocked'
  processProgressStatus: ProgressStatus
  qualityProgressStatus: ProgressStatus
  finishedMaterialId: string
  recipe?: DocumentLineRef
  processTemplate?: DocumentLineRef
  plannedQuantity: Quantity
  releasedQuantity: Quantity
  completedQuantity: Quantity
  inboundQuantity: Quantity
  ownerId: string
}

export type WorkOrderRelease = {
  id: string
  workOrder: DocumentLineRef
  releaseQuantity: Quantity
  materialCheckStatus: 'passed' | 'partial_passed' | 'blocked'
  releasedAt?: string
  lines: Array<{
    lineId: string
    materialId: string
    requiredQuantity: Quantity
    releasedQuantity: Quantity
    shortageQuantity: Quantity
  }>
}

export type ProductionBatch = {
  id: string
  workOrder: DocumentLineRef
  release?: DocumentLineRef
  batchNo: string
  startedAt?: string
  completedAt?: string
  lifecycleStatus: 'planned' | 'running' | 'paused' | 'completed' | 'closed'
  inputMaterials: Array<{
    materialId: string
    quantity: Quantity
    batchId?: string
  }>
  outputMaterialId: string
  outputQuantity: Quantity
}

export type ProcessInstance = {
  id: string
  batch: DocumentLineRef
  stepId: string
  sequence: number
  lifecycleStatus: 'waiting' | 'active' | 'completed' | 'skipped' | 'blocked'
  actionStatus: 'not_required' | 'waiting_action' | 'waiting_external' | 'done' | 'failed'
  startedAt?: string
  completedAt?: string
  blockingReason?: string
}

export type InvoiceFact = {
  id: string
  lifecycleStatus: LifecycleStatus
  invoiceType: 'sales' | 'purchase' | 'credit_note' | 'debit_note'
  counterpartyId: string
  sourceLinks: AllocationLink[]
  totalAmount: Money
  settledAmount: Money
}

export type SettlementFact = {
  id: string
  lifecycleStatus: LifecycleStatus
  settlementType: 'collection' | 'payment' | 'refund'
  counterpartyId: string
  amount: Money
  sourceLinks: AllocationLink[]
  settledAt?: string
}

export type BusinessFactsData = {
  version: 2
  generatedAt: string
  facts: {
    salesOrders: SalesOrderFact[]
    allocationLinks: AllocationLink[]
    inventoryBalances: InventoryBalance[]
    inventoryReservations: InventoryReservation[]
    inventoryLedger: InventoryLedgerEntry[]
    receivings: ReceivingFact[]
    qualityDispositions: QualityDisposition[]
    productionTasks: ProductionTaskFact[]
    productionMaterialRequests: ProductionMaterialRequest[]
    workOrders: WorkOrderFact[]
    workOrderReleases: WorkOrderRelease[]
    productionBatches: ProductionBatch[]
    processInstances: ProcessInstance[]
    invoices: InvoiceFact[]
    settlements: SettlementFact[]
  }
}
