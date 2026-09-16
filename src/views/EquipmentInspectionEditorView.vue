<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Pencil,
  Play,
  Plus,
  Save,
  ScrollText,
  Trash2,
  XCircle,
} from 'lucide-vue-next';

import DocumentLoadState from '../components/DocumentLoadState.vue';
import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';
import FlowRecordPanel from '../components/FlowRecordPanel.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import WarehouseActionReasonDialog from '../components/WarehouseActionReasonDialog.vue';
import { requestActionConfirmation } from '../composables/useActionConfirmation';
import { useModulePermission } from '../composables/useModulePermission';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import {
  equipmentInspectionPageTitles,
  type EquipmentInspectionItem,
  type EquipmentInspectionPage,
  type EquipmentInspectionPlan,
  type EquipmentInspectionRecord,
  type EquipmentInspectionStandard,
  type EquipmentInspectionTask,
} from '../data/equipment';
import type { MasterDataRecord } from '../data/masterData';
import {
  createEquipmentInspectionRecord,
  executeEquipmentInspectionTask,
  getEquipmentInspectionRecord,
  listEquipmentInspectionRecords,
  listReference,
  saveEquipmentInspectionRecord,
} from '../services/api';
import { useSessionStore } from '../stores/session';
import type { DocumentStatusItem } from '../types/documentUi';

type FlowRecord = {
  time: string;
  actor: string;
  action: string;
  remark: string;
};

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const { canWrite, readonlyReason } = useModulePermission('equipment');

const record = ref<EquipmentInspectionRecord | null>(null);
const flowRecords = ref<FlowRecord[]>([]);
const equipmentOptions = ref<MasterDataRecord[]>([]);
const employeeOptions = ref<MasterDataRecord[]>([]);
const standardOptions = ref<EquipmentInspectionStandard[]>([]);
const planReferences = ref<EquipmentInspectionPlan[]>([]);
const taskReferences = ref<EquipmentInspectionTask[]>([]);
const isLoading = ref(false);
const loadMessage = ref('');
const isSaving = ref(false);
const flowOpen = ref(false);
const cancelDialogOpen = ref(false);
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const loadedEditableSnapshot = ref('');
let toastTimer: number | undefined;

const activePage = computed<EquipmentInspectionPage>(() => {
  const page = route.params.page?.toString() as EquipmentInspectionPage;
  return page in equipmentInspectionPageTitles ? page : 'inspection-tasks';
});
const pageTitle = computed(() => equipmentInspectionPageTitles[activePage.value]);
const isNew = computed(() => route.path.endsWith('/new'));
const isEdit = computed(() => route.path.endsWith('/edit'));
const isDetail = computed(() => !isNew.value && !isEdit.value);
const isTaskPage = computed(() => activePage.value === 'inspection-tasks');
const task = computed(() => activePage.value === 'inspection-tasks' ? record.value as EquipmentInspectionTask | null : null);
const plan = computed(() => activePage.value === 'inspection-plans' ? record.value as EquipmentInspectionPlan | null : null);
const standard = computed(() => activePage.value === 'inspection-standards' ? record.value as EquipmentInspectionStandard | null : null);
const equipmentModelOptions = computed(() => {
  const seen = new Set<string>();
  return equipmentOptions.value.flatMap((item) => {
    const model = String(item.model || '').trim();
    if (!model || seen.has(model)) return [];
    seen.add(model);
    const equipmentType = item.name.replace(/\s+\d+\s*$/, '');
    return [{ value: model, label: `${model} · ${equipmentType}` }];
  });
});
const selectedPlanEquipment = computed(() => (
  equipmentOptions.value.find((item) => item.code === plan.value?.equipmentCode)
));
const compatibleStandardOptions = computed(() => {
  const equipmentModel = String(selectedPlanEquipment.value?.model || '').trim();
  if (!equipmentModel) return [];
  return standardOptions.value.filter((item) => item.equipmentModel === equipmentModel);
});
const standardSelectPlaceholder = computed(() => {
  if (!plan.value?.equipmentCode) return '请先选择设备';
  if (!compatibleStandardOptions.value.length) return '该设备型号暂无启用标准';
  return '请选择适用标准';
});
const referencingActivePlans = computed(() => (
  standard.value
    ? planReferences.value.filter((item) => item.standardCode === standard.value?.code && item.status === '启用')
    : []
));
const currentPlanTask = computed(() => (
  plan.value
    ? taskReferences.value
      .filter((item) => item.planCode === plan.value?.code && ['待巡检', '巡检中', '异常处理中'].includes(item.status))
      .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate))[0]
    : undefined
));
const standardReferenceLocked = computed(() => isEdit.value && referencingActivePlans.value.length > 0);
const isTaskInputOpen = computed(() => Boolean(task.value && ['巡检中', '异常处理中'].includes(task.value.status) && canWrite.value));
const taskStartAvailable = computed(() => !task.value || task.value.scheduledDate <= today());
const taskStartHint = computed(() => taskStartAvailable.value
  ? '开始现场巡检'
  : `计划日期为 ${task.value?.scheduledDate}，到达计划日期后才能开始`);
const canEditDraft = computed(() => !isTaskPage.value && !isDetail.value && canWrite.value);
const guardEnabled = computed(() => canEditDraft.value || isTaskInputOpen.value);
const { resetUnsavedChanges } = useUnsavedChangesGuard(record, {
  enabled: guardEnabled,
  ready: computed(() => !isLoading.value && Boolean(record.value)),
  message: '当前巡检内容尚未提交，确定离开吗？',
});

const pageHeading = computed(() => {
  if (isNew.value) return `新建${pageTitle.value}`;
  if (isEdit.value) return `编辑${pageTitle.value}`;
  if (task.value) return `${task.value.equipmentName} · ${task.value.code}`;
  return plan.value?.name || standard.value?.name || `${pageTitle.value}详情`;
});
const detailPath = computed(() => record.value
  ? `/equipment/${activePage.value}/${encodeURIComponent(record.value.code)}`
  : `/equipment/${activePage.value}`);
