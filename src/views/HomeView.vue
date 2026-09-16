<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import type { RoleTodoBoard } from '../data/dashboard';
import { moduleReadPermissionCodes } from '../data/permissionMatrix';
import {
  apiBase,
  getStoredSessionToken,
  listNotifications,
  listProductionQualityTasks,
  listPurchaseOrders,
  listPurchaseRequisitions,
  listQualityClosures,
  listSalesOrders,
  listSalesOutboundRequests,
  listSalesQuotes,
  listSystemRecords,
  listWarehouseOtherMoves,
  listWarehouseStocktakes,
  listWarehouseTransfers,
  markNotificationRead,
  type AppNotification,
} from '../services/api';
import {
  accessDeniedHomeLocation,
  type AccessDeniedReason,
  canAccessNavigationPath,
  navigationAccessIssue,
  routeWritePermission,
  useNavigationStore,
} from '../stores/navigation';
import { useSessionStore } from '../stores/session';

const route = useRoute();
const router = useRouter();
const navigation = useNavigationStore();
const session = useSessionStore();
type TodoBoardKey = 'sales' | 'purchase' | 'warehouse' | 'production' | 'quality' | 'system';
type TodoRecord = Record<string, unknown> & {
  code?: string;
  status?: string;
  documentStatus?: string;
  convertedOrderCode?: string;
  purchaseType?: string;
};
type HomeTodoItem = RoleTodoBoard['items'][number] & {
  path?: string;
};
type HomeTodoBoard = Omit<RoleTodoBoard, 'key' | 'items'> & {
  key: TodoBoardKey;
  items: HomeTodoItem[];
  allowed: boolean;
  loading: boolean;
  error: string;
};
type ProductionTodoSnapshot = {
  tasks: TodoRecord[];
  workOrders: TodoRecord[];
  materialRequests: TodoRecord[];
  executionCards: TodoRecord[];
};

const todoBoards = ref<HomeTodoBoard[]>([]);
const todoBootstrapError = ref('');
const homeNotifications = ref<AppNotification[]>([]);
const homeNotificationsLoading = ref(false);
const homeNotificationError = ref('');

function recordStatus(row: TodoRecord) {
  return String(row.status || row.documentStatus || '').trim();
}

function countStatus(rows: TodoRecord[], statuses: string[]) {
  return rows.filter((row) => statuses.includes(recordStatus(row))).length;
}

function objectFact(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function factStatus(value: unknown) {
  if (typeof value === 'string') return value.trim();
  const record = objectFact(value);
  return String(record?.status || record?.value || record?.label || '').trim();
}

function progressFact(row: TodoRecord, key: string) {
  const progressFacts = objectFact(row.progressFacts);
  return factStatus(progressFacts?.[key] ?? row[`${key}Progress`]);
}

function documentFact(row: TodoRecord) {
  const progressFacts = objectFact(row.progressFacts);
  return factStatus(row.documentStatus ?? progressFacts?.documentStatus) || recordStatus(row);
}

function runtimeRequestHeaders() {
  const headers = new Headers();
  const sessionToken = getStoredSessionToken();
  const currentAccount = window.localStorage.getItem('filatrix-current-account') || '';
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  else if (currentAccount) headers.set('X-Filatrix-Account', currentAccount);
  return headers;
}

async function loadRuntimePayload(path: string) {
  const response = await fetch(`${apiBase}${path}`, { headers: runtimeRequestHeaders() });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(payload.error || payload.message || `待办数据加载失败：${response.status}`));
  }
  return payload;
}

function payloadRows(payload: Record<string, unknown>, key = 'items') {
  const rows = payload[key];
  return Array.isArray(rows)
    ? rows.filter((row): row is TodoRecord => Boolean(row && typeof row === 'object' && !Array.isArray(row)))
    : [];
}

