<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Paperclip,
  Save,
  Upload,
} from 'lucide-vue-next';

import FlowRecordPanel from '../components/FlowRecordPanel.vue';
import DocumentLoadState from '../components/DocumentLoadState.vue';
import MaterialIdentity from '../components/MaterialIdentity.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import ReferencePicker from '../components/ReferencePicker.vue';
import { useAsyncActionState } from '../composables/useAsyncActionState';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import {
  advancePurchaseAfterSale,
  advanceSalesAfterSale,
  getPurchaseAfterSale,
  getSalesAfterSale,
  listSalesAfterSales,
  listPurchaseAfterSales,
  listPurchaseOrders,
  listSalesOrders,
  savePurchaseAfterSale,
  saveSalesAfterSale,
  voidPurchaseAfterSale,
  voidSalesAfterSale,
} from '../services/api';
import type {
  Attachment,
  FlowRecord,
  PurchaseAfterSale,
  PurchaseOrder,
  RelatedBusinessDocument,
  SalesAfterSale,
  SalesAfterSaleExecutionTask,
  SalesOrder,
  ReferenceOption,
} from '../types/business';
import { useSessionStore } from '../stores/session';
import { attachmentsFromFileList } from '../utils/attachmentUpload';
import { scrollElementIntoView } from '../utils/focusNavigation';
import { requestActionConfirmation } from '../composables/useActionConfirmation';
import { purchaseMaterialVisuals } from '../data/purchase';
import { productVisuals } from '../data/sales';

type AfterSalesKind = 'sales' | 'purchase';
type AfterSalesStatus = '待受理' | '处理中' | '待确认' | '已关闭' | '已作废';
type AfterSalesAsyncAction = 'save' | 'advance' | 'void';

type AfterSalesRecord = {
  kind: AfterSalesKind;
  code: string;
  revision?: number;
  sourceOrder: string;
  partyTitle: string;
  partyRole: string;
  contact: string;
  issueType: string;
  issueDescription: string;
  action: string;
  goodsDisposition: string;
  financialTreatment: string;
  responsibility: string;
  amountImpact: string;
  amountImpactType: '无金额影响' | '待评估' | '退款' | '折让' | '补发成本' | '返修成本' | '应付扣减';
  estimatedAmount: number;
  confirmedAmount: number;
  currency: 'CNY';
  planNote: string;
  executionTasks: SalesAfterSaleExecutionTask[];
  processingResult: string;
  confirmationNote: string;
  owner: string;
  ownerEmployeeCode: string;
  status: AfterSalesStatus;
  nextStep: string;
  date: string;
  sourceStatus: string;
  sourceAmount: string;
  sourceDate: string;
  sourceDueDate: string;
  sourceRemark: string;
  products: Array<{
    sourceLineId?: string;
    materialCode?: string;
    name: string;
    model?: string;
    spec?: string;
    imageLabel?: string;
    imageTone?: string;
    qty: string;
    sourceQty?: string;
    orderedQty?: string;
    uom?: string;
  }>;
  attachments: Attachment[];
  remedyReceipt?: RelatedBusinessDocument;
  relatedDocuments?: RelatedBusinessDocument[];
};

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const salesWritePermission = useModulePermission('sales');
const purchaseWritePermission = useModulePermission('purchase');
const salesApprovePermission = useOperationPermission('salesApprove', '推进销售售后');
const purchaseApprovePermission = useOperationPermission('purchaseApprove', '推进采购售后');

const record = ref<AfterSalesRecord | null>(null);
const draft = ref<AfterSalesRecord | null>(null);
const flowRecords = ref<FlowRecord[]>([]);

function afterSalesMaterialVisual(product: AfterSalesRecord['products'][number]) {
  return productVisuals[product.name]
    ?? purchaseMaterialVisuals[product.name]
    ?? {
      label: product.imageLabel || '',
      tone: product.imageTone || '#eeeeee',
    };
}
const showFlowRecords = ref(false);
const afterSalesMoreActionsOpen = ref(false);
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const loadMessage = ref('');
const isLoading = ref(false);
const sourceOrders = ref<SalesOrder[]>([]);
const sourceAfterSales = ref<SalesAfterSale[]>([]);
const purchaseSourceAfterSales = ref<PurchaseAfterSale[]>([]);
const purchaseSourceOrders = ref<PurchaseOrder[]>([]);
const {
  activeAction: activeAfterSalesAction,
  isActionPending: isAfterSalesActionPending,
  runAction: runAfterSalesAction,
} = useAsyncActionState<AfterSalesAsyncAction>();
let toastTimer: number | undefined;

const kind = computed<AfterSalesKind>(() => (route.meta.afterSalesKind === 'purchase' ? 'purchase' : 'sales'));
const code = computed(() => route.params.code?.toString() || '');
const isNewMode = computed(() => ['sales-after-sale-new', 'purchase-after-sale-new'].includes(route.name?.toString() || ''));
const isEditMode = computed(() => isNewMode.value || route.path.endsWith('/edit'));
const isSalesFollowUpEdit = computed(() => (
  isEditMode.value
  && !isNewMode.value
  && record.value?.status !== '待受理'
));
const moduleTitle = computed(() => (kind.value === 'sales' ? '销售售后' : '采购售后'));
const sourceTitle = computed(() => (kind.value === 'sales' ? '销售订单' : '采购订单'));
const listPath = computed(() => (kind.value === 'sales' ? '/sales/after-sales' : '/purchase/after-sales'));
const canWriteAfterSales = computed(() => (
  kind.value === 'sales' ? salesWritePermission.canWrite.value : purchaseWritePermission.canWrite.value
));
const canApproveAfterSales = computed(() => (
  kind.value === 'sales' ? salesApprovePermission.canOperate.value : purchaseApprovePermission.canOperate.value
));
const writeReadonlyReason = computed(() => (
  kind.value === 'sales' ? salesWritePermission.readonlyReason.value : purchaseWritePermission.readonlyReason.value
));
const approveReadonlyReason = computed(() => (
  kind.value === 'sales' ? salesApprovePermission.readonlyReason.value : purchaseApprovePermission.readonlyReason.value
));
const sourcePath = computed(() => {
  if (!record.value?.sourceOrder) return listPath.value;
  return kind.value === 'sales'
    ? `/sales/orders/${encodeURIComponent(record.value.sourceOrder)}`
    : `/purchase/orders/${encodeURIComponent(record.value.sourceOrder)}`;
});
const editPath = computed(() => `${listPath.value}/${encodeURIComponent(record.value?.code || code.value)}/edit`);
const detailPath = computed(() => isNewMode.value ? listPath.value : `${listPath.value}/${encodeURIComponent(record.value?.code || code.value)}`);
const pageHeading = computed(() => {
  if (!record.value) return `${moduleTitle.value}详情`;
  if (isNewMode.value) return `新建${moduleTitle.value}`;
  if (isEditMode.value) {
    if (record.value.status === '待受理') return `制定处理方案 ${record.value.code}`;
    if (record.value.status === '处理中') {
      const hasPendingTask = record.value.executionTasks.some((task) => task.status !== '已完成');
      return `${hasPendingTask ? '维护售后协调' : '记录处理结果'} ${record.value.code}`;
    }
    if (record.value.status === '待确认') {
      return `记录${kind.value === 'sales' ? '客户' : '供应商'}确认 ${record.value.code}`;
    }
  }
  return isEditMode.value ? `${moduleTitle.value}变更 ${record.value.code}` : `${moduleTitle.value} ${record.value.code}`;
});

type AfterSalesMoreAction = {
  key: 'change' | 'void';
  label: string;
  description: string;
  tone?: 'normal' | 'danger';
};

