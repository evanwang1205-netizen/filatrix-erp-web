<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronLeft, ClipboardList, ImagePlus, Pencil, Save, Trash2 } from 'lucide-vue-next';

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
import {
  getMasterRecord,
  listMaterialSupplierRelations,
  listWarehouseMaterialSettings,
  saveMasterRecord,
  type MaterialSupplierRelation,
  type WarehouseMaterialSetting,
} from '../services/api';
import type { ReferenceOption } from '../types/business';
import { isPositiveInteger } from '../utils/masterInputValidation';
import { statusPresentationClass } from '../utils/statusPresentation';

const route = useRoute();
const router = useRouter();
const { saveMessage, saveTone, showSaveFeedback, validateRequired, requiredFieldClass, setRequiredErrors } = useMasterSaveFeedback();
const { canWrite: canWriteMasterData, readonlyReason: masterDataReadonlyReason } = useModulePermission('masterData');

const materialCategories = ['成品', '半成品', '原料', '色母', '色粉', '辅料', '包材', '备件', '回料', '不良品'];

function todayText() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const emptyMaterial: MasterDataRecord = {
  code: '系统自动生成',
  name: '',
  type: '成品',
  status: '启用',
  updatedAt: todayText(),
  attachments: 0,
  note: '',
  imageLabel: 'IMG',
  englishName: '',
  model: '',
  spec: '',
  englishModel: '',
  englishSpec: '',
  category: '成品',
  isSaleable: true,
  isPurchasable: false,
  isProducible: true,
  shelfLife: '无效期要求',
  qualityControl: '免检',
  incomingQualityControl: '不适用',
  inboundQualityControl: '需质检',
  uom: '卷',
  batchControl: '批次管理',
  supplyStrategy: '自制',
  defaultWarehouse: '成品仓',
  purchaseLeadTimeDays: '',
  productionLeadTimeDays: '',
  safetyStock: '',
  reorderPoint: '',
};

type MaterialDraft = MasterDataRecord & {
  isSaleable: boolean;
  isPurchasable: boolean;
  isProducible: boolean;
  shelfLifeApplicable: boolean;
  shelfLifeMonths: string;
  supplyStrategy: string;
  defaultWarehouse: string;
  purchaseLeadTimeDays: string;
  productionLeadTimeDays: string;
  safetyStock: string;
  reorderPoint: string;
  incomingQualityControl: string;
  inboundQualityControl: string;
};

const routeName = computed(() => route.name?.toString() ?? '');
const isNew = computed(() => routeName.value === 'master-material-new');
const isEdit = computed(() => routeName.value === 'master-material-edit');
const isDetail = computed(() => routeName.value === 'master-material-detail');
const materialCode = computed(() => route.params.code?.toString() ?? '');
const apiMaterial = ref<MasterDataRecord | null>(null);
const loadMessage = ref('');
const isLoading = ref(false);
const isSaving = ref(false);
let materialLoadRequestId = 0;
const imageInput = ref<HTMLInputElement | null>(null);
const imageMessage = ref('');
const materialSupplierRelations = ref<MaterialSupplierRelation[]>([]);
const warehouseMaterialSettings = ref<WarehouseMaterialSetting[]>([]);
const activeMaterialSupplierRelations = computed(() =>
  materialSupplierRelations.value.filter((relation) => relation.status === '启用'),
);
const activeWarehouseMaterialSettings = computed(() =>
  warehouseMaterialSettings.value.filter((setting) => setting.status === '启用'),
);

const sourceMaterial = computed(() =>
  isNew.value ? emptyMaterial : apiMaterial.value,
);

const materialDraft = reactive<MaterialDraft>(createDraft(emptyMaterial));

watch(
  sourceMaterial,
  (material) => {
    if (!material) return;
    Object.assign(materialDraft, createDraft(material));
  },
  { immediate: true },
);

watch(
  () => route.fullPath,
  () => {
    void loadMaterial();
  },
  { immediate: true },
);

