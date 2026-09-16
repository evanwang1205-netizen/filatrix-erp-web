import { fileURLToPath } from 'node:url'

const GENERATED_AT = '2026-07-13T00:00:00.000Z'

const UOM = {
  pcs: 'UOM-PCS',
  kg: 'UOM-KG',
  set: 'UOM-SET'
}

const MATERIAL = {
  finishedA120: 'M-FG-A120',
  finishedB200: 'M-FG-B200',
  sensorB200: 'M-RM-SENSOR-B200',
  packageB200: 'M-PKG-B200'
}

const WAREHOUSE = {
  finished: 'WH-FINISHED',
  raw: 'WH-RAW',
  qc: 'WH-QC-HOLD'
}

const money = (amount, currency = 'CNY', taxRate = 0.13, taxMode = 'tax_included') => {
  const amountIncludingTax = taxMode === 'tax_excluded'
    ? round(amount * (1 + taxRate), 2)
    : amount
  const amountExcludingTax = taxMode === 'tax_included'
    ? round(amount / (1 + taxRate), 2)
    : amount
  const taxAmount = round(amountIncludingTax - amountExcludingTax, 2)

  return {
    amount,
    currency,
    taxMode,
    taxRate,
    taxAmount,
    amountExcludingTax,
    amountIncludingTax
  }
}

const qty = (value, uomId) => ({
  value,
  uomId
})

const ref = (docType, docId, lineId) => ({
  docType,
  docId,
  ...(lineId ? { lineId } : {})
})

