<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ArrowLeft, ChevronLeft, ChevronRight, Printer, RefreshCw } from 'lucide-vue-next';
import { useRoute } from 'vue-router';

import { getMasterRecord, getPurchaseOrder, getSalesOrder } from '../services/api';
import type { MasterDataRecord } from '../data/masterData';
import type { PurchaseOrder, PurchaseOrderProduct, SalesOrder, SalesOrderProduct } from '../types/business';

type PrintableOrder = SalesOrder | PurchaseOrder;
type PrintableOrderProduct = SalesOrderProduct | PurchaseOrderProduct;

type OrderPdfPage = {
  items: PrintableOrderProduct[] | null;
  showParties: boolean;
  showTotal: boolean;
  showTerms: boolean;
  showTermFacts: boolean;
  isTermsContinuation: boolean;
  showSignatures: boolean;
  termsText: string;
};

type OrderPdfTemplateOption = {
  id: string;
  language: 'zh-CN';
  label: string;
};

const route = useRoute();
const order = ref<PrintableOrder | null>(null);
const companyRecord = ref<MasterDataRecord | null>(null);
const supplierRecord = ref<MasterDataRecord | null>(null);
const currencyRecord = ref<MasterDataRecord | null>(null);
const previewScroller = ref<HTMLElement | null>(null);
const selectedTemplateId = ref('');
const currentPreviewPage = ref(1);
const isLoading = ref(false);
const loadError = ref('');
const originalDocumentTitle = document.title;
let loadRequestId = 0;

const isPurchaseOrderPdf = computed(() => route.name === 'purchase-order-pdf');
const salesOrder = computed(() => (
  isPurchaseOrderPdf.value ? null : order.value as SalesOrder | null
));
const purchaseOrder = computed(() => (
  isPurchaseOrderPdf.value ? order.value as PurchaseOrder | null : null
));
const documentName = computed(() => (isPurchaseOrderPdf.value ? '采购订单' : '销售订单'));
const orderCode = computed(() => route.params.code?.toString() || '');
const orderPath = computed(() => (
  isPurchaseOrderPdf.value
    ? orderCode.value
      ? `/purchase/orders/${encodeURIComponent(orderCode.value)}`
      : '/purchase/orders'
    : orderCode.value
      ? `/sales/orders/${encodeURIComponent(orderCode.value)}`
      : '/sales/orders'
));
const companyPrintFacts = computed(() => {
  const snapshot = salesOrder.value?.companyPrintSnapshot || purchaseOrder.value?.companyPrintSnapshot;
  return {
    name: snapshot?.name || companyRecord.value?.name || order.value?.company || '—',
    address: snapshot?.address || companyRecord.value?.address || '—',
    email: snapshot?.email || companyRecord.value?.email || '—',
    website: snapshot?.website || companyRecord.value?.website || '—',
  };
});
const websiteDisplay = computed(() => (
  companyPrintFacts.value.website
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
));
const companyShortName = computed(() => (
  companyRecord.value?.primary?.trim()
  || order.value?.company?.trim()
  || companyPrintFacts.value.name
  || '公司'
));
const orderTemplateOptions = computed<OrderPdfTemplateOption[]>(() => {
  if (!order.value) return [];
  return [{
    id: `${order.value?.companyCode || 'company'}:standard-zh-cn`,
    language: 'zh-CN',
    label: `${companyShortName.value} 中文${documentName.value}`,
  }];
});
const supplierContactFacts = computed(() => ({
  contact: salesOrder.value?.supplierPrintSnapshot?.contact || purchaseOrder.value?.buyerPrintSnapshot?.contact || order.value?.owner || '—',
  phone: salesOrder.value?.supplierPrintSnapshot?.phone || purchaseOrder.value?.buyerPrintSnapshot?.phone || companyRecord.value?.phone || purchaseOrder.value?.receivingPhone || '—',
}));
const customerPrintFacts = computed(() => ({
  name: salesOrder.value?.customerPrintSnapshot?.name || salesOrder.value?.customer || '—',
  address: salesOrder.value?.customerPrintSnapshot?.address || '—',
  contact: salesOrder.value?.customerPrintSnapshot?.contact || order.value?.contact || '—',
  phone: salesOrder.value?.customerPrintSnapshot?.phone || order.value?.contactPhone || '—',
}));
const purchaseSupplierFacts = computed(() => ({
  name: purchaseOrder.value?.supplierPrintSnapshot?.name || supplierRecord.value?.name || purchaseOrder.value?.supplier || '—',
  address: purchaseOrder.value?.supplierPrintSnapshot?.address || supplierRecord.value?.address || '—',
  contact: purchaseOrder.value?.supplierPrintSnapshot?.contact || purchaseOrder.value?.contact || supplierRecord.value?.contact || '—',
  phone: purchaseOrder.value?.supplierPrintSnapshot?.phone || purchaseOrder.value?.contactPhone || supplierRecord.value?.phone || '—',
}));
const leftPartyFacts = computed(() => (
  isPurchaseOrderPdf.value
    ? { label: '供方', ...purchaseSupplierFacts.value }
    : {
        label: '供方',
        name: companyPrintFacts.value.name,
        address: companyPrintFacts.value.address,
        contact: supplierContactFacts.value.contact,
        phone: supplierContactFacts.value.phone,
      }
));
const rightPartyFacts = computed(() => (
  isPurchaseOrderPdf.value
    ? {
        label: '需方',
        name: companyPrintFacts.value.name,
        address: companyPrintFacts.value.address,
        contact: supplierContactFacts.value.contact,
        phone: supplierContactFacts.value.phone,
      }
    : { label: '需方', ...customerPrintFacts.value }
));
const purchaseReceivingFacts = computed(() => ({
  address: purchaseOrder.value?.receivingAddress || '—',
  contact: purchaseOrder.value?.receivingContact || '—',
  phone: purchaseOrder.value?.receivingPhone || '—',
}));
const currencyCode = computed(() => salesOrder.value?.currency || currencyRecord.value?.code || 'CNY');
const currencySymbol = computed(() => (
  currencyRecord.value?.symbol
  || (currencyCode.value === 'CNY' ? '￥' : `${currencyCode.value} `)
));
const currencyDecimals = computed(() => {
  const value = Number(currencyRecord.value?.decimalPlaces);
  return Number.isInteger(value) && value >= 0 && value <= 6 ? value : 2;
});
const estimatedTermLines = computed(() => estimateWrappedLines(order.value?.remark || '—'));
const orderPages = computed<OrderPdfPage[]>(() => {
  if (!order.value) return [];

  const termsText = order.value.remark?.trim() || '—';
  const products = order.value.products || [];
  const keepFinalSectionsWithProducts = estimatedTermLines.value <= 10;

  if (keepFinalSectionsWithProducts) {
    const groups = paginateOrderProducts(
      products,
      Math.max(1, finalProductCapacityForTerms(estimatedTermLines.value) - (isPurchaseOrderPdf.value ? 1 : 0)),
    );
    return groups.map((items, index) => {
      const isLast = index === groups.length - 1;
      return {
        items,
        showParties: index === 0,
        showTotal: isLast,
        showTerms: isLast,
        showTermFacts: isLast,
        isTermsContinuation: false,
        showSignatures: isLast,
        termsText: isLast ? termsText : '',
      };
    });
  }

  const termPrelude = splitTermsPrelude(termsText);
  const productGroups = paginateOrderProducts(products, isPurchaseOrderPdf.value ? 5 : 6);
  const pages: OrderPdfPage[] = productGroups.map((items, index) => ({
    items,
    showParties: index === 0,
    showTotal: index === productGroups.length - 1,
    showTerms: index === productGroups.length - 1,
    showTermFacts: index === productGroups.length - 1,
    isTermsContinuation: false,
    showSignatures: false,
    termsText: index === productGroups.length - 1 ? termPrelude.first : '',
  }));
  const termChunks = termPrelude.remaining ? splitTermsText(termPrelude.remaining) : [];
  if (!termChunks.length) {
    const lastPage = pages[pages.length - 1];
    if (lastPage) lastPage.showSignatures = true;
    return pages;
  }
  termChunks.forEach((termsChunk, index) => {
    const isLast = index === termChunks.length - 1;
    pages.push({
      items: null,
      showParties: false,
      showTotal: false,
      showTerms: true,
      showTermFacts: false,
      isTermsContinuation: true,
      showSignatures: isLast,
      termsText: termsChunk,
    });
  });
  return pages;
});