async function loadProductionTodoSnapshot(): Promise<ProductionTodoSnapshot> {
  const payload = await loadRuntimePayload('/production/work-orders');
  if (!Array.isArray(payload.items)) throw new Error('生产运行接口未返回有效工单列表');
  return {
    tasks: payloadRows(payload, 'tasks'),
    workOrders: payloadRows(payload),
    materialRequests: payloadRows(payload, 'materialRequests'),
    executionCards: payloadRows(payload, 'executionCards'),
  };
}

async function loadIncomingQualityRows() {
  return payloadRows(await loadRuntimePayload('/quality/incoming'));
}

function buildBoard(
  key: TodoBoardKey,
  label: string,
  tone: RoleTodoBoard['tone'],
  visibleRoles: RoleTodoBoard['visibleRoles'],
  items: HomeTodoItem[],
  allowed: boolean,
): HomeTodoBoard {
  return {
    key,
    label,
    tone,
    visibleRoles,
    items,
    total: items.reduce((sum, item) => sum + (item.count ?? 0), 0),
    allowed,
    loading: false,
    error: '',
  };
}

function pendingItem(label: string, path: string): HomeTodoItem {
  return { label, count: null, path };
}

function todoPathEnabled(path: string) {
  const issue = navigationAccessIssue(
    navigation.menuRows,
    path,
    (permissionCode) => session.hasPermission(permissionCode),
    navigation.loaded,
  );
  return !issue || !['disabled-menu', 'missing-permission'].includes(issue.reason);
}

async function loadTodoList<T>(path: string, loader: () => Promise<T[]>): Promise<T[]> {
  return todoPathEnabled(path) ? loader() : [];
}

function enabledTodoItems(items: HomeTodoItem[]) {
  return items.filter((item) => !item.path || todoPathEnabled(item.path));
}

function createTodoBoards(access: Record<TodoBoardKey, boolean>) {
  return [
    buildBoard('sales', '销售待办', 'blue', ['销售', '销售主管', '管理员'], [
      pendingItem('报价待推进', '/sales/quotes'),
      pendingItem('订单待交付', '/sales/orders'),
      pendingItem('出库跟踪待推进', '/sales/outbound-requests'),
      pendingItem('待登记开票', '/sales/orders'),
    ], access.sales),
    buildBoard('purchase', '采购待办', 'amber', ['采购', '采购主管', '管理员'], [
      pendingItem('采购需求待受理', '/purchase/requisitions'),
      pendingItem('采购待入库', '/purchase/orders'),
      pendingItem('待登记收票', '/purchase/orders'),
      { label: '', count: null },
    ], access.purchase),
    buildBoard('warehouse', '仓库待办', 'green', ['仓库', '仓库主管', '管理员'], [
      pendingItem('其他待过账', '/warehouse/other-moves'),
      pendingItem('调拨待处理', '/warehouse/transfers'),
      pendingItem('盘点进行中', '/warehouse/stocktakes'),
      { label: '', count: null },
    ], access.warehouse),
    buildBoard('production', '生产待办', 'slate', ['生产', '生产主管', '管理员'], [
      pendingItem('生产任务待排产', '/production/tasks'),
      pendingItem('工单待派发/备料', '/production/work-orders'),
      pendingItem('备料申请待提交', '/production/material-requests'),
      pendingItem('生产批次执行中', '/production/execution-cards'),
    ], access.production),
    buildBoard('quality', '质检待办', 'red', ['质检', '质检主管', '管理员'], [
      pendingItem('来料待检/复判', '/quality/incoming'),
      pendingItem('生产待检验', '/quality/production'),
      pendingItem('生产质检待复判', '/quality/production'),
      pendingItem('不良待处理', '/quality/defects'),
    ], access.quality),
    buildBoard('system', '系统待办', 'slate', ['系统管理员', '管理员'], [
      pendingItem('启用通知', '/system/notifications'),
      pendingItem('最近日志', '/system/logs'),
      { label: '', count: null },
      { label: '', count: null },
    ], access.system),
  ];
}

