import { production2ExecutionCards, production2QualityTasks, production2WorkOrders } from './production2';
import {
  ApiError,
  apiBase,
  clearStoredSessionToken,
  getStoredSessionToken,
  sessionExpiredEventName,
} from '../services/api';
import type { PurchaseReceipt, WarehouseInventoryRow } from '../types/business';
import { projectQualityState } from '../utils/qualityState';

export type QualityTabKey = 'incoming' | 'production' | 'patrol' | 'defects';

export type QualityLine = {
  receiptLineId?: string;
  materialCode?: string;
  unit?: string;
  name: string;
  qty: string;
  batch: string;
  sampleQty: string;
  failedQty: string;
  result: string;
  qualifiedQty?: string;
  rejectedQty?: string;
  concessionQty?: string;
  pendingQty?: string;
  lineDisposition?: string;
  inspectionItems?: QualityInspectionItem[];
};

export type QualityInspectionItem = {
  name: string;
  standard: string;
  actual: string;
  result: string;
  defectLevel?: string;
  note?: string;
  originalActual?: string;
  originalResult?: string;
  originalNote?: string;
};

export type QualityRecord = {
  code: string;
  sourceDoc: string;
  sourceType: string;
  qualityStandardCode?: string;
  qualityStandardName?: string;
  standardVersionId?: string;
  qualityStandardSnapshot?: {
    code: string;
    familyCode?: string;
    version?: number;
    name: string;
    inspectionType: string;
    sampleRule: string;
    acceptance: string;
    checkpointRules: Array<{ name: string; requirement: string }>;
    frozenAt?: string;
  };
  version?: number;
  party: string;
  contact: string;
  products: QualityLine[];
  inspector: string;
  status: string;
  date: string;
  dueDate: string;
  warehouse: string;
  productionLine?: string;
  workOrder?: string;
  executionCard?: string;
  reportBatch?: string;
  shiftCode?: string;
  shiftName?: string;
  leader?: string;
  operator?: string;
  processStep?: string;
  responsibilityProcess?: string;
  sourceRequirements?: Array<{
    taskCode: string;
    sourceDocument?: string;
    supplementaryRequirement?: string;
    taskNote?: string;
  }>;
  workOrderNote?: string;
  defectLevel?: string;
  disposition?: string;
  /** The inspection decision itself; kept separate from downstream handling progress. */
  inspectionConclusion?: string;
  /** The lifecycle of rejected quantity, such as pending disposition, rework, or reinspection. */
  dispositionStage?: string;
  /** A concise operational prompt derived from the current quality and source-document facts. */
  currentAction?: string;
  qualityOutcome?: '待判定' | '正常' | '异常';
  rectificationAction?: string;
  verificationConclusion?: string;
  verificationResult?: '待验证' | '通过' | '未通过';
  closureResult?: string;
  linkedDefectCode?: string;
  sourcePatrolCode?: string;
  conclusion: string;
  note: string;
};

export type IncomingQualityDecisionLine = {
  receiptLineId?: string;
  lineId?: string;
  materialCode?: string;
  name?: string;
  batch?: string;
  receivedQty: number | string;
  acceptedQty: number | string;
  concessionQty: number | string;
  rejectedQty: number | string;
  pendingQty: number | string;
  frozenQty?: number | string;
  releasedQty?: number | string;
  unit?: string;
  qcRequired?: boolean;
  sampleQty?: string;
  sampleIssueQty?: string;
  inspectionItems?: QualityInspectionItem[];
  disposition: string;
  result?: string;
};

export type IncomingQualityTotals = {
  received: number;
  accepted: number;
  concession: number;
  rejected: number;
  pending: number;
  released: number;
};

export type IncomingQualityDecision = {
  code?: string;
  qualityCode?: string;
  recordCode?: string;
  sourceDoc?: string;
  status?: string;
  result?: string;
  conclusion?: string;
  standardVersionId?: string;
  qualityStandardSnapshot?: QualityRecord['qualityStandardSnapshot'];
  version?: number;
  actor?: string;
  decidedAt?: string;
  remark?: string;
  disposition?: string;
  lines?: IncomingQualityDecisionLine[];
  quantities?: IncomingQualityDecisionLine[];
  totals?: IncomingQualityTotals;
  inspectionTotals?: IncomingQualityTotals;
  totalsByUnit?: Record<string, IncomingQualityTotals>;
  inspectionTotalsByUnit?: Record<string, IncomingQualityTotals>;
};

export type IncomingQualityQuantitySnapshot =
  | IncomingQualityDecisionLine[]
  | {
      lines?: IncomingQualityDecisionLine[];
      quantities?: IncomingQualityDecisionLine[];
      items?: IncomingQualityDecisionLine[];
      received?: number;
      accepted?: number;
      concession?: number;
      rejected?: number;
      pending?: number;
      released?: number;
      totalsByUnit?: Record<string, IncomingQualityTotals>;
      inspectionTotals?: IncomingQualityTotals;
      inspectionTotalsByUnit?: Record<string, IncomingQualityTotals>;
    };

export type IncomingQualityReceipt = Omit<PurchaseReceipt, 'qualityDecision'> & {
  qualityDecision?: IncomingQualityDecision | null;
  qualityQuantities?: IncomingQualityQuantitySnapshot | null;
  qualityTaskCode?: string;
  stockStage?: string;
};

export type IncomingQualityDecisionPayload = {
  sourceDoc: string;
  standardVersionId: string;
  version: number;
  actor: string;
  remark: string;
  idempotencyKey?: string;
  lines: IncomingQualityDecisionLine[];
};

export type IncomingQualityDraftPayload = Omit<QualityRecord, 'products'> & {
  kind?: QualityTabKey;
  products: QualityLine[];
  standardVersionId: string;
  version: number;
  actor: string;
  remark: string;
  lines: IncomingQualityDecisionLine[];
};

export type IncomingQualityApiResponse = {
  record: QualityRecord;
  receipt?: IncomingQualityReceipt;
  decision?: IncomingQualityDecision | null;
  inventory?: WarehouseInventoryRow[];
  dispositions?: IncomingQualityDisposition[];
  reinspections?: IncomingQualityReinspection[];
  returnDocuments?: IncomingQualityReturnDocument[];
  flowRecords?: QualityFlowRecord[];
};

export type IncomingQualityDisposition = {
  id: string;
  qualityCode: string;
  sourceDoc: string;
  receiptLineId: string;
  materialCode: string;
  action: 'return_to_supplier' | 'approve_concession';
  quantity: number;
  unit: string;
  reason: string;
  approvedBy?: string;
  actor: string;
  status: string;
  decisionVersion: number;
  version: number;
  idempotencyKey: string;
  returnDocumentCode?: string;
  executedAt: string;
};

