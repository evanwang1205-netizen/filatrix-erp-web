<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { AlertTriangle, X } from 'lucide-vue-next';

export type ExceptionActionOption = {
  key: string;
  label: string;
  status: string;
  description: string;
  reasonPlaceholder?: string;
};

const props = defineProps<{
  open: boolean;
  title: string;
  recordCode: string;
  actionOptions: ExceptionActionOption[];
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { option: ExceptionActionOption; reason: string }];
}>();

const selectedKey = ref('');
const reason = ref('');
const errorText = ref('');

const selectedOption = computed(() => props.actionOptions.find((option) => option.key === selectedKey.value));

watch(
  () => [props.open, props.actionOptions],
  () => {
    if (!props.open) return;
    selectedKey.value = props.actionOptions[0]?.key ?? '';
    reason.value = '';
    errorText.value = '';
  },
  { immediate: true },
);

function submitExceptionAction() {
  if (props.busy) return;
  if (!selectedOption.value) {
    errorText.value = '请选择异常动作';
    return;
  }

  const cleanReason = reason.value.trim();
  if (!cleanReason) {
    errorText.value = '请填写处理原因';
    return;
  }

  emit('submit', { option: selectedOption.value, reason: cleanReason });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="exception-action-backdrop" @click.self="!busy && emit('close')" @keydown.esc.stop="!busy && emit('close')">
      <section class="exception-action-dialog" role="dialog" aria-modal="true" aria-labelledby="exception-action-title">
        <header class="exception-action-head">
          <div>
            <AlertTriangle :size="18" />
            <h2 id="exception-action-title">{{ title }}</h2>
          </div>
          <button type="button" aria-label="关闭异常处理" title="关闭异常处理" :disabled="busy" @click="emit('close')">
            <X :size="17" />
          </button>
        </header>

        <div class="exception-action-body">
          <div class="exception-record-line">
            <span>单据</span>
            <strong>{{ recordCode }}</strong>
          </div>

          <label class="exception-field">
            <span>异常动作</span>
            <select v-model="selectedKey" title="选择异常处理动作" :disabled="busy">
              <option v-for="option in actionOptions" :key="option.key" :value="option.key">
                {{ option.label }}
              </option>
            </select>
          </label>

          <p v-if="selectedOption" class="exception-action-description">
            {{ selectedOption.description }}
          </p>

          <label class="exception-field">
            <span>处理原因</span>
            <textarea
              v-model="reason"
              rows="4"
              :placeholder="selectedOption?.reasonPlaceholder ?? '填写处理原因，提交后会写入处理记录。'"
              title="填写异常处理原因"
              :disabled="busy"
            ></textarea>
          </label>

          <p v-if="errorText" class="exception-action-error" role="alert">{{ errorText }}</p>
        </div>

        <footer class="exception-action-footer">
          <button class="secondary-action" type="button" title="取消异常处理" :disabled="busy" @click="emit('close')">取消</button>
          <button class="primary-action" type="button" title="提交异常处理并写入处理记录" :disabled="busy" @click="submitExceptionAction">
            {{ busy ? '提交中…' : '提交处理' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
