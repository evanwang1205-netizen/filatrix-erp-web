<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import type { DocumentStatusItem, DocumentStatusTone } from '../types/documentUi';
import { statusPresentationTone } from '../utils/statusPresentation';

const props = withDefaults(defineProps<{
  title?: string;
  primaryStatus: string;
  primaryTone?: DocumentStatusTone;
  items?: readonly DocumentStatusItem[];
  ariaLabel?: string;
}>(), {
  title: '状态与进度',
  primaryTone: undefined,
  items: () => [],
  ariaLabel: '单据状态与进度',
});

const resolvedPrimaryTone = computed(() => props.primaryTone || statusPresentationTone(props.primaryStatus));

function itemTone(item: DocumentStatusItem) {
  return item.tone || statusPresentationTone(item.value);
}
</script>

<template>
  <div class="document-status-panel" :aria-label="ariaLabel">
    <div class="document-status-heading">
      <h2>{{ title }}</h2>
      <i class="document-status-pill" :data-tone="resolvedPrimaryTone">{{ primaryStatus }}</i>
    </div>

    <dl class="document-status-dimensions">
      <div v-for="item in items" :key="item.key" class="document-status-row">
        <dt>{{ item.label }}</dt>
        <dd>
          <RouterLink v-if="item.route" :to="item.route" class="document-status-link" :title="item.value">
            {{ item.value }}
          </RouterLink>
          <strong v-else-if="item.kind === 'metric' || item.kind === 'text'" :class="{ 'is-text': item.kind === 'text' }" :title="item.value">
            {{ item.value }}
          </strong>
          <i v-else class="document-status-pill is-dimension" :data-tone="itemTone(item)" :title="item.value">{{ item.value }}</i>
        </dd>
        <small v-if="item.detail" class="document-status-detail" :title="item.detail">{{ item.detail }}</small>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.document-status-panel {
  display: grid;
  gap: 10px;
}

.document-status-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.document-status-heading h2 {
  margin: 0;
  color: #282d29;
  font-size: 14px;
  font-weight: 720;
  line-height: 1.35;
}

.document-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  color: #606660;
  background: #f5f6f3;
  font-size: 12px;
  font-style: normal;
  font-weight: 650;
  line-height: 1.2;
  white-space: nowrap;
}

.document-status-pill[data-tone='neutral'] {
  color: #5c5d56;
  background: #eeeee8;
}

.document-status-pill[data-tone='success'] {
  color: #3f5042;
  background: #e7efe7;
}

.document-status-pill[data-tone='warning'] {
  color: #785222;
  background: #f2eadc;
}

.document-status-pill[data-tone='danger'] {
  color: #7e332d;
  background: #f4e6e3;
}

.document-status-pill[data-tone='info'] {
  color: #315b73;
  background: #e4eef3;
}

.document-status-dimensions {
  display: grid;
  margin: 0;
}

.document-status-row {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid #eceee9;
}

.document-status-row:first-child {
  border-top: 0;
}

.document-status-row dt {
  min-width: 0;
  color: #747b75;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
}

.document-status-row dd {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  margin: 0;
  text-align: right;
}

.document-status-row strong,
.document-status-link {
  min-width: 0;
  color: #2f3430;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.document-status-row strong.is-text {
  font-weight: 650;
}

.document-status-link {
  color: #315f43;
  text-decoration: none;
  text-underline-offset: 3px;
}

.document-status-link:hover {
  text-decoration: underline;
}

.document-status-detail {
  grid-column: 1 / -1;
  margin-top: -7px;
  color: #7b817b;
  font-size: 11px;
  line-height: 1.45;
  text-align: right;
}

.document-status-pill.is-dimension {
  max-width: 176px;
  white-space: normal;
  text-align: center;
}
</style>