export type IncomingQualityReturnDocument = {
  code: string;
  qualityCode: string;
  sourceReceipt: string;
  receiptLineId: string;
  supplierCode?: string;
  supplier: string;
  materialCode: string;
  materialName: string;
  quantity: number;
  unit: string;
  reason: string;
  status: '已出库';
  owner: string;
  executedAt: string;
};

export type IncomingQualityReinspection = {
  code: string;
  qualityCode: string;
  sourceDoc: string;
  receiptLineId: string;
  materialCode: string;
  materialName: string;
  quantity: number;
  unit: string;
  reason: string;
  inspector: string;
  actor: string;
  status: '待复检' | '已完成';
  result: '待判定' | '合格' | '部分合格' | '不合格';
  acceptedQty: number;
  rejectedQty: number;
  inspectionItems?: QualityInspectionItem[];
  resultReason?: string;
  decisionVersion: number;
  dispositionVersion: number;
  revision: number;
  idempotencyKey: string;
  completionIdempotencyKey?: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
};

export type IncomingQualityDispositionPayload = {
  receiptLineId: string;
  action: IncomingQualityDisposition['action'];
  quantity: number;
  reason: string;
  approvedBy?: string;
  actor: string;
  decisionVersion: number;
  dispositionVersion: number;
  idempotencyKey?: string;
};

export type IncomingQualityReinspectionPayload = {
  receiptLineId: string;
  quantity: number;
  reason: string;
  inspector: string;
  actor: string;
  decisionVersion: number;
  dispositionVersion: number;
  idempotencyKey: string;
};

export type IncomingQualityReinspectionDecisionPayload = {
  acceptedQty: number;
  rejectedQty: number;
  inspectionItems: QualityInspectionItem[];
  resultReason?: string;
  actor: string;
  taskRevision: number;
  idempotencyKey: string;
};

export function incomingQualityQuantityLines(
  source: IncomingQualityDecision | IncomingQualityQuantitySnapshot | null | undefined,
) {
  if (!source) return [];
  if (Array.isArray(source)) return source;
  return source.lines ?? source.quantities ?? ('items' in source ? source.items : undefined) ?? [];
}

async function incomingQualityRequest<T>(path: string, method: 'GET' | 'PUT' | 'POST', body?: unknown) {
  const headers = new Headers();
  const sessionToken = getStoredSessionToken();
  const currentAccount = typeof window === 'undefined'
    ? ''
    : window.localStorage.getItem('filatrix-current-account') || '';

  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  else if (currentAccount) headers.set('X-Filatrix-Account', currentAccount);
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    const message = payload.error || `请求失败：${response.status}`;
    if (response.status === 401) {
      clearStoredSessionToken();
      if (sessionToken && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(sessionExpiredEventName, { detail: { message } }));
      }
    }
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export function getIncomingQualityRecord(code: string) {
  return incomingQualityRequest<IncomingQualityApiResponse>(
    `/quality/incoming/${encodeURIComponent(code)}`,
    'GET',
  );
}

export async function listIncomingQualityRecords() {
  const response = await incomingQualityRequest<{ items: QualityRecord[] }>('/quality/incoming', 'GET');
  return response.items;
}

export function saveIncomingQualityDraft(code: string, payload: IncomingQualityDraftPayload) {
  return incomingQualityRequest<IncomingQualityApiResponse>(
    `/quality/incoming/${encodeURIComponent(code)}`,
    'PUT',
    payload,
  );
}

export function submitIncomingQualityDecision(code: string, payload: IncomingQualityDecisionPayload) {
  return incomingQualityRequest<IncomingQualityApiResponse>(
    `/quality/incoming/${encodeURIComponent(code)}/decision`,
    'POST',
    payload,
  );
}

export function submitIncomingQualityDisposition(code: string, payload: IncomingQualityDispositionPayload) {
  return incomingQualityRequest<IncomingQualityApiResponse & {
    disposition: IncomingQualityDisposition;
    returnDocument?: IncomingQualityReturnDocument | null;
    repeated: boolean;
  }>(
    `/quality/incoming/${encodeURIComponent(code)}/dispose`,
    'POST',
    payload,
  );
}

export function createIncomingQualityReinspection(code: string, payload: IncomingQualityReinspectionPayload) {
  return incomingQualityRequest<IncomingQualityApiResponse & {
    task: IncomingQualityReinspection;
    repeated: boolean;
  }>(
    `/quality/incoming/${encodeURIComponent(code)}/reinspections`,
    'POST',
    payload,
  );
}

export function completeIncomingQualityReinspection(
  code: string,
  taskCode: string,
  payload: IncomingQualityReinspectionDecisionPayload,
) {
  return incomingQualityRequest<IncomingQualityApiResponse & {
    task: IncomingQualityReinspection;
    repeated: boolean;
  }>(
    `/quality/incoming/${encodeURIComponent(code)}/reinspections/${encodeURIComponent(taskCode)}/decide`,
    'POST',
    payload,
  );
}

export type QualityStandardRecord = {
  code: string;
  familyCode?: string;
  version?: number;
  revision?: number;
  name: string;
  inspectionType: '来料质检' | '开机首检' | '半成品质检' | '报工全检' | '入库抽检' | '质量巡检';
  scope: string;
  appliesTo: string;
  sampleRule: string;
  checkpoints: string[];
  checkpointRules?: Array<{ name: string; requirement: string }>;
  acceptance: string;
  owner: string;
  status: string;
  updatedAt: string;
  updatedBy?: string;
  createdAt?: string;
  note: string;
};

export function qualityStandardCheckpointRules(standard: QualityStandardRecord) {
  if (standard.checkpointRules?.length) return standard.checkpointRules;
  return standard.checkpoints.map((name) => ({ name, requirement: standard.acceptance }));
}

export type QualityFlowRecord = {
  time: string;
  actor: string;
  action: string;
  remark: string;
};

const incomingParticleChecks: QualityInspectionItem[] = [
  { name: '包装完整', standard: '外袋无破损、无受潮', actual: '外观正常', result: '合格' },
  { name: '批号一致', standard: '送货单、标签和采购订单一致', actual: '一致', result: '合格' },
  { name: '水分抽测', standard: '符合干燥前入库标准', actual: '待复判', result: '待复判', note: '需补录水分仪记录' },
];

const firstArticleChecks: QualityInspectionItem[] = [
  { name: '开机初段样', standard: '料色稳定，无明显杂质', actual: '待确认', result: '待检验' },
  { name: '颜色', standard: '与确认色样一致', actual: '待确认', result: '待检验' },
  { name: '线径', standard: '1.75mm，允许公差按工艺模板', actual: '待确认', result: '待检验' },
  { name: '外观', standard: '无气泡、黑点、毛刺和污染', actual: '待确认', result: '待检验' },
  { name: '工艺参数', standard: '温区、牵引速度、压力在模板范围内', actual: '待确认', result: '待检验' },
];

