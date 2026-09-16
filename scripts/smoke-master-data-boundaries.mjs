import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataFile = process.env.FILATRIX_DATA_FILE || join(rootDir, 'server/data/erp-data.json');
const baseUrl = (process.env.FILATRIX_SMOKE_API_BASE || process.env.VITE_API_BASE || 'http://127.0.0.1:5175/api').replace(
  /\/$/,
  '',
);

async function request(path, { method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status !== status) {
    throw new Error(`${method} ${path}: expected HTTP ${status}, got ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function assertRemoved(record, fields, label) {
  const leaked = fields.filter((field) => field in (record || {}));
  if (leaked.length) {
    throw new Error(`${label} leaked removed fields ${leaked.join(', ')}: ${JSON.stringify(record)}`);
  }
}

async function assertRejected(path, body, expectedText, label, status = 400) {
  const payload = await request(path, { method: 'PUT', body, status });
  const message = String(payload.error || payload.message || '');
  if (!message.includes(expectedText)) {
    throw new Error(`${label} returned an unclear boundary error: ${JSON.stringify(payload)}`);
  }
}

const customerRemoved = ['owner', 'manager', 'primary', 'secondary'];
const supplierRemoved = [
  'owner',
  'manager',
  'primary',
  'secondary',
  'supplyScope',
  'incomingQualityRule',
  'qualificationRequired',
  'qualificationStatus',
  'supplyMaterialCount',
  'purchaseLeadTimeDays',
];
const materialRemoved = ['owner', 'primary', 'secondary'];
const warehouseRemoved = ['owner', 'manager', 'phone', 'warehouseScope', 'primary', 'secondary'];
const snapshot = readFileSync(dataFile, 'utf8');

try {
  const material = await request('/master-data/materials/M-FG-PETG-175-BLK');
  assertRemoved(material.record, materialRemoved, 'material');
  const updatedMaterial = await request('/master-data/materials/M-FG-PETG-175-BLK', {
    method: 'PUT',
    body: {
      ...material.record,
      englishName: '  Smoke Material English Name  ',
      englishModel: '  SMOKE-MODEL-EN  ',
      englishSpec: '  Smoke material English specification  ',
      owner: '伪造归属部门',
      primary: '伪造摘要',
      secondary: '伪造补充摘要',
    },
  });
  assertRemoved(updatedMaterial.record, materialRemoved, 'updated material');
  if (
    updatedMaterial.record.englishName !== 'Smoke Material English Name'
    || updatedMaterial.record.englishModel !== 'SMOKE-MODEL-EN'
    || updatedMaterial.record.englishSpec !== 'Smoke material English specification'
  ) {
    throw new Error(`material English facts were not saved from one source: ${JSON.stringify(updatedMaterial.record)}`);
  }
  const materialEnglishModelReference = await request('/reference/materials?keyword=SMOKE-MODEL-EN&limit=10');
  if (!materialEnglishModelReference.items.some((item) => item.code === updatedMaterial.record.code)) {
    throw new Error(`material English model was not searchable: ${JSON.stringify(materialEnglishModelReference.items)}`);
  }
  await assertRejected(
    '/master-data/materials/M-FG-PETG-175-BLK',
    { ...updatedMaterial.record, uom: '不存在单位' },
    '基础单位',
    'invalid material unit',
  );
  await assertRejected(
    '/master-data/materials/M-FG-PETG-175-BLK',
    { ...updatedMaterial.record, isSaleable: false, isPurchasable: false, isProducible: false },
    '业务属性',
    'material without a business purpose',
  );
  const sparePartMaterial = await request('/master-data/materials', {
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: 'Smoke 设备备件',
      category: '备件',
      type: '备件',
      uom: '个',
      isSaleable: false,
      isPurchasable: true,
      isProducible: false,
      batchControl: '不追踪批次',
      shelfLife: '无效期要求',
      incomingQualityControl: '免检',
      inboundQualityControl: '不适用',
      status: '启用',
    },
  });
  if (sparePartMaterial.record.category !== '备件' || sparePartMaterial.record.isProducible) {
    throw new Error(`spare-part material category or output capability was not preserved: ${JSON.stringify(sparePartMaterial.record)}`);
  }
  await assertRejected(
    '/master-data/materials/M-FG-PETG-175-BLK',
    { ...updatedMaterial.record, category: '原料', type: '原料' },
    '不能直接改分类',
    'material category mutation',
  );
  const stockedMaterial = await request('/master-data/materials/M-FG-PLA-175-WHT');
  await assertRejected(
    '/master-data/materials/M-FG-PLA-175-WHT',
    { ...stockedMaterial.record, status: ' 停用 ' },
    '非零库存',
    'stocked material disable with padded status',
  );
  const relationMaterial = await request('/master-data/materials/M-CM-BLACK');
  const renamedRelationMaterial = await request('/master-data/materials/M-CM-BLACK', {
    method: 'PUT',
    body: { ...relationMaterial.record, name: `${relationMaterial.record.name} Smoke` },
  });
  const renamedMaterialRelations = await request('/master-data/relations/material-suppliers?materialCode=M-CM-BLACK');
  if (
    !renamedMaterialRelations.items.length
    || renamedMaterialRelations.items.some((item) => item.materialName !== renamedRelationMaterial.record.name)
  ) {
    throw new Error(`material rename did not refresh relation names: ${JSON.stringify(renamedMaterialRelations.items)}`);
  }

  const customer = await request('/master-data/customers/CUS-00001');
  assertRemoved(customer.record, customerRemoved, 'customer');
  const updatedCustomer = await request('/master-data/customers/CUS-00001', {
    method: 'PUT',
    body: {
      ...customer.record,
      owner: '伪造归属部门',
      manager: '伪造客户负责人',
      primary: '伪造联系摘要',
      secondary: '伪造地址摘要',
    },
  });
  assertRemoved(updatedCustomer.record, customerRemoved, 'updated customer');
  const otherCustomer = await request('/master-data/customers/CUS-00003');
  await assertRejected(
    '/master-data/customers/CUS-00003',
    { ...otherCustomer.record, name: customer.record.name },
    '客户名称已存在',
    'duplicate customer name',
  );
  await assertRejected(
    '/master-data/customers/CUS-00001',
    { ...updatedCustomer.record, email: 'invalid-email' },
    '客户邮箱',
    'invalid customer email',
  );
  await assertRejected(
    '/master-data/customers/CUS-00001',
    { ...updatedCustomer.record, creditLimit: -1 },
    '信用额度',
    'negative customer credit',
  );
  const concurrencySource = await request('/master-data/customers/CUS-00002');
  await request('/master-data/customers/CUS-00002', {
    method: 'PUT',
    body: { ...concurrencySource.record, note: 'Smoke first concurrent update' },
  });
  await assertRejected(
    '/master-data/customers/CUS-00002',
    { ...concurrencySource.record, phone: '0571-0000-0000' },
    '其他用户更新',
    'stale master-data update',
    409,
  );
  await assertRejected(
    '/master-data/customers/CUS-00002',
    { ...concurrencySource.record, email: 'invalid-email' },
    '其他用户更新',
    'stale invalid master-data update',
    409,
  );

  const supplier = await request('/master-data/suppliers/SUP-HZRB');
  assertRemoved(supplier.record, supplierRemoved, 'supplier');
  const updatedSupplier = await request('/master-data/suppliers/SUP-HZRB', {
    method: 'PUT',
    body: {
      ...supplier.record,
      owner: '伪造归属部门',
      manager: '伪造采购员',
      primary: '伪造联系摘要',
      secondary: '伪造地址摘要',
      supplyMaterialCount: 99,
      purchaseLeadTimeDays: 99,
      supplyScope: '伪造供货范围',
      incomingQualityRule: '伪造检验规则',
    },
  });
  assertRemoved(updatedSupplier.record, supplierRemoved, 'updated supplier');
  const otherSupplier = await request('/master-data/suppliers/SUP-JXJC');
  await assertRejected(
    '/master-data/suppliers/SUP-HZRB',
    { ...updatedSupplier.record, name: otherSupplier.record.name },
    '供应商名称已存在',
    'duplicate supplier name',
  );
  await assertRejected(
    '/master-data/suppliers/SUP-HZRB',
    { ...updatedSupplier.record, email: 'invalid-email' },
    '供应商邮箱',
    'invalid supplier email',
  );
  await assertRejected(
    '/master-data/suppliers/SUP-HZRB',
    { ...updatedSupplier.record, paymentTermDays: 1.5 },
    '整数',
    'fractional supplier payment term',
  );

  const warehouse = await request('/master-data/warehouses/WH-RM');
  assertRemoved(warehouse.record, warehouseRemoved, 'warehouse');
  const updatedWarehouse = await request('/master-data/warehouses/WH-RM', {
    method: 'PUT',
    body: {
      ...warehouse.record,
      owner: '伪造归属部门',
      manager: '伪造负责人',
      phone: '伪造联系电话',
      warehouseScope: '伪造保管范围',
      primary: '伪造库位摘要',
      secondary: '伪造用途摘要',
    },
  });
  assertRemoved(updatedWarehouse.record, warehouseRemoved, 'updated warehouse');
  const migratedStagingWarehouse = await request('/master-data/warehouses/WH-QC-HOLD');
  if (migratedStagingWarehouse.record.type !== '暂存仓') {
    throw new Error(`legacy quality staging warehouse type was not migrated: ${JSON.stringify(migratedStagingWarehouse.record)}`);
  }
  const sparePartWarehouse = await request('/master-data/warehouses', {
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: 'Smoke 备件仓',
      type: '备件仓',
      company: 'Filatrix 增材材料有限公司',
      warehouseFunctions: ['可采购入库'],
      locationCount: 1,
      binPrefix: 'SP',
      status: '启用',
    },
  });
  if (sparePartWarehouse.record.type !== '备件仓' || !sparePartWarehouse.record.warehouseFunctions.includes('可采购入库')) {
    throw new Error(`spare-part warehouse was not normalized correctly: ${JSON.stringify(sparePartWarehouse.record)}`);
  }
  const otherWarehouse = await request('/master-data/warehouses/WH-FG');
  await assertRejected(
    '/master-data/warehouses/WH-RM',
    { ...updatedWarehouse.record, name: otherWarehouse.record.name },
    '仓库名称已存在',
    'duplicate warehouse name',
  );
  await assertRejected(
    '/master-data/warehouses/WH-RM',
    { ...updatedWarehouse.record, binPrefix: '原料' },
    '库位前缀',
    'invalid warehouse bin prefix',
  );
  await assertRejected(
    '/master-data/warehouses/WH-RM',
    { ...updatedWarehouse.record, type: '综合仓' },
    '已有仓库不能直接修改',
    'existing warehouse type mutation',
  );
  const secondCompany = await request('/master-data/company', {
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: 'Smoke 第二公司',
      type: '分支机构',
      taxNumber: '91330100SMOKE00002',
      secondary: '13%',
      status: '启用',
    },
  });
  await assertRejected(
    '/master-data/warehouses/WH-RM',
    { ...updatedWarehouse.record, company: secondCompany.record.name },
    '库存责任主体',
    'existing warehouse company mutation',
  );
  const stockedWarehouse = await request('/master-data/warehouses/WH-FG');
  await assertRejected(
    '/master-data/warehouses/WH-FG',
    { ...stockedWarehouse.record, status: ' 停用 ' },
    '非零库存',
    'stocked warehouse disable with padded status',
  );

  const unit = await request('/master-data/uom/UOM-KG');
  assertRemoved(unit.record, ['owner', 'primary', 'secondary'], 'unit');
  await assertRejected(
    '/master-data/uom/UOM-KG',
    { ...unit.record, englishAbbreviation: '千克' },
    '英文简称',
    'invalid English unit abbreviation',
  );
  await assertRejected(
    '/master-data/uom/UOM-KG',
    { ...unit.record, status: '草稿' },
    '使用状态',
    'invalid unit status',
  );
  await assertRejected(
    '/master-data/uom/UOM-KG',
    { ...unit.record, status: ' 停用 ' },
    '启用物料引用',
    'referenced unit disable with padded status',
  );
  const stoppedOnlyUnit = await request('/master-data/uom', {
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: 'Smoke 停用引用单位',
      englishAbbreviation: 'smkstop',
      status: '启用',
    },
  });
  await request('/master-data/materials', {
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: 'Smoke 停用单位引用物料',
      category: '原料',
      type: '原料',
      uom: stoppedOnlyUnit.record.name,
      isSaleable: false,
      isPurchasable: true,
      isProducible: false,
      batchControl: '批次管理',
      shelfLife: '无效期要求',
      incomingQualityControl: '需质检',
      inboundQualityControl: '不适用',
      status: '停用',
    },
  });
  const disabledStoppedOnlyUnit = await request(
    `/master-data/uom/${encodeURIComponent(stoppedOnlyUnit.record.code)}`,
    {
      method: 'PUT',
      body: { ...stoppedOnlyUnit.record, status: '停用' },
    },
  );
  if (disabledStoppedOnlyUnit.record.status !== '停用') {
    throw new Error(`unit referenced only by stopped materials should remain disableable: ${JSON.stringify(disabledStoppedOnlyUnit)}`);
  }
  const unitReferences = await request('/reference/uom?limit=10');
  const kilogramReference = unitReferences.items.find((item) => item.code === 'UOM-KG');
  if (!kilogramReference || kilogramReference.primary !== '英文简称 kg' || kilogramReference.primary === '-') {
    throw new Error(`unit reference summary is unclear: ${JSON.stringify(kilogramReference)}`);
  }

  const departmentReferences = await request(
    `/reference/departments?company=${encodeURIComponent('Filatrix 增材材料有限公司')}&limit=30`,
  );
  if (
    departmentReferences.items.some(
      (item) => item.primary !== 'Filatrix 增材材料有限公司' || item.meta.includes('Filatrix 增材材料有限公司'),
    )
  ) {
    throw new Error(`department reference summary duplicates or crosses company facts: ${JSON.stringify(departmentReferences.items)}`);
  }

  const employeeReferences = await request('/reference/employees?limit=30');
  if (
    employeeReferences.items.some((item) =>
      item.meta.some((meta) => item.primary.includes(meta) || item.secondary.includes(meta)),
    )
  ) {
    throw new Error(`employee reference summary duplicates visible facts: ${JSON.stringify(employeeReferences.items)}`);
  }

  const employee = await request('/master-data/employees/EMP-ZY');
  assertRemoved(
    employee.record,
    ['contact', 'primary', 'secondary', 'birthDate', 'homeAddress', 'emergencyContactName', 'emergencyContactPhone'],
    'employee',
  );
  await assertRejected(
    '/master-data/employees/EMP-ZY',
    { ...employee.record, position: '' },
    '岗位/职务',
    'employee without a position',
  );
  await assertRejected(
    '/master-data/employees/EMP-ZY',
    { ...employee.record, email: 'invalid-email' },
    '员工邮箱',
    'invalid employee email',
  );
  await assertRejected(
    '/master-data/employees/EMP-ZY',
    { ...employee.record, owner: '不存在部门', departmentCode: 'DEP-NOT-FOUND' },
    '有效的所属部门',
    'employee with an invalid department',
  );

  const company = await request('/master-data/company/COM-FILATRIX');
  assertRemoved(company.record, ['owner', 'manager'], 'company');
  await assertRejected(
    '/master-data/company/COM-FILATRIX',
    { ...company.record, type: '工厂' },
    '公司类型',
    'invalid company type',
  );
  await assertRejected(
    '/master-data/company/COM-FILATRIX',
    { ...company.record, email: 'invalid-email' },
    '公司邮箱',
    'invalid company email',
  );
  await assertRejected(
    '/master-data/company/COM-FILATRIX',
    { ...company.record, status: ' 停用 ' },
    '启用部门',
    'referenced company disable with padded status',
  );

  const equipment = await request('/master-data/equipment/EQ-WIND-01');
  assertRemoved(equipment.record, ['secondary'], 'equipment');
  await assertRejected(
    '/master-data/equipment/EQ-WIND-01',
    { ...equipment.record, primary: '' },
    '使用位置',
    'equipment without a location',
  );
  await assertRejected(
    '/master-data/equipment/EQ-WIND-01',
    { ...equipment.record, startDate: '2025-02-31' },
    '启用日期',
    'equipment with an invalid date',
  );

  const productionLine = await request('/master-data/productionLines/LINE-RD-01');
  await assertRejected(
    '/master-data/productionLines/LINE-RD-01',
    { ...productionLine.record, owner: '', departmentCode: '' },
    '所属部门',
    'production line without a department',
  );

  const supplierRelations = await request('/master-data/relations/material-suppliers?supplierCode=SUP-JXJC');
  if (!supplierRelations.items.length) throw new Error('supplier relation boundary smoke requires at least one relation');
  await assertRejected(
    '/master-data/relations/material-suppliers/SUP-JXJC',
    { items: supplierRelations.items.slice(1) },
    '不能直接删除',
    'omitted supplier relation',
  );
  await assertRejected(
    '/master-data/relations/material-suppliers/SUP-JXJC',
    {
      items: supplierRelations.items.map((item, index) => (
        index === 0 ? { ...item, leadTimeDays: 1.5 } : item
      )),
    },
    '整数天',
    'fractional supplier lead time',
  );
  const temporaryMaterial = await request('/master-data/materials', {
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: 'Smoke 停用关系物料',
      category: '原料',
      type: '原料',
      uom: 'kg',
      isSaleable: false,
      isPurchasable: true,
      isProducible: false,
      batchControl: '批次管理',
      shelfLife: '无效期要求',
      incomingQualityControl: '需质检',
      inboundQualityControl: '不适用',
      status: '启用',
    },
  });
  const hostSupplier = await request('/master-data/suppliers/SUP-SZCS');
  const hostSupplierRelations = await request('/master-data/relations/material-suppliers?supplierCode=SUP-SZCS');
  await request('/master-data/relations/material-suppliers/SUP-SZCS', {
    method: 'PUT',
    body: {
      items: [
        ...hostSupplierRelations.items,
        {
          code: 'NEW-SMOKE',
          supplierCode: 'SUP-SZCS',
          supplierName: hostSupplier.record.name,
          materialCode: temporaryMaterial.record.code,
          materialName: temporaryMaterial.record.name,
          supplierMaterialCode: 'SMOKE-STOP-01',
          minOrderQty: 1,
          leadTimeDays: 1,
          isDefault: false,
          status: '启用',
        },
      ],
    },
  });
  const nonPurchasableMaterial = await request(`/master-data/materials/${encodeURIComponent(temporaryMaterial.record.code)}`, {
    method: 'PUT',
    body: {
      ...temporaryMaterial.record,
      isPurchasable: false,
      isProducible: true,
      inboundQualityControl: '需质检',
    },
  });
  const nonPurchasableMaterialRelations = await request(
    `/master-data/relations/material-suppliers?materialCode=${encodeURIComponent(temporaryMaterial.record.code)}`,
  );
  if (
    !nonPurchasableMaterialRelations.items.length
    || nonPurchasableMaterialRelations.items.some((item) => item.status !== '停用' || item.isDefault)
  ) {
    throw new Error(`removing purchasable capability did not stop supply relations: ${JSON.stringify(nonPurchasableMaterialRelations.items)}`);
  }
  await assertRejected(
    '/master-data/relations/material-suppliers/SUP-SZCS',
    {
      items: [
        ...hostSupplierRelations.items,
        ...nonPurchasableMaterialRelations.items.map((item) => ({ ...item, status: '启用' })),
      ],
    },
    '可采购属性',
    'active relation on non-purchasable material',
  );
  await request(`/master-data/materials/${encodeURIComponent(temporaryMaterial.record.code)}`, {
    method: 'PUT',
    body: { ...nonPurchasableMaterial.record, status: ' 停用 ' },
  });
  const relationSupplier = await request('/master-data/suppliers/SUP-JXJC');
  const renamedSupplier = await request('/master-data/suppliers/SUP-JXJC', {
    method: 'PUT',
    body: { ...relationSupplier.record, name: `${relationSupplier.record.name} Smoke` },
  });
  const renamedSupplierRelations = await request('/master-data/relations/material-suppliers?supplierCode=SUP-JXJC');
  if (renamedSupplierRelations.items.some((item) => item.supplierName !== renamedSupplier.record.name)) {
    throw new Error(`supplier rename did not refresh relation names: ${JSON.stringify(renamedSupplierRelations.items)}`);
  }
  const equipmentSupplier = await request('/master-data/suppliers/SUP-JXJC', {
    method: 'PUT',
    body: { ...renamedSupplier.record, type: '设备供应商' },
  });
  const equipmentSupplierRelations = await request('/master-data/relations/material-suppliers?supplierCode=SUP-JXJC');
  if (
    !equipmentSupplierRelations.items.length
    || equipmentSupplierRelations.items.some((item) => item.status !== '停用' || item.isDefault)
  ) {
    throw new Error(`non-material supplier type did not stop supply relations: ${JSON.stringify(equipmentSupplierRelations.items)}`);
  }
  await assertRejected(
    '/master-data/relations/material-suppliers/SUP-JXJC',
    {
      items: equipmentSupplierRelations.items.map((item, index) => (
        index === 0 ? { ...item, status: '启用' } : item
      )),
    },
    '供应商类型',
    'active relation on non-material supplier type',
  );
  await request('/master-data/suppliers/SUP-JXJC', {
    method: 'PUT',
    body: { ...equipmentSupplier.record, status: ' 停用 ' },
  });
  const stoppedSupplierRelations = await request('/master-data/relations/material-suppliers?supplierCode=SUP-JXJC');
  if (stoppedSupplierRelations.items.some((item) => item.status !== '停用' || item.isDefault)) {
    throw new Error(`supplier disable did not stop all supply relations: ${JSON.stringify(stoppedSupplierRelations.items)}`);
  }
  await assertRejected(
    '/master-data/relations/material-suppliers/SUP-JXJC',
    {
      items: stoppedSupplierRelations.items.map((item, index) => (
        index === 0 ? { ...item, status: '启用' } : item
      )),
    },
    '供应商',
    'active relation on stopped supplier',
  );

  const warehouseRelations = await request('/master-data/relations/warehouse-materials?warehouseCode=WH-RM');
  if (!warehouseRelations.items.length) throw new Error('warehouse relation boundary smoke requires at least one relation');
  await assertRejected(
    '/master-data/relations/warehouse-materials/WH-QC-HOLD',
    {
      items: [{
        code: 'NEW-SMOKE-QC',
        warehouseCode: 'WH-QC-HOLD',
        warehouseName: '采购暂存区',
        materialCode: 'M-FG-PETG-175-BLK',
        materialName: '测试物料001',
        safetyStock: 0,
        reorderPoint: 1,
        maxStock: 2,
        replenishmentLot: 1,
        status: '启用',
      }],
    },
    '业务职能',
    'active replenishment relation on quality-hold warehouse',
  );
  await assertRejected(
    '/master-data/relations/warehouse-materials/WH-RM',
    { items: warehouseRelations.items.slice(1) },
    '不能直接删除',
    'omitted warehouse replenishment relation',
  );
  const warehouseBeforeRename = await request('/master-data/warehouses/WH-RM');
  const renamedWarehouse = await request('/master-data/warehouses/WH-RM', {
    method: 'PUT',
    body: { ...warehouseBeforeRename.record, name: `${warehouseBeforeRename.record.name} Smoke` },
  });
  const renamedWarehouseRelations = await request('/master-data/relations/warehouse-materials?warehouseCode=WH-RM');
  if (renamedWarehouseRelations.items.some((item) => item.warehouseName !== renamedWarehouse.record.name)) {
    throw new Error(`warehouse rename did not refresh replenishment names: ${JSON.stringify(renamedWarehouseRelations.items)}`);
  }
  const renamedWarehouseMaterials = await request('/master-data/materials');
  if (
    !renamedWarehouseMaterials.items.some((item) => item.defaultWarehouse === renamedWarehouse.record.name)
    || renamedWarehouseMaterials.items.some((item) => item.defaultWarehouse === warehouse.record.name)
  ) {
    throw new Error('warehouse rename did not refresh material default-warehouse projections');
  }
  const stoppedWarehouse = await request('/master-data/warehouses', {
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: 'Smoke 停用仓库',
      type: '综合仓',
      company: 'Filatrix 增材材料有限公司',
      locationCount: 0,
      status: '停用',
    },
  });
  await assertRejected(
    `/master-data/relations/warehouse-materials/${encodeURIComponent(stoppedWarehouse.record.code)}`,
    {
      items: [{
        code: 'NEW-SMOKE',
        warehouseCode: stoppedWarehouse.record.code,
        warehouseName: stoppedWarehouse.record.name,
        materialCode: 'M-FG-PETG-175-BLK',
        materialName: '测试物料001',
        safetyStock: 0,
        reorderPoint: 1,
        maxStock: 2,
        replenishmentLot: 1,
        status: '启用',
      }],
    },
    '仓库',
    'active replenishment relation on stopped warehouse',
  );

  const legacyRelationData = JSON.parse(readFileSync(dataFile, 'utf8'));
  const legacySupplyRelation = legacyRelationData.masterRelations?.materialSuppliers?.[0];
  const legacyReplenishmentRelation = legacyRelationData.masterRelations?.warehouseMaterials?.[0];
  if (!legacySupplyRelation || !legacyReplenishmentRelation) {
    throw new Error('legacy relation normalization smoke requires supplier and warehouse relations');
  }
  legacySupplyRelation.status = '历史';
  legacySupplyRelation.isDefault = true;
  legacyReplenishmentRelation.status = '';
  writeFileSync(dataFile, `${JSON.stringify(legacyRelationData, null, 2)}\n`);

  const normalizedLegacySupplyRelations = await request(
    `/master-data/relations/material-suppliers?supplierCode=${encodeURIComponent(legacySupplyRelation.supplierCode)}`,
  );
  const normalizedLegacySupply = normalizedLegacySupplyRelations.items.find((item) => item.code === legacySupplyRelation.code);
  if (normalizedLegacySupply?.status !== '停用' || normalizedLegacySupply?.isDefault) {
    throw new Error(`invalid legacy supplier relation remained active: ${JSON.stringify(normalizedLegacySupply)}`);
  }
  const normalizedLegacyReplenishmentRelations = await request(
    `/master-data/relations/warehouse-materials?warehouseCode=${encodeURIComponent(legacyReplenishmentRelation.warehouseCode)}`,
  );
  const normalizedLegacyReplenishment = normalizedLegacyReplenishmentRelations.items.find(
    (item) => item.code === legacyReplenishmentRelation.code,
  );
  if (normalizedLegacyReplenishment?.status !== '停用') {
    throw new Error(`invalid legacy warehouse relation remained active: ${JSON.stringify(normalizedLegacyReplenishment)}`);
  }

  console.log('Master-data boundary smoke passed');
  console.log('- material, customer, supplier, and warehouse removed fields cannot return through read or save');
  console.log('- unit, employee, company, and equipment hidden compatibility fields stay outside their master contracts');
  console.log('- unit, department, and employee reference candidates stay concise and non-duplicated');
  console.log('- invalid identity, status, reference, numeric, email, date, and relation mutations are rejected');
  console.log('- warehouse ownership and capability stay immutable while disable and rename keep current references consistent');
  console.log('- lost material, supplier, and warehouse capabilities retire incompatible active relations');
  console.log('- missing and unknown legacy relation statuses normalize to stopped instead of becoming active');
  console.log('- stale editor submissions are rejected instead of overwriting a newer master-data revision');
  console.log('- stale invalid submissions are rejected by revision first, while stopped-only unit references do not over-lock status');
} finally {
  writeFileSync(dataFile, snapshot);
}
