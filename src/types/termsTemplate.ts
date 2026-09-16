export type TermsTaxMode = '含税' | '不含税';

export type TermsTemplate = {
  key: string;
  name: string;
  deliveryMethod: string;
  paymentMethod: string;
  taxMode: TermsTaxMode;
  taxRate?: string;
  freightPayer?: string;
  content: string;
};

export const termsTaxModes: TermsTaxMode[] = ['含税', '不含税'];
