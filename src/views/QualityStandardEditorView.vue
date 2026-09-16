<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ArrowLeft, CheckCircle2, Pencil, Plus, Save, Trash2 } from 'lucide-vue-next';

import DocumentLoadState from '../components/DocumentLoadState.vue';
import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import { requestActionConfirmation } from '../composables/useActionConfirmation';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import {
  qualityStandardCheckpointRules,
  type QualityStandardRecord,
} from '../data/quality';
import {
  createQualityStandard,
  getQualityStandard,
  saveQualityStandard,
  setQualityStandardActive,
} from '../services/api';
import type { DocumentStatusItem } from '../types/documentUi';
import { useModulePermission } from '../composables/useModulePermission';

type QualityStandardDraft = QualityStandardRecord & {
  checkpointRules: Array<{ name: string; requirement: string }>;
};

const route = useRoute();
const router = useRouter();
const { canWrite: canWriteQuality, readonlyReason: qualityReadonlyReason } = useModulePermission('quality');

const standard = ref<QualityStandardDraft | null>(null);
const isLoading = ref(false);
const loadMessage = ref('');
const isSaving = ref(false);
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const qualityStandardCreateIntentKey = ref('');
let toastTimer: number | undefined;

const isNew = computed(() => route.path.endsWith('/new'));
const isEdit = computed(() => route.path.endsWith('/edit'));
const isDetail = computed(() => !isNew.value && !isEdit.value);
const isReadOnly = computed(() => isDetail.value || !canWriteQuality.value);
const { resetUnsavedChanges } = useUnsavedChangesGuard(standard, {
  enabled: computed(() => !isReadOnly.value),
  ready: computed(() => !isLoading.value),
});
const isVersionFork = computed(() => Boolean(isEdit.value && standard.value && standard.value.status !== '草稿'));
const projectedVersion = computed(() => {
  const current = Number(standard.value?.version || 1);
  return isVersionFork.value ? current + 1 : current;
});
const projectedCode = computed(() => {
  const draft = standard.value;
  if (!draft || !isVersionFork.value) return draft?.code || '系统自动生成';
  const family = draft.familyCode || draft.code.replace(/-V\d+$/i, '');
  return `${family}-V${projectedVersion.value}`;
});
const editorStatus = computed(() => isVersionFork.value ? '草稿' : standard.value?.status || '草稿');
const editorUpdatedAt = computed(() => isVersionFork.value ? localDateStamp() : standard.value?.updatedAt || localDateStamp());
const pageHeading = computed(() => {
  if (isNew.value) return '新建质检标准';
  if (isVersionFork.value) return '建立质检标准新版本';
  if (isEdit.value) return '维护质检标准草稿';
  return standard.value?.name || '质检标准详情';
});
const primaryActionLabel = computed(() => {
  if (isNew.value) return '保存草稿';
  return standard.value?.status === '草稿' ? '保存草稿' : '建立新版本';
});
const statusActionLabel = computed(() => {
  if (!standard.value) return '';
  if (standard.value.status === '启用') return '停用';
  return standard.value.status === '停用' ? '重新启用' : '启用';
});
const standardStatusItems = computed<DocumentStatusItem[]>(() => {
  const draft = standard.value;
  if (!draft) return [];
  return [
    ...(isVersionFork.value ? [{ key: 'source', label: '来源版本', value: draft.code, kind: 'text' as const }] : []),
    { key: 'version', label: isVersionFork.value ? '目标版本' : '版本', value: `V${projectedVersion.value}`, kind: 'metric' },
    { key: 'checks', label: '检查项', value: `${qualityStandardCheckpointRules(draft).length} 项`, kind: 'metric' },
    { key: 'scope', label: '适用环节', value: draft.scope || '待维护', kind: 'text' },
    { key: 'updated', label: isVersionFork.value ? '新版本维护' : '最近维护', value: [editorUpdatedAt.value, draft.updatedBy || draft.owner].filter(Boolean).join(' · '), kind: 'text' },
  ];
});

const inspectionTypeOptions: QualityStandardRecord['inspectionType'][] = [
  '来料质检',
  '开机首检',
  '半成品质检',
  '报工全检',
  '入库抽检',
  '质量巡检',
];

