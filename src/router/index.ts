import { createRouter, createWebHistory } from 'vue-router';

import {
  accessDeniedHomeLocation,
  canAccessNavigationPath,
  routeWritePermission,
  useNavigationStore,
} from '../stores/navigation';
import { useSessionStore } from '../stores/session';
import { getPurchaseReceipt } from '../services/api';
import systemMenuDefaults from '../../shared/system-menu-defaults.json';

const AppLayout = () => import('../layouts/AppLayout.vue');
const AccountSecurityView = () => import('../views/AccountSecurityView.vue');
const AfterSalesDocumentView = () => import('../views/AfterSalesDocumentView.vue');
const AfterSalesExecutionListView = () => import('../views/AfterSalesExecutionListView.vue');
const AfterSalesExecutionTaskView = () => import('../views/AfterSalesExecutionTaskView.vue');
const EcommerceView = () => import('../views/EcommerceView.vue');
const EquipmentInspectionEditorView = () => import('../views/EquipmentInspectionEditorView.vue');
const EquipmentInspectionView = () => import('../views/EquipmentInspectionView.vue');
const HomeView = () => import('../views/HomeView.vue');
const LoginView = () => import('../views/LoginView.vue');
const MasterCustomerEditorView = () => import('../views/MasterCustomerEditorView.vue');
const MasterDataView = () => import('../views/MasterDataView.vue');
const MasterMaterialEditorView = () => import('../views/MasterMaterialEditorView.vue');
const MasterSimpleEditorView = () => import('../views/MasterSimpleEditorView.vue');
const MasterSupplierEditorView = () => import('../views/MasterSupplierEditorView.vue');
const MasterWarehouseEditorView = () => import('../views/MasterWarehouseEditorView.vue');
const ModuleView = () => import('../views/ModuleView.vue');
const PurchaseOrderEditorView = () => import('../views/PurchaseOrderEditorView.vue');
const PurchaseRequisitionEditorView = () => import('../views/PurchaseRequisitionEditorView.vue');
const PurchaseView = () => import('../views/PurchaseView.vue');
const Production2View = () => import('../views/Production2View.vue');
const ProductionWorkbenchDemoView = () => import('../views/ProductionWorkbenchDemoView.vue');
const QualityDocumentEditorView = () => import('../views/QualityDocumentEditorView.vue');
const QualityStandardEditorView = () => import('../views/QualityStandardEditorView.vue');
const QualityWorkbenchView = () => import('../views/QualityWorkbenchView.vue');
const QualityView = () => import('../views/QualityView.vue');
const SalesOrderEditorView = () => import('../views/SalesOrderEditorView.vue');
const SalesOrderPdfView = () => import('../views/SalesOrderPdfView.vue');
const SalesOutboundRequestView = () => import('../views/SalesOutboundRequestView.vue');
const SalesQuoteEditorView = () => import('../views/SalesQuoteEditorView.vue');
const SalesQuotePdfView = () => import('../views/SalesQuotePdfView.vue');
const SalesView = () => import('../views/SalesView.vue');
const WarehouseOperationEditorView = () => import('../views/WarehouseOperationEditorView.vue');
const WarehousePurchaseReceiptEditorView = () => import('../views/WarehousePurchaseReceiptEditorView.vue');
const WarehouseSalesIssueEditorView = () => import('../views/WarehouseSalesIssueEditorView.vue');
const WarehouseView = () => import('../views/WarehouseView.vue');

type SharedMenuDefault = {
  menuKey: string;
  children?: Array<{
    name: string;
    path: string;
  }>;
};

function pageTitleMapFromMenu(moduleKey: string) {
  const menu = (systemMenuDefaults as SharedMenuDefault[]).find((item) => item.menuKey === moduleKey);
  return Object.fromEntries(
    (menu?.children || [])
      .map((child) => {
        const [, childPage] = child.path.split('/').filter(Boolean);
        return [childPage, child.name] as const;
      })
      .filter(([childPage]) => Boolean(childPage)),
  );
}

