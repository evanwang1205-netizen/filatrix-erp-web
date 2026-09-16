<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Paperclip,
  Printer,
  Save,
  Upload,
} from 'lucide-vue-next';

import DocumentLoadState from '../components/DocumentLoadState.vue';
import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';
import FlowRecordPanel from '../components/FlowRecordPanel.vue';
import MaterialIdentity from '../components/MaterialIdentity.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import { useAsyncActionState } from '../composables/useAsyncActionState';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import { statusPresentationClass } from '../utils/statusPresentation';
import { productVisuals } from '../data/sales';
import {
  getSalesOrder,
  getSalesOutboundRequest,
  listSalesDeliveryRecords,
  listSalesInventory,
  saveSalesOutboundRequest,
  submitSalesOutboundRequest,
} from '../services/api';
import type {
  FlowRecord,
  Attachment,
  SalesDeliveryRecord,
  SalesOrder,
  SalesOrderProduct,
  SalesOutboundRequest,
  SalesOutboundRequestProduct,
  SalesInventoryProjectionRow,
} from '../types/business';
import type { DocumentStatusItem } from '../types/documentUi';
import { attachmentsFromFileList } from '../utils/attachmentUpload';
import { productIdentity, productQtyWithUnit } from '../utils/productDisplay';
import { normalizeSalesDeliveryMethod, salesDeliveryMethodOptions } from '../utils/salesTerms';

type OutboundAsyncAction = 'save' | 'submit';

const route = useRoute();
const router = useRouter();
const showFlowRecords = ref(false);
const outboundMoreActionsOpen = ref(false);
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const isSaving = ref(false);
const {
  activeAction: activeOutboundAction,
  isActionPending: isOutboundActionPending,
  runAction: runOutboundAction,
} = useAsyncActionState<OutboundAsyncAction>();
const loadMessage = ref('');
const isLoading = ref(false);
const requestDraft = ref<SalesOutboundRequest | null>(createEmptyRequest());
const flowRecords = ref<FlowRecord[]>([]);
const relatedDeliveryRecords = ref<SalesDeliveryRecord[]>([]);
const warehouseInventoryRows = ref<SalesInventoryProjectionRow[]>([]);
const sourceOrder = ref<SalesOrder | null>(null);
const deliveryRecordsLoadError = ref('');
const inventoryLoadError = ref('');
const sourceOrderLoadError = ref('');
const isSignalReloading = ref(false);
const deliveryMethodOptions = salesDeliveryMethodOptions;
let toastTimer: number | undefined;
const { canWrite: canWriteSales, readonlyReason: salesReadonlyReason } = useModulePermission('sales');
const { canOperate: canApproveSales, readonlyReason: salesApproveReadonlyReason } = useOperationPermission('salesApprove', '处理销售单据状态');

const mode = computed(() => route.name?.toString() ?? '');
const isNew = computed(() => mode.value === 'sales-outbound-request-new');
const isEdit = computed(() => mode.value === 'sales-outbound-request-edit');
const isDetail = computed(() => mode.value === 'sales-outbound-request-detail');
const requestStatus = computed(() => requestDraft.value?.status ?? '');
const isTerminalRequest = computed(() => ['已出库', '已发完', '已签收', '已完成', '已作废'].includes(requestStatus.value));
const referenceTitle = computed(() => `交付追踪 ${requestDraft.value?.code || ''}`.trim());
const referenceSubtitle = computed(() => `${requestDraft.value?.customer || '未选择客户'} · ${statusLabel(requestStatus.value)}`);
const referencePath = computed(() => (requestDraft.value?.code ? `/sales/outbound-requests/${encodeURIComponent(requestDraft.value.code)}` : ''));
const detailPath = computed(() => (
  requestDraft.value?.code && requestDraft.value.code !== '系统自动生成'
    ? `/sales/outbound-requests/${encodeURIComponent(requestDraft.value.code)}`
    : '/sales/outbound-requests'
));
const editPath = computed(() => (
  requestDraft.value?.code && requestDraft.value.code !== '系统自动生成'
    ? `/sales/outbound-requests/${encodeURIComponent(requestDraft.value.code)}/edit`
    : '/sales/outbound-requests'
));
const isReadOnly = computed(() => isDetail.value || isTerminalRequest.value || !canWriteSales.value);
const { resetUnsavedChanges } = useUnsavedChangesGuard(requestDraft, {
  enabled: computed(() => !isReadOnly.value),
  ready: computed(() => !isLoading.value),
});
const operationPermissionHint = computed(() => (
  canWriteSales.value && !canApproveSales.value ? salesApproveReadonlyReason.value : ''
));
const operationPermissionSuffix = computed(() => (
  isTerminalRequest.value
    ? '交付已经结束，当前页面只保留业务记录和追溯信息。'
    : isDetail.value
    ? '提交、变更和异常处理会保持不可用。'
    : '可维护计划发货、物流和收货信息；来源订单、发货明细与补充要求保持冻结。'
));
const pageHeading = computed(() => {
  if (isNew.value) return '新建交付追踪';
  if (isEdit.value) return isTerminalRequest.value ? '交付追踪只读' : `交付追踪变更 ${requestDraft.value?.code || ''}`.trim();
  return '交付追踪详情';
});
const showSubmitRequest = computed(() => (
  isDetail.value
  && Boolean(requestDraft.value?.code)
  && requestDraft.value?.status === '草稿'
));
const canSubmitRequest = computed(() => showSubmitRequest.value && canWriteSales.value && canApproveSales.value);
const submitRequestReadonlyReason = computed(() => {
  if (!showSubmitRequest.value) return '当前状态不能提交交付追踪。';
  if (!canWriteSales.value) return salesReadonlyReason.value;
  if (!canApproveSales.value) return salesApproveReadonlyReason.value;
  return '';
});
type OutboundMoreAction = {
  key: 'source' | 'change';
  label: string;
  description: string;
  tone?: 'normal' | 'danger';
};
const outboundMoreActions = computed<OutboundMoreAction[]>(() => {
  const draft = requestDraft.value;
  if (!isDetail.value || !draft) return [];
  const actions: OutboundMoreAction[] = [];
  if (draft.sourceOrder) {
    actions.push({
      key: 'source',
      label: '来源订单',
      description: '打开产生本次交付追踪的销售订单。',
    });
  }
  if (canWriteSales.value && draft.code && draft.code !== '系统自动生成' && !['已出库', '已发完', '已签收', '已完成', '已作废'].includes(draft.status)) {
    actions.push({
      key: 'change',
      label: '变更',
      description: '调整计划发货、物流或收货信息。',
    });
  }
  return actions;
});
const lineItems = computed(() =>
  (requestDraft.value?.products ?? []).map((product, index) => ({
    key: `${product.materialCode || product.name || 'new'}-${index}`,
    ...product,
    image: productVisuals[product.name] ?? { label: product.imageLabel || '', tone: product.imageTone || '#eeeeee' },
  })),
);
const summaryRows = computed(() => {
  const draft = requestDraft.value;
  if (!draft) return [];
  const totalPlanned = draft.products.reduce((sum, product) => sum + parseQty(product.requestQty || product.qty), 0);
  const totalShipped = shippedDeliveryRecords.value.reduce(
    (sum, issue) => sum + issue.products.reduce((productSum, product) => productSum + parseQty(product.qty), 0),
    0,
  );
  const unit = qtyUnit(draft.products[0]?.requestQty || draft.products[0]?.qty);
  return [
    { label: '发货品项', value: `${draft.products.length} 项` },
    { label: '计划数量', value: formatQty(totalPlanned, unit) },
    { label: '累计已发', value: deliveryRecordsLoadError.value ? '—' : formatQty(totalShipped, unit) },
    { label: '剩余待发', value: deliveryRecordsLoadError.value ? '—' : formatQty(Math.max(0, totalPlanned - totalShipped), unit) },
    { label: '计划日期', value: draft.expectedDate || '-' },
    { label: '承诺交付', value: draft.deliveryDate || '-' },
  ];
});
const outboundAttachments = computed<Attachment[]>(() => requestDraft.value?.attachments ?? []);
const outboundAttachmentTitle = computed(() => {
  if (isTerminalRequest.value) return '交付已经结束，附件仅供查看。';
  if (isReadOnly.value) return '详情页只允许查看附件，请通过变更进入维护。';
  return '上传客户确认、物流要求或交付附件。';
});

