export type EquipmentInspectionPage = 'inspection-tasks' | 'inspection-plans' | 'inspection-standards';

export type EquipmentInspectionItem = {
  lineId: string;
  name: string;
  method: string;
  requirement: string;
  result?: '待检查' | '正常' | '异常';
  actual?: string;
  note?: string;
};

export type EquipmentInspectionStandard = {
  code: string;
  name: string;
  equipmentModel: string;
  acceptance: string;
  status: '草稿' | '启用' | '停用';
  revision: number;
  items: EquipmentInspectionItem[];
  note: string;
  updatedAt: string;
  updatedBy?: string;
};

export type EquipmentInspectionPlan = {
  code: string;
  name: string;
  equipmentCode: string;
  equipmentName: string;
  equipmentModel: string;
  location: string;
  standardCode: string;
  standardName: string;
  standardRevision: number;
  frequency: '每日' | '每周' | '每月' | '每季度';
  executionWindow: string;
  firstDueDate: string;
  nextDueDate: string;
  owner: string;
  ownerEmployeeCode: string;
  status: '启用' | '停用';
  revision: number;
  note: string;
  updatedAt: string;
  updatedBy?: string;
};

export type EquipmentInspectionTask = {
  code: string;
  planCode: string;
  planName: string;
  equipmentCode: string;
  equipmentName: string;
  equipmentModel: string;
  location: string;
  standardCode: string;
  standardName: string;
  standardRevision: number;
  scheduledDate: string;
  dueAt: string;
  assignee: string;
  assigneeEmployeeCode: string;
  status: '待巡检' | '巡检中' | '异常处理中' | '已完成' | '已取消';
  result: '待执行' | '正常' | '异常' | '未执行';
  revision: number;
  items: EquipmentInspectionItem[];
  startedAt: string;
  completedAt: string;
  cancelledAt: string;
  cancelReason: string;
  exceptionSummary: string;
  resolution: string;
  updatedAt: string;
  updatedBy?: string;
};

export type EquipmentInspectionRecord =
  | EquipmentInspectionTask
  | EquipmentInspectionPlan
  | EquipmentInspectionStandard;

export type EquipmentInspectionResponse<T extends EquipmentInspectionRecord> = {
  record: T;
  flowRecords?: Array<{
    time: string;
    actor: string;
    action: string;
    remark: string;
  }>;
  generatedTask?: EquipmentInspectionTask | null;
  retainedTask?: EquipmentInspectionTask | null;
  reassignedTaskCount?: number;
  unchanged?: boolean;
};

export const equipmentInspectionPageTitles: Record<EquipmentInspectionPage, string> = {
  'inspection-tasks': '巡检任务',
  'inspection-plans': '巡检计划',
  'inspection-standards': '巡检标准',
};
