<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Check, ChevronLeft, CircleAlert, ClipboardList, Pencil, Save, Upload } from 'lucide-vue-next';

import DocumentLoadState from '../components/DocumentLoadState.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import ReferencePicker from '../components/ReferencePicker.vue';
import { requestActionConfirmation } from '../composables/useActionConfirmation';
import { useMasterSaveFeedback } from '../composables/useMasterSaveFeedback';
import { useModulePermission } from '../composables/useModulePermission';
import { usePageRefresh } from '../composables/usePageRefresh';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import type { MasterDataRecord } from '../data/masterData';
import { getMasterRecord, listMasterRecords, listSystemRecords, saveMasterRecord, type SystemRecord } from '../services/api';
import type { ReferenceOption } from '../types/business';
import { isValidIsoDate, isValidOptionalEmail } from '../utils/masterInputValidation';

type SimplePage = 'uom' | 'currencies' | 'departments' | 'employees' | 'company' | 'equipment' | 'productionLines';
type FieldKind = 'text' | 'textarea' | 'select' | 'multi-select' | 'reference' | 'number' | 'date';
type DraftValue = string | number | string[];
type Draft = Record<string, DraftValue>;

type FieldConfig = {
  key: string;
  label: string;
  kind?: FieldKind;
  options?: string[];
  placeholder?: string;
  referenceType?: string;
  referenceTitle?: string;
  referenceSearchPlaceholder?: string;
  disabled?: boolean;
  span?: 2 | 3;
  rows?: number;
  required?: boolean;
  lockWhenReferenced?: boolean;
  maxLength?: number;
};

type SectionConfig = {
  title: string;
  fields: FieldConfig[];
};

type DetailItem = {
  label: string;
  key: string;
  fallback?: string;
  suffix?: string;
  link?: boolean;
  routePrefix?: string;
};

type DetailGroup = {
  title: string;
  items: DetailItem[];
};

type DetailSection = {
  title: string;
  items?: DetailItem[];
  groups?: DetailGroup[];
  noteKey?: string;
};

type CompletenessItem = {
  label: string;
  keys: string[];
  any?: boolean;
};

type StatusSummary = {
  title: string;
  text: string;
  tone?: 'good' | 'muted' | 'warn';
};

type PageConfig = {
  title: string;
  listPath: string;
  codePrefix: string;
  defaultStatus: string;
  statusOptions: string[];
  defaults: Draft;
  sections: SectionConfig[];
  detailSections: DetailSection[];
  completeness: CompletenessItem[];
  sealUpload?: boolean;
  statusHeading?: string;
  statusText: (status: string) => StatusSummary;
};

const route = useRoute();
const router = useRouter();
const { saveMessage, saveTone, showSaveFeedback, validateRequired, requiredFieldClass } = useMasterSaveFeedback();
const { canWrite: canWriteMasterData, readonlyReason: masterDataReadonlyReason } = useModulePermission('masterData');

const simplePages = ['uom', 'currencies', 'departments', 'employees', 'company', 'equipment', 'productionLines'] as const;
const statusOptions = ['启用', '停用'];

