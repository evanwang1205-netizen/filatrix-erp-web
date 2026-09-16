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

export function applyProductionQualityGoldenScenarios(data) {
  data.production ||= {};
  data.warehouse ||= {};
  const production = data.production;
  const warehouse = data.warehouse;
  production.workOrders ||= [];
  production.workOrderReleases ||= [];
  production.executionCards ||= [];
  production.productionReports ||= [];
  production.wipBatches ||= [];
  production.batchLineageRecords ||= [];
  production.executionEvents ||= [];
  production.productionExceptions ||= [];
  production.shiftHandovers ||= [];
  production.qualityTasks ||= [];
  production.qualityDecisions ||= {};
  production.qualityDispositions ||= {};
  production.reworkTasks ||= [];
  production.reinspectionTasks ||= [];
  production.packagingRecords ||= [];
  production.workOrderFlowRecords ||= {};
  production.workOrderReleaseFlowRecords ||= {};
  production.executionCardFlowRecords ||= {};
  warehouse.productionReceipts ||= [];
  warehouse.productionReceiptFlowRecords ||= {};
  warehouse.productionIssues ||= [];
  warehouse.productionIssueFlowRecords ||= {};
  warehouse.productionReturns ||= [];
  warehouse.productionReturnFlowRecords ||= {};

  addMissingByCode(production.workOrders, [
    {
      code: 'MO2-260701-001', taskCode: 'PT2-260701-001', sourceLineId: 'PT2-260701-001-L1',
      productCode: 'M-FG-PLA-175-MBK', productName: 'PLA 1.75mm 哑光黑耗材 1kg',
      planQty: 118, releasedQty: 118, completedQty: 107, inboundQty: 30, unit: '卷',
      plannedDate: '2026-07-01', dueDate: '2026-07-04', recipeCode: 'BOM-PLA-175-MBK-V1',
      processTemplateCode: 'PRC2-EXTRUSION-V1', status: '部分入库', currentNode: '待抽检',
      owner: '李四', note: '安全库存补货任务，演示多批次生产、质检与完工入库。',
      documentStatus: 'submitted', revision: 1, nextAction: '完成待检批次并继续剩余入库',
      materialNeeds: [
        { lineId: 'MAT-1', materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', perUnitQty: 0.96, estimatedQty: 113.28, actualQty: 116, availableQty: 280, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
        { lineId: 'MAT-2', materialCode: 'M-CM-MATTE-BLK', materialName: '哑光黑色母', perUnitQty: 0.04, estimatedQty: 4.72, actualQty: 4.9, availableQty: 42, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
      ],
      linePlans: [
        { line: '挤出 A1 线', lineType: '挤出 A 线', planQty: 70, issuedQty: 70, reportedQty: 70, packedQty: 30, inboundQty: 30, leader: '王敏', status: '待入库' },
        { line: '挤出 A2 线', lineType: '挤出 A 线', planQty: 48, issuedQty: 48, reportedQty: 40, packedQty: 39, inboundQty: 0, leader: '陈刚', status: '待入库' },
      ],
    },
    {
      code: 'MO2-260715-006', taskCode: 'PT2-260715-006', sourceDocument: 'SO-20260715-022', sourceLineId: 'L1',
      productCode: 'M-FG-PETG-175-CLR', productName: 'PETG 1.75mm 透明耗材 1kg',
      planQty: 180, releasedQty: 0, completedQty: 0, inboundQty: 0, unit: '卷',
      plannedDate: '2026-07-15', dueDate: '2026-07-26', recipeCode: 'BOM-PETG-175-CLR-V1',
      processTemplateCode: 'PRC2-PETG-EXTRUSION-V1', status: '待释放', currentNode: '待释放',
      owner: '周敏', note: '销售订单 SO-20260715-022 第 L1 行缺口 180 卷。',
      documentStatus: 'submitted', revision: 1, nextAction: '等待 PETG 原生粒子完成仓库入库后释放',
      materialNeeds: [
        { lineId: 'MAT-1', materialCode: 'M-RM-PETG-VIRGIN', materialName: 'PETG 原生粒子', perUnitQty: 0.99, estimatedQty: 178.2, actualQty: 178.2, availableQty: 0, shortageQty: 178.2, unit: 'kg', incomingQcRequired: true, status: '待仓库入库' },
        { lineId: 'MAT-2', materialCode: 'M-AM-CLEAR-ENH', materialName: '透明增强助剂', perUnitQty: 0.01, estimatedQty: 1.8, actualQty: 1.8, availableQty: 18, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '充足' },
      ],
      linePlans: [{ line: '挤出 B1 线', lineType: '挤出 B 线', planQty: 180, issuedQty: 0, reportedQty: 0, packedQty: 0, inboundQty: 0, leader: '刘倩', status: '待释放' }],
    },
    {
      code: 'MO2-260630-004', taskCode: 'PT2-260701-003', sourceLineId: 'PT2-260701-003-L1',
      productCode: 'M-FG-PLA-175-WHT', productName: 'PLA 1.75mm 珍珠白耗材 1kg',
      planQty: 8, releasedQty: 8, completedQty: 7, inboundQty: 0, unit: '卷',
      plannedDate: '2026-06-30', dueDate: '2026-07-02', recipeCode: 'BOM-PLA-175-WHT-V1',
      processTemplateCode: 'PRC2-WIRE-DRAWING-REWIND-V1', status: '生产中', currentNode: '待过程检',
      owner: '赵敏', note: '用于演示部分合格后的正式不合格处置闭环。',
      documentStatus: 'submitted', revision: 1, nextAction: '处置隔离的 1 卷绕线偏松成品',
      materialNeeds: [], linePlans: [{ line: '复绕 R1 线', lineType: '复绕机', planQty: 8, issuedQty: 8, reportedQty: 8, packedQty: 0, inboundQty: 0, leader: '王五', status: '生产中' }],
    },
    {
      code: 'MO2-260719-005', taskCode: '', sourceLineId: 'MANUAL-REWIND-DEMO',
      productCode: 'M-FG-PLA-175-WHT', productName: 'PLA 1.75mm 珍珠白耗材 1kg',
      planQty: 4, releasedQty: 4, completedQty: 0, inboundQty: 0, unit: '卷',
      plannedDate: '2026-07-19', dueDate: '2026-07-20', recipeCode: 'BOM-PLA-175-WHT-V1',
      processTemplateCode: 'PRC2-WIRE-DRAWING-REWIND-V1', status: '生产中', currentNode: '生产报工',
      owner: '王五', note: '演示大盘质检放行后自动进入复绕队列，不重复建立工单。',
      documentStatus: 'submitted', revision: 1, nextAction: '在复绕 R1 线开始复绕',
      materialNeeds: [], linePlans: [
        { line: '挤出 A1 线', lineType: '拉丝机', planQty: 4, issuedQty: 4, reportedQty: 0, packedQty: 0, inboundQty: 0, leader: '王敏', status: '已完成' },
        { line: '复绕 R1 线', lineType: '复绕机', planQty: 4, issuedQty: 0, reportedQty: 0, packedQty: 0, inboundQty: 0, leader: '王五', status: '待开工' },
      ],
    },
    {
      code: 'MO2-260723-101', taskCode: 'PT2-260723-101', sourceLineId: 'PT2-260723-101-L1',
      productCode: 'M-FG-PLA-175-MBK', productName: 'PLA 1.75mm 哑光黑耗材 1kg',
      planQty: 60, releasedQty: 0, completedQty: 0, inboundQty: 0, unit: '卷',
      plannedDate: '2026-07-24', dueDate: '2026-07-28', recipeCode: 'BOM-PLA-175-MBK-V1',
      processTemplateCode: 'PRC2-EXTRUSION-V1', status: '待释放', currentNode: '待释放',
      owner: '李四', note: '排产功能测试：物料齐套，可选择挤出 A1/A2 线加入队列。',
      documentStatus: 'submitted', revision: 1, nextAction: '在生产工作台安排产线、数量和顺序',
      materialNeeds: [
        { lineId: 'MAT-1', materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', perUnitQty: 0.96, estimatedQty: 57.6, actualQty: 0, availableQty: 9480, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
        { lineId: 'MAT-2', materialCode: 'M-CM-MATTE-BLK', materialName: '哑光黑色母', perUnitQty: 0.04, estimatedQty: 2.4, actualQty: 0, availableQty: 300, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
      ],
      linePlans: [{ line: '挤出 A1 线', lineType: '挤出 A 线', planQty: 60, issuedQty: 0, reportedQty: 0, packedQty: 0, inboundQty: 0, leader: '王敏', status: '待释放' }],
    },
    {
      code: 'MO2-260723-102', taskCode: 'PT2-260723-102', sourceLineId: 'PT2-260723-102-L1',
      productCode: 'M-FG-PLA-175-MBK', productName: 'PLA 1.75mm 哑光黑耗材 1kg',
      planQty: 48, releasedQty: 24, completedQty: 0, inboundQty: 0, unit: '卷',
      plannedDate: '2026-07-23', dueDate: '2026-07-27', recipeCode: 'BOM-PLA-175-MBK-V1',
      processTemplateCode: 'PRC2-EXTRUSION-V1', status: '部分释放', currentNode: '待领料',
      owner: '周敏', note: '队列测试：24 卷已排入挤出 B1 线，剩余 24 卷仍可排产。',
      documentStatus: 'submitted', revision: 1, nextAction: '查看 B1 线队列，并继续安排剩余 24 卷',
      materialNeeds: [
        { lineId: 'MAT-1', materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', perUnitQty: 0.96, estimatedQty: 46.08, actualQty: 0, availableQty: 9480, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
        { lineId: 'MAT-2', materialCode: 'M-CM-MATTE-BLK', materialName: '哑光黑色母', perUnitQty: 0.04, estimatedQty: 1.92, actualQty: 0, availableQty: 300, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
      ],
      linePlans: [{ line: '挤出 B1 线', lineType: '挤出 B 线', planQty: 48, issuedQty: 0, reportedQty: 0, packedQty: 0, inboundQty: 0, leader: '刘倩', status: '待领料' }],
    },
  ]);

  addMissingByCode(production.workOrderReleases, [
    { code: 'RB2-260701-001', workOrderCode: 'MO2-260701-001', taskCode: 'PT2-260701-001', sourceLineId: 'MO2-260701-001-L1', line: '挤出 A1 线', lineType: '挤出 A 线', shift: '白班', leader: '王敏', planQty: 70, releasedQty: 70, unit: '卷', releaseStatus: '已释放', materialStatus: '已领料', executionStatus: '已报工', qualityStatus: '已放行', inboundStatus: '部分入库', materialIssueCodes: ['WM2-260701-001'], executionCardCodes: ['EC2-260701-001'], qualityTaskCodes: [], productionReceiptCodes: [], nextAction: '确认剩余 38 卷包装并触发入库抽检' },
    { code: 'RB2-260701-002', workOrderCode: 'MO2-260701-001', taskCode: 'PT2-260701-001', sourceLineId: 'MO2-260701-001-L2', line: '挤出 A2 线', lineType: '挤出 A 线', shift: '白班', leader: '陈刚', planQty: 40, releasedQty: 40, unit: '卷', releaseStatus: '已释放', materialStatus: '已领料', executionStatus: '待质检', qualityStatus: '待检', inboundStatus: '待放行', materialIssueCodes: ['WM2-260701-005'], executionCardCodes: ['EC2-260701-002'], qualityTaskCodes: ['QC2-260701-001'], productionReceiptCodes: [], nextAction: '完成入库抽检' },
    { code: 'RB2-260701-003', workOrderCode: 'MO2-260701-001', taskCode: 'PT2-260701-001', sourceLineId: 'MO2-260701-001-L2', line: '挤出 A2 线', lineType: '挤出 A 线', shift: '夜班', leader: '陈刚', planQty: 8, releasedQty: 8, unit: '卷', releaseStatus: '已释放', materialStatus: '已领料', executionStatus: '待开工', qualityStatus: '待检', inboundStatus: '未报工', materialIssueCodes: ['WM2-260701-006'], executionCardCodes: ['EC2-260701-003'], qualityTaskCodes: ['QC2-260701-002'], productionReceiptCodes: [], nextAction: '完成开机首检' },
    { code: 'RB2-260630-006', workOrderCode: 'MO2-260630-004', taskCode: 'PT2-260701-003', sourceLineId: 'PT2-260701-003-L1', line: '复绕 R1 线', lineType: '复绕机', shift: '白班', leader: '王五', planQty: 8, releasedQty: 8, unit: '卷', releaseStatus: '已释放', materialStatus: '已领料', executionStatus: '异常', qualityStatus: '待处置', inboundStatus: '待放行', materialIssueCodes: ['WM2-260630-006'], executionCardCodes: ['EC2-260630-006'], qualityTaskCodes: ['QC2-260630-003'], productionReceiptCodes: [], nextAction: '完成 1 卷不合格品处置' },
    { code: 'RB2-260719-005', workOrderCode: 'MO2-260719-005', taskCode: '', sourceLineId: 'MANUAL-REWIND-DEMO', line: '复绕 R1 线', lineType: '复绕机', shift: '白班', leader: '王五', planQty: 4, releasedQty: 4, unit: '卷', releaseStatus: '已释放', materialStatus: '已领料', executionStatus: '待开工', qualityStatus: '合格', inboundStatus: '未报工', materialIssueCodes: ['WM2-260719-005'], executionCardCodes: ['EC2-260719-005'], qualityTaskCodes: ['QC2-260719-WIP-005'], productionReceiptCodes: [], nextAction: '开始复绕大盘 LRL2-260719-005' },
    { code: 'RB2-20260723-001', workOrderCode: 'MO2-260723-102', taskCode: 'PT2-260723-102', sourceLineId: 'PT2-260723-102-L1', line: '挤出 B1 线', lineType: '挤出 B 线', shift: '白班', leader: '刘倩', planQty: 24, releasedQty: 24, unit: '卷', releaseStatus: '已释放', materialStatus: '待领料', executionStatus: '待开工', qualityStatus: '未触发', inboundStatus: '未报工', materialIssueCodes: [], executionCardCodes: [], qualityTaskCodes: [], productionReceiptCodes: [], nextAction: '仓库按释放批次办理生产领料' },
  ]);

  addMissingByCode(production.executionCards, [
    { code: 'EC2-260701-001', releaseBatchCode: 'RB2-260701-001', workOrderCode: 'MO2-260701-001', productCode: 'M-FG-PLA-175-MBK', productName: 'PLA 1.75mm 哑光黑耗材 1kg', line: '挤出 A1 线', lineType: '挤出 A 线', shift: '白班', leader: '王敏', operator: '赵强', planQty: 70, issuedQty: 70, reportedQty: 70, qualifiedQty: 68, packedQty: 30, releasedInboundQty: 30, inboundQty: 30, defectQty: 2, unit: '卷', node: '待包装', status: '进行中', nextAction: '确认剩余 38 卷包装并触发入库抽检', processTemplateCode: 'PRC2-EXTRUSION-V1', revision: 1, qualityTaskCodes: [], reportCodes: [], productionReceiptCodes: [], packageRefs: [] },
    { code: 'EC2-260701-002', releaseBatchCode: 'RB2-260701-002', workOrderCode: 'MO2-260701-001', productCode: 'M-FG-PLA-175-MBK', productName: 'PLA 1.75mm 哑光黑耗材 1kg', line: '挤出 A2 线', lineType: '挤出 A 线', shift: '白班', leader: '陈刚', operator: '李娜', planQty: 40, issuedQty: 40, reportedQty: 40, qualifiedQty: 39, packedQty: 39, releasedInboundQty: 0, inboundQty: 0, defectQty: 1, unit: '卷', node: '待抽检', status: '待质检', nextAction: '完成入库抽检', processTemplateCode: 'PRC2-EXTRUSION-V1', revision: 1, qualityTaskCodes: ['QC2-260701-001'], reportCodes: [], productionReceiptCodes: [], packageRefs: ['BOX-A2-001'] },
    { code: 'EC2-260701-003', releaseBatchCode: 'RB2-260701-003', workOrderCode: 'MO2-260701-001', productCode: 'M-FG-PLA-175-MBK', productName: 'PLA 1.75mm 哑光黑耗材 1kg', line: '挤出 A2 线', lineType: '挤出 A 线', shift: '夜班', leader: '陈刚', operator: '未接班', planQty: 8, issuedQty: 8, reportedQty: 0, qualifiedQty: 0, packedQty: 0, releasedInboundQty: 0, inboundQty: 0, defectQty: 0, unit: '卷', node: '待首检', status: '待质检', nextAction: '晚班开机后完成首检', processTemplateCode: 'PRC2-EXTRUSION-V1', revision: 1, qualityTaskCodes: ['QC2-260701-002'], reportCodes: [], productionReceiptCodes: [], packageRefs: [] },
    { code: 'EC2-260630-006', releaseBatchCode: 'RB2-260630-006', workOrderCode: 'MO2-260630-004', productCode: 'M-FG-PLA-175-WHT', productName: 'PLA 1.75mm 珍珠白耗材 1kg', line: '复绕 R1 线', lineType: '复绕机', shift: '白班', leader: '王五', operator: '赵敏', planQty: 8, issuedQty: 8, reportedQty: 8, qualifiedQty: 7, packedQty: 0, releasedInboundQty: 0, inboundQty: 0, defectQty: 1, unit: '卷', node: '待过程检', status: '异常', nextAction: '处理不合格 1 卷；合格 7 卷待处置闭环后放行', processTemplateCode: 'PRC2-WIRE-DRAWING-REWIND-V1', revision: 1, qualityTaskCodes: ['QC2-260630-WIP-001', 'QC2-260630-003'], reportCodes: ['PRPT2-260630-WIP-001', 'PRPT2-260630-006'], wipBatchCodes: ['LRL2-260630-R1-001'], lineageRecordCodes: ['BL2-260630-001', 'BL2-260630-002', 'BL2-260630-003', 'BL2-260630-004', 'BL2-260630-005', 'BL2-260630-006', 'BL2-260630-007', 'BL2-260630-008'], wipReportedQtyKg: 8.2, wipQualifiedQtyKg: 8.2, productionReceiptCodes: [], packageRefs: [] },
    {
      code: 'EC2-260719-005', releaseBatchCode: 'RB2-260719-005', workOrderCode: 'MO2-260719-005',
      productCode: 'M-FG-PLA-175-WHT', productName: 'PLA 1.75mm 珍珠白耗材 1kg', line: '复绕 R1 线', lineType: '复绕机',
      shift: '白班', leader: '王五', operator: '', planQty: 4, issuedQty: 4, reportedQty: 0, qualifiedQty: 0, packedQty: 0,
      releasedInboundQty: 0, inboundQty: 0, defectQty: 0, unit: '卷', node: '生产报工', status: '待处理',
      nextAction: '大盘 LRL2-260719-005 已进入复绕 R1 线队列，现场确认后开始复绕',
      processTemplateCode: 'PRC2-WIRE-DRAWING-REWIND-V1', revision: 1,
      qualityTaskCodes: ['QC2-260719-WIP-005'], reportCodes: ['PRPT2-260719-WIP-005'], wipBatchCodes: ['LRL2-260719-005'],
      lineageRecordCodes: [], wipReportedQtyKg: 4.1, wipQualifiedQtyKg: 4.1, productionReceiptCodes: [], packageRefs: [],
      operationJobs: [
        { code: 'EC2-260719-005-OP-EXT', productionBatchCode: 'EC2-260719-005', operationType: '挤出生产', lineType: '拉丝机', assignedLine: '挤出 A1 线', recommendedLine: '挤出 A1 线', sequence: 10, plannedQty: 4.1, plannedUnit: 'kg', actualQty: 4.1, actualUnit: 'kg', status: '已完成', nextAction: '挤出设备作业已结束', createdAt: '2026-07-19 09:10', actualStart: '2026-07-19 09:10', actualEnd: '2026-07-19 10:20' },
        { code: 'EC2-260719-005-OP-RW-LRL2-260719-005', productionBatchCode: 'EC2-260719-005', operationType: '复绕生产', lineType: '复绕机', assignedLine: '复绕 R1 线', recommendedLine: '复绕 R1 线', sequence: 20, sourceWipBatchCode: 'LRL2-260719-005', plannedQty: 4.1, plannedUnit: 'kg', actualQty: 0, actualUnit: '卷', status: '可开工', nextAction: '开始复绕大盘 LRL2-260719-005', createdAt: '2026-07-19 10:35', plannedAt: '2026-07-19 10:35' },
      ],
    },
  ]);

  addMissingByCode(production.productionReports, [
    { code: 'PRPT2-260701-001', kind: '成品报工', executionCardCode: 'EC2-260701-001', workOrderCode: 'MO2-260701-001', releaseBatchCode: 'RB2-260701-001', quantity: 70, goodQty: 68, defectQty: 2, acceptedQty: 68, rejectedQty: 2, unit: '卷', status: '已判定', decisionCode: 'QC2-260701-003', qualityTaskCode: 'QC2-260701-003', reporter: '赵强', reportedAt: '2026-07-01 13:30' },
    { code: 'PRPT2-260630-WIP-001', kind: '半成品报工', executionCardCode: 'EC2-260630-006', workOrderCode: 'MO2-260630-004', releaseBatchCode: 'RB2-260630-006', outputBatchCode: 'LRL2-260630-R1-001', goodQty: 8.2, defectQty: 0, acceptedQty: 8.2, rejectedQty: 0, unit: 'kg', status: '已判定', decisionCode: 'QC2-260630-WIP-001', qualityTaskCode: 'QC2-260630-WIP-001', reporter: '王五', reportedAt: '2026-06-30 10:40' },
    { code: 'PRPT2-260630-006', kind: '成品报工', executionCardCode: 'EC2-260630-006', workOrderCode: 'MO2-260630-004', releaseBatchCode: 'RB2-260630-006', sourceWipBatchCode: 'LRL2-260630-R1-001', consumedWeightKg: 8, lossWeightKg: 0.2, outputRollCodes: ['SRL2-260630-001', 'SRL2-260630-002', 'SRL2-260630-003', 'SRL2-260630-004', 'SRL2-260630-005', 'SRL2-260630-006', 'SRL2-260630-007', 'SRL2-260630-008'], quantity: 8, goodQty: 8, defectQty: 0, acceptedQty: 7, rejectedQty: 1, unit: '卷', status: '已判定', decisionCode: 'QC2-260630-003', qualityTaskCode: 'QC2-260630-003', actor: '赵敏', reportedAt: '2026-06-30 15:20' },
    { code: 'PRPT2-260719-WIP-005', kind: '半成品报工', executionCardCode: 'EC2-260719-005', workOrderCode: 'MO2-260719-005', releaseBatchCode: 'RB2-260719-005', outputBatchCode: 'LRL2-260719-005', goodQty: 4.1, defectQty: 0, acceptedQty: 4.1, rejectedQty: 0, unit: 'kg', status: '已判定', decisionCode: 'QC2-260719-WIP-005', qualityTaskCode: 'QC2-260719-WIP-005', reporter: '王敏', reportedAt: '2026-07-19 10:20' },
  ]);

  addMissingByCode(production.wipBatches, [
    { code: 'LRL2-260630-R1-001', executionCardCode: 'EC2-260630-006', workOrderCode: 'MO2-260630-004', releaseBatchCode: 'RB2-260630-006', sourceReportCode: 'PRPT2-260630-WIP-001', productCode: 'M-FG-PLA-175-WHT', productName: 'PLA 1.75mm 珍珠白耗材 1kg', netWeightKg: 8.2, qualifiedWeightKg: 8.2, usedWeightKg: 8, lossWeightKg: 0.2, outputWeightKg: 8, consumedWeightKg: 8.2, availableWeightKg: 0, unit: 'kg', line: '复绕 R1 线', equipment: 'RW-R1', operator: '王五', shift: '白班', status: '已用尽', qualityTaskCode: 'QC2-260630-WIP-001', producedAt: '2026-06-30 10:40' },
    { code: 'LRL2-260719-005', executionCardCode: 'EC2-260719-005', workOrderCode: 'MO2-260719-005', releaseBatchCode: 'RB2-260719-005', sourceReportCode: 'PRPT2-260719-WIP-005', productCode: 'M-FG-PLA-175-WHT', productName: 'PLA 1.75mm 珍珠白耗材 1kg', netWeightKg: 4.1, qualifiedWeightKg: 4.1, usedWeightKg: 0, lossWeightKg: 0, outputWeightKg: 0, consumedWeightKg: 0, availableWeightKg: 4.1, unit: 'kg', line: '挤出 A1 线', equipment: 'EXT-A1', operator: '王敏', shift: '白班', status: '合格', qualityTaskCode: 'QC2-260719-WIP-005', producedAt: '2026-07-19 10:20', updatedAt: '2026-07-19 10:35' },
  ]);

  addMissingByCode(production.batchLineageRecords, Array.from({ length: 8 }, (_, index) => ({
    code: `BL2-260630-${String(index + 1).padStart(3, '0')}`,
    executionCardCode: 'EC2-260630-006',
    workOrderCode: 'MO2-260630-004',
    sourceWipBatchCode: 'LRL2-260630-R1-001',
    outputRollCode: `SRL2-260630-${String(index + 1).padStart(3, '0')}`,
    outputQty: 1,
    netWeightKg: 1,
    reportCode: 'PRPT2-260630-006',
    createdAt: '2026-06-30 15:20',
  })));

  addMissingByCode(warehouse.productionIssues, [
    {
      code: 'WM2-260701-001', moveType: '生产领料', direction: '出库', reason: '生产领料',
      workOrder: 'MO2-260701-001', releaseBatch: 'RB2-260701-001', executionCard: 'EC2-260701-001',
      products: [
        { lineId: 'WM2-260701-001-L1', materialCode: 'M-RM-PLA-VIRGIN', sourceLineId: 'MAT-1', name: 'PLA 原生粒子', qty: '67.2 kg', batch: 'PLA-260710-B', uom: 'kg', plannedQty: 67.2, postedQty: 67.2 },
        { lineId: 'WM2-260701-001-L2', materialCode: 'M-CM-MATTE-BLK', sourceLineId: 'MAT-2', name: '哑光黑色母', qty: '2.8 kg', batch: 'MB-MBK-260702-A', uom: 'kg', plannedQty: 2.8, postedQty: 2.8 },
        { lineId: 'WM2-260701-001-L3', materialCode: 'M-PKG-SPOOL-1KG', sourceLineId: 'MAT-3', name: '小盘线轴 1kg', qty: '70 个', batch: 'SPOOL-2026063002', uom: '个', plannedQty: 70, postedQty: 70 },
      ],
      warehouseCode: 'WH-RM', warehouse: '原料仓', targetWarehouse: '挤出 A1 线边仓', owner: '王倩',
      status: '已完成', date: '2026-07-01', note: '承接 RB2-260701-001，领料过账后生成流转批次 EC2-260701-001。', revision: 2,
      submittedAt: '2026-07-01 07:45', postedAt: '2026-07-01 08:00', postedBy: '王倩',
    },
    {
      code: 'WM2-260701-005', moveType: '生产领料', direction: '出库', reason: '生产领料',
      workOrder: 'MO2-260701-001', releaseBatch: 'RB2-260701-002', executionCard: 'EC2-260701-002',
      products: [
        { lineId: 'WM2-260701-005-L1', materialCode: 'M-RM-PLA-VIRGIN', sourceLineId: 'MAT-1', name: 'PLA 原生粒子', qty: '38.4 kg', batch: 'PLA-260710-B', uom: 'kg', plannedQty: 38.4, postedQty: 38.4 },
        { lineId: 'WM2-260701-005-L2', materialCode: 'M-CM-MATTE-BLK', sourceLineId: 'MAT-2', name: '哑光黑色母', qty: '1.6 kg', batch: 'MB-MBK-260702-A', uom: 'kg', plannedQty: 1.6, postedQty: 1.6 },
        { lineId: 'WM2-260701-005-L3', materialCode: 'M-PKG-SPOOL-1KG', sourceLineId: 'MAT-3', name: '小盘线轴 1kg', qty: '40 个', batch: 'SPOOL-2026063002', uom: '个', plannedQty: 40, postedQty: 40 },
      ],
      warehouseCode: 'WH-RM', warehouse: '原料仓', targetWarehouse: '挤出 A2 线边仓', owner: '王倩',
      status: '已完成', date: '2026-07-01', note: '承接 RB2-260701-002，领料过账后生成流转批次 EC2-260701-002。', revision: 2,
      submittedAt: '2026-07-01 08:05', postedAt: '2026-07-01 08:15', postedBy: '王倩',
    },
    {
      code: 'WM2-260701-006', moveType: '生产领料', direction: '出库', reason: '生产领料',
      workOrder: 'MO2-260701-001', releaseBatch: 'RB2-260701-003', executionCard: 'EC2-260701-003',
      products: [
        { lineId: 'WM2-260701-006-L1', materialCode: 'M-RM-PLA-VIRGIN', sourceLineId: 'MAT-1', name: 'PLA 原生粒子', qty: '7.68 kg', batch: 'PLA-260710-B', uom: 'kg', plannedQty: 7.68, postedQty: 7.68 },
        { lineId: 'WM2-260701-006-L2', materialCode: 'M-CM-MATTE-BLK', sourceLineId: 'MAT-2', name: '哑光黑色母', qty: '0.32 kg', batch: 'MB-MBK-260702-A', uom: 'kg', plannedQty: 0.32, postedQty: 0.32 },
        { lineId: 'WM2-260701-006-L3', materialCode: 'M-PKG-SPOOL-1KG', sourceLineId: 'MAT-3', name: '小盘线轴 1kg', qty: '8 个', batch: 'SPOOL-2026063002', uom: '个', plannedQty: 8, postedQty: 8 },
      ],
      warehouseCode: 'WH-RM', warehouse: '原料仓', targetWarehouse: '挤出 A2 线边仓', owner: '王倩',
      status: '已完成', date: '2026-07-01', note: '承接 RB2-260701-003，领料过账后生成流转批次 EC2-260701-003。', revision: 2,
      submittedAt: '2026-07-01 19:30', postedAt: '2026-07-01 19:40', postedBy: '王倩',
    },
    {
      code: 'WM2-260630-006', moveType: '生产领料', direction: '出库', reason: '生产领料',
      workOrder: 'MO2-260630-004', releaseBatch: 'RB2-260630-006', executionCard: 'EC2-260630-006',
      products: [
        { lineId: 'WM2-260630-006-L1', materialCode: 'M-RM-PLA-VIRGIN', sourceLineId: 'MAT-1', name: 'PLA 原生粒子', qty: '7.76 kg', batch: 'PLA-260710-B', uom: 'kg', plannedQty: 7.76, postedQty: 7.76 },
        { lineId: 'WM2-260630-006-L2', materialCode: 'M-CM-PEARL-WHT', sourceLineId: 'MAT-2', name: '珍珠白色母', qty: '0.24 kg', batch: 'CM-PW-260706', uom: 'kg', plannedQty: 0.24, postedQty: 0.24 },
        { lineId: 'WM2-260630-006-L3', materialCode: 'M-PKG-SPOOL-1KG', sourceLineId: 'MAT-3', name: '小盘线轴 1kg', qty: '8 个', batch: 'SPOOL-2026063002', uom: '个', plannedQty: 8, postedQty: 8 },
      ],
      warehouseCode: 'WH-RM', warehouse: '原料仓', targetWarehouse: '复绕 R1 线边仓', owner: '王倩',
      status: '已完成', date: '2026-06-30', note: '承接 RB2-260630-006，领料过账后生成流转批次 EC2-260630-006。', revision: 2,
      submittedAt: '2026-06-30 07:40', postedAt: '2026-06-30 07:55', postedBy: '王倩',
    },
  ]);

  addMissingByCode(warehouse.productionReturns, [
    {
      code: 'WMR2-20260701-001', moveType: '生产退料', direction: '入库', reason: '生产余料退回',
      materialIssue: 'WM2-260701-005', workOrder: 'MO2-260701-001', releaseBatch: 'RB2-260701-002', executionCard: 'EC2-260701-002',
      products: [
        { lineId: 'WMR2-20260701-001-L1', materialCode: 'M-PKG-SPOOL-1KG', sourceLineId: 'MAT-3', name: '小盘线轴 1kg', qty: '3 个', batch: 'SPOOL-2026063002', uom: '个', plannedQty: 3, postedQty: 0 },
      ],
      warehouse: '挤出 A2 线边仓', targetWarehouseCode: 'WH-RM', targetWarehouse: '原料仓', owner: '王倩',
      status: '待入库', date: '2026-07-01', note: '现场完工后剩余 3 个未使用线轴，引用原领料单退回原料仓。', revision: 2,
      createdAt: '2026-07-01 17:05', updatedAt: '2026-07-01 17:12', submittedAt: '2026-07-01 17:12',
    },
  ]);

  addMissingByCode(warehouse.productionReceipts, [
    {
      code: 'WPR2-20260701-001', moveType: '完工入库', workOrder: 'MO2-260701-001',
      releaseBatch: 'RB2-260701-001', executionCard: 'EC2-260701-001', qualityTaskCodes: [],
      quantity: 30, unit: '卷',
      products: [{ lineId: 'WPR2-20260701-001-L1', materialCode: 'M-FG-PLA-175-MBK', name: 'PLA 1.75mm 哑光黑耗材 1kg', qty: '30 卷', plannedQty: 30, postedQty: 30, batch: 'EC2-260701-001', uom: '卷' }],
      warehouseCode: '', warehouse: '挤出 A1 线边仓', targetWarehouseCode: 'WH-FG', targetWarehouse: '成品仓', targetLocation: 'FG-AUTO',
      owner: '王倩', status: '已完成', date: '2026-07-01', note: 'EC2-260701-001 首批质检放行产出已完成入库。',
      revision: 2, createdAt: '2026-07-01 15:10', updatedAt: '2026-07-01 15:28', submittedAt: '2026-07-01 15:12', postedAt: '2026-07-01 15:28', postedBy: '王倩', postIdempotencyKey: 'seed:WPR2-20260701-001:post:1',
    },
  ]);

  const completedReceiptCode = 'WPR2-20260701-001';
  const completedReceiptCard = production.executionCards.find((item) => item.code === 'EC2-260701-001');
  if (completedReceiptCard) completedReceiptCard.productionReceiptCodes = [...new Set([...(completedReceiptCard.productionReceiptCodes || []), completedReceiptCode])];
  const completedReceiptRelease = production.workOrderReleases.find((item) => item.code === 'RB2-260701-001');
  if (completedReceiptRelease) completedReceiptRelease.productionReceiptCodes = [...new Set([...(completedReceiptRelease.productionReceiptCodes || []), completedReceiptCode])];

  addMissingByCode(production.productionExceptions, [
    { code: 'EX2-260715-006', type: '缺料', source: 'PT2-260715-006', relatedWorkOrder: 'MO2-260715-006', relatedBatch: '', line: '挤出 B1 线', level: '紧急', status: '处理中', owner: '周敏', responsibility: '仓库 / 生产计划', createdAt: '2026-07-15 10:20', effect: '可用库存不足，阻断工单释放和现场开工', affectedQty: 180, unit: '卷', estimatedLoss: '影响销售订单 180 卷交付', cause: 'PETG 原生粒子已有 650 kg 质检放行，但尚未完成仓库正式入库。', disposition: '跟踪采购收货正式入库', nextAction: '仓库入库后重新校验齐套并释放工单', revision: 1 },
    { code: 'EX2-260701-002', type: '质检不合格', source: 'QC2-260630-003', relatedWorkOrder: 'MO2-260630-004', relatedBatch: 'EC2-260630-006', line: '复绕 R1 线', level: '一般', status: '待复核', owner: '赵敏', responsibility: '工艺工程 / 复绕 R1 线', createdAt: '2026-06-30 15:30', effect: '处置闭环前阻断包装', affectedQty: 1, unit: '卷', estimatedLoss: '隔离 1 卷，损失待处置确认', cause: '绕线张力波动，1 卷排线偏松。', disposition: '返工复检、让步审批或报废', nextAction: '在生产质检单执行正式不合格处置', executionCardCode: 'EC2-260630-006', releaseBatchCode: 'RB2-260630-006', outcome: '异常停机', revision: 1 },
  ]);

  addMissingByCode(production.qualityTasks, [
    { code: 'QC2-260701-003', sourceCard: 'EC2-260701-001', sourceReportCode: 'PRPT2-260701-001', workOrderCode: 'MO2-260701-001', releaseBatchCode: 'RB2-260701-001', kind: '报工全检', node: '待过程检', productCode: 'M-FG-PLA-175-MBK', productName: 'PLA 1.75mm 哑光黑耗材 1kg', line: '挤出 A1 线', sampleQty: '70 卷', quantity: 70, unit: '卷', qualityStandardCode: 'QSTD-PQC-REPORT-FULL-V1', qualityStandardName: '报工全检标准', standardVersionId: 'QSTD-PQC-REPORT-FULL-V1', inspector: '孙悦', status: '部分合格', dueTime: '2026-07-01 14:30', checkpoints: ['重量', '绕线', '标签批次', '线径', '外观'], result: '部分合格', disposition: '2 卷报废，68 卷放行包装', acceptedQty: 68, rejectedQty: 2, dispositionStatus: '已完成', disposedQty: 2, remainingDispositionQty: 0, inProcessDispositionQty: 0, unassignedDispositionQty: 0, scrappedQty: 2, version: 2, decidedAt: '2026-07-01 14:20' },
    { code: 'QC2-260701-004', sourceCard: 'EC2-260701-001', sourceReportCode: 'BOX-A1-001', workOrderCode: 'MO2-260701-001', releaseBatchCode: 'RB2-260701-001', kind: '入库抽检', node: '待抽检', productCode: 'M-FG-PLA-175-MBK', productName: 'PLA 1.75mm 哑光黑耗材 1kg', line: '挤出 A1 线', sampleQty: '3 卷', quantity: 30, unit: '卷', qualityStandardCode: 'QSTD-PQC-INBOUND-SAMPLE-V1', qualityStandardName: '入库抽检标准', standardVersionId: 'QSTD-PQC-INBOUND-SAMPLE-V1', inspector: '孙悦', status: '合格', dueTime: '2026-07-01 15:10', checkpoints: ['箱标', '包装规格', '抽样小盘', '外箱外观', '入库批次一致'], result: '合格', disposition: '首包装批 30 卷放行完工入库', acceptedQty: 30, rejectedQty: 0, dispositionStatus: '无需处置', version: 1, decidedAt: '2026-07-01 15:05' },
    { code: 'QC2-260701-001', sourceCard: 'EC2-260701-002', workOrderCode: 'MO2-260701-001', releaseBatchCode: 'RB2-260701-002', kind: '入库抽检', node: '待抽检', productCode: 'M-FG-PLA-175-MBK', productName: 'PLA 1.75mm 哑光黑耗材 1kg', line: '挤出 A2 线', sampleQty: '4 卷', quantity: 39, unit: '卷', qualityStandardCode: 'QSTD-PQC-INBOUND-SAMPLE-V1', qualityStandardName: '入库抽检标准', standardVersionId: 'QSTD-PQC-INBOUND-SAMPLE-V1', inspector: '孙悦', status: '待检', dueTime: '今日 16:30', checkpoints: ['箱标', '包装规格', '抽样小盘', '外箱外观', '入库批次一致'], result: '未开始', disposition: '合格后申请入库', version: 0 },
    { code: 'QC2-260701-002', sourceCard: 'EC2-260701-003', workOrderCode: 'MO2-260701-001', releaseBatchCode: 'RB2-260701-003', kind: '开机首检', node: '待首检', productCode: 'M-FG-PLA-175-MBK', productName: 'PLA 1.75mm 哑光黑耗材 1kg', line: '挤出 A2 线', sampleQty: '1 组', quantity: 8, unit: '卷', qualityStandardCode: 'QSTD-PQC-FIRST-V1', qualityStandardName: '开机首检标准', standardVersionId: 'QSTD-PQC-FIRST-V1', inspector: '孙悦', status: '待检', dueTime: '晚班开机后', checkpoints: ['开机初段样', '颜色', '线径', '外观', '工艺参数'], result: '未开始', disposition: '首检合格后继续生产', version: 0 },
    { code: 'QC2-260630-WIP-001', sourceCard: 'EC2-260630-006', sourceReportCode: 'PRPT2-260630-WIP-001', sourceWipBatchCode: 'LRL2-260630-R1-001', workOrderCode: 'MO2-260630-004', releaseBatchCode: 'RB2-260630-006', kind: '半成品质检', node: '待半成品检', productCode: 'M-FG-PLA-175-WHT', productName: 'PLA 1.75mm 珍珠白耗材 1kg', line: '复绕 R1 线', sampleQty: '8.2 kg', quantity: 8.2, unit: 'kg', qualityStandardCode: 'QSTD-PQC-WIP-LARGE-REEL-V1', qualityStandardName: '大盘半成品质检标准', standardVersionId: 'QSTD-PQC-WIP-LARGE-REEL-V1', inspector: '赵敏', status: '合格', dueTime: '2026-06-30 11:00', checkpoints: ['大盘编号', '净重', '线径', '颜色与外观', '收卷状态'], result: '合格', disposition: '大盘已放行复绕', acceptedQty: 8.2, rejectedQty: 0, dispositionStatus: '无需处置', version: 1, decidedAt: '2026-06-30 11:05' },
    { code: 'QC2-260630-003', sourceCard: 'EC2-260630-006', sourceReportCode: 'PRPT2-260630-006', workOrderCode: 'MO2-260630-004', releaseBatchCode: 'RB2-260630-006', kind: '报工全检', node: '待过程检', productCode: 'M-FG-PLA-175-WHT', productName: 'PLA 1.75mm 珍珠白耗材 1kg', line: '复绕 R1 线', sampleQty: '8 卷', quantity: 8, unit: '卷', qualityStandardCode: 'QSTD-PQC-REPORT-FULL-V1', qualityStandardName: '报工全检标准', standardVersionId: 'QSTD-PQC-REPORT-FULL-V1', inspector: '赵敏', status: '部分合格', dueTime: '今日 15:00', checkpoints: ['重量', '绕线', '标签批次', '线径', '外观'], result: '部分合格', disposition: '1 卷绕线偏松，待正式处置', acceptedQty: 7, rejectedQty: 1, dispositionStatus: '待处置', disposedQty: 0, remainingDispositionQty: 1, inProcessDispositionQty: 0, unassignedDispositionQty: 1, version: 1, decidedAt: '2026-06-30 15:30' },
    { code: 'QC2-260719-WIP-005', sourceCard: 'EC2-260719-005', sourceReportCode: 'PRPT2-260719-WIP-005', sourceWipBatchCode: 'LRL2-260719-005', workOrderCode: 'MO2-260719-005', releaseBatchCode: 'RB2-260719-005', kind: '半成品质检', node: '待半成品检', productCode: 'M-FG-PLA-175-WHT', productName: 'PLA 1.75mm 珍珠白耗材 1kg', line: '挤出 A1 线', sampleQty: '4.1 kg', quantity: 4.1, unit: 'kg', qualityStandardCode: 'QSTD-PQC-WIP-LARGE-REEL-V1', qualityStandardName: '大盘半成品质检标准', standardVersionId: 'QSTD-PQC-WIP-LARGE-REEL-V1', inspector: '赵敏', status: '合格', dueTime: '2026-07-19 10:30', checkpoints: ['大盘编号', '净重', '线径', '颜色与外观', '收卷状态'], result: '合格', disposition: '大盘已放行并自动进入复绕队列', acceptedQty: 4.1, rejectedQty: 0, dispositionStatus: '无需处置', version: 1, decidedAt: '2026-07-19 10:35' },
  ]);

  production.qualityDecisions['QC2-260630-WIP-001'] ||= { code: 'QC2-260630-WIP-001', taskCode: 'QC2-260630-WIP-001', executionCardCode: 'EC2-260630-006', kind: '半成品质检', result: '合格', acceptedQty: 8.2, rejectedQty: 0, unit: 'kg', remark: '大盘线径、颜色和收卷状态合格，放行复绕。', actor: '赵敏', version: 1, idempotencyKey: 'seed:QC2-260630-WIP-001:decision:1', decidedAt: '2026-06-30 11:05' };
  production.qualityDecisions['QC2-260701-003'] ||= { code: 'QC2-260701-003', taskCode: 'QC2-260701-003', executionCardCode: 'EC2-260701-001', kind: '报工全检', result: '部分合格', acceptedQty: 68, rejectedQty: 2, unit: '卷', remark: '2 卷外观不合格并完成报废，68 卷放行包装。', actor: '孙悦', version: 2, idempotencyKey: 'seed:QC2-260701-003:decision:1', decidedAt: '2026-07-01 14:20' };
  production.qualityDecisions['QC2-260701-004'] ||= { code: 'QC2-260701-004', taskCode: 'QC2-260701-004', executionCardCode: 'EC2-260701-001', kind: '入库抽检', result: '合格', acceptedQty: 30, rejectedQty: 0, unit: '卷', remark: '首包装批 30 卷抽检合格，放行完工入库。', actor: '孙悦', version: 1, idempotencyKey: 'seed:QC2-260701-004:decision:1', decidedAt: '2026-07-01 15:05' };
  production.qualityDispositions['QC2-260701-003'] ||= [{ id: 'PQD2-260701-001', taskCode: 'QC2-260701-003', executionCardCode: 'EC2-260701-001', sourceReportCode: 'PRPT2-260701-001', action: 'scrap', quantity: 2, unit: '卷', reason: '外观不合格，按报废处置并隔离留样。', actor: '孙悦', status: '已完成', decisionVersion: 2, version: 1, idempotencyKey: 'seed:QC2-260701-003:disposition:1', executedAt: '2026-07-01 14:25' }];
  production.qualityDecisions['QC2-260630-003'] ||= { code: 'QC2-260630-003', taskCode: 'QC2-260630-003', executionCardCode: 'EC2-260630-006', kind: '报工全检', result: '部分合格', acceptedQty: 7, rejectedQty: 1, unit: '卷', remark: '1 卷绕线偏松，隔离等待处置。', actor: '赵敏', version: 1, idempotencyKey: 'seed:QC2-260630-003:decision:1', decidedAt: '2026-06-30 15:30' };
  production.qualityDecisions['QC2-260719-WIP-005'] ||= { code: 'QC2-260719-WIP-005', taskCode: 'QC2-260719-WIP-005', executionCardCode: 'EC2-260719-005', kind: '半成品质检', result: '合格', acceptedQty: 4.1, rejectedQty: 0, unit: 'kg', remark: '大盘放行后自动进入复绕 R1 线队列。', actor: '赵敏', version: 1, idempotencyKey: 'seed:QC2-260719-WIP-005:decision:1', decidedAt: '2026-07-19 10:35' };

  mergeFlowRecords(production.workOrderFlowRecords, {
    'MO2-260630-004': [{ time: '2026-06-30 15:30', actor: '赵敏', action: '报工全检判定', remark: '8 卷中 7 卷合格、1 卷绕线偏松，等待处置闭环。' }],
    'MO2-260719-005': [{ time: '2026-07-19 10:35', actor: '系统', action: '生成复绕任务', remark: '大盘 LRL2-260719-005 质检合格，自动排入复绕 R1 线。' }],
  });
  mergeFlowRecords(production.workOrderReleaseFlowRecords, {
    'RB2-260630-006': [{ time: '2026-06-30 15:30', actor: '赵敏', action: '报工全检判定', remark: 'QC2-260630-003 部分合格，后续工序保持阻断。' }],
    'RB2-260719-005': [{ time: '2026-07-19 10:35', actor: '系统', action: '自动排入复绕', remark: '挤出线已释放，复绕任务等待现场开始。' }],
  });
  mergeFlowRecords(production.executionCardFlowRecords, {
    'EC2-260630-006': [{ time: '2026-06-30 15:30', actor: '赵敏', action: '报工全检判定', remark: '隔离 1 卷不合格品，等待返工复检、让步放行或报废。' }],
    'EC2-260719-005': [{ time: '2026-07-19 10:35', actor: '系统', action: '生成复绕任务', remark: '同一生产批次下自动生成复绕设备任务，不重复建工单。' }],
  });
  mergeFlowRecords(warehouse.productionReceiptFlowRecords, {
    'WPR2-20260701-001': [
      { time: '2026-07-01 15:10', actor: '系统', action: '创建完工入库', remark: '承接 EC2-260701-001 已放行的 30 卷产出。' },
      { time: '2026-07-01 15:28', actor: '王倩', action: '完工入库过账', remark: '30 卷已进入成品仓，并回写流转批次累计入库量。' },
    ],
  });
  mergeFlowRecords(warehouse.productionIssueFlowRecords, {
    'WM2-260701-001': [{ time: '2026-07-01 08:00', actor: '王倩', action: '生产领料过账', remark: 'RB2-260701-001 物料已出库，生成流转批次 EC2-260701-001。' }],
    'WM2-260701-005': [{ time: '2026-07-01 08:15', actor: '王倩', action: '生产领料过账', remark: 'RB2-260701-002 物料已出库，生成流转批次 EC2-260701-002。' }],
    'WM2-260701-006': [{ time: '2026-07-01 19:40', actor: '王倩', action: '生产领料过账', remark: 'RB2-260701-003 物料已出库，生成流转批次 EC2-260701-003。' }],
    'WM2-260630-006': [{ time: '2026-06-30 07:55', actor: '王倩', action: '生产领料过账', remark: 'RB2-260630-006 物料已出库，生成流转批次 EC2-260630-006。' }],
  });

  addMissingByCode(production.packagingRecords, [
    { code: 'PPK2-260701-001', executionCardCode: 'EC2-260701-001', workOrderCode: 'MO2-260701-001', releaseBatchCode: 'RB2-260701-001', packageRef: 'BOX-A1-001', quantity: 30, unit: '卷', qualityTaskCode: 'QC2-260701-004', actor: '王敏', packedAt: '2026-07-01 14:45', idempotencyKey: 'seed:EC2-260701-001:pack:1' },
  ]);
  mergeFlowRecords(warehouse.productionReturnFlowRecords, {
    'WMR2-20260701-001': [
      { time: '2026-07-01 17:05', actor: '王倩', action: '创建退料草稿', remark: '引用原领料单 WM2-260701-005，登记 3 个未使用线轴。' },
      { time: '2026-07-01 17:12', actor: '王倩', action: '提交退料入库', remark: '等待仓库核对批次并确认入库。' },
    ],
  });

  // Migrate the long-lived rewind demo facts even when an older data file already contains them.
  const rewindOrder = production.workOrders.find((item) => item.code === 'MO2-260630-004');
  if (rewindOrder) {
    rewindOrder.processTemplateCode = 'PRC2-WIRE-DRAWING-REWIND-V1';
    rewindOrder.snapshot = null;
  }
  const rewindCard = production.executionCards.find((item) => item.code === 'EC2-260630-006');
  if (rewindCard) {
    rewindCard.processTemplateCode = 'PRC2-WIRE-DRAWING-REWIND-V1';
    rewindCard.processSnapshot = null;
    rewindCard.qualityTaskCodes = [...new Set(['QC2-260630-WIP-001', ...(rewindCard.qualityTaskCodes || [])])];
    rewindCard.reportCodes = [...new Set(['PRPT2-260630-WIP-001', ...(rewindCard.reportCodes || [])])];
    rewindCard.wipBatchCodes = ['LRL2-260630-R1-001'];
    rewindCard.lineageRecordCodes = production.batchLineageRecords
      .filter((item) => item.executionCardCode === rewindCard.code)
      .map((item) => item.code);
    rewindCard.wipReportedQtyKg = 8.2;
    rewindCard.wipQualifiedQtyKg = 8.2;
  }
  const rewindFinishedReport = production.productionReports.find((item) => item.code === 'PRPT2-260630-006');
  if (rewindFinishedReport) {
    rewindFinishedReport.kind = '成品报工';
    rewindFinishedReport.sourceWipBatchCode = 'LRL2-260630-R1-001';
    rewindFinishedReport.consumedWeightKg = 8;
    rewindFinishedReport.lossWeightKg = 0.2;
    rewindFinishedReport.qualityTaskCode = 'QC2-260630-003';
    rewindFinishedReport.outputRollCodes = production.batchLineageRecords
      .filter((item) => item.reportCode === rewindFinishedReport.code)
      .map((item) => item.outputRollCode);
  }

  const partialInboundCard = production.executionCards.find((item) => item.code === 'EC2-260701-001');
  if (partialInboundCard) {
    partialInboundCard.qualityTaskCodes = [...new Set([...(partialInboundCard.qualityTaskCodes || []), 'QC2-260701-003', 'QC2-260701-004'])];
    partialInboundCard.reportCodes = [...new Set([...(partialInboundCard.reportCodes || []), 'PRPT2-260701-001'])];
    partialInboundCard.packageRefs = [...new Set([...(partialInboundCard.packageRefs || []), 'BOX-A1-001'])];
  }
  const partialInboundRelease = production.workOrderReleases.find((item) => item.code === 'RB2-260701-001');
  if (partialInboundRelease) {
    partialInboundRelease.qualityTaskCodes = [...new Set([...(partialInboundRelease.qualityTaskCodes || []), 'QC2-260701-003', 'QC2-260701-004'])];
  }
  const partialInboundReceipt = warehouse.productionReceipts.find((item) => item.code === 'WPR2-20260701-001');
  if (partialInboundReceipt) {
    partialInboundReceipt.qualityTaskCodes = [...new Set([...(partialInboundReceipt.qualityTaskCodes || []), 'QC2-260701-004'])];
  }

  // Keep long-lived demo quality tasks aligned with the current controlled-batch and sampling contracts.
  production.qualityTasks.forEach((task) => {
    const card = production.executionCards.find((item) => item.code === task.sourceCard);
    if (task.kind === '开机首检' && card) {
      const sourceJob = (card.operationJobs || []).find((job) => job.code === task.sourceReportCode);
      task.quantity = Number(sourceJob?.plannedQty || card.planQty || 0);
      task.unit = sourceJob?.plannedUnit || card.unit || '卷';
      task.sampleQty = '1 组';
    }
    if (task.kind === '入库抽检' && task.unit === '卷') {
      const batchQty = Math.max(0, Number(task.quantity || 0));
      const sampleQty = Math.min(batchQty, 12, Math.max(2, Math.ceil(batchQty * 0.1)));
      task.sampleQty = `${sampleQty} 卷`;
    }
  });

  return data;
}