const patrolChecks: QualityInspectionItem[] = [
  { name: '在线线径', standard: '连续趋势稳定', actual: '1.74-1.76mm', result: '合格' },
  { name: '颜色偏差', standard: '不超过确认色样允许范围', actual: '一致', result: '合格' },
  { name: '设备参数', standard: '温区、压力、牵引速度稳定', actual: '3 区压力轻微波动', result: '预警', defectLevel: '轻微' },
  { name: '现场标识', standard: '物料、半成品和待检区域标识清晰', actual: '大盘待检标识完整', result: '合格' },
];

const smallRollChecks: QualityInspectionItem[] = [
  { name: '重量', standard: '1kg/盘，允许公差按包装规范', actual: '抽样 8 盘均在范围内', result: '合格' },
  { name: '绕线', standard: '排线平整，无松散塌边', actual: '1 盘绕线偏松', result: '待复判', defectLevel: '轻微' },
  { name: '标签批次', standard: '盘标与报工批次一致', actual: '一致', result: '合格' },
  { name: '外观', standard: '线材表面无污染、黑点、气泡', actual: '合格', result: '合格' },
];

const incomingDefectChecks: QualityInspectionItem[] = [
  { name: '包装完整', standard: '外袋无破损、无受潮', actual: '1 袋外包装受潮', result: '不合格', defectLevel: '一般' },
  { name: '批号一致', standard: '送货单、标签和采购收货批次一致', actual: '一致', result: '合格' },
  { name: '水分资料', standard: '随货资料或水分仪记录完整', actual: '未提供水分仪记录', result: '不合格', defectLevel: '一般' },
];

const smallRollDefectChecks: QualityInspectionItem[] = [
  { name: '重量', standard: '1kg/卷，允许公差按包装规范', actual: '抽样 10 卷均在范围内', result: '合格' },
  { name: '绕线', standard: '排线平整，无松散塌边', actual: '2 卷排线偏松并出现塌边', result: '不合格', defectLevel: '严重' },
  { name: '线径', standard: '1.75mm，允许公差按工艺模板', actual: '1.69–1.82mm，2 卷超差', result: '不合格', defectLevel: '严重' },
  { name: '标签批次', standard: '卷标与报工批次一致', actual: '一致', result: '合格' },
  { name: '外观', standard: '线材表面无污染、黑点、气泡', actual: '正常', result: '合格' },
];

const packingChecks: QualityInspectionItem[] = [
  { name: '箱标', standard: '箱标、盘标、托盘标签一致', actual: '待确认', result: '待检验' },
  { name: '包装规格', standard: '1kg/盘，12 盘/箱', actual: '待确认', result: '待检验' },
  { name: '抽样小盘', standard: '随机抽样外观和标签一致', actual: '待确认', result: '待检验' },
];

export const qualityStandardRows: QualityStandardRecord[] = [
  {
    code: 'QSTD-IQC-RM-V1',
    name: '原料来料检验标准',
    inspectionType: '来料质检',
    scope: '采购入库前',
    appliesTo: '原料、色母、包材等需检物料',
    sampleRule: '按批次抽样，关键物料每批必检',
    checkpoints: ['包装完整', '批号一致', '外观/受潮', '水分或关键参数', '供应商资料'],
    acceptance: '检查项全部合格或复判放行后允许入库',
    owner: '林珊',
    status: '启用',
    updatedAt: '2026-07-01',
    note: '用于来料质检，物料基础资料标记需质检时自动带入。',
  },
  {
    code: 'QSTD-PQC-FIRST-V1',
    name: '开机首检标准',
    inspectionType: '开机首检',
    scope: '产线开机后首件确认',
    appliesTo: '挤出线首段样、换料换色后的首件',
    sampleRule: '每条产线每次开机取 1 组首件样',
    checkpoints: ['开机初段样', '颜色', '线径', '外观', '工艺参数'],
    acceptance: '首检合格后产线才允许进入稳定报工',
    owner: '孙悦',
    status: '启用',
    updatedAt: '2026-07-01',
    note: '对应生产工单或生产批次的首件节点。',
  },
  {
    code: 'QSTD-PQC-REPORT-FULL-V1',
    name: '报工全检标准',
    inspectionType: '报工全检',
    scope: '生产报工后',
    appliesTo: '每次报工的小盘、卷绕批次或生产批次产出',
    sampleRule: '报工批次内全部外观判定，关键尺寸按批次记录',
    checkpoints: ['重量', '绕线', '标签批次', '线径', '外观'],
    acceptance: '批次全检无未关闭异常后允许进入打包或后续工序',
    owner: '孙悦',
    status: '启用',
    updatedAt: '2026-07-01',
    note: '用于报工后的质量确认，避免把巡检和报工质检混在一起。',
  },
  {
    code: 'QSTD-PQC-WIP-LARGE-REEL-V1',
    name: '大盘半成品质检标准',
    inspectionType: '半成品质检',
    scope: '挤出大盘报工后',
    appliesTo: '待复绕的大盘半成品',
    sampleRule: '每个大盘逐盘确认并按 kg 记录净重',
    checkpoints: ['大盘编号', '净重', '线径', '颜色与外观', '收卷状态'],
    acceptance: '大盘检验合格后进入复绕队列',
    owner: '孙悦',
    status: '启用',
    updatedAt: '2026-07-01',
    note: '大盘半成品按公斤管理，不按卷计算。',
  },
  {
    code: 'QSTD-PQC-INBOUND-SAMPLE-V1',
    name: '入库抽检标准',
    inspectionType: '入库抽检',
    scope: '成品入库前',
    appliesTo: '已打包待入库成品',
    sampleRule: '每个包装批次抽检约 10%，至少 2 卷、最多 12 卷；异常时扩大抽检',
    checkpoints: ['箱标', '包装规格', '抽样小盘', '外箱外观', '入库批次一致'],
    acceptance: '抽检合格后推送仓库执行成品入库',
    owner: '孙悦',
    status: '启用',
    updatedAt: '2026-07-01',
    note: '用于打包完成后的入库前抽检。',
  },
  {
    code: 'QSTD-QC-PATROL-V1',
    name: '质量巡检标准',
    inspectionType: '质量巡检',
    scope: '现场主动巡检',
    appliesTo: '拉丝产线、复绕工位、包装区、待检区和仓储暂存区',
    sampleRule: '按班次、区域或质量风险安排巡检；异常时扩大抽查并要求复查',
    checkpoints: ['在线线径', '收卷状态', '现场标识', '设备/环境'],
    acceptance: '无异常直接归档；发现问题时进入整改和复查，复查仍异常则升级不良记录',
    owner: '孙悦',
    status: '启用',
    updatedAt: '2026-07-01',
    note: '用于非固定质检节点的主动巡检，不替代来料质检、首检、报工全检和入库抽检。',
  },
];