const currentMaterial = computed(() => (sourceMaterial.value ? materialDraft : undefined));
const pageHeading = computed(() => {
  if (isNew.value) return '新建物料';
  if (isEdit.value) return '编辑物料';
  return '物料详情';
});

const readonly = computed(() => isDetail.value || !canWriteMasterData.value);
const { isDirty, resetUnsavedChanges } = useUnsavedChangesGuard(() => materialDraft, {
  enabled: computed(() => !readonly.value),
  ready: computed(() => !isLoading.value),
});
const masterSaveActionTitle = computed(() => {
  if (isSaving.value) return '正在保存，请稍候';
  return canWriteMasterData.value ? '保存资料，保存后会同步到业务候选列表。' : masterDataReadonlyReason.value;
});
const referenceTitle = computed(() => `物料 ${materialDraft.code || ''}`.trim());
const referenceSubtitle = computed(() => `${materialDraft.name || '—'} · ${materialDraft.status}`);
const referencePath = computed(() =>
  materialDraft.code && materialDraft.code !== '系统自动生成' ? `/master-data/materials/${encodeURIComponent(materialDraft.code)}` : '',
);
const statusTip = computed(() =>
  materialDraft.status === '停用'
    ? '停用只限制新增业务引用，历史单据和库存记录仍然保留。'
    : '启用只表示资料可被新增业务引用；可销售、可采购和可产出分别控制具体场景。',
);
const materialDefaultWarehouseText = computed(() =>
  materialDraft.defaultWarehouse || '—',
);
const materialBatchText = computed(() =>
  materialDraft.batchControl === '不追踪批次' ? '不追踪' : '按批次',
);
const materialShelfLifeText = computed(() =>
  materialDraft.shelfLifeApplicable ? materialDraft.shelfLife : '无效期要求',
);
const shelfLifeMode = computed({
  get: () => (materialDraft.shelfLifeApplicable ? '适用' : '无效期要求'),
  set: (value: string) => {
    materialDraft.shelfLifeApplicable = value === '适用';
    if (!materialDraft.shelfLifeApplicable) {
      materialDraft.shelfLifeMonths = '';
      materialDraft.shelfLife = '无效期要求';
    }
  },
});

function createDraft(material: MasterDataRecord): MaterialDraft {
  const category = normalizeCategory(material.category ?? material.type);
  const shelfLifeMonths = parseShelfLifeMonths(material.shelfLife);
  const batchControl = material.batchControl === '按卷管理'
    ? '批次管理'
    : material.batchControl || emptyMaterial.batchControl;

  return {
    ...material,
    type: category,
    category,
    batchControl,
    status: material.status === '停用' ? '停用' : '启用',
    isSaleable: material.isSaleable ?? category === '成品',
    isPurchasable: material.isPurchasable ?? ['采购', '采购+自制'].includes(material.supplyStrategy || ''),
    isProducible: material.isProducible ?? ['自制', '采购+自制', '委外'].includes(material.supplyStrategy || ''),
    supplyStrategy: material.supplyStrategy || '',
    defaultWarehouse: material.defaultWarehouse || '',
    purchaseLeadTimeDays: String(material.purchaseLeadTimeDays ?? ''),
    productionLeadTimeDays: String(material.productionLeadTimeDays ?? ''),
    safetyStock: String(material.safetyStock ?? ''),
    reorderPoint: String(material.reorderPoint ?? ''),
    incomingQualityControl: material.incomingQualityControl || material.qualityControl || '免检',
    inboundQualityControl: material.inboundQualityControl || material.qualityControl || '免检',
    shelfLifeApplicable: Boolean(shelfLifeMonths),
    shelfLifeMonths,
    shelfLife: shelfLifeMonths ? `${shelfLifeMonths}个月` : '无效期要求',
  };
}

function normalizeCategory(category?: string) {
  if (category === '原材料') return '原料';
  if (category && materialCategories.includes(category)) return category;
  return '成品';
}

