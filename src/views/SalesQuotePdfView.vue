<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ArrowLeft, ChevronLeft, ChevronRight, Printer, RefreshCw } from 'lucide-vue-next';
import { useRoute } from 'vue-router';

import { getMasterRecord, getSalesQuote } from '../services/api';
import type { MasterDataRecord } from '../data/masterData';
import type { SalesQuote, SalesQuoteProduct } from '../types/business';

type QuotePdfPage = {
  items: SalesQuoteProduct[] | null;
  showTotal: boolean;
  showTerms: boolean;
  showTermFacts: boolean;
  isTermsContinuation: boolean;
  termsText: string;
};

type QuotePdfTemplateOption = {
  id: string;
  language: 'zh-CN';
  label: string;
};

const quoteTemplateDefinitions = [
  { id: 'standard-zh-cn', language: 'zh-CN', labelSuffix: '中文报价单' },
] as const;

const route = useRoute();
const quote = ref<SalesQuote | null>(null);
const companyRecord = ref<MasterDataRecord | null>(null);
const currencyRecord = ref<MasterDataRecord | null>(null);
const previewScroller = ref<HTMLElement | null>(null);
const selectedTemplateId = ref('');
const currentPreviewPage = ref(1);
const isLoading = ref(false);
const loadError = ref('');
const originalDocumentTitle = document.title;
let loadRequestId = 0;