const incomingQualitySourceRows: QualityRecord[] = [
  {
    code: 'IQC-20260618-004',
    sourceDoc: 'WR-20260618-004',
    sourceType: '采购入库',
    qualityStandardCode: 'QSTD-IQC-RM-V1',
    qualityStandardName: '原料来料检验标准',
    party: '浙江华塑新材',
    contact: '何经理',
    products: [
      {
        name: 'PETG 原生粒子',
        qty: '1,200 kg',
        batch: 'PETG-RM-2026061804',
        sampleQty: '5 袋',
        failedQty: '0',
        result: '不合格',
        inspectionItems: incomingDefectChecks,
      },
      {
        name: '黑色色母',
        qty: '80 kg',
        batch: 'MB-BLK-2026061805',
        sampleQty: '2 袋',
        failedQty: '0',
        result: '合格',
        inspectionItems: [
          { name: '批号一致', standard: '标签与采购单一致', actual: '一致', result: '合格' },
          { name: '颜色样', standard: '与封样色母一致', actual: '待复判', result: '待复判', note: '需与 PETG 黑色成品色样联判' },
        ],
      },
    ],
    inspector: '林珊',
    status: '待复判',
    date: '2026-06-18',
    dueDate: '2026-06-18',
    warehouse: '采购暂存区 / QC-01',
    defectLevel: '一般',
    disposition: '等待质检主管判定',
    conclusion: 'PETG 粒子外观正常，水分记录待补录；黑色色母需结合成品色样复判。',
    note: '供应商随货 COA 已上传，复判通过后才能正式入原料仓。',
  },
  {
    code: 'IQC-20260617-006',
    sourceDoc: 'WR-20260617-006',
    sourceType: '采购入库',
    qualityStandardCode: 'QSTD-IQC-RM-V1',
    qualityStandardName: '原料来料检验标准',
    party: '苏州聚合材料',
    contact: '顾经理',
    products: [
      {
        name: 'PLA 原生粒子',
        qty: '900 kg',
        batch: 'PLA-RM-2026061609',
        sampleQty: '4 袋',
        failedQty: '0',
        result: '合格',
        inspectionItems: [
          { name: '包装完整', standard: '外袋无破损、无受潮', actual: '正常', result: '合格' },
          { name: '批号一致', standard: '采购单、送货单、标签一致', actual: '一致', result: '合格' },
          { name: '水分抽测', standard: '符合干燥前入库标准', actual: '合格', result: '合格' },
        ],
      },
    ],
    inspector: '林珊',
    status: '合格',
    date: '2026-06-17',
    dueDate: '2026-06-17',
    warehouse: '采购暂存区 / QC-02',
    disposition: '放行入库',
    conclusion: '包装、批号、水分抽测均合格。',
    note: '合格后可入原料仓 R 区，用于 PLA 珍珠白和哑光黑工单。',
  },
  {
    code: 'IQC-20260615-002',
    sourceDoc: 'WR-20260615-002',
    sourceType: '采购入库',
    qualityStandardCode: 'QSTD-IQC-RM-V1',
    qualityStandardName: '原料来料检验标准',
    party: '宁波嘉海包装',
    contact: '沈经理',
    products: [
      {
        name: '客户标签纸 80mm',
        qty: '40 卷',
        batch: 'PK2026061201',
        sampleQty: '5 卷',
        failedQty: '0 卷',
        result: '免检放行',
      },
    ],
    inspector: '吴磊',
    status: '免检放行',
    date: '2026-06-15',
    dueDate: '2026-06-15',
    warehouse: '包材仓 PK-01-06',
    disposition: '直接入库',
    conclusion: '供应商批次稳定，本批按免检规则放行。',
    note: '后续如出现标签粘性异常，再转不良记录追踪。',
  },
];