function todayText() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const configs: Record<SimplePage, PageConfig> = {
  uom: {
    title: '计量单位',
    listPath: '/master-data/uom',
    codePrefix: 'UOM',
    defaultStatus: '启用',
    statusOptions,
    defaults: {
      code: '',
      name: '',
      englishAbbreviation: '',
      status: '启用',
      updatedAt: todayText(),
      attachments: 0,
      note: '',
    },
    sections: [
      {
        title: '基本资料',
        fields: [
          { key: 'code', label: '单位编码', disabled: true },
          { key: 'name', label: '单位', placeholder: '例如：kg、卷、个、箱', required: true, lockWhenReferenced: true },
          { key: 'englishAbbreviation', label: '英文简称', placeholder: '例如：kg、g、roll、pcs、ctn', required: true, maxLength: 16 },
          { key: 'status', label: '使用状态', kind: 'select', options: statusOptions, lockWhenReferenced: true },
        ],
      },
      {
        title: '备注',
        fields: [{ key: 'note', label: '使用说明', kind: 'textarea', placeholder: '填写适用场景', span: 3, rows: 3 }],
      },
    ],
    detailSections: [
      {
        title: '基本资料',
        items: [
          { label: '单位编码', key: 'code' },
          { label: '单位', key: 'name' },
          { label: '英文简称', key: 'englishAbbreviation' },
        ],
      },
      { title: '使用说明', noteKey: 'note' },
    ],
    completeness: [
      { label: '单位与英文简称', keys: ['name', 'englishAbbreviation'] },
    ],
    statusText: (status) =>
      status === '启用'
        ? { title: '可使用', text: '可作为新物料的基础单位；业务单据继续沿用物料基础单位。', tone: 'good' }
        : { title: '已停用', text: '不会出现在新物料的单位选择中，历史记录仍保留。', tone: 'muted' },
  },
  currencies: {
    title: '币种',
    listPath: '/master-data/currencies',
    codePrefix: '',
    defaultStatus: '启用',
    statusOptions,
    defaults: {
      code: '',
      name: '',
      symbol: '',
      decimalPlaces: 2,
      status: '启用',
      updatedAt: todayText(),
      attachments: 0,
      note: '',
    },
    sections: [
      {
        title: '基本资料',
        fields: [
          { key: 'code', label: '币种代码', placeholder: '例如 CNY', required: true, maxLength: 3 },
          { key: 'name', label: '币种名称', placeholder: '例如 人民币、美元、欧元', required: true },
          { key: 'symbol', label: '货币符号', placeholder: '例如 ¥、$、€', required: true },
          { key: 'decimalPlaces', label: '金额小数位', kind: 'number', required: true },
          { key: 'status', label: '使用状态', kind: 'select', options: statusOptions },
        ],
      },
      {
        title: '备注',
        fields: [{ key: 'note', label: '使用说明', kind: 'textarea', placeholder: '填写币种的适用范围或结算说明', span: 3, rows: 3 }],
      },
    ],
    detailSections: [
      {
        title: '基本资料',
        items: [
          { label: '币种代码', key: 'code' },
          { label: '币种名称', key: 'name' },
          { label: '货币符号', key: 'symbol' },
          { label: '金额小数位', key: 'decimalPlaces', suffix: ' 位' },
        ],
      },
      { title: '使用说明', noteKey: 'note' },
    ],
    completeness: [
      { label: '币种名称', keys: ['name'] },
      { label: '金额格式', keys: ['symbol', 'decimalPlaces'] },
    ],
    statusText: (status) =>
      status === '启用'
        ? { title: '可使用', text: '可用于客户、供应商以及销售报价等新业务的结算币种选择。', tone: 'good' }
        : { title: '已停用', text: '不会出现在新业务的币种候选中，历史单据仍保留原币种代码。', tone: 'muted' },
  },
  departments: {
    title: '部门',
    listPath: '/master-data/departments',
    codePrefix: 'DEP',
    defaultStatus: '启用',
    statusOptions,
    defaults: {
      code: '',
      name: '',
      parentDepartment: '',
      employeeCount: 0,
      owner: 'Filatrix 增材材料有限公司',
      status: '启用',
      updatedAt: todayText(),
      attachments: 0,
      note: '',
    },
    sections: [
      {
        title: '基本资料',
        fields: [
          { key: 'code', label: '部门编码', disabled: true },
          { key: 'name', label: '部门名称', placeholder: '填写部门名称', required: true },
          {
            key: 'owner',
            label: '所属公司',
            kind: 'reference',
            referenceType: 'company',
            referenceTitle: '选择所属公司',
            placeholder: '选择所属公司',
            referenceSearchPlaceholder: '搜索公司编码或名称',
            required: true,
          },
          { key: 'status', label: '使用状态', kind: 'select', options: statusOptions },
        ],
      },
      {
        title: '组织关系',
        fields: [
          {
            key: 'parentDepartment',
            label: '上级部门',
            kind: 'reference',
            referenceType: 'departments',
            referenceTitle: '选择上级部门',
            placeholder: '公司直属可留空',
            referenceSearchPlaceholder: '搜索部门编码或名称',
          },
        ],
      },
      {
        title: '备注',
        fields: [{ key: 'note', label: '说明', kind: 'textarea', placeholder: '填写组织关系或管理说明', span: 3, rows: 3 }],
      },
    ],
    detailSections: [
      {
        title: '基本资料',
        items: [
          { label: '部门编码', key: 'code' },
          { label: '部门名称', key: 'name' },
          { label: '所属公司', key: 'owner' },
        ],
      },
      {
        title: '组织关系',
        items: [
          { label: '上级部门', key: 'parentDepartment', fallback: '公司直属' },
          { label: '启用员工', key: 'employeeCount', suffix: ' 人' },
        ],
      },
      { title: '部门备注', noteKey: 'note' },
    ],
    completeness: [
      { label: '基本资料', keys: ['name', 'owner'] },
    ],
    statusText: (status) =>
      status === '启用'
        ? { title: '可使用', text: '可用于员工与业务归属；账号权限仍由系统角色单独控制。', tone: 'good' }
        : { title: '已停用', text: '不会出现在新的部门选择中，历史组织归属仍保留。', tone: 'muted' },
  },
  employees: {
    title: '员工',
    listPath: '/master-data/employees',
    codePrefix: 'EMP',
    defaultStatus: '启用',
    statusOptions,
    statusHeading: '使用状态',
    defaults: {
      code: '',
      name: '',
      englishName: '',
      position: '',
      linkedAccount: '',
      linkedAccountStatus: '未分配',
      owner: '',
      phone: '',
      email: '',
      gender: '未填写',
      hireDate: todayText(),
      status: '启用',
      updatedAt: todayText(),
      attachments: 0,
      note: '',
    },
    sections: [
      {
        title: '基本资料',
        fields: [
          { key: 'code', label: '员工编码', disabled: true },
          { key: 'name', label: '姓名', placeholder: '填写员工姓名', required: true },
          { key: 'englishName', label: '英文名', placeholder: '选填，记录员工英文名' },
          { key: 'gender', label: '性别', kind: 'select', options: ['未填写', '男', '女'] },
          { key: 'hireDate', label: '入职日期', kind: 'date' },
          { key: 'status', label: '使用状态', kind: 'select', options: statusOptions },
        ],
      },
      {
        title: '岗位归属',
        fields: [
          {
            key: 'owner',
            label: '所属部门',
            kind: 'reference',
            referenceType: 'departments',
            referenceTitle: '选择所属部门',
            placeholder: '选择所属部门',
            referenceSearchPlaceholder: '搜索部门编码或名称',
            required: true,
          },
          { key: 'position', label: '岗位/职务', placeholder: '填写岗位或职务', required: true },
          { key: 'linkedAccount', label: '关联账号', placeholder: '在系统模块中分配', disabled: true },
        ],
      },
      {
        title: '联系信息',
        fields: [
          { key: 'phone', label: '手机', placeholder: '填写手机号' },
          { key: 'email', label: '邮箱', placeholder: '填写邮箱', span: 2 },
        ],
      },
      {
        title: '备注',
        fields: [
          { key: 'note', label: '说明', kind: 'textarea', placeholder: '填写岗位或交接说明', span: 3, rows: 3 },
        ],
      },
    ],
    detailSections: [
      {
        title: '基本资料',
        items: [
          { label: '员工编码', key: 'code' },
          { label: '姓名', key: 'name' },
          { label: '英文名', key: 'englishName' },
          { label: '性别', key: 'gender' },
          { label: '入职日期', key: 'hireDate' },
        ],
      },
      {
        title: '岗位归属',
        items: [
          { label: '所属部门', key: 'owner' },
          { label: '岗位/职务', key: 'position' },
          { label: '关联账号', key: 'linkedAccount', fallback: '未分配' },
        ],
      },
      {
        title: '联系信息',
        items: [
          { label: '手机', key: 'phone' },
          { label: '邮箱', key: 'email' },
        ],
      },
      { title: '员工备注', noteKey: 'note' },
    ],
    completeness: [
      { label: '岗位归属', keys: ['owner', 'position'] },
      { label: '联系方式', keys: ['phone', 'email'], any: true },
    ],
    statusText: (status) =>
      status === '启用'
        ? { title: '可引用', text: '可在新单据中作为申请人、负责人和经办人；登录权限由系统账号单独控制。', tone: 'good' }
        : { title: '已停用', text: '不再进入新的业务人员候选，人员资料和历史单据仍保留。', tone: 'muted' },
  },
  company: {
    title: '公司',
    listPath: '/master-data/company',
    codePrefix: 'COM',
    defaultStatus: '启用',
    statusOptions,
    defaults: {
      code: '',
      name: '',
      englishName: '',
      type: '总公司',
      primary: '',
      secondary: '13%',
      address: '',
      englishAddress: '',
      phone: '',
      email: '',
      website: '',
      invoiceTitle: '',
      taxNumber: '',
      registeredAddress: '',
      invoicePhone: '',
      bankName: '',
      bankAccount: '',
      seal: 0,
      status: '启用',
      updatedAt: todayText(),
      attachments: 0,
      note: '',
    },
    sections: [
      {
        title: '基本资料',
        fields: [
          { key: 'code', label: '公司编码', disabled: true },
          { key: 'name', label: '公司名称', placeholder: '填写工商登记全称', required: true, lockWhenReferenced: true, span: 2 },
          { key: 'englishName', label: '英文名称', placeholder: '填写英文公司全称', span: 2 },
          { key: 'primary', label: '公司简称', placeholder: '填写简称' },
          { key: 'taxNumber', label: '统一社会信用代码', placeholder: '填写统一社会信用代码', required: true },
          { key: 'type', label: '组织类型', kind: 'select', options: ['总公司', '分支机构'] },
          { key: 'status', label: '使用状态', kind: 'select', options: statusOptions },
        ],
      },
      {
        title: '联系与地址',
        fields: [
          { key: 'phone', label: '电话', placeholder: '填写公司电话' },
          { key: 'email', label: '邮箱', placeholder: '填写公司邮箱', span: 2 },
          { key: 'website', label: '官网', placeholder: '填写公司官网' },
          { key: 'address', label: '中文地址', placeholder: '填写中文经营地址', span: 2 },
          { key: 'englishAddress', label: '英文地址', placeholder: '填写英文经营地址', span: 3 },
        ],
      },
      {
        title: '开票与银行资料',
        fields: [
          { key: 'invoiceTitle', label: '开票抬头', placeholder: '填写开票抬头', span: 2 },
          { key: 'secondary', label: '默认税率', placeholder: '例如 13%', required: true },
          { key: 'invoicePhone', label: '开票电话', placeholder: '填写开票专用联系电话' },
          { key: 'registeredAddress', label: '注册地址', placeholder: '填写工商注册地址', span: 2 },
          { key: 'bankName', label: '开户行', placeholder: '填写开户行', span: 2 },
          { key: 'bankAccount', label: '银行账号', placeholder: '填写银行账号' },
        ],
      },
      {
        title: '备注',
        fields: [{ key: 'note', label: '使用说明', kind: 'textarea', placeholder: '填写打印抬头、开票或结算说明', span: 3, rows: 3 }],
      },
    ],
    sealUpload: true,
    detailSections: [
      {
        title: '基本资料',
        items: [
          { label: '公司编码', key: 'code' },
          { label: '公司名称', key: 'name' },
          { label: '英文名称', key: 'englishName' },
          { label: '公司简称', key: 'primary' },
          { label: '组织类型', key: 'type' },
          { label: '统一社会信用代码', key: 'taxNumber' },
        ],
      },
      {
        title: '联系与地址',
        items: [
          { label: '电话', key: 'phone' },
          { label: '邮箱', key: 'email' },
          { label: '官网', key: 'website', link: true },
          { label: '中文地址', key: 'address' },
          { label: '英文地址', key: 'englishAddress' },
        ],
      },
      {
        title: '开票与银行资料',
        items: [
          { label: '开票抬头', key: 'invoiceTitle' },
          { label: '默认税率', key: 'secondary' },
          { label: '开票电话', key: 'invoicePhone' },
          { label: '注册地址', key: 'registeredAddress' },
          { label: '开户行', key: 'bankName' },
          { label: '银行账号', key: 'bankAccount' },
        ],
      },
      { title: '公司说明', noteKey: 'note' },
    ],
    completeness: [
      { label: '工商资料', keys: ['name', 'taxNumber'] },
      { label: '英文资料', keys: ['englishName', 'englishAddress'] },
      { label: '联系信息', keys: ['phone', 'email'], any: true },
      { label: '开票资料', keys: ['invoiceTitle', 'registeredAddress'] },
      { label: '银行资料', keys: ['bankName', 'bankAccount'] },
    ],
    statusText: (status) =>
      status === '启用'
        ? { title: '可使用', text: '可作为新业务单据、开票和结算主体；历史单据保留当时的主体信息。', tone: 'good' }
        : { title: '已停用', text: '不再进入新的公司主体候选，历史单据仍保留原主体信息。', tone: 'muted' },
  },
  equipment: {
    title: '设备',
    listPath: '/master-data/equipment',
    codePrefix: 'EQ',
    defaultStatus: '启用',
    statusOptions,
    defaults: {
      code: '',
      name: '',
      brand: '',
      model: '',
      spec: '',
      serialNumber: '',
      primary: '',
      owner: '生产管理部',
      startDate: todayText(),
      status: '启用',
      updatedAt: todayText(),
      attachments: 0,
      note: '',
    },
    sections: [
      {
        title: '基本资料',
        fields: [
          { key: 'code', label: '设备编码', disabled: true },
          { key: 'name', label: '设备名称', placeholder: '填写设备名称', required: true, span: 2 },
          { key: 'brand', label: '品牌', placeholder: '填写品牌' },
          { key: 'model', label: '型号', placeholder: '填写型号' },
          { key: 'serialNumber', label: '出厂编号', placeholder: '填写设备序列号' },
          { key: 'spec', label: '规格', placeholder: '填写规格', span: 2 },
          { key: 'status', label: '使用状态', kind: 'select', options: statusOptions },
        ],
      },
      {
        title: '使用信息',
        fields: [
          {
            key: 'owner',
            label: '所属部门',
            kind: 'reference',
            referenceType: 'departments',
            referenceTitle: '选择所属部门',
            placeholder: '选择所属部门',
            referenceSearchPlaceholder: '搜索部门编码或名称',
            required: true,
          },
          { key: 'primary', label: '使用位置', placeholder: '填写车间、区域或工位', required: true },
          { key: 'startDate', label: '启用日期', kind: 'date' },
        ],
      },
      {
        title: '说明',
        fields: [
          { key: 'note', label: '设备说明', kind: 'textarea', placeholder: '填写工艺用途、使用限制或补充说明', span: 3, rows: 3 },
        ],
      },
    ],
    detailSections: [
      {
        title: '基本资料',
        items: [
          { label: '设备编码', key: 'code' },
          { label: '设备名称', key: 'name' },
          { label: '品牌', key: 'brand' },
          { label: '型号', key: 'model' },
          { label: '规格', key: 'spec' },
          { label: '出厂编号', key: 'serialNumber' },
        ],
      },
      {
        title: '使用信息',
        items: [
          { label: '所属部门', key: 'owner' },
          { label: '使用位置', key: 'primary' },
          { label: '启用日期', key: 'startDate' },
        ],
      },
      { title: '设备说明', noteKey: 'note' },
    ],
    completeness: [
      { label: '设备身份', keys: ['name', 'model'] },
      { label: '使用信息', keys: ['owner', 'primary'] },
    ],
    statusText: (status) => {
      return status === '启用'
        ? { title: '可引用', text: '可进入生产排程和现场执行的设备候选；实际占用由生产记录判断。', tone: 'good' }
        : { title: '已停用', text: '不会进入新的设备候选，历史工单和执行记录仍保留。', tone: 'muted' };
    },
  },
  productionLines: {
    title: '产线',
    listPath: '/master-data/production-lines',
    codePrefix: 'LINE',
    defaultStatus: '启用',
    statusOptions,
    defaults: {
      code: '',
      name: '',
      type: '挤出产线',
      workshop: '',
      processScope: '',
      capacityValue: '',
      capacityUnit: 'kg/小时',
      owner: '生产管理部',
      status: '启用',
      updatedAt: todayText(),
      attachments: 0,
      note: '',
    },
    sections: [
      {
        title: '基本资料',
        fields: [
          { key: 'code', label: '产线编码', disabled: true },
          { key: 'name', label: '产线名称', placeholder: '填写产线名称', required: true },
          {
            key: 'type',
            label: '产线类型',
            kind: 'select',
            options: ['挤出产线', '复绕产线', '包装产线', '试验产线'],
          },
          { key: 'status', label: '使用状态', kind: 'select', options: statusOptions },
        ],
      },
      {
        title: '归属与位置',
        fields: [
          {
            key: 'owner',
            label: '所属部门',
            kind: 'reference',
            referenceType: 'departments',
            referenceTitle: '选择所属部门',
            placeholder: '选择所属部门',
            referenceSearchPlaceholder: '搜索部门编码或名称',
            required: true,
          },
          { key: 'workshop', label: '车间/区域', placeholder: '填写车间或区域', required: true },
        ],
      },
      {
        title: '产能与适用范围',
        fields: [
          { key: 'capacityValue', label: '标准产能', kind: 'number', placeholder: '填写数值', required: true },
          { key: 'capacityUnit', label: '产能单位', kind: 'select', options: ['kg/小时', '卷/班', '卷/小时'] },
          { key: 'processScope', label: '适用范围', placeholder: '例如 PLA/PETG 1.75mm 挤出', span: 3, required: true },
        ],
      },
      {
        title: '备注',
        fields: [
          { key: 'note', label: '产线说明', kind: 'textarea', placeholder: '填写换型、产能或维护说明', span: 3, rows: 3 },
        ],
      },
    ],
    detailSections: [
      {
        title: '基本资料',
        items: [
          { label: '产线编码', key: 'code' },
          { label: '产线名称', key: 'name' },
          { label: '产线类型', key: 'type' },
        ],
      },
      {
        title: '归属与能力',
        items: [
          { label: '所属部门', key: 'owner' },
          { label: '车间/区域', key: 'workshop' },
          { label: '标准产能', key: 'capacityValue' },
          { label: '适用范围', key: 'processScope' },
        ],
      },
      { title: '产线说明', noteKey: 'note' },
    ],
    completeness: [
      { label: '产线身份', keys: ['name', 'type'] },
      { label: '归属与位置', keys: ['owner', 'workshop'] },
      { label: '产能与适用范围', keys: ['capacityValue', 'capacityUnit', 'processScope'] },
    ],
    statusText: (status) => {
      return status === '启用'
        ? { title: '可引用', text: '可进入排产与现场执行候选；实际占用和执行状态由设备作业记录判断。', tone: 'good' }
        : { title: '已停用', text: '不会进入新的产线候选，历史工单和产能记录仍保留。', tone: 'muted' };
    },
  },
};

