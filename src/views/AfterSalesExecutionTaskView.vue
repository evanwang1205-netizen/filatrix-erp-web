<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { ArrowLeft, Boxes, Check, Paperclip, Play, Plus, Trash2, Upload, X } from 'lucide-vue-next';

import DocumentLoadState from '../components/DocumentLoadState.vue';
import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';
import MaterialIdentity from '../components/MaterialIdentity.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import QuantityWithUnitInput from '../components/QuantityWithUnitInput.vue';
import ReferencePicker from '../components/ReferencePicker.vue';
import { purchaseMaterialVisuals } from '../data/purchase';
import { productVisuals } from '../data/sales';
import { useDialogFocus } from '../composables/useDialogFocus';
import { useOperationPermission } from '../composables/useModulePermission';
import {
  completeAfterSalesExecutionTask,
  getAfterSalesExecutionTask,
  listReference,
  listWarehouseInventory,
  startAfterSalesExecutionTask,
  type AfterSalesExecutionModulePath,
} from '../services/api';
import type {
  AfterSalesExecutionRecord,
  AfterSalesReceiptAllocation,
  AfterSalesExecutionTask,
  AfterSalesWarehouseAllocation,
  Attachment,
  PurchaseAfterSale,
  ReferenceOption,
  SalesAfterSale,
  SalesAfterSaleProduct,
  WarehouseInventoryRow,
} from '../types/business';
import type { DocumentStatusItem } from '../types/documentUi';
import { afterSalesBatchLabel } from '../utils/afterSalesBatch';
import { attachmentsFromFileList } from '../utils/attachmentUpload';
import { productQtyWithUnit } from '../utils/productDisplay';
import { statusPresentationClass } from '../utils/statusPresentation';

type TaskDetail = AfterSalesExecutionTask & {
  companyCode?: string;
  company?: string;
  partyCode?: string;
  stockFacts?: Array<Record<string, unknown>>;
  adjustmentCode?: string;
  sourceBatchKeys?: string[];
};

type WarehouseReferenceRaw = {
  code?: string;
  name?: string;
  locationOptions?: string[];
};

type ExecutionRecordLine = {
  key: string;
  record: AfterSalesExecutionRecord;
  product: SalesAfterSaleProduct;
  allocation?: AfterSalesWarehouseAllocation;
  receiptAllocation?: AfterSalesReceiptAllocation;
  stockFact?: Record<string, unknown>;
};

const route = useRoute();
const modulePath = String(route.meta.afterSalesExecutionModule || 'warehouse') as AfterSalesExecutionModulePath;
const moduleName = ({ warehouse: '仓库', quality: '质检', production: '生产' } as const)[modulePath];
const permissionKey = ({ warehouse: 'warehousePost', quality: 'qualityOperate', production: 'productionOperate' } as const)[modulePath];
const { canOperate, readonlyReason } = useOperationPermission(permissionKey, `执行${moduleName}售后任务`);

const task = ref<TaskDetail | null>(null);
const afterSale = ref<SalesAfterSale | PurchaseAfterSale | null>(null);
const loading = ref(true);
const loadError = ref('');
const actionError = ref('');
const actionMessage = ref('');
const acting = ref(false);
const executionDialogOpen = ref(false);
const executionDialogPanel = ref<HTMLElement | null>(null);
const validationAttempted = ref(false);
const selectedWarehouseLocationOptions = ref<string[]>([]);
const inventoryRows = ref<WarehouseInventoryRow[]>([]);
const eligibleWarehouseOptions = ref<ReferenceOption[]>([]);
const inventoryLoaded = ref(false);
const {
  focusDialog: focusExecutionDialog,
  restoreDialogFocus: restoreExecutionDialogFocus,
  handleDialogTab: handleExecutionDialogTab,
} = useDialogFocus(executionDialogPanel);

const form = reactive<{
  actualDate: string;
  warehouseCode: string;
  warehouse: string;
  location: string;
  disposition: string;
  evidence: string;
  note: string;
  attachments: Attachment[];
  allocations: AfterSalesWarehouseAllocation[];
  receiptAllocations: AfterSalesReceiptAllocation[];
}>({
  actualDate: '',
  warehouseCode: '',
  warehouse: '',
  location: '',
  disposition: '',
  evidence: '',
  note: '',
  attachments: [],
  allocations: [],
  receiptAllocations: [],
});

