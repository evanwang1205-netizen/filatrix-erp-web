<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus } from 'lucide-vue-next';

import BusinessListToolbar from '../components/BusinessListToolbar.vue';
import ListLoadState from '../components/ListLoadState.vue';
import ListStatusOverview from '../components/ListStatusOverview.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import { useDialogFocus } from '../composables/useDialogFocus';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import {
  listPurchaseReceipts,
  listAfterSalesExecutionTasks,
  listProductionMaterialIssues,
  listProductionReceipts,
  listProductionReturns,
  listSalesIssues,
  listStockLedger,
  listWarehouseInventory,
  listWarehouseReplenishments,
  listWarehouseOtherMoves,
  listWarehouseStocktakes,
  listWarehouseTransfers,
  startWarehouseReplenishment,
} from '../services/api';
import type {
  AfterSalesExecutionTask,
  InventoryOccupationSource,
  PurchaseReceipt,
  SalesIssue,
  StockLedgerRow,
  WarehouseInventoryRow,
  WarehouseReplenishmentSignal,
  WarehouseOtherMove,
  WarehouseProductionIssue,
  WarehouseProductionReturn,
  WarehouseProductionReceipt,
  WarehouseStocktake,
  WarehouseTransfer,
} from '../types/business';
import { masterDataRows } from '../data/masterData';
import { type WarehouseProduct, type WarehouseTabKey } from '../data/warehouse';
import {
  purchaseReceiptInboundStateLabel,
  purchaseReceiptQualityStateLabel,
} from '../utils/purchaseReceiptState';
import { afterSalesBatchLabel } from '../utils/afterSalesBatch';
import { productIdentity, productQtyWithUnit } from '../utils/productDisplay';
import { statusPresentationClass } from '../utils/statusPresentation';

const route = useRoute();
const router = useRouter();
const { canWrite: canWriteWarehouse, readonlyReason: warehouseReadonlyReason } = useModulePermission('warehouse');
const { canOperate: canPostWarehouse, readonlyReason: warehousePostReadonlyReason } = useOperationPermission(
  'warehousePost',
  '执行仓库动作',
);
const { canOperate: canStartReplenishment, readonlyReason: warehouseReplenishReadonlyReason } = useOperationPermission(
  'warehouseReplenish',
  '发起库存补货',
);
const warehouseOperationPermissionHint = computed(() => (!canPostWarehouse.value ? warehousePostReadonlyReason.value : ''));
const warehouseOperationPermissionSuffix = '新建、提交、确认库存、作废和异常处理会保持不可用。';

type ActiveWarehouseTabKey = WarehouseTabKey;
type OperationPageKey = Exclude<ActiveWarehouseTabKey, 'inventory' | 'inventoryAlerts' | 'stockLedger'>;
type ToolbarMenuKey = 'sort' | 'filter' | 'export';
type SortMode = 'newest' | 'oldest' | 'amountDesc' | 'status';
type FilterFieldKey = 'status' | 'party' | 'owner';
type ProductionMove = WarehouseOtherMove & {
  materialIssue?: string;
  releaseBatch?: string;
  executionCard?: string;
  revision?: number;
  submittedAt?: string;
  postedAt?: string;
};

type BusinessFilters = {
  status: string;
  party: string;
  owner: string;
  dateStart: string;
  dateEnd: string;
};

type WarehouseFilterOption = string | { value: string; label: string };

type WarehouseFilterField = {
  key: FilterFieldKey;
  label: string;
  options: WarehouseFilterOption[];
};

type WarehouseInventoryViewMode = 'item' | 'location' | 'batch';
type WarehouseInventoryTaskView = 'overview' | 'receiving' | 'shipping' | 'batch';
type WarehouseInventoryAlertTab = 'replenishment' | 'controlled' | 'expiry' | 'anomaly';
type InventoryAvailabilityStatus = '数据异常' | '无可用库存' | '待转可用' | '全部占用' | '部分可用' | '可用';

type WarehouseInventorySourceRow = WarehouseInventoryRow;
type WarehouseInventoryWarehouseSummary = {
  warehouse: string;
  locations: string[];
  batchCount: number;
  onHand: string;
  available: string;
  qualifiedOnHand: string;
  reserved: string;
  allocated: string;
  frozen: string;
  locked: string;
  qcHold: string;
  pendingInbound: string;
  rejectedHold: string;
  exceptionHold: string;
  inTransit: string;
  inboundPlan: string;
  outboundPlan: string;
  status: InventoryAvailabilityStatus;
};

type WarehouseInventoryDetailRow = {
  key: string;
  materialCode: string;
  item: string;
  itemType: string;
  batch: string;
  warehouse: string;
  location: string;
  onHand: string;
  available: string;
  qualifiedOnHand: string;
  reserved: string;
  allocated: string;
  frozen: string;
  locked: string;
  qcHold: string;
  pendingInbound: string;
  rejectedHold: string;
  exceptionHold: string;
  inTransit: string;
  inboundPlan: string;
  outboundPlan: string;
  sourceDoc: string;
  qcStatus: string;
  batchDate: string;
  expiryDate: string;
  status: InventoryAvailabilityStatus;
  updatedAt: string;
  lastMovement: string;
  lockedSources: string[];
  occupationSources: InventoryOccupationSource[];
};

type WarehouseInventoryGroup = {
  key: string;
  mode: WarehouseInventoryViewMode;
  title: string;
  subtitle: string;
  subjectLabel: string;
  distributionTitle: string;
  distributionHint: string;
  detailTitle: string;
  detailHint: string;
  item: string;
  materialCode: string;
  itemType: string;
  scopeWarehouse: string;
  scopeLocation: string;
  scopeBatch: string;
  onHand: string;
  available: string;
  qualifiedOnHand: string;
  reserved: string;
  allocated: string;
  frozen: string;
  locked: string;
  qcHold: string;
  pendingInbound: string;
  rejectedHold: string;
  exceptionHold: string;
  inTransit: string;
  inboundPlan: string;
  outboundPlan: string;
  status: InventoryAvailabilityStatus;
  updatedAt: string;
  lastMovement: string;
  itemCount: number;
  warehouseCount: number;
  batchCount: number;
  locationCount: number;
  attentionCount: number;
  availabilitySummary: string;
  controlSummary: string;
  controlDetail: string;
  sourceSummary: string;
  batchDate: string;
  expiryDate: string;
  qcStatus: string;
  originSource: string;
  originPath: string;
  movementCount: number;
  warehouseSummaries: WarehouseInventoryWarehouseSummary[];
  detailRows: WarehouseInventoryDetailRow[];
  lockedSources: string[];
  occupationSources: InventoryOccupationSource[];
  searchValues: unknown[];
};

type WarehouseInventoryOperationalAlert = {
  key: string;
  category: Exclude<WarehouseInventoryAlertTab, 'replenishment'>;
  status: string;
  item: string;
  materialCode: string;
  warehouse: string;
  location: string;
  batch: string;
  quantity: string;
  quantityLabel: string;
  reason: string;
  updatedAt: string;
  searchValues: unknown[];
};

type OperationRow = {
  page: OperationPageKey;
  code: string;
  operationKind?: string;
  partyTitle: string;
  partySubtitle: string;
  partyFilter: string;
  itemTitle: string;
  itemSubtitle: string;
  itemQuantity?: string;
  warehouseTitle: string;
  warehouseSubtitle: string;
  warehouseContext?: string;
  date: string;
  dateContext?: string;
  dateAttention?: string;
  dateAttentionTone?: 'warning' | 'danger';
  status: string;
  statusSortKey?: string;
  rawStatus?: string;
  lifecycleStatus?: string;
  statusDetail?: string;
  operationStage?: string;
  approvalStage?: string;
  postingStage?: string;
  qualityProgress?: string;
  inboundProgress?: string;
  nextStep?: string;
  reversalCode?: string;
  owner: string;
  ownerFilter: string;
  attachmentCount: number;
  amountValue: number;
  cardValue: string;
  searchValues: unknown[];
};

const pageTitles: Record<ActiveWarehouseTabKey, string> = {
  purchaseReceipts: '采购入库',
  salesIssues: '销售出库',
  productionIssues: '生产领料',
  productionReturns: '生产退料',
  productionReceipts: '完工入库',
  afterSalesTasks: '售后作业',
  otherMoves: '其他出入库',
  transfers: '库存调拨',
  stocktakes: '库存盘点',
  inventory: '库存查询',
  inventoryAlerts: '库存预警',
  stockLedger: '库存流水',
};

const createButtonLabels: Partial<Record<ActiveWarehouseTabKey, string>> = {
  productionReturns: '新建',
  otherMoves: '登记出入库',
  transfers: '新建调拨',
  stocktakes: '新建盘点',
};

const searchPlaceholders: Record<ActiveWarehouseTabKey, string> = {
  purchaseReceipts: '搜索任务号、采购订单、供应商、物料',
  salesIssues: '搜索任务号、销售订单、客户、物料',
  productionIssues: '搜索领料单、工单、物料、仓库',
  productionReturns: '搜索退料单、工单、物料、仓库',
  productionReceipts: '搜索入库单、工单、成品、仓库',
  afterSalesTasks: '搜索任务号、售后单、来源订单、客户/供应商、物料',
  otherMoves: '搜索单据号、业务类型、原因、物料、仓库或库位',
  transfers: '搜索调拨单、仓库、物料、批次',
  stocktakes: '搜索盘点单、仓库、范围、负责人',
  inventory: '搜索物料、成品、批次、仓库、库位',
  inventoryAlerts: '搜索物料、仓库、批次、预警原因或关联单据',
  stockLedger: '搜索业务类型、物料/编码、批次、仓库/库位、来源或经办人',
};

const routePageMap: Record<string, ActiveWarehouseTabKey> = {
  'purchase-receipts': 'purchaseReceipts',
  'sales-issues': 'salesIssues',
  'production-issues': 'productionIssues',
  'production-returns': 'productionReturns',
  'production-receipts': 'productionReceipts',
  'after-sales': 'afterSalesTasks',
  'other-moves': 'otherMoves',
  transfers: 'transfers',
  stocktakes: 'stocktakes',
  inventory: 'inventory',
  'inventory-alerts': 'inventoryAlerts',
  'stock-ledger': 'stockLedger',
};

const pageRouteMap: Record<OperationPageKey, string> = {
  purchaseReceipts: 'purchase-receipts',
  salesIssues: 'sales-issues',
  productionIssues: 'production-issues',
  productionReturns: 'production-returns',
  productionReceipts: 'production-receipts',
  afterSalesTasks: 'after-sales',
  otherMoves: 'other-moves',
  transfers: 'transfers',
  stocktakes: 'stocktakes',
};

const operationHeaders: Record<
  OperationPageKey,
  { code: string; party: string; item: string; warehouse: string; date: string; status: string; owner: string }
> = {
  purchaseReceipts: {
    code: '采购入库任务号',
    party: '供应商 / 来源单',
    item: '物料 / 当前任务数量',
    warehouse: '暂存位置',
    date: '到货日期',
    status: '状态',
    owner: '到货登记人',
  },
  salesIssues: {
    code: '销售出库任务号',
    party: '客户 / 销售订单',
    item: '物料 / 当前任务数量',
    warehouse: '出库仓 / 交付方式',
    date: '出库日期',
    status: '状态',
    owner: '经办人',
  },
  productionIssues: {
    code: '领料单号',
    party: '来源工单',
    item: '领料物料',
    warehouse: '出库仓库',
    date: '领料日期',
    status: '状态',
    owner: '经办人',
  },
  productionReturns: {
    code: '退料单号',
    party: '来源工单',
    item: '退回物料',
    warehouse: '入库仓库',
    date: '退料日期',
    status: '状态',
    owner: '经办人',
  },
  productionReceipts: {
    code: '入库单号',
    party: '来源工单',
    item: '完工成品',
    warehouse: '入库仓库',
    date: '完工日期',
    status: '状态',
    owner: '经办人',
  },
  afterSalesTasks: {
    code: '售后作业任务号',
    party: '客户/供应商 / 来源单',
    item: '物料 / 当前任务数量',
    warehouse: '作业类型 / 实际位置',
    date: '作业日期',
    status: '状态',
    owner: '经办人',
  },
  otherMoves: {
    code: '其他出入库单号',
    party: '业务类型 / 原因',
    item: '物料 / 数量',
    warehouse: '仓库 / 库位 / 流向',
    date: '业务日期',
    status: '状态',
    owner: '经办人',
  },
  transfers: {
    code: '调拨单号',
    party: '调拨原因',
    item: '物料 / 数量',
    warehouse: '调拨路径 / 目标库位',
    date: '调拨日期',
    status: '状态',
    owner: '经办人',
  },
  stocktakes: {
    code: '盘点单号',
    party: '盘点范围',
    item: '盘点进度',
    warehouse: '仓库',
    date: '盘点日期',
    status: '状态',
    owner: '负责人',
  },
};

const operationPages: OperationPageKey[] = [
  'purchaseReceipts',
  'salesIssues',
  'productionIssues',
  'productionReturns',
  'productionReceipts',
  'afterSalesTasks',
  'otherMoves',
  'transfers',
  'stocktakes',
];

function emptyBusinessFilters(): BusinessFilters {
  return {
    status: '',
    party: '',
    owner: '',
    dateStart: '',
    dateEnd: '',
  };
}

function cloneBusinessFilters(filters: BusinessFilters): BusinessFilters {
  return { ...filters };
}

const activePage = computed<ActiveWarehouseTabKey>(() => {
  const page = route.params.page?.toString();
  return page && routePageMap[page] ? routePageMap[page] : 'purchaseReceipts';
});

const activeOperationPage = computed<OperationPageKey | null>(() =>
  operationPages.includes(activePage.value as OperationPageKey) ? (activePage.value as OperationPageKey) : null,
);
const isProductionOperationPage = computed(() =>
  ['productionIssues', 'productionReturns', 'productionReceipts'].includes(activePage.value),
);
const showWarehouseOperationPermissionHint = computed(() => Boolean(activeOperationPage.value && warehouseOperationPermissionHint.value));
const pageTitle = computed(() => pageTitles[activePage.value]);
const createButtonLabel = computed(() => createButtonLabels[activePage.value] ?? '');
const createButtonPath = computed(() => {
  if (!activeOperationPage.value || !createButtonLabel.value) return '';
  return `/warehouse/${pageRouteMap[activeOperationPage.value]}/new`;
});
const searchPlaceholder = computed(() => searchPlaceholders[activePage.value]);
const currentOperationHeaders = computed(() =>
  activeOperationPage.value ? operationHeaders[activeOperationPage.value] : operationHeaders.purchaseReceipts,
);

function operationRowPath(row: OperationRow) {
  return `/warehouse/${pageRouteMap[row.page]}/${encodeURIComponent(row.code)}`;
}

function routeKeywordValue() {
  const keyword = route.query.keyword;
  if (Array.isArray(keyword)) return keyword[0]?.toString() ?? '';
  return keyword?.toString() ?? '';
}

const searchKeyword = ref(routeKeywordValue());
const openToolbarMenu = ref<ToolbarMenuKey | null>(null);
const sortMode = ref<SortMode>(activeOperationPage.value || ['inventory', 'inventoryAlerts'].includes(activePage.value) ? 'status' : 'newest');
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const hoveredOperationCode = ref('');
const apiPurchaseReceiptRows = ref<PurchaseReceipt[] | null>(null);
const apiSalesIssueRows = ref<SalesIssue[] | null>(null);
const apiOtherMoveRows = ref<WarehouseOtherMove[] | null>(null);
const apiProductionIssueRows = ref<WarehouseProductionIssue[] | null>(null);
const apiProductionReturnRows = ref<WarehouseProductionReturn[] | null>(null);
const apiProductionReceiptRows = ref<WarehouseProductionReceipt[] | null>(null);
const apiAfterSalesTaskRows = ref<AfterSalesExecutionTask[] | null>(null);
const apiTransferRows = ref<WarehouseTransfer[] | null>(null);
const apiStocktakeRows = ref<WarehouseStocktake[] | null>(null);
const apiInventoryRows = ref<WarehouseInventorySourceRow[] | null>(null);
const apiReplenishmentRows = ref<WarehouseReplenishmentSignal[] | null>(null);
const apiStockLedgerRows = ref<StockLedgerRow[] | null>(null);
const isListLoading = ref(false);
const listLoadError = ref('');
const selectedInventoryKey = ref('');
const startingReplenishmentCode = ref('');
const inventoryCompactDetailOpen = ref(false);
const inventoryTableScrollRef = ref<HTMLElement | null>(null);
const inventoryDetailPaneRef = ref<HTMLElement | null>(null);
const inventoryDetailScrollRef = ref<HTMLElement | null>(null);
const stockLedgerPage = ref(1);
const stockLedgerPageSize = 30;
const {
  focusDialog: focusInventoryDetail,
  restoreDialogFocus: restoreInventoryDetailFocus,
  handleDialogTab: handleInventoryDetailTab,
} = useDialogFocus(inventoryDetailPaneRef);
let toastTimer: number | undefined;
let inventoryKeywordTimer: number | undefined;
let listLoadRequestId = 0;

function routeInventoryViewMode(): WarehouseInventoryViewMode {
  const task = Array.isArray(route.query.task) ? route.query.task[0] : route.query.task;
  if (task === 'batch') return 'batch';
  const view = route.query.view;
  const value = Array.isArray(view) ? view[0] : view;
  return value === 'location' || value === 'batch' ? value : 'item';
}

const inventoryViewMode = ref<WarehouseInventoryViewMode>(routeInventoryViewMode());

function routeInventoryTaskView(): WarehouseInventoryTaskView {
  const task = route.query.task;
  const value = Array.isArray(task) ? task[0] : task;
  return value === 'receiving' || value === 'shipping' || value === 'batch' ? value : 'overview';
}

function routeInventoryAlertTab(): WarehouseInventoryAlertTab {
  const tab = route.query.tab;
  const value = Array.isArray(tab) ? tab[0] : tab;
  return value === 'controlled' || value === 'expiry' || value === 'anomaly' ? value : 'replenishment';
}

const inventoryTaskView = ref<WarehouseInventoryTaskView>(routeInventoryTaskView());
const inventoryAlertTab = ref<WarehouseInventoryAlertTab>(routeInventoryAlertTab());

const inventoryViewOptions: Array<{ key: WarehouseInventoryViewMode; label: string; hint: string }> = [
  { key: 'item', label: '物料', hint: '汇总同一物料的库存和分布' },
  { key: 'location', label: '库位', hint: '汇总同一仓库库位的库存' },
  { key: 'batch', label: '批次', hint: '汇总同一物料批次的库存' },
];

const inventoryTaskViewOptions: Array<{ key: WarehouseInventoryTaskView; label: string; hint: string }> = [
  { key: 'overview', label: '库存余额', hint: '比较物理在库、合格在库、占用和可用库存' },
  { key: 'receiving', label: '收货质检', hint: '只看存在调拨在途、待检、待正式入库、隔离或异常暂存的库存' },
  { key: 'shipping', label: '发货可用', hint: '比较合格库存、销售预留、生产分配、冻结、待出库计划和可用库存' },
  { key: 'batch', label: '批次效期', hint: '按批次查看入账日期、效期和质量状态' },
];

const inventoryAlertTabOptions: Array<{ key: WarehouseInventoryAlertTab; label: string }> = [
  { key: 'replenishment', label: '补货建议' },
  { key: 'controlled', label: '待处理库存' },
  { key: 'expiry', label: '效期风险' },
  { key: 'anomaly', label: '数据异常' },
];

const filtersByPage = ref<Record<ActiveWarehouseTabKey, BusinessFilters>>({
  purchaseReceipts: emptyBusinessFilters(),
  salesIssues: emptyBusinessFilters(),
  productionIssues: emptyBusinessFilters(),
  productionReturns: emptyBusinessFilters(),
  productionReceipts: emptyBusinessFilters(),
  afterSalesTasks: emptyBusinessFilters(),
  otherMoves: emptyBusinessFilters(),
  transfers: emptyBusinessFilters(),
  stocktakes: emptyBusinessFilters(),
  inventory: emptyBusinessFilters(),
  inventoryAlerts: emptyBusinessFilters(),
  stockLedger: emptyBusinessFilters(),
});
const draftFilters = ref<BusinessFilters>(emptyBusinessFilters());

const currentFilters = computed(() => filtersByPage.value[activePage.value]);
const filterStatus = computed(() => currentFilters.value.status);
const filterParty = computed(() => currentFilters.value.party);
const filterOwner = computed(() => currentFilters.value.owner);
const filterDateStart = computed(() => currentFilters.value.dateStart);
const filterDateEnd = computed(() => currentFilters.value.dateEnd);

const draftFilterStatus = computed({
  get: () => draftFilters.value.status,
  set: (value: string) => updateDraftFilters({ status: value }),
});
const draftFilterParty = computed({
  get: () => draftFilters.value.party,
  set: (value: string) => updateDraftFilters({ party: value }),
});
const draftFilterOwner = computed({
  get: () => draftFilters.value.owner,
  set: (value: string) => updateDraftFilters({ owner: value }),
});
const draftFilterDateStart = computed({
  get: () => draftFilters.value.dateStart,
  set: (value: string) => updateDraftFilters({ dateStart: value }),
});
const draftFilterDateEnd = computed({
  get: () => draftFilters.value.dateEnd,
  set: (value: string) => updateDraftFilters({ dateEnd: value }),
});

const sortAmountLabel = computed(() => {
  if (activePage.value === 'inventory') {
    return inventoryViewMode.value === 'location' ? '物料种数从高到低' : '可用数量从高到低';
  }
  if (activePage.value === 'inventoryAlerts') {
    return '补货缺口比例从高到低';
  }
  if (activePage.value === 'stocktakes') return '差异项数从多到少';
  if (activePage.value === 'transfers') return '明细项数从多到少';
  return '数量从高到低';
});
const statusSortLabel = computed(() => {
  if (activePage.value === 'inventory') return '受控与可用性优先';
  if (activePage.value === 'inventoryAlerts') {
    if (inventoryAlertTab.value === 'replenishment') return '补货紧迫度优先';
    if (inventoryAlertTab.value === 'controlled') return '受控风险优先';
    if (inventoryAlertTab.value === 'expiry') return '到期风险优先';
  }
  return '';
});
const showStatusSort = computed(() => {
  if (activePage.value === 'stockLedger') return false;
  return !(activePage.value === 'inventoryAlerts' && inventoryAlertTab.value === 'anomaly');
});
const showInventoryAlertAmountSort = computed(() => inventoryAlertTab.value === 'replenishment');

const filterLabels = computed(() => {
  const options: Record<
    ActiveWarehouseTabKey,
    {
      status?: string;
      party?: string;
      owner?: string;
      date?: string;
    }
  > = {
    purchaseReceipts: {
      status: '任务状态',
      party: '供应商',
      owner: '到货登记人',
      date: '预计 / 实际到货日期',
    },
    salesIssues: {
      status: '任务状态',
      party: '客户',
      owner: '经办人',
      date: '出库日期',
    },
    productionIssues: {
      status: '状态',
      party: '来源工单',
      owner: '经办人',
      date: '领料日期',
    },
    productionReturns: {
      status: '状态',
      party: '来源工单',
      owner: '经办人',
      date: '退料日期',
    },
    productionReceipts: {
      status: '状态',
      party: '来源工单',
      owner: '经办人',
      date: '完工日期',
    },
    afterSalesTasks: {
      status: '任务状态',
      party: '客户 / 供应商',
      owner: '经办人',
      date: '生成 / 开始 / 实际日期',
    },
    otherMoves: {
      status: '状态',
      party: '类型',
      owner: '经办人',
      date: '业务日期',
    },
    transfers: {
      status: '状态',
      party: '调入仓库',
      owner: '经办人',
      date: '调拨日期',
    },
    stocktakes: {
      status: '盘点状态',
      party: '仓库',
      owner: '负责人',
      date: '盘点日期',
    },
    inventory: {
      status: '库存可用性',
      party: '物料/成品',
      date: '最近库存变动',
    },
    inventoryAlerts: {
      status: '预警状态',
      party: '物料/成品',
      date: '最近更新',
    },
    stockLedger: {
      status: '业务类型',
      party: '物料/成品',
      owner: '经办人',
      date: '发生时间',
    },
  };

  return options[activePage.value];
});

const filterDateLabel = computed(() => filterLabels.value.date ?? '');
const statusFilterSeparator = '|';

const activeFilterCount = computed(() => {
  const labels = filterLabels.value;
  const filters = currentFilters.value;

  return [
    labels.status ? filters.status : '',
    labels.party ? filters.party : '',
    labels.owner ? filters.owner : '',
    labels.date ? filters.dateStart : '',
    labels.date ? filters.dateEnd : '',
  ].filter(Boolean).length;
});

const hasListConstraints = computed(() => Boolean(normalized(searchKeyword.value)) || activeFilterCount.value > 0);

const operationEmptyTitle = computed(() => (hasListConstraints.value ? `未找到匹配${pageTitle.value}` : `暂无${pageTitle.value}`));
const operationEmptyDescription = computed(() => {
  if (hasListConstraints.value) return '可以调整搜索、排序或筛选条件后再查看。';
  if (activePage.value === 'purchaseReceipts') return '采购订单确认后，系统会自动在这里生成待到货的采购入库任务。';
  if (activePage.value === 'afterSalesTasks') return '售后处理方案确认并需要仓库执行时，系统会自动在这里生成售后作业任务。';
  if (activePage.value === 'otherMoves') return '样品、领用、报废、借用归还或受控库存调整等例外业务，可在这里登记并依次完成审核和库存过账。';
  if (activePage.value === 'productionIssues') return '生产安排确认后生成领料任务，由仓库在这里接收和处理。';
  if (activePage.value === 'productionReturns') return '生产执行产生退料后，由仓库在这里接收和处理。';
  if (activePage.value === 'productionReceipts') return '质检放行完工数量后生成入库任务，由仓库在这里确认。';
  if (createButtonPath.value) return `新建${pageTitle.value}后会显示在这里。`;
  return '等待仓库同步业务数据后会显示在这里。';
});