const round = (value, digits = 6) => {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function createBusinessFactsSeed(generatedAt = GENERATED_AT) {
  const salesOrderA120 = {
    id: 'SO-GOLD-001',
    customerId: 'CUST-ALPHA',
    lifecycleStatus: 'confirmed',
    productionProgress: 'not_started',
    deliveryProgress: 'not_started',
    invoiceProgress: 'not_started',
    collectionProgress: 'not_started',
    exceptionStatus: 'normal',
    lines: [
      {
        lineId: 'L1',
        materialId: MATERIAL.finishedA120,
        demandQuantity: qty(20, UOM.pcs),
        reservedQuantity: qty(20, UOM.pcs),
        productionQuantity: qty(0, UOM.pcs),
        deliveredQuantity: qty(0, UOM.pcs),
        invoicedAmount: money(0),
        collectedAmount: money(0),
        internalDeliveryDate: '2026-07-20'
      }
    ]
  }

  const salesOrderB200 = {
    id: 'SO-GOLD-002',
    customerId: 'CUST-BETA',
    lifecycleStatus: 'confirmed',
    productionProgress: 'partial',
    deliveryProgress: 'not_started',
    invoiceProgress: 'not_started',
    collectionProgress: 'not_started',
    exceptionStatus: 'normal',
    lines: [
      {
        lineId: 'L1',
        materialId: MATERIAL.finishedB200,
        demandQuantity: qty(80, UOM.pcs),
        reservedQuantity: qty(0, UOM.pcs),
        productionQuantity: qty(80, UOM.pcs),
        deliveredQuantity: qty(0, UOM.pcs),
        invoicedAmount: money(0),
        collectedAmount: money(0),
        internalDeliveryDate: '2026-07-22'
      }
    ]
  }

  const allocationLinks = [
    {
      id: 'ALLOC-GOLD-001',
      relationType: 'stock_reservation',
      source: ref('sales_order', 'SO-GOLD-001', 'L1'),
      target: ref('inventory_reservation', 'RES-GOLD-001'),
      materialId: MATERIAL.finishedA120,
      quantity: qty(20, UOM.pcs),
      status: 'active',
      createdAt: generatedAt,
      updatedAt: generatedAt
    },
    {
      id: 'ALLOC-GOLD-002',
      relationType: 'production_fulfillment',
      source: ref('sales_order', 'SO-GOLD-002', 'L1'),
      target: ref('production_task', 'PT-GOLD-002', 'L1'),
      materialId: MATERIAL.finishedB200,
      quantity: qty(80, UOM.pcs),
      status: 'active',
      createdAt: generatedAt,
      updatedAt: generatedAt
    },
    {
      id: 'ALLOC-GOLD-003',
      relationType: 'material_request',
      source: ref('production_task', 'PT-GOLD-002', 'L1'),
      target: ref('production_material_request', 'PMR-GOLD-002', 'L1'),
      materialId: MATERIAL.sensorB200,
      quantity: qty(80, UOM.pcs),
      status: 'active',
      createdAt: generatedAt,
      updatedAt: generatedAt
    },
    {
      id: 'ALLOC-GOLD-004',
      relationType: 'purchase_requisition',
      source: ref('production_material_request', 'PMR-GOLD-002', 'L1'),
      target: ref('purchase_requisition', 'PR-GOLD-002', 'L1'),
      materialId: MATERIAL.sensorB200,
      quantity: qty(80, UOM.pcs),
      status: 'active',
      createdAt: generatedAt,
      updatedAt: generatedAt
    },
    {
      id: 'ALLOC-GOLD-005',
      relationType: 'receiving',
      source: ref('purchase_order', 'PO-GOLD-004', 'L1'),
      target: ref('purchase_receipt', 'RCV-GOLD-004', 'L1'),
      materialId: MATERIAL.sensorB200,
      quantity: qty(100, UOM.pcs),
      status: 'active',
      createdAt: generatedAt,
      updatedAt: generatedAt
    },
    {
      id: 'ALLOC-GOLD-006',
      relationType: 'quality_release',
      source: ref('quality_order', 'QC-GOLD-004', 'L1'),
      target: ref('inventory_ledger', 'LEDGER-GOLD-004-REL'),
      materialId: MATERIAL.sensorB200,
      quantity: qty(70, UOM.pcs),
      status: 'consumed',
      createdAt: generatedAt,
      updatedAt: generatedAt
    }
  ]

  const inventoryBalances = [
    {
      id: 'BAL-A120-FINISHED',
      materialId: MATERIAL.finishedA120,
      warehouseId: WAREHOUSE.finished,
      onHand: qty(50, UOM.pcs),
      qualifiedOnHand: qty(50, UOM.pcs),
      reserved: qty(20, UOM.pcs),
      allocated: qty(0, UOM.pcs),
      frozen: qty(0, UOM.pcs),
      qcHold: qty(0, UOM.pcs),
      pendingInbound: qty(0, UOM.pcs),
      inTransit: qty(0, UOM.pcs),
      available: qty(30, UOM.pcs),
      updatedAt: generatedAt
    },
    {
      id: 'BAL-B200-FINISHED',
      materialId: MATERIAL.finishedB200,
      warehouseId: WAREHOUSE.finished,
      onHand: qty(0, UOM.pcs),
      qualifiedOnHand: qty(0, UOM.pcs),
      reserved: qty(0, UOM.pcs),
      allocated: qty(0, UOM.pcs),
      frozen: qty(0, UOM.pcs),
      qcHold: qty(0, UOM.pcs),
      pendingInbound: qty(0, UOM.pcs),
      inTransit: qty(0, UOM.pcs),
      available: qty(0, UOM.pcs),
      updatedAt: generatedAt
    },
    {
      id: 'BAL-SENSOR-B200-RAW',
      materialId: MATERIAL.sensorB200,
      warehouseId: WAREHOUSE.raw,
      onHand: qty(100, UOM.pcs),
      qualifiedOnHand: qty(70, UOM.pcs),
      reserved: qty(0, UOM.pcs),
      allocated: qty(40, UOM.pcs),
      frozen: qty(0, UOM.pcs),
      qcHold: qty(30, UOM.pcs),
      pendingInbound: qty(0, UOM.pcs),
      inTransit: qty(0, UOM.pcs),
      available: qty(30, UOM.pcs),
      updatedAt: generatedAt
    },
    {
      id: 'BAL-PKG-B200-RAW',
      materialId: MATERIAL.packageB200,
      warehouseId: WAREHOUSE.raw,
      onHand: qty(100, UOM.set),
      qualifiedOnHand: qty(100, UOM.set),
      reserved: qty(0, UOM.set),
      allocated: qty(40, UOM.set),
      frozen: qty(0, UOM.set),
      qcHold: qty(0, UOM.set),
      pendingInbound: qty(0, UOM.set),
      inTransit: qty(0, UOM.set),
      available: qty(60, UOM.set),
      updatedAt: generatedAt
    }
  ]

  const inventoryReservations = [
    {
      id: 'RES-GOLD-001',
      materialId: MATERIAL.finishedA120,
      warehouseId: WAREHOUSE.finished,
      source: ref('sales_order', 'SO-GOLD-001', 'L1'),
      reservedQuantity: qty(20, UOM.pcs),
      consumedQuantity: qty(0, UOM.pcs),
      releasedQuantity: qty(0, UOM.pcs),
      requiredAt: '2026-07-20',
      status: 'active',
      createdAt: generatedAt,
      updatedAt: generatedAt
    }
  ]

  const inventoryLedger = [
    {
      id: 'LEDGER-GOLD-001-RES',
      eventType: 'reserve',
      materialId: MATERIAL.finishedA120,
      warehouseId: WAREHOUSE.finished,
      quantity: qty(20, UOM.pcs),
      stockStatus: 'qualified',
      source: ref('inventory_reservation', 'RES-GOLD-001'),
      occurredAt: generatedAt,
      actorId: 'EMP-SALES-01',
      balanceAfter: qty(30, UOM.pcs),
      remark: 'Reserve finished goods for confirmed sales order line.'
    },
    {
      id: 'LEDGER-GOLD-004-HOLD',
      eventType: 'receive_to_qc_hold',
      materialId: MATERIAL.sensorB200,
      warehouseId: WAREHOUSE.raw,
      quantity: qty(100, UOM.pcs),
      stockStatus: 'qc_hold',
      source: ref('purchase_receipt', 'RCV-GOLD-004', 'L1'),
      occurredAt: generatedAt,
      actorId: 'EMP-WH-01',
      remark: 'Received goods are held before incoming quality inspection.'
    },
    {
      id: 'LEDGER-GOLD-004-REL',
      eventType: 'quality_release',
      materialId: MATERIAL.sensorB200,
      warehouseId: WAREHOUSE.raw,
      quantity: qty(70, UOM.pcs),
      stockStatus: 'qualified',
      source: ref('quality_order', 'QC-GOLD-004', 'L1'),
      occurredAt: generatedAt,
      actorId: 'EMP-QA-01',
      balanceAfter: qty(70, UOM.pcs),
      remark: 'Accepted quantity moved from QC hold to qualified stock.'
    }
  ]

  const receivings = [
    {
      id: 'RCV-GOLD-004',
      supplierId: 'SUP-SENSOR',
      warehouseId: WAREHOUSE.raw,
      purchaseOrder: ref('purchase_order', 'PO-GOLD-004'),
      receivedAt: generatedAt,
      lifecycleStatus: 'completed',
      lines: [
        {
          lineId: 'L1',
          materialId: MATERIAL.sensorB200,
          purchaseOrderLine: ref('purchase_order', 'PO-GOLD-004', 'L1'),
          receivedQuantity: qty(100, UOM.pcs),
          qcRequired: true,
          qcHoldQuantity: qty(30, UOM.pcs),
          acceptedQuantity: qty(70, UOM.pcs),
          rejectedQuantity: qty(30, UOM.pcs),
          stockStatus: 'partial_released'
        }
      ]
    }
  ]

  const qualityDispositions = [
    {
      id: 'DISP-GOLD-004',
      qualityOrderId: 'QC-GOLD-004',
      source: ref('purchase_receipt', 'RCV-GOLD-004', 'L1'),
      materialId: MATERIAL.sensorB200,
      inspectedQuantity: qty(100, UOM.pcs),
      decisions: [
        {
          type: 'accept',
          quantity: qty(70, UOM.pcs),
          reason: 'Incoming inspection passed.'
        },
        {
          type: 'return_to_supplier',
          quantity: qty(10, UOM.pcs),
          reason: 'Appearance defect beyond tolerance.'
        },
        {
          type: 'quarantine',
          quantity: qty(20, UOM.pcs),
          reason: 'Pending supplier concession decision.'
        }
      ],
      conclusion: 'partially_accepted',
      decidedAt: generatedAt
    }
  ]

  const productionTasks = [
    {
      id: 'PT-GOLD-002',
      lifecycleStatus: 'in_progress',
      priority: 'urgent',
      source: ref('sales_order', 'SO-GOLD-002', 'L1'),
      ownerId: 'EMP-PROD-01',
      dueDate: '2026-07-22',
      materialReadiness: 'partial_ready',
      workOrderProgress: 'partial',
      inboundProgress: 'not_started',
      exceptionStatus: 'normal',
      lines: [
        {
          lineId: 'L1',
          finishedMaterialId: MATERIAL.finishedB200,
          demandQuantity: qty(80, UOM.pcs),
          reservedStockQuantity: qty(0, UOM.pcs),
          productionGapQuantity: qty(80, UOM.pcs),
          workOrderPlannedQuantity: qty(80, UOM.pcs),
          inboundQuantity: qty(0, UOM.pcs)
        }
      ]
    }
  ]

  const productionMaterialRequests = [
    {
      id: 'PMR-GOLD-002',
      lifecycleStatus: 'in_progress',
      requestReason: 'task_shortage',
      sourceTask: ref('production_task', 'PT-GOLD-002', 'L1'),
      requestedBy: 'EMP-PROD-01',
      requiredAt: '2026-07-18',
      lines: [
        {
          lineId: 'L1',
          materialId: MATERIAL.sensorB200,
          requestedQuantity: qty(80, UOM.pcs),
          warehouseFulfilledQuantity: qty(0, UOM.pcs),
          purchaseRequestedQuantity: qty(80, UOM.pcs),
          shortageQuantity: qty(80, UOM.pcs),
          purchaseRequisition: ref('purchase_requisition', 'PR-GOLD-002', 'L1')
        }
      ]
    }
  ]

  const workOrders = [
    {
      id: 'WO-GOLD-002',
      task: ref('production_task', 'PT-GOLD-002', 'L1'),
      lifecycleStatus: 'in_progress',
      materialReleaseStatus: 'partial_released',
      processProgressStatus: 'partial',
      qualityProgressStatus: 'not_started',
      finishedMaterialId: MATERIAL.finishedB200,
      recipe: ref('material', 'BOM-GOLD-B200-V1'),
      processTemplate: ref('material', 'PRC-GOLD-B200-V1'),
      plannedQuantity: qty(80, UOM.pcs),
      releasedQuantity: qty(40, UOM.pcs),
      completedQuantity: qty(0, UOM.pcs),
      inboundQuantity: qty(0, UOM.pcs),
      ownerId: 'EMP-PROD-LEAD-01'
    }
  ]

  const workOrderReleases = [
    {
      id: 'REL-GOLD-002-1',
      workOrder: ref('work_order', 'WO-GOLD-002'),
      releaseQuantity: qty(40, UOM.pcs),
      materialCheckStatus: 'partial_passed',
      releasedAt: generatedAt,
      lines: [
        {
          lineId: 'L1',
          materialId: MATERIAL.sensorB200,
          requiredQuantity: qty(40, UOM.pcs),
          releasedQuantity: qty(40, UOM.pcs),
          shortageQuantity: qty(0, UOM.pcs)
        },
        {
          lineId: 'L2',
          materialId: MATERIAL.packageB200,
          requiredQuantity: qty(40, UOM.set),
          releasedQuantity: qty(40, UOM.set),
          shortageQuantity: qty(0, UOM.set)
        }
      ]
    }
  ]

  const productionBatches = [
    {
      id: 'PB-GOLD-002-1',
      workOrder: ref('work_order', 'WO-GOLD-002'),
      release: ref('work_order_release', 'REL-GOLD-002-1'),
      batchNo: 'PB-260713-B200-01',
      startedAt: generatedAt,
      lifecycleStatus: 'running',
      inputMaterials: [
        {
          materialId: MATERIAL.sensorB200,
          quantity: qty(40, UOM.pcs)
        },
        {
          materialId: MATERIAL.packageB200,
          quantity: qty(40, UOM.set)
        }
      ],
      outputMaterialId: MATERIAL.finishedB200,
      outputQuantity: qty(0, UOM.pcs)
    }
  ]

  const processInstances = [
    {
      id: 'PROC-GOLD-002-ISSUE',
      batch: ref('production_batch', 'PB-GOLD-002-1'),
      stepId: 'P2-STEP-MATERIAL-ISSUE',
      sequence: 1,
      lifecycleStatus: 'completed',
      actionStatus: 'done',
      startedAt: generatedAt,
      completedAt: generatedAt
    },
    {
      id: 'PROC-GOLD-002-STARTUP',
      batch: ref('production_batch', 'PB-GOLD-002-1'),
      stepId: 'P2-STEP-STARTUP',
      sequence: 2,
      lifecycleStatus: 'active',
      actionStatus: 'waiting_action',
      startedAt: generatedAt
    },
    {
      id: 'PROC-GOLD-002-FIRST-QC',
      batch: ref('production_batch', 'PB-GOLD-002-1'),
      stepId: 'P2-STEP-FIRST-INSPECTION',
      sequence: 3,
      lifecycleStatus: 'waiting',
      actionStatus: 'waiting_external',
      blockingReason: 'Waiting for startup confirmation before creating first inspection.'
    }
  ]

  const invoices = [
    {
      id: 'INV-GOLD-001',
      lifecycleStatus: 'confirmed',
      invoiceType: 'sales',
      counterpartyId: 'CUST-ALPHA',
      sourceLinks: [
        {
          id: 'ALLOC-GOLD-INV-001',
          relationType: 'invoice_matching',
          source: ref('sales_order', 'SO-GOLD-001', 'L1'),
          target: ref('invoice', 'INV-GOLD-001', 'L1'),
          materialId: MATERIAL.finishedA120,
          quantity: qty(20, UOM.pcs),
          status: 'active',
          createdAt: generatedAt,
          updatedAt: generatedAt
        }
      ],
      totalAmount: money(24000),
      settledAmount: money(12000)
    }
  ]

  const settlements = [
    {
      id: 'SETTLE-GOLD-001',
      lifecycleStatus: 'completed',
      settlementType: 'collection',
      counterpartyId: 'CUST-ALPHA',
      amount: money(12000),
      sourceLinks: [
        {
          id: 'ALLOC-GOLD-PAY-001',
          relationType: 'payment_matching',
          source: ref('settlement', 'SETTLE-GOLD-001'),
          target: ref('invoice', 'INV-GOLD-001'),
          status: 'consumed',
          createdAt: generatedAt,
          updatedAt: generatedAt
        }
      ],
      settledAt: generatedAt
    }
  ]

  return {
    version: 2,
    generatedAt,
    facts: {
      salesOrders: [salesOrderA120, salesOrderB200],
      allocationLinks,
      inventoryBalances,
      inventoryReservations,
      inventoryLedger,
      receivings,
      qualityDispositions,
      productionTasks,
      productionMaterialRequests,
      workOrders,
      workOrderReleases,
      productionBatches,
      processInstances,
      invoices,
      settlements
    },
    views: {
      inventoryAvailabilityRule: 'available = qualifiedOnHand - reserved - allocated - frozen',
      productionMainChain: [
        'sales_order_line',
        'inventory_reservation_or_production_gap',
        'production_task',
        'planned_work_order',
        'work_order_release',
        'material_issue',
        'production_batch',
        'quality_check',
        'finished_goods_receipt',
        'sales_delivery',
        'invoice',
        'settlement'
      ],
      purchaseMaterialChain: [
        'material_shortage',
        'production_material_request',
        'purchase_requisition',
        'purchase_order',
        'receive_to_qc_hold',
        'incoming_quality_disposition',
        'qualified_stock_release'
      ]
    }
  }
}

export function createBusinessFactsSummary(data = createBusinessFactsSeed()) {
  return Object.fromEntries(
    Object.entries(data.facts).map(([name, rows]) => [name, rows.length])
  )
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const data = createBusinessFactsSeed()
  console.log(JSON.stringify({
    version: data.version,
    generatedAt: data.generatedAt,
    summary: createBusinessFactsSummary(data),
    views: data.views
  }, null, 2))
}
