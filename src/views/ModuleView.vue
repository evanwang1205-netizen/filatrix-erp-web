<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Activity, CheckCircle2, Download, Plus, RotateCcw, Save, ScanLine, Unlink } from 'lucide-vue-next';

import ReferencePicker from '../components/ReferencePicker.vue';
import { activeNavItems } from '../data/navigation';
import systemMenuDefaults from '../../shared/system-menu-defaults.json';
import {
  coreSystemRecordCodes,
  moduleReadPermissionCodes,
  notificationActionOptionsByModule,
  notificationChannelOptions,
  notificationModuleOptions,
  operationPermissionCodeSet,
  operationPermissionCodes,
  operationPermissionDependencies,
  operationPermissionRouteRules,
  permissionDisplayOrder,
  permissionOperationImpactMap,
  protectedSystemMenuCodes as protectedSystemMenuCodeList,
  routeModulePermission,
  routeModuleReadPermissionCodes,
  roleDefaults,
  roleDisplayOrder,
  systemCodePrefixes,
  systemOptionSets,
  systemPageBehavior,
} from '../data/permissionMatrix';
import type { MasterDataRecord } from '../data/masterData';
import type { OperationPermissionRouteRule, PermissionOperationImpact } from '../data/permissionMatrix';
import {
  checkSystemAppHealth,
  listMasterRecords,
  listSystemRecords,
  recordSystemMcpToolVerification,
  saveSystemRecord,
  type SystemRecord,
} from '../services/api';
import { accessDeniedHomeLocation, canAccessNavigationPath, disabledMenuInPath, useNavigationStore } from '../stores/navigation';
import { useSessionStore } from '../stores/session';
import type { ReferenceOption } from '../types/business';

type SystemPageConfig = {
  title: string;
  description: string;
  readonly?: boolean;
};

type SharedSystemMenuDefault = {
  menuKey: string;
  children?: Array<{
    name: string;
    path: string;
    description?: string;
  }>;
};

type SystemTableColumn = {
  key: string;
  label: string;
  width: string;
  className?: string;
};

const route = useRoute();
const router = useRouter();
const navigation = useNavigationStore();
const session = useSessionStore();

const systemMenuPageConfigs = Object.fromEntries(
  ((systemMenuDefaults as SharedSystemMenuDefault[]).find((menu) => menu.menuKey === 'system')?.children || [])
    .map((child) => {
      const pageKey = child.path.split('/').filter(Boolean)[1];
      return [
        pageKey,
        {
          title: child.name,
          description: child.description || '',
        },
      ] as const;
    })
    .filter(([pageKey]) => Boolean(pageKey)),
) as Record<string, SystemPageConfig>;

const readOnlySystemPageKeys = new Set(systemPageBehavior.readOnlyPages);
const nonCreatableSystemPageKeys = new Set(systemPageBehavior.nonCreatablePages);

const systemPageConfigs: Record<string, SystemPageConfig> = {
  ...Object.fromEntries(
    Object.entries(systemMenuPageConfigs).map(([pageKey, config]) => [
      pageKey,
      {
        ...config,
        readonly: readOnlySystemPageKeys.has(pageKey),
      },
    ]),
  ),
};

const moduleItem = computed(() => {
  const moduleKey = route.params.moduleKey?.toString();
  return activeNavItems.find(
    (item) =>
      item.key === moduleKey ||
      item.path === `/${moduleKey}` ||
      item.path.startsWith(`/${moduleKey}/`),
  );
});

const pageItem = computed(() => {
  const path = route.path;
  return moduleItem.value?.children?.find((child) => child.path === path);
});

