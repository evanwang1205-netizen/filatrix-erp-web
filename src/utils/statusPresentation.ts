import type { DocumentStatusTone } from '../types/documentUi';

export function statusPresentationTone(value: unknown): DocumentStatusTone {
  const status = String(value ?? '').trim();
  if (!status || status === '-') return 'neutral';
  if (/^无$|草稿|作废|取消|停用|已冲销|已红冲|无需提示|无需处理|无需质检|无需入库|无异常|无差异|无风险/.test(status)) return 'neutral';
  if (/异常|不合格|待处置|中断|停止|暂停|缺料|告急|退货|退回|拒收|驳回|失败|冻结|报废|逾期|超期|滞留|阻断/.test(status)) return 'danger';
  if (/待|部分|未|不足|暂缓|供应商确认|维护中|需补货|临近|预警|关注|提醒|已占用|全部占用|无可用库存|待转可用/.test(status)) return 'warning';
  if (/执行|流转中|进行中|生产中|处理中|处置中|返工中|检验中|巡检中|发货中|调拨中|盘点中|跟踪|作业|运输|在途|已确认|已提交|已受理|已建单|已释放|已审核|已生成|已发送|已申请出库/.test(status)) return 'info';
  if (/启用|合格|完成|关闭|签收|开票|收票|收款|付款|结清|核销|已转|已发完|已发货|入库|出库|到货|验收|登记|入账|放行|齐套|充足|可发|可承诺|可用|通过|正常|过账|免检|让步接收|已领料|已报工|已包装/.test(status)) return 'success';
  return 'neutral';
}

export function statusPresentationClass(value: unknown) {
  const tone = statusPresentationTone(value);
  if (tone === 'success') return 'status-done';
  if (tone === 'warning') return 'status-pending';
  if (tone === 'danger') return 'status-alert';
  if (tone === 'info') return 'status-confirmed';
  const status = String(value ?? '').trim();
  return /作废|取消|停用/.test(status) ? 'status-void' : 'status-neutral';
}