const inventoryEmptyTitle = computed(() => {
  if (hasListConstraints.value) return '未找到匹配库存记录';
  if (inventoryTaskView.value === 'receiving') return '暂无收货质检相关库存';
  if (inventoryTaskView.value === 'shipping') return '暂无发货可用相关库存';
  if (inventoryTaskView.value === 'batch') return '暂无批次库存';
  return '暂无库存记录';
});
const inventoryEmptyDescription = computed(() => {
  if (hasListConstraints.value) return '可以调整搜索或筛选条件后再查看。';
  if (inventoryTaskView.value === 'receiving') return '当前没有调拨在途、待检、待正式入库、隔离或异常暂存库存。';
  if (inventoryTaskView.value === 'shipping') return '当前没有合格在库、已占用或待出库计划库存。';
  if (inventoryTaskView.value === 'batch') return '仓库形成批次库存后会显示在这里；未登记批次号的库存会单独标识。';
  return '仓库同步库存数据后会显示在这里。';
});

const inventoryAlertEmptyTitle = computed(() => {
  if (hasListConstraints.value) return `未找到匹配${inventoryAlertTabOptions.find((option) => option.key === inventoryAlertTab.value)?.label || '库存预警'}`;
  if (inventoryAlertTab.value === 'replenishment') return '当前没有补货建议';
  return '当前没有此类库存预警';
});
const inventoryAlertEmptyDescription = computed(() => {
  if (hasListConstraints.value) return '可以调整搜索或筛选条件后再查看。';
  if (inventoryAlertTab.value === 'replenishment') return '预计可用高于补货点的物料不会进入补货待办。';
  return '这里只显示需要处理或核对的库存，不重复展示正常库存。';
});

const stockLedgerEmptyTitle = computed(() => (hasListConstraints.value ? '未找到匹配库存流水' : '暂无库存流水'));
const stockLedgerEmptyDescription = computed(() =>
  hasListConstraints.value ? '可以调整搜索或筛选条件后再查看。' : '出入库、调拨、盘点等单据确认后会显示在这里。',
);

function updateCurrentFilters(filters: BusinessFilters) {
  filtersByPage.value = {
    ...filtersByPage.value,
    [activePage.value]: cloneBusinessFilters(filters),
  };
}

function syncDraftFilters() {
  draftFilters.value = cloneBusinessFilters(currentFilters.value);
}

function updateDraftFilters(patch: Partial<BusinessFilters>) {
  draftFilters.value = {
    ...draftFilters.value,
    ...patch,
  };
}

function normalized(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function includesKeyword(values: unknown[]) {
  const keyword = normalized(searchKeyword.value);
  if (!keyword) return true;
  return values.some((value) => normalized(value).includes(keyword));
}

function statusFilterValues(value: string) {
  return value.split(statusFilterSeparator).filter(Boolean);
}

function matchesStatusFilter(value: string) {
  const values = statusFilterValues(filterStatus.value);
  return !values.length || values.includes(value);
}

function matchesFilterValue(value: string | undefined, filter: string) {
  return !filter || value === filter;
}

function parseQty(value?: string) {
  return Number(String(value || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] ?? 0);
}

function hasPositiveQty(value?: string) {
  return String(value || '')
    .split('/')
    .some((part) => parseQty(part) > 0);
}

function inventoryTaskQty(value: string) {
  const hasNonZeroValue = String(value || '')
    .split('/')
    .some((part) => Math.abs(parseQty(part)) > 0.0001);
  return hasNonZeroValue ? value : '—';
}

function qtyUnit(value?: string) {
  return String(value || '').replace(/[\d,.\s]/g, '') || '件';
}

function formatQty(value: number, unit: string) {
  return `${value.toLocaleString('zh-CN')} ${unit}`;
}

type InventoryQtyField =
  | 'onHand'
  | 'qualifiedOnHand'
  | 'available'
  | 'reserved'
  | 'allocated'
  | 'frozen'
  | 'locked'
  | 'qcHold'
  | 'pendingInbound'
  | 'rejectedHold'
  | 'exceptionHold'
  | 'inTransit'
  | 'inboundPlan'
  | 'outboundPlan';

function inventoryQtyTotal(rows: WarehouseInventorySourceRow[], field: InventoryQtyField) {
  if (!rows.length) return '0 件';
  const totalsByUnit = new Map<string, number>();
  rows.forEach((row) => {
    const unit = row.uom || qtyUnit(row[field]) || '件';
    totalsByUnit.set(unit, (totalsByUnit.get(unit) ?? 0) + parseQty(row[field]));
  });
  const totals = [...totalsByUnit.entries()];
  const nonZeroTotals = totals.filter(([, value]) => Math.abs(value) > 0.0001);
  if (nonZeroTotals.length) return nonZeroTotals.map(([unit, value]) => formatQty(value, unit)).join(' / ');
  if (totals.length === 1) return formatQty(0, totals[0][0]);
  return '—';
}

function inventoryViewLabel(mode: WarehouseInventoryViewMode) {
  return inventoryViewOptions.find((option) => option.key === mode)?.label ?? '物料视角';
}

function inventoryLockedSources(row: WarehouseInventorySourceRow) {
  return 'lockedSources' in row ? (row.lockedSources ?? []) : [];
}

function inventoryOccupationSources(row: WarehouseInventorySourceRow) {
  return [
    ...(row.reservationSources ?? []),
    ...(row.allocationSources ?? []),
    ...(row.freezeSources ?? []),
    ...(row.transitSources ?? []),
  ].filter((source) => Number(source.quantityNumber ?? parseQty(source.qty)) > 0.0001);
}

function aggregateInventoryOccupationSources(rows: WarehouseInventorySourceRow[]) {
  const sources = new Map<string, InventoryOccupationSource & { unit: string; total: number }>();
  rows.flatMap(inventoryOccupationSources).forEach((source) => {
    const key = [source.type, source.sourceDoc, source.status, source.path].join('::');
    const quantity = Number(source.quantityNumber ?? parseQty(source.qty));
    const unit = qtyUnit(source.qty);
    const existing = sources.get(key);
    if (existing) {
      existing.total += quantity;
      existing.quantityNumber = existing.total;
      existing.qty = formatQty(existing.total, existing.unit || unit);
      return;
    }
    sources.set(key, {
      ...source,
      unit,
      total: quantity,
      quantityNumber: quantity,
      qty: formatQty(quantity, unit),
    });
  });
  return [...sources.values()].map(({ unit: _unit, total: _total, ...source }) => source);
}

function occupationSourceText(source: InventoryOccupationSource) {
  return `${source.type} · ${source.sourceDoc} · ${source.qty} · ${source.status}`;
}

function totalQty(products: WarehouseProduct[]) {
  return products.reduce((sum, product) => sum + parseQty(product.qty), 0);
}

function productTitle(products: WarehouseProduct[]) {
  if (!products.length) return '-';
  const first = products[0];
  return products.length > 1 ? `${first.name} 等 ${products.length} 项` : first.name;
}

function productSubtitle(products: WarehouseProduct[]) {
  if (!products.length) return '-';
  const first = products[0];
  return [first.materialCode, first.model, productQtyWithUnit(first), first.batch].filter(Boolean).join(' · ');
}

function otherMoveProductSubtitle(products: WarehouseProduct[]) {
  if (!products.length) return '-';
  const first = products[0];
  return [...new Set([first.materialCode, first.model, first.spec].map((value) => String(value || '').trim()).filter(Boolean))].join(' · ') || '-';
}

function otherMoveQuantityTotals(products: WarehouseProduct[]) {
  const totals = new Map<string, number>();
  products.forEach((product) => {
    const unit = product.uom || qtyUnit(product.qty);
    totals.set(unit, (totals.get(unit) || 0) + parseQty(product.qty));
  });
  return [...totals.entries()].map(([unit, value]) => formatQty(value, unit)).join(' / ');
}

function otherMoveBatchSummary(products: WarehouseProduct[]) {
  const batches = [...new Set(products.map((product) => String(product.batch || '').trim()).filter(Boolean))];
  if (batches.length === 1) return batches[0];
  return batches.length > 1 ? `${batches.length} 个批次` : '';
}

function otherMoveQuantitySummary(products: WarehouseProduct[]) {
  const quantity = otherMoveQuantityTotals(products);
  const batch = otherMoveBatchSummary(products);
  return [quantity ? `数量 ${quantity}` : '', batch ? `批次 ${batch}` : ''].filter(Boolean).join(' · ');
}

function salesIssueQuantityValue(row: SalesIssue, hasCurrentExecution: boolean) {
  return row.products.reduce((sum, product) => (
    sum + parseQty(hasCurrentExecution ? product.qty : product.taskQty || product.qty)
  ), 0);
}

function salesIssueQuantitySummary(row: SalesIssue, hasCurrentExecution: boolean) {
  const totalsByUnit = new Map<string, number>();
  row.products.forEach((product) => {
    const rawQuantity = hasCurrentExecution ? product.qty : product.taskQty || product.qty;
    const unit = product.uom || qtyUnit(rawQuantity);
    totalsByUnit.set(unit, (totalsByUnit.get(unit) || 0) + parseQty(rawQuantity));
  });
  if (!totalsByUnit.size) return '';
  const quantity = [...totalsByUnit.entries()]
    .map(([unit, value]) => formatQty(value, unit))
    .join(' / ');
  return `${hasCurrentExecution ? '本次出库' : '任务'} ${quantity}`;
}

function salesIssueBatchSummary(row: SalesIssue, hasCurrentExecution: boolean) {
  if (!hasCurrentExecution) return '';
  const batches = [...new Set(
    row.products.flatMap((product) => {
      const allocationBatches = (product.allocations || [])
        .filter((allocation) => parseQty(allocation.qty) > 0)
        .map((allocation) => allocation.batch)
        .filter(Boolean);
      return allocationBatches.length ? allocationBatches : [product.batch].filter(Boolean);
    }),
  )];
  if (batches.length === 1) return batches[0];
  return batches.length > 1 ? `${batches.length} 个批次` : '';
}

function salesIssueProductSubtitle(row: SalesIssue, hasCurrentExecution: boolean) {
  if (!row.products.length) return '-';
  const first = row.products[0];
  return [
    first.materialCode,
    first.model,
    salesIssueBatchSummary(row, hasCurrentExecution),
  ].filter(Boolean).join(' · ');
}

function receiptProductSubtitle(products: WarehouseProduct[]) {
  if (!products.length) return '-';
  const first = products[0];
  return [
    first.materialCode,
    first.model,
    first.batch,
  ].filter(Boolean).join(' · ');
}

type ReceiptListQuantityField = 'qty' | 'plannedQty' | 'arrivalQty' | 'refusedQty' | 'exceptionHeldQty';

function receiptQuantityTotals(products: WarehouseProduct[], field: ReceiptListQuantityField, fallbackField?: ReceiptListQuantityField) {
  const totals = new Map<string, number>();
  products.forEach((product) => {
    const receiptProduct = product as WarehouseProduct & Partial<Record<ReceiptListQuantityField, string>>;
    const rawValue = receiptProduct[field] || (fallbackField ? receiptProduct[fallbackField] : '') || '';
    const unit = receiptProduct.uom || qtyUnit(rawValue);
    totals.set(unit, (totals.get(unit) || 0) + parseQty(rawValue));
  });
  return [...totals.entries()].map(([unit, value]) => formatQty(value, unit)).join(' / ');
}

function receiptQuantityValue(products: WarehouseProduct[], field: ReceiptListQuantityField) {
  return products.reduce((sum, product) => {
    const receiptProduct = product as WarehouseProduct & Partial<Record<ReceiptListQuantityField, string>>;
    return sum + parseQty(receiptProduct[field]);
  }, 0);
}

function receiptProductQuantitySummary(products: WarehouseProduct[], status: string) {
  if (!products.length) return '无物料';
  if (['草稿', '待收货'].includes(status)) {
    return `计划 ${receiptQuantityTotals(products, 'plannedQty', 'qty')}`;
  }

  const planned = receiptQuantityTotals(products, 'plannedQty');
  const arrival = receiptQuantityTotals(products, 'arrivalQty', 'qty');
  const hasPlanned = receiptQuantityValue(products, 'plannedQty') > 0;
  const refused = receiptQuantityValue(products, 'refusedQty');
  const exceptionHeld = receiptQuantityValue(products, 'exceptionHeldQty');
  return [
    hasPlanned && planned !== arrival ? `计划 ${planned}` : '',
    `到货 ${arrival}`,
    refused > 0 ? `拒收 ${receiptQuantityTotals(products, 'refusedQty')}` : '',
    exceptionHeld > 0 ? `异常暂收 ${receiptQuantityTotals(products, 'exceptionHeldQty')}` : '',
  ].filter(Boolean).join(' · ');
}

function warehouseActorLabel(value: string | undefined, fallback = '仓库') {
  const label = String(value || '')
    .replace(/\s*\/\s*ACC-[A-Z0-9-]+\s*$/i, '')
    .trim();
  return label || fallback;
}

function attachmentValueOf(row: unknown) {
  if (!row || typeof row !== 'object') return undefined;
  return (row as { attachments?: unknown }).attachments;
}

function attachmentCountFor(row: unknown) {
  const attachments = attachmentValueOf(row);
  if (Array.isArray(attachments)) return attachments.length;
  if (typeof attachments === 'number') return attachments;
  return 0;
}

function attachmentSearchValues(row: unknown) {
  const attachments = attachmentValueOf(row);
  if (!Array.isArray(attachments)) return [];

  return attachments.flatMap((attachment) => {
    if (attachment && typeof attachment === 'object') {
      const file = attachment as { name?: unknown; uploader?: unknown };
      return [file.name, file.uploader];
    }

    return [attachment];
  });
}

function uniqueValues(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
}

function dateOnly(date: string) {
  return date.slice(0, 10);
}

function matchesDateRange(date: string) {
  const value = dateOnly(date);
  return (!filterDateStart.value || value >= filterDateStart.value) && (!filterDateEnd.value || value <= filterDateEnd.value);
}

function statusClass(status: string) {
  return statusPresentationClass(status);
}

function ledgerMovementClass(movement: string) {
  if (['入库', '其他入库', '采购入库', '生产退料', '完工入库', '调拨入', '调拨入库', '解锁', '解冻', '质检解冻', '质检放行', '复检放行', '让步放行', '盘盈'].includes(movement)) return 'status-done';
  if (['出库', '其他出库', '销售出库', '生产领料', '调拨出', '调拨出库', '锁定', '冻结', '待检', '采购到货', '质检冻结', '到货收货', '到货待检', '售后收货待检', '采购退货出库', '补发出库', '换货出库', '返修品出库', '异常暂存退回', '采购入库移出', '待入库转出', '不合格转出'].includes(movement)) return 'status-pending';
  if (['盘亏', '不合格隔离'].includes(movement)) return 'status-alert';
  return 'status-neutral';
}

function ledgerBalanceText(row: StockLedgerRow) {
  if (row.beforeBalance && row.afterBalance) return `${row.beforeBalance} → ${row.afterBalance}`;
  return row.balance;
}

function ledgerDirectionLabel(row: StockLedgerRow) {
  const direction = String(row.movementDirection || '').trim();
  if (direction) return direction;
  const quantity = row.quantityNumber ?? parseQty(row.qty);
  if (quantity > 0) return '入库';
  if (quantity < 0) return '出库';
  return '状态变更';
}

function ledgerBusinessType(row: StockLedgerRow) {
  const structuredMovementTypes = [
    '采购到货',
    '质检冻结',
    '质检解冻',
    '质检放行',
    '复检放行',
    '让步放行',
    '不合格隔离',
    '不合格转出',
    '待入库转出',
    '采购入库移出',
  ];
  if (structuredMovementTypes.includes(row.movement)) return row.movement;
  const reason = String(row.reason || '');
  const rules: Array<[RegExp, string]> = [
    [/冲销/, '库存冲销'],
    [/完工入库/, '完工入库'],
    [/采购入库/, '采购入库'],
    [/采购.*正式入库/, '采购入库'],
    [/采购到货/, '采购到货'],
    [/质检冻结/, '质检冻结'],
    [/复检放行/, '复检放行'],
    [/让步放行/, '让步放行'],
    [/质检放行/, '质检放行'],
    [/售后收货待检/, '售后收货待检'],
    [/采购退货出库/, '采购退货出库'],
    [/补发出库/, '补发出库'],
    [/换货出库/, '换货出库'],
    [/返修品出库/, '返修品出库'],
    [/异常暂存退回/, '异常暂存退回'],
    [/销售出库/, '销售出库'],
    [/生产领料/, '生产领料'],
    [/生产退料/, '生产退料'],
    [/调拨.*出库/, '调拨出库'],
    [/调拨.*入库/, '调拨入库'],
    [/其他入库/, '其他入库'],
    [/其他出库/, '其他出库'],
    [/盘盈/, '盘盈'],
    [/盘亏/, '盘亏'],
  ];
  const matchedType = rules.find(([pattern]) => pattern.test(reason))?.[1];
  if (matchedType) return matchedType;
  if (row.movement === '入库') return '未分类入库';
  if (row.movement === '出库') return '未分类出库';
  return row.movement || '未分类变动';
}

function ledgerReasonDetail(row: StockLedgerRow) {
  const reason = String(row.reason || '').trim();
  const businessType = ledgerBusinessType(row);
  const normalizedReasonLabel = reason.replace(/^库存/, '');
  if (
    !reason
    || reason === businessType
    || normalizedReasonLabel === businessType
    || (businessType === '采购入库' && /^采购(?:到货)?正式入库$/.test(reason))
  ) return '';
  let detail = reason.replace(/释放批次/g, '生产安排');
  if (row.reversalOf) {
    const reversalPrefix = `冲销 ${row.reversalOf}`;
    if (detail.startsWith(reversalPrefix)) {
      detail = detail.slice(reversalPrefix.length).replace(/^[：:]\s*/, '').trim();
    }
  }
  return detail;
}

function ledgerMaterialMeta(row: StockLedgerRow) {
  return [row.materialCode, row.itemType, stockLedgerBatchLabel(row)].filter(Boolean).join(' · ');
}

function ledgerWarehouseMeta(row: StockLedgerRow) {
  return [row.warehouseCode, inventoryLocationLabel(row.location)].filter(Boolean).join(' · ') || '历史库位未登记';
}

function ledgerRowKey(row: StockLedgerRow) {
  return [
    row.occurredAt || row.time,
    row.sourceDoc,
    row.documentLineId,
    row.sourceLineId,
    row.inventoryKey,
    row.balanceFact,
    ledgerDirectionLabel(row),
    row.qty,
    row.beforeBalance,
    row.afterBalance,
  ].join('::');
}

function stockLedgerBatchLabel(row: StockLedgerRow) {
  return afterSalesBatchLabel(row.batch, row.sourceDoc, '未记录批次');
}

function inventoryDetailBatchLabel(detail: WarehouseInventoryDetailRow) {
  return afterSalesBatchLabel(detail.batch, detail.sourceDoc, '未记录批次');
}

function ledgerPublicSourceLine(row: StockLedgerRow) {
  return row.sourceLineId && !row.sourceLineId.includes('::') ? row.sourceLineId : '';
}

function ledgerSourceLineText(row: StockLedgerRow) {
  if (row.reversalOf) return `冲销原单 ${row.reversalOf}${row.documentLineId ? ` · 原单行 ${row.documentLineId}` : ''}`;
  const sourceLineId = ledgerPublicSourceLine(row);
  if (sourceLineId && row.documentLineId) return `来源行 ${sourceLineId} · 单据行 ${row.documentLineId}`;
  if (sourceLineId) return `来源行 ${sourceLineId}`;
  if (row.documentLineId) return `单据行 ${row.documentLineId}`;
  return '单据级流水';
}

function warehouseSourcePath(sourceDoc: string, reason = '') {
  const code = String(sourceDoc || '').trim();
  if (/^WR-/.test(code)) return `/warehouse/purchase-receipts/${encodeURIComponent(code)}`;
  if (/^WS-/.test(code)) return `/warehouse/sales-issues/${encodeURIComponent(code)}`;
  if (/^OM-/.test(code)) return `/warehouse/other-moves/${encodeURIComponent(code)}`;
  if (/^TR-/.test(code)) return `/warehouse/transfers/${encodeURIComponent(code)}`;
  if (/^ST-/.test(code)) return `/warehouse/stocktakes/${encodeURIComponent(code)}`;
  if (/^WM2-/.test(code)) {
    if (/生产退料|退料入库/.test(reason)) return `/warehouse/production-returns/${encodeURIComponent(code)}`;
    if (/完工入库|生产入库/.test(reason)) return `/warehouse/production-receipts/${encodeURIComponent(code)}`;
    return `/warehouse/production-issues/${encodeURIComponent(code)}`;
  }
  if (/^WMR2-/.test(code)) return `/warehouse/production-returns/${encodeURIComponent(code)}`;
  if (/^WPR2-/.test(code)) return `/warehouse/production-receipts/${encodeURIComponent(code)}`;
  if (/^WAS-/.test(code)) return `/warehouse/after-sales/${encodeURIComponent(code)}`;
  return '';
}

function ledgerSourcePath(row: StockLedgerRow) {
  if (row.reversalOf) return '';
  if (isWarehouseOwnedPath(row.sourcePath)) return row.sourcePath || '';
  return warehouseSourcePath(row.sourceDoc, row.reason);
}

function ledgerOriginalSourcePath(row: StockLedgerRow) {
  if (!row.reversalOf) return '';
  if (isWarehouseOwnedPath(row.sourcePath)) return row.sourcePath || '';
  return warehouseSourcePath(row.reversalOf, row.reason);
}

function isWarehouseOwnedPath(path?: string) {
  return String(path || '').startsWith('/warehouse/');
}

function sortRows<T>(
  rows: T[],
  getters: {
    date: (row: T) => string;
    amount?: (row: T) => number;
    status?: (row: T) => string;
  },
) {
  const statusRank: Record<string, number> = {
    含不合格隔离: 1,
    含异常暂存: 2,
    含待检: 3,
    含待正式入库: 4,
    含调拨在途: 5,
    数据异常: 1,
    无可用库存: 6,
    待转可用: 7,
    全部占用: 8,
    部分可用: 9,
    可用: 10,
    不合格隔离: 1,
    异常暂存: 2,
    异常暂收: 1,
    草稿: 2,
    执行中: 3,
    待收货: 3,
    待到货: 3,
    待入库: 4,
    部分入库: 4,
    待质检: 5,
    已到货: 4,
    待判定: 1,
    待受理: 2,
    待拣货: 3,
    待复核: 4,
    待出库: 2,
    待审核: 2,
    待过账: 3,
    调拨中: 3,
    质检不合格: 6,
    待盘点: 2,
    盘点中: 3,
    待处理: 1,
    处理中: 2,
    待前置: 3,
    已受理: 4,
    已出库: 6,
    已拒收: 8,
    已入库: 9,
    已完成: 10,
    已过账: 10,
    库存告急: 1,
    需补货: 6,
    需关注: 7,
    补货处理中: 3,
    在途覆盖: 4,
    在途: 4,
    已占用: 5,
    正常: 8,
    充足: 9,
    待检: 3,
    合格: 5,
    差异待处理: 8,
    退货处理中: 11,
    异常待处理: 11,
    拣货异常: 11,
    已中断: 12,
    已冲销: 12,
    已取消: 13,
    已作废: 13,
    已过期: 1,
    '30天内到期': 2,
    '90天内到期': 3,
  };
  const compareDate = (a: T, b: T, direction: 'asc' | 'desc') => {
    const first = String(getters.date(a) || '').trim();
    const second = String(getters.date(b) || '').trim();
    const firstMissing = !first || ['-', '—'].includes(first);
    const secondMissing = !second || ['-', '—'].includes(second);
    if (firstMissing !== secondMissing) return firstMissing ? 1 : -1;
    if (firstMissing) return 0;
    return direction === 'asc' ? first.localeCompare(second) : second.localeCompare(first);
  };

  return [...rows].sort((a, b) => {
    if (sortMode.value === 'oldest') {
      return compareDate(a, b, 'asc');
    }

    if (sortMode.value === 'amountDesc' && getters.amount) {
      return getters.amount(b) - getters.amount(a);
    }

    if (sortMode.value === 'status' && getters.status) {
      const statusDifference = (statusRank[getters.status(a)] ?? 99) - (statusRank[getters.status(b)] ?? 99);
      if (!statusDifference && activeOperationPage.value === 'purchaseReceipts' && getters.status(a) === '待收货') {
        return compareDate(a, b, 'asc');
      }
      return statusDifference || compareDate(a, b, 'desc');
    }

    if (activeOperationPage.value === 'afterSalesTasks' && getters.status) {
      const statusDifference = (statusRank[getters.status(a)] ?? 99) - (statusRank[getters.status(b)] ?? 99);
      return statusDifference || compareDate(a, b, 'desc');
    }

    return compareDate(a, b, 'desc');
  });
}

const purchaseReceiptSourceRows = computed(() => apiPurchaseReceiptRows.value ?? []);
const salesIssueSourceRows = computed(() => apiSalesIssueRows.value ?? []);
const productionMoveSourceRows = computed<ProductionMove[]>(() => {
  const runtimeIssues = apiProductionIssueRows.value || [];
  const runtimeReturns = apiProductionReturnRows.value || [];
  const runtimeReceipts = apiProductionReceiptRows.value || [];
  return [
    ...(runtimeIssues as unknown as ProductionMove[]),
    ...(runtimeReturns as unknown as ProductionMove[]),
    ...(runtimeReceipts as unknown as ProductionMove[]),
  ];
});
const afterSalesTaskSourceRows = computed(() => apiAfterSalesTaskRows.value ?? []);
const otherMoveSourceRows = computed(() => apiOtherMoveRows.value ?? []);
const transferSourceRows = computed(() => apiTransferRows.value ?? []);
const stocktakeSourceRows = computed(() => apiStocktakeRows.value ?? []);
const inventorySourceRows = computed(() => apiInventoryRows.value ?? []);
const replenishmentSourceRows = computed(() => apiReplenishmentRows.value ?? []);
const stockLedgerSourceRows = computed(() => apiStockLedgerRows.value ?? []);

function productionPageForMoveType(moveType: string): Extract<OperationPageKey, 'productionIssues' | 'productionReturns' | 'productionReceipts'> {
  if (moveType === '生产退料') return 'productionReturns';
  if (moveType === '完工入库') return 'productionReceipts';
  return 'productionIssues';
}

function productionWarehouseTitle(row: ProductionMove) {
  const page = productionPageForMoveType(row.moveType);
  if (page === 'productionIssues') return row.warehouse;
  return row.targetWarehouse || row.warehouse;
}

function productionWarehouseSubtitle(row: ProductionMove) {
  const page = productionPageForMoveType(row.moveType);
  if (page === 'productionIssues') return row.targetWarehouse ? `去向 ${row.targetWarehouse}` : '领料出库';
  return row.warehouse ? `来源 ${row.warehouse}` : row.moveType;
}

function productionCardValue(row: ProductionMove) {
  if (row.moveType === '生产退料') return '退料';
  if (row.moveType === '完工入库') return '完工';
  return '领料';
}

function inventoryMaterialShelfLife(row: WarehouseInventorySourceRow) {
  return masterDataRows.materials.find((material) => (
    (row.materialCode && material.code === row.materialCode) || (!row.materialCode && material.name === row.item)
  ))?.shelfLife || '';
}

function batchExpiryDate(row: WarehouseInventorySourceRow) {
  if (row.expiryDate) return row.expiryDate;
  const shelfLife = inventoryMaterialShelfLife(row);
  if (/无效期|不适用/.test(shelfLife)) return '无效期要求';
  return '效期未登记';
}

function inventoryBatchDate(row: WarehouseInventorySourceRow, movements: StockLedgerRow[]) {
  if (row.batchDate) return row.batchDate;
  const firstMovement = [...movements].sort((a, b) => a.time.localeCompare(b.time))[0];
  return (firstMovement?.time || row.updatedAt || '').slice(0, 10) || '未记录';
}

function inventoryBatchGroupDate(rows: WarehouseInventorySourceRow[], movements: StockLedgerRow[]) {
  const registeredDates = uniqueValues(rows.map((row) => String(row.batchDate || '').slice(0, 10)).filter(Boolean));
  if (registeredDates.length) return [...registeredDates].sort((a, b) => a.localeCompare(b))[0];
  const firstMovement = [...movements].sort((a, b) => a.time.localeCompare(b.time))[0];
  const earliestUpdate = rows.map((row) => row.updatedAt).filter(Boolean).sort((a, b) => a.localeCompare(b))[0];
  return (firstMovement?.time || earliestUpdate || '').slice(0, 10) || '未记录';
}

function inventoryBatchGroupExpiryDate(rows: WarehouseInventorySourceRow[]) {
  const expiryDates = uniqueValues(rows.map(batchExpiryDate));
  if (expiryDates.length > 1) return '效期不一致';
  return expiryDates[0] || '效期未登记';
}

type InventoryMaterialIdentity = {
  materialCode?: string;
  item: string;
  itemType?: string;
};

function inventoryMaterialKey(row: InventoryMaterialIdentity) {
  const materialCode = normalized(row.materialCode);
  if (materialCode) return `code:${materialCode}`;
  return `legacy:${normalized(row.item)}::${normalized(row.itemType)}`;
}

function inventoryMaterialMatches(first: InventoryMaterialIdentity, second: InventoryMaterialIdentity) {
  const firstCode = normalized(first.materialCode);
  const secondCode = normalized(second.materialCode);
  if (firstCode && secondCode) return firstCode === secondCode;
  return normalized(first.item) === normalized(second.item)
    && (!first.itemType || !second.itemType || normalized(first.itemType) === normalized(second.itemType));
}

function batchQcStatus(row: WarehouseInventorySourceRow) {
  if (parseQty(row.rejectedHold) > 0 || row.status === '不合格隔离') return '不合格隔离';
  if (parseQty(row.exceptionHold) > 0 || row.status === '异常暂存') return '异常暂存';
  if (parseQty(row.qcHold) > 0 || row.status === '待判定') return '待检';
  if (row.status === '质检不合格') return '不合格';
  return '合格';
}

function inventoryLocationLabel(location: string) {
  const value = String(location || '').trim();
  return !value || value === '默认库位' || /-AUTO$/i.test(value)
    ? '历史库位未登记'
    : value;
}

function inventoryBalanceAnomalyReasons(row: WarehouseInventorySourceRow) {
  const onHand = parseQty(row.onHand);
  const qualified = parseQty(row.qualifiedOnHand);
  const available = parseQty(row.available);
  const locked = parseQty(row.locked);
  const tolerance = 0.0001;
  const reasons = [
    onHand < -tolerance ? `物理在库为负数 ${row.onHand}` : '',
    qualified < -tolerance ? `合格在库为负数 ${row.qualifiedOnHand}` : '',
    available < -tolerance ? `可用库存为负数 ${row.available}` : '',
    locked < -tolerance ? `占用数量为负数 ${row.locked}` : '',
  ];
  if ([onHand, qualified, available, locked].every((value) => value >= -tolerance)) {
    reasons.push(
      qualified - onHand > tolerance ? `合格在库 ${row.qualifiedOnHand} 大于物理在库 ${row.onHand}` : '',
      available - qualified > tolerance ? `可用库存 ${row.available} 大于合格在库 ${row.qualifiedOnHand}` : '',
      locked - qualified > tolerance ? `占用数量 ${row.locked} 大于合格在库 ${row.qualifiedOnHand}` : '',
      Math.abs(available + locked - qualified) > tolerance
        ? `可用与占用合计不等于合格库存 ${row.qualifiedOnHand}`
        : '',
    );
  }
  return reasons.filter(Boolean);
}

function inventoryRowHasBalanceAnomaly(row: WarehouseInventorySourceRow) {
  return inventoryBalanceAnomalyReasons(row).length > 0;
}

function inventoryControlLabels(rows: WarehouseInventorySourceRow[]) {
  return [
    rows.some((row) => parseQty(row.rejectedHold) > 0) ? '不合格隔离' : '',
    rows.some((row) => parseQty(row.exceptionHold) > 0) ? '异常暂存' : '',
    rows.some((row) => parseQty(row.qcHold) > 0) ? '待检' : '',
    rows.some((row) => parseQty(row.pendingInbound) > 0) ? '待正式入库' : '',
    rows.some((row) => parseQty(row.inTransit) > 0) ? '调拨在途' : '',
  ].filter(Boolean);
}

function inventoryControlSummary(rows: WarehouseInventorySourceRow[]) {
  const labels = inventoryControlLabels(rows);
  if (!labels.length) return '';
  if (labels.length === 1) return `含${labels[0]}`;
  return `${labels[0]}等 ${labels.length} 项`;
}

function inventoryControlDetail(rows: WarehouseInventorySourceRow[]) {
  return inventoryControlLabels(rows).map((label) => `含${label}`).join(' · ');
}

function inventoryAggregateStatus(
  rows: WarehouseInventorySourceRow[],
  mode: WarehouseInventoryViewMode = 'item',
): InventoryAvailabilityStatus {
  if (rows.some(inventoryRowHasBalanceAnomaly)) return '数据异常';

  if (mode === 'location') {
    const materialRows = new Map<string, WarehouseInventorySourceRow[]>();
    rows.forEach((row) => {
      const key = inventoryMaterialKey(row);
      materialRows.set(key, [...(materialRows.get(key) ?? []), row]);
    });
    const materialAvailability = [...materialRows.values()].map((group) => hasPositiveQty(inventoryQtyTotal(group, 'available')));
    if (materialAvailability.some(Boolean)) {
      return materialAvailability.every(Boolean) ? '可用' : '部分可用';
    }
  } else if (rows.some((row) => parseQty(row.available) > 0)) {
    return '可用';
  }

  if (rows.some((row) => parseQty(row.qualifiedOnHand) > 0 && parseQty(row.locked) > 0)) return '全部占用';
  if (rows.some((row) => (
    parseQty(row.qcHold) > 0
    || parseQty(row.pendingInbound) > 0
    || parseQty(row.inTransit) > 0
  ))) return '待转可用';
  return '无可用库存';
}

function inventoryAvailabilitySummary(
  rows: WarehouseInventorySourceRow[],
  mode: WarehouseInventoryViewMode,
  status: InventoryAvailabilityStatus,
) {
  const available = inventoryQtyTotal(rows, 'available');
  const qualified = inventoryQtyTotal(rows, 'qualifiedOnHand');
  const locked = inventoryQtyTotal(rows, 'locked');
  if (status === '数据异常') return '数量关系异常，请在库存预警中核对数据';
  if (status === '可用') return hasPositiveQty(locked)
    ? `当前可用 ${available}，另有 ${locked} 已占用`
    : `当前可用 ${available}`;
  if (status === '部分可用') return `部分物料可用，当前合计 ${available}`;
  if (status === '全部占用') return `合格库存 ${qualified} 已全部占用`;
  if (status === '待转可用') {
    return [
      hasPositiveQty(inventoryQtyTotal(rows, 'qcHold')) ? `待检 ${inventoryQtyTotal(rows, 'qcHold')}` : '',
      hasPositiveQty(inventoryQtyTotal(rows, 'pendingInbound')) ? `待正式入库 ${inventoryQtyTotal(rows, 'pendingInbound')}` : '',
      hasPositiveQty(inventoryQtyTotal(rows, 'inTransit')) ? `调拨在途 ${inventoryQtyTotal(rows, 'inTransit')}` : '',
    ].filter(Boolean).join(' · ');
  }
  return mode === 'location' ? '当前库位没有可用库存' : '当前没有可用库存';
}

function inventoryLatestLedger(row: WarehouseInventorySourceRow) {
  return stockLedgerSourceRows.value
    .filter((ledger) => (
      ledger.batch === row.batch
      && inventoryMaterialMatches(ledger, row)
      && ledger.warehouse === row.warehouse
      && ledger.location === row.location
    ))
    .sort((a, b) => b.time.localeCompare(a.time))[0];
}

function selectInventoryRow(row: WarehouseInventoryGroup) {
  selectedInventoryKey.value = row.key;
  inventoryCompactDetailOpen.value = true;
  focusInventoryDetail();
  void nextTick(() => {
    inventoryDetailScrollRef.value?.scrollTo({ top: 0 });
  });
}

function resetInventoryTableScroll() {
  void nextTick(() => inventoryTableScrollRef.value?.scrollTo({ left: 0 }));
}

function setInventoryViewMode(mode: WarehouseInventoryViewMode) {
  if (mode === inventoryViewMode.value) return;
  if (inventoryTaskView.value === 'batch' && mode !== 'batch') return;
  const query = { ...route.query };
  const keyword = searchKeyword.value.trim();
  if (keyword) query.keyword = keyword;
  else delete query.keyword;
  if (mode === 'item') delete query.view;
  else query.view = mode;
  inventoryViewMode.value = mode;
  if (mode !== 'location' && sortMode.value === 'amountDesc') sortMode.value = 'status';
  reconcileInventoryStatusFilter();
  inventoryCompactDetailOpen.value = false;
  resetInventoryTableScroll();
  void nextTick(() => inventoryDetailScrollRef.value?.scrollTo({ top: 0 }));
  void router.replace({ query });
}

function setInventoryTaskView(task: WarehouseInventoryTaskView) {
  if (task === inventoryTaskView.value) return;
  const query = { ...route.query };
  const keyword = searchKeyword.value.trim();
  if (keyword) query.keyword = keyword;
  else delete query.keyword;
  if (task === 'overview') delete query.task;
  else query.task = task;
  if (task === 'batch') {
    inventoryViewMode.value = 'batch';
    query.view = 'batch';
    if (sortMode.value === 'amountDesc') sortMode.value = 'status';
  }
  inventoryTaskView.value = task;
  reconcileInventoryStatusFilter();
  inventoryCompactDetailOpen.value = false;
  resetInventoryTableScroll();
  void router.replace({ query });
}

function setInventoryAlertTab(tab: WarehouseInventoryAlertTab) {
  if (tab === inventoryAlertTab.value) return;
  const query = { ...route.query };
  if (tab === 'replenishment') delete query.tab;
  else query.tab = tab;
  inventoryAlertTab.value = tab;
  if (tab !== 'replenishment' && sortMode.value === 'amountDesc') sortMode.value = 'status';
  updateCurrentFilters({ ...currentFilters.value, status: '' });
  draftFilters.value = { ...draftFilters.value, status: '' };
  void router.replace({ query });
}

function closeInventoryDetail() {
  inventoryCompactDetailOpen.value = false;
  restoreInventoryDetailFocus();
}

function syncWarehouseListKeywordQuery() {
  if (!['inventory', 'stockLedger'].includes(activePage.value)) return;
  const keyword = searchKeyword.value.trim();
  if (keyword === routeKeywordValue().trim()) return;
  const query = { ...route.query };
  if (keyword) query.keyword = keyword;
  else delete query.keyword;
  void router.replace({ query });
}

function inventoryDetailControlledText(detail: WarehouseInventoryDetailRow) {
  return [
    ['待检', detail.qcHold],
    ['待正式入库', detail.pendingInbound],
    ['不合格隔离', detail.rejectedHold],
    ['异常暂存', detail.exceptionHold],
    ['调拨在途', detail.inTransit],
  ]
    .filter(([, value]) => hasPositiveQty(value))
    .map(([label, value]) => `${label} ${value}`)
    .join(' · ');
}

function inventoryWarehouseControlledText(warehouse: WarehouseInventoryWarehouseSummary) {
  return [
    ['待检', warehouse.qcHold],
    ['待正式入库', warehouse.pendingInbound],
    ['不合格隔离', warehouse.rejectedHold],
    ['异常暂存', warehouse.exceptionHold],
    ['调拨在途', warehouse.inTransit],
  ]
    .filter(([, value]) => hasPositiveQty(value))
    .map(([label, value]) => `${label} ${value}`)
    .join(' · ');
}

function inventoryControlledFactEntries(row: WarehouseInventoryGroup) {
  const entries = [
    { label: '销售预留', value: row.reserved, tone: 'occupied' },
    { label: '生产分配', value: row.allocated, tone: 'occupied' },
    { label: '冻结', value: row.frozen, tone: 'occupied' },
    { label: '待检', value: row.qcHold, tone: 'pending' },
    { label: '待正式入库', value: row.pendingInbound, tone: 'pending' },
    { label: '不合格隔离', value: row.rejectedHold, tone: 'danger' },
    { label: '异常暂存', value: row.exceptionHold, tone: 'danger' },
    { label: '调拨在途', value: row.inTransit, tone: 'pending' },
    { label: '计划入库', value: row.inboundPlan, tone: 'pending' },
    { label: '待出库计划', value: row.outboundPlan, tone: 'occupied' },
  ];

  return entries
    .map((entry) => ({
      ...entry,
      value: String(entry.value)
        .split('/')
        .map((part) => part.trim())
        .filter((part) => (
          (part.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g) ?? [])
            .some((value) => Number(value) > 0)
        ))
        .join(' / '),
    }))
    .filter((entry) => Boolean(entry.value));
}

