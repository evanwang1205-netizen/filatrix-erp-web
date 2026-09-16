<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Check, ChevronLeft, CircleAlert, ClipboardList, Pencil, Save } from 'lucide-vue-next';

import DocumentLoadState from '../components/DocumentLoadState.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import { requestActionConfirmation } from '../composables/useActionConfirmation';
import { useMasterSaveFeedback } from '../composables/useMasterSaveFeedback';
import { useModulePermission } from '../composables/useModulePermission';
import { usePageRefresh } from '../composables/usePageRefresh';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import type { MasterDataRecord } from '../data/masterData';
import { getMasterRecord, listReference, saveMasterRecord } from '../services/api';
import type { ReferenceOption } from '../types/business';
import { isNonNegativeInteger, isNonNegativeNumber, isValidOptionalEmail } from '../utils/masterInputValidation';

const route = useRoute();
const router = useRouter();
const { saveMessage, saveTone, showSaveFeedback, validateRequired, requiredFieldClass, setRequiredErrors } = useMasterSaveFeedback();
const { canWrite: canWriteMasterData, readonlyReason: masterDataReadonlyReason } = useModulePermission('masterData');

type CustomerProfile = {
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
  defaultLogisticsMode: string;
  defaultShipContact: string;
  defaultShipPhone: string;
  defaultShipAddress: string;
  paymentMethod: string;
  paymentTermDays: string | number;
  creditLimit: string;
  currency: string;
  taxMode: string;
};

type CustomerDraft = MasterDataRecord & CustomerProfile;

function todayText() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const emptyCustomer: MasterDataRecord = {
  code: '系统自动生成',
  name: '',
  type: '工业工厂',
  primary: '',
  secondary: '',
  owner: '',
  status: '启用',
  updatedAt: todayText(),
  attachments: 0,
  note: '',
};

const defaultProfile: CustomerProfile = {
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
  defaultLogisticsMode: '本厂配送',
  defaultShipContact: '',
  defaultShipPhone: '',
  defaultShipAddress: '',
  paymentMethod: '款到发货',
  paymentTermDays: '',
  creditLimit: '0',
  currency: 'CNY',
  taxMode: '含税',
};