const editPath = computed(() => record.value
  ? `/equipment/${activePage.value}/${encodeURIComponent(record.value.code)}/edit`
  : `/equipment/${activePage.value}`);

function taskEventValue(actionNames: string[], fallbackTime: string, fallbackActor = '') {
  const event = [...flowRecords.value]
    .reverse()
    .find((item) => actionNames.includes(item.action));
  return [event?.actor || fallbackActor, event?.time || fallbackTime].filter(Boolean).join(' · ');
}

const statusItems = computed<DocumentStatusItem[]>(() => {
  if (!task.value) return [];
  const completed = task.value.items.filter((item) => item.result !== '待检查').length;
  const items: DocumentStatusItem[] = [
    { key: 'progress', label: '检查进度', value: `${completed}/${task.value.items.length} 项`, kind: 'metric' },
    { key: 'result', label: '巡检结果', value: task.value.result, kind: 'status' },
  ];
  if (task.value.status === '待巡检' && !taskStartAvailable.value) {
    items.push({ key: 'available', label: '执行提示', value: `${task.value.scheduledDate} 起可开始`, kind: 'text' });
  }
  if (task.value.startedAt) {
    items.push({
      key: 'started',
      label: '开始记录',
      value: taskEventValue(
        ['开始巡检'],
        task.value.startedAt,
        task.value.status === '巡检中' ? task.value.updatedBy : '',
      ),
      kind: 'text',
    });
  }
  if (task.value.status === '异常处理中') {
    items.push({
      key: 'submitted',
      label: '异常提交',
      value: taskEventValue(['提交巡检异常'], task.value.updatedAt, task.value.updatedBy),
      kind: 'text',
    });
  }
  if (task.value.completedAt) {
    const abnormalCompletion = task.value.result === '异常';
    items.push({
      key: 'completed',
      label: abnormalCompletion ? '异常关闭' : '完成记录',
      value: taskEventValue(
        abnormalCompletion ? ['关闭巡检异常'] : ['完成巡检'],
        task.value.completedAt,
        task.value.updatedBy,
      ),
      kind: 'text',
    });
  }
  if (task.value.cancelledAt) {
    items.push({
      key: 'cancelled',
      label: '取消记录',
      value: taskEventValue(['取消巡检任务'], task.value.cancelledAt, task.value.updatedBy),
      kind: 'text',
    });
  }
  return items;
});

const primaryStatus = computed(() => task.value?.status || '待巡检');

function today() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function newItem(): EquipmentInspectionItem {
  const used = new Set((standard.value?.items || []).map((item) => item.lineId));
  let nextIndex = (standard.value?.items.length || 0) + 1;
  while (used.has(`I${nextIndex}`)) nextIndex += 1;
  return { lineId: `I${nextIndex}`, name: '', method: '', requirement: '' };
}

function newStandardDraft(): EquipmentInspectionStandard {
  return {
    code: '系统自动生成',
    name: '',
    equipmentModel: '',
    acceptance: '',
    status: '草稿',
    revision: 0,
    items: [],
    note: '',
    updatedAt: today(),
  };
}

function newPlanDraft(): EquipmentInspectionPlan {
  const defaultOwner = employeeOptions.value.find((item) => item.name === session.user.name)
    || employeeOptions.value[0];
  return {
    code: '系统自动生成',
    name: '',
    equipmentCode: '',
    equipmentName: '',
    equipmentModel: '',
    location: '',
    standardCode: '',
    standardName: '',
    standardRevision: 0,
    frequency: '每日',
    executionWindow: '08:00-17:00',
    firstDueDate: today(),
    nextDueDate: today(),
    owner: defaultOwner?.name || '',
    ownerEmployeeCode: defaultOwner?.code || '',
    status: '启用',
    revision: 0,
    note: '',
    updatedAt: today(),
  };
}

function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function editableRecordSnapshot(value: EquipmentInspectionRecord | null) {
  if (!value) return '';
  if (activePage.value === 'inspection-standards') {
    const current = value as EquipmentInspectionStandard;
    return JSON.stringify({
      name: current.name,
      equipmentModel: current.equipmentModel,
      acceptance: current.acceptance,
      status: current.status,
      items: current.items,
      note: current.note,
    });
  }
  if (activePage.value === 'inspection-plans') {
    const current = value as EquipmentInspectionPlan;
    return JSON.stringify({
      name: current.name,
      equipmentCode: current.equipmentCode,
      standardCode: current.standardCode,
      frequency: current.frequency,
      executionWindow: current.executionWindow,
      firstDueDate: current.firstDueDate,
      ownerEmployeeCode: current.ownerEmployeeCode,
      status: current.status,
      note: current.note,
    });
  }
  return '';
}

function executionWindowIssue(value: string) {
  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return '执行时间窗请按 HH:mm-HH:mm 填写。';
  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  const endMinutes = Number(match[3]) * 60 + Number(match[4]);
  return endMinutes > startMinutes ? '' : '执行时间窗的结束时间必须晚于开始时间。';
}

async function loadReferences() {
  if (!['inspection-plans', 'inspection-standards'].includes(activePage.value)) return;
  const equipmentResponsePromise = listReference<MasterDataRecord>('equipment', { onlyActive: true, limit: 200 });
  if (activePage.value === 'inspection-standards') {
    const [equipmentResponse, plans] = await Promise.all([
      equipmentResponsePromise,
      listEquipmentInspectionRecords('inspection-plans'),
    ]);
    equipmentOptions.value = equipmentResponse.items.map((item) => item.raw);
    planReferences.value = plans;
    taskReferences.value = [];
    return;
  }
  const [equipmentResponse, employeeResponse, standards, tasks] = await Promise.all([
    equipmentResponsePromise,
    listReference<MasterDataRecord>('employees', { onlyActive: true, kind: 'equipment-inspection-owner', limit: 200 }),
    listEquipmentInspectionRecords('inspection-standards'),
    listEquipmentInspectionRecords('inspection-tasks'),
  ]);
  equipmentOptions.value = equipmentResponse.items.map((item) => item.raw);
  employeeOptions.value = employeeResponse.items.map((item) => item.raw);
  standardOptions.value = standards.filter((item) => item.status === '启用');
  taskReferences.value = tasks;
}

