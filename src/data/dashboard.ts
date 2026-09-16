import type { UserRole } from '../stores/session';

export interface RoleTodoItem {
  label: string;
  count: number | null;
}

export interface RoleTodoBoard {
  key: string;
  label: string;
  total: number;
  tone: 'blue' | 'green' | 'amber' | 'red' | 'slate';
  visibleRoles: UserRole[];
  items: RoleTodoItem[];
}

export interface NoticeItem {
  id: string;
  title: string;
  summary: string;
  publisher: string;
  time: string;
}

export const roleTodoBoards: RoleTodoBoard[] = [
  {
    key: 'sales',
    label: '销售待办',
    total: 12,
    tone: 'blue',
    visibleRoles: ['销售', '销售主管', '管理员'],
    items: [
      { label: '待审核', count: 4 },
      { label: '待发货', count: 3 },
      { label: '待开票', count: 5 },
      { label: '', count: null },
    ],
  },
  {
    key: 'purchase',
    label: '采购待办',
    total: 7,
    tone: 'amber',
    visibleRoles: ['采购', '采购主管', '管理员'],
    items: [
      { label: '待审核', count: 2 },
      { label: '待到货', count: 3 },
      { label: '待入库', count: 2 },
      { label: '', count: null },
    ],
  },
  {
    key: 'warehouse',
    label: '仓库待办',
    total: 8,
    tone: 'green',
    visibleRoles: ['仓库', '仓库主管', '管理员'],
    items: [
      { label: '待入库', count: 2 },
      { label: '待出库', count: 3 },
      { label: '待领料', count: 2 },
      { label: '待盘点', count: 1 },
    ],
  },
  {
    key: 'production',
    label: '生产待办',
    total: 6,
    tone: 'slate',
    visibleRoles: ['生产', '生产主管', '管理员'],
    items: [
      { label: '待排产', count: 2 },
      { label: '待领料', count: 1 },
      { label: '待报工', count: 2 },
      { label: '待质检', count: 1 },
    ],
  },
  {
    key: 'quality',
    label: '质检待办',
    total: 5,
    tone: 'red',
    visibleRoles: ['质检', '质检主管', '管理员'],
    items: [
      { label: '来料待检', count: 2 },
      { label: '生产待检', count: 2 },
      { label: '不良处理', count: 1 },
      { label: '', count: null },
    ],
  },
  {
    key: 'system',
    label: '系统待办',
    total: 2,
    tone: 'slate',
    visibleRoles: ['系统管理员', '管理员'],
    items: [
      { label: '权限申请', count: 1 },
      { label: '通知发布', count: 1 },
      { label: '', count: null },
      { label: '', count: null },
    ],
  },
];

export const notices: NoticeItem[] = [
  {
    id: 'NT-001',
    title: '端午后生产排程调整',
    summary: '6 月下旬重点订单优先排产，报工与异常统一在生产控制台记录。',
    publisher: '生产管理部',
    time: '06-17 08:20',
  },
  {
    id: 'NT-002',
    title: '仓库扫码复核要求',
    summary: '销售出库与生产领料必须完成批次扫码复核，异常批次请及时登记。',
    publisher: '仓储中心',
    time: '06-16 17:45',
  },
  {
    id: 'NT-003',
    title: '客户资料维护提醒',
    summary: '新增客户需补全联系人、地址和开票资料。',
    publisher: '销售管理部',
    time: '06-16 10:10',
  },
];
