<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus } from 'lucide-vue-next';

import BusinessListToolbar from '../components/BusinessListToolbar.vue';
import ListLoadState from '../components/ListLoadState.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import { useModulePermission } from '../composables/useModulePermission';
import { usePageRefresh } from '../composables/usePageRefresh';
import { type MasterDataRecord, type MasterDataTabKey } from '../data/masterData';
import { listMasterRecords } from '../services/api';
import { statusPresentationClass } from '../utils/statusPresentation';

const route = useRoute();
const router = useRouter();
const { canWrite: canWriteMasterData, readonlyReason: masterDataReadonlyReason } = useModulePermission('masterData');

type ActiveMasterDataTabKey = MasterDataTabKey;

const pageTitles: Record<ActiveMasterDataTabKey, string> = {
  materials: '物料',
  customers: '客户',
  suppliers: '供应商',
  warehouses: '仓库',
  uom: '计量单位',
  currencies: '币种',
  departments: '部门',
  employees: '员工',
  company: '公司',
  equipment: '设备',
  productionLines: '产线',
};

const createButtonLabels: Record<ActiveMasterDataTabKey, string> = {
  materials: '新建',
  customers: '新建',
  suppliers: '新建',
  warehouses: '新建',
  uom: '新建',
  currencies: '新建',
  departments: '新建',
  employees: '新建',
  company: '新建',
  equipment: '新建',
  productionLines: '新建',
};

const searchPlaceholders: Record<ActiveMasterDataTabKey, string> = {
  materials: '搜索物料编码、名称、分类',
  customers: '搜索客户、联系人、联系方式、公司地址',
  suppliers: '搜索供应商、联系人、联系方式、公司地址',
  warehouses: '搜索仓库、公司、地址、库位',
  uom: '搜索单位编码、单位、英文简称',
  currencies: '搜索币种代码、名称或符号',
  departments: '搜索部门编码、名称、公司或上级部门',
  employees: '搜索员工、部门、岗位、账号或联系方式',
  company: '搜索公司、中英文名称或地址',
  equipment: '搜索设备编码、名称、品牌、型号、出厂编号或位置',
  productionLines: '搜索产线编码、名称、类型、部门、车间或适用范围',
};

const partyLabels: Record<ActiveMasterDataTabKey, string> = {
  materials: '物料分类',
  customers: '客户类型',
  suppliers: '供应商类型',
  warehouses: '仓库类型',
  uom: '单位',
  currencies: '币种',
  departments: '部门',
  employees: '员工类型',
  company: '组织类型',
  equipment: '设备',
  productionLines: '产线类型',
};

const ownerLabels: Record<ActiveMasterDataTabKey, string> = {
  materials: '部门',
  customers: '归属部门',
  suppliers: '归属部门',
  warehouses: '仓库类型',
  uom: '部门',
  currencies: '币种',
  departments: '所属公司',
  employees: '所属部门',
  company: '部门',
  equipment: '所属部门',
  productionLines: '所属部门',
};

const routePageMap: Record<string, ActiveMasterDataTabKey> = {
  materials: 'materials',
  customers: 'customers',
  suppliers: 'suppliers',
  warehouses: 'warehouses',
  uom: 'uom',
  currencies: 'currencies',
  departments: 'departments',
  employees: 'employees',
  company: 'company',
  equipment: 'equipment',
  'production-lines': 'productionLines',
};

const simpleEditorPages = ['uom', 'currencies', 'departments', 'employees', 'company', 'equipment', 'productionLines'] as const;
type SimpleEditorPage = (typeof simpleEditorPages)[number];

type SimpleColumnKind = 'text' | 'status';

type SimpleListColumn = {
  key: string;
  label: string;
  kind?: SimpleColumnKind;
  strong?: boolean;
  value: (row: MasterDataRecord) => string;
  meta?: (row: MasterDataRecord) => string;
};

function emptyCell(value: unknown, fallback = '—') {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return String(value);
}

const simpleListColumns: Record<SimpleEditorPage, SimpleListColumn[]> = {
  uom: [
    { key: 'name', label: '单位', value: (row) => row.name, meta: (row) => row.code, strong: true },
    { key: 'englishAbbreviation', label: '英文简称', value: (row) => emptyCell(row.englishAbbreviation) },
    { key: 'status', label: '使用状态', value: (row) => row.status, meta: (row) => row.updatedAt, kind: 'status' },
  ],
  currencies: [
    { key: 'code', label: '币种', value: (row) => row.code, meta: (row) => row.name, strong: true },
    { key: 'symbol', label: '货币符号', value: (row) => emptyCell(row.symbol) },
    { key: 'decimalPlaces', label: '金额精度', value: (row) => `${row.decimalPlaces ?? 2} 位小数` },
    { key: 'status', label: '使用状态', value: (row) => row.status, meta: (row) => row.updatedAt, kind: 'status' },
  ],
  departments: [
    { key: 'name', label: '部门', value: (row) => row.name, meta: (row) => row.code, strong: true },
    { key: 'parentDepartment', label: '公司/上级', value: (row) => emptyCell(row.owner), meta: (row) => emptyCell(row.parentDepartment, '公司直属') },
    { key: 'employeeCount', label: '启用员工', value: (row) => `${row.employeeCount ?? 0} 人` },
    { key: 'status', label: '使用状态', value: (row) => row.status, meta: (row) => row.updatedAt, kind: 'status' },
  ],
  employees: [
    { key: 'name', label: '员工', value: (row) => row.name, meta: (row) => [row.englishName, row.code].filter(Boolean).join(' · '), strong: true },
    { key: 'owner', label: '部门/岗位', value: (row) => emptyCell(row.owner), meta: (row) => emptyCell(row.position) },
    {
      key: 'contact',
      label: '联系方式',
      value: (row) => emptyCell(row.phone || row.contact),
      meta: (row) => emptyCell(row.email),
    },
    { key: 'status', label: '使用状态', value: (row) => row.status, meta: (row) => row.updatedAt, kind: 'status' },
  ],
  company: [
    { key: 'name', label: '公司', value: (row) => row.name, meta: (row) => emptyCell(row.englishName), strong: true },
    { key: 'tax', label: '税务资料', value: (row) => emptyCell(row.taxNumber), meta: (row) => emptyCell(row.primary) },
    {
      key: 'contact',
      label: '电话/邮箱',
      value: (row) => emptyCell(row.phone),
      meta: (row) => emptyCell(row.email),
    },
    { key: 'address', label: '经营地址', value: (row) => emptyCell(row.address), meta: (row) => emptyCell(row.englishAddress) },
    { key: 'status', label: '使用状态', value: (row) => row.status, kind: 'status' },
  ],
  equipment: [
    { key: 'name', label: '设备', value: (row) => row.name, meta: (row) => row.code, strong: true },
    { key: 'model', label: '品牌/型号', value: (row) => emptyCell(row.brand), meta: (row) => emptyCell(row.model) },
    { key: 'owner', label: '所属/位置', value: (row) => emptyCell(row.owner), meta: (row) => emptyCell(row.primary) },
    { key: 'serialNumber', label: '出厂编号', value: (row) => emptyCell(row.serialNumber), meta: (row) => row.startDate ? `启用 ${row.startDate}` : '—' },
    { key: 'status', label: '使用状态', value: (row) => row.status, kind: 'status' },
  ],
  productionLines: [
    { key: 'name', label: '产线', value: (row) => row.name, meta: (row) => `${row.code} · ${emptyCell(row.type)}`, strong: true },
    { key: 'workshop', label: '所属/位置', value: (row) => emptyCell(row.owner), meta: (row) => emptyCell(row.workshop) },
    { key: 'capacity', label: '标准产能', value: (row) => row.capacityValue ? `${row.capacityValue} ${emptyCell(row.capacityUnit, '')}`.trim() : '—' },
    { key: 'processScope', label: '适用范围', value: (row) => emptyCell(row.processScope) },
    { key: 'status', label: '使用状态', value: (row) => row.status, kind: 'status' },
  ],
};

