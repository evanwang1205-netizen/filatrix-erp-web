<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  Boxes,
  FileText,
  Paperclip,
  Send,
  Upload,
  X,
} from 'lucide-vue-next';

import DocumentLoadState from '../components/DocumentLoadState.vue';
import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';
import FlowRecordPanel from '../components/FlowRecordPanel.vue';
import MaterialIdentity from '../components/MaterialIdentity.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import QuantityWithUnitInput from '../components/QuantityWithUnitInput.vue';
import WarehouseReversalDialog from '../components/WarehouseReversalDialog.vue';
import { useAsyncActionState } from '../composables/useAsyncActionState';
import { useDialogFocus } from '../composables/useDialogFocus';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import { productVisuals } from '../data/sales';
import { productIdentity } from '../utils/productDisplay';
import { attachmentsFromFileList } from '../utils/attachmentUpload';
import { scrollElementIntoView } from '../utils/focusNavigation';
import {
  getSalesIssue,
  getSalesOutboundRequest,
  listReference,
  listWarehouseInventory,
  postSalesIssue,
  reverseWarehouseDocument,
  submitSalesIssuePickingResult,
  updateWarehouseStatus,
} from '../services/api';
import type {
  Attachment,
  FlowRecord,
  SalesIssue,
  SalesIssuePickingAllocation,
  SalesIssueProduct,
  SalesOutboundRequest,
  SalesOutboundRequestProduct,
  WarehouseInventoryRow,
} from '../types/business';
import type { DocumentStatusItem } from '../types/documentUi';

type SalesIssuePrimaryAction =
  | { kind: 'picking'; label: string; message: string }
  | { kind: 'post'; label: string; message: string };

type SalesIssueWarehouseReference = {
  code: string;
  name: string;
  status?: string;
  allowSalesIssue?: boolean;
};

type IssueAsyncAction = 'primary' | 'return' | 'reverse';

const route = useRoute();
const router = useRouter();
const { canWrite: canWriteWarehouse, readonlyReason: warehouseReadonlyReason } = useModulePermission('warehouse');
const { canOperate: canPostWarehouse, readonlyReason: warehousePostReadonlyReason } = useOperationPermission(
  'warehousePost',
  '确认销售出库',
);
const showFlowRecords = ref(false);
const isSaving = ref(false);
const {
  activeAction: activeIssueAction,
  isActionPending: isIssueActionPending,
  runAction: runIssueAction,
} = useAsyncActionState<IssueAsyncAction>();
const loadMessage = ref('');
const isLoading = ref(false);
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const issueMoreActionsOpen = ref(false);
const issueMoreActionsTrigger = ref<HTMLButtonElement | null>(null);
const reversalDialogOpen = ref(false);
const pickingDialogOpen = ref(false);
const pickingDialogPanel = ref<HTMLElement | null>(null);
const pickingDialogSnapshot = ref<SalesIssue | null>(null);
const {
  focusDialog: focusPickingDialog,
  restoreDialogFocus: restorePickingDialogFocus,
  handleDialogTab: handlePickingDialogTab,
} = useDialogFocus(pickingDialogPanel);
const issueValidationAttempted = ref(false);
const issueDraft = ref<SalesIssue | null>(createEmptyIssue());
const flowRecords = ref<FlowRecord[]>([]);
const issueInventoryRows = ref<WarehouseInventoryRow[]>([]);
const issueSalesWarehouses = ref<SalesIssueWarehouseReference[]>([]);
const issueInventoryLoaded = ref(false);
const selectedIssueLineIds = ref<string[]>([]);
let toastTimer: number | undefined;

const mode = computed(() => route.name?.toString() ?? '');
const isNew = computed(() => mode.value === 'warehouse-sales-issue-new');
const isEdit = computed(() => mode.value === 'warehouse-sales-issue-edit');
const isDetail = computed(() => mode.value === 'warehouse-sales-issue-detail');
const isReadOnly = computed(() => (
  !pickingDialogOpen.value
  || issueDraft.value?.status !== '待拣货'
  || !canWriteWarehouse.value
));
const { resetUnsavedChanges } = useUnsavedChangesGuard(issueDraft, {
  enabled: computed(() => pickingDialogOpen.value),
  ready: computed(() => !isLoading.value),
});
const referenceTitle = computed(() => `销售出库 ${issueDraft.value?.code || ''}`.trim());
const referenceSubtitle = computed(() => `${issueDraft.value?.customer || '未选择客户'} · ${issueDraft.value?.status || ''}`);
const referencePath = computed(() => (issueDraft.value?.code ? `/warehouse/sales-issues/${encodeURIComponent(issueDraft.value.code)}` : ''));
const salesIssueSourceRequestPath = computed(() => (
  issueDraft.value?.sourceDoc
    ? `/sales/outbound-requests/${encodeURIComponent(issueDraft.value.sourceDoc)}`
    : ''
));
const salesIssueSourceOrderPath = computed(() => (
  issueDraft.value?.sourceOrder
    ? `/sales/orders/${encodeURIComponent(issueDraft.value.sourceOrder)}`
    : ''
));
const pageHeading = computed(() => {
  if (isNew.value) return '新建销售出库';
  if (isEdit.value) {
    if (issueDraft.value?.status === '已出库') return '销售出库只读';
    if (issueDraft.value?.status === '待拣货') return '登记拣货';
    if (issueDraft.value?.status === '待复核') return '销售出库只读';
    return '销售出库任务';
  }
  return '销售出库详情';
});
const issuePrimaryAction = computed<SalesIssuePrimaryAction | undefined>(() => {
  const status = issueDraft.value?.status || '';

  if (status === '待拣货') {
    return {
      kind: 'picking',
      label: '登记拣货',
      message: '填写本次实际出库数量、批次和作业日期',
    };
  }

  if (status === '待复核') {
    return { kind: 'post', label: '出库', message: '销售出库已确认，库存和流水已更新' };
  }

  return undefined;
});
const issuePrimaryActionLabel = computed(() => issuePrimaryAction.value?.label || '已锁定');
const issuePrimaryActionAllowed = computed(() => (
  canWriteWarehouse.value
  && canPostWarehouse.value
));
type IssueMoreAction = { key: 'return' | 'reverse'; label: string; description: string; tone?: 'normal' | 'danger' };

const issueMoreActions = computed<IssueMoreAction[]>(() => {
  if (!isDetail.value || !canWriteWarehouse.value) return [];
  if (issueDraft.value?.status !== '已出库') {
    const actions: IssueMoreAction[] = [];
    if (issueDraft.value?.status === '待复核' && canPostWarehouse.value) {
      actions.push({ key: 'return', label: '退回拣货', description: '复核发现数量或批次问题时退回重新拣货。' });
    }
    return actions;
  }
  if (!issueDraft.value?.reversalCode && canPostWarehouse.value) {
    return [{ key: 'reverse', label: '冲销库存', description: '生成独立冲销记录并恢复原批次库存，不改写原单。', tone: 'danger' }];
  }
  return [];
});
const submitIssueActionTitle = computed(() => {
  const status = issueDraft.value?.status || '-';
  if (status === '已出库') return '当前销售出库单已出库，不能重复确认。';
  if (!canWriteWarehouse.value) return warehouseReadonlyReason.value;
  if (!canPostWarehouse.value) return warehousePostReadonlyReason.value;
  return issuePrimaryAction.value ? `${issuePrimaryAction.value.label}：${issuePrimaryAction.value.message}` : '当前状态不可继续流转';
});
const submitPickingActionTitle = computed(() => {
  if (!canWriteWarehouse.value) return warehouseReadonlyReason.value;
  if (!canPostWarehouse.value) return warehousePostReadonlyReason.value;
  const missing = issueMissingSubmitFields();
  if (missing.length) return missingSubmitSummary(missing);
  const invalidQuantity = issueDraft.value?.products.find((product) => issueQuantityError(product));
  return invalidQuantity
    ? `${invalidQuantity.name || invalidQuantity.materialCode || '出库物料'}：${issueQuantityError(invalidQuantity)}`
    : '提交本次拣货结果并进入待复核。';
});
const operationPermissionHint = computed(() => (
  !canPostWarehouse.value ? warehousePostReadonlyReason.value : ''
));
const operationPermissionSuffix = '\u63d0\u4ea4\u51fa\u5e93\u548c\u5f02\u5e38\u5904\u7406\u4f1a\u4fdd\u6301\u4e0d\u53ef\u7528\u3002';