async function salesTodoItems(): Promise<HomeTodoItem[]> {
  const [quotes, salesOrders, outboundRequests] = await Promise.all([
    loadTodoList('/sales/quotes', listSalesQuotes),
    loadTodoList('/sales/orders', listSalesOrders),
    loadTodoList('/sales/outbound-requests', listSalesOutboundRequests),
  ]);
  const quoteRows = quotes as TodoRecord[];
  const orderRows = salesOrders as TodoRecord[];
  const outboundRows = outboundRequests as TodoRecord[];
  const activeOrder = (order: TodoRecord) => !['草稿', '已作废', '已取消', '已关闭'].includes(documentFact(order));
  return enabledTodoItems([
    {
      label: '报价待推进',
      count: quoteRows.filter((quote) => (
        quote.status === '草稿'
        || (quote.status === '已确认' && !String(quote.convertedOrderCode || '').trim())
      )).length,
      path: '/sales/quotes',
    },
    {
      label: '订单待交付',
      count: orderRows.filter((order) => {
        if (!activeOrder(order)) return false;
        const delivery = progressFact(order, 'delivery');
        return delivery
          ? !['已签收', '已完成', '已取消'].includes(delivery)
          : ['已确认', '生产中', '待申请出库', '待发货', '已申请出库', '发货中', '部分发货', '待签收'].includes(recordStatus(order));
      }).length,
      path: '/sales/orders',
    },
    {
      label: '出库跟踪待推进',
      count: outboundRows.filter((row) => !['草稿', '已出库', '已完成', '已作废', '已取消'].includes(recordStatus(row))).length,
      path: '/sales/outbound-requests',
    },
    {
      label: '待登记开票',
      count: orderRows.filter((order) => activeOrder(order) && !['已开票', '已完成', '已取消'].includes(progressFact(order, 'invoice'))).length,
      path: '/sales/orders',
    },
  ]);
}

async function purchaseTodoItems(): Promise<HomeTodoItem[]> {
  const [purchaseRequisitions, purchaseOrders] = await Promise.all([
    loadTodoList('/purchase/requisitions', listPurchaseRequisitions),
    loadTodoList('/purchase/orders', listPurchaseOrders),
  ]);
  const requisitionRows = purchaseRequisitions as TodoRecord[];
  const orderRows = purchaseOrders as TodoRecord[];
  const activeOrder = (order: TodoRecord) => !['草稿', '已作废', '已取消', '已关闭'].includes(documentFact(order));
  return enabledTodoItems([
    { label: '采购需求待受理', count: countStatus(requisitionRows, ['待采购受理']), path: '/purchase/requisitions' },
    {
      label: '采购待入库',
      count: orderRows.filter((order) => activeOrder(order) && !['已入库', '全部入库', '已完成'].includes(progressFact(order, 'receipt'))).length,
      path: '/purchase/orders',
    },
    {
      label: '待登记收票',
      count: orderRows.filter((order) => activeOrder(order) && !['已收票', '已完成'].includes(progressFact(order, 'invoice'))).length,
      path: '/purchase/orders',
    },
    { label: '', count: null },
  ]);
}

async function warehouseTodoItems(): Promise<HomeTodoItem[]> {
  const [otherMoves, transfers, stocktakes] = await Promise.all([
    loadTodoList('/warehouse/other-moves', listWarehouseOtherMoves),
    loadTodoList('/warehouse/transfers', listWarehouseTransfers),
    loadTodoList('/warehouse/stocktakes', listWarehouseStocktakes),
  ]);
  return enabledTodoItems([
    { label: '其他待过账', count: countStatus(otherMoves as TodoRecord[], ['待过账']), path: '/warehouse/other-moves' },
    { label: '调拨待处理', count: countStatus(transfers as TodoRecord[], ['待出库', '待入库']), path: '/warehouse/transfers' },
    { label: '盘点进行中', count: countStatus(stocktakes as TodoRecord[], ['盘点中']), path: '/warehouse/stocktakes' },
    { label: '', count: null },
  ]);
}