const shipmentBatches = computed(() => relatedDeliveryRecords.value
  .filter((record) => !record.reversalCode && !['已作废', '已取消', '已冲销'].includes(record.status))
  .sort((a, b) => `${b.date}${b.code}`.localeCompare(`${a.date}${a.code}`)));
const shippedDeliveryRecords = computed(() => shipmentBatches.value.filter((record) => record.status === '已出库'));
function deliveryRecordWarehouseText(record: SalesDeliveryRecord) {
  const actualNames = [...new Set(
    (record.actualWarehouses || []).map((warehouse) => String(warehouse.name || '').trim()).filter(Boolean),
  )];
  if (actualNames.length) return actualNames.join('、');
  if (record.status === '待拣货') return '待仓库拣货确认';
  return record.warehouse || '待仓库确认';
}
const deliverySignalErrors = computed(() => [
  deliveryRecordsLoadError.value,
  inventoryLoadError.value,
  sourceOrderLoadError.value,
].filter(Boolean));
const shipmentProgressRows = computed(() => {
  const draft = requestDraft.value;
  if (!draft) return [];

  return draft.products.map((product) => {
    const key = shipmentProductKey(product);
    const planned = parseQty(product.requestQty || product.qty);
    const unit = product.uom || qtyUnit(product.requestQty || product.qty);
    if (deliveryRecordsLoadError.value) {
      return {
        key,
        material: product,
        planned: formatQty(planned, unit),
        shipped: '—',
        remaining: '—',
        status: '数据待重试',
      };
    }
    const shipped = shippedDeliveryRecords.value.reduce((sum, record) => {
      const lineTotal = record.products
        .filter((line) => shipmentProductKey(line) === key)
        .reduce((lineSum, line) => lineSum + parseQty(line.qty), 0);
      return sum + lineTotal;
    }, 0);
    const remaining = Math.max(0, planned - shipped);

    return {
      key,
      material: product,
      planned: formatQty(planned, unit),
      shipped: formatQty(shipped, unit),
      remaining: formatQty(remaining, unit),
      status: shipped <= 0 ? '待发货' : remaining <= 0 ? '已发完' : '部分出库',
    };
  });
});
const deliveryCapabilityRows = computed(() => {
  const draft = requestDraft.value;
  if (!draft || deliverySignalErrors.value.length) return [];

  return draft.products
    .filter((product) => productIdentity(product, '').trim())
    .map((product) => {
      const inventoryRows = warehouseInventoryRows.value.filter((row) => matchesProduct(row, product));
      const unit = product.uom || qtyUnit(product.requestQty || product.qty) || qtyUnit(inventoryRows[0]?.available) || '件';
      const orderQty = parseQty(product.requestQty || product.qty);
      const shippedQty = shippedDeliveryRecords.value.reduce((sum, record) => {
        return sum + record.products
          .filter((line) => shipmentProductKey(line) === shipmentProductKey(product))
          .reduce((lineSum, line) => lineSum + parseQty(line.qty), 0);
      }, 0);
      const remainingQty = Math.max(0, orderQty - shippedQty);
      const availableQty = inventoryRows.reduce((sum, row) => sum + parseQty(row.available), 0);
      const pendingOutboundQty = inventoryRows.reduce((sum, row) => sum + parseQty(row.outboundPlan), 0);
      const inboundPlanQty = inventoryRows.reduce((sum, row) => sum + parseQty(row.inboundPlan), 0);
      const reservedForSourceOrder = inventoryRows.reduce((sum, row) => {
        return sum + (row.salesReservationSources || [])
          .filter((source) => source.sourceDoc === draft.sourceOrder && !['已释放', '已作废'].includes(source.status))
          .reduce((sourceSum, source) => sourceSum + parseQty(source.qty), 0);
      }, 0);
      const sourceProduct = sourceOrder.value?.products.find((orderProduct) => (
        product.materialCode
          ? orderProduct.materialCode === product.materialCode
          : orderProduct.name === product.name
      ));
      const productionDemandQty = (sourceProduct?.fulfillmentLinks || [])
        .filter((link) => link.type === '生产任务' && !['已关闭', '已作废', '已取消'].includes(link.status))
        .reduce((sum, link) => sum + parseQty(link.qty), 0);
      const committableQty = Math.min(
        remainingQty,
        Math.max(0, availableQty - pendingOutboundQty) + reservedForSourceOrder,
      );
      const shortageQty = Math.max(0, remainingQty - committableQty);
      const shortageAfterPlanQty = Math.max(0, shortageQty - inboundPlanQty - productionDemandQty);
      const updateTimes = inventoryRows.map((row) => row.updatedAt).sort();
      const latestUpdate = updateTimes[updateTimes.length - 1] || '';
      const plannedSupplyQty = inboundPlanQty + productionDemandQty;
      const plannedCoverageQty = Math.min(shortageQty, plannedSupplyQty);
      const status =
        !orderQty
          ? '待确认数量'
          : remainingQty <= 0
            ? '已发完'
            : shortageQty <= 0
              ? '现货可发'
              : committableQty > 0
                ? '部分可发'
                : plannedSupplyQty >= shortageQty
                  ? '待补充'
                  : '需补货';

      return {
        key: `${product.materialCode || product.name}-${product.requestQty || product.qty}`,
        material: product,
        orderQty: formatQty(orderQty, unit),
        shippedQty: formatQty(shippedQty, unit),
        remainingQty: formatQty(remainingQty, unit),
        availableQty: formatQty(availableQty, unit),
        reservedQty: formatQty(reservedForSourceOrder, unit),
        pendingOutboundQty: formatQty(pendingOutboundQty, unit),
        committableQty: formatQty(committableQty, unit),
        plannedSupplyQty: formatQty(plannedCoverageQty, unit),
        shortageAfterPlanQty: formatQty(shortageAfterPlanQty, unit),
        productionStatus: productionDemandQty > 0
          ? `生产需求 ${formatQty(productionDemandQty, unit)}`
          : inboundPlanQty > 0
            ? `待入库补充 ${formatQty(inboundPlanQty, unit)}`
            : shortageQty > 0
              ? '暂无补充计划'
              : '无需补充',
        inventoryUpdateText: inventoryRows.length
          ? `库存更新 ${latestUpdate || '—'}`
          : '暂无库存记录',
        status,
      };
    });
});
const deliveryCapabilitySummary = computed(() => {
  const rows = deliveryCapabilityRows.value;
  if (!rows.length) return '选择销售物料后自动计算库存和补货缺口。';
  if (rows.every((row) => row.status === '已发完')) return '本次计划已经全部出库，无需再判断当前可发数量。';
  if (rows.every((row) => row.status === '现货可发' || row.status === '已发完')) return '剩余发货可按库存直接推进。';
  if (rows.some((row) => row.status === '需补货')) return '存在尚未覆盖的交付缺口，需要协调生产或补货。';
  if (rows.some((row) => row.status === '部分可发')) return '现有库存可先发一部分，剩余数量结合补充计划继续跟进。';
  return '部分销售物料需要等待待入库或生产补充。';
});
const showDeliveryCapability = computed(() => deliveryCapabilityRows.value.some((row) => row.status !== '已发完'));

