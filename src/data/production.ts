export type ProductionPageKey =
  | 'tasks'
  | 'workOrders'
  | 'materialRequests'
  | 'recipes'
  | 'processTemplates'
  | 'processSteps';

export const productionTaskRows = [
  {
    code: 'PT-20260629-008',
    sourceOrder: 'SO-20260626-015',
    product: 'PETG 1.75mm 黑色耗材',
    qty: '500 kg',
    products: [
      { name: 'PETG 1.75mm 黑色耗材', qty: '500 kg' },
    ],
    dueDate: '2026-07-03',
    line: '挤出 A1 线',
    creator: '陈宇',
    status: '生产中',
    priority: '加急',
    materialStatus: '已领料',
    workOrder: 'MO-20260630-001',
  },
  {
    code: 'PT-20260629-009',
    sourceOrder: 'SO-20260627-006',
    product: 'PLA 1.75mm 珍珠白耗材',
    qty: '260 kg',
    products: [
      { name: 'PLA 1.75mm 珍珠白耗材', qty: '260 kg' },
    ],
    dueDate: '2026-07-01',
    line: '挤出 A2 线',
    creator: '赵云',
    status: '已排产',
    priority: '正常',
    materialStatus: '已领料',
    workOrder: 'MO-20260630-002',
  },
  {
    code: 'PT-20260630-002',
    sourceOrder: '备货任务-07',
    product: 'ABS 1.75mm 工业灰耗材',
    qty: '320 kg',
    products: [
      { name: 'ABS 1.75mm 工业灰耗材', qty: '320 kg' },
    ],
    dueDate: '2026-07-05',
    line: '挤出 A1 线',
    creator: '李强',
    status: '待排产',
    priority: '正常',
    materialStatus: '已备料',
    workOrder: '-',
  },
  {
    code: 'PT-20260630-004',
    sourceOrder: 'SO-20260628-011',
    product: 'PETG 1.75mm 透明耗材',
    qty: '180 kg',
    products: [
      { name: 'PETG 1.75mm 透明耗材', qty: '180 kg' },
    ],
    dueDate: '2026-07-04',
    line: '挤出 A2 线',
    creator: '王悦',
    status: '待排产',
    priority: '正常',
    materialStatus: '未备料',
    workOrder: '-',
  },
  {
    code: 'PT-20260630-005',
    sourceOrder: '备货任务-08',
    product: 'PLA 1.75mm 哑光黑耗材',
    qty: '240 kg',
    products: [
      { name: 'PLA 1.75mm 哑光黑耗材', qty: '240 kg' },
    ],
    dueDate: '2026-07-06',
    line: '挤出 A1 线',
    creator: '周宁',
    status: '待排产',
    priority: '正常',
    materialStatus: '未备料',
    workOrder: '-',
  },
];

