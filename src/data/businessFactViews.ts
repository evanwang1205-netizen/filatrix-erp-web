import type {
  BusinessFactsData,
  DocumentLineRef,
  LifecycleStatus,
  ProgressStatus,
  Quantity
} from '@/types/businessFacts'

export type InventoryAvailabilityRow = {
  id: string
  materialId: string
  warehouseId: string
  onHand: Quantity
  qualifiedOnHand: Quantity
  reserved: Quantity
  allocated: Quantity
  frozen: Quantity
  qcHold: Quantity
  pendingInbound: Quantity
  inTransit: Quantity
  available: Quantity
}

export type SalesOrderProgressRow = {
  id: string
  customerId: string
  lifecycleStatus: LifecycleStatus
  productionProgress: ProgressStatus
  deliveryProgress: ProgressStatus
  invoiceProgress: ProgressStatus
  collectionProgress: ProgressStatus
  exceptionStatus: string
  totalDemandValue: number
  reservedValue: number
  productionValue: number
  deliveredValue: number
  lineCount: number
}

export type ProductionTaskListRow = {
  id: string
  lifecycleStatus: LifecycleStatus
  priority: 'normal' | 'urgent'
  ownerId: string
  dueDate?: string
  source?: DocumentLineRef
  demandValue: number
  finishedMaterialIds: string[]
  materialReadiness: string
  workOrderCount: number
  releasedWorkOrderCount: number
  materialRequestCount: number
  shortageItemCount: number
  inboundProgress: ProgressStatus
  nextAction:
    | 'confirm_task'
    | 'create_material_request'
    | 'create_work_order'
    | 'release_work_order'
    | 'follow_work_order'
    | 'close_task'
}

export function deriveInventoryAvailabilityRows(data: BusinessFactsData): InventoryAvailabilityRow[] {
  return data.facts.inventoryBalances.map((balance) => ({
    id: balance.id,
    materialId: balance.materialId,
    warehouseId: balance.warehouseId,
    onHand: balance.onHand,
    qualifiedOnHand: balance.qualifiedOnHand,
    reserved: balance.reserved,
    allocated: balance.allocated,
    frozen: balance.frozen,
    qcHold: balance.qcHold,
    pendingInbound: balance.pendingInbound,
    inTransit: balance.inTransit,
    available: balance.available
  }))
}

export function deriveSalesOrderProgressRows(data: BusinessFactsData): SalesOrderProgressRow[] {
  return data.facts.salesOrders.map((order) => ({
    id: order.id,
    customerId: order.customerId,
    lifecycleStatus: order.lifecycleStatus,
    productionProgress: order.productionProgress,
    deliveryProgress: order.deliveryProgress,
    invoiceProgress: order.invoiceProgress,
    collectionProgress: order.collectionProgress,
    exceptionStatus: order.exceptionStatus,
    totalDemandValue: sumQuantities(order.lines.map((line) => line.demandQuantity)),
    reservedValue: sumQuantities(order.lines.map((line) => line.reservedQuantity)),
    productionValue: sumQuantities(order.lines.map((line) => line.productionQuantity)),
    deliveredValue: sumQuantities(order.lines.map((line) => line.deliveredQuantity)),
    lineCount: order.lines.length
  }))
}

export function deriveProductionTaskListRows(data: BusinessFactsData): ProductionTaskListRow[] {
  return data.facts.productionTasks.map((task) => {
    const workOrders = data.facts.workOrders.filter((workOrder) => sameDocument(workOrder.task, task.id))
    const materialRequests = data.facts.productionMaterialRequests.filter((request) =>
      sameDocument(request.sourceTask, task.id)
    )
    const shortageItemCount = materialRequests.reduce(
      (total, request) => total + request.lines.filter((line) => line.shortageQuantity.value > 0).length,
      0
    )
    const releasedWorkOrderCount = workOrders.filter((workOrder) =>
      workOrder.materialReleaseStatus === 'partial_released' || workOrder.materialReleaseStatus === 'released'
    ).length

    return {
      id: task.id,
      lifecycleStatus: task.lifecycleStatus,
      priority: task.priority,
      ownerId: task.ownerId,
      dueDate: task.dueDate,
      source: task.source,
      demandValue: sumQuantities(task.lines.map((line) => line.demandQuantity)),
      finishedMaterialIds: [...new Set(task.lines.map((line) => line.finishedMaterialId))],
      materialReadiness: task.materialReadiness,
      workOrderCount: workOrders.length,
      releasedWorkOrderCount,
      materialRequestCount: materialRequests.length,
      shortageItemCount,
      inboundProgress: task.inboundProgress,
      nextAction: deriveProductionTaskNextAction(task.lifecycleStatus, workOrders.length, releasedWorkOrderCount, shortageItemCount)
    }
  })
}

export function formatQuantity(quantity: Quantity, uomLabels: Record<string, string> = defaultUomLabels): string {
  const label = uomLabels[quantity.uomId] ?? quantity.uomId
  return `${quantity.value}${label}`
}

const defaultUomLabels: Record<string, string> = {
  'UOM-PCS': '件',
  'UOM-KG': 'kg',
  'UOM-SET': '套'
}

function sumQuantities(quantities: Quantity[]): number {
  return quantities.reduce((total, quantity) => total + quantity.value, 0)
}

function sameDocument(ref: DocumentLineRef | undefined, docId: string): boolean {
  return ref?.docId === docId
}

function deriveProductionTaskNextAction(
  lifecycleStatus: LifecycleStatus,
  workOrderCount: number,
  releasedWorkOrderCount: number,
  shortageItemCount: number
): ProductionTaskListRow['nextAction'] {
  if (lifecycleStatus === 'draft') {
    return 'confirm_task'
  }

  if (shortageItemCount > 0 && workOrderCount === 0) {
    return 'create_material_request'
  }

  if (workOrderCount === 0) {
    return 'create_work_order'
  }

  if (releasedWorkOrderCount === 0) {
    return 'release_work_order'
  }

  if (lifecycleStatus === 'completed') {
    return 'close_task'
  }

  return 'follow_work_order'
}
