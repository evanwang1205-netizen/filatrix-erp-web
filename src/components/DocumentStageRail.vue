<script setup lang="ts">
import type { DocumentStageItem } from '../types/documentUi';

withDefaults(defineProps<{
  items: readonly DocumentStageItem[];
  currentIndex: number;
  ariaLabel?: string;
}>(), {
  ariaLabel: '单据流程节点',
});
</script>

<template>
  <ol class="document-stage-rail" :aria-label="ariaLabel">
    <li
      v-for="(item, index) in items"
      :key="`${item.label}-${index}`"
      :class="{
        'is-complete': index < currentIndex,
        'is-current': index === currentIndex,
      }"
      :aria-current="index === currentIndex ? 'step' : undefined"
    >
      <i aria-hidden="true">{{ index + 1 }}</i>
      <span>
        <strong>{{ item.label }}</strong>
        <small v-if="item.description">{{ item.description }}</small>
      </span>
    </li>
  </ol>
</template>

<style scoped>
.document-stage-rail {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.document-stage-rail li {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 7px 0;
  border-top: 1px solid #eceee9;
}

.document-stage-rail li:first-child {
  border-top: 0;
}

.document-stage-rail i {
  display: inline-grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 1px solid #dfe2dc;
  border-radius: 50%;
  color: #7a8079;
  background: #f4f5f1;
  font-size: 10px;
  font-style: normal;
  font-weight: 750;
  line-height: 1;
}

.document-stage-rail span {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.document-stage-rail strong {
  color: #4b504b;
  font-size: 12px;
  font-weight: 680;
  line-height: 1.4;
}

.document-stage-rail small {
  display: none;
  color: #747b75;
  font-size: 11px;
  line-height: 1.45;
}

.document-stage-rail li.is-complete i {
  border-color: #ccd9ce;
  color: #43624b;
  background: #eef4ef;
}

.document-stage-rail li.is-current i {
  border-color: #55755d;
  color: #ffffff;
  background: #55755d;
}

.document-stage-rail li.is-current strong {
  color: #284a34;
  font-weight: 760;
}

.document-stage-rail li.is-current small {
  display: block;
}
</style>