const simpleListGridTemplates: Record<SimpleEditorPage, string> = {
  uom: 'minmax(220px, 1.4fr) minmax(150px, .9fr) minmax(190px, 1.1fr)',
  currencies: 'minmax(200px, 1.2fr) minmax(130px, .7fr) minmax(150px, .8fr) minmax(150px, .8fr)',
  departments: 'minmax(190px, 1.25fr) minmax(230px, 1.45fr) minmax(100px, .65fr) minmax(120px, .7fr)',
  employees: 'minmax(180px, 1fr) minmax(210px, 1.15fr) minmax(220px, 1.2fr) minmax(120px, .7fr)',
  company: 'minmax(190px, 1.2fr) minmax(160px, 1fr) minmax(170px, 1fr) minmax(220px, 1.35fr) 96px',
  equipment: 'minmax(190px, 1.15fr) minmax(140px, .85fr) minmax(150px, .9fr) minmax(210px, 1.2fr) 96px',
  productionLines: 'minmax(180px, 1.05fr) minmax(170px, 1fr) minmax(130px, .75fr) minmax(220px, 1.25fr) 96px',
};

type ToolbarMenuKey = 'sort' | 'filter' | 'export';
type SortMode = 'newest' | 'oldest' | 'amountDesc' | 'status';
type FilterFieldKey = 'status' | 'party' | 'owner';
type BusinessFilters = {
  status: string;
  party: string;
  owner: string;
  dateStart: string;
  dateEnd: string;
};
type MasterFilterField = {
  key: FilterFieldKey;
  label: string;
  options: string[];
};

function emptyBusinessFilters(): BusinessFilters {
  return {
    status: '',
    party: '',
    owner: '',
    dateStart: '',
    dateEnd: '',
  };
}

function cloneBusinessFilters(filters: BusinessFilters): BusinessFilters {
  return { ...filters };
}

const activePage = computed<ActiveMasterDataTabKey>(() => {
  const page = route.params.page?.toString();
  return page && routePageMap[page] ? routePageMap[page] : 'materials';
});

const pageTitle = computed(() => pageTitles[activePage.value]);
const createButtonLabel = computed(() => createButtonLabels[activePage.value]);
const searchPlaceholder = computed(() => searchPlaceholders[activePage.value]);
const apiPageRows = ref<MasterDataRecord[] | null>(null);
const pageRows = computed(() => apiPageRows.value ?? []);
const isMaterialsPage = computed(() => activePage.value === 'materials');
const isCustomersPage = computed(() => activePage.value === 'customers');
const isSuppliersPage = computed(() => activePage.value === 'suppliers');
const isWarehousesPage = computed(() => activePage.value === 'warehouses');
const isEmployeesPage = computed(() => activePage.value === 'employees');
const isUomPage = computed(() => activePage.value === 'uom');
const isCurrenciesPage = computed(() => activePage.value === 'currencies');
const isSimpleEditorPage = computed(() => simpleEditorPages.includes(activePage.value as SimpleEditorPage));
const simpleColumns = computed(
  () => simpleListColumns[activePage.value as SimpleEditorPage] ?? simpleListColumns.uom,
);
const simpleTableStyle = computed(
  () =>
    ({
      '--simple-grid-template':
        simpleListGridTemplates[activePage.value as SimpleEditorPage] ?? simpleListGridTemplates.uom,
    }) as Record<string, string>,
);
const usesPartyFilter = computed(
  () =>
    activePage.value !== 'uom' &&
    activePage.value !== 'currencies' &&
    activePage.value !== 'departments' &&
    !isEmployeesPage.value &&
    activePage.value !== 'company' &&
    activePage.value !== 'equipment',
);
const usesOwnerFilter = computed(
  () =>
    activePage.value === 'departments'
    || isEmployeesPage.value
    || activePage.value === 'equipment'
    || activePage.value === 'productionLines',
);
const supportsDetailPage = computed(
  () =>
    isMaterialsPage.value ||
    isCustomersPage.value ||
    isSuppliersPage.value ||
    isWarehousesPage.value ||
    isSimpleEditorPage.value,
);

const searchKeyword = ref('');
const openToolbarMenu = ref<ToolbarMenuKey | null>(null);
const sortMode = ref<SortMode>('newest');
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const isListLoading = ref(false);
const listLoadError = ref('');
let listLoadRequestId = 0;
const tableScroll = ref<HTMLElement | null>(null);
const hoveredMasterCode = ref('');
let toastTimer: number | undefined;

const filtersByPage = ref<Record<ActiveMasterDataTabKey, BusinessFilters>>({
  materials: emptyBusinessFilters(),
  customers: emptyBusinessFilters(),
  suppliers: emptyBusinessFilters(),
  warehouses: emptyBusinessFilters(),
  uom: emptyBusinessFilters(),
  currencies: emptyBusinessFilters(),
  departments: emptyBusinessFilters(),
  employees: emptyBusinessFilters(),
  company: emptyBusinessFilters(),
  equipment: emptyBusinessFilters(),
  productionLines: emptyBusinessFilters(),
});
const draftFilters = ref<BusinessFilters>(emptyBusinessFilters());

const currentFilters = computed(() => filtersByPage.value[activePage.value]);
const filterStatus = computed(() => currentFilters.value.status);
const filterParty = computed(() => currentFilters.value.party);
const filterOwner = computed(() => currentFilters.value.owner);
const filterDateStart = computed(() => currentFilters.value.dateStart);
const filterDateEnd = computed(() => currentFilters.value.dateEnd);

const draftFilterStatus = computed({
  get: () => draftFilters.value.status,
  set: (value: string) => updateDraftFilters({ status: value }),
});
const draftFilterParty = computed({
  get: () => draftFilters.value.party,
  set: (value: string) => updateDraftFilters({ party: value }),
});
const draftFilterOwner = computed({
  get: () => draftFilters.value.owner,
  set: (value: string) => updateDraftFilters({ owner: value }),
});
const draftFilterDateStart = computed({
  get: () => draftFilters.value.dateStart,
  set: (value: string) => updateDraftFilters({ dateStart: value }),
});
const draftFilterDateEnd = computed({
  get: () => draftFilters.value.dateEnd,
  set: (value: string) => updateDraftFilters({ dateEnd: value }),
});

const rowsWithLocalStatus = computed(() => pageRows.value);

