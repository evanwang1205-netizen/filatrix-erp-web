<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Check, ChevronLeft, CircleAlert, ClipboardList, Pencil, Plus, Save, Trash2 } from 'lucide-vue-next';

import DocumentLoadState from '../components/DocumentLoadState.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import ReferencePicker from '../components/ReferencePicker.vue';
import { requestActionConfirmation } from '../composables/useActionConfirmation';
import { useMasterSaveFeedback } from '../composables/useMasterSaveFeedback';
import { useModulePermission } from '../composables/useModulePermission';
import { usePageRefresh } from '../composables/usePageRefresh';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import type { MasterDataRecord } from '../data/masterData';
import { cityOptionsMap, provinceOptions } from '../data/regionOptions';
import {
  getMasterRecord,
  listWarehouseMaterialSettings,
  saveMasterRecord,
  saveWarehouseMaterialSettings,
  type WarehouseMaterialSetting,
} from '../services/api';
import type { ReferenceOption } from '../types/business';
import { isNonNegativeInteger } from '../utils/masterInputValidation';
import { statusPresentationClass } from '../utils/statusPresentation';

type WarehouseDraft = MasterDataRecord & {
  locationCount: number;
  binPrefix: string;
  company: string;
  regionType: string;
  province: string;
  city: string;
  address: string;
};

const route = useRoute();
const router = useRouter();
const { saveMessage, saveTone, showSaveFeedback, validateRequired, requiredFieldClass, setRequiredErrors } = useMasterSaveFeedback();
const { canWrite: canWriteMasterData, readonlyReason: masterDataReadonlyReason } = useModulePermission('masterData');

const warehouseTypes = ['成品仓', '原料仓', '包材仓', '半成品仓', '生产线边仓', '备件仓', '暂存仓', '隔离仓', '综合仓'];
const warehouseFunctionOptions = [
  { value: '采购暂存', label: '采购暂存', description: '采购到货先进入此仓，质检或免检放行后再转正式仓。' },
  { value: '销售退货暂存', label: '销售退货暂存', description: '客户退回实物先进入此仓，质检判定前不计入可销售库存。' },
  { value: '可采购入库', label: '可采购入库', description: '可作为采购放行物料的正式入库去向。' },
  { value: '可销售出库', label: '可销售出库', description: '可用于销售备货、拣货和出库。' },
  { value: '可生产领料', label: '可生产领料', description: '可作为生产领料和补料的来源仓。' },
  { value: '可生产入库', label: '可生产入库', description: '可接收完工产品或半成品入库。' },
  { value: '不合格隔离', label: '不合格隔离', description: '仅存放冻结、退货待处理或不合格物料。' },
];
const statusOptions = ['启用', '停用'];

function todayText() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const mode = computed(() => {
  const name = String(route.name ?? '');
  if (name.includes('new')) return 'new';
  if (name.includes('edit')) return 'edit';
  return 'detail';
});
const isDetailMode = computed(() => mode.value === 'detail');
const isReadonlyMode = computed(() => isDetailMode.value || !canWriteMasterData.value);
const isSaving = ref(false);
const isLoading = ref(false);
let warehouseLoadRequestId = 0;
const masterEditActionTitle = computed(() =>
  canWriteMasterData.value ? '编辑仓库资料' : masterDataReadonlyReason.value,
);
const masterSaveActionTitle = computed(() => {
  if (isSaving.value) return '正在保存，请稍候';
  return canWriteMasterData.value ? '保存资料，保存后会同步到业务候选列表。' : masterDataReadonlyReason.value;
});
const warehouseCode = computed(() => route.params.code?.toString() ?? '');
const apiWarehouse = ref<MasterDataRecord | null>(null);
const loadMessage = ref('');
const replenishmentSettings = ref<WarehouseMaterialSetting[]>([]);
const replenishmentDrafts = ref<WarehouseMaterialSetting[]>([]);
const sourceWarehouse = computed(() => (mode.value === 'new' ? undefined : (apiWarehouse.value ?? undefined)));

