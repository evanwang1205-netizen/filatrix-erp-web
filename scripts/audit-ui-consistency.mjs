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

function expectIncludesAll(relativePath, tokens) {
  for (const token of tokens) expectIncludes(relativePath, token);
}

function expectExcludes(relativePath, tokens) {
  const content = read(relativePath);
  for (const token of tokens) {
    assert(!content.includes(token), `${relativePath} should not include ${token}`);
  }
}

function expectOrdered(relativePath, tokens, label = 'token order') {
  const content = read(relativePath);
  let cursor = -1;
  for (const token of tokens) {
    const next = content.indexOf(token, cursor + 1);
    assert(next !== -1, `${relativePath} should include ${token} for ${label}`);
    assert(next > cursor, `${relativePath} should keep ${label}: ${tokens.join(' -> ')}`);
    cursor = next;
  }
}

function expectActionTitles(relativePath) {
  const content = read(relativePath);
  const actionTags = content.match(/<(?:button|RouterLink|a)\b[^>]*class="[^"]*(?:primary-action|secondary-action)[^"]*"[^>]*>/gs) ?? [];
  for (const tag of actionTags) {
    assert(
      tag.includes('title=') || tag.includes(':title='),
      `${relativePath} action should expose a hover title: ${tag.replace(/\s+/g, ' ').trim()}`,
    );
  }
}

function expectBackLinkTitles(relativePath) {
  const content = read(relativePath);
  const backLinks = content.match(/<RouterLink\b[^>]*class="back-link"[^>]*>/gs) ?? [];
  for (const tag of backLinks) {
    assert(
      tag.includes('title=') || tag.includes(':title='),
      `${relativePath} back link should expose a hover title: ${tag.replace(/\s+/g, ' ').trim()}`,
    );
  }
}

function expectClickableListTitles(relativePath) {
  const lines = read(relativePath).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*<(?:RouterLink|button|article|div)\b/.test(lines[index])) continue;

    let block = lines[index];
    let cursor = index;
    while (cursor < lines.length - 1 && !/>\s*$/.test(lines[cursor])) {
      cursor += 1;
      block += `\n${lines[cursor]}`;
    }

    const isClickableBlock =
      /order-status-link|is-clickable|class="quote-card(?:\s|"|')|class="quote-card master-card/.test(block) ||
      /:role="supportsDetailPage \? 'button'/.test(block);
    const isStaticArticle = /^\s*<article/.test(lines[index]) && !/is-clickable|:role=/.test(block);
    if (isClickableBlock && !isStaticArticle) {
      assert(
        /\s:?title=/.test(block),
        `${relativePath} clickable list block should expose a hover title near line ${index + 1}: ${block.replace(/\s+/g, ' ').trim()}`,
      );
    }

    index = cursor;
  }
}

function expectNoSummaryLogSection(relativePath) {
  const lines = read(relativePath).split(/\r?\n/);
  const logSectionWords = ['日志', '流转记录', '操作记录'];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/<section\b[^>]*summary-section/.test(lines[index])) continue;
    const block = lines.slice(index, Math.min(lines.length, index + 90)).join('\n');
    const heading = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, '') ?? '';
    assert(
      !logSectionWords.some((word) => heading.includes(word)),
      `${relativePath} should keep logs in FlowRecordPanel, not duplicate them in the summary panel near line ${index + 1}`,
    );
  }
}

function expectFileUploadControls(relativePath) {
  const content = read(relativePath);
  const controls = content.match(/<label\b[^>]*file-upload-button[\s\S]*?<\/label>/g) ?? [];
  for (const control of controls) {
    const openTag = control.match(/<label\b[\s\S]*?>/)?.[0] ?? '';
    const inputTag = control.match(/<input\b[^>]*type="file"[^>]*>/)?.[0] ?? '';
    const hiddenWhenReadonly = /v-if="![^"]*ReadOnly"/.test(openTag);
    assert(/\s:?title=/.test(openTag), `${relativePath} upload label should expose a hover title`);
    assert(
      !/:title\s*=\s*"[^"]*ReadonlyReason(?:\.value)?\s*"/.test(openTag),
      `${relativePath} upload label title should include an enabled-state upload hint, not only a readonly reason`,
    );
    assert(inputTag, `${relativePath} upload label should contain a file input`);
    if (!hiddenWhenReadonly) {
      assert(openTag.includes('aria-disabled='), `${relativePath} upload label should expose aria-disabled`);
      assert(/\s:?disabled=|\sdisabled\b/.test(inputTag), `${relativePath} file input should mirror the disabled state`);
    }
  }
}

function blockAfter(relativePath, startToken, endToken, fallbackLength = 9000) {
  const content = read(relativePath);
  const start = content.indexOf(startToken);
  assert(start !== -1, `${relativePath} should include ${startToken}`);
  const end = content.indexOf(endToken, start + startToken.length);
  if (end === -1) return content.slice(start, start + fallbackLength);
  return content.slice(start, end + endToken.length);
}

const listViews = [
  { name: 'sales', file: 'src/views/SalesView.vue', businessFlow: true },
  { name: 'purchase', file: 'src/views/PurchaseView.vue', businessFlow: true },
  { name: 'warehouse', file: 'src/views/WarehouseView.vue', businessFlow: true },
  { name: 'finance', file: 'src/views/FinanceView.vue', businessFlow: true },
  { name: 'production', file: 'src/views/Production2View.vue', businessFlow: true },
  { name: 'quality', file: 'src/views/QualityView.vue', businessFlow: true },
  { name: 'master data', file: 'src/views/MasterDataView.vue', businessFlow: false },
];

const businessDetailViews = [
  {
    name: 'sales quote',
    file: 'src/views/SalesQuoteEditorView.vue',
    readonlyGuard: 'if (isReadOnly.value)',
    flowOpen: ':open="showFlowRecords"',
    floatToken: 'PinReferenceButton',
  },
  {
    name: 'sales order',
    file: 'src/views/SalesOrderEditorView.vue',
    readonlyGuard: 'if (isReadOnly.value)',
    flowOpen: ':open="showFlowRecords"',
    floatToken: 'PanelRightOpen',
  },
  {
    name: 'sales outbound request',
    file: 'src/views/SalesOutboundRequestView.vue',
    readonlyGuard: 'if (isReadOnly.value)',
    flowOpen: ':open="showFlowRecords"',
    floatToken: 'PinReferenceButton',
  },
  {
    name: 'sales and purchase after-sales',
    file: 'src/views/AfterSalesDocumentView.vue',
    readonlyGuard: 'if (isAfterSalesReadOnly.value)',
    flowOpen: ':open="showFlowRecords"',
    floatToken: 'PinReferenceButton',
  },
  {
    name: 'purchase requisition',
    file: 'src/views/PurchaseRequisitionEditorView.vue',
    readonlyGuard: 'if (isReadOnly.value)',
    flowOpen: ':open="showFlowRecords"',
    floatToken: 'PinReferenceButton',
  },
  {
    name: 'purchase order',
    file: 'src/views/PurchaseOrderEditorView.vue',
    readonlyGuard: 'if (isReadOnly.value)',
    flowOpen: ':open="showFlowRecords"',
    floatToken: 'PinReferenceButton',
  },
  {
    name: 'warehouse purchase receipt',
    file: 'src/views/WarehousePurchaseReceiptEditorView.vue',
    readonlyGuard: 'if (isReadOnly.value)',
    flowOpen: ':open="showFlowRecords"',
    floatToken: 'PinReferenceButton',
  },
  {
    name: 'warehouse sales issue',
    file: 'src/views/WarehouseSalesIssueEditorView.vue',
    readonlyGuard: 'if (isReadOnly.value)',
    flowOpen: ':open="showFlowRecords"',
    floatToken: 'PinReferenceButton',
  },
  {
    name: 'warehouse operation',
    file: 'src/views/WarehouseOperationEditorView.vue',
    readonlyGuard: 'if (isReadOnly.value)',
    flowOpen: ':open="showFlowRecords"',
    floatToken: 'PinReferenceButton',
  },
  {
    name: 'production document',
    file: 'src/views/Production2View.vue',
    readonlyGuard: 'if (!isProductionEditableDocument.value)',
    flowOpen: ':open="showProductionFlowRecords"',
    floatToken: 'PinReferenceButton',
  },
  {
    name: 'quality document',
    file: 'src/views/QualityDocumentEditorView.vue',
    readonlyGuard: 'if (isQualityReadOnly.value)',
    flowOpen: ':open="showFlowRecords"',
    floatToken: 'PinReferenceButton',
  },
];

const masterEditorViews = [
  'src/views/MasterCustomerEditorView.vue',
  'src/views/MasterSupplierEditorView.vue',
  'src/views/MasterMaterialEditorView.vue',
  'src/views/MasterWarehouseEditorView.vue',
  'src/views/MasterSimpleEditorView.vue',
];

const financeEditorViews = [
  'src/views/FinanceSalesInvoiceEditorView.vue',
  'src/views/FinancePurchaseInvoiceEditorView.vue',
  'src/views/FinanceReceivableEditorView.vue',
  'src/views/FinancePayableEditorView.vue',
];

run('seven module list pages use shared search, sort, filter, export, empty and card chrome', () => {
  expectIncludesAll('src/components/BusinessListToolbar.vue', [
    'aria-label="搜索当前列表"',
    'title="搜索当前列表"',
    'title="排序当前列表"',
    ':title="activeFilterCount ? `筛选当前列表，已选 ${activeFilterCount} 项` : \'筛选当前列表\'"',
    'title="导出当前列表"',
    'title="按当前搜索、筛选和排序导出"',
    'aria-haspopup="menu"',
    'aria-haspopup="dialog"',
    'aria-controls="business-list-sort-menu"',
    'aria-controls="business-list-filter-popover"',
    'aria-controls="business-list-export-menu"',
    ':aria-expanded=',
    '@keydown.esc.stop="closeOpenMenu"',
    'role="menu"',
    'role="menuitem"',
    'aria-labelledby="business-list-sort-title"',
    'aria-labelledby="business-list-export-title"',
  ]);
  expectIncludesAll('src/components/SalesFilterPopover.vue', [
    'id="business-list-filter-popover"',
    'role="dialog"',
    'aria-modal="false"',
    'aria-labelledby="business-list-filter-title"',
    'id="business-list-filter-title"',
    "field.control === 'search'",
    ':placeholder="`输入${field.label}关键词`"',
    'title="清空当前筛选条件"',
    'title="应用当前筛选条件"',
  ]);
  expectIncludesAll('src/views/SalesView.vue', [
    "fields.push({ key: 'party', label: labels.party, options: [], control: 'search' });",
    "fields.push({ key: 'owner', label: labels.owner, options: [], control: 'search' });",
    'function matchesKeywordFilter(values: Array<string | undefined>, filter: string)',
    '[row.product, row.materialCode, row.model, row.spec]',
  ]);
  expectExcludes('src/views/SalesView.vue', [
    'filterPartyOptions',
    'filterOwnerOptions',
  ]);

  for (const { file } of listViews) {
    expectFile(file);
    expectIncludesAll(file, [
      'BusinessListToolbar',
      'class="primary-action',
      '@sort=',
      '@toggle-menu=',
      '@export-rows=',
      '@clear-filters=',
      '@apply-filters=',
      'list-empty-state',
      'empty-state-action',
      'clearListConstraints',
      'quote-card-list',
      'table-footer',
    ]);
    if (!['src/views/PurchaseView.vue', 'src/views/Production2View.vue'].includes(file)) expectIncludes(file, 'pager');
    expectIncludesAll(file, ['PageTopbarPortal', '<template #actions>']);
    expectExcludes(file, ['table-title quote-title']);
  }
  expectIncludesAll('src/styles/main.css', ['.list-empty-state .empty-state-action', 'justify-self: start']);
  expectIncludesAll('src/styles/main.css', [
    '.list-search:focus-within',
    '.primary-action:focus-visible',
    '.toolbar-popover button:focus-visible',
    '.order-more-menu button:focus-visible',
    '.order-more-menu::before',
  ]);
  expectIncludesAll('src/views/Production2View.vue', ['已清空筛选条件', '已应用当前筛选条件']);
});

run('business list pages keep row/status-column hover, focus, and next-action linkage', () => {
  for (const { name, file, businessFlow } of listViews) {
    expectIncludesAll(file, ['is-row-highlighted', '@pointerenter', '@pointerleave', '@mouseenter', '@mouseleave', '@focus', '@blur']);

    if (businessFlow) {
      expectIncludesAll(file, ['quote-status-column', 'order-status-link', 'order-list-row']);
      const content = read(file);
      assert(
        content.includes('下一步') || content.includes('productionStatusActionPrefix') || content.includes('productionCardActionLabel(row)'),
        `${name} business list should expose next-step text in the status column`,
      );
    } else {
      expectIncludesAll(file, ['supportsDetailPage', 'openSupportedDetail', '@keydown.enter', '@keydown.space.prevent']);
      expectExcludes(file, ['quote-action-column', 'more-actions-menu']);
    }
  }
});

run('mobile list cards keep status, next-action, and detail navigation parity', () => {
  expectIncludesAll('src/styles/main.css', [
    '.quote-card-list',
    '.quote-card:hover',
    '.quote-card:focus-visible',
    '.quote-card-meta',
  ]);

  const sales = read('src/views/SalesView.vue');
  assert(
    /quote-card-meta[\s\S]*salesQuoteNextStep\(row\)/.test(sales),
    'sales quote mobile cards should include the quote next step just like the status column',
  );
  expectIncludesAll('src/views/SalesView.vue', [
    'orderFulfillmentSnapshot(row).delivery',
    'salesOutboundNextStep(row.status)',
    '<span>下一步：{{ row.nextStep }}</span>',
    'quote-card-head',
    'mini-status',
  ]);
  expectIncludesAll('src/views/PurchaseView.vue', [
    'requisitionNextStep(row.status, row.conversionFacts)',
    'purchaseOrderNextStep(row)',
    '<span>下一步：{{ row.nextStep }}</span>',
    'quote-card-head',
    'mini-status',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    '<span>当前待办：{{ warehouseNextStep(row) }}</span>',
    'quote-card-head',
    'mini-status',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    '<strong>{{ productionStatusActionPrefix }}：{{ productionDisplayTerm(row.nextStep) }}</strong>',
    'quote-card-head',
    'mini-status',
  ]);
  expectIncludesAll('src/views/QualityView.vue', [
    '<span v-if="showRowCurrentAction(row)">{{ rowNextAction(row) }}</span>',
    'quote-card-head',
    'mini-status',
  ]);
  expectIncludesAll('src/views/MasterDataView.vue', [
    'quote-card master-card',
    ':role="supportsDetailPage ? \'button\' : undefined"',
    '@keydown.enter="openSupportedDetail(row)"',
    '@keydown.space.prevent="openSupportedDetail(row)"',
    'mini-status',
  ]);
});

run('list create buttons use short labels and avoid long noisy document names', () => {
  const forbidden = [
    '新建生产任务',
    '新建生产工单',
    '新建销售订单',
    '新建采购申请',
    '新建采购订单',
    '新建质检任务',
  ];
  for (const { file } of listViews) {
    const content = read(file);
    const labelBlock = content.includes('createButtonLabels')
      ? blockAfter(file, 'createButtonLabels', '};', 1400)
      : content.includes('createLabel:')
        ? blockAfter(file, 'createLabel:', 'searchPlaceholder', 1400)
        : content;
    for (const label of forbidden) {
      assert(!labelBlock.includes(label), `${file} should not hard-code long create button label ${label}`);
    }
  }
});

run('list create and empty-state actions expose complete hover titles', () => {
  const createTitleTokens = new Map([
    ['src/views/SalesView.vue', ':title="`新建${pageTitle}`"'],
    ['src/views/PurchaseView.vue', ':title="`新建${pageTitle}`"'],
    ['src/views/WarehouseView.vue', ':title="`新建${pageTitle}`"'],
    ['src/views/FinanceView.vue', ':title="`新建${pageTitle}`"'],
    ['src/views/Production2View.vue', ':title="productionListCreateTitle"'],
    ['src/views/QualityView.vue', ':title="`新建${pageTitle}`"'],
    ['src/views/MasterDataView.vue', ':title="masterDataReadonlyReason || `新建${pageTitle}`"'],
  ]);

  for (const { file } of listViews) {
    expectIncludes(file, createTitleTokens.get(file));
    expectIncludes(file, 'title="清空搜索和筛选条件"');
    if (!['src/views/PurchaseView.vue', 'src/views/Production2View.vue'].includes(file)) {
      expectIncludes(file, 'title="已经是第一页"');
      expectIncludes(file, 'title="已经是最后一页"');
    }
  }
  expectExcludes('src/views/Production2View.vue', [
    'class="pager"',
    'title="当前第 1 页"',
    'title="已经是第一页"',
    'title="已经是最后一页"',
  ]);
});

run('production planning forms keep business owners separate from authenticated actors', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    "import { useSessionStore } from '../stores/session';",
    'ownerEmployeeCode: currentPerson.employeeCode',
    'requesterEmployeeCode: currentPerson.employeeCode',
    'kind="production-document-owner"',
    'title="由当前登录账号所属部门带入"',
    'title="由当前登录账号带入，提交后冻结"',
    ':value="materialRequestDraft.department"',
    ':value="materialRequestDraft.requester"',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    "owner: '张三'",
    "requester: '张三'",
    "draft.owner = '张三'",
    'v-model="materialRequestDraft.department"',
    'v-model="materialRequestDraft.requester"',
  ]);
  expectIncludesAll('server/index.mjs', [
    "kind === 'production-document-owner'",
    "employeeHasActiveRole(data, employee, 'ROLE-PRODUCTION')",
    'function hydrateProductionPlanningOwners(data)',
    'const migratedProductionPlanningOwners = hydrateProductionPlanningOwners(data);',
    'requesterEmployeeCode: employee.code',
    'const actorAccount = activeAccountForRequest(req, data);',
    'frozenBy: actorAccount?.name || \'系统\'',
  ]);
  expectIncludes('shared/permission-matrix.json', '"PERM-PRODUCTION-OPERATE"');
});

run('seven module primary and secondary action controls expose hover titles', () => {
  const actionFiles = [
    ...listViews.map(({ file }) => file),
    ...businessDetailViews.map(({ file }) => file),
    ...financeEditorViews,
    ...masterEditorViews,
  ];
  for (const file of [...new Set(actionFiles)]) {
    expectActionTitles(file);
  }
});

run('business and master detail back links expose hover titles', () => {
  for (const file of [...new Set([...businessDetailViews.map(({ file }) => file), ...financeEditorViews, ...masterEditorViews])]) {
    expectBackLinkTitles(file);
  }
});

run('detail primary action hover titles explain the flow consequence', () => {
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    '锁定当前采购内容并进入到货、质检和入库跟进',
    '提交${documentTitle.value}变更，保存后返回详情并保留变更记录',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    'const workOrderReadonlyRecipe = computed(() => {\n  void productionDataRevision.value;',
    'const workOrderReadonlyProcess = computed(() => {\n  void productionDataRevision.value;',
  ]);
  expectIncludes('src/views/WarehousePurchaseReceiptEditorView.vue', '${receiptPrimaryAction.value.label}：${receiptPrimaryAction.value.message}');
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', '${issuePrimaryAction.value.label}：${issuePrimaryAction.value.message}');
  expectIncludes('src/views/WarehouseOperationEditorView.vue', '${warehouseEditorPrimaryAction.value.label}：${warehouseEditorPrimaryAction.value.message}');
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    '${primaryAction.value.label}：${primaryAction.value.remark}',
    '提交${currentConfig.value.title}，进入下一流程节点并保留检验记录',
  ]);
});

run('clickable list rows, status cells, and cards expose hover titles', () => {
  for (const { file } of listViews) {
    expectClickableListTitles(file);
  }
  for (const file of [
    'src/views/SalesView.vue',
    'src/views/PurchaseView.vue',
    'src/views/WarehouseView.vue',
    'src/views/Production2View.vue',
    'src/views/QualityView.vue',
  ]) {
    expectIncludes(file, 'order-status-link');
    const content = read(file);
    const statusTags = content.match(/<(?:RouterLink|button)\b[^>]*order-status-link[^>]*>/gs) ?? [];
    assert(statusTags.length > 0, `${file} should include list status cells`);
    for (const tag of statusTags) {
      assert(/\s:?title=/.test(tag), `${file} status cell should expose a hover title: ${tag.replace(/\s+/g, ' ').trim()}`);
    }
  }
  expectIncludes('src/views/Production2View.vue', 'productionStatusActionPrefix');
  expectIncludes('src/views/MasterDataView.vue', 'supportsDetailPage ? `');
});

run('business detail pages keep the common top action rail and More menu behavior', () => {
  for (const { file, floatToken } of businessDetailViews) {
    const content = read(file);
    const usesPdfAction = [
      'src/views/SalesQuoteEditorView.vue',
      'src/views/SalesOrderEditorView.vue',
      'src/views/PurchaseOrderEditorView.vue',
    ].includes(file);
    const hasNoOutputAction = [
      'src/views/AfterSalesDocumentView.vue',
      'src/views/PurchaseRequisitionEditorView.vue',
      'src/views/WarehousePurchaseReceiptEditorView.vue',
      'src/views/WarehouseOperationEditorView.vue',
      'src/views/WarehouseSalesIssueEditorView.vue',
      'src/views/Production2View.vue',
      'src/views/QualityDocumentEditorView.vue',
    ].includes(file);
    const outputIcon = usesPdfAction ? 'FileDown' : 'Printer';
    const outputTitle = file === 'src/views/SalesOrderEditorView.vue'
      ? '预览销售订单，可打印或保存为 PDF'
      : file === 'src/views/SalesQuoteEditorView.vue'
        ? '预览报价单，可打印或保存为 PDF'
        : file === 'src/views/PurchaseOrderEditorView.vue'
          ? '预览采购订单，可打印或保存为 PDF'
          : '打印当前';
    assert(
      content.includes('PageTopbarPortal') || content.includes('class="quote-editor-actions"'),
      `${file} should use PageTopbarPortal or the legacy quote-editor-actions rail`,
    );
    const requiredTokens = [
      floatToken,
      'FileText',
      'order-more-menu',
      'title="更多操作"',
      'aria-haspopup="menu"',
      'aria-controls="detail-more-menu"',
      ':aria-expanded=',
      'id="detail-more-menu"',
      'role="menu"',
      'role="menuitem"',
      '@keydown.esc.stop',
      'class="primary-action',
    ];
    if (file !== 'src/views/QualityDocumentEditorView.vue') requiredTokens.push('danger-option');
    if (!hasNoOutputAction) requiredTokens.push(outputIcon, outputTitle);
    expectIncludesAll(file, requiredTokens);
    if (hasNoOutputAction) expectExcludes(file, ['Printer', '打印当前', 'PDF']);
    expectOrdered(
      file,
      hasNoOutputAction ? [floatToken, 'FileText'] : [floatToken, outputIcon, 'FileText'],
      'detail utility action order',
    );
    expectOrdered(file, ['FileText', 'order-more-menu'], 'log before More menu');
  }
});

run('warehouse list and document actions stay in the shared application topbar', () => {
  expectIncludesAll('src/views/WarehouseView.vue', [
    'PageTopbarPortal',
    '<template #actions>',
    ':to="createButtonPath"',
  ]);

  for (const file of [
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'PageTopbarPortal',
      '<template #context>',
      'class="topbar-back-action"',
      'class="topbar-context-title"',
      '<template #actions>',
      '<template #fallback>',
    ]);
    expectExcludes(file, [
      'class="quote-editor-actions"',
      'class="back-link"',
      'FileDown',
    ]);
  }
});

run('warehouse lists keep pending work visible and table rows aligned', () => {
  expectIncludesAll('src/views/WarehouseView.vue', [
    "待到货: 3",
    "已到货: 4",
    "statusDifference || compareDate(a, b, 'desc')",
    "activeOperationPage.value || ['inventory', 'inventoryAlerts'].includes(activePage.value) ? 'status' : 'newest'",
    'return products.length > 1 ? `${first.name} 等 ${products.length} 项` : first.name;',
    ':title="[row.itemTitle, row.itemSubtitle, row.itemQuantity].filter(Boolean).join(\' · \')"',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.warehouse-operation-table .product-summary strong,',
    '.warehouse-operation-list-shell .quote-status-column',
    '.warehouse-operation-list-shell.sales-issue-status-shell .quote-status-column,',
  ]);

  const styles = read('src/styles/main.css');
  assert(
    /\.warehouse-operation-table \.table-row \{[\s\S]*?height: 66px;[\s\S]*?min-height: 66px;[\s\S]*?\}/.test(styles),
    'warehouse operation rows should keep the fixed 66px height used by the status rail',
  );
  assert(
    /\.warehouse-operation-list-shell \.quote-status-column \{[\s\S]*?grid-auto-rows: 66px;[\s\S]*?\}/.test(styles),
    'warehouse status rows should stay aligned with the 66px operation rows',
  );
});

run('business and master right summaries do not duplicate the log panel', () => {
  for (const file of [...new Set([...businessDetailViews.map(({ file }) => file), ...financeEditorViews, ...masterEditorViews])]) {
    expectNoSummaryLogSection(file);
  }
});

run('attachment upload controls expose disabled semantics', () => {
  for (const file of [
    ...businessDetailViews.map(({ file }) => file),
    'src/views/MasterSimpleEditorView.vue',
  ]) {
    expectFileUploadControls(file);
  }
});

run('danger More menu actions require confirmation before state feedback', () => {
  const salesOrderVoid = blockAfter(
    'src/views/SalesOrderEditorView.vue',
    'async function voidCurrentOrder',
    'async function confirmOrderDraft',
  );
  assert(salesOrderVoid.includes('requestActionConfirmation'), 'sales order void action should use the system confirmation dialog');
  assert(salesOrderVoid.includes("tone: 'danger'"), 'sales order void action should expose danger semantics');
  assert(salesOrderVoid.includes('voidSalesOrder'), 'sales order void action should call the real void API');

  const productionMore = blockAfter(
    'src/views/Production2View.vue',
    'async function handleProductionMoreAction',
    'function handleAttachmentUpload',
  );
  assert(productionMore.includes("action.key === 'disable'"), 'production danger actions should be handled explicitly');
  assert(productionMore.includes('requestActionConfirmation'), 'production danger actions should use the system confirmation dialog');
  assert(productionMore.includes('if (!confirmed) return'), 'production danger action cancellation should stop feedback');
  assert(productionMore.includes('updateProductionRecipeLifecycle'), 'production recipe disable should call the real lifecycle API');
  assert(productionMore.includes('updateProductionProcessTemplateLifecycle'), 'production process disable should call the real lifecycle API');
  assert(!productionMore.includes('操作已记录'), 'production More actions must not report success without a backend mutation');

  expectExcludes('src/views/QualityDocumentEditorView.vue', [
    "key: 'exception'",
    "key: 'void'",
    '当前会话',
    '正式系统',
  ]);
});

run('warehouse More menu actions route through the selected action object', () => {
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    'type ReceiptMoreAction',
    'computed<ReceiptMoreAction[]>',
    'handleReceiptMoreAction(action: ReceiptMoreAction)',
    '@click="handleReceiptMoreAction(action)"',
  ]);
  expectIncludesAll('src/views/WarehouseSalesIssueEditorView.vue', [
    'type IssueMoreAction',
    'computed<IssueMoreAction[]>',
    'handleIssueMoreAction(action: IssueMoreAction)',
    '@click="handleIssueMoreAction(action)"',
  ]);
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    'type WarehouseMoreAction',
    'computed<WarehouseMoreAction[]>',
    'handleWarehouseMoreAction(action: WarehouseMoreAction)',
    '@click="handleWarehouseMoreAction(action)"',
  ]);
});

run('purchase More menu actions keep selected action routing, disabled reasons, and delete confirmation', () => {
  expectIncludesAll('src/views/PurchaseRequisitionEditorView.vue', [
    'type RequisitionMoreAction',
    'computed<RequisitionMoreAction[]>',
    'disabledReason?: string',
    ':title="action.disabled ? action.disabledReason || action.description : action.description"',
    '@click="handleRequisitionMoreAction(action)"',
    'async function handleRequisitionMoreAction(action: RequisitionMoreAction)',
    'await deleteDraftRequisition()',
    'requestActionConfirmation({',
    'title: `删除采购需求草稿',
  ]);
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    'type PurchaseMoreAction',
    'computed<PurchaseMoreAction[]>',
    'disabledReason?: string',
    ':title="action.disabled ? action.disabledReason || action.description : action.description"',
    '@click="handlePurchaseMoreAction(action)"',
    'async function handlePurchaseMoreAction(action: PurchaseMoreAction)',
    'startPurchaseAfterSale()',
    'await deleteDraftOrder()',
    'requestActionConfirmation({',
    'title: `删除${documentTitle.value}草稿',
  ]);
});

run('business detail pages use top log button plus modal, not duplicated right-side logs', () => {
  for (const { name, file, flowOpen } of businessDetailViews) {
    expectIncludesAll(file, ['FlowRecordPanel', flowOpen]);
    const summaryPanel = blockAfter(file, 'quote-summary-panel', '</aside>');
    assert(summaryPanel.includes('summary-title'), `${name} should use shared summary heading style`);
    assert(!summaryPanel.includes('日志'), `${name} should not duplicate logs inside the right summary panel`);
    assert(!summaryPanel.includes('flowRecords'), `${name} should not render flow records inside the right summary panel`);
    assert(!summaryPanel.includes('FlowRecordPanel'), `${name} should keep the log panel outside the right summary panel`);
  }
});

run('shared dialogs expose titles, close affordances, and escape behavior consistently', () => {
  expectIncludesAll('src/components/FlowRecordPanel.vue', [
    'role="dialog"',
    'aria-modal="true"',
    'aria-labelledby="flow-record-panel-title"',
    'id="flow-record-panel-title"',
    '@click.self="emit(\'close\')"',
    '@keydown.esc.stop="emit(\'close\')"',
    ':aria-label="`关闭${title}`"',
    ':title="`关闭${title}`"',
    'ref="dialogPanel"',
    'ref="searchInput"',
    'tabindex="-1"',
    '@keydown.tab="handleDialogTab"',
    'useDialogFocus(dialogPanel, searchInput)',
    'class="flow-record-tools"',
    'const resultSummary = computed(() =>',
    ':placeholder="searchPlaceholder"',
    ':is="record.route ? RouterLink : \'article\'"',
  ]);
  expectIncludesAll('src/components/TermsTemplateDialog.vue', [
    'role="dialog"',
    'aria-modal="true"',
    'aria-labelledby="terms-template-title"',
    'id="terms-template-title"',
    '@click.self="emit(\'close\')"',
    '@keydown.esc.stop="emit(\'close\')"',
    'aria-label="关闭条款模板"',
    'title="关闭条款模板"',
    "readonly ? readonlyReason : '新建条款模板'",
    "readonly ? readonlyReason : '填写条款模板名称'",
    "readonly ? readonlyReason : '选择交付方式'",
    "readonly ? readonlyReason : '选择付款方式'",
    "readonly ? readonlyReason : '选择计价口径'",
    "readonly ? readonlyReason : '选择税率'",
    "readonly ? readonlyReason : '填写条款正文'",
    "readonly ? readonlyReason : '将当前模板条款应用到单据'",
    "readonly ? readonlyReason : '保存当前条款模板修改'",
    'ref="dialogPanel"',
    'tabindex="-1"',
    '@keydown.tab="handleDialogTab"',
    'useDialogFocus(dialogPanel)',
  ]);
  expectIncludesAll('src/components/ExceptionActionDialog.vue', [
    'role="dialog"',
    'aria-modal="true"',
    'aria-labelledby="exception-action-title"',
    'id="exception-action-title"',
    '@click.self="!busy && emit(\'close\')"',
    '@keydown.esc.stop="!busy && emit(\'close\')"',
    'aria-label="关闭异常处理"',
    'title="关闭异常处理"',
    'title="取消异常处理"',
    'title="提交异常处理并写入处理记录"',
    'title="选择异常处理动作"',
    'title="填写异常处理原因"',
    'role="alert"',
  ]);
  expectIncludesAll('src/components/ReferenceLookupDrawer.vue', [
    'role="dialog"',
    'aria-modal="true"',
    'aria-labelledby="reference-lookup-title"',
    'id="reference-lookup-title"',
    '@click.self="emit(\'close\')"',
    '@keydown.esc.stop="emit(\'close\')"',
    'aria-label="关闭参考"',
    'title="关闭参考"',
  ]);
  expectIncludesAll('src/components/ReferencePicker.vue', [
    'aria-haspopup="dialog"',
    'aria-controls="reference-picker-dialog"',
    ':aria-expanded="open"',
    ':title="hasValue ? triggerText : title"',
    'role="dialog"',
    'aria-modal="true"',
    'id="reference-picker-dialog"',
    'aria-labelledby="reference-picker-title"',
    'id="reference-picker-title"',
    '@click.self="closePicker"',
    '@keydown.esc.stop="closePicker"',
    'aria-label="关闭"',
    ':title="`清空${title}`"',
    'title="关闭选择器"',
    'ref="pickerDialog"',
    'tabindex="-1"',
    '@keydown.tab="handleDialogTab"',
    'useDialogFocus(pickerDialog, searchInput)',
  ]);
  expectExcludes('src/views/QualityView.vue', [
    'quality-standard-panel',
    'selectedStandardRecord',
    'openStandardPanel',
  ]);
  expectIncludesAll('src/composables/useDialogFocus.ts', [
    'focusableSelector',
    'restoreTarget = document.activeElement instanceof HTMLElement',
    '(initialFocus?.value ?? panel.value)?.focus()',
    'event.shiftKey',
    'event.preventDefault()',
    'last.focus()',
    'first.focus()',
    'if (target?.isConnected) target.focus()',
  ]);
});

run('business detail pages keep workflow guidance out of summary panels', () => {
  for (const { name, file } of businessDetailViews) {
    expectIncludes(file, 'quote-summary-panel');
    if (![
      'src/views/WarehousePurchaseReceiptEditorView.vue',
      'src/views/WarehouseSalesIssueEditorView.vue',
    ].includes(file)) {
      expectIncludes(file, 'order-next-step-strip');
    }
    const summaryPanel = blockAfter(file, 'quote-summary-panel', '</aside>');
    assert(
      !summaryPanel.includes('FlowRecordPanel') && !summaryPanel.includes('showFlowRecords') && !summaryPanel.includes('showProductionFlowRecords'),
      `${name} summary panel should not duplicate the log panel; logs belong in the top action rail`,
    );
  }

  expectIncludesAll('src/views/Production2View.vue', [
    'productionDocumentStageTitle',
    'productionDocumentSummaryTitle',
    "fact.label !== '下一步'",
    'isProductionRuleDocument.value ?',
    'compactProductionActionLabel(row)',
    "nextStep.includes('创建')",
    "return '查看工单'",
    "return '建工单'",
    'action: productionDocumentPrimaryLabel.value',
    '<span>{{ productionStatusActionPrefix }}</span>',
    'const showProductionNextStepStripAction',
    '<b v-if="showProductionNextStepStripAction">{{ productionDocumentNextStepGuidance.action }}</b>',
    '<h2>{{ productionDocumentStageTitle }}</h2>',
  ]);

  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    "import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';",
    ':primary-status="qualityLifecycleStatus"',
    ':items="qualityStatusPanelItems"',
  ]);
  expectExcludes('src/views/QualityDocumentEditorView.vue', [
    'BadgeCheck',
    '<h2>流程节点</h2>',
    'qualityStageItems',
  ]);

  expectIncludesAll('src/views/AfterSalesDocumentView.vue', [
    'afterSalesPrimaryActionTitle',
    'afterSalesSaveActionTitle',
    'afterSalesCancelActionTitle',
    ':title="afterSalesPrimaryActionTitle"',
    ':title="afterSalesSaveActionTitle"',
    ':title="afterSalesCancelActionTitle"',
    '<b>{{ nextStepBadge }}</b>',
  ]);
});

run('business detail attachment controls explain editable state and stay consistently disabled in readonly mode', () => {
  const hiddenReadonlyUploadViews = new Set([
    'src/views/QualityDocumentEditorView.vue',
    'src/views/AfterSalesDocumentView.vue',
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
  ]);
  for (const { name, file, readonlyGuard } of businessDetailViews.filter(({ file }) => !hiddenReadonlyUploadViews.has(file))) {
    expectIncludesAll(file, [
      'file-upload-button',
      'is-disabled',
      'type="file"',
      ':disabled=',
      '@change=',
      readonlyGuard,
      'attachment-list',
      'attachment-empty',
    ]);
    assert(
      read(file).includes(':title=') || read(file).includes('title='),
      `${name} upload control should explain disabled or available state with a title`,
    );
  }
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    'v-if="!isQualityReadOnly"',
    ':title="qualityAttachmentTitle"',
    '<input type="file" multiple @change="handleQualityAttachmentUpload" />',
  ]);
  for (const file of ['src/views/SalesQuoteEditorView.vue', 'src/views/SalesOrderEditorView.vue']) {
    expectIncludesAll(file, [
      'v-if="!isReadOnly"',
      'file-upload-button',
      'attachment-list',
      'attachment-empty',
    ]);
  }
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    'v-if="!isReadOnly"',
    'file-upload-button',
    'attachment-list',
    'attachment-empty',
  ]);
  expectIncludesAll('src/views/AfterSalesDocumentView.vue', [
    'v-if="isEditMode || afterSalesAttachments.length"',
    'v-if="!isAfterSalesReadOnly"',
    ':title="afterSalesAttachmentTitle"',
    '<input type="file" multiple @change="handleAfterSalesAttachmentUpload" />',
  ]);
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    ':class="{ \'is-disabled\': isReadOnly }"',
    ':title="receiptAttachmentTitle"',
    '<input type="file" multiple :disabled="isReadOnly" @change="handleAttachmentUpload" />',
  ]);
  expectIncludesAll('src/views/WarehouseSalesIssueEditorView.vue', [
    ':class="{ \'is-disabled\': isReadOnly }"',
    ':title="issueAttachmentTitle"',
    '<input type="file" multiple :disabled="isReadOnly" @change="handleAttachmentUpload" />',
  ]);
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    ':class="{ \'is-disabled\': isReadOnly }"',
    ':title="warehouseAttachmentTitle"',
    '<input type="file" multiple :disabled="isReadOnly" @change="handleAttachmentUpload" />',
    '[isEdit, () => documentDraft.value?.status, canEditCurrentStatus]',
    'void router.replace(`/warehouse/${config.value.routeSegment}/${encodeURIComponent(code)}`);',
  ]);
});

run('editable business documents keep save/submit or save/confirm actions in edit/new mode', () => {
  const saveRequired = businessDetailViews.filter(({ file }) => ![
    'src/views/AfterSalesDocumentView.vue',
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
  ].includes(file));
  for (const { name, file } of saveRequired) {
    expectIncludesAll(file, ['Save', '保存']);
    const content = read(file);
    assert(content.includes('提交') || content.includes('确认'), `${name} should expose submit or confirm copy`);
  }
  expectIncludesAll('src/views/AfterSalesDocumentView.vue', ['Save', '保存', '变更']);
  expectIncludesAll('src/views/Production2View.vue', [
    'productionEditableActionDisabled',
    'productionSaveActionTitle',
    'productionSubmitActionTitle',
    'productionPrimaryActionTitle',
    ':disabled="productionEditableActionDisabled"',
    ':title="productionSaveActionTitle"',
    ':title="productionSubmitActionTitle"',
    ':title="productionStaleSnapshotMessage || productionPrimaryActionTitle"',
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    'qualitySaveActionDisabled',
    'qualitySubmitActionDisabled',
    'qualitySaveActionTitle',
    'qualitySubmitActionTitle',
    ':disabled="qualitySaveActionDisabled"',
    ':disabled="qualitySubmitActionDisabled"',
    ':title="qualitySaveActionTitle"',
    ':title="qualitySubmitActionTitle"',
  ]);
  for (const [file, titleToken, titleCopyToken] of [
    ['src/views/SalesQuoteEditorView.vue', 'saveQuoteActionTitle', '保存草稿'],
    ['src/views/SalesOrderEditorView.vue', 'saveActionTitle', '保存草稿'],
    ['src/views/PurchaseRequisitionEditorView.vue', 'saveRequisitionActionTitle', '保存草稿'],
    ['src/views/PurchaseOrderEditorView.vue', 'saveActionTitle', '保存草稿'],
    ['src/views/WarehouseOperationEditorView.vue', 'saveDocumentActionTitle', '确认前可继续调整'],
  ]) {
    expectIncludesAll(file, [titleToken, titleCopyToken, `:title="${titleToken}"`]);
  }
});

run('warehouse execution dialogs submit atomic facts without draft actions', () => {
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    'submitPurchaseReceiptArrivalResult',
    'products: submitted.products.filter((product, index) => receiptLineIsSelected(product, index))',
    'receipt-action-dialog-footer',
  ]);
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', ['saveReceiptDraft', '保存草稿']);
  expectIncludesAll('src/views/WarehouseSalesIssueEditorView.vue', [
    'submitSalesIssuePickingResult',
    'sales-picking-dialog',
    '提交本次拣货结果并进入待复核',
    '提交复核后随拣货结果保留',
  ]);
  expectExcludes('src/views/WarehouseSalesIssueEditorView.vue', ['saveIssueDraft', '保存草稿']);
});

run('purchase receipt and sales issue registration share one command skeleton', () => {
  for (const file of [
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'class="receipt-action-dialog warehouse-action-dialog',
      '<h3>本次作业信息</h3>',
      '<h3>本次物料结果</h3>',
      '<h3>备注与附件</h3>',
      'class="warehouse-dialog-command-bar',
      'warehouse-dialog-material-line-card',
      'warehouse-dialog-line-toggle',
      'warehouse-dialog-supplement-grid',
    ]);
  }
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    '<span>本次到货</span>',
    'selectedReceiptLineIds.length',
  ]);
  expectIncludesAll('src/views/WarehouseSalesIssueEditorView.vue', [
    '<span>本次出库</span>',
    'products: issueDraft.value!.products.filter((product) => issueLineIsSelected(product))',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.warehouse-dialog-operation-section .warehouse-dialog-command-bar {',
    '.warehouse-dialog-material-product {',
    '.warehouse-dialog-material-line-card.is-selected {',
    '.warehouse-dialog-supplement-grid {',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 240. 仓库登记命令骨架与本次物料范围统一（2026-08-01）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 214. 仓库登记事件范围选择与取消回滚合同（2026-08-01）',
  ]);
});

run('master data editor save actions explain available and disabled states', () => {
  for (const file of [
    'src/views/MasterCustomerEditorView.vue',
    'src/views/MasterSupplierEditorView.vue',
    'src/views/MasterMaterialEditorView.vue',
    'src/views/MasterWarehouseEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'masterSaveActionTitle',
      '保存资料，保存后会同步到业务候选列表。',
      ':title="masterSaveActionTitle"',
      'masterDataReadonlyReason',
    ]);
  }
  expectIncludesAll('src/views/MasterCustomerEditorView.vue', ['title="编辑客户资料"']);
  expectIncludesAll('src/views/MasterSupplierEditorView.vue', ['title="编辑供应商资料"']);
  expectIncludesAll('src/views/MasterMaterialEditorView.vue', ['title="编辑物料资料"']);
  expectIncludesAll('src/views/MasterWarehouseEditorView.vue', [
    'masterEditActionTitle',
    ':title="masterEditActionTitle"',
  ]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    'simpleEditActionTitle',
    ':title="simpleEditActionTitle"',
    'simpleSaveActionTitle',
    '保存资料，保存后会同步到业务候选列表。',
    ':title="simpleSaveActionTitle"',
    'saveDisabledReason',
  ]);
});

run('small icon, segmented, and chip controls expose hover titles', () => {
  expectIncludesAll('src/views/QualityView.vue', [
    ':title="`打开质检标准 ${row.code}`"',
    ':aria-label="`打开质检标准 ${row.code}`"',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    '`按${option.label}汇总：${option.hint}`',
    ':title="`查看${row.title}库存明细`"',
  ]);
  expectIncludesAll('src/components/TermsTemplateDialog.vue', [
    ':title="`选择条款模板：${template.name}`"',
    "readonly ? readonlyReason : '新建条款模板'",
  ]);
  expectIncludesAll('src/components/ReferencePicker.vue', [
    ':title="`${title}：${option.name || option.code}`"',
    ':title="searchPlaceholder"',
  ]);
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    'aria-label="删除仓库作业明细"',
  ]);
  expectIncludesAll('src/views/MasterMaterialEditorView.vue', [
    'title="控制是否出现在销售选品中"',
    'title="控制是否出现在采购选品中"',
    'title="控制是否可作为生产产出物料"',
  ]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    ':title="`${isMultiSelected(field.key, option) ? \'取消选择\' : \'选择\'}${field.label}：${option}`"',
  ]);
});

run('shared filter and reference popovers expose field-level hover titles', () => {
  expectIncludesAll('src/components/SalesFilterPopover.vue', [
    "`${isStatusChecked(option, status) ? '取消' : '选择'}${field.label}：${optionLabel(option)}`",
    ':title="`筛选${field.label}`"',
    ':title="`选择${dateLabel}起始日期`"',
    ':title="`选择${dateLabel}结束日期`"',
    'title="清空当前筛选条件"',
    'title="应用当前筛选条件"',
  ]);
  expectIncludesAll('src/components/ReferencePicker.vue', [
    ':title="searchPlaceholder"',
    ':title="`${title}：${option.name || option.code}`"',
  ]);
  expectIncludesAll('src/components/ReferenceLookupDrawer.vue', [
    'title="搜索参考单据和基础资料"',
    ':title="`打开${item.title}`"',
  ]);
});

run('floating reference panel controls expose target relation and icon labels', () => {
  expectIncludesAll('src/components/PinReferenceButton.vue', [
    'title="打开悬浮参考窗"',
    'aria-controls="reference-side-panel"',
    ':aria-expanded="referencePanel.open"',
  ]);
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    'title="打开悬浮参考窗"',
    'aria-controls="reference-side-panel"',
    ':aria-expanded="referencePanel.open"',
  ]);
  expectIncludesAll('src/components/ReferenceSidePanel.vue', [
    'id="reference-side-panel"',
    'aria-label="右侧参考页"',
    'title="展开参考页"',
    'aria-label="展开参考页"',
    'title="收起参考页"',
    'aria-label="收起参考页"',
    'title="关闭参考页"',
    'aria-label="关闭参考页"',
  ]);
});

run('required field errors keep visible styling and focus the first missing field', () => {
  expectIncludesAll('src/styles/main.css', [
    '.form-field.is-required-field > span::after',
    '.form-field.has-field-error input',
    '.form-field.has-field-error .reference-picker-trigger',
    '.quote-line-row input.has-line-field-error',
    '.app-toast.error',
  ]);
  expectIncludesAll('src/composables/useMasterSaveFeedback.ts', [
    'focusFirstMissingField',
    'function requiredFieldClass(label: string, value?: unknown)',
    'missingRequiredLabels.value.includes(label) && isBlank(value)',
    "document.querySelector('.form-field.has-field-error')",
    'scrollElementIntoView(target)',
    'focusTarget?.focus()',
    'if (labels.length) focusFirstMissingField()',
  ]);
  for (const file of [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'scrollToFirstMissingField',
      'data-required-field=',
      'scrollElementIntoView(target)',
      'focusTarget?.focus()',
    ]);
  }
  for (const file of [
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'missingRequiredSummary',
      'data-required-field=',
      'has-field-error',
      'scrollToFirstMissingField',
      'scrollElementIntoView(target)',
      'focusTarget?.focus()',
    ]);
  }
  expectIncludesAll('src/views/Production2View.vue', [
    'productionMissingRequiredFields',
    'productionRequiredFieldClass',
    'scrollToFirstProductionMissingField',
    'validateProductionDraft',
    'data-required-field=',
    'scrollElementIntoView(target)',
    'focusTarget?.focus()',
    'if (!validateProductionDraft()) return',
  ]);
  for (const file of [
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
    'src/views/QualityDocumentEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'scrollToFirstValidationError',
      'scrollElementIntoView(target)',
      'focusTarget?.focus()',
    ]);
  }
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', ['showReceiptValidationError']);
  expectIncludesAll('src/views/WarehouseSalesIssueEditorView.vue', ['showIssueValidationError']);
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', ['showWarehouseValidationError']);
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    'receiptRequiredFieldClass',
    ':class="receiptRequiredFieldClass(',
    'const missing = receiptMissingSubmitFields();',
    'showReceiptValidationError(missingSubmitSummary(missing))',
  ]);
  expectIncludesAll('src/views/WarehouseSalesIssueEditorView.vue', [
    'issueRequiredFieldClass',
    ':class="issueRequiredFieldClass(',
    'const missing = issueMissingSubmitFields();',
    'showIssueValidationError(missingSubmitSummary(missing))',
  ]);
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    'warehouseRequiredFieldClass',
    ':class="warehouseRequiredFieldClass(',
    'const missing = warehouseMissingSubmitFields();',
    'showWarehouseValidationError(missingSubmitSummary(missing))',
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    'qualityMissingSubmitFields',
    'missingSubmitSummary(missing)',
    'scrollToFirstValidationError();',
  ]);
  for (const file of masterEditorViews) {
    expectIncludesAll(file, ['validateRequired', 'requiredFieldClass', 'showSaveFeedback']);
  }
  expectIncludesAll('src/views/MasterCustomerEditorView.vue', [
    "requiredFieldClass('客户名称', customerDraft.name)",
  ]);
  expectIncludesAll('src/views/MasterSupplierEditorView.vue', [
    "requiredFieldClass('供应商名称', supplierDraft.name)",
  ]);
  expectIncludesAll('src/views/MasterMaterialEditorView.vue', [
    "requiredFieldClass('物料名称', materialDraft.name)",
  ]);
  expectIncludesAll('src/views/MasterWarehouseEditorView.vue', [
    "requiredFieldClass('仓库名称', warehouseDraft.name)",
  ]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    'requiredFieldClass(requiredFieldLabel(field), formDraft[field.key])',
  ]);
});

run('material, customer, supplier, and warehouse master pages keep business semantics concise and source-safe', () => {
  expectIncludesAll('src/views/MasterDataView.vue', [
    'materialInspectionSummary(row)',
    "materialIsPurchasable(row) ? `到货：${materialIncomingQuality(row)}` : ''",
    '<span>客户</span>',
    '<span>公司地址</span>',
    '<small>{{ customerPhone(row) }}</small>',
    '<span>供应商</span>',
    '<small>{{ supplierPhone(row) }}</small>',
    '<small>{{ supplierAddress(row) }}</small>',
    '<span>所属公司</span>',
    '`位置：${warehouseRegion(row)} · ${warehouseAddress(row)}`',
    "<small v-if=\"row.status === '停用'\">新业务不可选</small>",
  ]);
  expectExcludes('src/views/MasterDataView.vue', [
    '到货不适用',
    '完工不适用',
    'function customerUsageHint',
    '<span>客户/负责人</span>',
    '<span>收货区域/物流</span>',
    '<span>供应商/采购员</span>',
    '<span>公司/归属</span>',
    '未维护管理归属',
    "{{ customerPhone(row) }} · {{ row.email || '未维护邮箱' }}",
    "{{ supplierPhone(row) }} · {{ row.email || '未维护邮箱' }}",
    'row.warehouseScope',
    "'保管范围'",
    "'采购收货', '销售发货', '生产领用', '生产入库', '待检暂存', '不合格隔离'",
  ]);
  expectIncludesAll('src/views/MasterMaterialEditorView.vue', [
    '<dt>可销售</dt>',
    '<dt>可采购</dt>',
    '<dt>可产出</dt>',
    '<strong>可产出</strong>',
    "'备件'",
  ]);
  expectExcludes('src/views/MasterMaterialEditorView.vue', [
    'material-section-kicker',
  ]);
  expectIncludesAll('src/views/MasterCustomerEditorView.vue', [
    'function syncDefaultShipping()',
    '从公司信息带入',
    '<h2>公司联系与地址</h2>',
    '<h2>默认收货信息</h2>',
    'customer-business-fact-grid',
    'customer-shipping-fact-grid',
    'customerDraft.province ? requiredFieldClass',
    'const customerProfileSummary = computed',
  ]);
  expectExcludes('src/views/MasterCustomerEditorView.vue', [
    '<div><dt>默认物流</dt>',
    'material-section-kicker',
    '<span>归属部门</span>',
    '<span>客户负责人</span>',
  ]);
  expectIncludesAll('src/views/MasterSupplierEditorView.vue', [
    '<h2>公司联系与地址</h2>',
    '<h2>可供物料</h2>',
    '<h2>采购默认值</h2>',
    'supplier-purchase-fact-grid',
    'supplierCompanyAddressText',
    'supplierCompanyRegionText',
    "['设备供应商', '物流服务']",
    "'网店'",
  ]);
  expectExcludes('src/views/MasterSupplierEditorView.vue', [
    'material-section-kicker',
    '<span>归属部门</span>',
    '<span>采购员</span>',
    '<h2>供货范围与质量</h2>',
    '<h2>质量与资质</h2>',
    'supplierDraft.supplyScope',
    'supplierDraft.incomingQualityRule',
    'supplierDraft.qualificationRequired',
    'supplierDraft.qualificationStatus',
    "registeredAddress: draft.registeredAddress || draft.address || ''",
  ]);
  expectExcludes('src/views/MasterDataView.vue', [
    '<span>供货范围</span>',
    'supplierSupplySummary',
    'supplierSupplyMeta',
    'row.supplyScope',
    'row.incomingQualityRule',
    'row.qualificationRequired',
    'row.qualificationStatus',
  ]);
  expectIncludesAll('src/views/MasterWarehouseEditorView.vue', [
    '<h2>仓库位置</h2>',
    '<h2>库位设置</h2>',
    '实际可承接的流程由业务职能决定',
  ]);
  expectExcludes('src/views/MasterWarehouseEditorView.vue', [
    'material-section-kicker',
    '<h2>管理归属</h2>',
    '<h2>管理归属与位置</h2>',
    'warehouseDraft.owner',
    'warehouseDraft.manager',
    'warehouseDraft.phone',
    'warehouseDraft.warehouseScope',
    'warehouseDraft.allowPurchaseReceipt',
    'warehouseDraft.allowSalesIssue',
    'warehouseDraft.allowProductionIssue',
    'warehouseDraft.allowProductionReceipt',
    'warehouseDraft.allowQualityHold',
    'warehouseDraft.allowQuarantine',
    'warehouse-rule-summary-grid',
    'warehouse-rule-editor-grid',
    '<span>保管范围</span>',
  ]);
  expectIncludesAll('server/index.mjs', [
    'const warehouseTypeCapabilities = {',
    'const warehouseRules = warehouseCapabilities(warehouseType, warehouseFunctions, base);',
    'Object.assign(row, warehouseCapabilities(row.type, row.warehouseFunctions, row) || {});',
  ]);
  expectExcludes('src/views/PurchaseOrderEditorView.vue', [
    'warehouse.manager',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.customer-shipping-fact-grid',
    '.supplier-purchase-fact-grid',
    'grid-template-columns: repeat(4, minmax(0, 1fr));',
  ]);
});

run('list, detail, and master editor feedback toasts expose live-region semantics', () => {
  for (const { file } of listViews) {
    expectIncludesAll(file, [
      'app-toast',
      "toastTone = ref<'success' | 'error'>",
      ':role="toastTone === \'error\' ? \'alert\' : \'status\'"',
      ':aria-live="toastTone === \'error\' ? \'assertive\' : \'polite\'"',
      'aria-atomic="true"',
    ]);
  }

  for (const file of [
    ...businessDetailViews.map(({ file }) => file),
    ...financeEditorViews,
  ]) {
    expectIncludesAll(file, [
      'app-toast',
      "toastTone = ref<'success' | 'error'>",
      "tone: 'success' | 'error' = 'success'",
      ':class="{ error: toastTone === \'error\' }"',
      ':role="toastTone === \'error\' ? \'alert\' : \'status\'"',
      ':aria-live="toastTone === \'error\' ? \'assertive\' : \'polite\'"',
      'aria-atomic="true"',
    ]);
  }

  for (const file of masterEditorViews) {
    expectIncludesAll(file, [
      'app-toast',
      ':role="saveTone === \'error\' ? \'alert\' : \'status\'"',
      ':aria-live="saveTone === \'error\' ? \'assertive\' : \'polite\'"',
      'aria-atomic="true"',
    ]);
  }
});

run('master data list and editor pages use consistent non-flow master-data patterns', () => {
  expectIncludesAll('src/views/MasterDataView.vue', [
    'BusinessListToolbar',
    '<PageTopbarPortal>',
    '<template #actions>',
    ':title="masterDataReadonlyReason || `新建${pageTitle}`"',
    "document.addEventListener('click', handleDocumentClick)",
    "document.removeEventListener('click', handleDocumentClick)",
    'supportsDetailPage',
    'openSupportedDetail',
    '@keydown.enter',
    '@keydown.space.prevent',
    'quote-card-list',
    'table-footer',
    'pager',
    'function simpleExportRows',
    'row.processScope',
    "['编码', '公司名称', '英文名称', '公司简称', '组织类型', '统一社会信用代码'",
    "['编码', '产线名称', '产线类型', '所属部门', '车间/区域'",
  ]);
  expectExcludes('src/views/MasterDataView.vue', [
    'usesTopbarListPage',
    '<div v-else class="table-title quote-title">',
  ]);
  expectIncludesAll('src/router/index.ts', [
    "path: `master-data/${segment}/new`",
    "name: `master-${page}-new`",
  ]);
  expectExcludes('src/router/index.ts', [
    "redirect: '/master-data/company/COM-FILATRIX'",
    "page === 'company'",
  ]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    "{ label: '官网', key: 'website', link: true }",
    "{ label: '开票电话', key: 'invoicePhone' }",
    "{ label: '注册地址', key: 'registeredAddress' }",
    "{ label: '性别', key: 'gender' }",
    "primary: '',\n      secondary: '13%'",
    'class="simple-detail-link"',
  ]);
  expectIncludesAll('src/views/MasterMaterialEditorView.vue', [
    'await router.replace(`/master-data/materials/${encodeURIComponent(savedMaterial.code)}`)',
  ]);
  expectExcludes('src/views/MasterMaterialEditorView.vue', [
    'await router.replace(`/master-data/materials/${encodeURIComponent(savedMaterial.code)}/edit`)',
  ]);
  for (const file of [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'DEFAULT_COMPANY_CODE',
      'DEFAULT_COMPANY_NAME',
      'data-required-field="company"',
      'type="company"',
      'handleCompanySelect',
    ]);
  }
  expectIncludesAll('server/index.mjs', [
    'function resolveDocumentCompany',
    'function hydrateDocumentCompanies',
    'hydrateDocumentCompanies(data)',
    'companyCode: existing?.companyCode || sourceOrder?.companyCode || input.companyCode',
    "note: input.note ?? existing?.note ?? ''",
    "if (type === 'company')",
    'const type = masterType(parts[2]) || parts[2]',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    '...uniqueValues(rows.map((row) => row.materialCode)),',
  ]);

  for (const file of masterEditorViews) {
    expectIncludesAll(file, [
      'quote-form-grid',
      'quote-summary-panel',
      'summary-section',
      'summary-title',
      'primary-action',
      'Save',
      'app-toast',
    ]);
    if (
      file === 'src/views/MasterMaterialEditorView.vue'
      || file === 'src/views/MasterCustomerEditorView.vue'
      || file === 'src/views/MasterSupplierEditorView.vue'
      || file === 'src/views/MasterWarehouseEditorView.vue'
      || file === 'src/views/MasterSimpleEditorView.vue'
    ) {
      expectIncludesAll(file, ['PageTopbarPortal', 'topbar-back-action', '#actions']);
    } else {
      expectIncludesAll(file, ['quote-editor-header', 'back-link', 'quote-editor-actions']);
    }
    expectExcludes(file, ['FlowRecordPanel', 'order-next-step-strip']);
  }
});

run('async master saves prevent duplicate requests and expose busy state', () => {
  for (const file of [
    'src/views/MasterCustomerEditorView.vue',
    'src/views/MasterSupplierEditorView.vue',
    'src/views/MasterMaterialEditorView.vue',
    'src/views/MasterWarehouseEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'const isSaving = ref(false)',
      'if (isSaving.value) return',
      'isSaving.value = true',
      'finally {',
      'isSaving.value = false',
      ':disabled="isSaving || !canWriteMasterData"',
      ':aria-busy="isSaving"',
      'master-save-action',
      "{{ isSaving ? '保存中' : '保存' }}",
      "if (isSaving.value) return '正在保存，请稍候'",
    ]);
  }

  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    'const isSaving = ref(false)',
    "if (isSaving.value) return '正在保存，请稍候'",
    'isSaving.value = true',
    'finally {',
    'isSaving.value = false',
    ':aria-busy="isSaving"',
    'master-save-action',
    "{{ isSaving ? '保存中' : '保存' }}",
  ]);
  expectIncludesAll('src/styles/main.css', [
    ".primary-action[aria-busy='true']",
    '.master-save-action',
    'min-width: 90px',
  ]);
});

run('business documents expose action-specific async progress', () => {
  expectIncludesAll('src/composables/useAsyncActionState.ts', [
    "const activeAction = ref<Action | ''>('')",
    'if (activeAction.value) return undefined',
    'activeAction.value = action',
    'finally {',
    "activeAction.value = ''",
  ]);

  for (const file of [
    'src/views/SalesOrderEditorView.vue',
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOutboundRequestView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      "import { useAsyncActionState } from '../composables/useAsyncActionState'",
      'isActionPending:',
      'runAction:',
      'async-document-action',
      ':aria-busy=',
      "'保存中'",
    ]);
    const source = read(file);
    assert(
      source.includes("'处理中'") || source.includes("'确认中'") || source.includes("'提交中'"),
      `${file} should expose action-specific progress copy`,
    );
  }

  for (const file of [
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      "import { useAsyncActionState } from '../composables/useAsyncActionState'",
      'isActionPending:',
      'runAction:',
      'async-document-action',
      ':aria-busy=',
      "'处理中'",
    ]);
  }

  expectIncludesAll('src/styles/main.css', [
    '.async-document-action',
    'min-width: 104px',
  ]);
});

run('core async detail pages clear stale records and expose retryable load states', () => {
  expectIncludesAll('src/components/DocumentLoadState.vue', [
    ':aria-busy="loading"',
    '正在加载${props.title}',
    '${props.title}加载失败',
    '没有找到${props.title}',
    "state?: 'not-found' | 'error'",
    "@click=\"$emit('retry')\"",
    ':to="backPath"',
    ':title="backLabel">{{ backLabel }}',
  ]);
  expectExcludes('src/components/DocumentLoadState.vue', ['返回{{ backLabel }}']);
  expectIncludesAll('src/styles/main.css', [
    '.document-load-state',
    'min-height: 240px',
    '.document-load-spinner',
    '@keyframes document-load-spin',
  ]);

  for (const file of [
    'src/views/SalesOrderEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      "import DocumentLoadState from '../components/DocumentLoadState.vue'",
      'const isLoading = ref(false)',
      'isLoading.value = true',
      'if (!isNew.value) {',
      'flowRecords.value = []',
      'isLoading.value = false',
      '<DocumentLoadState',
      ':loading="isLoading"',
      ':message="loadMessage"',
      '@retry=',
    ]);
  }
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    "import DocumentLoadState from '../components/DocumentLoadState.vue'",
    'const isLoading = ref(false)',
    'isLoading.value = true',
    'receiptDraft.value = null',
    'flowRecords.value = []',
    'isLoading.value = false',
    '<DocumentLoadState',
    ':loading="isLoading"',
    ':message="loadMessage"',
    '@retry=',
  ]);
});

run('remaining async documents and master editors use explicit load recovery', () => {
  for (const file of [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOutboundRequestView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
    'src/views/MasterCustomerEditorView.vue',
    'src/views/MasterSupplierEditorView.vue',
    'src/views/MasterMaterialEditorView.vue',
    'src/views/MasterWarehouseEditorView.vue',
    'src/views/MasterSimpleEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      "import DocumentLoadState from '../components/DocumentLoadState.vue'",
      'const isLoading = ref(false)',
      'isLoading.value =',
      'finally {',
      'isLoading.value = false',
      '<DocumentLoadState',
      ':loading="isLoading"',
      '@retry=',
    ]);
  }

  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    'const shouldLoadAsync = isProductionMove.value',
    'const shouldLoadWarehouseReferences = currentKind.value === \'productionReceipts\'',
    'isLoading.value = shouldLoadAsync',
  ]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    "if (mode.value === 'new') {",
    'sourceRecord.value = undefined',
    'refreshDraft()',
    'await loadLinkedRows(targetPage, requestId)',
    'v-if="mode !== \'new\' && !sourceRecord"',
  ]);
  expectIncludesAll('src/views/SalesQuoteEditorView.vue', [
    "if (isNew.value) {",
    'quoteDraft.value = createEmptyQuote()',
    'await Promise.all([loadPriceReferences(), loadCurrencyReferences()])',
  ]);
  expectExcludes('src/views/SalesQuoteEditorView.vue', ['<h1>报价单不存在</h1>']);
  expectExcludes('src/views/MasterCustomerEditorView.vue', ['没有找到这个客户。']);
  expectExcludes('src/views/MasterMaterialEditorView.vue', ['没有找到这个物料。']);
});

run('api-backed lists separate loading, failure, empty, and constrained-empty states', () => {
  expectIncludesAll('src/components/ListLoadState.vue', [
    ':aria-busy="loading"',
    '正在加载${title}',
    '${title}加载失败',
    "@click=\"$emit('retry')\"",
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.list-load-state',
    'min-height: 132px',
    '.list-empty-state ~ .table-footer',
  ]);

  for (const file of [
    'src/views/SalesView.vue',
    'src/views/PurchaseView.vue',
    'src/views/WarehouseView.vue',
    'src/views/MasterDataView.vue',
  ]) {
    expectIncludesAll(file, [
      "import ListLoadState from '../components/ListLoadState.vue'",
      'const isListLoading = ref(false)',
      "const listLoadError = ref('')",
      'let listLoadRequestId = 0',
      'const requestId = ++listLoadRequestId',
      'if (requestId !== listLoadRequestId) return',
      'isListLoading.value = true',
      "listLoadError.value = ''",
      'finally {',
      'if (requestId === listLoadRequestId) isListLoading.value = false',
      '<ListLoadState',
      ':loading="isListLoading"',
      ':message="listLoadError"',
      '@retry=',
      'v-else-if=',
    ]);
  }

  expectIncludesAll('src/views/SalesView.vue', [
    "if (page === 'afterSales') {",
    'void loadCurrentSalesList()',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    "} else if (page === 'productionReturns') {",
    'await listProductionReturns()',
    'void loadCurrentWarehouseList()',
  ]);
  expectIncludesAll('src/views/MasterDataView.vue', [
    'apiPageRows.value = null',
    'listLoadError.value = error instanceof Error',
  ]);
});

run('mobile business cards keep dates, status, and metadata readable', () => {
  expectIncludesAll('src/styles/main.css', [
    '@media (max-width: 760px)',
    '.quote-table-shell {',
    'display: none',
    '.quote-card {',
    'min-width: 0',
    '.quote-card-main > strong',
    'white-space: nowrap',
    '.quote-card-meta {',
    'grid-template-columns: repeat(2, minmax(0, 1fr))',
    '.quote-card-meta > span',
    'overflow-wrap: anywhere',
    '.production-list-page .quote-card-main > strong',
    'white-space: normal',
    '.master-card .quote-card-meta',
  ]);

  for (const file of [
    'src/views/SalesView.vue',
    'src/views/PurchaseView.vue',
    'src/views/WarehouseView.vue',
    'src/views/Production2View.vue',
    'src/views/QualityView.vue',
    'src/views/MasterDataView.vue',
  ]) {
    expectIncludesAll(file, ['quote-card-list', 'quote-card-head']);
  }
});

run('mobile controls keep practical touch targets and truthful menu state', () => {
  expectIncludesAll('src/styles/main.css', [
    '@media (max-width: 760px)',
    '@media (max-width: 900px) and (min-width: 761px)',
    '.sidebar-open.sidebar-collapsed .app-sidebar',
    '.sidebar-collapsed .sidebar-restore-button',
    '.topbar .icon-button',
    '.app-sidebar .nav-item',
    '.app-sidebar .nav-child',
    '.primary-action,',
    '.compact-action,',
    '.form-field input,',
    '.reference-picker-trigger,',
    'height: 42px',
    '.quote-line-row input,',
    '.row-icon-button',
    '.pager button,',
    'min-width: 40px',
  ]);
  expectIncludesAll('src/components/AppTopbar.vue', [
    "const compactViewport = ref(window.matchMedia('(max-width: 900px)').matches)",
    'const navigationExpanded = computed',
    'compactViewport.value ? props.sidebarOpen : !props.sidebarCollapsed',
    "? '收起菜单'",
    ": '展开菜单'",
    "window.addEventListener('resize', syncCompactViewport)",
    "window.removeEventListener('resize', syncCompactViewport)",
  ]);
  expectIncludesAll('src/layouts/AppLayout.vue', [
    "if (window.matchMedia('(max-width: 900px)').matches)",
    'sidebarOpen.value = !sidebarOpen.value',
  ]);
});

run('keyboard focus stays visible and returns after common overlays close', () => {
  expectIncludesAll('src/styles/main.css', [
    '.icon-button:focus-visible',
    '.row-icon-button:focus-visible',
    '.pager button:focus-visible',
    '.notification-row:focus-visible',
    '.app-sidebar .nav-item:focus-visible',
    '.form-field input:focus',
    '.form-field select:focus',
    '.form-field textarea:focus',
    '.reference-picker-trigger:focus-visible',
    '.quantity-with-unit-field:focus-within',
  ]);
  expectIncludesAll('src/components/BusinessListToolbar.vue', [
    "import { nextTick, ref } from 'vue'",
    'const sortTrigger = ref<HTMLButtonElement | null>(null)',
    'function restoreMenuFocus(menu: ToolbarMenuKey)',
    "restoreMenuFocus('sort')",
    "restoreMenuFocus('filter')",
    "restoreMenuFocus('export')",
    'ref="sortTrigger"',
    'ref="filterTrigger"',
    'ref="exportTrigger"',
  ]);

  for (const file of [
    'src/components/ReferencePicker.vue',
    'src/components/FlowRecordPanel.vue',
    'src/components/TermsTemplateDialog.vue',
  ]) {
    expectIncludesAll(file, ['useDialogFocus', 'focusDialog', 'restoreDialogFocus', 'handleDialogTab']);
  }
});

run('validation failures focus the first problem and announce the right toast tone', () => {
  for (const file of [
    'src/views/SalesView.vue',
    'src/views/PurchaseView.vue',
    'src/views/WarehouseView.vue',
    'src/views/QualityView.vue',
    'src/views/MasterDataView.vue',
  ]) {
    expectIncludesAll(file, [
      "const toastTone = ref<'success' | 'error'>('success')",
      "function showToast(message: string, tone: 'success' | 'error' = 'success')",
      'toastTone.value = tone',
      ":role=\"toastTone === 'error' ? 'alert' : 'status'\"",
      ":aria-live=\"toastTone === 'error' ? 'assertive' : 'polite'\"",
      'aria-atomic="true"',
    ]);
  }

  expectIncludesAll('src/views/QualityStandardEditorView.vue', [
    "showToast('质检标准至少保留一个检查项。', 'error')",
    "showToast(error instanceof Error ? error.message : '质检标准保存失败。', 'error')",
    ":role=\"toastTone === 'error' ? 'alert' : 'status'\"",
  ]);
  expectIncludesAll('src/views/MasterDataView.vue', [
    "showToast(masterDataReadonlyReason.value, 'error')",
  ]);

  for (const file of [
    'src/views/SalesOrderEditorView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
    'src/views/QualityDocumentEditorView.vue',
    'src/views/Production2View.vue',
  ]) {
    expectIncludesAll(file, [
      'scrollElementIntoView(',
      'focusTarget?.focus()',
      ":role=\"toastTone === 'error' ? 'alert' : 'status'\"",
      ":aria-live=\"toastTone === 'error' ? 'assertive' : 'polite'\"",
    ]);
  }
});

run('representative editors protect unsaved changes without blocking clean or readonly pages', () => {
  expectIncludesAll('src/composables/useUnsavedChangesGuard.ts', [
    'onBeforeRouteLeave(confirmNavigation)',
    'onBeforeRouteUpdate(confirmNavigation)',
    "window.addEventListener('beforeunload', handleBeforeUnload)",
    "window.removeEventListener('beforeunload', handleBeforeUnload)",
    'requestActionConfirmation({',
    "title: '离开当前页面？'",
    "confirmLabel: '离开页面'",
    'event.returnValue =',
    'ready?: MaybeRefOrGetter<boolean>',
    'enabled?: MaybeRefOrGetter<boolean>',
    'snapshot !== baseline',
    'resetUnsavedChanges',
  ]);

  for (const file of [
    'src/views/SalesOrderEditorView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
    'src/views/QualityDocumentEditorView.vue',
    'src/views/Production2View.vue',
    'src/views/MasterMaterialEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      "import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard'",
      'useUnsavedChangesGuard(',
      'resetUnsavedChanges',
    ]);
  }

  for (const file of [
    'src/views/SalesOrderEditorView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/MasterMaterialEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'enabled: computed(() => !',
      'ready: computed(() => !isLoading.value)',
    ]);
  }
  expectIncludesAll('src/views/WarehouseSalesIssueEditorView.vue', [
    'enabled: computed(() => pickingDialogOpen.value)',
    'ready: computed(() => !isLoading.value)',
  ]);

  expectIncludesAll('src/views/Production2View.vue', [
    'const productionUnsavedSource = computed',
    'enabled: isProductionEditableDocument',
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    'const qualityUnsavedSource = computed',
    'attachments: localAttachments.value',
  ]);
});

run('all remaining visible business and master editors share the unsaved changes contract', () => {
  for (const file of [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOutboundRequestView.vue',
    'src/views/AfterSalesDocumentView.vue',
    'src/views/PurchaseOrderEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
    'src/views/MasterCustomerEditorView.vue',
    'src/views/MasterSupplierEditorView.vue',
    'src/views/MasterWarehouseEditorView.vue',
    'src/views/MasterSimpleEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      "import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard'",
      'useUnsavedChangesGuard(',
      'enabled: computed(() => !',
      'ready: computed(() => !isLoading.value)',
      'resetUnsavedChanges',
    ]);
  }
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    "import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard'",
    'useUnsavedChangesGuard(',
    'enabled: computed(() => Boolean(receiptActionDialogMode.value))',
    'ready: computed(() => !isLoading.value)',
    'resetUnsavedChanges',
  ]);
});

run('validation navigation and global motion respect operating system accessibility preferences', () => {
  expectIncludesAll('src/utils/focusNavigation.ts', [
    "window.matchMedia('(prefers-reduced-motion: reduce)').matches",
    "behavior: prefersReducedMotion() ? 'auto'",
    'element.scrollIntoView({',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '@media (prefers-reduced-motion: reduce)',
    'animation-duration: 0.01ms !important',
    'transition-duration: 0.01ms !important',
    '@media (forced-colors: active)',
    '*:focus-visible',
    'outline: 2px solid Highlight !important',
  ]);

  for (const file of [
    'src/composables/useMasterSaveFeedback.ts',
    'src/views/Production2View.vue',
    'src/views/PurchaseOrderEditorView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/QualityDocumentEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/SalesQuoteEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
  ]) {
    expectIncludesAll(file, ['scrollElementIntoView']);
    expectExcludes(file, ["scrollIntoView({ behavior: 'smooth'"]);
  }
});

run('business contacts accept generic channels while shipping and billing phones keep telephone semantics', () => {
  for (const file of [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'type="text" autocomplete="off" placeholder="手机号、座机、邮箱、微信或 WhatsApp 等"',
    ]);
  }
  expectIncludesAll('src/views/SalesOrderEditorView.vue', ['autocomplete="shipping tel"']);
  expectIncludesAll('src/views/SalesOutboundRequestView.vue', [
    'type="tel" inputmode="tel" autocomplete="shipping tel"',
  ]);
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', ['autocomplete="shipping tel"']);

  for (const file of [
    'src/views/MasterCustomerEditorView.vue',
    'src/views/MasterSupplierEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'type="text" autocomplete="off" placeholder="手机号、座机、邮箱、微信或 WhatsApp 等"',
      'type="email" inputmode="email" autocomplete="email"',
      'type="tel" inputmode="tel" autocomplete="billing tel"',
    ]);
  }
  expectIncludesAll('src/views/MasterCustomerEditorView.vue', ['autocomplete="shipping tel"']);
});

run('icon-only line deletion actions expose names and honest disabled guidance', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    'aria-label="删除成品明细"',
    "taskProductRows.length <= 1 ? '至少保留一项成品'",
    'aria-label="删除备料明细"',
    "materialRequestLines.length <= 1 ? '至少保留一项物料'",
  ]);

  const lineEditors = [
    ['src/views/SalesQuoteEditorView.vue', 'aria-label="删除报价物料"', '至少保留一行报价物料'],
    ['src/views/SalesOrderEditorView.vue', 'aria-label="删除销售明细"', '至少保留一行销售明细'],
    ['src/views/PurchaseRequisitionEditorView.vue', 'aria-label="删除申请物料"', '至少保留一项申请物料'],
    ['src/views/PurchaseOrderEditorView.vue', 'aria-label="删除采购明细"', '至少保留一行采购明细'],
    ['src/views/WarehouseOperationEditorView.vue', 'aria-label="删除仓库作业明细"', '至少保留一行仓库作业明细'],
  ];
  for (const [file, label, disabledTitle] of lineEditors) {
    expectIncludesAll(file, [label, disabledTitle]);
  }
  expectExcludes('src/views/SalesOutboundRequestView.vue', ['aria-label="删除交付明细"', '至少保留一行交付明细']);
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    'const selectedReceiptLineIds = ref<string[]>([]);',
    'function toggleReceiptLine(',
    '<span>本次到货</span>',
    'products: submitted.products.filter((product, index) => receiptLineIsSelected(product, index))',
  ]);
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', [
    'aria-label="删除到货明细"',
    'title="本次不登记该行"',
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    'aria-label="删除质检明细"',
    'documentDraft.products.length > 1',
  ]);
});

run('shared muted text keeps normal-text contrast on shell and table backgrounds', () => {
  expectIncludesAll('src/styles/main.css', [
    '--muted: #6d6e67',
    '--shell-bg: #f7f7f3',
  ]);
  expectExcludes('src/styles/main.css', ['--muted: #73746d']);
});

run('required reference pickers expose required semantics without marking optional references', () => {
  expectIncludesAll('src/components/ReferencePicker.vue', [
    'required?: boolean',
    'required: false',
    ':aria-required="required || undefined"',
    'role="textbox"',
    'aria-readonly="true"',
    ':aria-label="title"',
  ]);
  for (const file of [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
    'src/views/QualityDocumentEditorView.vue',
    'src/views/Production2View.vue',
    'src/views/MasterMaterialEditorView.vue',
  ]) {
    expectIncludesAll(file, ['<ReferencePicker', 'required']);
  }
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [':required="field.required"']);
});

run('production and quality rule pages avoid business-flow noise where appropriate', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    "isProductionRuleDocument.value ? '维护状态' : '流程节点'",
    'const productionDocumentSummaryTitle',
    "? '规则摘要'",
    ": '单据摘要'",
    "&& ['tasks', 'material-requests', 'work-orders', 'recipes', 'process-templates', 'exceptions'].includes(activeListKey.value)",
  ]);
  expectIncludesAll('src/views/QualityView.vue', [
    "activePage === 'standards'",
    'to="/quality/standards/new"',
    ':to="`/quality/standards/${encodeURIComponent(row.code)}`"',
    'quality-status-button',
    'class="standard-identity"',
    'class="standard-check-summary"',
    '<span>检查项/维护</span>',
    '.quality-list-shell.quality-standards-shell.with-status-column',
  ]);
  expectIncludesAll('src/views/QualityStandardEditorView.vue', [
    'class="quote-editor quality-standard-editor"',
    'title="维护状态"',
    'class="quality-standard-check-table"',
    "response.createdVersion ? `${response.record.code} 新版本草稿已建立`",
    'const isVersionFork = computed',
    "return '建立质检标准新版本'",
    ':value="projectedCode"',
    ':primary-status="editorStatus"',
    "label: '来源版本'",
  ]);
  expectIncludesAll('src/router/index.ts', [
    "path: 'quality/standards/new'",
    "path: 'quality/standards/:code/edit'",
    "path: 'quality/standards/:code'",
    'component: QualityStandardEditorView',
  ]);
  expectExcludes('src/views/QualityView.vue', ['quality-create-panel', 'quality-standard-panel', '不良概览']);
});

run('incoming quality detail keeps its quantity projection grid isolated from generic detail styles', () => {
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    'class="incoming-outcome-readonly-grid"',
    '.incoming-outcome-readonly-grid {',
    'grid-template-columns: repeat(4, minmax(0, 1fr));',
    '.inspection-item-card .incoming-outcome-readonly-grid > div {',
    'grid-template-columns: minmax(0, 1fr);',
    'class="incoming-outcome-disposition"',
  ]);
});

run('master data production line routes use kebab-case paths consistently', () => {
  expectIncludesAll('shared/system-menu-defaults.json', ['"/master-data/production-lines"']);
  expectExcludes('shared/system-menu-defaults.json', ['"/master-data/productionLines"']);
  expectIncludesAll('src/router/index.ts', [
    "page === 'productionLines' ? 'production-lines' : page",
  ]);
  expectExcludes('src/router/index.ts', ['alias: `master-data/${page}']);
  expectIncludesAll('src/views/MasterDataView.vue', [
    "'production-lines': 'productionLines'",
    "return page === 'productionLines' ? 'production-lines' : page;",
  ]);
  expectExcludes('src/views/MasterDataView.vue', ["productionLines: 'productionLines',"]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', ["listPath: '/master-data/production-lines'"]);
});

run('master data relationship facts and save closure stay aligned with the blueprint', () => {
  expectIncludesAll('src/services/api.ts', [
    'export type MaterialSupplierRelation',
    'export type WarehouseMaterialSetting',
    '/master-data/relations/material-suppliers',
    '/master-data/relations/warehouse-materials',
    'export async function saveMaterialSupplierRelations',
    'export async function saveWarehouseMaterialSettings',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function ensureMasterRelations',
    'delete row.salesUom;',
    'delete row.salesUomConversionRate;',
    'delete row.purchaseUom;',
    'delete row.purchaseUomConversionRate;',
    "delete row.purchaseLeadTimeDays;",
    "delete row.safetyStock;",
    "delete row.supplyMaterialCount;",
    "if (parts[1] === 'master-data' && parts[2] === 'relations')",
    "if (req.method === 'PUT' && parts[4])",
    "if (!isPurchasableMaterial(material) &&",
    "relations.materialSuppliers = [",
    "relations.warehouseMaterials = [",
    "throw requestError(400, '部门上下级关系不能形成循环。')",
  ]);
  expectIncludesAll('src/views/MasterMaterialEditorView.vue', [
    '可供供应商',
    '仓库补货设置',
  ]);
  expectExcludes('src/views/MasterMaterialEditorView.vue', [
    'salesUom',
    'purchaseUom',
    '销售换算',
    '采购换算',
    '每箱折合',
  ]);
  expectIncludesAll('src/services/api.ts', ['baseUom: string;']);
  expectExcludes('src/services/api.ts', ['purchaseUom: string;']);
  expectIncludesAll('src/views/MasterSupplierEditorView.vue', [
    'materialRelations.length',
    'relationDrafts.value',
    'saveMaterialSupplierRelations(',
    'kind="采购"',
    '添加物料',
    '已有关系请改为停用',
    '供应商料号',
    '起订量',
    '供货周期',
  ]);
  expectExcludes('src/views/MasterSupplierEditorView.vue', [
    '<span>可供物料数</span>',
    '<span>采购提前期（天）</span>',
    '<th>采购单位</th>',
    'relation.purchaseUom',
    "type: '原料供应商'",
  ]);
  expectIncludesAll('src/views/MasterWarehouseEditorView.vue', [
    '物料补货设置',
    '安全库存',
    '补货点',
    '最高库存',
    '补货批量',
    'replenishmentDrafts.value',
    'saveWarehouseMaterialSettings(',
    '已有设置请改为停用',
    'warehouse-identity-grid',
    '启用只表示仓库可被新业务引用；实际可承接的流程由业务职能决定',
    "if (Number(locationCount) <= 0) warehouseDraft.binPrefix = '';",
  ]);
  for (const [file, routeToken] of [
    ['src/views/MasterMaterialEditorView.vue', 'await router.replace(`/master-data/materials/${encodeURIComponent(savedMaterial.code)}`);'],
    ['src/views/MasterCustomerEditorView.vue', 'await router.replace(`/master-data/customers/${encodeURIComponent(savedCustomer.code)}`);'],
    ['src/views/MasterSupplierEditorView.vue', 'await router.replace(`/master-data/suppliers/${encodeURIComponent(savedSupplier.code)}`);'],
    ['src/views/MasterWarehouseEditorView.vue', 'await router.replace(`/master-data/warehouses/${encodeURIComponent(savedWarehouse.code)}`);'],
    ['src/views/MasterSimpleEditorView.vue', 'await router.replace(`${config.value.listPath}/${encodeURIComponent(saved.code)}`);'],
  ]) {
    expectIncludes(file, routeToken);
  }
});

run('customer and supplier removed ownership and range summaries stay outside list, export, and API boundaries', () => {
  expectIncludesAll('server/index.mjs', [
    "if (type === 'customers')",
    'delete row.owner;',
    'delete row.manager;',
    'delete row.primary;',
    'delete row.secondary;',
    'delete base.owner;',
    'delete base.manager;',
    'delete base.supplyMaterialCount;',
    'delete base.purchaseLeadTimeDays;',
    "const rows = ensureMasterRows(data, 'customers')",
    "const rows = ensureMasterRows(data, 'suppliers')",
  ]);
  expectExcludes('src/views/MasterDataView.vue', [
    "'可供物料数'",
    "'采购提前期（天）'",
    'row.supplyMaterialCount',
  ]);
  expectExcludes('src/views/MasterCustomerEditorView.vue', [
    'primary: `${customerDraft.contact}',
    'secondary: [customerDraft.province',
  ]);
  expectExcludes('src/views/MasterSupplierEditorView.vue', [
    'primary: `${supplierDraft.contact}',
  ]);
  expectIncludesAll('scripts/smoke-master-data-boundaries.mjs', [
    'customerRemoved',
    'supplierRemoved',
    'supplyMaterialCount',
    'purchaseLeadTimeDays',
    'updated customer',
    'updated supplier',
  ]);
});

run('material and warehouse removed compatibility summaries stay outside editor and API boundaries', () => {
  expectIncludesAll('server/index.mjs', [
    "if (type === 'materials')",
    "if (type === 'warehouses')",
    'delete row.owner;',
    'delete row.primary;',
    'delete row.secondary;',
    'delete base.owner;',
    'delete base.primary;',
    'delete base.secondary;',
  ]);
  expectExcludes('src/views/MasterMaterialEditorView.vue', [
    "owner: ''",
    'primary: [',
    'secondary: draft.note',
  ]);
  expectExcludes('src/views/MasterWarehouseEditorView.vue', [
    'primary: warehouseDraft.locationCount',
    'secondary: warehouseDraft.note',
  ]);
  expectIncludesAll('src/views/MasterDataView.vue', [
    "return row.locationCount ? `${row.locationCount} 个库位` : '不细分库位';",
    "row.locationCount ? `库位前缀 ${row.binPrefix || '—'}` : '不细分库位'",
  ]);
  expectExcludes('src/views/MasterDataView.vue', [
    "row.primary || '未维护库位'",
    "row.primary || '未维护库位说明'",
  ]);
  expectIncludesAll('scripts/smoke-master-data-boundaries.mjs', [
    'materialRemoved',
    'warehouseRemoved',
    'updated material',
    'updated warehouse',
    'unitReferences',
    'departmentReferences',
    'employeeReferences',
  ]);
});

run('master-data search and production-line filters only use visible page facts', () => {
  expectIncludesAll('src/views/MasterDataView.vue', [
    'function masterSearchValues(row: MasterDataRecord): unknown[]',
    'const matchesSearch = includesKeyword(masterSearchValues(row));',
    "suppliers: '搜索供应商、联系人、联系方式、公司地址'",
    "employees: '搜索员工、部门、岗位、账号或联系方式'",
    "productionLines: '搜索产线编码、名称、类型、部门、车间或适用范围'",
    "productionLines: '所属部门'",
    'return [row.code, row.name, row.englishAbbreviation];',
    'return [row.code, row.name, row.owner, row.parentDepartment];',
  ]);
  expectExcludes('src/views/MasterDataView.vue', [
    "productionLines: '管理部门'",
    "productionLines: '搜索产线编码、名称、类型、车间、用途'",
    'row.defaultShipAddress,\n      row.defaultLogisticsMode,',
  ]);
});

run('master reference candidates use object-specific non-duplicate summaries', () => {
  expectIncludesAll('server/index.mjs', [
    "if (type === 'uom')",
    "primary: row.englishAbbreviation ? `英文简称 ${row.englishAbbreviation}` : ''",
    "if (type === 'departments')",
    "secondary: row.parentDepartment ? `上级 ${row.parentDepartment}` : row.note || ''",
    "if (type === 'employees')",
    'primary: [row.englishName, row.owner, row.position].filter(Boolean).join(\' · \')',
    'secondary: [row.phone, row.email].filter(Boolean).join(\' · \')',
    "if (type === 'equipment')",
    "meta: [row.serialNumber ? `出厂编号 ${row.serialNumber}` : ''].filter(Boolean)",
    "if (type === 'productionLines')",
    'meta: [row.processScope].filter(Boolean).map(String)',
  ]);
  expectExcludes('server/index.mjs', [
    "primary: row.primary || [row.type, row.owner].filter(Boolean).join(' · ') || '-'",
    'meta: [row.owner, row.phone || row.contact, row.email].filter(Boolean).map(String)',
  ]);
});

run('unit master keeps one business label, future English abbreviation, and material reference locks explicit', () => {
  expectIncludesAll('src/views/MasterDataView.vue', [
    "{ key: 'name', label: '单位'",
    "{ key: 'englishAbbreviation', label: '英文简称'",
    "uom: 'minmax(220px, 1.4fr) minmax(150px, .9fr) minmax(190px, 1.1fr)'",
    "['编码', '单位', '英文简称', '使用状态', '更新时间', '备注']",
  ]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    'lockWhenReferenced?: boolean',
    'const currentUomReferences = computed',
    'const uomDefinitionLocked = computed',
    '需要新口径时请新建单位',
    "label: '英文简称'",
  ]);
  expectExcludes('src/views/MasterSimpleEditorView.vue', [
    '<section v-if="page === \'uom\'" class="summary-section">',
    '<div><dt>引用物料</dt><dd>{{ currentUomReferences.materials.length }} 项</dd></div>',
  ]);
  expectIncludesAll('server/index.mjs', [
    '单位和英文简称不能为空',
    '单位或英文简称已存在',
    '不能修改；请新建单位',
    '不能停用',
    'delete row.symbol;',
    'delete row.baseUom;',
    'delete row.conversionRate;',
    'delete row.decimalPrecision;',
    'delete row.owner;',
    'delete row.primary;',
    'delete row.secondary;',
    'englishAbbreviation,',
  ]);
  expectExcludes('src/views/MasterSimpleEditorView.vue', [
    '单位符号',
    '单位类型',
    '基准单位',
    '换算系数',
    '小数精度',
    '换算与精度',
    '下级换算单位',
    "owner: '基础资料'",
    "title: '岗位与联系'",
    "title: '联系、开票与银行资料'",
  ]);
  expectExcludes('src/views/MasterDataView.vue', [
    '单位符号',
    '单位类型',
    '基准单位',
    '换算系数',
    '小数精度',
  ]);
});

run('department master is concise while company, hierarchy, live headcount, and reference guards remain explicit', () => {
  expectIncludesAll('src/views/MasterDataView.vue', [
    "{ key: 'parentDepartment', label: '公司/上级'",
    "emptyCell(row.parentDepartment, '公司直属')",
    "['编码', '部门名称', '所属公司', '上级部门', '启用员工数'",
    "activePage === 'departments'",
  ]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    "label: '所属公司'",
    "referenceType: 'company'",
    "fallback: '公司直属'",
    "delete record.type",
    "delete record.manager",
    "delete record.primary",
    "delete record.secondary",
    'const linkedDepartmentEmployees = computed',
    'const linkedActiveChildDepartments = computed',
    'const linkedDepartmentMasterResources = computed',
    'const linkedActiveDepartmentMasterResources = computed',
    'const departmentParentExcludeCodes = computed',
    "page.value === 'departments' && field.key === 'parentDepartment'",
    ':exclude-codes="referenceExcludeCodes(field)"',
    ':company="referenceCompany(field)"',
    '账号权限仍由系统角色单独控制',
  ]);
  expectIncludesAll('server/index.mjs', [
    '部门必须归属已启用的公司',
    '同一公司内不能存在同名部门',
    'delete row.type',
    'delete row.manager',
    'delete row.primary',
    'delete row.secondary',
    'delete base.type',
    'delete base.manager',
    'delete base.primary',
    'delete base.secondary',
    '上级部门必须属于同一公司',
    '仍有 ${linkedChildren.length} 个启用下级部门',
    '仍被${summary}引用，请先调整或停用相关资源',
    '不能直接改名；请先调整引用关系',
    "type === 'departments'",
    "type !== 'departments' || !company || row.company === company || row.owner === company",
  ]);
  expectExcludes('src/views/MasterDataView.vue', [
    "departments: '搜索部门、负责人'",
    "{ key: 'manager', label: '部门负责人'",
    "{ key: 'name', label: '部门', value: (row) => row.name, meta: (row) => `${row.code} · ${emptyCell(row.type)}`",
    "'主要职责', '使用状态'",
  ]);
  expectExcludes('src/views/MasterSimpleEditorView.vue', [
    "label: '部门类型'",
    "label: '部门负责人'",
    "label: '主要职责'",
    "title: '主要职责'",
    "label: '职责范围'",
    "referenceTitle: '选择部门负责人'",
    "kicker: '组织身份'",
    '<h2>启用引用</h2>',
    '部门名称已锁定',
  ]);
  expectExcludes('server/index.mjs', ['部门负责人必须选择启用且在职的员工']);
});

run('employee master keeps a concise personnel boundary and server-projected account link', () => {
  expectIncludesAll('src/views/MasterDataView.vue', [
    "{ key: 'name', label: '员工', value: (row) => row.name, meta: (row) => [row.englishName, row.code].filter(Boolean).join(' · ')",
    "{ key: 'owner', label: '部门/岗位'",
    "{ key: 'status', label: '使用状态'",
    "{ key: 'status', label: '使用状态', options: filterStatusOptions.value }",
    'status-sort-label="使用状态优先"',
    "'岗位/职务', '关联账号', '手机'",
    "关联账号：{{ row.linkedAccount || '未分配' }}",
  ]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    "statusHeading: '使用状态'",
    "{ key: 'status', label: '使用状态'",
    "title: '岗位归属'",
    "{ key: 'englishName', label: '英文名'",
    "{ key: 'linkedAccount', label: '关联账号', placeholder: '在系统模块中分配', disabled: true }",
    "title: '联系信息'",
    "title: '备注'",
    "{ key: 'note', label: '说明'",
    "item.key === 'linkedAccount'",
    "displayValue('linkedAccountStatus', '—')",
    'const employeeStatusBlockReason = computed',
    'delete employeeRecord.type',
    'delete employeeRecord.supervisor',
    'delete employeeRecord.employmentStatus',
    'delete employeeRecord.contact',
    'delete employeeRecord.primary',
    'delete employeeRecord.secondary',
    'delete employeeRecord.birthDate',
    'delete employeeRecord.homeAddress',
    'delete employeeRecord.emergencyContactName',
    'delete employeeRecord.emergencyContactPhone',
    "title: '岗位归属'",
    "title: '联系信息'",
  ]);
  expectIncludesAll('server/index.mjs', [
    "if (type === 'employees')",
    'delete row.type',
    'delete row.supervisor',
    'delete row.employmentStatus',
    'delete row.contact',
    'delete row.primary',
    'delete row.secondary',
    'delete base.linkedAccount',
    'delete base.linkedAccountStatus',
    '员工必须选择所属部门',
    "linkedAccountStatus: linkedAccount?.status || '未分配'",
    "linkedAccountStatus: account?.status || '未分配'",
  ]);
  expectExcludes('src/views/MasterDataView.vue', ['用工类型', '任职状态', '直属上级']);
  expectExcludes('src/views/MasterSimpleEditorView.vue', [
    '用工类型',
    '任职状态',
    '直属上级',
    'employeeEmploymentBlockReason',
    "kicker: '员工身份'",
    "kicker: '岗位关系'",
    "birthDate: ''",
    "homeAddress: ''",
    "emergencyContactName: ''",
    "emergencyContactPhone: ''",
  ]);
  expectOrdered('src/views/MasterSimpleEditorView.vue', [
    "{ key: 'name', label: '姓名', placeholder: '填写员工姓名', required: true }",
    "{ key: 'gender', label: '性别'",
    "{ key: 'hireDate', label: '入职日期'",
    "title: '岗位归属'",
    "title: '联系信息'",
    "{ key: 'phone', label: '手机'",
    "{ key: 'email', label: '邮箱'",
    "title: '备注'",
  ], 'employee editor fact grouping');
  expectExcludes('server/index.mjs', ['离职员工', '未离职', '员工上下级关系', '请选择有效的直属上级']);
});

run('company master keeps bilingual print facts concise while protecting legal identity and active dependents', () => {
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    "{ key: 'name', label: '公司名称'",
    "{ key: 'englishName', label: '英文名称'",
    "{ key: 'englishAddress', label: '英文地址'",
    "title: '联系与地址'",
    "title: '开票与银行资料'",
    "{ label: '英文资料', keys: ['englishName', 'englishAddress'] }",
    "englishName: source.englishName ?? ''",
    "englishAddress: source.englishAddress ?? ''",
    'lockWhenReferenced: true',
    'const companyMasterReferences = computed',
    'const companyStatusBlockReason = computed',
    '默认税率必须是 0% 到 100% 之间的数值',
    '请填写有效的公司官网地址',
  ]);
  expectIncludesAll('src/views/MasterDataView.vue', [
    "company: '搜索公司、中英文名称或地址'",
    'emptyCell(row.englishName)',
    'emptyCell(row.englishAddress)',
    "'英文名称'",
    "'英文地址'",
  ]);
  expectExcludes('src/views/MasterSimpleEditorView.vue', [
    '<h2>引用情况</h2>',
    '<dt>启用部门</dt>',
    '<dt>启用仓库</dt>',
    'const companyNameHint = computed',
    "kicker: '经营主体'",
    "kicker: '联系与结算'",
  ]);
  expectIncludesAll('server/index.mjs', [
    '统一社会信用代码必须是 18 位数字或大写字母',
    '公司名称或统一社会信用代码已存在',
    '默认税率必须是 0% 到 100% 之间的数值',
    '公司官网只支持有效的 HTTP 或 HTTPS 地址',
    '公司已被部门或仓库引用，不能直接改名',
    '个启用部门和 ${activeWarehouses.length} 个启用仓库引用',
    'invoiceTitle: String(base.invoiceTitle || \'\').trim() || companyName',
    "englishName: String(base.englishName || '').trim()",
    "englishAddress: String(base.englishAddress || '').trim()",
    'seal: Math.min(3, Math.max(0, Number(base.seal) || 0))',
    'delete base.owner;',
    'delete base.manager;',
  ]);
});

run('equipment master stays an independent production resource without an asset-purchase ledger', () => {
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    "title: '使用信息'",
    "title: '说明'",
    'const equipmentDepartmentBlockReason = computed',
    'delete equipmentRecord.type',
    'delete equipmentRecord.manager',
    'delete equipmentRecord.operatingState',
    'delete equipmentRecord.maintenanceCycleWeeks',
    'delete equipmentRecord.sourcePurchase',
    'delete equipmentRecord.secondary',
  ]);
  expectIncludesAll('src/views/MasterDataView.vue', [
    "{ key: 'serialNumber', label: '出厂编号'",
    "activePage === 'equipment'",
  ]);
  expectExcludes('src/views/MasterDataView.vue', [
    "'资产类型'",
    "'保养周期（周）'",
  ]);
  expectIncludesAll('server/index.mjs', [
    '设备出厂编号已存在',
    '启用设备必须归属有效且启用的部门',
    'delete base.type',
    'delete base.manager',
    'delete base.operatingState',
    'delete base.maintenanceCycleWeeks',
    'delete base.sourcePurchase',
    'delete row.secondary',
  ]);
  expectExcludes('src/views/MasterSimpleEditorView.vue', [
    "label: '资产类型'",
    "label: '资产负责人'",
    '资产负责人必须属于所选部门',
    '保养周期必须是大于或等于 0 的整数周',
    "page === 'equipment' || page === 'productionLines'",
    "kicker: '设备身份'",
    "kicker: '使用管理'",
    "title: '归属、位置与来源'",
    "title: '规格与来源'",
  ]);
  expectOrdered('src/views/MasterSimpleEditorView.vue', [
    "{ key: 'brand', label: '品牌'",
    "{ key: 'model', label: '型号'",
    "{ key: 'serialNumber', label: '出厂编号'",
    "{ key: 'spec', label: '规格'",
    "title: '使用信息'",
    "{ key: 'primary', label: '使用位置'",
    "{ key: 'startDate', label: '启用日期'",
    "title: '说明'",
  ], 'equipment editor fact grouping');
});

run('production-line master keeps concise identity, department, location, capacity, and execution boundaries', () => {
  expectIncludesAll('src/views/MasterDataView.vue', [
    "{ key: 'workshop', label: '所属/位置'",
    "{ key: 'capacity', label: '标准产能'",
    "'所属部门', '车间/区域', '标准产能', '产能单位', '适用范围'",
    "v-else-if=\"activePage === 'productionLines'\"",
    "row.workshop || '—'",
    "适用范围：{{ row.processScope || '—' }}",
  ]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    "options: ['挤出产线', '复绕产线', '包装产线', '试验产线']",
    'const productionLineDepartmentBlockReason = computed',
    "title: '归属与位置'",
    "title: '产能与适用范围'",
    "title: '归属与能力'",
    "function fieldOptions(field: FieldConfig)",
    "page.value === 'productionLines' && item.key === 'capacityValue'",
    'function fieldPlaceholder(field: FieldConfig)',
    '大盘半成品复绕为 1kg 小盘成品',
    '标准产能必须大于 0',
    '实际占用和执行状态由设备作业记录判断',
    'delete productionLineRecord.manager',
    'delete productionLineRecord.operatingState',
    'delete productionLineRecord.primary',
    'delete productionLineRecord.secondary',
  ]);
  expectExcludes('src/views/MasterSimpleEditorView.vue', [
    "label: '负责人'",
    "kicker: '产线身份'",
    "kicker: '生产能力'",
    "kicker: '补充说明'",
    'operatingStateSummary',
    'productionLineAssignmentBlockReason',
    '启用产线必须选择启用负责人',
    '产线负责人必须属于所选部门',
  ]);
  expectIncludesAll('server/index.mjs', [
    "if (type === 'productionLines')",
    '产线名称已存在',
    '标准产能必须大于 0',
    '启用产线必须归属有效且启用的部门',
    '产线仍有 ${openJobs.length} 个未结束设备作业',
    'delete row.operatingState',
    'delete base.operatingState',
    'delete base.primary',
    'delete base.secondary',
  ]);
  expectExcludes('server/index.mjs', [
    '产线负责人必须属于所选部门',
    '启用产线必须选择启用负责人',
    "operatingState: existing?.operatingState || '正常'",
  ]);
  expectIncludesAll('server/seed-data.mjs', [
    "code: 'LINE-REWIND-01'",
    "type: '复绕产线'",
    "capacityUnit: '卷/班'",
  ]);
  expectIncludesAll('scripts/smoke-production-lines.mjs', [
    "const removedFields = ['manager', 'operatingState', 'primary', 'secondary']",
    'production-line active-job guard returned an unclear error',
    'rewind capacity continues to use a separate roll-based unit',
  ]);
});

run('sales receipt, after-sales, and completed-order evidence use independent persisted facts', () => {
  expectIncludesAll('src/services/api.ts', [
    'export async function confirmSalesOrderReceipt',
    '/confirm-receipt',
  ]);
  expectIncludesAll('server/index.mjs', [
    "parts[4] === 'confirm-receipt'",
    "requestDoc.status = '已签收'",
    "deliveryStatus = outboundQty <= 0",
    "? tracking.length ? '待出库' : '待分配'",
    ": signed ? '已签收' : '待签收'",
    '尚无实际出库或签收数量，不能登记销售售后',
    'existing?.sourceOrder || input.sourceOrder',
    'normalizeAfterSaleAffectedProducts(',
    '必须先填写处理结果，才能提交确认',
    '必须先填写客户确认依据，才能关闭',
    'salesAfterSaleResponsibility(action)',
    '售后受理后不能改写问题登记事实',
    '完成依据不能再修改',
    '请先完成全部协同任务，再填写处理结果和确认金额',
    '客户确认依据只能在待确认阶段填写',
    "['草稿', '待发货', '已提交', '仓库已受理', '部分出库', '部分发货', '已退回']",
  ]);
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    'confirmSalesOrderReceipt',
    "const progress = structuredProgress(orderDraft.value, 'delivery');",
    "? progress === '待签收'",
    '确认签收后，交付进度更新为已签收，订单仍保持已确认',
  ]);
  expectExcludes('src/views/SalesOrderEditorView.vue', [
    "status: '待开票',\n        action: '确认签收'",
  ]);
  expectIncludesAll('src/views/AfterSalesDocumentView.vue', [
    'useAsyncActionState<AfterSalesAsyncAction>()',
    'deliveredQty > 0',
    ":aria-busy=" + '"activeAfterSalesAction === \'save\'"',
    'data-after-sales-field="issueType"',
    'data-after-sales-field="issueDescription"',
    'v-model="product.qty"',
    'newAfterSalesProductRows',
    'availableQuantityText(record.sourceOrder, product)',
    "pendingKinds.length ? `等待${pendingKinds.join('、')}` : '等待前置任务'",
    '{{ record.partyRole }}',
    "record.status === '待确认' || record.status === '已关闭'",
    'isSalesFollowUpEdit',
    '<h2>售后概要</h2>',
    '<h2>协同进度</h2>',
    'v-if="showResultSection"',
    "record.processingResult || '尚未形成处理结果'",
    'advanceBlockReason',
  ]);
  expectExcludes('src/views/AfterSalesDocumentView.vue', [
    "kind === 'sales'\" class=\"form-field\" data-after-sales-field=\"responsibility\"",
  ]);
  expectIncludesAll('src/views/SalesOutboundRequestView.vue', [
    "['已出库', '已发完', '已签收', '已完成', '已作废']",
    "status === '已签收' || status === '已完成'",
    'v-if="showDeliveryCapability"',
  ]);
  expectIncludesAll('src/views/SalesView.vue', [
    "['草稿', '已驳回', '已确认'].includes(row.status)",
    "['已出库', '已发完', '已签收', '已完成', '已作废']",
    "status === '已签收' || status === '已完成'",
  ]);
  expectIncludesAll('src/views/SalesQuoteEditorView.vue', [
    "['草稿', '已确认'].includes(quoteStatus.value) && isQuoteExpired.value",
    "v-if=\"quoteStatus === '草稿' && !isQuoteExpired\"",
  ]);
  expectIncludesAll('server/seed-data.mjs', [
    "code: 'WS-20260601-003'",
    "code: 'SI-20260603-002'",
    "code: 'AR-20260603-002'",
    "sourceLineId: 'L1'",
  ]);
});

run('cross-module status architecture keeps lifecycle, progress, exceptions, and current work separate', () => {
  expectIncludesAll('src/views/SalesView.vue', [
    '<strong>单据状态</strong>',
    '<small>生产 · 交付 · 开票 · 收款</small>',
    'orderFulfillmentSnapshot(row).attention',
  ]);
  expectIncludesAll('src/views/PurchaseView.vue', [
    'function purchaseOrderProgressSnapshot(row: PurchaseOrder)',
    '<strong>采购跟进</strong>',
    '到货 · 质检 · 入库 · 收票 · 付款',
    'purchaseOrderProgressSnapshot(row).attention',
    'statusClass(purchaseOrderStatusLabel(row.status))',
  ]);
  expectExcludes('src/views/PurchaseView.vue', [
    'class="purchase-progress-compact"',
  ]);
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    '<span>下一步</span>',
    "import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';",
    ':title="`${documentTitle}状态`"',
    ':items="[]"',
    "label: '提醒/异常'",
    ':items="purchaseProgressRows"',
  ]);
  expectExcludes('src/views/PurchaseOrderEditorView.vue', [
    'quote-stage-list',
    '<h2>单据状态</h2>',
    '<h2>履约进度</h2>',
  ]);
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    "import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';",
    ':primary-status="orderDocumentStatus"',
    ':items="orderProgressRows"',
  ]);
  expectIncludesAll('src/components/DocumentStatusPanel.vue', [
    'class="document-status-panel"',
    'class="document-status-dimensions"',
    "statusPresentationTone(item.value)",
  ]);
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    "import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';",
    ':primary-status="receiptLifecycleStatus"',
    ':items="receiptStatusPanelItems"',
  ]);
  expectIncludesAll('src/views/WarehouseSalesIssueEditorView.vue', [
    "import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';",
    ':primary-status="issueLifecycleStatus"',
    ':items="issueStatusPanelItems"',
  ]);
  expectIncludesAll('src/views/FinanceSalesInvoiceEditorView.vue', [
    "import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';",
    ':primary-status="invoiceLifecycleStatus"',
    ':items="invoiceStatusPanelItems"',
  ]);
  expectIncludesAll('src/views/FinancePurchaseInvoiceEditorView.vue', [
    "import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';",
    ':primary-status="invoiceLifecycleStatus"',
    ':items="summaryRows"',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    "warehouseSubtitle: isWaitingArrival ? '' : row.location ? inventoryLocationLabel(row.location) : '库位未登记'",
    "warehouseContext: isWaitingArrival ? '计划暂存仓' : '实际暂存'",
    "'purchase-receipt-status-shell': activePage === 'purchaseReceipts'",
    'itemSubtitle: receiptProductSubtitle(row.products)',
    'const itemQuantity = receiptProductQuantitySummary',
    '<strong>当前进度</strong>',
    '<small>任务 · 质检 · 入库 · 待办</small>',
    "{ label: '质检', value: row.qualityProgress || '无需质检' }",
    "{ label: '入库', value: row.inboundProgress || '未开始' }",
    'const status = row.reversalCode ? \'已冲销\' : row.status;',
    ':next-step="warehouseNextStep(row)"',
    ':next-step-label="[\'purchaseReceipts\', \'salesIssues\', \'afterSalesTasks\'].includes(row.page) ? \'当前待办\' : \'下一步\'"',
    ':show-amount-sort="![\'purchaseReceipts\', \'afterSalesTasks\'].includes(activePage)"',
    ':status-sort-label="[\'purchaseReceipts\', \'salesIssues\', \'afterSalesTasks\'].includes(activePage) ? \'当前待办优先\' : undefined"',
    "statusSortKey: nextStep === '登记入库' ? '待入库' : status",
    'const purchaseReceiptStatusFilterOrder = [',
    "hasPlanned && planned !== arrival ? `计划 ${planned}` : ''",
    "owner: isWaitingArrival ? '' : warehouseActorLabel(row.owner, '')",
    "cardValue: itemQuantity",
  ]);
  expectExcludes('src/views/WarehouseView.vue', [
    '部分待确认',
    "? '等待协同'",
    "{ label: '阶段', value: row.rawStatus || row.status }",
    "'质检进度'",
    "'入库进度'",
    "row.status === '待收货' ? '待选择库位'",
    "'登记正式入库'",
    "products.length > 1 ? `${products.length} 项物料` : ''",
  ]);
  expectIncludesAll('src/views/FinanceView.vue', [
    'finance-list-shell with-status-column',
    '<strong>单据状态</strong>',
    '<small>结算 · 下一步</small>',
    "settled + 0.01 >= total ? '已结清' : '执行中'",
    '<small><b>结算</b><span>{{ row.settlementStatus }}</span></small>',
    '<small><b>下一步</b><span>{{ row.nextStep }}</span></small>',
  ]);
  expectIncludesAll('src/views/FinanceReceivableEditorView.vue', [
    "import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';",
    ':primary-status="receivableLifecycleStatus"',
    ':items="receivableStatusPanelItems"',
  ]);
  expectIncludesAll('src/views/FinancePayableEditorView.vue', [
    "import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';",
    ':primary-status="payableLifecycleStatus"',
    ':items="payableStatusPanelItems"',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    "statusColumnTitle: '工单状态'",
    ':primary-status="workOrderLifecycleStatus"',
    ':items="workOrderStatusPanelItems"',
    ':primary-status="executionCardLifecycleStatus"',
    ':items="executionCardStatusPanelItems"',
    'class="production-card-progress"',
    'productionListStatusOverview(row).facts',
    'class="production-card-attention"',
  ]);
  expectIncludesAll('src/views/QualityView.vue', [
    'const projection = projectQualityState({',
    'const qualityStatusColumnTitle = computed',
    'const qualityProgressDimensionLabels = computed',
    "? `${conclusionColumnLabel.value} · 处置 · 当前待办`",
    'class="quote-status-cell order-status-link quality-overview-cell"',
    ':next-step="qualityListAction(row)"',
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    ':primary-status="qualityLifecycleStatus"',
    ':items="qualityStatusPanelItems"',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function incomingQualityDispositionProjection(data, qualityCode, status)',
    'dispositionStage: dispositionProjection.stage',
    'currentAction: dispositionProjection.currentAction',
  ]);
  expectIncludesAll('src/views/MasterDataView.vue', [
    "{ key: 'status', label: '使用状态'",
  ]);
  expectExcludes('src/views/MasterDataView.vue', ["emptyCell(row.operatingState, '未维护运行状态')"]);
});

run('five-module list identifiers and create actions preserve the compact visual baseline', () => {
  expectIncludesAll('src/views/SalesView.vue', [
    '.order-page .order-table .quote-code {',
    'white-space: nowrap;',
    'minmax(108px, 0.82fr)',
  ]);
  expectIncludesAll('src/views/FinanceView.vue', [
    "salesInvoices: '新建'",
    "purchaseInvoices: '新建'",
    ':title="`新建${pageTitle}`"',
    'quote-status-column finance-status-column',
  ]);
  expectExcludes('src/views/FinanceView.vue', [
    "salesInvoices: '新建销售发票'",
    "purchaseInvoices: '新建采购发票'",
  ]);
});

run('five-module list and document layouts keep the cross-module visual baseline', () => {
  expectIncludesAll('src/styles/main.css', [
    '.finance-list-shell.with-status-column {\n  grid-template-columns: minmax(0, 1fr) 264px;',
    '.quote-status-cell > .mini-status {\n  justify-self: start;',
    '.master-status-update-cell {\n  display: grid;\n  align-content: center;\n  justify-items: start;',
    '.master-status-update-cell > .mini-status {\n  width: auto;\n  max-width: 100%;\n  justify-self: start;',
    '.master-material-table .table-head {\n  height: 40px;\n  min-height: 40px;',
    '.inspection-item-card dl > div {\n  grid-template-columns: minmax(108px, auto) minmax(0, 1fr);',
    '.purchase-page .after-sales-list-shell .after-sales-table {\n    min-width: 0;',
    '.sales-quote-editor .quote-line-row,',
    '.warehouse-document-editor .warehouse-document-line-row,',
    '.finance-document-editor .finance-match-line {',
  ]);
  expectExcludes('src/views/WarehouseView.vue', ['class="table-title quote-title"']);
  expectExcludes('src/views/FinanceView.vue', ['class="table-title quote-title"']);
  expectIncludesAll('src/views/PurchaseView.vue', [
    "afterSales: '新建'",
    "if (activePage.value === 'afterSales') return '/purchase/after-sales/new';",
  ]);
  expectIncludesAll('src/views/SalesView.vue', [
    '@media (max-width: 1260px) and (min-width: 761px)',
    'grid-template-columns: repeat(2, minmax(0, 1fr));',
    '.order-progress-scan > span:nth-child(odd) {',
    '.order-progress-scan > span:nth-child(n + 3) {',
  ]);
  expectIncludesAll('src/views/FinanceSalesInvoiceEditorView.vue', [
    "if (isNew.value) return '新建销售发票';",
    'if (isEdit.value) return invoiceDraft.value?.status !== \'待开票\' ? code : `编辑 ${code}`;',
    '.invoice-allocation-row {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n    min-width: 0;',
  ]);
  expectIncludesAll('src/views/FinancePurchaseInvoiceEditorView.vue', [
    "if (isNew.value) return '新建采购发票';",
    'if (isEdit.value) return invoiceDraft.value?.status !== \'待收票\' ? code : `编辑 ${code}`;',
  ]);
  expectIncludesAll('src/views/FinanceReceivableEditorView.vue', [
    "receivableDraft.value?.code || '应收账款'",
  ]);
  expectIncludesAll('src/views/FinancePayableEditorView.vue', [
    "payableDraft.value?.code || '应付账款'",
  ]);
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    'v-if="receiptActionDialogMode === \'arrival\'"',
    'class="receipt-arrival-line-actions"',
  ]);
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    "'no-actions': isReadOnly || hasAuthoritativeProductionLines",
    "'production-issue-line-row': isAuthoritativeProductionIssue",
  ]);
});

run('production returns use original-issue limits and server-backed inventory posting', () => {
  expectIncludesAll('server/index.mjs', [
    'data.warehouse.productionReturns ||= []',
    'function normalizeProductionReturn(data, input, existing)',
    'function postProductionReturnToStock(data, record, idempotencyKey, actor)',
    'productionReturnReservedQty(warehouse, issue.code, source, record.code)',
    "if (parts[2] === 'production-returns')",
    "appendLedger(\n      warehouse,\n      row,\n      source,\n      quantity",
  ]);
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    "currentKind.value === 'productionReturns'",
    '|| isAuthoritativeProductionReturn.value',
    'await saveProductionReturn(documentDraft.value as any)',
    'await submitProductionReturn(saved.code)',
    'await postProductionReturn(saved.code, idempotencyKey)',
    '原领料单',
    '请先选择原领料单，系统会带入仍可退回的物料、原批次和原仓库。',
    '最多可退 {{ productionReturnAvailableQty(item) }} {{ item.uom }}',
  ]);
  expectIncludesAll('src/router/index.ts', [
    "name: 'warehouse-production-return-new'",
    "name: 'warehouse-production-return-edit'",
    "name: 'warehouse-production-return-detail'",
    "warehouseDocumentKind: 'productionReturns'",
  ]);
  expectExcludes('src/views/WarehouseOperationEditorView.vue', [
    "kind: 'production-status'",
    'localSupplementaryProductionDrafts',
  ]);
});

run('production return pages stay source-driven, status-separated and noise-reduced', () => {
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    'const returnableProductionIssues = computed',
    'productionIssueReturnableLineCount(issue)',
    `v-if="(!isAuthoritativeProductionReturn && !isAuthoritativeProductionReceipt) || isDetail || documentDraft.materialIssue || documentDraft.executionCard"`,
    `v-if="(isDetail || isAuthoritativeProductionReturn || isAuthoritativeProductionReceipt) && documentDraft.workOrder"`,
    'if (isStructuredProductionMaterialMove.value) {',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    "'production-return-status-shell': activePage === 'productionReturns'",
    'row.materialIssue,',
    '退料阶段 · 下一步',
    '确认退料入库',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.warehouse-operation-list-shell.production-return-status-shell .quote-status-column,',
    '.warehouse-operation-list-shell.production-receipt-status-shell .quote-status-column {',
    '.warehouse-document-line-row.production-return-line-row {',
  ]);
  expectIncludesAll('server/index.mjs', [
    "reason: '生产余料退回'",
    "warehouseCode: String(issue.targetWarehouseCode || '')",
    "targetWarehouseCode: String(issue.warehouseCode || '')",
    "note: String(input.note || existing?.note || '')",
  ]);
});

run('production rule details render readable facts instead of disabled forms', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    'const processStepDocumentBasicFacts = computed<DetailFact[]>(() => [',
    "label: '适用路线/阶段'",
    'processStepBoundStageUsageLabels.value.join',
    '`${routeType} · ${processTemplateStepName(stepCode, routeType)}`',
    "import DocumentFactGrid from '../components/DocumentFactGrid.vue';",
    'aria-label="生产配方基础信息"',
    'aria-label="生产工艺基础信息"',
    'aria-label="生产任务基础信息"',
    ':facts="processStepDocumentBasicFacts"',
  ]);
  expectIncludesAll('src/components/DocumentFactGrid.vue', [
    'class="document-fact-grid"',
    'grid-template-columns: repeat(12, minmax(0, 1fr));',
    'props.facts.forEach((fact) => {',
  ]);
});

run('production tasks preserve source facts and lock downstream structure', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    'sourceLineId: string;',
    'const taskStructureIsEditable = computed(() =>',
    'const taskConfirmedEdit = computed(() =>',
    "if (taskConfirmedEdit.value || workOrderConfirmedEdit.value) return '保存变更';",
    'taskOperationalNextAction(raw)',
    "if (lifecycle === '草稿') return '编辑后提交';",
    "if (taskLifecycleStatusLabel.value === '草稿') return '编辑草稿';",
    'function taskProductQuantitySummary(',
    'function taskReleaseIsCompleteForProducts(',
    'workOrderSourceAllocationsFromRaw(',
    'allocation.taskCode === taskCode',
    'taskWorkOrderAllocationQty(order, line, taskCode)',
    "unit: '项'",
    'route: taskSourceDocumentRoute.value',
    "if (draft.sourceType === '销售订单缺口')",
    '/warehouse/inventory-alerts?tab=replenishment&keyword=',
    'function productionTaskDueAttention(',
    "label: '交期提醒'",
    'attention: productionTaskDueAttention(raw) || row.nextStep',
    "if (activePage.value === 'tasks') return productionTaskOperationalSort(a, b);",
    'function productionTaskOperationalSort(',
    "if (lifecycle === '草稿' || lifecycle === '已作废') return [];",
    'processTemplateCode: firstProduct ? workOrderRecommendedProcessCode(firstProduct.productCode)',
    'sourceDocument: taskSourceCode(option.task),',
    "? '交期优先'",
    "? '当前待办优先'",
    "? '要求日期从晚到早'",
    "? '要求日期从早到晚'",
    ": activePage.value === 'tasks' ? '交期从晚到早' : ''",
    ": activePage.value === 'tasks' ? '交期从早到晚' : ''",
    ':sort-date-label="filterDateLabel"',
    "returnTo: `/production/tasks/${encodeURIComponent(taskCode)}`",
    "if (taskLifecycleStatusLabel.value === '草稿') return '提交后核定';",
    "if (taskHasCompletedRelease.value) return '已全部安排';",
    '任务提交确认后，才能按成品明细创建生产工单。',
    '即时缺口/申请',
    "if (row.nextStep.includes('质检')) return '等待来料质检';",
    'value: taskSourceDocumentLabel.value',
    'function productionPlanningIdempotencyKey(',
    'revision: expectedRevision,',
    'idempotencyKey: requestKey.key,',
    'productionPlanningIdempotencyKeys.delete(response.idempotencyIntent);',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    'route: taskDraft.value.sourceCode.startsWith(\'SO-\')',
    '暂无备料申请，可根据缺口或临时备料需要发起申请。',
  ]);
  expectIncludesAll('server/index.mjs', [
    "throw requestError(409, '已确认生产任务不能重新保存为草稿，请使用“保存变更”。');",
    'const hasDownstreamDocuments = Boolean(existing)',
    "throw requestError(409, '生产任务已有备料申请或生产工单，成品、数量、单位和配方不可直接变更。');",
    'const sourceLineId = String(existing?.sourceLineId || input.sourceLineId || \'\').trim();',
    'data.production.planningCommands ||= [];',
    'function productionPlanningCommandReplay(production, kind, command, idempotencyKey)',
    "productionPlanningCommandReplay(production, 'tasks', command, body.idempotencyKey)",
    "return sendError(res, 409, '生产任务已被其他用户更新，请刷新后重新修改。');",
  ]);
});

run('production material requests automatically evaluate inventory and route purchase gaps', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    'const materialRequestLinesAreEditable = computed(() =>',
    'const materialRequestSelectableTypeOptions = computed(() =>',
    "if (materialRequestDraft.value.status === '草稿') return '尚未提交';",
    "if (materialRequestDraft.value.status === '待系统评估') return '系统评估中';",
    'const productionDocumentPrimaryIsHandoff = computed(() =>',
    '可用库存计划快照，不预留、不占用',
    '生产工单释放后再由仓库执行实际领料',
    'route: `/production/tasks/${encodeURIComponent(materialRequestDraft.value.sourceTaskCode)}`',
    'const persisted = toArray<Attachment>((row?.raw as AnyRecord | undefined)?.attachments);',
    'v-if="!productionDocumentIsReadOnlyView && !isProductionRecordDocument',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    'async function acceptCurrentProductionMaterialRequest()',
    '/production/material-requests/${encodeURIComponent(code)}/accept',
  ]);
  expectIncludesAll('server/index.mjs', [
    "function evaluateProductionMaterialRequestCoverage(data, request, actor = '系统')",
    "status: hasPurchaseGap ? '已转采购' : '库存可满足'",
    "'\u5f53\u524d\u53ef\u7528\u5e93\u5b58\u8ba1\u5212\u5feb\u7167\uff08\u4e0d\u9884\u7559\u3001\u4e0d\u5360\u7528\uff09'",
    "const evaluated = submitted",
    "parts[4] === 'accept'",
    "return sendError(res, 410, '仓库受理备料申请已取消；生产提交时由系统自动评估库存并分流采购缺口。');",
    "throw requestError(409, '已提交备料申请不能直接修改；库存覆盖由系统评估，缺口沿采购申请继续处理。');",
    "sourceMaterialRequest: request.code",
    "productionPlanningCommandReplay(production, 'material-requests', command, body.idempotencyKey)",
    "return sendError(res, 409, '备料申请已被其他用户更新，请刷新后重新修改。');",
  ]);
  expectExcludes('server/index.mjs', [
    'function acceptProductionMaterialRequest',
    "return operationPermissionCodes.warehousePost || 'PERM-WAREHOUSE-POST';",
  ]);
});

run('five-module detail pages keep the reviewed visual hierarchy', () => {
  expectIncludesAll('src/styles/main.css', [
    '.master-relation-table:not(.quote-detail-table) td small {',
    '.quote-editor.is-detail-view .quote-form-grid {',
    '.quote-editor.is-detail-view .order-next-step-strip {',
    '.quote-editor.is-detail-view .quote-summary-panel .order-progress-item,',
    '.quote-editor.is-detail-view .summary-section {',
    '.finance-document-editor.is-detail-view .finance-source-link {',
    '.quote-editor.is-detail-view .line-product-card {',
    '--detail-label-size: 11px;',
    '--detail-value-size: 13px;',
    '--detail-table-head-size: 12px;',
    '--detail-table-body-size: 13px;',
    '--detail-section-title-size: 15px;',
    '--detail-summary-title-size: 14px;',
    '.quote-editor.is-detail-view .form-field > span,',
    '.quote-editor.is-detail-view .quote-line-row:not(.quote-line-head) {',
    '.quote-editor.is-detail-view .master-relation-table {',
    '.quote-editor.is-detail-view .mini-status {',
  ]);
  for (const file of [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/SalesOutboundRequestView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
    'src/views/FinanceSalesInvoiceEditorView.vue',
    'src/views/FinancePurchaseInvoiceEditorView.vue',
    'src/views/MasterMaterialEditorView.vue',
  ]) {
    expectIncludes(file, "'is-detail-view'");
  }
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    '<h2>任务概览</h2>',
    'title="当前任务状态"',
    'class="warehouse-dialog-material-metrics"',
    '<MaterialIdentity',
    'class="purchase-inbound-progress-pair"',
    '<h2>到货与入库进度</h2>',
    '<h2>到货记录</h2>',
    'class="receipt-record-list"',
    'class="receipt-record-card"',
    '<dt>实际到货日期</dt>',
    '<dt>到货登记人</dt>',
    '<h2>入库记录</h2>',
    'purchase-inbound-empty-facts',
  ]);
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', [
    'receiptQuantitySummaryRows',
    '<h2>数量口径</h2>',
    '<h2>到货暂存与交接</h2>',
    'receipt-task-context',
    '当前处理 · {{ record.status }}',
    'isDisplayDetail',
    'isNew',
  ]);
  for (const file of [
    'src/views/FinanceSalesInvoiceEditorView.vue',
    'src/views/FinancePurchaseInvoiceEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'class="form-readonly-value quote-code finance-source-link"',
    ]);
    expectExcludes(file, ['Banknote,']);
  }
  expectIncludesAll('src/views/FinanceSalesInvoiceEditorView.vue', [
    '<span>开票公司</span>',
    "{{ invoiceDraft.company || '由销售订单带出' }}",
  ]);
  expectExcludes('src/views/FinanceSalesInvoiceEditorView.vue', ['<span>销售发票号</span>']);
  expectIncludesAll('src/views/FinancePurchaseInvoiceEditorView.vue', [
    '<span>收票公司</span>',
    '<span>供应商 / 联系人</span>',
    'class="invoice-line-readonly-value"',
    'DocumentLoadState',
  ]);
  expectExcludes('src/views/FinancePurchaseInvoiceEditorView.vue', [
    '<span>采购发票号</span>',
    'class="finance-match-overview"',
  ]);
});

run('finance detail pages share the common action rail and keep next-step guidance out of editors', () => {
  for (const file of [
    'src/views/FinanceSalesInvoiceEditorView.vue',
    'src/views/FinancePurchaseInvoiceEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'PinReferenceButton',
      'class="order-more-action-wrap"',
      'title="更多操作"',
      'id="detail-more-menu"',
      '<section v-if="isDetail" class="order-next-step-strip"',
    ]);
    expectExcludes(file, ['<section v-if="!isNew" class="order-next-step-strip"']);
  }
  for (const file of [
    'src/views/FinanceReceivableEditorView.vue',
    'src/views/FinancePayableEditorView.vue',
  ]) {
    expectIncludes(file, 'PinReferenceButton');
  }
  expectIncludesAll('src/views/PurchaseView.vue', [
    '.purchase-order-progress-scan > span {',
    'grid-template-columns: repeat(5, minmax(0, 1fr));',
    'align-content: center;',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.order-more-action-wrap::after {',
    'top: 100%;',
    'height: 8px;',
  ]);
  expectIncludesAll('src/views/FinanceSalesInvoiceEditorView.vue', [
    "new Set(['已确认', '已开票', '待收款', '部分收款', '已收款'])",
    "reversibleStatuses.has(invoiceDraft.status) && !hasReversal",
  ]);
});

run('detail summaries keep judgment facts and remove repeated primary fields', () => {
  expectIncludesAll('src/views/SalesOutboundRequestView.vue', [
    "{ label: '计划数量', value: formatQty(totalPlanned, unit) }",
    "{ label: '计划日期', value: draft.expectedDate || '-' }",
    "import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';",
    'title="状态与交付"',
    ':items="outboundStatusPanelItems"',
  ]);
  expectExcludes('src/views/SalesOutboundRequestView.vue', [
    "{ label: '来源订单', value: draft.sourceOrder || '-' }",
    "{ label: '客户', value: draft.customer || '-' }",
    "{ label: '发货仓库', value: draft.warehouse || '-' }",
  ]);
  expectIncludesAll('src/views/FinanceSalesInvoiceEditorView.vue', [
    '<h2>开票额度</h2>',
    'title="状态与结算"',
    "{ label: '本次后剩余可开', value: formatMoney(allocationSummary.value.remainingAmount) }",
  ]);
  expectIncludesAll('src/views/FinancePurchaseInvoiceEditorView.vue', [
    'title="状态与结算"',
    "{ key: 'matching', label: '三单匹配'",
    "label: '阻断差异'",
  ]);
  for (const file of [
    'src/views/FinanceReceivableEditorView.vue',
    'src/views/FinancePayableEditorView.vue',
  ]) {
    expectExcludes(file, ['const summaryRows = computed', '<h2>单据摘要</h2>', 'ClipboardList,']);
  }
  expectIncludesAll('src/views/PurchaseView.vue', [
    '<small :title="purchaseContentMeta(row)">{{ purchaseContentMeta(row) }}</small>',
    '<small :title="purchasePayableSummary(row)">{{ purchasePayableSummary(row) }}</small>',
    "row.expectedDate || '—'",
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.quote-editor.is-detail-view .required-label::after {',
    'content: none;',
  ]);
});

run('purchase and master-data navigation exclude the retired asset procurement ledger', () => {
  expectExcludes('shared/system-menu-defaults.json', ['MENU-PURCHASE-ASSETS', '/purchase/asset-purchases']);
  expectExcludes('src/router/index.ts', ['/purchase/asset-purchases', 'purchase-asset-purchase']);
  expectExcludes('src/views/PurchaseView.vue', ['assetPurchases', '资产采购']);
  expectExcludes('src/views/PurchaseOrderEditorView.vue', ['AssetPurchaseProgressDialog', 'asset-arrival', 'asset-acceptance']);
  expectExcludes('src/views/PurchaseRequisitionEditorView.vue', ['assetName', 'assetPurpose', '资产采购']);
  expectExcludes('src/views/MasterSimpleEditorView.vue', ['来源资产采购', '/purchase/asset-purchases/']);
  expectExcludes('server/index.mjs', ["parts[4] === 'asset-arrival'", "parts[4] === 'asset-acceptance'"]);
});

run('status-bearing business details share the common status panel instead of local steppers', () => {
  for (const [file, tokens] of [
    ['src/views/SalesQuoteEditorView.vue', ['title="报价状态"', ':items="quoteStatusPanelItems"']],
    ['src/views/SalesOutboundRequestView.vue', ['title="状态与交付"', ':items="outboundStatusPanelItems"']],
    ['src/views/PurchaseRequisitionEditorView.vue', ['title="单据状态"', ':items="requisitionStatusPanelItems"']],
    ['src/views/WarehouseOperationEditorView.vue', [':primary-status="warehouseDocumentLifecycleStatus"', ':items="warehouseDocumentStatusItems"']],
  ]) {
    expectIncludesAll(file, [
      "import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';",
      ...tokens,
    ]);
  }
  expectExcludes('src/views/PurchaseRequisitionEditorView.vue', ['quote-stage-list', 'const stageIndex = computed']);
  expectExcludes('src/views/WarehouseOperationEditorView.vue', ['quote-stage-list', 'const visibleStageList = computed']);
  for (const file of [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/SalesOutboundRequestView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
    ...financeEditorViews,
    'src/views/Production2View.vue',
    'src/views/QualityDocumentEditorView.vue',
  ]) {
    assert(
      /<section\b[^>]*summary-section[^>]*>\s*<DocumentStatusPanel/.test(read(file)),
      `${file} should place DocumentStatusPanel inside the shared summary-section padding contract`,
    );
  }
  expectIncludesAll('src/views/AfterSalesDocumentView.vue', [
    '<h2>协同进度</h2>',
    'hasIncompleteExecutionTasks',
    '任务执行中',
  ]);
  expectExcludes('src/views/AfterSalesDocumentView.vue', [
    "import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';",
    'afterSalesStatusPanelItems',
  ]);
  expectExcludes('src/styles/main.css', ['.quote-stage-list', '.quote-validity-card']);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 94. 七模块状态面板与审计覆盖收口（2026-07-21）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 77. 单据状态面板公共投影（2026-07-21）');
});

run('create and edit pages use the full content width when no decision sidebar remains', () => {
  expectIncludesAll('src/styles/main.css', [
    '.quote-editor.is-full-width-editor .quote-form-grid {',
    '.quote-editor.is-full-width-editor .quote-summary-panel {',
  ]);
  for (const file of [
    'src/views/SalesOutboundRequestView.vue',
    'src/views/WarehouseOperationEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
    'src/views/FinanceSalesInvoiceEditorView.vue',
    'src/views/FinancePurchaseInvoiceEditorView.vue',
  ]) {
    expectIncludes(file, "'is-full-width-editor'");
  }
  expectIncludesAll('src/views/AfterSalesDocumentView.vue', [
    '<h2>协同进度</h2>',
    '<h2>关联处理记录</h2>',
    'quote-summary-panel',
  ]);
});

run('five-module create and edit pages keep the reviewed form layout', () => {
  expectIncludesAll('src/styles/main.css', [
    '.form-section-head > div > .section-hint,',
    '.quote-editor-header > div > .section-hint {\n  margin: 4px 0 0;',
    '.quote-line-row input,\n.quote-line-row select {',
    '.quote-line-row input:focus,\n.quote-line-row select:focus {',
    '.quote-editor.has-attachment-only-summary .quote-form-grid {\n    grid-template-columns: minmax(0, 1fr);',
    '.quote-editor.has-attachment-only-summary .quote-summary-panel {\n    grid-template-columns: minmax(0, 1fr);',
  ]);
  expectIncludesAll('src/views/PurchaseRequisitionEditorView.vue', [
    "'has-attachment-only-summary': !isDetail",
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    "activePage === 'work-orders' && isProductionEditableDocument",
    '<h2>建单检查</h2>',
    'const processTemplateUsesInlineAttachments = computed(() =>',
    'production-process-template-attachment-section',
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    "'has-attachment-only-summary': !isDetail",
  ]);
  expectIncludesAll('src/views/FinanceSalesInvoiceEditorView.vue', [
    '@media (max-width: 1360px)',
    '.invoice-allocation-row {\n    grid-template-columns: repeat(2, minmax(0, 1fr));',
    ':class="{ \'is-entry-only\': !isDetail }"',
    '<aside v-if="isDetail" class="quote-summary-panel">',
    '确认前请核对来源订单',
    ':class="{ \'is-readonly\': isReadOnly }"',
    'v-if="isReadOnly" class="allocation-readonly-value"',
    '.allocation-readonly-value {',
    '.allocation-current-cell input:focus,',
    '.allocation-current-cell input[readonly] {',
  ]);
  expectExcludes('src/views/FinanceSalesInvoiceEditorView.vue', [
    ':class="{ \'is-entry-only\': isNew }"',
    '<aside v-if="!isNew" class="quote-summary-panel">',
  ]);
  expectIncludesAll('src/views/FinancePurchaseInvoiceEditorView.vue', [
    ':class="{ \'is-entry-only\': !isDetail }"',
    '<aside v-if="isDetail" class="quote-summary-panel">',
    '收票完成后',
  ]);
  expectExcludes('src/views/FinancePurchaseInvoiceEditorView.vue', [
    ':class="{ \'is-entry-only\': isNew }"',
    '<aside v-if="!isNew" class="quote-summary-panel">',
  ]);
  for (const file of [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
  ]) {
    expectIncludes(file, '已锁定');
  }
  for (const file of [
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
  ]) {
    expectExcludes(file, ['不可流转']);
  }
  for (const file of [
    'src/views/FinanceSalesInvoiceEditorView.vue',
    'src/views/FinancePurchaseInvoiceEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      '<FileDown :size="15" />\n              PDF',
      '<FileText :size="15" />\n              日志',
    ]);
  }
  for (const file of [
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
    'src/views/FinanceSalesInvoiceEditorView.vue',
    'src/views/FinancePurchaseInvoiceEditorView.vue',
    'src/views/FinanceReceivableEditorView.vue',
    'src/views/FinancePayableEditorView.vue',
  ]) {
    expectIncludes(file, 'secondary-action topbar-optional-action');
  }
});

run('required finance sources and active business dialogs manage keyboard focus', () => {
  expectIncludesAll('src/components/ReferencePicker.vue', [
    'const triggerButton = ref<HTMLButtonElement | null>(null);',
    'function focus() {',
    'triggerButton.value?.focus();',
    'defineExpose({ focus });',
    'ref="triggerButton"',
  ]);
  for (const file of [
    'src/views/FinanceSalesInvoiceEditorView.vue',
    'src/views/FinancePurchaseInvoiceEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'const sourcePicker = ref<InstanceType<typeof ReferencePicker> | null>(null);',
      'sourcePicker.value?.focus();',
      'class="required-label"',
      'ref="sourcePicker"',
      'required',
    ]);
  }
  expectIncludesAll('src/components/FinanceSettlementDialog.vue', [
    "import { useDialogFocus } from '../composables/useDialogFocus';",
    'const dialogPanel = ref<HTMLElement | null>(null);',
    'const amountInput = ref<HTMLInputElement | null>(null);',
    'useDialogFocus(dialogPanel, amountInput)',
    'ref="dialogPanel"',
    '@keydown.tab="handleDialogTab"',
    '@keydown.esc.stop.prevent="!busy && emit(\'close\')"',
    'ref="amountInput"',
  ]);
  expectIncludesAll('src/components/WarehouseReversalDialog.vue', [
    "import { useDialogFocus } from '../composables/useDialogFocus';",
    'const dialogPanel = ref<HTMLElement | null>(null);',
    'const reasonInput = ref<HTMLTextAreaElement | null>(null);',
    'useDialogFocus(dialogPanel, reasonInput)',
    'ref="dialogPanel"',
    '@keydown.tab="handleDialogTab"',
    '@keydown.esc.stop.prevent="!pending && emit(\'close\')"',
    'ref="reasonInput"',
  ]);
  for (const [file, triggerName] of [
    ['src/views/WarehouseSalesIssueEditorView.vue', 'issueMoreActionsTrigger'],
    ['src/views/WarehousePurchaseReceiptEditorView.vue', 'receiptMoreActionsTrigger'],
    ['src/views/WarehouseOperationEditorView.vue', 'warehouseMoreActionsTrigger'],
  ]) {
    expectIncludesAll(file, [
      `const ${triggerName} = ref<HTMLButtonElement | null>(null);`,
      `${triggerName}.value?.focus();`,
      `ref="${triggerName}"`,
    ]);
  }
});

run('receivable and payable detail lines render facts instead of disabled-looking fields', () => {
  for (const file of [
    'src/views/FinanceReceivableEditorView.vue',
    'src/views/FinancePayableEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'class="line-product-card"',
      'class="document-line-readonly-value is-number"',
      'class="document-line-readonly-value is-number is-emphasis"',
      '<span class="is-number">发票单价</span>',
      '<span class="is-number">发票行金额</span>',
      '基础单位 {{ item.uom || \'-\' }}',
      '{{ formatMoney(parseMoney(item.unitPrice)) }}',
      '{{ formatMoney(parseMoney(item.amount)) }}',
    ]);
    expectExcludes(file, [
      '<input :value="item.name" type="text" readonly />',
      '<input :value="item.unitPrice" type="text" readonly />',
      '<input :value="item.amount" type="text" readonly />',
    ]);
  }
  expectIncludesAll('src/styles/main.css', [
    '.document-line-readonly-value {',
    '.document-line-readonly-value.is-number,',
    '.document-line-readonly-value.is-emphasis {',
    'font-variant-numeric: tabular-nums;',
  ]);
});

run('finance invoice summaries keep calculated and locked facts out of the tab order', () => {
  for (const file of [
    'src/views/FinanceSalesInvoiceEditorView.vue',
    'src/views/FinancePurchaseInvoiceEditorView.vue',
  ]) {
    expectIncludesAll(file, [
      'class="form-readonly-value finance-calculated-value"',
      'class="form-readonly-value finance-calculated-value is-emphasis"',
      'v-if="isReadOnly" class="form-readonly-value"',
      'v-if="isReadOnly" class="form-readonly-value form-readonly-note"',
    ]);
    expectExcludes(file, [
      '<input v-model="invoiceDraft.amount" type="text" readonly />',
      '<input v-model="invoiceDraft.taxAmount" type="text" readonly />',
      '<input v-model="invoiceDraft.totalAmount" type="text" readonly />',
      '<input v-model="invoiceDraft.settledAmount" type="text" readonly />',
      ':readonly="isReadOnly" />',
    ]);
  }
  expectIncludesAll('src/styles/main.css', [
    '.finance-calculated-value {',
    '.quote-editor.is-detail-view .finance-calculated-value.is-emphasis {',
  ]);
});

run('seven-module facts keep quality, warehouse and production next steps aligned', () => {
  expectIncludesAll('src/views/QualityView.vue', [
    "function qualityDispositionLabel(page: QualityPageKey, disposition: string | undefined, status = '')",
    "if (status === '合格') return '合格转待入库';",
    "if (row.page === 'incoming' && ['合格', '免检放行'].includes(row.status)) return '下一步：等待仓库入库';",
  ]);
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    "if (master.nextAction.includes('仓库入库')) return master.nextAction;",
    "handoverNote: ''",
    "{ label: '等待质量'",
    "{ label: '待包装'",
    "{ label: '待处理例外'",
    "{ label: '等待仓库'",
    'const shiftExceptionRows = computed(() =>',
    'v-if="currentShift.handoverNote"',
    "<span v-else class=\"schedule-order-locked\">{{ item.kind === '工序任务' ? '自动排入' : '已锁定' }}</span>",
    "if (!workbenchPrototypeCommandsAvailable && ['take-next', 'leader'].includes(step.primaryAction)) return false;",
    "primaryAction: 'detail'",
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    "&& ['tasks', 'material-requests', 'work-orders', 'recipes', 'process-templates', 'exceptions'].includes(activeListKey.value)",
    "|| !['work-orders', 'recipes', 'process-templates'].includes(activePage.value)",
    "if (!canWriteProduction.value || !['work-orders', 'recipes', 'process-templates'].includes(activePage.value)) return [];",
  ]);
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', ['原型状态', '原型结论']);
  expectIncludesAll('shared/system-menu-defaults.json', [
    '按已下达生产安排和物料分配执行领料出库。',
    '生产现场设备与工艺资源资料维护。',
  ]);
});

run('production and quality menus stay flat while recipes keep real maintenance actions', () => {
  expectExcludes('shared/system-menu-defaults.json', [
    '"group": "计划与准备"',
    '"group": "执行与追踪"',
    '"group": "记录与分析"',
    '"group": "生产设置"',
    '"group": "检验执行"',
    '"group": "质量闭环"',
    '"group": "质量设置"',
  ]);
  expectIncludesAll('server/index.mjs', [
    'data.production.recipes ||= []',
    'function normalizeProductionRecipe(data, input, existing, codeOverride = \'\', authenticatedActor = \'\')',
    "if (parts[1] === 'production' && parts[2] === 'recipes')",
    "appendBusinessAuditLog(req, data, '创建生产配方'",
    "if (kind === '生产产出')",
    '预估损耗至少填写固定损耗或比例损耗',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    'async function loadPersistedRecipes()',
    'async function loadPersistedRecipeDetail(code: string)',
    'async function persistProductionRecipe()',
    "async function updateProductionRecipeLifecycle(command: 'activate' | 'disable')",
    '<h2>配方明细</h2>',
    '<h3>投料组成</h3>',
    '<h3>固定用量</h3>',
    '<h2>预估损耗规则</h2>',
    'class="recipe-line-action-cell"',
    '选择产出物料后自动核对版本',
    '预计需求公式',
    "recipeIsEditable ? '待填写' : '0 项'",
    '选择物料后计算',
    "label: '配方构成'",
    'kind="生产产出"',
    'placeholder="选择产出物料后带入"',
    'recipeEstimatedLossIsEmpty',
    '净用量 + ${additions.join',
    "if (value === '启用') return '创建新版本';",
    '净用量 ×',
    "if (activePage.value === 'recipes' && route.query.copy) return '创建配方新版本';",
    'function recipeIncomingQualityRequired(rule: unknown)',
    "recipeIncomingQualityRequired(raw.qualityControl)",
    '任务固定损耗',
    "entry.line.incomingQcRequired ? '来料需检' : '免来料检'",
    '<MaterialIdentity',
    "tableHeaders: ['配方版本', '产出物料', '每单位标准', '用料规则']",
    'const recipeProductSelectionLocked = computed(() =>',
    ':disabled="!recipeIsEditable || recipeProductSelectionLocked"',
    'sourceRecipeCode: recipeDraft.value.sourceRecipeCode,',
    "recipeRuntimeHasSnapshot.value ? 'ready' : 'loading'",
    '<span>共 {{ visibleProductionRows.length }} 条</span>',
    "if (activePage.value === 'recipes') return recipeFlowRecords.value;",
  ]);
  expectExcludes('src/views/Production2View.vue', [
    '分别维护按重量计算和按单位固定耗用的物料。',
    '原料、色母和助剂按净重占比计算，合计仅供核对。',
    '按每单位产出数量维护固定耗用。',
    'function defaultAttachments(',
  ]);
  expectIncludesAll('server/index.mjs', [
    'incomingQualityRuleRequiresInspection(\n        materialIncomingQualityRule(data, materialCode, materialName',
    'unit: material.unit,',
    "const actor = businessActorName(req, data);",
    'owner: actor,',
    '新版本必须沿用来源配方的产出物料',
    '不能按净重占比投料，请改用固定用量',
  ]);
  expectIncludesAll('shared/production-version-catalog.json', [
    '"revision": 1',
    '"updatedAt": "2026-07-01"',
  ]);
});

run('production process versions preserve maintained guidance and route semantics', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    "statusColumnTitle: '版本状态'",
    'const processTemplateFlowRecords = ref<FlowRecord[]>([]);',
    'async function loadPersistedProcessTemplateDetail(code: string)',
    "if (activePage.value === 'process-templates') return processTemplateFlowRecords.value;",
    "if (activePage.value === 'process-templates' && route.query.copy) return '创建工艺新版本';",
    "if (routeType === '直接收卷') return '成品收卷与报工';",
    "if (routeType === '大盘复绕') return '复绕成品与报工';",
    'processTemplateStepWorkDefaults(stepCode, routeType)',
    'sourceProcessTemplateCode: processTemplateDraft.value.sourceProcessTemplateCode,',
    'const processTemplateVersionIdentityLocked = computed(() =>',
    'const processTemplateActivationConflictMessage = computed(() =>',
    'const processTemplateUsesInlineAttachments = computed(() =>',
    '新工单选用',
    "return '质检阶段';",
    "return '仓库协同';",
    'production-process-template-attachment-section',
    'data-required-field="process-template-temperature-tolerance"',
    'processTemplateToleranceFieldClass()',
    ':max-columns="3"',
    '温控统一允差',
    `activePage === 'process-templates'`,
  ]);
  expectExcludes('src/views/Production2View.vue', [
    '复绕后按成品卷数登记',
    "return '质量门';",
    "return '外部等待';",
    "(isProcessTemplateDocument && processTemplateIsEditable)\n          || (activePage === 'work-orders'",
    '.process-template-option-chip',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function productionProcessStageRouteGuidance(template, code)',
    "name: '成品收卷与报工'",
    "name: '复绕成品与报工'",
    'productionProcessMaintainedGuidance(instruction.coreEquipment || supplied.coreEquipment, guidance.coreEquipment)',
    'instruction.workContent || instruction.workInstruction || supplied.workContent || supplied.workInstruction',
    'instruction.controlPoints || instruction.completionRule || supplied.controlPoints || supplied.completionRule',
    'instruction.commonIssues || instruction.abnormalRule || supplied.commonIssues || supplied.abnormalRule',
    'function productionProcessRouteStageCodes(routeType)',
    '生产路线在工艺草稿首次保存后不可切换',
    '新版本必须沿用来源工艺的生产路线',
    '温控参数必须保留固定的 ${productionProcessTemperatureZoneNames.length} 个区域',
    'owner: actor,',
  ]);
  expectIncludesAll('shared/production-process-stages.json', [
    '"code": "P2-STEP-MATERIAL-ISSUE"',
    '"actionCodes": ["SA2-CREATE-MATERIAL-ISSUE"]',
    '"completionRule": "生产领料已过账，实际发料数量和原料批次已记录。"',
  ]);
  expectIncludesAll('shared/production-version-catalog.json', [
    '"code": "PRC2-EXTRUSION-V1"',
    '"owner": "周宁"',
    '"createdBy": "周宁"',
  ]);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    'parallelProcessVersionActivation.response.status === 409',
    'production process allowed two enabled versions in the same version family',
  ]);
});

run('production support objects keep responsibility boundaries and compact four-column layouts', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    "tableHeaders: ['备料申请', '需求来源/申请人', '物料需求', '库存覆盖/采购处理']",
    "tableHeaders: ['生产批次/工单', '成品/产线', '计划/班组']",
    "'execution-cards': '物料 · 报工 · 质检 · 包装'",
    "tableHeaders: ['损耗记录', '来源对象', '产品/工序', '损耗判断', '责任/记录状态']",
    "tableHeaders: ['生产异常', '类型/级别', '影响对象', '原因/责任', '处置/损失预估']",
    'materialRequestEvaluationPending',
    "materialRequestLinesAreEditable ? 'is-edit-request-row' : 'is-readonly-request-row'",
    'function productionExceptionQualityActionLabel(raw: AnyRecord | undefined)',
    "if (stage === '待处置') return '前往质量处置';",
    "title: '生产依据'",
    "title: '现场产出'",
    "title: '异常判断'",
    'production-material-requests-table',
    'production-exceptions-table',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    '<input v-if="materialRequestIsEditable" v-model="line.availableQty"',
    '<input v-if="materialRequestIsEditable" v-model="line.purchaseQty"',
    "tableHeaders: ['异常编号', '异常类型', '来源/产线', '影响范围', '责任/原因', '处置']",
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    'type ProductionLossRecord = {',
    'inventoryCoveredQty` 与 `purchaseGapQty` 是服务端提交时的系统评估结果',
  ]);
});

run('production module keeps execution facts, units, actions, and maintenance pages clean', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    '基础单位',
    '<span class="recipe-product-standard">计划 {{ qty(workOrderDraft.planQty, workOrderDraft.unit) }}</span>',
    'openExecutionCardPackaging',
    '<ProductionPackagingDialog',
    '<ExceptionActionDialog',
    "activePage !== 'process-steps'",
    "!['material-requests', 'work-orders', 'execution-cards', 'process-steps'].includes(activePage)",
    "? '生产批次号'",
  ]);
  expectExcludes('src/views/Production2View.vue', [
    'window.prompt',
    'workOrderAvailableUnits',
    '流转批次号',
    '不要用工单主状态代替批次进度',
  ]);
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    "| { type: 'pause'; lineName: string }",
    "| { type: 'resume'; lineName: string }",
    "primaryAction: 'exception-detail'",
    'function openLineException',
    "role=\"tab\" :aria-selected=\"activeTab === 'site'\"",
    'class="schedule-line-available"',
    '可安排 {{ queueOptionsForLine(line).length }} 个工单',
    '<strong>已安排 · 待领料</strong>',
    '安排到产线',
    "| { type: 'handoverRecords' }",
    '<span class="workbench-button-label">交接记录</span>',
  ]);
  expectExcludes('src/views/ProductionWorkbenchDemoView.vue', [
    'window.prompt',
    'resolveProductionException',
    '解除异常',
    'workbenchPersistenceNotice',
    '流转批次',
  ]);
  expectIncludesAll('src/components/ProductionPackagingDialog.vue', [
    'role="dialog"',
    'aria-modal="true"',
    '箱号或托盘号',
    "busy ? '提交中…' : '确认包装'",
  ]);
  for (const legacyFile of [
    'src/views/ProductionView.vue',
    'src/views/ProductionShiftConsoleView.vue',
    'src/views/ProductionFlowWorkbenchView.vue',
    'src/data/productionFlow.ts',
  ]) {
    assert(!existsSync(filePath(legacyFile)), `${legacyFile} should be removed after production route convergence`);
  }
});

run('production second-pass facts separate supply blockers, quality history and abnormal execution', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    'taskReleaseIsComplete',
    'purchaseGapValue',
    '缺口/申请',
    'executionCardQualitySummary',
    '当前无待处理质检',
    'activeProductionExceptionForExecutionCard',
    'activeProductionExceptionForWorkOrder',
    'loadRuntimeProductionQualityTasks',
    '等待后续包装',
    '等待后续放行',
    'loss-source-link',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    '暂无质检任务',
    "return `${shortageCount} 项短缺 · ${readyCount} 项可齐套`",
    'processTemplateCanAddStep',
    'title="上移阶段"',
    'title="删除阶段"',
  ]);
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    'function currentQualityTaskForCard(cardCode: string)',
    'production2QualityTasks.splice(0, production2QualityTasks.length, ...snapshot.qualityTasks)',
    'const workbenchHasSnapshot = ref(false)',
    'function fetchWorkbenchRuntimeSnapshot(): Promise<WorkbenchRuntimeSnapshot>',
    '@retry="refreshWorkbenchRuntimeFacts"',
    'workbenchWriteActionsDisabled',
    'workbenchFactsRevision.value += 1',
    "if (qualityTask && ['待处置', '返工中', '待复检'].includes(qualityTask.dispositionStatus || '')) return '质量待处置'",
    "if (card.status === '异常') {",
    "return '异常待处理'",
    "type ChildStatus = '待释放' | '待领料' | '队列中' | '待首检' | '生产中' | '待入库' | '异常/返工' | '已入库'",
    'function materialCoverageForWorkOrder',
    'function masterReleaseBlocker',
    'schedule-recipe-field',
    'schedule-process-field',
  ]);
  expectExcludes('src/data/production2.ts', [
    'PQC2-FINAL-260701-004',
    'RWD-260630-004',
    "line: '拉丝 L1 线',\n    equipment: 'WD-L1'",
    '流转批次',
    '异常闭环',
    '工艺模板',
  ]);
});

run('production third-pass workbench keeps actions, quantities, and responsibility boundaries explicit', () => {
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    'class="workbench-topbar-tabs"',
    'const summaryCards = computed(() =>',
    'const schedulableItems = computed<SchedulableItem[]>',
    'lineCurrentMetricRows',
    'lineCurrentProgressSummary',
    'shiftReportTotalText',
    'unitTotals',
    "exception: '报告生产异常'",
    '入库检由质检模块处理，放行后由仓库办理完工入库。',
    'class="schedule-line-available"',
    '确认后生成生产安排；仓库确认领料出库后进入待开工队列。',
    '确认安排',
  ]);
  expectExcludes('src/views/ProductionWorkbenchDemoView.vue', [
    "{ label: '待排包装'",
    '<span>释放批次 / 生产批次</span>',
    '处理结果',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    'workOrderTaskDemandOptions',
    "['tasks', 'material-requests', 'work-orders', 'recipes', 'process-templates', 'exceptions'].includes(activeListKey.value)",
    'taskMaterialRequestAction',
    'const availableQty = workOrderSourceAvailableQtyFor(taskCode, line);',
    '<span>即时缺口/申请</span>',
    'production-task-material-gap-cell',
    'production-task-material-supplement-cell',
    '无需申请',
  ]);
  for (const file of [
    'src/views/Production2View.vue',
    'src/views/QualityDocumentEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
    'src/data/quality.ts',
  ]) expectExcludes(file, ['流转批次']);
});

run('production workbench follows the batch-led operating model', () => {
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    "const workbenchTabs = new Set<WorkbenchTab>(['schedule', 'site', 'postprocess', 'exceptions'])",
    'function executionCardOccupiesLine(card: Production2ExecutionCard)',
    'const equipmentCards = cards.filter((item) => executionCardOccupiesLine(item.card))',
    'function postprocessStageForCard(card: Production2ExecutionCard)',
    "const postprocessStageOrder: PostprocessStage[] = ['短关待处理', '待成品检', '质量待处置', '待包装', '待入库检', '待仓库入库', '异常待处理']",
    "if (row.stage === '质量待处置')",
    '质量任务 ${row.qualityTaskCode} 正在处置；生产等待质量结果',
    '<span v-else class="workbench-handoff-status">{{ row.actionLabel }}</span>',
    "<template v-else-if=\"activeTab === 'postprocess'\">",
    'function lineCurrentTitle(line: LineQueue)',
    '{{ childProductionBatchCode(selectedLineCurrentChild) }}',
    "{ label: operationJob?.sourceWipBatchCode ? '成品计划' : '计划数量', value: formatQty(child.planQty, child.unit) }",
  ]);
  expectExcludes('src/views/ProductionWorkbenchDemoView.vue', [
    "activeTab === 'build'",
    'selectedTaskMaterialRequestAction',
    '<h3>{{ lineCurrentChild(line)?.code }}</h3>',
    "{ label: '释放批次', value: child.code }",
    '<strong>{{ batch.code }}</strong>',
    'path: `/quality/production/${encodeURIComponent(row.qualityTaskCode)}`',
  ]);
  expectIncludesAll('docs/production-operating-model-redesign.md', [
    '生产批次贯穿流程，产线只承载实际设备占用',
    '达量后完成设备作业并释放产线',
    '普通页面只显示一个“生产批次”身份',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 44. 生产运行模型与工作台职责重构（2026-07-19）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 39. 生产批次、设备工序与后段读模型（2026-07-19）',
  ]);
});

run('large-reel WIP and rewound finished goods keep separate quantity dimensions', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    "title: '大盘半成品重量'",
    "title: '现场产出'",
    "label: '复绕用量'",
    "label: '工艺损耗'",
    "label: '小盘产出'",
    "label: '物料状态'",
    "return '大盘复绕'",
    'smallRollCodeSummary',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    "{ label: '已发料', value: qty(raw.issuedQty, raw.unit) }",
    "{ label: '已发料', value: qty(card.issuedQty, card.unit) }",
    "title: '大盘与小盘追溯'",
  ]);
  expectIncludesAll('server/index.mjs', [
    'usedWeightKg: rewindReports.reduce',
    'lossWeightKg: rewindReports.reduce',
    'outputWeightKg: card.lineageRecords',
    'sourceWipBatch.usedWeightKg',
    'sourceWipBatch.lossWeightKg',
  ]);
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    "label: '大盘报工'",
    "unit: 'kg'",
    "reportDraft.netWeightKg = 0",
    'const suggestedConsumption = Math.min(',
    'Number(recipe?.productUnitWeightKg || 0)',
    'reportDraft.consumedWeightKg = Math.round(suggestedConsumption * 1000) / 1000',
    "`成品良品（${operationExecutionCard?.unit || '卷'}）`",
    '复绕用量（kg）',
    "请填写本次实际复绕用量（kg）",
  ]);
  expectExcludes('src/views/ProductionWorkbenchDemoView.vue', [
    'reportDraft.netWeightKg = Math.max(0, remainQty)',
    'reportDraft.consumedWeightKg = Math.min(remainQty',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 45. 大盘半成品与复绕成品双计量合同（2026-07-19）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 40. 大盘与成品双数量事实（2026-07-19）',
  ]);
});

run('qualified large reels use lightweight rewind operation scheduling', () => {
  expectIncludesAll('server/index.mjs', [
    'function ensureExecutionCardOperationJobs(data, card)',
    "operationType: '复绕生产'",
    "status: completed ? '已完成' : '可开工'",
    'function startExecutionCardOperationJob(data, card, jobCode, body)',
    '请先在生产工作台开始大盘',
  ]);
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    "return '复绕任务待开工'",
    "actionLabel: isSupplement && isRewind ? '开始补产复绕'",
    "待开工队列",
    "item.kind === '工序任务' ? '自动排入' : '已锁定'",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 46. 复绕轻量排程合同（2026-07-19）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 41. 复绕工序任务事实（2026-07-19）']);
});

run('production batches separate equipment jobs from process stages and aggregate status', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    "tableHeaders: ['生产批次/工单', '成品/产线', '计划/班组']",
    "statusColumnTitle: '批次状态'",
    "'execution-cards': '物料 · 报工 · 质检 · 包装'",
    "title: '设备作业'",
    "headers: ['作业', '产线', '状态', '数量与时间']",
    'executionCardOperationSummary',
    'executionCardOperationJobLines',
    'executionCardPackagingStatus',
    'executionCardPlannedLineSummary(raw)',
    'executionCardMaterialEvidenceMissing',
    '业务状态已领料 · 历史领退凭证未关联',
    "{ label: '记录方式', value: '阶段状态记录' }",
    ':attention="productionDisplayTerm(productionListStatusOverview(row).attention)"',
    ':progress="productionListStatusOverview(row).progress"',
    "if (operationJob && !['已完成', '已取消'].includes(operationJob.status)) return '去现场'",
    "if (activePage.value === 'execution-cards') return executionCardOperationalSort(a, b);",
    'function executionCardScheduleAttention(raw: AnyRecord | undefined)',
    'function executionCardOperationalSort(left: ProductionListRow, right: ProductionListRow)',
    "if (stage === '异常/返工') return 0;",
    "return `超计划 ${Math.abs(daysUntil)} 天`;",
    "? '现场关注优先'",
  ]);
  expectExcludes('src/views/Production2View.vue', [
    "? '五维状态'",
    "tableHeaders: ['生产批次', '成品/现场', '当前阶段', '质量/入库', '数量进度']",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 47. 生产批次设备轨迹与例外调度边界（2026-07-19）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 42. 生产批次设备轨迹读模型（2026-07-19）']);
});

run('production batch urgency and shortage language stay operationally clear', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    "activePage.value === 'execution-cards' ? executionCardScheduleAttention(row.raw) : ''",
    "subtitle: `${plannedDate}${scheduleAttention ? ` · ${scheduleAttention}` : ''} · ${text(raw.shift, '待排班')} · ${text(raw.leader, '待分配班组')}`",
    "? [{ title: '物料储备校验', lines: shortageMaterialLines }]",
    "return '查看物料储备';",
    "return '实时库存已备齐，异常已关闭并保留追溯';",
  ]);
  expectExcludes('src/views/Production2View.vue', [
    "title: '物料齐套校验'",
    "return '查看物料齐套';",
  ]);
});

run('production batch quality projection preserves handoff permission and complete history', () => {
  expectIncludesAll('server/index.mjs', [
    'qualityTasks: production.qualityTasks,',
    'qualityTasks: production.qualityTasks.filter((item) => item.workOrderCode === code),',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    "'execution-cards': '物料 · 报工 · 质检 · 包装'",
    'function productionQualityHandoffLabel(task: AnyRecord)',
    'function executionCardQualityHandoffFromRaw(raw: AnyRecord)',
    "if (text(raw.node) === '待包装') return '确认包装';",
    'qualityTasks?: Production2QualityTask[];',
    "if (activePage.value === 'quality') auxiliaryLoads.push(loadRuntimeProductionQualityTasks());",
    'return `质检状态：${qualityStatus}`;',
  ]);
  expectIncludesAll('server/production-quality-golden-scenarios.mjs', [
    "code: 'PRPT2-260701-001'",
    "code: 'QC2-260701-003'",
    "code: 'QC2-260701-004'",
    "id: 'PQD2-260701-001'",
    "code: 'PPK2-260701-001'",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 312. 生产批次执行投影、质量交接与历史记录完整性（2026-08-05）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 286. 生产批次关联质量投影与执行记录合同（2026-08-05）',
  ]);
});

run('production batch details prioritize current decisions and collapse historical trace noise', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    "searchPlaceholder: '搜索批次、工单、成品、产线、班组'",
    'const executionCardReadonlyProductIdentity = computed(() =>',
    "label: activePage.value === 'execution-cards' ? '班组负责人' : '负责人'",
    "{ label: '计划产线', value: executionCardPlannedLineSummary(raw) }",
    "{ label: '报工进度', value: `${qty(raw.reportedQty, raw.unit)} / ${qty(raw.planQty, raw.unit)}` }",
    'const qualityBlocksNewPackaging = relatedQualityTasks.some((task) => (',
    'quantityChain.packedQty > 0 || (toNumber(raw.qualifiedQty) > 0 && !qualityBlocksNewPackaging)',
    "title: '工艺执行'",
    'executionCardProcessStageProgressSummary(raw)',
    'class="production-process-trace-disclosure"',
    '<strong>查看完整工艺轨迹</strong>',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    "{ label: '批次计划', value: qty(raw.planQty, raw.unit) }",
    "'is-current-execution-section': activePage === 'execution-cards' && section.title === '工艺执行路线'",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 313. 生产批次当前决策层级与详情降噪（2026-08-05）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 287. 生产批次详情投影与零值可见性合同（2026-08-05）',
  ]);
});

run('production reporting owns automatic completion and explicit short close', () => {
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    "return '开始复绕'",
    '不重复领料和开机首检',
    'operationReportProjectedRemainingQty',
    'operationReportAutoCompletes',
    '本次报工后提前结束设备作业',
    'shortCloseReason',
  ]);
  expectExcludes('src/views/ProductionWorkbenchDemoView.vue', [
    "finish: '完成生产'",
    "panel.type === 'finish'",
    '结束当前生产',
  ]);
  expectIncludesAll('server/index.mjs', [
    'const shortClosed = body.closeOperation === true',
    "completionMode = shortClosed",
    "? '短关'",
    "? '大盘用尽'",
    'Boolean(card.shortClosedAt)',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    "label: '结束方式'",
    "job.completionMode === '短关'",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 48. 现场开工、报工与短关合同（2026-07-19）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 43. 设备作业完成与短关事实（2026-07-19）']);
  expectIncludesAll('docs/production-operating-model-redesign.md', ['## 14. 现场开工、报工与设备释放']);
});

run('short close remaining plan uses an explicit planning decision', () => {
  expectIncludesAll('src/components/ShortCloseResolutionDialog.vue', [
    '处理剩余计划',
    '安排补产',
    '接受短缺',
    '处理原因',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    'executionCardShortCloseNeedsResolution',
    "return '处理剩余数量'",
    "title: '提前结束与剩余计划'",
    'resolveProductionShortClose',
  ]);
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    "type PostprocessStage = '短关待处理'",
    "短关待处理: '处理剩余'",
    "title: isSupplement ? '剩余补产已就绪'",
    "return '补产任务待开工'",
    "if (queuedOperationJob?.supplementForShortClose) return '补产任务待开工'",
    '剩余数量已形成补充设备作业；确认负责人后开工，并重新执行开机首检。',
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    'const productionQualityImpact = computed',
    '本次质检判定影响',
    '本次质检放行后激活补产',
    '已交接补产复绕',
  ]);
  expectIncludesAll('src/data/quality.ts', [
    'const taskDisposition = task.disposition',
    "task.conclusion || normalizedResult",
  ]);
  expectIncludesAll('server/index.mjs', [
    'function resolveExecutionCardShortClose(data, card, body)',
    'function executionCardReportingComplete(card)',
    "card.shortCloseResolution = '待处理'",
    "parts[4] === 'short-close-resolution'",
    'supplementForShortClose: true',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 49. 短关剩余计划处理合同（2026-07-19）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 44. 短关剩余计划决定事实（2026-07-19）']);
  expectIncludesAll('docs/production-operating-model-redesign.md', ['## 15. 短关后的计划闭环']);
});

run('supplement output closes through packaging, inbound inspection and warehouse posting', () => {
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    'const suggestedConsumption = Math.min(',
    'reportDraft.consumedWeightKg = Math.round(suggestedConsumption * 1000) / 1000',
    'releaseBatchCode: card.releaseBatchCode ||',
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    '补产报工质检后进入包装',
    '补产数量已放行，进入包装',
    "label: '等待仓库任务'",
    '系统正在自动生成仓库完工入库任务',
  ]);
  expectIncludesAll('src/router/index.ts', [
    "path: 'warehouse/production-receipts/new'",
    "name: 'warehouse-production-receipt-new'",
    "warehouseDocumentKind: 'productionReceipts'",
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    "return '仓库已完成入库'",
    '本批次计划、报工、质检、包装和仓库入库均已完成',
  ]);
  expectIncludesAll('server/index.mjs', [
    'operationJobCode: operationJobCodeBeforeReport',
    'item.operationJobCode === rewindJob.code',
    'report.operationJobCode === baseRewindJobCode',
  ]);
  expectIncludesAll('scripts/smoke-short-close.mjs', [
    "supplementReportInspection.executionCard.node === '待包装'",
    "inboundInspection.executionCard.status === '待仓库'",
    "postedReceipt.card.node === '已入库'",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 50. 补产报工至仓库入库闭环（2026-07-19）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 45. 补产报工、入库放行与完工过账事实（2026-07-19）']);
});

run('production postprocess supports repeated package batches without quantity leakage', () => {
  expectIncludesAll('server/index.mjs', [
    'function executionCardInboundScrappedQty(production, card)',
    'function executionCardPostprocessQuantityFacts(production, card)',
    'data.production.packagingRecords ||= []',
    "nextDocumentCode(data, 'production-packaging-records', production.packagingRecords, 'PPK2')",
    'pendingPackagingQty: Math.max(0, qualifiedQty - packedQty)',
    'pendingInboundInspectionQty: Math.max(0, packedQty - releasedInboundQty - inboundHoldQty - inboundScrappedQty)',
    '包装批号 ${packageRef} 已用于入库抽检',
    "task.kind !== '半成品质检' && action !== 'scrap'",
    'postprocess.pendingPackagingQty <= 0.0001',
  ]);
  expectIncludesAll('src/components/ProductionPackagingDialog.vue', [
    "submit: [payload: { packageRef: string; quantity: number }]",
    '本次包装数量',
    '不能超过 ${quantityText.value}',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    'payload: { packageRef: string; quantity: number }',
    'inboundScrappedQty',
    "title: '包装记录'",
    "-PKG-${String(toArray(pendingPackagingCard?.packageRefs).length + 1).padStart(2, '0')}",
    'runtimeExecutionCardDetailLoaded.value && activePage.value === \'execution-cards\'',
  ]);
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    'inboundScrappedQty: number',
    'releasedInboundQty + inboundHoldQty + inboundScrappedQty < packedQty',
  ]);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    'partial production receipt closed the batch before the remaining qualified output was packaged',
    'production packaging reused an existing package reference and duplicated the packed quantity',
    'execution card detail did not return both production receipt records',
  ]);
  expectIncludesAll('scripts/smoke-short-close.mjs', [
    'scrapping a report-quality reject recreated a phantom pending-inspection quantity',
    'inbound scrap was not retained as an independent closed quantity',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 306. P1 生产后段分批包装、质检与入库闭环（2026-08-04）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 280. 生产后段包装批与处置数量守恒合同（2026-08-04）']);
});

run('production and quality preserve local context with explicit ownership handoffs', () => {
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    "query: { returnTo: '/production/workbench?tab=postprocess' }",
    '由质量模块处理；生产等待判定结果',
    'primaryAction: \'wait\'',
  ]);
  expectIncludesAll('src/views/QualityWorkbenchView.vue', [
    "?returnTo=${encodeURIComponent('/quality/workbench')}",
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    'function safeQualityReturnPath(value: unknown)',
    'const activeBackLabel = computed(() => {',
    'function qualityRouteContextQuery(sourceDoc = \'\')',
    'const qualityInlineFocusAction = computed',
    'function focusQualityDetailSection',
    'data-quality-focus="reinspection"',
    'id="quality-production-closure"',
    ':to="backPath" :aria-label="activeBackLabel"',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    'const productionBackPath = computed',
    'const productionDocumentPrimaryIsHandoff = computed',
    'class="production-handoff-status"',
    "...(['work-orders', 'execution-cards'].includes(activePage.value) ? ['title'] : [])",
    ':to="productionBackPath"',
    "if (/^(QC2-|PQC-|IQC-)/.test(code)) return `/quality/production/${encodeURIComponent(code)}`;",
  ]);
  expectExcludes('src/views/Production2View.vue', [
    'function productionQualityDetailPath(code: string, focus = \'\')',
    '/warehouse/production-receipts/',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.quality-document-editor.is-detail-view .quote-summary-panel {',
    'position: sticky;',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 65. 生产与质检跨页面操作连续性（2026-07-20）']);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 318. 生产异常来源隔离、质量交接与解除停机收口（2026-08-05）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 59. 工作台导航上下文与待办定位读模型（2026-07-20）']);
});

run('production material coverage and readonly evidence use truthful display contracts', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    "code: `MO2-DRAFT-${now.replace(/-/g, '')}`",
    'function taskMaterialSupplementSummary(line:',
    "return parts.join(' · ') || '暂无补充'",
    'taskMaterialRequestDisplay(line)',
    'production-task-material-supplement-cell',
    'const showProductionAttachmentSection = computed',
    'const showProductionSummaryPanel = computed',
    ":class=\"{ 'is-entry-only': !showProductionSummaryPanel }\"",
    'is-production-basic-section',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    'WO2-DRAFT-',
    "line.purchaseGapValue > 0 ? `需采购 ${line.purchaseGapQty}` : '当前无缺口'",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 66. 生产单据口径与只读空态收口（2026-07-20）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 60. 备料覆盖与生产单据展示读模型（2026-07-20）']);
});

run('production and quality details keep complete facts without layout noise', () => {
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    'function qualityRelatedDocumentPath(code: unknown)',
    'function qualityDetailFactClass(fact: QualityDetailFact, index: number)',
    "'fact-span-half'",
    'class="quality-fact-link"',
    'grid-template-columns: repeat(6, minmax(0, 1fr));',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    'class="production-fact-link"',
    "if (nextStep.includes('跟踪')) return '查看工单';",
    'v-if="materialRequestDraft.linkedPurchaseRequisition"',
    'class="form-field work-order-note-field"',
    'aria-label="系统动作定义信息"',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    "nextStep.includes('创建') || nextStep.includes('工单') || nextStep.includes('剩余')",
    '仓库确认缺口后生成',
  ]);
  expectIncludesAll('src/views/QualityView.vue', [
    'function qualityStandardUsageHint(row: QualityListRow)',
    "row.taskStatus === '启用' ? '可用于新质检' : '仅供历史追溯'",
    '.quality-code-source strong',
    '-webkit-line-clamp: 2;',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 67. 生产与质检字段完整度、降噪和视觉收口（2026-07-20）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 61. 生产与质检详情投影及操作标签事实（2026-07-20）']);
});

run('production quality freezes source facts and preserves historical decisions', () => {
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    'const productionSourceFactsLocked = computed',
    'const qualitySourceFactsLocked = computed',
    'const qualityRecordLoading = ref(false);',
    "currentKind.value === 'production'",
    "currentKind === 'production' ? '结果去向'",
    "['incoming', 'production'].includes(currentKind) ? '提交判定'",
    '首检合格，已开放当前设备作业报工',
    '大盘半成品质检合格，已进入复绕待开工队列',
    '入库抽检合格，整批已放行至仓库',
    "label: inboundCompleted ? '仓库已完成入库' : '已交接仓库'",
    'qualityRecordNotFound ? \'not-found\' : \'error\'',
    '@retry="retryQualityRuntimeRecord"',
    'qualityCreateInstanceToken.value ||= createQualityInstanceToken();',
    'return `${kind}:create:${qualityCreateInstanceToken.value}`;',
  ]);
  expectExcludes('src/views/QualityDocumentEditorView.vue', [
    'card.nextAction',
    '/warehouse/production-receipts/',
    "? { ...createNewDraft('incoming'), code: routeCode }",
    "? { ...createNewDraft(currentKind.value), code: routeCode }",
  ]);
  expectIncludesAll('src/views/QualityView.vue', [
    'const runtimeProductionLoading = ref(true);',
    'const isRuntimeListLoading = computed',
    '正在加载最新生产质检任务',
    "if (!showRowCurrentAction(row)) return '';",
  ]);
  expectIncludesAll('src/data/quality.ts', [
    "const resultUnit = task.unit || executionCard?.unit || '';",
    "normalizedResult === '待检验' ? ''",
  ]);
  expectIncludesAll('server/data/erp-data.json', [
    '"actual": "已取首段样 1 组，来源 EC2-260701-003"',
    '"actual": "8.2 kg"',
    '"actual": "抽检 2 卷，盘标、净重、绕线和外观均合格"',
    '"dueTime": "2026-07-20 20:00"',
  ]);
});

run('production lists and details share lifecycle, attention and runtime projections', () => {
  expectIncludesAll('src/components/ListLoadState.vue', [
    'loadingMessage?: string;',
    "loadingMessage || '正在读取最新列表数据，请稍候。'",
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    "statusColumnTitle: '任务状态'",
    'const showProductionRuntimeLoadState = computed',
    'productionRuntimeDataLoading.value = true;',
    'productionRuntimeDataLoading.value = false;',
    'loading-message="正在读取最新单据及关联进度，请稍候。"',
    "!['tasks', 'work-orders', 'material-requests', 'execution-cards', 'exceptions'].includes(activePage.value)",
    "label: '异常 / 暂停'",
    "value: isQualityBlocked ? '质量阻断'",
    "return hasStarted ? '流转中' : '待开始';",
  ]);
  expectExcludes('src/views/Production2View.vue', [
    "if (/异常|中断|停止/.test(status)) return '异常';",
    "&& activePage.value !== 'tasks'",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '生产批次的异常、暂停和质量阻断是独立提醒维度',
    '不允许把本地种子与实时读模型混合渲染',
  ]);
});

run('document statuses share one visual language across lists and details', () => {
  expectIncludesAll('src/utils/statusPresentation.ts', [
    'export function statusPresentationTone',
    'export function statusPresentationClass',
    "if (tone === 'info') return 'status-confirmed';",
    '需补货',
    '调拨中',
    '已转',
    '已发完',
    '收票',
    '结清',
    '无异常',
  ]);
  expectIncludesAll('src/components/DocumentStatusPanel.vue', [
    'class="document-status-detail"',
    'grid-column: 1 / -1;',
    ".document-status-pill[data-tone='neutral']",
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.mini-status.status-neutral',
    '.mini-status.status-warning',
    '.mini-status.status-success',
    '.mini-status.status-danger',
    '.mini-status.status-info',
  ]);
  for (const view of [
    'src/views/SalesView.vue',
    'src/views/PurchaseView.vue',
    'src/views/WarehouseView.vue',
    'src/views/FinanceView.vue',
    'src/views/QualityView.vue',
    'src/views/Production2View.vue',
    'src/views/MasterDataView.vue',
  ]) {
    expectIncludesAll(view, ['statusPresentationClass']);
  }
  expectIncludesAll('src/views/MasterDataView.vue', [
    'return statusPresentationClass(status);',
  ]);
  expectIncludesAll('src/views/SalesView.vue', [
    '<div class="quote-status-head">报价状态</div>',
    '<strong>单据状态</strong>',
    '<small>出库 · 签收 · 待办</small>',
    'salesOutboundIssueStage(row)',
    'salesOutboundReceiptStage(row)',
    'salesOutboundCurrentAction(row)',
    '<div class="quote-status-head">处理状态</div>',
    'function inventoryStatusClass(status: string) {',
    'function fulfillmentStatusClass(status: string) {',
    'grid-template-columns: 80px minmax(0, 1fr);',
    'justify-items: center;',
    '.order-attention {',
    'color: #96554e;',
  ]);
  expectExcludes('src/views/SalesView.vue', ['.order-attention::before']);
  expectIncludesAll('src/views/FinanceView.vue', [
    'finance-list-shell with-status-column',
    'quote-status-column finance-status-column',
    '<strong>单据状态</strong>',
    '<small>结算 · 下一步</small>',
    'class="finance-status-facts"',
  ]);
  for (const view of [
    'src/views/QualityDocumentEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/SalesOutboundRequestView.vue',
    'src/views/WarehouseOperationEditorView.vue',
  ]) {
    expectIncludesAll(view, [
      "import { statusPresentationClass } from '../utils/statusPresentation';",
      'return statusPresentationClass(status);',
    ]);
  }
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    "import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';",
    ':primary-status="receiptLifecycleStatus"',
  ]);
  expectIncludesAll('src/views/PurchaseView.vue', [
    '<strong>单据状态</strong>',
    '<span>需求部门/提出人</span>',
    '<small>转采购 · 待办</small>',
    '<div class="quote-status-head">处理状态</div>',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    '<div v-else class="quote-status-head">作业状态</div>',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    'title="申请状态"',
    ':items="materialRequestStatusPanelItems"',
    "!['material-requests', 'work-orders', 'execution-cards', 'process-steps'].includes(activePage)",
    "statusColumnTitle: '检验状态'",
    "statusColumnTitle: '记录状态'",
    "statusColumnTitle: '处理状态'",
    "label: activePage.value === 'work-orders' ? '当前待办' : statusColumnTitle.value",
    "const responsiblePerson = text(raw.responsiblePerson, '');",
    "? '责任未判定' : '无需归责'",
    "{ label: '确认依据', value: text(raw.disposition) }",
    "{ label: '工艺内损耗', value: `${numberText(raw.plannedLossKg)} kg` }",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '状态视觉使用同一套系统语义',
    '列表徽标和详情状态面板必须读取同一映射',
  ]);
});

run('warehouse task details single-source status and omit empty attachment cards', () => {
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    '<h2>任务概览</h2>',
    'title="当前任务状态"',
    '<section class="summary-section">\n            <DocumentStatusPanel',
    '<section v-if="receiptAttachments.length" class="summary-section">\n            <div class="form-section-head">',
  ]);
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', [
    '<i class="mini-status" :class="statusClass(receiptDraft.status)">',
  ]);
  expectIncludesAll('src/views/WarehouseSalesIssueEditorView.vue', [
    '<h2>任务概览</h2>',
    'title="当前任务状态"',
    '<section v-if="isDetail" class="summary-section">\n            <DocumentStatusPanel',
    '<section v-if="issueAttachments.length" class="summary-section">\n            <div class="form-section-head">',
  ]);
  expectExcludes('src/views/WarehouseSalesIssueEditorView.vue', [
    '<i class="mini-status" :class="statusPresentationClass(issueLifecycleStatus)">',
  ]);
});

run('production work orders freeze and present executable recipe and process standards', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    "title: '工单配方'",
    "title: '工单工艺'",
    'work-order-recipe-snapshot-table',
    'work-order-snapshot-zone-grid',
    'work-order-process-snapshot-steps',
    'work-order-process-snapshot-guidance',
    '<small>核心设备</small>',
    '<small>作业要求</small>',
    '<small>异常处理</small>',
    'buildWorkOrderRecipeSnapshotRows',
    'buildWorkOrderProcessSnapshotSteps',
    'workOrderProcessTemplateSnapshotPayload',
    'workOrderDraftProductIdentity',
    'class="product-summary work-order-source-demand"',
    'const workOrderTaskDemandOptions = computed(() => {\n  void productionDataRevision.value;',
    'function workOrderTaskDemandEffectiveRecipe(task: AnyRecord, line: TaskProductDraftLine)',
    'const workOrderBlockedTaskDemandCount = computed',
    'const workOrderTaskDemandSelectionLocked = computed',
    'const workOrderTaskDemandPickerOptions = computed',
    '<WorkOrderTaskDemandPicker',
    ':disabled="workOrderTaskDemandSelectionLocked || !workOrderTaskDemandPickerOptions.length"',
    'function workOrderProcessTemplateMatchesProductFamily(',
    'if (workOrderTaskDemandSelectionLocked.value) return;',
    'if (!option?.recipe) return;',
    'class="work-order-source-allocation-empty"',
    '从任务需求开始建单',
    '<span>需求数量</span>',
    'return workOrderDraft.value.sourceAllocations.length > 0;',
    'button-label="选择任务需求"',
    'primary',
    'class="work-order-source-allocation-head"',
    '<QuantityWithUnitInput',
    'numeric-value',
    'function updateWorkOrderSourceAllocationQuantity(',
    'function workOrderSourceAllocationQuantityHasError(',
    '<span>工单备注（选填）</span>',
    "isProductionNewDocument ? '填写本工单的生产约束或特殊安排' : '填写本工单的变更说明或执行补充'",
    '<label class="form-field work-order-note-field"',
    '<h2>建单检查</h2>',
    "activePage.value !== 'work-orders' || !isProductionNewDocument.value || workOrderDraft.value.sourceAllocations.length > 0",
    '<section v-if="workOrderDraft.productCode" class="form-section production-work-order-editor production-work-order-binding-section">',
    'class="work-order-standard-stack"',
    'const workOrderDraftRecipePreviewRows = computed<WorkOrderRecipeSnapshotRow[]>',
    'const workOrderDraftProcessPreviewZones = computed',
    'const workOrderDraftProcessPreviewSteps = computed<WorkOrderProcessSnapshotStepRow[]>',
    'v-for="row in workOrderDraftRecipePreviewRows"',
    'v-for="zone in workOrderDraftProcessPreviewZones"',
    'v-for="step in workOrderDraftProcessPreviewSteps"',
    '<span>每单位标准</span>',
    '<span>本单理论用量<small>不含损耗</small></span>',
    '<span>本单预计需求<small>含损耗</small></span>',
    "const outputUnit = text(recipe.outputUnit, '件');",
    ':model="row.model"',
    ':spec="row.spec"',
    ':image-url="row.imageUrl"',
    ':image-label="row.imageLabel"',
    'function productionMaterialIdentityDetails(',
    '.work-order-recipe-material-cell :deep(.material-identity__text small) {',
    "section.title.endsWith('物料储备')",
    "v-if=\"!(activePage === 'work-orders' && section.title.endsWith('物料储备'))\"",
    "headers: ['物料', '预计需求', '库存判断', '数量明细']",
    "if (!snapshot) return '当前选用版本';",
    "headers: ['生产任务 / 来源', '需求数量', '本工单数量', '要求日期']",
    "{ label: '当前情况', value: '尚未形成生产安排' }",
    "workOrderSaving.value || !workOrderDraft.value.sourceAllocations.length",
    "const isGeneratedNote = /^来源于生产任务\\s+\\S+，按选中明细建立工单。$/.test(note)",
    "|| /^销售订单\\s+\\S+\\s+第\\s+\\S+\\s+行缺口",
    '.production-list-table.production-work-orders-table .date-stack small {',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    "if (!snapshot) return '当前版本绑定';",
    "if (!snapshot) return '原型展示（未保存确认版本）';",
    "来源于生产任务 ${sourceTaskCode}，按选中明细建立工单。",
    "headers: ['生产任务', '任务需求', '本工单数量', '要求日期']",
    '<input v-model="workOrderDraft.code" type="text" readonly />',
    'class="work-order-derived-empty"',
    "title: '生产安排与执行'",
    "title: '生产安排与批次'",
    '<input v-model="allocation.quantity" type="number"',
    "if (workOrderDraftFieldIsMissing('sourceLineId')) return '请至少添加一条任务需求';",
    'option.recommended',
    '.map((template) => ({ template, recommended:',
    'class="form-section production-work-order-editor production-work-order-material-section"',
    '<h2>预计物料</h2>',
    '<template #supplement>{{ row.quality }}</template>',
    'workOrderSnapshotFrozenMeta',
  ]);
  expectIncludesAll('src/components/WorkOrderTaskDemandPicker.vue', [
    'role="dialog"',
    '搜索任务号、来源、成品或日期',
    '生产任务 / 来源',
    ':disabled="!option.recipeReady"',
    '缺少启用配方',
    'to="/production/recipes"',
    "primary ? 'primary-action' : 'secondary-action'",
  ]);
  expectOrdered('src/views/Production2View.vue', [
    '<h2>任务需求</h2>',
    '<h2>工单内容</h2>',
    '<h2>生产标准</h2>',
  ], 'work-order editor source-first section order');
  expectOrdered('src/views/Production2View.vue', [
    "title: '生产执行记录'",
    "title: releaseFacts.releasedQty > 0 ? '剩余物料储备' : '物料储备'",
    "title: '工单配方'",
    "title: '工单工艺'",
  ], 'work-order detail section order');
  expectIncludesAll('server/index.mjs', [
    'hydrateDemoProductionWorkOrderSnapshots(data);',
    'processTemplate: processTemplateSnapshot,',
    'productionProcessStagesForTemplate(processTemplateSnapshot, suppliedSnapshot?.processSteps)',
    "snapshotStatus: 'server_frozen'",
  ]);
  expectIncludesAll('shared/production-version-catalog.json', [
    '"name": "水槽"',
    '"name": "10区"',
    '"name": "5区"',
    '"materials": [',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 70. 生产工单可执行标准快照（2026-07-21）']);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 364. 生产工单来源选择与生产标准录入骨架重构（2026-08-06）']);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 365. 生产工单建单前后视觉状态收口（2026-08-06）']);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 366. 生产工单数量录入与辅助字段一致性（2026-08-06）']);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 367. 生产工单建单动作、详情字段与草稿标准降噪（2026-08-06）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 62. 生产工单冻结标准与计划用量读模型（2026-07-21）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 337. 生产工单来源选择工作区与建单检查投影（2026-08-06）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 338. 生产工单建单状态渐进投影（2026-08-06）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 339. 生产工单任务分配数量录入投影（2026-08-06）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 340. 生产工单空草稿动作与详情语义投影（2026-08-06）']);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', ['## 210. 生产工单新建页重新设计与详情空骨架清理（2026-08-06）']);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', ['## 211. 生产工单新建页前后状态视觉复核（2026-08-06）']);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', ['## 212. 生产工单数量控件与错误提示复核（2026-08-06）']);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', ['## 213. 生产工单整体一致性复核（2026-08-06）']);
});

run('production batches separate frozen plan baselines from shop-floor actuals', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    "title: '生产依据'",
    "title: '现场产出'",
    "title: '领退料实绩'",
    "title: '质量记录'",
    'executionCardPlanSnapshot',
    'executionCardMaterialMovementLines',
    "return hasStarted ? '流转中' : '待开始';",
    "{ label: '待退料入库', value: qty(pendingReturnQty, unit) }",
  ]);
  expectIncludesAll('server/index.mjs', [
    'card.planSnapshot = {',
    'sourceWorkOrderRevision: Number(workOrder?.revision || 0)',
    'productionIssues: warehouse.productionIssues.filter',
    'productionReturns: warehouse.productionReturns.filter',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 71. 生产批次计划基线与现场实绩（2026-07-21）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 63. 生产批次计划基线与领退料实绩读模型（2026-07-21）']);
});

run('production workbench consumes frozen plans, equipment jobs, and postprocess quantities', () => {
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    'function selectWorkbenchTab(tab: WorkbenchTab)',
    '<PageTopbarPortal>',
    'class="workbench-topbar-tabs"',
    'function workbenchPlanForSource(workOrderCode: string, card?: Production2ExecutionCard)',
    'const planRecipe = workbenchPlanForSource(card.workOrderCode, card).recipe',
    'recipeCode: plan.recipeCode',
    'processCode: plan.processCode',
    '<dt>配方</dt>',
    '<dt>工艺</dt>',
    "| { type: 'reportRecords' }",
    '<span class="workbench-button-label">报工记录</span>',
    'const productionReportRows = computed(() => runtimeProductionReports.value',
    'const productionReportHistory = computed(() => productionReportRows.value.map',
    'title="报工记录"',
    'search-placeholder="搜索报工单、批次、产线、成品、报工人或时间"',
    ':records="shiftHandoverHistory"',
    '<span class="workbench-button-label">全部异常</span>',
    "query: { returnTo: '/production/workbench?tab=postprocess' }",
    "query: { returnTo: '/production/workbench?tab=exceptions' }",
    "<strong>{{ selectedLine?.name }} · {{ selectedLine && lineHasScheduledWork(selectedLine) ? '现场执行' : '产线状态' }}</strong>",
    ':class="{ \'is-single-panel\': !selectedLineCurrentChild && !selectedLineCurrentLot && !selectedLineQueuedOperationJob }"',
    'aria-label="生产工单"',
    'aria-label="本次安排"',
    'const queueDraftValidationMessage = computed(() =>',
    '本次安排数量必须大于 0',
    ':disabled="workbenchWriteActionsDisabled || Boolean(queueDraftValidationMessage) || Boolean(releaseBusyKey)"',
    'class="schedule-queue-note"',
    'class="workbench-button-label"',
    'role="dialog" aria-modal="true" aria-labelledby="workbench-operation-title"',
    '<p>产线空闲，暂无待开工任务。</p>',
    'function postprocessMetricRows(row: PostprocessRow): SiteMetricRow[] {',
    '<div v-for="metric in postprocessMetricRows(row)" :key="metric.label">',
    "{ label: '待包装', value: Math.max(0, row.qualifiedQty - row.packedQty)",
    "{ label: '待入库', value: Math.max(0, row.releasedInboundQty - row.inboundQty)",
    "{ label: '待包装', value: postprocessRows.value.filter((row) => row.stage === '待包装').length }",
  ]);
  expectExcludes('src/views/ProductionWorkbenchDemoView.vue', [
    '<i>{{ row.stage }}</i>',
    "<small>{{ line.queue.length ? `队列 ${line.queue.length}` : '无队列' }}</small>",
    '<header class="workbench-demo-header">',
    'activeTabDescription',
  ]);
  expectIncludesAll('src/styles/main.css', [
    'grid-template-rows: 36px minmax(0, 1fr);',
    '.schedule-line-available',
    '.site-idle-state',
    '.workbench-exception-row > span:nth-child(3)',
    'scrollbar-gutter: stable;',
    '.schedule-detail-button {',
    '.workbench-v2 .schedule-pool {',
    '.workbench-v2 .workbench-button-label,',
    '.workbench-topbar-tabs {',
    '.workbench-v2 .postprocess-batch-actions {',
    '.schedule-release-quantity.is-invalid {',
    '.schedule-release-footer p.is-error {',
    '.workbench-v2 .workbench-release-audit > .workbench-panel-title {',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    'v-if="requestedProductionReturnPath || (showProductionHeaderPrimaryAction && createButtonLabel)"',
    '<template v-if="requestedProductionReturnPath" #context>',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 72. 生产工作台计划、设备与后段投影收口（2026-07-21）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 64. 生产工作台统一读模型（2026-07-21）']);
});

run('quality workbench, list, and detail share state and quantity projections', () => {
  expectIncludesAll('src/utils/qualityState.ts', [
    'export function qualityInspectionConclusion',
    'export function qualityDispositionStage',
    'export function qualityLifecycleStatus',
    'export function qualityCurrentAction',
    'export function projectQualityState',
  ]);
  expectIncludesAll('src/data/quality.ts', [
    "import { projectQualityState } from '../utils/qualityState';",
    'inspectionConclusion: stateProjection.inspectionConclusion',
    'dispositionStage: stateProjection.dispositionStage',
    'currentAction: stateProjection.currentAction',
  ]);
  expectIncludesAll('src/views/QualityWorkbenchView.vue', [
    'projectQualityState({',
    "type QueueScope = 'all' | 'judgement' | 'review' | 'closure' | 'freeze'",
    "page === 'production' && /入库抽检|入库质检/.test(row.sourceType)",
    'const visibleProductionQueue = computed',
    ':aria-pressed="activeQueueScope === card.scope"',
    'Promise.allSettled([',
    'runtimeIncomingLoading && !runtimeIncomingLoaded',
    'runtimeProductionLoading && !runtimeProductionLoaded',
    'runtimeClosureLoading && !runtimePatrolLoaded && !runtimeDefectLoaded',
    'runtimeIncomingError && !runtimeIncomingLoaded',
    'runtimeProductionError && !runtimeProductionLoaded',
    'runtimeClosureError && !runtimePatrolLoaded && !runtimeDefectLoaded',
    '<h2>来料质检待办</h2>',
    'aria-label="查看处理列表"',
    'to="/quality/patrol"',
    'to="/quality/defects"',
    "helper: '来料与生产复判、复检和处置'",
  ]);
  expectExcludes('src/views/QualityWorkbenchView.vue', [
    'PageTopbarPortal',
    'quality-workbench-hero',
  ]);
  expectIncludesAll('src/views/QualityView.vue', [
    'const projection = projectQualityState({',
    'function qualityListItemFacts',
    "line.qty ? `受检 ${line.qty}` : ''",
    'function showRowCurrentAction',
    "rowNextAction(row)",
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    "if (task.kind === '报工全检')",
    "{ label: '受检', value: taskQty }",
    "{ label: '合格 / 不合格'",
    "{ label: '当前责任'",
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    "import { isQualityDispositionClosed, projectQualityState } from '../utils/qualityState';",
    'function productionQualityState',
    'function executionCardQualityRemainderStage',
    'function workOrderQualityRemainderGroups',
    'detail: workOrderQualityRemainderSummary(raw.code)',
    "{ label: '生产', value: listProgressRatio(chain.reportedQty, planQty, unit) }",
    "{ label: '检验结论', value: qualityState.inspectionConclusion }",
    "{ label: '当前待办', value: qualityState.currentAction }",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 73. 生产质检状态与数量结果统一（2026-07-21）']);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 74. 生产单据消费质量责任投影（2026-07-21）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 65. 质量状态公共投影与生产检验数量结果（2026-07-21）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 66. 生产质量责任与不良数量映射（2026-07-21）']);
});

run('quality patrol pages separate immutable inspection evidence from staged closure work', () => {
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    "const patrolInspectionFactsLocked = computed",
    "const patrolResponsibilityEditable = computed",
    "const patrolDispositionProjection = computed",
    "function synchronizePatrolSubmissionFacts",
    "draft.disposition = finding ? '现场整改' : '无异常关闭'",
    'v-if="isDetail || patrolInspectionFactsLocked || defectEvidenceLocked"',
    "!isQualityReadOnly && !patrolInspectionFactsLocked",
    "currentKind === 'patrol' ? '提交去向' : currentKind === 'production' ? '结果去向' : '处置方式'",
    "currentStatus !== '待整改'",
    "currentStatus !== '待复查'",
  ]);
  expectIncludesAll('src/views/QualityView.vue', [
    "if (page === 'patrol')",
    "page === 'patrol'",
    '<ListStatusOverview',
    ':next-step="qualityListAction(row)"',
    'function qualityListOverviewFacts(row: QualityListRow)',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function qualityClosureStageDraft(kind, record, candidate)',
    "if (record.status === '待整改')",
    "if (record.status === '待复查')",
    "derivedDraft.disposition = nextStatus === '已关闭' ? '无异常关闭' : '现场整改'",
  ]);
  expectExcludes('src/data/quality.ts', ['整改要求']);
});

run('quality defect pages freeze source evidence and edit only the active closure stage', () => {
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    'const defectEvidenceLocked = computed',
    'const defectPlanLocked = computed',
    '|| defectEvidenceLocked.value',
    "<option v-if=\"currentKind === 'defects'\" value=\"\">请选择{{ sourceTypeFieldLabel }}</option>",
    "['', '来料质检', '生产质检', '质量巡检'].includes(documentDraft.sourceType)",
    'v-if="isDetail || patrolInspectionFactsLocked || defectEvidenceLocked"',
    "currentKind === 'defects' && currentStatus !== '处置中'",
    "currentKind === 'defects' && currentStatus !== '待验证'",
    'patrolInspectionFactsLocked || defectEvidenceLocked',
  ]);
  expectIncludesAll('server/index.mjs', [
    "if (kind === 'defects')",
    "if (record.status === '待处理') return incoming",
    "if (record.status === '处置中')",
    'rectificationAction: incoming.rectificationAction',
    "if (record.status === '待验证')",
    'verificationConclusion: incoming.verificationConclusion',
  ]);
  expectIncludesAll('src/data/quality.ts', [
    'const incomingDefectChecks',
    'const smallRollDefectChecks',
    "code: 'NCR-20260615-003'",
    "status: '待验证'",
    "verificationResult: '通过'",
    "rectificationAction: '已补发 1 箱（12 卷）并完成仓库出库，客户已签收。'",
  ]);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    'defect handling overwrote the frozen source type',
    'defect handling overwrote the approved disposition plan',
    'defect verification overwrote the executed disposition result',
  ]);
});

run('incoming quality pages freeze receipt facts and keep sample evidence truthful', () => {
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    'const incomingSourceFactsLocked = computed',
    "currentKind.value === 'incoming'",
    "qualityRequiredLabelClass(sourceTypeFieldLabel, qualitySourceFactsLocked)",
    "line.sampleQty ? (line.failedQty || `0 ${qualityLineUnit(line, line.sampleQty)}`) : '-'",
    'class="quality-process-heading evidence-reinspection-heading"',
    'class="form-field full-field quality-process-actions"',
  ]);
  expectIncludesAll('src/data/quality.ts', [
    "const sampleUnit = String(task.sampleQty || '')",
    'const failedQtyUnit = isIncomingTask ? sampleUnit || resultUnit : resultUnit',
    "task.sampleQty\n            ? `0${failedQtyUnit ? ` ${failedQtyUnit}` : ''}`",
  ]);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    'incoming quality draft overwrote the frozen source type',
    'incoming quality draft overwrote the frozen supplier',
    'incoming quality draft overwrote the frozen quality warehouse',
  ]);
});

run('seven-module lists keep compact badges and readable fixed status cells', () => {
  expectIncludesAll('src/styles/main.css', [
    '.delivery-signal-cell > .mini-status',
    '.master-simple-table .table-row > span > .mini-status',
    '.quote-status-cell > small',
    '-webkit-line-clamp: 2',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    "'sales-issue-status-shell': activePage === 'salesIssues'",
    "if (row.page === 'salesIssues') return [];",
    '<strong>当前进度</strong>',
    '<small>任务 · 待办</small>',
    '.sales-issue-status-shell',
  ]);
  expectExcludes('src/views/MasterMaterialEditorView.vue', [
    '决定物料会出现在哪些业务单据中，可多选。',
  ]);
});

run('detail guidance stays actionable and readonly finance pages avoid fake uploads', () => {
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    '请核对交期、生产进度和出库计划，及时处理时效风险。',
    '请由生产继续推进当前任务；完成入库后再进入交付。',
  ]);
  expectExcludes('src/views/SalesOrderEditorView.vue', [
    'const progressSummary =',
    '订单存在独立异常或时效提示；当前',
    '生产进度为${production}，交付进度为${delivery}',
  ]);
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    'function purchaseOrderActionDescription(label: string, status: string)',
    "if (/质量|质检/.test(step) || status === '待质检') return '等待质检处理';",
    '质检岗位完成判定后，结果会自动更新到采购跟进。',
    '采购跟进供应商开票安排，并在本单登记实际收票日期、金额和备注。',
  ]);
  expectExcludes('src/views/PurchaseOrderEditorView.vue', [
    '单据状态为${purchaseDocumentStatus.value}；到货',
    'action: facts ? label : purchaseOrderNextStepAction(status)',
  ]);
  for (const file of [
    'src/views/FinanceSalesInvoiceEditorView.vue',
    'src/views/FinancePurchaseInvoiceEditorView.vue',
    'src/views/FinanceReceivableEditorView.vue',
    'src/views/FinancePayableEditorView.vue',
  ]) {
    expectExcludes(file, ['  Paperclip,', '<h2>附件</h2>']);
  }
});

run('seven-module list summaries keep traceable long identities readable', () => {
  expectIncludesAll('src/views/SalesView.vue', [
    '.order-page .order-table .order-list-row > .product-summary:nth-child(3) small {',
    '-webkit-line-clamp: 2;',
    '共&nbsp;{{ row.products.length }}&nbsp;项',
  ]);
  expectIncludesAll('src/views/PurchaseView.vue', [
    '.purchase-page .purchase-order-table .purchase-order-list-row > .product-summary:nth-child(3) small {',
    "const quantity = productQtyWithUnit(first).replace(/\\s+([^\\s]+)$/, '\\u00a0$1');",
    '.purchase-order-progress-scan i {',
    'overflow-wrap: anywhere;',
    '-webkit-line-clamp: 2;',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.warehouse-operation-table .product-summary small {',
    '-webkit-line-clamp: 2;',
  ]);
});

run('list attachment noise follows each module decision', () => {
  expectExcludes('src/views/SalesView.vue', [
    'function attachmentsFor(',
    '<span class="attachment-head">附件</span>',
    '<span v-if="attachmentsFor(row).length">附件 {{ attachmentsFor(row).length }} 个</span>',
    "'附件数'",
  ]);
  expectIncludesAll('src/views/PurchaseView.vue', [
    '<span v-if="row.attachments.length">附件 {{ row.attachments.length }} 个</span>',
  ]);
  expectExcludes('src/views/PurchaseView.vue', [
    '<span class="attachment-head">附件</span>',
  ]);
  expectExcludes('src/views/PurchaseView.vue', ["{{ row.attachments.length ? `${row.attachments.length} 个` : '无附件' }}"]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    '<span v-if="row.attachmentCount">附件 {{ row.attachmentCount }} 个</span>',
  ]);
  expectExcludes('src/views/WarehouseView.vue', ['function attachmentCountText(']);
  expectExcludes('src/views/WarehouseView.vue', ["return row.attachmentCount ? `${row.attachmentCount} 个` : '无附件';"]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 82. 七模块空值与附件计数去噪（2026-07-21）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 74. 附件能力与空值展示投影（2026-07-21）']);
});

run('source-driven invoice editors avoid fake lines and keep quantity controls readable', () => {
  expectIncludesAll('src/styles/main.css', [
    '.quantity-with-unit-field {',
    'font-size: 13px;',
  ]);
  expectIncludesAll('src/views/FinanceSalesInvoiceEditorView.vue', [
    '<span class="allocation-field-label">数量</span>',
    '.allocation-current-cell .allocation-field-label {',
    '<div v-if="invoiceDraft.sourceDoc" class="invoice-allocation-table">',
    '选择来源销售订单后带出可开票明细。',
    '其他发票已开 / 占用',
  ]);
  expectExcludes('src/views/FinanceSalesInvoiceEditorView.vue', ['.allocation-current-cell label > span {']);
  expectIncludesAll('src/views/FinancePurchaseInvoiceEditorView.vue', [
    '<section v-if="invoiceDraft.sourceDoc || isReadOnly" class="form-section">',
    '选择{{ sourceReferenceLabel }}后显示匹配结果。',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', ['## 83. 来源承接型发票空态与数量控件基线（2026-07-21）']);
  expectIncludesAll('docs/erp-web-business-fact-model.md', ['## 75. 来源单据分配空态投影（2026-07-21）']);
});

run('finance sales invoices distinguish loading, source truth, reversal, and refund facts', () => {
  expectIncludesAll('src/views/FinanceView.vue', [
    "import ListLoadState from '../components/ListLoadState.vue';",
    'v-if="isListLoading || listLoadError"',
    "if (record.refundStatus === '待退款') return '待退款';",
    "if (record.refundStatus === '已退款') return '已退款';",
    'needsSettlementAction: isRefundPending || outstanding > 0.01',
  ]);
  expectIncludesAll('server/index.mjs', [
    "function financeTotalsByTaxMode(lines, taxMode = '含税')",
    "throw requestError(400, '销售发票必须关联来源销售订单。');",
    'sourceDoc: sourceOrderRecord.code',
    'partyCode: sourceOrderRecord.customerCode',
    "invoice.refundStatus = refund ? '待退款' : '无需退款';",
    "receivable.refundStatus = refund ? '待退款' : '无需退款';",
    "if (dueDate < invoiceDate) throw requestError(400, '销售发票到期日期不能早于开票日期。');",
  ]);
  expectIncludesAll('src/views/FinanceSalesInvoiceEditorView.vue', [
    'DocumentLoadState',
    "const sourceTaxMode = computed(() => sourceOrderRecord.value?.taxMode || '含税');",
    "const totalAmount = sourceTaxMode.value === '含税' ? lineAmount : amount + taxAmount;",
    '{{ sourceAmountLabel }}',
    '{{ sourceUnitPriceLabel }}',
  ]);
  expectIncludesAll('src/views/FinancePurchaseInvoiceEditorView.vue', [
    'DocumentLoadState',
    '<span>收票公司</span>',
    '<span>供应商 / 联系人</span>',
    "{{ purchaseTaxMode === '含税' ? '含税单价' : '未税单价' }}",
    'remainingAmountAfterCurrent(line)',
  ]);
  expectIncludesAll('server/index.mjs', [
    "throw requestError(400, '采购发票必须关联来源采购收货。');",
    'sourceDoc: receipt?.code || sourceReference',
    'sourceOrder: purchaseOrder.code',
    "partyCode: receipt?.supplierCode || purchaseOrder.supplierCode || ''",
    'const invoiceableAmount = orderedQty > 0',
    "if (dueDate < invoiceDate) throw requestError(400, '采购发票到期日期不能早于收票日期。');",
  ]);
  expectIncludesAll('src/views/FinanceReceivableEditorView.vue', [
    'DocumentLoadState',
    '<div><dt>收款公司</dt>',
    "const isRefundPending = computed(() => receivableDraft.value?.refundStatus === '待退款');",
    "{ key: 'due', label: '到期状态'",
    "{ key: 'payments', label: '收款记录'",
    '前往来源销售发票处理退款',
  ]);
  expectIncludesAll('src/views/FinancePayableEditorView.vue', [
    'DocumentLoadState',
    '<div><dt>付款公司</dt>',
    "const isPaymentHeld = computed(() => payableDraft.value?.holdStatus === '已暂缓');",
    "{ key: 'due', label: '到期状态'",
    "{ key: 'payments', label: '付款记录'",
    "label: '异常/暂停'",
    'WarehouseActionReasonDialog',
  ]);
  expectIncludesAll('server/index.mjs', [
    "record.holdStatus = '已暂缓';",
    "record.holdStatus ||= '正常';",
    "holdStatus: existing?.holdStatus === '已暂缓' || orderPaymentHeld ? '已暂缓' : '正常'",
    "if (existing.holdStatus === '已暂缓')",
  ]);
});

run('seven-module detail facts and new-document status noise share one visual contract', () => {
  expectIncludesAll('src/styles/main.css', [
    '.quote-editor.is-detail-view .quote-fields:has(.form-readonly-value)',
    'min-height: 62px;',
    'font-weight: 600;',
    'font-weight: 650;',
  ]);
  expectIncludesAll('src/components/DocumentFactGrid.vue', [
    'min-height: 62px;',
    'font-weight: 600;',
    'font-weight: 650;',
  ]);
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    'class="quote-editor warehouse-document-editor purchase-receipt-editor is-detail-view"',
  ]);
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', ['receipt-status-cluster']);
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    'v-if="isEdit" class="mini-status"',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    'v-if="!isProductionNewDocument" class="mini-status" :class="statusClass(workOrderDraft.status)"',
    'materialRequestIsEditable && !isProductionNewDocument',
    'isProductionEditableDocument && !isProductionNewDocument',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 85. 七模块详情事实网格与新建状态去噪（2026-07-21）',
  ]);
});

run('production receipt pages stay quality-released, source-driven and inventory-authoritative', () => {
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    'const receivableProductionCards = computed',
    'const selectedProductionReceiptAvailableQty = computed',
    'async function selectProductionReceiptSource()',
    "'暂无已放行待入库批次'",
    "'production-receipt-line-row': isAuthoritativeProductionReceipt",
    '本批次最多可入',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    "'production-receipt-status-shell': activePage === 'productionReceipts'",
    '入库阶段 · 下一步',
    '确认成品入库',
  ]);
  expectExcludes('src/views/WarehouseView.vue', ["productionReceipts: '登记入库'"]);
  expectIncludesAll('src/styles/main.css', [
    '.warehouse-operation-list-shell.production-receipt-status-shell .quote-status-column {',
    '.warehouse-document-line-row.production-receipt-line-row {',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function productionReceiptReservedQty(',
    'function normalizeProductionReceipt(',
    'targetMeta.allowProductionReceipt !== true',
    'workOrder: card.workOrderCode,',
    'releaseBatch: card.releaseBatchCode,',
    'materialCode: card.productCode ||',
    "note: String(input.note || existing?.note || '')",
    'attachments: Array.isArray(input.attachments)',
  ]);
});

run('seven-module list fields keep decision text readable and headers aligned', () => {
  expectIncludesAll('src/styles/main.css', [
    '.purchase-requisition-table .purchase-requisition-list-row > .product-summary:nth-child(3) small {',
    '.warehouse-operation-list-shell.sales-issue-status-shell .quote-status-column,',
    '.warehouse-operation-list-shell.production-issue-status-shell .quote-status-column,',
    '.warehouse-operation-list-shell.production-return-status-shell .quote-status-column,',
    '.warehouse-operation-list-shell.production-receipt-status-shell .quote-status-column {',
    '.sales-issue-status-shell .warehouse-operation-table .warehouse-operation-list-row > .product-summary:nth-child(3) strong {',
    'grid-auto-rows: 70px;',
    'grid-auto-rows: 72px;',
  ]);
  expectIncludesAll('src/views/PurchaseView.vue', [
    '<span>含税采购单价</span>',
    '.purchase-page .purchase-order-table .purchase-order-list-row > .amount-stack small {',
  ]);
  expectIncludesAll('src/views/SalesView.vue', [
    '<span>含税单价</span>',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    '.production-list-page {\n  display: block;',
    '.production2-list-shell {\n  display: block;',
    '.production-status-overview-cell {',
    '<ListStatusOverview',
    ':progress="productionListStatusOverview(row).progress"',
    '.production-list-table .table-row:not(.table-head) .quote-code strong {',
    '.production-list-table .table-row:not(.table-head) .quote-code small {',
    '.production-loss-ledger-table .production-reference-row > :nth-child(2) small,',
    '.production-list-table.production-process-steps-table .table-head {',
    'height: 40px;',
    'grid-auto-rows: 88px;',
    '@media (max-width: 1260px) and (min-width: 761px)',
  ]);
  expectIncludesAll('src/views/QualityView.vue', [
    "'quality-defects-table': activePage === 'defects'",
    '.quality-table.quality-standards-table .party-cell small {',
    '.quality-table.quality-defects-table .quality-code-source small {',
    'grid-auto-rows: 82px;',
    'font-weight: 650;',
    '@media (max-width: 1260px) and (min-width: 761px)',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 86. 七模块列表字段职责与可读性基线（2026-07-21）',
    '## 92. 生产列表回归系统列表骨架（2026-07-21）',
  ]);
});

run('work order list separates lifecycle from batch progress and current action', () => {
  const productionView = read('src/views/Production2View.vue');
  const workOrderOverviewStart = productionView.indexOf("if (row.page === 'work-orders') {");
  const workOrderOverviewEnd = productionView.indexOf('const release = releaseBatchForExecutionCard(raw.code);', workOrderOverviewStart);
  const workOrderOverviewBlock = productionView.slice(workOrderOverviewStart, workOrderOverviewEnd);
  expectIncludesAll('src/views/Production2View.vue', [
    "tableHeaders: ['生产工单/成品', '任务需求', '计划数量/要求日期', '配方/工艺']",
    "searchPlaceholder: '搜索工单号、任务需求、成品、要求日期、配方或工艺'",
    "text(row.raw.productCode, '')",
    "statusColumnTitle: '工单状态'",
    "'work-orders': '安排 · 生产 · 入库'",
    'function productionListStatusOverview(row: ProductionListRow)',
    'function workOrderOperationalSort(left: ProductionListRow, right: ProductionListRow)',
    'function workOrderActionableProductionCard(workOrderCode: unknown)',
    "if (!allocations.length) return '请选择至少一条生产任务需求';",
    'function workOrderRequirementDateSummary(raw: AnyRecord | undefined)',
    "label: '要求日期提醒'",
    'workOrderReadonlyProductIdentity',
    'text-only',
    "{ title: `配方 · ${text(raw.recipeCode, '未选配方')}`, subtitle: `工艺 · ${text(raw.processTemplateCode, '未选工艺')}` }",
    "activePage === 'work-orders' && text(row.raw.productCode, '')",
    "if (activeQualityDisposition) attention = '质量异常待处置';",
    "key: 'due-risk'",
    "label: '要求日期提醒'",
    'const materialReserveLines = releaseFacts.unreleasedQty > 0',
    '...(materialReserveLines.length',
    'function workOrderRemainingMaterialNeeds(order: AnyRecord, unreleasedQtyValue?: number)',
    'function workOrderMaterialPreparationLabel(order: AnyRecord)',
    "title: releaseFacts.releasedQty > 0 ? '剩余物料储备' : '物料储备'",
    'const workOrderStructureIsEditable = computed(() =>',
    'async function closeCurrentWorkOrder()',
    "if (index === 3) return 'product-summary production-work-order-rule-cell';",
    '.production-list-table.production-work-orders-table .production-work-order-rule-cell small {',
    '.production-list-shell.production-work-orders-shell {',
    'grid-template-columns: minmax(0, 1fr) 280px;',
    'grid-template-columns: minmax(0, 1fr) 268px;',
    'grid-template-columns: 68px minmax(0, 1fr);',
    'minmax(142px, 0.9fr)',
    'const taskSourceKey = isProductionNewDocument.value && route.query.task',
    'const newDocumentSourceKey = copySourceKey || taskSourceKey;',
    'workOrderDraft.value = workOrderDraftFromRow(currentProductionDocument.value);',
    'const emptyDraft = emptyWorkOrderDraft();',
    'draft.dueDate = emptyDraft.dueDate;',
    'draft.ownerEmployeeCode = emptyDraft.ownerEmployeeCode;',
    'function buildWorkOrderMaterialNeeds(',
    'function workOrderEffectiveMaterialNeeds(order: AnyRecord)',
    'if (facts.releasableQty <= 0) return facts.blocker;',
    "if (/待质检|待检/.test(releaseFacts.blocker)) return '等待质检放行';",
    '待检库存放行或可用库存补齐后，系统会重新计算可安排数量',
    "interventionDescription || workOrderMaterialBlocked ? 'pending'",
    'materialNeeds: buildWorkOrderMaterialNeeds(draft.planQty, workOrderSelectedRecipe.value, draft.materialNeeds)',
    '<WorkOrderTaskDemandPicker',
    '<span>本工单数量</span>',
    'new Set(allocations.map((allocation) => allocation.taskCode).filter(Boolean)).size',
    'const sourceTitle = sourceTaskCodes.length > 1',
    'function productionExceptionSourceTaskCodes(raw: AnyRecord | undefined)',
    'taskCodes.forEach((taskCode) => {',
    ".some((allocation) => allocation.taskCode === row.code)",
    "{{ workOrderDraft.productCode ? '请选择工艺版本' : '请先选择成品' }}",
  ]);
  assert(
    workOrderOverviewStart >= 0
      && workOrderOverviewEnd > workOrderOverviewStart
      && !workOrderOverviewBlock.includes('progress:'),
    'production work-order status should keep arrangement, production and inbound once without a repeated primary progress bar',
  );
  expectExcludes('src/views/Production2View.vue', [
    'if (draft.plannedDate > draft.dueDate)',
    '<span>首个任务需求来源</span>',
    '<option value="manual">手工工单</option>',
    'workOrderManualSourceSelected',
    'handleWorkOrderBuildModeChange',
    '选择生产工单负责人',
    'work-order-planned-date',
    'work-order-due-date',
    'work-order-owner',
  ]);
  expectIncludesAll('server/index.mjs', [
    "parts[4] === 'close'",
    "record.documentStatus = '已关闭';",
    'const hasDownstreamDocuments = Boolean(existing)',
    '已形成释放、批次、质检或异常记录',
    "throw requestError(400, '生产工单必须至少承接一条生产任务需求。');",
    'if (sourceAllocations.length) {',
    'function workOrderMaterialNeedsFromRecipe(recipe, planQtyValue)',
    'function workOrderFrozenMaterialNeeds(workOrder)',
    'const materialNeeds = submitted',
    'order.materialNeeds = workOrderMaterialNeedsFromRecipe(',
    'function productionRecipeWithCanonicalMaterialControls(data, recipe)',
    'repairRecipeControls(order.snapshot.recipe);',
    'function productionExceptionSourceTasks(production, exception)',
    'function productionExceptionMaterialOwner(production, exception)',
    'tasks: productionExceptionSourceTasks(production, exception)',
    'sourceAllocations: cloneJson(workOrderSourceAllocations(order), [])',
  ]);
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    'function workOrderSourceAllocationsForWorkbench(order: Production2WorkOrder)',
    'function workOrderTaskProjectedQtyForWorkbench(order: Production2WorkOrder, taskCode: string, metric: number)',
    '.filter((order) => workOrderIncludesTaskForWorkbench(order, task.code))',
    'workOrderSourceTaskCodesForWorkbench(workOrder).forEach((taskCode) => {',
    'return master?.dueDate || masterTask(master)?.dueDate ||',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 87. 生产工单列表状态与批次进度分工（2026-07-21）',
    '## 88. 七模块列表分型与状态总览规则（2026-07-21）',
    '## 91. 列表与详情状态同源及平板空间规则（2026-07-21）',
    '## 292. 生产工单来源、批次待办与详情身份收口（2026-08-03）',
    '## 293. 生产工单待办优先级、详情字段与工艺降噪（2026-08-04）',
    '## 294. 生产工单列表身份层级与检索字段收口（2026-08-04）',
    '## 295. 生产工单列表状态栏宽度与桌面断点收口（2026-08-04）',
    '## 296. 生产工单任务带入、日期与冻结物料闭环（2026-08-04）',
    '## 297. 生产工单缺料提示与来料质检口径收口（2026-08-04）',
    '## 298. 生产工单冻结工艺作业指导展示（2026-08-04）',
    '## 299. 生产工单物料储备与冻结标准顺序（2026-08-04）',
    '## 358. 多来源生产工单跨页面投影收口（2026-08-06）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 266. 生产工单来源模式、批次动作与历史快照合同（2026-08-03）',
    '## 267. 生产工单当前待办、备注必填与详情投影合同（2026-08-04）',
    '## 268. 生产工单列表物料身份与搜索投影合同（2026-08-04）',
    '## 269. 生产工单列表状态概览密度合同（2026-08-04）',
    '## 270. 生产工单任务初始化、计划日期与冻结物料需求合同（2026-08-04）',
    '## 271. 生产工单物料控制与阻断提示合同（2026-08-04）',
    '## 272. 生产工单冻结工艺指导投影合同（2026-08-04）',
    '## 273. 生产工单详情章节顺序合同（2026-08-04）',
    '## 331. 多来源生产工单下游权威关系合同（2026-08-06）',
  ]);
  const versionCatalog = JSON.parse(read('shared/production-version-catalog.json'));
  const spoolLines = versionCatalog.recipes
    .flatMap((recipe) => recipe.materials || [])
    .filter((material) => material.materialCode === 'M-PKG-SPOOL-1KG');
  assert(
    spoolLines.length > 0 && spoolLines.every((material) => material.incomingQcRequired === true),
    'shared production recipes should inherit the spool incoming-QC requirement',
  );
  expectIncludesAll('src/components/MaterialIdentity.vue', [
    'textOnly?: boolean;',
    "'is-text-only': textOnly",
    'v-if="!textOnly"',
    '.material-identity.is-text-only',
    'return compared === normalized;',
  ]);
  expectExcludes('src/components/MaterialIdentity.vue', ['compared.includes(normalized)']);
});

run('production details share fact hierarchy and avoid desktop inner scrolling', () => {
  expectIncludesAll('src/components/DocumentFactGrid.vue', [
    'maxColumns?: 2 | 3 | 4;',
    'maxColumns: 4,',
    'rowSizes(run.length, props.maxColumns)',
    'const mobileFullIndex = run.length % 2 === 1 ? run.length - 1 : -1;',
    "'is-mobile-full': fact.mobileFull,",
    '.document-fact-item:not(.is-full).is-mobile-full {',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    'aria-label="备料申请基础信息"',
    'aria-label="系统动作定义信息"',
    'aria-label="系统动作执行契约"',
    ':aria-label="`${activeListTitle}基础信息`"',
    ':aria-label="`${section.title}信息`"',
    ':max-columns="activePage === \'work-orders\' ? 3 : 4"',
    "activePage === 'work-orders' ? '工单概览'",
    '.production-work-order-detail-section.is-work-order-execution-section .document-fact-grid {',
    '.production-material-request-row.is-readonly-request-row {',
    'grid-template-columns: minmax(0, 1.45fr) repeat(3, minmax(0, 0.62fr)) minmax(0, 1.15fr);',
    '.production-task-material-row {',
    '.production-task-workorder-row {',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    'production-work-order-fact-grid',
    'production-operational-fact-grid',
    'production-detail-fact-grid',
    'production-system-action-contract-grid',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 93. 生产详情事实层级与明细表适配（2026-07-21）',
  ]);
});

run('sales quote keeps lifecycle, validity, and conversion relation separate', () => {
  expectIncludesAll('src/views/SalesQuoteEditorView.vue', [
    'const relatedOrderPath = computed(() =>',
    "return { label: '不再适用', detail: '报价已转订单，后续交付在关联销售订单中继续。', tone: 'muted' };",
    "label: '跟进关联订单',",
    '查看 {{ quoteDraft.convertedOrderCode }}',
    '<div><dt>报价人</dt><dd>{{ quoteDraft.owner || \'—\' }}</dd></div>',
    'kind="销售"',
    'function hasValidQuoteProductLines(products: SalesQuoteProduct[])',
    'new Set(keys).size === keys.length',
    "quoteStatus === '已确认' ? '保存变更' : '保存草稿'",
    'listReference,',
    "listReference<MasterDataRecord>('currencies', { activeOnly: true, limit: 50 })",
    'const currencyRows = ref<ReferenceOption<MasterDataRecord>[]>([]);',
    'const currencyOptions = computed(() =>',
    "currency: 'CNY',",
    'v-model="quoteDraft.currency"',
    'class="quote-line-currency-select"',
    'aria-label="币种"',
    'data-required-field="currency"',
    '报价单草稿已保存',
    "title: '确认当前报价？'",
    '系统将先保存当前内容，再将报价状态改为“已确认”。',
    'v-model="quoteDraft.ownerEmployeeCode"',
    '<span class="field-label required-label">交付方式</span>',
    '<span class="field-label required-label">付款方式</span>',
    '<span class="field-label required-label">运费承担</span>',
    '<span class="field-label required-label">税率</span>',
    "priceInputMode: '含税'",
    "function lineUnitPriceValue(product: SalesQuoteProduct, mode: '含税' | '不含税')",
    "function updateLineUnitPrice(product: SalesQuoteProduct, mode: '含税' | '不含税', event: Event)",
    'function normalizeLineUnitPrice(product: SalesQuoteProduct)',
    'function formatCurrencyInput(value: number)',
    'function formatCalculatedUnitPrice(value: number)',
    "function lineUnitPriceTitle(product: SalesQuoteProduct, mode: '含税' | '不含税')",
    'return Number(value || 0).toFixed(2);',
    ':value="lineUnitPriceValue(item, \'不含税\')"',
    ':value="lineUnitPriceValue(item, \'含税\')"',
    'placeholder="0.00"',
    'aria-label="未税单价"',
    'aria-label="含税单价"',
    '@blur="normalizeLineUnitPrice(item)"',
    ":title=\"lineUnitPriceTitle(item, '不含税')\"",
    ":title=\"lineUnitPriceTitle(item, '含税')\"",
    'v-model="item.taxRate"',
    'function requiredLineTaxRateClass(product: SalesQuoteProduct)',
    'grossAmount,',
    ':show-price-tax="false"',
    'function previewQuotePdf()',
    "name: 'sales-quote-pdf',",
    "window.open(previewPath, '_blank', 'noopener,noreferrer');",
  ]);
  expectIncludesAll('src/views/SalesQuotePdfView.vue', [
    'MORE THAN PRINTING',
    '材启万象',
    '<dt>客户名称</dt>',
    '<h2>报价明细</h2>',
    '{{ item.model || \'—\' }}',
    '{{ item.spec || \'—\' }}',
    'class="line-model"',
    'class="line-spec"',
    '.line-model {',
    '.line-spec {',
    '含税总计',
    'class="quote-total-label"',
    'width: 45mm;',
    'min-height: 16.5mm;',
    'margin-top: 5.2mm;',
    'function splitTermsPrelude(value: string)',
    'const productGroups = paginateProducts(products, 6);',
    "page.isTermsContinuation ? '补充条款（续）' : '补充条款'",
    'class="term-continuation-title"',
    '.term-continuation-title {',
    '打印 / 保存 PDF',
    'label: `${companyShortName.value} ${definition.labelSuffix}`',
    'class="quote-preview-scroll"',
    '@scroll.passive="syncCurrentPreviewPage"',
    '@click="goToPreviewPage(currentPreviewPage - 1)"',
    '@click="goToPreviewPage(currentPreviewPage + 1)"',
    '.quote-preview-scroll {',
    'overflow: auto;',
    '@page',
    'size: A4;',
  ]);
  expectExcludes('src/views/SalesQuotePdfView.vue', [
    'Filatrix 中文报价单',
  ]);
  expectExcludes('src/views/SalesQuoteEditorView.vue', [
    '<i v-if="!isDetail" class="mini-status"',
    'kind="销售物料"',
    '<dt>销售负责人</dt>',
    '新建时按当前登录账号确定，后续修改保留原报价人。',
    'incotermHint(quoteDraft.incoterm)',
    '缺少英文名称或英文规格；不影响保存',
    'tradeType',
    '贸易类型',
    'incoterm',
    '贸易术语',
    'ExportQuoteTemplateDialog',
    'PdfReadinessDialog',
    'getSalesQuotePdfReadiness',
    'englishName: material.englishName',
    'englishSpec: material.englishSpec',
    'documentLanguage',
    '单据语言',
    '<span>计价口径</span>',
    'v-model="quoteDraft.taxRate"',
    '单价输入口径',
    'changePriceInputMode',
    'quote-price-mode-switch',
    ':placeholder="`未税单价（${quoteCurrency}）`"',
    ':placeholder="`含税单价（${quoteCurrency}）`"',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.quote-terms-fact-grid > div:last-child:nth-child(3n + 2)',
    '.order-terms-fact-grid {',
    'grid-template-columns: repeat(4, minmax(0, 1fr));',
    '.sales-quote-editor .quote-line-row.quote-tax-line-row',
    '.quote-line-section-tools',
    '.quote-line-currency-select',
    'font-variant-numeric: tabular-nums;',
  ]);
  expectIncludesAll('src/components/QuantityWithUnitInput.vue', [
    "{{ unitText || '—' }}",
    'numericValue?: boolean;',
    'if (props.numericValue) return qty;',
  ]);
  expectExcludes('src/components/QuantityWithUnitInput.vue', [
    '待选单位',
  ]);
  expectIncludesAll('src/utils/taxCalculation.ts', [
    "['13%', '9%', '6%', '3%', '1%', '0%', '免税']",
  ]);
  expectIncludesAll('src/components/TermsTemplateDialog.vue', [
    'showPriceTax?: boolean;',
    'showPriceTax: true,',
    'v-if="showPriceTax"',
  ]);
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    "priceInputMode = product.priceInputMode === '不含税' ? '不含税' : '含税'",
    "orderDraft.value.currency = quote.currency || orderDraft.value.currency || 'CNY';",
    "orderDraft.value.taxMode = '含税';",
    "function lineUnitPriceValue(product: SalesOrderProduct, mode: '含税' | '不含税')",
    "function updateLineUnitPrice(product: SalesOrderProduct, mode: '含税' | '不含税', event: Event)",
    'function requiredLineTaxRateClass(product: SalesOrderProduct)',
    'v-model="orderDraft.currency"',
    ':value="lineUnitPriceValue(item, \'不含税\')"',
    ':value="lineUnitPriceValue(item, \'含税\')"',
    'v-model="item.taxRate"',
    ':show-price-tax="false"',
    "const saveActionLabel = computed(() => (isChangeMode.value ? '保存变更' : '保存草稿'));",
    'quote-terms-fact-grid order-terms-fact-grid',
    "orderDraft.delivery || '—'",
  ]);
  expectExcludes('src/views/SalesOrderEditorView.vue', [
    '<span>计价口径</span>',
    'data-required-field="taxRate"',
    'v-model="termsTaxMode"',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function withSalesQuoteFacts(data, quote)',
    'function assertSalesQuoteConfirmable(data, quote)',
    "function normalizeSalesQuoteCurrency(data, value = 'CNY')",
    'currency: currencyMaster.code,',
    '请选择有效且启用的报价币种。',
    "const salesQuoteTaxRateOptions = ['13%', '9%', '6%', '3%', '1%', '0%', '免税'];",
    "function salesQuoteLinePricing(product, fallbackPriceInputMode = '含税', fallbackTaxRate = '13%')",
    'const priceInputMode = normalizeSalesQuoteTaxMode(product?.priceInputMode || fallbackPriceInputMode);',
    'function salesQuotePricingTotals(products)',
    "if (taxRates.length > 1) return '多税率';",
    'order.currency = normalizeSalesQuoteCurrency(data, order.currency || sourceQuote?.currency);',
    "order.taxMode = '含税';",
    'currency: normalizeSalesQuoteCurrency(data, input.currency || existing?.currency || sourceQuote?.currency)',
    'taxRate: salesQuoteTaxRateSummary(normalizedProducts, fallbackTaxRate)',
    'grossUnitPrice: decimalUnitPrice(grossUnitPriceNumber)',
    'taxAmount: money(taxAmountNumber)',
    'owner: ownerEmployee?.name || ownerName',
    'ownerEmployeeCode: ownerEmployee?.code || ownerEmployeeCode',
    "appendQuoteFlow(data, code, '确认报价', '报价单已确认，可转销售订单。', businessActorName(req, data));",
    'convertedOrderCode: quote.convertedOrderCode || relatedOrder?.code || \'\'',
    "if (['已转订单', '已作废'].includes(sales.quotes[index].status))",
    "if (wasConfirmed) quote.status = '草稿';",
    'amount: money(amountNumber),',
    'delete normalizedQuote.tradeType;',
    'delete normalizedQuote.incoterm;',
    'delete product.englishName;',
    'delete product.englishSpec;',
  ]);
  expectExcludes('server/index.mjs', [
    'function salesQuotePdfReadiness(data, quote)',
    'function normalizeSalesQuoteCurrency(data, tradeType, value)',
    'delete normalizedQuote.currency;',
    'delete quoteFacts.currency;',
    'const salesQuoteIncoterms',
    "if (quote.tradeType === '外贸')",
    'pdf-readiness',
  ]);
  expectExcludes('src/views/SalesView.vue', [
    'function quoteTradeSummary(row: SalesQuote)',
    'function quoteTradeType(row: SalesQuote)',
    "'贸易类型', '币种'",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 110. 销售报价生命周期、有效性与转单关系（2026-07-22）',
    '## 149. 销售报价候选、报价人和确认边界复查（2026-07-24）',
    '## 155. 外贸方案暂缓与报价单回归（2026-07-25）',
    '## 157. 报价单逐行税率与双单价联动（2026-07-25）',
    '## 158. 报价单草稿保存、币种与确认交互（2026-07-25）',
    '## 160. 销售订单逐行价税与商务条款收口（2026-07-25）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 81. 销售报价冻结、有效性与订单关联投影（2026-07-22）',
    '## 125. 报价人身份、销售物料候选与确认门禁合同（2026-07-24）',
    '## 129. 国际化主档、币种引用与通用联系方式合同（2026-07-25）',
    '## 131. 外贸暂缓后的报价与英文主档边界（2026-07-25）',
    '## 133. 报价单逐行税额与双单价联动合同（2026-07-25）',
    '## 134. 报价币种、草稿保存与确认命令合同（2026-07-25）',
    '## 136. 销售订单逐行价税、币种与下游消费合同（2026-07-25）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 23. 报价单保存草稿与确认提示补充（2026-07-25）',
    '## 25. 销售订单逐行价税补充（2026-07-25）',
  ]);
  expectIncludesAll('docs/erp-web-page-audit-ledger.md', [
    '## 已验收记录：报价币种、保存草稿与确认提示（2026-07-25）',
    '## 已验收记录：销售订单逐行价税与商务条款清理（2026-07-25）',
  ]);
});

run('sales order PDF is a dedicated external confirmation projection', () => {
  expectIncludesAll('src/router/index.ts', [
    "const SalesOrderPdfView = () => import('../views/SalesOrderPdfView.vue');",
    "path: '/sales/orders/:code/pdf'",
    "name: 'sales-order-pdf'",
    "title: '销售订单 PDF 预览'",
  ]);
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    'function previewOrderPdf()',
    "name: 'sales-order-pdf'",
    "window.open(previewPath, '_blank', 'noopener,noreferrer');",
    "orderDraft.value.ownerEmployeeCode = employee.code || option.code || '';",
    'v-model="orderDraft.ownerEmployeeCode"',
  ]);
  expectIncludesAll('src/views/SalesOrderPdfView.vue', [
    'MORE THAN PRINTING',
    '材启万象',
    '<h1>{{ documentName }}</h1>',
    '<h2>供需双方</h2>',
    '<strong class="party-label">{{ leftPartyFacts.label }}</strong>',
    '<strong class="party-label">{{ rightPartyFacts.label }}</strong>',
    '<dt>公司名称</dt>',
    '<dt>公司地址</dt>',
    "{{ leftPartyFacts.phone }}",
    "{{ rightPartyFacts.address }}",
    '<div class="letterhead-rule"></div>',
    '<div class="order-parties-rule"></div>',
    '<div v-if="page.showTotal" class="order-section-rule"></div>',
    '<div class="order-terms-rule"></div>',
    'finalProductCapacityForTerms(estimatedTermLines.value)',
    'function finalProductCapacityForTerms(termLines: number)',
    'function splitTermsPrelude(value: string)',
    'if (termLines <= 2) return 5;',
    'if (termLines <= 5) return 4;',
    'if (termLines <= 8) return 3;',
    'while (7 + Math.max(pageCount - 2, 0) * 9 + finalCapacity < products.length)',
    "{{ pageIndex === 0 ? '订单明细' : '订单明细（续）' }}",
    "{{ item.model || '—' }}",
    "{{ item.spec || '—' }}",
    'class="line-model"',
    'class="line-spec"',
    '.line-model {',
    '.line-spec {',
    '含税总计',
    "page.isTermsContinuation ? '补充条款（续）' : '补充条款'",
    '<dt>交付日期</dt>',
    '<dt>交付方式</dt>',
    '<dt>运费承担</dt>',
    '<dt>付款方式</dt>',
    '<h2>双方确认</h2>',
    '<strong>供方（签章）</strong>',
    '<strong>需方（签章）</strong>',
    'class="signature-date"',
    'class="term-continuation-title"',
    '.term-continuation-title {',
    'height: 20mm;',
    'class="order-total-label"',
    '.party-card + .party-card {',
    '.order-parties-rule {',
    'width: 23mm;',
    '打印 / 保存 PDF',
    'label: `${companyShortName.value} 中文${documentName.value}`',
    'class="order-preview-scroll"',
    '@scroll.passive="syncCurrentPreviewPage"',
    '@click="goToPreviewPage(currentPreviewPage - 1)"',
    '@click="goToPreviewPage(currentPreviewPage + 1)"',
    '.order-preview-scroll {',
    'overflow: auto;',
    '@page',
    'size: A4;',
  ]);
  expectExcludes('src/views/SalesOrderPdfView.vue', [
    'shipAddress',
    'shipContact',
    'shipPhone',
    'plannedShipDate',
    'logisticsMode',
    'internalRemark',
    'supplementaryRequirement',
    'internalNote',
    'sourceQuote',
    'documentStatus',
    'netAmount',
    'taxAmount',
    'taxRate',
    'supplierContactFacts.contactInfo',
    '订购双方',
    '供方（盖章）',
    '客户（盖章）',
    '授权代表',
    '确认日期',
    'filament-rule',
    'filament-spool',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function resolveSalesOrderSupplierPrintSnapshot(data, ownerIdentity = {}, existing = {})',
    'function resolveSalesOrderCustomerPrintSnapshot(data, customerIdentity = {}, existing = {})',
    'function hydrateSalesOrderPrintSnapshots(data)',
    'companyPrintSnapshot: resolveSalesQuoteCompanyPrintSnapshot(data, companyIdentity, existing)',
    'supplierPrintSnapshot: resolveSalesOrderSupplierPrintSnapshot(data, ownerIdentity, existing)',
    'customerPrintSnapshot: resolveSalesOrderCustomerPrintSnapshot(data, customerIdentity, existing)',
    'ownerEmployeeCode: ownerEmployee?.code || requestedOwnerEmployeeCode',
  ]);
  expectIncludesAll('scripts/smoke-sales.mjs', [
    'sales order PDF company snapshot was missing or trusted forged client values',
    'sales order PDF supplier contact snapshot was missing or trusted forged client values',
    'sales order PDF customer company snapshot was missing, confused with shipping data, or trusted forged client values',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 161. 销售订单正式 PDF 模板与打印快照（2026-07-25）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 137. 销售订单中文 PDF 对客投影与快照合同（2026-07-25）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 26. 销售订单正式 PDF 模板补充（2026-07-25）',
  ]);
  expectIncludesAll('docs/erp-web-page-audit-ledger.md', [
    '## 已验收记录：销售订单正式 PDF 模板（2026-07-25）',
  ]);
});

run('material purchase order PDF reuses the external order system with purchase facts', () => {
  expectIncludesAll('src/router/index.ts', [
    "path: '/purchase/orders/:code/pdf'",
    "name: 'purchase-order-pdf'",
    "title: '采购订单 PDF 预览'",
  ]);
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    'function previewPurchasePdf()',
    "name: 'purchase-order-pdf'",
    "window.open(previewPath, '_blank', 'noopener,noreferrer');",
    '<div><dt>{{ documentTitle }}单号</dt><dd>{{ orderDraft.code || \'—\' }}</dd></div>',
    '<div><dt>公司</dt><dd>{{ orderDraft.company || \'—\' }}</dd></div>',
    '<div><dt>供应商联系人</dt><dd>{{ orderDraft.contact || \'—\' }}</dd></div>',
    '<div><dt>联系方式</dt><dd>{{ orderDraft.contactPhone || \'—\' }}</dd></div>',
    '<div><dt>下单日期</dt><dd>{{ orderDraft.date || \'—\' }}</dd></div>',
    '<div><dt>采购员</dt><dd>{{ orderDraft.owner || \'—\' }}</dd></div>',
    'class="purchase-basic-source-fact"',
    'class="purchase-source-links"',
  ]);
  expectIncludesAll('src/views/SalesOrderPdfView.vue', [
    'const isPurchaseOrderPdf',
    'getPurchaseOrder',
    "const documentName = computed(() => (isPurchaseOrderPdf.value ? '采购订单' : '销售订单'));",
    "? { label: '供方', ...purchaseSupplierFacts.value }",
    "label: '需方',",
    'class="purchase-receiving-facts"',
    '<dt>收货地址</dt>',
    '<dt>收货联系人</dt>',
    '<strong>供方（签章）</strong>',
    '<strong>需方（签章）</strong>',
    'label: `${companyShortName.value} 中文${documentName.value}`',
  ]);
  expectIncludesAll('src/types/business.ts', [
    'buyerPrintSnapshot?: {',
    'supplierPrintSnapshot?: {',
    'ownerEmployeeCode?: string;',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function resolvePurchaseOrderBuyerPrintSnapshot(data, ownerIdentity = {}, existing = {})',
    'function resolvePurchaseOrderSupplierPrintSnapshot(data, supplierIdentity = {}, existing = {})',
    'function hydratePurchaseOrderPrintSnapshots(data)',
    'buyerPrintSnapshot: resolvePurchaseOrderBuyerPrintSnapshot(data, ownerIdentity, existing)',
    'supplierPrintSnapshot: resolvePurchaseOrderSupplierPrintSnapshot(data, supplierIdentity, existing)',
  ]);
  expectIncludesAll('scripts/smoke-purchase.mjs', [
    'purchase order PDF company snapshot was missing',
    'purchase order PDF buyer snapshot was missing',
    'purchase order PDF supplier snapshot was missing',
    'purchase order PDF supplier address snapshot was missing',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.purchase-detail-fact-grid .purchase-basic-source-fact {',
    'grid-column: span 2;',
  ]);
  expectExcludes('src/views/SalesOrderPdfView.vue', [
    '<dt>预计到货</dt>',
    "isPurchaseOrderPdf ? '需方（签章）' : '供方（签章）'",
    "isPurchaseOrderPdf ? '供方（签章）' : '需方（签章）'",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 174. 物料采购订单正式 PDF 与详情基本信息（2026-07-27）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 154. 物料采购订单中文 PDF 与打印快照合同（2026-07-27）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 40. 物料采购订单 PDF 与详情字段补齐（2026-07-27）',
  ]);
  expectIncludesAll('docs/erp-web-purchase-module-design.md', [
    '采购订单可保留对外 PDF',
  ]);
});

run('currency master, material English facts, and generic business contacts share one source of truth', () => {
  expectIncludesAll('shared/system-menu-defaults.json', [
    '"name": "币种", "path": "/master-data/currencies"',
  ]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    "title: '币种'",
    "listPath: '/master-data/currencies'",
    "label: '币种代码'",
    "label: '金额小数位'",
    "{ key: 'englishName', label: '英文名'",
  ]);
  expectIncludesAll('src/views/MasterMaterialEditorView.vue', [
    '<span>英文名称</span>',
    '<span>英文型号</span>',
    '<span>英文规格</span>',
    '记录物料英文名称',
    '记录物料英文型号',
    '记录物料英文规格',
    'class="master-field-notes"',
  ]);
  expectOrdered('src/views/MasterMaterialEditorView.vue', [
    '<span>编码</span>',
    '<span>分类</span>',
    '<span>名称</span>',
    '<span>型号</span>',
    '<span>规格</span>',
    '<span>基础单位</span>',
    '<span>英文名称</span>',
    '<span>英文型号</span>',
    '<span>英文规格</span>',
    '<span>使用状态</span>',
  ], 'material basic field order');
  for (const file of [
    'src/views/MasterMaterialEditorView.vue',
    'src/views/MasterSupplierEditorView.vue',
    'src/views/MasterWarehouseEditorView.vue',
  ]) {
    expectIncludesAll(file, ['class="master-field-notes"']);
  }
  expectIncludesAll('src/styles/main.css', [
    '.master-field-notes {',
    'align-items: start;',
  ]);
  expectIncludesAll('src/data/masterData.ts', [
    'englishModel?: string;',
  ]);
  expectIncludesAll('server/index.mjs', [
    "const retiredStarterCurrencies = new Set(['USD', 'EUR', 'GBP', 'JPY']);",
    'englishModel: normalizedMasterText(base.englishModel)',
    'delete product.englishName;',
    'delete product.englishModel;',
    'delete product.englishSpec;',
  ]);
  expectExcludes('src/views/MasterSimpleEditorView.vue', [
    "{ key: 'englishName', label: '英文名称', placeholder: '例如 Chinese Yuan、US Dollar'",
  ]);
  expectIncludesAll('docs/erp-web-master-data-module-design.md', [
    '当前只作为可选主档信息保存，不被销售单据或 PDF 引用',
    '当前只作为可选主档资料保存，不被销售单据或 PDF 引用',
    '| 英文型号 | 否 | 可选英文主档资料，可搜索和导出，当前不进入业务快照 |',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 156. 基础资料字段顺序、状态说明与空值展示（2026-07-25）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 132. 物料英文型号、状态说明与主档空值投影（2026-07-25）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 21. 基础资料字段排列与空值展示补充（2026-07-25）',
  ]);
  expectIncludesAll('docs/erp-web-page-audit-ledger.md', [
    '## 已验收记录：基础资料字段顺序、状态说明与空值符号（2026-07-25）',
  ]);
  expectExcludes('docs/erp-web-master-data-module-design.md', [
    '预留给后续销售英文打印格式',
    '销售报价单和销售订单需要英文打印格式时再启用',
    '仅为未来销售报价单和销售订单英文打印预留',
    '为未来销售英文打印预留',
  ]);
  for (const file of [
    'src/views/MasterDataView.vue',
    'src/views/MasterMaterialEditorView.vue',
    'src/views/MasterCustomerEditorView.vue',
    'src/views/MasterSupplierEditorView.vue',
    'src/views/MasterWarehouseEditorView.vue',
    'src/views/MasterSimpleEditorView.vue',
  ]) {
    expectExcludes(file, ['未维护']);
  }
  expectIncludesAll('package.json', ['"smoke:currencies": "node scripts/smoke-currencies.mjs"']);
});

run('sales order keeps lifecycle and downstream progress separate', () => {
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    'const canSubmitOrder = computed(() => canConfirmOrder.value && missingRequiredFields.value.length === 0);',
    ':disabled="isSaving || isOrderActionPending || isLoading || !canSubmitOrder"',
    "owner: session.user.name || '待指定',",
    'function hasValidOrderProductLines(products: SalesOrderProduct[])',
    'new Set(keys).size === keys.length',
    'kind="销售"',
    '<FileDown :size="15" />\n              PDF',
    '@click="previewOrderPdf"',
    ':max="orderDraft.delivery || undefined"',
    'orderDraft.value.shipAddress',
    'await fillCustomerFromReference();',
    'const salesDeliveryRows = ref<SalesDeliveryRecord[]>([]);',
    'const effectiveDeliveryRecords = computed(() => (',
    'const reservedCoverageQty = Math.min(remainingQty, reservedQty);',
    'const productionCoverageQty = Math.min(',
    'const uncoveredQty = Math.max(0, remainingQty - coveredQty);',
  ]);
  expectExcludes('src/views/SalesOrderEditorView.vue', [
    'kind="销售物料"',
    '@click="printOrder"',
    '<Printer :size="15" />',
    "owner: '李明',",
    'function fulfillmentLinkPath(link:',
    '生产数量链',
    'listFinanceRecords',
    "from: '/finance/",
  ]);
  expectIncludesAll('src/views/SalesView.vue', [
    'const summary = row.commercialSummary;',
    '<span>客户/销售负责人</span>',
    '<small>销售负责人 · {{ row.owner }}</small>',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function assertSalesOrderConfirmable(data, order)',
    "throw requestError(409, `销售订单 ${order.code} 的计划发货日期必须介于下单日期和承诺交付日期之间。`);",
    "appendFlow(data, order.code, '保存草稿', '新建销售订单草稿。', actor);",
    'assertSalesOrderConfirmable(data, data.sales.orders[index]);',
    '.filter((row) => !salesQuoteIsExpired(row))',
    "releaseQuoteConversion(data, existingOrder.sourceQuote, code, actor, '变更来源报价');",
    'commercialSummary: {',
    'eventIds: commercial.events.map((event) => event.id),',
    'commercialFollowUps: commercialFollowUpEvents',
    'fulfillmentLinks: existingProduct?.fulfillmentLinks || [],',
    "documentStatus: existing?.documentStatus || '草稿',",
    'amount: money(amountNumber),',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 111. 销售订单生命周期与履约分轨（2026-07-22）',
    '## 150. 销售订单候选、来源关系与确认边界复查（2026-07-24）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 82. 销售订单冻结边界与财务投影（2026-07-22）',
    '## 126. 销售订单责任、来源与确认合同（2026-07-24）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 16. 销售订单页复查补充（2026-07-24）',
  ]);
  expectIncludesAll('docs/erp-web-page-audit-ledger.md', [
    '简洁双 TAB 完成（2026-07-25）',
  ]);
});

run('sales order owns its follow-up view without exposing a separate sales menu document', () => {
  expectIncludesAll('src/router/index.ts', [
    "path: 'sales/orders/:code/delivery',",
    "name: 'sales-order-delivery',",
    "title: '销售订单跟进',",
  ]);
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    "const isDeliveryView = computed(() => mode.value === 'sales-order-delivery');",
    'listSalesDeliveryRecords,',
    'class="order-detail-tabs"',
    '订单内容',
    '订单跟进',
    'background: #171916;',
    'color: #fff;',
    '<h2>内部发货要求</h2>',
    '<h2>出库任务与记录</h2>',
    "<div><dt>内部发运方式</dt><dd>{{ orderDraft.logisticsMode || '—' }}</dd></div>",
    "<div><dt>收货人</dt><dd>{{ orderDraft.shipContact || '—' }}</dd></div>",
    "<div><dt>收货联系方式</dt><dd>{{ orderDraft.shipPhone || '—' }}</dd></div>",
    'class="order-address-fact"',
    '<p class="material-note-copy">{{ orderDraft.supplementaryRequirement }}</p>',
    '<h2>订单备注</h2>',
    'v-model="orderDraft.internalNote"',
    "{ label: '发运进度', value: tracking?.status || (orderDocumentStatus.value === '草稿' ? '订单尚未确认' : '等待处理') }",
    'title="订单状态"',
    ':primary-status="orderDocumentStatus"',
    'aria-label="销售订单单据状态"',
    "status === '已发完'",
    ':items="orderProgressRows"',
  ]);
  expectExcludes('src/views/SalesOrderEditorView.vue', [
    ':items="[]"',
    '<h2>收货与发运</h2>',
    '<b>{{ nextStepGuidance.action }}</b>',
    '订单确认后的发运依据，仓库读取后执行。',
    '仓库完成出库后自动显示，销售只读查看。',
    '<p>{{ deliveryCapabilitySummary }}</p>',
    'orderDraft.logisticsMode || orderDraft.deliveryMethod',
    'orderDraft.shipContact || orderDraft.contact',
    'orderDraft.shipPhone || orderDraft.contactPhone',
    'salesDisplayText(orderDraft.internalRemark)',
    'class="order-tab-icon"',
    'class="order-tab-copy"',
    'class="order-tab-state"',
    '<Activity :size="18" />',
    '基本信息、物料与条款',
    '备货、出库与结算进度',
    'listSalesIssues',
    'listFinanceRecords',
    "from: '/finance/",
    'issue.warehouse',
    'issue.owner',
    "{ label: '发货仓库'",
    '<div><dt>单据状态</dt>',
    'class="order-source-quote-fact"',
  ]);
  expectIncludesAll('src/services/api.ts', [
    'export async function listSalesDeliveryRecords',
    '/sales/delivery-records',
  ]);
  expectIncludesAll('src/types/business.ts', [
    'export type SalesDeliveryRecord = {',
  ]);
  expectIncludesAll('server/index.mjs', [
    "shipContact: input.shipContact ?? existing?.shipContact ?? '',",
    "shipPhone: input.shipPhone ?? existing?.shipPhone ?? '',",
    'contact: order.shipContact,',
    'contactPhone: order.shipPhone,',
    'deliveryMethod: order.logisticsMode,',
    "parts[1] === 'sales' && parts[2] === 'delivery-records'",
  ]);
  expectExcludes('server/index.mjs', [
    "shipContact: input.shipContact || input.contact || '',",
    "shipPhone: input.shipPhone || input.contactPhone || '',",
    'contact: order.shipContact || order.contact,',
    'contactPhone: order.shipPhone || order.contactPhone,',
  ]);
  expectIncludesAll('src/views/SalesView.vue', [
    "status: '跟进状态'",
    'function orderFollowUpFilterValues(row: SalesOrder)',
    '`提醒 · ${fulfillment.attention}`',
    '`单据 · ${orderDocumentStatus(row)}`',
    '`生产 · ${fulfillment.production}`',
    '`交付 · ${orderFulfillmentSnapshot(row).delivery}`',
    '`开票 · ${fulfillment.invoice}`',
    '`收款 · ${fulfillment.payment}`',
    'class="order-card-content-link"',
    'class="order-card-follow-up-link"',
    '<strong>订单跟进</strong>',
    'grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));',
    ':to="`/sales/orders/${encodeURIComponent(row.code)}/delivery`"',
  ]);
  expectExcludes('shared/system-menu-defaults.json', [
    '"code": "MENU-SALES-OUTBOUND"',
    '"name": "交付追踪", "path": "/sales/outbound-requests"',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 151. 销售订单内容与订单跟进归属调整（2026-07-24）',
    '### 151.4 二次整页复查收口',
    '### 151.5 订单跟进字段同源复查（2026-07-25）',
    '### 151.6 订单双视角导航（2026-07-25）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 127. 销售订单跟进投影与内部交接合同（2026-07-24）',
    '`SalesOrderDeliveryProjection.nextAttention`',
  ]);
  const orderInfoBlock = blockAfter(
    'src/views/SalesOrderEditorView.vue',
    '<dl v-if="isDetail" class="material-fact-grid quote-detail-fact-grid order-detail-fact-grid">',
    '</dl>',
    4000,
  );
  let orderInfoCursor = -1;
  for (const label of ['销售订单号', '下单日期', '来源报价', '公司', '客户', '联系人', '联系方式', '销售负责人', '优先级']) {
    const next = orderInfoBlock.indexOf(`<dt>${label}</dt>`, orderInfoCursor + 1);
    assert(next > orderInfoCursor, `sales order information should keep the semantic field order; missing or misplaced ${label}`);
    orderInfoCursor = next;
  }
});

run('sales outbound tracking is order-derived and keeps shipment facts frozen', () => {
  expectIncludesAll('src/router/index.ts', [
    "path: 'sales/outbound-requests/new',",
    "redirect: '/sales/outbound-requests',",
  ]);
  expectIncludesAll('src/views/SalesOutboundRequestView.vue', [
    "const isTerminalRequest = computed(() => ['已出库', '已发完', '已签收', '已完成', '已作废'].includes(requestStatus.value));",
    '<dl class="material-fact-grid quote-detail-fact-grid outbound-detail-fact-grid">',
    '<span>本单现货 <b>{{ row.committableQty }}</b></span>',
    '<span>补充去向 <b>{{ row.plannedSupplyQty }}</b></span>',
    '<span>未分配缺口 <b>{{ row.shortageAfterPlanQty }}</b></span>',
    'function deliveryRecordWarehouseText(record: SalesDeliveryRecord)',
    '<span>出库仓库 {{ deliveryRecordWarehouseText(record) }}</span>',
    '<span>补充要求（来自销售订单）</span>',
    "status: shipped <= 0 ? '待发货' : remaining <= 0 ? '已发完' : '部分出库'",
  ]);
  expectExcludes('src/views/SalesOutboundRequestView.vue', [
    '添加销售物料',
    '<QuantityWithUnitInput',
    '当前状态</dt>',
    '<th>发货仓库</th>',
    'title="选择发货仓库"',
    'v-model="requestDraft.supplementaryRequirement"',
  ]);
  expectIncludesAll('src/views/SalesView.vue', [
    "if (status === '部分发货') return '部分出库';",
    "if (status === '部分出库') return '跟进剩余出库';",
  ]);
  expectIncludesAll('server/index.mjs', [
    'const products = existing?.products?.length',
    'const nextStatus = fulfillment.isComplete',
    ": '待发货';",
    "const nextStatus = fulfillment.totalDelivered > 0 ? '部分出库' : '待发货';",
    '// 交付追踪不预选单一发货仓；实际仓库由仓库拣货分配形成。',
    '// 任务头不限制单一仓库；登记拣货时按实际库存逐行选择仓库、库位和批次。',
    'actualWarehouses.map((item) => item.name).filter(Boolean).join(\'、\')',
    "sourceOrder: sourceOrderCode,",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 112. 交付追踪的订单派生与分批出库边界（2026-07-22）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 83. 交付追踪派生快照与可发判断投影（2026-07-22）',
  ]);
});

run('sales price reference reads confirmed order lines with line-level gross and net price facts', () => {
  expectIncludesAll('src/views/SalesView.vue', [
    'const lifecycle = order.documentStatus || order.status;',
    "if (!['已确认', '已关闭'].includes(lifecycle))",
    'const grossUnitPrice = product.grossUnitPrice || product.unitPrice;',
    "product.priceInputMode === '不含税' ? product.unitPrice : ''",
    "taxRate: product.taxRate || '—'",
    '<span>含税单价</span>',
    '<span>订单数量</span>',
    '<span>来源订单/日期</span>',
    'class="party-cell price-customer-cell"',
    'class="reference-quantity-cell"',
    "['销售物料', '物料编码', '物料型号', '物料规格', '客户', '含税单价', '未税单价', '税率', '基础单位', '订单数量', '销售订单', '订单日期']",
    'row.grossUnitPrice',
    'row.netUnitPrice',
    'row.taxRate',
  ]);
  expectExcludes('src/views/SalesView.vue', [
    'latestPrice',
    'row.priceBasis',
    '<small>{{ row.contact }} · {{ row.owner }}</small>',
    '<span>{{ row.customer }} · {{ row.contact }}</span>',
    'return uniqueValues(salesPriceRows.value.map((row) => row.owner));',
    '<span>成交数量</span>',
    '<span>成交日期</span>',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.price-basis-cell {',
    '.price-basis-cell > small {',
    '.price-customer-cell {',
    '.reference-quantity-cell,',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 114. 销售价格记录的订单行来源与显示口径（2026-07-22）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 85. 销售订单行价格参考投影（2026-07-22）',
  ]);
});

run('sales finished-goods inventory preserves warehouse availability facts', () => {
  expectIncludesAll('src/views/SalesView.vue', [
    'function salesInventoryRowsFromProjection(rows: SalesInventoryProjectionRow[]): SalesInventoryRow[] {',
    'const expectedAvailable = totalAvailable + inTransit;',
    "? '有可用库存'",
    "? '等待在途'",
    ": '无可用库存'",
    '<span>当前可用</span>',
    '<span>在途补充</span>',
    '<span>库存状态</span>',
    'row.currentAvailable',
    'hasInTransit: inTransit > 0',
    "row.hasInTransit ? `在途 ${row.inTransit}` : '暂无在途'",
    '<small v-if="row.hasInTransit">预计可用 {{ row.expectedAvailable }}</small>',
    '<span v-else>暂无在途补充</span>',
    "listSalesInventory",
  ]);
  expectExcludes('src/views/SalesView.vue', [
    'const sourceRows = finishedGoods.length ? finishedGoods : rows;',
    'const committable = Math.max(0, totalAvailable - pendingOutbound);',
    '/warehouse/inventory?view=item&keyword=',
    '查看仓库库存',
    '库存分布',
    '合格 / 占用',
    'expandedInventoryKey',
    'toggleInventoryDetail',
    '库存明细',
    '<span>后续补充</span>',
    '<span class="inventory-paired-value"><strong>在途 {{ row.inTransit }}</strong><small>预计可用 {{ row.expectedAvailable }}</small></span>',
    '<span>现货可承诺</span>',
    '<span>补充后可承诺</span>',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function salesInventoryProjection(data) {',
    'const groups = new Map();',
    "parts[1] === 'sales' && parts[2] === 'inventory'",
    "identity.includes('成品') || identity.includes('finished')",
  ]);
  expectIncludesAll('server/index.mjs', [
    'const candidates = warehouse.inventory.filter((candidate) => (',
    'candidate.reservationSources = (candidate.reservationSources || []).filter((source) => !sameSource(source));',
    'row.reservedNumber = (Array.isArray(row.reservationSources) ? row.reservationSources : [])',
  ]);
  expectIncludesAll('scripts/smoke-sales-inventory.mjs', [
    'Sales projection smoke passed (inventory summary, delivery boundary and source-order filtering).',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.inventory-paired-value.is-empty strong {',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 115. 销售成品库存速查的可用事实与范围（2026-07-22）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 86. 销售成品库存可用投影（2026-07-22）',
  ]);
});

run('purchase requisitions separate lifecycle, conversion, source, and purchasable-material facts', () => {
  expectIncludesAll('src/types/business.ts', [
    'documentStatus?: string;',
    "sourceType?: '手工申请' | '生产任务缺口' | '临时备料缺口' | '库存补货' | string;",
    'sourceMaterialRequest?: string;',
    'sourceProductionTask?: string;',
    'sourceReplenishmentCode?: string;',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function purchaseRequisitionDocumentStatus(requisition, conversionFacts) {',
    'documentStatus: purchaseRequisitionDocumentStatus(requisition, conversionFacts),',
    "requisition.status === '草稿'",
    "? '提交采购受理'",
    'const demandLines = lines.filter((line) => line.requestedQty > 0);',
    'if (!isPurchasableMaterial(material)) throw requestError(400, `采购需求物料',
    'if (requisition.date && requisition.expectedDate && requisition.expectedDate < requisition.date)',
    'function hydrateGeneratedPurchaseRequisitionSources(data) {',
    "sourceType: request.sourceTaskCode ? '生产任务缺口' : '临时备料缺口'",
    "sourceType: '库存补货'",
  ]);
  expectIncludesAll('src/views/PurchaseView.vue', [
    'function requisitionDocumentStatus(row: PurchaseRequisition) {',
    "control?: 'select' | 'search';",
    'function matchesKeywordFilter(values: Array<string | undefined>, filter: string) {',
    "fields.push({ key: 'owner', label: labels.owner, options: [], control: 'search' });",
    '<strong>单据状态</strong>',
    '<small>转采购 · 待办</small>',
    '<b>转采购</b>',
    '<b>待办</b>',
    'purchaseRequisitionSourceSummary(row)',
    "requisitions: '搜索需求单、需求来源、部门、提出人、物料'",
    "['需求单号', '采购类型', '需求来源'",
  ]);
  expectIncludesAll('src/views/PurchaseRequisitionEditorView.vue', [
    'const requisitionDocumentStatus = computed(() => {',
    'const showCompleteRequisitionInDetail = computed(() => (',
    'const showSubmitRequisitionInDetail = computed(() => (',
    "value: requisitionStatus.value === '草稿' ? '待提交' : conversionFacts.value?.status || '待转单',",
    'missingRequiredFields.value.length ? \'完善\' : \'提交\'',
    'kind="采购"',
    'data-required-field="date"',
    '<dt>需求来源</dt><dd>{{ requisitionSourceKind }}</dd>',
    '<span>来源追溯</span>',
    '{{ source.label }} · {{ source.code }}',
    '<h2>转采购明细</h2>',
    "'采购需求草稿已保存'",
    "'保存中' : '保存草稿'",
    'class="form-field field-span-2"',
    'aria-label="采购需求单据状态与转采购进度"',
    'v-if="isDetail && conversionFacts && requisitionStatus !== \'草稿\'"',
  ]);
  expectExcludes('src/views/PurchaseRequisitionEditorView.vue', [
    '<dt>申请单号</dt>',
    '<h2>转采购进度</h2>',
    '@click="printRequisition"',
    '打印当前采购申请',
    '通过浏览器打印保存为 PDF',
  ]);
  expectIncludesAll('src/utils/purchaseRequisitionSource.ts', [
    "return value(requisition.sourceProductionTask) ? '生产任务缺口' : '临时备料缺口';",
    "if (value(requisition.sourceReplenishmentCode)) return '库存补货';",
    'path: `/production/tasks/${encodeURIComponent(productionTask)}`',
    'path: `/production/material-requests/${encodeURIComponent(materialRequest)}`',
    'path: `/warehouse/inventory-alerts?tab=replenishment&keyword=${encodeURIComponent(replenishmentCode)}`',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    'row.code,',
    "['补货关系号', '预警状态', '物料编码'",
  ]);
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    'kind="采购"',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.purchase-detail-fact-grid.purchase-asset-fact-grid {',
    '.quote-fields.purchase-asset-fields {',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 116. 采购申请生命周期、转采购承接与来源边界（2026-07-22）',
    '## 301. P1 采购需求来源与轻量计划追溯（2026-08-04）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 87. 采购申请生命周期与承接投影（2026-07-22）',
    '## 146. 采购申请草稿与查询表现合同（2026-07-26）',
    '## 275. 采购需求来源与轻量计划追溯合同（2026-08-04）',
  ]);
});

run('material purchase orders preserve source demand, downstream locks, payable totals, and close gates', () => {
  expectIncludesAll('src/components/ReferencePicker.vue', [
    'company?: string;',
    'const company = props.company;',
  ]);
  expectIncludesAll('src/services/api.ts', [
    'export async function closePurchaseOrder(code: string) {',
    '/purchase/orders/${encodeURIComponent(code)}/close',
  ]);
  expectIncludesAll('server/index.mjs', [
    'const orderAmount = parseMoney(order.amount);',
    'payableAmount,',
    "if (!String(order.date || '').trim()) missing.push('下单日期');",
    "if (!String(order.receivingPhone || '').trim()) missing.push('收货联系方式');",
    '采购单预计到货日期不能早于下单日期。',
    '采购内容已冻结。',
    'function assertPurchaseOrderClosable(data, order) {',
    'function matchingPurchaseRequisitionLine(requisition, orderLine) {',
    'function hydratePurchaseOrderLineSources(data) {',
    'function purchaseOrderLineSourceAllocations(orderLine) {',
    'other.requisitionCode === allocation.requisitionCode',
    'normalizedProducts.flatMap((line) => (',
    'line.sourceAllocations.map((allocation) => allocation.requisitionCode)',
    '个来源必须同时包含采购需求和来源明细',
    '来源采购需求 ${requisitionCode} 不存在',
    "parts[4] === 'close'",
    "appendPurchaseFlow(data, code, '关闭采购订单'",
    "const company = String(url.searchParams.get('company') || '').trim();",
    'row.allowPurchaseStaging === true',
  ]);
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    "import { useSessionStore } from '../stores/session';",
    "owner: session.user.name || '陈晨'",
    'const hasPurchaseOrderDownstreamFacts = computed(() => (',
    'const showCompleteOrderInDetail = computed(() => (',
    'const canCloseOrder = computed(() => (',
    "missingRequiredFields.value.length ? '完善' : confirmActionLabel.value",
    '@click="closeOrderDraft"',
    'data-required-field="date"',
    'data-required-field="receivingPhone"',
    ':company="orderDraft.company"',
    'kind="采购收货"',
    'class="purchase-line-source-link"',
    'class="purchase-order-product-picker"',
    'class="purchase-order-line-source"',
    'class="purchase-order-line-source is-direct"',
    'id="purchase-related-documents"',
    '订单数量 {{ item.quantity }}',
    '<dt>{{ documentTitle }}单号</dt>',
    'class="purchase-source-links"',
  ]);
  expectExcludes('src/views/PurchaseOrderEditorView.vue', [
    '<dt>来源采购申请</dt><dd>{{ sourceRequisitionDisplay || \'无\' }}</dd>',
    '成交数量 {{ item.quantity }}',
    'orderDraft.value.receivingAddress = supplier.address',
    '<div v-if="!isDetail && (orderDraft.sourceRequisitions?.length || 0) > 0" class="source-allocation-note">',
  ]);
  expectIncludesAll('scripts/smoke-purchase.mjs', [
    "relatedTypes.has(type), `closed order is missing related document: ${type}`",
    "taxExclusiveDraft.payload.order.amount === '￥113.00'",
    'purchase order with downstream documents was still editable',
    'partially fulfilled purchase order was closed before all tracks completed',
    'manual purchase line polluted requisition conversion quantities',
    'purchase order accepted a nonexistent requisition line identity',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 117. 物料采购承接、履约分轨与关闭边界（2026-07-22）',
    '## 302. P1 采购申请到订单的逐行承接与下游追溯（2026-08-04）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 88. 物料采购冻结、应付金额与履约关闭投影（2026-07-22）',
    '## 276. 采购申请逐行承接与采购入库来源合同（2026-08-04）',
  ]);
});

run('purchase after-sales requires explicit source, frozen affected facts, and evidence-gated closure', () => {
  expectIncludesAll('src/views/AfterSalesDocumentView.vue', [
    'function blankAfterSalesRecord(afterSalesKind: AfterSalesKind)',
    'function currentAfterSalesOwner(afterSalesKind: AfterSalesKind)',
    "kind === 'sales' ? 'sales-after-sales-owner' : 'purchase-after-sales-owner'",
    'const missingRequiredActionLabel = computed(() => (',
    'v-if="advanceBlockReason && canWriteAfterSales && !hasIncompleteExecutionWork"',
    'class="form-field field-span-2 is-required-field" data-after-sales-field="sourceOrder"',
    '先选择来源{{ sourceTitle }}',
    '记录供应商交付、到货或质检中已确认的问题',
    "['来料质量', '数量差异', '错料/漏发', '包装运输', '交付延期', '退换货', '其他']",
    'hasIncompleteExecutionTasks',
  ]);
  expectExcludes('src/views/AfterSalesDocumentView.vue', [
    'purchaseSourceOrders.value.find((row) => row.code === sourceCode) || purchaseSourceOrders.value[0]',
    '<div><dt>售后单号</dt><dd>{{ record.code }}</dd></div>',
    '请先通过“更多 → 变更”填写处理结果。',
  ]);
  expectIncludesAll('shared/permission-matrix.json', [
    '["confirm", "submit", "void", "status", "advance"]',
  ]);
  expectIncludesAll('scripts/smoke-purchase.mjs', [
    'purchase after-sales advanced without a processing result',
    'purchase after-sales source order changed after registration',
    'distinction between physical execution tasks and purchase-owned commercial results',
    'purchase after-sales allowed procurement to complete another role task',
    'retired purchase order incorrectly entered material purchase after-sales',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 119. 采购售后来源、处置证据与关闭边界（2026-07-22）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 90. 采购售后冻结事实与处置门禁（2026-07-22）',
  ]);
});

run('purchase price reference reads confirmed material-order lines with unit and tax basis', () => {
  expectIncludesAll('src/views/PurchaseView.vue', [
    "if (!['已确认', '已关闭'].includes(purchaseOrderStatusLabel(order.status)))",
    'key: `${order.code}-${product.lineId || product.materialCode || index}`',
    "product: product.name || '—'",
    "materialCode: product.materialCode || ''",
    "model: product.model || ''",
    "spec: product.spec || ''",
    'grossUnitPrice: formatPriceValue(product.grossUnitPrice || product.unitPrice)',
    'const netUnitPrice = product.netUnitPrice',
    "(product.priceInputMode === '不含税' ? product.unitPrice : '')",
    "taxRate: product.taxRate || order.taxRate || '—'",
    'orderDate: order.date',
    "prices: {\n      party: '供应商',\n      date: '下单日期',",
    'class="data-table reference-table price-history-table purchase-price-table"',
    '<span>采购物料</span>',
    '<span>供应商</span>',
    '<span>订单数量</span>',
    '<span>来源采购单/日期</span>',
    'class="product-model-spec"',
    'class="product-material-code"',
    'class="party-cell price-customer-cell"',
    'class="amount-cell price-basis-cell"',
    '未税 {{ row.netUnitPrice }} · 税率 {{ row.taxRate }}',
    "['采购物料', '物料编码', '物料型号', '物料规格', '供应商', '含税采购单价', '未税采购单价', '税率', '基础单位', '订单数量', '来源采购单', '下单日期']",
    'row.product',
    'row.materialCode',
    'row.model',
    'row.spec',
    'row.grossUnitPrice',
    'row.netUnitPrice',
    'row.taxRate',
    'row.orderDate',
    '查看来源采购单',
  ]);
  expectExcludes('src/views/PurchaseView.vue', [
    '<span>更新时间</span>',
    'row.updatedAt',
    'reference-card-price',
    '来源采购 {{ row.sourceDoc }}',
    '成交日期',
    "['物料', '供应商', '含税采购单价', '未税采购单价', '税率', '订单数量', '来源采购单', '采购员', '下单日期']",
    '采购订单确认成交后会生成价格记录。',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.price-basis-cell {',
    '.price-history-table .table-row {',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 120. 采购价格记录的订单行来源与价格口径（2026-07-22）',
    '## 176. 采购价格记录横向统一（2026-07-27）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 91. 采购订单行价格参考投影（2026-07-22）',
    '## 156. 采购价格记录与销售价格记录同构合同（2026-07-27）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 42. 采购价格记录横向统一（2026-07-27）',
  ]);
});

run('purchase receipts use remaining source lines, frozen quality facts, and safe post-arrival supplements', () => {
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    "owner: '待分配'",
    'sourceOrderReceiving?.expectedDate',
    'products: [],',
    "receiptRequiredFieldClass('实际到货日期')",
    '预计到货日期',
    '原订单预计到货',
    "receiptActionDialogMode === 'arrival'",
    "item.incomingQualityControl || (item.qcRequired ? '需质检' : '免检')",
    ':class="{ \'is-disabled\': isReadOnly }"',
    'plannedQty',
  ]);
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', [
    "import { useSessionStore } from '../stores/session';",
    '<span>收货单号</span>',
    'owner: \'王倩\'',
    '<option :value="false">免检/直接放行</option>',
    'title="选择到货物料"',
    '先选择来源采购订单',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    'date: row.date,',
    'cardValue: itemQuantity,',
  ]);
  expectIncludesAll('server/index.mjs', [
    "kind !== 'warehouse-receipt'",
    "row.purchaseType === '物料采购'",
    "row.status === '已确认'",
    'const remainingQty = Math.max(0, parseQty(product.qty) - allocatedQty);',
    'attachments: Array.isArray(input.attachments) ? input.attachments : existing?.attachments || [],',
    "const frozenFields = [",
    "'补充收货记录'",
  ]);
  expectIncludesAll('scripts/smoke-warehouse.mjs', [
    'pending receipt task did not project the remaining PETG plan quantity',
    'pending receipt task fabricated a PETG actual arrival quantity',
    'arrived purchase receipt allowed its frozen quantity to change',
    'pending purchase receipt task did not persist its attachment',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 121. 采购收货的剩余承接、质量分流与正式入库边界（2026-07-22）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 92. 采购收货来源承接与库存阶段事实（2026-07-22）',
  ]);
});

run('purchase over-receipt tolerance and procurement-owned remainder closure stay explicit', () => {
  expectIncludesAll('server/index.mjs', [
    'const defaultPurchaseOverReceiptTolerancePercent = 5;',
    'function purchaseOrderLineReceiptLimits(order = {}, orderLine = {}, orderLineIndex = 0)',
    'function closePurchaseOrderReceiptRemainder(data, order, body = {}, actor = \'采购\')',
    "parts[4] === 'close-remainder'",
    '采购已关闭待收余量',
    '仓库已在待收货任务',
  ]);
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    '<dt>可收上限</dt>',
    'fact.receivableRemaining',
    'sourceFact?.remaining || sourceFact?.receivableRemaining',
  ]);
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', ['<dt>超收容差</dt>', '<dt>本次最多</dt>']);
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    'PurchaseReceiptRemainderDialog',
    '关闭待收余量',
    '容差内超收',
    'line.receiptTargetQty',
  ]);
  expectIncludesAll('src/components/PurchaseReceiptRemainderDialog.vue', [
    '关闭后不会再生成对应仓库待收货任务。',
    '本操作不等于关闭整张采购订单。',
    '确认关闭余量',
  ]);
  expectIncludesAll('scripts/smoke-purchase.mjs', [
    'receipt within the frozen 5% over-receipt tolerance was blocked',
    'purchase receipt remainder could not be closed',
    'closing purchase receipt remainder did not cancel the untouched warehouse receiving task',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 187. 采购超收、短收关闭与售后财务边界收口（2026-07-28）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 166. 采购收货容差、履约余量关闭与售后任务收口合同（2026-07-28）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 55. 销售采购阶段问题收口（2026-07-28）',
  ]);
  expectFile('docs/erp-web-sales-purchase-closure-ledger.md');
});

run('sales short-delivery closure mirrors purchase remainder governance without falsifying full outbound', () => {
  expectIncludesAll('server/index.mjs', [
    "function closeSalesOrderDeliveryRemainder(data, order, body = {}, actor = '销售')",
    'function cancelPendingSalesIssueTasks(',
    'function releaseSalesOrderDeliveryReservations(',
    "parts[4] === 'close-remainder'",
    "tracking.status = shipmentTrackingFulfillment(data, tracking).isComplete ? '按实发完成' : '部分出库';",
    '尚未发生任何实际出库；如整单不再履行，请作废销售订单',
  ]);
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    'closeSalesOrderDeliveryRemainder',
    'canCloseDeliveryRemainder',
    '关闭待发余量',
    'business="sales"',
    '<dt>订单数量</dt>',
    '<dt>累计出库</dt>',
    '<dt>关闭余量</dt>',
    '<dt>待发数量</dt>',
  ]);
  expectIncludesAll('src/components/PurchaseReceiptRemainderDialog.vue', [
    "business?: 'purchase' | 'sales'",
    '由销售决定客户剩余数量不再交付',
    '未开始的出库任务会取消，剩余预留会释放。',
  ]);
  expectIncludesAll('scripts/smoke-sales.mjs', [
    'closing sales remainder did not cancel the untouched picking task',
    'shipment tracking did not distinguish short delivery from full outbound',
    'sales order without actual outbound was allowed to close delivery remainder',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 242. 销售短交付关闭与采购余量治理统一（2026-08-01）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 216. 销售待发余量关闭与调整后交付目标合同（2026-08-01）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 110. 销售短交付关闭与采购统一（2026-08-01）',
  ]);
});

run('sales issues use remaining dispatch lines, staged picking review, and reservation evidence', () => {
  expectIncludesAll('src/views/WarehouseSalesIssueEditorView.vue', [
    "owner: '待分配'",
    'pickingDialogOpen',
    'submitSalesIssuePickingResult',
    'sales-picking-dialog',
    'products: [],',
    '<h2>任务概览</h2>',
    '<span>销售出库任务号</span>',
    '<span>补充要求</span>',
    'issueDraft.supplementaryRequirement || issueDraft.sourceRemark',
    '本次最多',
    'issueAvailableQuantity',
    'inventoryWarehouseCanSalesIssue',
    'initializeIssueAllocations',
    'syncIssueQuantityFromAllocations',
    '<span>仓库</span>',
    '<span>拣货库位</span>',
    '<span>当前可供</span>',
    '可销售出库仓暂无可供库存',
    'issueRecordLines',
    '<dt>出库仓库</dt>',
    '<dt>出库库位</dt>',
    '<dt>批次</dt>',
    '<strong>尚无已提交的出库记录</strong>',
    '<span>公司</span>',
    '计划出库日期',
    '收货地址',
    '本次出库',
    "label: '登记拣货'",
    "key: 'return'",
    "status: '待拣货'",
    ':class="{ \'is-disabled\': isReadOnly }"',
  ]);
  expectExcludes('src/views/WarehouseSalesIssueEditorView.vue', [
    '<span>出库单号</span>',
    "owner: '王倩'",
    "import { useSessionStore } from '../stores/session';",
    '受理发货任务',
    '<span>发货仓库</span>',
    'title="选择发货仓库"',
    '按可拣库存自动分配批次',
    '出库时自动分配',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    "code: '销售出库任务号'",
    "warehouse: '出库仓 / 交付方式'",
    "date: '出库日期'",
    "const usesActualDate = Boolean(row.reversalCode) || row.status === '已出库';",
    'salesIssueQuantitySummary',
    "'拣货时选择'",
    "dateAttention: '今日应出'",
    '<strong>当前进度</strong>',
    '<small>任务 · 待办</small>',
    '查看库存流水',
  ]);
  expectExcludes('src/views/WarehouseView.vue', ["salesIssues: '新建'"]);
  expectExcludes('src/views/WarehouseSalesIssueEditorView.vue', ['printIssue', '打印当前销售出库']);
  expectExcludes('src/views/WarehouseOperationEditorView.vue', ['printDocument', '可打印、PDF 或查看日志']);
  expectIncludesAll('server/index.mjs', [
    "kind !== 'warehouse-sales-issue'",
    'const remainingQty = Math.max(0, plannedQty - allocatedQty);',
    'function ensureSalesIssueTaskForTracking(data, tracking',
    'function ensureSalesIssueTasksForActiveTrackings(data)',
    'function hydrateSalesIssueExecutionFacts(data)',
    "'生成销售出库任务'",
    "待复核: ['待拣货']",
    '销售出库任务只能由已确认的销售交付事实自动生成，仓库不能手工新建任务。',
    '不支持普通保存；请使用“登记拣货”、退回复拣或正式过账命令。',
    "assertActionStatus('销售出库单', code, existing.status, ['待复核'], '确认出库');",
    '本次出库至少选择一项物料并填写大于 0 的数量。',
    "const nextStatus = fulfillment.totalDelivered > 0 ? '部分出库' : '待发货';",
    "status: existing?.status || '待拣货'",
    "'提交复核'",
    'function assertSalesIssueStockReadyForReview(data, issue, actionLabel',
    'function salesIssueDispatchableQuantity(row, issue, product)',
    'function normalizeSalesIssuePickingAllocations(data, issue, product, entered, productIndex)',
    'function salesIssueAllocationInventoryRow(warehouse, issue, product, allocation)',
    'function applySalesIssueInventoryDeduction(',
    'function consumeSalesIssueReservationsAcrossInventory(',
    'allocatedDemandByInventory',
    'supplementaryRequirement: tracking?.supplementaryRequirement || tracking?.remark || existing?.supplementaryRequirement || existing?.sourceRemark ||',
    'row.reservedNumber = row.reservationSources',
    'const projectedSource = {',
    'releasedQuantityNumber: releasedQty,',
    "? releasedQty > 0.0001 ? '已释放' : '已消耗'",
    "? '部分释放'",
    'row.lockedSources = structuredSources;',
  ]);
  expectIncludesAll('scripts/smoke-warehouse.mjs', [
    'remaining delivery quantity did not generate a warehouse picking task',
    'auto sales-issue task did not project the remaining dispatch quantity',
    'atomic picking submission did not record the authenticated operator or enter review',
    'atomic picking submission fabricated a separate picking-start milestone',
    'sales issue lost the supplementary requirement or mixed it into the warehouse picking note',
    'sales picking review accepted a quantity above current dispatchable stock',
    'picking result did not freeze exact batch/location allocations',
    'posted sales issue ignored reviewed picking allocations',
    'starting warehouse picking introduced a redundant sales-facing acceptance status',
    'sales issue was posted directly from picking without review',
    'sales picking did not preserve the deferred material in the current task progress snapshot',
    'deferred sales material did not generate a clean follow-up warehouse task',
    'retired sales issue ordinary save endpoint remained writable',
    'warehouse still allowed manual sales issue task creation',
    'generic status endpoint bypassed atomic sales picking submission',
    'sales issue post did not revalidate warehouse eligibility after review',
    'sales issue ordinary save reopened after review submission',
    'sales issue did not consume its reservation',
    'sales reversal reservation evidence is missing',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 122. 销售出库的剩余承接、拣货复核与预留消耗边界（2026-07-22）',
    '## 232. 销售出库取消独立受理并直接进入拣货（2026-07-31）',
    '## 234. 仓库执行登记改为无草稿原子弹窗（2026-07-31）',
    '## 235. 销售出库任务页与可拣库存闭环（2026-07-31）',
    '## 236. 销售出库逐库位批次拣货分配与过账一致性（2026-07-31）',
    '## 241. 销售拣货跨仓可供选择与实际出库位置（2026-08-01）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 93. 销售出库来源承接、作业阶段与预留消耗事实（2026-07-22）',
    '## 167. 统一库存事实、仓库事件与自动交接合同（2026-07-28）',
    '## 208. 销售出库拣货优先状态与开始作业事实（2026-07-31）',
    '## 210. 到货与拣货结果的原子提交合同（2026-07-31）',
    '## 211. 销售出库来源要求、执行记录与可拣库存合同（2026-07-31）',
    '## 212. 销售出库拣货分配与精确扣库合同（2026-07-31）',
    '## 215. 销售拣货跨仓库存分配与实际仓库事实（2026-08-01）',
  ]);
});

run('production issues inherit released allocations and separate lifecycle, operation, and posting facts', () => {
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    'getProductionMaterialIssueSource',
    'productionIssueSourceMissing',
    '等待生产释放任务',
    '仓库无需进入生产模块建单',
    'productionIssueOperationStage',
    ':primary-status="warehouseDocumentLifecycleStatus"',
    'production-issue-line-row',
    '[isEdit, () => documentDraft.value?.status, canEditCurrentStatus]',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    "'production-issue-status-shell': activePage === 'productionIssues'",
    '领料阶段 · 下一步',
    "? '已领料'",
    '领料结果已回传生产',
  ]);
  expectExcludes('src/views/WarehouseView.vue', ["productionIssues: '前往待领料'"]);
  expectIncludesAll('server/index.mjs', [
    "code === 'source'",
    'const preview = normalizeProductionIssue(data, { releaseBatch: release.code }, undefined);',
    'const allocations = productionIssueProducts(data, release);',
    'function ensureProductionIssueTaskForRelease(data, release, options = {})',
    "'系统生成领料任务'",
    "reason: '生产领料'",
    'sourceWarehouseCodes.length === 1',
  ]);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    'work order release did not automatically create a warehouse material issue task',
    'production issue task quantity differs from the release allocation',
    'material issue accepted a client-tampered source warehouse',
    'material issue accepted a client-tampered destination warehouse',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 123. 生产领料的释放承接、权威分配与生产交接边界（2026-07-22）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 94. 生产领料来源分配、库存过账与生产批次事实（2026-07-22）',
  ]);
});

run('other warehouse moves separate lifecycle, approval, posting, and canonical inventory facts', () => {
  expectIncludesAll('src/views/WarehouseView.vue', [
    "otherMoves: '登记出入库'",
    'otherMoveLifecycleStatus',
    'otherMoveApprovalStage',
    'otherMovePostingStage',
    "if (status === '待过账') return '待过账'",
    "if (status === '已过账') return '已过账'",
    "return '未过账'",
    "row.moveType === '库存调整'",
    'otherMoveProductSubtitle',
    'otherMoveQuantitySummary',
    'otherMoveBatchSummary',
    'otherMoveLocationLabel',
    "'other-move-status-shell': activePage === 'otherMoves'",
    '审批 · 库存 · 下一步',
  ]);
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    'otherMoveCounterpartyLabel',
    'otherMoveReasonLabel',
    'operationLocationLabel',
    'otherMoveLocationOptions',
    'otherMoveBatchOptions',
    'otherMoveApprovalStage',
    'otherMovePostingStage',
    'showOtherMoveCounterparty',
    'field-span-full',
    'operationMaterialLabel',
    'otherMoveLocationDisplay',
    "已过账: '库存已过账'",
    '当前单据状态',
    '审核用途与数量',
    '库存调整',
    '领用出库',
    '领用部门/人员',
    '领用用途',
    'other-move-line-row',
    'lineQuantityWithUnit',
  ]);
  expectExcludes('src/views/WarehouseOperationEditorView.vue', [
    '<option>盘外调整</option>',
    "if (status === '待过账') return '待确认'",
    "if (status === '已过账') return '已完成'",
  ]);
  expectIncludesAll('server/index.mjs', [
    "requestedMoveType === '盘外调整'",
    "'样品出库', '领用出库', '报废出库'",
    'const selectedWarehouse = requestedWarehouseCode || requestedWarehouseName',
    'location: otherMoveLocationProjection(data, move)',
    'function otherMoveLocationProjection(data, move)',
    '必须选择实际出库批次',
    '其他出入库不能使用占位库位',
    "move.moveType !== '库存调整'",
    "submittedAt: shanghaiDateTime()",
    "approvedAt: shanghaiDateTime()",
    "postedAt: shanghaiDateTime()",
  ]);
  expectIncludesAll('src/types/business.ts', [
    'location?: string',
    'submittedAt?: string',
    'approvedAt?: string',
    'postedAt?: string',
  ]);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    'other move accepted a nonexistent warehouse',
    'other move accepted a placeholder warehouse location',
    'usage issue could not enter the standard approval flow',
    'other move did not separate approval from posting',
    'other move posting did not reduce available inventory once',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 126. 其他出入库的业务分类、审批与库存过账边界（2026-07-22）',
    '## 253. 其他出入库状态、库存调整字段与列表流向收口（2026-08-02）',
    '## 254. 其他出入库列表数量汇总与历史占位库位清洗（2026-08-02）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 97. 其他出入库业务事实、审批里程碑与库存影响（2026-07-22）',
    '## 227. 其他出入库阶段投影与库存调整来源事实（2026-08-02）',
    '## 228. 其他出入库列表汇总与正式库位合同（2026-08-02）',
  ]);
});

run('spare-part storage and material output wording stay explicit', () => {
  expectIncludesAll('src/views/MasterWarehouseEditorView.vue', ["'备件仓'", "'暂存仓'"]);
  expectExcludes('src/views/MasterWarehouseEditorView.vue', ["'质检暂存'"]);
  expectIncludesAll('server/index.mjs', [
    "const warehouseTypeAliases = new Map([['质检暂存', '暂存仓']]);",
    '备件仓: {',
    '暂存仓: {',
    "'备件'",
  ]);
  expectIncludesAll('src/views/MasterDataView.vue', ["'可产出'"]);
  expectExcludes('src/views/MasterDataView.vue', ["'可生产'"]);
});

run('warehouse transfers separate lifecycle, transit, receipt, and idempotent double-entry facts', () => {
  expectIncludesAll('src/views/WarehouseView.vue', [
    "transfers: '新建调拨'",
    'transferLifecycleStatus',
    'transferOperationStage',
    "'transfer-status-shell': activePage === 'transfers'",
    '调拨阶段 · 下一步',
    "[row.fromWarehouseCode, row.toWarehouseCode].filter(Boolean).join(' → ')",
    'itemQuantity: otherMoveQuantitySummary(row.products)',
    "cardValue: otherMoveQuantityTotals(row.products) || '—'",
    '明细项数从多到少',
    '目标库位未设置',
    "已取消: '查看取消记录'",
    'transferOperationStage(status, row.reversalCode)',
    "? '查看冲销记录'",
    'row.reversalReason',
  ]);
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    'transferOperationStage',
    'transferMilestone',
    "if (status === '调拨中' || status === '待入库')",
    "label: '确认调入'",
    'transfer-line-row',
    '填写调拨用途或业务原因',
    "transferMilestone.value.value !== '-'",
    'warehouse-note-block',
    'function transferBatchOptions(product: WarehouseMoveProduct)',
    '自动按可用批次分配',
    '0 · 已清零',
    'draft.receivedBy',
    "isOtherMove.value || isTransfer.value ? '物料' : '物料/成品'",
    "label: '取消调拨'",
    'transferCancelDialogOpen',
    'warehousePrimaryActionBlockedReason',
    "if (isCancelled.value) return '已取消'",
    "['已取消', '已作废'].includes(String(documentDraft.value?.status || ''))",
    "documentDraft.value.toLocation = '';",
    'confirmWarehouseStockAction',
    "title: '确认调出库存？'",
    "title: '确认调入库存？'",
    'requestActionConfirmation',
    'operationLineProducts',
    "? '实际调拨明细'",
    "'调出库位 / 批次'",
    'sourceLocation: sourceInventory?.location || inventoryKeyParts[2]',
    "if (documentDraft.value?.reversalCode) return '已冲销'",
    "label: '冲销记录'",
    "documentDraft.value?.reversalReason || '原调拨已保留，库存影响已由独立冲销记录反向修正'",
  ]);
  expectExcludes('src/views/WarehouseOperationEditorView.vue', [
    'selectedTransferLocationOptions.value.length === 1',
  ]);
  expectIncludesAll('src/services/api.ts', [
    'export async function cancelWarehouseTransfer(code: string, reason: string)',
    "{ method: 'POST', body: { reason } }",
  ]);
  expectExcludes('src/views/WarehouseOperationEditorView.vue', [
    "label: '确认到达'",
    'const operationCodeLabel = computed',
    '<b>{{ warehouseNextStepGuidance.action }}</b>',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function dispatchTransferToTransit(data, transfer, actor)',
    'function receiveTransferFromTransit(data, transfer, actor)',
    "submittedAt: shanghaiDateTime()",
    "dispatchedAt: shanghaiDateTime()",
    "receivedAt: shanghaiDateTime()",
    "assertActionStatus('库存调拨单', code, existing.status, ['调拨中', '待入库'], '确认调入')",
    'idempotentReplay: true',
    '库存调拨不能使用占位库位',
    '库存调拨只能在同一公司所属仓库之间进行',
    '可清空后由系统自动分配',
    'const toLocation = requestedToLocation;',
    "owner: input.owner || existing?.owner || actor",
    "parts[4] === 'cancel'",
    "assertActionStatus('库存调拨单', code, existing.status, ['草稿', '待出库'], '取消调拨')",
    "status: '已取消'",
    '库存调拨不能用通用状态接口终止',
  ]);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    'transfer did not canonicalize the outbound warehouse',
    'transfer repeated dispatch was not idempotent',
    'transfer dispatch did not separate in-transit from inbound stock',
    'transfer receipt did not consume transit and increase target inventory once',
  ]);
  expectIncludesAll('scripts/smoke-warehouse.mjs', [
    'transfer accepted or ambiguously rejected a technical placeholder location',
    'transfer submitted a freely entered batch without source inventory',
    'incomplete draft transfer could not be cancelled safely',
    'pre-dispatch transfer cancellation changed source inventory',
    'in-transit transfer could be terminated without settling transit inventory',
    'golden transfer dispatch milestone is missing',
    'transfer without an assigned owner did not default to the authenticated creator',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 127. 库存调拨的调出、在途与调入边界（2026-07-22）',
    '## 255. 库存调拨列表、批次候选与库存影响复核（2026-08-02）',
    '## 256. 库存调拨取消边界与不完整旧单处置（2026-08-02）',
    '## 257. 库存调拨实际批次分配可见性（2026-08-02）',
    '## 258. 库存调拨冲销终态语义统一（2026-08-02）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 98. 库存调拨里程碑、在途占用与双仓过账事实（2026-07-22）',
    '## 229. 库存调拨批次候选、正式库位与分单位影响合同（2026-08-02）',
    '## 230. 库存调拨取消终态与在途守恒合同（2026-08-02）',
    '## 231. 库存调拨实际分配行读模型合同（2026-08-02）',
    '## 232. 库存调拨冲销终态投影合同（2026-08-02）',
  ]);
});

run('warehouse stocktakes use structured scopes, immutable snapshots, separated status facts, and reversible review flow', () => {
  expectIncludesAll('src/views/WarehouseView.vue', [
    "stocktakes: '新建盘点'",
    'stocktakeLifecycleStatus',
    'stocktakeOperationStage',
    'stocktakePostingStage',
    "'stocktake-status-shell': activePage === 'stocktakes'",
    '盘点阶段 · 下一步',
    'stocktakeOperationStage(status, row.reversalCode)',
    'stocktakePostingStage(status, row.reversalCode)',
    "if (row.reversalCode) return '已冲销'",
    "status: '盘点状态'",
    "return '差异项数从多到少'",
    "? '未形成账面快照'",
    "? '取消前未开始'",
    'warehouseStatusLabel(row)',
  ]);
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    'stocktakeScopeInputLabel',
    'stocktakeHeaderLocked',
    'stocktakeCancelledBeforeStart',
    'isStocktakeCancelled',
    'stocktakeOperationStage',
    'stocktakePostingStage',
    'stocktakeMilestone',
    'stocktakeQuantitySummary',
    'stocktakeDifferenceQuantitySummary',
    'stocktakePreviewRows',
    'stocktakeAvailableQuantitySummary',
    'handleStocktakeOwnerSelect',
    'kind="warehouse-stocktake-owner"',
    "if (!draft.date) missing.push('盘点日期');",
    "if (!draft.ownerEmployeeCode || !draft.owner) missing.push('负责人');",
    'if (!isDetail.value && !validateDocument()) return;',
    'latestFlowDetail(/完成盘点/)',
    "title: '确认完成盘点并更新库存？'",
    "title: '确认开始盘点并冻结范围？'",
    "confirmLabel: '确认开始盘点'",
    "documentDraft.value.scopeMode !== '全仓盘点'",
    "return '填写盘点说明、现场异常或交接要求'",
    "return '可上传盘点表、差异复核记录或现场照片'",
    '本次盘点在开始前已取消，未形成账面快照、实盘结果或差异。',
    "{ label: '库存状态', value: '库存未更新，未形成冻结' }",
    "if (['已取消', '已作废'].includes(status)) return '已取消'",
    'confirmWarehouseStockAction',
    "if (documentDraft.value?.reversalCode) return '已冲销'",
    "stocktakeMilestone.value.value !== '-'",
    '<span>账面合格数</span>',
    '<span>实盘合格数</span>',
    ':name="line.item"',
    "v-else-if=\"documentDraft.lines?.length || documentDraft.status !== '待盘点'\"",
    "label: '退回实盘'",
    "label: '取消盘点'",
    "<h2>{{ isStocktake ? '盘点影响' : '库存影响' }}</h2>",
    'v-if="!isDetail || documentAttachments.length"',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.stocktake-line-row:not(.quote-line-head)',
    '.stocktake-line-row > strong,',
    'font-variant-numeric: tabular-nums;',
    'min-width: 700px;',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function normalizeStocktakeLines(lines, existingLines = [])',
    "function normalizeStocktake(input, existing, data, actor = '')",
    "ownerEmployeeCode: isCounting ? existing.ownerEmployeeCode || '' : ownerEmployee?.code || ''",
    "!employeeHasActiveRole(data, ownerEmployee, 'ROLE-WAREHOUSE')",
    "throw requestError(400, '请填写有效的盘点日期。');",
    "kind === 'warehouse-stocktake-owner'",
    'function activeStocktakeCoveringTarget(warehouse, target, materialCode, item, batch)',
    'assertTargetNotStocktakeFrozen(warehouse, target, materialCode, item, batch);',
    'function releaseStocktakeFreeze(data, stocktake, sourceStatus = \'已取消\')',
    "parts[4] === 'return'",
    "parts[4] === 'cancel'",
    'reviewReturnedAt: shanghaiDateTime()',
    'cancelledAt: shanghaiDateTime()',
  ]);
  expectExcludes('server/index.mjs', [
    "owner: isCounting ? existing.owner : input.owner || existing?.owner || '王倩'",
  ]);
  expectIncludesAll('scripts/smoke-warehouse.mjs', [
    'stocktake accepted a nonexistent warehouse',
    'counting update deleted frozen snapshot lines',
    'stocktake accepted a negative counted quantity',
    'inbound mutation bypassed an active stocktake scope',
    'stocktake review return did not preserve its reason and milestone',
    'stocktake cancellation did not release the inventory freeze',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 128. 库存盘点的结构化范围、冻结快照与差异过账边界（2026-07-22）',
    '## 259. 库存盘点录入锁定、数量影响与冲销终态统一（2026-08-02）',
    '## 260. 库存盘点范围联动、开始冻结确认与列表语义收口（2026-08-02）',
    '## 261. 库存盘点负责人身份与开始前校验收口（2026-08-02）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 99. 库存盘点范围、冻结快照与差异事实（2026-07-22）',
    '## 233. 库存盘点执行投影、过账确认与冲销合同（2026-08-02）',
    '## 234. 库存盘点范围候选、冻结预览与列表筛选合同（2026-08-02）',
    '## 235. 库存盘点负责人引用与开始前门禁合同（2026-08-02）',
  ]);
});

run('warehouse inventory query keeps quantity facts, units, judgements, and batch metadata truthful', () => {
  expectIncludesAll('src/views/WarehouseView.vue', [
    "type WarehouseInventoryViewMode = 'item' | 'location' | 'batch';",
    "type WarehouseInventoryTaskView = 'overview' | 'receiving' | 'shipping' | 'batch';",
    "type WarehouseInventoryAlertTab = 'replenishment' | 'controlled' | 'expiry' | 'anomaly';",
    'const inventoryCompactDetailOpen = ref(false);',
    'const inventoryDetailScrollRef = ref<HTMLElement | null>(null);',
    "function setInventoryViewMode(mode: WarehouseInventoryViewMode)",
    'function setInventoryTaskView(task: WarehouseInventoryTaskView)',
    'function setInventoryAlertTab(tab: WarehouseInventoryAlertTab)',
    'inventoryCompactDetailOpen.value = true;',
    'const inventoryQueryOnlyChange = currentPath === \'/warehouse/inventory\' && previousPath === currentPath;',
    'const inventoryAlertQueryOnlyChange = currentPath === \'/warehouse/inventory-alerts\' && previousPath === currentPath;',
    'const stockLedgerQueryOnlyChange = currentPath === \'/warehouse/stock-ledger\' && previousPath === currentPath;',
    'if (inventoryQueryOnlyChange || inventoryAlertQueryOnlyChange || stockLedgerQueryOnlyChange) return;',
    'function inventoryDetailControlledText(detail: WarehouseInventoryDetailRow)',
    'function inventoryWarehouseControlledText(warehouse: WarehouseInventoryWarehouseSummary)',
    'const replenishmentStatusSummary = computed(() =>',
    'const inventoryAlertCounts = computed<Record<WarehouseInventoryAlertTab, number>>(() =>',
    'function inventoryAlertCountDisplay(tab: WarehouseInventoryAlertTab)',
    'const inventorySubjectHeader = computed(() =>',
    'const currentInventoryTaskOption = computed(',
    "if (task === 'batch') return 'batch';",
    "if (inventoryTaskView.value === 'batch' && mode !== 'batch') return;",
    'role="tab"',
    ':aria-selected="inventoryViewMode === option.key"',
    "if (nonZeroTotals.length) return nonZeroTotals.map(([unit, value]) => formatQty(value, unit)).join(' / ');",
    "return '效期未登记';",
    "type InventoryAvailabilityStatus = '数据异常' | '无可用库存' | '待转可用' | '全部占用' | '部分可用' | '可用';",
    'function inventoryBalanceAnomalyReasons(row: WarehouseInventorySourceRow)',
    'function inventoryRowHasBalanceAnomaly(row: WarehouseInventorySourceRow)',
    'function inventoryControlLabels(rows: WarehouseInventorySourceRow[])',
    'function inventoryControlDetail(rows: WarehouseInventorySourceRow[])',
    'function inventoryAvailabilitySummary(',
    'function inventoryGroupSortStatus(row: WarehouseInventoryGroup)',
    '...inventoryBalanceAnomalyReasons(row),',
    'class="inventory-balance-kpis"',
    'class="inventory-control-summary"',
    'class="inventory-work-status"',
    '<span>库存可用性</span><span>最近变动</span>',
    '<small>可用性结论</small><strong>{{ selectedInventoryRow.availabilitySummary }}</strong>',
    "'可用性说明',",
    "'受控提示',",
    "'库存可用性',",
    'function hasPositiveQty(value?: string)',
    'function inventoryTaskQty(value: string)',
    'function inventoryMaterialKey(row: InventoryMaterialIdentity)',
    'function inventoryMaterialMatches(first: InventoryMaterialIdentity, second: InventoryMaterialIdentity)',
    'type WarehouseFilterOption = string | { value: string; label: string };',
    'const filterPartyOptions = computed<WarehouseFilterOption[]>(() =>',
    'const value = inventoryMaterialKey(row);',
    'function inventoryBatchGroupExpiryDate(rows: WarehouseInventorySourceRow[])',
    'const inventoryTableScrollRef = ref<HTMLElement | null>(null);',
    'function resetInventoryTableScroll()',
    'function syncWarehouseListKeywordQuery()',
    'inventoryKeywordTimer = window.setTimeout(syncWarehouseListKeywordQuery, 250);',
    'function inventoryGroupMatchesTask(row: WarehouseInventoryGroup)',
    'function reconcileInventoryStatusFilter()',
    'function inventoryControlledFactEntries(row: WarehouseInventoryGroup)',
    'function inventoryLocationLabel(location: string)',
    'const inventoryPartySourceRows = computed(() =>',
    'const inventoryGroupedRows = computed(() =>',
    'matchesStatusFilter(row.status)',
    'inventoryLocationLabel(ledger.location)',
    'class="inventory-query-commandbar"',
    'class="inventory-task-control"',
    '<span>库存视图</span>',
    '<span>汇总维度</span>',
    ':disabled="inventoryTaskView === \'batch\' && option.key !== \'batch\'"',
    '<span>按{{ currentInventoryViewOption.label }}汇总 · {{ visibleInventoryRows.length }} 条结果</span>',
    'class="inventory-work-table"',
    'class="inventory-detail-drawer"',
    'tabindex="-1"',
    '@keydown.tab="handleInventoryDetailTab"',
    'role="dialog"',
    'aria-modal="true"',
    'aria-label="库存详情"',
    'aria-label="关闭库存详情" title="关闭库存详情"',
    'class="inventory-alert-overview"',
    'class="inventory-alert-table replenishment"',
    ':show-amount-sort="inventoryViewMode === \'location\'"',
    'if (keyword) query.keyword = keyword;',
    'delete query.keyword;',
    '.filter(inventoryGroupMatchesTask)',
    '<span>调拨在途</span><span>待检</span><span>待正式入库</span><span>不合格隔离</span><span>异常暂存</span>',
    '<span>冻结</span><span>待出库计划</span><span>可用</span>',
    '<div ref="inventoryTableScrollRef" class="inventory-table-scroll">',
    "'调拨在途',",
    "if (inventoryViewMode.value === 'batch') return '批次 / 物料';",
    'function replenishmentGapRatio(row: WarehouseReplenishmentSignal)',
    'amount: replenishmentGapRatio,',
    'function inventoryAlertInventoryQuery(alert: WarehouseInventoryOperationalAlert)',
    'const showInventoryAlertAmountSort = computed(() => inventoryAlertTab.value === \'replenishment\');',
    "if (tab !== 'replenishment' && sortMode.value === 'amountDesc') sortMode.value = 'status';",
    "if (activePage.value === 'inventory') return '受控与可用性优先';",
    "if (inventoryAlertTab.value === 'controlled') return '受控风险优先';",
    'matchesFilterValue(inventoryMaterialKey({ materialCode: row.materialCode, item: row.materialName }), filterParty.value)',
    'matchesFilterValue(inventoryMaterialKey({ materialCode: row.materialCode, item: row.item }), filterParty.value)',
    ':show-amount-sort="showInventoryAlertAmountSort"',
    ':status-sort-label="statusSortLabel"',
    '负数、维度缺失或数量关系异常',
    '{{ inventoryAlertEmptyTitle }}',
    'query: inventoryAlertInventoryQuery(alert)',
    '上限 {{ formatQty(signal.maxStock, signal.uom) }}',
    'class="inventory-alert-supply inventory-alert-threshold"',
    'ledgerSourcePath(ledger)',
    'ledgerOriginalSourcePath(ledger)',
    "showToast('库存余额已加载，库存流水暂不可用，可刷新重试', 'error');",
    "const key = [source.type, source.sourceDoc, source.status, source.path].join('::');",
    "selectedInventoryRow.mode !== 'location'",
    'selectedInventoryRow.occupationSources.length',
    "'物理在库',",
    "'合格在库',",
    "'待正式入库',",
    '{{ visibleInventoryRows.length }} 条结果',
    '入账日期 {{ detail.batchDate }} · 效期 {{ detail.expiryDate }}',
  ]);
  expectExcludes('src/views/WarehouseView.vue', [
    "`${value.toLocaleString('zh-CN')} 多单位`",
    'parsed.setFullYear(parsed.getFullYear() + 1);',
    'filteredInventorySourceRows',
    'inventoryAggregateStatus([row])',
    "return '需补货';",
    "return '需关注';",
    'row.riskSummary',
    "'风险提示',",
    "'库存判断',",
    '{{ signal.materialCode }} · {{ signal.warehouseName }} · {{ signal.code }}',
    '显示 {{ visibleInventoryRows.length ? 1 : 0 }}-{{ visibleInventoryRows.length }} / 共 {{ visibleInventoryRows.length }} 条',
    'row.riskSummary }} · {{ row.warehouseCount }} 仓 · {{ row.batchCount }} 批',
    "row.lockedSources.join('；')",
    ' / ${source.sourceLineId}',
    "'账面数量',",
    "'待检/冻结',",
    "'在途入库',",
    'class="inventory-alert-link"',
    'title="返回库存查询"',
    "inventoryTaskView.value = 'overview';",
    'amount: (row) => row.suggestedQty,',
    'amount: (row) => parseQty(row.quantity),',
    '负库存或库存维度缺失',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.inventory-query-commandbar {',
    '.inventory-task-control,',
    '.inventory-task-tabs button.active {',
    'background: #232520;',
    '.inventory-view-tabs button.active {',
    '.inventory-view-tabs button:disabled {',
    '.inventory-work-table {',
    '.inventory-work-row > :first-child {',
    '.inventory-work-status {',
    '.inventory-drawer-layer {',
    '.inventory-detail-drawer {',
    '.inventory-alert-overview {',
    '.inventory-alert-table.replenishment .inventory-alert-row {',
    '.inventory-alert-table.operational .inventory-alert-row > :first-child {',
    '.inventory-alert-row:not(.inventory-work-head):hover {',
    '.inventory-alert-threshold small {',
  ]);
  expectExcludes('src/styles/main.css', ['.inventory-alert-link {']);
  expectIncludesAll('shared/system-menu-defaults.json', [
    '"name": "库存查询", "path": "/warehouse/inventory"',
    '"name": "库存预警", "path": "/warehouse/inventory-alerts"',
  ]);
  expectIncludesAll('src/components/AppSidebar.vue', [
    'function pathMatches(path: string)',
    'currentPath.value === normalizedPath',
    'currentPath.value.startsWith(`${normalizedPath}/`)',
    'item.children.some((child) => pathMatches(child.path))',
  ]);
  expectExcludes('src/components/AppSidebar.vue', [
    'return currentPath.value.startsWith(path);',
    'currentPath.value.startsWith(child.path)',
  ]);
  expectIncludesAll('server/index.mjs', [
    "batchDate: String(product.batchDate || now).slice(0, 10)",
    "expiryDate: String(product.expiryDate || '')",
    "if (!existing.batchDate && seed.batchDate) existing.batchDate = seed.batchDate;",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 129. 库存查询的余额口径、三视角与批次效期边界（2026-07-22）',
    '## 262. 库存查询分组筛选、历史库位与列表降噪（2026-08-02）',
    '## 263. 库存查询工作台层级、视角切换与受控数量呈现（2026-08-02）',
    '## 264. 库存查询扁平结果、详情阅读顺序与滚动定位（2026-08-02）',
    '## 265. 库存查询全宽任务表与库存预警独立工作台（2026-08-02）',
    '## 266. 库存任务字段闭环、多单位筛选与排序边界（2026-08-02）',
    '## 267. 库存查询操作上下文与筛选有效性（2026-08-02）',
    '## 268. 库存物料身份、批次元数据与宽表操作收口（2026-08-02）',
    '## 269. 库存筛选身份、查询恢复与明细可访问性收口（2026-08-02）',
    '## 270. 库存可用性与受控事实分维（2026-08-02）',
    '## 271. 库存查询与库存预警系统一致性收口（2026-08-02）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 100. 库存查询余额、占用来源与批次元数据投影（2026-07-22）',
    '## 236. 库存查询完整分组筛选与历史库位展示合同（2026-08-02）',
    '## 237. 库存查询主从工作台与独立预警投影合同（2026-08-02）',
    '## 238. 库存查询详情渐进披露与多单位受控数量合同（2026-08-02）',
    '## 239. 库存任务表、详情抽屉与独立预警工作台合同（2026-08-02）',
    '## 240. 库存任务列集合与多单位可见性合同（2026-08-02）',
    '## 241. 库存查询上下文迁移与筛选域合同（2026-08-02）',
    '## 242. 库存物料身份与批次公共事实合同（2026-08-02）',
    '## 243. 库存物料筛选、库位流水与查询上下文合同（2026-08-02）',
    '## 244. 库存可用性与受控事实分维合同（2026-08-02）',
    '## 245. 库存查询与库存预警交互一致性合同（2026-08-02）',
  ]);
  expectIncludesAll('src/utils/statusPresentation.ts', [
    '无可用库存|待转可用',
  ]);
});

run('warehouse stock ledger separates business type, direction, balance fact, and public source identity', () => {
  expectIncludesAll('src/views/WarehouseView.vue', [
    'function ledgerBusinessType(row: StockLedgerRow)',
    'function ledgerDirectionLabel(row: StockLedgerRow)',
    "[/其他入库/, '其他入库']",
    "[/其他出库/, '其他出库']",
    "if (row.movement === '入库') return '未分类入库';",
    "if (row.movement === '出库') return '未分类出库';",
    'function ledgerReasonDetail(row: StockLedgerRow)',
    "const normalizedReasonLabel = reason.replace(/^库存/, '');",
    "businessType === '采购入库' && /^采购(?:到货)?正式入库$/.test(reason)",
    'function ledgerMaterialMeta(row: StockLedgerRow)',
    'function ledgerWarehouseMeta(row: StockLedgerRow)',
    'function ledgerRowKey(row: StockLedgerRow)',
    'function ledgerPublicSourceLine(row: StockLedgerRow)',
    "!row.sourceLineId.includes('::')",
    'function ledgerSourcePath(row: StockLedgerRow)',
    'function ledgerOriginalSourcePath(row: StockLedgerRow)',
    "if (/生产退料|退料入库/.test(reason)) return `/warehouse/production-returns/${encodeURIComponent(code)}`;",
    'ledgerBusinessType(row)',
    'ledgerDirectionLabel(row)',
    'ledgerMaterialMeta(row)',
    'ledgerBalanceText(row)',
    'matchesFilterValue(inventoryMaterialKey(row), filterParty.value)',
    "warehouseActorLabel(row.operator, '系统')",
    'const stockLedgerPageSize = 30;',
    'const paginatedStockLedgerRows = computed(() =>',
    'const stockLedgerHasRows = computed(() => visibleStockLedgerRows.value.length > 0);',
    '显示 {{ stockLedgerPageStart }}-{{ stockLedgerPageEnd }} / 共 {{ visibleStockLedgerRows.length }} 条',
    ':show-amount-sort="false"',
    'sort-date-label="发生时间"',
    'role="table" aria-label="库存流水列表"',
    "['发生时间', '物料/成品', '物料编码', '物料分类', '批次', '仓库', '仓库编码', '库位', '业务类型', '变动方向', '数量'",
    'detail = detail.slice(reversalPrefix.length).replace(/^[：:]\\s*/, \'\').trim();',
    "status: '业务类型'",
    "stockLedger: '搜索业务类型、物料/编码、批次、仓库/库位、来源或经办人'",
    'v-if="stockLedgerHasRows && !isListLoading && !listLoadError" class="table-scroll reference-table-scroll"',
    '<span role="columnheader">时间 / 业务类型</span>',
    '<span role="columnheader">物料 / 编码 / 批次</span>',
    '<span role="columnheader">仓库 / 编码 / 库位</span>',
    '<span role="columnheader">变动数量 / 前后余额</span>',
    ':key="ledgerRowKey(row)"',
    ':key="`${ledgerRowKey(row)}-card`"',
    "hasListConstraints.value ? '可以调整搜索或筛选条件后再查看。'",
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.warehouse-ledger-table .table-row:not(.table-head):hover {',
    '.warehouse-ledger-source small,',
    '.warehouse-ledger-card-source {',
  ]);
  expectExcludes('src/views/WarehouseView.vue', [
    'stockLedgerSummary',
    'warehouse-ledger-context',
    '库存事实轨迹',
    '库存流水口径说明',
  ]);
  expectExcludes('src/styles/main.css', [
    '.warehouse-ledger-context',
  ]);
  expectIncludesAll('src/types/business.ts', [
    'materialCode?: string;',
  ]);
  expectIncludesAll('server/index.mjs', [
    "sourceLineId: '',",
  ]);
  expectExcludes('server/index.mjs', [
    "sourceLineId: line.inventoryKey || '',",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 130.',
    '## 272. 库存流水查询、来源追溯与分页一致性收口（2026-08-03）',
    '库存流水不设置独立概览、口径说明或跳转卡片',
    '业务类型必须表达形成流水的业务场景',
    '说明只保留原因、异常、去向或冲销说明等增量事实',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 101.',
    '## 246. 库存流水列表投影与查询交互合同（2026-08-03）',
    'StockLedgerBusinessTypeProjection',
    'StockLedgerNoteProjection',
  ]);
});

run('warehouse batch trace is one truthful inventory view instead of a second list system', () => {
  expectIncludesAll('src/router/index.ts', [
    "redirect: '/warehouse/inventory?view=batch'",
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    "type WarehouseInventoryViewMode = 'item' | 'location' | 'batch';",
    'class="inventory-batch-trace-facts"',
    "selectedInventoryRow.mode === 'batch' ? '批次流水' : '最近流水'",
    'selectedInventoryRow.originSource',
    'selectedInventoryRow.movementCount',
    'function inventoryLedgerKeyword(row: WarehouseInventoryGroup)',
    'query: { keyword: inventoryLedgerKeyword(selectedInventoryRow) }',
    "return row.mode === 'batch' ? rows : rows.slice(0, 6);",
  ]);
  expectExcludes('src/views/WarehouseView.vue', [
    "activePage === 'batches'",
    'batchTraceSourceRows',
    'visibleBatchRows',
  ]);
  expectExcludes('src/styles/main.css', [
    '.warehouse-batch-table',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 131.',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 102.',
  ]);
});

run('seven-module list status columns keep the shared alignment contract', () => {
  const primaryStateBlocks = [
    ['src/views/SalesView.vue', '.order-document-state {'],
    ['src/views/SalesView.vue', '.outbound-document-state {'],
    ['src/views/PurchaseView.vue', '.requisition-document-state {'],
  ];
  for (const [file, selector] of primaryStateBlocks) {
    const block = blockAfter(file, selector, '}');
    assert(block.includes('justify-items: start;'), `${file} ${selector} should align the primary status to the left`);
    assert(block.includes('text-align: left;'), `${file} ${selector} should left-align primary status copy`);
  }

  const centeredProgressBlocks = [
    ['src/views/SalesView.vue', '.order-progress-scan > span {'],
    ['src/views/SalesView.vue', '.outbound-progress-scan > span {'],
    ['src/views/PurchaseView.vue', '.requisition-progress-scan > span {'],
    ['src/views/PurchaseView.vue', '.purchase-order-progress-scan > span {'],
  ];
  for (const [file, selector] of centeredProgressBlocks) {
    const block = blockAfter(file, selector, '}');
    assert(block.includes('justify-items: center;'), `${file} ${selector} should center equal-width progress facts`);
    assert(block.includes('text-align: center;'), `${file} ${selector} should center progress fact copy`);
  }

  const boundedReminderBlocks = [
    ['src/views/SalesView.vue', '.order-attention {'],
    ['src/views/PurchaseView.vue', '.purchase-order-attention {'],
  ];
  for (const [file, selector] of boundedReminderBlocks) {
    const block = blockAfter(file, selector, '}');
    assert(block.includes('width: 100%;'), `${file} ${selector} should stay inside its primary-status track`);
    assert(block.includes('max-width: 100%;'), `${file} ${selector} should not overlap adjacent progress facts`);
    assert(block.includes('overflow: hidden;'), `${file} ${selector} should clip overflow safely`);
    assert(block.includes('-webkit-line-clamp: 2;'), `${file} ${selector} should show at most two reminder lines`);
  }

  expectIncludesAll('src/styles/main.css', [
    '.finance-status-cell > .mini-status {\n  justify-self: start;',
    '.master-status-update-cell {\n  display: grid;\n  align-content: center;\n  justify-items: start;',
    '.quote-status-head {\n  border-top-right-radius: 8px;\n  text-align: left;',
    '.quote-status-cell {\n  display: grid;\n  gap: 4px;\n  align-content: center;\n  overflow: hidden;\n  color: inherit;\n  text-align: left;',
    '.quote-status-cell > * {\n  min-width: 0;\n  max-width: 100%;',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    '.warehouse-fact-status-cell {',
    'text-align: left;',
  ]);
  expectIncludesAll('src/components/ListStatusOverview.vue', [
    '.list-status-overview-head {',
    '.list-status-facts {',
    '.list-status-next {',
    "nextStepLabel: '下一步'",
    '<b>{{ nextStepLabel }}</b>',
    'min-width: 0;',
    'text-overflow: ellipsis;',
  ]);
});

run('seven-module user-facing terms stay clear without weakening business meaning', () => {
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    "待释放: '待安排'",
    "释放受阻: '暂不可安排'",
    "split: '新增生产安排'",
    '确认后生成生产安排；仓库确认领料出库后进入待开工队列。',
    '本次报工后提前结束设备作业',
  ]);
  expectExcludes('src/views/ProductionWorkbenchDemoView.vue', [
    'aria-label="本次释放"',
    '确认后生成释放批次；领料过账后进入待开工队列。',
    '本次报工后结束设备作业（短关）',
    '<strong>未闭环异常</strong>',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    "title: '生产执行记录'",
    "title: '工单配方'",
    "title: '工单工艺'",
    "title: '生产依据'",
    "{ label: '负责部门'",
    "{ label: '重复执行控制'",
  ]);
  expectExcludes('src/views/Production2View.vue', [
    "title: '释放与执行'",
    "title: '配方快照'",
    "title: '计划基线'",
    "{ label: '承接责任'",
    "{ label: '幂等范围'",
  ]);
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    '<h2>交付与备货明细</h2>',
    'title="订单进度"',
    '<dt>订单数量</dt><dd>{{ row.orderedQty }}</dd>',
    '<dt>待发数量</dt><dd>{{ row.remainingQty }}</dd>',
    '<small>库存已备</small><b>{{ row.reservedQty }}</b>',
    '<small>生产需求</small><b>{{ row.productionDemandQty }}</b>',
    '<small>待分配</small><b>{{ row.uncoveredQty }}</b>',
  ]);
  expectExcludes('src/views/SalesOrderEditorView.vue', [
    '<h2>需求分配</h2>',
    '生产数量链',
    '公共可用 ${formatQty(availableQty, unit)}',
    '尚可预留',
    '库存已备 <b>{{ row.reservedQty }}</b>',
    '生产安排 <b>{{ row.productionQty }}</b>',
  ]);
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    ':title="`${documentTitle}状态`"',
    '<dt>来源需求</dt>',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    '确认领料出库',
    '确认退料入库',
    '确认成品入库',
    '审批 · 库存 · 下一步',
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    "? '处理阶段' : '处置阶段'",
    '<h2>不合格处理</h2>',
    '提交复检判定并按结果更新批次流转条件',
  ]);
  expectIncludesAll('src/views/FinanceSalesInvoiceEditorView.vue', [
    '来源销售订单行开票额度已恢复',
    '这项会计冲销不等于资金已经退回',
  ]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    '历史单据仍保留原主体信息',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 136. 七模块界面用语与内部术语分层（2026-07-23）',
    '## 137. 七模块逐页复核完成与下一阶段基线（2026-07-23）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 107. 界面术语映射不改写权威业务状态（2026-07-23）',
    '## 108. 七模块权威事实基线与后续扩展边界（2026-07-23）',
  ]);
  expectIncludesAll('docs/erp-web-optimization-backlog.md', [
    '## 当前交接结论与后续优先级（2026-07-23）',
    '## 5. 生产与质检历史检查要点（已完成，保留作回归参考）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '# Filatrix ERP Web 新对话交接',
    '## 4. 下一阶段',
    '基础资料已完成逐页检查及十轮一致性、引用、写入、停用、并发、异步加载、能力关系、空值反馈与有效关系枚举边界复查',
  ]);
});

run('material relation sources and warehouse replenishment keep one authoritative flow', () => {
  expectIncludesAll('src/views/MasterMaterialEditorView.vue', [
    'v-if="materialDraft.isPurchasable && activeMaterialSupplierRelations.length"',
    '数据来自供应商资料中的“可供物料”，当前页只读。',
    '前往供应商维护',
    'v-if="activeWarehouseMaterialSettings.length"',
    '数据来自仓库资料中的“物料补货设置”，当前页只读；库存查询按这些阈值生成补货预警。',
    '前往仓库维护',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    'aria-label="库存补货预警"',
    '按仓库—物料补货点判断；在途、待入库和已生成的补货单据会参与防重复。',
    'visibleAlertReplenishmentSignals',
    'class="inventory-alert-table replenishment"',
    '<span>当前可用</span>',
    '<span>建议补货</span>',
    'signal.linkedDocument',
    '@click="handleStartReplenishment(signal, routeType)"',
  ]);
  expectIncludesAll('src/services/api.ts', [
    'listWarehouseReplenishments',
    'startWarehouseReplenishment',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function warehouseReplenishmentSignals(data)',
    'function startWarehouseReplenishment(data, relationCode, routeType',
    "action: '库存预警'",
    "'采购申请生成'",
    "'补货任务生成'",
  ]);
  expectIncludesAll('shared/permission-matrix.json', [
    '"PERM-WAREHOUSE-REPLENISH"',
    '"仓库补货发起"',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 138. 物料关系来源与库存补货预警闭环（2026-07-23）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 109. 仓库—物料补货信号、下游需求与通知事实（2026-07-23）',
  ]);
});

run('master-data write boundaries reject invalid identities, references, values, and relation deletion', () => {
  expectIncludesAll('server/index.mjs', [
    'function normalizedMasterStatus(value, label)',
    'function normalizedOptionalEmail(value, label',
    'function resolveMasterDepartment(data, reference, subjectLabel)',
    'function resolveMasterDepartmentFields(data, departmentCode, departmentName',
    '部门编码与名称不一致，请重新选择',
    'function inventoryFactHasOutstandingQuantity(row)',
    'function syncMasterReferenceProjections(data, type, previous, record)',
    'revision: existing ? Number(existing.revision || 1) + 1 : 1',
    '资料已被其他用户更新，请刷新页面后重新修改。',
    '客户名称已存在',
    '供应商名称已存在',
    '已有物料不能直接改分类',
    '已有物料不能直接修改；请新建物料',
    '基础单位决定库存和单据数量口径',
    '英文简称只能使用 1 到 16 位',
    '已有供货关系不能直接删除',
    '已有补货关系不能直接删除',
    'departmentCode: department.code',
    '仓库类型属于库存分类基础',
    '属于受控职能，不能与其他仓库职能同时配置',
    '所属公司决定库存责任主体',
    '清理完成后才能停用',
    '已停用，只能保留为停用关系',
  ]);
  expectIncludesAll('src/views/MasterMaterialEditorView.vue', [
    ':disabled="readonly || !isNew"',
    '分类决定物料编码，已有物料不可直接修改。',
    '基础单位决定库存和单据数量口径，已有物料不可直接修改。',
    '保质期必须是大于 0 的整数月',
  ]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    'formDraft.departmentCode = option.code',
    '请填写有效的邮箱地址。',
    '统一社会信用代码必须是 18 位数字或大写字母。',
    '英文简称只能使用 1 到 16 位',
  ]);
  expectIncludesAll('src/views/MasterCustomerEditorView.vue', [
    '请填写有效的客户邮箱',
    '信用额度必须是大于或等于 0 的数值',
    '付款期限必须是大于或等于 0 的整数天',
  ]);
  expectIncludesAll('src/views/MasterSupplierEditorView.vue', [
    '请填写有效的供应商邮箱',
    '供货周期必须是大于或等于 0 的整数天',
    '供应商基本资料已保存，但可供物料尚未保存',
    'shouldCreateSupplier',
    '停用供应商会同步停用全部可供物料关系',
    "savedSupplier.status === '停用' || !supplierSupportsMaterialRelations(savedSupplier.type)",
  ]);
  expectIncludesAll('src/views/MasterWarehouseEditorView.vue', [
    'import { Check, ChevronLeft',
    '库位数量必须是大于或等于 0 的整数',
    '库位前缀只能使用字母、数字或短横线',
    '仓库基本资料已保存，但物料补货设置尚未保存',
    'shouldCreateWarehouse',
    ':disabled="mode !== \'new\'"',
    '仓库类型用于库存分类，已有仓库不可直接修改；可参与的流程由业务职能控制。',
    '所属公司决定库存责任主体，已有仓库不可直接修改。',
    '停用前必须清理库存、占用和在途',
    "savedWarehouse.status === '停用' || !usesReplenishmentSettings.value",
  ]);
  expectIncludesAll('src/components/ReferencePicker.vue', [
    'aria-readonly="true"',
    'aria-disabled="true"',
  ]);
  expectIncludesAll('scripts/smoke-master-data-boundaries.mjs', [
    'invalid material unit',
    'duplicate customer name',
    'duplicate supplier name',
    'employee without a position',
    'equipment without a location',
    'omitted supplier relation',
    'omitted warehouse replenishment relation',
    'stocked material disable with padded status',
    'existing warehouse type mutation',
    'referenced unit disable with padded status',
    'supplier rename did not refresh relation names',
    'warehouse rename did not refresh material default-warehouse projections',
    'stale master-data update',
  ]);
  expectIncludesAll('src/data/masterData.ts', [
    'revision?: number;',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 142. 基础资料第四轮写入边界与失败反馈复查（2026-07-24）',
    '## 143. 基础资料第五轮停用、改名与并发一致性复查（2026-07-24）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 118. 基础资料命令校验、稳定引用与关系保留合同（2026-07-24）',
    '## 119. 主档停用级联、当前名称投影与乐观并发合同（2026-07-24）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 8. 基础资料第四轮写入边界补充（2026-07-24）',
    '## 9. 基础资料第五轮停用与并发补充（2026-07-24）',
  ]);
});

run('master-data shared editors preserve revisions and list projections match their visible facts', () => {
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    'revision: source.revision ?? 1',
    'const uomStatusLocked = computed',
    "field.key === 'name' && field.lockWhenReferenced && uomDefinitionLocked.value",
    "field.key === 'status' && field.lockWhenReferenced && uomStatusLocked.value",
    '当前仅有停用物料引用，可以调整使用状态。',
  ]);
  expectIncludesAll('src/views/MasterDataView.vue', [
    "departments: '所属公司'",
    "activePage.value === 'departments'",
    'return [row.code, row.name, row.owner, row.parentDepartment];',
  ]);
  expectIncludesAll('src/views/MasterDataView.vue', [
    "const pageTitles: Record<ActiveMasterDataTabKey, string> = {",
    "const ownerLabels: Record<ActiveMasterDataTabKey, string> = {",
  ]);
  assert(
    blockAfter('src/views/MasterDataView.vue', 'const pageTitles:', 'const createButtonLabels', 800)
      .includes("departments: '部门'"),
    'department page title should remain 部门',
  );
  assert(
    blockAfter('src/views/MasterDataView.vue', 'const ownerLabels:', 'const routePageMap', 1000)
      .includes("departments: '所属公司'"),
    'department owner filter should be labeled 所属公司',
  );
  const masterPutBlock = blockAfter(
    'server/index.mjs',
    "if (parts[1] === 'master-data') {",
    "if (parts[1] === 'production'",
    9000,
  );
  const updateStartIndex = masterPutBlock.indexOf("if (req.method === 'PUT' && code) {");
  const masterUpdateBlock = updateStartIndex >= 0 ? masterPutBlock.slice(updateStartIndex) : '';
  const revisionCheckIndex = masterUpdateBlock.indexOf('expectedRevision !== currentRevision');
  const normalizationIndex = masterUpdateBlock.indexOf('const record = normalizeMasterRecord');
  assert(revisionCheckIndex >= 0, 'master PUT should compare the submitted revision');
  assert(normalizationIndex >= 0, 'master PUT should normalize a revision-matched command');
  assert(
    revisionCheckIndex < normalizationIndex,
    'master PUT should reject a stale revision before validating or normalizing stale fields',
  );
  expectIncludesAll('scripts/smoke-master-data-boundaries.mjs', [
    'stale invalid master-data update',
    'unit referenced only by stopped materials should remain disableable',
    'stale invalid submissions are rejected by revision first',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 144. 基础资料第六轮编辑版本与列表查询一致性复查（2026-07-24）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 120. 主档编辑版本传递与查询投影对齐合同（2026-07-24）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 10. 基础资料第六轮编辑版本与查询补充（2026-07-24）',
  ]);
  expectIncludesAll('docs/erp-web-page-audit-ledger.md', [
    '## 已验收记录：基础资料第六轮编辑版本与查询一致性复查（2026-07-24）',
  ]);
});

run('master-data route loads and reference searches discard stale asynchronous responses', () => {
  expectIncludesAll('src/components/ReferencePicker.vue', [
    'let optionsLoadRequestId = 0;',
    'const requestId = ++optionsLoadRequestId;',
    'const referenceType = props.type;',
    'const query = keyword.value;',
    'options.value = [];',
    'if (requestId !== optionsLoadRequestId || !open.value) return;',
    'if (requestId === optionsLoadRequestId) loading.value = false;',
    'optionsLoadRequestId += 1;',
  ]);
  const editorLoadContracts = [
    ['src/views/MasterMaterialEditorView.vue', 'materialLoadRequestId'],
    ['src/views/MasterCustomerEditorView.vue', 'customerLoadRequestId'],
    ['src/views/MasterSupplierEditorView.vue', 'supplierLoadRequestId'],
    ['src/views/MasterWarehouseEditorView.vue', 'warehouseLoadRequestId'],
  ];
  for (const [file, requestIdName] of editorLoadContracts) {
    expectIncludesAll(file, [
      `let ${requestIdName} = 0;`,
      `const requestId = ++${requestIdName};`,
      'const targetCode =',
      `if (requestId !== ${requestIdName}) return;`,
      `if (requestId === ${requestIdName}) isLoading.value = false;`,
    ]);
  }
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    'let simpleLoadRequestId = 0;',
    '[page, () => route.params.code, mode]',
    'const requestId = ++simpleLoadRequestId;',
    'const targetPage = page.value;',
    'loadLinkedRows(targetPage, requestId)',
    'if (requestId !== simpleLoadRequestId) return;',
    'const isCurrentRequest = () => requestId === simpleLoadRequestId;',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 145. 基础资料第七轮异步加载身份与候选搜索复查（2026-07-24）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 121. 主档异步读取身份与候选查询时序合同（2026-07-24）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 11. 基础资料第七轮异步加载身份补充（2026-07-24）',
  ]);
  expectIncludesAll('docs/erp-web-page-audit-ledger.md', [
    '## 已验收记录：基础资料第七轮异步加载身份复查（2026-07-24）',
  ]);
});

run('master-data capability changes retire incompatible hidden relations', () => {
  expectIncludesAll('server/index.mjs', [
    "const materialRelationUnsupportedSupplierTypes = new Set(['设备供应商', '物流服务']);",
    'function warehouseSupportsReplenishment(warehouseOrType)',
    "record.status === '停用' || !supplierSupportsMaterialRelations(record.type)",
    "record.status === '停用' || !isPurchasableMaterial(record)",
    '!supplierSupportsMaterialRelations(supplier.type) && relationStatus !== \'停用\'',
    '!warehouseSupportsReplenishment(warehouse) && relationStatus !== \'停用\'',
  ]);
  expectIncludesAll('src/views/MasterSupplierEditorView.vue', [
    'supplierSupportsMaterialRelations(supplierDraft.type)',
    'savedSupplier.status === \'停用\' || !supplierSupportsMaterialRelations(savedSupplier.type)',
    'usesMaterialSupplyRelations.value || !relation.code.startsWith(\'NEW-\')',
  ]);
  expectIncludesAll('src/views/MasterWarehouseEditorView.vue', [
    "!warehouseDraft.warehouseFunctions?.some((item) => ['采购暂存', '销售退货暂存', '不合格隔离'].includes(item))",
    '<section class="form-section material-detail-section warehouse-detail-section">\n          <div class="form-section-head"><h2>基本资料</h2></div>',
    '<section v-if="usesReplenishmentSettings" class="form-section material-detail-section warehouse-detail-section">\n          <div class="form-section-head"><h2>物料补货设置</h2></div>',
    '<section class="form-section">\n          <div class="form-section-head"><h2>基本资料</h2></div>',
    '<section v-if="usesReplenishmentSettings" class="form-section">\n          <div class="form-section-head">\n            <h2>物料补货设置</h2>',
    'usesReplenishmentSettings.value || !setting.code.startsWith(\'NEW-\')',
  ]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    "{ key: 'secondary', label: '默认税率', placeholder: '例如 13%', required: true }",
  ]);
  expectIncludesAll('scripts/smoke-master-data-boundaries.mjs', [
    'removing purchasable capability did not stop supply relations',
    'non-material supplier type did not stop supply relations',
    'active replenishment relation on quality-hold warehouse',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 146. 基础资料第八轮能力变更与隐藏关系复查（2026-07-24）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 122. 主档能力与关系有效性联动合同（2026-07-24）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 12. 基础资料第八轮能力边界补充（2026-07-24）',
  ]);
  expectIncludesAll('docs/erp-web-page-audit-ledger.md', [
    '## 已验收记录：基础资料第八轮能力与隐藏关系复查（2026-07-24）',
  ]);
});

run('master-data list fallbacks and reverse relation projections stay truthful', () => {
  expectIncludesAll('src/views/MasterDataView.vue', [
    "const value = String(row[key] ?? '').trim();",
    "return value || '—';",
    "return String(row.contact ?? '').trim()",
    "return String(row.phone ?? '').trim()",
    'draftFilters.value.dateStart > draftFilters.value.dateEnd',
    "showToast(`${filterDateLabel.value}起不能晚于${filterDateLabel.value}止`, 'error');",
  ]);
  expectIncludesAll('src/views/MasterMaterialEditorView.vue', [
    "const activeMaterialSupplierRelations = computed(() =>",
    "materialSupplierRelations.value.filter((relation) => relation.status === '启用')",
    "const activeWarehouseMaterialSettings = computed(() =>",
    "warehouseMaterialSettings.value.filter((setting) => setting.status === '启用')",
    'materialDraft.isPurchasable && activeMaterialSupplierRelations.length',
    'v-for="relation in activeMaterialSupplierRelations"',
    'v-if="activeWarehouseMaterialSettings.length"',
    'v-for="setting in activeWarehouseMaterialSettings"',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 147. 基础资料第九轮空值、反向关系与筛选反馈复查（2026-07-24）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 123. 主档缺省展示与有效反向关系投影合同（2026-07-24）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 13. 基础资料第九轮空值与反向关系补充（2026-07-24）',
  ]);
  expectIncludesAll('docs/erp-web-page-audit-ledger.md', [
    '## 已验收记录：基础资料第九轮空值、反向关系与筛选反馈复查（2026-07-24）',
  ]);
});

run('master-data final baseline accepts only explicit enabled relations', () => {
  expectIncludesAll('src/views/MasterMaterialEditorView.vue', [
    "materialSupplierRelations.value.filter((relation) => relation.status === '启用')",
    "warehouseMaterialSettings.value.filter((setting) => setting.status === '启用')",
  ]);
  expectIncludesAll('src/views/MasterSupplierEditorView.vue', [
    'const hasActiveMaterialSupplyRelation = computed(() =>',
    "materialRelations.value.some((relation) => relation.status === '启用')",
    'complete: hasActiveMaterialSupplyRelation.value',
  ]);
  const relationNormalizationBlock = blockAfter(
    'server/index.mjs',
    'function ensureMasterRelations(data) {',
    'const masterCodePrefixes =',
    5000,
  );
  assert(
    (relationNormalizationBlock.match(/\|\| row\.status !== '启用'/g) || []).length === 2,
    'supplier and warehouse relation normalization should retire every non-enabled legacy status',
  );
  expectIncludesAll('server/index.mjs', [
    "ensureMasterRelations(data).warehouseMaterials\n    .filter((row) => row.status === '启用')",
    ".filter((row) => row.isDefault && row.status === '启用')",
  ]);
  expectIncludesAll('scripts/smoke-master-data-boundaries.mjs', [
    'invalid legacy supplier relation remained active',
    'invalid legacy warehouse relation remained active',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 148. 基础资料第十轮有效关系枚举与最终基线复查（2026-07-24）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 124. 有效关系枚举与资料完整性投影合同（2026-07-24）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 14. 基础资料第十轮最终基线补充（2026-07-24）',
  ]);
  expectIncludesAll('docs/erp-web-page-audit-ledger.md', [
    '## 已验收记录：基础资料第十轮有效关系与最终基线复查（2026-07-24）',
  ]);
});

run('sales five-round boundary keeps test data and cross-role records out of daily projections', () => {
  expectIncludesAll('server/index.mjs', [
    '.filter((row) => row.testOnly !== true)',
    '.filter((order) => order.testOnly !== true)',
    'const testOnlyOrderCodes = new Set(',
    '.filter((record) => !testOnlyOrderCodes.has(record.sourceOrder))',
    "parts[1] === 'sales' && parts[2] === 'delivery-records'",
  ]);
  expectIncludesAll('scripts/smoke-sales.mjs', [
    'test-only sales order leaked into the ordinary order list',
    'test-only sales order leaked into sales-order references',
    'test-only order lost direct regression access',
    'test-only sales order leaked into sales delivery records',
    'source-order delivery filtering bypassed test-only isolation',
  ]);
  expectExcludes('src/views/SalesOrderEditorView.vue', [
    'listSalesIssues',
    'listFinanceRecords',
    '/finance/',
    'issue.warehouse',
    'issue.owner',
  ]);
  expectExcludes('src/views/SalesView.vue', [
    'apiSalesInvoiceRows',
    'apiReceivableRows',
    'matchingSalesInvoicesForOrder',
    'matchingReceivablesForOrder',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 163. 销售模块五轮收口目标（2026-07-26）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 142. 销售订单跟进最小投影与角色边界合同（2026-07-26）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 29. 销售模块五轮专项进度（排除售后与 PDF，2026-07-26）',
  ]);
});

run('material purchase separates drafts confirmation output and readonly detail noise', () => {
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    "const saveActionLabel = computed(() => (isChangeMode.value ? '保存变更' : '保存草稿'));",
    "const confirmActionLabel = computed(() => (isChangeMode.value ? '提交变更' : '确认'));",
    '系统将先保存当前内容，再锁定采购单并进入供应商交付、收货、质检与采购跟进流程。',
    '${documentTitle.value}草稿已保存',
    'function previewPurchasePdf()',
    "name: 'purchase-order-pdf'",
    "window.open(previewPath, '_blank', 'noopener,noreferrer');",
    'v-if="!isPurchaseFollowUpView"',
    '@click="previewPurchasePdf"',
    '<span class="required-label">未税单价</span>',
    '<span class="required-label">含税单价</span>',
    'v-model="item.taxRate"',
    "v-if=\"!isReadOnly\"\n                class=\"secondary-action compact-action file-upload-button\"",
  ]);
  expectIncludesAll('src/views/PurchaseView.vue', [
    '<template v-else-if="activePage === \'orders\'">\n              共 {{ visiblePurchaseRows.length }} 条',
    '<span>共 {{ visiblePriceRows.length }} 条</span>',
  ]);
  expectExcludes('src/views/PurchaseView.vue', [
    'title="已经是第一页"',
    'title="已经是最后一页"',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 167. 物料采购草稿、确认与只读详情收口（2026-07-26）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 147. 物料采购草稿与输出表现合同（2026-07-26）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 33. 物料采购首轮精修（2026-07-26）',
  ]);
  expectIncludesAll('docs/erp-web-page-audit-ledger.md', [
    '## 已验收记录：采购 · 物料采购首轮精修（2026-07-26）',
  ]);
});

run('sales and purchase follow-up prioritize process facts and compact commercial records', () => {
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    'const salesFollowUpRelatedRecords = computed(() => {',
    'coveragePercent: remainingQty <= 0 ? 100',
    '<span>需求已分配</span>',
    'function deliveryRecordWarehouseSummary(record: SalesDeliveryRecord)',
    '<dt>实际出库仓库</dt>',
    '<dt>经办人</dt>',
    '<h2>开票与回款</h2>',
    '<CommercialFollowUpPanel',
    '@remove="deleteCommercialFollowUpEntry"',
    'class="summary-section follow-up-related-section"',
    'class="follow-up-related-list"',
  ]);
  expectExcludes('src/views/SalesOrderEditorView.vue', [
    '<h2>回款概览</h2>',
    'salesFinancialOverviewRows',
    'commercial-overview-grid',
    'listFinanceRecords',
    '/finance/',
  ]);
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    "mode.value === 'purchase-order-follow-up'",
    '采购内容',
    '采购跟进',
    'function purchaseProgressLineStatus(line: PurchaseProgressLine)',
    'class="purchase-follow-up-stage-grid"',
    'class="purchase-follow-up-progress-bars"',
    'class="purchase-follow-up-quality-facts"',
    ':show-price-tax="false"',
    "@input=\"updateLineUnitPrice(item, '不含税', $event)\"",
    "@input=\"updateLineUnitPrice(item, '含税', $event)\"",
    'v-model="item.taxRate"',
    '<h2>收票与付款</h2>',
    '<CommercialFollowUpPanel',
    '@remove="deleteCommercialFollowUpEntry"',
    'class="summary-section follow-up-related-section"',
    'class="follow-up-related-list"',
    "'is-follow-up-view': isPurchaseFollowUpView",
    '<div class="fact-span-2"><dt>补充条款',
    '<h2>明细进度</h2>',
  ]);
  expectExcludes('src/views/PurchaseOrderEditorView.vue', [
    '<h2>结算概览</h2>',
    'purchaseFinancialOverviewRows',
    'commercial-overview-grid',
  ]);
  expectIncludesAll('src/router/index.ts', [
    "path: 'purchase/orders/:code/follow-up'",
    "name: 'purchase-order-follow-up'",
  ]);
  expectIncludesAll('src/types/business.ts', [
    "priceInputMode?: '含税' | '不含税';",
    'netUnitPrice?: string;',
    'grossUnitPrice?: string;',
    'commercial?: {',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function purchaseOrderProgressFacts(data, order)',
    'function removeCommercialFollowUp(data, module, order, eventId, actor)',
    "event.status = 'voided';",
    "parts[4] === 'commercial-follow-ups' && parts[5]",
    'invoicedAmount: invoiceAmount,',
    "warehouse: actualWarehouses.map((item) => item.name).filter(Boolean).join('、') || record.warehouse || '',",
    "owner: record.owner || '',",
    'const priceInputMode = normalizeSalesQuoteTaxMode(product.priceInputMode',
    '...salesQuoteLinePricing(normalizedProduct, priceInputMode, taxRate)',
    'salesQuoteTaxRateSummary(normalizedProducts',
  ]);
  expectIncludesAll('src/components/CommercialFollowUpPanel.vue', [
    '填写本次登记说明，可留空',
    '删除后进度和累计金额会自动重算',
    'role="dialog"',
    '确认删除',
    'class="commercial-follow-up-groups"',
    'class="commercial-follow-up-summary"',
    'eventsForKind(group.kind)',
    '@click="removeEvent(event)"',
    "event.source !== 'legacy'",
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.order-editor.is-delivery-view .order-delivery-grid',
    '.purchase-order-editor.is-follow-up-view .order-delivery-grid',
    'grid-template-columns: minmax(0, 1fr) 292px;',
  ]);
  expectExcludes('src/components/CommercialFollowUpPanel.vue', [
    'referenceNo',
    'type="file"',
    '发票号 / 回单号 / 参考号',
  ]);
  expectIncludesAll('src/services/api.ts', [
    'export async function removeCommercialFollowUp(',
    "method: 'DELETE'",
  ]);
  expectIncludesAll('src/views/PurchaseView.vue', [
    '<span>含税采购单价</span>',
    'grossUnitPrice: formatPriceValue(product.grossUnitPrice || product.unitPrice)',
    '<small>未税 {{ row.netUnitPrice }} · 税率 {{ row.taxRate }}</small>',
  ]);
  expectIncludesAll('scripts/smoke-purchase.mjs', [
    'mixed-rate purchase order draft could not be created',
    "mixedTaxDraft.payload.order.taxRate === '多税率'",
    "mixedTaxDraft.payload.order.amount === '￥331.00'",
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 168. 销售回款摘要与物料采购逐行价税、跟进分层（2026-07-26）',
    '## 186. 销售与采购跟进页信息密度与侧栏归位（2026-07-28）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 148. 销售财务结果投影与物料采购逐行价税、跟进合同（2026-07-26）',
    '## 165. 销售采购跟进投影布局与商务记录分组合同（2026-07-28）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 34. 销售回款摘要与物料采购价税/跟进重构（2026-07-26）',
    '新增只填金额、日期和可选备注',
    '## 54. 销售与采购跟进页密度优化（2026-07-28）',
  ]);
});

run('purchase list follows purchase-specific scanning priorities', () => {
  expectIncludesAll('src/views/PurchaseView.vue', [
    'function purchaseSourceLabel(row: PurchaseOrder)',
    'function purchaseOrderFollowUpPath(row: PurchaseOrder)',
    '<span>金额</span>',
    '<span>预计到货</span>',
    '<strong>采购跟进</strong>',
    '{{ purchasePayableSummary(row) }}',
    '@media (max-width: 1260px) and (min-width: 761px)',
    'grid-template-columns: minmax(0, 1fr) 360px;',
    'grid-template-columns: repeat(3, minmax(0, 1fr));',
    'class="purchase-order-card-content-link"',
    'class="purchase-order-card-follow-up-link"',
    'class="purchase-order-progress-scan is-five-stage"',
    'class="purchase-order-card-progress is-five-stage"',
    ':to="purchaseOrderFollowUpPath(row)"',
    'purchaseOrderProgressSnapshot(row).invoice',
    'purchaseOrderProgressSnapshot(row).payment',
    'row.products.slice(0, 2)',
    '另有 {{ row.products.length - 2 }} 项物料',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 169. 销售与采购跟进主次信息归位（2026-07-26）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 149. 订单跟进财务投影、关联链与收货仓库变更合同（2026-07-26）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 35. 销售/采购跟进与物料采购显示补充（2026-07-26）',
  ]);
  expectIncludesAll('docs/erp-web-page-audit-ledger.md', [
    '## 已验收记录：销售/采购跟进与物料采购显示补充（2026-07-26）',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 170. 物料采购列表与采购收货库存阶段（2026-07-26）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 150. 物料采购列表投影与来料库存阶段合同（2026-07-26）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 36. 物料采购列表重排与来料入库口径（2026-07-26）',
  ]);
});

run('confirmed material purchase orders drive warehouse receiving tasks without blank receipt creation', () => {
  expectIncludesAll('server/index.mjs', [
    'function ensurePendingPurchaseReceiptTask(data, order, options = {})',
    'function purchaseReceiptTaskExecutionStarted(receipt)',
    'function purchaseOrderHasExecutedDownstreamFacts(data, order)',
    "status: '待收货'",
    "'生成待收货任务'",
    'generatedFromPurchaseOrder: true',
    'nextReceiptTask: generatedNextReceipt.task',
    'function cancelPendingPurchaseReceiptTasks(data, orderCode',
    "&& purchaseReceiptCountsAsArrival(receipt)",
    '仓库不能新建空白采购收货单。',
    'receiptTask: synchronizedReceipt.task',
  ]);
  expectExcludes('src/views/WarehouseView.vue', [
    "purchaseReceipts: '新建'",
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    'return `/warehouse/${pageRouteMap[row.page]}/${encodeURIComponent(row.code)}`;',
    '采购订单确认后，系统会自动在这里生成待到货的采购入库任务。',
  ]);
  expectIncludesAll('src/router/index.ts', [
    "path: 'warehouse/purchase-receipts/new'",
    "redirect: '/warehouse/purchase-receipts'",
  ]);
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    "const pageHeading = '采购入库详情';",
    "`${draft.code || '—'} · ${draft.supplier || '未记录供应商'}`",
    "openReceiptActionDialog('arrival')",
    "openReceiptActionDialog('post')",
    '<dt>实际到货日期</dt>',
    '<dt>到货登记人</dt>',
    '搜索具备采购暂存职能的启用仓库',
    'submitPurchaseReceiptArrivalResult',
    'products: submitted.products.filter((product, index) => receiptLineIsSelected(product, index))',
    'purchaseInboundAggregateLines',
    'purchaseArrivalRecords',
    'class="purchase-inbound-material-plan"',
  ]);
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', [
    '保存草稿',
    "if (isEdit.value) {\n      openReceiptActionDialog(",
    "const isEdit = computed(() => mode.value === 'warehouse-purchase-receipt-edit');",
    'receiptNextStepGuidance.action',
    'const isNew',
    'isDisplayDetail',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function purchaseInboundDetailProjection(data, selectedReceipt)',
    'detailProjection: purchaseInboundDetailProjection(data, warehouse.purchaseReceipts[index])',
    "receipt.sourceType !== 'purchase_after_sale'",
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.reference-picker-backdrop {',
    'z-index: 1500;',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    'partySubtitle: row.sourceDoc,',
    "warehouseSubtitle: isWaitingArrival ? '' : row.location ? inventoryLocationLabel(row.location) : '库位未登记',",
    "warehouseContext: isWaitingArrival ? '计划暂存仓' : '实际暂存',",
  ]);
  expectExcludes('src/views/WarehouseView.vue', [
    'partySubtitle: `${row.sourceDoc} · ${row.contact}`',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 171. 仓库业务职能与采购待收货任务（2026-07-26）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 151. 仓库职能、采购暂存与待收货任务合同（2026-07-26）',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 172. 采购履约边界与双形态列表复核（2026-07-27）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 152. 采购待收货同步与列表投影补充合同（2026-07-27）',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 38. 采购流程与双形态列表复核（2026-07-27）',
  ]);
});

run('unified sales and purchase after-sales delegate physical work without creating finance tasks', () => {
  expectIncludesAll('server/index.mjs', [
    'function afterSalesTaskBlueprint(kind, record)',
    'function ensureAfterSalesExecutionTasks(data, kind, record)',
    'function completeAfterSalesExecutionTask(data, module, code, body, authenticatedActor)',
    'function employeeHasActiveRole(data, employee, roleCode)',
    'function normalizeAfterSalesOwnerAssignment(data, kind, record)',
    'function afterSalesOwnerForSource(data, kind, sourceOrder = {})',
    "['sales-document-owner', 'sales-after-sales-owner'].includes(kind)",
    "kind === 'purchase-after-sales-owner'",
    "const action = existing ? String(input.action ?? existing.action ?? '').trim() : '';",
    '执行任务由对应业务模块维护，销售售后不能删除任务。',
    '执行任务由对应业务模块维护，采购售后不能删除任务。',
    'function withSalesAfterSalesEligibility(data, sourceOrder)',
    "kind !== 'after-sales'",
    "requireAfterSalesWarehouse(data, task, body, '可采购入库'",
    'function ensurePurchaseAfterSaleInboundTask(data, afterSale, options = {})',
    'function hydratePurchaseAfterSaleUnifiedInbound(data)',
    '补救来料尚未完成统一采购入库',
    "const actionLabel = disposition.action === 'return_to_supplier' ? '转采购处理' : '让步审批放行';",
  ]);
  expectExcludes('server/index.mjs', [
    "{ module: '财务', kind: '销售退款或折让'",
    "{ module: '财务', kind: '采购退款或应付调整'",
    "...afterSalesTaskStore(data, '财务')",
    "if (module === '财务') applyFinanceAfterSalesTask",
  ]);
  expectIncludesAll('src/router/index.ts', [
    "path: 'quality/after-sales'",
    "path: 'production/after-sales'",
    "path: 'warehouse/after-sales/:code'",
    "path: 'quality/after-sales/:code'",
    "path: 'production/after-sales/:code'",
  ]);
  expectIncludesAll('src/views/AfterSalesDocumentView.vue', [
    '{{ record.partyRole }}',
    '任务执行中',
    "kind.value === 'sales' ? '客户' : '供应商'",
    'kind="after-sales"',
    'selectedSourceOrderLabel',
    'voidPurchaseAfterSale',
  ]);
  expectIncludesAll('src/views/AfterSalesExecutionTaskView.vue', [
    'startAfterSalesExecutionTask',
    'completeAfterSalesExecutionTask',
    "const canComplete = computed(() => task.value?.status === '处理中');",
    "task.value?.kind === '客户退货接收'",
    "return ['可再次销售', '返修返工', '报废'];",
    "['返修品出库', '返修品报废处置', '退货品返还出库', '不合格品退回供应商', '异常暂存退回']",
    "task.value?.kind === '采购退货出库'",
    'const backPath = computed(() => `/${modulePath}/after-sales`);',
  ]);
  expectExcludes('src/views/AfterSalesExecutionTaskView.vue', [
    "modulePath === 'finance'",
    'financeSettle',
    '来源销售发票',
    '来源采购发票',
    '实际处理金额',
    '结算凭证',
  ]);
  expectExcludes('src/views/AfterSalesDocumentView.vue', [
    "task.module === '财务'",
    '财务确认金额',
    'financeConfirmedAmount',
  ]);
  expectExcludes('src/types/business.ts', [
    "'生产' | '财务'",
    "'返修' | '结算'",
  ]);
  expectExcludes('src/services/api.ts', [
    "'production' | 'finance'",
  ]);
  expectIncludesAll('src/views/AfterSalesExecutionListView.vue', [
    'listAfterSalesExecutionTasks(modulePath.value)',
    'function taskResult(task: AfterSalesExecutionTask)',
    "task.status !== '已取消'",
    '等待前置任务完成',
    "resultAction: '登记作业结果'",
    '客户 / 供应商',
  ]);
  expectExcludes('src/views/AfterSalesExecutionListView.vue', [
    '售后结算',
    "modulePath.value === 'finance'",
    '结算已完成',
  ]);
  expectIncludesAll('shared/system-menu-defaults.json', [
    '"name": "售后作业"',
    '"path": "/warehouse/after-sales"',
    '"name": "售后检验"',
    '"path": "/quality/after-sales"',
    '"name": "售后返修"',
    '"path": "/production/after-sales"',
  ]);
  expectExcludes('shared/system-menu-defaults.json', ['"name": "售后结算"', '"path": "/finance/after-sales"']);
  expectExcludes('src/views/QualityView.vue', ['AfterSalesTaskQueue']);
  expectExcludes('src/views/ProductionWorkbenchDemoView.vue', ['AfterSalesTaskQueue']);
  expectExcludes('src/views/FinanceView.vue', ['AfterSalesTaskQueue']);
  expectIncludesAll('scripts/smoke-after-sales.mjs', [
    'eligible source quantities',
    'warehouse completion did not synchronize',
    'purchase after-sales still projected finance-owned work',
    'unified purchase remedy inbound',
  ]);
  expectIncludesAll('docs/erp-web-prototype-blueprint.md', [
    '## 178. 销售与采购售后统一作业体系（2026-07-27）',
    '### 178.6 负责人归属与执行列表复查（2026-07-27）',
  ]);
  expectIncludesAll('docs/erp-web-business-fact-model.md', [
    '## 157. 统一售后事实与执行任务合同（2026-07-27）',
    '### 157.8 售后负责人角色约束与结果投影',
  ]);
  expectIncludesAll('docs/archive/erp-web-handoff-history-through-2026-08-07.md', [
    '## 44. 销售与采购售后统一作业（2026-07-27）',
    '## 45. 售后负责人、操作顺序与结果呈现复查（2026-07-27）',
  ]);
});

run('sales and purchase after-sales details keep an aligned independent sticky sidebar', () => {
  expectIncludesAll('src/views/AfterSalesDocumentView.vue', [
    '<h2>协同进度</h2>',
    '<h2>关联处理记录</h2>',
    ".format(Number(value || 0)).replace('¥', '￥');",
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.quote-editor.after-sales-editor .quote-form-grid {\n  overflow: visible;',
    '.quote-editor.after-sales-editor .quote-summary-panel {\n  gap: 14px;',
    'border: 0;\n  border-radius: 0;\n  background: transparent;',
    'position: sticky;\n    top: 10px;',
    '.quote-editor.after-sales-editor .quote-summary-panel .summary-section:first-child {',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 181. 售后详情侧栏对齐与长页滚动（2026-07-27）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 160. 售后详情辅助投影呈现合同（2026-07-27）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 48. 售后详情侧栏复查（2026-07-27）');
});

run('purchase inbound uses one controlled staging bin, formal-inbound batches, split allocations, and material-owned quality rules', () => {
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    'const stagingLocationOptions = computed',
    '<option v-for="location in stagingLocationOptions"',
    'inboundAllocationLocationOptions(allocation.warehouseCode, allocation.warehouse)',
    '正式入库时按物料规则生成',
    'receiptDraft.inboundAllocations',
    '提交到货结果',
    "item.incomingQualityControl || (item.qcRequired ? '需质检' : '免检')",
    "receiptDraft.value?.sourceType === 'purchase_after_sale'",
    'const plannedQty = product.plannedQty || product.qty;',
    'class="quote-editor warehouse-document-editor purchase-receipt-editor is-detail-view"',
  ]);
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', [
    'v-model="item.batch"',
    'receipt-status-cluster',
    '填写正式库位',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.receipt-action-dialog {',
    '.quote-editor.is-detail-view .quote-fields:has(.form-readonly-value) {\n  align-items: stretch;',
    'align-self: stretch;',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function hydratePurchaseStagingWarehouse(data)',
    "const stagingName = '采购暂存区';",
    'allowPurchaseStaging === true',
    'const stagingWarehouse = stagingWarehouses.find',
    'requestedStagingLocation',
    'const isPendingArrival =',
    'const normalStagingLocations = stagingLocations.filter',
    'function warehouseLocationOptions(data, warehouseOrCode',
    "batch: controls.batchTracked && preserveGeneratedBatch ? String(existingProduct?.batch || '').trim() : '',",
    'function normalizePurchaseInboundAllocations(data, receipt, requestedAllocations)',
    'function hydratePurchaseAfterSaleRemedyPlannedQuantities(data)',
    "if (sourceType === 'purchase_after_sale')",
    'product.batch = materialUsesBatchTracking(data, product)',
    "if (task.kind === '异常暂存退回')",
    'incomingQualityRuleRequiresInspection(incomingQualityControl)',
    'locationOptions: warehouseLocationOptions(data, row)',
    '请从库位列表选择。',
    "randomBytes(4).toString('hex')}.tmp",
  ]);
  expectIncludesAll('scripts/smoke-warehouse.mjs', [
    'USER-BATCH-MUST-BE-IGNORED',
    'arrival result generated inventory batches before formal inbound',
    'arrival rejection did not create a linked purchase after-sale record',
    'purchase remedy receipt accepted more than its frozen remedy plan',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 185. 采购入库、到货拒收与售后衔接合同（2026-07-28）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 164. 采购入库任务、拒收与可重复入库事实（2026-07-28）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 184. 采购暂存、库位、批次与来料检验合同（2026-07-28）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 163. 采购收货库位、批次与质检派生事实（2026-07-28）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 52. 采购收货暂存、库位、批次与视觉复查（2026-07-28）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 213. 采购入库现场登记与详情动作弹窗（2026-07-31）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 189. 采购到货现场位置、操作人与动作命令事实（2026-07-31）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 81. 采购入库详情与现场登记重构（2026-07-31）');
});

run('five-module prototype freeze stays aligned with the database implementation gate', () => {
  expectIncludesAll('docs/erp-web-final-freeze-database-blueprint.md', [
    '# Filatrix ERP Web 五模块原型冻结与数据库实施蓝图',
    '## 8. 关键唯一约束',
    '## 9. 必须事务化的命令',
    '## 12. 数据库开工门禁',
    '`/api/finance/**`',
    '`/api/production/material-requests/:code/accept`',
    '`/api/sales/outbound-requests`',
    '`clientWidth = scrollWidth = 740`',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 192. 五模块原型最终冻结与数据库实施入口（2026-07-28）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 171. 五模块数据库事实域、事务与迁移门禁（2026-07-28）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 60. 五模块最终冻结与数据库蓝图启动（2026-07-28）');
  expectIncludesAll('src/components/DocumentFactGrid.vue', [
    'const mobileFullIndex = run.length % 2 === 1 ? run.length - 1 : -1;',
    '.document-fact-item:not(.is-full).is-mobile-full {',
  ]);
  expectExcludes('src/views/Production2View.vue', ['Printer', '打印当前', 'PDF']);
  expectExcludes('src/views/QualityDocumentEditorView.vue', ['Printer', '打印当前', 'PDF']);
});

run('sales purchase and warehouse real-operation audit keeps business actions, projections, and unsaved baselines aligned', () => {
  expectIncludesAll('server/index.mjs', [
    'const inboundAllocations = Array.isArray(body.inboundAllocations)',
    'body.inboundAllocations === undefined',
    'function purchaseAfterSaleRemedyReceipt(data, record)',
    'function purchaseAfterSaleRemedyReceiptComplete(receipt)',
    'remedyReceipt && !purchaseAfterSaleRemedyReceiptComplete(remedyReceipt)',
    "if (!toLocation) throw requestError(400, '请选择调入仓库中的目标库位。');",
    'data.warehouse.inventory.find((row) => row.key === line.targetInventoryKey)?.location',
    '售后受理后不能更改实物流向或商务调整',
    '采购售后受理后，补救方案、实物流向、商务调整和预计金额均被冻结',
    "title: '新的采购待收货任务'",
    '`/purchase/orders/${encodeURIComponent(receipt.sourceDoc)}/follow-up`',
    '`/sales/orders/${encodeURIComponent(issue.sourceOrder)}/delivery`',
    "parts[2] === 'purchase-receipts' && result.record.sourceDoc",
    "parts[2] === 'sales-issues' && result.record.sourceOrder",
  ]);
  expectExcludes('server/index.mjs', [
    'sourcePath: `/sales/outbound-requests/${encodeURIComponent(code)}`',
    'sourcePath: `/warehouse/sales-issues/${encodeURIComponent(code)}`',
  ]);
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    "fullyRefusedAtArrival ? '未送检（到货拒收）' : '未送检（无正常接收）'",
    "? '仓库当场拒收'",
    "? '未生成质检任务'",
    'purchaseReceiptInboundStateLabel({',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    "[/采购.*正式入库/, '采购入库']",
  ]);
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    "{ 'field-span-2': !isDetail }",
    '{{ transferTargetLocationDisplay }}',
    'productionReceiptTargetLocationOptions',
  ]);
  expectIncludesAll('scripts/smoke-api.mjs', [
    'warehouse sales issue notification was not created with an executable task path',
    'warehouse should receive NOTICE-ORDER-CONFIRMED with the generated receipt task path',
  ]);
  expectIncludesAll('scripts/smoke-warehouse.mjs', [
    'purchase inbound notification did not return purchase to the source-order follow-up page',
    'purchase reversal notification did not return purchase to the source-order follow-up page',
    'sales outbound notification did not return sales to the source-order delivery page',
    'sales reversal notification did not return sales to the source-order delivery page',
  ]);
  expectOrdered('src/views/PurchaseOrderEditorView.vue', [
    "if (/开票|发票|收票/.test(step) || ['已入库', '待开票'].includes(status))",
    "if (/付款/.test(step) || status === '待付款')",
    "if (/收货|入库/.test(step) || ['已确认', '待入库', '部分入库'].includes(status))",
  ], 'purchase next-step fact priority');
  expectExcludes('src/views/PurchaseOrderEditorView.vue', ['参考号']);
  expectExcludes('src/views/SalesOrderEditorView.vue', ['参考号']);
  expectIncludesAll('src/views/AfterSalesDocumentView.vue', [
    '<dt>商务调整</dt>',
    '<span>商务调整</span>',
    'hasIncompleteRemedyReceipt.value && record.value.remedyReceipt',
    "hasIncompleteExecutionWork.value ? '等待协同' : statusAction.value.label",
  ]);

  const unsavedBaselineViews = [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
  ];
  for (const relativePath of unsavedBaselineViews) {
    const resetCount = read(relativePath).match(/resetUnsavedChanges\(\)/g)?.length || 0;
    assert(resetCount >= 2, `${relativePath} should reset the unsaved baseline after successful business actions`);
  }

  expectIncludesAll('docs/erp-web-sales-purchase-warehouse-full-page-audit-2026-07-29.md', [
    '# Filatrix ERP Web 销售、采购、仓库逐页实跑审计（2026-07-29）',
    '## 3. 真实业务样本',
    '## 4. 本轮发现并修复',
    '## 5. 弹窗验收合同',
    '## 6. 视觉与响应式结论',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 193. 销售、采购、仓库逐页实跑复核（2026-07-29）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 172. 三模块实跑后的派生事实与交接门槛（2026-07-29）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 61. 销售、采购、仓库逐页实跑收口（2026-07-29）');
});

run('third-round transaction audit keeps actions, dates, related records, and warehouse actors truthful', () => {
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    "const deliveryReady = progress",
    "? progress === '待签收'",
    "label: '出库任务'",
    '<h2>出库任务与记录</h2>',
  ]);
  expectIncludesAll('src/components/CommercialFollowUpPanel.vue', [
    "if (occurredOn.value > today()) return '业务日期不能晚于今天。';",
    ':max="today()"',
  ]);
  expectIncludesAll('src/views/PurchaseRequisitionEditorView.vue', [
    "'采购需求日期'",
    '来源需求日 ${draft.sourceExpectedDate}',
    '生成时已逾期',
  ]);
  expectIncludesAll('src/views/PurchaseView.vue', ['预计到货']);
  expectIncludesAll('server/index.mjs', [
    "if (occurredOn > shanghaiDate()) throw requestError(400, '业务日期不能晚于今天。');",
    'function purchaseAfterSaleRelatedDocuments(data, record, order, remedyReceipt)',
    'function hydrateWarehouseExecutionActors(data)',
    'function hydrateGeneratedPurchaseRequisitionDates(data)',
    'sourceExpectedDate,',
    'const result = applyWarehouseReversal(data, parts[2], code, body, businessActorName(req, data));',
    "['待检', '待入库', '异常受控'].includes(balanceFact)",
  ]);
  expectIncludesAll('scripts/smoke-warehouse.mjs', [
    'sales issue posting did not record the authenticated warehouse operator',
    'warehouse reversal trusted a client-supplied actor',
  ]);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    'generated purchase requisition lost the overdue source demand date',
    'generated purchase requisition retained an impossible demand date',
  ]);
});

run('fourth-round inventory audit preserves physical partitions, staging ownership, and traceable transitions', () => {
  expectIncludesAll('src/types/business.ts', [
    'rejectedHold?: string;',
    'exceptionHold?: string;',
    'rejectedHoldNumber?: number;',
    'exceptionHoldNumber?: number;',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    '不合格隔离',
    '异常暂存',
    "{ label: '不合格隔离', value: row.rejectedHold, tone: 'danger' }",
    "{ label: '异常暂存', value: row.exceptionHold, tone: 'danger' }",
    'warehouse.rejectedHold',
    'warehouse.exceptionHold',
    'const structuredMovementTypes = [',
    "'采购到货',",
    "'质检冻结',",
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.inventory-control-summary {',
    '.inventory-control-summary span.tone-danger {',
    '.inventory-detail-judgement.status-danger,',
  ]);
  expectIncludesAll('server/index.mjs', [
    'const persistedSnapshot = JSON.stringify(persistedData);',
    'function hydratePurchaseReceiptLedgerTransitions(data)',
    'function hydratePurchaseAfterSaleSourceFacts(data)',
    'function purchasePendingInboundQtyForWarehouse(data, warehouseCode, materialCode)',
    "'采购到货': ['物理在库', 'onHandNumber', 'onHand']",
    "'质检解冻': ['待检', 'qcHoldNumber', 'qcHold']",
    "'待入库转出': ['待入库', 'pendingInboundNumber', 'pendingInbound']",
    "'不合格隔离': ['不合格隔离', 'rejectedHoldNumber', 'rejectedHold']",
    "warehouse: source.warehouse || receipt?.warehouse || (receipt ? '采购暂存区' : ''),",
  ]);
  expectIncludesAll('scripts/smoke-warehouse.mjs', [
    'inventory physical quantity is not fully partitioned by quality and inbound state',
    'read-only inventory request rewrote the persisted data file',
    'the same purchase batch was duplicated between staging and formal warehouses',
    'incoming quality read model exposed a second legacy name for the purchase staging area',
    'split formal inbound did not fully clear the pending-inbound stock ledger fact',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 196. 库存事实第四轮守恒校正（2026-07-29）');
  expectIncludes('docs/erp-web-business-fact-model.md', '### 172.8 采购暂存数量分区与流水闭环');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 64. 库存事实第四轮守恒复核（2026-07-29）');
  expectIncludes('docs/erp-web-sales-purchase-warehouse-full-page-audit-2026-07-29.md', '## 11. 第四轮库存事实与采购追溯复核补充');
});

run('six-module list status language uses one shared overview and quantitative progress only', () => {
  expectIncludesAll('src/components/ListStatusOverview.vue', [
    "import { statusPresentationClass } from '../utils/statusPresentation';",
    'class="list-status-overview"',
    'class="mini-status"',
    'role="progressbar"',
    'class="list-status-facts"',
    'class="list-status-next"',
  ]);
  for (const file of [
    'src/views/WarehouseView.vue',
    'src/views/Production2View.vue',
    'src/views/QualityView.vue',
  ]) {
    expectIncludesAll(file, [
      "import ListStatusOverview from '../components/ListStatusOverview.vue';",
      '<ListStatusOverview',
    ]);
  }
  expectIncludesAll('src/views/Production2View.vue', [
    "label: '完工入库'",
    ':progress="productionListStatusOverview(row).progress"',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    'production-progress-scan',
    'production-document-state',
  ]);
  expectExcludes('src/views/QualityView.vue', [
    'quality-progress-scan',
    'quality-document-state',
  ]);
});

run('seventh-round role status and page skeleton stay truthful', () => {
  expectIncludesAll('src/views/WarehouseView.vue', [
    "const compareDate = (a: T, b: T, direction: 'asc' | 'desc') => {",
    "if (firstMissing !== secondMissing) return firstMissing ? 1 : -1;",
    'purchaseReceiptQualityStateLabel({',
    'purchaseReceiptInboundStateLabel({',
    "const status = row.reversalCode ? '已冲销' : row.status;",
    "const nextStep = row.reversalCode",
  ]);
  expectIncludes('src/utils/statusPresentation.ts', '退回|拒收|驳回');
  expectExcludes('src/views/AfterSalesExecutionTaskView.vue', [
    '<main class="after-sales-task-layout">',
  ]);
  expectExcludes('src/views/ProductionWorkbenchDemoView.vue', [
    '<main class="schedule-line-board">',
    '<main class="workbench-site-left">',
    '<main class="workbench-demo-panel workbench-exception-main">',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 198. 仓库角色状态与页面骨架第七轮校正（2026-07-29）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 174. 仓库责任状态与未知日期排序事实（2026-07-29）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 66. 第七轮角色状态与页面语义复核（2026-07-29）');
  expectIncludes('docs/erp-web-six-module-five-round-audit-2026-07-29.md', '### 第七轮：仓库角色状态、排序与页面语义');
});

run('eighth-round production capacity and quality aging stay stable and actionable', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    'const productionInventoryLoading = ref(false);',
    'let productionInventoryLoadRequestId = 0;',
    'requestId === productionInventoryLoadRequestId',
    '先安排 ${qty(releasableQty, unit)}，余量待物料',
    "row.nextStep.includes('继续创建剩余工单')",
    "void router.push(taskChildDocumentLocation('work-orders', row.code));",
  ]);
  expectOrdered('src/views/Production2View.vue', [
    "if (buildStatus === '待建工单') return '创建生产工单';",
    'const releaseFacts = workOrders.map',
    'const sourceDocs = workOrders.map',
    "if (materialStatuses.includes('需采购'))",
  ], 'production task action priority');
  expectIncludesAll('src/views/QualityView.vue', [
    'const runtimeIncomingLoading = ref(true);',
    "activePage.value === 'incoming' && runtimeIncomingLoading.value",
    'function qualityStaleAttention(row: QualityListRow)',
    '未进入处置: 1,',
    ':attention="qualityStaleAttention(row)"',
    'class="quality-card-attention"',
  ]);
  expectIncludes('src/utils/statusPresentation.ts', '逾期|超期|滞留|阻断');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 199. 生产可安排量与质检滞留第八轮校正（2026-07-29）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 175. 部分可生产能力与质量任务滞留事实（2026-07-29）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 67. 第八轮生产与来料质检复核（2026-07-29）');
  expectIncludes('docs/erp-web-six-module-five-round-audit-2026-07-29.md', '### 第八轮：生产可安排量、异步稳定态与质检滞留');
});

run('ninth-round warehouse references, production loading, and quality due dates stay canonical', () => {
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    "receiptDetailProjection?.sourceOrderReceiving?.expectedDate || receiptDraft.expectedDate || '—'",
  ]);
  expectIncludesAll('src/views/AfterSalesExecutionTaskView.vue', [
    "listReference<WarehouseReferenceRaw>('warehouses'",
    'const selectedWarehouseLocationOptions = ref<string[]>([]);',
    "return '所选仓库未配置可用库位，请先维护仓库资料';",
    '请检查仓库职能、库位批次和可用数量。',
    'form.allocations',
    'allocationInventoryRow(allocation)',
  ]);
  expectExcludes('src/views/AfterSalesExecutionTaskView.vue', [
    'placeholder="例如 AS-01"',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function hydrateCanonicalWarehouseNames(data)',
    'const migratedIncomingQualityDueDates = hydrateIncomingQualityDueDates(data);',
    'function hydrateIncomingQualityDueDates(data)',
    'tasks: production.tasks,',
    'materialRequests: production.materialRequests,',
    'executionCards: refreshExecutionCards(data, production.executionCards),',
    'releaseBatches: production.workOrders.flatMap',
    'dueDate: receipt.date || shanghaiDate(),',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    'tasks?: AnyRecord[];',
    'materialRequests?: AnyRecord[];',
    'executionCards?: Production2ExecutionCard[];',
    'await loadPersistedWorkOrders();',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    'listProductionWorkOrderReleases,',
    'listProductionExecutionCards,',
    'Promise.all(persisted.map((order)',
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    "currentKind.value === 'incoming'",
    'function isCurrentQualityRecordLoad(requestId: number, kind: QualityTabKey, code: string)',
    'qualityRecordNotFound.value = error instanceof ApiError && error.status === 404;',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 200. 六模块逐页第九轮精查与事实校正（2026-07-29）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 176. 仓库引用、生产加载与质检时限事实（2026-07-29）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 68. 第九轮六模块逐页精查（2026-07-29）');
  expectIncludes('docs/erp-web-six-module-five-round-audit-2026-07-29.md', '### 第九轮：仓库引用、生产加载与质量时限');
});

run('tenth-round business actors, purchase staging references, and role-owned samples stay canonical', () => {
  expectIncludesAll('server/index.mjs', [
    'function businessActorDisplayName(value, fallback = \'\')',
    'completedBy: businessActorDisplayName(task.completedBy),',
    'const actor = businessActorName(req, data);',
  ]);
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    'const purchaseStagingWarehouseLoading = ref(true);',
    'let purchaseStagingWarehouseLoadRequestId = 0;',
    'requestId !== purchaseStagingWarehouseLoadRequestId',
    '正在读取当前公司的采购暂存仓……',
  ]);
  expectExcludes('server/data/erp-data.json', [
    '财务先暂停付款',
    '"inspector": "赵敏"',
  ]);
  expectIncludesAll('scripts/smoke-after-sales.mjs', [
    'after-sales business projection exposed a technical account code',
    'after-sales closed-loop projection exposed technical account codes',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 201. 六模块逐页第十轮角色投影与引用稳定态（2026-07-29）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 177. 业务人员投影、采购暂存引用与样本角色事实（2026-07-29）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 69. 第十轮六模块角色与引用稳定态复核（2026-07-29）');
  expectIncludes('docs/erp-web-six-module-five-round-audit-2026-07-29.md', '### 第十轮：角色投影、采购暂存引用与测试样本');
});

run('eleventh-round confirmations, unsaved guards, and quality actions stay truthful', () => {
  expectIncludesAll('src/layouts/AppLayout.vue', ['ActionConfirmationHost', '<ActionConfirmationHost />']);
  expectIncludesAll('src/components/ActionConfirmationHost.vue', [
    'role="dialog"',
    'aria-modal="true"',
    'useActionConfirmationHost',
    'useDialogFocus',
    '@click.self="cancelAction"',
    '@keydown.esc.stop="cancelAction"',
  ]);
  expectIncludesAll('src/composables/useUnsavedChangesGuard.ts', [
    'requestActionConfirmation({',
    "title: '离开当前页面？'",
    "confirmLabel: '离开页面'",
  ]);
  expectExcludes('src/composables/useUnsavedChangesGuard.ts', ['window.confirm']);
  expectIncludesAll('src/views/QualityStandardEditorView.vue', [
    'useUnsavedChangesGuard(',
    'resetUnsavedChanges',
    'requestActionConfirmation({',
  ]);
  expectExcludes('src/views/QualityStandardEditorView.vue', ['qualityStandardRows', 'window.confirm']);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    "key: 'change'",
    'response.flowRecords',
    'localFlowRecords.value',
  ]);
  expectExcludes('src/views/QualityDocumentEditorView.vue', [
    "key: 'exception'",
    "key: 'void'",
    '当前会话',
    '正式系统',
    'window.confirm',
  ]);
  expectExcludes('src/views/Production2View.vue', ['操作已记录', 'window.confirm']);
  for (const file of [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
    'src/views/MasterCustomerEditorView.vue',
    'src/views/MasterSupplierEditorView.vue',
    'src/views/MasterSimpleEditorView.vue',
    'src/views/MasterMaterialEditorView.vue',
    'src/views/MasterWarehouseEditorView.vue',
  ]) {
    expectIncludes(file, 'requestActionConfirmation');
    expectExcludes(file, ['window.confirm']);
  }
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 202. 第十一轮动作真实性与统一确认框校正（2026-07-29）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 178. 确认、未保存与质量任务动作事实（2026-07-29）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 70. 第十一轮真实动作与确认框复核（2026-07-29）');
  expectIncludes('docs/erp-web-six-module-five-round-audit-2026-07-29.md', '### 第十一轮：动作真实性、未保存保护与确认框');
});

run('twelfth-round terminal locks, failure states, and duplicate-action guards stay consistent', () => {
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    'if (isLocked.value) return `${documentTitle.value}只读`;',
    'button class="secondary-action" type="button" disabled title="单据已锁定，不能继续编辑"',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    "import DocumentLoadState from '../components/DocumentLoadState.vue';",
    "const productionRuntimeDataError = ref('');",
    'if (!response.ok) throw new Error(`生产运行数据加载失败：${response.status}`);',
    'async function retryProductionRuntimeData()',
    'v-else-if="isProductionDocumentPage && productionRuntimeErrorApplies"',
    ':message="`${activeListTitle}不存在`"',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    '<section v-else-if="isProductionDocumentPage" class="form-section quote-empty-state">',
    'The prototype remains usable with local seed data while the API is unavailable.',
  ]);
  for (const file of [
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOrderEditorView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
  ]) {
    expectIncludes(file, 'useAsyncActionState');
  }
  expectIncludesAll('scripts/smoke-api.mjs', [
    'sales cannot confirm quote twice',
    'sales cannot confirm order twice',
    'purchase cannot submit requisition twice',
    'purchase cannot confirm order twice',
    'warehouse submit other move twice is idempotent',
    'warehouse post other move twice is idempotent',
    'repeatedSubmit.repeated !== true',
    'repeatedPost.repeated !== true',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 203. 第十二轮权限、终态与失败恢复校正（2026-07-30）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 179. 终态锁定、失败显式化与重复命令事实（2026-07-30）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 71. 第十二轮异常状态矩阵复核（2026-07-30）');
  expectIncludes('docs/erp-web-six-module-five-round-audit-2026-07-29.md', '### 第十二轮：权限、终态、失败恢复与重复命令');
});

run('thirteenth-round runtime truth, role links, locations, and planning concurrency stay aligned', () => {
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    "import DocumentLoadState from '../components/DocumentLoadState.vue';",
    'const qualityCreateInstanceToken = ref(\'\');',
    'return `${kind}:create:${qualityCreateInstanceToken.value}`;',
    '<DocumentLoadState',
  ]);
  expectIncludesAll('src/views/QualityView.vue', [
    ':loading-message="runtimeLoadingMessage"',
    'currentRuntimeLoadedAt',
    'currentRuntimeError',
  ]);
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    'const workbenchRuntimeLoading = ref(true);',
    'const workbenchRuntimeError = ref(\'\');',
    '当前显示上次成功快照',
    'workbenchWriteActionsDisabled',
  ]);
  expectIncludesAll('src/views/MasterSimpleEditorView.vue', [
    'delete equipmentRecord.sourcePurchase',
    "if (isLoading.value) return '正在加载关联资料，请稍候';",
  ]);
  expectIncludesAll('src/views/ModuleView.vue', [
    'function salesOrderCodeFromShipmentTrackingLog',
    'function businessRecordLocationForLog',
    "if (code.startsWith('SR-')) return undefined;",
  ]);
  expectIncludesAll('server/index.mjs', [
    'function productionPlanningCommandReplay',
    'data.production.planningCommands ||= [];',
    'function purchaseReceiptPostedQty',
    "throw requestError(400, '请选择成品入库仓中的目标库位。');",
    'function normalizeLegacyFinanceAfterSalesNotification',
  ]);
  expectIncludesAll('package.json', [
    '"smoke:production-planning-concurrency"',
    '"smoke:notification-migration"',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 204. 第十三轮多 Agent 事实真实性与角色链路校正（2026-07-30）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 180. 运行快照、库存执行与角色通知事实（2026-07-30）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 72. 第十三轮多 Agent 交叉审计与事实修复（2026-07-30）');
  expectIncludes('docs/erp-web-six-module-five-round-audit-2026-07-29.md', '### 第十三轮：多 Agent 事实真实性、角色链接与并发');
});

run('equipment inspection responsibility changes are explicit and historical task snapshots stay frozen', () => {
  expectIncludesAll('src/views/EquipmentInspectionEditorView.vue', [
    '负责人变更会同步尚未开始的待巡检任务',
    '当前未完成任务',
    '保留原设备、标准和时限',
    'function taskEventValue',
    "label: abnormalCompletion ? '异常关闭' : '完成记录'",
    "label: '取消记录'",
    'response.reassignedTaskCount',
    '取消本次巡检任务',
    'cancelDialogOpen',
    '保存标准新修订 R',
    '当前没有需要保存的修改',
    '当前标准修订',
    '执行标准',
    '当前可分步维护并保存',
    'equipment-empty-items',
    'items: [],',
    'response.unchanged',
    'const currentPlanTask = computed',
    '首次计划日期（已冻结）',
    '内容变更后升至 R',
    '无变化不升版',
    'task.status === \'巡检中\' && canWrite',
    'inspection-readonly-value',
    '<h2>引用计划</h2>',
    '/master-data/equipment/',
  ]);
  expectIncludesAll('src/views/EquipmentInspectionView.vue', [
    "record.status === '已取消'",
    "? '未执行'",
    'record.cancelReason,',
    'activePlanCount',
    'record.standardRevision',
    'incompleteItemCount',
    'const taskRecords = ref<EquipmentInspectionTask[]>([]);',
    "['待巡检', '巡检中', '异常处理中'].includes(task.status)",
    "activePage === 'inspection-plans' ? '任务日期'",
    "listEquipmentInspectionRecords('inspection-tasks')",
    "'计划状态 / 当前任务'",
    "'使用状态 / 引用'",
    "? '任务状态' : activePage.value === 'inspection-plans' ? '计划状态' : '使用状态'",
    "'计划状态优先' : '使用状态优先'",
    "'计划状态', '当前任务'",
    "'使用状态', '引用情况'",
    "? '计划负责人'",
    'attention: openTask',
    "? '当前任务' : '下次任务'",
    'currentTask: openTask',
    "'无未完成任务'",
    ':next-step-label="row.nextStepLabel"',
    "'计划负责人', '任务日期', '计划状态', '当前任务'",
  ]);
  expectExcludes('src/views/EquipmentInspectionEditorView.vue', [
    '巡检标准至少保留一个检查项目',
    ':disabled="standard.items.length <= 1"',
  ]);
  expectIncludesAll('src/data/equipment.ts', [
    'standardRevision: number;',
    'cancelReason: string;',
    'retainedTask?: EquipmentInspectionTask | null;',
    'reassignedTaskCount?: number;',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function equipmentInspectionTaskIsOpen',
    'function reassignPendingEquipmentInspectionTasks',
    "task.status === '待巡检'",
    "'改派巡检任务'",
    "'取消巡检任务'",
    '继续承接未完成任务',
    'function assertEquipmentInspectionResponsibilityContinuity',
    'function assertEmployeeHasNoOpenEquipmentInspectionResponsibility',
    'if (!task.dueAt && plan)',
    'function normalizeEquipmentInspectionTaskResults',
    '巡检项目数量与任务生成时冻结的标准不一致',
    '已偏离冻结标准',
    'function equipmentInspectionEditableSignature',
    "allowIncomplete: status !== '启用'",
    'unchanged: true',
  ]);
  expectExcludes('server/index.mjs', [
    ")) || employees.find((row) => row.code === plan?.ownerEmployeeCode) || defaultOwner;",
  ]);
  expectIncludesAll('scripts/smoke-equipment-inspection.mjs', [
    'pending task did not follow the explicit plan owner reassignment',
    'generated task deadline was rewritten by a later plan time-window change',
    'in-progress task lost its original responsibility snapshot',
    'account responsibility guard returned an unclear error',
    'role permission continuity guard returned an unclear error',
    'reactivated plan created a duplicate unfinished task',
    'stopped-plan task cancellation did not preserve a complete cancellation fact',
    'task submissions cannot delete or rewrite frozen standard inspection facts',
    'standard inspection item names and stable line ids remain unique',
    'draft standards preserve incomplete work and enforce completeness only when enabled',
    'unchanged saves do not create empty standard or plan revisions',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 206. 设备巡检第七轮责任承接与任务快照校正（2026-07-30）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 207. 设备巡检第八轮停启计划与单次任务取消（2026-07-30）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 182. 设备巡检责任连续性与改派事实（2026-07-30）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 183. 巡检任务取消与计划恢复事实（2026-07-30）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 74. 设备巡检第七轮责任承接复核（2026-07-30）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 75. 设备巡检第八轮停启与取消复核（2026-07-30）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 208. 设备巡检第九轮标准修订与任务快照完整性（2026-07-30）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 184. 巡检标准修订与冻结检查项事实（2026-07-30）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 76. 设备巡检第九轮标准修订与快照复核（2026-07-30）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 209. 设备巡检第十轮标准草稿与启用门禁（2026-07-30）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 185. 巡检标准草稿完备度与空写事实（2026-07-30）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 77. 设备巡检第十轮草稿生命周期复核（2026-07-30）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 339. 设备巡检当前任务与历史记录展示收口（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 312. 设备巡检当前任务、只读记录与引用投影合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 201. 设备巡检当前任务与历史展示第十一轮复核（2026-08-05）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 341. 设备巡检执行人证据与计划变更影响收口（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 314. 巡检动作证据与计划当前任务影响投影合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 203. 设备巡检动作证据与计划影响第十三轮复核（2026-08-05）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 342. 停用巡检计划的未完成任务与列表责任字段收口（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 315. 巡检计划状态、当前任务与责任人投影合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 204. 巡检计划当前任务可见性第十四轮复核（2026-08-05）');
});

run('purchase inbound plan, actual, scope, and posting facts stay separated', () => {
  expectIncludesAll('server/index.mjs', [
    'plannedQty: formatQty(remainingQty, enriched.uom)',
    'qty: formatQty(0, enriched.uom)',
    'arrivalQty: formatQty(0, enriched.uom)',
    'receipt.arrivalDraftSavedAt = shanghaiDateTime();',
    '实际到货日期不能晚于今天。',
    'materialCandidates.length > 1',
    'row.sourceLineId && row.sourceLineId === resolvedSourceLineId',
    'submittedAt: receipt.arrivalResult?.submittedAt || \'\'',
  ]);
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    '<h2>任务概览</h2>',
    '<h2>到货与入库进度</h2>',
    '<h2>到货记录</h2>',
    '<h2>入库记录</h2>',
    'receiptInboundAvailableLineCount',
    '{{ receiptInboundAvailableLineCount }} 种物料',
    'receipt-source-links',
    "receiptRequiredFieldClass('实际到货日期')",
    '预计到货日期',
    'sourceOrderReceiving',
    'record.receiptCode',
    'normalizeReceiptDetailProjection(response.detailProjection)',
    '<span>采购入库任务号</span>',
    'record.receiptCode !== receiptDraft.code',
    '<dt>来源任务</dt>',
    'class="quote-fields receipt-overview-fields"',
    '原订单到货方式',
    '计划暂存仓',
    'receipt-overview-address',
    '<span>内部收货联系人</span>',
    '<span>内部收货电话</span>',
    'class="purchase-inbound-material-plan"',
    'class="receipt-record-grid receipt-record-primary-grid is-arrival"',
    'class="receipt-record-grid receipt-record-secondary-grid is-arrival"',
    'class="receipt-record-grid receipt-record-primary-grid is-inbound"',
    'class="receipt-record-grid receipt-record-secondary-grid is-inbound"',
    'class="receipt-record-material-value"',
    'class="receipt-record-entry is-arrival"',
    'class="receipt-record-entry is-inbound"',
    '<dt>入库结果</dt>',
    '<dt>正式仓库</dt>',
    '<dt>入库库位</dt>',
    '<dt>累计到货</dt>',
    '<dt>待到货</dt>',
    '<dt>待入库</dt>',
    '剩余可分配',
    "quantity: ''",
    '原订单预计到货',
    '<dt>实际到货日期</dt>',
    '<dt>到货登记人</dt>',
    'posting.reversalCode',
    '已由 {{ posting.reversalCode }} 冲销',
    '<i v-else class="mini-status status-done">有效过账</i>',
    'receipt-record-empty',
    "label: '到货状态'",
    "label: '质检状态'",
    "label: '入库状态'",
    "label: '到货异常'",
    'purchaseReceiptQualityStateLabel',
    'purchaseReceiptInboundStateLabel',
    'inboundAllocationProduct(line.receiptLineId)?.model',
    'inboundAllocationProduct(line.receiptLineId)?.spec',
    'line.name || inboundAllocationProduct(line.receiptLineId)?.name',
    '<span>质检要求</span>',
    '<span class="required-label">本次入库数量</span>',
    '暂无随货附件',
    '拆分 {{ item.name',
  ]);
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', [
    'const isNew',
    'isDisplayDetail',
    '<h2>到货暂存与交接</h2>',
    'class="receipt-task-context"',
    '<dt>该次可入库</dt>',
    'receiptInboundAvailableTotal',
    '历史正式入库结果',
    'v-if="!isDisplayDetail"',
    '<span>到货登记人</span>',
    'purchaseInboundScopeLabel',
    'receiptOwnerDisplay',
    'receiptNextStepGuidance',
    'receipt-next-step-strip',
    'receiptLineMaximumText',
    'purchaseInboundHasOtherTaskOpportunity',
    'purchaseInboundStageLabel',
    'purchase-inbound-stage-chips',
    'line.statuses',
    '同范围其他任务待入库',
    'record.status',
    'line.qualityStatus',
    'line.inboundStatus',
    'purchaseArrivalScopeBadge',
    'receiptPostingCount',
    '{{ purchaseArrivalRecords.length }} 次',
    '<i class="mini-status status-muted">当前任务</i>',
    '次有效过账',
    '次已冲销',
    '建议暂存至',
    'receipt-record-stage-chips',
    'receipt-record-quantity-list',
    'receipt-record-primary-fact',
    'receipt-record-destination',
    'receipt-record-line is-arrival',
    'receipt-record-fact-grid',
    'receipt-record-meta-grid',
    'receipt-record-product',
    'encodeURIComponent(record.code)',
    '<span class="receipt-record-kind">采购入库任务</span>',
    '本任务有可入库数量',
    '当前采购入库任务状态与进度',
    "return available > 0 ? '可入库' : '未入库';",
    "return '无异常';",
    '核对本次实际到货并选择真实暂存位置',
    '从所选暂存仓的正常库位中选择，不再固定单一库位。',
    '>保存填写内容<',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.receipt-source-links',
    '.purchase-inbound-summary-groups dl {\n  grid-template-columns: repeat(2, minmax(0, 1fr));',
    '.purchase-inbound-summary-groups > section:first-child dl {\n  grid-template-columns: repeat(3, minmax(0, 1fr));',
    '.receipt-record-card',
    '.receipt-record-grid',
    '.receipt-record-primary-grid.is-arrival',
    '.receipt-record-primary-grid.is-inbound',
    '.receipt-record-secondary-grid.is-arrival',
    '.receipt-record-secondary-grid.is-inbound',
    '.receipt-record-material-value',
    '.receipt-record-entry.is-arrival',
    '.receipt-record-entry.is-inbound',
    '.receipt-record-secondary-grid {\n  border-top:',
    '.receipt-record-empty',
    '.purchase-receipt-editor.is-detail-view .quote-summary-panel {',
    '.receipt-arrival-line-actions {\n    grid-column: 1 / -1;',
    '@media (min-width: 641px) and (max-width: 760px)',
    '.purchase-receipt-editor.is-detail-view .quote-fields',
  ]);
  expectIncludesAll('server/index.mjs', [
    'sourceOrderReceiving: {',
    'receiptCode: receipt.code',
    "name: product.name || product.materialCode || '物料'",
    "model: product.model || ''",
    "spec: product.spec || ''",
    "receivingAddress: order?.receivingAddress || ''",
    "receivingContact: order?.receivingContact || ''",
    "receivingPhone: order?.receivingPhone || ''",
  ]);
  expectIncludesAll('src/utils/purchaseReceiptState.ts', [
    'export function purchaseReceiptArrivalStateLabel',
    'export function purchaseReceiptQualityStateLabel',
    'export function purchaseReceiptInboundStateLabel',
    'export function purchaseReceiptArrivalExceptionLabel',
    "if (input.released > quantityEpsilon) return '部分放行';",
    "if (input.available > quantityEpsilon) return '待入库';",
  ]);
  expectIncludesAll('scripts/smoke-warehouse.mjs', [
    'pending receipt task fabricated a PETG actual arrival quantity',
    'pending receipt with a future actual arrival date was confirmed',
    'receipt reversal did not mark historical inbound postings as reversed',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 216. 采购入库计划、实际、范围与过账状态最终收口（2026-07-31）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 192. 采购入库计划—实际、稳定来源行与有效过账合同（2026-07-31）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 84. 采购入库计划与实际数量最终校正（2026-07-31）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 217. 采购入库详情记录层级与字段降噪（2026-07-31）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 193. 采购入库累计总计、到货事件与入库过账读模型（2026-07-31）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 85. 采购入库详情记录层级与字段降噪（2026-07-31）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 218. 采购入库逐字段与视觉复核（2026-07-31）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 194. 采购入库字段显示、混合单位与状态色合同（2026-07-31）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 86. 采购入库逐字段与视觉复核（2026-07-31）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 219. 采购入库任务、来源约定与记录视觉统一（2026-07-31）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 195. 采购入库任务概览与记录呈现合同（2026-07-31）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 87. 采购入库任务事实与记录视觉统一（2026-07-31）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 220. 采购入库范围标识与详情密度收口（2026-07-31）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 196. 采购入库记录范围与动作提示归属（2026-07-31）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 88. 采购入库整体复核与末轮降噪（2026-07-31）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 221. 采购入库字段语义与动作弹窗降噪（2026-07-31）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 197. 采购入库字段标签与限制提示呈现合同（2026-07-31）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 89. 采购入库全字段复核与弹窗降噪（2026-07-31）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 227. 采购入库概览与记录双层事实格（2026-07-31）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 203. 采购入库独立概览事实与记录双层投影（2026-07-31）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 95. 采购入库概览与记录双层重排（2026-07-31）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 230. 采购入库列表字段与扫描层级收口（2026-07-31）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 206. 采购入库列表行投影合同（2026-07-31）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 98. 采购入库列表字段与视觉收口（2026-07-31）');
});

run('after-sales execution requires start, real return batches, valid destinations, and concise task facts', () => {
  expectIncludesAll('server/index.mjs', [
    "if (task.status !== '处理中')",
    'function normalizeAfterSalesReceiptAllocations(data, task, body)',
    'function requireAfterSalesWarehouse(data, task, body, functionName, label)',
    'function requireAfterSalesLocation(data, warehouse, rawLocation, label)',
    'function afterSalesHistoricalExecutionRecords(data, task, currentRecords = [])',
    "task.module !== '仓库' || task.status !== '已完成'",
    "task.direction === '出库' ? parsedQuantity < 0 : parsedQuantity > 0",
    'historicalProjection: true',
    'receiptAllocations: cloneJson(authoritativeTask.receiptAllocations || [], [])',
    'const actualDate = String(body.actualDate || shanghaiDate()).trim();',
    'function afterSalesProductIdentityProjection(data, kind, sourceOrderCode, products)',
    "model: product.model || source.model || '',",
    "spec: product.spec || source.spec || '',",
    "imageLabel: product.imageLabel || source.imageLabel || '',",
    "imageTone: product.imageTone || source.imageTone || '',",
  ]);
  expectIncludesAll('src/views/AfterSalesDocumentView.vue', [
    "import MaterialIdentity from '../components/MaterialIdentity.vue';",
    ':code="product.materialCode"',
    ':model="product.model"',
    ':spec="product.spec"',
    'function afterSalesMaterialVisual(product:',
    ':image-label="afterSalesMaterialVisual(product).label"',
    ':image-tone="afterSalesMaterialVisual(product).tone"',
  ]);
  expectIncludesAll('scripts/smoke-after-sales.mjs', [
    'legacy after-sales task did not recover its frozen identity and batch control from the source order line',
    'legacy after-sales document did not recover its frozen material identity',
  ]);
  expectIncludesAll('src/views/AfterSalesExecutionTaskView.vue', [
    'const usesReceiptBatchAllocation = computed',
    '退回实物批次',
    '<div class="section-heading"><h2>任务物料</h2></div>',
    '<span>公司</span>',
    '{{ actualDateLabel }}',
    'return afterSalesBatchLabel(actualBatch, task.value?.code, emptyLabel);',
    'function recordResultLabel(line: ExecutionRecordLine)',
    "task.value?.status === '已完成' && !task.value.startedAt",
    "销售退货检验: '登记检验结果'",
    "售后返修或返工: '登记返修结果'",
    'const unstartedRecordDescription = computed',
    'const taskKindLabel = computed',
    'const evidencePlaceholder = computed',
    'const attachmentPrompt = computed',
    'const completionSuccessMessage = computed',
    'function receiptAllocatedQuantity(product: SalesAfterSaleProduct)',
    'function receiptRegisteredQuantity(product: SalesAfterSaleProduct)',
    'const validationAttempted = ref(false)',
    'function focusFirstRegistrationError()',
    'class="receipt-dialog-section warehouse-dialog-operation-section"',
    'class="receipt-dialog-section warehouse-dialog-result-section"',
    'function visibleRecordEvidence(record: AfterSalesExecutionRecord)',
    'function predecessorTaskPath(candidate:',
    "return '已完成退货出库';",
    "tone: task.value?.status === '已完成' ? 'success' : 'warning',",
    "tone: task.value?.startedAt ? 'success' : 'warning',",
    'const predecessorDisposition = computed',
    "{{ isProductionTask ? '返修依据' : '售后处理依据' }}",
    "isProductionTask ? '当前实物状态' : '实物安排'",
    'class="form-section after-sales-material-section"',
    '请先选择${warehouseLabel}',
    ':title="taskPageTitle"',
    ':back-label="backListLabel"',
    'function afterSalesTaskMaterialVisual(product: SalesAfterSaleProduct)',
    ':image-tone="afterSalesTaskMaterialVisual(product).tone"',
  ]);
  expectIncludesAll('src/views/AfterSalesExecutionListView.vue', [
    "if (task.status === '已完成') return task.actualDate",
    "if (task.status === '已完成') return task.completedBy || '';",
    "if (task.status === '处理中') return task.startedBy || '';",
    "if (task.status !== '已完成') return '结果未登记';",
    'const totals = new Map<string, number>();',
    'totals.set(unit, (totals.get(unit) || 0) + quantityNumber(product.qty));',
    'taskQuantitySummary(task)',
    '物料 / 任务数量',
    'filter-date-label="生成 / 开始 / 实际日期"',
    'min-width: 748px;',
  ]);
  expectExcludes('src/views/AfterSalesExecutionListView.vue', [
    'task.completedBy || pageConfig.value.owner',
    "Number(product.qty) || 0",
    'filter-date-label="作业日期"',
  ]);
  expectExcludes('src/views/AfterSalesExecutionTaskView.vue', [
    '<span>售后来源</span>',
    '<h2>作业任务进度</h2>',
    'after-sales-progress-track',
    'taskProductProgress',
    "return batch || '无需批次';",
    "|| '按来源库存执行'",
    "<p>{{ afterSale.goodsDisposition || '—' }}</p>",
    'function materialBadge(',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    'function afterSalesPendingPredecessorLabel(row: AfterSalesExecutionTask)',
    'function afterSalesWarehouseActionLabel(kind: string)',
    "if (row.status !== '已完成') return '';",
    "return '历史位置未登记';",
    "'after-sales-status-shell': activePage === 'afterSalesTasks'",
    "code: '售后作业任务号'",
    "party: '客户/供应商 / 来源单'",
    "item: '物料 / 当前任务数量'",
    "date: '作业日期'",
    '<strong>当前进度</strong>',
    '<small>任务 · 待办</small>',
    '.after-sales-status-shell .warehouse-operation-table .table-row',
    'height: 88px;',
    'itemQuantity: quantitySummary ? `任务 ${quantitySummary}` : \'\'',
    "cardValue: quantitySummary ? `任务 ${quantitySummary}` : '—'",
    '.after-sales-status-shell .operation-quantity',
    'if (!uniquePositions.length) {',
    'addPosition(row.warehouse, row.location);',
    'function stockLedgerBatchLabel(row: StockLedgerRow)',
    'function inventoryDetailBatchLabel(detail: WarehouseInventoryDetailRow)',
    "if (/^WAS-/.test(code)) return `/warehouse/after-sales/${encodeURIComponent(code)}`;",
    "[/售后收货待检/, '售后收货待检']",
    "[/采购退货出库/, '采购退货出库']",
  ]);
  expectIncludesAll('src/utils/afterSalesBatch.ts', [
    'export function isLegacyAfterSalesGeneratedBatch',
    "return isLegacyAfterSalesGeneratedBatch(value, taskCode) ? '历史批次未登记' : value;",
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 244. 售后作业开始门禁、退货批次与单据去噪（2026-08-01）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 218. 售后作业开始、退货批次与目标位置合同（2026-08-01）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 117. 售后作业门禁、真实退货批次与详情去噪（2026-08-01）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 245. 售后任务列表与历史执行事实兼容（2026-08-01）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 219. 售后任务日期、人员与历史批次投影合同（2026-08-01）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 118. 售后任务列表与历史事实二次收口（2026-08-01）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 246. 售后执行列表可见性与登记语义收口（2026-08-01）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 220. 售后执行入口与空记录提示合同（2026-08-01）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 119. 售后执行列表与动作语义三次收口（2026-08-01）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 247. 仓库售后作业骨架与字段事实收口（2026-08-01）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 221. 仓库售后位置、记录与登记完成度投影合同（2026-08-01）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 120. 仓库售后作业全骨架复核（2026-08-01）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 248. 售后库存流水与历史批次投影统一（2026-08-01）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 222. 售后库存流水来源与批次展示合同（2026-08-01）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 121. 售后库存流水回链与历史批次清洗（2026-08-01）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 249. 售后列表任务数量与历史库存事实回填（2026-08-01）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 223. 售后任务数量与历史执行记录重建合同（2026-08-01）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 122. 售后任务数量提权与历史流水回填（2026-08-01）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 250. 售后作业详情层级与状态色语义收口（2026-08-01）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 224. 售后来源依据、实际事实与状态色合同（2026-08-01）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 123. 售后详情骨架与视觉语义收口（2026-08-01）');
  expectIncludesAll('server/index.mjs', [
    "const salesReturnQualityDisposition = String(record.salesReturnQualityDisposition || '').trim();",
    'const replacementOutboundTask = task(',
    "task('repair_production', '生产', '售后返修或返工'",
    "if (caseRecord && task.kind === '销售退货检验') caseRecord.salesReturnQualityDisposition = disposition;",
    'function restockRepairedSalesReturn(data, task, body)',
    'function purchaseAfterSalesSourceBatchKeys(data, record)',
    '不属于来源采购订单',
    ".filter((task) => task.status !== '已取消')",
  ]);
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', "task.value?.kind !== '采购退货出库'");
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 251. 售后商务方案、退回物质检与动态执行分支（2026-08-01）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 225. 销售退回物独立质检与动态任务图合同（2026-08-01）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 124. 售后质检独立分支与任务图优化（2026-08-01）');
  expectIncludesAll('src/components/MaterialIdentity.vue', [
    'class="material-identity"',
    'class="material-identity__thumb"',
    'class="material-identity__text"',
    "const meta = computed(() =>",
    "const badge = computed(() =>",
    '<small v-if="meta">{{ meta }}</small>',
  ]);
  for (const materialIdentityView of [
    'src/views/SalesOrderEditorView.vue',
    'src/views/SalesQuoteEditorView.vue',
    'src/views/SalesOutboundRequestView.vue',
    'src/views/PurchaseRequisitionEditorView.vue',
    'src/views/PurchaseOrderEditorView.vue',
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
    'src/views/WarehouseOperationEditorView.vue',
    'src/views/AfterSalesDocumentView.vue',
    'src/views/AfterSalesExecutionTaskView.vue',
  ]) {
    expectIncludesAll(materialIdentityView, [
      "import MaterialIdentity from '../components/MaterialIdentity.vue';",
      '<MaterialIdentity',
    ]);
  }
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    ':name="item.material.name"',
    ':name="row.material.name"',
    'class="order-delivery-issue-product-list"',
    ':name="product.name"',
  ]);
  expectExcludes('src/views/SalesOrderEditorView.vue', [
    '<strong>{{ item.product }}</strong>',
    'class="order-supply-product"',
    'deliveryRecordProductSummary',
  ]);
  expectExcludes('src/views/SalesQuoteEditorView.vue', [
    '<strong>{{ item.product }}</strong>',
  ]);
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    'type PurchaseProgressLine = PurchaseProgressFactLine & {',
    ':name="line.material.name"',
    ':name="item.material.name"',
  ]);
  expectExcludes('src/views/PurchaseOrderEditorView.vue', [
    '<strong>{{ item.material }}</strong>',
  ]);
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    'function stocktakeLineVisual',
    'class="stocktake-line-material"',
    ':model="line.model"',
    ':spec="line.spec"',
  ]);
  expectExcludes('src/views/WarehouseOperationEditorView.vue', [
    '<strong :title="line.item">{{ line.item }}</strong>',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function stocktakeMaterialIdentityProjection(data, stocktake)',
    'stocktake: stocktakeMaterialIdentityProjection(data, warehouse.stocktakes[index])',
    "model: line.model || material.model || '',",
    "spec: line.spec || material.spec || '',",
    "imageLabel: material.imageLabel || '',",
    "imageTone: material.imageTone || '',",
  ]);
  expectIncludesAll('src/types/business.ts', [
    'export type SalesAfterSaleProduct = {',
    'export type WarehouseStocktakeLine = {',
    'imageLabel?: string;',
    'imageTone?: string;',
  ]);
  expectIncludes('docs/erp-web-business-fact-model.md', '`WarehouseStocktakeLine` 在开始盘点时冻结');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '销售订单出库记录、销售/采购售后、仓库售后执行任务和库存盘点');
  expectIncludesAll('src/styles/main.css', [
    '.purchase-follow-up-line-head > .material-identity {',
    '.purchase-follow-up-line-head > .mini-status {',
    '.price-reference-card {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr);',
    '.delivery-reference-card {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr);',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 252. 跨模块物料身份展示统一（2026-08-02）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 226. 物料身份只读投影合同（2026-08-02）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 125. 销售、采购、仓库物料身份展示统一（2026-08-02）');
});

run('non-production warehouse pages hide placeholder locations and keep stocktake actors server-authoritative', () => {
  expectIncludesAll('src/views/WarehouseView.vue', [
    "function inventoryLocationLabel(location: string)",
    "inventoryLocationLabel(row.location)",
    "inventoryLocationLabel(locationText)",
    "return value === '默认库位' || /-AUTO$/i.test(value) ? '历史库位未登记' : `库位 ${value}`;",
  ]);
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    'function isHistoricalWarehouseLocation(location: string | undefined)',
    'return options.filter((location) => !isHistoricalWarehouseLocation(location));',
    'purchaseReceiptLocationDisplay(record.location)',
    'purchaseReceiptLocationDisplay(line.location)',
  ]);
  expectIncludesAll('src/views/WarehouseSalesIssueEditorView.vue', [
    'function salesIssueLocationDisplay(location: string | undefined)',
    'salesIssueLocationDisplay(allocation.location)',
  ]);
  expectIncludesAll('src/views/AfterSalesExecutionTaskView.vue', [
    'function recordLocationDisplay(location: string | undefined)',
    'recordLocationDisplay(allocation.location)',
  ]);
  expectIncludesAll('src/views/WarehouseOperationEditorView.vue', [
    'function warehouseLocationDisplay(location: string | undefined)',
    'const displayLocation = warehouseLocationDisplay(value);',
    'scopeLabel: displayLocation,',
    'warehouseLocationDisplay(line.location)',
  ]);
  expectIncludesAll('src/services/api.ts', [
    'returnWarehouseStocktake(code: string, reason: string)',
    'cancelWarehouseStocktake(code: string, reason: string)',
  ]);
  expectExcludes('src/services/api.ts', [
    'returnWarehouseStocktake(code: string, reason: string, actor: string)',
    'cancelWarehouseStocktake(code: string, reason: string, actor: string)',
    "body: { reason, actor }",
  ]);
  expectIncludesAll('server/index.mjs', [
    '采购暂存库位必须选择正式库位，不能使用历史占位库位。',
    '提交到货结果前请选择正式采购暂存库位，不能使用历史占位库位。',
    'normalStagingLocations = stagingLocations.filter((location) => !isPlaceholderWarehouseLocation(location));',
  ]);
  expectIncludes('scripts/smoke-purchase.mjs', 'purchase receipt accepted a historical placeholder staging location');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 273. 非生产仓库位置显示与认证动作一致性收口（2026-08-03）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 247. 非生产仓库历史位置投影与盘点认证合同（2026-08-03）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 138. 非生产仓库模块横向复核与历史位置收口（2026-08-03）');
});

run('non-production warehouse lists keep render states, mobile quantities, and reversal actors consistent', () => {
  expectIncludesAll('src/views/WarehouseView.vue', [
    'const isProductionOperationPage = computed(() =>',
    "['productionIssues', 'productionReturns', 'productionReceipts'].includes(activePage.value)",
    'const itemQuantity = salesIssueQuantitySummary(row, hasCurrentExecution);',
    "cardValue: itemQuantity || '—',",
    '<span v-else>共 {{ visibleOperationRows.length }} 条</span>',
    '<div v-if="isProductionOperationPage" class="pager">',
  ]);
  const warehouseView = read('src/views/WarehouseView.vue');
  const populatedOnlyBlocks = warehouseView.match(/v-if="isProductionOperationPage \|\| \(visibleOperationRows\.length > 0 && !isListLoading && !listLoadError\)"/g) ?? [];
  assert(populatedOnlyBlocks.length === 3, 'WarehouseView should gate desktop list, mobile cards, and footer by the populated render state');
  expectExcludes('src/views/WarehouseView.vue', [
    'cardValue: row.expectedDate,',
  ]);
  expectIncludes('src/services/api.ts', 'payload: { reason: string; idempotencyKey: string },');
  expectExcludes('src/services/api.ts', [
    'payload: { reason: string; actor?: string; idempotencyKey: string },',
  ]);
  for (const reversalView of [
    'src/views/WarehouseOperationEditorView.vue',
    'src/views/WarehousePurchaseReceiptEditorView.vue',
    'src/views/WarehouseSalesIssueEditorView.vue',
  ]) {
    expectExcludes(reversalView, [
      'actor: documentDraft.value!.owner,',
      'actor: receiptDraft.value!.owner,',
      'actor: issueDraft.value!.owner,',
    ]);
  }
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 274. 非生产仓库列表渲染、移动字段与冲销身份收口（2026-08-03）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 248. 非生产仓库列表状态与冲销认证合同（2026-08-03）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 139. 非生产仓库第二轮一致性复核（2026-08-03）');
});

run('warehouse registration dates and historical execution facts remain truthful', () => {
  expectIncludesAll('src/views/WarehouseSalesIssueEditorView.vue', [
    'if (!draft.reviewReturnedAt || !draft.date) draft.date = today();',
    'location: salesIssueLocationDisplay(undefined),',
    "issueDraft.postedBy || (issueInventoryPosted ? '历史出库人未登记' : '待过账')",
  ]);
  expectExcludes('src/views/WarehouseSalesIssueEditorView.vue', [
    "location: '—',",
    "issueDraft.postedBy || (issueInventoryPosted ? issueDraft.owner : '待过账')",
  ]);
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    "record.submittedBy || '历史到货登记人未登记'",
    "posting.postedBy || '历史入库人未登记'",
    'purchaseReceiptLocationDisplay(item.destinationLocation)',
    '<dd>历史入库人未登记</dd>',
  ]);
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', [
    "posting.postedBy || '仓库'",
    "receiptDraft.owner || '仓库'",
    "item.destinationLocation || '—'",
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 275. 仓库登记日期与历史执行事实收口（2026-08-03）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 249. 仓库实际日期与历史执行人投影合同（2026-08-03）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 140. 非生产仓库第三轮登记事实复核（2026-08-03）');
});

run('inventory recent movements and historical execution dates use truthful projections', () => {
  expectIncludesAll('src/views/WarehouseView.vue', [
    'lastMovement: detailLedger ? `${ledgerBusinessType(detailLedger)} ${detailLedger.sourceDoc}` : detailLatest.lastMovement,',
    'lastMovement: latestLedger ? `${ledgerBusinessType(latestLedger)} ${latestLedger.sourceDoc}` : latestRow.lastMovement,',
  ]);
  expectExcludes('src/views/WarehouseView.vue', [
    'lastMovement: detailLedger ? `${detailLedger.movement} ${detailLedger.sourceDoc}` : detailLatest.lastMovement,',
    'lastMovement: latestLedger ? `${latestLedger.movement} ${latestLedger.sourceDoc}` : latestRow.lastMovement,',
  ]);
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    "record.date || '历史到货日期未登记'",
    "posting.postedAt || '历史入库时间未登记'",
    "receiptDraft.postedQuantities?.postedAt || '历史入库时间未登记'",
  ]);
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', [
    "receiptDraft.postedQuantities?.postedAt || receiptDraft.date || '—'",
  ]);
  expectIncludes('src/views/WarehouseSalesIssueEditorView.vue', "issueDraft.date || '历史出库日期未登记'");
  expectIncludesAll('src/views/AfterSalesExecutionTaskView.vue', [
    "line.record.actualDate || '历史作业日期未登记'",
    "line.record.completedBy || '历史经办人未登记'",
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 276. 库存最近变动与历史执行日期一致性（2026-08-03）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 250. 库存最近变动与历史执行日期投影合同（2026-08-03）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 141. 非生产仓库第四轮最近变动与历史日期复核（2026-08-03）');
});

run('purchase posting semantics and inventory reversal links stay explicit', () => {
  expectIncludesAll('src/views/WarehousePurchaseReceiptEditorView.vue', [
    '<dt>入库时间</dt>',
    "inboundAllocationProduct(line.receiptLineId)?.batchTracked === false ? '无需批次' : '历史批次未登记'",
    "item.batchTracked === false ? '无需批次' : '历史批次未登记'",
  ]);
  expectExcludes('src/views/WarehousePurchaseReceiptEditorView.vue', [
    '<dt>入库日期</dt>',
    "line.batch || '—'",
    "item.batch || '—'",
    '历史入库日期未登记',
  ]);
  expectIncludesAll('src/views/WarehouseView.vue', [
    'v-if="ledger.reversalOf"',
    'ledgerOriginalSourcePath(ledger)',
    '原单 {{ ledger.reversalOf }}',
    'v-if="ledgerSourcePath(ledger)"',
    ':to="ledgerSourcePath(ledger)"',
  ]);
  expectExcludes('src/views/WarehouseView.vue', [
    'v-if="isWarehouseOwnedPath(ledger.sourcePath) || warehouseSourcePath(ledger.sourceDoc, ledger.reason)"',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 277. 采购入库记录与冲销来源链接收口（2026-08-03）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 251. 入库批次语义与冲销来源导航投影合同（2026-08-03）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 142. 非生产仓库第五轮入库记录与冲销来源复核（2026-08-03）');
});

run('sales issue sources and warehouse after-sales batches stay traceable', () => {
  expectIncludesAll('src/views/WarehouseSalesIssueEditorView.vue', [
    'const salesIssueSourceRequestPath = computed',
    '`/sales/outbound-requests/${encodeURIComponent(issueDraft.value.sourceDoc)}`',
    'const salesIssueSourceOrderPath = computed',
    '`/sales/orders/${encodeURIComponent(issueDraft.value.sourceOrder)}`',
    'v-if="salesIssueSourceRequestPath"',
    'v-if="salesIssueSourceOrderPath"',
    '<span>来源销售订单</span>',
    '<dt>出库结果</dt>',
    "return product.batchTracked === false ? '无需批次' : '历史批次未登记';",
    'salesIssueBatchDisplay(allocation.batch, item)',
  ]);
  expectExcludes('src/views/WarehouseSalesIssueEditorView.vue', [
    '<dt>过账状态</dt>',
    "batch: allocation.batch || (product.batchTracked === false ? '无需批次' : '—')",
    "batch: product.batch || (product.batchTracked === false ? '无需批次' : '—')",
    "allocation.batch || '无需批次'",
  ]);
  expectIncludesAll('server/index.mjs', [
    'const controls = materialControlSnapshot(data, source, product);',
    'batchControl: controls.batchControl,',
    'batchTracked: controls.batchTracked,',
  ]);
  expectIncludesAll('src/views/AfterSalesExecutionTaskView.vue', [
    "const emptyLabel = line.product.batchTracked === false ? '无需批次' : '历史批次未登记';",
    'function afterSalesAllocationBatchLabel(allocation: AfterSalesWarehouseAllocation, product: SalesAfterSaleProduct)',
    'afterSalesAllocationBatchLabel(allocation, product)',
  ]);
  expectExcludes('src/views/AfterSalesExecutionTaskView.vue', [
    "line.allocation.batch || '无需批次'",
    "return '未登记'",
    "allocation.batch || '无需批次'",
  ]);
  expectIncludes('src/types/business.ts', "batchControl?: '批次管理' | '不追踪批次' | string;");
  expectIncludes('scripts/smoke-after-sales.mjs', "legacyTaskDetail.task.products?.[0]?.batchTracked === true");
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 278. 销售出库来源追溯与批次语义收口（2026-08-03）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 252. 销售出库来源与售后批次控制投影合同（2026-08-03）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 143. 非生产仓库第六轮来源追溯与批次语义复核（2026-08-03）');
});

run('current scope, permission ownership, material request entry, and incoming quality labels stay truthful', () => {
  expectIncludesAll('shared/system-menu-defaults.json', [
    '"code": "MENU-ECOMMERCE"',
    '"enabledByDefault": false',
  ]);
  expectIncludesAll('src/stores/navigation.ts', [
    'enabledByDefault?: boolean;',
    "menu.enabledByDefault === false ? '停用' : '启用'",
  ]);
  expectIncludesAll('shared/permission-matrix.json', [
    '"module": "生产"',
    '"module": "质检"',
    '"module": "设备"',
    '不包含质检判定和仓库过账',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    "createLabel: '临时申请'",
    '任务缺口请从生产任务发起',
    '仓库不受理计划申请',
    '生产任务有新增采购缺口时从任务发起',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    "{ label: '来源任务', value: text(raw.sourceTaskCode, '临时备料') }",
    '仓库先判断库存；库存不足部分自动转采购申请。',
  ]);
  expectIncludesAll('src/views/QualityView.vue', [
    'const partyColumnLabel = computed',
    "activePage.value === 'incoming' ? '供应商/检验标准'",
    '<span>{{ partyColumnLabel }}</span>',
  ]);
  expectIncludesAll('src/views/HomeView.vue', [
    'function todoPathEnabled(path: string)',
    "!['disabled-menu', 'missing-permission'].includes(issue.reason)",
    "loadTodoList('/sales/quotes', listSalesQuotes)",
    'enabledTodoItems([',
  ]);
});

run('sales confirmation creates real line supply, production demand, and delivery facts', () => {
  expectIncludesAll('server/index.mjs', [
    'function planSalesOrderSupply(data, order) {',
    "Math.max(0, inventoryNumber(row, 'availableNumber', 'available'))",
    'function reserveSalesOrderSupply(data, order, supplyLines) {',
    "type: '销售预留'",
    'sourceLineId: line.sourceLineId,',
    'function createSalesOrderProductionTask(data, order, supplyLines, actor',
    "sourceType: '销售订单缺口'",
    "command: 'submit'",
    'function commitSalesOrderSupply(data, order, actor',
    "type: '库存预留'",
    "type: '生产任务'",
    'const tracking = upsertShipmentTrackingFromOrder(data, data.sales.orders[index], actor);',
    'outboundRequest: tracking,',
    'productionTask: supply.productionTask,',
    'const plannedQty = workOrderProjections.reduce(',
    'workOrderAllocationMetric(workOrder, { quantity: projection?.allocationQty || 0 }, value)',
    'productionDemandQty: result.productionDemandQty + line.productionDemandQty,',
  ]);
  expectExcludes('server/index.mjs', [
    'function orderRequiresProduction(data, order) {',
    "const tracking = needsProduction\n          ? null",
    ': productionDemandQty;',
  ]);
  expectIncludesAll('scripts/smoke-sales.mjs', [
    'sales order confirmation did not persist the real inventory reservation',
    'shortage order did not create delivery tracking at confirmation',
    'shortage order production task did not retain the sales order line identity',
    'shortage order falsely claimed production had started before a work order existed',
    'mixed-supply scenario did not distinguish its production demand from the real planned work order',
  ]);
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    '`生产需求 ${formatQty(Number(production.productionDemandQty || 0), unit)}`',
    '<small>生产需求</small><b>{{ row.productionDemandQty }}</b>',
    '<span>需求已分配</span>',
  ]);
  expectIncludesAll('src/views/SalesOutboundRequestView.vue', [
    'const productionDemandQty = (sourceProduct?.fulfillmentLinks || [])',
    '`生产需求 ${formatQty(productionDemandQty, unit)}`',
    '<span>补充去向 <b>{{ row.plannedSupplyQty }}</b></span>',
    '<span>未分配缺口 <b>{{ row.shortageAfterPlanQty }}</b></span>',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 303. P1 销售确认后的库存、生产与交付承接（2026-08-04）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 277. 销售订单供应承接与交付并行合同（2026-08-04）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 168. P1 销售订单供应承接与交付并行复核（2026-08-04）');
});

run('sales-driven production tasks expand recipe demand without fabricating missing plans', () => {
  expectIncludesAll('server/index.mjs', [
    'function productionTaskRecipeBinding(data, product, strict = false) {',
    'function productionTaskMaterialInventorySnapshot(data, materialCode) {',
    'function productionTaskMaterialPlan(data, products, strict = false) {',
    'function hydrateProductionTaskMaterialPlans(data) {',
    "function productionTaskCurrentProcurementGapLines(data, sourceTask, inputLines = [], excludeRequestCode = '') {",
    'const effectiveRequestedQty = production.materialRequests',
    "throw requestError(400, '任务缺口补料必须从已确认的生产任务发起。');",
    'const currentGapByMaterial = new Map(currentGapLines.map',
    '不在生产任务 ${sourceTaskCode} 的当前采购缺口中',
    '申请数量超过生产任务当前采购缺口',
    "materialPlanningStatus: submitted",
    "? '先维护并启用成品配方，再创建生产工单'",
    'sourceLineId,',
    'recipeCode,',
    'procurementGapQty,',
    "? '任务当前采购缺口快照（已扣除已分配、可用、待检、待入库和在途；不预留、不占用）'",
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    'const taskMaterialPlanningBlockers = computed',
    "return taskMaterialReadyRows.value.length ? '部分待配置配方' : '待配置配方';",
    "if (productionTaskMaterialPlanningBlockers(raw).length) return '维护生产配方';",
    "{{ materialRequestDraft.sourceTaskCode ? '已有/补充覆盖' : '库存覆盖' }}",
    'materialRequestCoveredQty(line)',
    ':model="line.model"',
    "if (/库存可满足|已转采购|完成|关闭/.test(value)) return '已完成';",
    '{{ taskMaterialEmptyMessage }}',
    "if (taskMaterialPlanningBlockers.value.length) return '维护配方';",
    "path: '/production/recipes/new'",
    "const blockedProduct = taskBlockedRecipeProduct.value;",
    "product: text(blockedProduct?.productCode, '')",
    "sourceTask: row.code",
    "returnTo: `/production/tasks/${encodeURIComponent(row.code)}`",
    "const requestedProductCode = text(route.query.product, '');",
    "const requestedSourceTask = text(route.query.sourceTask, '');",
  ]);
  expectIncludesAll('scripts/smoke-sales.mjs', [
    'production task did not bind the unique enabled recipe',
    'production task did not expand the enabled recipe into material demand',
    'production task material demand lost the sales-order line or recipe evidence',
    'recipe-pending production demand was not exposed as a planning blocker',
    'recipe-pending task fabricated material demand without an enabled recipe',
  ]);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    'production task trusted the forged client material plan or failed to calculate a real procurement gap',
    'task shortage routing did not preserve the gross availability evidence and the net purchase gap',
    'automatic task-gap evaluation did not disclose its net, non-reserving planning basis',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 304. P1 销售缺口生产任务的配方与物料计划闭环（2026-08-04）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 278. 销售驱动生产任务的配方绑定与物料需求合同（2026-08-04）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 169. P1 销售缺口任务物料计划复核（2026-08-04）');
});

run('production release uses canonical lines, eligible issue stock, and multi-unit material evidence', () => {
  expectIncludesAll('server/index.mjs', [
    'function productionIssueInventoryEligibility(data, row) {',
    "warehouse.status !== '启用' || warehouse.allowProductionIssue !== true",
    "if (stocktake) return { eligible: false, reason: '盘点冻结'",
    'function compareProductionIssueInventoryRows(left, right) {',
    'function resolveProductionLineForRelease(data, workOrder, body) {',
    'const productionLine = resolveProductionLineForRelease(data, workOrder, body);',
    'lineCode: productionLine.code,',
    'lineWorkshop: productionLine.workshop ||',
    "materialStatus: '已领料'",
    "delete card.issuedQty;",
    'productionLines: ensureMasterRows(data, \'productionLines\')',
  ]);
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    'const productionLineCatalog = ref<ProductionLineRuntime[]>([]);',
    "const activeProductionLines = productionLineCatalog.value.filter((line) => (",
    "productionLineCapability(line.type || line.name) !== 'packaging'",
    'function productionLineCapability(value: unknown) {',
    'line.schedulable',
    'lineCode: line.code,',
    'productionLineCatalog.value = snapshot.productionLines;',
    "childOrders.value.some((child) => child.line === line.name && child.status === '待领料')",
    'Number(right.schedulable) - Number(left.schedulable)',
    '历史任务承接',
    '只完成既有任务，不参与新排产',
  ]);
  expectExcludes('src/views/ProductionWorkbenchDemoView.vue', [
    '...production2WorkOrders.flatMap((order) => order.linePlans.map((plan) => plan.line)),',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    'function liveInventorySnapshot(materialCode: string, productionIssueOnly = false)',
    'row.warehouseStatus === \'启用\'',
    'row.allowProductionIssue === true',
    '!row.stocktakeFrozen',
    "? '等待盘点完成'",
    "? '待调拨到生产领料仓'",
    '可领料库存',
  ]);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    'work order release accepted a free-text production line',
    'work order release accepted a line with the wrong process capability',
    'work order release allocated material from a warehouse without the production-issue function',
    'work order release allocated stock that is under an active stocktake freeze',
    'production batch incorrectly summarized multi-unit material issues in the finished-product unit',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 305. P1 生产工单释放、领料事实与产线主档收口（2026-08-04）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 279. 生产工单释放、领料状态与产线引用合同（2026-08-04）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 170. P1 生产工单释放、领料与产线主档复核（2026-08-04）');
});

run('production material requests prevent duplicate task gaps and preserve shared-stock line evidence', () => {
  expectIncludesAll('server/index.mjs', [
    "function productionTaskCurrentProcurementGapLines(data, sourceTask, inputLines = [], excludeRequestCode = '') {",
    'const effectiveRequestedQty = production.materialRequests',
    'taskExistingRequestedQty: effectiveRequestedQty,',
    "throw requestError(400, '任务缺口补料必须从已确认的生产任务发起。');",
    "throw requestError(400, '独立备料申请的需求日期不能早于申请日期。');",
    "throw requestError(400, '备料明细必须填写具体用途。');",
    'function hydrateProductionMaterialRequestIdentities(data) {',
  ]);
  expectIncludesAll('src/views/Production2View.vue', [
    "const materialRequestTaskRequiredSummary = computed",
    "{{ materialRequestDraft.sourceTaskCode ? '任务总需' : '申请数量' }}",
    "{{ materialRequestDraft.sourceTaskCode ? '已有/补充覆盖' : '库存覆盖' }}",
    ':model="line.model"',
    "materialRequestDraft.value.expectedDate < materialRequestDraft.value.requestDate",
    `<template v-if="materialRequestDraft.status === '草稿'">待评估</template>`,
    "['recipes', 'process-templates', 'material-requests'].includes(activePage)",
    "if (/库存可满足|已转采购|完成|关闭/.test(value)) return '已完成';",
    'function materialRequestNextStepDescription() {',
  ]);
  expectExcludes('src/views/Production2View.vue', ['materialRequestLineHasDuplicate']);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    'the same production-task procurement gap could be submitted twice',
    'a standalone material request could forge the task-gap request type',
    'a standalone material request accepted a demand date before its application date',
    'a standalone material request accepted a line without a concrete purpose',
  ]);
  expectIncludesAll('scripts/seed-production-material-request-demo.mjs', [
    "code: 'PMR2-260805-901'",
    "code: 'PMR2-260805-904'",
    "code: 'PMR2-260805-905'",
    '同一外箱用于两类用途',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 310. 备料申请来源唯一性、共享库存与材料身份收口（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 284. 备料申请净缺口、共享覆盖与物料身份合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 174. 备料申请逻辑、详情与演示数据复核（2026-08-05）');
});

run('material request drafts avoid false evaluation facts and independent requests keep traceability gates', () => {
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 311. 备料申请草稿真实性与独立申请门禁（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 285. 备料申请草稿投影与独立申请校验合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 175. 备料申请第二轮真实性与提交门禁复核（2026-08-05）');
  expectIncludes('scripts/seed-production-material-request-demo.mjs', "const draft = byCode.get('PMR2-260805-905');");
});

run('production after-sales repair prioritizes repair basis and explicit reinspection handoff', () => {
  expectIncludesAll('server/index.mjs', [
    'const caseRecord = afterSalesCase(data, task.afterSaleKind, task.afterSaleCode) || {};',
    "caseIssueType: caseRecord.issueType || '',",
    "caseIssueDescription: caseRecord.issueDescription || '',",
    "disposition: predecessor?.disposition || '',",
    'completedBy: businessActorDisplayName(predecessor?.completedBy),',
  ]);
  expectIncludesAll('src/views/AfterSalesExecutionListView.vue', [
    "taskLabel: '返修要求'",
    "partyLabel: '客户'",
    "searchPlaceholder: '搜索任务、售后单、订单、客户、问题、物料'",
    "return task.caseIssueType || '售后返修';",
    "return displayIssueDescription(task.caseIssueDescription) || '按售后要求完成返修并交由复检';",
    "task.disposition || '已返修待复检'",
  ]);
  expectIncludesAll('src/views/AfterSalesExecutionTaskView.vue', [
    "production: '问题类型'",
    "if (isProductionTask.value) return '返修记录号';",
    "{{ isProductionTask ? '返修依据' : '售后处理依据' }}",
    '前置检验结论',
    'candidate.disposition || candidate.evidence',
    "'is-production': isProductionTask",
    '<strong>返修完成</strong>',
    '全部任务数量将交由返修品复检',
    "isProductionTask ? '返修物料确认' : isQualityTask ? '检验物料确认' : '本次物料结果'",
    '<dt>返修数量</dt>',
    '<dt>完成后状态</dt><dd>待复检</dd>',
    "return '已返修待复检';",
    "返修品复检任务已释放",
  ]);
  expectExcludes('src/views/AfterSalesExecutionTaskView.vue', [
    "label: '前置条件'",
    "production: '返修类型'",
    "if (isProductionTask.value) return '返修记录';",
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 314. 售后返修依据、交接结果与页面降噪（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 288. 售后返修任务与复检交接投影合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 178. 售后返修第二轮逻辑与视觉复核（2026-08-05）');
});

run('production after-sales repair distinguishes current material control from the original plan', () => {
  expectIncludesAll('src/views/AfterSalesExecutionListView.vue', [
    "if (modulePath.value === 'production') return '查看返修记录';",
    '<small>下一步</small>',
  ]);
  expectIncludesAll('src/views/AfterSalesExecutionTaskView.vue', [
    'class="quote-editor warehouse-document-editor after-sales-editor after-sales-task-page is-detail-view"',
    '.after-sales-task-side .after-sales-context-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
    'const repairMaterialState = computed',
    "return '退货待检';",
    "return '质检冻结 · 待复检';",
    "return '质检冻结 · 返修中';",
    "return '质检冻结 · 待返修';",
    "isProductionTask ? '当前实物状态' : '实物安排'",
    '返修记录号或返修备注至少填写一项',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 315. 售后返修实物控制、下一步与登记提示收口（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 289. 售后返修实物控制状态与列表下一步合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 179. 售后返修第三轮实物状态与字段复核（2026-08-05）');
});

run('after-sales execution keeps mixed units separate and start distinct from completion', () => {
  expectIncludesAll('src/views/AfterSalesExecutionListView.vue', [
    ':show-amount-sort="false"',
    "const totals = new Map<string, number>();",
    "totals.set(unit, (totals.get(unit) || 0) + quantityNumber(product.qty));",
    "join(' / ')",
  ]);
  expectExcludes('src/views/AfterSalesExecutionListView.vue', [
    'function taskQuantity(task: AfterSalesExecutionTask)',
    "if (sortMode.value === 'amountDesc') return taskQuantity(b) - taskQuantity(a)",
  ]);
  expectIncludes('src/views/AfterSalesExecutionTaskView.vue', 'actionMessage.value = `任务已开始，完成后请${executionActionLabel.value}`;');
  expectExcludes('src/views/AfterSalesExecutionTaskView.vue', ['await openExecutionDialog();']);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 316. 售后执行起止动作与跨单位数量收口（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 290. 售后执行状态迁移与数量比较合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 180. 售后返修第四轮动作节奏与跨单位列表复核（2026-08-05）');
});

run('after-sales execution validates real dates and presents unfinished repair outcomes truthfully', () => {
  expectIncludesAll('server/index.mjs', [
    "const startedDate = String(task.startedAt || task.createdAt || '').slice(0, 10);",
    "throw requestError(400, '实际作业日期不能早于任务开始日期。');",
  ]);
  expectIncludesAll('src/views/AfterSalesExecutionTaskView.vue', [
    "const minimumActualDate = computed(() => String(task.value?.startedAt || task.value?.createdAt || '').slice(0, 10));",
    ':min="minimumActualDate || undefined"',
    '不能早于任务开始日期',
    'const productionSupplementHasError = computed',
    "'has-field-error': supplementHasError",
    'v-if="supplementHasError" class="field-error-text after-sales-supplement-error"',
    'v-if="(isProductionTask || isQualityTask) && !supplementHasError" class="after-sales-supplement-hint"',
    "return '请填写返修记录号或返修备注';",
    ':class="statusPresentationClass(recordResultLabel(line))"',
  ]);
  expectExcludes('src/views/AfterSalesExecutionTaskView.vue', [
    'class="mini-status status-done">{{ recordResultLabel(line) }}',
  ]);
  expectIncludes('scripts/smoke-after-sales.mjs', "'实际作业日期不能早于任务开始日期'");
  expectIncludes('server/index.mjs', '完成返修或返工任务必须填写返修记录号或返修备注。');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 317. 售后执行日期门禁、互斥必填与结果色收口（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 291. 售后执行日期与结果展示合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 181. 售后返修第五轮日期与登记反馈复核（2026-08-05）');
});

run('production task work order arrangement and execution identities stay distinct', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    "title: `生产安排 ${batchIndex + 1}`",
    "{ label: '安排数量', value: qty(batch.releasedQty, batch.unit) }",
    "{ label: '下一步', value: productionDisplayTerm(batch.nextAction) }",
    ": '尚未报工'",
    "return `${operationJob.operationType.replace(/生产$/, '')}任务待开工`;",
    "return '大盘已放行';",
    'chain.qualifiedQty > 0',
    'listProgressRatio(chain.packedQty, chain.qualifiedQty, unit)',
  ]);
  const publicArrangementBlock = blockAfter(
    'src/views/Production2View.vue',
    'function workOrderReleaseExecutionLines(workOrderCode: unknown): DetailLine[] {',
    'function recipeMaterialLines',
  );
  assert(!publicArrangementBlock.includes('title: batch.code,'), 'work order detail should not expose an internal release batch code');

  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    "{ label: '待领料安排', value: waitingMaterialChildren.value.length }",
    '<span class="workbench-button-label">全部工单</span>',
    '<span class="workbench-button-label">批次详情</span>',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 325. 生产模块对象身份、阶段与数量口径统一（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 298. 生产对象公开身份与跨页面数量投影合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 187. 生产模块对象身份与数量口径横向复核（2026-08-05）');
});

run('production workbench queued operations and affected exceptions share truthful stages', () => {
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    'function executionCardWorkbenchStage(card: Production2ExecutionCard)',
    'const postprocessStage = postprocessStageForCard(card);',
    'status: executionCardWorkbenchStage(batch)',
    "return `${operationJob.operationType.replace(/生产$/, '')}任务待开工`;",
    "const queuedOperationJob = !child && !lot ? lineQueuedOperationJob(line) : undefined;",
    "{ label: '生产批次', value: queuedOperationJob.productionBatchCode }",
    "{ label: '来源大盘', value: queuedOperationJob.sourceWipBatchCode }",
    "{ label: '队列状态', value: queuedOperationJob.status }",
    "? steps.find((step) => step.state === '待执行')",
    "` · 下一步 ${queuedNext.name}`",
    "? '现场执行' : '产线状态'",
    '!selectedLineCurrentLot && !selectedLineQueuedOperationJob',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.workbench-v2 .postprocess-batch-actions .workbench-handoff-status {',
    'border-color: transparent;',
    'background: transparent;',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 326. 生产工作台排队作业依据与异常状态同源（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 299. 工作台队首作业与异常受影响对象投影合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 188. 生产工作台队首作业、空闲产线与异常阶段复核（2026-08-05）');
});

run('production lists share execution attention and preserve material-request purpose splits', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    'function executionCardListAttention(raw: AnyRecord)',
    "if (activeProductionExceptionForExecutionCard(code)) return '生产异常待处理';",
    "return `${operationJob.operationType.replace(/生产$/, '')}任务待开工`;",
    "if (chain.pendingPackagingQty > 0 || /待包装|包装确认/.test(text(raw.node, ''))) return '记录包装';",
    "return '等待入库检';",
    "return '等待仓库入库';",
    'const activeCardAttentions = [...new Set(',
    "else if (activeCardAttentions.length > 1) attention = '多批次待办';",
    'attention: executionCardListAttention(raw),',
    'const grouped = new Map<string, { name: string; unit: string; quantity: number; purposes: Set<string> }>();',
    "return materials.length > 2 ? `${names} 等 ${materials.length} 种物料` : names;",
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 327. 生产模块跨页面执行阶段与列表关注项收口（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 300. 生产批次关注项、工单汇总与备料多用途摘要合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 189. 生产模块全域横向复核与跨页面阶段收口（2026-08-05）');
});

run('production list filters, amount sorting, empty states, and process line types use truthful semantics', () => {
  expectIncludesAll('src/views/Production2View.vue', [
    "'material-requests': '需求部门'",
    "'material-requests': '申请人'",
    "'execution-cards': '来源工单'",
    "'execution-cards': '班组负责人'",
    "'process-templates': '适用产品族'",
    "'loss-ledger': '责任人'",
    'const amountSortableProductionPages = new Set<ProductionPage>([',
    "if (!amountSortableProductionPages.has(page) && sortMode.value === 'amountDesc') sortMode.value = 'status';",
    'const showAmountSort = computed(() => amountSortableProductionPages.has(activePage.value));',
    '工单完成生产安排并进入执行后会生成生产批次。',
    'function schedulableProcessLineTypes(value: unknown)',
    "lineTypes: ['挤出机']",
    "? ['拉丝机', '复绕机']",
    '适用产线只填写可排产设备；包装工位请维护在包装阶段',
    'placeholder="例如 挤出机、拉丝机、复绕机"',
  ]);
  expectExcludes('src/views/Production2View.vue', [
    "const showAmountSort = computed(() => activePage.value !== 'exceptions');",
    "lineTypes: ['挤出机', '包装工位']",
    "['拉丝机', '复绕机', '包装工位']",
    'placeholder="例如 拉丝机、复绕机、包装工位"',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function productionProcessSchedulableLineTypes(template) {',
    "filter((item) => item && !/包装(?:工位|线)?/.test(item))",
    '适用产线只允许填写可排产设备；包装工位请在包装阶段维护。',
  ]);
  expectExcludes('server/index.mjs', ["lineTypes: ['拉丝机', '复绕机', '包装工位']"]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 328. 生产列表筛选、排序与工艺产线口径复核（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 301. 生产列表可比维度与工艺设备能力事实（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 190. 生产筛选语义、跨单位排序与工艺产线复核（2026-08-05）');
});

run('production operation jobs release equipment truthfully and schedule cards expose due risk', () => {
  expectIncludesAll('server/index.mjs', [
    'const operationJobStatusProgress = new Map([',
    'function canonicalExecutionCardOperationJobs(operationJobs) {',
    'card.operationJobs = canonicalExecutionCardOperationJobs(card.operationJobs);',
    'ensureExecutionCardOperationJobs(data, card).filter((job) => (',
  ]);
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    'function operationJobBelongsOnLine(job: Production2OperationJob, card: Production2ExecutionCard)',
    "if (['执行中', '暂停', '异常'].includes(job.status)) return executionCardOccupiesLine(card);",
    '&& operationJobBelongsOnLine(item.job, item.card)',
    'function scheduleDueRisk(dueDate: string)',
    "return { label: `已逾期 ${Math.abs(daysUntilDue)} 天`, level: 'overdue' as const };",
    'class="schedule-due-risk"',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.schedule-pool-card .schedule-due-risk {',
    '.schedule-pool-card .schedule-due-risk.is-overdue {',
  ]);
  expectIncludesAll('scripts/smoke-production-lines.mjs', [
    'duplicate operation-job canonicalization failed',
    'genuine active-operation guards remain active',
  ]);
  expectExcludes('server/data/erp-data.json', ['OP-SMOKE', 'Smoke 二号复绕线']);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 329. 生产设备作业去重、产线释放与排产交期风险（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 302. 设备作业规范身份、产线占用与交期风险合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 191. 生产设备作业去重、现场产能与交期风险复核（2026-08-05）');
});

run('production rewind quantities and shift handover carryover facts stay explicit', () => {
  expectIncludesAll('src/views/ProductionWorkbenchDemoView.vue', [
    'const shiftHandoverItems = computed<ShiftHandoverItem[]>(() => {',
    'const shiftHandoverExecutionCards = computed(() => {',
    'const handoverNoteRequired = computed(() => shiftHandoverItems.value.length > 0 || shiftExceptionCount.value > 0);',
    "{ label: '成品计划', value: formatQty(Number(card?.planQty || 0), card?.unit || '卷') }",
    "{ label: '本次处理重量', value: formatQty(queuedOperationJob.plannedQty, queuedOperationJob.plannedUnit) }",
    '未完成现场事项 <strong>{{ shiftHandoverItems.length }} 项</strong>',
    "留给下个班次的备注{{ handoverNoteRequired ? '（必填）' : '' }}",
    'class="shift-receive-context"',
  ]);
  expectIncludesAll('server/index.mjs', [
    'ensureExecutionCardOperationJobs(data, card)',
    "operationJobCode: operationJob?.code || ''",
    "throw requestError(400, '存在未完成现场事项或本班异常时，交班备注至少填写 4 个字。');",
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.shift-handover-item-list {',
    '.shift-receive-context {',
  ]);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    "includes('交班备注至少填写 4 个字')",
    'shiftHandover.handover.activeCards[0].operationJobCode',
    "shiftHandover.handover.activeCards[0].operationStatus === '暂停'",
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 330. 复绕数量双口径与班次交接现场事项（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 303. 复绕作业数量与班次交接快照合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 192. 复绕数量与班次交接完整性复核（2026-08-05）');
});

run('quality queues, source facts, dates, and closure history stay canonical', () => {
  expectIncludesAll('src/views/QualityWorkbenchView.vue', [
    "listAfterSalesExecutionTasks('quality')",
    '<h2>售后检验待办</h2>',
    'runtimeQualityClosureRows(qualityPatrolRows, patrolRecords, \'patrol\')',
    'runtimeQualityClosureRows(defectRows, defectRecords, \'defects\')',
    "label: '巡检与不良'",
    "['incoming', 'production'].includes(row.page)",
    '? !isClosed(row.status) && !isQualityDispositionClosed(dispositionStage)',
    'align-items: start;',
  ]);
  expectIncludesAll('src/data/quality.ts', [
    'function qualityDateValue(value: unknown)',
    'function qualityTaskCodeDate(code: string)',
    '|| qualityTaskCodeDate(task.code)',
  ]);
  expectExcludes('src/data/quality.ts', [
    "String(task.decidedAt || task.createdAt || task.dueTime || '2026-07-01').slice(0, 10)",
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    "if (value.startsWith('QSTD-')) return `/quality/standards/${encodeURIComponent(value)}`;",
    "if (value.startsWith('WR-')) return `/warehouse/purchase-receipts/${encodeURIComponent(value)}`;",
    'qualityQuantityMapTotal(totals.concession) > 0.0001',
    'const seed = sourceRecord.value?.code === record.code',
    '...(seed || {}),',
  ]);
  expectIncludesAll('server/index.mjs', [
    "!['待分配', '待指定', '待确认'].includes(sourceInspector)",
    'inspector: decision.actor,',
    "date: String(decision.decidedAt || '').slice(0, 10),",
    'const original = Object.keys(stored).length ? stored : incoming;',
  ]);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    'incoming quality decision did not persist the actual inspector',
    'incoming quality decision did not persist the actual decision date',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 331. 质检责任队列、来源追溯与历史事实完整性（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 304. 质检责任队列与判定事实投影合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 193. 质检工作台与历史闭环事实复核（2026-08-05）');
});

run('quality execution pages remove closed-action noise and use record-specific disposition language', () => {
  expectIncludesAll('src/views/QualityView.vue', [
    "if (!showRowCurrentAction(row)) return '';",
    ':next-step="qualityListAction(row)"',
  ]);
  expectExcludes('src/views/QualityView.vue', [
    "row.lifecycleStatus === '已作废' ? '已作废' : '无待办'",
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    "currentKind.value === 'patrol' && draft.contact",
    "if (kind === 'incoming') return '暂存位置';",
    "appendQuantity('未判定 / 冻结', totals.pending);",
    "<h2>收货与质检数量</h2>",
    "&& !(currentKind.value === 'production' && detailDispositionStage.value === '待判定')",
    'function defectImpactScope(draft: QualityDocumentDraft)',
    'return `${disposition}成本与复检结果待确认`;',
    'return `完成${actionName}并填写处置结果、上传必要证据；提交后进入独立验证。`;',
    "&& ['待处理区', '-', ''].includes(String(documentDraft.warehouse || '').trim()))",
  ]);
  expectExcludes('src/views/QualityDocumentEditorView.vue', [
    '<h2>来源收货与数量口径</h2>',
    '按处置方式完成返工、退换、补发或报废，并提交结果证据',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 332. 质检流程表达与执行页面降噪（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 305. 质检行动可见性与处置语义投影合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 194. 质检流程表达与噪音清理复核（2026-08-05）');
});

run('quality summaries wait for source readiness and execution editors avoid duplicate facts', () => {
  expectIncludesAll('src/views/QualityWorkbenchView.vue', [
    'const judgementSummaryReady = computed(() => (',
    'const reviewSummaryReady = computed(() => runtimeIncomingLoaded.value && runtimeProductionLoaded.value);',
    'const closureSummaryReady = computed(() => runtimePatrolLoaded.value && runtimeDefectLoaded.value);',
    'const freezeSummaryReady = computed(() => (',
    ':disabled="!card.ready"',
    ":title=\"card.ready ? '按该责任筛选，再次点击恢复全部' : '正在汇总对应质量待办'\"",
    "<strong>{{ card.ready ? card.value : '—' }}</strong>",
    '.quality-summary-card.is-loading strong {',
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    "editTitle: '登记来料质检'",
    "editTitle: '登记生产质检'",
    "editTitle: '登记质量巡检'",
    "editTitle: '登记不良处置'",
    "...(draft.processStep && draft.processStep !== draft.sourceType",
    "v-if=\"!documentDraft.processStep || documentDraft.processStep !== documentDraft.sourceType\"",
    "<section v-if=\"currentKind !== 'incoming'\" class=\"form-section\">",
    '<strong>抽样记录</strong>',
    'v-model="line.sampleQty"',
    'v-model="line.failedQty"',
  ]);
  expectExcludes('src/views/QualityDocumentEditorView.vue', [
    "editTitle: '来料质检处理'",
    "editTitle: '生产质检处理'",
    "editTitle: '质量巡检处理'",
    "editTitle: '不良处理'",
    "<section v-if=\"!(isDetail && currentKind === 'incoming')\" class=\"form-section\">",
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 333. 质检摘要加载真实性与登记骨架统一（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 306. 质检摘要就绪与登记字段去重合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 195. 质检摘要真实性与登记骨架复核（2026-08-05）');
});

run('quality lists keep comparable sorts, partial decisions actionable, and after-sales decisions evidenced', () => {
  expectIncludesAll('src/views/QualityView.vue', [
    "const amountSortableQualityPages = new Set<QualityPageKey>(['patrol', 'defects', 'standards']);",
    ':show-amount-sort="showAmountSort"',
    "if (activePage.value === 'patrol') return '巡检单/来源';",
    "if (activePage.value === 'defects') return '不良单/来源';",
    'row.reportBatch !== row.sourceDoc',
    'function qualityStageMirrorsLifecycle(stage: string, lifecycle: string)',
    'function qualityListOverviewFacts(row: QualityListRow)',
    "`${hasDueDate ? '逾期' : '滞留'} ${staleDays} 天`",
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    'function incomingDocumentDispositionSummary(draft: QualityDocumentDraft, stage: string)',
    "label: '继续判定'",
    "label: hasDispositionRemaining ? '继续判定并处理已隔离数量' : '继续完成检验判定'",
    "nextStepGuidance.tone === 'tracking' ? '流转结果' : '当前待办'",
    'function qualityDetailStageMirrorsLifecycle(stage: string, lifecycle: string)',
  ]);
  expectIncludesAll('src/views/AfterSalesExecutionTaskView.vue', [
    'const qualitySupplementHasError = computed(() => (',
    "? '检验依据、检验备注或检验附件至少保留一项'",
    'if (isQualityTask.value && !form.evidence.trim() && !form.note.trim() && !form.attachments.length)',
  ]);
  expectIncludesAll('server/index.mjs', [
    "module === '质检'",
    "throw requestError(400, '售后检验必须保留检验依据、检验备注或检验附件。');",
  ]);
  expectIncludesAll('scripts/smoke-after-sales.mjs', [
    "body: { disposition: '可再次销售' }",
    "'售后检验必须保留检验依据'",
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 334. 质检列表可比性、部分判定双待办与售后证据门禁（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 307. 质检可比维度、双责任待办与售后证据合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 196. 质检列表、双待办与售后证据第二轮复核（2026-08-05）');
});

run('quality active stages, checkpoint ownership, exports, and task-level after-sales labels stay precise', () => {
  expectIncludesAll('src/views/QualityWorkbenchView.vue', [
    'function showQueueDispositionStage(row: QueueItem)',
    'v-if="showQueueDispositionStage(row)"',
  ]);
  expectIncludesAll('src/views/QualityView.vue', [
    'const exportDocumentNumberLabel = computed(() => {',
    'const exportStageColumnLabel = computed(() => (',
    'const exportHandlingColumnLabel = computed(() => (',
    'function qualityListStageIsRelevant(row: QualityListRow',
    'row.disposition || \'—\'',
    'filterLabels.value.owner',
    'filterLabels.value.date',
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    "? '不良判定'",
    'function qualityDetailStageIsRelevant(stage: string)',
    'v-if="documentDraft.products.length > 1"',
  ]);
  expectIncludesAll('src/views/QualityStandardEditorView.vue', [
    '<span>项目名称</span>',
    '<section v-if="!isDetail" class="summary-section quality-standard-version-note">',
  ]);
  expectIncludesAll('src/views/AfterSalesExecutionTaskView.vue', [
    "? '本任务复检结果' : '本任务检验结果'",
    "isQualityTask ? '检验物料确认'",
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 335. 质检活动阶段、检查项上下文与导出语义收口（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 308. 质检阶段可见性、检查项归属与导出投影合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 197. 质检阶段、检查项与导出语义第三轮复核（2026-08-05）');
});

run('quality freeze summaries deduplicate batches and list controls share visible-stage semantics', () => {
  expectIncludesAll('src/views/QualityWorkbenchView.vue', [
    'freezeBatchKeys: string[];',
    'function qualityRecordFreezeBatchKeys(row: QualityRecord',
    'function afterSalesFreezeBatchKeys(task: AfterSalesExecutionTask)',
    '.flatMap((row) => row.freezeBatchKeys.length ? row.freezeBatchKeys',
  ]);
  expectIncludesAll('src/views/QualityView.vue', [
    "incoming: { status: '当前阶段'",
    "production: { status: '当前阶段'",
    'function qualityFilterStageValue(conclusion: string, stage: string)',
    "return qualityStageIsRelevantValue(conclusion, normalizedStage) ? normalizedStage : '待检验判定';",
    'uniqueValues(listRows.value.flatMap(qualityListFilterStages))',
    'qualityListFilterStages(row).includes(filterStatus.value)',
    "qualityListStageIsRelevant(row) ? qualityListStageStatus(row) : '—'",
    '启用: 1,',
    '草稿: 2,',
    '停用: 3,',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 336. 质量冻结去重与列表阶段口径统一（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 309. 质量冻结批次键与用户可见阶段投影合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 198. 质量冻结与列表阶段第四轮复核（2026-08-05）');
});

run('partial incoming decisions keep judgement and disposition responsibilities while retaining staging batches', () => {
  expectIncludesAll('src/views/QualityWorkbenchView.vue', [
    'pendingJudgement: boolean;',
    'function pendingDecisionQuantitySummary(row: QualityRecord)',
    '? `继续判定剩余 ${pendingQuantity}${/待处置|待复检|返工中/.test(dispositionStage)',
    "if (scope === 'judgement') return row.pendingJudgement;",
    '.filter((row) => row.pendingJudgement).length,',
  ]);
  expectIncludesAll('src/views/QualityView.vue', [
    'pendingJudgement: boolean;',
    'function qualityPendingDecisionQuantitySummary(row: QualityRecord)',
    'function qualityRejectedQuantitySummary(row: QualityRecord)',
    'pendingJudgement ? [\'待检验判定\'] : [];',
    'qualityListFilterStages(row).includes(filterStatus.value)',
    'rejected ? `不合格 ${rejected}` : \'\'',
    'pending ? `未判定 ${pending}` : \'\'',
  ]);
  expectIncludesAll('server/index.mjs', [
    "batch: product.stagingBatch || product.batch || '',",
    '|| product.stagingBatch',
    '|| receiptProduct?.stagingBatch',
  ]);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    'const receiptStagingBatch = `SMK-IQC-${Date.now()}`;',
    'incoming quality task lost the staging batch',
    'incoming quality read model lost the staging batch',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 337. 来料部分判定双责任与暂存批次追溯（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 310. 来料未判定责任集合与暂存批次投影合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 199. 来料部分判定与暂存批次第五轮复核（2026-08-05）');
});

run('quality task fields distinguish inspected materials and remove external contact noise', () => {
  expectIncludesAll('src/views/QualityView.vue', [
    "production: '搜索质检单、类型、标准、工单、产线、受检物料、批次'",
    "incoming: { status: '当前阶段', party: '供应商', owner: '检验员', date: '任务日期' }",
    "production: { status: '当前阶段', party: '产线', owner: '检验员', date: '任务日期' }",
    "if (activePage.value === 'production') return '受检物料/批次';",
    "row.productionLine ?? (page === 'defects' ? '' : row.contact)",
    'v-if="row.sourceMeta || row.partySubtitle"',
    '{{ filterLabels.owner }}/{{ filterLabels.date }}',
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    "if (currentKind.value === 'production') return '受检物料';",
    "&& ['待检验', '待判定', '待质检'].includes(currentStatus.value)",
    "{ label: qualityDetailDateLabel.value, value: draft.date || '-' }",
    "&& !response.decision?.decidedAt",
    "if (isEdit.value && !task.decidedAt && ['待检', '待检验', '待判定'].includes(task.status))",
    "currentKind.value === 'patrol' && draft.contact",
    'v-if="currentKind === \'patrol\' && (!isDetail || Boolean(documentDraft.contact))"',
    'const runtimeIncomingQualityReferenceCodes = ref<Set<string>>(new Set());',
    'const runtimeProductionQualityReferenceCodes = ref<Set<string>>(new Set());',
    'listIncomingQualityRecords(),',
    'listProductionQualityTasks(),',
    'return runtimeIncomingQualityReferenceCodes.value.has(value)',
    'return runtimeProductionQualityReferenceCodes.value.has(value)',
  ]);
  expectExcludes('src/views/QualityDocumentEditorView.vue', [
    "if (currentKind.value === 'production') return '成品';",
    'v-if="![\'production\', \'incoming\'].includes(currentKind)',
    "'质检仓'",
    'return incomingQualityRows.some((row) => row.code === value)',
    'productionQualityRows.some((row) => row.code === value)',
  ]);
  expectIncludesAll('src/data/quality.ts', [
    "warehouse: '采购暂存区 / QC-01'",
    "warehouse: '采购暂存区 / QC-02'",
  ]);
  expectExcludes('src/data/quality.ts', [
    "warehouse: '质检仓 QC-01'",
    "warehouse: '质检仓 QC-02'",
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 338. 质检对象、任务日期与责任字段降噪（2026-08-05）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 311. 质检对象名称、责任联系人和暂存位置投影合同（2026-08-05）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 200. 质检字段语义与责任降噪第六轮复核（2026-08-05）');
});

run('purchase demand terminology and material-centered read-only suggestions', () => {
  expectIncludesAll('src/views/PurchaseView.vue', [
    "requisitions: '采购需求'",
    "return '待采购数量从高到低';",
    'purchase-suggestion-metrics',
    'row.demandQty',
    'row.orderedQty',
    'row.openQty',
    "status: '供应关系'",
    "'供应关系优先'",
    'purchase-suggestion-workspace',
    'purchase-suggestion-master-item',
    'text-only',
    'purchase-suggestion-master-company',
    'showSuggestionCompanyInMaster',
    "row.company || row.companyCode || '未指定公司'",
    "['suggestions', 'requisitions'].includes(activePage.value)",
    'visibleSuggestionRows.value.map((row) => row.key)',
    "selectedSuggestionKey.value = visibleKeys[0] || ''",
    'suggestionDetailRef',
    'suggestionDetailRef.value.scrollTop = 0',
    'aria-label="待采购物料"',
    '采购建议详情`',
    'purchase-suggestion-detail',
    'selectedSuggestionRow',
    'supplier.referenceOrderQty',
    'supplier.referenceSupplementQty',
    'suggestionSourceTypeLabel(source.sourceType)',
    '供方料号',
    'purchaseSuggestionDueLabel(selectedSuggestionRow.earliestExpectedDate)',
    '<MaterialIdentity',
    'suggestionStatusLabel(row)',
    '需求来源',
    '可选供应商',
    '需求总量',
    '原需求',
    'purchase-suggestion-master-due',
    "selectedSuggestionRow.supplierStatus === 'no-supplier'",
    '起订量高于当前需求',
    "activePage !== 'suggestions'",
    '.purchase-suggestion-detail {',
    'position: sticky;',
    'overflow-y: auto;',
    'overscroll-behavior: contain;',
    'background: #f0f5ef;',
    'box-shadow: inset 3px 0 #61866a;',
    '.purchase-suggestion-master-item.is-selected:hover',
    "'最早需求日从晚到早'",
    "'最早需求日从早到晚'",
    'grid-column: 1 / -1;',
    '查看采购需求',
    '参考下单',
    '超需求',
  ]);
  expectExcludes('src/views/PurchaseView.vue', [
    'selectedSuggestionLineKeysByGroup',
    'createOrderFromSuggestion',
    '生成订单（',
    'toggleSuggestionGroup(group, $event)',
    'recommendedSupplierCode',
    'recommendationStatus',
    'suggestionPreferredSupplierCount',
    '>优选<',
  ]);
  expectIncludesAll('src/views/PurchaseOrderEditorView.vue', [
    'purchaseLineSourceEntries(item)',
    'purchaseProgressQty(source.quantity, source.unit || item.uom || \'\')',
    'purchaseLineSourceAllocatedQty(item)',
    'purchaseLineStockSupplementQty(item)',
    '需求承接',
    '备库',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function purchaseSuggestionMaterials(data)',
    'demandQty: 0,',
    'orderedQty: 0,',
    'openQty: 0,',
    'referenceOrderQty,',
    'referenceSupplementQty:',
    "const supplierStatus = suppliers.length ? 'available' : 'no-supplier';",
    "supplierStatusLabel: supplierStatus === 'available' ? '有可选供应商' : '未维护供应关系'",
    "String(a.supplierName).localeCompare(String(b.supplierName), 'zh-CN')",
    "String(a.expectedDate || '9999-12-31').localeCompare(String(b.expectedDate || '9999-12-31'))",
    'sourceCount: sources.length,',
    "return sendError(res, 410, '采购建议仅提供只读参考；请从采购订单新建页选择供应商并承接开放采购需求。');",
    'allocation.sourceDocument = productionTaskSourceDocument(task);',
    'allocation.productCode = String(sourceLine.productCode || productCode).trim();',
    'allocation.dueDate = String(task.deliveryDate || allocation.dueDate || dueDate).trim();',
    'allocatedQty - parseQty(qty) > 0.0001',
    "expectedDate: String(requisition?.expectedDate || allocation.expectedDate || '').trim(),",
  ]);
  expectExcludes('server/index.mjs', [
    'function purchaseSuggestionGroups(data)',
    'function createPurchaseOrderFromSuggestion(data, body, actor)',
    'conflicting-defaults',
    'missing-default',
    'suggestedOrderQty',
  ]);
  expectIncludesAll('scripts/smoke-demand-consolidation.mjs', [
    'suggestion should separate ordered and open demand quantities',
    'suggestion should expose all supplier candidates without choosing one',
    'each supplier should calculate its own MOQ reference',
    'a lower-MOQ supplier should retain open demand without extra stock',
    'purchase suggestions must not expose a preferred supplier decision',
    'read-only suggestions must not create purchase orders directly',
  ]);
  expectIncludesAll('shared/system-menu-defaults.json', [
    '"name": "采购需求", "path": "/purchase/requisitions"',
    '"name": "采购建议", "path": "/purchase/suggestions"',
    '仅供采购决策参考',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 344. 采购建议选择、供应匹配与多来源权威快照收口（2026-08-06）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 345. 采购建议并发确认、维护入口与订单来源可读性（2026-08-06）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 317. 采购建议可见选择与来源规范化合同（2026-08-06）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 318. 采购建议快照门禁与来源分配可读合同（2026-08-06）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 346. 草稿工单版本预览与确认快照分层（2026-08-06）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 319. 生产工单版本预览与冻结事实合同（2026-08-06）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 347. 采购建议起订量、需求承接与备库差额分层（2026-08-06）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 320. 采购建议起订量与备库差额合同（2026-08-06）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 348. 采购需求命名、物料主体采购建议与订单决策分层（2026-08-06）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 321. 采购需求界面术语与只读采购建议合同（2026-08-06）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 349. 采购建议供应关系、备库指标与来源可读性收口（2026-08-06）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 322. 采购建议供应关系投影与优选冲突合同（2026-08-06）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 350. 采购建议供应商中立与主从工作区（2026-08-06）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 323. 采购建议供应商中立参考合同（2026-08-06）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 351. 采购建议扫描效率与字段降噪收口（2026-08-06）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 324. 采购建议显示口径与提醒投影合同（2026-08-06）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 352. 物料身份在列表与详情中的显示边界（2026-08-06）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 325. 物料身份列表与详情投影合同（2026-08-06）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 353. 采购建议主从滚动边界（2026-08-06）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 326. 采购建议主从可见性合同（2026-08-06）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 354. 采购建议列表选中反馈统一（2026-08-06）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 327. 采购建议列表交互状态投影合同（2026-08-06）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 355. 采购建议公司辨识、排序语义与候选中立收口（2026-08-06）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 328. 采购建议主体辨识与候选顺序合同（2026-08-06）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 356. 采购建议范围切换、供应商筛选与来源顺序收口（2026-08-06）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 329. 采购建议可见选择与来源顺序合同（2026-08-06）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 357. 采购建议详情滚动复位与窄屏字段完整性（2026-08-06）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 330. 采购建议详情视口与响应式字段合同（2026-08-06）');
});

run('production module interactions keep async facts, validation, and expanded states truthful', () => {
  const productionView = read('src/views/Production2View.vue');
  const taskOverviewStart = productionView.indexOf("if (row.page === 'tasks') {");
  const taskOverviewEnd = productionView.indexOf("if (row.page === 'work-orders') {", taskOverviewStart);
  const taskOverviewBlock = productionView.slice(taskOverviewStart, taskOverviewEnd);
  assert(
    taskOverviewStart >= 0 && taskOverviewEnd > taskOverviewStart && !taskOverviewBlock.includes('progress:'),
    'production tasks should not repeat inbound progress above the four status facts',
  );
  expectIncludesAll('src/views/Production2View.vue', [
    "activePage.value === 'tasks' && recipeRuntimeLoading.value && !recipeRuntimeHasSnapshot.value",
    "activePage.value === 'tasks') await Promise.all([loadPersistedWorkOrders(), loadPersistedRecipes()])",
    'function productionShortageExceptionStage(raw: AnyRecord | undefined)',
    "if (stage === '处理中') return '等待补充库存可用';",
    'function productionExceptionDispositionSummary(raw: AnyRecord)',
    'function validateTaskDraft() {\n  productionValidationAttempted.value = true;',
    'function validateMaterialRequestDraft() {\n  productionValidationAttempted.value = true;',
    'function validateRecipeDraft() {\n  productionValidationAttempted.value = true;',
    'processTemplateDraft.value.steps.forEach((step) => {',
    'line.expanded = shouldExpand;',
    'const processTemplateUnsavedSource = computed(() => ({',
    'delete persistedStep.expanded;',
    "if (activePage.value === 'process-templates') return processTemplateUnsavedSource.value;",
  ]);
  expectIncludesAll('src/views/HomeView.vue', [
    "pendingItem('备料申请待提交', '/production/material-requests')",
    "countStatus(snapshot.materialRequests, ['草稿'])",
  ]);
});

run('supplementary requirements propagate while document notes remain isolated', () => {
  expectIncludesAll('src/views/SalesOrderEditorView.vue', [
    'v-model="orderDraft.supplementaryRequirement"',
    'class="terms-textarea order-note-textarea"',
    '<h2>订单备注</h2>',
    'v-model="orderDraft.internalNote"',
    '<div class="order-internal-note-fact"><dt>订单备注（销售内部）</dt><dd>{{ orderDraft.internalNote?.trim() || \'—\' }}</dd></div>',
    "supplementaryRequirement: String(source.supplementaryRequirement ?? source.internalRemark ?? '').trim(),",
    "supplementaryRequirement: String(draft.supplementaryRequirement || '').trim(),",
    'const selectedOrderProductCount = computed',
    '<strong>{{ selectedOrderProductCount }} 项</strong>',
  ]);
  expectIncludesAll('src/styles/main.css', [
    '.form-field textarea.order-note-textarea {',
    '.order-detail-fact-grid .order-internal-note-fact {',
    '.order-internal-note-fact dd {',
  ]);
  const salesOrderFollowUpBlock = blockAfter(
    'src/views/SalesOrderEditorView.vue',
    '<div v-else class="quote-form-grid order-delivery-grid">',
    '<aside class="quote-summary-panel">',
    24000,
  );
  assert(!salesOrderFollowUpBlock.includes('orderDraft.internalNote'), 'sales order follow-up should not repeat the sales-only order note');
  expectIncludesAll('src/views/Production2View.vue', [
    '<span>补充要求（来自销售订单）</span>',
    ':value="taskDraft.supplementaryRequirement"',
    '<span>任务备注</span>',
    'class="work-order-source-context"',
    '<span>工单备注（选填）</span>',
    "title: '生产要求与备注'",
    'function workOrderRequirementFacts(raw: AnyRecord | undefined)',
    'function productionTaskBusinessNote(value: unknown)',
  ]);
  expectIncludesAll('src/views/WarehouseSalesIssueEditorView.vue', [
    '<span>补充要求</span>',
    'issueDraft.supplementaryRequirement || issueDraft.sourceRemark',
  ]);
  expectIncludesAll('src/views/QualityDocumentEditorView.vue', [
    'function productionSourceContextFacts(draft: QualityDocumentDraft)',
    'const seenTaskNotes = new Set<string>();',
    'const taskNote = productionTaskBusinessNote(source.taskNote);',
    'const workOrderNote = productionWorkOrderBusinessNote(draft.workOrderNote);',
    'return [...requirementFacts, ...taskNoteFacts, ...workOrderFacts];',
    '...productionSourceContextFacts(draft),',
  ]);
  expectIncludesAll('server/index.mjs', [
    'function hydrateSalesSupplementaryRequirements(data)',
    'function productionRequirementContextFromWorkOrder(order)',
    'function productionTaskBusinessNote(value)',
    'function productionWorkOrderBusinessNote(value)',
    "const internalNote = String(order.internalNote ?? '').trim();",
    'const requirement = salesOrderSupplementaryRequirement(order);',
    "internalNote: String(input.internalNote ?? existing?.internalNote ?? '').trim(),",
    'taskNote: productionTaskBusinessNote(allocation.taskNote)',
    'taskNote: productionTaskBusinessNote(allocation.taskNote || task?.note)',
    'sourceRemark: existing?.sourceRemark ?? salesOrderSupplementaryRequirement(sourceOrder)',
    'supplementaryRequirement: salesOrderSupplementaryRequirement(order)',
    'sourceRequirements,',
    'workOrderNote: productionWorkOrderBusinessNote(workOrder?.note),',
  ]);
  expectIncludesAll('src/views/AfterSalesDocumentView.vue', [
    "sourceRemark: order.supplementaryRequirement || order.internalRemark || ''",
    "record.kind === 'sales' ? '补充要求' : '原单备注'",
  ]);
  expectIncludesAll('scripts/smoke-sales.mjs', [
    'sales order lost the cross-document supplementary requirement',
    'delivery tracking lost the supplementary requirement or leaked the sales-only order note',
    'production task lost the supplementary requirement or leaked the sales-only order note',
    'production task accepted a client-forged source requirement or leaked the sales-only note',
    'sales order retained a whitespace-only sales internal note',
  ]);
  expectIncludesAll('scripts/smoke-flow.mjs', [
    'production task did not isolate the sales requirement, task note, and sales-only order note',
    'work order did not preserve per-task requirement context and its own independent note',
    'production quality task did not receive the read-only source requirement and document notes',
  ]);
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 375. 销售补充要求与各单据独立备注分层（2026-08-07）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 376. 补充要求下游投影与历史备注降噪（2026-08-07）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 377. 销售交付计划与实际出库仓库边界收口（2026-08-07）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 378. 销售订单备注阅读视角归位（2026-08-07）');
  expectIncludes('docs/erp-web-prototype-blueprint.md', '## 379. 销售备注空值与补充要求变更同步（2026-08-07）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 348. 补充要求传播与单据备注隔离合同（2026-08-07）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 349. 补充要求关联单据与历史备注归一化合同（2026-08-07）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 350. 销售出库实际仓库与只读交付要求合同（2026-08-07）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 351. 销售订单内部备注详情投影合同（2026-08-07）');
  expectIncludes('docs/erp-web-business-fact-model.md', '## 352. 销售文本规范化与补充要求权威同步合同（2026-08-07）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 221. 销售补充要求与生产/仓库/质检备注链路（2026-08-07）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 222. 补充要求关联单据与历史说明二次收口（2026-08-07）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 223. 销售交付与仓库实际拣货位置收口（2026-08-07）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 224. 销售订单备注详情归位（2026-08-07）');
  expectIncludes('docs/archive/erp-web-handoff-history-through-2026-08-07.md', '## 225. 销售备注空值与补充要求同步收口（2026-08-07）');
});

if (failed.length) {
  console.error('UI consistency audit failed:');
  for (const item of failed) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`UI consistency audit passed (${passed.length} checks).`);