function localDateStamp() {
  const value = new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createQualityStandardIntentKey() {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `quality-standard-create:${random}`;
}

function newStandardDraft(): QualityStandardDraft {
  return {
    code: '系统自动生成',
    familyCode: '',
    version: 1,
    revision: 0,
    name: '',
    inspectionType: '来料质检',
    scope: '',
    appliesTo: '',
    sampleRule: '',
    checkpoints: [],
    checkpointRules: [{ name: '', requirement: '' }],
    acceptance: '',
    owner: '质量部',
    status: '草稿',
    updatedAt: localDateStamp(),
    note: '',
  };
}

function toDraft(record: QualityStandardRecord): QualityStandardDraft {
  return {
    ...record,
    checkpoints: [...record.checkpoints],
    checkpointRules: qualityStandardCheckpointRules(record).map((item) => ({ ...item })),
  };
}

async function loadStandard() {
  loadMessage.value = '';
  if (isNew.value) {
    qualityStandardCreateIntentKey.value ||= createQualityStandardIntentKey();
    standard.value = newStandardDraft();
    await nextTick();
    resetUnsavedChanges();
    return;
  }
  qualityStandardCreateIntentKey.value = '';

  const code = route.params.code?.toString();
  if (!code) {
    standard.value = null;
    loadMessage.value = '质检标准不存在';
    return;
  }

  isLoading.value = true;
  try {
    const response = await getQualityStandard(code);
    standard.value = toDraft(response.record);
    await nextTick();
    resetUnsavedChanges();
  } catch (error) {
    standard.value = null;
    loadMessage.value = error instanceof Error ? error.message : '质检标准不存在';
  } finally {
    isLoading.value = false;
  }
}

function addCheckpoint() {
  if (!standard.value || isReadOnly.value) return;
  standard.value.checkpointRules.push({ name: '', requirement: '' });
}

function removeCheckpoint(index: number) {
  if (!standard.value || isReadOnly.value) return;
  if (standard.value.checkpointRules.length <= 1) {
    showToast('质检标准至少保留一个检查项。', 'error');
    return;
  }
  standard.value.checkpointRules.splice(index, 1);
}

function normalizedCheckpointRules() {
  if (!standard.value) return [];
  return standard.value.checkpointRules
    .map((item) => ({ name: item.name.trim(), requirement: item.requirement.trim() }))
    .filter((item) => item.name || item.requirement);
}

function validationIssue() {
  if (!standard.value) return '质检标准尚未加载。';
  if (!standard.value.name.trim()) return '请填写标准名称。';
  if (!standard.value.scope.trim()) return '请填写适用环节。';
  if (!standard.value.appliesTo.trim()) return '请填写适用对象。';
  if (!standard.value.sampleRule.trim()) return '请填写抽样规则。';
  if (!standard.value.acceptance.trim()) return '请填写判定方式。';
  const rules = normalizedCheckpointRules();
  if (!rules.length || rules.some((item) => !item.name || !item.requirement)) return '请完整填写每个检查项及其检验要求。';
  return '';
}

async function saveStandard() {
  if (!standard.value || isSaving.value) return;
  if (!canWriteQuality.value) {
    showToast(qualityReadonlyReason.value, 'error');
    return;
  }
  const issue = validationIssue();
  if (issue) {
    showToast(issue, 'error');
    return;
  }

  const rules = normalizedCheckpointRules();
  const payload: QualityStandardDraft = {
    ...standard.value,
    checkpoints: rules.map((item) => item.name),
    checkpointRules: rules,
  };
  isSaving.value = true;
  try {
    const actor = payload.owner || '质量部';
    const response = isNew.value
      ? await createQualityStandard(payload, {
          actor,
          idempotencyKey: qualityStandardCreateIntentKey.value || (qualityStandardCreateIntentKey.value = createQualityStandardIntentKey()),
        })
      : await saveQualityStandard(payload, actor);
    standard.value = toDraft(response.record);
    await nextTick();
    resetUnsavedChanges();
    showToast(response.createdVersion ? `${response.record.code} 新版本草稿已建立` : `${response.record.code} 草稿已保存`);
    if (isNew.value) qualityStandardCreateIntentKey.value = createQualityStandardIntentKey();
    await router.replace(`/quality/standards/${encodeURIComponent(response.record.code)}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '质检标准保存失败。', 'error');
  } finally {
    isSaving.value = false;
  }
}

async function toggleStandardActive() {
  if (!standard.value || !canWriteQuality.value || isSaving.value) return;
  const activate = standard.value.status !== '启用';
  const confirmed = await requestActionConfirmation({
    title: `${activate ? '启用' : '停用'}质检标准 ${standard.value.code}？`,
    message: activate
      ? '启用后可供新的质检任务引用；同一标准族的其他启用版本会按规则停用。'
      : '停用后不能再被新的质检任务引用，历史任务和检验记录不受影响。',
    confirmLabel: `确认${activate ? '启用' : '停用'}`,
    tone: activate ? 'warning' : 'danger',
  });
  if (!confirmed) return;
  isSaving.value = true;
  try {
    const response = await setQualityStandardActive(standard.value, activate, standard.value.owner || '质量部');
    standard.value = toDraft(response.record);
    showToast(`${response.record.code} 已${activate ? '启用' : '停用'}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : `质检标准${activate ? '启用' : '停用'}失败。`, 'error');
  } finally {
    isSaving.value = false;
  }
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2400);
}