function inventoryLedgerKeyword(row: WarehouseInventoryGroup) {
  if (row.mode === 'batch') return row.scopeBatch;
  if (row.mode === 'location') return row.scopeLocation;
  return row.materialCode || row.item;
}

function inventoryLedgerRows(row: WarehouseInventoryGroup) {
  const rows = stockLedgerSourceRows.value
    .filter((ledger) => {
      if (row.mode === 'location') {
        return ledger.warehouse === row.scopeWarehouse && ledger.location === row.scopeLocation;
      }

      if (row.mode === 'batch') {
        return ledger.batch === row.scopeBatch && inventoryMaterialMatches(ledger, row);
      }

      return inventoryMaterialMatches(ledger, row);
    })
    .sort((a, b) => b.time.localeCompare(a.time));
  return row.mode === 'batch' ? rows : rows.slice(0, 6);
}

function inventoryDetailPrimary(detail: WarehouseInventoryDetailRow, mode: WarehouseInventoryViewMode) {
  if (mode === 'location') return detail.item;
  if (mode === 'batch') return `${detail.warehouse} / ${detail.location}`;
  return inventoryDetailBatchLabel(detail);
}

function inventoryDetailSecondary(detail: WarehouseInventoryDetailRow, mode: WarehouseInventoryViewMode) {
  if (mode === 'location') {
    return `${detail.materialCode || detail.itemType} · ${detail.itemType} · ${inventoryDetailBatchLabel(detail)} · 物理 ${detail.onHand} · 合格 ${detail.qualifiedOnHand} · 可用 ${detail.available} · 占用 ${detail.locked} · ${detail.qcStatus}`;
  }

  if (mode === 'batch') {
    return `${detail.item} · 物理 ${detail.onHand} · 合格 ${detail.qualifiedOnHand} · 可用 ${detail.available} · 占用 ${detail.locked} · ${detail.qcStatus}`;
  }

  return `${detail.warehouse} / ${detail.location} · 物理 ${detail.onHand} · 合格 ${detail.qualifiedOnHand} · 可用 ${detail.available} · 占用 ${detail.locked} · ${detail.qcStatus}`;
}

function purchaseReceiptProgress(row: PurchaseReceipt) {
  if (['草稿', '待收货'].includes(row.status)) {
    return {
      quality: '未开始',
      inbound: '未开始',
      exception: '',
      available: 0,
    };
  }

  const requiresQuality = row.products.some((product) => product.qcRequired);
  const decisions = row.qualityDecision?.lines || [];
  const pending = decisions.reduce((sum, line) => sum + Number(line.pendingQty || 0), 0);
  const rejected = decisions.reduce((sum, line) => sum + Number(line.rejectedQty || 0), 0);
  const acceptedArrival = row.products.reduce(
    (sum, product) => sum + parseQty(product.acceptedQty ?? product.qty),
    0,
  );
  const refused = row.products.reduce((sum, product) => sum + parseQty(product.refusedQty), 0);
  const exceptionHeld = row.products.reduce((sum, product) => sum + parseQty(product.exceptionHeldQty), 0);

  const posted = (row.postedQuantities?.lines || [])
    .reduce((sum, line) => sum + Number(line.postedQty || 0), 0);
  const calculatedEligible = row.products.reduce((sum, product, index) => {
    const lineId = product.lineId || `L${index + 1}`;
    const decision = decisions.find((line) => (line.receiptLineId || line.lineId) === lineId);
    const disposition = row.qualityDispositionQuantities?.[lineId];
    const accepted = parseQty(product.acceptedQty ?? product.qty);
    return sum + (product.qcRequired
      ? Number(decision?.releasedQty || 0)
        + Number(disposition?.approvedConcessionQty || 0)
        + Number(disposition?.reinspectionAcceptedQty || 0)
      : accepted);
  }, 0);
  const eligible = calculatedEligible > 0
    || !requiresQuality
    || !['待入库', '部分入库', '已入库'].includes(row.status)
    ? calculatedEligible
    : acceptedArrival;
  const available = Math.max(0, eligible - posted);
  const quality = purchaseReceiptQualityStateLabel({
    requiresQuality,
    arrivalPending: row.status === '已取消',
    accepted: acceptedArrival,
    pending,
    released: eligible,
    rejected,
  });
  const inbound = purchaseReceiptInboundStateLabel({
    taskStatus: row.status,
    stockStage: row.stockStage,
    posted,
    available,
  });
  const exception = exceptionHeld > 0
    ? '异常暂收'
    : refused > 0
      ? '当场拒收'
      : '';

  return { quality, inbound, exception, available };
}

function daysUntilBusinessDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const todayText = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [todayYear, todayMonth, todayDay] = todayText.split('-').map(Number);
  return Math.round(
    (Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86_400_000,
  );
}

function purchaseReceiptTiming(row: PurchaseReceipt) {
  const isWaitingArrival = ['草稿', '待收货'].includes(row.status);
  const date = isWaitingArrival ? row.expectedDate || row.date || '-' : row.date || '-';
  const dateContext = isWaitingArrival ? '预计到货' : '实际到货';
  const daysUntil = isWaitingArrival ? daysUntilBusinessDate(date) : null;
  if (daysUntil === null) return { date, dateContext };

  if (daysUntil < 0) {
    return { date, dateContext, dateAttention: `逾期 ${Math.abs(daysUntil)} 天`, dateAttentionTone: 'danger' as const };
  }
  if (daysUntil === 0) {
    return { date, dateContext, dateAttention: '今日应到', dateAttentionTone: 'warning' as const };
  }
  if (daysUntil <= 3) {
    return { date, dateContext, dateAttention: `${daysUntil} 天后应到`, dateAttentionTone: 'warning' as const };
  }
  return { date, dateContext };
}

function salesIssueTiming(row: SalesIssue) {
  const usesActualDate = Boolean(row.reversalCode) || row.status === '已出库';
  const isPending = !row.reversalCode
    && !['已出库', '已取消', '已作废', '已中断'].includes(row.status);
  const date = usesActualDate
    ? row.date || row.expectedDate || '-'
    : row.expectedDate || row.date || '-';
  const dateContext = usesActualDate ? '实际出库' : '计划出库';
  const daysUntil = isPending ? daysUntilBusinessDate(date) : null;
  if (daysUntil === null) return { date, dateContext };

  if (daysUntil < 0) {
    return { date, dateContext, dateAttention: `逾期 ${Math.abs(daysUntil)} 天`, dateAttentionTone: 'danger' as const };
  }
  if (daysUntil === 0) {
    return { date, dateContext, dateAttention: '今日应出', dateAttentionTone: 'warning' as const };
  }
  if (daysUntil <= 3) {
    return { date, dateContext, dateAttention: `${daysUntil} 天后应出`, dateAttentionTone: 'warning' as const };
  }
  return { date, dateContext };
}

const purchaseReceiptListRows = computed<OperationRow[]>(() =>
  purchaseReceiptSourceRows.value.map((row) => {
    const status = row.reversalCode ? '已冲销' : row.status;
    const isWaitingArrival = ['草稿', '待收货'].includes(row.status);
    const progress = purchaseReceiptProgress(row);
    const timing = purchaseReceiptTiming(row);
    const itemQuantity = receiptProductQuantitySummary(row.products, row.status);
    const statusDetail = [
      `质检 ${progress.quality}`,
      `入库 ${progress.inbound}`,
      progress.exception ? `到货异常 ${progress.exception}` : '',
    ].filter(Boolean).join(' · ');
    const nextStep = row.reversalCode
      ? '查看冲销记录'
      : row.status === '异常暂收'
        ? '等待采购处理'
        : row.status === '已拒收'
          ? '查看拒收记录'
      : progress.available > 0
        ? '登记入库'
        : row.status === '待质检'
          ? '等待来料质检'
          : row.status === '质检不合格'
            ? '等待质量处置'
          : row.status === '部分入库'
            ? '等待剩余物料处理'
        : row.status === '已入库'
          ? '查看库存流水'
        : row.status === '待收货'
          ? '登记到货结果'
          : row.status === '已取消'
            ? '查看取消记录'
            : '核对任务与到货信息';
    return {
      page: 'purchaseReceipts',
      code: row.code,
      partyTitle: row.supplier,
      partySubtitle: row.sourceDoc,
      partyFilter: row.supplier,
      itemTitle: productTitle(row.products),
      itemSubtitle: receiptProductSubtitle(row.products),
      itemQuantity,
      warehouseTitle: row.warehouse,
      warehouseSubtitle: isWaitingArrival ? '' : row.location ? inventoryLocationLabel(row.location) : '库位未登记',
      warehouseContext: isWaitingArrival ? '计划暂存仓' : '实际暂存',
      ...timing,
      status,
      statusSortKey: nextStep === '登记入库' ? '待入库' : status,
      rawStatus: row.status,
      statusDetail,
      qualityProgress: progress.quality,
      inboundProgress: progress.inbound,
      nextStep,
      reversalCode: row.reversalCode,
      owner: isWaitingArrival ? '' : warehouseActorLabel(row.owner, ''),
      ownerFilter: isWaitingArrival ? '' : warehouseActorLabel(row.owner, ''),
      attachmentCount: attachmentCountFor(row),
      amountValue: isWaitingArrival
        ? receiptQuantityValue(row.products, 'plannedQty')
        : receiptQuantityValue(row.products, 'arrivalQty') || totalQty(row.products),
      cardValue: itemQuantity,
      searchValues: [
        row.code,
        row.sourceDoc,
        row.supplier,
        row.warehouse,
        row.location ? inventoryLocationLabel(row.location) : '库位未登记',
        row.owner,
        status,
        row.status,
        progress.quality,
        progress.inbound,
        progress.exception,
        nextStep,
        timing.dateContext,
        timing.dateAttention,
        itemQuantity,
        isWaitingArrival ? '计划暂存仓' : '实际暂存',
        ...attachmentSearchValues(row),
        ...row.products.flatMap((product) => [productIdentity(product, '-'), productQtyWithUnit(product)]),
      ],
    };
  }),
);

