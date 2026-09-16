import productionSystemActionCatalog from '../../shared/production-system-actions.json';
import productionProcessStageCatalog from '../../shared/production-process-stages.json';

export type Production2PageKey =
  | 'workbench'
  | 'tasks'
  | 'material-requests'
  | 'work-orders'
  | 'execution-cards'
  | 'quality-standards'
  | 'quality'
  | 'recipes'
  | 'process-templates'
  | 'process-steps'
  | 'loss-ledger'
  | 'exceptions';

export type MaterialNeedStatus =
  | '充足'
  | '已齐套'
  | '可齐套'
  | '已分配'
  | '需采购'
  | '待采购'
  | '待来料质检'
  | '待质检放行'
  | '待仓库入库'
  | '补充在途'
  | '待核对库存';
export type ProductionNode =
  | '待释放'
  | '待领料'
  | '待干燥'
  | '待开机'
  | '待首件'
  | '待首检'
  | '生产报工'
  | '半成品报工'
  | '待半成品检'
  | '待过程检'
  | '成品报工'
  | '待成品检'
  | '待打包'
  | '待包装'
  | '待抽检'
  | '待入库'
  | '已入库'
  | '异常停机';

export type Production2MaterialNeed = {
  lineId?: string;
  materialCode: string;
  materialName: string;
  perUnitQty: number;
  estimatedQty: number;
  actualQty?: number;
  availableQty: number;
  inventoryKnown?: boolean;
  reservedQty?: number;
  allocatedQty?: number;
  qcPendingQty?: number;
  pendingInboundQty?: number;
  inTransitQty?: number;
  procurementGapQty?: number;
  shortageQty: number;
  unit: string;
  incomingQcRequired: boolean;
  status: MaterialNeedStatus;
  sourceLines?: Array<{
    sourceLineId: string;
    productCode: string;
    recipeCode: string;
    estimatedQty: number;
    unit: string;
  }>;
};

export type Production2Task = {
  code: string;
  source: string;
  sourceLineId?: string;
  createdAt: string;
  productCode: string;
  productName: string;
  demandQty: number;
  finishedStockQty: number;
  productionQty: number;
  unit: string;
  deliveryDate: string;
  priority: '正常' | '加急';
  status: '待建工单' | '部分建单' | '已建单' | '已完成';
  recipeCode: string;
  materialNeeds: Production2MaterialNeed[];
  materialPlanningStatus?: '待提交' | '已展开物料需求' | '部分待配置配方' | '待配置配方';
  materialPlanningBlockers?: Array<{
    sourceLineId: string;
    productCode: string;
    productName: string;
    reason: string;
  }>;
  ownerEmployeeCode?: string;
  owner: string;
  supplementaryRequirement?: string;
  note?: string;
  nextAction: string;
};

export type Production2MaterialRequestLine = {
  materialCode: string;
  materialName: string;
  model?: string;
  spec?: string;
  requestedQty: number;
  availableQty: number;
  purchaseQty: number;
  unit: string;
  purpose: string;
};

export type Production2MaterialRequest = {
  code: string;
  requestType: '任务缺口补料' | '临时备料' | '试产备料' | '损耗补料' | '返工补料';
  sourceTaskCode: string;
  sourceDocument: string;
  department: string;
  requesterEmployeeCode?: string;
  requester: string;
  requestDate: string;
  expectedDate: string;
  status: '草稿' | '库存可满足' | '已转采购';
  linkedPurchaseRequisition: string;
  note: string;
  nextAction: string;
  lines: Production2MaterialRequestLine[];
};

export type Production2LinePlan = {
  line: string;
  lineType: string;
  planQty: number;
  issuedQty: number;
  reportedQty: number;
  packedQty: number;
  inboundQty: number;
  leader: string;
  status: '待释放' | '待领料' | '生产中' | '待入库' | '已完成';
};

export type Production2ReleaseBatch = {
  code: string;
  workOrderCode: string;
  taskCode: string;
  sourceLineId: string;
  lineCode?: string;
  line: string;
  lineType: string;
  lineWorkshop?: string;
  shift: string;
  leader: string;
  planQty: number;
  releasedQty: number;
  unit: string;
  releaseStatus: '待释放' | '已释放' | '已撤回';
  materialStatus: '待备料' | '待领料' | '部分领料' | '已领料' | '有缺料' | '已退料';
  executionStatus: '待开工' | '执行中' | '已暂停' | '已报工' | '已完成' | '异常';
  qualityStatus: '未触发' | '待检' | '检验中' | '待复判' | '待处置' | '已放行' | '已拒收';
  inboundStatus: '未报工' | '待放行' | '待入库' | '部分入库' | '已入库';
  materialIssueCodes: string[];
  executionCardCodes: string[];
  qualityTaskCodes: string[];
  productionReceiptCodes: string[];
  nextAction: string;
  idempotencyKey?: string;
  workOrderRevision?: number;
  releasedAt?: string;
  releasedBy?: string;
  materialRequirements?: Array<Record<string, unknown>>;
  materialAllocations?: Array<Record<string, unknown>>;
};