const warehouseDraft = reactive<WarehouseDraft>(createDraft(sourceWarehouse.value));
const usesReplenishmentSettings = computed(() =>
  !warehouseDraft.warehouseFunctions?.some((item) => ['采购暂存', '销售退货暂存', '不合格隔离'].includes(item)),
);
const { isDirty, resetUnsavedChanges } = useUnsavedChangesGuard(
  () => ({ warehouse: warehouseDraft, replenishment: replenishmentDrafts.value }),
  {
  enabled: computed(() => !isReadonlyMode.value),
  ready: computed(() => !isLoading.value),
  },
);

watch(
  () => sourceWarehouse.value,
  (row) => {
    Object.assign(warehouseDraft, createDraft(row));
  },
  { immediate: true },
);

watch(
  () => warehouseDraft.locationCount,
  (locationCount) => {
    if (Number(locationCount) <= 0) warehouseDraft.binPrefix = '';
  },
);

watch(
  () => warehouseDraft.status,
  (status) => {
    if (status !== '停用') return;
    replenishmentDrafts.value.forEach((setting) => {
      setting.status = '停用';
    });
  },
);

watch(
  () => route.fullPath,
  () => {
    void loadWarehouse();
  },
  { immediate: true },
);

const pageHeading = computed(() => {
  if (mode.value === 'new') return '新建仓库';
  if (mode.value === 'edit') return '编辑仓库';
  return '仓库详情';
});
const referenceTitle = computed(() => `仓库 ${warehouseDraft.code || ''}`.trim());
const referenceSubtitle = computed(() => `${warehouseDraft.name || '未命名'} · ${warehouseDraft.status}`);
const referencePath = computed(() =>
  warehouseDraft.code && warehouseDraft.code !== '系统自动生成' ? `/master-data/warehouses/${encodeURIComponent(warehouseDraft.code)}` : '',
);
const statusTip = computed(() =>
  warehouseDraft.status === '启用'
    ? '启用只表示仓库可被新业务引用；实际可承接的流程由业务职能决定，库存能否使用仍由质量与冻结状态决定。'
    : '停用后不能用于新的库存操作，历史库存和流水仍保留。',
);
const isDomesticWarehouse = computed(() => warehouseDraft.regionType === '国内');
const cityOptions = computed(() => cityOptionsMap[warehouseDraft.province] ?? []);
const warehouseAddressText = computed(() =>
  warehouseDraft.regionType === '海外'
    ? warehouseDraft.address || '—'
    : [warehouseDraft.province, warehouseDraft.city, warehouseDraft.address].filter(Boolean).join('') || '—',
);
const warehouseProfileSummary = computed(() => {
  const missingItems = [
    { label: '仓库位置', complete: Boolean(warehouseDraft.address) },
    { label: '库位规则', complete: warehouseDraft.locationCount === 0 || Boolean(warehouseDraft.binPrefix) },
  ].filter((item) => !item.complete);
  return missingItems.length ? missingItems : [{ label: '关键配置', complete: true }];
});

async function loadWarehouse() {
  const requestId = ++warehouseLoadRequestId;
  const targetMode = mode.value;
  const targetCode = warehouseCode.value;
  loadMessage.value = '';
  apiWarehouse.value = null;
  replenishmentSettings.value = [];
  replenishmentDrafts.value = [];
  isLoading.value = targetMode !== 'new';

  if (targetMode === 'new' || !targetCode) {
    isLoading.value = false;
    return;
  }

  try {
    const [warehouse, settings] = await Promise.all([
      getMasterRecord('warehouses', targetCode),
      listWarehouseMaterialSettings({ warehouseCode: targetCode }),
    ]);
    if (requestId !== warehouseLoadRequestId) return;
    apiWarehouse.value = warehouse;
    replenishmentSettings.value = settings;
    replenishmentDrafts.value = settings.map((setting) => ({
      ...setting,
      status: warehouse.status === '停用' ? '停用' : setting.status,
    }));
  } catch (error) {
    if (requestId !== warehouseLoadRequestId) return;
    loadMessage.value = error instanceof Error ? error.message : '仓库加载失败';
  } finally {
    if (requestId === warehouseLoadRequestId) isLoading.value = false;
  }
}

