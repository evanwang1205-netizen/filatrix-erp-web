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
  listReference,
  listMaterialSupplierRelations,
  saveMasterRecord,
  saveMaterialSupplierRelations,
  type MaterialSupplierRelation,
} from '../services/api';
import type { ReferenceOption } from '../types/business';
import { isNonNegativeInteger, isValidOptionalEmail } from '../utils/masterInputValidation';
import { statusPresentationClass } from '../utils/statusPresentation';

const route = useRoute();
const router = useRouter();
const { saveMessage, saveTone, validateRequired, showSaveFeedback, requiredFieldClass, setRequiredErrors } = useMasterSaveFeedback();
const { canWrite: canWriteMasterData, readonlyReason: masterDataReadonlyReason } = useModulePermission('masterData');

type SupplierProfile = {
  contact: string;
  phone: string;
  email: string;
  regionType: string;
  province: string;
  city: string;
  address: string;
  invoiceTitle: string;
  taxNumber: string;
  registeredAddress: string;
  invoicePhone: string;
  bankName: string;
  bankAccount: string;
  deliveryMethod: string;
  paymentMethod: string;
  paymentTermDays: string | number;
  currency: string;
  taxRate: string;
};

type SupplierDraft = MasterDataRecord & SupplierProfile;

function todayText() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const emptySupplier: MasterDataRecord = {
  code: '系统自动生成',
  name: '',
  type: '树脂原料供应商',
  primary: '',
  secondary: '',
  owner: '',
  status: '启用',
  updatedAt: todayText(),
  attachments: 0,
  note: '',
};

const defaultProfile: SupplierProfile = {
  contact: '',
  phone: '',
  email: '',
  regionType: '国内',
  province: '',
  city: '',
  address: '',
  invoiceTitle: '',
  taxNumber: '',
  registeredAddress: '',
  invoicePhone: '',
  bankName: '',
  bankAccount: '',
  deliveryMethod: '送货到厂',
  paymentMethod: '月结',
  paymentTermDays: 30,
  currency: 'CNY',
  taxRate: '13%',
};

const supplierTypes = [
  '树脂原料供应商',
  '色母助剂供应商',
  '包材供应商',
  '设备供应商',
  '外协加工',
  '设备/备件供应商',
  '物流服务',
  '综合供应商',
  '网店',
];
const materialRelationUnsupportedSupplierTypes = new Set(['设备供应商', '物流服务']);

function supplierSupportsMaterialRelations(type?: string) {
  return !materialRelationUnsupportedSupplierTypes.has(String(type || '').trim());
}

const deliveryMethodOptions = ['送货到厂', '本厂自提', '供应商直送', '物流到厂', '快递快运', '供应商送货安装'];
const paymentMethodOptions = ['月结', '到票付款', '货到付款', '预付 30%', '验收后付款'];
const taxRateOptions = ['13%', '9%', '6%', '3%', '1%', '0%', '免税'];

const routeName = computed(() => route.name?.toString() ?? '');
const isNew = computed(() => routeName.value === 'master-supplier-new');
const isEdit = computed(() => routeName.value === 'master-supplier-edit');
const isDetail = computed(() => routeName.value === 'master-supplier-detail');
const supplierCode = computed(() => route.params.code?.toString() ?? '');
const apiSupplier = ref<MasterDataRecord | null>(null);
const loadMessage = ref('');
const currencyLoadError = ref('');
const isLoading = ref(false);
const isSaving = ref(false);
const currencyRows = ref<ReferenceOption<MasterDataRecord>[]>([]);
let supplierLoadRequestId = 0;
const materialRelations = ref<MaterialSupplierRelation[]>([]);
const relationDrafts = ref<MaterialSupplierRelation[]>([]);

const sourceSupplier = computed(() =>
  isNew.value ? emptySupplier : apiSupplier.value,
);

const supplierDraft = reactive<SupplierDraft>(createDraft(emptySupplier));
const CUSTOM_CITY_OPTION = '__custom_city__';
const customCity = ref('');
const isCustomCityMode = ref(false);

watch(
  sourceSupplier,
  (supplier) => {
    if (!supplier) return;
    Object.assign(supplierDraft, createDraft(supplier));
  },
  { immediate: true },
);

watch(
  () => route.fullPath,
  () => {
    void loadSupplier();
  },
  { immediate: true },
);