function visualUnits(value: string) {
  return Array.from(value).reduce((total, character) => (
    total + (/[\u0000-\u00ff]/.test(character) ? 0.55 : 1)
  ), 0);
}

function estimateWrappedLines(value: string, lineUnits = 56) {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(visualUnits(line) / lineUnits)), 0);
}

function splitByVisualCapacity(value: string, maxUnits: number) {
  const chunks: string[] = [];
  let current = '';
  let currentUnits = 0;
  Array.from(value).forEach((character) => {
    const characterUnits = /[\u0000-\u00ff]/.test(character) ? 0.55 : 1;
    if (current && currentUnits + characterUnits > maxUnits) {
      chunks.push(current.trim());
      current = character;
      currentUnits = characterUnits;
      return;
    }
    current += character;
    currentUnits += characterUnits;
  });
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : ['—'];
}

function splitTermsText(value: string) {
  const maxUnits = 56 * 22;
  const allChunks: string[] = [];
  let current = '';
  value.replace(/\r\n/g, '\n').split('\n').forEach((paragraph) => {
    splitByVisualCapacity(paragraph || ' ', maxUnits).forEach((chunk) => {
      const next = current ? `${current}\n${chunk}` : chunk;
      if (visualUnits(next) <= maxUnits) {
        current = next;
        return;
      }
      if (current) allChunks.push(current);
      current = chunk;
    });
  });
  if (current) allChunks.push(current);
  return allChunks.length ? allChunks : ['—'];
}

function splitTermsPrelude(value: string) {
  const paragraphs = value.replace(/\r\n/g, '\n').split('\n');
  const firstParagraph = paragraphs.shift() || '—';
  const firstParagraphChunks = splitByVisualCapacity(firstParagraph, 56 * 3);
  const first = firstParagraphChunks.shift() || '—';
  const remaining = [...firstParagraphChunks, ...paragraphs]
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join('\n');
  return { first, remaining };
}

