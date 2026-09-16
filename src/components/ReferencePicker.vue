<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Search, X } from 'lucide-vue-next';

import { listReference } from '../services/api';
import type { ReferenceOption } from '../types/business';
import { useDialogFocus } from '../composables/useDialogFocus';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    displayValue?: string;
    type: string;
    title: string;
    placeholder: string;
    searchPlaceholder?: string;
    disabled?: boolean;
    activeOnly?: boolean;
    kind?: string;
    company?: string;
    excludeCodes?: string[];
    emptyText?: string;
    hideMeta?: boolean;
    clearable?: boolean;
    required?: boolean;
  }>(),
  {
    modelValue: '',
    displayValue: '',
    searchPlaceholder: '搜索编码、名称或联系人',
    disabled: false,
    activeOnly: true,
    kind: '',
    company: '',
    excludeCodes: () => [],
    emptyText: '没有匹配的候选项',
    hideMeta: false,
    clearable: true,
    required: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  select: [option: ReferenceOption];
  clear: [];
}>();

const open = ref(false);
const keyword = ref('');
const loading = ref(false);
const errorMessage = ref('');
const options = ref<ReferenceOption[]>([]);
const triggerButton = ref<HTMLButtonElement | null>(null);
const pickerDialog = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
let searchTimer: number | undefined;
let optionsLoadRequestId = 0;
const { focusDialog, restoreDialogFocus, handleDialogTab } = useDialogFocus(pickerDialog, searchInput);

const displayText = computed(() => String(props.displayValue || '').trim());
const modelText = computed(() => String(props.modelValue || '').trim());
const placeholderText = computed(() => String(props.placeholder || '').trim());
function isMeaningfulReferenceValue(value: string) {
  if (!value || value === placeholderText.value) return false;
  if (value === '-' || value === '系统自动生成') return false;
  return !['待选择', '待填写', '待补全', '暂无'].some((prefix) => value.startsWith(prefix));
}

const hasDisplayValue = computed(() => isMeaningfulReferenceValue(displayText.value));
const hasModelValue = computed(() => isMeaningfulReferenceValue(modelText.value));
const hasValue = computed(() => Boolean(hasModelValue.value || hasDisplayValue.value));
const triggerText = computed(() => (hasValue.value ? displayText.value || modelText.value : props.placeholder));
const optionSummary = computed(() => (loading.value ? '正在加载' : `${options.value.length} 个候选`));
const excludedCodeSet = computed(() => new Set(props.excludeCodes.map((code) => String(code || '').trim()).filter(Boolean)));
const showOptionMeta = computed(() => !props.hideMeta);
function visibleOptionMeta(option: ReferenceOption) {
  return (option.meta || []).filter((item, index, items) => (
    Boolean(item)
    && item !== option.status
    && items.indexOf(item) === index
  ));
}

async function loadOptions() {
  const requestId = ++optionsLoadRequestId;
  const referenceType = props.type;
  const query = keyword.value;
  const activeOnly = props.activeOnly;
  const kind = props.kind;
  const company = props.company;
  loading.value = true;
  errorMessage.value = '';
  options.value = [];

  try {
    const response = await listReference(referenceType, {
      q: query,
      activeOnly,
      kind,
      company,
      limit: 30,
    });
    if (requestId !== optionsLoadRequestId || !open.value) return;
    options.value = response.items.filter((option) => !excludedCodeSet.value.has(option.code));
  } catch (error) {
    if (requestId !== optionsLoadRequestId || !open.value) return;
    errorMessage.value = error instanceof Error ? error.message : '候选列表加载失败';
    options.value = [];
  } finally {
    if (requestId === optionsLoadRequestId) loading.value = false;
  }
}

function openPicker() {
  if (props.disabled) return;
  keyword.value = '';
  open.value = true;
  void loadOptions();
  focusDialog();
}

function closePicker() {
  optionsLoadRequestId += 1;
  loading.value = false;
  open.value = false;
  restoreDialogFocus();
}

function choose(option: ReferenceOption) {
  emit('update:modelValue', option.code);
  emit('select', option);
  closePicker();
}