const salesIssueListRows = computed<OperationRow[]>(() =>
  salesIssueSourceRows.value.map((row) => {
    const operationStage = row.status;
    const timing = salesIssueTiming(row);
    const status = row.reversalCode ? '已冲销' : operationStage;
    const hasCurrentExecution = ['待复核', '已出库'].includes(operationStage);
    const executionActor = hasCurrentExecution && row.owner !== '待分配'
      ? row.owner
      : '';
    const itemQuantity = salesIssueQuantitySummary(row, hasCurrentExecution);
    const snapshotWarehouseNames = (row.actualWarehouses || [])
      .map((warehouse) => warehouse.name)
      .filter(Boolean);
    const allocationWarehouseNames = [...new Set(
      row.products
        .flatMap((product) => product.allocations || [])
        .filter((allocation) => parseQty(allocation.qty) > 0)
        .map((allocation) => allocation.warehouse)
        .filter(Boolean),
    )];
    const actualWarehouseNames = hasCurrentExecution
      ? snapshotWarehouseNames.length
        ? snapshotWarehouseNames
        : allocationWarehouseNames.length
          ? allocationWarehouseNames
          : operationStage === '已出库' && row.warehouse
            ? [row.warehouse]
            : []
      : [];
    const warehouseTitle = operationStage === '已取消'
      ? '—'
      : actualWarehouseNames.length
        ? actualWarehouseNames.join('、')
        : '拣货时选择';
    const nextStep = row.reversalCode
      ? '查看冲销记录'
      : operationStage === '待拣货'
        ? '登记拣货'
        : operationStage === '待复核'
          ? '确认出库'
          : operationStage === '已出库'
            ? '查看库存流水'
            : ['已取消', '已作废', '已中断'].includes(operationStage)
              ? '查看终止记录'
              : '查看详情';
    return {
      page: 'salesIssues',
      code: row.code,
      partyTitle: row.customer,
      partySubtitle: row.sourceOrder,
      partyFilter: row.customer,
      itemTitle: productTitle(row.products),
      itemSubtitle: salesIssueProductSubtitle(row, hasCurrentExecution),
      itemQuantity,
      warehouseTitle,
      warehouseSubtitle: row.deliveryMethod,
      ...timing,
      status,
      operationStage,
      nextStep,
      reversalCode: row.reversalCode,
      owner: executionActor,
      ownerFilter: executionActor,
      attachmentCount: attachmentCountFor(row),
      amountValue: salesIssueQuantityValue(row, hasCurrentExecution),
      cardValue: itemQuantity || '—',
      searchValues: [
        row.code,
        row.sourceDoc,
        row.sourceOrder,
        row.customer,
        row.owner,
        row.contact,
        row.contactPhone,
        ...actualWarehouseNames,
        row.deliveryMethod,
        row.owner,
        status,
        operationStage,
        ...attachmentSearchValues(row),
        ...row.products.flatMap((product) => [
          productIdentity(product, '-'),
          hasCurrentExecution ? productQtyWithUnit(product) : product.taskQty || productQtyWithUnit(product),
          hasCurrentExecution ? product.batch : '',
        ]),
        salesIssueQuantitySummary(row, hasCurrentExecution),
        salesIssueBatchSummary(row, hasCurrentExecution),
      ],
    };
  }),
);

const productionMoveListRows = computed<OperationRow[]>(() =>
  productionMoveSourceRows.value.map((row) => {
    const page = productionPageForMoveType(row.moveType);
    const isProjectedProductionMove = page === 'productionIssues' || page === 'productionReturns' || page === 'productionReceipts';
    const operationStage = page === 'productionIssues'
      ? row.status === '已完成'
        ? '已领料'
        : row.status === '待出库'
          ? '待确认'
          : row.status === '草稿'
            ? '待提交'
            : row.status
      : page === 'productionReturns'
        ? row.status === '已完成'
          ? '已退料'
          : row.status === '待入库'
            ? '待确认'
            : row.status === '草稿'
              ? '待提交'
              : row.status
        : page === 'productionReceipts'
          ? row.status === '已完成'
            ? '已入库'
            : row.status === '待入库'
              ? '待确认'
              : row.status === '草稿'
                ? '待提交'
                : row.status
          : row.status;
    const status = isProjectedProductionMove
      ? row.status === '已完成'
        ? '已完成'
        : row.status === '草稿'
          ? '草稿'
          : '执行中'
      : operationStage;
    const nextStep = page === 'productionIssues'
      ? row.status === '草稿'
        ? '提交领料出库'
        : row.status === '待出库'
          ? '确认领料出库'
          : row.status === '已完成'
            ? '领料结果已回传生产'
            : '查看详情'
      : page === 'productionReturns'
        ? row.status === '草稿'
          ? '提交退料入库'
          : row.status === '待入库'
            ? '确认退料入库'
            : row.status === '已完成'
              ? '查看库存流水'
              : '查看详情'
        : page === 'productionReceipts'
          ? row.status === '草稿'
            ? '提交完工入库'
            : row.status === '待入库'
              ? '确认成品入库'
              : row.status === '已完成'
                ? '查看库存流水'
                : '查看详情'
          : undefined;
    return {
      page,
      code: row.code,
      operationKind: row.moveType,
      partyTitle: row.workOrder || '未关联工单',
      partySubtitle: page === 'productionIssues'
        ? [row.releaseBatch, row.executionCard].filter(Boolean).join(' · ') || '等待生产安排'
        : page === 'productionReturns'
          ? [row.materialIssue, row.releaseBatch, row.executionCard].filter(Boolean).join(' · ') || '等待原领料单'
          : page === 'productionReceipts'
            ? [row.releaseBatch, row.executionCard].filter(Boolean).join(' · ') || '等待生产批次'
            : row.moveType,
      partyFilter: row.workOrder || '未关联工单',
      itemTitle: productTitle(row.products),
      itemSubtitle: productSubtitle(row.products),
      warehouseTitle: productionWarehouseTitle(row),
      warehouseSubtitle: productionWarehouseSubtitle(row),
      date: row.date,
      status,
      statusDetail: isProjectedProductionMove ? `作业阶段：${operationStage}` : undefined,
      operationStage: isProjectedProductionMove ? operationStage : undefined,
      nextStep,
      owner: row.owner,
      ownerFilter: row.owner,
      attachmentCount: attachmentCountFor(row),
      amountValue: totalQty(row.products),
      cardValue: productionCardValue(row),
      searchValues: [
        row.code,
        row.moveType,
        row.workOrder,
        row.materialIssue,
        row.releaseBatch,
        row.executionCard,
        row.warehouse,
        row.targetWarehouse,
        row.owner,
        status,
        ...attachmentSearchValues(row),
        ...row.products.flatMap((product) => [productIdentity(product, '-'), productQtyWithUnit(product), product.batch]),
      ],
    };
  }),
);

const productionIssueListRows = computed(() => productionMoveListRows.value.filter((row) => row.page === 'productionIssues'));
const productionReturnListRows = computed(() => productionMoveListRows.value.filter((row) => row.page === 'productionReturns'));
const productionReceiptListRows = computed(() => productionMoveListRows.value.filter((row) => row.page === 'productionReceipts'));

function afterSalesWarehouseSubtitle(row: AfterSalesExecutionTask) {
  if (row.status !== '已完成') return '';
  const positions: string[] = [];
  const addPosition = (warehouse: unknown, location: unknown) => {
    const warehouseText = String(warehouse || '').trim();
    const locationText = String(location || '').trim();
    if (!warehouseText && !locationText) return;
    const text = [warehouseText, inventoryLocationLabel(locationText)].filter(Boolean).join(' · ');
    if (text) positions.push(text);
  };
  (row.allocations || []).forEach((allocation) => addPosition(allocation.warehouse, allocation.location));
  (row.executionRecords || []).forEach((record) => {
    (record.allocations || []).forEach((allocation) => addPosition(allocation.warehouse, allocation.location));
    (record.stockFacts || []).forEach((fact) => addPosition(fact.warehouse, fact.location));
    addPosition(record.warehouse, record.location);
  });
  let uniquePositions = [...new Set(positions)];
  if (!uniquePositions.length) {
    addPosition(row.warehouse, row.location);
    uniquePositions = [...new Set(positions)];
  }
  if (!uniquePositions.length) return '历史位置未登记';
  return uniquePositions.length === 1 ? uniquePositions[0] : `${uniquePositions.length} 个实际位置`;
}

function afterSalesPendingPredecessorLabel(row: AfterSalesExecutionTask) {
  const pendingKinds = (row.predecessors || [])
    .filter((predecessor) => predecessor.status !== '已完成')
    .map((predecessor) => predecessor.kind);
  return pendingKinds.length ? `等待${pendingKinds.join('、')}` : '等待前置任务完成';
}

function afterSalesWarehouseActionLabel(kind: string) {
  return ({
    客户退货接收: '登记退货接收',
    补发出库: '登记补发出库',
    换货出库: '登记换货出库',
    销售退货处置: '登记退货处置',
    返修品入库处置: '登记返修品入库',
    退货品返还出库: '登记退货品返还',
    采购退货出库: '登记采购退货',
    异常暂存退回: '登记异常暂存退回',
    返修品出库: '登记返修品出库',
    返修品报废处置: '登记报废处置',
    不合格品退回供应商: '登记退回供应商',
  } as Record<string, string>)[kind] || '登记作业结果';
}

function afterSalesTaskMaterialTitle(row: AfterSalesExecutionTask) {
  const products = row.products || [];
  if (!products.length) return '未记录物料';
  const first = products[0];
  const title = first.name || first.materialCode || '物料';
  return products.length > 1 ? `${title} 等 ${products.length} 种物料` : title;
}

function afterSalesTaskQuantitySummary(row: AfterSalesExecutionTask) {
  const totals = new Map<string, number>();
  (row.products || []).forEach((product) => {
    const unit = product.uom || qtyUnit(product.qty) || '件';
    totals.set(unit, (totals.get(unit) || 0) + parseQty(product.qty));
  });
  return [...totals.entries()].map(([unit, quantity]) => formatQty(quantity, unit)).join(' / ');
}

function afterSalesTaskMaterialSubtitle(row: AfterSalesExecutionTask) {
  const first = row.products?.[0];
  if (!first) return '—';
  return [first.materialCode, first.model, first.spec].filter(Boolean).join(' · ') || '物料信息未登记';
}

function afterSalesTaskTiming(row: AfterSalesExecutionTask) {
  if (row.status === '已完成') {
    return {
      date: String(row.actualDate || row.completedAt || '').slice(0, 10) || '—',
      context: row.actualDate ? '实际日期' : '完成日期',
      owner: warehouseActorLabel(row.completedBy, ''),
    };
  }
  if (row.status === '处理中') {
    return {
      date: String(row.startedAt || row.createdAt || '').slice(0, 10) || '—',
      context: row.startedAt ? '开始日期' : '生成日期',
      owner: warehouseActorLabel(row.startedBy, ''),
    };
  }
  return {
    date: String(row.createdAt || '').slice(0, 10) || '—',
    context: '生成日期',
    owner: '',
  };
}

const afterSalesTaskListRows = computed<OperationRow[]>(() =>
  afterSalesTaskSourceRows.value.filter((row) => row.status !== '已取消').map((row) => {
    const timing = afterSalesTaskTiming(row);
    const quantitySummary = afterSalesTaskQuantitySummary(row);
    return {
      page: 'afterSalesTasks',
      code: row.code,
      operationKind: row.kind,
      partyTitle: row.party || '—',
      partySubtitle: `${row.afterSaleCode || '—'} · ${row.sourceOrder || '—'}`,
      partyFilter: row.party || '',
      itemTitle: afterSalesTaskMaterialTitle(row),
      itemSubtitle: afterSalesTaskMaterialSubtitle(row),
      itemQuantity: quantitySummary ? `任务 ${quantitySummary}` : '',
      warehouseTitle: row.kind,
      warehouseSubtitle: afterSalesWarehouseSubtitle(row),
      date: timing.date,
      dateContext: timing.context,
      status: row.status,
      rawStatus: row.status,
      operationStage: row.direction || '售后作业',
      nextStep: row.status === '待前置'
        ? afterSalesPendingPredecessorLabel(row)
        : row.status === '待处理'
          ? '开始作业'
          : row.status === '处理中'
            ? afterSalesWarehouseActionLabel(row.kind)
            : row.status === '已完成'
              ? '查看执行记录'
              : '无需处理',
      owner: timing.owner,
      ownerFilter: timing.owner,
      attachmentCount: row.attachments?.length || 0,
      amountValue: row.products?.length || 0,
      cardValue: quantitySummary ? `任务 ${quantitySummary}` : '—',
      searchValues: [
        row.code,
        row.afterSaleCode,
        row.sourceOrder,
        row.party,
        row.kind,
        row.direction,
        row.status,
        row.warehouse,
        row.startedBy,
        row.completedBy,
        ...(row.products || []).flatMap((product) => [productIdentity(product, '—'), productQtyWithUnit(product)]),
      ],
    };
  }),
);

function otherMoveLifecycleStatus(status: string, reversalCode = '') {
  if (reversalCode) return '已冲销';
  if (status === '草稿') return '草稿';
  if (status === '已过账') return '已完成';
  return '执行中';
}

function otherMoveApprovalStage(status: string) {
  if (status === '草稿') return '待提交';
  if (status === '待审核') return '待审核';
  return '已审核';
}

function otherMovePostingStage(status: string) {
  if (status === '待过账') return '待过账';
  if (status === '已过账') return '已过账';
  return '未过账';
}

function otherMoveLocationLabel(location: string | undefined) {
  const value = String(location || '').trim();
  if (!value) return '库位未登记';
  return value === '默认库位' || /-AUTO$/i.test(value) ? '历史库位未登记' : `库位 ${value}`;
}

function transferTargetLocationLabel(location: string | undefined) {
  const value = String(location || '').trim();
  return !value || value === '默认库位' || /-AUTO$/i.test(value) ? '目标库位未设置' : `目标库位 ${value}`;
}

function transferLifecycleStatus(status: string, reversalCode = '') {
  if (reversalCode) return '已冲销';
  if (status === '草稿') return '草稿';
  if (status === '已完成') return '已完成';
  if (['已取消', '已作废'].includes(status)) return '已取消';
  return '执行中';
}

function transferOperationStage(status: string, reversalCode = '') {
  if (reversalCode) return '已冲销';
  if (status === '草稿') return '待提交';
  if (status === '待出库') return '待调出';
  if (status === '调拨中') return '在途';
  if (status === '待入库') return '待调入';
  if (status === '已完成') return '已调入';
  if (['已取消', '已作废'].includes(status)) return '已取消';
  return status || '-';
}

function stocktakeLifecycleStatus(status: string, reversalCode = '') {
  if (reversalCode) return '已冲销';
  if (status === '待盘点') return '草稿';
  if (status === '已完成') return '已完成';
  if (['已取消', '已作废'].includes(status)) return '已取消';
  return '执行中';
}

function stocktakeOperationStage(status: string, reversalCode = '') {
  if (reversalCode) return '已冲销';
  if (status === '待盘点') return '待开始';
  if (status === '盘点中') return '实盘中';
  if (status === '待复核') return '待复核';
  if (status === '已完成') return '已完成';
  if (['已取消', '已作废'].includes(status)) return '已取消';
  return status || '-';
}

function stocktakePostingStage(status: string, reversalCode = '') {
  if (reversalCode) return '已冲销';
  if (status === '待复核') return '待确认';
  if (status === '已完成') return '已完成';
  return '未更新';
}

function stocktakeScopeMode(row: WarehouseStocktake) {
  if (row.scopeMode) return row.scopeMode;
  return /全仓|全部库位|全库/.test(row.scope || '') ? '全仓盘点' : '指定范围';
}

const otherMoveListRows = computed<OperationRow[]>(() =>
  otherMoveSourceRows.value.map((row) => {
    const status = row.status;
    const lifecycleStatus = otherMoveLifecycleStatus(status, row.reversalCode);
    return {
      page: 'otherMoves',
      code: row.code,
      partyTitle: row.moveType,
      partySubtitle: row.reason,
      partyFilter: row.moveType,
      itemTitle: productTitle(row.products),
      itemSubtitle: otherMoveProductSubtitle(row.products),
      itemQuantity: otherMoveQuantitySummary(row.products),
      warehouseTitle: row.moveType === '库存调整'
        ? row.warehouse
        : row.direction === '入库'
          ? `${row.targetWarehouse || '外部来源'} → ${row.warehouse}`
          : `${row.warehouse} → ${row.targetWarehouse || '外部去向'}`,
      warehouseSubtitle: [row.direction, otherMoveLocationLabel(row.location)].filter(Boolean).join(' · '),
      date: row.date,
      status,
      lifecycleStatus,
      approvalStage: otherMoveApprovalStage(status),
      postingStage: otherMovePostingStage(status),
      nextStep: warehouseNextStep({ page: 'otherMoves', status } as OperationRow),
      reversalCode: row.reversalCode,
      owner: row.owner,
      ownerFilter: row.owner,
      attachmentCount: attachmentCountFor(row),
      amountValue: totalQty(row.products),
      cardValue: otherMoveQuantityTotals(row.products) || '—',
      searchValues: [
        row.code,
        row.moveType,
        row.reason,
        row.warehouse,
        row.location,
        row.targetWarehouse,
        row.owner,
        status,
        ...attachmentSearchValues(row),
        ...row.products.flatMap((product) => [productIdentity(product, '-'), productQtyWithUnit(product), product.batch]),
      ],
    };
  }),
);

const transferListRows = computed<OperationRow[]>(() =>
  transferSourceRows.value.map((row) => {
    const status = row.status;
    const lifecycleStatus = transferLifecycleStatus(status, row.reversalCode);
    return {
      page: 'transfers',
      code: row.code,
      partyTitle: row.reason,
      partySubtitle: '',
      partyFilter: row.toWarehouse,
      itemTitle: productTitle(row.products),
      itemSubtitle: otherMoveProductSubtitle(row.products),
      itemQuantity: otherMoveQuantitySummary(row.products),
      warehouseTitle: `${row.fromWarehouse} → ${row.toWarehouse}`,
      warehouseSubtitle: [
        [row.fromWarehouseCode, row.toWarehouseCode].filter(Boolean).join(' → '),
        transferTargetLocationLabel(row.toLocation),
      ].filter(Boolean).join(' · '),
      date: row.date,
      status,
      lifecycleStatus,
      operationStage: transferOperationStage(status, row.reversalCode),
      nextStep: row.reversalCode
        ? '查看冲销记录'
        : status === '待出库' && transferTargetLocationLabel(row.toLocation) === '目标库位未设置'
          ? '取消后重建'
          : warehouseNextStep({ page: 'transfers', status } as OperationRow),
      reversalCode: row.reversalCode,
      owner: row.owner,
      ownerFilter: row.owner,
      attachmentCount: attachmentCountFor(row),
      amountValue: row.products.length,
      cardValue: otherMoveQuantityTotals(row.products) || '—',
      searchValues: [
        row.code,
        row.reason,
        row.fromWarehouse,
        row.toWarehouse,
        row.toLocation,
        row.owner,
        status,
        row.reversalCode,
        row.reversalReason,
        ...attachmentSearchValues(row),
        ...row.products.flatMap((product) => [productIdentity(product, '-'), productQtyWithUnit(product), product.batch]),
      ],
    };
  }),
);

const stocktakeListRows = computed<OperationRow[]>(() =>
  stocktakeSourceRows.value.map((row) => {
    const status = row.status;
    const lifecycleStatus = stocktakeLifecycleStatus(status, row.reversalCode);
    const scopeMode = stocktakeScopeMode(row);
    return {
      page: 'stocktakes',
      code: row.code,
      partyTitle: scopeMode,
      partySubtitle: row.scopeLabel || row.scope,
      partyFilter: row.warehouse,
      itemTitle: row.plannedCount
        ? `${row.checkedCount}/${row.plannedCount} 项已盘`
        : ['已取消', '已作废'].includes(status)
          ? '未形成账面快照'
          : '待生成账面快照',
      itemSubtitle: row.plannedCount
        ? `差异 ${row.differenceCount} 项`
        : ['已取消', '已作废'].includes(status)
          ? '取消前未开始'
          : '开始盘点后生成',
      warehouseTitle: row.warehouse,
      warehouseSubtitle: row.warehouseCode || '',
      date: row.date,
      status,
      lifecycleStatus,
      operationStage: stocktakeOperationStage(status, row.reversalCode),
      postingStage: stocktakePostingStage(status, row.reversalCode),
      nextStep: warehouseNextStep({ page: 'stocktakes', status } as OperationRow),
      reversalCode: row.reversalCode,
      owner: row.owner,
      ownerFilter: row.owner,
      attachmentCount: attachmentCountFor(row),
      amountValue: row.differenceCount,
      cardValue: row.plannedCount
        ? `${row.differenceCount} 项差异`
        : ['已取消', '已作废'].includes(status)
          ? '未形成快照'
          : '待形成快照',
      searchValues: [
        row.code,
        row.warehouse,
        row.scope,
        row.owner,
        status,
        row.checkedCount,
        row.plannedCount,
        row.differenceCount,
        row.reversalCode,
        row.reversalReason,
        ...attachmentSearchValues(row),
      ],
    };
  }),
);

const operationRowsByPage = computed<Record<OperationPageKey, OperationRow[]>>(() => ({
  purchaseReceipts: purchaseReceiptListRows.value,
  salesIssues: salesIssueListRows.value,
  productionIssues: productionIssueListRows.value,
  productionReturns: productionReturnListRows.value,
  productionReceipts: productionReceiptListRows.value,
  afterSalesTasks: afterSalesTaskListRows.value,
  otherMoves: otherMoveListRows.value,
  transfers: transferListRows.value,
  stocktakes: stocktakeListRows.value,
}));

const currentOperationRows = computed(() =>
  activeOperationPage.value ? operationRowsByPage.value[activeOperationPage.value] : [],
);

const purchaseReceiptStatusFilterOrder = [
  '待收货',
  '待质检',
  '待入库',
  '部分入库',
  '异常暂收',
  '质检不合格',
  '已拒收',
  '已入库',
  '已取消',
  '已冲销',
];

function operationFilterStatus(row: OperationRow) {
  if (row.page === 'purchaseReceipts') return row.rawStatus || row.status;
  if (row.reversalCode) return '已冲销';
  return row.status;
}

const inventoryAvailabilityStatusOrder: InventoryAvailabilityStatus[] = [
  '数据异常',
  '无可用库存',
  '待转可用',
  '全部占用',
  '部分可用',
  '可用',
];

const inventoryStatusOptions = computed(() => {
  return [...new Set(inventoryGroupedRows.value
    .filter(inventoryGroupMatchesTask)
    .map((row) => row.status))]
    .sort((first, second) => (
      inventoryAvailabilityStatusOrder.indexOf(first)
      - inventoryAvailabilityStatusOrder.indexOf(second)
    ));
});

const filterStatusOptions = computed(() => {
  if (activeOperationPage.value) {
    const values = uniqueValues(currentOperationRows.value.map(operationFilterStatus));
    if (activeOperationPage.value === 'purchaseReceipts') {
      return values.sort((first, second) => {
        const firstRank = purchaseReceiptStatusFilterOrder.indexOf(first);
        const secondRank = purchaseReceiptStatusFilterOrder.indexOf(second);
        return (firstRank < 0 ? 99 : firstRank) - (secondRank < 0 ? 99 : secondRank);
      });
    }
    return values;
  }

  if (activePage.value === 'inventory') {
    return inventoryStatusOptions.value;
  }

  if (activePage.value === 'inventoryAlerts') {
    if (inventoryAlertTab.value === 'replenishment') {
      return uniqueValues(visibleReplenishmentSignals.value.map((row) => row.status));
    }
    return uniqueValues(inventoryOperationalAlerts.value
      .filter((row) => row.category === inventoryAlertTab.value)
      .map((row) => row.status));
  }

  if (activePage.value === 'stockLedger') {
    return uniqueValues(stockLedgerSourceRows.value.map(ledgerBusinessType));
  }

  return [];
});