const code = computed(() => String(route.params.code || ''));
const backPath = computed(() => `/${modulePath}/after-sales`);
const canStart = computed(() => task.value?.status === '待处理');
const canComplete = computed(() => task.value?.status === '处理中');
const isWarehouseTask = computed(() => modulePath === 'warehouse');
const isQualityTask = computed(() => modulePath === 'quality');
const isProductionTask = computed(() => modulePath === 'production');
const minimumActualDate = computed(() => String(task.value?.startedAt || task.value?.createdAt || '').slice(0, 10));
const productionSupplementHasError = computed(() => (
  validationAttempted.value
  && isProductionTask.value
  && !form.evidence.trim()
  && !form.note.trim()
));
const qualitySupplementHasError = computed(() => (
  validationAttempted.value
  && isQualityTask.value
  && !form.evidence.trim()
  && !form.note.trim()
  && !form.attachments.length
));
const supplementHasError = computed(() => productionSupplementHasError.value || qualitySupplementHasError.value);
const supplementRequirementMessage = computed(() => (
  isQualityTask.value
    ? '检验依据、检验备注或检验附件至少保留一项'
    : '返修记录号或返修备注至少填写一项'
));
const isInboundTask = computed(() => task.value?.direction === '入库');
const exactAllocationKinds = ['补发出库', '换货出库', '采购退货出库'];
const usesExactInventoryAllocation = computed(() => (
  isWarehouseTask.value && exactAllocationKinds.includes(task.value?.kind || '')
));
const usesReceiptBatchAllocation = computed(() => (
  isWarehouseTask.value && task.value?.kind === '客户退货接收'
));
const salesReturnDisposition = computed(() => (
  (afterSale.value?.executionTasks || []).find((candidate) => candidate.kind === '销售退货检验')?.disposition || ''
));
const isSalesReturnRestock = computed(() => (
  task.value?.kind === '销售退货处置' && salesReturnDisposition.value === '可再次销售'
));
const warehouseKind = computed(() => {
  if (!task.value) return '';
  if (task.value.kind === '客户退货接收') return '销售退货暂存';
  if (/供应商.*收货/.test(task.value.kind)) return '采购收货';
  if (/正式入库/.test(task.value.kind)) return '采购正式入库';
  if (['销售退货处置', '返修品入库处置'].includes(task.value.kind)) return '销售出库';
  return '';
});
const warehouseLabel = computed(() => {
  if (task.value?.kind === '客户退货接收') return '退货暂存仓';
  if (/供应商.*收货/.test(task.value?.kind || '')) return '采购暂存仓';
  if (/正式入库/.test(task.value?.kind || '')) return '正式入库仓库';
  if (task.value?.kind === '销售退货处置') return '处置目标仓库';
  if (task.value?.kind === '返修品入库处置') return '返修品入库仓库';
  return '作业仓库';
});
const locationLabel = computed(() => {
  if (task.value?.kind === '客户退货接收') return '暂存库位';
  if (/正式入库|返修品入库处置/.test(task.value?.kind || '')) return '入库库位';
  if (task.value?.kind === '销售退货处置') return '目标库位';
  return '作业库位';
});
const needsWarehouse = computed(() => {
  if (!isWarehouseTask.value || usesExactInventoryAllocation.value) return false;
  if (['返修品出库', '返修品报废处置', '退货品返还出库', '不合格品退回供应商', '异常暂存退回'].includes(task.value?.kind || '')) return false;
  if (task.value?.kind === '销售退货处置') return isSalesReturnRestock.value;
  return true;
});
const needsLocation = computed(() => {
  if (!isWarehouseTask.value || usesExactInventoryAllocation.value) return false;
  if (task.value?.kind === '销售退货处置') return isSalesReturnRestock.value;
  return isInboundTask.value;
});
const qualityOptions = computed(() => {
  if (task.value?.kind === '销售退货检验') {
    return ['可再次销售', '返修返工', '报废'];
  }
  if (task.value?.kind === '返修品复检') return ['合格', '报废'];
  if (task.value?.afterSaleKind === 'purchase') return ['合格', '让步接收', '不合格退回'];
  return ['合格', '让步接收'];
});
const dispositionLabel = computed(() => (
  task.value?.kind === '返修品复检' ? '本任务复检结果' : '本任务检验结果'
));
const taskPageTitle = computed(() => ({
  warehouse: '售后作业任务',
  quality: '售后检验任务',
  production: '售后返修任务',
} as const)[modulePath]);
const taskNumberLabel = computed(() => `${taskPageTitle.value}号`);
const backListLabel = computed(() => `返回${taskPageTitle.value.replace(/任务$/, '')}列表`);
const startActionLabel = computed(() => ({
  warehouse: '开始作业',
  quality: '开始检验',
  production: '开始返修',
} as const)[modulePath]);
const recordSectionLabel = computed(() => ({
  warehouse: '作业记录',
  quality: '检验记录',
  production: '返修记录',
} as const)[modulePath]);
const operationSectionLabel = computed(() => ({
  warehouse: '本次作业信息',
  quality: '本次检验信息',
  production: '本次返修信息',
} as const)[modulePath]);
const taskKindLabel = computed(() => ({
  warehouse: '作业类型',
  quality: '检验类型',
  production: '问题类型',
} as const)[modulePath]);
const taskKindValue = computed(() => (
  isProductionTask.value ? afterSale.value?.issueType || '—' : task.value?.kind || '—'
));
const caseIssueDescription = computed(() => (
  String(afterSale.value?.issueDescription || '').replace(/^\[售后流程测试[^\]]*\]\s*/, '').trim() || '—'
));
const executionQuantityLabel = computed(() => {
  if (isQualityTask.value) return '本次检验数量';
  if (isProductionTask.value) return '本次返修数量';
  if (task.value?.kind === '客户退货接收') return '本次接收数量';
  if (/入库/.test(task.value?.kind || '')) return '本次入库数量';
  if (/出库|退回|返还/.test(task.value?.kind || '')) return '本次出库数量';
  if (/处置/.test(task.value?.kind || '')) return '本次处置数量';
  return '本次数量';
});
const resultFieldLabel = computed(() => {
  if (isQualityTask.value) return dispositionLabel.value;
  if (isProductionTask.value) return '返修结果';
  if (task.value?.kind === '客户退货接收') return '接收结果';
  if (/入库/.test(task.value?.kind || '')) return '入库结果';
  if (/出库|退回|返还/.test(task.value?.kind || '')) return '出库结果';
  if (/处置/.test(task.value?.kind || '')) return '处置结果';
  return '作业结果';
});
const recordWarehouseLabel = computed(() => (
  needsWarehouse.value
    ? warehouseLabel.value
    : isInboundTask.value ? '实际入库仓库' : '实际出库仓库'
));
const recordLocationLabel = computed(() => (
  needsLocation.value
    ? locationLabel.value
    : isInboundTask.value ? '实际入库库位' : '实际出库库位'
));
const taskProducts = computed(() => task.value?.products || afterSale.value?.products || []);
const predecessorTasks = computed(() => (
  task.value?.predecessors
  || (afterSale.value?.executionTasks || []).filter((candidate) => task.value?.predecessorCodes?.includes(candidate.code))
));
const pendingPredecessorTasks = computed(() => predecessorTasks.value.filter((candidate) => candidate.status !== '已完成'));
const predecessorDisposition = computed(() => (
  predecessorTasks.value.find((candidate) => candidate.disposition)?.disposition || ''
));
const repairMaterialState = computed(() => {
  if (!isProductionTask.value) return afterSale.value?.goodsDisposition || '—';
  if (task.value?.status === '已取消') return '返修任务已取消';
  if (pendingPredecessorTasks.value.length || task.value?.status === '待前置') return '退货待检';
  if (task.value?.status === '已完成') return '质检冻结 · 待复检';
  if (task.value?.status === '处理中') return '质检冻结 · 返修中';
  return '质检冻结 · 待返修';
});
const caseParty = computed(() => (
  afterSale.value && 'supplier' in afterSale.value ? afterSale.value.supplier : (afterSale.value as SalesAfterSale | null)?.customer
));
const afterSaleDocumentLabel = computed(() => task.value?.afterSaleKind === 'purchase' ? '采购售后单' : '销售售后单');
const sourceOrderLabel = computed(() => task.value?.afterSaleKind === 'purchase' ? '来源采购订单' : '来源销售订单');
const sourceOrderPath = computed(() => (
  task.value?.sourceOrder
    ? `/${task.value.afterSaleKind === 'purchase' ? 'purchase' : 'sales'}/orders/${encodeURIComponent(task.value.sourceOrder)}`
    : ''
));
const actualDateLabel = computed(() => ({
  客户退货接收: '实际接收日期',
  补发出库: '实际出库日期',
  换货出库: '实际出库日期',
  采购退货出库: '实际退货日期',
  异常暂存退回: '实际退回日期',
  销售退货处置: '实际处置日期',
  返修品入库处置: '实际入库日期',
  退货品返还出库: '实际返还日期',
  销售退货检验: '实际检验日期',
  返修品复检: '实际检验日期',
  售后返修或返工: '实际返修日期',
}[task.value?.kind || ''] || '实际作业日期'));
const referencePath = computed(() => (
  task.value?.afterSaleCode
    ? `/${task.value.afterSaleKind === 'purchase' ? 'purchase' : 'sales'}/after-sales/${encodeURIComponent(task.value.afterSaleCode)}`
    : ''
));
const executionActionLabel = computed(() => ({
  客户退货接收: '登记退货接收',
  补发出库: '登记补发出库',
  换货出库: '登记换货出库',
  销售退货处置: '登记退货处置',
  返修品入库处置: '登记返修品入库',
  退货品返还出库: '登记退货品返还',
  销售退货检验: '登记检验结果',
  返修品复检: '登记复检结果',
  售后返修或返工: '登记返修结果',
  采购退货出库: '登记采购退货',
  异常暂存退回: '登记异常暂存退回',
  返修品出库: '登记返修品出库',
  返修品报废处置: '登记报废处置',
  不合格品退回供应商: '登记退回供应商',
}[task.value?.kind || ''] || '登记作业结果'));
const executionSubmitLabel = computed(() => executionActionLabel.value.replace(/^登记/, '提交'));
const evidenceLabel = computed(() => {
  if (isQualityTask.value) return '检验依据';
  if (isProductionTask.value) return '返修记录号';
  if (task.value?.kind === '客户退货接收') return '签收凭证';
  if (/出库|退回|返还/.test(task.value?.kind || '')) return '出库凭证';
  if (/处置/.test(task.value?.kind || '')) return '处置依据';
  return '作业凭证';
});
const noteLabel = computed(() => (
  isQualityTask.value ? '检验备注' : isProductionTask.value ? '返修备注' : '作业备注'
));
const attachmentLabel = computed(() => (
  isQualityTask.value ? '检验附件' : isProductionTask.value ? '返修附件' : '作业附件'
));
const notePlaceholder = computed(() => {
  if (isQualityTask.value) return '补充检验差异或判定说明（选填）';
  if (isProductionTask.value) return '填写返修方式、处理差异或复检注意事项（未填写记录号时必填）';
  return '补充本次作业差异或现场交接事项（选填）';
});
const unstartedRecordDescription = computed(() => {
  if (isQualityTask.value) return `开始检验后登记${actualDateLabel.value}、${resultFieldLabel.value}和${evidenceLabel.value}。`;
  if (isProductionTask.value) return `完成返修后登记${actualDateLabel.value}、${evidenceLabel.value}和复检交接说明。`;
  if (usesReceiptBatchAllocation.value) return `开始作业后登记${actualDateLabel.value}、${warehouseLabel.value}、${locationLabel.value}和实际退回批次。`;
  if (usesExactInventoryAllocation.value) return `开始作业后登记${actualDateLabel.value}，并按仓库、库位和批次分配本次数量。`;
  if (needsWarehouse.value) return `开始作业后登记${actualDateLabel.value}、${warehouseLabel.value}和${needsLocation.value ? locationLabel.value : evidenceLabel.value}。`;
  return `开始作业后登记${actualDateLabel.value}和${evidenceLabel.value}。`;
});
const evidencePlaceholder = computed(() => {
  if (isQualityTask.value) return '检验单号或检验依据';
  if (isProductionTask.value) return '生产或返修记录单号';
  return '物流单号、签收凭证或处置依据';
});
const attachmentPrompt = computed(() => {
  if (isQualityTask.value) return '上传检验报告、检测照片或其他检验证据';
  if (isProductionTask.value) return '上传返修记录、过程照片或其他作业凭证';
  return '上传物流面单、签收凭证或现场照片';
});
const completionSuccessMessage = computed(() => {
  if (isQualityTask.value) return '检验结果已提交，售后进度已同步';
  if (isProductionTask.value) return '返修结果已提交，返修品复检任务已释放';
  return '作业结果已提交，库存事实和售后进度已同步';
});
const stockActionResult = computed(() => {
  if (task.value?.status !== '已完成') return '未过账';
  if (task.value.kind === '客户退货接收') return '已进入退货暂存';
  if (task.value.kind === '销售退货处置' && task.value.disposition === '报废') return '已扣减报废库存';
  if (task.value.kind === '返修品报废处置') return '已扣减报废库存';
  if (['采购退货出库', '异常暂存退回', '不合格品退回供应商'].includes(task.value.kind)) return '已完成退货出库';
  if (isInboundTask.value) return '已入库';
  return '已出库';
});
const taskStatusPanelItems = computed<DocumentStatusItem[]>(() => {
  const items: DocumentStatusItem[] = [];
  if (!(task.value?.status === '已完成' && !task.value.startedAt)) {
    items.push({
      key: 'started',
      label: startActionLabel.value,
      value: task.value?.startedAt ? '已开始' : '未开始',
      detail: task.value?.startedAt ? [task.value.startedBy, task.value.startedAt].filter(Boolean).join(' · ') : '',
      kind: 'status',
      tone: task.value?.startedAt ? 'success' : 'warning',
    });
  }
  items.push({
    key: 'result',
    label: resultFieldLabel.value,
    value: task.value?.status === '已完成' ? '已提交' : task.value?.status === '处理中' ? '待登记' : '未登记',
    detail: task.value?.completedAt ? [task.value.completedBy, task.value.completedAt].filter(Boolean).join(' · ') : '',
    kind: 'status',
    tone: task.value?.status === '已完成' ? 'success' : 'warning',
  });
  if (isWarehouseTask.value) items.push({
    key: 'stock',
    label: '库存处理',
    value: stockActionResult.value,
    kind: 'status',
    tone: task.value?.status === '已完成' ? 'success' : 'warning',
  });
  return items;
});