const customerTypes = ['工业工厂', '打印农场', '贸易商', '电商卖家', '院校科研', '文创工作室', '个人玩家', '医疗器械'];
const logisticsModeOptions = ['客户自提', '本厂配送', '整车货运', '拼车物流', '快递快运'];
const paymentMethodOptions = ['款到发货', '预付 30%', '预付 50%', '月结'];
const provinceOptions = [
  '北京市',
  '天津市',
  '河北省',
  '山西省',
  '内蒙古自治区',
  '辽宁省',
  '吉林省',
  '黑龙江省',
  '上海市',
  '江苏省',
  '浙江省',
  '安徽省',
  '福建省',
  '江西省',
  '山东省',
  '河南省',
  '湖北省',
  '湖南省',
  '广东省',
  '广西壮族自治区',
  '海南省',
  '重庆市',
  '四川省',
  '贵州省',
  '云南省',
  '西藏自治区',
  '陕西省',
  '甘肃省',
  '青海省',
  '宁夏回族自治区',
  '新疆维吾尔自治区',
  '香港特别行政区',
  '澳门特别行政区',
  '台湾省',
];
const cityOptionsMap: Record<string, string[]> = {
  北京市: ['北京市'],
  天津市: ['天津市'],
  河北省: ['石家庄市', '唐山市', '秦皇岛市', '邯郸市', '保定市', '廊坊市', '沧州市'],
  山西省: ['太原市', '大同市', '长治市', '晋中市', '运城市', '临汾市'],
  内蒙古自治区: ['呼和浩特市', '包头市', '鄂尔多斯市', '赤峰市', '通辽市'],
  辽宁省: ['沈阳市', '大连市', '鞍山市', '抚顺市', '锦州市', '营口市'],
  吉林省: ['长春市', '吉林市', '四平市', '延边朝鲜族自治州'],
  黑龙江省: ['哈尔滨市', '齐齐哈尔市', '大庆市', '牡丹江市'],
  上海市: ['上海市'],
  江苏省: ['苏州市', '南京市', '无锡市', '常州市', '南通市', '扬州市', '泰州市'],
  浙江省: ['杭州市', '宁波市', '温州市', '嘉兴市', '湖州市', '绍兴市', '金华市', '台州市'],
  安徽省: ['合肥市', '芜湖市', '马鞍山市'],
  福建省: ['厦门市', '福州市', '泉州市'],
  江西省: ['南昌市', '赣州市', '九江市', '上饶市'],
  山东省: ['青岛市', '济南市', '烟台市', '潍坊市'],
  河南省: ['郑州市', '洛阳市', '许昌市', '新乡市', '南阳市'],
  湖北省: ['武汉市', '襄阳市', '宜昌市', '黄石市'],
  湖南省: ['长沙市', '株洲市', '湘潭市', '衡阳市'],
  广东省: ['广州市', '深圳市', '东莞市', '佛山市', '中山市', '珠海市'],
  广西壮族自治区: ['南宁市', '柳州市', '桂林市', '梧州市'],
  海南省: ['海口市', '三亚市', '儋州市'],
  重庆市: ['重庆市'],
  四川省: ['成都市', '绵阳市', '德阳市', '宜宾市', '乐山市'],
  贵州省: ['贵阳市', '遵义市', '六盘水市'],
  云南省: ['昆明市', '曲靖市', '玉溪市', '大理白族自治州'],
  西藏自治区: ['拉萨市', '日喀则市', '山南市'],
  陕西省: ['西安市', '咸阳市', '宝鸡市', '渭南市'],
  甘肃省: ['兰州市', '天水市', '白银市', '酒泉市'],
  青海省: ['西宁市', '海东市'],
  宁夏回族自治区: ['银川市', '石嘴山市', '吴忠市'],
  新疆维吾尔自治区: ['乌鲁木齐市', '克拉玛依市', '昌吉回族自治州', '伊犁哈萨克自治州'],
  香港特别行政区: ['香港特别行政区'],
  澳门特别行政区: ['澳门特别行政区'],
  台湾省: ['台北市', '新北市', '桃园市', '台中市', '台南市', '高雄市'],
};

const routeName = computed(() => route.name?.toString() ?? '');
const isNew = computed(() => routeName.value === 'master-customer-new');
const isEdit = computed(() => routeName.value === 'master-customer-edit');
const isDetail = computed(() => routeName.value === 'master-customer-detail');
const customerCode = computed(() => route.params.code?.toString() ?? '');
const apiCustomer = ref<MasterDataRecord | null>(null);
const loadMessage = ref('');
const currencyLoadError = ref('');
const isLoading = ref(false);
const isSaving = ref(false);
const currencyRows = ref<ReferenceOption<MasterDataRecord>[]>([]);
let customerLoadRequestId = 0;

const sourceCustomer = computed(() => (isNew.value ? emptyCustomer : apiCustomer.value));

const customerDraft = reactive<CustomerDraft>(createDraft(emptyCustomer));
const CUSTOM_CITY_OPTION = '__custom_city__';
const customCity = ref('');
const isCustomCityMode = ref(false);

watch(
  sourceCustomer,
  (customer) => {
    if (!customer) return;
    Object.assign(customerDraft, createDraft(customer));
  },
  { immediate: true },
);

watch(
  () => route.fullPath,
  () => {
    void loadCustomer();
  },
  { immediate: true },
);

watch(
  () => customerDraft.regionType,
  (regionType) => {
    if (regionType === '海外') {
      customerDraft.province = '';
      customerDraft.city = '';
      customCity.value = '';
      isCustomCityMode.value = false;
    }
  },
);

watch(
  () => customerDraft.province,
  (province) => {
    if (!province) {
      customerDraft.city = '';
      customCity.value = '';
      isCustomCityMode.value = false;
    }
  },
);