async function refreshWarehousePage() {
  if (!isDetailMode.value && isDirty.value) {
    const confirmed = await requestActionConfirmation({
      title: '放弃未保存修改？',
      message: '刷新将丢失当前仓库资料中尚未保存的修改。',
      confirmLabel: '放弃并刷新',
    });
    if (!confirmed) return;
  }

  if (mode.value === 'new') {
    Object.assign(warehouseDraft, createDraft());
    replenishmentDrafts.value = [];
    await nextTick();
    resetUnsavedChanges();
    return;
  }

  await loadWarehouse();
  await nextTick();
  resetUnsavedChanges();
}

usePageRefresh(refreshWarehousePage);

function createDraft(row?: MasterDataRecord): WarehouseDraft {
  const source: MasterDataRecord = row ?? {
    code: '系统自动生成',
    name: '',
    type: '成品仓',
    status: '启用',
    updatedAt: todayText(),
    attachments: 0,
    note: '',
  };
  const warehouseSource: MasterDataRecord = { ...source };
  delete warehouseSource.owner;
  delete warehouseSource.manager;
  delete warehouseSource.primary;
  delete warehouseSource.secondary;
  delete warehouseSource.phone;
  delete (warehouseSource as MasterDataRecord & Record<string, unknown>).warehouseScope;
  delete warehouseSource.allowPurchaseStaging;
  delete warehouseSource.allowPurchaseReceipt;
  delete warehouseSource.allowSalesIssue;
  delete warehouseSource.allowProductionIssue;
  delete warehouseSource.allowProductionReceipt;
  delete warehouseSource.allowQualityHold;
  delete warehouseSource.allowQuarantine;

  return {
    ...warehouseSource,
    warehouseFunctions: source.warehouseFunctions ?? [],
    locationCount: source.locationCount ?? 0,
    binPrefix: source.binPrefix ?? '',
    company: source.company ?? 'Filatrix 增材材料有限公司',
    regionType: source.regionType ?? '国内',
    province: source.province ?? '',
    city: source.city ?? '',
    address: source.address ?? '',
  };
}

function toggleWarehouseFunction(functionName: string, checked: boolean) {
  const current = new Set(warehouseDraft.warehouseFunctions ?? []);
  if (!checked) {
    current.delete(functionName);
  } else if (['采购暂存', '销售退货暂存', '不合格隔离'].includes(functionName)) {
    current.clear();
    current.add(functionName);
  } else {
    current.delete('采购暂存');
    current.delete('销售退货暂存');
    current.delete('不合格隔离');
    current.add(functionName);
  }
  warehouseDraft.warehouseFunctions = [...current];
}

function openEdit() {
  if (!canWriteMasterData.value) {
    showSaveFeedback(masterDataReadonlyReason.value, 'error');
    return;
  }
  router.push(`/master-data/warehouses/${encodeURIComponent(warehouseDraft.code)}/edit`);
}

function handleCompanySelect(option: ReferenceOption) {
  warehouseDraft.company = option.name;
}

function addReplenishmentSetting() {
  replenishmentDrafts.value.push({
    code: `NEW-${Date.now()}-${replenishmentDrafts.value.length + 1}`,
    warehouseCode: warehouseDraft.code === '系统自动生成' ? '' : warehouseDraft.code,
    warehouseName: warehouseDraft.name,
    materialCode: '',
    materialName: '',
    uom: '',
    safetyStock: 0,
    reorderPoint: 0,
    maxStock: 0,
    replenishmentLot: 1,
    status: '启用',
  });
}