async function productionTodoItems(): Promise<HomeTodoItem[]> {
  if (!todoPathEnabled('/production/work-orders')) return [];
  const snapshot = await loadProductionTodoSnapshot();
  return enabledTodoItems([
    { label: '生产任务待排产', count: countStatus(snapshot.tasks, ['待排产', '待建工单']), path: '/production/tasks' },
    { label: '工单待派发/备料', count: countStatus(snapshot.workOrders, ['待确认', '待派发', '待备料', '待释放']), path: '/production/work-orders' },
    { label: '备料申请待提交', count: countStatus(snapshot.materialRequests, ['草稿']), path: '/production/material-requests' },
    { label: '生产批次执行中', count: countStatus(snapshot.executionCards, ['待开工', '生产中', '执行中', '暂停', '异常']), path: '/production/execution-cards' },
  ]);
}

async function qualityTodoItems(): Promise<HomeTodoItem[]> {
  const [incoming, productionQuality, defectQuality] = await Promise.all([
    loadTodoList('/quality/incoming', loadIncomingQualityRows),
    loadTodoList('/quality/production', listProductionQualityTasks),
    loadTodoList('/quality/defects', () => listQualityClosures('defects')),
  ]);
  const productionRows = productionQuality as TodoRecord[];
  return enabledTodoItems([
    { label: '来料待检/复判', count: countStatus(incoming, ['待检验', '待复判', '待判定']), path: '/quality/incoming' },
    { label: '生产待检验', count: countStatus(productionRows, ['待检验', '待抽检']), path: '/quality/production' },
    { label: '生产质检待复判', count: countStatus(productionRows, ['待复判']), path: '/quality/production' },
    { label: '不良待处理', count: countStatus(defectQuality as TodoRecord[], ['待处理', '返工中', '处理中', '待关闭']), path: '/quality/defects' },
  ]);
}

async function systemTodoItems(): Promise<HomeTodoItem[]> {
  const [notifications, logs] = await Promise.all([
    loadTodoList('/system/notifications', () => listSystemRecords('notifications')),
    loadTodoList('/system/logs', () => listSystemRecords('logs')),
  ]);
  return enabledTodoItems([
    { label: '启用通知', count: countStatus(notifications as TodoRecord[], ['启用']), path: '/system/notifications' },
    { label: '最近日志', count: Math.min(logs.length, 9), path: '/system/logs' },
    { label: '', count: null },
    { label: '', count: null },
  ]);
}

const todoBoardLoaders: Record<TodoBoardKey, () => Promise<HomeTodoItem[]>> = {
  sales: salesTodoItems,
  purchase: purchaseTodoItems,
  warehouse: warehouseTodoItems,
  production: productionTodoItems,
  quality: qualityTodoItems,
  system: systemTodoItems,
};

async function retryTodoBoard(key: TodoBoardKey) {
  const board = todoBoards.value.find((item) => item.key === key);
  if (!board?.allowed || board.loading) return;
  board.loading = true;
  board.error = '';
  try {
    const items = await todoBoardLoaders[key]();
    board.items = items;
    board.total = items.reduce((sum, item) => sum + (item.count ?? 0), 0);
  } catch (error) {
    board.error = error instanceof Error ? error.message : `${board.label}加载失败`;
  } finally {
    board.loading = false;
  }
}

async function retryAllTodoBoards() {
  await Promise.all(todoBoards.value.filter((board) => board.allowed).map((board) => retryTodoBoard(board.key)));
}

async function loadTodoBoards() {
  todoBootstrapError.value = '';
  try {
    await Promise.all([session.loadUserFromAccounts(), navigation.loadMenus()]);
  } catch (error) {
    todoBoards.value = [];
    todoBootstrapError.value = error instanceof Error ? error.message : '当前账号信息加载失败';
    return;
  }

  const access: Record<TodoBoardKey, boolean> = {
    sales: session.hasPermission(moduleReadPermissionCodes.sales),
    purchase: session.hasPermission(moduleReadPermissionCodes.purchase),
    warehouse: session.hasPermission(moduleReadPermissionCodes.warehouse),
    production: session.hasPermission(moduleReadPermissionCodes.production),
    quality: session.hasPermission(moduleReadPermissionCodes.quality),
    system: session.hasPermission(moduleReadPermissionCodes.system),
  };
  todoBoards.value = createTodoBoards(access);
  await retryAllTodoBoards();
}