watch(
  () => supplierDraft.regionType,
  (regionType) => {
    if (regionType === '海外') {
      supplierDraft.province = '';
      supplierDraft.city = '';
      customCity.value = '';
      isCustomCityMode.value = false;
    }
  },
);

watch(
  () => supplierDraft.province,
  (province) => {
    if (!province) {
      supplierDraft.city = '';
      customCity.value = '';
      isCustomCityMode.value = false;
    }
  },
);

watch(
  () => supplierDraft.paymentMethod,
  (paymentMethod) => {
    if (paymentMethod !== '月结') {
      supplierDraft.paymentTermDays = 0;
    } else if (!Number(supplierDraft.paymentTermDays)) {
      supplierDraft.paymentTermDays = 30;
    }
  },
);

watch(
  () => supplierDraft.status,
  (status) => {
    if (status !== '停用') return;
    relationDrafts.value.forEach((relation) => {
      relation.status = '停用';
    });
  },
);

const currentSupplier = computed(() => (sourceSupplier.value ? supplierDraft : undefined));
const readonly = computed(() => isDetail.value || !canWriteMasterData.value);
const { isDirty, resetUnsavedChanges } = useUnsavedChangesGuard(
  () => ({ supplier: supplierDraft, relations: relationDrafts.value }),
  {
    enabled: computed(() => !readonly.value),
    ready: computed(() => !isLoading.value),
  },
);
const masterSaveActionTitle = computed(() => {
  if (isSaving.value) return '正在保存，请稍候';
  return canWriteMasterData.value ? '保存资料，保存后会同步到业务候选列表。' : masterDataReadonlyReason.value;
});
const isDomesticSupplier = computed(() => supplierDraft.regionType === '国内');
const cityOptions = computed(() => cityOptionsMap[supplierDraft.province] ?? []);
const citySelectValue = computed({
  get: () => {
    if (isCustomCityMode.value) return CUSTOM_CITY_OPTION;
    if (!supplierDraft.city) return '';
    return cityOptions.value.includes(supplierDraft.city) ? supplierDraft.city : CUSTOM_CITY_OPTION;
  },
  set: (value: string) => {
    if (value === CUSTOM_CITY_OPTION) {
      isCustomCityMode.value = true;
      customCity.value = cityOptions.value.includes(supplierDraft.city) ? '' : supplierDraft.city;
      supplierDraft.city = customCity.value;
      return;
    }

    isCustomCityMode.value = false;
    customCity.value = '';
    supplierDraft.city = value;
  },
});
const showCustomCityInput = computed(() => isDomesticSupplier.value && citySelectValue.value === CUSTOM_CITY_OPTION);
const pageHeading = computed(() => {
  if (isNew.value) return '新建供应商';
  if (isEdit.value) return '编辑供应商';
  return '供应商详情';
});
const referenceTitle = computed(() => `供应商 ${supplierDraft.code || ''}`.trim());
const referenceSubtitle = computed(() => `${supplierDraft.name || '未命名'} · ${supplierDraft.status}`);
const referencePath = computed(() =>
  supplierDraft.code && supplierDraft.code !== '系统自动生成' ? `/master-data/suppliers/${encodeURIComponent(supplierDraft.code)}` : '',
);
const statusTip = computed(() =>
  supplierDraft.status === '停用'
    ? '停用后不能被新采购单据选择，历史单据仍保留原有供应商信息。'
    : '新采购单据会带入当前联系、交付、结算和开票默认值；已保存单据不随主数据变化。',
);
const supplierCompanyAddressText = computed(() =>
  supplierDraft.regionType === '海外'
    ? supplierDraft.address || '—'
    : [supplierDraft.province, supplierDraft.city, supplierDraft.address].filter(Boolean).join('') || '—',
);
const supplierCompanyRegionText = computed(() =>
  supplierDraft.regionType === '海外'
    ? '海外'
    : [supplierDraft.province, supplierDraft.city].filter(Boolean).join(' / ') || '—',
);
const paymentTermText = computed(() =>
  supplierDraft.paymentMethod === '月结' ? `${supplierDraft.paymentTermDays || 0} 天` : '不适用',
);
const currencyOptions = computed(() => {
  const codes = currencyRows.value
    .filter((row) => row.status !== '停用')
    .map((row) => row.code)
    .filter(Boolean);
  if (supplierDraft.currency && !codes.includes(supplierDraft.currency)) codes.unshift(supplierDraft.currency);
  return codes.length ? codes : ['CNY'];
});
const usesMaterialSupplyRelations = computed(() =>
  supplierSupportsMaterialRelations(supplierDraft.type),
);
const hasActiveMaterialSupplyRelation = computed(() =>
  materialRelations.value.some((relation) => relation.status === '启用'),
);
const supplierProfileChecks = computed(() => [
  { label: '主要联系人', complete: Boolean(supplierDraft.contact && supplierDraft.phone) },
  ...(usesMaterialSupplyRelations.value
    ? [{ label: '可供物料', complete: hasActiveMaterialSupplyRelation.value }]
    : []),
  {
    label: '采购默认值',
    complete: Boolean(supplierDraft.deliveryMethod && supplierDraft.paymentMethod && supplierDraft.currency),
  },
]);
const supplierProfileSummary = computed(() => {
  const missingItems = supplierProfileChecks.value.filter((item) => !item.complete);
  return missingItems.length
    ? missingItems
    : [{ label: '关键资料', complete: true }];
});

