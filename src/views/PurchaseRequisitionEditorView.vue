<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
} from 'lucide-vue-next';

import DocumentLoadState from '../components/DocumentLoadState.vue';
import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';
import FlowRecordPanel from '../components/FlowRecordPanel.vue';
import MaterialIdentity from '../components/MaterialIdentity.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import QuantityWithUnitInput from '../components/QuantityWithUnitInput.vue';
import ReferencePicker from '../components/ReferencePicker.vue';
import { DEFAULT_COMPANY_CODE, DEFAULT_COMPANY_NAME } from '../constants/company';
import { requestActionConfirmation } from '../composables/useActionConfirmation';
import { useAsyncActionState } from '../composables/useAsyncActionState';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import { useSessionStore } from '../stores/session';
import { purchaseMaterialVisuals } from '../data/purchase';
import {
  deletePurchaseRequisition,
  getPurchaseRequisition,
  listPurchaseOrders,
  savePurchaseRequisition,
  submitPurchaseRequisition,
} from '../services/api';
import type {
  FlowRecord,
  PurchaseOrder,
  PurchaseRequisition,
  PurchaseRequisitionProduct,
  ReferenceOption,
} from '../types/business';
import type { DocumentStatusItem } from '../types/documentUi';
import { productIdentity, productQtyWithUnit } from '../utils/productDisplay';
import { attachmentsFromFileList } from '../utils/attachmentUpload';
import { scrollElementIntoView } from '../utils/focusNavigation';
import {
  purchaseRequisitionSourceKind as sourceKindForRequisition,
  purchaseRequisitionSourceLinks as sourceLinksForRequisition,
} from '../utils/purchaseRequisitionSource';

type MaterialReference = {
  code: string;
  name: string;
  model?: string;
  spec?: string;
  uom?: string;
  imageLabel?: string;
  imageTone?: string;
  qualityControl?: string;
  incomingQualityControl?: string;
};

type RequisitionAsyncAction = 'save' | 'submit' | 'delete';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const { canWrite: canWritePurchase, readonlyReason: purchaseReadonlyReason } = useModulePermission('purchase');
const { canOperate: canApprovePurchase, readonlyReason: purchaseApproveReadonlyReason } = useOperationPermission('purchaseApprove', '提交采购需求');
const showFlowRecords = ref(false);
const requisitionMoreActionsOpen = ref(false);
const requisitionDraft = ref<PurchaseRequisition | null>(createEmptyRequisition());
const flowRecords = ref<FlowRecord[]>([]);
const purchaseOrderRows = ref<PurchaseOrder[]>([]);
const isSaving = ref(false);
const {
  activeAction: activeRequisitionAction,
  isActionPending: isRequisitionActionPending,
  runAction: runRequisitionAction,
} = useAsyncActionState<RequisitionAsyncAction>();
const loadMessage = ref('');
const isLoading = ref(false);
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
let toastTimer: number | undefined;