const visibleTodoBoards = computed(() => {
  if (session.isAdmin) {
    return todoBoards.value.filter((board) => board.allowed);
  }

  return todoBoards.value.filter((board) => board.allowed &&
    board.visibleRoles.some((role) => session.user.roles.includes(role)),
  );
});

const accessDeniedReason = computed(() => route.query.accessDenied?.toString() ?? '');
const accessDeniedPath = computed(() => route.query.from?.toString() ?? '');
const homeUnreadCount = computed(() => homeNotifications.value.filter((item) => item.unread).length);
const canRepairSystemAccess = computed(() => session.hasPermission(moduleReadPermissionCodes.system));
const menuAccessIssue = computed(() => {
  if (accessDeniedReason.value !== 'menu' || !accessDeniedPath.value) return undefined;
  return navigationAccessIssue(
    navigation.menuRows,
    accessDeniedPath.value,
    (permissionCode) => session.hasPermission(permissionCode),
    navigation.loaded,
  );
});
const accessDeniedMessage = computed(() => {
  if (!accessDeniedReason.value) return '';
  const target = accessDeniedPath.value ? `「${accessDeniedPath.value}」` : '该页面';
  if (accessDeniedReason.value === 'write') {
    const permissionCode = routeWritePermission(accessDeniedPath.value);
    const permissionText = permissionCode ? `${session.permissionLabel(permissionCode)}权限` : '维护权限';
    return `当前账号没有${permissionText}，不能维护 ${target}，已返回首页。请在角色管理中补充该权限。`;
  }
  if (accessDeniedReason.value === 'navigation') {
    return '菜单配置暂时无法读取，已返回首页。请稍后刷新或联系系统管理员。';
  }
  if (menuAccessIssue.value?.reason === 'missing-permission' && menuAccessIssue.value.permissionCode) {
    return `当前账号没有${session.permissionLabel(menuAccessIssue.value.permissionCode)}权限，不能打开 ${target}。请在角色管理中补充权限，或在菜单管理中调整绑定权限。`;
  }
  if (menuAccessIssue.value?.reason === 'disabled-menu') {
    const menuName = menuAccessIssue.value.menuName ? `「${menuAccessIssue.value.menuName}」` : '对应菜单';
    return `${target} 被 ${menuName} 停用或被上级菜单隐藏，已返回首页。请在菜单管理中启用相关菜单。`;
  }
  if (menuAccessIssue.value?.reason === 'missing-menu') {
    return `${target} 没有匹配的菜单配置，已返回首页。请在菜单管理中检查该路径是否存在。`;
  }
  return `${target} 未启用、未分配给当前账号，或已被上级菜单隐藏，已返回首页。`;
});
const accessDeniedActions = computed(() => {
  if (!accessDeniedMessage.value || !canRepairSystemAccess.value) return [];
  if (accessDeniedReason.value === 'write') {
    const permissionCode = routeWritePermission(accessDeniedPath.value);
    return [
      { label: '检查角色权限', path: '/system/roles', query: permissionCode ? { q: permissionCode } : undefined },
      { label: '查看权限点', path: '/system/permissions', query: permissionCode ? { q: permissionCode } : undefined },
    ];
  }
  if (menuAccessIssue.value?.reason === 'missing-permission') {
    const permissionCode = menuAccessIssue.value.permissionCode;
    return [
      { label: '检查角色权限', path: '/system/roles', query: permissionCode ? { q: permissionCode } : undefined },
      { label: '调整菜单绑定', path: '/system/menus', query: permissionCode ? { q: permissionCode } : undefined },
    ];
  }
  if (menuAccessIssue.value?.reason === 'disabled-menu' || menuAccessIssue.value?.reason === 'missing-menu') {
    const keyword = menuAccessIssue.value.menuCode || accessDeniedPath.value;
    return [{ label: '打开菜单管理', path: '/system/menus', query: keyword ? { q: keyword } : undefined }];
  }
  return [];
});