const statusAction = computed(() => {
  const status = record.value?.status;
  if (status === '待受理') return { label: '受理', nextStatus: '处理中' as AfterSalesStatus, nextStep: '执行处理任务' };
  if (status === '处理中') return { label: '提交处理结果', nextStatus: '待确认' as AfterSalesStatus, nextStep: '确认处理结果' };
  if (status === '待确认') return { label: '关闭', nextStatus: '已关闭' as AfterSalesStatus, nextStep: '归档完成' };
  return { label: record.value?.status === '已作废' ? '已作废' : '已关闭', nextStatus: '已关闭' as AfterSalesStatus, nextStep: '归档完成' };
});
const remedyReceiptCompleteStatuses = new Set(['已入库', '已拒收']);
const hasIncompleteRemedyReceipt = computed(() => Boolean(
  kind.value === 'purchase'
  && record.value?.status === '处理中'
  && record.value.remedyReceipt
  && !remedyReceiptCompleteStatuses.has(record.value.remedyReceipt.status),
));
const advanceBlockReason = computed(() => {
  if (!record.value || isEditMode.value || ['已关闭', '已作废'].includes(record.value.status)) return '';
  if (record.value.status === '待受理') {
    if (!record.value.action) return '请先制定处理方案，再受理售后。';
    if (record.value.amountImpactType === '待评估') return '请先明确金额影响，再受理售后。';
    if (record.value.amountImpactType !== '无金额影响' && record.value.estimatedAmount <= 0) {
      return '请先填写预计金额，再受理售后。';
    }
  }
  if (record.value.status === '处理中') {
    if (hasIncompleteRemedyReceipt.value && record.value.remedyReceipt) {
      return `统一采购入库 ${record.value.remedyReceipt.code} 当前为“${record.value.remedyReceipt.status}”，请等待仓库完成到货、质检和正式入库。`;
    }
    const incompleteTasks = record.value.executionTasks.filter((task) => task.status !== '已完成');
    if (incompleteTasks.length) return `还有 ${incompleteTasks.length} 项执行任务未完成。`;
    if (!record.value.processingResult.trim()) {
      return `请先填写处理结果，再提交${kind.value === 'sales' ? '客户' : '供应商'}确认。`;
    }
    if (record.value.amountImpactType !== '无金额影响' && record.value.confirmedAmount <= 0) {
      return `请先填写确认金额，再提交${kind.value === 'sales' ? '客户' : '供应商'}确认。`;
    }
  }
  if (record.value.status === '待确认' && !record.value.confirmationNote.trim()) {
    return `请先填写${kind.value === 'sales' ? '客户' : '供应商'}确认依据，再关闭售后。`;
  }
  return '';
});
const missingRequiredActionLabel = computed(() => (
  record.value?.status === '待受理'
    ? '制定方案'
    : record.value?.status === '待确认'
    ? `填写${kind.value === 'sales' ? '客户' : '供应商'}确认`
    : '填写处理结果'
));
const hasIncompleteExecutionTasks = computed(() => Boolean(
  record.value?.status === '处理中'
  && record.value.executionTasks.some((task) => task.status !== '已完成')
));
const hasIncompleteExecutionWork = computed(() => (
  hasIncompleteExecutionTasks.value || hasIncompleteRemedyReceipt.value
));
const primaryActionLabel = computed(() => (
  hasIncompleteExecutionWork.value ? '等待协同' : statusAction.value.label
));
const canAdvanceStatus = computed(() => Boolean(
  record.value
  && !['已关闭', '已作废'].includes(record.value.status)
  && !isEditMode.value
  && !advanceBlockReason.value
  && canApproveAfterSales.value
));
const afterSalesMoreActions = computed<AfterSalesMoreAction[]>(() => (
  !isEditMode.value
  && !['已关闭', '已作废'].includes(record.value?.status || '')
  && canWriteAfterSales.value
    ? [
        ...(!advanceBlockReason.value
          ? [{ key: 'change' as const, label: '维护', description: '维护负责人、附件或当前阶段记录。' }]
          : []),
        ...(record.value?.status === '待受理'
          ? [{ key: 'void' as const, label: '作废', description: '作废尚未生成执行事实的售后单。', tone: 'danger' as const }]
          : []),
      ]
    : []
));
const nextStepBadge = computed(() => {
  if (record.value?.status === '待受理' && advanceBlockReason.value) return '待定方案';
  if (
    record.value?.status === '处理中'
    && record.value.executionTasks.some((task) => task.status !== '已完成')
  ) return '任务执行中';
  if (hasIncompleteRemedyReceipt.value) return '入库流程中';
  if (record.value?.status === '处理中' && advanceBlockReason.value) return '待补处理结果';
  if (record.value?.status === '待确认' && advanceBlockReason.value) return '待补确认依据';
  return statusAction.value.label;
});
const nextStepTone = computed(() => {
  if (!record.value) return 'pending';
  if (['已关闭', '已作废'].includes(record.value.status)) return 'done';
  if (record.value.status === '处理中') return 'tracking';
  return 'pending';
});
const attachmentCountText = computed(() => {
  const count = (isEditMode.value ? draft.value?.attachments : record.value?.attachments)?.length || 0;
  return count ? `${count} 个` : '无附件';
});
const afterSalesRequiredLabels = new Set([
  '负责人',
  '问题类型',
  '问题说明',
]);
const isAfterSalesReadOnly = computed(() => !isEditMode.value);
const { resetUnsavedChanges } = useUnsavedChangesGuard(draft, {
  enabled: computed(() => !isAfterSalesReadOnly.value),
  ready: computed(() => !isLoading.value),
});
const afterSalesAttachments = computed<Attachment[]>(() => (isEditMode.value ? draft.value?.attachments : record.value?.attachments) ?? []);
const afterSalesAttachmentTitle = computed(() =>
  isAfterSalesReadOnly.value ? '详情页只允许查看附件，请通过变更进入维护。' : '上传售后沟通、现场照片或处理依据。',
);
const afterSalesPrimaryActionTitle = computed(() => {
  if (!record.value) return `返回${moduleTitle.value}列表重新选择单据。`;
  if (!canApproveAfterSales.value && !advanceBlockReason.value) return approveReadonlyReason.value;
  if (advanceBlockReason.value) return advanceBlockReason.value;
  if (!canAdvanceStatus.value) return `${moduleTitle.value}已关闭，只能查看详情与日志。`;
  return `${statusAction.value.label}：${record.value.nextStep}。${record.value.issueType} · ${record.value.action || '方案待定'}`;
});
const afterSalesSaveActionTitle = computed(() => canWriteAfterSales.value
  ? isNewMode.value
    ? `登记${moduleTitle.value}，登记后进入待受理。`
    : `保存${moduleTitle.value}变更，保存后返回详情页。`
  : writeReadonlyReason.value);
const afterSalesSaveActionLabel = computed(() => {
  if (activeAfterSalesAction.value === 'save') return '保存中';
  if (isNewMode.value) return '登记';
  if (!record.value) return '保存变更';
  if (record.value.status === '待受理') return '保存方案';
  if (record.value.status === '处理中') {
    return hasIncompleteExecutionWork.value
      ? '保存协调信息'
      : '保存处理结果';
  }
  if (record.value.status === '待确认') return '保存确认';
  return '保存变更';
});
const afterSalesCancelActionTitle = computed(() => `取消本次变更，返回${moduleTitle.value}详情。`);

const issueTypeOptions = computed(() => kind.value === 'sales'
  ? ['质量问题', '包装/标签', '少发/错发', '运输破损', '退换货', '其他']
  : ['来料质量', '数量差异', '错料/漏发', '包装运输', '交付延期', '退换货', '其他']);
const actionOptions = computed(() => kind.value === 'sales'
  ? ['补发', '换货', '退货退款', '退款/折让', '返修/返工', '记录并回访']
  : ['要求补发', '退货换货', '退货退款', '退款/折让', '供应商返工', '记录并跟进']);
const issueDescriptionPlaceholder = computed(() => kind.value === 'sales'
  ? '记录客户反馈、发生范围和已确认的信息'
  : '记录供应商交付、到货或质检中已确认的问题');
const amountImpactTypeOptions = computed(() => kind.value === 'sales'
  ? ['无金额影响', '退款', '折让', '补发成本', '返修成本']
  : ['无金额影响', '退款', '应付扣减', '补发成本', '返修成本']);
const goodsDispositionOptions = computed(() => {
  if (kind.value === 'sales') {
    return ['换货', '退货退款', '返修/返工'].includes(draft.value?.action || '')
      ? ['客户退回待检']
      : ['无实物退回'];
  }
  if (['退货换货', '退货退款', '供应商返工'].includes(draft.value?.action || '')) return ['退回供应商'];
  if (['要求补发', '补发'].includes(draft.value?.action || '')) return ['供应商补发到货'];
  return ['无实物流转'];
});
const financialTreatmentOptions = computed(() => {
  if (kind.value === 'sales') {
    if (draft.value?.action === '退货退款') return ['退款'];
    if (draft.value?.action === '退款/折让') return ['退款或折让'];
    return ['无金额调整'];
  }
  if (draft.value?.action === '退货退款') return ['供应商退款', '应付扣减'];
  if (draft.value?.action === '退款/折让') return ['应付扣减或供应商退款', '应付扣减', '供应商退款'];
  return ['无金额调整', '付款暂缓'];
});

function amountText(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(Number(value || 0)).replace('¥', '￥');
}

function taskProgressText(tasks: SalesAfterSaleExecutionTask[]) {
  if (!tasks.length && activeRemedyReceipt.value) {
    return remedyReceiptCompleteStatuses.has(activeRemedyReceipt.value.status)
      ? '入库已完成'
      : '入库流程中';
  }
  if (!tasks.length) return '受理后生成';
  const completed = tasks.filter((task) => task.status === '已完成').length;
  return `${completed}/${tasks.length} 已完成`;
}

function taskTone(status: SalesAfterSaleExecutionTask['status']) {
  if (status === '已完成') return 'done';
  if (status === '处理中') return 'tracking';
  return 'pending';
}

function optionValues(options: string[], current: string) {
  return current && !options.includes(current) ? [current, ...options] : options;
}

function handleOwnerSelect(option: ReferenceOption) {
  if (!draft.value) return;
  const employee = option.raw as { code?: string; name?: string };
  draft.value.ownerEmployeeCode = employee.code || option.code || '';
  draft.value.owner = employee.name || option.name || '';
}

function quantityNumber(value: string | undefined) {
  return Number(String(value || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] || 0);
}

function quantityText(product: AfterSalesRecord['products'][number]) {
  const qty = quantityNumber(product.qty).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
  return `${qty}${product.uom ? ` ${product.uom}` : ''}`;
}

const affectedQuantitySummary = computed(() => {
  if (!record.value?.products.length) return '—';
  const quantities = record.value.products.map((product) => quantityText(product));
  return record.value.products.length === 1
    ? quantities[0]
    : `${record.value.products.length} 项 · ${quantities.join('、')}`;
});

function canOpenRelatedDocument(path: string | undefined) {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) return false;
  return kind.value === 'sales'
    ? normalizedPath.startsWith('/sales/')
    : normalizedPath.startsWith('/purchase/');
}

const activeExecutionTasks = computed(() => (
  isEditMode.value ? draft.value?.executionTasks || [] : record.value?.executionTasks || []
));
const activeRemedyReceipt = computed(() => (
  kind.value === 'purchase'
    ? (isEditMode.value ? draft.value?.remedyReceipt : record.value?.remedyReceipt)
    : undefined
));
function taskProgressDetail(task: SalesAfterSaleExecutionTask) {
  if (task.evidence) return task.evidence;
  if (task.status === '待前置') {
    const pendingKinds = activeExecutionTasks.value
      .filter((candidate) => task.predecessorCodes?.includes(candidate.code) && candidate.status !== '已完成')
      .map((candidate) => candidate.kind);
    return pendingKinds.length ? `等待${pendingKinds.join('、')}` : '等待前置任务';
  }
  if (task.status === '待处理') return `等待${task.module}处理`;
  if (task.status === '处理中') return `${task.module}正在处理`;
  return '已完成';
}
const executionTasksComplete = computed(() => (
  (!activeRemedyReceipt.value || remedyReceiptCompleteStatuses.has(activeRemedyReceipt.value.status))
  && (
    !activeExecutionTasks.value.length
    || activeExecutionTasks.value.every((task) => task.status === '已完成')
  )
));
const confirmedAmountLabel = '确认金额';
const showResultSection = computed(() => {
  if (!record.value || isNewMode.value) return false;
  if (record.value.status === '待确认' || record.value.status === '已关闭') return true;
  if (record.value.status !== '处理中') return false;
  return executionTasksComplete.value
    || Boolean(record.value.processingResult.trim())
    || record.value.confirmedAmount > 0;
});