const filterDateLabel = computed(() => '更新时间');
const sortAmountLabel = computed(() => {
  if (activePage.value === 'employees') return '姓名顺序';
  if (activePage.value === 'uom') return '单位顺序';
  return '名称顺序';
});

const filterStatusOptions = computed(() =>
  isMaterialsPage.value ? ['启用', '停用'] : uniqueValues(rowsWithLocalStatus.value.map((row) => row.status)),
);
const filterPartyOptions = computed(() => uniqueValues(rowsWithLocalStatus.value.map((row) => row.type)));
const filterOwnerOptions = computed(() => uniqueValues(rowsWithLocalStatus.value.map((row) => row.owner)));

const filterFields = computed<MasterFilterField[]>(() => {
  const fields: MasterFilterField[] = [
    { key: 'status', label: '使用状态', options: filterStatusOptions.value },
  ];

  if (usesPartyFilter.value) {
    fields.push({ key: 'party', label: partyLabels[activePage.value], options: filterPartyOptions.value });
  }

  if (usesOwnerFilter.value) {
    fields.push({ key: 'owner', label: ownerLabels[activePage.value], options: filterOwnerOptions.value });
  }

  return fields;
});

const activeFilterCount = computed(() =>
  [
    currentFilters.value.status,
    usesPartyFilter.value ? currentFilters.value.party : '',
    usesOwnerFilter.value ? currentFilters.value.owner : '',
    currentFilters.value.dateStart,
    currentFilters.value.dateEnd,
  ].filter(Boolean).length,
);
const hasListConstraints = computed(() => Boolean(normalized(searchKeyword.value)) || activeFilterCount.value > 0);
const masterEmptyTitle = computed(() => (hasListConstraints.value ? `未找到匹配${pageTitle.value}` : `暂无${pageTitle.value}`));
const masterEmptyDescription = computed(() =>
  hasListConstraints.value ? '可以调整搜索、排序或筛选条件后再查看。' : `新建${pageTitle.value}后会显示在这里。`,
);

const visibleRows = computed(() => {
  const filtered = rowsWithLocalStatus.value.filter((row) => {
    const matchesSearch = includesKeyword(masterSearchValues(row));
    const matchesStatus = !filterStatus.value || row.status === filterStatus.value;
    const matchesParty = !usesPartyFilter.value || matchesFilterValue(row.type, filterParty.value);
    const matchesOwner = !usesOwnerFilter.value || matchesFilterValue(row.owner, filterOwner.value);
    const matchesDate =
      (!filterDateStart.value || row.updatedAt >= filterDateStart.value) &&
      (!filterDateEnd.value || row.updatedAt <= filterDateEnd.value);

    return matchesSearch && matchesStatus && matchesParty && matchesOwner && matchesDate;
  });

  return [...filtered].sort((a, b) => {
    if (sortMode.value === 'oldest') {
      return a.updatedAt.localeCompare(b.updatedAt);
    }

    if (sortMode.value === 'amountDesc') {
      return a.name.localeCompare(b.name, 'zh-CN');
    }

    if (sortMode.value === 'status') {
      return statusRank(a.status) - statusRank(b.status);
    }

    return b.updatedAt.localeCompare(a.updatedAt);
  });
});

