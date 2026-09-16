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

function addMissingByKey(target, rows) {
  const keys = new Set(target.map((row) => row.key));
  rows.forEach((row) => {
    if (!keys.has(row.key)) target.push(row);
  });
}

function addMissingLedgerRows(target, rows) {
  rows.forEach((row) => {
    const existing = target.find((item) => (
      item.sourceDoc === row.sourceDoc
      && item.reason === row.reason
      && item.batch === row.batch
    ));
    if (existing) Object.assign(existing, row);
    else target.push(row);
  });
}

function ensureArray(target, key) {
  target[key] ||= [];
  return target[key];
}

export function applyWarehouseGoldenScenarios(data) {
  data.warehouse ||= {};
  const warehouse = data.warehouse;
  warehouse.salesIssues ||= [];
  warehouse.otherMoves ||= [];
  warehouse.transfers ||= [];
  warehouse.stocktakes ||= [];
  warehouse.inventory ||= [];
  warehouse.stockLedger ||= [];
  warehouse.salesIssueFlowRecords ||= {};
  warehouse.otherMoveFlowRecords ||= {};
  warehouse.transferFlowRecords ||= {};
  warehouse.stocktakeFlowRecords ||= {};

  addMissingByKey(warehouse.inventory, [
    {
      key: 'M-RM-PETG-VIRGIN::WH-QC-HOLD::QC-AUTO::PETG-260712-A',
      materialCode: 'M-RM-PETG-VIRGIN',
      item: 'PETG 原生粒子',
      itemType: '原料',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      location: 'QC-AUTO',
      batch: 'PETG-260712-A',
      onHandNumber: 1000,
      qualifiedOnHandNumber: 0,
      reservedNumber: 0,
      allocatedNumber: 0,
      frozenNumber: 0,
      qcHoldNumber: 270,
      pendingInboundNumber: 650,
      rejectedHoldNumber: 80,
      inTransitNumber: 0,
      outboundPlanNumber: 0,
      uom: 'kg',
      sourceDoc: 'WR-20260712-001',
      qcStatus: '部分判定',
      status: '待检',
      lastMovement: '部分质检判定 WR-20260712-001',
      updatedAt: '2026-07-12 14:20',
    },
    {
      key: 'M-CM-MATTE-BLK::WH-RM::RM-02-05::MB-MBK-260702-A',
      materialCode: 'M-CM-MATTE-BLK',
      item: '哑光黑色母',
      itemType: '色母',
      warehouseCode: 'WH-RM',
      warehouse: '原料仓',
      location: 'RM-02-05',
      batch: 'MB-MBK-260702-A',
      onHandNumber: 300,
      qualifiedOnHandNumber: 300,
      reservedNumber: 0,
      allocatedNumber: 0,
      frozenNumber: 0,
      qcHoldNumber: 0,
      pendingInboundNumber: 0,
      inTransitNumber: 0,
      outboundPlanNumber: 0,
      uom: 'kg',
      sourceDoc: 'WR-20260702-001',
      qcStatus: '合格',
      status: '正常',
      lastMovement: '采购入库 WR-20260702-001',
      updatedAt: '2026-07-02 15:35',
    },
    {
      key: 'M-RM-PLA-VIRGIN::WH-RM::RM-01-01::PLA-260717-A',
      materialCode: 'M-RM-PLA-VIRGIN',
      item: 'PLA 原生粒子',
      itemType: '原料',
      warehouseCode: 'WH-RM',
      warehouse: '原料仓',
      location: 'RM-01-01',
      batch: 'PLA-260717-A',
      onHandNumber: 600,
      qualifiedOnHandNumber: 600,
      reservedNumber: 0,
      allocatedNumber: 0,
      frozenNumber: 0,
      qcHoldNumber: 0,
      pendingInboundNumber: 0,
      inTransitNumber: 0,
      outboundPlanNumber: 0,
      uom: 'kg',
      sourceDoc: 'WR-20260717-003',
      qcStatus: '合格',
      status: '正常',
      lastMovement: '采购入库 WR-20260717-003',
      updatedAt: '2026-07-17 11:20',
    },
  ]);

  addMissingLedgerRows(warehouse.stockLedger, [
    {
      time: '2026-07-16 16:40',
      item: 'PLA 1.75mm 哑光黑耗材 1kg',
      itemType: '成品',
      materialCode: 'M-FG-PLA-175-MBK',
      batch: 'PLA-MBK-260714-A',
      warehouseCode: 'WH-FG',
      warehouse: '成品仓',
      location: 'FG-01-04',
      movement: '出库',
      qty: '-80 卷',
      balance: '280 卷',
      balanceFact: '物理在库',
      beforeBalance: '360 卷',
      afterBalance: '280 卷',
      sourceLineId: 'L1',
      documentLineId: 'WS-20260716-004-L1',
      sourceDoc: 'WS-20260716-004',
      reason: '销售出库',
      operator: '王倩',
    },
    {
      time: '2026-07-12 14:20',
      item: 'PETG 原生粒子',
      itemType: '原料',
      materialCode: 'M-RM-PETG-VIRGIN',
      batch: 'PETG-260712-A',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      location: 'QC-AUTO',
      movement: '质检放行',
      qty: '+650 kg',
      balance: '650 kg',
      balanceFact: '待入库',
      beforeBalance: '0 kg',
      afterBalance: '650 kg',
      sourceLineId: 'L1',
      documentLineId: 'WR-20260712-001-L1',
      sourceDoc: 'WR-20260712-001',
      reason: '部分质检放行，待仓库入库',
      operator: '林珊',
    },
    {
      time: '2026-07-12 09:15',
      item: 'PETG 原生粒子',
      itemType: '原料',
      materialCode: 'M-RM-PETG-VIRGIN',
      batch: 'PETG-260712-A',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      location: 'QC-AUTO',
      movement: '质检冻结',
      qty: '+1,000 kg',
      balance: '1,000 kg',
      balanceFact: '待检',
      beforeBalance: '0 kg',
      afterBalance: '1,000 kg',
      sourceLineId: 'L1',
      documentLineId: 'WR-20260712-001-L1',
      sourceDoc: 'WR-20260712-001',
      reason: '采购到货，进入来料质检',
      operator: '王倩',
    },
    {
      time: '2026-07-12 09:15',
      item: 'PETG 原生粒子',
      itemType: '原料',
      materialCode: 'M-RM-PETG-VIRGIN',
      batch: 'PETG-260712-A',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      location: 'QC-AUTO',
      movement: '采购到货',
      qty: '+1,000 kg',
      quantityNumber: 1000,
      balance: '1,000 kg',
      balanceFact: '物理在库',
      beforeBalance: '0 kg',
      afterBalance: '1,000 kg',
      beforeBalanceNumber: 0,
      afterBalanceNumber: 1000,
      sourceLineId: 'L1',
      documentLineId: 'WR-20260712-001-L1',
      sourceDoc: 'WR-20260712-001',
      reason: '采购到货进入采购暂存区',
      operator: '王倩',
    },
    {
      time: '2026-07-12 14:20',
      item: 'PETG 原生粒子',
      itemType: '原料',
      materialCode: 'M-RM-PETG-VIRGIN',
      batch: 'PETG-260712-A',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      location: 'QC-AUTO',
      movement: '质检解冻',
      qty: '-730 kg',
      quantityNumber: -730,
      balance: '270 kg',
      balanceFact: '待检',
      beforeBalance: '1,000 kg',
      afterBalance: '270 kg',
      beforeBalanceNumber: 1000,
      afterBalanceNumber: 270,
      sourceLineId: 'L1',
      documentLineId: 'WR-20260712-001-L1',
      sourceDoc: 'WR-20260712-001',
      reason: '质检判定释放 650 kg、隔离 80 kg',
      operator: '林珊',
    },
    {
      time: '2026-07-12 14:20',
      item: 'PETG 原生粒子',
      itemType: '原料',
      materialCode: 'M-RM-PETG-VIRGIN',
      batch: 'PETG-260712-A',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      location: 'QC-AUTO',
      movement: '不合格隔离',
      qty: '+80 kg',
      quantityNumber: 80,
      balance: '80 kg',
      balanceFact: '不合格隔离',
      beforeBalance: '0 kg',
      afterBalance: '80 kg',
      beforeBalanceNumber: 0,
      afterBalanceNumber: 80,
      sourceLineId: 'L1',
      documentLineId: 'WR-20260712-001-L1',
      sourceDoc: 'WR-20260712-001',
      reason: '质检判定隔离 80 kg',
      operator: '林珊',
    },
    {
      time: '2026-07-02 15:35',
      item: '哑光黑色母',
      itemType: '色母',
      materialCode: 'M-CM-MATTE-BLK',
      batch: 'MB-MBK-260702-A',
      warehouseCode: 'WH-RM',
      warehouse: '原料仓',
      location: 'RM-02-05',
      movement: '入库',
      qty: '+300 kg',
      balance: '300 kg',
      balanceFact: '合格在库',
      beforeBalance: '0 kg',
      afterBalance: '300 kg',
      sourceLineId: 'L1',
      documentLineId: 'WR-20260702-001-L1',
      sourceDoc: 'WR-20260702-001',
      reason: '采购入库',
      operator: '王倩',
    },
    {
      time: '2026-07-17 09:45',
      item: 'PLA 原生粒子',
      itemType: '原料',
      materialCode: 'M-RM-PLA-VIRGIN',
      batch: 'PLA-260717-A',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      location: 'QC-AUTO',
      movement: '质检冻结',
      qty: '+600 kg',
      balance: '600 kg',
      balanceFact: '待检',
      beforeBalance: '0 kg',
      afterBalance: '600 kg',
      sourceLineId: 'L1',
      documentLineId: 'WR-20260717-003-L1',
      sourceDoc: 'WR-20260717-003',
      reason: '采购到货，进入来料质检',
      operator: '王倩',
    },
    {
      time: '2026-07-17 11:10',
      item: 'PLA 原生粒子',
      itemType: '原料',
      materialCode: 'M-RM-PLA-VIRGIN',
      batch: 'PLA-260717-A',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      location: 'QC-AUTO',
      movement: '质检放行',
      qty: '+600 kg',
      balance: '600 kg',
      balanceFact: '待入库',
      beforeBalance: '0 kg',
      afterBalance: '600 kg',
      sourceLineId: 'L1',
      documentLineId: 'WR-20260717-003-L1',
      sourceDoc: 'WR-20260717-003',
      reason: '来料质检合格，等待正式入库',
      operator: '林珊',
    },
    {
      time: '2026-07-17 11:20',
      item: 'PLA 原生粒子',
      itemType: '原料',
      materialCode: 'M-RM-PLA-VIRGIN',
      batch: 'PLA-260717-A',
      warehouseCode: 'WH-RM',
      warehouse: '原料仓',
      location: 'RM-01-01',
      movement: '入库',
      qty: '+600 kg',
      balance: '600 kg',
      balanceFact: '合格在库',
      beforeBalance: '0 kg',
      afterBalance: '600 kg',
      sourceLineId: 'L1',
      documentLineId: 'WR-20260717-003-L1',
      sourceDoc: 'WR-20260717-003',
      reason: '采购入库',
      operator: '王倩',
    },
  ]);

  addMissingByCode(warehouse.salesIssues, [
    {
      code: 'WS-20260601-003',
      ...company,
      sourceDoc: 'SR-20260601-002',
      sourceOrder: 'SO-20260528-008',
      customerCode: 'CUS-00002',
      customer: '苏州维创三维科技',
      contact: '顾经理',
      contactPhone: '139-0512-8036',
      products: [
        {
          lineId: 'WS-20260601-003-L1',
          sourceLineId: 'L1',
          materialCode: 'M-FG-PLA-175-MBK',
          name: 'PLA 1.75mm 哑光黑耗材 1kg',
          model: 'PLA-175-MBK-1KG',
          spec: '线径 1.75mm，净重 1kg，哑光黑',
          qty: '180',
          batch: 'PLA-MBK-260528-A',
          uom: '卷',
        },
      ],
      warehouseCode: 'WH-FG',
      warehouse: '成品仓',
      deliveryMethod: '本厂配送',
      owner: '王倩',
      status: '已出库',
      date: '2026-06-01',
      expectedDate: '2026-06-01',
      note: '已按销售订单完成 180 卷成品出库，客户于 2026-06-02 签收。',
      attachments: [],
    },
    {
      code: 'WS-20260717-006',
      ...company,
      sourceDoc: 'SR-20260617-001',
      sourceOrder: 'SO-20260617-021',
      customerCode: 'CUS-HZQC',
      customer: '杭州千层增材科技',
      contact: '林经理',
      contactPhone: '138-0000-7218',
      products: [
        {
          lineId: 'WS-20260717-006-L1',
          sourceLineId: 'L1',
          materialCode: 'M-FG-PLA-175-WHT',
          name: 'PLA 1.75mm 珍珠白耗材 1kg',
          model: 'PLA-175-WHT-1KG',
          spec: '线径 1.75mm，净重 1kg，珍珠白',
          qty: '240',
          batch: 'PLA-WHT-260712-A',
          uom: '卷',
        },
        {
          lineId: 'WS-20260717-006-L2',
          sourceLineId: 'L2',
          materialCode: 'M-FG-PETG-175-BLK',
          name: 'PETG 1.75mm 黑色耗材 1kg',
          model: 'PETG-175-BLK-1KG',
          spec: '线径 1.75mm，净重 1kg，黑色',
          qty: '120',
          batch: 'PETG-BLK-260713-A',
          uom: '卷',
        },
      ],
      warehouseCode: 'WH-FG',
      warehouse: '成品仓',
      deliveryMethod: '本厂配送',
      owner: '王倩',
      status: '待拣货',
      date: '2026-07-17',
      expectedDate: '2026-07-18',
      note: '已按销售订单预留整单数量，按客户批次要求拣货并复核标签。',
      attachments: [],
    },
  ]);

  addMissingByCode(warehouse.otherMoves, [
    {
      code: 'OM-20260717-001',
      ...company,
      moveType: '样品出库',
      direction: '出库',
      reason: '客户打印参数验证',
      products: [
        {
          lineId: 'OM-20260717-001-L1',
          materialCode: 'M-FG-PLA-175-MBK',
          name: 'PLA 1.75mm 哑光黑耗材 1kg',
          model: 'PLA-175-MBK-1KG',
          spec: '线径 1.75mm，净重 1kg，哑光黑',
          qty: '6',
          batch: 'PLA-MBK-260714-A',
          uom: '卷',
        },
      ],
      warehouseCode: 'WH-FG',
      warehouse: '成品仓',
      targetWarehouse: '客户样品寄送',
      owner: '王倩',
      status: '待审核',
      date: '2026-07-17',
      note: '用于客户新机型打印参数验证，审核通过后办理出库。',
      attachments: [],
    },
  ]);

  addMissingByCode(warehouse.transfers, [
    {
      code: 'TR-20260717-001',
      ...company,
      products: [
        {
          lineId: 'TR-20260717-001-L1',
          materialCode: 'M-PKG-VAC-BAG-1KG',
          name: '真空包装袋 1kg',
          model: 'VAC-BAG-1KG',
          spec: '尼龙复合袋，适配 1kg 线盘',
          qty: '1200',
          batch: 'VAC-260701',
          uom: '个',
        },
      ],
      fromWarehouseCode: 'WH-PKG',
      fromWarehouse: '包材仓',
      toWarehouseCode: 'WH-FG',
      toWarehouse: '成品仓',
      toLocation: 'FG-PKG-TRANSIT',
      owner: '王倩',
      status: '待出库',
      submittedAt: '2026-07-17 09:40',
      submittedBy: '王倩',
      date: '2026-07-17',
      reason: '包装工位备货',
      note: '调拨至成品包装暂存区，出库后计入在途，调入确认后形成可用库存。',
      attachments: [],
      transitLines: [],
    },
  ]);

  // Repair the original demonstration record created before target locations
  // became mandatory. Only this known scenario is projected; arbitrary user
  // records remain untouched and must be cancelled/recreated if incomplete.
  const pendingTransferScenario = warehouse.transfers.find((transfer) => transfer.code === 'TR-20260717-001');
  if (pendingTransferScenario && pendingTransferScenario.status === '待出库') {
    pendingTransferScenario.toLocation ||= 'FG-PKG-TRANSIT';
    pendingTransferScenario.submittedAt ||= '2026-07-17 09:40';
    pendingTransferScenario.submittedBy ||= '王倩';
  }

  const transitTransferCode = 'TR-20260716-002';
  const transitSourceRow = warehouse.inventory.find((row) => (
    row.materialCode === 'M-PKG-VAC-BAG-1KG'
    && row.warehouseCode === 'WH-PKG'
    && row.batch === 'VAC-260701'
  ));
  const transitTargetKey = 'M-PKG-VAC-BAG-1KG::WH-FG::FG-PKG-TRANSIT::VAC-260701';
  const transitQty = 240;
  if (transitSourceRow && Number(warehouse.goldenScenarioVersion || 0) < 1) {
    const sourceBefore = Number(transitSourceRow.onHandNumber || 0);
    transitSourceRow.onHandNumber = Math.max(0, sourceBefore - transitQty);
    transitSourceRow.qualifiedOnHandNumber = Math.max(
      0,
      Number(transitSourceRow.qualifiedOnHandNumber ?? sourceBefore) - transitQty,
    );
    transitSourceRow.lastMovement = `库存调拨 ${transitTransferCode}`;
    transitSourceRow.updatedAt = '2026-07-16 15:20';
    warehouse.goldenScenarioVersion = 1;
  }
  addMissingByKey(warehouse.inventory, [
    {
      key: transitTargetKey,
      materialCode: 'M-PKG-VAC-BAG-1KG',
      item: '真空包装袋 1kg',
      itemType: '包材',
      warehouseCode: 'WH-FG',
      warehouse: '成品仓',
      location: 'FG-PKG-TRANSIT',
      batch: 'VAC-260701',
      onHandNumber: 0,
      qualifiedOnHandNumber: 0,
      reservedNumber: 0,
      allocatedNumber: 0,
      frozenNumber: 0,
      qcHoldNumber: 0,
      pendingInboundNumber: 0,
      inTransitNumber: transitQty,
      outboundPlanNumber: 0,
      uom: '个',
      status: '在途',
      lastMovement: `调拨在途 ${transitTransferCode}`,
      updatedAt: '2026-07-16 15:20',
      transitSources: [
        {
          type: '调拨占用',
          sourceDoc: transitTransferCode,
          sourceLineId: `${transitTransferCode}-L1`,
          quantityNumber: transitQty,
          qty: `${transitQty} 个`,
          status: '调拨中',
          path: `/warehouse/transfers/${transitTransferCode}`,
        },
      ],
    },
  ]);
  addMissingByCode(warehouse.transfers, [
    {
      code: transitTransferCode,
      ...company,
      products: [
        {
          lineId: `${transitTransferCode}-L1`,
          materialCode: 'M-PKG-VAC-BAG-1KG',
          name: '真空包装袋 1kg',
          model: 'VAC-BAG-1KG',
          spec: '尼龙复合袋，适配 1kg 线盘',
          qty: `${transitQty}`,
          batch: 'VAC-260701',
          uom: '个',
        },
      ],
      fromWarehouseCode: 'WH-PKG',
      fromWarehouse: '包材仓',
      toWarehouseCode: 'WH-FG',
      toWarehouse: '成品仓',
      toLocation: 'FG-PKG-TRANSIT',
      owner: '王倩',
      status: '调拨中',
      submittedAt: '2026-07-16 15:05',
      submittedBy: '王倩',
      dispatchedAt: '2026-07-16 15:20',
      dispatchedBy: '王倩',
      date: '2026-07-16',
      reason: '成品包装区补充包装袋',
      note: '成品包装区补充包装袋；调出后由成品仓核对实物并确认调入。',
      attachments: [],
      transitLines: transitSourceRow
        ? [{
            lineId: `${transitTransferCode}-L1`,
            sourceLineId: '',
            inventoryKey: transitSourceRow.key,
            targetInventoryKey: transitTargetKey,
            materialCode: 'M-PKG-VAC-BAG-1KG',
            name: '真空包装袋 1kg',
            batch: 'VAC-260701',
            qty: transitQty,
            uom: '个',
          }]
        : [],
    },
  ]);
  const transitTransferScenario = warehouse.transfers.find((transfer) => transfer.code === transitTransferCode);
  if (transitTransferScenario && ['调拨中', '待入库'].includes(transitTransferScenario.status)) {
    transitTransferScenario.toLocation ||= 'FG-PKG-TRANSIT';
    transitTransferScenario.submittedAt ||= '2026-07-16 15:05';
    transitTransferScenario.submittedBy ||= '王倩';
    transitTransferScenario.dispatchedAt ||= '2026-07-16 15:20';
    transitTransferScenario.dispatchedBy ||= '王倩';
  }
  if (
    transitTransferScenario
    && transitTransferScenario.note === '已确认调出，当前在途；到达后由成品仓确认调入。'
  ) {
    transitTransferScenario.note = '成品包装区补充包装袋；调出后由成品仓核对实物并确认调入。';
  }
  addMissingLedgerRows(warehouse.stockLedger, [
    {
      time: '2026-07-16 15:20',
      item: '真空包装袋 1kg',
      itemType: '包材',
      materialCode: 'M-PKG-VAC-BAG-1KG',
      batch: 'VAC-260701',
      warehouseCode: 'WH-PKG',
      warehouse: '包材仓',
      location: transitSourceRow?.location || 'PKG-03-01',
      movement: '出库',
      qty: `-${transitQty} 个`,
      balance: '5,760 个',
      balanceFact: '物理在库',
      beforeBalance: '6,000 个',
      afterBalance: '5,760 个',
      sourceLineId: '',
      documentLineId: `${transitTransferCode}-L1`,
      sourceDoc: transitTransferCode,
      reason: '库存调拨出库',
      operator: '王倩',
    },
  ]);

  const productionAllocationRow = warehouse.inventory.find((row) => (
    row.materialCode === 'M-RM-PLA-VIRGIN'
    && row.warehouseCode === 'WH-RM'
    && row.batch === 'PLA-260710-B'
  ));
  if (productionAllocationRow) {
    const allocationSource = {
      type: '生产分配',
      sourceDoc: 'RB2-20260717-001',
      sourceLineId: 'MO2-20260717-001-L1',
      releaseCode: 'RB2-20260717-001',
      quantityNumber: 1020,
      qty: '1,020 kg',
      status: '有效',
      path: '/production/workbench?tab=schedule&releaseBatch=RB2-20260717-001',
    };
    productionAllocationRow.allocationSources ||= [];
    if (!productionAllocationRow.allocationSources.some((source) => (
      source.releaseCode === allocationSource.releaseCode
      && source.sourceLineId === allocationSource.sourceLineId
    ))) {
      productionAllocationRow.allocationSources.push(allocationSource);
    }
    const structuredAllocated = productionAllocationRow.allocationSources
      .filter((source) => !['已释放', '已作废', '已消耗'].includes(source.status))
      .reduce((sum, source) => sum + Number(source.quantityNumber || 0), 0);
    productionAllocationRow.allocatedNumber = Math.max(
      Number(productionAllocationRow.allocatedNumber || 0),
      structuredAllocated,
    );
  }

  const stocktakeCode = 'ST-20260717-001';
  if (!warehouse.stocktakes.some((row) => row.code === stocktakeCode)) {
    const inventoryRow = warehouse.inventory.find((row) => row.materialCode === 'M-CM-BLACK');
    const bookQty = Number(
      inventoryRow?.qualifiedOnHandNumber ??
        (Number(String(inventoryRow?.onHand || '').replace(/[^\d.-]/g, '')) || 0),
    );
    const reserved = Number(inventoryRow?.reservedNumber || 0);
    const allocated = Number(inventoryRow?.allocatedNumber || 0);
    const alreadyFrozen = Number(inventoryRow?.frozenNumber || 0);
    const frozenQty = Math.max(0, bookQty - reserved - allocated - alreadyFrozen);
    if (inventoryRow) inventoryRow.frozenNumber = alreadyFrozen + frozenQty;
    warehouse.stocktakes.push({
      code: stocktakeCode,
      ...company,
      warehouseCode: inventoryRow?.warehouseCode || 'WH-RM',
      warehouse: inventoryRow?.warehouse || '原料仓',
      scope: '黑色色母库位抽盘',
      owner: '王倩',
      status: '待复核',
      date: '2026-07-17',
      plannedCount: 1,
      checkedCount: 1,
      differenceCount: 1,
      note: '实盘比账面少 2 kg，等待仓库主管复核差异。',
      attachments: [],
      lines: inventoryRow
        ? [{
            lineId: `${stocktakeCode}-L1`,
            inventoryKey: inventoryRow.key,
            materialCode: inventoryRow.materialCode,
            item: inventoryRow.item,
            itemType: inventoryRow.itemType,
            location: inventoryRow.location,
            batch: inventoryRow.batch,
            uom: inventoryRow.uom || 'kg',
            bookQty,
            countedQty: Math.max(0, bookQty - 2),
            differenceQty: -2,
            frozenQty,
          }]
        : [],
    });
  }

  const goldenStocktake = warehouse.stocktakes.find((row) => row.code === stocktakeCode);
  if (goldenStocktake && (!Array.isArray(goldenStocktake.lines) || goldenStocktake.lines.length === 0)) {
    const inventoryRow = warehouse.inventory.find((row) => row.materialCode === 'M-CM-BLACK');
    if (inventoryRow) {
      const bookQty = Number(inventoryRow.qualifiedOnHandNumber || 0);
      const reserved = Number(inventoryRow.reservedNumber || 0);
      const allocated = Number(inventoryRow.allocatedNumber || 0);
      const alreadyFrozen = Number(inventoryRow.frozenNumber || 0);
      const frozenQty = Math.max(0, bookQty - reserved - allocated - alreadyFrozen);
      inventoryRow.frozenNumber = alreadyFrozen + frozenQty;
      goldenStocktake.plannedCount = 1;
      goldenStocktake.checkedCount = 1;
      goldenStocktake.differenceCount = 1;
      goldenStocktake.lines = [{
        lineId: `${stocktakeCode}-L1`,
        inventoryKey: inventoryRow.key,
        materialCode: inventoryRow.materialCode,
        item: inventoryRow.item,
        itemType: inventoryRow.itemType,
        location: inventoryRow.location,
        batch: inventoryRow.batch,
        uom: inventoryRow.uom || 'kg',
        bookQty,
        countedQty: Math.max(0, bookQty - 2),
        differenceQty: -2,
        frozenQty,
      }];
    }
  }

  const activeStocktake = warehouse.stocktakes.find((row) => row.code === stocktakeCode);
  const activeStocktakeLine = activeStocktake?.lines?.[0];
  const activeStocktakeInventory = activeStocktakeLine
    ? warehouse.inventory.find((row) => row.key === activeStocktakeLine.inventoryKey)
    : undefined;
  if (activeStocktakeLine) activeStocktakeLine.lineId ||= `${stocktakeCode}-L1`;
  if (activeStocktakeInventory && Number(activeStocktakeLine?.frozenQty || 0) > 0) {
    activeStocktakeInventory.freezeSources ||= [];
    if (!activeStocktakeInventory.freezeSources.some((source) => source.sourceDoc === stocktakeCode)) {
      activeStocktakeInventory.freezeSources.push({
        type: '手动冻结',
        sourceDoc: stocktakeCode,
        sourceLineId: activeStocktakeInventory.key,
        quantityNumber: Number(activeStocktakeLine.frozenQty),
        qty: `${Number(activeStocktakeLine.frozenQty).toLocaleString('zh-CN')} ${activeStocktakeLine.uom || 'kg'}`,
        status: activeStocktake.status,
        path: `/warehouse/stocktakes/${stocktakeCode}`,
      });
    }
  }

  const completedStocktakeCode = 'ST-20260710-001';
  const completedStocktakeInventory = warehouse.inventory.find((row) => row.materialCode === 'M-CM-PEARL-WHT');
  addMissingByCode(warehouse.stocktakes, [
    {
      code: completedStocktakeCode,
      ...company,
      warehouseCode: completedStocktakeInventory?.warehouseCode || 'WH-RM',
      warehouse: completedStocktakeInventory?.warehouse || '原料仓',
      scope: completedStocktakeInventory?.location || 'RM-02-03',
      owner: '王倩',
      status: '已完成',
      date: '2026-07-10',
      plannedCount: 1,
      checkedCount: 1,
      differenceCount: 1,
      note: '珍珠白色母周期盘点，盘亏 2 kg 已复核并过账。',
      attachments: [],
      lines: completedStocktakeInventory
        ? [{
            lineId: `${completedStocktakeCode}-L1`,
            inventoryKey: completedStocktakeInventory.key,
            materialCode: completedStocktakeInventory.materialCode,
            item: completedStocktakeInventory.item,
            itemType: completedStocktakeInventory.itemType,
            location: completedStocktakeInventory.location,
            batch: completedStocktakeInventory.batch,
            uom: completedStocktakeInventory.uom || 'kg',
            bookQty: 262,
            countedQty: 260,
            differenceQty: -2,
            frozenQty: 0,
          }]
        : [],
    },
  ]);
  if (completedStocktakeInventory) {
    addMissingLedgerRows(warehouse.stockLedger, [
      {
        time: '2026-07-10 17:05',
        item: completedStocktakeInventory.item,
        itemType: completedStocktakeInventory.itemType,
        materialCode: completedStocktakeInventory.materialCode,
        batch: completedStocktakeInventory.batch,
        warehouseCode: completedStocktakeInventory.warehouseCode,
        warehouse: completedStocktakeInventory.warehouse,
        location: completedStocktakeInventory.location,
        movement: '盘亏',
        qty: '-2 kg',
        balance: '260 kg',
        balanceFact: '物理在库',
        beforeBalance: '262 kg',
        afterBalance: '260 kg',
        sourceLineId: completedStocktakeInventory.key,
        documentLineId: `${completedStocktakeCode}-L1`,
        sourceDoc: completedStocktakeCode,
        reason: '盘亏',
        operator: '王倩',
      },
    ]);
  }

  ensureArray(warehouse.salesIssueFlowRecords, 'WS-20260717-006').push(
    ...(!warehouse.salesIssueFlowRecords['WS-20260717-006']?.length
      ? [{ time: '2026-07-17 09:10', actor: '王倩', action: '受理销售出库', remark: '承接 SR-20260617-001，等待按预留批次拣货。' }]
      : []),
  );
  ensureArray(warehouse.salesIssueFlowRecords, 'WS-20260601-003').push(
    ...(!warehouse.salesIssueFlowRecords['WS-20260601-003']?.length
      ? [{ time: '2026-06-01 15:40', actor: '王倩', action: '销售出库过账', remark: 'SO-20260528-008 的 180 卷成品已出库，等待客户签收。' }]
      : []),
  );
  ensureArray(warehouse.otherMoveFlowRecords, 'OM-20260717-001').push(
    ...(!warehouse.otherMoveFlowRecords['OM-20260717-001']?.length
      ? [{ time: '2026-07-17 09:25', actor: '王倩', action: '提交审核', remark: '客户样品出库已提交审核。' }]
      : []),
  );
  ensureArray(warehouse.transferFlowRecords, 'TR-20260717-001').push(
    ...(!warehouse.transferFlowRecords['TR-20260717-001']?.length
      ? [{ time: '2026-07-17 09:40', actor: '王倩', action: '提交调拨', remark: '包装工位备货调拨等待调出仓确认。' }]
      : []),
  );
  ensureArray(warehouse.transferFlowRecords, transitTransferCode).push(
    ...(!warehouse.transferFlowRecords[transitTransferCode]?.length
      ? [
          { time: '2026-07-16 15:05', actor: '王倩', action: '提交调拨', remark: '包装袋调拨已提交，等待调出。' },
          { time: '2026-07-16 15:20', actor: '王倩', action: '确认调出', remark: '包材仓已调出 240 个，当前在途。' },
        ]
      : []),
  );
  ensureArray(warehouse.stocktakeFlowRecords, stocktakeCode).push(
    ...(!warehouse.stocktakeFlowRecords[stocktakeCode]?.length
      ? [
          { time: '2026-07-17 08:30', actor: '王倩', action: '开始盘点', remark: '冻结黑色色母库位可用数量并形成账面快照。' },
          { time: '2026-07-17 09:05', actor: '王倩', action: '提交复核', remark: '实盘少 2 kg，等待复核差异。' },
        ]
      : []),
  );
  ensureArray(warehouse.stocktakeFlowRecords, completedStocktakeCode).push(
    ...(!warehouse.stocktakeFlowRecords[completedStocktakeCode]?.length
      ? [
          { time: '2026-07-10 16:20', actor: '王倩', action: '开始盘点', remark: '形成珍珠白色母账面快照。' },
          { time: '2026-07-10 16:50', actor: '王倩', action: '提交复核', remark: '实盘少 2 kg，提交仓库主管复核。' },
          { time: '2026-07-10 17:05', actor: '王倩', action: '完成盘点', remark: '盘亏 2 kg 已过账并解除冻结。' },
        ]
      : []),
  );

  return data;
}