const filterPartyOptions = computed<WarehouseFilterOption[]>(() => {
  if (activeOperationPage.value) {
    return uniqueValues(currentOperationRows.value.map((row) => row.partyFilter));
  }

  if (activePage.value === 'inventory') {
    const materials = new Map<string, WarehouseFilterOption>();
    inventorySourceRows.value.forEach((row) => {
      const value = inventoryMaterialKey(row);
      if (!materials.has(value)) {
        materials.set(value, {
          value,
          label: `${row.item} · ${row.materialCode || row.itemType}`,
        });
      }
    });
    return [...materials.values()].sort((first, second) => {
      const firstLabel = typeof first === 'string' ? first : first.label;
      const secondLabel = typeof second === 'string' ? second : second.label;
      return firstLabel.localeCompare(secondLabel, 'zh-CN');
    });
  }


  if (activePage.value === 'inventoryAlerts') {
    const materials = new Map<string, WarehouseFilterOption>();
    const addMaterial = (materialCode: string, item: string) => {
      const value = inventoryMaterialKey({ materialCode, item });
      if (!materials.has(value)) {
        materials.set(value, {
          value,
          label: `${item} · ${materialCode || '历史物料编码未登记'}`,
        });
      }
    };
    if (inventoryAlertTab.value === 'replenishment') {
      visibleReplenishmentSignals.value.forEach((row) => addMaterial(row.materialCode, row.materialName));
    } else {
      inventoryOperationalAlerts.value
        .filter((row) => row.category === inventoryAlertTab.value)
        .forEach((row) => addMaterial(row.materialCode, row.item));
    }
    return [...materials.values()].sort((first, second) => {
      const firstLabel = typeof first === 'string' ? first : first.label;
      const secondLabel = typeof second === 'string' ? second : second.label;
      return firstLabel.localeCompare(secondLabel, 'zh-CN');
    });
  }

  if (activePage.value === 'stockLedger') {
    const materials = new Map<string, WarehouseFilterOption>();
    stockLedgerSourceRows.value.forEach((row) => {
      const value = inventoryMaterialKey(row);
      if (!materials.has(value)) {
        materials.set(value, {
          value,
          label: `${row.item} · ${row.materialCode || row.itemType}`,
        });
      }
    });
    return [...materials.values()].sort((first, second) => {
      const firstLabel = typeof first === 'string' ? first : first.label;
      const secondLabel = typeof second === 'string' ? second : second.label;
      return firstLabel.localeCompare(secondLabel, 'zh-CN');
    });
  }

  return [];
});

const filterOwnerOptions = computed(() => {
  if (activeOperationPage.value) {
    return uniqueValues(currentOperationRows.value.map((row) => row.ownerFilter));
  }

  if (activePage.value === 'stockLedger') {
    const actors = new Map<string, WarehouseFilterOption>();
    stockLedgerSourceRows.value.forEach((row) => {
      const actorLabel = warehouseActorLabel(row.operator, '系统');
      if (!actors.has(actorLabel)) {
        actors.set(actorLabel, {
          value: actorLabel,
          label: actorLabel,
        });
      }
    });
    return [...actors.values()].sort((first, second) => {
      const firstLabel = typeof first === 'string' ? first : first.label;
      const secondLabel = typeof second === 'string' ? second : second.label;
      return firstLabel.localeCompare(secondLabel, 'zh-CN');
    });
  }

  return [];
});

const filterFields = computed<WarehouseFilterField[]>(() => {
  const labels = filterLabels.value;
  const fields: WarehouseFilterField[] = [];

  if (labels.status && filterStatusOptions.value.length) {
    fields.push({ key: 'status', label: labels.status, options: filterStatusOptions.value });
  }

  if (labels.party && filterPartyOptions.value.length) {
    fields.push({ key: 'party', label: labels.party, options: filterPartyOptions.value });
  }

  if (labels.owner && filterOwnerOptions.value.length) {
    fields.push({ key: 'owner', label: labels.owner, options: filterOwnerOptions.value });
  }

  return fields;
});

const visibleOperationRows = computed(() => {
  const filtered = currentOperationRows.value.filter((row) => {
    const matchesSearch = includesKeyword(row.searchValues);
    const matchesStatus = matchesStatusFilter(operationFilterStatus(row));
    const matchesParty = matchesFilterValue(row.partyFilter, filterParty.value);
    const matchesOwner = matchesFilterValue(row.ownerFilter, filterOwner.value);
    const matchesDate = matchesDateRange(row.date);
    return matchesSearch && matchesStatus && matchesParty && matchesOwner && matchesDate;
  });

  return sortRows(filtered, {
    date: (row) => row.date,
    amount: (row) => row.amountValue,
    status: (row) => row.statusSortKey || operationFilterStatus(row),
  });
});

const visibleStockLedgerRows = computed(() => {
  const filtered = stockLedgerSourceRows.value.filter((row) => {
    const matchesSearch = includesKeyword([
      row.time,
      row.item,
      row.materialCode,
      row.itemType,
      stockLedgerBatchLabel(row),
      row.warehouse,
      row.warehouseCode,
      inventoryLocationLabel(row.location),
      row.movement,
      ledgerDirectionLabel(row),
      ledgerBusinessType(row),
      row.qty,
      row.balanceFact,
      row.balance,
      row.beforeBalance,
      row.afterBalance,
      ledgerPublicSourceLine(row),
      row.documentLineId,
      row.sourceDoc,
      row.reason,
      warehouseActorLabel(row.operator, '系统'),
    ]);
    const matchesStatus = matchesStatusFilter(ledgerBusinessType(row));
    const matchesParty = matchesFilterValue(inventoryMaterialKey(row), filterParty.value);
    const matchesOwner = matchesFilterValue(warehouseActorLabel(row.operator, '系统'), filterOwner.value);
    const matchesDate = matchesDateRange(row.time);
    return matchesSearch && matchesStatus && matchesParty && matchesOwner && matchesDate;
  });

  return sortRows(filtered, {
    date: (row) => row.time,
    amount: (row) => Math.abs(parseQty(row.qty)),
    status: (row) => ledgerBusinessType(row),
  });
});

const stockLedgerPageCount = computed(() => Math.max(1, Math.ceil(visibleStockLedgerRows.value.length / stockLedgerPageSize)));
const stockLedgerCurrentPage = computed(() => Math.min(stockLedgerPage.value, stockLedgerPageCount.value));
const paginatedStockLedgerRows = computed(() => {
  const start = (stockLedgerCurrentPage.value - 1) * stockLedgerPageSize;
  return visibleStockLedgerRows.value.slice(start, start + stockLedgerPageSize);
});
const stockLedgerPageStart = computed(() => (
  visibleStockLedgerRows.value.length ? (stockLedgerCurrentPage.value - 1) * stockLedgerPageSize + 1 : 0
));
const stockLedgerPageEnd = computed(() => Math.min(stockLedgerCurrentPage.value * stockLedgerPageSize, visibleStockLedgerRows.value.length));
const stockLedgerHasRows = computed(() => visibleStockLedgerRows.value.length > 0);

function setStockLedgerPage(page: number) {
  stockLedgerPage.value = Math.min(Math.max(1, page), stockLedgerPageCount.value);
}

function inventoryGroupKey(row: WarehouseInventorySourceRow, mode: WarehouseInventoryViewMode) {
  if (mode === 'location') return `${row.warehouse}::${row.location}`;
  if (mode === 'batch') return `${row.batch || '未记录批次'}::${inventoryMaterialKey(row)}`;
  return inventoryMaterialKey(row);
}

function inventoryDetailGroupKey(row: WarehouseInventorySourceRow, mode: WarehouseInventoryViewMode) {
  if (mode === 'location') return `${inventoryMaterialKey(row)}::${row.batch || '未记录批次'}`;
  if (mode === 'batch') return `${row.warehouse}::${row.location}`;
  return `${row.warehouse}::${row.location}::${row.batch || '未记录批次'}`;
}

