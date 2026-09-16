import type { PurchaseRequisition } from '../types/business';

export type PurchaseRequisitionSourceLink = {
  label: string;
  code: string;
  path: string;
};

function value(input: unknown) {
  return String(input ?? '').trim();
}

export function purchaseRequisitionSourceKind(requisition: Partial<PurchaseRequisition>) {
  const sourceType = value(requisition.sourceType);
  if (sourceType) return sourceType === '手工申请' ? '手工提出' : sourceType;
  if (value(requisition.sourceMaterialRequest)) {
    return value(requisition.sourceProductionTask) ? '生产任务缺口' : '临时备料缺口';
  }
  if (value(requisition.sourceReplenishmentCode)) return '库存补货';
  return '手工提出';
}

export function purchaseRequisitionSourceSummary(requisition: Partial<PurchaseRequisition>) {
  const sourceKind = purchaseRequisitionSourceKind(requisition);
  if (sourceKind === '生产任务缺口') {
    return `${sourceKind} · ${value(requisition.sourceProductionTask) || value(requisition.sourceMaterialRequest)}`;
  }
  if (sourceKind === '临时备料缺口') {
    return `${sourceKind} · ${value(requisition.sourceMaterialRequest)}`;
  }
  if (sourceKind === '库存补货') {
    return `${sourceKind} · ${value(requisition.sourceWarehouseName) || value(requisition.sourceReplenishmentCode)}`;
  }
  return sourceKind;
}

export function purchaseRequisitionSourceSearchValues(requisition: Partial<PurchaseRequisition>) {
  return [
    purchaseRequisitionSourceKind(requisition),
    purchaseRequisitionSourceSummary(requisition),
    requisition.sourceMaterialRequest,
    requisition.sourceProductionTask,
    requisition.sourceReplenishmentCode,
    requisition.sourceWarehouseCode,
    requisition.sourceWarehouseName,
  ];
}

export function purchaseRequisitionSourceLinks(requisition: Partial<PurchaseRequisition>): PurchaseRequisitionSourceLink[] {
  const links: PurchaseRequisitionSourceLink[] = [];
  const productionTask = value(requisition.sourceProductionTask);
  const materialRequest = value(requisition.sourceMaterialRequest);
  const replenishmentCode = value(requisition.sourceReplenishmentCode);

  if (productionTask) {
    links.push({
      label: '生产任务',
      code: productionTask,
      path: `/production/tasks/${encodeURIComponent(productionTask)}`,
    });
  }
  if (materialRequest) {
    links.push({
      label: '备料申请',
      code: materialRequest,
      path: `/production/material-requests/${encodeURIComponent(materialRequest)}`,
    });
  }
  if (replenishmentCode) {
    links.push({
      label: '补货建议',
      code: replenishmentCode,
      path: `/warehouse/inventory-alerts?tab=replenishment&keyword=${encodeURIComponent(replenishmentCode)}`,
    });
  }

  return links;
}