export const productionWorkOrderRows = [
  {
    code: 'MO-20260630-001',
    taskCode: 'PT-20260629-008',
    product: 'PETG 1.75mm 黑色耗材',
    qty: '500 kg',
    unitWeightKg: 1,
    planDate: '2026-06-30',
    line: '挤出 A1 线',
    recipe: 'BOM-PETG-BLK-V2',
    processTemplate: 'PRC-FILAMENT-PETG-V2',
    leader: '李四',
    status: '生产中',
    output: '180 kg',
    defect: '5 kg',
  },
  {
    code: 'MO-20260630-002',
    taskCode: 'PT-20260629-009',
    product: 'PLA 1.75mm 珍珠白耗材',
    qty: '260 kg',
    unitWeightKg: 1,
    planDate: '2026-06-30',
    line: '挤出 A2 线',
    recipe: 'BOM-PLA-WHT-V1',
    processTemplate: 'PRC-FILAMENT-PLA-V1',
    leader: '赵云',
    status: '待质检',
    output: '80 kg',
    defect: '2 kg',
  },
  {
    code: 'MO-20260630-003',
    taskCode: 'PT-20260630-002',
    product: 'ABS 1.75mm 工业灰耗材',
    qty: '320 kg',
    unitWeightKg: 1,
    planDate: '2026-07-01',
    line: '挤出 A1 线',
    recipe: 'BOM-ABS-GRY-V1',
    processTemplate: 'PRC-FILAMENT-ABS-V1',
    leader: '李强',
    status: '待派发',
    output: '0 kg',
    defect: '0 kg',
  },
  {
    code: 'MO-20260630-004',
    taskCode: 'PT-20260630-004',
    product: 'PETG 1.75mm 透明耗材',
    qty: '180 kg',
    unitWeightKg: 1,
    planDate: '2026-07-02',
    line: '挤出 A2 线',
    recipe: 'BOM-PETG-CLEAR-V1',
    processTemplate: 'PRC-FILAMENT-PETG-V2',
    leader: '王悦',
    status: '待备料',
    output: '0 kg',
    defect: '0 kg',
  },
  {
    code: 'MO-20260629-006',
    taskCode: 'PT-20260628-003',
    product: 'PLA 1.75mm 哑光黑耗材',
    qty: '240 kg',
    unitWeightKg: 1,
    planDate: '2026-06-29',
    line: '挤出 A1 线',
    recipe: 'BOM-PLA-MBK-V1',
    processTemplate: 'PRC-FILAMENT-PLA-V1',
    leader: '王敏',
    status: '部分入库',
    output: '210 kg',
    defect: '4 kg',
    inbound: '160 kg',
  },
  {
    code: 'MO-20260628-002',
    taskCode: 'PT-20260627-001',
    product: 'PETG 1.75mm 黑色耗材',
    qty: '300 kg',
    unitWeightKg: 1,
    planDate: '2026-06-28',
    line: '挤出 A1 线',
    recipe: 'BOM-PETG-BLK-V2',
    processTemplate: 'PRC-FILAMENT-PETG-V2',
    leader: '钱峰',
    status: '已完成',
    output: '300 kg',
    defect: '3 kg',
    inbound: '300 kg',
  },
];

export const productionMaterialRequestRows = [
  {
    code: 'MR-20260630-001',
    workOrder: 'MO-20260630-001',
    product: 'PETG 1.75mm 黑色耗材',
    materials: [
      { name: 'PETG 原生粒子', qty: '455 kg', status: '已领料' },
      { name: '黑色色母', qty: '25 kg', status: '已领料' },
      { name: '增韧助剂', qty: '10 kg', status: '已领料' },
      { name: '1kg 小盘线轴', qty: '500 个', status: '部分领料' },
    ],
    warehouse: '原料仓 R 区',
    target: '挤出 A1 线边仓',
    requester: '李四',
    status: '部分领料',
    date: '2026-06-30',
  },
  {
    code: 'MR-20260630-002',
    workOrder: 'MO-20260630-002',
    product: 'PLA 1.75mm 珍珠白耗材',
    materials: [
      { name: 'PLA 原生粒子', qty: '235 kg', status: '已领料' },
      { name: '珍珠白色母', qty: '15 kg', status: '已领料' },
      { name: '干燥剂', qty: '4 kg', status: '已领料' },
      { name: '1kg 小盘线轴', qty: '260 个', status: '已领料' },
    ],
    warehouse: '原料仓 R 区',
    target: '挤出 A2 线边仓',
    requester: '赵云',
    status: '已领料',
    date: '2026-06-30',
  },
  {
    code: 'MR-20260630-003',
    workOrder: 'MO-20260630-003',
    product: 'ABS 1.75mm 工业灰耗材',
    materials: [
      { name: 'ABS 原生粒子', qty: '300 kg', status: '待领料' },
      { name: '工业灰色母', qty: '16 kg', status: '待领料' },
      { name: '大盘收卷轴', qty: '2 个', status: '待领料' },
    ],
    warehouse: '原料仓 R 区',
    target: '挤出 A1 线边仓',
    requester: '李强',
    status: '待仓库受理',
    date: '2026-06-30',
  },
  {
    code: 'MR-20260629-006',
    workOrder: 'MO-20260629-006',
    product: 'PLA 1.75mm 哑光黑耗材',
    materials: [
      { name: 'PLA 原生粒子', qty: '215 kg', status: '已领料' },
      { name: '哑光黑色母', qty: '18 kg', status: '已领料' },
      { name: '纸箱 12盘装', qty: '20 个', status: '已领料' },
    ],
    warehouse: '原料仓 R 区',
    target: '挤出 A1 线边仓',
    requester: '王敏',
    status: '已领料',
    date: '2026-06-29',
  },
];