const page = computed<SimplePage>(() => {
  const metaPage = route.meta.masterPage?.toString();
  return simplePages.includes(metaPage as SimplePage) ? (metaPage as SimplePage) : 'uom';
});

const config = computed(() => configs[page.value]);
const mode = computed<'new' | 'edit' | 'detail'>(() => {
  const name = route.name?.toString() ?? '';
  if (name.endsWith('-new')) return 'new';
  if (name.endsWith('-edit')) return 'edit';
  return 'detail';
});
const isDetailMode = computed(() => mode.value === 'detail');
const isReadonlyMode = computed(() => isDetailMode.value || !canWriteMasterData.value);
const sourceRecord = ref<MasterDataRecord | undefined>();
const accountRows = ref<SystemRecord[]>([]);
const employeeRows = ref<MasterDataRecord[]>([]);
const departmentRows = ref<MasterDataRecord[]>([]);
const warehouseRows = ref<MasterDataRecord[]>([]);
const equipmentRows = ref<MasterDataRecord[]>([]);
const productionLineRows = ref<MasterDataRecord[]>([]);
const materialRows = ref<MasterDataRecord[]>([]);
const isSaving = ref(false);
const isLoading = ref(false);
const loadMessage = ref('');
let simpleLoadRequestId = 0;

const formDraft = reactive<Draft>({});
const { isDirty, resetUnsavedChanges } = useUnsavedChangesGuard(() => formDraft, {
  enabled: computed(() => !isReadonlyMode.value),
  ready: computed(() => !isLoading.value),
});

const departmentParentExcludeCodes = computed(() => {
  if (page.value !== 'departments' || mode.value === 'new') return [];

  const currentCode = displayValue('code', '').trim();
  const currentName = displayValue('name', '').trim();
  if (!currentCode || currentCode === '系统自动生成') return [];

  const blockedCodes = new Set<string>([currentCode]);
  const blockedRefs = new Set<string>([currentCode, currentName].filter(Boolean));
  let foundDescendant = true;

  while (foundDescendant) {
    foundDescendant = false;
    for (const department of departmentRows.value) {
      const parentRef = String(department.parentDepartment || '').trim();
      if (!parentRef || !blockedRefs.has(parentRef) || blockedCodes.has(department.code)) continue;
      blockedCodes.add(department.code);
      blockedRefs.add(department.code);
      blockedRefs.add(department.name);
      foundDescendant = true;
    }
  }

  return [...blockedCodes];
});

watch(
  [page, () => route.params.code, mode],
  () => {
    void loadRecord();
  },
  { immediate: true },
);

watch(
  () => formDraft.type,
  (lineType) => {
    if (page.value !== 'productionLines') return;
    if (['挤出产线', '试验产线'].includes(String(lineType || ''))) formDraft.capacityUnit = 'kg/小时';
    if (['复绕产线', '包装产线'].includes(String(lineType || '')) && !['卷/班', '卷/小时'].includes(String(formDraft.capacityUnit || ''))) {
      formDraft.capacityUnit = '卷/班';
    }
  },
);