watch(
  () => customerDraft.paymentMethod,
  (paymentMethod) => {
    if (paymentMethod !== '月结') {
      customerDraft.paymentTermDays = 0;
    } else if (!Number(customerDraft.paymentTermDays)) {
      customerDraft.paymentTermDays = 30;
    }
  },
);

const currentCustomer = computed(() => (sourceCustomer.value ? customerDraft : undefined));
const readonly = computed(() => isDetail.value || !canWriteMasterData.value);
const { isDirty, resetUnsavedChanges } = useUnsavedChangesGuard(() => customerDraft, {
  enabled: computed(() => !readonly.value),
  ready: computed(() => !isLoading.value),
});
const masterSaveActionTitle = computed(() => {
  if (isSaving.value) return '正在保存，请稍候';
  return canWriteMasterData.value ? '保存资料，保存后会同步到业务候选列表。' : masterDataReadonlyReason.value;
});
const isDomesticCustomer = computed(() => customerDraft.regionType === '国内');
const cityOptions = computed(() => cityOptionsMap[customerDraft.province] ?? []);
const citySelectValue = computed({
  get: () => {
    if (isCustomCityMode.value) return CUSTOM_CITY_OPTION;
    if (!customerDraft.city) return '';
    return cityOptions.value.includes(customerDraft.city) ? customerDraft.city : CUSTOM_CITY_OPTION;
  },
  set: (value: string) => {
    if (value === CUSTOM_CITY_OPTION) {
      isCustomCityMode.value = true;
      customCity.value = cityOptions.value.includes(customerDraft.city) ? '' : customerDraft.city;
      customerDraft.city = customCity.value;
      return;
    }

    isCustomCityMode.value = false;
    customCity.value = '';
    customerDraft.city = value;
  },
});
const showCustomCityInput = computed(() => isDomesticCustomer.value && citySelectValue.value === CUSTOM_CITY_OPTION);
const pageHeading = computed(() => {
  if (isNew.value) return '新建客户';
  if (isEdit.value) return '编辑客户';
  return '客户详情';
});
const referenceTitle = computed(() => `客户 ${customerDraft.code || ''}`.trim());
const referenceSubtitle = computed(() => `${customerDraft.name || '未命名'} · ${customerDraft.status}`);
const referencePath = computed(() =>
  customerDraft.code && customerDraft.code !== '系统自动生成' ? `/master-data/customers/${encodeURIComponent(customerDraft.code)}` : '',
);
const statusTip = computed(() =>
  customerDraft.status === '停用'
    ? '停用后不能被新单据选择，历史单据仍保留原有客户信息。'
    : '新单据会带入当前联系人、收货和开票默认值；已保存单据不随主数据变化。',
);
const customerCompanyAddressText = computed(() =>
  [customerDraft.province, customerDraft.city, customerDraft.address].filter(Boolean).join('') || '—',
);
const customerCompanyRegionText = computed(() =>
  customerDraft.regionType === '海外'
    ? '海外'
    : [customerDraft.province, customerDraft.city].filter(Boolean).join(' / ') || '—',
);
const paymentTermText = computed(() =>
  customerDraft.paymentMethod === '月结'
    ? `${customerDraft.paymentTermDays || 0} 天`
    : '不适用',
);
const creditLimitText = computed(() => {
  const rawValue = String(customerDraft.creditLimit || '').trim();
  const amount = Number(rawValue.replace(/[^\d.-]/g, ''));
  if (!rawValue) return '—';
  if (!Number.isFinite(amount)) return rawValue;
  return `${customerDraft.currency} ${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(amount)}`;
});
const currencyOptions = computed(() => {
  const codes = currencyRows.value
    .filter((row) => row.status !== '停用')
    .map((row) => row.code)
    .filter(Boolean);
  if (customerDraft.currency && !codes.includes(customerDraft.currency)) codes.unshift(customerDraft.currency);
  return codes.length ? codes : ['CNY'];
});
const customerProfileChecks = computed(() => [
  {
    label: '主要联系人',
    complete: Boolean(customerDraft.contact && customerDraft.phone),
  },
  {
    label: '默认收货',
    complete: Boolean(
      customerDraft.defaultShipContact
      && customerDraft.defaultShipPhone
      && (customerDraft.defaultLogisticsMode === '客户自提' || customerDraft.defaultShipAddress),
    ),
  },
  {
    label: '开票资料',
    complete: Boolean(customerDraft.invoiceTitle && customerDraft.taxNumber),
  },
]);
const customerProfileSummary = computed(() => {
  const missingItems = customerProfileChecks.value.filter((item) => !item.complete);
  return missingItems.length
    ? missingItems
    : [{ label: '关键资料', complete: true }];
});

