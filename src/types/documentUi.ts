export type DocumentFact = {
  key?: string;
  label: string;
  value: string;
  tone?: string;
  full?: boolean;
  multiline?: boolean;
  route?: string;
};

export type DocumentStageItem = {
  label: string;
  description?: string;
};

export type DocumentStatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export type DocumentStatusItem = {
  key: string;
  label: string;
  value: string;
  detail?: string;
  kind?: 'status' | 'metric' | 'text';
  tone?: DocumentStatusTone;
  route?: string;
};