function sourceQuantityText(product: AfterSalesRecord['products'][number]) {
  const qty = quantityNumber(product.sourceQty || product.qty).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
  return `${qty}${product.uom ? ` ${product.uom}` : ''}`;
}

function sourceQuantityContext(product: AfterSalesRecord['products'][number]) {
  const eligibleText = `可售后基数 ${sourceQuantityText(product)}`;
  const orderedQty = quantityNumber(product.orderedQty);
  const eligibleQty = quantityNumber(product.sourceQty || product.qty);
  if (orderedQty <= 0 || Math.abs(orderedQty - eligibleQty) <= 0.0001) return eligibleText;
  const orderedText = orderedQty.toLocaleString('zh-CN', { maximumFractionDigits: 3 });
  return `${eligibleText} · 原订单 ${orderedText}${product.uom ? ` ${product.uom}` : ''}`;
}

function claimedQuantityForLine(sourceOrder: string, product: AfterSalesRecord['products'][number]) {
  const rows = kind.value === 'sales' ? sourceAfterSales.value : purchaseSourceAfterSales.value;
  return rows
    .filter((row) => row.sourceOrder === sourceOrder && row.code !== record.value?.code && row.status !== '已作废')
    .flatMap((row) => row.products)
    .filter((line) => (
      (product.sourceLineId && line.sourceLineId === product.sourceLineId)
      || (!product.sourceLineId && product.materialCode && line.materialCode === product.materialCode)
    ))
    .reduce((total, line) => total + quantityNumber(line.qty), 0);
}

function availableQuantityForLine(sourceOrder: string, product: AfterSalesRecord['products'][number]) {
  return Math.max(0, quantityNumber(product.sourceQty || product.qty) - claimedQuantityForLine(sourceOrder, product));
}

function availableQuantityText(sourceOrder: string, product: AfterSalesRecord['products'][number]) {
  const claimed = claimedQuantityForLine(sourceOrder, product);
  const available = availableQuantityForLine(sourceOrder, product);
  const unit = product.uom ? ` ${product.uom}` : '';
  if (claimed <= 0) return `本次可登记 ${available.toLocaleString('zh-CN', { maximumFractionDigits: 3 })}${unit}`;
  return `已登记 ${claimed.toLocaleString('zh-CN', { maximumFractionDigits: 3 })}${unit} · 本次可登记 ${available.toLocaleString('zh-CN', { maximumFractionDigits: 3 })}${unit}`;
}

function afterSalesRequiredLabelClass(label: string) {
  return {
    'is-required-field': afterSalesRequiredLabels.has(label),
  };
}

function contactText(row: { contact?: string; contactPhone?: string }) {
  return [row.contact, row.contactPhone].filter(Boolean).join(' · ') || '-';
}

function numericAfterSalesCode(sourceCode: string, prefix: 'SA' | 'PA', index: number) {
  const numericCode = sourceCode.replace(/[^0-9]/g, '').slice(-8) || String(index + 1).padStart(4, '0');
  return `${prefix}-${numericCode}`;
}