watch(() => route.fullPath, loadStandard, { immediate: true });

onBeforeUnmount(() => {
  qualityStandardCreateIntentKey.value = '';
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section v-if="standard" class="quote-editor quality-standard-editor" :class="{ 'is-detail-view': isDetail }">
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" to="/quality/standards" aria-label="返回质检标准列表" title="返回质检标准列表">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ isDetail ? `${standard.name} · V${standard.version || 1}` : pageHeading }}</strong>
        </template>

        <template #actions>
          <template v-if="isDetail">
            <RouterLink
              class="secondary-action"
              :class="{ 'is-disabled': !canWriteQuality }"
              :aria-disabled="!canWriteQuality"
              :to="canWriteQuality ? `/quality/standards/${encodeURIComponent(standard.code)}/edit` : route.fullPath"
              :title="canWriteQuality ? (standard.status === '草稿' ? '维护当前草稿' : '基于当前标准建立新版本') : qualityReadonlyReason"
            >
              <Pencil :size="15" />
              {{ standard.status === '草稿' ? '维护草稿' : '建立新版本' }}
            </RouterLink>
            <button
              class="primary-action"
              type="button"
              :disabled="!canWriteQuality || isSaving"
              :title="canWriteQuality ? `${statusActionLabel}当前质检标准` : qualityReadonlyReason"
              @click="toggleStandardActive"
            >
              <CheckCircle2 :size="15" />
              {{ statusActionLabel }}
            </button>
          </template>
          <template v-else>
            <RouterLink class="secondary-action" to="/quality/standards" title="取消并返回质检标准列表">取消</RouterLink>
            <button class="primary-action" type="button" :disabled="!canWriteQuality || isSaving" :title="canWriteQuality ? primaryActionLabel : qualityReadonlyReason" @click="saveStandard">
              <Save :size="15" />
              {{ isSaving ? '保存中…' : primaryActionLabel }}
            </button>
          </template>
        </template>

        <template #fallback>
          <div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1></div></div>
        </template>
      </PageTopbarPortal>

      <OperationPermissionBanner v-if="!canWriteQuality" :message="qualityReadonlyReason" suffix="当前质检标准仅可查看。" />

      <div class="quote-form-grid">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="form-section-head">
              <h2>标准信息</h2>
              <i v-if="!isDetail" class="mini-status status-neutral">{{ editorStatus }}</i>
            </div>

            <dl v-if="isDetail" class="quality-standard-fact-grid">
              <div><dt>标准编号</dt><dd>{{ standard.code }}</dd></div>
              <div><dt>标准名称</dt><dd>{{ standard.name }}</dd></div>
              <div><dt>质检类型</dt><dd>{{ standard.inspectionType }}</dd></div>
              <div><dt>适用环节</dt><dd>{{ standard.scope }}</dd></div>
              <div class="is-wide"><dt>适用对象</dt><dd>{{ standard.appliesTo }}</dd></div>
              <div class="is-wide"><dt>抽样规则</dt><dd>{{ standard.sampleRule }}</dd></div>
              <div class="is-wide"><dt>判定方式</dt><dd>{{ standard.acceptance }}</dd></div>
              <div><dt>维护人</dt><dd>{{ standard.owner }}</dd></div>
              <div><dt>更新时间</dt><dd>{{ standard.updatedAt }}</dd></div>
            </dl>

            <div v-else class="quote-fields quality-standard-fields">
              <label class="form-field">
                <span>标准编号</span>
                <input :value="projectedCode" type="text" readonly />
              </label>
              <label class="form-field">
                <span class="required-label">标准名称</span>
                <input v-model="standard.name" type="text" placeholder="填写标准名称" />
              </label>
              <label class="form-field">
                <span class="required-label">质检类型</span>
                <select v-model="standard.inspectionType">
                  <option v-for="option in inspectionTypeOptions" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
              <label class="form-field">
                <span class="required-label">适用环节</span>
                <input v-model="standard.scope" type="text" placeholder="例如：采购收货后、正式入库前" />
              </label>
              <label class="form-field full-field">
                <span class="required-label">适用对象</span>
                <input v-model="standard.appliesTo" type="text" placeholder="填写适用物料、成品、产线或作业范围" />
              </label>
              <label class="form-field full-field">
                <span class="required-label">抽样规则</span>
                <textarea v-model="standard.sampleRule" rows="2" placeholder="填写抽样数量、频次和扩大抽检条件"></textarea>
              </label>
              <label class="form-field full-field">
                <span class="required-label">判定方式</span>
                <textarea v-model="standard.acceptance" rows="2" placeholder="填写合格、复判和放行条件"></textarea>
              </label>
              <label class="form-field">
                <span>维护人</span>
                <input v-model="standard.owner" type="text" placeholder="质量部" />
              </label>
              <label class="form-field">
                <span>更新时间</span>
                <input :value="editorUpdatedAt" type="date" readonly />
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <h2>检查项</h2>
              <button v-if="!isReadOnly" class="secondary-action compact-action" type="button" title="添加检查项" @click="addCheckpoint">
                <Plus :size="15" />
                添加
              </button>
            </div>

            <div v-if="isDetail" class="quality-standard-check-table">
              <div class="quality-standard-check-head">
                <span>项目名称</span>
                <span>检验要求</span>
              </div>
              <div v-for="(checkpoint, index) in standard.checkpointRules" :key="`${checkpoint.name}-${index}`" class="quality-standard-check-row">
                <strong><b>{{ String(index + 1).padStart(2, '0') }}</b>{{ checkpoint.name }}</strong>
                <span>{{ checkpoint.requirement }}</span>
              </div>
            </div>

            <div v-else class="quality-standard-check-editor">
              <div class="quality-standard-check-editor-head">
                <span>项目名称</span>
                <span>检验要求</span>
                <span></span>
              </div>
              <div v-for="(checkpoint, index) in standard.checkpointRules" :key="index" class="quality-standard-check-edit-row">
                <label class="form-field">
                  <span>{{ String(index + 1).padStart(2, '0') }}</span>
                  <input v-model="checkpoint.name" type="text" placeholder="检查项" />
                </label>
                <label class="form-field">
                  <span>检验要求</span>
                  <input v-model="checkpoint.requirement" type="text" placeholder="填写可直接判定的要求" />
                </label>
                <button class="icon-button danger" type="button" aria-label="删除检查项" :title="standard.checkpointRules.length <= 1 ? '至少保留一个检查项' : '删除检查项'" :disabled="standard.checkpointRules.length <= 1" @click="removeCheckpoint(index)">
                  <Trash2 :size="15" />
                </button>
              </div>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head"><h2>备注</h2></div>
            <p v-if="isDetail" class="quality-standard-note">{{ standard.note || '—' }}</p>
            <label v-else class="form-field">
              <textarea v-model="standard.note" rows="3" placeholder="填写补充说明"></textarea>
            </label>
          </section>
        </div>

        <aside class="quote-summary-panel">
          <section class="summary-section">
            <DocumentStatusPanel title="维护状态" :primary-status="editorStatus" :items="standardStatusItems" aria-label="质检标准维护状态" />
          </section>
          <section v-if="!isDetail" class="summary-section quality-standard-version-note">
            <h2>版本规则</h2>
            <dl>
              <div><dt>草稿</dt><dd>可继续维护</dd></div>
              <div><dt>启用版本</dt><dd>供新质检任务引用</dd></div>
              <div><dt>历史版本</dt><dd>保留追溯，不影响已生成任务</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </section>

    <DocumentLoadState v-else :loading="isLoading" title="质检标准" :message="loadMessage || '质检标准不存在'" back-path="/quality/standards" back-label="返回质检标准" @retry="loadStandard" />

    <div v-if="toastMessage" class="app-toast" :class="{ error: toastTone === 'error' }" :role="toastTone === 'error' ? 'alert' : 'status'" :aria-live="toastTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">
      {{ toastMessage }}
    </div>
  </div>
</template>

<style scoped>
.quality-standard-fact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  overflow: hidden;
  border: 1px solid #e3e6df;
  border-radius: 10px;
  background: #fff;
}

.quality-standard-fields {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.quality-standard-fact-grid > div {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 12px 14px;
  border-top: 1px solid #eceee9;
  border-left: 1px solid #eceee9;
}

.quality-standard-fact-grid > div:nth-child(-n + 2) { border-top: 0; }
.quality-standard-fact-grid > div:nth-child(odd) { border-left: 0; }
.quality-standard-fact-grid > div.is-wide { grid-column: 1 / -1; border-left: 0; }
.quality-standard-fact-grid dt { color: var(--muted); font-size: 11px; font-weight: 650; }
.quality-standard-fact-grid dd { margin: 0; color: var(--text); font-size: 13px; font-weight: 680; line-height: 1.55; overflow-wrap: anywhere; }

.quality-standard-check-table,
.quality-standard-check-editor {
  overflow: hidden;
  border: 1px solid #e3e6df;
  border-radius: 10px;
  background: #fff;
}

.quality-standard-check-head,
.quality-standard-check-row,
.quality-standard-check-editor-head,
.quality-standard-check-edit-row {
  display: grid;
  grid-template-columns: minmax(150px, 0.72fr) minmax(260px, 1.5fr);
  align-items: center;
  min-width: 0;
}

.quality-standard-check-head,
.quality-standard-check-editor-head {
  min-height: 38px;
  color: var(--muted);
  background: #f7f8f5;
  font-size: 11px;
  font-weight: 700;
}

.quality-standard-check-head > span,
.quality-standard-check-editor-head > span,
.quality-standard-check-row > *,
.quality-standard-check-edit-row > * {
  min-width: 0;
  padding: 9px 12px;
}

.quality-standard-check-row,
.quality-standard-check-edit-row {
  border-top: 1px solid #eceee9;
}

.quality-standard-check-row strong {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.quality-standard-check-row strong b {
  color: #879088;
  font-size: 10px;
  font-weight: 700;
}

.quality-standard-check-row > span {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.quality-standard-check-editor-head,
.quality-standard-check-edit-row {
  grid-template-columns: minmax(150px, 0.72fr) minmax(260px, 1.5fr) 44px;
}

.quality-standard-check-edit-row .form-field {
  padding: 8px 6px 8px 12px;
}

.quality-standard-check-edit-row .icon-button {
  align-self: end;
  margin: 0 8px 8px 0;
  padding: 0;
}

.quality-standard-note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.65;
}

.quality-standard-version-note h2 { margin: 0 0 10px; font-size: 14px; }
.quality-standard-version-note dl { display: grid; margin: 0; }
.quality-standard-version-note dl > div { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 12px; padding: 9px 0; border-top: 1px solid #eceee9; }
.quality-standard-version-note dl > div:first-child { border-top: 0; }
.quality-standard-version-note dt { color: var(--muted); font-size: 12px; }
.quality-standard-version-note dd { margin: 0; color: var(--text); font-size: 12px; font-weight: 650; text-align: right; }

@media (max-width: 760px) {
  .quality-standard-fields,
  .quality-standard-fact-grid,
  .quality-standard-check-head,
  .quality-standard-check-row,
  .quality-standard-check-editor-head,
  .quality-standard-check-edit-row {
    grid-template-columns: 1fr;
  }
  .quality-standard-fact-grid > div,
  .quality-standard-fact-grid > div:nth-child(-n + 2) { border-top: 1px solid #eceee9; border-left: 0; }
  .quality-standard-fact-grid > div:first-child { border-top: 0; }
  .quality-standard-check-head,
  .quality-standard-check-editor-head { display: none; }
  .quality-standard-check-edit-row .icon-button { justify-self: end; }
}
</style>