function normalized(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function includesKeyword(values: unknown[]) {
  const keyword = normalized(searchKeyword.value);

  if (!keyword) {
    return true;
  }

  return values.some((value) => normalized(value).includes(keyword));
}

function masterSearchValues(row: MasterDataRecord): unknown[] {
  if (isMaterialsPage.value) {
    return [
      row.code,
      row.name,
      row.englishName,
      row.model,
      row.spec,
      row.englishModel,
      row.englishSpec,
      row.category,
      row.type,
      row.uom,
      materialSalesScope(row),
      materialBusinessScope(row),
      materialBatchText(row),
      row.shelfLife,
      materialIncomingQuality(row),
      materialInboundQuality(row),
    ];
  }

  if (isCustomersPage.value) {
    return [row.code, row.name, row.type, row.contact, row.phone, row.regionType, row.province, row.city, row.address];
  }

  if (isSuppliersPage.value) {
    return [row.code, row.name, row.type, row.contact, row.phone, row.regionType, row.province, row.city, row.address];
  }

  if (isWarehousesPage.value) {
    return [
      row.code,
      row.name,
      row.type,
      row.company,
      row.regionType,
      row.province,
      row.city,
      row.address,
      row.locationCount,
      row.binPrefix,
    ];
  }

  if (activePage.value === 'uom') {
    return [row.code, row.name, row.englishAbbreviation];
  }

  if (activePage.value === 'currencies') {
    return [row.code, row.name, row.symbol];
  }

  if (activePage.value === 'departments') {
    return [row.code, row.name, row.owner, row.parentDepartment];
  }

  if (activePage.value === 'employees') {
    return [row.code, row.name, row.englishName, row.owner, row.position, row.linkedAccount, row.phone, row.email];
  }

  if (activePage.value === 'company') {
    return [
      row.code,
      row.name,
      row.englishName,
      row.primary,
      row.type,
      row.taxNumber,
      row.phone,
      row.email,
      row.address,
      row.englishAddress,
    ];
  }

  if (activePage.value === 'equipment') {
    return [row.code, row.name, row.brand, row.model, row.owner, row.primary, row.serialNumber];
  }

  return [
    row.code,
    row.name,
    row.type,
    row.owner,
    row.workshop,
    row.capacityValue,
    row.capacityUnit,
    row.processScope,
  ];
}

function matchesFilterValue(value: unknown, filter: string) {
  return !filter || normalized(value) === normalized(filter);
}

function uniqueValues(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
}

function statusRank(status: string) {
  const ranks: Record<string, number> = {
    启用: 1,
    维护中: 2,
    停用: 3,
  };

  return ranks[status] ?? 99;
}

function statusClass(status: string) {
  return statusPresentationClass(status);
}

function materialValue(
  row: MasterDataRecord,
  key:
    | 'model'
    | 'spec'
    | 'category'
    | 'uom'
    | 'batchControl'
    | 'shelfLife'
    | 'qualityControl'
    | 'incomingQualityControl'
    | 'inboundQualityControl'
    | 'supplyStrategy',
) {
  if (key === 'shelfLife' && (!row[key] || row[key] === '不适用')) return '无效期要求';
  const value = String(row[key] ?? '').trim();
  return value || '—';
}

function materialSalesScope(row: MasterDataRecord) {
  return (row.isSaleable ?? (row.category === '成品' || row.type === '成品')) ? '可销售' : '不可销售';
}

function materialIsPurchasable(row: MasterDataRecord) {
  return row.isPurchasable ?? ['采购', '采购+自制'].includes(row.supplyStrategy || '');
}

function materialIsProducible(row: MasterDataRecord) {
  return row.isProducible ?? ['自制', '采购+自制', '委外'].includes(row.supplyStrategy || '');
}

function materialBusinessScope(row: MasterDataRecord) {
  return [
    row.isSaleable ?? (row.category === '成品' || row.type === '成品') ? '可销售' : '',
    materialIsPurchasable(row) ? '可采购' : '',
    materialIsProducible(row) ? '可产出' : '',
  ].filter(Boolean).join(' · ') || '仅仓储';
}

function materialBatchText(row: MasterDataRecord) {
  return row.batchControl === '不追踪批次' ? '不追踪' : '按批次';
}

function materialIncomingQuality(row: MasterDataRecord) {
  return row.incomingQualityControl || row.qualityControl || '—';
}

function materialInboundQuality(row: MasterDataRecord) {
  return row.inboundQualityControl || row.qualityControl || '—';
}

function materialInspectionSummary(row: MasterDataRecord) {
  const rules = [
    materialIsPurchasable(row) ? `到货：${materialIncomingQuality(row)}` : '',
    materialIsProducible(row) ? `完工：${materialInboundQuality(row)}` : '',
  ].filter(Boolean);
  return rules.join(' · ') || '无默认检验';
}

function customerContact(row: MasterDataRecord) {
  return String(row.contact ?? '').trim()
    || String(row.primary || '').split('·')[0]?.trim()
    || '—';
}

function customerPhone(row: MasterDataRecord) {
  return String(row.phone ?? '').trim()
    || String(row.primary || '').split('·')[1]?.trim()
    || '—';
}

function customerAddress(row: MasterDataRecord) {
  return [row.province, row.city, row.address].filter(Boolean).join('') || row.secondary || '—';
}

function customerRegion(row: MasterDataRecord) {
  return row.regionType === '海外' ? '海外' : [row.province, row.city].filter(Boolean).join(' / ') || '国内';
}

function normalizeCustomerLogisticsMode(value?: string) {
  const legacyMap: Record<string, string> = {
    物流发运: '拼车物流',
    专车配送: '整车货运',
    送货到厂: '本厂配送',
    快递: '快递快运',
  };
  return legacyMap[value || ''] || value || '本厂配送';
}

function customerBusinessSummary(row: MasterDataRecord) {
  return row.paymentMethod || '—';
}

function customerCreditText(row: MasterDataRecord) {
  if (row.creditLimit === undefined || row.creditLimit === null || row.creditLimit === '') return '—';
  const rawValue = String(row.creditLimit);
  const amount = Number(rawValue.replace(/[^\d.-]/g, ''));
  const value = Number.isFinite(amount)
    ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(amount)
    : rawValue;
  return `额度 ${row.currency || 'CNY'} ${value}`;
}

function customerBusinessMeta(row: MasterDataRecord) {
  const term = row.paymentMethod === '月结' ? `账期 ${row.paymentTermDays || 0} 天` : '';
  return [customerCreditText(row), term].filter(Boolean).join(' · ');
}

function supplierContact(row: MasterDataRecord) {
  return String(row.contact ?? '').trim()
    || String(row.primary || '').split('·')[0]?.trim()
    || '—';
}

function supplierPhone(row: MasterDataRecord) {
  return String(row.phone ?? '').trim()
    || String(row.primary || '').split('·')[1]?.trim()
    || '—';
}

function supplierAddress(row: MasterDataRecord) {
  return [row.province, row.city, row.address].filter(Boolean).join('') || row.secondary || '—';
}

function supplierRegion(row: MasterDataRecord) {
  return row.regionType === '海外' ? '海外' : [row.province, row.city].filter(Boolean).join(' / ') || '国内';
}

function supplierPurchaseSummary(row: MasterDataRecord) {
  return row.deliveryMethod || '送货到厂';
}

function supplierPurchaseMeta(row: MasterDataRecord) {
  const payment = row.paymentMethod === '月结'
    ? `月结 ${row.paymentTermDays || 0} 天`
    : row.paymentMethod || '—';
  return [payment, row.currency || 'CNY', row.taxRate || row.taxMode || '—'].join(' · ');
}

function supplierUsageHint(row: MasterDataRecord) {
  return row.status === '停用' ? '新业务不可选' : '';
}

function warehouseLocation(row: MasterDataRecord) {
  return row.locationCount ? `${row.locationCount} 个库位` : '不细分库位';
}

function warehouseRegion(row: MasterDataRecord) {
  if (row.regionType === '海外') return '海外';
  return [row.province, row.city].filter(Boolean).join(' · ') || '—';
}

function warehouseAddress(row: MasterDataRecord) {
  return row.address || '—';
}

function warehouseUsageHint(row: MasterDataRecord) {
  return row.status === '停用' ? '新业务不可选' : '';
}

function warehouseFunctionSummary(row: MasterDataRecord) {
  return row.warehouseFunctions?.length ? row.warehouseFunctions.join(' · ') : '未配置';
}

function updateCurrentFilters(filters: BusinessFilters) {
  filtersByPage.value = {
    ...filtersByPage.value,
    [activePage.value]: cloneBusinessFilters(filters),
  };
}

function updateDraftFilters(patch: Partial<BusinessFilters>) {
  draftFilters.value = {
    ...draftFilters.value,
    ...patch,
  };
}

function syncDraftFilters() {
  draftFilters.value = cloneBusinessFilters(currentFilters.value);
}

function toggleToolbarMenu(menu: ToolbarMenuKey) {
  const shouldOpen = openToolbarMenu.value !== menu;
  openToolbarMenu.value = shouldOpen ? menu : null;

  if (menu === 'filter' && shouldOpen) {
    syncDraftFilters();
  }
}

function closeToolbarMenu() {
  openToolbarMenu.value = null;
}

function setSortMode(mode: SortMode) {
  sortMode.value = mode;
  closeToolbarMenu();
}

function clearFilters() {
  const emptyFilters = emptyBusinessFilters();
  updateCurrentFilters(emptyFilters);
  draftFilters.value = cloneBusinessFilters(emptyFilters);
  showToast('已清空筛选条件');
}

function applyFilters() {
  if (
    draftFilters.value.dateStart
    && draftFilters.value.dateEnd
    && draftFilters.value.dateStart > draftFilters.value.dateEnd
  ) {
    showToast(`${filterDateLabel.value}起不能晚于${filterDateLabel.value}止`, 'error');
    return;
  }
  updateCurrentFilters(draftFilters.value);
  closeToolbarMenu();
  showToast('已应用当前筛选条件');
}

function clearListConstraints() {
  searchKeyword.value = '';
  clearFilters();
  closeFloatingMenus();
}

function closeFloatingMenus() {
  closeToolbarMenu();
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2200);
}

async function loadMasterRows() {
  const page = activePage.value;
  const requestId = ++listLoadRequestId;
  isListLoading.value = true;
  listLoadError.value = '';
  apiPageRows.value = null;

  try {
    const rows = await listMasterRecords(page);
    if (requestId !== listLoadRequestId) return;
    apiPageRows.value = rows;
  } catch (error) {
    if (requestId !== listLoadRequestId) return;
    apiPageRows.value = [];
    listLoadError.value = error instanceof Error ? error.message : '基础资料加载失败';
  } finally {
    if (requestId === listLoadRequestId) isListLoading.value = false;
  }
}

function materialDetailPath(code: string) {
  return `/master-data/materials/${encodeURIComponent(code)}`;
}

function customerDetailPath(code: string) {
  return `/master-data/customers/${encodeURIComponent(code)}`;
}

function supplierDetailPath(code: string) {
  return `/master-data/suppliers/${encodeURIComponent(code)}`;
}

function warehouseDetailPath(code: string) {
  return `/master-data/warehouses/${encodeURIComponent(code)}`;
}

