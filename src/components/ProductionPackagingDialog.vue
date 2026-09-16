<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { PackageCheck, X } from 'lucide-vue-next';

const props = defineProps<{
  open: boolean;
  cardCode: string;
  productName: string;
  quantity: number;
  unit: string;
  defaultPackageRef: string;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { packageRef: string; quantity: number }];
}>();

const packageRef = ref('');
const packageQuantity = ref('');
const errorText = ref('');
const quantityText = computed(() => `${Number(props.quantity || 0).toLocaleString('zh-CN')} ${props.unit || ''}`.trim());

watch(
  () => [props.open, props.defaultPackageRef],
  () => {
    if (!props.open) return;
    packageRef.value = props.defaultPackageRef;
    packageQuantity.value = String(Number(props.quantity || 0));
    errorText.value = '';
  },
  { immediate: true },
);

function closeDialog() {
  if (!props.busy) emit('close');
}

function submitPackaging() {
  const cleanPackageRef = packageRef.value.trim();
  const quantity = Number(packageQuantity.value);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(props.quantity || 0) + 0.0001) {
    errorText.value = `本次包装数量必须大于 0，且不能超过 ${quantityText.value}`;
    return;
  }
  if (!cleanPackageRef) {
    errorText.value = '请填写箱号或托盘号';
    return;
  }
  emit('submit', { packageRef: cleanPackageRef, quantity });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="packaging-dialog-backdrop" @click.self="closeDialog" @keydown.esc.stop="closeDialog">
      <section class="packaging-dialog" role="dialog" aria-modal="true" aria-labelledby="packaging-dialog-title">
        <header class="packaging-dialog-head">
          <div>
            <span class="packaging-dialog-icon"><PackageCheck :size="18" /></span>
            <div>
              <small>生产批次 {{ cardCode }}</small>
              <h2 id="packaging-dialog-title">确认包装</h2>
            </div>
          </div>
          <button type="button" aria-label="关闭包装确认" title="关闭包装确认" :disabled="busy" @click="closeDialog">
            <X :size="17" />
          </button>
        </header>

        <div class="packaging-dialog-body">
          <dl class="packaging-target-card">
            <div><dt>成品</dt><dd>{{ productName || '-' }}</dd></div>
            <div><dt>待包装</dt><dd>{{ quantityText }}</dd></div>
          </dl>

          <label class="packaging-dialog-field">
            <span>本次包装数量</span>
            <span class="packaging-quantity-input">
              <input v-model="packageQuantity" type="number" min="0" :max="quantity" step="any" inputmode="decimal" :disabled="busy" @keyup.enter="submitPackaging" />
              <em>{{ unit }}</em>
            </span>
          </label>
          <label class="packaging-dialog-field">
            <span>箱号或托盘号</span>
            <input v-model="packageRef" type="text" autocomplete="off" placeholder="例如：EC2-260701-002-PKG-01" :disabled="busy" @keyup.enter="submitPackaging" />
          </label>
          <p v-if="errorText" class="packaging-dialog-error" role="alert">{{ errorText }}</p>
        </div>

        <footer class="packaging-dialog-footer">
          <button class="secondary-action" type="button" :disabled="busy" @click="closeDialog">取消</button>
          <button class="primary-action" type="button" :disabled="busy" @click="submitPackaging">
            {{ busy ? '提交中…' : '确认包装' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.packaging-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(19, 24, 20, 0.42);
  backdrop-filter: blur(3px);
}

.packaging-dialog {
  width: min(460px, 100%);
  overflow: hidden;
  border: 1px solid rgba(31, 44, 35, 0.14);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(21, 29, 23, 0.2);
}

.packaging-dialog-head,
.packaging-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
}

.packaging-dialog-head { border-bottom: 1px solid #e9ede9; }
.packaging-dialog-head > div { display: flex; align-items: center; gap: 12px; }
.packaging-dialog-head small { display: block; margin-bottom: 2px; color: #7a837c; font-size: 12px; }
.packaging-dialog-head h2 { margin: 0; color: #182019; font-size: 18px; line-height: 1.25; }
.packaging-dialog-head > button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 0;
  border-radius: 9px;
  color: #657067;
  background: transparent;
  cursor: pointer;
}
.packaging-dialog-head > button:hover { background: #f2f5f2; }
.packaging-dialog-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 11px;
  color: #315f3a;
  background: #e9f3ea;
}

.packaging-dialog-body { display: grid; gap: 18px; padding: 20px; }
.packaging-target-card {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  margin: 0;
  overflow: hidden;
  border: 1px solid #e3e8e3;
  border-radius: 11px;
  background: #e3e8e3;
}
.packaging-target-card div { min-width: 0; padding: 12px 14px; background: #f8faf8; }
.packaging-target-card dt { margin-bottom: 4px; color: #7a837c; font-size: 12px; }
.packaging-target-card dd { margin: 0; overflow: hidden; color: #273029; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.packaging-dialog-field { display: grid; gap: 8px; color: #465049; font-size: 13px; font-weight: 600; }
.packaging-dialog-field input {
  height: 42px;
  padding: 0 12px;
  border: 1px solid #d8ded9;
  border-radius: 9px;
  outline: 0;
  color: #1e2720;
  background: #fff;
}
.packaging-dialog-field input:focus { border-color: #79967e; box-shadow: 0 0 0 3px rgba(88, 126, 96, 0.12); }
.packaging-quantity-input { position: relative; display: block; }
.packaging-quantity-input input { width: 100%; padding-right: 52px; box-sizing: border-box; }
.packaging-quantity-input em {
  position: absolute;
  top: 50%;
  right: 12px;
  color: #788179;
  font-size: 12px;
  font-style: normal;
  font-weight: 500;
  transform: translateY(-50%);
  pointer-events: none;
}
.packaging-dialog-error { margin: -8px 0 0; color: #b73a32; font-size: 12px; }
.packaging-dialog-footer { justify-content: flex-end; border-top: 1px solid #e9ede9; background: #fbfcfb; }
.packaging-dialog-footer button { min-width: 92px; }

@media (max-width: 560px) {
  .packaging-dialog-backdrop { align-items: end; padding: 0; }
  .packaging-dialog { width: 100%; border-radius: 16px 16px 0 0; }
  .packaging-target-card { grid-template-columns: 1fr; }
}
</style>
