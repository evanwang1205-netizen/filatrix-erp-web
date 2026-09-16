<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Search, X } from 'lucide-vue-next';

import {
  listMasterRecords,
  listPurchaseOrders,
  listPurchaseRequisitions,
  listSalesOrders,
  listSalesQuotes,
} from '../services/api';
import type { PurchaseOrder, PurchaseRequisition, SalesOrder, SalesQuote } from '../types/business';
import type { MasterDataRecord } from '../data/masterData';
import { productIdentity, productQtyWithUnit } from '../utils/productDisplay';

const props = defineProps<{
  open: boolean;
  title?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

type ReferenceItem = {
  key: string;
  group: string;
  title: string;
  subtitle: string;
  meta: string;
  to?: string;
};

const keyword = ref('');
const loading = ref(false);
const errorMessage = ref('');
const loaded = ref(false);
const referenceItems = ref<ReferenceItem[]>([]);

function productSummary(products: Array<{ name?: string; materialCode?: string; model?: string; spec?: string; qty?: string }>) {
  if (!products.length) return '暂无明细';
  const first = products[0];
  return `${productIdentity(first, '-')}${first.qty ? ` · ${productQtyWithUnit(first)}` : ''}${products.length > 1 ? ` · 共 ${products.length} 项` : ''}`;
}

function purchaseContent(row: PurchaseOrder | PurchaseRequisition) {
  return productSummary(row.products || []);
}

function purchaseGroup(_row: PurchaseOrder) {
  return '采购订单';
}

function purchasePath(row: PurchaseOrder) {
  return `/purchase/orders/${encodeURIComponent(row.code)}`;
}

function masterSubtitle(row: MasterDataRecord) {
  return [row.type, row.category, row.contact, row.phone, row.owner, row.status].filter(Boolean).join(' · ') || row.primary || row.secondary || '-';
}

function customerMasterSubtitle(row: MasterDataRecord) {
  return [row.type, row.contact, row.phone, row.status].filter(Boolean).join(' · ') || row.primary || '-';
}

function customerCompanyAddress(row: MasterDataRecord) {
  return [row.province, row.city, row.address].filter(Boolean).join('') || row.address || row.secondary || '';
}

function materialSalesScope(row: MasterDataRecord) {
  return (row.isSaleable ?? (row.category === '成品' || row.type === '成品')) ? '可销售' : '不可销售';
}

function buildItems(payload: {
  salesOrders: SalesOrder[];
  salesQuotes: SalesQuote[];
  purchaseOrders: PurchaseOrder[];
  purchaseRequisitions: PurchaseRequisition[];
  customers: MasterDataRecord[];
  suppliers: MasterDataRecord[];
  materials: MasterDataRecord[];
}) {
  const salesOrderItems = payload.salesOrders.slice(0, 8).map((row) => ({
    key: `sales-order-${row.code}`,
    group: '销售订单',
    title: `${row.code} · ${row.customer}`,
    subtitle: productSummary(row.products),
    meta: `${row.status} · ${row.amount} · 交期 ${row.delivery || '-'}`,
    to: `/sales/orders/${encodeURIComponent(row.code)}`,
  }));
  const quoteItems = payload.salesQuotes.slice(0, 6).map((row) => ({
    key: `sales-quote-${row.code}`,
    group: '报价单',
    title: `${row.code} · ${row.customer}`,
    subtitle: productSummary(row.products),
    meta: `${row.status} · ${row.amount} · 有效期 ${row.validUntil || '-'}`,
    to: `/sales/quotes/${encodeURIComponent(row.code)}`,
  }));
  const purchaseOrderItems = payload.purchaseOrders.slice(0, 8).map((row) => ({
    key: `purchase-order-${row.code}`,
    group: purchaseGroup(row),
    title: `${row.code} · ${row.supplier || '待选供应商'}`,
    subtitle: purchaseContent(row),
    meta: `采购订单 · ${row.status} · ${row.amount}`,
    to: purchasePath(row),
  }));
  const requisitionItems = payload.purchaseRequisitions.slice(0, 6).map((row) => ({
    key: `purchase-requisition-${row.code}`,
    group: '采购需求',
    title: `${row.code} · ${row.department}`,
    subtitle: purchaseContent(row),
    meta: `采购需求 · ${row.status} · 期望 ${row.expectedDate || '-'}`,
    to: `/purchase/requisitions/${encodeURIComponent(row.code)}`,
  }));
  const masterItems = [
    ...payload.customers.slice(0, 6).map((row) => ({
      key: `customer-${row.code}`,
      group: '客户',
      title: `${row.code} · ${row.name}`,
      subtitle: customerMasterSubtitle(row),
      meta: customerCompanyAddress(row),
      to: `/master-data/customers/${encodeURIComponent(row.code)}`,
    })),
    ...payload.suppliers.slice(0, 6).map((row) => ({
      key: `supplier-${row.code}`,
      group: '供应商',
      title: `${row.code} · ${row.name}`,
      subtitle: masterSubtitle(row),
      meta: row.address || row.secondary || '',
      to: `/master-data/suppliers/${encodeURIComponent(row.code)}`,
    })),
    ...payload.materials.slice(0, 8).map((row) => ({
      key: `material-${row.code}`,
      group: '物料',
      title: `${row.code} · ${row.name}`,
      subtitle: [row.model, row.spec, row.category, materialSalesScope(row)].filter(Boolean).join(' · '),
      meta: [row.uom, row.batchControl, row.qualityControl].filter(Boolean).join(' · '),
      to: `/master-data/materials/${encodeURIComponent(row.code)}`,
    })),
  ];

  referenceItems.value = [
    ...salesOrderItems,
    ...quoteItems,
    ...purchaseOrderItems,
    ...requisitionItems,
    ...masterItems,
  ];
}

async function loadReferences() {
  if (loaded.value || loading.value) return;
  loading.value = true;
  errorMessage.value = '';

  try {
    const [
      salesOrders,
      salesQuotes,
      purchaseOrders,
      purchaseRequisitions,
      customers,
      suppliers,
      materials,
    ] = await Promise.all([
      listSalesOrders(),
      listSalesQuotes(),
      listPurchaseOrders(),
      listPurchaseRequisitions(),
      listMasterRecords('customers'),
      listMasterRecords('suppliers'),
      listMasterRecords('materials'),
    ]);

    buildItems({ salesOrders, salesQuotes, purchaseOrders, purchaseRequisitions, customers, suppliers, materials });
    loaded.value = true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '参考数据加载失败';
  } finally {
    loading.value = false;
  }
}

const filteredItems = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  if (!value) return referenceItems.value;

  return referenceItems.value.filter((item) =>
    [item.group, item.title, item.subtitle, item.meta].some((text) => text.toLowerCase().includes(value)),
  );
});

