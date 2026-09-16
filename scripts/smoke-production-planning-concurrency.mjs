import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

import { createSeedData } from '../server/seed-data.mjs';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

async function requestResult(baseUrl, path, options = {}) {
  const { account = 'ACC-PRODUCTION', ...requestOptions } = options;
  const response = await fetch(`${baseUrl}${path}`, {
    ...requestOptions,
    headers: {
      accept: 'application/json',
      'x-filatrix-account': account,
      ...(requestOptions.body ? { 'content-type': 'application/json' } : {}),
    },
    body: requestOptions.body ? JSON.stringify(requestOptions.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function request(baseUrl, path, options = {}) {
  const result = await requestResult(baseUrl, path, options);
  if (!result.response.ok) {
    throw new Error(`${options.method || 'GET'} ${path}: HTTP ${result.response.status} ${result.payload.error || ''}`.trim());
  }
  return result.payload;
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const health = await request(baseUrl, '/health');
      if (health.ok) return;
    } catch {
      // Retry while the isolated API starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error('isolated API did not become healthy');
}

function addClosableWorkOrder(data) {
  const workOrderCode = 'MO2-CONCURRENCY-CLOSE-001';
  const cardCode = 'EC2-CONCURRENCY-CLOSE-001';
  data.production.workOrders.unshift({
    code: workOrderCode,
    sourceTask: 'PT2-260715-003',
    taskCode: 'PT2-260715-003',
    sourceLineId: 'PT2-260715-003-L1',
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    planQty: 10,
    qty: 10,
    unit: '卷',
    recipeCode: 'BOM-PLA-175-MBK-V1',
    processTemplateCode: 'PRC2-WIRE-DRAWING-REWIND-V1',
    plannedDate: '2026-07-30',
    dueDate: '2026-08-10',
    owner: '并发测试员',
    completedQty: 10,
    inboundQty: 10,
    releasedQty: 10,
    documentStatus: '已确认',
    status: '已完成',
    currentNode: '已入库',
    nextStep: '关闭已完成入库的生产工单',
    nextAction: '关闭已完成入库的生产工单',
    revision: 3,
    createdAt: '2026-07-30 08:00',
    updatedAt: '2026-07-30 09:00',
  });
  data.production.executionCards.unshift({
    code: cardCode,
    workOrderCode,
    productCode: 'M-FG-PLA-175-MBK',
    productName: 'PLA 1.75mm 哑光黑耗材 1kg',
    planQty: 10,
    reportedQty: 10,
    qualifiedQty: 10,
    packedQty: 10,
    releasedInboundQty: 10,
    inboundQty: 10,
    defectQty: 0,
    unit: '卷',
    node: '已入库',
    status: '已完成',
    qualityTaskCodes: [],
    revision: 3,
    updatedAt: '2026-07-30 09:00',
  });
  return { workOrderCode, cardCode };
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'filatrix-production-concurrency-'));
  const dataFile = join(tempDir, 'erp-data.json');
  const data = createSeedData();
  const closable = addClosableWorkOrder(data);
  await writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8');
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
      FILATRIX_API_HOST: '127.0.0.1',
      FILATRIX_API_PORT: String(port),
      FILATRIX_DATA_FILE: dataFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  try {
    await waitForHealth(baseUrl, child);
    const productionOwnerCandidates = await request(
      baseUrl,
      '/reference/employees?activeOnly=true&kind=production-document-owner&limit=50',
    );
    assert(
      productionOwnerCandidates.items.some((item) => item.code === 'EMP-ZN')
      && productionOwnerCandidates.items.every((item) => item.code !== 'EMP-LM'),
      'production owner reference did not enforce the production-role employee boundary',
    );
    const eligibleProductionOwners = new Map(
      productionOwnerCandidates.items.map((item) => [item.code, item.name]),
    );
    const [initialTasks, initialWorkOrders] = await Promise.all([
      request(baseUrl, '/production/tasks'),
      request(baseUrl, '/production/work-orders'),
    ]);
    assert(
      [...initialTasks.items, ...initialWorkOrders.items].every((record) => (
        eligibleProductionOwners.get(record.ownerEmployeeCode) === record.owner
      )),
      'legacy production task or work-order owners were not migrated to eligible production employees',
    );

    const taskCreateBody = {
      command: 'save',
      code: 'PT2-CONCURRENCY-001',
      revision: 0,
      idempotencyKey: 'smoke:production-task:create:1',
      sourceType: '手工新建',
      deliveryDate: '2026-08-10',
      ownerEmployeeCode: 'EMP-ZN',
      owner: '周宁',
      products: [{
        lineId: 'PT2-CONCURRENCY-001-L1',
        productCode: 'M-FG-PLA-175-MBK',
        productName: 'PLA 1.75mm 哑光黑耗材 1kg',
        demandQty: 20000,
        unit: '卷',
        recipeCode: 'BOM-PLA-175-MBK-V1',
      }],
      materialNeeds: [{
        materialCode: 'M-RM-PLA-VIRGIN',
        materialName: 'PLA 原生粒子',
        requiredQty: 8,
        availableQty: 0,
        shortageQty: 8,
        pendingInboundQty: 1,
        qcPendingQty: 1,
        inTransitQty: 1,
        procurementGapQty: 5,
        unit: 'kg',
      }],
    };
    const invalidTaskOwner = await requestResult(baseUrl, '/production/tasks', {
      method: 'POST',
      body: {
        ...taskCreateBody,
        code: 'PT2-CONCURRENCY-INVALID-OWNER',
        ownerEmployeeCode: 'EMP-LM',
        owner: '李明',
        idempotencyKey: 'smoke:production-task:invalid-owner',
      },
    });
    assert(invalidTaskOwner.response.status === 400, 'production task accepted a non-production owner');
    const createdTask = await request(baseUrl, '/production/tasks', { method: 'POST', body: taskCreateBody });
    const replayedTaskCreate = await request(baseUrl, '/production/tasks', { method: 'POST', body: taskCreateBody });
    assert(replayedTaskCreate.repeated === true, 'task create retry did not replay');
    assert(replayedTaskCreate.record.code === createdTask.record.code, 'task create retry returned another task');
    const taskListAfterCreate = await request(baseUrl, '/production/tasks');
    assert(
      taskListAfterCreate.items.filter((record) => record.code === createdTask.record.code).length === 1,
      'task create retry duplicated the task',
    );

    const taskUpdateBody = {
      ...createdTask.record,
      command: 'save',
      revision: createdTask.record.revision,
      ownerEmployeeCode: 'EMP-ZS',
      owner: '张三',
      idempotencyKey: 'smoke:production-task:update:1',
    };
    const updatedTask = await request(baseUrl, `/production/tasks/${encodeURIComponent(createdTask.record.code)}`, {
      method: 'PUT',
      body: taskUpdateBody,
    });
    const replayedTaskUpdate = await request(baseUrl, `/production/tasks/${encodeURIComponent(createdTask.record.code)}`, {
      method: 'PUT',
      body: taskUpdateBody,
    });
    assert(replayedTaskUpdate.repeated === true, 'task update retry did not replay');
    assert(replayedTaskUpdate.record.revision === updatedTask.record.revision, 'task update retry advanced revision twice');
    const staleTaskUpdate = await requestResult(baseUrl, `/production/tasks/${encodeURIComponent(createdTask.record.code)}`, {
      method: 'PUT',
      body: {
        ...taskUpdateBody,
        idempotencyKey: 'smoke:production-task:update:stale',
      },
    });
    assert(staleTaskUpdate.response.status === 409, 'stale task revision was not rejected');

    const taskSubmitBody = {
      ...updatedTask.record,
      command: 'submit',
      revision: updatedTask.record.revision,
      idempotencyKey: 'smoke:production-task:submit:1',
    };
    const submittedTask = await request(baseUrl, `/production/tasks/${encodeURIComponent(createdTask.record.code)}`, {
      method: 'PUT',
      body: taskSubmitBody,
    });
    const replayedTaskSubmit = await request(baseUrl, `/production/tasks/${encodeURIComponent(createdTask.record.code)}`, {
      method: 'PUT',
      body: taskSubmitBody,
    });
    assert(replayedTaskSubmit.repeated === true, 'task submit retry did not replay');
    assert(
      replayedTaskSubmit.record.revision === submittedTask.record.revision,
      'task submit retry advanced revision twice',
    );
    assert(submittedTask.record.documentStatus === '已确认', 'task submit did not confirm the source task');
    const taskGapLine = submittedTask.record.materialNeeds.find((line) => Number(line.procurementGapQty || 0) > 0.0001);
    assert(taskGapLine, 'canonical recipe plan did not expose a procurement gap for concurrency validation');
    const taskGapQty = Number(taskGapLine.procurementGapQty);

    const taskDerivedMaterialBase = {
      command: 'save',
      revision: 0,
      sourceTaskCode: submittedTask.record.code,
      requestType: '任务缺口',
      department: '生产部',
      requester: '并发测试员',
      requestDate: '2026-07-30',
      expectedDate: '2026-08-10',
    };
    const forgedTaskMaterial = await requestResult(baseUrl, '/production/material-requests', {
      method: 'POST',
      body: {
        ...taskDerivedMaterialBase,
        code: 'PMR2-CONCURRENCY-FORGED-MATERIAL',
        idempotencyKey: 'smoke:production-material-request:forged-material',
        lines: [{
          lineId: 'PMR2-CONCURRENCY-FORGED-MATERIAL-L1',
          materialCode: 'M-RM-NOT-IN-TASK',
          materialName: '伪造任务物料',
          requestedQty: 1,
          unit: 'kg',
        }],
      },
    });
    assert(
      forgedTaskMaterial.response.status === 409,
      'task-derived material request accepted a material outside the task shortage',
    );
    const excessiveTaskMaterial = await requestResult(baseUrl, '/production/material-requests', {
      method: 'POST',
      body: {
        ...taskDerivedMaterialBase,
        code: 'PMR2-CONCURRENCY-EXCESSIVE',
        idempotencyKey: 'smoke:production-material-request:excessive',
        lines: [{
          lineId: 'PMR2-CONCURRENCY-EXCESSIVE-L1',
          materialCode: taskGapLine.materialCode,
          materialName: taskGapLine.materialName,
          requestedQty: taskGapQty + 0.01,
          unit: taskGapLine.unit,
        }],
      },
    });
    assert(
      excessiveTaskMaterial.response.status === 409,
      'task-derived material request exceeded the task procurement gap',
    );
    const validTaskMaterialBody = {
      ...taskDerivedMaterialBase,
      code: 'PMR2-CONCURRENCY-DERIVED-001',
      idempotencyKey: 'smoke:production-material-request:derived:create:1',
      lines: [{
        lineId: 'PMR2-CONCURRENCY-DERIVED-001-L1',
        materialCode: taskGapLine.materialCode,
        materialName: taskGapLine.materialName,
        requestedQty: taskGapQty,
        unit: taskGapLine.unit,
        purpose: '来源任务缺口烟测',
      }],
    };
    const validTaskMaterial = await request(baseUrl, '/production/material-requests', {
      method: 'POST',
      body: validTaskMaterialBody,
    });
    const replayedTaskMaterial = await request(baseUrl, '/production/material-requests', {
      method: 'POST',
      body: validTaskMaterialBody,
    });
    assert(replayedTaskMaterial.repeated === true, 'task-derived material request retry did not replay');
    assert(
      replayedTaskMaterial.record.code === validTaskMaterial.record.code,
      'task-derived material request retry returned another request',
    );

    const workOrderBase = {
      command: 'save',
      revision: 0,
      sourceTask: submittedTask.record.code,
      sourceLineId: 'PT2-CONCURRENCY-001-L1',
      productCode: 'M-FG-PLA-175-MBK',
      productName: 'PLA 1.75mm 哑光黑耗材 1kg',
      planQty: 10,
      unit: '卷',
      recipeCode: 'BOM-PLA-175-MBK-V1',
      processTemplateCode: 'PRC2-WIRE-DRAWING-REWIND-V1',
      plannedDate: '2026-07-30',
      dueDate: '2026-08-10',
      ownerEmployeeCode: 'EMP-ZN',
      owner: '周宁',
    };
    const manualWorkOrderWithoutReason = await requestResult(baseUrl, '/production/work-orders', {
      method: 'POST',
      body: {
        ...workOrderBase,
        command: 'submit',
        code: 'MO2-CONCURRENCY-MANUAL-NO-REASON',
        sourceTask: '',
        sourceLineId: '',
        note: '',
        idempotencyKey: 'smoke:production-work-order:manual-no-reason',
      },
    });
    assert(manualWorkOrderWithoutReason.response.status === 400, 'work order without a task demand was accepted');
    assert(
      String(manualWorkOrderWithoutReason.payload.error || '').includes('任务需求'),
      'work order without a task demand did not explain the required source relation',
    );
    const manualWorkOrder = await requestResult(baseUrl, '/production/work-orders', {
      method: 'POST',
      body: {
        ...workOrderBase,
        command: 'submit',
        code: 'MO2-CONCURRENCY-MANUAL-001',
        sourceTask: '',
        sourceDocument: '',
        sourceLineId: '',
        note: '临时试产，不占用生产任务计划量。',
        idempotencyKey: 'smoke:production-work-order:manual-create',
      },
    });
    assert(manualWorkOrder.response.status === 400, 'taskless work order was accepted when a manual reason was supplied');
    assert(
      String(manualWorkOrder.payload.error || '').includes('任务需求'),
      'taskless work order rejection did not point to the missing task demand',
    );
    const forgedWorkOrderLine = await requestResult(baseUrl, '/production/work-orders', {
      method: 'POST',
      body: {
        ...workOrderBase,
        code: 'MO2-CONCURRENCY-FORGED-LINE',
        sourceLineId: 'PT2-CONCURRENCY-001-L999',
        idempotencyKey: 'smoke:production-work-order:forged-line',
      },
    });
    assert(forgedWorkOrderLine.response.status === 409, 'work order accepted a forged source line');
    const forgedWorkOrderProduct = await requestResult(baseUrl, '/production/work-orders', {
      method: 'POST',
      body: {
        ...workOrderBase,
        code: 'MO2-CONCURRENCY-FORGED-PRODUCT',
        productCode: 'M-FG-FORGED',
        productName: '伪造成品',
        idempotencyKey: 'smoke:production-work-order:forged-product',
      },
    });
    assert(forgedWorkOrderProduct.response.status === 409, 'work order accepted a forged product');
    const forgedWorkOrderUnit = await requestResult(baseUrl, '/production/work-orders', {
      method: 'POST',
      body: {
        ...workOrderBase,
        code: 'MO2-CONCURRENCY-FORGED-UNIT',
        unit: 'kg',
        idempotencyKey: 'smoke:production-work-order:forged-unit',
      },
    });
    assert(forgedWorkOrderUnit.response.status === 409, 'work order accepted a forged unit');
    const excessiveWorkOrder = await requestResult(baseUrl, '/production/work-orders', {
      method: 'POST',
      body: {
        ...workOrderBase,
        code: 'MO2-CONCURRENCY-OVER-PLAN',
        planQty: 20000.01,
        idempotencyKey: 'smoke:production-work-order:over-plan',
      },
    });
    assert(excessiveWorkOrder.response.status === 409, 'work order exceeded the source task plan');

    const workOrderCreateBody = {
      ...workOrderBase,
      code: 'MO2-CONCURRENCY-001',
      idempotencyKey: 'smoke:production-work-order:create:1',
    };
    const createdWorkOrder = await request(baseUrl, '/production/work-orders', {
      method: 'POST',
      body: workOrderCreateBody,
    });
    const replayedWorkOrderCreate = await request(baseUrl, '/production/work-orders', {
      method: 'POST',
      body: workOrderCreateBody,
    });
    assert(replayedWorkOrderCreate.repeated === true, 'work-order create retry did not replay');
    assert(
      replayedWorkOrderCreate.record.code === createdWorkOrder.record.code,
      'work-order create retry returned another work order',
    );
    const workOrderListAfterCreate = await request(baseUrl, '/production/work-orders');
    assert(
      workOrderListAfterCreate.items.filter((record) => record.code === createdWorkOrder.record.code).length === 1,
      'work-order create retry duplicated the work order',
    );

    const workOrderUpdateBody = {
      ...createdWorkOrder.record,
      command: 'save',
      revision: createdWorkOrder.record.revision,
      note: '第一次并发安全更新',
      idempotencyKey: 'smoke:production-work-order:update:1',
    };
    const updatedWorkOrder = await request(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(createdWorkOrder.record.code)}`,
      { method: 'PUT', body: workOrderUpdateBody },
    );
    const replayedWorkOrderUpdate = await request(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(createdWorkOrder.record.code)}`,
      { method: 'PUT', body: workOrderUpdateBody },
    );
    assert(replayedWorkOrderUpdate.repeated === true, 'work-order update retry did not replay');
    assert(
      replayedWorkOrderUpdate.record.revision === updatedWorkOrder.record.revision,
      'work-order update retry advanced revision twice',
    );
    const staleWorkOrderUpdate = await requestResult(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(createdWorkOrder.record.code)}`,
      {
        method: 'PUT',
        body: {
          ...workOrderUpdateBody,
          idempotencyKey: 'smoke:production-work-order:update:stale',
        },
      },
    );
    assert(staleWorkOrderUpdate.response.status === 409, 'stale work-order revision was not rejected');

    const closeBody = {
      revision: 3,
      actor: '并发测试员',
      idempotencyKey: 'smoke:production-work-order:close:1',
    };
    const closedWorkOrder = await request(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(closable.workOrderCode)}/close`,
      { method: 'POST', body: closeBody },
    );
    const replayedWorkOrderClose = await request(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(closable.workOrderCode)}/close`,
      { method: 'POST', body: closeBody },
    );
    assert(replayedWorkOrderClose.repeated === true, 'work-order close retry did not replay');
    assert(
      replayedWorkOrderClose.record.revision === closedWorkOrder.record.revision,
      'work-order close retry advanced revision twice',
    );
    const staleWorkOrderClose = await requestResult(
      baseUrl,
      `/production/work-orders/${encodeURIComponent(closable.workOrderCode)}/close`,
      {
        method: 'POST',
        body: {
          revision: 3,
          actor: '并发测试员',
          idempotencyKey: 'smoke:production-work-order:close:stale',
        },
      },
    );
    assert(staleWorkOrderClose.response.status === 409, 'closed work order accepted another close command');

    const materialCreateBody = {
      command: 'save',
      code: 'PMR2-CONCURRENCY-001',
      revision: 0,
      idempotencyKey: 'smoke:production-material-request:create:1',
      requestType: '临时备料',
      department: '生产部',
      requester: '并发测试员',
      requestDate: '2026-07-30',
      expectedDate: '2026-08-10',
      lines: [{
        lineId: 'PMR2-CONCURRENCY-001-L1',
        materialCode: 'M-RM-PLA-VIRGIN',
        materialName: 'PLA 原生粒子',
        requestedQty: 100000,
        unit: 'kg',
        purpose: '并发保护验证',
      }],
    };
    const createdMaterialRequest = await request(baseUrl, '/production/material-requests', {
      method: 'POST',
      body: materialCreateBody,
    });
    assert(
      createdMaterialRequest.record.requesterEmployeeCode === 'EMP-ZN'
      && createdMaterialRequest.record.requester === '周宁'
      && createdMaterialRequest.record.department === '生产管理部',
      'material request did not freeze the authenticated production applicant',
    );
    assert(
      createdMaterialRequest.record.requestDate !== materialCreateBody.requestDate,
      'material request trusted the client-forged request date',
    );
    const replayedMaterialCreate = await request(baseUrl, '/production/material-requests', {
      method: 'POST',
      body: materialCreateBody,
    });
    assert(replayedMaterialCreate.repeated === true, 'material-request create retry did not replay');
    const materialListAfterCreate = await request(baseUrl, '/production/material-requests');
    assert(
      materialListAfterCreate.items.filter((record) => record.code === createdMaterialRequest.record.code).length === 1,
      'material-request create retry duplicated the request',
    );

    const materialUpdateBody = {
      ...createdMaterialRequest.record,
      command: 'save',
      revision: createdMaterialRequest.record.revision,
      note: '第一次并发安全更新',
      idempotencyKey: 'smoke:production-material-request:update:1',
    };
    const updatedMaterialRequest = await request(
      baseUrl,
      `/production/material-requests/${encodeURIComponent(createdMaterialRequest.record.code)}`,
      { method: 'PUT', body: materialUpdateBody },
    );
    const replayedMaterialUpdate = await request(
      baseUrl,
      `/production/material-requests/${encodeURIComponent(createdMaterialRequest.record.code)}`,
      { method: 'PUT', body: materialUpdateBody },
    );
    assert(replayedMaterialUpdate.repeated === true, 'material-request update retry did not replay');
    assert(
      replayedMaterialUpdate.record.revision === updatedMaterialRequest.record.revision,
      'material-request update retry advanced revision twice',
    );
    const staleMaterialUpdate = await requestResult(
      baseUrl,
      `/production/material-requests/${encodeURIComponent(createdMaterialRequest.record.code)}`,
      {
        method: 'PUT',
        body: {
          ...materialUpdateBody,
          idempotencyKey: 'smoke:production-material-request:update:stale',
        },
      },
    );
    assert(staleMaterialUpdate.response.status === 409, 'stale material-request revision was not rejected');

    const materialSubmitBody = {
      ...updatedMaterialRequest.record,
      command: 'submit',
      revision: updatedMaterialRequest.record.revision,
      idempotencyKey: 'smoke:production-material-request:submit:1',
    };
    const submittedMaterialRequest = await request(
      baseUrl,
      `/production/material-requests/${encodeURIComponent(createdMaterialRequest.record.code)}`,
      { method: 'PUT', body: materialSubmitBody },
    );
    const replayedMaterialSubmit = await request(
      baseUrl,
      `/production/material-requests/${encodeURIComponent(createdMaterialRequest.record.code)}`,
      { method: 'PUT', body: materialSubmitBody },
    );
    assert(replayedMaterialSubmit.repeated === true, 'material-request submit retry did not replay');
    assert(
      replayedMaterialSubmit.record.revision === submittedMaterialRequest.record.revision,
      'material-request submit retry advanced revision twice',
    );
    const purchaseRequisitions = await request(baseUrl, '/purchase/requisitions', { account: 'ACC-PURCHASE' });
    assert(
      purchaseRequisitions.items.filter(
        (record) => record.sourceMaterialRequest === createdMaterialRequest.record.code,
      ).length === 1,
      'material-request submit retry duplicated the purchase requisition',
    );

    console.log('production planning concurrency smoke passed');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 1000);
    });
    await rm(tempDir, { recursive: true, force: true });
    if (child.exitCode && child.exitCode !== 0) {
      throw new Error(`isolated API exited with ${child.exitCode}\n${logs}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