function createDraft(supplier: MasterDataRecord): SupplierDraft {
  const draft = {
    ...defaultProfile,
    ...supplier,
    status: supplier.status === '停用' ? '停用' : '启用',
  };

  return {
    ...draft,
    owner: '',
    manager: '',
    registeredAddress: draft.registeredAddress || '',
    taxRate: draft.taxRate || supplier.taxMode || defaultProfile.taxRate,
  };
}

async function loadSupplierCurrencyReferences(requestId = supplierLoadRequestId) {
  try {
    const currencies = await listReference<MasterDataRecord>('currencies', { activeOnly: true, limit: 50 });
    if (requestId !== supplierLoadRequestId) return;
    currencyRows.value = currencies.items;
    currencyLoadError.value = '';
  } catch (error) {
    if (requestId !== supplierLoadRequestId) return;
    currencyRows.value = [];
    currencyLoadError.value = error instanceof Error ? error.message : '币种候选加载失败';
  }
}

async function loadSupplier() {
  const requestId = ++supplierLoadRequestId;
  const targetIsNew = isNew.value;
  const targetCode = supplierCode.value;
  loadMessage.value = '';
  apiSupplier.value = null;
  materialRelations.value = [];
  relationDrafts.value = [];
  isLoading.value = !targetIsNew;
  await loadSupplierCurrencyReferences(requestId);

  if (targetIsNew || !targetCode) {
    isLoading.value = false;
    return;
  }

  try {
    const [supplier, relations] = await Promise.all([
      getMasterRecord('suppliers', targetCode),
      listMaterialSupplierRelations({ supplierCode: targetCode }),
    ]);
    if (requestId !== supplierLoadRequestId) return;
    apiSupplier.value = supplier;
    materialRelations.value = relations;
    relationDrafts.value = relations.map((relation) => ({
      ...relation,
      status: supplier.status === '停用' ? '停用' : relation.status,
    }));
  } catch (error) {
    if (requestId !== supplierLoadRequestId) return;
    loadMessage.value = error instanceof Error ? error.message : '供应商加载失败';
  } finally {
    if (requestId === supplierLoadRequestId) isLoading.value = false;
  }
}

async function refreshSupplierPage() {
  if (!isDetail.value && isDirty.value) {
    const confirmed = await requestActionConfirmation({
      title: '放弃未保存修改？',
      message: '刷新将丢失当前供应商资料中尚未保存的修改。',
      confirmLabel: '放弃并刷新',
    });
    if (!confirmed) return;
  }

  if (isNew.value) {
    Object.assign(supplierDraft, createDraft(emptySupplier));
    await nextTick();
    resetUnsavedChanges();
    return;
  }

  await loadSupplier();
  await nextTick();
  resetUnsavedChanges();
}

usePageRefresh(refreshSupplierPage);

watch(
  () => supplierDraft.city,
  (city) => {
    if (!city) {
      customCity.value = '';
      return;
    }

    if (!cityOptions.value.includes(city)) {
      customCity.value = city;
      isCustomCityMode.value = true;
    }
  },
  { immediate: true },
);