function today() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function quantityNumber(value: string | number | undefined) {
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

function quantityText(value: number, unit = '') {
  const numberText = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  return `${numberText}${unit ? ` ${unit}` : ''}`;
}

function afterSalesTaskMaterialVisual(product: SalesAfterSaleProduct) {
  return productVisuals[product.name]
    ?? purchaseMaterialVisuals[product.name]
    ?? {
      label: product.imageLabel || '',
      tone: product.imageTone || '#eeeeee',
    };
}

function referenceLocationOptions(option?: ReferenceOption) {
  const raw = option?.raw as WarehouseReferenceRaw | undefined;
  return Array.isArray(raw?.locationOptions)
    ? raw.locationOptions.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
}

function handleWarehouseSelect(option: ReferenceOption) {
  form.warehouseCode = option.code;
  form.warehouse = option.name;
  selectedWarehouseLocationOptions.value = referenceLocationOptions(option);
  form.location = selectedWarehouseLocationOptions.value.length === 1 ? selectedWarehouseLocationOptions.value[0] : '';
}

function clearWarehouseSelection() {
  form.warehouseCode = '';
  form.warehouse = '';
  form.location = '';
  selectedWarehouseLocationOptions.value = [];
}

function resetFormFromTask() {
  if (!task.value) return;
  form.actualDate = task.value.actualDate || today();
  form.warehouseCode = task.value.warehouseCode || '';
  form.warehouse = task.value.warehouse || '';
  form.location = task.value.location || '';
  form.disposition = task.value.disposition || '';
  form.evidence = task.value.evidence || '';
  form.note = task.value.note || '';
  form.attachments = JSON.parse(JSON.stringify(task.value.attachments || [])) as Attachment[];
  form.allocations = JSON.parse(JSON.stringify(task.value.allocations || [])) as AfterSalesWarehouseAllocation[];
  form.receiptAllocations = JSON.parse(JSON.stringify(task.value.receiptAllocations || [])) as AfterSalesReceiptAllocation[];
}

async function loadSelectedWarehouseLocations() {
  selectedWarehouseLocationOptions.value = [];
  const query = form.warehouseCode || form.warehouse;
  if (!query || !needsLocation.value) return;
  try {
    const response = await listReference<WarehouseReferenceRaw>('warehouses', {
      q: query,
      activeOnly: true,
      kind: warehouseKind.value,
      company: task.value?.company || '',
      limit: 30,
    });
    const exact = response.items.find((option) => option.code === form.warehouseCode || option.name === form.warehouse);
    selectedWarehouseLocationOptions.value = referenceLocationOptions(exact);
    if (!selectedWarehouseLocationOptions.value.includes(form.location)) {
      form.location = selectedWarehouseLocationOptions.value.length === 1 ? selectedWarehouseLocationOptions.value[0] : '';
    }
  } catch {
    selectedWarehouseLocationOptions.value = [];
  }
}

async function loadInventoryCandidates() {
  inventoryRows.value = [];
  eligibleWarehouseOptions.value = [];
  inventoryLoaded.value = false;
  if (!usesExactInventoryAllocation.value) return;
  try {
    const [rows, warehouseResponse] = await Promise.all([
      listWarehouseInventory(),
      listReference<WarehouseReferenceRaw>('warehouses', {
        activeOnly: true,
        kind: ['补发出库', '换货出库'].includes(task.value?.kind || '') ? '销售出库' : undefined,
        company: task.value?.company || undefined,
        limit: 100,
      }),
    ]);
    inventoryRows.value = rows;
    eligibleWarehouseOptions.value = warehouseResponse.items;
    inventoryLoaded.value = true;
  } catch {
    inventoryRows.value = [];
    eligibleWarehouseOptions.value = [];
  }
}

function inventoryIdentity(row: WarehouseInventoryRow) {
  return String(row.key || [row.warehouseCode || row.warehouse, row.location, row.batch, row.materialCode || row.item].join('|'));
}

function inventoryWarehouseEligible(row: WarehouseInventoryRow) {
  return eligibleWarehouseOptions.value.some((option) => (
    (row.warehouseCode && option.code === row.warehouseCode)
    || (!row.warehouseCode && option.name === row.warehouse)
  ));
}

function purchaseReturnableQuantity(row: WarehouseInventoryRow) {
  const onHand = quantityNumber(row.onHandNumber ?? row.onHand);
  const held = quantityNumber(row.rejectedHoldNumber ?? row.rejectedHold)
    + quantityNumber(row.qcHoldNumber ?? row.qcHold)
    + quantityNumber(row.pendingInboundNumber ?? row.pendingInbound);
  const qualifiedAvailable = Math.min(
    quantityNumber(row.qualifiedOnHandNumber ?? row.qualifiedOnHand),
    quantityNumber(row.availableNumber ?? row.available),
  );
  return Math.max(0, Math.min(onHand, held + qualifiedAvailable));
}

function inventoryCapacity(row: WarehouseInventoryRow) {
  return task.value?.kind === '采购退货出库'
    ? purchaseReturnableQuantity(row)
    : quantityNumber(row.availableNumber ?? row.available);
}

function inventoryStageText(row?: WarehouseInventoryRow) {
  if (!row) return '库存已失效';
  const stages = [
    quantityNumber(row.rejectedHoldNumber ?? row.rejectedHold) > 0 ? '不合格隔离' : '',
    quantityNumber(row.qcHoldNumber ?? row.qcHold) > 0 ? '质检冻结' : '',
    quantityNumber(row.pendingInboundNumber ?? row.pendingInbound) > 0 ? '待入库' : '',
    quantityNumber(row.availableNumber ?? row.available) > 0 ? '合格可用' : '',
  ].filter(Boolean);
  return stages.join(' / ') || '无可执行库存';
}

function inventoryCandidates(product: SalesAfterSaleProduct) {
  return inventoryRows.value
    .filter((row) => (
      (product.materialCode ? row.materialCode === product.materialCode : row.item === product.name)
      && (
        task.value?.kind !== '采购退货出库'
        || !(task.value.sourceBatchKeys || []).some((key) => key.startsWith(`${product.materialCode || ''}|`))
        || (task.value.sourceBatchKeys || []).includes(`${row.materialCode || ''}|${row.batch || ''}`)
      )
      && inventoryWarehouseEligible(row)
      && inventoryCapacity(row) > 0
    ))
    .sort((left, right) => [
      left.warehouse || '',
      left.expiryDate || '9999-12-31',
      left.batch || '',
      left.location || '',
    ].join('|').localeCompare([
      right.warehouse || '',
      right.expiryDate || '9999-12-31',
      right.batch || '',
      right.location || '',
    ].join('|')));
}

function productIdentity(product: SalesAfterSaleProduct) {
  return String(product.sourceLineId || product.materialCode || product.name);
}

function initializeAllocations() {
  if (!usesExactInventoryAllocation.value || !task.value) return;
  form.allocations = taskProducts.value.flatMap((product) => {
    let remaining = quantityNumber(product.qty);
    return inventoryCandidates(product).map((row, index) => {
      const capacity = inventoryCapacity(row);
      const quantity = Math.min(remaining, capacity);
      remaining = Math.max(0, remaining - quantity);
      return {
        allocationId: `${task.value!.code}-${productIdentity(product)}-A${index + 1}`,
        sourceLineId: product.sourceLineId || '',
        materialCode: product.materialCode || '',
        inventoryKey: inventoryIdentity(row),
        warehouseCode: row.warehouseCode || '',
        warehouse: row.warehouse,
        location: row.location,
        batch: row.batch,
        qty: quantity > 0 ? String(quantity) : '',
        uom: product.uom || row.uom || '',
      };
    });
  });
}

function productAllocations(product: SalesAfterSaleProduct) {
  const identity = productIdentity(product);
  return form.allocations.filter((allocation) => (
    String(allocation.sourceLineId || allocation.materialCode) === identity
    || (!product.sourceLineId && allocation.materialCode === product.materialCode)
  ));
}

function allocationInventoryRow(allocation: AfterSalesWarehouseAllocation) {
  return inventoryRows.value.find((row) => inventoryIdentity(row) === allocation.inventoryKey);
}

function allocationCapacity(allocation: AfterSalesWarehouseAllocation) {
  const row = allocationInventoryRow(allocation);
  return row ? inventoryCapacity(row) : 0;
}

function productAllocatedQuantity(product: SalesAfterSaleProduct) {
  return productAllocations(product).reduce((sum, allocation) => sum + quantityNumber(allocation.qty), 0);
}

function initializeReceiptAllocations() {
  if (!usesReceiptBatchAllocation.value || !task.value || form.receiptAllocations.length) return;
  form.receiptAllocations = taskProducts.value.map((product, index) => ({
    allocationId: `${task.value!.code}-${productIdentity(product)}-B${index + 1}`,
    sourceLineId: product.sourceLineId || '',
    materialCode: product.materialCode || '',
    batch: 'batch' in product ? String(product.batch || '') : '',
    qty: String(quantityNumber(product.qty) || ''),
    uom: product.uom || '',
  }));
}

function productReceiptAllocations(product: SalesAfterSaleProduct) {
  const identity = productIdentity(product);
  return form.receiptAllocations.filter((allocation) => (
    String(allocation.sourceLineId || allocation.materialCode) === identity
    || (!product.sourceLineId && allocation.materialCode === product.materialCode)
  ));
}

function receiptAllocatedQuantity(product: SalesAfterSaleProduct) {
  return productReceiptAllocations(product).reduce((sum, allocation) => sum + quantityNumber(allocation.qty), 0);
}

function receiptRegisteredQuantity(product: SalesAfterSaleProduct) {
  return productReceiptAllocations(product).reduce((sum, allocation) => (
    allocation.batch.trim() ? sum + quantityNumber(allocation.qty) : sum
  ), 0);
}

function addReceiptBatch(product: SalesAfterSaleProduct) {
  if (!task.value) return;
  const rows = productReceiptAllocations(product);
  const remaining = Math.max(0, quantityNumber(product.qty) - receiptAllocatedQuantity(product));
  form.receiptAllocations.push({
    allocationId: `${task.value.code}-${productIdentity(product)}-B${rows.length + 1}-${Date.now()}`,
    sourceLineId: product.sourceLineId || '',
    materialCode: product.materialCode || '',
    batch: '',
    qty: remaining > 0 ? String(remaining) : '',
    uom: product.uom || '',
  });
}

function removeReceiptBatch(allocationId?: string) {
  const index = form.receiptAllocations.findIndex((allocation) => allocation.allocationId === allocationId);
  if (index >= 0) form.receiptAllocations.splice(index, 1);
}

function receiptProductError(product: SalesAfterSaleProduct) {
  if (!validationAttempted.value || !usesReceiptBatchAllocation.value) return '';
  const rows = productReceiptAllocations(product).filter((allocation) => quantityNumber(allocation.qty) > 0);
  if (!rows.length) return '请至少登记一个实际退回批次及数量';
  if (rows.some((allocation) => !allocation.batch.trim())) return '实际退回批次不能为空';
  if (new Set(rows.map((allocation) => allocation.batch.trim())).size !== rows.length) return '同一批次不能重复登记';
  const required = quantityNumber(product.qty);
  const received = receiptAllocatedQuantity(product);
  if (Math.abs(required - received) > 0.0001) {
    return `批次数量合计应为 ${quantityText(required, product.uom)}，当前为 ${quantityText(received, product.uom)}`;
  }
  return '';
}

function exactAllocationProductError(product: SalesAfterSaleProduct) {
  if (!validationAttempted.value || !usesExactInventoryAllocation.value) return '';
  if (!inventoryLoaded.value) return '库存读取失败，请刷新后重试';
  const required = quantityNumber(product.qty);
  const allocated = productAllocatedQuantity(product);
  if (Math.abs(required - allocated) > 0.0001) {
    return `本次分配应为 ${quantityText(required, product.uom)}，当前为 ${quantityText(allocated, product.uom)}`;
  }
  if (productAllocations(product).some((allocation) => quantityNumber(allocation.qty) > allocationCapacity(allocation) + 0.0001)) {
    return '本次数量不能超过当前可执行库存';
  }
  return '';
}

function materialResultError(product: SalesAfterSaleProduct) {
  return receiptProductError(product) || exactAllocationProductError(product);
}

function requiredOperationFieldHasError(field: 'actualDate' | 'warehouse' | 'location' | 'disposition') {
  if (!validationAttempted.value) return false;
  if (field === 'actualDate') {
    return !/^\d{4}-\d{2}-\d{2}$/.test(form.actualDate)
      || form.actualDate > today()
      || Boolean(minimumActualDate.value && form.actualDate < minimumActualDate.value);
  }
  if (field === 'warehouse') return needsWarehouse.value && !form.warehouseCode;
  if (field === 'location') {
    return needsLocation.value && (
      !selectedWarehouseLocationOptions.value.length
      || !form.location.trim()
      || !selectedWarehouseLocationOptions.value.includes(form.location)
    );
  }
  return isQualityTask.value && !form.disposition;
}

async function focusFirstRegistrationError() {
  await nextTick();
  const target = document.querySelector(
    '.after-sales-action-dialog .has-field-error input, .after-sales-action-dialog .has-field-error select, .after-sales-action-dialog .has-line-field-error input',
  ) as HTMLElement | null;
  target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target?.focus();
}

function recordProduct(
  record: AfterSalesExecutionRecord,
  allocation: Pick<AfterSalesWarehouseAllocation | AfterSalesReceiptAllocation, 'sourceLineId' | 'materialCode'>,
) {
  return record.products.find((product) => (
    allocation.sourceLineId
      ? product.sourceLineId === allocation.sourceLineId
      : product.materialCode === allocation.materialCode
  )) || record.products[0];
}

const executionRecords = computed<AfterSalesExecutionRecord[]>(() => {
  if (!task.value) return [];
  if (task.value.executionRecords?.length) return task.value.executionRecords;
  if (task.value.status !== '已完成') return [];
  return [{
    code: `${task.value.code}-R01`,
    kind: task.value.kind,
    actualDate: task.value.actualDate || String(task.value.completedAt || '').slice(0, 10),
    products: taskProducts.value,
    allocations: task.value.allocations || [],
    receiptAllocations: task.value.receiptAllocations || [],
    stockFacts: task.value.stockFacts || [],
    warehouseCode: task.value.warehouseCode,
    warehouse: task.value.warehouse,
    location: task.value.location,
    disposition: task.value.disposition,
    evidence: task.value.evidence,
    note: task.value.note,
    attachments: task.value.attachments,
    completedAt: task.value.completedAt || '',
    completedBy: task.value.completedBy || '',
  }];
});

const executionRecordLines = computed<ExecutionRecordLine[]>(() => executionRecords.value.reduce<ExecutionRecordLine[]>((lines, record) => {
  if (record.receiptAllocations?.length) {
    lines.push(...record.receiptAllocations.map((receiptAllocation, index) => ({
      key: `${record.code}-${receiptAllocation.allocationId || index}`,
      record,
      product: recordProduct(record, receiptAllocation),
      receiptAllocation,
    })));
    return lines;
  }
  if (record.allocations?.length) {
    lines.push(...record.allocations.map((allocation, index) => ({
      key: `${record.code}-${allocation.allocationId || index}`,
      record,
      product: recordProduct(record, allocation),
      allocation,
    })));
    return lines;
  }
  lines.push(...record.products.map((product, index) => ({
    key: `${record.code}-${product.sourceLineId || product.materialCode || index}`,
    record,
    product,
    stockFact: record.stockFacts?.[index],
  })));
  return lines;
}, []));

function recordLineQuantity(line: ExecutionRecordLine) {
  const quantity = line.allocation?.qty || line.receiptAllocation?.qty || line.product.qty;
  const unit = line.allocation?.uom || line.receiptAllocation?.uom || line.product.uom || '';
  return quantityText(quantityNumber(quantity), unit);
}

function recordLineBatch(line: ExecutionRecordLine) {
  const batch = line.receiptAllocation?.batch || String(line.stockFact?.batch || '');
  const actualBatch = line.allocation?.batch || batch;
  const emptyLabel = line.product.batchTracked === false ? '无需批次' : '历史批次未登记';
  return afterSalesBatchLabel(actualBatch, task.value?.code, emptyLabel);
}

function afterSalesAllocationBatchLabel(allocation: AfterSalesWarehouseAllocation, product: SalesAfterSaleProduct) {
  return afterSalesBatchLabel(
    allocation.batch,
    task.value?.code,
    product.batchTracked === false ? '无需批次' : '历史批次未登记',
  );
}

function recordResultLabel(line: ExecutionRecordLine) {
  if (line.record.disposition) return line.record.disposition;
  if (line.record.kind === '客户退货接收') return '已接收待检';
  if (/供应商.*收货/.test(line.record.kind)) return '已接收待入库';
  if (/正式入库|返修品入库处置/.test(line.record.kind)) return '已入库';
  if (['补发出库', '换货出库', '返修品出库', '退货品返还出库'].includes(line.record.kind)) return '已出库';
  if (['采购退货出库', '异常暂存退回', '不合格品退回供应商'].includes(line.record.kind)) return '已退回供应商';
  if (line.record.kind === '售后返修或返工') return '已返修待复检';
  if (line.record.kind === '销售退货检验' || line.record.kind === '返修品复检') return '检验已完成';
  return '作业已完成';
}

function recordLineWarehouse(line: ExecutionRecordLine) {
  return line.allocation?.warehouse || line.record.warehouse || String(line.stockFact?.warehouse || '') || '未登记';
}

function recordLocationDisplay(location: string | undefined) {
  const value = String(location || '').trim();
  return !value || value === '默认库位' || /-AUTO$/i.test(value) ? '历史库位未登记' : value;
}

function recordLineLocation(line: ExecutionRecordLine) {
  return recordLocationDisplay(
    line.allocation?.location || line.record.location || String(line.stockFact?.location || ''),
  );
}

function visibleRecordEvidence(record: AfterSalesExecutionRecord) {
  const evidence = String(record.evidence || '').trim();
  if (!evidence) return '';
  if ([task.value?.code, record.code].filter(Boolean).includes(evidence)) return '';
  return evidence;
}

function predecessorTaskPath(candidate: { code: string; module: string }) {
  const path = ({ 仓库: 'warehouse', 质检: 'quality', 生产: 'production' } as Record<string, string>)[candidate.module];
  return path ? `/${path}/after-sales/${encodeURIComponent(candidate.code)}` : backPath.value;
}

async function loadTask() {
  loading.value = true;
  loadError.value = '';
  try {
    const payload = await getAfterSalesExecutionTask(modulePath, code.value);
    task.value = payload.task;
    afterSale.value = payload.afterSale;
    resetFormFromTask();
    await Promise.all([loadSelectedWarehouseLocations(), loadInventoryCandidates()]);
  } catch (error) {
    task.value = null;
    afterSale.value = null;
    loadError.value = error instanceof Error ? error.message : `${moduleName}售后任务加载失败`;
  } finally {
    loading.value = false;
  }
}

async function startTask() {
  if (!canOperate.value || !task.value || acting.value) return;
  acting.value = true;
  actionError.value = '';
  actionMessage.value = '';
  try {
    await startAfterSalesExecutionTask(modulePath, task.value.code);
    actionMessage.value = `任务已开始，完成后请${executionActionLabel.value}`;
    await loadTask();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '任务开始失败';
  } finally {
    acting.value = false;
  }
}

async function openExecutionDialog() {
  if (!canComplete.value || !task.value) return;
  actionError.value = '';
  validationAttempted.value = false;
  resetFormFromTask();
  if (usesExactInventoryAllocation.value) {
    await loadInventoryCandidates();
    initializeAllocations();
  }
  initializeReceiptAllocations();
  await loadSelectedWarehouseLocations();
  executionDialogOpen.value = true;
  focusExecutionDialog();
}

function closeExecutionDialog() {
  if (acting.value) return;
  executionDialogOpen.value = false;
  restoreExecutionDialogFocus();
  validationAttempted.value = false;
  actionError.value = '';
  resetFormFromTask();
}

function handleAttachmentUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = attachmentsFromFileList(input.files);
  if (files.length) form.attachments = [...form.attachments, ...files];
  input.value = '';
}

