<script setup lang="ts">
import { ArrowDownToLine, ArrowUpFromLine, Landmark } from 'lucide-vue-next';

import type { FinanceSettlementEvent } from '../types/business';

withDefaults(defineProps<{
  direction: '收款' | '付款';
  events: FinanceSettlementEvent[];
}>(), {
  events: () => [],
});
</script>

<template>
  <div v-if="events.length" class="finance-settlement-history">
    <article v-for="event in events" :key="event.code" class="finance-settlement-event">
      <span class="finance-settlement-event-icon" :class="direction === '付款' ? 'is-payment' : ''">
        <ArrowDownToLine v-if="direction === '收款'" :size="17" />
        <ArrowUpFromLine v-else :size="17" />
      </span>
      <div class="finance-settlement-event-main">
        <div>
          <strong>{{ event.code }}</strong>
          <small>{{ event.transactionDate }} · {{ event.method }}</small>
        </div>
        <p v-if="event.account || event.reference"><Landmark :size="13" />{{ [event.account, event.reference].filter(Boolean).join(' · ') }}</p>
        <span v-if="event.note">{{ event.note }}</span>
      </div>
      <div class="finance-settlement-event-amount">
        <strong>{{ event.amount }}</strong>
        <small>{{ event.actor }}</small>
      </div>
    </article>
  </div>
  <div v-else class="finance-settlement-empty">
    <span>暂无{{ direction }}记录</span>
    <small>每次{{ direction }}会独立留存金额、日期、方式和资金凭证。</small>
  </div>
</template>

<style scoped>
.finance-settlement-history { display: grid; gap: 9px; }

.finance-settlement-event {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid #e5e7e1;
  border-radius: 11px;
  background: #fcfcf9;
}

.finance-settlement-event-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 9px;
  background: #edf6ef;
  color: #2f6945;
}

.finance-settlement-event-icon.is-payment { background: #fff4e8; color: #9a5a13; }
.finance-settlement-event-main { min-width: 0; }
.finance-settlement-event-main > div { display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px 10px; }
.finance-settlement-event-main strong { color: #282d28; font-size: 13px; }
.finance-settlement-event-main small,
.finance-settlement-event-main > span,
.finance-settlement-event-amount small { color: #7c827c; font-size: 11px; }
.finance-settlement-event-main p { display: flex; align-items: center; gap: 5px; margin: 6px 0 0; color: #59625b; font-size: 12px; }
.finance-settlement-event-main > span { display: block; margin-top: 5px; }
.finance-settlement-event-amount { display: flex; align-items: flex-end; flex-direction: column; gap: 4px; white-space: nowrap; }
.finance-settlement-event-amount strong { color: #2c6442; font-size: 15px; }
.finance-settlement-empty { display: flex; flex-direction: column; gap: 4px; padding: 18px; border: 1px dashed #dfe2db; border-radius: 10px; color: #626862; background: #fafaf7; text-align: center; }
.finance-settlement-empty small { color: #929792; font-size: 11px; }

@media (max-width: 640px) {
  .finance-settlement-event { grid-template-columns: auto minmax(0, 1fr); }
  .finance-settlement-event-amount { grid-column: 2; align-items: flex-start; }
}
</style>