function masterPagePath(page: ActiveMasterDataTabKey) {
  return page === 'productionLines' ? 'production-lines' : page;
}

function simpleMasterDetailPath(code: string) {
  return `/master-data/${masterPagePath(activePage.value)}/${encodeURIComponent(code)}`;
}

function openCreatePage() {
  if (!canWriteMasterData.value) {
    showToast(masterDataReadonlyReason.value, 'error');
    return;
  }
  if (isMaterialsPage.value) {
    router.push('/master-data/materials/new');
    return;
  }

  if (isCustomersPage.value) {
    router.push('/master-data/customers/new');
    return;
  }

  if (isSuppliersPage.value) {
    router.push('/master-data/suppliers/new');
    return;
  }

  if (isWarehousesPage.value) {
    router.push('/master-data/warehouses/new');
    return;
  }

  if (isSimpleEditorPage.value) {
    router.push(`/master-data/${masterPagePath(activePage.value)}/new`);
    return;
  }
}

function openSupportedDetail(row: MasterDataRecord) {
  if (isMaterialsPage.value) {
    router.push(materialDetailPath(row.code));
    return;
  }

  if (isCustomersPage.value) {
    router.push(customerDetailPath(row.code));
    return;
  }

  if (isSuppliersPage.value) {
    router.push(supplierDetailPath(row.code));
    return;
  }

  if (isWarehousesPage.value) {
    router.push(warehouseDetailPath(row.code));
    return;
  }

  if (isSimpleEditorPage.value) {
    router.push(simpleMasterDetailPath(row.code));
  }
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function simpleExportRows(page: SimpleEditorPage, rows: MasterDataRecord[]): unknown[][] {
  if (page === 'uom') {
    return [
      ['编码', '单位', '英文简称', '使用状态', '更新时间', '备注'],
      ...rows.map((row) => [row.code, row.name, row.englishAbbreviation, row.status, row.updatedAt, row.note]),
    ];
  }

  if (page === 'currencies') {
    return [
      ['币种代码', '币种名称', '货币符号', '金额小数位', '使用状态', '更新时间', '备注'],
      ...rows.map((row) => [row.code, row.name, row.symbol, row.decimalPlaces, row.status, row.updatedAt, row.note]),
    ];
  }

  if (page === 'departments') {
    return [
      ['编码', '部门名称', '所属公司', '上级部门', '启用员工数', '使用状态', '更新时间', '备注'],
      ...rows.map((row) => [row.code, row.name, row.owner, row.parentDepartment, row.employeeCount, row.status, row.updatedAt, row.note]),
    ];
  }

  if (page === 'employees') {
    return [
      ['编码', '姓名', '英文名', '性别', '所属部门', '岗位/职务', '关联账号', '手机', '邮箱', '入职日期', '使用状态', '更新时间', '备注'],
      ...rows.map((row) => [row.code, row.name, row.englishName, row.gender, row.owner, row.position, row.linkedAccount, row.phone || row.contact, row.email, row.hireDate, row.status, row.updatedAt, row.note]),
    ];
  }

  if (page === 'company') {
    return [
      ['编码', '公司名称', '英文名称', '公司简称', '组织类型', '统一社会信用代码', '电话', '邮箱', '官网', '中文经营地址', '英文地址', '开票抬头', '默认税率', '开票电话', '注册地址', '开户行', '银行账号', '使用状态', '更新时间', '备注'],
      ...rows.map((row) => [row.code, row.name, row.englishName, row.primary, row.type, row.taxNumber, row.phone, row.email, row.website, row.address, row.englishAddress, row.invoiceTitle, row.secondary, row.invoicePhone, row.registeredAddress, row.bankName, row.bankAccount, row.status, row.updatedAt, row.note]),
    ];
  }

  if (page === 'equipment') {
    return [
      ['编码', '设备名称', '品牌', '型号', '规格', '出厂编号', '所属部门', '启用日期', '使用位置', '使用状态', '更新时间', '设备说明'],
      ...rows.map((row) => [row.code, row.name, row.brand, row.model, row.spec, row.serialNumber, row.owner, row.startDate, row.primary, row.status, row.updatedAt, row.note]),
    ];
  }

  return [
    ['编码', '产线名称', '产线类型', '所属部门', '车间/区域', '标准产能', '产能单位', '适用范围', '使用状态', '更新时间', '产线说明'],
    ...rows.map((row) => [row.code, row.name, row.type, row.owner, row.workshop, row.capacityValue, row.capacityUnit, row.processScope, row.status, row.updatedAt, row.note]),
  ];
}

function exportVisibleRows() {
  if (!visibleRows.value.length) {
    showToast('当前没有可导出的数据');
    closeToolbarMenu();
    return;
  }

  const rows =
    activePage.value === 'materials'
      ? [
          ['编码', '名称', '型号', '规格', '基础单位', '英文名称', '英文型号', '英文规格', '分类', '可销售', '可采购', '可产出', '批次追踪', '效期', '到货检验', '完工检验', '常用仓库', '使用状态', '更新时间'],
          ...visibleRows.value.map((row) => [
            row.code,
            row.name,
            materialValue(row, 'model'),
            materialValue(row, 'spec'),
            materialValue(row, 'uom'),
            row.englishName ?? '',
            row.englishModel ?? '',
            row.englishSpec ?? '',
            materialValue(row, 'category'),
            materialSalesScope(row),
            materialIsPurchasable(row) ? '是' : '否',
            materialIsProducible(row) ? '是' : '否',
            materialBatchText(row),
            materialValue(row, 'shelfLife'),
            materialIncomingQuality(row),
            materialInboundQuality(row),
            row.defaultWarehouse ?? '',
            row.status,
            row.updatedAt,
          ]),
        ]
      : activePage.value === 'customers'
        ? [
            ['编码', '客户名称', '客户类型', '联系人', '联系方式', '邮箱', '公司地区', '公司地址', '默认物流', '默认收货人', '默认收货电话', '默认收货地址', '结算方式', '账期（天）', '信用额度', '结算币种', '计价方式', '开票抬头', '税号', '注册地址', '开票联系电话', '开户行', '银行账号', '使用状态', '更新时间'],
            ...visibleRows.value.map((row) => [
              row.code,
              row.name,
              row.type,
              customerContact(row),
              customerPhone(row),
              row.email ?? '',
              customerRegion(row),
              customerAddress(row),
              normalizeCustomerLogisticsMode(row.defaultLogisticsMode || row.deliveryMethod),
              row.defaultShipContact ?? '',
              row.defaultShipPhone ?? '',
              row.defaultShipAddress ?? '',
              row.paymentMethod ?? '',
              row.paymentTermDays ?? '',
              row.creditLimit ?? '',
              row.currency ?? '',
              row.taxMode ?? '',
              row.invoiceTitle ?? '',
              row.taxNumber ?? '',
              row.registeredAddress ?? '',
              row.invoicePhone ?? '',
              row.bankName ?? '',
              row.bankAccount ?? '',
              row.status,
              row.updatedAt,
            ]),
          ]
        : activePage.value === 'suppliers'
          ? [
              ['编码', '供应商名称', '供应商类型', '联系人', '联系方式', '邮箱', '公司地区', '公司地址', '默认交付', '付款方式', '账期（天）', '结算币种', '税率', '开票抬头', '税号', '注册地址', '开票联系电话', '开户行', '银行账号', '使用状态', '更新时间'],
              ...visibleRows.value.map((row) => [
                row.code,
                row.name,
                row.type,
                supplierContact(row),
                supplierPhone(row),
                row.email ?? '',
                supplierRegion(row),
                supplierAddress(row),
                supplierPurchaseSummary(row),
                row.paymentMethod ?? '',
                row.paymentTermDays ?? '',
                row.currency ?? '',
                row.taxRate ?? row.taxMode ?? '',
                row.invoiceTitle ?? '',
                row.taxNumber ?? '',
                row.registeredAddress ?? '',
                row.invoicePhone ?? '',
                row.bankName ?? '',
                row.bankAccount ?? '',
                row.status,
                row.updatedAt,
              ]),
            ]
          : activePage.value === 'warehouses'
            ? [
                ['编码', '仓库名称', '仓库类型', '所属公司', '地区', '地址', '库位数量', '库位前缀', '使用状态', '更新时间'],
                ...visibleRows.value.map((row) => [
                  row.code,
                  row.name,
                  row.type,
                  row.company ?? '',
                  warehouseRegion(row),
                  warehouseAddress(row),
                  row.locationCount ?? 0,
                  row.binPrefix ?? '',
                  row.status,
                  row.updatedAt,
                ]),
              ]
            : simpleExportRows(activePage.value as SimpleEditorPage, visibleRows.value);
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${pageTitle.value}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  closeToolbarMenu();
  showToast('已导出当前筛选结果');
}

function handleDocumentClick() {
  closeFloatingMenus();
}

function resetTableScroll() {
  void nextTick(() => {
    if (tableScroll.value) {
      tableScroll.value.scrollLeft = 0;
    }
  });
}

watch(
  () => activePage.value,
  () => {
    searchKeyword.value = '';
    apiPageRows.value = null;
    void loadMasterRows();
    closeFloatingMenus();
    syncDraftFilters();
    resetTableScroll();
  },
);

usePageRefresh(loadMasterRows);

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
  void loadMasterRows();
  syncDraftFilters();
  resetTableScroll();
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <section class="list-page master-page">
    <div class="quote-page master-list-page">
      <PageTopbarPortal>
        <template #actions>
          <button class="primary-action" type="button" :disabled="!canWriteMasterData" :title="masterDataReadonlyReason || `新建${pageTitle}`" @click="openCreatePage">
            <Plus :size="16" />
            {{ createButtonLabel }}
          </button>
        </template>
      </PageTopbarPortal>

      <BusinessListToolbar
        v-model:search="searchKeyword"
        v-model:filter-status="draftFilterStatus"
        v-model:filter-party="draftFilterParty"
        v-model:filter-owner="draftFilterOwner"
        v-model:filter-date-start="draftFilterDateStart"
        v-model:filter-date-end="draftFilterDateEnd"
        :search-placeholder="searchPlaceholder"
        :open-menu="openToolbarMenu"
        :sort-mode="sortMode"
        :sort-amount-label="sortAmountLabel"
        status-sort-label="使用状态优先"
        :show-status-sort="true"
        :active-filter-count="activeFilterCount"
        :filter-fields="filterFields"
        :filter-date-label="filterDateLabel"
        @toggle-menu="toggleToolbarMenu"
        @sort="setSortMode"
        @export-rows="exportVisibleRows"
        @clear-filters="clearFilters"
        @apply-filters="applyFilters"
      />

      <div class="quote-table-shell master-table-shell master-table-shell-clean">
        <div ref="tableScroll" class="quote-data-scroll">
          <div v-if="isMaterialsPage" class="data-table quote-table master-data-table master-material-table">
            <div class="table-row table-head">
              <span>物料</span>
              <span>型号/规格</span>
              <span>业务属性</span>
              <span>单位/追溯</span>
              <span>质量/效期</span>
              <span>使用状态</span>
            </div>

            <div
              v-for="row in visibleRows"
              :key="row.code"
              class="table-row"
              :class="{ 'is-clickable': supportsDetailPage, 'is-row-highlighted': hoveredMasterCode === row.code }"
              :role="supportsDetailPage ? 'button' : undefined"
              :tabindex="supportsDetailPage ? 0 : undefined"
              :aria-label="supportsDetailPage ? `打开${pageTitle} ${row.code}` : undefined"
              :title="supportsDetailPage ? `打开${pageTitle} ${row.code}` : undefined"
              @pointerenter="hoveredMasterCode = row.code"
              @pointerleave="hoveredMasterCode = ''"
              @mouseenter="hoveredMasterCode = row.code"
              @mouseleave="hoveredMasterCode = ''"
              @focus="hoveredMasterCode = row.code"
              @blur="hoveredMasterCode = ''"
              @click="openSupportedDetail(row)"
              @keydown.enter="openSupportedDetail(row)"
              @keydown.space.prevent="openSupportedDetail(row)"
            >
              <span class="material-identity-cell">
                <i class="material-thumb">
                  <img v-if="row.imageDataUrl" :src="row.imageDataUrl" :alt="row.name" />
                  <span v-else>{{ row.imageLabel ?? 'IMG' }}</span>
                </i>
                <span class="master-name-cell">
                  <strong>{{ row.name }}</strong>
                  <small>{{ row.code }}</small>
                </span>
              </span>
              <span class="master-detail-cell">
                <strong>{{ materialValue(row, 'model') }}</strong>
                <small :title="materialValue(row, 'spec')">{{ materialValue(row, 'spec') }}</small>
              </span>
              <span class="master-detail-cell">
                <strong>{{ materialValue(row, 'category') }}</strong>
                <small>{{ materialBusinessScope(row) }}</small>
              </span>
              <span class="master-detail-cell">
                <strong>{{ materialValue(row, 'uom') }}</strong>
                <small>{{ materialBatchText(row) }}</small>
              </span>
              <span class="master-detail-cell">
                <strong :title="materialInspectionSummary(row)">{{ materialInspectionSummary(row) }}</strong>
                <small>效期：{{ materialValue(row, 'shelfLife') }}</small>
              </span>
              <span class="master-status-update-cell">
                <i class="mini-status" :class="statusClass(row.status)">{{ row.status }}</i>
                <small v-if="row.status === '停用'">新业务不可选</small>
              </span>
            </div>
          </div>

          <div v-else-if="isCustomersPage" class="data-table quote-table master-data-table master-customer-table">
            <div class="table-row table-head">
              <span>客户</span>
              <span>联系方式</span>
              <span>公司地址</span>
              <span>商务默认值</span>
              <span>使用状态</span>
            </div>

            <div
              v-for="row in visibleRows"
              :key="row.code"
              class="table-row"
              :class="{ 'is-clickable': supportsDetailPage, 'is-row-highlighted': hoveredMasterCode === row.code }"
              :role="supportsDetailPage ? 'button' : undefined"
              :tabindex="supportsDetailPage ? 0 : undefined"
              :aria-label="supportsDetailPage ? `打开${pageTitle} ${row.code}` : undefined"
              :title="supportsDetailPage ? `打开${pageTitle} ${row.code}` : undefined"
              @pointerenter="hoveredMasterCode = row.code"
              @pointerleave="hoveredMasterCode = ''"
              @mouseenter="hoveredMasterCode = row.code"
              @mouseleave="hoveredMasterCode = ''"
              @focus="hoveredMasterCode = row.code"
              @blur="hoveredMasterCode = ''"
              @click="openSupportedDetail(row)"
              @keydown.enter="openSupportedDetail(row)"
              @keydown.space.prevent="openSupportedDetail(row)"
            >
              <span class="master-name-cell">
                <strong>{{ row.name }}</strong>
                <small>{{ row.code }} · {{ row.type }}</small>
              </span>
              <span class="master-detail-cell">
                <strong>{{ customerContact(row) }}</strong>
                <small>{{ customerPhone(row) }}</small>
              </span>
              <span class="master-detail-cell">
                <strong>{{ customerRegion(row) }}</strong>
                <small>{{ customerAddress(row) }}</small>
              </span>
              <span class="master-detail-cell">
                <strong>{{ customerBusinessSummary(row) }}</strong>
                <small>{{ customerBusinessMeta(row) }}</small>
              </span>
              <span class="master-status-update-cell">
                <i class="mini-status" :class="statusClass(row.status)">{{ row.status }}</i>
                <small v-if="row.status === '停用'">新业务不可选</small>
              </span>
            </div>
          </div>

          <div v-else-if="isSuppliersPage" class="data-table quote-table master-data-table master-supplier-table">
            <div class="table-row table-head">
              <span>供应商</span>
              <span>联系方式</span>
              <span>公司地址</span>
              <span>采购默认值</span>
              <span>使用状态</span>
            </div>

            <div
              v-for="row in visibleRows"
              :key="row.code"
              class="table-row"
              :class="{ 'is-clickable': supportsDetailPage, 'is-row-highlighted': hoveredMasterCode === row.code }"
              :role="supportsDetailPage ? 'button' : undefined"
              :tabindex="supportsDetailPage ? 0 : undefined"
              :aria-label="supportsDetailPage ? `打开${pageTitle} ${row.code}` : undefined"
              :title="supportsDetailPage ? `打开${pageTitle} ${row.code}` : undefined"
              @pointerenter="hoveredMasterCode = row.code"
              @pointerleave="hoveredMasterCode = ''"
              @mouseenter="hoveredMasterCode = row.code"
              @mouseleave="hoveredMasterCode = ''"
              @focus="hoveredMasterCode = row.code"
              @blur="hoveredMasterCode = ''"
              @click="openSupportedDetail(row)"
              @keydown.enter="openSupportedDetail(row)"
              @keydown.space.prevent="openSupportedDetail(row)"
            >
              <span class="master-name-cell">
                <strong>{{ row.name }}</strong>
                <small>{{ row.code }} · {{ row.type }}</small>
              </span>
              <span class="master-detail-cell">
                <strong>{{ supplierContact(row) }}</strong>
                <small>{{ supplierPhone(row) }}</small>
              </span>
              <span class="master-detail-cell">
                <strong>{{ supplierRegion(row) }}</strong>
                <small>{{ supplierAddress(row) }}</small>
              </span>
              <span class="master-detail-cell">
                <strong>{{ supplierPurchaseSummary(row) }}</strong>
                <small>{{ supplierPurchaseMeta(row) }}</small>
              </span>
              <span class="master-status-update-cell">
                <i class="mini-status" :class="statusClass(row.status)">{{ row.status }}</i>
                <small v-if="supplierUsageHint(row)">{{ supplierUsageHint(row) }}</small>
              </span>
            </div>
          </div>

          <div v-else-if="isWarehousesPage" class="data-table quote-table master-data-table master-warehouse-table">
            <div class="table-row table-head">
              <span>仓库</span>
              <span>所属公司</span>
              <span>位置</span>
              <span>库位</span>
              <span>业务职能</span>
              <span>使用状态</span>
            </div>

            <div
              v-for="row in visibleRows"
              :key="row.code"
              class="table-row"
              :class="{ 'is-clickable': supportsDetailPage, 'is-row-highlighted': hoveredMasterCode === row.code }"
              :role="supportsDetailPage ? 'button' : undefined"
              :tabindex="supportsDetailPage ? 0 : undefined"
              :aria-label="supportsDetailPage ? `打开${pageTitle} ${row.code}` : undefined"
              :title="supportsDetailPage ? `打开${pageTitle} ${row.code}` : undefined"
              @pointerenter="hoveredMasterCode = row.code"
              @pointerleave="hoveredMasterCode = ''"
              @mouseenter="hoveredMasterCode = row.code"
              @mouseleave="hoveredMasterCode = ''"
              @focus="hoveredMasterCode = row.code"
              @blur="hoveredMasterCode = ''"
              @click="openSupportedDetail(row)"
              @keydown.enter="openSupportedDetail(row)"
              @keydown.space.prevent="openSupportedDetail(row)"
            >
              <span class="master-name-cell">
                <strong>{{ row.name }}</strong>
                <small>{{ row.code }} · {{ row.type }}</small>
              </span>
              <span class="master-detail-cell">
                <strong>{{ row.company || '—' }}</strong>
              </span>
              <span class="master-detail-cell">
                <strong>{{ warehouseRegion(row) }}</strong>
                <small>{{ warehouseAddress(row) }}</small>
              </span>
              <span class="master-detail-cell">
                <strong>{{ warehouseLocation(row) }}</strong>
                <small>{{ row.locationCount ? `库位前缀 ${row.binPrefix || '—'}` : '不细分库位' }}</small>
              </span>
              <span class="master-detail-cell">
                <strong>{{ warehouseFunctionSummary(row) }}</strong>
              </span>
              <span class="master-status-update-cell">
                <i class="mini-status" :class="statusClass(row.status)">{{ row.status }}</i>
                <small v-if="warehouseUsageHint(row)">{{ warehouseUsageHint(row) }}</small>
              </span>
            </div>
          </div>

          <div
            v-else
            class="data-table quote-table master-data-table master-simple-table"
            :style="simpleTableStyle"
          >
            <div class="table-row table-head">
              <span v-for="column in simpleColumns" :key="column.key">{{ column.label }}</span>
            </div>

            <div
              v-for="row in visibleRows"
              :key="row.code"
              class="table-row"
              :class="{ 'is-clickable': supportsDetailPage, 'is-row-highlighted': hoveredMasterCode === row.code }"
              :role="supportsDetailPage ? 'button' : undefined"
              :tabindex="supportsDetailPage ? 0 : undefined"
              :aria-label="supportsDetailPage ? `打开${pageTitle} ${row.code}` : undefined"
              :title="supportsDetailPage ? `打开${pageTitle} ${row.code}` : undefined"
              @pointerenter="hoveredMasterCode = row.code"
              @pointerleave="hoveredMasterCode = ''"
              @mouseenter="hoveredMasterCode = row.code"
              @mouseleave="hoveredMasterCode = ''"
              @focus="hoveredMasterCode = row.code"
              @blur="hoveredMasterCode = ''"
              @click="openSupportedDetail(row)"
              @keydown.enter="openSupportedDetail(row)"
              @keydown.space.prevent="openSupportedDetail(row)"
            >
              <span
                v-for="column in simpleColumns"
                :key="column.key"
                :class="{ 'quote-code': column.key === 'code' }"
              >
                <template v-if="column.kind === 'status'">
                  <i class="mini-status" :class="statusClass(row.status)">{{ column.value(row) }}</i>
                </template>
                <template v-else>
                  <strong v-if="column.strong">{{ column.value(row) }}</strong>
                  <template v-else>{{ column.value(row) }}</template>
                  <small v-if="column.meta">{{ column.meta(row) }}</small>
                </template>
              </span>
            </div>
          </div>
        </div>

      </div>

      <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadMasterRows" />
      <div v-else-if="!visibleRows.length" class="list-empty-state">
        <strong>{{ masterEmptyTitle }}</strong>
        <span>{{ masterEmptyDescription }}</span>
        <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
          清空条件
        </button>
      </div>

      <div class="quote-card-list master-card-list">
        <article
          v-for="row in visibleRows"
          :key="`${row.code}-card`"
          class="quote-card master-card"
          :class="{ 'is-clickable': supportsDetailPage }"
          :role="supportsDetailPage ? 'button' : undefined"
          :tabindex="supportsDetailPage ? 0 : undefined"
          :aria-label="supportsDetailPage ? `打开${pageTitle} ${row.code}` : undefined"
          :title="supportsDetailPage ? `打开${pageTitle} ${row.code}` : undefined"
          @click="openSupportedDetail(row)"
          @keydown.enter="openSupportedDetail(row)"
          @keydown.space.prevent="openSupportedDetail(row)"
        >
          <div class="quote-card-head">
            <i v-if="isMaterialsPage" class="material-thumb">
              <img v-if="row.imageDataUrl" :src="row.imageDataUrl" :alt="row.name" />
              <span v-else>{{ row.imageLabel ?? 'IMG' }}</span>
            </i>
            <div>
              <strong>{{ row.name }}</strong>
              <span>{{ row.code }}</span>
            </div>
            <i class="mini-status" :class="statusClass(row.status)">{{ row.status }}</i>
          </div>
          <div class="quote-card-products master-card-info">
            <div v-if="isMaterialsPage">
              <span>{{ materialValue(row, 'model') }} · {{ materialValue(row, 'spec') }} · {{ materialValue(row, 'category') }}</span>
              <small>{{ materialBusinessScope(row) }} · {{ materialValue(row, 'uom') }}</small>
              <small>{{ materialInspectionSummary(row) }} · {{ materialBatchText(row) }} · {{ materialValue(row, 'shelfLife') }}</small>
            </div>
            <div v-else-if="isUomPage">
              <span>英文简称：{{ row.englishAbbreviation || '—' }}</span>
            </div>
            <div v-else-if="isCurrenciesPage">
              <span>{{ row.name }}</span>
              <small>{{ row.symbol || '—' }} · {{ row.decimalPlaces ?? 2 }} 位小数</small>
            </div>
            <div v-else-if="activePage === 'departments'">
              <span>所属公司：{{ row.owner || '—' }}</span>
              <small>上级部门：{{ row.parentDepartment || '公司直属' }}</small>
              <small>启用员工：{{ row.employeeCount ?? 0 }} 人</small>
            </div>
            <div v-else-if="isEmployeesPage">
              <span>{{ row.englishName || '—' }} · {{ row.owner || '—' }} · {{ row.position || '—' }}</span>
              <small>关联账号：{{ row.linkedAccount || '未分配' }}</small>
              <small>{{ row.phone || row.contact || '—' }} · {{ row.email || '—' }}</small>
            </div>
            <div v-else-if="activePage === 'company'">
              <span>{{ row.englishName || '—' }}</span>
              <small>{{ row.phone || '—' }} · {{ row.email || '—' }}</small>
              <small>中文地址：{{ row.address || '—' }}</small>
              <small>英文地址：{{ row.englishAddress || '—' }}</small>
            </div>
            <div v-else-if="activePage === 'equipment'">
              <span>{{ row.brand || '—' }} · {{ row.model || '—' }}</span>
              <small>{{ row.owner || '—' }} · {{ row.primary || '—' }}</small>
              <small>出厂编号：{{ row.serialNumber || '—' }} · {{ row.startDate ? `启用 ${row.startDate}` : '—' }}</small>
            </div>
            <div v-else-if="activePage === 'productionLines'">
              <span>{{ row.type || '—' }} · {{ row.owner || '—' }}</span>
              <small>{{ row.workshop || '—' }} · {{ row.capacityValue ? `${row.capacityValue} ${row.capacityUnit || ''}`.trim() : '—' }}</small>
              <small>适用范围：{{ row.processScope || '—' }}</small>
            </div>
            <div v-else>
              <span v-if="isCustomersPage">{{ row.type }} · {{ customerContact(row) }}</span>
              <span v-else-if="isSuppliersPage">{{ row.type }} · {{ supplierContact(row) }}</span>
              <span v-else-if="isWarehousesPage">{{ row.type }} · {{ warehouseLocation(row) }}</span>
              <span v-else>{{ row.type }} · {{ row.owner }}</span>
              <small v-if="isCustomersPage">{{ customerPhone(row) }}</small>
              <small v-else-if="isSuppliersPage">{{ supplierPhone(row) }}</small>
              <small v-else-if="isWarehousesPage">{{ row.company || '—' }}</small>
              <small v-else>{{ row.primary }}</small>
              <small>{{
                isCustomersPage
                  ? `公司地址：${customerAddress(row)}`
                  : isSuppliersPage
                    ? `公司地址：${supplierAddress(row)}`
                    : isWarehousesPage
                      ? `位置：${warehouseRegion(row)} · ${warehouseAddress(row)}`
                      : row.secondary || '—'
              }}</small>
              <small v-if="isCustomersPage">{{ customerBusinessSummary(row) }} · {{ customerBusinessMeta(row) }}</small>
              <small v-if="isSuppliersPage">{{ supplierPurchaseSummary(row) }} · {{ supplierPurchaseMeta(row) }}</small>
              <small v-if="isWarehousesPage">{{ row.locationCount ? `库位前缀 ${row.binPrefix || '—'}` : '不细分库位' }}</small>
            </div>
          </div>
          <div class="quote-card-meta">
            <span>{{ row.updatedAt }}</span>
          </div>
        </article>
      </div>

      <div class="table-footer">
        <span>显示 {{ visibleRows.length ? 1 : 0 }}-{{ visibleRows.length }} / 共 {{ visibleRows.length }} 条</span>
        <div class="pager">
          <button type="button" disabled title="已经是第一页">上一页</button>
          <strong>1</strong>
          <button type="button" disabled title="已经是最后一页">下一页</button>
        </div>
      </div>
    </div>
    <div
      v-if="toastMessage"
      class="app-toast"
      :class="{ error: toastTone === 'error' }"
      :role="toastTone === 'error' ? 'alert' : 'status'"
      :aria-live="toastTone === 'error' ? 'assertive' : 'polite'"
      aria-atomic="true"
    >
      {{ toastMessage }}
    </div>
  </section>
</template>