async function handleIssueMoreAction(action: IssueMoreAction) {
  if (!issueDraft.value) return;
  issueMoreActionsOpen.value = false;
  if (action.key === 'return') {
    await runIssueAction('return', async () => {
      try {
        const response = await updateWarehouseStatus('sales-issues', issueDraft.value!.code, {
          status: '待拣货',
          action: '退回拣货',
          remark: '出库复核退回重新拣货，原复核记录保留在流转日志。',
        });
        issueDraft.value = toSalesIssue(response.record as SalesIssue);
        flowRecords.value = response.flowRecords;
        showToast('已退回拣货，可重新调整数量和批次');
      } catch (error) {
        showToast(error instanceof Error ? error.message : '退回拣货失败', 'error');
      }
    });
  } else if (action.key === 'reverse') {
    issueMoreActionsTrigger.value?.focus();
    reversalDialogOpen.value = true;
  }
}

async function submitIssueReversal(reason: string) {
  if (!issueDraft.value) return;
  await runIssueAction('reverse', async () => {
    try {
      const response = await reverseWarehouseDocument('sales-issues', issueDraft.value!.code, {
        reason,
        idempotencyKey: globalThis.crypto?.randomUUID?.() || `issue-reversal-${Date.now()}`,
      });
      issueDraft.value = response.record as SalesIssue;
      flowRecords.value = response.flowRecords;
      reversalDialogOpen.value = false;
      showToast(`${response.reversal.code} 已完成库存冲销`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '销售出库库存冲销失败', 'error');
    }
  });
}

const lineItems = computed(() =>
  (issueDraft.value?.products ?? []).map((product, index) => ({
    key: `${product.materialCode || product.name || 'new'}-${index}`,
    ...product,
    image: productVisuals[product.name] ?? { label: product.imageLabel || 'FG', tone: product.imageTone || '#eeeeee' },
  })),
);
function issueLineVisual(product: Pick<SalesIssueProduct, 'name' | 'imageLabel' | 'imageTone'>) {
  return productVisuals[product.name] ?? { label: product.imageLabel || 'FG', tone: product.imageTone || '#eeeeee' };
}
const issueAttachments = computed<Attachment[]>(() => issueDraft.value?.attachments ?? []);
const issueAttachmentTitle = computed(() => {
  if (pickingDialogOpen.value && !isReadOnly.value) return '上传拣货单、物流面单等作业附件';
  if (!canWriteWarehouse.value) return warehouseReadonlyReason.value;
  if (issueDraft.value?.status === '已出库') return '当前销售出库单已出库，不能上传附件。';
  if (issueDraft.value?.status === '待复核') return '拣货结果已提交复核；如需调整，请先退回拣货。';
  return '请先打开“登记拣货”弹窗。';
});
const selectedIssueProducts = computed(() => (
  issueDraft.value?.products.filter((product) => (
    issueLineIsSelected(product) && issueQuantityNumber(product.qty) > 0
  )) || []
));
const issueLifecycleStatus = computed(() => {
  const draft = issueDraft.value;
  if (draft?.reversalCode) return '已冲销';
  return draft?.status || '-';
});
const issueCanceled = computed(() => (
  ['已取消', '已作废', '已中断'].includes(issueDraft.value?.status || '')
));
const issueStatusPanelItems = computed<DocumentStatusItem[]>(() => {
  const draft = issueDraft.value;
  const submitted = ['待复核', '已出库'].includes(draft?.status || '');
  const reversed = Boolean(draft?.reversalCode);
  const posted = draft?.status === '已出库' && !reversed;
  return [
    {
      key: 'picking',
      label: '拣货登记',
      value: issueCanceled.value ? '无需登记' : submitted ? '已提交' : '待登记',
      detail: submitted
        ? [draft?.reviewSubmittedBy || draft?.owner, draft?.reviewSubmittedAt].filter(Boolean).join(' · ')
        : '',
      kind: 'status',
      tone: issueCanceled.value ? 'neutral' : submitted ? 'success' : 'warning',
    },
    {
      key: 'inventory',
      label: '库存过账',
      value: reversed ? '原过账已冲销' : issueCanceled.value ? '无需过账' : posted ? '已过账' : '未过账',
      detail: reversed
        ? [draft?.reversalCode, draft?.reversedBy, draft?.reversedAt].filter(Boolean).join(' · ')
        : posted
        ? [draft?.postedBy, draft?.postedAt].filter(Boolean).join(' · ')
        : '',
      kind: 'status',
      tone: reversed || issueCanceled.value ? 'neutral' : posted ? 'success' : 'warning',
    },
  ];
});

const issuePickingSubmitted = computed(() => (
  ['待复核', '已出库'].includes(issueDraft.value?.status || '')
));
const issueInventoryPosted = computed(() => (
  issueDraft.value?.status === '已出库' && !issueDraft.value?.reversalCode
));
const issueProgressProducts = computed(() => {
  return issueDraft.value?.products || [];
});
const issueRecordProducts = computed(() => (
  issuePickingSubmitted.value
    ? (issueDraft.value?.products || []).filter((product) => issueQuantityNumber(product.qty) > 0)
    : []
));
const issueRecordLines = computed(() => {
  const draft = issueDraft.value;
  if (!draft || !issuePickingSubmitted.value) return [];

  return issueRecordProducts.value.flatMap((product, productIndex) => {
    const allocations = (product.allocations || []).filter((allocation) => (
      issueQuantityNumber(allocation.qty) > 0
    ));
    if (allocations.length) {
      return allocations.map((allocation, allocationIndex) => ({
        key: allocation.allocationId
          || allocation.inventoryKey
          || `${product.lineId || product.sourceLineId || product.materialCode || productIndex}-${allocationIndex}`,
        product,
        quantity: allocation.qty,
        warehouse: allocation.warehouse || allocation.warehouseCode || '—',
        location: salesIssueLocationDisplay(allocation.location),
        batch: salesIssueBatchDisplay(allocation.batch, product),
      }));
    }

    const fallbackWarehouses = (draft.actualWarehouses || []).map((warehouse) => warehouse.name).filter(Boolean);
    return [{
      key: `${product.lineId || product.sourceLineId || product.materialCode || productIndex}-legacy`,
      product,
      quantity: product.qty,
      warehouse: fallbackWarehouses.length === 1 ? fallbackWarehouses[0] : draft.warehouse || '—',
      location: salesIssueLocationDisplay(undefined),
      batch: salesIssueBatchDisplay(product.batch, product),
    }];
  });
});

function salesIssueBatchDisplay(batch: string | undefined, product: SalesIssueProduct) {
  const value = String(batch || '').trim();
  if (value) return value;
  return product.batchTracked === false ? '无需批次' : '历史批次未登记';
}

function issueProgressBaseQuantity(product: SalesIssueProduct) {
  return issueQuantityNumber(product.taskQty || product.qty);
}

function issuePickingProgressPercent(product: SalesIssueProduct) {
  const taskQuantity = issueProgressBaseQuantity(product);
  if (!issuePickingSubmitted.value || taskQuantity <= 0) return 0;
  return Math.min(100, Math.round(issueQuantityNumber(product.qty) / taskQuantity * 100));
}

function issuePostingProgressPercent(product: SalesIssueProduct) {
  const taskQuantity = issueProgressBaseQuantity(product);
  if (!issueInventoryPosted.value || taskQuantity <= 0) return 0;
  return Math.min(100, Math.round(issueQuantityNumber(product.qty) / taskQuantity * 100));
}

function issueUnselectedQuantity(product: SalesIssueProduct) {
  if (!issuePickingSubmitted.value) return 0;
  return Math.max(
    0,
    issueQuantityNumber(product.taskQty || product.qty) - issueQuantityNumber(product.qty),
  );
}

function today() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const defaultIssueNote = '';

function createEmptyIssue(): SalesIssue {
  return {
    code: '系统自动生成',
    companyCode: '',
    company: '',
    sourceDoc: (route.query.request || route.query.source)?.toString() ?? '',
    sourceOrder: route.query.order?.toString() ?? '',
    customerCode: '',
    customer: '',
    contact: '',
    contactPhone: '',
    products: [],
    warehouseCode: '',
    warehouse: '',
    deliveryMethod: '',
    address: '',
    supplementaryRequirement: '',
    sourceRemark: '',
    owner: '待分配',
    status: '待拣货',
    date: today(),
    expectedDate: '',
    note: defaultIssueNote,
    attachments: [],
  };
}

function toSalesIssue(source: Partial<SalesIssue>): SalesIssue {
  return {
    ...createEmptyIssue(),
    ...source,
    supplementaryRequirement: source.supplementaryRequirement ?? source.sourceRemark ?? '',
    sourceRemark: source.supplementaryRequirement ?? source.sourceRemark ?? '',
    products: source.products?.length
      ? source.products.map((product) => ({ ...product, taskQty: product.taskQty || product.qty }))
      : [],
  };
}