const outboundRequiredLabels = new Set([
  '计划发货日期',
  '物流方式',
  '收货联系人',
  '联系方式',
  '收货地址',
]);

function outboundRequiredLabelClass(label: string) {
  return {
    'is-required-field': !isReadOnly.value && outboundRequiredLabels.has(label),
  };
}

const outboundNextStepGuidance = computed(() => {
  const status = requestStatus.value;
  const rows = deliveryCapabilityRows.value;
  const plannedShipDate = requestDraft.value?.expectedDate || '';
  const promisedDate = requestDraft.value?.deliveryDate || '';
  const todayDate = today();

  if (status === '已作废') {
    return {
      label: '已终止',
      description: '这张交付追踪已停止流转，仅保留来源订单、发货要求和处理记录用于追溯。',
      action: '查看日志',
      tone: 'done',
    };
  }

  if (status === '已签收' || status === '已完成') {
    return {
      label: '客户已签收',
      description: '本次计划已全部出库并完成客户签收，交付追踪只保留出库批次、物流要求和签收记录用于追溯。',
      action: '查看交付记录',
      tone: 'done',
    };
  }

  if (status === '已出库' || status === '已发完') {
    return {
      label: '回到订单确认签收',
      description: '仓库已完成出库，销售下一步应在销售订单中跟进客户签收、异常和后续开票节点。',
      action: '查看来源订单',
      tone: 'done',
    };
  }

  if (status === '部分出库' || status === '部分发货') {
    return {
      label: '跟进剩余发货',
      description: '已有部分批次出库，重点关注剩余数量、库存缺口和客户交期是否需要重新沟通。',
      action: '查看分批进度',
      tone: 'tracking',
    };
  }

  if (status === '仓库已受理') {
    return {
      label: '等待仓库复核出库',
      description: '仓库已开始拣货、复核或分批安排，销售侧主要关注交期风险和客户沟通。',
      action: '关注复核进度',
      tone: 'tracking',
    };
  }

  if (status === '草稿') {
    return {
      label: '确认发货要求',
      description: '补齐来源订单、计划发货和收货信息后，再进入仓库拣货和出库安排。',
      action: '确认发货要求',
      tone: 'pending',
    };
  }

  if (promisedDate && promisedDate < todayDate) {
    return {
      label: '交付已逾期',
      description: `承诺交付日为 ${promisedDate}，当前仍未完成出库和签收，请立即确认仓库进度并同步客户。`,
      action: '立即跟进交付',
      tone: 'pending',
    };
  }

  if (plannedShipDate && plannedShipDate < todayDate) {
    return {
      label: '发货已逾期',
      description: `计划发货日为 ${plannedShipDate}，当前仍未完成出库，请立即确认拣货、复核和发运安排。`,
      action: '立即跟进仓库',
      tone: 'pending',
    };
  }

  if (rows.some((row) => row.status === '需补货' || row.status === '部分可发' || row.status === '待补充')) {
    return {
      label: '协调补货或分批',
      description: '当前存在库存缺口，先明确能否分批发货、生产补货计划和客户可接受交期。',
      action: '先处理缺口',
      tone: 'pending',
    };
  }

  return {
    label: '等待仓库拣货',
    description: '发货要求已形成，仓库任务已经进入待拣货，销售侧继续关注计划日期和交付风险。',
    action: '仓库拣货',
    tone: 'tracking',
  };
});