function normalizeCustomerLogisticsMode(value = '') {
  const legacyMap: Record<string, string> = {
    物流发运: '拼车物流',
    专车配送: '整车货运',
    送货到厂: '本厂配送',
    快递: '快递快运',
  };
  return legacyMap[value] || value || defaultProfile.defaultLogisticsMode;
}

function createDraft(customer: MasterDataRecord): CustomerDraft {
  const draft = {
    ...defaultProfile,
    ...customer,
    status: customer.status === '停用' ? '停用' : '启用',
  };

  return {
    ...draft,
    defaultLogisticsMode: normalizeCustomerLogisticsMode(draft.defaultLogisticsMode || draft.deliveryMethod || defaultProfile.defaultLogisticsMode),
    defaultShipContact: draft.defaultShipContact || '',
    defaultShipPhone: draft.defaultShipPhone || '',
    defaultShipAddress: draft.defaultShipAddress || '',
  };
}

async function loadCustomerCurrencyReferences(requestId = customerLoadRequestId) {
  try {
    const currencies = await listReference<MasterDataRecord>('currencies', { activeOnly: true, limit: 50 });
    if (requestId !== customerLoadRequestId) return;
    currencyRows.value = currencies.items;
    currencyLoadError.value = '';
  } catch (error) {
    if (requestId !== customerLoadRequestId) return;
    currencyRows.value = [];
    currencyLoadError.value = error instanceof Error ? error.message : '币种候选加载失败';
  }
}

async function loadCustomer() {
  const requestId = ++customerLoadRequestId;
  const targetIsNew = isNew.value;
  const targetCode = customerCode.value;
  loadMessage.value = '';
  apiCustomer.value = null;
  isLoading.value = !targetIsNew;
  await loadCustomerCurrencyReferences(requestId);

  if (targetIsNew || !targetCode) {
    isLoading.value = false;
    return;
  }

  try {
    const customer = await getMasterRecord('customers', targetCode);
    if (requestId !== customerLoadRequestId) return;
    apiCustomer.value = customer;
  } catch (error) {
    if (requestId !== customerLoadRequestId) return;
    loadMessage.value = error instanceof Error ? error.message : '客户加载失败';
  } finally {
    if (requestId === customerLoadRequestId) isLoading.value = false;
  }
}

async function refreshCustomerPage() {
  if (!isDetail.value && isDirty.value) {
    const confirmed = await requestActionConfirmation({
      title: '放弃未保存修改？',
      message: '刷新将丢失当前客户资料中尚未保存的修改。',
      confirmLabel: '放弃并刷新',
    });
    if (!confirmed) return;
  }

  if (isNew.value) {
    Object.assign(customerDraft, createDraft(emptyCustomer));
    await nextTick();
    resetUnsavedChanges();
    return;
  }

  await loadCustomer();
  await nextTick();
  resetUnsavedChanges();
}

usePageRefresh(refreshCustomerPage);

watch(
  () => customerDraft.city,
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
  customerDraft.city = target.value;
}

function syncDefaultShipping() {
  customerDraft.defaultShipContact = customerDraft.contact.trim();
  customerDraft.defaultShipAddress = [customerDraft.province, customerDraft.city, customerDraft.address]
    .filter(Boolean)
    .join('');
}

