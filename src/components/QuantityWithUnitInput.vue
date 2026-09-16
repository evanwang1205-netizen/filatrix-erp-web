<script setup lang="ts">
import { computed, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    unit?: string;
    placeholder?: string;
    readonly?: boolean;
    disabled?: boolean;
    numericValue?: boolean;
  }>(),
  {
    modelValue: '',
    unit: '',
    placeholder: '数量',
    readonly: false,
    disabled: false,
    numericValue: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  blur: [];
}>();

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function quantityText(value: unknown) {
  return clean(value)
    .replace(/,/g, '')
    .match(/-?\d+(\.\d+)?/)?.[0] ?? '';
}

function unitFromValue(value: unknown) {
  return clean(value).replace(/[\d,.\s-]/g, '').trim();
}

const unitText = computed(() => clean(props.unit) || unitFromValue(props.modelValue));
const displayValue = computed(() => quantityText(props.modelValue));

function formatValue(value: string) {
  const qty = quantityText(value);
  if (!qty) return '';
  if (props.numericValue) return qty;
  const unit = unitText.value;
  return unit ? `${qty} ${unit}` : qty;
}

function updateValue(value: string) {
  if (props.readonly || props.disabled) return;
  emit('update:modelValue', formatValue(value));
}

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  updateValue(target.value);
}

function handleBlur() {
  if (!props.readonly && !props.disabled) {
    emit('update:modelValue', formatValue(displayValue.value));
  }
  emit('blur');
}

watch(
  () => props.unit,
  () => {
    if (!props.readonly && !props.disabled && displayValue.value) {
      emit('update:modelValue', formatValue(displayValue.value));
    }
  },
);
</script>

<template>
  <span class="quantity-with-unit-field" :class="{ readonly: readonly || disabled }">
    <input
      :value="displayValue"
      type="text"
      inputmode="decimal"
      :placeholder="placeholder"
      :readonly="readonly"
      :disabled="disabled"
      @input="handleInput"
      @blur="handleBlur"
    />
    <span class="quantity-unit-suffix">{{ unitText || '—' }}</span>
  </span>
</template>