const pageHeading = computed(() => {
  if (mode.value === 'new') return `新建${config.value.title}`;
  if (mode.value === 'edit') return `编辑${config.value.title}`;
  return `${config.value.title}详情`;
});
const simpleEditActionTitle = computed(() =>
  canWriteMasterData.value ? `编辑${config.value.title}资料` : masterDataReadonlyReason.value,
);
const referenceTitle = computed(() => `${config.value.title} ${displayValue('code') || ''}`.trim());
const referenceSubtitle = computed(() => `${displayValue('name', '未命名')} · ${displayValue('status', config.value.defaultStatus)}`);
const referencePath = computed(() => {
  const code = displayValue('code', '').trim();
  if (!code || code === '系统自动生成') return '';
  return `${config.value.listPath}/${encodeURIComponent(code)}`;
});
const statusSummary = computed(() => config.value.statusText(displayValue('status')));
const backPath = computed(() => {
  if (page.value === 'company') {
    if (mode.value === 'edit' && displayValue('code', '').trim()) return detailPath();
    return config.value.listPath;
  }
  return config.value.listPath;
});
const completenessChecks = computed(() => {
  const checks = config.value.completeness.map((item) => {
    const values = item.keys.map((key) => formDraft[key]);
    const present = values.map((value) => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== '');
    return { label: item.label, complete: item.any ? present.some(Boolean) : present.every(Boolean) };
  });
  const missingItems = checks.filter((item) => !item.complete);
  return missingItems.length ? missingItems : [{ label: '关键资料', complete: true }];
});
const currentUomReferences = computed(() => {
  if (page.value !== 'uom' || mode.value === 'new') return { materials: [] };
  const references = [displayValue('code'), displayValue('name')].filter(Boolean);
  return { materials: materialRows.value.filter((material) => references.includes(String(material.uom || ''))) };
});
const uomDefinitionLocked = computed(() => currentUomReferences.value.materials.length > 0);
const uomStatusLocked = computed(() =>
  currentUomReferences.value.materials.some((material) => material.status !== '停用'),
);
const uomReferenceText = computed(() => {
  const parts = [];
  if (currentUomReferences.value.materials.length) parts.push(`${currentUomReferences.value.materials.length} 项物料`);
  return parts.join('、');
});
const uomDefinitionHint = computed(() => {
  if (page.value !== 'uom' || !uomDefinitionLocked.value) return '';
  if (uomStatusLocked.value) {
    return `该单位已被${uomReferenceText.value}引用，其中仍有启用物料；单位定义与使用状态已锁定，需要新口径时请新建单位。`;
  }
  return `该单位已被${uomReferenceText.value}引用，单位定义已锁定；当前仅有停用物料引用，可以调整使用状态。`;
});
const linkedActiveEmployeeAccount = computed(() => {
  if (page.value !== 'employees') return undefined;
  const employeeCode = displayValue('code', '').trim();
  if (!employeeCode || employeeCode === '系统自动生成') return undefined;
  return accountRows.value.find(
    (account) => account.status !== '停用' && String(account.employeeCode || '').trim() === employeeCode,
  );
});
const employeeStatusBlockReason = computed(() => {
  if (page.value !== 'employees' || mode.value === 'new') return '';
  if (displayValue('status', config.value.defaultStatus) !== '停用') return '';
  const account = linkedActiveEmployeeAccount.value;
  if (!account) return '';
  return `该员工已关联启用账号 ${account.name || account.code}，请先停用账号或解除员工关联。`;
});
const selectedEmployeeDepartment = computed(() => {
  if (page.value !== 'employees') return undefined;
  const departmentName = displayValue('owner', '').trim();
  if (!departmentName) return undefined;
  return departmentRows.value.find((department) => department.name === departmentName || department.code === departmentName);
});
const employeeDepartmentBlockReason = computed(() => {
  if (page.value !== 'employees') return '';
  if (displayValue('status', config.value.defaultStatus) === '停用') return '';
  const departmentName = displayValue('owner', '').trim();
  if (!departmentName) return '启用员工必须选择所属部门。';
  const department = selectedEmployeeDepartment.value;
  if (!department) return '启用员工必须选择有效的所属部门。';
  if (department.status === '停用') return '启用员工不能归属已停用部门，请先启用部门或调整所属部门。';
  return '';
});
const linkedActiveDepartmentEmployees = computed(() => {
  if (page.value !== 'departments') return [];
  const departmentCode = displayValue('code', '').trim();
  const departmentName = displayValue('name', '').trim();
  if (!departmentCode || departmentCode === '系统自动生成') return [];
  return employeeRows.value.filter(
    (employee) =>
      employee.status !== '停用' &&
      [departmentName, departmentCode, sourceRecord.value?.name, sourceRecord.value?.code]
        .filter(Boolean)
        .includes(employee.owner),
  );
});
const linkedDepartmentEmployees = computed(() => {
  if (page.value !== 'departments') return [];
  const departmentCode = displayValue('code', '').trim();
  const departmentName = displayValue('name', '').trim();
  if (!departmentCode || departmentCode === '系统自动生成') return [];
  return employeeRows.value.filter((employee) =>
    [departmentName, departmentCode, sourceRecord.value?.name, sourceRecord.value?.code]
      .filter(Boolean)
      .includes(employee.owner),
  );
});
const linkedActiveChildDepartments = computed(() => {
  if (page.value !== 'departments') return [];
  const departmentCode = displayValue('code', '').trim();
  const departmentName = displayValue('name', '').trim();
  if (!departmentCode || departmentCode === '系统自动生成') return [];
  return departmentRows.value.filter(
    (department) =>
      department.code !== departmentCode
      && department.status !== '停用'
      && [departmentName, departmentCode, sourceRecord.value?.name, sourceRecord.value?.code]
        .filter(Boolean)
        .includes(department.parentDepartment),
  );
});
const linkedDepartmentMasterResources = computed(() => {
  if (page.value !== 'departments') return { equipment: [], productionLines: [] };
  const references = [
    displayValue('name', '').trim(),
    displayValue('code', '').trim(),
    String(sourceRecord.value?.name || '').trim(),
    String(sourceRecord.value?.code || '').trim(),
  ].filter(Boolean);
  return {
    equipment: equipmentRows.value.filter((row) => references.includes(String(row.owner || '').trim())),
    productionLines: productionLineRows.value.filter((row) => references.includes(String(row.owner || '').trim())),
  };
});
const linkedActiveDepartmentMasterResources = computed(() => ({
  equipment: linkedDepartmentMasterResources.value.equipment.filter((row) => row.status !== '停用'),
  productionLines: linkedDepartmentMasterResources.value.productionLines.filter((row) => row.status !== '停用'),
}));
const departmentNameLocked = computed(() =>
  page.value === 'departments'
  && mode.value !== 'new'
  && (
    linkedDepartmentEmployees.value.length > 0
    || linkedActiveChildDepartments.value.length > 0
    || Object.values(linkedDepartmentMasterResources.value).some((rows) => rows.length > 0)
  ),
);
const departmentStatusBlockReason = computed(() => {
  if (page.value !== 'departments' || mode.value === 'new') return '';
  if (displayValue('status', config.value.defaultStatus) !== '停用') return '';
  const linkedEmployees = linkedActiveDepartmentEmployees.value;
  if (linkedEmployees.length) {
    return `该部门仍被 ${linkedEmployees.length} 个启用员工引用，请先调整员工所属部门或停用员工后再停用部门。`;
  }
  const linkedChildren = linkedActiveChildDepartments.value;
  if (linkedChildren.length) {
    return `该部门仍有 ${linkedChildren.length} 个启用下级部门，请先调整或停用下级部门。`;
  }
  const resources = linkedActiveDepartmentMasterResources.value;
  const resourceParts = [
    resources.equipment.length ? `${resources.equipment.length} 台设备` : '',
    resources.productionLines.length ? `${resources.productionLines.length} 条产线` : '',
  ].filter(Boolean);
  if (resourceParts.length) {
    return `该部门仍被${resourceParts.join('、')}引用，请先调整或停用相关资源。`;
  }
  return '';
});
const companyMasterReferences = computed(() => {
  if (page.value !== 'company' || mode.value === 'new') return { departments: [], warehouses: [] };
  const references = [sourceRecord.value?.code, sourceRecord.value?.name, displayValue('code')]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return {
    departments: departmentRows.value.filter((department) => references.includes(String(department.owner || '').trim())),
    warehouses: warehouseRows.value.filter((warehouse) => references.includes(String(warehouse.company || '').trim())),
  };
});
const activeCompanyMasterReferences = computed(() => ({
  departments: companyMasterReferences.value.departments.filter((department) => department.status !== '停用'),
  warehouses: companyMasterReferences.value.warehouses.filter((warehouse) => warehouse.status !== '停用'),
}));
const companyNameLocked = computed(() =>
  page.value === 'company'
  && mode.value !== 'new'
  && (companyMasterReferences.value.departments.length > 0 || companyMasterReferences.value.warehouses.length > 0),
);
const companyStatusBlockReason = computed(() => {
  if (page.value !== 'company' || mode.value === 'new') return '';
  if (displayValue('status', config.value.defaultStatus) !== '停用') return '';
  const { departments, warehouses } = activeCompanyMasterReferences.value;
  if (!departments.length && !warehouses.length) return '';
  return `该公司仍被 ${departments.length} 个启用部门和 ${warehouses.length} 个启用仓库引用，请先调整或停用这些资料。`;
});
const equipmentDepartmentBlockReason = computed(() => {
  if (page.value !== 'equipment' || displayValue('status', config.value.defaultStatus) === '停用') return '';
  const departmentRef = displayValue('owner', '').trim();
  const department = departmentRows.value.find((row) => row.code === departmentRef || row.name === departmentRef);
  if (!departmentRef || !department || department.status === '停用') return '启用设备必须归属有效且启用的部门。';
  return '';
});
const productionLineDepartmentBlockReason = computed(() => {
  if (page.value !== 'productionLines' || displayValue('status', config.value.defaultStatus) === '停用') return '';
  const departmentRef = displayValue('owner', '').trim();
  const department = departmentRows.value.find((row) => row.code === departmentRef || row.name === departmentRef);
  if (!departmentRef || !department || department.status === '停用') return '启用产线必须归属有效且启用的部门。';
  return '';
});
const saveDisabledReason = computed(() => {
  if (isSaving.value) return '正在保存，请稍候';
  if (isLoading.value) return '正在加载关联资料，请稍候';
  if (!canWriteMasterData.value) return masterDataReadonlyReason.value;
  if (employeeDepartmentBlockReason.value) return employeeDepartmentBlockReason.value;
  if (employeeStatusBlockReason.value) return employeeStatusBlockReason.value;
  if (departmentStatusBlockReason.value) return departmentStatusBlockReason.value;
  if (companyStatusBlockReason.value) return companyStatusBlockReason.value;
  if (equipmentDepartmentBlockReason.value) return equipmentDepartmentBlockReason.value;
  if (productionLineDepartmentBlockReason.value) return productionLineDepartmentBlockReason.value;
  return '';
});
const simpleSaveActionTitle = computed(() =>
  saveDisabledReason.value || '保存资料，保存后会同步到业务候选列表。',
);
const attachmentReadonlyReason = computed(() => {
  if (!isReadonlyMode.value) return '';
  if (!canWriteMasterData.value) return masterDataReadonlyReason.value;
  if (isDetailMode.value) return `当前${config.value.title}详情只读，不能上传电子章。`;
  return saveDisabledReason.value;
});
const sealUploadTitle = computed(
  () => attachmentReadonlyReason.value || `上传${config.value.title}电子章，保存后用于打印模板。`,
);
const sealCount = computed(() => Number(formDraft.seal || 0));
const sealSlots = computed(() => {
  const uploadedCount = Math.min(3, Math.max(0, sealCount.value));
  return ['电子章1', '电子章2', '电子章3'].slice(0, uploadedCount).map((name) => ({ name, uploaded: true }));
});

function handleSealUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const selectedCount = input.files?.length ?? 0;
  if (!selectedCount) return;
  if (isReadonlyMode.value) {
    showSaveFeedback(attachmentReadonlyReason.value || '当前状态不能上传电子章', 'error');
    input.value = '';
    return;
  }
  const nextCount = Math.min(3, sealCount.value + selectedCount);
  formDraft.seal = nextCount;
  formDraft.updatedAt = todayText();
  input.value = '';
  showSaveFeedback(`已选择 ${selectedCount} 个电子章文件，保存后随${config.value.title}保留。`);
}

function apiType() {
  return page.value;
}

async function loadRecord() {
  const requestId = ++simpleLoadRequestId;
  const targetPage = page.value;
  const targetMode = mode.value;
  const targetCode = route.params.code?.toString() ?? '';
  loadMessage.value = '';
  if (targetMode === 'new') {
    isLoading.value = true;
    sourceRecord.value = undefined;
    refreshDraft();
    try {
      await loadLinkedRows(targetPage, requestId);
      if (requestId !== simpleLoadRequestId) return;
      await nextTick();
      if (requestId !== simpleLoadRequestId) return;
      resetUnsavedChanges();
    } catch (error) {
      if (requestId !== simpleLoadRequestId) return;
      loadMessage.value = error instanceof Error ? error.message : '关联资料加载失败';
    } finally {
      if (requestId === simpleLoadRequestId) isLoading.value = false;
    }
    return;
  }

  isLoading.value = true;
  sourceRecord.value = undefined;

  try {
    const [record] = await Promise.all([
      targetCode ? getMasterRecord(targetPage, targetCode) : Promise.resolve(undefined),
      loadLinkedRows(targetPage, requestId),
    ]);
    if (requestId !== simpleLoadRequestId) return;
    sourceRecord.value = record;
  } catch (error) {
    if (requestId !== simpleLoadRequestId) return;
    sourceRecord.value = undefined;
    loadMessage.value = error instanceof Error ? error.message : '基础资料加载失败';
  } finally {
    if (requestId === simpleLoadRequestId) {
      refreshDraft();
      isLoading.value = false;
    }
  }
}

async function refreshSimplePage() {
  if (!isDetailMode.value && isDirty.value) {
    const confirmed = await requestActionConfirmation({
      title: '放弃未保存修改？',
      message: `刷新将丢失当前${config.value.title}中尚未保存的修改。`,
      confirmLabel: '放弃并刷新',
    });
    if (!confirmed) return;
  }

  if (mode.value === 'new') {
    await loadRecord();
    return;
  }

  await loadRecord();
  await nextTick();
  resetUnsavedChanges();
}

usePageRefresh(refreshSimplePage);

async function loadLinkedRows(targetPage: SimplePage, requestId: number) {
  const isCurrentRequest = () => requestId === simpleLoadRequestId;

  if (targetPage !== 'employees') {
    accountRows.value = [];
  }

  if (!['employees', 'departments', 'company', 'equipment', 'productionLines'].includes(targetPage)) departmentRows.value = [];

  if (!['company', 'departments'].includes(targetPage)) warehouseRows.value = [];

  if (targetPage !== 'departments') {
    equipmentRows.value = [];
    productionLineRows.value = [];
  }

  if (targetPage !== 'departments') {
    employeeRows.value = [];
  }

  if (targetPage !== 'uom') {
    materialRows.value = [];
  }

  if (targetPage === 'uom') {
    try {
      const materials = await listMasterRecords('materials');
      if (!isCurrentRequest()) return;
      materialRows.value = materials;
    } catch {
      if (!isCurrentRequest()) return;
      materialRows.value = [];
    }
  }

  if (targetPage === 'employees') {
    try {
      const [accounts, departments] = await Promise.all([
        listSystemRecords('accounts'),
        listMasterRecords('departments'),
      ]);
      if (!isCurrentRequest()) return;
      accountRows.value = accounts;
      departmentRows.value = departments;
      employeeRows.value = [];
    } catch {
      if (!isCurrentRequest()) return;
      accountRows.value = [];
      departmentRows.value = [];
      employeeRows.value = [];
    }
  }

  if (targetPage === 'departments') {
    try {
      const [employees, departments, warehouses, equipment, productionLines] = await Promise.all([
        listMasterRecords('employees'),
        listMasterRecords('departments'),
        listMasterRecords('warehouses'),
        listMasterRecords('equipment'),
        listMasterRecords('productionLines'),
      ]);
      if (!isCurrentRequest()) return;
      employeeRows.value = employees;
      departmentRows.value = departments;
      warehouseRows.value = warehouses;
      equipmentRows.value = equipment;
      productionLineRows.value = productionLines;
    } catch {
      if (!isCurrentRequest()) return;
      employeeRows.value = [];
      departmentRows.value = [];
      warehouseRows.value = [];
      equipmentRows.value = [];
      productionLineRows.value = [];
    }
  }

  if (targetPage === 'company') {
    try {
      const [departments, warehouses] = await Promise.all([
        listMasterRecords('departments'),
        listMasterRecords('warehouses'),
      ]);
      if (!isCurrentRequest()) return;
      departmentRows.value = departments;
      warehouseRows.value = warehouses;
    } catch {
      if (!isCurrentRequest()) return;
      departmentRows.value = [];
      warehouseRows.value = [];
    }
  }

  if (targetPage === 'equipment') {
    try {
      const departments = await listMasterRecords('departments');
      if (!isCurrentRequest()) return;
      departmentRows.value = departments;
      employeeRows.value = [];
    } catch {
      if (!isCurrentRequest()) return;
      departmentRows.value = [];
      employeeRows.value = [];
    }
  }

  if (targetPage === 'productionLines') {
    try {
      const departments = await listMasterRecords('departments');
      if (!isCurrentRequest()) return;
      departmentRows.value = departments;
      employeeRows.value = [];
    } catch {
      if (!isCurrentRequest()) return;
      departmentRows.value = [];
      employeeRows.value = [];
    }
  }
}

function refreshDraft() {
  Object.keys(formDraft).forEach((key) => {
    delete formDraft[key];
  });
  Object.assign(formDraft, buildDraft(sourceRecord.value));
}

function buildDraft(record?: MasterDataRecord): Draft {
  const source = record as (MasterDataRecord & Record<string, DraftValue | undefined>) | undefined;
  const mapped: Draft = source
    ? {
        code: source.code,
        revision: source.revision ?? 1,
        name: source.name,
        type: source.type ?? '',
        primary: source.primary ?? '',
        secondary: source.secondary ?? '',
        owner: source.owner ?? '',
        departmentCode: source.departmentCode ?? '',
        status: source.status,
        updatedAt: source.updatedAt,
        attachments: source.attachments,
        note: source.note,
        model: source.model ?? '',
        spec: source.spec ?? '',
        contact: source.contact ?? '',
        phone: source.phone ?? '',
        email: source.email ?? '',
        englishName: source.englishName ?? '',
        startDate: source.startDate ?? '',
        website: source.website ?? '',
        address: source.address ?? '',
        englishAddress: source.englishAddress ?? '',
        invoiceTitle: source.invoiceTitle ?? '',
        taxNumber: source.taxNumber ?? '',
        registeredAddress: source.registeredAddress ?? '',
        invoicePhone: source.invoicePhone ?? '',
        bankName: source.bankName ?? '',
        bankAccount: source.bankAccount ?? '',
        gender: source.gender ?? '',
        hireDate: source.hireDate ?? '',
        seal: source.seal ?? 0,
        englishAbbreviation: source.englishAbbreviation ?? '',
        parentDepartment: source.parentDepartment ?? '',
        employeeCount: source.employeeCount ?? 0,
        position: source.position ?? '',
        linkedAccount: source.linkedAccount ?? '',
        linkedAccountStatus: source.linkedAccountStatus ?? '未分配',
        brand: source.brand ?? '',
        serialNumber: source.serialNumber ?? '',
        workshop: source.workshop ?? '',
        processScope: source.processScope ?? '',
        capacityValue: source.capacityValue ?? '',
        capacityUnit: source.capacityUnit ?? '',
        symbol: source.symbol ?? '',
        decimalPlaces: source.decimalPlaces ?? 2,
      }
    : {};

  const draft: Draft = { ...config.value.defaults, ...mapped };
  if (mode.value === 'new') draft.code = page.value === 'currencies' ? '' : '系统自动生成';
  if (!draft.updatedAt) draft.updatedAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (!draft.status) draft.status = config.value.defaultStatus;
  if (draft.attachments === undefined) draft.attachments = 0;
  return draft;
}