function today(offsetDays = 0) {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function createEmptyLine(): PurchaseRequisitionProduct {
  return { materialCode: '', name: '', qty: '', qcRequired: false, incomingQualityControl: '', uom: '' };
}

function incomingQualityRule(material: MaterialReference) {
  return material.incomingQualityControl || material.qualityControl || '免检';
}

function incomingQualityRequired(rule?: string) {
  return !['免检', '不适用', '无需质检', '无需'].includes(String(rule || '').trim());
}

function createEmptyRequisition(): PurchaseRequisition {
  return {
    code: '系统自动生成',
    companyCode: DEFAULT_COMPANY_CODE,
    company: DEFAULT_COMPANY_NAME,
    purchaseType: '物料采购',
    sourceType: '手工申请',
    department: session.user.department || '运营管理部',
    requester: session.user.name || '张三',
    reason: '',
    products: [createEmptyLine()],
    status: '草稿',
    date: today(),
    expectedDate: today(7),
    attachments: [],
  };
}

function toPurchaseRequisition(source: Partial<PurchaseRequisition>): PurchaseRequisition {
  return {
    ...createEmptyRequisition(),
    ...source,
    products: source.products?.length ? source.products : [createEmptyLine()],
    attachments: source.attachments ?? [],
  };
}

const mode = computed(() => route.name?.toString() ?? '');
const isNew = computed(() => mode.value === 'purchase-requisition-new');
const isEdit = computed(() => mode.value === 'purchase-requisition-edit');
const isDetail = computed(() => mode.value === 'purchase-requisition-detail');
const requisitionStatus = computed(() => requisitionDraft.value?.status ?? '');
const conversionFacts = computed(() => requisitionDraft.value?.conversionFacts);
const requisitionDocumentStatus = computed(() => {
  const draft = requisitionDraft.value;
  if (!draft) return '';
  if (draft.documentStatus) return draft.documentStatus;
  if (draft.status === '草稿') return '草稿';
  if (['已作废', '已取消', '已驳回', '已中断'].includes(draft.status)) return '已作废';
  return conversionFacts.value?.status === '已转单' ? '已关闭' : '已提交';
});
const isLocked = computed(() => requisitionStatus.value !== '草稿');
const isReadOnly = computed(() => isDetail.value || isLocked.value || !canWritePurchase.value);
const { resetUnsavedChanges } = useUnsavedChangesGuard(requisitionDraft, {
  enabled: computed(() => !isReadOnly.value),
  ready: computed(() => !isLoading.value),
});
const attachmentReadonlyReason = computed(() => {
  if (!isReadOnly.value) return '';
  if (!canWritePurchase.value) return purchaseReadonlyReason.value;
  if (isLocked.value) return '当前采购需求已锁定，不能上传附件。';
  if (isDetail.value) return '当前采购需求详情只读，不能上传附件。';
  return purchaseReadonlyReason.value;
});
const requisitionAttachmentTitle = computed(() => attachmentReadonlyReason.value || '上传采购需求依据、需求说明或审批附件');
const referenceTitle = computed(() => `采购需求 ${requisitionDraft.value?.code || ''}`.trim());
const referenceSubtitle = computed(() => `${requisitionDraft.value?.department || '未选择部门'} · ${requisitionDocumentStatus.value}`);
const referencePath = computed(() => (requisitionDraft.value?.code ? `/purchase/requisitions/${encodeURIComponent(requisitionDraft.value.code)}` : ''));
const requisitionSourceKind = computed(() => sourceKindForRequisition(requisitionDraft.value || {}));
const requisitionSourceLinks = computed(() => sourceLinksForRequisition(requisitionDraft.value || {}));
const requisitionSourceNote = computed(() => {
  const draft = requisitionDraft.value;
  if (!draft) return '';
  if (draft.sourceMaterialRequest && draft.sourceExpectedDate) {
    return draft.sourceExpectedDate < draft.date
      ? `来源需求日 ${draft.sourceExpectedDate}；生成时已逾期，采购需求日调整为 ${draft.expectedDate}。`
      : `来源需求日 ${draft.sourceExpectedDate}。`;
  }
  if (draft.sourceReplenishmentCode && draft.sourceWarehouseName) {
    return `来源仓库 ${draft.sourceWarehouseName}。`;
  }
  return '';
});
const canConvert = computed(() => (
  requisitionStatus.value === '待采购受理'
  && conversionFacts.value?.status !== '已转单'
  && canWritePurchase.value
));
const canDeleteDraftRequisition = computed(
  () =>
    !isNew.value &&
    canWritePurchase.value &&
    requisitionStatus.value === '草稿' &&
    Boolean(requisitionDraft.value?.code) &&
    requisitionDraft.value?.code !== '系统自动生成',
);
const requisitionValidationAttempted = ref(false);
type RequisitionRequiredFieldKey = 'company' | 'department' | 'requester' | 'date' | 'expectedDate' | 'reason' | 'products';
const requisitionRequiredFields = computed<Array<{ key: RequisitionRequiredFieldKey; label: string; done: boolean }>>(() => {
  const draft = requisitionDraft.value ?? createEmptyRequisition();
  const lineKeys = draft.products.map((product) => product.materialCode || product.name.trim()).filter(Boolean);
  const hasCompleteLine = draft.products.length > 0
    && draft.products.every((product) => productIdentity(product, '').trim() && parseNumber(product.qty) > 0)
    && new Set(lineKeys).size === lineKeys.length;
  return [
    { key: 'company', label: '公司', done: Boolean(draft.company || draft.companyCode) },
    { key: 'department', label: '需求部门', done: Boolean(draft.department) },
    { key: 'requester', label: '提出人', done: Boolean(draft.requester) },
    { key: 'date', label: '提出日期', done: Boolean(draft.date) },
    { key: 'expectedDate', label: '需求日期', done: Boolean(draft.expectedDate) && (!draft.date || draft.expectedDate >= draft.date) },
    { key: 'reason', label: '需求原因', done: Boolean(draft.reason.trim()) },
    { key: 'products', label: '物料需求', done: hasCompleteLine },
  ];
});
const missingRequiredFields = computed(() => requisitionRequiredFields.value.filter((field) => !field.done));
const showCompleteRequisitionInDetail = computed(() => (
  isDetail.value
  && requisitionStatus.value === '草稿'
  && missingRequiredFields.value.length > 0
));
const showSubmitRequisitionInDetail = computed(() => (
  isDetail.value
  && requisitionStatus.value === '草稿'
  && missingRequiredFields.value.length === 0
));
const missingRequiredSummary = computed(() => {
  const labels = missingRequiredFields.value.map((field) => field.label);
  return labels.length ? `请先补齐：${labels.join('、')}` : '关键字段已齐，可以提交采购受理。';
});
const canSubmitRequisitionPermission = computed(() => canWritePurchase.value && canApprovePurchase.value);
const canSubmitRequisition = computed(() => canSubmitRequisitionPermission.value && missingRequiredFields.value.length === 0);
const saveRequisitionActionTitle = computed(() =>
  canWritePurchase.value ? '保存草稿，提交前可继续调整采购需求。' : purchaseReadonlyReason.value,
);
const submitRequisitionReadonlyReason = computed(() => {
  if (!canWritePurchase.value) return purchaseReadonlyReason.value;
  if (!canApprovePurchase.value) return purchaseApproveReadonlyReason.value;
  return missingRequiredFields.value.length ? missingRequiredSummary.value : '';
});
const operationPermissionHint = computed(() => (
  canWritePurchase.value && !canApprovePurchase.value ? purchaseApproveReadonlyReason.value : ''
));
const operationPermissionSuffix = '提交采购需求和异常处理会保持不可用。';
const attachments = computed(() => requisitionDraft.value?.attachments ?? []);
const linkedPurchaseOrders = computed(() => {
  const code = requisitionDraft.value?.code;
  if (!code || code === '系统自动生成') return [];
  return purchaseOrderRows.value.filter((order) => (
    order.sourceRequisition === code
    || order.sourceRequisitions?.includes(code)
    || order.products.some((line) => line.sourceRequisition === code)
  ));
});
const primaryLinkedPurchaseOrder = computed(() => linkedPurchaseOrders.value[0]);

const pageHeading = computed(() => {
  if (isNew.value) return '新建采购需求';
  if (isEdit.value) return isLocked.value ? '采购需求只读' : requisitionStatus.value === '草稿' ? '编辑采购需求' : '采购需求变更';
  return '采购需求详情';
});

function requisitionNextStepLabel(status: string) {
  if (conversionFacts.value?.nextStep) return conversionFacts.value.nextStep;
  if (status === '草稿') return '提交采购受理';
  if (status === '待采购受理') return '生成采购订单';
  if (['已转采购', '已转物料采购', '已转采购订单'].includes(status)) return '跟进采购订单';
  if (status === '已作废') return '查看日志';
  return '确认采购需求状态';
}

const requisitionNextStepGuidance = computed(() => {
  const status = requisitionStatus.value;
  const linkedOrder = primaryLinkedPurchaseOrder.value;
  const facts = conversionFacts.value;
  if (facts?.status === '部分转单') {
    return {
      label: '继续转采购',
      action: '转采购',
      description: `已转采购 ${facts.coveredLineCount}/${facts.totalLineCount} 项需求，仍有 ${facts.lines.filter((line) => line.remainingQty > 0).length} 项待转。`,
      tone: 'tracking',
    };
  }
  if (linkedOrder && facts?.status === '已转单') {
    return {
      label: '跟进采购订单',
      action: '跟进',
      description: `采购需求已全部由 ${facts.linkedOrderCodes.join('、')} 承接，后续到货、质检、入库和付款在采购订单中跟进。`,
      tone: 'tracking',
    };
  }
  if (status === '草稿') {
    return {
      label: '提交采购受理',
      action: missingRequiredFields.value.length ? '完善' : '提交',
      description: missingRequiredFields.value.length ? missingRequiredSummary.value : '关键字段已齐，可以提交采购受理。',
      tone: 'pending',
    };
  }
  if (status === '待采购受理') {
    return {
      label: '生成采购订单',
      action: '转采购',
      description: '采购需求已进入采购受理，采购员可在采购订单中选择并承接物料、数量和需求日期。',
      tone: 'tracking',
    };
  }
  return {
    label: requisitionNextStepLabel(status),
    action: '查看日志',
    description: '当前采购需求已停止或完成本单流转，完整处理记录通过日志查看。',
    tone: ['已作废', '已取消', '已驳回'].includes(status) ? 'muted' : 'done',
  };
});

const requisitionStatusPanelItems = computed<DocumentStatusItem[]>(() => [
  {
    key: 'conversion',
    label: '转采购',
    value: requisitionStatus.value === '草稿' ? '待提交' : conversionFacts.value?.status || '待转单',
    kind: 'status',
  },
  {
    key: 'orders',
    label: '关联采购',
    value: linkedPurchaseOrders.value.length ? `${linkedPurchaseOrders.value.length} 张` : '尚未生成',
    kind: 'metric',
  },
]);

type RequisitionMoreAction = {
  key: 'delete' | 'edit';
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
  tone?: 'default' | 'danger';
};

const requisitionMoreActions = computed<RequisitionMoreAction[]>(() => {
  if (!isDetail.value) return [];
  const actions: RequisitionMoreAction[] = [];
  if (requisitionStatus.value === '草稿' && canWritePurchase.value) {
    actions.push({
      key: 'edit',
      label: '编辑',
      description: '直接调整采购需求草稿。',
    });
  }
  if (canDeleteDraftRequisition.value) {
    actions.push({
      key: 'delete',
      label: '删除草稿',
      description: '删除未提交的采购需求草稿。',
      disabled: isSaving.value,
      disabledReason: '正在处理采购需求，请稍后再试。',
      tone: 'danger',
    });
  }
  return actions;
});

async function handleRequisitionMoreAction(action: RequisitionMoreAction) {
  if (action.disabled || !requisitionDraft.value) return;
  requisitionMoreActionsOpen.value = false;
  if (action.key === 'delete') {
    await deleteDraftRequisition();
    return;
  }
  await router.push(`/purchase/requisitions/${encodeURIComponent(requisitionDraft.value.code)}/edit`);
}

const lineItems = computed(() =>
  (requisitionDraft.value?.products ?? []).map((product, index) => ({
    key: `${product.materialCode || product.name || 'new'}-${index}`,
    ...product,
    image:
      (product.name && purchaseMaterialVisuals[product.name]) || {
        label: product.imageLabel || '',
        tone: product.imageTone || '#eeeeee',
      },
  })),
);
function conversionLineProduct(line: { materialCode: string; name: string }) {
  return (requisitionDraft.value?.products || []).find((product) => (
    line.materialCode && product.materialCode
      ? product.materialCode === line.materialCode
      : product.name === line.name
  ));
}

function conversionLineImage(line: { materialCode: string; name: string }) {
  const product = conversionLineProduct(line);
  const index = (requisitionDraft.value?.products || []).indexOf(product as PurchaseRequisitionProduct);
  return lineItems.value[index]?.image || { label: product?.imageLabel || '', tone: product?.imageTone || '#eeeeee' };
}

function parseNumber(value: string) {
  return Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0;
}

function isRequiredFieldMissing(key: RequisitionRequiredFieldKey) {
  return missingRequiredFields.value.some((field) => field.key === key);
}

function requiredFieldClass(key: RequisitionRequiredFieldKey) {
  return {
    'is-required-field': true,
    'has-field-error': requisitionValidationAttempted.value && isRequiredFieldMissing(key),
  };
}

function requiredLineProductClass(product: PurchaseRequisitionProduct) {
  return {
    'has-line-field-error': requisitionValidationAttempted.value && !productIdentity(product, '').trim(),
  };
}

function requiredLineQtyClass(product: PurchaseRequisitionProduct) {
  return {
    'has-line-field-error': requisitionValidationAttempted.value && parseNumber(product.qty) <= 0,
  };
}

function scrollToFirstMissingField() {
  const key = missingRequiredFields.value[0]?.key;
  if (!key) return;

  const target = document.querySelector(`[data-required-field="${key}"]`) as HTMLElement | null;
  const focusTarget = target?.querySelector('button, input, select, textarea') as HTMLElement | null;
  scrollElementIntoView(target);
  focusTarget?.focus();
}

function updateLine(index: number, patch: Partial<PurchaseRequisitionProduct>) {
  if (!requisitionDraft.value) return;
  requisitionDraft.value.products[index] = {
    ...requisitionDraft.value.products[index],
    ...patch,
  };
}

function addLine() {
  requisitionDraft.value?.products.push(createEmptyLine());
}

function removeLine(index: number) {
  if (!requisitionDraft.value || requisitionDraft.value.products.length <= 1) return;
  requisitionDraft.value.products.splice(index, 1);
}

function handleProductSelect(index: number, option: ReferenceOption) {
  if (!option.code && !option.name) {
    if (requisitionDraft.value) requisitionDraft.value.products[index] = createEmptyLine();
    return;
  }
  const material = option.raw as MaterialReference;
  const qualityRule = incomingQualityRule(material);
  updateLine(index, {
    materialCode: material.code,
    name: material.name,
    model: material.model || '',
    spec: material.spec || '',
    qty: requisitionDraft.value?.products[index]?.qty || `1 ${material.uom || '件'}`,
    qcRequired: incomingQualityRequired(qualityRule),
    incomingQualityControl: qualityRule,
    uom: material.uom || '',
    imageLabel: material.imageLabel || '',
    imageTone: material.imageTone || '',
  });
}

function handleDepartmentSelect(option: ReferenceOption) {
  if (!requisitionDraft.value) return;
  if (!option.code && !option.name) {
    requisitionDraft.value.department = '';
    return;
  }
  requisitionDraft.value.department = option.name;
}

function handleCompanySelect(option: ReferenceOption) {
  if (!requisitionDraft.value) return;
  requisitionDraft.value.companyCode = option.code;
  requisitionDraft.value.company = option.name;
}

function handleRequesterSelect(option: ReferenceOption) {
  if (!requisitionDraft.value) return;
  if (!option.code && !option.name) {
    requisitionDraft.value.requester = '';
    return;
  }
  requisitionDraft.value.requester = option.name;
}

function buildRequisitionForSave(): PurchaseRequisition {
  const draft = requisitionDraft.value ?? createEmptyRequisition();

  return {
    ...draft,
    purchaseType: '物料采购',
    products: draft.products,
  };
}

async function loadRequisition() {
  loadMessage.value = '';
  isLoading.value = !isNew.value;
  if (!isNew.value) {
    requisitionDraft.value = null;
    flowRecords.value = [];
  }
  void loadLinkedPurchaseOrders();

  try {
    if (isNew.value) {
      requisitionDraft.value = createEmptyRequisition();
      flowRecords.value = [];
      return;
    }

    const code = route.params.code?.toString() ?? '';
    if (!code) return;

    const response = await getPurchaseRequisition(code);
    requisitionDraft.value = toPurchaseRequisition(response.requisition);
    flowRecords.value = response.flowRecords;
    if (isEdit.value && response.requisition.status !== '草稿') {
      await router.replace(`/purchase/requisitions/${encodeURIComponent(response.requisition.code)}`);
    }
  } catch (error) {
    requisitionDraft.value = null;
    flowRecords.value = [];
    loadMessage.value = error instanceof Error ? error.message : '采购需求加载失败';
  } finally {
    isLoading.value = false;
  }
}

async function loadLinkedPurchaseOrders() {
  try {
    purchaseOrderRows.value = await listPurchaseOrders();
  } catch {
    purchaseOrderRows.value = [];
  }
}

async function persistRequisition() {
  if (!canWritePurchase.value) {
    showToast(purchaseReadonlyReason.value, 'error');
    return null;
  }
  if (!requisitionDraft.value) return null;
  isSaving.value = true;
  try {
    const response = await savePurchaseRequisition(buildRequisitionForSave());
    requisitionDraft.value = toPurchaseRequisition(response.requisition);
    flowRecords.value = response.flowRecords;
    resetUnsavedChanges();
    showToast(
      missingRequiredFields.value.length
        ? `采购需求草稿已保存，${missingRequiredSummary.value.replace('请先', '提交前请')}`
        : '采购需求草稿已保存',
    );
    return response.requisition;
  } catch (error) {
    showToast(error instanceof Error ? error.message : '采购需求保存失败', 'error');
    return null;
  } finally {
    isSaving.value = false;
  }
}

async function saveRequisitionDraft() {
  await runRequisitionAction('save', async () => {
    const saved = await persistRequisition();
    if (!saved) return;
    resetUnsavedChanges();
    if (isNew.value) await router.replace(`/purchase/requisitions/${encodeURIComponent(saved.code)}/edit`);
  });
}

async function deleteDraftRequisition() {
  if (!requisitionDraft.value || !canDeleteDraftRequisition.value) {
    showToast('只有未提交的采购需求草稿可以删除', 'error');
    return;
  }

  const confirmed = await requestActionConfirmation({
    title: `删除采购需求草稿 ${requisitionDraft.value.code}？`,
    message: '删除后不可恢复，尚未提交的申请内容及附件将一并移除。',
    confirmLabel: '确认删除',
    tone: 'danger',
  });
  if (!confirmed) return;

  await runRequisitionAction('delete', async () => {
    isSaving.value = true;
    try {
      await deletePurchaseRequisition(requisitionDraft.value!.code);
      resetUnsavedChanges();
      showToast('采购需求草稿已删除');
      await router.replace('/purchase/requisitions');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除草稿失败，请稍后重试', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

async function submitRequisitionDraft() {
  requisitionValidationAttempted.value = true;

  if (!canSubmitRequisitionPermission.value) {
    showToast(submitRequisitionReadonlyReason.value, 'error');
    return;
  }

  if (!canSubmitRequisition.value) {
    showToast(missingRequiredSummary.value, 'error');
    scrollToFirstMissingField();
    return;
  }

  await runRequisitionAction('submit', async () => {
    const saved = await persistRequisition();
    if (!saved) return;

    isSaving.value = true;
    try {
      const response = await submitPurchaseRequisition(saved.code);
      requisitionDraft.value = toPurchaseRequisition(response.requisition);
      flowRecords.value = response.flowRecords;
      resetUnsavedChanges();
      showToast('采购需求已提交采购受理');
      await router.replace(`/purchase/requisitions/${encodeURIComponent(response.requisition.code)}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '采购需求提交失败', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2400);
}

function handleAttachmentUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (isReadOnly.value) {
    input.value = '';
    showToast(attachmentReadonlyReason.value || '当前状态不能上传附件', 'error');
    return;
  }
  const files = attachmentsFromFileList(input.files);
  if (!files.length || !requisitionDraft.value) return;
  requisitionDraft.value.attachments = [...(requisitionDraft.value.attachments ?? []), ...files];
  input.value = '';
  showToast(`已选择 ${files.length} 个附件，保存后随采购需求保留。`);
}

watch(() => route.fullPath, loadRequisition, { immediate: true });

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section
      v-if="requisitionDraft"
      class="quote-editor purchase-requisition-editor"
      :class="{ 'is-detail-view': isDetail, 'has-attachment-only-summary': !isDetail }"
    >
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" to="/purchase/requisitions" aria-label="返回采购需求列表" title="返回采购需求列表">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ isDetail ? requisitionDraft.code : pageHeading }}</strong>
        </template>

        <template #actions>
          <div class="quote-editor-actions">
          <template v-if="isDetail">
            <PinReferenceButton
              v-if="referencePath"
              class="topbar-optional-action"
              :title="referenceTitle"
              :subtitle="referenceSubtitle"
              :path="referencePath"
            />
            <button class="secondary-action topbar-optional-action" type="button" title="查看采购需求流转日志" @click="showFlowRecords = true">
              <FileText :size="15" />
              日志
            </button>
            <div
              v-if="requisitionMoreActions.length"
              class="order-more-action-wrap"
              @keydown.esc.stop="requisitionMoreActionsOpen = false"
              @mouseleave="requisitionMoreActionsOpen = false"
            >
              <button
                class="secondary-action"
                type="button"
                title="更多操作"
                aria-haspopup="menu"
                aria-controls="detail-more-menu"
                :aria-expanded="requisitionMoreActionsOpen"
                @click="requisitionMoreActionsOpen = !requisitionMoreActionsOpen"
              >
                更多
              </button>
              <div v-if="requisitionMoreActionsOpen" id="detail-more-menu" class="order-more-menu" role="menu">
                <button
                  v-for="action in requisitionMoreActions"
                  :key="action.key"
                  type="button"
                  role="menuitem"
                  :class="{ 'danger-option': action.tone === 'danger' }"
                  :disabled="action.disabled"
                  :title="action.disabled ? action.disabledReason || action.description : action.description"
                  @click="handleRequisitionMoreAction(action)"
                >
                  <strong>{{ action.label }}</strong>
                  <span>{{ action.disabled ? action.disabledReason || action.description : action.description }}</span>
                </button>
              </div>
            </div>
            <RouterLink
              v-if="showCompleteRequisitionInDetail"
              class="primary-action"
              :to="`/purchase/requisitions/${encodeURIComponent(requisitionDraft.code)}/edit`"
              :title="missingRequiredSummary"
            >
              <Pencil :size="15" />
              完善
            </RouterLink>
            <button
              v-else-if="showSubmitRequisitionInDetail"
              class="primary-action async-document-action"
              type="button"
              :disabled="isSaving || isRequisitionActionPending || !canSubmitRequisitionPermission"
              :aria-busy="activeRequisitionAction === 'submit'"
              :title="submitRequisitionReadonlyReason"
              @click="submitRequisitionDraft"
            >
              <CheckCircle2 :size="15" />
              {{ activeRequisitionAction === 'submit' ? '提交中' : '提交' }}
            </button>
            <RouterLink
              v-else-if="primaryLinkedPurchaseOrder && conversionFacts?.status === '已转单'"
              class="primary-action"
              :to="`/purchase/orders/${encodeURIComponent(primaryLinkedPurchaseOrder.code)}`"
              title="打开关联采购订单"
            >
              <Send :size="15" />
              跟进
            </RouterLink>
            <RouterLink
              v-else-if="canConvert"
              class="primary-action"
              :to="{ path: '/purchase/orders/new', query: { requisition: requisitionDraft.code } }"
              title="由当前采购需求新建采购订单"
            >
              <Send :size="15" />
              转采购
            </RouterLink>
          </template>

          <template v-else-if="!isLocked">
            <button
              v-if="canDeleteDraftRequisition"
              class="secondary-action danger-action"
              type="button"
              :disabled="isSaving || isRequisitionActionPending"
              :aria-busy="activeRequisitionAction === 'delete'"
              title="删除未提交的采购需求草稿"
              @click="deleteDraftRequisition"
            >
              <Trash2 :size="15" />
              {{ activeRequisitionAction === 'delete' ? '删除中' : '删除草稿' }}
            </button>
            <button class="secondary-action async-document-action" type="button" :disabled="isSaving || isRequisitionActionPending || !canWritePurchase" :aria-busy="activeRequisitionAction === 'save'" :title="saveRequisitionActionTitle" @click="saveRequisitionDraft">
              <Save :size="15" />
              {{ activeRequisitionAction === 'save' ? '保存中' : '保存草稿' }}
            </button>
            <button class="primary-action async-document-action" type="button" :disabled="isSaving || isRequisitionActionPending || !canSubmitRequisitionPermission" :aria-busy="activeRequisitionAction === 'submit'" :title="submitRequisitionReadonlyReason" @click="submitRequisitionDraft">
              <CheckCircle2 :size="15" />
              {{ activeRequisitionAction === 'submit' ? '提交中' : '提交' }}
            </button>
          </template>

          <template v-else>
            <button class="secondary-action" type="button" disabled title="单据已锁定，不能继续编辑">
              <Pencil :size="15" />
              已锁定
            </button>
          </template>
          </div>
        </template>

        <template #fallback>
          <div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1><p v-if="loadMessage" class="section-hint">{{ loadMessage }}</p></div></div>
        </template>
      </PageTopbarPortal>

      <OperationPermissionBanner :message="operationPermissionHint" :suffix="operationPermissionSuffix" />

      <section v-if="isDetail" class="order-next-step-strip" :class="`tone-${requisitionNextStepGuidance.tone}`">
        <div>
          <span>下一步</span>
          <strong>{{ requisitionNextStepGuidance.label }}</strong>
          <p>{{ requisitionNextStepGuidance.description }}</p>
        </div>
        <b>{{ requisitionNextStepGuidance.action }}</b>
      </section>

      <div class="quote-form-grid">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading">
              <h2>基本信息</h2>
            </div>

            <dl v-if="isDetail" class="material-fact-grid purchase-detail-fact-grid purchase-requisition-fact-grid">
              <div><dt>公司</dt><dd>{{ requisitionDraft.company || '-' }}</dd></div>
              <div><dt>需求部门</dt><dd>{{ requisitionDraft.department }}</dd></div>
              <div><dt>提出人</dt><dd>{{ requisitionDraft.requester }}</dd></div>
              <div><dt>提出日期</dt><dd>{{ requisitionDraft.date }}</dd></div>
              <div><dt>{{ requisitionDraft.sourceMaterialRequest ? '采购需求日期' : '需求日期' }}</dt><dd>{{ requisitionDraft.expectedDate }}</dd></div>
              <div><dt>需求来源</dt><dd>{{ requisitionSourceKind }}</dd></div>
              <div class="fact-span-3"><dt>需求原因</dt><dd>{{ requisitionDraft.reason }}</dd></div>
            </dl>
            <div v-if="isDetail && requisitionSourceLinks.length" class="source-allocation-note requisition-source-note">
              <span>来源追溯</span>
              <strong class="purchase-source-links">
                <RouterLink
                  v-for="source in requisitionSourceLinks"
                  :key="source.path"
                  :to="source.path"
                  :title="`查看${source.label} ${source.code}`"
                >{{ source.label }} · {{ source.code }}</RouterLink>
              </strong>
              <small v-if="requisitionSourceNote">{{ requisitionSourceNote }}</small>
            </div>
            <div v-if="!isDetail" class="quote-fields">
              <label class="form-field" :class="requiredFieldClass('company')" data-required-field="company">
                <span class="field-label required-label">公司</span>
                <ReferencePicker
                  required
                  v-model="requisitionDraft.companyCode"
                  :display-value="requisitionDraft.company"
                  type="company"
                  title="选择公司"
                  placeholder="选择公司"
                  search-placeholder="搜索公司编码或名称"
                  :disabled="isReadOnly"
                  hide-meta
                  @select="handleCompanySelect"
                />
              </label>
              <label class="form-field">
                <span>申请单号</span>
                <input v-model="requisitionDraft.code" type="text" readonly />
              </label>
              <label class="form-field" :class="requiredFieldClass('department')" data-required-field="department">
                <span class="field-label required-label">需求部门</span>
                <ReferencePicker
                  required
                  v-model="requisitionDraft.department"
                  :display-value="requisitionDraft.department"
                  type="departments"
                  title="选择需求部门"
                  placeholder="选择需求部门"
                  search-placeholder="搜索部门编码、名称或负责人"
                  :disabled="isReadOnly"
                  hide-meta
                  @select="handleDepartmentSelect"
                />
              </label>
              <label class="form-field" :class="requiredFieldClass('requester')" data-required-field="requester">
                <span class="field-label required-label">提出人</span>
                <ReferencePicker
                  required
                  v-model="requisitionDraft.requester"
                  :display-value="requisitionDraft.requester"
                  type="employees"
                  title="选择提出人"
                  placeholder="选择提出人"
                  search-placeholder="搜索员工编码、姓名、部门或手机号"
                  :disabled="isReadOnly"
                  hide-meta
                  @select="handleRequesterSelect"
                />
              </label>
              <label class="form-field" :class="requiredFieldClass('date')" data-required-field="date">
                <span class="field-label required-label">提出日期</span>
                <input v-model="requisitionDraft.date" type="date" :readonly="isReadOnly" />
              </label>
              <label class="form-field" :class="requiredFieldClass('expectedDate')" data-required-field="expectedDate">
                <span class="field-label required-label">需求日期</span>
                <input v-model="requisitionDraft.expectedDate" type="date" :readonly="isReadOnly" />
              </label>
              <label class="form-field field-span-2" :class="requiredFieldClass('reason')" data-required-field="reason">
                <span class="field-label required-label">需求原因</span>
                <textarea
                  v-model="requisitionDraft.reason"
                  rows="3"
                  placeholder="说明为什么需要采购，例如生产补料、包装耗材或办公耗材等"
                  :readonly="isReadOnly"
                ></textarea>
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>物料需求</h2>
              <button v-if="!isReadOnly" class="secondary-action compact-action" type="button" title="添加明细行" @click="addLine">
                <Plus :size="15" />
                添加
              </button>
            </div>

            <div v-if="isDetail" class="quote-line-table purchase-detail-line-table">
              <div class="quote-line-row purchase-requisition-line-row no-actions quote-line-head">
                <span class="purchase-requisition-material-identity">物料</span>
                <span>数量</span>
                <span>检验规则</span>
              </div>
              <div
                v-for="(item, index) in requisitionDraft.products"
                :key="`${item.lineId || item.materialCode || item.name}-${index}-detail`"
                class="quote-line-row purchase-requisition-line-row no-actions purchase-detail-line-row"
              >
                <MaterialIdentity
                  class="purchase-requisition-material-identity"
                  :name="item.name"
                  :code="item.materialCode"
                  :model="item.model"
                  :spec="item.spec"
                  :image-url="lineItems[index]?.image.url"
                  :image-label="lineItems[index]?.image.label"
                  :image-tone="lineItems[index]?.image.tone"
                />
                <strong>{{ productQtyWithUnit(item) }}</strong>
                <span class="purchase-qc-rule">{{ item.incomingQualityControl || (item.qcRequired ? '需质检' : '免检') }}</span>
              </div>
            </div>

            <div
              v-else
              class="quote-line-table"
              :class="{ 'has-field-error': requisitionValidationAttempted && isRequiredFieldMissing('products') }"
              data-required-field="products"
            >
              <div class="quote-line-row purchase-requisition-line-row quote-line-head" :class="{ 'no-actions': isReadOnly }">
                <span>图片</span>
                <span class="required-label">物料</span>
                <span class="required-label">数量</span>
                <span>检验规则</span>
                <span v-if="!isReadOnly"></span>
              </div>
              <div
                v-for="(item, index) in requisitionDraft.products"
                :key="`${item.materialCode || item.name || 'new'}-${index}`"
                class="quote-line-row purchase-requisition-line-row"
                :class="{ 'no-actions': isReadOnly }"
              >
                <span class="product-thumb" :style="{ backgroundColor: lineItems[index]?.image.tone }">
                  <img v-if="lineItems[index]?.image.url" :src="lineItems[index].image.url" alt="" />
                  <span v-else>{{ lineItems[index]?.image.label }}</span>
                </span>
                <ReferencePicker
                  required
                  v-model="item.materialCode"
                  type="materials"
                  kind="采购"
                  title="选择物料"
                  placeholder="选择物料"
                  search-placeholder="搜索物料编码、名称、型号或规格"
                  :display-value="productIdentity(item, '选择物料')"
                  :disabled="isReadOnly"
                  :class="requiredLineProductClass(item)"
                  hide-meta
                  @select="handleProductSelect(index, $event)"
                />
                <QuantityWithUnitInput
                  v-model="item.qty"
                  :unit="item.uom"
                  placeholder="数量"
                  :readonly="isReadOnly"
                  :class="requiredLineQtyClass(item)"
                />
                <output
                  class="purchase-qc-rule"
                  :title="item.materialCode ? '由物料基础资料的到货检验规则自动带入' : '选择物料后自动带入'"
                >{{ item.materialCode ? item.incomingQualityControl || (item.qcRequired ? '需质检' : '免检') : '待选择' }}</output>
                <button
                  v-if="!isReadOnly"
                  class="icon-button danger"
                  type="button"
                  aria-label="删除申请物料"
                  :title="requisitionDraft.products.length <= 1 ? '至少保留一项申请物料' : '删除申请物料'"
                  :disabled="requisitionDraft.products.length <= 1"
                  @click="removeLine(index)"
                >
                  <Trash2 :size="15" />
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside class="quote-summary-panel">
          <section v-if="isDetail" class="summary-section">
            <DocumentStatusPanel
              title="单据状态"
              :primary-status="requisitionDocumentStatus"
              :items="requisitionStatusPanelItems"
              aria-label="采购需求单据状态与转采购进度"
            />
          </section>

          <section v-if="isDetail && conversionFacts && requisitionStatus !== '草稿'" class="summary-section">
            <div class="conversion-summary-heading">
              <h2>转采购明细</h2>
            </div>
            <div class="conversion-line-list">
              <div v-for="line in conversionFacts.lines" :key="line.lineId" class="conversion-line-row">
                <MaterialIdentity
                  compact
                  :name="line.name"
                  :code="line.materialCode"
                  :model="conversionLineProduct(line)?.model"
                  :spec="conversionLineProduct(line)?.spec"
                  :image-label="conversionLineImage(line).label"
                  :image-tone="conversionLineImage(line).tone"
                >
                  <template #supplement><small>{{ line.status }}</small></template>
                </MaterialIdentity>
                <span>{{ line.orderedQty }}/{{ line.requestedQty }} {{ line.uom }}</span>
                <small v-if="line.remainingQty > 0">待转采购 {{ line.remainingQty }} {{ line.uom }}</small>
                <small v-else>已全部转采购</small>
              </div>
            </div>
          </section>

          <section v-if="isDetail && linkedPurchaseOrders.length" class="summary-section">
            <h2>关联采购订单</h2>
            <div class="price-reference-list">
              <RouterLink
                v-for="order in linkedPurchaseOrders"
                :key="order.code"
                class="price-reference-card reference-card-link"
                :to="`/purchase/orders/${encodeURIComponent(order.code)}`"
              >
                <strong>{{ order.code }}</strong>
                <div class="price-reference">
                  <span>{{ order.supplier || '待选择供应商' }}</span>
                  <b>{{ order.amount }}</b>
                </div>
                <small class="price-reference-meta">{{ order.status }} · 预计 {{ order.expectedDate }}</small>
              </RouterLink>
            </div>
          </section>

          <section class="summary-section">
            <div class="form-section-head">
              <div class="summary-title">
                <Paperclip :size="17" />
                <h2>附件</h2>
              </div>
              <label
                class="secondary-action compact-action file-upload-button"
                :class="{ 'is-disabled': isReadOnly }"
                :aria-disabled="isReadOnly"
                :title="requisitionAttachmentTitle"
              >
                <Upload :size="15" />
                上传
                <input type="file" multiple :disabled="isReadOnly" @change="handleAttachmentUpload" />
              </label>
            </div>

            <div v-if="attachments.length" class="attachment-list">
              <div v-for="file in attachments" :key="file.name" class="attachment-row">
                <span class="attachment-icon">
                  <Paperclip :size="16" />
                </span>
                <div>
                  <strong>{{ file.name }}</strong>
                  <small>{{ file.size }} · {{ file.uploader }} · {{ file.date }}</small>
                </div>
              </div>
            </div>

            <div v-else class="attachment-empty">
              <Paperclip :size="17" />
              <span>{{ isReadOnly ? '暂无附件' : '可上传需求说明、图纸、规格或内部审批材料' }}</span>
            </div>
          </section>
        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      title="采购需求"
      :message="loadMessage || '采购需求不存在'"
      back-path="/purchase/requisitions"
      back-label="返回采购需求列表"
      @retry="loadRequisition"
    />

    <FlowRecordPanel
      :open="showFlowRecords"
      title="采购需求日志"
      :records="flowRecords"
      @close="showFlowRecords = false"
    />
    <div v-if="toastMessage" class="app-toast" :class="{ error: toastTone === 'error' }" :role="toastTone === 'error' ? 'alert' : 'status'" :aria-live="toastTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ toastMessage }}</div>
  </div>
</template>