function finalProductCapacityForTerms(termLines: number) {
  if (termLines <= 2) return 5;
  if (termLines <= 5) return 4;
  if (termLines <= 8) return 3;
  return 2;
}

function paginateOrderProducts(products: PrintableOrderProduct[], finalCapacity: number) {
  if (!products.length) return [[]];
  if (products.length <= finalCapacity) return [products];

  let pageCount = 2;
  while (7 + Math.max(pageCount - 2, 0) * 9 + finalCapacity < products.length) {
    pageCount += 1;
  }

  const finalPageSize = Math.min(finalCapacity, Math.max(1, Math.ceil(products.length / pageCount)));
  let remaining = products.length - finalPageSize;
  let cursor = 0;
  const groups: PrintableOrderProduct[][] = [];

  for (let pageIndex = 0; pageIndex < pageCount - 1; pageIndex += 1) {
    const pagesAfter = pageCount - 2 - pageIndex;
    const pageMaximum = pageIndex === 0 ? 7 : 9;
    const minimumForCurrent = Math.max(1, remaining - pagesAfter * 9);
    const balancedSize = Math.ceil(remaining / (pagesAfter + 1));
    const pageSize = Math.min(pageMaximum, Math.max(minimumForCurrent, balancedSize));
    groups.push(products.slice(cursor, cursor + pageSize));
    cursor += pageSize;
    remaining -= pageSize;
  }
  groups.push(products.slice(cursor));
  return groups;
}

function parseMoney(value: string | number | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number | undefined) {
  const amount = parseMoney(value);
  return `${currencySymbol.value}${amount.toLocaleString('zh-CN', {
    minimumFractionDigits: currencyDecimals.value,
    maximumFractionDigits: currencyDecimals.value,
  })}`;
}

function quantityParts(item: PrintableOrderProduct) {
  const text = String(item.qty || '').trim();
  const knownUnit = String(item.uom || '').trim();
  if (!text) return { quantity: '—', unit: knownUnit || '—' };
  if (knownUnit && text.endsWith(knownUnit)) {
    return {
      quantity: text.slice(0, -knownUnit.length).trim() || '—',
      unit: knownUnit,
    };
  }
  const quantityMatch = text.match(/^([+-]?(?:\d[\d,]*)(?:\.\d+)?)/);
  if (!quantityMatch) return { quantity: text, unit: knownUnit || '—' };
  return {
    quantity: quantityMatch[1],
    unit: knownUnit || text.slice(quantityMatch[0].length).trim() || '—',
  };
}

function lineGrossUnitPrice(item: PrintableOrderProduct) {
  return item.grossUnitPrice || item.unitPrice;
}

function lineGrossAmount(item: PrintableOrderProduct) {
  return item.grossAmount || item.amount;
}

function printOrder() {
  window.print();
}

function pageElement(pageNumber: number) {
  return previewScroller.value?.querySelector<HTMLElement>(`[data-preview-page="${pageNumber}"]`) || null;
}

function goToPreviewPage(pageNumber: number) {
  const totalPages = orderPages.value.length;
  if (!totalPages || !previewScroller.value) return;
  const nextPage = Math.min(Math.max(pageNumber, 1), totalPages);
  const target = pageElement(nextPage);
  if (!target) return;
  currentPreviewPage.value = nextPage;
  previewScroller.value.scrollTo({
    top: Math.max(target.offsetTop - 20, 0),
    behavior: 'smooth',
  });
}

function syncCurrentPreviewPage() {
  const scroller = previewScroller.value;
  if (!scroller || !orderPages.value.length) return;
  const scrollerTop = scroller.getBoundingClientRect().top;
  const pages = Array.from(scroller.querySelectorAll<HTMLElement>('[data-preview-page]'));
  const closestPage = pages.reduce((closest, page) => {
    const distance = Math.abs(page.getBoundingClientRect().top - scrollerTop - 20);
    return distance < closest.distance
      ? { page: Number(page.dataset.previewPage || 1), distance }
      : closest;
  }, { page: 1, distance: Number.POSITIVE_INFINITY });
  currentPreviewPage.value = closestPage.page;
}

async function loadOrderPdf() {
  const requestId = ++loadRequestId;
  loadError.value = '';
  isLoading.value = true;
  order.value = null;
  companyRecord.value = null;
  supplierRecord.value = null;
  currencyRecord.value = null;

  try {
    const response = isPurchaseOrderPdf.value
      ? await getPurchaseOrder(orderCode.value)
      : await getSalesOrder(orderCode.value);
    if (requestId !== loadRequestId) return;
    order.value = response.order;
    document.title = `${response.order.code}-${documentName.value}`;

    const [companyResult, currencyResult, supplierResult] = await Promise.allSettled([
      response.order.companyCode
        ? getMasterRecord('company', response.order.companyCode)
        : Promise.resolve(null),
      getMasterRecord('currencies', isPurchaseOrderPdf.value ? 'CNY' : (response.order as SalesOrder).currency || 'CNY'),
      isPurchaseOrderPdf.value && (response.order as PurchaseOrder).supplierCode
        ? getMasterRecord('suppliers', (response.order as PurchaseOrder).supplierCode || '')
        : Promise.resolve(null),
    ]);
    if (requestId !== loadRequestId) return;
    companyRecord.value = companyResult.status === 'fulfilled' ? companyResult.value : null;
    currencyRecord.value = currencyResult.status === 'fulfilled' ? currencyResult.value : null;
    supplierRecord.value = supplierResult.status === 'fulfilled' ? supplierResult.value : null;
  } catch (error) {
    if (requestId !== loadRequestId) return;
    loadError.value = error instanceof Error ? error.message : `${documentName.value} PDF 预览加载失败`;
  } finally {
    if (requestId === loadRequestId) isLoading.value = false;
  }
}