const productionQualitySourceRows: QualityRecord[] = [
  {
    code: 'PQC-FIRST-20260630-002',
    sourceDoc: 'EXE-20260630-D-02',
    sourceType: '开机首检',
    qualityStandardCode: 'QSTD-PQC-FIRST-V1',
    qualityStandardName: '开机首检标准',
    party: '挤出 A2 线',
    contact: '赵云',
    products: [
      {
        name: 'PLA 1.75mm 珍珠白耗材',
        qty: '开机初段样',
        batch: 'FA2026063002',
        sampleQty: '1 组',
        failedQty: '0',
        result: '待检验',
        inspectionItems: firstArticleChecks,
      },
    ],
    inspector: '孙悦',
    status: '待检验',
    date: '2026-06-30',
    dueDate: '2026-06-30',
    warehouse: '生产线边',
    productionLine: '挤出 A2 线',
    workOrder: 'MO-20260630-002',
    executionCard: 'EXE-20260630-D-02',
    shiftCode: 'SHIFT-20260630-D',
    shiftName: '白班',
    leader: '赵云',
    operator: '钱峰',
    processStep: '开机首检',
    responsibilityProcess: '挤出拉丝',
    disposition: '首件合格后允许稳定报工',
    conclusion: '确认开机初段样、颜色、线径、外观和工艺参数。',
    note: '首件不需要等小盘收卷完成，开机初段样确认即可。',
  },
  {
    code: 'PQC-REPORT-20260630-001',
    sourceDoc: 'RPT-20260630-001',
    sourceType: '报工全检',
    qualityStandardCode: 'QSTD-PQC-REPORT-FULL-V1',
    qualityStandardName: '报工全检标准',
    party: '挤出 A1 线',
    contact: '李四',
    products: [
      {
        name: 'PETG 1.75mm 黑色耗材',
        qty: '60 卷',
        batch: 'SRL-20260630-A1-001~060',
        sampleQty: '6 卷',
        failedQty: '0 卷',
        result: '待检验',
        inspectionItems: smallRollChecks,
      },
    ],
    inspector: '孙悦',
    status: '待检验',
    date: '2026-06-30',
    dueDate: '2026-06-30',
    warehouse: '生产线边',
    productionLine: '挤出 A1 线',
    workOrder: 'MO-20260630-001',
    executionCard: 'EXE-20260630-D-01',
    reportBatch: 'RPT-20260630-001',
    shiftCode: 'SHIFT-20260630-D',
    shiftName: '白班',
    leader: '李四',
    operator: '王敏',
    processStep: '报工全检',
    responsibilityProcess: '收卷/质检',
    disposition: '全检合格后进入打包',
    conclusion: '小盘重量、线径、外观、标签批次和绕线状态待确认。',
    note: '来源为本班报工批次，不与现场主动巡检混用。',
  },
  {
    code: 'PQC-SROLL-20260630-002',
    sourceDoc: 'RPT-20260630-002',
    sourceType: '报工全检',
    qualityStandardCode: 'QSTD-PQC-REPORT-FULL-V1',
    qualityStandardName: '报工全检标准',
    party: '挤出 A2 线',
    contact: '钱峰',
    products: [
      {
        name: 'PLA 1.75mm 珍珠白耗材',
        qty: '80 卷',
        batch: 'SRL-20260630-A2-001~080',
        sampleQty: '8 卷',
        failedQty: '0 卷',
        result: '检验中',
        inspectionItems: smallRollChecks,
      },
    ],
    inspector: '孙悦',
    status: '待复判',
    date: '2026-06-30',
    dueDate: '2026-06-30',
    warehouse: '待打包区',
    productionLine: '挤出 A2 线',
    workOrder: 'MO-20260630-002',
    executionCard: 'EXE-20260630-D-02',
    reportBatch: 'RPT-20260630-002',
    shiftCode: 'SHIFT-20260630-D',
    shiftName: '白班',
    leader: '赵云',
    operator: '钱峰',
    processStep: '报工全检',
    responsibilityProcess: '收卷/质检',
    disposition: '合格后进入打包',
    conclusion: '小盘重量、线径、外观、标签批次和绕线状态检验中。',
    note: '成品最终形态为小盘，小盘合格后才能打包。',
  },
  {
    code: 'PQC-SAMPLE-20260630-001',
    sourceDoc: 'PKG-20260630-001',
    sourceType: '入库抽检',
    qualityStandardCode: 'QSTD-PQC-INBOUND-SAMPLE-V1',
    qualityStandardName: '入库抽检标准',
    party: '打包 P1 线',
    contact: '刘洋',
    products: [
      {
        name: 'PETG 1.75mm 黑色耗材',
        qty: '60 卷',
        batch: 'PKG-20260630-001',
        sampleQty: '5 卷',
        failedQty: '0 卷',
        result: '待检验',
        inspectionItems: packingChecks,
      },
    ],
    inspector: '孙悦',
    status: '待检验',
    date: '2026-06-30',
    dueDate: '2026-06-30',
    warehouse: '待入库区',
    productionLine: '打包 P1 线',
    workOrder: 'MO-20260630-001',
    reportBatch: 'RWD-20260629-004',
    shiftCode: 'SHIFT-20260630-D',
    shiftName: '白班',
    leader: '刘洋',
    operator: '刘洋',
    processStep: '入库抽检',
    responsibilityProcess: '打包',
    disposition: '抽检合格后推送仓库待入库',
    conclusion: '包装规格、标签、外箱、抽样小盘和批次一致性待确认。',
    note: '打包抽检合格后才能进入成品入库。',
  },
  {
    code: 'PQC-SROLL-20260629-006',
    sourceDoc: 'RPT-20260629-006',
    sourceType: '报工全检',
    qualityStandardCode: 'QSTD-PQC-REPORT-FULL-V1',
    qualityStandardName: '报工全检标准',
    party: '挤出 B1 线',
    contact: '周宁',
    products: [
      {
        name: 'PLA 1.75mm 哑光黑耗材',
        qty: '210 卷',
        batch: 'SRL-20260629-B1-020~229',
        sampleQty: '12 卷',
        failedQty: '1 卷',
        result: '待复判',
        inspectionItems: smallRollChecks,
      },
    ],
    inspector: '孙悦',
    status: '待复判',
    date: '2026-06-29',
    dueDate: '2026-06-29',
    warehouse: '待打包区',
    productionLine: '挤出 B1 线',
    workOrder: 'MO-20260629-006',
    executionCard: 'EXE-20260629-N-01',
    reportBatch: 'RPT-20260629-006',
    shiftCode: 'SHIFT-20260629-N',
    shiftName: '夜班',
    leader: '周宁',
    operator: '刘洋',
    processStep: '报工全检',
    responsibilityProcess: '收卷/返绕',
    defectLevel: '轻微',
    disposition: '待主管复核',
    conclusion: '一盘绕线松散，重量和线径合格，等待复判是否返绕。',
    note: '复判结论会决定是否进入打包或转不良处理。',
  },
  {
    code: 'PQC-REPORT-20260629-004',
    sourceDoc: 'RPT-20260629-004',
    sourceType: '报工全检',
    qualityStandardCode: 'QSTD-PQC-REPORT-FULL-V1',
    qualityStandardName: '报工全检标准',
    party: '挤出 A1 线',
    contact: '李四',
    products: [
      {
        name: 'PETG 1.75mm 黑色耗材',
        qty: '72 卷',
        batch: 'SRL-20260629-A1-001~072',
        sampleQty: '6 卷',
        failedQty: '0 卷',
        result: '合格',
        inspectionItems: smallRollChecks,
      },
    ],
    inspector: '孙悦',
    status: '合格',
    date: '2026-06-29',
    dueDate: '2026-06-29',
    warehouse: '生产线边',
    productionLine: '挤出 A1 线',
    workOrder: 'MO-20260630-001',
    executionCard: 'EXE-20260629-N-01',
    reportBatch: 'RPT-20260629-004',
    shiftCode: 'SHIFT-20260629-N',
    shiftName: '夜班',
    leader: '周宁',
    operator: '刘洋',
    processStep: '报工全检',
    responsibilityProcess: '收卷/质检',
    disposition: '已放行打包',
    conclusion: '本次报工批次重量、线径、外观和绕线状态合格。',
    note: '报工质检已绑定夜班、生产批次和责任人。',
  },
  {
    code: 'PQC-SAMPLE-20260628-002',
    sourceDoc: 'PKG-20260628-002',
    sourceType: '入库抽检',
    qualityStandardCode: 'QSTD-PQC-INBOUND-SAMPLE-V1',
    qualityStandardName: '入库抽检标准',
    party: '打包 P1 线',
    contact: '刘洋',
    products: [
      {
        name: 'PETG 1.75mm 透明耗材',
        qty: '168 卷',
        batch: 'PKG-20260628-002',
        sampleQty: '6 卷',
        failedQty: '0 卷',
        result: '合格',
        inspectionItems: packingChecks,
      },
    ],
    inspector: '孙悦',
    status: '合格',
    date: '2026-06-28',
    dueDate: '2026-06-28',
    warehouse: '待入库区',
    productionLine: '打包 P1 线',
    workOrder: 'MO-20260630-004',
    reportBatch: 'PKG-20260628-002',
    shiftCode: 'SHIFT-20260628-D',
    shiftName: '白班',
    leader: '刘洋',
    operator: '刘洋',
    processStep: '入库抽检',
    responsibilityProcess: '打包',
    disposition: '允许入库',
    conclusion: '包装规格、标签、外箱和抽样小盘均符合要求。',
    note: '已推送仓库执行成品入库。',
  },
];

function qualityDateValue(value: unknown) {
  return String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '';
}

function qualityTaskCodeDate(code: string) {
  const match = code.match(/-(\d{2})(\d{2})(\d{2})(?:-|$)/);
  return match ? `20${match[1]}-${match[2]}-${match[3]}` : '';
}