function removeAttachment(index: number) {
  form.attachments.splice(index, 1);
}

function validateCompletion() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.actualDate)) return `请填写${actualDateLabel.value}`;
  if (form.actualDate > today()) return `${actualDateLabel.value}不能晚于今天`;
  if (minimumActualDate.value && form.actualDate < minimumActualDate.value) return `${actualDateLabel.value}不能早于任务开始日期`;
  if (needsWarehouse.value && !form.warehouseCode) return `请选择${warehouseLabel.value}`;
  if (needsLocation.value && !selectedWarehouseLocationOptions.value.length) return '所选仓库未配置可用库位，请先维护仓库资料';
  if (needsLocation.value && !form.location.trim()) return `请选择${locationLabel.value}`;
  if (needsLocation.value && !selectedWarehouseLocationOptions.value.includes(form.location)) return `${locationLabel.value}不属于所选仓库，请重新选择`;
  if (isQualityTask.value && !form.disposition) return `请选择${dispositionLabel.value}`;
  if (isQualityTask.value && !form.evidence.trim() && !form.note.trim() && !form.attachments.length) {
    return supplementRequirementMessage.value;
  }
  if (usesExactInventoryAllocation.value) {
    if (!inventoryLoaded.value) return '库存读取失败，请刷新后重试';
    for (const product of taskProducts.value) {
      const required = quantityNumber(product.qty);
      const allocated = productAllocatedQuantity(product);
      if (Math.abs(required - allocated) > 0.0001) {
        return `${product.name || product.materialCode} 需分配 ${quantityText(required, product.uom)}，当前 ${quantityText(allocated, product.uom)}`;
      }
      const invalidAllocation = productAllocations(product).find((allocation) => (
        quantityNumber(allocation.qty) > allocationCapacity(allocation) + 0.0001
      ));
      if (invalidAllocation) return `${product.name || product.materialCode} 的库存分配超过当前可执行数量`;
    }
  }
  if (usesReceiptBatchAllocation.value) {
    for (const product of taskProducts.value) {
      const rows = productReceiptAllocations(product).filter((allocation) => quantityNumber(allocation.qty) > 0);
      if (!rows.length) return `${product.name || product.materialCode} 请登记实际退回批次`;
      if (rows.some((allocation) => !allocation.batch.trim())) return `${product.name || product.materialCode} 的实际退回批次不能为空`;
      if (new Set(rows.map((allocation) => allocation.batch.trim())).size !== rows.length) {
        return `${product.name || product.materialCode} 的同一批次不能重复登记`;
      }
      const required = quantityNumber(product.qty);
      const received = receiptAllocatedQuantity(product);
      if (Math.abs(required - received) > 0.0001) {
        return `${product.name || product.materialCode} 应接收 ${quantityText(required, product.uom)}，当前批次合计 ${quantityText(received, product.uom)}`;
      }
    }
  }
  if (isProductionTask.value && !form.evidence.trim() && !form.note.trim()) return '请填写返修记录号或返修备注';
  return '';
}

