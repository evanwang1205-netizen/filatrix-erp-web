const quantityEpsilon = 0.0001;

export function purchaseReceiptArrivalStateLabel(status: string) {
  if (status === '已取消') return '已取消';
  if (['草稿', '待收货'].includes(status)) return '待到货';
  if (status === '已拒收') return '已拒收';
  if (status === '异常暂收') return '异常暂收';
  return '已到货';
}

export function purchaseReceiptQualityStateLabel(input: {
  requiresQuality: boolean;
  arrivalPending: boolean;
  accepted: number;
  pending: number;
  released: number;
  rejected: number;
}) {
  if (!input.requiresQuality) return '无需质检';
  if (input.arrivalPending) return '未开始';
  if (input.accepted <= quantityEpsilon) return '未送检';
  if (input.pending > quantityEpsilon) {
    if (input.released > quantityEpsilon) return '部分放行';
    if (input.rejected > quantityEpsilon) return '部分判定';
    return '待质检';
  }
  if (input.released > quantityEpsilon && input.rejected > quantityEpsilon) return '部分放行';
  if (input.released > quantityEpsilon) return '已放行';
  if (input.rejected > quantityEpsilon) return '不合格';
  return '待质检';
}

export function purchaseReceiptInboundStateLabel(input: {
  taskStatus: string;
  stockStage?: string;
  posted: number;
  available: number;
}) {
  if (input.taskStatus === '已取消' || ['草稿', '待收货'].includes(input.taskStatus)) return '未开始';
  if (input.taskStatus === '已入库' || input.stockStage === 'posted') return '已入库';
  if (input.taskStatus === '已拒收') return '无需入库';
  if (input.posted > quantityEpsilon) return '部分入库';
  if (input.available > quantityEpsilon) return '待入库';
  if (input.taskStatus === '异常暂收') return '待处置';
  if (input.taskStatus === '质检不合格') return '未放行';
  return '未开始';
}

export function purchaseReceiptArrivalExceptionLabel(input: {
  refused: number;
  exceptionHeld: number;
  handlingStatus?: string;
}) {
  const handling = input.handlingStatus?.trim();
  if (input.exceptionHeld > quantityEpsilon) {
    return handling ? `异常暂收 · ${handling}` : '异常暂收';
  }
  if (input.refused > quantityEpsilon) {
    return handling ? `当场拒收 · ${handling}` : '当场拒收';
  }
  return '无';
}