function handleCustomCityInput(event: Event) {
  const target = event.target as HTMLInputElement;
  customCity.value = target.value;
  supplierDraft.city = target.value;
}

function addSupplierMaterialRelation() {
  relationDrafts.value.push({
    code: `NEW-${Date.now()}-${relationDrafts.value.length + 1}`,
    supplierCode: supplierDraft.code === '系统自动生成' ? '' : supplierDraft.code,
    supplierName: supplierDraft.name,
    materialCode: '',
    materialName: '',
    supplierMaterialCode: '',
    baseUom: '',
    minOrderQty: 1,
    leadTimeDays: 0,
    isDefault: false,
    status: '启用',
  });
}

function handleSupplierMaterialSelect(relation: MaterialSupplierRelation, option: ReferenceOption) {
  const duplicated = relationDrafts.value.some(
    (candidate) => candidate !== relation && candidate.materialCode === option.code,
  );
  if (duplicated) {
    showSaveFeedback('同一供应商不能重复维护同一物料', 'error');
    return;
  }

  const raw = option.raw as MasterDataRecord;
  relation.materialCode = option.code;
  relation.materialName = option.name;
  relation.baseUom = raw.uom || '';
  if (!relation.supplierMaterialCode) relation.supplierMaterialCode = raw.model || '';
}

function removeNewSupplierMaterialRelation(index: number) {
  const relation = relationDrafts.value[index];
  if (!relation?.code.startsWith('NEW-')) return;
  relationDrafts.value.splice(index, 1);
}

function validateSupplierRelations() {
  const seenMaterials = new Set<string>();
  for (const relation of relationDrafts.value) {
    if (!relation.materialCode) return '请选择可供物料';
    if (seenMaterials.has(relation.materialCode)) return '同一供应商不能重复维护同一物料';
    seenMaterials.add(relation.materialCode);
    if (!Number.isFinite(Number(relation.minOrderQty)) || Number(relation.minOrderQty) <= 0) {
      return `${relation.materialName || relation.materialCode}的起订量必须大于 0`;
    }
    if (!isNonNegativeInteger(relation.leadTimeDays)) {
      return `${relation.materialName || relation.materialCode}的供货周期必须是大于或等于 0 的整数天`;
    }
  }
  return '';
}