function inventoryGroupCopy(
  mode: WarehouseInventoryViewMode,
  key: string,
  rows: WarehouseInventorySourceRow[],
): WarehouseInventoryGroup {
  const first = rows[0];
  const latestRow = [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const matchingLedgers = stockLedgerSourceRows.value
    .filter((ledger) => {
      if (mode === 'location') return ledger.warehouse === first.warehouse && ledger.location === first.location;
      if (mode === 'batch') return ledger.batch === first.batch && inventoryMaterialMatches(ledger, first);
      return inventoryMaterialMatches(ledger, first);
    })
    .sort((a, b) => b.time.localeCompare(a.time));
  const latestLedger = matchingLedgers[0] || inventoryLatestLedger(latestRow);
  const originLedger = matchingLedgers[matchingLedgers.length - 1];
  const status = inventoryAggregateStatus(rows, mode);
  const controlSummary = inventoryControlSummary(rows);
  const controlDetail = inventoryControlDetail(rows);
  const lockedSources = uniqueValues(rows.flatMap((row) => inventoryLockedSources(row)));
  const occupationSources = aggregateInventoryOccupationSources(rows);
  const warehouseGroups = new Map<string, WarehouseInventorySourceRow[]>();
  const detailGroups = new Map<string, WarehouseInventorySourceRow[]>();

  for (const row of rows) {
    warehouseGroups.set(row.warehouse, [...(warehouseGroups.get(row.warehouse) ?? []), row]);
    const detailKey = inventoryDetailGroupKey(row, mode);
    detailGroups.set(detailKey, [...(detailGroups.get(detailKey) ?? []), row]);
  }

  const warehouseSummaries: WarehouseInventoryWarehouseSummary[] = Array.from(warehouseGroups.entries())
    .map(([warehouse, warehouseRows]) => ({
      warehouse,
      locations: uniqueValues(warehouseRows.map((row) => inventoryLocationLabel(row.location))),
      batchCount: new Set(warehouseRows.map((row) => `${inventoryMaterialKey(row)}::${row.batch || '未记录批次'}`)).size,
      onHand: inventoryQtyTotal(warehouseRows, 'onHand'),
      qualifiedOnHand: inventoryQtyTotal(warehouseRows, 'qualifiedOnHand'),
      available: inventoryQtyTotal(warehouseRows, 'available'),
      reserved: inventoryQtyTotal(warehouseRows, 'reserved'),
      allocated: inventoryQtyTotal(warehouseRows, 'allocated'),
      frozen: inventoryQtyTotal(warehouseRows, 'frozen'),
      locked: inventoryQtyTotal(warehouseRows, 'locked'),
      qcHold: inventoryQtyTotal(warehouseRows, 'qcHold'),
      pendingInbound: inventoryQtyTotal(warehouseRows, 'pendingInbound'),
      rejectedHold: inventoryQtyTotal(warehouseRows, 'rejectedHold'),
      exceptionHold: inventoryQtyTotal(warehouseRows, 'exceptionHold'),
      inTransit: inventoryQtyTotal(warehouseRows, 'inTransit'),
      inboundPlan: inventoryQtyTotal(warehouseRows, 'inboundPlan'),
      outboundPlan: inventoryQtyTotal(warehouseRows, 'outboundPlan'),
      status: inventoryAggregateStatus(warehouseRows),
    }))
    .sort((a, b) => parseQty(b.available) - parseQty(a.available));

  const detailRows: WarehouseInventoryDetailRow[] = Array.from(detailGroups.values())
    .map((detailGroup) => {
      const detailFirst = detailGroup[0];
      const detailLatest = [...detailGroup].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const detailLedger = inventoryLatestLedger(detailLatest);
      const detailMovements = stockLedgerSourceRows.value.filter((ledger) => (
        ledger.batch === detailLatest.batch
        && inventoryMaterialMatches(ledger, detailLatest)
        && ledger.warehouse === detailLatest.warehouse
        && ledger.location === detailLatest.location
      ));
      return {
        key: inventoryDetailGroupKey(detailFirst, mode),
        materialCode: detailFirst.materialCode || '',
        item: detailFirst.item,
        itemType: detailFirst.itemType,
        batch: detailFirst.batch,
        warehouse: detailFirst.warehouse,
        location: inventoryLocationLabel(detailFirst.location),
        onHand: inventoryQtyTotal(detailGroup, 'onHand'),
        qualifiedOnHand: inventoryQtyTotal(detailGroup, 'qualifiedOnHand'),
        available: inventoryQtyTotal(detailGroup, 'available'),
        reserved: inventoryQtyTotal(detailGroup, 'reserved'),
        allocated: inventoryQtyTotal(detailGroup, 'allocated'),
        frozen: inventoryQtyTotal(detailGroup, 'frozen'),
        locked: inventoryQtyTotal(detailGroup, 'locked'),
        qcHold: inventoryQtyTotal(detailGroup, 'qcHold'),
        pendingInbound: inventoryQtyTotal(detailGroup, 'pendingInbound'),
        rejectedHold: inventoryQtyTotal(detailGroup, 'rejectedHold'),
        exceptionHold: inventoryQtyTotal(detailGroup, 'exceptionHold'),
        inTransit: inventoryQtyTotal(detailGroup, 'inTransit'),
        inboundPlan: inventoryQtyTotal(detailGroup, 'inboundPlan'),
        outboundPlan: inventoryQtyTotal(detailGroup, 'outboundPlan'),
        sourceDoc: detailLedger?.sourceDoc || '-',
        qcStatus: batchQcStatus(detailLatest),
        batchDate: inventoryBatchDate(detailLatest, detailMovements),
        expiryDate: batchExpiryDate(detailLatest),
        status: inventoryAggregateStatus(detailGroup),
        updatedAt: detailLatest.updatedAt,
        lastMovement: detailLedger ? `${ledgerBusinessType(detailLedger)} ${detailLedger.sourceDoc}` : detailLatest.lastMovement,
        lockedSources: uniqueValues(detailGroup.flatMap((row) => inventoryLockedSources(row))),
        occupationSources: aggregateInventoryOccupationSources(detailGroup),
      };
    })
    .sort((a, b) => {
      const controlOrder = (detail: WarehouseInventoryDetailRow) => {
        if (hasPositiveQty(detail.rejectedHold)) return 1;
        if (hasPositiveQty(detail.exceptionHold)) return 2;
        if (hasPositiveQty(detail.qcHold)) return 3;
        if (hasPositiveQty(detail.pendingInbound) || hasPositiveQty(detail.inTransit)) return 4;
        return 9;
      };
      const statusOrder = (value: string) => ({
        数据异常: 1,
        无可用库存: 2,
        待转可用: 3,
        全部占用: 4,
        部分可用: 5,
        可用: 6,
      })[value] ?? 7;
      return controlOrder(a) - controlOrder(b)
        || statusOrder(a.status) - statusOrder(b.status)
        || b.updatedAt.localeCompare(a.updatedAt);
    });

  const itemCount = new Set(rows.map(inventoryMaterialKey)).size;
  const batchCount = new Set(rows.map((row) => `${inventoryMaterialKey(row)}::${row.batch || '未记录批次'}`)).size;
  const locationCount = uniqueValues(rows.map((row) => row.location)).length;
  const itemType = itemCount > 1 ? '多物料' : first.itemType;
  const onHand = inventoryQtyTotal(rows, 'onHand');
  const qualifiedOnHand = inventoryQtyTotal(rows, 'qualifiedOnHand');
  const available = inventoryQtyTotal(rows, 'available');
  const reserved = inventoryQtyTotal(rows, 'reserved');
  const allocated = inventoryQtyTotal(rows, 'allocated');
  const frozen = inventoryQtyTotal(rows, 'frozen');
  const locked = inventoryQtyTotal(rows, 'locked');
  const qcHold = inventoryQtyTotal(rows, 'qcHold');
  const pendingInbound = inventoryQtyTotal(rows, 'pendingInbound');
  const rejectedHold = inventoryQtyTotal(rows, 'rejectedHold');
  const exceptionHold = inventoryQtyTotal(rows, 'exceptionHold');
  const inTransit = inventoryQtyTotal(rows, 'inTransit');
  const inboundPlan = inventoryQtyTotal(rows, 'inboundPlan');
  const outboundPlan = inventoryQtyTotal(rows, 'outboundPlan');
  const batchQualityStatuses = uniqueValues(rows.map(batchQcStatus));
  const qcStatus = batchQualityStatuses.includes('不合格隔离')
    ? '不合格隔离'
    : batchQualityStatuses.includes('异常暂存')
      ? '异常暂存'
      : batchQualityStatuses.includes('待检')
        ? '待检'
    : batchQualityStatuses.length === 1
      ? batchQualityStatuses[0]
      : batchQualityStatuses.join(' / ');
  const batchDate = mode === 'batch' ? inventoryBatchGroupDate(rows, matchingLedgers) : '';
  const expiryDate = mode === 'batch' ? inventoryBatchGroupExpiryDate(rows) : '';
  const originSources = uniqueValues(matchingLedgers.map((ledger) => ledger.sourceDoc).filter(Boolean));
  const originSource = mode === 'batch'
    ? (!first.batch && originSources.length > 1
      ? `${originSources.length} 个来源单据`
      : originLedger?.sourceDoc || (latestRow.lastMovement === '期初库存' ? '期初库存' : '来源未关联'))
    : '';
  const originPath = mode === 'batch' && (!first.batch && originSources.length > 1)
    ? ''
    : originLedger?.sourceDoc ? warehouseSourcePath(originLedger.sourceDoc, originLedger.reason) : '';
  const batchDisplayLabel = afterSalesBatchLabel(first.batch, originSource, '未记录批次');
  const batchSourceHint = ['未记录批次', '历史批次未登记'].includes(batchDisplayLabel)
    ? ` · 来源 ${originSource}`
    : '';

  const copyByMode: Record<
    WarehouseInventoryViewMode,
    Pick<
      WarehouseInventoryGroup,
      'title' | 'subtitle' | 'subjectLabel' | 'distributionTitle' | 'distributionHint' | 'detailTitle' | 'detailHint'
    >
  > = {
    item: {
      title: first.item,
      subtitle: `${first.materialCode || first.itemType} · ${first.itemType} · ${warehouseSummaries.length} 仓 · ${batchCount} 批 · ${locationCount} 库位`,
      subjectLabel: '当前物料',
      distributionTitle: '仓库分布',
      distributionHint: '按仓库汇总余额、占用和待处理数量',
      detailTitle: '批次/库位',
      detailHint: `${detailRows.length} 条明细，含效期、质检和来源`,
    },
    location: {
      title: `${first.warehouse} / ${inventoryLocationLabel(first.location)}`,
      subtitle: `${itemCount} 种物料 · ${batchCount} 批 · 可用 ${available}`,
      subjectLabel: '当前库位',
      distributionTitle: '仓库口径',
      distributionHint: '当前位置所属仓库的库存状态',
      detailTitle: '物料/批次',
      detailHint: `${detailRows.length} 条明细，查看该库位有哪些物料`,
    },
    batch: {
      title: batchDisplayLabel,
      subtitle: `${first.item} · ${first.materialCode || first.itemType} · ${warehouseSummaries.length} 仓 · ${locationCount} 库位 · 可用 ${available}${batchSourceHint}`,
      subjectLabel: '当前批次',
      distributionTitle: '批次分布',
      distributionHint: '按仓库查看该批次剩余库存',
      detailTitle: '仓库/库位',
      detailHint: `${detailRows.length} 条分布，查看该批次在哪些位置`,
    },
  };

  const copy = copyByMode[mode];

  return {
    key: `${mode}::${key}`,
    mode,
    ...copy,
    item: first.item,
    materialCode: first.materialCode || '',
    itemType,
    scopeWarehouse: mode === 'location' ? first.warehouse : '',
    scopeLocation: mode === 'location' ? first.location : '',
    scopeBatch: mode === 'batch' ? first.batch : '',
    onHand,
    qualifiedOnHand,
    available,
    reserved,
    allocated,
    frozen,
    locked,
    qcHold,
    pendingInbound,
    rejectedHold,
    exceptionHold,
    inTransit,
    inboundPlan,
    outboundPlan,
    status,
    updatedAt: latestRow.updatedAt,
    lastMovement: latestLedger ? `${ledgerBusinessType(latestLedger)} ${latestLedger.sourceDoc}` : latestRow.lastMovement,
    itemCount,
    warehouseCount: warehouseSummaries.length,
    batchCount,
    locationCount,
    attentionCount: detailRows.filter((detail) => (
      detail.status !== '可用'
      || Boolean(inventoryDetailControlledText(detail))
      || parseQty(detail.locked) > 0
      || parseQty(detail.outboundPlan) > 0
    )).length,
    availabilitySummary: inventoryAvailabilitySummary(rows, mode, status),
    controlSummary,
    controlDetail,
    sourceSummary: latestLedger?.sourceDoc || latestRow.lastMovement || '-',
    batchDate,
    expiryDate,
    qcStatus,
    originSource,
    originPath,
    movementCount: matchingLedgers.length,
    warehouseSummaries,
    detailRows,
    lockedSources,
    occupationSources,
    searchValues: [
      inventoryViewLabel(mode),
      copy.title,
      copy.subtitle,
      first.item,
      ...uniqueValues(rows.map((row) => row.materialCode)),
      itemType,
      first.warehouse,
      first.location,
      inventoryLocationLabel(first.location),
      afterSalesBatchLabel(first.batch, originSource, '未记录批次'),
      batchCount,
      locationCount,
      status,
      inventoryAvailabilitySummary(rows, mode, status),
      controlSummary,
      controlDetail,
      latestLedger?.sourceDoc,
      originSource,
      batchDate,
      expiryDate,
      qcStatus,
      latestRow.lastMovement,
      ...warehouseSummaries.flatMap((row) => [row.warehouse, row.available, row.locations.join('、'), row.status]),
      ...detailRows.flatMap((row) => [
        row.item,
        row.itemType,
        row.location,
        row.warehouse,
        inventoryDetailBatchLabel(row),
        row.onHand,
        row.available,
        row.locked,
        row.qcHold,
        row.rejectedHold,
        row.exceptionHold,
        row.inboundPlan,
        row.outboundPlan,
        row.sourceDoc,
        row.qcStatus,
        row.expiryDate,
        row.status,
        row.lastMovement,
        ...row.lockedSources,
        row.updatedAt,
      ]),
    ],
  };
}

const visibleReplenishmentSignals = computed(() => {
  const statusRank: Record<string, number> = {
    库存告急: 1,
    需补货: 2,
    补货处理中: 3,
    在途覆盖: 4,
  };
  return replenishmentSourceRows.value
    .filter((row) => row.status !== '正常')
    .sort((first, second) => (
      (statusRank[first.status] ?? 99) - (statusRank[second.status] ?? 99)
      || second.updatedAt.localeCompare(first.updatedAt)
    ));
});

const replenishmentStatusSummary = computed(() => (
  ['库存告急', '需补货', '补货处理中', '在途覆盖']
    .map((status) => ({
      status,
      count: visibleReplenishmentSignals.value.filter((row) => row.status === status).length,
    }))
    .filter((entry) => entry.count > 0)
));

function operationalAlertBase(row: WarehouseInventorySourceRow) {
  return {
    item: row.item,
    materialCode: row.materialCode || row.itemType,
    warehouse: row.warehouse,
    location: inventoryLocationLabel(row.location),
    batch: afterSalesBatchLabel(row.batch, '', '未记录批次'),
    updatedAt: row.updatedAt,
  };
}

const inventoryOperationalAlerts = computed<WarehouseInventoryOperationalAlert[]>(() => {
  const alerts: WarehouseInventoryOperationalAlert[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  inventorySourceRows.value.forEach((row, index) => {
    const base = operationalAlertBase(row);
    const controlledFacts = [
      { label: '不合格隔离', value: parseQty(row.rejectedHold), tone: '不合格隔离' },
      { label: '异常暂存', value: parseQty(row.exceptionHold), tone: '异常暂存' },
      { label: '待检', value: parseQty(row.qcHold), tone: '待检' },
      { label: '待正式入库', value: parseQty(row.pendingInbound), tone: '待入库' },
    ].filter((fact) => fact.value > 0);
    if (controlledFacts.length) {
      const unit = row.uom || qtyUnit(row.onHand);
      const quantity = controlledFacts.reduce((sum, fact) => sum + fact.value, 0);
      const reason = controlledFacts.map((fact) => `${fact.label} ${formatQty(fact.value, unit)}`).join('；');
      alerts.push({
        key: `controlled-${row.key || index}`,
        category: 'controlled',
        status: controlledFacts[0].tone,
        ...base,
        quantity: formatQty(quantity, unit),
        quantityLabel: '待处理数量',
        reason,
        searchValues: [row.item, row.materialCode, row.warehouse, row.location, row.batch, reason],
      });
    }

    if (row.expiryDate && parseQty(row.onHand) > 0) {
      const expiry = new Date(`${row.expiryDate}T00:00:00`);
      const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
      if (Number.isFinite(days) && days <= 90) {
        const status = days < 0 ? '已过期' : days <= 30 ? '30天内到期' : '90天内到期';
        const reason = days < 0 ? `已过期 ${Math.abs(days)} 天` : `距到期 ${days} 天`;
        alerts.push({
          key: `expiry-${row.key || index}`,
          category: 'expiry',
          status,
          ...base,
          quantity: row.onHand,
          quantityLabel: '涉及库存',
          reason: `${row.expiryDate} · ${reason}`,
          searchValues: [row.item, row.materialCode, row.warehouse, row.location, row.batch, status, reason],
        });
      }
    }

    const anomalyReasons = [
      ...inventoryBalanceAnomalyReasons(row),
      !String(row.location || '').trim() ? '未关联库位' : '',
    ].filter(Boolean);
    if (anomalyReasons.length) {
      const reason = anomalyReasons.join('；');
      alerts.push({
        key: `anomaly-${row.key || index}`,
        category: 'anomaly',
        status: '数据异常',
        ...base,
        quantity: row.onHand,
        quantityLabel: '物理在库',
        reason,
        searchValues: [row.item, row.materialCode, row.warehouse, row.location, row.batch, reason],
      });
    }
  });

  return alerts;
});

const inventoryAlertCounts = computed<Record<WarehouseInventoryAlertTab, number>>(() => ({
  replenishment: visibleReplenishmentSignals.value.length,
  controlled: inventoryOperationalAlerts.value.filter((row) => row.category === 'controlled').length,
  expiry: inventoryOperationalAlerts.value.filter((row) => row.category === 'expiry').length,
  anomaly: inventoryOperationalAlerts.value.filter((row) => row.category === 'anomaly').length,
}));
function inventoryAlertCountDisplay(tab: WarehouseInventoryAlertTab) {
  const ready = tab === 'replenishment' ? apiReplenishmentRows.value !== null : apiInventoryRows.value !== null;
  return ready ? inventoryAlertCounts.value[tab] : '—';
}

function replenishmentGapRatio(row: WarehouseReplenishmentSignal) {
  const target = Math.max(row.maxStock, row.reorderPoint, 0);
  if (target <= 0) return 0;
  return Math.max(0, row.suggestedQty) / target;
}

function inventoryAlertInventoryQuery(alert: WarehouseInventoryOperationalAlert) {
  const query: Record<string, string> = {
    keyword: alert.materialCode || alert.item,
  };
  if (alert.category === 'controlled') query.task = 'receiving';
  if (alert.category === 'expiry') query.task = 'batch';
  if (alert.batch !== '未记录批次') query.view = 'batch';
  return query;
}

const visibleAlertReplenishmentSignals = computed(() => sortRows(
  visibleReplenishmentSignals.value.filter((row) => {
    const matchesSearch = includesKeyword([
      row.code,
      row.materialName,
      row.materialCode,
      row.warehouseName,
      row.status,
      row.message,
      row.linkedDocument?.code,
      row.linkedDocument?.type,
    ]);
    return matchesSearch
      && matchesStatusFilter(row.status)
      && matchesFilterValue(inventoryMaterialKey({ materialCode: row.materialCode, item: row.materialName }), filterParty.value)
      && matchesDateRange(row.updatedAt);
  }),
  {
    date: (row) => row.updatedAt,
    amount: replenishmentGapRatio,
    status: (row) => row.status,
  },
));

const visibleInventoryOperationalAlerts = computed(() => sortRows(
  inventoryOperationalAlerts.value
    .filter((row) => row.category === inventoryAlertTab.value)
    .filter((row) => (
      includesKeyword(row.searchValues)
      && matchesStatusFilter(row.status)
      && matchesFilterValue(inventoryMaterialKey({ materialCode: row.materialCode, item: row.item }), filterParty.value)
      && matchesDateRange(row.updatedAt)
    )),
  {
    date: (row) => row.updatedAt,
    status: (row) => row.status,
  },
));

const inventoryPartySourceRows = computed(() =>
  inventorySourceRows.value.filter(
    (row) => !filterParty.value
      || inventoryMaterialKey(row) === filterParty.value
      || row.item === filterParty.value,
  ),
);

const inventoryGroupedRows = computed(() => {
  const groups = new Map<string, WarehouseInventorySourceRow[]>();

  for (const row of inventoryPartySourceRows.value) {
    const key = inventoryGroupKey(row, inventoryViewMode.value);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return Array.from(groups.entries())
    .map(([key, rows]) => inventoryGroupCopy(inventoryViewMode.value, key, rows));
});

function inventoryGroupMatchesTask(row: WarehouseInventoryGroup) {
  if (inventoryTaskView.value === 'receiving') {
    return hasPositiveQty(row.qcHold)
      || hasPositiveQty(row.pendingInbound)
      || hasPositiveQty(row.rejectedHold)
      || hasPositiveQty(row.exceptionHold)
      || hasPositiveQty(row.inTransit);
  }
  if (inventoryTaskView.value === 'shipping') {
    return hasPositiveQty(row.qualifiedOnHand)
      || hasPositiveQty(row.locked)
      || hasPositiveQty(row.outboundPlan);
  }
  return true;
}

function inventoryGroupSortStatus(row: WarehouseInventoryGroup) {
  const controls = row.controlDetail;
  if (controls.includes('含不合格隔离')) return '含不合格隔离';
  if (controls.includes('含异常暂存')) return '含异常暂存';
  if (controls.includes('含待检')) return '含待检';
  if (controls.includes('含待正式入库')) return '含待正式入库';
  if (controls.includes('含调拨在途')) return '含调拨在途';
  return row.status;
}

function reconcileInventoryStatusFilter() {
  const selectedStatuses = statusFilterValues(filterStatus.value);
  if (!selectedStatuses.length) return;
  const allowedStatuses = new Set<string>(inventoryStatusOptions.value);
  const retainedStatuses = selectedStatuses.filter((status) => allowedStatuses.has(status));
  const nextStatus = retainedStatuses.join(statusFilterSeparator);
  if (nextStatus === filterStatus.value) return;
  updateCurrentFilters({ ...currentFilters.value, status: nextStatus });
  draftFilters.value = { ...draftFilters.value, status: nextStatus };
}

const visibleInventoryRows = computed(() => {
  let groupedRows = inventoryGroupedRows.value.filter((row) => (
    inventoryGroupMatchesTask(row)
    && matchesStatusFilter(row.status)
    && matchesDateRange(row.updatedAt)
    && includesKeyword(row.searchValues)
  ));

  return sortRows(groupedRows, {
    date: (row) => row.updatedAt,
    amount: (row) => row.mode === 'location' ? row.itemCount : parseQty(row.available),
    status: inventoryGroupSortStatus,
  });
});

const currentInventoryViewOption = computed(
  () => inventoryViewOptions.find((option) => option.key === inventoryViewMode.value) ?? inventoryViewOptions[0],
);
const currentInventoryTaskOption = computed(
  () => inventoryTaskViewOptions.find((option) => option.key === inventoryTaskView.value) ?? inventoryTaskViewOptions[0],
);
const inventorySubjectHeader = computed(() => {
  if (inventoryViewMode.value === 'location') return '仓库 / 库位';
  if (inventoryViewMode.value === 'batch') return '批次 / 物料';
  return '物料 / 编码';
});

const selectedInventoryRow = computed(() => {
  return visibleInventoryRows.value.find((row) => row.key === selectedInventoryKey.value) ?? visibleInventoryRows.value[0];
});

watch(visibleInventoryRows, (rows) => {
  if (!rows.length) {
    selectedInventoryKey.value = '';
    return;
  }

  if (!rows.some((row) => row.key === selectedInventoryKey.value)) {
    selectedInventoryKey.value = rows[0].key;
  }
});

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2200);
}

function replenishmentActionTitle(signal: WarehouseReplenishmentSignal, routeType: '采购申请' | '生产任务') {
  if (startingReplenishmentCode.value === signal.code) return '正在生成补货单据，请稍候';
  if (!canStartReplenishment.value) return warehouseReplenishReadonlyReason.value;
  return routeType === '采购申请'
    ? `按建议数量 ${formatQty(signal.suggestedQty, signal.uom)} 提交采购补货请求`
    : `按建议数量 ${formatQty(signal.suggestedQty, signal.uom)} 提交生产补货请求`;
}

async function handleStartReplenishment(
  signal: WarehouseReplenishmentSignal,
  routeType: '采购申请' | '生产任务',
) {
  if (!canStartReplenishment.value) {
    showToast(warehouseReplenishReadonlyReason.value, 'error');
    return;
  }
  if (startingReplenishmentCode.value) return;

  startingReplenishmentCode.value = signal.code;
  try {
    const result = await startWarehouseReplenishment(signal.code, routeType);
    showToast(
      result.repeated
        ? `${result.document.code} 已在处理中`
        : `补货请求已提交，后续单据 ${result.document.code} 由${result.document.type === '采购申请' ? '采购' : '生产'}继续处理`,
    );
    apiReplenishmentRows.value = await listWarehouseReplenishments();
  } catch (error) {
    showToast(error instanceof Error ? error.message : '发起补货失败', 'error');
  } finally {
    startingReplenishmentCode.value = '';
  }
}

function toggleToolbarMenu(menu: ToolbarMenuKey) {
  const shouldOpen = openToolbarMenu.value !== menu;
  openToolbarMenu.value = shouldOpen ? menu : null;

  if (menu === 'filter' && shouldOpen) {
    syncDraftFilters();
  }
}

function closeToolbarMenu() {
  openToolbarMenu.value = null;
}

function setSortMode(mode: SortMode) {
  sortMode.value = mode;
  closeToolbarMenu();
}

function resetBusinessFilters() {
  const emptyFilters = emptyBusinessFilters();
  updateCurrentFilters(emptyFilters);
  draftFilters.value = cloneBusinessFilters(emptyFilters);
  showToast('已清空筛选条件');
}

function applyAndCloseFilters() {
  updateCurrentFilters(draftFilters.value);
  openToolbarMenu.value = null;
  showToast('已应用当前筛选条件');
}

function clearListConstraints() {
  searchKeyword.value = '';
  resetBusinessFilters();
  showToast('已清空搜索和筛选条件');
  openToolbarMenu.value = null;
  if (route.query.keyword !== undefined) {
    const query = { ...route.query };
    delete query.keyword;
    void router.replace({ query });
  }
}

function closeFloatingMenus() {
  closeToolbarMenu();
}

function warehouseNextStep(row: OperationRow) {
  if (row.reversalCode) return `已冲销 · ${row.reversalCode}`;
  if (row.nextStep) return row.nextStep;
  const map: Partial<Record<OperationPageKey, Record<string, string>>> = {
    purchaseReceipts: {
      草稿: '补齐来源和收货信息',
      待收货: '登记到货结果',
      待质检: '等待来料质检',
      待入库: '登记入库',
      部分入库: '登记入库',
      异常暂收: '等待采购处理',
      已拒收: '查看拒收记录',
      质检不合格: '等待质量处置',
      已入库: '查看库存流水',
      已取消: '查看取消记录',
      已冲销: '查看冲销记录',
    },
    salesIssues: {
      待拣货: '登记拣货',
      待复核: '确认出库',
      已出库: '查看库存流水',
    },
    productionIssues: {
      草稿: '等待生产提交',
      待出库: '确认生产领料出库',
      已完成: '查看库存流水',
    },
    productionReturns: {
      草稿: '等待退料提交',
      待入库: '确认退料入库',
      已完成: '查看库存流水',
    },
    productionReceipts: {
      草稿: '等待完工提交',
      待入库: '确认完工入库',
      已完成: '查看库存流水',
    },
    otherMoves: {
      草稿: '提交审核',
      待审核: '审核用途和数量',
      待过账: '确认库存变动',
      已过账: '查看库存流水',
    },
    transfers: {
      草稿: '提交调拨',
      待出库: '确认调出',
      调拨中: '确认调入',
      待入库: '确认调入',
      已完成: '查看库存流水',
      已取消: '查看取消记录',
      已作废: '查看取消记录',
    },
    stocktakes: {
      待盘点: '开始盘点',
      盘点中: '提交复核',
      待复核: '复核差异',
      已完成: '查看盘点结果',
      已取消: '查看取消记录',
      已作废: '查看取消记录',
    },
  };

  return map[row.page]?.[row.status] ?? '查看详情';
}

function warehouseStatusLabel(row: OperationRow) {
  return ['otherMoves', 'transfers', 'stocktakes'].includes(row.page)
    ? row.lifecycleStatus || row.status
    : row.status;
}

function warehouseStatusFacts(row: OperationRow) {
  if (row.page === 'purchaseReceipts') {
    return [
      { label: '质检', value: row.qualityProgress || '无需质检' },
      { label: '入库', value: row.inboundProgress || '未开始' },
    ];
  }

  if (row.page === 'salesIssues') return [];
  if (row.page === 'productionIssues') return [{ label: '领料', value: row.operationStage || row.status }];
  if (row.page === 'productionReturns') return [{ label: '退料', value: row.operationStage || row.status }];
  if (row.page === 'productionReceipts') return [{ label: '入库', value: row.operationStage || row.status }];
  if (row.page === 'otherMoves') {
    return [
      { label: '审批', value: row.approvalStage || '未提交' },
      { label: '库存', value: row.postingStage || '未过账' },
    ];
  }
  if (row.page === 'transfers') return [{ label: '调拨', value: row.operationStage || row.status }];
  if (row.page === 'stocktakes') return [{ label: '盘点', value: row.operationStage || row.status }];
  return [];
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportRows() {
  if (activeOperationPage.value) {
    const headers = currentOperationHeaders.value;
    if (activeOperationPage.value === 'purchaseReceipts') {
      return [
        [
          headers.code,
          '供应商',
          '来源单据',
          '物料',
          '当前任务数量',
          '暂存口径',
          '暂存仓',
          '暂存库位',
          '日期类型',
          headers.date,
          '到货登记人',
          '任务状态',
          '质检状态',
          '入库状态',
          '时效提醒',
          '下一步',
          '附件数',
        ],
        ...visibleOperationRows.value.map((row) => [
          row.code,
          row.partyTitle,
          row.partySubtitle,
          `${row.itemTitle} ${row.itemSubtitle}`,
          row.itemQuantity || '',
          row.warehouseContext || '',
          row.warehouseTitle,
          row.warehouseSubtitle,
          row.dateContext || '',
          row.date,
          row.owner,
          row.status,
          row.qualityProgress || '',
          row.inboundProgress || '',
          row.dateAttention || '',
          warehouseNextStep(row),
          row.attachmentCount,
        ]),
      ];
    }
    if (activeOperationPage.value === 'salesIssues') {
      return [
        [
          headers.code,
          '客户',
          '销售订单',
          '物料',
          '当前任务数量',
          '实际出库仓',
          '交付方式',
          '日期类型',
          headers.date,
          headers.owner,
          '时效提醒',
          '任务状态',
          '当前待办',
          '附件数',
        ],
        ...visibleOperationRows.value.map((row) => [
          row.code,
          row.partyTitle,
          row.partySubtitle,
          `${row.itemTitle} ${row.itemSubtitle}`,
          row.itemQuantity || '',
          ['拣货时选择', '—'].includes(row.warehouseTitle) ? '' : row.warehouseTitle,
          row.warehouseSubtitle,
          row.dateContext || '',
          row.date,
          row.owner,
          row.dateAttention || '',
          row.status,
          warehouseNextStep(row),
          row.attachmentCount,
        ]),
      ];
    }
    return [
      [headers.code, headers.party, headers.item, headers.warehouse, headers.date, headers.owner, '附件数', headers.status, '下一步'],
      ...visibleOperationRows.value.map((row) => [
        row.code,
        `${row.partyTitle} ${row.partySubtitle}`,
        [row.itemTitle, row.itemSubtitle, row.itemQuantity].filter(Boolean).join(' '),
        `${row.warehouseTitle} ${row.warehouseSubtitle}`,
        row.date,
        row.owner,
        row.attachmentCount,
        warehouseStatusLabel(row),
        warehouseNextStep(row),
      ]),
    ];
  }

  if (activePage.value === 'inventory') {
    return [
      [
        '查询视角',
        '主体',
        '摘要',
        '物料数',
        '仓库数',
        '批次数',
        '库位数',
        '物理在库',
        '合格在库',
        '可用数量',
        '销售预留',
        '生产分配',
        '冻结',
        '占用合计',
        '待检',
        '待正式入库',
        '不合格隔离',
        '异常暂存',
        '调拨在途',
        '计划入库',
        '待出库计划',
        '占用来源',
        '仓库分布',
        '批次/库位明细',
        '可用性说明',
        '受控提示',
        '库存可用性',
        '最近变动',
        '更新时间',
      ],
      ...visibleInventoryRows.value.map((row) => [
        inventoryViewLabel(row.mode),
        row.title,
        row.subtitle,
        row.itemCount,
        row.warehouseCount,
        row.batchCount,
        row.locationCount,
        row.onHand,
        row.qualifiedOnHand,
        row.available,
        row.reserved,
        row.allocated,
        row.frozen,
        row.locked,
        row.qcHold,
        row.pendingInbound,
        row.rejectedHold,
        row.exceptionHold,
        row.inTransit,
        row.inboundPlan,
        row.outboundPlan,
        row.occupationSources.map(occupationSourceText).join('；'),
        row.warehouseSummaries
          .map((warehouse) => `${warehouse.warehouse} 可用 ${warehouse.available}，${warehouse.batchCount} 批，${warehouse.locations.length} 库位`)
          .join('；'),
        row.detailRows
          .map((detail) => `${detail.item} ${detail.warehouse}/${detail.location}/${inventoryDetailBatchLabel(detail)} 可用 ${detail.available}，${detail.qcStatus}，${detail.expiryDate}`)
          .join('；'),
        row.availabilitySummary,
        row.controlDetail,
        row.status,
        row.lastMovement,
        row.updatedAt,
      ]),
    ];
  }

  if (activePage.value === 'inventoryAlerts') {
    if (inventoryAlertTab.value === 'replenishment') {
      return [
        ['补货关系号', '预警状态', '物料编码', '物料', '仓库', '当前可用', '待正式入库', '在途', '预计可用', '安全库存', '补货点', '最高库存', '建议补货', '补货路线', '关联单据', '更新时间'],
        ...visibleAlertReplenishmentSignals.value.map((row) => [
          row.code,
          row.status,
          row.materialCode,
          row.materialName,
          row.warehouseName,
          formatQty(row.availableQty, row.uom),
          formatQty(row.pendingInboundQty, row.uom),
          formatQty(row.inTransitQty, row.uom),
          formatQty(row.projectedQty, row.uom),
          formatQty(row.safetyStock, row.uom),
          formatQty(row.reorderPoint, row.uom),
          formatQty(row.maxStock, row.uom),
          formatQty(row.suggestedQty, row.uom),
          row.availableRoutes.join(' / '),
          row.linkedDocument ? `${row.linkedDocument.type} ${row.linkedDocument.code}` : '',
          row.updatedAt,
        ]),
      ];
    }
    return [
      ['预警状态', '物料编码', '物料', '仓库', '库位', '批次', '数量口径', '数量', '原因', '更新时间'],
      ...visibleInventoryOperationalAlerts.value.map((row) => [
        row.status,
        row.materialCode,
        row.item,
        row.warehouse,
        row.location,
        row.batch,
        row.quantityLabel,
        row.quantity,
        row.reason,
        row.updatedAt,
      ]),
    ];
  }

  if (activePage.value === 'stockLedger') {
    return [
      ['发生时间', '物料/成品', '物料编码', '物料分类', '批次', '仓库', '仓库编码', '库位', '业务类型', '变动方向', '数量', '余额事实', '变动前', '变动后', '来源单据', '来源行', '单据行', '说明', '经办人'],
      ...visibleStockLedgerRows.value.map((row) => [
        row.time,
        row.item,
        row.materialCode || '',
        row.itemType,
        stockLedgerBatchLabel(row),
        row.warehouse,
        row.warehouseCode || '',
        inventoryLocationLabel(row.location),
        ledgerBusinessType(row),
        ledgerDirectionLabel(row),
        row.qty,
        row.balanceFact || '物理在库',
        row.beforeBalance || '',
        row.afterBalance || row.balance,
        row.sourceDoc,
        ledgerPublicSourceLine(row),
        row.documentLineId || '',
        row.reason,
        row.operator,
      ]),
    ];
  }

  return [];
}

function exportVisibleRows() {
  const rows = exportRows();

  if (rows.length <= 1) {
    showToast('当前没有可导出的数据');
    closeToolbarMenu();
    return;
  }

  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${pageTitle.value}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  closeToolbarMenu();
  showToast('已导出当前筛选结果');
}

function handleDocumentClick() {
  closeFloatingMenus();
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && inventoryCompactDetailOpen.value) closeInventoryDetail();
}

function clearCurrentWarehouseRows(page: ActiveWarehouseTabKey, failed = false) {
  const emptyValue = failed ? [] : null;
  if (page === 'purchaseReceipts') apiPurchaseReceiptRows.value = emptyValue;
  if (page === 'salesIssues') apiSalesIssueRows.value = emptyValue;
  if (page === 'otherMoves') apiOtherMoveRows.value = emptyValue;
  if (page === 'productionIssues') apiProductionIssueRows.value = emptyValue;
  if (page === 'productionReturns') apiProductionReturnRows.value = emptyValue;
  if (page === 'productionReceipts') apiProductionReceiptRows.value = emptyValue;
  if (page === 'afterSalesTasks') apiAfterSalesTaskRows.value = emptyValue;
  if (page === 'transfers') apiTransferRows.value = emptyValue;
  if (page === 'stocktakes') apiStocktakeRows.value = emptyValue;
  if (page === 'inventory') {
    apiInventoryRows.value = emptyValue;
    apiStockLedgerRows.value = emptyValue;
  }
  if (page === 'inventoryAlerts') {
    apiInventoryRows.value = emptyValue;
    apiReplenishmentRows.value = emptyValue;
  }
  if (page === 'stockLedger') apiStockLedgerRows.value = emptyValue;
}

async function loadCurrentWarehouseList() {
  const page = activePage.value;
  const requestId = ++listLoadRequestId;
  listLoadError.value = '';

  isListLoading.value = true;
  clearCurrentWarehouseRows(page);

  try {
    if (page === 'purchaseReceipts') {
      const rows = await listPurchaseReceipts();
      if (requestId !== listLoadRequestId) return;
      apiPurchaseReceiptRows.value = rows;
    } else if (page === 'productionIssues') {
      const rows = await listProductionMaterialIssues();
      if (requestId !== listLoadRequestId) return;
      apiProductionIssueRows.value = rows;
    } else if (page === 'productionReturns') {
      const rows = await listProductionReturns();
      if (requestId !== listLoadRequestId) return;
      apiProductionReturnRows.value = rows;
    } else if (page === 'productionReceipts') {
      const rows = await listProductionReceipts();
      if (requestId !== listLoadRequestId) return;
      apiProductionReceiptRows.value = rows;
    } else if (page === 'afterSalesTasks') {
      const rows = await listAfterSalesExecutionTasks('warehouse');
      if (requestId !== listLoadRequestId) return;
      apiAfterSalesTaskRows.value = rows;
    } else if (page === 'salesIssues') {
      const rows = await listSalesIssues();
      if (requestId !== listLoadRequestId) return;
      apiSalesIssueRows.value = rows;
    } else if (page === 'otherMoves') {
      const rows = await listWarehouseOtherMoves();
      if (requestId !== listLoadRequestId) return;
      apiOtherMoveRows.value = rows;
    } else if (page === 'transfers') {
      const rows = await listWarehouseTransfers();
      if (requestId !== listLoadRequestId) return;
      apiTransferRows.value = rows;
    } else if (page === 'stocktakes') {
      const rows = await listWarehouseStocktakes();
      if (requestId !== listLoadRequestId) return;
      apiStocktakeRows.value = rows;
    } else if (page === 'inventory') {
      const inventoryRequest = listWarehouseInventory() as Promise<WarehouseInventorySourceRow[]>;
      const ledgerRequest = listStockLedger() as Promise<StockLedgerRow[]>;
      const rows = await inventoryRequest;
      if (requestId !== listLoadRequestId) return;
      apiInventoryRows.value = rows;
      try {
        const ledgerRows = await ledgerRequest;
        if (requestId !== listLoadRequestId) return;
        apiStockLedgerRows.value = ledgerRows;
      } catch {
        if (requestId !== listLoadRequestId) return;
        apiStockLedgerRows.value = [];
        showToast('库存余额已加载，库存流水暂不可用，可刷新重试', 'error');
      }
    } else if (page === 'inventoryAlerts') {
      const [rows, replenishmentRows] = await Promise.all([
        listWarehouseInventory() as Promise<WarehouseInventorySourceRow[]>,
        listWarehouseReplenishments(),
      ]);
      if (requestId !== listLoadRequestId) return;
      apiInventoryRows.value = rows;
      apiReplenishmentRows.value = replenishmentRows;
    } else if (page === 'stockLedger') {
      const rows = (await listStockLedger()) as StockLedgerRow[];
      if (requestId !== listLoadRequestId) return;
      apiStockLedgerRows.value = rows;
    }
  } catch (error) {
    if (requestId !== listLoadRequestId) return;
    clearCurrentWarehouseRows(page, true);
    listLoadError.value = error instanceof Error ? error.message : `${pageTitle.value}加载失败`;
  } finally {
    if (requestId === listLoadRequestId) isListLoading.value = false;
  }
}

watch(searchKeyword, () => {
  window.clearTimeout(inventoryKeywordTimer);
  if (!['inventory', 'stockLedger'].includes(activePage.value)) return;
  inventoryKeywordTimer = window.setTimeout(syncWarehouseListKeywordQuery, 250);
});

watch(
  [searchKeyword, sortMode, filterStatus, filterParty, filterOwner, filterDateStart, filterDateEnd],
  () => {
    if (activePage.value === 'stockLedger') stockLedgerPage.value = 1;
  },
);

watch(
  () => route.fullPath,
  (currentFullPath, previousFullPath) => {
    const currentPath = currentFullPath.split('?')[0];
    const previousPath = previousFullPath?.split('?')[0] || '';
    const inventoryQueryOnlyChange = currentPath === '/warehouse/inventory' && previousPath === currentPath;
    const inventoryAlertQueryOnlyChange = currentPath === '/warehouse/inventory-alerts' && previousPath === currentPath;
    const stockLedgerQueryOnlyChange = currentPath === '/warehouse/stock-ledger' && previousPath === currentPath;
    searchKeyword.value = routeKeywordValue();
    if (activePage.value === 'inventory') {
      inventoryViewMode.value = routeInventoryViewMode();
      inventoryTaskView.value = routeInventoryTaskView();
      if (inventoryViewMode.value !== 'location' && sortMode.value === 'amountDesc') sortMode.value = 'status';
      reconcileInventoryStatusFilter();
      resetInventoryTableScroll();
    }
    if (activePage.value === 'inventoryAlerts') {
      inventoryAlertTab.value = routeInventoryAlertTab();
    }
    syncDraftFilters();
    closeFloatingMenus();
    inventoryCompactDetailOpen.value = false;
    if (inventoryQueryOnlyChange || inventoryAlertQueryOnlyChange || stockLedgerQueryOnlyChange) return;
    sortMode.value = activeOperationPage.value || ['inventory', 'inventoryAlerts'].includes(activePage.value) ? 'status' : 'newest';
    void loadCurrentWarehouseList();
  },
);

onMounted(() => {
  void loadCurrentWarehouseList();
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('keydown', handleDocumentKeydown);
  window.clearTimeout(toastTimer);
  window.clearTimeout(inventoryKeywordTimer);
});
</script>

<template>
  <div class="page-stack">
    <section class="list-page">
      <PageTopbarPortal v-if="createButtonPath">
        <template #actions>
          <RouterLink v-if="createButtonPath && canWriteWarehouse" class="primary-action" :to="createButtonPath" :title="`新建${pageTitle}`">
            <Plus :size="16" />
            {{ createButtonLabel }}
          </RouterLink>
          <button v-else-if="createButtonPath" class="primary-action" type="button" disabled :title="warehouseReadonlyReason">
            <Plus :size="16" />
            {{ createButtonLabel }}
          </button>
        </template>
      </PageTopbarPortal>

      <div v-if="activeOperationPage" class="quote-page warehouse-page" :class="`warehouse-${activePage}-page`">
        <BusinessListToolbar
          v-model:search="searchKeyword"
          v-model:filter-status="draftFilterStatus"
          v-model:filter-party="draftFilterParty"
          v-model:filter-owner="draftFilterOwner"
          v-model:filter-date-start="draftFilterDateStart"
          v-model:filter-date-end="draftFilterDateEnd"
          :search-placeholder="searchPlaceholder"
          :open-menu="openToolbarMenu"
          :sort-mode="sortMode"
          :sort-amount-label="sortAmountLabel"
        :sort-date-label="currentOperationHeaders.date"
          :show-amount-sort="!['purchaseReceipts', 'afterSalesTasks'].includes(activePage)"
        :status-sort-label="['purchaseReceipts', 'salesIssues', 'afterSalesTasks'].includes(activePage) ? '当前待办优先' : undefined"
          :show-status-sort="showStatusSort"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          :filter-date-label="filterDateLabel"
          @toggle-menu="toggleToolbarMenu"
          @sort="setSortMode"
          @export-rows="exportVisibleRows"
          @clear-filters="resetBusinessFilters"
          @apply-filters="applyAndCloseFilters"
        />

        <OperationPermissionBanner
          v-if="showWarehouseOperationPermissionHint"
          :message="warehouseOperationPermissionHint"
          :suffix="warehouseOperationPermissionSuffix"
        />

        <div
          v-if="isProductionOperationPage || (visibleOperationRows.length > 0 && !isListLoading && !listLoadError)"
          class="quote-table-shell warehouse-operation-list-shell with-status-column"
          :class="{
            'purchase-receipt-status-shell': activePage === 'purchaseReceipts',
            'sales-issue-status-shell': activePage === 'salesIssues',
            'production-issue-status-shell': activePage === 'productionIssues',
            'production-return-status-shell': activePage === 'productionReturns',
            'production-receipt-status-shell': activePage === 'productionReceipts',
            'other-move-status-shell': activePage === 'otherMoves',
            'transfer-status-shell': activePage === 'transfers',
            'stocktake-status-shell': activePage === 'stocktakes',
            'after-sales-status-shell': activePage === 'afterSalesTasks',
          }"
        >
          <div class="quote-data-scroll">
            <div class="data-table quote-table warehouse-operation-table">
              <div class="table-row table-head">
                <span>{{ currentOperationHeaders.code }}</span>
                <span>{{ currentOperationHeaders.party }}</span>
                <span>{{ currentOperationHeaders.item }}</span>
                <span>{{ currentOperationHeaders.warehouse }}</span>
                <span class="operation-date-head">
                  <strong>{{ currentOperationHeaders.date }}</strong>
                  <small>{{ currentOperationHeaders.owner }}</small>
                </span>
              </div>
              <RouterLink
                v-for="row in visibleOperationRows"
                :key="row.code"
                class="table-row order-list-row warehouse-operation-list-row is-clickable"
                :class="{ 'is-row-highlighted': hoveredOperationCode === row.code }"
                :to="operationRowPath(row)"
                :aria-label="`打开${pageTitles[row.page]} ${row.code}`"
                :title="`打开${pageTitles[row.page]} ${row.code}`"
                @pointerenter="hoveredOperationCode = row.code"
                @pointerleave="hoveredOperationCode = ''"
                @mouseenter="hoveredOperationCode = row.code"
                @mouseleave="hoveredOperationCode = ''"
                @focus="hoveredOperationCode = row.code"
                @blur="hoveredOperationCode = ''"
              >
                <span class="quote-code" :title="row.code">{{ row.code }}</span>
                <span class="party-cell" :title="[row.partyTitle, row.partySubtitle].filter(Boolean).join(' · ')">
                  <strong>{{ row.partyTitle }}</strong>
                  <small v-if="row.partySubtitle">{{ row.partySubtitle }}</small>
                </span>
                <span class="product-summary" :title="[row.itemTitle, row.itemSubtitle, row.itemQuantity].filter(Boolean).join(' · ')">
                  <strong>{{ row.itemTitle }}</strong>
                  <small>{{ row.itemSubtitle }}</small>
                  <small v-if="row.itemQuantity" class="operation-quantity">{{ row.itemQuantity }}</small>
                </span>
                <span
                  class="product-summary"
                  :title="[row.warehouseTitle, row.warehouseContext, row.warehouseSubtitle].filter(Boolean).join(' · ')"
                >
                  <strong>{{ row.warehouseTitle }}</strong>
                  <small v-if="row.warehouseContext || row.warehouseSubtitle">
                    {{ [row.warehouseContext, row.warehouseSubtitle].filter(Boolean).join(' · ') }}
                  </small>
                </span>
                <span class="date-stack">
                  <strong>{{ row.date }}</strong>
                  <small v-if="row.dateContext">{{ row.dateContext }}</small>
                  <small v-if="row.owner">{{ currentOperationHeaders.owner }} · {{ row.owner }}</small>
                  <small
                    v-if="row.dateAttention"
                    class="timing-risk"
                    :class="`tone-${row.dateAttentionTone}`"
                  >{{ row.dateAttention }}</small>
                </span>
              </RouterLink>
            </div>
          </div>

          <div class="quote-status-column">
            <div v-if="activePage === 'purchaseReceipts'" class="quote-status-head warehouse-fact-status-head">
              <strong>当前进度</strong>
              <small>任务 · 质检 · 入库 · 待办</small>
            </div>
            <div v-else-if="activePage === 'salesIssues'" class="quote-status-head warehouse-fact-status-head">
              <strong>当前进度</strong>
              <small>任务 · 待办</small>
            </div>
            <div v-else-if="activePage === 'productionIssues'" class="quote-status-head warehouse-fact-status-head">
              <strong>单据状态</strong>
              <small>领料阶段 · 下一步</small>
            </div>
            <div v-else-if="activePage === 'productionReturns'" class="quote-status-head warehouse-fact-status-head">
              <strong>单据状态</strong>
              <small>退料阶段 · 下一步</small>
            </div>
            <div v-else-if="activePage === 'productionReceipts'" class="quote-status-head warehouse-fact-status-head">
              <strong>单据状态</strong>
              <small>入库阶段 · 下一步</small>
            </div>
            <div v-else-if="activePage === 'otherMoves'" class="quote-status-head warehouse-fact-status-head">
              <strong>单据状态</strong>
              <small>审批 · 库存 · 下一步</small>
            </div>
            <div v-else-if="activePage === 'transfers'" class="quote-status-head warehouse-fact-status-head">
              <strong>单据状态</strong>
              <small>调拨阶段 · 下一步</small>
            </div>
            <div v-else-if="activePage === 'stocktakes'" class="quote-status-head warehouse-fact-status-head">
              <strong>单据状态</strong>
              <small>盘点阶段 · 下一步</small>
            </div>
            <div v-else-if="activePage === 'afterSalesTasks'" class="quote-status-head warehouse-fact-status-head">
              <strong>当前进度</strong>
              <small>任务 · 待办</small>
            </div>
            <div v-else class="quote-status-head">作业状态</div>
            <RouterLink
              v-for="row in visibleOperationRows"
              :key="`${row.code}-status`"
              class="quote-status-cell order-status-link"
              :class="{
                'is-row-highlighted': hoveredOperationCode === row.code,
                'warehouse-fact-status-cell': row.page === 'purchaseReceipts' || row.page === 'salesIssues' || row.page === 'afterSalesTasks' || row.page === 'productionIssues' || row.page === 'productionReturns' || row.page === 'productionReceipts' || row.page === 'otherMoves' || row.page === 'transfers' || row.page === 'stocktakes',
              }"
              :to="operationRowPath(row)"
              :aria-label="`打开${pageTitles[row.page]} ${row.code} 状态`"
              :title="`打开${pageTitles[row.page]} ${row.code} 状态：${row.status}，下一步：${warehouseNextStep(row)}`"
              @pointerenter="hoveredOperationCode = row.code"
              @pointerleave="hoveredOperationCode = ''"
              @mouseenter="hoveredOperationCode = row.code"
              @mouseleave="hoveredOperationCode = ''"
              @focus="hoveredOperationCode = row.code"
              @blur="hoveredOperationCode = ''"
            >
              <ListStatusOverview
                v-if="warehouseStatusFacts(row).length || row.page === 'salesIssues' || row.page === 'afterSalesTasks'"
                :status="warehouseStatusLabel(row)"
                :facts="warehouseStatusFacts(row)"
                :next-step="warehouseNextStep(row)"
                :next-step-label="['purchaseReceipts', 'salesIssues', 'afterSalesTasks'].includes(row.page) ? '当前待办' : '下一步'"
              />
              <template v-else>
                <i class="mini-status" :class="statusClass(row.status)">{{ row.status }}</i>
                <small>下一步：{{ warehouseNextStep(row) }}</small>
              </template>
            </RouterLink>
          </div>
        </div>

        <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentWarehouseList" />
        <div v-else-if="visibleOperationRows.length === 0" class="list-empty-state">
          <strong>{{ operationEmptyTitle }}</strong>
          <span>{{ operationEmptyDescription }}</span>
          <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
            清空条件
          </button>
        </div>

        <div
          v-if="isProductionOperationPage || (visibleOperationRows.length > 0 && !isListLoading && !listLoadError)"
          class="quote-card-list"
        >
          <RouterLink
            v-for="row in visibleOperationRows"
            :key="`${row.code}-card`"
            class="quote-card"
            :to="operationRowPath(row)"
            :title="`打开${pageTitles[row.page]} ${row.code}`"
          >
            <div class="quote-card-head">
              <div>
                <strong>{{ row.page === 'purchaseReceipts' ? row.code : row.partyTitle }}</strong>
                <span>
                  {{
                    row.page === 'purchaseReceipts'
                      ? [row.partyTitle, row.partySubtitle].filter(Boolean).join(' · ')
                      : [row.code, row.partySubtitle].filter(Boolean).join(' · ')
                  }}
                </span>
              </div>
              <i class="mini-status" :class="statusClass(['otherMoves', 'transfers', 'stocktakes'].includes(row.page) ? row.lifecycleStatus || row.status : row.status)">
                {{ ['otherMoves', 'transfers', 'stocktakes'].includes(row.page) ? row.lifecycleStatus || row.status : row.status }}
              </i>
            </div>
              <div class="quote-card-main quote-card-products">
              <div>
                <span>{{ row.itemTitle }} <small>{{ row.itemSubtitle }}</small></span>
                <span>
                  <template v-if="row.page === 'purchaseReceipts'">暂存位置 · </template>
                  <template v-else-if="row.page === 'afterSalesTasks'">作业类型 · </template>{{ row.warehouseTitle }}
                  <small v-if="row.warehouseContext || row.warehouseSubtitle">
                    · {{ [row.warehouseContext, row.warehouseSubtitle].filter(Boolean).join(' · ') }}
                  </small>
                </span>
              </div>
                <strong>{{ row.cardValue }}</strong>
              </div>
              <div v-if="row.statusDetail" class="warehouse-card-progress">{{ row.statusDetail }}</div>
              <div class="quote-card-meta">
              <span v-if="row.owner">
                {{ row.page === 'purchaseReceipts' ? '到货登记人' : currentOperationHeaders.owner }} {{ row.owner }}
              </span>
              <span>{{ row.dateContext || currentOperationHeaders.date }} {{ row.date }}</span>
              <span v-if="row.dateAttention" class="timing-risk" :class="`tone-${row.dateAttentionTone}`">{{ row.dateAttention }}</span>
              <span v-if="row.attachmentCount">附件 {{ row.attachmentCount }} 个</span>
              <span>当前待办：{{ warehouseNextStep(row) }}</span>
            </div>
          </RouterLink>
        </div>

        <div
          v-if="isProductionOperationPage || (visibleOperationRows.length > 0 && !isListLoading && !listLoadError)"
          class="table-footer"
        >
          <span v-if="isProductionOperationPage">显示 {{ visibleOperationRows.length ? 1 : 0 }}-{{ visibleOperationRows.length }} / 共 {{ visibleOperationRows.length }} 条</span>
          <span v-else>共 {{ visibleOperationRows.length }} 条</span>
          <div v-if="isProductionOperationPage" class="pager">
            <button type="button" disabled title="已经是第一页">上一页</button>
            <strong>1</strong>
            <button type="button" disabled title="已经是最后一页">下一页</button>
          </div>
        </div>
      </div>

      <div v-if="activePage === 'inventory'" class="quote-page reference-page warehouse-reference-page">
        <BusinessListToolbar
          v-model:search="searchKeyword"
          v-model:filter-status="draftFilterStatus"
          v-model:filter-party="draftFilterParty"
          v-model:filter-owner="draftFilterOwner"
          v-model:filter-date-start="draftFilterDateStart"
          v-model:filter-date-end="draftFilterDateEnd"
          :search-placeholder="searchPlaceholder"
          :open-menu="openToolbarMenu"
          :sort-mode="sortMode"
          :sort-amount-label="sortAmountLabel"
          :sort-date-label="filterDateLabel"
          :show-amount-sort="inventoryViewMode === 'location'"
          :status-sort-label="statusSortLabel"
          :show-status-sort="showStatusSort"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          :filter-date-label="filterDateLabel"
          @toggle-menu="toggleToolbarMenu"
          @sort="setSortMode"
          @export-rows="exportVisibleRows"
          @clear-filters="resetBusinessFilters"
          @apply-filters="applyAndCloseFilters"
        />

        <section class="inventory-query-commandbar" aria-label="库存查询任务视图与分组维度">
          <div class="inventory-task-control">
            <span>库存视图</span>
            <div class="inventory-task-tabs" role="tablist" aria-label="库存字段视图">
              <button
                v-for="option in inventoryTaskViewOptions"
                :key="option.key"
                type="button"
                role="tab"
                :class="{ active: inventoryTaskView === option.key }"
                :aria-selected="inventoryTaskView === option.key"
                :title="option.hint"
                @click="setInventoryTaskView(option.key)"
              >{{ option.label }}</button>
            </div>
          </div>
          <div class="inventory-view-control">
            <span>汇总维度</span>
            <div class="inventory-view-tabs" role="tablist" aria-label="库存汇总维度" :title="inventoryTaskView === 'batch' ? '批次效期视图固定按批次汇总' : ''">
              <button
                v-for="option in inventoryViewOptions"
                :key="option.key"
                type="button"
                role="tab"
                :disabled="inventoryTaskView === 'batch' && option.key !== 'batch'"
                :class="{ active: inventoryViewMode === option.key }"
                :aria-selected="inventoryViewMode === option.key"
                :title="inventoryTaskView === 'batch' && option.key !== 'batch' ? '批次效期视图固定按批次汇总' : `按${option.label}汇总：${option.hint}`"
                @click="setInventoryViewMode(option.key)"
              >{{ option.label }}</button>
            </div>
          </div>
        </section>

        <div v-if="visibleInventoryRows.length" class="inventory-query-shell">
          <div class="inventory-result-head">
            <div>
              <strong>{{ currentInventoryTaskOption.label }}</strong>
              <span>按{{ currentInventoryViewOption.label }}汇总 · {{ visibleInventoryRows.length }} 条结果</span>
            </div>
            <small>点击一行查看数量构成、分布和库存流水</small>
          </div>

          <div ref="inventoryTableScrollRef" class="inventory-table-scroll">
            <div class="inventory-work-table" :class="`task-${inventoryTaskView}`" role="table" aria-label="库存查询结果">
              <div class="inventory-work-row inventory-work-head" role="row">
                <span role="columnheader">{{ inventorySubjectHeader }}</span>
                <template v-if="inventoryTaskView === 'overview'">
                  <span>物理在库</span><span>合格在库</span><span>占用</span><span>可用</span>
                </template>
                <template v-else-if="inventoryTaskView === 'receiving'">
                  <span>物理在库</span><span>调拨在途</span><span>待检</span><span>待正式入库</span><span>不合格隔离</span><span>异常暂存</span><span>合格在库</span>
                </template>
                <template v-else-if="inventoryTaskView === 'shipping'">
                  <span>合格在库</span><span>销售预留</span><span>生产分配</span><span>冻结</span><span>待出库计划</span><span>可用</span>
                </template>
                <template v-else>
                  <span>入账日期</span><span>效期</span><span>质量状态</span><span>物理在库</span><span>合格在库</span><span>可用</span>
                </template>
                <span>库存可用性</span><span>最近变动</span>
              </div>
              <button
                v-for="row in visibleInventoryRows"
                :key="row.key"
                class="inventory-work-row"
                type="button"
                role="row"
                :title="`查看${row.title}库存明细`"
                @click="selectInventoryRow(row)"
              >
                <span class="inventory-work-identity" role="cell">
                  <strong>{{ row.title }}</strong>
                  <small>{{ row.subtitle }}</small>
                </span>
                <template v-if="inventoryTaskView === 'overview'">
                  <b :title="row.onHand">{{ row.onHand }}</b>
                  <b :title="row.qualifiedOnHand">{{ row.qualifiedOnHand }}</b>
                  <b :title="row.locked">{{ inventoryTaskQty(row.locked) }}</b>
                  <b class="is-primary" :title="row.available">{{ row.available }}</b>
                </template>
                <template v-else-if="inventoryTaskView === 'receiving'">
                  <b :title="row.onHand">{{ row.onHand }}</b>
                  <b :title="row.inTransit">{{ inventoryTaskQty(row.inTransit) }}</b>
                  <b :title="row.qcHold">{{ inventoryTaskQty(row.qcHold) }}</b>
                  <b :title="row.pendingInbound">{{ inventoryTaskQty(row.pendingInbound) }}</b>
                  <b :title="row.rejectedHold">{{ inventoryTaskQty(row.rejectedHold) }}</b>
                  <b :title="row.exceptionHold">{{ inventoryTaskQty(row.exceptionHold) }}</b>
                  <b :title="row.qualifiedOnHand">{{ row.qualifiedOnHand }}</b>
                </template>
                <template v-else-if="inventoryTaskView === 'shipping'">
                  <b :title="row.qualifiedOnHand">{{ row.qualifiedOnHand }}</b>
                  <b :title="row.reserved">{{ inventoryTaskQty(row.reserved) }}</b>
                  <b :title="row.allocated">{{ inventoryTaskQty(row.allocated) }}</b>
                  <b :title="row.frozen">{{ inventoryTaskQty(row.frozen) }}</b>
                  <b :title="row.outboundPlan">{{ inventoryTaskQty(row.outboundPlan) }}</b>
                  <b class="is-primary" :title="row.available">{{ row.available }}</b>
                </template>
                <template v-else>
                  <b>{{ row.batchDate || '—' }}</b>
                  <b>{{ row.expiryDate || '—' }}</b>
                  <b>{{ row.qcStatus || '—' }}</b>
                  <b :title="row.onHand">{{ row.onHand }}</b>
                  <b :title="row.qualifiedOnHand">{{ row.qualifiedOnHand }}</b>
                  <b class="is-primary" :title="row.available">{{ row.available }}</b>
                </template>
                <span class="inventory-work-status" role="cell" :title="[row.availabilitySummary, row.controlDetail].filter(Boolean).join('；')">
                  <i class="mini-status" :class="statusClass(row.status)">{{ row.status }}</i>
                  <small v-if="row.controlSummary">{{ row.controlSummary }}</small>
                </span>
                <span class="inventory-work-updated" role="cell"><b>{{ row.updatedAt }}</b><small>{{ row.lastMovement }}</small></span>
              </button>
            </div>
          </div>
          <div class="table-footer inventory-table-footer">
            <span>共 {{ visibleInventoryRows.length }} 条库存结果</span>
          </div>
        </div>

        <Teleport to="body">
          <div v-if="inventoryCompactDetailOpen && selectedInventoryRow" class="inventory-drawer-layer">
            <button class="inventory-drawer-backdrop" type="button" aria-label="关闭库存详情" @click="closeInventoryDetail" />
            <aside
              ref="inventoryDetailPaneRef"
              class="inventory-detail-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="库存详情"
              tabindex="-1"
              @keydown.tab="handleInventoryDetailTab"
            >
              <div class="inventory-drawer-head">
                <div>
                  <small>{{ selectedInventoryRow.subjectLabel }}</small>
                  <h2>{{ selectedInventoryRow.title }}</h2>
                  <span>{{ selectedInventoryRow.subtitle }}</span>
                </div>
                <button type="button" aria-label="关闭库存详情" title="关闭库存详情" @click="closeInventoryDetail">×</button>
              </div>
              <div ref="inventoryDetailScrollRef" class="inventory-drawer-scroll">
                <div class="inventory-focus-head inventory-drawer-status">
                  <span>最近变动 {{ selectedInventoryRow.updatedAt }}</span>
                  <i class="mini-status" :class="statusClass(selectedInventoryRow.status)">{{ selectedInventoryRow.status }}</i>
                </div>
                <div v-if="selectedInventoryRow.mode === 'batch'" class="inventory-batch-trace-facts" aria-label="批次追溯记录">
                  <span><small>入账日期</small><b>{{ selectedInventoryRow.batchDate }}</b></span>
                  <span>
                    <small>来源单据</small>
                    <RouterLink
                      v-if="isWarehouseOwnedPath(selectedInventoryRow.originPath)"
                      :to="selectedInventoryRow.originPath"
                      :title="`查看批次来源 ${selectedInventoryRow.originSource}`"
                    >{{ selectedInventoryRow.originSource }}</RouterLink>
                    <b v-else>{{ selectedInventoryRow.originSource }}</b>
                  </span>
                  <span><small>质量状态</small><b>{{ selectedInventoryRow.qcStatus }}</b></span>
                  <span><small>效期</small><b>{{ selectedInventoryRow.expiryDate }}</b></span>
                </div>
                <div class="inventory-balance-kpis">
                  <span><small>物理在库</small><strong>{{ selectedInventoryRow.onHand }}</strong></span>
                  <span><small>合格在库</small><strong>{{ selectedInventoryRow.qualifiedOnHand }}</strong></span>
                  <span><small>可用库存</small><strong>{{ selectedInventoryRow.available }}</strong></span>
                </div>
                <div class="inventory-detail-judgement" :class="statusClass(selectedInventoryRow.status)">
                  <small>可用性结论</small><strong>{{ selectedInventoryRow.availabilitySummary }}</strong>
                </div>
                <div v-if="inventoryControlledFactEntries(selectedInventoryRow).length" class="inventory-control-summary">
                  <small>数量构成</small>
                  <div>
                    <span v-for="entry in inventoryControlledFactEntries(selectedInventoryRow)" :key="entry.label" :class="`tone-${entry.tone}`">
                      <b>{{ entry.label }}</b><strong>{{ entry.value }}</strong>
                    </span>
                  </div>
                </div>
                <section v-if="selectedInventoryRow.mode !== 'location'" class="inventory-detail-section">
                  <div class="inventory-detail-head"><strong>{{ selectedInventoryRow.distributionTitle }}</strong><small>{{ selectedInventoryRow.distributionHint }}</small></div>
                  <div class="inventory-chip-grid">
                    <span v-for="warehouse in selectedInventoryRow.warehouseSummaries" :key="`${selectedInventoryRow.key}-${warehouse.warehouse}`">
                      <b>{{ warehouse.warehouse }}</b>
                      <small>合格 {{ warehouse.qualifiedOnHand }} · 可用 {{ warehouse.available }} · 占用 {{ warehouse.locked }}</small>
                      <small v-if="inventoryWarehouseControlledText(warehouse)" class="inventory-controlled-line">{{ inventoryWarehouseControlledText(warehouse) }}</small>
                      <small>{{ warehouse.batchCount }} 批 · {{ warehouse.locations.join('、') }}</small>
                    </span>
                  </div>
                </section>
                <section class="inventory-detail-section">
                  <div class="inventory-detail-head"><strong>{{ selectedInventoryRow.detailTitle }}</strong><small>{{ selectedInventoryRow.detailHint }}</small></div>
                  <div class="inventory-batch-grid compact">
                    <span v-for="detail in selectedInventoryRow.detailRows" :key="`${selectedInventoryRow.key}-${detail.key}`">
                      <b>{{ inventoryDetailPrimary(detail, selectedInventoryRow.mode) }}</b>
                      <small>{{ inventoryDetailSecondary(detail, selectedInventoryRow.mode) }}</small>
                      <small v-if="inventoryDetailControlledText(detail)" class="inventory-controlled-line">{{ inventoryDetailControlledText(detail) }}</small>
                      <small>入账日期 {{ detail.batchDate }} · 效期 {{ detail.expiryDate }}</small>
                    </span>
                  </div>
                </section>
                <section v-if="selectedInventoryRow.occupationSources.length" class="inventory-detail-section">
                  <div class="inventory-detail-head"><strong>占用来源</strong><small>销售、生产、冻结或调拨</small></div>
                  <div class="inventory-source-list">
                    <template v-for="source in selectedInventoryRow.occupationSources" :key="`${source.type}-${source.sourceDoc}-${source.sourceLineId}`">
                      <RouterLink
                        v-if="isWarehouseOwnedPath(source.path)"
                        :to="source.path || ''"
                        :title="`查看占用来源 ${source.sourceDoc}`"
                      >{{ occupationSourceText(source) }}</RouterLink>
                      <span v-else class="is-disabled">{{ occupationSourceText(source) }}</span>
                    </template>
                  </div>
                </section>
                <section class="inventory-detail-section">
                  <div class="inventory-detail-head"><strong>{{ selectedInventoryRow.mode === 'batch' ? '批次流水' : '最近流水' }}</strong><small>{{ selectedInventoryRow.mode === 'batch' ? `共 ${selectedInventoryRow.movementCount} 条` : '最近 6 条' }}</small></div>
                  <div class="inventory-ledger-list">
                    <span v-if="!inventoryLedgerRows(selectedInventoryRow).length">暂无库存流水</span>
                    <template v-else>
                      <span v-for="(ledger, index) in inventoryLedgerRows(selectedInventoryRow)" :key="`${ledger.time}-${ledger.sourceDoc}-${index}`">
                        <b>{{ ledgerBusinessType(ledger) }} {{ ledger.qty }}</b>
                        <small>
                          {{ ledger.time }} · {{ ledger.warehouse }} / {{ inventoryLocationLabel(ledger.location) }} ·
                          <template v-if="ledger.reversalOf">
                            <span class="quote-code">{{ ledger.sourceDoc }}</span>
                            <template v-if="ledgerOriginalSourcePath(ledger)">
                              · <RouterLink :to="ledgerOriginalSourcePath(ledger)" :title="`查看冲销原单 ${ledger.reversalOf}`">原单 {{ ledger.reversalOf }}</RouterLink>
                            </template>
                            <template v-else> · 原单 {{ ledger.reversalOf }}</template>
                          </template>
                          <template v-else>
                            <RouterLink v-if="ledgerSourcePath(ledger)" :to="ledgerSourcePath(ledger)" :title="`查看来源单据 ${ledger.sourceDoc}`">{{ ledger.sourceDoc }}</RouterLink>
                            <template v-else>{{ ledger.sourceDoc }}</template>
                          </template>
                        </small>
                      </span>
                    </template>
                  </div>
                  <RouterLink class="inventory-trace-all-link" :to="{ path: '/warehouse/stock-ledger', query: { keyword: inventoryLedgerKeyword(selectedInventoryRow) } }">查看全部库存流水</RouterLink>
                </section>
              </div>
            </aside>
          </div>
        </Teleport>

        <ListLoadState v-if="(isListLoading && apiInventoryRows === null) || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentWarehouseList" />
        <div v-else-if="visibleInventoryRows.length === 0" class="list-empty-state">
          <strong>{{ inventoryEmptyTitle }}</strong>
          <span>{{ inventoryEmptyDescription }}</span>
          <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
            清空条件
          </button>
        </div>
      </div>

      <div v-if="activePage === 'inventoryAlerts'" class="quote-page reference-page warehouse-reference-page inventory-alert-workbench">
        <BusinessListToolbar
          v-model:search="searchKeyword"
          v-model:filter-status="draftFilterStatus"
          v-model:filter-party="draftFilterParty"
          v-model:filter-owner="draftFilterOwner"
          v-model:filter-date-start="draftFilterDateStart"
          v-model:filter-date-end="draftFilterDateEnd"
          :search-placeholder="searchPlaceholder"
          :open-menu="openToolbarMenu"
          :sort-mode="sortMode"
          :sort-amount-label="sortAmountLabel"
          :sort-date-label="filterDateLabel"
          :show-amount-sort="showInventoryAlertAmountSort"
          :status-sort-label="statusSortLabel"
          :show-status-sort="showStatusSort"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          :filter-date-label="filterDateLabel"
          @toggle-menu="toggleToolbarMenu"
          @sort="setSortMode"
          @export-rows="exportVisibleRows"
          @clear-filters="resetBusinessFilters"
          @apply-filters="applyAndCloseFilters"
        />

        <section class="inventory-alert-overview" aria-label="库存预警概览">
          <button
            v-for="option in inventoryAlertTabOptions"
            :key="option.key"
            type="button"
            :class="{ active: inventoryAlertTab === option.key }"
            @click="setInventoryAlertTab(option.key)"
          >
            <small>{{ option.label }}</small>
            <strong>{{ inventoryAlertCountDisplay(option.key) }}</strong>
            <span v-if="option.key === 'replenishment'">按预计可用与补货阈值判断</span>
            <span v-else-if="option.key === 'controlled'">待检、待入库、隔离与异常暂存</span>
            <span v-else-if="option.key === 'expiry'">已过期及 90 天内到期批次</span>
            <span v-else>负数、维度缺失或数量关系异常</span>
          </button>
        </section>

        <section
          v-if="inventoryAlertTab === 'replenishment'"
          class="inventory-alert-result"
          aria-label="库存补货预警"
          title="按仓库—物料补货点判断；在途、待入库和已生成的补货单据会参与防重复。"
        >
          <div class="inventory-result-head">
            <div>
              <strong>补货建议</strong>
              <span>{{ visibleAlertReplenishmentSignals.length }} 项 · 预计可用已包含待正式入库和调拨在途</span>
            </div>
            <div class="inventory-alert-status-summary">
              <span v-for="entry in replenishmentStatusSummary" :key="entry.status">{{ entry.status }} {{ entry.count }}</span>
            </div>
          </div>
          <div v-if="visibleAlertReplenishmentSignals.length" class="inventory-table-scroll">
            <div class="inventory-alert-table replenishment" role="table" aria-label="补货建议">
              <div class="inventory-alert-row inventory-work-head" role="row">
                <span>物料 / 仓库</span><span>当前可用</span><span>待入库 / 在途</span><span>预计可用</span><span>补货阈值</span><span>建议补货</span><span>状态</span><span>处理</span>
              </div>
              <div v-for="signal in visibleAlertReplenishmentSignals" :key="signal.code" class="inventory-alert-row" role="row">
                <span class="inventory-work-identity">
                  <strong>{{ signal.materialName }}</strong>
                  <small>{{ signal.materialCode }} · {{ signal.warehouseName }}</small>
                  <small>更新 {{ signal.updatedAt }}</small>
                </span>
                <b>{{ formatQty(signal.availableQty, signal.uom) }}</b>
                <span class="inventory-alert-supply"><b>{{ formatQty(signal.pendingInboundQty, signal.uom) }}</b><small>在途 {{ formatQty(signal.inTransitQty, signal.uom) }}</small></span>
                <b>{{ formatQty(signal.projectedQty, signal.uom) }}</b>
                <span class="inventory-alert-supply inventory-alert-threshold"><b>补货点 {{ formatQty(signal.reorderPoint, signal.uom) }}</b><small>安全 {{ formatQty(signal.safetyStock, signal.uom) }} · 上限 {{ formatQty(signal.maxStock, signal.uom) }}</small></span>
                <b class="is-primary">{{ formatQty(signal.suggestedQty, signal.uom) }}</b>
                <span><i class="mini-status" :class="statusClass(signal.status)">{{ signal.status }}</i></span>
                <span class="inventory-alert-action">
                  <RouterLink
                    v-if="signal.linkedDocument?.path"
                    class="secondary-action compact-action"
                    :to="signal.linkedDocument.path"
                    :title="`查看 ${signal.linkedDocument.type} ${signal.linkedDocument.code}`"
                  >{{ signal.linkedDocument.code }}</RouterLink>
                  <span v-else-if="signal.linkedDocument" class="inventory-linked-document">{{ signal.linkedDocument.code }} 处理中</span>
                  <template v-else-if="signal.actionRequired && signal.availableRoutes.length">
                    <button
                      v-for="routeType in signal.availableRoutes"
                      :key="`${signal.code}-${routeType}`"
                      class="secondary-action compact-action"
                      type="button"
                      :disabled="!canStartReplenishment || Boolean(startingReplenishmentCode)"
                      :title="replenishmentActionTitle(signal, routeType)"
                      @click="handleStartReplenishment(signal, routeType)"
                    >{{ startingReplenishmentCode === signal.code ? '提交中' : `发起${routeType === '采购申请' ? '采购' : '生产'}` }}</button>
                  </template>
                  <small v-else>{{ signal.status === '在途覆盖' ? '无需新增补货' : '暂无可用路线' }}</small>
                </span>
              </div>
            </div>
          </div>
          <div v-else-if="!isListLoading && !listLoadError" class="list-empty-state">
            <strong>{{ inventoryAlertEmptyTitle }}</strong>
            <span>{{ inventoryAlertEmptyDescription }}</span>
            <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
              清空条件
            </button>
          </div>
        </section>

        <section v-else class="inventory-alert-result">
          <div class="inventory-result-head">
            <div>
              <strong>{{ inventoryAlertTabOptions.find((option) => option.key === inventoryAlertTab)?.label }}</strong>
              <span>{{ visibleInventoryOperationalAlerts.length }} 项待关注</span>
            </div>
          </div>
          <div v-if="visibleInventoryOperationalAlerts.length" class="inventory-table-scroll">
            <div class="inventory-alert-table operational" role="table" :aria-label="inventoryAlertTabOptions.find((option) => option.key === inventoryAlertTab)?.label || '库存预警'">
              <div class="inventory-alert-row inventory-work-head" role="row">
                <span>物料 / 批次</span><span>仓库 / 库位</span><span>数量 / 状态</span><span>原因</span><span>更新时间</span><span>处理</span>
              </div>
              <div v-for="alert in visibleInventoryOperationalAlerts" :key="alert.key" class="inventory-alert-row" role="row">
                <span class="inventory-work-identity"><strong>{{ alert.item }}</strong><small>{{ alert.materialCode }}</small><small>{{ alert.batch }}</small></span>
                <span class="inventory-alert-supply"><b>{{ alert.warehouse }}</b><small>{{ alert.location }}</small></span>
                <span class="inventory-alert-supply inventory-alert-quantity-status"><b>{{ alert.quantity }}</b><small>{{ alert.quantityLabel }}</small><i class="mini-status" :class="statusClass(alert.status)">{{ alert.status }}</i></span>
                <span class="inventory-alert-reason">{{ alert.reason }}</span>
                <b>{{ alert.updatedAt }}</b>
                <RouterLink class="secondary-action compact-action" :to="{ path: '/warehouse/inventory', query: inventoryAlertInventoryQuery(alert) }" title="查看对应库存及批次详情">查看库存</RouterLink>
              </div>
            </div>
          </div>
          <div v-else-if="!isListLoading && !listLoadError" class="list-empty-state">
            <strong>{{ inventoryAlertEmptyTitle }}</strong>
            <span>{{ inventoryAlertEmptyDescription }}</span>
            <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
              清空条件
            </button>
          </div>
        </section>

        <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentWarehouseList" />
      </div>

      <div v-if="activePage === 'stockLedger'" class="quote-page reference-page warehouse-reference-page">
        <BusinessListToolbar
          v-model:search="searchKeyword"
          v-model:filter-status="draftFilterStatus"
          v-model:filter-party="draftFilterParty"
          v-model:filter-owner="draftFilterOwner"
          v-model:filter-date-start="draftFilterDateStart"
          v-model:filter-date-end="draftFilterDateEnd"
          :search-placeholder="searchPlaceholder"
          :open-menu="openToolbarMenu"
          :sort-mode="sortMode"
          :sort-amount-label="sortAmountLabel"
          sort-date-label="发生时间"
          :show-amount-sort="false"
          :show-status-sort="showStatusSort"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          :filter-date-label="filterDateLabel"
          @toggle-menu="toggleToolbarMenu"
          @sort="setSortMode"
          @export-rows="exportVisibleRows"
          @clear-filters="resetBusinessFilters"
          @apply-filters="applyAndCloseFilters"
        />

        <div v-if="stockLedgerHasRows && !isListLoading && !listLoadError" class="table-scroll reference-table-scroll">
          <div class="data-table reference-table warehouse-ledger-table" role="table" aria-label="库存流水列表">
            <div class="table-row table-head" role="row">
              <span role="columnheader">时间 / 业务类型</span>
              <span role="columnheader">物料 / 编码 / 批次</span>
              <span role="columnheader">仓库 / 编码 / 库位</span>
              <span role="columnheader">变动数量 / 前后余额</span>
              <span role="columnheader">来源单据</span>
              <span role="columnheader">经办人 / 说明</span>
            </div>
            <div
              v-for="row in paginatedStockLedgerRows"
              :key="ledgerRowKey(row)"
              class="table-row"
              role="row"
            >
              <span class="product-summary" role="cell"><strong>{{ row.time }}</strong><small><i class="mini-status" :class="ledgerMovementClass(ledgerBusinessType(row))">{{ ledgerBusinessType(row) }}</i></small></span>
              <span class="product-summary" role="cell">
                <strong>{{ row.item }}</strong>
                <small :title="ledgerMaterialMeta(row)">{{ ledgerMaterialMeta(row) }}</small>
              </span>
              <span class="product-summary" role="cell">
                <strong>{{ row.warehouse }}</strong>
                <small :title="ledgerWarehouseMeta(row)">{{ ledgerWarehouseMeta(row) }}</small>
              </span>
              <span class="product-summary amount-cell" role="cell"><strong>{{ row.qty }}</strong><small>{{ ledgerDirectionLabel(row) }} · {{ row.balanceFact || '物理在库' }} {{ ledgerBalanceText(row) }}</small></span>
              <span class="product-summary warehouse-ledger-source" role="cell">
                <template v-if="row.reversalOf">
                  <strong class="quote-code">{{ row.sourceDoc }}</strong>
                  <small :title="ledgerSourceLineText(row)">
                    <RouterLink v-if="ledgerOriginalSourcePath(row)" class="warehouse-source-link" :to="ledgerOriginalSourcePath(row)" :title="`查看冲销原单 ${row.reversalOf}`">原单 {{ row.reversalOf }}</RouterLink>
                    <template v-else>原单 {{ row.reversalOf }}</template>
                    <template v-if="row.documentLineId"> · 原单行 {{ row.documentLineId }}</template>
                  </small>
                </template>
                <template v-else>
                  <RouterLink v-if="ledgerSourcePath(row)" class="quote-code warehouse-source-link" :to="ledgerSourcePath(row)" :title="`查看来源单据 ${row.sourceDoc}`">{{ row.sourceDoc }}</RouterLink>
                  <strong v-else class="quote-code">{{ row.sourceDoc }}</strong>
                  <small :title="ledgerSourceLineText(row)">{{ ledgerSourceLineText(row) }}</small>
                </template>
              </span>
              <span class="product-summary warehouse-ledger-operator" role="cell">
                <strong>{{ warehouseActorLabel(row.operator, '系统') }}</strong>
                <small v-if="ledgerReasonDetail(row)" :title="ledgerReasonDetail(row)">{{ ledgerReasonDetail(row) }}</small>
              </span>
            </div>
          </div>
        </div>

        <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentWarehouseList" />
        <div v-else-if="visibleStockLedgerRows.length === 0" class="list-empty-state">
          <strong>{{ stockLedgerEmptyTitle }}</strong>
          <span>{{ stockLedgerEmptyDescription }}</span>
          <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
            清空条件
          </button>
        </div>

        <div v-if="stockLedgerHasRows && !isListLoading && !listLoadError" class="quote-card-list">
          <article
            v-for="row in paginatedStockLedgerRows"
            :key="`${ledgerRowKey(row)}-card`"
            class="quote-card"
          >
            <div class="quote-card-head">
              <div>
                <strong>{{ row.item }}</strong>
                <span>{{ ledgerMaterialMeta(row) }}</span>
              </div>
              <i class="mini-status" :class="ledgerMovementClass(ledgerBusinessType(row))">{{ ledgerBusinessType(row) }}</i>
            </div>
            <div class="quote-card-main">
              <span>{{ row.warehouse }} · {{ ledgerWarehouseMeta(row) }}</span>
              <strong>{{ row.qty }}</strong>
            </div>
            <div class="quote-card-meta">
              <span>{{ ledgerDirectionLabel(row) }} · {{ row.balanceFact || '物理在库' }} {{ ledgerBalanceText(row) }} · {{ row.time }}</span>
              <span class="warehouse-ledger-card-source">
                <template v-if="row.reversalOf">
                  冲销凭证 {{ row.sourceDoc }} ·
                  <RouterLink v-if="ledgerOriginalSourcePath(row)" class="warehouse-source-link" :to="ledgerOriginalSourcePath(row)" :title="`查看冲销原单 ${row.reversalOf}`">原单 {{ row.reversalOf }}</RouterLink>
                  <template v-else>原单 {{ row.reversalOf }}</template>
                </template>
                <template v-else>
                  <RouterLink v-if="ledgerSourcePath(row)" class="warehouse-source-link" :to="ledgerSourcePath(row)" :title="`查看来源单据 ${row.sourceDoc}`">{{ row.sourceDoc }}</RouterLink>
                  <template v-else>{{ row.sourceDoc }}</template>
                  · {{ ledgerSourceLineText(row) }}
                </template>
              </span>
              <span>{{ warehouseActorLabel(row.operator, '系统') }}<template v-if="ledgerReasonDetail(row)"> · {{ ledgerReasonDetail(row) }}</template></span>
            </div>
          </article>
        </div>

        <div v-if="stockLedgerHasRows && !isListLoading && !listLoadError" class="table-footer">
          <span>显示 {{ stockLedgerPageStart }}-{{ stockLedgerPageEnd }} / 共 {{ visibleStockLedgerRows.length }} 条</span>
          <div class="pager">
            <button type="button" :disabled="stockLedgerCurrentPage <= 1" :title="stockLedgerCurrentPage <= 1 ? '已经是第一页' : '查看上一页'" @click="setStockLedgerPage(stockLedgerCurrentPage - 1)">上一页</button>
            <strong>{{ stockLedgerCurrentPage }} / {{ stockLedgerPageCount }}</strong>
            <button type="button" :disabled="stockLedgerCurrentPage >= stockLedgerPageCount" :title="stockLedgerCurrentPage >= stockLedgerPageCount ? '已经是最后一页' : '查看下一页'" @click="setStockLedgerPage(stockLedgerCurrentPage + 1)">下一页</button>
          </div>
        </div>
      </div>

    </section>

    <div
      v-if="toastMessage"
      class="app-toast"
      :class="{ error: toastTone === 'error' }"
      :role="toastTone === 'error' ? 'alert' : 'status'"
      :aria-live="toastTone === 'error' ? 'assertive' : 'polite'"
      aria-atomic="true"
    >
      {{ toastMessage }}
    </div>

  </div>