function handleReplenishmentMaterialSelect(setting: WarehouseMaterialSetting, option: ReferenceOption) {
  const duplicated = replenishmentDrafts.value.some(
    (candidate) => candidate !== setting && candidate.materialCode === option.code,
  );
  if (duplicated) {
    showSaveFeedback('同一仓库不能重复维护同一物料', 'error');
    return;
  }
  const raw = option.raw as MasterDataRecord;
  setting.materialCode = option.code;
  setting.materialName = option.name;
  setting.uom = raw.uom || '';
}

function removeNewReplenishmentSetting(index: number) {
  const setting = replenishmentDrafts.value[index];
  if (!setting?.code.startsWith('NEW-')) return;
  replenishmentDrafts.value.splice(index, 1);
}

function validateReplenishmentSettings() {
  const seenMaterials = new Set<string>();
  for (const setting of replenishmentDrafts.value) {
    if (!setting.materialCode) return '请选择补货物料';
    if (seenMaterials.has(setting.materialCode)) return '同一仓库不能重复维护同一物料';
    seenMaterials.add(setting.materialCode);
    const safetyStock = Number(setting.safetyStock);
    const reorderPoint = Number(setting.reorderPoint);
    const maxStock = Number(setting.maxStock);
    const replenishmentLot = Number(setting.replenishmentLot);
    if (![safetyStock, reorderPoint, maxStock].every((value) => Number.isFinite(value) && value >= 0)) {
      return `${setting.materialName || setting.materialCode}的库存参数不能小于 0`;
    }
    if (!Number.isFinite(replenishmentLot) || replenishmentLot <= 0) {
      return `${setting.materialName || setting.materialCode}的补货批量必须大于 0`;
    }
    if (safetyStock > reorderPoint || reorderPoint > maxStock) {
      return `${setting.materialName || setting.materialCode}需满足安全库存 ≤ 补货点 ≤ 最高库存`;
    }
  }
  return '';
}