export type ProductionRecipeMaterial = {
  name: string;
  percentage: number;
  stage: string;
};

export type ProductionRecipeRow = {
  code: string;
  product: string;
  version: string;
  status: string;
  materialCount: number;
  keyMaterials: string;
  materials: ProductionRecipeMaterial[];
  scrapRate: string;
  owner: string;
  updatedAt: string;
};

export const productionRecipeRows: ProductionRecipeRow[] = [
  {
    code: 'BOM-PETG-BLK-V2',
    product: 'PETG 1.75mm 黑色耗材',
    version: 'v2',
    status: '启用',
    materialCount: 4,
    keyMaterials: 'PETG 原生粒子、黑色色母、增韧助剂、小盘线轴',
    materials: [
      { name: 'PETG 原生粒子', percentage: 91, stage: '精准配方配料' },
      { name: '黑色色母', percentage: 5, stage: '精准配方配料' },
      { name: '增韧助剂', percentage: 2, stage: '精准配方配料' },
      { name: '1kg 小盘线轴', percentage: 2, stage: '复绕/打包' },
    ],
    scrapRate: '2.5%',
    owner: '周宁',
    updatedAt: '2026-06-30',
  },
  {
    code: 'BOM-PLA-WHT-V1',
    product: 'PLA 1.75mm 珍珠白耗材',
    version: 'v1',
    status: '启用',
    materialCount: 4,
    keyMaterials: 'PLA 原生粒子、珍珠白色母、干燥剂、小盘线轴',
    materials: [
      { name: 'PLA 原生粒子', percentage: 90, stage: '精准配方配料' },
      { name: '珍珠白色母', percentage: 6, stage: '精准配方配料' },
      { name: '干燥剂', percentage: 1, stage: '干燥+高速混料' },
      { name: '1kg 小盘线轴', percentage: 3, stage: '复绕/打包' },
    ],
    scrapRate: '2.0%',
    owner: '赵云',
    updatedAt: '2026-06-30',
  },
  {
    code: 'BOM-ABS-GRY-V1',
    product: 'ABS 1.75mm 工业灰耗材',
    version: 'v1',
    status: '启用',
    materialCount: 4,
    keyMaterials: 'ABS 原生粒子、工业灰色母、增韧助剂、大盘收卷轴',
    materials: [
      { name: 'ABS 原生粒子', percentage: 92, stage: '精准配方配料' },
      { name: '工业灰色母', percentage: 5, stage: '精准配方配料' },
      { name: '增韧助剂', percentage: 2, stage: '干燥+高速混料' },
      { name: '大盘收卷轴', percentage: 1, stage: '牵引整平+母卷收卷' },
    ],
    scrapRate: '3.0%',
    owner: '李强',
    updatedAt: '2026-06-29',
  },
  {
    code: 'BOM-PETG-CLEAR-V1',
    product: 'PETG 1.75mm 透明耗材',
    version: 'v1',
    status: '草稿',
    materialCount: 3,
    keyMaterials: 'PETG 原生粒子、透明增强助剂、小盘线轴',
    materials: [
      { name: 'PETG 原生粒子', percentage: 96, stage: '精准配方配料' },
      { name: '透明增强助剂', percentage: 2, stage: '干燥+高速混料' },
      { name: '1kg 小盘线轴', percentage: 2, stage: '复绕/打包' },
    ],
    scrapRate: '2.2%',
    owner: '王悦',
    updatedAt: '2026-06-29',
  },
  {
    code: 'BOM-PLA-MBK-V1',
    product: 'PLA 1.75mm 哑光黑耗材',
    version: 'v1',
    status: '启用',
    materialCount: 4,
    keyMaterials: 'PLA 原生粒子、哑光黑色母、干燥剂、纸箱',
    materials: [
      { name: 'PLA 原生粒子', percentage: 89, stage: '精准配方配料' },
      { name: '哑光黑色母', percentage: 7, stage: '精准配方配料' },
      { name: '干燥剂', percentage: 1, stage: '干燥+高速混料' },
      { name: '纸箱 12盘装', percentage: 3, stage: '打包抽检' },
    ],
    scrapRate: '2.0%',
    owner: '王敏',
    updatedAt: '2026-06-29',
  },
];