export function productionQualityRecordFromTask(task: (typeof production2QualityTasks)[number]): QualityRecord {
  const standard = qualityStandardRows.find((row) => row.code === task.standardVersionId)
    ?? qualityStandardRows.find((row) => row.inspectionType === task.kind);
  const frozenStandard = task.qualityStandardSnapshot;
  const isIncomingTask = task.code.startsWith('IQC');
  const executionCard = production2ExecutionCards.find((row) => row.code === task.sourceCard);
  const workOrder = production2WorkOrders.find(
    (row) => row.code === task.workOrderCode || row.code === executionCard?.workOrderCode,
  );
  const linePlan = workOrder?.linePlans.find((line) => line.line === executionCard?.line);
  const taskQuantity = Number(task.quantity || 0);
  const resultUnit = task.unit || executionCard?.unit || '';
  const inspectedQty = taskQuantity > 0
    ? `${taskQuantity}${resultUnit ? ` ${resultUnit}` : ''}`
    : executionCard
      ? `${task.kind === '开机首检' ? executionCard.planQty : Math.max(executionCard.reportedQty, executionCard.planQty)}${executionCard.unit ? ` ${executionCard.unit}` : ''}`
      : task.sampleQty;
  const productionLine = executionCard?.line || task.line;
  const normalizedStatus = task.dispositionStatus === '待处置' || task.dispositionStatus === '返工中'
    ? task.dispositionStatus
    : task.status === '待检' || task.status === '检验中'
      ? '待检验'
      : task.status;
  const normalizedResult = task.result === '未开始' ? '待检验' : task.result;
  const batch = isIncomingTask
    ? task.materialBatch || task.sourceCard
    : task.kind === '半成品质检'
      ? task.sourceWipBatchCode || task.sourceCard
      : task.sourceCard;
  const sampleUnit = String(task.sampleQty || '')
    .replace(/[\d,.\s-]/g, '')
    .trim();
  const sampleDefectQty = task.kind === '入库抽检' ? task.sampleDefectQty : task.rejectedQty;
  const failedQtyUnit = isIncomingTask ? sampleUnit || resultUnit : resultUnit;
  const checkpointResults = task.checkpointResults?.length
    ? task.checkpointResults
    : task.checkpoints.map((checkpoint) => ({
        name: checkpoint,
        standard: `按启用质量标准检查并记录“${checkpoint}”`,
        actual: normalizedResult === '待检验' ? '' : normalizedResult,
        result: normalizedStatus,
        note: '',
      }));
  // The task carries the disposition that was true when this inspection was created or
  // explicitly updated. Do not infer it again from the card's latest short-close state:
  // a later supplement report belongs to the same card but must flow to packaging rather
  // than appearing to activate the already-completed supplement job again.
  const taskDisposition = task.disposition;
  const stateProjection = projectQualityState({
    page: isIncomingTask ? 'incoming' : 'production',
    status: normalizedStatus,
    inspectionConclusion: normalizedResult,
    dispositionStage: task.dispositionStatus,
    sourceType: isIncomingTask ? '采购收货' : task.kind,
    disposition: taskDisposition,
    productResults: [normalizedResult],
  });
  const taskDate = qualityDateValue(task.decidedAt)
    || qualityDateValue(task.createdAt)
    || qualityDateValue(task.dueTime)
    || qualityTaskCodeDate(task.code)
    || '2026-07-01';
  const dueDate = qualityDateValue(task.dueTime)
    || qualityDateValue(task.createdAt)
    || qualityDateValue(task.decidedAt)
    || qualityTaskCodeDate(task.code)
    || taskDate;

  return {
    code: task.code,
    sourceDoc: task.sourceCard,
    sourceType: isIncomingTask ? '采购收货' : task.kind,
    qualityStandardCode: task.qualityStandardCode || frozenStandard?.code || standard?.code || '',
    qualityStandardName: task.qualityStandardName || frozenStandard?.name || standard?.name || '',
    standardVersionId: task.standardVersionId || frozenStandard?.code || task.qualityStandardCode || standard?.code || '',
    qualityStandardSnapshot: frozenStandard ? {
      code: frozenStandard.code,
      familyCode: frozenStandard.familyCode,
      version: frozenStandard.version,
      name: frozenStandard.name,
      inspectionType: frozenStandard.inspectionType,
      sampleRule: frozenStandard.sampleRule || '',
      acceptance: frozenStandard.acceptance || '',
      checkpointRules: frozenStandard.checkpointRules.map((item) => ({ ...item })),
      frozenAt: frozenStandard.frozenAt,
    } : undefined,
    version: task.version || 0,
    party: isIncomingTask ? task.supplier || '待确认供应商' : productionLine,
    contact: isIncomingTask ? '' : executionCard?.leader || linePlan?.leader || task.inspector,
    products: [
      {
        name: task.productName,
        qty: inspectedQty,
        batch,
        sampleQty: task.sampleQty,
        failedQty: sampleDefectQty != null
          ? `${sampleDefectQty}${failedQtyUnit ? ` ${failedQtyUnit}` : ''}`
          : !['待检验', '待判定'].includes(normalizedResult) && task.sampleQty
            ? `0${failedQtyUnit ? ` ${failedQtyUnit}` : ''}`
            : '',
        result: normalizedResult,
        inspectionItems: checkpointResults.map((checkpoint) => ({
          name: checkpoint.name,
          standard: checkpoint.standard
            || frozenStandard?.checkpointRules.find((item) => item.name === checkpoint.name)?.requirement
            || standard?.acceptance
            || '按质检标准检查',
          actual: checkpoint.actual || '',
          result: checkpoint.result,
          note: checkpoint.note || '',
        })),
      },
    ],
    inspector: task.inspector,
    status: normalizedStatus,
    date: taskDate,
    dueDate,
    warehouse: isIncomingTask ? task.warehouse || task.line : productionLine,
    productionLine: isIncomingTask ? '' : productionLine,
    workOrder: isIncomingTask ? '' : workOrder?.code || task.workOrderCode,
    executionCard: isIncomingTask ? '' : task.sourceCard,
    reportBatch: isIncomingTask
      ? batch
      : task.kind === '半成品质检'
        ? task.sourceWipBatchCode || task.sourceReportCode || task.sourceCard
        : task.sourceReportCode || task.sourceCard,
    shiftCode: '',
    shiftName: executionCard?.shift ?? '',
    leader: executionCard?.leader || linePlan?.leader || '',
    operator: executionCard?.operator ?? '',
    processStep: isIncomingTask ? '' : task.kind,
    responsibilityProcess: task.kind === '半成品质检' ? '大盘半成品检验' : '',
    sourceRequirements: isIncomingTask ? [] : task.sourceRequirements?.map((item) => ({ ...item })) || [],
    workOrderNote: isIncomingTask ? '' : task.workOrderNote || '',
    disposition: taskDisposition,
    inspectionConclusion: stateProjection.inspectionConclusion,
    dispositionStage: stateProjection.dispositionStage,
    currentAction: stateProjection.currentAction,
    conclusion: normalizedResult === '待检验' ? '' : task.conclusion || normalizedResult,
    note: isIncomingTask
      ? `由备料/采购到货触发，要求完成：${task.dueTime}；合格或让步数量放行后转待入库，仓库确认入库后才形成可用库存。`
      : '',
  };
}