function detailPath() {
  return `${config.value.listPath}/${encodeURIComponent(displayValue('code'))}`;
}

function openEdit() {
  if (!canWriteMasterData.value) {
    showSaveFeedback(masterDataReadonlyReason.value, 'error');
    return;
  }
  router.push(`${detailPath()}/edit`);
}

function toMasterRecord(): MasterDataRecord {
  const record = {
    ...(formDraft as Record<string, DraftValue>),
    code: displayValue('code', ''),
    name: displayValue('name', ''),
    type: displayValue('type', ''),
    primary: displayValue('primary', ''),
    secondary: displayValue('secondary', ''),
    owner: displayValue('owner', ''),
    status: displayValue('status', config.value.defaultStatus),
    updatedAt: displayValue('updatedAt', ''),
    attachments: Number(formDraft.attachments || 0),
    note: displayValue('note', ''),
  } as unknown as MasterDataRecord;
  if (page.value === 'departments') {
    delete record.type;
    delete record.manager;
    delete record.primary;
    delete record.secondary;
  }
  if (page.value === 'uom') {
    delete record.type;
    delete record.owner;
    delete record.primary;
    delete record.secondary;
  }
  if (page.value === 'currencies') {
    delete record.type;
    delete record.owner;
    delete record.primary;
    delete record.secondary;
  }
  if (page.value === 'employees') {
    const employeeRecord = record as unknown as Record<string, unknown>;
    delete employeeRecord.type;
    delete employeeRecord.supervisor;
    delete employeeRecord.employmentStatus;
    delete employeeRecord.contact;
    delete employeeRecord.primary;
    delete employeeRecord.secondary;
    delete employeeRecord.birthDate;
    delete employeeRecord.homeAddress;
    delete employeeRecord.emergencyContactName;
    delete employeeRecord.emergencyContactPhone;
  }
  if (page.value === 'company') {
    delete record.owner;
    delete record.manager;
  }
  if (page.value === 'equipment') {
    const equipmentRecord = record as unknown as Record<string, unknown>;
    delete equipmentRecord.type;
    delete equipmentRecord.manager;
    delete equipmentRecord.operatingState;
    delete equipmentRecord.maintenanceCycleWeeks;
    delete equipmentRecord.sourcePurchase;
    delete equipmentRecord.secondary;
  }
  if (page.value === 'productionLines') {
    const productionLineRecord = record as unknown as Record<string, unknown>;
    delete productionLineRecord.manager;
    delete productionLineRecord.operatingState;
    delete productionLineRecord.primary;
    delete productionLineRecord.secondary;
  }
  return record;
}

async function saveRecord() {
  if (saveDisabledReason.value) {
    showSaveFeedback(saveDisabledReason.value, 'error');
    return;
  }
  const requiredFields = [{ label: `${config.value.title}名称`, value: formDraft.name }];
  for (const section of config.value.sections) {
    for (const field of section.fields) {
      if (field.required && field.key !== 'name') {
        requiredFields.push({ label: field.label, value: formDraft[field.key] });
      }
    }
  }

  if (!validateRequired(requiredFields)) return;

  if ('email' in formDraft && !isValidOptionalEmail(formDraft.email)) {
    showSaveFeedback('请填写有效的邮箱地址。', 'error');
    return;
  }

  if (page.value === 'uom') {
    const abbreviation = displayValue('englishAbbreviation', '').trim();
    if (!/^[A-Za-z0-9./-]{1,16}$/.test(abbreviation)) {
      showSaveFeedback('英文简称只能使用 1 到 16 位英文字母、数字、点、斜线或短横线。', 'error');
      return;
    }
  }

  if (page.value === 'currencies') {
    const currencyCode = displayValue('code', '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currencyCode)) {
      showSaveFeedback('币种代码必须是 3 位大写英文字母。', 'error');
      return;
    }
    const decimalPlaces = Number(formDraft.decimalPlaces);
    if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 4) {
      showSaveFeedback('金额小数位必须是 0 到 4 的整数。', 'error');
      return;
    }
    formDraft.code = currencyCode;
    formDraft.decimalPlaces = decimalPlaces;
  }

  if (page.value === 'company') {
    const taxNumber = displayValue('taxNumber', '').replace(/\s+/g, '').toUpperCase();
    if (!/^[0-9A-Z]{18}$/.test(taxNumber)) {
      showSaveFeedback('统一社会信用代码必须是 18 位数字或大写字母。', 'error');
      return;
    }
    const taxRateText = displayValue('secondary', '').trim();
    const taxRate = Number(taxRateText.replace('%', ''));
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      showSaveFeedback('默认税率必须是 0% 到 100% 之间的数值。', 'error');
      return;
    }
    const website = displayValue('website', '').trim();
    if (website && !/^(https?:\/\/)?[^\s.]+(?:\.[^\s.]+)+/i.test(website)) {
      showSaveFeedback('请填写有效的公司官网地址。', 'error');
      return;
    }
  }

  if (page.value === 'employees') {
    const hireDate = displayValue('hireDate', '').trim();
    if (hireDate && !isValidIsoDate(hireDate)) {
      showSaveFeedback('请填写有效的员工入职日期。', 'error');
      return;
    }
  }

  if (page.value === 'equipment') {
    const startDate = displayValue('startDate', '').trim();
    if (startDate && (!isValidIsoDate(startDate) || startDate > todayText())) {
      showSaveFeedback('启用日期必须是今天或更早的有效日期。', 'error');
      return;
    }
  }

  if (page.value === 'productionLines') {
    const capacityValue = Number(formDraft.capacityValue);
    if (!Number.isFinite(capacityValue) || capacityValue <= 0) {
      showSaveFeedback('标准产能必须大于 0。', 'error');
      return;
    }
    const lineType = displayValue('type', '').trim();
    const capacityUnit = displayValue('capacityUnit', '').trim();
    if (['挤出产线', '试验产线'].includes(lineType) && capacityUnit !== 'kg/小时') {
      showSaveFeedback(`${lineType}的标准产能统一使用 kg/小时。`, 'error');
      return;
    }
    if (['复绕产线', '包装产线'].includes(lineType) && !['卷/班', '卷/小时'].includes(capacityUnit)) {
      showSaveFeedback(`${lineType}的标准产能请使用卷/班或卷/小时。`, 'error');
      return;
    }
  }

  if (page.value === 'departments') {
    const currentCode = displayValue('code', '').trim();
    const currentName = displayValue('name', '').trim();
    const parentRef = displayValue('parentDepartment', '').trim();
    if (parentRef && [currentCode, currentName].includes(parentRef)) {
      showSaveFeedback('上级部门不能选择当前部门自身。', 'error');
      return;
    }
    const visited = new Set([currentCode]);
    let parent = departmentRows.value.find((row) => row.code === parentRef || row.name === parentRef);
    while (parent) {
      if (visited.has(parent.code)) {
        showSaveFeedback('部门上下级关系不能形成循环。', 'error');
        return;
      }
      visited.add(parent.code);
      const nextRef = String(parent.parentDepartment || '').trim();
      parent = nextRef ? departmentRows.value.find((row) => row.code === nextRef || row.name === nextRef) : undefined;
    }
  }

  isSaving.value = true;
  try {
    const saved = await saveMasterRecord(apiType(), toMasterRecord(), { create: mode.value === 'new' });
    sourceRecord.value = saved;
    Object.assign(formDraft, buildDraft(saved));
    resetUnsavedChanges();
    showSaveFeedback(`${saved.name}已保存到${config.value.title}资料库`);
    await router.replace(`${config.value.listPath}/${encodeURIComponent(saved.code)}`);
  } catch (error) {
    showSaveFeedback(error instanceof Error ? error.message : `${config.value.title}保存失败`, 'error');
  } finally {
    isSaving.value = false;
  }
}

function displayValue(key: string, fallback = '—') {
  const value = formDraft[key];
  if (Array.isArray(value)) return value.length ? value.join('、') : fallback;
  return value === undefined || value === '' ? fallback : String(value);
}

function referenceExcludeCodes(field: FieldConfig) {
  if (page.value === 'departments' && field.key === 'parentDepartment') {
    return departmentParentExcludeCodes.value;
  }
  return [];
}

function referenceCompany(field: FieldConfig) {
  if (page.value === 'departments' && field.key === 'parentDepartment') {
    return displayValue('owner', '').trim();
  }
  return '';
}

function detailItemValue(item: DetailItem) {
  const fallback = item.fallback ?? '—';
  const value = displayValue(item.key, fallback);
  if (page.value === 'employees' && item.key === 'linkedAccount' && value !== fallback) {
    return `${value} · ${displayValue('linkedAccountStatus', '—')}`;
  }
  if (page.value === 'productionLines' && item.key === 'capacityValue' && value !== fallback) {
    return `${value} ${displayValue('capacityUnit', '').trim()}`.trim();
  }
  return item.suffix && value !== fallback ? `${value}${item.suffix}` : value;
}

