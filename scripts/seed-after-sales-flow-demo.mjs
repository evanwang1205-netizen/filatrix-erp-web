const apiBase = (process.env.FILATRIX_API_BASE || 'http://127.0.0.1:5175/api').replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method || 'GET',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path}: HTTP ${response.status} ${payload.error || ''}`.trim());
  }
  return payload;
}

function affectedProduct(product, quantity) {
  return {
    sourceLineId: product.lineId || product.sourceLineId,
    materialCode: product.materialCode,
    name: product.name,
    model: product.model || '',
    spec: product.spec || '',
    qty: `${quantity} ${product.uom}`,
    uom: product.uom,
  };
}

async function caseList(kind) {
  return (await request(`/${kind}/after-sales`)).items || [];
}

async function caseDetail(kind, code) {
  return (await request(`/${kind}/after-sales/${encodeURIComponent(code)}`)).record;
}

async function ensureCase({
  kind,
  sourceOrder,
  marker,
  quantity,
  issueType,
  issueDescription,
  plan,
}) {
  const existing = (await caseList(kind)).find((record) => String(record.issueDescription || '').includes(marker));
  let record = existing ? await caseDetail(kind, existing.code) : null;

  if (!record) {
    const source = (await request(`/${kind}/orders/${encodeURIComponent(sourceOrder)}`)).order;
    const product = source.products?.[0];
    if (!product) throw new Error(`${sourceOrder} 没有可用于售后测试的物料明细。`);
    const created = await request(`/${kind}/after-sales`, {
      method: 'POST',
      body: {
        code: '系统自动生成',
        sourceOrder,
        issueType,
        issueDescription: `${marker} ${issueDescription}`,
        owner: source.afterSalesOwner || source.owner,
        ownerEmployeeCode: source.afterSalesOwnerEmployeeCode || source.ownerEmployeeCode || '',
        products: [affectedProduct(product, quantity)],
        attachments: [],
      },
    });
    record = created.record;
  }

  if (record.status === '待受理' && !record.action) {
    record = (await request(`/${kind}/after-sales/${encodeURIComponent(record.code)}`, {
      method: 'PUT',
      body: {
        ...record,
        ...plan,
      },
    })).record;
  }

  if (record.status === '待受理') {
    record = (await request(`/${kind}/after-sales/${encodeURIComponent(record.code)}/advance`, {
      method: 'POST',
      body: { revision: record.revision },
    })).record;
  }

  return record;
}

async function task(module, afterSaleCode, kind) {
  const rows = (await request(`/${module}/after-sales-tasks`)).items || [];
  return rows.find((row) => row.afterSaleCode === afterSaleCode && row.kind === kind);
}

async function completeTask(module, afterSaleCode, kind, body) {
  const current = await task(module, afterSaleCode, kind);
  if (!current) throw new Error(`${afterSaleCode} 未生成${kind}任务。`);
  if (current.status === '已完成') return current;
  if (!['待处理', '处理中'].includes(current.status)) {
    throw new Error(`${afterSaleCode} 的${kind}当前为${current.status}，不能推进测试。`);
  }
  if (current.status === '待处理') {
    await request(`/${module}/after-sales-tasks/${encodeURIComponent(current.code)}/start`, { method: 'POST' });
  }
  const completionBody = kind === '客户退货接收'
    ? {
        ...body,
        receiptAllocations: (current.products || []).map((product, index) => ({
          allocationId: `${current.code}-B${index + 1}`,
          sourceLineId: product.sourceLineId || '',
          materialCode: product.materialCode || '',
          batch: `DEMO-RETURN-${String(index + 1).padStart(2, '0')}`,
          qty: product.qty,
          uom: product.uom || '',
        })),
      }
    : body;
  return (await request(`/${module}/after-sales-tasks/${encodeURIComponent(current.code)}/complete`, {
    method: 'POST',
    body: completionBody,
  })).task;
}

async function roleCounts() {
  const result = {};
  for (const module of ['warehouse', 'quality', 'production']) {
    const rows = (await request(`/${module}/after-sales-tasks`)).items || [];
    result[module] = rows.filter((row) => row.status !== '已取消').reduce((counts, row) => {
      counts[row.status] = (counts[row.status] || 0) + 1;
      return counts;
    }, {});
  }
  return result;
}

async function main() {
  const warehouses = (await request('/master-data/warehouses')).items || [];
  const salesReturnWarehouse = warehouses.find((warehouse) => (
    warehouse.status === '启用'
    && (warehouse.warehouseFunctions || []).includes('销售退货暂存')
  ));
  if (!salesReturnWarehouse) throw new Error('缺少启用且具备“销售退货暂存”职能的仓库。');

  const repairCase = await ensureCase({
    kind: 'sales',
    sourceOrder: 'SO-20260712-018',
    marker: '[售后流程测试·返修]',
    quantity: 3,
    issueType: '质量问题',
    issueDescription: '客户反馈三卷线材绕线松散且打印过程中出现断丝，要求返修后重新交付。',
    plan: {
      action: '返修/返工',
      goodsDisposition: '客户退回待检',
      financialTreatment: '无金额调整',
      amountImpactType: '无金额影响',
      estimatedAmount: 0,
      planNote: '客户退回后先检验，再由生产返绕，复检合格后重新出库。',
    },
  });
  await completeTask('warehouse', repairCase.code, '客户退货接收', {
    warehouseCode: salesReturnWarehouse.code,
    warehouse: salesReturnWarehouse.name,
    location: `${salesReturnWarehouse.binPrefix || 'AS'}-01`,
    evidence: 'TEST-WR-REPAIR-001：三卷退回物已清点并进入售后暂存。',
  });
  await completeTask('quality', repairCase.code, '销售退货检验', {
    disposition: '返修返工',
    evidence: 'TEST-QA-REPAIR-001：确认绕线松散，转生产返绕。',
  });
  const productionTask = await task('production', repairCase.code, '售后返修或返工');
  if (!productionTask || productionTask.status !== '待处理') {
    throw new Error(`${repairCase.code} 未正确释放生产售后返修任务。`);
  }

  const qualityCase = await ensureCase({
    kind: 'sales',
    sourceOrder: 'SO-20260528-008',
    marker: '[售后流程测试·退货检验]',
    quantity: 4,
    issueType: '外观问题',
    issueDescription: '客户退回四卷外箱破损物料，需要确认内包装和线材本体能否再次销售。',
    plan: {
      action: '退货退款',
      goodsDisposition: '客户退回待检',
      financialTreatment: '退款',
      amountImpactType: '退款',
      estimatedAmount: 320,
      planNote: '仓库接收后由质检判断可再次销售或报废，再由财务按最终数量退款。',
    },
  });
  await completeTask('warehouse', qualityCase.code, '客户退货接收', {
    warehouseCode: salesReturnWarehouse.code,
    warehouse: salesReturnWarehouse.name,
    location: `${salesReturnWarehouse.binPrefix || 'AS'}-01`,
    evidence: 'TEST-WR-QUALITY-001：四卷退货已清点并冻结待检。',
  });
  const qualityTask = await task('quality', qualityCase.code, '销售退货检验');
  if (!qualityTask || qualityTask.status !== '待处理') {
    throw new Error(`${qualityCase.code} 未正确释放售后检验任务。`);
  }

  const purchaseReturnCase = await ensureCase({
    kind: 'purchase',
    sourceOrder: 'PO-20260625-009',
    marker: '[售后流程测试·采购退货]',
    quantity: 20,
    issueType: '来料质量',
    issueDescription: '抽检发现二十公斤哑光黑色母分散性不稳定，采购与供应商确认退货退款。',
    plan: {
      action: '退货退款',
      goodsDisposition: '退回供应商',
      financialTreatment: '供应商退款',
      amountImpactType: '退款',
      estimatedAmount: 760,
      planNote: '仓库从实际存放批次退回供应商，财务随后处理应付调整或供应商退款。',
    },
  });
  const purchaseWarehouseTask = await task('warehouse', purchaseReturnCase.code, '采购退货出库');
  if (!purchaseWarehouseTask || purchaseWarehouseTask.status !== '待处理') {
    throw new Error(`${purchaseReturnCase.code} 未正确释放采购退货出库任务。`);
  }

  console.log(JSON.stringify({
    createdOrReused: {
      repair: repairCase.code,
      quality: qualityCase.code,
      purchaseReturn: purchaseReturnCase.code,
    },
    readyForManualTest: {
      production: productionTask.code,
      quality: qualityTask.code,
      warehouse: purchaseWarehouseTask.code,
    },
    roleCounts: await roleCounts(),
  }, null, 2));
}

await main();