function parseShelfLifeMonths(value?: string) {
  if (!value || value === '不适用' || value === '无保质期' || value === '无效期要求') return '';
  const matched = value.match(/\d+/);
  return matched?.[0] ?? '';
}

async function loadMaterial() {
  const requestId = ++materialLoadRequestId;
  const targetIsNew = isNew.value;
  const targetCode = materialCode.value;
  loadMessage.value = '';
  apiMaterial.value = null;
  materialSupplierRelations.value = [];
  warehouseMaterialSettings.value = [];
  isLoading.value = !targetIsNew;

  if (targetIsNew || !targetCode) {
    isLoading.value = false;
    return;
  }

  try {
    const [material, supplierRelations, replenishmentSettings] = await Promise.all([
      getMasterRecord('materials', targetCode),
      listMaterialSupplierRelations({ materialCode: targetCode }),
      listWarehouseMaterialSettings({ materialCode: targetCode }),
    ]);
    if (requestId !== materialLoadRequestId) return;
    apiMaterial.value = material;
    materialSupplierRelations.value = supplierRelations;
    warehouseMaterialSettings.value = replenishmentSettings;
  } catch (error) {
    if (requestId !== materialLoadRequestId) return;
    loadMessage.value = error instanceof Error ? error.message : '物料加载失败';
  } finally {
    if (requestId === materialLoadRequestId) isLoading.value = false;
  }
}

async function refreshMaterialPage() {
  if (!isDetail.value && isDirty.value) {
    const confirmed = await requestActionConfirmation({
      title: '放弃未保存修改？',
      message: '刷新将丢失当前物料资料中尚未保存的修改。',
      confirmLabel: '放弃并刷新',
    });
    if (!confirmed) return;
  }

  imageMessage.value = '';
  if (isNew.value) {
    Object.assign(materialDraft, createDraft(emptyMaterial));
    await nextTick();
    resetUnsavedChanges();
    return;
  }

  await loadMaterial();
  await nextTick();
  resetUnsavedChanges();
}

usePageRefresh(refreshMaterialPage);

function setSaleable(value: boolean) {
  if (readonly.value) return;
  materialDraft.isSaleable = value;
}

function setPurchasable(value: boolean) {
  if (readonly.value) return;
  materialDraft.isPurchasable = value;
  if (!value) materialDraft.incomingQualityControl = '不适用';
  if (value && materialDraft.incomingQualityControl === '不适用') materialDraft.incomingQualityControl = '需质检';
}

function setProducible(value: boolean) {
  if (readonly.value) return;
  materialDraft.isProducible = value;
  if (!value) materialDraft.inboundQualityControl = '不适用';
  if (value && materialDraft.inboundQualityControl === '不适用') materialDraft.inboundQualityControl = '需质检';
}

function syncCategory() {
  materialDraft.type = materialDraft.category ?? materialDraft.type ?? '成品';
  if (!isNew.value) return;

  const category = materialDraft.category || '成品';
  setSaleable(category === '成品');
  setPurchasable(['原料', '色母', '色粉', '辅料', '包材'].includes(category));
  setProducible(['成品', '半成品', '回料', '不良品'].includes(category));
  materialDraft.uom = category === '成品' ? '卷' : category === '包材' ? '个' : 'kg';
  materialDraft.defaultWarehouse = category === '成品'
    ? '成品仓'
    : category === '包材'
      ? '包材仓'
      : ['回料', '不良品'].includes(category)
        ? '回料与不良品区'
        : '原料仓';
}

function syncShelfLifeMonths() {
  materialDraft.shelfLife = materialDraft.shelfLifeApplicable
    ? `${materialDraft.shelfLifeMonths || 0}个月`
    : '无效期要求';
}

function chooseMaterialImage() {
  if (readonly.value) return;
  imageInput.value?.click();
}

function handleMaterialImageChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  imageMessage.value = '';
  if (!file) return;

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    imageMessage.value = '仅支持 JPG、PNG 或 WebP 图片。';
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    imageMessage.value = '图片不能超过 2MB。';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    materialDraft.imageDataUrl = typeof reader.result === 'string' ? reader.result : '';
    imageMessage.value = materialDraft.imageDataUrl ? '图片已更新，保存后生效。' : '图片读取失败，请重试。';
  };
  reader.onerror = () => {
    imageMessage.value = '图片读取失败，请重试。';
  };
  reader.readAsDataURL(file);
}

function removeMaterialImage() {
  if (readonly.value) return;
  materialDraft.imageDataUrl = '';
  imageMessage.value = '图片已移除，保存后生效。';
}

function handleUomSelect(option: ReferenceOption) {
  if (!option.code && !option.name) {
    materialDraft.uom = '';
    return;
  }
  materialDraft.uom = option.name;
}

function handleWarehouseSelect(option: ReferenceOption) {
  materialDraft.defaultWarehouse = option.name || option.code || '';
}

function toMaterialRecord(draft: MaterialDraft): MasterDataRecord {
  const record = { ...draft } as Record<string, unknown>;
  delete record.shelfLifeApplicable;
  delete record.shelfLifeMonths;

  return {
    ...(record as MasterDataRecord),
    code: draft.code && draft.code !== '系统自动生成' ? draft.code : '系统自动生成',
    type: draft.category ?? draft.type,
    supplyStrategy: draft.isPurchasable && draft.isProducible
      ? '采购+自制'
      : draft.isPurchasable
        ? '采购'
        : draft.isProducible
          ? '自制'
          : '',
    qualityControl: draft.incomingQualityControl,
    updatedAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
}

async function saveMaterial() {
  if (isSaving.value) return;
  if (!canWriteMasterData.value) {
    showSaveFeedback(masterDataReadonlyReason.value, 'error');
    return;
  }
  const passed = validateRequired([
    { label: '物料名称', value: materialDraft.name },
    { label: '分类', value: materialDraft.category },
    { label: '基础单位', value: materialDraft.uom },
  ]);

  if (!passed) return;

  if (!materialDraft.isSaleable && !materialDraft.isPurchasable && !materialDraft.isProducible) {
    showSaveFeedback('请至少选择一个业务属性', 'error');
    return;
  }

  if (materialDraft.shelfLifeApplicable && !isPositiveInteger(materialDraft.shelfLifeMonths)) {
    setRequiredErrors(['保质期（月）']);
    showSaveFeedback('保质期必须是大于 0 的整数月', 'error');
    return;
  }

  isSaving.value = true;
  try {
    const savedMaterial = await saveMasterRecord(
      'materials',
      toMaterialRecord(materialDraft),
      { create: isNew.value },
    );

    Object.assign(materialDraft, createDraft(savedMaterial));
    apiMaterial.value = savedMaterial;
    resetUnsavedChanges();
    showSaveFeedback(`${savedMaterial.name}已保存，销售和库存候选列表会同步使用`);

    await router.replace(`/master-data/materials/${encodeURIComponent(savedMaterial.code)}`);
  } catch (error) {
    showSaveFeedback(error instanceof Error ? error.message : '物料保存失败', 'error');
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="page-stack">
    <section v-if="currentMaterial" class="quote-editor material-editor" :class="{ 'is-detail-view': isDetail }">
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" to="/master-data/materials" aria-label="返回物料列表" title="返回物料列表">
            <ChevronLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ isDetail ? materialDraft.name : pageHeading }}</strong>
        </template>

        <template #actions>
          <PinReferenceButton
            v-if="isDetail && referencePath"
            class="topbar-optional-action"
            :title="referenceTitle"
            :subtitle="referenceSubtitle"
            :path="referencePath"
          />
          <RouterLink
            v-if="isDetail && canWriteMasterData"
            class="primary-action"
            :to="`/master-data/materials/${encodeURIComponent(materialDraft.code)}/edit`"
            title="编辑物料资料"
          >
            <Pencil :size="15" />
            <span>编辑</span>
          </RouterLink>
          <button v-else-if="isDetail" class="secondary-action" type="button" disabled :title="masterDataReadonlyReason">
            <Pencil :size="15" />
            <span>编辑</span>
          </button>
          <button v-if="!isDetail" class="primary-action master-save-action" type="button" :disabled="isSaving || !canWriteMasterData" :aria-busy="isSaving" :title="masterSaveActionTitle" @click="saveMaterial">
            <Save :size="15" />
            <span>{{ isSaving ? '保存中' : '保存' }}</span>
          </button>
        </template>

        <template #fallback>
          <div class="quote-editor-header">
            <div>
              <h1>{{ isDetail ? materialDraft.name : pageHeading }}</h1>
              <p v-if="loadMessage" class="section-hint">{{ loadMessage }}</p>
            </div>
          </div>
        </template>
      </PageTopbarPortal>

      <div class="quote-form-grid material-form-grid" :class="{ 'is-editing': !isDetail }">
        <div v-if="isDetail" class="quote-main-sections material-detail-content">
          <section class="form-section material-detail-section">
            <div class="form-section-head">
              <h2>基本资料</h2>
            </div>
            <dl class="material-fact-grid">
              <div>
                <dt>物料编码</dt>
                <dd>{{ materialDraft.code }}</dd>
              </div>
              <div>
                <dt>物料分类</dt>
                <dd>{{ materialDraft.category }}</dd>
              </div>
              <div>
                <dt>物料名称</dt>
                <dd>{{ materialDraft.name }}</dd>
              </div>
              <div>
                <dt>型号</dt>
                <dd>{{ materialDraft.model || '—' }}</dd>
              </div>
              <div>
                <dt>规格</dt>
                <dd>{{ materialDraft.spec || '—' }}</dd>
              </div>
              <div>
                <dt>基础单位</dt>
                <dd>{{ materialDraft.uom }}</dd>
              </div>
              <div>
                <dt>英文名称</dt>
                <dd>{{ materialDraft.englishName || '—' }}</dd>
              </div>
              <div>
                <dt>英文型号</dt>
                <dd>{{ materialDraft.englishModel || '—' }}</dd>
              </div>
              <div>
                <dt>英文规格</dt>
                <dd>{{ materialDraft.englishSpec || '—' }}</dd>
              </div>
            </dl>
          </section>

          <section class="form-section material-detail-section">
            <div class="form-section-head">
              <h2>业务、仓储与质量</h2>
            </div>
            <div class="material-rule-groups">
              <section>
                <span>业务属性</span>
                <dl>
                  <div><dt>可销售</dt><dd>{{ materialDraft.isSaleable ? '是' : '否' }}</dd></div>
                  <div><dt>可采购</dt><dd>{{ materialDraft.isPurchasable ? '是' : '否' }}</dd></div>
                  <div><dt>可产出</dt><dd>{{ materialDraft.isProducible ? '是' : '否' }}</dd></div>
                </dl>
              </section>
              <section>
                <span>仓储与追溯</span>
                <dl>
                  <div><dt>常用仓库</dt><dd>{{ materialDefaultWarehouseText }}</dd></div>
                  <div><dt>批次追踪</dt><dd>{{ materialBatchText }}</dd></div>
                  <div><dt>效期</dt><dd>{{ materialShelfLifeText }}</dd></div>
                </dl>
              </section>
              <section>
                <span>质量要求</span>
                <dl>
                  <div v-if="materialDraft.isPurchasable"><dt>到货检验</dt><dd>{{ materialDraft.incomingQualityControl }}</dd></div>
                  <div v-if="materialDraft.isProducible"><dt>完工检验</dt><dd>{{ materialDraft.inboundQualityControl }}</dd></div>
                  <div v-if="!materialDraft.isPurchasable && !materialDraft.isProducible"><dt>检验</dt><dd>无默认要求</dd></div>
                </dl>
              </section>
            </div>
          </section>

          <section v-if="materialDraft.isPurchasable && activeMaterialSupplierRelations.length" class="form-section material-detail-section">
            <div class="form-section-head">
              <h2>可供供应商</h2>
            </div>
            <p class="master-relation-guidance">
              数据来自供应商资料中的“可供物料”，当前页只读。
              <RouterLink to="/master-data/suppliers" title="前往供应商列表维护物料—供应商关系">前往供应商维护</RouterLink>
            </p>
            <div class="master-relation-table-wrap">
              <table class="master-relation-table">
                <thead><tr><th>供应商</th><th>供应商料号</th><th>起订量</th><th>供货周期</th><th>关系状态</th></tr></thead>
                <tbody>
                  <tr v-for="relation in activeMaterialSupplierRelations" :key="relation.code">
                    <td><RouterLink :to="`/master-data/suppliers/${encodeURIComponent(relation.supplierCode)}`">{{ relation.supplierName }}</RouterLink><small v-if="relation.isDefault && relation.status === '启用'">默认</small></td>
                    <td>{{ relation.supplierMaterialCode || '—' }}</td>
                    <td>{{ relation.minOrderQty }} {{ relation.baseUom }}</td>
                    <td>{{ relation.leadTimeDays }} 天</td>
                    <td><i class="mini-status" :class="statusPresentationClass(relation.status)">{{ relation.status }}</i></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section v-if="activeWarehouseMaterialSettings.length" class="form-section material-detail-section">
            <div class="form-section-head">
              <h2>仓库补货设置</h2>
            </div>
            <p class="master-relation-guidance">
              数据来自仓库资料中的“物料补货设置”，当前页只读；库存查询按这些阈值生成补货预警。
              <RouterLink to="/master-data/warehouses" title="前往仓库列表维护仓库—物料补货关系">前往仓库维护</RouterLink>
            </p>
            <div class="master-relation-table-wrap">
              <table class="master-relation-table">
                <thead><tr><th>仓库</th><th>安全库存</th><th>补货点</th><th>最高库存</th><th>补货批量</th></tr></thead>
                <tbody>
                  <tr v-for="setting in activeWarehouseMaterialSettings" :key="setting.code">
                    <td><RouterLink :to="`/master-data/warehouses/${encodeURIComponent(setting.warehouseCode)}`">{{ setting.warehouseName }}</RouterLink></td>
                    <td>{{ setting.safetyStock }} {{ setting.uom }}</td>
                    <td>{{ setting.reorderPoint }} {{ setting.uom }}</td>
                    <td>{{ setting.maxStock }} {{ setting.uom }}</td>
                    <td>{{ setting.replenishmentLot }} {{ setting.uom }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section v-if="materialDraft.note" class="form-section material-detail-section">
            <div class="form-section-head">
              <h2>使用说明</h2>
            </div>
            <p class="material-note-copy">{{ materialDraft.note }}</p>
          </section>
        </div>

        <div v-else class="quote-main-sections">
          <section class="form-section">
            <div class="form-section-head">
              <h2>基本资料</h2>
            </div>

            <div class="material-basic-editor-layout">
              <div class="material-image-editor">
                <span class="material-image-field-label">物料图片</span>
                <div class="material-image-upload-preview">
                  <img v-if="materialDraft.imageDataUrl" :src="materialDraft.imageDataUrl" :alt="materialDraft.name || '物料图片'" />
                  <span v-else>{{ materialDraft.imageLabel ?? 'IMG' }}</span>
                </div>
                <div class="material-image-actions">
                  <button class="secondary-action compact-action" type="button" title="选择物料图片" @click="chooseMaterialImage">
                    <ImagePlus :size="15" />
                    {{ materialDraft.imageDataUrl ? '更换' : '选择图片' }}
                  </button>
                  <button v-if="materialDraft.imageDataUrl" class="secondary-action compact-action material-image-remove-action" type="button" title="移除物料图片" @click="removeMaterialImage">
                    <Trash2 :size="14" />
                    移除
                  </button>
                </div>
                <input ref="imageInput" class="material-image-input" type="file" accept="image/jpeg,image/png,image/webp" @change="handleMaterialImageChange" />
                <small class="material-image-help" :class="{ changed: imageMessage }" role="status">{{ imageMessage || 'JPG / PNG / WebP，≤ 2MB' }}</small>
              </div>

              <div class="quote-fields">
                <label class="form-field">
                  <span>编码</span>
                  <input
                    v-model="materialDraft.code"
                    readonly
                    placeholder="按分类自动生成"
                  />
                </label>
                <label class="form-field" :class="requiredFieldClass('分类', materialDraft.category)">
                  <span>分类</span>
                  <select
                    v-model="materialDraft.category"
                    :disabled="readonly || !isNew"
                    @change="syncCategory"
                  >
                    <option v-for="category in materialCategories" :key="category">{{ category }}</option>
                  </select>
                </label>
                <label class="form-field" :class="requiredFieldClass('物料名称', materialDraft.name)">
                  <span>名称</span>
                  <input v-model="materialDraft.name" :readonly="readonly" placeholder="填写物料名称" />
                </label>
                <label class="form-field">
                  <span>型号</span>
                  <input v-model="materialDraft.model" :readonly="readonly" placeholder="填写型号" />
                </label>
                <label class="form-field">
                  <span>规格</span>
                  <input v-model="materialDraft.spec" :readonly="readonly" placeholder="填写规格" />
                </label>
                <label class="form-field" :class="requiredFieldClass('基础单位', materialDraft.uom)">
                  <span>基础单位</span>
                  <ReferencePicker
                    required
                    v-model="materialDraft.uom"
                    :display-value="materialDraft.uom"
                    type="uom"
                    title="选择计量单位"
                    placeholder="选择计量单位"
                    search-placeholder="搜索单位编码或名称"
                    :disabled="readonly || !isNew"
                    @select="handleUomSelect"
                  />
                </label>
                <label class="form-field">
                  <span>英文名称</span>
                  <input v-model="materialDraft.englishName" :readonly="readonly" placeholder="选填，记录物料英文名称" />
                </label>
                <label class="form-field">
                  <span>英文型号</span>
                  <input v-model="materialDraft.englishModel" :readonly="readonly" placeholder="选填，记录物料英文型号" />
                </label>
                <label class="form-field">
                  <span>英文规格</span>
                  <input v-model="materialDraft.englishSpec" :readonly="readonly" placeholder="选填，记录物料英文规格" />
                </label>
                <label class="form-field">
                  <span>使用状态</span>
                  <select v-model="materialDraft.status" :disabled="readonly">
                    <option>启用</option>
                    <option>停用</option>
                  </select>
                </label>
                <div class="master-field-notes">
                  <small v-if="!isNew" class="field-help">分类决定物料编码，已有物料不可直接修改。</small>
                  <small v-if="!isNew" class="field-help">基础单位决定库存和单据数量口径，已有物料不可直接修改。</small>
                  <small class="field-help">停用前必须清理库存、占用和在途；保存停用时会同步停用供货与补货关系。</small>
                </div>
              </div>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <h2>业务与管理</h2>
            </div>

            <div class="material-purpose-field">
              <span class="material-purpose-label">业务属性</span>
              <div class="material-purpose-grid">
                <button type="button" :class="{ active: materialDraft.isSaleable }" :aria-pressed="materialDraft.isSaleable" :disabled="readonly" title="控制是否出现在销售选品中" @click="setSaleable(!materialDraft.isSaleable)">
                  <strong>可销售</strong>
                  <span>{{ materialDraft.isSaleable ? '已选' : '未选' }}</span>
                </button>
                <button type="button" :class="{ active: materialDraft.isPurchasable }" :aria-pressed="materialDraft.isPurchasable" :disabled="readonly" title="控制是否出现在采购选品中" @click="setPurchasable(!materialDraft.isPurchasable)">
                  <strong>可采购</strong>
                  <span>{{ materialDraft.isPurchasable ? '已选' : '未选' }}</span>
                </button>
                <button type="button" :class="{ active: materialDraft.isProducible }" :aria-pressed="materialDraft.isProducible" :disabled="readonly" title="控制是否可作为生产产出物料" @click="setProducible(!materialDraft.isProducible)">
                  <strong>可产出</strong>
                  <span>{{ materialDraft.isProducible ? '已选' : '未选' }}</span>
                </button>
              </div>
            </div>

            <div class="quote-fields">
              <label class="form-field">
                <span>常用仓库</span>
                <ReferencePicker
                  v-model="materialDraft.defaultWarehouse"
                  :display-value="materialDraft.defaultWarehouse"
                  type="warehouses"
                  title="选择常用仓库"
                  placeholder="选择常用仓库"
                  search-placeholder="搜索仓库编码或名称"
                  :disabled="readonly"
                  @select="handleWarehouseSelect"
                />
              </label>
              <label class="form-field">
                <span>批次追踪</span>
                <select v-model="materialDraft.batchControl" :disabled="readonly">
                  <option value="批次管理">按批次</option>
                  <option value="不追踪批次">不追踪</option>
                </select>
              </label>
              <label class="form-field">
                <span>效期</span>
                <select v-model="shelfLifeMode" :disabled="readonly">
                  <option>无效期要求</option>
                  <option>适用</option>
                </select>
              </label>
              <label class="form-field" :class="materialDraft.shelfLifeApplicable ? requiredFieldClass('保质期（月）', materialDraft.shelfLifeMonths) : {}">
                <span>保质期（月）</span>
                <input
                  v-model="materialDraft.shelfLifeMonths"
                  type="number"
                  min="1"
                  :readonly="readonly || !materialDraft.shelfLifeApplicable"
                  :disabled="!materialDraft.shelfLifeApplicable"
                  placeholder="填写月份"
                  @input="syncShelfLifeMonths"
                />
              </label>
              <label v-if="materialDraft.isPurchasable" class="form-field">
                <span>到货检验</span>
                <select v-model="materialDraft.incomingQualityControl" :disabled="readonly">
                  <option>需质检</option>
                  <option>抽检</option>
                  <option>免检</option>
                  <option>不适用</option>
                </select>
              </label>
              <label v-if="materialDraft.isProducible" class="form-field">
                <span>完工检验</span>
                <select v-model="materialDraft.inboundQualityControl" :disabled="readonly">
                  <option>需质检</option>
                  <option>抽检</option>
                  <option>免检</option>
                  <option>不适用</option>
                </select>
              </label>
              <label class="form-field field-wide">
                <span>备注</span>
                <textarea v-model="materialDraft.note" :readonly="readonly" placeholder="填写物料使用说明、特殊要求等" />
              </label>
            </div>
          </section>
        </div>

        <aside v-if="isDetail" class="quote-summary-panel material-side-panel">
          <section class="summary-section">
            <div class="summary-title">
              <h2>物料图片</h2>
            </div>
            <div class="material-image-card">
              <div class="material-image-preview">
                <img v-if="materialDraft.imageDataUrl" :src="materialDraft.imageDataUrl" :alt="materialDraft.name || '物料图片'" />
                <span v-else>{{ materialDraft.imageLabel ?? 'IMG' }}</span>
              </div>
            </div>
          </section>

          <section class="summary-section material-status-section">
            <div class="summary-title">
              <ClipboardList :size="17" />
              <h2>使用状态</h2>
            </div>
            <div class="material-rule-card" :class="{ warn: materialDraft.status === '停用' }">
              <strong>{{ materialDraft.status === '停用' ? '已停用' : '可使用' }}</strong>
              <span>{{ statusTip }}</span>
            </div>
          </section>
        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      title="物料"
      :message="loadMessage || '物料不存在'"
      back-path="/master-data/materials"
      back-label="返回物料列表"
      @retry="loadMaterial"
    />
    <div v-if="saveMessage" class="app-toast" :class="{ error: saveTone === 'error' }" :role="saveTone === 'error' ? 'alert' : 'status'" :aria-live="saveTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ saveMessage }}</div>
  </div>
</template>
