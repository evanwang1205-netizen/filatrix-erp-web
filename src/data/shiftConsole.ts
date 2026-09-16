export type ShiftRunStatus = '待交接' | '生产中';
export type LineRunStatus = '空闲' | '生产中' | '暂停中' | '缺料中' | '故障中' | '维护中';
export type ReportRecordType = '报工' | '更正';

export interface ShiftRecord {
  recordNo: string;
  previousRecordNo?: string;
  shiftName: string;
  supervisor: string;
  crewMembers: string[];
  startedAt: string;
  endedAt: string;
  status: ShiftRunStatus;
  remark: string;
}

export interface ShiftWorkOrder {
  code: string;
  product: string;
  process: string;
  unit: string;
  planQty: number;
  goodQty: number;
  defectQty: number;
  dueDate: string;
  status: '待开工' | '生产中' | '待备料' | '待质检' | '已完工';
  sourceOrder: string;
  materialStatus: string;
}

export interface ProductionLineMaster {
  id: string;
  name: string;
  enabled: boolean;
}

export interface LineAssignment {
  lineId: string;
  workOrderCode: string | null;
  leader: string;
  plannedQty?: number;
  status: LineRunStatus;
  lastReport?: {
    leader: string;
    goodQty: number;
    defectQty: number;
    time: string;
  };
}

export interface ReportRecord {
  id: string;
  type: ReportRecordType;
  shiftRecordNo: string;
  lineId: string;
  workOrderCode: string;
  goodQty: number;
  defectQty: number;
  operator: string;
  leader: string;
  time: string;
  previousGoodQty?: number;
  previousDefectQty?: number;
  reason?: string;
  sourceReportId?: string;
  sourceShiftRecordNo?: string;
}

export interface LineExceptionRecord {
  id: string;
  shiftRecordNo: string;
  lineId: string;
  workOrderCode: string | null;
  operator: string;
  reason: string;
  result: string;
  time: string;
}

export interface ShiftEventLog {
  id: string;
  category: '接班' | '交班' | '工单调整' | '产线调整' | '报工' | '更正' | '异常' | '恢复生产';
  time: string;
  actor: string;
  title: string;
  detail: string;
  relatedNo?: string;
}

export interface ShiftHandoverRecord {
  id: string;
  recordNo: string;
  previousRecordNo?: string;
  shiftName: string;
  supervisor: string;
  crewMembers: string[];
  startedAt: string;
  endedAt: string;
  operator: string;
  operatedAt: string;
  goodQty: number;
  defectQty: number;
  exceptionCount: number;
  remark: string;
  lineSummaries: Array<{
    lineName: string;
    workItems: Array<{
      workOrderCode: string;
      product: string;
      goodQty: number;
      defectQty: number;
    }>;
  }>;
}

export const shiftEmployees = ['张三', '李四', '王敏', '陈宇', '李强', '赵云', '钱峰'];

export const productionLineMasters: ProductionLineMaster[] = [
  { id: 'L-A1', name: 'A1 线', enabled: true },
  { id: 'L-A2', name: 'A2 线', enabled: true },
  { id: 'L-B2', name: 'B2 线', enabled: true },
  { id: 'L-B3', name: 'B3 线', enabled: true },
  { id: 'L-P1', name: '包装线 P1', enabled: true },
  { id: 'L-X1', name: '试验线 X1', enabled: false },
];

export const initialShiftRecord: ShiftRecord = {
  recordNo: 'SRD-20260622-N2',
  previousRecordNo: 'SRD-20260622-D1',
  shiftName: '夜班',
  supervisor: '李四',
  crewMembers: ['李四', '王敏', '陈宇'],
  startedAt: '2026-06-22 20:00',
  endedAt: '2026-06-23 08:00',
  status: '待交接',
  remark: 'B2 线 B200 传感模块还剩 180 件；A2 线 D090 连接器物料已齐，下班后可继续。',
};

export const initialShiftWorkOrders: ShiftWorkOrder[] = [
  {
    code: 'MO-20260618-002',
    product: 'FTX-B200 传感模块',
    process: '灌封固化',
    unit: '件',
    planQty: 800,
    goodQty: 610,
    defectQty: 10,
    dueDate: '2026-06-23',
    status: '生产中',
    sourceOrder: 'SO-20260614-017',
    materialStatus: '已备料',
  },
  {
    code: 'MO-20260621-008',
    product: 'FTX-D090 连接器',
    process: '外壳装配',
    unit: '件',
    planQty: 600,
    goodQty: 256,
    defectQty: 4,
    dueDate: '2026-06-24',
    status: '生产中',
    sourceOrder: 'PT-20260620-006',
    materialStatus: '已领料',
  },
  {
    code: 'MO-20260620-003',
    product: 'FTX-A120 控制组件',
    process: '整机组装',
    unit: '件',
    planQty: 1200,
    goodQty: 0,
    defectQty: 0,
    dueDate: '2026-06-25',
    status: '待开工',
    sourceOrder: 'SO-20260617-021',
    materialStatus: '待备料',
  },
  {
    code: 'MO-20260615-006',
    product: 'FTX-C410 成品套件',
    process: '终检包装',
    unit: '套',
    planQty: 600,
    goodQty: 594,
    defectQty: 6,
    dueDate: '2026-06-21',
    status: '已完工',
    sourceOrder: '备货计划-06',
    materialStatus: '已结清',
  },
];