watch(orderCode, loadOrderPdf, { immediate: true });
watch(orderTemplateOptions, (options) => {
  if (!options.some((option) => option.id === selectedTemplateId.value)) {
    selectedTemplateId.value = options[0]?.id || '';
  }
}, { immediate: true });
watch(() => orderPages.value.length, () => {
  currentPreviewPage.value = 1;
  if (previewScroller.value) previewScroller.value.scrollTop = 0;
});

onBeforeUnmount(() => {
  loadRequestId += 1;
  document.title = originalDocumentTitle;
});
</script>

<template>
  <main class="order-pdf-preview">
    <header class="preview-toolbar">
      <div class="preview-toolbar-leading">
        <RouterLink class="preview-back" :to="orderPath">
          <ArrowLeft :size="16" />
          返回{{ documentName }}
        </RouterLink>
        <div class="preview-toolbar-title">
          <strong>{{ order?.code || documentName }}</strong>
          <span v-if="orderPages.length">A4 · 共 {{ orderPages.length }} 页</span>
        </div>
      </div>
      <div class="preview-toolbar-actions">
        <label class="preview-template-control">
          <span>模板</span>
          <select v-model="selectedTemplateId" :disabled="!order">
            <option
              v-for="templateOption in orderTemplateOptions"
              :key="templateOption.id"
              :value="templateOption.id"
            >
              {{ templateOption.label }}
            </option>
          </select>
        </label>
        <div v-if="orderPages.length" class="preview-page-control" aria-label="预览翻页">
          <button
            type="button"
            aria-label="上一页"
            :disabled="currentPreviewPage <= 1"
            @click="goToPreviewPage(currentPreviewPage - 1)"
          >
            <ChevronLeft :size="16" />
          </button>
          <span>{{ currentPreviewPage }} / {{ orderPages.length }}</span>
          <button
            type="button"
            aria-label="下一页"
            :disabled="currentPreviewPage >= orderPages.length"
            @click="goToPreviewPage(currentPreviewPage + 1)"
          >
            <ChevronRight :size="16" />
          </button>
        </div>
        <button class="preview-print-action" type="button" :disabled="!order" @click="printOrder">
          <Printer :size="16" />
          打印 / 保存 PDF
        </button>
      </div>
    </header>

    <section v-if="isLoading" class="preview-state">
      <span class="preview-spinner"></span>
      正在准备{{ documentName }}预览…
    </section>
    <section v-else-if="loadError" class="preview-state preview-error">
      <strong>{{ documentName }}预览加载失败</strong>
      <span>{{ loadError }}</span>
      <button type="button" @click="loadOrderPdf">
        <RefreshCw :size="15" />
        重新加载
      </button>
    </section>

    <div
      v-else-if="order"
      ref="previewScroller"
      class="order-preview-scroll"
      @scroll.passive="syncCurrentPreviewPage"
    >
      <div class="order-sheet-stack">
        <article
          v-for="(page, pageIndex) in orderPages"
          :key="pageIndex"
          class="order-pdf-sheet"
          :data-preview-page="pageIndex + 1"
        >
          <header class="order-letterhead">
            <div class="letterhead-top">
              <div class="brand-lockup">
                <div class="brand-logo">
                  <img src="/filatrix-logo-strip-white.png" alt="Filatrix" />
                </div>
                <span class="brand-divider"></span>
                <div class="brand-slogan">
                  <span>MORE THAN PRINTING</span>
                  <span>材启万象</span>
                </div>
              </div>
              <h1>{{ documentName }}</h1>
            </div>

            <div class="letterhead-facts">
              <div class="company-facts">
                <strong>{{ companyPrintFacts.name }}</strong>
                <span>{{ companyPrintFacts.address }}</span>
                <span>{{ companyPrintFacts.email }}</span>
                <span>{{ websiteDisplay || '—' }}</span>
              </div>
              <dl class="order-meta">
                <div>
                  <dt>订单编号</dt>
                  <dd>{{ order.code }}</dd>
                </div>
                <div>
                  <dt>订单日期</dt>
                  <dd>{{ order.date || '—' }}</dd>
                </div>
              </dl>
            </div>
            <div class="letterhead-rule"></div>
          </header>

          <section v-if="page.showParties" class="order-parties-section">
            <h2>供需双方</h2>
            <div class="party-grid">
              <div class="party-card">
                <strong class="party-label">{{ leftPartyFacts.label }}</strong>
                <dl>
                  <div class="party-company">
                    <dt>公司名称</dt>
                    <dd>{{ leftPartyFacts.name }}</dd>
                  </div>
                  <div class="party-address">
                    <dt>公司地址</dt>
                    <dd>{{ leftPartyFacts.address }}</dd>
                  </div>
                  <div>
                    <dt>联系人</dt>
                    <dd>{{ leftPartyFacts.contact }}</dd>
                  </div>
                  <div>
                    <dt>联系方式</dt>
                    <dd>{{ leftPartyFacts.phone }}</dd>
                  </div>
                </dl>
              </div>
              <div class="party-card">
                <strong class="party-label">{{ rightPartyFacts.label }}</strong>
                <dl>
                  <div class="party-company">
                    <dt>公司名称</dt>
                    <dd>{{ rightPartyFacts.name }}</dd>
                  </div>
                  <div class="party-address">
                    <dt>公司地址</dt>
                    <dd>{{ rightPartyFacts.address }}</dd>
                  </div>
                  <div>
                    <dt>联系人</dt>
                    <dd>{{ rightPartyFacts.contact }}</dd>
                  </div>
                  <div>
                    <dt>联系方式</dt>
                    <dd>{{ rightPartyFacts.phone }}</dd>
                  </div>
                </dl>
              </div>
            </div>
            <div class="order-parties-rule"></div>
          </section>

          <section v-if="page.items !== null" class="order-lines-section">
            <div class="pdf-section-heading">
              <h2>{{ pageIndex === 0 ? '订单明细' : '订单明细（续）' }}</h2>
            </div>

            <div class="pdf-line-table">
              <div class="pdf-line-head">
                <span>序号</span>
                <span>商品</span>
                <span>数量</span>
                <span>单位</span>
                <span>单价</span>
                <span>金额</span>
              </div>
              <div
                v-for="(item, itemIndex) in page.items"
                :key="`${item.lineId || item.materialCode || item.name}-${itemIndex}`"
                class="pdf-line-row"
              >
                <span class="line-index">
                  {{ String(order.products.indexOf(item) + 1).padStart(2, '0') }}
                </span>
                <span class="line-product">
                  <strong>{{ item.name || '—' }}</strong>
                  <span class="line-model">{{ item.model || '—' }}</span>
                  <span class="line-spec">{{ item.spec || '—' }}</span>
                </span>
                <span class="line-number">{{ quantityParts(item).quantity }}</span>
                <span class="line-unit">{{ quantityParts(item).unit }}</span>
                <span class="line-money">{{ formatMoney(lineGrossUnitPrice(item)) }}</span>
                <strong class="line-money line-amount">{{ formatMoney(lineGrossAmount(item)) }}</strong>
              </div>
              <div v-if="!page.items.length" class="pdf-line-empty">暂无订单商品</div>
            </div>

            <div v-if="page.showTotal" class="order-total">
              <span class="order-total-label">
                <span>含税总计</span>
                <small>{{ currencyCode }}</small>
              </span>
              <strong>{{ formatMoney(order.amount) }}</strong>
            </div>
            <div v-if="page.showTotal" class="order-section-rule"></div>
          </section>

          <section
            v-if="page.showTerms"
            class="order-terms-section"
            :class="{ 'is-standalone': page.items === null }"
          >
            <h2 v-if="page.showTermFacts">商务条款</h2>
            <span v-else class="term-continuation-title">
              {{ page.isTermsContinuation ? '补充条款（续）' : '补充条款' }}
            </span>
            <dl v-if="page.showTermFacts" class="term-facts">
              <div>
                <dt>交付日期</dt>
                <dd>{{ isPurchaseOrderPdf ? purchaseOrder?.expectedDate || '—' : salesOrder?.delivery || '—' }}</dd>
              </div>
              <div>
                <dt>交付方式</dt>
                <dd>{{ order.deliveryMethod || '—' }}</dd>
              </div>
              <div>
                <dt>运费承担</dt>
                <dd>{{ order.freightPayer || '—' }}</dd>
              </div>
              <div>
                <dt>付款方式</dt>
                <dd>{{ order.paymentMethod || '—' }}</dd>
              </div>
            </dl>
            <dl v-if="page.showTermFacts && isPurchaseOrderPdf" class="purchase-receiving-facts">
              <div>
                <dt>收货地址</dt>
                <dd>{{ purchaseReceivingFacts.address }}</dd>
              </div>
              <div>
                <dt>收货联系人</dt>
                <dd>{{ purchaseReceivingFacts.contact }}</dd>
              </div>
              <div>
                <dt>联系方式</dt>
                <dd>{{ purchaseReceivingFacts.phone }}</dd>
              </div>
            </dl>
            <div v-if="page.termsText" class="term-note">
              <span v-if="page.showTermFacts">补充条款</span>
              <p>{{ page.termsText }}</p>
            </div>
            <div class="order-terms-rule"></div>
          </section>

          <section v-if="page.showSignatures" class="order-signatures-section">
            <h2>双方确认</h2>
            <div class="signature-grid">
              <div class="signature-card">
                <div class="signature-title">
                  <strong>供方（签章）</strong>
                  <span class="signature-date">
                    <span>日期</span>
                    <i></i>
                  </span>
                </div>
                <div class="signature-space"></div>
              </div>
              <div class="signature-card">
                <div class="signature-title">
                  <strong>需方（签章）</strong>
                  <span class="signature-date">
                    <span>日期</span>
                    <i></i>
                  </span>
                </div>
                <div class="signature-space"></div>
              </div>
            </div>
          </section>

          <footer class="order-page-footer">
            <span>{{ companyPrintFacts.name }}</span>
            <span>{{ order.code }}&nbsp;&nbsp;|&nbsp;&nbsp;{{ pageIndex + 1 }} / {{ orderPages.length }}</span>
          </footer>
        </article>
      </div>
    </div>
  </main>