function notificationMetaText(item: AppNotification) {
  return [item.sourceDoc, item.createdAt].filter(Boolean).join(' · ') || '系统通知';
}

function notificationTitleText(item: AppNotification) {
  return [item.module, item.action, item.title, item.message, notificationMetaText(item)].filter(Boolean).join(' / ');
}

async function loadHomeNotifications() {
  try {
    homeNotificationsLoading.value = true;
    const inbox = await listNotifications(8);
    homeNotifications.value = inbox.items;
    homeNotificationError.value = '';
  } catch (error) {
    homeNotifications.value = [];
    homeNotificationError.value = error instanceof Error ? error.message : '通知加载失败';
  } finally {
    homeNotificationsLoading.value = false;
  }
}

async function pathAccessDeniedReason(path: string): Promise<AccessDeniedReason | ''> {
  if (!navigation.loaded || navigation.error) {
    await navigation.loadMenus();
  }

  const canReadTargetPath = canAccessNavigationPath(
    navigation.menuRows,
    path,
    (permissionCode) => session.hasPermission(permissionCode),
    navigation.loaded,
  );
  const writePermission = routeWritePermission(path);
  const lacksWritePermission = Boolean(writePermission && !session.hasPermission(writePermission));

  if (navigation.error) return 'navigation';
  if (!canReadTargetPath) return 'menu';
  if (lacksWritePermission) return 'write';
  return '';
}

async function openAccessiblePath(path: string) {
  if (!path) return;

  const deniedReason = await pathAccessDeniedReason(path);
  if (deniedReason) {
    await router.push(accessDeniedHomeLocation(deniedReason, path));
    return;
  }

  await router.push(path);
}

async function openHomeNotification(item: AppNotification) {
  try {
    const deniedReason = item.sourcePath ? await pathAccessDeniedReason(item.sourcePath) : '';
    if (deniedReason) {
      homeNotificationError.value = '当前账号没有权限打开该通知来源，已保持未读。';
      await router.push(accessDeniedHomeLocation(deniedReason, item.sourcePath));
      return;
    }

    if (item.unread) {
      const inbox = await markNotificationRead(item.code);
      homeNotifications.value = inbox.items.slice(0, 8);
    }
    homeNotificationError.value = '';
    await openAccessiblePath(item.sourcePath);
  } catch (error) {
    homeNotificationError.value = error instanceof Error ? error.message : '通知操作失败';
  }
}

onMounted(() => {
  void loadTodoBoards();
  void loadHomeNotifications();
});
</script>