async function saveCustomer() {
  if (isSaving.value) return;
  if (!canWriteMasterData.value) {
    showSaveFeedback(masterDataReadonlyReason.value, 'error');
    return;
  }
  const requiredFields = [
    { label: '客户名称', value: customerDraft.name },
    { label: '联系人', value: customerDraft.contact },
    { label: '联系方式', value: customerDraft.phone },
  ];

  if (!validateRequired(requiredFields)) return;

  if (!isValidOptionalEmail(customerDraft.email)) {
    showSaveFeedback('请填写有效的客户邮箱', 'error');
    return;
  }
  if (!isNonNegativeNumber(customerDraft.creditLimit)) {
    showSaveFeedback('信用额度必须是大于或等于 0 的数值', 'error');
    return;
  }
  if (!isNonNegativeInteger(customerDraft.paymentTermDays || 0)) {
    showSaveFeedback('付款期限必须是大于或等于 0 的整数天', 'error');
    return;
  }

  if (isDomesticCustomer.value && customerDraft.province && !customerDraft.city) {
    setRequiredErrors(['城市']);
    showSaveFeedback('选择省份后请补充城市', 'error');
    return;
  }

  isSaving.value = true;
  try {
    const savedCustomer = await saveMasterRecord(
      'customers',
      {
        ...customerDraft,
        updatedAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10),
      },
      { create: isNew.value },
    );
    Object.assign(customerDraft, createDraft(savedCustomer));
    apiCustomer.value = savedCustomer;
    resetUnsavedChanges();
    showSaveFeedback(`${savedCustomer.name}已保存，销售单据候选列表会同步使用`);

    await router.replace(`/master-data/customers/${encodeURIComponent(savedCustomer.code)}`);
  } catch (error) {
    showSaveFeedback(error instanceof Error ? error.message : '客户保存失败', 'error');
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="page-stack">
    <section v-if="currentCustomer" class="quote-editor customer-editor" :class="{ 'is-detail-view': isDetail }">
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" to="/master-data/customers" aria-label="返回客户列表" title="返回客户列表">
            <ChevronLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ isDetail ? customerDraft.name : pageHeading }}</strong>
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
            :to="`/master-data/customers/${encodeURIComponent(customerDraft.code)}/edit`"
            title="编辑客户资料"
          >
            <Pencil :size="15" />
            <span>编辑</span>
          </RouterLink>
          <button v-else-if="isDetail" class="secondary-action" type="button" disabled :title="masterDataReadonlyReason">
            <Pencil :size="15" />
            <span>编辑</span>
          </button>
          <button v-if="!isDetail" class="primary-action master-save-action" type="button" :disabled="isSaving || !canWriteMasterData" :aria-busy="isSaving" :title="masterSaveActionTitle" @click="saveCustomer">
            <Save :size="15" />
            <span>{{ isSaving ? '保存中' : '保存' }}</span>
          </button>
        </template>

        <template #fallback>
          <div class="quote-editor-header">
            <div>
              <h1>{{ isDetail ? customerDraft.name : pageHeading }}</h1>
              <p v-if="loadMessage" class="section-hint">{{ loadMessage }}</p>
            </div>
          </div>
        </template>
      </PageTopbarPortal>

      <section v-if="currencyLoadError" class="access-denied-banner reference-load-warning" role="alert">
        <strong>币种候选加载失败</strong>
        <span>{{ currencyLoadError }}。当前保留客户已有币种；重试成功后可选择其他启用币种。</span>
        <div class="access-denied-actions">
          <button type="button" class="notice-refresh-button" @click="loadCustomerCurrencyReferences()">重试加载币种</button>
        </div>
      </section>

      <div class="quote-form-grid customer-form-grid" :class="{ 'is-editing': !isDetail }">
        <div v-if="isDetail" class="quote-main-sections customer-detail-content">
          <section class="form-section material-detail-section customer-detail-section">
            <div class="form-section-head">
              <h2>基本资料</h2>
            </div>
            <dl class="material-fact-grid customer-fact-grid">
              <div><dt>客户编码</dt><dd>{{ customerDraft.code }}</dd></div>
              <div><dt>客户名称</dt><dd>{{ customerDraft.name }}</dd></div>
              <div><dt>客户类型</dt><dd>{{ customerDraft.type }}</dd></div>
            </dl>
          </section>

          <section class="form-section material-detail-section customer-detail-section">
            <div class="form-section-head">
              <h2>公司联系与地址</h2>
            </div>
            <div class="material-rule-groups customer-info-groups">
              <section>
                <span>主要联系人</span>
                <dl>
                  <div><dt>联系人</dt><dd>{{ customerDraft.contact || '—' }}</dd></div>
                  <div><dt>联系方式</dt><dd>{{ customerDraft.phone || '—' }}</dd></div>
                  <div><dt>邮箱</dt><dd>{{ customerDraft.email || '—' }}</dd></div>
                </dl>
              </section>
              <section>
                <span>公司地址</span>
                <dl>
                  <div><dt>地区</dt><dd>{{ customerCompanyRegionText }}</dd></div>
                  <div><dt>详细地址</dt><dd>{{ customerCompanyAddressText }}</dd></div>
                </dl>
              </section>
            </div>
          </section>

          <section class="form-section material-detail-section customer-detail-section">
            <div class="form-section-head">
              <h2>默认收货信息</h2>
            </div>
            <dl class="material-fact-grid customer-fact-grid customer-shipping-fact-grid">
              <div><dt>收货人</dt><dd>{{ customerDraft.defaultShipContact || '—' }}</dd></div>
              <div><dt>收货电话</dt><dd>{{ customerDraft.defaultShipPhone || '—' }}</dd></div>
              <div><dt>收货地址</dt><dd>{{ customerDraft.defaultShipAddress || '—' }}</dd></div>
              <div><dt>物流方式</dt><dd>{{ customerDraft.defaultLogisticsMode || '—' }}</dd></div>
            </dl>
          </section>

          <section class="form-section material-detail-section customer-detail-section">
            <div class="form-section-head">
              <h2>商务默认值</h2>
            </div>
            <dl class="material-fact-grid customer-fact-grid customer-business-fact-grid">
              <div><dt>结算方式</dt><dd>{{ customerDraft.paymentMethod }}</dd></div>
              <div><dt>账期</dt><dd>{{ paymentTermText }}</dd></div>
              <div><dt>信用额度</dt><dd>{{ creditLimitText }}</dd></div>
              <div><dt>结算币种</dt><dd>{{ customerDraft.currency }}</dd></div>
              <div><dt>计价方式</dt><dd>{{ customerDraft.taxMode }}</dd></div>
            </dl>
          </section>

          <section class="form-section material-detail-section customer-detail-section">
            <div class="form-section-head">
              <h2>开票资料</h2>
            </div>
            <dl class="material-fact-grid customer-fact-grid">
              <div><dt>开票抬头</dt><dd>{{ customerDraft.invoiceTitle || '—' }}</dd></div>
              <div><dt>税号</dt><dd>{{ customerDraft.taxNumber || '—' }}</dd></div>
              <div><dt>开票电话</dt><dd>{{ customerDraft.invoicePhone || '—' }}</dd></div>
              <div><dt>注册地址</dt><dd>{{ customerDraft.registeredAddress || '—' }}</dd></div>
              <div><dt>开户行</dt><dd>{{ customerDraft.bankName || '—' }}</dd></div>
              <div><dt>银行账号</dt><dd>{{ customerDraft.bankAccount || '—' }}</dd></div>
            </dl>
          </section>

          <section v-if="customerDraft.note" class="form-section material-detail-section customer-detail-section">
            <div class="form-section-head">
              <h2>业务备注</h2>
            </div>
            <p class="material-note-copy">{{ customerDraft.note }}</p>
          </section>
        </div>

        <div v-else class="quote-main-sections customer-edit-content">
          <section class="form-section">
            <div class="form-section-head"><h2>基本资料</h2></div>
            <div class="quote-fields customer-basic-fields">
              <label class="form-field">
                <span>客户编码</span>
                <input v-model="customerDraft.code" readonly />
              </label>
              <label class="form-field" :class="requiredFieldClass('客户名称', customerDraft.name)">
                <span>客户名称</span>
                <input v-model="customerDraft.name" placeholder="填写客户名称" />
              </label>
              <label class="form-field">
                <span>客户类型</span>
                <select v-model="customerDraft.type">
                  <option v-for="type in customerTypes" :key="type">{{ type }}</option>
                </select>
              </label>
              <label class="form-field">
                <span>使用状态</span>
                <select v-model="customerDraft.status">
                  <option>启用</option>
                  <option>停用</option>
                </select>
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head"><h2>公司联系与地址</h2></div>
            <div class="quote-fields">
              <label class="form-field" :class="requiredFieldClass('联系人', customerDraft.contact)">
                <span>联系人</span>
                <input v-model="customerDraft.contact" placeholder="填写联系人" />
              </label>
              <label class="form-field" :class="requiredFieldClass('联系方式', customerDraft.phone)">
                <span>联系方式</span>
                <input v-model="customerDraft.phone" type="text" autocomplete="off" placeholder="手机号、座机、邮箱、微信或 WhatsApp 等" />
              </label>
              <label class="form-field">
                <span>邮箱</span>
                <input v-model="customerDraft.email" type="email" inputmode="email" autocomplete="email" placeholder="填写邮箱" />
              </label>
              <label class="form-field">
                <span>地区</span>
                <select v-model="customerDraft.regionType">
                  <option>国内</option>
                  <option>海外</option>
                </select>
              </label>
              <label v-if="isDomesticCustomer" class="form-field">
                <span>省份</span>
                <select v-model="customerDraft.province">
                  <option value="">选择省份</option>
                  <option v-for="province in provinceOptions" :key="province">{{ province }}</option>
                </select>
              </label>
              <label v-if="isDomesticCustomer" class="form-field" :class="customerDraft.province ? requiredFieldClass('城市', customerDraft.city) : {}">
                <span>城市</span>
                <select v-model="citySelectValue">
                  <option value="">选择城市</option>
                  <option v-for="city in cityOptions" :key="city" :value="city">{{ city }}</option>
                  <option :value="CUSTOM_CITY_OPTION">其他城市</option>
                </select>
              </label>
              <label v-if="showCustomCityInput" class="form-field">
                <span>其他城市</span>
                <input :value="customCity" placeholder="填写城市" @input="handleCustomCityInput" />
              </label>
              <label class="form-field field-wide">
                <span>详细地址</span>
                <input v-model="customerDraft.address" :placeholder="isDomesticCustomer ? '填写街道、门牌号、园区、楼栋等' : '填写完整地址'" />
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <h2>默认收货信息</h2>
              <button
                class="secondary-action compact-action"
                type="button"
                :disabled="!customerDraft.contact && !customerDraft.phone && !customerDraft.address"
                title="将公司联系人和公司地址带入默认收货信息，收货电话需单独确认"
                @click="syncDefaultShipping"
              >
                从公司信息带入
              </button>
            </div>
            <div class="quote-fields">
              <label class="form-field">
                <span>物流方式</span>
                <select v-model="customerDraft.defaultLogisticsMode">
                  <option v-for="mode in logisticsModeOptions" :key="mode" :value="mode">{{ mode }}</option>
                </select>
              </label>
              <label class="form-field">
                <span>收货人</span>
                <input v-model="customerDraft.defaultShipContact" placeholder="填写收货人" />
              </label>
              <label class="form-field">
                <span>收货电话</span>
                <input v-model="customerDraft.defaultShipPhone" type="tel" inputmode="tel" autocomplete="shipping tel" placeholder="填写收货电话" />
              </label>
              <label class="form-field field-wide">
                <span>收货地址</span>
                <input v-model="customerDraft.defaultShipAddress" placeholder="填写收货地址" />
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head"><h2>商务默认值</h2></div>
            <div class="quote-fields">
              <label class="form-field">
                <span>结算方式</span>
                <select v-model="customerDraft.paymentMethod">
                  <option v-for="method in paymentMethodOptions" :key="method">{{ method }}</option>
                </select>
              </label>
              <label class="form-field">
                <span>账期（天）</span>
                <input v-model="customerDraft.paymentTermDays" type="number" min="0" :disabled="customerDraft.paymentMethod !== '月结'" placeholder="填写天数" />
              </label>
              <label class="form-field">
                <span>信用额度</span>
                <input v-model="customerDraft.creditLimit" inputmode="decimal" placeholder="填写金额" />
              </label>
              <label class="form-field">
                <span>结算币种</span>
                <select v-model="customerDraft.currency">
                  <option v-for="currency in currencyOptions" :key="currency">{{ currency }}</option>
                </select>
              </label>
              <label class="form-field">
                <span>计价方式</span>
                <select v-model="customerDraft.taxMode">
                  <option>含税</option>
                  <option>未税</option>
                </select>
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head"><h2>开票资料</h2></div>
            <div class="quote-fields">
              <label class="form-field field-span-2">
                <span>开票抬头</span>
                <input v-model="customerDraft.invoiceTitle" placeholder="填写开票抬头" />
              </label>
              <label class="form-field">
                <span>税号</span>
                <input v-model="customerDraft.taxNumber" placeholder="填写纳税人识别号" />
              </label>
              <label class="form-field">
                <span>开票电话</span>
                <input v-model="customerDraft.invoicePhone" type="tel" inputmode="tel" autocomplete="billing tel" placeholder="填写开票电话" />
              </label>
              <label class="form-field field-span-2">
                <span>注册地址</span>
                <input v-model="customerDraft.registeredAddress" placeholder="填写注册地址" />
              </label>
              <label class="form-field field-span-2">
                <span>开户行</span>
                <input v-model="customerDraft.bankName" placeholder="填写开户行" />
              </label>
              <label class="form-field">
                <span>银行账号</span>
                <input v-model="customerDraft.bankAccount" placeholder="填写银行账号" />
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head"><h2>备注</h2></div>
            <label class="form-field">
              <textarea v-model="customerDraft.note" class="customer-note-textarea" rows="3" placeholder="填写特殊要求、对账说明等" />
            </label>
          </section>
        </div>

        <aside v-if="isDetail" class="quote-summary-panel customer-side-panel">
          <section class="summary-section">
            <div class="summary-title">
              <ClipboardList :size="17" />
              <h2>使用状态</h2>
            </div>
            <div class="material-rule-card" :class="{ warn: customerDraft.status === '停用' }">
              <strong>{{ customerDraft.status === '停用' ? '已停用' : '可使用' }}</strong>
              <span>{{ statusTip }}</span>
            </div>
          </section>

          <section class="summary-section">
            <div class="summary-title"><h2>资料完整性</h2></div>
            <div class="customer-completeness-list">
              <div v-for="item in customerProfileSummary" :key="item.label" :class="{ complete: item.complete }">
                <i>
                  <Check v-if="item.complete" :size="13" :stroke-width="2.4" />
                  <CircleAlert v-else :size="13" :stroke-width="2.2" />
                </i>
                <span>
                  <strong>{{ item.label }}</strong>
                  <small>{{ item.complete ? '已维护' : '待补充后供新单据带入' }}</small>
                </span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      title="客户"
      :message="loadMessage || '客户不存在'"
      back-path="/master-data/customers"
      back-label="返回客户列表"
      @retry="loadCustomer"
    />
    <div v-if="saveMessage" class="app-toast" :class="{ error: saveTone === 'error' }" :role="saveTone === 'error' ? 'alert' : 'status'" :aria-live="saveTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ saveMessage }}</div>
  </div>
</template>