</template>

<style scoped>
.order-pdf-preview {
  --pdf-ink: #181a1d;
  --pdf-muted: #6d7278;
  --pdf-faint: #a4a8ad;
  --pdf-line: #daddd9;
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  color: var(--pdf-ink);
  background: #e8e9e6;
  font-family: "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif;
}

.preview-toolbar {
  z-index: 10;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 58px;
  padding: 9px 20px;
  color: #fff;
  background: rgba(24, 26, 29, 0.96);
  box-shadow: 0 8px 24px rgba(17, 18, 20, 0.16);
  backdrop-filter: blur(12px);
}

.preview-back,
.preview-page-control button,
.preview-print-action,
.preview-state button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  font: inherit;
  text-decoration: none;
  cursor: pointer;
}

.preview-back {
  width: max-content;
  color: #d5d7d9;
}

.preview-back:hover {
  color: #fff;
}

.preview-toolbar-leading,
.preview-toolbar-actions {
  display: flex;
  align-items: center;
  min-width: 0;
}

.preview-toolbar-leading {
  gap: 18px;
}

.preview-toolbar-actions {
  justify-content: flex-end;
  gap: 10px;
}

.preview-toolbar-title {
  display: grid;
  gap: 2px;
  min-width: 0;
  text-align: left;
}

