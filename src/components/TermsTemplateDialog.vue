<script setup lang="ts">
import { ref, watch } from 'vue';
import { FileText, Plus, Trash2, X } from 'lucide-vue-next';

import { useDialogFocus } from '../composables/useDialogFocus';
import { termsTaxModes, type TermsTaxMode, type TermsTemplate } from '../types/termsTemplate';
import { taxRateOptions } from '../utils/taxCalculation';
import { salesDeliveryMethodOptions, salesPaymentOptions } from '../utils/salesTerms';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    templates: TermsTemplate[];
    activeKey: string;
    draft: TermsTemplate;
    canDelete: boolean;
    notice: string;
    readonly?: boolean;
    readonlyReason?: string;
    showFreightPayer?: boolean;
    showPriceTax?: boolean;
    deliveryMethodOptions?: string[];
    paymentMethodOptions?: string[];
    freightPayerOptions?: string[];
  }>(),
  {
    readonly: false,
    readonlyReason: '',
    showFreightPayer: false,
    showPriceTax: true,
    deliveryMethodOptions: () => salesDeliveryMethodOptions,
    paymentMethodOptions: () => salesPaymentOptions,
    freightPayerOptions: () => ['供方', '客户'],
  },
);

const emit = defineEmits<{
  close: [];
  create: [];
  choose: [key: string];
  delete: [];
  apply: [];
  save: [];
  'update:draft': [draft: TermsTemplate];
}>();

const dialogPanel = ref<HTMLElement | null>(null);
const { focusDialog, restoreDialogFocus, handleDialogTab } = useDialogFocus(dialogPanel);

watch(
  () => props.open,
  (open) => {
    if (open) {
      focusDialog();
      return;
    }

    restoreDialogFocus();
  },
  { flush: 'post' },
);

function updateDraft(partial: Partial<TermsTemplate>) {
  if (props.readonly) return;

  emit('update:draft', {
    ...props.draft,
    ...partial,
  });
}

function inputValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function taxModeValue(event: Event) {
  return (event.target as HTMLSelectElement).value as TermsTaxMode;
}

function selectValue(event: Event) {
  return (event.target as HTMLSelectElement).value;
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="terms-template-backdrop" @click.self="emit('close')" @keydown.esc.stop="emit('close')">
      <section
        ref="dialogPanel"
        class="terms-template-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-template-title"
        tabindex="-1"
        @keydown.tab="handleDialogTab"
      >
        <header class="terms-template-head">
          <div>
            <FileText :size="18" />
            <h2 id="terms-template-title">{{ title }}</h2>
          </div>
          <button type="button" aria-label="关闭条款模板" title="关闭条款模板" @click="emit('close')">
            <X :size="17" />
          </button>
        </header>

        <div class="terms-template-body">
          <aside class="terms-template-list" aria-label="条款模板列表">
            <button
              class="terms-template-new-action"
              type="button"
              :disabled="readonly"
              :title="readonly ? readonlyReason : '新建条款模板'"
              @click="emit('create')"
            >
              <Plus :size="14" />
              新建模板
            </button>
            <button
              v-for="template in templates"
              :key="template.key"
              class="terms-template-list-item"
              :class="{ active: template.key === activeKey }"
              type="button"
              :title="`选择条款模板：${template.name}`"
              @click="emit('choose', template.key)"
            >
              <span>{{ template.name }}</span>
              <small>
                {{ template.deliveryMethod }} · {{ template.paymentMethod }}
                <template v-if="showPriceTax"> · {{ template.taxMode }} · {{ template.taxRate || '13%' }}</template>
                <template v-if="showFreightPayer"> · {{ template.freightPayer || '供方' }}</template>
              </small>
            </button>
          </aside>

          <div class="terms-template-form">
            <label class="form-field full-field">
              <span>模板名称</span>
              <input
                :value="draft.name"
                type="text"
                :readonly="readonly"
                :title="readonly ? readonlyReason : '填写条款模板名称'"
                @input="updateDraft({ name: inputValue($event) })"
              />
            </label>
            <label class="form-field">
              <span>交付方式</span>
              <select
                :value="draft.deliveryMethod"
                :disabled="readonly"
                :title="readonly ? readonlyReason : '选择交付方式'"
                @change="updateDraft({ deliveryMethod: selectValue($event) })"
              >
                <option v-for="method in props.deliveryMethodOptions" :key="method" :value="method">
                  {{ method }}
                </option>
              </select>
            </label>
            <label class="form-field">
              <span>付款方式</span>
              <select
                :value="draft.paymentMethod"
                :disabled="readonly"
                :title="readonly ? readonlyReason : '选择付款方式'"
                @change="updateDraft({ paymentMethod: selectValue($event) })"
              >
                <option v-for="method in props.paymentMethodOptions" :key="method" :value="method">
                  {{ method }}
                </option>
              </select>
            </label>
            <label v-if="showPriceTax" class="form-field">
              <span>计价口径</span>
              <select
                :value="draft.taxMode"
                :disabled="readonly"
                :title="readonly ? readonlyReason : '选择计价口径'"
                @change="updateDraft({ taxMode: taxModeValue($event) })"
              >
                <option v-for="mode in termsTaxModes" :key="mode" :value="mode">
                  {{ mode }}
                </option>
              </select>
            </label>
            <label v-if="showPriceTax" class="form-field">
              <span>税率</span>
              <select
                :value="draft.taxRate || '13%'"
                :disabled="readonly"
                :title="readonly ? readonlyReason : '选择税率'"
                @change="updateDraft({ taxRate: selectValue($event) })"
              >
                <option v-for="rate in taxRateOptions" :key="rate" :value="rate">
                  {{ rate }}
                </option>
              </select>
            </label>
            <label v-if="showFreightPayer" class="form-field">
              <span>运费承担</span>
              <select
                :value="draft.freightPayer || '供方'"
                :disabled="readonly"
                :title="readonly ? readonlyReason : '选择运费承担方'"
                @change="updateDraft({ freightPayer: selectValue($event) })"
              >
                <option v-for="payer in props.freightPayerOptions" :key="payer" :value="payer">
                  {{ payer }}
                </option>
              </select>
            </label>
            <label class="form-field full-field">
              <span>条款正文</span>
              <textarea
                :value="draft.content"
                class="terms-textarea"
                rows="6"
                placeholder="填写包装、交付、验收、付款、违约等条款。"
                :readonly="readonly"
                :title="readonly ? readonlyReason : '填写条款正文'"
                @input="updateDraft({ content: inputValue($event) })"
              ></textarea>
            </label>
            <p v-if="notice" class="terms-template-notice">{{ notice }}</p>
          </div>
        </div>

        <footer class="terms-template-footer">
          <button
            class="template-delete-action"
            type="button"
            :disabled="readonly || !canDelete"
            :title="readonly ? readonlyReason : canDelete ? '删除当前条款模板' : '当前没有可删除的条款模板'"
            @click="emit('delete')"
          >
            <Trash2 :size="15" />
            删除模板
          </button>
          <div>
            <button
              class="secondary-action"
              type="button"
              :disabled="readonly"
              :title="readonly ? readonlyReason : '将当前模板条款应用到单据'"
              @click="emit('apply')"
            >
              应用到当前
            </button>
            <button
              class="primary-action"
              type="button"
              :disabled="readonly"
              :title="readonly ? readonlyReason : '保存当前条款模板修改'"
              @click="emit('save')"
            >
              保存修改
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