async function loadRecord() {
  isLoading.value = true;
  loadMessage.value = '';
  record.value = null;
  flowRecords.value = [];
  try {
    await loadReferences();
    if (isNew.value) {
      record.value = activePage.value === 'inspection-standards' ? newStandardDraft() : newPlanDraft();
    } else {
      const code = route.params.code?.toString();
      if (!code) throw new Error(`${pageTitle.value}不存在`);
      const response = await getEquipmentInspectionRecord(activePage.value, code);
      record.value = cloneRecord(response.record);
      flowRecords.value = response.flowRecords || [];
    }
    await nextTick();
    loadedEditableSnapshot.value = editableRecordSnapshot(record.value);
    resetUnsavedChanges();
  } catch (error) {
    loadMessage.value = error instanceof Error ? error.message : `${pageTitle.value}加载失败`;
  } finally {
    isLoading.value = false;
  }
}

function addStandardItem() {
  if (!standard.value || !canEditDraft.value) return;
  standard.value.items.push(newItem());
}

function removeStandardItem(index: number) {
  if (!standard.value || !canEditDraft.value) return;
  standard.value.items.splice(index, 1);
}

function validationIssue() {
  if (standard.value) {
    if (!standard.value.name.trim()) return '请填写巡检标准名称。';
    if (!standard.value.equipmentModel.trim()) return '请选择适用设备型号。';
    if (standard.value.status === '启用') {
      if (!standard.value.acceptance.trim()) return '启用巡检标准前，请填写整体合格条件。';
      if (!standard.value.items.length || standard.value.items.some((item) => (
        !item.name.trim() || !item.method.trim() || !item.requirement.trim()
      ))) return '启用巡检标准前，请完整填写每个检查项目的名称、方法和判定要求。';
    }
    const itemNames = standard.value.items.map((item) => item.name.trim().toLowerCase()).filter(Boolean);
    if (new Set(itemNames).size !== itemNames.length) return '检查项目名称不能重复，请合并后保存。';
  }
  if (plan.value) {
    if (!plan.value.name.trim()) return '请填写巡检计划名称。';
    if (!plan.value.equipmentCode) return '请选择设备。';
    if (!plan.value.standardCode) return '请选择已启用的巡检标准。';
    if (!compatibleStandardOptions.value.some((item) => item.code === plan.value?.standardCode)) {
      return `所选巡检标准不适用于设备型号 ${selectedPlanEquipment.value?.model || '未维护'}。`;
    }
    if (!plan.value.executionWindow.trim()) return '请填写执行时间窗。';
    const windowIssue = executionWindowIssue(plan.value.executionWindow);
    if (windowIssue) return windowIssue;
    if (!plan.value.firstDueDate) return '请选择首次计划日期。';
    if (isNew.value && plan.value.firstDueDate < today()) return '首次计划日期不能早于今天。';
    if (!plan.value.ownerEmployeeCode) return '请选择负责人。';
  }
  return '';
}

watch(() => plan.value?.equipmentCode, (equipmentCode, previousEquipmentCode) => {
  if (!plan.value || !previousEquipmentCode || equipmentCode === previousEquipmentCode || !plan.value.standardCode) return;
  if (compatibleStandardOptions.value.some((item) => item.code === plan.value?.standardCode)) return;
  plan.value.standardCode = '';
  showToast('设备型号已变化，请重新选择适用的巡检标准。');
});

async function saveRecord() {
  if (isSaving.value || !canWrite.value) return;
  const issue = validationIssue();
  if (issue) {
    showToast(issue, 'error');
    return;
  }
  if (!isNew.value && editableRecordSnapshot(record.value) === loadedEditableSnapshot.value) {
    showToast('当前没有需要保存的修改。');
    return;
  }
  if (standard.value && standardReferenceLocked.value) {
    const confirmed = await requestActionConfirmation({
      title: `保存标准新修订 R${Number(standard.value.revision || 0) + 1}？`,
      message: `该标准正被 ${referencingActivePlans.value.length} 个启用计划引用。保存后，之后生成的任务采用新修订；已生成任务继续使用原快照。`,
      confirmLabel: '保存新修订',
      tone: 'warning',
    });
    if (!confirmed) return;
  }
  isSaving.value = true;
  try {
    if (standard.value) {
      const response = isNew.value
        ? await createEquipmentInspectionRecord('inspection-standards', standard.value)
        : await saveEquipmentInspectionRecord('inspection-standards', standard.value);
      record.value = cloneRecord(response.record);
      flowRecords.value = response.flowRecords || [];
      if (response.unchanged) showToast('当前没有需要保存的修改。');
    } else if (plan.value) {
      const response = isNew.value
        ? await createEquipmentInspectionRecord('inspection-plans', plan.value)
        : await saveEquipmentInspectionRecord('inspection-plans', plan.value);
      record.value = cloneRecord(response.record);
      flowRecords.value = response.flowRecords || [];
      if (response.generatedTask) {
        showToast(`计划已保存，并生成任务 ${response.generatedTask.code}`);
      } else if (response.retainedTask) {
        showToast(`计划已启用，继续执行未完成任务 ${response.retainedTask.code}`);
      } else if (response.reassignedTaskCount) {
        showToast(`计划已保存，并同步改派 ${response.reassignedTaskCount} 个待巡检任务`);
      }
    }
    await nextTick();
    loadedEditableSnapshot.value = editableRecordSnapshot(record.value);
    resetUnsavedChanges();
    if (!toastMessage.value) showToast(`${record.value?.code} 已保存`);
    await router.replace(detailPath.value);
  } catch (error) {
    showToast(error instanceof Error ? error.message : `${pageTitle.value}保存失败`, 'error');
  } finally {
    isSaving.value = false;
  }
}

