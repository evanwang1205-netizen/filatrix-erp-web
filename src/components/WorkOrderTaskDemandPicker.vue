<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { Search, X } from 'lucide-vue-next';

import { useDialogFocus } from '../composables/useDialogFocus';

type TaskDemandOption = {
  key: string;
  taskCode: string;
  source: string;
  productName: string;
  productCode: string;
  available: string;
  dueDate: string;
  recipeReady: boolean;
};

const props = withDefaults(defineProps<{
  options: TaskDemandOption[];
  disabled?: boolean;
  buttonLabel?: string;
  primary?: boolean;
}>(), {
  disabled: false,
  buttonLabel: '选择任务需求',
  primary: false,
});

const emit = defineEmits<{
  select: [key: string];
}>();

const open = ref(false);
const keyword = ref('');
const dialog = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const triggerButton = ref<HTMLButtonElement | null>(null);
const { focusDialog, restoreDialogFocus, handleDialogTab } = useDialogFocus(dialog, searchInput);

const selectableCount = computed(() => props.options.filter((option) => option.recipeReady).length);
const blockedCount = computed(() => props.options.length - selectableCount.value);
const filteredOptions = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase();
  if (!query) return props.options;
  return props.options.filter((option) => [
    option.taskCode,
    option.source,
    option.productName,
    option.productCode,
    option.available,
    option.dueDate,
  ].some((value) => value.toLocaleLowerCase().includes(query)));
});

function openPicker() {
  if (props.disabled) return;
  keyword.value = '';
  open.value = true;
  void nextTick(() => focusDialog());
}

function closePicker() {
  open.value = false;
  restoreDialogFocus();
}

function choose(option: TaskDemandOption) {
  if (!option.recipeReady) return;
  emit('select', option.key);
  closePicker();
}

onBeforeUnmount(() => {
  open.value = false;
});
</script>

<template>
  <button
    ref="triggerButton"
    class="work-order-demand-picker-trigger"
    :class="primary ? 'primary-action' : 'secondary-action'"
    type="button"
    :disabled="disabled"
    aria-haspopup="dialog"
    :aria-expanded="open"
    @click="openPicker"
  >
    <Search :size="15" />
    {{ buttonLabel }}
  </button>

  <Teleport to="body">
    <div v-if="open" class="work-order-demand-picker-backdrop" @click.self="closePicker" @keydown.esc.stop="closePicker">
      <section
        ref="dialog"
        class="work-order-demand-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-order-demand-picker-title"
        tabindex="-1"
        @keydown.tab="handleDialogTab"
      >
        <header class="work-order-demand-picker-head">
          <div>
            <h2 id="work-order-demand-picker-title">选择任务需求</h2>
            <span>
              {{ selectableCount }} 条可选<span v-if="blockedCount"> · {{ blockedCount }} 条缺少启用配方</span>
              <RouterLink v-if="blockedCount" class="work-order-demand-picker-maintain" to="/production/recipes">维护配方</RouterLink>
            </span>
          </div>
          <button class="icon-button" type="button" aria-label="关闭" title="关闭选择窗口" @click="closePicker">
            <X :size="16" />
          </button>
        </header>

        <label class="work-order-demand-picker-search">
          <Search :size="15" />
          <input ref="searchInput" v-model="keyword" type="search" placeholder="搜索任务号、来源、成品或日期" />
        </label>

        <div class="work-order-demand-picker-list">
          <div class="work-order-demand-picker-row is-head" aria-hidden="true">
            <span>生产任务 / 来源</span>
            <span>成品</span>
            <span>待分配</span>
            <span>要求日期</span>
          </div>
          <button
            v-for="option in filteredOptions"
            :key="option.key"
            class="work-order-demand-picker-row"
            :class="{ 'is-blocked': !option.recipeReady }"
            type="button"
            :disabled="!option.recipeReady"
            :title="option.recipeReady ? `选择 ${option.taskCode}` : `${option.taskCode} 缺少适用的启用配方`"
            @click="choose(option)"
          >
            <span class="work-order-demand-picker-source">
              <strong>{{ option.taskCode }}</strong>
              <small>{{ option.source }}</small>
            </span>
            <span class="work-order-demand-picker-product">
              <strong>{{ option.productName }}</strong>
              <small>{{ option.productCode }}</small>
            </span>
            <span><strong>{{ option.available }}</strong></span>
            <span class="work-order-demand-picker-date">
              <strong>{{ option.dueDate }}</strong>
              <small v-if="!option.recipeReady">缺少启用配方</small>
            </span>
          </button>
          <div v-if="!filteredOptions.length" class="work-order-demand-picker-empty">没有匹配的任务需求</div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.work-order-demand-picker-trigger {
  white-space: nowrap;
}