function clearSelection() {
  const emptyOption: ReferenceOption = {
    id: '',
    code: '',
    name: '',
    primary: '',
    secondary: '',
    meta: [],
    status: '',
    raw: {
      code: '',
      name: '',
      contact: '',
      phone: '',
      address: '',
      manager: '',
      model: '',
      spec: '',
      uom: '',
      latestPrice: '',
      products: [],
      lines: [],
    },
  };

  keyword.value = '';
  emit('update:modelValue', '');
  emit('select', emptyOption);
  emit('clear');
  closePicker();
}

function focus() {
  triggerButton.value?.focus();
}

defineExpose({ focus });

watch(keyword, () => {
  if (!open.value) return;
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    void loadOptions();
  }, 180);
});

onBeforeUnmount(() => {
  window.clearTimeout(searchTimer);
  optionsLoadRequestId += 1;
});
</script>

<template>
  <div class="reference-picker">
    <div
      v-if="disabled"
      class="reference-picker-readonly"
      :class="{ 'has-value': hasValue }"
      role="textbox"
      aria-readonly="true"
      aria-disabled="true"
      :aria-label="title"
      :title="hasValue ? triggerText : title"
      :aria-required="required || undefined"
    >
      <span>{{ triggerText }}</span>
    </div>
    <button
      v-else
      ref="triggerButton"
      class="reference-picker-trigger"
      type="button"
      :aria-label="title"
      :aria-required="required || undefined"
      :title="hasValue ? triggerText : title"
      aria-haspopup="dialog"
      aria-controls="reference-picker-dialog"
      :aria-expanded="open"
      :class="{ 'has-value': hasValue }"
      @click="openPicker"
    >
      <span>{{ triggerText }}</span>
      <Search :size="15" />
    </button>

    <Teleport to="body">
      <div v-if="open" class="reference-picker-backdrop" @click.self="closePicker" @keydown.esc.stop="closePicker">
        <section
          id="reference-picker-dialog"
          ref="pickerDialog"
          class="reference-picker-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reference-picker-title"
          tabindex="-1"
          @keydown.tab="handleDialogTab"
        >
          <header class="reference-picker-head">
            <div>
              <h2 id="reference-picker-title">{{ title }}</h2>
              <span>{{ optionSummary }}</span>
            </div>
            <div class="reference-picker-head-actions">
              <button
                v-if="clearable && hasValue"
                class="secondary-action compact-action reference-picker-clear-action"
                type="button"
                :aria-label="`清空${title}`"
                :title="`清空${title}`"
                @click="clearSelection"
              >
                清空
              </button>
              <button class="icon-button" type="button" aria-label="关闭" title="关闭选择器" @click="closePicker">
                <X :size="16" />
              </button>
            </div>
          </header>

          <label class="reference-picker-search">
            <Search :size="15" />
            <input ref="searchInput" v-model="keyword" type="search" :placeholder="searchPlaceholder" :title="searchPlaceholder" />
          </label>

          <div class="reference-picker-list">
            <button
              v-for="option in options"
              :key="option.id"
              class="reference-picker-option"
              :class="{ 'has-meta': showOptionMeta && (option.status || visibleOptionMeta(option).length) }"
              type="button"
              :title="`${title}：${option.name || option.code}`"
              @click="choose(option)"
            >
              <span class="reference-picker-code">{{ option.code }}</span>
              <span class="reference-picker-main">
                <strong>{{ option.name }}</strong>
                <small>{{ option.primary }}</small>
                <small>{{ option.secondary }}</small>
              </span>
              <span v-if="showOptionMeta && (option.status || visibleOptionMeta(option).length)" class="reference-picker-meta">
                <i class="mini-status" :class="{ 'status-done': option.status === '启用' }">{{ option.status }}</i>
                <small v-for="item in visibleOptionMeta(option)" :key="item">{{ item }}</small>
              </span>
            </button>

            <div v-if="loading" class="reference-picker-empty">正在加载候选数据...</div>
            <div v-else-if="errorMessage" class="reference-picker-empty">{{ errorMessage }}</div>
            <div v-else-if="options.length === 0" class="reference-picker-empty">{{ emptyText }}</div>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>