function mapRequestProduct(product: SalesOutboundRequestProduct): SalesIssueProduct {
  return {
    sourceLineId: product.sourceLineId || '',
    materialCode: product.materialCode || '',
    name: product.name,
    model: product.model || '',
    spec: product.spec || '',
    taskQty: product.requestQty || product.qty,
    qty: product.requestQty || product.qty,
    batch: '',
    uom: product.uom || '',
    imageLabel: product.imageLabel || '',
    imageTone: product.imageTone || '',
  };
}

function applyOutboundRequest(requestDoc: SalesOutboundRequest) {
  if (!issueDraft.value) return;
  if (!requestDoc.code) {
    issueDraft.value.sourceDoc = '';
    issueDraft.value.sourceOrder = '';
    issueDraft.value.companyCode = '';
    issueDraft.value.company = '';
    issueDraft.value.customerCode = '';
    issueDraft.value.customer = '';
    issueDraft.value.contact = '';
    issueDraft.value.contactPhone = '';
    issueDraft.value.products = [];
    issueDraft.value.warehouseCode = '';
    issueDraft.value.warehouse = '';
    issueDraft.value.deliveryMethod = '';
    issueDraft.value.address = '';
    issueDraft.value.supplementaryRequirement = '';
    issueDraft.value.sourceRemark = '';
    issueDraft.value.expectedDate = '';
    issueDraft.value.note = defaultIssueNote;
    return;
  }
  issueDraft.value.sourceDoc = requestDoc.code;
  issueDraft.value.sourceOrder = requestDoc.sourceOrder;
  issueDraft.value.companyCode = requestDoc.companyCode || '';
  issueDraft.value.company = requestDoc.company || '';
  issueDraft.value.customerCode = requestDoc.customerCode || '';
  issueDraft.value.customer = requestDoc.customer;
  issueDraft.value.contact = requestDoc.contact;
  issueDraft.value.contactPhone = requestDoc.contactPhone || '';
  issueDraft.value.products = requestDoc.products.length ? requestDoc.products.map(mapRequestProduct) : [];
  issueDraft.value.warehouseCode = requestDoc.warehouseCode || issueDraft.value.warehouseCode;
  issueDraft.value.warehouse = requestDoc.warehouse || issueDraft.value.warehouse;
  issueDraft.value.deliveryMethod = requestDoc.deliveryMethod || issueDraft.value.deliveryMethod;
  issueDraft.value.address = requestDoc.address || issueDraft.value.address;
  issueDraft.value.supplementaryRequirement = requestDoc.supplementaryRequirement || requestDoc.remark || '';
  issueDraft.value.sourceRemark = issueDraft.value.supplementaryRequirement;
  issueDraft.value.expectedDate = requestDoc.expectedDate || issueDraft.value.expectedDate;
  issueDraft.value.note = defaultIssueNote;
}

async function loadSourceRequestFromQuery() {
  const code = (route.query.request || route.query.source)?.toString() ?? '';
  if (!code || !issueDraft.value || issueDraft.value.sourceDoc !== code) return;

  try {
    const response = await getSalesOutboundRequest(code);
    applyOutboundRequest(response.request);
  } catch {
    loadMessage.value = '来源交付追踪暂时无法读取，可手动选择或填写出库信息。';
  }
}

async function loadIssueInventoryCandidates(company?: string) {
  try {
    const [inventoryRows, warehouseResponse] = await Promise.all([
      listWarehouseInventory(),
      listReference<SalesIssueWarehouseReference>('warehouses', {
        activeOnly: true,
        kind: '销售出库',
        company: company || undefined,
        limit: 100,
      }),
    ]);
    issueInventoryRows.value = inventoryRows;
    issueSalesWarehouses.value = warehouseResponse.items
      .map((option) => option.raw as SalesIssueWarehouseReference);
    issueInventoryLoaded.value = true;
  } catch {
    issueInventoryRows.value = [];
    issueSalesWarehouses.value = [];
    issueInventoryLoaded.value = false;
  }
}

async function loadIssue() {
  loadMessage.value = '';
  isLoading.value = !isNew.value;
  if (!isNew.value) {
    issueDraft.value = null;
    flowRecords.value = [];
  }

  try {
    if (isNew.value) {
      issueDraft.value = createEmptyIssue();
      flowRecords.value = [];
      await loadSourceRequestFromQuery();
      await loadIssueInventoryCandidates(issueDraft.value?.company);
      return;
    }

    const code = route.params.code?.toString() ?? '';
    if (!code) return;

    const response = await getSalesIssue(code);
    issueDraft.value = toSalesIssue(response.issue);
    flowRecords.value = response.flowRecords;
    await loadIssueInventoryCandidates(issueDraft.value.company);
    resetUnsavedChanges();
  } catch (error) {
    issueDraft.value = null;
    flowRecords.value = [];
    loadMessage.value = error instanceof Error ? error.message : '销售出库单加载失败';
  } finally {
    isLoading.value = false;
  }
}

function cloneIssueDraft(issue: SalesIssue) {
  return JSON.parse(JSON.stringify(issue)) as SalesIssue;
}

function openPickingDialog() {
  const draft = issueDraft.value;
  if (!draft || draft.status !== '待拣货') {
    showToast('当前任务不在待拣货状态，不能登记拣货。', 'error');
    return;
  }
  if (!canWriteWarehouse.value || !canPostWarehouse.value) {
    showToast(submitIssueActionTitle.value, 'error');
    return;
  }
  pickingDialogSnapshot.value = cloneIssueDraft(draft);
  if (!draft.reviewReturnedAt || !draft.date) draft.date = today();
  selectedIssueLineIds.value = draft.products
    .filter((product) => issueQuantityNumber(product.qty) > 0)
    .map(issueLineSelectionKey);
  if (issueInventoryLoaded.value) {
    draft.products.forEach((product) => {
      const taskQty = issueQuantityNumber(product.taskQty || product.qty);
      const currentQty = issueQuantityNumber(product.qty);
      const pickableQty = issueAvailableQuantity(product);
      const proposedQty = Math.max(0, Math.min(currentQty, taskQty || currentQty, pickableQty));
      initializeIssueAllocations(product, proposedQty);
      if (proposedQty <= 0) {
        selectedIssueLineIds.value = selectedIssueLineIds.value
          .filter((key) => key !== issueLineSelectionKey(product));
      }
    });
  }
  issueValidationAttempted.value = false;
  pickingDialogOpen.value = true;
  resetUnsavedChanges();
  focusPickingDialog();
}

async function closePickingDialog() {
  if (isIssueActionPending.value || isSaving.value) return;
  if (pickingDialogSnapshot.value) {
    issueDraft.value = cloneIssueDraft(pickingDialogSnapshot.value);
  }
  pickingDialogSnapshot.value = null;
  pickingDialogOpen.value = false;
  selectedIssueLineIds.value = [];
  issueValidationAttempted.value = false;
  resetUnsavedChanges();
  restorePickingDialogFocus();
}

function handleAttachmentUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (isReadOnly.value) {
    input.value = '';
    showToast(issueAttachmentTitle.value, 'error');
    return;
  }
  const files = attachmentsFromFileList(input.files);
  if (!files.length || !issueDraft.value) return;
  issueDraft.value.attachments = [...(issueDraft.value.attachments ?? []), ...files];
  input.value = '';
  showToast(`已选择 ${files.length} 个附件，提交复核后随拣货结果保留。`);
}

function missingSubmitSummary(labels: string[]) {
  return `请先补齐：${labels.slice(0, 8).join('、')}${labels.length > 8 ? '等' : ''}`;
}