async function saveWarehouse() {
  if (isSaving.value) return;
  if (!canWriteMasterData.value) {
    showSaveFeedback(masterDataReadonlyReason.value, 'error');
    return;
  }
  const passed = validateRequired([
    { label: '仓库名称', value: warehouseDraft.name },
    { label: '仓库类型', value: warehouseDraft.type },
    { label: '所属公司', value: warehouseDraft.company },
  ]);

  if (!passed) return;

  if (!isNonNegativeInteger(warehouseDraft.locationCount)) {
    showSaveFeedback('库位数量必须是大于或等于 0 的整数', 'error');
    return;
  }

  if (warehouseDraft.locationCount > 0 && !warehouseDraft.binPrefix) {
    setRequiredErrors(['库位前缀']);
    showSaveFeedback('设置库位数量后请补充库位前缀', 'error');
    return;
  }
  if (warehouseDraft.binPrefix && !/^[A-Za-z0-9-]+$/.test(warehouseDraft.binPrefix.trim())) {
    showSaveFeedback('库位前缀只能使用字母、数字或短横线', 'error');
    return;
  }

  const replenishmentError = usesReplenishmentSettings.value ? validateReplenishmentSettings() : '';
  if (replenishmentError) {
    showSaveFeedback(replenishmentError, 'error');
    return;
  }

  if (isDomesticWarehouse.value && warehouseDraft.province && !warehouseDraft.city) {
    setRequiredErrors(['城市']);
    showSaveFeedback('选择省份后请补充城市', 'error');
    return;
  }

  isSaving.value = true;
  try {
    const shouldCreateWarehouse = mode.value === 'new'
      && !apiWarehouse.value
      && warehouseDraft.code === '系统自动生成';
    const savedWarehouse = await saveMasterRecord(
      'warehouses',
      {
        ...warehouseDraft,
        updatedAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10),
      },
      { create: shouldCreateWarehouse },
    );

    Object.assign(warehouseDraft, createDraft(savedWarehouse));
    apiWarehouse.value = savedWarehouse;
    let savedSettings: WarehouseMaterialSetting[];
    try {
      const settingsToSave = replenishmentDrafts.value.filter(
        (setting) => usesReplenishmentSettings.value || !setting.code.startsWith('NEW-'),
      );
      savedSettings = await saveWarehouseMaterialSettings(
        savedWarehouse.code,
        settingsToSave.map((setting) => ({
          ...setting,
          warehouseCode: savedWarehouse.code,
          warehouseName: savedWarehouse.name,
          safetyStock: Number(setting.safetyStock),
          reorderPoint: Number(setting.reorderPoint),
          maxStock: Number(setting.maxStock),
          replenishmentLot: Number(setting.replenishmentLot),
          status: savedWarehouse.status === '停用' || !usesReplenishmentSettings.value
            ? '停用'
            : setting.status,
        })),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : '物料补货设置保存失败';
      showSaveFeedback(`仓库基本资料已保存，但物料补货设置尚未保存：${reason}。请修正后再次保存。`, 'error');
      return;
    }

    replenishmentSettings.value = savedSettings;
    replenishmentDrafts.value = savedSettings.map((setting) => ({ ...setting }));
    resetUnsavedChanges();
    showSaveFeedback(`${savedWarehouse.name}已保存，库存单据仓库候选会同步使用`);

    await router.replace(`/master-data/warehouses/${encodeURIComponent(savedWarehouse.code)}`);
  } catch (error) {
    showSaveFeedback(error instanceof Error ? error.message : '仓库保存失败', 'error');
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <section v-if="mode === 'new' || apiWarehouse" class="quote-editor warehouse-editor" :class="{ 'is-detail-view': isDetailMode }">
    <PageTopbarPortal>
      <template #context>
        <RouterLink class="topbar-back-action" to="/master-data/warehouses" aria-label="返回仓库列表" title="返回仓库列表">
          <ChevronLeft :size="14" :stroke-width="2" />
          <span>返回</span>
        </RouterLink>
        <strong class="topbar-context-title">{{ isDetailMode ? warehouseDraft.name : pageHeading }}</strong>
      </template>

      <template #actions>
        <PinReferenceButton
          v-if="isDetailMode && referencePath"
          class="topbar-optional-action"
          :title="referenceTitle"
          :subtitle="referenceSubtitle"
          :path="referencePath"
        />
        <button v-if="isDetailMode" class="primary-action" type="button" :disabled="!canWriteMasterData" :title="masterEditActionTitle" @click="openEdit">
          <Pencil :size="16" />
          <span>编辑</span>
        </button>
        <button v-else class="primary-action master-save-action" type="button" :disabled="isSaving || !canWriteMasterData" :aria-busy="isSaving" :title="masterSaveActionTitle" @click="saveWarehouse">
          <Save :size="16" />
          <span>{{ isSaving ? '保存中' : '保存' }}</span>
        </button>
      </template>

      <template #fallback>
        <div class="quote-editor-header"><div><h1>{{ isDetailMode ? warehouseDraft.name : pageHeading }}</h1><p v-if="loadMessage" class="section-hint">{{ loadMessage }}</p></div></div>
      </template>
    </PageTopbarPortal>

    <div class="quote-form-grid warehouse-form-grid" :class="{ 'is-editing': !isDetailMode }">
      <div v-if="isDetailMode" class="quote-main-sections warehouse-detail-content">
        <section class="form-section material-detail-section warehouse-detail-section">
          <div class="form-section-head"><h2>基本资料</h2></div>
          <dl class="material-fact-grid warehouse-fact-grid warehouse-identity-grid">
            <div><dt>仓库编码</dt><dd>{{ warehouseDraft.code }}</dd></div>
            <div><dt>仓库名称</dt><dd>{{ warehouseDraft.name }}</dd></div>
            <div><dt>仓库类型</dt><dd>{{ warehouseDraft.type }}</dd></div>
            <div><dt>所属公司</dt><dd>{{ warehouseDraft.company || '—' }}</dd></div>
            <div><dt>资料更新</dt><dd>{{ warehouseDraft.updatedAt || '—' }}</dd></div>
          </dl>
        </section>

        <section class="form-section material-detail-section warehouse-detail-section">
          <div class="form-section-head"><h2>业务职能</h2></div>
          <div v-if="warehouseDraft.warehouseFunctions?.length" class="warehouse-function-summary">
            <span v-for="item in warehouseDraft.warehouseFunctions" :key="item">{{ item }}</span>
          </div>
          <p v-else class="master-relation-empty">未配置业务职能，仅保留库存查询和通用管理。</p>
        </section>

        <section class="form-section material-detail-section warehouse-detail-section">
          <div class="form-section-head"><h2>仓库位置</h2></div>
          <dl class="material-fact-grid warehouse-fact-grid simple-fact-grid-two">
            <div><dt>地区</dt><dd>{{ warehouseDraft.regionType }}</dd></div>
            <div><dt>地址</dt><dd>{{ warehouseAddressText }}</dd></div>
          </dl>
        </section>

        <section class="form-section material-detail-section warehouse-detail-section">
          <div class="form-section-head"><h2>库位设置</h2></div>
          <dl class="material-fact-grid warehouse-fact-grid simple-fact-grid-two">
            <div><dt>库位数量</dt><dd>{{ warehouseDraft.locationCount }} 个</dd></div>
            <div><dt>库位前缀</dt><dd>{{ warehouseDraft.binPrefix || '不细分' }}</dd></div>
          </dl>
        </section>

        <section v-if="usesReplenishmentSettings" class="form-section material-detail-section warehouse-detail-section">
          <div class="form-section-head"><h2>物料补货设置</h2></div>
          <div v-if="replenishmentSettings.length" class="master-relation-table-wrap">
            <table class="master-relation-table">
              <thead><tr><th>物料</th><th>安全库存</th><th>补货点</th><th>最高库存</th><th>补货批量</th><th>关系状态</th></tr></thead>
              <tbody>
                <tr v-for="setting in replenishmentSettings" :key="setting.code">
                  <td><RouterLink :to="`/master-data/materials/${encodeURIComponent(setting.materialCode)}`">{{ setting.materialName }}</RouterLink></td>
                  <td>{{ setting.safetyStock }} {{ setting.uom }}</td>
                  <td>{{ setting.reorderPoint }} {{ setting.uom }}</td>
                  <td>{{ setting.maxStock }} {{ setting.uom }}</td>
                  <td>{{ setting.replenishmentLot }} {{ setting.uom }}</td>
                  <td><i class="mini-status" :class="statusPresentationClass(setting.status)">{{ setting.status }}</i></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="master-relation-empty">该仓库暂无物料补货参数。</p>
        </section>

        <section v-if="warehouseDraft.note" class="form-section material-detail-section warehouse-detail-section">
          <div class="form-section-head"><h2>仓库备注</h2></div>
          <p class="material-note-copy">{{ warehouseDraft.note }}</p>
        </section>
      </div>

      <div v-else class="quote-main-sections warehouse-edit-content">
        <section class="form-section">
          <div class="form-section-head"><h2>基本资料</h2></div>
          <div class="quote-fields">
            <label class="form-field"><span>仓库编码</span><input v-model="warehouseDraft.code" disabled /></label>
            <label class="form-field" :class="requiredFieldClass('仓库名称', warehouseDraft.name)"><span>仓库名称</span><input v-model="warehouseDraft.name" placeholder="填写仓库名称" /></label>
            <label class="form-field" :class="requiredFieldClass('仓库类型', warehouseDraft.type)">
              <span>仓库类型</span>
              <select v-model="warehouseDraft.type" :disabled="mode !== 'new'"><option v-for="type in warehouseTypes" :key="type" :value="type">{{ type }}</option></select>
            </label>
            <label class="form-field" :class="requiredFieldClass('所属公司', warehouseDraft.company)">
              <span>所属公司</span>
              <ReferencePicker v-model="warehouseDraft.company" :display-value="warehouseDraft.company" type="company" title="选择所属公司" placeholder="选择所属公司" search-placeholder="搜索公司编码或名称" :disabled="mode !== 'new'" @select="handleCompanySelect" />
            </label>
            <label class="form-field">
              <span>使用状态</span>
              <select v-model="warehouseDraft.status"><option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option></select>
            </label>
            <div class="master-field-notes">
              <small v-if="mode !== 'new'" class="field-help">仓库类型用于库存分类，已有仓库不可直接修改；可参与的流程由业务职能控制。</small>
              <small v-if="mode !== 'new'" class="field-help">所属公司决定库存责任主体，已有仓库不可直接修改。</small>
              <small class="field-help">停用前必须清理库存、占用和在途，并调整启用物料的常用仓库；补货关系会同步停用。</small>
            </div>
          </div>
        </section>

        <section class="form-section">
          <div class="form-section-head"><h2>仓库位置</h2></div>
          <div class="quote-fields">
            <label class="form-field"><span>地区</span><select v-model="warehouseDraft.regionType"><option>国内</option><option>海外</option></select></label>
            <label v-if="isDomesticWarehouse" class="form-field"><span>省份</span><select v-model="warehouseDraft.province"><option value="">选择省份</option><option v-for="province in provinceOptions" :key="province">{{ province }}</option></select></label>
            <label v-if="isDomesticWarehouse" class="form-field"><span>城市</span><select v-model="warehouseDraft.city"><option value="">选择城市</option><option v-for="city in cityOptions" :key="city">{{ city }}</option></select></label>
            <label class="form-field field-wide"><span>详细地址</span><input v-model="warehouseDraft.address" placeholder="填写厂区、楼栋和仓库位置" /></label>
          </div>
        </section>

        <section class="form-section">
          <div class="form-section-head"><h2>业务职能</h2></div>
          <div class="warehouse-function-options">
            <label v-for="option in warehouseFunctionOptions" :key="option.value" class="warehouse-function-option">
              <input
                type="checkbox"
                :checked="warehouseDraft.warehouseFunctions?.includes(option.value)"
                @change="toggleWarehouseFunction(option.value, ($event.target as HTMLInputElement).checked)"
              />
              <span>
                <strong>{{ option.label }}</strong>
                <small>{{ option.description }}</small>
              </span>
            </label>
          </div>
          <p class="master-relation-guidance">采购暂存、销售退货暂存、不合格隔离属于受控职能，不能与正常收发和生产职能混用；取消已有职能前必须清理相关库存与未完成单据。</p>
        </section>

        <section class="form-section">
          <div class="form-section-head"><h2>库位设置</h2></div>
          <div class="quote-fields">
            <label class="form-field"><span>库位数量</span><input v-model.number="warehouseDraft.locationCount" type="number" min="0" /></label>
            <label class="form-field" :class="warehouseDraft.locationCount > 0 ? requiredFieldClass('库位前缀', warehouseDraft.binPrefix) : ''"><span>库位前缀</span><input v-model="warehouseDraft.binPrefix" :disabled="warehouseDraft.locationCount === 0" placeholder="例如 FG / RM / QC" /></label>
          </div>
        </section>

        <section v-if="usesReplenishmentSettings" class="form-section">
          <div class="form-section-head">
            <h2>物料补货设置</h2>
            <button class="secondary-action compact-action" type="button" title="添加仓库物料补货参数" @click="addReplenishmentSetting">
              <Plus :size="14" />
              添加物料
            </button>
          </div>
          <div v-if="replenishmentDrafts.length" class="master-relation-editor warehouse-relation-editor">
            <div class="master-relation-editor-row master-relation-editor-head warehouse-relation-editor-row">
              <span>物料</span><span>安全库存</span><span>补货点</span><span>最高库存</span><span>补货批量</span><span>关系</span><span></span>
            </div>
            <div v-for="(setting, index) in replenishmentDrafts" :key="setting.code" class="master-relation-editor-row warehouse-relation-editor-row">
              <ReferencePicker
                v-model="setting.materialCode"
                :display-value="setting.materialName"
                type="materials"
                title="选择补货物料"
                placeholder="选择物料"
                search-placeholder="搜索启用物料"
                :disabled="!setting.code.startsWith('NEW-')"
                @select="handleReplenishmentMaterialSelect(setting, $event)"
              />
              <label class="relation-number-input"><input v-model.number="setting.safetyStock" type="number" min="0" step="any" :aria-label="`${setting.materialName || '物料'}安全库存`" /><span>{{ setting.uom || '-' }}</span></label>
              <label class="relation-number-input"><input v-model.number="setting.reorderPoint" type="number" min="0" step="any" :aria-label="`${setting.materialName || '物料'}补货点`" /><span>{{ setting.uom || '-' }}</span></label>
              <label class="relation-number-input"><input v-model.number="setting.maxStock" type="number" min="0" step="any" :aria-label="`${setting.materialName || '物料'}最高库存`" /><span>{{ setting.uom || '-' }}</span></label>
              <label class="relation-number-input"><input v-model.number="setting.replenishmentLot" type="number" min="0.0001" step="any" :aria-label="`${setting.materialName || '物料'}补货批量`" /><span>{{ setting.uom || '-' }}</span></label>
              <select v-model="setting.status" :aria-label="`${setting.materialName || '物料'}补货关系状态`"><option>启用</option><option>停用</option></select>
              <button
                class="row-icon-button"
                type="button"
                :disabled="!setting.code.startsWith('NEW-')"
                :aria-label="setting.code.startsWith('NEW-') ? '移除新增补货物料' : '已有设置请改为停用'"
                :title="setting.code.startsWith('NEW-') ? '移除新增补货物料' : '已有设置请改为停用，以保留历史追溯'"
                @click="removeNewReplenishmentSetting(index)"
              ><Trash2 :size="15" /></button>
            </div>
          </div>
          <p v-else class="master-relation-empty">暂无补货参数。没有补货控制要求时可留空。</p>
          <p class="master-relation-guidance">补货点用于提醒补货，数量统一使用物料基础单位。</p>
        </section>

        <section class="form-section">
          <div class="form-section-head"><h2>备注</h2></div>
          <label class="form-field"><textarea v-model="warehouseDraft.note" placeholder="填写仓库限制、盘点或存放说明" /></label>
        </section>
      </div>

      <aside v-if="isDetailMode" class="quote-summary-panel warehouse-side-panel">
        <section class="summary-section">
          <div class="summary-title">
            <ClipboardList :size="17" />
            <h2>使用状态</h2>
          </div>
          <div class="material-rule-card" :class="{ warn: warehouseDraft.status === '停用' }">
            <strong>{{ warehouseDraft.status === '启用' ? '可使用' : '已停用' }}</strong>
            <span>{{ statusTip }}</span>
          </div>
        </section>

        <section class="summary-section">
          <div class="summary-title"><h2>配置完整性</h2></div>
          <div class="warehouse-completeness-list">
            <div v-for="item in warehouseProfileSummary" :key="item.label" :class="{ complete: item.complete }">
              <i><Check v-if="item.complete" :size="13" :stroke-width="2.4" /><CircleAlert v-else :size="13" :stroke-width="2.2" /></i>
              <span><strong>{{ item.label }}</strong><small>{{ item.complete ? '已维护' : '待补充后供新业务使用' }}</small></span>
            </div>
          </div>
        </section>
      </aside>
    </div>
    <div v-if="saveMessage" class="app-toast" :class="{ error: saveTone === 'error' }" :role="saveTone === 'error' ? 'alert' : 'status'" :aria-live="saveTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ saveMessage }}</div>
  </section>
  <DocumentLoadState
    v-else
    :loading="isLoading"
    title="仓库"
    :message="loadMessage || '仓库不存在'"
    back-path="/master-data/warehouses"
    back-label="返回仓库列表"
    @retry="loadWarehouse"
  />
</template>