const outboundStatusPanelItems = computed<DocumentStatusItem[]>(() => {
  const facts = Object.fromEntries(summaryRows.value.map((row) => [row.label, row.value]));
  return [
    {
      key: 'shipment',
      label: '发货进度',
      value: `${facts['累计已发'] || '-'} / ${facts['计划数量'] || '-'}`,
      kind: 'metric',
    },
    { key: 'remaining', label: '剩余待发', value: facts['剩余待发'] || '-', kind: 'metric' },
    { key: 'promise', label: '承诺交付', value: facts['承诺交付'] || '-', kind: 'text' },
  ];
});

function today(offsetDays = 0) {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function parseQty(value?: string) {
  return Number(String(value ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] ?? 0);
}

function qtyUnit(value?: string) {
  return String(value || '').replace(/[\d,.\s-]/g, '').trim();
}

function formatQty(value: number, unit?: string) {
  const text = Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
  return unit ? `${text} ${unit}` : text;
}

function shipmentProductKey(product: { materialCode?: string; name: string }) {
  return product.materialCode || product.name;
}

function inventoryMaterialCode(row: SalesInventoryProjectionRow) {
  return row.materialCode || '';
}

function matchesProduct(row: SalesInventoryProjectionRow | SalesOutboundRequestProduct, product: SalesOutboundRequestProduct) {
  const rowCode = 'item' in row ? inventoryMaterialCode(row) : row.materialCode || '';
  const rowName = 'item' in row ? row.item : row.name;
  if (product.materialCode && rowCode) return rowCode === product.materialCode;
  return Boolean(product.name && rowName === product.name);
}

function deliveryCapabilityStatusClass(status: string) {
  if (status === '现货可发' || status === '已发完') return 'status-done';
  if (status === '待补充' || status === '部分可发') return 'status-confirmed';
  if (status === '需补货' || status === '待确认数量') return 'status-pending';
  return 'status-neutral';
}

function createEmptyLine(): SalesOutboundRequestProduct {
  return {
    materialCode: '',
    name: '',
    qty: '',
    requestQty: '',
    uom: '',
  };
}

function createEmptyRequest(): SalesOutboundRequest {
  return {
    code: '系统自动生成',
    sourceOrder: (route.query.order || route.query.source)?.toString() ?? '',
    customerCode: '',
    customer: '',
    contact: '',
    contactPhone: '',
    products: [createEmptyLine()],
    applicant: '李明',
    status: '草稿',
    requestDate: today(),
    expectedDate: today(7),
    deliveryDate: '',
    deliveryMethod: '',
    warehouseCode: '',
    warehouse: '',
    address: '',
    supplementaryRequirement: '',
    remark: '',
    attachments: [],
  };
}

function toOutboundRequest(source: Partial<SalesOutboundRequest>): SalesOutboundRequest {
  const request = {
    ...createEmptyRequest(),
    ...source,
    products: source.products?.length ? source.products : [createEmptyLine()],
    attachments: source.attachments ?? [],
  };

  return {
    ...request,
    supplementaryRequirement: source.supplementaryRequirement ?? source.remark ?? '',
    remark: source.supplementaryRequirement ?? source.remark ?? '',
    deliveryMethod: normalizeSalesDeliveryMethod(request.deliveryMethod),
  };
}

function statusClass(status: string) {
  return statusPresentationClass(status);
}

function statusLabel(status: string) {
  if (status === '已提交') return '待发货';
  return status;
}

function mapOrderProduct(product: SalesOrderProduct): SalesOutboundRequestProduct {
  return {
    materialCode: product.materialCode || '',
    name: product.name,
    model: product.model || '',
    spec: product.spec || '',
    qty: product.qty,
    requestQty: product.qty,
    uom: product.uom || '',
    imageLabel: product.imageLabel || '',
    imageTone: product.imageTone || '',
  };
}

function applySalesOrder(order: SalesOrder) {
  if (!requestDraft.value) return;
  if (!order.code) {
    const emptyRequest = createEmptyRequest();
    requestDraft.value.sourceOrder = '';
    requestDraft.value.customerCode = '';
    requestDraft.value.customer = '';
    requestDraft.value.contact = '';
    requestDraft.value.contactPhone = '';
    requestDraft.value.products = [createEmptyLine()];
    requestDraft.value.expectedDate = emptyRequest.expectedDate;
    requestDraft.value.deliveryDate = '';
    requestDraft.value.deliveryMethod = emptyRequest.deliveryMethod;
    requestDraft.value.address = '';
    requestDraft.value.supplementaryRequirement = '';
    requestDraft.value.remark = '';
    return;
  }
  requestDraft.value.sourceOrder = order.code;
  requestDraft.value.customerCode = order.customerCode || '';
  requestDraft.value.customer = order.customer;
  requestDraft.value.contact = order.contact;
  requestDraft.value.contactPhone = order.contactPhone || '';
  requestDraft.value.products = order.products.length ? order.products.map(mapOrderProduct) : [createEmptyLine()];
  requestDraft.value.expectedDate = order.plannedShipDate || order.delivery || requestDraft.value.expectedDate;
  requestDraft.value.deliveryDate = order.delivery || requestDraft.value.deliveryDate || '';
  requestDraft.value.deliveryMethod = normalizeSalesDeliveryMethod(order.logisticsMode || order.deliveryMethod || requestDraft.value.deliveryMethod);
  requestDraft.value.contact = order.shipContact || order.contact || '';
  requestDraft.value.contactPhone = order.shipPhone || order.contactPhone || '';
  requestDraft.value.address = order.shipAddress || (order.remark?.includes('自提') ? '客户自提' : requestDraft.value.address);
  requestDraft.value.supplementaryRequirement = order.supplementaryRequirement || order.internalRemark || '';
  requestDraft.value.remark = requestDraft.value.supplementaryRequirement;
}

async function loadSourceOrderFromQuery() {
  const code = (route.query.order || route.query.source)?.toString() ?? '';
  if (!code || !requestDraft.value || requestDraft.value.sourceOrder !== code) return;

  try {
    const response = await getSalesOrder(code);
    applySalesOrder(response.order);
  } catch {
    loadMessage.value = '来源销售订单暂时无法读取，可手动选择或填写出库信息。';
  }
}

function resetDeliverySignals() {
  relatedDeliveryRecords.value = [];
  warehouseInventoryRows.value = [];
  sourceOrder.value = null;
  deliveryRecordsLoadError.value = '';
  inventoryLoadError.value = '';
  sourceOrderLoadError.value = '';
}

async function loadRelatedDeliveryRecords(requestDoc: SalesOutboundRequest | null) {
  deliveryRecordsLoadError.value = '';
  relatedDeliveryRecords.value = [];
  if (!requestDoc?.sourceOrder) return;

  try {
    const records = await listSalesDeliveryRecords(requestDoc.sourceOrder);
    relatedDeliveryRecords.value = records.filter((record) => record.sourceOrder === requestDoc.sourceOrder);
  } catch (error) {
    deliveryRecordsLoadError.value = error instanceof Error
      ? `交付记录读取失败：${error.message}`
      : '交付记录读取失败，请重试。';
  }
}

async function loadSalesInventorySignal(requestDoc: SalesOutboundRequest | null) {
  inventoryLoadError.value = '';
  warehouseInventoryRows.value = [];
  if (!requestDoc?.sourceOrder) return;

  try {
    warehouseInventoryRows.value = await listSalesInventory();
  } catch (error) {
    inventoryLoadError.value = error instanceof Error
      ? `库存判断读取失败：${error.message}`
      : '库存判断读取失败，请重试。';
  }
}

async function loadSourceOrderSignal(requestDoc: SalesOutboundRequest | null) {
  sourceOrderLoadError.value = '';
  sourceOrder.value = null;
  if (!requestDoc?.sourceOrder) return;

  try {
    const response = await getSalesOrder(requestDoc.sourceOrder);
    sourceOrder.value = response.order;
  } catch (error) {
    sourceOrderLoadError.value = error instanceof Error
      ? `来源订单读取失败：${error.message}`
      : '来源订单读取失败，请重试。';
  }
}

async function loadDeliverySignals(requestDoc: SalesOutboundRequest | null) {
  if (!requestDoc?.sourceOrder) {
    resetDeliverySignals();
    return;
  }

  await Promise.all([
    loadRelatedDeliveryRecords(requestDoc),
    loadSalesInventorySignal(requestDoc),
    loadSourceOrderSignal(requestDoc),
  ]);
}

async function retryDeliverySignals() {
  if (!requestDraft.value || isSignalReloading.value) return;
  isSignalReloading.value = true;
  try {
    await loadDeliverySignals(requestDraft.value);
  } finally {
    isSignalReloading.value = false;
  }
}

async function loadRequest() {
  loadMessage.value = '';
  isLoading.value = !isNew.value;
  if (!isNew.value) {
    requestDraft.value = null;
    flowRecords.value = [];
    resetDeliverySignals();
  }

  try {
    if (isNew.value) {
      requestDraft.value = createEmptyRequest();
      flowRecords.value = [];
      resetDeliverySignals();
      await loadSourceOrderFromQuery();
      await loadDeliverySignals(requestDraft.value);
      return;
    }

    const code = route.params.code?.toString() ?? '';
    if (!code) return;

    const response = await getSalesOutboundRequest(code);
    requestDraft.value = toOutboundRequest(response.request);
    flowRecords.value = response.flowRecords;
    await loadDeliverySignals(requestDraft.value);
  } catch (error) {
    requestDraft.value = null;
    flowRecords.value = [];
    resetDeliverySignals();
    loadMessage.value = error instanceof Error ? error.message : '交付追踪加载失败';
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

async function saveRequestDraft() {
  if (!requestDraft.value) return;
  if (!canWriteSales.value) {
    showToast(salesReadonlyReason.value, 'error');
    return;
  }
  await runOutboundAction('save', async () => {
    isSaving.value = true;
    try {
      const response = await saveSalesOutboundRequest(toOutboundRequest(requestDraft.value!));
      requestDraft.value = toOutboundRequest(response.request);
      flowRecords.value = response.flowRecords;
      await loadDeliverySignals(requestDraft.value);
      resetUnsavedChanges();
      showToast('交付追踪已保存');
      if (isNew.value && response.request.code) {
        await router.replace(`/sales/outbound-requests/${encodeURIComponent(response.request.code)}/edit`);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '交付追踪保存失败', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

async function submitRequest() {
  if (!requestDraft.value?.code) return;
  if (!canSubmitRequest.value) {
    showToast(submitRequestReadonlyReason.value, 'error');
    return;
  }
  await runOutboundAction('submit', async () => {
    isSaving.value = true;
    try {
      const response = await submitSalesOutboundRequest(requestDraft.value!.code);
      requestDraft.value = toOutboundRequest(response.request);
      flowRecords.value = response.flowRecords;
      await loadDeliverySignals(requestDraft.value);
      resetUnsavedChanges();
      showToast('交付追踪已提交');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '交付追踪提交失败', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

async function handleOutboundMoreAction(action: OutboundMoreAction) {
  outboundMoreActionsOpen.value = false;
  if (action.key === 'source') {
    openSourceOrder();
    return;
  }
  if (action.key === 'change') {
    await router.push(editPath.value);
  }
}

function printRequest() {
  window.print();
}

function handleAttachmentUpload(event: Event) {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (!input) return;
  if (isReadOnly.value) {
    input.value = '';
    showToast(outboundAttachmentTitle.value, 'error');
    return;
  }

  const files = attachmentsFromFileList(input.files);
  if (files.length && requestDraft.value) {
    requestDraft.value.attachments = [...(requestDraft.value.attachments ?? []), ...files];
    showToast(`已选择 ${files.length} 个附件，保存后随交付追踪保留。`);
  }
  input.value = '';
}

function openSourceOrder() {
  if (!requestDraft.value?.sourceOrder) return;
  outboundMoreActionsOpen.value = false;
  void router.push(`/sales/orders/${encodeURIComponent(requestDraft.value.sourceOrder)}`);
}

watch(() => route.fullPath, loadRequest, { immediate: true });
watch(() => route.fullPath, () => {
  outboundMoreActionsOpen.value = false;
});

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section v-if="requestDraft" class="quote-editor outbound-editor" :class="{ 'is-detail-view': isDetail, 'is-full-width-editor': !isDetail }">
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" to="/sales/outbound-requests" aria-label="返回交付追踪列表" title="返回交付追踪列表">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ isDetail ? requestDraft.code : pageHeading }}</strong>
        </template>

        <template #actions>
          <template v-if="isDetail">
            <PinReferenceButton
              class="topbar-optional-action"
              v-if="referencePath"
              :title="referenceTitle"
              :subtitle="referenceSubtitle"
              :path="referencePath"
            />
            <button class="secondary-action topbar-optional-action" type="button" title="打印当前交付追踪" @click="printRequest">
              <Printer :size="15" />
              打印
            </button>
            <button class="secondary-action topbar-optional-action" type="button" title="查看交付追踪日志" @click="showFlowRecords = true">
              <FileText :size="15" />
              日志
            </button>
            <div
              v-if="outboundMoreActions.length"
              class="order-more-action-wrap"
              @keydown.esc.stop="outboundMoreActionsOpen = false"
              @mouseleave="outboundMoreActionsOpen = false"
            >
              <button
                class="secondary-action"
                type="button"
                title="更多操作"
                aria-haspopup="menu"
                aria-controls="detail-more-menu"
                :aria-expanded="outboundMoreActionsOpen"
                @click="outboundMoreActionsOpen = !outboundMoreActionsOpen"
              >
                更多
              </button>
              <div v-if="outboundMoreActionsOpen" id="detail-more-menu" class="order-more-menu" role="menu">
                <button
                  v-for="action in outboundMoreActions"
                  :key="action.key"
                  type="button"
                  role="menuitem"
                  :class="{ 'danger-option': action.tone === 'danger' }"
                  :title="action.description"
                  @click="handleOutboundMoreAction(action)"
                >
                  <strong>{{ action.label }}</strong>
                  <span>{{ action.description }}</span>
                </button>
              </div>
            </div>
            <button
              v-if="showSubmitRequest"
              class="primary-action async-document-action"
              type="button"
              :disabled="isSaving || isOutboundActionPending || !canSubmitRequest"
              :aria-busy="activeOutboundAction === 'submit'"
              :title="submitRequestReadonlyReason"
              @click="submitRequest"
            >
              <CheckCircle2 :size="15" />
              {{ activeOutboundAction === 'submit' ? '提交中' : '提交' }}
            </button>
          </template>

          <template v-else>
            <RouterLink class="secondary-action" :to="detailPath" title="取消编辑并返回详情">取消</RouterLink>
            <button
              class="primary-action async-document-action"
              type="button"
              :disabled="isSaving || isOutboundActionPending || !canWriteSales"
              :aria-busy="activeOutboundAction === 'save'"
              :title="canWriteSales ? '' : salesReadonlyReason"
              @click="saveRequestDraft"
            >
              <Save :size="15" />
              {{ activeOutboundAction === 'save' ? '保存中' : '保存' }}
            </button>
          </template>
        </template>

        <template #fallback>
          <div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1><p v-if="loadMessage" class="section-hint">{{ loadMessage }}</p></div></div>
        </template>
      </PageTopbarPortal>

      <OperationPermissionBanner :message="operationPermissionHint" :suffix="operationPermissionSuffix" />

      <section
        v-if="deliverySignalErrors.length"
        class="outbound-signal-load-alert"
        role="alert"
        aria-live="assertive"
      >
        <div>
          <strong>部分交付数据暂时无法读取</strong>
          <span v-for="message in deliverySignalErrors" :key="message">{{ message }}</span>
        </div>
        <button
          class="secondary-action compact-action"
          type="button"
          :disabled="isSignalReloading"
          title="重新加载交付记录、库存判断和来源订单"
          @click="retryDeliverySignals"
        >
          {{ isSignalReloading ? '重新加载中' : '重新加载' }}
        </button>
      </section>

      <section v-if="isDetail" class="order-next-step-strip outbound-next-step-strip" :class="`tone-${outboundNextStepGuidance.tone}`">
        <div>
          <span>下一步</span>
          <strong>{{ outboundNextStepGuidance.label }}</strong>
          <p>{{ outboundNextStepGuidance.description }}</p>
        </div>
        <b>{{ outboundNextStepGuidance.action }}</b>
      </section>

      <div class="quote-form-grid">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading">
              <h2>交付信息</h2>
            </div>

            <dl class="material-fact-grid quote-detail-fact-grid outbound-detail-fact-grid">
              <div><dt>追踪单号</dt><dd>{{ requestDraft.code }}</dd></div>
              <div><dt>来源销售订单</dt><dd><RouterLink :to="`/sales/orders/${encodeURIComponent(requestDraft.sourceOrder)}`">{{ requestDraft.sourceOrder }}</RouterLink></dd></div>
              <div><dt>公司</dt><dd>{{ requestDraft.company || '未维护' }}</dd></div>
              <div><dt>客户</dt><dd>{{ requestDraft.customer || '未维护' }}</dd></div>
              <div><dt>负责人</dt><dd>{{ requestDraft.applicant || '未维护' }}</dd></div>
              <div><dt>生成日期</dt><dd>{{ requestDraft.requestDate || '未维护' }}</dd></div>
            </dl>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>发货明细</h2>
            </div>

            <div class="master-relation-table-wrap quote-detail-table-wrap">
              <table class="master-relation-table outbound-detail-table">
                <thead><tr><th>销售物料</th><th>订单数量</th><th>计划发货</th></tr></thead>
                <tbody>
                  <tr v-for="(item, index) in requestDraft.products" :key="`${item.materialCode || item.name}-${index}`">
                    <td>
                      <MaterialIdentity
                        :name="item.name"
                        :code="item.materialCode"
                        :model="item.model"
                        :spec="item.spec"
                        :image-label="lineItems[index]?.image.label"
                        :image-tone="lineItems[index]?.image.tone"
                      />
                    </td>
                    <td>{{ productQtyWithUnit(item) }}</td>
                    <td><strong>{{ productQtyWithUnit(item, 'requestQty') }}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section v-if="showDeliveryCapability" class="form-section">
            <div class="form-section-head">
              <h2>可发判断</h2>
              <span class="section-status-text">{{ deliveryCapabilitySummary }}</span>
            </div>

            <div v-if="deliveryCapabilityRows.length" class="delivery-capability-list">
              <article v-for="row in deliveryCapabilityRows" :key="row.key" class="delivery-capability-card">
                <div class="delivery-capability-head">
                  <MaterialIdentity
                    compact
                    :name="row.material.name"
                    :code="row.material.materialCode"
                    :model="row.material.model"
                    :spec="row.material.spec"
                    :image-label="productVisuals[row.material.name]?.label || row.material.imageLabel"
                    :image-tone="productVisuals[row.material.name]?.tone || row.material.imageTone"
                  />
                  <i class="mini-status" :class="deliveryCapabilityStatusClass(row.status)">{{ row.status }}</i>
                </div>
                <div class="delivery-capability-grid">
                  <span>剩余待发 <b>{{ row.remainingQty }}</b></span>
                  <span>本单现货 <b>{{ row.committableQty }}</b></span>
                  <span>补充去向 <b>{{ row.plannedSupplyQty }}</b></span>
                  <span>未分配缺口 <b>{{ row.shortageAfterPlanQty }}</b></span>
                </div>
                <div class="delivery-capability-foot">
                  <span>库存可用 {{ row.availableQty }} · 本单预留 {{ row.reservedQty }} · 出库占用 {{ row.pendingOutboundQty }}</span>
                  <span>{{ row.productionStatus }}</span>
                  <span>{{ row.inventoryUpdateText }}</span>
                </div>
              </article>
            </div>
            <div v-else class="delivery-capability-empty">
              选择销售物料后，系统会自动汇总库存、待补充和交付缺口。
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <h2>分批发货进度</h2>
            </div>

            <div class="shipment-progress-list">
              <article v-for="row in shipmentProgressRows" :key="row.key" class="shipment-progress-card">
                <div>
                  <MaterialIdentity
                    compact
                    :name="row.material.name"
                    :code="row.material.materialCode"
                    :model="row.material.model"
                    :spec="row.material.spec"
                    :image-label="productVisuals[row.material.name]?.label || row.material.imageLabel"
                    :image-tone="productVisuals[row.material.name]?.tone || row.material.imageTone"
                  />
                  <i class="mini-status" :class="statusClass(row.status)">{{ row.status }}</i>
                </div>
                <dl>
                  <span><dt>计划</dt><dd>{{ row.planned }}</dd></span>
                  <span><dt>已发</dt><dd>{{ row.shipped }}</dd></span>
                  <span><dt>剩余</dt><dd>{{ row.remaining }}</dd></span>
                </dl>
              </article>
            </div>

            <div class="shipment-batch-list">
              <div v-if="shipmentBatches.length === 0" class="shipment-batch-empty">
                {{ deliveryRecordsLoadError
                  ? '交付记录暂时无法读取，请使用上方“重新加载”恢复。'
                  : '尚无销售出库记录；仓库登记拣货并确认出库后会在这里显示。' }}
              </div>
              <article v-for="record in shipmentBatches" :key="record.code" class="shipment-batch-card">
                <div class="shipment-batch-head">
                  <strong>{{ record.code }}</strong>
                  <i class="mini-status" :class="statusClass(record.status)">{{ record.status }}</i>
                </div>
                <div class="shipment-batch-meta">
                  <span>出库日期 {{ record.date || '-' }}</span>
                  <span>出库仓库 {{ deliveryRecordWarehouseText(record) }}</span>
                  <span>经办 {{ record.owner || '-' }}</span>
                </div>
                <div class="shipment-batch-lines">
                  <span v-for="product in record.products" :key="`${record.code}-${product.materialCode || product.name}`">
                    <MaterialIdentity
                      compact
                      :name="product.name"
                      :code="product.materialCode"
                      :model="product.model"
                      :spec="product.spec"
                      :image-label="productVisuals[product.name]?.label || product.imageLabel"
                      :image-tone="productVisuals[product.name]?.tone || product.imageTone"
                    />
                    <small>{{ productQtyWithUnit(product) }}</small>
                  </span>
                </div>
              </article>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <h2>物流与收货信息</h2>
            </div>

            <template v-if="isDetail">
              <dl class="material-fact-grid quote-detail-fact-grid outbound-logistics-fact-grid">
                <div><dt>计划发货日期</dt><dd>{{ requestDraft.expectedDate || '未维护' }}</dd></div>
                <div><dt>承诺交付日期</dt><dd>{{ requestDraft.deliveryDate || '未维护' }}</dd></div>
                <div><dt>物流方式</dt><dd>{{ requestDraft.deliveryMethod || '未维护' }}</dd></div>
                <div><dt>收货联系人</dt><dd>{{ requestDraft.contact || '未维护' }}</dd></div>
                <div><dt>联系方式</dt><dd>{{ requestDraft.contactPhone || '未维护' }}</dd></div>
                <div class="outbound-address-fact"><dt>收货地址</dt><dd>{{ requestDraft.address || '未维护' }}</dd></div>
              </dl>
              <div v-if="requestDraft.supplementaryRequirement" class="quote-terms-note">
                <span>补充要求</span>
                <p class="material-note-copy">{{ requestDraft.supplementaryRequirement }}</p>
              </div>
            </template>

            <div v-else class="quote-fields">
              <label class="form-field" :class="outboundRequiredLabelClass('计划发货日期')">
                <span>计划发货日期</span>
                <input v-model="requestDraft.expectedDate" type="date" :readonly="isReadOnly" />
              </label>
              <label class="form-field">
                <span>承诺交付日期</span>
                <input v-model="requestDraft.deliveryDate" type="date" readonly />
              </label>
              <label class="form-field" :class="outboundRequiredLabelClass('物流方式')">
                <span>物流方式</span>
                <select v-model="requestDraft.deliveryMethod" :disabled="isReadOnly">
                  <option value="">请选择</option>
                  <option v-for="method in deliveryMethodOptions" :key="method" :value="method">{{ method }}</option>
                </select>
              </label>
              <label class="form-field" :class="outboundRequiredLabelClass('收货联系人')">
                <span>收货联系人</span>
                <input v-model="requestDraft.contact" type="text" :readonly="isReadOnly" />
              </label>
              <label class="form-field" :class="outboundRequiredLabelClass('联系方式')">
                <span>联系方式</span>
                <input v-model="requestDraft.contactPhone" type="tel" inputmode="tel" autocomplete="shipping tel" placeholder="填写收货联系电话" :readonly="isReadOnly" />
              </label>
              <label class="form-field full-field" :class="outboundRequiredLabelClass('收货地址')">
                <span>收货地址</span>
                <input v-model="requestDraft.address" type="text" placeholder="填写本次出库的收货地址或自提说明" :readonly="isReadOnly" />
              </label>
              <div v-if="requestDraft.supplementaryRequirement" class="quote-terms-note full-field">
                <span>补充要求（来自销售订单）</span>
                <p class="material-note-copy">{{ requestDraft.supplementaryRequirement }}</p>
              </div>
            </div>
          </section>
        </div>

        <aside class="quote-summary-panel">
          <section v-if="!isNew" class="summary-section">
            <DocumentStatusPanel
              title="状态与交付"
              :primary-status="statusLabel(requestDraft.status)"
              :items="outboundStatusPanelItems"
              aria-label="交付追踪状态与发货进度"
            />
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
                :title="outboundAttachmentTitle"
              >
                <Upload :size="15" />
                上传
                <input type="file" multiple :disabled="isReadOnly" @change="handleAttachmentUpload" />
              </label>
            </div>
            <div v-if="outboundAttachments.length" class="attachment-list">
              <div v-for="file in outboundAttachments" :key="`${file.name}-${file.date}`" class="attachment-row">
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
              <span>{{ isReadOnly ? '暂无附件' : '可上传客户确认、物流要求或交付附件' }}</span>
            </div>
          </section>
        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      title="交付追踪"
      :message="loadMessage || '交付追踪不存在'"
      back-path="/sales/outbound-requests"
      back-label="返回交付追踪列表"
      @retry="loadRequest"
    />

    <FlowRecordPanel
      :open="showFlowRecords"
      title="交付追踪日志"
      :records="flowRecords"
      @close="showFlowRecords = false"
    />

    <div v-if="toastMessage" class="app-toast" :class="{ error: toastTone === 'error' }" :role="toastTone === 'error' ? 'alert' : 'status'" :aria-live="toastTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">
      {{ toastMessage }}
    </div>
  </div>
</template>

<style scoped>
.outbound-signal-load-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0 16px;
  padding: 12px 14px;
  border: 1px solid #ead8b5;
  border-radius: 11px;
  color: #76551d;
  background: #fffaf0;
}

.outbound-signal-load-alert > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.outbound-signal-load-alert strong {
  font-size: 13px;
}

.outbound-signal-load-alert span {
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.outbound-signal-load-alert button {
  flex: 0 0 auto;
}

@media (max-width: 760px) {
  .outbound-signal-load-alert {
    align-items: stretch;
    flex-direction: column;
    margin-inline: 0;
  }

  .outbound-signal-load-alert button {
    width: 100%;
  }
}
</style>