const groupedItems = computed(() => {
  const groups = new Map<string, ReferenceItem[]>();
  filteredItems.value.forEach((item) => {
    const rows = groups.get(item.group) || [];
    rows.push(item);
    groups.set(item.group, rows);
  });

  return [...groups.entries()].map(([group, items]) => ({ group, items }));
});

watch(
  () => props.open,
  (open) => {
    if (open) {
      void loadReferences();
      return;
    }

    keyword.value = '';
  },
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="reference-lookup-backdrop" @click.self="emit('close')" @keydown.esc.stop="emit('close')">
      <aside class="reference-lookup-panel" aria-labelledby="reference-lookup-title" aria-modal="true" role="dialog">
        <header class="reference-lookup-head">
          <div>
            <h2 id="reference-lookup-title">{{ title || '参考' }}</h2>
            <span>只读查看常用单据和基础资料，不影响当前编辑内容。</span>
          </div>
          <button type="button" aria-label="关闭参考" title="关闭参考" @click="emit('close')">
            <X :size="17" />
          </button>
        </header>

        <label class="reference-lookup-search">
          <Search :size="15" />
          <input v-model="keyword" type="search" placeholder="搜索单号、客户、供应商、物料或状态" title="搜索参考单据和基础资料" />
        </label>

        <div class="reference-lookup-body">
          <div v-if="loading" class="reference-lookup-empty">正在加载参考数据...</div>
          <div v-else-if="errorMessage" class="reference-lookup-empty">{{ errorMessage }}</div>
          <div v-else-if="!filteredItems.length" class="reference-lookup-empty">没有匹配的参考信息</div>
          <template v-else>
            <section v-for="group in groupedItems" :key="group.group" class="reference-lookup-group">
              <h3>{{ group.group }}</h3>
              <article v-for="item in group.items" :key="item.key" class="reference-lookup-card">
                <div>
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.subtitle }}</span>
                  <small>{{ item.meta }}</small>
                </div>
                <RouterLink v-if="item.to" :to="item.to" :title="`打开${item.title}`" @click="emit('close')">打开</RouterLink>
              </article>
            </section>
          </template>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