export const initialSelectedWorkOrderCodes = ['MO-20260618-002', 'MO-20260621-008'];

export const initialLineAssignments: LineAssignment[] = [
  {
    lineId: 'L-A1',
    workOrderCode: null,
    leader: '',
    status: '空闲',
  },
  {
    lineId: 'L-A2',
    workOrderCode: 'MO-20260621-008',
    leader: '王敏',
    status: '生产中',
    lastReport: { leader: '王敏', goodQty: 78, defectQty: 2, time: '2026-06-23 07:35' },
  },
  {
    lineId: 'L-B2',
    workOrderCode: 'MO-20260618-002',
    leader: '陈宇',
    status: '生产中',
    lastReport: { leader: '陈宇', goodQty: 118, defectQty: 2, time: '2026-06-23 07:42' },
  },
  {
    lineId: 'L-B3',
    workOrderCode: null,
    leader: '',
    status: '空闲',
  },
  {
    lineId: 'L-P1',
    workOrderCode: null,
    leader: '',
    status: '空闲',
  },
];

export const initialReportRecords: ReportRecord[] = [
  {
    id: 'RPT-001',
    type: '报工',
    shiftRecordNo: 'SRD-20260622-N2',
    lineId: 'L-B2',
    workOrderCode: 'MO-20260618-002',
    goodQty: 118,
    defectQty: 2,
    operator: '李四',
    leader: '陈宇',
    time: '2026-06-23 07:42',
  },
  {
    id: 'RPT-002',
    type: '报工',
    shiftRecordNo: 'SRD-20260622-N2',
    lineId: 'L-A2',
    workOrderCode: 'MO-20260621-008',
    goodQty: 78,
    defectQty: 2,
    operator: '李四',
    leader: '王敏',
    time: '2026-06-23 07:35',
  },
];

export const initialExceptionRecords: LineExceptionRecord[] = [];

export const initialShiftEventLogs: ShiftEventLog[] = [
  {
    id: 'EVT-001',
    category: '交班',
    time: '2026-06-23 08:00',
    actor: '李四',
    title: '夜班交班',
    detail: '交接 B2 线 B200 传感模块、A2 线 D090 连接器，异常记录 0 条。',
    relatedNo: 'SRD-20260622-N2',
  },
  {
    id: 'EVT-002',
    category: '报工',
    time: '2026-06-23 07:42',
    actor: '陈宇',
    title: 'B2 线报工',
    detail: 'MO-20260618-002 良品 118 件，不良 2 件。',
    relatedNo: 'RPT-001',
  },
  {
    id: 'EVT-003',
    category: '报工',
    time: '2026-06-23 07:35',
    actor: '王敏',
    title: 'A2 线报工',
    detail: 'MO-20260621-008 良品 78 件，不良 2 件。',
    relatedNo: 'RPT-002',
  },
];

export const initialShiftHandoverRecords: ShiftHandoverRecord[] = [
  {
    id: 'HOV-20260623-001',
    recordNo: 'SRD-20260622-N2',
    previousRecordNo: 'SRD-20260622-D1',
    shiftName: '夜班',
    supervisor: '李四',
    crewMembers: ['李四', '王敏', '陈宇'],
    startedAt: '2026-06-22 20:00',
    endedAt: '2026-06-23 08:00',
    operator: '李四',
    operatedAt: '2026-06-23 08:00',
    goodQty: 196,
    defectQty: 4,
    exceptionCount: 0,
    remark: 'B2 线 B200 传感模块还剩 180 件；A2 线 D090 连接器物料已齐，下班后可继续。',
    lineSummaries: [
      {
        lineName: 'B2 线',
        workItems: [
          {
            workOrderCode: 'MO-20260618-002',
            product: 'FTX-B200 传感模块',
            goodQty: 118,
            defectQty: 2,
          },
        ],
      },
      {
        lineName: 'A2 线',
        workItems: [
          {
            workOrderCode: 'MO-20260621-008',
            product: 'FTX-D090 连接器',
            goodQty: 78,
            defectQty: 2,
          },
        ],
      },
    ],
  },
];
