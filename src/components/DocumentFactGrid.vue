<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import type { DocumentFact } from '../types/documentUi';

const props = withDefaults(defineProps<{
  facts: readonly DocumentFact[];
  ariaLabel?: string;
  density?: 'compact' | 'comfortable';
  maxColumns?: 2 | 3 | 4;
}>(), {
  ariaLabel: '单据基础信息',
  density: 'comfortable',
  maxColumns: 4,
});

type PositionedFact = DocumentFact & {
  gridSpan: number;
  mobileFull: boolean;
};

function rowSizes(count: number, maxColumns: number) {
  const sizes: number[] = [];
  let remaining = count;

  while (remaining > 0) {
    if (remaining <= maxColumns) {
      sizes.push(remaining);
      break;
    }

    if (remaining <= maxColumns * 2) {
      const firstRow = Math.ceil(remaining / 2);
      sizes.push(firstRow, remaining - firstRow);
      break;
    }

    sizes.push(maxColumns);
    remaining -= maxColumns;
  }

  return sizes;
}

function positionRun(run: readonly DocumentFact[]) {
  const positioned: PositionedFact[] = [];
  let cursor = 0;
  const mobileFullIndex = run.length % 2 === 1 ? run.length - 1 : -1;

  rowSizes(run.length, props.maxColumns).forEach((size) => {
    const span = 12 / size;
    run.slice(cursor, cursor + size).forEach((fact, index) => positioned.push({
      ...fact,
      gridSpan: span,
      mobileFull: cursor + index === mobileFullIndex,
    }));
    cursor += size;
  });

  return positioned;
}

const positionedFacts = computed(() => {
  const result: PositionedFact[] = [];
  let run: DocumentFact[] = [];

  const flushRun = () => {
    if (!run.length) return;
    result.push(...positionRun(run));
    run = [];
  };

  props.facts.forEach((fact) => {
    if (fact.full) {
      flushRun();
      result.push({ ...fact, gridSpan: 12, mobileFull: true });
      return;
    }
    run.push(fact);
  });
  flushRun();

  return result;
});
</script>

<template>
  <dl class="document-fact-grid" :class="`is-${density}`" :aria-label="ariaLabel">
    <div
      v-for="(fact, index) in positionedFacts"
      :key="fact.key || `${fact.label}-${index}`"
      class="document-fact-item"
      :class="{
        'is-full': fact.full,
        'is-multiline': fact.multiline,
        'is-mobile-full': fact.mobileFull,
      }"
      :data-tone="fact.tone || undefined"
      :style="{ '--document-fact-span': fact.gridSpan }"
    >
      <dt>{{ fact.label }}</dt>
      <dd>
        <RouterLink v-if="fact.route" :to="fact.route" :title="String(fact.value)">{{ fact.value }}</RouterLink>
        <span v-else :title="String(fact.value)">{{ fact.value }}</span>
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.document-fact-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  overflow: hidden;
  border: 1px solid #e4e7e1;
  border-radius: 8px;
  background: #e7eae4;
}

.document-fact-item {
  display: grid;
  grid-column: span var(--document-fact-span);
  align-content: center;
  gap: 5px;
  min-width: 0;
  min-height: 62px;
  padding: 11px 13px;
  background: #ffffff;
}

.document-fact-grid.is-compact .document-fact-item {
  min-height: 58px;
  padding: 10px 12px;
}

.document-fact-item dt {
  margin: 0;
  color: #7a8079;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
}

.document-fact-item dd {
  display: -webkit-box;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #272b27;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.5;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.document-fact-item.is-multiline dd,
.document-fact-item.is-full dd {
  display: block;
  overflow: visible;
  text-overflow: clip;
  white-space: pre-wrap;
  -webkit-line-clamp: unset;
}

.document-fact-item a {
  color: #315f43;
  text-decoration: none;
  text-underline-offset: 3px;
}

.document-fact-item a:hover {
  color: #234c35;
  text-decoration: underline;
}

@media (max-width: 900px) {
  .document-fact-item:not(.is-full) {
    grid-column: span 6;
  }

  .document-fact-item:not(.is-full).is-mobile-full {
    grid-column: 1 / -1;
  }
}

@media (max-width: 620px) {
  .document-fact-item,
  .document-fact-item:not(.is-full) {
    grid-column: 1 / -1;
  }
}
</style>
