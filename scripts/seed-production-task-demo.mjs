const apiBase = (process.env.FILATRIX_API_BASE || 'http://127.0.0.1:5175/api').replace(/\/$/, '');
const account = process.env.FILATRIX_ACCOUNT || 'ACC-ZHANGSAN';
const refreshDemo = process.argv.includes('--refresh');

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      'x-filatrix-account': account,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path}: HTTP ${response.status} ${payload.error || payload.message || ''}`.trim());
  }
  return payload;
}

function product(lineId, productCode, productName, model, spec, demandQty, recipeCode, inboundQty = 0) {
  return {
    lineId,
    productCode,
    productName,
    model,
    spec,
    demandQty,
    inboundQty,
    unit: '卷',
    recipeCode,
  };
}

function material(materialCode, materialName, estimatedQty, unit, options = {}) {
  return {
    lineId: options.lineId || `MAT-${materialCode}`,
    materialCode,
    materialName,
    estimatedQty,
    perUnitQty: options.perUnitQty || 0,
    availableQty: options.availableQty || 0,
    shortageQty: options.shortageQty || Math.max(0, estimatedQty - (options.availableQty || 0)),
    pendingInboundQty: options.pendingInboundQty || 0,
    qcPendingQty: options.qcPendingQty || 0,
    inTransitQty: options.inTransitQty || 0,
    reservedQty: options.reservedQty || 0,
    allocatedQty: options.allocatedQty || 0,
    procurementGapQty: options.procurementGapQty,
    incomingQcRequired: options.incomingQcRequired !== false,
    unit,
    status: options.status || '需采购',
  };
}

const tasks = [
  {
    code: 'PT2-260803-001',
    command: 'submit',
    sourceType: '手工新建',
    sourceCode: '',
    sourceLineId: '',
    createdAt: '2026-08-03 09:20',
    deliveryDate: '2026-08-16',
    priority: '加急',
    owner: '周宁',
    note: '多成品联合生产测试：覆盖三种成品、共享原料、不同备料状态与逐行建工单。',
    products: [
      product('PT2-260803-001-L1', 'M-FG-PLA-175-MBK', 'PLA 1.75mm 哑光黑耗材 1kg', 'PLA-175-MBK-1KG', '线径 1.75mm，净重 1kg，哑光黑', 120, 'BOM-PLA-175-MBK-V1'),
      product('PT2-260803-001-L2', 'M-FG-PLA-175-WHT', 'PLA 1.75mm 珍珠白耗材 1kg', 'PLA-175-WHT-1KG', '线径 1.75mm，净重 1kg，珍珠白', 96, 'BOM-PLA-175-WHT-V1'),
      product('PT2-260803-001-L3', 'M-FG-PETG-175-CLR', 'PETG 1.75mm 透明耗材 1kg', 'PETG-175-CLR-1KG', '线径 1.75mm，净重 1kg，透明', 80, 'BOM-PETG-175-CLR-V1'),
    ],
    materialNeeds: [
      material('M-RM-PETG-VIRGIN', 'PETG 原生粒子', 79.2, 'kg', { availableQty: 40, pendingInboundQty: 45, procurementGapQty: 0, status: '待仓库入库' }),
      material('M-RM-PLA-VIRGIN', 'PLA 原生粒子', 208.32, 'kg', { availableQty: 260, shortageQty: 0, procurementGapQty: 0, status: '可齐套' }),
      material('M-CM-MATTE-BLK', '哑光黑色母', 4.8, 'kg', { availableQty: 2, qcPendingQty: 3, procurementGapQty: 0, status: '待质检放行' }),
      material('M-CM-PEARL-WHT', '珍珠白色母', 2.88, 'kg', { availableQty: 8, shortageQty: 0, procurementGapQty: 0, status: '可齐套' }),
      material('M-AM-CLEAR-ENH', '透明增强助剂', 0.8, 'kg', { availableQty: 18, shortageQty: 0, procurementGapQty: 0, status: '可齐套' }),
      material('M-PKG-SPOOL-1KG', '小盘线轴 1kg', 296, '个', { availableQty: 220, inTransitQty: 40, procurementGapQty: 36, status: '需采购', incomingQcRequired: false }),
    ],
  },
  {
    code: 'PT2-260803-002',
    command: 'save',
    sourceType: '手工新建',
    sourceCode: '',
    sourceLineId: '',
    createdAt: '2026-08-03 10:05',
    deliveryDate: '2026-08-22',
    priority: '正常',
    owner: '周宁',
    note: '草稿测试：用于核对新建任务、编辑与提交前的字段完整性。',
    products: [
      product('PT2-260803-002-L1', 'M-FG-PLA-175-WHT', 'PLA 1.75mm 珍珠白耗材 1kg', 'PLA-175-WHT-1KG', '线径 1.75mm，净重 1kg，珍珠白', 36, 'BOM-PLA-175-WHT-V1'),
      product('PT2-260803-002-L2', 'M-FG-PLA-175-MBK', 'PLA 1.75mm 哑光黑耗材 1kg', 'PLA-175-MBK-1KG', '线径 1.75mm，净重 1kg，哑光黑', 24, 'BOM-PLA-175-MBK-V1'),
    ],
    materialNeeds: [
      material('M-RM-PLA-VIRGIN', 'PLA 原生粒子', 57.6, 'kg', { availableQty: 180, shortageQty: 0, procurementGapQty: 0, status: '可齐套' }),
      material('M-CM-PEARL-WHT', '珍珠白色母', 1.44, 'kg', { availableQty: 8, shortageQty: 0, procurementGapQty: 0, status: '可齐套' }),
      material('M-CM-MATTE-BLK', '哑光黑色母', 0.96, 'kg', { availableQty: 42, shortageQty: 0, procurementGapQty: 0, status: '可齐套' }),
    ],
  },
  {
    code: 'PT2-260701-001',
    command: 'submit',
    sourceType: '手工新建',
    sourceCode: '',
    sourceLineId: '',
    createdAt: '2026-07-01 08:40',
    deliveryDate: '2026-07-04',
    priority: '加急',
    owner: '李四',
    note: '补齐现有生产工单的来源任务，覆盖已建单、部分完工入库场景。',
    products: [
      product('PT2-260701-001-L1', 'M-FG-PLA-175-MBK', 'PLA 1.75mm 哑光黑耗材 1kg', 'PLA-175-MBK-1KG', '线径 1.75mm，净重 1kg，哑光黑', 118, 'BOM-PLA-175-MBK-V1', 30),
    ],
    materialNeeds: [
      material('M-RM-PLA-VIRGIN', 'PLA 原生粒子', 113.28, 'kg', { availableQty: 280, shortageQty: 0, procurementGapQty: 0, status: '可齐套' }),
      material('M-CM-MATTE-BLK', '哑光黑色母', 4.72, 'kg', { availableQty: 42, shortageQty: 0, procurementGapQty: 0, status: '可齐套' }),
    ],
  },
  {
    code: 'PT2-260715-006',
    command: 'submit',
    sourceType: '销售订单缺口',
    sourceCode: 'SO-20260715-022',
    sourceLineId: 'L1',
    createdAt: '2026-07-15 11:25',
    deliveryDate: '2026-07-26',
    priority: '加急',
    owner: '周敏',
    note: '销售订单缺口生产；计划工单已建立，释放数量由当前可用物料决定。',
    products: [
      product('L1', 'M-FG-PETG-175-CLR', 'PETG 1.75mm 透明耗材 1kg', 'PETG-175-CLR-1KG', '线径 1.75mm，净重 1kg，透明', 180, 'BOM-PETG-175-CLR-V1'),
    ],
    materialNeeds: [
      material('M-RM-PETG-VIRGIN', 'PETG 原生粒子', 178.2, 'kg', { availableQty: 0, pendingInboundQty: 178.2, procurementGapQty: 0, status: '待仓库入库' }),
      material('M-AM-CLEAR-ENH', '透明增强助剂', 1.8, 'kg', { availableQty: 18, shortageQty: 0, procurementGapQty: 0, status: '可齐套' }),
    ],
  },
  {
    code: 'PT2-260701-003',
    command: 'submit',
    sourceType: '安全库存补货',
    sourceCode: 'WMR-00002',
    sourceLineId: 'M-FG-PLA-175-WHT',
    sourceReplenishmentCode: 'WMR-00002',
    sourceWarehouseCode: 'WH-FG',
    sourceWarehouseName: '成品仓',
    createdAt: '2026-07-01 10:10',
    deliveryDate: '2026-07-10',
    priority: '正常',
    owner: '赵敏',
    note: '安全库存补货测试；已建 8 卷工单，仍有 232 卷待建工单。',
    products: [
      product('PT2-260701-003-L1', 'M-FG-PLA-175-WHT', 'PLA 1.75mm 珍珠白耗材 1kg', 'PLA-175-WHT-1KG', '线径 1.75mm，净重 1kg，珍珠白', 240, 'BOM-PLA-175-WHT-V1'),
    ],
    materialNeeds: [
      material('M-RM-PLA-VIRGIN', 'PLA 原生粒子', 230.4, 'kg', { availableQty: 180, inTransitQty: 80, procurementGapQty: 0, status: '补充在途' }),
      material('M-CM-PEARL-WHT', '珍珠白色母', 9.6, 'kg', { availableQty: 8, qcPendingQty: 2, procurementGapQty: 0, status: '待质检放行' }),
    ],
  },
  ...[
    ['PT2-260723-101', '2026-07-28', '李四', 60],
    ['PT2-260723-102', '2026-07-27', '周敏', 48],
  ].map(([code, deliveryDate, owner, demandQty]) => ({
    code,
    command: 'submit',
    sourceType: '手工新建',
    sourceCode: '',
    sourceLineId: '',
    createdAt: `${deliveryDate.slice(0, 8)}23 09:00`,
    deliveryDate,
    priority: '正常',
    owner,
    note: '补齐现有生产工单来源任务，用于核对已建单后的安排状态。',
    products: [
      product(`${code}-L1`, 'M-FG-PLA-175-MBK', 'PLA 1.75mm 哑光黑耗材 1kg', 'PLA-175-MBK-1KG', '线径 1.75mm，净重 1kg，哑光黑', demandQty, 'BOM-PLA-175-MBK-V1'),
    ],
    materialNeeds: [
      material('M-RM-PLA-VIRGIN', 'PLA 原生粒子', demandQty * 0.96, 'kg', { availableQty: 9480, shortageQty: 0, procurementGapQty: 0, status: '可齐套' }),
      material('M-CM-MATTE-BLK', '哑光黑色母', demandQty * 0.04, 'kg', { availableQty: 300, shortageQty: 0, procurementGapQty: 0, status: '可齐套' }),
    ],
  })),
];

async function main() {
  const existing = (await request('/production/tasks')).items || [];
  const existingCodes = new Set(existing.map((item) => item.code));
  const created = [];
  const retained = [];

  for (const task of tasks) {
    if (existingCodes.has(task.code)) {
      if (refreshDemo && task.code.startsWith('PT2-260803-')) {
        const current = existing.find((item) => item.code === task.code);
        const payload = await request(`/production/tasks/${encodeURIComponent(task.code)}`, {
          method: 'PUT',
          body: {
            ...task,
            revision: current.revision,
            idempotencyKey: `seed-production-task-demo:refresh:${task.code}:${Date.now()}`,
          },
        });
        retained.push(`${payload.record.code}（已刷新）`);
        continue;
      }
      retained.push(task.code);
      continue;
    }
    const payload = await request('/production/tasks', {
      method: 'POST',
      body: {
        ...task,
        idempotencyKey: `seed-production-task-demo:${task.code}:${Date.now()}`,
      },
    });
    created.push(payload.record.code);
  }

  const result = (await request('/production/tasks')).items || [];
  console.log(JSON.stringify({ created, retained, total: result.length, codes: result.map((item) => item.code) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