const quoteCode = computed(() => route.params.code?.toString() || '');
const quotePath = computed(() => (
  quoteCode.value ? `/sales/quotes/${encodeURIComponent(quoteCode.value)}` : '/sales/quotes'
));
const companyPrintFacts = computed(() => {
  const snapshot = quote.value?.companyPrintSnapshot;
  return {
    name: snapshot?.name || companyRecord.value?.name || quote.value?.company || '—',
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
  || quote.value?.company?.trim()
  || companyPrintFacts.value.name
  || '公司'
));
const quoteTemplateOptions = computed<QuotePdfTemplateOption[]>(() => {
  if (!quote.value) return [];
  return quoteTemplateDefinitions.map((definition) => ({
    id: `${quote.value?.companyCode || 'company'}:${definition.id}`,
    language: definition.language,
    label: `${companyShortName.value} ${definition.labelSuffix}`,
  }));
});
const currencyCode = computed(() => quote.value?.currency || currencyRecord.value?.code || 'CNY');
const currencySymbol = computed(() => (
  currencyRecord.value?.symbol
  || (currencyCode.value === 'CNY' ? '￥' : `${currencyCode.value} `)
));
const currencyDecimals = computed(() => {
  const value = Number(currencyRecord.value?.decimalPlaces);
  return Number.isInteger(value) && value >= 0 && value <= 6 ? value : 2;
});
const estimatedTermLines = computed(() => estimateWrappedLines(quote.value?.remark || '—'));
const finalProductCapacity = computed(() => (
  Math.max(1, 6 - Math.ceil(Math.max(estimatedTermLines.value - 4, 0) / 5))
));
const quotePages = computed<QuotePdfPage[]>(() => {
  if (!quote.value) return [];

  const products = quote.value.products || [];
  const termsText = quote.value.remark?.trim() || '—';
  const keepTermsWithProducts = estimatedTermLines.value <= 24;

  if (keepTermsWithProducts) {
    const groups = paginateProducts(products, finalProductCapacity.value);
    return groups.map((items, index) => {
      const isLast = index === groups.length - 1;
      return {
        items,
        showTotal: isLast,
        showTerms: isLast,
        showTermFacts: isLast,
        isTermsContinuation: false,
        termsText: isLast ? termsText : '',
      };
    });
  }

  const termPrelude = splitTermsPrelude(termsText);
  const productGroups = paginateProducts(products, 6);
  const pages: QuotePdfPage[] = productGroups.map((items, index) => ({
    items,
    showTotal: index === productGroups.length - 1,
    showTerms: index === productGroups.length - 1,
    showTermFacts: index === productGroups.length - 1,
    isTermsContinuation: false,
    termsText: index === productGroups.length - 1 ? termPrelude.first : '',
  }));
  const termChunks = termPrelude.remaining ? splitTermsText(termPrelude.remaining) : [];
  termChunks.forEach((termsChunk) => {
    pages.push({
      items: null,
      showTotal: false,
      showTerms: true,
      showTermFacts: false,
      isTermsContinuation: true,
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
  const maxUnits = 56 * 34;
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

function paginateProducts(products: SalesQuoteProduct[], finalCapacity: number) {
  if (!products.length) return [[]];
  if (products.length <= finalCapacity) return [products];

  let pageCount = 2;
  while ((pageCount - 1) * 9 + finalCapacity < products.length) pageCount += 1;

  const finalPageSize = Math.min(finalCapacity, Math.ceil(products.length / pageCount));
  let remaining = products.length - finalPageSize;
  let cursor = 0;
  const groups: SalesQuoteProduct[][] = [];

  for (let pageIndex = 0; pageIndex < pageCount - 1; pageIndex += 1) {
    const remainingPages = pageCount - 1 - pageIndex;
    const pageSize = Math.min(9, Math.ceil(remaining / remainingPages));
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

function quantityParts(item: SalesQuoteProduct) {
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

function lineGrossUnitPrice(item: SalesQuoteProduct) {
  return item.grossUnitPrice || item.unitPrice;
}

function lineGrossAmount(item: SalesQuoteProduct) {
  return item.grossAmount || item.amount;
}

function printQuote() {
  window.print();
}

function pageElement(pageNumber: number) {
  return previewScroller.value?.querySelector<HTMLElement>(`[data-preview-page="${pageNumber}"]`) || null;
}

function goToPreviewPage(pageNumber: number) {
  const totalPages = quotePages.value.length;
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
  if (!scroller || !quotePages.value.length) return;
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

async function loadQuotePdf() {
  const requestId = ++loadRequestId;
  loadError.value = '';
  isLoading.value = true;
  quote.value = null;
  companyRecord.value = null;
  currencyRecord.value = null;

  try {
    const response = await getSalesQuote(quoteCode.value);
    if (requestId !== loadRequestId) return;
    quote.value = response.quote;
    document.title = `${response.quote.code}-报价单`;

    const [companyResult, currencyResult] = await Promise.allSettled([
      response.quote.companyCode
        ? getMasterRecord('company', response.quote.companyCode)
        : Promise.resolve(null),
      getMasterRecord('currencies', response.quote.currency || 'CNY'),
    ]);
    if (requestId !== loadRequestId) return;
    companyRecord.value = companyResult.status === 'fulfilled' ? companyResult.value : null;
    currencyRecord.value = currencyResult.status === 'fulfilled' ? currencyResult.value : null;
  } catch (error) {
    if (requestId !== loadRequestId) return;
    loadError.value = error instanceof Error ? error.message : '报价单 PDF 预览加载失败';
  } finally {
    if (requestId === loadRequestId) isLoading.value = false;
  }
}

watch(quoteCode, loadQuotePdf, { immediate: true });
watch(quoteTemplateOptions, (options) => {
  if (!options.some((option) => option.id === selectedTemplateId.value)) {
    selectedTemplateId.value = options[0]?.id || '';
  }
}, { immediate: true });
watch(() => quotePages.value.length, () => {
  currentPreviewPage.value = 1;
  if (previewScroller.value) previewScroller.value.scrollTop = 0;
});

onBeforeUnmount(() => {
  loadRequestId += 1;
  document.title = originalDocumentTitle;
});
</script>

<template>
  <main class="quote-pdf-preview">
    <header class="preview-toolbar">
      <div class="preview-toolbar-leading">
        <RouterLink class="preview-back" :to="quotePath">
          <ArrowLeft :size="16" />
          返回报价单
        </RouterLink>
        <div class="preview-toolbar-title">
          <strong>{{ quote?.code || '报价单' }}</strong>
          <span v-if="quotePages.length">A4 · 共 {{ quotePages.length }} 页</span>
        </div>
      </div>
      <div class="preview-toolbar-actions">
        <label class="preview-template-control">
          <span>模板</span>
          <select v-model="selectedTemplateId" :disabled="!quote">
            <option
              v-for="templateOption in quoteTemplateOptions"
              :key="templateOption.id"
              :value="templateOption.id"
            >
              {{ templateOption.label }}
            </option>
          </select>
        </label>
        <div v-if="quotePages.length" class="preview-page-control" aria-label="预览翻页">
          <button
            type="button"
            aria-label="上一页"
            :disabled="currentPreviewPage <= 1"
            @click="goToPreviewPage(currentPreviewPage - 1)"
          >
            <ChevronLeft :size="16" />
          </button>
          <span>{{ currentPreviewPage }} / {{ quotePages.length }}</span>
          <button
            type="button"
            aria-label="下一页"
            :disabled="currentPreviewPage >= quotePages.length"
            @click="goToPreviewPage(currentPreviewPage + 1)"
          >
            <ChevronRight :size="16" />
          </button>
        </div>
        <button class="preview-print-action" type="button" :disabled="!quote" @click="printQuote">
          <Printer :size="16" />
          打印 / 保存 PDF
        </button>
      </div>
    </header>

    <section v-if="isLoading" class="preview-state">
      <span class="preview-spinner"></span>
      正在准备报价单预览…
    </section>
    <section v-else-if="loadError" class="preview-state preview-error">
      <strong>报价单预览加载失败</strong>
      <span>{{ loadError }}</span>
      <button type="button" @click="loadQuotePdf">
        <RefreshCw :size="15" />
        重新加载
      </button>
    </section>

    <div
      v-else-if="quote"
      ref="previewScroller"
      class="quote-preview-scroll"
      @scroll.passive="syncCurrentPreviewPage"
    >
      <div class="quote-sheet-stack">
        <article
          v-for="(page, pageIndex) in quotePages"
          :key="pageIndex"
          class="quote-pdf-sheet"
          :data-preview-page="pageIndex + 1"
        >
        <header class="quote-letterhead">
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
            <h1>报价单</h1>
          </div>

          <div class="letterhead-facts">
            <div class="company-facts">
              <strong>{{ companyPrintFacts.name }}</strong>
              <span>{{ companyPrintFacts.address }}</span>
              <span>{{ companyPrintFacts.email }}</span>
              <span>{{ websiteDisplay || '—' }}</span>
            </div>
            <dl class="quote-meta">
              <div>
                <dt>报价单号</dt>
                <dd>{{ quote.code }}</dd>
              </div>
              <div>
                <dt>客户名称</dt>
                <dd>{{ quote.customer || '—' }}</dd>
              </div>
              <div>
                <dt>报价日期</dt>
                <dd>{{ quote.date || '—' }}</dd>
              </div>
              <div>
                <dt>有效期至</dt>
                <dd>{{ quote.validUntil || '—' }}</dd>
              </div>
            </dl>
          </div>
          <div class="letterhead-rule"></div>
        </header>

        <section v-if="page.items !== null" class="quote-lines-section">
          <div class="pdf-section-heading">
            <h2>报价明细</h2>
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
              :key="`${item.materialCode || item.name}-${itemIndex}`"
              class="pdf-line-row"
            >
              <span class="line-index">
                {{ String(quote.products.indexOf(item) + 1).padStart(2, '0') }}
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
            <div v-if="!page.items.length" class="pdf-line-empty">暂无报价商品</div>
          </div>

          <div v-if="page.showTotal" class="quote-total">
            <span class="quote-total-label">
              <span>含税总计</span>
              <small>{{ currencyCode }}</small>
            </span>
            <strong>{{ formatMoney(quote.amount) }}</strong>
          </div>
          <div v-if="page.showTotal" class="quote-section-rule"></div>
        </section>

        <section
          v-if="page.showTerms"
          class="quote-terms-section"
          :class="{ 'is-standalone': page.items === null }"
        >
          <h2 v-if="page.showTermFacts">商务条款</h2>
          <span v-else class="term-continuation-title">
            {{ page.isTermsContinuation ? '补充条款（续）' : '补充条款' }}
          </span>
          <dl v-if="page.showTermFacts" class="term-facts">
            <div>
              <dt>交付方式</dt>
              <dd>{{ quote.deliveryMethod || '—' }}</dd>
            </div>
            <div>
              <dt>运费承担</dt>
              <dd>{{ quote.freightPayer || '—' }}</dd>
            </div>
            <div>
              <dt>付款方式</dt>
              <dd>{{ quote.paymentMethod || '—' }}</dd>
            </div>
          </dl>
          <div class="term-note">
            <span v-if="page.showTermFacts">补充条款</span>
            <p>{{ page.termsText }}</p>
          </div>
        </section>

          <footer class="quote-page-footer">
            <span>{{ companyPrintFacts.name }}</span>
            <span>{{ quote.code }}&nbsp;&nbsp;|&nbsp;&nbsp;{{ pageIndex + 1 }} / {{ quotePages.length }}</span>
          </footer>
        </article>
      </div>
    </div>
  </main>
</template>

<style scoped>
.quote-pdf-preview {
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
  width: 202px;
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
  animation: quote-preview-spin 0.8s linear infinite;
}

@keyframes quote-preview-spin {
  to { transform: rotate(360deg); }
}

.quote-preview-scroll {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}

.quote-sheet-stack {
  display: grid;
  justify-items: center;
  box-sizing: border-box;
  width: max-content;
  min-width: 100%;
  gap: 24px;
  padding: 30px 24px 48px;
}

.quote-pdf-sheet {
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

.quote-meta {
  display: grid;
  gap: 1.5mm;
  margin: 0;
}

.quote-meta div {
  display: grid;
  grid-template-columns: 18mm minmax(0, 1fr);
  align-items: baseline;
  gap: 3mm;
}

.quote-meta dt {
  color: var(--pdf-muted);
  font-size: 7.8pt;
  white-space: nowrap;
}

.quote-meta dd {
  overflow: hidden;
  margin: 0;
  font-size: 8.8pt;
  line-height: 1.25;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quote-meta div:first-child dd {
  font-weight: 700;
}

.letterhead-rule,
.quote-section-rule {
  border-top: 0.35mm solid var(--pdf-ink);
}

.letterhead-rule {
  margin-top: 3.5mm;
}

.quote-lines-section {
  margin-top: 5.2mm;
}

.pdf-section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.pdf-section-heading h2,
.quote-terms-section h2 {
  margin: 0;
  font-size: 11.2pt;
  line-height: 1.2;
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

.quote-total {
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

.quote-total span {
  color: var(--pdf-muted);
  font-size: 8.6pt;
}

.quote-total-label {
  display: inline-flex;
  align-items: baseline;
  gap: 2mm;
}

.quote-total-label small {
  color: inherit;
  font-size: 7.4pt;
  font-weight: 400;
}

.quote-total strong {
  font-size: 11.2pt;
  line-height: 1;
}

.quote-section-rule {
  margin-top: 3.8mm;
}

.quote-terms-section {
  margin-top: 5.2mm;
}

.quote-terms-section.is-standalone {
  margin-top: 6mm;
}

.term-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

.quote-page-footer {
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

  .quote-pdf-preview {
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

  .quote-sheet-stack {
    display: block;
    width: 210mm;
    min-width: 210mm;
    padding: 0;
    overflow: visible;
  }

  .quote-preview-scroll {
    overflow: visible;
  }

  .quote-pdf-sheet {
    margin: 0;
    box-shadow: none;
    break-after: page;
    page-break-after: always;
  }

  .quote-pdf-sheet:last-child {
    break-after: auto;
    page-break-after: auto;
  }
}

@page {
  size: A4;
  margin: 0;
}
</style>