</template>

<style scoped>
.purchase-receipt-status-shell {
  grid-template-columns: minmax(0, 1fr) 264px;
}

.sales-issue-status-shell {
  grid-template-columns: minmax(0, 1fr) 220px;
}

.after-sales-status-shell {
  grid-template-columns: minmax(0, 1fr) 220px;
}

.after-sales-status-shell .warehouse-operation-table .table-row {
  grid-template-columns: 160px minmax(138px, 0.95fr) minmax(194px, 1.25fr) minmax(128px, 0.8fr) 102px;
  gap: 8px;
  padding-inline: 10px;
}

.after-sales-status-shell .warehouse-operation-table .table-row:not(.table-head) {
  height: 88px;
  min-height: 88px;
}

.after-sales-status-shell .quote-status-column {
  grid-auto-rows: 88px;
}

.after-sales-status-shell .operation-quantity {
  color: #3e4941;
  font-size: 11px;
  font-weight: 700;
}

.other-move-status-shell .operation-quantity {
  color: #3e4941;
  font-size: 11px;
  font-weight: 700;
  -webkit-line-clamp: 1;
}

.production-issue-status-shell {
  grid-template-columns: minmax(0, 1fr) 260px;
}

.production-return-status-shell {
  grid-template-columns: minmax(0, 1fr) 260px;
}

