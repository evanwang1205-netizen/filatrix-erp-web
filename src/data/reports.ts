export type ReportTabKey = 'sales' | 'inventory' | 'production';

export type ReportDetailLine = {
  name: string;
  primary: string;
  secondary: string;
  amount: string;
  status: string;
};

export type ReportRow = {
  code: string;
  title: string;
  category: string;
  metric: string;
  amount: string;
  comparison: string;
  owner: string;
  status: string;
  date: string;
  range: string;
  note: string;
  lines: ReportDetailLine[];
};

export const salesReportRows: ReportRow[] = [
  {
    code: 'RPT-SALES-202606',
    title: '6 月销售订单执行',
    category: '销售订单',
    metric: '订单金额',
    amount: '￥138,300',
    comparison: '较上周 +12%',
    owner: '销售管理部',
    status: '可查看',
    date: '2026-06-18',
    range: '2026-06-01 至 2026-06-18',
    note: '用于查看报价转单、待发货、待开票和待收款订单。',
    lines: [
      { name: '苏州衡远制造', primary: 'SO-20260614-017', secondary: '待发货', amount: '￥18,900', status: '待发货' },
      { name: '深圳星桥设备', primary: 'SO-20260615-028', secondary: '部分收款', amount: '￥76,800', status: '部分收款' },
      { name: '宁波嘉合电子', primary: 'SO-20260613-009', secondary: '已收款', amount: '￥42,600', status: '已完成' },
    ],
  },
  {
    code: 'RPT-SALES-PRICE-202606',
    title: '成品成交价格追踪',
    category: '价格记录',
    metric: '价格条目',
    amount: '4 条',
    comparison: '本周新增 2 条',
    owner: '销售管理部',
    status: '可查看',
    date: '2026-06-18',
    range: '近 30 天',
    note: '用于比对客户最近成交价和订单来源。',
    lines: [
      { name: 'FTX-A120 控制组件', primary: '宁波嘉合电子', secondary: 'SO-20260613-009', amount: '￥142.00', status: '有效' },
      { name: 'FTX-B200 传感模块', primary: '苏州衡远制造', secondary: 'SO-20260614-017', amount: '￥63.00', status: '有效' },
      { name: 'FTX-C410 成品套件', primary: '深圳星桥设备', secondary: 'SO-20260615-028', amount: '￥960.00', status: '有效' },
    ],
  },
];

export const inventoryReportRows: ReportRow[] = [
  {
    code: 'RPT-INV-STOCK-202606',
    title: '库存余额与可用库存',
    category: '库存查询',
    metric: '可用库存',
    amount: '3,600 件',
    comparison: '成品可承诺 2,420 件',
    owner: '仓储中心',
    status: '可查看',
    date: '2026-06-18',
    range: '当前库存',
    note: '按仓库、库位、批次汇总账面、锁定、待检和可用库存。',
    lines: [
      { name: 'FTX-A120 控制组件', primary: '成品仓 A 区', secondary: '3 个批次', amount: '1,840 件', status: '充足' },
      { name: 'B200 传感芯片', primary: '质检仓', secondary: 'RM2026061609', amount: '300 件', status: '待判定' },
      { name: 'FTX-D090 连接器', primary: '成品仓 B 区', secondary: 'B2026060902', amount: '540 件', status: '需补货' },
    ],
  },
  {
    code: 'RPT-INV-BATCH-202606',
    title: '批次追溯汇总',
    category: '批次追溯',
    metric: '批次数',
    amount: '6 批',
    comparison: '2 批本周新增',
    owner: '仓储中心',
    status: '可查看',
    date: '2026-06-18',
    range: '近 90 天',
    note: '用于快速定位批次来源、当前仓库、质检状态和最近流转。',
    lines: [
      { name: 'B2026061208', primary: 'FTX-A120 控制组件', secondary: 'MO-20260612-003', amount: '1,280 件', status: '合格' },
      { name: 'RM2026061804', primary: '铝合金外壳 A120', secondary: 'WR-20260618-004', amount: '600 件', status: '待检' },
      { name: 'RM2026061609', primary: 'B200 传感芯片', secondary: 'WR-20260617-006', amount: '300 件', status: '合格' },
    ],
  },
];

export const productionReportRows: ReportRow[] = [
  {
    code: 'RPT-PROD-WO-202606',
    title: '生产工单进度',
    category: '生产工单',
    metric: '在制数量',
    amount: '520 件',
    comparison: '今日报工 866 件',
    owner: '生产管理部',
    status: '可查看',
    date: '2026-06-18',
    range: '2026-06-01 至 2026-06-18',
    note: '按工单追踪计划、良品、不良、剩余、交期和质检状态。',
    lines: [
      { name: 'MO-20260618-002', primary: 'FTX-B200 传感模块', secondary: 'A2 产线', amount: '剩余 180 件', status: '生产中' },
      { name: 'MO-20260621-008', primary: 'FTX-D090 连接器', secondary: 'A2 产线', amount: '剩余 340 件', status: '生产中' },
      { name: 'MO-20260616-004', primary: 'FTX-A120 控制组件', secondary: 'B1 产线', amount: '已完工 240 件', status: '已完成' },
    ],
  },
  {
    code: 'RPT-PROD-QC-202606',
    title: '生产质检异常',
    category: '质检异常',
    metric: '异常数',
    amount: '3 条',
    comparison: '严重 1 条',
    owner: '质量管理部',
    status: '可查看',
    date: '2026-06-18',
    range: '近 14 天',
    note: '汇总生产质检待复判、返工和已关闭记录。',
    lines: [
      { name: 'PQC-20260618-011', primary: 'FTX-B200 传感模块', secondary: '灌封气泡', amount: '1 件', status: '待复判' },
      { name: 'NCR-20260616-002', primary: 'FTX-D090 连接器', secondary: '端子压接不良', amount: '4 件', status: '返工中' },
      { name: 'NCR-20260612-001', primary: 'FTX-C410 成品套件', secondary: '线束松脱', amount: '1 套', status: '已关闭' },
    ],
  },
];

export const reportRowsByPage: Record<ReportTabKey, ReportRow[]> = {
  sales: salesReportRows,
  inventory: inventoryReportRows,
  production: productionReportRows,
};
