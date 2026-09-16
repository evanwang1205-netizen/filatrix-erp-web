import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { nextEquipmentInspectionDate } from '../server/equipment-inspection-schedule.mjs';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataFile = process.env.FILATRIX_DATA_FILE || join(rootDir, 'server/data/erp-data.json');
const baseUrl = (process.env.FILATRIX_SMOKE_API_BASE || process.env.VITE_API_BASE || 'http://127.0.0.1:5175/api').replace(/\/$/, '');
const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const tomorrow = nextEquipmentInspectionDate(today, '每日');

async function request(path, { method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status !== status) {
    throw new Error(`${method} ${path}: expected HTTP ${status}, got ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

const snapshot = readFileSync(dataFile, 'utf8');

try {
  const seedTasks = await request('/equipment/inspection-tasks');
  const seedPlans = await request('/equipment/inspection-plans');
  const seedStandards = await request('/equipment/inspection-standards');
  if (!seedTasks.items.length || !seedPlans.items.length || !seedStandards.items.length) {
    throw new Error('equipment inspection seed data is incomplete');
  }

  const standard = await request('/equipment/inspection-standards', {
    method: 'POST',
    status: 201,
    body: {
      record: {
        code: '系统自动生成',
        name: `Smoke 巡检标准 ${Date.now()}`,
        equipmentModel: 'ODAC 18XY',
        acceptance: '镜头清洁，标准棒校验误差在允许范围内。',
        status: '启用',
        revision: 0,
        items: [
          { lineId: 'I1', name: '镜头清洁', method: '目视检查', requirement: '无粉尘和附着物' },
          { lineId: 'I2', name: '标准棒校验', method: '使用标准棒复核', requirement: '误差不超过 0.01mm' },
        ],
        note: 'Smoke test',
        updatedAt: '',
      },
    },
  });
  if ('inspectionMethod' in standard.record || 'owner' in standard.record || 'equipmentScope' in standard.record) {
    throw new Error('standard still exposes duplicate or legacy fields');
  }
  if (standard.record.equipmentModel !== 'ODAC 18XY') {
    throw new Error('standard did not retain its structured equipment model');
  }
  const unchangedStandard = await request(`/equipment/inspection-standards/${encodeURIComponent(standard.record.code)}`, {
    method: 'PUT',
    body: {
      record: standard.record,
      revision: standard.record.revision,
    },
  });
  if (!unchangedStandard.unchanged || unchangedStandard.record.revision !== standard.record.revision) {
    throw new Error('unchanged standard save created an empty revision');
  }

  const draftStandard = await request('/equipment/inspection-standards', {
    method: 'POST',
    status: 201,
    body: {
      record: {
        code: '系统自动生成',
        name: `Smoke 分步草稿 ${Date.now()}`,
        equipmentModel: 'ODAC 18XY',
        acceptance: '',
        status: '草稿',
        revision: 0,
        items: [
          { lineId: 'I1', name: '通信状态', method: '', requirement: '' },
        ],
        note: '',
      },
    },
  });
  if (draftStandard.record.status !== '草稿'
    || draftStandard.record.acceptance
    || draftStandard.record.items[0]?.name !== '通信状态'
    || draftStandard.record.items[0]?.method) {
    throw new Error('draft standard did not preserve its incomplete work in progress');
  }
  await request(`/equipment/inspection-standards/${encodeURIComponent(draftStandard.record.code)}`, {
    method: 'PUT',
    status: 400,
    body: {
      record: { ...draftStandard.record, status: '启用' },
      revision: draftStandard.record.revision,
    },
  });
  const enabledDraftStandard = await request(`/equipment/inspection-standards/${encodeURIComponent(draftStandard.record.code)}`, {
    method: 'PUT',
    body: {
      record: {
        ...draftStandard.record,
        status: '启用',
        acceptance: '通信在线且无报警。',
        items: [
          { lineId: 'I1', name: '通信状态', method: '查看通信指示灯', requirement: '在线且无报警' },
        ],
      },
      revision: draftStandard.record.revision,
    },
  });
  if (enabledDraftStandard.record.status !== '启用'
    || enabledDraftStandard.record.revision !== draftStandard.record.revision + 1) {
    throw new Error('completed draft standard did not enter enabled state');
  }
  await request('/equipment/inspection-standards', {
    method: 'POST',
    status: 400,
    body: {
      record: {
        ...standard.record,
        code: '系统自动生成',
        name: `Smoke 重复项目名称 ${Date.now()}`,
        items: [
          { lineId: 'I1', name: '镜头清洁', method: '目视检查', requirement: '无粉尘' },
          { lineId: 'I2', name: '镜头清洁', method: '擦拭检查', requirement: '无附着物' },
        ],
      },
    },
  });
  await request('/equipment/inspection-standards', {
    method: 'POST',
    status: 400,
    body: {
      record: {
        ...standard.record,
        code: '系统自动生成',
        name: `Smoke 重复项目行号 ${Date.now()}`,
        items: [
          { lineId: 'I1', name: '镜头清洁', method: '目视检查', requirement: '无粉尘' },
          { lineId: 'I1', name: '标准棒校验', method: '标准棒复核', requirement: '误差合格' },
        ],
      },
    },
  });

  await request('/equipment/inspection-plans', {
    method: 'POST',
    status: 400,
    body: {
      record: {
        code: '系统自动生成',
        name: `Smoke 错配设备标准 ${Date.now()}`,
        equipmentCode: 'EQ-EXT-01',
        standardCode: standard.record.code,
        frequency: '每日',
        executionWindow: '08:00-09:00',
        firstDueDate: today,
        ownerEmployeeCode: 'EMP-ZN',
        status: '启用',
        revision: 0,
      },
    },
  });

  await request('/equipment/inspection-plans', {
    method: 'POST',
    status: 400,
    body: {
      record: {
        code: '系统自动生成',
        name: `Smoke 无效执行时间窗 ${Date.now()}`,
        equipmentCode: 'EQ-DIA-01',
        standardCode: standard.record.code,
        frequency: '每日',
        executionWindow: '班前 30 分钟',
        firstDueDate: today,
        ownerEmployeeCode: 'EMP-ZN',
        status: '启用',
        revision: 0,
      },
    },
  });

  await request('/equipment/inspection-plans', {
    method: 'POST',
    status: 400,
    body: {
      record: {
        code: '系统自动生成',
        name: `Smoke 无效负责人 ${Date.now()}`,
        equipmentCode: 'EQ-DIA-01',
        standardCode: standard.record.code,
        frequency: '每日',
        executionWindow: '08:00-09:00',
        firstDueDate: today,
        ownerEmployeeCode: 'EMP-NOT-FOUND',
        status: '启用',
        revision: 0,
      },
    },
  });

  const plan = await request('/equipment/inspection-plans', {
    method: 'POST',
    status: 201,
    body: {
      record: {
        code: '系统自动生成',
        name: `Smoke 测径仪每日巡检 ${Date.now()}`,
        equipmentCode: 'EQ-DIA-01',
        standardCode: standard.record.code,
        frequency: '每日',
        executionWindow: '08:00-09:00',
        firstDueDate: today,
        owner: '周宁',
        ownerEmployeeCode: 'EMP-ZN',
        status: '启用',
        revision: 0,
        note: 'Smoke test',
      },
    },
  });
  if (!plan.generatedTask?.code || plan.generatedTask.status !== '待巡检') {
    throw new Error(`enabled plan did not generate a pending task: ${JSON.stringify(plan)}`);
  }
  if (plan.record.owner !== '周宁' || plan.record.ownerEmployeeCode !== 'EMP-ZN'
    || plan.generatedTask.assignee !== '周宁' || plan.generatedTask.assigneeEmployeeCode !== 'EMP-ZN') {
    throw new Error('plan owner and generated task assignee were not resolved from the employee master');
  }
  if (plan.generatedTask.dueAt !== `${today} 09:00`) {
    throw new Error(`task due time was not derived from the execution window: ${plan.generatedTask.dueAt}`);
  }
  if (plan.record.standardRevision !== standard.record.revision
    || plan.generatedTask.standardRevision !== standard.record.revision) {
    throw new Error('generated task did not freeze the source standard revision');
  }
  const unchangedPlan = await request(`/equipment/inspection-plans/${encodeURIComponent(plan.record.code)}`, {
    method: 'PUT',
    body: {
      record: plan.record,
      revision: plan.record.revision,
    },
  });
  if (!unchangedPlan.unchanged || unchangedPlan.record.revision !== plan.record.revision) {
    throw new Error('unchanged plan save created an empty revision');
  }

  const reassignedPlan = await request(`/equipment/inspection-plans/${encodeURIComponent(plan.record.code)}`, {
    method: 'PUT',
    body: {
      record: {
        ...plan.record,
        executionWindow: '10:00-11:00',
        owner: '张三',
        ownerEmployeeCode: 'EMP-ZS',
      },
      revision: plan.record.revision,
    },
  });
  if (reassignedPlan.reassignedTaskCount !== 1 || reassignedPlan.record.ownerEmployeeCode !== 'EMP-ZS') {
    throw new Error(`plan owner change did not report the pending task reassignment: ${JSON.stringify(reassignedPlan)}`);
  }
  const reassignedTask = await request(`/equipment/inspection-tasks/${encodeURIComponent(plan.generatedTask.code)}`);
  if (reassignedTask.record.assignee !== '张三'
    || reassignedTask.record.assigneeEmployeeCode !== 'EMP-ZS'
    || reassignedTask.record.revision <= plan.generatedTask.revision) {
    throw new Error('pending task did not follow the explicit plan owner reassignment');
  }
  if (reassignedTask.record.dueAt !== `${today} 09:00`) {
    throw new Error('generated task deadline was rewritten by a later plan time-window change');
  }
  if (!reassignedTask.flowRecords?.some((item) => item.action === '改派巡检任务')) {
    throw new Error('pending task reassignment did not leave an execution flow record');
  }

  const revisedStandardName = `${standard.record.name}（修订）`;
  const revisedStandard = await request(`/equipment/inspection-standards/${encodeURIComponent(standard.record.code)}`, {
    method: 'PUT',
    body: {
      record: {
        ...standard.record,
        name: revisedStandardName,
        items: [
          ...standard.record.items,
          { lineId: 'I3', name: '通讯状态', method: '查看通讯指示', requirement: '通讯在线且无报警' },
        ],
      },
      revision: standard.record.revision,
    },
  });
  const projectedPlan = await request(`/equipment/inspection-plans/${encodeURIComponent(plan.record.code)}`);
  if (projectedPlan.record.standardName !== revisedStandardName
    || projectedPlan.record.standardRevision !== revisedStandard.record.revision) {
    throw new Error('plan did not refresh its current standard name and revision projection');
  }
  const frozenTask = await request(`/equipment/inspection-tasks/${encodeURIComponent(plan.generatedTask.code)}`);
  if (frozenTask.record.standardName !== standard.record.name
    || frozenTask.record.standardRevision !== standard.record.revision
    || frozenTask.record.items.length !== standard.record.items.length) {
    throw new Error('already generated task was rewritten after the standard revision');
  }

  await request(`/equipment/inspection-standards/${encodeURIComponent(standard.record.code)}`, {
    method: 'PUT',
    status: 400,
    body: {
      record: { ...revisedStandard.record, status: '停用' },
      revision: revisedStandard.record.revision,
    },
  });

  await request(`/equipment/inspection-standards/${encodeURIComponent(standard.record.code)}`, {
    method: 'PUT',
    status: 400,
    body: {
      record: { ...revisedStandard.record, equipmentModel: 'JWS45' },
      revision: revisedStandard.record.revision,
    },
  });

  const referencedEquipment = await request('/master-data/equipment/EQ-DIA-01');
  await request('/master-data/equipment/EQ-DIA-01', {
    method: 'PUT',
    status: 400,
    body: {
      ...referencedEquipment.record,
      model: 'SMOKE-CHANGED-MODEL',
      revision: referencedEquipment.record.revision,
    },
  });
  await request('/master-data/equipment/EQ-DIA-01', {
    method: 'PUT',
    status: 400,
    body: {
      ...referencedEquipment.record,
      status: '停用',
      revision: referencedEquipment.record.revision,
    },
  });

  const rescheduledPlan = await request(`/equipment/inspection-plans/${encodeURIComponent(plan.record.code)}`, {
    method: 'PUT',
    body: {
      record: { ...reassignedPlan.record, firstDueDate: tomorrow },
      revision: reassignedPlan.record.revision,
    },
  });
  if (rescheduledPlan.record.firstDueDate !== plan.record.firstDueDate) {
    throw new Error('existing plan allowed its historical first due date to be rewritten');
  }

  const monthlyPlan = await request('/equipment/inspection-plans', {
    method: 'POST',
    status: 201,
    body: {
      record: {
        code: '系统自动生成',
        name: `Smoke 未来月度巡检 ${Date.now()}`,
        equipmentCode: 'EQ-DIA-01',
        standardCode: standard.record.code,
        frequency: '每月',
        executionWindow: '14:00-15:00',
        firstDueDate: tomorrow,
        ownerEmployeeCode: 'EMP-ZN',
        status: '启用',
        revision: 0,
      },
    },
  });
  const monthlyTask = monthlyPlan.generatedTask;
  await request(`/equipment/inspection-tasks/${encodeURIComponent(monthlyTask.code)}/start`, {
    method: 'POST',
    status: 400,
    body: {
      record: monthlyTask,
      revision: monthlyTask.revision,
      idempotencyKey: `smoke:${monthlyTask.code}:start`,
    },
  });
  if (nextEquipmentInspectionDate('2027-01-31', '每月') !== '2027-02-28'
    || nextEquipmentInspectionDate('2028-01-31', '每月') !== '2028-02-29') {
    throw new Error('month-end schedule did not clamp to the last valid day of February');
  }

  const stoppedMonthlyPlan = await request(`/equipment/inspection-plans/${encodeURIComponent(monthlyPlan.record.code)}`, {
    method: 'PUT',
    body: {
      record: { ...monthlyPlan.record, status: '停用' },
      revision: monthlyPlan.record.revision,
    },
  });
  const resumedMonthlyPlan = await request(`/equipment/inspection-plans/${encodeURIComponent(monthlyPlan.record.code)}`, {
    method: 'PUT',
    body: {
      record: { ...stoppedMonthlyPlan.record, status: '启用' },
      revision: stoppedMonthlyPlan.record.revision,
    },
  });
  if (resumedMonthlyPlan.generatedTask
    || resumedMonthlyPlan.retainedTask?.code !== monthlyTask.code
    || resumedMonthlyPlan.record.nextDueDate !== monthlyTask.scheduledDate) {
    throw new Error('reactivated plan did not retain its existing unfinished task');
  }
  const openTasksAfterResume = (await request('/equipment/inspection-tasks')).items
    .filter((item) => item.planCode === monthlyPlan.record.code && ['待巡检', '巡检中', '异常处理中'].includes(item.status));
  if (openTasksAfterResume.length !== 1 || openTasksAfterResume[0].code !== monthlyTask.code) {
    throw new Error('reactivated plan created a duplicate unfinished task');
  }

  const stoppedMonthlyAgain = await request(`/equipment/inspection-plans/${encodeURIComponent(monthlyPlan.record.code)}`, {
    method: 'PUT',
    body: {
      record: { ...resumedMonthlyPlan.record, status: '停用' },
      revision: resumedMonthlyPlan.record.revision,
    },
  });
  await request(`/equipment/inspection-tasks/${encodeURIComponent(monthlyTask.code)}/cancel`, {
    method: 'POST',
    status: 400,
    body: {
      record: monthlyTask,
      revision: monthlyTask.revision,
      idempotencyKey: `smoke:${monthlyTask.code}:cancel:missing-reason`,
    },
  });
  const cancelledMonthlyTask = await request(`/equipment/inspection-tasks/${encodeURIComponent(monthlyTask.code)}/cancel`, {
    method: 'POST',
    body: {
      record: { ...monthlyTask, cancelReason: '设备本周期停机，不执行本次巡检。' },
      revision: monthlyTask.revision,
      idempotencyKey: `smoke:${monthlyTask.code}:cancel`,
    },
  });
  if (cancelledMonthlyTask.record.status !== '已取消'
    || cancelledMonthlyTask.record.result !== '未执行'
    || !cancelledMonthlyTask.record.cancelledAt
    || cancelledMonthlyTask.record.cancelReason !== '设备本周期停机，不执行本次巡检。'
    || cancelledMonthlyTask.generatedTask) {
    throw new Error('stopped-plan task cancellation did not preserve a complete cancellation fact');
  }
  if (!cancelledMonthlyTask.flowRecords?.some((item) => item.action === '取消巡检任务')) {
    throw new Error('task cancellation did not leave an execution flow record');
  }
  const cancellationReplay = await request(`/equipment/inspection-tasks/${encodeURIComponent(monthlyTask.code)}/cancel`, {
    method: 'POST',
    body: {
      record: { ...monthlyTask, cancelReason: '设备本周期停机，不执行本次巡检。' },
      revision: monthlyTask.revision,
      idempotencyKey: `smoke:${monthlyTask.code}:cancel`,
    },
  });
  if (cancellationReplay.record.status !== '已取消') {
    throw new Error('task cancellation idempotency replay failed');
  }
  const monthlyAfterCancellation = await request(`/equipment/inspection-plans/${encodeURIComponent(monthlyPlan.record.code)}`);
  const expectedMonthlyNextDate = nextEquipmentInspectionDate(monthlyTask.scheduledDate, '每月');
  if (monthlyAfterCancellation.record.nextDueDate !== expectedMonthlyNextDate
    || monthlyAfterCancellation.record.revision <= stoppedMonthlyAgain.record.revision) {
    throw new Error('cancelled task did not advance the stopped plan schedule and revision');
  }
  const resumedAfterCancellation = await request(`/equipment/inspection-plans/${encodeURIComponent(monthlyPlan.record.code)}`, {
    method: 'PUT',
    body: {
      record: { ...monthlyAfterCancellation.record, status: '启用' },
      revision: monthlyAfterCancellation.record.revision,
    },
  });
  if (resumedAfterCancellation.retainedTask
    || resumedAfterCancellation.generatedTask?.scheduledDate !== expectedMonthlyNextDate) {
    throw new Error('reactivated plan did not generate exactly the next scheduled occurrence after cancellation');
  }

  const normalPlan = await request('/equipment/inspection-plans', {
    method: 'POST',
    status: 201,
    body: {
      record: {
        code: '系统自动生成',
        name: `Smoke 测径仪每周巡检 ${Date.now()}`,
        equipmentCode: 'EQ-DIA-01',
        standardCode: standard.record.code,
        frequency: '每周',
        executionWindow: '14:00-15:00',
        firstDueDate: today,
        ownerEmployeeCode: 'EMP-ZN',
        status: '启用',
        revision: 0,
      },
    },
  });
  const normalTask = normalPlan.generatedTask;
  const normalStarted = await request(`/equipment/inspection-tasks/${encodeURIComponent(normalTask.code)}/start`, {
    method: 'POST',
    body: {
      record: normalTask,
      revision: normalTask.revision,
      idempotencyKey: `smoke:${normalTask.code}:start`,
    },
  });
  const normalCompleted = await request(`/equipment/inspection-tasks/${encodeURIComponent(normalTask.code)}/complete`, {
    method: 'POST',
    body: {
      record: {
        ...normalStarted.record,
        items: normalStarted.record.items.map((item) => ({ ...item, result: '正常', actual: '检查正常' })),
        exceptionSummary: '切换为正常前遗留的异常说明',
      },
      revision: normalStarted.record.revision,
      idempotencyKey: `smoke:${normalTask.code}:complete`,
    },
  });
  if (normalCompleted.record.exceptionSummary) {
    throw new Error('normal completion retained a stale exception summary');
  }
  if (normalCompleted.generatedTask?.scheduledDate !== nextEquipmentInspectionDate(today, '每周')) {
    throw new Error('normal completion did not generate the next weekly task');
  }

  const taskCode = plan.generatedTask.code;
  const started = await request(`/equipment/inspection-tasks/${encodeURIComponent(taskCode)}/start`, {
    method: 'POST',
    body: {
      record: reassignedTask.record,
      revision: reassignedTask.record.revision,
      idempotencyKey: `smoke:${taskCode}:start`,
    },
  });
  if (started.record.status !== '巡检中') throw new Error('task did not enter in-progress state');

  await request(`/equipment/inspection-tasks/${encodeURIComponent(taskCode)}/complete`, {
    method: 'POST',
    status: 409,
    body: {
      record: {
        ...started.record,
        items: started.record.items.slice(1),
      },
      revision: started.record.revision,
      idempotencyKey: `smoke:${taskCode}:complete-missing-snapshot-item`,
    },
  });
  await request(`/equipment/inspection-tasks/${encodeURIComponent(taskCode)}/complete`, {
    method: 'POST',
    status: 409,
    body: {
      record: {
        ...started.record,
        items: started.record.items.map((item, index) => ({
          ...item,
          requirement: index === 0 ? '被客户端篡改的判定要求' : item.requirement,
          result: '正常',
        })),
      },
      revision: started.record.revision,
      idempotencyKey: `smoke:${taskCode}:complete-mutated-snapshot-item`,
    },
  });

  const restoredPlanOwner = await request(`/equipment/inspection-plans/${encodeURIComponent(plan.record.code)}`, {
    method: 'PUT',
    body: {
      record: {
        ...rescheduledPlan.record,
        owner: '周宁',
        ownerEmployeeCode: 'EMP-ZN',
      },
      revision: rescheduledPlan.record.revision,
    },
  });
  if (restoredPlanOwner.reassignedTaskCount !== 0) {
    throw new Error('plan owner change rewrote a task that had already started');
  }
  const inProgressSnapshot = await request(`/equipment/inspection-tasks/${encodeURIComponent(taskCode)}`);
  if (inProgressSnapshot.record.status !== '巡检中'
    || inProgressSnapshot.record.assignee !== '张三'
    || inProgressSnapshot.record.assigneeEmployeeCode !== 'EMP-ZS') {
    throw new Error('in-progress task lost its original responsibility snapshot after the plan owner changed');
  }

  const accountList = await request('/system/accounts');
  const productionAccount = accountList.items.find((item) => item.code === 'ACC-PRODUCTION');
  if (!productionAccount) throw new Error('production account is missing from system configuration');
  const blockedAccountChange = await request('/system/accounts/ACC-PRODUCTION', {
    method: 'PUT',
    status: 400,
    body: { ...productionAccount, status: '停用' },
  });
  if (!JSON.stringify(blockedAccountChange).includes('巡检')) {
    throw new Error(`account responsibility guard returned an unclear error: ${JSON.stringify(blockedAccountChange)}`);
  }
  const roleList = await request('/system/roles');
  const productionRole = roleList.items.find((item) => item.code === 'ROLE-PRODUCTION');
  if (!productionRole) throw new Error('production role is missing from system configuration');
  const blockedRoleChange = await request('/system/roles/ROLE-PRODUCTION', {
    method: 'PUT',
    status: 400,
    body: {
      ...productionRole,
      permissions: String(productionRole.permissions || '')
        .split(',')
        .filter((permissionCode) => permissionCode !== 'PERM-EQUIPMENT-OPERATE')
        .join(','),
    },
  });
  if (!JSON.stringify(blockedRoleChange).includes('巡检')) {
    throw new Error(`role permission continuity guard returned an unclear error: ${JSON.stringify(blockedRoleChange)}`);
  }

  await request(`/equipment/inspection-tasks/${encodeURIComponent(taskCode)}/complete`, {
    method: 'POST',
    status: 400,
    body: {
      record: {
        ...started.record,
        items: started.record.items.map((item, index) => ({
          ...item,
          result: index === 0 ? '异常' : '正常',
          actual: index === 0 ? '' : '校验正常',
          note: '',
        })),
        exceptionSummary: '首项巡检异常。',
      },
      revision: started.record.revision,
      idempotencyKey: `smoke:${taskCode}:complete-missing-evidence`,
    },
  });

  const abnormalItems = started.record.items.map((item, index) => ({
    ...item,
    result: index === 0 ? '异常' : '正常',
    actual: index === 0 ? '镜头表面有粉尘' : '校验正常',
    note: index === 0 ? '已停止测量并清洁' : '',
  }));
  const abnormal = await request(`/equipment/inspection-tasks/${encodeURIComponent(taskCode)}/complete`, {
    method: 'POST',
    body: {
      record: {
        ...started.record,
        items: abnormalItems,
        exceptionSummary: '镜头表面有粉尘，已暂停测量并执行清洁。',
      },
      revision: started.record.revision,
      idempotencyKey: `smoke:${taskCode}:complete`,
    },
  });
  if (abnormal.record.status !== '异常处理中' || abnormal.record.result !== '异常') {
    throw new Error('abnormal task did not enter exception handling');
  }

  const resolved = await request(`/equipment/inspection-tasks/${encodeURIComponent(taskCode)}/resolve`, {
    method: 'POST',
    body: {
      record: {
        ...abnormal.record,
        resolution: '完成镜头清洁并用标准棒复核，读数正常，设备恢复使用。',
      },
      revision: abnormal.record.revision,
      idempotencyKey: `smoke:${taskCode}:resolve`,
    },
  });
  if (resolved.record.status !== '已完成' || !resolved.generatedTask?.code) {
    throw new Error('resolved task did not close or generate the next task');
  }
  if (resolved.generatedTask.standardName !== revisedStandard.record.name
    || resolved.generatedTask.standardRevision !== revisedStandard.record.revision
    || resolved.generatedTask.items.length !== revisedStandard.record.items.length) {
    throw new Error('next task did not use the latest standard revision');
  }
  if (resolved.generatedTask.assignee !== '周宁' || resolved.generatedTask.assigneeEmployeeCode !== 'EMP-ZN') {
    throw new Error('next task did not use the plan owner that was active when it was generated');
  }

  const replay = await request(`/equipment/inspection-tasks/${encodeURIComponent(taskCode)}/resolve`, {
    method: 'POST',
    body: {
      record: resolved.record,
      revision: abnormal.record.revision,
      idempotencyKey: `smoke:${taskCode}:resolve`,
    },
  });
  if (replay.record.status !== '已完成') throw new Error('idempotent command replay failed');

  console.log('Equipment inspection smoke passed');
  console.log('- standards bind to a master-data equipment model and incompatible plan combinations are rejected');
  console.log('- draft standards preserve incomplete work and enforce completeness only when enabled');
  console.log('- unchanged saves do not create empty standard or plan revisions');
  console.log('- standard inspection item names and stable line ids remain unique');
  console.log('- standard renames refresh plan projections while generated tasks retain their original revision snapshot');
  console.log('- task submissions cannot delete or rewrite frozen standard inspection facts');
  console.log('- tasks generated after a standard edit use the latest standard name, revision, and inspection items');
  console.log('- active plans protect both the standard model binding and the referenced equipment model/status');
  console.log('- standard fields are concise and active-plan standards cannot be disabled');
  console.log('- plan owners require equipment permission and execution windows determine task deadlines');
  console.log('- plan owner changes reassign only pending tasks and leave an explicit flow record');
  console.log('- in-progress task ownership and generated-task deadlines remain frozen snapshots');
  console.log('- account and permission changes cannot strand active plans or unfinished tasks');
  console.log('- an existing plan cannot rewrite its historical first due date');
  console.log('- future tasks cannot start before their planned date');
  console.log('- month-end plans clamp safely to the last valid day of the next month');
  console.log('- reactivated plans retain unfinished tasks instead of creating duplicates');
  console.log('- pending tasks require a cancellation reason and advance the stopped plan schedule');
  console.log('- enabled plan automatically generates a pending task');
  console.log('- abnormal items require evidence before the task runs through submission and resolution');
  console.log('- command replay is idempotent');
} finally {
  writeFileSync(dataFile, snapshot);
}
