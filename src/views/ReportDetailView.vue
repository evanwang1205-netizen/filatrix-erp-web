<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowLeft, BarChart3, Download, FileDown, Printer } from 'lucide-vue-next';

import { reportRowsByPage, type ReportRow, type ReportTabKey } from '../data/reports';

const route = useRoute();

const routePageMap: Record<string, ReportTabKey> = {
  sales: 'sales',
  inventory: 'inventory',
  production: 'production',
};

const pageTitles: Record<ReportTabKey, string> = {
  sales: '销售报表',
  inventory: '库存报表',
  production: '生产报表',
};

const currentPage = computed<ReportTabKey>(() => {
  const page = route.params.page?.toString() ?? '';
  return routePageMap[page] ?? 'sales';
});
const backPath = computed(() => `/reports/${currentPage.value}`);
const currentReport = computed<ReportRow | undefined>(() => {
  const code = route.params.code?.toString();
  return reportRowsByPage[currentPage.value].find((row) => row.code === code);
});

const summaryRows = computed(() => {
  const report = currentReport.value;
  if (!report) return [];

  return [
    { label: '报表分类', value: report.category },
    { label: '统计范围', value: report.range },
    { label: '核心指标', value: report.metric },
    { label: '当前数值', value: report.amount },
    { label: '对比变化', value: report.comparison },
    { label: '负责部门', value: report.owner },
    { label: '更新日期', value: report.date },
  ];
});

function statusClass(status: string) {
  if (status.includes('异常') || status.includes('逾期')) return 'status-void';
  if (status.includes('待') || status.includes('中')) return 'status-pending';
  if (['合格', '有效', '充足', '可查看', '已完成', '已关闭'].includes(status)) return 'status-done';
  return 'status-neutral';
}

function printReport() {
  window.print();
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportReport() {
  const report = currentReport.value;
  if (!report) return;

  const rows = [
    ['名称', '主信息', '辅助信息', '数值', '状态'],
    ...report.lines.map((line) => [line.name, line.primary, line.secondary, line.amount, line.status]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${report.title}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="page-stack">
    <section v-if="currentReport" class="quote-editor report-detail-page">
      <div class="quote-editor-header">
        <div>
          <RouterLink class="back-link" :to="backPath">
            <ArrowLeft :size="14" />
            返回{{ pageTitles[currentPage] }}
          </RouterLink>
          <h1>{{ currentReport.title }}</h1>
        </div>

        <div class="quote-editor-actions">
          <button class="secondary-action" type="button" @click="printReport">
            <Printer :size="15" />
            打印
          </button>
          <button class="secondary-action" type="button" title="通过浏览器打印保存为 PDF" @click="printReport">
            <FileDown :size="15" />
            转PDF
          </button>
          <button class="primary-action" type="button" @click="exportReport">
            <Download :size="15" />
            导出明细
          </button>
        </div>
      </div>

      <div class="quote-form-grid">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading">
              <h2>报表概览</h2>
              <i class="mini-status" :class="statusClass(currentReport.status)">{{ currentReport.status }}</i>
            </div>

            <div class="quote-fields">
              <label class="form-field">
                <span>报表编号</span>
                <input :value="currentReport.code" type="text" readonly />
              </label>
              <label class="form-field">
                <span>报表分类</span>
                <input :value="currentReport.category" type="text" readonly />
              </label>
              <label class="form-field">
                <span>统计范围</span>
                <input :value="currentReport.range" type="text" readonly />
              </label>
              <label class="form-field">
                <span>核心指标</span>
                <input :value="currentReport.metric" type="text" readonly />
              </label>
              <label class="form-field">
                <span>当前数值</span>
                <input :value="currentReport.amount" type="text" readonly />
              </label>
              <label class="form-field">
                <span>对比变化</span>
                <input :value="currentReport.comparison" type="text" readonly />
              </label>
              <label class="form-field full-field">
                <span>报表说明</span>
                <textarea :value="currentReport.note" rows="4" readonly></textarea>
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>明细数据</h2>
            </div>

            <div class="table-scroll reference-table-scroll">
              <div class="data-table reference-table report-detail-table">
                <div class="table-row table-head">
                  <span>名称</span>
                  <span>主信息</span>
                  <span>辅助信息</span>
                  <span>数值</span>
                  <span>状态</span>
                </div>
                <div v-for="line in currentReport.lines" :key="`${line.name}-${line.primary}`" class="table-row">
                  <span class="product-summary">
                    <strong>{{ line.name }}</strong>
                    <small>{{ currentReport.category }}</small>
                  </span>
                  <span>{{ line.primary }}</span>
                  <span>{{ line.secondary }}</span>
                  <span class="amount-cell">{{ line.amount }}</span>
                  <span><i class="mini-status" :class="statusClass(line.status)">{{ line.status }}</i></span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside class="quote-summary-panel">
          <section class="summary-section">
            <div class="summary-title">
              <BarChart3 :size="17" />
              <h2>报表摘要</h2>
            </div>
            <div v-for="row in summaryRows" :key="row.label" class="summary-line">
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </div>
          </section>

          <section class="summary-section">
            <h2>使用口径</h2>
            <div class="process-note">
              <strong>原型阶段</strong>
              <span>当前数据为前端 mock，用来确认报表结构、筛选字段和钻取路径；接入 API 后再替换为实时统计口径。</span>
            </div>
          </section>
        </aside>
      </div>
    </section>

    <section v-else class="form-section quote-empty-state">
      <h1>没有找到报表</h1>
      <RouterLink class="primary-action" :to="backPath">返回报表列表</RouterLink>
    </section>
  </div>
</template>