async function saveSupplier() {
  if (isSaving.value) return;
  if (!canWriteMasterData.value) {
    showSaveFeedback(masterDataReadonlyReason.value, 'error');
    return;
  }
  const passed = validateRequired([
    { label: '供应商名称', value: supplierDraft.name },
    { label: '联系人', value: supplierDraft.contact },
    { label: '联系方式', value: supplierDraft.phone },
  ]);

  if (!passed) return;

  if (!isValidOptionalEmail(supplierDraft.email)) {
    showSaveFeedback('请填写有效的供应商邮箱', 'error');
    return;
  }
  if (!isNonNegativeInteger(supplierDraft.paymentTermDays || 0)) {
    showSaveFeedback('付款期限必须是大于或等于 0 的整数天', 'error');
    return;
  }

  const relationError = usesMaterialSupplyRelations.value ? validateSupplierRelations() : '';
  if (relationError) {
    showSaveFeedback(relationError, 'error');
    return;
  }

  if (isDomesticSupplier.value && supplierDraft.province && !supplierDraft.city) {
    setRequiredErrors(['城市']);
    showSaveFeedback('选择省份后请补充城市', 'error');
    return;
  }

  isSaving.value = true;
  try {
    const shouldCreateSupplier = isNew.value
      && !apiSupplier.value
      && supplierDraft.code === '系统自动生成';
    const savedSupplier = await saveMasterRecord(
      'suppliers',
      {
        ...supplierDraft,
        updatedAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10),
      },
      { create: shouldCreateSupplier },
    );

    Object.assign(supplierDraft, createDraft(savedSupplier));
    apiSupplier.value = savedSupplier;
    let savedRelations: MaterialSupplierRelation[];
    try {
      const relationsToSave = relationDrafts.value.filter(
        (relation) => usesMaterialSupplyRelations.value || !relation.code.startsWith('NEW-'),
      );
      savedRelations = await saveMaterialSupplierRelations(
        savedSupplier.code,
        relationsToSave.map((relation) => ({
          ...relation,
          supplierCode: savedSupplier.code,
          supplierName: savedSupplier.name,
          minOrderQty: Number(relation.minOrderQty),
          leadTimeDays: Number(relation.leadTimeDays),
          isDefault: savedSupplier.status === '停用' || !supplierSupportsMaterialRelations(savedSupplier.type)
            ? false
            : relation.isDefault,
          status: savedSupplier.status === '停用' || !supplierSupportsMaterialRelations(savedSupplier.type)
            ? '停用'
            : relation.status,
        })),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : '可供物料保存失败';
      showSaveFeedback(`供应商基本资料已保存，但可供物料尚未保存：${reason}。请修正后再次保存。`, 'error');
      return;
    }

    materialRelations.value = savedRelations;
    relationDrafts.value = savedRelations.map((relation) => ({ ...relation }));
    resetUnsavedChanges();
    showSaveFeedback(`${savedSupplier.name}已保存，采购单据候选列表会同步使用`);

    await router.replace(`/master-data/suppliers/${encodeURIComponent(savedSupplier.code)}`);
  } catch (error) {
    showSaveFeedback(error instanceof Error ? error.message : '供应商保存失败', 'error');
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="page-stack">
    <section v-if="currentSupplier" class="quote-editor supplier-editor" :class="{ 'is-detail-view': isDetail }">
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" to="/master-data/suppliers" aria-label="返回供应商列表" title="返回供应商列表">
            <ChevronLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ isDetail ? supplierDraft.name : pageHeading }}</strong>
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
            :to="`/master-data/suppliers/${encodeURIComponent(supplierDraft.code)}/edit`"
            title="编辑供应商资料"
          >
            <Pencil :size="15" />
            <span>编辑</span>
          </RouterLink>
          <button v-else-if="isDetail" class="secondary-action" type="button" disabled :title="masterDataReadonlyReason">
            <Pencil :size="15" />
            <span>编辑</span>
          </button>
          <button v-if="!isDetail" class="primary-action master-save-action" type="button" :disabled="isSaving || !canWriteMasterData" :aria-busy="isSaving" :title="masterSaveActionTitle" @click="saveSupplier">
            <Save :size="15" />
            <span>{{ isSaving ? '保存中' : '保存' }}</span>
          </button>
        </template>

        <template #fallback>
          <div class="quote-editor-header">
            <div>
              <h1>{{ isDetail ? supplierDraft.name : pageHeading }}</h1>
              <p v-if="loadMessage" class="section-hint">{{ loadMessage }}</p>
            </div>
          </div>
        </template>
      </PageTopbarPortal>

      <section v-if="currencyLoadError" class="access-denied-banner reference-load-warning" role="alert">
        <strong>币种候选加载失败</strong>
        <span>{{ currencyLoadError }}。当前保留供应商已有币种；重试成功后可选择其他启用币种。</span>
        <div class="access-denied-actions">
          <button type="button" class="notice-refresh-button" @click="loadSupplierCurrencyReferences()">重试加载币种</button>
        </div>
      </section>

      <div class="quote-form-grid supplier-form-grid" :class="{ 'is-editing': !isDetail }">
        <div v-if="isDetail" class="quote-main-sections supplier-detail-content">
          <section class="form-section material-detail-section supplier-detail-section">
            <div class="form-section-head">
              <h2>基本资料</h2>
            </div>
            <dl class="material-fact-grid supplier-fact-grid">
              <div><dt>供应商编码</dt><dd>{{ supplierDraft.code }}</dd></div>
              <div><dt>供应商名称</dt><dd>{{ supplierDraft.name }}</dd></div>
              <div><dt>供应商类型</dt><dd>{{ supplierDraft.type }}</dd></div>
            </dl>
          </section>

          <section class="form-section material-detail-section supplier-detail-section">
            <div class="form-section-head">
              <h2>公司联系与地址</h2>
            </div>
            <div class="material-rule-groups supplier-info-groups">
              <section>
                <span>主要联系人</span>
                <dl>
                  <div><dt>联系人</dt><dd>{{ supplierDraft.contact || '—' }}</dd></div>
                  <div><dt>联系方式</dt><dd>{{ supplierDraft.phone || '—' }}</dd></div>
                  <div><dt>邮箱</dt><dd>{{ supplierDraft.email || '—' }}</dd></div>
                </dl>
              </section>
              <section>
                <span>公司地址</span>
                <dl>
                  <div><dt>地区</dt><dd>{{ supplierCompanyRegionText }}</dd></div>
                  <div><dt>详细地址</dt><dd>{{ supplierCompanyAddressText }}</dd></div>
                </dl>
              </section>
            </div>
          </section>

          <section v-if="usesMaterialSupplyRelations" class="form-section material-detail-section supplier-detail-section">
            <div class="form-section-head">
              <h2>可供物料</h2>
            </div>
            <div v-if="materialRelations.length" class="master-relation-table-wrap">
              <table class="master-relation-table">
                <thead><tr><th>物料</th><th>供应商料号</th><th>起订量</th><th>供货周期</th><th>关系状态</th></tr></thead>
                <tbody>
                  <tr v-for="relation in materialRelations" :key="relation.code">
                    <td><RouterLink :to="`/master-data/materials/${encodeURIComponent(relation.materialCode)}`">{{ relation.materialName }}</RouterLink><small v-if="relation.isDefault && relation.status === '启用'">默认</small></td>
                    <td>{{ relation.supplierMaterialCode || '—' }}</td>
                    <td>{{ relation.minOrderQty }} {{ relation.baseUom }}</td>
                    <td>{{ relation.leadTimeDays }} 天</td>
                    <td><i class="mini-status" :class="statusPresentationClass(relation.status)">{{ relation.status }}</i></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="master-relation-empty">尚未建立物料—供应商关系。</p>
          </section>

          <section class="form-section material-detail-section supplier-detail-section">
            <div class="form-section-head">
              <h2>采购默认值</h2>
            </div>
            <dl class="material-fact-grid supplier-purchase-fact-grid">
              <div><dt>交付方式</dt><dd>{{ supplierDraft.deliveryMethod }}</dd></div>
              <div><dt>付款方式</dt><dd>{{ supplierDraft.paymentMethod }}</dd></div>
              <div><dt>账期</dt><dd>{{ paymentTermText }}</dd></div>
              <div><dt>结算币种</dt><dd>{{ supplierDraft.currency }}</dd></div>
              <div><dt>税率</dt><dd>{{ supplierDraft.taxRate }}</dd></div>
            </dl>
          </section>

          <section class="form-section material-detail-section supplier-detail-section">
            <div class="form-section-head">
              <h2>开票与收款资料</h2>
            </div>
            <dl class="material-fact-grid supplier-fact-grid">
              <div><dt>开票抬头</dt><dd>{{ supplierDraft.invoiceTitle || '—' }}</dd></div>
              <div><dt>税号</dt><dd>{{ supplierDraft.taxNumber || '—' }}</dd></div>
              <div><dt>开票电话</dt><dd>{{ supplierDraft.invoicePhone || '—' }}</dd></div>
              <div><dt>注册地址</dt><dd>{{ supplierDraft.registeredAddress || '—' }}</dd></div>
              <div><dt>开户行</dt><dd>{{ supplierDraft.bankName || '—' }}</dd></div>
              <div><dt>银行账号</dt><dd>{{ supplierDraft.bankAccount || '—' }}</dd></div>
            </dl>
          </section>

          <section v-if="supplierDraft.note" class="form-section material-detail-section supplier-detail-section">
            <div class="form-section-head">
              <h2>采购备注</h2>
            </div>
            <p class="material-note-copy">{{ supplierDraft.note }}</p>
          </section>
        </div>

        <div v-else class="quote-main-sections supplier-edit-content">
          <section class="form-section">
            <div class="form-section-head"><h2>基本资料</h2></div>
            <div class="quote-fields supplier-basic-fields">
              <label class="form-field"><span>供应商编码</span><input v-model="supplierDraft.code" readonly /></label>
              <label class="form-field" :class="requiredFieldClass('供应商名称', supplierDraft.name)">
                <span>供应商名称</span><input v-model="supplierDraft.name" placeholder="填写供应商名称" />
              </label>
              <label class="form-field">
                <span>供应商类型</span>
                <select v-model="supplierDraft.type"><option v-for="type in supplierTypes" :key="type">{{ type }}</option></select>
              </label>
              <label class="form-field">
                <span>使用状态</span>
                <select v-model="supplierDraft.status"><option>启用</option><option>停用</option></select>
              </label>
              <div class="master-field-notes">
                <small class="field-help">停用供应商会同步停用全部可供物料关系；重新启用后需按需逐项启用关系。</small>
              </div>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head"><h2>公司联系与地址</h2></div>
            <div class="quote-fields">
              <label class="form-field" :class="requiredFieldClass('联系人', supplierDraft.contact)"><span>联系人</span><input v-model="supplierDraft.contact" placeholder="填写联系人" /></label>
              <label class="form-field" :class="requiredFieldClass('联系方式', supplierDraft.phone)"><span>联系方式</span><input v-model="supplierDraft.phone" type="text" autocomplete="off" placeholder="手机号、座机、邮箱、微信或 WhatsApp 等" /></label>
              <label class="form-field"><span>邮箱</span><input v-model="supplierDraft.email" type="email" inputmode="email" autocomplete="email" placeholder="填写邮箱" /></label>
              <label class="form-field"><span>地区</span><select v-model="supplierDraft.regionType"><option>国内</option><option>海外</option></select></label>
              <label v-if="isDomesticSupplier" class="form-field"><span>省份</span><select v-model="supplierDraft.province"><option value="">选择省份</option><option v-for="province in provinceOptions" :key="province">{{ province }}</option></select></label>
              <label v-if="isDomesticSupplier" class="form-field" :class="supplierDraft.province ? requiredFieldClass('城市', supplierDraft.city) : {}"><span>城市</span><select v-model="citySelectValue"><option value="">选择城市</option><option v-for="city in cityOptions" :key="city" :value="city">{{ city }}</option><option :value="CUSTOM_CITY_OPTION">其他城市</option></select></label>
              <label v-if="showCustomCityInput" class="form-field"><span>其他城市</span><input :value="customCity" placeholder="填写城市" @input="handleCustomCityInput" /></label>
              <label class="form-field field-wide"><span>详细地址</span><input v-model="supplierDraft.address" :placeholder="isDomesticSupplier ? '填写街道、门牌号、园区、楼栋等' : '填写完整地址'" /></label>
            </div>
          </section>

          <section v-if="usesMaterialSupplyRelations" class="form-section">
            <div class="form-section-head">
              <h2>可供物料</h2>
              <button class="secondary-action compact-action" type="button" title="添加一项物料—供应商关系" @click="addSupplierMaterialRelation">
                <Plus :size="14" />
                添加物料
              </button>
            </div>
            <div v-if="relationDrafts.length" class="master-relation-editor">
              <div class="master-relation-editor-row master-relation-editor-head">
                <span>物料</span>
                <span>供应商料号</span>
                <span>起订量</span>
                <span>供货周期</span>
                <span>关系</span>
                <span></span>
              </div>
              <div v-for="(relation, index) in relationDrafts" :key="relation.code" class="master-relation-editor-row">
                <ReferencePicker
                  v-model="relation.materialCode"
                  :display-value="relation.materialName"
                  type="materials"
                  kind="采购"
                  title="选择可供物料"
                  placeholder="选择物料"
                  search-placeholder="搜索可采购物料"
                  :disabled="!relation.code.startsWith('NEW-')"
                  @select="handleSupplierMaterialSelect(relation, $event)"
                />
                <input v-model="relation.supplierMaterialCode" :aria-label="`${relation.materialName || '可供物料'}供应商料号`" placeholder="可不填" />
                <label class="relation-number-input">
                  <input v-model.number="relation.minOrderQty" type="number" min="0.0001" step="any" :aria-label="`${relation.materialName || '可供物料'}起订量`" />
                  <span>{{ relation.baseUom || '-' }}</span>
                </label>
                <label class="relation-number-input">
                  <input v-model.number="relation.leadTimeDays" type="number" min="0" step="1" :aria-label="`${relation.materialName || '可供物料'}供货周期`" />
                  <span>天</span>
                </label>
                <div class="supplier-relation-options">
                  <label><input v-model="relation.isDefault" type="checkbox" /> 默认</label>
                  <select v-model="relation.status" :aria-label="`${relation.materialName || '可供物料'}关系状态`"><option>启用</option><option>停用</option></select>
                </div>
                <button
                  class="row-icon-button"
                  type="button"
                  :disabled="!relation.code.startsWith('NEW-')"
                  :aria-label="relation.code.startsWith('NEW-') ? '移除新增可供物料' : '已有关系请改为停用'"
                  :title="relation.code.startsWith('NEW-') ? '移除新增可供物料' : '已有关系请改为停用，以保留历史业务追溯'"
                  @click="removeNewSupplierMaterialRelation(index)"
                ><Trash2 :size="15" /></button>
              </div>
            </div>
            <p v-else class="master-relation-empty">暂无可供物料。可先保存供应商，也可现在一并添加。</p>
            <p class="master-relation-guidance">供应商料号、起订量和供货周期按物料关系维护；数量使用物料基础单位。</p>
          </section>

          <section class="form-section">
            <div class="form-section-head"><h2>采购默认值</h2></div>
            <div class="quote-fields">
              <label class="form-field"><span>交付方式</span><select v-model="supplierDraft.deliveryMethod"><option v-for="method in deliveryMethodOptions" :key="method">{{ method }}</option></select></label>
              <label class="form-field"><span>付款方式</span><select v-model="supplierDraft.paymentMethod"><option v-for="method in paymentMethodOptions" :key="method">{{ method }}</option></select></label>
              <label class="form-field"><span>账期（天）</span><input v-model="supplierDraft.paymentTermDays" type="number" min="0" :disabled="supplierDraft.paymentMethod !== '月结'" placeholder="填写天数" /></label>
              <label class="form-field"><span>结算币种</span><select v-model="supplierDraft.currency"><option v-for="currency in currencyOptions" :key="currency">{{ currency }}</option></select></label>
              <label class="form-field"><span>税率</span><select v-model="supplierDraft.taxRate"><option v-for="tax in taxRateOptions" :key="tax">{{ tax }}</option></select></label>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head"><h2>开票与收款资料</h2></div>
            <div class="quote-fields">
              <label class="form-field field-span-2"><span>开票抬头</span><input v-model="supplierDraft.invoiceTitle" placeholder="填写开票抬头" /></label>
              <label class="form-field"><span>税号</span><input v-model="supplierDraft.taxNumber" placeholder="填写纳税人识别号" /></label>
              <label class="form-field"><span>开票电话</span><input v-model="supplierDraft.invoicePhone" type="tel" inputmode="tel" autocomplete="billing tel" placeholder="填写开票电话" /></label>
              <label class="form-field field-span-2"><span>注册地址</span><input v-model="supplierDraft.registeredAddress" placeholder="填写注册地址" /></label>
              <label class="form-field field-span-2"><span>开户行</span><input v-model="supplierDraft.bankName" placeholder="填写开户行" /></label>
              <label class="form-field"><span>银行账号</span><input v-model="supplierDraft.bankAccount" placeholder="填写银行账号" /></label>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head"><h2>备注</h2></div>
            <label class="form-field"><textarea v-model="supplierDraft.note" rows="3" placeholder="填写对账说明、交付注意事项等" /></label>
          </section>
        </div>

        <aside v-if="isDetail" class="quote-summary-panel supplier-side-panel">
          <section class="summary-section">
            <div class="summary-title">
              <ClipboardList :size="17" />
              <h2>使用状态</h2>
            </div>
            <div class="material-rule-card" :class="{ warn: supplierDraft.status === '停用' }">
              <strong>{{ supplierDraft.status === '停用' ? '已停用' : '可使用' }}</strong>
              <span>{{ statusTip }}</span>
            </div>
          </section>

          <section class="summary-section">
            <div class="summary-title"><h2>资料完整性</h2></div>
            <div class="supplier-completeness-list">
              <div v-for="item in supplierProfileSummary" :key="item.label" :class="{ complete: item.complete }">
                <i>
                  <Check v-if="item.complete" :size="13" :stroke-width="2.4" />
                  <CircleAlert v-else :size="13" :stroke-width="2.2" />
                </i>
                <span><strong>{{ item.label }}</strong><small>{{ item.complete ? '已维护' : '待补充后供新单据使用' }}</small></span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      title="供应商"
      :message="loadMessage || '供应商不存在'"
      back-path="/master-data/suppliers"
      back-label="返回供应商列表"
      @retry="loadSupplier"
    />
    <div v-if="saveMessage" class="app-toast" :class="{ error: saveTone === 'error' }" :role="saveTone === 'error' ? 'alert' : 'status'" :aria-live="saveTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ saveMessage }}</div>
  </div>
</template>
