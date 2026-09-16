<script setup lang="ts">
type FilterFieldKey = 'status' | 'party' | 'owner';
type FilterOption = string | { value: string; label: string };

type FilterField = {
  key: FilterFieldKey;
  label: string;
  options: FilterOption[];
  control?: 'select' | 'search';
};

const statusFilterSeparator = '|';

defineProps<{
  fields: FilterField[];
  dateLabel?: string;
  status: string;
  party: string;
  owner: string;
  dateStart: string;
  dateEnd: string;
}>();

const emit = defineEmits<{
  'update:status': [value: string];
  'update:party': [value: string];
  'update:owner': [value: string];
  'update:dateStart': [value: string];
  'update:dateEnd': [value: string];
  clear: [];
  apply: [];
}>();

function fieldValue(key: FilterFieldKey, values: { status: string; party: string; owner: string }) {
  return values[key];
}

function updateField(key: FilterFieldKey, event: Event) {
  const value =
    event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
      ? event.target.value
      : '';

  if (key === 'status') {
    emit('update:status', value);
  } else if (key === 'party') {
    emit('update:party', value);
  } else {
    emit('update:owner', value);
  }
}

function updateDateStart(event: Event) {
  emit('update:dateStart', event.target instanceof HTMLInputElement ? event.target.value : '');
}

function updateDateEnd(event: Event) {
  emit('update:dateEnd', event.target instanceof HTMLInputElement ? event.target.value : '');
}

function statusValues(value: string) {
  return value.split(statusFilterSeparator).filter(Boolean);
}

function optionValue(option: FilterOption) {
  return typeof option === 'string' ? option : option.value;
}

function optionLabel(option: FilterOption) {
  return typeof option === 'string' ? option : option.label;
}

function toggleStatus(option: FilterOption, checked: boolean, currentValue: string) {
  const value = optionValue(option);
  const next = new Set(statusValues(currentValue));

  if (checked) {
    next.add(value);
  } else {
    next.delete(value);
  }

  emit('update:status', Array.from(next).join(statusFilterSeparator));
}

function isStatusChecked(option: FilterOption, currentValue: string) {
  return statusValues(currentValue).includes(optionValue(option));
}

function updateStatusOption(option: FilterOption, event: Event, currentValue: string) {
  toggleStatus(option, event.target instanceof HTMLInputElement ? event.target.checked : false, currentValue);
}
</script>

<template>
  <span
    id="business-list-filter-popover"
    class="toolbar-popover filter-popover sales-filter-popover"
    role="dialog"
    aria-modal="false"
    aria-labelledby="business-list-filter-title"
  >
    <strong id="business-list-filter-title">筛选条件</strong>

    <template v-for="field in fields" :key="field.key">
      <fieldset v-if="field.key === 'status'" class="filter-field filter-status-field">
        <legend>{{ field.label }}</legend>
        <div class="filter-check-grid">
          <label
            v-for="option in field.options"
            :key="optionValue(option)"
            class="filter-check-option"
            :title="`${isStatusChecked(option, status) ? '取消' : '选择'}${field.label}：${optionLabel(option)}`"
          >
            <input
              type="checkbox"
              :checked="isStatusChecked(option, status)"
              :title="`${isStatusChecked(option, status) ? '取消' : '选择'}${field.label}：${optionLabel(option)}`"
              @change="updateStatusOption(option, $event, status)"
            />
            <span>{{ optionLabel(option) }}</span>
          </label>
        </div>
      </fieldset>

      <label v-else-if="field.control === 'search'" class="filter-field">
        <span>{{ field.label }}</span>
        <input
          :value="fieldValue(field.key, { status, party, owner })"
          type="search"
          :placeholder="`输入${field.label}关键词`"
          :title="`筛选${field.label}`"
          autocomplete="off"
          spellcheck="false"
          @input="updateField(field.key, $event)"
        />
      </label>

      <label v-else-if="field.options.length" class="filter-field">
        <span>{{ field.label }}</span>
        <select
          :value="fieldValue(field.key, { status, party, owner })"
          :title="`筛选${field.label}`"
          @change="updateField(field.key, $event)"
        >
          <option value="">全部{{ field.label }}</option>
          <option v-for="option in field.options" :key="optionValue(option)" :value="optionValue(option)">
            {{ optionLabel(option) }}
          </option>
        </select>
      </label>
    </template>

    <div v-if="dateLabel" class="filter-range">
      <label class="filter-field">
        <span>{{ dateLabel }}起</span>
        <input :value="dateStart" type="date" :title="`选择${dateLabel}起始日期`" @input="updateDateStart" />
      </label>
      <label class="filter-field">
        <span>{{ dateLabel }}止</span>
        <input :value="dateEnd" type="date" :title="`选择${dateLabel}结束日期`" @input="updateDateEnd" />
      </label>
    </div>

    <div class="popover-actions">
      <button class="popover-clear" type="button" title="清空当前筛选条件" @click="emit('clear')">清空</button>
      <button class="popover-primary" type="button" title="应用当前筛选条件" @click="emit('apply')">应用</button>
    </div>
  </span>
</template>