const pageTitle = computed(() => pageItem.value?.label ?? moduleItem.value?.label ?? '模块工作台');
const isSystemPage = computed(() => moduleItem.value?.key === 'system');
const systemPageKey = computed(() => route.params.pageKey?.toString() || 'permissions');
const systemConfig = computed<SystemPageConfig>(
  () => systemPageConfigs[systemPageKey.value] ?? systemPageConfigs.permissions,
);
const canMaintainSystemConfig = computed(() => session.hasPermission(moduleReadPermissionCodes.system));
const isSystemReadonly = computed(() => Boolean(systemConfig.value.readonly) || !canMaintainSystemConfig.value);
const systemReadonlyMessage = computed(() => {
  if (!canMaintainSystemConfig.value) return '当前账号没有系统配置维护权限，只能查看。';
  if (systemConfig.value.readonly) return '当前页面为只读记录。';
  return '';
});
const isNamingRulesPage = computed(() => systemPageKey.value === 'naming-rules');
const isMenusPage = computed(() => systemPageKey.value === 'menus');
const isAccountsPage = computed(() => systemPageKey.value === 'accounts');
const isRolesPage = computed(() => systemPageKey.value === 'roles');
const isPermissionsPage = computed(() => systemPageKey.value === 'permissions');
const isLogsPage = computed(() => systemPageKey.value === 'logs');
const isNotificationsPage = computed(() => systemPageKey.value === 'notifications');
const isOptionDictionariesPage = computed(() => systemPageKey.value === 'option-dictionaries');
const isAppsPage = computed(() => systemPageKey.value === 'apps');
const isMcpToolsPage = computed(() => systemPageKey.value === 'mcp-tools');
const systemScopeNote = computed(() => {
  if (isPermissionsPage.value) {
    return '权限点是系统内置能力清单，不能手动新建；可维护显示信息、状态和说明，停用前必须先解除角色和菜单引用。';
  }
  if (isMenusPage.value) {
    return '菜单入口由当前系统路由生成，不能手动新建；可维护绑定权限、排序、启停状态和说明。';
  }
  if (isNamingRulesPage.value) {
    return '编码规则只支持已接入的业务单据，不能手动新增未知规则；可维护前缀、日期格式、流水长度和启停状态。';
  }
  if (isNotificationsPage.value) {
    return '通知规则会驱动站内消息发送，启用时必须指定触发模块、触发动作和接收角色。';
  }
  if (isOptionDictionariesPage.value) {
    return '选项字典维护固定枚举的分组和取值；业务页面只选择，后续可按权限提供快捷跳转维护。';
  }
  if (isAppsPage.value) {
    return '应用管理记录本地运行和阿里云部署相关配置，健康检查只允许访问本机或当前系统域名。';
  }
  if (isMcpToolsPage.value) {
    return 'MCP 工具用于记录可用辅助工具、风险级别和验证方式；高风险工具需要明确使用边界。';
  }
  if (isLogsPage.value) {
    return '日志由系统自动写入，用于追溯配置变更和关键操作，不支持手动新增或编辑。';
  }
  return '';
});
const systemEntityLabels: Record<string, string> = {
  accounts: '账号',
  permissions: '权限点',
  roles: '角色',
  menus: '菜单',
  'naming-rules': '编码规则',
  notifications: '通知规则',
  'option-dictionaries': '选项字典',
  apps: '应用',
  'mcp-tools': '工具',
  logs: '日志',
};
const systemEntityLabel = computed(() => systemEntityLabels[systemPageKey.value] || '配置');
const systemSearchPlaceholder = computed(() => {
  if (isAccountsPage.value) return '搜索编码、姓名、登录账号、部门、角色、菜单、操作或通知规则';
  if (isRolesPage.value) return '搜索角色编码、名称、权限点、菜单、操作或说明';
  if (isPermissionsPage.value) return '搜索权限编码、名称、模块、操作或说明';
  if (isMenusPage.value) return '搜索菜单编码、名称、路径、权限点、操作、角色或账号';
  if (isNamingRulesPage.value) return '搜索规则编码、名称、前缀或示例';
  if (isNotificationsPage.value) return '搜索通知编码、名称、触发动作、接收角色或账号';
  if (isOptionDictionariesPage.value) return '搜索字典编码、名称、模块、字段、选项或使用范围';
  if (isAppsPage.value) return '搜索应用编码、名称、部署目标、入口';
  if (isMcpToolsPage.value) return '搜索工具编码、名称、类型、适用范围';
  if (isLogsPage.value) return '搜索日志编码、操作、对象、单号、来源账号或内容';
  return '搜索编码、名称、状态或说明';
});
const canCreateSystemRecord = computed(
  () => !isSystemReadonly.value && !nonCreatableSystemPageKeys.has(systemPageKey.value),
);
const systemEmptyStateTitle = computed(() => {
  if (isLogsPage.value && hasActiveLogFilters.value) return '没有匹配的日志';
  if (isLogsPage.value) return '暂无日志记录';
  return `暂无${systemEntityLabel.value}`;
});
const systemEmptyStateDescription = computed(() => {
  if (canCreateSystemRecord.value) return '可以新建配置，或调整搜索条件。';
  if (isLogsPage.value && hasActiveLogFilters.value) return '当前筛选条件没有匹配日志，可以清空筛选后查看全部日志。';
  if (isLogsPage.value) return '可以调整搜索、状态或操作筛选。';
  return '当前页面由系统内置数据驱动，可以调整搜索条件或检查初始化数据。';
});
const selectedSystemRecordVisible = computed(() =>
  Boolean(selectedCode.value && visibleSystemRows.value.some((row) => row.code === selectedCode.value)),
);
const selectedStoredSystemRecord = computed(() =>
  systemRows.value.find((row) => row.code === systemDraft.code),
);
const showSystemEditor = computed(() => isLogsPage.value || isCreating.value || selectedSystemRecordVisible.value);
const showSystemEditorActions = computed(
  () =>
    !isLogsPage.value &&
    (
      !isSystemReadonly.value ||
      Boolean(visibleSystemSaveDisabledReason.value) ||
      Boolean(saveMessage.value) ||
      Boolean(saveMessageLogLocation.value)
    ),
);
const systemEmptyEditorTitle = computed(() =>
  visibleSystemRows.value.length ? `请选择${systemEntityLabel.value}` : systemEmptyStateTitle.value,
);
const systemEmptyEditorDescription = computed(() =>
  visibleSystemRows.value.length ? '从左侧列表选择一条记录后查看详情。' : systemEmptyStateDescription.value,
);
const systemRows = ref<SystemRecord[]>([]);
const permissionRows = ref<SystemRecord[]>([]);
const roleRows = ref<SystemRecord[]>([]);
const accountRows = ref<SystemRecord[]>([]);
const menuRows = ref<SystemRecord[]>([]);
const notificationRows = ref<SystemRecord[]>([]);
const namingRuleRows = ref<SystemRecord[]>([]);
const appRows = ref<SystemRecord[]>([]);
const mcpToolRows = ref<SystemRecord[]>([]);
const employeeRows = ref<MasterDataRecord[]>([]);
const systemSearch = ref('');
const rolePermissionSearch = ref('');
const accountRoleSearch = ref('');
const notificationRoleSearch = ref('');
const menuPermissionSearch = ref('');
const mcpVerificationRemark = ref('');
const logStatusFilter = ref('全部');
const logActionFilter = ref('全部');
const logDateStartFilter = ref('');
const logDateEndFilter = ref('');
const hasActiveLogFilters = computed(
  () =>
    isLogsPage.value &&
    Boolean(
      systemSearch.value.trim() ||
        logStatusFilter.value !== '全部' ||
        logActionFilter.value !== '全部' ||
        logDateStartFilter.value ||
        logDateEndFilter.value,
    ),
);
const hasInvalidLogDateRange = computed(() => {
  const startTime = logDateBoundary(logDateStartFilter.value);
  const endTime = logDateBoundary(logDateEndFilter.value, true);
  return Boolean(startTime && endTime && startTime > endTime);
});
const logDateRangeMessage = computed(() =>
  hasInvalidLogDateRange.value ? '结束日期不能早于开始日期，请调整日志日期范围。' : '',
);
function systemSearchQueryText() {
  const value = route.query.q;
  const rawValue = Array.isArray(value) ? value[0] : value;
  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function systemQueryLocation(path: string, q?: string) {
  const keyword = String(q || '').trim();
  return keyword ? { path, query: { q: keyword } } : { path };
}

const selectedCode = ref('');
const isCreating = ref(false);
const isSaving = ref(false);
const isCheckingAppHealth = ref(false);
const isRecordingMcpVerification = ref(false);
const loadMessage = ref('');
const saveMessage = ref('');
const systemLastActionLogQuery = ref('');
const systemLastActionMessage = ref('');
const systemEditorTitle = computed(() => (isCreating.value ? `新建${systemEntityLabel.value}` : `${systemEntityLabel.value}详情`));
const saveMessageLogLocation = computed(() => {
  if (
    !saveMessage.value ||
    saveMessage.value !== systemLastActionMessage.value ||
    !systemLastActionLogQuery.value ||
    isLogsPage.value
  ) {
    return undefined;
  }
  return systemQueryLocation('/system/logs', systemLastActionLogQuery.value);
});
const namingDateFormatOptions = [
  { label: 'YYYYMMDD', value: 'YYYYMMDD' },
  { label: 'YYMMDD', value: 'YYMMDD' },
  { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
  { label: '无日期', value: 'none' },
];
const appTypeOptions = systemOptionSets.appTypes;
const deployTargetOptions = systemOptionSets.deployTargets;
const mcpToolTypeOptions = systemOptionSets.mcpToolTypes;
const riskLevelOptions = systemOptionSets.riskLevels;
const lifecycleStatusOptions = systemOptionSets.lifecycleStatuses;
const logStatusOptions = systemOptionSets.logStatuses;
const systemStatusOptions = computed(() => (isLogsPage.value ? logStatusOptions : lifecycleStatusOptions));
const optionModuleOptions = ['通用', '销售', '采购', '仓库', '生产', '质检', '基础资料', '系统'];
const adminRoleCode = coreSystemRecordCodes.adminRole;
const defaultAdminAccountCode = coreSystemRecordCodes.defaultAdminAccount;
const systemPermissionCode = coreSystemRecordCodes.systemPermission;
const protectedSystemMenuCodes = new Set(protectedSystemMenuCodeList);

type LogTargetRoute = {
  prefix: string;
  label: string;
  path: string;
  aliases?: string[];
};

const businessLogTargetRoutes: LogTargetRoute[] = [
  { prefix: 'QT', label: '报价单', path: '/sales/quotes', aliases: ['销售报价', '销售报价单'] },
  { prefix: 'SO', label: '销售订单', path: '/sales/orders' },
  { prefix: 'SR', label: '交付追踪', path: '/sales/outbound-requests' },
  { prefix: 'PR', label: '采购需求', path: '/purchase/requisitions', aliases: ['采购需求', '采购申请'] },
  { prefix: 'PO', label: '采购订单', path: '/purchase/orders' },
  { prefix: 'WR', label: '采购入库', path: '/warehouse/purchase-receipts' },
  { prefix: 'WS', label: '销售出库', path: '/warehouse/sales-issues' },
  { prefix: 'WM', label: '生产领料', path: '/warehouse/production-issues' },
  { prefix: 'OM', label: '其他出入库', path: '/warehouse/other-moves' },
  { prefix: 'TR', label: '库存调拨', path: '/warehouse/transfers' },
  { prefix: 'ST', label: '库存盘点', path: '/warehouse/stocktakes' },
];

function blankSystemRecord(): SystemRecord {
  return {
    code: '',
    name: '',
    owner: '系统管理员',
    status: '启用',
    description: '',
    updatedAt: '',
    target: '',
    remark: '',
    sourceAccount: '',
    sourceIp: '',
    menuKey: '',
    parentCode: '',
    path: '',
    permissionCode: '',
    sortOrder: 0,
    username: '',
    employeeCode: '',
    department: '',
    roles: '',
    phone: '',
    email: '',
    lastLogin: '',
    passwordInput: '',
    passwordConfirm: '',
    passwordSet: false,
    passwordUpdatedAt: '',
    permissions: '',
    triggerModule: '销售',
    triggerAction: '订单确认',
    receiverRoles: '',
    channel: '站内',
    appType: '业务前端',
    deployTarget: '本地开发',
    runtimeMode: '',
    publicUrl: '',
    apiBase: '',
    healthPath: '',
    dataStore: '',
    versionTag: '',
    healthStatus: '未检查',
    healthCheckedAt: '',
    healthMessage: '',
    healthLatencyMs: 0,
    healthTarget: '',
    toolType: '终端',
    useScope: '',
    entryPoint: '',
    verifyMethod: '',
    riskLevel: '中',
    lastVerifiedAt: '',
    lastVerificationRemark: '',
    ruleKey: '',
    prefix: '',
    dateFormat: 'YYYYMMDD',
    sequenceLength: 3,
    sampleCode: '',
    optionModule: '通用',
    optionField: '',
    optionValues: '',
  };
}

const systemDraft = reactive<SystemRecord>(blankSystemRecord());
const isProtectedSystemMenuDraft = computed(() => isMenusPage.value && protectedSystemMenuCodes.has(systemDraft.code));

const systemTableColumns = computed<SystemTableColumn[]>(() => {
  if (isAccountsPage.value) {
    return [
      { key: 'code', label: '账号编码', width: 'minmax(138px, 0.9fr)', className: 'quote-code' },
      { key: 'primary', label: '姓名', width: 'minmax(190px, 1.2fr)', className: 'product-summary' },
      { key: 'username', label: '登录账号', width: 'minmax(120px, 0.82fr)' },
      { key: 'password', label: '密码', width: 'minmax(86px, 0.55fr)' },
      { key: 'roles', label: '角色', width: 'minmax(190px, 1.15fr)' },
      { key: 'operationCount', label: '可执行操作', width: 'minmax(96px, 0.62fr)' },
      { key: 'menuAccessCount', label: '可访问菜单', width: 'minmax(96px, 0.62fr)' },
      { key: 'department', label: '部门', width: 'minmax(120px, 0.8fr)' },
      { key: 'status', label: '状态', width: 'minmax(76px, 0.5fr)' },
      { key: 'actions', label: '操作', width: 'minmax(112px, 0.7fr)' },
    ];
  }
  if (isRolesPage.value) {
    return [
      { key: 'code', label: '角色编码', width: 'minmax(138px, 0.9fr)', className: 'quote-code' },
      { key: 'primary', label: '角色', width: 'minmax(210px, 1.35fr)', className: 'product-summary' },
      { key: 'permissionCount', label: '权限点', width: 'minmax(90px, 0.58fr)' },
      { key: 'operationCount', label: '可执行操作', width: 'minmax(96px, 0.62fr)' },
      { key: 'roleImpact', label: '影响范围', width: 'minmax(206px, 1.12fr)' },
      { key: 'status', label: '状态', width: 'minmax(76px, 0.5fr)' },
      { key: 'actions', label: '操作', width: 'minmax(112px, 0.7fr)' },
    ];
  }
  if (isPermissionsPage.value) {
    return [
      { key: 'code', label: '权限编码', width: 'minmax(236px, 1.18fr)', className: 'quote-code' },
      { key: 'primary', label: '权限点', width: 'minmax(230px, 1.35fr)', className: 'product-summary' },
      { key: 'module', label: '模块', width: 'minmax(90px, 0.55fr)' },
      { key: 'permissionType', label: '类型/影响', width: 'minmax(168px, 0.92fr)' },
      { key: 'permissionRefs', label: '启用引用', width: 'minmax(178px, 0.96fr)' },
      { key: 'status', label: '状态', width: 'minmax(76px, 0.5fr)' },
      { key: 'actions', label: '操作', width: 'minmax(112px, 0.7fr)' },
    ];
  }
  if (isMenusPage.value) {
    return [
      { key: 'code', label: '菜单编码', width: 'minmax(236px, 1.12fr)', className: 'quote-code' },
      { key: 'primary', label: '菜单', width: 'minmax(200px, 1.08fr)', className: 'product-summary' },
      { key: 'parent', label: '上级', width: 'minmax(180px, 0.9fr)' },
      { key: 'path', label: '路径', width: 'minmax(220px, 1.25fr)' },
      { key: 'permission', label: '绑定权限', width: 'minmax(260px, 1.24fr)' },
      { key: 'accessScope', label: '访问范围', width: 'minmax(168px, 0.86fr)' },
      { key: 'sort', label: '排序', width: 'minmax(64px, 0.42fr)' },
      { key: 'status', label: '状态', width: 'minmax(76px, 0.5fr)' },
      { key: 'actions', label: '操作', width: 'minmax(112px, 0.7fr)' },
    ];
  }
  if (isNamingRulesPage.value) {
    return [
      { key: 'code', label: '规则编码', width: 'minmax(150px, 0.95fr)', className: 'quote-code' },
      { key: 'primary', label: '规则', width: 'minmax(210px, 1.25fr)', className: 'product-summary' },
      { key: 'prefix', label: '前缀', width: 'minmax(82px, 0.5fr)' },
      { key: 'dateFormat', label: '日期格式', width: 'minmax(110px, 0.68fr)' },
      { key: 'sample', label: '示例', width: 'minmax(170px, 1fr)' },
      { key: 'status', label: '状态', width: 'minmax(76px, 0.5fr)' },
      { key: 'actions', label: '操作', width: 'minmax(112px, 0.7fr)' },
    ];
  }
  if (isNotificationsPage.value) {
    return [
      { key: 'code', label: '通知编码', width: 'minmax(230px, 1.08fr)', className: 'quote-code' },
      { key: 'primary', label: '通知规则', width: 'minmax(230px, 1.18fr)', className: 'product-summary' },
      { key: 'trigger', label: '触发条件', width: 'minmax(170px, 1fr)' },
      { key: 'receivers', label: '接收角色', width: 'minmax(180px, 1.08fr)' },
      { key: 'targetAccounts', label: '覆盖账号', width: 'minmax(96px, 0.58fr)' },
      { key: 'channel', label: '渠道', width: 'minmax(76px, 0.48fr)' },
      { key: 'status', label: '状态', width: 'minmax(76px, 0.5fr)' },
      { key: 'actions', label: '操作', width: 'minmax(112px, 0.7fr)' },
    ];
  }
  if (isOptionDictionariesPage.value) {
    return [
      { key: 'code', label: '字典编码', width: 'minmax(154px, 0.95fr)', className: 'quote-code' },
      { key: 'primary', label: '字典名称', width: 'minmax(220px, 1.25fr)', className: 'product-summary' },
      { key: 'optionModule', label: '模块', width: 'minmax(92px, 0.55fr)' },
      { key: 'optionField', label: '字段/用途', width: 'minmax(140px, 0.85fr)' },
      { key: 'optionValues', label: '选项', width: 'minmax(180px, 1fr)' },
      { key: 'optionScope', label: '使用范围', width: 'minmax(230px, 1.2fr)' },
      { key: 'status', label: '状态', width: 'minmax(76px, 0.5fr)' },
      { key: 'actions', label: '操作', width: 'minmax(112px, 0.7fr)' },
    ];
  }
  if (isAppsPage.value) {
    return [
      { key: 'code', label: '应用编码', width: 'minmax(154px, 0.95fr)', className: 'quote-code' },
      { key: 'primary', label: '应用', width: 'minmax(210px, 1.25fr)', className: 'product-summary' },
      { key: 'deployTarget', label: '部署目标', width: 'minmax(130px, 0.8fr)' },
      { key: 'endpoint', label: '入口', width: 'minmax(220px, 1.25fr)' },
      { key: 'readiness', label: '健康 / 完整度', width: 'minmax(190px, 1.08fr)' },
      { key: 'status', label: '状态', width: 'minmax(76px, 0.5fr)' },
      { key: 'actions', label: '操作', width: 'minmax(164px, 0.9fr)' },
    ];
  }
  if (isMcpToolsPage.value) {
    return [
      { key: 'code', label: '工具编码', width: 'minmax(154px, 0.95fr)', className: 'quote-code' },
      { key: 'primary', label: '工具', width: 'minmax(220px, 1.3fr)', className: 'product-summary' },
      { key: 'toolType', label: '类型', width: 'minmax(86px, 0.52fr)' },
      { key: 'risk', label: '风险', width: 'minmax(86px, 0.52fr)' },
      { key: 'entryPoint', label: '调用入口', width: 'minmax(220px, 1.16fr)' },
      { key: 'lastVerifiedAt', label: '验证', width: 'minmax(112px, 0.68fr)' },
      { key: 'status', label: '状态', width: 'minmax(76px, 0.5fr)' },
      { key: 'actions', label: '操作', width: 'minmax(164px, 0.9fr)' },
    ];
  }
  if (isLogsPage.value) {
    return [
      { key: 'code', label: '日志编码', width: 'minmax(188px, 0.9fr)', className: 'quote-code' },
      { key: 'primary', label: '操作', width: 'minmax(260px, 1.3fr)', className: 'product-summary' },
      { key: 'target', label: '对象', width: 'minmax(160px, 0.82fr)' },
      { key: 'owner', label: '记录人', width: 'minmax(168px, 0.86fr)' },
      { key: 'sourceAccount', label: '来源账号', width: 'minmax(142px, 0.72fr)' },
      { key: 'sourceIp', label: '来源地址', width: 'minmax(130px, 0.72fr)' },
      { key: 'updatedAt', label: '时间', width: 'minmax(150px, 0.86fr)' },
      { key: 'status', label: '状态', width: 'minmax(76px, 0.5fr)' },
    ];
  }
  return [
    { key: 'code', label: '编码', width: 'minmax(150px, 0.95fr)', className: 'quote-code' },
    { key: 'primary', label: '名称', width: 'minmax(240px, 1.45fr)', className: 'product-summary' },
    { key: 'owner', label: '负责人', width: 'minmax(110px, 0.7fr)' },
    { key: 'status', label: '状态', width: 'minmax(76px, 0.5fr)' },
    { key: 'updatedAt', label: '更新时间', width: 'minmax(112px, 0.7fr)' },
    { key: 'actions', label: '操作', width: 'minmax(112px, 0.7fr)' },
  ];
});

const systemTableGridTemplate = computed(() => systemTableColumns.value.map((column) => column.width).join(' '));
const systemTableMinWidth = computed(() => {
  const widths: Record<string, number> = {
    accounts: 1320,
    permissions: 1160,
    roles: 1040,
    menus: 1600,
    'naming-rules': 980,
    notifications: 1300,
    'option-dictionaries': 1300,
    apps: 1240,
    'mcp-tools': 1240,
    logs: 1390,
  };
  return `${widths[systemPageKey.value] || 900}px`;
});

function menuSortOrderValue(row: SystemRecord | undefined) {
  const sortOrder = Number(row?.sortOrder);
  return Number.isFinite(sortOrder) ? sortOrder : 9999;
}

function normalizeMenuSortOrder(value: unknown) {
  const sortOrder = Number(value);
  if (!Number.isFinite(sortOrder)) return 99;
  return Math.max(1, Math.trunc(sortOrder));
}

function compareMenuRows(a: SystemRecord, b: SystemRecord) {
  const aRoot = a.parentCode ? systemRows.value.find((row) => row.code === a.parentCode) : a;
  const bRoot = b.parentCode ? systemRows.value.find((row) => row.code === b.parentCode) : b;
  const rootDiff = menuSortOrderValue(aRoot) - menuSortOrderValue(bRoot);
  if (rootDiff) return rootDiff;

  const aParent = a.parentCode || a.code;
  const bParent = b.parentCode || b.code;
  const parentDiff = aParent.localeCompare(bParent);
  if (parentDiff) return parentDiff;

  if (!a.parentCode && b.parentCode) return -1;
  if (a.parentCode && !b.parentCode) return 1;
  return menuSortOrderValue(a) - menuSortOrderValue(b) || a.code.localeCompare(b.code);
}

function systemRecordUpdatedTime(row: SystemRecord) {
  const text = String(row.updatedAt || '').trim();
  if (!text) return 0;
  const parsed = Date.parse(text.includes('T') ? text : text.replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function logDateBoundary(value: string, isEnd = false) {
  if (!value) return 0;
  const parsed = Date.parse(`${value}T${isEnd ? '23:59:59' : '00:00:00'}`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareUpdatedSystemRows(a: SystemRecord, b: SystemRecord) {
  return systemRecordUpdatedTime(b) - systemRecordUpdatedTime(a) || String(b.code || '').localeCompare(String(a.code || ''));
}

function orderedIndex(order: readonly string[], code: string | undefined) {
  const index = order.indexOf(String(code || ''));
  return index >= 0 ? index : order.length;
}

function compareSystemCodeByOrder(order: readonly string[]) {
  return (a: SystemRecord, b: SystemRecord) =>
    orderedIndex(order, a.code) - orderedIndex(order, b.code) ||
    String(a.code || '').localeCompare(String(b.code || ''));
}

function orderSystemRows(rows: SystemRecord[]) {
  if (isLogsPage.value) return [...rows].sort(compareUpdatedSystemRows);
  if (isPermissionsPage.value) return [...rows].sort(compareSystemCodeByOrder(permissionDisplayOrder));
  if (isRolesPage.value) return [...rows].sort(compareSystemCodeByOrder(roleDisplayOrder));
  return isMenusPage.value ? [...rows].sort(compareMenuRows) : rows;
}

function systemRowSearchValues(row: SystemRecord) {
  return [
    row.code,
    row.name,
    row.owner,
    row.status,
    row.description,
    row.updatedAt,
    row.target,
    row.remark,
    row.sourceAccount,
    row.sourceIp,
    isLogsPage.value ? logSearchText(row) : '',
    row.prefix,
    row.dateFormat,
    row.sampleCode,
    isPermissionsPage.value ? permissionSearchText(row) : '',
    isRolesPage.value ? roleAliasSearchText(row) : '',
    isRolesPage.value ? roleOperationSearchText(row) : '',
    row.permissionCode,
    row.parentCode,
    row.path,
    isRolesPage.value ? roleAccessibleMenuSearchText(row) : '',
    isMenusPage.value ? menuAccessSearchText(row) : '',
    isMenusPage.value ? menuOperationSearchText(row) : '',
    row.username,
    row.employeeCode,
    row.department,
    row.roles,
    isAccountsPage.value ? listCodes(row.roles).flatMap(roleIdentitySearchValues).join(',') : '',
    isAccountsPage.value ? accountEffectivePermissionCodes(row).join(',') : '',
    isAccountsPage.value ? accountOperationSearchText(row) : '',
    isAccountsPage.value ? accountAccessibleMenuSearchText(row) : '',
    isAccountsPage.value ? accountNotificationSearchText(row) : '',
    row.phone,
    row.email,
    row.passwordUpdatedAt,
    row.permissions,
    row.triggerModule,
    row.triggerAction,
    row.receiverRoles,
    isNotificationsPage.value ? listCodes(row.receiverRoles).flatMap(roleIdentitySearchValues).join(',') : '',
    isNotificationsPage.value ? notificationTargetAccountSearchText(row) : '',
    row.channel,
    row.optionModule,
    row.optionField,
    row.optionValues,
    row.appType,
    row.deployTarget,
    row.runtimeMode,
    row.publicUrl,
    row.apiBase,
    row.healthPath,
    row.dataStore,
    row.versionTag,
    row.toolType,
    row.useScope,
    row.entryPoint,
    row.verifyMethod,
    row.riskLevel,
    row.lastVerifiedAt,
    row.lastVerificationRemark,
  ];
}

function systemRowMatchesKeyword(row: SystemRecord, keyword: string) {
  return systemRowSearchValues(row).some((value) => String(value ?? '').toLowerCase().includes(keyword));
}

function logRowsMatchingSearchAndDate() {
  let rows = systemRows.value;
  const startTime = logDateBoundary(logDateStartFilter.value);
  const endTime = logDateBoundary(logDateEndFilter.value, true);
  if (hasInvalidLogDateRange.value) {
    rows = [];
  } else if (startTime || endTime) {
    rows = rows.filter((row) => {
      const updatedTime = systemRecordUpdatedTime(row);
      if (!updatedTime) return false;
      if (startTime && updatedTime < startTime) return false;
      return !(endTime && updatedTime > endTime);
    });
  }

  const keyword = systemSearch.value.trim().toLowerCase();
  return keyword ? rows.filter((row) => systemRowMatchesKeyword(row, keyword)) : rows;
}

const visibleSystemRows = computed(() => {
  if (isLogsPage.value) {
    let rows = logRowsMatchingSearchAndDate();
    if (logStatusFilter.value !== '全部') {
      rows = rows.filter((row) => row.status === logStatusFilter.value);
    }
    if (logActionFilter.value !== '全部') {
      rows = rows.filter((row) => row.name === logActionFilter.value);
    }
    return orderSystemRows(rows);
  }

  const rows = systemRows.value;
  const keyword = systemSearch.value.trim().toLowerCase();
  if (!keyword) return orderSystemRows(rows);

  return orderSystemRows(rows.filter((row) => systemRowMatchesKeyword(row, keyword)));
});

function normalizeSequenceLength(value: unknown) {
  const length = Number(value);
  if (!Number.isFinite(length)) return 3;
  return Math.min(6, Math.max(2, Math.trunc(length)));
}

function formatNamingDate(format: string | undefined) {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const yy = yyyy.slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  if (format === 'none') return '';
  if (format === 'YYMMDD') return `${yy}${mm}${dd}`;
  if (format === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`;
  return `${yyyy}${mm}${dd}`;
}

const namingRuleSample = computed(() => {
  const prefix = (systemDraft.prefix || systemDraft.code.replace(/^RULE-/, '') || 'DOC')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const date = formatNamingDate(systemDraft.dateFormat);
  const sequence = String(1).padStart(normalizeSequenceLength(systemDraft.sequenceLength), '0');
  return [prefix || 'DOC', date, sequence].filter(Boolean).join('-');
});

const logStatusSummaryRows = computed(() => {
  let rows = logRowsMatchingSearchAndDate();
  if (logActionFilter.value !== '全部') {
    rows = rows.filter((row) => row.name === logActionFilter.value);
  }
  return orderSystemRows(rows);
});

const logStatusSummary = computed(() => {
  const rows = logStatusSummaryRows.value;
  return {
    total: rows.length,
    normal: rows.filter((row) => row.status === '正常').length,
    abnormal: rows.filter((row) => row.status === '异常').length,
    latest: rows[0]?.updatedAt || '-',
  };
});

const logActionSummaryRows = computed(() => {
  let rows = logRowsMatchingSearchAndDate();
  if (logStatusFilter.value !== '全部') {
    rows = rows.filter((row) => row.status === logStatusFilter.value);
  }
  return rows;
});

const logActionSummary = computed(() => {
  const counts = new Map<string, number>();
  logActionSummaryRows.value.forEach((row) => counts.set(row.name || '未知操作', (counts.get(row.name || '未知操作') || 0) + 1));
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 6);
});

function escapeCsvCell(value: unknown) {
  const rawText = String(value ?? '');
  const text = /^[=+\-@]/.test(rawText.trimStart()) ? `\t${rawText}` : rawText;
  return /[",\n\r\t]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadVisibleLogsCsv() {
  if (!isLogsPage.value) return;
  if (hasInvalidLogDateRange.value) {
    saveMessage.value = logDateRangeMessage.value;
    return;
  }
  if (!visibleSystemRows.value.length) {
    saveMessage.value = '当前筛选没有可导出的日志';
    return;
  }

  const headers = ['日志编码', '操作', '对象', '记录人', '来源账号', '来源地址', '时间', '状态', '内容'];
  const rows = visibleSystemRows.value.map((row) => [
    row.code,
    row.name,
    logTarget(row),
    row.owner,
    row.sourceAccount,
    row.sourceIp,
    row.updatedAt,
    row.status,
    logRemark(row),
  ]);
  const csv = [headers, ...rows].map((line) => line.map(escapeCsvCell).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `filatrix-system-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  saveMessage.value = `已导出 ${visibleSystemRows.value.length} 条日志`;
}

function clearLogFilters() {
  if (!isLogsPage.value) return;
  systemSearch.value = '';
  logStatusFilter.value = '全部';
  logActionFilter.value = '全部';
  logDateStartFilter.value = '';
  logDateEndFilter.value = '';
  saveMessage.value = '已清空日志筛选';
}

function applyLogStatusFilter(status: string) {
  if (!isLogsPage.value) return;
  logStatusFilter.value = status;
}

function applyLogActionFilter(action: string) {
  if (!isLogsPage.value) return;
  logActionFilter.value = action;
}

const logActionFilterOptions = computed(() => [
  '全部',
  ...Array.from(new Set(systemRows.value.map((row) => row.name).filter((name): name is string => Boolean(name)))).sort((a, b) =>
    a.localeCompare(b),
  ),
]);

const accountEmployeeDisplay = computed(() => {
  if (!isAccountsPage.value || !systemDraft.employeeCode) return '';
  return [systemDraft.employeeCode, systemDraft.name].filter(Boolean).join(' ');
});

const accountEmployeeExcludedCodes = computed(() => {
  if (!isAccountsPage.value) return [];
  return relatedAccountRows.value
    .filter((account) => account.code !== systemDraft.code)
    .map((account) => String(account.employeeCode || '').trim())
    .filter(Boolean);
});

const accountPasswordStatus = computed(() => {
  if (!isAccountsPage.value) return '';
  return accountPasswordStatusText(systemDraft);
});
const accountPasswordLoginRequired = computed(() =>
  (isAccountsPage.value ? systemRows.value : accountRows.value).some((account) => account.status !== '停用' && account.passwordSet),
);
const accountRequiresPasswordBeforeSave = computed(
  () =>
    isAccountsPage.value &&
    systemDraft.status !== '停用' &&
    accountPasswordLoginRequired.value &&
    !systemDraft.passwordSet &&
    !systemDraft.passwordInput,
);
function accountNeedsPassword(row: Pick<SystemRecord, 'status' | 'passwordSet'>) {
  return isAccountsPage.value && accountPasswordLoginRequired.value && row.status !== '停用' && !row.passwordSet;
}

function accountPasswordStatusText(row: Pick<SystemRecord, 'status' | 'passwordSet' | 'passwordUpdatedAt'>) {
  if (accountNeedsPassword(row)) return '需设密码';
  if (!row.passwordSet) return '未设置';
  return row.passwordUpdatedAt ? `已设置 · ${row.passwordUpdatedAt}` : '已设置';
}

function accountPasswordStatusClass(row: Pick<SystemRecord, 'status' | 'passwordSet'>) {
  if (accountNeedsPassword(row)) return 'status-pending';
  if (row.passwordSet) return 'status-done';
  return 'status-draft';
}

const accountLoginRiskMessage = computed(() => {
  if (!accountNeedsPassword(systemDraft)) return '';
  return '系统已启用密码登录，该账号尚未设置密码，用户不能直接登录。';
});
const selectedAccountLoginReadiness = computed(() => {
  if (!isAccountsPage.value) return '';
  if (systemDraft.status === '停用') return '已停用';
  if (accountNeedsPassword(systemDraft)) return '需设密码';
  if (accountPasswordLoginRequired.value) return '可登录';
  return '初始化免密码';
});
const selectedAccountLoginMessage = computed(() => {
  if (!isAccountsPage.value) return '';
  if (systemDraft.status === '停用') return '停用账号不能登录，也不会参与权限和通知覆盖。';
  if (accountNeedsPassword(systemDraft)) return '请在账号详情中设置新密码，保存后该账号才能登录。';
  if (accountPasswordLoginRequired.value) return systemDraft.passwordUpdatedAt ? `密码最后更新于 ${systemDraft.passwordUpdatedAt}` : '该账号已设置密码。';
  return '当前系统尚处于初始化免密码模式，任一启用账号设置密码后会切换为密码登录。';
});

function listCodes(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(/[,，、/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const rolePermissionCodes = computed(() => listCodes(systemDraft.permissions));
const accountRoleCodes = computed(() => listCodes(systemDraft.roles));
const accountResolvedRoleCodes = computed(() => accountRoleCodes.value.map(roleCodeFromCodeOrName));
const notificationReceiverRoleCodes = computed(() => listCodes(systemDraft.receiverRoles));
const relatedPermissionRows = computed(() => (isPermissionsPage.value ? systemRows.value : permissionRows.value));
const relatedRoleRows = computed(() => (isRolesPage.value ? systemRows.value : roleRows.value));
const relatedAccountRows = computed(() => (isAccountsPage.value ? systemRows.value : accountRows.value));
const relatedMenuRows = computed(() => (isMenusPage.value ? systemRows.value : menuRows.value));
const relatedNotificationRows = computed(() => (isNotificationsPage.value ? systemRows.value : notificationRows.value));
const relatedNamingRuleRows = computed(() => (isNamingRulesPage.value ? systemRows.value : namingRuleRows.value));
const relatedAppRows = computed(() => (isAppsPage.value ? systemRows.value : appRows.value));
const relatedMcpToolRows = computed(() => (isMcpToolsPage.value ? systemRows.value : mcpToolRows.value));

const roleDefaultAliasPairs = roleDefaults.flatMap((role) =>
  [role.name, ...role.aliases].map((alias) => ({ alias, code: role.code })),
);

function defaultRoleCodeFromAlias(codeOrName: string) {
  const normalized = normalizedSystemName(codeOrName);
  return roleDefaultAliasPairs.find((item) => normalizedSystemName(item.alias) === normalized)?.code || '';
}

function roleDefaultByCode(code: string) {
  const normalized = normalizedSystemName(code);
  return roleDefaults.find((role) => normalizedSystemName(role.code) === normalized);
}

function roleRecordByCodeOrName(codeOrName: string) {
  const normalized = normalizedSystemName(codeOrName);
  const matchedRole = relatedRoleRows.value.find(
    (role) => normalizedSystemName(role.code) === normalized || normalizedSystemName(role.name) === normalized,
  );
  if (matchedRole) return matchedRole;

  const defaultCode = defaultRoleCodeFromAlias(codeOrName);
  return defaultCode ? relatedRoleRows.value.find((role) => normalizedSystemName(role.code) === normalizedSystemName(defaultCode)) : undefined;
}

function roleCodeFromCodeOrName(codeOrName: string) {
  return roleRecordByCodeOrName(codeOrName)?.code || defaultRoleCodeFromAlias(codeOrName) || codeOrName;
}

function roleSelected(role: SystemRecord) {
  return accountRoleCodes.value.some((item) => roleCodeFromCodeOrName(item) === role.code);
}

function roleDisplayName(codeOrName: string) {
  const roleCode = roleCodeFromCodeOrName(codeOrName);
  return roleRecordByCodeOrName(codeOrName)?.name || roleDefaultByCode(roleCode)?.name || codeOrName;
}

function formatRoleList(value: string | string[] | undefined) {
  const names = listCodes(value).map((item) => roleDisplayName(item));
  return names.length ? names.join('、') : '-';
}

function roleIdentitySearchValues(codeOrName: string) {
  const roleCode = roleCodeFromCodeOrName(codeOrName);
  const role = roleRecordByCodeOrName(roleCode);
  const defaults = roleDefaultByCode(roleCode);
  return [codeOrName, roleCode, role?.name, defaults?.name, ...(defaults?.aliases ?? [])]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function roleAliasSearchText(role: SystemRecord) {
  return roleIdentitySearchValues(role.code).join(',');
}

function isProtectedSystemRecord(row: Pick<SystemRecord, 'code'>) {
  return (
    (isPermissionsPage.value && row.code === systemPermissionCode) ||
    (isRolesPage.value && row.code === adminRoleCode) ||
    (isAccountsPage.value && row.code === defaultAdminAccountCode) ||
    (isMenusPage.value && protectedSystemMenuCodes.has(row.code))
  );
}

function protectedSystemRecordReason(row: Pick<SystemRecord, 'code'>) {
  if (!isProtectedSystemRecord(row)) return '';
  if (isPermissionsPage.value) return '系统配置维护权限不能停用';
  if (isRolesPage.value) return '管理员角色不能停用';
  if (isAccountsPage.value) return '默认管理员账号不能停用';
  if (isMenusPage.value) return '系统核心菜单必须保持启用';
  return '';
}

function isProtectedDefaultAdminRole(role: SystemRecord) {
  return isAccountsPage.value && systemDraft.code === defaultAdminAccountCode && role.code === adminRoleCode;
}

const isAdminRoleDraft = computed(() => isRolesPage.value && systemDraft.code === adminRoleCode);

function activePermissionCodeSet() {
  return new Set(relatedPermissionRows.value.filter((permission) => permission.status !== '停用').map((permission) => permission.code));
}

function activeRoleCodeSet() {
  return new Set(relatedRoleRows.value.filter((role) => role.status !== '停用').map((role) => role.code));
}

function effectivePermissionCodesFromSelection(permissionCodes: string[]) {
  const activeCodes = activePermissionCodeSet();
  const selectedCodes = new Set(permissionCodes.filter((code) => activeCodes.has(code)));
  return Array.from(selectedCodes).filter((code) =>
    (operationPermissionDependencies[code] || []).every((dependency) => selectedCodes.has(dependency)),
  );
}

function effectivePermissionCodesForRole(role: SystemRecord) {
  if (role.code === adminRoleCode && role.status !== '停用') {
    return effectivePermissionCodesFromSelection(
      relatedPermissionRows.value.filter((permission) => permission.status !== '停用').map((permission) => permission.code),
    );
  }
  return effectivePermissionCodesFromSelection(listCodes(role.permissions));
}

const effectiveRolePermissionCodes = computed(() => {
  if (!isRolesPage.value) return rolePermissionCodes.value;
  return effectivePermissionCodesForRole(systemDraft);
});

function rolePermissionVisibleSelected(code: string) {
  return isAdminRoleDraft.value ? effectiveRolePermissionCodes.value.includes(code) : rolePermissionCodes.value.includes(code);
}

const visibleRolePermissionRows = computed(() => {
  const keyword = rolePermissionSearch.value.trim().toLowerCase();
  const activeRows = permissionRows.value.filter((row) => row.status !== '停用');
  if (!keyword) return activeRows;

  return activeRows.filter((row) =>
    [row.code, row.name, row.owner, row.description, permissionModuleLabel(row), permissionSearchText(row), rolePermissionDependencyHint(row)]
      .some((value) => String(value ?? '').toLowerCase().includes(keyword)),
  );
});

const visibleAccountRoleRows = computed(() => {
  const keyword = accountRoleSearch.value.trim().toLowerCase();
  const activeRows = roleRows.value.filter((row) => row.status !== '停用');
  if (!keyword) return activeRows;

  return activeRows.filter((row) =>
    [
      row.code,
      row.name,
      roleAliasSearchText(row),
      row.owner,
      row.description,
      row.permissions,
      rolePermissionPreview(row),
      roleOperationSearchText(row),
      roleAccessibleMenuSearchText(row),
    ]
      .some((value) => String(value ?? '').toLowerCase().includes(keyword)),
  );
});

const visibleNotificationRoleRows = computed(() => {
  const keyword = notificationRoleSearch.value.trim().toLowerCase();
  const activeRows = roleRows.value.filter((row) => row.status !== '停用');
  if (!keyword) return activeRows;

  return activeRows.filter((row) =>
    [row.code, row.name, roleAliasSearchText(row), row.owner, row.description, row.permissions, rolePermissionPreview(row), roleOperationSearchText(row)]
      .some((value) => String(value ?? '').toLowerCase().includes(keyword)),
  );
});

function permissionModuleLabel(row: SystemRecord | undefined) {
  if (row?.module) return row.module;
  const code = row?.code || '';
  const owner = row?.owner || '';
  if (code.includes('SALES') || owner.includes('销售')) return '销售';
  if (code.includes('PURCHASE') || owner.includes('采购')) return '采购';
  if (code.includes('WAREHOUSE') || owner.includes('仓库')) return '仓库';
  if (code.includes('PRODUCTION') || owner.includes('生产')) return '生产';
  if (code.includes('QUALITY') || owner.includes('质检') || owner.includes('质量')) return '质检';
  if (code.includes('EQUIPMENT') || owner.includes('设备')) return '设备';
  if (code.includes('MASTER') || owner.includes('基础')) return '基础资料';
  if (code.includes('SYSTEM') || owner.includes('系统')) return '系统';
  return owner || '其他';
}

const permissionGroupOrder = ['销售', '采购', '仓库', '生产', '质检', '设备', '基础资料', '系统', '其他'];

const groupedRolePermissionRows = computed(() => {
  const groups = new Map<string, { label: string; rows: SystemRecord[]; selectedCount: number }>();

  visibleRolePermissionRows.value.forEach((row) => {
    const label = permissionModuleLabel(row);
    const group = groups.get(label) ?? { label, rows: [], selectedCount: 0 };
    group.rows.push(row);
    if (rolePermissionVisibleSelected(row.code)) group.selectedCount += 1;
    groups.set(label, group);
  });

  return Array.from(groups.values()).sort((a, b) => {
    const aIndex = permissionGroupOrder.indexOf(a.label);
    const bIndex = permissionGroupOrder.indexOf(b.label);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex) || a.label.localeCompare(b.label);
  });
});

const selectedRolePermissionCount = computed(() =>
  isAdminRoleDraft.value ? effectiveRolePermissionCodes.value.length : rolePermissionCodes.value.length,
);
const selectedAccountRoleCount = computed(() => new Set(accountResolvedRoleCodes.value).size);
const enabledRoleRequiresPermission = computed(
  () => isRolesPage.value && systemDraft.status !== '停用' && systemDraft.code !== adminRoleCode && effectiveRolePermissionCodes.value.length === 0,
);
const enabledAccountRequiresRole = computed(
  () => isAccountsPage.value && systemDraft.status !== '停用' && accountRoleCodes.value.length === 0,
);
const notificationResolvedReceiverRoleCodes = computed(() => notificationReceiverRoleCodes.value.map(roleCodeFromCodeOrName));
const selectedNotificationRoleCount = computed(() => notificationReceiverRoleCodes.value.length);
function notificationActionOptionsForModule(triggerModule: unknown) {
  return notificationActionOptionsByModule[String(triggerModule || '')] ?? [];
}

function notificationChannelUnsupportedMessage() {
  return `当前系统只支持${notificationChannelOptions.join('、')}通知`;
}

function isSupportedNotificationChannel(channel: string) {
  return notificationChannelOptions.includes(channel);
}

const notificationActionOptions = computed(() => notificationActionOptionsForModule(systemDraft.triggerModule));

function toggleRolePermission(code: string) {
  if (isSystemReadonly.value) return;
  if (isAdminRoleDraft.value) {
    saveMessage.value = '管理员角色默认拥有全部启用权限，不能手动移除权限点';
    return;
  }
  const current = new Set(rolePermissionCodes.value);
  const before = new Set(current);
  if (current.has(code)) {
    removeRolePermissionWithDependents(current, code);
  } else {
    addRolePermissionWithDependencies(current, code);
  }
  systemDraft.permissions = Array.from(current).join(',');
  saveMessage.value = rolePermissionAutoSyncMessage(current, before, new Set([code]), !before.has(code));
}

function addRolePermissionWithDependencies(current: Set<string>, code: string) {
  current.add(code);
  (operationPermissionDependencies[code] || []).forEach((dependency) => current.add(dependency));
}

function removeRolePermissionWithDependents(current: Set<string>, code: string) {
  current.delete(code);
  Object.entries(operationPermissionDependencies).forEach(([operationPermission, dependencies]) => {
    if (dependencies.includes(code)) current.delete(operationPermission);
  });
}

function updateRolePermissions(codes: string[], selected: boolean) {
  if (isSystemReadonly.value) return;
  if (isAdminRoleDraft.value) {
    saveMessage.value = '管理员角色默认拥有全部启用权限，不能手动调整权限点';
    return;
  }
  const current = new Set(rolePermissionCodes.value);
  const before = new Set(current);
  codes.forEach((code) => {
    if (selected) addRolePermissionWithDependencies(current, code);
    else removeRolePermissionWithDependents(current, code);
  });
  systemDraft.permissions = Array.from(current).join(',');
  saveMessage.value = rolePermissionAutoSyncMessage(current, before, new Set(codes), selected);
}

function rolePermissionAutoSyncMessage(
  current: Set<string>,
  before: Set<string>,
  directlyChanged: Set<string>,
  selected: boolean,
) {
  const autoAdded = Array.from(current).filter((code) => !before.has(code) && !directlyChanged.has(code));
  const autoRemoved = Array.from(before).filter((code) => !current.has(code) && !directlyChanged.has(code));
  if (selected && autoAdded.length) {
    return `已自动带入基础权限：${autoAdded.map(permissionDisplayName).join('、')}`;
  }
  if (!selected && autoRemoved.length) {
    return `已同步移除依赖操作权限：${autoRemoved.map(permissionDisplayName).join('、')}`;
  }
  return '';
}

function selectPermissionRows(rows: SystemRecord[]) {
  updateRolePermissions(rows.map((row) => row.code), true);
}

function clearPermissionRows(rows: SystemRecord[]) {
  updateRolePermissions(rows.map((row) => row.code), false);
}

function rolePermissionBulkDisabledReason(rows: SystemRecord[]) {
  if (isSystemReadonly.value) return systemReadonlyMessage.value;
  if (isAdminRoleDraft.value) return '管理员角色默认拥有全部启用权限，不能手动调整权限点';
  if (!rows.length) return '当前筛选没有可选权限点';
  return '';
}

function rolePermissionOptionTitle(permission: SystemRecord) {
  if (isSystemReadonly.value) return systemReadonlyMessage.value;
  if (isAdminRoleDraft.value) return '管理员角色默认拥有全部启用权限，不能手动调整权限点';
  return rolePermissionDependencyHint(permission);
}

function clearInvalidRolePermissions() {
  if (!isRolesPage.value || isSystemReadonly.value || isAdminRoleDraft.value || !invalidRolePermissionCodes.value.length) return;
  const invalidCodes = new Set(invalidRolePermissionCodes.value);
  systemDraft.permissions = rolePermissionCodes.value.filter((code) => !invalidCodes.has(code)).join(',');
  saveMessage.value = '已移除停用或无效权限点，请保存角色。';
}

function clearInvalidAccountRoles() {
  if (!isAccountsPage.value || isSystemReadonly.value || !invalidAccountRoleCodes.value.length) return;
  const invalidCodes = new Set(invalidAccountRoleCodes.value);
  systemDraft.roles = accountRoleCodes.value.filter((code) => !invalidCodes.has(code)).join(',');
  saveMessage.value = '已移除停用或无效角色，请保存账号。';
}

function clearInvalidNotificationReceiverRoles() {
  if (!isNotificationsPage.value || isSystemReadonly.value || !invalidNotificationReceiverRoleCodes.value.length) return;
  const invalidCodes = new Set(invalidNotificationReceiverRoleCodes.value);
  systemDraft.receiverRoles = notificationResolvedReceiverRoleCodes.value.filter((code) => !invalidCodes.has(code)).join(',');
  saveMessage.value = '已移除停用或无效接收角色，请保存通知规则。';
}

function permissionDisplayName(code: string) {
  const permission = relatedPermissionRows.value.find((row) => row.code === code);
  return permission?.name || code;
}

function rolePermissionPreview(role: SystemRecord) {
  if (role.code === adminRoleCode) return '全部启用权限';
  const names = effectivePermissionCodesForRole(role).map(permissionDisplayName);
  if (!names.length) return '未配置权限';
  if (names.length <= 3) return names.join('、');
  return `${names.slice(0, 3).join('、')} 等 ${names.length} 项`;
}

function accountRoleOptionTitle(role: SystemRecord) {
  if (isSystemReadonly.value) return systemReadonlyMessage.value;
  if (isProtectedDefaultAdminRole(role) && roleSelected(role)) return '默认管理员账号必须保留管理员角色';
  return rolePermissionPreview(role);
}

function roleContainsPermission(role: SystemRecord, permissionCode: string) {
  return effectivePermissionCodesForRole(role).includes(permissionCode);
}

function roleDirectlyReferencesPermission(role: SystemRecord, permissionCode: string) {
  return role.code !== adminRoleCode && listCodes(role.permissions).includes(permissionCode);
}

function accountHasRole(account: SystemRecord, roleCode: string) {
  const roleCodes = listCodes(account.roles);
  return roleCodes.some((item) => roleCodeFromCodeOrName(item) === roleCode);
}

function accountActiveRoleCodes(account: SystemRecord) {
  const activeCodes = activeRoleCodeSet();
  return listCodes(account.roles)
    .map(roleCodeFromCodeOrName)
    .filter((roleCode) => activeCodes.has(roleCode));
}

function normalizedAccountUsername(value: string | undefined) {
  return String(value || '').trim().toLowerCase();
}

function canonicalAccountUsername(value: string | undefined) {
  return normalizedAccountUsername(value);
}

function accountUsernameFormatMessageForValue(value: string | undefined) {
  const username = canonicalAccountUsername(value);
  if (!username) return '';
  return /^[a-z0-9._-]+$/.test(username) ? '' : '登录账号只能使用字母、数字、点、下划线和短横线';
}

function normalizedSystemCode(value: string | undefined) {
  return String(value || '').trim().toLowerCase();
}

function canonicalSystemCode(value: string | undefined) {
  return String(value || '').trim().toUpperCase();
}

function systemCodePrefixForPage(page: string) {
  return systemCodePrefixes[page] || page
    .split('-')
    .map((part) => part.slice(0, 3).toUpperCase())
    .join('-');
}

function nextSystemRecordCode(page: string, rows: SystemRecord[]) {
  const prefix = systemCodePrefixForPage(page);
  const matchPrefix = `${prefix}-`;
  const maxSequence = rows.reduce((max, row) => {
    const code = String(row.code || '').trim().toUpperCase();
    if (!code.startsWith(matchPrefix)) return max;
    const sequence = Number(code.slice(matchPrefix.length));
    return Number.isInteger(sequence) && sequence > max ? sequence : max;
  }, 0);
  return `${prefix}-${String(maxSequence + 1).padStart(4, '0')}`;
}

function normalizedSystemName(value: string | undefined) {
  return String(value || '').trim().toLowerCase();
}

const systemCodeFormatMessage = computed(() => {
  if (!isCreating.value || !String(systemDraft.code || '').trim()) return '';
  const code = canonicalSystemCode(systemDraft.code);
  return /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code) ? '' : '编码只能使用字母、数字和短横线，且不能以短横线开头或结尾';
});

const duplicateSystemCodeRecord = computed(() => {
  if (!isCreating.value || !String(systemDraft.code || '').trim()) return undefined;
  const code = normalizedSystemCode(systemDraft.code);
  return systemRows.value.find((row) => normalizedSystemCode(row.code) === code);
});

const systemCodeConflictMessage = computed(() => {
  if (!duplicateSystemCodeRecord.value) return '';
  return `编码已被 ${duplicateSystemCodeRecord.value.code} 使用`;
});

const duplicateUsernameAccount = computed(() => {
  if (!isAccountsPage.value || !systemDraft.username) return undefined;
  const username = normalizedAccountUsername(systemDraft.username);
  return relatedAccountRows.value.find(
    (account) => account.code !== systemDraft.code && normalizedAccountUsername(account.username) === username,
  );
});

const duplicateUsernameAccountCode = computed(() => {
  if (!isAccountsPage.value || !systemDraft.username) return undefined;
  const username = normalizedAccountUsername(systemDraft.username);
  return relatedAccountRows.value.find(
    (account) => account.code !== systemDraft.code && normalizedAccountUsername(account.code) === username,
  );
});

const duplicateCodeUsernameAccount = computed(() => {
  if (!isAccountsPage.value || !systemDraft.code) return undefined;
  const code = normalizedAccountUsername(systemDraft.code);
  return relatedAccountRows.value.find(
    (account) => account.code !== systemDraft.code && normalizedAccountUsername(account.username) === code,
  );
});

const duplicateEmployeeAccount = computed(() => {
  if (!isAccountsPage.value || !systemDraft.employeeCode) return undefined;
  return relatedAccountRows.value.find(
    (account) => account.code !== systemDraft.code && account.employeeCode === systemDraft.employeeCode,
  );
});

function accountLinkedEmployeeBlockReason(row: SystemRecord) {
  const employeeCode = String(row.employeeCode || '').trim();
  if (!employeeCode) return '';
  const employee = employeeRows.value.find((item) => item.code === employeeCode);
  if (!employee) return `关联员工不存在：${employeeCode}`;
  if (row.status !== '停用' && employee.status === '停用') {
    return '启用账号不能关联已停用员工，请先启用员工或停用账号';
  }
  return '';
}

const selectedAccountEmployeeBlockMessage = computed(() => {
  if (!isAccountsPage.value) return '';
  return accountLinkedEmployeeBlockReason(systemDraft);
});

const accountIdentityConflictMessage = computed(() => {
  if (!isAccountsPage.value) return '';
  if (duplicateUsernameAccount.value) {
    return `登录账号已被 ${duplicateUsernameAccount.value.name || duplicateUsernameAccount.value.code} 使用`;
  }
  if (duplicateUsernameAccountCode.value) {
    return `登录账号不能与账号编码 ${duplicateUsernameAccountCode.value.code} 相同`;
  }
  if (duplicateCodeUsernameAccount.value) {
    return `账号编码不能与登录账号 ${duplicateCodeUsernameAccount.value.username} 相同`;
  }
  if (duplicateEmployeeAccount.value) {
    return `该员工已关联账号 ${duplicateEmployeeAccount.value.name || duplicateEmployeeAccount.value.code}`;
  }
  return '';
});

const accountUsernameFormatMessage = computed(() =>
  isAccountsPage.value ? accountUsernameFormatMessageForValue(systemDraft.username) : '',
);

const duplicateRoleName = computed(() => {
  if (!isRolesPage.value || !systemDraft.name.trim()) return undefined;
  const name = normalizedSystemName(systemDraft.name);
  return relatedRoleRows.value.find((role) => role.code !== systemDraft.code && normalizedSystemName(role.name) === name);
});

const roleIdentityConflictMessage = computed(() => {
  if (!duplicateRoleName.value) return '';
  return `角色名称已被 ${duplicateRoleName.value.code} 使用`;
});

const duplicatePermissionName = computed(() => {
  if (!isPermissionsPage.value || !systemDraft.name.trim()) return undefined;
  const name = normalizedSystemName(systemDraft.name);
  return relatedPermissionRows.value.find(
    (permission) => permission.code !== systemDraft.code && normalizedSystemName(permission.name) === name,
  );
});

const permissionIdentityConflictMessage = computed(() => {
  if (!duplicatePermissionName.value) return '';
  return `权限名称已被 ${duplicatePermissionName.value.code} 使用`;
});

const namingRuleConflictMessage = computed(() => {
  if (!isNamingRulesPage.value) return '';
  const prefix = String(systemDraft.prefix || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const duplicateRuleKey = systemRows.value.find(
    (row) => row.code !== systemDraft.code && row.ruleKey && row.ruleKey === systemDraft.ruleKey,
  );
  if (duplicateRuleKey) {
    return `该业务编码规则已由 ${duplicateRuleKey.code} 维护`;
  }
  const duplicatePrefix = systemRows.value.find(
    (row) =>
      row.code !== systemDraft.code &&
      row.status !== '停用' &&
      String(row.prefix || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') === prefix,
  );
  if (prefix && systemDraft.status !== '停用' && duplicatePrefix) {
    return `启用中的前缀 ${prefix} 已被 ${duplicatePrefix.code} 使用`;
  }
  return '';
});

function namingRulePrefixMissingMessage(row: SystemRecord) {
  const prefix = String(row.prefix || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return prefix ? '' : '请填写编码前缀';
}

const namingRuleSaveDisabledReason = computed(() => (
  isNamingRulesPage.value ? namingRulePrefixMissingMessage(systemDraft) || namingRuleConflictMessage.value : ''
));

const invalidAccountRoleCodes = computed(() => {
  if (!isAccountsPage.value) return [];
  const activeCodes = activeRoleCodeSet();
  return accountRoleCodes.value.filter(
    (roleCode) => !activeCodes.has(roleCodeFromCodeOrName(roleCode)),
  );
});

const invalidAccountRoleMessage = computed(() => {
  if (!invalidAccountRoleCodes.value.length) return '';
  return `账号只能选择启用中的角色：${invalidAccountRoleCodes.value.map(roleDisplayName).join('、')}`;
});

const invalidNotificationReceiverRoleCodes = computed(() => {
  if (!isNotificationsPage.value) return [];
  const activeCodes = activeRoleCodeSet();
  return notificationResolvedReceiverRoleCodes.value.filter((roleCode) => !activeCodes.has(roleCode));
});

const invalidNotificationReceiverRoleMessage = computed(() => {
  if (!invalidNotificationReceiverRoleCodes.value.length) return '';
  return `通知规则只能选择启用中的接收角色：${invalidNotificationReceiverRoleCodes.value.map(roleDisplayName).join('、')}`;
});

const accountSaveValidationMessage = computed(() => {
  if (!isAccountsPage.value) return '';
  const username = String(systemDraft.username || '');
  if (systemDraft.code === defaultAdminAccountCode && !accountResolvedRoleCodes.value.includes(adminRoleCode)) {
    return '默认管理员账号必须保留管理员角色';
  }
  if (!systemDraft.name.trim() && !systemDraft.employeeCode) return '请填写账号姓名或选择关联员工';
  if (!systemDraft.name.trim()) return '请填写名称';
  if (!username.trim()) return '请填写登录账号';
  if (/\s/.test(username)) return '登录账号不能包含空格';
  if (accountUsernameFormatMessage.value) return accountUsernameFormatMessage.value;
  if (selectedAccountEmployeeBlockMessage.value) return selectedAccountEmployeeBlockMessage.value;
  if (accountIdentityConflictMessage.value) return accountIdentityConflictMessage.value;
  if (invalidAccountRoleMessage.value) return invalidAccountRoleMessage.value;
  if (enabledAccountRequiresRole.value) return '启用账号必须至少选择一个角色';
  if (systemDraft.status !== '停用' && !accountEffectivePermissionCodes(systemDraft).length) {
    return '启用账号必须至少拥有一个有效权限，请先分配包含启用权限点的角色';
  }
  if (accountRequiresPasswordBeforeSave.value) return '系统已启用密码登录，启用账号必须设置登录密码';
  const passwordInput = systemDraft.passwordInput || '';
  const passwordConfirm = systemDraft.passwordConfirm || '';
  if (passwordInput || passwordConfirm) {
    if (passwordInput !== passwordConfirm) return '两次输入的密码不一致';
    if (passwordInput.length < 6) return '密码至少需要 6 位';
  }
  const passwordSystemManagerMessage = accountPasswordSystemManagerBlockReason(systemDraft);
  if (passwordSystemManagerMessage) return passwordSystemManagerMessage;
  return '';
});

const invalidRolePermissionCodes = computed(() => {
  if (!isRolesPage.value || isAdminRoleDraft.value) return [];
  const activeCodes = activePermissionCodeSet();
  return rolePermissionCodes.value.filter((permissionCode) => !activeCodes.has(permissionCode));
});

const invalidRolePermissionMessage = computed(() => {
  if (!invalidRolePermissionCodes.value.length) return '';
  const names = invalidRolePermissionCodes.value.map((code) => {
    const permission = relatedPermissionRows.value.find((row) => row.code === code);
    return permission ? `${permission.name}（${code}）` : code;
  });
  return `角色只能选择启用中的权限点：${names.join('、')}`;
});

const selectedMenuModuleRecord = computed(() => {
  if (!isMenusPage.value) return undefined;
  const moduleKey = (systemDraft.path || '').split('/').filter(Boolean)[0] || systemDraft.menuKey;
  return relatedMenuRows.value.find((menu) => !menu.parentCode && menu.menuKey === moduleKey) || selectedMenuParent.value;
});

function menuRequiredPermissionCodeForPath(path: string | undefined) {
  const moduleKey = String(path || '').split('/').filter(Boolean)[0] || '';
  return routeModulePermission(routeModuleReadPermissionCodes, moduleKey);
}

const selectedMenuRequiredRoutePermissionCode = computed(() =>
  isMenusPage.value ? menuRequiredPermissionCodeForPath(systemDraft.path) : '',
);
const selectedMenuRequiredRoutePermission = computed(() =>
  relatedPermissionRows.value.find((permission) => permission.code === selectedMenuRequiredRoutePermissionCode.value),
);
const menuRequiredPermissionMessage = computed(() => {
  if (!isMenusPage.value || !selectedMenuRequiredRoutePermissionCode.value) return '';
  const permission = selectedMenuRequiredRoutePermission.value;
  return `该路由必须绑定 ${permission ? `${permission.name}（${permission.code}）` : selectedMenuRequiredRoutePermissionCode.value}。`;
});
const menuRequiredPermissionNotice = computed(() => {
  if (!isMenusPage.value || !selectedMenuRequiredRoutePermissionCode.value) return '';
  const permission = selectedMenuRequiredRoutePermission.value;
  return `路由固定要求：${permission ? `${permission.name}（${permission.code}）` : selectedMenuRequiredRoutePermissionCode.value}`;
});
const menuNoPermissionDisabledReason = computed(() => {
  if (!isMenusPage.value || systemDraft.status === '停用') return '';
  return selectedMenuRequiredRoutePermissionCode.value ? `${menuRequiredPermissionNotice.value}，不能设置为无限制。` : '';
});
const menuPermissionMismatchMessage = computed(() => {
  if (!isMenusPage.value || systemDraft.status === '停用' || !selectedMenuRequiredRoutePermissionCode.value) return '';
  if (systemDraft.permissionCode && isOperationPermissionCode(systemDraft.permissionCode)) return '';
  return systemDraft.permissionCode === selectedMenuRequiredRoutePermissionCode.value ? '' : menuRequiredPermissionMessage.value;
});

const menuPermissionInvalidMessage = computed(() => {
  if (!isMenusPage.value || systemDraft.status === '停用' || !systemDraft.permissionCode) return '';
  if (isOperationPermissionCode(systemDraft.permissionCode)) {
    return `菜单入口不能绑定操作权限：${permissionDisplayLabel(systemDraft.permissionCode)}。请在角色权限中配置确认、过账或收付款。`;
  }
  return menuPermissionOptions.value.some((permission) => permission.code === systemDraft.permissionCode) ? '' : '请选择启用中的权限点';
});

const selectedMenuRequiredPermissionCodes = computed(() => {
  if (!isMenusPage.value) return [];
  return Array.from(
    new Set([
      selectedMenuRequiredRoutePermissionCode.value,
      selectedMenuModuleRecord.value?.code === systemDraft.code ? '' : selectedMenuModuleRecord.value?.permissionCode,
      systemDraft.permissionCode,
    ].filter(Boolean) as string[]),
  );
});

const selectedMenuRequiredPermissions = computed(() =>
  selectedMenuRequiredPermissionCodes.value
    .map((code) => relatedPermissionRows.value.find((permission) => permission.code === code))
    .filter((permission): permission is SystemRecord => Boolean(permission)),
);
const selectedMenuRequiredPermissionTargets = computed(() => permissionLinkTargets(selectedMenuRequiredPermissionCodes.value));

const selectedLinkedRoles = computed(() => {
  if (isPermissionsPage.value) {
    return relatedRoleRows.value.filter((role) => role.status !== '停用' && roleDirectlyReferencesPermission(role, systemDraft.code));
  }
  if (isMenusPage.value) {
    return menuAccessibleRoleRows(systemDraft);
  }
  return [];
});

const selectedLinkedMenus = computed(() => {
  if (isPermissionsPage.value) {
    return relatedMenuRows.value.filter((menu) => menu.status !== '停用' && menu.permissionCode === systemDraft.code);
  }
  if (isRolesPage.value) {
    return roleAccessibleMenuRows(systemDraft);
  }
  return [];
});

function isOperationPermissionCode(permissionCode: string | undefined) {
  return operationPermissionCodeSet.has(String(permissionCode || ''));
}

function dependentOperationPermissionRows(permissionCode: string) {
  const activePermissionByCode = new Map(
    relatedPermissionRows.value
      .filter((permission) => permission.status !== '停用')
      .map((permission) => [permission.code, permission]),
  );
  return Object.entries(operationPermissionDependencies)
    .filter(([operationPermission, dependencies]) => (
      activePermissionByCode.has(operationPermission) &&
      dependencies.includes(permissionCode)
    ))
    .map(([operationPermission]) => activePermissionByCode.get(operationPermission))
    .filter((permission): permission is SystemRecord => Boolean(permission));
}

const selectedPermissionOperationImpacts = computed(() =>
  isPermissionsPage.value ? permissionOperationImpactMap[systemDraft.code] ?? [] : [],
);

const selectedPermissionRequiredBasePermissions = computed(() => {
  if (!isPermissionsPage.value) return [];
  return (operationPermissionDependencies[systemDraft.code] ?? []).map((code) => permissionDisplayName(code));
});

function operationImpactDisplay(item: PermissionOperationImpact) {
  return [item.module, item.label].filter(Boolean).join('/');
}

function operationImpactSummary(item: PermissionOperationImpact) {
  return `${operationImpactDisplay(item)}：${item.description}`;
}

function operationImpactSearchText(impacts: readonly PermissionOperationImpact[]) {
  return impacts
    .flatMap((item) => [item.module, item.label, item.description, item.path, operationImpactDisplay(item)])
    .filter(Boolean)
    .join(',');
}

const operationRouteModuleLabels: Record<string, string> = {
  sales: '销售',
  purchase: '采购',
  warehouse: '仓库',
};

const operationRouteActionLabels: Record<string, string> = {
  confirm: '确认',
  submit: '提交',
  void: '作废',
  status: '状态调整',
  post: '过账',
  start: '开始',
  complete: '完成',
  receive: '登记收款',
  pay: '登记付款',
};

function operationRouteRulePermissionCode(rule: OperationPermissionRouteRule) {
  return operationPermissionCodes[rule.permissionKey] || '';
}

function operationRouteRulesForPermissionCode(permissionCode: string) {
  return operationPermissionRouteRules.filter((rule) => operationRouteRulePermissionCode(rule) === permissionCode);
}

function operationRouteRuleDisplay(rule: OperationPermissionRouteRule) {
  const moduleLabel = operationRouteModuleLabels[rule.module] || rule.module;
  const actions = rule.actions.map((action) => operationRouteActionLabels[action] || action).join('、');
  return `${moduleLabel}：${actions}`;
}

function operationRouteRuleSearchText(rules: readonly OperationPermissionRouteRule[]) {
  return rules
    .flatMap((rule) => [
      rule.module,
      operationRouteModuleLabels[rule.module],
      rule.permissionKey,
      operationRouteRulePermissionCode(rule),
      operationRouteRuleDisplay(rule),
      ...rule.actions,
      ...rule.actions.map((action) => operationRouteActionLabels[action]),
    ])
    .filter(Boolean)
    .join(',');
}

function operationRouteRulesForPermissionCodes(permissionCodes: string[]) {
  const rules = operationPermissionCodesFromEffectivePermissions(permissionCodes)
    .flatMap((permissionCode) => operationRouteRulesForPermissionCode(permissionCode));
  const seenRules = new Set<string>();
  return rules.filter((rule) => {
    const ruleKey = [rule.module, rule.permissionKey, rule.actions.join('|')].join('/');
    if (seenRules.has(ruleKey)) return false;
    seenRules.add(ruleKey);
    return true;
  });
}

function operationRouteRuleActionCount(rules: readonly OperationPermissionRouteRule[]) {
  return rules.reduce((count, rule) => count + rule.actions.length, 0);
}

function operationRouteRuleSummary(rules: readonly OperationPermissionRouteRule[], emptyText: string) {
  return rules.length ? rules.map(operationRouteRuleDisplay).join('；') : emptyText;
}

const selectedPermissionOperationRouteRules = computed(() =>
  isPermissionsPage.value ? operationRouteRulesForPermissionCode(systemDraft.code) : [],
);

const selectedPermissionOperationRouteActionCount = computed(() =>
  operationRouteRuleActionCount(selectedPermissionOperationRouteRules.value),
);

const selectedPermissionOperationRouteSummary = computed(() => {
  return operationRouteRuleSummary(selectedPermissionOperationRouteRules.value, '暂无后端接口动作绑定该权限');
});

const selectedPermissionOperationMenuTargets = computed(() => {
  if (!isPermissionsPage.value) return [];
  const seenPaths = new Set<string>();
  return selectedPermissionOperationImpacts.value
    .map((item) => {
      const path = String(item.path || '').trim();
      const menu = relatedMenuRows.value
        .filter((row) => row.path === path)
        .sort(
          (a, b) =>
            Number(Boolean(b.parentCode)) - Number(Boolean(a.parentCode)) ||
            Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0),
        )[0];
      return {
        path,
        label: menu?.name || item.label,
      };
    })
    .filter((target) => {
      if (!target.path || seenPaths.has(target.path)) return false;
      seenPaths.add(target.path);
      return true;
    });
});

function permissionSearchText(permission: SystemRecord) {
  const directOperationImpacts = permissionOperationImpactMap[permission.code] ?? [];
  const dependentOperationRows = dependentOperationPermissionRows(permission.code);
  const dependentOperationImpacts = dependentOperationRows.flatMap((row) => permissionOperationImpactMap[row.code] ?? []);
  const directOperationRouteRules = operationRouteRulesForPermissionCode(permission.code);
  const dependentOperationRouteRules = dependentOperationRows.flatMap((row) => operationRouteRulesForPermissionCode(row.code));
  const requiredBaseCodes = operationPermissionDependencies[permission.code] ?? [];
  const linkedMenus = relatedMenuRows.value.filter((menu) => menu.status !== '停用' && menu.permissionCode === permission.code);
  const linkedRoles = relatedRoleRows.value.filter((role) => role.status !== '停用' && roleDirectlyReferencesPermission(role, permission.code));
  const linkedAccounts = relatedAccountRows.value.filter(
    (account) => account.status !== '停用' && accountEffectivePermissionCodes(account).includes(permission.code),
  );
  return [
    permissionModuleLabel(permission),
    permissionTypeSummary(permission),
    operationImpactSearchText(directOperationImpacts),
    operationImpactSearchText(dependentOperationImpacts),
    operationRouteRuleSearchText(directOperationRouteRules),
    operationRouteRuleSearchText(dependentOperationRouteRules),
    ...requiredBaseCodes.flatMap((code) => [code, permissionDisplayName(code)]),
    ...dependentOperationRows.flatMap((row) => [row.code, row.name, permissionModuleLabel(row)]),
    ...linkedMenus.flatMap((menu) => [menu.code, menu.name, menu.path]),
    ...linkedRoles.flatMap((role) => [role.code, role.name]),
    ...linkedAccounts.flatMap((account) => [account.code, account.name, account.username, account.employeeCode]),
  ]
    .filter(Boolean)
    .join(',');
}

function permissionTypeSummary(permission: SystemRecord) {
  const directOperationCount = (permissionOperationImpactMap[permission.code] ?? []).length;
  if (directOperationCount) return `操作权限 · ${directOperationCount} 项动作`;

  const dependentOperationCount = dependentOperationPermissionRows(permission.code).length;
  if (dependentOperationCount) return `基础权限 · ${dependentOperationCount} 项操作依赖`;

  return '基础权限';
}

const selectedPermissionDependentOperationRows = computed(() => {
  if (!isPermissionsPage.value) return [];
  return dependentOperationPermissionRows(systemDraft.code);
});
const selectedPermissionDependentOperationTargets = computed(() =>
  permissionLinkTargets(selectedPermissionDependentOperationRows.value.map((row) => row.code)),
);

const selectedPermissionOperationSummary = computed(() => {
  if (!selectedPermissionOperationImpacts.value.length) return '暂无单独操作绑定该权限';
  const operationText = selectedPermissionOperationImpacts.value
    .map(operationImpactSummary)
    .join('、');
  if (!selectedPermissionRequiredBasePermissions.value.length) return operationText;
  return `需同时具备 ${selectedPermissionRequiredBasePermissions.value.join('、')}；${operationText}`;
});

const selectedPermissionDependencySummary = computed(() => {
  if (!selectedPermissionDependentOperationRows.value.length) return '暂无启用操作权限依赖该权限';
  return selectedPermissionDependentOperationRows.value
    .map((permission) => `${permission.name}：停用前需先停用或调整 ${permission.code}`)
    .join('、');
});

const visibleRoleOperationDependencyRows = computed(() => {
  if (!isRolesPage.value) return [];
  return visibleRolePermissionRows.value
    .map((permission) => ({
      permission,
      dependencies: operationPermissionDependencies[permission.code] ?? [],
    }))
    .filter((item) => item.dependencies.length);
});

const selectedHiddenRoleDependencyNames = computed(() => {
  if (!isRolesPage.value || isAdminRoleDraft.value) return [];
  const visibleCodes = new Set(visibleRolePermissionRows.value.map((permission) => permission.code));
  const selectedCodes = new Set(rolePermissionCodes.value);
  return Array.from(
    new Set(
      rolePermissionCodes.value.flatMap((operationPermission) =>
        (operationPermissionDependencies[operationPermission] ?? []).filter(
          (dependency) => selectedCodes.has(dependency) && !visibleCodes.has(dependency),
        ),
      ),
    ),
  ).map(permissionDisplayName);
});

const rolePermissionDependencyGuideTitle = computed(() => {
  const count = visibleRoleOperationDependencyRows.value.length;
  const scope = rolePermissionSearch.value.trim() ? '当前筛选' : '全部权限';
  return count ? `${scope} ${count} 项操作权限` : `${scope}无操作权限`;
});

const rolePermissionDependencyGuideText = computed(() => {
  const scope = rolePermissionSearch.value.trim() ? '当前筛选结果' : '当前权限清单';
  const hiddenDependencies = selectedHiddenRoleDependencyNames.value;
  const hiddenText = hiddenDependencies.length ? `已选基础权限未在当前筛选显示：${hiddenDependencies.join('、')}` : '';
  if (!visibleRoleOperationDependencyRows.value.length) {
    return [hiddenText, `${scope}不含确认、过账、收付款等单独业务操作权限。`].filter(Boolean).join('；');
  }

  const dependencyText = visibleRoleOperationDependencyRows.value
    .map(({ permission, dependencies }) => `${permission.name} 需要 ${dependencies.map(permissionDisplayName).join('、')}`)
    .join('；');
  return [dependencyText, hiddenText].filter(Boolean).join('；');
});

function missingOperationDependencyCodes(permissionCodes: string[]) {
  const selectedPermissionCodes = new Set(permissionCodes);
  return Array.from(
    new Set(
      Object.entries(operationPermissionDependencies)
        .filter(([operationPermission]) => selectedPermissionCodes.has(operationPermission))
        .flatMap(([, dependencies]) => dependencies.filter((dependency) => !selectedPermissionCodes.has(dependency))),
    ),
  );
}

function operationDependencyDetailsForSelection(permissionCodes: string[]) {
  const selectedPermissionCodes = new Set(permissionCodes);
  return Object.entries(operationPermissionDependencies)
    .filter(([operationPermission]) => selectedPermissionCodes.has(operationPermission))
    .map(([operationPermission, dependencies]) => ({
      operationPermission,
      dependencies: dependencies.filter((dependency) => !selectedPermissionCodes.has(dependency)),
    }))
    .filter((item) => item.dependencies.length)
    .map((item) => `${permissionDisplayName(item.operationPermission)} 需要 ${item.dependencies.map(permissionDisplayName).join('、')}`);
}

function rolePermissionDependencyHint(permission: SystemRecord) {
  const dependencies = operationPermissionDependencies[permission.code] ?? [];
  if (dependencies.length) {
    return `操作权限，需同时拥有：${dependencies.map(permissionDisplayName).join('、')}`;
  }

  const dependentOperations = dependentOperationPermissionRows(permission.code);
  if (dependentOperations.length) {
    return `基础权限，取消后会同步移除：${dependentOperations.map((row) => row.name).join('、')}`;
  }

  return '';
}

const selectedRoleMissingOperationDependencyCodes = computed(() => {
  if (!isRolesPage.value || isAdminRoleDraft.value) return [];
  return missingOperationDependencyCodes(rolePermissionCodes.value);
});

const selectedRoleOperationDependencyMessage = computed(() => {
  if (!selectedRoleMissingOperationDependencyCodes.value.length) return '';
  const missingDetails = operationDependencyDetailsForSelection(rolePermissionCodes.value);
  return `操作权限缺少基础权限：${missingDetails.join('；')}`;
});

function addMissingRoleOperationDependencies() {
  if (isSystemReadonly.value || isAdminRoleDraft.value || !selectedRoleMissingOperationDependencyCodes.value.length) return;
  const activeCodes = activePermissionCodeSet();
  const missingCodes = selectedRoleMissingOperationDependencyCodes.value.filter((code) => activeCodes.has(code));
  if (!missingCodes.length) {
    saveMessage.value = '缺失的基础权限当前未启用，请先启用权限点后再补齐角色。';
    return;
  }

  const current = new Set(rolePermissionCodes.value);
  missingCodes.forEach((code) => current.add(code));
  systemDraft.permissions = Array.from(current).join(',');
  saveMessage.value = `已补齐基础权限：${missingCodes.map(permissionDisplayName).join('、')}，请保存角色。`;
}

function operationPermissionCodesFromEffectivePermissions(permissionCodes: string[]) {
  const permissionCodeSet = new Set(permissionCodes);
  return Object.entries(operationPermissionDependencies)
    .filter(([operationPermission, dependencies]) => (
      permissionCodeSet.has(operationPermission) &&
      dependencies.every((dependency) => permissionCodeSet.has(dependency))
    ))
    .map(([operationPermission]) => operationPermission);
}

function operationImpactsForPermissionCodes(permissionCodes: string[]) {
  const impacts = operationPermissionCodesFromEffectivePermissions(permissionCodes)
    .flatMap((permissionCode) => permissionOperationImpactMap[permissionCode] ?? []);
  const seenLabels = new Set<string>();
  return impacts.filter((impact) => {
    const impactKey = [impact.module, impact.label, impact.path].join('/');
    if (seenLabels.has(impactKey)) return false;
    seenLabels.add(impactKey);
    return true;
  });
}

function roleOperationSearchText(role: SystemRecord) {
  const permissionCodes = effectivePermissionCodesForRole(role);
  return [
    ...permissionCodes.flatMap((code) => [code, permissionDisplayName(code)]),
    operationImpactSearchText(operationImpactsForPermissionCodes(permissionCodes)),
    operationRouteRuleSearchText(operationRouteRulesForPermissionCodes(permissionCodes)),
  ]
    .filter(Boolean)
    .join(',');
}

function roleOperationImpactCount(role: SystemRecord) {
  if (role.status === '停用') return 0;
  return operationImpactsForPermissionCodes(effectivePermissionCodesForRole(role)).length;
}

const selectedRoleOperationImpacts = computed(() => {
  if (!isRolesPage.value) return [];
  if (systemDraft.status === '停用') return [];
  return operationImpactsForPermissionCodes(effectiveRolePermissionCodes.value);
});

const selectedRoleOperationPermissionCodes = computed(() => {
  if (!isRolesPage.value || systemDraft.status === '停用') return [];
  return operationPermissionCodesFromEffectivePermissions(effectiveRolePermissionCodes.value);
});
const selectedRoleOperationPermissionTargets = computed(() => permissionLinkTargets(selectedRoleOperationPermissionCodes.value));

const selectedRoleOperationRouteRules = computed(() => {
  if (!isRolesPage.value) return [];
  if (systemDraft.status === '停用') return [];
  return operationRouteRulesForPermissionCodes(effectiveRolePermissionCodes.value);
});
const selectedRoleOperationRouteActionCount = computed(() =>
  operationRouteRuleActionCount(selectedRoleOperationRouteRules.value),
);
const selectedRoleOperationRouteMessage = computed(() => {
  if (!isRolesPage.value) return '';
  if (systemDraft.status === '停用') return '角色已停用，不会产生可执行接口动作。';
  return operationRouteRuleSummary(selectedRoleOperationRouteRules.value, '当前角色没有确认、提交、过账或收付款接口动作');
});

const selectedRoleOperationImpactMessage = computed(() => {
  if (!isRolesPage.value) return '';
  if (systemDraft.status === '停用') return '角色已停用，所选权限会保留但不会产生可执行业务操作。';
  if (!selectedRoleOperationImpacts.value.length) return '当前角色没有单独业务操作权限';
  return selectedRoleOperationImpacts.value.map(operationImpactDisplay).join('、');
});

const menuPermissionOptions = computed(() =>
  relatedPermissionRows.value
    .filter((permission) => permission.code && permission.status !== '停用' && !isOperationPermissionCode(permission.code))
    .sort((a, b) => permissionModuleLabel(a).localeCompare(permissionModuleLabel(b)) || a.name.localeCompare(b.name)),
);

const visibleMenuPermissionOptions = computed(() => {
  const keyword = menuPermissionSearch.value.trim().toLowerCase();
  const requiredCode = systemDraft.status !== '停用' ? selectedMenuRequiredRoutePermissionCode.value : '';
  const options = requiredCode
    ? menuPermissionOptions.value.filter((permission) => permission.code === requiredCode)
    : menuPermissionOptions.value;
  if (!keyword) return options;

  return options.filter((permission) =>
    [permission.code, permission.name, permission.description, permissionModuleLabel(permission)]
      .some((value) => String(value ?? '').toLowerCase().includes(keyword)),
  );
});

const selectedMenuParent = computed(() =>
  systemDraft.parentCode ? relatedMenuRows.value.find((menu) => menu.code === systemDraft.parentCode) : undefined,
);

const selectedMenuDisabledAncestor = computed(() => {
  if (!isMenusPage.value) return undefined;
  return disabledMenuInPath(relatedMenuRows.value, selectedMenuParent.value);
});

function menuDisabledAncestor(row: SystemRecord) {
  return disabledMenuInPath(relatedMenuRows.value, row.parentCode ? relatedMenuRows.value.find((menu) => menu.code === row.parentCode) : undefined);
}

const selectedMenuIsHidden = computed(() =>
  isMenusPage.value && (systemDraft.status === '停用' || Boolean(selectedMenuDisabledAncestor.value)),
);

const selectedMenuSiblingRows = computed(() =>
  relatedMenuRows.value
    .filter((menu) => menu.code !== systemDraft.code && (menu.parentCode || '') === (systemDraft.parentCode || ''))
    .sort(compareMenuRows),
);
const selectedMenuActiveChildRows = computed(() => (isMenusPage.value ? activeChildMenuRows(systemDraft) : []));

const duplicateMenuSortOrder = computed(() => {
  if (!isMenusPage.value) return undefined;
  const sortOrder = Number(systemDraft.sortOrder);
  if (!Number.isFinite(sortOrder) || !Number.isInteger(sortOrder) || sortOrder < 1) return undefined;
  return selectedMenuSiblingRows.value.find((menu) => normalizeMenuSortOrder(menu.sortOrder) === sortOrder);
});

const menuSortConflictMessage = computed(() => {
  if (!duplicateMenuSortOrder.value) return '';
  return `同级菜单排序号已被 ${duplicateMenuSortOrder.value.name || duplicateMenuSortOrder.value.code} 使用`;
});

function menuSortOrderMessageForRow(row: SystemRecord) {
  const sortOrder = Number(row.sortOrder);
  if (!Number.isFinite(sortOrder) || !Number.isInteger(sortOrder) || sortOrder < 1) {
    return '菜单排序号必须是大于 0 的整数';
  }
  const duplicate = relatedMenuRows.value.find(
    (menu) =>
      menu.code !== row.code &&
      (menu.parentCode || '') === (row.parentCode || '') &&
      normalizeMenuSortOrder(menu.sortOrder) === sortOrder,
  );
  return duplicate ? `同级菜单排序号已被 ${duplicate.name || duplicate.code} 使用` : '';
}

const menuSortOrderMessage = computed(() => (isMenusPage.value ? menuSortOrderMessageForRow(systemDraft) : ''));

const selectedMenuVisibilityLabel = computed(() => {
  if (!isMenusPage.value) return '';
  if (selectedMenuIsHidden.value) return '隐藏';
  if (
    selectedMenuRequiredPermissionCodes.value.some(
      (code) => relatedPermissionRows.value.find((permission) => permission.code === code)?.status === '停用',
    )
  ) {
    return '受限';
  }
  return '显示';
});

const selectedMenuNavigationState = computed(() => {
  if (!isMenusPage.value) return '';
  if (systemDraft.status === '停用') return '停用后会从侧边栏隐藏，并阻止直接访问该路由。';
  if (selectedMenuDisabledAncestor.value) {
    return `上级菜单 ${selectedMenuDisabledAncestor.value.name} 已停用，该菜单会随上级从侧边栏隐藏，并阻止直接访问。`;
  }
  const requiredPermissions = selectedMenuRequiredPermissionCodes.value;
  if (!requiredPermissions.length) return '该菜单不绑定权限，启用账号均可看到。';
  const disabledPermissions = requiredPermissions.filter(
    (code) => relatedPermissionRows.value.find((permission) => permission.code === code)?.status === '停用',
  );
  if (disabledPermissions.length) return `权限 ${disabledPermissions.map(permissionDisplayName).join('、')} 已停用，普通账号不会看到该菜单。`;
  return `需要 ${requiredPermissions.map(permissionDisplayName).join('、')} 权限才可访问。`;
});

const selectedRoleEffectivePermissions = computed(() => {
  if (!isRolesPage.value) return [];
  return effectiveRolePermissionCodes.value.map((code) => ({
    code,
    name: permissionDisplayName(code),
    status: relatedPermissionRows.value.find((permission) => permission.code === code)?.status || '',
  }));
});
const selectedRolePermissionTargets = computed(() =>
  isRolesPage.value ? permissionLinkTargets(selectedRoleEffectivePermissions.value.map((permission) => permission.code)) : [],
);

const selectedLinkedAccounts = computed(() => {
  if (isRolesPage.value) {
    return relatedAccountRows.value.filter((account) => account.status !== '停用' && accountHasRole(account, systemDraft.code));
  }
  if (isPermissionsPage.value) {
    return relatedAccountRows.value.filter(
      (account) => account.status !== '停用' && accountEffectivePermissionCodes(account).includes(systemDraft.code),
    );
  }
  if (isMenusPage.value) {
    return menuAccessibleAccountRows(systemDraft);
  }
  return [];
});

const selectedPermissionEffectiveAccountMessage = computed(() => {
  if (!isPermissionsPage.value) return '';
  if (selectedLinkedAccounts.value.length) return selectedLinkedAccounts.value.map((account) => account.name).join('、');
  return systemDraft.status === '停用' ? '该权限当前停用，暂无账号生效拥有' : '暂无启用账号生效拥有该权限';
});

const selectedRoleNotificationRows = computed(() => {
  if (!isRolesPage.value) return [];
  return relatedNotificationRows.value.filter(
    (notification) =>
      notification.status !== '停用' &&
      listCodes(notification.receiverRoles).map(roleCodeFromCodeOrName).includes(systemDraft.code),
  );
});

const showImpactPanel = computed(() =>
  isPermissionsPage.value ||
  isRolesPage.value ||
  isMenusPage.value ||
  isNamingRulesPage.value ||
  isAccountsPage.value ||
  isNotificationsPage.value ||
  isOptionDictionariesPage.value ||
  isAppsPage.value ||
  isMcpToolsPage.value,
);

const selectedNotificationReceiverRows = computed(() => {
  if (!isNotificationsPage.value) return [];
  return relatedRoleRows.value.filter((role) => role.status !== '停用' && notificationRoleSelected(role));
});

const selectedNotificationReceiverTargets = computed(() =>
  isNotificationsPage.value ? roleLinkTargets(notificationResolvedReceiverRoleCodes.value) : [],
);

function notificationTargetAccountRows(receiverRoles: string | string[] | undefined) {
  const roleCodes = new Set(listCodes(receiverRoles).map(roleCodeFromCodeOrName));
  if (!roleCodes.size) return [];
  return relatedAccountRows.value.filter(
    (account) => account.status !== '停用' && accountActiveRoleCodes(account).some((roleCode) => roleCodes.has(roleCode)),
  );
}

function notificationTargetAccountRowsAfterAccountChange(receiverRoles: string | string[] | undefined, changedAccount: SystemRecord) {
  const roleCodes = new Set(listCodes(receiverRoles).map(roleCodeFromCodeOrName));
  if (!roleCodes.size) return [];
  return relatedAccountRows.value.filter((account) => {
    const candidate = account.code === changedAccount.code ? changedAccount : account;
    return candidate.status !== '停用' && accountActiveRoleCodes(candidate).some((roleCode) => roleCodes.has(roleCode));
  });
}

const selectedNotificationAccounts = computed(() => {
  if (!isNotificationsPage.value) return [];
  return notificationTargetAccountRows(systemDraft.receiverRoles);
});

const selectedAccountNotificationRows = computed(() => {
  if (!isAccountsPage.value) return [];
  return relatedNotificationRows.value.filter(
    (notification) =>
      notification.status !== '停用' &&
      notificationTargetAccountRows(notification.receiverRoles).some((account) => account.code === systemDraft.code),
  );
});

function notificationTargetAccountSearchText(notification: SystemRecord) {
  return notificationTargetAccountRows(notification.receiverRoles)
    .flatMap((account) => [account.code, account.name, account.username, account.employeeCode, account.department, account.roles])
    .filter(Boolean)
    .join(',');
}

function accountNotificationSearchText(account: SystemRecord) {
  return relatedNotificationRows.value
    .filter(
      (notification) =>
        notification.status !== '停用' &&
        notificationTargetAccountRows(notification.receiverRoles).some((targetAccount) => targetAccount.code === account.code),
    )
    .flatMap((notification) => [
      notification.code,
      notification.name,
      notification.triggerModule,
      notification.triggerAction,
      notification.receiverRoles,
      notification.channel,
    ])
    .filter(Boolean)
    .join(',');
}

function accountNotificationRecipientBlockRows(row: SystemRecord) {
  if (!isAccountsPage.value) return [];
  return relatedNotificationRows.value.filter(
    (notification) =>
      notification.status !== '停用' &&
      notificationTargetAccountRows(notification.receiverRoles).some((account) => account.code === row.code) &&
      !notificationTargetAccountRowsAfterAccountChange(notification.receiverRoles, row).length,
  );
}

function accountNotificationRecipientBlockReason(row: SystemRecord) {
  const brokenRows = accountNotificationRecipientBlockRows(row);
  if (!brokenRows.length) return '';
  return `该账号仍是以下启用通知规则的最后接收人：${summarizeRecordNames(brokenRows)}。请先调整通知接收角色或账号角色后再保存`;
}

const appEndpointCount = computed(() => {
  if (!isAppsPage.value) return 0;
  return [systemDraft.publicUrl, systemDraft.apiBase, systemDraft.healthPath].filter(
    (value) => String(value || '').trim() && !isPlaceholderAppConfigValue(value),
  ).length;
});

function isPlaceholderAppConfigValue(value: unknown) {
  return /<[^>]+>|待填写|请填写|TBD/i.test(String(value || '').trim());
}

function appRequiredValueMissing(label: string, value: unknown) {
  const text = String(value || '').trim();
  if (!text) return label;
  return isPlaceholderAppConfigValue(text) ? `真实${label}` : '';
}

function appRequiredMissingFieldsForRow(row: SystemRecord, options: { includeStopped?: boolean } = {}) {
  if (row.status === '停用' && !options.includeStopped) return [];
  const missing: string[] = [];
  const publicUrl = String(row.publicUrl || '').trim();
  const apiBase = String(row.apiBase || '').trim();
  const runtimeMissing = appRequiredValueMissing('运行方式', row.runtimeMode);
  const publicUrlMissing = publicUrl && isPlaceholderAppConfigValue(publicUrl) ? '真实访问入口' : '';
  const apiBaseMissing = apiBase && isPlaceholderAppConfigValue(apiBase) ? '真实 API 地址' : '';
  const healthPathMissing = appRequiredValueMissing('健康检查路径', row.healthPath);
  const dataStoreMissing = appRequiredValueMissing('数据位置', row.dataStore);
  if (runtimeMissing) missing.push(runtimeMissing);
  if (!publicUrl && !apiBase) {
    missing.push('访问入口或 API 地址');
  } else {
    if (publicUrlMissing) missing.push(publicUrlMissing);
    if (apiBaseMissing) missing.push(apiBaseMissing);
  }
  if (healthPathMissing) missing.push(healthPathMissing);
  if (dataStoreMissing) missing.push(dataStoreMissing);
  return missing;
}

const appRequiredMissingFields = computed(() => {
  if (!isAppsPage.value) return [];
  return appRequiredMissingFieldsForRow(systemDraft);
});

function appOptionDisabledReasonForRow(row: SystemRecord) {
  const appType = String(row.appType || '').trim();
  if (!appTypeOptions.includes(appType)) return '应用类型只能选择当前系统支持的类型';
  const deployTarget = String(row.deployTarget || '').trim();
  if (!deployTargetOptions.includes(deployTarget)) return '部署目标只能选择当前系统支持的目标';
  return '';
}

const appDeployReadiness = computed(() => {
  if (!isAppsPage.value) return '';
  const missing = appRequiredMissingFieldsForRow(systemDraft, { includeStopped: true });
  if (missing.length) {
    if (systemDraft.status === '停用') return `启用前缺少 ${missing.join('、')}`;
    return `缺少 ${missing.join('、')}`;
  }
  return appConfigFormatIssueText(systemDraft) || '配置完整';
});

function systemDraftDiffers(keys: Array<keyof SystemRecord>) {
  const stored = selectedStoredSystemRecord.value;
  if (!stored || isCreating.value) return false;
  return keys.some((key) => String(systemDraft[key] ?? '').trim() !== String(stored[key] ?? '').trim());
}

const appHealthRequiresSavedConfig = computed(() =>
  isAppsPage.value &&
  systemDraftDiffers(['status', 'appType', 'deployTarget', 'runtimeMode', 'publicUrl', 'apiBase', 'healthPath', 'dataStore', 'versionTag']),
);

function parseAppHttpUrl(value: string | undefined) {
  const text = String(value || '').trim();
  if (!text) return undefined;

  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

function isAllowedAppHealthUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();
  const currentHostname = typeof window === 'undefined' ? '' : window.location.hostname.toLowerCase();
  return ['localhost', '127.0.0.1', '::1', '0.0.0.0', currentHostname].includes(hostname);
}

function appHealthPreflightReasonForRow(row: SystemRecord) {
  const healthPath = String(row.healthPath || '').trim();
  const publicUrl = String(row.publicUrl || '').trim();
  const apiBase = String(row.apiBase || '').trim();
  const absoluteHealthUrl = parseAppHttpUrl(healthPath);
  if (/^https?:\/\//i.test(healthPath) && !absoluteHealthUrl) return '健康检查地址不是有效的 HTTP/HTTPS 地址';
  if (absoluteHealthUrl) {
    return isAllowedAppHealthUrl(absoluteHealthUrl) ? '' : '健康检查只允许访问本机或当前系统域名';
  }

  const absoluteApiBase = parseAppHttpUrl(apiBase);
  if (/^https?:\/\//i.test(apiBase) && !absoluteApiBase) return 'API 地址不是有效的 HTTP/HTTPS 地址';
  const parsedPublicUrl = parseAppHttpUrl(publicUrl);
  if (publicUrl && !parsedPublicUrl) return '访问入口不是有效的 HTTP/HTTPS 地址，不能执行健康检查';

  const targetBaseUrl = absoluteApiBase || parsedPublicUrl;
  if (targetBaseUrl && !isAllowedAppHealthUrl(targetBaseUrl)) {
    return '当前环境只允许检查本机或当前系统域名，外部部署请从部署域名打开系统后再检查';
  }
  return '';
}

function appUrlFormatMessageForRow(row: SystemRecord) {
  const publicUrl = String(row.publicUrl || '').trim();
  const apiBase = String(row.apiBase || '').trim();
  const healthPath = String(row.healthPath || '').trim();
  const issues: string[] = [];

  if (publicUrl && !parseAppHttpUrl(publicUrl)) {
    issues.push('访问入口必须是有效的 HTTP/HTTPS 地址');
  }
  if (apiBase && !apiBase.startsWith('/') && !parseAppHttpUrl(apiBase)) {
    issues.push('API 地址必须是 / 开头的相对路径或有效的 HTTP/HTTPS 地址');
  }
  if (healthPath) {
    const hasUnsupportedProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(healthPath) && !parseAppHttpUrl(healthPath);
    if (/\s/.test(healthPath) || hasUnsupportedProtocol) {
      issues.push('健康检查路径必须是相对路径或有效的 HTTP/HTTPS 地址');
    }
  }

  return issues.length ? `启用应用地址配置不正确：${issues.join('、')}` : '';
}

function appConfigFormatIssueText(row: SystemRecord) {
  return appUrlFormatMessageForRow(row).replace(/^启用应用地址配置不正确：/, '格式错误：');
}

const appUrlFormatMessage = computed(() => {
  if (!isAppsPage.value || systemDraft.status === '停用') return '';
  return appUrlFormatMessageForRow(systemDraft);
});

const appHealthPreflightReason = computed(() => {
  if (!isAppsPage.value) return '';
  return appHealthPreflightReasonForRow(systemDraft);
});

function appHealthCheckDisabledReasonForRow(row: SystemRecord) {
  if (!isAppsPage.value) return '';
  if (isSystemReadonly.value) return systemReadonlyMessage.value;
  if (row.status === '停用') return '停用应用不能执行健康检查';
  const optionReason = appOptionDisabledReasonForRow(row);
  if (optionReason) return optionReason;
  const missing = appRequiredMissingFieldsForRow(row);
  if (missing.length) return `启用应用缺少：${missing.join('、')}`;
  const formatIssue = appUrlFormatMessageForRow(row);
  if (formatIssue) return formatIssue;
  return appHealthPreflightReasonForRow(row);
}

const appHealthCheckDisabledReason = computed(() => {
  if (!isAppsPage.value) return '';
  if (appHealthRequiresSavedConfig.value) return '请先保存应用配置，再执行健康检查';
  return appHealthCheckDisabledReasonForRow(systemDraft);
});

const canCheckSelectedAppHealth = computed(() => isAppsPage.value && !appHealthCheckDisabledReason.value);

function resolveAppHealthTargetForRow(row: SystemRecord) {
  const healthPath = String(row.healthPath || '').trim();
  const apiBase = String(row.apiBase || '').trim();
  const publicUrl = String(row.publicUrl || '').trim();
  const absoluteHealthUrl = parseAppHttpUrl(healthPath);
  if (absoluteHealthUrl) return absoluteHealthUrl.toString();

  const fallbackHealthPath = healthPath ? (healthPath.startsWith('/') ? healthPath : `/${healthPath}`) : '/api/health';
  if (isPlaceholderAppConfigValue(publicUrl) || isPlaceholderAppConfigValue(apiBase)) {
    return `https://你的域名${fallbackHealthPath}`;
  }

  const absoluteApiBase = parseAppHttpUrl(apiBase);
  const parsedPublicUrl = parseAppHttpUrl(publicUrl);
  const baseUrl = absoluteApiBase || (parsedPublicUrl && apiBase.startsWith('/') ? new URL(apiBase, parsedPublicUrl) : parsedPublicUrl);
  if (!baseUrl) return healthPath || fallbackHealthPath;
  if (!healthPath) return baseUrl.toString();
  return healthPath.startsWith('/')
    ? new URL(healthPath, baseUrl).toString()
    : new URL(healthPath, `${baseUrl.toString().replace(/\/$/, '')}/`).toString();
}

const appDeployHealthCommand = computed(() => `curl ${resolveAppHealthTargetForRow(systemDraft)} && npm run smoke:frontend`);

const appDeploySteps = computed(() => {
  if (!isAppsPage.value) return [];
  if (systemDraft.deployTarget === '阿里云 ECS') {
    return [
      'cp .env.example .env',
      '确认 .env 中端口、API 地址和数据卷配置已替换为真实值',
      'docker compose -f docker-compose.aliyun.yml --env-file .env up -d --build',
      appDeployHealthCommand.value,
    ];
  }
  if (systemDraft.deployTarget === 'Docker Compose') {
    return [
      'cp .env.example .env',
      'docker compose -f docker-compose.aliyun.yml --env-file .env up -d --build',
      'docker compose -f docker-compose.aliyun.yml ps',
    ];
  }
  if (systemDraft.deployTarget === '本地开发') return ['npm run api', 'npm run dev:5174'];
  if (systemDraft.deployTarget === 'OSS/CDN') {
    return ['npm run build', '上传 dist/ 到 OSS/CDN', '确认 VITE_API_BASE 指向可访问后端'];
  }
  return ['按部署目标补充运行命令'];
});

const appHealthSummary = computed(() => {
  if (!isAppsPage.value) return '';
  const status = systemDraft.healthStatus || '未检查';
  const checkedAt = systemDraft.healthCheckedAt || '尚未检查';
  const latency = Number(systemDraft.healthLatencyMs || 0);
  const latencyText = latency > 0 ? `，${latency}ms` : '';
  return `${status} · ${checkedAt}${latencyText}`;
});

const mcpToolReadiness = computed(() => {
  if (!isMcpToolsPage.value) return '';
  if (systemDraft.status === '停用') return '停用中不要求验证配置';
  const missing = [
    ['适用范围', systemDraft.useScope],
    ['调用入口', systemDraft.entryPoint],
    ['验证方式', systemDraft.verifyMethod],
  ].filter(([, value]) => !String(value || '').trim()).map(([label]) => label);
  if (!missing.length) return '配置完整';
  return `缺少 ${missing.join('、')}`;
});

const mcpToolRiskNote = computed(() => {
  if (!isMcpToolsPage.value) return '';
  if (systemDraft.riskLevel === '高') return '涉及文件写入、命令执行或外部副作用，使用前需要明确目标和验证方式。';
  if (systemDraft.riskLevel === '中') return '适合本地验证和受控操作，使用后应记录结果。';
  return '低风险工具，主要用于只读查询或辅助查看。';
});

function mcpVerificationRemarkRequiredForRow(row: SystemRecord) {
  return row.status !== '停用' && row.riskLevel === '高';
}

function mcpToolRequiredMissingFieldsForRow(row: SystemRecord) {
  if (row.status === '停用') return [];
  return [
    ['适用范围', row.useScope],
    ['调用入口', row.entryPoint],
    ['验证方式', row.verifyMethod],
  ]
    .filter(([, value]) => !String(value || '').trim())
    .map(([label]) => label);
}

function mcpToolOptionDisabledReasonForRow(row: SystemRecord) {
  const toolType = String(row.toolType || '').trim();
  if (!mcpToolTypeOptions.includes(toolType)) return '工具类型只能选择当前系统支持的类型';
  const riskLevel = String(row.riskLevel || '').trim();
  if (!riskLevelOptions.includes(riskLevel)) return '风险级别只能选择低、中或高';
  return '';
}

const mcpVerificationRequiresSavedConfig = computed(() =>
  isMcpToolsPage.value &&
  systemDraftDiffers(['status', 'toolType', 'riskLevel', 'useScope', 'entryPoint', 'verifyMethod']),
);

function mcpVerificationRemarkMissingReason(row: SystemRecord, remark: string) {
  if (!mcpVerificationRemarkRequiredForRow(row)) return '';
  return remark.trim() ? '' : '高风险工具记录验证时必须填写本次验证备注';
}

function mcpVerificationDisabledReasonForRow(row: SystemRecord, verificationRemark = '') {
  if (!isMcpToolsPage.value) return '';
  if (isSystemReadonly.value) return systemReadonlyMessage.value;
  if (row.status === '停用') return '停用工具不能记录验证';
  const optionReason = mcpToolOptionDisabledReasonForRow(row);
  if (optionReason) return optionReason;
  const missing = mcpToolRequiredMissingFieldsForRow(row);
  if (missing.length) return `工具配置不完整，不能记录验证：缺少${missing.join('、')}`;
  const remarkReason = mcpVerificationRemarkMissingReason(row, verificationRemark);
  if (remarkReason) return remarkReason;
  return '';
}

function mcpVerificationNeedsDetailRemark(row: SystemRecord) {
  return (
    mcpVerificationRemarkRequiredForRow(row) &&
    !mcpToolOptionDisabledReasonForRow(row) &&
    !mcpToolRequiredMissingFieldsForRow(row).length
  );
}

function mcpVerificationActionTitleForRow(row: SystemRecord) {
  if (isSystemReadonly.value) return systemReadonlyMessage.value;
  if (mcpVerificationNeedsDetailRemark(row)) return '高风险工具请先选中工具，在右侧填写本次验证备注后记录验证';
  return mcpVerificationDisabledReasonForRow(row) || '记录本工具已按验证方式完成检查';
}

const mcpVerificationDisabledReason = computed(() => {
  if (!isMcpToolsPage.value) return '';
  if (mcpVerificationRequiresSavedConfig.value) return '请先保存工具配置，再记录验证';
  return mcpVerificationDisabledReasonForRow(systemDraft, mcpVerificationRemark.value);
});

const canRecordSelectedMcpVerification = computed(() => isMcpToolsPage.value && !mcpVerificationDisabledReason.value);
const systemImpactPanelTitle = computed(() => {
  if (isNamingRulesPage.value) return '编码预览';
  if (isNotificationsPage.value) return '通知覆盖';
  if (isOptionDictionariesPage.value) return '字典影响';
  if (isAppsPage.value) return '运行检查';
  if (isMcpToolsPage.value) return '工具验证';
  return '影响范围';
});
const systemImpactPanelDescription = computed(() => {
  if (permissionImpactMessage.value) return permissionImpactMessage.value;
  if (isNamingRulesPage.value) return '根据当前前缀、日期格式和流水位数预览后续业务单据编号。';
  if (isNotificationsPage.value) return '根据触发动作和接收角色，预估启用后会通知哪些账号。';
  if (isOptionDictionariesPage.value) return '用于统一固定下拉口径，后续业务页面按字典读取，不在每个下拉里单独维护。';
  if (isAppsPage.value) return '检查访问入口、数据位置、部署目标和健康检查是否已经具备运行条件。';
  if (isMcpToolsPage.value) return '确认工具的适用范围、风险边界和验证方式，避免只登记名称却无法安全使用。';
  if (isAccountsPage.value) return '根据账号状态、密码和角色自动计算登录能力与生效权限。';
  if (isMenusPage.value) return '根据菜单状态、绑定权限和角色关系自动计算导航可见性。';
  if (isRolesPage.value) return '根据角色权限自动计算受影响账号和可访问菜单。';
  if (isPermissionsPage.value) return '角色和菜单引用用于判断停用前需解除的配置；生效账号按当前有效权限计算。';
  return '根据当前配置自动计算关联角色、菜单和账号。';
});

const selectedAccountEffectivePermissions = computed(() => {
  if (!isAccountsPage.value) return [];
  return accountEffectivePermissionSummaries(systemDraft);
});
const selectedAccountEffectivePermissionTargets = computed(() =>
  isAccountsPage.value ? permissionLinkTargets(selectedAccountEffectivePermissions.value.map((permission) => permission.code)) : [],
);

const selectedAccountEffectivePermissionMessage = computed(() => {
  if (!isAccountsPage.value) return '';
  if (systemDraft.status === '停用') return '账号已停用，角色配置会保留但不会产生生效权限。';
  if (!selectedAccountEffectivePermissions.value.length) return '当前账号没有带出生效权限';
  return selectedAccountEffectivePermissions.value.map((permission) => `${permission.module}/${permission.name}`).join('、');
});

const selectedAccountOperationPermissionCodes = computed(() => {
  if (!isAccountsPage.value) return [];
  return operationPermissionCodesFromEffectivePermissions(accountEffectivePermissionCodes(systemDraft));
});
const selectedAccountOperationPermissionTargets = computed(() => permissionLinkTargets(selectedAccountOperationPermissionCodes.value));
const selectedAccountOperationRouteRules = computed(() => {
  if (!isAccountsPage.value) return [];
  return operationRouteRulesForPermissionCodes(accountEffectivePermissionCodes(systemDraft));
});
const selectedAccountOperationRouteActionCount = computed(() =>
  operationRouteRuleActionCount(selectedAccountOperationRouteRules.value),
);
const selectedAccountOperationRouteMessage = computed(() => {
  if (!isAccountsPage.value) return '';
  if (systemDraft.status === '停用') return '账号已停用，不会产生可执行接口动作。';
  return operationRouteRuleSummary(selectedAccountOperationRouteRules.value, '当前账号没有确认、提交、过账或收付款接口动作');
});
const selectedAccountRoleTargets = computed(() =>
  isAccountsPage.value ? roleLinkTargets(accountRoleCodes.value) : [],
);

const selectedAccountOperationImpacts = computed(() => {
  if (!isAccountsPage.value) return [];
  return operationImpactsForPermissionCodes(accountEffectivePermissionCodes(systemDraft));
});

function accountOperationSearchText(account: SystemRecord) {
  const permissionCodes = accountEffectivePermissionCodes(account);
  return [
    ...permissionCodes.flatMap((code) => [code, permissionDisplayName(code)]),
    operationImpactSearchText(operationImpactsForPermissionCodes(permissionCodes)),
    operationRouteRuleSearchText(operationRouteRulesForPermissionCodes(permissionCodes)),
  ]
    .filter(Boolean)
    .join(',');
}

function accountOperationImpactCount(account: SystemRecord) {
  if (account.status === '停用') return 0;
  return operationImpactsForPermissionCodes(accountEffectivePermissionCodes(account)).length;
}

const selectedAccountOperationImpactMessage = computed(() => {
  if (!isAccountsPage.value) return '';
  if (systemDraft.status === '停用') return '账号已停用，角色配置会保留但不会产生可执行业务操作。';
  if (!selectedAccountOperationImpacts.value.length) return '当前账号没有确认、过账或收付款等单独业务操作权限';
  return selectedAccountOperationImpacts.value.map(operationImpactDisplay).join('、');
});

const selectedAccountRoleGuideTitle = computed(() => {
  if (!isAccountsPage.value) return '';
  return `${selectedAccountLoginReadiness.value} · ${selectedAccountEffectivePermissions.value.length} 项生效权限`;
});

const selectedAccountRoleGuideText = computed(() => {
  if (!isAccountsPage.value) return '';
  if (systemDraft.status === '停用') return '账号已停用，角色配置会保留但不会参与登录、菜单和业务操作权限。';
  if (!selectedAccountRoleCount.value) return '请至少选择一个启用角色，保存后账号才会获得业务权限。';
  if (!selectedAccountEffectivePermissions.value.length) return '已选角色没有带出启用权限，请调整角色或权限点。';
  return selectedAccountEffectivePermissions.value
    .map((permission) => `${permission.module}/${permission.name}`)
    .join('、');
});

function accountEffectivePermissionCodes(account: SystemRecord) {
  return accountEffectivePermissionCodesForRoles(account, relatedRoleRows.value);
}

function accountEffectivePermissionCodesForRoles(account: SystemRecord, roleRows: SystemRecord[]) {
  if (account.status === '停用') return [];
  const activePermissionCodes = new Set(relatedPermissionRows.value.filter((row) => row.status !== '停用').map((row) => row.code));
  const accountRoles = new Set(listCodes(account.roles).map(roleCodeFromCodeOrName));
  const selectedRoles = roleRows.filter(
    (role) => role.status !== '停用' && accountRoles.has(role.code),
  );
  const permissions = new Set<string>();

  selectedRoles.forEach((role) => {
    effectivePermissionCodesForRole(role).forEach((permissionCode) => {
      if (activePermissionCodes.has(permissionCode)) permissions.add(permissionCode);
    });
  });

  return Array.from(permissions);
}

function accountEffectivePermissionSummaries(account: SystemRecord) {
  return accountEffectivePermissionCodes(account).map((code) => ({
    code,
    name: permissionDisplayName(code),
    module: permissionModuleLabel(relatedPermissionRows.value.find((row) => row.code === code)),
  }));
}

function menuRequiredPermissionCodesForRow(menu: SystemRecord) {
  const parentPermissionCode = menu.parentCode
    ? relatedMenuRows.value.find((parent) => parent.code === menu.parentCode)?.permissionCode
    : '';
  return Array.from(
    new Set([
      menuRequiredPermissionCodeForPath(menu.path),
      parentPermissionCode,
      menu.permissionCode,
    ].filter(Boolean) as string[]),
  );
}

function menuAccessibleRoleRows(menu: SystemRecord) {
  if (menu.status === '停用' || menuDisabledAncestor(menu)) return [];
  const requiredPermissions = menuRequiredPermissionCodesForRow(menu);
  return relatedRoleRows.value.filter((role) => {
    if (role.status === '停用') return false;
    return !requiredPermissions.length || requiredPermissions.every((permissionCode) => roleContainsPermission(role, permissionCode));
  });
}

function menuAccessibleAccountRows(menu: SystemRecord) {
  if (menu.status === '停用' || menuDisabledAncestor(menu)) return [];
  const requiredPermissions = menuRequiredPermissionCodesForRow(menu);
  return relatedAccountRows.value.filter((account) => {
    if (account.status === '停用') return false;
    const effectivePermissions = new Set(accountEffectivePermissionCodes(account));
    return !requiredPermissions.length || requiredPermissions.every((permissionCode) => effectivePermissions.has(permissionCode));
  });
}

function menuAccessSearchText(menu: SystemRecord) {
  const requiredPermissionLabels = menuRequiredPermissionCodesForRow(menu).flatMap((permissionCode) => [
    permissionCode,
    permissionDisplayName(permissionCode),
  ]);
  const roleLabels = menuAccessibleRoleRows(menu).flatMap((role) => [role.code, role.name]);
  const accountLabels = menuAccessibleAccountRows(menu).flatMap((account) => [
    account.code,
    account.name,
    account.username,
    account.employeeCode,
    account.department,
  ]);
  return [...requiredPermissionLabels, ...roleLabels, ...accountLabels].filter(Boolean).join(',');
}

function menuOperationSearchText(menu: SystemRecord) {
  const path = String(menu.path || '').trim();
  if (!path) return '';
  return operationImpactSearchText(
    Object.values(permissionOperationImpactMap)
      .flat()
      .filter((impact) => impact.path === path),
  );
}

function accountAccessibleMenuRows(account: SystemRecord) {
  if (account.status === '停用') return [];
  const effectivePermissions = new Set(accountEffectivePermissionCodes(account));
  return relatedMenuRows.value.filter((menu) => {
    if (menu.status === '停用' || menuDisabledAncestor(menu)) return false;
    const requiredPermissions = menuRequiredPermissionCodesForRow(menu);
    return !requiredPermissions.length || requiredPermissions.every((permissionCode) => effectivePermissions.has(permissionCode));
  });
}

function roleAccessibleMenuRows(role: SystemRecord) {
  if (role.status === '停用') return [];
  const effectivePermissions = new Set(effectivePermissionCodesForRole(role));
  return relatedMenuRows.value.filter((menu) => {
    if (menu.status === '停用' || menuDisabledAncestor(menu)) return false;
    const requiredPermissions = menuRequiredPermissionCodesForRow(menu);
    return !requiredPermissions.length || requiredPermissions.every((permissionCode) => effectivePermissions.has(permissionCode));
  });
}

function menuRowsSearchTextForAccess(rows: SystemRecord[]) {
  return rows
    .flatMap((menu) => [
      menu.code,
      menu.name,
      menu.path,
      menu.parentCode,
      menu.permissionCode,
      menu.description,
      ...menuRequiredPermissionCodesForRow(menu).flatMap((permissionCode) => [permissionCode, permissionDisplayName(permissionCode)]),
    ])
    .filter(Boolean)
    .join(',');
}

function roleAccessibleMenuSearchText(role: SystemRecord) {
  return menuRowsSearchTextForAccess(roleAccessibleMenuRows(role));
}

function accountAccessibleMenuSearchText(account: SystemRecord) {
  return menuRowsSearchTextForAccess(accountAccessibleMenuRows(account));
}

const selectedAccountAccessibleMenus = computed(() => {
  if (!isAccountsPage.value) return [];
  return accountAccessibleMenuRows(systemDraft);
});

function accountProvidesSystemConfig(account: SystemRecord) {
  return account.status !== '停用' && accountEffectivePermissionCodes(account).includes(systemPermissionCode);
}

function accountProvidesSystemConfigWithRoles(account: SystemRecord, roleRows: SystemRecord[]) {
  return account.status !== '停用' && accountEffectivePermissionCodesForRoles(account, roleRows).includes(systemPermissionCode);
}

function accountHasPasswordAfterSave(account: SystemRecord) {
  return Boolean(account.passwordSet || account.passwordInput);
}

function accountRowsAfterAccountChange(row: SystemRecord) {
  const exists = relatedAccountRows.value.some((account) => account.code === row.code);
  if (exists) return relatedAccountRows.value.map((account) => (account.code === row.code ? row : account));
  return [row, ...relatedAccountRows.value];
}

function accountPasswordSystemManagerBlockReason(row: SystemRecord) {
  if (!isAccountsPage.value) return '';
  const rows = accountRowsAfterAccountChange(row);
  const passwordModeEnabled = rows.some((account) => account.status !== '停用' && accountHasPasswordAfterSave(account));
  if (!passwordModeEnabled) return '';

  const hasPasswordSystemManager = rows.some(
    (account) => account.status !== '停用' && accountHasPasswordAfterSave(account) && accountProvidesSystemConfig(account),
  );
  return hasPasswordSystemManager ? '' : '启用密码登录后必须至少保留一个已设置密码且拥有系统配置维护权限的账号';
}

function roleRowsAfterRoleChange(row: SystemRecord) {
  const exists = relatedRoleRows.value.some((role) => role.code === row.code);
  if (exists) return relatedRoleRows.value.map((role) => (role.code === row.code ? row : role));
  return [row, ...relatedRoleRows.value];
}

function roleChangeRemovesCurrentSessionSystemConfig(row: SystemRecord) {
  const currentAccount = currentSessionAccountRow.value;
  if (!currentAccount || !accountHasRole(currentAccount, row.code)) return false;
  return !accountProvidesSystemConfigWithRoles(currentAccount, roleRowsAfterRoleChange(row));
}

function accountsWithoutEffectivePermissionsForRoles(roleRows: SystemRecord[]) {
  return relatedAccountRows.value.filter(
    (account) => account.status !== '停用' && !accountEffectivePermissionCodesForRoles(account, roleRows).length,
  );
}

function roleAccountEffectivePermissionBlockRows(row: SystemRecord) {
  if (!isRolesPage.value || row.status === '停用') return [];
  return accountsWithoutEffectivePermissionsForRoles(roleRowsAfterRoleChange(row));
}

function roleAccountEffectivePermissionBlockReason(row: SystemRecord) {
  const brokenRows = roleAccountEffectivePermissionBlockRows(row);
  if (!brokenRows.length) return '';
  return `以下启用账号必须至少拥有一个有效权限：${summarizeRecordNames(brokenRows)}。请先调整角色权限或账号角色后再保存`;
}

const roleAccountEffectivePermissionSaveBlockReason = computed(() =>
  isRolesPage.value ? roleAccountEffectivePermissionBlockReason(systemDraft) : '',
);

const rolePasswordSystemManagerBlockReason = computed(() => {
  if (!isRolesPage.value) return '';
  const accounts = relatedAccountRows.value;
  const passwordModeEnabled = accounts.some((account) => account.status !== '停用' && account.passwordSet);
  if (!passwordModeEnabled) return '';

  const proposedRoles = roleRowsAfterRoleChange(systemDraft);
  const hasPasswordSystemManager = accounts.some(
    (account) => account.status !== '停用' && account.passwordSet && accountProvidesSystemConfigWithRoles(account, proposedRoles),
  );
  return hasPasswordSystemManager ? '' : '启用密码登录后必须至少保留一个已设置密码且拥有系统配置维护权限的账号';
});

function activeRoleProvidesSystemConfig(role: SystemRecord | undefined) {
  if (!role || role.status === '停用') return false;
  if (role.code === adminRoleCode) return true;
  return listCodes(role.permissions).includes(systemPermissionCode);
}

const currentSessionAccountRow = computed(() =>
  relatedAccountRows.value.find((account) => account.code === session.user.accountCode),
);

const selfSystemConfigLockMessage = computed(() => {
  if (!session.user.accountCode) return '';

  if (isAccountsPage.value && systemDraft.code === session.user.accountCode) {
    const keepsPermission =
      systemDraft.status !== '停用' &&
      selectedAccountEffectivePermissions.value.some((permission) => permission.code === systemPermissionCode);
    return keepsPermission ? '' : '不能移除当前账号的系统配置维护权限，否则会无法继续管理系统。';
  }

  if (isRolesPage.value && currentSessionAccountRow.value && accountHasRole(currentSessionAccountRow.value, systemDraft.code)) {
    const roleCodes = listCodes(currentSessionAccountRow.value.roles);
    const keepsPermission = roleCodes.some((roleCode) => {
      if (roleCode === systemDraft.code || roleDisplayName(roleCode) === systemDraft.code) {
        return activeRoleProvidesSystemConfig(systemDraft);
      }
      const role = relatedRoleRows.value.find((row) => row.code === roleCode || row.name === roleCode);
      return activeRoleProvidesSystemConfig(role);
    });
    return keepsPermission ? '' : '不能从当前账号正在使用的角色中移除系统配置维护权限。';
  }

  return '';
});

const permissionImpactMessage = computed(() => {
  if (isPermissionsPage.value && systemDraft.status === '停用') {
    return '停用后，关联角色会失去该权限，关联菜单也会从无权限账号侧隐藏。';
  }
  if (isMenusPage.value && systemDraft.status === '停用') {
    return '停用后，该菜单入口会从侧边栏和路由访问中隐藏。';
  }
  if (isRolesPage.value && systemDraft.status === '停用') {
    return '停用后，已分配该角色的账号会立即失去该角色带来的权限。';
  }
  if (isAccountsPage.value && systemDraft.status === '停用') {
    return '停用后，该账号不能作为当前有效账号使用。';
  }
  if (isNotificationsPage.value && systemDraft.status === '停用') {
    return '停用后，该通知规则不会再参与后续业务提醒。';
  }
  return '';
});

function toggleAccountRole(role: SystemRecord) {
  if (isSystemReadonly.value) return;
  if (isProtectedDefaultAdminRole(role) && roleSelected(role)) {
    saveMessage.value = '默认管理员账号必须保留管理员角色';
    return;
  }
  const current = new Set(
    accountRoleCodes.value.map(roleCodeFromCodeOrName),
  );
  if (current.has(role.code)) {
    current.delete(role.code);
  } else {
    current.add(role.code);
  }
  systemDraft.roles = Array.from(current).join(',');
}

function notificationRoleSelected(role: SystemRecord) {
  return notificationResolvedReceiverRoleCodes.value.includes(role.code);
}

function toggleNotificationRole(role: SystemRecord) {
  if (isSystemReadonly.value) return;
  const current = new Set(notificationResolvedReceiverRoleCodes.value);
  if (current.has(role.code)) {
    current.delete(role.code);
  } else {
    current.add(role.code);
  }
  systemDraft.receiverRoles = Array.from(current).join(',');
}

function handleAccountEmployeeSelect(option: ReferenceOption) {
  const employee = option.raw as Partial<MasterDataRecord>;
  systemDraft.employeeCode = option.code;
  systemDraft.name = option.name;
  systemDraft.department = employee.owner || '';
  systemDraft.phone = employee.phone || employee.contact || '';
  systemDraft.email = employee.email || '';

  if (!systemDraft.username) {
    systemDraft.username = option.code.toLowerCase().replace(/^emp-/, '').replace(/[^a-z0-9]+/g, '.');
  }
}

function clearAccountEmployeeLink() {
  if (!isAccountsPage.value || isSystemReadonly.value) return;
  systemDraft.employeeCode = '';
}

function menuParentDisplay(row: SystemRecord) {
  if (!row.parentCode) return '一级菜单';
  const parent = relatedMenuRows.value.find((menu) => menu.code === row.parentCode);
  return parent ? `${parent.name}（${row.parentCode}）` : row.parentCode;
}

function menuPermissionDisplay(code: string | undefined) {
  if (!code) return '无限制';
  const permission = relatedPermissionRows.value.find((row) => row.code === code);
  return permission ? `${permission.name}（${code}）` : code;
}

function menuPermissionOptionTitle(permissionCode = '') {
  if (isSystemReadonly.value) return systemReadonlyMessage.value;
  if (isProtectedSystemMenuDraft.value) return '系统核心菜单固定绑定系统配置维护权限';
  if (!permissionCode) return menuNoPermissionDisabledReason.value;
  return menuPermissionDisplay(permissionCode);
}

function notificationReceiverDisplay(value: string | string[] | undefined) {
  const names = listCodes(value).map((item) => roleDisplayName(item));
  return names.length ? names.join('、') : '未配置接收角色';
}

function selectMenuPermission(code: string) {
  if (!isMenusPage.value || isSystemReadonly.value || isProtectedSystemMenuDraft.value) return;
  if (!code && menuNoPermissionDisabledReason.value) {
    saveMessage.value = menuNoPermissionDisabledReason.value;
    return;
  }
  if (isOperationPermissionCode(code)) {
    saveMessage.value = `菜单入口不能绑定操作权限：${permissionDisplayLabel(code)}。请在角色权限中配置确认、过账或收付款。`;
    return;
  }
  if (code && selectedMenuRequiredRoutePermissionCode.value && systemDraft.status !== '停用' && code !== selectedMenuRequiredRoutePermissionCode.value) {
    saveMessage.value = menuRequiredPermissionMessage.value;
    return;
  }
  systemDraft.permissionCode = code;
}

function logTarget(row: SystemRecord) {
  if (row.target) return row.target;
  const description = row.description || '';
  return description.split(/[:：]/)[0] || row.code;
}

function logRemark(row: SystemRecord) {
  if (row.remark) return row.remark;
  const description = row.description || '';
  const parts = description.split(/[:：]/);
  return parts.length > 1 ? parts.slice(1).join('：').trim() : description || '-';
}

function businessLogTargetRouteForCode(rawCode: string | undefined) {
  const code = canonicalSystemCode(rawCode);
  if (!code) return undefined;
  return businessLogTargetRoutes.find((route) => code.startsWith(`${route.prefix}-`));
}

function systemRecordPageForCode(rawCode: string | undefined) {
  const code = canonicalSystemCode(rawCode);
  return Object.entries(systemCodePrefixes).find(([, prefix]) => code.startsWith(`${prefix}-`))?.[0];
}

function systemRowsForPage(page: string | undefined) {
  if (page === 'accounts') return relatedAccountRows.value;
  if (page === 'permissions') return relatedPermissionRows.value;
  if (page === 'roles') return relatedRoleRows.value;
  if (page === 'menus') return relatedMenuRows.value;
  if (page === 'notifications') return relatedNotificationRows.value;
  if (page === 'naming-rules') return relatedNamingRuleRows.value;
  if (page === 'apps') return relatedAppRows.value;
  if (page === 'mcp-tools') return relatedMcpToolRows.value;
  return systemPageKey.value === page ? systemRows.value : [];
}

function systemRecordForCode(rawCode: string | undefined) {
  const code = canonicalSystemCode(rawCode);
  const page = systemRecordPageForCode(code);
  if (!page) return undefined;
  return systemRowsForPage(page).find((row) => canonicalSystemCode(row.code) === code);
}

function systemRecordLocationForCode(rawCode: string | undefined) {
  const code = canonicalSystemCode(rawCode);
  const page = systemRecordPageForCode(code);
  return page ? systemQueryLocation(`/system/${page}`, code) : undefined;
}

function businessRecordLocationForCode(rawCode: string | undefined) {
  const code = canonicalSystemCode(rawCode);
  if (code.startsWith('SR-')) return undefined;
  const route = businessLogTargetRouteForCode(code);
  return route ? { path: `${route.path}/${encodeURIComponent(code)}` } : undefined;
}

function salesOrderCodeFromShipmentTrackingLog(row: SystemRecord) {
  const target = canonicalSystemCode(logTarget(row));
  if (!target.startsWith('SR-')) return '';

  const sourceText = [row.remark, row.description, row.name]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
  return canonicalSystemCode(sourceText.match(/\bSO-[A-Z0-9-]+\b/i)?.[0]);
}

function businessRecordLocationForLog(row: SystemRecord) {
  const target = canonicalSystemCode(logTarget(row));
  if (target.startsWith('SR-')) {
    const sourceOrderCode = salesOrderCodeFromShipmentTrackingLog(row);
    return sourceOrderCode
      ? { path: `/sales/orders/${encodeURIComponent(sourceOrderCode)}/delivery` }
      : undefined;
  }
  return businessRecordLocationForCode(target);
}

function accountRecordByIdentity(value: string | undefined) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return undefined;
  const exactMatch = relatedAccountRows.value.find((account) =>
    [account.code, account.username, account.name, account.employeeCode]
      .some((item) => String(item || '').trim().toLowerCase() === text),
  );
  if (exactMatch) return exactMatch;
  return relatedAccountRows.value.find((account) =>
    [account.code, account.username, account.name, account.employeeCode]
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
      .some((item) => text.includes(item)),
  );
}

function systemRecordSearchTextForLog(record: SystemRecord | undefined) {
  if (!record) return '';
  return [
    record.code,
    record.name,
    record.owner,
    record.status,
    record.description,
    record.username,
    record.employeeCode,
    record.department,
    record.roles,
    record.permissions,
    record.path,
    record.permissionCode,
    record.parentCode,
    record.triggerModule,
    record.triggerAction,
    record.receiverRoles,
    record.channel,
    record.appType,
    record.deployTarget,
    record.runtimeMode,
    record.publicUrl,
    record.apiBase,
    record.healthPath,
    record.dataStore,
    record.versionTag,
    record.toolType,
    record.useScope,
    record.entryPoint,
    record.verifyMethod,
    record.riskLevel,
    record.lastVerifiedAt,
    record.lastVerificationRemark,
    record.ruleKey,
    record.prefix,
    record.sampleCode,
  ]
    .filter(Boolean)
    .join(',');
}

function logSearchText(row: SystemRecord) {
  const target = logTarget(row);
  const targetSystemRecord = systemRecordForCode(target);
  const targetBusinessRoute = businessLogTargetRouteForCode(target);
  const sourceAccount = accountRecordByIdentity(row.sourceAccount || row.owner);
  return [
    target,
    logRemark(row),
    row.sourceAccount,
    row.sourceIp,
    systemRecordSearchTextForLog(targetSystemRecord),
    targetBusinessRoute?.label,
    targetBusinessRoute?.path,
    ...(targetBusinessRoute?.aliases ?? []),
    systemRecordSearchTextForLog(sourceAccount),
  ]
    .filter(Boolean)
    .join(',');
}

const selectedSystemLogTargetLocation = computed(() => {
  if (!isLogsPage.value || !systemDraft.code) return undefined;
  const target = logTarget(systemDraft);
  return systemRecordLocationForCode(target) || businessRecordLocationForLog(systemDraft);
});

const selectedSystemLogSourceAccountLocation = computed(() => {
  if (!isLogsPage.value || !systemDraft.code) return undefined;
  const account = accountRecordByIdentity(systemDraft.sourceAccount || systemDraft.owner);
  return account ? systemRecordLocationForCode(account.code) : undefined;
});

function systemRowDescription(row: SystemRecord) {
  if (isLogsPage.value) {
    return `${logTarget(row)} · ${logRemark(row)}`;
  }
  if (isNotificationsPage.value) {
    return row.description || `${row.triggerModule || '-'} · ${row.triggerAction || '-'}`;
  }
  if (isAppsPage.value) {
    return row.description || `${row.appType || '-'} · ${row.runtimeMode || '-'}`;
  }
  if (isMcpToolsPage.value) {
    return row.description || row.useScope || '-';
  }
  if (isAccountsPage.value) {
    return row.employeeCode ? `关联员工 ${row.employeeCode}` : row.description || row.email || row.phone || '-';
  }
  if (isRolesPage.value) {
    return row.description || '-';
  }
  if (isMenusPage.value) {
    return row.description || '-';
  }
  if (!isNamingRulesPage.value) return row.description || '-';
  if (row.description) return row.description;
  const dateFormat = namingDateFormatOptions.find((option) => option.value === row.dateFormat)?.label || row.dateFormat || 'YYYYMMDD';
  const sequenceLength = normalizeSequenceLength(row.sequenceLength);
  return `${row.prefix || '-'} · ${dateFormat} · ${sequenceLength} 位 · 示例 ${row.sampleCode || ''}`;
}

function systemStatusClass(status: string | undefined) {
  if (status === '停用') return 'status-void';
  if (status === '异常') return 'status-pending';
  if (status === '正常') return 'status-confirmed';
  return 'status-done';
}

function appHealthStatusClass(status: string | undefined) {
  return status === '正常' ? 'status-done' : 'status-draft';
}

function systemTableCellClass(column: SystemTableColumn) {
  return [
    `system-config-cell-${column.key}`,
    column.className || '',
    column.key === 'actions' ? 'row-actions compact-actions' : '',
  ].filter(Boolean);
}

function permissionLinkedRoleCount(permissionCode: string) {
  return relatedRoleRows.value.filter((role) => role.status !== '停用' && roleDirectlyReferencesPermission(role, permissionCode)).length;
}

function permissionLinkedBusinessRoleCount(permissionCode: string) {
  return relatedRoleRows.value.filter(
    (role) => role.status !== '停用' && roleDirectlyReferencesPermission(role, permissionCode),
  ).length;
}

function permissionLinkedEnabledMenuCount(permissionCode: string) {
  return relatedMenuRows.value.filter((menu) => menu.status !== '停用' && menu.permissionCode === permissionCode).length;
}

function roleLinkedAccountCount(roleCode: string) {
  return relatedAccountRows.value.filter((account) => account.status !== '停用' && accountHasRole(account, roleCode)).length;
}

function roleLinkedNotificationCount(roleCode: string) {
  return relatedNotificationRows.value.filter(
    (notification) =>
      notification.status !== '停用' &&
      listCodes(notification.receiverRoles).map(roleCodeFromCodeOrName).includes(roleCode),
  ).length;
}

function permissionDisplayLabel(code: string) {
  const permission = relatedPermissionRows.value.find((row) => row.code === code);
  return permission ? `${permission.name}（${code}）` : code;
}

function permissionDisplayLabels(codes: string[]) {
  return codes.map(permissionDisplayLabel).join('、');
}

function permissionLinkTargets(codes: string[]) {
  const seenCodes = new Set<string>();
  return codes
    .map((code) => canonicalSystemCode(code))
    .filter((code) => {
      if (!code || seenCodes.has(code)) return false;
      seenCodes.add(code);
      return true;
    })
    .map((code) => ({
      code,
      label: permissionDisplayName(code),
    }));
}

function roleLinkTargets(codes: string[]) {
  const seenCodes = new Set<string>();
  return codes
    .map((code) => roleCodeFromCodeOrName(code))
    .filter((code) => {
      if (!code || seenCodes.has(code)) return false;
      seenCodes.add(code);
      return true;
    })
    .map((code) => ({
      code,
      label: roleDisplayName(code),
    }));
}

function roleStartBlockReason(row: SystemRecord) {
  if (row.code === adminRoleCode) return '';
  const permissionCodes = listCodes(row.permissions);
  if (!permissionCodes.length) return '启用角色必须至少选择一个权限点';

  const knownPermissionCodes = new Set(relatedPermissionRows.value.map((permission) => permission.code));
  const invalidPermissionCodes = permissionCodes.filter((code) => !knownPermissionCodes.has(code));
  if (invalidPermissionCodes.length) return `角色包含不存在的权限点：${invalidPermissionCodes.join('、')}`;

  const disabledPermissionCodes = permissionCodes.filter(
    (code) => relatedPermissionRows.value.find((permission) => permission.code === code)?.status === '停用',
  );
  if (disabledPermissionCodes.length) return `角色不能绑定已停用的权限点：${permissionDisplayLabels(disabledPermissionCodes)}`;

  const missingDetails = operationDependencyDetailsForSelection(permissionCodes);
  if (missingDetails.length) return `操作权限缺少基础权限：${missingDetails.join('；')}`;

  return '';
}

function accountRoleCodesForRow(row: SystemRecord) {
  return listCodes(row.roles).map(roleCodeFromCodeOrName);
}

function accountStartBlockReason(row: SystemRecord) {
  const username = String(row.username || '');
  if (row.code === defaultAdminAccountCode && !accountRoleCodesForRow(row).includes(adminRoleCode)) {
    return '默认管理员账号必须保留管理员角色';
  }
  if (!String(row.name || '').trim() && !String(row.employeeCode || '').trim()) return '请选择关联员工或填写姓名';
  if (!String(row.name || '').trim()) return '请填写名称';
  if (!username.trim()) return '请填写登录账号';
  if (/\s/.test(username)) return '登录账号不能包含空格';
  const usernameFormatMessage = accountUsernameFormatMessageForValue(username);
  if (usernameFormatMessage) return usernameFormatMessage;

  const normalizedUsername = normalizedAccountUsername(row.username);
  const duplicateUsername = relatedAccountRows.value.find(
    (account) => account.code !== row.code && normalizedAccountUsername(account.username) === normalizedUsername,
  );
  if (duplicateUsername) return `登录账号已被 ${duplicateUsername.name || duplicateUsername.code} 使用`;

  const duplicateIdentityCode = relatedAccountRows.value.find(
    (account) => account.code !== row.code && normalizedAccountUsername(account.code) === normalizedUsername,
  );
  if (duplicateIdentityCode) return `登录账号不能与账号编码 ${duplicateIdentityCode.code} 相同`;

  const normalizedCode = normalizedAccountUsername(row.code);
  const duplicateCodeUsername = relatedAccountRows.value.find(
    (account) => account.code !== row.code && normalizedAccountUsername(account.username) === normalizedCode,
  );
  if (duplicateCodeUsername) return `账号编码不能与登录账号 ${duplicateCodeUsername.username} 相同`;

  const employeeCode = String(row.employeeCode || '').trim();
  if (employeeCode) {
    const employeeBlockReason = accountLinkedEmployeeBlockReason(row);
    if (employeeBlockReason) return employeeBlockReason;

    const duplicateEmployee = relatedAccountRows.value.find(
      (account) => account.code !== row.code && String(account.employeeCode || '').trim() === employeeCode,
    );
    if (duplicateEmployee) return `该员工已关联账号 ${duplicateEmployee.name || duplicateEmployee.code}`;
  }

  const roleCodes = accountRoleCodesForRow(row);
  if (!roleCodes.length) return '启用账号必须至少选择一个角色';

  const invalidRoleCodes = roleCodes.filter(
    (roleCode) => !relatedRoleRows.value.some((role) => role.status !== '停用' && role.code === roleCode),
  );
  if (invalidRoleCodes.length) return `账号只能选择启用中的角色：${invalidRoleCodes.map(roleDisplayName).join('、')}`;
  if (!accountEffectivePermissionCodes({ ...row, status: '启用' }).length) {
    return '启用账号必须至少拥有一个有效权限，请先分配包含启用权限点的角色';
  }

  if (accountPasswordLoginRequired.value && !row.passwordSet) {
    return '系统已启用密码登录，启用账号必须设置登录密码';
  }
  const passwordSystemManagerMessage = accountPasswordSystemManagerBlockReason({ ...row, status: '启用' });
  if (passwordSystemManagerMessage) return passwordSystemManagerMessage;

  return '';
}

function menuRoutePermissionMessageForRow(row: SystemRecord) {
  const requiredPermissionCode = menuRequiredPermissionCodeForPath(row.path);
  if (!requiredPermissionCode || row.permissionCode === requiredPermissionCode) return '';
  return `该路由必须绑定 ${permissionDisplayLabel(requiredPermissionCode)}`;
}

function menuStartBlockReason(row: SystemRecord) {
  if (row.parentCode) {
    const parent = relatedMenuRows.value.find((menu) => menu.code === row.parentCode);
    if (!parent) return `上级菜单不存在：${row.parentCode}`;
    if (parent.status === '停用') return `请先启用上级菜单：${parent.name || parent.code}`;
  }

  const sortReason = menuSortOrderMessageForRow(row);
  if (sortReason) return sortReason;

  if (row.permissionCode && isOperationPermissionCode(row.permissionCode)) {
    return `菜单入口不能绑定操作权限：${permissionDisplayLabel(row.permissionCode)}。请在角色权限中配置确认、过账或收付款。`;
  }

  const routePermissionMessage = menuRoutePermissionMessageForRow(row);
  if (routePermissionMessage) return routePermissionMessage;

  if (row.permissionCode) {
    const permission = relatedPermissionRows.value.find((candidate) => candidate.code === row.permissionCode);
    if (!permission) return `菜单绑定的权限点不存在：${row.permissionCode}`;
    if (permission.status === '停用') return `菜单不能绑定已停用权限点：${permissionDisplayLabel(row.permissionCode)}`;
  }

  return '';
}

function activeChildMenuRows(row: SystemRecord) {
  return relatedMenuRows.value
    .filter((menu) => menu.code !== row.code && menu.parentCode === row.code && menu.status !== '停用')
    .sort(compareMenuRows);
}

function activeChildMenuCount(row: SystemRecord) {
  return activeChildMenuRows(row).length;
}

function activeChildMenuSummary(row: SystemRecord) {
  const rows = activeChildMenuRows(row);
  const names = rows.slice(0, 4).map((menu) => menu.name || menu.code);
  return rows.length > names.length ? `${names.join('、')} 等 ${rows.length} 个` : names.join('、');
}

function summarizeRecordNames(rows: SystemRecord[], limit = 4) {
  const names = rows.slice(0, limit).map((row) => row.name || row.code);
  return rows.length > names.length ? `${names.join('、')} 等 ${rows.length} 个` : names.join('、');
}

function permissionStopReferenceSummary(permissionCode: string) {
  const roleRows = relatedRoleRows.value.filter(
    (role) => role.status !== '停用' && roleDirectlyReferencesPermission(role, permissionCode),
  );
  const menuRows = relatedMenuRows.value.filter((menu) => menu.status !== '停用' && menu.permissionCode === permissionCode);
  const operationRows = dependentOperationPermissionRows(permissionCode);
  return [
    roleRows.length ? `启用角色：${summarizeRecordNames(roleRows)}` : '',
    menuRows.length ? `启用菜单：${summarizeRecordNames(menuRows)}` : '',
    operationRows.length ? `启用操作权限：${summarizeRecordNames(operationRows)}` : '',
  ].filter(Boolean).join('；');
}

function roleStopReferenceSummary(roleCode: string) {
  const accountRows = relatedAccountRows.value.filter((account) => account.status !== '停用' && accountHasRole(account, roleCode));
  const notificationRows = relatedNotificationRows.value.filter(
    (notification) =>
      notification.status !== '停用' &&
      listCodes(notification.receiverRoles).map(roleCodeFromCodeOrName).includes(roleCode),
  );
  return [
    accountRows.length ? `启用账号：${summarizeRecordNames(accountRows)}` : '',
    notificationRows.length ? `启用通知规则：${summarizeRecordNames(notificationRows)}` : '',
  ].filter(Boolean).join('；');
}

function systemStopBlockReason(row: SystemRecord) {
  const protectedReason = protectedSystemRecordReason(row);
  if (protectedReason) return protectedReason;

  if (
    isAccountsPage.value &&
    row.code === session.user.accountCode &&
    session.hasPermission(systemPermissionCode) &&
    accountProvidesSystemConfig(row)
  ) {
    return '不能停用当前账号，否则会无法继续管理系统';
  }

  if (isAccountsPage.value) {
    const passwordSystemManagerMessage = accountPasswordSystemManagerBlockReason({ ...row, status: '停用' });
    if (passwordSystemManagerMessage) return passwordSystemManagerMessage;

    const notificationBlockReason = accountNotificationRecipientBlockReason({ ...row, status: '停用' });
    if (notificationBlockReason) return notificationBlockReason;
  }

  if (isPermissionsPage.value) {
    const roleCount = permissionLinkedBusinessRoleCount(row.code);
    const menuCount = permissionLinkedEnabledMenuCount(row.code);
    const dependentOperationCount = dependentOperationPermissionRows(row.code).length;
    if (roleCount || menuCount || dependentOperationCount) {
      return `该权限仍被引用：${permissionStopReferenceSummary(row.code)}。请先调整角色、菜单或依赖权限后再停用`;
    }
  }

  if (isMenusPage.value) {
    const childCount = activeChildMenuCount(row);
    if (childCount) return `该菜单下仍有启用下级菜单：${activeChildMenuSummary(row)}，请先停用下级菜单后再停用该菜单`;
  }

  if (isRolesPage.value) {
    if (roleChangeRemovesCurrentSessionSystemConfig({ ...row, status: '停用' })) {
      return '不能停用当前账号正在依赖的系统管理角色，否则会无法继续管理系统';
    }

    const accountCount = roleLinkedAccountCount(row.code);
    const notificationCount = roleLinkedNotificationCount(row.code);
    if (accountCount || notificationCount) {
      return `该角色仍被引用：${roleStopReferenceSummary(row.code)}。请先从账号和通知规则中移除后再停用`;
    }
  }

  return '';
}

function notificationReceiverRawRoleCodesForRow(row: SystemRecord) {
  return listCodes(row.receiverRoles).map(roleCodeFromCodeOrName);
}

function notificationReceiverRoleCodesForRow(row: SystemRecord) {
  const activeCodes = activeRoleCodeSet();
  return notificationReceiverRawRoleCodesForRow(row).filter((code) => activeCodes.has(code));
}

function notificationReceiverRoleNames(receiverRoles: string | string[] | undefined) {
  const names = listCodes(receiverRoles).map(roleCodeFromCodeOrName).map(roleDisplayName);
  return names.length ? names.join('、') : '所选接收角色';
}

function notificationNoTargetAccountMessage(receiverRoles: string | string[] | undefined) {
  return `接收角色 ${notificationReceiverRoleNames(receiverRoles)} 当前没有匹配启用账号，请先为这些角色分配启用账号或调整接收角色`;
}

function notificationStartBlockReason(row: SystemRecord) {
  const triggerAction = String(row.triggerAction || '').trim();
  const channel = String(row.channel || '').trim();
  if (!triggerAction) return '请填写触发动作';
  if (!notificationActionOptionsForModule(row.triggerModule).includes(triggerAction)) return '请选择当前系统已接通的触发动作';
  if (!isSupportedNotificationChannel(channel)) return notificationChannelUnsupportedMessage();
  const receiverRoleCodes = notificationReceiverRawRoleCodesForRow(row);
  if (!receiverRoleCodes.length) return '请选择接收角色';
  const activeReceiverRoleCodes = notificationReceiverRoleCodesForRow(row);
  const invalidReceiverRoleCodes = receiverRoleCodes.filter((roleCode) => !activeReceiverRoleCodes.includes(roleCode));
  if (invalidReceiverRoleCodes.length) {
    return `通知规则只能选择启用中的接收角色：${invalidReceiverRoleCodes.map(roleDisplayName).join('、')}`;
  }
  if (!notificationTargetAccountRows(row.receiverRoles).length) {
    return notificationNoTargetAccountMessage(row.receiverRoles);
  }
  return '';
}

function appStartBlockReason(row: SystemRecord) {
  const optionReason = appOptionDisabledReasonForRow(row);
  if (optionReason) return optionReason;
  const missing = appRequiredMissingFieldsForRow({ ...row, status: '启用' });
  if (missing.length) return `启用应用缺少：${missing.join('、')}`;
  const formatIssue = appUrlFormatMessageForRow({ ...row, status: '启用' });
  if (formatIssue) return formatIssue;
  return '';
}

function mcpToolStartBlockReason(row: SystemRecord) {
  const optionReason = mcpToolOptionDisabledReasonForRow(row);
  if (optionReason) return optionReason;
  const missing = mcpToolRequiredMissingFieldsForRow({ ...row, status: '启用' });
  return missing.length ? `启用工具缺少：${missing.join('、')}` : '';
}

function optionDictionaryStartBlockReason(row: SystemRecord) {
  const missing = optionDictionaryMissingFieldsForRow({ ...row, status: '启用' });
  return missing.length ? `启用选项字典缺少：${missing.join('、')}` : '';
}

function namingRuleStartBlockReason(row: SystemRecord) {
  return namingRulePrefixMissingMessage(row);
}

function systemStartBlockReason(row: SystemRecord) {
  if (row.status !== '停用') return '';
  if (isAccountsPage.value) return accountStartBlockReason(row);
  if (isRolesPage.value) return roleStartBlockReason(row);
  if (isMenusPage.value) return menuStartBlockReason(row);
  if (isNamingRulesPage.value) return namingRuleStartBlockReason(row);
  if (isNotificationsPage.value) return notificationStartBlockReason(row);
  if (isOptionDictionariesPage.value) return optionDictionaryStartBlockReason(row);
  if (isAppsPage.value) return appStartBlockReason(row);
  if (isMcpToolsPage.value) return mcpToolStartBlockReason(row);
  return '';
}

function systemStatusToggleBlockReason(row: SystemRecord) {
  return row.status === '启用' ? systemStopBlockReason(row) : systemStartBlockReason(row);
}

function systemStatusActionLabel(row: SystemRecord) {
  return row.status === '启用' ? '停用' : '启用';
}

function systemStatusActionTitle(row: SystemRecord) {
  const blockReason = systemStatusToggleBlockReason(row);
  if (blockReason) return blockReason;
  return `${systemStatusActionLabel(row)}${row.name || row.code || systemEntityLabel.value}`;
}

const systemDraftStatusDisabledReason = computed(() => {
  if (isSystemReadonly.value) return systemReadonlyMessage.value;
  return systemStatusToggleBlockReason(systemDraft);
});

const notificationSaveDisabledReason = computed(() => {
  if (!isNotificationsPage.value || systemDraft.status === '停用') return '';
  const triggerAction = String(systemDraft.triggerAction || '').trim();
  const channel = String(systemDraft.channel || '').trim();
  if (!triggerAction) return '请填写触发动作';
  if (!notificationActionOptions.value.includes(triggerAction)) return '请选择当前系统已接通的触发动作';
  if (!isSupportedNotificationChannel(channel)) return notificationChannelUnsupportedMessage();
  if (invalidNotificationReceiverRoleMessage.value) return invalidNotificationReceiverRoleMessage.value;
  if (!notificationReceiverRoleCodes.value.length) return '请选择接收角色';
  if (!selectedNotificationAccounts.value.length) return notificationNoTargetAccountMessage(systemDraft.receiverRoles);
  return '';
});

function optionDictionaryMissingFieldsForRow(row: SystemRecord) {
  if (row.status === '停用') return [];
  return [
    ['所属模块', row.optionModule],
    ['字段/用途', row.optionField],
    ['选项值', row.optionValues],
  ]
    .filter(([, value]) => !String(value || '').trim())
    .map(([label]) => label);
}

const optionDictionarySaveDisabledReason = computed(() => {
  if (!isOptionDictionariesPage.value) return '';
  const missing = optionDictionaryMissingFieldsForRow(systemDraft);
  return missing.length ? `启用选项字典缺少：${missing.join('、')}` : '';
});

const appSaveDisabledReason = computed(() => {
  if (!isAppsPage.value) return '';
  const optionReason = appOptionDisabledReasonForRow(systemDraft);
  if (optionReason) return optionReason;
  if (systemDraft.status === '停用') return '';
  const missing = appRequiredMissingFields.value;
  if (missing.length) return `启用应用缺少：${missing.join('、')}`;
  return appUrlFormatMessage.value;
});

const mcpToolSaveDisabledReason = computed(() => {
  if (!isMcpToolsPage.value) return '';
  const optionReason = mcpToolOptionDisabledReasonForRow(systemDraft);
  if (optionReason) return optionReason;
  if (systemDraft.status === '停用') return '';
  const missing = mcpToolRequiredMissingFieldsForRow(systemDraft);
  return missing.length ? `启用工具缺少：${missing.join('、')}` : '';
});

const systemSaveDisabledReason = computed(() => {
  if (isSystemReadonly.value) return systemReadonlyMessage.value;
  if (isSaving.value) return '正在保存，请稍候';
  if (selfSystemConfigLockMessage.value) return selfSystemConfigLockMessage.value;
  if (systemCodeFormatMessage.value) return systemCodeFormatMessage.value;
  if (systemCodeConflictMessage.value) return systemCodeConflictMessage.value;
  if (permissionIdentityConflictMessage.value) return permissionIdentityConflictMessage.value;
  if (roleIdentityConflictMessage.value) return roleIdentityConflictMessage.value;
  if (enabledRoleRequiresPermission.value) return '启用角色必须至少选择一个权限点';
  if (invalidRolePermissionMessage.value) return invalidRolePermissionMessage.value;
  if (selectedRoleOperationDependencyMessage.value) return selectedRoleOperationDependencyMessage.value;
  if (roleAccountEffectivePermissionSaveBlockReason.value) return roleAccountEffectivePermissionSaveBlockReason.value;
  if (rolePasswordSystemManagerBlockReason.value) return rolePasswordSystemManagerBlockReason.value;
  if (menuSortOrderMessage.value) return menuSortOrderMessage.value;
  if (menuSortConflictMessage.value) return menuSortConflictMessage.value;
  if (menuPermissionMismatchMessage.value) return menuPermissionMismatchMessage.value;
  if (menuPermissionInvalidMessage.value) return menuPermissionInvalidMessage.value;
  if (accountNotificationRecipientBlockReason(systemDraft)) return accountNotificationRecipientBlockReason(systemDraft);
  if (accountSaveValidationMessage.value) return accountSaveValidationMessage.value;
  if (namingRuleSaveDisabledReason.value) return namingRuleSaveDisabledReason.value;
  if (notificationSaveDisabledReason.value) return notificationSaveDisabledReason.value;
  if (optionDictionarySaveDisabledReason.value) return optionDictionarySaveDisabledReason.value;
  if (appSaveDisabledReason.value) return appSaveDisabledReason.value;
  if (mcpToolSaveDisabledReason.value) return mcpToolSaveDisabledReason.value;
  if (isProtectedSystemRecord(systemDraft) && systemDraft.status === '停用') return protectedSystemRecordReason(systemDraft);
  if (systemDraft.status === '停用') return systemStopBlockReason(systemDraft);
  return '';
});
const visibleSystemSaveDisabledReason = computed(() => {
  if (isSystemReadonly.value || !systemSaveDisabledReason.value) return '';
  return saveMessage.value === systemSaveDisabledReason.value ? '' : systemSaveDisabledReason.value;
});

function roleLinkedMenuCount(row: SystemRecord) {
  return roleAccessibleMenuRows(row).length;
}

function namingRuleDateLabel(row: SystemRecord) {
  return namingDateFormatOptions.find((option) => option.value === row.dateFormat)?.label || row.dateFormat || 'YYYYMMDD';
}

function namingRuleRowSample(row: SystemRecord) {
  if (row.sampleCode) return row.sampleCode;
  const prefix = (row.prefix || row.code.replace(/^RULE-/, '') || 'DOC')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const sequence = String(1).padStart(normalizeSequenceLength(row.sequenceLength), '0');
  return [prefix || 'DOC', formatNamingDate(row.dateFormat), sequence].filter(Boolean).join('-');
}

function optionValueList(row: SystemRecord) {
  return listCodes(row.optionValues);
}

function optionValueSummary(row: SystemRecord) {
  const values = optionValueList(row);
  if (!values.length) return '-';
  const visibleValues = values.slice(0, 4).join('、');
  return values.length > 4 ? `${visibleValues} 等 ${values.length} 项` : visibleValues;
}

function appRowReadiness(row: SystemRecord) {
  const missing = appRequiredMissingFieldsForRow(row, { includeStopped: true });
  if (missing.length) return `缺少 ${missing.join('、')}`;
  return appConfigFormatIssueText(row) || '配置完整';
}

function systemTableCellValue(row: SystemRecord, key: string) {
  if (key === 'code') return row.code || '-';
  if (key === 'username') return row.username || '-';
  if (key === 'roles') return formatRoleList(row.roles);
  if (key === 'department') return row.department || '-';
  if (key === 'password') return accountPasswordStatusText(row);
  if (key === 'module') return permissionModuleLabel(row);
  if (key === 'permissionType') return permissionTypeSummary(row);
  if (key === 'permissionRefs') return `${permissionLinkedRoleCount(row.code)} 个启用角色 / ${permissionLinkedEnabledMenuCount(row.code)} 个启用菜单`;
  if (key === 'permissionCount') return `${effectivePermissionCodesForRole(row).length} 个`;
  if (key === 'operationCount') {
    if (isRolesPage.value) return `${roleOperationImpactCount(row)} 项`;
    if (isAccountsPage.value) return `${accountOperationImpactCount(row)} 项`;
    return '-';
  }
  if (key === 'menuAccessCount') return `${accountAccessibleMenuRows(row).length} 个`;
  if (key === 'roleImpact') {
    return `${roleLinkedAccountCount(row.code)} 个账号 / ${roleLinkedNotificationCount(row.code)} 条通知 / ${roleLinkedMenuCount(row)} 个菜单`;
  }
  if (key === 'parent') return menuParentDisplay(row);
  if (key === 'path') return row.path || '-';
  if (key === 'permission') return menuPermissionDisplay(row.permissionCode);
  if (key === 'accessScope') return `${menuAccessibleRoleRows(row).length} 个角色 / ${menuAccessibleAccountRows(row).length} 个账号`;
  if (key === 'sort') return String(row.sortOrder ?? '-');
  if (key === 'prefix') return row.prefix || '-';
  if (key === 'dateFormat') return namingRuleDateLabel(row);
  if (key === 'sample') return namingRuleRowSample(row);
  if (key === 'trigger') return `${row.triggerModule || '-'} / ${row.triggerAction || '-'}`;
  if (key === 'receivers') return notificationReceiverDisplay(row.receiverRoles);
  if (key === 'targetAccounts') return `${notificationTargetAccountRows(row.receiverRoles).length} 个`;
  if (key === 'channel') return row.channel || '-';
  if (key === 'optionModule') return row.optionModule || '-';
  if (key === 'optionField') return row.optionField || '-';
  if (key === 'optionValues') return optionValueSummary(row);
  if (key === 'optionScope') return row.useScope || '-';
  if (key === 'deployTarget') return row.deployTarget || '-';
  if (key === 'endpoint') return row.publicUrl || row.apiBase || '-';
  if (key === 'readiness') return `${row.healthStatus || '未检查'} · ${appRowReadiness(row)}`;
  if (key === 'toolType') return row.toolType || '-';
  if (key === 'risk') return `${row.riskLevel || '中'}风险`;
  if (key === 'entryPoint') return row.entryPoint || '-';
  if (key === 'lastVerifiedAt') return row.lastVerifiedAt || '未验证';
  if (key === 'target') return logTarget(row);
  if (key === 'owner') return row.owner || '-';
  if (key === 'sourceAccount') return row.sourceAccount || row.owner || '-';
  if (key === 'sourceIp') return row.sourceIp || '-';
  if (key === 'updatedAt') return row.updatedAt || '-';
  return String((row as Record<string, unknown>)[key] ?? '-');
}

function systemTableCellTitle(row: SystemRecord, key: string) {
  if (key === 'actions') return '';
  if (key === 'primary') return [row.name || '-', systemRowDescription(row)].filter(Boolean).join('\n');
  if (key === 'status') return row.status || '-';
  return systemTableCellValue(row, key);
}

function clearSystemActionLogLink() {
  systemLastActionLogQuery.value = '';
  systemLastActionMessage.value = '';
}

function showSystemActionMessage(message: string, logQuery: string) {
  saveMessage.value = message;
  systemLastActionLogQuery.value = logQuery;
  systemLastActionMessage.value = message;
}

function selectSystemRecord(row: SystemRecord) {
  Object.assign(systemDraft, blankSystemRecord(), { ...row, passwordInput: '', passwordConfirm: '' });
  selectedCode.value = row.code;
  isCreating.value = false;
  saveMessage.value = '';
  clearSystemActionLogLink();
  rolePermissionSearch.value = '';
  accountRoleSearch.value = '';
  notificationRoleSearch.value = '';
  menuPermissionSearch.value = '';
  mcpVerificationRemark.value = '';
}

function beginCreateSystemRecord() {
  Object.assign(systemDraft, blankSystemRecord());
  if (canCreateSystemRecord.value) {
    systemDraft.code = nextSystemRecordCode(systemPageKey.value, systemRows.value);
  }
  selectedCode.value = '';
  isCreating.value = true;
  saveMessage.value = '';
  clearSystemActionLogLink();
  rolePermissionSearch.value = '';
  accountRoleSearch.value = '';
  notificationRoleSearch.value = '';
  menuPermissionSearch.value = '';
  mcpVerificationRemark.value = '';
}

function clearSystemSelection() {
  Object.assign(systemDraft, blankSystemRecord());
  selectedCode.value = '';
  isCreating.value = false;
  saveMessage.value = '';
  clearSystemActionLogLink();
  mcpVerificationRemark.value = '';
}

function systemExactSelectionValues(row: SystemRecord) {
  const values = [
    row.code,
    row.name,
    row.username,
    row.employeeCode,
    row.path,
    row.permissionCode,
    row.parentCode,
    row.sourceAccount,
    row.target,
  ];

  if (isRolesPage.value) {
    values.push(
      ...roleIdentitySearchValues(row.code),
      ...listCodes(row.permissions),
      ...effectivePermissionCodesForRole(row),
      ...roleAccessibleMenuRows(row).flatMap((menu) => [menu.code, menu.name, menu.path, menu.permissionCode]),
    );
  }

  if (isAccountsPage.value) {
    values.push(
      ...listCodes(row.roles),
      ...listCodes(row.roles).flatMap(roleIdentitySearchValues),
      ...accountEffectivePermissionCodes(row),
      ...accountAccessibleMenuRows(row).flatMap((menu) => [menu.code, menu.name, menu.path, menu.permissionCode]),
    );
  }

  if (isMenusPage.value) {
    values.push(
      ...menuRequiredPermissionCodesForRow(row),
      ...menuAccessibleRoleRows(row).flatMap((role) => [role.code, role.name]),
      ...menuAccessibleAccountRows(row).flatMap((account) => [account.code, account.name, account.username, account.employeeCode]),
    );
  }

  if (isNotificationsPage.value) {
    values.push(
      ...listCodes(row.receiverRoles),
      ...listCodes(row.receiverRoles).flatMap(roleIdentitySearchValues),
    );
  }

  return values
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

function exactSystemSearchMatchRow() {
  const keyword = systemSearch.value.trim().toLowerCase();
  if (!keyword) return undefined;
  const exactRows = visibleSystemRows.value.filter((row) => systemExactSelectionValues(row).includes(keyword));
  if (!exactRows.length) return undefined;

  if (isMenusPage.value && keyword.startsWith('/')) {
    return [...exactRows].sort((a, b) => {
      const aPathMatch = String(a.path || '').trim().toLowerCase() === keyword;
      const bPathMatch = String(b.path || '').trim().toLowerCase() === keyword;
      if (aPathMatch !== bPathMatch) return aPathMatch ? -1 : 1;
      if (aPathMatch && bPathMatch) {
        const childMenuDiff = Number(Boolean(b.parentCode)) - Number(Boolean(a.parentCode));
        if (childMenuDiff) return childMenuDiff;
        return menuSortOrderValue(a) - menuSortOrderValue(b) || a.code.localeCompare(b.code);
      }
      return 0;
    })[0];
  }

  return exactRows[0];
}

function selectFirstVisibleSystemRecord() {
  const canFallbackToFirstRow = !systemSearch.value.trim() && !(isLogsPage.value && hasActiveLogFilters.value);
  const fallbackRow = canFallbackToFirstRow ? systemRows.value[0] : undefined;
  const row = exactSystemSearchMatchRow() || visibleSystemRows.value[0] || fallbackRow;
  if (!row) {
    clearSystemSelection();
    return;
  }
  selectSystemRecord(row);
}

function syncVisibleSystemSelection() {
  if (!isSystemPage.value || isCreating.value) return;
  if (selectedCode.value && visibleSystemRows.value.some((row) => row.code === selectedCode.value)) return;
  selectFirstVisibleSystemRecord();
}

async function loadSystemPage() {
  if (!isSystemPage.value) return;

  try {
    loadMessage.value = '';
    systemRows.value = await listSystemRecords(systemPageKey.value);
    const [permissions, roles, accounts, menus, notifications, namingRules, apps, mcpTools, employees] = await Promise.all([
      systemPageKey.value === 'permissions' ? Promise.resolve(systemRows.value) : listSystemRecords('permissions'),
      systemPageKey.value === 'roles' ? Promise.resolve(systemRows.value) : listSystemRecords('roles'),
      systemPageKey.value === 'accounts' ? Promise.resolve(systemRows.value) : listSystemRecords('accounts'),
      systemPageKey.value === 'menus' ? Promise.resolve(systemRows.value) : listSystemRecords('menus'),
      systemPageKey.value === 'notifications' ? Promise.resolve(systemRows.value) : listSystemRecords('notifications'),
      systemPageKey.value === 'naming-rules' ? Promise.resolve(systemRows.value) : listSystemRecords('naming-rules'),
      systemPageKey.value === 'apps' ? Promise.resolve(systemRows.value) : listSystemRecords('apps'),
      systemPageKey.value === 'mcp-tools' ? Promise.resolve(systemRows.value) : listSystemRecords('mcp-tools'),
      isAccountsPage.value ? listMasterRecords('employees') : Promise.resolve([] as MasterDataRecord[]),
    ]);
    permissionRows.value = permissions;
    roleRows.value = roles;
    accountRows.value = accounts;
    menuRows.value = menus;
    notificationRows.value = notifications;
    namingRuleRows.value = namingRules;
    appRows.value = apps;
    mcpToolRows.value = mcpTools;
    employeeRows.value = employees;
    systemSearch.value = systemSearchQueryText();
    if (systemRows.value.length) {
      selectFirstVisibleSystemRecord();
    } else if (canCreateSystemRecord.value) {
      beginCreateSystemRecord();
    } else {
      clearSystemSelection();
    }
  } catch (error) {
    systemRows.value = [];
    Object.assign(systemDraft, blankSystemRecord());
    permissionRows.value = [];
    roleRows.value = [];
    accountRows.value = [];
    menuRows.value = [];
    notificationRows.value = [];
    namingRuleRows.value = [];
    appRows.value = [];
    mcpToolRows.value = [];
    employeeRows.value = [];
    loadMessage.value = error instanceof Error ? error.message : '系统配置加载失败';
  }
}

function syncCurrentSystemRelatedRows() {
  if (isPermissionsPage.value) permissionRows.value = systemRows.value;
  if (isRolesPage.value) roleRows.value = systemRows.value;
  if (isAccountsPage.value) accountRows.value = systemRows.value;
  if (isMenusPage.value) menuRows.value = systemRows.value;
  if (isNotificationsPage.value) notificationRows.value = systemRows.value;
  if (isNamingRulesPage.value) namingRuleRows.value = systemRows.value;
  if (isAppsPage.value) appRows.value = systemRows.value;
  if (isMcpToolsPage.value) mcpToolRows.value = systemRows.value;
}

async function refreshSystemAccessAfterSave() {
  if (isAccountsPage.value || isRolesPage.value || isPermissionsPage.value) {
    await session.loadUserFromAccounts(true);
  }

  if (session.authRequired) {
    navigation.clearMenus();
    await router.replace({
      path: '/login',
      query: route.fullPath === '/' ? undefined : { redirect: route.fullPath },
    });
    return;
  }

  if (isMenusPage.value || isPermissionsPage.value || isAccountsPage.value || isRolesPage.value) {
    await navigation.loadMenus(true);
  }

  const canStayOnCurrentPage = canAccessNavigationPath(
    navigation.menuRows,
    route.path,
    (permissionCode) => session.hasPermission(permissionCode),
    navigation.loaded,
  );
  if (navigation.error || !canStayOnCurrentPage) {
    await router.replace(accessDeniedHomeLocation(navigation.error ? 'navigation' : 'menu', route.fullPath));
  }
}

async function saveSystemDraft() {
  if (isSystemReadonly.value) {
    saveMessage.value = systemReadonlyMessage.value;
    return;
  }
  if (isSaving.value) return;
  if (selfSystemConfigLockMessage.value) {
    saveMessage.value = selfSystemConfigLockMessage.value;
    return;
  }
  if (isCreating.value && systemDraft.code) {
    systemDraft.code = canonicalSystemCode(systemDraft.code);
  }
  if (systemCodeFormatMessage.value) {
    saveMessage.value = systemCodeFormatMessage.value;
    return;
  }
  if (systemCodeConflictMessage.value) {
    saveMessage.value = systemCodeConflictMessage.value;
    return;
  }
  if (isProtectedSystemRecord(systemDraft) && systemDraft.status === '停用') {
    saveMessage.value = protectedSystemRecordReason(systemDraft);
    return;
  }
  if (systemDraft.status === '停用') {
    const stopReason = systemStopBlockReason(systemDraft);
    if (stopReason) {
      saveMessage.value = stopReason;
      return;
    }
  }
  if (isAccountsPage.value && systemDraft.code === defaultAdminAccountCode && !accountResolvedRoleCodes.value.includes(adminRoleCode)) {
    saveMessage.value = '默认管理员账号必须保留管理员角色';
    return;
  }
  if (isAccountsPage.value && !systemDraft.name.trim() && !systemDraft.employeeCode) {
    saveMessage.value = '请填写账号姓名或选择关联员工';
    return;
  }
  if (!isAccountsPage.value && !systemDraft.name.trim()) {
    saveMessage.value = '请填写名称';
    return;
  }
  if (permissionIdentityConflictMessage.value) {
    saveMessage.value = permissionIdentityConflictMessage.value;
    return;
  }
  if (roleIdentityConflictMessage.value) {
    saveMessage.value = roleIdentityConflictMessage.value;
    return;
  }
  if (enabledRoleRequiresPermission.value) {
    saveMessage.value = '启用角色必须至少选择一个权限点';
    return;
  }
  if (invalidRolePermissionMessage.value) {
    saveMessage.value = invalidRolePermissionMessage.value;
    return;
  }
  if (selectedRoleOperationDependencyMessage.value) {
    saveMessage.value = selectedRoleOperationDependencyMessage.value;
    return;
  }
  if (roleAccountEffectivePermissionSaveBlockReason.value) {
    saveMessage.value = roleAccountEffectivePermissionSaveBlockReason.value;
    return;
  }
  if (isNamingRulesPage.value) {
    systemDraft.prefix = (systemDraft.prefix || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    systemDraft.sequenceLength = normalizeSequenceLength(systemDraft.sequenceLength);
    systemDraft.sampleCode = namingRuleSample.value;
    if (namingRuleConflictMessage.value) {
      saveMessage.value = namingRuleConflictMessage.value;
      return;
    }
    if (!systemDraft.prefix) {
      saveMessage.value = '请填写编码前缀';
      return;
    }
  }
  if (isMenusPage.value) {
    if (menuSortOrderMessage.value) {
      saveMessage.value = menuSortOrderMessage.value;
      return;
    }
    systemDraft.sortOrder = normalizeMenuSortOrder(systemDraft.sortOrder);
    if (menuSortConflictMessage.value) {
      saveMessage.value = menuSortConflictMessage.value;
      return;
    }
    if (menuPermissionMismatchMessage.value) {
      saveMessage.value = menuPermissionMismatchMessage.value;
      return;
    }
    if (menuPermissionInvalidMessage.value) {
      saveMessage.value = menuPermissionInvalidMessage.value;
      return;
    }
    if (protectedSystemMenuCodes.has(systemDraft.code) && systemDraft.permissionCode !== systemPermissionCode) {
      saveMessage.value = '系统核心菜单必须绑定系统配置维护权限';
      return;
    }
  }
  if (isNotificationsPage.value) {
    const notificationRuleEnabled = systemDraft.status !== '停用';
    systemDraft.triggerModule = (systemDraft.triggerModule || '销售').trim();
    systemDraft.triggerAction = (systemDraft.triggerAction || '').trim();
    systemDraft.channel = (systemDraft.channel || '站内').trim();
    if (notificationRuleEnabled && invalidNotificationReceiverRoleMessage.value) {
      saveMessage.value = invalidNotificationReceiverRoleMessage.value;
      return;
    }
    const activeRoleCodes = activeRoleCodeSet();
    systemDraft.receiverRoles = notificationResolvedReceiverRoleCodes.value.filter((code) => activeRoleCodes.has(code)).join(',');
    if (notificationRuleEnabled && !systemDraft.triggerAction) {
      saveMessage.value = '请填写触发动作';
      return;
    }
    if (notificationRuleEnabled && !notificationActionOptions.value.includes(systemDraft.triggerAction)) {
      saveMessage.value = '请选择当前系统已接通的触发动作';
      return;
    }
    if (notificationRuleEnabled && !isSupportedNotificationChannel(systemDraft.channel)) {
      saveMessage.value = notificationChannelUnsupportedMessage();
      return;
    }
    if (notificationRuleEnabled && !systemDraft.receiverRoles) {
      saveMessage.value = '请选择接收角色';
      return;
    }
    if (notificationRuleEnabled && !selectedNotificationAccounts.value.length) {
      saveMessage.value = notificationNoTargetAccountMessage(systemDraft.receiverRoles);
      return;
    }
  }
  if (isOptionDictionariesPage.value) {
    systemDraft.optionModule = (systemDraft.optionModule || '通用').trim();
    systemDraft.optionField = (systemDraft.optionField || '').trim();
    systemDraft.optionValues = listCodes(systemDraft.optionValues).join(',');
    systemDraft.useScope = (systemDraft.useScope || '').trim();
    if (optionDictionarySaveDisabledReason.value) {
      saveMessage.value = optionDictionarySaveDisabledReason.value;
      return;
    }
  }
  if (isAppsPage.value) {
    systemDraft.appType = (systemDraft.appType || '业务前端').trim();
    systemDraft.deployTarget = (systemDraft.deployTarget || '本地开发').trim();
    systemDraft.runtimeMode = (systemDraft.runtimeMode || '').trim();
    systemDraft.publicUrl = (systemDraft.publicUrl || '').trim();
    systemDraft.apiBase = (systemDraft.apiBase || '').trim();
    systemDraft.healthPath = (systemDraft.healthPath || '').trim();
    systemDraft.dataStore = (systemDraft.dataStore || '').trim();
    systemDraft.versionTag = (systemDraft.versionTag || '').trim();
    const optionReason = appOptionDisabledReasonForRow(systemDraft);
    if (optionReason) {
      saveMessage.value = optionReason;
      return;
    }
    if (appRequiredMissingFields.value.length) {
      saveMessage.value = `启用应用缺少：${appRequiredMissingFields.value.join('、')}`;
      return;
    }
    if (appUrlFormatMessage.value) {
      saveMessage.value = appUrlFormatMessage.value;
      return;
    }
  }
  if (isMcpToolsPage.value) {
    systemDraft.toolType = (systemDraft.toolType || '终端').trim();
    systemDraft.useScope = (systemDraft.useScope || '').trim();
    systemDraft.entryPoint = (systemDraft.entryPoint || '').trim();
    systemDraft.verifyMethod = (systemDraft.verifyMethod || '').trim();
    systemDraft.riskLevel = (systemDraft.riskLevel || '中').trim();
    systemDraft.lastVerifiedAt = (systemDraft.lastVerifiedAt || '').trim();
    const optionReason = mcpToolOptionDisabledReasonForRow(systemDraft);
    if (optionReason) {
      saveMessage.value = optionReason;
      return;
    }
    const missing = mcpToolRequiredMissingFieldsForRow(systemDraft);
    if (missing.length) {
      saveMessage.value = `启用工具缺少：${missing.join('、')}`;
      return;
    }
  }
  if (isAccountsPage.value) {
    systemDraft.username = canonicalAccountUsername(systemDraft.username);
    systemDraft.roles = (systemDraft.roles || '').trim();
    systemDraft.passwordInput = systemDraft.passwordInput || '';
    systemDraft.passwordConfirm = systemDraft.passwordConfirm || '';
    if (accountSaveValidationMessage.value) {
      saveMessage.value = accountSaveValidationMessage.value;
      return;
    }
  }

  try {
    isSaving.value = true;
    clearSystemActionLogLink();
    const wasCreatingSystemRecord = isCreating.value;
    const wasAccountPasswordUpdate =
      isAccountsPage.value && !wasCreatingSystemRecord && Boolean(systemDraft.passwordInput || systemDraft.passwordConfirm);
    const wasAccountDisable =
      isAccountsPage.value && selectedStoredSystemRecord.value?.status !== '停用' && systemDraft.status === '停用';
    const saved = await saveSystemRecord(systemPageKey.value, { ...systemDraft }, { create: isCreating.value });
    const index = systemRows.value.findIndex((row) => row.code === saved.code);
    if (index >= 0) {
      systemRows.value[index] = saved;
    } else {
      systemRows.value.unshift(saved);
    }
    syncCurrentSystemRelatedRows();
    selectSystemRecord(saved);
    await refreshSystemAccessAfterSave();
    const saveResultMessage = wasAccountDisable
      ? '已保存，账号已停用，旧会话已失效'
      : wasAccountPasswordUpdate
        ? '已保存，密码已更新，旧会话已失效'
        : '已保存';
    showSystemActionMessage(saveResultMessage, saved.code);
  } catch (error) {
    saveMessage.value = error instanceof Error ? error.message : '系统配置保存失败';
  } finally {
    isSaving.value = false;
  }
}

async function toggleSystemStatus(row: SystemRecord) {
  if (isSystemReadonly.value) {
    saveMessage.value = systemReadonlyMessage.value;
    return;
  }
  if (isSaving.value) return;
  const nextStatus = row.status === '启用' ? '停用' : '启用';
  const blockReason = systemStatusToggleBlockReason(row);
  if (blockReason) {
    saveMessage.value = blockReason;
    return;
  }

  try {
    isSaving.value = true;
    clearSystemActionLogLink();
    const saved = await saveSystemRecord(systemPageKey.value, { ...row, status: nextStatus });
    systemRows.value = systemRows.value.map((item) => (item.code === saved.code ? saved : item));
    syncCurrentSystemRelatedRows();
    if (selectedCode.value === saved.code) selectSystemRecord(saved);
    await refreshSystemAccessAfterSave();
    const toggleMessage =
      isAccountsPage.value && nextStatus === '停用'
        ? `${saved.name}已停用，旧会话已失效`
        : `${saved.name}已${saved.status}`;
    showSystemActionMessage(toggleMessage, saved.code);
  } catch (error) {
    saveMessage.value = error instanceof Error ? error.message : '状态更新失败';
  } finally {
    isSaving.value = false;
  }
}

async function checkSelectedAppHealth() {
  if (!isAppsPage.value || !systemDraft.code || isCreating.value) return;
  if (isSystemReadonly.value) {
    saveMessage.value = systemReadonlyMessage.value;
    return;
  }
  if (isCheckingAppHealth.value) return;
  if (appHealthCheckDisabledReason.value) {
    saveMessage.value = appHealthCheckDisabledReason.value;
    return;
  }

  try {
    isCheckingAppHealth.value = true;
    clearSystemActionLogLink();
    const { record, result } = await checkSystemAppHealth(systemDraft.code);
    systemRows.value = systemRows.value.map((item) => (item.code === record.code ? record : item));
    Object.assign(systemDraft, blankSystemRecord(), record);
    showSystemActionMessage(`健康检查${result.healthStatus}：${result.healthMessage}`, record.code);
  } catch (error) {
    saveMessage.value = error instanceof Error ? error.message : '应用健康检查失败';
  } finally {
    isCheckingAppHealth.value = false;
  }
}

async function checkAppHealthForRow(row: SystemRecord) {
  if (!isAppsPage.value || !row.code || isCreating.value) return;
  if (isSystemReadonly.value) {
    saveMessage.value = systemReadonlyMessage.value;
    return;
  }
  if (isCheckingAppHealth.value) return;
  const disabledReason = appHealthCheckDisabledReasonForRow(row);
  selectSystemRecord(row);
  if (disabledReason) {
    saveMessage.value = disabledReason;
    return;
  }

  try {
    isCheckingAppHealth.value = true;
    clearSystemActionLogLink();
    const { record, result } = await checkSystemAppHealth(row.code);
    systemRows.value = systemRows.value.map((item) => (item.code === record.code ? record : item));
    Object.assign(systemDraft, blankSystemRecord(), record);
    selectedCode.value = record.code;
    showSystemActionMessage(`健康检查${result.healthStatus}：${result.healthMessage}`, record.code);
  } catch (error) {
    saveMessage.value = error instanceof Error ? error.message : '应用健康检查失败';
  } finally {
    isCheckingAppHealth.value = false;
  }
}

async function recordSelectedMcpToolVerification() {
  if (!isMcpToolsPage.value || !systemDraft.code || isCreating.value) return;
  if (isSystemReadonly.value) {
    saveMessage.value = systemReadonlyMessage.value;
    return;
  }
  if (isRecordingMcpVerification.value) return;
  if (mcpVerificationDisabledReason.value) {
    saveMessage.value = mcpVerificationDisabledReason.value;
    return;
  }

  try {
    isRecordingMcpVerification.value = true;
    clearSystemActionLogLink();
    const { record } = await recordSystemMcpToolVerification(systemDraft.code, mcpVerificationRemark.value);
    systemRows.value = systemRows.value.map((item) => (item.code === record.code ? record : item));
    Object.assign(systemDraft, blankSystemRecord(), record);
    mcpVerificationRemark.value = '';
    showSystemActionMessage(`已记录验证：${record.lastVerifiedAt || '刚刚'}`, record.code);
  } catch (error) {
    saveMessage.value = error instanceof Error ? error.message : '工具验证记录失败';
  } finally {
    isRecordingMcpVerification.value = false;
  }
}

async function recordMcpToolVerificationForRow(row: SystemRecord) {
  if (!isMcpToolsPage.value || !row.code || isCreating.value) return;
  if (isSystemReadonly.value) {
    saveMessage.value = systemReadonlyMessage.value;
    return;
  }
  if (isRecordingMcpVerification.value) return;
  const disabledReason = mcpVerificationDisabledReasonForRow(row);
  selectSystemRecord(row);
  if (disabledReason) {
    saveMessage.value = disabledReason;
    return;
  }

  try {
    isRecordingMcpVerification.value = true;
    clearSystemActionLogLink();
    const { record } = await recordSystemMcpToolVerification(row.code);
    systemRows.value = systemRows.value.map((item) => (item.code === record.code ? record : item));
    Object.assign(systemDraft, blankSystemRecord(), record);
    selectedCode.value = record.code;
    mcpVerificationRemark.value = '';
    showSystemActionMessage(`已记录验证：${record.lastVerifiedAt || '刚刚'}`, record.code);
  } catch (error) {
    saveMessage.value = error instanceof Error ? error.message : '工具验证记录失败';
  } finally {
    isRecordingMcpVerification.value = false;
  }
}

watch(
  () => systemDraft.triggerModule,
  () => {
    if (!isNotificationsPage.value) return;
    if (notificationActionOptions.value.includes(String(systemDraft.triggerAction || ''))) return;
    systemDraft.triggerAction = notificationActionOptions.value[0] || '';
  },
);

watch(logActionFilterOptions, (options) => {
  if (!options.includes(logActionFilter.value)) {
    logActionFilter.value = '全部';
  }
});

watch(
  () => [isSystemPage.value, systemPageKey.value],
  () => {
    systemSearch.value = systemSearchQueryText();
    logStatusFilter.value = '全部';
    logActionFilter.value = '全部';
    logDateStartFilter.value = '';
    logDateEndFilter.value = '';
    void loadSystemPage();
  },
  { immediate: true },
);

watch(
  () => route.query.q,
  () => {
    if (!isSystemPage.value) return;
    systemSearch.value = systemSearchQueryText();
    selectFirstVisibleSystemRecord();
  },
);

watch(
  () => [systemSearch.value, logStatusFilter.value, logActionFilter.value, logDateStartFilter.value, logDateEndFilter.value],
  () => {
    syncVisibleSystemSelection();
  },
);
</script>

<template>
  <div v-if="isSystemPage" class="page-stack">
    <section class="quote-page reference-page system-config-page" :class="`system-config-page-${systemPageKey}`">
      <div class="table-title quote-title">
        <div>
          <h1>{{ systemConfig.title }}</h1>
          <p>{{ systemConfig.description }}</p>
        </div>
        <div v-if="canCreateSystemRecord" class="title-actions">
          <button class="primary-action" type="button" @click="beginCreateSystemRecord">
            <Plus :size="15" />
            新建
          </button>
        </div>
      </div>

      <div class="system-config-toolbar" :class="{ 'system-config-toolbar-logs': isLogsPage }">
        <label>
          <span>搜索</span>
          <input v-model="systemSearch" type="search" :placeholder="systemSearchPlaceholder" />
        </label>
        <div v-if="isLogsPage" class="system-log-filters">
          <label>
            <span>状态</span>
            <select v-model="logStatusFilter">
              <option>全部</option>
              <option>正常</option>
              <option>异常</option>
            </select>
          </label>
          <label>
            <span>操作</span>
            <select v-model="logActionFilter">
              <option v-for="action in logActionFilterOptions" :key="action">{{ action }}</option>
            </select>
          </label>
          <label>
            <span>开始日期</span>
            <input v-model="logDateStartFilter" type="date" />
          </label>
          <label>
            <span>结束日期</span>
            <input v-model="logDateEndFilter" type="date" />
          </label>
        </div>
        <strong>{{ visibleSystemRows.length }} / {{ systemRows.length }}</strong>
        <div v-if="isLogsPage" class="system-config-toolbar-actions">
          <button
            class="secondary-action"
            type="button"
            :disabled="!hasActiveLogFilters"
            :title="hasActiveLogFilters ? '清空当前日志筛选条件' : '当前没有启用筛选条件'"
            @click="clearLogFilters"
          >
            <RotateCcw :size="15" />
            清空筛选
          </button>
          <button
            class="secondary-action"
            type="button"
            :disabled="hasInvalidLogDateRange || !visibleSystemRows.length"
            :title="logDateRangeMessage || (visibleSystemRows.length ? '导出当前筛选结果' : '当前筛选没有可导出的日志')"
            @click="downloadVisibleLogsCsv"
          >
            <Download :size="15" />
            导出
          </button>
        </div>
      </div>

      <p v-if="isLogsPage && logDateRangeMessage" class="form-hint error">{{ logDateRangeMessage }}</p>
      <p v-if="loadMessage" class="form-hint error">{{ loadMessage }}</p>
      <p v-if="systemReadonlyMessage" class="form-hint">{{ systemReadonlyMessage }}</p>
      <p v-if="systemScopeNote" class="system-config-scope-note">{{ systemScopeNote }}</p>

      <div class="system-config-grid">
        <div class="table-scroll reference-table-scroll">
          <div
            class="data-table reference-table system-config-table"
            :style="{ '--system-config-columns': systemTableGridTemplate, '--system-config-min-width': systemTableMinWidth }"
          >
            <div class="table-row table-head">
              <span v-for="column in systemTableColumns" :key="column.key" :class="systemTableCellClass(column)">
                {{ column.label }}
              </span>
            </div>
            <div
              v-for="row in visibleSystemRows"
              :key="row.code"
              class="table-row"
              :class="{ active: selectedCode === row.code }"
              tabindex="0"
              @click="selectSystemRecord(row)"
              @keydown.enter.prevent="selectSystemRecord(row)"
            >
              <span
                v-for="column in systemTableColumns"
                :key="`${row.code}-${column.key}`"
                :class="systemTableCellClass(column)"
                :title="systemTableCellTitle(row, column.key)"
              >
                <template v-if="column.key === 'primary'">
                  <strong>{{ row.name }}</strong>
                  <small>{{ systemRowDescription(row) }}</small>
                </template>
                <template v-else-if="column.key === 'status'">
                  <i class="mini-status" :class="systemStatusClass(row.status)">{{ row.status || '-' }}</i>
                </template>
                <template v-else-if="column.key === 'password'">
                  <i class="mini-status" :class="accountPasswordStatusClass(row)">{{ accountPasswordStatusText(row) }}</i>
                </template>
                <template v-else-if="column.key === 'actions'">
                  <button type="button" title="查看" @click.stop="selectSystemRecord(row)">查看</button>
                  <button
                    v-if="isAppsPage"
                    type="button"
                    :disabled="isSystemReadonly || isCheckingAppHealth || Boolean(appHealthCheckDisabledReasonForRow(row))"
                    :title="isSystemReadonly ? systemReadonlyMessage : (appHealthCheckDisabledReasonForRow(row) || '执行健康检查')"
                    @click.stop="checkAppHealthForRow(row)"
                  >
                    检查
                  </button>
                  <button
                    v-if="isMcpToolsPage"
                    type="button"
                    :disabled="isSystemReadonly || isRecordingMcpVerification || Boolean(mcpVerificationDisabledReasonForRow(row))"
                    :title="mcpVerificationActionTitleForRow(row)"
                    @click.stop="recordMcpToolVerificationForRow(row)"
                  >
                    记录
                  </button>
                  <button
                    v-if="!isSystemReadonly"
                    type="button"
                    :disabled="isSaving || Boolean(systemStatusToggleBlockReason(row))"
                    :title="systemStatusActionTitle(row)"
                    @click.stop="toggleSystemStatus(row)"
                  >
                    {{ systemStatusActionLabel(row) }}
                  </button>
                </template>
                <template v-else>{{ systemTableCellValue(row, column.key) }}</template>
              </span>
            </div>
          </div>
        </div>

        <aside v-if="showSystemEditor" class="form-section system-config-editor" :class="{ 'system-log-detail-panel': isLogsPage }">
          <div class="section-heading">
            <h2>{{ systemEditorTitle }}</h2>
          </div>

          <div v-if="showSystemEditorActions" class="system-config-editor-actions">
            <button
              v-if="isAppsPage && !isCreating && !isSystemReadonly"
              class="secondary-action"
              type="button"
              :disabled="isCheckingAppHealth || !canCheckSelectedAppHealth"
              :title="appHealthCheckDisabledReason || '执行健康检查'"
              @click="checkSelectedAppHealth"
            >
              <Activity :size="15" />
              {{ isCheckingAppHealth ? '检查中' : '健康检查' }}
            </button>
            <button
              v-if="isMcpToolsPage && !isCreating && !isSystemReadonly"
              class="secondary-action"
              type="button"
              :disabled="isRecordingMcpVerification || !canRecordSelectedMcpVerification"
              :title="mcpVerificationDisabledReason || '记录本工具已按验证方式完成检查'"
              @click="recordSelectedMcpToolVerification"
            >
              <CheckCircle2 :size="15" />
              {{ isRecordingMcpVerification ? '记录中' : '记录验证' }}
            </button>
            <button
              v-if="!isSystemReadonly"
              class="primary-action"
              type="button"
              :disabled="Boolean(systemSaveDisabledReason)"
              :title="systemSaveDisabledReason || '保存当前配置'"
              @click="saveSystemDraft"
            >
              <Save :size="15" />
              {{ isSaving ? '保存中' : '保存' }}
            </button>
            <span v-if="visibleSystemSaveDisabledReason" class="system-save-block-reason">
              保存前需处理：{{ visibleSystemSaveDisabledReason }}
            </span>
            <span v-if="saveMessage">{{ saveMessage }}</span>
            <RouterLink
              v-if="saveMessageLogLocation"
              class="system-config-log-link"
              :to="saveMessageLogLocation"
            >
              查看日志
            </RouterLink>
          </div>

          <div v-if="isLogsPage" class="system-log-detail">
            <template v-if="selectedSystemRecordVisible">
              <div class="system-log-hero">
                <span>操作</span>
                <strong>{{ systemDraft.name || '-' }}</strong>
                <small>{{ systemDraft.code }}</small>
                <RouterLink
                  v-if="selectedSystemLogTargetLocation"
                  class="system-log-target-link"
                  :to="selectedSystemLogTargetLocation"
                >
                  查看对象
                </RouterLink>
              </div>
              <div class="system-log-grid">
                <article>
                  <span>对象</span>
                  <strong>{{ logTarget(systemDraft) }}</strong>
                </article>
                <article>
                  <span>记录人</span>
                  <strong>{{ systemDraft.owner || '-' }}</strong>
                </article>
                <article>
                  <span>来源账号</span>
                  <strong>{{ systemDraft.sourceAccount || systemDraft.owner || '-' }}</strong>
                  <RouterLink
                    v-if="selectedSystemLogSourceAccountLocation"
                    class="system-log-inline-link"
                    :to="selectedSystemLogSourceAccountLocation"
                  >
                    查看账号
                  </RouterLink>
                </article>
                <article>
                  <span>来源地址</span>
                  <strong>{{ systemDraft.sourceIp || '-' }}</strong>
                </article>
                <article>
                  <span>时间</span>
                  <strong>{{ systemDraft.updatedAt || '-' }}</strong>
                </article>
                <article>
                  <span>状态</span>
                  <strong>{{ systemDraft.status || '-' }}</strong>
                </article>
              </div>
              <div class="system-log-remark">
                <span>内容</span>
                <p>{{ logRemark(systemDraft) }}</p>
              </div>
            </template>
            <div v-else class="list-empty-state system-log-empty-detail">
              <strong>{{ systemEmptyEditorTitle }}</strong>
              <span>{{ systemEmptyEditorDescription }}</span>
            </div>
            <div class="system-log-summary">
              <span>当前筛选</span>
              <div>
                <button
                  class="system-log-chip"
                  :class="{ active: logStatusFilter === '全部' }"
                  type="button"
                  @click="applyLogStatusFilter('全部')"
                >
                  日志 {{ logStatusSummary.total }}
                </button>
                <button
                  class="system-log-chip"
                  :class="{ active: logStatusFilter === '正常' }"
                  type="button"
                  @click="applyLogStatusFilter('正常')"
                >
                  正常 {{ logStatusSummary.normal }}
                </button>
                <button
                  class="system-log-chip"
                  :class="{ active: logStatusFilter === '异常' }"
                  type="button"
                  @click="applyLogStatusFilter('异常')"
                >
                  异常 {{ logStatusSummary.abnormal }}
                </button>
              </div>
              <small>最近时间 {{ logStatusSummary.latest }}</small>
            </div>
            <div v-if="logActionSummary.length" class="system-log-summary">
              <span>操作类型</span>
              <div>
                <button
                  v-for="item in logActionSummary"
                  :key="item.name"
                  class="system-log-chip"
                  :class="{ active: logActionFilter === item.name }"
                  type="button"
                  @click="applyLogActionFilter(item.name)"
                >
                  {{ item.name }} {{ item.count }}
                </button>
              </div>
            </div>
          </div>

          <div v-else class="system-editor-fields">
            <label class="form-field">
              <span>编码</span>
              <input v-model="systemDraft.code" type="text" :disabled="!isCreating || isSystemReadonly" placeholder="保存时自动生成" />
            </label>
            <p v-if="systemCodeFormatMessage" class="form-hint error full-field">
              {{ systemCodeFormatMessage }}
            </p>
            <p v-if="systemCodeConflictMessage" class="form-hint error full-field">
              {{ systemCodeConflictMessage }}
            </p>
            <label class="form-field">
              <span>名称</span>
              <input
                v-model="systemDraft.name"
                type="text"
                :readonly="isAccountsPage && Boolean(systemDraft.employeeCode)"
                :disabled="isSystemReadonly"
              />
            </label>
            <label class="form-field">
              <span>负责人</span>
              <input v-model="systemDraft.owner" type="text" :disabled="isSystemReadonly" />
            </label>
            <label class="form-field">
              <span>状态</span>
              <select
                v-model="systemDraft.status"
                :disabled="Boolean(systemDraftStatusDisabledReason)"
                :title="systemDraftStatusDisabledReason"
              >
                <option v-for="status in systemStatusOptions" :key="status">{{ status }}</option>
              </select>
            </label>
            <p v-if="systemDraftStatusDisabledReason" class="form-hint error full-field">
              {{ systemDraftStatusDisabledReason }}
            </p>
            <div v-if="isAccountsPage" class="form-field account-employee-field">
              <span>关联员工</span>
              <div class="account-employee-control">
                <ReferencePicker
                  v-model="systemDraft.employeeCode"
                  :display-value="accountEmployeeDisplay"
                  type="employees"
                  title="选择关联员工"
                  placeholder="选择员工"
                  search-placeholder="搜索员工编码、姓名、部门、手机号或邮箱"
                  :exclude-codes="accountEmployeeExcludedCodes"
                  empty-text="没有可关联员工；可先在基础资料新增员工，或直接填写姓名创建独立账号。"
                  :disabled="isSystemReadonly"
                  @select="handleAccountEmployeeSelect"
                />
                <button
                  v-if="systemDraft.employeeCode"
                  class="secondary-action account-employee-clear"
                  type="button"
                  :disabled="isSystemReadonly"
                  title="取消员工关联，保留当前账号姓名和联系方式"
                  @click="clearAccountEmployeeLink"
                >
                  <Unlink :size="14" />
                  取消关联
                </button>
              </div>
            </div>
            <label v-if="isAccountsPage" class="form-field">
              <span>登录账号</span>
              <input v-model="systemDraft.username" type="text" :disabled="isSystemReadonly" placeholder="如 zhangsan" />
            </label>
            <p v-if="isAccountsPage && selectedAccountEmployeeBlockMessage" class="form-hint error full-field">
              {{ selectedAccountEmployeeBlockMessage }}
            </p>
            <p v-if="isAccountsPage && accountIdentityConflictMessage" class="form-hint error full-field">
              {{ accountIdentityConflictMessage }}
            </p>
            <p v-if="isAccountsPage && accountUsernameFormatMessage" class="form-hint error full-field">
              {{ accountUsernameFormatMessage }}
            </p>
            <p v-if="invalidAccountRoleMessage" class="form-hint error full-field">
              {{ invalidAccountRoleMessage }}
            </p>
            <p v-if="permissionIdentityConflictMessage" class="form-hint error full-field">
              {{ permissionIdentityConflictMessage }}
            </p>
            <p v-if="roleIdentityConflictMessage" class="form-hint error full-field">
              {{ roleIdentityConflictMessage }}
            </p>
            <p v-if="invalidRolePermissionMessage" class="form-hint error full-field">
              {{ invalidRolePermissionMessage }}
            </p>
            <p v-if="rolePasswordSystemManagerBlockReason" class="form-hint error full-field">
              {{ rolePasswordSystemManagerBlockReason }}
            </p>
            <p v-if="invalidNotificationReceiverRoleMessage" class="form-hint error full-field">
              {{ invalidNotificationReceiverRoleMessage }}
            </p>
            <p v-if="selectedRoleOperationDependencyMessage" class="form-hint error full-field">
              {{ selectedRoleOperationDependencyMessage }}
            </p>
            <p v-if="menuSortOrderMessage" class="form-hint error full-field">
              {{ menuSortOrderMessage }}
            </p>
            <p v-if="menuPermissionMismatchMessage" class="form-hint error full-field">
              {{ menuPermissionMismatchMessage }}
            </p>
            <p v-if="menuPermissionInvalidMessage" class="form-hint error full-field">
              {{ menuPermissionInvalidMessage }}
            </p>
            <p v-if="accountLoginRiskMessage" class="form-hint error full-field">
              {{ accountLoginRiskMessage }}
            </p>
            <p v-if="selfSystemConfigLockMessage" class="form-hint error full-field">
              {{ selfSystemConfigLockMessage }}
            </p>
            <p v-if="isNamingRulesPage && namingRuleConflictMessage" class="form-hint error full-field">
              {{ namingRuleConflictMessage }}
            </p>
            <label v-if="isAccountsPage" class="form-field">
              <span>部门</span>
              <input v-model="systemDraft.department" type="text" :readonly="Boolean(systemDraft.employeeCode)" :disabled="isSystemReadonly" />
            </label>
            <div v-if="isAccountsPage" class="form-field full-field">
              <span>角色</span>
              <div class="role-permission-picker">
                <div class="role-permission-toolbar">
                  <input
                    v-model="accountRoleSearch"
                    type="search"
                    placeholder="搜索角色编码、名称、权限、菜单或操作"
                    :disabled="isSystemReadonly"
                  />
                  <span>已选 {{ selectedAccountRoleCount }} 个</span>
                  <button
                    v-if="invalidAccountRoleCodes.length"
                    type="button"
                    :disabled="isSystemReadonly"
                    :title="invalidAccountRoleMessage"
                    @click="clearInvalidAccountRoles"
                  >
                    清理无效角色
                  </button>
                </div>
                <div class="role-permission-guide">
                  <span>账号预览</span>
                  <strong>{{ selectedAccountRoleGuideTitle }}</strong>
                  <p>{{ selectedAccountRoleGuideText }}</p>
                </div>
                <div class="role-permission-list">
                  <button
                    v-for="role in visibleAccountRoleRows"
                    :key="role.code"
                    type="button"
                    :class="{ active: roleSelected(role) }"
                    :disabled="isSystemReadonly || (isProtectedDefaultAdminRole(role) && roleSelected(role))"
                    :title="accountRoleOptionTitle(role)"
                    @click="toggleAccountRole(role)"
                  >
                    <span>
                      <strong>{{ role.name }}</strong>
                      <small>{{ role.code }} · {{ role.description }}</small>
                      <small class="role-permission-meta">{{ rolePermissionPreview(role) }}</small>
                    </span>
                    <i class="mini-status" :class="roleSelected(role) ? 'status-done' : 'status-draft'">
                      {{ roleSelected(role) ? '已选' : '未选' }}
                    </i>
                  </button>
                  <div v-if="visibleAccountRoleRows.length === 0" class="role-permission-empty">暂无匹配角色</div>
                </div>
              </div>
            </div>
            <label v-if="isAccountsPage" class="form-field">
              <span>手机</span>
              <input v-model="systemDraft.phone" type="text" :readonly="Boolean(systemDraft.employeeCode)" :disabled="isSystemReadonly" />
            </label>
            <label v-if="isAccountsPage" class="form-field">
              <span>邮箱</span>
              <input v-model="systemDraft.email" type="email" :readonly="Boolean(systemDraft.employeeCode)" :disabled="isSystemReadonly" />
            </label>
            <label v-if="isAccountsPage" class="form-field full-field">
              <span>最近登录</span>
              <output class="readonly-field-value" :title="systemDraft.lastLogin || '尚未登录'">
                {{ systemDraft.lastLogin || '尚未登录' }}
              </output>
            </label>
            <label v-if="isAccountsPage" class="form-field">
              <span>密码状态</span>
              <output class="readonly-field-value" :title="accountPasswordStatus">
                {{ accountPasswordStatus }}
              </output>
            </label>
            <label v-if="isAccountsPage" class="form-field">
              <span>新密码</span>
              <input
                v-model="systemDraft.passwordInput"
                type="password"
                :disabled="isSystemReadonly"
                autocomplete="new-password"
                placeholder="留空则不修改"
              />
            </label>
            <label v-if="isAccountsPage" class="form-field">
              <span>确认密码</span>
              <input
                v-model="systemDraft.passwordConfirm"
                type="password"
                :disabled="isSystemReadonly"
                autocomplete="new-password"
                placeholder="再次输入新密码"
              />
            </label>
            <div v-if="isRolesPage" class="form-field full-field">
              <span>权限点</span>
              <div class="role-permission-picker">
                <div class="role-permission-toolbar">
                  <input
                    v-model="rolePermissionSearch"
                    type="search"
                    placeholder="搜索权限编码、名称、模块、菜单或操作"
                    :disabled="isSystemReadonly"
                  />
                  <span>已选 {{ selectedRolePermissionCount }} 个</span>
                  <button
                    v-if="invalidRolePermissionCodes.length"
                    type="button"
                    :disabled="isSystemReadonly || isAdminRoleDraft"
                    :title="invalidRolePermissionMessage"
                    @click="clearInvalidRolePermissions"
                  >
                    清理无效权限
                  </button>
                  <button
                    type="button"
                    :disabled="Boolean(rolePermissionBulkDisabledReason(visibleRolePermissionRows))"
                    :title="rolePermissionBulkDisabledReason(visibleRolePermissionRows)"
                    @click="selectPermissionRows(visibleRolePermissionRows)"
                  >
                    全选当前
                  </button>
                  <button
                    type="button"
                    :disabled="Boolean(rolePermissionBulkDisabledReason(visibleRolePermissionRows))"
                    :title="rolePermissionBulkDisabledReason(visibleRolePermissionRows)"
                    @click="clearPermissionRows(visibleRolePermissionRows)"
                  >
                    清空当前
                  </button>
                </div>
                <p v-if="isAdminRoleDraft" class="form-hint">管理员角色默认拥有全部启用权限，权限点由系统自动维护。</p>
                <div class="role-permission-guide">
                  <span>授权联动</span>
                  <strong>{{ rolePermissionDependencyGuideTitle }}</strong>
                  <p>{{ rolePermissionDependencyGuideText }}</p>
                </div>
                <div class="role-permission-list grouped">
                  <section v-for="group in groupedRolePermissionRows" :key="group.label" class="role-permission-group">
                    <div class="role-permission-group-head">
                      <strong>{{ group.label }}</strong>
                      <span>{{ group.selectedCount }} / {{ group.rows.length }}</span>
                      <button
                        type="button"
                        :disabled="Boolean(rolePermissionBulkDisabledReason(group.rows))"
                        :title="rolePermissionBulkDisabledReason(group.rows)"
                        @click="selectPermissionRows(group.rows)"
                      >
                        全选
                      </button>
                      <button
                        type="button"
                        :disabled="Boolean(rolePermissionBulkDisabledReason(group.rows))"
                        :title="rolePermissionBulkDisabledReason(group.rows)"
                        @click="clearPermissionRows(group.rows)"
                      >
                        清空
                      </button>
                    </div>
                    <div class="role-permission-group-items">
                      <button
                        v-for="permission in group.rows"
                        :key="permission.code"
                        type="button"
                        :class="{ active: rolePermissionVisibleSelected(permission.code) }"
                        :disabled="isSystemReadonly || isAdminRoleDraft"
                        :title="rolePermissionOptionTitle(permission)"
                        @click="toggleRolePermission(permission.code)"
                      >
                        <span>
                          <strong>{{ permission.name }}</strong>
                          <small>{{ permission.code }} · {{ permission.description }}</small>
                          <small v-if="rolePermissionDependencyHint(permission)" class="role-permission-meta dependency">
                            {{ rolePermissionDependencyHint(permission) }}
                          </small>
                        </span>
                        <i class="mini-status" :class="rolePermissionVisibleSelected(permission.code) ? 'status-done' : 'status-draft'">
                          {{ rolePermissionVisibleSelected(permission.code) ? '已选' : '未选' }}
                        </i>
                      </button>
                    </div>
                  </section>
                  <div v-if="visibleRolePermissionRows.length === 0" class="role-permission-empty">暂无匹配权限点</div>
                </div>
              </div>
            </div>
            <label v-if="isNotificationsPage" class="form-field">
              <span>触发模块</span>
              <select v-model="systemDraft.triggerModule" :disabled="isSystemReadonly">
                <option v-for="option in notificationModuleOptions" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
            <label v-if="isNotificationsPage" class="form-field">
              <span>通知渠道</span>
              <select v-model="systemDraft.channel" :disabled="isSystemReadonly">
                <option v-for="option in notificationChannelOptions" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
            <label v-if="isNotificationsPage" class="form-field full-field">
              <span>触发动作</span>
              <select v-model="systemDraft.triggerAction" :disabled="isSystemReadonly">
                <option v-for="option in notificationActionOptions" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
            <div v-if="isNotificationsPage" class="form-field full-field">
              <span>接收角色</span>
              <div class="role-permission-picker">
                <div class="role-permission-toolbar">
                  <input
                    v-model="notificationRoleSearch"
                    type="search"
                    placeholder="搜索角色编码、名称、权限或操作"
                    :disabled="isSystemReadonly"
                  />
                  <span>已选 {{ selectedNotificationRoleCount }} 个</span>
                  <button
                    v-if="invalidNotificationReceiverRoleCodes.length"
                    type="button"
                    :disabled="isSystemReadonly"
                    :title="invalidNotificationReceiverRoleMessage"
                    @click="clearInvalidNotificationReceiverRoles"
                  >
                    清理无效接收角色
                  </button>
                </div>
                <div class="role-permission-list">
                  <button
                    v-for="role in visibleNotificationRoleRows"
                    :key="role.code"
                    type="button"
                    :class="{ active: notificationRoleSelected(role) }"
                    :disabled="isSystemReadonly"
                    @click="toggleNotificationRole(role)"
                  >
                    <span>
                      <strong>{{ role.name }}</strong>
                      <small>{{ role.code }} · {{ role.description }}</small>
                      <small class="role-permission-meta">{{ rolePermissionPreview(role) }}</small>
                    </span>
                    <i class="mini-status" :class="notificationRoleSelected(role) ? 'status-done' : 'status-draft'">
                      {{ notificationRoleSelected(role) ? '已选' : '未选' }}
                    </i>
                  </button>
                  <div v-if="visibleNotificationRoleRows.length === 0" class="role-permission-empty">暂无匹配角色</div>
                </div>
              </div>
            </div>
            <label v-if="isOptionDictionariesPage" class="form-field">
              <span>所属模块</span>
              <select v-model="systemDraft.optionModule" :disabled="isSystemReadonly">
                <option v-for="option in optionModuleOptions" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
            <label v-if="isOptionDictionariesPage" class="form-field">
              <span>字段/用途</span>
              <input v-model="systemDraft.optionField" type="text" :disabled="isSystemReadonly" placeholder="如 物流方式、付款方式、税率" />
            </label>
            <label v-if="isOptionDictionariesPage" class="form-field full-field">
              <span>选项值</span>
              <textarea
                v-model="systemDraft.optionValues"
                rows="4"
                :disabled="isSystemReadonly"
                placeholder="每行一个，或用逗号/顿号分隔"
              />
            </label>
            <label v-if="isOptionDictionariesPage" class="form-field full-field">
              <span>使用范围</span>
              <input
                v-model="systemDraft.useScope"
                type="text"
                :disabled="isSystemReadonly"
                placeholder="说明哪些页面、字段会使用这一组选项"
              />
            </label>
            <p v-if="isOptionDictionariesPage && optionDictionarySaveDisabledReason" class="form-hint full-field">
              {{ optionDictionarySaveDisabledReason }}
            </p>
            <label v-if="isAppsPage" class="form-field">
              <span>应用类型</span>
              <select v-model="systemDraft.appType" :disabled="isSystemReadonly">
                <option v-for="option in appTypeOptions" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
            <label v-if="isAppsPage" class="form-field">
              <span>部署目标</span>
              <select v-model="systemDraft.deployTarget" :disabled="isSystemReadonly">
                <option v-for="option in deployTargetOptions" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
            <label v-if="isAppsPage" class="form-field">
              <span>版本</span>
              <input v-model="systemDraft.versionTag" type="text" :disabled="isSystemReadonly" placeholder="如 0.1.0" />
            </label>
            <label v-if="isAppsPage" class="form-field">
              <span>运行方式</span>
              <input v-model="systemDraft.runtimeMode" type="text" :disabled="isSystemReadonly" placeholder="如 Docker Compose + Nginx" />
            </label>
            <label v-if="isAppsPage" class="form-field full-field">
              <span>访问入口</span>
              <input v-model="systemDraft.publicUrl" type="text" :disabled="isSystemReadonly" placeholder="如 http://127.0.0.1:5174 或 https://erp.example.com" />
            </label>
            <label v-if="isAppsPage" class="form-field full-field">
              <span>API 地址</span>
              <input v-model="systemDraft.apiBase" type="text" :disabled="isSystemReadonly" placeholder="如 /api 或 http://127.0.0.1:5175/api" />
            </label>
            <label v-if="isAppsPage" class="form-field">
              <span>健康检查</span>
              <input v-model="systemDraft.healthPath" type="text" :disabled="isSystemReadonly" placeholder="/api/health" />
            </label>
            <label v-if="isAppsPage" class="form-field">
              <span>数据位置</span>
              <input v-model="systemDraft.dataStore" type="text" :disabled="isSystemReadonly" placeholder="如 /data/erp-data.json" />
            </label>
            <p v-if="isAppsPage && appHealthCheckDisabledReason" class="form-hint full-field">
              {{ appHealthCheckDisabledReason }}
            </p>
            <label v-if="isMcpToolsPage" class="form-field">
              <span>工具类型</span>
              <select v-model="systemDraft.toolType" :disabled="isSystemReadonly">
                <option v-for="option in mcpToolTypeOptions" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
            <label v-if="isMcpToolsPage" class="form-field">
              <span>风险级别</span>
              <select v-model="systemDraft.riskLevel" :disabled="isSystemReadonly">
                <option v-for="option in riskLevelOptions" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
            <label v-if="isMcpToolsPage" class="form-field full-field">
              <span>适用范围</span>
              <input v-model="systemDraft.useScope" type="text" :disabled="isSystemReadonly" placeholder="如 本地页面验证、代码读取、配置维护" />
            </label>
            <label v-if="isMcpToolsPage" class="form-field full-field">
              <span>调用入口</span>
              <input v-model="systemDraft.entryPoint" type="text" :disabled="isSystemReadonly" placeholder="如 in-app browser / apply_patch / shell" />
            </label>
            <label v-if="isMcpToolsPage" class="form-field full-field">
              <span>验证方式</span>
              <textarea v-model="systemDraft.verifyMethod" rows="3" :disabled="isSystemReadonly" placeholder="写清使用后如何确认结果有效" />
            </label>
            <label v-if="isMcpToolsPage" class="form-field">
              <span>最后验证</span>
              <output class="readonly-field-value" :title="systemDraft.lastVerifiedAt || '尚未验证'">
                {{ systemDraft.lastVerifiedAt || '尚未验证' }}
              </output>
            </label>
            <label v-if="isMcpToolsPage" class="form-field full-field">
              <span>本次验证备注</span>
              <textarea
                v-model="mcpVerificationRemark"
                rows="2"
                :disabled="isSystemReadonly || isRecordingMcpVerification"
                :placeholder="mcpVerificationRemarkRequiredForRow(systemDraft) ? '高风险工具必须填写本次验证结果' : '可选，记录本次验证结果或证据'"
              />
            </label>
            <p v-if="isMcpToolsPage && mcpVerificationDisabledReason" class="form-hint full-field">
              {{ mcpVerificationDisabledReason }}
            </p>
            <label v-if="isMenusPage" class="form-field">
              <span>菜单标识</span>
              <input v-model="systemDraft.menuKey" type="text" readonly />
            </label>
            <label v-if="isMenusPage" class="form-field">
              <span>上级菜单</span>
              <input :value="menuParentDisplay(systemDraft)" type="text" readonly />
            </label>
            <label v-if="isMenusPage" class="form-field full-field">
              <span>路径</span>
              <input v-model="systemDraft.path" type="text" readonly />
            </label>
            <div v-if="isMenusPage" class="form-field full-field">
              <span>权限点</span>
              <div class="role-permission-picker">
                <div class="role-permission-toolbar">
                  <input
                    v-model="menuPermissionSearch"
                    type="search"
                    placeholder="搜索权限编码、名称、模块或说明"
                    :disabled="isSystemReadonly || isProtectedSystemMenuDraft"
                  />
                  <span>{{ systemDraft.permissionCode ? menuPermissionDisplay(systemDraft.permissionCode) : (menuRequiredPermissionMessage || '无限制') }}</span>
                </div>
                <div class="role-permission-list">
                  <button
                    type="button"
                    :class="{ active: !systemDraft.permissionCode }"
                    :disabled="isSystemReadonly || isProtectedSystemMenuDraft || Boolean(menuNoPermissionDisabledReason)"
                    :title="menuPermissionOptionTitle()"
                    @click="selectMenuPermission('')"
                  >
                    <span>
                      <strong>无限制</strong>
                      <small>{{ menuNoPermissionDisabledReason || '不绑定权限，启用账号均可看到该菜单。' }}</small>
                    </span>
                    <i class="mini-status" :class="!systemDraft.permissionCode ? 'status-done' : 'status-draft'">
                      {{ !systemDraft.permissionCode ? '已选' : '未选' }}
                    </i>
                  </button>
                  <button
                    v-for="permission in visibleMenuPermissionOptions"
                    :key="permission.code"
                    type="button"
                    :class="{ active: systemDraft.permissionCode === permission.code }"
                    :disabled="isSystemReadonly || isProtectedSystemMenuDraft"
                    :title="menuPermissionOptionTitle(permission.code)"
                    @click="selectMenuPermission(permission.code)"
                  >
                    <span>
                      <strong>{{ permissionModuleLabel(permission) }} / {{ permission.name }}</strong>
                      <small>{{ permission.code }} · {{ permission.description || permission.owner || '-' }}</small>
                    </span>
                    <i class="mini-status" :class="systemDraft.permissionCode === permission.code ? 'status-done' : 'status-draft'">
                      {{ systemDraft.permissionCode === permission.code ? '已选' : '未选' }}
                    </i>
                  </button>
                  <div v-if="visibleMenuPermissionOptions.length === 0" class="role-permission-empty">暂无匹配权限点</div>
                </div>
                <p v-if="menuRequiredPermissionNotice" class="form-hint">{{ menuRequiredPermissionNotice }}</p>
                <p v-if="isProtectedSystemMenuDraft" class="form-hint">系统核心菜单固定绑定系统配置维护权限。</p>
              </div>
            </div>
            <label v-if="isMenusPage" class="form-field">
              <span>排序</span>
              <input v-model.number="systemDraft.sortOrder" type="number" min="1" :disabled="isSystemReadonly" />
            </label>
            <label v-if="isNamingRulesPage" class="form-field">
              <span>前缀</span>
              <input v-model="systemDraft.prefix" type="text" :disabled="isSystemReadonly" placeholder="如 SO、PO、WR" />
            </label>
            <label v-if="isNamingRulesPage" class="form-field">
              <span>日期格式</span>
              <select v-model="systemDraft.dateFormat" :disabled="isSystemReadonly">
                <option v-for="option in namingDateFormatOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label v-if="isNamingRulesPage" class="form-field">
              <span>流水位数</span>
              <input v-model.number="systemDraft.sequenceLength" type="number" min="2" max="6" :disabled="isSystemReadonly" />
            </label>
            <label v-if="isNamingRulesPage" class="form-field">
              <span>编码示例</span>
              <input :value="namingRuleSample" type="text" readonly />
            </label>
            <label class="form-field full-field">
              <span>说明</span>
              <textarea v-model="systemDraft.description" rows="4" :disabled="isSystemReadonly" />
            </label>
          </div>

          <div v-if="showImpactPanel" class="system-impact-panel">
            <div class="system-impact-title">
              <strong>{{ systemImpactPanelTitle }}</strong>
              <span>{{ systemImpactPanelDescription }}</span>
            </div>

            <div v-if="isPermissionsPage" class="system-impact-grid">
              <article class="system-impact-card">
                <span>业务角色引用</span>
                <strong>{{ selectedLinkedRoles.length }}</strong>
                <p>{{ selectedLinkedRoles.length ? selectedLinkedRoles.map((role) => role.name).join('、') : '暂无业务角色直接引用该权限' }}</p>
                <div v-if="selectedLinkedRoles.length" class="system-impact-actions">
                  <RouterLink :to="systemQueryLocation('/system/roles', systemDraft.code)">定位角色</RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>启用菜单引用</span>
                <strong>{{ selectedLinkedMenus.length }}</strong>
                <p>{{ selectedLinkedMenus.length ? selectedLinkedMenus.map((menu) => menu.name).join('、') : '暂无启用菜单绑定该权限' }}</p>
                <div v-if="selectedLinkedMenus.length" class="system-impact-actions">
                  <RouterLink :to="systemQueryLocation('/system/menus', systemDraft.code)">定位菜单</RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>关联操作</span>
                <strong>{{ selectedPermissionOperationImpacts.length }}</strong>
                <p>{{ selectedPermissionOperationSummary }}</p>
                <div v-if="selectedPermissionOperationMenuTargets.length" class="system-impact-actions">
                  <RouterLink
                    v-for="target in selectedPermissionOperationMenuTargets"
                    :key="target.path"
                    :to="systemQueryLocation('/system/menus', target.path)"
                  >
                    {{ target.label }}
                  </RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>接口动作</span>
                <strong>{{ selectedPermissionOperationRouteActionCount }}</strong>
                <p>{{ selectedPermissionOperationRouteSummary }}</p>
              </article>
              <article class="system-impact-card">
                <span>被依赖操作</span>
                <strong>{{ selectedPermissionDependentOperationRows.length }}</strong>
                <p>{{ selectedPermissionDependencySummary }}</p>
                <div v-if="selectedPermissionDependentOperationTargets.length" class="system-impact-actions">
                  <RouterLink
                    v-for="target in selectedPermissionDependentOperationTargets"
                    :key="target.code"
                    :to="systemQueryLocation('/system/permissions', target.code)"
                  >
                    {{ target.label }}
                  </RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>生效账号</span>
                <strong>{{ selectedLinkedAccounts.length }}</strong>
                <p>{{ selectedPermissionEffectiveAccountMessage }}</p>
                <div v-if="selectedLinkedAccounts.length" class="system-impact-actions">
                  <RouterLink :to="systemQueryLocation('/system/accounts', systemDraft.code)">定位账号</RouterLink>
                </div>
              </article>
            </div>

            <div v-else-if="isRolesPage" class="system-impact-grid">
              <article class="system-impact-card">
                <span>已选权限</span>
                <strong>{{ selectedRoleEffectivePermissions.length }}</strong>
                <p>{{ selectedRoleEffectivePermissions.length ? selectedRoleEffectivePermissions.map((permission) => permission.name).join('、') : '尚未选择权限点' }}</p>
                <div v-if="selectedRolePermissionTargets.length" class="system-impact-actions">
                  <RouterLink
                    v-for="target in selectedRolePermissionTargets"
                    :key="target.code"
                    :to="systemQueryLocation('/system/permissions', target.code)"
                  >
                    {{ target.label }}
                  </RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>可执行操作</span>
                <strong>{{ selectedRoleOperationImpacts.length }}</strong>
                <p>{{ selectedRoleOperationImpactMessage }}</p>
                <div v-if="selectedRoleOperationPermissionTargets.length" class="system-impact-actions">
                  <RouterLink
                    v-for="target in selectedRoleOperationPermissionTargets"
                    :key="target.code"
                    :to="systemQueryLocation('/system/permissions', target.code)"
                  >
                    {{ target.label }}
                  </RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>接口动作</span>
                <strong>{{ selectedRoleOperationRouteActionCount }}</strong>
                <p>{{ selectedRoleOperationRouteMessage }}</p>
              </article>
              <article v-if="selectedRoleOperationDependencyMessage" class="system-impact-card wide">
                <span>待补基础权限</span>
                <strong>{{ selectedRoleMissingOperationDependencyCodes.length }}</strong>
                <p>{{ selectedRoleOperationDependencyMessage }}</p>
                <div class="system-impact-actions">
                  <button
                    type="button"
                    :disabled="isSystemReadonly || isAdminRoleDraft"
                    :title="isSystemReadonly ? systemReadonlyMessage : '补齐操作权限依赖的基础权限'"
                    @click="addMissingRoleOperationDependencies"
                  >
                    补齐基础权限
                  </button>
                </div>
              </article>
              <article class="system-impact-card">
                <span>使用账号</span>
                <strong>{{ selectedLinkedAccounts.length }}</strong>
                <p>{{ selectedLinkedAccounts.length ? selectedLinkedAccounts.map((account) => account.name).join('、') : '暂无启用账号使用该角色' }}</p>
                <div v-if="selectedLinkedAccounts.length" class="system-impact-actions">
                  <RouterLink :to="systemQueryLocation('/system/accounts', systemDraft.code)">定位账号</RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>接收通知</span>
                <strong>{{ selectedRoleNotificationRows.length }}</strong>
                <p>{{ selectedRoleNotificationRows.length ? selectedRoleNotificationRows.map((notification) => notification.name).join('、') : '暂无启用通知规则使用该角色' }}</p>
                <div v-if="selectedRoleNotificationRows.length" class="system-impact-actions">
                  <RouterLink :to="systemQueryLocation('/system/notifications', systemDraft.code)">定位通知</RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>可访问菜单</span>
                <strong>{{ selectedLinkedMenus.length }}</strong>
                <p>{{ selectedLinkedMenus.length ? selectedLinkedMenus.map((menu) => menu.name).join('、') : '暂无菜单由该角色权限开放' }}</p>
                <div v-if="selectedLinkedMenus.length" class="system-impact-actions">
                  <RouterLink :to="systemQueryLocation('/system/menus', systemDraft.code)">定位菜单</RouterLink>
                </div>
              </article>
            </div>

            <div v-else-if="isMenusPage" class="system-impact-grid">
              <article class="system-impact-card">
                <span>访问要求</span>
                <strong>{{ selectedMenuRequiredPermissions.length ? `${selectedMenuRequiredPermissions.length} 项权限` : '无限制' }}</strong>
                <p>
                  {{
                    selectedMenuRequiredPermissions.length
                      ? selectedMenuRequiredPermissions.map((permission) => `${permissionModuleLabel(permission)}/${permission.name} · ${permission.status}`).join('、')
                      : '该菜单不要求权限'
                  }}
                </p>
                <div v-if="selectedMenuRequiredPermissionTargets.length" class="system-impact-actions">
                  <RouterLink
                    v-for="target in selectedMenuRequiredPermissionTargets"
                    :key="target.code"
                    :to="systemQueryLocation('/system/permissions', target.code)"
                  >
                    {{ target.label }}
                  </RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>可访问角色</span>
                <strong>{{ selectedLinkedRoles.length }}</strong>
                <p>{{ selectedLinkedRoles.length ? selectedLinkedRoles.map((role) => role.name).join('、') : '暂无角色直接拥有该权限' }}</p>
                <div v-if="selectedLinkedRoles.length" class="system-impact-actions">
                  <RouterLink :to="systemQueryLocation('/system/roles', systemDraft.code)">定位角色</RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>可访问账号</span>
                <strong>{{ selectedLinkedAccounts.length }}</strong>
                <p>{{ selectedLinkedAccounts.length ? selectedLinkedAccounts.map((account) => account.name).join('、') : '暂无启用账号可通过角色访问' }}</p>
                <div v-if="selectedLinkedAccounts.length" class="system-impact-actions">
                  <RouterLink :to="systemQueryLocation('/system/accounts', systemDraft.code)">定位账号</RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>导航结果</span>
                <strong>{{ selectedMenuVisibilityLabel }}</strong>
                <p>{{ selectedMenuNavigationState }}</p>
              </article>
              <article class="system-impact-card">
                <span>启用下级菜单</span>
                <strong>{{ selectedMenuActiveChildRows.length }}</strong>
                <p>{{ selectedMenuActiveChildRows.length ? selectedMenuActiveChildRows.map((menu) => menu.name).join('、') : '暂无启用下级菜单' }}</p>
                <div v-if="selectedMenuActiveChildRows.length" class="system-impact-actions">
                  <RouterLink
                    v-for="childMenu in selectedMenuActiveChildRows"
                    :key="childMenu.code"
                    :to="systemQueryLocation('/system/menus', childMenu.code)"
                  >
                    {{ childMenu.name }}
                  </RouterLink>
                </div>
              </article>
              <article class="system-impact-card wide">
                <span>同级排序</span>
                <strong>{{ selectedMenuSiblingRows.length + 1 }}</strong>
                <p>
                  {{
                    [systemDraft, ...selectedMenuSiblingRows]
                      .sort(compareMenuRows)
                      .map((menu) => `${menu.sortOrder ?? '-'} ${menu.name}`)
                      .join('、')
                  }}
                </p>
              </article>
            </div>

            <div v-else-if="isNamingRulesPage" class="system-impact-grid">
              <article class="system-impact-card">
                <span>业务规则</span>
                <strong>{{ systemDraft.ruleKey || systemDraft.code || '-' }}</strong>
                <p>{{ systemDraft.name || '尚未选择编码规则' }}</p>
              </article>
              <article class="system-impact-card">
                <span>当前前缀</span>
                <strong>{{ systemDraft.prefix || '-' }}</strong>
                <p>{{ systemDraft.prefix ? '将作为自动编号开头' : '请填写编码前缀' }}</p>
              </article>
              <article class="system-impact-card">
                <span>日期格式</span>
                <strong>{{ namingRuleDateLabel(systemDraft) }}</strong>
                <p>{{ systemDraft.dateFormat === 'none' ? '编号中不带日期段' : `当前日期段 ${formatNamingDate(systemDraft.dateFormat)}` }}</p>
              </article>
              <article class="system-impact-card">
                <span>流水位数</span>
                <strong>{{ normalizeSequenceLength(systemDraft.sequenceLength) }} 位</strong>
                <p>流水号会按当前位数自动补零。</p>
              </article>
              <article class="system-impact-card wide">
                <span>实时示例</span>
                <strong>{{ namingRuleSample }}</strong>
                <p>{{ systemDraft.status === '停用' ? '停用后新单据会回退到系统默认规则。' : '保存后将参与后续业务单据自动编号。' }}</p>
              </article>
            </div>

            <div v-else-if="isAccountsPage" class="system-impact-grid">
              <article class="system-impact-card">
                <span>登录状态</span>
                <strong>{{ selectedAccountLoginReadiness }}</strong>
                <p>{{ selectedAccountLoginMessage }}</p>
              </article>
              <article class="system-impact-card">
                <span>已选角色</span>
                <strong>{{ selectedAccountRoleCount }}</strong>
                <p>{{ formatRoleList(systemDraft.roles) }}</p>
                <div v-if="selectedAccountRoleTargets.length" class="system-impact-actions">
                  <RouterLink
                    v-for="target in selectedAccountRoleTargets"
                    :key="target.code"
                    :to="systemQueryLocation('/system/roles', target.code)"
                  >
                    {{ target.label }}
                  </RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>接收通知</span>
                <strong>{{ selectedAccountNotificationRows.length }}</strong>
                <p>{{ selectedAccountNotificationRows.length ? selectedAccountNotificationRows.map((notification) => notification.name).join('、') : '暂无启用通知规则会发送给该账号' }}</p>
                <div v-if="selectedAccountNotificationRows.length" class="system-impact-actions">
                  <RouterLink :to="systemQueryLocation('/system/notifications', systemDraft.code)">定位通知</RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>可执行操作</span>
                <strong>{{ selectedAccountOperationImpacts.length }}</strong>
                <p>{{ selectedAccountOperationImpactMessage }}</p>
                <div v-if="selectedAccountOperationPermissionTargets.length" class="system-impact-actions">
                  <RouterLink
                    v-for="target in selectedAccountOperationPermissionTargets"
                    :key="target.code"
                    :to="systemQueryLocation('/system/permissions', target.code)"
                  >
                    {{ target.label }}
                  </RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>接口动作</span>
                <strong>{{ selectedAccountOperationRouteActionCount }}</strong>
                <p>{{ selectedAccountOperationRouteMessage }}</p>
              </article>
              <article class="system-impact-card">
                <span>可访问菜单</span>
                <strong>{{ selectedAccountAccessibleMenus.length }}</strong>
                <p>{{ selectedAccountAccessibleMenus.length ? selectedAccountAccessibleMenus.map((menu) => menu.name).join('、') : '暂无菜单对该账号开放' }}</p>
                <div v-if="selectedAccountAccessibleMenus.length" class="system-impact-actions">
                  <RouterLink :to="systemQueryLocation('/system/menus', systemDraft.code)">定位菜单</RouterLink>
                </div>
              </article>
              <article class="system-impact-card wide">
                <span>生效权限</span>
                <strong>{{ selectedAccountEffectivePermissions.length }}</strong>
                <p>{{ selectedAccountEffectivePermissionMessage }}</p>
                <div v-if="selectedAccountEffectivePermissionTargets.length" class="system-impact-actions">
                  <RouterLink
                    v-for="target in selectedAccountEffectivePermissionTargets"
                    :key="target.code"
                    :to="systemQueryLocation('/system/permissions', target.code)"
                  >
                    {{ target.label }}
                  </RouterLink>
                </div>
              </article>
            </div>

            <div v-else-if="isNotificationsPage" class="system-impact-grid">
              <article class="system-impact-card">
                <span>触发条件</span>
                <strong>{{ systemDraft.triggerModule || '-' }}</strong>
                <p>{{ systemDraft.triggerAction || '尚未填写触发动作' }}</p>
              </article>
              <article class="system-impact-card">
                <span>接收角色</span>
                <strong>{{ selectedNotificationReceiverRows.length }}</strong>
                <p>{{ selectedNotificationReceiverRows.length ? selectedNotificationReceiverRows.map((role) => role.name).join('、') : '尚未选择接收角色' }}</p>
                <div v-if="selectedNotificationReceiverTargets.length" class="system-impact-actions">
                  <RouterLink
                    v-for="target in selectedNotificationReceiverTargets"
                    :key="target.code"
                    :to="systemQueryLocation('/system/roles', target.code)"
                  >
                    {{ target.label }}
                  </RouterLink>
                </div>
              </article>
              <article class="system-impact-card">
                <span>预计覆盖账号</span>
                <strong>{{ selectedNotificationAccounts.length }}</strong>
                <p>{{ selectedNotificationAccounts.length ? selectedNotificationAccounts.map((account) => account.name).join('、') : '暂无启用账号匹配接收角色' }}</p>
                <div v-if="selectedNotificationAccounts.length" class="system-impact-actions">
                  <RouterLink :to="systemQueryLocation('/system/accounts', systemDraft.code)">定位账号</RouterLink>
                </div>
              </article>
            </div>

            <div v-else-if="isOptionDictionariesPage" class="system-impact-grid">
              <article class="system-impact-card">
                <span>所属模块</span>
                <strong>{{ systemDraft.optionModule || '-' }}</strong>
                <p>{{ systemDraft.optionField || '尚未填写字段/用途' }}</p>
              </article>
              <article class="system-impact-card">
                <span>选项数量</span>
                <strong>{{ optionValueList(systemDraft).length }}</strong>
                <p>{{ optionValueSummary(systemDraft) }}</p>
              </article>
              <article class="system-impact-card">
                <span>使用范围</span>
                <strong>{{ systemDraft.useScope ? '已说明' : '待补充' }}</strong>
                <p>{{ systemDraft.useScope || '建议说明哪些页面和字段会读取该字典。' }}</p>
              </article>
              <article class="system-impact-card wide">
                <span>接入方式</span>
                <strong>{{ systemDraft.status === '停用' ? '暂不生效' : '后续接入' }}</strong>
                <p>当前先完成系统字典原型；业务下拉后续统一按字典读取，避免每个页面单独维护一套枚举。</p>
              </article>
            </div>

            <div v-else-if="isAppsPage" class="system-impact-grid">
              <article class="system-impact-card">
                <span>部署目标</span>
                <strong>{{ systemDraft.deployTarget || '-' }}</strong>
                <p>{{ systemDraft.runtimeMode || '尚未填写运行方式' }}</p>
              </article>
              <article class="system-impact-card">
                <span>入口配置</span>
                <strong>{{ appEndpointCount }}</strong>
                <p>{{ [systemDraft.publicUrl, systemDraft.apiBase, systemDraft.healthPath].filter(Boolean).join('、') || '尚未配置访问入口' }}</p>
              </article>
              <article class="system-impact-card">
                <span>配置完整度</span>
                <strong>{{ appDeployReadiness }}</strong>
                <p>{{ systemDraft.dataStore || '尚未配置数据位置' }}</p>
              </article>
              <article class="system-impact-card">
                <span>健康状态</span>
                <strong>
                  <i class="mini-status" :class="appHealthStatusClass(systemDraft.healthStatus)">{{ systemDraft.healthStatus || '未检查' }}</i>
                </strong>
                <p>{{ appHealthPreflightReason || (systemDraft.healthMessage ? `${appHealthSummary} · ${systemDraft.healthMessage}` : systemDraft.healthTarget || '尚未执行健康检查') }}</p>
                <div v-if="systemDraft.code" class="system-impact-actions">
                  <RouterLink :to="systemQueryLocation('/system/logs', systemDraft.code)">查看日志</RouterLink>
                </div>
              </article>
              <article class="system-impact-card wide">
                <span>部署命令</span>
                <strong>{{ systemDraft.versionTag || '-' }}</strong>
                <div class="system-command-list">
                  <code v-for="step in appDeploySteps" :key="step">{{ step }}</code>
                </div>
              </article>
            </div>

            <div v-else-if="isMcpToolsPage" class="system-impact-grid">
              <article class="system-impact-card">
                <span>工具类型</span>
                <strong>{{ systemDraft.toolType || '-' }}</strong>
                <p>{{ systemDraft.entryPoint || '尚未填写调用入口' }}</p>
              </article>
              <article class="system-impact-card">
                <span>风险边界</span>
                <strong>{{ systemDraft.riskLevel || '中' }}</strong>
                <p>{{ mcpToolRiskNote }}</p>
              </article>
              <article class="system-impact-card">
                <span>配置完整度</span>
                <strong>{{ mcpToolReadiness }}</strong>
                <p>{{ systemDraft.useScope || '尚未填写适用范围' }}</p>
              </article>
              <article class="system-impact-card wide">
                <span>验证方式</span>
                <strong>{{ systemDraft.lastVerifiedAt || '未验证' }}</strong>
                <p>{{ systemDraft.verifyMethod || '尚未填写验证方式' }}</p>
                <p v-if="systemDraft.lastVerificationRemark">最近备注：{{ systemDraft.lastVerificationRemark }}</p>
                <div v-if="systemDraft.code" class="system-impact-actions">
                  <RouterLink :to="systemQueryLocation('/system/logs', systemDraft.code)">查看日志</RouterLink>
                </div>
              </article>
            </div>
          </div>

        </aside>
        <aside v-else class="form-section system-config-editor system-config-empty-editor">
          <div class="section-heading">
            <h2>{{ systemEmptyEditorTitle }}</h2>
          </div>
          <div class="list-empty-state">
            <strong>{{ systemEmptyEditorTitle }}</strong>
            <span>{{ systemEmptyEditorDescription }}</span>
          </div>
        </aside>
      </div>

      <div v-if="visibleSystemRows.length === 0" class="list-empty-state">
        <strong>{{ systemEmptyStateTitle }}</strong>
        <span>{{ systemEmptyStateDescription }}</span>
      </div>
    </section>
  </div>

  <div v-else class="page-stack">
    <div class="page-heading">
      <div>
        <h1>{{ pageTitle }}</h1>
      </div>
    </div>

    <section class="panel module-placeholder">
      <div class="placeholder-icon">
        <ScanLine :size="26" />
      </div>
      <div>
        <h2>{{ pageTitle }}</h2>
        <p>这里会按业务优先级继续补齐列表、单据详情、扫码处理和审批流程。</p>
      </div>
    </section>
  </div>
</template>
