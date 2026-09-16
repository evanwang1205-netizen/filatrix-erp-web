<script setup lang="ts">
import { computed } from 'vue';

import { statusPresentationClass } from '../utils/statusPresentation';

type ListStatusFact = {
  label: string;
  value: string;
};

type ListStatusProgress = {
  label: string;
  current: number;
  total: number;
  unit?: string;
};

const props = withDefaults(defineProps<{
  status: string;
  attention?: string;
  facts?: ListStatusFact[];
  nextStep?: string;
  nextStepLabel?: string;
  progress?: ListStatusProgress;
}>(), {
  attention: '',
  facts: () => [],
  nextStep: '',
  nextStepLabel: '下一步',
  progress: undefined,
});

const progressPercent = computed(() => {
  const total = Number(props.progress?.total || 0);
  const current = Number(props.progress?.current || 0);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(current)) return 0;
  return Math.max(0, Math.min(100, (current / total) * 100));
});

const progressText = computed(() => {
  if (!props.progress) return '';
  const unit = props.progress.unit || '';
  return `${props.progress.current}/${props.progress.total}${unit}`;
});

function compactAttentionClass(value: string) {
  if (!value || ['正常', '无待办', '已归档', '查看结果', '查看库存流水'].includes(value)) {
    return 'status-neutral';
  }
  return statusPresentationClass(value);
}
</script>

<template>
  <span class="list-status-overview">
    <span class="list-status-overview-head">
      <i class="mini-status" :class="statusPresentationClass(status)">{{ status }}</i>
      <small
        v-if="attention"
        class="list-status-attention"
        :class="compactAttentionClass(attention)"
        :title="attention"
      >
        {{ attention }}
      </small>
    </span>

    <span
      v-if="progress"
      class="list-status-progress"
      role="progressbar"
      :aria-label="`${progress.label} ${progressText}`"
      :aria-valuemin="0"
      :aria-valuemax="progress.total"
      :aria-valuenow="progress.current"
    >
      <span class="list-status-progress-copy">
        <b>{{ progress.label }}</b>
        <i>{{ progressText }}</i>
      </span>
      <span class="list-status-progress-track" aria-hidden="true">
        <i :style="{ width: `${progressPercent}%` }" />
      </span>
    </span>

    <span
      v-if="facts.length"
      class="list-status-facts"
      :class="`has-${Math.min(facts.length, 4)}-facts`"
    >
      <span v-for="fact in facts" :key="`${fact.label}-${fact.value}`" :title="`${fact.label}：${fact.value}`">
        <b>{{ fact.label }}</b>
        <i :class="statusPresentationClass(fact.value)">{{ fact.value }}</i>
      </span>
    </span>

    <small v-if="nextStep" class="list-status-next" :title="`${nextStepLabel}：${nextStep}`">
      <b>{{ nextStepLabel }}</b>
      <span>{{ nextStep }}</span>
    </small>
  </span>
</template>

<style scoped>
.list-status-overview {
  display: grid;
  align-content: center;
  width: 100%;
  min-width: 0;
  gap: 4px;
  color: #2f312d;
}

.list-status-overview-head {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.list-status-attention {
  overflow: hidden;
  min-width: 0;
  padding: 2px 5px;
  border-radius: 5px;
  font-size: 10px;
  font-style: normal;
  font-weight: 680;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-status-attention.status-neutral {
  color: #696a63;
  background: #f0f0ea;
}

.list-status-attention.status-warning,
.list-status-attention.status-pending {
  color: #785222;
  background: #f4ecdf;
}

.list-status-attention.status-danger,
.list-status-attention.status-alert {
  color: #7e332d;
  background: #f4e6e3;
}

.list-status-attention.status-info,
.list-status-attention.status-confirmed,
.list-status-attention.status-sent {
  color: #315b73;
  background: #e4eef3;
}

.list-status-attention.status-success,
.list-status-attention.status-done {
  color: #3f5042;
  background: #e7efe7;
}

.list-status-progress {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.list-status-progress-copy {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  min-width: 0;
  gap: 6px;
}

.list-status-progress-copy b,
.list-status-next b,
.list-status-facts b {
  color: #7b7c74;
  font-size: 9px;
  font-weight: 650;
  line-height: 1.2;
}

.list-status-progress-copy i {
  overflow: hidden;
  color: #42453f;
  font-size: 10px;
  font-style: normal;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-status-progress-track {
  display: block;
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: #e5e7e0;
}

.list-status-progress-track > i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #6f8f72;
  transition: width 160ms ease;
}

.list-status-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-width: 0;
  gap: 0;
}

.list-status-facts.has-3-facts {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.list-status-facts.has-4-facts {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.list-status-facts > span {
  display: grid;
  min-width: 0;
  gap: 1px;
  padding: 0 5px;
  border-left: 1px solid #ecece5;
}

.list-status-facts > span:first-child {
  padding-left: 0;
  border-left: 0;
}

.list-status-facts > span:last-child {
  padding-right: 0;
}

.list-status-facts i {
  overflow: hidden;
  color: #343733;
  font-size: 10px;
  font-style: normal;
  font-weight: 720;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-status-facts i.status-warning,
.list-status-facts i.status-pending {
  color: #785222;
}

.list-status-facts i.status-danger,
.list-status-facts i.status-alert {
  color: #7e332d;
}

.list-status-facts i.status-info,
.list-status-facts i.status-confirmed,
.list-status-facts i.status-sent {
  color: #315b73;
}

.list-status-facts i.status-success,
.list-status-facts i.status-done {
  color: #3f6746;
}

.list-status-next {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  min-width: 0;
  gap: 5px;
  padding-top: 3px;
  border-top: 1px solid #ecece5;
}

.list-status-next span {
  overflow: hidden;
  min-width: 0;
  color: #3a3d37;
  font-size: 10px;
  font-weight: 680;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