async function executeTask(action: 'start' | 'complete' | 'resolve') {
  if (!task.value || isSaving.value || !canWrite.value) return;
  if (action === 'start' && !taskStartAvailable.value) {
    showToast(`任务计划日期为 ${task.value.scheduledDate}，计划日期到达后才能开始巡检。`, 'error');
    return;
  }
  if (action === 'complete') {
    if (task.value.items.some((item) => item.result === '待检查')) {
      showToast('请先完成全部巡检项目的判定。', 'error');
      return;
    }
    const incompleteAbnormalItem = task.value.items.find((item) => (
      item.result === '异常' && !item.actual?.trim() && !item.note?.trim()
    ));
    if (incompleteAbnormalItem) {
      showToast(`检查项目“${incompleteAbnormalItem.name}”判定异常时，请填写实测情况或备注。`, 'error');
      return;
    }
    const hasAbnormalItems = task.value.items.some((item) => item.result === '异常');
    if (hasAbnormalItems && !task.value.exceptionSummary.trim()) {
      showToast('存在异常项目，请填写异常概述。', 'error');
      return;
    }
    if (!hasAbnormalItems) task.value.exceptionSummary = '';
  }
  if (action === 'resolve' && !task.value.resolution.trim()) {
    showToast('请填写异常处理结果。', 'error');
    return;
  }

  const actionCopy = {
    start: {
      title: `开始巡检 ${task.value.code}？`,
      message: '开始后任务进入巡检中，请逐项记录检查结果。',
      confirmLabel: '开始巡检',
      tone: 'warning' as const,
    },
    complete: {
      title: `提交 ${task.value.code} 的巡检结果？`,
      message: task.value.items.some((item) => item.result === '异常')
        ? '存在异常项目，提交后任务将进入异常处理中。'
        : '全部项目正常，提交后任务完成并生成下一周期任务。',
      confirmLabel: '确认提交',
      tone: 'warning' as const,
    },
    resolve: {
      title: `关闭 ${task.value.code} 的巡检异常？`,
      message: '确认现场异常已经处理并具备关闭条件；处理结果将保留在巡检记录中。',
      confirmLabel: '确认关闭',
      tone: 'danger' as const,
    },
  }[action];
  const confirmed = await requestActionConfirmation(actionCopy);
  if (!confirmed) return;

  isSaving.value = true;
  try {
    const response = await executeEquipmentInspectionTask(task.value, action);
    record.value = cloneRecord(response.record);
    flowRecords.value = response.flowRecords || [];
    await nextTick();
    resetUnsavedChanges();
    showToast(action === 'start'
      ? '巡检已开始'
      : action === 'complete'
        ? response.record.status === '异常处理中' ? '异常结果已提交，等待处理' : '巡检已完成'
        : '巡检异常已关闭');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '巡检任务操作失败', 'error');
  } finally {
    isSaving.value = false;
  }
}

async function cancelTask(cancelReason: string) {
  if (!task.value || task.value.status !== '待巡检' || isSaving.value || !canWrite.value) return;
  isSaving.value = true;
  try {
    const response = await executeEquipmentInspectionTask(
      { ...task.value, cancelReason },
      'cancel',
    );
    record.value = cloneRecord(response.record);
    flowRecords.value = response.flowRecords || [];
    cancelDialogOpen.value = false;
    await nextTick();
    resetUnsavedChanges();
    showToast(response.generatedTask
      ? `本次任务已取消，已生成下一任务 ${response.generatedTask.code}`
      : '本次巡检任务已取消');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '巡检任务取消失败', 'error');
  } finally {
    isSaving.value = false;
  }
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2400);
}

watch(() => route.fullPath, loadRecord, { immediate: true });
onBeforeUnmount(() => window.clearTimeout(toastTimer));
</script>