.preview-toolbar-title strong {
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-toolbar-title span {
  color: #aeb2b6;
  font-size: 11px;
}

.preview-template-control {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #aeb2b6;
  font-size: 12px;
}

.preview-template-control select {
  width: 214px;
  height: 34px;
  padding: 0 28px 0 10px;
  overflow: hidden;
  border: 1px solid #4a4d50;
  border-radius: 5px;
  outline: none;
  color: #f4f5f5;
  background: #2c2e31;
  font: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-template-control select:focus-visible {
  border-color: #95999d;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.12);
}

.preview-template-control select:disabled {
  opacity: 0.5;
}

.preview-page-control {
  display: grid;
  grid-template-columns: 32px 48px 32px;
  align-items: center;
  overflow: hidden;
  border: 1px solid #4a4d50;
  border-radius: 5px;
}

.preview-page-control button {
  width: 32px;
  height: 32px;
  padding: 0;
  color: #dfe1e2;
  background: transparent;
}

.preview-page-control button:hover:not(:disabled) {
  color: #fff;
  background: #373a3d;
}

.preview-page-control button:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}

.preview-page-control > span {
  color: #d5d7d9;
  font-size: 11px;
  text-align: center;
}

.preview-print-action {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 5px;
  color: var(--pdf-ink);
  background: #fff;
  font-size: 13px;
  font-weight: 700;
}

.preview-print-action:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.preview-state {
  display: grid;
  flex: 1 1 auto;
  place-items: center;
  gap: 12px;
  min-height: 0;
  color: #656a70;
}

.preview-state.preview-error {
  align-content: center;
}

.preview-state button {
  min-height: 34px;
  padding: 0 13px;
  border-radius: 5px;
  color: #fff;
  background: var(--pdf-ink);
}

.preview-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #c8cbce;
  border-top-color: var(--pdf-ink);
  border-radius: 50%;
  animation: order-preview-spin 0.8s linear infinite;
}

@keyframes order-preview-spin {
  to { transform: rotate(360deg); }
}

.order-preview-scroll {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}

.order-sheet-stack {
  display: grid;
  justify-items: center;
  box-sizing: border-box;
  width: max-content;
  min-width: 100%;
  gap: 24px;
  padding: 30px 24px 48px;
}

.order-pdf-sheet {
  position: relative;
  box-sizing: border-box;
  width: 210mm;
  min-width: 210mm;
  height: 297mm;
  padding: 9mm 16mm 24mm;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 18px 54px rgba(28, 30, 32, 0.17);
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

.letterhead-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64mm;
  align-items: start;
}

.brand-lockup {
  display: flex;
  align-items: center;
  min-width: 0;
}

.brand-logo {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 45mm;
  height: 11.5mm;
  border-radius: 1.8mm;
  background: var(--pdf-ink);
}

.brand-logo img {
  display: block;
  width: 34mm;
  height: auto;
}

.brand-divider {
  flex: 0 0 auto;
  width: 0.3mm;
  height: 9.5mm;
  margin-left: 4mm;
  background: var(--pdf-line);
}

.brand-slogan {
  display: grid;
  gap: 0.45mm;
  margin-left: 4mm;
  color: var(--pdf-muted);
  font-size: 5.8pt;
  font-weight: 400;
  line-height: 1;
  white-space: nowrap;
}

.letterhead-top h1 {
  margin: 1mm 0 0;
  font-size: 20pt;
  line-height: 1;
  text-align: right;
}