<template>
  <div class="page-stack">
    <section v-if="accessDeniedMessage" class="access-denied-banner" aria-live="polite">
      <strong>无法打开页面</strong>
      <span>{{ accessDeniedMessage }}</span>
      <div v-if="accessDeniedActions.length" class="access-denied-actions">
        <RouterLink
          v-for="action in accessDeniedActions"
          :key="action.path"
          :to="{ path: action.path, query: action.query }"
        >
          {{ action.label }}
        </RouterLink>
      </div>
    </section>

    <div class="dashboard-grid">
      <section class="main-panel dashboard-main-panel">
        <div class="section-heading">
          <div>
            <h2>待办看板</h2>
            <p>数据来自各模块当前业务记录，点击待办可进入对应列表。</p>
          </div>
          <button
            type="button"
            class="notice-refresh-button"
            :disabled="visibleTodoBoards.some((board) => board.loading)"
            @click="retryAllTodoBoards"
          >
            刷新
          </button>
        </div>

        <section v-if="todoBootstrapError" class="todo-bootstrap-error" role="alert">
          <strong>待办看板加载失败</strong>
          <span>{{ todoBootstrapError }}</span>
          <button type="button" class="notice-refresh-button" @click="loadTodoBoards">重试</button>
        </section>

        <div class="todo-board-list">
          <article
            v-for="board in visibleTodoBoards"
            :key="board.key"
            class="todo-board"
            :class="[`tone-${board.tone}`, { empty: !board.loading && !board.error && board.total === 0, 'is-loading': board.loading, 'has-error': board.error }]"
            :aria-busy="board.loading"
          >
            <div class="todo-board-head">
              <span>{{ board.label }}</span>
              <strong>{{ board.loading ? '…' : board.error ? '—' : board.total }}</strong>
            </div>

            <div v-if="board.error" class="todo-board-error" role="alert">
              <span>{{ board.error }}</span>
              <button type="button" class="notice-refresh-button" @click="retryTodoBoard(board.key)">重试</button>
            </div>
            <div v-else-if="board.loading" class="todo-board-loading">
              正在读取最新待办…
            </div>
            <div v-else class="todo-chip-grid">
              <template v-for="(item, index) in board.items" :key="`${board.key}-${index}`">
                <RouterLink
                  v-if="item.path && item.count !== null"
                  class="todo-chip todo-chip-link"
                  :to="item.path"
                  :title="`打开${item.label}列表，共 ${item.count} 项`"
                >
                  <span>{{ item.label }}</span>
                  <strong>{{ item.count }}</strong>
                </RouterLink>
                <span v-else class="todo-chip placeholder">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.count }}</strong>
                </span>
              </template>
            </div>
          </article>
        </div>
      </section>

      <aside class="panel notice-panel">
        <div class="section-heading">
          <div>
            <h2>内部通知</h2>
            <p>{{ homeUnreadCount }} 条未读</p>
          </div>
          <button type="button" class="notice-refresh-button" :disabled="homeNotificationsLoading" @click="loadHomeNotifications">
            刷新
          </button>
        </div>

        <div class="notice-list">
          <p v-if="homeNotificationError" class="notice-empty error">{{ homeNotificationError }}</p>
          <p v-else-if="homeNotificationsLoading && !homeNotifications.length" class="notice-empty">正在加载通知</p>
          <p v-else-if="!homeNotifications.length" class="notice-empty">暂无通知</p>
          <template v-else>
            <button
              v-for="notice in homeNotifications"
              :key="notice.code"
              type="button"
              class="notice-card"
              :class="{ unread: notice.unread }"
              :title="notificationTitleText(notice)"
              @click="openHomeNotification(notice)"
            >
              <span>{{ notice.module }} / {{ notice.action }}</span>
              <strong>{{ notice.title }}</strong>
              <p>{{ notice.message }}</p>
              <em>{{ notificationMetaText(notice) }}</em>
            </button>
          </template>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.dashboard-main-panel > .section-heading {
  align-items: center;
}

.dashboard-main-panel > .section-heading > div {
  display: grid;
  gap: 3px;
}

.dashboard-main-panel > .section-heading p {
  color: var(--muted);
  font-size: 12px;
}

.todo-bootstrap-error,
.todo-board-error,
.todo-board-loading {
  display: grid;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}

.todo-bootstrap-error {
  margin: 0 17px 14px;
  padding: 12px;
  border: 1px solid #e1c49c;
  border-radius: 8px;
  color: #6c451b;
  background: #fff9ef;
}

.todo-bootstrap-error .notice-refresh-button,
.todo-board-error .notice-refresh-button {
  justify-self: start;
}

.todo-board.has-error {
  border-color: #dfb48d;
  background: #fffaf3;
}

.todo-board.is-loading {
  opacity: 0.78;
}

.todo-chip-link {
  color: inherit;
  text-decoration: none;
  transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
}

.todo-chip-link:hover,
.todo-chip-link:focus-visible {
  border-color: var(--todo-accent, #657485);
  background: #fff;
  transform: translateY(-1px);
  outline: none;
}
</style>