export type ProductionProcessStepRow = {
  code: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  owner: string;
};

export const productionProcessStepRows: ProductionProcessStepRow[] = [
  {
    code: 'STEP-RAW-QC',
    name: '原料入库检验',
    description: '来料批次、含水率、色差、重量和隔离要求确认。',
    status: '启用',
    createdAt: '2026-06-20',
    updatedAt: '2026-06-20',
    owner: '张三',
  },
  {
    code: 'STEP-FORMULA-WEIGH',
    name: '精准配方配料',
    description: '按生产工单和配方比例称量主料、色母和功能助剂。',
    status: '启用',
    createdAt: '2026-06-20',
    updatedAt: '2026-06-20',
    owner: '张三',
  },
  {
    code: 'STEP-DRY-MIX',
    name: '干燥+高速混料',
    description: '按材料要求控制干燥温度、时间和混料均匀性。',
    status: '启用',
    createdAt: '2026-06-20',
    updatedAt: '2026-06-20',
    owner: '李四',
  },
  {
    code: 'STEP-EXTRUDE',
    name: '挤出拉丝成型',
    description: '控制分段温区、挤出压力和线材成型稳定性。',
    status: '启用',
    createdAt: '2026-06-20',
    updatedAt: '2026-06-20',
    owner: '李四',
  },
  {
    code: 'STEP-COOL-GAUGE',
    name: '水冷定型+在线测径',
    description: '控制水槽温度，使用激光测径仪实时监控线径。',
    status: '启用',
    createdAt: '2026-06-20',
    updatedAt: '2026-06-20',
    owner: '王五',
  },
  {
    code: 'STEP-WINDING',
    name: '牵引整平+母卷收卷',
    description: '保持牵引张力和排线状态，完成母卷收卷。',
    status: '启用',
    createdAt: '2026-06-20',
    updatedAt: '2026-06-20',
    owner: '王五',
  },
  {
    code: 'STEP-FINAL-PACK',
    name: '终检包装',
    description: '完成外观、标签、批次追溯和包装复核。',
    status: '启用',
    createdAt: '2026-06-18',
    updatedAt: '2026-06-18',
    owner: '赵云',
  },
  {
    code: 'STEP-OLD-TEST',
    name: '旧版试验步骤',
    description: '保留历史模板引用，不再用于新建单据选择。',
    status: '停用',
    createdAt: '2026-05-30',
    updatedAt: '2026-05-30',
    owner: '赵云',
  },
];

export type ProductionProcessTemperatureZone = {
  label: string;
  value: string;
  emphasized?: boolean;
};

export type ProductionProcessTemperatureGroup = {
  label: string;
  tolerance: string;
  zones: ProductionProcessTemperatureZone[];
};

export type ProductionProcessOperationDetail = {
  sequence: number;
  name: string;
  equipment: string;
  operation: string;
  control: string;
  defectPrevention: string;
  positionRequirement: string;
};