.letterhead-facts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58mm;
  gap: 8mm;
  margin-top: 3mm;
}

.company-facts {
  display: grid;
  align-content: start;
  gap: 0.9mm;
  min-width: 0;
}

.company-facts strong {
  overflow: hidden;
  font-size: 10.2pt;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.company-facts span {
  overflow: hidden;
  color: var(--pdf-muted);
  font-size: 7.6pt;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-meta {
  display: grid;
  align-content: start;
  gap: 1.5mm;
  margin: 0;
}

.order-meta div {
  display: grid;
  grid-template-columns: 18mm minmax(0, 1fr);
  align-items: baseline;
  gap: 3mm;
}

.order-meta dt {
  color: var(--pdf-muted);
  font-size: 7.8pt;
  white-space: nowrap;
}

.order-meta dd {
  overflow: hidden;
  margin: 0;
  font-size: 8.8pt;
  line-height: 1.25;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-meta div:first-child dd {
  font-weight: 700;
}

.letterhead-rule,
.order-section-rule {
  border-top: 0.35mm solid var(--pdf-ink);
}

.letterhead-rule {
  margin-top: 3.5mm;
}

.order-parties-section {
  margin-top: 5.2mm;
}

.order-parties-section h2,
.pdf-section-heading h2,
.order-terms-section h2,
.order-signatures-section h2 {
  margin: 0;
  font-size: 11.2pt;
  line-height: 1.2;
}

.party-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 3.4mm;
}

.party-card {
  min-width: 0;
  padding-right: 8mm;
}

.party-card + .party-card {
  padding-right: 0;
  padding-left: 8mm;
  border-left: 0.25mm solid var(--pdf-line);
}

.party-label {
  display: block;
  margin-bottom: 1.6mm;
  font-size: 8.6pt;
  font-weight: 700;
  line-height: 1.2;
}

.party-card dl {
  display: grid;
  gap: 0;
  margin: 0;
}

.party-card dl div {
  display: grid;
  grid-template-columns: 16.5mm minmax(0, 1fr);
  align-items: baseline;
  gap: 2mm;
  min-height: 4.4mm;
  padding: 0.45mm 0;
}

.party-card dt {
  color: var(--pdf-muted);
  font-size: 7.6pt;
}

.party-card dd {
  margin: 0;
  font-size: 8.2pt;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.party-card .party-company dd {
  font-size: 8.8pt;
  font-weight: 700;
}

.party-card .party-address {
  align-items: start;
}

.party-card .party-address dd {
  color: inherit;
  font-size: 7.9pt;
  line-height: 1.35;
}

.order-parties-rule {
  margin-top: 3.8mm;
  border-top: 0.35mm solid var(--pdf-ink);
}

.order-lines-section {
  margin-top: 5.2mm;
}

.pdf-section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.pdf-section-heading > span {
  color: var(--pdf-muted);
  font-size: 8pt;
}

.pdf-line-table {
  margin-top: 3.5mm;
}

.pdf-line-head,
.pdf-line-row {
  display: grid;
  grid-template-columns: 10mm 76mm 19mm 16mm 27mm 30mm;
}

.pdf-line-head {
  align-items: center;
  box-sizing: border-box;
  min-height: 7.5mm;
  border-radius: 1.6mm;
  color: #fff;
  background: var(--pdf-ink);
  font-size: 8pt;
  font-weight: 700;
}

.pdf-line-head span {
  line-height: 1;
  text-align: center;
}

.pdf-line-head span:nth-child(2) {
  padding-left: 3mm;
  text-align: left;
}

.pdf-line-head span:nth-child(3),
.pdf-line-head span:nth-child(5),
.pdf-line-head span:nth-child(6) {
  padding-right: 3mm;
  text-align: right;
}

.pdf-line-row {
  align-items: center;
  box-sizing: border-box;
  min-height: 16.5mm;
  border-bottom: 0.25mm solid var(--pdf-line);
}

.line-index {
  color: var(--pdf-muted);
  font-size: 8.5pt;
  text-align: center;
}

.line-product {
  display: grid;
  align-content: center;
  gap: 0;
  min-width: 0;
  padding: 1.8mm 3mm;
}

.line-product strong,
.line-product span {
  overflow-wrap: anywhere;
}

.line-product strong {
  font-size: 9.5pt;
  font-weight: 750;
  line-height: 1.25;
}

.line-model {
  margin-top: 0.9mm;
  color: #454b45;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 8.1pt;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: 0.01em;
}

.line-spec {
  margin-top: 0.65mm;
  color: var(--pdf-muted);
  font-size: 7.8pt;
  font-weight: 400;
  line-height: 1.35;
}

.line-number,
.line-money {
  padding-right: 3mm;
  font-size: 9pt;
  text-align: right;
}

.line-unit {
  font-size: 9pt;
  text-align: center;
}

.line-amount {
  font-size: 9.4pt;
}

.pdf-line-empty {
  display: grid;
  place-items: center;
  min-height: 16.5mm;
  border-bottom: 0.25mm solid var(--pdf-line);
  color: var(--pdf-muted);
  font-size: 9pt;
}

.order-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  box-sizing: border-box;
  width: 66mm;
  margin-top: 3.6mm;
  margin-left: auto;
  padding-top: 3mm;
  border-top: 0.35mm solid var(--pdf-ink);
}

.order-total span {
  color: var(--pdf-muted);
  font-size: 8.6pt;
}

.order-total-label {
  display: inline-flex;
  align-items: baseline;
  gap: 2mm;
}

.order-total-label small {
  color: inherit;
  font-size: 7.4pt;
  font-weight: 400;
}

.order-total strong {
  font-size: 11.2pt;
  line-height: 1;
}

.order-section-rule {
  margin-top: 3.8mm;
}

.order-terms-section {
  margin-top: 5.2mm;
}

.order-terms-section.is-standalone {
  margin-top: 6mm;
}

.term-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 4mm 0 0;
}

.term-facts > div {
  display: grid;
  align-content: start;
  gap: 1.1mm;
  min-width: 0;
  padding: 0 4mm;
}

.term-facts > div:first-child {
  padding-left: 0;
}

.term-facts > div + div {
  border-left: 0.25mm solid var(--pdf-line);
}

.term-facts dt {
  color: var(--pdf-muted);
  font-size: 7.6pt;
}

.term-facts dd {
  margin: 0;
  font-size: 8.8pt;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
  white-space: normal;
}

.purchase-receiving-facts {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
  margin: 3.4mm 0 0;
  padding-top: 3.2mm;
  border-top: 0.25mm solid var(--pdf-line);
}

.purchase-receiving-facts > div {
  display: grid;
  align-content: start;
  gap: 1mm;
  min-width: 0;
  padding: 0 4mm;
}

.purchase-receiving-facts > div:first-child {
  padding-left: 0;
}

.purchase-receiving-facts > div + div {
  border-left: 0.25mm solid var(--pdf-line);
}

.purchase-receiving-facts dt {
  color: var(--pdf-muted);
  font-size: 7.6pt;
}

.purchase-receiving-facts dd {
  margin: 0;
  font-size: 8.2pt;
  font-weight: 650;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.term-note {
  margin-top: 4.2mm;
}

.term-continuation-title {
  display: block;
  color: var(--pdf-muted);
  font-size: 8pt;
  font-weight: 400;
  line-height: 1.3;
}

.term-continuation-title + .term-note {
  margin-top: 1.6mm;
}

.term-note > span {
  display: block;
  color: var(--pdf-muted);
  font-size: 8pt;
}

.term-note p {
  margin: 1.6mm 0 0;
  font-size: 8.3pt;
  line-height: 4mm;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.order-terms-rule {
  margin-top: 4.2mm;
  border-top: 0.35mm solid var(--pdf-ink);
}

.order-signatures-section {
  margin-top: 4.6mm;
}

.signature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 3.7mm;
}

.signature-card {
  min-width: 0;
  padding-right: 11mm;
}

.signature-card + .signature-card {
  padding-right: 0;
  padding-left: 11mm;
  border-left: 0.25mm solid var(--pdf-line);
}

.signature-title {
  display: flex;
  align-items: baseline;
  gap: 8mm;
  line-height: 1;
}

.signature-title strong {
  flex: 0 0 auto;
  font-size: 9.2pt;
}

.signature-date {
  display: inline-flex;
  align-items: baseline;
  gap: 1.8mm;
  color: var(--pdf-muted);
  font-size: 7.4pt;
}

.signature-date i {
  display: inline-block;
  width: 23mm;
  border-bottom: 0.25mm solid var(--pdf-line);
}

.signature-space {
  height: 20mm;
}

.order-page-footer {
  position: absolute;
  right: 16mm;
  bottom: 11mm;
  left: 16mm;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 4.4mm;
  border-top: 0.25mm solid var(--pdf-line);
  color: var(--pdf-faint);
  font-size: 7.4pt;
}

@media (max-width: 900px) {
  .preview-toolbar {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }

  .preview-toolbar-leading,
  .preview-toolbar-actions {
    width: 100%;
  }

  .preview-toolbar-leading {
    justify-content: space-between;
  }

  .preview-toolbar-actions {
    flex-wrap: wrap;
  }

  .preview-template-control {
    flex: 1 1 230px;
  }

  .preview-template-control select {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
  }
}

@media (max-width: 560px) {
  .preview-toolbar {
    padding: 9px 12px;
  }

  .preview-toolbar-title span {
    display: none;
  }

  .preview-page-control {
    margin-left: auto;
  }
}

@media print {
  :global(html),
  :global(body),
  :global(#app) {
    width: 210mm;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    background: #fff !important;
  }

  .order-pdf-preview {
    display: block;
    height: auto;
    min-height: 0;
    overflow: visible;
    background: #fff;
  }

  .preview-toolbar,
  .preview-state {
    display: none !important;
  }

  .order-sheet-stack {
    display: block;
    width: 210mm;
    min-width: 210mm;
    padding: 0;
    overflow: visible;
  }

  .order-preview-scroll {
    overflow: visible;
  }

  .order-pdf-sheet {
    margin: 0;
    box-shadow: none;
    break-after: page;
    page-break-after: always;
  }

  .order-pdf-sheet:last-child {
    break-after: auto;
    page-break-after: auto;
  }
}

@page {
  size: A4;
  margin: 0;
}
</style>