function detailItemHref(item: DetailItem) {
  if (!item.link) return '';
  const value = displayValue(item.key, '').trim();
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function detailItemRoute(item: DetailItem) {
  if (!item.routePrefix) return '';
  const value = displayValue(item.key, '').trim();
  return value ? `${item.routePrefix}${encodeURIComponent(value)}` : '';
}

function showDetailSection(section: DetailSection) {
  if (!section.noteKey) return true;
  return Boolean(displayValue(section.noteKey, '').trim());
}

function showDetailItem(_item: DetailItem) {
  return true;
}

function fieldOptions(field: FieldConfig) {
  if (page.value === 'productionLines' && field.key === 'capacityUnit') {
    return ['挤出产线', '试验产线'].includes(displayValue('type', ''))
      ? ['kg/小时']
      : ['卷/班', '卷/小时'];
  }
  return field.options ?? [];
}

function isFieldDisabled(field: FieldConfig) {
  if (isReadonlyMode.value || field.disabled) return true;
  if (page.value === 'currencies' && field.key === 'code' && mode.value !== 'new') return true;
  if (page.value === 'uom' && field.key === 'name' && field.lockWhenReferenced && uomDefinitionLocked.value) return true;
  if (page.value === 'uom' && field.key === 'status' && field.lockWhenReferenced && uomStatusLocked.value) return true;
  if (page.value === 'departments' && field.key === 'name' && departmentNameLocked.value) return true;
  if (page.value === 'company' && field.key === 'name' && field.lockWhenReferenced && companyNameLocked.value) return true;
  return false;
}

function multiSelectValues(key: string) {
  const value = formDraft[key];
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined || value === '') return [];
  return String(value)
    .split(/[、,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isMultiSelected(key: string, option: string) {
  return multiSelectValues(key).includes(option);
}

function toggleMultiValue(field: FieldConfig, option: string) {
  if (isFieldDisabled(field)) return;
  const values = multiSelectValues(field.key);

  if (option === '无') {
    formDraft[field.key] = ['无'];
    return;
  }

  const nextValues = values.includes(option)
    ? values.filter((value) => value !== option && value !== '无')
    : [...values.filter((value) => value !== '无'), option];

  formDraft[field.key] = nextValues.length ? nextValues : ['无'];
}

function handleReferenceSelect(field: FieldConfig, option: ReferenceOption) {
  if (!option.code && !option.name) {
    formDraft[field.key] = '';
    if (field.referenceType === 'departments' && field.key === 'owner') formDraft.departmentCode = '';
    return;
  }
  formDraft[field.key] = option.name;
  if (field.referenceType === 'departments' && field.key === 'owner') formDraft.departmentCode = option.code;
}

function requiredFieldLabel(field: FieldConfig) {
  return field.key === 'name' ? `${config.value.title}名称` : field.label;
}

function fieldPlaceholder(field: FieldConfig) {
  if (page.value !== 'productionLines' || field.key !== 'processScope') return field.placeholder;
  const lineType = displayValue('type', '挤出产线');
  if (lineType === '复绕产线') return '例如 大盘半成品复绕为 1kg 小盘成品';
  if (lineType === '包装产线') return '例如 1kg 线盘真空、装盒、装箱与贴标';
  if (lineType === '试验产线') return '例如 新品配方、小批试制与工艺窗口验证';
  return '例如 PLA/PETG 1.75mm 挤出';
}

function simpleFormFieldClass(field: FieldConfig) {
  return [
    {
      'field-wide': field.span === 3,
      'field-span-2': field.span === 2,
      'field-compact-textarea': field.kind === 'textarea' && (field.rows ?? 3) <= 2,
    },
    field.required ? requiredFieldClass(requiredFieldLabel(field), formDraft[field.key]) : {},
  ];
}
</script>

<template>
  <DocumentLoadState
    v-if="mode !== 'new' && !sourceRecord"
    :loading="isLoading"
    :title="config.title"
    :message="loadMessage || `${config.title}不存在`"
    :back-path="config.listPath"
    :back-label="`返回${config.title}列表`"
    @retry="loadRecord"
  />

  <section v-else-if="isDetailMode" class="quote-editor master-simple-editor is-detail-view">
    <PageTopbarPortal>
      <template #context>
        <RouterLink v-if="backPath" class="topbar-back-action" :to="backPath" :aria-label="`返回${config.title}列表`" :title="`返回${config.title}列表`">
          <ChevronLeft :size="14" :stroke-width="2" />
          <span>返回</span>
        </RouterLink>
        <strong class="topbar-context-title">{{ displayValue('name', pageHeading) }}</strong>
      </template>
      <template #actions>
        <PinReferenceButton
          v-if="referencePath"
          class="topbar-optional-action"
          :title="referenceTitle"
          :subtitle="referenceSubtitle"
          :path="referencePath"
        />
        <button class="primary-action" type="button" :disabled="!canWriteMasterData" :title="simpleEditActionTitle" @click="openEdit">
          <Pencil :size="16" />
          <span>编辑</span>
        </button>
      </template>
      <template #fallback>
        <div class="quote-editor-header"><div><h1>{{ displayValue('name', pageHeading) }}</h1></div></div>
      </template>
    </PageTopbarPortal>

    <div class="quote-form-grid simple-form-grid">
      <div class="quote-main-sections simple-detail-content">
        <section
          v-for="section in config.detailSections"
          v-show="showDetailSection(section)"
          :key="section.title"
          class="form-section material-detail-section simple-detail-section"
        >
          <div class="form-section-head">
            <div><h2>{{ section.title }}</h2></div>
          </div>
          <dl
            v-if="section.items"
            class="material-fact-grid simple-fact-grid"
            :class="{
              'simple-fact-grid-two': section.items.filter(showDetailItem).length === 2,
              'simple-fact-grid-four': section.items.filter(showDetailItem).length === 4,
              'simple-fact-grid-five': section.items.filter(showDetailItem).length === 5,
            }"
          >
            <div v-for="item in section.items.filter(showDetailItem)" :key="item.key"><dt>{{ item.label }}</dt><dd>{{ detailItemValue(item) }}</dd></div>
          </dl>
          <div v-if="section.groups" class="material-rule-groups simple-info-groups">
            <section v-for="group in section.groups" :key="group.title">
              <span>{{ group.title }}</span>
              <dl>
                <div v-for="item in group.items" :key="item.key">
                  <dt>{{ item.label }}</dt>
                  <dd>
                    <RouterLink v-if="detailItemRoute(item)" class="simple-detail-link" :to="detailItemRoute(item)">{{ detailItemValue(item) }}</RouterLink>
                    <a v-else-if="detailItemHref(item)" class="simple-detail-link" :href="detailItemHref(item)" target="_blank" rel="noopener noreferrer">{{ detailItemValue(item) }}</a>
                    <template v-else>{{ detailItemValue(item) }}</template>
                  </dd>
                </div>
              </dl>
            </section>
          </div>
          <p v-if="section.noteKey" class="material-note-copy">{{ displayValue(section.noteKey, '—') }}</p>
        </section>
      </div>

      <aside class="quote-summary-panel simple-side-panel">
        <section class="summary-section">
          <div class="summary-title"><ClipboardList :size="17" /><h2>{{ config.statusHeading || '使用状态' }}</h2></div>
          <div class="material-rule-card" :class="{ warn: displayValue('status') === '停用' }">
            <strong>{{ statusSummary.title }}</strong>
            <span>{{ statusSummary.text }}</span>
          </div>
        </section>
        <section class="summary-section">
          <div class="summary-title"><h2>资料完整性</h2></div>
          <div class="warehouse-completeness-list simple-completeness-list">
            <div v-for="item in completenessChecks" :key="item.label" :class="{ complete: item.complete }">
              <i><Check v-if="item.complete" :size="13" :stroke-width="2.4" /><CircleAlert v-else :size="13" :stroke-width="2.2" /></i>
              <span><strong>{{ item.label }}</strong><small>{{ item.complete ? '已维护' : '待补充后供新业务使用' }}</small></span>
            </div>
          </div>
        </section>
        <section v-if="config.sealUpload" class="summary-section">
          <div class="summary-title"><Upload :size="17" /><h2>电子章</h2></div>
          <div class="simple-attachment"><Upload :size="16" /><span>{{ sealCount ? `已维护 ${sealCount} 个电子章` : '暂无电子章' }}</span></div>
        </section>
      </aside>
    </div>
    <div v-if="saveMessage" class="app-toast" :class="{ error: saveTone === 'error' }" :role="saveTone === 'error' ? 'alert' : 'status'" :aria-live="saveTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ saveMessage }}</div>
  </section>

  <section v-else class="quote-editor master-simple-editor">
    <PageTopbarPortal>
      <template #context>
        <RouterLink v-if="backPath" class="topbar-back-action" :to="backPath" :aria-label="`返回${config.title}`" :title="`返回${config.title}`">
          <ChevronLeft :size="14" :stroke-width="2" />
          <span>返回</span>
        </RouterLink>
        <strong class="topbar-context-title">{{ pageHeading }}</strong>
      </template>
      <template #actions>
        <button class="primary-action master-save-action" type="button" :disabled="Boolean(saveDisabledReason)" :aria-busy="isSaving" :data-loading="isLoading || undefined" :title="simpleSaveActionTitle" @click="saveRecord">
          <Save :size="16" />
          <span>{{ isSaving ? '保存中' : '保存' }}</span>
        </button>
      </template>
      <template #fallback>
        <div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1></div></div>
      </template>
    </PageTopbarPortal>

    <div class="quote-form-grid simple-form-grid is-editing">
      <div class="quote-main-sections">
        <section v-for="section in config.sections" :key="section.title" class="form-section">
          <div class="form-section-head"><h2>{{ section.title }}</h2></div>
          <div class="quote-fields">
            <label
              v-for="field in section.fields"
              :key="field.key"
              class="form-field"
              :class="simpleFormFieldClass(field)"
            >
              <span>{{ field.label }}</span>
              <div
                v-if="field.kind === 'multi-select'"
                class="multi-select-field"
                :class="{ 'is-disabled': isFieldDisabled(field) }"
              >
                <button
                  v-for="option in field.options ?? []"
                  :key="option"
                  type="button"
                  class="multi-select-chip"
                  :class="{ 'is-active': isMultiSelected(field.key, option) }"
                  :disabled="isFieldDisabled(field)"
                  :title="`${isMultiSelected(field.key, option) ? '取消选择' : '选择'}${field.label}：${option}`"
                  @click="toggleMultiValue(field, option)"
                >
                  {{ option }}
                </button>
              </div>
              <select
                v-else-if="field.kind === 'select'"
                v-model="formDraft[field.key]"
                :disabled="isFieldDisabled(field)"
              >
                <option v-for="option in fieldOptions(field)" :key="option" :value="option">{{ option }}</option>
              </select>
              <ReferencePicker
                v-else-if="field.kind === 'reference' && field.referenceType"
                :required="field.required"
                :model-value="displayValue(field.key, '')"
                :display-value="displayValue(field.key, '')"
                :type="field.referenceType"
                :title="field.referenceTitle ?? `选择${field.label}`"
                :placeholder="field.placeholder ?? `选择${field.label}`"
                :search-placeholder="field.referenceSearchPlaceholder ?? `搜索${field.label}编码或名称`"
                :disabled="isFieldDisabled(field)"
                :exclude-codes="referenceExcludeCodes(field)"
                :company="referenceCompany(field)"
                @select="handleReferenceSelect(field, $event)"
              />
              <textarea
                v-else-if="field.kind === 'textarea'"
                v-model="formDraft[field.key]"
                :rows="field.rows ?? 3"
                :placeholder="fieldPlaceholder(field)"
                :disabled="isFieldDisabled(field)"
              />
              <input
                v-else
                v-model="formDraft[field.key]"
                :type="field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'"
                :maxlength="field.maxLength"
                :placeholder="fieldPlaceholder(field)"
                :disabled="isFieldDisabled(field)"
              />
            </label>
          </div>
        </section>
        <p v-if="employeeDepartmentBlockReason" class="form-hint error">{{ employeeDepartmentBlockReason }}</p>
        <p v-if="employeeStatusBlockReason" class="form-hint error">{{ employeeStatusBlockReason }}</p>
        <p v-if="departmentStatusBlockReason" class="form-hint error">{{ departmentStatusBlockReason }}</p>
        <p v-if="companyStatusBlockReason" class="form-hint error">{{ companyStatusBlockReason }}</p>
        <p v-if="equipmentDepartmentBlockReason" class="form-hint error">{{ equipmentDepartmentBlockReason }}</p>
        <p v-if="productionLineDepartmentBlockReason" class="form-hint error">{{ productionLineDepartmentBlockReason }}</p>
        <p v-if="uomDefinitionHint" class="form-hint">{{ uomDefinitionHint }}</p>
      </div>

      <section v-if="config.sealUpload" class="form-section simple-seal-editor">
          <div class="form-section-head"><h2>电子章</h2></div>
          <div v-if="sealSlots.length" class="seal-slot-list">
            <div v-for="slot in sealSlots" :key="slot.name" class="seal-slot" :class="{ 'is-uploaded': slot.uploaded }">
              <span class="seal-slot-icon">
                <Upload :size="16" />
              </span>
              <span class="seal-slot-main">
                <strong>{{ slot.name }}</strong>
                <small>{{ slot.uploaded ? '已上传' : '暂无电子章' }}</small>
              </span>
              <label
                class="secondary-action compact-action file-upload-button"
                :class="{ 'is-disabled': isReadonlyMode }"
                :aria-disabled="isReadonlyMode"
                :title="sealUploadTitle"
              >
                上传
                <input
                  type="file"
                  accept="image/*,.png,.jpg,.jpeg,.webp"
                  :disabled="isReadonlyMode"
                  @change="handleSealUpload"
                />
              </label>
            </div>
          </div>
          <div v-else class="attachment-empty">
            <Upload :size="17" />
            <span>暂无电子章，可上传后用于打印模板。</span>
            <label
              class="secondary-action compact-action file-upload-button"
              :class="{ 'is-disabled': isReadonlyMode }"
              :aria-disabled="isReadonlyMode"
              :title="sealUploadTitle"
            >
              上传
              <input
                type="file"
                accept="image/*,.png,.jpg,.jpeg,.webp"
                :disabled="isReadonlyMode"
                @change="handleSealUpload"
              />
            </label>
          </div>
      </section>
    </div>
    <div v-if="saveMessage" class="app-toast" :class="{ error: saveTone === 'error' }" :role="saveTone === 'error' ? 'alert' : 'status'" :aria-live="saveTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ saveMessage }}</div>
  </section>
</template>

<style scoped>
.master-simple-editor .simple-form-grid.is-editing {
  grid-template-columns: minmax(0, 1fr);
}

.master-simple-editor .simple-detail-section,
.master-simple-editor .simple-seal-editor {
  min-width: 0;
}

.master-simple-editor .simple-info-groups {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.master-simple-editor .simple-info-groups > section:last-child {
  background: #f7faf6;
}

.master-simple-editor .simple-detail-link {
  color: #315f49;
  text-decoration: underline;
  text-decoration-color: rgba(49, 95, 73, 0.32);
  text-underline-offset: 3px;
  overflow-wrap: anywhere;
}

.master-simple-editor .simple-detail-link:hover {
  text-decoration-color: currentColor;
}

.master-simple-editor .simple-seal-editor {
  width: 100%;
}

.master-simple-editor .multi-select-field {
  min-height: 36px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 5px;
  border: 1px solid #dedbd2;
  border-radius: 8px;
  background: #f7f6f2;
}

@media (max-width: 820px) {
  .master-simple-editor .simple-info-groups {
    grid-template-columns: 1fr;
  }

}

.master-simple-editor .multi-select-field.is-disabled {
  background: #efeee9;
  color: #77736b;
}

.master-simple-editor .multi-select-chip {
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid #dedbd2;
  border-radius: 7px;
  background: #ffffff;
  color: #4f4b44;
  font: inherit;
  cursor: pointer;
}

.master-simple-editor .multi-select-chip.is-active {
  border-color: #111111;
  background: #111111;
  color: #ffffff;
}

.master-simple-editor .multi-select-chip:disabled {
  cursor: default;
}

.master-simple-editor .multi-select-field.is-disabled .multi-select-chip {
  border-color: #d9d7cf;
  background: #f1f0eb;
  color: #6f6b63;
}

.master-simple-editor .multi-select-field.is-disabled .multi-select-chip.is-active {
  border-color: #d9e6ec;
  background: #edf5f8;
  color: #3b6270;
}

.master-simple-editor .form-field textarea {
  resize: none;
  min-height: 92px;
  line-height: 1.55;
}

.master-simple-editor .form-field.field-span-2 textarea {
  min-height: 96px;
}

.master-simple-editor .form-field.field-wide textarea {
  min-height: 112px;
}

.master-simple-editor .form-field.field-compact-textarea textarea {
  min-height: 76px;
}

.master-simple-editor input[type='number'] {
  appearance: textfield;
}

.master-simple-editor input[type='number']::-webkit-outer-spin-button,
.master-simple-editor input[type='number']::-webkit-inner-spin-button {
  margin: 0;
  appearance: none;
}

.master-simple-editor .simple-status-note {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 8px;
  background: #edf7ef;
  color: #344338;
}

.master-simple-editor .simple-status-note.muted {
  background: #f4f2ed;
  color: #5d5a52;
}

.master-simple-editor .simple-status-note.warn {
  background: #fff6df;
  color: #745315;
}

.master-simple-editor .simple-status-note strong {
  font-size: 14px;
}

.master-simple-editor .simple-status-note span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.master-simple-editor .simple-attachment {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fbfbf7;
  color: var(--muted);
  font-size: 13px;
}

.master-simple-editor .seal-slot-list {
  display: grid;
  gap: 8px;
}

.master-simple-editor .seal-slot {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 54px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fbfbf7;
}

.master-simple-editor .seal-slot.is-uploaded {
  border-color: #d7e6dc;
  background: #f2f9f4;
}

.master-simple-editor .seal-slot-icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 8px;
  background: #f0efe9;
  color: #656158;
}

.master-simple-editor .seal-slot.is-uploaded .seal-slot-icon {
  background: #e4f2e8;
  color: #3f7650;
}

.master-simple-editor .seal-slot-main {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.master-simple-editor .seal-slot-main strong {
  font-size: 13px;
}

.master-simple-editor .seal-slot-main small {
  color: var(--muted);
  font-size: 12px;
}

.master-simple-editor .summary-section h2 .secondary-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  height: 30px;
  padding: 0 10px;
  white-space: nowrap;
}
</style>