<template>
  <div class="page-stack">
    <section v-if="record" class="quote-editor equipment-inspection-editor" :class="{ 'is-detail-view': isDetail }">
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" :to="`/equipment/${activePage}`" :aria-label="`返回${pageTitle}列表`" :title="`返回${pageTitle}列表`">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ pageHeading }}</strong>
        </template>

        <template #actions>
          <button v-if="flowRecords.length" class="secondary-action" type="button" title="查看操作日志" @click="flowOpen = true">
            <ScrollText :size="15" />
            日志
          </button>
          <template v-if="isTaskPage && task">
            <template v-if="task.status === '待巡检'">
              <button
                class="secondary-action danger-action"
                type="button"
                :disabled="!canWrite || isSaving"
                :title="canWrite ? '填写原因并取消本次任务' : readonlyReason"
                @click="cancelDialogOpen = true"
              >
                <XCircle :size="15" />
                取消任务
              </button>
              <button
                class="primary-action"
                type="button"
                :disabled="!canWrite || isSaving || !taskStartAvailable"
                :title="canWrite ? taskStartHint : readonlyReason"
                @click="executeTask('start')"
              >
                <Play :size="15" />
                开始巡检
              </button>
            </template>
            <button
              v-else-if="task.status === '巡检中'"
              class="primary-action"
              type="button"
              :disabled="!canWrite || isSaving"
              :title="canWrite ? '提交巡检结果' : readonlyReason"
              @click="executeTask('complete')"
            >
              <ClipboardCheck :size="15" />
              提交结果
            </button>
            <button
              v-else-if="task.status === '异常处理中'"
              class="primary-action"
              type="button"
              :disabled="!canWrite || isSaving"
              :title="canWrite ? '确认异常处理完成' : readonlyReason"
              @click="executeTask('resolve')"
            >
              <CheckCircle2 :size="15" />
              关闭异常
            </button>
          </template>
          <template v-else-if="isDetail">
            <RouterLink
              class="secondary-action"
              :class="{ 'is-disabled': !canWrite }"
              :aria-disabled="!canWrite"
              :to="canWrite ? editPath : route.fullPath"
              :title="canWrite ? `编辑${pageTitle}` : readonlyReason"
            >
              <Pencil :size="15" />
              编辑
            </RouterLink>
          </template>
          <template v-else>
            <RouterLink class="secondary-action" :to="isNew ? `/equipment/${activePage}` : detailPath" title="取消并返回">取消</RouterLink>
            <button class="primary-action" type="button" :disabled="!canWrite || isSaving" :title="canWrite ? `保存${pageTitle}` : readonlyReason" @click="saveRecord">
              <Save :size="15" />
              {{ isSaving ? '保存中…' : '保存' }}
            </button>
          </template>
        </template>

        <template #fallback>
          <div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1></div></div>
        </template>
      </PageTopbarPortal>

      <OperationPermissionBanner v-if="!canWrite" :message="readonlyReason" :suffix="`当前${pageTitle}仅可查看。`" />

      <div class="quote-form-grid" :class="{ 'is-rule-layout': !task }">
        <div class="quote-main-sections">
          <section v-if="task" class="form-section">
            <div class="form-section-head">
              <h2>任务与设备</h2>
              <i class="mini-status status-neutral">{{ task.code }}</i>
            </div>
            <dl class="equipment-fact-grid">
              <div><dt>设备</dt><dd><RouterLink :to="`/master-data/equipment/${encodeURIComponent(task.equipmentCode)}`">{{ task.equipmentName }}</RouterLink></dd></div>
              <div><dt>型号</dt><dd>{{ task.equipmentModel || '—' }}</dd></div>
              <div><dt>使用位置</dt><dd>{{ task.location || '—' }}</dd></div>
              <div><dt>任务负责人</dt><dd>{{ task.assignee || '—' }}</dd></div>
              <div><dt>来源计划</dt><dd><RouterLink :to="`/equipment/inspection-plans/${encodeURIComponent(task.planCode)}`">{{ task.planName }}</RouterLink></dd></div>
              <div><dt>执行标准</dt><dd><RouterLink :to="`/equipment/inspection-standards/${encodeURIComponent(task.standardCode)}`">{{ task.standardName }}</RouterLink> · R{{ task.standardRevision }}</dd></div>
              <div><dt>计划日期</dt><dd>{{ task.scheduledDate }}</dd></div>
              <div><dt>完成时限</dt><dd>{{ task.dueAt }}</dd></div>
            </dl>
          </section>

          <section v-if="task" class="form-section">
            <div class="form-section-head">
              <h2>巡检项目</h2>
              <span class="section-helper">以下按任务生成时的 R{{ task.standardRevision }} 标准执行，后续修订不影响本次记录。</span>
            </div>
            <div class="inspection-item-table">
              <div class="inspection-item-head">
                <span>检查项目 / 方法</span>
                <span>判定要求</span>
                <span>结果</span>
                <span>实测情况</span>
                <span>备注</span>
              </div>
              <div v-for="(item, index) in task.items" :key="item.lineId" class="inspection-item-row">
                <span class="inspection-item-name">
                  <strong>{{ String(index + 1).padStart(2, '0') }} · {{ item.name }}</strong>
                  <small>{{ item.method }}</small>
                </span>
                <span class="inspection-requirement">{{ item.requirement }}</span>
                <template v-if="task.status === '巡检中' && canWrite">
                  <label class="form-field compact-field">
                    <span class="mobile-field-label">结果</span>
                    <select v-model="item.result">
                      <option value="待检查">待检查</option>
                      <option value="正常">正常</option>
                      <option value="异常">异常</option>
                    </select>
                  </label>
                  <label class="form-field compact-field">
                    <span class="mobile-field-label">实测情况</span>
                    <input v-model="item.actual" type="text" placeholder="填写观察或实测结果" />
                  </label>
                  <label class="form-field compact-field">
                    <span class="mobile-field-label">备注</span>
                    <input v-model="item.note" type="text" placeholder="异常时填写补充说明" />
                  </label>
                </template>
                <template v-else>
                  <span class="inspection-readonly-value"><i class="mini-status" :class="item.result === '异常' ? 'status-alert' : item.result === '正常' ? 'status-success' : 'status-neutral'">{{ item.result || '待检查' }}</i></span>
                  <span class="inspection-readonly-value">{{ item.actual || '—' }}</span>
                  <span class="inspection-readonly-value muted">{{ item.note || '—' }}</span>
                </template>
              </div>
            </div>
          </section>

          <section
            v-if="task && (task.items.some((item) => item.result === '异常') || (task.status !== '巡检中' && task.exceptionSummary))"
            class="form-section"
          >
            <div class="form-section-head"><h2>异常概述</h2></div>
            <div v-if="task.status === '巡检中' && canWrite" class="quote-fields">
              <label class="form-field full-field">
                <span :class="{ 'required-label': task.items.some((item) => item.result === '异常') }">异常概述</span>
                <textarea v-model="task.exceptionSummary" rows="3" :readonly="task.status !== '巡检中' || !canWrite" placeholder="存在异常项目时，说明异常现象及现场控制措施"></textarea>
              </label>
            </div>
            <p v-else class="equipment-note">{{ task.exceptionSummary }}</p>
          </section>

          <section v-if="task && task.status === '异常处理中'" class="form-section equipment-exception-section">
            <div class="form-section-head">
              <h2>异常处理结果</h2>
              <i class="mini-status status-alert">关闭前必填</i>
            </div>
            <label class="form-field">
              <span class="required-label">处理结果</span>
              <textarea v-model="task.resolution" rows="4" :readonly="!canWrite" placeholder="填写原因、处理措施、验证结果及设备是否恢复使用"></textarea>
            </label>
          </section>

          <section v-if="task && task.status === '已完成' && task.resolution" class="form-section">
            <div class="form-section-head"><h2>异常关闭结果</h2></div>
            <p class="equipment-note">{{ task.resolution }}</p>
          </section>

          <section v-if="task && task.status === '已取消'" class="form-section">
            <div class="form-section-head"><h2>取消说明</h2></div>
            <p class="equipment-note">{{ task.cancelReason || '未登记取消原因' }}</p>
          </section>

          <section v-if="plan" class="form-section">
            <div class="form-section-head">
              <h2>计划信息</h2>
              <i class="mini-status status-neutral">{{ plan.status }}</i>
            </div>
            <dl v-if="isDetail" class="equipment-fact-grid">
              <div><dt>计划编号</dt><dd>{{ plan.code }}</dd></div>
              <div><dt>计划名称</dt><dd>{{ plan.name }}</dd></div>
              <div><dt>设备</dt><dd><RouterLink :to="`/master-data/equipment/${encodeURIComponent(plan.equipmentCode)}`">{{ plan.equipmentName }}</RouterLink></dd></div>
              <div><dt>设备位置</dt><dd>{{ plan.location || '—' }}</dd></div>
              <div><dt>巡检标准</dt><dd><RouterLink :to="`/equipment/inspection-standards/${encodeURIComponent(plan.standardCode)}`">{{ plan.standardName }}</RouterLink></dd></div>
              <div><dt>当前标准修订</dt><dd>R{{ plan.standardRevision || 1 }}</dd></div>
              <div><dt>任务负责人</dt><dd>{{ plan.owner }}</dd></div>
              <div><dt>巡检频次</dt><dd>{{ plan.frequency }}</dd></div>
              <div><dt>执行时间窗</dt><dd>{{ plan.executionWindow }}</dd></div>
              <div><dt>首次计划</dt><dd>{{ plan.firstDueDate }}</dd></div>
              <div v-if="currentPlanTask"><dt>当前任务</dt><dd><RouterLink :to="`/equipment/inspection-tasks/${encodeURIComponent(currentPlanTask.code)}`">{{ currentPlanTask.code }}</RouterLink> · {{ currentPlanTask.status }} · {{ currentPlanTask.scheduledDate }}</dd></div>
              <div v-else><dt>下一计划日期</dt><dd>{{ plan.nextDueDate || '—' }}</dd></div>
              <div v-if="plan.note" class="is-wide"><dt>执行要求</dt><dd>{{ plan.note }}</dd></div>
            </dl>
            <div v-else class="quote-fields equipment-fields">
              <label class="form-field">
                <span>计划编号</span>
                <input :value="plan.code" type="text" readonly />
              </label>
              <label class="form-field">
                <span class="required-label">计划名称</span>
                <input v-model="plan.name" type="text" placeholder="例如：挤出机 01 每日巡检" />
              </label>
              <label class="form-field">
                <span class="required-label">设备</span>
                <select v-model="plan.equipmentCode">
                  <option value="">请选择设备</option>
                  <option v-for="option in equipmentOptions" :key="option.code" :value="option.code">{{ option.name }} · {{ option.code }}</option>
                </select>
              </label>
              <label class="form-field">
                <span class="required-label">巡检标准</span>
                <select v-model="plan.standardCode" :disabled="!plan.equipmentCode || !compatibleStandardOptions.length">
                  <option value="">{{ standardSelectPlaceholder }}</option>
                  <option v-for="option in compatibleStandardOptions" :key="option.code" :value="option.code">{{ option.name }} · R{{ option.revision }} · {{ option.code }}</option>
                </select>
              </label>
              <label class="form-field">
                <span class="required-label">巡检频次</span>
                <select v-model="plan.frequency">
                  <option value="每日">每日</option>
                  <option value="每周">每周</option>
                  <option value="每月">每月</option>
                  <option value="每季度">每季度</option>
                </select>
              </label>
              <label class="form-field">
                <span class="required-label">执行时间窗</span>
                <input v-model="plan.executionWindow" type="text" inputmode="numeric" placeholder="例如：08:00-10:00" />
              </label>
              <label class="form-field">
                <span class="required-label">{{ isEdit ? '首次计划日期（已冻结）' : '首次计划日期' }}</span>
                <input
                  v-model="plan.firstDueDate"
                  type="date"
                  :disabled="!isNew"
                  :title="isNew ? '设置计划首次生成任务的日期' : '首次计划日期已冻结，后续排期以下次任务为准'"
                />
              </label>
              <label class="form-field">
                <span class="required-label">任务负责人</span>
                <select v-model="plan.ownerEmployeeCode">
                  <option value="">请选择可执行人员</option>
                  <option v-for="option in employeeOptions" :key="option.code" :value="option.code">{{ option.name }} · {{ option.owner || option.code }}</option>
                </select>
              </label>
              <label class="form-field">
                <span>使用状态</span>
                <select v-model="plan.status">
                  <option value="启用">启用</option>
                  <option value="停用">停用</option>
                </select>
              </label>
              <label class="form-field full-field">
                <span>执行要求</span>
                <textarea v-model="plan.note" rows="3" placeholder="填写班次、停机条件或其他执行说明"></textarea>
              </label>
              <p v-if="isEdit && currentPlanTask" class="equipment-edit-hint full-field">
                当前未完成任务
                <RouterLink :to="`/equipment/inspection-tasks/${encodeURIComponent(currentPlanTask.code)}`">{{ currentPlanTask.code }}</RouterLink>
                （{{ currentPlanTask.status }} · {{ currentPlanTask.scheduledDate }}）保留原设备、标准和时限；负责人变更会同步尚未开始的待巡检任务。停用计划只停止后续生成，当前待巡检任务需在任务详情单独取消。
              </p>
              <p v-else-if="isEdit" class="equipment-edit-hint full-field">
                设备、标准、频次和执行时限调整只影响之后生成的任务；负责人变更仅同步尚未开始的待巡检任务。
              </p>
            </div>
          </section>

          <section v-if="standard" class="form-section">
            <div class="form-section-head">
              <h2>标准信息</h2>
              <i class="mini-status status-neutral">{{ standard.status }}</i>
            </div>
            <dl v-if="isDetail" class="equipment-fact-grid">
              <div><dt>标准编号</dt><dd>{{ standard.code }}</dd></div>
              <div><dt>标准名称</dt><dd>{{ standard.name }}</dd></div>
              <div><dt>适用设备型号</dt><dd>{{ standard.equipmentModel }}</dd></div>
              <div><dt>当前修订</dt><dd>R{{ standard.revision }}</dd></div>
              <div><dt>启用计划</dt><dd>{{ referencingActivePlans.length ? `${referencingActivePlans.length} 个` : '未引用' }}</dd></div>
              <div><dt>最近维护</dt><dd>{{ standard.updatedAt }} · {{ standard.updatedBy || '—' }}</dd></div>
              <div class="is-wide"><dt>整体合格条件</dt><dd>{{ standard.acceptance || '未维护' }}</dd></div>
              <div v-if="standard.note" class="is-wide"><dt>使用说明</dt><dd>{{ standard.note }}</dd></div>
            </dl>
            <div v-else class="quote-fields equipment-fields">
              <label class="form-field">
                <span>标准编号</span>
                <input :value="standard.code" type="text" readonly />
              </label>
              <label class="form-field">
                <span>当前修订</span>
                <input :value="`R${standard.revision || 0}${isEdit ? `（内容变更后升至 R${Number(standard.revision || 0) + 1}）` : ''}`" type="text" readonly />
              </label>
              <label class="form-field">
                <span class="required-label">标准名称</span>
                <input v-model="standard.name" type="text" placeholder="填写巡检标准名称" />
              </label>
              <label class="form-field">
                <span class="required-label">适用设备型号</span>
                <select v-model="standard.equipmentModel" :disabled="standardReferenceLocked">
                  <option value="">请选择设备型号</option>
                  <option v-for="option in equipmentModelOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </label>
              <label class="form-field full-field">
                <span :class="{ 'required-label': standard.status === '启用' }">整体合格条件</span>
                <textarea v-model="standard.acceptance" rows="2" placeholder="填写整体合格和停止使用条件"></textarea>
              </label>
              <label class="form-field">
                <span>使用状态</span>
                <select v-model="standard.status" :disabled="standardReferenceLocked">
                  <option value="草稿">草稿</option>
                  <option value="启用">启用</option>
                  <option value="停用">停用</option>
                </select>
              </label>
              <label class="form-field full-field">
                <span>使用说明</span>
                <textarea v-model="standard.note" rows="3" placeholder="填写使用范围、风险提示或其他说明"></textarea>
              </label>
              <p v-if="standard.status !== '启用'" class="equipment-edit-hint full-field">
                当前可分步维护并保存；启用前必须补齐整体合格条件，以及每个检查项目的名称、方法和判定要求。
              </p>
              <p v-if="standardReferenceLocked" class="equipment-edit-hint full-field">
                当前由 {{ referencingActivePlans.length }} 个启用计划引用，适用型号和状态已锁定。有内容变更时形成 R{{ Number(standard.revision || 0) + 1 }} 修订并用于之后生成的任务；无变化不升版，已生成任务继续使用原标准快照。
              </p>
            </div>
          </section>

          <section v-if="standard && isDetail && referencingActivePlans.length" class="form-section">
            <div class="form-section-head">
              <h2>引用计划</h2>
              <span class="section-helper">当前启用计划</span>
            </div>
            <div class="equipment-reference-list">
              <RouterLink
                v-for="reference in referencingActivePlans"
                :key="reference.code"
                :to="`/equipment/inspection-plans/${encodeURIComponent(reference.code)}`"
              >
                <span><strong>{{ reference.name }}</strong><small>{{ reference.code }} · {{ reference.equipmentName }}</small></span>
                <span><strong>{{ reference.frequency }} · {{ reference.executionWindow }}</strong><small>{{ reference.owner }} · 任务日期 {{ reference.nextDueDate || reference.firstDueDate }}</small></span>
              </RouterLink>
            </div>
          </section>

          <section v-if="standard" class="form-section">
            <div class="form-section-head">
              <h2>检查项目</h2>
              <button v-if="!isDetail" class="secondary-action compact-action" type="button" title="添加检查项目" @click="addStandardItem">
                <Plus :size="15" />
                添加
              </button>
            </div>
            <div class="standard-item-table" :class="{ 'is-editing': !isDetail }">
              <div class="standard-item-head">
                <span>检查项目</span>
                <span>检查方法</span>
                <span>判定要求</span>
                <span v-if="!isDetail"></span>
              </div>
              <div v-for="(item, index) in standard.items" :key="item.lineId" class="standard-item-row">
                <template v-if="isDetail">
                  <span class="standard-item-name">
                    <small>{{ String(index + 1).padStart(2, '0') }}</small>
                    <strong>{{ item.name }}</strong>
                  </span>
                  <span class="standard-item-copy"><small>检查方法</small>{{ item.method }}</span>
                  <span class="standard-item-copy"><small>判定要求</small>{{ item.requirement }}</span>
                </template>
                <template v-else>
                  <label class="form-field compact-field">
                    <span>{{ String(index + 1).padStart(2, '0') }}</span>
                    <input v-model="item.name" type="text" placeholder="检查项目" />
                  </label>
                  <label class="form-field compact-field">
                    <span class="mobile-field-label">检查方法</span>
                    <input v-model="item.method" type="text" placeholder="如何检查" />
                  </label>
                  <label class="form-field compact-field">
                    <span class="mobile-field-label">判定要求</span>
                    <input v-model="item.requirement" type="text" placeholder="可直接判定的要求" />
                  </label>
                  <button class="icon-button danger" type="button" aria-label="删除检查项目" title="删除检查项目" @click="removeStandardItem(index)">
                    <Trash2 :size="15" />
                  </button>
                </template>
              </div>
              <div v-if="!standard.items.length" class="equipment-empty-items">
                暂无检查项目；草稿可以稍后补充，启用前至少需要一项完整检查项目。
              </div>
            </div>
          </section>

        </div>

        <aside v-if="task" class="quote-summary-panel">
          <section class="summary-section">
            <DocumentStatusPanel title="任务状态" :primary-status="primaryStatus" :items="statusItems" :aria-label="`${pageTitle}状态与进度`" />
          </section>
        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      :title="pageTitle"
      :message="loadMessage || `${pageTitle}不存在`"
      :back-path="`/equipment/${activePage}`"
      :back-label="`返回${pageTitle}`"
      @retry="loadRecord"
    />

    <FlowRecordPanel
      :open="flowOpen"
      :title="`${record?.code || pageTitle} 操作日志`"
      :records="flowRecords"
      empty-text="暂无操作日志"
      @close="flowOpen = false"
    />

    <WarehouseActionReasonDialog
      :open="cancelDialogOpen"
      title="取消本次巡检任务"
      :record-code="task?.code || ''"
      record-label="巡检任务"
      return-label="返回巡检任务"
      note="取消后本次任务保留为已取消；若来源计划仍启用，系统会按频次生成下一任务。若要停止后续巡检，请先停用来源计划。"
      reason-label="取消原因"
      placeholder="说明设备停用、计划调整、重复任务或其他取消原因"
      submit-label="确认取消"
      pending-label="取消中…"
      :pending="isSaving"
      danger
      @close="cancelDialogOpen = false"
      @submit="cancelTask"
    />

    <div
      v-if="toastMessage"
      class="app-toast"
      :class="{ error: toastTone === 'error' }"
      :role="toastTone === 'error' ? 'alert' : 'status'"
    >
      {{ toastMessage }}
    </div>
  </div>
