export type QualityProjectionPage = 'incoming' | 'production' | 'patrol' | 'defects';

export type QualityStateProjectionInput = {
  page: QualityProjectionPage;
  status?: string;
  inspectionConclusion?: string;
  dispositionStage?: string;
  currentAction?: string;
  sourceType?: string;
  disposition?: string;
  productResults?: string[];
  qualityOutcome?: string;
  defectLevel?: string;
};

export type QualityStateProjection = {
  inspectionConclusion: string;
  dispositionStage: string;
  lifecycleStatus: string;
  currentAction: string;
};

const pendingInspectionValues = new Set(['待检验', '待检', '检验中', '待复判', '未开始', '']);
const closedDispositionStages = new Set(['无需处置', '已完成', '已关闭', '已作废']);

function normalizeConclusion(value: string) {
  return value === '部分判定' ? '部分合格' : value;
}

export function isQualityDispositionClosed(stage: string) {
  return closedDispositionStages.has(String(stage || '').trim());
}

export function qualityDispositionStageDisplay(conclusion: string, stage: string) {
  const normalizedConclusion = String(conclusion || '').trim();
  const normalizedStage = String(stage || '').trim();
  return normalizedConclusion === '待判定' && normalizedStage === '待判定'
    ? '未进入处置'
    : normalizedStage || '-';
}

export function qualityInspectionConclusion(input: QualityStateProjectionInput) {
  const status = String(input.status || '').trim();
  const results = (input.productResults || []).map((value) => String(value || '').trim()).filter(Boolean);

  if (['incoming', 'production'].includes(input.page)
    && results.some((result) => pendingInspectionValues.has(result))) {
    return '待判定';
  }

  const explicit = String(input.inspectionConclusion || '').trim();
  if (explicit && !pendingInspectionValues.has(explicit)) return normalizeConclusion(explicit);

  if (input.page === 'patrol') {
    const outcome = String(input.qualityOutcome || '').trim();
    if (outcome) return outcome;
    if (results.some((result) => ['不合格', '异常'].includes(result))) return '异常';
    if (results.some((result) => ['预警', '待整改', '待复查'].includes(result))) return '预警';
    if (results.length && results.every((result) => ['合格', '正常'].includes(result))) return '正常';
  }

  if (input.page === 'defects' && input.defectLevel) return `${input.defectLevel}不良`;
  if (['合格', '不合格', '免检放行', '部分合格', '正常', '异常', '预警'].includes(status)) {
    return normalizeConclusion(status);
  }
  if (['待检验', '待检', '检验中', '待复判', '未开始'].includes(status)) return '待判定';

  const decidedResults = results.filter((result) => !pendingInspectionValues.has(result) && result !== '待判定');
  if (decidedResults.length === 1) return normalizeConclusion(decidedResults[0]);
  if (decidedResults.length > 1) {
    return decidedResults.some((result) => ['不合格', '异常'].includes(result)) ? '部分合格' : decidedResults.join(' · ');
  }
  if (['待整改', '待复查', '待处理', '处置中', '待验证', '返工中', '待复检'].includes(status)) return '异常';
  return '待判定';
}

export function qualityDispositionStage(input: QualityStateProjectionInput) {
  const explicit = String(input.dispositionStage || '').trim();
  if (explicit) return explicit;

  const status = String(input.status || '').trim();
  if (input.page === 'incoming' || input.page === 'production') {
    if (['待检验', '待检', '检验中'].includes(status)) return '待判定';
    if (input.page === 'incoming' && ['部分判定', '待复判'].includes(status)) return '待判定';
    if (['返工中', '待复检'].includes(status)) return status;
    if (['不合格', '部分合格', '部分判定', '待处置'].includes(status)) return '待处置';
    if (status === '已作废') return '已作废';
    if (input.page === 'incoming' && ['合格', '免检放行', '部分放行', '让步接收'].includes(status)) return '已完成';
    if (input.page === 'production' && ['合格', '免检放行'].includes(status)) return '无需处置';
  }
  return status || '待判定';
}

export function qualityLifecycleStatus(input: Pick<QualityStateProjectionInput, 'page' | 'status'>, stage: string) {
  const status = String(input.status || '').trim();
  if (status === '已作废' || stage === '已作废') return '已作废';
  if (status === '已关闭' || stage === '已关闭' || isQualityDispositionClosed(stage)) return '已完成';
  return '执行中';
}

export function qualityCurrentAction(input: QualityStateProjectionInput, stage: string) {
  const explicit = String(input.currentAction || '').trim();
  if (explicit) return explicit;

  if (input.page === 'incoming') {
    if (stage === '待复检') return '完成独立复检并提交结论';
    if (stage === '待处置') return '执行退回供应商、让步放行或建立复检';
    if (stage === '待判定') return input.status === '部分判定'
      ? '继续判定冻结数量，并处置已隔离的不合格数量'
      : '完成检查项与未判定数量';
    if (stage === '已完成' || stage === '无需处置') return '查看收货与待入库结果';
  }

  if (input.page === 'production') {
    if (stage === '待复检') return '完成独立复检并提交结论';
    if (stage === '返工中') return '完成返工记录并提交独立复检';
    if (stage === '待处置') return input.sourceType === '入库抽检'
      ? '整批保持冻结，并完成返工、让步或报废处置'
      : '确认返工、让步接收或报废处置';
    if (stage === '无需处置') return '检验已完成，无需质量处置';
    if (stage === '已完成') return '处置已完成，可查看结果';
    if (stage === '待判定') {
      if (input.sourceType === '开机首检') return '完成首检并决定是否放行批量生产';
      if (input.sourceType === '半成品质检') return '完成大盘检验并决定是否进入复绕队列';
      if (input.sourceType === '入库抽检') return '完成抽检并决定整批放行或冻结';
      return '完成报工全检并登记合格与不合格数量';
    }
  }

  if (input.page === 'patrol') {
    if (stage === '待整改') return '责任人整改后提交复查';
    if (stage === '待复查') return '复查整改结果并关闭或升级不良';
    if (stage === '已关闭') return '处理已完成，可查看追溯记录';
    return '执行现场巡检并记录异常点';
  }

  if (input.page === 'defects') {
    if (stage === '待处理') return '确认责任、处置方式和完成期限';
    if (['处置中', '返工中', '供应商确认'].includes(stage)) return `完成${input.disposition || '处置'}并提交验证证据`;
    if (['待验证', '待复判'].includes(stage)) return '验证通过后关闭；未通过退回继续处置';
    if (stage === '已关闭') return '处理已完成，可查看追溯记录';
  }

  if (stage === '已作废') return '单据已作废，仅保留追溯记录';
  return input.disposition || '查看当前质量记录';
}

export function projectQualityState(input: QualityStateProjectionInput): QualityStateProjection {
  const inspectionConclusion = qualityInspectionConclusion(input);
  const dispositionStage = qualityDispositionStage(input);
  return {
    inspectionConclusion,
    dispositionStage,
    lifecycleStatus: qualityLifecycleStatus(input, dispositionStage),
    currentAction: qualityCurrentAction(input, dispositionStage),
  };
}
