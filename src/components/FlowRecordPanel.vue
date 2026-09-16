<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowRight, Clock3, Search, X } from 'lucide-vue-next';

import { useDialogFocus } from '../composables/useDialogFocus';

type FlowRecord = {
  time: string;
  actor: string;
  action: string;
  remark: string;
  route?: string;
};

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  records: FlowRecord[];
  searchPlaceholder?: string;
  emptyText?: string;
  filteredEmptyText?: string;
}>(), {
  searchPlaceholder: '搜索操作人、时间、动作、内容',
  emptyText: '暂无日志',
  filteredEmptyText: '没有匹配的日志',
});

const emit = defineEmits<{
  close: [];
}>();

const searchKeyword = ref('');
const dialogPanel = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const { focusDialog, restoreDialogFocus, handleDialogTab } = useDialogFocus(dialogPanel, searchInput);

watch(
  () => props.title,
  () => {
    searchKeyword.value = '';
  },
);

watch(
  () => props.open,
  (open) => {
    if (open) {
      focusDialog();
      return;
    }

    searchKeyword.value = '';
    restoreDialogFocus();
  },
);

const filteredRecords = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  if (!keyword) return props.records;

  return props.records.filter((record) =>
    [record.time, record.actor, record.action, record.remark].some((value) => value.toLowerCase().includes(keyword)),
  );
});

const resultSummary = computed(() => {
  if (!searchKeyword.value.trim()) return `共 ${props.records.length} 条`;
  return `显示 ${filteredRecords.value.length} / ${props.records.length} 条`;
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="flow-record-backdrop" @click.self="emit('close')" @keydown.esc.stop="emit('close')">
      <aside
        ref="dialogPanel"
        class="flow-record-panel"
        aria-labelledby="flow-record-panel-title"
        aria-modal="true"
        role="dialog"
        tabindex="-1"
        @keydown.tab="handleDialogTab"
      >
        <header class="flow-record-head">
          <div>
            <Clock3 :size="17" />
            <h2 id="flow-record-panel-title">{{ title }}</h2>
          </div>
          <button type="button" :aria-label="`关闭${title}`" :title="`关闭${title}`" @click="emit('close')">
            <X :size="17" />
          </button>
        </header>

        <div class="flow-record-tools">
          <label class="flow-record-search">
            <Search :size="15" />
            <input
              ref="searchInput"
              v-model="searchKeyword"
              type="search"
              :aria-label="`搜索${title}`"
              :placeholder="searchPlaceholder"
            />
          </label>
          <small>{{ resultSummary }}</small>
        </div>

        <div class="flow-record-list">
          <component
            :is="record.route ? RouterLink : 'article'"
            v-for="record in filteredRecords"
            :key="`${record.time}-${record.action}-${record.actor}`"
            :to="record.route || undefined"
            class="flow-record-item"
            :class="{ 'is-link': Boolean(record.route) }"
            @click="record.route && emit('close')"
          >
            <span class="flow-record-dot"></span>
            <div>
              <strong>{{ record.action }}</strong>
              <p>{{ record.remark }}</p>
              <small>{{ record.time }} · {{ record.actor }}</small>
            </div>
            <ArrowRight v-if="record.route" :size="15" />
          </component>

          <div v-if="!filteredRecords.length" class="flow-record-empty">
            {{ records.length ? filteredEmptyText : emptyText }}
          </div>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