export type ProductionProcessTemplateRow = {
  code: string;
  name: string;
  productFamily: string;
  lineType: string;
  version: string;
  status: string;
  owner: string;
  updatedAt: string;
  processNote: string;
  steps: Array<{ name: string; standardTime: string; qcPoint: string }>;
  temperatureGroups: ProductionProcessTemperatureGroup[];
  operationDetails: ProductionProcessOperationDetail[];
};

export const productionProcessTemplateRows: ProductionProcessTemplateRow[] = [
  {
    code: 'PRC-FILAMENT-PETG-V2',
    name: 'PETG 大盘收卷+复绕工艺',
    productFamily: 'PETG 耗材',
    lineType: '挤出产线',
    version: 'v2',
    status: '启用',
    owner: '周宁',
    updatedAt: '2026-06-30',
    processNote: 'PETG 默认先收大盘，按批次进入大盘暂存；现场确认可转小盘后集中复绕，最终小盘质检和打包抽检合格后入库。',
    steps: [
      { name: '备料领料', standardTime: '30 分钟', qcPoint: '原料批次/色母批次复核' },
      { name: '开机首件', standardTime: '15 分钟', qcPoint: '开机初段样、颜色、线径、外观、工艺参数' },
      { name: '挤出拉丝', standardTime: '连续生产', qcPoint: '生产巡检：线径、颜色、压力、温区' },
      { name: '大盘收卷', standardTime: '连续生产', qcPoint: 'WIP 检查：线径趋势、外观、污染风险' },
      { name: '复绕小盘', standardTime: '按批复绕', qcPoint: '小盘质检：重量、绕线、标签、批次' },
      { name: '打包抽检', standardTime: '30 分钟/批', qcPoint: '箱标、盘标、抽样小盘、批次一致' },
    ],
    temperatureGroups: [
      {
        label: 'PETG 前段温区',
        tolerance: '±8℃',
        zones: [
          { label: '水槽', value: '60' },
          { label: '1区', value: '220' },
          { label: '2区', value: '225' },
          { label: '3区', value: '230' },
          { label: '4区', value: '230' },
        ],
      },
      {
        label: 'PETG 后段温区',
        tolerance: '±8℃',
        zones: [
          { label: '5区', value: '225' },
          { label: '6区', value: '220', emphasized: true },
          { label: '7区', value: '215' },
          { label: '模头', value: '225', emphasized: true },
        ],
      },
    ],
    operationDetails: [],
  },
  {
    code: 'PRC-FILAMENT-PLA-V1',
    name: 'PLA 直接小盘收卷工艺',
    productFamily: 'PLA 耗材',
    lineType: '挤出产线',
    version: 'v1',
    status: '启用',
    owner: '赵云',
    updatedAt: '2026-06-30',
    processNote: 'PLA 小批量或客户急单可直接小盘收卷，首件放行后分次报工，小盘质检合格后进入打包抽检。',
    steps: [
      { name: '备料领料', standardTime: '25 分钟', qcPoint: '原料批次/干燥状态复核' },
      { name: '开机首件', standardTime: '15 分钟', qcPoint: '开机初段样、颜色、线径、外观、工艺参数' },
      { name: '挤出拉丝', standardTime: '连续生产', qcPoint: '生产巡检：线径、颜色、温区、牵引速度' },
      { name: '小盘收卷', standardTime: '连续生产', qcPoint: '小盘质检：重量、绕线、标签、批次' },
      { name: '打包抽检', standardTime: '30 分钟/批', qcPoint: '包装规格、外箱、标签和批次一致' },
    ],
    temperatureGroups: [
      {
        label: 'PLA 前段温区',
        tolerance: '±6℃',
        zones: [
          { label: '水槽', value: '50' },
          { label: '1区', value: '185' },
          { label: '2区', value: '190' },
          { label: '3区', value: '195' },
          { label: '4区', value: '200' },
        ],
      },
      {
        label: 'PLA 后段温区',
        tolerance: '±6℃',
        zones: [
          { label: '5区', value: '200' },
          { label: '6区', value: '198', emphasized: true },
          { label: '7区', value: '195' },
          { label: '模头', value: '200', emphasized: true },
        ],
      },
    ],
    operationDetails: [],
  },
  {
    code: 'PRC-FILAMENT-ABS-V1',
    name: 'ABS 大盘收卷+复绕工艺',
    productFamily: 'ABS 耗材',
    lineType: '挤出产线',
    version: 'v1',
    status: '启用',
    owner: '李强',
    updatedAt: '2026-06-29',
    processNote: 'ABS 默认大盘收卷，进入大盘暂存后按批次确认可转小盘并复绕；生产巡检重点关注温区、气味排风和线径稳定。',
    steps: [
      { name: '备料领料', standardTime: '30 分钟', qcPoint: 'ABS 原料批次、色母、排风状态复核' },
      { name: '开机首件', standardTime: '20 分钟', qcPoint: '开机初段样、颜色、线径、外观、工艺参数' },
      { name: '挤出拉丝', standardTime: '连续生产', qcPoint: '生产巡检：温区、压力、线径和外观' },
      { name: '大盘收卷', standardTime: '连续生产', qcPoint: 'WIP 检查：收卷状态、污染风险、线径趋势' },
      { name: '复绕小盘', standardTime: '按批复绕', qcPoint: '小盘质检：重量、绕线、标签、批次' },
      { name: '打包抽检', standardTime: '30 分钟/批', qcPoint: '包装规格、箱标、批次一致' },
    ],
    temperatureGroups: [
      {
        label: 'ABS 前段温区',
        tolerance: '±8℃',
        zones: [
          { label: '水槽', value: '55' },
          { label: '1区', value: '225' },
          { label: '2区', value: '230' },
          { label: '3区', value: '235' },
          { label: '4区', value: '240' },
        ],
      },
      {
        label: 'ABS 后段温区',
        tolerance: '±8℃',
        zones: [
          { label: '5区', value: '238' },
          { label: '6区', value: '235', emphasized: true },
          { label: '7区', value: '232' },
          { label: '模头', value: '238', emphasized: true },
        ],
      },
    ],
    operationDetails: [],
  },
  {
    code: 'PRC-FILAMENT-PLA-PETG-V1',
    name: 'PLA/PETG 挤出拉丝工艺',
    productFamily: '3D 打印耗材',
    lineType: '挤出产线',
    version: 'v1',
    status: '启用',
    owner: '周宁',
    updatedAt: '2026-06-24',
    processNote: '用于 PLA、PETG 线材从原料检验到母卷收卷的标准工艺，重点维护温区、干燥、测径和张力控制。',
    steps: [
      { name: '原料入库检验', standardTime: '20 分钟', qcPoint: '含水率/批次台账' },
      { name: '精准配方配料', standardTime: '25 分钟', qcPoint: '配方双人复核' },
      { name: '干燥+高速混料', standardTime: '6 小时', qcPoint: '干燥温度/混料均匀' },
      { name: '挤出拉丝成型', standardTime: '连续生产', qcPoint: '温区/压力稳定' },
      { name: '水冷定型+在线测径', standardTime: '连续监控', qcPoint: '1.75±0.02mm' },
      { name: '牵引整平+母卷收卷', standardTime: '连续生产', qcPoint: '张力/排线状态' },
    ],
    temperatureGroups: [
      {
        label: '前段温区',
        tolerance: '±10℃',
        zones: [
          { label: '水槽', value: '60' },
          { label: '10区', value: '200' },
          { label: '9区', value: '210' },
          { label: '4区', value: '200' },
          { label: '3区', value: '195' },
          { label: '2区', value: '190' },
          { label: '1区', value: '185' },
        ],
      },
      {
        label: '后段温区',
        tolerance: '±10℃',
        zones: [
          { label: '13区', value: '210' },
          { label: '12区', value: '200' },
          { label: '11区', value: '210' },
          { label: '8区', value: '200' },
          { label: '7区', value: '195' },
          { label: '6区', value: '190', emphasized: true },
          { label: '5区', value: '185', emphasized: true },
        ],
      },
    ],
    operationDetails: [
      {
        sequence: 1,
        name: '原料入库检验',
        equipment: '含水率测试仪、色差对比卡、称重仪',
        operation: '1. 验收全新粒子、回收粒子、色母、功能助剂（增韧、香味）\n2. 抽检原料含水率\n3. 不合格原料退回/隔离存放',
        control: '1. PLA 含水率≤0.02%，PETG 含水率≤0.05%\n2. 原料批次统一，禁止混批次投料',
        defectPrevention: '原料含水→起泡、断料\n原料不纯→断丝\n预防：批次分区存放，来料必检',
        positionRequirement: '仓储/质检轮岗，做好原料批次台账',
      },
      {
        sequence: 2,
        name: '精准配方配料',
        equipment: '高精度电子秤、配料台',
        operation: '1. 根据生产工单配比主料、色母、功能助剂\n2. 分类装桶、标识型号',
        control: '1. 色母比例误差≤±0.1\n2. 功能助剂按标准工艺配比，禁止随意加减',
        defectPrevention: '配比偏差→色差、韧性不达标、打印拉丝\n预防：配料双人复核、工单对照',
        positionRequirement: '熟悉各型号耗材配方，严格按单配料',
      },
      {
        sequence: 3,
        name: '干燥+高速混料（改性预处理）',
        equipment: '除湿干燥机、高速混料机',
        operation: '1. 针对材料特性设定干燥温度、时长\n2. 高速搅拌混合原料与助剂，保证分散均匀\n3. 高端改性款完成双螺杆造粒改性、冷却切粒',
        control: '1. PLA 干燥：55℃-60℃ 4-6h\n2. PETG 干燥：65℃-70℃ 6h\n3. 混料无结块、无局部色母团聚',
        defectPrevention: '混料不均→干燥不足→成品气泡、发泡断丝',
        positionRequirement: '严格控温控时，混料后静置降温备用',
      },
      {
        sequence: 4,
        name: '挤出拉丝成型',
        equipment: '单螺杆挤出机、定制模头',
        operation: '1. 改性粒子自动上料\n2. 分段升温熔融塑化\n3. 匀速挤出圆形线材坯料',
        control: '1. 各区段温度按材料标准设定（PLA/PETG/ABS）\n2. 挤出压力稳定，无忽快忽慢',
        defectPrevention: '温度过高→焦\n温度过低→塑化不良、粗细不均',
        positionRequirement: '熟悉设备温控参数，实时观察挤出状态',
      },
      {
        sequence: 5,
        name: '水冷定型+在线测径',
        equipment: '恒温冷却水槽、激光测径仪',
        operation: '1. 线材匀速进入水循环冷却槽\n2. 激光测径仪 24h 实时监测线径数据\n3. 自动微调牵引速度，修正线径偏差',
        control: '1. 成品标准公差：1.75±0.02 mm\n2. 水温恒温，避免冷却波动导致\n3. 实时剔除超差段线材',
        defectPrevention: '水温不稳→线径忽粗忽细\n测径失效→批量不良品',
        positionRequirement: '每小时查看测径数据，设备定时校准',
      },
      {
        sequence: 6,
        name: '牵引整平+大盘母卷收卷',
        equipment: '牵引机、大盘收卷机',
        operation: '1. 精准匀速牵引，拉直线材，保证恒张力排线整齐\n2. 标记生产批次，便于追溯',
        control: '1. 张力恒定，不拉伸、不松弛\n2. 大盘排线紧密整齐，无叠线、压线',
        defectPrevention: '张力过大→线材排线乱→复绕卡线、打结',
        positionRequirement: '全程观察排线状态，及时微调张力',
      },
    ],
  },
];