function today(offsetDays = 0) {
  return new Date(Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function currentAfterSalesOwner(afterSalesKind: AfterSalesKind) {
  const roleCode = afterSalesKind === 'sales' ? 'ROLE-SALES' : 'ROLE-PURCHASE';
  if (!session.user.roleCodes.includes(roleCode)) return { name: '', employeeCode: '' };
  return {
    name: session.user.name || '',
    employeeCode: '',
  };
}

function blankAfterSalesRecord(afterSalesKind: AfterSalesKind): AfterSalesRecord {
  const owner = currentAfterSalesOwner(afterSalesKind);
  return {
    kind: afterSalesKind,
    code: '系统自动生成',
    sourceOrder: '',
    partyTitle: '',
    partyRole: afterSalesKind === 'sales' ? '客户' : '供应商',
    contact: '',
    issueType: '',
    issueDescription: '',
    action: '',
    goodsDisposition: '',
    financialTreatment: '',
    responsibility: '',
    amountImpact: '待评估',
    amountImpactType: '待评估',
    estimatedAmount: 0,
    confirmedAmount: 0,
    currency: 'CNY',
    planNote: '',
    executionTasks: [],
    processingResult: '',
    confirmationNote: '',
    owner: owner.name,
    ownerEmployeeCode: owner.employeeCode,
    status: '待受理',
    nextStep: afterSalesKind === 'sales' ? '制定处理方案' : '确认采购问题',
    date: today(),
    sourceStatus: '',
    sourceAmount: '',
    sourceDate: '',
    sourceDueDate: '',
    sourceRemark: '',
    products: [],
    attachments: [],
    relatedDocuments: [],
  };
}

function prepareNewAfterSalesRecord(source?: AfterSalesRecord) {
  const empty = source ? cloneRecord(source) : blankAfterSalesRecord(kind.value);
  const currentOwner = currentAfterSalesOwner(kind.value);
  empty.code = '系统自动生成';
  empty.status = '待受理';
  empty.issueType = '';
  empty.issueDescription = '';
  empty.action = '';
  empty.goodsDisposition = '';
  empty.financialTreatment = '';
  empty.responsibility = '';
  empty.amountImpact = '待评估';
  empty.amountImpactType = '待评估';
  empty.estimatedAmount = 0;
  empty.confirmedAmount = 0;
  empty.planNote = '';
  empty.executionTasks = [];
  empty.processingResult = '';
  empty.confirmationNote = '';
  empty.owner = source ? empty.owner : currentOwner.name;
  empty.ownerEmployeeCode = source ? empty.ownerEmployeeCode : currentOwner.employeeCode;
  empty.nextStep = kind.value === 'sales' ? '制定处理方案' : '确认采购问题';
  empty.date = today();
  empty.attachments = [];
  return empty;
}

function salesTemplate(index: number) {
  const templates = [
    { issueType: '签收差异', action: '补发资料', responsibility: '销售跟进', status: '待受理' as AfterSalesStatus, nextStep: '确认客户诉求', amountImpact: '待评估' },
    { issueType: '退换补', action: '补寄配件', responsibility: '仓库协同', status: '处理中' as AfterSalesStatus, nextStep: '安排补发或换货', amountImpact: '预计无退款' },
    { issueType: '质量反馈', action: '质检复核', responsibility: '质检协同', status: '待确认' as AfterSalesStatus, nextStep: '确认处理结果', amountImpact: '可能折让' },
    { issueType: '客户回访', action: '已完成回访', responsibility: '销售负责', status: '已关闭' as AfterSalesStatus, nextStep: '归档完成', amountImpact: '无' },
  ];
  return templates[index % templates.length];
}

function purchaseTemplate(index: number) {
  const templates = [
    { issueType: '来料差异', action: '供应商补发', responsibility: '供应商负责', status: '待受理' as AfterSalesStatus, nextStep: '确认差异数量', amountImpact: '待评估' },
    { issueType: '退换货', action: '退回换货', responsibility: '采购协同仓库', status: '处理中' as AfterSalesStatus, nextStep: '安排退货出库', amountImpact: '暂不付款' },
    { issueType: '扣款折让', action: '协商扣款', responsibility: '采购跟进', status: '待确认' as AfterSalesStatus, nextStep: '确认扣款结果', amountImpact: '待供应商确认' },
    { issueType: '供应商回访', action: '已归档', responsibility: '采购负责', status: '已关闭' as AfterSalesStatus, nextStep: '归档完成', amountImpact: '无' },
  ];
  return templates[index % templates.length];
}

function recordFromSalesOrder(order: SalesOrder, index: number): AfterSalesRecord {
  const template = salesTemplate(index);
  const eligibleProducts = order.afterSalesEligibleProducts ?? order.products;
  return {
    kind: 'sales',
    code: numericAfterSalesCode(order.code, 'SA', index),
    sourceOrder: order.code,
    partyTitle: order.customer,
    partyRole: '客户',
    contact: contactText(order),
    issueType: template.issueType,
    issueDescription: '',
    action: template.action,
    goodsDisposition: '',
    financialTreatment: '',
    responsibility: template.responsibility,
    amountImpact: template.amountImpact,
    amountImpactType: '待评估',
    estimatedAmount: 0,
    confirmedAmount: 0,
    currency: 'CNY',
    planNote: '',
    executionTasks: [],
    processingResult: '',
    confirmationNote: '',
    owner: order.afterSalesOwner || order.owner || '待分配',
    ownerEmployeeCode: order.afterSalesOwnerEmployeeCode || order.ownerEmployeeCode || '',
    status: template.status,
    nextStep: template.nextStep,
    date: order.delivery || order.date,
    sourceStatus: order.documentStatus || order.status,
    sourceAmount: order.amount,
    sourceDate: order.date,
    sourceDueDate: order.delivery,
    sourceRemark: order.supplementaryRequirement || order.internalRemark || '',
    products: eligibleProducts.map((product) => ({
      sourceLineId: product.lineId,
      materialCode: product.materialCode,
      name: product.name,
      model: product.model,
      spec: product.spec,
      qty: '',
      sourceQty: product.qty,
      orderedQty: product.orderedQty,
      uom: product.uom,
    })),
    attachments: order.attachments || [],
    relatedDocuments: order.relatedDocuments ? order.relatedDocuments.map((document) => ({ ...document })) : [],
  };
}

function recordFromSalesAfterSale(row: SalesAfterSale): AfterSalesRecord {
  return {
    kind: 'sales',
    code: row.code,
    revision: Number((row as SalesAfterSale & { revision?: number }).revision || 0),
    sourceOrder: row.sourceOrder,
    partyTitle: row.customer,
    partyRole: '客户',
    contact: contactText(row),
    issueType: row.issueType,
    issueDescription: row.issueDescription || '',
    action: row.action,
    goodsDisposition: row.goodsDisposition || '',
    financialTreatment: row.financialTreatment || '',
    responsibility: row.responsibility,
    amountImpact: row.amountImpact,
    amountImpactType: row.amountImpactType || '待评估',
    estimatedAmount: Number(row.estimatedAmount || 0),
    confirmedAmount: Number(row.confirmedAmount || 0),
    currency: 'CNY',
    planNote: row.planNote || '',
    executionTasks: (row.executionTasks || []).map((task) => ({ ...task })),
    processingResult: row.processingResult || '',
    confirmationNote: row.confirmationNote || '',
    owner: row.owner,
    ownerEmployeeCode: row.ownerEmployeeCode || '',
    status: row.status,
    nextStep: row.nextStep,
    date: row.date,
    sourceStatus: row.sourceStatus,
    sourceAmount: row.sourceAmount,
    sourceDate: row.sourceDate,
    sourceDueDate: row.sourceDueDate,
    sourceRemark: row.sourceRemark,
    products: row.products.map((product) => ({
      sourceLineId: product.sourceLineId,
      materialCode: product.materialCode,
      name: product.name,
      model: product.model,
      spec: product.spec,
      qty: String(quantityNumber(product.qty)),
      sourceQty: product.sourceQty,
      uom: product.uom,
    })),
    attachments: row.attachments || [],
    relatedDocuments: row.relatedDocuments ? row.relatedDocuments.map((document) => ({ ...document })) : [],
  };
}

function salesAfterSaleFromRecord(row: AfterSalesRecord): SalesAfterSale {
  const sourceOrder = sourceOrders.value.find((order) => order.code === row.sourceOrder);
  const result: SalesAfterSale & { revision?: number } = {
    code: row.code,
    revision: row.revision,
    companyCode: sourceOrder?.companyCode,
    company: sourceOrder?.company,
    sourceOrder: row.sourceOrder,
    customerCode: sourceOrder?.customerCode,
    customer: row.partyTitle,
    contact: sourceOrder?.contact || row.contact.split(' · ')[0] || '',
    contactPhone: sourceOrder?.contactPhone || row.contact.split(' · ')[1] || '',
    issueType: row.issueType,
    issueDescription: row.issueDescription,
    action: row.action,
    goodsDisposition: row.goodsDisposition,
    financialTreatment: row.financialTreatment,
    responsibility: row.responsibility,
    amountImpact: row.amountImpact,
    amountImpactType: row.amountImpactType as SalesAfterSale['amountImpactType'],
    estimatedAmount: row.estimatedAmount,
    confirmedAmount: row.confirmedAmount,
    currency: row.currency,
    planNote: row.planNote,
    executionTasks: row.executionTasks.map((task) => ({ ...task })),
    processingResult: row.processingResult,
    confirmationNote: row.confirmationNote,
    owner: row.owner,
    ownerEmployeeCode: row.ownerEmployeeCode,
    status: row.status,
    nextStep: row.nextStep,
    date: row.date,
    sourceStatus: row.sourceStatus,
    sourceAmount: row.sourceAmount,
    sourceDate: row.sourceDate,
    sourceDueDate: row.sourceDueDate,
    sourceRemark: row.sourceRemark,
    products: row.products.filter((product) => quantityNumber(product.qty) > 0).map((product) => {
      const sourceProduct = sourceOrder?.products.find((item) => (
        (product.sourceLineId && item.lineId === product.sourceLineId)
        || (product.materialCode && item.materialCode === product.materialCode)
      ));
      return {
        ...(sourceProduct || {}),
        sourceLineId: product.sourceLineId,
        materialCode: product.materialCode,
        name: product.name,
        model: product.model,
        spec: product.spec,
        qty: `${quantityNumber(product.qty)}${product.uom ? ` ${product.uom}` : ''}`,
        sourceQty: product.sourceQty,
        unitPrice: sourceProduct?.unitPrice || '',
        amount: sourceProduct?.amount || '',
        uom: product.uom,
      };
    }),
    attachments: row.attachments,
    relatedDocuments: row.relatedDocuments ? row.relatedDocuments.map((document) => ({ ...document })) : [],
  };
  return result;
}

function applySourceOrder() {
  if (!draft.value) return;
  if (kind.value === 'purchase') {
    const order = purchaseSourceOrders.value.find((row) => row.code === draft.value?.sourceOrder);
    if (!order) return;
    const source = recordFromPurchaseOrder(order, 0);
    draft.value = {
      ...draft.value,
      sourceOrder: source.sourceOrder,
      partyTitle: source.partyTitle,
      contact: source.contact,
      owner: source.owner,
      ownerEmployeeCode: source.ownerEmployeeCode,
      date: draft.value.date || today(),
      sourceStatus: source.sourceStatus,
      sourceAmount: source.sourceAmount,
      sourceDate: source.sourceDate,
      sourceDueDate: source.sourceDueDate,
      sourceRemark: source.sourceRemark,
      products: source.products,
      relatedDocuments: source.relatedDocuments,
    };
    record.value = cloneRecord(draft.value);
    return;
  }
  const order = sourceOrders.value.find((row) => row.code === draft.value?.sourceOrder);
  if (!order) return;
  const source = recordFromSalesOrder(order, 0);
  draft.value = {
    ...draft.value,
    sourceOrder: source.sourceOrder,
    partyTitle: source.partyTitle,
    contact: source.contact,
    owner: source.owner,
    ownerEmployeeCode: source.ownerEmployeeCode,
    date: draft.value.date || today(),
    sourceStatus: source.sourceStatus,
    sourceAmount: source.sourceAmount,
    sourceDate: source.sourceDate,
    sourceDueDate: source.sourceDueDate,
    sourceRemark: source.sourceRemark,
    products: source.products,
  };
  record.value = cloneRecord(draft.value);
}

const selectedSourceOrderLabel = computed(() => {
  const sourceCode = draft.value?.sourceOrder || '';
  if (!sourceCode) return '';
  if (kind.value === 'purchase') {
    const order = purchaseSourceOrders.value.find((row) => row.code === sourceCode);
    return order ? `${order.code} · ${order.supplier}` : sourceCode;
  }
  const order = sourceOrders.value.find((row) => row.code === sourceCode);
  return order ? `${order.code} · ${order.customer}` : sourceCode;
});

function handleSourceOrderSelect(option: ReferenceOption) {
  if (!draft.value) return;
  if (!option.code) {
    draft.value.sourceOrder = '';
    draft.value.partyTitle = '';
    draft.value.contact = '';
    draft.value.products = [];
    draft.value.relatedDocuments = [];
    record.value = cloneRecord(draft.value);
    return;
  }
  if (kind.value === 'purchase') {
    const selectedOrder = option.raw as PurchaseOrder;
    if (selectedOrder?.code && !purchaseSourceOrders.value.some((row) => row.code === selectedOrder.code)) {
      purchaseSourceOrders.value.push(selectedOrder);
    }
  } else {
    const selectedOrder = option.raw as SalesOrder;
    if (selectedOrder?.code) {
      const index = sourceOrders.value.findIndex((row) => row.code === selectedOrder.code);
      if (index >= 0) sourceOrders.value[index] = selectedOrder;
      else sourceOrders.value.push(selectedOrder);
    }
  }
  draft.value.sourceOrder = option.code;
  applySourceOrder();
}

function recordFromPurchaseOrder(order: PurchaseOrder, index: number): AfterSalesRecord {
  const template = purchaseTemplate(index);
  return {
    kind: 'purchase',
    code: numericAfterSalesCode(order.code, 'PA', index),
    sourceOrder: order.code,
    partyTitle: order.supplier,
    partyRole: '供应商',
    contact: contactText(order),
    issueType: template.issueType,
    issueDescription: '',
    action: template.action,
    goodsDisposition: '',
    financialTreatment: '',
    responsibility: template.responsibility,
    amountImpact: template.amountImpact,
    amountImpactType: '待评估',
    estimatedAmount: 0,
    confirmedAmount: 0,
    currency: 'CNY',
    planNote: '',
    executionTasks: [],
    processingResult: '',
    confirmationNote: '',
    owner: order.afterSalesOwner || order.owner || '待分配',
    ownerEmployeeCode: order.afterSalesOwnerEmployeeCode || order.ownerEmployeeCode || '',
    status: template.status,
    nextStep: template.nextStep,
    date: order.expectedDate || order.date,
    sourceStatus: order.status,
    sourceAmount: order.amount,
    sourceDate: order.date,
    sourceDueDate: order.expectedDate,
    sourceRemark: order.remark || '',
    products: order.products.map((product) => ({
      sourceLineId: product.lineId,
      materialCode: product.materialCode,
      name: product.name,
      model: product.model,
      spec: product.spec,
      qty: '',
      sourceQty: product.qty,
      uom: product.uom,
    })),
    attachments: order.attachments || [],
    relatedDocuments: (order.relatedDocuments || []).filter((document) => !['采购申请', '采购售后'].includes(document.type)),
  };
}

function recordFromPurchaseAfterSale(row: PurchaseAfterSale): AfterSalesRecord {
  return {
    kind: 'purchase',
    code: row.code,
    revision: Number((row as PurchaseAfterSale & { revision?: number }).revision || 0),
    sourceOrder: row.sourceOrder,
    partyTitle: row.supplier,
    partyRole: '供应商',
    contact: contactText(row),
    issueType: row.issueType,
    issueDescription: row.issueDescription || '',
    action: row.action,
    goodsDisposition: row.goodsDisposition || '',
    financialTreatment: row.financialTreatment || '',
    responsibility: row.responsibility,
    amountImpact: row.amountImpact,
    amountImpactType: row.amountImpactType || '待评估',
    estimatedAmount: Number(row.estimatedAmount || 0),
    confirmedAmount: Number(row.confirmedAmount || 0),
    currency: 'CNY',
    planNote: row.planNote || '',
    executionTasks: (row.executionTasks || []).map((task) => ({ ...task })),
    processingResult: row.processingResult || '',
    confirmationNote: row.confirmationNote || '',
    owner: row.owner,
    ownerEmployeeCode: row.ownerEmployeeCode || '',
    status: row.status,
    nextStep: row.nextStep,
    date: row.date,
    sourceStatus: row.sourceStatus,
    sourceAmount: row.sourceAmount,
    sourceDate: row.sourceDate,
    sourceDueDate: row.sourceDueDate,
    sourceRemark: row.sourceRemark,
    products: row.products.map((product) => ({
      sourceLineId: product.sourceLineId || product.lineId,
      materialCode: product.materialCode,
      name: product.name,
      model: product.model,
      spec: product.spec,
      qty: String(quantityNumber(product.qty)),
      sourceQty: product.sourceQty,
      uom: product.uom,
    })),
    attachments: row.attachments || [],
    remedyReceipt: row.remedyReceipt ? { ...row.remedyReceipt } : undefined,
    relatedDocuments: row.relatedDocuments ? row.relatedDocuments.map((document) => ({ ...document })) : [],
  };
}

function purchaseAfterSaleFromRecord(row: AfterSalesRecord): PurchaseAfterSale {
  const sourceOrder = purchaseSourceOrders.value.find((order) => order.code === row.sourceOrder);
  const result: PurchaseAfterSale & { revision?: number } = {
    code: row.code,
    revision: row.revision,
    companyCode: sourceOrder?.companyCode,
    company: sourceOrder?.company,
    sourceOrder: row.sourceOrder,
    supplierCode: sourceOrder?.supplierCode,
    supplier: row.partyTitle,
    contact: sourceOrder?.contact || row.contact.split(' · ')[0] || '',
    contactPhone: sourceOrder?.contactPhone || row.contact.split(' · ')[1] || '',
    issueType: row.issueType,
    issueDescription: row.issueDescription,
    action: row.action,
    goodsDisposition: row.goodsDisposition,
    financialTreatment: row.financialTreatment,
    responsibility: row.responsibility,
    amountImpact: row.amountImpact,
    amountImpactType: row.amountImpactType,
    estimatedAmount: row.estimatedAmount,
    confirmedAmount: row.confirmedAmount,
    currency: row.currency,
    planNote: row.planNote,
    executionTasks: row.executionTasks.map((task) => ({ ...task })),
    processingResult: row.processingResult,
    confirmationNote: row.confirmationNote,
    owner: row.owner,
    ownerEmployeeCode: row.ownerEmployeeCode,
    status: row.status,
    nextStep: row.nextStep,
    date: row.date,
    sourceStatus: row.sourceStatus,
    sourceAmount: row.sourceAmount,
    sourceDate: row.sourceDate,
    sourceDueDate: row.sourceDueDate,
    sourceRemark: row.sourceRemark,
    products: row.products.map((product) => {
      const sourceProduct = sourceOrder?.products.find((item) => (
        (product.sourceLineId && item.lineId === product.sourceLineId)
        || (product.materialCode && item.materialCode === product.materialCode)
      ));
      return {
        ...(sourceProduct || {}),
        sourceLineId: product.sourceLineId,
        materialCode: product.materialCode,
        name: product.name,
        model: product.model,
        spec: product.spec,
        qty: `${quantityNumber(product.qty)}${product.uom ? ` ${product.uom}` : ''}`,
        sourceQty: product.sourceQty,
        unitPrice: sourceProduct?.unitPrice || '',
        amount: sourceProduct?.amount || '',
        uom: product.uom,
      };
    }),
    attachments: row.attachments,
    remedyReceipt: row.remedyReceipt ? { ...row.remedyReceipt } : undefined,
    relatedDocuments: row.relatedDocuments ? row.relatedDocuments.map((document) => ({ ...document })) : [],
  };
  return result;
}

const afterSalesSourceOptions = computed(() => (
  kind.value === 'sales'
    ? sourceOrders.value
      .filter((order) => (order.afterSalesEligibleProducts ?? order.products).some((product) => availableQuantityForLine(order.code, {
        sourceLineId: product.lineId,
        materialCode: product.materialCode,
        name: product.name,
        qty: product.qty,
        sourceQty: product.qty,
        uom: product.uom,
      }) > 0))
      .map((order) => ({ code: order.code, label: `${order.code} · ${order.customer}` }))
    : purchaseSourceOrders.value
      .filter((order) => order.products.some((product) => availableQuantityForLine(order.code, {
        sourceLineId: product.lineId,
        materialCode: product.materialCode,
        name: product.name,
        qty: product.qty,
        sourceQty: product.qty,
        uom: product.uom,
      }) > 0))
      .map((order) => ({ code: order.code, label: `${order.code} · ${order.supplier}` }))
));
const newAfterSalesProductRows = computed(() => {
  if (!draft.value || !isNewMode.value || !draft.value.sourceOrder) return [];
  return draft.value.products.filter((product) => (
    availableQuantityForLine(draft.value!.sourceOrder, product) > 0
  ));
});

function cloneRecord(row: AfterSalesRecord): AfterSalesRecord {
  return {
    ...row,
    products: row.products.map((product) => ({ ...product })),
    executionTasks: row.executionTasks.map((task) => ({ ...task })),
    attachments: row.attachments.map((attachment) => ({ ...attachment })),
    remedyReceipt: row.remedyReceipt ? { ...row.remedyReceipt } : undefined,
    relatedDocuments: row.relatedDocuments?.map((document) => ({ ...document })),
  };
}

async function loadRecord() {
  if (!code.value && !isNewMode.value) {
    record.value = null;
    draft.value = null;
    loadMessage.value = '缺少售后单号，请返回列表重新选择。';
    return;
  }

  isLoading.value = true;
  loadMessage.value = '';

  try {
    if (kind.value === 'sales') {
      const [orders, afterSalesRows] = await Promise.all([listSalesOrders(), listSalesAfterSales()]);
      sourceAfterSales.value = afterSalesRows;
      sourceOrders.value = orders.filter(
        (row) => {
          const documentStatus = String(row.documentStatus || row.status);
          const deliveredQty = Number(
            row.progressFacts?.delivery?.outboundQty
            || row.deliveryProgress?.outboundQty
            || ((row.progressFacts?.delivery?.status || row.deliveryProgress?.status) === '已签收' ? 1 : 0),
          );
          return !['草稿', '已作废', '已取消'].includes(documentStatus) && deliveredQty > 0;
        },
      );
      if (isNewMode.value) {
        const sourceCode = typeof route.query.source === 'string' ? route.query.source : '';
        const source = sourceOrders.value.find((row) => row.code === sourceCode);
        const empty = prepareNewAfterSalesRecord(source ? recordFromSalesOrder(source, 0) : undefined);
        record.value = empty;
        draft.value = cloneRecord(empty);
        flowRecords.value = [];
        return;
      }
      const payload = await getSalesAfterSale(code.value);
      const found = recordFromSalesAfterSale(payload.record);
      record.value = found;
      draft.value = cloneRecord(found);
      flowRecords.value = payload.flowRecords;
      return;
    }

    const [purchaseOrders, purchaseAfterSalesRows] = await Promise.all([
      listPurchaseOrders(),
      listPurchaseAfterSales(),
    ]);
    purchaseSourceAfterSales.value = purchaseAfterSalesRows;
    purchaseSourceOrders.value = purchaseOrders
      .filter((row) => !['草稿', '已作废', '已取消'].includes(row.status));
    if (isNewMode.value) {
      const sourceCode = typeof route.query.source === 'string' ? route.query.source : '';
      const source = purchaseSourceOrders.value.find((row) => row.code === sourceCode);
      const empty = prepareNewAfterSalesRecord(source ? recordFromPurchaseOrder(source, 0) : undefined);
      record.value = empty;
      draft.value = cloneRecord(empty);
      flowRecords.value = [];
      return;
    }
    const payload = await getPurchaseAfterSale(code.value);
    const found = recordFromPurchaseAfterSale(payload.record);
    record.value = found;
    draft.value = cloneRecord(found);
    flowRecords.value = payload.flowRecords;
  } catch (error) {
    record.value = null;
    draft.value = null;
    loadMessage.value = error instanceof Error ? error.message : '售后单据加载失败';
  } finally {
    isLoading.value = false;
  }
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2200);
}

async function handleAfterSalesMoreAction(action: AfterSalesMoreAction) {
  afterSalesMoreActionsOpen.value = false;
  if (action.key === 'change') {
    await router.push(editPath.value);
    return;
  }
  if (action.key === 'void' && record.value) {
    const confirmed = await requestActionConfirmation({
      title: `作废${moduleTitle.value} ${record.value.code}？`,
      message: '作废后该售后单将停止受理和执行，既有问题、附件与日志仍保留用于追溯。',
      confirmLabel: '确认作废',
      tone: 'danger',
    });
    if (!confirmed) return;

    await runAfterSalesAction('void', async () => {
      try {
        const payload = kind.value === 'sales'
          ? await voidSalesAfterSale(record.value!.code, Number(record.value!.revision || 0))
          : await voidPurchaseAfterSale(record.value!.code, Number(record.value!.revision || 0));
        const updated = kind.value === 'sales'
          ? recordFromSalesAfterSale(payload.record as SalesAfterSale)
          : recordFromPurchaseAfterSale(payload.record as PurchaseAfterSale);
        record.value = updated;
        draft.value = cloneRecord(updated);
        flowRecords.value = payload.flowRecords;
        showToast(`${updated.code} 已作废`);
      } catch (error) {
        showToast(error instanceof Error ? error.message : `${moduleTitle.value}作废失败`, 'error');
      }
    });
  }
}

function handleAfterSalesAttachmentUpload(event: Event) {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (!input) return;
  if (isAfterSalesReadOnly.value) {
    input.value = '';
    showToast(afterSalesAttachmentTitle.value, 'error');
    return;
  }

  const files = attachmentsFromFileList(input.files);
  if (files.length && draft.value) {
    draft.value.attachments = [...draft.value.attachments, ...files];
    showToast(`已选择 ${files.length} 个附件，保存后随${moduleTitle.value}保留。`);
  }
  input.value = '';
}

async function saveDraft() {
  if (!draft.value) return;
  if (!canWriteAfterSales.value) {
    showToast(writeReadonlyReason.value, 'error');
    return;
  }
  const requiredValues = [
    ['sourceOrder', draft.value.sourceOrder],
    ['issueType', draft.value.issueType],
    ['issueDescription', draft.value.issueDescription],
    ['owner', draft.value.owner],
    ...(!isNewMode.value && record.value?.status === '待受理'
      ? [
          ['action', draft.value.action],
          ['goodsDisposition', draft.value.goodsDisposition],
          ['financialTreatment', draft.value.financialTreatment],
          ['amountImpactType', draft.value.amountImpactType],
        ] as const
      : []),
  ] as const;
  const missingField = requiredValues.find(([, value]) => !String(value || '').trim())?.[0];
  if (missingField) {
    showToast(!isNewMode.value && record.value?.status === '待受理'
      ? '请补齐处理方案、实物流向、商务调整和金额影响'
      : '请补齐来源订单、问题类型、问题说明和负责人', 'error');
    await nextTick();
    const field = document.querySelector<HTMLElement>(`[data-after-sales-field="${missingField}"]`);
    scrollElementIntoView(field);
    field?.querySelector<HTMLElement>('input, select, textarea')?.focus();
    return;
  }
  if (
    !isNewMode.value
    && record.value?.status === '待确认'
    && !draft.value.confirmationNote.trim()
  ) {
    showToast(`请填写${kind.value === 'sales' ? '客户' : '供应商'}确认依据`, 'error');
    await nextTick();
    const field = document.querySelector<HTMLElement>('[data-after-sales-field="confirmationNote"]');
    scrollElementIntoView(field);
    field?.querySelector<HTMLElement>('textarea')?.focus();
    return;
  }
  const affectedProducts = isNewMode.value
    ? draft.value.products.filter((product) => quantityNumber(product.qty) > 0)
    : draft.value.products;
  const invalidProduct = affectedProducts.find((product) => {
    const affectedQty = quantityNumber(product.qty);
    const availableQty = isNewMode.value
      ? availableQuantityForLine(draft.value!.sourceOrder, product)
      : quantityNumber(product.sourceQty || product.qty);
    return affectedQty <= 0 || affectedQty > availableQty;
  });
  if (!affectedProducts.length || invalidProduct) {
    showToast(invalidProduct
      ? `“${invalidProduct.name}”的受影响数量不能超过本次可登记数量`
      : '请至少为一项商品填写受影响数量', 'error');
    return;
  }
  if (
    !isNewMode.value
    && record.value?.status === '待受理'
    && draft.value.amountImpactType !== '无金额影响'
    && draft.value.estimatedAmount <= 0
  ) {
    showToast('请填写预计金额', 'error');
    return;
  }
  if (kind.value === 'sales') {
    await runAfterSalesAction('save', async () => {
      try {
        const payload = await saveSalesAfterSale(salesAfterSaleFromRecord(draft.value!));
        const saved = recordFromSalesAfterSale(payload.record);
        record.value = saved;
        draft.value = cloneRecord(saved);
        flowRecords.value = payload.flowRecords;
        resetUnsavedChanges();
        showToast(isNewMode.value ? '销售售后已登记' : '销售售后已保存');
        await router.push(`${listPath.value}/${encodeURIComponent(saved.code)}`);
      } catch (error) {
        showToast(error instanceof Error ? error.message : '销售售后保存失败', 'error');
      }
    });
    return;
  }
  await runAfterSalesAction('save', async () => {
    try {
      const payload = await savePurchaseAfterSale(purchaseAfterSaleFromRecord(draft.value!));
      const saved = recordFromPurchaseAfterSale(payload.record);
      record.value = saved;
      draft.value = cloneRecord(saved);
      flowRecords.value = payload.flowRecords;
      resetUnsavedChanges();
      showToast(isNewMode.value ? '采购售后已登记' : '采购售后已保存');
      await router.push(`${listPath.value}/${encodeURIComponent(saved.code)}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '采购售后保存失败', 'error');
    }
  });
}

async function advanceStatus() {
  if (!record.value || !canAdvanceStatus.value) return;
  const action = statusAction.value;
  const consequences: Record<AfterSalesStatus, string> = {
    待受理: '受理后将生成并启动对应执行任务，问题事实与处理方案将进入受控状态。',
    处理中: '提交结果后将等待客户或供应商确认，执行结果不能再按登记阶段随意修改。',
    待确认: '关闭后该售后流程结束，后续调整需通过新的售后记录处理。',
    已关闭: '该售后单已经关闭。',
    已作废: '该售后单已经作废。',
  };
  const confirmed = await requestActionConfirmation({
    title: `${action.label}${moduleTitle.value} ${record.value.code}？`,
    message: consequences[record.value.status],
    confirmLabel: `确认${action.label}`,
  });
  if (!confirmed) return;

  if (kind.value === 'sales') {
    await runAfterSalesAction('advance', async () => {
      try {
        const payload = await advanceSalesAfterSale(
          record.value!.code,
          Number(record.value!.revision || 0),
        );
        const updated = recordFromSalesAfterSale(payload.record);
        record.value = updated;
        draft.value = cloneRecord(updated);
        flowRecords.value = payload.flowRecords;
        showToast(`${updated.code} 已${action.label}`);
      } catch (error) {
        showToast(error instanceof Error ? error.message : '售后状态更新失败', 'error');
      }
    });
    return;
  }
  await runAfterSalesAction('advance', async () => {
    try {
      const payload = await advancePurchaseAfterSale(
        record.value!.code,
        Number(record.value!.revision || 0),
      );
      const updated = recordFromPurchaseAfterSale(payload.record);
      record.value = updated;
      draft.value = cloneRecord(updated);
      flowRecords.value = payload.flowRecords;
      showToast(`${updated.code} 已${action.label}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '采购售后状态更新失败', 'error');
    }
  });
}

watch(
  () => draft.value?.action,
  () => {
    if (!draft.value || isNewMode.value || record.value?.status !== '待受理') return;
    if (!goodsDispositionOptions.value.includes(draft.value.goodsDisposition)) {
      draft.value.goodsDisposition = goodsDispositionOptions.value[0] || '';
    }
    if (!financialTreatmentOptions.value.includes(draft.value.financialTreatment)) {
      draft.value.financialTreatment = financialTreatmentOptions.value[0] || '';
    }
    if (['无金额调整', '付款暂缓'].includes(draft.value.financialTreatment)) {
      draft.value.amountImpactType = '无金额影响';
      draft.value.estimatedAmount = 0;
    } else if (draft.value.amountImpactType === '无金额影响' || draft.value.amountImpactType === '待评估') {
      draft.value.amountImpactType = kind.value === 'purchase' ? '应付扣减' : '退款';
    }
  },
);

watch(
  () => draft.value?.financialTreatment,
  (financialTreatment) => {
    if (!draft.value || isNewMode.value || record.value?.status !== '待受理') return;
    if (['无金额调整', '付款暂缓'].includes(financialTreatment || '')) {
      draft.value.amountImpactType = '无金额影响';
      draft.value.estimatedAmount = 0;
    } else if (draft.value.amountImpactType === '无金额影响' || draft.value.amountImpactType === '待评估') {
      draft.value.amountImpactType = kind.value === 'purchase' ? '应付扣减' : '退款';
    }
  },
);

watch(
  () => [kind.value, code.value],
  () => {
    void loadRecord();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section
      v-if="record && draft"
      class="quote-editor after-sales-editor"
      :class="{ 'is-detail-view': !isEditMode }"
    >
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" :to="listPath" :aria-label="`返回${moduleTitle}列表`" :title="`返回${moduleTitle}列表`">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ isEditMode ? pageHeading : record.code }}</strong>
        </template>

        <template #actions>
          <template v-if="!isEditMode">
            <PinReferenceButton
              class="topbar-optional-action"
              :title="`${moduleTitle} ${record.code}`"
              :subtitle="`${record.partyTitle} · ${record.status}`"
              :path="detailPath"
            />
            <button class="secondary-action topbar-optional-action" type="button" :title="`查看${moduleTitle}日志`" @click="showFlowRecords = true">
              <FileText :size="15" />
              日志
            </button>
            <div
              v-if="afterSalesMoreActions.length"
              class="order-more-action-wrap"
              @keydown.esc.stop="afterSalesMoreActionsOpen = false"
              @mouseleave="afterSalesMoreActionsOpen = false"
            >
              <button
                class="secondary-action"
                type="button"
                title="更多操作"
                aria-haspopup="menu"
                aria-controls="detail-more-menu"
                :aria-expanded="afterSalesMoreActionsOpen"
                @click="afterSalesMoreActionsOpen = !afterSalesMoreActionsOpen"
              >
                更多
              </button>
              <div v-if="afterSalesMoreActionsOpen" id="detail-more-menu" class="order-more-menu" role="menu">
                <button
                  v-for="action in afterSalesMoreActions"
                  :key="action.key"
                  type="button"
                  role="menuitem"
                  :class="{ 'danger-option': action.tone === 'danger' }"
                  :title="action.description"
                  @click="handleAfterSalesMoreAction(action)"
                >
                  <strong>{{ action.label }}</strong>
                  <span>{{ action.description }}</span>
                </button>
              </div>
            </div>
            <RouterLink
              v-if="advanceBlockReason && canWriteAfterSales && !hasIncompleteExecutionWork"
              class="primary-action"
              :to="editPath"
              :title="afterSalesPrimaryActionTitle"
            >
              <FileText :size="15" />
              {{ missingRequiredActionLabel }}
            </RouterLink>
            <button
              v-else
              class="primary-action"
              type="button"
              :disabled="!canAdvanceStatus || isAfterSalesActionPending"
              :aria-busy="activeAfterSalesAction === 'advance'"
              :title="afterSalesPrimaryActionTitle"
              @click="advanceStatus"
            >
              <CheckCircle2 :size="15" />
              {{ activeAfterSalesAction === 'advance' ? '处理中' : primaryActionLabel }}
            </button>
          </template>

          <template v-else>
            <RouterLink class="secondary-action" :to="isNewMode ? listPath : detailPath" :title="afterSalesCancelActionTitle">取消</RouterLink>
            <button
              class="primary-action"
              type="button"
              :disabled="!canWriteAfterSales || isAfterSalesActionPending"
              :aria-busy="activeAfterSalesAction === 'save'"
              :title="afterSalesSaveActionTitle"
              @click="saveDraft"
            >
              <Save :size="15" />
              {{ afterSalesSaveActionLabel }}
            </button>
          </template>
        </template>

        <template #fallback>
          <div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1></div></div>
        </template>
      </PageTopbarPortal>

      <section v-if="!isEditMode" class="order-next-step-strip" :class="`tone-${nextStepTone}`">
        <div>
          <span>下一步</span>
          <strong>{{ record.nextStep }}</strong>
        </div>
        <b>{{ nextStepBadge }}</b>
      </section>

      <div class="quote-form-grid">
        <div class="quote-main-sections">
          <section v-if="isSalesFollowUpEdit" class="form-section after-sales-follow-up-summary">
            <div class="section-heading">
              <h2>售后概要</h2>
            </div>
            <dl class="material-fact-grid after-sales-fact-grid">
              <div><dt>问题类型</dt><dd>{{ record.issueType }}</dd></div>
              <div><dt>{{ record.partyRole }}</dt><dd>{{ record.partyTitle }}</dd></div>
              <div><dt>处理方式</dt><dd>{{ record.action }}</dd></div>
              <div>
                <dt>来源订单</dt>
                <dd><RouterLink class="fact-link" :to="sourcePath">{{ record.sourceOrder }}</RouterLink></dd>
              </div>
              <div><dt>受影响数量</dt><dd>{{ affectedQuantitySummary }}</dd></div>
              <div><dt>金额影响</dt><dd>{{ record.amountImpact }}</dd></div>
              <div class="after-sales-fact-wide"><dt>问题说明</dt><dd class="fact-long-text">{{ record.issueDescription }}</dd></div>
            </dl>
            <label class="form-field after-sales-follow-up-owner" data-after-sales-field="owner" :class="afterSalesRequiredLabelClass('负责人')">
              <span>当前负责人</span>
              <ReferencePicker
                required
                v-model="draft.ownerEmployeeCode"
                type="employees"
                :kind="kind === 'sales' ? 'sales-after-sales-owner' : 'purchase-after-sales-owner'"
                title="选择售后负责人"
                placeholder="选择售后负责人"
                search-placeholder="搜索员工姓名、部门、手机号或邮箱"
                :display-value="draft.owner"
                @select="handleOwnerSelect"
              />
            </label>
          </section>

          <section v-if="!isSalesFollowUpEdit" class="form-section">
            <div class="section-heading">
              <h2>问题登记</h2>
            </div>

            <dl
              v-if="!isEditMode || (kind === 'sales' && record.status !== '待受理')"
              class="material-fact-grid after-sales-fact-grid"
            >
              <div><dt>登记日期</dt><dd>{{ record.date }}</dd></div>
              <div v-if="!isEditMode"><dt>负责人</dt><dd>{{ record.owner }}</dd></div>
              <div><dt>问题类型</dt><dd>{{ record.issueType }}</dd></div>
              <div class="after-sales-fact-wide"><dt>问题说明</dt><dd class="fact-long-text">{{ record.issueDescription }}</dd></div>
            </dl>
            <div v-if="isEditMode" class="quote-fields">
              <label v-if="isNewMode" class="form-field field-span-2 is-required-field" data-after-sales-field="sourceOrder">
                <span>{{ sourceTitle }}</span>
                <ReferencePicker
                  v-model="draft.sourceOrder"
                  :display-value="selectedSourceOrderLabel"
                  :type="kind === 'sales' ? 'sales-orders' : 'purchase-orders'"
                  :title="`选择来源${sourceTitle}`"
                  :placeholder="afterSalesSourceOptions.length ? `选择来源${sourceTitle}` : `暂无可登记售后的${sourceTitle}`"
                  :search-placeholder="kind === 'sales' ? '搜索销售订单号、客户或负责人' : '搜索采购订单号、供应商或采购员'"
                  kind="after-sales"
                  :disabled="!afterSalesSourceOptions.length"
                  empty-text="没有可登记剩余数量的来源订单"
                  required
                  @select="handleSourceOrderSelect"
                />
              </label>
              <label class="form-field" data-after-sales-field="owner" :class="afterSalesRequiredLabelClass('负责人')">
                <span>负责人</span>
                <ReferencePicker
                  required
                  v-model="draft.ownerEmployeeCode"
                  type="employees"
                  :kind="kind === 'sales' ? 'sales-after-sales-owner' : 'purchase-after-sales-owner'"
                  title="选择售后负责人"
                  placeholder="选择售后负责人"
                  search-placeholder="搜索员工姓名、部门、手机号或邮箱"
                  :display-value="draft.owner"
                  @select="handleOwnerSelect"
                />
              </label>
              <label
                v-if="isNewMode || record.status === '待受理'"
                class="form-field"
                data-after-sales-field="issueType"
                :class="afterSalesRequiredLabelClass('问题类型')"
              >
                <span>问题类型</span>
                <select v-model="draft.issueType">
                  <option value="" disabled>选择问题类型</option>
                  <option v-for="option in optionValues(issueTypeOptions, draft.issueType)" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
              <label
                v-if="isNewMode || record.status === '待受理'"
                class="form-field full-field"
                data-after-sales-field="issueDescription"
                :class="afterSalesRequiredLabelClass('问题说明')"
              >
                <span>问题说明</span>
                <textarea v-model="draft.issueDescription" rows="3" :placeholder="issueDescriptionPlaceholder"></textarea>
              </label>
            </div>
          </section>

          <section v-if="!isSalesFollowUpEdit" class="form-section">
            <div class="section-heading">
              <h2>关联原单</h2>
              <RouterLink v-if="record.sourceOrder" class="secondary-action compact-action" :to="sourcePath" :title="`查看${sourceTitle}`">查看{{ sourceTitle }}</RouterLink>
            </div>

            <dl v-if="record.sourceOrder" class="material-fact-grid after-sales-fact-grid">
              <div><dt>{{ sourceTitle }}</dt><dd><RouterLink class="fact-link" :to="sourcePath">{{ record.sourceOrder }}</RouterLink></dd></div>
              <div><dt>{{ record.partyRole }}</dt><dd>{{ record.partyTitle }}</dd></div>
              <div><dt>联系人</dt><dd>{{ record.contact }}</dd></div>
              <div><dt>原单状态</dt><dd>{{ record.sourceStatus }}</dd></div>
              <div><dt>原单金额</dt><dd>{{ record.sourceAmount }}</dd></div>
              <div><dt>{{ kind === 'sales' ? '承诺交付' : '预计到货' }}</dt><dd>{{ record.sourceDueDate }}</dd></div>
            </dl>
            <div v-else class="document-empty-state after-sales-source-empty">
              <strong>先选择来源{{ sourceTitle }}</strong>
              <span>选择后会带入往来单位、原单信息和可登记的受影响明细。</span>
            </div>

            <div v-if="record.sourceOrder" class="after-sales-line-heading">
              <strong>受影响明细</strong>
              <span>{{ isNewMode ? '填写数量即纳入本次售后，留空不登记' : '受影响数量与原单数量分开记录' }}</span>
            </div>
            <div v-if="isNewMode && record.sourceOrder" class="after-sales-products is-editing">
              <div v-for="product in newAfterSalesProductRows" :key="`${record.code}-${product.sourceLineId || product.name}`">
                <div class="after-sales-product-main">
                  <MaterialIdentity
                    compact
                    :name="product.name"
                    :code="product.materialCode"
                    :model="product.model"
                    :spec="product.spec"
                    :image-label="afterSalesMaterialVisual(product).label"
                    :image-tone="afterSalesMaterialVisual(product).tone"
                  />
                  <small>{{ sourceQuantityContext(product) }} · {{ availableQuantityText(record.sourceOrder, product) }}</small>
                </div>
                <label class="after-sales-qty-field">
                  <span>受影响数量</span>
                  <input
                    v-model="product.qty"
                    type="number"
                    min="0.001"
                    :max="availableQuantityForLine(record.sourceOrder, product)"
                    step="0.001"
                    placeholder="—"
                    :disabled="availableQuantityForLine(record.sourceOrder, product) <= 0"
                  />
                  <b>{{ product.uom }}</b>
                </label>
              </div>
            </div>
            <div v-else class="after-sales-products">
              <div v-for="product in record.products" :key="`${record.code}-${product.sourceLineId || product.name}`">
                <div class="after-sales-product-main">
                  <MaterialIdentity
                    compact
                    :name="product.name"
                    :code="product.materialCode"
                    :model="product.model"
                    :spec="product.spec"
                    :image-label="afterSalesMaterialVisual(product).label"
                    :image-tone="afterSalesMaterialVisual(product).tone"
                  />
                  <small>{{ sourceQuantityContext(product) }}</small>
                </div>
                <span class="after-sales-affected-qty">{{ quantityText(product) }}</span>
              </div>
            </div>

            <div v-if="record.sourceRemark" class="material-info-note after-sales-source-note">
              <span>{{ record.kind === 'sales' ? '补充要求' : '原单备注' }}</span>
              <p>{{ record.sourceRemark }}</p>
            </div>
          </section>

          <section v-if="!isNewMode && !isSalesFollowUpEdit" class="form-section after-sales-plan-section">
            <div class="section-heading">
              <div>
                <h2>处理方案</h2>
                <span v-if="record.status === '待受理'">受理后将按方案生成执行任务</span>
              </div>
            </div>
            <dl v-if="!isEditMode || record.status !== '待受理'" class="material-fact-grid after-sales-fact-grid">
              <div><dt>处理方式</dt><dd>{{ record.action || '—' }}</dd></div>
              <div><dt>实物流向</dt><dd>{{ record.goodsDisposition || '—' }}</dd></div>
              <div><dt>商务调整</dt><dd>{{ record.financialTreatment || '—' }}</dd></div>
              <div><dt>金额影响</dt><dd>{{ record.amountImpactType }}</dd></div>
              <div v-if="record.amountImpactType !== '无金额影响' && record.estimatedAmount > 0" class="after-sales-fact-wide">
                <dt>预计金额</dt>
                <dd>{{ amountText(record.estimatedAmount) }}</dd>
              </div>
              <div v-if="record.planNote" class="after-sales-fact-wide"><dt>方案备注</dt><dd class="fact-long-text">{{ record.planNote }}</dd></div>
            </dl>
            <div v-else class="quote-fields">
              <label class="form-field">
                <span>处理方式</span>
                <select v-model="draft.action" :disabled="record.status !== '待受理'">
                  <option value="" disabled>选择处理方式</option>
                  <option v-for="option in optionValues(actionOptions, draft.action)" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
              <label class="form-field" data-after-sales-field="goodsDisposition">
                <span>实物流向</span>
                <select v-model="draft.goodsDisposition">
                  <option v-for="option in goodsDispositionOptions" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
              <label class="form-field" data-after-sales-field="financialTreatment">
                <span>商务调整</span>
                <select v-model="draft.financialTreatment">
                  <option v-for="option in financialTreatmentOptions" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
              <label class="form-field">
                <span>金额影响</span>
                <select v-model="draft.amountImpactType" :disabled="record.status !== '待受理'">
                  <option v-for="option in amountImpactTypeOptions" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
              <label v-if="draft.amountImpactType !== '无金额影响'" class="form-field">
                <span>预计金额</span>
                <div class="after-sales-money-input">
                  <b>CNY</b>
                  <input
                    v-model.number="draft.estimatedAmount"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </div>
              </label>
              <label class="form-field full-field">
                <span>方案备注</span>
                <textarea v-model="draft.planNote" rows="2" placeholder="记录范围、批次、费用边界或其他执行要求"></textarea>
              </label>
            </div>
          </section>

          <section v-if="showResultSection" class="form-section">
            <div class="section-heading">
              <h2>结果确认</h2>
            </div>
            <div v-if="!isEditMode" class="after-sales-result-grid">
              <div v-if="record.amountImpactType !== '无金额影响'" class="after-sales-confirmed-amount">
                <span>{{ confirmedAmountLabel }}</span>
                <p>{{ record.confirmedAmount > 0 ? amountText(record.confirmedAmount) : '尚未确认' }}</p>
              </div>
              <div>
                <span>处理结果</span>
                <p>{{ record.processingResult || '尚未形成处理结果' }}</p>
              </div>
              <div v-if="record.status === '待确认' || record.status === '已关闭'">
                <span>{{ kind === 'sales' ? '客户确认' : '供应商确认' }}</span>
                <p>{{ record.confirmationNote || '尚未确认' }}</p>
              </div>
            </div>
            <div v-else class="quote-fields">
              <label
                v-if="record.status === '处理中' && record.amountImpactType !== '无金额影响'"
                class="form-field"
              >
                <span>{{ confirmedAmountLabel }}</span>
                <div class="after-sales-money-input">
                  <b>CNY</b>
                  <input
                    v-model.number="draft.confirmedAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    :disabled="record.status !== '处理中'"
                  />
                </div>
              </label>
              <label v-if="record.status === '处理中'" class="form-field full-field">
                <span>处理结果</span>
                <textarea
                  v-model="draft.processingResult"
                  rows="3"
                  :disabled="record.status !== '处理中'"
                  placeholder="汇总已执行的动作、数量、金额和最终结果"
                ></textarea>
              </label>
              <div v-if="record.status === '待确认'" class="material-info-note after-sales-result-reference full-field">
                <span>处理结果</span>
                <p v-if="record.amountImpactType !== '无金额影响'">{{ confirmedAmountLabel }}：{{ amountText(record.confirmedAmount) }}</p>
                <p>{{ record.processingResult }}</p>
              </div>
              <label
                v-if="record.status === '待确认'"
                class="form-field full-field"
                data-after-sales-field="confirmationNote"
              >
                <span>{{ kind === 'sales' ? '客户确认' : '供应商确认' }}</span>
                <textarea
                  v-model="draft.confirmationNote"
                  rows="3"
                  :disabled="record.status !== '待确认'"
                  :placeholder="`记录${kind === 'sales' ? '客户' : '供应商'}确认方式和依据；关闭前必须填写`"
                ></textarea>
              </label>
            </div>
          </section>

          <section v-if="isEditMode || afterSalesAttachments.length" class="form-section after-sales-attachment-section">
            <div class="section-heading">
              <div>
                <h2>附件</h2>
                <span v-if="afterSalesAttachments.length">{{ attachmentCountText }}</span>
              </div>
              <label
                v-if="!isAfterSalesReadOnly"
                class="secondary-action compact-action file-upload-button"
                :title="afterSalesAttachmentTitle"
              >
                <Upload :size="15" />
                上传
                <input type="file" multiple @change="handleAfterSalesAttachmentUpload" />
              </label>
            </div>
            <div v-if="afterSalesAttachments.length" class="attachment-list">
              <div v-for="attachment in afterSalesAttachments" :key="`${attachment.name}-${attachment.date}`" class="attachment-row">
                <span class="attachment-icon">
                  <Paperclip :size="16" />
                </span>
                <div>
                  <strong :title="attachment.name">{{ attachment.name }}</strong>
                  <small>{{ attachment.size }} · {{ attachment.uploader }} · {{ attachment.date }}</small>
                </div>
              </div>
            </div>
            <div v-else class="attachment-empty">
              <Paperclip :size="17" />
              <span>可上传售后沟通、现场照片或处理依据</span>
            </div>
          </section>
        </div>

        <aside class="quote-summary-panel after-sales-summary-panel">
          <section class="summary-section after-sales-collaboration-summary">
            <div class="summary-title after-sales-summary-heading">
              <h2>协同进度</h2>
              <span>{{ taskProgressText(activeExecutionTasks) }}</span>
            </div>
            <div v-if="activeExecutionTasks.length || activeRemedyReceipt" class="after-sales-sidebar-task-list">
              <article v-if="activeRemedyReceipt">
                <div>
                  <strong>统一采购入库</strong>
                  <i
                    class="mini-status"
                    :class="`after-sales-task-status-${remedyReceiptCompleteStatuses.has(activeRemedyReceipt.status) ? 'done' : 'tracking'}`"
                  >{{ activeRemedyReceipt.status }}</i>
                </div>
                <span>仓库 · {{ activeRemedyReceipt.code }}</span>
                <small>补发、换货或返工品仍需完成到货、质检和正式入库。</small>
              </article>
              <article v-for="task in activeExecutionTasks" :key="task.code">
                <div>
                  <strong>{{ task.kind }}</strong>
                  <i
                    class="mini-status"
                    :class="`after-sales-task-status-${taskTone(task.status)}`"
                  >{{ task.status }}</i>
                </div>
                <span>{{ task.module }} · {{ taskProgressDetail(task) }}</span>
                <small v-if="task.note">{{ task.note }}</small>
              </article>
            </div>
            <p v-else class="after-sales-summary-empty">受理后由系统生成各角色的协同任务。</p>
          </section>

          <section class="summary-section after-sales-related-summary">
            <h2>关联处理记录</h2>
            <div v-if="record.relatedDocuments?.length" class="price-reference-list">
              <template
                v-for="document in record.relatedDocuments"
                :key="`${document.type}-${document.code}`"
              >
                <RouterLink
                  v-if="canOpenRelatedDocument(document.path)"
                  class="price-reference-card reference-card-link related-document-card"
                  :to="document.path"
                  :title="`打开${document.type} ${document.code}`"
                >
                  <div class="related-document-heading">
                    <span>{{ document.type }}</span>
                    <small>{{ document.status }}</small>
                  </div>
                  <strong>{{ document.code }}</strong>
                </RouterLink>
                <article
                  v-else
                  class="price-reference-card related-document-card related-document-card-static"
                  title="跨模块记录仅展示处理结果，由对应岗位在本岗位模块中操作"
                >
                  <div class="related-document-heading">
                    <span>{{ document.type }}</span>
                    <small>{{ document.status }}</small>
                  </div>
                  <strong>{{ document.code }}</strong>
                </article>
              </template>
            </div>
            <p v-else class="after-sales-summary-empty">
              {{ record.sourceOrder ? '暂无关联处理记录。' : `选择来源${sourceTitle}后显示。` }}
            </p>
          </section>
        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      :title="moduleTitle"
      :message="loadMessage"
      :back-path="listPath"
      :back-label="`返回${moduleTitle}列表`"
      @retry="loadRecord"
    />

    <FlowRecordPanel
      :open="showFlowRecords"
      :title="`${moduleTitle}日志`"
      :records="flowRecords"
      @close="showFlowRecords = false"
    />

    <div v-if="toastMessage" class="app-toast" :class="{ error: toastTone === 'error' }" :role="toastTone === 'error' ? 'alert' : 'status'" :aria-live="toastTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ toastMessage }}</div>
  </div>
</template>