function issueQuantityNumber(value: string | number | undefined) {
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

function formatIssueQuantity(value: number, unit = '') {
  const normalized = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  return `${normalized}${unit ? ` ${unit}` : ''}`;
}

function inventoryReservationForIssue(row: WarehouseInventoryRow, product: SalesIssueProduct) {
  const sourceOrder = String(issueDraft.value?.sourceOrder || '').trim();
  if (!sourceOrder) return 0;
  return (row.reservationSources || [])
    .filter((source) => (
      source.sourceDoc === sourceOrder
      && (!product.sourceLineId || !source.sourceLineId || source.sourceLineId === product.sourceLineId)
      && !['已释放', '已作废', '已消耗'].includes(source.status)
    ))
    .reduce((sum, source) => sum + issueQuantityNumber(source.quantityNumber ?? source.qty), 0);
}

function inventoryDispatchableForIssue(row: WarehouseInventoryRow, product: SalesIssueProduct) {
  const available = issueQuantityNumber(row.availableNumber ?? row.available);
  const onHand = issueQuantityNumber(row.onHandNumber ?? row.onHand);
  return Math.max(0, Math.min(onHand, available + inventoryReservationForIssue(row, product)));
}

function inventoryWarehouseCanSalesIssue(row: WarehouseInventoryRow) {
  return issueSalesWarehouses.value.some((warehouse) => (
    (row.warehouseCode && warehouse.code === row.warehouseCode)
    || (!row.warehouseCode && warehouse.name === row.warehouse)
  ));
}

function issueInventoryCandidates(product: SalesIssueProduct, batch = '') {
  return issueInventoryRows.value
    .filter((row) => (
      (product.materialCode ? row.materialCode === product.materialCode : row.item === product.name)
      && inventoryWarehouseCanSalesIssue(row)
      && (!batch || row.batch === batch)
      && inventoryDispatchableForIssue(row, product) > 0
    ))
    .sort((left, right) => {
      const leftReserved = inventoryReservationForIssue(left, product) > 0;
      const rightReserved = inventoryReservationForIssue(right, product) > 0;
      if (leftReserved !== rightReserved) return leftReserved ? -1 : 1;
      return [
        left.warehouse || left.warehouseCode || '',
        left.expiryDate || '9999-12-31',
        left.batch || '',
        left.location || '',
      ].join('|').localeCompare([
        right.warehouse || right.warehouseCode || '',
        right.expiryDate || '9999-12-31',
        right.batch || '',
        right.location || '',
      ].join('|'));
    });
}

function issueAvailableQuantity(product: SalesIssueProduct) {
  return issueInventoryCandidates(product)
    .reduce((sum, row) => sum + inventoryDispatchableForIssue(row, product), 0);
}

function issueMaximumQuantity(product: SalesIssueProduct) {
  const taskQuantity = issueQuantityNumber(product.taskQty || product.qty);
  if (!issueInventoryLoaded.value) return taskQuantity;
  return Math.min(taskQuantity || issueAvailableQuantity(product), issueAvailableQuantity(product));
}

function issueMaximumText(product: SalesIssueProduct) {
  if (!issueInventoryLoaded.value) return '库存读取失败';
  return formatIssueQuantity(issueMaximumQuantity(product), product.uom);
}

function issueLineSelectionKey(product: SalesIssueProduct) {
  return String(product.sourceLineId || product.lineId || product.materialCode || product.name);
}

function issueInventoryIdentity(row: WarehouseInventoryRow) {
  return String(row.key || [
    row.warehouseCode || row.warehouse,
    row.location,
    row.batch,
    row.materialCode || row.item,
  ].join('|'));
}

function issueAllocationIdentity(allocation: SalesIssuePickingAllocation) {
  return String(allocation.inventoryKey || [
    allocation.warehouseCode || allocation.warehouse,
    allocation.location,
    allocation.batch,
  ].join('|'));
}

function salesIssueLocationDisplay(location: string | undefined) {
  const value = String(location || '').trim();
  return !value || value === '默认库位' || /-AUTO$/i.test(value) ? '历史库位未登记' : value;
}

function issueAllocationInventoryRow(allocation: SalesIssuePickingAllocation) {
  const identity = issueAllocationIdentity(allocation);
  return issueInventoryRows.value.find((row) => issueInventoryIdentity(row) === identity);
}

function issueAllocationAvailableQuantity(
  product: SalesIssueProduct,
  allocation: SalesIssuePickingAllocation,
) {
  const row = issueAllocationInventoryRow(allocation);
  return row ? inventoryDispatchableForIssue(row, product) : 0;
}

function issueAllocationAvailableText(
  product: SalesIssueProduct,
  allocation: SalesIssuePickingAllocation,
) {
  return formatIssueQuantity(issueAllocationAvailableQuantity(product, allocation), product.uom);
}

function issueAllocationError(
  product: SalesIssueProduct,
  allocation: SalesIssuePickingAllocation,
) {
  const quantity = issueQuantityNumber(allocation.qty);
  if (quantity <= 0) return '';
  const available = issueAllocationAvailableQuantity(product, allocation);
  if (quantity > available + 0.0001) {
    return `该库位当前可供 ${formatIssueQuantity(available, product.uom)}`;
  }
  return '';
}

function syncIssueQuantityFromAllocations(product: SalesIssueProduct) {
  const allocations = product.allocations || [];
  const total = allocations.reduce((sum, allocation) => sum + issueQuantityNumber(allocation.qty), 0);
  product.qty = formatIssueQuantity(total, product.uom);
  const batches = [...new Set(
    allocations
      .filter((allocation) => issueQuantityNumber(allocation.qty) > 0)
      .map((allocation) => String(allocation.batch || '').trim())
      .filter(Boolean),
  )];
  product.batch = batches.join(', ');
}

function initializeIssueAllocations(product: SalesIssueProduct, targetQuantity: number) {
  const candidates = issueInventoryCandidates(product, '');
  const previousAllocations = new Map(
    (product.allocations || []).map((allocation) => [
      issueAllocationIdentity(allocation),
      issueQuantityNumber(allocation.qty),
    ]),
  );
  const legacyBatch = String(product.batch || '').trim();
  const orderedCandidates = [...candidates].sort((left, right) => {
    const leftPrevious = previousAllocations.has(issueInventoryIdentity(left));
    const rightPrevious = previousAllocations.has(issueInventoryIdentity(right));
    if (leftPrevious !== rightPrevious) return leftPrevious ? -1 : 1;
    const leftLegacy = Boolean(legacyBatch && left.batch === legacyBatch);
    const rightLegacy = Boolean(legacyBatch && right.batch === legacyBatch);
    if (leftLegacy !== rightLegacy) return leftLegacy ? -1 : 1;
    return candidates.indexOf(left) - candidates.indexOf(right);
  });
  let remaining = Math.max(0, targetQuantity);
  product.allocations = orderedCandidates.map((row, index) => {
    const available = inventoryDispatchableForIssue(row, product);
    const previousQuantity = Math.min(
      previousAllocations.get(issueInventoryIdentity(row)) || 0,
      available,
      remaining,
    );
    const allocated = previousAllocations.size
      ? previousQuantity
      : Math.min(remaining, available);
    remaining = Math.max(0, remaining - allocated);
    return {
      allocationId: `${issueLineSelectionKey(product)}-A${index + 1}`,
      inventoryKey: String(row.key || ''),
      warehouseCode: row.warehouseCode || '',
      warehouse: row.warehouse,
      location: row.location,
      batch: row.batch || '',
      qty: formatIssueQuantity(allocated, product.uom),
      uom: product.uom || row.uom || '',
    };
  });
  if (previousAllocations.size && remaining > 0) {
    product.allocations.forEach((allocation) => {
      if (remaining <= 0 || issueQuantityNumber(allocation.qty) > 0) return;
      const available = issueAllocationAvailableQuantity(product, allocation);
      const allocated = Math.min(remaining, available);
      allocation.qty = formatIssueQuantity(allocated, product.uom);
      remaining -= allocated;
    });
  }
  syncIssueQuantityFromAllocations(product);
}

function issueQuantityError(product: SalesIssueProduct) {
  const quantity = issueQuantityNumber(product.qty);
  if (pickingDialogOpen.value && issueLineIsSelected(product) && quantity <= 0) {
    return '请填写至少一个拣货位置的数量';
  }
  if (quantity <= 0) return '';
  const taskQuantity = issueQuantityNumber(product.taskQty || product.qty);
  if (taskQuantity > 0 && quantity > taskQuantity + 0.0001) {
    return `不能超过任务数量 ${formatIssueQuantity(taskQuantity, product.uom)}`;
  }
  const invalidAllocation = (product.allocations || [])
    .find((allocation) => issueAllocationError(product, allocation));
  if (invalidAllocation) return issueAllocationError(product, invalidAllocation);
  if (issueInventoryLoaded.value) {
    const available = issueAvailableQuantity(product);
    if (quantity > available + 0.0001) {
      return `当前可拣 ${formatIssueQuantity(available, product.uom)}`;
    }
  }
  return '';
}

function issueMissingSubmitFields() {
  const draft = issueDraft.value;
  if (!draft) return ['单据信息'];

  const missing: string[] = [];
  if (!draft.sourceDoc) missing.push('来源交付追踪');
  if (!draft.customer) missing.push('客户');
  if (!draft.deliveryMethod) missing.push('物流方式');
  if (!draft.contact) missing.push('收货人');
  if (!draft.contactPhone) missing.push('联系方式');
  if (!draft.address) missing.push('收货地址');
  if (!draft.expectedDate) missing.push('计划出库日期');
  if (!draft.date) missing.push('实际出库日期');
  if (
    !draft.products.length
    || draft.products.some((product) => !productIdentity(product, '').trim())
    || selectedIssueProducts.value.length === 0
  ) {
    missing.push('本次拣货结果');
  }
  return missing;
}

function issueRequiredLabelClass(label: string) {
  return {
    'required-label': true,
    'has-field-error': issueValidationAttempted.value && issueMissingSubmitFields().includes(label),
  };
}

function issueRequiredFieldClass(label: string) {
  return {
    'has-field-error': Boolean(issueRequiredLabelClass(label)['has-field-error']),
  };
}

function issueLineProductClass(product: SalesIssueProduct) {
  return {
    'has-line-field-error': issueValidationAttempted.value && !productIdentity(product, '').trim(),
  };
}

function issueLineQtyClass(product: SalesIssueProduct) {
  return {
    'has-line-field-error': issueValidationAttempted.value
      && (
        (selectedIssueProducts.value.length === 0 && issueQuantityNumber(product.qty) <= 0)
        || Boolean(issueQuantityError(product))
      ),
  };
}

function issueLineIsSelected(product: SalesIssueProduct) {
  if (pickingDialogOpen.value) {
    return selectedIssueLineIds.value.includes(issueLineSelectionKey(product));
  }
  return issueQuantityNumber(product.qty) > 0;
}

function toggleIssueLine(product: SalesIssueProduct, selected: boolean) {
  const unit = product.uom || '';
  const selectionKey = issueLineSelectionKey(product);
  if (selected) {
    if (!selectedIssueLineIds.value.includes(selectionKey)) {
      selectedIssueLineIds.value.push(selectionKey);
    }
    const taskQuantity = issueQuantityNumber(product.taskQty || product.qty);
    const proposedQuantity = issueInventoryLoaded.value
      ? Math.min(taskQuantity || 1, issueAvailableQuantity(product))
      : taskQuantity || 1;
    initializeIssueAllocations(product, Math.max(0, proposedQuantity));
    return;
  }
  selectedIssueLineIds.value = selectedIssueLineIds.value.filter((key) => key !== selectionKey);
  product.qty = `0${unit ? ` ${unit}` : ''}`;
  product.batch = '';
  product.allocations = [];
}

function issueTaskQuantity(product: SalesIssueProduct) {
  return product.taskQty || product.qty || '-';
}

function scrollToFirstValidationError() {
  void nextTick(() => {
    const marker = pickingDialogPanel.value?.querySelector(
      '.form-field .has-field-error, .form-field.has-field-error, .quote-line-table.has-field-error, .quote-line-row .has-line-field-error',
    ) as HTMLElement | null;
    const target = (marker?.closest('.form-field, .quote-line-table, .quote-line-row') as HTMLElement | null) ?? marker;
    const focusTarget = target?.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement | null;
    scrollElementIntoView(target);
    focusTarget?.focus();
  });
}

function showIssueValidationError(message: string) {
  showToast(message, 'error');
  scrollToFirstValidationError();
  return false;
}

function validateIssue() {
  const draft = issueDraft.value;
  if (!draft) return false;

  issueValidationAttempted.value = true;
  const missing = issueMissingSubmitFields();
  if (missing.length) return showIssueValidationError(missingSubmitSummary(missing));
  const invalidQuantity = draft.products.find((product) => issueQuantityError(product));
  if (invalidQuantity) {
    return showIssueValidationError(
      `${invalidQuantity.name || invalidQuantity.materialCode || '出库物料'}：${issueQuantityError(invalidQuantity)}`,
    );
  }
  issueValidationAttempted.value = false;
  return true;
}

async function submitIssue() {
  const action = issuePrimaryAction.value;
  if (!action) {
    showToast('当前状态不可继续流转', 'error');
    return;
  }
  if (!canWriteWarehouse.value || !canPostWarehouse.value) {
    showToast(submitIssueActionTitle.value, 'error');
    return;
  }
  if (action.kind === 'picking') {
    openPickingDialog();
    return;
  }
  await runIssueAction('primary', async () => {
    const saved = issueDraft.value;
    if (!saved) return;

    isSaving.value = true;
    try {
      if (action.kind === 'post') {
        const response = await postSalesIssue(saved.code);
        issueDraft.value = toSalesIssue(response.issue);
        flowRecords.value = response.flowRecords;
        resetUnsavedChanges();
        showToast(action.message);
        await router.replace(`/warehouse/sales-issues/${encodeURIComponent(response.issue.code)}`);
        return;
      }

    } catch (error) {
      showToast(error instanceof Error ? error.message : '销售出库处理失败', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

async function submitPickingResult() {
  if (!issueDraft.value || !validateIssue()) return;
  if (!canWriteWarehouse.value || !canPostWarehouse.value) {
    showToast(submitPickingActionTitle.value, 'error');
    return;
  }
  await runIssueAction('primary', async () => {
    isSaving.value = true;
    try {
      const response = await submitSalesIssuePickingResult(issueDraft.value!.code, {
        idempotencyKey: globalThis.crypto?.randomUUID?.() || `sales-picking-${Date.now()}`,
        date: issueDraft.value!.date,
        products: issueDraft.value!.products.filter((product) => issueLineIsSelected(product)),
        note: issueDraft.value!.note,
        attachments: issueDraft.value!.attachments,
      });
      issueDraft.value = toSalesIssue(response.issue);
      flowRecords.value = response.flowRecords;
      pickingDialogSnapshot.value = null;
      pickingDialogOpen.value = false;
      selectedIssueLineIds.value = [];
      issueValidationAttempted.value = false;
      resetUnsavedChanges();
      restorePickingDialogFocus();
      showToast('拣货结果已提交，等待复核');
      await router.replace(`/warehouse/sales-issues/${encodeURIComponent(response.issue.code)}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '拣货结果提交失败', 'error');
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
  return false;
}

watch(() => route.fullPath, loadIssue, { immediate: true });

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section v-if="issueDraft" class="quote-editor warehouse-document-editor sales-issue-editor" :class="{ 'is-detail-view': isDetail, 'is-full-width-editor': !isDetail }">
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" to="/warehouse/sales-issues" aria-label="返回销售出库列表" title="返回销售出库列表">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ isDetail ? issueDraft.code : pageHeading }}</strong>
        </template>

        <template #actions>
          <template v-if="isDetail">
            <PinReferenceButton
              v-if="referencePath"
              class="topbar-optional-action"
              :title="referenceTitle"
              :subtitle="referenceSubtitle"
              :path="referencePath"
            />
            <button class="secondary-action topbar-optional-action" type="button" title="查看销售出库流转日志" @click="showFlowRecords = true">
              <FileText :size="15" />
              日志
            </button>
            <RouterLink
              v-if="issueDraft.status === '已出库'"
              class="secondary-action"
              :to="`/warehouse/stock-ledger?keyword=${encodeURIComponent(issueDraft.code)}`"
              title="按本销售出库任务号查看库存流水"
            >
              <Boxes :size="15" />
              库存流水
            </RouterLink>
            <div
              v-if="issueMoreActions.length"
              class="order-more-action-wrap"
              @keydown.esc.stop="issueMoreActionsOpen = false"
            >
              <button
                ref="issueMoreActionsTrigger"
                class="secondary-action"
                type="button"
                title="更多操作"
                aria-haspopup="menu"
                aria-controls="detail-more-menu"
                :aria-expanded="issueMoreActionsOpen"
                @click="issueMoreActionsOpen = !issueMoreActionsOpen"
              >
                更多
              </button>
              <div v-if="issueMoreActionsOpen" id="detail-more-menu" class="order-more-menu" role="menu">
                <button
                  v-for="action in issueMoreActions"
                  :key="action.key"
                  type="button"
                  role="menuitem"
                  :class="{ 'danger-option': action.tone === 'danger' }"
                  :title="action.description"
                  @click="handleIssueMoreAction(action)"
                >
                  <strong>{{ action.label }}</strong>
                  <span>{{ action.description }}</span>
                </button>
              </div>
            </div>
            <button
              v-if="issueDraft.status !== '已出库' && issuePrimaryAction"
              class="primary-action async-document-action"
              type="button"
              :disabled="isSaving || isIssueActionPending || !issuePrimaryActionAllowed"
              :aria-busy="activeIssueAction === 'primary'"
              :title="submitIssueActionTitle"
              @click="submitIssue"
            >
              <Send :size="15" />
              {{ activeIssueAction === 'primary' ? '处理中' : issuePrimaryActionLabel }}
            </button>
          </template>

        </template>

        <template #fallback>
          <div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1><p v-if="loadMessage" class="section-hint">{{ loadMessage }}</p></div></div>
        </template>
      </PageTopbarPortal>

      <OperationPermissionBanner :message="operationPermissionHint" :suffix="operationPermissionSuffix" />

      <section v-if="issueDraft.reversalCode" class="warehouse-reversal-notice" aria-label="库存冲销记录">
        <div>
          <span>独立纠错记录</span>
          <strong>{{ issueDraft.reversalCode }} 已冲销本单库存影响</strong>
          <small>{{ issueDraft.reversalReason }} · {{ issueDraft.reversedBy }} · {{ issueDraft.reversedAt }}</small>
        </div>
        <b>原单状态保留</b>
      </section>

      <div class="quote-form-grid" :class="{ 'is-entry-only': !isDetail }">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading">
              <h2>任务概览</h2>
            </div>

            <div class="quote-fields sales-issue-overview-fields">
              <label class="form-field">
                <span>销售出库任务号</span>
                <output class="form-readonly-value quote-code">{{ issueDraft.code }}</output>
              </label>
              <label class="form-field">
                <span>来源交付任务</span>
                <RouterLink v-if="salesIssueSourceRequestPath" class="form-readonly-value quote-code" :to="salesIssueSourceRequestPath" :title="`查看交付追踪 ${issueDraft.sourceDoc}`">{{ issueDraft.sourceDoc }}</RouterLink>
                <output v-else class="form-readonly-value quote-code">—</output>
              </label>
              <label class="form-field">
                <span>来源销售订单</span>
                <RouterLink v-if="salesIssueSourceOrderPath" class="form-readonly-value quote-code" :to="salesIssueSourceOrderPath" :title="`查看销售订单 ${issueDraft.sourceOrder}`">{{ issueDraft.sourceOrder }}</RouterLink>
                <output v-else class="form-readonly-value quote-code">—</output>
              </label>
              <label class="form-field">
                <span>公司</span>
                <output class="form-readonly-value">{{ issueDraft.company || '—' }}</output>
              </label>
              <label class="form-field">
                <span>客户</span>
                <output class="form-readonly-value">{{ issueDraft.customer || '—' }}</output>
              </label>
              <label class="form-field">
                <span>计划出库日期</span>
                <output class="form-readonly-value">{{ issueDraft.expectedDate || '—' }}</output>
              </label>
              <label class="form-field">
                <span>交付方式</span>
                <output class="form-readonly-value">{{ issueDraft.deliveryMethod || '—' }}</output>
              </label>
              <label class="form-field">
                <span>收货人</span>
                <output class="form-readonly-value">{{ issueDraft.contact || '—' }}</output>
              </label>
              <label class="form-field">
                <span>联系方式</span>
                <output class="form-readonly-value">{{ issueDraft.contactPhone || '—' }}</output>
              </label>
              <label class="form-field sales-issue-overview-address">
                <span>收货地址</span>
                <output class="form-readonly-value">{{ issueDraft.address || '—' }}</output>
              </label>
              <label class="form-field sales-issue-overview-requirement">
                <span>补充要求</span>
                <output class="form-readonly-value">{{ issueDraft.supplementaryRequirement || issueDraft.sourceRemark || '—' }}</output>
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>出库任务进度</h2>
            </div>

            <div
              v-if="issueProgressProducts.length"
              class="purchase-inbound-summary-list"
              :class="{ 'has-field-error': issueValidationAttempted && issueMissingSubmitFields().includes('本次拣货结果') }"
            >
              <article
                v-for="item in issueProgressProducts"
                :key="item.lineId || item.sourceLineId || item.materialCode || item.name"
                class="purchase-inbound-summary-card sales-issue-progress-card"
              >
                <header class="purchase-inbound-summary-head">
                  <MaterialIdentity
                    :name="item.name"
                    :code="item.materialCode"
                    :model="item.model"
                    :spec="item.spec"
                    :image-label="issueLineVisual(item).label"
                    :image-tone="issueLineVisual(item).tone"
                  />
                </header>
                <div class="purchase-inbound-progress-pair">
                  <div>
                    <header>
                      <span>拣货进度</span>
                      <strong>{{ issuePickingProgressPercent(item) }}%</strong>
                    </header>
                    <div
                      class="purchase-inbound-progress-track"
                      role="progressbar"
                      aria-label="拣货进度"
                      :aria-valuenow="issuePickingProgressPercent(item)"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <i :style="{ width: `${issuePickingProgressPercent(item)}%` }"></i>
                    </div>
                  </div>
                  <div>
                    <header>
                      <span>出库进度</span>
                      <strong>{{ issuePostingProgressPercent(item) }}%</strong>
                    </header>
                    <div
                      class="purchase-inbound-progress-track is-posted"
                      role="progressbar"
                      aria-label="出库进度"
                      :aria-valuenow="issuePostingProgressPercent(item)"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <i :style="{ width: `${issuePostingProgressPercent(item)}%` }"></i>
                    </div>
                  </div>
                </div>
                <dl class="sales-issue-progress-facts">
                  <div>
                    <dt>任务数量</dt>
                    <dd>{{ issueTaskQuantity(item) }}</dd>
                  </div>
                  <div>
                    <dt>{{ issueDraft.reversalCode ? '原拣货数量' : '本次拣货' }}</dt>
                    <dd>{{ issuePickingSubmitted ? item.qty : formatIssueQuantity(0, item.uom) }}</dd>
                  </div>
                  <div :class="{ 'is-emphasis': issueInventoryPosted }">
                    <dt>{{ issueDraft.reversalCode ? '当前有效出库' : '已出库' }}</dt>
                    <dd>{{ issueInventoryPosted ? item.qty : formatIssueQuantity(0, item.uom) }}</dd>
                  </div>
                  <div v-if="issueUnselectedQuantity(item) > 0.0001">
                    <dt>本次未出</dt>
                    <dd>{{ formatIssueQuantity(issueUnselectedQuantity(item), item.uom) }}</dd>
                  </div>
                </dl>
              </article>
            </div>
            <div v-else class="list-empty-state warehouse-source-empty">
              <strong>暂无出库物料</strong>
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>出库记录</h2>
            </div>
            <div v-if="issueRecordLines.length" class="receipt-record-list">
              <article class="receipt-record-card" :class="{ 'is-reversed': issueDraft.reversalCode }">
                <div class="receipt-record-lines">
                  <div
                    v-for="line in issueRecordLines"
                    :key="line.key"
                    class="receipt-record-entry is-inbound"
                  >
                    <dl class="receipt-record-grid receipt-record-primary-grid is-inbound">
                      <div class="is-material">
                        <dt>物料</dt>
                        <dd class="receipt-record-material-value">
                          <MaterialIdentity
                            compact
                            :name="line.product.name"
                            :code="line.product.materialCode"
                            :model="line.product.model"
                            :spec="line.product.spec"
                            :image-label="issueLineVisual(line.product).label"
                            :image-tone="issueLineVisual(line.product).tone"
                          />
                        </dd>
                      </div>
                      <div>
                        <dt>本次出库数量</dt>
                        <dd>{{ line.quantity }}</dd>
                      </div>
                      <div class="is-result">
                        <dt>出库结果</dt>
                        <dd class="receipt-record-document-value">
                          <i v-if="issueDraft.reversalCode" class="mini-status status-muted">已由 {{ issueDraft.reversalCode }} 冲销</i>
                          <i v-else-if="issueInventoryPosted" class="mini-status status-done">有效过账</i>
                          <i v-else class="mini-status status-pending">待确认出库</i>
                        </dd>
                      </div>
                    </dl>
                    <dl class="receipt-record-grid receipt-record-secondary-grid is-inbound">
                      <div>
                        <dt>出库仓库</dt>
                        <dd>{{ line.warehouse }}</dd>
                      </div>
                      <div>
                        <dt>出库库位</dt>
                        <dd>{{ line.location }}</dd>
                      </div>
                      <div>
                        <dt>批次</dt>
                        <dd>{{ line.batch }}</dd>
                      </div>
                      <div>
                        <dt>{{ issueInventoryPosted ? '出库日期' : '作业日期' }}</dt>
                        <dd>{{ issueDraft.date || '历史出库日期未登记' }}</dd>
                      </div>
                      <div>
                        <dt>出库人</dt>
                        <dd>{{ issueDraft.postedBy || (issueInventoryPosted ? '历史出库人未登记' : '待过账') }}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
                <dl v-if="issueDraft.note" class="sales-issue-record-note">
                  <dt>拣货备注</dt>
                  <dd>{{ issueDraft.note }}</dd>
                </dl>
              </article>
            </div>
            <div v-else class="list-empty-state warehouse-source-empty receipt-record-empty">
              <strong>尚无已提交的出库记录</strong>
              <span>登记拣货并提交复核后生成记录。</span>
            </div>
          </section>
        </div>

        <aside class="quote-summary-panel">
          <section v-if="isDetail" class="summary-section">
            <DocumentStatusPanel
              title="当前任务状态"
              :primary-status="issueLifecycleStatus"
              :items="issueStatusPanelItems"
              aria-label="销售出库状态与进度"
            />
          </section>

          <section v-if="issueAttachments.length" class="summary-section">
            <div class="form-section-head">
              <div class="summary-title">
                <Paperclip :size="17" />
                <h2>附件</h2>
              </div>
            </div>
            <div class="attachment-list">
              <div v-for="file in issueAttachments" :key="file.name" class="attachment-row">
                <span class="attachment-icon">
                  <Paperclip :size="16" />
                </span>
                <div>
                  <strong>{{ file.name }}</strong>
                  <small>{{ file.size }} · {{ file.uploader }} · {{ file.date }}</small>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      title="销售出库单"
      :message="loadMessage || '销售出库单不存在'"
      back-path="/warehouse/sales-issues"
      back-label="返回销售出库列表"
      @retry="loadIssue"
    />

    <Teleport to="body">
      <div
        v-if="pickingDialogOpen && issueDraft"
        class="receipt-action-dialog-overlay"
        @mousedown.self="closePickingDialog"
      >
        <section
          ref="pickingDialogPanel"
          class="receipt-action-dialog warehouse-action-dialog sales-picking-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sales-picking-dialog-title"
          tabindex="-1"
          @keydown.tab="handlePickingDialogTab"
          @keydown.esc.stop.prevent="closePickingDialog"
        >
          <header class="receipt-action-dialog-header">
            <div>
              <h2 id="sales-picking-dialog-title">登记拣货</h2>
              <p>
                {{ issueDraft.code }}
                <span aria-hidden="true"> · </span>
                {{ issueDraft.customer || '未记录客户' }}
              </p>
            </div>
            <button
              type="button"
              aria-label="关闭拣货登记窗口"
              title="关闭拣货登记窗口"
              :disabled="isIssueActionPending || isSaving"
              @click="closePickingDialog"
            >
              <X :size="18" />
            </button>
          </header>

          <div class="receipt-action-dialog-body">
            <section class="receipt-dialog-section warehouse-dialog-operation-section">
              <div class="receipt-dialog-section-heading">
                <div><h3>本次作业信息</h3></div>
              </div>
              <div class="warehouse-dialog-command-bar is-operation sales-picking-operation-bar">
                <label class="form-field" :class="issueRequiredFieldClass('实际出库日期')">
                  <span :class="issueRequiredLabelClass('实际出库日期')">实际出库日期</span>
                  <input v-model="issueDraft.date" type="date" :max="today()" />
                </label>
                <label class="form-field warehouse-dialog-readonly-field">
                  <span>计划出库日期</span>
                  <output class="form-readonly-value">{{ issueDraft.expectedDate || '未设置' }}</output>
                </label>
              </div>
            </section>

            <section class="receipt-dialog-section warehouse-dialog-result-section sales-picking-result-section">
              <div class="receipt-dialog-section-heading warehouse-dialog-result-heading sales-picking-section-heading">
                <div class="warehouse-dialog-result-title sales-picking-section-title">
                  <h3>本次物料结果</h3>
                  <span>{{ selectedIssueLineIds.length }} / {{ issueDraft.products.length }} 种物料</span>
                </div>
              </div>
              <div
                class="sales-picking-line-list"
                :class="{ 'has-field-error': issueValidationAttempted && issueMissingSubmitFields().includes('本次拣货结果') }"
              >
                <article
                  v-for="(item, index) in issueDraft.products"
                  :key="`${item.sourceLineId || item.materialCode || 'picking'}-${index}`"
                  class="sales-picking-line-card warehouse-dialog-material-line-card"
                  :class="{ 'is-selected': issueLineIsSelected(item) }"
                >
                  <div class="sales-picking-product warehouse-dialog-material-product">
                    <label class="sales-picking-line-toggle warehouse-dialog-line-toggle">
                      <input
                        type="checkbox"
                        :checked="issueLineIsSelected(item)"
                        @change="toggleIssueLine(item, ($event.target as HTMLInputElement).checked)"
                      />
                      <span>本次出库</span>
                    </label>
                    <MaterialIdentity
                      :class="issueLineProductClass(item)"
                      :name="item.name"
                      :code="item.materialCode"
                      :model="item.model"
                      :spec="item.spec"
                      :image-label="lineItems[index]?.image.label"
                      :image-tone="lineItems[index]?.image.tone"
                    />
                  </div>
                  <dl class="warehouse-dialog-material-metrics sales-picking-line-metrics">
                    <div>
                      <dt>任务数量</dt>
                      <dd>{{ issueTaskQuantity(item) }}</dd>
                    </div>
                    <div>
                      <dt>本次最多</dt>
                      <dd>{{ issueMaximumText(item) }}</dd>
                    </div>
                    <div class="is-current">
                      <dt>本次合计</dt>
                      <dd>{{ issueLineIsSelected(item) ? item.qty : `0${item.uom ? ` ${item.uom}` : ''}` }}</dd>
                    </div>
                  </dl>
                  <div v-if="issueLineIsSelected(item)" class="sales-picking-allocation-block">
                    <div v-if="item.allocations?.length" class="sales-picking-allocation-table">
                      <div class="sales-picking-allocation-row is-head">
                        <span>仓库</span>
                        <span>拣货库位</span>
                        <span>批次</span>
                        <span>当前可供</span>
                        <span>本次拣货</span>
                      </div>
                      <div
                        v-for="allocation in item.allocations"
                        :key="allocation.allocationId || issueAllocationIdentity(allocation)"
                        class="sales-picking-allocation-row"
                        :class="{ 'has-line-field-error': issueValidationAttempted && issueAllocationError(item, allocation) }"
                      >
                        <strong>{{ allocation.warehouse || allocation.warehouseCode || '未记录仓库' }}</strong>
                        <strong>{{ salesIssueLocationDisplay(allocation.location) }}</strong>
                        <span>{{ salesIssueBatchDisplay(allocation.batch, item) }}</span>
                        <span>{{ issueAllocationAvailableText(item, allocation) }}</span>
                        <div>
                          <QuantityWithUnitInput
                            v-model="allocation.qty"
                            :unit="item.uom"
                            placeholder="0"
                            :class="issueLineQtyClass(item)"
                            @update:model-value="syncIssueQuantityFromAllocations(item)"
                          />
                          <small v-if="issueValidationAttempted && issueAllocationError(item, allocation)" class="field-error-text">
                            {{ issueAllocationError(item, allocation) }}
                          </small>
                        </div>
                      </div>
                    </div>
                    <div v-else class="sales-picking-allocation-empty">
                      可销售出库仓暂无可供库存
                    </div>
                    <small v-if="issueQuantityError(item)" class="field-error-text sales-picking-line-error">
                      {{ issueQuantityError(item) }}
                    </small>
                  </div>
                </article>
              </div>
            </section>

            <section class="receipt-dialog-section warehouse-dialog-supplement-section">
              <div class="receipt-dialog-section-heading">
                <div><h3>备注与附件</h3></div>
              </div>
              <div class="warehouse-dialog-supplement-grid">
                <label class="form-field">
                  <span>拣货备注</span>
                  <textarea
                    v-model="issueDraft.note"
                    class="terms-textarea"
                    rows="4"
                    placeholder="补充拣货差异、包装或交接事项（选填）"
                  ></textarea>
                </label>
                <div class="receipt-dialog-attachments">
                <div class="form-section-head">
                  <div class="summary-title">
                    <Paperclip :size="17" />
                    <h3>发运附件</h3>
                  </div>
                  <label
                    class="secondary-action compact-action file-upload-button"
                    :class="{ 'is-disabled': isReadOnly }"
                    :aria-disabled="isReadOnly"
                    :title="issueAttachmentTitle"
                  >
                    <Upload :size="15" />
                    上传
                    <input type="file" multiple :disabled="isReadOnly" @change="handleAttachmentUpload" />
                  </label>
                </div>
                <div v-if="issueAttachments.length" class="attachment-list">
                  <div v-for="file in issueAttachments" :key="file.name" class="attachment-row">
                    <span class="attachment-icon"><Paperclip :size="16" /></span>
                    <div>
                      <strong>{{ file.name }}</strong>
                      <small>{{ file.size }} · {{ file.uploader }} · {{ file.date }}</small>
                    </div>
                  </div>
                </div>
                <div v-else class="attachment-empty">
                  <Paperclip :size="17" />
                  <span>暂无发运附件</span>
                </div>
                </div>
              </div>
            </section>
          </div>

          <footer class="receipt-action-dialog-footer">
            <button
              class="secondary-action"
              type="button"
              :disabled="isIssueActionPending || isSaving"
              title="取消并关闭拣货登记窗口"
              @click="closePickingDialog"
            >取消</button>
            <button
              class="primary-action async-document-action"
              type="button"
              :disabled="isIssueActionPending || isSaving || !canWriteWarehouse || !canPostWarehouse"
              :aria-busy="activeIssueAction === 'primary'"
              :title="submitPickingActionTitle"
              @click="submitPickingResult"
            >
              <Send :size="15" />
              {{ activeIssueAction === 'primary' ? '提交中' : '提交复核' }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>

    <FlowRecordPanel
      :open="showFlowRecords"
      title="销售出库日志"
      :records="flowRecords"
      @close="showFlowRecords = false"
    />
    <WarehouseReversalDialog
      :open="reversalDialogOpen"
      title="冲销销售出库库存"
      :record-code="issueDraft?.code || ''"
      :pending="activeIssueAction === 'reverse'"
      @close="reversalDialogOpen = false"
      @submit="submitIssueReversal"
    />
    <div v-if="toastMessage" class="app-toast" :class="{ error: toastTone === 'error' }" :role="toastTone === 'error' ? 'alert' : 'status'" :aria-live="toastTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ toastMessage }}</div>
  </div>
</template>

<style scoped>
.sales-issue-overview-fields {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.sales-issue-overview-fields > .sales-issue-overview-address {
  grid-column: 1 / -1 !important;
}

.sales-issue-overview-fields > .sales-issue-overview-requirement {
  grid-column: 1 / -1 !important;
}

.sales-issue-progress-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  margin: 12px 0 0;
  overflow: hidden;
  border: 1px solid #e4e8e1;
  border-radius: 9px;
  background: #fff;
}

.sales-issue-progress-facts > div {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 10px 12px;
  border-right: 1px solid #edf0eb;
}

.sales-issue-progress-facts > div:last-child {
  border-right: 0;
}

.sales-issue-progress-facts dt,
.sales-issue-progress-facts dd {
  margin: 0;
}

.sales-issue-progress-facts dt {
  color: #81877f;
  font-size: 10px;
}

.sales-issue-progress-facts dd {
  color: #30362f;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.sales-issue-progress-facts > .is-emphasis {
  background: #f1f7ed;
}

.sales-issue-progress-facts > .is-emphasis dd {
  color: #3d6b36;
}

.sales-picking-operation-bar {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sales-issue-record-note {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 10px 14px;
  border: 1px solid #e3e7df;
  border-radius: 8px;
  background: #f6f8f4;
}

.sales-issue-record-note dt,
.sales-issue-record-note dd {
  margin: 0;
  line-height: 1.5;
}

.sales-issue-record-note dt {
  color: #81877f;
  font-size: 10px;
  font-weight: 600;
}

.sales-issue-record-note dd {
  color: #30362f;
  font-size: 11px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.sales-issue-editor.is-detail-view .quote-summary-panel {
  align-content: start;
  align-items: start;
  gap: 12px;
  overflow: visible;
  border: 0;
  background: transparent;
}

.sales-issue-editor.is-detail-view .quote-summary-panel .summary-section,
.sales-issue-editor.is-detail-view .quote-summary-panel .summary-section:first-child {
  width: 100%;
  align-self: start;
  border: 1px solid var(--detail-card-border, #e2e4de);
  border-radius: var(--detail-card-radius, 10px);
  background: var(--panel-strong);
}

.sales-picking-dialog {
  width: min(960px, 100%);
  max-height: min(90vh, 840px);
}

.sales-picking-dialog .receipt-action-dialog-body {
  gap: 12px;
  padding: 14px 16px 18px;
}

.sales-picking-result-section {
  padding: 14px;
}

.sales-picking-section-heading {
  align-items: flex-end;
  margin-bottom: 12px;
}

.sales-picking-section-title {
  display: flex;
  gap: 9px;
  align-items: center;
  min-height: 38px;
}

.sales-picking-section-title > span {
  padding: 3px 8px;
  border-radius: 999px;
  color: var(--text-soft);
  background: var(--panel);
  font-size: 11px;
  font-weight: 650;
}

.sales-picking-date-field {
  width: 190px;
  flex: 0 0 190px;
}

.sales-picking-date-field > span {
  font-size: 11px;
}

.sales-picking-date-field input {
  min-height: 36px;
}

.sales-picking-line-list {
  display: grid;
  gap: 10px;
}

.sales-picking-line-card {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(330px, .9fr);
  gap: 12px 18px;
  align-items: center;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel-strong);
}

.sales-picking-line-card.is-selected {
  border-color: color-mix(in srgb, var(--text) 24%, var(--line));
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--text) 72%, transparent);
}

.sales-picking-line-toggle {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 88px;
  color: var(--text);
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.sales-picking-line-toggle input {
  width: 16px;
  height: 16px;
}

.sales-picking-product {
  display: grid;
  grid-template-columns: auto 44px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.sales-picking-product:has(> .material-identity) {
  grid-template-columns: auto minmax(0, 1fr);
}

.sales-picking-product > .material-identity {
  width: 100%;
}

.sales-picking-product .product-thumb {
  width: 44px;
  height: 44px;
}

.sales-picking-product .line-product-card {
  min-width: 0;
  min-height: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
}

.sales-picking-line-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-width: 0;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--panel);
}

.sales-picking-line-metrics > div {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 9px 10px;
  border-left: 1px solid var(--line);
}

.sales-picking-line-metrics > div:first-child {
  border-left: 0;
}

.sales-picking-line-metrics dt,
.sales-picking-line-metrics dd {
  min-width: 0;
  margin: 0;
}

.sales-picking-line-metrics dt {
  color: var(--muted);
  font-size: 10px;
  font-weight: 600;
}

.sales-picking-line-metrics dd {
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sales-picking-line-metrics .is-current {
  background: color-mix(in srgb, var(--success) 7%, var(--panel));
}

.sales-picking-allocation-block {
  display: grid;
  grid-column: 1 / -1;
  gap: 8px;
  min-width: 0;
  padding-top: 2px;
}

.sales-picking-allocation-table {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
}

.sales-picking-allocation-row {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) minmax(120px, .78fr) minmax(140px, .9fr) minmax(110px, .65fr) minmax(160px, .85fr);
  gap: 14px;
  align-items: center;
  min-width: 0;
  padding: 10px 12px;
  border-top: 1px solid var(--line);
  color: var(--text-soft);
  font-size: 13px;
}

.sales-picking-allocation-row:first-child {
  border-top: 0;
}

.sales-picking-allocation-row.is-head {
  padding-top: 8px;
  padding-bottom: 8px;
  background: var(--panel-strong);
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
}

.sales-picking-allocation-row > strong {
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sales-picking-allocation-row > div {
  min-width: 0;
}

.sales-picking-allocation-row .quantity-with-unit-input {
  min-width: 0;
}

.sales-picking-allocation-row.has-line-field-error {
  background: color-mix(in srgb, var(--danger) 5%, var(--panel));
}

.sales-picking-allocation-empty {
  padding: 15px;
  border: 1px dashed var(--line-strong);
  border-radius: 10px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}

.sales-picking-line-error {
  padding-left: 2px;
}

.field-error-text {
  color: var(--danger);
  font-size: 12px;
}

@media (max-width: 900px) {
  .sales-issue-overview-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sales-issue-overview-fields > .sales-issue-overview-address {
    grid-column: span 2 !important;
  }

  .sales-picking-line-card {
    grid-template-columns: 1fr;
  }

  .sales-picking-allocation-row {
    grid-template-columns: minmax(140px, 1fr) minmax(110px, .8fr) minmax(125px, .9fr) minmax(100px, .7fr) minmax(145px, .9fr);
  }

}

@media (max-width: 620px) {
  .sales-issue-overview-fields {
    grid-template-columns: 1fr;
  }

  .sales-issue-overview-fields > .sales-issue-overview-address {
    grid-column: auto !important;
  }

  .sales-picking-section-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .sales-picking-date-field {
    width: 100%;
    flex-basis: auto;
  }

  .sales-picking-product {
    grid-template-columns: auto 40px minmax(0, 1fr);
  }

  .sales-picking-product:has(> .material-identity) {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .sales-picking-line-toggle {
    min-width: 0;
  }

  .sales-picking-line-toggle span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .sales-picking-allocation-table {
    overflow-x: auto;
  }

  .sales-picking-allocation-row {
    min-width: 790px;
  }

}
</style>