</template>

<style scoped>
.quote-form-grid.is-rule-layout {
  grid-template-columns: minmax(0, 1fr);
}

.equipment-fact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  overflow: hidden;
  border: 1px solid #e3e6df;
  border-radius: 10px;
  background: #fff;
}

.equipment-fact-grid > div {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 12px 14px;
  border-top: 1px solid #eceee9;
  border-left: 1px solid #eceee9;
}

.equipment-fact-grid > div:nth-child(-n + 2) { border-top: 0; }
.equipment-fact-grid > div:nth-child(odd) { border-left: 0; }
.equipment-fact-grid > div.is-wide { grid-column: 1 / -1; border-left: 0; }
.equipment-fact-grid dt { color: var(--muted); font-size: 11px; font-weight: 650; }
.equipment-fact-grid dd { margin: 0; color: var(--text); font-size: 13px; font-weight: 680; line-height: 1.55; overflow-wrap: anywhere; }
.equipment-fact-grid a { color: #315f43; text-decoration: none; text-underline-offset: 3px; }
.equipment-fact-grid a:hover { text-decoration: underline; }

.equipment-fields {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.equipment-reference-list {
  display: grid;
  overflow: hidden;
  border: 1px solid #e3e6df;
  border-radius: 10px;
  background: #fff;
}

.equipment-reference-list > a {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr);
  gap: 20px;
  padding: 13px 14px;
  color: inherit;
  border-top: 1px solid #eceee9;
  text-decoration: none;
  transition: background-color 140ms ease;
}

.equipment-reference-list > a:first-child { border-top: 0; }
.equipment-reference-list > a:hover,
.equipment-reference-list > a:focus-visible { outline: 0; background: #f8faf7; }
.equipment-reference-list span { display: grid; gap: 3px; min-width: 0; }
.equipment-reference-list strong { color: var(--text); font-size: 13px; line-height: 1.45; }
.equipment-reference-list small { color: var(--muted); font-size: 11px; line-height: 1.45; }

.inspection-item-table,
.standard-item-table {
  overflow-x: auto;
  border: 1px solid #e3e6df;
  border-radius: 10px;
  background: #fff;
}

.inspection-item-head,
.inspection-item-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) minmax(104px, .5fr) minmax(170px, .9fr) minmax(160px, .8fr);
  align-items: center;
  min-width: 900px;
}