.production-receipt-status-shell {
  grid-template-columns: minmax(0, 1fr) 260px;
}

.other-move-status-shell,
.transfer-status-shell,
.stocktake-status-shell {
  grid-template-columns: minmax(0, 1fr) 270px;
}

.warehouse-fact-status-head {
  display: grid;
  align-content: center;
  grid-template-columns: 62px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
}

.warehouse-fact-status-head strong {
  color: inherit;
  font-size: 12px;
  text-align: left;
}

.warehouse-fact-status-head small {
  color: #77786f;
  font-size: 10px;
  font-weight: 600;
  text-align: left;
}

.operation-date-head {
  display: grid;
  align-content: center;
  gap: 1px;
}

.operation-date-head strong {
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
}

.operation-date-head small {
  color: #77786f;
  font-size: 10px;
  font-weight: 600;
}

.warehouse-fact-status-cell {
  display: flex;
  align-items: stretch;
  padding: 7px 9px;
  text-align: left;
}

.purchase-receipt-status-shell .warehouse-operation-table .table-row {
  grid-template-columns:
    minmax(102px, 0.76fr)
    minmax(126px, 1fr)
    minmax(164px, 1.22fr)
    minmax(110px, 0.82fr)
    minmax(116px, 0.86fr);
  gap: 8px;
  padding-inline: 10px;
}

.sales-issue-status-shell .warehouse-operation-table .table-row {
  grid-template-columns:
    minmax(112px, 0.76fr)
    minmax(146px, 1fr)
    minmax(188px, 1.28fr)
    minmax(106px, 0.72fr)
    minmax(112px, 0.76fr);
  gap: 8px;
  padding-inline: 10px;
}

.purchase-receipt-status-shell .warehouse-operation-table .table-row:not(.table-head) {
  height: 96px;
  min-height: 96px;
}

.purchase-receipt-status-shell .quote-status-column {
  grid-auto-rows: 96px;
}

.purchase-receipt-status-shell .operation-quantity {
  color: #3e4941;
  font-size: 11px;
  font-weight: 700;
  -webkit-line-clamp: 2;
}

.purchase-receipt-status-shell .date-stack {
  gap: 2px;
}

.purchase-receipt-status-shell .date-stack > strong {
  font-variant-numeric: tabular-nums;
}

.warehouse-purchaseReceipts-page .timing-risk {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  width: max-content;
  padding: 2px 5px;
  border-radius: 5px;
  line-height: 1.2;
}

.warehouse-purchaseReceipts-page .timing-risk.tone-warning {
  background: #f4ecdf;
}

.warehouse-purchaseReceipts-page .timing-risk.tone-danger {
  background: #f4e6e3;
}

.warehouse-salesIssues-page .timing-risk {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  width: max-content;
  padding: 2px 5px;
  border-radius: 5px;
  line-height: 1.2;
}

.warehouse-salesIssues-page .timing-risk.tone-warning {
  background: #f4ecdf;
}

.warehouse-salesIssues-page .timing-risk.tone-danger {
  background: #f4e6e3;
}

.sales-issue-status-shell .warehouse-operation-table .table-row:not(.table-head),
.production-issue-status-shell .warehouse-operation-table .table-row:not(.table-head),
.production-return-status-shell .warehouse-operation-table .table-row:not(.table-head),
.production-receipt-status-shell .warehouse-operation-table .table-row:not(.table-head),
.other-move-status-shell .warehouse-operation-table .table-row:not(.table-head),
.transfer-status-shell .warehouse-operation-table .table-row:not(.table-head),
.stocktake-status-shell .warehouse-operation-table .table-row:not(.table-head) {
  height: 88px;
  min-height: 88px;
}

.sales-issue-status-shell .quote-status-column,
.production-issue-status-shell .quote-status-column,
.production-return-status-shell .quote-status-column,
.production-receipt-status-shell .quote-status-column,
.other-move-status-shell .quote-status-column,
.transfer-status-shell .quote-status-column,
.stocktake-status-shell .quote-status-column {
  grid-auto-rows: 88px;
}

.warehouse-card-progress {
  padding: 7px 4px;
  border-top: 1px solid #ecece5;
  border-bottom: 1px solid #ecece5;
  color: #3a3d37;
  font-size: 11px;
  font-weight: 650;
}

@media (max-width: 1120px) and (min-width: 761px) {
  .purchase-receipt-status-shell {
    grid-template-columns: minmax(0, 1fr) 252px;
  }

  .sales-issue-status-shell {
    grid-template-columns: minmax(0, 1fr) 204px;
  }

  .sales-issue-status-shell .warehouse-operation-table .table-row {
    grid-template-columns:
      minmax(108px, 0.76fr)
      minmax(132px, 0.94fr)
      minmax(174px, 1.22fr)
      minmax(98px, 0.7fr)
      minmax(104px, 0.74fr);
  }

  .production-issue-status-shell {
    grid-template-columns: minmax(0, 1fr) 250px;
  }

  .production-return-status-shell {
    grid-template-columns: minmax(0, 1fr) 250px;
  }

  .production-receipt-status-shell {
    grid-template-columns: minmax(0, 1fr) 250px;
  }

  .warehouse-fact-status-cell {
    padding-inline: 7px;
  }
}

@media (max-width: 980px) {
  .warehouse-purchaseReceipts-page .purchase-receipt-status-shell {
    display: none;
  }

  .warehouse-purchaseReceipts-page .quote-card-list {
    display: grid;
    gap: 10px;
  }

  .warehouse-purchaseReceipts-page .quote-card-main > strong {
    max-width: 44%;
    color: #3e4941;
    font-size: 14px;
    line-height: 1.35;
    white-space: normal;
  }
}
</style>
