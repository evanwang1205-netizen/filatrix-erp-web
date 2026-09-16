const apiBase = (process.env.FILATRIX_API_BASE || 'http://127.0.0.1:5175/api').replace(/\/$/, '');
const account = process.env.FILATRIX_ACCOUNT || 'ACC-PRODUCTION';
const refreshDraft = process.argv.includes('--refresh');

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function material(lineId, materialCode, materialName, requestedQty, unit, purpose) {
  return { lineId, materialCode, materialName, requestedQty, unit, purpose };
}

const sourceTask = {
  code: 'PT2-260805-901',
  command: 'submit',
  sourceType: '手工新建',
  deliveryDate: '2026-08-12',
  priority: '加急',
  ownerEmployeeCode: 'EMP-ZN',
  owner: '周宁',
  note: '备料申请测试来源：大批量哑光黑耗材生产，用于验证任务采购缺口只能申请一次。',
  products: [{
    lineId: 'PT2-260805-901-L1',
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    model: 'PLA-175-MBK-1KG',
    spec: '线径 1.75mm，净重 1kg，哑光黑',
    demandQty: 2000,
    unit: '卷',
    recipeCode: 'BOM-PLA-175-MBK-V1',
  }],
};

const requestSeeds = [
  {
    code: 'PMR2-260805-901',
    command: 'submit',
    requestType: '任务缺口补料',
    sourceTaskCode: sourceTask.code,
    sourceDocument: '手工排产测试',
    expectedDate: '2026-08-10',
    note: '由生产任务当前净采购缺口自动形成，物料和数量由系统重算。',
    lines: [],
  },
  {
    code: 'PMR2-260805-902',
    command: 'submit',
    requestType: '临时备料',
    expectedDate: '2026-08-08',
    note: '包装切换临时备料：同一外箱用于两类用途，验证共享库存依次覆盖且不重复计算。',
    lines: [
      material('PMR2-260805-902-L1', 'M-PKG-CARTON-12', '外箱 12卷装', 200, '个', '本周常规出货包装'),
      material('PMR2-260805-902-L2', 'M-PKG-CARTON-12', '外箱 12卷装', 120, '个', '展会样品集中包装'),
    ],
  },
  {
    code: 'PMR2-260805-903',
    command: 'submit',
    requestType: '试产备料',
    expectedDate: '2026-08-15',
    note: '小批试产包装准备，当前可用库存可以完全覆盖，不生成采购申请。',
    lines: [
      material('PMR2-260805-903-L1', 'M-PKG-VAC-BAG-1KG', '真空包装袋 1kg', 1000, '个', '透明 PETG 试产包装'),
      material('PMR2-260805-903-L2', 'M-AM-DESICCANT', '干燥剂 5g', 600, '个', '试产成品防潮'),
    ],
  },
  {
    code: 'PMR2-260805-904',
    command: 'submit',
    requestType: '损耗补料',
    expectedDate: '2026-08-18',
    note: '开机清线与换色损耗补料，系统评估后由现有库存完全覆盖。',
    lines: [
      material('PMR2-260805-904-L1', 'M-RM-PLA-VIRGIN', 'PLA 原生粒子', 6.5, 'kg', '开机清线与换色损耗'),
      material('PMR2-260805-904-L2', 'M-CM-MATTE-BLK', '哑光黑色母', 0.4, 'kg', '色母调机损耗'),
    ],
  },
  {
    code: 'PMR2-260805-905',
    command: 'save',
    requestType: '返工补料',
    expectedDate: '2026-08-19',
    note: '待返工方案确认后提交；草稿不评估库存，也不生成采购申请。',
    lines: [
      material('PMR2-260805-905-L1', 'M-PKG-SPOOL-1KG', '小盘线轴 1kg', 80, '个', '返工换盘备用'),
      material('PMR2-260805-905-L2', 'M-PKG-VAC-BAG-1KG', '真空包装袋 1kg', 80, '个', '返工成品重新包装'),
    ],
  },
];

async function ensureSourceTask() {
  const tasks = (await request('/production/tasks')).items || [];
  if (tasks.some((item) => item.code === sourceTask.code)) return sourceTask.code;
  const created = await request('/production/tasks', {
    method: 'POST',
    body: {
      ...sourceTask,
      idempotencyKey: `seed-production-material-request-demo:task:${sourceTask.code}`,
    },
  });
  return created.record.code;
}

async function main() {
  await ensureSourceTask();
  let existing = (await request('/production/material-requests')).items || [];
  const created = [];
  const retained = [];

  for (const seed of requestSeeds) {
    const current = existing.find((item) => item.code === seed.code);
    if (current) {
      if (refreshDraft && current.status === '草稿' && seed.command === 'save') {
        await request(`/production/material-requests/${encodeURIComponent(seed.code)}`, {
          method: 'PUT',
          body: {
            ...seed,
            revision: current.revision,
            idempotencyKey: `seed-production-material-request-demo:refresh:${seed.code}:${Date.now()}`,
          },
        });
        retained.push(`${seed.code}（已刷新草稿）`);
      } else {
        retained.push(seed.code);
      }
      continue;
    }
    const response = await request('/production/material-requests', {
      method: 'POST',
      body: {
        ...seed,
        idempotencyKey: `seed-production-material-request-demo:${seed.code}`,
      },
    });
    created.push(response.record.code);
    existing = response.items || [...existing, response.record];
  }

  const result = (await request('/production/material-requests')).items || [];
  const demos = result.filter((item) => requestSeeds.some((seed) => seed.code === item.code));
  const byCode = new Map(demos.map((item) => [item.code, item]));
  const taskGap = byCode.get('PMR2-260805-901');
  const sharedStock = byCode.get('PMR2-260805-902');
  const covered = byCode.get('PMR2-260805-903');
  const lossCovered = byCode.get('PMR2-260805-904');
  const draft = byCode.get('PMR2-260805-905');

  assert(taskGap?.requestType === '任务缺口补料' && taskGap.status === '已转采购', '任务缺口样本未按固定类型转采购');
  assert(taskGap.lines?.every((line) => Number(line.purchaseQty) === Number(line.requestedQty)), '任务缺口样本没有保留净采购缺口');
  assert(sharedStock?.status === '已转采购' && sharedStock.lines?.length === 2, '同物料共享库存样本未形成部分覆盖');
  assert(sharedStock.lines.every((line) => Number(line.availableQty) + Number(line.purchaseQty) === Number(line.requestedQty)), '同物料共享库存样本数量不守恒');
  assert(covered?.status === '库存可满足' && !covered.linkedPurchaseRequisition, '库存覆盖样本错误生成采购申请');
  assert(lossCovered?.status === '库存可满足' && !lossCovered.linkedPurchaseRequisition, '损耗补料样本没有形成库存覆盖结果');
  assert(draft?.status === '草稿' && draft.lines?.every((line) => Number(line.availableQty || 0) === 0 && Number(line.purchaseQty || 0) === 0), '草稿样本提前执行了库存评估');

  console.log(JSON.stringify({
    sourceTask: sourceTask.code,
    created,
    retained,
    demos: demos.map((item) => ({
      code: item.code,
      type: item.requestType,
      status: item.status,
      lineCount: item.lines?.length || 0,
      purchaseRequisition: item.linkedPurchaseRequisition || '',
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