.inspection-readonly-value {
  min-width: 0;
  padding: 11px 12px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.inspection-readonly-value.muted { color: var(--muted); }

.standard-item-head,
.standard-item-row {
  display: grid;
  grid-template-columns: minmax(180px, .8fr) minmax(220px, 1fr) minmax(260px, 1.2fr);
  align-items: center;
  min-width: 700px;
}

.standard-item-table.is-editing .standard-item-head,
.standard-item-table.is-editing .standard-item-row {
  grid-template-columns: minmax(180px, .8fr) minmax(220px, 1fr) minmax(260px, 1.2fr) 44px;
}

.inspection-item-head,
.standard-item-head {
  min-height: 38px;
  color: var(--muted);
  background: #f7f8f5;
  font-size: 11px;
  font-weight: 700;
}

.inspection-item-head > span,
.standard-item-head > span,
.inspection-item-row > *,
.standard-item-row > * {
  min-width: 0;
  padding: 9px 12px;
}

.inspection-item-row,
.standard-item-row {
  border-top: 1px solid #eceee9;
}

.equipment-empty-items {
  padding: 22px 16px;
  color: var(--muted);
  border-top: 1px solid #eceee9;
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
}

.inspection-item-name {
  display: grid;
  gap: 4px;
}

.standard-item-name,
.standard-item-copy {
  display: grid;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.standard-item-name strong {
  color: var(--text);
  font-size: 12px;
}

.standard-item-name small,
.standard-item-copy small {
  display: none;
  color: var(--muted);
  font-size: 10px;
  font-weight: 650;
}

.inspection-item-name strong {
  color: var(--text);
  font-size: 12px;
}

.inspection-item-name small,
.inspection-requirement {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.compact-field {
  gap: 4px;
  padding: 8px 6px 8px 12px;
}

.compact-field input,
.compact-field select {
  min-height: 34px;
}

.compact-field input[readonly],
.compact-field select:disabled {
  color: var(--text-secondary);
  border-color: transparent;
  background: transparent;
  opacity: 1;
}

.standard-item-row .icon-button {
  align-self: end;
  margin: 0 8px 8px 0;
  padding: 0;
}

.mobile-field-label {
  display: none;
}

.equipment-note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.equipment-edit-hint {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #dedfd8;
  border-radius: 8px;
  background: #f6f6f2;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.equipment-exception-section {
  border-color: #e9d7d2;
  background: #fffdfc;
}

@media (max-width: 760px) {
  .equipment-reference-list > a {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .equipment-fields,
  .equipment-fact-grid {
    grid-template-columns: 1fr;
  }

  .equipment-fact-grid > div,
  .equipment-fact-grid > div:nth-child(-n + 2) {
    border-top: 1px solid #eceee9;
    border-left: 0;
  }

  .equipment-fact-grid > div:first-child {
    border-top: 0;
  }

  .inspection-item-head,
  .standard-item-head {
    display: none;
  }

  .inspection-item-row,
  .standard-item-row,
  .standard-item-table.is-editing .standard-item-row {
    grid-template-columns: 1fr;
    min-width: 0;
    padding: 8px;
  }

  .mobile-field-label {
    display: inline;
  }

  .standard-item-name small,
  .standard-item-copy small {
    display: inline;
  }

  .standard-item-row .icon-button {
    justify-self: end;
  }
}
</style>