async function completeTask() {
  if (!canOperate.value || !task.value || acting.value) return;
  validationAttempted.value = true;
  const validation = validateCompletion();
  if (validation) {
    actionError.value = validation;
    await focusFirstRegistrationError();
    return;
  }
  acting.value = true;
  actionError.value = '';
  actionMessage.value = '';
  try {
    await completeAfterSalesExecutionTask(modulePath, task.value.code, {
      actualDate: form.actualDate,
      warehouseCode: form.warehouseCode,
      warehouse: form.warehouse,
      location: form.location,
      disposition: form.disposition,
      evidence: form.evidence,
      note: form.note,
      attachments: form.attachments,
      allocations: form.allocations.filter((allocation) => quantityNumber(allocation.qty) > 0),
      receiptAllocations: form.receiptAllocations.filter((allocation) => quantityNumber(allocation.qty) > 0),
    });
    executionDialogOpen.value = false;
    restoreExecutionDialogFocus();
    validationAttempted.value = false;
    actionMessage.value = completionSuccessMessage.value;
    await loadTask();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '作业结果提交失败';
  } finally {
    acting.value = false;
  }
}

onMounted(loadTask);
</script>

<template>
  <div class="page-stack">
    <section v-if="task && afterSale" class="quote-editor warehouse-document-editor after-sales-editor after-sales-task-page is-detail-view">
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" :to="backPath" :aria-label="backListLabel" :title="backListLabel">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ task.code }}</strong>
        </template>

        <template #actions>
          <PinReferenceButton
            v-if="referencePath"
            class="topbar-optional-action"
            :title="`${afterSaleDocumentLabel} ${task.afterSaleCode}`"
            :subtitle="`${task.kind} · ${caseParty || '—'}`"
            :path="referencePath"
          />
          <RouterLink
            v-if="task.status === '已完成' && isWarehouseTask"
            class="secondary-action"
            :to="`/warehouse/stock-ledger?keyword=${encodeURIComponent(task.code)}`"
            title="按售后作业任务号查看库存流水"
          >
            <Boxes :size="15" />库存流水
          </RouterLink>
          <button
            v-if="canStart"
            class="primary-action"
            type="button"
            :disabled="!canOperate || acting"
            :title="canOperate ? `${startActionLabel}并认领当前任务` : readonlyReason"
            @click="startTask"
          >
            <Play :size="15" />{{ acting ? '正在开始' : startActionLabel }}
          </button>
          <button
            v-else-if="canComplete"
            class="primary-action"
            type="button"
            :disabled="!canOperate || acting"
            :title="canOperate ? `打开${task.kind}登记窗口` : readonlyReason"
            @click="openExecutionDialog"
          >
            <Check :size="15" />{{ executionActionLabel }}
          </button>
        </template>

        <template #fallback>
          <div class="quote-editor-header"><div><h1>{{ taskPageTitle }}</h1></div></div>
        </template>
      </PageTopbarPortal>

      <OperationPermissionBanner v-if="!canOperate" :message="readonlyReason" />
      <div v-if="actionError && !executionDialogOpen" class="document-message error">{{ actionError }}</div>
      <div v-if="actionMessage" class="document-message success">{{ actionMessage }}</div>

      <div class="quote-form-grid after-sales-task-layout">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading"><h2>任务概览</h2></div>
            <div class="quote-fields after-sales-overview-fields">
              <label class="form-field">
                <span>{{ taskNumberLabel }}</span>
                <output class="form-readonly-value quote-code">{{ task.code }}</output>
              </label>
              <label class="form-field">
                <span>{{ afterSaleDocumentLabel }}</span>
                <RouterLink class="form-readonly-value quote-code" :to="referencePath">{{ task.afterSaleCode }}</RouterLink>
              </label>
              <label class="form-field">
                <span>{{ sourceOrderLabel }}</span>
                <RouterLink v-if="sourceOrderPath" class="form-readonly-value quote-code" :to="sourceOrderPath">{{ task.sourceOrder }}</RouterLink>
                <output v-else class="form-readonly-value">—</output>
              </label>
              <label class="form-field">
                <span>{{ 'supplier' in afterSale ? '供应商' : '客户' }}</span>
                <output class="form-readonly-value">{{ caseParty || '—' }}</output>
              </label>
              <label class="form-field">
                <span>{{ taskKindLabel }}</span>
                <output class="form-readonly-value">{{ taskKindValue }}</output>
              </label>
              <label class="form-field">
                <span>公司</span>
                <output class="form-readonly-value">{{ task.company || afterSale.company || '—' }}</output>
              </label>
            </div>
          </section>

          <section class="form-section after-sales-material-section">
            <div class="section-heading"><h2>任务物料</h2></div>
            <div class="after-sales-material-summary-list">
              <article v-for="product in taskProducts" :key="product.sourceLineId || product.materialCode || product.name" class="after-sales-material-summary-card">
                <MaterialIdentity
                  :name="product.name"
                  :code="product.materialCode"
                  :model="product.model"
                  :spec="product.spec"
                  :image-label="afterSalesTaskMaterialVisual(product).label"
                  :image-tone="afterSalesTaskMaterialVisual(product).tone"
                />
                <div class="after-sales-material-summary-qty"><span>任务数量</span><strong>{{ productQtyWithUnit(product) }}</strong></div>
              </article>
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading"><h2>{{ recordSectionLabel }}</h2></div>
            <div v-if="executionRecordLines.length" class="receipt-record-list">
              <article class="receipt-record-card">
                <div class="receipt-record-lines">
                  <div v-for="line in executionRecordLines" :key="line.key" class="receipt-record-entry is-inbound">
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
                            :image-label="afterSalesTaskMaterialVisual(line.product).label"
                            :image-tone="afterSalesTaskMaterialVisual(line.product).tone"
                          />
                        </dd>
                      </div>
                      <div><dt>{{ executionQuantityLabel }}</dt><dd>{{ recordLineQuantity(line) }}</dd></div>
                      <div class="is-result"><dt>{{ resultFieldLabel }}</dt><dd><i class="mini-status" :class="statusPresentationClass(recordResultLabel(line))">{{ recordResultLabel(line) }}</i></dd></div>
                    </dl>
                    <dl class="receipt-record-grid receipt-record-secondary-grid is-inbound" :class="{ 'is-non-warehouse': !isWarehouseTask }">
                      <div v-if="isWarehouseTask"><dt>{{ recordWarehouseLabel }}</dt><dd>{{ recordLineWarehouse(line) }}</dd></div>
                      <div v-if="isWarehouseTask"><dt>{{ recordLocationLabel }}</dt><dd>{{ recordLineLocation(line) }}</dd></div>
                      <div v-if="isWarehouseTask"><dt>批次</dt><dd>{{ recordLineBatch(line) }}</dd></div>
                      <div><dt>{{ actualDateLabel }}</dt><dd>{{ line.record.actualDate || '历史作业日期未登记' }}</dd></div>
                      <div><dt>经办人</dt><dd>{{ line.record.completedBy || '历史经办人未登记' }}</dd></div>
                    </dl>
                  </div>
                </div>
                <dl v-for="record in executionRecords" :key="`${record.code}-supplement`" class="after-sales-record-supplement">
                  <div v-if="visibleRecordEvidence(record)"><dt>{{ evidenceLabel }}</dt><dd>{{ visibleRecordEvidence(record) }}</dd></div>
                  <div v-if="record.note"><dt>{{ noteLabel }}</dt><dd>{{ record.note }}</dd></div>
                  <div v-if="record.attachments?.length"><dt>{{ attachmentLabel }}</dt><dd>{{ record.attachments.map((file) => file.name).join('、') }}</dd></div>
                </dl>
              </article>
            </div>
            <div v-else class="list-empty-state warehouse-source-empty receipt-record-empty">
              <strong>{{ task.status === '处理中' ? `尚未提交${resultFieldLabel}` : `尚未${startActionLabel}` }}</strong>
              <span>{{ task.status === '待前置' ? `待前置任务完成后才能${startActionLabel}。` : task.status === '处理中' ? `点击“${executionActionLabel}”提交本次实际结果。` : unstartedRecordDescription }}</span>
            </div>
          </section>
        </div>

        <aside class="quote-summary-panel after-sales-task-side">
          <section class="summary-section">
            <DocumentStatusPanel
              title="当前任务状态"
              :primary-status="task.status"
              :items="taskStatusPanelItems"
              :aria-label="`${task.kind}状态与进度`"
            />
          </section>
          <section class="summary-section after-sales-context-card">
            <div class="after-sales-side-heading"><h2>{{ isProductionTask ? '返修依据' : '售后处理依据' }}</h2></div>
            <dl class="after-sales-context-facts">
              <div><dt>{{ isProductionTask ? '售后方案' : '处理方案' }}</dt><dd>{{ afterSale.action || '—' }}</dd></div>
              <div><dt>{{ isProductionTask ? '当前实物状态' : '实物安排' }}</dt><dd>{{ repairMaterialState }}</dd></div>
              <div v-if="isProductionTask"><dt>前置检验结论</dt><dd>{{ predecessorDisposition || (pendingPredecessorTasks.length ? '待检验' : '结论未登记') }}</dd></div>
              <div v-else><dt>问题类型</dt><dd>{{ afterSale.issueType || '—' }}</dd></div>
            </dl>
            <dl class="after-sales-context-description">
              <div><dt>{{ isProductionTask ? '客户问题' : '问题说明' }}</dt><dd>{{ caseIssueDescription }}</dd></div>
            </dl>
          </section>
          <section v-if="predecessorTasks.length" class="summary-section after-sales-basis-card">
            <div class="after-sales-side-heading">
              <h2>{{ isProductionTask ? '前置检验' : '前置任务' }}</h2>
              <i class="mini-status" :class="pendingPredecessorTasks.length ? 'status-pending' : 'status-done'">
                {{ pendingPredecessorTasks.length ? '仍有待完成' : '已全部完成' }}
              </i>
            </div>
            <div class="after-sales-predecessor-list">
              <RouterLink
                v-for="candidate in predecessorTasks"
                :key="candidate.code"
                :to="predecessorTaskPath(candidate)"
                :title="`打开${candidate.kind} ${candidate.code}`"
              >
                <div>
                  <strong>{{ candidate.kind }}</strong>
                  <i class="mini-status" :class="candidate.status === '已完成' ? 'status-done' : 'status-pending'">{{ candidate.status }}</i>
                </div>
                <span>{{ candidate.code }}<template v-if="candidate.actualDate"> · {{ candidate.actualDate }}</template><template v-if="candidate.completedBy"> · {{ candidate.completedBy }}</template></span>
                <small v-if="candidate.disposition || candidate.evidence">{{ candidate.disposition || '已完成' }}<template v-if="candidate.evidence"> · {{ candidate.evidence }}</template></small>
              </RouterLink>
            </div>
          </section>
        </aside>
      </div>

      <Teleport to="body">
        <div
          v-if="executionDialogOpen"
          class="receipt-action-dialog-overlay"
          role="presentation"
          tabindex="-1"
          @click.self="closeExecutionDialog"
          @keydown.esc.stop.prevent="closeExecutionDialog"
        >
          <section
            ref="executionDialogPanel"
            class="receipt-action-dialog warehouse-action-dialog after-sales-action-dialog"
            role="dialog"
            aria-modal="true"
            :aria-label="executionActionLabel"
            tabindex="-1"
            @keydown.tab="handleExecutionDialogTab"
          >
            <header class="receipt-action-dialog-header">
              <div>
                <h2>{{ executionActionLabel }}</h2>
                <p>{{ task.code }} · {{ caseParty || '—' }}</p>
              </div>
              <button class="icon-button" type="button" aria-label="关闭登记窗口" :disabled="acting" @click="closeExecutionDialog">
                <X :size="18" />
              </button>
            </header>

            <div class="receipt-action-dialog-body">
              <div v-if="actionError" class="document-message error after-sales-dialog-error" role="alert">{{ actionError }}</div>

              <section class="receipt-dialog-section warehouse-dialog-operation-section">
                <div class="receipt-dialog-section-heading"><div><h3>{{ operationSectionLabel }}</h3></div></div>
                <div class="warehouse-dialog-command-bar after-sales-command-bar" :class="{ 'is-date-only': !needsWarehouse && !isQualityTask && !isProductionTask, 'is-quality': isQualityTask, 'is-production': isProductionTask }">
                  <label class="form-field" :class="{ 'has-field-error': requiredOperationFieldHasError('actualDate') }">
                    <span class="required-label">{{ actualDateLabel }}</span>
                    <input v-model="form.actualDate" type="date" :min="minimumActualDate || undefined" :max="today()" />
                  </label>
                  <div v-if="isProductionTask" class="after-sales-production-handoff">
                    <span>提交结果</span>
                    <strong>返修完成</strong>
                    <small>全部任务数量将交由返修品复检</small>
                  </div>
                  <label v-if="needsWarehouse" class="form-field" :class="{ 'has-field-error': requiredOperationFieldHasError('warehouse') }">
                    <span class="required-label">{{ warehouseLabel }}</span>
                    <ReferencePicker
                      v-model="form.warehouseCode"
                      :display-value="form.warehouse"
                      type="warehouses"
                      :title="`选择${warehouseLabel}`"
                      :placeholder="`选择${warehouseLabel}`"
                      search-placeholder="搜索仓库编码、名称或职能"
                      :kind="warehouseKind"
                      :company="task.company || ''"
                      :clearable="true"
                      @select="handleWarehouseSelect"
                      @clear="clearWarehouseSelection"
                    />
                  </label>
                  <label v-if="needsLocation" class="form-field" :class="{ 'has-field-error': requiredOperationFieldHasError('location') }">
                    <span class="required-label">{{ locationLabel }}</span>
                    <select v-model="form.location" :disabled="!form.warehouseCode || !selectedWarehouseLocationOptions.length">
                      <option value="" disabled>{{ !form.warehouseCode ? `请先选择${warehouseLabel}` : selectedWarehouseLocationOptions.length ? `选择${locationLabel}` : '所选仓库未配置可用库位' }}</option>
                      <option v-for="option in selectedWarehouseLocationOptions" :key="option" :value="option">{{ option }}</option>
                    </select>
                  </label>
                  <label v-if="isQualityTask" class="form-field" :class="{ 'has-field-error': requiredOperationFieldHasError('disposition') }">
                    <span class="required-label">{{ dispositionLabel }}</span>
                    <select v-model="form.disposition">
                      <option value="" disabled>选择{{ dispositionLabel }}</option>
                      <option v-for="option in qualityOptions" :key="option" :value="option">{{ option }}</option>
                    </select>
                  </label>
                </div>
              </section>

              <section class="receipt-dialog-section warehouse-dialog-result-section">
                <div class="receipt-dialog-section-heading warehouse-dialog-result-heading">
                  <div class="warehouse-dialog-result-title">
                    <h3>{{ isProductionTask ? '返修物料确认' : isQualityTask ? '检验物料确认' : '本次物料结果' }}</h3>
                    <span>{{ taskProducts.length }} 种物料</span>
                  </div>
                </div>
                <div class="warehouse-dialog-material-list receipt-arrival-line-list">
                  <article
                    v-for="product in taskProducts"
                    :key="productIdentity(product)"
                    class="receipt-arrival-line-card warehouse-dialog-material-line-card after-sales-material-card is-selected"
                    :class="{ 'has-field-error': Boolean(materialResultError(product)) }"
                  >
                    <header class="receipt-arrival-line-head warehouse-dialog-material-head after-sales-material-head">
                      <div class="warehouse-dialog-material-identity">
                        <MaterialIdentity
                          :name="product.name"
                          :code="product.materialCode"
                          :model="product.model"
                          :spec="product.spec"
                          :image-label="afterSalesTaskMaterialVisual(product).label"
                          :image-tone="afterSalesTaskMaterialVisual(product).tone"
                        />
                      </div>
                      <dl class="warehouse-dialog-material-metrics" :class="{ 'is-single': !usesExactInventoryAllocation && !usesReceiptBatchAllocation && !isProductionTask }">
                        <div><dt>任务数量</dt><dd>{{ productQtyWithUnit(product) }}</dd></div>
                        <div v-if="isProductionTask" class="is-current"><dt>返修数量</dt><dd>{{ productQtyWithUnit(product) }}</dd></div>
                        <div v-if="isProductionTask"><dt>完成后状态</dt><dd>待复检</dd></div>
                        <div v-if="usesExactInventoryAllocation || usesReceiptBatchAllocation" class="is-current">
                          <dt>本次登记</dt>
                          <dd>{{ quantityText(usesReceiptBatchAllocation ? receiptRegisteredQuantity(product) : productAllocatedQuantity(product), product.uom) }}</dd>
                        </div>
                        <div v-if="usesExactInventoryAllocation || usesReceiptBatchAllocation">
                          <dt>待登记</dt>
                          <dd>{{ quantityText(Math.max(0, quantityNumber(product.qty) - (usesReceiptBatchAllocation ? receiptRegisteredQuantity(product) : productAllocatedQuantity(product))), product.uom) }}</dd>
                        </div>
                      </dl>
                    </header>
                    <div v-if="usesReceiptBatchAllocation" class="after-sales-receipt-batches warehouse-dialog-material-entry">
                      <div class="after-sales-receipt-batch-head">
                        <span>退回实物批次</span><span>本次接收数量</span><span></span>
                      </div>
                      <div
                        v-for="allocation in productReceiptAllocations(product)"
                        :key="allocation.allocationId"
                        class="after-sales-receipt-batch-row"
                        :class="{ 'has-line-field-error': validationAttempted && quantityNumber(allocation.qty) > 0 && !allocation.batch.trim() }"
                      >
                        <label class="form-field">
                          <input v-model.trim="allocation.batch" placeholder="扫描或填写退回实物批次" aria-label="退回实物批次" />
                        </label>
                        <label class="form-field">
                          <QuantityWithUnitInput
                            v-model="allocation.qty"
                            :unit="allocation.uom || product.uom"
                            placeholder="0"
                            aria-label="批次数量"
                          />
                        </label>
                        <button class="icon-button" type="button" aria-label="移除批次" @click="removeReceiptBatch(allocation.allocationId)">
                          <Trash2 :size="15" />
                        </button>
                      </div>
                      <button class="after-sales-add-batch" type="button" @click="addReceiptBatch(product)">
                        <Plus :size="14" />增加批次
                      </button>
                    </div>
                    <div v-if="usesExactInventoryAllocation" class="after-sales-allocation-list warehouse-dialog-material-entry">
                      <div v-if="productAllocations(product).length" class="after-sales-allocation-head">
                        <span>仓库 / 库位</span><span>批次 / 库存状态</span><span>当前可执行</span><span>本次数量</span>
                      </div>
                      <label v-for="allocation in productAllocations(product)" :key="allocation.allocationId || allocation.inventoryKey" class="after-sales-allocation-row">
                        <span><strong>{{ allocation.warehouse }}</strong><small>{{ recordLocationDisplay(allocation.location) }}</small></span>
                        <span><strong>{{ afterSalesAllocationBatchLabel(allocation, product) }}</strong><small>{{ inventoryStageText(allocationInventoryRow(allocation)) }}</small></span>
                        <b>{{ quantityText(allocationCapacity(allocation), allocation.uom) }}</b>
                        <input v-model="allocation.qty" type="number" min="0" :max="allocationCapacity(allocation)" step="any" :aria-label="executionQuantityLabel" />
                      </label>
                      <div v-if="!productAllocations(product).length" class="list-empty-state after-sales-allocation-empty">
                        <strong>当前没有可执行库存</strong>
                        <span>请检查仓库职能、库位批次和可用数量。</span>
                      </div>
                    </div>
                    <small v-if="materialResultError(product)" class="field-error-text after-sales-material-error">{{ materialResultError(product) }}</small>
                  </article>
                </div>
              </section>

              <section class="receipt-dialog-section warehouse-dialog-supplement-section">
                <div class="receipt-dialog-section-heading">
                  <div>
                    <h3>备注与附件</h3>
                    <small v-if="(isProductionTask || isQualityTask) && !supplementHasError" class="after-sales-supplement-hint">{{ supplementRequirementMessage }}</small>
                  </div>
                </div>
                <div class="warehouse-dialog-supplement-grid">
                  <div class="after-sales-supplement-fields">
                    <label class="form-field" :class="{ 'has-field-error': supplementHasError }">
                      <span>{{ evidenceLabel }}</span>
                      <input v-model.trim="form.evidence" :placeholder="evidencePlaceholder" />
                    </label>
                    <label class="form-field" :class="{ 'has-field-error': supplementHasError }">
                      <span>{{ noteLabel }}</span>
                      <textarea v-model.trim="form.note" class="terms-textarea" rows="4" :placeholder="notePlaceholder"></textarea>
                    </label>
                    <small v-if="supplementHasError" class="field-error-text after-sales-supplement-error">{{ supplementRequirementMessage }}</small>
                  </div>
                  <div class="receipt-dialog-attachments">
                    <div class="form-section-head">
                      <div class="summary-title">
                        <Paperclip :size="17" />
                        <h3>{{ attachmentLabel }}</h3>
                      </div>
                      <label class="secondary-action compact-action file-upload-button">
                        <Upload :size="15" />上传
                        <input type="file" multiple @change="handleAttachmentUpload" />
                      </label>
                    </div>
                    <div v-if="form.attachments.length" class="attachment-list">
                      <div v-for="(file, index) in form.attachments" :key="`${file.name}-${index}`" class="attachment-row">
                        <span class="attachment-icon"><Paperclip :size="16" /></span>
                        <div><strong>{{ file.name }}</strong><small>{{ file.size }} · {{ file.date }}</small></div>
                        <button class="icon-button" type="button" aria-label="移除附件" @click="removeAttachment(index)"><X :size="15" /></button>
                      </div>
                    </div>
                    <div v-else class="attachment-empty">
                      <Paperclip :size="17" />
                      <span>{{ attachmentPrompt }}</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <footer class="receipt-action-dialog-footer">
              <button class="secondary-action" type="button" :disabled="acting" @click="closeExecutionDialog">取消</button>
              <button class="primary-action" type="button" :disabled="acting" @click="completeTask">
                <Check :size="15" />{{ acting ? '提交中' : executionSubmitLabel }}
              </button>
            </footer>
          </section>
        </div>
      </Teleport>
    </section>

    <DocumentLoadState
      v-else
      :loading="loading"
      :title="taskPageTitle"
      :message="loadError"
      :back-path="backPath"
      :back-label="backListLabel"
      @retry="loadTask"
    />
  </div>
