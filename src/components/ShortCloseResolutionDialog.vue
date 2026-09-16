<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CalendarPlus2, CircleCheckBig, X } from 'lucide-vue-next';

const props = defineProps<{
  open: boolean;
  cardCode: string;
  productName: string;
  remainingQty: number;
  unit: string;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { action: '安排补产' | '接受短缺'; reason: string }];
}>();

const action = ref<'安排补产' | '接受短缺'>('安排补产');
const reason = ref('');
const errorText = ref('');
const remainingText = computed(() => `${Number(props.remainingQty || 0).toLocaleString('zh-CN')} ${props.unit || ''}`.trim());

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    action.value = '安排补产';
    reason.value = '';
    errorText.value = '';
  },
  { immediate: true },
);

function closeDialog() {
  if (!props.busy) emit('close');
}

function submitResolution() {
  const cleanReason = reason.value.trim();
  if (cleanReason.length < 4) {
    errorText.value = '请填写至少 4 个字的处理原因';
    return;
  }
  emit('submit', { action: action.value, reason: cleanReason });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="short-close-backdrop" @click.self="closeDialog" @keydown.esc.stop="closeDialog">
      <section class="short-close-dialog" role="dialog" aria-modal="true" aria-labelledby="short-close-title">
        <header class="short-close-head">
          <div>
            <span class="short-close-icon"><CalendarPlus2 :size="18" /></span>
            <div>
              <small>生产批次 {{ cardCode }}</small>
              <h2 id="short-close-title">处理剩余计划</h2>
            </div>
          </div>
          <button type="button" aria-label="关闭" :disabled="busy" @click="closeDialog"><X :size="17" /></button>
        </header>

        <div class="short-close-body">
          <dl class="short-close-target">
            <div><dt>成品</dt><dd>{{ productName || '-' }}</dd></div>
            <div><dt>剩余计划</dt><dd>{{ remainingText }}</dd></div>
          </dl>

          <div class="short-close-options" role="radiogroup" aria-label="剩余计划处理方式">
            <label :class="{ selected: action === '安排补产' }">
              <input v-model="action" type="radio" value="安排补产" :disabled="busy" />
              <span class="option-icon"><CalendarPlus2 :size="17" /></span>
              <span><strong>安排补产</strong><small>保留原计划，当前报工质检结束后生成补充设备作业。</small></span>
            </label>
            <label :class="{ selected: action === '接受短缺' }">
              <input v-model="action" type="radio" value="接受短缺" :disabled="busy" />
              <span class="option-icon"><CircleCheckBig :size="17" /></span>
              <span><strong>接受短缺</strong><small>不再补产，实际合格数量继续包装和入库，剩余作为计划差异保留。</small></span>
            </label>
          </div>

          <label class="short-close-field">
            <span>处理原因</span>
            <textarea v-model="reason" rows="3" :disabled="busy" placeholder="说明补产安排或接受短缺的业务原因"></textarea>
          </label>
          <p v-if="errorText" class="short-close-error" role="alert">{{ errorText }}</p>
        </div>

        <footer class="short-close-footer">
          <button class="secondary-action" type="button" :disabled="busy" @click="closeDialog">取消</button>
          <button class="primary-action" type="button" :disabled="busy" @click="submitResolution">
            {{ busy ? '提交中…' : '确认处理' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.short-close-backdrop { position: fixed; inset: 0; z-index: 1300; display: grid; place-items: center; padding: 20px; background: rgba(19, 24, 20, .42); backdrop-filter: blur(3px); }
.short-close-dialog { width: min(540px, 100%); overflow: hidden; border: 1px solid rgba(31, 44, 35, .14); border-radius: 16px; background: #fff; box-shadow: 0 24px 70px rgba(21, 29, 23, .2); }
.short-close-head, .short-close-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; }
.short-close-head { border-bottom: 1px solid #e9ede9; }
.short-close-head > div { display: flex; align-items: center; gap: 12px; }
.short-close-head small { display: block; margin-bottom: 2px; color: #7a837c; font-size: 12px; }
.short-close-head h2 { margin: 0; color: #182019; font-size: 18px; line-height: 1.25; }
.short-close-head > button { display: grid; width: 32px; height: 32px; place-items: center; border: 0; border-radius: 9px; color: #657067; background: transparent; cursor: pointer; }
.short-close-head > button:hover { background: #f2f5f2; }
.short-close-icon { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 11px; color: #6b5321; background: #f5edd9; }
.short-close-body { display: grid; gap: 18px; padding: 20px; }
.short-close-target { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; margin: 0; overflow: hidden; border: 1px solid #e3e8e3; border-radius: 11px; background: #e3e8e3; }
.short-close-target div { min-width: 0; padding: 12px 14px; background: #f8faf8; }
.short-close-target dt { margin-bottom: 4px; color: #7a837c; font-size: 12px; }
.short-close-target dd { margin: 0; overflow: hidden; color: #273029; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.short-close-options { display: grid; gap: 9px; }
.short-close-options label { display: grid; grid-template-columns: auto 34px 1fr; align-items: center; gap: 10px; padding: 12px; border: 1px solid #dde3de; border-radius: 11px; color: #4b554d; background: #fff; cursor: pointer; transition: border-color .16s ease, background .16s ease, box-shadow .16s ease; }
.short-close-options label:hover { border-color: #b7c5b9; }
.short-close-options label.selected { border-color: #839d88; background: #f5f9f5; box-shadow: 0 0 0 3px rgba(83, 122, 91, .08); }
.short-close-options input { margin: 0; accent-color: #436a4b; }
.short-close-options .option-icon { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 9px; color: #45674c; background: #e9f1ea; }
.short-close-options strong, .short-close-options small { display: block; }
.short-close-options strong { color: #273029; font-size: 14px; }
.short-close-options small { margin-top: 3px; color: #758078; font-size: 12px; line-height: 1.5; }
.short-close-field { display: grid; gap: 8px; color: #465049; font-size: 13px; font-weight: 600; }
.short-close-field textarea { resize: vertical; min-height: 82px; padding: 10px 12px; border: 1px solid #d8ded9; border-radius: 9px; outline: 0; color: #1e2720; font: inherit; font-weight: 400; background: #fff; }
.short-close-field textarea:focus { border-color: #79967e; box-shadow: 0 0 0 3px rgba(88, 126, 96, .12); }
.short-close-error { margin: -8px 0 0; color: #b73a32; font-size: 12px; }
.short-close-footer { justify-content: flex-end; border-top: 1px solid #e9ede9; background: #fbfcfb; }
.short-close-footer button { min-width: 92px; }
@media (max-width: 560px) { .short-close-backdrop { align-items: end; padding: 0; } .short-close-dialog { width: 100%; border-radius: 16px 16px 0 0; } .short-close-target { grid-template-columns: 1fr; } }
</style>