const generatedProductionQualityRows: QualityRecord[] = production2QualityTasks
  .filter((task) => !task.code.startsWith('IQC'))
  .map(productionQualityRecordFromTask);

const generatedIncomingQualityRows: QualityRecord[] = production2QualityTasks
  .filter((task) => task.code.startsWith('IQC'))
  .map(productionQualityRecordFromTask);

export const incomingQualityRows: QualityRecord[] = [
  ...generatedIncomingQualityRows,
  ...incomingQualitySourceRows.filter(
    (row) => !generatedIncomingQualityRows.some((generated) => generated.code === row.code),
  ),
];

export const productionQualityRows: QualityRecord[] = [
  ...generatedProductionQualityRows,
  ...productionQualitySourceRows.filter(
    (row) => !generatedProductionQualityRows.some((generated) => generated.code === row.code),
  ),
];

export const qualityPatrolRows: QualityRecord[] = [
  {
    code: 'QPATROL-20260701-001',
    sourceDoc: 'MO2-260701-001',
    sourceType: '产线巡检',
    qualityStandardCode: 'QSTD-QC-PATROL-V1',
    qualityStandardName: '质量巡检标准',
    party: '拉丝 L1 线',
    contact: '李娜',
    products: [
      {
        name: '线径与收卷状态',
        qty: '1 次',
        batch: 'SRL-260701-L1-018',
        sampleQty: '3 点',
        failedQty: '1 点',
        result: '预警',
        inspectionItems: patrolChecks,
      },
    ],
    inspector: '孙悦',
    status: '待整改',
    date: '2026-07-01',
    dueDate: '2026-07-01',
    warehouse: '拉丝 L1 线',
    productionLine: '拉丝 L1 线',
    workOrder: 'MO2-260701-001',
    executionCard: 'EXE2-L1-260701-D',
    reportBatch: 'SRL-260701-L1-018',
    shiftCode: 'SHIFT-20260701-D',
    shiftName: '白班',
    leader: '李娜',
    operator: '王敏',
    processStep: '现场巡检',
    responsibilityProcess: '收卷/排线',
    defectLevel: '轻微',
    disposition: '现场整改',
    rectificationAction: '已复核收卷张力参数并重新调整排线，整改照片已提交质量复查。',
    conclusion: '在线线径稳定，收卷换盘后边缘略松，要求班组复核张力并补拍整改照片。',
    note: '非固定质检节点，不阻断工单；复查仍异常时升级关联不良记录。',
  },
  {
    code: 'QPATROL-20260701-002',
    sourceDoc: 'PKG-260701-002',
    sourceType: '包装巡检',
    qualityStandardCode: 'QSTD-QC-PATROL-V1',
    qualityStandardName: '质量巡检标准',
    party: '包装 P1 线',
    contact: '刘洋',
    products: [
      {
        name: '箱标与待入库暂存',
        qty: '1 次',
        batch: 'PKG-260701-002',
        sampleQty: '4 点',
        failedQty: '0 点',
        result: '合格',
        inspectionItems: [
          { name: '箱标', standard: '箱标、盘标、托盘标签一致', actual: '一致', result: '合格' },
          { name: '暂存状态', standard: '合格品、待检品和异常品分区清楚', actual: '分区清楚', result: '合格' },
          { name: '包装环境', standard: '工作台无污染源，外箱无受潮', actual: '正常', result: '合格' },
        ],
      },
    ],
    inspector: '陈宇',
    status: '已关闭',
    date: '2026-07-01',
    dueDate: '2026-07-01',
    warehouse: '包装 P1 线',
    productionLine: '包装 P1 线',
    workOrder: 'MO2-260701-003',
    reportBatch: 'PKG-260701-002',
    shiftCode: 'SHIFT-20260701-D',
    shiftName: '白班',
    leader: '刘洋',
    operator: '刘洋',
    processStep: '包装巡检',
    responsibilityProcess: '包装',
    disposition: '无异常关闭',
    conclusion: '箱标、包装规格和待入库暂存状态符合要求，本次巡检关闭。',
    note: '该记录只用于现场巡检追溯，不替代入库前抽检。',
  },
  {
    code: 'QPATROL-20260630-003',
    sourceDoc: 'AREA-QC-260630-N',
    sourceType: '仓储巡查',
    qualityStandardCode: 'QSTD-QC-PATROL-V1',
    qualityStandardName: '质量巡检标准',
    party: '采购暂存区',
    contact: '周宁',
    products: [
      {
        name: '大盘半成品暂存',
        qty: '1 次',
        batch: 'LRG-260630-B1-011~014',
        sampleQty: '4 点',
        failedQty: '0 点',
        result: '待检验',
        inspectionItems: [
          { name: '区域标识', standard: '大盘待检、待复绕和异常隔离标识清楚', actual: '', result: '待检验' },
          { name: '批次一致', standard: '大盘标签与工单/生产批次一致', actual: '', result: '待检验' },
          { name: '防护状态', standard: '大盘防尘、防潮和摆放状态符合现场要求', actual: '', result: '待检验' },
        ],
      },
    ],
    inspector: '孙悦',
    status: '待巡检',
    date: '2026-06-30',
    dueDate: '2026-07-01',
    warehouse: '采购暂存区',
    productionLine: '采购暂存区',
    workOrder: 'MO-20260629-006',
    executionCard: 'EXE-20260629-N-01',
    reportBatch: 'LRG-260630-B1-011~014',
    shiftCode: 'SHIFT-20260630-N',
    shiftName: '夜班',
    leader: '周宁',
    operator: '刘洋',
    processStep: '仓储巡查',
    responsibilityProcess: '半成品暂存',
    disposition: '',
    conclusion: '',
    note: '用于补充大盘收卷后、复绕前的现场质量风险记录。',
  },
];