.work-order-demand-picker-backdrop {
  position: fixed;
  z-index: 1800;
  inset: 0;
  display: grid;
  padding: 36px;
  place-items: center;
  background: rgb(25 27 24 / 42%);
}

.work-order-demand-picker-dialog {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  width: min(920px, 100%);
  max-height: min(720px, calc(100vh - 72px));
  overflow: hidden;
  border: 1px solid #d9ddd5;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 22px 60px rgb(20 24 20 / 18%);
}

.work-order-demand-picker-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid #e5e7e1;
}

.work-order-demand-picker-head > div {
  display: grid;
  gap: 4px;
}

.work-order-demand-picker-head h2 {
  margin: 0;
  color: var(--text, #2f312d);
  font-size: 17px;
}

.work-order-demand-picker-head span {
  color: var(--text-muted, #70736e);
  font-size: 12px;
}

.work-order-demand-picker-maintain {
  margin-left: 8px;
  color: #315f43;
  font-weight: 700;
  text-underline-offset: 3px;
}

.work-order-demand-picker-search {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin: 14px 20px;
  padding: 0 12px;
  border: 1px solid #d9ddd5;
  border-radius: 8px;
  background: #fafbf8;
}

.work-order-demand-picker-search input {
  min-width: 0;
  height: 38px;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
}

.work-order-demand-picker-list {
  overflow-y: auto;
  padding: 0 20px 20px;
}

.work-order-demand-picker-row {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(150px, .85fr) minmax(250px, 1.35fr) 110px 112px;
  gap: 12px;
  align-items: center;
  min-height: 62px;
  padding: 10px 12px;
  border: 1px solid #e3e5df;
  border-top: 0;
  background: #fff;
  color: inherit;
  text-align: left;
}

.work-order-demand-picker-row.is-head {
  min-height: 36px;
  border-top: 1px solid #e3e5df;
  border-radius: 8px 8px 0 0;
  background: #f2f3ee;
  color: var(--text-muted, #70736e);
  font-size: 11px;
  font-weight: 700;
}

.work-order-demand-picker-row:not(.is-head):last-of-type {
  border-radius: 0 0 8px 8px;
}

.work-order-demand-picker-row:not(.is-head):not(:disabled):hover,
.work-order-demand-picker-row:not(.is-head):not(:disabled):focus-visible {
  position: relative;
  z-index: 1;
  border-color: #87a78e;
  outline: 0;
  background: #f3f8f3;
}

.work-order-demand-picker-row.is-blocked {
  color: #8a8d87;
  cursor: not-allowed;
  background: #fafaf8;
}

.work-order-demand-picker-row > span,
.work-order-demand-picker-source,
.work-order-demand-picker-product,
.work-order-demand-picker-date {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.work-order-demand-picker-row strong,
.work-order-demand-picker-row small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-order-demand-picker-row strong {
  font-size: 12px;
  font-weight: 800;
}

.work-order-demand-picker-row small {
  color: var(--text-muted, #70736e);
  font-size: 11px;
}

.work-order-demand-picker-date small {
  color: #a05449;
}

.work-order-demand-picker-empty {
  display: grid;
  min-height: 110px;
  place-items: center;
  border: 1px solid #e3e5df;
  border-top: 0;
  border-radius: 0 0 8px 8px;
  color: var(--text-muted, #70736e);
  font-size: 12px;
}

@media (max-width: 720px) {
  .work-order-demand-picker-backdrop {
    padding: 12px;
  }

  .work-order-demand-picker-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .work-order-demand-picker-row > span:nth-child(2) {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .work-order-demand-picker-row > span:nth-child(3) {
    grid-column: 2;
    grid-row: 1;
  }

  .work-order-demand-picker-row > span:nth-child(4) {
    grid-column: 2;
    grid-row: 2;
  }

  .work-order-demand-picker-row.is-head {
    display: none;
  }

  .work-order-demand-picker-row:not(.is-head) {
    border-top: 1px solid #e3e5df;
    border-radius: 8px;
    margin-top: 8px;
  }
}
</style>