export type Production2WorkOrderSnapshot = {
  recipeVersionId?: string;
  processVersionId?: string;
  productQuantity?: { value: number; unit: string };
  sourceTask?: string;
  sourceLineId?: string;
  sourceAllocations?: Production2WorkOrderSourceAllocation[];
  frozenAt?: string;
  frozenBy?: string;
  snapshotStatus?: string;
  sourceLine?: Record<string, unknown>;
  recipe?: Record<string, unknown>;
  processTemplate?: Record<string, unknown>;
  processSteps?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type Production2WorkOrderSourceAllocation = {
  taskCode: string;
  sourceLineId: string;
  sourceDocument?: string;
  supplementaryRequirement?: string;
  taskNote?: string;
  productCode: string;
  productName?: string;
  quantity: number;
  unit: string;
  dueDate?: string;
};

export type Production2StageInstanceStatus =
  | '已完成'
  | '可执行'
  | '等待中'
  | '已暂停'
  | '异常'
  | '未开始';

export type Production2ActionInstanceStatus =
  | '已完成'
  | '可执行'
  | '待触发'
  | '等待结果'
  | '被阻断'
  | '异常'
  | '不适用'
  | '未开始';

export type Production2ActionInstance = {
  id: string;
  stageInstanceId: string;
  actionCode: string;
  actionName: string;
  ownerDomain: '生产' | '质检' | '仓库' | '系统';
  executionMode: '人工操作' | '事件自动触发';
  completionMode?: '提交成功即完成' | '等待后续完成';
  status: Production2ActionInstanceStatus;
  blocking: boolean;
  required: boolean;
  blockingPolicy?: '不阻断' | '完成前阻断' | '失败时阻断';
  repeatPolicy?: '单次' | '按批次重复' | '按报工重复' | '全程可用';
  sourceDocument?: string;
  resultDocument?: string;
  idempotencyScope?: string;
  completionSignal?: string;
  occurredAt?: string;
  waitingFor?: string;
  completedAt?: string;
};

export type Production2ProcessStageInstance = {
  id: string;
  executionCardCode: string;
  sequence: number;
  stageCode: string;
  stageName: string;
  stageType: string;
  owner: string;
  status: Production2StageInstanceStatus;
  enteredAt?: string;
  completedAt?: string;
  nextAction: string;
  blocker?: string;
  actionInstances: Production2ActionInstance[];
};

export type Production2WorkOrder = {
  code: string;
  taskCode: string;
  sourceDocument?: string;
  sourceLineId: string;
  sourceAllocations?: Production2WorkOrderSourceAllocation[];
  productCode: string;
  productName: string;
  planQty: number;
  releasedQty?: number;
  completedQty: number;
  inboundQty: number;
  unit: string;
  plannedDate: string;
  dueDate: string;
  recipeCode: string;
  processTemplateCode: string;
  status: '草稿' | '待确认' | '待释放' | '部分释放' | '待领料' | '生产中' | '部分入库' | '已完成';
  materialNeeds: Production2MaterialNeed[];
  linePlans: Production2LinePlan[];
  currentNode: ProductionNode | '草稿';
  ownerEmployeeCode?: string;
  owner: string;
  note: string;
  documentStatus: string;
  revision: number;
  snapshot?: Production2WorkOrderSnapshot | null;
  nextAction: string;
};

export type Production2ExecutionCard = {
  code: string;
  releaseBatchCode?: string;
  workOrderCode: string;
  productCode?: string;
  productName: string;
  line: string;
  lineType: string;
  shift: string;
  leader: string;
  operator: string;
  planQty: number;
  /** @deprecated 历史兼容字段；领料是多物料、多单位事实，不得使用成品单位汇总。 */
  issuedQty?: number;
  materialStatus?: '待领料' | '已领料';
  createdAt?: string;
  reportedQty: number;
  qualifiedQty?: number;
  packedQty: number;
  releasedInboundQty?: number;
  inboundQty: number;
  defectQty: number;
  inboundHoldQty?: number;
  inboundScrappedQty?: number;
  unit: string;
  node: ProductionNode;
  status: '待处理' | '进行中' | '已暂停' | '待质检' | '待仓库' | '已完成' | '异常';
  nextAction: string;
  processTemplateCode: string;
  planSnapshot?: Record<string, unknown> | null;
  processSnapshot?: Record<string, unknown> | null;
  currentStageCode?: string;
  currentStageInstanceId?: string;
  stageInstances?: Production2ProcessStageInstance[];
  materialIssueCode?: string;
  qualityTaskCodes?: string[];
  reportCodes?: string[];
  wipBatchCodes?: string[];
  lineageRecordCodes?: string[];
  wipReportedQtyKg?: number;
  wipQualifiedQtyKg?: number;
  wipBatches?: Production2WipBatch[];
  lineageRecords?: Production2BatchLineageRecord[];
  operationJobs?: Production2OperationJob[];
  activeOperationJobCode?: string;
  shortClosedAt?: string;
  shortClosedBy?: string;
  shortCloseReason?: string;
  shortCloseRemainingQty?: number;
  shortCloseResolution?: '待处理' | '安排补产' | '接受短缺';
  shortCloseResolvedAt?: string;
  shortCloseResolvedBy?: string;
  shortCloseResolutionReason?: string;
  shortCloseSupplementJobCode?: string;
  acceptedShortageQty?: number;
  productionReceiptCodes?: string[];
  packageRefs?: string[];
  packagingRecords?: Production2PackagingRecord[];
  revision?: number;
  startedAt?: string;
  pausedAt?: string;
  pausedBy?: string;
  pauseReason?: string;
  pauseEventCode?: string;
  resumedAt?: string;
  resumedBy?: string;
  resumeReason?: string;
  resumeEventCode?: string;
  pauseContext?: { node: string; status: string; nextAction: string } | null;
  activeExceptionCode?: string;
  exceptionContext?: { node: string; status: string; nextAction: string } | null;
  handoverPending?: boolean;
  handoverCode?: string;
  updatedAt?: string;
};

export type Production2PackagingRecord = {
  code: string;
  executionCardCode: string;
  workOrderCode: string;
  releaseBatchCode?: string;
  packageRef: string;
  quantity: number;
  unit: string;
  qualityTaskCode: string;
  actor: string;
  packedAt: string;
};

export type Production2OperationJob = {
  code: string;
  productionBatchCode: string;
  operationType: '挤出生产' | '复绕生产';
  lineType: string;
  assignedLine?: string;
  recommendedLine?: string;
  sequence: number;
  sourceWipBatchCode?: string;
  plannedQty: number;
  plannedUnit: 'kg' | '卷';
  actualQty: number;
  actualUnit: 'kg' | '卷';
  status: '待排程' | '队列中' | '可开工' | '执行中' | '暂停' | '异常' | '已完成' | '已取消';
  nextAction: string;
  createdAt: string;
  plannedAt?: string;
  actualStart?: string;
  actualEnd?: string;
  startedBy?: string;
  completedBy?: string;
  completionMode?: '达量完成' | '大盘用尽' | '短关';
  shortCloseReason?: string;
  remainingQtyAtClose?: number;
  supplementForShortClose?: boolean;
  supplementDecisionCode?: string;
  scheduleIdempotencyKey?: string;
  startIdempotencyKey?: string;
};

export type Production2WipBatch = {
  code: string;
  executionCardCode: string;
  workOrderCode: string;
  releaseBatchCode?: string;
  sourceReportCode: string;
  productCode?: string;
  productName: string;
  netWeightKg: number;
  qualifiedWeightKg: number;
  usedWeightKg?: number;
  lossWeightKg?: number;
  outputWeightKg?: number;
  consumedWeightKg: number;
  availableWeightKg: number;
  unit: 'kg';
  line: string;
  equipment?: string;
  operator: string;
  shift: string;
  status: '待检' | '合格' | '不合格' | '部分使用' | '已用尽';
  qualityTaskCode?: string;
  producedAt: string;
};

export type Production2BatchLineageRecord = {
  code: string;
  executionCardCode: string;
  workOrderCode: string;
  sourceWipBatchCode: string;
  outputRollCode: string;
  outputQty: number;
  netWeightKg: number;
  reportCode: string;
  createdAt: string;
};

export type Production2ExecutionEvent = {
  code: string;
  executionCardCode: string;
  workOrderCode: string;
  releaseBatchCode: string;
  action: '暂停' | '恢复';
  actor: string;
  reason: string;
  idempotencyKey: string;
  createdAt: string;
};

export type Production2QualityCheckpointResult = {
  name: string;
  standard: string;
  actual: string;
  result: '待检验' | '合格' | '不合格' | '历史未逐项记录';
  note?: string;
};

export type Production2QualityTask = {
  code: string;
  sourceCard: string;
  workOrderCode: string;
  kind: '来料质检' | '开机首检' | '半成品质检' | '报工全检' | '入库抽检';
  node: ProductionNode | '来料质检';
  productName: string;
  line: string;
  supplier?: string;
  warehouse?: string;
  materialBatch?: string;
  sampleQty: string;
  quantity?: number;
  unit?: string;
  productCode?: string;
  releaseBatchCode?: string;
  sourceReportCode?: string;
  sourceWipBatchCode?: string;
  sourceRequirements?: Array<{
    taskCode: string;
    sourceDocument?: string;
    supplementaryRequirement?: string;
    taskNote?: string;
  }>;
  workOrderNote?: string;
  qualityStandardCode?: string;
  qualityStandardName?: string;
  standardVersionId?: string;
  qualityStandardSnapshot?: {
    code: string;
    familyCode?: string;
    version?: number;
    name: string;
    inspectionType: string;
    sampleRule?: string;
    acceptance?: string;
    checkpointRules: Array<{ name: string; requirement: string }>;
    frozenAt?: string;
  };
  inspector: string;
  status: '待检' | '检验中' | '合格' | '部分合格' | '不合格' | '待处置';
  dueTime: string;
  checkpoints: string[];
  checkpointResults?: Production2QualityCheckpointResult[];
  result: string;
  disposition: string;
  conclusion?: string;
  acceptedQty?: number;
  rejectedQty?: number;
  sampleDefectQty?: number;
  disposedQty?: number;
  remainingDispositionQty?: number;
  inProcessDispositionQty?: number;
  unassignedDispositionQty?: number;
  reworkAcceptedQty?: number;
  concessionQty?: number;
  scrappedQty?: number;
  dispositionStatus?: '待判定' | '无需处置' | '待处置' | '返工中' | '待复检' | '已完成';
  version?: number;
  createdAt?: string;
  decidedAt?: string;
};

export type Production2QualityStandard = {
  code: string;
  name: string;
  scope: string;
  inspectionType: '来料质检' | '开机首检' | '半成品质检' | '报工全检' | '入库抽检';
  appliesTo: string;
  sampleRule: string;
  checkpoints: string[];
  acceptance: string;
  owner: string;
  status: '启用' | '草稿' | '停用';
  updatedAt: string;
};

export type Production2RecipeMaterial = {
  materialCode: string;
  materialName: string;
  usageMode?: 'percent' | 'fixed';
  percent: number;
  perUnitQty?: number;
  unit: string;
  incomingQcRequired: boolean;
};

export type Production2RecipeEstimatedLoss = {
  materialCode: string;
  materialName: string;
  fixedLossQty: number;
  lossRatePercent: number;
  unit: string;
};

export type Production2Recipe = {
  code: string;
  name: string;
  productCode: string;
  productName: string;
  version: string;
  productUnitWeightKg: number;
  outputUnit: string;
  status: '启用' | '草稿' | '停用';
  revision: number;
  materials: Production2RecipeMaterial[];
  estimatedLosses: Production2RecipeEstimatedLoss[];
  note?: string;
  owner: string;
  updatedAt: string;
};

export type Production2ProcessStepActionType =
  | 'warehouseIssue'
  | 'startupConfirm'
  | 'startupInspection'
  | 'semiFinishedReport'
  | 'reportInspection'
  | 'finishedReport'
  | 'packagingConfirm'
  | 'inboundInspection'
  | 'warehouseInbound';

export type Production2ProcessStepAction = {
  type: Production2ProcessStepActionType;
  label: string;
  actor: '仓库' | '生产' | '质检' | '系统';
  triggerTiming: string;
  generatedTask: string;
  buttonLabel?: string;
  qualityStandard?: string;
  completionEvent: string;
  blocking: boolean;
  abnormalEvent: string;
};

export type Production2ProcessStep = {
  code: string;
  sequence: number;
  name: string;
  node: ProductionNode | '配置步骤' | '工艺展示';
  stepType: '备料' | '预处理' | '开机' | '加工' | '质检' | '包装' | '入库';
  executionMode: '生产动作' | '质检动作' | '仓库动作' | '工艺展示';
  actionCodes: string[];
  coreEquipment?: string;
  description: string;
  triggerCondition?: string;
  inputRule?: string;
  outputRule?: string;
  batchRule?: string;
  requiredFields?: string[];
  defaultAction: string;
  qualityTrigger?: string;
  warehouseAction?: string;
  passAction?: string;
  failAction?: string;
  autoAdvance?: '动作完成后自动推进' | '人工确认后推进' | '仅提示不阻断';
  workInstruction?: string;
  completionRule?: string;
  abnormalRule?: string;
  actions?: Production2ProcessStepAction[];
  owner: string;
  updatedAt?: string;
  status: '启用' | '停用';
};

export type Production2SystemAction = {
  sequence: number;
  code: string;
  name: string;
  ownerDomain: '生产' | '质检' | '仓库' | '系统';
  executionMode: '人工操作' | '事件自动触发';
  completionMode: '提交成功即完成' | '等待后续完成';
  trigger: string;
  entryLabel?: string;
  result: string;
  blockingPolicy: '不阻断' | '完成前阻断' | '失败时阻断';
  repeatPolicy: '单次' | '按批次重复' | '按报工重复' | '全程可用';
  requiredInputs: string[];
  emittedEvents: string[];
  completionSignal: string;
  idempotencyScope: string;
  failureRule: string;
  status: '启用' | '停用';
};

export type Production2ProcessTemplate = {
  code: string;
  name: string;
  routeType?: '直接收卷' | '大盘复绕';
  productFamily: string;
  lineTypes: string[];
  version: string;
  status: '启用' | '草稿' | '停用';
  stepCodes: string[];
  stepInstructions?: Array<Record<string, unknown>>;
  temperatureTolerance?: string;
  temperatureZones: Array<{ name: string; value: string; tolerance: string }>;
  owner: string;
  updatedAt: string;
};

export type Production2Exception = {
  code: string;
  type: '缺料' | '质检不合格' | '设备异常' | '工艺异常' | '报工差异' | '其他异常';
  source: string;
  relatedWorkOrder?: string;
  relatedBatch?: string;
  line: string;
  level: '一般' | '紧急';
  status: '待处理' | '处理中' | '待复核' | '已关闭';
  owner: string;
  responsibility: string;
  createdAt: string;
  effect: string;
  affectedQty: number;
  unit?: string;
  estimatedLoss: string;
  cause: string;
  disposition: string;
  nextAction: string;
  executionCardCode?: string;
  releaseBatchCode?: string;
  outcome?: '继续生产' | '异常停机';
  resolution?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  revision?: number;
};

export type Production2ShiftHandover = {
  code: string;
  fromShiftCode: string;
  fromShiftName: string;
  fromLeader: string;
  fromMembers: string[];
  note: string;
  status: '待接班' | '已接班';
  activeCards: Array<{
    executionCardCode: string;
    workOrderCode: string;
    releaseBatchCode: string;
    line: string;
    node: string;
    status: string;
    leader: string;
    revisionAtHandover: number;
    operationJobCode?: string;
    operationType?: string;
    operationStatus?: string;
    sourceWipBatchCode?: string;
    nextAction?: string;
  }>;
  reportSummary?: {
    count?: number;
    good?: number;
    defect?: number;
    unitTotals?: Array<{ unit: string; good: number; defect: number }>;
  };
  exceptionCount?: number;
  endedAt: string;
  revision: number;
  toShiftCode?: string;
  toShiftName?: string;
  toLeader?: string;
  toMembers?: string[];
  receivedAt?: string;
};

export type Production2LossRecord = {
  code: string;
  sourceType: '生产报工' | '质检判定' | '异常事件' | '复绕损耗' | '包装损耗' | '工艺正常损耗';
  sourceDoc: string;
  sourceEvidenceCode?: string;
  workOrderCode: string;
  productionBatchCode: string;
  productCode: string;
  productName: string;
  processStep: string;
  line: string;
  equipment: string;
  shift: string;
  operator: string;
  leader: string;
  responsiblePerson: string;
  responsibilityDept: string;
  lossKg: number;
  plannedLossKg: number;
  abnormalLossKg: number;
  unclassifiedLossKg: number;
  reason: string;
  disposition: string;
  status: '待确认' | '已确认' | '待复核' | '已关闭';
  occurredAt: string;
  nextAction: string;
};

export const production2PageTitles: Record<Production2PageKey, string> = {
  workbench: '生产工作台',
  tasks: '生产任务',
  'material-requests': '备料申请',
  'work-orders': '生产工单',
  'execution-cards': '生产批次',
  'quality-standards': '质检与标准',
  quality: '质检任务',
  recipes: '生产配方',
  'process-templates': '生产工艺',
  'process-steps': '系统动作',
  'loss-ledger': '损耗台账',
  exceptions: '生产异常',
};

export const production2Recipes: Production2Recipe[] = [
  {
    code: 'BOM-PLA-175-MBK-V1',
    name: 'PLA 哑光黑 1kg 标准配方',
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    version: 'v1',
    productUnitWeightKg: 1,
    outputUnit: '卷',
    status: '启用',
    revision: 1,
    owner: '工艺工程',
    updatedAt: '2026-07-01',
    materials: [
      { materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', usageMode: 'percent', percent: 96, unit: 'kg', incomingQcRequired: true },
      { materialCode: 'M-CM-MATTE-BLK', materialName: '哑光黑色母', usageMode: 'percent', percent: 4, unit: 'kg', incomingQcRequired: true },
      { materialCode: 'M-PKG-SPOOL-1KG', materialName: '小盘线轴 1kg', usageMode: 'fixed', percent: 0, perUnitQty: 1, unit: '个', incomingQcRequired: true },
    ],
    estimatedLosses: [
      { materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', fixedLossQty: 0, lossRatePercent: 2, unit: 'kg' },
      { materialCode: 'M-CM-MATTE-BLK', materialName: '哑光黑色母', fixedLossQty: 0, lossRatePercent: 2, unit: 'kg' },
      { materialCode: 'M-PKG-SPOOL-1KG', materialName: '小盘线轴 1kg', fixedLossQty: 0, lossRatePercent: 0.5, unit: '个' },
    ],
  },
  {
    code: 'BOM-PETG-175-CLR-V1',
    name: 'PETG 透明 1kg 标准配方',
    productCode: 'M-FG-PETG-175-CLR',
    productName: 'PETG 1.75mm 透明耗材 1kg',
    version: 'v1',
    productUnitWeightKg: 1,
    outputUnit: '卷',
    status: '启用',
    revision: 1,
    owner: '周宁',
    updatedAt: '2026-06-30',
    materials: [
      { materialCode: 'M-RM-PETG-VIRGIN', materialName: 'PETG 原生粒子', usageMode: 'percent', percent: 99, unit: 'kg', incomingQcRequired: true },
      { materialCode: 'M-AM-CLEAR-ENH', materialName: '透明增强助剂', usageMode: 'percent', percent: 1, unit: 'kg', incomingQcRequired: true },
      { materialCode: 'M-PKG-SPOOL-1KG', materialName: '小盘线轴 1kg', usageMode: 'fixed', percent: 0, perUnitQty: 1, unit: '个', incomingQcRequired: true },
    ],
    estimatedLosses: [
      { materialCode: 'M-RM-PETG-VIRGIN', materialName: 'PETG 原生粒子', fixedLossQty: 0, lossRatePercent: 2, unit: 'kg' },
      { materialCode: 'M-AM-CLEAR-ENH', materialName: '透明增强助剂', fixedLossQty: 0, lossRatePercent: 2, unit: 'kg' },
      { materialCode: 'M-PKG-SPOOL-1KG', materialName: '小盘线轴 1kg', fixedLossQty: 0, lossRatePercent: 0.5, unit: '个' },
    ],
  },
  {
    code: 'BOM-PLA-175-WHT-V1',
    name: 'PLA 珍珠白 1kg 标准配方',
    productCode: 'M-FG-PLA-175-WHT',
    productName: 'PLA 1.75mm 珍珠白耗材 1kg',
    version: 'v1',
    productUnitWeightKg: 1,
    outputUnit: '卷',
    status: '启用',
    revision: 1,
    owner: '赵敏',
    updatedAt: '2026-06-29',
    materials: [
      { materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', usageMode: 'percent', percent: 97, unit: 'kg', incomingQcRequired: true },
      { materialCode: 'M-CM-PEARL-WHT', materialName: '珍珠白色母', usageMode: 'percent', percent: 3, unit: 'kg', incomingQcRequired: true },
      { materialCode: 'M-PKG-SPOOL-1KG', materialName: '小盘线轴 1kg', usageMode: 'fixed', percent: 0, perUnitQty: 1, unit: '个', incomingQcRequired: true },
    ],
    estimatedLosses: [
      { materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', fixedLossQty: 0, lossRatePercent: 2, unit: 'kg' },
      { materialCode: 'M-CM-PEARL-WHT', materialName: '珍珠白色母', fixedLossQty: 0, lossRatePercent: 2, unit: 'kg' },
      { materialCode: 'M-PKG-SPOOL-1KG', materialName: '小盘线轴 1kg', fixedLossQty: 0, lossRatePercent: 0.5, unit: '个' },
    ],
  },
];

export const production2SystemActions = productionSystemActionCatalog.actions as Production2SystemAction[];

export const production2ProcessSteps = productionProcessStageCatalog.stages.map((stage) => {
  const boundActions = stage.actionCodes
    .map((code) => production2SystemActions.find((action) => action.code === code))
    .filter(Boolean);
  return {
    ...stage,
    description: stage.workInstruction,
    defaultAction: boundActions[0]?.entryLabel || boundActions[0]?.name || '按阶段要求执行',
    passAction: stage.completionRule,
    failAction: stage.abnormalRule,
  };
}) as unknown as Production2ProcessStep[];
export const production2ProcessTemplates: Production2ProcessTemplate[] = [
  {
    code: 'PRC2-WIRE-DRAWING-REWIND-V1',
    name: '拉丝大盘复绕标准工艺',
    routeType: '大盘复绕',
    productFamily: '拉丝复绕类成品',
    lineTypes: ['拉丝机', '复绕机'],
    version: 'v1',
    status: '启用',
    stepCodes: [
      'P2-STEP-MATERIAL-ISSUE',
      'P2-STEP-STARTUP',
      'P2-STEP-FIRST-INSPECTION',
      'P2-STEP-WIP-REPORT-LARGE-REEL',
      'P2-STEP-WIP-QC',
      'P2-STEP-FINISHED-REPORT-SMALL-REEL',
      'P2-STEP-FINISHED-QC',
      'P2-STEP-PACKAGING',
      'P2-STEP-INBOUND-SAMPLING',
      'P2-STEP-FINISHED-INBOUND',
    ],
    temperatureTolerance: '按工艺卡',
    temperatureZones: [
      { name: '水槽', value: '60', tolerance: '按工艺卡' },
      { name: '10区', value: '200', tolerance: '按工艺卡' },
      { name: '9区', value: '210', tolerance: '按工艺卡' },
      { name: '4区', value: '200', tolerance: '按工艺卡' },
      { name: '3区', value: '195', tolerance: '按工艺卡' },
      { name: '2区', value: '190', tolerance: '按工艺卡' },
      { name: '1区', value: '185', tolerance: '按工艺卡' },
      { name: '13区', value: '210', tolerance: '按工艺卡' },
      { name: '12区', value: '200', tolerance: '按工艺卡' },
      { name: '11区', value: '210', tolerance: '按工艺卡' },
      { name: '8区', value: '200', tolerance: '按工艺卡' },
      { name: '7区', value: '195', tolerance: '按工艺卡' },
      { name: '6区', value: '190', tolerance: '按工艺卡' },
      { name: '5区', value: '185', tolerance: '按工艺卡' },
    ],
    owner: '工艺工程',
    updatedAt: '2026-07-08',
  },
  {
    code: 'PRC2-EXTRUSION-V1',
    name: '挤出成品标准工艺',
    routeType: '直接收卷',
    productFamily: '挤出类成品',
    lineTypes: ['挤出 A 线', '挤出 B 线'],
    version: 'v1',
    status: '启用',
    stepCodes: [
      'P2-STEP-MATERIAL-ISSUE',
      'P2-STEP-STARTUP',
      'P2-STEP-FIRST-INSPECTION',
      'P2-STEP-FINISHED-REPORT-SMALL-REEL',
      'P2-STEP-FINISHED-QC',
      'P2-STEP-PACKAGING',
      'P2-STEP-INBOUND-SAMPLING',
      'P2-STEP-FINISHED-INBOUND',
    ],
    temperatureTolerance: '±5℃',
    temperatureZones: [
      { name: '水槽', value: '60', tolerance: '±5℃' },
      { name: '10区', value: '200', tolerance: '±5℃' },
      { name: '9区', value: '210', tolerance: '±5℃' },
      { name: '4区', value: '200', tolerance: '±5℃' },
      { name: '3区', value: '195', tolerance: '±5℃' },
      { name: '2区', value: '190', tolerance: '±5℃' },
      { name: '1区', value: '185', tolerance: '±5℃' },
      { name: '13区', value: '210', tolerance: '±5℃' },
      { name: '12区', value: '200', tolerance: '±5℃' },
      { name: '11区', value: '210', tolerance: '±5℃' },
      { name: '8区', value: '200', tolerance: '±5℃' },
      { name: '7区', value: '195', tolerance: '±5℃' },
      { name: '6区', value: '190', tolerance: '±5℃' },
      { name: '5区', value: '185', tolerance: '±5℃' },
    ],
    owner: '工艺工程',
    updatedAt: '2026-07-01',
  },
  {
    code: 'PRC2-PETG-EXTRUSION-V1',
    name: 'PETG 透明耗材挤出工艺',
    routeType: '直接收卷',
    productFamily: 'PETG 挤出耗材',
    lineTypes: ['挤出 A 线', '挤出 B 线'],
    version: 'v1',
    status: '启用',
    stepCodes: [
      'P2-STEP-MATERIAL-ISSUE',
      'P2-STEP-STARTUP',
      'P2-STEP-FIRST-INSPECTION',
      'P2-STEP-FINISHED-REPORT-SMALL-REEL',
      'P2-STEP-FINISHED-QC',
      'P2-STEP-PACKAGING',
      'P2-STEP-INBOUND-SAMPLING',
      'P2-STEP-FINISHED-INBOUND',
    ],
    temperatureTolerance: '±5℃',
    temperatureZones: [
      { name: '水槽', value: '50', tolerance: '±5℃' },
      { name: '10区', value: '235', tolerance: '±5℃' },
      { name: '9区', value: '240', tolerance: '±5℃' },
      { name: '4区', value: '245', tolerance: '±5℃' },
      { name: '3区', value: '240', tolerance: '±5℃' },
      { name: '2区', value: '235', tolerance: '±5℃' },
      { name: '1区', value: '225', tolerance: '±5℃' },
      { name: '13区', value: '245', tolerance: '±5℃' },
      { name: '12区', value: '245', tolerance: '±5℃' },
      { name: '11区', value: '245', tolerance: '±5℃' },
      { name: '8区', value: '245', tolerance: '±5℃' },
      { name: '7区', value: '240', tolerance: '±5℃' },
      { name: '6区', value: '235', tolerance: '±5℃' },
      { name: '5区', value: '225', tolerance: '±5℃' },
    ],
    owner: '工艺工程',
    updatedAt: '2026-06-30',
  },
];

export const production2Tasks: Production2Task[] = [
  {
    code: 'PT2-260701-001',
    source: '安全库存补货',
    createdAt: '2026-07-01 09:10',
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    demandQty: 118,
    finishedStockQty: 2,
    productionQty: 118,
    unit: '卷',
    deliveryDate: '2026-07-04',
    priority: '加急',
    status: '已建单',
    recipeCode: 'BOM-PLA-175-MBK-V1',
    owner: '李四',
    nextAction: '跟踪 MO2-260701-001 的待检批次和剩余入库',
    materialNeeds: [
      { materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', perUnitQty: 0.96, estimatedQty: 113.3, availableQty: 280, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
      { materialCode: 'M-CM-MATTE-BLK', materialName: '哑光黑色母', perUnitQty: 0.04, estimatedQty: 4.7, availableQty: 42, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
      { materialCode: 'M-PKG-SPOOL-1KG', materialName: '小盘线轴 1kg', perUnitQty: 1, estimatedQty: 118, availableQty: 460, shortageQty: 0, unit: '个', incomingQcRequired: false, status: '充足' },
    ],
  },
  {
    code: 'PT2-260715-006',
    source: 'SO-20260715-022',
    sourceLineId: 'L1',
    createdAt: '2026-07-15 09:42',
    productCode: 'M-FG-PETG-175-CLR',
    productName: 'PETG 1.75mm 透明耗材 1kg',
    demandQty: 300,
    finishedStockQty: 120,
    productionQty: 180,
    unit: '卷',
    deliveryDate: '2026-07-26',
    priority: '正常',
    status: '已建单',
    recipeCode: 'BOM-PETG-175-CLR-V1',
    owner: '周敏',
    nextAction: 'PETG 原生粒子完成仓库入库后再安排生产',
    materialNeeds: [
      { materialCode: 'M-RM-PETG-VIRGIN', materialName: 'PETG 原生粒子', perUnitQty: 0.99, estimatedQty: 178.2, availableQty: 0, shortageQty: 178.2, unit: 'kg', incomingQcRequired: true, status: '待仓库入库' },
      { materialCode: 'M-AM-CLEAR-ENH', materialName: '透明增强助剂', perUnitQty: 0.01, estimatedQty: 1.8, availableQty: 18, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '充足' },
      { materialCode: 'M-PKG-SPOOL-1KG', materialName: '小盘线轴 1kg', perUnitQty: 1, estimatedQty: 180, availableQty: 460, shortageQty: 0, unit: '个', incomingQcRequired: false, status: '充足' },
    ],
  },
  {
    code: 'PT2-260701-003',
    source: '安全库存补货',
    createdAt: '2026-06-30 14:40',
    productCode: 'M-FG-PLA-175-WHT',
    productName: 'PLA 1.75mm 珍珠白耗材 1kg',
    demandQty: 240,
    finishedStockQty: 0,
    productionQty: 240,
    unit: '卷',
    deliveryDate: '2026-07-03',
    priority: '加急',
    status: '待建工单',
    recipeCode: 'BOM-PLA-175-WHT-V1',
    owner: '李四',
    nextAction: '创建生产工单，可先建计划工单',
    materialNeeds: [
      { materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', perUnitQty: 0.97, estimatedQty: 232.8, availableQty: 280, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '充足' },
      { materialCode: 'M-CM-PEARL-WHT', materialName: '珍珠白色母', perUnitQty: 0.03, estimatedQty: 7.2, availableQty: 0, shortageQty: 7.2, unit: 'kg', incomingQcRequired: true, status: '待采购' },
      { materialCode: 'M-PKG-SPOOL-1KG', materialName: '小盘线轴 1kg', perUnitQty: 1, estimatedQty: 240, availableQty: 460, shortageQty: 0, unit: '个', incomingQcRequired: false, status: '充足' },
    ],
  },
  {
    code: 'PT2-260723-101',
    source: '排产功能测试',
    createdAt: '2026-07-23 09:00',
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    demandQty: 60,
    finishedStockQty: 0,
    productionQty: 60,
    unit: '卷',
    deliveryDate: '2026-07-28',
    priority: '正常',
    status: '已建单',
    recipeCode: 'BOM-PLA-175-MBK-V1',
    owner: '李四',
    nextAction: '在生产工作台选择挤出 A 线并加入排产队列',
    materialNeeds: [
      { materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', perUnitQty: 0.96, estimatedQty: 57.6, availableQty: 9480, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
      { materialCode: 'M-CM-MATTE-BLK', materialName: '哑光黑色母', perUnitQty: 0.04, estimatedQty: 2.4, availableQty: 300, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
    ],
  },
  {
    code: 'PT2-260723-102',
    source: '队列与顺序测试',
    createdAt: '2026-07-23 09:10',
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    demandQty: 48,
    finishedStockQty: 0,
    productionQty: 48,
    unit: '卷',
    deliveryDate: '2026-07-27',
    priority: '加急',
    status: '已建单',
    recipeCode: 'BOM-PLA-175-MBK-V1',
    owner: '周敏',
    nextAction: '已有 24 卷进入挤出 B1 线队列，剩余 24 卷可继续排产',
    materialNeeds: [
      { materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', perUnitQty: 0.96, estimatedQty: 46.08, availableQty: 9480, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
      { materialCode: 'M-CM-MATTE-BLK', materialName: '哑光黑色母', perUnitQty: 0.04, estimatedQty: 1.92, availableQty: 300, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
    ],
  },
];

export const production2MaterialRequests: Production2MaterialRequest[] = [
  {
    code: 'PMR2-260701-001',
    requestType: '任务缺口补料',
    sourceTaskCode: 'PT2-260701-003',
    sourceDocument: '安全库存补货',
    department: '生产管理部',
    requester: '张三',
    requestDate: '2026-07-01',
    expectedDate: '2026-07-03',
    status: '已转采购',
    linkedPurchaseRequisition: 'PR-20260716-003',
    note: '补齐珍珠白色母缺口，到料并完成来料质检后继续建工单。',
    nextAction: '采购跟进 PR-20260716-003 的珍珠白色母明细',
    lines: [
      {
        materialCode: 'M-CM-PEARL-WHT',
        materialName: '珍珠白色母',
        requestedQty: 7.2,
        availableQty: 0,
        purchaseQty: 7.2,
        unit: 'kg',
        purpose: '补齐生产任务缺口',
      },
    ],
  },
  {
    code: 'PMR2-260701-002',
    requestType: '临时备料',
    sourceTaskCode: '',
    sourceDocument: '',
    department: '生产管理部',
    requester: '赵云',
    requestDate: '2026-07-01',
    expectedDate: '2026-07-05',
    status: '库存可满足',
    linkedPurchaseRequisition: '',
    note: '珍珠白批次换线前补足真空包装袋，系统按可用库存评估缺口。',
    nextAction: '库存覆盖已确认；生产工单释放后由仓库执行领料',
    lines: [
      {
        materialCode: 'M-PKG-VAC-BAG-1KG',
        materialName: '真空包装袋 1kg',
        requestedQty: 300,
        availableQty: 300,
        purchaseQty: 0,
        unit: '个',
        purpose: '珍珠白批次换线前包装准备',
      },
    ],
  },
];

export const production2WorkOrders: Production2WorkOrder[] = [
  {
    code: 'MO2-260701-001',
    taskCode: 'PT2-260701-001',
    sourceLineId: 'PT2-260701-001-L1',
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    planQty: 118,
    completedQty: 107,
    inboundQty: 30,
    unit: '卷',
    plannedDate: '2026-07-01',
    dueDate: '2026-07-04',
    recipeCode: 'BOM-PLA-175-MBK-V1',
    processTemplateCode: 'PRC2-EXTRUSION-V1',
    status: '部分入库',
    currentNode: '待抽检',
    owner: '李四',
    note: '来源生产任务 PT2-260701-001。',
    documentStatus: 'submitted',
    revision: 1,
    nextAction: '生产批次 EC2-260701-002 抽检合格后申请入库',
    materialNeeds: [
      { materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', perUnitQty: 0.96, estimatedQty: 113.3, actualQty: 116, availableQty: 280, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
      { materialCode: 'M-CM-MATTE-BLK', materialName: '哑光黑色母', perUnitQty: 0.04, estimatedQty: 4.7, actualQty: 4.9, availableQty: 42, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
      { materialCode: 'M-PKG-SPOOL-1KG', materialName: '小盘线轴 1kg', perUnitQty: 1, estimatedQty: 118, actualQty: 118, availableQty: 460, shortageQty: 0, unit: '个', incomingQcRequired: false, status: '充足' },
    ],
    linePlans: [
      { line: '挤出 A1 线', lineType: '挤出 A 线', planQty: 70, issuedQty: 70, reportedQty: 70, packedQty: 30, inboundQty: 30, leader: '王敏', status: '待入库' },
      { line: '挤出 A2 线', lineType: '挤出 A 线', planQty: 48, issuedQty: 48, reportedQty: 40, packedQty: 39, inboundQty: 0, leader: '陈刚', status: '待入库' },
    ],
  },
  {
    code: 'MO2-260715-006',
    taskCode: 'PT2-260715-006',
    sourceDocument: 'SO-20260715-022',
    sourceLineId: 'L1',
    productCode: 'M-FG-PETG-175-CLR',
    productName: 'PETG 1.75mm 透明耗材 1kg',
    planQty: 180,
    completedQty: 0,
    inboundQty: 0,
    unit: '卷',
    plannedDate: '2026-07-15',
    dueDate: '2026-07-26',
    recipeCode: 'BOM-PETG-175-CLR-V1',
    processTemplateCode: 'PRC2-PETG-EXTRUSION-V1',
    status: '待释放',
    currentNode: '待释放',
    owner: '周敏',
    note: '来源销售订单 SO-20260715-022 第 L1 行，生产任务 PT2-260715-006 计划生产 180 卷。',
    documentStatus: 'submitted',
    revision: 1,
    nextAction: '等待 PETG 原生粒子完成仓库入库后再安排生产',
    materialNeeds: [
      { materialCode: 'M-RM-PETG-VIRGIN', materialName: 'PETG 原生粒子', perUnitQty: 0.99, estimatedQty: 178.2, actualQty: 178.2, availableQty: 0, shortageQty: 178.2, unit: 'kg', incomingQcRequired: true, status: '待仓库入库' },
      { materialCode: 'M-AM-CLEAR-ENH', materialName: '透明增强助剂', perUnitQty: 0.01, estimatedQty: 1.8, actualQty: 1.8, availableQty: 18, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '充足' },
      { materialCode: 'M-PKG-SPOOL-1KG', materialName: '小盘线轴 1kg', perUnitQty: 1, estimatedQty: 180, actualQty: 180, availableQty: 460, shortageQty: 0, unit: '个', incomingQcRequired: false, status: '充足' },
    ],
    linePlans: [
      { line: '挤出 B1 线', lineType: '挤出 B 线', planQty: 180, issuedQty: 0, reportedQty: 0, packedQty: 0, inboundQty: 0, leader: '刘倩', status: '待释放' },
    ],
  },
  {
    code: 'MO2-260723-101',
    taskCode: 'PT2-260723-101',
    sourceLineId: 'PT2-260723-101-L1',
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    planQty: 60,
    completedQty: 0,
    inboundQty: 0,
    unit: '卷',
    plannedDate: '2026-07-24',
    dueDate: '2026-07-28',
    recipeCode: 'BOM-PLA-175-MBK-V1',
    processTemplateCode: 'PRC2-EXTRUSION-V1',
    status: '待释放',
    currentNode: '待释放',
    owner: '李四',
    note: '排产功能测试：物料已备齐，可选择挤出 A1/A2 线加入队列。',
    documentStatus: 'submitted',
    revision: 1,
    nextAction: '在生产工作台安排产线、数量和顺序',
    materialNeeds: [
      { materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', perUnitQty: 0.96, estimatedQty: 57.6, actualQty: 0, availableQty: 9480, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
      { materialCode: 'M-CM-MATTE-BLK', materialName: '哑光黑色母', perUnitQty: 0.04, estimatedQty: 2.4, actualQty: 0, availableQty: 300, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
    ],
    linePlans: [
      { line: '挤出 A1 线', lineType: '挤出 A 线', planQty: 60, issuedQty: 0, reportedQty: 0, packedQty: 0, inboundQty: 0, leader: '王敏', status: '待释放' },
    ],
  },
  {
    code: 'MO2-260723-102',
    taskCode: 'PT2-260723-102',
    sourceLineId: 'PT2-260723-102-L1',
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    planQty: 48,
    completedQty: 0,
    inboundQty: 0,
    unit: '卷',
    plannedDate: '2026-07-23',
    dueDate: '2026-07-27',
    recipeCode: 'BOM-PLA-175-MBK-V1',
    processTemplateCode: 'PRC2-EXTRUSION-V1',
    status: '部分释放',
    currentNode: '待领料',
    owner: '周敏',
    note: '队列测试：24 卷已排入挤出 B1 线，剩余 24 卷仍可排产。',
    documentStatus: 'submitted',
    revision: 1,
    nextAction: '查看 B1 线队列，并继续安排剩余 24 卷',
    materialNeeds: [
      { materialCode: 'M-RM-PLA-VIRGIN', materialName: 'PLA 原生粒子', perUnitQty: 0.96, estimatedQty: 46.08, actualQty: 0, availableQty: 9480, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
      { materialCode: 'M-CM-MATTE-BLK', materialName: '哑光黑色母', perUnitQty: 0.04, estimatedQty: 1.92, actualQty: 0, availableQty: 300, shortageQty: 0, unit: 'kg', incomingQcRequired: true, status: '已齐套' },
    ],
    linePlans: [
      { line: '挤出 B1 线', lineType: '挤出 B 线', planQty: 48, issuedQty: 0, reportedQty: 0, packedQty: 0, inboundQty: 0, leader: '刘倩', status: '待领料' },
    ],
  },
];

// Release batches are the hand-off contract between planning, warehouse, shop floor,
// quality and finished-goods receiving. A work-order line may be released more than once.
export const production2ReleaseBatches: Production2ReleaseBatch[] = [
  {
    code: 'RB2-260701-001',
    workOrderCode: 'MO2-260701-001',
    taskCode: 'PT2-260701-001',
    sourceLineId: 'MO2-260701-001-L1',
    line: '挤出 A1 线',
    lineType: '挤出 A 线',
    shift: '白班',
    leader: '王敏',
    planQty: 70,
    releasedQty: 70,
    unit: '卷',
    releaseStatus: '已释放',
    materialStatus: '已领料',
    executionStatus: '已报工',
    qualityStatus: '已放行',
    inboundStatus: '部分入库',
    materialIssueCodes: ['WM2-260701-001'],
    executionCardCodes: ['EC2-260701-001'],
    qualityTaskCodes: [],
    productionReceiptCodes: ['WM2-260701-002', 'WM2-260701-003'],
    nextAction: '确认剩余 38 卷包装并触发入库抽检',
  },
  {
    code: 'RB2-260701-002',
    workOrderCode: 'MO2-260701-001',
    taskCode: 'PT2-260701-001',
    sourceLineId: 'MO2-260701-001-L2',
    line: '挤出 A2 线',
    lineType: '挤出 A 线',
    shift: '白班',
    leader: '陈刚',
    planQty: 40,
    releasedQty: 40,
    unit: '卷',
    releaseStatus: '已释放',
    materialStatus: '已领料',
    executionStatus: '已报工',
    qualityStatus: '待检',
    inboundStatus: '待放行',
    materialIssueCodes: ['WM2-260701-005'],
    executionCardCodes: ['EC2-260701-002'],
    qualityTaskCodes: ['QC2-260701-001'],
    productionReceiptCodes: [],
    nextAction: '完成入库抽检，合格后开放完工入库',
  },
  {
    code: 'RB2-260701-003',
    workOrderCode: 'MO2-260701-001',
    taskCode: 'PT2-260701-001',
    sourceLineId: 'MO2-260701-001-L2',
    line: '挤出 A2 线',
    lineType: '挤出 A 线',
    shift: '夜班',
    leader: '陈刚',
    planQty: 8,
    releasedQty: 8,
    unit: '卷',
    releaseStatus: '已释放',
    materialStatus: '已领料',
    executionStatus: '待开工',
    qualityStatus: '待检',
    inboundStatus: '未报工',
    materialIssueCodes: ['WM2-260701-006'],
    executionCardCodes: ['EC2-260701-003'],
    qualityTaskCodes: ['QC2-260701-002'],
    productionReceiptCodes: [],
    nextAction: '完成开机首检，放行后开始批量生产',
  },
  {
    code: 'RB2-260715-006',
    workOrderCode: 'MO2-260715-006',
    taskCode: 'PT2-260715-006',
    sourceLineId: 'L1',
    line: '挤出 B1 线',
    lineType: '挤出 B 线',
    shift: '待排班',
    leader: '刘倩',
    planQty: 180,
    releasedQty: 0,
    unit: '卷',
    releaseStatus: '待释放',
    materialStatus: '有缺料',
    executionStatus: '待开工',
    qualityStatus: '未触发',
    inboundStatus: '未报工',
    materialIssueCodes: [],
    executionCardCodes: [],
    qualityTaskCodes: [],
    productionReceiptCodes: [],
    nextAction: '等待 PETG 原生粒子完成仓库入库并重新检查备料情况',
  },
  {
    code: 'RB2-20260723-001',
    workOrderCode: 'MO2-260723-102',
    taskCode: 'PT2-260723-102',
    sourceLineId: 'PT2-260723-102-L1',
    line: '挤出 B1 线',
    lineType: '挤出 B 线',
    shift: '白班',
    leader: '刘倩',
    planQty: 24,
    releasedQty: 24,
    unit: '卷',
    releaseStatus: '已释放',
    materialStatus: '待领料',
    executionStatus: '待开工',
    qualityStatus: '未触发',
    inboundStatus: '未报工',
    materialIssueCodes: [],
    executionCardCodes: [],
    qualityTaskCodes: [],
    productionReceiptCodes: [],
    nextAction: '仓库按生产安排办理生产领料',
  },
];

export const production2ExecutionCards: Production2ExecutionCard[] = [
  {
    code: 'EC2-260701-001',
    workOrderCode: 'MO2-260701-001',
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    line: '挤出 A1 线',
    lineType: '挤出 A 线',
    shift: '白班',
    leader: '王敏',
    operator: '赵强',
    planQty: 70,
    issuedQty: 70,
    reportedQty: 70,
    qualifiedQty: 68,
    packedQty: 30,
    inboundQty: 30,
    defectQty: 2,
    unit: '卷',
    node: '待包装',
    status: '进行中',
    nextAction: '确认剩余 38 卷包装并触发入库抽检',
    processTemplateCode: 'PRC2-EXTRUSION-V1',
  },
  {
    code: 'EC2-260701-002',
    workOrderCode: 'MO2-260701-001',
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    line: '挤出 A2 线',
    lineType: '挤出 A 线',
    shift: '白班',
    leader: '陈刚',
    operator: '李娜',
    planQty: 40,
    issuedQty: 40,
    reportedQty: 40,
    qualifiedQty: 39,
    packedQty: 39,
    inboundQty: 0,
    defectQty: 1,
    unit: '卷',
    node: '待抽检',
    status: '待质检',
    nextAction: '抽检合格后等待入库',
    processTemplateCode: 'PRC2-EXTRUSION-V1',
  },
  {
    code: 'EC2-260701-003',
    workOrderCode: 'MO2-260701-001',
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    line: '挤出 A2 线',
    lineType: '挤出 A 线',
    shift: '晚班',
    leader: '陈刚',
    operator: '未接班',
    planQty: 8,
    issuedQty: 8,
    reportedQty: 0,
    packedQty: 0,
    inboundQty: 0,
    defectQty: 0,
    unit: '卷',
    node: '待首件',
    status: '待处理',
    nextAction: '晚班开机后提交首件质检',
    processTemplateCode: 'PRC2-EXTRUSION-V1',
  },
];

export const production2QualityTasks: Production2QualityTask[] = [
  {
    code: 'IQC2-260701-001',
    sourceCard: 'WR-20260701-001',
    workOrderCode: '',
    kind: '来料质检',
    node: '来料质检',
    productName: 'PETG 原生粒子',
    line: '采购暂存区',
    supplier: '浙江华塑新材',
    warehouse: '采购暂存区',
    materialBatch: 'PETG-RM-2026070101',
    quantity: 125,
    unit: 'kg',
    sampleQty: '5 袋',
    inspector: '孙悦',
    status: '待检',
    createdAt: '2026-07-01 10:15',
    dueTime: '2026-07-01 14:30',
    checkpoints: ['颗粒外观', '批次标签', '含水率', '熔指记录'],
    result: '未开始',
    disposition: '合格后转待入库，由仓库确认入库',
  },
  {
    code: 'QC2-260701-001',
    sourceCard: 'EC2-260701-002',
    workOrderCode: 'MO2-260701-001',
    kind: '入库抽检',
    node: '待抽检',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    line: '挤出 A2 线',
    sampleQty: '4 卷',
    quantity: 39,
    unit: '卷',
    inspector: '孙悦',
    status: '待检',
    createdAt: '2026-07-20 15:45',
    dueTime: '2026-07-20 16:30',
    checkpoints: ['线径', '净重', '绕线', '包装标签', '批次一致'],
    result: '未开始',
    disposition: '合格后申请入库',
  },
  {
    code: 'QC2-260701-002',
    sourceCard: 'EC2-260701-003',
    workOrderCode: 'MO2-260701-001',
    kind: '开机首检',
    node: '待首检',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    line: '挤出 A2 线',
    sampleQty: '1 组',
    quantity: 8,
    unit: '卷',
    inspector: '孙悦',
    status: '待检',
    createdAt: '2026-07-20 19:30',
    dueTime: '2026-07-20 20:00',
    checkpoints: ['刚挤出线材外观', '温区参数', '线径', '哑光效果'],
    result: '未开始',
    disposition: '首件合格后继续生产',
  },
  {
    code: 'QC2-260630-003',
    sourceCard: 'EC2-260630-006',
    workOrderCode: 'MO2-260630-004',
    kind: '报工全检',
    node: '待过程检',
    productName: 'PLA 1.75mm 珍珠白耗材 1kg',
    line: '复绕 R1 线',
    sampleQty: '8 卷',
    inspector: '赵敏',
    status: '部分合格',
    dueTime: '2026-06-30 15:00',
    checkpoints: ['净重', '线径', '绕线', '色差', '外观'],
    result: '1 卷绕线偏松',
    disposition: '返工已完成，等待复检 PRI2-20260720-001',
    rejectedQty: 1,
    remainingDispositionQty: 1,
    inProcessDispositionQty: 1,
    unassignedDispositionQty: 0,
    dispositionStatus: '待复检',
  },
];

export const production2QualityStandards: Production2QualityStandard[] = [
  {
    code: 'QSTD2-IQC-RM-V1',
    name: '来料质检通用标准',
    scope: '原料/外购件',
    inspectionType: '来料质检',
    appliesTo: '需质检物料',
    sampleRule: '按批次抽样，关键件全检',
    checkpoints: ['供应商批次', '颗粒外观', '含水率', '熔指或色差'],
    acceptance: '关键项全部合格后放行入库或领料',
    owner: '质量部',
    status: '启用',
    updatedAt: '2026-07-01',
  },
  {
    code: 'QSTD2-FIRST-EXTRUSION-V1',
    name: '挤出开机首检标准',
    scope: '挤出类成品',
    inspectionType: '开机首检',
    appliesTo: '挤出 A/B 线',
    sampleRule: '每次开机取首段样 1 组',
    checkpoints: ['刚挤出外观', '颜色或透明度', '线径', '温区参数'],
    acceptance: '首件合格后才能批量生产',
    owner: '质量部',
    status: '启用',
    updatedAt: '2026-07-01',
  },
  {
    code: 'QSTD2-WIP-LARGE-REEL-V1',
    name: '大盘半成品质检标准',
    scope: '拉丝大盘',
    inspectionType: '半成品质检',
    appliesTo: '大盘复绕路线',
    sampleRule: '每个大盘独立检验并独立放行',
    checkpoints: ['大盘编号', '净重', '线径', '颜色与外观', '收卷状态'],
    acceptance: '合格大盘才可用于复绕成小盘',
    owner: '质量部',
    status: '启用',
    updatedAt: '2026-07-19',
  },
  {
    code: 'QSTD2-REPORT-FULL-V1',
    name: '报工批次全检标准',
    scope: '报工批次',
    inspectionType: '报工全检',
    appliesTo: '报工后待过程检批次',
    sampleRule: '报工数量全检或按工艺指定全检项',
    checkpoints: ['线径', '净重', '绕线', '外观', '不良隔离'],
    acceptance: '全检合格数量才可进入打包',
    owner: '质量部',
    status: '启用',
    updatedAt: '2026-07-01',
  },
  {
    code: 'QSTD2-INBOUND-SAMPLE-V1',
    name: '入库前抽检标准',
    scope: '包装完成批次',
    inspectionType: '入库抽检',
    appliesTo: '待入库成品',
    sampleRule: '每个包装批次抽检约 10%，至少 2 卷、最多 12 卷；异常时扩大抽检',
    checkpoints: ['线径', '净重', '绕线', '包装标签', '批次一致'],
    acceptance: '抽检合格后允许申请成品入库',
    owner: '质量部',
    status: '启用',
    updatedAt: '2026-07-01',
  },
];

export const production2LossRecords: Production2LossRecord[] = [
];

export const production2Exceptions: Production2Exception[] = [
  {
    code: 'EX2-260701-001',
    type: '缺料',
    source: 'PT2-260701-003',
    relatedWorkOrder: '',
    relatedBatch: '',
    line: '复绕 R1 线',
    level: '紧急',
    status: '处理中',
    owner: '李四',
    responsibility: '采购/仓库/生产计划',
    createdAt: '2026-07-01 10:15',
    effect: '计划工单可建立，缺料时暂不能安排生产和现场开工',
    affectedQty: 240,
    unit: '卷',
    estimatedLoss: '影响 240 卷交付，暂未形成报废损失',
    cause: '珍珠白色母库存不足，需要采购到料并完成来料质检。',
    disposition: '补采购并跟踪来料质检',
    nextAction: '跟踪 PR-20260716-003 到料与来料质检，放行后再安排生产',
  },
  {
    code: 'EX2-260701-002',
    type: '质检不合格',
    source: 'QC2-260630-003',
    relatedWorkOrder: 'MO2-260630-004',
    relatedBatch: 'EC2-260630-006',
    line: '复绕 R1 线',
    level: '一般',
    status: '处理中',
    owner: '赵敏',
    responsibility: '工艺工程 / 复绕 R1 线',
    createdAt: '2026-07-01 09:40',
    effect: '处置完成前阻断包装',
    affectedQty: 1,
    unit: '卷',
    estimatedLoss: '隔离 1 卷，损失待处置确认',
    cause: '绕线张力波动，1 卷排线偏松。',
    disposition: '返工已完成，等待复检 PRI2-20260720-001',
    nextAction: '完成返工复检 PRI2-20260720-001 · 1 卷',
  },
];