const salesPageTitles = pageTitleMapFromMenu('sales');
const purchasePageTitles = pageTitleMapFromMenu('purchase');
const warehousePageTitles = pageTitleMapFromMenu('warehouse');
const productionPageTitles = pageTitleMapFromMenu('production');
const qualityPageTitles = pageTitleMapFromMenu('quality');
const ecommercePageTitles = pageTitleMapFromMenu('ecommerce');
const equipmentPageTitles = pageTitleMapFromMenu('equipment');
const masterDataPageTitles = pageTitleMapFromMenu('master-data');

function masterDataRouteSegment(page: string) {
  return page === 'productionLines' ? 'production-lines' : page;
}

const simpleMasterEditorPages = ['uom', 'currencies', 'departments', 'employees', 'company', 'equipment', 'productionLines'].map((page) => ({
  page,
  segment: masterDataRouteSegment(page),
  title: masterDataPageTitles[masterDataRouteSegment(page)] || masterDataPageTitles[page] || page,
}));

const simpleMasterEditorRoutes = simpleMasterEditorPages.flatMap(({ page, segment, title }) => [
  {
    path: `master-data/${segment}/new`,
    name: `master-${page}-new`,
    component: MasterSimpleEditorView,
    meta: {
      module: '基础资料',
      title: `新建${title}`,
      masterPage: page,
      masterTitle: title,
    },
  },
  {
    path: `master-data/${segment}/:code/edit`,
    name: `master-${page}-edit`,
    component: MasterSimpleEditorView,
    meta: {
      module: '基础资料',
      title: `编辑${title}`,
      masterPage: page,
      masterTitle: title,
    },
  },
  {
    path: `master-data/${segment}/:code`,
    name: `master-${page}-detail`,
    component: MasterSimpleEditorView,
    meta: {
      module: '基础资料',
      title: `${title}详情`,
      masterPage: page,
      masterTitle: title,
    },
  },
]);

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: {
        title: '登录',
      },
    },
    {
      path: '/sales/quotes/:code/pdf',
      name: 'sales-quote-pdf',
      component: SalesQuotePdfView,
      meta: {
        title: '报价单 PDF 预览',
        authenticatedOnly: true,
      },
    },
    {
      path: '/sales/orders/:code/pdf',
      name: 'sales-order-pdf',
      component: SalesOrderPdfView,
      meta: {
        title: '销售订单 PDF 预览',
        authenticatedOnly: true,
      },
    },
    {
      path: '/purchase/orders/:code/pdf',
      name: 'purchase-order-pdf',
      component: SalesOrderPdfView,
      meta: {
        title: '采购订单 PDF 预览',
        authenticatedOnly: true,
      },
    },
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          name: 'home',
          component: HomeView,
          meta: {
            module: '首页',
            title: '待办看板',
          },
        },
        {
          path: 'account/security',
          name: 'account-security',
          component: AccountSecurityView,
          meta: {
            module: '账号',
            title: '账号安全',
            authenticatedOnly: true,
          },
        },
        {
          path: 'sales',
          redirect: '/sales/quotes',
        },
        {
          path: 'sales/quotes/new',
          name: 'sales-quote-new',
          component: SalesQuoteEditorView,
          meta: {
            module: '销售',
            title: '新建报价单',
          },
        },
        {
          path: 'sales/quotes/:code/edit',
          name: 'sales-quote-edit',
          component: SalesQuoteEditorView,
          meta: {
            module: '销售',
            title: '编辑报价单',
          },
        },
        {
          path: 'sales/quotes/:code',
          name: 'sales-quote-detail',
          component: SalesQuoteEditorView,
          meta: {
            module: '销售',
            title: '报价单详情',
          },
        },
        {
          path: 'sales/orders/new',
          name: 'sales-order-new',
          component: SalesOrderEditorView,
          meta: {
            module: '销售',
            title: '新建销售订单',
          },
        },
        {
          path: 'sales/orders/:code/edit',
          name: 'sales-order-edit',
          component: SalesOrderEditorView,
          meta: {
            module: '销售',
            title: '编辑销售订单',
          },
        },
        {
          path: 'sales/orders/:code/delivery',
          name: 'sales-order-delivery',
          component: SalesOrderEditorView,
          meta: {
            module: '销售',
            title: '销售订单跟进',
          },
        },
        {
          path: 'sales/orders/:code',
          name: 'sales-order-detail',
          component: SalesOrderEditorView,
          meta: {
            module: '销售',
            title: '销售订单详情',
          },
        },
        {
          path: 'sales/outbound-requests/new',
          name: 'sales-outbound-request-new',
          redirect: '/sales/outbound-requests',
          meta: {
            module: '销售',
            title: '交付追踪',
          },
        },
        {
          path: 'sales/outbound-requests/:code/edit',
          name: 'sales-outbound-request-edit',
          component: SalesOutboundRequestView,
          meta: {
            module: '销售',
            title: '交付追踪详情',
          },
        },
        {
          path: 'sales/outbound-requests/:code',
          name: 'sales-outbound-request-detail',
          component: SalesOutboundRequestView,
          meta: {
            module: '销售',
            title: '交付追踪详情',
          },
        },
        {
          path: 'sales/after-sales/new',
          name: 'sales-after-sale-new',
          component: AfterSalesDocumentView,
          meta: {
            module: '销售',
            title: '新建销售售后',
            afterSalesKind: 'sales',
          },
        },
        {
          path: 'sales/after-sales/:code/edit',
          name: 'sales-after-sale-edit',
          component: AfterSalesDocumentView,
          meta: {
            module: '销售',
            title: '编辑销售售后',
            afterSalesKind: 'sales',
          },
        },
        {
          path: 'sales/after-sales/:code',
          name: 'sales-after-sale-detail',
          component: AfterSalesDocumentView,
          meta: {
            module: '销售',
            title: '销售售后详情',
            afterSalesKind: 'sales',
          },
        },
        {
          path: 'sales/:page',
          name: 'sales',
          component: SalesView,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (!page || !(page in salesPageTitles)) {
              return '/sales/quotes';
            }

            to.meta.module = '销售';
            to.meta.title = salesPageTitles[page as keyof typeof salesPageTitles];
            return true;
          },
        },
        {
          path: 'purchase',
          redirect: '/purchase/requisitions',
        },
        {
          path: 'purchase/requisitions/new',
          name: 'purchase-requisition-new',
          component: PurchaseRequisitionEditorView,
          meta: {
            module: '采购',
            title: '新建采购需求',
          },
        },
        {
          path: 'purchase/requisitions/:code/edit',
          name: 'purchase-requisition-edit',
          component: PurchaseRequisitionEditorView,
          meta: {
            module: '采购',
            title: '编辑采购需求',
          },
        },
        {
          path: 'purchase/requisitions/:code',
          name: 'purchase-requisition-detail',
          component: PurchaseRequisitionEditorView,
          meta: {
            module: '采购',
            title: '采购需求详情',
          },
        },
        {
          path: 'purchase/orders/new',
          name: 'purchase-order-new',
          component: PurchaseOrderEditorView,
          meta: {
            module: '采购',
            title: '新建采购订单',
          },
        },
        {
          path: 'purchase/orders/:code/edit',
          name: 'purchase-order-edit',
          component: PurchaseOrderEditorView,
          meta: {
            module: '采购',
            title: '编辑采购订单',
          },
        },
        {
          path: 'purchase/orders/:code/follow-up',
          name: 'purchase-order-follow-up',
          component: PurchaseOrderEditorView,
          meta: {
            module: '采购',
            title: '采购订单跟进',
          },
        },
        {
          path: 'purchase/orders/:code',
          name: 'purchase-order-detail',
          component: PurchaseOrderEditorView,
          meta: {
            module: '采购',
            title: '采购订单详情',
          },
        },
        {
          path: 'purchase/after-sales/new',
          name: 'purchase-after-sale-new',
          component: AfterSalesDocumentView,
          meta: {
            module: '采购',
            title: '新建采购售后',
            afterSalesKind: 'purchase',
          },
        },
        {
          path: 'purchase/after-sales/:code/edit',
          name: 'purchase-after-sale-edit',
          component: AfterSalesDocumentView,
          meta: {
            module: '采购',
            title: '编辑采购售后',
            afterSalesKind: 'purchase',
          },
        },
        {
          path: 'purchase/after-sales/:code',
          name: 'purchase-after-sale-detail',
          component: AfterSalesDocumentView,
          meta: {
            module: '采购',
            title: '采购售后详情',
            afterSalesKind: 'purchase',
          },
        },
        {
          path: 'purchase/receipts',
          redirect: '/purchase/orders',
        },
        {
          path: 'purchase/receipts/:pathMatch(.*)*',
          redirect: '/purchase/orders',
        },
        {
          path: 'purchase/:page',
          name: 'purchase',
          component: PurchaseView,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (!page || !(page in purchasePageTitles)) {
              return '/purchase/requisitions';
            }

            to.meta.module = '采购';
            to.meta.title = purchasePageTitles[page as keyof typeof purchasePageTitles];
            return true;
          },
        },
        {
          path: 'warehouse',
          redirect: '/warehouse/purchase-receipts',
        },
        {
          path: 'warehouse/purchase-receipts/new',
          redirect: '/warehouse/purchase-receipts',
        },
        {
          path: 'warehouse/purchase-receipts/:code/edit',
          redirect: (to) => ({
            name: 'warehouse-purchase-receipt-detail',
            params: { code: to.params.code },
          }),
        },
        {
          path: 'warehouse/purchase-receipts/:code',
          name: 'warehouse-purchase-receipt-detail',
          component: WarehousePurchaseReceiptEditorView,
          meta: {
            module: '仓库',
            title: '采购入库详情',
          },
        },
        {
          path: 'warehouse/sales-issues/new',
          redirect: '/warehouse/sales-issues',
        },
        {
          path: 'warehouse/sales-issues/:code/edit',
          redirect: (to) => ({
            name: 'warehouse-sales-issue-detail',
            params: { code: to.params.code },
          }),
        },
        {
          path: 'warehouse/sales-issues/:code',
          name: 'warehouse-sales-issue-detail',
          component: WarehouseSalesIssueEditorView,
          meta: {
            module: '仓库',
            title: '销售出库详情',
          },
        },
        {
          path: 'warehouse/production-issues/new',
          name: 'warehouse-production-issue-new',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '新建生产领料',
            warehouseDocumentKind: 'productionIssues',
          },
        },
        {
          path: 'warehouse/production-issues/:code/edit',
          name: 'warehouse-production-issue-edit',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '编辑生产领料',
            warehouseDocumentKind: 'productionIssues',
          },
        },
        {
          path: 'warehouse/production-issues/:code',
          name: 'warehouse-production-issue-detail',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '生产领料详情',
            warehouseDocumentKind: 'productionIssues',
          },
        },
        {
          path: 'warehouse/production-returns/new',
          name: 'warehouse-production-return-new',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '新建生产退料',
            warehouseDocumentKind: 'productionReturns',
          },
        },
        {
          path: 'warehouse/production-returns/:code/edit',
          name: 'warehouse-production-return-edit',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '编辑生产退料',
            warehouseDocumentKind: 'productionReturns',
          },
        },
        {
          path: 'warehouse/production-returns/:code',
          name: 'warehouse-production-return-detail',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '生产退料详情',
            warehouseDocumentKind: 'productionReturns',
          },
        },
        {
          path: 'warehouse/production-receipts/new',
          name: 'warehouse-production-receipt-new',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '新建完工入库',
            warehouseDocumentKind: 'productionReceipts',
          },
        },
        {
          path: 'warehouse/production-receipts/:code/edit',
          redirect: (to) => `/warehouse/production-receipts/${to.params.code}`,
        },
        {
          path: 'warehouse/production-receipts/:code',
          name: 'warehouse-production-receipt-detail',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '完工入库详情',
            warehouseDocumentKind: 'productionReceipts',
          },
        },
        {
          path: 'warehouse/production-moves/new',
          redirect: '/warehouse/production-issues',
        },
        {
          path: 'warehouse/production-moves/:code/edit',
          redirect: (to) => `/warehouse/production-issues/${to.params.code}/edit`,
        },
        {
          path: 'warehouse/production-moves/:code',
          redirect: (to) => `/warehouse/production-issues/${to.params.code}`,
        },
        {
          path: 'warehouse/other-moves/new',
          name: 'warehouse-other-move-new',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '新建其他出入库',
            warehouseDocumentKind: 'otherMoves',
          },
        },
        {
          path: 'warehouse/other-moves/:code/edit',
          name: 'warehouse-other-move-edit',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '编辑其他出入库',
            warehouseDocumentKind: 'otherMoves',
          },
        },
        {
          path: 'warehouse/other-moves/:code',
          name: 'warehouse-other-move-detail',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '其他出入库详情',
            warehouseDocumentKind: 'otherMoves',
          },
        },
        {
          path: 'warehouse/transfers/new',
          name: 'warehouse-transfer-new',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '新建调拨单',
            warehouseDocumentKind: 'transfers',
          },
        },
        {
          path: 'warehouse/transfers/:code/edit',
          name: 'warehouse-transfer-edit',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '编辑调拨单',
            warehouseDocumentKind: 'transfers',
          },
        },
        {
          path: 'warehouse/transfers/:code',
          name: 'warehouse-transfer-detail',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '库存调拨详情',
            warehouseDocumentKind: 'transfers',
          },
        },
        {
          path: 'warehouse/stocktakes/new',
          name: 'warehouse-stocktake-new',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '新建盘点',
            warehouseDocumentKind: 'stocktakes',
          },
        },
        {
          path: 'warehouse/stocktakes/:code/edit',
          name: 'warehouse-stocktake-edit',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '编辑盘点',
            warehouseDocumentKind: 'stocktakes',
          },
        },
        {
          path: 'warehouse/stocktakes/:code',
          name: 'warehouse-stocktake-detail',
          component: WarehouseOperationEditorView,
          meta: {
            module: '仓库',
            title: '库存盘点详情',
            warehouseDocumentKind: 'stocktakes',
          },
        },
        {
          path: 'warehouse/batches',
          redirect: '/warehouse/inventory?view=batch',
        },
        {
          path: 'warehouse/after-sales/:code',
          name: 'warehouse-after-sales-task',
          component: AfterSalesExecutionTaskView,
          meta: {
            module: '仓库',
            title: '售后作业',
            afterSalesExecutionModule: 'warehouse',
          },
        },
        {
          path: 'warehouse/:page',
          name: 'warehouse',
          component: WarehouseView,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (!page || !(page in warehousePageTitles)) {
              return '/warehouse/purchase-receipts';
            }

            to.meta.module = '仓库';
            to.meta.title = warehousePageTitles[page as keyof typeof warehousePageTitles];
            return true;
          },
        },
        {
          path: 'production',
          redirect: '/production/workbench',
        },
        {
          path: 'production/workbench',
          name: 'production-workbench',
          component: ProductionWorkbenchDemoView,
          meta: {
            module: '生产',
            title: productionPageTitles.workbench || '生产工作台',
          },
        },
        {
          path: 'production/after-sales',
          name: 'production-after-sales',
          component: AfterSalesExecutionListView,
          meta: {
            module: '生产',
            title: '售后返修',
            afterSalesExecutionModule: 'production',
          },
        },
        {
          path: 'production/after-sales/:code',
          name: 'production-after-sales-task',
          component: AfterSalesExecutionTaskView,
          meta: {
            module: '生产',
            title: '售后返工作业',
            afterSalesExecutionModule: 'production',
          },
        },
        {
          path: 'production/quality',
          redirect: '/quality/production',
        },
        {
          path: 'production/quality/:code',
          redirect: (to) => {
            const code = to.params.code?.toString() || '';
            return code.startsWith('QSTD') ? '/quality/standards' : '/quality/production';
          },
        },
        {
          path: 'production/quality-standards',
          redirect: '/quality/standards',
        },
        {
          path: 'production/quality-standards/:code',
          redirect: (to) => {
            const code = to.params.code?.toString() || '';
            return code.startsWith('QSTD') ? '/quality/standards' : '/quality/production';
          },
        },
        {
          path: 'production/:page/new',
          name: 'production-document-new',
          component: Production2View,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (page === 'formula-process') {
              return '/production/recipes/new';
            }
            if (page === 'loss-ledger') {
              return '/production/loss-ledger';
            }
            if (page === 'process-steps') {
              return '/production/process-steps';
            }
            if (!page || page === 'workbench' || !(page in productionPageTitles)) {
              return '/production/workbench';
            }

            to.meta.module = '生产';
            to.meta.title = `新建${productionPageTitles[page as keyof typeof productionPageTitles]}`;
            return true;
          },
        },
        {
          path: 'production/:page/:code/edit',
          name: 'production-document-edit',
          component: Production2View,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (page === 'formula-process') {
              return `/production/recipes/${to.params.code?.toString() || ''}/edit`;
            }
            if (page === 'loss-ledger') {
              return '/production/loss-ledger';
            }
            if (page === 'process-steps') {
              const code = to.params.code?.toString() || '';
              return code
                ? `/production/process-steps/${encodeURIComponent(code)}`
                : '/production/process-steps';
            }
            if (!page || page === 'workbench' || !(page in productionPageTitles)) {
              return '/production/workbench';
            }

            const editTitlePrefix = ['recipes', 'process-templates', 'process-steps'].includes(page) ? '编辑' : '变更';
            to.meta.module = '生产';
            to.meta.title = `${editTitlePrefix}${productionPageTitles[page as keyof typeof productionPageTitles]}`;
            return true;
          },
        },
        {
          path: 'production/:page/:code',
          name: 'production-document-detail',
          component: Production2View,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (page === 'formula-process') {
              return `/production/recipes/${to.params.code?.toString() || ''}`;
            }
            if (!page || page === 'workbench' || !(page in productionPageTitles)) {
              return '/production/workbench';
            }

            to.meta.module = '生产';
            to.meta.title = `${productionPageTitles[page as keyof typeof productionPageTitles]}详情`;
            return true;
          },
        },
        {
          path: 'production/:page',
          name: 'production',
          component: Production2View,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (page === 'formula-process') {
              return '/production/recipes';
            }
            if (!page || !(page in productionPageTitles)) {
              return '/production/workbench';
            }

            to.meta.module = '生产';
            to.meta.title = productionPageTitles[page as keyof typeof productionPageTitles];
            return true;
          },
        },
        {
          path: 'production2',
          redirect: '/production/workbench',
        },
        {
          path: 'production2/workbench2',
          redirect: '/production/workbench',
        },
        {
          path: 'production2/:page',
          redirect: (to) => {
            const rawPage = to.params.page;
            const page = Array.isArray(rawPage) ? rawPage[0] : rawPage?.toString();
            return {
              path: `/production/${page === 'formula-process' ? 'recipes' : page || 'workbench'}`,
              query: to.query,
            };
          },
        },
        {
          path: 'quality',
          redirect: '/quality/workbench',
        },
        {
          path: 'quality/workbench',
          name: 'quality-workbench',
          component: QualityWorkbenchView,
          meta: {
            module: '质检',
            title: qualityPageTitles.workbench || '质量工作台',
          },
        },
        {
          path: 'quality/standards/new',
          name: 'quality-standard-new',
          component: QualityStandardEditorView,
          meta: {
            module: '质检',
            title: '新建质检标准',
          },
        },
        {
          path: 'quality/standards/:code/edit',
          name: 'quality-standard-edit',
          component: QualityStandardEditorView,
          meta: {
            module: '质检',
            title: '维护质检标准',
          },
        },
        {
          path: 'quality/standards/:code',
          name: 'quality-standard-detail',
          component: QualityStandardEditorView,
          meta: {
            module: '质检',
            title: '质检标准详情',
          },
        },
        {
          path: 'quality/after-sales',
          name: 'quality-after-sales',
          component: AfterSalesExecutionListView,
          meta: {
            module: '质检',
            title: '售后检验',
            afterSalesExecutionModule: 'quality',
          },
        },
        {
          path: 'quality/after-sales/:code',
          name: 'quality-after-sales-task',
          component: AfterSalesExecutionTaskView,
          meta: {
            module: '质检',
            title: '售后检验作业',
            afterSalesExecutionModule: 'quality',
          },
        },
        {
          path: 'quality/:page/new',
          name: 'quality-document-new',
          component: QualityDocumentEditorView,
          beforeEnter: async (to) => {
            const page = to.params.page?.toString();
            if (!page || page === 'workbench' || !(page in qualityPageTitles)) {
              return '/quality/workbench';
            }
            if (page === 'standards') {
              return '/quality/standards';
            }
            if (page === 'production') {
              return '/quality/production';
            }
            if (page === 'incoming') {
              const source = to.query.source?.toString().trim();
              if (!source) return '/quality/incoming';
              try {
                const response = await getPurchaseReceipt(source);
                const qualityCode = response.receipt.qualityTaskCode
                  || (source.startsWith('WR-') ? source.replace(/^WR-/, 'IQC-') : `IQC-${source}`);
                return `/quality/incoming/${encodeURIComponent(qualityCode)}`;
              } catch {
                return '/quality/incoming';
              }
            }

            to.meta.module = '质检';
            to.meta.title = `新建${qualityPageTitles[page as keyof typeof qualityPageTitles]}`;
            return true;
          },
        },
        {
          path: 'quality/:page/:code/edit',
          name: 'quality-document-edit',
          component: QualityDocumentEditorView,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (!page || page === 'workbench' || !(page in qualityPageTitles)) {
              return '/quality/workbench';
            }
            if (page === 'standards') {
              return '/quality/standards';
            }

            to.meta.module = '质检';
            to.meta.title = `${qualityPageTitles[page as keyof typeof qualityPageTitles]}变更`;
            return true;
          },
        },
        {
          path: 'quality/:page/:code',
          name: 'quality-document-detail',
          component: QualityDocumentEditorView,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (!page || page === 'workbench' || !(page in qualityPageTitles)) {
              return '/quality/workbench';
            }
            if (page === 'standards') {
              return '/quality/standards';
            }

            to.meta.module = '质检';
            to.meta.title = `${qualityPageTitles[page as keyof typeof qualityPageTitles]}详情`;
            return true;
          },
        },
        {
          path: 'quality/:page',
          name: 'quality',
          component: QualityView,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (!page || !(page in qualityPageTitles)) {
              return '/quality/workbench';
            }

            to.meta.module = '质检';
            to.meta.title = qualityPageTitles[page as keyof typeof qualityPageTitles];
            return true;
          },
        },
        {
          path: 'ecommerce',
          redirect: '/ecommerce/workbench',
        },
        {
          path: 'ecommerce/:page',
          name: 'ecommerce',
          component: EcommerceView,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (!page || !(page in ecommercePageTitles)) {
              return '/ecommerce/workbench';
            }

            to.meta.module = '电商';
            to.meta.title = ecommercePageTitles[page as keyof typeof ecommercePageTitles];
            return true;
          },
        },
        {
          path: 'equipment',
          redirect: '/equipment/inspection-tasks',
        },
        {
          path: 'equipment/:page/new',
          name: 'equipment-inspection-new',
          component: EquipmentInspectionEditorView,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (!page || page === 'inspection-tasks' || !(page in equipmentPageTitles)) {
              return '/equipment/inspection-tasks';
            }
            to.meta.module = '设备';
            to.meta.title = `新建${equipmentPageTitles[page as keyof typeof equipmentPageTitles]}`;
            return true;
          },
        },
        {
          path: 'equipment/:page/:code/edit',
          name: 'equipment-inspection-edit',
          component: EquipmentInspectionEditorView,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            const code = encodeURIComponent(to.params.code?.toString() || '');
            if (!page || !(page in equipmentPageTitles)) return '/equipment/inspection-tasks';
            if (page === 'inspection-tasks') return `/equipment/${page}/${code}`;
            to.meta.module = '设备';
            to.meta.title = `编辑${equipmentPageTitles[page as keyof typeof equipmentPageTitles]}`;
            return true;
          },
        },
        {
          path: 'equipment/:page/:code',
          name: 'equipment-inspection-detail',
          component: EquipmentInspectionEditorView,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (!page || !(page in equipmentPageTitles)) return '/equipment/inspection-tasks';
            to.meta.module = '设备';
            to.meta.title = `${equipmentPageTitles[page as keyof typeof equipmentPageTitles]}详情`;
            return true;
          },
        },
        {
          path: 'equipment/:page',
          name: 'equipment-inspection',
          component: EquipmentInspectionView,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (!page || !(page in equipmentPageTitles)) return '/equipment/inspection-tasks';
            to.meta.module = '设备';
            to.meta.title = equipmentPageTitles[page as keyof typeof equipmentPageTitles];
            return true;
          },
        },
        {
          path: 'finance/:pathMatch(.*)*',
          redirect: '/',
        },
        {
          path: 'reports/:pathMatch(.*)*',
          redirect: '/',
        },
        {
          path: 'master-data',
          redirect: '/master-data/materials',
        },
        {
          path: 'master-data/customers/new',
          name: 'master-customer-new',
          component: MasterCustomerEditorView,
          meta: {
            module: '基础资料',
            title: '新建客户',
          },
        },
        {
          path: 'master-data/customers/:code/edit',
          name: 'master-customer-edit',
          component: MasterCustomerEditorView,
          meta: {
            module: '基础资料',
            title: '编辑客户',
          },
        },
        {
          path: 'master-data/customers/:code',
          name: 'master-customer-detail',
          component: MasterCustomerEditorView,
          meta: {
            module: '基础资料',
            title: '客户详情',
          },
        },
        {
          path: 'master-data/materials/new',
          name: 'master-material-new',
          component: MasterMaterialEditorView,
          meta: {
            module: '基础资料',
            title: '新建物料',
          },
        },
        {
          path: 'master-data/materials/:code/edit',
          name: 'master-material-edit',
          component: MasterMaterialEditorView,
          meta: {
            module: '基础资料',
            title: '编辑物料',
          },
        },
        {
          path: 'master-data/materials/:code',
          name: 'master-material-detail',
          component: MasterMaterialEditorView,
          meta: {
            module: '基础资料',
            title: '物料详情',
          },
        },
        {
          path: 'master-data/suppliers/new',
          name: 'master-supplier-new',
          component: MasterSupplierEditorView,
          meta: {
            module: '基础资料',
            title: '新建供应商',
          },
        },
        {
          path: 'master-data/suppliers/:code/edit',
          name: 'master-supplier-edit',
          component: MasterSupplierEditorView,
          meta: {
            module: '基础资料',
            title: '编辑供应商',
          },
        },
        {
          path: 'master-data/suppliers/:code',
          name: 'master-supplier-detail',
          component: MasterSupplierEditorView,
          meta: {
            module: '基础资料',
            title: '供应商详情',
          },
        },
        {
          path: 'master-data/warehouses/new',
          name: 'master-warehouse-new',
          component: MasterWarehouseEditorView,
          meta: {
            module: '基础资料',
            title: '新建仓库',
          },
        },
        {
          path: 'master-data/warehouses/:code/edit',
          name: 'master-warehouse-edit',
          component: MasterWarehouseEditorView,
          meta: {
            module: '基础资料',
            title: '编辑仓库',
          },
        },
        {
          path: 'master-data/warehouses/:code',
          name: 'master-warehouse-detail',
          component: MasterWarehouseEditorView,
          meta: {
            module: '基础资料',
            title: '仓库详情',
          },
        },
        ...simpleMasterEditorRoutes,
        {
          path: 'master-data/:page',
          name: 'master-data',
          component: MasterDataView,
          beforeEnter: (to) => {
            const page = to.params.page?.toString();
            if (!page || !(page in masterDataPageTitles)) {
              return '/master-data/materials';
            }

            to.meta.module = '基础资料';
            to.meta.title = masterDataPageTitles[page as keyof typeof masterDataPageTitles];
            return true;
          },
        },
        {
          path: ':moduleKey',
          name: 'module',
          component: ModuleView,
          meta: {
            title: '模块工作台',
          },
        },
        {
          path: ':moduleKey/:pageKey',
          name: 'module-page',
          component: ModuleView,
          meta: {
            title: '模块工作台',
          },
        },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  const navigation = useNavigationStore();

  if (to.path === '/login') {
    await session.loadUserFromAccounts();
    if (!session.authRequired) return '/';
    navigation.clearMenus();
    return true;
  }

  await Promise.all([session.loadUserFromAccounts(), navigation.loadMenus()]);

  if (session.authRequired) {
    navigation.clearMenus();
    return {
      path: '/login',
      query: to.fullPath === '/' ? undefined : { redirect: to.fullPath },
    };
  }

  if (to.path === '/') {
    return true;
  }

  if (navigation.error) {
    await navigation.loadMenus(true);
  }

  if (to.meta.authenticatedOnly) {
    return true;
  }

  if (
    navigation.error ||
    !canAccessNavigationPath(
      navigation.menuRows,
      to.path,
      (permissionCode) => session.hasPermission(permissionCode),
      navigation.loaded,
    )
  ) {
    return accessDeniedHomeLocation(navigation.error ? 'navigation' : 'menu', to.fullPath);
  }

  const writePermission = routeWritePermission(to.path);
  if (writePermission && !session.hasPermission(writePermission)) return accessDeniedHomeLocation('write', to.fullPath);

  return true;
});

export default router;
