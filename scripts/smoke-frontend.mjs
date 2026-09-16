import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const passed = [];
const failed = [];

function filePath(relativePath) {
  return join(rootDir, relativePath);
}

function read(relativePath) {
  return readFileSync(filePath(relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(name, check) {
  try {
    check();
    passed.push(name);
  } catch (error) {
    failed.push(`${name}: ${error.message}`);
  }
}

function expectFile(relativePath) {
  assert(existsSync(filePath(relativePath)), `${relativePath} is missing`);
}

function expectIncludes(relativePath, token) {
  const content = read(relativePath);
  assert(content.includes(token), `${relativePath} should include ${token}`);
}

function expectExcludes(relativePath, tokens) {
  const content = read(relativePath);
  for (const token of tokens) {
    assert(!content.includes(token), `${relativePath} should not include ${token}`);
  }
}

run('navigation includes active modules and keeps ecommerce deferred by default', () => {
  const navigation = 'src/data/navigation.ts';
  expectIncludes(navigation, 'production: Factory');
  expectIncludes(navigation, 'quality: BadgeCheck');
  expectIncludes(navigation, 'ecommerce: Store');
  expectIncludes('shared/system-menu-defaults.json', '"enabledByDefault": false');
  expectIncludes('src/stores/navigation.ts', "menu.enabledByDefault === false ? '停用' : '启用'");
  expectExcludes(navigation, [
    "key: 'reports'",
    '/reports',
    'production-moves',
    'production-lines',
    'BarChart3',
  ]);
  expectIncludes(navigation, 'export const activeNavItems = navItems;');
});

run('equipment inspection edits lock referenced facts and explain task snapshots', () => {
  const editor = 'src/views/EquipmentInspectionEditorView.vue';
  const list = 'src/views/EquipmentInspectionView.vue';
  const equipmentTypes = 'src/data/equipment.ts';
  expectIncludes(editor, 'const standardReferenceLocked = computed');
  expectIncludes(editor, ':disabled="standardReferenceLocked"');
  expectIncludes(editor, '当前由 {{ referencingActivePlans.length }} 个启用计划引用');
  expectIncludes(editor, '负责人变更会同步尚未开始的待巡检任务');
  expectIncludes(editor, '当前未完成任务');
  expectIncludes(editor, '保留原设备、标准和时限');
  expectIncludes(editor, 'function taskEventValue');
  expectIncludes(editor, "label: abnormalCompletion ? '异常关闭' : '完成记录'");
  expectIncludes(editor, "label: '取消记录'");
  expectIncludes(editor, '取消本次巡检任务');
  expectIncludes(editor, '若来源计划仍启用，系统会按频次生成下一任务');
  expectIncludes(editor, '保存标准新修订 R');
  expectIncludes(editor, '当前标准修订');
  expectIncludes(editor, '执行标准');
  expectIncludes(editor, '当前没有需要保存的修改');
  expectIncludes(editor, '当前可分步维护并保存');
  expectIncludes(editor, 'equipment-empty-items');
  expectIncludes(editor, 'items: [],');
  expectIncludes(editor, 'response.unchanged');
  expectIncludes(editor, 'const currentPlanTask = computed');
  expectIncludes(editor, '首次计划日期（已冻结）');
  expectIncludes(editor, '内容变更后升至 R');
  expectIncludes(editor, '无变化不升版');
  expectIncludes(editor, "task.status === '巡检中' && canWrite");
  expectIncludes(editor, 'inspection-readonly-value');
  expectIncludes(editor, '<h2>引用计划</h2>');
  expectIncludes(editor, '/master-data/equipment/');
  expectIncludes(list, 'activePlanCount');
  expectIncludes(list, 'record.standardRevision');
  expectIncludes(list, 'incompleteItemCount');
  expectIncludes(list, 'const taskRecords = ref<EquipmentInspectionTask[]>([]);');
  expectIncludes(list, "['待巡检', '巡检中', '异常处理中'].includes(task.status)");
  expectIncludes(list, "activePage === 'inspection-plans' ? '任务日期'");
  expectIncludes(list, "listEquipmentInspectionRecords('inspection-tasks')");
  expectIncludes(list, "'计划状态 / 当前任务'");
  expectIncludes(list, "'使用状态 / 引用'");
  expectIncludes(list, "? '任务状态' : activePage.value === 'inspection-plans' ? '计划状态' : '使用状态'");
  expectIncludes(list, "'计划状态优先' : '使用状态优先'");
  expectIncludes(list, "'计划状态', '当前任务'");
  expectIncludes(list, "'使用状态', '引用情况'");
  expectIncludes(list, "? '计划负责人'");
  expectIncludes(list, 'attention: openTask');
  expectIncludes(list, "? '当前任务' : '下次任务'");
  expectIncludes(list, "currentTask: openTask");
  expectIncludes(list, "'无未完成任务'");
  expectIncludes(list, ':next-step-label="row.nextStepLabel"');
  expectIncludes(list, "'计划负责人', '任务日期', '计划状态', '当前任务'");
  expectExcludes(editor, [
    '巡检标准至少保留一个检查项目',
    ':disabled="standard.items.length <= 1"',
  ]);
  expectIncludes('server/index.mjs', 'function normalizeEquipmentInspectionTaskResults');
  expectIncludes('server/index.mjs', '已偏离冻结标准');
  expectIncludes('server/index.mjs', 'function equipmentInspectionEditableSignature');
  expectIncludes('server/index.mjs', 'allowIncomplete: status !== \'启用\'');
  expectIncludes(equipmentTypes, 'standardRevision: number;');
  expectIncludes(equipmentTypes, "status: '待巡检' | '巡检中' | '异常处理中' | '已完成' | '已取消';");
  expectIncludes(equipmentTypes, 'cancelReason: string;');
  expectIncludes(equipmentTypes, 'retainedTask?: EquipmentInspectionTask | null;');
  expectIncludes(equipmentTypes, 'reassignedTaskCount?: number;');
  expectIncludes(equipmentTypes, 'unchanged?: boolean;');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 341. 设备巡检执行人证据与计划变更影响收口（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 314. 巡检动作证据与计划当前任务影响投影合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 203. 设备巡检动作证据与计划影响第十三轮复核（2026-08-05）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 342. 停用巡检计划的未完成任务与列表责任字段收口（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 315. 巡检计划状态、当前任务与责任人投影合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 204. 巡检计划当前任务可见性第十四轮复核（2026-08-05）');
});

run('router splits production workbench and list pages', () => {
  const router = 'src/router/index.ts';
  expectIncludes(router, 'ProductionWorkbenchDemoView');
  expectIncludes(router, 'Production2View');
  expectIncludes(router, "path: 'production/workbench'");
  expectIncludes(router, "path: 'production/:page/new'");
  expectIncludes(router, "path: 'production/:page/:code'");
  expectIncludes(router, "path: 'production/:page'");
  expectIncludes(router, 'QualityView');
  expectIncludes(router, 'QualityWorkbenchView');
  expectIncludes(router, 'QualityDocumentEditorView');
  expectIncludes(router, "path: 'quality'");
  expectIncludes(router, "path: 'quality/workbench'");
  expectIncludes(router, "path: 'quality/:page/new'");
  expectIncludes(router, "path: 'quality/:page/:code/edit'");
  expectIncludes(router, "path: 'quality/:page/:code'");
  expectIncludes(router, "path: 'quality/:page'");
  expectIncludes(router, 'EcommerceView');
  expectIncludes(router, "path: 'ecommerce'");
  expectIncludes(router, "path: 'ecommerce/:page'");
  expectIncludes(router, "path: 'reports/:pathMatch(.*)*'");
  expectExcludes(router, [
    'ProductionShiftConsoleView',
    'ReportsView',
    'ReportDetailView',
  ]);
});

run('route pages load on demand', () => {
  const router = 'src/router/index.ts';
  const source = read(router);
  assert(
    !/import\s+\w+\s+from\s+['"]\.\.\/views\//.test(source),
    'route page components should not be imported into the initial bundle',
  );
  for (const view of [
    'HomeView',
    'SalesView',
    'PurchaseView',
    'WarehouseView',
    'Production2View',
    'ProductionWorkbenchDemoView',
    'QualityWorkbenchView',
    'QualityView',
    'EcommerceView',
    'MasterDataView',
    'ModuleView',
  ]) {
    expectIncludes(router, `const ${view} = () => import('../views/${view}.vue');`);
  }
});

run('production and quality use the converged event-driven production flow', () => {
  expectIncludes('src/data/production.ts', 'PETG 1.75mm 黑色耗材');
  expectIncludes('src/data/production.ts', 'BOM-PETG-BLK-V2');
  expectIncludes('src/data/production.ts', 'PRC-FILAMENT-PETG-V2');
  expectIncludes('src/data/production.ts', 'WIP 检查');
  expectExcludes('src/views/Production2View.vue', [
    'equipmentInspections',
    'equipmentInspectionRows',
    '新建质检任务',
    '新建设备巡检',
  ]);
  expectIncludes('src/data/production2.ts', 'stageInstances?: Production2ProcessStageInstance[];');
  expectIncludes('src/data/production2.ts', "executionMode: '生产动作' | '质检动作' | '仓库动作' | '工艺展示';");
  for (const legacyFile of [
    'src/views/ProductionView.vue',
    'src/views/ProductionShiftConsoleView.vue',
    'src/views/ProductionFlowWorkbenchView.vue',
    'src/data/productionFlow.ts',
  ]) {
    assert(!existsSync(filePath(legacyFile)), `${legacyFile} should be removed after production convergence`);
  }
  expectIncludes('src/router/index.ts', 'component: ProductionWorkbenchDemoView');
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', '生产工作台');
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', '现场执行');
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', '质检放行和仓库入库由对应模块处理');
  expectIncludes('src/views/Production2View.vue', '流程节点');
  expectIncludes('src/views/Production2View.vue', '维护状态');
  expectIncludes('src/views/Production2View.vue', '生产批次');
  for (const file of [
    'src/data/production.ts',
    'src/data/quality.ts',
    'shared/system-menu-defaults.json',
    'shared/permission-matrix.json',
  ]) {
    expectExcludes(file, [
      'bigRollRelease',
      '待大盘放行检',
      '待放行检',
      '大盘放行检',
      '大盘放行',
      'PQC-MROLL',
      "sourceType: '大盘放行'",
    ]);
  }
  expectIncludes('src/data/quality.ts', 'PQC-REPORT-20260630-001');
  expectIncludes('src/data/quality.ts', 'PQC-SROLL-20260629-006');
  expectIncludes('src/data/quality.ts', 'PQC-SAMPLE-20260628-002');
  expectIncludes('src/data/quality.ts', 'QualityInspectionItem');
  expectIncludes('src/data/quality.ts', 'PETG 原生粒子');
  expectIncludes('src/views/QualityView.vue', 'sourceMeta');
  expectIncludes('src/views/QualityWorkbenchView.vue', '正在读取最新来料质检任务。');
  expectIncludes('src/views/QualityWorkbenchView.vue', '正在读取最新生产质检任务。');
  expectIncludes('src/views/QualityWorkbenchView.vue', '正在读取最新巡检与不良闭环记录。');
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', 'card.qualifiedQty ?? Math.max(0, card.reportedQty - card.defectQty)');
  expectIncludes('src/data/production2.ts', "code: 'PT2-260715-006'");
  expectIncludes('src/data/production2.ts', "linkedPurchaseRequisition: 'PR-20260716-003'");
  expectIncludes('server/index.mjs', '合格 ${formatQty(acceptedQty, card.unit)} 待异常关闭后放行');
  expectExcludes('shared/permission-matrix.json', ['/production/site-execution', '/production/packing-inspection']);
  expectIncludes('src/views/QualityDocumentEditorView.vue', '检查项明细');
  expectIncludes('src/views/QualityDocumentEditorView.vue', 'incomingCheckpointValidationIssues');
  expectIncludes('src/views/QualityDocumentEditorView.vue', "['incoming', 'production', 'patrol'].includes(currentKind)");
  expectIncludes('src/views/QualityDocumentEditorView.vue', '<span>样本异常</span>');
  expectIncludes('src/views/QualityDocumentEditorView.vue', "currentKind === 'patrol' ? '异常点数' : '样本不良'");
  expectIncludes('src/data/quality.ts', 'sampleIssueQty?: string');
  expectIncludes('server/index.mjs', 'incomingQualityCheckpointDecision');
  expectIncludes('server/index.mjs', 'normalizeIncomingQualityDraftProducts');
  expectIncludes('server/index.mjs', 'incomingReinspectionEvidenceTemplate');
  expectIncludes('server/index.mjs', 'normalizeIncomingReinspectionDecisionItems');
  expectIncludes('server/index.mjs', 'productionReinspectionEvidenceTemplate');
  expectIncludes('server/index.mjs', 'normalizeProductionReinspectionDecisionItems');
  expectIncludes('server/index.mjs', "task.dispositionStatus = remainingQty <= 0");
  expectIncludes('src/views/QualityDocumentEditorView.vue', '原记录：');
  expectIncludes('src/views/QualityDocumentEditorView.vue', '历史未留逐项记录，按冻结标准复检');
  expectIncludes('src/views/QualityDocumentEditorView.vue', '选填；检查项已作为判定依据');
  expectIncludes('src/views/QualityDocumentEditorView.vue', '完成返工并送复检');
  expectIncludes('src/views/QualityDocumentEditorView.vue', '返工记录：');
  expectIncludes('src/views/QualityDocumentEditorView.vue', '流程节点');
  expectIncludes('src/views/QualityDocumentEditorView.vue', '质量状态');
  expectExcludes('src/views/QualityDocumentEditorView.vue', ['const traceRows = computed', '<h2>责任追溯</h2>']);
  expectExcludes('src/data/quality.ts', ['FTX-', 'B200 传感', '铝合金外壳', '大盘放行']);
});

run('ecommerce prototype stays isolated and disabled until the channel scope is enabled', () => {
  expectIncludes('src/data/ecommerce.ts', 'ECO-TM-260709-1001');
  expectIncludes('src/data/ecommerce.ts', 'MAP-TM-PETG-BLK-1KG');
  expectIncludes('src/data/ecommerce.ts', 'TM-SKU-PETG-BLK-1KG');
  expectIncludes('src/views/EcommerceView.vue', '电商渠道');
  expectIncludes('src/views/EcommerceView.vue', '导入订单');
  expectIncludes('src/views/EcommerceView.vue', '导出库存表');
  expectIncludes('src/views/EcommerceView.vue', '导出发货表');
  expectIncludes('src/views/EcommerceView.vue', '已选择${importActionLabel()}文件');
  expectIncludes('src/views/EcommerceView.vue', '导入平台订单文件');
  expectExcludes('src/views/EcommerceView.vue', [
    'ecommerce-bridge-strip',
    'ecommerce-insight-grid',
    '平台渠道层',
    '销售订单 / 仓库出库 / 退货质检 / 财务对账',
    '真实接口',
    '拉取订单',
    '推送库存',
    '回传发货',
    '同步售后',
  ]);
  expectIncludes('src/router/index.ts', "const ecommercePageTitles = pageTitleMapFromMenu('ecommerce')");
  expectIncludes('shared/system-menu-defaults.json', '"code": "MENU-ECOMMERCE"');
  expectIncludes('shared/system-menu-defaults.json', '"enabledByDefault": false');
  expectIncludes('shared/system-menu-defaults.json', '"path": "/ecommerce/workbench"');
  expectIncludes('shared/system-menu-defaults.json', '"path": "/ecommerce/orders"');
  expectIncludes('shared/permission-matrix.json', '"ecommerce": "PERM-SALES-EDIT"');
  expectExcludes('shared/permission-matrix.json', [
    '"notificationModuleOptions": ["销售", "采购", "销售/采购", "仓库", "生产", "质检", "设备", "电商"]',
    '"电商": ["订单导入", "库存表导出", "发货表导出", "售后导入", "平台对账"]',
  ]);
});

run('active pages avoid deferred production copy', () => {
  const activeFiles = [
    'src/components/AppSidebar.vue',
    'src/components/ExceptionActionDialog.vue',
    'src/views/SalesView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseView.vue',
    'src/views/WarehouseView.vue',
    'src/views/FinanceView.vue',
    'src/views/MasterMaterialEditorView.vue',
    'src/components/BusinessListToolbar.vue',
  ];
  const staleTokens = ['生产模块', '生产管理部', '生产备料', '生产计划取消', '生产无法继续', '入库、生产、出库'];
  for (const activeFile of activeFiles) {
    expectExcludes(activeFile, staleTokens);
  }
  const unfinishedTokens = ['正式系统会', '暂未接入真实', '前端 mock', '后续接入权限', 'DEMO'];
  for (const activeFile of activeFiles) {
    expectExcludes(activeFile, unfinishedTokens);
  }
});

run('obsolete mock document editors stay removed', () => {
  assert(!existsSync(filePath('src/views/WarehouseDocumentEditorView.vue')), 'old warehouse mock editor should not be present');
  assert(!existsSync(filePath('src/views/FinanceDocumentEditorView.vue')), 'old finance mock editor should not be present');
  expectExcludes('src/router/index.ts', ['WarehouseDocumentEditorView', 'FinanceDocumentEditorView']);
});

run('warehouse and master-data omit deferred child tabs', () => {
  expectIncludes('src/views/WarehouseView.vue', 'type ActiveWarehouseTabKey = WarehouseTabKey');
  expectIncludes('src/views/MasterDataView.vue', 'type ActiveMasterDataTabKey = MasterDataTabKey');
  expectExcludes('src/data/navigation.ts', ['/warehouse/production-moves']);
});

run('reference picker keeps searchable detail selection', () => {
  const picker = 'src/components/ReferencePicker.vue';
  expectIncludes(picker, 'listReference');
  expectIncludes(picker, 'type="search"');
  expectIncludes(picker, 'option.primary');
  expectIncludes(picker, 'option.secondary');
  expectIncludes(picker, 'option.meta');
  expectIncludes(picker, 'optionSummary');
  expectIncludes(picker, 'excludeCodes?: string[]');
  expectIncludes(picker, 'emptyText?: string');
  expectIncludes(picker, 'excludedCodeSet');
  expectIncludes(picker, '!excludedCodeSet.value.has(option.code)');
  expectIncludes(picker, '{{ emptyText }}');
  expectExcludes(picker, ['支持搜索、分页候选和明细预览']);
});

run('material reference candidates hide latest price', () => {
  const server = read('server/index.mjs');
  const materialBranch = server.slice(
    server.indexOf("if (type === 'materials')"),
    server.indexOf("if (type === 'warehouses')"),
  );
  assert(materialBranch.includes('secondary:'), 'material reference branch should still provide secondary text');
  assert(!materialBranch.includes('latestPrice'), 'material reference candidates should not expose latest price');
  assert(!materialBranch.includes('最近价'), 'material reference candidates should not render latest price text');
});

run('production recipe losses stay separate from recipe lines', () => {
  const view = read('src/views/Production2View.vue');
  const data = read('src/data/production2.ts');
  const recipeLineType = view.slice(
    view.indexOf('type RecipeDraftLine = {'),
    view.indexOf('type RecipeEstimatedLossDraftLine = {'),
  );
  const recipeMaterialType = data.slice(
    data.indexOf('export type Production2RecipeMaterial = {'),
    data.indexOf('export type Production2RecipeEstimatedLoss = {'),
  );
  assert(!recipeLineType.includes('fixedLoss'), 'recipe draft material lines should not own loss fields');
  assert(!recipeLineType.includes('lossRatePercent'), 'recipe draft material lines should not own loss rates');
  assert(!recipeMaterialType.includes('fixedLoss'), 'recipe data material lines should not own loss fields');
  assert(!recipeMaterialType.includes('lossRatePercent'), 'recipe data material lines should not own loss rates');
  assert(view.includes('type RecipeEstimatedLossDraftLine'), 'recipe view should define estimated loss draft lines');
  assert(view.includes('production-recipe-loss-section'), 'recipe view should render a standalone estimated loss section');
  assert(data.includes('estimatedLosses: Production2RecipeEstimatedLoss[]'), 'recipe data should store estimated losses separately');
});

run('production recipe material selections prevent duplicates', () => {
  const view = read('src/views/Production2View.vue');
  assert(view.includes(':exclude-codes="recipeMaterialExcludeCodes(entry.index)"'), 'recipe material picker should hide materials selected by other lines');
  assert(view.includes('recipeLossMaterialOptions(index)'), 'estimated loss picker should be scoped per loss row');
  assert(view.includes('recipeFirstDuplicateMaterialCode()'), 'recipe submit validation should reject duplicate material lines');
  assert(view.includes('recipeFirstDuplicateEstimatedLossCode()'), 'recipe submit validation should reject duplicate estimated loss lines');
  assert(view.includes('recipeMaterialHasDuplicate(line)'), 'duplicate material rows should be highlighted');
  assert(view.includes('recipeEstimatedLossHasDuplicate(line)'), 'duplicate estimated loss rows should be highlighted');
  assert(view.includes('kind="生产产出"'), 'recipe output picker should include producible finished and semi-finished materials');
  assert(view.includes('recipeEstimatedLossIsEmpty'), 'recipe submit validation should reject zero-value estimated loss rules');
  assert(view.includes('所有配方物料都已设置预估损耗'), 'adding estimated losses should stop once every recipe material is covered');
  assert(
    view.includes('<h2>配方明细</h2>') && view.includes('<h3>投料组成</h3>') && view.includes('<h3>固定用量</h3>'),
    'recipe editor should group percentage inputs and fixed usage while keeping both calculation sections distinct',
  );
  assert(view.includes('<h2>预估损耗规则</h2>'), 'recipe editor should describe losses as planning rules');
  assert(view.includes('async function loadPersistedRecipeDetail(code: string)'), 'recipe details should refresh from the persisted record instead of keeping the static catalog snapshot');
  assert(view.includes("if (activePage.value === 'recipes') return recipeFlowRecords.value;"), 'recipe logs should read persisted flow records');
  assert(view.includes('recipeIncomingQualityRequired(raw.qualityControl)'), 'recipe materials should interpret incoming inspection rules consistently');
  assert(!view.includes('function defaultAttachments('), 'production pages should not fabricate attachment files from row values');
  assert(!view.includes('<select v-model="recipeDraft.status"'), 'recipe lifecycle should be controlled by commands instead of a status dropdown');
});

run('production system actions stay fixed and separate from process stages', () => {
  const view = read('src/views/Production2View.vue');
  const data = read('src/data/production2.ts');
  const router = read('src/router/index.ts');
  const server = read('server/index.mjs');
  const catalog = JSON.parse(read('shared/production-system-actions.json'));
  const stageCatalog = JSON.parse(read('shared/production-process-stages.json'));
  const actions = catalog.actions || [];
  const stages = stageCatalog.stages || [];
  assert(view.includes("const processStepIsEditable = computed(() => false)"), 'system actions should remain read-only');
  assert(view.includes('|| isProcessStepDocument.value'), 'system action details should stay readonly even when an edit URL is entered directly');
  assert(view.includes("if (page === 'process-steps') return production2SystemActions.map"), 'system action rows should come from the fixed action library');
  assert(view.includes("tableHeaders: ['系统动作', '负责部门/执行方式', '触发与入口', '结果与控制']"), 'system action list should use a scan-friendly execution contract hierarchy');
  assert(view.includes("activePage.value !== 'process-steps'"), 'system action list should avoid a redundant standalone status column');
  assert(view.includes("'process-steps': '负责部门'") && view.includes("'process-steps': '执行方式'"), 'system action filters should separate owner domain from execution mode');
  assert(view.includes("const showListSort = computed(() => activePage.value !== 'process-steps')"), 'fixed system actions should not expose fake date or status sorting');
  assert(view.includes("activePage.value === 'process-steps' ? '' : activePageConfig.value.dateLabel"), 'system action filters should not expose a fabricated maintenance date range');
  assert(view.includes("if (isSystemActionList) return [...rows].sort"), 'system actions should ignore hidden sort state and stay in catalog sequence');
  assert(view.includes('const matchesStatus = isSystemActionList ||'), 'system actions should ignore hidden status filters inherited from other production lists');
  assert(view.includes('<span>共 {{ visibleProductionRows.length }} 条</span>') && !view.includes('class="pager"'), 'production lists should show a real result count without a disabled single-page pager');
  assert(view.includes('<h2>动作定义</h2>') && view.includes('<h2>执行契约</h2>'), 'system action detail should expose definition and execution contract');
  assert(view.includes('<aside v-if="showProductionSummaryPanel"'), 'system action detail should omit the entire transaction summary rail');
  assert(view.includes("{ label: '动作编号', value: processStepDraft.value.code || '-' }"), 'system action details should keep the action name in the title and the code in the fact grid');
  assert(view.includes("{ label: '完成方式', value: processStepDraft.value.completionMode || '-' }"), 'system action details should separate trigger mode from completion mode');
  assert(view.includes("label: '适用路线/阶段'") && view.includes('processStepBoundStageUsageLabels.value.join'), 'system action details should expose the actual route-specific stages that consume the capability');
  assert(view.includes(".map((stepCode) => `${routeType} · ${processTemplateStepName(stepCode, routeType)}`)"), 'system action stage usage should retain route-specific stage names');
  assert(router.includes("if (page === 'process-steps')") && router.includes("`/production/process-steps/${encodeURIComponent(code)}`"), 'system action new and edit routes should stay inside the readonly capability catalog');
  assert(!view.includes("name: '新建系统动作'"), 'system action compatibility code should not retain an unreachable editable draft');
  assert(view.includes("{ label: '直接产生', value: processStepDraft.value.emittedEvents.join('、') || '-'"), 'system action details should label immediate outputs precisely');
  assert(view.includes("{ label: '完成依据', value: processStepDraft.value.completionSignal || '-'"), 'system action details should expose the downstream completion evidence separately');
  assert(data.includes('export type Production2SystemAction'), 'production data should expose fixed system action contracts');
  assert(data.includes("import productionSystemActionCatalog from '../../shared/production-system-actions.json'"), 'system action pages should consume the shared authoritative catalog');
  assert(data.includes("import productionProcessStageCatalog from '../../shared/production-process-stages.json'"), 'process pages should consume the shared authoritative stage catalog');
  assert(server.includes("'shared', 'production-system-actions.json'"), 'runtime action instances should consume the same authoritative catalog');
  assert(server.includes("'shared', 'production-process-stages.json'"), 'runtime process stages should consume the same authoritative stage catalog');
  assert(server.includes('function productionActionInstanceStatus('), 'runtime action instances should derive their own action status');
  assert(!server.includes('const required = !(action.conditional'), 'material preparation must not be hard-coded as an always-inapplicable runtime action');
  assert(stages.length === 10, 'the standard production route should retain ten canonical stages');
  assert(stages.every((stage) => stage.actionCodes?.length && stage.actionCodes.every((code) => actions.some((action) => action.code === code))), 'every process stage must bind only implemented system actions');
  assert(stages.filter((stage) => stage.owner === '生产').every((stage) => stage.executionMode === '生产动作'), 'production-owned stages should not reuse the system-action catalog label as their stage execution type');
  assert(view.includes('const processStepActionCodeByType: Record<ProcessStepActionType, string>'), 'legacy action snapshots should map through canonical system action codes');
  assert(!view.includes("label: '包装确认'") && !view.includes("label: '半成品报工检'"), 'legacy compatibility presets must not retain a second set of action names');
  assert(stages.find((stage) => stage.code === 'P2-STEP-MATERIAL-ISSUE')?.actionCodes?.join(',') === 'SA2-CREATE-MATERIAL-ISSUE', 'the material stage should only bind the implemented warehouse issue capability');
  assert(!JSON.stringify(stages).includes('生产确认领料烘干'), 'retired material-preparation confirmation must not survive in the canonical route');
  assert(actions.some((action) => action.code === 'SA2-START-EXECUTION'), 'system action catalog should include the start execution capability');
  assert(actions.some((action) => action.code === 'SA2-CREATE-STARTUP-QC'), 'system action catalog should include event-driven startup inspection creation');
  const materialIssue = actions.find((action) => action.code === 'SA2-CREATE-MATERIAL-ISSUE');
  const reportInspection = actions.find((action) => action.code === 'SA2-CREATE-REPORT-QC');
  const productionReceipt = actions.find((action) => action.code === 'SA2-CREATE-PRODUCTION-RECEIPT');
  assert(actions.length === 9, 'the live system action catalog should contain only implemented capabilities');
  assert(!actions.some((action) => action.code === 'SA2-RECORD-MATERIAL-PREP'), 'unimplemented material preparation recording must not appear as an enabled action');
  assert(materialIssue?.trigger === '生产工单释放成功', 'production material issue should be triggered by work-order release');
  assert(reportInspection?.requiredInputs?.includes('检验类型'), 'report inspection idempotency requires an explicit inspection type input');
  assert(productionReceipt?.completionMode === '等待后续完成', 'production receipt creation should wait for warehouse posting');
  assert(data.includes("| '待触发'"), 'frontend action instance status should include automatic actions waiting for their event');
  assert(data.includes('resultDocument?: string;') && data.includes('idempotencyScope?: string;'), 'frontend action instances should retain runtime audit evidence');
  assert(!productionReceipt?.requiredInputs?.includes('目标仓库'), 'warehouse and location must not be fixed before the warehouse registers production receipt');
  assert(productionReceipt?.result?.includes('仓库登记入库仓库和库位'), 'production receipt creation should retain warehouse responsibility for destination selection');
  const startupInspection = actions.find((action) => action.code === 'SA2-CREATE-STARTUP-QC');
  assert(startupInspection?.completionSignal === '开机首检已放行或处置已完成', 'startup inspection creation should use release or completed disposition as completion evidence');
  assert(!startupInspection?.emittedEvents?.includes('开机首检已放行'), 'startup inspection creation must not claim downstream inspection completion as an immediate output');
});

run('production loss ledger stays readonly while retaining traceable detail', () => {
  const view = read('src/views/Production2View.vue');
  const data = read('src/data/production2.ts');
  const api = read('src/services/api.ts');
  const server = read('server/index.mjs');
  const router = read('src/router/index.ts');
  const styles = read('src/styles/main.css');
  const detailRouteStart = router.indexOf("path: 'production/:page/:code'");
  const listRouteStart = router.indexOf("path: 'production/:page'", detailRouteStart + 1);
  const detailRoute = router.slice(detailRouteStart, listRouteStart);
  const lossProjectionStart = server.indexOf('function projectProductionLossRecords(data)');
  const lossProjectionEnd = server.indexOf('function hydrateProductionExceptionFlowRecords', lossProjectionStart);
  const lossProjection = server.slice(lossProjectionStart, lossProjectionEnd);
  assert(view.includes("if (page === 'loss-ledger') return production2LossRecords.map"), 'loss ledger list should consume actual-loss records instead of recipe estimates');
  assert(view.includes(':aria-label="`查看损耗记录 ${row.code}`"'), 'loss records should open their own readonly evidence detail');
  assert(view.includes("const sourceFactLabel = text(raw.sourceDoc).startsWith('PRPT2-')") && view.includes("{ label: sourceFactLabel, value: text(raw.sourceDoc), route: productionLossSourceRoute(raw) }"), 'loss detail should name and link its actual source object');
  assert(view.includes("{ label: '生产工单', value: text(raw.workOrderCode), route: productionObjectRoute(text(raw.workOrderCode)) }"), 'loss detail should link back to its work order');
  assert(view.includes("{ label: '生产批次', value: text(raw.productionBatchCode), route: productionObjectRoute(text(raw.productionBatchCode)) }"), 'loss detail should keep the production batch separate from source evidence');
  assert(view.includes("{ label: '总损耗', value: `${numberText(raw.lossKg)} kg` }") && view.includes("{ label: '工艺内损耗', value: `${numberText(raw.plannedLossKg)} kg` }") && view.includes("{ label: '异常损耗', value: `${numberText(raw.abnormalLossKg)} kg` }") && view.includes("{ label: '待分类损耗', value: `${numberText(unclassifiedLossKg)} kg`"), 'loss detail should reconcile total, process, abnormal, and unclassified loss');
  assert(view.includes("if (plannedLoss > 0 && abnormalLoss > 0) return '工艺内 + 异常'"), 'mixed loss must not be flattened into a single abnormal status');
  assert(view.includes("const explicit = Number(raw.unclassifiedLossKg)") && view.includes("toNumber(raw.lossKg) - toNumber(raw.plannedLossKg) - toNumber(raw.abnormalLossKg)"), 'loss UI should preserve quantity conservation for compatible records');
  assert(!view.includes("处置 ${text(raw.disposition)} · 记录 ${text(raw.status)}"), 'loss list should not compress disposition and record lifecycle into competing status text');
  assert(view.includes("responsiblePerson || (abnormalLossKg > 0 || unclassifiedLossKg > 0 ? '责任未判定' : '无需归责')"), 'loss responsibility should remain independent from record confirmation');
  assert(view.includes("activePage.value === 'loss-ledger' && responsibilityAndMode[1]?.options.length === 0") && view.includes("activePage.value === 'loss-ledger' && fields[0]?.options.length <= 1"), 'loss filters should hide empty responsibility and single-value status dimensions');
  assert(data.includes("sourceType: '生产报工' | '质检判定' | '异常事件' | '复绕损耗' | '包装损耗' | '工艺正常损耗'"), 'loss records should keep their factual source type');
  assert(data.includes('disposition: string;'), 'loss business handling should remain a descriptive source-owned fact rather than a fake local action enum');
  assert(data.includes('productionBatchCode: string;') && data.includes('productCode: string;'), 'loss records should preserve distinct batch and material identities');
  assert(data.includes('unclassifiedLossKg: number;'), 'loss records should expose the unclassified quantity needed for conservation');
  assert(api.includes("request<{ items: Production2LossRecord[] }>('/production/loss-records')"), 'loss ledger should load its readonly projection from the server');
  assert(lossProjectionStart >= 0 && lossProjection.includes("disposition.action !== 'scrap'"), 'loss projection should consume actual report loss and completed scrap facts');
  assert(lossProjection.includes('plannedLossKg: isRewindLoss ? totalLossKg : 0') && lossProjection.includes("status: isRewindLoss ? '已确认' : '待确认'"), 'rewind loss already captured by source-weight conservation should be confirmed as process loss');
  assert(!lossProjection.includes('productionExceptions') && !lossProjection.includes('estimatedLoss'), 'exception estimates must not be projected as actual loss');
  assert(view.includes('v-if="index === 2"') && view.includes(':code="text(row.raw.productCode, \'\')"'), 'loss product cells should use the shared material identity presentation');
  assert(detailRouteStart >= 0 && !detailRoute.includes("page === 'loss-ledger'"), 'production detail route should remain available for readonly loss records');
  assert(styles.includes('.quote-editor.is-detail-view .quote-form-grid.is-entry-only'), 'readonly details without a summary rail should use the full content width');
});

run('production exceptions start from active execution and separate impact from lifecycle', () => {
  const view = read('src/views/Production2View.vue');
  const server = read('server/index.mjs');
  assert(view.includes("createLabel: '报告异常'"), 'exception list should use the report-anomaly business action');
  assert(
    view.includes("? '/production/workbench?tab=site'") && view.includes(':to="productionListCreatePath"'),
    'exception reporting should start from a production batch on the site workbench instead of a blank document',
  );
  assert(view.includes("statusColumnTitle: '处理状态'"), 'exception lifecycle should be labeled as processing status');
  assert(view.includes("if (activePage.value === 'exceptions')") && view.includes("? '来源质检'") && view.includes("? '来源任务'"), 'exception facts should name their real source context');
  assert(view.includes('const amountSortableProductionPages = new Set<ProductionPage>([') && view.includes('const showAmountSort = computed(() => amountSortableProductionPages.has(activePage.value));') && view.includes(':show-amount-sort="showAmountSort"'), 'mixed-unit exception quantities must not be compared by a numeric amount sort');
  assert(view.includes('function productionExceptionOperationalSort(') && view.includes("? '未关闭优先'"), 'exception default sorting should keep unresolved and higher-severity work visible first');
  assert(view.includes("exceptions: '记录人'") && view.includes("{ label: '记录人', value: text(raw?.createdBy || raw?.owner, '-') }"), 'exception record actors must not be mislabeled as business owners');
  assert(view.includes("searchPlaceholder: '搜索异常、来源、工单、记录人或责任分工'"), 'exception search guidance should use the same recorder and responsibility semantics as the list');
  assert(view.includes("{ label: '影响说明', value: productionDisplayTerm(raw.effect), full: true, multiline: true }") && !view.includes("label: '执行影响'"), 'exception detail should keep one complete impact fact instead of two overlapping impact fields');
  assert(view.includes("if (text(raw?.type) === '缺料')") && view.includes('缺口已有在途、待检或待入库数量覆盖，等待形成可用库存。'), 'material shortages should describe their live cross-module coverage instead of a generic assignee workflow');
  assert(view.includes('质量已经判定不合格，等待质检分配返工、让步或报废处置。'), 'quality exception stages should name the owning quality workflow');
  assert(view.includes("{ label: '责任分工', value: productionDisplayTerm(text(raw.responsibility, '-')) }"), 'exception detail should expose the responsible function');
  assert(view.includes("title: '责任与处置'"), 'exception detail should group responsibility and disposition together');
  assert(view.includes("if (text(raw.relatedWorkOrder, '')) return '查看生产工单';"), 'exception actions should name the concrete related document instead of a vague disposition object');
  assert(view.includes("if (/^(QC2-|PQC-|IQC-)/.test(code)) return `/quality/production/${encodeURIComponent(code)}`;"), 'quality exception sources should drill into the owning quality document');
  assert(view.includes("if (stage === '待处置') return '前往质量处置';") && view.includes("if (stage === '待复检') return '前往质量复检';"), 'quality exception actions should follow the persisted disposition stage instead of matching narrative text');
  assert(view.includes("if (isQualityProductionException(raw)) return productionExceptionQualityActionLabel(raw);"), 'exception primary actions should separate quality handling from onsite stop recovery');
  assert(view.includes("const exceptionFlowRecords = ref<FlowRecord[]>([]);") && view.includes("if (activePage.value === 'exceptions') return exceptionFlowRecords.value;"), 'exception details should render their own persisted flow instead of a generic synthetic timeline');
  assert(view.includes("exceptionFlowRecords.value = toArray<FlowRecord>(response.flowRecords);"), 'exception detail and recovery responses should consume server-owned flow records');
  assert(view.includes("if (text(raw.type) === '缺料' && productionExceptionSourceTaskCode(raw)) return '查看物料储备';"), 'shortage exceptions should route to the owning task material reserve instead of preferring a downstream work order');
  assert(view.includes("title: '物料储备校验'") && view.includes("function exceptionShortageMaterialLines("), 'shortage exception details should expose the live material readiness facts that own closure');
  assert(view.includes("page === 'material-requests' || page === 'exceptions'") && view.includes('if (response.task?.code) upsertPersistedProductionTask('), 'exception details should load live inventory and the persisted source task before judging shortage readiness');
  assert(server.includes('function ensureProductionQualityException(data, task, card, decision, actor, now)'), 'a rejected production quality decision should create its own traceable production exception');
  assert(server.includes('findProductionQualityException(production, task, card)'), 'quality handling must not reuse an unrelated exception from the same production batch');
  assert(server.includes('data.production.productionExceptionFlowRecords ||= {};') && server.includes('function appendProductionExceptionFlow('), 'production exceptions should keep an independent append-only service flow');
  assert(server.includes('flowRecords: production.productionExceptionFlowRecords[exception.code] || []'), 'exception detail must not leak the broader execution-card flow into its own log');
  assert(server.includes('function syncProductionShortageExceptions(data)') && server.includes("exception.status === '已关闭' ? '物料储备复核' : '缺料条件更新'"), 'shortage exceptions should follow live material readiness and append their own transition log');
  assert(server.includes('task: productionExceptionSourceTask(production, exception)'), 'exception detail should return its authoritative source task instead of relying on seeded frontend data');
  assert(server.includes("if (type === '质检不合格')") && server.includes('质检不合格异常由生产质检判定自动生成'), 'the server should reject duplicate quality exceptions from the production site report endpoint');
  assert(server.includes('来源于质量判定，请在生产质检单完成返工、复检、让步或报废处置'), 'the generic recovery endpoint should reject quality disposition shortcuts');
});

run('production process pages keep route presets readable and constrained', () => {
  const view = read('src/views/Production2View.vue');
  const data = read('src/data/production2.ts');
  const server = read('server/index.mjs');
  assert(view.includes("tableHeaders: ['生产工艺', '路线/产品族', '温控/产线', '工艺路线']"), 'process list should prioritize readable business meaning');
  assert(view.includes("statusColumnTitle: '版本状态'"), 'process list should describe the rule lifecycle as version status');
  assert(view.includes("&& (isProductionNewDocument.value || processTemplateDraft.value.status === '草稿')"), 'only new or draft process versions should enter the editable state');
  assert(view.includes("|| (isProcessTemplateDocument.value && !processTemplateIsEditable.value)"), 'activated or disabled process versions should render as readonly even on a direct edit URL');
  assert(view.includes('const processTemplateUsesInlineAttachments = computed(() => isProcessTemplateDocument.value && processTemplateIsEditable.value)') && view.includes('v-if="processTemplateUsesInlineAttachments"'), 'editable process templates should keep attachments inline and preserve the full-width route editor');
  assert(view.includes("{ label: '工艺编号', value: processTemplateDraft.value.code || '-' }") && view.includes("{ label: '适用产线', value: processTemplateDraft.value.lineTypes.join('、') || '未限定' }"), 'process template basic facts should stay concise and business-focused');
  assert(view.includes("? '维护信息'") && view.includes('const processTemplateDocumentSummaryFacts = computed<DetailFact[]>(() => ['), 'process template detail should keep version maintenance facts in the shared summary rail');
  assert(view.includes('v-if="!processTemplateIsEditable" class="process-template-stage-readonly"'), 'process template detail should show every stage in the compact readonly route');
  assert(view.includes('v-if="line.expanded"'), 'process template editing should disclose stage settings on demand');
  assert(
    view.includes('const processTemplateUnsavedSource = computed(() => ({')
      && view.includes('delete persistedStep.expanded;')
      && view.includes("if (activePage.value === 'process-templates') return processTemplateUnsavedSource.value;"),
    'expanding a process stage is display state and must not mark the business draft as unsaved',
  );
  assert(view.includes('class="process-template-row-actions"'), 'editable process stages should keep a consistent settings control');
  assert(view.includes('{{ line.coreEquipment || \'-\' }}') && view.includes('{{ line.commonIssues || \'-\' }}'), 'compact process route details should retain equipment and exception facts');
  assert(!view.includes('class="process-template-step-no"'), 'process stage numbers should stay inside the stage heading instead of consuming a separate column');
  assert(view.includes('class="process-template-stage-fact is-long-fact"') && view.includes('class="process-template-work-line is-issue-field"'), 'long process requirements and exception text should use full-width rows');
  assert(!view.includes('processTemplateStepToneClass'), 'process stages should avoid decorative semantic coloring');
  assert(!view.includes('processTemplateZoneToneClass'), 'temperature zones should keep a neutral technical grid');
  assert(view.includes("@change=\"applyProcessTemplateRoutePreset\""), 'route changes should apply the matching process skeleton');
  assert(view.includes("function standardizedProcessTemplateZones(value: AnyRecord[])"), 'all process templates should normalize legacy zones to the standard layout');
  assert(view.includes("{ name: '水槽', value: '' }"), 'new process templates should require manually entered temperature values');
  assert(view.includes('processTemplateDraft.value.temperatureZones as unknown as AnyRecord[]'), 'route changes should retain entered temperatures in the standard 14-zone layout');
  assert(view.includes("return `请填写${emptyZone.name}温度`"), 'process templates should block saving until every zone temperature is entered');
  assert(
    view.includes("const standardZoneOrder = ['水槽', '10区', '9区', '4区', '3区', '2区', '1区', '13区', '12区', '11区', '8区', '7区', '6区', '5区']"),
    'all process templates should preserve the standard 14-zone physical panel reading order',
  );
  assert(view.includes('v-if="line.expanded"'), 'existing process template edit pages may still collapse individual stage settings');
  assert(view.includes('const showProductionAttachmentSection = computed') && view.includes('const showProductionSummaryPanel = computed'), 'read-only and unsupported production documents should hide empty attachment noise');
  assert(view.includes('async function loadPersistedProcessTemplateDetail(code: string)'), 'process details should refresh from the persisted record instead of keeping a static catalog snapshot');
  assert(view.includes("if (activePage.value === 'process-templates') return processTemplateFlowRecords.value;"), 'process logs should read persisted flow records');
  assert(view.includes("if (activePage.value === 'process-templates' && route.query.copy) return '创建工艺新版本';"), 'copied process templates should be presented as a new version rather than a blank template');
  assert(view.includes("if (routeType === '直接收卷') return '成品收卷与报工';"), 'direct winding should not be described as rewinding');
  assert(view.includes("if (routeType === '大盘复绕') return '复绕成品与报工';"), 'rewinding should retain its distinct finished-reporting stage');
  assert(!view.includes('复绕后按成品卷数登记'), 'direct process routes should not inherit stale rewinding wording');
  assert(view.includes('processTemplateBoundSystemActions(line.stepCode)') && view.includes('process-template-system-action-link'), 'each process stage should visibly link to its bound system action');
  assert(view.includes("code && code !== '-' ? code : ''"), 'sentinel source values must not render as clickable process versions');
  assert(view.includes('/生产确认领料烘干|领料烘干确认/'), 'legacy material guidance should be normalized when old process versions are read');
  assert(data.includes('productionProcessStageCatalog.stages.map'), 'frontend process snapshots should derive from the shared stage catalog');
  assert(server.includes('productionProcessMaintainedGuidance(instruction.coreEquipment || supplied.coreEquipment'), 'work-order snapshots should preserve maintained process equipment guidance');
  assert(server.includes('instruction.workContent || instruction.workInstruction'), 'work-order snapshots should preserve maintained process work instructions');
  assert(server.includes('productionProcessStageRouteGuidance(template, code)'), 'server-frozen process stages should distinguish direct winding from rewinding');
});

run('production tasks and work orders keep planning and execution facts distinct', () => {
  const view = read('src/views/Production2View.vue');
  const server = read('server/index.mjs');
  const workOrderOverviewStart = view.indexOf("if (row.page === 'work-orders') {");
  const workOrderOverviewEnd = view.indexOf('const release = releaseBatchForExecutionCard(raw.code);', workOrderOverviewStart);
  const workOrderOverviewBlock = view.slice(workOrderOverviewStart, workOrderOverviewEnd);
  const taskOverviewStart = view.indexOf("if (row.page === 'tasks') {");
  const taskOverviewEnd = view.indexOf("if (row.page === 'work-orders') {", taskOverviewStart);
  const taskOverviewBlock = view.slice(taskOverviewStart, taskOverviewEnd);
  assert(
    view.includes("tableHeaders: ['生产任务', '需求来源/负责人', '计划生产/交期']"),
    'production task list should reserve the main table for identity and planning facts',
  );
  assert(
    view.includes("tableHeaders: ['生产工单/成品', '任务需求', '计划数量/要求日期', '配方/工艺']"),
    'work order list should reserve the main table for stable document and frozen-rule facts',
  );
  assert(
    view.includes("searchPlaceholder: '搜索工单号、任务需求、成品、要求日期、配方或工艺'")
      && view.includes("text(row.raw.productCode, '')")
      && view.includes('text-only')
      && view.includes("{ title: `配方 · ${text(raw.recipeCode, '未选配方')}`, subtitle: `工艺 · ${text(raw.processTemplateCode, '未选工艺')}` }")
      && view.includes("activePage === 'work-orders' && text(row.raw.productCode, '')")
      && view.includes('.production-list-shell.production-work-orders-shell {')
      && view.includes('grid-template-columns: minmax(0, 1fr) 280px;')
      && view.includes('grid-template-columns: minmax(0, 1fr) 268px;')
      && view.includes('grid-template-columns: 68px minmax(0, 1fr);')
      && view.includes('minmax(142px, 0.9fr)'),
    'work order list should use a lightweight product identity, truthful search scope, labeled frozen versions and a compact status column',
  );
  assert(
    view.includes("'work-orders': '安排 · 生产 · 入库'") && view.includes('productionListStatusOverview(row)'),
    'work order execution dimensions should be grouped in the right-side status overview',
  );
  assert(
    workOrderOverviewStart >= 0
      && workOrderOverviewEnd > workOrderOverviewStart
      && !workOrderOverviewBlock.includes('progress:'),
    'work order status overview should not repeat inbound progress above its arrangement, production and inbound facts',
  );
  assert(
    taskOverviewStart >= 0
      && taskOverviewEnd > taskOverviewStart
      && !taskOverviewBlock.includes('progress:'),
    'task status overview should not repeat inbound progress above its work-order, arrangement, inbound, and material facts',
  );
  assert(
    view.includes('workOrderDraft.value = workOrderDraftFromRow(currentProductionDocument.value);')
      && view.includes('const emptyDraft = emptyWorkOrderDraft();')
      && view.includes('draft.unit = emptyDraft.unit;')
      && view.includes('draft.dueDate = emptyDraft.dueDate;')
      && view.includes('draft.ownerEmployeeCode = emptyDraft.ownerEmployeeCode;'),
    'removing the final work-order demand should restore the original new-page snapshot while keeping edit-page compatibility fields coherent',
  );
  assert(
    view.includes(':primary-status="taskLifecycleStatusLabel"') && view.includes(':items="taskStatusPanelItems"'),
    'production task should separate its quantity-derived main status from inbound and material progress',
  );
  assert(
    view.includes('sourceLineId: string;') && view.includes('function taskSourceDocumentDisplay(draft: ProductionTaskDraft)'),
    'production task list, detail and edit pages should retain the same source document line',
  );
  assert(
    view.includes('const taskStructureIsEditable = computed') && view.includes('const taskConfirmedEdit = computed'),
    'production task change pages should freeze source-linked or downstream-referenced task structure',
  );
  assert(
    view.includes('taskOperationalNextAction(raw)')
      && view.includes("if (row.nextStep.includes('质检')) return '等待来料质检';"),
    'production task next-step labels and primary actions should follow the actual blocking business stage',
  );
  assert(
    view.includes("if (lifecycle === '草稿') return '编辑后提交';")
      && view.includes("if (taskLifecycleStatusLabel.value === '草稿') return '编辑草稿';")
      && view.includes("router.push(`/production/tasks/${encodeURIComponent(row.code)}/edit`)")
      && view.includes('function taskProductQuantitySummary(')
      && view.includes('function taskReleaseIsCompleteForProducts(')
      && view.includes('allocation.taskCode === taskCode')
      && view.includes('allocation.sourceLineId === line.lineId')
      && view.includes("unit: '项'"),
    'draft tasks must be edited before work-order creation and mixed-unit task progress must not add incompatible quantities',
  );
  assert(
    view.includes('route: taskSourceDocumentRoute.value')
      && view.includes("if (draft.sourceType === '销售订单缺口')")
      && view.includes('/warehouse/inventory-alerts?tab=replenishment&keyword=')
      && view.includes("const sourceTitle = sourceDocument === '无' ? '手工新建' : sourceDocument;"),
    'production task sources should use consistent wording and drill down to sales orders or replenishment alerts',
  );
  assert(
    view.includes('function productionTaskDueAttention(')
      && view.includes("label: '交期提醒'")
      && view.includes('attention: productionTaskDueAttention(raw) || row.nextStep'),
    'open production tasks should expose overdue or near-due risk in both list and detail status projections',
  );
  assert(
    view.includes("if (activePage.value === 'tasks') return productionTaskOperationalSort(a, b);")
      && view.includes('function productionTaskOperationalSort(')
      && view.includes("const leftDue = /^\\d{4}-\\d{2}-\\d{2}$/"),
    'default production task sorting should prioritize open tasks by earliest due date',
  );
  assert(
    view.includes("if (lifecycle === '草稿' || lifecycle === '已作废') return [];")
      && view.includes('processTemplateCode: firstProduct ? workOrderRecommendedProcessCode(firstProduct.productCode)')
      && view.includes("const sourceTitle = sourceDocument === '无' ? '手工新建' : sourceDocument;"),
    'work-order creation should exclude draft tasks and prefill the first product line with its established process wording',
  );
  assert(
    view.includes("? '交期优先'")
      && view.includes("? '当前待办优先'")
      && view.includes("? '要求日期从晚到早'")
      && view.includes("? '要求日期从早到晚'")
      && view.includes(": activePage.value === 'tasks' ? '交期从晚到早' : ''")
      && view.includes(": activePage.value === 'tasks' ? '交期从早到晚' : ''")
      && view.includes(':sort-date-label="filterDateLabel"')
      && view.includes("tasks: '需求来源'")
      && view.includes("returnTo: `/production/tasks/${encodeURIComponent(taskCode)}`"),
    'task list controls and child-document navigation should use task-specific labels and preserve the source task context',
  );
  assert(
    view.includes("if (taskLifecycleStatusLabel.value === '草稿') return '提交后核定';")
      && view.includes("if (taskHasCompletedRelease.value) return '已全部安排';")
      && view.includes('任务提交确认后，才能按成品明细创建生产工单。')
      && view.includes('即时缺口/申请')
      && !view.includes('暂无备料申请，可根据缺口或临时备料需要发起申请。'),
    'task drafts, completed releases and material-request empty states should not expose premature or misleading actions',
  );
  assert(
    view.includes(':image-tone="productionMaterialIdentityTone(line.productCode)"')
      && view.includes(':image-tone="productionMaterialIdentityTone(line.code)"'),
    'production task product and material rows should use the shared material identity presentation',
  );
  assert(
    view.includes('const materialRequestLinesAreEditable = computed')
      && view.includes("if (materialRequestDraft.value.status === '待系统评估') return '系统评估中';")
      && view.includes('const productionDocumentPrimaryIsHandoff = computed(() =>')
      && view.includes('可用库存计划快照，不预留、不占用')
      && !view.includes('async function acceptCurrentProductionMaterialRequest()'),
    'production material requests should freeze task-derived shortages and expose automatic inventory routing as a read-only result',
  );
  assert(
    view.includes("!['tasks', 'work-orders', 'material-requests', 'execution-cards', 'exceptions'].includes(activePage.value)"),
    'task detail guidance should not duplicate the top build-work-order action button',
  );
  assert(!view.includes("title: '执行数量链'"), 'work order detail should not repeat execution quantities in a separate section');
  assert(view.includes("title: '工序路线'"), 'work order snapshot should keep a compact frozen process route');
  assert(view.includes("const loss = losses.find"), 'work order recipe snapshot should attach estimated loss to its material row');
  assert(view.includes("title: '工单配方'"), 'work order detail should present the frozen recipe as a dedicated standard');
  assert(view.includes("title: '工单工艺'"), 'work order detail should present the frozen process as a dedicated standard');
  assert(
    view.indexOf("title: releaseFacts.releasedQty > 0 ? '剩余物料储备' : '物料储备'") < view.indexOf("title: '工单配方'"),
    'work order detail should show remaining material coverage before the frozen recipe standard',
  );
  assert(view.includes('work-order-recipe-snapshot-table'), 'work order recipe snapshot should expose per-unit and planned quantities');
  assert(view.includes('work-order-snapshot-zone-grid'), 'work order process snapshot should expose the fixed temperature zones');
  assert(
    view.includes('work-order-process-snapshot-steps')
      && view.includes('work-order-process-snapshot-guidance')
      && view.includes('<small>核心设备</small>')
      && view.includes('<small>作业要求</small>')
      && view.includes('<small>异常处理</small>')
      && !view.includes('<dt>完成条件</dt>'),
    'work order process snapshot should show frozen equipment, work guidance and exception handling without adding completion-condition noise',
  );
  assert(
    !view.includes('<option value="manual">手工工单</option>')
      && !view.includes('workOrderManualSourceSelected')
      && view.includes("if (!allocations.length) return '请选择至少一条生产任务需求';")
      && view.includes('function workOrderRequirementDateSummary(raw: AnyRecord | undefined)')
      && view.includes('function workOrderActionableProductionCard(workOrderCode: unknown)')
      && view.includes('workOrderReadonlyProductIdentity'),
    'work orders should require task demands, preserve per-demand dates, expose per-batch actions and use shared material identity',
  );
  assert(
    view.indexOf('<h2>任务需求</h2>') < view.indexOf('<h2>工单内容</h2>')
      && view.indexOf('<h2>工单内容</h2>') < view.indexOf('<h2>生产标准</h2>')
      && view.includes('<WorkOrderTaskDemandPicker')
      && view.includes('class="work-order-source-allocation-empty"')
      && view.includes('从任务需求开始建单')
      && view.includes('<span>需求数量</span>')
      && view.includes('return workOrderDraft.value.sourceAllocations.length > 0;')
      && read('src/components/WorkOrderTaskDemandPicker.vue').includes(":class=\"primary ? 'primary-action' : 'secondary-action'\"")
      && view.includes('class="work-order-source-allocation-head"')
      && view.includes('<QuantityWithUnitInput')
      && view.includes('numeric-value')
      && view.includes('function updateWorkOrderSourceAllocationQuantity(')
      && view.includes('function workOrderSourceAllocationQuantityHasError(')
      && view.includes('<span>工单备注（选填）</span>')
      && read('src/components/QuantityWithUnitInput.vue').includes('numericValue?: boolean;')
      && view.includes('workOrderDraftProductIdentity')
      && view.includes('class="product-summary work-order-source-demand"')
      && view.includes('const workOrderTaskDemandOptions = computed(() => {\n  void productionDataRevision.value;')
      && view.includes('function workOrderTaskDemandEffectiveRecipe(task: AnyRecord, line: TaskProductDraftLine)')
      && view.includes('const workOrderBlockedTaskDemandCount = computed')
      && view.includes('const workOrderTaskDemandSelectionLocked = computed')
      && view.includes(':disabled="workOrderTaskDemandSelectionLocked || !workOrderTaskDemandPickerOptions.length"')
      && read('src/components/WorkOrderTaskDemandPicker.vue').includes(':disabled="!option.recipeReady"')
      && view.includes('function workOrderProcessTemplateMatchesProductFamily(')
      && view.includes('if (workOrderTaskDemandSelectionLocked.value) return;')
      && view.includes('if (!option?.recipe) return;')
      && view.includes('<label class="form-field work-order-note-field"')
      && view.includes("activePage.value !== 'work-orders' || !isProductionNewDocument.value || workOrderDraft.value.sourceAllocations.length > 0")
      && view.includes('<section v-if="workOrderDraft.productCode" class="form-section production-work-order-editor production-work-order-binding-section">')
      && view.includes('class="work-order-standard-stack"')
      && view.includes('const workOrderDraftRecipePreviewRows = computed<WorkOrderRecipeSnapshotRow[]>')
      && view.includes('const workOrderDraftProcessPreviewZones = computed')
      && view.includes('const workOrderDraftProcessPreviewSteps = computed<WorkOrderProcessSnapshotStepRow[]>')
      && view.includes('v-for="row in workOrderDraftRecipePreviewRows"')
      && view.includes('v-for="zone in workOrderDraftProcessPreviewZones"')
      && view.includes('v-for="step in workOrderDraftProcessPreviewSteps"')
      && view.includes('<span>每单位标准</span>')
      && view.includes('<span>本单理论用量<small>不含损耗</small></span>')
      && view.includes('<span>本单预计需求<small>含损耗</small></span>')
      && view.includes("const outputUnit = text(recipe.outputUnit, '件');")
      && view.includes(':model="row.model"')
      && view.includes(':spec="row.spec"')
      && view.includes(':image-url="row.imageUrl"')
      && view.includes('function productionMaterialIdentityDetails(')
      && !view.includes('option.recommended')
      && !view.includes('class="work-order-derived-empty"')
      && !view.includes('class="form-section production-work-order-editor production-work-order-material-section"')
      && !view.includes('<h2>预计物料</h2>')
      && !view.includes('<template #supplement>{{ row.quality }}</template>')
      && !view.includes('workOrderSnapshotFrozenMeta')
      && !view.includes('<input v-model="allocation.quantity" type="number"')
      && !view.includes("if (workOrderDraftFieldIsMissing('sourceLineId')) return '请至少添加一条任务需求';")
      && !view.includes('<input v-model="workOrderDraft.code" type="text" readonly />'),
    'work-order editing should begin with an eligible trusted task demand and show derived product facts without duplicate readonly inputs',
  );
  assert(
    view.includes("title: '生产执行记录'")
      && view.includes("headers: ['安排/批次', '数量', '当前状态', '执行明细']")
      && view.includes("{ label: '批次数量', value: qty(card.planQty, card.unit) }")
      && view.includes("{ label: '数量进度', value: `报工 ${qty(card.reportedQty, card.unit)} · 合格 ${qty(card.qualifiedQty, card.unit)} · 入库 ${qty(card.inboundQty, card.unit)}` }")
      && !view.includes("title: '生产安排与执行'")
      && !view.includes("title: '生产安排与批次'"),
    'work-order detail should keep whole-order progress in the summary panel and reserve the main execution section for arrangement and batch records',
  );
  assert(
    view.includes("headers: ['生产任务 / 来源', '需求数量', '本工单数量', '要求日期']")
      && view.includes("{ label: '当前情况', value: '尚未形成生产安排' }")
      && view.includes("workOrderSaving.value || !workOrderDraft.value.sourceAllocations.length")
      && view.includes("if (!snapshot) return '当前选用版本';")
      && view.includes("const isGeneratedNote = /^来源于生产任务\\s+\\S+，按选中明细建立工单。$/.test(note)")
      && view.includes("|| /^销售订单\\s+\\S+\\s+第\\s+\\S+\\s+行缺口")
      && !view.includes("来源于生产任务 ${sourceTaskCode}，按选中明细建立工单。")
      && !view.includes("if (!snapshot) return '原型展示（未保存确认版本）';"),
    'work-order empty-entry actions, demand fields, notes and draft version wording should remain concise and truthful',
  );
  assert(
    view.includes('const taskSourceKey = isProductionNewDocument.value && route.query.task')
      && view.includes("(productionRuntimeDataHasSnapshot.value ? 'ready' : 'loading')")
      && view.includes('const newDocumentSourceKey = copySourceKey || taskSourceKey;'),
    'task deep links should rehydrate a new work-order draft after asynchronous production data becomes ready',
  );
  assert(
    view.includes('function buildWorkOrderMaterialNeeds(')
      && view.includes('materialNeeds: buildWorkOrderMaterialNeeds(draft.planQty, workOrderSelectedRecipe.value, draft.materialNeeds)')
      && view.includes('function workOrderEffectiveMaterialNeeds(order: AnyRecord)')
      && view.includes('function workOrderRemainingMaterialNeeds(order: AnyRecord, unreleasedQtyValue?: number)')
      && view.includes('function workOrderMaterialPreparationLabel(order: AnyRecord)')
      && view.includes('if (facts.releasableQty <= 0) return facts.blocker;')
      && view.includes("if (/待质检|待检/.test(releaseFacts.blocker)) return '等待质检放行';")
      && view.includes('待检库存放行或可用库存补齐后，系统会重新计算可安排数量')
      && view.includes("interventionDescription || workOrderMaterialBlocked ? 'pending'")
      && view.includes("{{ allocation.sourceDocument || '独立生产需求' }}")
      && view.includes("{{ workOrderDraft.productCode ? '请选择工艺版本' : '请先选择成品' }}")
      && !view.includes('if (draft.plannedDate > draft.dueDate)'),
    'work-order editing and blocked guidance should use canonical task-demand, material and requirement-date facts',
  );
  assert(
    view.includes("key: 'due-risk'")
      && view.includes("label: '要求日期提醒'")
      && view.includes('const materialReserveLines = releaseFacts.unreleasedQty > 0')
      && view.includes('...(materialReserveLines.length')
      && view.includes("section.title.endsWith('物料储备')")
      && view.includes("v-if=\"!(activePage === 'work-orders' && section.title.endsWith('物料储备'))\"")
      && view.includes("headers: ['物料', '预计需求', '库存判断', '数量明细']"),
    'work order detail should show due risk once and omit empty historical material-reserve sections',
  );
  assert(
    view.includes('function workOrderSnapshotActionCodes(')
      && view.includes('function workOrderProcessGuidance(')
      && view.includes("frozenMode === '系统动作'"),
    'historical work-order process snapshots should preserve legal frozen guidance while removing obsolete stage contracts',
  );
  assert(
    server.includes('function workOrderMaterialNeedsFromRecipe(recipe, planQtyValue)')
      && server.includes('function workOrderFrozenMaterialNeeds(workOrder)')
      && server.includes('const materialNeeds = submitted')
      && server.includes('function productionRecipeWithCanonicalMaterialControls(data, recipe)')
      && server.includes('repairRecipeControls(order.snapshot.recipe);'),
    'the server should freeze canonical material needs and align recipe QC controls with material master data',
  );
  const versionCatalog = JSON.parse(read('shared/production-version-catalog.json'));
  const spoolLines = versionCatalog.recipes
    .flatMap((recipe) => recipe.materials || [])
    .filter((material) => material.materialCode === 'M-PKG-SPOOL-1KG');
  assert(
    spoolLines.length > 0 && spoolLines.every((material) => material.incomingQcRequired === true),
    'the shared production catalog should not mark a QC-controlled spool as inspection-exempt',
  );
});

run('production recipe percentages are informational', () => {
  const view = read('src/views/Production2View.vue');
  assert(!view.includes('recipe-balance-strip'), 'recipe editor should not show balance summary strips');
  assert(!view.includes('recipePercentBalanced'), 'recipe percentages should not require a 100% balance');
  assert(!view.includes('投料占比已平衡'), 'recipe percentages should not show balance success copy');
  assert(!view.includes('投料占比超出'), 'recipe percentages should not block values above 100%');
  assert(!view.includes('投料占比还差'), 'recipe percentages should not block values below 100%');
  assert(
    view.includes('仅作核对提示，不阻断草稿保存'),
    'recipe percentage total should remain an informational check instead of a save requirement',
  );
});

run('linked fields use reference picker', () => {
  const productDisplay = 'src/utils/productDisplay.ts';
  const activeReferencePages = [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/SalesOutboundRequestView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
    'src/views/FinanceSalesInvoiceEditorView.vue',
    'src/views/FinancePurchaseInvoiceEditorView.vue',
    'src/views/FinanceReceivableEditorView.vue',
    'src/views/FinancePayableEditorView.vue',
    'src/views/MasterMaterialEditorView.vue',
    'src/views/MasterCustomerEditorView.vue',
    'src/views/MasterSupplierEditorView.vue',
    'src/views/MasterWarehouseEditorView.vue',
    'src/views/MasterSimpleEditorView.vue',
    'src/views/ModuleView.vue',
  ];
  expectIncludes('src/views/PurchaseRequisitionEditorView.vue', 'ReferencePicker');
  expectIncludes('src/views/PurchaseRequisitionEditorView.vue', 'type="departments"');
  expectIncludes('src/views/PurchaseRequisitionEditorView.vue', 'type="employees"');
  expectIncludes('src/views/PurchaseRequisitionEditorView.vue', 'type="materials"');
  expectIncludes('src/views/MasterMaterialEditorView.vue', 'ReferencePicker');
  expectIncludes('src/views/MasterMaterialEditorView.vue', 'type="uom"');
  expectIncludes('src/views/MasterDataView.vue', "'基础单位'");
  expectIncludes('src/views/MasterDataView.vue', "materialValue(row, 'uom')");
  expectIncludes('src/styles/main.css', '.master-material-table');
  expectIncludes('src/styles/main.css', 'min-width: 780px;');
  expectIncludes('src/views/MasterSimpleEditorView.vue', 'ReferencePicker');
  expectIncludes('src/views/MasterSimpleEditorView.vue', "referenceType: 'departments'");
  expectIncludes('src/views/MasterSimpleEditorView.vue', "field.kind === 'reference'");
  expectIncludes('src/views/WarehouseOperationEditorView.vue', 'class="line-readonly-value"');
  expectExcludes('src/views/WarehouseOperationEditorView.vue', ['v-model="item.uom"']);
  expectIncludes('src/styles/main.css', '.line-readonly-value');
  expectIncludes(productDisplay, '[product.materialCode || product.code, product.name, product.model, product.spec]');
  expectIncludes(productDisplay, 'function quantityText');
  expectIncludes(productDisplay, 'return unit ? `${qty} ${unit}` : qty;');
  expectExcludes(productDisplay, ['uniqueIdentityParts', 'seenTokens']);
  for (const activeReferencePage of activeReferencePages) {
    expectExcludes(activeReferencePage, ['<datalist', ' list="', ':list="']);
  }
});

run('supplier master supports online stores without a separate procurement flow', () => {
  expectIncludes('src/views/MasterSupplierEditorView.vue', "'网店'");
  expectIncludes('server/index.mjs', "'网店'");
});

run('spare parts use a lightweight warehouse and issue flow', () => {
  expectIncludes('src/views/MasterWarehouseEditorView.vue', "'备件仓'");
  expectIncludes('src/views/MasterWarehouseEditorView.vue', "'暂存仓'");
  expectIncludes('src/views/MasterMaterialEditorView.vue', "'备件'");
  expectIncludes('src/views/MasterMaterialEditorView.vue', '<strong>可产出</strong>');
  expectIncludes('src/views/WarehouseOperationEditorView.vue', '<option>领用出库</option>');
  expectIncludes('server/index.mjs', "'样品出库', '领用出库', '报废出库'");
});

run('employee master data stays separate from account roles', () => {
  const editor = read('src/views/MasterSimpleEditorView.vue');
  const employeeEditor = editor.slice(editor.indexOf('employees: {'), editor.indexOf('company:', editor.indexOf('employees: {')));
  assert(employeeEditor.includes("referenceType: 'departments'"), 'employees should still link to departments');
  assert(!employeeEditor.includes("key: 'roles'"), 'employees should not expose account roles');
  assert(!employeeEditor.includes("key: 'permissions'"), 'employees should not expose account permissions');

  const list = read('src/views/MasterDataView.vue');
  const employeeColumns = list.slice(list.indexOf('employees: ['), list.indexOf('company:', list.indexOf('employees: [')));
  assert(employeeColumns.includes("key: 'owner'"), 'employee list should show department');
  assert(!employeeColumns.includes("key: 'roles'"), 'employee list should not show roles');
  assert(!employeeColumns.includes("key: 'permissions'"), 'employee list should not show permissions');
});

run('api exposes current master references', () => {
  const server = 'server/index.mjs';
  for (const token of [
    "uom: 'uom'",
    "departments: 'departments'",
    "employees: 'employees'",
    "company: 'company'",
    "equipment: 'equipment'",
    'ensureMasterRows',
  ]) {
    expectIncludes(server, token);
  }
  expectIncludes('server/seed-data.mjs', 'DEP-OPS');
  expectExcludes(server, ['production-lines']);
});

run('system menu is managed and protected', () => {
  const server = 'server/index.mjs';
  const moduleView = 'src/views/ModuleView.vue';
  const router = 'src/router/index.ts';
  const sidebar = 'src/components/AppSidebar.vue';
  const topbar = 'src/components/AppTopbar.vue';
  const pageTopbarPortal = 'src/components/PageTopbarPortal.vue';
  const pageRefresh = 'src/composables/usePageRefresh.ts';
  const materialEditor = 'src/views/MasterMaterialEditorView.vue';
  const navigationStore = 'src/stores/navigation.ts';
  const home = 'src/views/HomeView.vue';
  const styles = 'src/styles/main.css';
  const permissionMatrix = 'src/data/permissionMatrix.ts';
  const sharedPermissionMatrix = 'shared/permission-matrix.json';
  const sharedMenuDefaults = 'shared/system-menu-defaults.json';
  const navigation = 'src/data/navigation.ts';
  expectFile(sharedMenuDefaults);
  for (const token of [
    'protectedMenuCodes',
    'menuRowsForRequest',
    '系统核心菜单必须保持启用',
  ]) {
    expectIncludes(server, token);
  }
  expectIncludes(sharedMenuDefaults, '"code": "MENU-SYSTEM"');
  expectIncludes(sharedMenuDefaults, '"code": "MENU-SYSTEM-ACCOUNTS"');
  expectIncludes(sharedMenuDefaults, '"code": "MENU-SYSTEM-PERMISSIONS"');
  expectIncludes(sharedMenuDefaults, '"code": "MENU-SYSTEM-ROLES"');
  expectIncludes(sharedMenuDefaults, '"code": "MENU-SYSTEM-MENUS"');
  expectIncludes(sharedMenuDefaults, '"code": "MENU-PRODUCTION-TASKS"');
  expectIncludes(sharedMenuDefaults, '"path": "/production/tasks"');
  expectIncludes(sharedMenuDefaults, '"path": "/production/execution-cards"');
  expectIncludes(sharedMenuDefaults, '"path": "/production/after-sales"');
  expectExcludes(sharedMenuDefaults, ['"path": "/warehouse/batches"']);
  expectIncludes(router, "redirect: '/warehouse/inventory?view=batch'");
  expectIncludes(sharedMenuDefaults, '"path": "/production/process-templates"');
  expectIncludes(sharedMenuDefaults, '"code": "MENU-PRODUCTION-WORKBENCH"');
  expectIncludes(sharedMenuDefaults, '"path": "/production/workbench"');
  expectIncludes(sharedMenuDefaults, '"code": "MENU-QUALITY"');
  expectIncludes(sharedMenuDefaults, '"code": "MENU-QUALITY-WORKBENCH"');
  expectIncludes(sharedMenuDefaults, '"path": "/quality/workbench"');
  expectIncludes(sharedMenuDefaults, '"path": "/quality/incoming"');
  expectIncludes(sharedMenuDefaults, '"path": "/quality/production"');
  expectIncludes(sharedMenuDefaults, '"path": "/quality/after-sales"');
  expectIncludes(sharedMenuDefaults, '"path": "/quality/patrol"');
  expectIncludes(sharedMenuDefaults, '"path": "/quality/defects"');
  expectExcludes(sharedMenuDefaults, ['"code": "MENU-FINANCE"', '"path": "/finance/']);
  expectIncludes(sharedMenuDefaults, '"code": "MENU-ECOMMERCE"');
  expectIncludes(sharedMenuDefaults, '"path": "/ecommerce/workbench"');
  expectIncludes(sharedMenuDefaults, '"path": "/ecommerce/orders"');
  expectIncludes(sharedMenuDefaults, '"path": "/ecommerce/inventory-sync"');
  expectIncludes(sharedMenuDefaults, '"path": "/ecommerce/settlements"');
  assert(
    read(sharedMenuDefaults).indexOf('"code": "MENU-PRODUCTION"') <
      read(sharedMenuDefaults).indexOf('"code": "MENU-QUALITY"') &&
      read(sharedMenuDefaults).indexOf('"code": "MENU-QUALITY"') <
        read(sharedMenuDefaults).indexOf('"code": "MENU-ECOMMERCE"') &&
      read(sharedMenuDefaults).indexOf('"code": "MENU-ECOMMERCE"') <
        read(sharedMenuDefaults).indexOf('"code": "MENU-MASTER-DATA"'),
    'ecommerce module should stay between quality and master data in the default sidebar order',
  );
  expectExcludes(sharedMenuDefaults, [
    '"code": "MENU-PRODUCTION-SITE"',
    '"code": "MENU-PRODUCTION-QUALITY"',
    '"code": "MENU-PRODUCTION-REWIND"',
    '"code": "MENU-PRODUCTION-PACKING"',
    '"path": "/production/site-execution"',
    '"path": "/production/quality"',
    '"path": "/production/rewind-pool"',
    '"path": "/production/packing-inspection"',
  ]);
  expectIncludes(server, "shared', 'system-menu-defaults.json'");
  expectIncludes(server, 'const menuDefaults = JSON.parse');
  expectExcludes(server, ['const menuDefaults = [']);
  expectIncludes(navigation, "import systemMenuDefaults from '../../shared/system-menu-defaults.json'");
  expectIncludes(navigation, 'const moduleIcons: Record<string, Component>');
  expectIncludes(navigation, '...(systemMenuDefaults as SharedMenuDefault[]).map');
  expectIncludes(navigation, 'label: menu.name');
  expectIncludes(navigation, 'label: child.name');
  expectIncludes(moduleView, "import systemMenuDefaults from '../../shared/system-menu-defaults.json'");
  expectIncludes(moduleView, 'const systemMenuPageConfigs = Object.fromEntries');
  expectIncludes(moduleView, "find((menu) => menu.menuKey === 'system')");
  expectIncludes(sharedPermissionMatrix, '"systemPageBehavior"');
  expectIncludes(sharedPermissionMatrix, '"readOnlyPages": ["logs"]');
  expectIncludes(sharedPermissionMatrix, '"nonCreatablePages": ["permissions", "menus", "naming-rules"]');
  expectIncludes(permissionMatrix, 'systemPageBehavior');
  expectIncludes(moduleView, 'const readOnlySystemPageKeys = new Set(systemPageBehavior.readOnlyPages)');
  expectIncludes(moduleView, 'const nonCreatableSystemPageKeys = new Set(systemPageBehavior.nonCreatablePages)');
  expectIncludes(moduleView, 'readonly: readOnlySystemPageKeys.has(pageKey)');
  expectIncludes(moduleView, '!nonCreatableSystemPageKeys.has(systemPageKey.value)');
  expectExcludes(moduleView, [
    "accounts: { title: '账号管理'",
    "permissions: { title: '权限管理'",
    "roles: { title: '角色管理'",
    "menus: { title: '菜单管理'",
    "'naming-rules': { title: '编码规则'",
    "notifications: { title: '通知管理'",
    "apps: { title: '应用管理'",
    "'mcp-tools': { title: 'MCP 工具'",
    'logs: { ...systemMenuPageConfigs.logs, readonly: true }',
  ]);
  expectIncludes(router, "import systemMenuDefaults from '../../shared/system-menu-defaults.json'");
  expectIncludes(router, 'function pageTitleMapFromMenu(moduleKey: string)');
  expectIncludes(router, "const salesPageTitles = pageTitleMapFromMenu('sales')");
  expectIncludes(router, "const masterDataPageTitles = pageTitleMapFromMenu('master-data')");
  expectExcludes(router, [
    "const salesPageTitles = {",
    "const purchasePageTitles = {",
    "const warehousePageTitles = {",
    "const financePageTitles = {",
    "const masterDataPageTitles = {",
  ]);
  expectIncludes(sharedPermissionMatrix, '"protectedSystemMenuCodes"');
  expectIncludes(sharedPermissionMatrix, '"MENU-SYSTEM-MENUS"');
  expectIncludes(permissionMatrix, 'protectedSystemMenuCodes');
  expectIncludes(server, 'sharedPermissionMatrix.protectedSystemMenuCodes');
  expectIncludes(server, 'const protectedMenuCodes = new Set(protectedSystemMenuCodes);');
  expectIncludes(moduleView, 'protectedSystemMenuCodes');
  expectIncludes(moduleView, 'protectedSystemMenuCodes as protectedSystemMenuCodeList');
  expectIncludes(moduleView, 'const protectedSystemMenuCodes = new Set(protectedSystemMenuCodeList);');
  expectExcludes(moduleView, ["const protectedSystemMenuCodes = new Set(["]);
  expectExcludes(server, ["const protectedMenuCodes = new Set(["]);
  expectIncludes(moduleView, '系统核心菜单必须绑定系统配置维护权限');
  expectIncludes(moduleView, 'selectedMenuDisabledAncestor');
  expectIncludes(moduleView, 'selectedMenuIsHidden');
  expectIncludes(moduleView, 'selectedMenuRequiredPermissions');
  expectIncludes(moduleView, '上级菜单');
  expectIncludes(moduleView, 'menuPermissionSearch');
  expectIncludes(moduleView, 'visibleMenuPermissionOptions');
  expectIncludes(moduleView, 'selectMenuPermission');
  expectIncludes(moduleView, 'menuRequiredPermissionCodeForPath');
  expectIncludes(moduleView, 'routeModuleReadPermissionCodes');
  expectIncludes(moduleView, 'routeModulePermission(routeModuleReadPermissionCodes, moduleKey)');
  expectIncludes(moduleView, "key: 'accessScope'");
  expectIncludes(moduleView, "label: '访问范围'");
  expectIncludes(moduleView, 'menus: 1600');
  expectIncludes(moduleView, 'selectedMenuRequiredRoutePermissionCode');
  expectIncludes(moduleView, 'menuRequiredPermissionNotice');
  expectIncludes(moduleView, '路由固定要求');
  expectIncludes(moduleView, 'menuNoPermissionDisabledReason');
  expectIncludes(moduleView, '不能设置为无限制');
  expectIncludes(moduleView, 'menuPermissionMismatchMessage');
  expectIncludes(moduleView, 'menuPermissionInvalidMessage');
  expectIncludes(moduleView, 'v-if="menuPermissionMismatchMessage"');
  expectIncludes(moduleView, 'v-if="menuPermissionInvalidMessage"');
  expectIncludes(moduleView, '该路由必须绑定');
  expectIncludes(moduleView, '搜索权限编码、名称、模块、操作或说明');
  expectIncludes(moduleView, '搜索编码、姓名、登录账号、部门、角色、菜单、操作或通知规则');
  expectIncludes(moduleView, '搜索角色编码、名称、权限点、菜单、操作或说明');
  expectIncludes(router, 'canAccessNavigationPath');
  expectIncludes(router, 'navigation.error ||');
  expectIncludes(router, 'navigation.loaded');
  expectIncludes(router, 'routeWritePermission');
  expectIncludes(navigationStore, 'export function accessDeniedHomeLocation');
  expectIncludes(navigationStore, 'accessDenied: reason');
  expectIncludes(navigationStore, 'let menuLoadPromise');
  expectIncludes(navigationStore, 'let menuLoadVersion');
  expectIncludes(navigationStore, 'if (this.loading && menuLoadPromise && !force) return menuLoadPromise');
  expectIncludes(navigationStore, 'menuLoadVersion += 1');
  expectIncludes(navigationStore, 'this.loading = false');
  expectIncludes(navigationStore, 'if (loadVersion !== menuLoadVersion) return');
  expectIncludes(navigationStore, 'if (currentLoadPromise && menuLoadPromise === currentLoadPromise)');
  expectIncludes(router, "accessDeniedHomeLocation(navigation.error ? 'navigation' : 'menu', to.fullPath)");
  expectIncludes(router, "accessDeniedHomeLocation('write', to.fullPath)");
  expectIncludes(home, 'accessDeniedMessage');
  expectIncludes(home, 'routeWritePermission(accessDeniedPath.value)');
  expectIncludes(home, 'session.permissionLabel(permissionCode)');
  expectIncludes(home, '不能维护');
  expectIncludes(home, 'class="access-denied-banner"');
  expectIncludes(styles, '.access-denied-banner');
  expectIncludes(router, 'navigation.loadMenus()');
  expectIncludes(sidebar, 'navigation.loadMenus(true)');
  expectIncludes(sidebar, 'accessDeniedHomeLocation');
  expectIncludes(topbar, 'accessDeniedHomeLocation');
  expectIncludes(topbar, 'openAccessiblePath');
  expectIncludes(topbar, 'id="topbar-page-context"');
  expectIncludes(topbar, 'id="topbar-page-actions"');
  expectIncludes(topbar, 'refreshCurrentPage');
  expectIncludes(topbar, 'aria-label="刷新当前页面"');
  expectIncludes(pageTopbarPortal, 'to="#topbar-page-context"');
  expectIncludes(pageTopbarPortal, 'to="#topbar-page-actions"');
  expectIncludes(pageRefresh, 'currentPageRefreshHandler');
  expectIncludes(materialEditor, '<PageTopbarPortal>');
  expectIncludes(materialEditor, 'topbar-back-action');
  expectExcludes(topbar, ['globalSearchKeyword', 'globalSearchResults', '搜索页面或功能', 'Search,']);
  expectExcludes(styles, ['.global-search-popover', '.global-search-empty']);
  expectIncludes(sidebar, 'routeWritePermission');
  expectIncludes(sidebar, 'const writePermission = routeWritePermission(route.path)');
  expectIncludes(moduleView, 'await navigation.loadMenus(true)');
  expectIncludes(moduleView, 'refreshSystemAccessAfterSave');
  expectIncludes(moduleView, 'navigation.loaded');
  expectIncludes(moduleView, 'navigation.error || !canStayOnCurrentPage');
  expectIncludes(moduleView, 'function systemSearchQueryText()');
  expectIncludes(moduleView, 'function systemQueryLocation(path: string, q?: string)');
  expectIncludes(moduleView, 'route.query.q');
  expectIncludes(moduleView, 'function selectFirstVisibleSystemRecord()');
  expectIncludes(moduleView, 'systemSearch.value = systemSearchQueryText()');
  expectIncludes(moduleView, 'visibleSystemRows.value[0]');
  expectIncludes(moduleView, '() => route.query.q');
  const moduleViewSource = read(moduleView);
  const refreshStart = moduleViewSource.indexOf('async function refreshSystemAccessAfterSave()');
  const refreshEnd = moduleViewSource.indexOf('async function saveSystemDraft()', refreshStart);
  const refreshBlock = moduleViewSource.slice(refreshStart, refreshEnd);
  assert(refreshBlock.includes('isAccountsPage.value || isRolesPage.value || isPermissionsPage.value'), 'access refresh should reload account session after account, role, and permission changes');
  assert(refreshBlock.includes('isMenusPage.value || isPermissionsPage.value || isAccountsPage.value || isRolesPage.value'), 'access refresh should reload scoped menus after menu, account, role, and permission changes');
  assert(
    refreshBlock.indexOf('await session.loadUserFromAccounts(true)') < refreshBlock.indexOf('await navigation.loadMenus(true)'),
    'access refresh should reload the active account before reloading scoped menus',
  );
  expectIncludes(moduleView, 'canAccessNavigationPath');
  expectIncludes(moduleView, "await router.replace(accessDeniedHomeLocation(navigation.error ? 'navigation' : 'menu', route.fullPath))");
  expectIncludes(moduleView, "await router.replace({");
  expectIncludes(navigationStore, 'function buildVisibleNavigation');
  expectIncludes(navigationStore, 'menuConfigLoaded = rows.length > 0');
  expectIncludes(navigationStore, 'const hasRows = menuConfigLoaded || rows.length > 0');
  expectIncludes(navigationStore, 'state.loaded');
  expectIncludes(navigationStore, 'this.menuRows = []');
  expectIncludes(navigationStore, 'this.loaded && !force && !this.error');
  expectIncludes(navigationStore, 'function childMenuRecordByPath');
  expectIncludes(navigationStore, 'function menuDepth');
  expectIncludes(navigationStore, 'export function disabledMenuInPath');
  expectIncludes(navigationStore, 'compareMenuPathCandidates');
  expectIncludes(navigationStore, 'row.code !== moduleRecord?.code');
  expectIncludes(navigationStore, 'childMenuRecordByPath(rows, child.path, moduleRecord)');
  expectIncludes(navigationStore, 'const disabledModule = disabledMenuInPath(rows, moduleRecord)');
  expectIncludes(navigationStore, 'const disabledPath = disabledMenuInPath(rows, pathRecord)');
  expectIncludes(navigationStore, 'function menuSortOrder');
  expectIncludes(navigationStore, 'export function canAccessNavigationPath');
  expectIncludes(navigationStore, 'const isModuleRoot = normalizedPath === `/${moduleKey}`');
  expectIncludes(navigationStore, "reason: 'missing-menu'");
  expectIncludes(navigationStore, 'export function routeWritePermission');
  expectIncludes(navigationStore, 'routeModuleReadPermissionCodes');
  expectIncludes(navigationStore, 'routeModuleWritePermissionCodes');
  expectIncludes(navigationStore, 'routeModulePermission(routeModuleReadPermissionCodes, moduleKey)');
  expectIncludes(navigationStore, 'routeModulePermission(routeModuleWritePermissionCodes, moduleKey)');
  expectIncludes(navigationStore, "listSystemRecords('menus')");
  expectIncludes(navigationStore, 'export function navigationAccessIssue');
  expectIncludes(navigationStore, "reason: 'missing-permission'");
  expectIncludes(navigationStore, "reason: 'disabled-menu'");
  expectIncludes(navigationStore, "reason: 'missing-menu'");
  expectIncludes(home, 'navigationAccessIssue(');
  expectIncludes(home, 'moduleReadPermissionCodes');
  expectIncludes(home, 'session.hasPermission(moduleReadPermissionCodes.system)');
  expectIncludes(home, 'accessDeniedActions');
  expectIncludes(home, "query: permissionCode ? { q: permissionCode } : undefined");
  expectIncludes(home, "query: keyword ? { q: keyword } : undefined");
  expectIncludes(home, ':to="{ path: action.path, query: action.query }"');
  expectIncludes(home, '检查角色权限');
  expectIncludes(home, '调整菜单绑定');
  expectIncludes(home, '打开菜单管理');
  expectIncludes(home, 'class="access-denied-actions"');
  expectIncludes(styles, '.access-denied-actions');
  expectIncludes(styles, '.access-denied-actions a');
  expectIncludes(home, '请在角色管理中补充该权限');
  expectIncludes(home, '请在角色管理中补充权限');
  expectIncludes(home, '请在菜单管理中启用相关菜单');
  expectIncludes(home, '请在菜单管理中检查该路径是否存在');
  expectIncludes(server, 'if (!actor && passwordLoginRequired(data)) return []');
  expectIncludes(server, 'function canSeeMenuRow');
  expectIncludes(server, 'row.parentCode');
  expectIncludes(server, 'requireEnabledMenuPathAudited');
  expectIncludes(server, 'apiMenuPathForParts');
  expectIncludes(server, 'const routeMenuModuleKeys = new Set(Object.keys(routeModuleReadPermissionCodes));');
  expectIncludes(server, 'if (!routeMenuModuleKeys.has(moduleKey)) return');
  expectExcludes(server, ["['sales', 'purchase', 'warehouse', 'finance', 'master-data', 'system']"]);
  expectIncludes(server, 'disabledMenuInPath');
  expectIncludes(server, 'function menuDepth');
  expectIncludes('scripts/smoke-api.mjs', 'sales menu config is scoped to visible menus');
  expectIncludes('scripts/smoke-api.mjs', 'disabled menu is removed from scoped navigation');
  expectIncludes('scripts/smoke-api.mjs', 'disabled parent menu hides child menus');
  expectIncludes('scripts/smoke-api.mjs', 'disabled child menu blocks direct business api');
  expectIncludes('scripts/smoke-api.mjs', 'disabled first child menu blocks shared parent path');
  expectIncludes('scripts/smoke-api.mjs', 'disabled parent menu blocks child business api');
  expectIncludes('scripts/smoke-api.mjs', 'disabled system child menu blocks direct system api');
  expectIncludes('scripts/smoke-api.mjs', 'system menus are empty before login in password mode');
  expectIncludes('scripts/smoke-api.mjs', 'system menus ignore account header in password mode');
});

run('system management tables keep long fields readable', () => {
  const moduleView = 'src/views/ModuleView.vue';
  const permissionMatrix = 'src/data/permissionMatrix.ts';
  const sharedPermissionMatrix = 'shared/permission-matrix.json';
  const styles = 'src/styles/main.css';
  const stylesSource = read(styles);
  expectIncludes(moduleView, 'systemTableCellTitle');
  expectIncludes(moduleView, ':title="systemTableCellTitle(row, column.key)"');
  expectIncludes(moduleView, ':class="`system-config-page-${systemPageKey}`"');
  expectIncludes(moduleView, '@click="selectSystemRecord(row)"');
  expectIncludes(moduleView, '@click.stop="selectSystemRecord(row)"');
  expectIncludes(moduleView, '@click.stop="toggleSystemStatus(row)"');
  expectIncludes(sharedPermissionMatrix, '"systemOptionSets"');
  expectIncludes(permissionMatrix, 'systemOptionSets');
  expectIncludes(moduleView, 'const lifecycleStatusOptions = systemOptionSets.lifecycleStatuses');
  expectExcludes(moduleView, ["const lifecycleStatusOptions = ['启用', '停用']"]);
  expectIncludes(moduleView, 'systemStatusOptions');
  expectIncludes(moduleView, '<option v-for="status in systemStatusOptions"');
  expectIncludes(moduleView, 'systemScopeNote');
  expectIncludes(moduleView, 'system-config-scope-note');
  expectIncludes(moduleView, '通知规则会驱动站内消息发送');
  expectIncludes(moduleView, '应用管理记录本地运行和阿里云部署相关配置');
  expectIncludes(moduleView, 'MCP 工具用于记录可用辅助工具');
  expectIncludes(moduleView, 'compareUpdatedSystemRows');
  expectIncludes(moduleView, 'if (isLogsPage.value) return [...rows].sort(compareUpdatedSystemRows)');
  expectIncludes(permissionMatrix, 'permissionDisplayOrder');
  expectIncludes(sharedPermissionMatrix, '"permissionDisplayOrder"');
  expectIncludes(sharedPermissionMatrix, '"PERM-SALES-EDIT"');
  expectIncludes(sharedPermissionMatrix, '"PERM-WAREHOUSE-VIEW"');
  expectExcludes(sharedPermissionMatrix, ['PERM-FINANCE-VIEW', 'PERM-FINANCE-SETTLE', 'ROLE-FINANCE']);
  expectExcludes(moduleView, ['const permissionDisplayOrder = [']);
  expectIncludes(permissionMatrix, 'roleDisplayOrder');
  expectIncludes(sharedPermissionMatrix, '"roleDisplayOrder"');
  expectIncludes(sharedPermissionMatrix, '"ROLE-ADMIN"');
  expectIncludes(permissionMatrix, 'coreSystemRecordCodes');
  expectIncludes(sharedPermissionMatrix, '"coreSystemRecordCodes"');
  expectIncludes(sharedPermissionMatrix, '"defaultAdminAccount": "ACC-ZHANGSAN"');
  expectIncludes(sharedPermissionMatrix, '"systemPermission": "PERM-SYSTEM-CONFIG"');
  expectExcludes(moduleView, ['const roleDisplayOrder = [']);
  expectIncludes(moduleView, "if (isPermissionsPage.value) return [...rows].sort(compareSystemCodeByOrder(permissionDisplayOrder));");
  expectIncludes(moduleView, "if (isRolesPage.value) return [...rows].sort(compareSystemCodeByOrder(roleDisplayOrder));");
  expectIncludes(moduleView, 'function systemExactSelectionValues(row: SystemRecord)');
  expectIncludes(moduleView, '...listCodes(row.permissions)');
  expectIncludes(moduleView, '...effectivePermissionCodesForRole(row)');
  expectIncludes(moduleView, '...listCodes(row.roles)');
  expectIncludes(moduleView, '...accountEffectivePermissionCodes(row)');
  expectIncludes(moduleView, '...menuRequiredPermissionCodesForRow(row)');
  expectIncludes(moduleView, '...menuAccessibleRoleRows(row).flatMap');
  expectIncludes(moduleView, '...menuAccessibleAccountRows(row).flatMap');
  expectIncludes(moduleView, 'function exactSystemSearchMatchRow()');
  expectIncludes(moduleView, 'const exactRows = visibleSystemRows.value.filter((row) => systemExactSelectionValues(row).includes(keyword))');
  expectIncludes(moduleView, "if (isMenusPage.value && keyword.startsWith('/'))");
  expectIncludes(moduleView, 'const childMenuDiff = Number(Boolean(b.parentCode)) - Number(Boolean(a.parentCode))');
  expectIncludes(moduleView, 'return menuSortOrderValue(a) - menuSortOrderValue(b) || a.code.localeCompare(b.code)');
  expectIncludes(moduleView, 'exactSystemSearchMatchRow() || visibleSystemRows.value[0]');
  expectIncludes(moduleView, 'const canFallbackToFirstRow = !systemSearch.value.trim() && !(isLogsPage.value && hasActiveLogFilters.value)');
  expectIncludes(moduleView, 'function syncVisibleSystemSelection()');
  expectIncludes(moduleView, 'visibleSystemRows.value.some((row) => row.code === selectedCode.value)');
  expectIncludes(moduleView, 'logDateStartFilter.value, logDateEndFilter.value');
  expectIncludes(moduleView, 'systemImpactPanelTitle');
  expectIncludes(moduleView, 'systemImpactPanelDescription');
  expectIncludes(moduleView, 'class="system-impact-actions"');
  expectIncludes(moduleView, 'const systemLastActionLogQuery = ref');
  expectIncludes(moduleView, 'const saveMessageLogLocation = computed');
  expectIncludes(moduleView, 'function showSystemActionMessage(message: string, logQuery: string)');
  expectIncludes(moduleView, 'class="system-config-log-link"');
  expectIncludes(moduleView, "systemQueryLocation('/system/logs', systemLastActionLogQuery.value)");
  expectIncludes(moduleView, "systemQueryLocation('/system/roles', systemDraft.code)");
  expectIncludes(moduleView, "systemQueryLocation('/system/menus', systemDraft.code)");
  expectIncludes(moduleView, "systemQueryLocation('/system/accounts', systemDraft.code)");
  expectIncludes(moduleView, 'selectedMenuRequiredPermissionTargets');
  expectIncludes(moduleView, "v-for=\"target in selectedMenuRequiredPermissionTargets\"");
  expectIncludes(moduleView, "accountEffectivePermissionCodes(row).join(',')");
  expectIncludes(moduleView, '运行检查');
  expectIncludes(moduleView, '工具验证');
  expectIncludes('server/index.mjs', 'compareUpdatedRows');
  expectIncludes('server/index.mjs', '[...rows].sort(compareUpdatedRows)');
  expectIncludes(moduleView, 'return row.description || row.useScope ||');
  expectIncludes(moduleView, "width: 'minmax(236px, 1.18fr)'");
  expectIncludes(moduleView, 'permissions: 1160');
  expectIncludes(moduleView, "key: 'permissionType'");
  expectIncludes(moduleView, "label: '类型/影响'");
  expectIncludes(moduleView, "key: 'permissionRefs'");
  expectIncludes(moduleView, "label: '启用引用'");
  expectIncludes(moduleView, 'permissionTypeSummary(permission)');
  expectIncludes(moduleView, "if (key === 'permissionType') return permissionTypeSummary(row);");
  expectIncludes(moduleView, 'permissionLinkedEnabledMenuCount(row.code)');
  expectIncludes(moduleView, '个启用角色 /');
  expectIncludes(moduleView, '个启用菜单');
  expectIncludes(moduleView, '启用菜单引用');
  expectIncludes(moduleView, '暂无启用菜单绑定该权限');
  expectIncludes(moduleView, '操作权限 ·');
  expectIncludes(moduleView, '基础权限 ·');
  expectIncludes(moduleView, "width: 'minmax(206px, 1.12fr)'");
  expectIncludes(moduleView, "width: 'minmax(236px, 1.12fr)'");
  expectIncludes(moduleView, "width: 'minmax(260px, 1.24fr)'");
  expectIncludes(moduleView, 'accounts: 1320');
  expectIncludes(moduleView, 'roles: 1040');
  expectIncludes(moduleView, "key: 'operationCount'");
  expectIncludes(moduleView, "label: '可执行操作'");
  expectIncludes(moduleView, "key: 'menuAccessCount'");
  expectIncludes(moduleView, "label: '可访问菜单'");
  expectIncludes(moduleView, 'menus: 1600');
  expectIncludes(styles, '.system-config-table .table-row > span:not(.product-summary):not(.compact-actions)');
  expectIncludes(styles, '.system-config-table .table-row > .system-config-cell-actions');
  expectIncludes(styles, '.system-config-page-logs .system-config-table .table-row > .system-config-cell-actions');
  expectIncludes(styles, '.system-config-table .table-row:not(.table-head)');
  expectIncludes(styles, 'scrollbar-gutter: stable;');
  expectIncludes(styles, 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))');
  expectIncludes(styles, '.system-config-toolbar select');
  expectIncludes(styles, '.system-log-filters');
  expectIncludes(styles, '.system-config-scope-note');
  expectIncludes(styles, '.system-impact-actions');
  expectIncludes(styles, '.system-impact-actions a');
  expectIncludes(styles, '.system-config-log-link');
  expectIncludes(styles, 'gap: 4px;');
  expectIncludes(styles, 'min-width: 48px;');
  expectIncludes(styles, 'max-height: min(620px, calc(100vh - 280px));');
  expectIncludes(styles, 'max-height: calc(100vh - 92px);');
  expectIncludes(styles, 'overflow-wrap: anywhere;');
  expectIncludes(styles, '.role-permission-list strong');
  expectIncludes(styles, '.role-permission-list small');
  expectIncludes(styles, 'line-height: 1.45;');
  expectIncludes(styles, '.system-config-editor-actions');
  expectIncludes(styles, 'position: sticky;');
  expectIncludes(styles, 'backdrop-filter: blur(8px);');
  expectIncludes(styles, '.system-config-table .table-head');
  expectIncludes(styles, 'overflow: visible;');
  expectIncludes(styles, '@media (max-width: 1280px) and (min-width: 901px)');
  assert(
    /@media \(max-width: 1280px\) and \(min-width: 901px\)[\s\S]*\.system-config-grid[\s\S]*\{[\s\S]*grid-template-columns: 1fr;/.test(stylesSource),
    'system config pages should stack table and editor at medium desktop widths so detail forms do not get squeezed',
  );
  expectIncludes(styles, '.system-config-page-accounts .reference-table-scroll');
  expectIncludes(styles, 'max-height: min(260px, calc(100vh - 420px));');
});

run('system naming rules drive real document codes safely', () => {
  const server = 'server/index.mjs';
  const moduleView = 'src/views/ModuleView.vue';
  const api = 'src/services/api.ts';
  const apiSmoke = 'scripts/smoke-api.mjs';
  expectIncludes(server, 'activeNamingRule');
  expectIncludes(server, 'nextDocumentCode');
  expectIncludes(server, 'validateNamingRuleRecord');
  expectIncludes(server, '当前系统只支持已接入业务单据的编码规则');
  expectIncludes(moduleView, '!isNamingRulesPage.value');
  expectIncludes(moduleView, 'namingRuleConflictMessage');
  expectIncludes(moduleView, 'function namingRulePrefixMissingMessage(row: SystemRecord)');
  expectIncludes(moduleView, 'const namingRuleSaveDisabledReason = computed');
  expectIncludes(moduleView, 'function namingRuleStartBlockReason(row: SystemRecord)');
  expectIncludes(moduleView, 'if (isNamingRulesPage.value) return namingRuleStartBlockReason(row)');
  expectIncludes(moduleView, "if (isNamingRulesPage.value) return '编码预览'");
  expectIncludes(moduleView, 'v-else-if="isNamingRulesPage" class="system-impact-grid"');
  expectIncludes(moduleView, ':value="namingRuleSample" type="text" readonly');
  expectIncludes(apiSmoke, 'naming rule drives sales order code generation');
  expectIncludes(apiSmoke, 'system naming rules cannot be created manually');
  expectIncludes(apiSmoke, 'enabled naming rule cannot reuse prefix');
});

run('password login flow is wired', () => {
  const api = 'src/services/api.ts';
  const session = 'src/stores/session.ts';
  const router = 'src/router/index.ts';
  const layout = 'src/layouts/AppLayout.vue';
  const sidebar = 'src/components/AppSidebar.vue';
  const topbar = 'src/components/AppTopbar.vue';
  const navigationStore = 'src/stores/navigation.ts';
  const server = 'server/index.mjs';
  const styles = 'src/styles/main.css';

  expectFile('src/views/LoginView.vue');
  expectFile('src/views/AccountSecurityView.vue');
  expectIncludes('src/views/LoginView.vue', 'submitLogin');
  expectIncludes('src/views/AccountSecurityView.vue', 'submitPasswordChange');
  expectIncludes('src/views/AccountSecurityView.vue', 'useNavigationStore');
  expectIncludes('src/views/AccountSecurityView.vue', 'navigation.clearMenus()');
  assert(
    /async function submitPasswordChange[\s\S]*await session\.updateOwnPassword[\s\S]*navigation\.clearMenus\(\);[\s\S]*router\.replace\(\{ path: '\/login'/.test(read('src/views/AccountSecurityView.vue')),
    'password change should clear menus before redirecting to login',
  );
  expectIncludes(api, 'sessionTokenStorageKey');
  expectIncludes(api, 'sessionExpiredEventName');
  expectIncludes(api, 'notifySessionExpired');
  expectIncludes(api, 'window.dispatchEvent(new CustomEvent(sessionExpiredEventName');
  expectIncludes(api, 'if (sessionToken) notifySessionExpired(errorMessage)');
  expectIncludes(api, "headers.set('Authorization'");
  expectIncludes(api, "request<LoginSessionResponse>('/session/login'");
  expectIncludes(api, "request<{ ok: boolean; sessionsCleared: number }>('/session/password'");
  assert(
    /if \(!response\.ok\)[\s\S]*if \(response\.status === 401\)[\s\S]*clearStoredSessionToken\(\)/.test(read(api)),
    'API requests should clear stale session tokens after 401 responses',
  );
  assert(
    /export async function loginSession[\s\S]*clearStoredSessionToken\(\)[\s\S]*request<LoginSessionResponse>\('\/session\/login'/.test(read(api)),
    'login should clear stale session tokens before authenticating',
  );
  expectIncludes(session, 'authRequired');
  expectIncludes(session, 'impersonateSession');
  expectIncludes(session, 'updateOwnPassword');
  expectIncludes(session, 'expireSession');
  expectIncludes(session, 'clearStoredSessionToken();');
  expectIncludes(session, 'clearPersistedCurrentAccount');
  expectIncludes(session, 'state.loadedFromAccounts && (state.user.roles.includes');
  expectIncludes(session, 'state.loadedFromAccounts && state.user.permissions.includes(permissionCode)');
  expectIncludes(session, 'userDisplayName');
  expectIncludes(session, 'userDepartmentLabel');
  expectIncludes('src/views/AccountSecurityView.vue', 'currentAccountHasPassword');
  expectIncludes('src/views/AccountSecurityView.vue', 'currentAccount.value?.passwordSet ?? true');
  expectIncludes('src/views/AccountSecurityView.vue', 'firstPasswordBlockedReason');
  expectIncludes('src/views/AccountSecurityView.vue', 'moduleReadPermissionCodes');
  expectIncludes('src/views/AccountSecurityView.vue', 'session.hasPermission(moduleReadPermissionCodes.system)');
  expectIncludes('src/views/AccountSecurityView.vue', '首次启用密码登录必须由拥有系统配置维护权限的账号设置');
  expectIncludes('src/views/AccountSecurityView.vue', 'passwordFieldsDisabled');
  expectIncludes('src/views/AccountSecurityView.vue', "currentAccountHasPassword.value ? currentPassword.value : true");
  expectIncludes('src/views/AccountSecurityView.vue', "currentAccountHasPassword.value ? currentPassword.value : ''");
  expectIncludes('src/views/AccountSecurityView.vue', '当前账号尚未设置登录密码，本次会作为首次密码设置');
  expectIncludes(sidebar, 'canInitializePasswordLogin');
  expectIncludes(sidebar, 'accountSecurityTitle');
  expectIncludes(sidebar, 'if (!session.loadedFromAccounts) return');
  expectIncludes(sidebar, '{{ session.userDisplayName }}');
  expectIncludes(sidebar, '{{ session.userDepartmentLabel }}');
  expectExcludes(sidebar, ['{{ session.user.name }}', '{{ session.user.department }}']);
  assert(
    !read(session).includes("!state.loadedFromAccounts && state.user.roleCodes.includes('ROLE-ADMIN')"),
    'session permissions should not grant admin access before account permissions are loaded',
  );
  expectIncludes(session, 'const hasStoredToken = Boolean(getStoredSessionToken())');
  expectIncludes(session, 'this.expireSession();');
  assert(
    /expireSession\(message = '登录已过期，请重新登录。'\)[\s\S]*clearStoredSessionToken\(\)[\s\S]*clearPersistedCurrentAccount\(\)[\s\S]*this\.authRequired = true[\s\S]*this\.authenticated = false[\s\S]*this\.clearSessionState\(message\)/.test(read(session)),
    'session store should expose a centralized expired-session transition',
  );
  assert(
    /async logout\(\)[\s\S]*clearPersistedCurrentAccount\(\)[\s\S]*this\.clearSessionState\('已退出登录。'\)/.test(read(session)),
    'logout should clear the persisted account fallback together with the bearer session',
  );
  assert(
    /async updateOwnPassword[\s\S]*changeOwnPassword[\s\S]*clearPersistedCurrentAccount\(\)[\s\S]*this\.clearSessionState\('密码已更新，请使用新密码重新登录。'\)/.test(read(session)),
    'own-password updates should clear the persisted account fallback after revoking the bearer session',
  );
  assert(
    /this\.loadedFromAccounts && !force[\s\S]*this\.authenticated && !hasStoredToken[\s\S]*this\.expireSession\(\)[\s\S]*!this\.authenticated && hasStoredToken[\s\S]*force = true/.test(read(session)),
    'session store should reconcile cached auth state with token storage before using cached account permissions',
  );
  assert(
    /error instanceof ApiError && error\.status === 403[\s\S]*!hasStoredToken[\s\S]*hasPersistedCurrentAccount\(\)[\s\S]*clearPersistedCurrentAccount\(\)[\s\S]*getCurrentSession\(\)/.test(read(session)),
    'session store should recover from a stale local current-account cache in no-password mode',
  );
  expectIncludes(navigationStore, 'clearMenus()');
  expectIncludes(navigationStore, 'this.menuRows = []');
  expectIncludes(layout, 'sessionExpiredEventName');
  expectIncludes(layout, 'shellStatusTitle');
  expectIncludes(layout, 'shellStatusMessage');
  expectIncludes(layout, 'session.accountLoadError && !session.authRequired');
  expectIncludes(layout, 'navigation.error');
  expectIncludes(layout, 'class="access-denied-banner shell-status-banner"');
  expectIncludes(styles, '.shell-status-banner');
  expectIncludes(layout, 'handleSessionExpired');
  expectIncludes(layout, 'session.expireSession(message)');
  expectIncludes(layout, 'navigation.clearMenus()');
  expectIncludes(layout, "path: '/login'");
  expectIncludes(layout, 'redirect: route.fullPath');
  expectIncludes(router, "path: '/login'");
  expectIncludes(router, "path: 'account/security'");
  expectIncludes(router, 'authenticatedOnly: true');
  expectIncludes(router, 'session.authRequired');
  assert(
    /if \(to\.path === '\/login'\) \{[\s\S]*await session\.loadUserFromAccounts\(\);[\s\S]*if \(!session\.authRequired\) return '\/';[\s\S]*navigation\.clearMenus\(\);[\s\S]*return true;/.test(read(router)),
    'login route should clear stale scoped menus when a login is required',
  );
  assert(
    /if \(session\.authRequired\) \{[\s\S]*navigation\.clearMenus\(\);[\s\S]*path: '\/login'/.test(read(router)),
    'router guard should clear menus before redirecting an expired session to login',
  );
  expectIncludes(sidebar, 'handleLogout');
  assert(
    /async function handleLogout[\s\S]*await session\.logout\(\);[\s\S]*navigation\.clearMenus\(\);[\s\S]*router\.push\('\/login'\)/.test(read(sidebar)),
    'logout should clear scoped menus instead of reloading them',
  );
  assert(
    /onMounted\(\(\) => \{[\s\S]*session\.loadUserFromAccounts\(true\)\.then\(\(\) => \{[\s\S]*if \(session\.authRequired\) \{[\s\S]*navigation\.clearMenus\(\);[\s\S]*return;[\s\S]*navigation\.loadMenus\(true\)/.test(read(sidebar)),
    'sidebar mount should not reload menus when the session requires login',
  );
  expectIncludes(sidebar, "router.push('/account/security')");
  expectIncludes(sidebar, 'const previousCode = session.user.accountCode');
  expectIncludes(sidebar, 'target.value = previousCode');
  assert(
    /async function handleAccountChange[\s\S]*await session\.switchAccount\(nextCode\);[\s\S]*if \(session\.authRequired\) \{[\s\S]*navigation\.clearMenus\(\);[\s\S]*path: '\/login'[\s\S]*await navigation\.loadMenus\(true\)/.test(read(sidebar)),
    'account switch should clear menus and redirect to login when the switch expires the session before reloading menus',
  );
  assert(
    /catch \(error\) \{[\s\S]*target\.value = previousCode;[\s\S]*if \(session\.authRequired\) \{[\s\S]*navigation\.clearMenus\(\);[\s\S]*path: '\/login'[\s\S]*return;[\s\S]*session\.accountLoadError/.test(read(sidebar)),
    'failed account switch should redirect to login when the failure expires the session',
  );
  expectIncludes(sidebar, "session.accountLoadError = error instanceof Error ? error.message : '账号切换失败'");
  expectIncludes(sidebar, 'moduleReadPermissionCodes');
  expectIncludes(sidebar, 'const canInitializePasswordLogin = computed(() => accountSetupMode.value && session.hasPermission(moduleReadPermissionCodes.system))');
  expectIncludes(sidebar, 'const canOpenAccountSecurity = computed(() => session.authenticated || canInitializePasswordLogin.value)');
  expectIncludes(sidebar, 'session.hasPermission(moduleReadPermissionCodes.system)');
  expectIncludes(sidebar, 'const canSwitchAccounts = computed(() => session.hasPermission(moduleReadPermissionCodes.system) || accountSetupMode.value)');
  expectIncludes(sidebar, 'v-if="canSwitchAccounts && accountOptions.length > 1"');
  expectIncludes('src/stores/navigation.ts', "normalizedPath === '/account/security'");
  expectIncludes(topbar, 'await session.loadUserFromAccounts(true)');
  expectIncludes(topbar, 'if (session.authRequired)');
  assert(
    /async function refreshWorkspace[\s\S]*if \(session\.authRequired\) \{[\s\S]*navigation\.clearMenus\(\);[\s\S]*path: '\/login'/.test(read(topbar)),
    'topbar refresh should clear menus before redirecting to login',
  );
  expectIncludes(topbar, "path: '/login'");
  expectIncludes(topbar, 'await navigation.loadMenus(true)');
  expectIncludes(topbar, 'canAccessNavigationPath(');
  expectIncludes(topbar, 'navigation.menuRows');
  expectIncludes(topbar, 'navigation.loaded');
  expectIncludes(topbar, 'navigation.error ||');
  expectIncludes(topbar, 'routeWritePermission(route.path)');
  expectIncludes(server, 'verifyPassword');
  expectIncludes(server, 'createAccountSession');
  expectIncludes(server, 'accountIdentityMatches');
  assert(
    !read(server).includes('row.name === identifier') && !read(server).includes('account.name === accountKey'),
    'account display names should not be accepted as login or account-header identifiers',
  );
  expectIncludes(server, "parts[2] === 'impersonate'");
  expectIncludes(server, 'accountPermissionCodesForAccount(data, currentAccount).has(systemPermissionCode)');
  expectIncludes('scripts/smoke-api.mjs', 'guardedSystemWrites');
  expectIncludes('scripts/smoke-api.mjs', 'sales cannot update system account config');
  expectIncludes('scripts/smoke-api.mjs', 'sales cannot check system app health');
  expectIncludes('scripts/smoke-api.mjs', 'sales cannot record mcp tool verification');
  expectIncludes(server, '目标账号尚未设置登录密码，不能在密码登录模式下切换。');
  expectIncludes(server, 'sessionCreatedBeforePasswordUpdate');
  expectIncludes(server, 'passwordUpdatedMs');
  expectIncludes(server, 'createdMs');
  expectIncludes(server, "appendSystemLog(system, '登录成功'");
  expectIncludes(server, "appendSystemLog(system, '退出登录'");
  expectIncludes(server, "appendSystemLog(system, '切换账号'");
  expectIncludes(server, "parts[2] === 'login'");
  expectIncludes(server, "parts[2] === 'password'");
  expectIncludes(server, "appendSystemLog(system, '修改登录密码'");
  expectIncludes(server, 'assertPasswordLoginHasSystemManager');
  expectIncludes(server, 'assertPasswordLoginHasSystemManager(data, proposedAccounts)');
  expectIncludes(server, '启用密码登录后必须至少保留一个已设置密码且拥有系统配置维护权限的账号');
  expectIncludes('scripts/smoke-api.mjs', 'password mode requires password system manager');
  expectIncludes('scripts/smoke-api.mjs', 'non-system account cannot set first password');
  expectIncludes('scripts/smoke-api.mjs', 'password login rejects account display name');
  expectIncludes('scripts/smoke-api.mjs', 'account display name cannot be used as account header');
  expectIncludes('scripts/smoke-api.mjs', 'system manager cannot impersonate passwordless account in password mode');
  expectIncludes('scripts/smoke-api.mjs', 'sales can change own password');
  expectIncludes('scripts/smoke-api.mjs', 'non-system account can change own password');
});

run('notification bell is actionable and resilient', () => {
  const topbar = 'src/components/AppTopbar.vue';
  const home = 'src/views/HomeView.vue';
  const api = 'src/services/api.ts';
  const apiSmoke = 'scripts/smoke-api.mjs';
  const styles = 'src/styles/main.css';
  expectIncludes(api, 'export type AppNotification');
  expectIncludes(api, 'markNotificationRead');
  expectIncludes(api, 'markAllNotificationsRead');
  expectIncludes(topbar, 'notificationMetaText');
  expectIncludes(topbar, 'notificationTitleText');
  expectIncludes(topbar, ':title="notificationTitleText(item)"');
  expectIncludes(topbar, '{{ notificationMetaText(item) }}');
  expectIncludes(topbar, 'CheckCheck');
  expectIncludes(topbar, 'notification-popover-actions');
  expectIncludes(topbar, '@click="loadNotificationInbox"');
  expectIncludes(topbar, "{{ notificationsLoading ? '刷新中' : '刷新' }}");
  expectIncludes(topbar, "notificationError.value = error instanceof Error ? error.message : '通知操作失败'");
  expectIncludes(topbar, "async function pathAccessDeniedReason(path: string): Promise<AccessDeniedReason | ''>");
  expectIncludes(topbar, 'await navigation.loadMenus()');
  expectIncludes(topbar, '已保持未读');
  expectIncludes(topbar, 'notificationsOpen.value = false;');
  expectIncludes(styles, '.notification-popover-actions');
  expectIncludes(styles, '.notification-popover-title');
  assert(
    /async function openNotification[\s\S]*try \{[\s\S]*await pathAccessDeniedReason\(item\.sourcePath\)[\s\S]*markNotificationRead\(item\.code\)[\s\S]*openAccessiblePath\(item\.sourcePath\)[\s\S]*catch \(error\)/.test(read(topbar)),
    'opening a notification should verify access before marking read, navigate, and surface failures',
  );
  assert(
    /if \(deniedReason\) \{[\s\S]*已保持未读[\s\S]*notificationsOpen\.value = false;[\s\S]*accessDeniedHomeLocation\(deniedReason, item\.sourcePath\)/.test(read(topbar)),
    'blocked topbar notification navigation should close the popover and keep the item unread',
  );
  assert(
    /async function markAllRead[\s\S]*try \{[\s\S]*markAllNotificationsRead[\s\S]*catch \(error\)/.test(read(topbar)),
    'mark-all-read should surface failures in the popover',
  );
  expectIncludes(home, 'listNotifications(8)');
  expectIncludes(home, 'homeNotifications');
  expectIncludes(home, 'notificationTitleText');
  expectIncludes(home, ':title="notificationTitleText(notice)"');
  expectIncludes(home, "async function pathAccessDeniedReason(path: string): Promise<AccessDeniedReason | ''>");
  expectIncludes(home, 'await navigation.loadMenus()');
  expectIncludes(home, 'markNotificationRead(item.code)');
  expectIncludes(home, 'openAccessiblePath(item.sourcePath)');
  expectIncludes(home, '已保持未读');
  assert(
    /async function openHomeNotification[\s\S]*try \{[\s\S]*await pathAccessDeniedReason\(item\.sourcePath\)[\s\S]*markNotificationRead\(item\.code\)[\s\S]*openAccessiblePath\(item\.sourcePath\)[\s\S]*catch \(error\)/.test(read(home)),
    'home notification cards should verify access before marking read',
  );
  expectIncludes(home, 'homeNotificationError.value = error instanceof Error ? error.message : \'通知操作失败\'');
  expectIncludes(styles, '.notice-card.unread');
  expectIncludes(styles, '.notice-refresh-button');
  expectExcludes(home, ['import { notices']);
  expectIncludes(apiSmoke, 'outbound submit creates warehouse notification');
  expectIncludes(apiSmoke, 'warehouse can mark notification read');
  expectIncludes(apiSmoke, 'disabled notification rule suppresses outbound notification');
});

run('system audit logs are structured and read-only', () => {
  const server = 'server/index.mjs';
  const moduleView = 'src/views/ModuleView.vue';
  const api = 'src/services/api.ts';
  const apiSmoke = 'scripts/smoke-api.mjs';
  const styles = 'src/styles/main.css';
  const moduleViewSource = read(moduleView);
  const stylesSource = read(styles);
  const logsColumnStart = moduleViewSource.indexOf('if (isLogsPage.value) {');
  const logsColumnEnd = moduleViewSource.indexOf('  return [', logsColumnStart + 1);
  const logsColumnBlock = moduleViewSource.slice(logsColumnStart, logsColumnEnd);
  expectIncludes(api, 'target?: string');
  expectIncludes(api, 'remark?: string');
  expectIncludes(api, 'sourceAccount?: string');
  expectIncludes(api, 'sourceIp?: string');
  expectIncludes(server, 'target: targetText');
  expectIncludes(server, 'remark: remarkText');
  expectIncludes(server, 'sourceAccount');
  expectIncludes(server, 'system.logs = system.logs.slice(0, 500)');
  expectIncludes(server, 'normalizeLegacySystemLogAction');
  expectIncludes(server, 'updatedAt: shanghaiDateTime()');
  expectIncludes(server, 'systemConfigChangeSummary');
  expectIncludes(server, 'systemAuditFieldsByPage');
  expectIncludes(server, '变更：');
  expectIncludes(server, '系统日志只读，不能手动新建或修改');
  expectIncludes(server, "menuDefaults.find((menu) => menu.menuKey === 'system')");
  expectIncludes(server, 'const systemMenuPageKeys =');
  expectIncludes(server, 'sharedPermissionMatrix.systemPageBehavior');
  expectIncludes(server, 'const readOnlySystemPages = new Set(');
  expectIncludes(server, 'const nonCreatableSystemPages = new Set(');
  expectIncludes(server, 'const systemCreateBlockedMessages = systemPageBehavior.createBlockedMessages || {}');
  expectIncludes(server, 'const systemApiPages = new Set(systemMenuPageKeys)');
  expectIncludes(server, 'const systemLifecyclePages = new Set(systemMenuPageKeys.filter');
  expectExcludes(server, ["const systemApiPages = new Set([...systemLifecyclePages, 'logs'])"]);
  expectIncludes(server, 'auditPermissionDenied');
  expectIncludes(server, 'appendBusinessAuditLog');
  expectIncludes(server, '权限拒绝');
  expectIncludes(server, '确认销售订单');
  expectIncludes(server, '确认采购订单');
  expectIncludes(server, '确认采购入库');
  expectIncludes(server, '确认销售出库');
  expectIncludes(server, '登记收款');
  expectIncludes(server, 'requireReadPermissionAudited');
  expectIncludes(server, 'requireWritePermissionAudited');
  expectIncludes(apiSmoke, 'permission denied read is audited');
  expectIncludes(apiSmoke, 'permission denied operation is audited');
  expectIncludes(apiSmoke, 'system audit logs cannot be created manually');
  expectIncludes(apiSmoke, 'system audit logs cannot be edited manually');
  expectIncludes(apiSmoke, 'system config updates are audited');
  expectIncludes(apiSmoke, "String(row.remark || '').includes('变更：说明：')");
  expectIncludes(apiSmoke, 'business workflow actions are audited');
  expectIncludes(apiSmoke, 'internal notification inbox is not exposed as system config page');
  assert(logsColumnStart >= 0 && logsColumnEnd > logsColumnStart, 'logs table column block should be discoverable');
  assert(!logsColumnBlock.includes("key: 'actions'"), 'logs table should use row click instead of a redundant action column');
  expectIncludes(moduleView, 'notifications: 1300');
  expectIncludes(moduleView, 'apps: 1240');
  expectIncludes(moduleView, "'mcp-tools': 1240");
  expectIncludes(moduleView, 'logs: 1390');
  expectIncludes(moduleView, "key: 'sourceAccount'");
  expectIncludes(moduleView, "key: 'sourceIp'");
  expectIncludes(moduleView, "if (key === 'sourceAccount') return row.sourceAccount || row.owner || '-'");
  expectIncludes(moduleView, "if (key === 'sourceIp') return row.sourceIp || '-'");
  expectIncludes(moduleView, 'function systemRowSearchValues(row: SystemRecord)');
  expectIncludes(moduleView, 'function systemRowMatchesKeyword(row: SystemRecord, keyword: string)');
  expectIncludes(moduleView, 'function logRowsMatchingSearchAndDate()');
  expectIncludes(moduleView, 'logStatusSummary');
  expectIncludes(moduleView, 'logStatusSummaryRows');
  expectIncludes(moduleView, 'logStatusFilter');
  expectIncludes(moduleView, 'logActionFilter');
  expectIncludes(moduleView, "搜索日志编码、操作、对象、单号、来源账号或内容");
  expectIncludes(moduleView, 'businessLogTargetRoutes');
  expectIncludes(moduleView, "prefix: 'SO', label: '销售订单', path: '/sales/orders'");
  expectIncludes(moduleView, "prefix: 'SR', label: '交付追踪', path: '/sales/outbound-requests'");
  expectIncludes(moduleView, "prefix: 'WR', label: '采购入库', path: '/warehouse/purchase-receipts'");
  expectExcludes(moduleView, ["/finance/sales-invoices", "/finance/purchase-invoices", "/finance/receivables", "/finance/payables"]);
  expectIncludes(moduleView, 'function logSearchText(row: SystemRecord)');
  expectIncludes(moduleView, 'isLogsPage.value ? logSearchText(row) :');
  expectIncludes(moduleView, 'businessRecordLocationForCode(target)');
  expectIncludes(moduleView, 'const selectedSystemLogSourceAccountLocation = computed');
  expectIncludes(moduleView, 'accountRecordByIdentity(systemDraft.sourceAccount || systemDraft.owner)');
  expectIncludes(moduleView, ':to="selectedSystemLogSourceAccountLocation"');
  expectIncludes(moduleView, '查看账号');
  expectIncludes(styles, '.system-log-inline-link');
  expectIncludes(moduleView, 'const namingRuleRows = ref<SystemRecord[]>([]);');
  expectIncludes(moduleView, 'const appRows = ref<SystemRecord[]>([]);');
  expectIncludes(moduleView, 'const mcpToolRows = ref<SystemRecord[]>([]);');
  expectIncludes(moduleView, 'const relatedNamingRuleRows = computed(() => (isNamingRulesPage.value ? systemRows.value : namingRuleRows.value));');
  expectIncludes(moduleView, 'const relatedAppRows = computed(() => (isAppsPage.value ? systemRows.value : appRows.value));');
  expectIncludes(moduleView, 'const relatedMcpToolRows = computed(() => (isMcpToolsPage.value ? systemRows.value : mcpToolRows.value));');
  expectIncludes(moduleView, "if (page === 'naming-rules') return relatedNamingRuleRows.value;");
  expectIncludes(moduleView, "if (page === 'apps') return relatedAppRows.value;");
  expectIncludes(moduleView, "if (page === 'mcp-tools') return relatedMcpToolRows.value;");
  expectIncludes(moduleView, "systemPageKey.value === 'naming-rules' ? Promise.resolve(systemRows.value) : listSystemRecords('naming-rules')");
  expectIncludes(moduleView, "systemPageKey.value === 'apps' ? Promise.resolve(systemRows.value) : listSystemRecords('apps')");
  expectIncludes(moduleView, "systemPageKey.value === 'mcp-tools' ? Promise.resolve(systemRows.value) : listSystemRecords('mcp-tools')");
  expectIncludes(moduleView, 'applyLogStatusFilter');
  expectIncludes(moduleView, 'applyLogActionFilter');
  expectIncludes(moduleView, 'class="system-log-chip"');
  expectIncludes(moduleView, 'logDateStartFilter');
  expectIncludes(moduleView, 'logDateEndFilter');
  expectIncludes(moduleView, 'hasActiveLogFilters');
  expectIncludes(moduleView, 'clearLogFilters');
  expectIncludes(moduleView, '没有匹配的日志');
  expectIncludes(moduleView, '当前筛选条件没有匹配日志，可以清空筛选后查看全部日志。');
  expectIncludes(moduleView, 'logDateBoundary(logDateStartFilter.value)');
  expectIncludes(moduleView, 'logDateBoundary(logDateEndFilter.value, true)');
  expectIncludes(moduleView, 'hasInvalidLogDateRange');
  expectIncludes(moduleView, 'logDateRangeMessage');
  expectIncludes(moduleView, '结束日期不能早于开始日期，请调整日志日期范围。');
  expectIncludes(moduleView, 'logActionFilterOptions');
  expectIncludes(moduleView, 'logActionSummaryRows');
  expectIncludes(moduleView, 'row.status === logStatusFilter.value');
  expectIncludes(moduleView, 'row.name === logActionFilter.value');
  expectIncludes(moduleView, 'if (logActionFilter.value !== \'全部\')');
  expectIncludes(moduleView, 'if (logStatusFilter.value !== \'全部\')');
  expectIncludes(moduleView, 'isLogsPage.value || isCreating.value || selectedSystemRecordVisible.value');
  expectIncludes(moduleView, '<template v-if="selectedSystemRecordVisible">');
  expectIncludes(moduleView, 'system-log-empty-detail');
  expectIncludes(moduleView, 'downloadVisibleLogsCsv');
  expectIncludes(moduleView, "const text = /^[=+\\-@]/.test(rawText.trimStart()) ? `\\t${rawText}` : rawText;");
  expectIncludes(moduleView, '/[",\\n\\r\\t]/.test(text)');
  expectIncludes(moduleView, 'filatrix-system-logs-');
  expectIncludes(moduleView, '@click="clearLogFilters"');
  expectIncludes(moduleView, '@click="downloadVisibleLogsCsv"');
  expectIncludes(moduleView, ':disabled="hasInvalidLogDateRange || !visibleSystemRows.length"');
  expectIncludes(moduleView, "system-config-toolbar-logs");
  expectIncludes(moduleView, '<div v-if="isLogsPage" class="system-log-filters">');
  expectIncludes(styles, '@media (max-width: 1280px) and (min-width: 901px)');
  expectIncludes(styles, '.system-config-page-logs .system-config-grid');
  expectIncludes(styles, '.system-config-page-logs .system-config-editor');
  expectIncludes(styles, '.system-config-page-logs .system-log-detail');
  expectIncludes(styles, '.system-log-empty-detail');
  expectIncludes(styles, '.system-log-chip.active');
  assert(
    /\.system-config-page-logs \.system-config-grid[\s\S]*\{[\s\S]*grid-template-columns: 1fr;/.test(stylesSource),
    'logs page should keep the table full width instead of squeezing it beside the detail panel',
  );
  assert(
    /\.system-config-page-logs \.system-config-editor[\s\S]*\{[\s\S]*position: static;[\s\S]*max-height: none;/.test(stylesSource),
    'logs detail panel should avoid sticky side-panel clipping',
  );
  expectIncludes(moduleView, 'logActionSummaryRows.value.forEach');
  expectIncludes(moduleView, '.sort((a, b) => b.count - a.count');
  expectIncludes(moduleView, '.slice(0, 6)');
  expectIncludes(moduleView, '当前筛选');
  expectExcludes(server, [
    'function requireReadPermission(',
    'function requireWritePermission(',
    'function requireOperationPermission(',
  ]);
  expectIncludes(moduleView, 'systemDraft.sourceAccount');
  expectIncludes(moduleView, 'systemDraft.sourceIp');
  expectIncludes(moduleView, 'if (row.target) return row.target');
  expectIncludes(moduleView, 'if (row.remark) return row.remark');
  expectIncludes(moduleView, 'function systemRecordLocationForCode(rawCode: string | undefined)');
  expectIncludes(moduleView, 'const selectedSystemLogTargetLocation = computed');
  expectIncludes(moduleView, 'class="system-log-target-link"');
  expectIncludes(moduleView, ':to="selectedSystemLogTargetLocation"');
  expectIncludes(styles, '.system-config-cell-sourceAccount');
  expectIncludes(styles, '.system-config-cell-sourceIp');
  expectIncludes(styles, '.system-log-target-link');
});

run('system config saves refresh session and navigation access', () => {
  const moduleView = 'src/views/ModuleView.vue';
  const sidebar = 'src/components/AppSidebar.vue';
  const topbar = 'src/components/AppTopbar.vue';
  const router = 'src/router/index.ts';
  const navigation = 'src/stores/navigation.ts';
  const moduleViewSource = read(moduleView);

  expectIncludes(moduleView, 'async function refreshSystemAccessAfterSave()');
  expectIncludes(moduleView, 'function syncCurrentSystemRelatedRows()');
  expectIncludes(moduleView, 'if (isAccountsPage.value) accountRows.value = systemRows.value');
  expectIncludes(moduleView, 'if (isRolesPage.value) roleRows.value = systemRows.value');
  expectIncludes(moduleView, 'if (isMenusPage.value) menuRows.value = systemRows.value');
  expectIncludes(moduleView, 'if (isNamingRulesPage.value) namingRuleRows.value = systemRows.value');
  expectIncludes(moduleView, 'if (isAppsPage.value) appRows.value = systemRows.value');
  expectIncludes(moduleView, 'if (isMcpToolsPage.value) mcpToolRows.value = systemRows.value');
  expectIncludes(moduleView, 'function systemStatusActionLabel(row: SystemRecord)');
  expectIncludes(moduleView, 'function systemStatusActionTitle(row: SystemRecord)');
  expectIncludes(moduleView, ':title="systemStatusActionTitle(row)"');
  expectIncludes(moduleView, '{{ systemStatusActionLabel(row) }}');
  expectIncludes(moduleView, 'await session.loadUserFromAccounts(true)');
  expectIncludes(moduleView, 'await navigation.loadMenus(true)');
  expectIncludes(moduleView, 'canAccessNavigationPath(');
  expectIncludes(moduleView, "accessDeniedHomeLocation(navigation.error ? 'navigation' : 'menu'");
  assert(
    /async function refreshSystemAccessAfterSave[\s\S]*if \(session\.authRequired\) \{[\s\S]*navigation\.clearMenus\(\);[\s\S]*path: '\/login'/.test(moduleViewSource),
    'system config access refresh should clear menus before redirecting an expired session to login',
  );
  expectIncludes(moduleView, 'syncCurrentSystemRelatedRows();');
  expectIncludes(moduleView, 'await refreshSystemAccessAfterSave();');
  const saveStart = moduleViewSource.indexOf('async function saveSystemDraft()');
  const saveEnd = moduleViewSource.indexOf('async function toggleSystemStatus', saveStart);
  const saveBlock = moduleViewSource.slice(saveStart, saveEnd);
  assert(saveStart >= 0 && saveEnd > saveStart, 'system save block should be discoverable');
  assert(
    saveBlock.indexOf('syncCurrentSystemRelatedRows();') < saveBlock.indexOf('selectSystemRecord(saved);'),
    'system save should sync related caches before selecting the saved row',
  );
  assert(
    saveBlock.indexOf('selectSystemRecord(saved);') < saveBlock.indexOf('await refreshSystemAccessAfterSave();'),
    'system save should refresh access after the selected draft is current',
  );
  expectIncludes(moduleView, 'wasAccountPasswordUpdate');
  expectIncludes(moduleView, 'wasAccountDisable');
  expectIncludes(moduleView, 'const saveResultMessage = wasAccountDisable');
  expectIncludes(moduleView, '已保存，账号已停用，旧会话已失效');
  expectIncludes(moduleView, '已保存，密码已更新，旧会话已失效');
  expectIncludes(moduleView, 'showSystemActionMessage(saveResultMessage, saved.code)');
  const toggleStart = moduleViewSource.indexOf('async function toggleSystemStatus(row: SystemRecord)');
  const toggleEnd = moduleViewSource.indexOf('async function checkSelectedAppHealth()', toggleStart);
  const toggleBlock = moduleViewSource.slice(toggleStart, toggleEnd);
  assert(toggleStart >= 0 && toggleEnd > toggleStart, 'system toggle block should be discoverable');
  assert(
    toggleBlock.indexOf('syncCurrentSystemRelatedRows();') < toggleBlock.indexOf('if (selectedCode.value === saved.code) selectSystemRecord(saved);'),
    'system toggle should sync related caches before refreshing selected row state',
  );
  assert(
    toggleBlock.indexOf('if (selectedCode.value === saved.code) selectSystemRecord(saved);') <
      toggleBlock.indexOf('await refreshSystemAccessAfterSave();'),
    'system toggle should refresh access after the selected draft is current',
  );
  assert(toggleBlock.includes('const toggleMessage ='), 'system toggle should prepare a contextual status message');
  assert(toggleBlock.includes('旧会话已失效'), 'account disable toggle should tell the user old sessions were invalidated');
  assert(toggleBlock.includes('showSystemActionMessage(toggleMessage, saved.code)'), 'system toggle should expose a matching log link');
  expectIncludes(moduleView, 'showSystemActionMessage(`健康检查${result.healthStatus}：${result.healthMessage}`, record.code)');
  expectIncludes(moduleView, "showSystemActionMessage(`已记录验证：${record.lastVerifiedAt || '刚刚'}`, record.code)");
  expectIncludes(sidebar, 'await navigation.loadMenus(true)');
  expectIncludes(sidebar, 'const writePermission = routeWritePermission(route.path)');
  expectIncludes(sidebar, "accessDeniedHomeLocation(navigation.error ? 'navigation' : canReadCurrentRoute ? 'write' : 'menu'");
  expectIncludes(topbar, 'async function refreshWorkspace()');
  expectIncludes(topbar, 'await session.loadUserFromAccounts(true)');
  expectIncludes(topbar, 'await navigation.loadMenus(true)');
  expectIncludes(topbar, 'await loadNotificationInbox()');
  expectIncludes(topbar, 'const writePermission = routeWritePermission(route.path)');
  expectIncludes(topbar, "accessDeniedHomeLocation(navigation.error ? 'navigation' : canReadCurrentRoute ? 'write' : 'menu'");
  expectIncludes(router, 'await Promise.all([session.loadUserFromAccounts(), navigation.loadMenus()])');
  expectIncludes(router, 'const writePermission = routeWritePermission(to.path)');
  expectIncludes(navigation, 'canAccessNavigationPath');
  expectIncludes(navigation, 'routeWritePermission');
  expectIncludes(navigation, 'menuConfigLoaded');
});

run('system permissions and roles block unsafe disable actions', () => {
  const server = 'server/index.mjs';
  const moduleView = 'src/views/ModuleView.vue';
  const permissionMatrix = 'src/data/permissionMatrix.ts';
  const sharedPermissionMatrix = 'shared/permission-matrix.json';
  const api = 'src/services/api.ts';
  const apiSmoke = 'scripts/smoke-api.mjs';
  const topbar = 'src/components/AppTopbar.vue';
  const styles = 'src/styles/main.css';
  expectIncludes(server, 'permissionUsageSummary');
  expectIncludes(server, 'summarizedNameList');
  expectIncludes(server, 'permissionStopReferenceSummary');
  expectIncludes(server, '该权限仍被引用：${permissionStopReferenceSummary(data, usage, dependentOperations)}');
  expectIncludes(server, 'roleUsageSummary');
  expectIncludes(server, 'liveRows.some((row) => row.code === record.code)');
  expectIncludes(server, '不能重复新建');
  expectIncludes(server, 'assertActorKeepsSystemConfig');
  expectIncludes(server, 'dataWithProposedSystemRecord');
  expectIncludes(server, 'validateActivePermissionCodes');
  expectIncludes(server, 'operationPermissionDependencies');
  expectIncludes(server, 'effectivePermissionCodeSet');
  expectIncludes(server, 'activeDependentOperationPermissions');
  expectIncludes(server, 'permissionDisplayLabel');
  expectIncludes(server, '权限，不能查看该数据');
  expectIncludes(server, '操作权限，不能执行该动作');
  expectIncludes(server, 'validateOperationPermissionDependencies');
  expectIncludes(server, 'validateMenuPermissionMatchesPath');
  expectIncludes(server, 'validateMenuPermissionIsNotOperation');
  expectIncludes(server, 'isOperationPermissionCode');
  expectIncludes(server, 'permissionDisplayLabel(data, requiredPermission)');
  expectIncludes(server, 'menuRequiredPermissionForPath');
  expectIncludes(server, 'function menuRequiredPermissionCodesForRow');
  expectIncludes(server, 'const requiredPermissions = menuRequiredPermissionCodesForRow(rows, row)');
  expectIncludes(server, 'record.status !== \'停用\' && record.parentCode');
  expectIncludes(server, '请先启用上级菜单');
  expectIncludes(server, 'supportedPermissionCodes');
  expectIncludes(server, '.filter((permissionCode) => supportedPermissionCodes.has(permissionCode))');
  expectIncludes(server, 'name: existing?.name || defaultPermission.name');
  expectIncludes(server, 'owner: existing?.owner || defaultPermission.owner');
  expectIncludes(server, 'description: existing?.description || defaultPermission.description');
  expectIncludes(server, 'normalizeSystemStatus');
  expectIncludes(server, '系统配置状态只能选择启用或停用');
  expectIncludes(server, 'flattenedMenuDefaults.find((menu) => menu.code === code)');
  expectIncludes(server, 'menuKey: defaultMenu.menuKey');
  expectIncludes(server, 'path: defaultMenu.path');
  expectIncludes(server, 'validateActiveRoleCodes');
  expectIncludes(server, 'validateUniqueSystemName');
  expectIncludes(server, "validateUniqueSystemName(page, record, rows, '权限名称')");
  expectIncludes(server, '角色名称');
  expectIncludes(server, 'activeRoleRowsForAccount');
  expectIncludes(server, 'assertEnabledAccountsHaveEffectivePermissions');
  expectIncludes(server, '必须至少拥有一个有效权限');
  expectIncludes(server, 'activeRoles.some((role) => role.code === adminRoleCode)');
  expectIncludes(server, '!permissionCodes.length');
  expectIncludes(server, 'usage.notifications.length');
  expectIncludes(server, 'roleStopReferenceSummary');
  expectIncludes(server, '该角色仍被引用：${roleStopReferenceSummary(usage)}');
  expectIncludes(moduleView, 'enabledRoleRequiresPermission');
  expectIncludes(moduleView, 'notificationRows');
  expectIncludes(moduleView, 'relatedNotificationRows');
  expectIncludes(moduleView, 'selectedRoleNotificationRows');
  expectIncludes(moduleView, 'roleLinkedNotificationCount');
  expectIncludes(moduleView, 'function roleStopReferenceSummary(roleCode: string)');
  expectIncludes(moduleView, '该角色仍被引用：${roleStopReferenceSummary(row.code)}');
  expectIncludes(moduleView, '接收通知');
  expectIncludes(moduleView, 'permissionOperationImpactMap');
  expectIncludes(moduleView, 'operationPermissionDependencies');
  expectIncludes(moduleView, 'operationPermissionRouteRules');
  expectIncludes(moduleView, 'operationPermissionCodeSet');
  expectIncludes(moduleView, 'duplicatePermissionName');
  expectIncludes(moduleView, 'permissionIdentityConflictMessage');
  expectIncludes(moduleView, '权限名称已被');
  expectIncludes(moduleView, 'effectivePermissionCodesFromSelection');
  expectIncludes(moduleView, 'addRolePermissionWithDependencies');
  expectIncludes(moduleView, 'removeRolePermissionWithDependents');
  expectIncludes(moduleView, 'rolePermissionAutoSyncMessage');
  expectIncludes(moduleView, 'rolePermissionBulkDisabledReason');
  expectIncludes(moduleView, ':title="rolePermissionBulkDisabledReason(group.rows)"');
  expectIncludes(moduleView, ':title="rolePermissionOptionTitle(permission)"');
  expectIncludes(moduleView, 'accountRoleOptionTitle(role)');
  expectIncludes(moduleView, 'menuPermissionOptionTitle(permission.code)');
  expectIncludes(moduleView, 'isOperationPermissionCode(permission.code)');
  expectIncludes(moduleView, '菜单入口不能绑定操作权限');
  expectIncludes(moduleView, '请在角色权限中配置确认、过账或收付款');
  expectIncludes(moduleView, 'rolePermissionVisibleSelected');
  expectIncludes(moduleView, 'isAdminRoleDraft.value ? effectiveRolePermissionCodes.value.includes(code) : rolePermissionCodes.value.includes(code)');
  expectIncludes(moduleView, 'isAdminRoleDraft.value ? effectiveRolePermissionCodes.value.length : rolePermissionCodes.value.length');
  expectIncludes(moduleView, 'const selectedRolePermissionTargets = computed');
  expectIncludes(moduleView, 'permissionLinkTargets(selectedRoleEffectivePermissions.value.map((permission) => permission.code))');
  expectIncludes(moduleView, "v-for=\"target in selectedRolePermissionTargets\"");
  expectIncludes(moduleView, "systemQueryLocation('/system/permissions', target.code)");
  expectIncludes(moduleView, '已自动带入基础权限');
  expectIncludes(moduleView, '已同步移除依赖操作权限');
  assert(
    /function rolePermissionVisibleSelected\(code: string\) \{[\s\S]*rolePermissionCodes\.value\.includes\(code\)/.test(read(moduleView)),
    'role editor should show raw selected permissions so historical dependency gaps are visible and repairable',
  );
  assert(
    /const selectedRoleOperationImpacts = computed[\s\S]*operationImpactsForPermissionCodes\(effectiveRolePermissionCodes\.value\)/.test(read(moduleView)) &&
      /function operationPermissionCodesFromEffectivePermissions[\s\S]*dependencies\.every\(\(dependency\) => permissionCodeSet\.has\(dependency\)\)/.test(read(moduleView)),
    'role and account operation impact summaries should still use effective permissions after dependency filtering',
  );
  assert(
    /function updateRolePermissions[\s\S]*addRolePermissionWithDependencies\(current, code\)[\s\S]*removeRolePermissionWithDependents\(current, code\)/.test(read(moduleView)),
    'role permission bulk actions should keep operation permission dependencies in sync',
  );
  expectIncludes(moduleView, 'dependentOperationPermissionRows');
  expectIncludes(moduleView, 'selectedPermissionOperationImpacts');
  expectIncludes(moduleView, 'selectedPermissionOperationSummary');
  expectIncludes(moduleView, 'operationImpactSearchText');
  expectIncludes(moduleView, 'permissionSearchText');
  expectIncludes(moduleView, "isPermissionsPage.value ? permissionSearchText(row) : ''");
  expectIncludes(moduleView, 'permissionSearchText(row), rolePermissionDependencyHint(row)');
  expectIncludes(moduleView, 'placeholder="搜索权限编码、名称、模块、菜单或操作"');
  expectIncludes(moduleView, 'operationImpactDisplay');
  expectIncludes(moduleView, 'operationRouteRuleDisplay');
  expectIncludes(moduleView, 'operationRouteRuleSearchText');
  expectIncludes(moduleView, 'selectedPermissionOperationRouteRules');
  expectIncludes(moduleView, 'selectedPermissionOperationRouteActionCount');
  expectIncludes(moduleView, 'selectedPermissionOperationRouteSummary');
  expectIncludes(moduleView, 'operationRouteRulesForPermissionCode(permission.code)');
  expectIncludes(moduleView, 'operationRouteRulesForPermissionCode(row.code)');
  expectIncludes(moduleView, '接口动作');
  expectIncludes(moduleView, 'selectedPermissionOperationMenuTargets');
  expectIncludes(moduleView, 'v-for="target in selectedPermissionOperationMenuTargets"');
  expectIncludes(moduleView, "systemQueryLocation('/system/menus', target.path)");
  expectIncludes(moduleView, 'Number(Boolean(b.parentCode)) - Number(Boolean(a.parentCode))');
  expectIncludes(permissionMatrix, 'permissionOperationImpactMap');
  expectIncludes(sharedPermissionMatrix, '"path": "/sales/quotes"');
  expectIncludes(sharedPermissionMatrix, '"path": "/sales/outbound-requests"');
  expectIncludes(sharedPermissionMatrix, '"path": "/purchase/requisitions"');
  expectIncludes(sharedPermissionMatrix, '"path": "/sales/orders"');
  expectIncludes(sharedPermissionMatrix, '"path": "/warehouse/purchase-receipts"');
  expectIncludes(sharedPermissionMatrix, '"path": "/warehouse/stocktakes"');
  expectIncludes(sharedPermissionMatrix, '"label": "库存盘点处理"');
  expectExcludes(sharedPermissionMatrix, ['/finance/', 'PERM-FINANCE', 'ROLE-FINANCE']);
  expectExcludes(moduleView, ['调拨和盘点处理']);
  expectIncludes(moduleView, 'selectedPermissionDependentOperationRows');
  expectIncludes(moduleView, '业务角色引用');
  expectIncludes(moduleView, '角色和菜单引用用于判断停用前需解除的配置；生效账号按当前有效权限计算。');
  expectIncludes(moduleView, '生效账号');
  expectIncludes(moduleView, 'selectedPermissionEffectiveAccountMessage');
  expectIncludes(moduleView, '暂无启用账号生效拥有该权限');
  expectIncludes(moduleView, '该权限当前停用，暂无账号生效拥有');
  expectIncludes(moduleView, '个启用角色 /');
  expectIncludes('shared/system-menu-defaults.json', '权限点维护和影响范围查看。');
  expectExcludes(moduleView, ['维护系统权限点，用于角色授权和菜单访问控制。', '用于后续角色授权', '暂无启用账号受影响']);
  expectIncludes(moduleView, 'visibleRoleOperationDependencyRows');
  expectIncludes(moduleView, 'selectedHiddenRoleDependencyNames');
  expectIncludes(moduleView, '已选基础权限未在当前筛选显示');
  expectIncludes(moduleView, 'rolePermissionDependencyGuideTitle');
  expectIncludes(moduleView, 'rolePermissionDependencyGuideText');
  expectIncludes(moduleView, '授权联动');
  expectIncludes(moduleView, '当前筛选');
  expectIncludes(moduleView, '全部权限');
  expectIncludes(moduleView, '当前权限清单');
  expectIncludes(moduleView, 'rolePermissionDependencyHint');
  expectIncludes(moduleView, 'roleDirectlyReferencesPermission');
  expectIncludes(moduleView, 'role.code !== adminRoleCode && listCodes(role.permissions).includes(permissionCode)');
  assert(
    /if \(isPermissionsPage\.value\) \{[\s\S]*roleDirectlyReferencesPermission\(role, systemDraft\.code\)/.test(read(moduleView)),
    'permission impact role references should match backend raw role usage checks',
  );
  assert(
    /if \(isPermissionsPage\.value\) \{[\s\S]*accountEffectivePermissionCodes\(account\)\.includes\(systemDraft\.code\)/.test(read(moduleView)),
    'permission impact accounts should still use effective permissions after dependency filtering',
  );
  assert(
    /function permissionLinkedBusinessRoleCount[\s\S]*roleDirectlyReferencesPermission\(role, permissionCode\)/.test(read(moduleView)),
    'permission stop hints should count raw business role references like the API',
  );
  expectIncludes(moduleView, 'class="role-permission-meta dependency"');
  expectIncludes(styles, '.role-permission-guide');
  expectIncludes(styles, '.role-permission-meta.dependency');
  expectIncludes(moduleView, 'selectedPermissionDependencySummary');
  expectIncludes(moduleView, 'selectedPermissionDependentOperationTargets');
  expectIncludes(moduleView, 'selectedRoleOperationImpacts');
  expectIncludes(moduleView, 'selectedRoleOperationPermissionCodes');
  expectIncludes(moduleView, 'selectedRoleOperationPermissionTargets');
  expectIncludes(moduleView, 'selectedRoleOperationRouteRules');
  expectIncludes(moduleView, 'selectedRoleOperationRouteActionCount');
  expectIncludes(moduleView, 'selectedRoleOperationRouteMessage');
  expectIncludes(moduleView, 'selectedRoleOperationImpactMessage');
  expectIncludes(moduleView, 'function roleOperationImpactCount(role: SystemRecord)');
  expectIncludes(moduleView, "if (role.status === '停用') return 0;");
  expectIncludes(moduleView, "if (key === 'operationCount')");
  expectIncludes(moduleView, 'roleOperationImpactCount(row)');
  expectIncludes(moduleView, 'roleOperationSearchText');
  expectIncludes(moduleView, 'operationRouteRuleSearchText(operationRouteRulesForPermissionCodes(permissionCodes))');
  expectIncludes(moduleView, "isRolesPage.value ? roleOperationSearchText(row) : ''");
  expectIncludes(moduleView, 'roleAliasSearchText(row)');
  expectIncludes(moduleView, 'roleOperationSearchText(row)');
  expectIncludes(moduleView, 'roleAccessibleMenuSearchText(row)');
  expectIncludes(moduleView, 'placeholder="搜索角色编码、名称、权限、菜单或操作"');
  expectIncludes(moduleView, 'placeholder="搜索角色编码、名称、权限或操作"');
  expectIncludes(moduleView, '角色已停用，所选权限会保留但不会产生可执行业务操作。');
  expectIncludes(moduleView, 'selectedRoleOperationDependencyMessage');
  expectIncludes(moduleView, '关联操作');
  expectIncludes(moduleView, '被依赖操作');
  expectIncludes(moduleView, '可执行操作');
  expectIncludes(moduleView, "v-for=\"target in selectedRoleOperationPermissionTargets\"");
  expectIncludes(moduleView, '待补基础权限');
  expectIncludes(moduleView, 'addMissingRoleOperationDependencies');
  expectIncludes(moduleView, '补齐基础权限');
  expectIncludes(moduleView, '已补齐基础权限');
  expectIncludes(moduleView, '缺失的基础权限当前未启用');
  expectIncludes(styles, '.system-impact-actions button');
  expectIncludes(sharedPermissionMatrix, '采购入库过账');
  expectExcludes(sharedPermissionMatrix, ['财务收付款', '登记收款', '登记付款']);
  expectIncludes(moduleView, '!isPermissionsPage.value');
  expectIncludes(moduleView, '!isMenusPage.value');
  expectIncludes(moduleView, '!isNamingRulesPage.value');
  expectIncludes(moduleView, '权限点是系统内置能力清单，不能手动新建');
  expectIncludes(moduleView, '菜单入口由当前系统路由生成，不能手动新建');
  expectIncludes(moduleView, '编码规则只支持已接入的业务单据，不能手动新增未知规则');
  expectIncludes(moduleView, '日志由系统自动写入');
  expectIncludes(apiSmoke, 'PER-0004');
  expectIncludes(apiSmoke, "process.env.FILATRIX_DATA_FILE || join(rootDir, 'server/data/erp-data.json')");
  expectIncludes(apiSmoke, 'denied read message should include permission label');
  expectIncludes(apiSmoke, 'denied operation message should include permission label');
  expectIncludes(apiSmoke, 'cannot duplicate system permission name');
  expectIncludes(apiSmoke, 'permission display edits persist');
  expectIncludes(apiSmoke, 'permission description can be cleared');
  expectIncludes(apiSmoke, 'permission display edits are included in session context');
  expectIncludes(apiSmoke, 'role cannot bind unsupported permission');
  assert(
    /req\.method === 'POST'[\s\S]*nonCreatableSystemPages\.has\(page\)[\s\S]*systemCreateBlockedMessages\[page\]/.test(read(server)),
    'server should block manual creation for shared non-creatable system pages',
  );
  expectIncludes(sharedPermissionMatrix, '"notificationModuleOptions"');
  expectIncludes(sharedPermissionMatrix, '"notificationActionOptionsByModule"');
  expectIncludes(sharedPermissionMatrix, '"销售": ["订单确认", "交付追踪同步"]');
  expectIncludes(sharedPermissionMatrix, '"notificationChannelOptions"');
  expectIncludes(permissionMatrix, 'notificationModuleOptions');
  expectIncludes(permissionMatrix, 'notificationActionOptionsByModule');
  expectIncludes(permissionMatrix, 'notificationChannelOptions');
  expectIncludes(server, 'sharedPermissionMatrix.notificationActionOptionsByModule');
  expectIncludes(server, 'sharedPermissionMatrix.notificationChannelOptions');
  expectIncludes(server, 'const actions = notificationActionOptionsByModule[triggerModule] || []');
  expectIncludes(server, 'function notificationRuleMatches');
  expectIncludes(server, "rule.status === '停用'");
  expectIncludes(server, 'validateSupportedNotificationTrigger');
  expectIncludes(server, 'isSupportedNotificationChannel(channel)');
  expectIncludes(server, 'notificationChannelUnsupportedMessage');
  expectExcludes(server, ['const supportedNotificationActionsByModule = {']);
  expectIncludes(server, 'assertEnabledNotificationsHaveRecipients');
  expectIncludes(server, 'notificationTargetAccountsFromRows');
  expectIncludes(server, "Object.prototype.hasOwnProperty.call(row, 'targetAccounts')");
  expectIncludes(server, '以下启用通知规则必须至少匹配一个启用账号');
  expectIncludes(moduleView, 'notificationTargetAccountRows');
  expectIncludes(moduleView, 'notificationTargetAccountRowsAfterAccountChange');
  expectIncludes(moduleView, 'function accountActiveRoleCodes(account: SystemRecord)');
  assert(
    /function notificationTargetAccountRows\(receiverRoles: string \| string\[\] \| undefined\)[\s\S]*accountActiveRoleCodes\(account\)\.some\(\(roleCode\) => roleCodes\.has\(roleCode\)\)/.test(read(moduleView)),
    'notification coverage preview should ignore disabled roles like the API',
  );
  assert(
    /function notificationTargetAccountRowsAfterAccountChange\(receiverRoles: string \| string\[\] \| undefined, changedAccount: SystemRecord\)[\s\S]*accountActiveRoleCodes\(candidate\)\.some\(\(roleCode\) => roleCodes\.has\(roleCode\)\)/.test(read(moduleView)),
    'notification account save guard should ignore disabled roles like the API',
  );
  expectIncludes(moduleView, "key: 'targetAccounts'");
  expectIncludes(moduleView, "label: '覆盖账号'");
  expectIncludes(moduleView, "if (key === 'targetAccounts') return `${notificationTargetAccountRows(row.receiverRoles).length} 个`");
  expectIncludes(moduleView, 'notificationTargetAccountSearchText');
  expectIncludes(moduleView, 'accountNotificationSearchText');
  expectIncludes(moduleView, "isNotificationsPage.value ? notificationTargetAccountSearchText(row) : ''");
  expectIncludes(moduleView, "isAccountsPage.value ? accountNotificationSearchText(row) : ''");
  expectIncludes(moduleView, 'selectedNotificationAccounts');
  expectIncludes(moduleView, 'roleLinkTargets');
  expectIncludes(moduleView, 'selectedNotificationReceiverTargets');
  expectIncludes(moduleView, 'notificationResolvedReceiverRoleCodes.value');
  expectIncludes(moduleView, "systemQueryLocation('/system/roles', target.code)");
  expectIncludes(moduleView, 'selectedAccountNotificationRows');
  expectIncludes(moduleView, 'accountNotificationRecipientBlockRows');
  expectIncludes(moduleView, 'accountNotificationRecipientBlockReason');
  expectIncludes(moduleView, '该账号仍是以下启用通知规则的最后接收人');
  expectIncludes(moduleView, 'notificationNoTargetAccountMessage');
  expectIncludes(moduleView, '当前没有匹配启用账号');
  expectIncludes(server, 'notificationNoTargetAccountMessage');
  expectIncludes(server, 'checkAppHealth');
  expectIncludes(server, 'resolveAppHealthUrl');
  expectIncludes(server, 'check-health');
  expectIncludes(server, 'sharedPermissionMatrix.systemOptionSets');
  expectIncludes(server, 'const deployTargetOptions = Array.isArray(systemOptionSets.deployTargets)');
  expectIncludes(server, 'if (!deployTargetOptions.includes(deployTarget))');
  expectIncludes(server, 'if (!mcpToolTypeOptions.includes(toolType))');
  expectIncludes(server, 'if (!riskLevelOptions.includes(riskLevel))');
  expectExcludes(server, [
    "const supportedAppTypes = ['业务前端'",
    "const supportedDeployTargets = ['本地开发'",
    "const supportedToolTypes = ['浏览器'",
    "const supportedRiskLevels = ['低'",
  ]);
  expectIncludes(server, '启用应用必须填写健康检查路径');
  expectIncludes(server, '停用应用不能执行健康检查');
  expectIncludes(server, '应用配置不完整，不能执行健康检查');
  expectIncludes(server, "parts[4] === 'verify'");
  expectIncludes(server, 'MCP 工具验证');
  expectIncludes(server, '停用工具不能记录验证');
  expectIncludes(server, '工具配置不完整，不能记录验证');
  expectIncludes(server, '健康检查只允许访问本机或当前系统域名');
  expectIncludes(server, 'isPlaceholderSystemConfigValue');
  expectIncludes(server, '启用应用不能使用占位配置');
  expectIncludes(server, '启用应用地址配置不正确');
  expectIncludes(server, "healthStatus: existing?.healthStatus || '未检查'");
  expectIncludes(server, "lastVerifiedAt: existing?.lastVerifiedAt || ''");
  expectIncludes(server, '该权限仍被');
  expectIncludes(server, '该角色仍被引用');
  expectIncludes(server, 'code === adminRoleCode');
  expectIncludes(moduleView, 'systemStopBlockReason');
  expectIncludes(moduleView, 'accountEffectivePermissionCodes');
  expectIncludes(moduleView, 'accountEffectivePermissionSummaries');
  expectIncludes(moduleView, 'const selectedAccountEffectivePermissionTargets = computed');
  expectIncludes(moduleView, 'permissionLinkTargets(selectedAccountEffectivePermissions.value.map((permission) => permission.code))');
  expectIncludes(moduleView, 'selectedAccountEffectivePermissionMessage');
  expectIncludes(moduleView, '账号已停用，角色配置会保留但不会产生生效权限。');
  expectIncludes(moduleView, 'selectedAccountRoleGuideTitle');
  expectIncludes(moduleView, 'selectedAccountRoleGuideText');
  expectIncludes(moduleView, '账号已停用，角色配置会保留但不会参与登录、菜单和业务操作权限。');
  assert(
    /function accountEffectivePermissionCodesForRoles\(account: SystemRecord, roleRows: SystemRecord\[\]\) \{[\s\S]*if \(account\.status === '停用'\) return \[\];/.test(read(moduleView)),
    'disabled accounts should not report effective permissions or executable operation summaries',
  );
  expectIncludes(moduleView, '账号预览');
  expectIncludes(moduleView, 'accountAccessibleMenuRows');
  expectIncludes(moduleView, "if (key === 'menuAccessCount') return `${accountAccessibleMenuRows(row).length} 个`");
  expectIncludes(moduleView, 'roleAccessibleMenuRows');
  expectIncludes(moduleView, 'function menuAccessibleRoleRows(menu: SystemRecord)');
  expectIncludes(moduleView, 'function menuAccessibleAccountRows(menu: SystemRecord)');
  assert(
    /const selectedLinkedRoles = computed[\s\S]*if \(isMenusPage\.value\) \{[\s\S]*return menuAccessibleRoleRows\(systemDraft\);/.test(read(moduleView)),
    'menu impact role preview should reuse the shared menu accessibility calculation',
  );
  assert(
    /const selectedLinkedAccounts = computed[\s\S]*if \(isMenusPage\.value\) \{[\s\S]*return menuAccessibleAccountRows\(systemDraft\);/.test(read(moduleView)),
    'menu impact account preview should reuse effective account navigation access calculation',
  );
  expectIncludes(moduleView, "if (key === 'accessScope') return `${menuAccessibleRoleRows(row).length} 个角色 / ${menuAccessibleAccountRows(row).length} 个账号`");
  expectIncludes(moduleView, 'function menuAccessSearchText(menu: SystemRecord)');
  expectIncludes(moduleView, 'function menuOperationSearchText(menu: SystemRecord)');
  expectIncludes(moduleView, 'function roleAccessibleMenuSearchText(role: SystemRecord)');
  expectIncludes(moduleView, 'function accountAccessibleMenuSearchText(account: SystemRecord)');
  expectIncludes(moduleView, "isRolesPage.value ? roleAccessibleMenuSearchText(row) : ''");
  expectIncludes(moduleView, "isAccountsPage.value ? accountAccessibleMenuSearchText(row) : ''");
  expectIncludes(moduleView, 'selectedMenuRequiredPermissionTargets');
  expectIncludes(moduleView, 'selectedAccountAccessibleMenus');
  expectIncludes(moduleView, 'menuRequiredPermissionCodesForRow');
  expectIncludes(moduleView, '搜索菜单编码、名称、路径、权限点、操作、角色或账号');
  expectIncludes(moduleView, 'row.path');
  expectIncludes(moduleView, "isMenusPage.value ? menuAccessSearchText(row) : ''");
  expectIncludes(moduleView, "isMenusPage.value ? menuOperationSearchText(row) : ''");
  expectIncludes(moduleView, 'return roleAccessibleMenuRows(systemDraft);');
  expectIncludes(moduleView, 'return roleAccessibleMenuRows(row).length;');
  expectIncludes(moduleView, 'disabledMenuInPath(relatedMenuRows.value');
  expectIncludes(moduleView, 'menuDisabledAncestor(menu)');
  expectIncludes(moduleView, 'function activeChildMenuRows(row: SystemRecord)');
  expectIncludes(moduleView, 'function activeChildMenuSummary(row: SystemRecord)');
  expectIncludes(moduleView, 'selectedMenuActiveChildRows');
  expectIncludes(moduleView, '启用下级菜单');
  expectIncludes(moduleView, "systemQueryLocation('/system/menus', childMenu.code)");
  expectIncludes(moduleView, '可访问菜单');
  expectIncludes(moduleView, "systemQueryLocation('/system/menus', systemDraft.code)");
  expectIncludes(moduleView, "systemQueryLocation('/system/roles', systemDraft.code)");
  expectIncludes(moduleView, "systemQueryLocation('/system/accounts', systemDraft.code)");
  expectIncludes(moduleView, 'accountProvidesSystemConfig');
  expectIncludes(moduleView, 'function operationPermissionCodesFromEffectivePermissions(permissionCodes: string[])');
  expectIncludes(moduleView, 'function operationImpactsForPermissionCodes(permissionCodes: string[])');
  expectIncludes(moduleView, 'const selectedAccountOperationPermissionCodes = computed');
  expectIncludes(moduleView, 'const selectedAccountOperationPermissionTargets = computed');
  expectIncludes(moduleView, 'const selectedAccountOperationRouteRules = computed');
  expectIncludes(moduleView, 'const selectedAccountOperationRouteActionCount = computed');
  expectIncludes(moduleView, 'const selectedAccountOperationRouteMessage = computed');
  expectIncludes(moduleView, 'const selectedAccountRoleTargets = computed');
  expectIncludes(moduleView, 'roleLinkTargets(accountRoleCodes.value)');
  expectIncludes(moduleView, 'const selectedAccountOperationImpacts = computed');
  expectIncludes(moduleView, 'function accountOperationSearchText(account: SystemRecord)');
  expectIncludes(moduleView, 'function accountOperationImpactCount(account: SystemRecord)');
  expectIncludes(moduleView, "if (account.status === '停用') return 0;");
  expectIncludes(moduleView, 'accountOperationImpactCount(row)');
  expectIncludes(moduleView, "isAccountsPage.value ? accountOperationSearchText(row) : ''");
  expectIncludes(moduleView, 'selectedAccountOperationImpactMessage');
  expectIncludes(moduleView, '账号已停用，角色配置会保留但不会产生可执行业务操作。');
  expectIncludes(moduleView, "v-for=\"target in selectedAccountOperationPermissionTargets\"");
  expectIncludes(moduleView, "v-for=\"target in selectedAccountEffectivePermissionTargets\"");
  expectIncludes(moduleView, "v-for=\"target in selectedAccountRoleTargets\"");
  expectIncludes(moduleView, "systemQueryLocation('/system/roles', target.code)");
  expectIncludes(server, 'canonicalSystemCode');
  expectIncludes(sharedPermissionMatrix, '"systemCodePrefixes"');
  expectIncludes(sharedPermissionMatrix, '"accounts": "ACC"');
  expectIncludes(permissionMatrix, 'systemCodePrefixes');
  expectIncludes(server, 'const systemCodePrefixes = sharedPermissionMatrix.systemCodePrefixes || {}');
  expectIncludes(server, 'nextSystemRecordCode(page, rows)');
  expectIncludes(server, 'validateSystemCodeFormat');
  expectIncludes(server, 'validateUniqueSystemCode');
  expectIncludes(moduleView, 'canonicalSystemCode');
  expectIncludes(moduleView, 'systemCodePrefixes');
  expectIncludes(moduleView, 'nextSystemRecordCode(systemPageKey.value, systemRows.value)');
  expectExcludes(server, [`const systemCodePrefixes = {\n  accounts: 'ACC'`]);
  expectExcludes(moduleView, [`const systemCodePrefixes: Record<string, string> = {\n  accounts: 'ACC'`]);
  expectIncludes(moduleView, 'systemCodeFormatMessage');
  expectIncludes(moduleView, 'duplicateSystemCodeRecord');
  expectIncludes(moduleView, 'systemCodeConflictMessage');
  expectIncludes(moduleView, 'normalizedSystemName');
  expectIncludes(moduleView, 'roleRecordByCodeOrName');
  expectIncludes(moduleView, 'roleDefaults');
  expectIncludes(moduleView, 'roleDefaultAliasPairs');
  expectIncludes(moduleView, 'defaultRoleCodeFromAlias');
  expectIncludes(moduleView, 'roleIdentitySearchValues');
  expectIncludes(moduleView, 'roleAliasSearchText(row)');
  expectIncludes(moduleView, 'const accountResolvedRoleCodes = computed');
  expectIncludes(moduleView, 'accountRoleCodes.value.map(roleCodeFromCodeOrName)');
  expectIncludes(moduleView, 'accountRoles.has(role.code)');
  expectIncludes(moduleView, 'function accountRoleCodesForRow(row: SystemRecord)');
  expectIncludes(moduleView, 'return listCodes(row.roles).map(roleCodeFromCodeOrName)');
  expectIncludes(moduleView, 'coreSystemRecordCodes');
  expectIncludes(moduleView, 'const adminRoleCode = coreSystemRecordCodes.adminRole');
  expectIncludes(moduleView, 'const defaultAdminAccountCode = coreSystemRecordCodes.defaultAdminAccount');
  expectIncludes(moduleView, 'const systemPermissionCode = coreSystemRecordCodes.systemPermission');
  expectIncludes(server, 'const coreSystemRecordCodes = sharedPermissionMatrix.coreSystemRecordCodes || {}');
  expectIncludes(server, 'const adminRoleCode = coreSystemRecordCodes.adminRole');
  expectIncludes(server, 'const defaultAdminAccountCode = coreSystemRecordCodes.defaultAdminAccount');
  expectIncludes(server, 'const systemPermissionCode = coreSystemRecordCodes.systemPermission');
  expectIncludes(moduleView, 'systemDraft.code === defaultAdminAccountCode && !accountResolvedRoleCodes.value.includes(adminRoleCode)');
  expectIncludes(moduleView, 'duplicateRoleName');
  expectIncludes(moduleView, 'roleIdentityConflictMessage');
  assert(
    /function validateUniqueSystemName[\s\S]*normalizedLoginName\(row\.name\)[\s\S]*normalizedLoginName\(name\)/.test(read(server)),
    'system role and permission names should be compared case-insensitively',
  );
  assert(
    /function resolveRoleCodes[\s\S]*normalizedLoginName\(role\.code\)[\s\S]*normalizedLoginName\(role\.name\)/.test(read(server)),
    'role code/name resolution should be case-insensitive after names became case-insensitive unique',
  );
  expectIncludes(moduleView, '角色名称已被');
  expectIncludes(moduleView, '启用账号必须至少拥有一个有效权限');
  expectIncludes(moduleView, '当前账号没有带出生效权限');
  expectIncludes(moduleView, 'accountsWithoutEffectivePermissionsForRoles');
  expectIncludes(moduleView, 'roleAccountEffectivePermissionSaveBlockReason');
  expectIncludes(moduleView, '以下启用账号必须至少拥有一个有效权限');
  expectIncludes(moduleView, 'row.code === systemPermissionCode');
  expectIncludes(moduleView, 'accountEffectivePermissionCodes(account).includes(systemPermissionCode)');
  expectIncludes(moduleView, 'accountEffectivePermissionCodesForRoles(account, roleRows).includes(systemPermissionCode)');
  expectIncludes(moduleView, 'listCodes(role.permissions).includes(systemPermissionCode)');
  expectIncludes(moduleView, 'selectedAccountEffectivePermissions.value.some((permission) => permission.code === systemPermissionCode)');
  expectIncludes(moduleView, 'session.hasPermission(moduleReadPermissionCodes.system)');
  expectIncludes(moduleView, 'accountProvidesSystemConfig(row)');
  expectIncludes(moduleView, '该账号仍是以下启用通知规则的最后接收人');
  expectIncludes(moduleView, '接收通知');
  expectIncludes(moduleView, '不能停用当前账号，否则会无法继续管理系统');
  expectIncludes(moduleView, '不能停用当前账号正在依赖的系统管理角色，否则会无法继续管理系统');
  expectIncludes(moduleView, 'roleChangeRemovesCurrentSessionSystemConfig');
  expectIncludes(moduleView, 'systemStartBlockReason');
  expectIncludes(moduleView, 'systemStatusToggleBlockReason');
  expectIncludes(moduleView, 'accountStartBlockReason');
  expectIncludes(moduleView, 'roleStartBlockReason');
  expectIncludes(moduleView, 'menuStartBlockReason');
  expectIncludes(moduleView, 'notificationStartBlockReason');
  expectIncludes(moduleView, 'appStartBlockReason');
  expectIncludes(moduleView, 'mcpToolStartBlockReason');
  expectIncludes(moduleView, 'if (isAccountsPage.value) return accountStartBlockReason(row)');
  expectIncludes(moduleView, 'if (isRolesPage.value) return roleStartBlockReason(row)');
  expectIncludes(moduleView, 'if (isMenusPage.value) return menuStartBlockReason(row)');
  expectIncludes(moduleView, '启用账号必须至少选择一个角色');
  expectIncludes(moduleView, '启用角色必须至少选择一个权限点');
  expectIncludes(moduleView, 'function summarizeRecordNames(rows: SystemRecord[], limit = 4)');
  expectIncludes(moduleView, 'function permissionStopReferenceSummary(permissionCode: string)');
  expectIncludes(moduleView, '该权限仍被引用：${permissionStopReferenceSummary(row.code)}');
  expectIncludes(moduleView, '该路由必须绑定');
  expectIncludes(moduleView, 'if (systemDraft.permissionCode && isOperationPermissionCode(systemDraft.permissionCode)) return');
  expectIncludes(moduleView, 'if (row.permissionCode && isOperationPermissionCode(row.permissionCode))');
  expectIncludes(moduleView, 'menuSortOrderMessageForRow');
  expectIncludes(moduleView, 'notificationActionOptionsForModule');
  expectIncludes(moduleView, 'appRequiredMissingFieldsForRow');
  expectIncludes(moduleView, 'appOptionDisabledReasonForRow');
  expectIncludes(moduleView, 'mcpToolOptionDisabledReasonForRow');
  expectIncludes(moduleView, '应用类型只能选择当前系统支持的类型');
  expectIncludes(moduleView, '部署目标只能选择当前系统支持的目标');
  expectIncludes(moduleView, '工具类型只能选择当前系统支持的类型');
  expectIncludes(moduleView, '风险级别只能选择低、中或高');
  expectIncludes(moduleView, "return row.status === '启用' ? systemStopBlockReason(row) : systemStartBlockReason(row)");
  expectIncludes(moduleView, 'const blockReason = systemStatusToggleBlockReason(row)');
  expectIncludes(moduleView, 'systemDraftStatusDisabledReason');
  expectIncludes(moduleView, 'systemSaveDisabledReason');
  assert(
    /const systemSaveDisabledReason[\s\S]*systemCodeFormatMessage\.value[\s\S]*return systemCodeFormatMessage\.value/.test(read(moduleView)),
    'invalid system codes should disable the shared save button before submit',
  );
  assert(
    /async function saveSystemDraft[\s\S]*isCreating\.value && systemDraft\.code[\s\S]*systemDraft\.code = canonicalSystemCode\(systemDraft\.code\)/.test(read(moduleView)),
    'new system codes should be normalized before submit',
  );
  assert(
    /const systemSaveDisabledReason[\s\S]*systemCodeConflictMessage\.value[\s\S]*return systemCodeConflictMessage\.value/.test(read(moduleView)),
    'duplicate system codes should disable the shared save button before submit',
  );
  assert(
    /const systemSaveDisabledReason[\s\S]*roleIdentityConflictMessage\.value[\s\S]*return roleIdentityConflictMessage\.value/.test(read(moduleView)),
    'duplicate role names should disable the shared save button before submit',
  );
  expectIncludes(moduleView, 'notificationSaveDisabledReason');
  expectIncludes(moduleView, 'appSaveDisabledReason');
  expectIncludes(moduleView, 'mcpToolSaveDisabledReason');
  expectIncludes(moduleView, 'namingRuleSaveDisabledReason');
  expectIncludes(moduleView, 'if (namingRuleSaveDisabledReason.value) return namingRuleSaveDisabledReason.value');
  expectIncludes(moduleView, 'if (menuPermissionMismatchMessage.value) return menuPermissionMismatchMessage.value');
  expectIncludes(moduleView, 'if (menuPermissionInvalidMessage.value) return menuPermissionInvalidMessage.value');
  assert(
    /const systemSaveDisabledReason[\s\S]*enabledRoleRequiresPermission\.value[\s\S]*selectedRoleOperationDependencyMessage\.value/.test(read(moduleView)),
    'role permission validation should disable the shared save button before submit',
  );
  assert(
    /const systemSaveDisabledReason[\s\S]*menuSortOrderMessage\.value[\s\S]*menuSortConflictMessage\.value[\s\S]*menuPermissionMismatchMessage\.value[\s\S]*menuPermissionInvalidMessage\.value/.test(read(moduleView)),
    'menu permission validation should disable the shared save button before submit',
  );
  assert(
    /if \(isMenusPage\.value\) \{[\s\S]*if \(menuSortOrderMessage\.value\)[\s\S]*systemDraft\.sortOrder = normalizeMenuSortOrder\(systemDraft\.sortOrder\)/.test(read(moduleView)),
    'menu save should reject invalid sort order before normalizing the value',
  );
  expectIncludes(moduleView, ':title="systemDraftStatusDisabledReason"');
  expectIncludes(moduleView, ':disabled="Boolean(systemSaveDisabledReason)"');
  expectIncludes(moduleView, ':title="systemSaveDisabledReason ||');
  expectIncludes(moduleView, 'visibleSystemSaveDisabledReason');
  expectIncludes(moduleView, 'saveMessage.value === systemSaveDisabledReason.value');
  assert(
    !/const visibleSystemSaveDisabledReason[\s\S]*!saveMessage\.value/.test(read(moduleView)),
    'save block reason should remain visible after a stale success message when a new validation error appears',
  );
  expectIncludes(moduleView, 'class="system-save-block-reason"');
  expectIncludes(styles, '.system-save-block-reason');
  expectIncludes(moduleView, 'if (notificationSaveDisabledReason.value) return notificationSaveDisabledReason.value');
  expectIncludes(moduleView, 'if (appSaveDisabledReason.value) return appSaveDisabledReason.value');
  expectIncludes(moduleView, 'if (mcpToolSaveDisabledReason.value) return mcpToolSaveDisabledReason.value');
  expectIncludes(moduleView, 'selfSystemConfigLockMessage');
  expectIncludes(moduleView, 'systemEmptyStateTitle');
  expectIncludes(moduleView, 'systemEmptyStateDescription');
  expectIncludes(moduleView, 'selectedSystemRecordVisible');
  expectIncludes(moduleView, 'showSystemEditor');
  expectIncludes(moduleView, 'systemEmptyEditorTitle');
  expectIncludes(moduleView, 'systemEmptyEditorDescription');
  expectIncludes(moduleView, '<aside v-if="showSystemEditor"');
  expectIncludes(moduleView, 'system-config-empty-editor');
  expectIncludes(moduleView, '} else if (canCreateSystemRecord.value) {');
  expectIncludes(moduleView, '当前页面由系统内置数据驱动');
  expectIncludes(moduleView, 'invalidAccountRoleMessage');
  expectIncludes(moduleView, 'invalidAccountRoleCodes');
  expectIncludes(moduleView, 'invalidRolePermissionCodes');
  expectIncludes(moduleView, 'invalidRolePermissionMessage');
  expectIncludes(moduleView, 'invalidNotificationReceiverRoleCodes');
  expectIncludes(moduleView, 'invalidNotificationReceiverRoleMessage');
  expectIncludes(moduleView, 'clearInvalidRolePermissions');
  expectIncludes(moduleView, 'clearInvalidAccountRoles');
  expectIncludes(moduleView, 'clearInvalidNotificationReceiverRoles');
  expectIncludes(moduleView, 'notificationReceiverRawRoleCodesForRow');
  expectIncludes(moduleView, 'if (notificationRuleEnabled && invalidNotificationReceiverRoleMessage.value)');
  expectIncludes(moduleView, 'if (invalidNotificationReceiverRoleMessage.value) return invalidNotificationReceiverRoleMessage.value');
  expectIncludes(moduleView, '清理无效权限');
  expectIncludes(moduleView, '清理无效角色');
  expectIncludes(moduleView, '清理无效接收角色');
  expectIncludes(moduleView, '通知规则只能选择启用中的接收角色');
  expectIncludes(moduleView, 'notificationModuleOptions');
  expectIncludes(moduleView, 'notificationActionOptionsByModule');
  expectIncludes(moduleView, 'notificationChannelOptions');
  expectIncludes(moduleView, 'notificationActionOptions');
  expectIncludes(moduleView, 'isSupportedNotificationChannel');
  expectIncludes(moduleView, 'notificationChannelUnsupportedMessage');
  expectExcludes(moduleView, [
    "const notificationModuleOptions = ['销售'",
    'const notificationActionOptionsByModule: Record<string, string[]> = {',
    "const notificationChannelOptions = ['站内'];",
  ]);
  assert(
    /catch \(error\) \{[\s\S]*notificationItems\.value = \[\];[\s\S]*unreadCount\.value = 0;[\s\S]*notificationError\.value/.test(read(topbar)),
    'notification inbox should clear stale rows and unread count when loading fails',
  );
  expectIncludes(moduleView, 'checkSelectedAppHealth');
  expectIncludes(moduleView, 'checkAppHealthForRow');
  expectIncludes(moduleView, 'appHealthCheckDisabledReasonForRow');
  expectIncludes(moduleView, 'const optionReason = appOptionDisabledReasonForRow(row)');
  expectIncludes(moduleView, 'if (missing.length) return `启用应用缺少：${missing.join');
  expectIncludes(moduleView, 'appUrlFormatMessageForRow');
  expectIncludes(moduleView, 'appConfigFormatIssueText');
  expectIncludes(moduleView, 'appUrlFormatMessage');
  expectIncludes(moduleView, 'const formatIssue = appUrlFormatMessageForRow(row)');
  expectIncludes(moduleView, "return appConfigFormatIssueText(systemDraft) || '配置完整'");
  expectIncludes(moduleView, "return appConfigFormatIssueText(row) || '配置完整'");
  expectIncludes(moduleView, ':disabled="isSystemReadonly || isCheckingAppHealth || Boolean(appHealthCheckDisabledReasonForRow(row))"');
  expectIncludes(moduleView, ":title=\"isSystemReadonly ? systemReadonlyMessage : (appHealthCheckDisabledReasonForRow(row) || '执行健康检查')\"");
  expectIncludes(moduleView, '@click.stop="checkAppHealthForRow(row)"');
  expectIncludes(moduleView, "systemQueryLocation('/system/logs', systemDraft.code)");
  expectIncludes(moduleView, 'recordSelectedMcpToolVerification');
  expectIncludes(moduleView, 'recordMcpToolVerificationForRow');
  expectIncludes(moduleView, 'recordSystemMcpToolVerification');
  expectIncludes(api, 'lastVerificationRemark?: string');
  expectIncludes(api, "recordSystemMcpToolVerification(code: string, verificationRemark = '')");
  expectIncludes(api, 'body: { verificationRemark }');
  expectIncludes(moduleView, 'mcpVerificationRemark');
  expectIncludes(moduleView, 'mcpVerificationRemarkRequiredForRow');
  expectIncludes(moduleView, 'mcpVerificationRemarkMissingReason');
  expectIncludes(moduleView, '高风险工具记录验证时必须填写本次验证备注');
  expectIncludes(moduleView, '最近备注：{{ systemDraft.lastVerificationRemark }}');
  expectIncludes(moduleView, 'recordSystemMcpToolVerification(systemDraft.code, mcpVerificationRemark.value)');
  expectIncludes(moduleView, 'mcpToolRequiredMissingFieldsForRow');
  expectIncludes(moduleView, 'const optionReason = mcpToolOptionDisabledReasonForRow(row)');
  expectIncludes(moduleView, 'mcpVerificationDisabledReason');
  expectIncludes(moduleView, 'mcpVerificationDisabledReasonForRow');
  expectIncludes(moduleView, 'mcpVerificationNeedsDetailRemark');
  expectIncludes(moduleView, 'mcpVerificationActionTitleForRow');
  expectIncludes(moduleView, '高风险工具请先选中工具，在右侧填写本次验证备注后记录验证');
  expectIncludes(moduleView, '工具配置不完整，不能记录验证');
  expectIncludes(moduleView, ':disabled="isSystemReadonly || isRecordingMcpVerification || Boolean(mcpVerificationDisabledReasonForRow(row))"');
  expectIncludes(moduleView, ':title="mcpVerificationActionTitleForRow(row)"');
  expectIncludes(moduleView, '@click.stop="recordMcpToolVerificationForRow(row)"');
  expectIncludes(moduleView, '记录\n                  </button>');
  expectIncludes(moduleView, 'canRecordSelectedMcpVerification');
  expectIncludes(moduleView, ':disabled="isRecordingMcpVerification || !canRecordSelectedMcpVerification"');
  expectIncludes(moduleView, 'class="readonly-field-value"');
  expectIncludes(moduleView, "{{ systemDraft.lastVerifiedAt || '尚未验证' }}");
  expectIncludes(moduleView, 'isRecordingMcpVerification');
  expectIncludes(moduleView, 'isCheckingAppHealth');
  expectIncludes(styles, '.system-config-page-notifications .system-config-grid');
  expectIncludes(styles, '.system-config-page-apps .system-config-grid');
  expectIncludes(styles, '.system-config-page-mcp-tools .system-config-grid');
  expectIncludes(styles, '.system-config-page-notifications .reference-table-scroll');
  expectIncludes(styles, '.system-config-page-apps .reference-table-scroll');
  expectIncludes(styles, '.system-config-page-mcp-tools .reference-table-scroll');
  expectIncludes(moduleView, 'selectedStoredSystemRecord');
  expectIncludes(moduleView, 'systemDraftDiffers');
  expectIncludes(moduleView, 'appHealthRequiresSavedConfig');
  expectIncludes(moduleView, 'appHealthPreflightReason');
  expectIncludes(moduleView, 'appDeploySteps');
  expectIncludes(moduleView, 'resolveAppHealthTargetForRow');
  expectIncludes(moduleView, 'appDeployHealthCommand');
  expectIncludes(moduleView, 'appDeployHealthCommand.value');
  expectIncludes(moduleView, 'https://你的域名${fallbackHealthPath}');
  expectIncludes(moduleView, '<code v-for="step in appDeploySteps"');
  expectIncludes(moduleView, "return ['npm run api', 'npm run dev:5174']");
  expectIncludes(moduleView, 'cp .env.example .env');
  expectIncludes(moduleView, '`curl ${resolveAppHealthTargetForRow(systemDraft)} && npm run smoke:frontend`');
  expectIncludes(moduleView, "return ['npm run build', '上传 dist/ 到 OSS/CDN");
  expectIncludes(styles, '.system-command-list code');
  expectIncludes(moduleView, 'parseAppHttpUrl');
  expectIncludes(moduleView, 'isAllowedAppHealthUrl');
  expectIncludes(moduleView, '外部部署请从部署域名打开系统后再检查');
  expectIncludes(moduleView, 'v-if="isAppsPage && appHealthCheckDisabledReason"');
  expectIncludes(moduleView, 'mcpVerificationRequiresSavedConfig');
  expectIncludes(moduleView, '请先保存应用配置，再执行健康检查');
  expectIncludes(moduleView, '请先保存工具配置，再记录验证');
  expectIncludes(moduleView, 'appRequiredMissingFields');
  expectIncludes(moduleView, 'includeStopped: true');
  expectIncludes(moduleView, '启用前缺少');
  expectIncludes(moduleView, 'isPlaceholderAppConfigValue');
  expectIncludes(moduleView, '真实访问入口');
  expectIncludes(moduleView, 'Object.assign(systemDraft, blankSystemRecord(), { ...row, passwordInput: \'\', passwordConfirm: \'\' })');
  expectIncludes(moduleView, 'Object.assign(systemDraft, blankSystemRecord(), record)');
  expectIncludes(moduleView, 'appHealthCheckDisabledReason');
  expectIncludes(moduleView, 'canCheckSelectedAppHealth');
  expectIncludes(moduleView, 'appHealthSummary');
  expectIncludes(apiSmoke, 'high risk mcp tool requires verification remark');
  expectIncludes(apiSmoke, 'high risk mcp tool records verification remark');
  expectIncludes(apiSmoke, 'manual mcp tool save cannot forge verification remark');
  expectIncludes(apiSmoke, 'mcp verification remark audit log');
  expectIncludes(moduleView, 'const notificationRuleEnabled');
  expectIncludes(moduleView, 'notificationRuleEnabled && !systemDraft.triggerAction');
  expectIncludes(moduleView, 'notificationRuleEnabled && !systemDraft.receiverRoles');
  expectIncludes(moduleView, "systemDraft.status === '停用') return '停用中不要求验证配置'");
  expectIncludes(moduleView, 'mcpToolRequiredMissingFieldsForRow(systemDraft)');
  expectIncludes(moduleView, '`启用工具缺少：${missing.join');
  expectIncludes(moduleView, "permission.status !== '停用'");
  expectIncludes(moduleView, 'isAdminRoleDraft');
  expectIncludes(moduleView, 'effectiveRolePermissionCodes');
  expectIncludes(moduleView, 'effectivePermissionCodesForRole');
  expectIncludes(moduleView, 'activePermissionCodeSet');
  expectIncludes(moduleView, 'effectivePermissionCodesForRole(role).forEach');
  expectIncludes(moduleView, 'rolePermissionVisibleSelected');
  expectIncludes(moduleView, "role.code === adminRoleCode) return '全部启用权限'");
  expectIncludes(moduleView, "role.code === adminRoleCode && role.status !== '停用'");
  expectIncludes(moduleView, "if (key === 'permissionCount') return `${effectivePermissionCodesForRole(row).length} 个`");
  expectIncludes(moduleView, 'activeChildMenuCount');
  expectIncludes(moduleView, '该菜单下仍有启用下级菜单：${activeChildMenuSummary(row)}');
  expectIncludes(moduleView, 'duplicateMenuSortOrder');
  expectIncludes(moduleView, 'menuSortConflictMessage');
  expectIncludes(moduleView, 'const menuSortOrderMessage = computed');
  expectIncludes(moduleView, 'v-if="menuSortOrderMessage"');
  expectIncludes(moduleView, '同级菜单排序号已被');
  expectIncludes(server, 'activeChildMenusForMenu');
  expectIncludes(server, 'activeChildMenuSummaryForMenu');
  expectIncludes(server, '该菜单下仍有启用下级菜单：${activeChildMenuSummaryForMenu(activeChildMenus)}');
  expectIncludes(server, 'validateUniqueMenuSortOrder');
  expectIncludes(server, 'normalizeSystemMenuSortOrder');
  expectIncludes(server, '菜单排序号必须是大于 0 的整数');
  expectIncludes(server, '同级菜单排序号');
  expectIncludes(moduleView, '管理员角色默认拥有全部启用权限');
  expectIncludes(apiSmoke, 'cannot stop role assigned to active accounts');
  expectIncludes(apiSmoke, 'cannot stop role used by enabled notification');
  expectIncludes(apiSmoke, 'menu cannot bind operation permission');
  expectIncludes(apiSmoke, 'cannot create duplicate system role code');
  expectIncludes(apiSmoke, 'cannot create case-insensitive duplicate system role code');
  expectIncludes(apiSmoke, 'system role auto code uses role prefix');
  expectIncludes(apiSmoke, 'system role code is normalized to uppercase');
  expectIncludes(apiSmoke, 'system role code rejects spaces');
  expectIncludes(apiSmoke, 'cannot create duplicate system role name');
  expectIncludes(apiSmoke, 'cannot create case-insensitive duplicate system role name');
  expectIncludes(apiSmoke, 'account role name resolves case-insensitively');
  expectIncludes(apiSmoke, 'account role aliases resolve to default role codes');
  expectIncludes(apiSmoke, 'enabled role requires at least one permission');
  expectIncludes(apiSmoke, 'enabled role cannot clear display name');
  expectIncludes(apiSmoke, 'system permissions cannot be created manually');
  expectIncludes(apiSmoke, 'system menus cannot be created manually');
  expectIncludes(apiSmoke, 'cannot stop permission still used by roles or menus');
  expectIncludes(apiSmoke, 'current system manager cannot remove own system permission');
  expectIncludes(apiSmoke, 'current system manager cannot remove own system permission through role');
  expectIncludes(apiSmoke, 'default admin account cannot be disabled');
  expectIncludes(apiSmoke, 'default admin account must keep admin role');
  expectIncludes(apiSmoke, 'enabled menu cannot bind disabled permission');
  expectIncludes(apiSmoke, 'enabled menu cannot bind permission from another module');
  expectIncludes(apiSmoke, 'cannot duplicate sibling menu sort order');
  expectIncludes(apiSmoke, 'cannot save invalid menu sort order');
  expectIncludes(apiSmoke, 'cannot stop parent menu with active child menus');
  expectIncludes(apiSmoke, 'enabled child menu requires active parent');
  expectIncludes(apiSmoke, 'protected system menu cannot be disabled');
  expectIncludes(apiSmoke, 'protected system menu must keep system permission');
  expectIncludes(apiSmoke, 'enabled app cannot use unsupported deployment target');
  expectIncludes(apiSmoke, 'enabled app requires health path');
  expectIncludes(apiSmoke, 'enabled app requires data store');
  expectIncludes(apiSmoke, 'enabled app rejects placeholder public url');
  expectIncludes(apiSmoke, 'enabled app rejects invalid public url');
  expectIncludes(apiSmoke, 'enabled app rejects invalid api base');
  expectIncludes(apiSmoke, 'enabled app rejects invalid health path');
  expectIncludes(apiSmoke, 'disabled app cannot check health');
  expectIncludes(apiSmoke, 'incomplete app cannot check health');
  expectIncludes(apiSmoke, 'disabled system apps menu blocks health check action');
  expectIncludes(apiSmoke, 'menu structural fields stay wired to built-in route');
  expectIncludes(apiSmoke, 'role cannot bind disabled permission');
  expectIncludes(apiSmoke, 'role operation permission requires base permission');
  expectIncludes(apiSmoke, 'cannot stop permission required by active operation permission');
  expectIncludes(apiSmoke, 'historical operation-only role does not grant operation permission');
  expectIncludes(apiSmoke, 'historical operation-only role still blocks permission stop');
  expectIncludes(apiSmoke, 'historical disabled role is excluded from session context');
  expectIncludes(apiSmoke, 'disabled historical role does not receive role notifications');
  expectIncludes(apiSmoke, 'enabled account cannot bind disabled role');
  expectIncludes(apiSmoke, 'enabled account requires effective permission');
  expectIncludes(apiSmoke, 'enabled notification cannot use unsupported action');
  expectIncludes(apiSmoke, 'enabled notification cannot use disconnected channel');
  expectIncludes(apiSmoke, 'enabled notification cannot bind disabled role');
  expectIncludes(apiSmoke, 'enabled notification requires active recipient account');
  expectIncludes(apiSmoke, 'cannot disable last notification recipient account');
  expectIncludes(apiSmoke, 'cannot remove last notification recipient role from account');
  expectIncludes(apiSmoke, 'outbound submit creates warehouse notification');
  expectIncludes(apiSmoke, 'notification target account snapshot prevents late role visibility');
  expectIncludes(apiSmoke, 'purchase order confirmation notifies warehouse');
  expectIncludes(apiSmoke, 'disabled notification rule suppresses outbound notification');
  expectIncludes(apiSmoke, 'warehouse can mark notification read');
  expectIncludes(apiSmoke, 'admin can check local app health');
  expectIncludes(apiSmoke, 'manual app save cannot forge health result');
  expectIncludes(apiSmoke, 'sales cannot check app health');
  expectIncludes(apiSmoke, 'system config status rejects normal/abnormal');
  expectIncludes(apiSmoke, 'aliyun deployment plan stays disabled until real entry configured');
  expectIncludes(apiSmoke, 'admin can update aliyun deployment plan');
  expectIncludes(apiSmoke, 'external app health check is blocked');
  expectIncludes(apiSmoke, 'admin can record mcp tool verification');
  expectIncludes(apiSmoke, 'manual mcp tool save cannot forge verification time');
  expectIncludes(apiSmoke, 'disabled mcp tool cannot record verification');
  expectIncludes(apiSmoke, 'enabled mcp tool cannot use unsupported risk level');
  expectIncludes(apiSmoke, 'enabled mcp tool requires verification method');
  expectIncludes(apiSmoke, 'enabled mcp tool cannot clear verification method');
  expectIncludes(apiSmoke, 'incomplete mcp tool cannot record verification');
  expectIncludes(apiSmoke, 'disabled system mcp menu blocks verification action');
});

run('system accounts keep login and employee links unique', () => {
  const server = 'server/index.mjs';
  const seed = 'server/seed-data.mjs';
  const moduleView = 'src/views/ModuleView.vue';
  const styles = 'src/styles/main.css';
  const apiSmoke = 'scripts/smoke-api.mjs';
  const permissionMatrix = 'src/data/permissionMatrix.ts';
  const sharedPermissionMatrix = 'shared/permission-matrix.json';
  expectIncludes(server, 'accountUniquenessConflict');
  expectIncludes(server, 'canonicalLoginUsername');
  expectIncludes(server, 'validateLoginUsernameFormat');
  expectIncludes(server, 'systemInputText');
  expectIncludes(server, 'duplicateIdentityCode');
  expectIncludes(server, 'duplicateCodeUsername');
  expectIncludes(moduleView, 'canonicalAccountUsername');
  expectIncludes(moduleView, 'accountUsernameFormatMessage');
  expectIncludes(moduleView, 'duplicateUsernameAccountCode');
  expectIncludes(moduleView, 'duplicateCodeUsernameAccount');
  expectIncludes(moduleView, ':readonly="isAccountsPage && Boolean(systemDraft.employeeCode)"');
  expectIncludes(moduleView, '请填写账号姓名或选择关联员工');
  expectExcludes(server, ['当前演示环境默认账号']);
  expectIncludes(server, '系统默认管理员账号，用于初始化、权限配置和业务验证。');
  expectIncludes(server, 'activeAccountsLinkedToEmployee');
  expectIncludes(server, "code: 'ACC-PURCHASE'");
  expectIncludes(server, "employeeCode: 'EMP-CC'");
  expectIncludes(server, "username: 'purchase01'");
  expectExcludes(server, ["code: 'ACC-FINANCE'", "username: 'finance01'"]);
  expectIncludes(seed, "code: 'EMP-CC'");
  expectIncludes(seed, "position: '采购主管'");
  expectIncludes(seed, "code: 'EMP-ZM'");
  expectIncludes(seed, "position: '财务主管'");
  expectIncludes(server, "if (type === 'employees')");
  expectIncludes(server, "parts[1] === 'reference'");
  expectIncludes(server, '请先登录后再读取候选列表');
  expectIncludes(server, 'referencePermissionCodesForType');
  expectIncludes(server, 'const referencePermissionCodes = sharedPermissionMatrix.referencePermissionCodes || {}');
  expectIncludes(server, 'const permissions = referencePermissionCodes[type]');
  expectIncludes(permissionMatrix, 'referencePermissionCodes');
  expectIncludes(sharedPermissionMatrix, '"referencePermissionCodes"');
  expectExcludes(sharedPermissionMatrix, ['"sales-invoices"', 'PERM-FINANCE']);
  expectIncludes(sharedPermissionMatrix, '"purchase-invoices": ["PERM-PURCHASE-EDIT"]');
  expectIncludes(sharedPermissionMatrix, '"employees": ["PERM-SALES-EDIT", "PERM-PURCHASE-EDIT", "PERM-PRODUCTION-OPERATE", "PERM-EQUIPMENT-OPERATE", "PERM-MASTER-DATA-MAINTAIN", "PERM-SYSTEM-CONFIG"]');
  expectIncludes(server, 'requireReferencePermissionAudited');
  expectExcludes(server, ["'purchase-invoices': ['PERM-FINANCE-VIEW']", "employees: ['PERM-PURCHASE-EDIT'"]);
  expectIncludes(apiSmoke, 'reference candidates require login in password mode');
  expectIncludes(apiSmoke, 'purchase session context');
  expectIncludes(apiSmoke, "row.code === 'ACC-PURCHASE'");
  expectIncludes(apiSmoke, 'sales cannot read purchase invoice reference candidates');
  expectIncludes(apiSmoke, 'system bearer token cannot read customer reference candidates');
  expectIncludes(apiSmoke, 'notifications require login in password mode');
  expectIncludes(apiSmoke, 'notifications ignore account header in password mode');
  expectIncludes(server, 'employee.contact || employee.phone || account.phone');
  expectIncludes(server, 'input.roles ?? existing?.roles');
  expectIncludes(server, 'displayName');
  expectIncludes(server, "employee?.name || systemInputText(input, existing, 'name')");
  expectIncludes(server, '启用账号必须填写姓名或关联员工');
  expectIncludes(server, "lastLogin: existing?.lastLogin || ''");
  expectIncludes(moduleView, "{{ systemDraft.lastLogin || '尚未登录' }}");
  expectIncludes(moduleView, '{{ accountPasswordStatus }}');
  expectExcludes(moduleView, ['v-model="systemDraft.lastLogin" type="text" readonly']);
  expectExcludes(moduleView, [':value="accountPasswordStatus" type="text" readonly']);
  expectIncludes(server, "phone: employee?.contact || employee?.phone || systemInputText(input, existing, 'phone')");
  expectIncludes(server, 'description: record.description');
  expectIncludes(server, '!resolvedRoleCodes.length');
  expectIncludes(server, 'passwordLoginRequired(data) && !passwordState.passwordHash');
  expectIncludes(server, '登录账号只能使用字母、数字、点、下划线和短横线');
  expectIncludes(server, '关联员工不存在');
  expectIncludes(server, '启用账号不能关联已停用员工');
  expectIncludes(server, '已关联账号');
  expectIncludes(server, '仍被');
  expectIncludes(server, '个启用员工引用');
  expectIncludes(server, '启用员工必须选择有效的所属部门');
  expectIncludes(server, '启用员工必须选择有效的所属部门');
  expectIncludes(moduleView, 'duplicateUsernameAccount');
  expectIncludes(moduleView, 'duplicateEmployeeAccount');
  expectIncludes(moduleView, 'accountIdentityConflictMessage');
  expectIncludes(moduleView, 'accountSaveValidationMessage');
  expectIncludes(moduleView, 'systemDraft.code === defaultAdminAccountCode && !accountResolvedRoleCodes.value.includes(adminRoleCode)');
  expectIncludes(moduleView, 'row.code === defaultAdminAccountCode && !accountRoleCodesForRow(row).includes(adminRoleCode)');
  expectIncludes(moduleView, '默认管理员账号必须保留管理员角色');
  expectIncludes(moduleView, "listMasterRecords('employees')");
  expectIncludes(moduleView, 'employeeRows');
  expectIncludes(moduleView, 'accountEmployeeExcludedCodes');
  expectIncludes(moduleView, ':exclude-codes="accountEmployeeExcludedCodes"');
  expectIncludes(moduleView, 'clearAccountEmployeeLink');
  expectIncludes(moduleView, 'account-employee-clear');
  expectIncludes(styles, '.account-employee-control');
  expectIncludes(moduleView, '没有可关联员工；可先在基础资料新增员工，或直接填写姓名创建独立账号。');
  expectIncludes(moduleView, 'accountLinkedEmployeeBlockReason');
  expectIncludes(moduleView, 'selectedAccountEmployeeBlockMessage');
  expectIncludes(moduleView, 'if (selectedAccountEmployeeBlockMessage.value) return selectedAccountEmployeeBlockMessage.value');
  expectIncludes(moduleView, 'v-if="isAccountsPage && selectedAccountEmployeeBlockMessage"');
  expectIncludes(moduleView, 'const employeeBlockReason = accountLinkedEmployeeBlockReason(row)');
  expectIncludes(moduleView, '启用账号不能关联已停用员工，请先启用员工或停用账号');
  expectIncludes(moduleView, '关联员工不存在：');
  expectIncludes('src/views/MasterSimpleEditorView.vue', "listSystemRecords('accounts')");
  expectIncludes('src/views/MasterSimpleEditorView.vue', "listMasterRecords('departments')");
  expectIncludes('src/views/MasterSimpleEditorView.vue', 'linkedActiveEmployeeAccount');
  expectIncludes('src/views/MasterSimpleEditorView.vue', 'employeeStatusBlockReason');
  expectIncludes('src/views/MasterSimpleEditorView.vue', 'selectedEmployeeDepartment');
  expectIncludes('src/views/MasterSimpleEditorView.vue', 'employeeDepartmentBlockReason');
  expectIncludes('src/views/MasterSimpleEditorView.vue', '该员工已关联启用账号');
  expectIncludes('src/views/MasterSimpleEditorView.vue', 'linkedActiveDepartmentEmployees');
  expectIncludes('src/views/MasterSimpleEditorView.vue', 'departmentStatusBlockReason');
  expectIncludes('src/views/MasterSimpleEditorView.vue', '该部门仍被');
  expectIncludes('src/views/MasterSimpleEditorView.vue', ':disabled="Boolean(saveDisabledReason)"');
  expectIncludes('src/views/MasterSimpleEditorView.vue', 'v-if="employeeStatusBlockReason"');
  expectIncludes('src/views/MasterSimpleEditorView.vue', 'v-if="departmentStatusBlockReason"');
  expectExcludes('src/views/MasterSimpleEditorView.vue', ['employeeEmploymentBlockReason']);
  expectIncludes('src/views/MasterDataView.vue', 'openSupportedDetail');
  expectExcludes('src/views/MasterDataView.vue', ['quote-action-column', 'canToggleRecordStatus(row)']);
  expectIncludes(moduleView, '!isAccountsPage.value && !systemDraft.name.trim()');
  expectIncludes('src/components/ReferencePicker.vue', 'activeOnly: true');
  expectIncludes('src/components/ReferencePicker.vue', 'const activeOnly = props.activeOnly;');
  expectIncludes(moduleView, 'accountPasswordLoginRequired');
  expectIncludes(moduleView, '(isAccountsPage.value ? systemRows.value : accountRows.value).some');
  expectIncludes(moduleView, 'accountRequiresPasswordBeforeSave');
  expectIncludes(moduleView, 'accountPasswordSystemManagerBlockReason');
  expectIncludes(moduleView, 'rolePasswordSystemManagerBlockReason');
  expectIncludes(moduleView, 'accountProvidesSystemConfigWithRoles');
  expectIncludes(moduleView, 'systemDraft.permissionCode !== systemPermissionCode');
  expectIncludes(moduleView, '启用密码登录后必须至少保留一个已设置密码且拥有系统配置维护权限的账号');
  expectIncludes(moduleView, 'accountNeedsPassword');
  expectIncludes(moduleView, 'accountPasswordStatusClass');
  expectIncludes(moduleView, 'accountLoginRiskMessage');
  expectIncludes(moduleView, 'selectedAccountLoginReadiness');
  expectIncludes(moduleView, '需设密码');
  assert(
    /if \(isAccountsPage\.value\)[\s\S]*key: 'username'[\s\S]*key: 'password'[\s\S]*key: 'roles'/.test(read(moduleView)),
    'account table should surface password status immediately after login account',
  );
  expectIncludes(moduleView, 'enabledAccountRequiresRole');
  expectIncludes(moduleView, '登录账号不能包含空格');
  expectIncludes(moduleView, '登录账号只能使用字母、数字、点、下划线和短横线');
  assert(
    /if \(isAccountsPage\.value\)[\s\S]*systemDraft\.username = canonicalAccountUsername\(systemDraft\.username\)/.test(read(moduleView)),
    'account usernames should be normalized before submit',
  );
  expectIncludes(moduleView, '两次输入的密码不一致');
  expectIncludes(moduleView, '密码至少需要 6 位');
  assert(
    /const systemSaveDisabledReason[\s\S]*accountSaveValidationMessage\.value[\s\S]*return accountSaveValidationMessage\.value/.test(read(moduleView)),
    'account save validation should disable the shared save button before submit',
  );
  assert(
    /const systemSaveDisabledReason[\s\S]*roleAccountEffectivePermissionSaveBlockReason\.value[\s\S]*return roleAccountEffectivePermissionSaveBlockReason\.value/.test(read(moduleView)),
    'role save validation should block changes that leave enabled accounts without effective permissions',
  );
  expectIncludes(apiSmoke, 'cannot duplicate login username');
  expectIncludes(apiSmoke, 'cannot use another account code as login username');
  expectIncludes(apiSmoke, 'cannot create account code matching another login username');
  expectIncludes(apiSmoke, 'account username is normalized to lowercase');
  expectIncludes(apiSmoke, 'account username rejects unsupported characters');
  expectIncludes(apiSmoke, 'cannot duplicate linked employee');
  expectIncludes(apiSmoke, 'enabled account requires at least one role');
  expectIncludes(apiSmoke, 'enabled account requires password in password login mode');
  expectIncludes(apiSmoke, 'enabled account requires display name or employee');
  expectIncludes(apiSmoke, 'named account can be created without linked employee');
  expectIncludes(apiSmoke, 'enabled independent account cannot clear display name');
  expectIncludes(apiSmoke, 'manual account save cannot forge last login');
  expectIncludes(apiSmoke, 'password mode requires password system manager');
  expectIncludes(apiSmoke, 'non-system account cannot set first password');
  expectIncludes(apiSmoke, 'active account without password cannot login in password mode');
  expectIncludes(apiSmoke, 'enabled account cannot link disabled employee');
  expectIncludes(apiSmoke, 'linked account reflects employee contact changes');
  expectIncludes(apiSmoke, 'cannot disable employee linked to active account');
  expectIncludes(apiSmoke, 'cannot disable department linked to active employees');
  expectIncludes(apiSmoke, 'enabled employee cannot use disabled department');
  expectIncludes(apiSmoke, 'enabled employee requires valid department');
});

run('account password and disable changes revoke old sessions', () => {
  const server = 'server/index.mjs';
  const apiSmoke = 'scripts/smoke-api.mjs';
  expectIncludes(server, 'clearSessionsForAccount');
  expectIncludes(server, 'isPasswordUpdate');
  expectIncludes(server, 'sessionCreatedBeforePasswordUpdate');
  expectIncludes(server, 'currentAccountIndex');
  expectIncludes(server, 'updatedAccount');
  expectIncludes(server, '已清理');
  expectIncludes(server, "existingRecord.status !== '停用' && record.status === '停用'");
  expectExcludes(server, ['Object.assign(record, accountPasswordUpdate(body))']);
  expectIncludes(apiSmoke, 'Authorization: `Bearer ${check.token}`');
  expectIncludes(apiSmoke, 'password login disables account header bypass');
  expectIncludes(apiSmoke, 'sales bearer token cannot impersonate admin');
  expectIncludes(apiSmoke, 'system manager cannot impersonate passwordless account in password mode');
  expectIncludes(apiSmoke, 'system config post persists password account safely');
  expectIncludes(apiSmoke, 'password update revokes old session token');
  expectIncludes(apiSmoke, 'account disable revokes old session token');
  expectIncludes(apiSmoke, 'disabled account cannot login');
});

run('business saves cannot mutate workflow status directly', () => {
  const server = read('server/index.mjs');
  const apiSmoke = 'scripts/smoke-api.mjs';
  const businessSection = server.slice(0, server.indexOf('function normalizeSystemRecord'));
  assert(!businessSection.includes('status: input.status'), 'business normalizers should preserve existing workflow status');
  assert(businessSection.includes("status: existing?.status || '草稿'"), 'draft documents should preserve existing status');
  assert(businessSection.includes("status: existing?.status || '待拣货'"), 'sales issue saves should preserve the picking-first status');
  assert(businessSection.includes("status: existing?.status || '待盘点'"), 'stocktake saves should preserve existing status');
  assert(businessSection.includes("status: financeInvoiceDocumentStatus(existing, 'purchase') || '待收票'"), 'purchase invoice saves should preserve the document lifecycle');
  assert(businessSection.includes("status: financeInvoiceDocumentStatus(existing, 'sales') || '待开票'"), 'sales invoice saves should preserve the document lifecycle');
  expectIncludes(apiSmoke, 'confirmed sales order ordinary save is blocked');
  expectIncludes(apiSmoke, 'confirmed purchase order ordinary save is blocked');
  expectIncludes(apiSmoke, 'submitted warehouse move ordinary save is blocked');
  expectIncludes(apiSmoke, 'retired finance write endpoint is unavailable');
});

run('readonly document controls stay visually and functionally disabled', () => {
  const styles = 'src/styles/main.css';
  const salesOrder = 'src/views/SalesOrderEditorView.vue';
  const termsDialog = 'src/components/TermsTemplateDialog.vue';
  const purchaseOrder = 'src/views/PurchaseOrderEditorView.vue';
  const salesQuote = 'src/views/SalesQuoteEditorView.vue';
  const purchaseRequisition = 'src/views/PurchaseRequisitionEditorView.vue';
  const masterSimple = 'src/views/MasterSimpleEditorView.vue';

  expectIncludes(styles, '.file-upload-button.is-disabled');
  expectIncludes(styles, '.file-upload-button.is-disabled:hover');
  expectIncludes(styles, '.file-upload-button.is-disabled input');

  expectIncludes(salesOrder, 'const canManageTermsTemplate = computed(() => !isReadOnly.value)');
  expectIncludes(salesOrder, 'termsTemplateReadonlyReason');
  expectIncludes(termsDialog, ':disabled="readonly"');
  expectIncludes(termsDialog, ':disabled="readonly || !canDelete"');
  expectIncludes(termsDialog, ':readonly="readonly"');
  expectIncludes(salesOrder, ':readonly="!canManageTermsTemplate"');
  expectIncludes(salesOrder, ':readonly-reason="termsTemplateReadonlyReason"');
  assert(
    /function saveTermsTemplate\(\) \{[\s\S]*if \(!canManageTermsTemplate\.value\)/.test(read(salesOrder)),
    'sales order terms templates should not be saved from readonly mode',
  );
  assert(
    /function applySelectedTermsTemplate\(\) \{[\s\S]*if \(!canManageTermsTemplate\.value\) return/.test(read(salesOrder)),
    'sales order terms templates should not mutate readonly drafts',
  );

  [
    [purchaseRequisition, 'isReadOnly', 'requisitionAttachmentTitle'],
    [masterSimple, 'isReadonlyMode', 'sealUploadTitle'],
  ].forEach(([file, readonlyFlag, titleName]) => {
    const source = read(file);
    expectIncludes(file, 'attachmentReadonlyReason');
    expectIncludes(file, titleName);
    expectIncludes(file, `:title="${titleName}"`);
    expectIncludes(file, 'attachmentReadonlyReason.value ||');
    assert(
      source.includes('file-upload-button') &&
        source.includes(`:class="{ 'is-disabled': ${readonlyFlag} }"`) &&
        source.includes(`:disabled="${readonlyFlag}"`),
      `${file} upload control should expose disabled visual state and disable its file input`,
    );
  });
  [
    [salesQuote, 'quoteAttachmentTitle'],
    [salesOrder, 'orderAttachmentTitle'],
    [purchaseOrder, 'purchaseAttachmentTitle'],
  ].forEach(([file, titleName]) => {
    const source = read(file);
    expectIncludes(file, titleName);
    expectIncludes(file, `:title="${titleName}"`);
    assert(
      source.includes('v-if="!isReadOnly"') && source.includes('file-upload-button'),
      `${file} upload control should be omitted entirely in readonly mode`,
    );
  });

  [
    ['src/views/Production2View.vue', 'productionEditableActionDisabled', 'productionDocumentAttachmentTitle', 'if (!isProductionEditableDocument.value || productionEditableActionDisabled.value) {'],
    ['src/views/WarehousePurchaseReceiptEditorView.vue', 'isReadOnly', 'receiptAttachmentTitle', 'if (isReadOnly.value) {'],
    ['src/views/WarehouseSalesIssueEditorView.vue', 'isReadOnly', 'issueAttachmentTitle', 'if (isReadOnly.value) {'],
    ['src/views/WarehouseOperationEditorView.vue', 'isReadOnly', 'warehouseAttachmentTitle', 'if (isReadOnly.value) {'],
    ['src/views/SalesOutboundRequestView.vue', 'isReadOnly', 'outboundAttachmentTitle', 'if (isReadOnly.value) {'],
  ].forEach(([file, readonlyFlag, titleName, guard]) => {
    const source = read(file);
    expectIncludes(file, titleName);
    expectIncludes(file, `:title="${titleName}"`);
    expectIncludes(file, guard);
    assert(
      source.includes('file-upload-button') &&
        source.includes(`:class="{ 'is-disabled': ${readonlyFlag} }"`) &&
        source.includes(`:disabled="${readonlyFlag}"`),
      `${file} upload control should stay visible, disabled, titled, and functionally guarded in readonly mode`,
    );
  });

  const afterSalesEditor = read('src/views/AfterSalesDocumentView.vue');
  expectIncludes('src/views/AfterSalesDocumentView.vue', 'afterSalesAttachmentTitle');
  expectIncludes('src/views/AfterSalesDocumentView.vue', 'if (isAfterSalesReadOnly.value) {');
  expectIncludes('src/views/AfterSalesDocumentView.vue', 'v-if="isEditMode || afterSalesAttachments.length"');
  expectIncludes('src/views/AfterSalesDocumentView.vue', 'v-if="!isAfterSalesReadOnly"');
  assert(
    afterSalesEditor.includes('file-upload-button') &&
      !afterSalesEditor.includes(':disabled="isAfterSalesReadOnly"'),
    'src/views/AfterSalesDocumentView.vue should hide upload and empty attachments on detail instead of rendering disabled noise',
  );

  const qualityEditor = read('src/views/QualityDocumentEditorView.vue');
  expectIncludes('src/views/QualityDocumentEditorView.vue', 'qualityAttachmentTitle');
  expectIncludes('src/views/QualityDocumentEditorView.vue', 'v-if="!isQualityReadOnly"');
  expectIncludes('src/views/QualityDocumentEditorView.vue', ':title="qualityAttachmentTitle"');
  assert(
    qualityEditor.includes('<input type="file" multiple @change="handleQualityAttachmentUpload" />'),
    'quality upload should exist only in editable mode instead of rendering a fake disabled readonly control',
  );
});

run('warehouse detail more menu stays reachable', () => {
  expectIncludes('src/views/WarehouseOperationEditorView.vue', 'warehouseMoreActionsOpen = !warehouseMoreActionsOpen');
  expectExcludes('src/views/WarehouseOperationEditorView.vue', ['@mouseleave="warehouseMoreActionsOpen = false"']);
});

run('finalized document edit pages keep save actions readonly', () => {
  const saveGuardedEditors = [
    ['src/views/WarehouseOperationEditorView.vue', 'saveDocumentReadonlyReason', 'saveDocumentActionTitle', 'saveDraft'],
    ['src/views/FinanceSalesInvoiceEditorView.vue', 'saveInvoiceReadonlyReason', 'saveInvoiceActionTitle', 'saveInvoiceDraft'],
    ['src/views/FinancePurchaseInvoiceEditorView.vue', 'saveInvoiceReadonlyReason', 'saveInvoiceReadonlyReason', 'saveInvoiceDraft'],
  ];

  saveGuardedEditors.forEach(([file, reasonName, titleName, actionName]) => {
    const source = read(file);
    expectIncludes(file, reasonName);
    expectIncludes(file, 'if (isReadOnly.value) {');
    expectIncludes(file, `:title="${titleName}"`);
    expectIncludes(file, `@click="${actionName}"`);
    assert(
      /:disabled="[^"]*isSaving[^"]*isReadOnly[^"]*"/.test(source),
      `${file} should disable save/action buttons when the draft is readonly`,
    );
  });

  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'submitPurchaseReceiptArrivalResult');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'products: submitted.products.filter((product, index) => receiptLineIsSelected(product, index))');
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', ['saveReceiptDraft', '保存草稿']);
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', 'submitSalesIssuePickingResult');
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', 'sales-picking-dialog');
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', '<h3>本次作业信息</h3>');
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', '<h3>本次物料结果</h3>');
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', '<h3>备注与附件</h3>');
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', 'products: issueDraft.value!.products.filter((product) => issueLineIsSelected(product))');
  expectExcludes('src/views/WarehouseSalesIssueEditorView.vue', ['saveIssueDraft', '保存草稿']);
});

run('accelerated batch keeps quality, release, and invoice allocations on real commands', () => {
  const qualityEditor = 'src/views/QualityDocumentEditorView.vue';
  const productionWorkbench = 'src/views/ProductionWorkbenchDemoView.vue';
  const salesInvoiceEditor = 'src/views/FinanceSalesInvoiceEditorView.vue';

  expectIncludes(qualityEditor, 'submitIncomingQualityDisposition');
  expectIncludes(qualityEditor, "'return_to_supplier'");
  expectIncludes(qualityEditor, "'approve_concession'");
  expectIncludes(qualityEditor, 'dispositionVersion');

  expectIncludes(productionWorkbench, '/production/work-orders/${encodeURIComponent(master.code)}/release');
  expectIncludes(productionWorkbench, 'idempotencyKey: requestKey.key');
  expectIncludes(productionWorkbench, '尚未生成生产批次');

  expectIncludes(salesInvoiceEditor, 'getSalesInvoiceAvailability');
  expectIncludes(salesInvoiceEditor, 'sourceLineId');
  expectIncludes(salesInvoiceEditor, 'allocationBlockingMessage');
});

run('second accelerated batch keeps issue, reinspection, reversal, and refund commands real', () => {
  const warehouseIssueEditor = 'src/views/WarehouseOperationEditorView.vue';
  const productionWorkbench = 'src/views/ProductionWorkbenchDemoView.vue';
  const qualityEditor = 'src/views/QualityDocumentEditorView.vue';
  const salesInvoiceEditor = 'src/views/FinanceSalesInvoiceEditorView.vue';
  const server = 'server/index.mjs';

  expectIncludes(warehouseIssueEditor, 'postProductionMaterialIssue');
  expectIncludes(warehouseIssueEditor, 'submitProductionMaterialIssue');
  expectIncludes(productionWorkbench, 'startProductionExecutionCard');
  expectIncludes(server, "parts[2] === 'production-issues'");
  expectIncludes(server, 'postProductionIssueToStock');

  expectIncludes(qualityEditor, 'createIncomingQualityReinspection');
  expectIncludes(qualityEditor, 'completeIncomingQualityReinspection');
  expectIncludes(qualityEditor, '新判定不能直接填写让步数量');
  expectIncludes(server, 'createIncomingQualityReinspection');
  expectIncludes(server, "ruleKey: 'quality-supplier-returns'");

  expectIncludes(salesInvoiceEditor, 'reverseSalesInvoice');
  expectIncludes(salesInvoiceEditor, 'completeSalesRefund');
  expectIncludes(salesInvoiceEditor, '登记真实退款流水后才算已退款');
  expectIncludes(server, 'reverseSalesInvoiceFact');
  expectIncludes(server, 'completeSalesRefundFact');
});

run('third accelerated batch keeps execution, production quality, packaging, and completion receipt real', () => {
  const productionWorkbench = 'src/views/ProductionWorkbenchDemoView.vue';
  const productionDetail = 'src/views/Production2View.vue';
  const qualityEditor = 'src/views/QualityDocumentEditorView.vue';
  const qualityWorkbench = 'src/views/QualityWorkbenchView.vue';
  const qualityList = 'src/views/QualityView.vue';
  const qualityData = 'src/data/quality.ts';
  const qualityState = 'src/utils/qualityState.ts';
  const warehouseEditor = 'src/views/WarehouseOperationEditorView.vue';
  const server = 'server/index.mjs';

  expectIncludes(productionWorkbench, 'startProductionExecutionCard');
  expectIncludes(productionWorkbench, 'reportProductionExecutionCard');
  expectIncludes(productionWorkbench, 'executionIntentKey');
  expectIncludes(qualityEditor, 'getProductionQualityTask');
  expectIncludes(qualityEditor, 'decideProductionQualityTask');
  expectIncludes(qualityEditor, 'checkpointResults');
  expectIncludes(qualityEditor, 'markAllEditableCheckpointsPassed');
  expectIncludes(qualityEditor, 'detailInspectionConclusion');
  expectIncludes(qualityEditor, 'detailDispositionStage');
  expectIncludes(qualityEditor, 'detailCurrentAction');
  expectIncludes(qualityEditor, 'activeQualityStageDescription');
  expectIncludes(qualityEditor, '检验结论保持为');
  expectIncludes(qualityEditor, 'qualityHandlingFacts');
  expectIncludes(qualityEditor, 'lineResultFieldLabel');
  expectIncludes(qualityEditor, 'qualityAlternativeAction');
  expectIncludes(qualityEditor, 'runAlternativeClosureAction');
  expectIncludes(qualityEditor, 'rectificationAction');
  expectIncludes(qualityEditor, 'verificationConclusion');
  expectIncludes(server, 'createDefectFromPatrol');
  expectIncludes(server, "待验证: ['处置中', '已关闭']");
  expectIncludes(qualityWorkbench, 'qualityFreezeCount');
  expectIncludes(qualityWorkbench, 'issueCount');
  expectIncludes(qualityWorkbench, 'inspectionConclusion');
  expectIncludes(qualityWorkbench, 'dispositionStage');
  expectIncludes(qualityWorkbench, '待办：{{ row.currentAction }}');
  expectIncludes(qualityList, 'projectQualityState');
  expectIncludes(qualityList, 'showRowCurrentAction');
  expectIncludes(qualityList, 'const qualityStatusColumnTitle = computed');
  expectIncludes(qualityList, 'const qualityProgressDimensionLabels = computed');
  expectIncludes(qualityList, "? `${conclusionColumnLabel.value} · 处置 · 当前待办`");
  expectIncludes(qualityList, '{{ qualityCardOutcomeSummary(row) }}');
  expectIncludes(server, 'function incomingQualityDispositionProjection');
  expectIncludes(server, 'dispositionStage: dispositionProjection.stage');
  expectIncludes(qualityData, 'inspectionConclusion?: string;');
  expectIncludes(qualityData, 'dispositionStage?: string;');
  expectIncludes(qualityData, 'projectQualityState');
  expectIncludes(qualityState, "stage === '待复检'");
  expectIncludes(qualityState, "stage === '无需处置'");
  expectIncludes(qualityState, '检验已完成，无需质量处置');
  expectIncludes(productionDetail, 'productionQualityState');
  expectIncludes(productionDetail, 'executionCardQualityRemainderStage');
  expectIncludes(productionDetail, 'workOrderQualityRemainderSummary');
  expectIncludes(productionDetail, 'qualityState.currentAction');
  expectIncludes(productionDetail, 'packProductionExecutionCard');
  expectIncludes(warehouseEditor, 'saveProductionReceipt');
  expectIncludes(warehouseEditor, 'submitProductionReceipt');
  expectIncludes(warehouseEditor, 'postProductionReceipt');
  expectIncludes(server, 'startExecutionCard');
  expectIncludes(server, 'reportExecutionCard');
  expectIncludes(server, 'decideProductionQualityTask');
  expectIncludes(server, 'postProductionReceiptToStock');
});

run('fourth accelerated batch keeps pause, handover, and production exceptions real', () => {
  const productionWorkbench = 'src/views/ProductionWorkbenchDemoView.vue';
  const productionDetail = 'src/views/Production2View.vue';
  const api = 'src/services/api.ts';
  const server = 'server/index.mjs';
  const flowSmoke = 'scripts/smoke-flow.mjs';

  expectIncludes(productionWorkbench, 'pauseProductionExecutionCard');
  expectIncludes(productionWorkbench, 'resumeProductionExecutionCard');
  expectIncludes(productionWorkbench, 'handoverProductionShift');
  expectIncludes(productionWorkbench, 'receiveProductionShift');
  expectIncludes(productionWorkbench, 'createProductionException');
  expectIncludes(productionWorkbench, 'function openLineException');
  expectIncludes(productionWorkbench, 'selectedLine.currentChildCode && selectedLine.status');
  expectIncludes(productionWorkbench, 'const affectedExecutionRows = computed');
  expectIncludes(productionWorkbench, '<strong>受影响对象</strong>');
  expectIncludes(productionWorkbench, 'const runtimeProductionReports = ref<ProductionReportFact[]>([])');
  expectIncludes(productionWorkbench, 'getProductionExecutionCard(card.code)');
  expectIncludes(productionWorkbench, 'report.reportedAt >= currentShift.startAt');
  expectIncludes(productionWorkbench, "query: { returnTo: '/production/workbench?tab=site' }");
  expectIncludes(productionWorkbench, "returnTo: '/production/workbench?tab=exceptions'");
  expectIncludes(productionWorkbench, ':disabled="operationConfirmDisabled"');
  expectIncludes(productionWorkbench, '<input v-model="reportDraft.equipment" type="text" readonly />');
  expectExcludes(productionWorkbench, ['postprocess-code-link', 'releaseDecisionRows']);
  expectExcludes(productionWorkbench, ['stopLineByException', 'resolveProductionException', 'window.prompt', '解除异常']);
  expectIncludes(productionDetail, 'loadRuntimeProductionExceptions');
  expectIncludes(productionDetail, 'closeRuntimeProductionException');
  expectIncludes(api, '/production/execution-cards/${encodeURIComponent(code)}/pause');
  expectIncludes(api, '/production/shifts/handover');
  expectIncludes(api, '/production/exceptions/${encodeURIComponent(code)}/resolve');
  expectIncludes(server, 'pauseExecutionCard');
  expectIncludes(server, 'createShiftHandover');
  expectIncludes(server, 'createProductionException');
  expectIncludes(server, 'resolveProductionException');
  expectIncludes(flowSmoke, "status === '已暂停'");
  expectIncludes(flowSmoke, "status === '已关闭'");
});

run('operation permissions guard document actions', () => {
  const permissionComposable = 'src/composables/useModulePermission.ts';
  const permissionMatrix = 'src/data/permissionMatrix.ts';
  const sharedPermissionMatrix = 'shared/permission-matrix.json';
  const permissionDisplay = 'src/utils/permissionDisplay.ts';
  const server = 'server/index.mjs';
  const navigation = 'src/stores/navigation.ts';
  const home = 'src/views/HomeView.vue';
  const styles = 'src/styles/main.css';
  const apiSmoke = 'scripts/smoke-api.mjs';
  expectFile(permissionMatrix);
  expectFile(sharedPermissionMatrix);
  expectIncludes(permissionMatrix, "import sharedPermissionMatrix from '../../shared/permission-matrix.json'");
  expectIncludes(permissionMatrix, 'moduleReadPermissionCodes');
  expectIncludes(permissionMatrix, 'moduleWritePermissionCodes');
  expectIncludes(permissionMatrix, 'routeModuleReadPermissionCodes');
  expectIncludes(permissionMatrix, 'routeModuleWritePermissionCodes');
  expectIncludes(sharedPermissionMatrix, '"warehouse": "PERM-WAREHOUSE-VIEW"');
  expectExcludes(sharedPermissionMatrix, ['"finance": "PERM-FINANCE-VIEW"']);
  expectIncludes(sharedPermissionMatrix, '"quality": "PERM-QUALITY-VIEW"');
  expectIncludes(sharedPermissionMatrix, '"warehouse": "PERM-WAREHOUSE-POST"');
  expectExcludes(sharedPermissionMatrix, ['"finance": "PERM-FINANCE-SETTLE"']);
  expectIncludes(sharedPermissionMatrix, '"quality": "PERM-QUALITY-OPERATE"');
  expectIncludes(sharedPermissionMatrix, '"salesApprove": "PERM-SALES-APPROVE"');
  expectIncludes(sharedPermissionMatrix, '"purchaseApprove": "PERM-PURCHASE-APPROVE"');
  expectIncludes(sharedPermissionMatrix, '"qualityOperate": "PERM-QUALITY-OPERATE"');
  expectIncludes(sharedPermissionMatrix, '"permissionDefaults"');
  expectIncludes(sharedPermissionMatrix, '"name": "销售单据确认"');
  expectIncludes(sharedPermissionMatrix, '"name": "仓库过账"');
  expectIncludes(sharedPermissionMatrix, '"name": "质检操作"');
  expectExcludes(sharedPermissionMatrix, ['允许确认发票、登记收款和登记付款']);
  expectIncludes(sharedPermissionMatrix, '"roleDefaults"');
  expectIncludes(sharedPermissionMatrix, '"code": "ROLE-SALES"');
  expectIncludes(sharedPermissionMatrix, '"aliases": ["销售主管", "销售专员"]');
  expectIncludes(sharedPermissionMatrix, '"permissionCodes": ["PERM-SALES-EDIT", "PERM-SALES-APPROVE"]');
  expectIncludes(sharedPermissionMatrix, '"code": "ROLE-QUALITY"');
  expectIncludes(sharedPermissionMatrix, '"permissionCodes": ["PERM-QUALITY-VIEW", "PERM-QUALITY-OPERATE"]');
  expectIncludes(permissionMatrix, 'roleDefaults');
  expectIncludes(permissionMatrix, 'roleDisplayOrder');
  expectIncludes(permissionMatrix, 'referencePermissionCodes');
  expectIncludes(permissionMatrix, 'operationPermissionDependencies');
  expectIncludes(sharedPermissionMatrix, '"PERM-SALES-APPROVE": ["PERM-SALES-EDIT"]');
  expectIncludes(sharedPermissionMatrix, '"PERM-PURCHASE-APPROVE": ["PERM-PURCHASE-EDIT"]');
  expectIncludes(sharedPermissionMatrix, '"PERM-WAREHOUSE-POST": ["PERM-WAREHOUSE-VIEW"]');
  expectExcludes(sharedPermissionMatrix, ['PERM-FINANCE-SETTLE', 'PERM-FINANCE-VIEW', 'ROLE-FINANCE']);
  expectIncludes(sharedPermissionMatrix, '"PERM-QUALITY-OPERATE": ["PERM-QUALITY-VIEW"]');
  expectIncludes(sharedPermissionMatrix, '"operationPermissionRouteRules"');
  expectIncludes(sharedPermissionMatrix, '"module": "sales"');
  expectIncludes(sharedPermissionMatrix, '"actions": ["confirm", "submit", "void", "status", "advance"]');
  expectIncludes(sharedPermissionMatrix, '"permissionKey": "salesApprove"');
  expectIncludes(sharedPermissionMatrix, '"module": "warehouse"');
  expectIncludes(sharedPermissionMatrix, '"actions": ["post", "submit", "start", "complete", "status", "arrival-result", "picking-result", "reverse", "cancel", "return"]');
  expectIncludes(sharedPermissionMatrix, '"module": "quality"');
  expectIncludes(sharedPermissionMatrix, '"actions": ["inspect", "review", "decision", "decide", "release", "dispose", "close", "start", "complete", "status"]');
  expectIncludes(sharedPermissionMatrix, '"permissionKey": "qualityOperate"');
  expectIncludes(permissionMatrix, 'operationPermissionRouteRules');
  expectIncludes(permissionMatrix, 'operationPermissionCodeSet');
  expectIncludes(permissionMatrix, 'routeModulePermission');
  expectIncludes(server, "readFileSync(join(__dirname, '..', 'shared', 'permission-matrix.json'), 'utf8')");
  expectIncludes(server, 'routeModuleReadPermissionCodes');
  expectIncludes(server, 'routeModuleWritePermissionCodes');
  expectIncludes(server, 'sharedPermissionMatrix.permissionDefaults');
  expectIncludes(server, 'const roleDefaults = Array.isArray(sharedPermissionMatrix.roleDefaults)');
  expectIncludes(server, 'const roleDefaultAliasPairs = Array.isArray(sharedPermissionMatrix.roleDefaults)');
  expectIncludes(server, 'roleDefaultAliasPairs.find');
  expectIncludes(server, 'roles: roleDefaults');
  expectIncludes(server, 'const defaultRolePermissionUpgrades = Object.fromEntries');
  expectIncludes(server, 'operationPermissionRouteRules');
  expectIncludes(server, 'operationPermissionCodes[rule.permissionKey]');
  expectIncludes(server, 'const salesApprovePermissionCode = operationPermissionCodes.salesApprove');
  expectIncludes(server, 'const purchaseApprovePermissionCode = operationPermissionCodes.purchaseApprove');
  expectIncludes(server, 'accountPermissionCodes(req, data).has(salesApprovePermissionCode)');
  expectIncludes(server, 'accountPermissionCodes(req, data).has(purchaseApprovePermissionCode)');
  expectIncludes(server, 'permissionDisplayLabel(data, salesApprovePermissionCode)');
  expectIncludes(server, 'permissionDisplayLabel(data, purchaseApprovePermissionCode)');
  expectExcludes(server, [
    "accountPermissionCodes(req, data).has('PERM-SALES-APPROVE')",
    "accountPermissionCodes(req, data).has('PERM-PURCHASE-APPROVE')",
    "permissionDisplayLabel(data, 'PERM-SALES-APPROVE')",
    "permissionDisplayLabel(data, 'PERM-PURCHASE-APPROVE')",
  ]);
  const operationPermissionForPathBlock = read(server).slice(
    read(server).indexOf('function operationPermissionForPath'),
    read(server).indexOf('function referencePermissionCodesForType'),
  );
  assert(
    operationPermissionForPathBlock.includes('operationPermissionRouteRules.find') &&
      !operationPermissionForPathBlock.includes("moduleKey === 'sales'") &&
      !operationPermissionForPathBlock.includes("moduleKey === 'warehouse'"),
    'operation permission API routing should be driven by the shared permission matrix',
  );
  expectIncludes(permissionComposable, 'operationPermissionCodes');
  expectIncludes(permissionComposable, 'moduleWritePermissionCodes');
  expectIncludes(permissionComposable, 'operationPermissionCodes as operationPermissionCodeMap');
  expectIncludes(permissionComposable, 'export const modulePermissionCodes = moduleWritePermissionCodes');
  expectIncludes(permissionDisplay, "import sharedPermissionMatrix from '../../shared/permission-matrix.json'");
  expectIncludes(permissionDisplay, 'permissionDisplayNames');
  expectIncludes(permissionDisplay, 'sharedPermissionMatrix.permissionDefaults.map');
  expectExcludes(permissionDisplay, ["'PERM-WAREHOUSE-POST': '仓库过账'", "'PERM-FINANCE-SETTLE': '财务收付款'"]);
  expectExcludes(server, [
    "{ code: 'ROLE-SALES', name: '销售'",
    "'ROLE-SALES': ['PERM-SALES-EDIT', 'PERM-SALES-APPROVE']",
    'const roleByAlias = {',
  ]);
  expectIncludes('src/services/api.ts', 'permissionLabels: Record<string, string>');
  expectIncludes('src/stores/session.ts', 'permissionLabels: {} as Record<string, string>');
  expectIncludes('src/stores/session.ts', 'permissionLabel: (state) => (permissionCode: string)');
  expectIncludes(permissionComposable, 'session.permissionLabel(permissionCode)');
  expectIncludes(permissionComposable, 'roleGrantHint');
  expectIncludes(permissionComposable, '请联系系统管理员在角色管理中为当前账号授权。');
  expectIncludes(navigation, 'routeModuleReadPermissionCodes');
  expectIncludes(navigation, 'routeModuleWritePermissionCodes');
  expectIncludes(navigation, '/\\/new$|\\/edit$/');
  expectIncludes(navigation, 'routeModulePermission(routeModuleReadPermissionCodes, moduleKey)');
  expectIncludes(navigation, 'routeModulePermission(routeModuleWritePermissionCodes, moduleKey)');
  expectIncludes('src/router/index.ts', 'const writePermission = routeWritePermission(to.path)');
  expectIncludes('src/router/index.ts', 'if (writePermission && !session.hasPermission(writePermission)) return');
  expectIncludes(home, 'moduleReadPermissionCodes');
  expectIncludes(home, 'session.hasPermission(moduleReadPermissionCodes.sales)');
  expectIncludes(home, 'session.hasPermission(moduleReadPermissionCodes.purchase)');
  expectIncludes(home, 'session.hasPermission(moduleReadPermissionCodes.warehouse)');
  expectIncludes(home, 'session.hasPermission(moduleReadPermissionCodes.system)');
  expectIncludes(home, 'const todoBoardLoaders: Record<TodoBoardKey, () => Promise<HomeTodoItem[]>>');
  expectIncludes(home, 'todoBoards.value.filter((board) => board.allowed)');
  expectIncludes(home, 'const items = await todoBoardLoaders[key]();');
  expectExcludes(home, [
    'canReadSales ? listSalesQuotes() : Promise.resolve([])',
    'listFinanceRecords',
    'canReadFinance',
    'moduleReadPermissionCodes.finance',
  ]);
  expectIncludes('src/router/index.ts', "path: 'finance/:pathMatch(.*)*'");
  expectExcludes('src/router/index.ts', [
    "name: 'finance-receivable-new'",
    "name: 'finance-payable-new'",
    "redirect: '/finance/receivables'",
    "redirect: '/finance/payables'",
  ]);
  expectIncludes(server, "if (parts[1] === 'finance')");
  expectIncludes(server, '独立财务模块已移除');
  expectIncludes('src/views/SalesOrderEditorView.vue', 'CommercialFollowUpPanel');
  expectIncludes('src/views/PurchaseOrderEditorView.vue', 'CommercialFollowUpPanel');
  expectIncludes(server, 'purchaseInvoiceMatchingSummary');
  expectIncludes(server, 'sourceReceiptLineId');
  expectIncludes(server, 'payablePayments');
  expectIncludes(server, "status: nextSettled + 0.01 >= totalAmount ? '已付款' : '部分付款'");
  expectIncludes(server, 'requireOperationPermission');
  expectIncludes(server, 'operationPermissionForPath');
  expectIncludes(server, 'parts.at(-1)');
  expectIncludes(sharedPermissionMatrix, '"actions": ["post", "submit", "start", "complete", "status", "arrival-result", "picking-result", "reverse", "cancel", "return"]');
  expectIncludes(server, 'assertWarehouseStatusTransition');
  expectIncludes(server, 'assertFinanceStatusTransition');
  expectIncludes(server, 'assertSalesStatusTransition');
  expectIncludes(server, 'assertPurchaseStatusTransition');
  expectIncludes(server, 'PERM-WAREHOUSE-VIEW');
  expectIncludes(apiSmoke, 'sales edit-only account cannot confirm documents');
  expectIncludes(apiSmoke, 'sales session reflects role permission change');
  expectIncludes(apiSmoke, 'role operation permission requires base permission');
  expectIncludes(apiSmoke, 'sales menus reflect removed edit permission');
  expectIncludes(apiSmoke, 'menu route permission fallback hides misconfigured menus');
  expectIncludes(apiSmoke, 'sales account without sales permission cannot read sales quotes');
  expectIncludes(apiSmoke, 'purchase edit-only account cannot submit requisitions');
  expectIncludes(apiSmoke, 'sales edit-only account cannot change document status');
  expectIncludes(apiSmoke, 'confirmed sales order content remains locked');
  expectIncludes(apiSmoke, 'purchase edit-only account cannot change document status');
  expectIncludes(apiSmoke, 'purchase edit-only account cannot change confirmed order content');
  expectIncludes(apiSmoke, 'warehouse view-only account cannot change document status');
  expectIncludes(apiSmoke, 'warehouse view-only account cannot start stocktake');
  expectIncludes(apiSmoke, 'warehouse view-only account cannot complete stocktake');
  expectIncludes(apiSmoke, 'warehouse view-only account cannot post purchase receipts');
  expectIncludes(apiSmoke, 'warehouse view-only account cannot post sales issues');
  expectIncludes(apiSmoke, 'warehouse view-only account cannot submit other moves');
  expectIncludes(apiSmoke, 'warehouse view-only account cannot post transfers');
  expectIncludes(apiSmoke, 'warehouse view-only account cannot submit transfers');
  expectIncludes(apiSmoke, 'sales status cannot bypass outbound workflow');
  expectIncludes(apiSmoke, 'purchase status cannot bypass confirmation workflow');
  expectIncludes(apiSmoke, 'warehouse status cannot bypass stock posting');
  expectIncludes(apiSmoke, 'retired finance write endpoint is unavailable');
  expectIncludes(apiSmoke, 'sales cannot confirm quote twice');
  expectIncludes(apiSmoke, 'sales cannot confirm order twice');
  expectIncludes(apiSmoke, 'purchase cannot submit requisition twice');
  expectIncludes(apiSmoke, 'purchase cannot confirm order twice');
  expectIncludes(apiSmoke, 'warehouse submit other move twice is idempotent');
  expectIncludes(apiSmoke, 'warehouse post other move twice is idempotent');
  expectIncludes(apiSmoke, 'repeatedSubmit.repeated !== true');
  expectIncludes(apiSmoke, 'repeatedPost.repeated !== true');
  expectIncludes(apiSmoke, 'warehouse cannot complete transfer before inbound step');
  expectIncludes(apiSmoke, 'warehouse transfer completion retry is idempotent');
  expectIncludes(server, '不能变更已确认或流程中的销售订单');
  expectIncludes(server, '不能变更已确认或流程中的采购订单');
  expectIncludes(apiSmoke, 'withDataFileRollback');
  expectIncludes('src/views/SalesView.vue', 'salesOperationPermissionHint');
  expectIncludes('src/views/SalesView.vue', 'showSalesOperationPermissionHint');
  expectIncludes('src/views/SalesView.vue', 'salesOperationPermissionSuffix');
  expectIncludes('src/views/SalesView.vue', 'OperationPermissionBanner');
  expectIncludes('src/views/SalesView.vue', '确认、作废和异常处理会保持不可用。');
  expectIncludes('src/views/SalesView.vue', '确认、提交、作废和异常处理会保持不可用。');
  expectIncludes('src/views/SalesView.vue', '交付追踪为只读视图。');
  expectIncludes('src/views/SalesView.vue', '<RouterLink v-if="canWriteSales"');
  expectIncludes('src/views/SalesView.vue', ':title="salesReadonlyReason"');
  expectIncludes('src/views/SalesView.vue', "class=\"quote-status-cell order-status-link\"");
  expectIncludes('src/views/SalesView.vue', ':class="{ \'is-row-highlighted\': hoveredQuoteCode === row.code }"');
  expectIncludes('src/views/SalesView.vue', ':class="{ \'is-row-highlighted\': hoveredOrderCode === row.code }"');
  expectIncludes('src/views/SalesView.vue', ':class="{ \'is-row-highlighted\': hoveredOutboundCode === row.code }"');
  expectIncludes('src/views/SalesView.vue', ':aria-label="`查看报价单 ${row.code} 状态`"');
  expectIncludes('src/views/SalesView.vue', ':aria-label="`查看销售订单 ${row.code} 订单跟进`"');
  expectIncludes('src/views/SalesView.vue', 'class="order-card-content-link"');
  expectIncludes('src/views/SalesView.vue', 'class="order-card-follow-up-link"');
  expectIncludes('src/views/SalesView.vue', ':aria-label="`查看交付追踪 ${row.code} 状态`"');
  expectIncludes('src/views/SalesView.vue', 'salesQuoteNextStep(row)');
  expectIncludes('src/views/SalesView.vue', 'orderFulfillmentSnapshot(row)');
  expectIncludes('src/views/SalesView.vue', 'salesOutboundNextStep(row.status)');
  expectIncludes('src/views/PurchaseView.vue', 'purchaseOperationPermissionHint');
  expectIncludes('src/views/PurchaseView.vue', 'showPurchaseOperationPermissionHint');
  expectIncludes('src/views/PurchaseView.vue', 'purchaseOperationPermissionSuffix');
  expectIncludes('src/views/PurchaseView.vue', 'OperationPermissionBanner');
  expectIncludes('src/views/PurchaseView.vue', '提交、确认、作废和异常处理会保持不可用。');
  expectIncludes('src/views/PurchaseView.vue', '<PageTopbarPortal v-if="createButtonLabel && createButtonPath">');
  expectIncludes('src/views/PurchaseView.vue', '<RouterLink v-if="canWritePurchase" class="primary-action" :to="createButtonPath"');
  expectIncludes('src/views/PurchaseView.vue', ':title="purchaseReadonlyReason"');
  expectIncludes('src/views/PurchaseView.vue', 'class="quote-status-cell order-status-link"');
  expectIncludes('src/views/PurchaseView.vue', ':class="{ \'is-row-highlighted\': hoveredRequisitionCode === row.code }"');
  expectIncludes('src/views/PurchaseView.vue', ':class="{ \'is-row-highlighted\': hoveredPurchaseOrderCode === row.code }"');
  expectIncludes('src/views/PurchaseView.vue', ':class="{ \'is-row-highlighted\': hoveredAfterSalesCode === row.code }"');
  expectIncludes('src/views/PurchaseView.vue', ':aria-label="`查看采购需求 ${row.code} 状态`"');
  expectIncludes('src/views/PurchaseView.vue', '查看采购订单 ${row.code} 采购跟进');
  expectIncludes('src/views/PurchaseView.vue', ':aria-label="`打开采购售后 ${row.code} 状态`"');
  expectIncludes('src/views/PurchaseView.vue', 'requisitionNextStep(row.status, row.conversionFacts)');
  expectIncludes('src/views/PurchaseView.vue', 'purchaseOrderNextStep(row)');
  expectIncludes('src/views/PurchaseView.vue', 'row.nextStep');
  for (const view of [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/SalesOutboundRequestView.vue',
    'src/views/SalesView.vue',
  ]) {
    expectIncludes(view, 'useOperationPermission');
    expectIncludes(view, 'salesApprove');
  }
  for (const view of [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/SalesOutboundRequestView.vue',
    'src/views/SalesView.vue',
  ]) {
    expectIncludes(view, 'OperationPermissionBanner');
    assert(
      read(view).includes('operationPermissionHint') || read(view).includes('salesOperationPermissionHint'),
      `${view} should compute an operation permission hint`,
    );
    assert(
      read(view).includes(':message="operationPermissionHint"') || read(view).includes(':message="salesOperationPermissionHint"'),
      `${view} should pass the operation permission hint to the shared banner`,
    );
  }
  expectIncludes('src/views/SalesOrderEditorView.vue', 'canModifyOrderContent');
  expectIncludes('src/views/SalesOrderEditorView.vue', 'canEditOrderContent');
  expectIncludes('src/views/SalesOrderEditorView.vue', 'saveOrderReadonlyReason');
  expectIncludes('src/views/SalesOrderEditorView.vue', 'const canConfirmOrder = computed(() => canWriteSales.value && canApproveSales.value)');
  expectIncludes('src/views/SalesOrderEditorView.vue', ':disabled="isSaving || isOrderActionPending || isLoading || !canModifyOrderContent"');
  for (const view of [
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
    'src/views/PurchaseView.vue',
  ]) {
    expectIncludes(view, 'useOperationPermission');
    expectIncludes(view, 'purchaseApprove');
  }
  for (const view of [
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
    'src/views/PurchaseView.vue',
  ]) {
    expectIncludes(view, 'OperationPermissionBanner');
    assert(
      read(view).includes('operationPermissionHint') || read(view).includes('purchaseOperationPermissionHint'),
      `${view} should compute an operation permission hint`,
    );
    assert(
      read(view).includes(':message="operationPermissionHint"') || read(view).includes(':message="purchaseOperationPermissionHint"'),
      `${view} should pass the operation permission hint to the shared banner`,
    );
  }
  expectIncludes('src/views/PurchaseOrderEditorView.vue', 'canModifyOrderContent');
  expectIncludes('src/views/PurchaseOrderEditorView.vue', 'canEditOrderContent');
  expectIncludes('src/views/PurchaseOrderEditorView.vue', 'saveOrderReadonlyReason');
  expectIncludes('src/views/PurchaseOrderEditorView.vue', 'const canConfirmOrder = computed(() => canWritePurchase.value && canApprovePurchase.value)');
  expectIncludes('src/views/PurchaseOrderEditorView.vue', ':disabled="isSaving || isPurchaseActionPending || !canModifyOrderContent || isPurchaseStagingConfigurationBlocked"');
  for (const view of [
    'src/views/WarehouseView.vue',
    'src/views/FinanceView.vue',
  ]) {
    expectIncludes(view, 'useOperationPermission');
  }
  expectIncludes('src/views/WarehouseView.vue', 'warehousePost');
  expectIncludes('src/views/WarehouseView.vue', 'warehouseOperationPermissionHint');
  expectIncludes('src/views/WarehouseView.vue', 'showWarehouseOperationPermissionHint');
  expectIncludes('src/views/WarehouseView.vue', 'warehouseOperationPermissionSuffix');
  expectIncludes('src/views/WarehouseView.vue', 'OperationPermissionBanner');
  expectIncludes('src/views/WarehouseView.vue', '新建、提交、确认库存、作废和异常处理会保持不可用。');
  expectIncludes('src/views/WarehouseView.vue', '<RouterLink v-if="createButtonPath && canWriteWarehouse" class="primary-action" :to="createButtonPath"');
  expectIncludes('src/views/WarehouseView.vue', ':title="warehouseReadonlyReason"');
  expectIncludes('src/views/WarehouseView.vue', 'class="quote-status-cell order-status-link"');
  expectIncludes('src/views/WarehouseView.vue', ':class="{ \'is-row-highlighted\': hoveredOperationCode === row.code }"');
  expectIncludes('src/views/WarehouseView.vue', ':aria-label="`打开${pageTitles[row.page]} ${row.code} 状态`"');
  expectIncludes('src/views/WarehouseView.vue', 'warehouseNextStep(row)');
  expectIncludes('src/views/FinanceView.vue', 'financeSettle');
  expectIncludes('src/views/FinanceView.vue', 'financeLifecycleStatus');
  expectIncludes('src/views/FinanceView.vue', 'financeSettlementStatus');
  expectIncludes('src/views/FinanceView.vue', 'financeNextStep');
  expectIncludes('src/views/FinanceView.vue', 'financeOperationPermissionHint');
  expectIncludes('src/views/FinanceView.vue', 'showFinanceOperationPermissionHint');
  expectIncludes('src/views/FinanceView.vue', 'financeOperationPermissionSuffix');
  expectIncludes('src/views/FinanceView.vue', 'OperationPermissionBanner');
  expectIncludes(styles, '.operation-permission-banner');
  expectIncludes(styles, '.operation-permission-banner strong');
  expectIncludes('src/views/FinanceView.vue', 'class="table-row order-list-row finance-list-row is-clickable"');
  expectIncludes('src/views/FinanceView.vue', ':class="{ \'is-row-highlighted\': hoveredFinanceCode === row.code }"');
  expectIncludes('src/views/FinanceView.vue', ':aria-label="`打开${pageTitles[row.page]} ${row.code}`"');
  expectExcludes('src/views/FinanceView.vue', ['操作</span>', 'primaryActionTitle(row)', 'exceptionActionTitle(row)']);
  for (const view of [
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
  ]) {
    expectIncludes(view, 'useOperationPermission');
    expectIncludes(view, 'warehousePost');
    expectIncludes(view, 'canPostWarehouse');
    expectIncludes(view, 'warehousePostReadonlyReason');
    expectIncludes(view, 'OperationPermissionBanner');
    expectIncludes(view, 'operationPermissionHint');
    expectIncludes(view, '!canPostWarehouse.value ? warehousePostReadonlyReason.value :');
    expectIncludes(view, ':message="operationPermissionHint"');
    expectIncludes(view, 'WarehouseReversalDialog');
    expectIncludes(view, 'reverseWarehouseDocument');
    expectIncludes(view, 'warehouse-reversal-notice');
  }
  expectFile('src/components/WarehouseReversalDialog.vue');
  expectIncludes('src/components/WarehouseReversalDialog.vue', '原单、原状态及原流水不会被删除或改写');
  expectIncludes('src/services/api.ts', '/reverse');
  expectIncludes(server, 'warehouse-reversals');
  expectIncludes(server, 'reversalStatus: \'已冲销\'');
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', ['@mouseleave="receiptMoreActionsOpen = false"']);
  expectExcludes('src/views/WarehouseSalesIssueEditorView.vue', ['@mouseleave="issueMoreActionsOpen = false"']);
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', '@click="submitReceipt"');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'if (!canWriteWarehouse.value) return warehouseReadonlyReason.value;');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'v-if="[\'草稿\', \'待收货\'].includes(receiptDraft.status)"');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'title="打开到货结果登记窗口"');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'title="打开入库登记窗口"');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'v-else-if="receiptPrimaryAction?.kind === \'post\' && canWriteWarehouse && canPostWarehouse"');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'class="receipt-action-dialog warehouse-action-dialog purchase-receipt-action-dialog"');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', '<h3>本次作业信息</h3>');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', '<h3>本次物料结果</h3>');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', '<h3>备注与附件</h3>');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', '<span>本次到货</span>');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', '搜索具备采购暂存职能的启用仓库');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', '选择实际暂存库位');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'class="quote-fields receipt-overview-fields"');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'receipt-overview-address');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', '<span>内部收货联系人</span>');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', '<span>内部收货电话</span>');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', '<dt>实际到货日期</dt>');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', '<dt>到货登记人</dt>');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'class="receipt-record-grid receipt-record-primary-grid is-arrival"');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'class="receipt-record-grid receipt-record-secondary-grid is-arrival"');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'class="receipt-record-grid receipt-record-primary-grid is-inbound"');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'class="receipt-record-grid receipt-record-secondary-grid is-inbound"');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'class="receipt-record-entry is-arrival"');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'class="receipt-record-entry is-inbound"');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', '<dt>物料</dt>');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', '<dt>入库结果</dt>');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'receiptPrimaryActionLabel');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', "activeReceiptAction === 'primary' ? '处理中' : receiptPrimaryActionLabel");
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', 'submitReceiptActionTitle');
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', ':title="submitReceiptActionTitle"');
  expectIncludes('src/views/WarehouseView.vue', 'partySubtitle: row.sourceDoc,');
  expectIncludes('src/views/WarehouseView.vue', "warehouseSubtitle: isWaitingArrival ? '' : row.location ? inventoryLocationLabel(row.location) : '库位未登记',");
  expectIncludes('src/views/WarehouseView.vue', "warehouseContext: isWaitingArrival ? '计划暂存仓' : '实际暂存',");
  expectIncludes('src/views/WarehouseView.vue', 'const itemQuantity = receiptProductQuantitySummary');
  expectIncludes('src/views/WarehouseView.vue', "owner: isWaitingArrival ? '' : warehouseActorLabel(row.owner, ''),");
  expectExcludes('src/views/WarehouseView.vue', ['partySubtitle: `${row.sourceDoc} · ${row.contact}`']);
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', 'if (!canWriteWarehouse.value) return warehouseReadonlyReason.value;');
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', 'v-if="issueDraft.status !== \'已出库\' && issuePrimaryAction"');
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', ':disabled="isSaving || isIssueActionPending || !issuePrimaryActionAllowed"');
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', ':disabled="isIssueActionPending || isSaving || !canWriteWarehouse || !canPostWarehouse"');
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', '@click="submitPickingResult"');
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', 'submitIssueActionTitle');
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', ':title="submitIssueActionTitle"');
  expectIncludes('src/views/WarehouseOperationEditorView.vue', 'if (!canWriteWarehouse.value) return warehouseReadonlyReason.value;');
  expectIncludes('src/views/WarehouseOperationEditorView.vue', 'v-if="!isFinal && warehouseEditorPrimaryAction"');
  expectIncludes('src/views/WarehouseOperationEditorView.vue', ':disabled="isSaving || isWarehouseActionPending || !canWriteWarehouse || !canPostWarehouse || Boolean(productionMoveBlockReason) || Boolean(warehousePrimaryActionBlockedReason)"');
  expectIncludes('src/views/WarehouseOperationEditorView.vue', ':disabled="isSaving || isWarehouseActionPending || isReadOnly || !canPostWarehouse || !warehouseEditorPrimaryAction || Boolean(productionMoveBlockReason)"');
  expectIncludes('src/views/WarehouseOperationEditorView.vue', 'warehouseEditorPrimaryAction');
  expectIncludes('src/views/WarehouseOperationEditorView.vue', 'primaryActionForStatus');
  expectIncludes('src/views/WarehouseOperationEditorView.vue', "stageList: ['草稿', '待出库', '调拨中', '待入库', '已完成']");
  expectIncludes('src/views/WarehouseOperationEditorView.vue', "stageList: ['待盘点', '盘点中', '待复核', '已完成', '已取消']");
  expectIncludes('src/views/WarehouseOperationEditorView.vue', 'submitWarehouseStocktake');
  expectIncludes('src/views/WarehouseOperationEditorView.vue', "kind: 'submit-stocktake'");
  expectIncludes('src/views/WarehouseOperationEditorView.vue', 'updateWarehouseStatus');
  expectIncludes('src/views/WarehouseOperationEditorView.vue', "kind: 'status'");
  expectIncludes('src/services/api.ts', 'submitWarehouseStocktake');
  expectIncludes('scripts/smoke-api.mjs', 'warehouse view-only account cannot submit stocktake');
  expectIncludes('scripts/smoke-api.mjs', 'warehouse cannot submit stocktake twice');
  expectExcludes('src/views/WarehouseOperationEditorView.vue', [
    "const response = await postWarehouseTransfer(saved.code);\n      documentDraft.value = toDraft(response.transfer)",
    "const response = await completeWarehouseStocktake(saved.code);\n    documentDraft.value = toDraft(response.stocktake)",
  ]);
  for (const view of [
    'src/views/FinanceSalesInvoiceEditorView.vue',
    'src/views/FinancePurchaseInvoiceEditorView.vue',
    'src/views/FinanceReceivableEditorView.vue',
    'src/views/FinancePayableEditorView.vue',
  ]) {
    expectIncludes(view, 'useOperationPermission');
    expectIncludes(view, 'financeSettle');
    expectIncludes(view, 'canSettleFinance');
    expectIncludes(view, 'OperationPermissionBanner');
    expectIncludes(view, 'operationPermissionHint');
    expectIncludes(view, '!canSettleFinance.value ? financeSettleReadonlyReason.value :');
    expectIncludes(view, ':message="operationPermissionHint"');
  }
  expectIncludes('src/components/OperationPermissionBanner.vue', 'operation-permission-banner');
  expectIncludes('src/views/FinanceSalesInvoiceEditorView.vue', 'confirmInvoiceReadonlyReason');
  expectIncludes('src/views/FinanceSalesInvoiceEditorView.vue', 'confirmInvoiceActionTitle');
  expectIncludes('src/views/FinanceSalesInvoiceEditorView.vue', ':title="confirmInvoiceActionTitle"');
  expectIncludes('src/views/FinancePurchaseInvoiceEditorView.vue', 'confirmInvoiceReadonlyReason');
  expectIncludes('src/views/FinancePurchaseInvoiceEditorView.vue', 'confirmInvoiceActionTitle');
  expectIncludes('src/views/FinancePurchaseInvoiceEditorView.vue', ':title="confirmInvoiceActionTitle"');
  expectIncludes('src/views/FinanceReceivableEditorView.vue', 'registerReceiptReadonlyReason');
  expectIncludes('src/views/FinanceReceivableEditorView.vue', 'registerReceiptActionTitle');
  expectIncludes('src/views/FinanceReceivableEditorView.vue', ':title="registerReceiptActionTitle"');
  expectIncludes('src/views/FinancePayableEditorView.vue', 'registerPaymentReadonlyReason');
  expectIncludes('src/views/FinancePayableEditorView.vue', 'registerPaymentActionTitle');
  expectIncludes('src/views/FinancePayableEditorView.vue', ':title="registerPaymentActionTitle"');
});

run('local and aliyun deployment files are present', () => {
  for (const requiredFile of [
    '.env.example',
    'Dockerfile.api',
    'Dockerfile.web',
    'docker-compose.aliyun.yml',
    'deploy/nginx/default.conf',
    'docs/aliyun-deployment.md',
    'shared/permission-matrix.json',
  ]) {
    expectFile(requiredFile);
  }
  expectIncludes('.env.example', 'FILATRIX_API_HOST=0.0.0.0');
  expectIncludes('Dockerfile.api', 'FILATRIX_DATA_FILE=/data/erp-data.json');
  expectIncludes('Dockerfile.api', 'COPY shared ./shared');
  expectIncludes('docker-compose.aliyun.yml', 'FILATRIX_API_HOST: 0.0.0.0');
  expectIncludes('deploy/nginx/default.conf', 'proxy_pass http://filatrix-api:5175/api/;');
});

run('production and quality detail presentation contracts are wired', () => {
  expectIncludes('src/views/QualityDocumentEditorView.vue', 'qualityDetailFactClass(fact, index)');
  expectIncludes('src/views/QualityDocumentEditorView.vue', 'class="quality-fact-link"');
  expectIncludes('src/views/Production2View.vue', "if (nextStep.includes('跟踪')) return '查看工单';");
  expectIncludes('src/views/Production2View.vue', 'v-if="materialRequestDraft.linkedPurchaseRequisition"');
  expectIncludes('src/views/Production2View.vue', "statusColumnTitle: '任务状态'");
  expectIncludes('src/views/Production2View.vue', "label: '异常 / 暂停'");
  expectIncludes('src/views/Production2View.vue', 'showProductionRuntimeLoadState');
  expectIncludes('src/views/Production2View.vue', "title: '生产依据'");
  expectIncludes('src/views/Production2View.vue', "{ label: '配方版本'");
  expectIncludes('src/views/Production2View.vue', "{ label: '工艺版本'");
  expectIncludes('src/views/Production2View.vue', "title: '领退料实绩'");
  expectIncludes('src/views/Production2View.vue', "return hasStarted ? '流转中' : '待开始';");
  expectIncludes('server/index.mjs', 'card.planSnapshot = {');
  expectIncludes('src/views/QualityView.vue', 'qualityStandardUsageHint(row)');
  expectIncludes('src/views/QualityView.vue', "activePage.value === 'incoming' ? '供应商/检验标准'");
  expectIncludes('src/views/Production2View.vue', "createLabel: '临时申请'");
  expectIncludes('src/views/Production2View.vue', '仓库不受理计划申请');
  expectIncludes('server/index.mjs', 'qualityTasks: production.qualityTasks,');
  expectIncludes('server/index.mjs', 'qualityTasks: production.qualityTasks.filter((item) => item.workOrderCode === code),');
  expectIncludes('src/views/Production2View.vue', "'execution-cards': '物料 · 报工 · 质检 · 包装'");
  expectIncludes('src/views/Production2View.vue', 'productionQualityHandoffLabel');
  expectIncludes('src/views/Production2View.vue', 'executionCardQualityHandoffFromRaw');
  expectIncludes('src/views/Production2View.vue', "if (text(raw.node) === '待包装') return '确认包装';");
  expectIncludes('src/views/Production2View.vue', 'qualityTasks?: Production2QualityTask[];');
  expectIncludes('src/views/Production2View.vue', "if (activePage.value === 'quality') auxiliaryLoads.push(loadRuntimeProductionQualityTasks());");
  expectIncludes('server/production-quality-golden-scenarios.mjs', "code: 'PRPT2-260701-001'");
  expectIncludes('server/production-quality-golden-scenarios.mjs', "code: 'QC2-260701-003'");
  expectIncludes('server/production-quality-golden-scenarios.mjs', "code: 'PPK2-260701-001'");
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 312. 生产批次执行投影、质量交接与历史记录完整性（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 286. 生产批次关联质量投影与执行记录合同（2026-08-05）');
  expectIncludes('src/views/Production2View.vue', "searchPlaceholder: '搜索批次、工单、成品、产线、班组'");
  expectIncludes('src/views/Production2View.vue', 'executionCardReadonlyProductIdentity');
  expectIncludes('src/views/Production2View.vue', "{ label: '报工进度', value: `${qty(raw.reportedQty, raw.unit)} / ${qty(raw.planQty, raw.unit)}` }");
  expectIncludes('src/views/Production2View.vue', "title: '工艺执行'");
  expectIncludes('src/views/Production2View.vue', 'production-process-trace-disclosure');
  expectIncludes('src/views/Production2View.vue', "if (activePage.value === 'execution-cards') return executionCardOperationalSort(a, b);");
  expectIncludes('src/views/Production2View.vue', 'function executionCardScheduleAttention(raw: AnyRecord | undefined)');
  expectIncludes('src/views/Production2View.vue', "return `超计划 ${Math.abs(daysUntil)} 天`;");
  expectIncludes('src/views/Production2View.vue', "? '现场关注优先'");
  expectIncludes('src/views/Production2View.vue', "title: '物料储备校验'");
  expectExcludes('src/views/Production2View.vue', ["title: '物料齐套校验'", "return '查看物料齐套';"]);
  expectExcludes('src/views/Production2View.vue', ["{ label: '批次计划', value: qty(raw.planQty, raw.unit) }"]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 313. 生产批次当前决策层级与详情降噪（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 287. 生产批次详情投影与零值可见性合同（2026-08-05）');
});

run('system permissions keep explicit business module ownership and current production wording', () => {
  const permissionMatrix = 'shared/permission-matrix.json';
  expectIncludes(permissionMatrix, '"module": "生产"');
  expectIncludes(permissionMatrix, '"module": "质检"');
  expectIncludes(permissionMatrix, '"module": "设备"');
  expectIncludes(permissionMatrix, '生产任务、备料申请、生产工单、生产批次');
  expectIncludes(permissionMatrix, '不包含质检判定和仓库过账');
  expectIncludes('src/views/ModuleView.vue', "const permissionGroupOrder = ['销售', '采购', '仓库', '生产', '质检', '设备', '基础资料', '系统', '其他']");
  expectIncludes('server/index.mjs', 'const systemPermissionSchemaVersion = 11;');
  expectIncludes('src/views/Production2View.vue', '生产任务有新增采购缺口时从任务发起');
});

run('home todo boards respect disabled menus before loading business data', () => {
  const home = 'src/views/HomeView.vue';
  expectIncludes(home, 'function todoPathEnabled(path: string)');
  expectIncludes(home, "!['disabled-menu', 'missing-permission'].includes(issue.reason)");
  expectIncludes(home, "loadTodoList('/sales/quotes', listSalesQuotes)");
  expectIncludes(home, "loadTodoList('/purchase/requisitions', listPurchaseRequisitions)");
  expectIncludes(home, "loadTodoList('/quality/incoming', loadIncomingQualityRows)");
  expectIncludes(home, 'enabledTodoItems([');
  expectIncludes(home, 'await Promise.all([session.loadUserFromAccounts(), navigation.loadMenus()]);');
});

run('production material requests preserve source, stock, and material identity contracts', () => {
  expectIncludes('server/index.mjs', "function productionTaskCurrentProcurementGapLines(data, sourceTask, inputLines = [], excludeRequestCode = '')");
  expectIncludes('server/index.mjs', 'const effectiveRequestedQty = production.materialRequests');
  expectIncludes('server/index.mjs', "throw requestError(400, '任务缺口补料必须从已确认的生产任务发起。');");
  expectIncludes('server/index.mjs', 'function hydrateProductionMaterialRequestIdentities(data)');
  expectIncludes('src/views/Production2View.vue', "{{ materialRequestDraft.sourceTaskCode ? '任务总需' : '申请数量' }}");
  expectIncludes('src/views/Production2View.vue', ':model="line.model"');
  expectIncludes('src/views/Production2View.vue', "materialRequestDraft.value.expectedDate < materialRequestDraft.value.requestDate");
  expectIncludes('src/views/Production2View.vue', `<template v-if="materialRequestDraft.status === '草稿'">待评估</template>`);
  expectIncludes('src/views/Production2View.vue', "['recipes', 'process-templates', 'material-requests'].includes(activePage)");
  expectIncludes('src/views/Production2View.vue', "if (/库存可满足|已转采购|完成|关闭/.test(value)) return '已完成';");
  expectIncludes('server/index.mjs', "throw requestError(400, '独立备料申请的需求日期不能早于申请日期。');");
  expectIncludes('server/index.mjs', "throw requestError(400, '备料明细必须填写具体用途。');");
  expectExcludes('src/views/Production2View.vue', ['materialRequestLineHasDuplicate']);
  expectIncludes('scripts/seed-production-material-request-demo.mjs', "code: 'PMR2-260805-902'");
  expectIncludes('scripts/seed-production-material-request-demo.mjs', "code: 'PMR2-260805-905'");
  expectIncludes('scripts/seed-production-material-request-demo.mjs', '同一外箱用于两类用途');
});

run('production after-sales repair keeps the repair-to-reinspection handoff explicit', () => {
  expectIncludes('server/index.mjs', "caseIssueType: caseRecord.issueType || ''");
  expectIncludes('server/index.mjs', "disposition: predecessor?.disposition || ''");
  expectIncludes('src/views/AfterSalesExecutionListView.vue', "taskLabel: '返修要求'");
  expectIncludes('src/views/AfterSalesExecutionListView.vue', "searchPlaceholder: '搜索任务、售后单、订单、客户、问题、物料'");
  expectIncludes('src/views/AfterSalesExecutionListView.vue', "task.disposition || '已返修待复检'");
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', "production: '问题类型'");
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', '全部任务数量将交由返修品复检');
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', "isProductionTask ? '返修物料确认' : isQualityTask ? '检验物料确认' : '本次物料结果'");
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', '<dt>完成后状态</dt><dd>待复检</dd>');
  expectExcludes('src/views/AfterSalesExecutionTaskView.vue', ["label: '前置条件'"]);
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', "return '质检冻结 · 返修中';");
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', '返修记录号或返修备注至少填写一项');
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', 'after-sales-editor after-sales-task-page is-detail-view');
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', '.after-sales-task-side .after-sales-context-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }');
  expectIncludes('src/views/AfterSalesExecutionListView.vue', '<small>下一步</small>');
  expectIncludes('src/views/AfterSalesExecutionListView.vue', ':show-amount-sort="false"');
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', '任务已开始，完成后请${executionActionLabel.value}');
  expectExcludes('src/views/AfterSalesExecutionTaskView.vue', ['await openExecutionDialog();']);
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', ':min="minimumActualDate || undefined"');
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', 'const productionSupplementHasError = computed');
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', '(isProductionTask || isQualityTask) && !supplementHasError');
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', '请填写返修记录号或返修备注');
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', ':class="statusPresentationClass(recordResultLabel(line))"');
});

run('production workbench canonicalizes operation jobs and keeps due risk visible', () => {
  expectIncludes('server/index.mjs', 'function canonicalExecutionCardOperationJobs(operationJobs)');
  expectIncludes('server/index.mjs', 'card.operationJobs = canonicalExecutionCardOperationJobs(card.operationJobs);');
  expectIncludes('server/index.mjs', 'ensureExecutionCardOperationJobs(data, card).filter((job) => (');
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', 'function operationJobBelongsOnLine(job: Production2OperationJob, card: Production2ExecutionCard)');
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', '&& operationJobBelongsOnLine(item.job, item.card)');
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', 'function scheduleDueRisk(dueDate: string)');
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', 'class="schedule-due-risk"');
  expectIncludes('src/styles/main.css', '.schedule-pool-card .schedule-due-risk.is-overdue {');
  expectIncludes('scripts/smoke-production-lines.mjs', 'duplicate operation-job canonicalization failed');
  expectExcludes('server/data/erp-data.json', ['OP-SMOKE', 'Smoke 二号复绕线']);
});

run('production workbench separates rewind quantities and hands over unfinished operations', () => {
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', 'const shiftHandoverItems = computed<ShiftHandoverItem[]>(() => {');
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', 'const shiftHandoverExecutionCards = computed(() => {');
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', "{ label: '成品计划', value: formatQty(Number(card?.planQty || 0), card?.unit || '卷') }");
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', "{ label: '本次处理重量', value: formatQty(queuedOperationJob.plannedQty, queuedOperationJob.plannedUnit) }");
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', '未完成现场事项 <strong>{{ shiftHandoverItems.length }} 项</strong>');
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', "留给下个班次的备注{{ handoverNoteRequired ? '（必填）' : '' }}");
  expectIncludes('src/views/ProductionWorkbenchDemoView.vue', 'class="shift-receive-context"');
  expectIncludes('server/index.mjs', "throw requestError(400, '存在未完成现场事项或本班异常时，交班备注至少填写 4 个字。');");
  expectIncludes('scripts/smoke-flow.mjs', "shiftHandover.handover.activeCards[0].operationStatus === '暂停'");
});

run('quality workbench includes every quality-owned queue and preserves source evidence', () => {
  expectIncludes('src/views/QualityWorkbenchView.vue', "listAfterSalesExecutionTasks('quality')");
  expectIncludes('src/views/QualityWorkbenchView.vue', '<h2>售后检验待办</h2>');
  expectIncludes('src/views/QualityWorkbenchView.vue', "runtimeQualityClosureRows(qualityPatrolRows, patrolRecords, 'patrol')");
  expectIncludes('src/views/QualityWorkbenchView.vue', "label: '巡检与不良'");
  expectIncludes('src/data/quality.ts', 'function qualityTaskCodeDate(code: string)');
  expectIncludes('src/views/QualityDocumentEditorView.vue', "if (value.startsWith('WR-')) return `/warehouse/purchase-receipts/${encodeURIComponent(value)}`;");
  expectIncludes('src/views/QualityDocumentEditorView.vue', 'qualityQuantityMapTotal(totals.concession) > 0.0001');
  expectIncludes('src/views/QualityDocumentEditorView.vue', 'const seed = sourceRecord.value?.code === record.code');
  expectIncludes('server/index.mjs', "!['待分配', '待指定', '待确认'].includes(sourceInspector)");
  expectIncludes('server/index.mjs', 'inspector: decision.actor,');
  expectIncludes('src/views/QualityWorkbenchView.vue', 'function qualityRecordFreezeBatchKeys(row: QualityRecord');
  expectIncludes('src/views/QualityWorkbenchView.vue', '.flatMap((row) => row.freezeBatchKeys.length ? row.freezeBatchKeys');
  expectIncludes('src/views/QualityWorkbenchView.vue', 'function pendingDecisionQuantitySummary(row: QualityRecord)');
  expectIncludes('src/views/QualityWorkbenchView.vue', "if (scope === 'judgement') return row.pendingJudgement;");
  expectIncludes('src/views/QualityView.vue', "incoming: { status: '当前阶段'");
  expectIncludes('src/views/QualityView.vue', "return qualityStageIsRelevantValue(conclusion, normalizedStage) ? normalizedStage : '待检验判定';");
  expectIncludes('src/views/QualityView.vue', "qualityListStageIsRelevant(row) ? qualityListStageStatus(row) : '—'");
  expectIncludes('src/views/QualityView.vue', 'function qualityListFilterStages(row: QualityListRow)');
  expectIncludes('src/views/QualityView.vue', 'pending ? `未判定 ${pending}`');
  expectIncludes('src/views/QualityView.vue', "if (activePage.value === 'production') return '受检物料/批次';");
  expectIncludes('src/views/QualityView.vue', "row.productionLine ?? (page === 'defects' ? '' : row.contact)");
  expectIncludes('src/views/QualityDocumentEditorView.vue', "if (currentKind.value === 'production') return '受检物料';");
  expectIncludes('src/views/QualityDocumentEditorView.vue', "&& ['待检验', '待判定', '待质检'].includes(currentStatus.value)");
  expectIncludes('src/views/QualityDocumentEditorView.vue', "if (isEdit.value && !task.decidedAt && ['待检', '待检验', '待判定'].includes(task.status))");
  expectIncludes('src/views/QualityDocumentEditorView.vue', "currentKind.value === 'patrol' && draft.contact");
  expectIncludes('src/views/QualityDocumentEditorView.vue', 'const runtimeIncomingQualityReferenceCodes = ref<Set<string>>(new Set());');
  expectIncludes('src/views/QualityDocumentEditorView.vue', 'const runtimeProductionQualityReferenceCodes = ref<Set<string>>(new Set());');
  expectIncludes('src/views/QualityDocumentEditorView.vue', 'listIncomingQualityRecords(),');
  expectIncludes('src/views/QualityDocumentEditorView.vue', 'listProductionQualityTasks(),');
  expectIncludes('src/views/QualityDocumentEditorView.vue', 'return runtimeIncomingQualityReferenceCodes.value.has(value)');
  expectIncludes('src/views/QualityDocumentEditorView.vue', 'return runtimeProductionQualityReferenceCodes.value.has(value)');
  expectExcludes('src/views/QualityDocumentEditorView.vue', ["'质检仓'"]);
  expectExcludes('src/views/QualityDocumentEditorView.vue', [
    'return incomingQualityRows.some((row) => row.code === value)',
    'productionQualityRows.some((row) => row.code === value)',
  ]);
  expectExcludes('src/data/quality.ts', ["warehouse: '质检仓 QC-01'", "warehouse: '质检仓 QC-02'"]);
  expectIncludes('server/index.mjs', '|| receiptProduct?.stagingBatch');
});

run('package scripts include smoke checks and build', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert(packageJson.scripts?.['smoke:api'], 'smoke:api script is missing');
  assert(packageJson.scripts?.['smoke:flow'], 'smoke:flow script is missing');
  assert(packageJson.scripts?.['seed:production-material-request-demo'], 'seed:production-material-request-demo script is missing');
  assert(packageJson.scripts?.build, 'build script is missing');
});

if (failed.length) {
  console.error('Frontend smoke failed');
  failed.forEach((line) => console.error(`- ${line}`));
  process.exitCode = 1;
} else {
  console.log('Frontend smoke passed');
  passed.forEach((line) => console.log(`- ${line}`));
}
