<script setup lang="ts">
import { RouterLink } from 'vue-router';

import type { DocumentFact } from '../types/documentUi';

defineProps<{
  facts: readonly DocumentFact[];
  ariaLabel?: string;
}>();
</script>

<template>
  <dl class="document-summary-facts" :aria-label="ariaLabel">
    <div v-for="(fact, index) in facts" :key="fact.key || `${fact.label}-${index}`">
      <dt>{{ fact.label }}</dt>
      <dd :class="{ 'is-multiline': fact.multiline }">
        <RouterLink v-if="fact.route" :to="fact.route">{{ fact.value }}</RouterLink>
        <template v-else>{{ fact.value }}</template>
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.document-summary-facts {
  display: grid;
  gap: 0;
  margin: 0;
}

.document-summary-facts > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(92px, auto);
  align-items: start;
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid #eceee9;
}

.document-summary-facts > div:first-child {
  padding-top: 0;
  border-top: 0;
}

.document-summary-facts > div:last-child {
  padding-bottom: 0;
}

.document-summary-facts dt,
.document-summary-facts dd {
  min-width: 0;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}

.document-summary-facts dt {
  color: #747b75;
}

.document-summary-facts dd {
  color: #2e332f;
  font-weight: 690;
  overflow-wrap: anywhere;
  text-align: right;
}

.document-summary-facts dd.is-multiline {
  white-space: pre-wrap;
}

.document-summary-facts a {
  color: #315f43;
  text-decoration: none;
  text-underline-offset: 3px;
}

.document-summary-facts a:hover {
  text-decoration: underline;
}
</style>