export const defectRows: QualityRecord[] = [
  {
    code: 'NCR-20260618-002',
    sourceDoc: 'IQC-20260618-004',
    sourceType: '来料质检',
    party: '浙江华塑新材',
    contact: '何经理',
    products: [
      {
        name: 'PETG 原生粒子',
        qty: '1,200 kg',
        batch: 'PETG-RM-2026061804',
        sampleQty: '5 袋',
        failedQty: '1 袋',
        result: '待复判',
        inspectionItems: incomingParticleChecks,
      },
    ],
    inspector: '林珊',
    status: '待处理',
    date: '2026-06-18',
    dueDate: '2026-06-19',
    warehouse: '采购暂存区 / QC-01',
    defectLevel: '一般',
    disposition: '供应商确认',
    conclusion: '水分记录缺失且一袋包装受潮，等待供应商确认补货或让步接收。',
    note: '暂不放行入库，库存保持质检冻结。',
  },
  {
    code: 'NCR-20260616-002',
    sourceDoc: 'PQC-SROLL-20260630-003',
    sourceType: '生产质检',
    party: '挤出 A1 线',
    contact: '王敏',
    products: [
      {
        name: 'PETG 1.75mm 黑色耗材',
        qty: '120 卷',
        batch: 'SRL-20260630-A1-021~140',
        sampleQty: '10 卷',
        failedQty: '2 卷',
        result: '不合格',
        inspectionItems: smallRollDefectChecks,
      },
    ],
    inspector: '孙悦',
    status: '处置中',
    date: '2026-06-30',
    dueDate: '2026-07-01',
    warehouse: '待处理区',
    productionLine: '挤出 A1 线',
    workOrder: 'MO-20260630-001',
    executionCard: 'EXE-20260630-D-01',
    reportBatch: 'PQC-SROLL-20260630-003',
    shiftCode: 'SHIFT-20260630-D',
    shiftName: '白班',
    leader: '李四',
    operator: '王敏',
    processStep: '小盘质检',
    responsibilityProcess: '复绕/收卷',
    defectLevel: '严重',
    disposition: '返绕',
    conclusion: '绕线松散且两盘线径波动超限，需返绕后重新送小盘质检。',
    note: '责任班次：白班；返绕完成后重新生成小盘质检。',
  },
  {
    code: 'NCR-20260615-003',
    sourceDoc: 'PQC-SROLL-20260629-006',
    sourceType: '生产质检',
    party: '挤出 B1 线',
    contact: '周宁',
    products: [
      {
        name: 'PLA 1.75mm 哑光黑耗材',
        qty: '210 卷',
        batch: 'SRL-20260629-B1-020~229',
        sampleQty: '12 卷',
        failedQty: '1 卷',
        result: '不合格',
        inspectionItems: [
          { name: '重量', standard: '1kg/卷，允许公差按包装规范', actual: '抽样 12 卷均在范围内', result: '合格' },
          { name: '绕线', standard: '排线平整，无松散塌边', actual: '1 卷绕线松散', result: '不合格', defectLevel: '一般' },
          { name: '线径', standard: '1.75mm，允许公差按工艺模板', actual: '抽样范围内', result: '合格' },
        ],
      },
    ],
    inspector: '孙悦',
    status: '待验证',
    date: '2026-06-29',
    dueDate: '2026-07-01',
    warehouse: '待处理区',
    productionLine: '挤出 B1 线',
    workOrder: 'MO-20260629-006',
    executionCard: 'EXE-20260629-N-01',
    reportBatch: 'PQC-SROLL-20260629-006',
    shiftCode: 'SHIFT-20260629-N',
    shiftName: '夜班',
    leader: '周宁',
    operator: '刘洋',
    processStep: '小盘质检',
    responsibilityProcess: '复绕/收卷',
    defectLevel: '一般',
    disposition: '返绕',
    rectificationAction: '异常卷已完成返绕并重新称重，已送质量人员复检。',
    verificationResult: '待验证',
    conclusion: '抽检发现 1 卷绕线松散，需要返绕后验证。',
    note: '验证通过后方可恢复打包。',
  },
  {
    code: 'NCR-20260612-001',
    sourceDoc: 'WS-20260612-004',
    sourceType: '客户反馈',
    party: '深圳星桥设备',
    contact: '赵经理',
    products: [
      {
        name: 'PLA 1.75mm 哑光黑耗材',
        qty: '48 卷',
        batch: 'FG-PLA-MBK-2026060803',
        sampleQty: '2 箱',
        failedQty: '1 箱',
        result: '不合格',
      },
    ],
    inspector: '陈宇',
    status: '已关闭',
    date: '2026-06-12',
    dueDate: '2026-06-15',
    warehouse: '售后待处理区',
    defectLevel: '一般',
    disposition: '补发成品',
    rectificationAction: '已补发 1 箱（12 卷）并完成仓库出库，客户已签收。',
    verificationConclusion: '客户确认补发产品完好，污染批次未继续使用，本次处置有效。',
    verificationResult: '通过',
    conclusion: '客户反馈外箱破损导致一箱盘面污染。',
    note: '同步给销售订单售后备注，并提醒仓库复核包装防护。',
  },
];

export const qualityFlowRecords: Record<string, QualityFlowRecord[]> = {
  'IQC-20260618-004': [
    { time: '2026-06-18 09:20', actor: '系统', action: '生成来料质检', remark: '采购入库 WR-20260618-004 含需检物料。' },
    { time: '2026-06-18 10:05', actor: '林珊', action: '完成抽检', remark: 'PETG 原生粒子水分记录待补录，黑色色母等待色样复判。' },
  ],
  'PQC-SROLL-20260629-006': [
    { time: '2026-06-29 13:40', actor: '周宁', action: '提交小盘质检', remark: 'PLA 哑光黑小盘完成本班报工。' },
    { time: '2026-06-29 14:10', actor: '孙悦', action: '完成首轮检验', remark: '一盘绕线松散，等待复判。' },
  ],
  'NCR-20260618-002': [
    { time: '2026-06-18 10:12', actor: '林珊', action: '创建不良记录', remark: '由来料质检 IQC-20260618-004 生成，保持原料冻结。' },
  ],
  'NCR-20260616-002': [
    { time: '2026-06-30 15:20', actor: '孙悦', action: '创建不良记录', remark: '由小盘质检 PQC-SROLL-20260630-003 生成。' },
    { time: '2026-06-30 15:45', actor: '王敏', action: '安排返绕', remark: '返绕后重新送小盘质检。' },
  ],
  'NCR-20260615-003': [
    { time: '2026-06-29 14:25', actor: '孙悦', action: '创建不良记录', remark: '由生产质检 PQC-SROLL-20260629-006 转入不良处置。' },
    { time: '2026-06-30 09:10', actor: '周宁', action: '提交处置结果', remark: '异常卷已返绕并重新称重，等待质量验证。' },
  ],
  'QPATROL-20260701-001': [
    { time: '2026-07-01 10:20', actor: '孙悦', action: '登记质量巡检', remark: '拉丝 L1 线收卷换盘后边缘略松，要求现场整改。' },
    { time: '2026-07-01 10:35', actor: '李娜', action: '接收整改', remark: '班组复核张力参数并补拍整改照片。' },
  ],
  'QPATROL-20260701-002': [
    { time: '2026-07-01 14:10', actor: '陈宇', action: '登记包装巡检', remark: '包装 P1 线箱标和待入库暂存状态符合要求。' },
    { time: '2026-07-01 14:20', actor: '陈宇', action: '关闭巡检', remark: '无异常，本次巡检归档。' },
  ],
};