</template>

<style scoped>
.after-sales-task-page { min-height: 100%; }
.after-sales-task-layout { align-items: start; }
.after-sales-overview-fields { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.after-sales-task-side { position: sticky; top: 86px; }
.quote-editor.after-sales-editor .after-sales-task-side { top: 86px; }
.after-sales-material-section { gap: 12px; }
.after-sales-material-summary-list { display: grid; gap: 8px; }
.after-sales-material-summary-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: center; padding: 12px 16px; border: 1px solid var(--line-color); border-radius: 10px; background: #fbfcfa; }
.after-sales-product-identity { display: grid; gap: 4px; }
.after-sales-product-identity strong { color: var(--text-primary); font-size: 15px; }
.after-sales-product-identity span { color: var(--text-secondary); font-size: 12px; }
.after-sales-material-summary-qty { display: grid; gap: 3px; min-width: 112px; text-align: right; }
.after-sales-material-summary-qty span { color: var(--text-tertiary); font-size: 11px; }
.after-sales-material-summary-qty strong { color: var(--text-primary); font-size: 14px; }
.after-sales-basis-card,
.after-sales-context-card { align-content: start; }
.after-sales-side-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.after-sales-side-heading h2 { margin: 0; color: var(--text-primary); font-size: 14px; font-weight: 720; line-height: 1.35; }
.after-sales-context-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; overflow: hidden; border: 1px solid var(--line-color); border-radius: 9px; background: #fafbf9; }
.after-sales-context-facts > div { display: grid; align-content: start; gap: 5px; min-width: 0; padding: 10px 11px; border-left: 1px solid var(--line-color); }
.after-sales-context-facts > div:first-child { border-left: 0; }
.after-sales-context-facts dt,
.after-sales-context-description dt { color: var(--text-tertiary); font-size: 11px; line-height: 1.45; }
.after-sales-context-facts dd { margin: 0; color: var(--text-primary); font-size: 12px; font-weight: 700; line-height: 1.5; overflow-wrap: anywhere; }
.after-sales-context-description { margin: 0; }
.after-sales-context-description > div { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid #e5e8e2; border-radius: 9px; background: #fff; }
.after-sales-context-description dd { margin: 0; color: var(--text-secondary); font-size: 12px; line-height: 1.65; overflow-wrap: anywhere; }
.after-sales-predecessor-list { display: grid; gap: 7px; }
.after-sales-predecessor-list a { display: grid; gap: 2px; padding: 8px 10px; border: 1px solid var(--line-color); border-radius: 8px; color: inherit; background: #fafbf9; text-decoration: none; }
.after-sales-predecessor-list a:hover { border-color: #bac8be; background: #f5f8f5; }
.after-sales-predecessor-list a > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.after-sales-predecessor-list a strong { color: var(--text-primary); font-size: 12px; }
.after-sales-predecessor-list a span { overflow: hidden; color: var(--text-tertiary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.after-sales-predecessor-list a > small { overflow: hidden; color: var(--text-secondary); font-size: 11px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.after-sales-predecessor-list .mini-status { min-height: 21px; padding: 0 7px; font-size: 10px; }
.after-sales-record-supplement { display: grid; gap: 8px; margin: 0; padding: 12px 16px; border-top: 1px solid var(--line-color); }
.after-sales-record-supplement > div { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 10px; }
.after-sales-record-supplement dt { color: var(--text-tertiary); font-size: 12px; }
.after-sales-record-supplement dd { margin: 0; color: var(--text-secondary); font-size: 12px; line-height: 1.55; }
.receipt-record-secondary-grid.is-non-warehouse { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.after-sales-action-dialog { width: min(960px, 100%); }
.after-sales-command-bar { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.after-sales-command-bar.is-date-only { grid-template-columns: minmax(240px, 320px); }
.after-sales-command-bar.is-quality { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.after-sales-command-bar.is-production { grid-template-columns: minmax(220px, .8fr) minmax(300px, 1.2fr); }
.after-sales-production-handoff { display: grid; align-content: center; gap: 4px; min-height: 66px; padding: 10px 13px; border: 1px solid var(--line-color); border-radius: 9px; background: #f7faf7; }
.after-sales-production-handoff > span { color: var(--text-tertiary); font-size: 11px; }
.after-sales-production-handoff > strong { color: var(--text-primary); font-size: 14px; }
.after-sales-production-handoff > small { color: var(--text-secondary); font-size: 11px; line-height: 1.45; }
.after-sales-supplement-hint { display: block; margin-top: 3px; color: var(--text-tertiary); font-size: 11px; font-weight: 400; line-height: 1.45; }
.after-sales-dialog-error { margin: 0; border: 1px solid #efcdca; }
.after-sales-material-card { display: grid; gap: 0; }
.after-sales-material-card.has-field-error { border-color: #dc9e98; box-shadow: inset 3px 0 0 #c65b52; }
.after-sales-material-head { grid-template-columns: minmax(260px, 1fr) minmax(300px, .9fr); }
.after-sales-product-thumb { color: #51645b; background: #e8efeb; }
.after-sales-material-card .warehouse-dialog-material-metrics.is-single { grid-template-columns: 1fr; justify-self: end; width: min(150px, 100%); }
.after-sales-allocation-list { display: grid; overflow: hidden; border: 1px solid var(--line-color); border-radius: 10px; }
.after-sales-allocation-head,
.after-sales-allocation-row { display: grid; grid-template-columns: minmax(150px, 1.15fr) minmax(155px, 1.15fr) 112px 118px; gap: 10px; align-items: center; padding: 9px 11px; }
.after-sales-allocation-head { color: var(--text-tertiary); background: #f5f7f4; font-size: 11px; font-weight: 650; }
.after-sales-allocation-row { border-top: 1px solid var(--line-color); }
.after-sales-allocation-row > span { display: grid; gap: 2px; min-width: 0; }
.after-sales-allocation-row strong { overflow: hidden; color: var(--text-primary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.after-sales-allocation-row small { overflow: hidden; color: var(--text-tertiary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.after-sales-allocation-row b { color: var(--text-primary); font-size: 12px; }
.after-sales-allocation-row input { width: 100%; min-width: 0; }
.after-sales-allocation-empty { margin: 0; border: 0; border-radius: 0; }
.after-sales-receipt-batches { display: grid; overflow: visible; border: 0; }
.after-sales-receipt-batch-head,
.after-sales-receipt-batch-row { display: grid; grid-template-columns: minmax(220px, 1fr) 190px 36px; gap: 10px; align-items: center; }
.after-sales-receipt-batch-head { padding: 0 0 7px; color: var(--text-tertiary); background: transparent; font-size: 11px; font-weight: 650; }
.after-sales-receipt-batch-row { padding: 0; border: 0; }
.after-sales-receipt-batch-row > .form-field { display: grid; min-width: 0; gap: 0; }
.after-sales-receipt-batch-row > .form-field input { width: 100%; min-width: 0; min-height: 38px; }
.after-sales-receipt-batch-row.has-line-field-error > .form-field:first-child input { border-color: #c9635b; box-shadow: 0 0 0 2px rgb(201 99 91 / 10%); }
.after-sales-add-batch { display: inline-flex; gap: 6px; align-items: center; justify-self: start; margin: 9px 0 0; padding: 5px 8px; border: 0; color: #49695c; background: transparent; font-size: 12px; font-weight: 650; }
.after-sales-material-error { display: block; margin-top: 9px; color: #b23a32; font-size: 11px; line-height: 1.45; }
.after-sales-supplement-fields { display: grid; align-content: start; gap: 11px; }
.after-sales-supplement-error { margin-top: -3px; }
.attachment-row > .icon-button { margin-left: auto; }
.document-message { margin-bottom: 12px; padding: 10px 13px; border-radius: 8px; font-size: 13px; }
.document-message.error { color: #9f2f2f; background: #fff1f0; }
.document-message.success { color: #27653a; background: #eef8f0; }

@media (max-width: 980px) {
  .after-sales-task-side { position: static; }
  .after-sales-command-bar { grid-template-columns: 1fr; }
  .after-sales-material-head { grid-template-columns: 1fr; }
  .after-sales-material-card .warehouse-dialog-material-metrics.is-single { justify-self: stretch; width: 100%; }
}

@media (min-width: 1101px) {
  .after-sales-task-side .after-sales-context-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .after-sales-task-side .after-sales-context-facts > div:nth-child(3) { grid-column: 1 / -1; border-top: 1px solid var(--line-color); border-left: 0; }
}

@media (max-width: 760px) {
  .after-sales-overview-fields,
  .after-sales-material-summary-card { grid-template-columns: 1fr; }
  .after-sales-context-facts { grid-template-columns: 1fr; }
  .after-sales-context-facts > div { border-top: 1px solid var(--line-color); border-left: 0; }
  .after-sales-context-facts > div:first-child { border-top: 0; }
  .after-sales-material-summary-qty { text-align: left; }
  .after-sales-receipt-batch-head { display: none; }
  .after-sales-receipt-batch-row { grid-template-columns: minmax(0, 1fr) 120px 36px; }
  .after-sales-allocation-head { display: none; }
  .after-sales-allocation-row { grid-template-columns: 1fr 1fr; }
}
</style>
