# ERP Web 业务事实模型与统一假数据方案

> 创建日期：2026-07-13  
> 上位文档：`erp-web-prototype-blueprint.md`  
> 用途：把蓝图里的库存预留、质检冻结、行级承接、状态拆分、工单释放、单位金额结构化落成可执行的数据口径。后续页面、假数据和接口原型都按本文对齐。

> 文档导航（2026-09-16 迁移前整理）：文档层级与阅读路线见 `README.md`。第 0 节定义当前事实模型边界；后续章节保存基础模型和逐轮增量合同，最新记录截至第 353 节（2026-08-07）。同一对象或命令出现差异时，优先采用明确写有“替代/废止”的章节或更晚且范围更具体的合同，并同时满足蓝图中的上位业务决定。此次整理只补充阅读索引，不改变既有数据口径。

## 0. 当前事实模型边界（2026-07-30）

- 当前原型继续使用 JSON 作为可替换的数据载体，不把 JSON 文件结构视为正式数据库设计。
- 正式运行前必须迁移到关系型数据库、事务、唯一约束和并发控制；本文中的稳定 ID、来源行、分配数量、事件、幂等键和版本号就是后续数据库表与约束的迁移输入。
- 独立财务域退出当前产品范围。原型不建会计凭证、总账、应收应付子账、核销、资金账户或税务发票工作流。
- 发票和收付款保留为订单下的**商务跟进事件**，分别由销售和采购维护；它们只表达客户/供应商商务进度，不证明会计入账或资金账实相符。
- 历史 `finance` 数据只作为兼容迁移来源，不再作为新流程的唯一事实源。
- 当前采购事实只接受内部兼容值 `purchaseType = 物料采购`，但页面与业务文案统一称“采购订单”。旧 `资产采购 / 设备资产采购` 单据、专用到货验收命令、直接收票来源和资产建档回写均属于退役事实，迁移时删除，不进入正式数据库模型。
- `EquipmentRecord` 是生产资源主数据，不是资产台账：不保存 `sourcePurchase`、采购金额、验收状态、折旧或会计价值，只保存设备身份、部门、位置、启用日期、状态与说明。
- 设备巡检独立于设备主档和质量检验：`EquipmentInspectionStandard` 按设备主档中的设备型号定义怎么检查，`EquipmentInspectionPlan` 定义哪台设备在何时检查，`EquipmentInspectionTask` 保存某次执行和异常闭环。已完成任务就是历史巡检记录，不建立重复记录对象。
- 本文后续所有 `AssetPurchase*`、`EquipmentPurchaseSource`、`来源资产采购` 及资产发票分支均为历史模型记录，已被本节整体废止。

### 0.1 商务跟进事件

```ts
type CommercialFollowUpKind =
  | 'sales_invoice'
  | 'sales_payment'
  | 'purchase_invoice'
  | 'purchase_payment'

type CommercialFollowUpEvent = {
  id: string
  module: 'sales' | 'purchase'
  sourceOrderId: string
  kind: CommercialFollowUpKind
  amount: Money
  occurredOn: string
  note?: string
  actorId: string
  idempotencyKey: string
  createdAt: string
  status: 'active' | 'voided'
  deletedAt?: string
  deletedBy?: string
  referenceNo?: string // 仅历史兼容
  attachmentIds?: string[] // 仅历史兼容
}
```

约束：

- 事件只能由来源订单所属模块登记，不能由仓库、质检、生产跨模块代办；
- 金额必须大于 0，币种继承订单；同一订单允许多次开票、收票、回款或付款；
- 新增登记只需要金额、业务日期和可选备注，不要求编号或附件；
- 进度由有效事件金额汇总投影，不能手工改成“已完成”；
- 销售/采购可以删除本模块订单下的人工登记；删除采用失效事件并保留操作者和时间，投影只统计 `active` 事件。历史迁移事件只读；
- 商务进度不阻断仓库收发、质检放行或库存过账，也不自动关闭订单；
- 退款、折让、暂停付款等售后结果作为销售/采购售后中的商务调整事件记录，不生成独立财务执行任务；
- 历史参考号和附件只用于兼容已有演示数据；未来若接入专业财务系统，以外部系统回传标识关联，不把凭证字段重新强加给当前轻量登记。

### 0.2 设备巡检事实

```ts
type EquipmentInspectionStandard = {
  id: string
  name: string
  equipmentModel: string
  status: 'draft' | 'active' | 'inactive'
  revision: number
  items: Array<{
    lineId: string
    name: string
    method: string
    requirement: string
  }>
}

type EquipmentInspectionPlan = {
  id: string
  equipmentId: string
  standardId: string
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  executionWindow: string
  firstDueDate: string
  nextDueDate: string
  ownerId: string
  status: 'active' | 'inactive'
  revision: number
}

type EquipmentInspectionTask = {
  id: string
  planId: string
  equipmentSnapshot: object
  standardSnapshot: object
  standardRevision: number
  scheduledDate: string
  dueAt: string
  assigneeId: string
  status: 'pending' | 'in_progress' | 'exception_open' | 'completed' | 'cancelled'
  result: 'pending' | 'normal' | 'abnormal' | 'not_executed'
  itemResults: Array<{
    lineId: string
    result: 'normal' | 'abnormal'
    actual?: string
    note?: string
  }>
  exceptionSummary?: string
  resolution?: string
  cancelledAt?: string
  cancelReason?: string
  revision: number
}
```

约束：

- 巡检标准的 `equipmentModel` 必须来自设备主档，标准可以被同型号的多台设备复用，不用自由文本描述适用范围；
- 巡检计划只能引用与所选设备型号一致的启用标准，前端按型号筛选，服务端再次拒绝错配组合；
- 启用计划存在时，不允许改变所引标准的适用型号，也不允许改变或停用所引设备；应先停用或调整计划。设备名称和位置变更同步到计划投影，但不改写历史任务；
- 任务生成时冻结设备型号、标准名称、标准修订号及检查项快照，设备主档或标准后续变更不改写历史任务；标准名称变更只刷新计划的当前引用投影，下一条任务使用新修订。

约束：

- 计划只能引用启用设备和启用标准；被启用计划引用的标准不能直接改为草稿或停用，必须先停用或调整引用计划；任务只能由计划自动生成，同一计划和计划日期只能有一条有效任务；
- 计划的任务负责人必须引用拥有设备巡检操作权限的启用员工并保存稳定员工编码；任务生成时把该员工身份冻结为当次任务负责人。负责人名称只是分派显示快照，不能自由填写，真实执行操作人以认证账号的日志为准；
- 计划负责人变更时只改派同计划下状态为 `pending` 的任务，并为每条任务增加“改派巡检任务”流转记录及修订号；`in_progress / exception_open / completed` 任务保留原责任快照。读取或投影数据不得因员工停用、权限变化或负责人缺失自动寻找替代人员；
- 同一设备、同一标准、同一频次只能存在一条启用计划，避免重复生成含义相同的任务；
- 计划的执行时间窗使用 `HH:mm-HH:mm` 结构化口径，结束时间必须晚于开始时间；任务完成时限取时间窗结束时间，不能从“班前 30 分钟”等自由文本猜测。新计划的首次日期不得早于创建当天，计划建立后首次日期作为历史起点冻结，后续只推进下次任务日期；重新启用的逾期计划从当天恢复；
- 当前没有独立班次日历，因此计划不提供会被错误解释成“每天一次”的“每班”频次。未来只有在班次主档、班次日期和同日多任务唯一键形成后，才能重新开放每班计划；
- 月度和季度计划在目标月份不存在原日期时取该月最后一天，例如 1 月 31 日的下一次月度任务是 2 月 28 日或 29 日，不能因日期溢出跳到 3 月；
- 任务生成时冻结设备、计划、标准名称、内部标准修订号、检查项和 `dueAt` 快照；之后修改标准以及计划的设备、标准、频次或执行时间窗不得改变已生成任务。负责人变更按上一条规则只改派待巡检任务；编辑页必须分别说明两类影响范围，不能笼统写成“全部只影响后续任务”；
- 待巡检任务只能在 `scheduledDate` 当日或之后开始，前端必须解释未到计划日，服务端以中国标准日期再次校验；列表优先显示异常、执行中和到期任务，不能让更远的未来任务占据执行入口顶部；
- 所有检查项完成判定后才允许提交；异常项目必须记录实测情况或备注，并填写异常概述；全部项目恢复为正常时清空尚未提交的异常概述，正常任务不得携带历史异常文本；
- 异常任务不能直接完成，必须填写处置和验证结果后关闭；正常完成或异常关闭后按计划生成下一周期任务；
- 只有 `pending` 任务可以取消，取消原因必填并保留操作者、时间和流转记录。计划仍启用时取消本次任务后按频次生成下一任务；计划已停用时不生成任务，但仍推进 `nextDueDate`，避免重新启用时重复生成已取消周期；
- 停用后重新启用计划时，若已有 `pending / in_progress / exception_open` 任务，必须继续承接最早的未完成任务并返回其编码，不得因遗留任务逾期而再生成一条当天任务；
- 开始、提交和关闭命令都必须包含幂等键与乐观版本，重复命令不得重复生成任务；
- `revision` 仅用于乐观并发控制，不是供用户判断业务内容的“标准版本”或“计划版本”，列表和详情不展示该技术字段；
- 检查方法属于每一条检查项目，标准头部不再维护重复的全局“检查方式”；标准也不维护固定负责人，只在操作日志和最近维护信息中记录真实操作者；
- 停用计划只停止后续生成，不删除任务；待巡检任务需要用户填写原因后显式取消，系统不能静默删除。完成和已取消任务都是可追溯历史，查询历史直接筛选任务状态和日期；
- 员工仍负责启用巡检计划或未完成巡检任务时，不得停用该员工。停用关联账号、解除员工绑定、停用角色或移除 `PERM-EQUIPMENT-OPERATE` 若会使上述责任失去可执行人员，也必须被服务端拒绝；用户应先调整计划负责人，再完成或明确承接已开始任务；
- 设备巡检结果不等于来料、生产或成品质检结论，不直接放行物料、批次或库存。

## 1. 当前现状

通过当前代码和数据盘点，原型主要存在这些结构性问题：

- `src/types/business.ts` 中大量业务数量、金额、状态仍是字符串，例如 `qty`、`amount`、`unitPrice`、`status`。
- 销售订单、采购订单等来源关系主要是单据头字段，例如 `sourceQuote`、`sourceRequisition`，没有来源行和承接数量。
- `server/data/erp-data.json` 已有销售、采购、仓库、财务、基础资料、系统等数据，但生产和质检更多依赖前端演示数据，跨模块事实不统一。
- 仓库库存已有 `onHandNumber`、`availableNumber`、`lockedNumber`、`qcHoldNumber` 等雏形，但没有独立的预留记录、冻结来源和行级分配台账。
- 采购入库确认会直接把数量加到在库和可用库存，这和“到货待检 -> 质检放行 -> 可用”的真实逻辑冲突。
- 后端以 JSON 文件整体读写为主，只能作为单人原型数据源，不能证明正式并发安全。

本阶段不急着把所有页面改完，而是先建立统一业务事实，让后续页面围绕同一套数据说话。

## 2. 业务事实分层

建议把数据分成 6 层：

| 层级 | 说明 | 示例 |
| --- | --- | --- |
| 主数据 | 被业务单据引用的稳定资料 | 公司、物料、客户、供应商、仓库、单位、产线、员工 |
| 需求事实 | 业务需求从哪里来 | 销售订单明细、生产备库需求、电商订单明细 |
| 供应事实 | 需求由什么承接 | 库存预留、生产任务、备料申请、采购申请、采购订单 |
| 库存事实 | 物料现在处于什么库存状态 | 在库、可用、预留、锁定、待检、冻结、在途 |
| 执行事实 | 仓库、生产、质检实际做了什么 | 出入库、领退料、工单释放、批次、工序实例、质检结论 |
| 商务跟进事实 | 销售/采购如何记录票据和收付款进度 | 开票、收票、回款、付款、售后商务调整 |

页面可以按模块组织，但底层事实不能按模块割裂。

## 3. 核心数据对象

### 3.0 公司归属

- 公司是业务单据的经营主体，不用一个全局硬编码值代替；
- 报价、销售订单、采购申请和采购订单保存 `companyCode + company`，新建默认当前公司；
- 来源单据生成下游单据时继承公司，普通下游单据不允许跨公司混用；
- 当前原型只实现轻量选择和继承，不展开跨公司交易、合并报表与集团核算。

### 3.0.1 基础资料关系事实

物料主表只保存稳定身份、基础单位和用途。销售、采购、库存、价格和当前原型中的所有业务数量统一使用基础单位；供货和补货参数随关系变化时，必须按关系事实维护，不能塞回物料或供应商主状态。

```ts
type MaterialMaster = {
  code: string
  name: string
  englishName?: string
  model?: string
  spec?: string
  englishModel?: string
  englishSpec?: string
  category: string
  uom: string
  status: '启用' | '停用'
}

type MaterialSupplierRelation = {
  id: string
  materialId: string
  supplierId: string
  supplierMaterialCode?: string
  minOrderQty: number
  leadTimeDays: number
  isDefault: boolean
  status: '启用' | '停用'
}

type WarehouseMaterialReplenishment = {
  id: string
  warehouseId: string
  materialId: string
  uomId: string
  safetyStock: number
  reorderPoint: number
  maxStock: number
  replenishmentLot: number
  status: '启用' | '停用'
}
```

约束：

- 销售、采购、价格、收发货和库存统一使用物料基础单位，不再维护销售/采购单位或对应折合关系；
- 计量单位只维护一个业务显示值及一个预留英文简称，不维护符号、类型、基准单位、换算或小数精度；`25 kg/袋`、`12 卷/箱` 这类包装要求属于包装规格、包装规则或具体单据要求；
- 供货周期、起订量和供应商料号随物料—供应商组合变化，不在供应商主表维护统一值；起订量按物料基础单位保存；
- 安全库存、补货点、最高库存和补货批量随仓库—物料组合变化，不在物料主表维护统一值；
- 关系状态只控制关系能否用于新业务，不能替代供应商使用状态、库存状态或物料使用状态。

### 3.0.2 客户主体信息与默认收货

客户主档中的公司联系、公司地址和默认收货必须分别保存，不使用任一组为空时回退到另一组的隐式归一化。

```ts
type CustomerMaster = {
  code: string
  name: string
  type: string
  contact?: string
  phone?: string
  email?: string
  regionType: '国内' | '海外'
  province?: string
  city?: string
  address?: string
  defaultShipContact?: string
  defaultShipPhone?: string
  defaultShipAddress?: string
  defaultLogisticsMode?: string
  paymentMethod?: string
  paymentTermDays?: number
  creditLimit?: number
  currency?: string
  taxMode?: string
  status: '启用' | '停用'
}
```

约束：

- `contact / phone / email / province / city / address` 描述客户公司的联系与经营地址；兼容字段 `phone` 的业务语义是通用联系方式，可填写电话、邮箱、微信或 WhatsApp，不执行电话格式校验；`defaultShipContact / defaultShipPhone / defaultShipAddress / defaultLogisticsMode` 描述新销售单据可带入的收货信息；
- 默认收货只能通过用户显式维护或执行“从公司信息带入”生成；保存客户、读取客户或选择客户时不得自动使用公司联系人和公司地址补齐收货字段；
- 客户自提可以不维护收货地址，但仍应保留可联系的自提人和电话；其他物流方式缺少收货地址时按资料不完整处理；
- 客户主档不保存归属部门和固定客户负责人。报价、订单、售后、收款等对象分别保存自己的经办人或负责人；
- 客户列表读取公司联系与公司地址，不读取默认收货或物流；默认收货只在客户详情、编辑和需要带入收货事实的业务场景展示。

### 3.0.3 供应商主体信息、采购默认值与供货关系

供应商主档保存供应商主体本身的稳定资料；采购责任、逐物料供货参数和具体采购单据事实分别归属业务单据与关系对象。

```ts
type SupplierMaster = {
  code: string
  name: string
  type: string
  contact?: string
  phone?: string
  email?: string
  regionType: '国内' | '海外'
  province?: string
  city?: string
  address?: string
  deliveryMethod?: string
  paymentMethod?: string
  paymentTermDays?: number
  currency?: string
  taxRate?: string
  invoiceTitle?: string
  taxNumber?: string
  registeredAddress?: string
  invoicePhone?: string
  bankName?: string
  bankAccount?: string
  status: '启用' | '停用'
}
```

约束：

- 供应商主档不保存归属部门和固定采购员。采购申请、采购订单、采购售后、付款等对象分别保存自己的经办人与责任事实；
- `contact / phone / email / province / city / address` 描述供应商公司的联系与经营地址；兼容字段 `phone` 的业务语义是通用联系方式，不限定为联系电话；`registeredAddress` 是财税注册地址。两组地址不得在保存、读取或选择供应商时互相回退；
- 供应商列表读取公司联系人、电话和经营地址，不显示邮箱、固定采购责任或注册地址；注册地址只在详情、编辑和财税业务场景展示；
- 供应商料号、起订量、供货周期、默认关系和关系状态保存于 `MaterialSupplierRelation`，不回填 `SupplierMaster`；
- 设备供应商和物流服务供应商不强制建立 `MaterialSupplierRelation`；其采购对象、服务范围和验收要求保存在具体采购与验收单据，不在供应商主档保存概括字段；
- 物料到货检验读取物料主数据并冻结到采购申请、采购订单和收货事实，供应商主档不保存 `incomingQualityRule`；
- 当前原型未建立资质证照、有效期和采购准入门禁对象，因此供应商主档不保存 `qualificationRequired / qualificationStatus`。未来引入资质管理时必须使用独立可追溯记录；
- 联系、交付、结算和开票资料只作为新采购业务的默认输入；业务单据保存后读取自身冻结事实，不随供应商主档更新。

### 3.1 数量与金额

所有需要计算的数量使用结构化模型。

```ts
type Quantity = {
  value: number
  uomId: string
}
```

`value` 直接按物料冻结的基础单位记录，`uomId` 指向该单位；展示层可以格式化成 `80 件`、`1.2 kg`，不同单位不得直接相加。

金额使用结构化模型。

```ts
type Money = {
  amount: number
  currency: string
  taxMode: '含税' | '未税'
  taxRate: number
  taxAmount: number
  amountExcludingTax: number
  amountIncludingTax: number
}
```

### 3.2 单据行

所有业务单据明细行都要有稳定 `lineId`。

```ts
type DocumentLineRef = {
  docType: string
  docId: string
  lineId: string
}
```

没有 `lineId`，就无法可靠支持拆分、合并、部分交付、部分入库和部分核销。

### 3.3 行级承接关系

跨单据关联统一通过承接关系表达。

```ts
type AllocationLink = {
  id: string
  relationType:
    | '库存预留'
    | '生产承接'
    | '备料承接'
    | '采购承接'
    | '入库承接'
    | '出库承接'
    | '质检承接'
    | '财务核销'
  source: DocumentLineRef
  target: DocumentLineRef
  materialId?: string
  productId?: string
  quantity: Quantity
  status: '有效' | '部分完成' | '已完成' | '已释放' | '已作废'
  createdAt: string
  updatedAt: string
}
```

前端展示不要暴露这个技术名，而是展示为：

- `80件由生产任务 PT2-260701-003 承接`
- `30件已出库，50件待生产`
- `申请 80件，已转采购 80件`

### 3.4 库存余额

库存余额按物料、仓库、库位、批次、质量状态汇总。

```ts
type InventoryBalance = {
  id: string
  materialId: string
  warehouseId: string
  locationId?: string
  batchId?: string
  physicalOnHand: Quantity
  qualifiedOnHand: Quantity
  reserved: Quantity
  allocated: Quantity
  frozen: Quantity
  qcHold: Quantity
  pendingInbound: Quantity
  inTransit: Quantity
  available: Quantity
  updatedAt: string
}
```

统一计算：

```text
可用 = 在库合格 - 已预留 - 已分配 - 冻结
```

`在库合格` 已经排除了待检、待入库、隔离和报废数量，因此不能再减一次 `质检占用`。物理在库用于回答“货是否已到厂”，合格在库用于回答“是否已完成仓库过账”，待检与待入库分别作为独立状态量展示：

```text
物理在库 = 合格在库 + 待检 + 待入库 + 隔离等在厂非合格数量
```

### 3.5 库存预留

预留必须独立记录来源和消耗情况。

```ts
type InventoryReservation = {
  id: string
  materialId: string
  warehouseId: string
  locationId?: string
  batchId?: string
  source: DocumentLineRef
  reason: '销售占用' | '生产领料' | '电商占用' | '手动锁定'
  reservedQty: Quantity
  consumedQty: Quantity
  releasedQty: Quantity
  requiredDate?: string
  status: '有效' | '部分消耗' | '已消耗' | '已释放' | '已作废'
}
```

预留不是直接扣库存。真正出库、领料时才扣在库数量，同时消耗预留。

### 3.6 库存流水

库存流水记录所有改变库存事实的动作。

```ts
type InventoryLedgerEntry = {
  id: string
  movementType:
    | '到货收货'
    | '质检冻结'
    | '质检放行'
    | '采购入库'
    | '销售出库'
    | '生产领料'
    | '生产退料'
    | '完工入库'
    | '调拨出'
    | '调拨入'
    | '盘盈'
    | '盘亏'
    | '冻结'
    | '解冻'
  materialId: string
  warehouseId: string
  batchId?: string
  quantity: Quantity
  source: DocumentLineRef
  beforeBalance?: Quantity
  afterBalance?: Quantity
  operator: string
  occurredAt: string
}
```

### 3.7 到货和质检冻结

采购到货先生成待检库存，不增加可用。

```ts
type ReceivingFact = {
  id: string
  sourcePurchaseOrder: DocumentLineRef
  materialId: string
  receivedQty: Quantity
  qcRequired: boolean
  stockStatus: '待检' | '已放行' | '部分放行' | '已退货' | '已隔离'
  receivingDocId: string
}
```

来料质检结果按数量处置：

```ts
type QualityDisposition = {
  id: string
  source: DocumentLineRef
  materialId: string
  inspectedQty: Quantity
  acceptedQty: Quantity
  rejectedQty: Quantity
  concessionQty: Quantity
  returnQty: Quantity
  scrapQty: Quantity
  conclusion: '合格' | '部分合格' | '不合格' | '让步放行'
  status: '待处置' | '已处置' | '已关闭'
}
```

### 3.8 生产任务

生产任务是计划需求，不是现场执行单。

```ts
type ProductionTaskFact = {
  id: string
  code: string
  sourceLines: DocumentLineRef[]
  priority: '正常' | '加急'
  ownerId: string
  taskStatus: '待建工单' | '部分建单' | '已建单' | '已完成' | '已关闭'
  materialReadiness: '齐套' | '部分齐套' | '缺料' | '待检' | '已锁定'
  productLines: ProductionTaskProductLine[]
}
```

```ts
type ProductionTaskProductLine = {
  lineId: string
  productId: string
  requiredQty: Quantity
  reservedFinishedGoodsQty: Quantity
  plannedProductionQty: Quantity
  completedInboundQty: Quantity
}
```

### 3.9 备料申请

备料申请是生产侧确认的物料需求。提交时系统自动评估当前可用库存，有缺口则在同一事务中转采购；仓库不受理这张计划申请。

```ts
type ProductionMaterialRequest = {
  id: string
  code: string
  sourceTask: DocumentLineRef
  requestType: '任务缺口补料' | '临时备料' | '试产备料'
  requesterId: string
  status: '草稿' | '库存可满足' | '已转采购' | '已关闭'
  inventoryEvaluatedAt?: string
  inventoryEvaluationBasis?: '当前可用库存计划快照（不预留、不占用）'
  linkedPurchaseRequisition?: string
  lines: ProductionMaterialRequestLine[]
}
```

```ts
type ProductionMaterialRequestLine = {
  lineId: string
  materialId: string
  requestedQty: Quantity
  inventoryCoveredQty: Quantity
  purchaseGapQty: Quantity
}
```

### 3.10 生产工单和释放

工单允许先计划，再按物料条件释放。

```ts
type WorkOrderFact = {
  id: string
  code: string
  sourceTaskLines: DocumentLineRef[]
  productId: string
  plannedQty: Quantity
  releasedQty: Quantity
  startedQty: Quantity
  completedQty: Quantity
  recipeVersionId: string
  processTemplateVersionId: string
  status: '计划中' | '待释放' | '部分释放' | '待领料' | '待开工' | '执行中' | '待入库' | '已完成' | '已取消'
}
```

```ts
type WorkOrderRelease = {
  id: string
  workOrderId: string
  releaseQty: Quantity
  materialCheckStatus: '通过' | '部分通过' | '不通过'
  releasedBy: string
  releasedAt: string
  status: '已释放' | '已撤销' | '已开工' | '已完成'
}
```

### 3.11 流转批次和工序实例

工序节点是规则，工序实例才是每次生产实际发生的事。

```ts
type ProductionBatch = {
  id: string
  code: string
  workOrderId: string
  releaseId: string
  batchQty: Quantity
  status: '待执行' | '执行中' | '待质检' | '待包装' | '待入库' | '异常中' | '已入库' | '已关闭'
}
```

```ts
type ProcessInstance = {
  id: string
  batchId: string
  processStepId: string
  sequence: number
  actionStatus: '未开始' | '等待外部' | '可执行' | '执行中' | '已完成' | '异常阻断'
  startedAt?: string
  completedAt?: string
}
```

### 3.12 实际损耗记录

损耗台账只承接已经发生的损耗事实，不维护配方中的预计损耗规则，也不代替异常、质检或返工单据。每条记录必须能够回溯来源单据、工单、生产批次、工序和现场责任对象。

```ts
type ProductionLossRecord = {
  id: string
  code: string
  sourceType: '生产报工' | '复绕损耗' | '包装损耗' | '异常事件' | '质检判定' | '工艺正常损耗'
  sourceDocument: DocumentLineRef
  workOrderId: string
  productionBatchId: string
  processStepId: string
  productId: string
  occurredAt: string
  totalLossKg: number
  plannedLossKg: number
  abnormalLossKg: number
  unclassifiedLossKg: number
  responsiblePersonId?: string
  responsibilityDeptId?: string
  disposition: string
  status: '待确认' | '待复核' | '已确认' | '已关闭'
}
```

数量约束：`totalLossKg >= 0`、`plannedLossKg >= 0`、`abnormalLossKg >= 0`、`unclassifiedLossKg >= 0`，并满足 `plannedLossKg + abnormalLossKg + unclassifiedLossKg = totalLossKg`（允许计量精度误差）。`plannedLossKg` 表示已经发生并被来源事实确认为工艺内的损耗，不是工艺上限；页面统一显示为“工艺内损耗”。记录确认状态只表达来源事实与损耗分类是否完成，责任归属是独立维度，不能因为责任人尚未判定就把已确认的数量事实降为待确认。损耗台账保持只读汇总入口；现场处置继续在异常、质检、返工或报废对象中完成。

## 4. 状态拆分口径

### 4.1 销售订单

| 维度 | 状态 |
| --- | --- |
| 单据状态 | 草稿、已确认、已关闭、已作废 |
| 生产进度 | 无需生产、待建任务、生产中、部分入库、已入库 |
| 交付进度 | 待分配、待出库、部分出库、待签收、已签收 |
| 开票进度 | 未开票、部分开票、已开票 |
| 收款进度 | 未收款、部分收款、已收款 |
| 异常标记 | 正常、暂停、异常处理中 |

列表主状态由这些事实计算，不让用户直接维护。

### 4.2 采购订单

| 维度 | 状态 |
| --- | --- |
| 单据状态 | 草稿、已确认、已关闭、已作废 |
| 到货进度 | 未到货、部分到货、已到货 |
| 质检进度 | 无需质检、待检、部分放行、已放行、不合格处理中 |
| 入库进度 | 未入库、部分入库、已入库 |
| 开票进度 | 未收票、部分收票、已收票 |
| 付款进度 | 未付款、部分付款、已付款 |

### 4.3 生产任务和工单

生产任务看计划承接，工单看执行释放。

| 对象 | 主状态 |
| --- | --- |
| 生产任务 | 待建工单、部分建单、已建单、已完成、已关闭 |
| 生产工单 | 计划中、待释放、部分释放、待领料、待开工、执行中、待入库、已完成、已取消 |
| 流转批次 | 待执行、执行中、待质检、待包装、待入库、异常中、已入库、已关闭 |

备料状态单独展示，不混进主状态。

### 4.4 生产批次、异常与备料申请

- 生产批次的单据状态只表达总体执行位置；释放、物料、执行、质量、入库五个维度必须分别保存和展示。
- 备料申请只由生产填写物料、申请数量、用途和需求日期。`inventoryCoveredQty` 与 `purchaseGapQty` 是服务端提交时的系统评估结果，生产新建页不得允许人工填写。
- 生产异常的“恢复生产”仅适用于原因已经排除的停机异常。返工、报废、让步或复检必须先形成独立业务事实，不能复用异常关闭命令伪造完成。

## 5. 统一假数据结构

建议新增或改造为以下顶层结构。为了兼容当前页面，可以先保留旧字段，同时新增标准事实集合。

```json
{
  "version": 2,
  "masterData": {},
  "facts": {
    "documentLinks": [],
    "inventoryBalances": [],
    "inventoryReservations": [],
    "inventoryLedger": [],
    "receivings": [],
    "qualityDispositions": [],
    "productionTasks": [],
    "materialRequests": [],
    "workOrders": [],
    "workOrderReleases": [],
    "productionBatches": [],
    "processInstances": [],
    "invoices": [],
    "settlements": []
  },
  "views": {
    "sales": {},
    "purchase": {},
    "warehouse": {},
    "production": {},
    "quality": {},
    "finance": {},
    "ecommerce": {},
    "reports": {}
  }
}
```

其中 `facts` 是统一业务事实，`views` 是为了前端列表和详情快速展示的派生视图。正式后端可以只存事实，视图由查询计算；原型阶段可以先静态生成。

## 6. 第一批黄金样例

### 6.1 库存满足订单

- 销售订单 `SO-GOLD-001`
- 成品 `M-FG-A120` 需求 20 件
- 创建销售预留 20 件
- 销售出库消耗预留 20 件
- 签收后进入开票和收款

### 6.2 缺货生产订单

- 销售订单 `SO-GOLD-002`
- 成品 `M-FG-B200` 需求 80 件
- 可用成品 0 件
- 生成生产任务 `PT-GOLD-002`
- 原料缺口生成备料申请 `PMR-GOLD-002`
- 采购申请、采购订单、到货、来料质检、合格放行
- 工单计划 80 件，先释放 40 件，再释放 40 件
- 分批完工入库后销售分批出库

### 6.3 部分交付订单

- 销售订单 `SO-GOLD-003`
- 需求 100 件
- 现货预留 20 件
- 生产承接 80 件
- 先出库 20 件，后续分批出库生产入库部分

### 6.4 来料不合格

- 采购订单 `PO-GOLD-004`
- 到货 100 kg
- 质检合格 70 kg，隔离 20 kg，退货 10 kg
- 只有 70 kg 转可用

### 6.5 生产异常返工

- 工单 `WO-GOLD-005`
- 流转批次生产质检不合格
- 进入异常闭环，部分返工，复检合格后入库

### 6.6 电商订单

- 平台订单导入
- SKU 映射到成品
- 复用销售订单、库存预留、销售出库、发货回填和售后退款链路

## 7. 前端改造顺序

### 7.1 先做数据地基

- 定义 `Quantity`、`Money`、`DocumentLineRef`、`AllocationLink`、`InventoryBalance`、`InventoryReservation` 等类型。
- 在假数据里增加标准事实集合。
- 用脚本生成派生视图，供现有页面逐步迁移。
- 保留旧字段一段时间，避免一次性打断所有页面。

### 7.2 再改核心列表和详情

- 销售订单先展示预留、生产承接、交付、开票、收款拆分状态。
- 采购订单先展示到货、质检冻结、放行、入库拆分状态。
- 仓库库存先展示在库、可用、预留、待检、锁定、冻结。
- 生产任务先展示生产承接、备料申请、工单计划/释放。
- 质检先展示来源、标准快照、结论和处置分离。
- 财务先展示来源业务、发票、应收应付、收付款拆分。

### 7.3 最后重做工作台和报表

- 生产工作台直接读取生产任务、工单释放、批次、工序实例、质检和仓库事实。
- 首页读取跨模块待办和风险。
- 报表读取事实集合，不能再用独立演示数据。

## 8. 后端正式化边界

原型阶段可以继续用 JSON，但必须承认以下事情不能靠 JSON 证明：

- 两人同时预留库存不会超卖。
- 编号不会重复。
- 出库和领料不会重复扣减。
- 质检放行不会重复转可用。
- 采购入库和财务核销不会并发覆盖。

正式后端必须至少具备：

- 数据库事务。
- 唯一约束。
- 行版本号或乐观锁。
- 幂等键。
- 库存预留/释放/扣减的原子服务。
- 状态流转服务和审计日志。

## 9. 待确认但不阻塞原型的业务点

这些问题不影响下一步建模型，但在真正改到对应页面时需要确认：

- 销售订单确认后是否自动预留库存，还是由销售/仓库手动分配。
- 成品库存不足时，生产任务是自动生成，还是由生产工作台人工确认后生成。
- 备料申请已确定为系统自动库存评估与采购转单，不增加仓库人工受理或审批；采购申请是否需要采购域审批按采购规则独立决定。
- 工单释放是否必须由厂长/计划员执行，班组长是否可以释放部分数量。
- 让步放行的权限角色和审批路径。
- 财务是否需要在原型阶段体现三单匹配，还是先只展示待匹配摘要。

当前建议采用默认口径：销售订单确认后系统自动试算并预留可用库存；不足部分生成生产缺口建议，由生产确认任务；工单释放由生产计划/厂长角色执行；让步放行需要质检负责人权限。

## 10. 分阶段交付物

第一阶段先完成两个具体产物：

1. `src/types/businessFacts.ts`：新增业务事实类型，不替换旧类型。
2. `server/seed-facts.mjs` 或等价数据构造脚本：生成黄金样例事实和派生视图。

完成后再按页面迁移，而不是继续扩展互不相通的字符串字段。

## 11. 2026-07-13 执行记录

已新增第一批可执行地基：

1. `src/types/businessFacts.ts`：定义 `Quantity`、`Money`、`DocumentLineRef`、`AllocationLink`、库存预留、库存台账、到货、质检处置、生产任务、备料申请、工单释放、批次、工序实例、发票与收付款等统一事实类型。
2. `server/seed-facts.mjs`：生成黄金样例事实，覆盖库存预留、销售缺口、生产任务、备料申请、采购承接、到货质检冻结、质检放行、计划工单、工单释放、生产批次、工序实例和财务核销的最小闭环。
3. `src/data/businessFactViews.ts`：新增事实数据的前端派生视图函数，用于把底层事实转换成库存可用、销售进度、生产任务列表等页面可读结构。

接下来页面迁移时应优先读取这些事实和派生视图，而不是继续扩展零散字符串字段。

## 12. 2026-07-14 前端采用口径

第一批页面已经按事实维度落地，后续实现必须保持以下边界：

- `documentStatus` 只表达草稿、已确认、已关闭、已作废；它不能编码生产、交付、到货、质检、入库、开票、收付款或异常处置。
- 销售订单分别读取生产、交付、开票和收款进度；采购订单分别读取到货、质检/验收、入库/资产入账、开票和付款进度。列表主状态、详情进度和下一步可由这些事实派生，但不能反向把派生文案作为事实保存。
- 采购收货、质检占用、质检结论和正式入库是四个事实。来料质检通过只释放质检阻断并允许入库，不直接增加可用库存；仓库入库过账后才更新库存台账。
- 生产任务保存计划生产承接，计划工单保存计划数量和累计释放数量，流转批次保存本次释放及现场执行事实。缺料不阻止建立计划工单，但必须限制释放和开工。
- 生产工单在创建或释放时保存配方、各物料基础单位和工艺快照。详情页不得重新读取最新基础资料冒充历史快照。
- 导出、报表和详情摘要与页面使用同一派生函数，禁止各自维护一套状态字符串。

原型中的旧 `status` 字段会暂时保留用于兼容；正式接口应逐步增加独立事实字段并提供迁移映射，而不是继续扩展复合状态枚举。

## 13. 2026-07-14 库存事实与需求承接迁移

本轮已把独立事实模型接入当前原型运行时，而不再只停留在 `seed-facts` 样例中：

- 仓库库存统一返回物理在库、合格在库、可用、销售预留、生产分配、冻结、待检、待入库和在途数量；可用数量由统一函数派生。
- 销售订单明细获得稳定 `lineId`，每一行可同时记录库存预留和生产任务承接数量，并提供来源单据下钻。
- 生产任务与工单物料齐套判断改读同一仓库库存事实，待检和在途只作为补充信号，不能冒充当前可释放数量。
- 已释放工单的物料行已生成结构化 `allocationSources`，记录工单号、来源行、数量、单位和下钻路径；工单按“本单分配 + 尚可用”计算缺口，其他页面仍只读取扣除全部占用后的净可用。
- 当前耗材场景已统一单位主数据：PLA/PETG 树脂、色母和助剂使用 `kg`，成品线材使用“卷”，独立包材使用“个”，标准外箱使用“箱”；`g` 仅在物料本身选择为基础单位时使用，不自动换算为 `kg`。箱与卷的包装数量由包装物料、包装规则或单据要求表达。后续正式接口必须严格沿用物料基础单位校验配方、库存和分配，不能只改显示文案。
- 采购收货分成三次事实变化：到货进入待检并增加物理在库；质检放行只转待入库；仓库正式过账后才增加合格和可用库存。
- `scripts/smoke-flow.mjs` 使用隔离临时数据逐步断言上述三阶段数量，防止以后再次把到货、质检和可用库存合并。

当前仍是原型级运行时映射。正式化时应把预留、分配、库存余额和来源行承接迁移为数据库事务对象，并增加唯一约束、幂等键、乐观锁，以及领料消耗、取消、缩量和反向冲销审计。

## 14. 释放批次与执行状态事实

释放批次是计划工单进入现场的行级承接事实，不等同于生产任务、计划工单或流转批次。建议正式模型至少包含：

```ts
type WorkOrderReleaseFact = {
  releaseId: string;
  workOrderId: string;
  taskId?: string;
  sourceLine: DocumentLineRef;
  lineId: string;
  shiftId: string;
  leaderId: string;
  planned: Quantity;
  released: Quantity;
  releaseStatus: '待释放' | '已释放' | '已取消';
  materialStatus: '待领料' | '部分领料' | '已领料' | '缺料';
  executionStatus: '待开工' | '生产中' | '已报工' | '已完成';
  qualityStatus: '未触发' | '待质检' | '待处置' | '已放行';
  inboundStatus: '未报工' | '待入库' | '部分入库' | '已入库';
};
```

事实边界：

- `released` 使用成品单位，表示获准进入现场的数量；仓库领料行使用各物料自己的基础单位，二者通过配方用料快照关联，不能直接比较或求和。
- 流转批次是释放后的现场执行载体，可按班次、设备或批次拆分；一个释放批次可以生成一个或多个流转批次，但其累计计划数量不得超过释放数量。
- 领料单、质检任务和完工入库都保存 `releaseId + workOrderId + sourceLineId + acceptedQuantity`，支持一对多、部分完成和反向冲销。
- 五个状态维度由各自事实计算。页面主提示可以派生为“待领料、待质检、待入库”等，但派生文案不参与业务判断，也不允许用户直接维护。
- 创建释放、领料过账、质检放行和完工入库是独立事务动作；重复请求必须由幂等键返回原结果，不能生成第二张单或重复扣增库存。

当前前端 `production2ReleaseBatches` 是上述模型的原型映射，用于统一工单、工作台、仓库和质检页面。迁移真实接口时应替换数据源，不应删除这些字段边界或退回单一 `status` 字符串。

## 15. 质检判定、处置与下游回写事实

质检结论不是单据主状态，也不是库存或生产状态。正式模型应至少拆出以下事实：

```ts
type QualityDecisionFact = {
  decisionId: string;
  qualityTaskId: string;
  sourceDocument: DocumentLineRef;
  workOrderId?: string;
  releaseId?: string;
  executionCardId?: string;
  standardVersionId: string;
  inspected: Quantity;
  accepted: Quantity;
  rejected: Quantity;
  conclusion: '合格' | '不合格' | '待复判';
  disposition: '放行' | '返工' | '报废' | '让步' | '隔离' | '退货' | '待处置';
  dispositionStatus: '待执行' | '执行中' | '待复检' | '已关闭';
  submittedBy: string;
  submittedAt: string;
  version: number;
};
```

事实边界：

- `conclusion` 只表达按标准得到的判定，`disposition` 只表达如何处理；不合格后选择返工不等于检验已经合格，返工完成后必须形成新的复检判定。
- 放行数量按质检来源行保存。部分合格时只允许合格数量进入后续生产或待入库，不合格数量进入隔离/异常承接，禁止用整单状态覆盖数量差异。
- 一次提交需要原子完成：保存标准快照和判定、更新质检任务、更新释放批次/流转批次阻断、生成异常或放行凭证。事务失败时任何下游状态都不能提前变化。
- 质检提交使用 `qualityTaskId + version + commandType` 幂等；重复提交返回同一判定和异常/放行凭证，不得生成第二张异常、重复解除冻结或重复增加待入库数量。
- 异常、返工、报废、让步和复检均保存来源质检判定及承接数量。关闭异常不能反向修改原检验结论，只能新增处置完成事实和必要的复检事实。
- 页面上的“下一步”由质检类型、判定、处置和下游事实派生：开机/报工检放行返回现场，入库抽检放行进入完工入库，来料检放行进入待入库，不合格进入异常闭环。

## 16. 工单版本快照与释放/流转边界

计划工单不能只保存 `recipeCode` 和 `processTemplateCode` 后在详情页重新查最新主数据。正式事实至少包含：

```ts
type WorkOrderVersionSnapshot = {
  workOrderId: string;
  recipeVersionId: string;
  processVersionId: string;
  productQuantity: Quantity;
  unitConversions: UnitConversionSnapshot[];
  recipeLines: RecipeLineSnapshot[];
  estimatedLosses: EstimatedLossSnapshot[];
  temperatureZones: TemperatureZoneSnapshot[];
  processSteps: ProcessStepSnapshot[];
  frozenAt: string;
  frozenBy: string;
  snapshotHash: string;
};
```

事实边界：

- 工单保存计划数量和版本快照；释放批次 `RB` 保存本次获准进入现场的数量；流转批次 `EC` 保存现场实际执行、报工、质检和入库事实。
- 待释放 `RB` 的 `releasedQuantity` 为 0，不得因已创建排产记录就计入工单已释放。只有释放命令成功后才推进释放状态，并生成/关联 `EC`。
- 任务到工单、工单到释放、释放到流转都保存来源单据行和承接数量，不用单据头编号代替数量分配。
- 页面流程节点读取结构化 `node`，主操作读取释放、质检、入库等关联事实；中文“下一步”仅用于显示，修改文案不得改变按钮或路由。

当前原型已经验证上述对象边界和导航，真实接口接入时应保留这一模型，不得把前端数组同步直接迁移为多个无事务的更新接口。

## 17. 跨域事务、凭证与权限边界

前端可以同时展示多个领域事实，但跨域状态变化必须由拥有该事实的领域先落库，再通过凭证驱动下一领域。不得让一个页面为了操作方便直接修改多个模块的状态字段。

### 17.1 采购收货与来料质检

- 到货确认生成不可覆盖的收货事实和质检冻结数量；到货后的来源、物料、批次、数量、质检要求和目标库位默认锁定。修正使用引用原收货行的更正/冲销事实，并记录原因、操作者和版本。
- 来料质检提交先在质检域保存 `qualityTaskId + receiptLineId + standardVersionId + quantityDecision + disposition + version`，再生成唯一的质检放行或隔离凭证。
- 仓库只接受有效质检凭证进行数量移动：合格/让步数量从质检冻结转待入库，不合格数量转隔离或退货承接；仓库正式入库再把待入库转为合格在库和可用库存。
- 质检角色拥有判定和处置权限，不直接拥有仓库过账权限；仓库角色拥有入库过账权限，但不能创建、修改或绕过质检判定。每个命令校验来源行、剩余可处理数量、凭证版本和幂等键。

### 17.2 销售履约与财务事实

- 销售订单生命周期只保存草稿、已确认、已关闭、已作废；生产、交付、开票、收款和异常分别由来源事实聚合。
- 发票、应收和收款按订单明细及承接数量关联。单笔收款只能核销对应应收，不得直接把整张销售订单改为已完成；订单关闭由全部有效明细的交付、开票/收款策略和未关闭异常共同派生。
- 作废发票、红字、退款和冲销以反向事实参与聚合，不覆盖原记录。列表中的主提示可以计算，但不能作为可编辑事实回写。

### 17.3 生产任务与工单快照

- 创建工单必须持久化来源任务行 `sourceLineId`、承接数量和命令幂等键；同一来源行累计有效工单数量不得超过尚未承接数量，取消或缩量通过可追溯变更释放承接。
- 工单确认时冻结配方、工艺、各物料基础单位、用料、损耗、温区、工序动作和作业资料快照，并保存快照哈希。历史详情只读快照，不按编号重新读取最新主数据。
- 工单保存不等于释放。库存分配、释放批次、领料、质检和入库继续按各自领域命令推进，任何一步失败均不得提前修改下游综合状态。

以上跨域命令统一要求数据库事务、唯一约束、乐观锁、业务幂等键和审计日志。前端锁定、禁用和确认弹层只用于减少误操作，不构成并发一致性或权限安全边界。

## 18. 2026-07-15 已实现命令合同与迁移边界

### 18.1 生产工单

当前原型接口已经持久化以下最小工单事实：

```ts
type PersistedWorkOrder = {
  code: string;
  sourceTask: string;
  sourceDocument: string;
  sourceLineId: string;
  product: string;
  planQuantity: number;
  releasedQuantity: number;
  completedQuantity: number;
  inboundQuantity: number;
  unit: string;
  recipeVersionId: string;
  processVersionId: string;
  documentStatus: '草稿' | '已提交' | '已关闭' | '已作废';
  revision: number;
  versionSnapshot?: WorkOrderSnapshot;
};

type WorkOrderSnapshot = {
  catalogBinding: {
    product: string;
    recipeVersionId: string;
    processVersionId: string;
  };
  payload: unknown;
  payloadHash: string;
  frozenAt: string;
  frozenBy: string;
  snapshotStatus: 'catalog_validated';
};
```

- 服务端校验来源任务行、产品和剩余可承接数量；累计有效工单计划数量不能超过来源行需求。已提交工单的变更必须显式重提，并追加历史版本，不覆盖原修订记录。
- `catalogBinding` 证明提交时所选成品、配方和工艺存在于可信版本目录并相互匹配；`payloadHash` 证明被冻结的结构化载荷未被无声改写。历史测试工单缺少该结构时只能显示为原型映射。
- 当前可信目录是迁移合同，不是最终主数据模型。数据库阶段应将目录转为服务端版本实体，并由事务同时写入工单、来源行承接和快照。

### 18.2 来料质检与库存数量迁移

- 来料质检判定保存 `qualityTaskId + version + idempotencyKey`、合格数量、让步数量、不合格数量、待处理数量和处置。重复命令返回原结果，旧版本更新被拒绝。
- 数量迁移遵循 `质检冻结 -> 待入库 / 不合格承接`；需要质检的收货在判定完成前不得进入仓库正式入库。仓库过账后才由待入库形成合格在库和可用库存。
- 当前已实现数量和重复提交边界；隔离库位、退货单、让步审批、复检、质检凭证消费和冲销仍需数据库事务模型。

### 18.3 销售履约与财务事件

- 销售订单保存单据生命周期；生产、交付、开票、收款进度由关联工单、出库/签收、有效发票、应收和有效收款事件聚合，不再由一个可编辑主状态承载。
- 发票创建校验来源订单和累计可开票金额。收款事件保存应收、金额、日期、支付方式、经办人、备注和幂等键；同键重试返回原事件，新键超额收款被拒绝。
- 作废/冲销记录不应从历史中消失，而应以反向事实退出有效聚合。当前仍需补充订单行级开票分配、红字、退款和跨发票核销。

### 18.4 原型并发边界

- 当前服务对同一 Node 进程内的非 GET 变更串行执行，避免两个请求同时读取旧 JSON 后整文件覆盖；并发烟测已验证两个报价创建请求都被保留且编号唯一。
- 该机制不提供跨进程锁、崩溃恢复、持久化事务或数据库约束。它只保障当前单进程原型可继续验证，不得作为正式部署架构。

### 18.5 前端事实诚实性

- 只有已接通正式原型命令的页面可以显示保存/提交成功。尚未接入接口的页面必须保留用户输入、明确提示“未接入持久化”，不得修改本地数组后宣称业务单据已创建。
- 权限禁用、字段锁定和确认弹层只表达操作资格与体感；服务端仍必须独立校验角色、版本、来源、剩余数量和幂等键。

## 19. 前端异步加载与事实一致性边界

路由级异步加载已经用于降低首屏资源体积，但它只改变代码和样式的下载时机，不改变业务事实的所有权与一致性规则：

- 销售、采购、仓库、生产、质检和财务页面即使分成不同异步资源，也继续读取同一 API、统一事实集合和派生函数；不得为避免跨包依赖而复制库存余额、预留、质检判定、工单释放或财务聚合数据。
- 路由组件加载前仍先执行会话、菜单和写权限守卫；组件异步加载不能作为权限校验，也不能绕过服务端角色、版本、来源、数量和幂等检查。
- 页面切换后重新加载模块不应把本地展示副本当成已持久化事实。尚未接入命令的页面继续遵守“保留输入、明确未持久化、禁止虚假成功”的合同。
- 后续若在模块内部继续拆分复杂详情或编辑器，共享类型、事实派生、权限和服务调用保持单一来源；性能分包边界不得演变为业务事实分区或第二套状态字符串。

## 20. 来料处置、工单释放与发票行分配命令（2026-07-15）

本节覆盖第 18 节之后新增的原型命令，并在冲突处优先于第 18 节的“尚未实现”描述。它说明当前可验证事实，不把 JSON 运行时等同于正式数据库能力。

### 20.1 来料不合格处置

来料质检判定仍保存逐收货行的合格、直接让步、不合格和待处理数量；对已经进入不合格隔离的数量，新增独立处置事件：

```ts
type IncomingQualityDisposition = {
  code: string;
  qualityTaskId: string;
  receiptLineId: string;
  action: 'return_to_supplier' | 'approve_concession';
  quantity: number;
  reason: string;
  approvedBy?: string;
  decisionVersion: number;
  dispositionVersion: number;
  idempotencyKey: string;
  createdBy: string;
  createdAt: string;
};
```

- `return_to_supplier` 现表示“转采购处理”：它创建待受理采购售后与交接凭证，不扣减不合格隔离数量或物理在库；实际退货出库只能由采购方案生成的仓库售后任务完成。
- 让步审批必须保存审批人，把对应数量从不合格隔离移动到待入库；仓库正式过账后才形成合格在库和可用库存。
- 命令校验质检任务、收货行、剩余不合格数量、判定版本、全局处置版本和幂等键。相同幂等键返回原事件，超量或旧版本被拒绝。
- 原收货已经仓库过账后，不允许再对其执行迟到让步；需要新增补充入库或更正凭证，禁止回写原过账结果。
- 复检尚未建成独立任务。页面只能提示该边界，不能把“待复检”直接改成放行。

当前仍存在一个必须迁移时消除的双重语义：判定命令的 `concessionQty` 会直接进入待入库，而处置命令的 `approve_concession` 是对已隔离不合格数量进行审批放行。正式模型应明确前者是否已经包含审批凭证；若没有，审批前数量必须留在隔离/待处置，不能先行放行。

### 20.2 工单释放与生产分配

计划工单新增真实释放命令，最小输入为：

```ts
type ReleaseWorkOrderCommand = {
  releaseQty: number;
  workOrderRevision: number;
  idempotencyKey: string;
  line?: string;
  lineType?: string;
  shift?: string;
  leader?: string;
  actor?: string;
};
```

- 只有已提交工单可释放；释放数量必须大于 0 且不超过计划未释放数量，修订号必须与当前工单一致。
- 命令按工单冻结物料需求和释放数量计算需求，校验物料单位与库存单位一致，并使用统一净可用库存口径。任一物料不足时，不生成释放批次，也不产生部分分配。
- 成功时一次写入释放批次、各物料生产分配、工单累计已释放数量、流程记录和审计记录；库存行的 `allocatedNumber` 与 `allocationSources` 同步反映来源释放批次。
- 释放批次分别保存释放、物料、现场执行、质检和入库状态。释放成功只证明 `RB` 与生产分配存在；领料、排产队列、`EC`、报工、质检和入库仍需各自命令。
- 相同幂等键重试返回同一释放结果。取消、缩量和分配回退尚未实现，因此当前界面不得提供伪操作。

### 20.3 销售发票来源行额度

销售发票明细新增稳定的 `sourceOrder + sourceLineId` 身份，并保存该行数量、单位、单价和金额。可开额度由服务端按全部有效发票逐来源行聚合：

```ts
type SalesInvoiceLineAvailability = {
  sourceOrder: string;
  sourceLineId: string;
  orderQty: number;
  orderAmount: number;
  invoicedQty: number;
  invoicedAmount: number;
  remainingQty: number;
  remainingAmount: number;
  unit: string;
};
```

- 保存和确认发票同时校验来源订单行存在、同一发票内不重复承接、单位一致、数量与金额均为正，且累计数量和累计金额分别不超过订单行上限。
- 编辑已有发票时，可开额度查询排除当前发票编号，再把本次明细加入校验，避免自身占用被计算两次。
- 旧发票只有在完整来源身份或物料唯一匹配时才补行号；存在歧义时必须阻断，不以“猜中概率较高”为理由放行。
- 当前尚无红字、退款、反向核销和跨发票重新分配。后续反向业务应追加反向事实，不删除或覆盖原开票分配。

### 20.4 运行时与事务边界

端到端隔离烟测已经验证以上命令的数量、版本和幂等行为，但当前持久层仍是单进程 JSON 文件和串行写队列。正式数据库阶段必须把每个命令内的主记录、来源行累计、库存移动、释放/处置凭证、幂等记录和审计日志放入同一事务，并建立业务唯一约束。前端的禁用、提示和额度预览只减少误操作，不能替代服务端并发校验。

## 21. 领料、复检与财务反向事实（2026-07-15）

本节记录第 20 节之后已经接通的命令，并在冲突处优先于第 20 节的“尚未实现”描述。三个链路都遵守“保留原事实、追加承接事实、以幂等命令推进”的原则。

### 21.1 生产领料与执行卡

生产工单释放、领料与现场执行是三个独立事实：

```ts
type ProductionMaterialIssue = {
  code: string;                 // WM2
  workOrderCode: string;
  releaseBatchCode: string;     // RB2
  lines: Array<{
    materialCode: string;
    allocationSourceId: string;
    quantity: number;
    unit: string;
  }>;
  status: '草稿' | '待出库' | '已完成';
  revision: number;
  idempotencyKey?: string;
  executionCardCode?: string;   // EC2，过账成功后生成
};
```

- `WM2` 明细从 `RB2` 的有效生产分配生成，来源分配是数量权威；客户端不能扩大承接数量或更换来源。
- 提交只把领料单推进到待出库。过账才原子校验合格在库与物理在库，扣减库存、减少 `allocatedNumber`、消费分配来源、写库存流水、标记 `RB2` 已领料，并生成唯一 `EC2`。
- 相同过账幂等键返回原 `WM2 + EC2` 结果。工单的生产中/待开机状态由成功领料事实派生，不能由释放页直接写入。
- `EC2` 当前只建立来源工单与释放批次的现场执行载体；排产调整、开机、报工、质检和完工入库仍需后续独立命令。

### 21.2 来料复检、让步与退货

```ts
type IncomingQualityReinspection = {
  code: string;
  qualityTaskId: string;
  receiptLineId: string;
  quantity: number;
  acceptedQty: number;
  rejectedQty: number;
  reason: string;
  inspector: string;
  status: '待复检' | '已完成';
  decisionVersion: number;
  dispositionVersion: number;
  revision: number;
  idempotencyKey: string;
};

type IncomingQualityReturnDocument = {
  code: string;                 // QRT2
  qualityTaskId: string;
  receiptLineId: string;
  dispositionCode: string;
  afterSaleCode: string;
  quantity: number;
  status: '待采购受理';
};
```

- 活动复检任务对不合格隔离数量形成占用；剩余可处置数量必须扣除该占用，禁止同一数量同时进入退货、让步和复检。
- 复检完成要求 `acceptedQty + rejectedQty = quantity`。合格数量转入待入库，不合格数量继续隔离，原检验判定与结论不被覆盖。
- 新判定不得增加 `concessionQty`。新增让步统一经过“不合格隔离 → approve_concession”，并保存审批人；历史直接让步数量仅作为只读历史事实。
- `return_to_supplier` 处置与 `QRT2`、待受理采购售后的创建是同一原型命令的结果。`QRT2` 只证明质量已经把退回诉求交给采购，不证明库存出库、供应商确认或应付调整完成。
- 原收货已正式过账后，复检合格数量需要补充入库事实；当前命令主动阻断回写原过账单，补充入库模型尚未实现。

### 21.3 发票红冲、红字发票与退款义务

```ts
type SalesInvoiceReversal = {
  sourceInvoiceCode: string;
  redInvoiceCode: string;       // CRN2
  reason: string;
  idempotencyKey: string;
};

type SalesRefund = {
  code: string;                 // RF2
  sourceInvoiceCode: string;
  redInvoiceCode: string;
  amount: number;
  status: '待退款' | '已退款';
  paymentMethod?: string;
  externalTransactionRef?: string;
  idempotencyKey?: string;
};
```

- 当前红冲只支持整张有效销售发票。命令追加 `CRN2` 和反向承接记录，保留来源发票历史，把来源发票标记为已红冲、对应应收标记为已冲销，并使其退出来源订单行的有效开票数量/金额聚合。
- 若来源发票已部分或全部收款，红冲创建 `RF2` 待退款义务；只有保存退款方式和外部交易参考的完成命令成功后，才形成已退款事实。
- 红冲和退款分别使用幂等键。相同键返回原结果，新命令不得重复释放开票额度、重复冲销应收或重复退款。
- 部分红字、跨发票反向核销、银行流水匹配和总账凭证尚未实现，不得由前端状态模拟。

### 21.4 原型持久化边界

当前命令在单 Node 进程内串行修改 JSON，并由端到端烟测验证数量、版本、幂等和来源关系；这不提供崩溃恢复、跨进程互斥或数据库原子性。正式实现必须让库存扣减与分配消费、复检占用与处置、红字与应收冲销、退款义务与退款完成分别处于数据库事务内，并建立来源唯一约束、乐观锁、持久化幂等记录和审计日志。

## 22. 现场执行、生产检验与完工入库事实（2026-07-15）

本节记录第 21 节之后已接通的生产执行命令，并在冲突处优先于第 21.1 节中“EC2 仅建立载体”的描述。现场执行、质量放行和仓库入库继续保持三个职责域，不能由一个综合状态代替。

### 22.1 EC2、PRPT2 与执行流转

```ts
type ProductionExecutionCard = {
  code: string;                    // EC2
  workOrderCode: string;           // MO2
  releaseBatchCode: string;        // RB2
  productCode: string;
  planQty: number;
  reportedQty: number;
  qualifiedQty: number;
  releasedInboundQty: number;
  reportCodes: string[];           // PRPT2
  qualityTaskCodes: string[];      // PQC2
  packageRefs: string[];
  status: string;
  revision: number;
};

type ProductionReport = {
  code: string;                    // PRPT2
  executionCardCode: string;
  workOrderCode: string;
  releaseBatchCode: string;
  goodQty: number;
  defectQty: number;
  unit: string;
  idempotencyKey: string;
};
```

- 开工是 `EC2` 的独立命令，使用修订号和幂等键，成功后创建开机首检。首检未通过时不得报工。
- 每次报工追加一张 `PRPT2`，并创建对应报工全检；`reportedQty` 是报工承接，`qualifiedQty` 是检验放行后的合格承接，两者不能互相替代。
- `reportedQty` 不得超过 `planQty`。相同报工幂等键返回原结果，不重复累计数量或创建质检任务。
- 包装确认保存包装参考并创建入库检验；只有入库检验放行数量才进入 `releasedInboundQty`。

### 22.2 PQC2 生产质量任务

```ts
type ProductionQualityTask = {
  code: string;                    // PQC2
  kind: '开机首检' | '报工全检' | '入库检验';
  executionCardCode: string;
  reportCode?: string;
  quantity: number;
  acceptedQty: number;
  rejectedQty: number;
  standard: string;
  status: '待检' | '合格' | '部分合格' | '不合格';
  version: number;
};
```

- 质量任务保存来源和数量承接，结论由质量域命令写入；生产域只消费判定结果，不直接修改合格数量。
- 开机首检合格解锁报工；报工全检合格增加 `qualifiedQty`；入库检验合格增加 `releasedInboundQty`。三类任务的业务后果不同，不能合并为一个布尔放行字段。
- 判定版本防止旧页面覆盖新结论。部分合格必须同时具有正数合格量和不合格量，且两者之和等于任务数量。
- 当前不合格只保留数量和执行卡状态，生产异常、返工、报废、让步与复检尚未接到这一套运行时命令，不能由页面伪造闭环。

### 22.3 WPR2 完工入库与库存事实

```ts
type WarehouseProductionReceipt = {
  code: string;                    // WPR2
  workOrderCode: string;
  releaseBatchCode: string;
  executionCardCode: string;
  materialCode: string;
  quantity: number;
  unit: string;
  warehouseCode: string;
  status: '草稿' | '待入库' | '已完成';
  revision: number;
  idempotencyKey?: string;
};
```

- `WPR2` 的可承接上限是同一 `EC2` 的 `releasedInboundQty` 减去其他有效 `WPR2` 已承接数量。报工量、合格量和计划量都不是仓库可直接消费的入库凭证。
- 提交只进入待入库；过账才增加成品 `onHandNumber` 与 `qualifiedOnHandNumber`、写库存流水，并更新 `EC2`、`RB2`、`MO2` 的累计入库与状态。
- 入库过账使用幂等键。相同键返回原结果；不同键不能让同一放行数量被重复承接。
- 当前 JSON 服务只能验证单进程下的顺序、数量和幂等。正式数据库事务必须覆盖放行额度锁定、入库单状态、库存行、库存流水、执行卡、释放批次和工单进度，任一步失败都整体回滚。

## 23. 执行事件、交接班与生产异常事实（2026-07-15）

本节记录第 22 节之后已经接通的现场控制事实。暂停、交接班和异常都采用“追加事件、保留原执行载体”的原则，不删除或重建 `EC2`。

### 23.1 PEV2 暂停与恢复事件

```ts
type ProductionExecutionEvent = {
  code: string;                    // PEV2
  executionCardCode: string;
  workOrderCode: string;
  releaseBatchCode: string;
  action: '暂停' | '恢复';
  actor: string;
  reason: string;
  stateBefore: {
    node: string;
    status: string;
    nextAction: string;
  };
  idempotencyKey: string;
  createdAt: string;
};
```

- 暂停事件保存暂停前的结构化执行状态，`EC2` 进入“已暂停”，但 `node` 保持原值；恢复事件再按暂停上下文恢复原状态。
- 暂停与恢复各自校验 `EC2.revision`。报工命令只接受“生产报工/进行中”，因此暂停批次不能绕过状态直接报工。
- `PEV2` 是审计事件，不承接产出数量，也不改变 `reportedQty`、`qualifiedQty`、`packedQty` 或 `inboundQty`。

### 23.2 SHF2 交接班事实

```ts
type ProductionShiftHandover = {
  code: string;                    // SHF2
  fromShiftCode: string;
  fromShiftName: string;
  fromLeader: string;
  fromMembers: string[];
  note: string;
  status: '待接班' | '已接班';
  activeCards: Array<{
    executionCardCode: string;
    line: string;
    node: string;
    status: string;
    revisionAtHandover: number;
  }>;
  toShiftCode?: string;
  toShiftName?: string;
  toLeader?: string;
  toMembers?: string[];
  revision: number;
};
```

- 交班记录冻结在制批次的当时状态用于追溯，但不拥有或改写产量、质检与入库事实。
- 接班只更新班次责任和交接状态；暂停批次仍暂停，异常批次仍异常，进行中批次继续原节点。
- 同一时刻只允许一张待接班 `SHF2`。正式数据库应以活动状态唯一约束实现，而不能只依靠查询后判断。

### 23.3 EX2 生产异常事实

```ts
type ProductionException = {
  code: string;                    // EX2
  type: '缺料' | '质检不合格' | '设备异常' | '工艺异常' | '报工差异' | '其他异常';
  executionCardCode: string;
  relatedWorkOrder: string;
  releaseBatchCode: string;
  cause: string;
  outcome: '继续生产' | '异常停机';
  status: '待处理' | '处理中' | '待复核' | '已关闭';
  priorState: {
    node: string;
    status: string;
    nextAction: string;
  };
  disposition: string;
  resolution?: string;
  revision: number;
};
```

- 异常来源同时保存 `EC2`、`RB2` 和 `MO2`，`EC2` 始终是现场执行权威对象。异常停机不能删除当前批次、退回释放状态或重算已经完成的领料与报工。
- “继续生产”异常创建后即关闭，仅作为审计事实；“异常停机”形成一张活动异常并把 `EC2` 状态设为异常，原状态保存在 `priorState`。
- 解除异常校验 `EX2.revision`、`EC2.revision` 和幂等键，保存处置结果后恢复 `priorState`。同一 `EC2` 同时只允许一张活动的停机异常。
- 返工、报废、让步和重新送检会改变数量归属或生成新的质量任务，不能复用当前“恢复原节点”命令。后续应追加独立处置事实、损耗事实和复检任务，并在同一数据库事务中更新异常和执行卡。

## 24. 采购三单匹配与收付款事件（2026-07-17）

本节确认第 9 节中“是否在原型体现三单匹配”的待定项：原型阶段采用可执行的行级三单匹配，不只展示摘要。

### 24.1 采购发票行承接

采购发票行保存 `sourceOrder + sourceLineId + sourceReceiptLineId`。确认收票时服务端校验：

- 来源采购收货存在，并已形成正式入库事实；
- 采购收货行可以唯一关联物料采购行；
- 发票使用物料基础单位，数量和金额均为正；
- 本次数量不超过当前采购收货行的正式入库数量减去该入库单其他有效发票已占用数量；
- 本次金额不超过来源物料采购行剩余金额。

同一采购订单的其他入库批次不参与当前入库单的数量占用聚合。编辑已有发票时排除自身编号，避免重复计算历史占用。

### 24.2 应收与应付资金事件

每笔收款或付款是独立事实，至少保存：资金事件编号、应收/应付编号、来源发票、来源订单、方向、金额、日期、方式、账户、外部凭证号、经办人、备注和幂等键。

- 相同应收/应付下，相同幂等键重试返回原资金事件，不重复累计。
- 单笔金额必须大于零且不得超过未结金额。
- 累计金额小于总额时派生“部分收款/部分付款”，达到总额后派生“已收款/已付款”。
- 发票结算进度由其有效应收/应付累计派生；发票生命周期仍独立保存为待开票/已开票或待收票/已收票。
- 资金事件只核销对应应收或应付，不直接把销售订单、采购订单或仓库单据改写为完成。

### 24.3 正式实现边界

当前单进程 JSON 服务已验证行级来源、正式入库、部分金额、超额拦截和幂等重试。正式数据库必须以事务和唯一约束覆盖发票确认、应收应付生成、行级额度占用、资金事件写入和结算进度聚合；银行对账、总账凭证、会计期间和跨发票核销仍未实现。

## 25. 生产质检不合格处置事实（2026-07-18）

生产质检判定与不合格处置是两个对象。判定回答“本次检验发现多少合格、多少不合格”；处置回答“不合格数量最终如何承接”。不得通过覆盖原判定或只修改主状态来模拟处置完成。

```ts
type ProductionQualityDisposition = {
  id: string;                     // PQD2
  taskCode: string;               // PQC2 / QC2
  executionCardCode: string;      // EC2
  sourceReportCode?: string;      // PRPT2
  action: 'rework_pass' | 'approve_concession' | 'scrap';
  quantity: number;
  unit: string;
  reason: string;
  approvedBy?: string;
  actor: string;
  status: '已完成';
  decisionVersion: number;
  version: number;
  idempotencyKey: string;
  executedAt: string;
};
```

- 同一质检任务的累计处置数量不能超过正式判定的不合格数量；每次提交同时校验判定版本和处置版本。
- 让步审批放行必须记录审批人；返工复检合格表示返工和复检均已完成后的结果事实；报废不产生可包装或可入库数量。
- `dispositionStatus` 独立表达“无需处置、待处置、已完成”，`remainingDispositionQty` 独立表达剩余隔离数量；原 `result / acceptedQty / rejectedQty` 不被覆盖。
- 报工全检仍有待处置数量时，`EC2` 保持质量异常并阻断包装；处置全部完成后，返工合格和让步数量进入可包装数量，报废数量不进入。
- 入库抽检仍有待处置数量时阻断完工入库；处置全部完成后，仅返工合格和让步数量增加 `releasedInboundQty`。
- 处置完成同步更新 `EC2`、`RB2`、`MO2` 和关联 `EX2`，但仓库库存仍只由 `WPR2` 正式过账产生。
- 当前 JSON 服务已验证数量上限、版本冲突、幂等重试和后续门禁。正式数据库必须在同一事务中锁定判定、处置累计、执行卡、释放批次、工单和生产异常。

## 26. 销售—生产—仓库数量链聚合（2026-07-18）

销售订单不保存另一套生产完成量，而是按来源订单行实时聚合 `MO2 / RB2 / EC2 / PQC2 / WPR2`。聚合结果用于读模型和页面说明，不取代任何来源事实。

```ts
type SalesProductionProgressLine = {
  sourceLineId: string;
  materialCode: string;
  unit: string;
  productionDemandQty: number;
  plannedQty: number;              // MO2 计划量
  releasedQty: number;             // RB2 已释放量
  reportedQty: number;             // EC2 已报工量
  qualifiedQty: number;            // 正式质检合格及已批准让步量
  releasedInboundQty: number;      // 入库检验放行量
  inboundQty: number;              // WPR2 已过账量
  status: string;
  workOrderCodes: string[];
};
```

- `completedQty` 仅作为旧接口兼容字段，其含义固定为 `qualifiedQty`；页面不得再将它标为“已报工”，更不得据此显示“已入库”。
- 状态按数量链派生：待建工单、待释放、生产中、待质检、质量待处置、待入库放行、待入库、部分入库、已入库。状态只作简要定位，所有数量仍独立展示。
- 只有 `WPR2` 过账才增加 `inboundQty` 并允许销售订单显示“已入库”；报工、质检合格和入库检验放行都不能提前代替仓库事实。
- 多个销售行单位不一致时禁止直接相加。聚合顶层只返回状态和行数，数量必须按来源行及其基础单位展示。
- 销售详情展示生产数量链，生产工单分别展示报工、质检合格和入库，完工入库详情分别展示质检放行、本单入库、批次累计入库和剩余可入库。
- 自动化回归已覆盖报工、部分合格、让步处置、入库检验放行和仓库过账五个阶段，并逐阶段断言销售订单不会提前推进数量或状态。

## 27. 巡检整改与不良处置阶段（2026-07-18）

质量巡检和不良记录都必须把“生命周期阶段”与“检查结论/处置方式”分开。主状态只用于定位当前责任阶段，不用于表达返工、供应商确认、退货或报废等业务含义。

```ts
type QualityPatrolClosure = {
  patrolCode: string;
  status: '待巡检' | '待整改' | '待复查' | '已关闭';
  result: string;
  disposition: string;
  responsibility: string;
  dueDate: string;
  attachments: string[];
  revision: number;
};

type NonconformanceClosure = {
  defectCode: string;
  sourceType: string;
  sourceDoc: string;
  status: '待处理' | '处置中' | '待验证' | '已关闭';
  disposition: string;
  affectedQuantity: number;
  unit: string;
  responsibility: string;
  dueDate: string;
  verificationResult?: string;
  revision: number;
};
```

- 巡检发现异常后进入待整改；整改提交必须保留责任人、说明和证据，随后进入待复查。复查仍异常时不得直接关闭，应升级为不良记录或生产异常。
- 不良记录在待处理阶段确认原因、责任和方案；处置中阶段执行返工、返绕、退换、补发、报废等具体方式；待验证阶段独立确认结果和影响消除；验证通过后才关闭。
- 处置方式可以变化，但不得通过改写主状态抹去原检验判定、原不良数量、来源批次或责任对象。
- 当前 Web 原型已把巡检和不良阶段迁到服务端闭环记录：新建、保存和阶段推进均校验 `revision`，使用业务幂等键防止重复提交，并保存附件元数据、操作者和流转日志。浏览器只保留编辑中的未提交表单状态，不再保存质量主账。
- 服务端只允许相邻阶段转换：巡检为 `待巡检 → 待整改/已关闭`、`待整改 → 待复查`、`待复查 → 已关闭`；不良为 `待处理 → 处置中 → 待验证 → 已关闭`。处置方式、检验结论和主状态继续独立保存。
- 提交整改前必须具备责任人、完成期限和整改说明；开始不良处置前必须具备责任对象、完成期限和处置方式；提交验证或关闭前必须具备处置/验证结论。前端必填提示不能替代服务端校验。
- 当前仍是单进程 JSON 事务队列。正式数据库必须使用唯一幂等约束、乐观锁、附件对象表和不可覆盖审计事件，避免多用户并发下重复推进或日志丢失。

## 28. 多批次工单聚合与包装门禁（2026-07-18）

- `MO2` 的当前提示是其活动 `EC2` 的批次分布，不是最后更新批次的节点副本。聚合只用于定位责任，不覆盖任一批次的执行、质量或入库事实。
- `EC2` 数量链固定为 `planQty → reportedQty → qualifiedQty / defectQty → packedQty → releasedInboundQty → inboundQty`。其中待质检判定为 `reportedQty - qualifiedQty - defectQty`，待仓库入库为 `releasedInboundQty - inboundQty`。
- `qualifiedQty - packedQty` 属于待包装数量；它既不是待入库放行，也不是待仓库入库。只有完成包装并通过入库检的数量才能增加 `releasedInboundQty`。
- 多批次工单的“下一步”可以同时存在待质检、待包装和待仓库，不得为了生成一个主状态而丢失其他责任批次。
- 来料质检的 `sourceType` 历史别名可在读模型归一为采购收货；处置文案归一为转待入库。历史原值可以保留追溯，但不得继续暗示质检直接完成库存过账。

## 29. 七模块读模型与入库数量边界（2026-07-18）

### 29.1 正式来料数量链

```text
采购收货数量
  → 待检/免检数量
  → 质量判定：合格转待入库 + 不合格隔离 + 继续冻结
  → 仓库正式入库数量
  → 合格在库数量
  → 可用数量
```

- 质量判定守恒：`累计合格转待入库 + 累计不合格隔离 + 当前冻结 = 采购收货数量`。
- 仓库正式入库数量只由仓库过账事件增加，且不得超过累计合格转待入库数量；质量判定本身不能增加合格在库。
- 采购发票按来源采购收货单校验：`本次可确认数量 = 当前收货单正式入库数量 - 该收货单累计有效已开票数量`。待入库、冻结、隔离和其他收货单数量均不得计入。
- 生产可用数量继续使用 `合格在库 - 销售预留 - 生产分配 - 质量冻结`；待入库数量不进入公式。待入库足以覆盖短缺时，只能派生“待仓库入库”下一步。

### 29.2 读模型完整性与来源单据

- 正式对象可以由稀疏写模型保存，但列表读模型必须用来源收货、判定、仓库、工单和批次事实补全其业务名称、数量、单位、阶段与下一步；不得因展示字段为空而从列表中消失。
- 任一关联编号必须下钻到真实承载对象。`WM2` 必须对应仓库生产领料单，销售签收必须对应销售出库事实，`IQ/IQC` 必须对应来料质检任务；孤立字符串不构成已完成的业务链。
- 读模型补全不得改写来源事实。历史别名可以在展示层归一，但原始来源编号、数量、判定、过账和审计记录必须保持可追溯。

## 30. 质量结论、处置和下一责任方分维（2026-07-18）

来料质检读模型至少包含以下四个独立维度，页面不得互相替代：

```ts
type IncomingQualityReadModel = {
  taskStatus: '待检验' | '待复判' | '检验完成' | '已作废';
  conclusion: '待判定' | '合格' | '部分判定' | '不合格' | '免检放行';
  disposition: '待处置' | '待复检' | '合格转待入库' | '免检转待入库' | '让步转待入库' | '不合格隔离';
  nextOwner: '质量' | '仓库' | '采购' | '无';
};
```

- `taskStatus = 检验完成` 不推导仓库入库；仓库事实仍由采购收货正式过账产生。
- `conclusion = 合格/免检放行` 且待判定数量为零时，`disposition` 不得为空或回退到待处置/待复检；下一责任方为仓库。
- `conclusion = 部分判定` 时，合格转待入库、不合格隔离和剩余冻结数量继续分别保存；主状态不得覆盖任一数量。
- 生产释放阻断可读取正式入库前的待入库数量用于解释下一步，但可释放量仍只读取可用库存。解释文案必须与质量和仓库事实一致。
- 工作台队列顺序、负责人变更和批次结束只有在产生版本、操作者和审计记录时才属于正式动作；否则只能作为只读状态或跳转到承载该事实的正式单据。

## 31. 生产退料事实模型（2026-07-18）

```ts
type ProductionMaterialReturn = {
  code: string;
  materialIssue: string;
  workOrder: string;
  releaseBatch: string;
  executionCard?: string;
  status: '草稿' | '待入库' | '已完成' | '已作废';
  lines: Array<{
    sourceLineId: string;
    materialCode: string;
    batch: string;
    uom: string;
    issuedQty: number;
    returnQty: number;
    fromWarehouse: string;
    targetWarehouse: string;
  }>;
  revision: number;
};
```

- `materialIssue + sourceLineId` 是退料数量约束的来源键。任一有效退料单占用的累计数量不得超过原领料行数量；同一过账幂等键重复提交必须返回原结果，不能重复增加库存。
- 已完成退料增加原物料、原批次、原仓库的物理在库和合格在库，并写入带原领料单关联的库存流水。退料数量继续使用物料基础单位。
- 原领料单保持“已完成”，生产执行对象保持原生命周期。退料通过独立单据、库存事件和关联编号表达，不以改写领料状态或生产主状态表达。
- 正式数据库需要来源行外键、数量累计约束、过账唯一键、乐观锁和不可覆盖审计事件；当前单进程 JSON 串行写入只用于 Web 原型验证。

## 32. 生产配方版本事实模型（2026-07-18）

```ts
type ProductionRecipeVersion = {
  code: string;
  productCode: string;
  version: string;
  status: '草稿' | '启用' | '停用';
  productUnitWeightKg: number;
  outputUnit: string;
  materials: Array<{
    materialCode: string;
    usageMode: 'percent' | 'fixed';
    percent: number;
    perUnitQty: number;
    unit: string;
  }>;
  estimatedLosses: Array<{
    materialCode: string;
    fixedLossQty: number;
    lossRatePercent: number;
    unit: string;
  }>;
  revision: number;
};
```

- `productCode + version` 唯一；同一 `productCode` 最多存在一个 `status = 启用` 的有效版本。版本状态不表达生产工单、领料、质检或入库进度。
- `productUnitWeightKg` 是配方内必填的结构化净重事实，不从物料规格文本推断；生产任务用它与投料占比、固定用量共同计算净需求。
- `usageMode = percent` 属于投料组成，`usageMode = fixed` 属于固定用量；页面分区但底层保持统一明细，物料编码跨两个分区仍必须唯一。
- `estimatedLosses` 是任务生成时使用的计划规则：`预计需求 = 净用量 + fixedLossQty + 净用量 × lossRatePercent`。它不等于实际损耗，也不得覆盖损耗台账。
- 生命周期只能由 `save / activate / disable` 命令推进。创建强制为草稿；只有草稿可以保存或启用，启用和停用版本不可原地改写内容，只能据此创建下一版草稿。
- 成品和配方明细的名称、类型、启用状态和基础单位由物料主数据校验，页面传入的名称和单位不能覆盖主数据事实。
- 工单确认或释放必须引用当时启用的配方版本，并保存不可变快照。后续停用或修订配方不改写历史工单快照。
- 配方保存使用修订号防止旧页面覆盖新版本；正式数据库需要产品版本唯一约束、单一启用版本约束、明细外键和审计事件。

## 33. 生产工艺、系统动作与实例事实模型（2026-07-19）

系统动作、工艺规则和现场事实分成三类对象：

```ts
type SystemActionDefinition = {
  actionKey: string;
  ownerDomain: '生产' | '质量' | '仓库' | '系统';
  executionMode: '人工操作' | '事件自动触发' | '等待外部结果';
  requiredInputs: string[];
  emittedEvents: string[];
  blockingPolicy: '不阻断' | '完成前阻断' | '失败时阻断';
  repeatPolicy: '单次' | '按批次重复' | '按报工重复' | '全程可用';
  idempotencyScope: string;
};

type ProcessRouteNodeSnapshot = {
  nodeKey: string;
  sequence: number;
  nodeType: '作业阶段' | '人工关键动作' | '自动规则' | '质量门' | '外部等待';
  entryCondition: string;
  completionPolicy: '事件完成' | '数量达成' | '外部放行' | '人工确认';
  repeatPolicy: '不重复' | '按报工重复' | '按包装批重复';
  skipCondition?: string;
  actionBindings: string[];
  qualityPlanVersionId?: string;
  failureReturnNodeKey?: string;
};

type ProcessActionInstance = {
  id: string;
  executionCardId: string;
  nodeInstanceId: string;
  actionKey: string;
  status: '待触发' | '可操作' | '处理中' | '等待结果' | '已完成' | '失败' | '已取消';
  sourceEventId?: string;
  resultDocument?: DocumentLineRef;
  actorId?: string;
  occurredAt?: string;
  idempotencyKey: string;
};
```

- 工艺模板是规则，工单保存不可变快照，工序实例和动作实例才是每次生产实际发生的事实。模板状态不得代表任何工单或流转批次进度。
- 流转批次按工单快照生成工序实例。一个工序实例可以承接多次报工、质量任务和包装记录，不能因节点主状态变化覆盖明细事实。
- 普通作业阶段可以没有系统动作；持续生产节点按合格承接数量和未关闭异常判断是否完成，不要求操作员逐项点击下一步。
- 人工动作必须产生可追溯事实并使用幂等键；自动动作由已落库事件触发；外部等待只消费质量放行、仓库过账等所属责任域凭证。
- 开机、半成品报工、成品报工、包装是生产域命令；质检判定属于质量域；发料和完工入库属于仓库域。任何一个页面都不得直接改写多个责任域状态。
- 暂停、恢复、异常和交接班是流转批次上下文事件，不作为每张工艺模板重复节点。它们保留发生前状态并通过事件恢复或闭环。
- 现场读模型至少分开工艺阶段、当前动作、物料、质量、包装、入库和运行标记。主提示只由这些事实派生，不参与命令校验。
- 第一版使用线性有序路线，加条件跳过、重复和异常返回；直接收卷与大盘复绕分别维护版本，暂不引入通用流程引擎。

### 33.1 当前原型落地合同（2026-07-19）

- `MO2.snapshot.snapshotStatus = server_frozen` 表示配方/工艺版本已由服务端目录校验并冻结；`processTemplate + processSteps + payloadHash + frozenAt + frozenBy` 构成当前不可变原型合同。
- `EC2.processSnapshot` 保存来源工单、工单修订和冻结路线；`EC2.stageInstances` 保存该批次实际阶段，`currentStageCode` 只指向当前批次阶段，不代表物料、质量、包装或入库的综合状态。
- 阶段实例状态使用 `已完成 / 可执行 / 等待中 / 已暂停 / 异常 / 未开始`；动作实例状态使用 `已完成 / 可执行 / 等待结果 / 被阻断 / 异常 / 不适用 / 未开始`。条件动作明确记录“不适用”，不得伪造为已完成。
- 发料单、开工记录、质检任务、报工记录、包装引用和完工入库单通过动作实例的来源凭证关联。页面可以派生中文下一步，但命令校验继续读取所属域正式事实。
- 现有 JSON 服务通过稳定实例 ID 验证此模型；正式数据库仍需阶段实例表、动作实例表、事件外键、唯一幂等约束和事务内生成，不能把读时推导当作最终持久化方案。

### 33.2 工艺维护页合同（2026-07-19）

- `routeType` 决定首版允许的阶段集合和标准骨架：直接收卷为八阶段，大盘复绕为十阶段。前端切换路线时重建匹配的草稿骨架，服务端保存与启用时仍必须校验必要阶段、唯一性和顺序，禁止只依赖页面预设。
- 直接收卷和大盘复绕的默认温控点、适用产线与产品族只是草稿初始参数，可在启用前修订；它们属于工艺版本内容，不属于系统动作，也不代表任何工单现场参数已经发生。
- 大盘复绕温控点的默认阅读顺序是 `水槽、10区、9区、4区、3区、2区、1区、13区、12区、11区、8区、7区、6区、5区`。该顺序属于设备布局事实，前端不得按温区编号自动升序；每个温区的设定值仍属于可修订并随工单冻结的工艺版本内容。
- 工艺阶段引用固定阶段身份；模板维护的是该版本的核心设备、作业要求、完成条件和异常处理。页面展开/收起属于本地阅读状态，不进入工艺载荷、快照或审计事实。
- 工艺版本状态只能由创建、保存、启用、停用和创建下一版命令推进，列表和详情中的“可用于新工单”由版本状态派生，不作为可维护字段。

## 34. 大盘半成品与大小盘谱系（2026-07-19）

```ts
type ProductionWipBatch = {
  code: string;
  executionCardCode: string;
  productionOrderCode: string;
  reportCode: string;
  materialCode: string;
  netWeightKg: number;
  qualifiedWeightKg: number;
  consumedWeightKg: number;
  lossWeightKg: number;
  availableWeightKg: number;
  qualityStatus: '待检' | '已放行' | '不合格' | '待处置';
  usageStatus: '未使用' | '部分使用' | '已用尽' | '已报废';
  workstation?: string;
  revision: number;
};

type ProductionBatchLineageRecord = {
  code: string;
  executionCardCode: string;
  productionOrderCode: string;
  sourceWipBatchCode: string;
  finishedReportCode: string;
  outputRollCode: string;
  outputMaterialCode: string;
  outputQty: number;
  outputUnit: string;
};
```

- `ReportProductionWipBatch` 是生产域命令，创建半成品报工、大盘批次和半成品质检任务；同一幂等键重试只能返回原事实，大盘编号必须全局唯一。
- 半成品质检是质量域独立事实，以大盘净重 `kg` 为承接数量并按整盘判定。放行只增加大盘合格重量和可复绕重量，不增加成品小盘的合格数量；报废或复检处置同样不得改写成品数量口径。
- 大盘复绕的 `ReportProductionFinished` 必须引用一个已放行大盘，并保存实际耗用重量和工艺损耗。服务端校验 `累计耗用重量 + 累计损耗重量 <= 大盘净重`，再派生可用重量及未使用、部分使用或已用尽状态。
- 每个产出小盘对应一条不可变谱系记录；同一小盘编号只能有一个来源大盘和一个成品报工。谱系记录只追加，不因后续质检、包装或入库状态变化而覆盖。
- 大盘不合格处置后，放行返回复绕成品报工阶段；报废返回大盘半成品报工阶段。阶段实例和动作实例从处置事实刷新，但原半成品报工、质检和处置记录继续保留。
- 页面中的“大盘可用重量、已耗用、损耗、大小盘数量和下一步”均为上述事实的读模型。综合状态和提示文案不得作为命令输入或库存、质量、成品数量校验依据。
- 当前原型以 JSON 串行写入验证闭环；正式数据库必须在同一事务中保护大盘唯一编号、可用重量扣减、小盘谱系唯一性、质检判定和阶段推进，并使用乐观锁与持久化幂等记录防止并发超耗。

## 35. 生产任务与生产工单读模型边界（2026-07-19）

- `ProductionTaskFact` 是计划需求聚合，不是现场执行对象。任务状态只描述待建工单、部分建单、已建单、已完成或已关闭；物料齐套、工单释放、质检、包装和入库分别来自独立事实。
- 任务行的待建工单数量等于计划生产数量减去未作废工单累计计划数量；已入库数量来自关联工单的仓库完工入库事实。二者都不得从任务主状态文案反推。
- `WorkOrderFact` 保存来源任务行、计划数量、配方版本、工艺版本、计划日期、交期和修订。计划工单可以在缺料时创建；释放数量由释放批次累计，当前可释放数量由未释放数量和当前物料覆盖能力共同决定。
- 工单执行数量链分别累计报工、待质量判定、质量合格、不良/待处置、入库检放行、待仓库入库和仓库已入库。详情可以在同一区域展示这些事实，但不得合并存储为一个综合进度或用工单主状态替代。
- 工单配方和工艺展示必须读取提交时冻结的版本快照。页面可将同一物料的损耗规则合并到对应物料行、将多个工艺阶段压缩为路线摘要，但压缩只影响读模型，不得丢失快照原始结构和历史追溯。
- 释放批次和流转批次是工单下的独立事实。工单详情展示批次摘要和下一步，现场作业、质量任务、包装记录及仓库凭证继续在批次或所属责任域单据中查看。

## 36. 生产操作与界面派生边界（2026-07-19）

- “生产批次”是 `ProductionExecutionCardFact` 的界面名称；编码、外键和历史审计仍使用稳定的 `EC2` 身份。名称调整不合并释放批次、报工、质量、包装或入库事实。
- 工单单位从成品物料 `baseUnit` 复制并随工单冻结。前端单位控件必须只读，服务端仍需校验工单单位与成品基础单位一致，不能信任页面带入值。
- “确认包装”命令必须提交生产批次修订、合格未包装数量、箱号或托盘号、操作者和幂等键；成功后才生成包装事实及可能的入库检任务。页面打开对话框不产生业务事实。
- 暂停与恢复是生产批次运行事件，必须保存原因、操作者、时间和修订；异常停机恢复还必须引用未关闭异常及处置结果。查看异常、打开抽屉或跳转页面均不是状态转换。
- 工作台按钮文案、当前阶段和下一步均由结构化事实派生。它们只决定展示与下钻，不得作为服务端命令校验条件，也不得覆盖质量、仓库或采购责任域结果。

## 37. 生产备料、重复阶段与异常聚合口径（2026-07-19）

- `availableGapQty = max(0, estimatedQty - ownAllocatedQty - availableQty)` 表示当前可用缺口；`procurementGapQty = max(0, availableGapQty - qcPendingQty - pendingInboundQty - inTransitQty)` 才表示尚无补充事实覆盖的采购缺口。两个数量不得共用“缺料”文案。
- 任务仍有待建工单数量时，备料状态按 `需采购 / 待仓库入库 / 待质检放行 / 补充在途 / 可齐套` 分维派生。任务计划数量已经全部建立工单并完成释放后，历史任务不再消费当前库存快照重新计算备料结论。
- 质检任务的生命周期与质检历史分开统计。`待检 / 检验中 / 待复检 / 复检中` 属于待处理集合；`合格 / 部分合格 / 不合格` 是已经形成结论的记录，后续返工、让步、报废或复检由处置事实承接。
- 包装、入库检验和仓库完工入库允许按包装批重复。阶段读模型必须结合 `qualifiedQty / packedQty / releasedInboundQty / inboundQty` 表达进行中、部分放行、部分入库或等待后续上游数量，不能只读取一次性阶段枚举。
- 未关闭异常优先于质检待办进入工作台异常指标和顶部动作。异常批次保留质检结论和当前工艺阶段用于追溯，但不得重复计入待质检数量。
- 损耗记录的 `sourceDoc` 必须解析到现有业务事实，产品、工单、生产批次、产线和责任对象必须与来源一致。无法解析的孤立演示记录不具备台账资格；列表下钻不改变其只读事实属性。
- 当前直接收卷和大盘复绕路线的阶段集合、身份与顺序属于版本载荷的固定骨架，页面不提交任意增删或重排命令；路线类型变化时整体重建匹配骨架，阶段内作业参数仍按草稿版本保存。

## 38. 生产工作台决策读模型（2026-07-19）

- `WorkOrderSourceOption` 只收录 `taskProductScheduleGap > 0` 的任务行。来源任务可选性、来源行可选性和工单数量上限必须使用同一聚合口径；服务端仍在提交时以事务重新校验累计承接量。
- `TaskMaterialRequestAction` 不是任务状态。活跃备料申请存在时派生为查看动作；不存在且 `procurementGapQty > 0` 时才派生为新建动作；否则不显示动作。列表、任务详情和工作台必须共用该口径。
- `ProductionLineCurrentMetrics` 由生产批次当前阶段派生，不是固定的良品/不良/剩余三元组。包装、入库检、完工入库分别读取 `qualifiedQty / packedQty / releasedInboundQty / inboundQty`，并保留未完成数量。
- 释放与排产队列的源对象是可释放工单或已形成的释放批次。包装重复、入库检重复和部分入库属于同一 `EC2` 的阶段数量事实，不产生可排产的第二批次对象。
- `ShiftReportSummary.unitTotals[]` 按基础单位分组累计当前班次的良品和不良数量。`good/defect` 总数只作为兼容历史载荷的索引值，跨单位时不得作为业务数量展示。
- 本班报工记录必须与当前班次日期或班次外键匹配，不得把产线历史“上次报工”加入当日交班汇总。正式模型应使用班次外键，日期匹配只是当前原型兼容口径。
- 工作台中的质检和仓库主动作是下钻路由，不是生产域命令。质检未放行、待仓库入库等原因必须单独显示，不能改写工艺阶段、运行标记或综合主状态。

## 39. 生产批次、设备工序与后段读模型（2026-07-19）

- `ProductionBatchFact` 是用户可见的执行主身份，稳定编码使用 `EC2`。工单释放、物料分配和旧 `RB2` 是其上游或内部兼容事实，不得作为现场、后段和异常卡片的第一识别编号。
- `OperationJobFact` 表示生产批次对一类设备的一次占用，至少保存批次、工序类型、产线类型、实际产线、计划/实际时间、累计产量、状态和结束原因。一个批次可以先后拥有挤出和复绕工序任务，但同一工序任务只占用一条实际产线。
- `lineOccupied = operationJob.status in [执行中, 暂停, 异常]`。`可开工/队列中` 只进入产线队列读模型，不计入当前设备占用；已完成设备作业、待成品检、待包装、待入库检和待仓库入库同样不得继续计入产线占用。来源产线只作为追溯事实保留。
- 每次产量登记只追加 `ProductionOutputEvent`，累计良品与不良数量不得覆盖历史事件。累计数量达到计划量时事务内关闭工序任务并释放产线；短关必须追加带原因的结束事件，不能直接修改计划数量伪装达量。
- `PostprocessBatchRow` 由 `reportedQty / qualifiedQty / defectQty / packedQty / releasedInboundQty / inboundQty` 与未关闭异常派生。阶段优先级为异常、待成品检、待包装、待入库检、待仓库入库；它是跨域待办读模型，不是新的批次或主状态。
- 大盘复绕路线在大盘产出事件完成后关闭挤出工序任务。大盘质检放行事件创建复绕工序任务；来源大盘、耗用重量、工艺损耗和小盘编号继续保存不可变谱系，不通过产线当前状态推断。

## 40. 大盘与成品双数量事实（2026-07-19）

- `ProductionWipBatchFact` 的数量维度固定为重量。`netWeightKg` 是大盘实际净重，`qualifiedWeightKg` 是质量放行重量，`usedWeightKg` 是已投入复绕的实际重量，`lossWeightKg` 是复绕损耗，`availableWeightKg` 是剩余可用重量；这些字段不得使用成品基础单位。
- `ProductionFinishedReportFact` 的 `goodQty / defectQty` 使用成品物料基础单位；耗材成品为“卷”。引用大盘时另存 `sourceWipBatchCode / consumedWeightKg / lossWeightKg`，不能用一个数量字段同时承载 kg 和卷。
- `ProductionBatchLineageRecord` 每条表示一个成品小盘，`outputQty = 1 卷`，`netWeightKg` 保存该小盘实际净重。卷数由谱系记录数量或正式报工事实累计，成品总净重由谱系重量累计，两者不互相覆盖。
- 大盘重量守恒校验为 `累计复绕用量 + 累计损耗 + 其他处置重量 <= 质检放行重量`。当前兼容字段 `consumedWeightKg` 若仍表示大盘累计扣减，只能用于迁移或核对；新读模型必须分别返回实际复绕用量和损耗。
- `issuedQty` 不能用成品单位表达生产领料。领料是多物料、多单位的仓库凭证集合；生产批次只聚合物料状态、领料凭证和必要的齐套判断，具体数量下钻仓库领料单查看。

## 41. 复绕工序任务事实（2026-07-19）

- `OperationJobFact` 从属于一个 `ProductionBatchFact`。大盘复绕路线至少包含一个挤出任务和一个或多个复绕任务；普通界面以 `EC2` 生产批次为主身份，不要求使用者维护工序任务编号。
- `ReportProductionWipBatch` 事务内关闭当前挤出任务并记录实际结束时间。半成品质检放行事件以 `productionBatchCode + sourceWipBatchCode + operationType` 保证复绕任务唯一，幂等重放不得重复生成队列项。
- 复绕任务保存 `sourceWipBatchCode / lineType / recommendedLine / assignedLine / plannedQtyKg / actualOutputQty / status`。计划主数量是可处理大盘重量 `kg`，实际产出是成品基础单位“卷”，两个数量维度不得写入同一字段。
- 自动排入只把复绕任务推进到 `可开工`。`StartRewindOperation` 必须校验来源大盘仍合格且有可用重量，随后记录负责人、操作人、实际设备和开始时间，并把任务推进到 `执行中`。
- 复绕成品报工只能引用当前执行中的复绕任务及其来源大盘。来源大盘用尽或本批成品达量时，事务内关闭复绕任务、记录结束时间并释放设备；报工质检、包装和入库只推进生产批次后段事实。

## 42. 生产批次设备轨迹读模型（2026-07-19）

- `ProductionBatchOperationTimeline` 按工序任务顺序聚合 `operationType / lineType / assignedLine / plannedQty+unit / actualQty+unit / sourceWipBatchCode / actualStart / actualEnd / status / nextAction`。它是设备事实读模型，不是工艺阶段实例的替代品。
- 当前设备作业优先读取 `activeOperationJobCode`，其次读取执行中、暂停或异常任务，再读取尚未完成的队首任务。全部任务完成后显示“设备作业已完成”；不得回退读取生产批次主状态来猜测当前设备占用。
- 大盘复绕的复绕任务允许 `plannedUnit = kg` 且 `actualUnit = 卷`，分别表示来源大盘待处理重量和成品产出。页面可并列展示，但服务端聚合、校验和统计不得相加或换算为一个综合数量。
- `packagingStatus` 由 `qualifiedQty / packedQty` 派生，设备作业状态由工序任务派生，当前阶段由阶段实例派生。三者即使同时出现在“批次状态”读模型，也必须保持独立来源和独立生命周期。
- 人工改线命令只能作用于 `待排程 / 队列中 / 可开工` 的设备任务，并校验目标产线能力、现有占用和任务修订。只有一条兼容线时页面不形成改线意图；执行中任务不得通过改线命令覆盖实际设备事实。

## 43. 设备作业完成与短关事实（2026-07-19）

- `ProductionOutputEvent` 每次追加本次良品、不良、单位、来源大盘、实际复绕用量、损耗、操作者、时间和幂等键；累计报工数量由事件聚合，不允许覆盖历史累计值。
- `OperationJobFact.completionMode` 取 `达量完成 / 大盘用尽 / 短关`。达量或来源大盘用尽由报工事务自动判断；短关必须由本次报工显式携带 `closeOperation=true` 和非空原因，并保存 `remainingQtyAtClose`。
- `ProductionBatchFact.shortClosedAt / shortClosedBy / shortCloseReason / shortCloseRemainingQty` 是设备执行例外，不是批次综合状态。短关不得自动把工单计划、质量、包装或入库标记为完成。
- 部分报工后若未达到自动结束条件且没有短关，当前工序任务保持执行中。设备占用只能根据工序任务状态判断，不得因为生成质检任务就提前释放，也不得因为主状态仍为进行中就继续占用已经结束的设备。
- 报工质检判定与不合格处置均必须识别短关事实：最后一笔实际良品完成质量闭环后进入包装；处置结束后不得再次返回已经短关的设备作业。剩余计划量由计划域决定补产、关闭或另行释放。
- 设备轨迹读模型显示结束方式、短关原因和剩余量；工作台只在报工后仍有剩余且未满足自动结束条件时开放短关选项，不设置独立普通完工命令。

## 44. 短关剩余计划决定事实（2026-07-19）

- 新增 `ProductionShortCloseDecisionFact`：`code`、`executionCardCode`、`workOrderCode`、`releaseBatchCode`、`action`、`remainingQty`、`unit`、`reason`、`actor`、`decidedAt`、`idempotencyKey`。同一次命令必须幂等，历史决定作为审计事实保留。
- `ProductionBatchFact.shortCloseResolution` 只取 `待处理 / 安排补产 / 接受短缺`；并保存 `shortCloseResolvedAt`、`shortCloseResolvedBy`、`shortCloseResolutionReason`、`shortCloseSupplementJobCode`、`acceptedShortageQty`。这些字段不得反写 `planQty`。
- “安排补产”在原生产批次下追加 `ProductionOperationJobFact`，使用 `supplementForShortClose=true` 和 `supplementDecisionCode` 追溯来源决定。补充作业不增加工单释放数量，也不生成新的领料事实。
- 当前报工质量门未完成时，补充作业状态为 `待排程`；放行后改为 `可开工`。直接收卷补充挤出作业重新触发独立开机首检；复绕补充作业引用可用大盘并沿用现有轻量复绕合同。
- `ProductionQualityTaskFact.disposition` 是当前质检任务的放行去向摘要。短关决定为安排补产时显示“合格后激活短关补产作业”，接受短缺时显示“合格后按实际数量进入包装”；它不得反向承担短关决定本身。质检读模型同时读取 `ProductionBatchFact` 与关联补充作业，派生“待质检 / 短关剩余 / 判定后去向”。
- 质检判定事务把补充作业从 `待排程` 改为 `可开工` 后，现场仍使用同一个 `ProductionBatchFact` 和 `ProductionOperationJobFact`；`supplementForShortClose=true` 只用于标识补产语义，不得生成新的工单、释放批次或领料事实。
- 生产报工完成判断为：累计报工达到计划，或已明确接受短缺。只有 `shortClosedAt` 而没有 `shortCloseResolution=接受短缺` 时，不得进入包装；安排补产则回到补充设备作业。

## 45. 补产报工、入库放行与完工过账事实（2026-07-19）

### 45.1 报工与设备作业归属

- 成品报工增加 `operationJobCode`，明确本次产出属于哪一段设备作业。设备作业的 `actualQty` 只累计引用自身编码的报工，不按 `sourceWipBatchCode` 汇总同一大盘的全部历史报工。
- 复绕建议用量为 `min(来源大盘可用重量, 本次良品卷数与不良卷数之和 × 配方每单位净重)`；建议值不是称重事实，提交值仍由 `consumedWeightKg` 和 `lossWeightKg` 保存。
- 大盘守恒为 `usedWeightKg + lossWeightKg + availableWeightKg = qualifiedWeightKg`（允许计量精度误差）；小盘数量链为 `reportedQty → qualifiedQty → packedQty → releasedInboundQty → inboundQty`，两个维度不得互相覆盖。

### 45.2 跨域门禁

- 报工质检只增加 `qualifiedQty`；包装只增加 `packedQty` 并创建入库抽检；入库抽检只增加 `releasedInboundQty`；完工入库过账才增加 `inboundQty` 和成品库存。
- `releasedInboundQty - inboundQty` 是仓库当前可办理数量。未过账草稿或待入库单占用该数量，避免重复建单；过账使用幂等键，重复请求不得重复增加库存。
- 生产批次、释放批次、生产工单和完工入库单通过 `executionCard / releaseBatch / workOrder` 三个来源标识承接。页面跳转、刷新和重新进入必须保留这些标识，不能仅依赖上一个页面的内存状态。
- 当 `inboundQty ≥ releasedInboundQty` 且报工达到计划（或已正式接受短缺）时，生产批次派生为 `node=已入库、status=已完成`；已完成只是执行结果，不删除历史批次、报工、质检、入库单或谱系记录。

## 46. 直接收卷质量批量与抽样事实（2026-07-19）

### 46.1 受控批量和抽样量

- `ProductionQualityTask.quantity / unit` 表达本次质量任务控制的完整生产批量及其基础单位，由生产批次或来源报工创建并在质量任务中冻结。质检页不得编辑这两个来源事实。
- `ProductionQualityTask.sampleQty` 独立表达实际抽样规模，不能复用受控批量字段。开机首检为 `1 组`；成品入库抽检为 `min(受控批量, 12, max(2, ceil(受控批量 × 10%))) 卷`。
- 首次开工的开机首检受控批量取生产批次计划；直接收卷补充挤出作业的开机首检受控批量取 `ProductionOperationJobFact.plannedQty / plannedUnit`。两者均保存来源批量而非样本数量。
- 报工全检的抽样量等于本次报工受控数量。入库抽检合格时，`acceptedQty` 表达整批放行数量而不是样本数量；不合格、扩大抽检和质量处置同样不得通过改写 `sampleQty` 伪造批量结论。

### 46.2 设备、质量与库存边界

- 直接收卷的成品报工达到计划即结束当前挤出 `ProductionOperationJobFact`，记录结束时间并释放设备；后续质量、包装和仓库事实不得继续把该设备派生为占用中。
- 当前质量状态先从尚未完成的关联 `ProductionQualityTask` 推导，再读取最近一次已完成结论。存在开机首检、报工质检或入库抽检待办时，历史“合格”不能覆盖当前质量门。
- `packedQty` 只来自包装确认，`releasedInboundQty` 只来自入库抽检放行，`inboundQty` 只来自仓库完工入库过账。三者分别表达包装、质量放行和库存事实，不允许由生产主状态相互代替。
- 直接收卷计划日期优先读取生产批次显式计划或来源 `ProductionWorkOrderFact.plannedDate`；`updatedAt` 只用于修订审计，不是计划事实。

## 47. 生产质量结论、样本缺陷与入库冻结事实（2026-07-20）

- `ProductionQualityDecisionFact.result` 是检验结论，不是处置方案。`开机首检 / 半成品质检 / 入库抽检` 的值域为 `合格 / 不合格`；`报工全检` 才允许 `合格 / 部分合格 / 不合格`。返工、让步和报废由后续 `ProductionQualityDispositionFact` 表达。
- 入库抽检的 `sampleQty` 表示抽样规模，`sampleDefectQty` 表示样本内不良数量，二者都不得直接写入生产批次不良数量。服务端校验 `0 ≤ sampleDefectQty ≤ sampleQty`，且 `sampleDefectQty > 0` 时禁止判定合格。
- 入库抽检合格时，`acceptedQty = quantity` 且 `rejectedQty = 0`；不合格时，`acceptedQty = 0` 且 `rejectedQty = quantity`。这里的 `rejectedQty` 表示整批受控数量进入冻结，不是样本不良数量。
- `ProductionBatchFact.inboundHoldQty` 独立累计入库抽检冻结量；`defectQty` 只保留报工全检等生产过程不良。返工复检合格或让步审批按数量从 `inboundHoldQty` 转入 `releasedInboundQty`，报废按数量关闭冻结但不增加放行。
- 入库质量处置必须满足数量守恒：`累计已处置数量 + 剩余待处置数量 = 判定冻结数量`；同时 `入库检放行数量 + 当前冻结数量 + 已报废数量` 不得超过对应包装受控批量。幂等重试不得重复释放或重复扣减冻结。
- 页面读模型分别输出受控批量、抽样量、样本不良、整批结论、入库冻结和已放行数量。任何综合状态只能作为摘要，不能覆盖上述独立事实或被用来推算库存。

## 48. 生产质量检查项结果事实（2026-07-20）

- `ProductionQualityCheckpointResultFact` 从属于一张 `ProductionQualityTaskFact`，以任务编码和冻结的检查项名称/顺序确定身份。至少保存 `name / standard / actual / result / note`，其中 `standard` 是任务创建时的要求快照。
- `result` 的值域为 `待检验 / 合格 / 不合格`；历史记录在无法还原逐项事实时可以标记为 `历史未逐项记录`，但新判定不得写入该兼容值。
- 新判定提交时，检查项数量和名称必须与任务冻结集合完全一致，不允许客户端增删、重命名或替换标准。每项必须完成判定；不合格项的 `actual` 或 `note` 至少一项非空。
- 整单一致性约束为：`decision.result = 合格` 时所有检查项均为合格；`decision.result in [不合格, 部分合格]` 时至少一项不合格。服务端是最终门禁，前端自动联动只用于减少录入错误。
- 检查项结果随 `ProductionQualityDecisionFact` 一次性保存并进入同一版本、幂等和审计边界。后续质量处置只追加 `ProductionQualityDispositionFact`，不得修改当时的检查项记录。
- 工作台 `issueCount` 由已保存的不合格检查项数量派生；`qualityFreezeCount` 可聚合来料隔离批次和生产入库检剩余冻结批次，但不能据此反推样本缺陷、整批数量或处置进度。

## 49. 巡检整改、不良升级与验证事实（2026-07-20）

- `QualityPatrolFact.status` 只表达巡检闭环阶段；`qualityOutcome` 表达正常或异常，`rectificationAction` 保存整改事实，`verificationConclusion / verificationResult` 保存独立复查事实。任一字段不得由主状态反向推算。
- 巡检检查项结果值域为 `合格 / 预警 / 不合格`；历史 `待整改` 只作兼容回显。存在预警或不合格项时 `qualityOutcome=异常`，首次提交必须进入待整改；全部合格时 `qualityOutcome=正常`，可直接关闭。
- 巡检待复查只能执行“复查通过”或“升级不良”。升级不良事务内创建 `NonconformanceFact`，巡检保存 `linkedDefectCode`，不良记录保存 `sourcePatrolCode`；幂等重试不得重复建立不良记录。
- `NonconformanceFact.status` 只表达 `待处理 / 处置中 / 待验证 / 已关闭`。`disposition` 是处置方案，`rectificationAction` 是实际执行结果，`verificationConclusion / verificationResult` 是验证事实，三者必须独立保存。
- 不良验证通过时 `verificationResult=通过` 并关闭；验证未通过时 `verificationResult=未通过` 且状态退回处置中。再次提交验证时重新进入待验证，但历史流程记录必须保留上一次未通过结论。
- 巡检升级复制的是当时的来源、检查项、责任对象和附件快照，不建立新的生产批次、质检判定或库存事实。不良关闭也不得自动解除来料隔离、生产入库冻结或仓库阻断；相关数量仍由所属质量门和处置命令守恒。

## 50. 质检标准版本与冻结快照事实（2026-07-20）

- `QualityStandardVersionFact` 的稳定身份由 `familyCode + version` 组成，展示编码为 `${familyCode}-V${version}`。`revision` 只用于同一草稿的乐观锁，不能代替业务版本。
- 标准状态值域为 `草稿 / 启用 / 停用`。同一 `familyCode` 最多一个启用版本；启用下一版与停用上一版必须在同一事务完成，避免新任务选择到两个并行有效版本。
- `checkpointRules[]` 至少保存 `name / requirement`，名称在同一版本内唯一且两者均非空。兼容字段 `checkpoints[]` 只由 `checkpointRules[].name` 派生，不能作为第二套可编辑事实。
- `QualityStandardSnapshotFact` 至少保存 `code / familyCode / version / name / inspectionType / sampleRule / acceptance / checkpointRules / frozenAt`。它从属于来料、生产或巡检任务，不从最新标准读模型动态拼接。
- 新任务只选择启用版本；历史任务继续引用当时快照，即使版本随后停用。标准版本状态、任务流程阶段、检验结论和处置阶段相互独立，任一字段不得由另一字段反向推算。
- 生产质量检查项的 `standard` 取自快照中同名 `checkpointRules.requirement`。判定提交只能填写实际记录、结果和异常说明，不允许客户端改写任务冻结的检查项名称或要求。

## 51. 质检任务来源与生成事实（2026-07-20）

- `IncomingQualityTaskFact` 以 `sourceReceiptCode` 作为唯一业务来源，展示编码由收货编号稳定派生。同一采购收货最多存在一张主来料质检任务；复检作为其子任务追加，不重建主任务。
- `ConfirmPurchaseReceiptArrival` 事务内同时完成收货阶段更新、质检冻结库存记录、`IncomingQualityTaskFact` 创建、任务编号回写与流程记录。根据 `sourceReceiptCode` 幂等重放时只返回既有任务。
- 来料任务冻结 `sourceReceiptCode / supplier / receiptLines / batches / units / QualityStandardSnapshotFact`。后续草稿保存只能更新检查记录、检验人和结论草稿；来源和标准快照属于不可变事实。
- `ProductionQualityTaskFact` 以生产事件及其来源对象组成唯一键，例如 `executionCard + startup`、`wipBatch + semiFinishedInspection`、`report + fullInspection` 或 `packagingBatch + inboundInspection`。事件重放不得生成重复任务。
- 来料与生产质检的保存和判定命令必须先验证主任务已存在，再校验冻结来源、任务版本和幂等键。客户端提供的其他来源或标准编码不能覆盖服务端快照。
- `QualityPatrolFact` 和 `NonconformanceFact` 保留授权人工创建命令。它们的主动发现来源与交易单据触发的来料/生产质检来源是两种不同事实，不应共用“允许空白新建”规则。

## 52. 混合采购收货行与分单位数量事实（2026-07-20）

- `PurchaseReceiptArrivalLineFact` 从属于采购收货行，至少保存 `receiptLineId / materialCode / quantity / unit / qualityRequired / stage`。`stage` 的当前值域为 `qc_hold / pending_inbound`，不能只由收货单主状态反推。
- `qualityRequired=true` 的到货行建立质检冻结并进入 `IncomingQualityTaskFact`；`qualityRequired=false` 的到货行直接建立待入库数量且不进入质检任务。物理在库在到货时增加，合格与可用库存只在正式入库后增加。
- `IncomingQualityDecisionFact.lines` 可保存全部收货行的最终数量快照，但客户端只提交需检行。免检行由服务端写入 `qcRequired=false / result=免检放行 / releasedQty=receivedQty`，不能被客户端改写为检验结论。
- `inspectionTotals / inspectionTotalsByUnit` 只聚合需检行，用于检验阶段和完成门禁；`totalsByUnit` 聚合全部行，用于入库承接。两组汇总用途不同，不得用全部行的免检放行量推导质量已部分完成。
- 质检判定的库存增量只作用于需检行：`releasedDelta` 从质检冻结转入待入库，`rejectedDelta` 从质检冻结转入不合格隔离。免检行在到货时已进入待入库，后续判定重放不得再次移动。
- `PurchaseReceiptPostedFact.lines` 保存逐收货行过账数量，`totalsByUnit` 按基础单位聚合。不同单位并存时不生成 `total`；单一单位时 `total` 只作为同单位合计的兼容读模型。
- 正式入库门禁读取 `inspectionTotals.pending=0`、收货单库存阶段和逐行待入库余额。过账后逐行满足“到货物理数量 = 已入库合格数量 + 不合格隔离数量 + 仍待处理数量”，幂等重试不得重复增加任何库存层。

## 53. 来料质检检查项结果事实（2026-07-20）

- `IncomingQualityCheckpointResultFact` 从属于 `IncomingQualityTaskFact` 的一条需检收货行，以 `receiptLineId + 冻结检查项名称/顺序` 确定身份，至少保存 `name / standard / actual / result / note`。
- `name / standard` 来自任务建立时的 `QualityStandardSnapshotFact`，是不可变快照；`actual / result / note` 是本次检验事实。草稿和正式判定都不得接受客户端新增、删除、重命名或改写标准要求。
- 新数量决定要求每个冻结检查项的 `result` 为 `合格 / 不合格`。不合格项的 `actual` 或 `note` 至少一项非空；未完成项目不能形成正式决定。
- `IncomingQualityDecisionFact.lines[].inspectionItems` 与该行数量决定在同一版本和幂等边界保存。数量一致性为 `rejectedQty > 0 ⇔ 至少一个检查项不合格`；历史已形成的数量事实仍不得由后续草稿回退。
- `sampleQty`、`sampleIssueQty` 和 `rejectedQty` 是三个不同事实：分别表示抽样规模、样本内异常数量和整批业务隔离数量。它们可以数值不同，页面不得通过检查项结果自动把样本异常数量复制为整批不合格数量。
- 来料草稿的可变范围仅包括样本记录、检查项记录、检验人、结论草稿和备注。收货行物料、实收数量、批次、来源单、标准快照、任务阶段与正式决定均由服务端保留。
- 缺失逐项快照的旧测试任务可按自身保存的 `standardVersionId` 恢复一次性迁移快照，并保存 `legacyRecovered` 标记；不能用当前最新标准覆盖一个仍可定位的历史版本。未完成或含不合格数量的旧任务不得自动伪造逐项合格结果。
- 检查项异常数可以派生为质量关注摘要，但不得反推 `IncomingQualityTaskFact.status`、处置完成度或库存层。任务阶段、检验结论、处置事实和库存阶段继续独立。

## 54. 来料复检任务与检查证据事实（2026-07-20）

- `IncomingQualityReinspectionFact` 从属于一张 `IncomingQualityDecisionFact` 的不合格收货行，至少保存 `qualityCode / receiptLineId / quantity / unit / reason / inspector / decisionVersion / dispositionVersion / revision`。
- 任务建立时的可用数量为 `原不合格数量 - 已退货数量 - 已让步数量 - 已完成复检合格数量 - 进行中复检占用数量`。新任务数量不得超过该余额；建立任务只占用处置额度，不移动库存层。
- `inspectionItems[]` 是复检任务的冻结证据集合。每项至少保存 `name / standard / originalActual / originalResult / originalNote / actual / result / note`；前五个字段表达原记录快照，后三个字段表达本次复检结果。
- 旧决定没有逐项记录时，任务可按当时冻结标准恢复完整检查项，但这些检查项属于“补齐复检证据”，不是系统推断出的原异常。
- 来料质检详情与变更共用服务端读取模型；静态样例只能作为短暂加载占位，不能成为处置、复检、退货和库存事实的最终来源。
- 新任务优先选择原 `IncomingQualityCheckpointResultFact.result=不合格` 的项目。只有旧决定没有逐项证据时，才按原 `standardVersionId` 恢复完整标准集合；不能读取当前最新版本替换可定位的历史版本。
- 正式复检决定要求所有项目的 `result` 为 `合格 / 不合格`，不合格项必须有 `actual` 或 `note`。一致性约束为 `rejectedQty > 0 ⇔ 至少一项复检不合格`，同时 `acceptedQty + rejectedQty = quantity`。
- `resultReason` 是由逐项结果生成的简短摘要，允许使用者选填补充，但不能代替检查项证据。任务完成后检查项与数量决定进入同一修订、幂等和审计边界。
- `acceptedQty` 只把库存从 `rejectedHold` 转到 `pendingInbound`；`rejectedQty` 保留在 `rejectedHold`，不产生新的隔离增量。正式仓库过账前，两者都不得增加 `qualifiedOnHand / available`。
- 原质检判定、复检任务阶段、复检逐项结果、后续处置和库存阶段是独立事实。复检完成不得回写原检查项，也不得把主质检状态改造成多义的“复检合格”。

## 55. 生产返工执行与返工复检事实（2026-07-20）

- `ProductionReworkTaskFact` 保存 `qualityTaskCode / executionCardCode / quantity / unit / reason / assignee / resultNote / status / revision`。`status` 只表达返工执行阶段；实际返工完成后为“已完成”，复检阶段由另一张任务表达。
- `sourceInspectionItems[]` 在返工任务建立时冻结原 `ProductionQualityCheckpointResultFact` 中的不合格项，至少保存检查项名称、标准、原实测值、原结论和原异常说明。它是返工范围依据，不是可编辑的复检结果。
- `ProductionReinspectionTaskFact` 从属于一张已完成返工任务，保存数量、单位、复检员、任务阶段和 `inspectionItems[]`。检查项在创建时复制冻结来源，并追加本次 `actual / result / note`。
- 处置进度分别派生 `activeReworkOnlyQty / activeReinspectionQty / unassignedDispositionQty`。三者与已形成处置凭证共同守恒原不合格数量，不能只用一个“返工中”状态反推。
- 复检提交要求全部检查项完成判定，并满足 `rejectedQty > 0 ⇔ 至少一个检查项不合格` 与 `acceptedQty + rejectedQty = quantity`。`resultReason` 是由检查项生成的摘要，可选填补充，不能替代逐项证据。
- `acceptedQty` 生成 `ProductionQualityDispositionFact(action=rework_pass)`；`rejectedQty` 不生成新隔离增量，只解除当前复检占用并回到未安排处置余额。原判定、返工完成、复检完成、处置完成和生产流转节点继续独立保存。

## 56. 质量工作队列读模型事实（2026-07-20）

- `QualityQueueReadModel` 由 `inspectionConclusion / dispositionStage / currentAction` 三组字段组成。它是来料质检、生产质检、巡检和不良闭环事实的统一只读投影，不新增可直接维护的主状态。
- `inspectionConclusion` 优先读取质量任务或逐项决定形成的结论；待检任务派生为“待判定”。`dispositionStage` 优先读取生产或来料处置阶段，旧记录才按原状态兼容映射。两者不得互相覆盖。
- 生产质检的 `dispositionStage` 至少区分 `待判定 / 无需处置 / 待处置 / 返工中 / 待复检 / 已完成`。原质检结果为“部分合格”且返工已完成时，读模型必须同时返回 `inspectionConclusion=部分合格` 与 `dispositionStage=待复检`。
- `currentAction` 从质检类型和处置阶段派生，只有仍在执行中的质量责任才可补充来源执行卡下一步。待处置提示选择返工、让步或报废；返工中提示完成返工；待复检提示提交独立复检；无需处置或已完成只允许查看自身结果，不能继承同一执行卡后来发生的返工或补产提示。该字段不参与命令校验。
- 工作队列关闭条件读取处置阶段而非检验结论。`无需处置 / 已完成 / 已关闭 / 已作废` 不进入待办；质量冻结数量继续读取库存冻结和未处置数量事实，不能由队列行数反推。
- `QualityDetailReadModel` 复用 `QualityQueueReadModel` 的三组字段，并补充任务来源、检查项、数量决定、处置凭证、返工和复检子任务。详情的编辑锁定只控制原始判定能否变更，不能被解释为质量闭环已完成。
- 详情顶部、主区阶段标识和右侧摘要均读取同一个 `dispositionStage / currentAction` 投影。处置记录属于独立事实，允许与检验结论同时展示，但不得覆盖 `inspectionConclusion` 或作为流程阶段。
- 巡检 `inspectionConclusion` 优先读取持久化 `qualityOutcome`；兼容记录缺少该字段时，按逐项结果派生：存在不合格为异常，存在预警或待整改为预警，全部合格为正常。该派生不写回 `QualityPatrolFact.status`。
- 来料或生产质检存在多条受控明细时，只要仍有一条处于待检、检验中或待复判，整单 `inspectionConclusion` 继续为“待判定”；已经判定的行保留自身合格或不合格结果。没有独立复检任务或明确处置事实时，不得因为一行文案为“待复判”就把整单 `dispositionStage` 推断成“待复检”。
- 兼容历史任务缺少逐项记录时，界面可以把多个空缺项目折叠为一个缺失数量摘要，但不得伪造检查结果、删除已经保存的异常项目或改变标准快照总项目数。该折叠只属于只读投影，不写回质量事实。

## 57. 生产任务进度、后段数量与巡检位置读模型事实（2026-07-20）

- `ProductionTaskBuildReadModel` 至少包含 `requestedQty / plannedQty / inboundQty / remainingToPlanQty`。建单阶段由数量派生：`plannedQty=0` 为待建单，`0 < plannedQty < requestedQty` 为部分建单，`plannedQty >= requestedQty` 为已建单；任务是否完成仍由实际入库与关闭事实判断，不能由建单阶段反推。
- 生产后段数量链至少保存或稳定派生 `reportedQty / qualifiedQty / packedQty / releasedInboundQty / inboundQty`。其中 `pendingPackagingQty=max(0, qualifiedQty-packedQty)`，`pendingInboundInspectionQty=max(0, packedQty-releasedInboundQty-inboundHoldQty)`；质检放行只增加 `releasedInboundQty`，正式仓库过账才增加 `inboundQty`。
- 大盘收卷半成品的数量事实以 kg 保存；复绕包装后的成品按物料基础单位保存。工序快照必须明确每个产出节点的计量单位，读模型不得把大盘数、卷数和 kg 数相加或互相替代。
- `ProductionFlowReadModel.currentAction` 优先读取活动质量处置。只要关联质量任务仍为待处置、返工中或待复检，生产批次与工单的当前动作均下钻该质量任务；原 `inspectionConclusion` 继续作为历史判定事实单独返回。
- `QualityPatrolFact.location` 是页面唯一的人类可编辑位置事实。兼容期可把它同步到 `productionLine / warehouse / party` 等旧字段供既有查询使用，但这些字段不得再形成多个并行输入源；后续持久化应改为稳定位置标识加显示快照。
- 巡检检查项结果值域为 `待检验 / 正常 / 预警 / 不合格`，不良检查项结果值域为 `待检验 / 不合格`。逐项结果、巡检结论、处置方式和闭环阶段是不同事实，任一字段不得替代另外三者。
- 移动端卡片和桌面端表格只是同一读模型的展示投影。响应式断点不得改写数量、阶段或当前动作，也不得因隐藏列而改变命令入口的权限与前置条件。

## 58. 班次交接与后段责任指标事实（2026-07-20）

- `ShiftHandoverFact.note` 是交班动作保存的事件事实，只能由最近一次有效交接记录恢复。没有记录时读模型返回空值；页面不得从历史批次、静态样例或当前产线状态拼接一条看似真实的交接备注。
- `PostprocessResponsibilityReadModel` 分别统计 `pendingQualityDecision / pendingQualityDisposition / pendingPackaging / pendingWarehouseInbound / pendingException`。等待质量判定与等待质量处置互斥归类：前者尚未形成数量决定，后者已经形成异常决定但处置尚未闭环。
- 后段指标只用于责任导航，不是新的业务状态。下钻后仍以质量任务、包装批次、入库责任和异常单据作为命令与审计依据；指标数量不得回写覆盖来源事实。
- 质检详情右栏只投影判定与流转事实。来源追溯、明细数量、检查项数量和附件空态属于正文或集合展示信息，不得在右栏重复充当质量状态。

## 59. 工作台导航上下文与待办定位读模型（2026-07-20）

- `NavigationReturnContext` 只包含经过内部路径校验的 `returnTo` 和可选 `focus`。它是界面会话读模型，不持久化到生产任务、质检任务、流程日志或审计事件。
- `returnTo` 只能恢复来源工作台、页签或来源业务单据；不存在或不合法时回退到当前对象所属列表。返回位置不能参与状态派生、命令授权、版本校验或幂等键生成。
- `focus` 当前值域为 `disposition / rework / reinspection`，只选择详情内已经由服务端事实生成的区域。页面找不到对应未完成任务时保持顶部展示，不制造空任务或假定任务阶段。
- 工作台、生产批次和生产工单打开生产质检时传递来源路径；质检详情进入变更和提交结果页时原样保留。质量工作台打开来料、生产、巡检或不良详情时统一返回质量工作台。
- 单据编号在顶部上下文和只读正文之间执行单一展示原则。编号仍是对象身份和路由键，只减少同屏重复，不删除数据字段，也不影响列表搜索、复制、打印或接口响应。

## 60. 备料覆盖与生产单据展示读模型（2026-07-20）

- `ProductionMaterialCoverageReadModel` 至少分别提供 `requiredQty / availableQty / ownAllocatedQty / otherAllocatedQty / qcPendingQty / pendingInboundQty / inTransitQty / immediateShortageQty / procurementGapQty`。页面不能用一个“缺口”字段同时表示即时库存不足和最终采购需求。
- `immediateShortageQty=max(0, requiredQty-ownAllocatedQty-availableQty)`；`procurementGapQty=max(0, immediateShortageQty-qcPendingQty-pendingInboundQty-inTransitQty)`。待检、待入库和在途只参与采购覆盖判断，不增加 `availableQty`，也不代表任务已经完成分配。
- 当 `immediateShortageQty>0` 且 `procurementGapQty=0` 时，读模型应同时返回当前覆盖来源和仍需等待的备料阶段。界面可以表达“待检数量可覆盖”，但不能表达“当前无缺口”或“可用库存已覆盖”。
- 生产工单身份前缀统一为 `MO2`。客户端草稿编号可追加 `DRAFT` 和日期，但不得改变对象前缀；服务端正式编号、来源引用、列表搜索和路由键继续使用同一身份体系。
- 附件空态和事实网格属于展示读模型，不是业务事实。只读对象仅在附件集合非空时投影附件区域；可编辑对象仍投影上传能力。隐藏空集合不得删除附件字段、修改权限或改变审计记录。

## 61. 生产与质检详情投影及操作标签事实（2026-07-20）

- `ProductionDetailReferenceReadModel` 和 `QualityDetailReferenceReadModel` 只把已经存在的稳定编号映射为内部下钻路径。路径不是业务事实，不得根据页面文案制造不存在的来源；无法解析的历史编号继续按文字展示。
- 质检详情的标准、来源、检验结论、处置阶段和当前动作来自各自冻结事实或统一队列读模型。布局中的三列、两列和全宽仅是展示属性，不得合并字段、改变值域或写回任务状态。
- 阶段数量的可见性由阶段是否已经发生或仍需判断派生。未开始且为零的报工、质量合格、包装和入库数量可不投影；待释放、待处理、待判定、冻结和未承接余额即使为零也必须按门禁需要保留。隐藏零值不等于删除数量事实。
- `ProductionTaskActionReadModel` 必须先读取 `remainingToPlanQty` 与任务生命周期，再返回“建工单/查看工单/查看结果”。不得用包含“工单”等宽泛字符串匹配动作，否则“跟踪工单”会被错误解释为创建命令。
- 尚未生成的采购申请、质检任务、生产批次或入库单不是引用事实。新建页不得用“后续生成”占位值冒充关联编号；生成成功后才保存并投影稳定编号及下钻入口。
- `QualityStandardUsageReadModel` 由标准版本状态派生：启用版本为“可用于新质检”，停用版本为“仅供历史追溯”，草稿为“尚未启用”。适用环节、版本状态和任务使用资格继续独立保存。
- 详情表格尾行均分、长编号换行和状态说明两行属于视觉投影。它们不得改变导出字段、搜索值、权限、命令前置条件或服务端幂等边界。

## 62. 生产工单冻结标准与计划用量读模型（2026-07-21）

- `WorkOrderVersionSnapshot` 在工单确认时生成，至少保存 `recipeVersionId / processVersionId / productQuantity / recipe / processTemplate / processSteps / frozenAt / frozenBy / payloadHash / snapshotStatus`。`recipe` 和 `processTemplate` 必须是完整对象；只保存版本号的旧记录只能标为“仅版本绑定”，不得伪装成完整冻结快照。
- `recipe.materials[]` 保存 `materialCode / materialName / usageMode / percent / perUnitQty / unit / incomingQcRequired`；`recipe.estimatedLosses[]` 保存 `materialCode / fixedLossQty / lossRatePercent / unit`。本单预计需求按冻结配方和计划数量派生：`plannedNet = perUnitQty × productQuantity`，`plannedWithLoss = plannedNet × (1 + lossRatePercent / 100) + fixedLossQty`。
- `processTemplate.temperatureZones[]` 固定保存 14 个温区，顺序为 `水槽、10区、9区、4区、3区、2区、1区、13区、12区、11区、8区、7区、6区、5区`。每项保存 `name / value / tolerance`；缺值是数据完整性问题，不能临时从当前工艺模板补读。
- `processSteps[]` 按冻结工艺顺序保存 `code / sequence / name / owner / executionMode / actionCodes` 及作业要求、完成条件和异常规则。服务端可以用可信动作目录补充动作定义，但不得把工单提交后的新版工艺内容写入历史快照。
- `WorkOrderPlanStandardReadModel` 投影冻结配方、计划用量、温区和工序；`ProductionExecutionFact`、`ProductionReportFact`、`ProductionQualityTaskFact`、包装和入库事实投影实际执行。两类模型通过工单和生产批次关联，禁止以实际记录覆盖计划标准或以计划值伪造实际记录。
- 演示数据迁移只允许对明确标识的旧演示工单、且版本仍能在可信目录中唯一定位时补齐一次性冻结快照。迁移必须生成稳定冻结时间与哈希，并标记 `server_frozen`；无法唯一定位时继续显示未冻结警告。

## 63. 生产批次计划基线与领退料实绩读模型（2026-07-21）

- `ProductionBatchPlanSnapshot` 在批次生成时从 `WorkOrderVersionSnapshot` 复制，至少保存 `sourceWorkOrderCode / sourceWorkOrderRevision / snapshotStatus / frozenAt / frozenBy / recipe / processTemplate / processSteps / productQuantity / workOrderQuantity`。它是批次计划基线，不随配方、工艺或工单后续版本变化。
- `ProductionBatchMaterialActualReadModel` 按 `executionCard + materialCode + unit` 汇总已过账生产领料与生产退料。`netIssuedQty = postedIssueQty - postedReturnQty`；尚未过账的退料单只增加 `pendingReturnQty`，不得提前减少净领料。
- `plannedWithLossQty` 继续由批次快照中的配方和批次计划量派生。它与 `postedIssueQty / postedReturnQty / netIssuedQty` 并列展示，但不得把差额自动认定为实际损耗；实际损耗必须由报工、称重、退料和损耗凭证闭环后形成独立事实。
- `ProductionBatchOutputReadModel` 固定投影 `planQty / reportedQty / pendingReportQty / qualifiedQty / defectQty / packedQty / releasedInboundQty / inboundHoldQty / inboundQty`。所有数量使用成品基础单位；大盘复绕的半成品重量链继续独立使用 kg。
- 批次生命周期为 `待开始 / 流转中 / 已完成 / 已关闭 / 已作废`。当前工艺阶段、设备作业、物料、质量、包装、入库、异常和暂停由各自事实投影，不得写回生命周期字段，也不得用生命周期标签判断设备占用。

## 64. 生产工作台统一读模型（2026-07-21）

- `WorkbenchPlanQueueRow` 由 `WorkOrderFact + WorkOrderVersionSnapshot + ReleaseBatchFact` 投影，至少包含计划数量、已释放数量、当前可释放数量、交期、适用产线和冻结配方/工艺/路线。阻断原因来自物料覆盖事实，不参与工单主状态。
- `WorkbenchLineRow` 以实际产线为键聚合 `OperationJobFact`。`currentJob` 只取执行中、暂停或异常作业；`queuedJobs` 只取可开工或队列中作业。历史已完成生产批次可以提供追溯，但不得使产线继续显示占用。
- `WorkbenchLineExecutionContext` 从当前生产批次的 `planSnapshot` 读取计划基线，从设备作业、阶段实例、报工事件和班次事实读取现场实绩。复绕建议耗用读取冻结配方每单位净重；不存在可信快照时才标记并使用兼容版本关联。
- `WorkbenchPostprocessRow` 保存 `planQty / reportedQty / qualifiedQty / packedQty / releasedInboundQty / inboundQty` 以及互斥的责任阶段。责任阶段只决定分组和下钻，不写回生产批次生命周期，也不替代质量处置阶段。
- `WorkbenchExceptionRow` 聚合异常单、来源对象、影响范围、当前处置阶段和下一步；受影响批次是下钻索引，不是另一种异常状态。视觉换行和双栏布局不得改变异常集合或关闭条件。
- `WorkbenchNavigationContext.tab` 只允许 `schedule / site / postprocess / exceptions`，保存在页面查询参数并通过内部路径校验。它不参与命令授权、状态计算、修订或幂等键生成。

## 65. 质量状态公共投影与生产检验数量结果（2026-07-21）

- `QualityStateProjection` 的输入为来源事实中的 `status / inspectionConclusion / dispositionStage / currentAction / sourceType / productResults`，输出固定为 `inspectionConclusion / dispositionStage / lifecycleStatus / currentAction`。它是只读兼容层，不保存新的业务状态。
- `inspectionConclusion` 优先读取明确决定；任一受控明细尚未判定时整单为待判定。`dispositionStage` 优先读取真实处置阶段；缺失时才按旧状态映射。`lifecycleStatus` 只由作废、关闭和处置是否闭环派生，不允许从检验结论直接写入。
- `ProductionQualityResultReadModel` 至少投影 `inspectedQty / acceptedQty / rejectedQty / remainingDispositionQty / unit / responsibilityStage`。`acceptedQty + rejectedQty` 表达本次判定，`remainingDispositionQty` 只表达原不合格量中仍未形成闭环凭证的余额。
- 普通报工全检、短关报工和补产报工使用同一结果模型；工艺分支只能改变判定后的生产流向说明，不能改变检验数量守恒。合格数量进入包装责任，不合格数量进入质量处置，二者继续关联同一生产批次。
- `QualityFrozenBatchReadModel` 以生产释放批次、生产批次或来料批次为去重键。待入库检判定、入库检异常待处置、返工中和待复检均保持冻结；质检已放行只转为仓库待入库，正式库存仍由仓库过账形成。

## 66. 生产质量责任与不良数量映射（2026-07-21）

- `ProductionQualityResponsibilityReadModel` 按生产批次关联未闭环质量任务，读取公共 `QualityStateProjection.dispositionStage / currentAction`，并附带质检负责人。它只投影当前责任，不写回生产批次节点、工单状态或释放批次状态。
- `defectQty` 是报工判定出的不良数量，不天然等于待处置数量。只有同一生产批次存在 `待处置 / 返工中 / 待复检` 质量任务时，界面才把对应不良量标为该责任阶段；否则继续显示为“报工不良”。
- 工单级质量余额按生产批次、单位和责任阶段分组汇总。不同阶段或不同单位不得强行合并为一个总数，也不得用任意一张未完成入库抽检任务把历史报工不良误标成待判定。
- 生产页面的质量记录行使用 `inspectionConclusion` 作为判定、`dispositionStage` 作为状态、`currentAction` 作为待办。来源任务中的旧 `node` 仅保留兼容追溯，不得再作为当前质量责任展示。

## 67. 生产任务、备料申请与列表状态投影事实（2026-07-21）

- `ProductionTaskFact.documentStatus` 只保存 `草稿 / 已确认 / 已作废` 等任务单据事实；`TaskLifecycleReadModel` 再结合有效工单和仓库入库事实投影 `草稿 / 已确认 / 执行中 / 已完成 / 已作废`。`TaskBuildProgressReadModel` 从计划数量和有效工单计划量派生 `待建单 / 部分建单 / 已建单`。三者必须独立，建单进度不得回写任务单据事实或替代生命周期投影。
- `ProductionTaskFact.materialNeeds` 是任务创建时基于已启用配方计算的计划快照，至少保存物料、计量单位、预计需求、可用库存、质检冻结、待仓库入库、在途覆盖、即时缺口和新增采购缺口。`procurementGapQty` 为零时不得因 `availableGapQty` 大于零重复生成备料申请。
- `ProductionMaterialRequestFact` 保存申请类型、真实来源任务/来源单据、需求部门、申请人、申请/需求日期和逐行物料数量。手工临时申请的来源可以为空；空来源不是“无”或“临时备料”字符串事实。生产草稿不可信任客户端预写的覆盖量或缺口，提交时由服务端统一库存事实重新计算。
- `ProductionMaterialCoverageEvaluation` 保存逐行 `inventoryCoveredQty / purchaseGapQty`、评估时间和“不预留、不占用”的计划快照口径。它不是仓库备料结果，也不是库存占用；实际分配只在生产工单释放时形成。
- 备料申请总量只能按相同 `unit` 分组聚合。不同单位同时存在时读模型返回例如 `24.235 kg · 24.12 个`，不得生成跨单位数值总和。
- `ProductionListStatusProjection` 只返回对象生命周期徽标；建单、物料、质量、仓库、当前阶段和下一步由各自业务列承担。`QualityListStatusProjection` 返回生命周期与处置/闭环阶段；完整 `currentAction` 保留在详情或可访问标题中，避免列表固定列重复长文本。
- `DocumentActionGuidanceProjection` 使用与主按钮相同的责任优先级和目标编号。存在未闭环质量处置或生产异常时，顶部待办的标签、说明、色调和主按钮必须共同指向同一对象；该投影不修改工单、批次、质量或异常的底层状态。

## 68. 质量前置判定与单据展示投影（2026-07-21）

- `QualityDispositionStageDisplay` 是只读展示函数。当 `inspectionConclusion = 待判定` 且底层 `dispositionStage = 待判定` 时，界面显示“未进入处置”；质量事实仍保留原值，命令校验、处置门禁和历史追溯不得读取展示文案反写状态。
- 来料检验在结论形成前，`businessDispositionDisplay` 显示“待检验结论”。只有形成合格、部分合格或不合格结论后，才按真实处置事实投影放行入库、返工、让步、退货、报废或待处置责任。
- `DocumentActionGuidanceProjection` 继续拥有当前待办的完整文案和动作目标。`DocumentStatusPanelProjection` 只消费生命周期、业务分维和责任结果；两者不得在同一屏幕重复完全相同的当前动作。
- 生产单据的事实网格和列表换行属于展示读模型。扁平或两行排版不得合并字段、改变单位、替代状态维度，也不得把被截断的文字当作真实字段值。

## 69. 关键身份与摘要去重展示事实（2026-07-21）

- `DocumentFactGridProjection` 对普通事实值最多展示两行，对 `multiline / full` 事实展示完整正文。行数限制只影响渲染，原始物料名称、工艺名称、来源编号和维护信息必须保持完整字符串，不得在读模型中预先截断。
- `QualityStandardListProjection` 分别保存适用对象、适用说明、标准名称和检查项摘要。列表可以按字段宽度进行两行投影，但不得把适用对象和检查项拼成一个不可搜索的展示字符串；标准详情页继续读取完整规则事实。
- 生产异常的 `DocumentStatusPanelProjection` 只保留生命周期或流程节点。正文已经展示的单号、异常对象、负责人、日期和状态不再组成第二份 `DocumentSummaryFacts`；删除重复摘要不删除任何业务事实。
- `WorkbenchPlanQueueRow.planBaseline` 与计划数量、已排数量、可排数量、交期和适用产线属于同一排产事实组。连续网格或卡片样式均不得改变其字段独立性，也不得用视觉分组推导新的排产状态。
- `ProductionQualityImpactProjection.facts[]` 的值允许换行，其中整批结果是判定后的门禁说明，不是检验结论或处置阶段字段。界面不得因省略显示而改变“合格放行、异常冻结”的完整语义。

## 70. 七模块统一展示投影边界（2026-07-21）

- `DocumentLifecycleProjection` 只提供单据自身生命周期；生产、交付、到货、质检、入库、开票、收付款、异常和处置继续由各自事实投影。列表固定状态列可以同时消费这些独立投影，但不得把组合文案回写为新的主状态。
- `DocumentNextActionProjection` 保存完整待办文本、责任域和目标对象。列表可以在两行内受控展示，移动端可以进入卡片摘要，完整值仍用于详情、标题和下钻；视觉截断不得改变真实动作，也不得成为业务判断输入。
- `CompactStatusBadgeProjection` 只决定标签文案与语义色，不决定列宽或卡片布局。启停、可发判断、生命周期和质量结论即使使用同一徽标组件，也必须继续读取各自独立字段，不能因视觉统一合并事实维度。
- 新建入口属于命令能力投影，不属于列表装饰。拥有独立创建命令的主数据和业务单据显示新建；由来源自动生成、必须从上游承接或只读汇总的对象不显示通用新建入口，避免制造无法落库或绕过来源校验的假流程。
- 提示文案属于展示读模型。删除显而易见的控件说明或压缩校验提示不删除字段、校验规则和审计事实；服务端仍按原有来源、数量、单位、版本、余额、权限和幂等约束执行命令。

## 71. 编辑态摘要与附件投影边界（2026-07-21）

- `DocumentEditorSummaryProjection` 只在编辑时存在可判断的来源、金额、版本或约束事实时占用侧栏。若唯一内容为附件集合，则投影为正文末尾区块；布局位置不得成为附件归属、上传权限或是否已经保存的判断依据。
- 生产工单编辑态仍读取同一 `WorkOrderVersionSnapshot`、物料覆盖和提交校验，质检编辑态仍读取同一来源、明细、判定与处置事实。全宽布局只增加字段可读空间，不合并数量、单位、状态或责任字段。
- `PurchaseInvoiceMatchingProjection` 在存在来源收货后投影采购约定、正式入库、已收票和本次发票匹配结果；没有来源时只投影“选择来源采购收货”的空态动作。删除重复概念说明不放宽三单匹配阻断条件。
- 控件高度、卡片内边距、辅助文字数量和浮层位置属于展示审计指标，不属于业务事实。视觉审计可以发现溢出、拥挤和噪音，但不得据此改写服务端字段、状态值域或命令前置条件。

## 72. 当前待办与能力投影去重（2026-07-21）

- `DocumentCurrentActionProjection` 只投影当前责任域、动作标签、原因和目标路径；`DocumentStatusPanelProjection` 分别投影生命周期及生产、交付、质量、仓库、开票和结算进度。当前待办不得重新拼接状态面板全部字段。
- 销售时效提示由交期、生产承接和出库安排派生，采购责任说明由当前 `nextStep` 与关联单据派生。说明文字是展示结果，不保存为订单状态，也不得覆盖独立进度事实。
- `DocumentCurrentActionProjection.targetLabel` 描述目标入口，不复制问题标题。例如问题为“处理来料质量异常”时，入口显示“查看来料质检”；两者继续关联同一质量任务或列表路径。
- 关闭、作废和取消后的历史履约与财务事实继续存在，但顶部只投影停止流转和追溯入口。是否展示历史进度由状态面板和关联记录决定，不通过顶部重复文案保证可追溯性。
- `DocumentAttachmentCapabilityProjection` 至少区分已有附件、允许上传和不可用三种结果。没有附件集合、读取命令或上传命令时必须投影为不可用并隐藏区块，不能用“可上传”文案冒充尚不存在的能力。

## 73. 列表身份摘要与断行投影（2026-07-21）

- `ListBusinessIdentityProjection` 分别保存名称、编码、型号、数量、单位、批次和对象总数。界面可以把这些字段排成一至两行，但不得在读模型中预先截断、删除批次或把数量单位改写成新的字符串事实。
- 销售多物料摘要使用首项身份与 `itemCount`，采购内容使用首项编码、型号与采购数量，仓库收货使用到货数量与批次。完整明细仍由详情和导出读取原始行集合，列表摘要不替代明细事实。
- 数量与基础单位在展示层使用不可断行空格，原始数量和单位继续独立保存。该格式不得参与计算、查询、导出、校验或服务端命令。
- `ListStatusDimensionProjection` 保留完整状态值；窄列通过最多两行展示长状态，不生成“不合格…”等新的状态标签。行高与主表同步属于布局合同，不属于业务状态。

## 74. 附件能力与空值展示投影（2026-07-21）

- `DocumentAttachmentCapabilityProjection` 继续以附件集合、读取能力和上传命令为事实来源。列表中的短横线仅表示当前附件数量为零，不等于附件能力不可用，也不形成新的附件状态。
- `ListAttachmentProjection` 保存 `count` 和可选的附件身份；桌面专用附件列在 `count = 0` 时投影短横线，卡片摘要在 `count = 0` 时不生成元信息项。`count > 0` 时两种布局均显示真实数量。
- 详情附件空态承担能力发现职责，只在确有附件集合或上传命令时出现。隐藏零计数列表摘要不改变详情上传权限，也不能用来判断记录是否允许补充附件。
- 零库存、零余额、零欠料、零不良、零待报工等数量是业务事实，不适用附件空值去噪规则。展示层必须按字段白名单处理空值，不能建立“数值为零即隐藏”的全局规则。

## 75. 来源单据分配空态投影（2026-07-21）

- `SourceDocumentAllocationProjection` 至少区分 `empty / loading / loaded / blocked`。`empty` 表示尚未选择来源，只投影来源选择动作；不得创建来源行未识别、待选单位或零金额的展示行。
- `loaded` 状态从销售订单行或正式采购收货行生成发票明细，并关联来源行标识、基础单位、可开/可收数量、其他有效单据占用和本次分配。展示表格只能消费这些真实来源事实。
- `blocked` 状态保存来源读取、额度校验或三单匹配的阻断原因。隐藏空表不等于校验通过，保存与确认命令继续读取来源编号、行级余额、税额和有效单据占用。
- `QuantityWithUnitDisplayProjection` 只规定输入值与单位后缀的视觉组合，数量和基础单位仍独立参与计算、校验、序列化和导出。字号修正不得把格式化字符串写回数量事实。

## 76. 列表状态维度标签与语义色投影（2026-07-21）

- `ListStatusDimensionProjection` 除完整状态值外，还投影维度标签，例如报价状态、交付状态、申请状态、作业状态、处置状态或使用状态。维度标签属于展示元数据，不得写入 `status` 字段或改变状态值域。
- 库存承诺、单据生命周期、履约进度、质量处置和结算进度是独立事实。列表可以并列投影这些维度，但不得因相邻显示或共享徽标组件而合成新的主状态。
- `CompactStatusBadgeProjection` 的语义色由公共状态映射决定。完成结果、进行状态和待办风险分别投影为成功、信息和提醒色；同一文本值在不同模块必须获得同一色调。库存流水的入库与出库属于方向标识，可以使用专用映射，不得据此改写单据生命周期色。
- 损耗台账等只读记录的处置阶段和记录复核状态继续独立保存。列表摘要必须带维度前缀，避免“待确认 · 待复核”失去业务指向；是否使用固定状态列由下钻责任和操作价值决定。

## 77. 单据状态面板公共投影（2026-07-21）

- `DocumentStatusPanelProjection` 固定包含 `primaryStatus` 与带稳定 `key / label / value / kind / tone / route` 的独立维度。`primaryStatus` 只消费单据生命周期事实，不得读取发货、转单、质检、结算或当前待办后生成新的组合状态。
- 报价有效性读取报价有效期与作废/转单事实；采购转单读取采购申请承接事实；交付进度读取计划数量与已出库数量；财务结算读取发票、应收、应付和真实收付款事件。它们可以出现在同一状态面板，但继续是可单独追溯的读模型。
- 售后处理动作和金额影响属于售后事实，当前待办属于执行任务投影；销售与采购售后均不得再维护由业务人员手工更新的“责任协同状态”。售后详情以顶部主状态、下一步和正文“协同进度”表达，不再重复状态面板；任何展示都不得把任务状态写回售后主状态，也不得以“处理中”反推具体动作已经完成。
- 局部流程步骤条、颜色、截断和悬停标题均属于展示实现。删除旧步骤条或增加完整文本提示不得删除流转记录、改变状态值域、放宽命令门禁或把被截断的显示字符串保存为事实。

## 78. 质量标准单据与来料判定展示投影（2026-07-22）

- `QualityStandardRecord` 仍是版本型规则主数据，不因使用正式详情页而成为业务流程单据。其主状态只允许草稿、启用和停用；版本、检查项数量、适用环节与最近维护人是独立维护维度。
- `QualityStandardEditorProjection` 消费标准编码、族编码、版本、修订、质检类型、适用范围、抽样规则、判定方式、逐项要求和备注。路由、卡片、表格与右侧维护状态只改变展示方式，不增加审批、检验或处置状态。
- 对启用或停用版本执行维护时，服务端建立同族下一版草稿；对草稿执行维护时只增加修订。启用新版本会停用同族旧版本，但历史质检任务继续引用其冻结快照。
- `IncomingQualityQuantityProjection` 固定投影批次数量、抽检数量、样本异常、合格、不合格、让步和剩余待处理数量，并保留基础单位。显示零值、改变列数或让业务处置独占一行不得影响数量守恒、库存冻结或后续处置凭证。
- 不良概览属于质量工作台聚合投影，不是不良记录列表字段。移除列表概览卡不删除不良记录、责任对象、影响数量、严重程度、处置阶段或闭环事实。

## 79. 资产稳定身份、采购来源与维护投影边界（更新于 2026-07-24）

- `EquipmentRecord` 保存资产编码、名称、品牌型号、出厂编号、规格、所属部门、使用位置、启用日期、来源资产采购、使用状态和说明。`serialNumber` 在资产集合内唯一；启用记录必须归属有效且启用的部门。
- `EquipmentRecord` 不保存资产类型或固定负责人。当前分类没有业务消费方；操作、班次、验收和维护责任必须由对应任务或执行事件按次保存，不能从资产主档推断。
- 当前没有能生成 `EquipmentOperatingStateProjection` 的保养、维修或停机事件，旧 `operatingState` 只是不会变化的演示值；`maintenanceCycleWeeks` 也没有提醒、日历或任务消费。读取与保存边界必须清除 `type / manager / operatingState / maintenanceCycleWeeks`，客户端伪造旧字段不得回流。
- 未来资产维护模块落地时，应由维护计划、保养单、维修单和停复机事件生成当前可用性、下次保养时间及派工门禁；这些动态事实不能重新变成资产主档手填字段。
- `EquipmentPurchaseSource` 只允许关联资产采购单。创建命令要求采购进度中的到货为已到货、验收为已验收且尚未存在对应资产；手工建档的来源为空，不保存“手工建档”等占位字符串。
- 资产创建成功后，在同一持久化事务中把来源采购单的 `assetRegistrationStatus` 更新为已登记，并追加包含资产编码和名称的采购流转事实。详情中的来源链接、采购单登记进度和流转记录读取同一关联编码。
- 资产页面按事实职责分类：品牌、型号、规格和出厂编号属于稳定设备身份；所属部门、使用位置、启用日期和采购来源属于使用与来源；说明只承接非结构化补充。页面分组不能改变 `EquipmentRecord` 字段来源，也不能把规格误归为采购来源事实。
- `DepartmentActiveReferenceProjection` 聚合启用员工、启用下级部门、启用仓库、启用资产和启用产线。存在任一引用时禁止部门停用；员工、下级部门或业务资源仍按部门名称/编码引用时禁止原位改名，避免形成孤立引用。

## 80. 产线主档、产能口径与设备作业引用（更新于 2026-07-24）

- `ProductionLineRecord` 保存产线编码、名称、类型、所属部门、车间/区域、标准产能值、产能单位、适用范围、使用状态和说明。名称在产线集合内唯一；启用记录必须归属有效且启用的部门。
- `ProductionLineRecord` 不保存固定负责人。排产、班次、操作、异常与维护责任由对应任务或执行事件按次保存；读取与保存边界清除历史 `manager`，客户端伪造值不得回流。
- `ProductionLineType` 至少包含挤出产线、复绕产线、包装产线和试验产线。挤出/试验的 `capacityUnit = kg/小时`；复绕/包装的产能单位只能是卷/班或卷/小时。`capacityValue` 必须大于零，显示层可以组合数值和单位，计算与导出继续读取独立字段。
- `ProductionLineReferenceStatus` 只控制新排产与现场作业候选。当前没有能生成 `ProductionLineOperatingStateProjection` 的换型、保养、维修或停复机事件，既有 `operatingState` 也没有任何排产门禁消费，因此读取与保存边界必须删除该静态字段；未来运行投影只能读取真实设备作业和现场维护事件。
- `workshop` 是车间/区域的唯一位置事实，`processScope` 是适用范围的唯一事实；历史 `primary / secondary` 只是两者的重复摘要，不能继续保存或作为业务判断输入。
- `OperationJobFact.assignedLine / recommendedLine` 是产线业务引用。任一未完成、未取消且未关闭设备作业仍引用产线时，产线不能停用；存在任何设备作业引用时不能原位改名，避免计划、实际和追溯链断裂。
- 复绕设备作业的来源大盘计划与实际耗用继续使用 kg，复绕产线标准产能和成品报工使用卷。两类单位属于不同事实维度，不能因为同属一条产线而相加或互换。

## 81. 销售报价冻结、有效性与订单关联投影（2026-07-22）

- `SalesQuoteLifecycleStatus` 仅保存草稿、已确认、已转订单或已作废。`SalesQuoteValidityProjection` 读取 `validUntil` 与当前日期，输出有效或已过期；已转订单和已作废时输出不再适用，不反写报价主状态。
- `SalesQuoteConversionRelation` 由 `quote.code -> order.sourceQuote` 建立，并在报价保存 `convertedOrderCode` 作为直接下钻事实。读取兼容层可从现存有效订单反查关联编码，但新转单必须在同一持久化事务写入报价状态、订单编码和流转记录。
- 草稿允许保存与确认。已确认报价发生内容变更时，服务端将生命周期退回草稿并追加“变更报价”记录；已转订单和已作废属于冻结状态，前端锁定不能替代服务端拒绝普通更新。
- `SalesQuoteLine.unitPrice` 的含义由该行 `priceInputMode` 决定；它记录用户最后直接编辑的是未税单价还是含税单价。服务端结合逐行税率生成另一种单价、金额和税额。兼容字段 `SalesQuoteLine.amount` 与 `SalesQuote.amount` 均保存含税金额，客户端提交的任何派生金额不是权威事实。
- 客户、联系人、联系方式、公司、销售物料、价格、日期、有效期、商务条款和报价人在报价保存时形成业务快照。报价人新建时默认当前登录账号对应员工，未冻结报价可按单改选启用员工；客户与物料主档后续变化不自动改写已保存报价，转订单时再把当时已确认的报价快照承接到订单。

## 82. 销售订单冻结边界与财务投影（2026-07-22）

- `SalesOrder.documentStatus` 只允许 `草稿、已确认、已关闭、已作废`；`productionStatus`、`deliveryStatus`、`invoiceStatus`、`paymentStatus` 与 `attentionStatus` 是相互独立的进度投影，不能回写主状态。
- 订单确认后，客户/公司快照、来源报价、产品、数量、基础单位、单价、税率和金额构成冻结交易事实。`products[].fulfillmentLinks` 只能由库存、生产和交付业务动作生成，普通订单保存不得写入或改写。
- `SalesOrder.amount` 与 `products[].amount` 由服务端计算；客户端上传的金额、生命周期和履约链接一律不作为事实来源。
- `SalesOrder.financeSummary` 是面向销售域的只读最小投影，包含 `invoiceCodes[]`、`receivableCodes[]`、`receivableAmount`、`settledAmount` 和 `dueDates[]`。来源分别为有效销售发票和应收台账，销售订单不能反向修改这些记录。
- 发票已创建但未确认时，订单可同时显示“开票进度：未开票”和“相关发票：SI-…”；前者表达确认结果，后者表达已存在的业务文档，二者不得合并成一个模糊状态。

## 83. 交付追踪派生快照与可发判断投影（2026-07-22）

- `SalesOutboundTracking` 由 `SalesOrder.code` 唯一派生，来源订单确认与交付要求同步写入或更新追踪记录；页面不提供独立新建命令。追踪编码、来源订单和订单行标识共同建立订单—交付—出库追溯链。
- 冻结字段包括公司/客户快照、来源订单、销售负责人、生成日期、承诺交付日、销售物料、型号规格、基础单位、订单数量和计划发货数量。允许维护的交付字段包括计划发货日、物流方式、收货联系人/电话/地址、内部备注和附件；仓库仅在受理前可改。
- `OutboundTrackingStatus` 使用待发货、仓库已受理、部分出库、已出库、已签收或已作废。旧值已提交映射为待发货，旧值部分发货映射为部分出库；兼容映射不得产生新的业务阶段。
- `ShipmentFulfillmentProjection` 从有效销售出库单按来源行累计已发和剩余数量。出库单冲销后重新计算，交付追踪页面不得保存手工累计值。
- `DeliveryCapabilityProjection` 保存 `remainingQty / committableQty / plannedSupplyQty / shortageAfterPlanQty`，分别表达剩余待发、本单现货、补充计划和未覆盖缺口。库存可用、本单预留、其他出库占用和更新时间只作为计算依据元数据。

## 84. 销售售后来源快照、受影响行与证据门禁（2026-07-22）

- `SalesAfterSaleSourceSnapshot` 保存来源销售订单、公司/客户/联系人、原单生命周期、金额、日期、承诺交付和原单备注。只有交付投影为已签收的订单可以建立售后；已有售后更新优先读取自身冻结来源，客户端不能更换来源订单或客户。
- `SalesAfterSaleAffectedLine` 保存 `sourceLineId / materialCode / name / model / spec / affectedQty / sourceQty / uom`。`affectedQty > 0` 且不得超过来源行数量；同一来源行在一张售后单中只能出现一次，跨售后单累计的 `affectedQty` 也不得超过 `sourceQty`。登记完成后受影响行保持冻结。
- `SalesAfterSaleRegistrationFact = sourceSnapshot + issueType + issueDescription + affectedLines + ownerEmployeeCode + attachments`。负责人引用启用的员工资料，姓名只是显示快照。登记命令只校验这一组事实，不要求处理方案；`action / amountImpactType / estimatedAmount / planNote` 属于受理方案，不能在问题刚登记时伪造为必填事实。受理后 `issueType / issueDescription` 与受理方案全部冻结，负责人仍可按协同需要变更。
- `SalesAfterSaleAmountImpact` 保存结构化 `amountImpactType / estimatedAmount / confirmedAmount / currency`。类型只允许无金额影响、待评估、退款、折让、补发成本或返修成本，当前币种固定为 CNY；`amountImpact` 只是兼容显示摘要，不再作为金额判断或关闭门禁的权威输入。受理后 `amountImpactType / estimatedAmount` 不可变，`confirmedAmount` 只在处理中形成最终结果时填写。
- `SalesAfterSaleExecutionTask` 保存 `code / module / kind / status / evidence / note`。任务由 `action` 的服务端模板在受理时生成，负责模块只允许销售、仓库、质检、生产或财务，状态只允许待处理、处理中、已完成。客户端不能增加、删除或改变任务身份；状态改为已完成时必须留下执行单号或完成依据，已完成任务的状态、依据和备注全部冻结，后序任务不能越过尚未完成的前序任务。
- `SalesAfterSaleResponsibilityProjection` 由执行任务中的负责模块去重生成，只用于兼容摘要和检索，不属于人工维护事实；销售端不得再提供责任协同输入框。
- `SalesAfterSale.status` 只保存待受理、处理中、待确认或已关闭。待受理进入处理中要求方案完整、金额影响已明确且金额型方案存在预计金额；处理中只有在全部协同任务完成后才允许写入 `processingResult / confirmedAmount`，二者齐备后才能进入待确认；`confirmationNote` 只允许在待确认阶段写入，存在确认依据后才能关闭。
- `nextStep` 是从主状态与第一项未完成任务计算出的责任投影。它不能由客户端独立推进，也不能以“处理中”反推退款、退货接收、退货质检、返修或重新出库已经完成。现阶段 `evidence` 可保存真实下游单号或完成依据；后续对应模块建立专用实体后，应由反向投影替代人工录入，不改变本任务身份与关闭门禁。
- `SalesAfterSaleOutputPolicy = internalOnly`。销售售后不是报价、订单或对账凭证，不建立打印模板、PDF 快照或输出动作；对外证据保存在附件、执行任务依据与客户确认记录中。
## 85. 销售订单行价格参考投影（2026-07-22）

- `SalesOrderLinePriceReference` 不是独立可写实体，由生命周期为已确认或已关闭的 `SalesOrder` 及其冻结行实时投影。生命周期读取 `documentStatus`，不能使用包含售后提醒等含义的综合显示状态代替。
- 列表投影字段包括 `sourceOrder / sourceLineId / materialCode / materialName / model / spec / customer / grossUnitPrice / netUnitPrice / taxRate / uom / orderQty / orderDate`。金额、数量、单位和逐行税率全部来自同一订单行快照；联系人和负责人仍属于来源订单事实，不复制到价格参考投影。
- 对客最终价格的主值固定读取 `grossUnitPrice` 并与物料基础单位同时显示；`netUnitPrice + taxRate` 作为次级价税依据。不得再读取整单 `taxMode / taxRate` 解释某一行，也不得因该行最后由未税单价录入而把兼容 `unitPrice` 误当含税单价。旧行缺少未税派生值时显示 `—`，不能伪造同值。
- 该投影只用于历史订单价格比较、报价参考、搜索、筛选、排序和导出，不保存有效期、不审批价格、不修改来源订单，也不证明该行已经出库、签收、开票或收款。

## 86. 销售成品库存可用投影（2026-07-22）

- `SalesFinishedGoodsAvailabilityProjection` 由 `WarehouseInventoryRow` 中 `itemType = 成品` 的行实时生成，不保存另一份销售库存。销售通过受销售查看权限保护的 `/sales/inventory` 读取该投影，不要求或隐式授予仓库查看权限；`/warehouse/inventory` 仍只属于仓库角色。
- 投影在服务端按 `materialCode + uom` 聚合为一行，名称、编码、型号和规格只作为商品识别信息。仓库、库位、批次以及 `qualifiedOnHand / occupied` 等仓储内部构成不得出现在销售投影中。
- 库存速查只消费 `currentAvailable / inTransit / expectedAvailable` 所需标量，其中 `expectedAvailable = currentAvailable + inTransit`；仓库接口已给出可用量时，销售投影直接汇总该值而不重复扣减。投影可保留销售订单履约判断需要的汇总补充/出库计划，以及只含 `sourceOrder / sourceLineId / qty / status` 的 `salesReservationSources`；这些字段不在库存速查页展示，也不得恢复仓库级明细。
- `occupied` 聚合有效销售预留、生产分配和冻结来源。一个有效 `sourceType + sourceDoc + sourceLineId` 在库存批次行中只能出现一次；释放、去重或迁移来源后必须重算所有受影响行的 `reservedNumber`、`lockedNumber` 和 `availableNumber`，包括重算为零。
- 页面没有订单行和请求数量上下文，因此本投影不能替代 `DeliveryCapabilityProjection`，也不能输出“可承诺数量”。库存状态只允许输出有可用库存、等待在途或无可用库存。
- 销售列表、移动卡片、筛选、排序和导出消费同一物料级投影，只展示商品身份、当前可用、在途补充、库存状态和更新时间；`inTransit = 0` 时不展示重复的 `expectedAvailable = currentAvailable`。不提供仓库明细、仓库模块下钻或仓库执行动作。任何显示层格式化都不得改变基础单位或数量守恒关系。

## 87. 采购申请生命周期与承接投影（2026-07-22）

- `PurchaseRequisition.status` 保存写入工作流状态，当前兼容 `草稿 / 待采购受理 / 已作废` 等动作门禁；`PurchaseRequisitionDocumentStatusProjection` 将其投影为 `草稿 / 已提交 / 已关闭 / 已作废`，只用于列表与详情的生命周期表达。
- `PurchaseRequisitionConversionProjection` 从所有未作废采购单的来源申请、来源行和数量实时汇总，输出 `status / linkedOrderCodes / coveredLineCount / completedLineCount / totalLineCount / lines[] / nextStep`。完整承接投影为已转单并关闭申请，部分承接不改写成新的生命周期。
- `PurchaseRequisitionLine` 保存 `lineId / materialCode / name / model / spec / qty / uom / incomingQualityControl`。物料必须启用采购用途，`uom` 必须等于物料基础单位，数量大于零；同一申请中物料身份唯一，金额和供应商不属于申请行事实。
- `sourceMaterialRequest` 是生产备料缺口生成申请的真实来源编码。来源存在时，物料、来源行、缺口数量和基础单位由系统库存覆盖评估生成并冻结；来源为空表示手工申请，不保存“手工创建”等占位值。
- 物料申请的必填事实为公司、采购类型、需求部门、申请人、申请日期、需求日期、申请原因和至少一条有效物料需求。手工申请的需求日期不得早于申请日期；系统承接已经逾期的生产需求时保留原需求日期并投影为逾期，不得静默改成生成采购申请的当天。资产申请改用资产名称、预算金额、使用/验收要求和验收负责人作为必要需求事实。
- 采购申请确认后不再通过普通保存修改需求事实；采购单按来源申请和来源行承接数量，同一申请可以被多张采购单分批承接，但累计有效承接数量不得制造负的剩余需求。

## 88. 物料采购冻结、应付金额与履约关闭投影（2026-07-22）

- `PurchaseOrder.status` 只保存草稿、已确认、已关闭或已作废等生命周期。`PurchaseOrderProgressProjection` 从有效采购收货、来料质检、正式入库、采购发票、应付和付款事件生成 `arrival / quality / inbound / invoice / payment / attention / nextStep / lines[]`，不反写组合状态。
- `PurchaseOrderLine.sourceRequisition + sourceLineId` 指向采购申请行。保存时以其他未作废采购单的有效承接量计算剩余数量，当前单修改时排除自身；采购行数量不得超过来源剩余，删除草稿后释放承接。
- `PurchaseOrderLine.amount = qty × unitPrice`。当 `taxMode = 含税` 时 `PurchaseOrder.amount = sum(line.amount)`；当 `taxMode = 不含税` 时 `PurchaseOrder.amount = sum(line.amount) × (1 + taxRate)`。金额由服务端重算，客户端金额不是权威事实。
- 订单确认要求公司、启用供应商、供应商联系人和电话、下单日期、预计到货、交付/付款/运费/税率、有效采购物料行以及收货仓库、地址、联系人和电话。预计到货不得早于下单日期；收货仓库必须启用、归属订单公司且类型为原料仓或包材仓。
- `PurchaseOrderDownstreamLockProjection` 在存在采购收货、来料质检、采购售后、采购发票或应付记录时为已冻结。已确认但尚无下游事实的订单可通过受控变更命令修改；出现下游事实后，普通保存和受控变更都不能改写来源、供应商、物料、数量、价格和条款。
- `ClosePurchaseOrderCommand` 仅在到货已完成、质量已放行或无需质检、物料已正式入库、发票已确认、应付已付款且异常为正常时执行。成功后状态写为已关闭并追加流转与审计记录；已关闭单据重复执行返回原结果。
- `PurchaseOrder.relatedDocuments` 使用明确类型 `采购申请 / 采购收货 / 来料质检 / 采购售后 / 采购发票 / 应付账款` 及真实路由。采购售后读取同一关联投影；显示层不得再用“到货/入库”等含混名称造成自动审计与页面不一致。

## 89. 资产采购到货、验收异常与登记投影（2026-07-22）

- `AssetPurchaseOrder` 复用采购单生命周期、供应商快照、条款和结算事实，但不保存物料行和仓库收货事实。资产名称、规格、用途、预算、成交金额、验收负责人和验收地点构成资产采购快照。
- `AssetArrivalFact` 保存 `assetArrivalStatus / assetArrivalDate / assetArrivalNote`。只有专用到货命令可写入，日期不得晚于当前业务日期；重复到货、草稿、作废和关闭单据拒绝执行。
- `AssetAcceptanceFact` 保存 `assetAcceptanceStatus / assetAcceptanceDate / assetAcceptanceNote`。状态允许待验收、验收不通过和已验收；日期不得早于到货，验收不通过时 `attention = 验收异常`、`nextStep = 重新验收资产`，不改变采购单生命周期。
- `assetRegistrationStatus` 只能由资产主档创建事务更新。验收通过后投影为待登记；资产创建成功后为已登记。验收未通过时不得建档，同一资产采购只能对应一个资产档案。
- `AssetPurchaseProgressProjection` 输出到货、验收、资产登记、收票、付款、异常和下一步。关闭命令要求到货已完成、验收已通过、资产已登记、发票已收、款项已付且无异常。
- 来源申请候选按 `purchaseType` 过滤，且只返回未完全承接的已提交申请。关联申请卡显示申请生命周期投影，不显示“待采购受理”等内部工作流状态。

## 90. 采购售后冻结事实与处置门禁（2026-07-22）

- `PurchaseAfterSaleSourceSnapshot` 保存来源物料采购单、公司/供应商/联系人、原单生命周期、金额、下单日期、预计到货和原单备注。首次登记后优先读取自身快照，客户端不能通过普通更新更换来源单或供应商。
- `PurchaseAfterSaleAffectedLine` 保存 `sourceLineId / materialCode / name / affectedQty / sourceQty / uom`。受影响数量必须大于零且不得超过来源采购行；登记后行集合冻结，不能删除、替换或扩大。资产采购单不能建立该实体。
- `issueType` 表达问题分类，`issueDescription` 表达交付、到货或质检中已确认的问题事实；`action / responsibility / amountImpact / owner` 分别表达方案、责任协同、金额影响和当前负责人。`nextStep` 是当前待办投影，均不改变主生命周期。
- `PurchaseAfterSale.status` 只允许待受理、处理中、待确认或已关闭。`processingResult` 是处理中进入待确认的必要证据，`confirmationNote` 是关闭前的供应商确认依据；已关闭记录拒绝普通更新。
- `PurchaseAfterSaleRelatedFactProjection` 从来源采购单反查有效采购收货、来料质检、采购发票等真实文档；只读投影不能由售后文本伪造。退货出库、补发收货、扣款折让等后续业务必须在对应模块形成单据后再投影。
- `AdvancePurchaseAfterSaleCommand` 要求采购确认权限，并按状态执行受理、提交结果和关闭；普通保存要求采购编辑权限。页面的动作可用性、服务端权限和证据门禁必须同源。

## 91. 采购订单行价格参考投影（2026-07-22）

- `PurchaseOrderLinePriceReference` 不是独立可写实体，由生命周期投影为已确认或已关闭的物料 `PurchaseOrder` 及其冻结行实时生成；资产采购、草稿和作废单据不进入。
- 投影字段为 `key / sourceOrder / materialCode / materialName / model / spec / supplier / grossUnitPrice / netUnitPrice / uom / taxRate / orderQty / orderDate`，价格、单位、税率和数量必须来自同一冻结订单行。
- `key` 由采购单号与稳定行号、物料编码或行序组成，避免同一订单重复物料导致列表键冲突。`grossUnitPrice` 是比较主值，`netUnitPrice + taxRate` 是价税解释；缺失未税事实时输出 `—`，读取层不得从格式化金额反推。
- 联系人和采购员不属于价格判断投影，也不进入搜索、筛选或导出；需要责任信息时沿 `sourceOrder` 读取来源采购单。
- 本投影只用于历史采购价格比较、搜索、筛选、排序、导出和来源下钻，不证明到货、质检、入库、收票或付款，也不能修改来源订单。

## 156. 采购价格记录与销售价格记录同构合同（2026-07-27）

- `PurchaseOrderLinePriceReference` 与 `SalesOrderLinePriceReference` 共享五列展示结构：商品身份、交易对象、含税单价、订单数量、来源订单/日期。交易对象分别为供应商和客户，来源分别为采购单和销售订单。
- 商品身份统一按 `name -> model/spec -> materialCode` 分层，不允许采购端把四项串成一个不可辨认字符串；桌面表格、窄屏卡片和 CSV 导出消费同一身份投影。
- 两侧价格主值均为行级 `grossUnitPrice / uom`，次级均为 `netUnitPrice + taxRate`。任何一侧不得因旧订单使用不同录入口径而把未税值当作含税主值。
- 采购端只允许供应商关键词和下单日期筛选；采购员与联系人不属于此只读决策页。搜索仍覆盖物料身份、供应商、来源、数量、单位及价税，以适应供应商和物料规模增长。

## 92. 采购收货来源承接与库存阶段事实（2026-07-22）

- `ReceivablePurchaseOrderProjection` 从 `PurchaseOrder.status = 已确认` 的物料采购行扣除所有未作废、未取消且未冲销采购收货的承接数量，输出仍大于零的 `sourceLineId / material / remainingQty / uom / qualityRequired`。投影为空的订单不再作为来源候选。
- `PurchaseReceipt` 保存来源订单、来源行、供应商快照、本次实收数量、基础单位、批次、收货日期、预计到货快照、仓库/库位、经办人、备注和附件。物料、单位与质检要求以来源采购行为权威，客户端输入不能覆盖。
- 自动生成的待收货任务中，实际到货日期、批次和真实经办人可以为空或待确认；普通保存不得用系统当天、自动批次或占位人员补成业务事实。`ConfirmPurchaseReceiptArrivalCommand` 必须校验真实实际到货日期与暂存库位，以当前登录仓库账号记录经办人，并只在确认时为仍为空的批次生成稳定批号。
- 采购收货写入与读取必须按来源行同时提供 `orderedQty / arrivedQty / remainingQty`，本次实收不得超过剩余量。列表把生命周期与 `rawStatus` 当前阶段分开，预计日期只用于待收货时效判断，实际日期只用于已经确认的到货事实。
- `PurchaseReceipt.stockStage` 表达 `qc_hold / quality_partial / pending_inbound / posted` 等库存阶段；`status` 只负责草稿、待质检、待入库、已入库和纠错生命周期动作。详情再投影为主生命周期、到货进度、质检进度和入库进度。
- 到货登记对物理在库、质检冻结或待入库分别写结构化库存事实和库存流水。来料质检按收货行写 `received / released / rejected / pending` 数量决定；只有 `pending = 0` 且库存阶段为待入库时可以正式过账。
- `PurchaseReceiptFrozenFact` 在存在 `stockStage` 或状态离开草稿/待收货后锁定来源、供应商、产品、数量、批次、日期、仓库、库位、经办人和状态。普通补充命令只可改 `note / attachments`；服务端比较所有冻结字段并拒绝篡改。
- 冲销不回写历史收货单，而是生成独立反向库存事实。采购订单的到货/质检/入库进度按有效未冲销收货重算；列表实际到货日期读取 `receipt.date`，不读取 `expectedDate`。

## 93. 销售出库来源承接、作业阶段与预留消耗事实（2026-07-22）

- `DispatchableOutboundRequestProjection` 以交付追踪行的 `requestQty` 扣除所有未作废、未取消且未冲销销售出库的承接数量，输出仍大于零的 `sourceLineId / material / remainingQty / uom / warehouse / expectedDate`。投影为空的交付追踪不再作为新出库来源。
- `SalesIssue` 保存交付追踪、销售订单与客户快照、出库行、实发数量、基础单位、批次、发货仓库、交付方式、作业日期、计划出库快照、经办人、备注和附件。来源身份、物料、单位、仓库和交付方式以交付追踪为权威，客户端输入不得覆盖。
- `SalesIssue.status` 表达待受理、待拣货、待复核和已出库的写入工作流；`SalesIssueLifecycleProjection` 将其投影为草稿、执行中、已完成或已冲销。`inventoryPosting / batchAssignment / nextStep` 是独立事实，不得回写为新的主状态。
- `AcceptedSalesIssueFrozenSource` 在状态进入待拣货后锁定来源交付、订单、客户、仓库、交付方式、计划日期和经办人；`SalesIssueReviewSnapshot` 在进入待复核后进一步锁定产品、数量、批次和作业日期。待复核只允许补充 `note / attachments`，结构调整必须先执行退回拣货。
- `PostSalesIssueCommand` 对每行校验来源行、正数数量、剩余交付数量和可出库库存。成功后按批次扣减 `onHandNumber / qualifiedOnHandNumber`，消耗匹配 `sourceOrder + sourceLineId` 的预留，追加库存流水，并同步交付追踪与销售订单履约。
- `SalesReservationProjection` 以原预留数量减去所有状态为已出库且未冲销的匹配出库行，输出 `quantityNumber / consumedQuantityNumber / status`；状态为有效、部分消耗或已消耗。刷新库存读模型不得覆盖已消耗证据，零剩余预留不进入锁定量但仍保留追溯来源。
- `ReverseSalesIssueCommand` 生成独立反向库存事实，恢复对应批次库存和订单行预留，并按有效未冲销出库重算交付追踪与销售订单；原销售出库的状态、批次和流水保持不可变。

## 94. 生产领料来源分配、库存过账与生产批次事实（2026-07-22）

- `ProductionMaterialIssueSourceProjection` 由一个 `ProductionWorkOrderRelease` 生成，要求 `releaseStatus = 已释放`、`materialStatus != 已领料` 且存在有效 `materialAllocations`。同一释放批次只能存在一张未作废、未取消的生产领料单。
- `ProductionMaterialIssueLine` 保存 `releaseLineId / materialCode / materialName / inventoryKey / warehouseCode / warehouse / batch / plannedQty / postedQty / uom`。物料、库存键、批次、仓库、数量和基础单位全部来自释放批次生产分配，不接受客户端自造行。
- `ProductionMaterialIssue` 保存来源工单、释放批次、生成后的生产批次、领料日期、经办人、备注和附件。`moveType / direction / reason / targetWarehouse` 由业务类型与释放产线推导，客户端不能换仓、换去向或改成其他出入库原因。
- 写入状态使用 `草稿 / 待出库 / 已完成`；`ProductionMaterialIssueLifecycleProjection` 映射为草稿、执行中、已完成，`ProductionMaterialIssueOperationStageProjection` 映射为待提交、待过账、已领料。库存扣减和下一步是独立投影，不写成主状态。
- `SubmitProductionMaterialIssueCommand` 冻结来源、产品、数量、单位、批次、仓库、去向、日期和经办人，只允许后续补充备注与附件。非草稿编辑路由必须回到只读详情，不能用禁用输入框伪装编辑能力。
- `PostProductionMaterialIssueCommand` 对每条生产分配校验有效来源、分配数量、合格在库和单位一致性；原子地扣减 `onHandNumber / qualifiedOnHandNumber / allocatedNumber`，把分配来源标记为已消耗，追加库存流水，更新释放批次并生成 `ProductionExecutionCard`。
- 生产批次生成以前，领料单不得显示虚构批次；生成以后保存真实 `executionCard` 并提供下钻。完成领料只证明物料已从仓库交给现场，不证明设备已经开机、生产已经报工或质量已经放行。

## 95. 生产退料原单快照、累计承接与库存恢复事实（2026-07-22）

- `ReturnableProductionMaterialIssueProjection` 只收录 `ProductionMaterialIssue.status = 已完成` 且至少一行 `issuedQty - reservedReturnQty > 0` 的领料单。`reservedReturnQty` 聚合所有未作废、未取消生产退料，不区分草稿、待过账和已完成，避免多张单累计突破原实发数量。
- `ProductionMaterialReturnLine` 以原领料行的 `sourceLineId / materialCode / materialName / uom / batch / inventoryKey` 为身份，只新增本次 `plannedQty / postedQty`。客户端只提交来源行标识和正数退回量，物料、单位、批次及库存键由服务端从原单重建。
- `ProductionMaterialReturn` 保存原领料单、工单、释放批次、生产批次、现场来源、退回仓库、退料日期、经办人、备注和附件。`moveType = 生产退料`、`direction = 入库`、`reason = 生产余料退回` 以及仓库路径均为来源派生事实，不接受客户端覆盖。
- 写入状态使用 `草稿 / 待入库 / 已完成`；`ProductionMaterialReturnLifecycleProjection` 映射为草稿、执行中和已完成，`ProductionMaterialReturnOperationStageProjection` 映射为待提交、待过账和已退料。库存过账与下一步保持独立投影。
- `PostProductionMaterialReturnCommand` 在事务内重新读取原领料单与所有有效退料承接，逐行验证剩余可退数量和单位；成功后把数量加回原 `inventoryKey` 对应的物料、仓库和批次，增加物理/合格在库并追加带 `sourceMaterialIssue` 的库存流水。
- 退料过账不修改原领料单状态、不撤销生产分配消耗，也不把生产批次退回未领料；它只保存一条独立的余料回仓事实并把退料单号追加到来源追溯。重复命令由 `postIdempotencyKey` 保证幂等。
- 空备注保持为空，不用系统说明伪造业务记录。列表和详情消费相同生命周期与退料阶段投影；原领料单、工单和生产批次都是可下钻关系，不以孤立字符串冒充来源链。

## 96. 完工入库质检放行额度、来源快照与库存过账事实（2026-07-22）

- `ReceivableProductionExecutionCardProjection` 只收录 `ProductionExecutionCard.node = 待入库`、`status = 待仓库` 且 `releasedInboundQty - inboundQty - reservedReceiptQty > 0` 的批次。`reservedReceiptQty` 聚合所有未作废、未取消完工入库单，草稿与待过账均占用额度。
- `ProductionFinishedReceiptLine` 以生产批次冻结的 `productCode / productName / unit / executionCardCode` 为成品身份，保存本次 `quantity / postedQty`。成品批次固定使用生产批次编号；客户端的物料、单位、批次、工单和释放批次仅是冗余输入，不能覆盖来源事实。
- `ProductionFinishedReceipt` 保存生产批次、来源工单、释放批次、质量放行凭证、本次入库数量、现场来源、目标仓库/库位、完工日期、经办人、备注和附件。空备注保持为空，附件按真实集合持久化。
- `ProductionFinishedReceiptTargetProjection` 只允许 `Warehouse.status = 启用 && allowProductionReceipt = true` 的仓库。服务端按仓库编码重新读取标准名称与库位前缀；未知、停用或未授权生产入库的仓库均拒绝。
- 写入状态使用 `草稿 / 待入库 / 已完成`；`ProductionFinishedReceiptLifecycleProjection` 映射为草稿、执行中和已完成，`ProductionFinishedReceiptOperationStageProjection` 映射为待提交、待过账和已入库。库存过账、质量放行与下一步保持独立投影。
- `PostProductionFinishedReceiptCommand` 在事务内重新计算 `releasedInboundQty - inboundQty`，把本次数量加入目标仓成品、基础单位和生产批次库存，增加物理/合格在库并追加库存流水；随后回写批次累计入库、释放批次、工单和销售生产进度。
- 完工入库不改变质量任务的检验结论，也不把包装或报工状态写入入库主状态。列表、详情和生产/销售进度只读取同一批次累计入库事实；重复命令由 `postIdempotencyKey` 保证幂等。

## 97. 其他出入库业务事实、审批里程碑与库存影响（2026-07-22）

- `WarehouseOtherMove.moveType` 使用样品出库、领用出库、报废出库、借用出库、借用归还或库存调整；旧值“盘外调整”映射为库存调整，旧值“研发领料”映射为领用出库。`direction` 由业务类型推导，只有库存调整接受显式入库或出库选择。
- `WarehouseOtherMove` 保存公司、业务日期、经办人、业务类型、库存方向、业务仓库、来源/去向、业务原因、物料明细、备注和附件。非库存调整业务的来源/去向是必要事实，不能用原因或备注代替业务对象。
- `WarehouseOtherMoveLine` 保存 `lineId / materialCode / name / model / spec / qty / uom / batch`。服务端按物料主数据规范化物料身份和基础单位；相同物料与批次不得重复，数量必须为正数。出库行在过账时按仓库、批次和可用数量校验。
- `WarehouseOtherMoveWarehouseProjection` 按 `warehouseCode` 读取启用仓库主数据并覆盖客户端名称。未知或停用仓库拒绝保存；库存方向为入库时页面投影“来源 → 仓库”，出库时投影“仓库 → 去向”。
- 写入状态继续使用 `草稿 / 待审核 / 待过账 / 已过账`。`WarehouseOtherMoveLifecycleProjection` 映射为草稿、执行中和已完成；`approvalStage` 映射为待提交、待审核和已审核；`postingStage` 映射为未过账、待过账和已过账。
- `SubmitOtherMoveForReviewCommand` 记录 `submittedAt`，不改变库存；`ApproveOtherMoveCommand` 记录 `approvedAt` 并进入待过账，仍不改变库存；`PostOtherMoveCommand` 记录 `postedAt`，按方向执行一次库存增加或扣减并追加库存流水。
- 审批接口不得从草稿直接跳到待过账。页面顶部动作、列表状态列、详情状态卡和流转日志消费同一里程碑事实；缺失来源/去向、原因、有效仓库、有效物料、正数数量或基础单位一致性时不得进入审核或过账。
- 已过账记录保持不可变。`ReverseWarehouseOtherMoveCommand` 生成独立冲销单和反向库存流水，原单保留已过账状态、审批时间、过账时间与原始明细，重试由幂等键保护。

## 98. 库存调拨里程碑、在途占用与双仓过账事实（2026-07-22）

- `WarehouseTransfer` 保存公司、调拨单号、调拨日期、经办人、调出仓、调入仓、调拨原因、物料明细、备注、附件、写入状态和三个时间里程碑。调出仓与调入仓分别按编码读取启用仓库主数据并覆盖客户端名称，二者不得相同。
- `WarehouseTransferLine` 保存 `lineId / materialCode / name / model / spec / qty / uom / batch`。服务端按物料主数据规范化身份和基础单位；数量必须为正，相同物料与批次不得重复，确认调出时按调出仓、批次和当前可用数量重新校验。
- 写入状态使用 `草稿 / 待出库 / 调拨中 / 已完成`，并兼容旧记录的 `待入库`。`WarehouseTransferLifecycleProjection` 映射为草稿、执行中和已完成；`WarehouseTransferOperationStageProjection` 映射为待提交、待调出、在途、待调入和已调入。
- `SubmitWarehouseTransferCommand` 冻结仓库、原因与明细并记录 `submittedAt`，不改变库存。`DispatchWarehouseTransferCommand` 记录 `dispatchedAt`，逐批扣减调出仓物理、合格和可用库存，写调出流水，并在调入仓生成 `transitLines` 与 `transitSources` 在途占用。
- `ReceiveWarehouseTransferCommand` 可直接承接 `调拨中`，也兼容旧 `待入库`；它记录 `receivedAt`，校验每条在途占用仍足额后减少在途、增加调入仓物理与合格库存、刷新可用库存并写调入流水。单纯“到达”不形成独立库存事实，因此不作为新流程必经命令。
- `submittedAt / dispatchedAt / receivedAt` 是提交、调出和调入的事实时间，不用调拨日期或日志文本代替。列表、详情状态卡、库存查询和库存流水从这些权威事实派生阶段、下一步、在途与余额。
- 同状态调出重试返回幂等结果，不再次执行库存扣减；已完成调入重试返回原结果，不再次增加库存。完成调拨只能通过独立冲销事实恢复调出仓、扣回调入仓并写两侧反向流水，原主状态和里程碑保持不变。

## 99. 库存盘点范围、冻结快照与差异事实（2026-07-22）

- `WarehouseStocktake` 保存公司、盘点单号、盘点日期、负责人、仓库编码/名称、`scopeMode / scope / scopeLabel`、写入状态、进度计数、备注、附件和阶段时间。仓库与物料范围必须由启用主数据规范化，客户端名称不能覆盖主数据身份。
- `WarehouseStocktakeScope` 使用全仓、库位、物料或批次精确判断库存行。活动盘点范围由同一判断函数约束所有库存写入；不仅已经冻结的行不能变化，命中范围的新库存键也不能在盘点期间创建。
- `WarehouseStocktakeLine` 是开始盘点时形成的服务端快照，保存 `inventoryKey / materialCode / item / location / batch / uom / bookQty / frozenQty`。更新实盘只能按已有 `inventoryKey` 回填 `countedQty`，`differenceQty` 由服务端计算。
- `plannedCount` 等于快照行数，`checkedCount` 等于已经填写实盘数的行数，`differenceCount` 等于非零差异行数。三个计数均为派生事实，不接受客户端传入值。
- 盘点冻结只冻结快照时的可用数量；销售预留和生产分配继续作为独立占用事实。完成前先校验 `实盘后合格库存 >= 销售预留 + 生产分配`，防止盘亏吞掉已经承诺的下游数量。
- `ReturnStocktakeForRecountCommand` 从待复核退回盘点中，记录退回人、原因和时间，保持快照与冻结；`CancelStocktakeCommand` 从待盘点或盘点中取消，记录取消人、原因和时间，不写差异流水并释放冻结。
- `CompleteStocktakeCommand` 只承接全部已盘的待复核单，逐行写盘盈或盘亏库存流水、更新物理与合格库存、解除冻结并记录 `completedAt`。冲销另建反向事实，原盘点与原流水保持不可变。

## 100. 库存查询余额、占用来源与批次元数据投影（2026-07-22）

- `WarehouseInventoryRow` 保存物料与仓库身份、库位、批次、基础单位、`batchDate / expiryDate`、物理在库、合格在库、销售预留、生产分配、冻结、待检、待入库、在途和更新时间。批次日期与效期是独立事实，不从最近流水或物料类型伪造。
- `InventoryAvailabilityProjection.available = qualifiedOnHand - reserved - allocated - frozen`，结果不得小于零。`onHand = qualifiedOnHand + qcHold + pendingInbound + 其他在厂非合格数量`；在途不属于当前物理在库。
- `InventoryOccupationProjection` 分别聚合销售预留、生产分配、手动/盘点冻结和调拨在途，保留 `type / sourceDoc / sourceLineId / quantity / status / path`。锁定总量只是展示合计，不替代这些来源事实。
- `InventoryJudgementProjection` 使用待检、待入库、在途、已占用、需补货、需关注、正常或充足表达库存判断。单行与分组列表、筛选、排序和详情读取同一投影；有合格库存但全部被占用时不得标记为需补货。
- 物料与批次视角只汇总同一物料基础单位；库位视角按单位分别汇总，不允许把不同量纲数值相加。库位视角的数量排序以物料种数替代无意义的跨单位数量比较。
- `BatchInventoryProjection` 的入账日期优先读取库存行 `batchDate`，兼容数据可以读取该批次最早库存流水；效期只读取 `expiryDate`，无效期物料由主数据投影“无效期要求”，其余空值保持“效期未登记”。

## 101. 库存流水业务类型、余额事实与冲销来源投影（2026-07-22）

- `InventoryLedgerEntry` 保存 `occurredAt / businessType / direction / materialCode / batch / warehouseCode / location / quantity / uom / balanceFact / beforeBalance / afterBalance / sourceDoc / sourceLineId / documentLineId / operator / reason`。流水写入后不可修改。
- `businessType` 表达采购入库、销售出库、生产领退料、完工入库、调拨出入库、质量冻结/放行、盘盈盘亏或库存冲销；`direction` 只表达增加、减少或状态转移，二者不得互相替代。
- `balanceFact` 指明本条流水改变的是物理在库、合格在库、待检、待入库、在途或冻结等哪一个数量事实。`quantity` 的正负号与 `beforeBalance / afterBalance` 必须一致；状态量转移可以形成一对事实流水或保存明确的转移口径。
- `sourceLineId` 只保存真实上游业务行，`documentLineId` 保存本次库存单据行。盘点快照的 `inventoryKey` 属于内部关联键，不写入来源行；兼容数据在页面投影时也必须隐藏。
- 冲销生成新的 `InventoryLedgerEntry`，保存 `reversalOf / sourcePath` 并以相反数量恢复对应余额。原流水、原单据和原余额快照保持不变；重复冲销由幂等键阻止。

## 102. 批次追溯投影与来源规则（2026-07-22）

- `BatchTraceProjection` 是 `InventoryBalance + InventoryLedgerEntry + SourceDocument` 的只读查询投影，不是可独立新建、编辑或维护状态的业务实体。
- 批次身份至少由 `batchNo + materialCode` 组成；当前分布按仓库和库位聚合，所有数量继续携带物料基础单位。
- `originEntry` 取同批次同物料最早的不可变库存流水；`originDocument` 由该流水来源下钻。没有流水的历史批次只能标记为期初库存或来源未关联。
- `batchDate` 与 `expiryDate` 读取批次显式元数据，不从最近流转日期推测；`qualityStatus` 读取当前质量事实，不从库存主状态猜测。
- `movementEntries` 读取同批次同物料的流水并按发生时间倒序；每条继续保留业务类型、余额事实、仓库/库位、来源单据、公开来源行和经办人。
- 批次追溯只改变查询视角，不复制库存余额，不建立第二份批次主档，也不允许通过查询页直接改写库存或质量结果。

## 103. 销售发票来源快照、税价合计与退款状态事实（2026-07-22）

- `SalesInvoiceSourceProjection` 以 `sourceOrder` 查找唯一销售订单，并投影 `sourceDoc / sourceOrder / companyCode / company / partyCode / party`。这些字段由订单覆盖客户端输入；来源不存在时发票不能保存。
- `SalesInvoiceLine` 保存来源订单行标识、物料、基础单位、本次数量、来源税价单价、行金额和税率。行金额必须处在来源订单行剩余可开数量与金额之内，其他有效发票和未确认草稿都占用额度，本发票自身不计入“其他占用”。
- `InvoiceTotalsByTaxMode` 对含税订单计算 `totalAmount = Σ line.amount`、`amount = Σ line.amount / (1 + taxRate)`、`taxAmount = totalAmount - amount`；未税订单计算 `amount = Σ line.amount`、`taxAmount = Σ line.amount × taxRate`、`totalAmount = amount + taxAmount`。客户端合计不是权威事实。
- `SalesInvoice.documentStatus` 只使用待开票、已开票和已红冲；`settlementStatus` 表达未收款、部分收款、已收款或已冲销；`refundStatus` 独立使用无需退款、待退款和已退款。
- `ReverseSalesInvoiceCommand` 保留原发票、生成全额红字凭证、释放订单行开票额度，并在已收金额大于零时生成退款义务，同时把发票与应收的 `refundStatus` 置为待退款；无已收金额时置为无需退款。
- `CompleteSalesRefundCommand` 必须保存退款方式、外部交易流水和幂等键，完成后把退款义务、销售发票与应收账款的退款状态同步为已退款，不回写主生命周期。

## 104. 采购发票来源链与三单匹配额度事实（2026-07-22）

- `PurchaseInvoiceSourceProjection` 以 `sourceDoc` 查找采购收货，再以 `receipt.sourceDoc` 查找物料采购，投影 `company / supplier / contact / sourceReceipt / sourceOrder`。来源收货或物料采购不存在时不能保存采购发票。
- `PurchaseInvoiceMatchLine.invoiceableQty = min(orderedQty, postedQty)`；`invoiceableAmount = orderAmount × invoiceableQty / orderedQty`。`remainingQty / remainingAmount` 分别扣除其他有效采购发票与未确认草稿已经承接的数量和金额。
- 收货尚未正式入库时 `matched = false`，阻断原因为未正式入库，`invoiceableQty / invoiceableAmount` 都为零；同一问题不再重复写入 `warnings`。
- `PurchaseInvoiceLine` 绑定采购行与收货行标识，保存物料、基础单位、本次数量、来源税价单价、行金额与税率。确认收票前重新核对单位、正数数量/金额和剩余额度。
- 采购发票合计使用与销售发票相同的 `InvoiceTotalsByTaxMode`，客户端金额合计不能覆盖服务端按来源采购税价方式计算的未税额、税额与价税合计。
- `PurchaseInvoice.documentStatus` 只表达待收票和已收票，`settlementStatus` 独立表达未付款、部分付款与已付款；三单匹配是确认门禁，不写入主状态。

## 105. 应收账款来源、到期与退款义务事实（2026-07-22）

- `Receivable` 保存 `code / companyCode / company / sourceDoc / sourceOrder / partyCode / party / contact / contactPhone / amount / taxAmount / totalAmount / settledAmount / date / dueDate / taxMode / paymentMethod / bankAccount / lines`。公司、主体、来源、税价和金额来自销售发票及其来源订单。
- `ReceivableSettlementProjection` 按 `settledAmount` 与 `totalAmount` 投影待收款、部分收款或已收款；生命周期只按冲销和是否结清投影执行中、已结清或已冲销，二者不能互相覆盖。
- `ReceivableDueProjection` 使用当前上海日期与 `dueDate` 计算距到期、今日到期和逾期天数；已结清显示无需催收。到期判断是读模型，不写回主状态。
- `ReceivablePaymentEvent` 是每笔真实收款事实，保存金额、日期、方式、账户、外部凭证、经办人和幂等键；收款笔数从事件集合统计，不从备注或累计金额猜测。
- `Receivable.refundStatus` 从来源销售发票同步待退款、已退款或无需退款。待退款只改变资金义务和下一步，不复活已经冲销的应收生命周期；退款仍由销售发票退款命令登记。

## 106. 应付账款结算与付款暂缓事实（2026-07-22）

- `Payable` 保存与采购发票一致的公司、供应商、联系人、来源链、税价、金额、日期、账户与明细快照；旧数据缺失时按采购发票和来源采购补齐。
- `Payable.status` 只使用待付款、部分付款、已付款或已冲销表达结算进度。`holdStatus` 独立使用正常或已暂缓，`holdReason / heldAt / heldBy` 保存暂缓事实；旧“暂缓付款”迁移为原结算进度加独立暂缓维度。
- `HoldPayableCommand` 必须填写原因，把 `holdStatus` 改为已暂缓并写日志，不改变 `status / settledAmount / totalAmount`。`ResumePayableCommand` 必须填写恢复说明，只恢复 `holdStatus` 为正常。
- `PayPayableCommand` 仅接受待付款或部分付款且 `holdStatus = 正常` 的应付账款；已暂缓时服务端拒绝付款。每笔付款继续使用账户、日期、方式、凭证和幂等键留痕。
- `PayableDueProjection` 与应收使用相同日期口径；生命周期、结算进度、到期状态、付款事件和异常/暂停是五个独立展示维度。

## 107. 界面术语映射不改写权威业务状态（2026-07-23）

- 展示层允许把稳定的内部枚举映射为更自然的界面用语，但不得直接改写历史记录、接口字段或跨模块判断条件。生产 `待释放 / 部分释放 / 已释放` 映射为 `待安排 / 部分安排 / 已安排`，`ReleaseBatch` 在界面称“生产安排”，领料完成后生成的 `ExecutionCard` 仍称“生产批次”。
- 仓库 `待过账 / 已过账` 在列表和单据状态区映射为 `待确认 / 已完成`，具体动作按业务类型显示确认出库、确认入库或确认库存变动；服务端 `postedAt`、库存流水与冲销规则保持不变。
- 销售需求的库存预留、生产计划和未覆盖数量仍属于内部需求分配事实，但销售订单界面归入“备货情况”，不再用“承接”或“需求分配”作为用户状态；采购申请到采购单使用“转采购”，不改变来源行额度和防重复转单规则。
- 质量 `dispositionStatus` 仍保存处置阶段，界面将“闭环”显示为“处理阶段/处理完成”，将质量结果“回写”显示为“同步”；放行、冻结、让步、复检和隔离仍保留各自独立语义。
- 财务核销、红冲、冲销属于不同会计事实，不因易读要求合并为“完成”或“撤销”。展示层只简化周边说明，并继续保留原凭证、反向记录和资金状态边界。

## 108. 七模块权威事实基线与后续扩展边界（2026-07-23）

### 108.1 跨模块公共事实

- 同一业务对象的列表、详情、新建/编辑和工作台入口必须读取同一权威记录或同一服务端投影，不允许各页面复制一份静态状态、数量或下一步文本。
- `documentLifecycle` 只表达草稿、执行中、已完成、已关闭、已冲销或作废等生命周期；`fulfillment / production / quality / inventory / settlement / disposition / attention / nextAction` 是独立维度。提醒、当前节点和数量进度不能反向覆盖主生命周期。
- 所有数量事实保存 `quantity + baseUnit`。物料的销售、采购、仓储、生产和质检都使用同一基础单位；禁止仅为界面方便建立第二套销售单位、采购单位或折算后数量。
- 公司主体由来源单据继承或在首张责任单据上明确选择，并在后续销售、采购、仓库、财务和生产记录中保留。名称可以作为时点快照，但判断与关联使用稳定公司编码。
- 附件、日志、里程碑和资金/库存事件属于独立不可变证据；页面隐藏空内容不等于删除能力，历史事件也不能通过改写当前单据字段消失。

### 108.2 生产与质量事实

- `ProductionTask` 表达需求与计划缺口，`ManufacturingOrder` 表达已确认生产计划，`ReleaseBatch` 表达生产安排，`ExecutionCard` 表达生产批次和现场实绩，`QualityInspection` 表达独立质量判断。它们通过稳定来源标识关联，但各自保存自己的生命周期、数量与责任。
- 工单创建或重新确认时冻结 `RecipeSnapshot` 和 `ProcessSnapshot`。配方快照保存每单位净重、投料组成、固定用量与预估损耗规则；工艺快照保存路线、系统动作、作业要求和固定 14 温区。产生下游执行事实后不得再替换快照。
- 大盘半成品数量事实使用 kg，复绕投入和产出转换保留重量证据；复绕成品使用卷，并保留单卷净重、合格卷数和异常卷数。不同基础单位禁止直接累计为同一进度值。
- 质量标准是可版本化规则，检验明细是本次证据，检验结论是判断，处置是后续决定，仓库放行/冻结/入库是库存结果。五者可以关联，但不能共用一个状态字段。

### 108.3 展示映射与数据合同

- 内部 `release` 可以继续作为接口和历史枚举，界面固定映射为“安排生产”；内部 `posted` 固定映射为“确认库存”相关用语；员工业务可引用能力在界面称“使用状态”。这些映射不得制造新的并行枚举。
- 页面“下一步”由当前生命周期、独立进度、阻断原因、责任角色和可执行命令实时推导，不作为可编辑字段保存。相同对象的列表状态栏、详情摘要和顶部主按钮必须使用同一推导结果。
- 前端原型中的同步动作、演示数据和本地存储不是正式业务事实。进入正式后端时必须补真实数据库约束、事务、幂等键、并发额度校验、权限审计、附件对象存储和失败补偿。

### 108.4 电商集成事实边界

- `PlatformOrder` 保存外部平台、平台订单号、店铺、买家快照、平台 SKU、数量、金额、平台状态和原始导入批次；`platform + shop + platformOrderNo` 构成幂等键。
- `SkuMapping` 只负责平台 SKU 与 ERP 物料的映射，不复制物料名称、基础单位和库存余额；无法映射的订单进入异常队列，不得先生成含未知物料的销售订单。
- 成功导入的平台订单生成或关联唯一 ERP 销售订单。需求分配、生产安排、销售出库、发货、售后、应收和退款继续由现有七模块记录承担，平台状态只是外部回传结果。
- 平台库存同步读取 ERP 当前可用库存并记录每次推送结果、失败原因和重试次数；平台显示库存不是 ERP 库存余额，也不能直接写回库存事实。
- 平台售后先保存外部申请与证据，再关联销售售后；平台账单先保存结算批次与明细，再与销售发票、应收、收款和退款进行匹配。未匹配差异进入待处理队列，不以修改订单金额消除差异。

## 109. 仓库—物料补货信号、下游需求与通知事实（2026-07-23）

### 109.1 关系事实与反向只读投影

- `MaterialSupplierRelation` 的权威维护入口是供应商“可供物料”；物料详情仅按 `materialCode` 反向查询启用关系，显示供应商、供应商料号、起订量、供货周期和默认关系，不保存副本。
- `WarehouseMaterialRelation` 的权威维护入口是仓库“物料补货设置”；物料详情仅按 `materialCode` 反向查询启用关系，显示仓库和四项补货阈值，不保存副本。
- 反向投影为空时不产生关系卡片。主数据详情隐藏空关系不等于删除关系能力，停用关系仍保留在权威关系记录中供历史追溯。

### 109.2 补货信号读模型

```ts
type WarehouseReplenishmentSignal = {
  code: string // WarehouseMaterialRelation.code
  warehouseCode: string
  materialCode: string
  uom: string
  availableQty: number
  pendingInboundQty: number
  inTransitQty: number
  projectedQty: number
  safetyStock: number
  reorderPoint: number
  maxStock: number
  replenishmentLot: number
  suggestedQty: number
  thresholdStatus: '库存告急' | '需补货' | '在途覆盖' | '正常'
  status: '库存告急' | '需补货' | '在途覆盖' | '补货处理中' | '正常'
  availableRoutes: Array<'采购申请' | '生产任务'>
  actionRequired: boolean
  linkedDocument?: {
    type: '采购申请' | '物料采购' | '生产任务'
    code: string
    status: string
    path: string
  }
}
```

- `projectedQty = availableQty + pendingInboundQty + inTransitQty`。待检不进入预计可用；只有已经放行但待正式入库的数量和调拨在途参与防重复判断。
- `projectedQty <= safetyStock` 投影为库存告急；否则 `projectedQty <= reorderPoint` 投影为需补货；当前可用触及补货点、但待入库/在途使预计可用越过补货点时投影为在途覆盖。
- `targetQty = min(maxStock, reorderPoint + replenishmentLot)`；`suggestedQty = max(0, targetQty - projectedQty)`。所有数量继续使用关系中由物料主数据规范化的基础单位。
- 可采购物料提供采购申请路线；可产出且为成品或半成品的物料提供生产任务路线。路线是物料业务属性的投影，不作为仓库—物料关系中的可编辑枚举。

### 109.3 下游单据与幂等边界

- `StartWarehouseReplenishmentCommand` 只能由具有 `PERM-WAREHOUSE-REPLENISH` 的账号执行。命令重新读取当前信号，不接受客户端传入库存、阈值、物料、仓库或建议数量。
- 采购路线生成 `PurchaseRequisition`，写入 `sourceReplenishmentCode / sourceWarehouseCode / sourceWarehouseName / replenishmentSnapshot`，状态直接进入待采购受理；明细物料和基础单位由主数据规范化。
- 生产路线生成 `ProductionTask`，`sourceType = 安全库存补货`，并写入相同来源字段和阈值快照。库存告急信号形成紧急任务，其余信号形成正常优先级任务。
- 查找同一 `sourceReplenishmentCode` 的未结束采购申请、关联采购订单或生产任务形成 `linkedDocument`。存在关联单据时命令返回已有单据并标记重复，不再写第二张需求单；库存页在需要补货时显示补货处理中及其下钻入口。

### 109.4 通知责任

- 读取库存补货信号时，系统按“关系编码 + 阈值状态”幂等生成仓库模块“库存预警”，接收角色为仓库。相同阈值状态重复刷新不重复写通知，状态变化后可以形成新的提醒事实。
- 仓库发起采购路线后生成采购模块“采购申请生成”通知，接收角色为采购；发起生产路线后生成生产模块“补货任务生成”通知，接收角色为生产。
- 通知只负责把责任交给正确角色，不能替代采购申请、生产任务或其后续生命周期。仓库主管仍可从库存预警回到已有下游单据查看处理进度。

## 110. 仓库主档、类型能力与隔离库存边界（2026-07-24）

```ts
type WarehouseMaster = {
  code: string
  name: string
  type: '成品仓' | '原料仓' | '包材仓' | '半成品仓' | '生产线边仓' | '备件仓' | '暂存仓' | '隔离仓' | '综合仓'
  company: string
  regionType: '国内' | '海外'
  province?: string
  city?: string
  address?: string
  locationCount: number
  binPrefix?: string
  status: '启用' | '停用'
  note?: string
}

type WarehouseCapabilityProjection = {
  warehouseCode: string
  allowPurchaseReceipt: boolean
  allowSalesIssue: boolean
  allowProductionIssue: boolean
  allowProductionReceipt: boolean
  allowQualityHold: boolean
  allowQuarantine: boolean
}
```

- 仓库主档不保存管理部门、固定负责人和联系电话。收货联系人、盘点负责人、出入库经办人、调拨负责人及异常处置责任人属于具体业务单据或执行事件，必须按次冻结。
- 本节的类型能力旧合同已由第 151 节替代；当前仓库类型只表达物理分类，流程准入读取 `warehouseFunctions`。暂存仓可分别承接采购暂存或销售退货暂存，备件仓可按配置承接采购入库。
- 客户端不提交、编辑或展示六项 `allow*`，服务端忽略并覆盖客户端携带的同名值。自由文本 `warehouseScope` 不具备物料准入能力，已从主档删除；具体物料限制必须由结构化仓库—物料关系承载。
- `allowQualityHold` 只承接尚未完成检验的物料；`allowQuarantine` 承接不合格、冻结或待处置物料。两者不得因都不可销售而合并为一个库存阶段。
- 类型能力不是库存质量状态。物料进入待检或隔离数量必须由收货、质检、冻结、调拨或处置命令形成；放行、返工、转回料、报废后再由对应命令改变库存分类。正常可用量继续排除待检、隔离和冻结数量。
- 仓库启用只表示可被新业务引用，不能绕过类型能力门禁；停用不改写历史库存、批次和流水。保存时服务端规范化所属公司，校验名称唯一、类型和状态有效、库位数量为非负整数、存在库位时前缀必填，并在读取与保存边界清除历史管理字段及保管范围。

## 111. 计量单位单一显示值与预留英文简称（2026-07-24）

```ts
type UomMaster = {
  code: string
  name: string
  englishAbbreviation: string
  status: '启用' | '停用'
  note?: string
}
```

- `name` 是中文系统唯一使用的单位值，选择器、物料、数量、库存和单据均沿用该值；当前标准值包括 `kg`、`g`、卷、个和箱，不再同时维护“单位名称”和“单位符号”两套表达。
- `englishAbbreviation` 保存单位常见英文简称，当前标准值为 `kg`、`g`、`roll`、`pcs`、`ctn`；它不参与引用、计算、校验或现有打印，当前没有业务消费者。
- 计量单位不维护单位类型、基准单位、换算系数或小数精度。所有业务数量直接使用物料基础单位，不同单位不得直接合计；`g` 与 `kg` 之间不自动换算。
- 包装数量关系继续由包装物料、包装规则或具体单据承载，不能把“12 卷/箱”“25 kg/袋”重新写回通用计量单位。
- 单位已被物料引用后，业务单位值和使用状态受引用保护；英文简称在当前尚未进入业务单据，因此仍可维护。读取与保存边界清除旧英文全称字段以及历史符号、类型、换算和精度字段。

## 112. 部门稳定身份、组织层级与责任边界（2026-07-24）

```ts
type DepartmentMaster = {
  code: string
  name: string
  company: string
  parentDepartment?: string
  status: '启用' | '停用'
  note?: string
}
```

- 部门主档只保存稳定组织身份、所属公司、可选上级部门、使用状态与备注。`employeeCount` 是按员工使用状态为启用且当前归属该部门实时聚合的“启用员工”读模型，不接受部门保存命令覆盖，也不得命名为或解释成劳动关系“在职人数”。
- 当前“部门类型”既不驱动权限、审批、核算、组织层级，也不改变业务候选，因此不是权威事实并从主档删除。未来若确有流程分流需要，应建立有明确值域和消费方的组织属性，不复用无行为含义的展示标签。
- 部门不保存固定负责人，当前员工主档也不保存固定直属上级。申请人、经办人、审核人和任务负责人由具体业务单据、审批规则或执行事件按次保存，不能从组织主档静默带入并冒充当次责任；未来若确需汇报线，应建立有生效日期和消费方的独立组织关系。
- 部门不保存概括性的主要职责。岗位职责属于员工岗位或岗位定义，审批职责属于审批规则，执行责任属于具体业务单据或事件；这些事实不能由部门备注替代。
- 部门必须归属启用公司；上级部门必须属于同一公司且不能形成自身引用或循环。启用部门不能挂在停用上级下，同一公司内部门名称唯一。
- `DepartmentActiveReferenceProjection` 继续聚合启用员工、启用下级部门、启用资产和启用产线。存在启用引用时禁止停用；存在员工、下级部门或业务资源引用时禁止原位改名。
- 部门详情不展示引用数量摘要，但改名和停用命令仍读取 `DepartmentActiveReferenceProjection`。服务端在读取与保存边界清除历史 `type`、`manager`、`primary` 和 `secondary` 字段；删除展示与旧字段不得放松公司、层级、改名、停用和实时人数校验。

## 113. 员工稳定资料、业务候选与账号投影边界（2026-07-24）

```ts
type EmployeeMaster = {
  code: string
  name: string
  owner: string
  position: string
  gender?: '未填写' | '男' | '女'
  phone?: string
  email?: string
  hireDate?: string
  status: '启用' | '停用'
  note?: string
}

type EmployeeAccountProjection = {
  employeeCode: string
  linkedAccount: string
  linkedAccountStatus: '启用' | '停用' | '未分配'
}
```

- `EmployeeMaster` 不保存用工类型、任职状态或直属上级。当前系统没有劳动合同、入转调离、休假考勤或汇报线流程消费这些旧字段，保留枚举只会形成无人维护且无法校验的伪事实；读取与保存边界必须清除历史 `type`、`employmentStatus` 和 `supervisor`。
- `status` 是员工业务候选状态：启用员工可以进入新的申请人、负责人和经办人选择，停用员工不再进入新业务候选。历史单据已经冻结的人员编码和姓名不因主档停用而改写。
- 启用员工必须归属有效且启用的部门，岗位/职务是当前岗位说明。具体审批、任务和执行责任仍由对应单据、审批规则或事件按次保存；未来若引入正式人事管理，应建立独立员工任职、合同、假勤或组织关系对象，不复用本主档状态。
- `EmployeeAccountProjection` 由系统账号按员工编码反向生成，只读显示在员工“岗位归属”中。员工保存载荷中的账号名和账号状态必须被服务端丢弃；账号密码、登录状态、角色和菜单权限只由系统模块维护。
- 员工仍关联启用账号时不能停用，以免出现可登录但不可作为业务人员引用的矛盾关系。资产和产线主档均不维护固定负责人，具体责任只从任务、班次或执行事件读取。
- 页面分组必须服从事实类型：性别和入职日期属于员工基本资料，手机与邮箱才属于联系信息；部门、岗位和账号投影属于岗位归属，备注独立展示。`updatedAt` 是技术审计时间，不作为员工身份字段占据详情事实格。

## 114. 公司中英文主体资料与不可见引用保护（2026-07-24）

```ts
type CompanyMaster = {
  code: string
  name: string
  englishName?: string
  shortName?: string
  type: '总公司' | '分支机构'
  taxNumber: string
  phone?: string
  email?: string
  website?: string
  address?: string
  englishAddress?: string
  status: '启用' | '停用'
}
```

- `name` 和 `taxNumber` 是中文法定主体与唯一税务身份；`englishName` 与 `englishAddress` 是公司可选英文资料。英文资料当前只由公司主档保存，不进入销售报价、销售订单或 PDF 快照。
- 中文经营地址和英文地址是同一公司经营地点的两种语言表达，不能与工商注册地址或客户/供应商的收货地址混用。英文名称不参与公司唯一性判断，也不能替代业务单据现有的 `companyCode + company` 中文主体引用。
- 公司列表、详情、表单、移动卡片、搜索、导出和接口返回必须使用同一中英文资料来源；服务端保存时清理名称和地址首尾空格，不能让演示数据、前端默认值与持久化记录产生三套口径。
- 部门和仓库对公司的引用投影仍是改名与停用命令的保护事实，但不是需要用户日常阅读的公司详情内容。页面不展示“引用情况”或引用数量，不显示装饰性小标题；存在引用时仍禁止直接改名，存在启用引用时仍禁止停用。
- 公司停用只移出新的业务主体候选，不改写历史单据已经冻结的公司编码、中文名称、税务和结算事实；英文资料当前没有单据快照。

## 115. 基础资料字段合同与展示摘要边界（2026-07-24）

- 主档字段合同只保存业务可维护、可校验或被流程消费的事实。列表副文本、选择器主副摘要、资料完整性文案和技术更新时间属于读模型或界面表达，不得因为通用组件需要而写成 `primary / secondary / owner / manager` 等隐藏主档字段。
- `CustomerMaster` 不保存 `owner / manager / primary / secondary`；联系人、电话、公司经营地址和默认收货分别读取明确字段。`SupplierMaster` 同样不保存固定归属、采购员或通用摘要，也不保存供应商级 `supplyMaterialCount / purchaseLeadTimeDays`；可供物料数量可从关系实时统计，但当前页面和导出不展示，供货周期属于每条 `MaterialSupplierRelation.leadTimeDays`。
- `UomMaster` 的持久化合同严格为编码、单位、英文简称、使用状态和说明。`EmployeeMaster` 不保存重复 `contact / primary / secondary`，也不接收当前页面未维护的生日、住址或紧急联系人字段；手机是当前唯一电话号码事实。`CompanyMaster` 不保存隐藏组织归属，`EquipmentRecord` 不保存空摘要字段。
- 兼容旧数据时，读取边界可以丢弃旧字段；保存命令必须再次丢弃客户端伪造值。选择器需要摘要时按明确事实即时组合，不把组合文本回写主档。
- 同一主档的详情和编辑必须使用相同事实分类。员工的基本资料、岗位归属、联系信息、备注分开；公司的联系与地址、开票与银行资料分开；部门备注独立于组织身份。`updatedAt` 继续用于排序、导出和审计，但不作为计量单位、部门或员工详情中的业务事实格。

## 116. 物料、仓库合同与列表投影补充（2026-07-24）

- `MaterialMaster` 的身份和规则事实必须使用 `code / name / category / model / spec / uom / status`、三项业务属性、常用仓库、批次效期及到货/完工检验明确表达；不保存 `owner / primary / secondary`。供应商和仓库阈值来自 `MaterialSupplierRelation` 与 `WarehouseMaterialRelation`，不是物料摘要字段。
- `WarehouseMaster` 只保存稳定身份、所属公司、仓库类型、地区地址、库位数量、库位前缀、使用状态和说明；不保存 `owner / manager / phone / warehouseScope / primary / secondary`。仓库类型能力是服务端读模型投影，不允许客户端通过隐藏字段覆盖。
- 列表投影只组合明确事实：计量单位三列对应单位、英文简称和使用状态；产线窄屏卡片读取产线类型、部门、车间、产能和适用范围；仓库库位摘要读取数量与前缀。删除主档字段后必须同步检查网格轨数和窄屏卡片，避免视觉空轨或旧摘要回潮。
- 兼容字段清理需满足双向门禁：历史记录读取时丢弃，客户端 PUT 注入时再次丢弃。`smoke:master-data` 对物料、客户、供应商、仓库及其他已收口主档执行这一边界断言。

## 117. 基础资料搜索读模型、层级引用与候选摘要合同（2026-07-24）

- 主档搜索不是对持久化对象做无差别全文检索，而是列表读模型的一部分。每类主档必须明确可搜索事实，并与列表、详情、窄屏卡片和导出的业务含义一致；隐藏备注、旧兼容摘要、默认收货、开票银行等未在当前列表识别语境中展示的事实不得造成隐式命中。
- 客户和供应商的公司经营地址属于列表可搜索事实，默认收货/收货地址属于履约事实，两者不能混用。邮箱可以在详情保留但不进入当前列表联系方式投影；物料搜索读取明确的业务属性、批次效期和质量规则，不读取已清理的通用摘要。
- `DepartmentMaster.parentDepartment` 只能引用同一公司的其他有效部门，且不能引用自身或任何下级。候选接口按公司过滤；保存命令仍需独立验证目标存在、同公司和无循环，不能把客户端候选过滤当作唯一门禁。
- `ReferenceOptionProjection` 是即时读模型，按对象从明确字段组合：计量单位使用单位和英文简称，员工使用部门、岗位、手机/邮箱及账号投影，部门使用公司和上级/说明，公司、资产和产线各自使用身份字段。主、副、元信息之间不得机械重复，也不得把空值渲染成无意义短横线。
- 候选摘要不属于主档持久化合同。任何 `primary / secondary / meta` 展示文本都只能在读取时生成，保存命令必须继续丢弃客户端伪造的组合摘要。

## 118. 基础资料命令校验、稳定引用与关系保留合同（2026-07-24）

- `MasterDataWriteCommand` 的权威校验位于服务端。创建与修改必须重新验证对象必填项、状态值域、格式、唯一性、数值范围和引用存在性；前端校验是同口径的用户反馈层，不能使直接 API 写入获得更宽松的合同。
- 客户、供应商和仓库名称按标准化文本唯一；税务身份按适用主体唯一。邮箱允许为空，非空时必须满足基础邮箱格式；付款期限、供货周期和库位数量是非负整数，信用额度及库存阈值是非负数。
- `MaterialMaster.category` 参与物料编码身份，`MaterialMaster.uom` 决定全部库存和历史单据数量语义。已有物料不可原位改变这两个字段；变更通过新建主档、停用旧主档和保留历史快照完成。
- `EmployeeMaster`、`EquipmentRecord` 和 `ProductionLineRecord` 使用 `departmentCode` 保存稳定部门引用，并可同时返回当前 `owner` 名称作为显示投影。启用对象必须引用存在且启用的部门；同名部门不得仅凭名称建立不确定关系。
- `MaterialSupplierRelation` 和 `WarehouseMaterialRelation` 是可停用但不可通过省略物理删除的历史业务关系。更新命令必须包含既有关系，若不再使用则将其状态改为停用；停用物料或不具备可采购属性的物料不得形成新的启用供货关系。
- 当前供应商、仓库页面的主档与关系分别提交。若主档命令成功而关系命令失败，客户端必须保留已返回的主档编码和未保存关系草稿，并以部分成功事实提示用户；后续重试使用该编码执行修改，禁止再次创建主档。

## 119. 主档停用级联、当前名称投影与乐观并发合同（2026-07-24）

- `WarehouseMaster.type` 是业务能力定义，`WarehouseMaster.company` 是库存责任主体。两者在主档创建后不可原位修改；仓库名称可以修改，但编码保持稳定，当前物料默认仓库、补货关系和库存读模型必须同步使用新名称。
- `MaterialMaster` 或 `WarehouseMaster` 存在非零物理库存、占用、冻结、待入库、在途或计划数量时，停用命令必须拒绝。仓库仍被启用物料作为常用仓库引用时同样不得停用。
- 物料、供应商或仓库成功停用后，所属 `MaterialSupplierRelation` 与 `WarehouseMaterialRelation` 原记录保留并统一变为停用；默认供应商标记同时取消。重新启用主档不自动重新启用关系。
- 关系对象以 `supplierCode / materialCode / warehouseCode` 为身份，名称和单位是当前读模型投影。主档改名后，关系及当前库存事实读取新名称；历史采购、生产、库存流水和单据快照仍保留形成时名称，不被当前主档改名反写。
- 每个主档维护正整数 `revision`。创建从 1 开始，每次成功修改加 1；修改命令携带读取时版本，版本缺失或与当前版本不一致时返回 HTTP 409。校验失败和版本冲突都不得写入主档或关系。
- 停用判断必须使用标准化后的状态枚举，不能使用未清理的原始字符串参与引用门禁。停用父对象下的新关系只能保存为停用，任何启用关系写入都必须拒绝。

## 120. 主档编辑版本传递与查询投影对齐合同（2026-07-24）

- `MasterDataEditDraft.revision` 是不可见并发令牌。六类共用编辑页和四类独立编辑页都必须从 `MasterDataRecord` 复制该值，修改成功后替换为服务端返回的新值；不得在字段裁剪、分组或表单映射时丢失。
- `UpdateMasterDataCommand` 的处理顺序为：解析目标身份、确认记录存在、比较 `revision`、执行对象校验、更新当前名称投影并持久化。版本冲突优先于载荷字段错误返回，且冲突命令不能写主档或关系。
- `DepartmentListProjection.company` 读取部门的当前 `owner` 公司名称。搜索和公司筛选使用该投影，不能读取不存在的 `row.company`；详情、移动卡片和 CSV 继续使用同一公司事实。
- `UomDefinitionLock` 由全部物料引用决定，保护单位名称和历史数量语义。`UomStatusLock` 只由启用物料引用决定；仅有停用物料引用时允许停用单位，但历史物料与历史单据仍保留原单位文本。
- 前端禁用状态是服务端门禁的可解释投影，不是新的业务事实。引用数据加载失败时不得放宽服务端规则；服务端边界烟测分别覆盖启用引用阻断和仅停用引用允许两种场景。

## 121. 主档异步读取身份与候选查询时序合同（2026-07-24）

- `MasterPageLoadIdentity` 由页面类型、路由编码、编辑模式和递增客户端请求号组成。主档记录、关系集合、错误信息和加载完成状态只能由当前身份的请求更新；过期响应被忽略，不生成业务事实。
- 物料读取同时获取主档、供应商关系和仓库补货关系；供应商与仓库读取同时获取主档及各自关系。这些并行结果共享一个页面请求号，不能把不同路由时刻的结果拼成同一页面。
- 六类共用编辑页的关联候选加载与主档读取共享请求身份。员工账号、部门层级、公司引用、资产/产线部门和计量单位物料引用只服务当前路由；旧页面完成的关联请求不能改变新页面门禁。
- `EquipmentSourcePrefillIdentity` 在页面身份上增加 `sourceOrder`。来源采购查询参数改变或新建页刷新时重新读取对应采购事实；响应只在请求身份仍匹配时写入资产草稿。
- `ReferencePickerQueryIdentity` 由选择器实例请求号、引用类型、关键词、启用范围、业务类型和公司条件组成。关闭窗口、组件卸载或发起新查询都会使旧身份失效；过期结果和错误都不得覆盖当前候选。
- 页面请求号、加载状态和丢弃旧响应属于客户端一致性机制，不持久化到主档、关系、单据或审计日志，也不替代服务端权限、版本和引用校验。

## 122. 主档能力与关系有效性联动合同（2026-07-24）

- `MaterialSupplierRelation.status = 启用` 的必要条件包括：物料启用且 `isPurchasable = true`、供应商启用且供应商类型支持物料供货。任一条件失效时关系保留并转为停用，`isDefault` 同时改为 `false`。
- 当前不支持物料供货关系的供应商类型为设备供应商和物流服务。主档类型变更、关系保存接口和旧数据归一化使用同一判定；前端隐藏关系区不能代替服务端门禁。
- `WarehouseMaterialRelation.status = 启用` 的必要条件包括：仓库启用且仓库职能支持正常补货、物料启用。承担受控暂存职能的暂存仓和隔离仓不支持正常补货关系；它们的数量变化来自收货、质检、冻结、放行、隔离或处置事件。
- 能力失效只停用关系，不删除供应商料号、阈值、周期和历史关联。能力重新恢复后仍需人工确认并重新启用，避免旧参数未经复核重新参与采购候选或库存预警。
- 公司 `secondary` 当前承载默认税率，创建和修改均为必填，规范化为 0%—100% 的百分比文本。字段必填标识、前端校验和服务端写入合同保持一致。

## 123. 主档缺省展示与有效反向关系投影合同（2026-07-24）

- `MasterListDisplayValue` 对 `null`、`undefined`、空字符串和纯空白字符串使用同一缺省判定，并统一投影为全角破折号 `—`。该符号只存在于读模型，不成为主档字段值。
- `MaterialActiveSupplierProjection` 只包含 `MaterialSupplierRelation.status = 启用` 的关系；`MaterialActiveReplenishmentProjection` 只包含 `WarehouseMaterialRelation.status = 启用` 的关系。物料详情消费这两个有效投影，不消费完整历史集合。
- 供应商和仓库维护页可以读取停用关系用于历史追溯及人工重新启用；物料反向只读页没有关系维护职责，因此不能把停用关系混入当前采购来源或库存预警解释。
- `MasterListUpdatedAtRange` 由可选起始日期和结束日期组成。两端同时存在时必须满足 `dateStart <= dateEnd`；倒置范围属于无效查询条件，不生成新的列表筛选状态。

## 124. 有效关系枚举与资料完整性投影合同（2026-07-24）

- `EnabledMasterRelation` 只由 `status = 启用` 形成。`status` 缺失、为空、为未知枚举或为停用的关系都不是当前有效关系；客户端和服务端不得再以 `status != 停用` 推断有效。
- 旧数据归一化遇到非显式启用关系时保留原关系身份和业务参数，但把状态收口为停用；物料—供应商关系同时取消 `isDefault`。归一化不自动恢复关系，也不生成采购、补货或通知事实。
- `MaterialActiveSupplierProjection`、`MaterialActiveReplenishmentProjection`、采购供应商候选和库存预警只消费 `EnabledMasterRelation`。供应商和仓库维护页仍可读取完整历史集合，以支持追溯和人工复核后重新启用。
- `SupplierProfileCompleteness.materialSupply` 为真，当且仅当该供应商类型支持物料关系且至少存在一条显式启用的物料—供应商关系。停用历史行不代表新采购所需配置已经完成。
- 基础资料第十轮结束后，十类主档的字段、引用、状态、并发、异步读取、能力联动、缺省展示和有效关系判断共同组成基础资料稳定基线；后续模块必须引用这些事实，不得复制一套宽松状态判断。

## 125. 报价人身份、销售物料候选与确认门禁合同（2026-07-24）

- `SalesQuoteQuotePerson` 保存 `ownerEmployeeCode / owner / ownerAccountCode`。新建时默认当前登录账号对应员工；未冻结报价可从启用员工候选改选，服务端按员工编码重建名称，并仅在该员工真实关联账号时派生账号编码。历史报价只有显示名称时继续兼容读取，不反向伪造员工或账号编码。
- `SalesQuoteFlowRecord.actor` 读取执行当前命令的登录账号，不读取报价人快照。报价人回答“谁形成这份报价”，操作人回答“谁执行这次保存、确认、作废或转单”，两个事实不能合并。
- `SalesQuoteMaterialReference` 只包含 `EnabledMasterRelation` 语义下启用且 `isSaleable = true` 的物料；未显式维护能力的兼容数据仅在分类或类型为成品时视为可销售。候选查询枚举固定为 `销售`，显示名“销售物料”不是筛选值。
- `SalesQuoteLineSnapshot` 以物料编码为身份，名称、型号、规格和基础单位由保存时主档生成；`unitPrice` 是按该行 `priceInputMode` 解释的用户输入，`taxRate` 是逐行事实，另一种单价与未税/含税金额均由服务端计算。客户端提交的物料名称、单位、派生单价、税额、行金额和总金额不是权威事实。
- `ConfirmSalesQuoteCommand` 要求主体、启用客户、联系资料、报价日期、有效期、商务条款和所有明细完整；所有物料必须存在、启用且可销售，数量与单价大于零、逐行税率有效，物料身份在单内唯一。有效期早于报价日期或当前日期时拒绝确认。
- 草稿不完整不代表非法业务事实，允许保存以便继续编制；确认门禁才把完整性升级为强约束。前端校验仅是该命令合同的交互投影，服务端必须独立复核。

## 126. 销售订单责任、来源与确认合同（2026-07-24）

- `SalesOrderOwnerSnapshot` 保存按单指定的销售负责人显示名称。新建直接订单的缺省值来自当前登录账号，后续可从启用员工候选调整；它是交付跟进责任，不是命令审计身份。
- `SalesOrderActionActor` 由每次请求的当前登录账号生成，写入保存、确认、签收、作废及来源关系变更日志。任何客户端 `owner` 值都不能替代实际操作人。
- `SalesOrderMaterialReference` 使用 `kind = 销售`，只投影启用可销售物料。订单保存以稳定物料编码重建名称、型号、规格和基础单位，以客户编码重建客户名称；联系人、收货人、收货电话、收货地址、单价和条款继续作为本单业务快照。
- `SalesOrderLine.amount = quantity × unitPrice`，`SalesOrder.amount = sum(line.amount)`，由服务端重算。客户端提交的金额、生命周期、单据状态和 `fulfillmentLinks` 均不进入权威事实。
- `SalesOrderConfirmCommand` 要求全部订单行完整且物料身份唯一，数量、单价大于零，并验证公司、客户、销售负责人和物料存在且启用，物料具备销售用途。日期序列固定满足 `orderDate ≤ plannedShipDate ≤ deliveryDate`；草稿保存不等于确认通过。
- `SalesQuoteOrderConversionRelation` 继续由 `quote.code -> order.sourceQuote` 与 `quote.convertedOrderCode` 双向表达。候选只包含已确认未过期报价；同一报价不能被另一张有效订单重复承接。订单切换来源时，旧报价恢复已确认，新报价转为已转订单，三方写入和日志属于同一命令边界。
- `SalesOrderPriority` 只允许正常或加急，是人工协调用的紧急程度，不参与生命周期、交付风险、库存承诺或生产进度计算。
- `SalesOrderPdfPreviewAction` 是详情输出动作，不是新的 PDF 业务实体。当前动作打开独立受保护路由 `/sales/orders/:code/pdf`，实体打印和保存 PDF 仍由用户在预览中选择；中文模板只读取订单冻结快照，英文模板不在当前计划内。
- `SalesOrderSupplySummary` 是需求分配事实的简化读取，不是新的库存或生产记录。对每条订单行计算 `remainingQty = max(0, orderQty - shippedQty)`，再计算 `reservedCoverageQty = min(remainingQty, activeReservedQty)`、`productionCoverageQty = min(max(0, remainingQty - reservedCoverageQty), activeProductionQty)` 和 `uncoveredQty = max(0, remainingQty - reservedCoverageQty - productionCoverageQty)`。
- 页面把上述四项依次显示为订单待发、库存预留、需生产和未覆盖。状态只允许待确认数量、未覆盖、部分覆盖、已覆盖、已发完；“已覆盖”仅表示待发数量已有库存预留或生产需求来源，不等于已经排产、生产完工、质检合格、入库、出库或签收。
- 公共库存、可再预留、待检、待入库、在途、仓库分布、生产阶段和来源单据仍保留在各自权威记录中，不进入 `SalesOrderSupplySummary`。侧栏精简不能删除底层 `fulfillmentLinks`、库存预留或结构化生产进度，也不能改变交付追踪的计算。

## 127. 销售订单跟进投影与内部交接合同（2026-07-24）

- `SalesOrderDetailSection` 只有 `content / delivery` 两个技术展示视图，不是两个业务实体。用户界面统一命名为“订单内容 / 订单跟进”；`content` 读取订单头、明细、金额、商务条款、财务摘要和附件，`delivery` 继续作为兼容路由值，读取同一订单的发货及收货要求、`SalesOrderSupplySummary`、生产/交付/开票/收款进度、销售出库记录及签收结果。
- `SalesOrderDeliveryProjection` 以 `SalesOrder.code` 为唯一页面身份。销售订单列表的进度入口定位到 `/sales/orders/:code/delivery`，主行仍定位到 `/sales/orders/:code`；页面切换不能复制订单、生成新单号或改变任何业务状态。
- `ShipmentHandoff` 继续使用现有交付交接记录保存内部编码、来源订单、来源行、发货要求、仓库受理状态和出库额度。它是一对一的跨角色交接及仓库来源合同，不是销售侧菜单单据；销售订单确认或发货要求同步时自动生成或更新，销售不能手工新建第二条有效交接。
- `SalesOrderDeliveryProjection.salesIssues` 读取全部来源订单相同的销售出库记录并保留已作废/冲销状态供识别；有效出库数量只统计未作废且未冲销记录。页面不得把销售出库状态改写为订单字段，也不得向销售角色暴露仓库确认、冲销或批次操作。
- `SalesOrderDeliveryFilter` 是订单跟进列表读模型，同时接受“提醒 ·”“单据 ·”“生产 ·”“交付 ·”“开票 ·”“收款 ·”六类前缀值；同一类只呈现当前数据中实际存在的值，提醒优先排列，多选按任一命中。筛选不改变交付交接、仓库出库、财务或订单状态。
- 旧 `/sales/outbound-requests` 接口、内部编码及仓库来源选择继续兼容现有流程；销售导航删除独立入口不等于删除内部事实。未来迁移必须保证仓库来源行唯一性、累计出库上限、受理锁定、通知和签收判定均有等价承接。
- `SalesOrderSupplySummary.coveredQty = reservedCoverageQty + productionCoverageQty`，`uncoveredQty = max(0, remainingQty - coveredQty)`。`productionCoverageQty` 的界面字段名必须是“需生产”，不能叫“生产安排”；结构化生产进度仍单独决定待安排、生产中、待质检和已入库等执行状态。
- `SalesOrderDeliveryProjection.shippingRequirements` 只保留一个展示位置，并与 `SalesOrder` 的录入快照逐项同源：`logisticsMode / plannedShipDate / shipContact / shipPhone / shipAddress / internalRemark`。它不能从 `deliveryMethod / contact / contactPhone` 回退取值，也不能在读取时改写 `internalRemark` 原文。
- `SalesOrderDeliveryProjection.shippingWarehouse` 是执行投影，不是销售订单录入字段。有有效销售出库记录时取未作废、未冲销记录的仓库去重集合；尚未出库时读取 `ShipmentHandoff.warehouse`，两者均不存在时显示待仓库确认。该字段放在交付概览和出库记录，不得混入“内部发货要求”制造可编辑错觉。
- `SalesOrderShippingRequirementDefault` 只允许从客户主档的默认收货人、默认收货电话、默认收货地址和默认物流方式带入；公司联系人与公司联系电话属于客户公司信息，不能作为缺失收货资料的服务端或页面兜底。订单确认继续要求收货资料完整。
- `SalesOrderDeliveryProjection.nextAttention` 的优先级为作废终止 > 售后/退货异常 > 普通关闭 > 生产、交付、开票和收款待办。订单关闭不能掩盖仍在处理的退货、退款或补发事项；此时销售订单保持只读，实际处理入口仍是销售售后。
- 已发完订单行的 `remainingQty / reservedCoverageQty / productionCoverageQty / uncoveredQty` 可以保留为底层零值，但销售页面只显示“本行已全部出库”，避免四个零值制造无意义噪声。
- `SalesOrderListPresentation` 在可用宽度足够时使用表格，主行进入订单内容、固定跟进列进入订单跟进；中等宽度不足以完整展示关键身份时切换为双列卡片，每张卡片必须保留两个独立可访问入口，更窄时降为单列。响应式变化只能改变呈现，不能合并两个入口或省略跟进事实。
- `SalesOrderDetailPerspectiveNavigation` 只包含 `content / delivery` 两个等权链接，界面文字固定为“订单内容 / 订单跟进”。导航不承载单据状态、交付状态、图标或范围说明；当前链接以黑底白字和 `aria-current = page` 标记，移动端不能删除任一入口或改变路由。

## 129. 国际化主档、币种引用与通用联系方式合同（2026-07-25）

```ts
type CurrencyMaster = {
  code: string             // 三位大写稳定代码
  name: string
  symbol: string
  decimalPlaces: 0 | 1 | 2 | 3 | 4
  status: '启用' | '停用'
  note?: string
}
```

- `MaterialMaster.englishName / englishModel / englishSpec` 均为可选，不参与物料身份和业务能力，当前也不进入报价、订单或 PDF 快照。缺失不产生业务提示或门禁。
- `EmployeeMaster.englishName` 与 `CompanyMaster.englishName / englishAddress` 均为可选主档资料，当前没有销售单据或 PDF 消费者。
- `CurrencyMaster.code` 是币种稳定身份；当前初始资料只包含 `CNY`。客户、供应商和报价单都引用启用币种主档，报价保存稳定三位币种代码；新增币种主档只扩展候选，不等于订单、发货、财务和 PDF 已自动完成多币种改造。
- `CurrencyMaster` 不保存英文名称。三位大写代码已经是跨语言稳定标识。
- `CustomerMaster.phone / SupplierMaster.phone / SalesQuote.contactPhone / SalesOrder.contactPhone / PurchaseOrder.contactPhone` 暂保留兼容键名，但统一解释为通用联系方式文本，不做电话号码格式校验。
- `defaultShipPhone / shipPhone / receivingPhone / invoicePhone` 等字段仍是电话或执行联系事实，不能用通用公司联系方式自动兜底。
- 系统业务字典不属于本轮对象。未来系统模块只能把明确批准的候选项开放配置，不能让字典配置改写稳定代码、历史快照或确认门禁。

## 131. 外贸暂缓后的报价与英文主档边界（2026-07-25）

- `SalesQuote` 当前没有 `tradeType / incoterm / incotermVersion / incotermLocation / destinationCountry / transportMode / documentLanguage`。`currency` 已恢复为独立结算币种代码，不携带内外贸语义；读取兼容层、创建命令和修改命令继续清理其他旧外贸字段。
- `SalesQuoteTerms` 只包含 `deliveryMethod / freightPayer / paymentMethod / remark`；`priceInputMode` 与 `taxRate` 都是逐行价税事实，不属于商务条款或条款模板。报价级 `taxMode` 只作旧数据迁移后备，不是当前界面字段。
- `SalesQuoteLineSnapshot` 冻结物料编码、中文名称、型号、规格、基础单位、数量、输入单价、逐行税率、未税/含税单价与金额，不保存物料英文名称、英文型号或英文规格。主档英文资料变化不影响历史报价。
- `SalesQuotePdfPreviewAction` 与 `SalesOrderPdfPreviewAction` 均已进入各自的专用中文 A4 预览。两者都没有语言参数、英文资料检查或英文模板选择。
- `SalesQuoteQuotePerson` 与 `SalesOrderOwnerSnapshot` 仍以当前账号对应员工为新建默认值，并在单据允许编辑时可改选启用员工；责任人不等于实际命令操作人。
- 未来若重新启动外贸设计，必须作为新的完整业务方案重新评审报价、订单、发货、财务和打印合同；不得依赖本轮已经撤回的字段、组件或接口。
- 二次复核已检查实际持久化数据、接口投影、前端源码与生产构建产物：旧字段没有进入数据和界面，服务端出现这些字段名仅用于读取兼容、命令丢弃与防回流测试。

## 132. 物料英文型号、状态说明与主档空值投影（2026-07-25）

- `MaterialMaster.englishModel?: string` 与英文名称、英文规格一样由物料主档保存、搜索和导出，不进入报价或订单冻结快照；服务端保存时去除首尾空格。
- `MaterialBasicFactOrder` 固定为 `code -> category -> name -> model -> spec -> uom -> englishName -> englishModel -> englishSpec -> status`。字段显示名称仍沿用“基础单位”等已有准确语义，顺序约束不重命名字段。
- `MasterStatusField` 是卡片最后一个输入字段；`MasterFieldNotes` 是输入网格后的独立整行读模型，承载停用影响和锁定说明，不参与输入控件的网格行高计算。
- `MasterEmptyDisplay` 固定为 `—`。它只用于列表、详情与移动卡片的空值投影；空字符串仍是持久化事实，表单 placeholder、真实状态“未分配/未填写”和整块空状态不应被机械替换。

## 133. 报价单逐行税额与双单价联动合同（2026-07-25）

- `SalesQuoteLine.priceInputMode = 含税 | 不含税`，只回答该行 `unitPrice` 最后由哪一种单价输入产生。它是服务端重算另一种单价所需的内部事实，不投影为用户可见切换控件，也不是商务条款、发票状态或“是否开票”选择。
- `SalesQuoteLineDualPriceProjection` 固定按“未税单价 -> 税率 -> 含税单价”显示。两种单价都可编辑；编辑其中一列时将该列数值写入 `unitPrice`，同步更新行级 `priceInputMode`，另一列由税率即时换算。
- `SalesQuoteLineTaxRate = 13% | 9% | 6% | 3% | 1% | 0% | 免税`，归属每一条报价物料。`0%` 与“免税”的计算税率都为零，但枚举语义必须分别保存；一张报价可包含不同税率。报价级兼容字段 `taxRate` 仅在全部行一致时返回该值，多种税率返回 `多税率`，不得用它反向覆盖行税率。
- 令数量为 `q`、输入单价为 `p`、税率小数为 `r`。未税输入时：`netUnitPrice = p`、`grossUnitPrice = p × (1 + r)`；含税输入时：`grossUnitPrice = p`、`netUnitPrice = p ÷ (1 + r)`。
- 每行计算 `netAmount = round2(q × netUnitPrice)`、`grossAmount = round2(q × grossUnitPrice)`、`taxAmount = round2(grossAmount - netAmount)`；整单三个合计分别对可见行的未税金额、税额和含税金额求和。兼容 `line.amount` 与 `quote.amount` 等于含税金额/含税总计，即客户按报价应付的最终金额。
- `SalesQuoteCurrencyPrecision` 把货币金额精度与单价换算精度分开：CNY 行金额、税额和合计固定为两位；用户直接输入的行单价在失焦、读取和提交时投影为两位；`netUnitPrice / grossUnitPrice` 的自动换算保留未截断精度，能精确落到分时显示两位，否则最多显示四位并保留为转单与复算依据。
- 舍入边界固定在行金额：先分别得到并 `round2` 未税金额与含税金额，再用两者之差得到行税额；整单汇总只求和已经舍入的行金额。不得先把反算单价截为两位后再乘数量，也不得从整单含税总计重新分摊各行税额。
- `EditSalesQuoteNetUnitPriceProjection` 与 `EditSalesQuoteGrossUnitPriceProjection` 分别把行级输入来源设为不含税或含税，并重算另一种单价；后续修改税率时继续以最后输入来源为基准，避免双向连续换算造成价格漂移。换算单价最多保留四位小数，金额按行保留两位。
- `NormalizeSalesQuoteCommand` 只信任物料编码、数量、输入单价、行级输入来源与逐行税率，重新生成另一种单价和全部金额字段。前端相同计算仅用于即时反馈，不能替代服务端权威计算。
- `LegacySalesQuoteTaxMigration` 对仅有报价级输入口径或税率的旧数据把其下沉到各行，并补算未税/含税事实；非法或缺省税率使用当前国内兼容默认 `13%`。报价级 `taxMode` 只作为兼容后备，不得继续展示为可编辑字段。
- `ConvertSalesQuoteToOrderCommand` 保留报价行 `unitPrice / priceInputMode / taxRate` 作为原始计价输入，同时携带 `netUnitPrice / grossUnitPrice / netAmount / taxAmount / grossAmount` 派生快照；订单规范化命令按同一公式重算。不得只复制含税单价并继续保留“不含税”输入来源，也不得丢失行税率。

## 134. 报价币种、草稿保存与确认命令合同（2026-07-25）

- `SalesQuote.currency` 保存启用 `CurrencyMaster.code`。新建默认 `CNY`，页面候选读取全部启用币种并保留当前历史值；创建、修改和确认命令都拒绝不存在或已停用的币种。该字段是结算币种，不推导内外贸、模板语言或贸易术语。
- `SaveSalesQuoteDraftCommand` 在草稿状态对应界面动作“保存草稿”。已确认报价发生内容修改时，界面动作仍叫“保存变更”，命令把生命周期退回草稿并要求重新确认；“保存”不得作为草稿按钮的孤立标签。
- `ConfirmSalesQuoteIntent` 是用户对生命周期变化的一次明确确认：客户端先完成字段校验，再提示“先保存当前内容并确认报价”；用户同意后依次执行保存与确认命令。该提示不是未保存离页保护。
- `ConfirmSalesQuoteNavigationProjection` 在确认接口成功、已确认快照写入草稿状态源后立即重置未保存基线，再切换到详情路由。路由守卫只能拦截真实未保存编辑，不能拦截命令成功产生的状态更新。

## 135. 报价单中文 PDF 读取与分页合同（2026-07-25）

- `SalesQuoteCompanyPrintSnapshot = { name, address, email, website }`。创建报价时服务端按 `companyCode` 读取公司主档生成快照；同一公司下修改报价继续保留已有快照，旧报价缺失时在兼容迁移中补齐。客户端提交或篡改该对象不构成权威输入。
- `SalesQuotePdfHeaderProjection` 左侧读取公司打印快照与共用 Filatrix Logo / 标语，右侧只读取 `quote.code / customer / date / validUntil`。联系人、报价人、英文公司资料和员工英文名不属于报价 PDF 页眉。
- `SalesQuotePdfLineProjection` 对每条 `SalesQuoteLineSnapshot` 只投影 `name / model / spec / quantity / uom / grossUnitPrice / grossAmount`。名称、型号和规格属于三个独立展示层级：名称为主要字重，型号为等宽中等字重，规格为较浅的小一级正文；物料编码、图片、税率、未税单价、未税金额和英文物料资料不得进入该投影。
- `SalesQuotePdfTotalProjection = quote.amount = sum(line.grossAmount)`，显示名称固定为“含税总计”，币种代码紧随标签且采用相同文字颜色，不再占用明细标题右侧。PDF 不重新计算或改变价税事实，也不显示税额分解；币种代码读取 `quote.currency`，金额符号和小数位读取对应币种主档，当前 CNY 为两位。
- `SalesQuotePdfTermsProjection = deliveryMethod / freightPayer / paymentMethod / remark`。前三项横向展示并允许自然换行，不得用省略号截断；`remark` 的对外名称为“补充条款”且必须完整输出。内部流程备注不存在自动替换、翻译或过滤规则，录入端必须保证补充条款本身可对客。
- `SalesQuotePdfPageProjection` 是确定性读模型：纸张上边距、品牌 Logo、页眉事实、区块间距、表头、商品行、汇总和条款密度与销售订单共用同一套紧凑尺度，但不缩小关键字号；含条款末页的商品容量按补充条款估算行数从六条递减，普通商品续页最多九条。超长条款路径把最后商品页限制为最多六项，先把含税总计、三项商务摘要和首段补充条款投影到该页安全空间，剩余正文再分配到独立续页；续页标签保持补充条款的次级字号。每页重复页眉和页脚，页脚保存报价单号及 `currentPage / totalPages`，任何分页都不得截断商品或条款文本。
- `SalesQuotePdfTemplateProjection = { id, language, label }` 是仅用于预览与打印的表现层目录。当前目录只启用标准中文报价单，`label = CompanyMaster.primary + " 中文报价单"`；候选必须与 `SalesQuote.companyCode` 匹配。选择模板不写回报价、不切换公司、不产生流转记录，也不表示英文模板已经存在。
- `SalesQuotePdfPreviewAction` 从报价详情打开独立受保护路由 `/sales/quotes/:code/pdf`。预览拥有独立双向滚动边界，多页连续展示，并提供上一页 / 下一页定位；不得依赖全局 `body` 滚动而截断 A4 纸张。预览工具栏不属于打印内容；打印和另存 PDF 继续由浏览器原生打印窗口执行。该动作不创建新的业务实体，不修改报价状态，也不写流转日志。
- 当前共用 Logo 是原型级品牌资源，不是公司主档事实。多公司 Logo 属于后续模型扩展；在建立 `CompanyLogoAsset` 及其快照边界前，不得根据公司名称硬编码多个 Logo。

## 136. 销售订单逐行价税、币种与下游消费合同（2026-07-25）

- `SalesOrder.currency` 保存启用 `CurrencyMaster.code`，新建默认 `CNY`，来源报价存在时继承报价币种。保存和确认均由服务端归一化并校验启用状态；币种不推导内外贸或模板语言。
- `SalesOrderLine.priceInputMode / unitPrice / taxRate` 与报价行含义相同：`unitPrice` 是最后直接录入的单价，`priceInputMode` 标识含税或不含税来源，`taxRate` 必须属于 `13% / 9% / 6% / 3% / 1% / 0% / 免税`。两种单价同时可见，输入其中一种只重算另一种。
- `NormalizeSalesOrderPricingCommand` 对每行生成 `netUnitPrice / grossUnitPrice / netAmount / taxAmount / grossAmount`，舍入边界与报价一致；`line.amount = grossAmount`，`order.netAmount = sum(line.netAmount)`，`order.taxAmount = sum(line.taxAmount)`，`order.amount = sum(line.grossAmount)`。
- 客户端提交的派生单价、金额、税额和整单合计不是权威输入。服务端必须结合物料主档重建名称、型号、规格、基础单位，再使用数量、原始输入单价、行输入来源和行税率重算；已有履约链接只能从历史订单保留，不能由保存载荷制造。
- `SalesOrder.taxRate` 是兼容摘要，单一税率时返回该值，多税率时返回“多税率”；`SalesOrder.taxMode = 含税` 是下游兼容投影，只声明 `amount` 为含税最终金额，不代表订单仍有整单计价口径。
- `SalesOrderTerms = delivery / deliveryMethod / freightPayer / paymentMethod / remark`。整单计价口径和整单税率不属于商务条款或条款模板；模板套用不能修改任何订单行价税事实。
- `SalesOrderTermsDetailProjection` 只把 `delivery / deliveryMethod / freightPayer / paymentMethod` 投影为四个完整事实单元，`remark` 作为独立补充条款正文。展示网格不得制造没有对应事实的灰色占位单元；四项缺省值统一投影为 `—`，不写回订单。
- `LegacySalesOrderTaxMigration` 使用历史行输入来源优先，其次使用旧订单 `taxMode / taxRate` 作为逐行后备，并补齐币种和价税派生字段。迁移必须幂等，重复读取不能把原始未税输入改成含税输入。
- `SalesInvoiceOrderLineProjection` 固定读取订单行 `grossUnitPrice / grossAmount / taxRate`；可开票金额和销售价格参考同样读取含税事实。订单行由未税单价录入时，财务不得再次按订单级口径加税。
- `SalesOrderDraftActionLabel` 在草稿状态为“保存草稿”，已确认订单编辑为“保存变更”；它与 `ConfirmSalesOrderCommand` 是不同动作。

## 137. 销售订单中文 PDF 对客投影与快照合同（2026-07-25）

```ts
type SalesOrderCompanyPrintSnapshot = {
  name: string
  address: string
  email: string
  website: string
}

type SalesOrderSupplierPrintSnapshot = {
  contact: string
  phone: string
}

type SalesOrderCustomerPrintSnapshot = {
  name: string
  address: string
  contact: string
  phone: string
}
```

- `SalesOrder.companyPrintSnapshot` 在订单保存时由服务端根据 `companyCode` 生成，冻结公司中文名称、中文经营地址、邮箱和官网。`SalesOrder.supplierPrintSnapshot` 根据 `ownerEmployeeCode` 生成，只冻结销售负责人姓名和员工手机号；历史 `contactInfo` 在读取迁移时转换为 `phone` 后移除。
- `SalesOrder.customerPrintSnapshot` 根据 `customerCode` 与本单联系人生成，冻结客户公司名称、公司联系地址、联系人和联系方式。国内公司地址由客户主档的省、市和详细地址组成；不得读取或回退到 `defaultShipAddress / shipAddress`。
- 三类打印快照都是服务端事实。创建和更新命令忽略客户端伪造值；所属公司、负责人或客户发生变化时生成相应新快照，同一主体下继续保存则保留已有地址快照，避免主档变化改写历史订单。旧订单按现有公司、负责人、客户及本单联系人补齐快照。
- `SalesOrderPdfPartyProjection.supplier = { role: '供方', companyName: companyPrintSnapshot.name, companyAddress: companyPrintSnapshot.address, contact: supplierPrintSnapshot.contact, phone: supplierPrintSnapshot.phone }`。
- `SalesOrderPdfPartyProjection.customer = { role: '需方', companyName: customerPrintSnapshot.name, companyAddress: customerPrintSnapshot.address, contact: customerPrintSnapshot.contact, phone: customerPrintSnapshot.phone }`。需方读取订单冻结的公司联系资料，不读取客户主档当前值。
- `shipContact / shipPhone / shipAddress` 属于 `SalesOrderShippingRequirementSnapshot`，不是客户主体联系事实，不进入销售订单 PDF。“供需双方”不得从收货资料回退，也不得在公司联系方式缺失时混用；两侧联系方式投影均只输出手机号，不输出邮箱。
- `SalesOrderPdfLineProjection` 与报价 PDF 同构，只输出 `name / model / spec / qty / uom / grossUnitPrice / grossAmount`；不输出 `materialCode / taxRate / netUnitPrice / netAmount / taxAmount`。`SalesOrderPdfTotalProjection = order.amount`，标签固定为“含税总计”，币种代码紧随标签并采用相同文字颜色，不再占用明细标题右侧。
- `SalesOrderPdfLineIdentityPresentation` 不新增业务字段，只为同一行快照建立名称、型号、规格三级表现：名称最强，型号以中等字重和等宽字识别，规格使用次级正文色。三项仍读取原始行快照并完整换行，不拼接、不截断，也不把表现样式写回订单。
- `SalesOrderPdfTermsProjection` 只输出 `delivery / deliveryMethod / freightPayer / paymentMethod / remark`。`plannedShipDate / logisticsMode / ship* / internalRemark / sourceQuote / fulfillmentLinks / progressFacts` 均为内部执行或来源事实，不进入对客模板。
- 商务条款摘要值允许自然换行，不得以省略号截断较长的交付方式、运费承担或付款方式；换行后的实际高度仍必须落在页脚安全区之上。
- `SalesOrderPdfSignatureProjection` 只在最终页出现，左侧标题为“供方（签章）”，右侧标题为“需方（签章）”；每侧“日期”与签章标题同排并使用仅够手写 `2026.07.26` 的短横线，下方保留签章留白。不投影公司名称或授权代表。该投影不保存签署结果；未来若需要电子签署，应建立独立签署实体，不得把图片或签名结果回写打印模板快照。
- `SalesOrderPdfPreviewAction` 打开 `/sales/orders/:code/pdf`，不改变订单状态、不写流转记录。模板选择是输出表现，不回写订单。打印介质隐藏预览工具栏，浏览器原生打印窗口负责实体打印或另存 PDF。
- 分页以 A4 固定高度预先分组：补充条款估算 1–2 / 3–5 / 6–8 / 9–10 行时，最终页商品容量分别为 5 / 4 / 3 / 2 项；首个纯商品页最多 7 项，普通续页最多 9 项。超过 10 行的长条款进入独立续页，签章只在最后一页。每页页脚读取冻结公司名称、订单号和页码。
- 长条款进入续页时，最后商品页可以在页脚安全区内消费 `SalesOrderPdfTermsProjection` 的四项摘要及第一段补充条款，剩余文本继续分页；续页标签属于补充条款次级标题，不提升为章节标题。这只是分页投影，不改变条款内容或顺序。非最终页不计算、渲染或预留 `SalesOrderPdfSignatureProjection`；最终页只渲染固定高度的签章投影，签章留白和中间分隔线不得伸展消费组件之后的剩余纸张高度。
- 2026-07-26 压力测试使用 12 条商品和 18 条长补充条款（约 1457 字符）生成 4 页：前两页各 6 条商品，后两页承载完整条款，签章只落在第 4 页。逐页边界检测确认所有内容均位于页脚安全区之上；测试同时暴露并修复了长付款方式被省略号截断的问题。
- 长期回归样本 `SO-PDF-STRESS-001` 冻结 `CUS-PDF-STRESS-LONG` 的超长公司名称/联系地址与 `M-FG-PDF-STRESS-LONG-001` 的超长名称/型号/规格，并包含 12 行订单明细、混合输入口径和 14 条补充条款。该草稿只用于版式回归，不能作为真实履约、库存或财务事实。

## 138. 角色决策投影与跨模块访问合同（2026-07-26）

- `RoleDecisionProjection` 是来源模块正式事实面向消费角色的最小只读投影。它只输出该角色完成当前判断所需的身份、数量、状态、时间和来源摘要，不复制来源实体，也不输出来源模块的操作能力。
- 是否保留一个投影字段，以该字段能否改变消费角色的判断、动作或唯一识别为准。只用于解释来源模块内部计算的中间量、分组维度、作业位置和处理来源默认剔除。
- `CrossModuleNavigation` 只允许 `formalHandoff / authorizedAction / auditTrace` 三种原因，并同时校验目标路由与当前账号权限。消费角色仅需查看结果时，应留在当前模块读取投影，不以方便查看为由授予来源模块菜单或原始接口权限。
- 角色边界必须在服务端成立：投影接口负责聚合、脱敏和字段白名单，来源模块原始接口继续执行原角色权限。前端隐藏菜单、按钮或表格列只能作为表现层补充，不能代替接口授权和字段隔离。

## 139. 销售订单价参考与测试数据隔离合同（2026-07-26）

- `SalesOrderPriceReferenceProjection` 只消费 `SalesOrder.documentStatus ∈ {已确认, 已关闭}` 的订单行；草稿、作废、取消及未形成有效订单生命周期的记录不得成为报价单或销售订单的价格依据。
- 投影字段收口为物料身份、客户、含税订单价、订单数量、来源订单和订单日期。联系人、销售负责人不是定价依据，不进入参考卡片；页面语义固定为“订单价”，不得表述成已经完成履约或收款的“成交价”。
- `SalesOrder.testOnly = true` 表示仅供专项回归使用。普通订单列表、销售订单引用查询和销售发运记录投影必须排除该记录，按编码直读仍可用于回归；业务流、价格参考和用户日常查询不得消费测试记录。

## 140. 销售列表最小投影与查询合同（2026-07-26）

- `SalesQuoteListProjection` 和 `SalesOrderListProjection` 不消费附件明细或附件计数。附件属于单据详情能力，不是销售人员扫描报价状态、交期和订单进度的首屏判断字段，也不进入当前列表搜索与导出。
- 报价列表的报价人既是可见识别事实，也是搜索与筛选维度；可见列、搜索词、筛选项和导出语义不得相互脱节。
- 当前销售列表一次加载全部结果，没有服务端分页。页脚只投影结果总数，不生成永远禁用的伪分页控件；未来建立真实分页命令后再增加页码和翻页动作。

## 141. 销售确认意图与表单反馈合同（2026-07-26）

- `ConfirmSalesQuoteIntent` 与 `ConfirmSalesOrderIntent` 在用户拥有确认权限时始终可触发前端完整性检查。字段缺失、日期越界或明细不合法时不调用保存/确认接口，而是输出缺失摘要、错误态和第一缺失字段焦点。
- `ConfirmSalesOrderIntent` 在完整性检查通过后必须二次确认，说明系统会先保存订单并启动备货、生产和交付；取消时不得保存或改变状态。确认成功后重置未保存基线，再进入只读详情。
- `SalesQuote.validUntil` 的输入下限为当前 `quote.date`，服务端继续作为最终日期边界。草稿保存与已确认单据变更保存使用不同反馈；报价变更会明确提示已退回草稿，不能用“已保存”掩盖生命周期变化。

## 142. 销售订单跟进最小投影与角色边界合同（2026-07-26）

- `SalesDeliveryRecordProjection` 是仓库销售出库事实面向销售角色的只读投影。字段限定为 `code/sourceOrder/status/date/deliveryMethod/reversalCode/products`；商品行只保留来源行、物料身份、名称/型号/规格、数量和单位。
- 仓库编码、仓库名称、仓库经办人、批次、附件和内部执行备注不得进入该投影。销售订单页只消费 `/api/sales/delivery-records`，不得直接读取 `/api/warehouse/sales-issues`；销售账号对前者有读权限，对后者和财务原始单据保持拒绝访问。
- 订单本体的结构化 `productionProgress/deliveryProgress/invoiceProgress/paymentProgress/financeSummary` 是销售进度的首选事实。页面可以展示开票、回款的状态和销售待办，但不得把财务原始单据内容、财务路由或仓库操作入口混入销售详情。
- 作废、取消、冲销或存在 `reversalCode` 的出库记录不计入有效出库笔数。缺失的可选事实使用 `—`，不以“未维护”制造额外状态语义。

## 143. 销售模块五轮最终验收合同（2026-07-26）

- 本合同覆盖 `SalesQuote`、`SalesOrder`、销售订单跟进投影、`SalesOrderPriceReferenceProjection` 和 `SalesInventoryProjection`；`SalesAfterSale` 与所有 PDF/打印模板不在本次验收范围。
- 任一测试订单必须同时满足：普通订单列表不可见、销售订单引用不可见、销售发运记录不可见、按编码直达可用。四条边界由 `smoke:sales` 共同验证，不能只依赖演示数据当前恰好没有关联记录。
- 销售角色可以读取销售单据和销售最小进度投影，但不能读取仓库销售出库原始接口或财务销售发票原始接口。浏览器菜单隔离与 API 200/403 权限结果必须同时成立。
- 最终发布门禁为 UI 一致性审计、前端静态烟测、销售端到端烟测、销售库存/发运投影烟测和生产构建全部通过；任一失败即视为五轮目标未完成。

## 144. 销售列表实体筛选合同（2026-07-26）

- `SalesListEntityFilter` 保存用户输入的实体关键词，不保存从当前结果集枚举出的固定选项。客户关键词匹配 `customer/customerCode`；物料关键词匹配 `name/materialCode/model/spec`；人员关键词匹配当前责任人姓名。
- 实体匹配采用去除首尾空格后的不区分大小写部分匹配；空关键词表示不限制。状态仍使用有限枚举精确匹配，日期仍使用起止边界，三类筛选语义不得混用。
- 筛选弹层只编辑草稿条件，用户点击“应用”后才更新当前列表；“清空”同时清除实体、状态和日期条件。

## 145. 销售订单内容与履约状态分层合同（2026-07-26）

- `SalesOrder.documentStatus` 属于订单单据生命周期，取值投影为草稿、已确认、已关闭或已作废；在订单内容页右侧独立展示，不作为订单基本信息字段重复输出。
- `productionProgress/deliveryProgress/invoiceProgress/paymentProgress/attentionFlags` 属于履约事实，只在订单跟进页的订单进度中展示。订单内容页不得为了填充状态卡片而复制这些维度。
- 状态卡片允许没有附加维度；`DocumentStatusPanel.items` 因此为可选集合，空集合时仅呈现标题和主状态。

## 146. 采购申请草稿与查询表现合同（2026-07-26）

- `SavePurchaseRequisitionDraftCommand` 只保存仍可编辑的采购申请草稿，页面动作和成功反馈均使用“保存草稿”；`SubmitPurchaseRequisitionCommand` 才使申请进入采购受理并触发普通编辑锁定，两者不得合并为含义宽泛的“保存”。
- 打印和 PDF 不属于采购申请事实或生命周期命令。采购申请的需求、来源、承接、附件与日志继续由系统内详情和关联投影消费，不建立无业务消费者的输出模板。
- 基本信息的三列排列只改变显示顺序，不改变 `company / purchaseType / department / requester / date / expectedDate / reason` 的必填和冻结边界；申请单号仍由系统生成，申请原因仍作为独立长文本事实保存。
- 采购列表的人和交易主体属于可增长实体，筛选使用不区分大小写的部分匹配；状态与部门等有限集合仍可使用枚举精确匹配。筛选控件变化不得改变接口数据或把显示候选写回业务事实。

## 147. 物料采购草稿与输出表现合同（2026-07-26）

- `SavePurchaseOrderDraftCommand` 保存未确认物料采购草稿；`ConfirmPurchaseOrderCommand` 才写入已确认生命周期并启动供应商交付、收货、质检、入库、收票和付款链路。确认动作可以先持久化当前表单，但不得把中间保存反馈误报为最终确认结果。
- 已确认且尚未被下游事实冻结的采购单使用受控变更命令；界面“提交变更”保存修改并返回只读详情，日志保留变更记录。普通“保存草稿”不适用于这一阶段。
- `PurchaseOrder.taxMode` 决定 `unitPrice` 和 `line.amount` 的显示口径。界面可据此投影含税或未税标签，但不得新增第二套行金额、覆盖服务端重算规则或改变第 88 节的整单应付金额事实。
- “PDF”是物料采购对外输出能力入口，不是采购单生命周期状态。模板未建立时只允许返回明确的待设计反馈；禁止以浏览器打印 ERP 详情页伪装正式采购单。打印入口不属于物料采购详情标准动作。
- 采购价参考是编辑辅助投影，不进入已保存采购单事实，也不在只读详情重复呈现。附件列表属于采购单事实；上传能力只在可编辑上下文出现，只读详情不渲染无效控件。
- 列表总数是当前查询结果投影。服务端分页尚未建立前不得展示无真实翻页能力的页码和上一页/下一页，未来分页契约需同时提供总量、游标或页码及可执行边界。
## 148. 销售财务结果投影与物料采购逐行价税、跟进合同（2026-07-26）

- 本节 148.2 替代第 147 节关于 `PurchaseOrder.taxMode` 作为物料采购计算与显示输入的阶段性合同；资产采购仍按第 147 节和既有资产采购事实执行。

### 148.1 销售订单财务结果投影

- `SalesOrder.invoiceProgress = { status, orderAmount, invoicedAmount }`，`SalesOrder.paymentProgress = { status, receivableAmount, settledAmount }`；`financeSummary` 继续保存财务来源编码、确认应收、已结算和到期日等服务端聚合事实。
- 销售订单跟进只消费金额聚合：`待开票 = max(orderAmount - invoicedAmount, 0)`，`订单待收 = max(orderAmount - settledAmount, 0)`。`已确认应收` 与 `订单待收` 不等价：前者只包含已经形成应收的金额，后者表示整张订单尚未收到的余额。
- 销售页面不得为了展示金额重新读取财务原始列表，也不得由销售端反推、编辑或核销财务单据。

### 148.2 物料采购逐行价税

- `PurchaseOrderProduct` 增加 `priceInputMode / taxRate / netUnitPrice / grossUnitPrice / netAmount / taxAmount / grossAmount`。`priceInputMode` 只允许“含税/不含税”，表示该行最后一次由用户直接编辑的单价列。
- 服务端以 `qty + unitPrice + priceInputMode + taxRate` 为输入重算全部派生价税。未税输入时 `grossUnitPrice = netUnitPrice × (1 + rate)`；含税输入时 `netUnitPrice = grossUnitPrice ÷ (1 + rate)`；每行金额按 CNY 两位小数舍入，`taxAmount = grossAmount - netAmount`。
- 物料采购的 `order.amount` 与行 `amount` 都是含税金额兼容字段。表头 `taxRate` 仅作为旧消费者摘要：同单只有一种行税率时保存该税率，多种时保存“多税率”；不得再作为物料采购计算输入。
- `0%` 与“免税”数值计算都为零税额，但业务语义必须分别保留。采购发票匹配读取订单行冻结的 `grossUnitPrice / grossAmount / taxRate`，不得回退为整单税率覆盖行事实。
- 旧物料采购单读取时以旧 `taxMode / taxRate / unitPrice` 迁移到行事实；资产采购继续使用整单成交金额与税率模型。

### 148.3 物料采购跟进投影

- `PurchaseOrderProgressFacts` 由服务端聚合 `arrival / quality / inbound / invoice / payment / attention / nextStep / lines / finance`。逐行进度只包含订购、到货、待检、放行、不合格和入库数量。
- `finance = { orderAmount, invoicedAmount, payableAmount, settledAmount }`；页面派生 `待收票 = max(orderAmount - invoicedAmount, 0)` 与 `采购待付 = max(orderAmount - settledAmount, 0)`，并单独显示已确认应付，避免尚未收票时把“未付款”错误显示成零业务余额。
- “采购内容”与“采购跟进”是同一采购订单的两个视图，不新增第二张业务单据。跟进页不允许修改仓库收货、质检结论、发票、应付或付款事实，也不提供跨模块执行路由。
- `relatedDocuments` 在采购跟进中只作为类型、编码和状态的只读追溯摘要；原模块接口和操作权限继续由仓库、质量、财务角色控制。

## 149. 订单跟进财务投影、关联链与收货仓库变更合同（2026-07-26）

### 149.1 跟进页主事实

- `SalesOrderFinancialProjection` 继续由 `invoiceProgress / paymentProgress / financeSummary` 聚合，但页面消费者固定为左侧“开票与回款”事实网格；`PurchaseOrderProgressFacts.finance` 固定进入左侧“收票与付款”。侧栏只消费文档状态与进度维度，不能再次承载金额摘要。
- `SalesOrderRelatedRecordProjection = { type, code, status }`。来源可以是 `sourceQuote`、出库申请、行级 `fulfillmentLinks`、有效销售出库记录及 `financeSummary.invoiceCodes / receivableCodes`；相同类型与编码必须去重。该投影不包含其他模块的人员、仓库、批次、账户、核销或操作地址。
- 关联记录是只读追溯投影，不是跨角色执行入口。销售发票和应收账款编码可以被销售看见以确认链路是否形成，但财务原始接口和命令继续受财务权限保护。

### 149.2 采购条款与列表表现

- 物料采购条款事实共五项，三列布局中 `remark` 跨两列，与付款方式共同填满第二行；资产采购条款共七项，`remark` 跨三列。灰色网格背景只能作为真实字段间隔，不能成为无字段占位。
- 中等桌面宽度下，采购列表右侧执行状态投影使用三列、两行布局展示五个维度；状态区域宽度与主信息区共同由可视内容宽度决定，不允许依赖页面被裁切来容纳固定宽度列。

### 149.3 目标收货仓库变更

- `PurchaseOrder.warehouseCode / warehouse / receivingAddress` 在草稿状态是可编辑采购事实。已确认且 `relatedDocuments` 中除“采购申请”外没有任何记录时，只有采购确认权限可通过 `_operation = change` 的受控变更命令修改。
- 采购收货、来料质检、采购售后、采购发票或应付账款中任一事实形成后，服务端拒绝采购内容变更；目标仓库与既有收货事实必须保持一致，不能通过覆盖订单字段篡改历史。
- 收货角色可以决定目标仓库内部的实际库位，但不拥有改写采购订单目标仓库的权限。部分收货后的跨仓调整属于新的执行事实，应通过调拨或剩余收货安排建模。

## 150. 物料采购列表投影与来料库存阶段合同（2026-07-26）

### 150.1 列表投影

- `PurchaseOrderListProjection` 的主区字段为 `code/sourceRequisition(s)/supplier/owner/products/amount/expectedDate/date`。来源申请只派生“申请转单/直接采购”，不在首屏展开申请单号。
- `amount` 下方消费应付金额汇总，表达未付/已结清；`expectedDate` 独立为主日期并以 `date` 作为次级下单日期。右侧状态区消费 `documentStatus/arrival/quality/inbound/invoice/payment/attention`，其中 `invoice/payment` 是流程状态，不得被金额结果替代。
- 收票与付款属于采购订单的结算摘要，放在金额列；到货、质检和入库属于实物流转，放在跟进区。相同事实不得在两个区域重复展示。

### 150.2 来料库存阶段

- 采购收货确认到货时，每行增加物理在库；`qcRequired = true` 的行增加 `qcHoldNumber` 并进入 `qc_hold`，免检行增加 `pendingInboundNumber` 并进入 `pending_inbound`。两者都不得增加 `qualifiedOnHandNumber` 或 `availableNumber`。
- 质检判定只处理需检行。合格、批准让步和复检合格数量从 `qcHoldNumber` 转入 `pendingInboundNumber`；不合格数量进入隔离事实。免检行不进入质检任务，也不能被质检命令重复移动。
- 仓库过账命令只能承接状态为“待入库”且 `stockStage = pending_inbound` 的采购收货，校验待判数量为零和待入库数量充足后，减少 `pendingInboundNumber`、增加 `qualifiedOnHandNumber`，写入“采购入库”流水并重算可用库存。
- `物理在库 ≠ 合格在库 ≠ 可用库存`。可用仍按 `合格在库 - 销售预留 - 生产分配 - 冻结` 派生；待检和待入库不进入可用公式。

## 151. 仓库职能、采购暂存与待收货任务合同（2026-07-26）

### 151.1 仓库职能

```ts
type WarehouseFunction =
  | '采购暂存'
  | '销售退货暂存'
  | '可采购入库'
  | '可销售出库'
  | '可生产领料'
  | '可生产入库'
  | '不合格隔离'

type WarehouseMaster = {
  code: string
  name: string
  type: string
  company: string
  warehouseFunctions: WarehouseFunction[]
  status: '启用' | '停用'
}
```

- 本节替代第 110、116、119 和 122 节中“仓库类型是业务能力唯一事实”的旧合同。`type` 是物理分类，`warehouseFunctions` 是流程准入事实，`allow*` 只允许由服务端投影。
- 同公司可存在多个“采购暂存”仓库。采购订单保存和确认都必须验证至少存在一个启用候选；订单选择的 `warehouseCode / warehouse` 必须属于候选集合。
- 采购暂存、销售退货暂存与不合格隔离属于受控职能，不得与常规收发职能混配。移除职能或停用仓库前，服务端必须检查非零库存、冻结/待入库、未结束采购收货、销售退货、销售出库和生产领退料引用。

### 151.2 待收货任务

```ts
type PurchaseReceiptTask = {
  code: string
  sourceDoc: string
  status: '待收货' | '待质检' | '待入库' | '已入库' | '已取消'
  warehouseCode: string
  expectedDate: string
  date?: string
  products: Array<{
    lineId: string
    sourceLineId: string
    materialCode: string
    plannedOrActualQty: Quantity
    batch?: string
    qcRequired: boolean
    destinationWarehouseCode?: string
    destinationLocation?: string
  }>
}
```

- `ConfirmPurchaseOrderCommand` 对物料采购执行“确认订单 + 生成待收货任务”同次持久化。任务不是库存事实；只有仓库登记到货命令才写入实物到厂数量。
- 待收货任务的来源订单、公司、供应商、采购暂存仓和来源行不可由仓库改写。仓库只登记本次实收数量、批次、到货日期、暂存库位及随货资料。
- `remainingQty = orderedQty - sum(effectiveArrivedQty)`；草稿、待收货、已取消、已作废和冲销记录不计入到货。登记部分到货后按余量生成下一任务，全部到齐不生成；同一来源不得并存多张有效未执行任务。
- 订单关闭或作废取消尚未执行任务，但不删除任务、日志或任何已发生库存事实。资产采购不生成物料采购收货任务，继续走资产到货、验收和登记链。

### 151.3 暂存到正式仓的库存移动

- 采购到货先进入订单选定且具备“采购暂存”职能的仓库。需检数量进入 `qcHoldNumber`，免检或已放行数量进入 `pendingInboundNumber`；两类数量都占物理在库，但不进入 `qualifiedOnHandNumber / availableNumber`。
- 正式入库必须逐行提供具备“可采购入库”职能的目标仓库和库位，且目标仓不得等于采购暂存仓。过账同时减少暂存仓 `onHandNumber + pendingInboundNumber`，增加目标仓 `onHandNumber + qualifiedOnHandNumber`，并写入“采购入库移出/采购入库”成对流水。
- 不合格数量不进入正式入库。质量决定将其转入隔离事实，后续退货、复检、让步或报废必须通过独立可审计命令处理。

## 152. 采购待收货同步与列表投影补充合同（2026-07-27）

### 152.1 待收货任务写入门禁

- `CreatePurchaseReceiptCommand` 不对仓库角色开放。`POST /warehouse/purchase-receipts` 固定返回不允许创建；`PurchaseReceiptTask` 只能由 `ConfirmPurchaseOrderCommand` 或部分到货后的余量派生命令生成。
- `PurchaseReceiptTask.sourceDoc`、公司、供应商、采购暂存仓、来源行和 `expectedDate` 均读取来源采购订单。更新已有任务时以服务端既有 `sourceDoc` 为准，客户端不能把任务改挂到其他订单。
- `PurchaseReceiptTaskExecutionStarted` 在任务进入实际状态，或仍为待收货但已经填写到货日期、暂存库位、批次、备注或附件时为真。已取消、已作废以及完全未填写的自动任务不构成实际到货事实。

### 152.2 采购受控变更与任务同步

- `PurchaseOrderHasExecutedDownstreamFacts` 忽略采购申请和完全未执行的自动待收货任务；采购收货登记已开始、来料质检、采购售后、采购发票或应付账款任一形成后返回真。
- 已确认订单在该值为假时允许具有采购确认权限的人员提交 `_operation = change`。保存与待收货任务在同次持久化中同步，复用任务编码并重算全部剩余来源行。
- 若采购暂存仓发生变化，同步任务清空旧暂存库位；若仓库已开始填写任务，则订单变更被拒绝而不是覆盖任务草稿。服务启动迁移同样不得重写已开始登记的待收货任务。

### 152.3 列表投影

```ts
type PurchaseRequisitionListProjection = {
  code: string
  purchaseType: string
  department: string
  requester: string
  products: ProductSummary[]
  expectedDate: string
  date: string
  documentStatus: string
  conversionStatus: string
  currentTask: string
}

type MaterialPurchaseListProjection = {
  code: string
  sourceLabel: string
  supplier: string
  owner: string
  products: ProductSummary[]
  grossAmount: Money
  payableSummary: string
  expectedDate: string
  date: string
  documentStatus: string
  arrival: string
  quality: string
  inbound: string
  attention: string
}
```

- 物料采购的 `payableSummary` 进入金额列/卡片内容摘要；右侧进度同时消费 `invoice/payment` 状态。前者回答“还有多少钱未付”，后者回答“收票和付款走到哪一步”，不得互相替代。采购申请仍不包含供应商、采购价格、到货和结算事实。
- 中等宽度卡片最多消费前两项 `products`，同时展示总项数差额；这只是显示裁剪，不改变订单或申请的完整产品事实。
- 订单型列表的布局合同继承销售订单母版：1280px 常见桌面宽度使用左侧主信息和右侧跟进双区，视口不超过 1260px 时切换为卡片。该合同约束布局和交互，不要求销售与采购读取相同字段。
- `purchaseOrderContentRoute` 读取采购单本体，`purchaseOrderFollowUpRoute` 固定为物料采购 `/purchase/orders/:code/follow-up`。桌面右侧跟进区及卡片跟进区必须消费后者；资产采购尚未建立独立跟进路由时继续读取自身详情，不伪造路由。
- 采购卡片的内容摘要允许消费供应商联系人、`payableSummary`、预计到货、下单日期和采购员；跟进区消费 `arrival / quality / inbound / invoice / payment / attention`。两个区域是同一订单的不同投影，不产生第二张业务单据。

## 153. 资产采购跟进、价税与直接收票合同（2026-07-27）

### 153.1 资产采购页面投影

- `assetPurchaseContentRoute = /purchase/asset-purchases/:code`，`assetPurchaseFollowUpRoute = /purchase/asset-purchases/:code/follow-up`。列表主信息与卡片内容区读取前者，右侧进度与卡片跟进区读取后者；本条替代第 152 节“资产采购暂无独立跟进路由”的阶段性约定。
- `AssetPurchaseProgressProjection` 固定输出 `arrival / acceptance / registration / invoice / payment / attention / nextStep / finance`。为兼容共用接口，现阶段分别映射到 `arrival / quality / inbound / invoice / payment`，展示层必须使用资产语义，不能显示质检或入库。
- 资产采购内容页只消费单据生命周期；跟进页消费执行进度、到货/验收日期与记录、资产登记、结算金额和关联记录。`relatedDocuments` 增加由 `EquipmentRecord.sourcePurchase` 反查得到的“资产档案”记录。

### 153.2 资产成交价税

- `assetQuotedAmount` 保存用户最后直接修改的整单成交金额，`taxMode` 仅记录该金额是含税还是未税输入，`taxRate` 保存整单税率。页面固定同时投影未税成交金额和含税成交金额；修改任一金额时更新输入口径并按 CNY 两位小数换算另一金额。
- `taxMode` 是内部换算依据，不是用户需要单独选择的业务字段，也不属于 `PurchaseTermsTemplate`。条款模板不得显示、修改或覆盖资产采购的成交价税事实。
- 资产采购详情固定展示未税成交金额、税率和含税成交金额；金额汇总展示未税金额、税额和含税总计。服务端继续以冻结的 `assetQuotedAmount / taxMode / taxRate` 整单价税事实为准。

### 153.3 资产采购发票来源与额度

```ts
type PurchaseInvoiceSource =
  | { sourceType: 'purchase-receipt'; sourceReceipt: string; sourceOrder: string }
  | { sourceType: 'asset-purchase'; sourceReceipt: ''; sourceOrder: string }
```

- 物料采购发票仍执行三单匹配，直接来源必须是已正式入库的采购收货。资产采购发票直接来源是生命周期已确认且 `assetAcceptanceStatus = 已验收` 的资产采购单，不生成或伪造仓库收货。
- `AssetPurchaseInvoiceMatch.remainingAmount = purchaseOrderGrossAmount - sum(otherEffectivePurchaseInvoiceGrossAmount)`。本次确认价税合计必须大于零且不得超过剩余金额；待收票、草稿、作废、取消、冲销和红冲记录不占用额度。
- 资产发票行使用稳定来源行 `ASSET`，保存资产名称、规格、计价单位“项”、输入口径金额和税率快照。数量只表达一个资产采购项目，额度控制以累计含税金额为权威。
- 确认资产采购发票后生成普通 `Payable`，`sourceOrder` 保留资产采购编码；采购进度从有效发票、应付与付款事件重算收票和付款状态。财务候选只返回已验收且尚未足额收票的资产采购。
- 财务读取 `purchase-orders` 候选属于采购结果只读访问，不授予财务修改采购单、记录到货、记录验收或建立资产档案的权限。

## 154. 物料采购订单中文 PDF 与打印快照合同（2026-07-27）

### 154.1 对外投影

```ts
type PurchaseOrderPrintProjection = {
  documentName: '采购订单'
  orderCode: string
  orderDate: string
  expectedDate: string
  buyer: PurchaseOrder['companyPrintSnapshot'] & PurchaseOrder['buyerPrintSnapshot']
  supplier: PurchaseOrder['supplierPrintSnapshot']
  products: Array<{
    name: string
    model: string
    spec: string
    qty: string
    uom: string
    grossUnitPrice: string
    grossAmount: string
  }>
  grossTotal: string
  terms: {
    deliveryMethod: string
    freightPayer: string
    paymentMethod: string
    remark: string
  }
  receiving: {
    address: string
    contact: string
    phone: string
  }
}
```

- 采购 PDF 是已保存采购订单的只读对外投影，不创建或修改采购、收货、质检、入库、发票、应付或付款事实。
- 明细金额读取采购行冻结的 `grossUnitPrice / grossAmount`，整单含税总计读取服务端归一化的 `amount`。PDF 不展示整单税率，不把税率或计价口径重新解释为商务条款。
- 收货信息来自采购订单的 `receivingAddress / receivingContact / receivingPhone`；采购暂存仓和最终库存仓属于内部履约事实，不进入供方确认文件。

### 154.2 身份快照

```ts
type PurchaseOrderPrintSnapshots = {
  companyPrintSnapshot?: {
    companyCode: string
    name: string
    shortName: string
    address: string
    phone: string
    email: string
    website: string
  }
  buyerPrintSnapshot?: {
    employeeCode: string
    contact: string
    phone: string
    email: string
  }
  supplierPrintSnapshot?: {
    supplierCode: string
    name: string
    address: string
    contact: string
    phone: string
  }
}
```

- 保存采购单时，服务端分别从公司、员工和供应商主数据解析并冻结三组快照；`ownerEmployeeCode` 是采购员稳定身份，显示名称不是唯一关联键。
- 修改采购单上的公司、采购员或供应商时必须按新身份重新生成对应快照；普通编辑不得因为主数据后来变化而静默重写既有历史快照。
- 对旧数据执行兼容迁移时，只允许用服务端可信主数据补齐完全缺失的快照。打印端优先读取快照，仅在旧记录尚未完成迁移时使用订单事实和主数据兜底。

## 155. 资产采购外部文件与内部事实边界（2026-07-27）

- 资产采购不定义 `AssetPurchasePrintProjection`，详情与跟进页均不提供 PDF/打印入口，也不存在 `/purchase/asset-purchases/:code/pdf`。删除输出能力不删除或改写任何采购、验收、资产、发票、应付与付款事实。
- 供应商报价、供应商订单确认、采购合同及交付验收附件属于原始外部文件，随资产采购单附件保存；系统不得把附件内容推断成订单价税或验收结论，也不得自动生成一份与原始文件竞争的对外资产采购单。
- 资产采购确认后按 `到货 -> 验收 -> 资产登记 -> 收票 -> 付款` 形成可追溯进度。到货不是库存入账；资产不进入采购暂存仓、质检收货或库存结存。
- 到货事实与验收事实当前均由资产采购跟进的受控动作产生，并共用采购确认权限；验收日志责任人读取订单 `acceptanceOwner`，但当前服务端没有校验操作者是否为该负责人。后续应把验收执行权限交给指定验收责任人或其授权角色。`验收不通过` 必须保留问题、处置与复验，不得产生已验收、已登记或可收票的伪完成状态。
- 验收通过后才能创建资产/设备档案；档案必须记录来源采购单并回写登记进度。财务只可选择已确认且验收通过、尚有可收票额度的资产采购作为发票来源，确认发票后生成应付，付款事实继续回写采购跟进。
- 目标权限边界是：采购拥有下单和协同视图，验收负责人负责验收，资产管理员负责登记，财务负责收票和付款。当前仅资产登记与财务动作已经分离，验收仍暂借采购确认权限；这属于已知收口项，不能把当前实现误写成最终授权模型。
- 资产采购关闭必须依据所有适用事实的受控终态；到货取消、验收退货、无需登记、无需开票或无需付款等例外需要明确的业务结果，不能用订单主状态替代。

## 156. 资产采购列表投影（2026-07-27）

- `AssetPurchaseListProjection` 读取稳定身份和决策事实：`code / sourceRequisition / supplier / owner / assetName / assetSpec / amount / budgetAmount / expectedDate / date`，并附加独立的 `arrival / quality / inbound / invoice / payment / attention` 跟进投影。
- `amount` 是含税成交金额，也是列表金额排序的权威值；`budgetAmount` 只是需求预算对照，不参与订单成交金额排序。资产名称与规格的显示投影不得再次拼入预算或验收负责人。
- `acceptanceOwner` 属于验收责任事实，不属于资产规格。桌面主表不以其占用稳定身份列；窄屏卡片可在元数据区显示，搜索索引仍可覆盖该字段。
- 资产采购没有 `WarehouseReceipt / StockLedgerEntry`。付款提示的前置条件读取验收和结算事实：未验收为“待验收后应付”，验收后未收票为“待收票”，已存在财务投影时按应付与已结算金额显示未付或已结清；不得回退到物料采购的“待入库后应付”。
- CSV 投影把采购资产、预算金额和成交金额分列输出；采购资产列只由资产名称与规格组成。列表、卡片、排序和导出必须使用同一含义，不能让同一字段在不同载体中兼任对象、预算和责任人。

## 157. 统一售后事实与执行任务合同（2026-07-27）

### 157.1 主单与方案

```ts
type AfterSalesCase = {
  code: string
  kind: 'sales' | 'purchase'
  sourceOrder: string
  issueType: string
  issueDescription: string
  products: Array<{
    sourceLineId: string
    materialCode: string
    name: string
    qty: string
    sourceQty: string
    uom: string
  }>
  action: string
  goodsDisposition: string
  financialTreatment: string
  amountImpactType: '无金额影响' | '待评估' | '退款' | '折让' | '补发成本' | '返修成本' | '应付扣减'
  estimatedAmount: number
  confirmedAmount: number
  planNote: string
  purchaseQualityDisposition?: '合格' | '让步接收' | '不合格退回'
  salesRepairQualityDisposition?: '合格' | '报废'
  ownerEmployeeCode: string
  status: '待受理' | '处理中' | '待确认' | '已关闭' | '已作废'
}
```

- 问题登记事实、受影响来源行和数量在受理后冻结；`action / goodsDisposition / financialTreatment / amountImpactType / estimatedAmount / planNote` 在生成执行任务后冻结。
- 销售受影响上限读取已过账销售出库行；整单签收但缺少历史行级出库时才允许按原单数量兼容。采购受影响上限读取原采购行，并对同来源订单、同来源行的所有非作废售后累计校验。

### 157.2 执行任务

```ts
type AfterSalesExecutionTask = {
  code: string
  afterSaleKind: 'sales' | 'purchase'
  afterSaleCode: string
  sourceOrder: string
  module: '仓库' | '质检' | '生产' | '财务'
  kind: string
  direction: '入库' | '出库' | '检验' | '返修' | '结算'
  status: '待前置' | '待处理' | '处理中' | '已完成' | '已取消'
  predecessorCodes: string[]
  predecessors?: Array<{
    code: string
    module: '仓库' | '质检' | '生产' | '财务'
    kind: string
    status: AfterSalesExecutionTask['status']
  }>
  products: AfterSalesCase['products']
  warehouseCode?: string
  location?: string
  disposition?: string
  amount?: number
  adjustmentCode?: string
  evidence?: string
  note?: string
  completedAt?: string
  completedBy?: string
}
```

- 任务编号、模块、类型、前置关系和受影响明细由服务端根据方案生成。售后主单提交的任务状态、依据或备注必须与服务端权威任务完全一致，否则拒绝写入。
- `start` 只允许待处理任务；`complete` 必须校验全部前置任务完成，并由模块专属动作生成库存、质量、生产或财务事实。重复开始和重复完成使用已有事实幂等返回。
- `start` 只改变任务生命周期，不能清空操作者已经在当前执行页填写但尚未提交的仓库、库位、处置、金额、凭证和备注。页面重新读取权威状态后必须恢复这些本地输入，最终仍由 `complete` 一次提交。
- 主单执行进度是任务投影。所有任务完成后主单仍处于处理中，等待售后负责人汇总 `processingResult / confirmedAmount`；对方确认后才关闭。
- 已完成任务详情必须显示适用的检验处置、作业仓库/库位、处理金额、财务调整号、完成依据、完成经办、完成时间和执行备注。`adjustmentCode` 是系统形成的库存/财务关联事实，不能用操作者自由填写的 `evidence` 冒充。
- 返修链的回归门禁必须覆盖 `客户退货接收 -> 销售退货检验（返修返工） -> 售后返修或返工 -> 返修品复检（合格） -> 返修品出库`。仅验证任务状态释放而未验证最终出库成功，不算返修闭环通过。
- `predecessorCodes` 是持久化依赖键；`predecessors` 只是接口根据当前权威任务生成的可读投影。列表与详情必须显示实际等待的任务类型和状态，不能只写“等待前置任务”。
- 采购来料任务完成时保存 `purchaseQualityDisposition`。值为不合格退回时，同一序号的后置仓库任务从正式入库动态变为不合格品退回供应商，任务编码保持稳定以维持审计链；返修复检报废同理把最终任务命名为返修品报废处置。分支改变业务动作和方向，不能复制出一条仍可执行的旧任务。

### 157.3 库存事实

- 客户退货接收写入销售退货暂存仓：`onHandNumber += qty`、`qcHoldNumber += qty`、`qualifiedOnHandNumber` 不变。质量结论不能直接改变正式仓库存。
- 可再次销售处置由仓库从暂存仓扣除物理/冻结或待入库，并向具备可销售出库职能的正式仓增加物理与合格库存；报废只扣除暂存物理库存；返修通过生产、复检后由仓库出库返还客户。
- 返修判定时原退货实物继续保留在 `qcHoldNumber`，表示仍处于返修及复检控制内。生产返修完成只释放复检任务，不把实物提前计为合格；返修品复检必须追溯同一售后单的“客户退货接收”库存事实，复检合格后才执行 `qcHoldNumber -= qty / pendingInboundNumber += qty`。返修品出库只消耗这批待出库实物；复检报废则从原质检冻结实物扣除。没有原始接收库存事实时不得完成复检。
- 供应商补发、换货、返工品收货沿用采购暂存与质检门禁，正式入库目标必须具备 `可采购入库` 职能。采购退货出库必须携带启用来源仓库，只减少该仓 `rejectedHold / qcHold / pendingInbound / qualifiedOnHand` 中实际存在的数量并写库存流水；不得跨仓静默扣减。
- 采购售后来料检验为合格或让步接收时执行 `qcHoldNumber -= qty / pendingInboundNumber += qty`；不合格退回时执行 `qcHoldNumber -= qty / rejectedHoldNumber += qty`。随后仓库退回任务同时扣减 `onHandNumber` 与对应 `rejectedHoldNumber` 并写负向流水。该分支不得增加 `pendingInboundNumber / qualifiedOnHandNumber`，也不得进入正式入库。
- 销售退货报废不产生目标仓库和库位，返修品复检合格后的返还出库直接消耗售后暂存事实；只有“可再次销售”处置才要求选择可销售仓库和库位。
- 来料质检的退回建议只创建待受理采购售后并继续保留隔离数量；`incomingReturnDocument.status = 待采购受理` 不等于仓库出库。

### 157.4 财务事实

```ts
type AfterSalesAdjustment = {
  code: string
  afterSaleCode: string
  sourceOrder: string
  sourceInvoice?: string
  receivableCode?: string
  payableCode?: string
  amount: number
  receivableOffset?: number
  payableOffset?: number
  refundAmount?: number
  supplierRefundAmount?: number
  treatment: string
  status: '已生效'
}
```

- 有效应收/应付总额为 `max(0, totalAmount - afterSalesAdjustmentAmount)`。登记新收付款、列表未结金额、详情未结金额和订单进度都必须使用有效总额，原 `totalAmount / settledAmount` 不得被改写成净额。
- 调整额优先抵减未结余额；超过未结余额的部分必须形成退款事实和外部流水。销售退款要求方式与交易流水，采购已付款退款至少要求到账流水。
- `付款暂缓` 不是金额影响，固定令 `amountImpactType = 无金额影响`，不得同时伪造应付扣减或退款金额。
- 采购售后选择付款暂缓时生成首尾两个财务任务：`采购付款暂缓 -> 业务协同任务 -> 采购付款恢复`。暂缓时写 `holdStatus / holdReason / holdAfterSaleCode / heldAt / heldBy`，恢复时清除当前售后拥有的暂缓并写恢复审计。
- 付款暂缓和付款恢复是控制任务，不填写处理金额、来源发票、退款/到账方式或外部流水，也不要求操作者另填会被系统覆盖的执行凭证；详情以采购订单/应付款为“控制对象”，保留执行备注和系统审计。
- 若应付款尚未生成，暂缓先写入采购订单 `paymentHoldStatus / paymentHoldReason / paymentHoldAfterSaleCode`；采购发票确认并生成应付款时继承该控制事实。不同售后不得覆盖彼此的付款暂缓。
- 非控制类财务任务完成后，任务 `amount` 与已生效调整单共同形成权威确认金额，并自动回写售后主单 `confirmedAmount`。后续销售/采购保存不同金额必须返回 409；任务手工填写的 `evidence` 保持原值，系统 `adjustmentCode` 单独保存。
- 可选 `sourceInvoice` 必须在对应销售/采购发票集合中真实存在，并且 `sourceOrder` 与售后来源订单一致。无效编号或其他订单发票不得生成售后调整。

### 157.5 来源数量与候选事实

- 销售售后候选量按来源订单行计算：优先汇总已过账且未冲销的销售出库；没有出库明细但整单已签收时才允许回退到原单数量。新建页、引用搜索和服务端累计校验必须使用同一候选量。
- 已作废售后不占用来源可登记数量。销售与采购候选订单只有在至少一行仍有剩余可登记数量时才进入搜索结果。
- 引用搜索只承担候选检索，保存时仍由服务端重新校验来源状态、逐行数量和跨单累计量，避免并发选择导致超量。

### 157.6 仓库职能与保护

- `WarehouseFunction` 增加 `销售退货暂存`，并派生只读能力 `allowSalesReturnStaging`。其与采购暂存、不合格隔离一样属于受控互斥职能。
- 存在非零库存、已分配的未完成任务，或当前公司仍有销售退货任务且没有其他启用的销售退货暂存仓时，取消职能或停用仓库必须返回 409。

### 157.7 角色任务入口投影

- 仓库、质检、生产和财务分别通过 `/warehouse/after-sales`、`/quality/after-sales`、`/production/after-sales`、`/finance/after-sales` 读取本模块 `AfterSalesExecutionTask`。列表只是一组任务投影，不复制售后主单，也不允许角色从空白页面自行创建售后事实。
- 四个菜单路径同时是详情路由的权限父级；任务详情固定为 `/{module}/after-sales/{taskCode}`，进入和返回都不得跨到销售、采购或其他模块页面。
- 执行列表保留待前置任务用于解释依赖关系，待处理和处理中代表当前可执行任务，已完成用于审计，已取消不进入日常列表。状态排序固定为待处理、处理中、待前置、已完成。
- 质检来料列表、生产异常工作区、财务应收和应付列表不得再次嵌入同一售后任务，防止来源语义错误、任务重复曝光和跨模块入口不一致。
- 原型账号必须覆盖四个执行角色以验证边界：仓库 `warehouse01`、生产 `production01`、质检 `quality01`、财务 `finance01`。账号只获得自身模块菜单与操作权限；管理员只用于全链检查，不能代替角色账号通过权限验收。

### 157.8 售后负责人角色约束与结果投影

- `AfterSalesCase.ownerEmployeeCode / owner` 是业务负责人快照，不是当前操作者快照。销售售后负责人必须是关联启用账号且拥有 `ROLE-SALES` 的启用员工；采购售后负责人必须满足同样条件并拥有 `ROLE-PURCHASE`。保存和修改时服务端按稳定员工编码校验，显示名称不能单独充当授权依据。
- 来源订单向售后候选投影 `afterSalesOwnerEmployeeCode / afterSalesOwner`：来源负责人角色有效时沿用；无效时选择对应业务角色的有效员工，并优先非管理员专职账号。历史售后读取时使用同一规则补齐无效归属，但不得改写执行任务的经办人和历史操作人。
- 新建页只有在当前账号拥有对应角色并关联员工时才默认本人；否则负责人留空，等待从角色过滤后的引用候选中选择。客户端候选过滤只是交互辅助，服务端角色校验始终是最终门禁。
- 角色任务页面的日常完成条件固定为 `status === 处理中`。待处理任务先执行 `start`，再展示模块表单并执行 `complete`；待前置、已完成和已取消均不得出现可完成操作。
- 执行列表的已完成摘要是权威任务结果投影：质检取 `disposition`，财务优先取 `amount / adjustmentCode`，生产取 `evidence / disposition`，仓库取 `disposition / warehouse`。搜索和 CSV 导出必须包含同一结果，不得用待办提示覆盖已完成事实。

## 158. 销售与采购五轮复核补充合同（2026-07-27）

### 158.1 销售单据负责人

- `SalesQuote.ownerEmployeeCode / owner` 与 `SalesOrder.ownerEmployeeCode / owner` 是报价人、销售负责人的稳定员工身份与显示快照。可确认负责人必须满足：员工存在、状态启用、关联启用系统账号，且账号有效角色包含 `ROLE-SALES`。
- 新建报价默认当前登录账号关联的销售员工；报价人和销售负责人均允许在有效销售人员之间调整。引用候选 `kind=sales-document-owner` 只能返回满足上述条件的员工，服务端确认校验仍是最终授权边界。
- 历史已确认或已转单单据不因当前角色配置变化而改写负责人快照；草稿或重新确认的单据必须满足当前角色门禁。操作日志的 actor 始终取真实登录账号，不由单据负责人字段代替。

### 158.2 候选资料最小只读权限

- `referencePermissionCodes.company` 至少允许 `PERM-SALES-EDIT`、`PERM-PURCHASE-EDIT` 和 `PERM-MASTER-DATA-MAINTAIN`；业务岗位可以选择所属公司，但不能因此进入公司资料维护页。
- `referencePermissionCodes.employees` 至少允许 `PERM-SALES-EDIT`、`PERM-PURCHASE-EDIT`、`PERM-MASTER-DATA-MAINTAIN` 和 `PERM-SYSTEM-CONFIG`。具体选择器继续用 `kind` 做角色或用途过滤，读取员工候选不等于可以任意指定负责人。
- 引用接口必须同时满足当前账号读取权限、员工启用状态和用途过滤；任何一层失败都不得退化为返回全部员工。前端的 0 候选错误必须显示为权限失败，而不能被误解为没有员工资料。

### 158.3 应收应付进度判定

- 销售订单的 `progressFacts.payment.status` 先判断是否存在有效应收记录：不存在时固定为“未收款”；存在后再按有效应收额与已收金额判定未收款、部分收款、已收款。
- 采购订单的 `progressFacts.payment` 使用对称规则：不存在有效应付款时固定为“未付款”；存在后再按售后调整后的有效应付额与已付金额判定未付款、部分付款、已付款。
- 已存在应收/应付且经红冲、折让或售后调整使有效金额归零，可视为结清；“没有结算对象”与“结算对象已经归零”是两个不同事实，不能再用 `amount <= 0` 一条条件混判。
- 金额投影继续以订单含税总额为上限展示待收/待付；结算进度只表达财务对象状态。开票/收票、应收/应付、实际收付三层不得互相推断或替代。

### 158.4 回归不变量

- 销售专项回归必须覆盖：销售候选过滤、非销售员工确认阻断、未形成应收不得标记已收款、报价转订单、交付与财务证据。
- 采购专项回归必须覆盖：未形成应付不得标记已付款、资产与物料五维进度、到货/验收/质检/入库、来源与关联记录。
- 售后和全链回归继续覆盖角色作业、数量上限、库存冻结/释放、正式入库、退款/暂缓、前置任务依赖及跨模块状态同步；任何列表视觉优化都不能改写这些权威事实。

## 159. 售后单据统一投影与关联处理记录合同（2026-07-27）

### 159.1 主体、协同任务与关联事实分层

- `SalesAfterSale` 与 `PurchaseAfterSale` 的正文都只保存本角色负责的问题登记、方案冻结、结果确认和附件；仓库、质检、生产、财务的实际执行继续保存为 `AfterSalesExecutionTask`，不得复制为销售或采购可编辑字段。
- “协同进度”是执行任务的只读状态投影，回答“各角色做到哪一步”；“关联处理记录”是来源订单下游单据的只读追溯投影，回答“已经形成了哪些业务事实”。两者语义不同，必须分块展示，不能相互替代或混入正文事实网格。
- 售后详情的右侧固定只承载上述两个投影；问题、原单、方案、结果与附件属于售后主单正文，固定在左侧。页面布局不能改变事实所有权，也不能赋予发起角色跨模块执行权限。

### 159.2 销售关联记录投影

- `SalesAfterSale.relatedDocuments` 由来源销售订单实时投影，不作为售后主单手工维护字段。当前有效类型包括销售出库、销售发票和应收账款。
- 销售出库取来源订单下未冲销的出库记录；销售发票排除已作废、已冲销、红冲或已红冲记录；应收账款排除同类无效状态，并允许通过来源销售订单或该订单有效销售发票建立关联。
- 每条记录只暴露类型、单号、状态和受权限约束的详情路径。投影为空时显示明确空态，不生成占位灰格，也不伪造执行单据。

### 159.3 销售与采购同构字段

- 关联原单事实按同一顺序投影：原单号、往来单位、联系人、原单状态、原单金额、交付日期/预计到货；受影响明细必须同时保留名称、型号、规格、单位、原单数量和本次受影响数量。
- 销售使用客户、承诺交付、销售订单语义；采购使用供应商、预计到货、物料采购语义。语义替换不得导致一侧缺少型号/规格、改变字段层级或退化为另一套控件。
- 关联记录属于来源订单及其下游执行事实，售后单据接口只读返回；售后保存、受理、推进、作废和关闭不得通过客户端提交值覆盖该投影。

## 160. 售后详情辅助投影呈现合同（2026-07-27）

- 协同进度与关联处理记录是售后主单的辅助只读投影，其卡片高度由实际任务数和关联单据数决定。辅助投影不与左侧问题、原单、方案、结果正文强制等高，不得为了视觉对齐生成空任务、空记录或空事实格。
- 桌面端辅助投影可在售后正文滚动时保持可见，但其粘性行为只影响呈现，不改变任务、来源订单和关联单据的事实所有权；窄屏回落为普通文档流。
- 售后页面的 CNY 金额统一显示 `￥` 和两位小数。该格式化只作用于界面显示，不修改服务端数值、币种代码、金额精度或财务确认结果。

## 161. 销售采购收口与仓库接续合同（2026-07-28）

### 161.1 已冻结的上游事实

- 报价单、销售订单、采购申请、物料采购、资产采购、销售售后和采购售后的现有生命周期、角色负责人、价税、财务投影及关联记录是仓库阶段的上游基线。仓库页面只能消费这些事实或回写自己负责的库存执行结果，不能重新解释订单金额、负责人、售后方案或财务状态。
- 销售与采购同类订单共用列表、卡片和详情的结构母版，但履约维度必须保持角色语义：销售读取备货、出库、开票和回款；物料采购读取到货、质检、入库、收票和付款；资产采购读取到货、验收、登记、收票和付款。
- 历史单据的责任人、打印快照和执行日志按生成时事实保留。新的候选与确认命令必须执行当前角色过滤，但不得为了页面看起来统一而批量改写历史快照。

### 161.2 采购收货交接

- 已确认物料采购订单按剩余未收数量自动生成采购收货任务。仓库列表展示任务，旧 `/warehouse/purchase-receipts/new` 只允许返回任务列表；前端和服务端都不得提供脱离采购来源的空白新建。
- 收货任务的来源采购单、供应商、采购行和采购暂存仓由上游冻结。仓库只维护本次实际到货数量、批次、到货日期、暂存库位、附件和备注；确认到货后才形成采购暂存仓物理库存。
- 需检物料进入质检冻结，免检物料进入待入库；质量放行只把冻结数量转为待入库，仓库正式入库才增加合格与可用库存。部分收货完成后按剩余数量继续生成任务，不能重复承接已到货数量。
- 采购暂存仓候选按公司和启用职能异步加载。业务判断必须等待候选请求完成；加载前的空数组只是加载态，不是“未配置采购暂存仓”的权威事实。

### 161.3 仓库阶段验收合同

- 仓库模块按采购收货、库存查询/批次/流水/补货、销售出库、生产领退料/完工入库、其他出入库、调拨、盘点、售后作业的顺序逐组验收。
- 每一组同时检查列表、窄屏卡片、详情、编辑或执行动作、来源数量上限、状态推进、反向冲销、权限、空态、错误态和关联记录；不能只检查静态页面。
- 仓库账号不得进入销售、采购、生产、质检或财务模块替其他角色修改事实；其他角色也不得通过跨模块入口替仓库确认库存移动。跨模块页面只提供完成结果、阻断原因和必要的只读关联。
- 销售、采购、售后、前端、UI 审计和生产构建已在进入仓库前通过门禁。仓库改动后至少重跑 `smoke:warehouse`、`smoke:flow`、`smoke:frontend`、`audit:ui` 和生产构建；若改动采购收货、销售出库或售后作业，还要分别补跑对应的 purchase、sales 或 after-sales 回归。

## 162. 采购收货事实所有权与输出边界（2026-07-28）

### 162.1 单据事实

- `PurchaseReceipt.code / company / sourceDoc / supplier / contact / contactPhone` 标识收货任务及其冻结来源；公司、供应商和联系人从物料采购订单承接，仓库不得在收货时改写。
- `date / owner` 是实际到货确认事实。保存填写内容时允许日期暂空且不生成经办人事实；确认到货时必须有实际到货日期，`owner` 由服务端读取当前登录账号，不信任客户端提交的显示名称。
- `warehouse / location / note` 分别表示采购暂存仓、实际暂存库位和交接记录。采购暂存仓由来源订单锁定，暂存库位从该仓库受控候选中选择；三者都必须在详情正文可追溯，不能只存在于编辑表单或摘要侧栏。
- 每条 `products[]` 同时保留来源采购数量、累计已到厂、本次收货上限、本次实收、批次、质检要求和后续正式仓库/库位。来源进度用于解释与校验，不替代本次实收，也不计入本次库存移动。

### 162.2 流程责任

- `待收货` 的下一步是进入登记页补齐实际到货事实；确认命令按行把需检数量转入质检冻结，把免检数量转入待入库，并按采购剩余量决定是否生成续收任务。
- `待质检` 只允许追踪来料质检任务。质量判定拥有合格、让步、不合格和待判数量，采购收货页面只读投影，不允许仓库在收货单上代替质量人员判定。
- `待入库` 由仓库逐行确定正式仓库和库位并执行正式过账。`已入库` 是执行完成态；可用库存与纠错结果以库存台账和独立冲销记录为准，不能通过重新编辑原收货单改写。

### 162.3 文件输出

- 采购收货单只承担内部执行、数量衔接和审计责任，不建立打印快照，也不提供打印或 PDF 路由。物料采购订单是当前采购链的对外 ERP 文件；供应商送货单、合格证、质检报告等外部文件通过附件关联到采购收货。
- 页面移除输出动作不删除历史业务数据，也不影响浏览器中的详情查看、附件下载、日志、库存流水或冲销能力。以后若要生成法定入库凭证，必须单独定义凭证主体、编号、审批、签署和冻结快照，不得把当前内部采购收货详情直接恢复为可打印页面。

## 163. 采购收货库位、批次与质检派生事实（2026-07-28）

- 采购暂存仓权威键为 `WH-QC-HOLD`，显示名称为“采购暂存区”，`locationCount = 1`，唯一库位为 `QC-AUTO`。历史名称和历史暂存库位在读数据时迁移到新事实，库存行键、采购收货、采购订单、库存流水和来料质检投影必须保持一致。
- 仓库引用通过 `locationOptions[]` 投影可选库位。候选同时包含按仓库库位数量和前缀生成的基础库位，以及已有库存、库存流水、采购收货暂存位置和正式入库去向中的历史细分库位。正式入库提交的 `destinationLocation` 必须属于所选 `destinationWarehouseCode`。
- `products[].batch` 在 `草稿 / 待收货` 阶段不是客户端输入事实。保存接口忽略客户端批次；状态从待收货进入待质检或待入库时，服务端以 `receiptCode + lineIndex` 生成批次。到货事实形成后批次冻结，只能通过独立纠错流程处理。
- `incomingQualityControl` 的权威来源是物料主数据，采购订单保存时形成来源快照，采购收货再次按物料属性和来源快照派生；`qcRequired` 只能由规则函数计算。免检、不适用、无需质检不生成来料质检任务，其余规则进入质检冻结。
- 页面上的“到货检验”是只读解释字段，不是可编辑开关。前端显示 `incomingQualityControl`，服务端以同一规则决定主动作、库存阶段和来料质检任务，避免显示与实际分流不一致。

## 164. 采购入库任务、拒收与可重复入库事实（2026-07-28）

本节覆盖第 161–163 节中与下列规则冲突的旧口径：以采购收货作为总对象名、到货确认时生成库存批次、待质检整单阻断正式入库、每行只保存一个正式仓库/库位、以及采购售后补发另建收货与正式入库执行链。`PurchaseReceipt` 和 `WR` 作为兼容数据名保留，其业务语义归一为 `PurchaseInboundTask`。

### 164.1 聚合与事件

```ts
type PurchaseInboundTask = {
  code: string
  sourceDoc: string
  sourceType: 'purchase_order' | 'purchase_after_sale'
  sourceAfterSale?: string
  products: PurchaseInboundTaskLine[]
  arrivalResults: PurchaseArrivalResult[]
  inboundPostings: PurchaseInboundPosting[]
}

type PurchaseArrivalResultLine = {
  receiptLineId: string
  arrivalQty: number
  acceptedQty: number
  refusedQty: number
  exceptionHeldQty: number
  refusalReason?: string
  exceptionNote?: string
}

type PurchaseInboundAllocation = {
  receiptLineId: string
  quantity: number
  warehouseCode: string
  location: string
}
```

- `PurchaseInboundTask` 是采购订单或采购售后补送计划的仓库任务投影；`PurchaseArrivalResult` 是不可变到货结果；`IncomingQualityDecision` 仍由质量域拥有；`PurchaseInboundPosting` 是可重复正式入库事件；`PurchaseReceiptException` 是拒收/异常暂收交给采购的协同事实。
- 到货结果逐行满足 `arrivalQty = acceptedQty + refusedQty + exceptionHeldQty`。正常接收进入采购暂存；当场拒收不生成库存事实；异常暂收进入独立受控保管数量，不进入合格、可用、质检冻结或待入库。
- 历史记录只有 `qty` 时兼容投影为 `arrivalQty = acceptedQty = qty`、拒收和异常暂收为零。新增写入仍可把 `acceptedQty` 同步到旧 `qty`，但业务校验必须读取显式数量字段。

### 164.2 数量守恒与并行状态

- 采购行待履约数量为 `orderedQty - sum(acceptedQty) - approvedClosedQty`。当场拒收不减少待履约数量；活动异常暂收数量从“可再次生成待收货任务”的额度中占用，处置为退回后释放，处置为接收后转入正常接收。
- 暂存物理数量为 `acceptedQty + exceptionHeldQty - inboundPostedQty - returnedQty - custodyReturnedQty - scrappedQty`；异常暂收必须在独立字段中展示，不能混入合格或可用库存。
- 可入库数量逐来源行计算：`exemptAcceptedQty + qualityReleasedQty + approvedConcessionQty + reinspectionAcceptedQty - inboundPostedQty`。该值大于零即允许仓库入库，不以整单 `status` 或其他行的待判数量作为阻断。
- 拒收、质检、不合格处置和入库分别投影。任务可以同时拥有 `待收货 / 待质检 / 可入库 / 部分入库 / 待采购处理` 多个维度；生命周期字段只表示任务是否活动、完成、取消或冲销。

### 164.3 到货拒收命令

- `SubmitPurchaseArrivalResultCommand` 仅允许仓库角色对待收货任务执行，要求实际到货日期、逐行到场/接收/拒收/异常暂收数量、采购暂存库位和幂等键。服务端校验来源行、单位、剩余承接额度及数量等式。
- 拒收或异常暂收大于零时必须填写原因分类和说明；附件与现场确认信息作为证据保存。仓库允许使用订单/供应商/物料不符、超容差、包装/标签/文件/运输明显异常等客观原因，不产生技术质量结论。
- 命令成功时只对 `acceptedQty` 产生质检冻结或免检待入库；只对 `exceptionHeldQty` 产生受控保管事实；`refusedQty` 不增加任何库存数量或库存流水。
- 命令同时创建唯一的 `PurchaseReceiptException` 和采购侧通知。重复幂等键返回原结果；同一到货结果不能重复生成采购异常或重复增加暂存数量。

### 164.4 采购售后衔接

- `PurchaseReceiptException` 保存来源采购单、入库任务、到货结果、来源行、拒收/异常暂收数量、原因、附件、仓库经办人和采购处置状态。采购拥有补送、关闭余量、质量复核、让步、退换/返工、索赔和金额处理决定。
- 当场拒收不创建仓库退货任务。异常暂收实物离厂使用 `ReturnExceptionCustodyCommand`，只减少受控保管数量；已正常接收或正式入库后退回使用采购售后生成的 `PurchaseReturnExecution`，按真实来源仓库扣减。
- 采购售后形成补发、换货或返工品回厂计划时，由 `EnsurePurchaseInboundTaskCommand` 生成带 `sourceType = purchase_after_sale` 和 `sourceAfterSale` 的采购入库任务。补救来料继续执行同一到货结果、质检和入库命令；旧的仓库售后“供应商补发收货 / 补发正式入库 / 换货正式入库 / 返工品正式入库”不再新增。

### 164.5 正式入库与批次

- `PostPurchaseInboundCommand` 接收一个或多个 `PurchaseInboundAllocation`，允许同一来源行分多次、分多个正式仓库和库位入库。每次提交形成不可变 `PurchaseInboundPosting`；累计分配不得超过命令执行时的可入库数量。
- 命令必须提供幂等键并对来源行可入库余额执行原子校验。活动草稿分配若占用额度，必须有过期或取消机制；原型未实现草稿预留前，只有提交瞬间才占用数量。
- 物料 `batchControl = 不追踪批次` 时 `stockBatchCode` 为空；`batchControl = 批次管理` 时在该到货来源行第一次正式入库时生成确定性批次，后续分仓和部分入库复用。供应商批号、到货行号和质检任务号在批次生成前承担追溯。
- `postedQuantities.lines[]` 追加每次真实分配，不再用单个 `stockStage = posted` 表示整单一次完成。只要仍有可入库数量，任务继续开放登记入库；完成条件由剩余待收、待判、可入库、异常暂收和待处置数量共同推导。

### 164.6 命令幂等、收票与补救门禁

- `SavePurchaseInboundDraftCommand` 与 `SubmitPurchaseArrivalResultCommand` 是两个独立命令。前者只更新可编辑草稿字段，后者才写入不可变到货结果、采购暂存库存、质检任务和采购异常。旧通用状态命令不得承担到货提交语义。
- `PostPurchaseInboundCommand` 查找既有 `inboundPostings[].idempotencyKey` 的顺序必须早于任务主状态校验。命中时返回原 `PurchaseInboundPosting`；未命中时才校验当前是否仍有可入库数量和有效状态。
- 采购发票的可匹配数量读取 `sum(PurchaseInboundPosting.lines.postedQty)`，不读取整单是否为 `posted / 已入库`。因此部分入库可按已过账数量收票，且累计发票数量不得超过该来源行累计正式入库数量。
- `EnsurePurchaseInboundTaskCommand` 既用于新受理采购售后，也用于历史活动售后的幂等迁移。唯一键为活动任务的 `sourceType = purchase_after_sale + sourceAfterSale`；迁移和重复受理不能产生第二张补救待收货任务。
- 采购售后补救任务逐行冻结 `plannedQty`。到货命令校验 `acceptedQty + exceptionHeldQty <= plannedQty`，不能用原采购订单剩余量替代补救计划量；超过计划的到场实物只能进入 `refusedQty`。
- `ResumePurchasePaymentCommand` 对补发、换货和供应商返工方案增加补救入库门禁：关联采购入库任务未达到已入库/已完成时，付款恢复拒绝执行。单纯交付跟进且无补救实物的付款暂缓不受此门禁影响。
- `ReturnExceptionCustodyCommand` 完成后重新计算剩余异常暂存、待质检、可入库和累计入库。异常暂存为零且无接收数量时投影为 `status = 已拒收`、`stockStage = exception_returned`；存在接收数量时按剩余业务事实推导。

## 165. 销售采购跟进投影布局与商务记录分组合同（2026-07-28）

- `SalesOrderRelatedRecordProjection` 与 `PurchaseOrder.relatedDocuments` 的事实内容不变，页面位置统一为跟进页右栏、状态进度下方。该变化只调整信息架构，不改变记录来源、去重规则、只读权限或跨模块边界。
- 销售备货投影增加展示派生值 `coveragePercent = min(100, coveredQty / remainingQty * 100)`；已发完或待发数量为零时显示 100%。`coveredQty` 仍由当前待发范围内的有效库存预留和生产安排构成，不得因页面展示而扩大预留或生产事实。
- `SalesDeliveryRecord` 只读投影补充 `warehouse` 与 `owner`，来源为仓库销售出库记录；缺失时分别显示“待仓库确认”和“—”。销售页面不得提交或覆盖这两个字段。
- `PurchaseOrderProgressFacts.lines` 仍是逐行进度唯一来源。未关闭待收余量时，页面百分比以 `arrivedQty / orderedQty`、`inboundQty / orderedQty` 派生；采购依第 166 节关闭待收余量后，统一改用 `receiptTargetQty` 作为履约分母。待检、放行、不合格数量分别读取 `pendingQcQty / releasedQty / rejectedQty`，不得互相推算或将质检放行等同正式入库。
- `CommercialFollowUpEvent.kind` 是商务记录分组键：销售分为 `sales_invoice / sales_payment`，采购分为 `purchase_invoice / purchase_payment`。每组的累计、待登记和百分比独立计算，不能把开票与回款或收票与付款混加为一个完成度。
- 商务记录的分组与紧凑显示不改变命令合同：新增仍只提交金额、日期、可选备注和幂等键；删除仍为软删除并重算对应种类的累计金额和状态；`source = legacy` 的迁移记录不可删除。

## 166. 采购收货容差、履约余量关闭与售后任务收口合同（2026-07-28）

本节是采购订单履约数量和售后执行模块的最新权威补充，覆盖历史“任何超收均拒绝”和“售后生成财务任务”的旧实现口径。

```ts
type PurchaseOrderReceiptPolicy = {
  overReceiptTolerancePercent: number; // 当前确认快照默认 5
}

type PurchaseReceiptClosure = {
  sourceLineId: string;
  materialCode?: string;
  name: string;
  closedQty: number;
  uom: string;
  reason: string;
  closedAt: DateTime;
  closedBy: EmployeeName;
}

type PurchaseOrderLineReceiptProgress = {
  orderedQty: number;
  arrivedQty: number;             // 累计正常接收
  closedQty: number;              // 采购批准不再交付
  receiptTargetQty: number;       // max(0, orderedQty - closedQty)
  remainingQty: number;           // max(0, receiptTargetQty - arrivedQty)
  maxReceivableQty: number;       // orderedQty * (1 + tolerancePercent / 100)
  remainingReceivableQty: number; // max(0, maxReceivableQty - arrivedQty)
  overReceivedQty: number;        // max(0, arrivedQty - orderedQty)
}
```

- 到货写入校验为 `cumulativeAcceptedQty + cumulativeExceptionHeldQty <= maxReceivableQty`。`refusedQty` 记录到场但未承接的实物，不占接收上限；超过容差的数量必须落入拒收或受控异常，不得进入质检冻结、待入库或正式库存。
- 待收货任务生成量使用 `remainingQty`，不是 `remainingReceivableQty`。容差只开放真实超收承接能力，不扩大采购订单的应交义务。
- `ClosePurchaseReceiptRemainderCommand(orderCode, reason)` 只允许采购确认权限执行。要求订单已确认、至少发生一行实际到货、存在 `remainingQty > 0`、原因不少于 4 个字，且不存在仓库已经开始填写的后续待收货任务。
- 命令逐行追加不可变 `PurchaseReceiptClosure`，取消未执行待收货任务并重新投影履约目标。它不改写采购订单原数量，不冲销到货/质检/库存，不关闭商务跟进，也不代替整单作废或最终关闭。
- 到货完成与入库完成分别按 `arrivedQty >= receiptTargetQty`、`inboundQty >= receiptTargetQty` 判断。`closedQty` 和 `overReceivedQty` 必须在采购跟进逐行可见，不能只用一个“已完成”状态覆盖。
- 订单确认时冻结 `overReceiptTolerancePercent`。未来配置若改变，已确认订单继续使用自身快照；数据库实现应对 `PurchaseReceiptClosure(orderCode, sourceLineId, closedAt)` 建立可审计实体和来源行索引。
- `AfterSalesExecutionModule` 当前只允许 `仓库 | 质检 | 生产` 的物理执行任务。确认金额和商务记录由销售/采购负责人维护；财务不再作为售后任务模块，历史财务任务不得进入 `executionTaskCodes / executionTasks` 当前投影。
- `CommercialFollowUpEvent` 继续是轻量业务记录，不升级为应收、应付、发票或银行流水凭证。历史不可达财务数据只允许迁移归档，不得重新驱动当前页面状态。

## 167. 统一库存事实、仓库事件与自动交接合同（2026-07-28）

本节定义库存与仓储四条主链的权威事实模型。它覆盖历史页面中按业务单各算一套库存、生产/质量手工创建仓库单、自由填写批次和仓库跨模块执行的旧口径。

```ts
type InventoryKey = {
  companyCode: string;
  warehouseCode: string;
  location: string;
  materialCode: string;
  batch: string; // 不追踪批次时必须为空
}

type InventoryFact = InventoryKey & {
  physicalQty: number;
  qualifiedQty: number;
  reservedQty: number;
  allocatedQty: number;
  frozenQty: number;
  qualityHoldQty: number;
  pendingInboundQty: number;
  rejectedHoldQty: number;
  exceptionHoldQty: number;
  inTransitQty: number;
  availableQty: number;
  uom: string;
}

type MaterialControlSnapshot = {
  batchControl: '批次管理' | '不追踪批次';
  batchTracked: boolean;
  shelfLife: string;
  incomingQualityControl: string;
  inboundQualityControl: string;
  defaultWarehouse: string;
}

type StockLedgerEvent = {
  code: string;
  occurredAt: DateTime;
  inventoryKey: string;
  movementDirection: 'in' | 'out' | 'hold' | 'release' | 'transfer';
  quantityNumber: number;
  uom: string;
  sourceType: string;
  sourceDoc: string;
  sourceLineId?: string;
  physicalBefore: number;
  physicalAfter: number;
  qualifiedBefore: number;
  qualifiedAfter: number;
  availableBefore: number;
  availableAfter: number;
  reversalOf?: string;
  idempotencyKey?: string;
}
```

### 167.1 数量不变量

- `0 <= qualifiedQty <= physicalQty`。
- `reservedQty >= 0`、`allocatedQty >= 0`、`frozenQty >= 0`，且三者合计不得大于 `qualifiedQty`。
- `availableQty = max(qualifiedQty - reservedQty - allocatedQty - frozenQty, 0)`。任何命令不能直接提交或覆写 `availableQty`。
- 采购暂存实物必须满足 `physicalQty = qualifiedQty + qualityHoldQty + pendingInboundQty + rejectedHoldQty + exceptionHoldQty`；同一实物不能同时复制到采购暂存仓和正式仓。
- `qualityHoldQty / pendingInboundQty / rejectedHoldQty / exceptionHoldQty / inTransitQty` 是受控状态数量，必须有来源事件和当前持有方；不得为展示方便合并到合格或可用数量。
- 每次库存写入先校验来源余额和任务状态，再以同一事务更新余额、占用来源与流水。原型通过集中刷新与断言模拟该边界；数据库阶段必须以事务、行锁和唯一键落地。

### 167.2 库存流水

- 所有实物、合格、占用、冻结、在途和受控数量变化都必须追加 `StockLedgerEvent`。列表文案可以中文化，但计算和审计使用结构化方向、数值与前后余额。
- 采购入库、销售出库、生产领料/退料/完工入库、调拨、其他出入库、盘点调整和冲销不得各自拼装缺字段流水；统一调用库存事件写入能力。
- 流水不可编辑、不可删除。错误事件通过 `reversalOf` 生成等量反向事件，原事件和反向事件均保留。
- 幂等键至少在同一来源单据和命令类型内唯一；命中既有事件先返回原结果，再判断当前主状态，防止网络重试重复过账或被完成态误报失败。

### 167.3 物料属性快照

- 销售出库行、生产领料行、生产退料行、完工入库行、调拨行和其他出入库行在任务生成时保存 `MaterialControlSnapshot`。质量规则、默认仓库、批次和效期不能在执行途中回读已变化的主数据。
- `batchTracked = false` 时所有库存键、入库事件和退料事件的 `batch` 必须为空；不得生成 `AUTO`、单号或日期组成的伪批次。
- `batchTracked = true` 时批次必须来自合法库存候选、受控来源批次或第一次正式入库的系统生成结果。自由文本只允许保存“供应商批号”等外部追溯字段，不能直接成为库存批次。

### 167.4 销售出库事实

- `SalesDeliveryPlan` 属于销售域；`SalesIssueTask` 是仓库收到的执行投影；`SalesIssuePosting` 是正式出库事件。销售不写库存，仓库不改交付计划。
- 出库分配逐行包含仓库、库位、批次和数量。留空批次表示系统按可用量分配；显式批次必须来自当前库存候选并再次由服务端校验。
- `PostSalesIssueCommand` 原子扣减 `physicalQty / qualifiedQty`，消费对应 `reservedQty` 并追加流水。只减少总库存却不消费预留，或只改出库单状态不写流水，均属于无效实现。

### 167.5 生产仓储自动交接

```ts
type ProductionWarehouseHandoff = {
  sourceReleaseCode: string;
  productionIssueCode?: string;
  productionReceiptCode?: string;
  handoffStatus: '等待生产释放' | '待出库' | '已回传生产' | '等待质量放行' | '待入库' | '已入库';
}
```

- `ReleaseProductionMaterialsCommand` 成功后幂等确保一张待出库 `ProductionIssueTask`，冻结用料行和物料属性快照，并把任务号回写生产释放。重复释放或读取旧释放时只补齐缺失任务，不生成第二张。
- `PostProductionIssueCommand` 扣减原料库存和生产分配，追加领料流水并把结果投影回生产执行；仓库不能修改工单、配方或释放数量。
- `ProductionReturnTask` 必须引用原工单/领料行。仓库确认退料后增加相应库存并追加退料流水；批次管理物料优先承接原领料批次。
- 完工申报按 `inboundQualityControl` 决定是否等待质量。`RecordQualityDecisionCommand` 或处置命令使卡片进入可入库时，幂等确保一张 `ProductionReceiptTask`；质量不创建仓库单，生产不选择最终库存过账结果。
- `PostProductionReceiptCommand` 使用冻结默认仓库或仓库选择的合法去向增加正式库存并追加流水，完成后只读回传生产与质量。

### 167.6 调拨、其他出入库与盘点

- 调拨发出事件从来源库存扣减并增加 `inTransitQty`；调拨收货事件减少对应在途并增加目标库存。调拨取消只能作用于未发出任务，已发出必须使用退回或冲销事件。
- 其他出入库必须保存原因代码、说明、经办人和来源引用。服务端禁止它承接已存在的采购、销售或生产来源，以免绕过主链审批和占用关系。
- 盘点任务逐行冻结 `InventoryKey` 并保存 `snapshotQty`。差异确认只追加盘盈/盘亏事件，不改写快照；任务结束或取消后解除同一来源冻结。

### 167.7 角色与数据库门禁

- 仓库 API 和页面只允许执行仓库命令；生产、销售、采购、质量和主数据来源在仓库中均为只读投影。跨模块编码可以审计展示，但不得授予来源模块操作或导航入口。
- 当前 JSON 原型用于冻结命令、状态和数量守恒，不是最终存储设计。原型确认后，数据库必须把 `InventoryFact / StockLedgerEvent / OccupationSource / WarehouseTask / WarehouseTaskLine / MaterialControlSnapshot / IdempotentCommand` 建成可事务提交、可并发校验的实体。

## 168. 当前库存投影、目标库位与盘点选择合同（2026-07-28）

### 168.1 当前库存与历史库存

- `InventoryFact` 的业务唯一键为 `companyCode + warehouseCode + location + materialCode + batch`。原型读取、种子补齐和兼容迁移均必须按该键去重；数据库阶段必须建立对应唯一约束。
- 当前库存接口只投影至少一个受控数量大于零的事实：`physicalQty / qualifiedQty / reservedQty / allocatedQty / frozenQty / qualityHoldQty / pendingInboundQty / exceptionHoldQty / inTransitQty`。全部为零的事实不属于当前余额结果。
- 零余额事实不能物理删除其审计历史；对应 `StockLedgerEvent`、来源单据、来源行和前后余额继续保留。需要查历史库位时从流水或历史库存投影读取。
- 当前库存接口必须幂等：连续读取不能新增库存事实、改变数量或制造新的库位键。

### 168.2 调拨目标库位

```ts
type WarehouseTransferTarget = {
  toWarehouseCode: string;
  toLocation: string;
}
```

- `toLocation` 属于调入仓库的受控库位候选，前端必须选择，服务端再次校验；客户端提交不存在或属于其他仓库的库位必须拒绝。
- 调出事件生成的 `targetInventoryKey` 必须包含 `toLocation`。发出时增加该目标键的 `inTransitQty`，收货时减少同一键的在途并增加正式库存，不能再回退到系统默认库位。
- 调拨回归按 `inventoryKey / targetInventoryKey` 核对，不得只按物料、仓库和批次取第一行，因为同一批次可以合法分布在多个库位。

### 168.3 盘点范围

- `CreateStocktakeCommand` 的 `scopeMode` 仅允许 `全仓盘点 / 按库位 / 按物料 / 按批次`；非全仓模式的 `scope` 必须来自所选仓库当前 `qualifiedQty > 0` 的库存事实候选。
- 开始盘点时由服务端重新解析范围并生成 `InventoryKey` 快照，客户端提交的行、账面数和统计值均不可信。
- 盘点冻结保护按明确范围作用于既有库存键，也作用于范围内可能新建的目标库存键；例如按物料盘点时，该仓库其他库位对同一物料的入库也必须被阻止。
- 盘点范围、仓库和负责人从开始盘点起冻结；计数阶段只能更新服务端快照中既有行的实盘数量。
- 财务模块退出当前业务事实模型。轻量开票/回款/收票/付款登记不生成库存事件，也不成为仓库任务的前置或完成条件。

## 169. 跨模块交接投影与动作归属（2026-07-28）

```ts
type ModuleHandoffProjection = {
  sourceModule: '生产' | '质量' | '仓库' | '采购' | '销售'
  targetModule: '生产' | '质量' | '仓库' | '采购' | '销售'
  sourceDocumentCode: string
  targetDocumentCode?: string
  status: '等待生成任务' | '已交接' | '处理中' | '已完成' | '异常'
  resultSummary?: string
  updatedAt: string
}
```

- `ModuleHandoffProjection` 是来源模块为当前角色提供的最小结果读模型，不是目标模块单据的权限代理。来源角色可以读取目标任务号、状态和结果摘要，但不能据此调用目标模块命令。
- 自动交接必须以服务端事实为准：生产释放幂等确保仓库领料任务，质量放行幂等确保仓库完工入库任务，质量处置完成后由生产状态重新开放下一动作。前端不负责补建下游单据。
- 同一页面上的主动作必须属于当前模块。生产可排产、开工、报工、包装和处理生产异常；质量可检验、判定、处置和复检；仓库可收货、拣配、过账、调拨和盘点。等待其他模块时只显示状态，不提供跨域路由或伪装成便利操作的按钮。
- 来源编码默认按纯文本展示。仅当目标对象属于当前模块且当前角色具有对应查看权限时，才生成可点击路由。审计关系仍通过编码、日志、状态投影和管理员级全链追溯保留。
- 生产备料申请提交后，生产结构冻结；服务端在同一提交事务中完成库存覆盖评估与采购缺口分流。仓库没有该计划申请的受理命令，兼容路径 `/production/material-requests/:code/accept` 固定返回 `410`。
- 采购申请以 `sourceMaterialRequest` 唯一关联备料申请。重复读取、迁移或命令重试不得生成第二张活动采购申请；采购页面只读展示来源编号，不把来源关系变成生产模块导航权限。
- 数据库阶段应把交接投影视为由来源事件和目标任务派生的读模型，不单独作为可编辑业务主表。目标任务唯一约束、来源引用、状态更新时间和幂等键必须保证同一交接不会形成多个活动任务。

## 170. 生产物料覆盖评估与采购申请唯一性（2026-07-28）

```ts
type ProductionMaterialCoverageEvaluation = {
  materialRequestId: string
  evaluatedAt: string
  evaluatedBy: '系统'
  basis: 'AVAILABLE_STOCK_PLANNING_SNAPSHOT'
  reservationEffect: 'NONE'
  status: '库存可满足' | '已转采购'
  lines: ProductionMaterialCoverageLine[]
  purchaseRequisitionId?: string
}

type ProductionMaterialCoverageLine = {
  requestLineId: string
  materialId: string
  requestedQty: Quantity
  inventoryCoveredQty: Quantity
  purchaseGapQty: Quantity
}
```

- 每行满足 `inventoryCoveredQty + purchaseGapQty = requestedQty`，两者均不得为负；同一物料多行的 `inventoryCoveredQty` 合计不得超过评估时该物料的 `InventoryFact.availableQty` 合计。
- 评估读取 `availableQty = qualifiedQty - reservedQty - allocatedQty - frozenQty`，不读取在途、待检、待正式入库或异常受控数量，也不因评估新增 `OccupationSource`。
- `SubmitProductionMaterialRequestCommand` 与缺口采购申请创建必须同事务提交。数据库为 `PurchaseRequisition.sourceMaterialRequestId` 建立活动记录唯一约束；命中既有来源时返回原采购申请。
- “库存可满足”只代表提交时可用库存足够，不承诺之后仍可释放。`ReleaseProductionWorkOrderCommand` 必须重新读取库存、形成 `allocatedQty` 来源并幂等生成 `ProductionIssueTask`，库存变化导致不足时按工单释放规则阻断。
- 采购申请关闭、取消或采购数量变更属于采购域事实，生产通过交接投影读取结果；不得回写覆盖评估快照。若生产需求变化，使用新修订或新的备料需求，不直接改写已确认申请。
- 原型字段 `availableQty / purchaseQty` 分别是 `inventoryCoveredQty / purchaseGapQty` 的兼容别名。进入数据库实施时使用明确业务名迁移，不沿用“仓库可备”语义。

## 171. 五模块数据库事实域、事务与迁移门禁（2026-07-28）

- 数据库逻辑域固定为主数据、销售、采购、仓库库存、生产、质量及公共审计/交接。`document_link` 只保存追溯关系，不授予目标模块权限。
- 库存事实唯一键为公司、仓库、库位、物料和非空批次键；库存占用来源、库存流水、仓库任务、物料属性快照、幂等命令和审计日志必须成为独立实体。
- 销售出库、采购到场/入库、生产备料自动分流、工单释放、生产领退料、质量判定/放行、完工入库、调拨、盘点和冲销是必须整体提交或整体回滚的事务边界。
- 一个生产释放只能关联一张活动生产领料任务；一个质量放行来源只能关联一张活动完工入库任务；一个生产备料申请最多关联一张活动采购申请；一个有效库存占用来源只能存在一次。上述规则依赖数据库唯一约束，不能只靠先查后写。
- 原型 `mutationQueue` 和单文件原子替换只用于单进程演示。正式并发使用库存行的确定顺序锁、业务单据乐观版本、来源行累计承接锁和事务内 outbox。
- 迁移顺序、实体清单、唯一约束、事务矩阵和开工门禁以 `docs/erp-web-final-freeze-database-blueprint.md` 为实施入口。数据库切换前不得双写 JSON 和数据库形成两个权威来源。
- 页面冻结门禁已经在 740px 实际子视口覆盖销售订单列表/跟进、采购订单列表/跟进、采购入库列表/详情、生产备料列表/详情和来料质检列表/详情。各页面 `clientWidth = scrollWidth = 740`，状态、数量、风险和主动作均保留；该结果冻结的是读模型完整性，不改变领域事实。
- `DocumentFactGrid` 的窄屏行布局属于共用投影规则：普通事实按两列排列时，奇数项的最后一项跨满整行，整行备注独立占行。不得使用容器底色形成看似存在字段的灰色空白格。

## 172. 三模块实跑后的派生事实与交接门槛（2026-07-29）

### 172.1 下一步动作派生

- 销售和采购的当前待办首先读取生产、交付、到货、质量、入库及商务事件的最新投影；订单生命周期状态只在缺少逐阶段事实时兜底。
- 同一页面的待办标题、动作按钮、说明和锚点必须读取同一 `nextStep`。不得出现标题已为“跟进供应商开票”，按钮仍由旧“已确认”状态派生为“等待仓库处理”的双重事实。

### 172.2 轻量商务与售后金额

- `CommercialFollowUpEvent` 的用户输入固定为金额、日期和备注，记录归属销售或采购订单，允许删除误登记。参考号与附件只兼容历史数据，不再是新增登记的字段或校验条件。
- 独立财务域不在当前产品范围。售后已有 `financialTreatment` 字段只作为兼容存储，页面语义为“商务调整”；退款、折让、应付扣减、供应商退款或付款暂缓由销售/采购记录结果，不生成财务执行任务或会计凭证。

### 172.3 采购拒收、补救和正式入库

- 到货整行拒收的数量从未进入采购暂存接收量，因此质量事实固定为“未送检”，处置事实为“仓库当场拒收”，入库事实为“不入库”；不得生成来料质检任务或质检冻结。
- 采购售后选择补发、退货换货或供应商返工时，`PurchaseAfterSaleRemedyReceipt` 是强制交接事实。其状态只有到达“已入库”或“已拒收”才终结；在此之前售后不能提交处理结果。
- `PurchaseReceiptInboundAllocation` 是正式入库前可保存的行级计划，至少保存来源收货行、数量、目标仓库和目标库位。同一来源行可拆分多个去向，数量和不得超过可入库量；批次管理物料的批次在正式入库时按来源行自动生成并被拆分记录共同引用。

### 172.4 调拨、盘点与未保存基线

- 库存调拨的 `toLocation` 必须与在途行的 `targetInventoryKey` 一致。旧记录缺少显示字段时可以由目标库存事实恢复，未来调出事务必须同时保存目标库位、在途数量和目标库存键。
- 盘点从范围快照形成冻结，逐行实盘后提交复核，完成时以差异写入不可变流水并解除冻结。实盘数量不能直接改写列表聚合值而不产生盘盈/盘亏事件。
- 未保存基线是客户端交互事实，不是业务生命周期。成功命令返回并刷新权威单据后必须重置基线，避免把已经成功的确认、提交或过账误判为未保存编辑。

### 172.5 候选数据权限与可重复回归

- 候选读取不是公共主数据读取的同义词。`purchase-invoices` 候选包含供应商、采购单、收货单、金额和收票状态，必须要求 `PERM-PURCHASE-EDIT`；销售、仓库等无采购权限账号返回 `403`。
- 页面链接、候选接口和业务 API 使用同一角色边界：隐藏菜单不能替代服务端授权，能够读取来源编号也不等于能够读取目标模块完整候选或执行目标命令。
- 集成回归不得假设固定样本永远处于草稿、待确认或未入库。保护型测试先读取权威快照再尝试伪造受保护字段；新建关系使用服务端返回的编码；重复命令按契约区分 `400/409` 拒绝与 `idempotentReplay` 成功回放。
- 独立财务接口的冻结事实为读写均返回 `410`。销售与采购轻量商务记录的测试不再创建财务账号、发票、应收或应付执行单。

### 172.6 交付、关联记录与通知投影

- `EffectiveDeliveryQuantity` 只来源于已经完成且未冲销的销售出库。冲销记录保留审计历史，但其数量对已发、待发和完成率的贡献为零；重新生成的待出库任务按新的有效执行链计算。
- `RelatedBusinessRecord` 是跨域结果投影，不天然代表操作权限。只有记录目标属于当前角色模块且角色具有对应查看权限时才生成可导航入口；其他记录保留编码、类型、状态和结果文本。
- `AssetAcceptance` 与 `AssetMasterRegistration` 是两个责任事实。采购可以确认资产到货和验收，基础资料责任人建立资产档案并回写档案编号；等待档案建立不是采购可执行动作。
- `PurchaseReceiptQuantitySummary` 至少区分计划、到场、接收、拒收和异常暂收。列表摘要不得用接收量代替到场量；整行拒收仍必须保留真实到场事实。
- `BusinessActorProjection` 把账号、人员和角色映射为用户可读名称。账号编码是授权和审计标识，不得作为负责人或操作人的默认页面文本。
- `BusinessNotification` 保存来源路径、来源单据、目标角色和事件类型。采购入库、销售出库、仓库内部移动分别投影给采购、销售、仓库；来源发生冲销时，原成功通知不再作为有效结果显示，冲销事件形成新的通知事实。

### 172.7 可执行动作、事件日期与兼容迁移

- `ExecutableActionProjection` 必须读取结构化阶段事实并在服务端命令中再次校验。生命周期状态只在没有阶段事实时兜底，不能生成一个确定会被服务端拒绝的按钮。
- `CommercialFollowUpEvent.occurredOn` 表示已发生日期，约束为 `occurredOn <= businessToday(Asia/Shanghai)`。历史应收应付的截止日不是商务事件日期，只有缺少专用日期、登记日期和更新时间时才允许作为兼容回退。
- 自动生成采购需求同时保存 `sourceExpectedDate` 与 `expectedDate`；前者保留来源业务意图，后者满足 `expectedDate >= applicationDate`，供后续采购订单执行和校验。
- `PurchaseAfterSaleRelatedProjection` 优先按 `sourceReceiptId` 和 `remedyReceiptId` 收敛收货、质检链。订单级全部关联只用于两个来源均为空的旧手工记录。
- `WarehouseExecutionActor` 由认证主体映射人员，过账、冲销、库存流水和审计事件在同一事务中使用同一投影。客户端提交的姓名或账号不得覆盖认证结果。
- 读取时兼容迁移必须在所有会补写黄金样本的步骤之后再次验证关键不变量。待检、待入库、异常受控的采购流水和库存事实只能位于采购暂存仓；正式入库事件才进入目标仓。

### 172.8 采购暂存数量分区与流水闭环

- 同一采购来源批次在正式入库前只能有一个 `InventoryKey`，归属 `WH-QC-HOLD / QC-AUTO`。历史正式仓重复行迁移时合并受控数量并删除副本，不能把 `physicalQty` 相加造成重复库存。
- 来料质检的不合格数量使用独立 `rejectedHoldQty`，不得藏在物理库存差额中。页面风险摘要同时展示待检、待入库、不合格隔离和异常暂存，不能用单一状态覆盖其他受控数量。
- 采购链至少形成以下库存事实事件：到货增加物理在库、质检冻结增加待检、质检判定减少待检并增加待入库或不合格隔离、正式入库减少待入库和暂存物理、目标仓增加合格在库。复检、让步和退供必须先解除对应隔离事实。
- 补货预计量按物料的正式入库目标仓投影采购暂存中的已放行数量。暂存事实仍归采购暂存仓，但不能因此让目标仓补货预警漏算已在途的正式入库准备量。
- 只读查询不得改写事实文件或数据库时间戳。兼容迁移只有在归一化后的数据确实变化时才能持久化；重复读取的库存行数、事实键和文件更新时间必须稳定。
- 采购售后的 `sourceReceiptId / qualitySourceCode` 是来源事实。历史记录可在存在唯一“不合格来料决定”时补齐，补救收货不能覆盖或替代原始收货与质检链。

## 173. 六模块状态与交互投影合同（2026-07-29）

### 173.1 主状态、阶段事实与进度

- `LifecycleStatus` 只表达单据主生命周期；`QualityDecision`、`WarehouseStage`、`DeliveryProgress`、`CommercialProgress`、`AttentionFact` 是并列投影，不得拼成第二个主状态。
- 列表统一投影为 `mainStatus + attention + facts[] + nextStep`。业务模块可以选择不同 `facts`，但状态色、徽章、排布和移动端顺序属于公共展示合同。
- `QuantitativeProgress` 必须同时存在可审计的 `currentQty` 与 `targetQty`，并保存单位和口径。缺少真实分子或分母时只显示阶段文字，不生成百分比或进度条。
- 当前生产的“完工入库量 / 计划量”满足进度条件；质检结论、仓库入库阶段和商务是否开始不满足，不得为视觉装饰构造伪数值。

### 173.2 轻量商务命令反馈

- `CommercialFollowUpEvent` 成功创建后，客户端以服务端返回事件作为成功事实，关闭登记表单并刷新累计、待登记金额、阶段进度和关联记录。
- 删除命令仍必须由用户在系统内确认。确认内容至少包含类型、发生日期、金额和删除后的重算影响；取消不改变事件，确认成功后所有派生投影从剩余事件重算。
- 浏览器原生确认不是业务事实，也不应成为高频轻量操作的唯一交互宿主。系统内确认对话框必须可聚焦、可取消、可由自动化稳定操作。

### 173.3 响应式同源投影

- 桌面表格、平板宽卡片和移动卡片读取同一列表行投影。响应式只改变布局，不得删掉主状态、关键数量、异常/关注和下一步。
- 页面断点验收至少记录 `innerWidth`、`scrollWidth`、加载完成状态和关键状态组件数量。整页必须满足 `scrollWidth <= innerWidth`；单个内部表格需要横向滚动时必须由明确容器承接。
- 基础资料不使用业务进度条。主数据的启停、引用次数、质量属性和追溯属性是引用事实，不应模拟销售、采购、生产的履约生命周期。

## 174. 仓库责任状态与未知日期排序事实（2026-07-29）

### 174.1 整单拒收与质检投影

- `FullRefusal = refusedQty > 0 AND acceptedQty = 0 AND exceptionHeldQty = 0`。该条件按收货单所有明细数量汇总判定，不能只读取物料质检属性或单据文字状态。
- `FullRefusal = true` 时，`QualityStage = 未送检`、`InboundStage = 未入库`、`WarehouseRoleStatus = 已拒收`，下一责任投影为采购处理拒收异常。
- 部分拒收不满足 `FullRefusal`；正常接收或异常暂收部分仍按各自数量进入质检、受控暂存与后续处置，不得被整单结论覆盖。

### 174.2 当前角色主状态

- `WarehouseRoleStatus` 由仓库是否仍有可执行动作派生：整单拒收为“已拒收”，待质检和异常暂收为“等待协同”，可收货、可入库和部分入库继续属于“执行中”。
- 主状态、质量阶段、入库阶段和异常事实同时存在但职责不同。列表主徽章使用角色状态，事实区继续分别显示质量、入库和异常，不拼接成另一个生命周期。

### 174.3 未知日期排序

- 日期比较先区分 `KnownDate` 与 `UnknownDate`。空字符串、`-` 和 `—` 均属于未知日期。
- 无论升序还是降序，已知日期按真实顺序排列，未知日期统一放在末尾；状态优先排序中的同状态日期次序也遵守同一规则。

## 175. 部分可生产能力与质量任务滞留事实（2026-07-29）

### 175.1 生产任务动作优先级

- `TaskBuildRemaining = max(DemandQty - PlannedWorkOrderQty, 0)`。只要该值大于零，任务仍具有建单动作；物料缺口只限制安排生产和领料，不限制建立计划工单。
- `TaskReleasableQty = Σ WorkOrderReleasableQty`，`TaskUnreleasedQty = Σ WorkOrderUnreleasedQty`。当 `TaskReleasableQty > 0` 时，当前生产动作优先于剩余物料等待。
- `0 < TaskReleasableQty < TaskUnreleasedQty` 投影为“先安排可安排数量，余量待物料”；`TaskReleasableQty >= TaskUnreleasedQty` 投影为“安排全部可安排数量生产”；只有 `TaskReleasableQty = 0` 才投影物料阻断原因。
- 任务下一步与详情主按钮共用该优先级。建单动作必须进入带任务参数的新建工单页，并以尚未建单的来源明细和数量作为默认值。

### 175.2 异步事实稳定态

- 生产库存投影和来料质检实时收货投影均属于列表派生事实的输入。输入加载完成前，页面只能展示加载态，不得用空数组计算并短暂暴露错误状态。
- 每次生产库存请求使用递增请求标识。只有最后一次请求可以写入数据或结束加载态，避免快速切换页面时较旧响应覆盖较新事实。

### 175.3 质量滞留

- `QualityStaleDays = ShanghaiToday - QualityTaskDate`，仅对未关闭、未作废且非质检标准类记录计算。`QualityTaskDate` 是质检任务自身的创建/检验日期，不是采购预计到货日。
- `QualityStaleDays > 0` 时显示“滞留 N 天”；该关注项表示任务年龄，不自动推导逾期责任、SLA 违约或不合格结论。
- 状态优先排序先按处置阶段排序，`未进入处置 / 未开始` 与其他待办阶段均排在已完成之后，再按任务日期从旧到新排列。

## 176. 仓库引用、生产加载与质检时限事实（2026-07-29）

### 176.1 仓库编码与名称

- `WarehouseCode` 是仓库在业务单据、库存事实和流水中的稳定身份。
- `CanonicalWarehouseName(code) = ActiveWarehouseMaster.name`。单据持久化的名称只作为历史快照/兼容字段，展示和迁移优先使用编码对应的当前主数据名称。
- 库位候选必须满足 `Location ∈ ActiveLocations(SelectedWarehouseCode)`；没有有效库位时应阻断提交并提示维护仓库资料，只有一个候选时允许自动选中。

### 176.2 采购预计日期与质量时限

- `PurchaseExpectedArrivalDate` 表达采购侧预计到货，不等于质量任务截止日期；来源为空时展示“未登记”，不得推导一个虚构日期。
- `QualityTaskDate` 取实际收货/任务创建日期，`QualityDueDate >= QualityTaskDate`。历史数据若质量截止日早于任务日期，读写迁移将其校正到任务日期。
- 质检滞留、排序和提醒只读取质量任务自身日期与状态，不再读取采购预计到货日期。

### 176.3 生产聚合查询

- `/production/work-orders` 返回工单及任务、备料申请、执行卡、下达批次的只读查询模型，用于首屏装载并避免 N+1 请求。
- 聚合响应不是新的业务事实源；各集合仍由原有领域记录生成，单张工单详情和命令仍使用专用接口及既有版本/幂等规则。

### 176.4 异步详情真实性

- 运行时详情未返回时必须显示加载态或错误态，不得先渲染本地样本为该编码的真实单据。
- 页面只有在响应编码与当前路由编码一致时才可落地详情；较早请求的返回不得覆盖已经切换后的页面。

## 177. 业务人员投影、采购暂存引用与样本角色事实（2026-07-29）

### 177.1 业务人员与认证账号

- `BusinessActorName` 是单据、任务、列表和关联记录中的用户可见经办人名称。
- `AuthenticatedAccountCode` 是权限判断与审计追踪使用的技术身份。业务投影不得拼接为 `BusinessActorName / AuthenticatedAccountCode`。
- 新执行动作写入 `BusinessActorName`；历史记录若仍保存“姓名 / ACC-*”，只读投影去除账号后缀。审计日志继续独立记录认证账号、来源地址、动作和目标编码。

### 177.2 采购暂存仓引用稳定态

- `PurchaseStagingCandidates = ActiveWarehouses(company, kind = 采购收货)`，是物料采购单的必需主数据候选。
- `PurchaseStagingLoading = true` 时页面不得展示候选数为零或据此阻断操作。只有最后一次、且公司仍与请求快照一致的响应可以更新候选数、错误和自动选择。
- `CandidateCount = 1` 且单据尚未选择仓库时自动选择；`CandidateCount = 0` 时阻断物料采购保存/确认；资产采购不适用该约束。

### 177.3 测试样本角色

- 生产过程质量任务的 `Inspector` 必须是质量角色人员；当前代表样本统一由林珊承接，不使用财务岗位人员代替。
- 采购侧轻量收票与付款进度由采购自行登记和查看。采购售后结果可以说明“采购付款跟进恢复”，不得再描述独立财务模块执行付款暂停或恢复。
- 样本数据虽可增删，但仍属于原型验收输入，必须遵守与正式业务相同的角色边界、字段语义和跨模块只读原则。

## 178. 确认、未保存与质量任务动作事实（2026-07-29）

- “请求确认”不是业务事实，只是命令执行前的交互闸门。取消必须保持原单据、原状态和编辑内容不变；确认后仍要以服务端命令成功为准，不能先在前端宣告完成。
- 未保存状态由“可编辑页面当前快照 ≠ 最近一次成功加载/保存/提交后的基线”派生。只读页、加载未完成、服务端失败页和已成功重置基线的页面不应触发离开提醒。
- 来料质检任务的身份和生命周期来自采购收货；生产质检任务来自生产执行批次。两类任务不能脱离来源创建，也不能通过前端通用作废切断来源链。
- 来料或生产异常先形成数量判定：放行数量进入后续入库，异常数量保持冻结，再按复检、返工、让步、报废或转采购处理。不存在独立于数量和来源事实的“登记异常即成功”状态。
- 质量日志以服务端返回的时间、执行人、动作和备注为准。前端只负责投影完整记录，不生成刷新后消失的当前会话日志。
- 系统确认框可以统一视觉与可访问性，但不能统一替代领域校验、权限、版本冲突、幂等键或事务；这些仍由各业务命令在服务端决定。

## 179. 终态锁定、失败显式化与重复命令事实（2026-07-30）

### 179.1 终态与编辑地址

- `TerminalDocument = Status ∈ {已完成, 已关闭, 已作废}`。终态事实不因路由包含 `/edit` 而改变；兼容编辑地址只能渲染只读投影。
- `TerminalDocument` 的字段、引用选择器、附件和主动作全部锁定。页面标题必须表达“只读”，不能同时出现“编辑”和“已锁定”两个矛盾信号。
- 终态锁定由前后端共同保证：前端移除写入口，服务端仍拒绝普通保存覆盖。任一层都不能代替另一层。

### 179.2 不存在、失败与恢复

- `NotFound` 表示服务已成功回答但目标编码不存在；页面显示对象不存在、返回路径和重试。
- `LoadFailure` 表示服务没有提供可信答案。页面必须显示错误和重试，不能把本地样本、旧缓存或空数组解释成最新运行事实。
- 生产运行聚合、库存投影和当前详情是派生下一步的输入。任一关键输入处于加载或失败态时，不得先用样本推导可安排数量、主状态或下一步。
- 重试是重新读取事实，不修改业务数据；成功后以新响应整体替换失败态，并按当前路由重新读取专用详情。

### 179.3 重复命令与并发

- 前端函数级互斥只防止同一页面会话的快速重复点击；它不是业务幂等保证。
- 状态转换命令必须校验当前生命周期，重复确认、提交或过账若已不适用，应明确拒绝；允许网络重试的命令使用稳定幂等键并返回原结果。
- 可编辑主档和需要并发修改的业务草稿使用修订号拒绝过期覆盖。服务端状态、修订号、幂等键和唯一约束共同决定是否形成新事实，按钮禁用仅改善交互。

## 180. 运行快照、库存执行与角色通知事实（2026-07-30）

### 180.1 运行快照可信度

- `RuntimeSnapshotState ∈ {loading, ready, stale, failed}`。首次请求成功前只能处于 `loading / failed`；内置样例不是运行事实，不能参与待办、数量或按钮可执行性计算。
- `stale` 只允许展示最近一次成功快照及其时间，所有依赖最新事实的写命令保持锁定。重新读取成功后以完整响应替换旧快照。
- `DocumentLoadResult ∈ {found, not_found, failed}`。只有 `found` 能创建可编辑草稿；路由编码本身不是单据存在证明。

### 180.2 采购入库与真实库位

- `PurchaseOrderInboundQty(line) = Σ EffectiveInboundPostingQty(line)`；有效 posting 必须属于未冲销收货，并保留每次分仓、分库位入库事实。收货单整体仍为“部分入库”不影响已过账数量累计。
- `DestinationLocation ∈ ActiveLocations(DestinationWarehouse)`。候选数为一时可自动选择，候选数大于一时必须显式选择；完工入库的正式库位不得为 `*-AUTO / 默认库位`。
- `BusinessOwner` 表示业务负责人；`AuthenticatedActor` 表示实际执行命令的登录人员。`ledger.operator / postedBy / executedBy / flow.actor = AuthenticatedActor`，客户端提交的同名字段不具备覆盖权。

### 180.3 并发与幂等

- 保存或状态命令提交 `ExpectedRevision`。若 `ExpectedRevision != CurrentRevision`，服务端返回 `409` 且不覆盖当前记录。
- `IdempotencyKey` 在同一次业务意图的网络失败重试中保持稳定；同键、同命令回放首次结果，不再次创建任务、备料申请、质量记录或库存事实。内容、版本或命令变化后必须生成新键。

### 180.4 角色通知目标

- `Notification.recipientRole` 与 `Notification.sourcePath` 必须属于同一职责域：仓库接收执行任务路径，采购与销售接收各自订单跟进路径。
- 内部合同编码可以继续存在，但没有菜单配置的兼容路由不能成为用户可点击入口。若系统日志无法把内部编码解析为职责内来源单，只显示文本，不渲染死链接。

### 180.5 通知快照与读状态

- 规则匹配、目标账号解析和可见性判断可以归一化 `SystemSnapshot`，并替换 `NotificationInbox` 数组。命令不得在归一化前绑定旧数组或旧记录后继续写入。
- `CreateNotification` 先完成目标账号解析，再向当前 `NotificationInbox` 插入；`MarkRead / MarkAllRead` 先完成可见性计算，再按通知编码在当前快照中重新定位记录并更新 `readBy`。
- `Unread(Account, Notification) = Account ∉ readBy`；已读更新必须持久化到当前通知记录，刷新后保持一致。历史归档通知永久不计未读。

## 181. 第十四轮运行事实、采购冲销与计划并发校正（2026-07-30）

### 181.1 列表、详情与首页待办

- 运行列表与详情必须来自同一份有效服务端集合。列表不得把内置样例与 API 结果合并，也不得出现能点击却无法由详情接口读取的“幽灵单据”；配方、工艺、质量任务均适用。
- 首页待办是销售、采购、仓库、生产、质检和系统记录的实时查询投影，不是固定数字。各责任域独立加载、失败和重试；一个接口失败不得把其他责任域的可信结果清空，也不得回退到样例数量。

### 181.2 采购入库冲销与重新入库

- 一张采购收货行可以分配到多个正式仓库和库位。正式入库 posting 逐分配保存；冲销必须逐 posting 生成反向库存事实，不能只回退第一条分配。
- 冲销正式入库只撤销“正式仓库存增加”和“采购暂存转出”：所有目标库存回退，采购暂存的 `onHand / pendingInbound` 恢复。原到货、免检/质检判定、让步、复检、退供和处置证据继续保留，采购订单的到货/质量进度不得因冲销消失。
- 冲销后当前有效正式入库数量回到零，采购订单入库进度相应回退；收货单允许重新选择有效仓库、库位和数量办理正式入库。旧冲销信息进入历史，不覆盖原 posting、反向流水或操作者审计。
- 来料异常数量只有在让步批准、复检合格，或关联采购售后已经关闭并完成退供后，才从“未解决不合格”中退出。采购订单质量进度使用这些有效处置数量重新聚合，不直接相信最初判定文本。

### 181.3 生产计划与接受短缺

- 任务派生备料申请必须引用已确认生产任务中的真实物料行；物料、名称、单位和申请数量由来源行约束，累计申请不得超过采购缺口。
- 生产工单必须引用已确认生产任务中的真实产品行；产品、名称、单位和来源行一致，同一来源行累计有效工单计划量不得超过任务需求。创建、更新和关闭均校验修订号与稳定幂等键。
- “接受短缺”不改写原工单计划量。`EffectiveCompletionTarget = OriginalPlanQty - AcceptedShortageQty`，包装、入库检、完工入库和关闭按有效完成目标判断；页面与审计仍同时保留原计划、接受短缺和实际入库数量。

### 181.4 商务单据并发与执行身份

- 销售报价、销售订单、销售售后和采购售后的保存、确认、推进、签收、作废等状态命令均提交当前 `revision`。旧页面返回 `409` 并要求刷新，不能覆盖其他用户已经形成的结果。
- 历史正式记录即使原始 JSON 未保存 `revision`，读取模型也必须归一为至少 `1` 并返回客户端；不能让用户刷新后仍因版本缺失永久无法确认、签收、推进或作废。
- 通用状态接口、来料质检判定/复检/处置和仓库高风险动作使用认证账号对应的业务人员作为执行人；请求正文中的 `actor / owner` 不能伪造审计身份。
- 系统确认框只收集用户对当前业务意图的确认。确认后命令仍必须通过角色、来源、数量、修订和幂等校验；自动化验收应实际执行确认分支，不能让测试停留在弹层。

## 182. 设备巡检责任连续性与改派事实（2026-07-30）

### 182.1 责任与快照

- `PlanOwner` 是以后任务的默认责任人；`TaskAssignee` 是某次任务的责任快照。两者以稳定员工编码关联，显示姓名只作可读投影。
- `PlanOwnerChanged` 产生明确的责任承接事件，只更新 `Task.status = pending` 的任务：写入新负责人、递增任务修订号并记录原负责人、新负责人、来源计划和操作者。
- 已开始、异常处理中和已完成任务不参与计划级自动改派。若已开始任务确需换人，未来应设计独立的任务承接命令；当前不能借修改计划静默覆盖。
- `Task.dueAt` 在任务生成时冻结。计划执行时间窗变化只参与后续任务计算；历史迁移仅在 `dueAt` 缺失时补齐一次。

### 182.2 人员与权限连续性

- 数据读取不是业务命令，不得因为负责人失效而自动选择另一位员工。读取时最多按同一稳定员工编码刷新计划的显示姓名，或为旧任务补齐缺失的稳定编码。
- `ActivePlanOwner ∪ OpenTaskAssignee` 构成设备巡检责任集合。员工停用、账号停用/解绑、角色权限调整或权限停用后的提议状态若让集合中的某位员工失去 `PERM-EQUIPMENT-OPERATE`，写入必须失败。
- 门禁错误必须说明仍有多少启用计划和未完成任务，并给出“先调整计划负责人、再完成或承接已开始任务”的可执行路径；系统不得用默认人员兜底来掩盖配置错误。

## 183. 巡检任务取消与计划恢复事实（2026-07-30）

### 183.1 单次任务取消

- `CancelInspectionTask` 只接受 `status = pending`、当前修订号、稳定幂等键和非空取消原因。成功后写入 `status = cancelled`、`result = not_executed`、`cancelReason / cancelledAt / updatedBy`，递增任务修订号并追加流转记录。
- 取消不是删除。检查项快照、来源计划、设备、标准、负责人和计划日期继续保留；列表以中性终态显示“未执行”，取消原因参与搜索并在详情、日志中完整展示，详情不提供开始、提交或关闭入口。
- 若计划启用，取消命令按计划频次生成下一周期任务；若计划停用，只计算并保存下一日期。两种情况都递增计划修订号，防止正在编辑计划的旧页面覆盖调度推进。

### 183.2 计划重新启用

- `ReactivatePlan` 首先查询 `OpenTask(planId)`。存在未完成任务时返回最早任务并设置 `nextDueDate = task.scheduledDate`，不得创建新任务；只有集合为空时才按计划日期生成。
- 这一规则与任务是否逾期无关。逾期表示执行关注，不是新建一条当天任务的理由；同一计划同时存在两个未完成周期必须作为数据异常处理，不能继续扩张。
- 设备停用或型号变化需满足 `ActivePlan(equipmentId) = ∅` 且 `OpenTask(equipmentId) = ∅`。待巡检任务可先显式取消，已开始和异常处理中任务必须完成闭环。

## 184. 巡检标准修订与冻结检查项事实（2026-07-30）

### 184.1 标准修订

- `InspectionStandard = {code, revision, equipmentModel, items, ...}`。`code` 是标准族的稳定身份，`revision` 每次有效修改递增；计划保存当前标准名称和修订投影，任务在生成时冻结标准编码、名称、修订和完整检查项。
- `ReviseStandard` 若存在启用计划引用，禁止改变 `equipmentModel / status`，但可在明确影响确认后形成新修订。该命令不修改任何已生成任务；下一任务生成时读取最新启用修订。
- 同一标准内 `Unique(lineId)` 且 `Unique(normalize(item.name))`。`lineId` 是检查项稳定身份，不是当前数组位置；删除和新增不能复用仍存在的行号。

### 184.2 任务快照完整性

- `FrozenTaskItem = {lineId, name, method, requirement}` 在任务生成时确定。`SubmitInspectionResult` 只能写入 `{result, actual, note}`，并满足提交集合与冻结集合按 `lineId` 一一对应。
- 若检查项数量变化、缺少冻结行号，或 `name / method / requirement` 任一字段变化，命令返回 `409`，不写任务结果、不增加流转记录、不生成下一周期任务。
- 标准当前修订、计划当前投影和任务执行修订是三个不同时间口径。列表与详情必须显式标注，数据库实现应以标准修订表和任务快照子表保存，不能只用标准外键回查当前内容。

## 185. 巡检标准草稿完备度与空写事实（2026-07-30）

### 185.1 草稿与启用

- `DraftStandard` 的最小身份事实为 `{name, equipmentModel, status = draft}`。`acceptance / items / note` 可以不完整；完全空白的检查行不持久化，部分填写行保留为工作进度。
- `EnableStandard` 必须满足 `acceptance != empty`、`items.length >= 1` 且每个项目的 `name / method / requirement` 非空，同时满足检查项名称和稳定行号唯一。失败不改变标准状态或修订。
- 只有 `status = enabled` 的标准能被巡检计划引用和生成任务，因此允许草稿不完整不会把缺失字段传播到执行快照。

### 185.2 无变化写入

- `EditableSignature(Standard)` 由名称、型号、合格条件、状态、检查项和说明组成；`EditableSignature(Plan)` 由名称、设备、标准、频次、时间窗、首次日期、负责人、状态和说明组成。
- 当请求修订号正确且 `EditableSignature(input) = EditableSignature(current)` 时，返回当前记录和 `unchanged = true`。该请求不是业务事件，不增加修订号、不写流程/审计日志、不触发改派或任务生成。
- 数据库阶段应在事务内完成期望修订校验和差异判断；前端本地基线不能替代服务端空写保护。

## 186. 网店供应商类型事实（2026-07-30）

- `Supplier.type = 网店` 是普通可供物料供应商类型，仅表达供应商来源是网络店铺；它不改变采购订单、收货、质检、入库或采购跟进的业务状态机。
- 网店供应商名称记录具体店铺主体。平台名称和订单号不是当前供应商主档的强制事实，需要追溯时可记录在采购订单备注中。

## 187. 暂存仓、备件与领用事实（2026-07-31）

- `Warehouse.type` 新口径包含“暂存仓”和“备件仓”，旧值“质检暂存”读取时归一为“暂存仓”。采购或销售退货暂存的流程准入继续由 `warehouseFunctions` 决定，不能仅凭类型推断。
- `Material.category = 备件` 只表达库存分类；是否可采购、可销售和可产出仍由三个独立业务属性决定。页面把 `isProducible` 展示为“可产出”，其事实含义不变。
- `WarehouseOtherMove.moveType = 领用出库` 固定 `direction = 出库`，`targetWarehouse` 保存领用部门/人员，`reason` 保存领用用途。它沿用其他出入库的草稿、审核、过账和冲销合同。

## 188. 当前范围边界与数据库前冻结事实（2026-07-31）

- 当前有效聚合只包含基础资料、销售、采购、仓库、生产、质检、设备及系统支撑。独立财务、资产采购和资产主档不再形成可创建实体、流程任务或导航投影；销售和采购中的开票、回款、收票、付款仅是金额、日期、备注组成的轻量商务记录。
- `Warehouse.type` 只描述仓库物理用途，`warehouseFunctions` 才决定采购暂存、销售退货暂存、采购入库、销售出库、生产领料和生产入库等能力。`Material.category` 只用于分类，采购、销售、产出、质检和批次路径必须分别读取对应业务属性。
- 备件库存不建立独立余额或领用台账。采购正式入库写入统一库存余额和流水；领用出库使用统一其他出入库 posting，提交、审核、过账、冲销、认证操作人和幂等规则与其他仓库动作一致。
- 当前原型仍以 JSON 保存运行事实，不能把存储实现当成最终数据库模型。数据库实施前必须保留已经验证的修订号、幂等命令、任务快照、库存 posting/反向 posting、质量处置额度、库位归属、认证操作人、通知目标和历史只读事实。
- 后续任何字段或流程调整都要先判断其属于主数据、命令输入、不可变事件、当前余额还是读模型；页面临时状态、提示文案、状态徽标和进度条不得反向成为业务事实。

## 189. 采购到货现场位置、操作人与动作命令事实（2026-07-31）

本节覆盖第 151、163—164 节中与 `WH-QC-HOLD + QC-AUTO` 唯一冻结位置、待收货预置经办人和详情内联编辑有关的旧口径。已存在的 `QC-AUTO` 库存余额、流水和质量投影保持可追溯，不迁改为虚构的普通库位；新到货命令不得继续默认选择该历史占位库位。

### 189.1 计划建议与现场事实

- `PurchaseOrder.stagingWarehouse` 是计划建议；`PurchaseInboundTask.warehouseCode / location` 在到货提交前是命令草稿。有效仓库必须满足 `status = enabled`、`allowPurchaseStaging = true`，并与来源采购订单公司一致；有效库位必须属于所选仓库的当前库位集合。
- 新任务可复制采购订单的暂存仓建议，但当候选库位不唯一时不得自动制造实际库位。仓库人员选择其他合法采购暂存仓或普通库位后，保存草稿应原样保留。
- `SubmitArrivalResult` 成功后，`warehouseCode / warehouse / location` 成为本次到货的冻结现场事实。之后的待检、待入库、异常暂存、退回和正式入库都引用该事实，不能通过普通保存覆盖。

### 189.2 经办人与展示投影

- `status ∈ {draft, pending_arrival}` 时，`owner = unassigned`；保存草稿不得接受客户端传入的经办人。详情将该值投影为“—”，而不是当前登录人或历史固定人员。
- `SubmitArrivalResult.actor` 必须来自服务端已认证会话。命令成功时同时写入 `owner = actor`、`arrivalResult.submittedBy = actor` 和到货事件；客户端请求体中的 `actor / owner` 不能覆盖认证操作人。
- 采购联系人和联系方式仍是 `PurchaseOrder` 的来源/协同事实，可在采购订单、供应商主档和必要的历史接口中保留；它们不是仓库采购入库详情或列表的基本事实投影。

### 189.3 动作命令与读模型

- 采购入库详情是读模型。到货输入只存在于 `ArrivalResultDraft` 弹窗，正式入库分配只存在于 `WarehousePostingDraft` 弹窗；关闭未保存弹窗应恢复打开前快照。
- `SaveArrivalDraft` 只更新可变命令草稿，不写到货事件、质量任务、库存余额或经办人。`SubmitArrivalResult` 执行日期、位置、数量守恒和异常说明门禁后形成到货事件；`PostPurchaseInbound` 执行可入库额度、正式仓库/库位和拆分守恒门禁后形成库存 posting。
- 兼容 `/edit` 路由只决定初始打开哪个动作弹窗，不产生第二套聚合、状态机或保存接口。

## 190. 采购到货事件、来源范围与并行阶段投影（2026-07-31）

本节覆盖第 189.3 节关于 `/edit` 自动决定初始弹窗的兼容口径，并冻结采购入库详情的累计读模型合同。

### 190.1 事件与来源范围

- 每次成功的 `SubmitArrivalResult` 冻结一条 `PurchaseArrivalResult` 到货事件。事件至少引用 `receiptCode`、`sourceDoc`、`sourceLineId`、实际到货日期、认证操作人、暂存仓/库位及到场、接收、拒收、异常暂收数量；后续质检和入库只追加处置与 posting，不覆盖到货事件。
- 普通采购履约范围键为 `(sourceType = purchase_order, sourceDoc)`，并兼容历史空 `sourceType`；采购售后补救范围键为 `(sourceType = purchase_after_sale, sourceDoc, sourceAfterSale)`。两类范围分别聚合，采购售后补发不得作为普通采购订单的已到货数量。
- `PurchaseInboundDetailProjection` 是读模型，不是新业务单据。它由当前可执行 `PurchaseInboundTask`、同范围到货事件、质量判定/处置和有效库存 posting 联合计算，返回 `aggregateLines` 与 `arrivalRecords`。

### 190.2 数量守恒与并行阶段

- 对每个来源行：`ArrivalQty = AcceptedQty + RefusedQty + ExceptionHeldQty`；`RemainingQty = max(0, ReceiptTargetQty - AcceptedQty - ExceptionHeldQty)`。拒收记录实际到过现场，但不消耗供应商仍需履约的待交余量。
- `ReleasedQty` 来自免检放行、质量判定合格、已批准让步及复检合格；`QcPendingQty` 与 `RejectedQty` 保持独立。`AvailableInboundQty = max(0, ReleasedQty - EffectivePostedQty)`。
- 有效正式入库数量按未冲销 posting 累计。冲销保留原到货与质量事件，但从当前已入库数量中扣除，并恢复可重新分仓入库的读模型额度。
- 到货、质检、异常和入库是正交阶段。一个来源行可同时具有 `partial_arrival`、`qc_pending`、`released`、`rejected_hold`、`available_inbound` 和 `partial_posted`；状态标签是这些数量事实的投影，不能作为互斥状态机反向写入数据。

### 190.3 命令入口与界面层级

- 路由加载不属于业务命令。进入详情或兼容 `/edit` 地址只读取事实；旧 `/edit` 必须重定向到规范详情，不能自动创建 `ArrivalResultDraft` 或 `WarehousePostingDraft`。
- `OpenArrivalDialog` 与 `OpenPostingDialog` 是用户显式界面意图，只有点击动作按钮后才建立可丢弃草稿。取消恢复打开前快照；提交继续执行第 189 节的认证、位置、数量、权限和幂等门禁。
- 引用选择器覆盖动作弹窗属于界面层级合同：嵌套选择器的遮罩与焦点域必须高于外层弹窗，选择仓库后再由所选仓库约束库位。层级修复不得放宽仓库职能、公司归属或库位归属校验。

## 191. 采购入库详情读模型分层（2026-07-31）

- `PurchaseInboundTaskFacts` 只描述当前 `WR`：来源、计划日期、本次实际日期、认证经办人、冻结暂存位置、提交时间和当前任务状态。`PurchaseInboundScopeProjection` 按第 190 节范围键累计物料数量；`PurchaseArrivalResult[]` 是不可变到货事件历史；`EffectiveInboundPosting[]` 是未冲销的正式入库历史。
- 页面可以并列展示四类读模型，但不得用当前任务状态概括来源累计阶段，也不得把同来源其他 `WR` 的事件日期、操作人或暂存位置写回当前任务。
- `ArrivalProgress = min(1, AggregateArrivalQty / PlannedQty)`，`PostedProgress = min(1, EffectivePostedQty / PlannedQty)`。二者是可重算展示值，不持久化、不触发流转，也不代替待交、质检、放行、不合格、可入库和已入库数量事实。
- 条件隐藏零值只属于展示降噪。拒收、异常暂收、质检中、不合格隔离和当前可入库仍必须存在于到货事件/累计投影及接口合同中；一旦数量非零，详情必须可见。
- 正式入库记录只能来自有效 posting。待质检、已放行但未过账、异常暂收和拒收均不得伪装成正式入库历史；冲销通过反向 posting 改变有效累计，不删除原到货、质量和过账证据。

## 192. 采购入库计划—实际、稳定来源行与有效过账合同（2026-07-31）

### 192.1 计划数量与到货草稿

- `PurchaseInboundTaskLine.plannedQty` 是当前任务承接的履约目标；`arrivalQty / acceptedQty / refusedQty / exceptionHeldQty` 是本次现场实际。系统生成普通采购和采购售后待收货任务时，前者写计划，后四者写 0，`qty` 继续兼容为实际正常接收数量而不是计划数量。
- `SaveArrivalDraft` 允许整张草稿尚无实际数量，也允许日期或库位稍后填写；若任一实际数量大于 0，则当前行立即执行 `arrivalQty > 0` 和 `arrivalQty = acceptedQty + refusedQty + exceptionHeldQty`。保存写入 `arrivalDraftSavedAt / arrivalDraftSavedBy`，但不写经办人、库存、质检任务或到货事件。
- 未形成到货事件且没有明确草稿证据的旧系统生成任务可以迁移：原实际字段中的计划预填值转入 `plannedQty`，实际字段归零。存在草稿标记、日期、附件、供应商批号或异常填写时不得静默重置。
- `SubmitArrivalResult` 除数量、异常原因和暂存位置外，必须校验实际到货日期为真实 ISO 日期且 `actualDate <= ShanghaiToday`；成功后才写认证到货登记人和真实提交时间。历史缺少 `submittedAt` 是缺失事实，不能用 `actualDate` 回填。

### 192.2 稳定来源行与范围动作所有权

- 采购到货、质检、入库与上游进度的首选关联键是采购订单稳定 `sourceLineId`。保存时传入不存在的来源行返回冲突；当同一物料对应多个来源行时禁止物料级模糊匹配。只有候选来源行唯一时，旧记录才允许按物料编码兼容。
- `PurchaseInboundScopeProjection.availableQty` 是来源范围内各到货事件可入库额度之和；`PurchaseInboundTask.availableQty` 是当前 `WR` 的 `releasedQty - effectivePostedQty`。`PostPurchaseInbound` 只能消费后者，不能因同范围其他任务存在额度而在当前任务开放代办。
- 页面把范围额度称为“范围可入库”，把到货事件额度称为“该次可入库”，把当前任务动作额度放在正式入库入口和分配草稿中。三者可由同一底层事实重算，但不得互相写回。

### 192.3 有效 posting 与冲销证据

- `EffectiveInboundPosting = inboundPostings where reversalCode is empty`；`ReversedInboundPosting = inboundPostings where reversalCode is present`。有效入库累计、正式入库次数和当前可入库额度只使用前者。
- 冲销在原 posting 上保留 `reversalCode / reversedAt / reversedBy`，并追加独立反向记录。详情必须同时展示有效与已冲销历史；已冲销 posting 不能继续显示为有效过账，也不能从历史中删除。
- 正式入库分配草稿的数量初值为空。`UnallocatedQty = TaskAvailableQty - Sum(positive draft allocations)`；只有数量、正式仓库和真实库位全部填写后才能提交。空字符串与业务数量 0 不得在界面上伪装为已分配事实。

## 193. 采购入库累计总计、到货事件与入库过账读模型（2026-07-31）

- `PurchaseInboundProgressProjection` 是来源范围按稳定来源行聚合的计划、到货、质检和有效入库总计；页面名称为“到货与入库进度”。它不产生新的业务明细，也不得被写回任何单次 `WR`。
- `PurchaseArrivalEventProjection` 是逐次到货事件，只投影实际日期、登记人、提交时间、暂存位置、备注、到场、接收、拒收和异常暂收事实。质检与入库状态可以作为导航提示，但其数量分别以质量处置和有效 posting 为权威来源。
- `PurchaseInboundPostingProjection` 是当前 `WR` 的有效与已冲销库存过账历史；页面名称为“入库记录”。仓库、库位、批次、过账数量、操作人与冲销证据不得从累计进度或到货事件反推。
- 展示层可以省略数值为 0 的异常或下游阶段字段，以减少阅读噪音，但接口和聚合计算必须继续保留这些数值。字段隐藏不等于事实删除，非零后必须自动显现。
- `ScopePendingInboundQty = Sum(ArrivalEventReleasedQty - ArrivalEventEffectivePostedQty)`，在累计总计中显示为“待入库”；`TaskAvailableQty` 仍是当前任务命令额度。两者同值时也不得合并所有权。

## 194. 采购入库字段显示、混合单位与状态色合同（2026-07-31）

- `PurchaseReceiptSourceReferences` 对普通采购包含一个采购订单引用；对采购售后补发包含原采购订单与采购售后单两个稳定引用。它们属于同一来源关系组，不增加新的数量范围。
- `TaskStatusDisplay = reversalCode ? 已冲销 : receipt.status`。任务状态显示不得使用另一个宽泛生命周期词替换当前仓库任务状态；到货、质检、入库和异常仍是独立维度。
- 状态色匹配必须先处理否定事实再处理危险关键词：`无异常 / 无差异 / 无风险 -> neutral`，之后才能匹配“异常、差异、风险、不合格”等危险状态。颜色只表达当前事实，不得反转语义。
- `HasInboundOpportunity = exists(receiptLine where TaskAvailableQty > 0)`；不得把不同物料、不同计量单位的可入库量相加后作为页面数量展示。`InboundAvailableLineCount` 只用于“几种物料可入库”的无单位计数。
- `AggregateArrivalQty` 页面称“累计到货”，单次 `ArrivalEvent.arrivalQty` 称“本次到场”。二者使用同一底层数量但处于累计与事件两个读模型，名称不能互换后写回。
- 响应式列数、零值隐藏、边框减少和内容换行均为展示规则，不改变字段存在性、来源键、数量守恒、权限或命令门禁。

## 195. 采购入库任务概览与记录呈现合同（2026-07-31）

- `PurchaseInboundSourceOrderReceivingProjection = expectedDate + deliveryMethod + warehouseCode/warehouse + receivingAddress + receivingContact + receivingPhone`，只读自来源采购订单。它表达订单约定，不是本次到货事件，也不锁定 `SubmitArrivalResult` 选择的实际暂存仓和库位。
- `PurchaseInboundTaskOverview = company + sourceReferences + supplier + sourceOrderReceivingProjection`。仓库页不复制供应商联系人/电话；`receivingContact / receivingPhone` 是需方内部收货联系事实，应与供应商联系事实区分显示。
- `PurchaseArrivalEventIdentity = receiptCode + actualDate + submittedBy + submittedAt + actualStagingWarehouse/location`。同一来源范围存在多条事件时，每条独立投影；任务概览不得保存或展示一组“实际到货日期/到货登记人”作为范围级事实。
- `PurchaseInboundProgressProjection.plannedQty` 属于物料履约目标，在物料身份区显示为采购计划或补发计划；到货结果分组从 `AggregateArrivalQty` 开始。移动显示位置不得改变计划—实际守恒或累计计算。
- 到货记录与入库记录共享 `ReceiptRecordPresentation` 的卡片头、上下文和物料行骨架，但继续消费不同读模型：前者读取 `PurchaseArrivalEventProjection`，后者读取 `PurchaseInboundPostingProjection`。统一视觉不得把事件和 posting 合并为同一事实。
- 删除区块解释文字、缩短空态和把跨任务提醒改为状态标签属于展示降噪；来源范围、动作额度、有效/冲销 posting 和非零异常事实仍按第 192—194 节完整保留。

## 196. 采购入库记录范围与动作提示归属（2026-07-31）

- `PurchaseArrivalRecordScope = PurchaseOrder | PurchaseAfterSale`。到货记录集合按 `detailProjection.scopeType` 归属整个采购订单或采购售后范围，因此标题必须携带对应范围标签；记录中的 `receiptCode` 继续标识具体到货事件。
- `PurchaseInboundRecordScope = CurrentPurchaseReceiptTask`。入库记录集合只读取当前 `receipt.inboundPostings` 及其兼容历史，不得因为同一来源范围存在其他 `WR` 的 posting 而扩展当前任务历史。
- “采购订单范围/采购售后范围”和“当前任务”是所有权标签，不参与状态色聚合、数量计算、权限判断或命令门禁。它们不能替代到货状态、质检状态、入库状态或冲销证据。
- `PrimaryReceiptCommand` 的展示所有权属于页面顶部动作区；`ReceiptLifecycleStatus` 的展示所有权属于任务概览状态和当前任务状态面板。若两者已经可见，详情正文不得再复制一条只重复动作名称的“下一步”事实。
- `CompactReceiptEmptyState` 与独立侧栏卡片是纯展示投影。缩短空态、取消等高拉伸或拆分边框不改变事件是否存在、附件是否存在、有效 posting 数量及其持久化事实。

## 197. 采购入库字段标签与限制提示呈现合同（2026-07-31）

- `CurrentReceiptStatusPanel = arrivalStatus + qualityStatus + inboundStatus + exceptionStatus`。这些值是当前 `WR` 的阶段状态，展示标签统一使用“状态”；`PurchaseInboundProgressProjection` 的到货与入库百分比继续使用“进度”，两者不能互换所有权。
- `ArrivalLimitHint = contractRemainingQty + overReceiptTolerancePercent + remainingReceivableQty`。待收货弹窗必须让仓库人员同时看见合同待到货、允许容差和本次最大可接收量，但只呈现一次；采购计划和累计到货留在来源范围进度读模型，不能在同一物料行重复铺陈。
- `ArrivalFormFacts` 包含实际到货日期、实际暂存仓/库位、到场、正常接收、当场拒收、异常暂收、供应商批号、冻结质检要求、异常原因/说明、交接备注和附件。质检要求只读；供应商批号、交接备注与附件可为空；数量守恒和异常门禁不因标签精简而改变。
- `InboundAllocationFacts` 包含当前任务行、剩余可分配量、本次入库数量、正式仓库和正式库位。拆分动作只新增同一任务行的去向，不复制可入库额度；删除去向只在至少保留一个分配行的前提下可见。
- `SaveArrivalDraftActionLabel = 保存草稿`，`SubmitArrivalResultActionLabel = 提交到货结果`。前者只保存可恢复填写内容，后者才冻结到货事件并触发暂存、质检和后续任务；按钮文案调整不改变命令和权限。
- 区块说明、字段帮助、占位符和空态属于展示层。删除重复候选说明、历史实现措辞和文件类型清单，不得删除日期真实性、仓库职能、库位归属、数量上限或有效 posting 的服务端校验。

## 198. 采购入库来源范围数量投影去状态化（2026-07-31）

- `PurchaseInboundProgressProjection.aggregateLines` 只输出稳定来源行身份、计划量以及到货、接收、拒收、异常暂收、质检冻结、放行、不合格隔离、有效入库、待入库和待到货数量，不再输出由这些数量重复派生的 `statuses[]`。
- “部分到货”由 `0 < AggregateArrivalQty < PlannedQty` 直接从到货进度和待到货数量读取；“质检中、已放行、不合格隔离、待入库、已入库”分别由对应非零数量读取。它们是可并存的数量事实，不组成互斥状态机，也不需要在物料头部再生成一组无数量标签。
- `ScopePendingInboundQty` 继续属于来源范围总计，`TaskAvailableQty` 继续属于当前 `WR`。删除跨任务提醒只删除重复展示，不允许当前任务消费其他 `WR` 的可入库额度，也不改变 `PostPurchaseInbound` 的任务所有权门禁。
- 当前任务右侧状态面板继续读取 `CurrentReceiptStatusPanel` 的到货、质检、入库和异常四个维度。来源范围数量投影去状态化不得删除任务状态、到货事件、质量处置、有效 posting 或冲销证据。

## 199. 采购入库状态派生与事件边界合同（2026-07-31）

- `PurchaseReceiptTaskStatus` 直接读取持久化 `PurchaseReceipt.status`，冲销时只在展示层优先显示已冲销。列表和详情不得再派生“执行中、等待协同、已完成”等宽泛生命周期词覆盖真实任务状态；筛选、导出和下钻继续使用同一任务状态。
- `PurchaseReceiptQualityStateProjection` 读取是否需检、正常接收、待判、已放行和不合格数量。存在待判且已有放行时为部分放行；存在待判、无放行但已有不合格判定时为部分判定；全部判定后按放行与不合格组合派生已放行、部分放行或不合格。
- `PurchaseReceiptInboundStateProjection` 读取当前任务有效 `postedQty` 与 `availableQty`。`availableQty > 0` 投影为待入库，`postedQty > 0` 且任务未完成投影为部分入库，完成投影为已入库；“可入库”只属于命令能力，不进入状态值。
- `PurchaseReceiptArrivalExceptionProjection` 只读取到货事件的 `refusedQty / exceptionHeldQty` 及采购处理状态，值为无、当场拒收或异常暂收及其处理状态。质量判定的不合格数量不得反向写入到货异常。
- `PurchaseArrivalEventProjection` 不再输出 `record.status / line.qualityStatus / line.inboundStatus`。到货事件形成后身份和现场数量不可变，而任务、质检和入库会继续流转；用后续状态装饰历史事件会制造可变历史，因此这些状态只在当前任务状态和来源范围数量投影中表达。
- `PurchaseInboundPostingProjection` 的有效过账与已冲销属于库存凭证状态，继续保留。删除到货记录状态和重复动作提示不改变任务可入库额度、质量门禁、posting 幂等、冲销或来源范围数量守恒。

## 200. 采购入库记录标题与计划暂存事实合同（2026-07-31）

- `PurchaseArrivalRecordScope` 与 `PurchaseInboundRecordScope` 是后端查询和读模型所有权，不要求在页面标题中重复展示。页面删除“采购订单范围/采购售后范围”和“当前任务”标签后，前者仍按来源范围聚合到货事件，后者仍只读取当前 `WR` 的入库 posting。
- 到货事件数、有效 posting 数和已冲销 posting 数均可由记录集合直接计算，不再形成区块标题字段。页面不得用标题计数替代逐条记录，也不得因删除计数而丢弃历史记录。
- `PurchaseInboundPostingValidity = Effective | Reversed` 属于单条库存凭证事实。每条记录继续展示有效过账或冲销单号，库存累计只计入未冲销 posting。
- `PurchaseOrderReceivingWarehouse` 是采购订单保存时选择的计划采购暂存仓。仓库详情显示标签“计划暂存仓”；`SubmitArrivalResult.actualStagingWarehouse/location` 仍由现场从合法候选中选择，两者不得互相写回或形成强制相等约束。

## 201. 采购入库 posting 物料快照与记录呈现合同（2026-07-31）

- `PurchaseInboundPostingLine` 固定保存 `receiptLineId + materialCode + name + model + spec + postedQty + unit + warehouseCode/warehouse + location + batch`。名称、型号和规格是过账时物料身份快照，避免后续任务行或主数据变化导致历史凭证信息残缺。
- 既有 posting 缺少 `name/model/spec` 时，详情可按 `receiptLineId` 从当前 `PurchaseInboundTaskLine` 兼容补显；该回退只用于展示，不得改写历史 posting，也不得覆盖新 posting 已冻结的快照。
- `ReceiptRecordLinePresentation = MaterialIdentity + FactGrid`。到货事件和入库 posting 共用呈现结构；前者事实格消费到货数量，后者事实格消费入库数量、正式仓库、库位和批次。呈现一致不意味着两个读模型或数量所有权合并。
- `warehouse` 与 `location` 是两个独立库存去向事实，页面分别标注“正式仓库”和“入库库位”。批次仍属于 posting 行；有效/冲销属于 posting 记录头，不能下沉为物料状态。

## 202. 采购入库编号所有权合同（2026-07-31）

- `PurchaseInboundTask.code` 是当前详情的主身份，展示所有权属于 `PurchaseInboundTaskOverview`。`PurchaseArrivalRecord` 的主展示身份是 `actualDate`，不得用当前任务号替代事件日期。
- `PurchaseArrivalRecord.receiptCode` 仅用于标识由哪一个采购入库任务 `WR` 提交到货结果。只有 `receiptCode != CurrentPurchaseInboundTask.code` 时，页面在记录头显示来源任务并下钻；当前任务记录不重复展示。系统不存在独立的“到货任务号”，该字段也不标识库存流水。
- `PurchaseInboundPosting.code` 是一次正式入库 posting 的凭证号；`PurchaseInboundPosting.reversalCode` 是冲销证据号。两者属于入库记录头，不得写入到货事件身份。
- `StockLedgerRow` 是按库存事实追加的明细行，使用 `sourceDoc/documentLineId/warehouse/location/batch/time` 等字段追溯来源。一次到货或入库可形成多条流水，因此详情只提供按 `receiptCode` 查询流水集合的入口，不派生一对一的 `stockLedgerCode`。
- 旧入库结果没有 posting 编码时保持“无凭证号”的事实，不允许用 `receiptCode`、批次号或数组序号伪造凭证身份。

## 203. 采购入库独立概览事实与记录双层投影（2026-07-31）

- `PurchaseInboundTaskOverviewFacts = taskCode + sourceReferences + supplier + company + expectedDate + deliveryMethod + plannedStagingWarehouse + receivingAddress + internalReceivingContact + internalReceivingPhone`。十项事实可处于同一只读网格，但必须各自拥有标签和值；展示层不得把多个字段拼接成新的多义“安排/信息”字段。
- `plannedStagingWarehouse` 属于 `PurchaseOrderReceivingProjection`，`actualStagingWarehouse/location` 属于 `PurchaseArrivalEventProjection`。两者可以不同且不得互相覆盖；前者为空不阻止现场从合法采购暂存仓及其正常库位中选择实际位置。
- `PurchaseArrivalRecordFirstBand = MaterialIdentitySnapshot + arrivalQty + acceptedQty + nonZero(refusedQty, exceptionHeldQty)`；`PurchaseArrivalRecordSecondBand = actualStagingWarehouse + actualStagingLocation + note + actualDate + submittedBy + optional(sourceReceiptCode)`。上下层只改变呈现顺序，不改变事件不可变性或来源范围聚合。
- `PurchaseInboundRecordFirstBand = MaterialIdentitySnapshot + postedQty`；`PurchaseInboundRecordSecondBand = postingCode + postingValidity + destinationWarehouse + destinationLocation + batch + postedAt + postedBy`。仓库、库位和批次属于 posting 行，凭证有效性、日期和人员属于 posting；行级完整投影不得生成额外 posting 或重复库存流水。
- `PurchaseInboundPostingLinePresentationKey = postingCode + receiptLineId + warehouseCode + location + batch`。同一 posting 多行时允许重复显示 posting 级事实，累计仍按唯一 posting 及其行求和；冲销后有效数量归零的规则保持不变。
- `submittedAt`、接口兼容字段和日志时间继续保留在事件读模型与审计记录中。详情页不展示这些低频字段属于显示降噪，不是事实删除；追溯时仍可通过日志和后端事件读取。

## 204. 采购到货与入库记录同级单元投影（2026-07-31）

- `PurchaseArrivalRecordPrimaryCells = materialIdentity | arrivalQty | acceptedQty | nonZero(refusedQty) | nonZero(exceptionHeldQty)`；`PurchaseArrivalRecordSecondaryCells = actualStagingWarehouse | actualStagingLocation | note | actualDate | submittedBy | optional(sourceReceiptCode)`。每项都是记录卡的同级显示单元，不再存在 `MaterialIdentity + NestedFactGrid` 的父子结构。
- `PurchaseInboundRecordPrimaryCells = materialIdentity | postedQty | postingResult`；其中 `postingResult = postingCode + postingValidity/reversalEvidence`。凭证身份和有效性仍属于 posting，只是投影到第一层；不得因此把它写入 `PurchaseInboundPostingLine` 或按行生成多个凭证。
- `PurchaseInboundRecordSecondaryCells = destinationWarehouse | destinationLocation | batch | postedAt | postedBy`。物料、数量和结果用于确认“入了什么、多少、是否生效”，仓库、库位、批次、日期和人员用于确认“去了哪里、何时、由谁执行”。
- 同级大格是呈现合同，不改变数据粒度。一次到货记录可含多条 `PurchaseArrivalRecordLine`，一次入库凭证可含多条 `PurchaseInboundPostingLine`；共享的事件级或 posting 级事实允许逐行投影，但累计必须以事件/凭证主键及行键去重。
- 多物料演示数据应通过真实采购订单确认、到货结果提交和正式入库过账命令形成，禁止仅在前端伪造数组。当前演示单 `WR-20260731-002` 含三种免检包材、三条到货行和三条有效入库行，可用于回归大格布局与行级事实完整性。

## 205. 采购到货与入库逐物料完整卡投影（2026-07-31）

- `PurchaseArrivalMaterialCard = ArrivalRecordLine + repeat(ArrivalEventExecutionFacts)`。同一 `PurchaseArrivalRecord` 的多条物料行分别投影为独立卡片；`actualStagingWarehouse/location + note + actualDate + submittedBy + optional(sourceReceiptCode)` 可以重复显示，但事件主键仍唯一，重复投影不得写回或重复累计。
- `PurchaseInboundMaterialCard = PostingLine + repeat(PostingResult + PostingExecutionFacts)`。`postingCode + validity` 位于主信息层，`destinationWarehouse/location + batch + postedAt + postedBy` 位于执行信息层；同一 posting 多行仍只对应一个凭证生命周期。
- 卡片、主信息区和执行信息区属于展示分组，不新增业务实体。顶边颜色只区分 `arrival` 与 `inbound` 投影类型，不得根据颜色推导到货、质检、入库或异常状态。
- 空间不足时的跨行、跨列和重复展示均为响应式呈现行为。查询范围、数量守恒、冲销抵减、来源任务和库存流水事实继续以事件/凭证主键及行键为准。

## 206. 采购入库列表行投影合同（2026-07-31）

- `PurchaseReceiptListRow.taskCode` 读取当前 `PurchaseReceipt.code`，`sourceCode` 读取采购订单或采购售后来源，二者不得互相替代。供应商只投影主体名称；供应商联系人和联系方式不属于仓库列表行。
- `PurchaseReceiptListQuantity` 在 `status in [草稿, 待收货]` 时按来源行读取当前任务 `plannedQty`；形成到货事件后按当前任务行读取 `arrivalQty`，历史兼容数据才允许回退 `qty`。若计划快照存在且与到货数量不同，列表并列投影计划与到货；`plannedQty > 0 && qty = 0` 的待收货行必须显示计划数量，不能显示 0。
- 数量汇总以 `unit` 分组后分别格式化。不同单位可以在同一摘要中并列，但禁止相加；因此采购入库列表不暴露跨单位数量排序。拒收和异常暂收仅在对应数量非零时追加，不改变任务计划数量或到货数量本身。
- `PurchaseReceiptListStagingProjection` 在待收货阶段读取 `plannedStagingWarehouse` 并标记为计划事实，不投影库位；到货提交后读取事件的 `actualStagingWarehouse + actualStagingLocation` 并标记为实际事实。两种投影不能互相覆盖。
- `PurchaseReceiptListArrivalProjection` 在待收货阶段输出 `expectedDate + noActor`，形成到货事件后输出 `actualDate + submittedBy`。`待分配`不是到货登记人事实，不能进入字段值、筛选选项或导出。
- `PurchaseReceiptListProgress = taskStatus + qualityState + inboundState + currentAction`。前三项继续读取第 199 节的权威状态投影；`currentAction` 只用于导航提示，不参与命令校验。冲销、拒收、取消和完成状态的动作必须为查看型，不能生成库存或到货命令能力。
- `PurchaseReceiptListSortKey` 可把主状态仍为待质检但已有放行额度、当前动作是登记入库的任务映射到“待入库动作”优先级；该键只控制列表顺序，不改写 `taskStatus`、质量状态或入库状态。任务状态筛选继续使用原始 `taskStatus`，并按流程顺序呈现。
- 桌面表格与响应式卡片必须消费同一列表行投影。布局切换可以重排身份、数量和元信息，但不得重复数量或日期，也不得删除时效提醒、主状态、质检、入库和当前待办。

## 207. 销售出库真实受理、部分行拣货与复核快照合同（2026-07-31）

- `SalesIssueTaskCreated` 只证明销售交付已经形成仓库待办，不产生 `WarehouseAccepted`。`AcceptSalesIssueCommand` 才写入 `acceptedBy / acceptedAt`，并把无有效出库量的交付追踪从“待发货”推进为“仓库已受理”；已存在有效部分出库量时保持“部分出库”。
- `SalesIssue` 保存来源交付中的 `contact / contactPhone / address / expectedDate` 冻结快照，`date` 仅表达本次真实出库作业日期。待受理任务的 `owner` 保持待分配且 `date` 为空；受理命令使用认证人员形成仓库经办人。
- `SalesIssueProduct.taskQty` 是本任务承接的剩余数量，`qty` 是本次拟出库数量。允许 `0 <= qty <= taskQty`，但整单至少一行 `qty > 0`；零数量行不参与库存校验、预留消费、流水和正式出库凭证。
- `SubmitSalesIssueReviewCommand` 要求真实作业日期不晚于今天、至少一行正数量、来源行和累计剩余量有效，并记录 `reviewSubmittedBy / reviewSubmittedAt`。进入待复核后产品、数量、批次、来源、仓库和日期冻结，调整必须通过退回拣货命令。
- `PostSalesIssueCommand` 的唯一前置作业状态为“待复核”。过账前再次执行同一来源和日期门禁，只把正数量行形成 `SalesIssuePosting`，再原子扣减库存、消费预留、写流水并为剩余来源行确保一张后续待受理任务。
- 冲销使有效出库贡献归零后，若同一交付已经存在尚未受理的后续任务，系统按最新剩余量重建该任务物料行；不得因为先前部分出库已经生成任务而遗漏被冲销后恢复的来源行。

## 208. 销售出库拣货优先状态与开始作业事实（2026-07-31）

本节取代第 207 节的 `AcceptSalesIssueCommand / WarehouseAccepted` 合同；部分行数量、复核快照、正式过账和冲销数量守恒继续沿用。

- `SalesIssueOperationStatus = 待拣货 | 待复核 | 已出库`。任务创建事件直接写入待拣货；`待受理` 只作为历史输入值迁移，不再是新记录、列表筛选或状态命令的合法阶段。
- `SalesIssuePickingStart = pickingStartedBy + pickingStartedAt`。新任务 `owner = 待分配` 且 `date = 空`；第一次保存拣货事实或提交复核时，由认证人员原子写入 `owner / pickingStartedBy / pickingStartedAt`。客户端传入人员字段不得覆盖认证事实。
- 查看任务和进入登记页都是只读导航行为，不生成开始作业事件。`SaveSalesIssuePickingCommand` 才可以形成开始拣货事实，并只允许修改 `products.qty / products.batch / date / note / attachments`；来源、客户、收货信息、仓库、交付方式和计划日期保持冻结。
- `OutboundTrackingStatus` 的新执行投影在有效出库量为零时保持待发货，有部分有效出库量时为部分出库，全部有效出库后为已出库。开始拣货不再生成销售侧仓库已受理状态。
- `acceptedBy / acceptedAt` 仅为历史兼容字段。读取迁移可以把它们或旧受理日志映射为 `pickingStartedBy / pickingStartedAt`，新保存和状态命令不得继续写入接受里程碑。
- `EnsureSalesIssueTask` 对未开始的待拣货任务可以按最新剩余数量幂等重建；已存在 `pickingStartedAt` 或有效经办人的任务视为现场已开始，不得被普通后台同步静默覆盖。

## 209. 销售出库列表日期投影合同（2026-07-31）

- 未冲销且尚未完成出库的 `WS` 行以 `expectedDate` 投影“计划出库”；已出库或已冲销行以 `date` 投影“实际出库”，实际日期缺失时才回退计划日期。列表不得把计划日期伪装成已发生的实际出库日期。
- “逾期 N 天 / 今日应出 / N 天后应出”由计划日期和上海当前业务日即时派生，只对未完成任务显示，不写回单据、不进入状态枚举，也不参与库存过账。
- 经办人继续取销售出库任务的认证人员投影；未开始拣货且值为“待分配”时列表留空。开始拣货之后显示真实人员姓名，不用技术账号或默认仓库人员补位。

## 210. 到货与拣货结果的原子提交合同（2026-07-31）

本节覆盖第 208 节的 `SaveSalesIssuePickingCommand / SalesIssuePickingStart` 新记录合同，以及此前采购到货草稿命令的页面执行口径；旧字段与旧接口只用于历史兼容，不得被新界面调用。

- `SubmitArrivalResultCommand(receiptCode, idempotencyKey, arrivalSnapshot)` 是采购到货唯一界面写命令。`arrivalSnapshot` 只允许实际到货日期、采购暂存仓/库位、交接备注、附件，以及按冻结 `receiptLineId` 匹配的到场、接收、拒收、异常暂收、供应商批号和异常说明；来源订单、供应商、公司、计划数量、物料身份、质检要求和人员字段不得由客户端覆盖。
- `SubmitArrivalResultCommand` 必须先在服务端组合权威任务与允许输入，再执行日期、仓库职能、库位归属、来源余量和逐行数量守恒门禁。成功后在同一持久化边界写入 `ArrivalResultEvent`、认证经办人、暂存事实、可选质检任务、异常售后及剩余到货任务；失败时不得留下“已保存草稿”或半成品执行记录。
- `SubmitSalesIssuePickingResultCommand(issueCode, idempotencyKey, pickingSnapshot)` 是销售待拣货任务唯一界面写命令。`pickingSnapshot` 只允许实际出库日期、按冻结 `sourceLineId` 匹配的本次数量和批次、备注及附件；来源交付、销售订单、客户、收货信息、发货仓库、交付方式、计划日期和人员字段保持冻结。
- 销售命令要求任务当前为待拣货、日期真实且不晚于上海当前业务日、至少一行数量大于零，并再次验证来源行累计剩余量。成功后原子写入 `status = 待复核`、`owner = authenticatedActor`、`reviewSubmittedBy / reviewSubmittedAt` 和 `PickingResultEvent`，只追加“提交复核”日志。
- 新命令不写 `pickingStartedBy / pickingStartedAt`。这些字段及“开始拣货”日志只作为旧数据兼容证据；打开、关闭或取消登记弹窗都是无状态导航行为。复核退回后可用新的幂等键重新提交，旧复核与退回日志继续保留。
- 两个命令都按幂等键返回相同结果，且写操作受 `warehousePost` 权限控制。采购到货后的正式入库仍由独立 `PostPurchaseReceiptCommand` 完成；销售待复核后的库存扣减仍由独立 `PostSalesIssueCommand` 完成，登记事件不得提前改变正式库存。

## 211. 销售出库来源要求、执行记录与可拣库存合同（2026-07-31）

本节补充第 209—210 节，并覆盖此前把销售来源备注写入仓库拣货备注、把生命周期大类与作业状态并列展示的读模型口径。

- `SalesIssue.sourceRemark` 是 `SalesOutboundRequest.remark` 的冻结来源快照，表达销售侧发货要求；`SalesIssue.note` 只表达仓库拣货执行备注。`EnsureSalesIssueTask` 创建新任务时写入 `sourceRemark` 且令 `note = 空`，客户端不得把两者合并为一个可编辑字段。
- `SalesIssueTaskOverviewProjection = issueCode + outboundTrackingCode + salesOrderCode + customer + expectedDate + warehouse + deliveryMethod + recipient + phone + address + sourceRemark`。`date / reviewSubmittedBy / reviewSubmittedAt / postedBy / postedAt / note` 属于执行结果投影，不进入任务概览。
- `SalesIssueOperationProjection.primaryStatus` 直接取有效的 `待拣货 / 待复核 / 已出库 / 已冲销`。`PickingSubmissionProjection` 与 `InventoryPostingProjection` 是两个辅助事实；不得再派生一个“执行中 / 已完成”主状态与原始作业状态重复展示。
- `SalesIssueDispatchableQty(inventoryRow, issueLine) = min(onHandQty, availableQty + matchingReservationQty)`；匹配预留必须满足 `sourceDoc = issue.sourceOrder`，并在双方存在来源行标识时满足 `sourceLineId` 一致，同时排除已释放、已作废和已消耗证据。跨库存行汇总时继续受物料、发货仓库和可选指定批次约束。
- `SubmitSalesIssuePickingResultCommand` 在写入待复核前必须逐正数量行执行 `requestedQty <= taskQty`、来源剩余量和 `requestedQty <= sum(dispatchableQty)` 门禁，并拒绝处于有效盘点冻结的候选库存。正式 `PostSalesIssueCommand` 仍需重复相同门禁，防止复核等待期间库存变化。
- `PickingDraftSuggestion` 只是弹窗内无状态建议，可把未提交任务的默认数量取 `min(taskQty, currentDispatchableQty)`；取消弹窗必须恢复原任务快照。该建议不写数据库、不产生经办人或日志，也不代表库存预分配。
- `SalesIssueExecutionActorProjection` 仅在存在 `reviewSubmittedAt`、处于待复核或已出库时显示认证经办人。旧 `pickingStartedBy / pickingStartedAt` 继续作为历史证据保存，但新详情和列表不得把它们当成当前流程必经阶段或在尚未提交结果时制造经办事实。

## 212. 销售出库拣货分配与精确扣库合同（2026-07-31）

本节细化第 210—211 节的 `SubmitSalesIssuePickingResultCommand` 输入与库存门禁，并取代新流程仅保存 `SalesIssueProduct.batch` 后由过账阶段自动挑选库存行的口径。

- `SalesIssuePickingAllocation = allocationId + inventoryKey + warehouseCode + warehouseSnapshot + locationSnapshot + batchSnapshot + qty + uom`。`inventoryKey` 指向登记时选中的当前库存事实行，是复核与过账的权威位置身份；仓库、库位和批次快照用于界面核对与审计，不得替代库存键绕过当前事实校验。
- `SalesIssueProduct.allocations` 只冻结正数量分配行。`SalesIssueProduct.qty = Σ allocation.qty`，`SalesIssueProduct.batch = distinct(nonEmpty allocation.batch)` 仅作为列表与历史兼容摘要；服务端提交命令必须重新派生二者，不接受客户端独立覆盖。无正数量分配的物料行按零数量保留到复核前的任务映射，过账凭证中剔除。
- `SalesIssueAllocationDispatchableQty(row, issueLine) = min(row.onHandQty, row.availableQty + matchingReservationQty)`，其中匹配预留继续采用 `sourceOrder + 可选 sourceLineId`。每条分配满足 `0 < allocation.qty <= SalesIssueAllocationDispatchableQty`，库存行必须匹配物料与任务发货仓库且无有效盘点冻结。
- 同一提交内不允许同一物料重复 `inventoryKey`。当多条来源行共同分配同一库存事实时，还需满足 `Σ allocation.qty <= min(row.onHandQty, row.availableQty + matchingIssueReservations)`，防止逐行校验各自通过但合计超领。
- `SubmitSalesIssuePickingResultCommand` 的新请求必须携带分配行；服务端按冻结来源行组合权威物料、归一化库存行身份、派生数量与批次摘要，然后执行任务上限、来源剩余量、库存和日期门禁。成功后分配快照随任务进入待复核，PUT 不得修改。
- `PostSalesIssueCommand` 必须再次运行相同分配门禁，并对每条分配的 `inventoryKey` 执行预留消耗、在手与合格库存扣减、余额刷新和一条对应库存流水。库存流水的库位与批次必须来自该分配库存行；任何分配行失效或数量不足都使整次过账失败，不能改用另一库存行兜底。
- 历史任务只有 `qty / batch` 而没有 `allocations` 时，读取与既有待复核过账允许使用旧候选逻辑；任何通过当前登记弹窗重新提交的任务都必须升级为分配快照。冲销继续按正式库存流水逐行恢复，不依赖当前产品批次摘要。

## 213. 销售出库任务进度与执行记录投影合同（2026-07-31）

本节统一第 210—212 节事实在销售出库详情中的读模型；不新增业务实体，也不改变登记、复核、过账或冲销命令。

- `SalesIssueTaskProgressProjection` 按任务物料派生，包含冻结物料身份、`taskQty`、当前有效拣货快照数量、未选数量、当前有效过账数量，以及拣货/过账百分比。百分比和未选数量只是视图派生值，不写回任务、不进入状态枚举。
- `SalesIssueExecutionRecordProjection = current PickingResultEvent + InventoryPostingProjection`。一张逐物料记录卡可以重复本次事件的日期、人员、复核和过账公共事实，以保证每种物料可独立核对；这只是展示投影，不复制事件或库存流水。
- 当前有效拣货结果必须对应任务当前的 `待复核 / 已出库` 状态及有效提交快照。历史 `reviewSubmittedAt` 在任务已退回待拣货时不构成当前结果，页面不得据此继续显示本次数量、登记人或执行记录。
- 已冲销任务保留原拣货与原过账审计事实，但当前有效出库数量为零。执行记录主生命周期显示“已冲销”，库存结果显示“原过账已冲销”，不得同时把原“已过账”描述为当前仍有效。
- 登记弹窗提交的数据仍是第 212 节定义的 `PickingSnapshot + SalesIssuePickingAllocation[]`。只读的发货仓库和计划日期用于现场核对，不进入可覆盖字段；页面骨架或字段分组调整不改变命令白名单。

## 214. 仓库登记事件范围选择与取消回滚合同（2026-08-01）

- `WarehouseCommandLineSelection` 是弹窗内临时集合，不是单据字段、任务状态或执行里程碑。采购到货以冻结 `receiptLineId/sourceLineId`，销售拣货以冻结 `sourceLineId/lineId` 识别来源行；打开、勾选、取消勾选和关闭弹窗均不得写数据库或日志。
- `SubmitArrivalResultCommand.products` 与 `SubmitSalesIssuePickingResultCommand.products` 只携带本次选中的来源行。未提交的来源任务行不等于删除、拒收、关闭余量或取消；服务端继续以原任务和来源订单为权威，采购生成剩余到货承接，销售把未提交行归零后由正式过账生成剩余出库承接。
- 客户端校验只对本次选中行执行数量守恒、任务上限、库存分配和异常必填门禁，且整次命令至少存在一条正数量选中行。未选行的旧输入不得使当前命令通过，也不得阻塞当前命令；提交前应从载荷剔除未选行，服务端仍需按冻结行标识重新匹配，不能信任数组位置。
- `PurchaseArrivalQuickFill` 是无状态建议。已有本次到场数量时保持该数量并分流为全部接收或全部拒收；数量为空或为零时默认使用采购正常待到货量 `remainingQty`，只有没有正常待到货事实时才回退可收上限。该建议不得自动制造容差内超收。
- 弹窗快照包含打开前的日期、数量、批次、位置、备注和附件。取消或关闭恢复完整快照及空的临时选择集合；提交成功后清空选择集合并以服务端返回任务重建读模型。日期默认当前上海业务日仍属于弹窗建议，不是经办事实。
- 作业信息中的发货仓库、计划日期、采购暂存来源和“提交后即时过账”均是只读核对投影，不进入对应命令可覆盖白名单。界面以同尺寸事实格展示不改变其只读属性。

## 215. 销售拣货跨仓库存分配与实际仓库事实（2026-08-01）

- 销售交付追踪中的仓库值仅作为兼容计划提示，不再是 `SalesIssue` 拣货候选和复核命令的权威边界。待拣货任务不存在实际出库仓库事实，任务概览不得展示计划仓库或空仓库占位。
- `SalesIssuePickingAllocation = { allocationId, inventoryKey, warehouseCode, warehouse, location, batch, qty, uom }`。正数量分配行是实际仓库、库位、批次和数量的唯一权威事实；物料总量、批次摘要与实际仓库集合都必须由这些分配行派生。
- `SalesIssueDispatchableInventoryProjection` 只读取同公司、启用、具备“可销售出库”职能、物料匹配且可供量大于零的库存事实。可供量继续等于普通可用量加本来源订单行可消费预留，并受实际在手上限、盘点冻结和质量状态约束。
- `SubmitSalesIssuePickingResultCommand` 可以包含多个实际仓库的分配行。服务端不得用任务头 `warehouseCode/warehouse` 过滤分配；必须逐库存事实键恢复真实仓库并重新校验仓库职能，客户端传入的仓库名称不能覆盖库存事实。
- `SalesIssue.actualWarehouses` 是复核快照中正数量分配仓库的去重派生集合。待拣货时为空，提交复核后形成，退回重提时重算；销售出库列表和下游交付投影只能把该集合或已过账库存流水称为实际出库仓库。
- 跨仓出库仍按来源订单和来源行消费原销售预留。实际扣库行没有该预留时，过账必须在其他库存行中消费或释放等量有效预留，不能因改变实际出库仓库留下无对应需求的库存占用。

## 216. 销售待发余量关闭与调整后交付目标合同（2026-08-01）

- `SalesOrderDeliveryClosure = { sourceLineId, materialCode, name, closedQty, uom, reason, closedAt, closedBy }`，表示销售在已经发生部分实际出库后确认该来源行剩余数量不再交付。它是追加的业务决定事实，不覆盖订单行原数量，也不等同于销售出库或客户签收。
- `ClosedQty(line) = Σ valid SalesOrderDeliveryClosure.closedQty`；`DeliveryTargetQty(line) = max(0, OrderedQty(line) - ClosedQty(line))`；`RemainingDeliveryQty(line) = max(0, DeliveryTargetQty(line) - EffectiveOutboundQty(line))`。订单和逐行读模型必须同时保留 `orderedQty / deliveryTargetQty / outboundQty / closedQty / remainingQty`。
- `CloseSalesOrderDeliveryRemainderCommand` 要求销售订单单据状态为已确认、至少一行 `EffectiveOutboundQty > 0`、至少一行 `RemainingDeliveryQty > 0` 且原因不少于四个字。存在同订单有效 `SalesIssue.status = 待复核` 时拒绝；零出库整单终止必须走作废命令。
- 命令成功后取消同订单未开始的 `待拣货` 任务，释放对应来源行尚未消费的 `销售预留`，但保留已出库任务、库存流水、冲销、签收及商业记录。取消任务不得继续被剩余任务查找复用。
- `ShipmentTrackingFulfillment` 以 `DeliveryTargetQty` 为完成分母。调整后目标达成时交付追踪状态为 `按实发完成`，销售订单交付进度进入 `待签收`；该状态明确区别于按原订单数量全部出库。
- 已出库冲销只减少 `EffectiveOutboundQty`，不删除 `SalesOrderDeliveryClosure`。若冲销后 `RemainingDeliveryQty > 0`，交付追踪恢复部分出库或待发货，并允许系统按调整后目标生成新的剩余待拣货任务。

## 217. 仓库售后作业执行记录与库存分配合同（2026-08-01）

- `AfterSalesExecutionTaskStatus = 待前置 | 待处理 | 处理中 | 已完成 | 已取消`。`StartAfterSalesExecutionTaskCommand` 只写 `startedAt / startedBy` 并把待处理推进为处理中；查看详情和打开登记弹窗不写执行事实，库存变化只允许在完成命令中发生。
- `AfterSalesWarehouseAllocation = { allocationId, sourceLineId, materialCode, inventoryKey, warehouseCode, warehouse, location, batch, qty, uom }`。补发出库、换货出库和采购退货出库的正数量分配是实际库存来源唯一权威事实；任务头仓库或客户端位置文本不得替代分配行。
- `SubmitAfterSalesWarehouseResultCommand` 对每项任务物料要求 `Σ allocation.qty = taskQty`，同一物料不得重复使用同一库存事实键。服务端通过库存事实恢复真实物料、仓库、库位和批次，重新校验公司、仓库启用状态、所需职能及当前容量后才能原子扣库。
- 补发和换货容量使用普通可用库存，并要求仓库具备可销售出库职能；采购退货容量为不合格隔离、质检冻结、待入库与可退合格库存之和并受在手量上限约束。采购退货扣减顺序为不合格隔离 → 质检冻结 → 待入库 → 合格在手，避免先释放仍应冻结的退货库存。
- `AfterSalesExecutionRecord = { code, kind, actualDate, products, allocations, stockFacts, warehouseCode, warehouse, location, disposition, evidence, note, attachments, completedAt, completedBy }`。仓库完成命令追加一条不可变记录；列表和详情的实际日期、经办人、实际位置和作业结果只从已开始或已完成事实投影，不从创建日期、角色名称或计划位置反推。
- 多库存来源记录按分配行展开，单库存来源记录也使用同一字段骨架。任务进度百分比、已执行量和待执行量是由任务状态与冻结数量派生的读模型，不写回任务，不增加新的生命周期状态。

## 218. 售后作业开始、退货批次与目标位置合同（2026-08-01）

- `CompleteAfterSalesExecutionTaskCommand` 的前置状态固定为 `处理中`。`已完成`允许幂等返回原结果；`待处理 / 待前置 / 已取消`必须拒绝。仓库、质检和生产共用该门禁，不能由模块分支绕过。
- `AfterSalesReceiptAllocation = { allocationId, sourceLineId, materialCode, batch, qty, uom }`。客户退货接收要求每项任务物料满足 `Σ receiptAllocation.qty = taskQty`；正数量行批次必填，同一物料内批次唯一。该集合是售后收货库存批次的权威事实。
- `StageAfterSalesInbound` 逐退货批次写库存与流水，并把 `sourceLineId / materialCode / batch / warehouse / location / quantity` 固化到 `stockFacts`。不得以售后任务号、行序号或其他技术标识生成虚构批次。
- `AfterSalesTargetWarehouseGate` 统一校验目标仓库存在、启用、公司匹配及所需职能；`AfterSalesTargetLocationGate` 要求库位属于权威仓库库位集合。客户退货暂存使用“销售退货暂存”，采购暂存使用“采购暂存”，正式入库使用“可采购入库”，可再次销售重新入库使用“可销售出库”。
- `AfterSalesExecutionRecord` 增加可选 `receiptAllocations`，并适用于仓库、质检和生产完成事实。`actualDate` 对所有模块必填且不得晚于上海当前业务日；技术完成时间与实际业务日期继续分离。
- 原子完成任务的详情不再投影二元百分比。`TaskMaterialProjection` 只读取冻结物料和任务数量；是否已发生、实际数量、批次、位置、日期与人员由不可变执行记录表达。

## 219. 售后任务日期、人员与历史批次投影合同（2026-08-01）

- `AfterSalesTaskDisplayDate`：已完成取 `actualDate` 并标“实际日期”，缺失时仅为历史兼容回退 `completedAt` 的业务日并标“完成日期”；处理中取 `startedAt` 并标“开始日期”；待处理、待前置取 `createdAt` 并标“生成日期”。日期口径必须随值投影，生成日期不得标成实际日期。
- `AfterSalesTaskOperator`：已完成取 `completedBy`，处理中取 `startedBy`，其他状态为空。模块角色名不是经办人，禁止作为默认值写入或展示。
- `AfterSalesTaskResultProjection` 与任务生命周期分离。未完成返回“结果未登记”；完成任务按 `disposition / kind / stockFacts.stage` 派生已接收待检、已出库、已退回供应商、已入库、检验完成或返修完成，不读取 `warehouse` 或 `evidence` 作为结果文本。
- `AfterSalesTaskQuantitySortValue = Σ parseQty(product.qty)`。该值只服务列表粗排；带单位文本必须先解析数值，混合单位不得写成业务合计或用于库存判断。
- `LegacyAfterSalesBatchProjection` 识别 `${sanitize(taskCode)}-${sequence}` 形态的旧自动批次并显示“历史批次未登记”。底层历史库存键保持不变以维护流水追溯，新完成命令不得生成该形态。
- 历史已完成任务缺少 `startedAt` 时，`StartMilestoneProjection` 为空；读模型不得推断一个虚假的开始事实。完成事实和库存流水仍照常展示。

## 220. 售后执行入口与空记录提示合同（2026-08-01）

- 质检、生产任务没有仓库位置事实，未开始提示不得要求登记“位置”。
- 质检执行入口按检验阶段区分“登记检验结果”和“登记复检结果”；生产执行入口使用“登记返修结果”。
- 售后列表的日期、经办人和当前待办属于首屏关键事实，在常用桌面宽度下必须同时可见。
- `ExecutionEvidenceProjection` 随执行模块变化；质检和生产记录不复用仓库物流凭证文案。只有仓库完成命令允许在成功反馈中声明库存事实已同步。

## 221. 仓库售后位置、记录与登记完成度投影合同（2026-08-01）

- `AfterSalesActualPositionProjection` 仅在任务完成后，从任务分配、执行记录分配、`stockFacts` 和任务/记录仓库库位中去重生成；未完成返回“实际位置待登记”，历史完成且无位置返回“历史位置未登记”。批次不进入列表位置文本。
- `AfterSalesWarehouseNextAction` 按任务 `kind` 投影具体登记动作；待前置动作只从未完成的前置任务生成，不能复用位置投影。
- `HistoricalExecutionLocationProjection` 对缺失仓库、库位或批次返回“未登记”。只有显式库存分配行的空批次可以表达“无需批次”；技术任务号不得投影为执行依据。
- `RegisteredReceiptBatchQty = Σ qty where trim(batch) != ''`，只用于弹窗完成度显示；最终提交仍要求正数量批次行批次非空、批次唯一且全部数量合计等于任务数量。
- `WarehouseLocationFieldState`：仓库未选时禁用并提示先选仓库；仓库已选但没有权威库位时禁用并提示维护库位；存在权威库位后才能选择。
- `WarehouseStockOutcome` 与 `ExecutionBusinessResult` 分离。供应商退货的库存结果使用“已完成退货出库”，业务结果保留“已退回供应商”。

## 222. 售后库存流水来源与批次展示合同（2026-08-01）

- `AfterSalesLedgerSource = warehouse.stockLedger.sourceDoc`，售后仓库任务产生的库存流水必须使用 `WAS-*` 任务号作为来源单据；前端按该值搜索、汇总和回链 `/warehouse/after-sales/:code`。
- `AfterSalesLedgerBusinessType` 优先按 `reason` 投影售后收货、退货、补发、换货、返修品出库和异常暂存退回；`movementDirection` 仍保留入库、出库或状态变更方向，两者不得互相替代。
- `LegacyAfterSalesGeneratedBatch` 仅当批次满足“移除 `WAS-*` 任务号分隔符后的前缀 + 数字序号”时成立。该值在只读页面、搜索文本和导出中投影为“历史批次未登记”，但库存行键、批次分组键和流水原始事实不得改写。

## 223. 售后任务数量与历史执行记录重建合同（2026-08-01）

- `AfterSalesTaskQuantitySummary` 按 `uom` 分组汇总任务产品数量，形成独立列表字段和移动卡片主值；物料身份字段不再拼接任务数量。
- `HistoricalAfterSalesExecutionProjection` 的启用条件为：仓库任务状态为已完成、正式 `executionRecords` 为空、且存在 `stockLedger.sourceDoc = task.code` 的非冲销流水。任一条件不满足时不得重建。
- 出库任务选择 `quantityNumber < 0` 的流水，入库任务选择 `quantityNumber > 0` 的流水；每条流水形成一条不可编辑的分配事实，并保留 `inventoryKey、sourceLineId、materialCode、warehouseCode、warehouse、location、batch、qty、uom`。
- 重建记录只存在于 API 响应投影中，标记 `historicalProjection = true`。它不进入持久化任务数组，不参与库存扣减、重复提交、任务完成或下游任务放行。
- `AfterSalesActualPositionProjection` 的事实优先级为任务分配/执行记录/库存事实，其次才是任务头仓库与库位。只有前一层没有任何位置时才能使用任务头兜底，避免“完整仓库·库位 + 旧仓库空库位”被误判为两个实际位置。

## 224. 售后来源依据、实际事实与状态色合同（2026-08-01）

- `AfterSalesSourceContextProjection = { issueType, issueDescription, action, goodsDisposition }`，分别投影为问题类型、问题说明、处理方案和实物安排。四项均属于来源售后单依据，不属于执行记录。
- `goodsDisposition` 表达创建售后方案时对实物的安排，例如客户退回待检或无需退回；实际库存位置必须从 `AfterSalesExecutionRecord.allocations/stockFacts` 投影，两者不得互相替代。
- `AfterSalesWarehouseStockTone = task.status === '已完成' ? success : warning`。完成任务的库存结果即使文本包含退货、退回、冻结或报废，也应以该任务已经完成库存动作的事实显示完成色；通用关键词状态色不能覆盖本领域事实。
- `AfterSalesTaskStepTone`：无前置为 `neutral`，前置完成/已开始/结果已提交为 `success`，前置待完成/未开始/待登记为 `warning`。步骤色由结构化状态决定，不由展示文案的关键词决定。
- `AfterSalesPredecessorProjection` 同时提供总体是否仍有待完成任务及逐任务 `code/kind/status/module`；详情使用状态徽标展示逐任务状态，路由仍由任务模块决定。
- 详情布局分层保持 `TaskOverview、TaskMaterial、ExecutionRecord、TaskStatus、SourceContext、Predecessor`，来源上下文不得进入作业记录，前置任务不得进入实际位置或库存结果。

## 225. 销售退回物独立质检与动态任务图合同（2026-08-01）

- `SalesAfterSale.action` 是客户商务处理事实；`salesReturnQualityDisposition = 可再次销售 | 返修返工 | 报废` 是销售退回物初检事实；`salesRepairQualityDisposition = 合格 | 报废` 是返修品复检事实。三个字段不得互相覆盖或由页面文案反推。
- `SalesReturnInspectionDecision` 不因 `action` 不同裁剪结论集合。完成销售退货检验时先原子更新退回物质量状态，再按结论刷新后续任务图；旧普通处置任务若尚未开始且不再适用，状态改为已取消并退出当前 `executionTaskCodes`。
- `AfterSalesExecutionTask.taskKey` 是动态任务图中的稳定业务节点键。任务代码可以保留历史编号，依赖必须通过 `predecessorCodes` 指向当前权威任务；任务图允许多个任务共享同一已完成前置，不再隐式把数组上一项作为唯一依赖。
- 换货出库和退回物处置均以销售退货检验完成为前置，可以并行开始。返修生产以前次销售退货检验为前置，返修品复检以前次生产任务为前置，最终返还、正式入库或报废以前次复检为前置。
- `ReturnRefund + 返修返工` 与 `Exchange + 返修返工` 的返修合格品不返还原客户，进入 `返修品入库处置`；该动作从原售后暂存 `pendingInbound` 扣减并增加所选可销售正式仓的物理及合格库存。原方案为返修且初检可再次销售时使用 `退货品返还出库`，直接消耗同一暂存事实。
- 动态任务刷新不得取消已完成任务、复制库存流水或重复通知。一次质量完成可能同时释放多个待办，通知按任务代码幂等写入。
- `AfterSalesExecutionQueueProjection` 排除状态为已取消的旧分支任务；任务实体及取消原因继续保留，主售后单只投影当前 `executionTaskCodes`，直接任务详情允许审计已取消事实。
- `PurchaseAfterSalesSourceBatchKey = materialCode + '|' + batch` 从来源采购订单所有未冲销正式入库 posting 派生。采购退货任务存在对应物料来源键时，库存候选和完成命令必须同时校验该键；仓库、库位可以反映后续真实移动，但批次不能替换成同物料的其他采购来源。

## 226. 物料身份只读投影合同（2026-08-02）

- `DocumentMaterialIdentitySnapshot = { materialCode, name, model?, spec? }`。销售、采购和仓库单据行以各自保存的快照作为名称、编码、型号和规格的权威展示事实，历史单据不得因物料主数据改名或改规格而被静默覆盖。
- `MaterialIdentityVisualProjection = { imageUrl?, imageLabel, imageTone }` 只承担快速识别。图片可以读取当前物料主数据；无图片时优先使用稳定的物料图片标签，其次从物料编码末段派生短标签，最后才从名称派生。视觉投影不参与金额、库存、批次或审批判断。
- `MaterialIdentityMeta = joinDistinct(materialCode, model, spec, ' · ')`。空值省略、相同值去重，字段顺序固定。数量、单位、批次、仓库、库位、来源单据和状态不属于该投影。
- 所有只读单据物料位置消费同一 `MaterialIdentity` 组件。`compact` 仅改变图片和间距，不改变数据合同；编辑态继续由物料引用选择器写入快照。
- `WarehouseStocktakeLine` 在开始盘点时冻结 `{ materialCode, item, model?, spec?, imageLabel?, imageTone? }`。旧盘点行的只读响应可以用当前物料主数据补齐尚未保存的可视字段，但必须优先保留行内已有值，且不得回写历史库存事件。

## 227. 其他出入库阶段投影与库存调整来源事实（2026-08-02）

- `OtherMoveLifecycleProjection = 草稿 | 执行中 | 已完成 | 已冲销`，由单据状态与冲销事实派生；它不等于库存过账状态。
- `OtherMoveApprovalProjection` 固定为：草稿对应待提交，待审核对应待审核，待过账及已过账对应已审核。`OtherMovePostingProjection` 固定为：草稿和待审核对应未过账，待过账对应待过账，已过账对应已过账。任何页面不得用“待确认、未完成、已完成”替换过账事实。
- `WarehouseOtherMove.targetWarehouse` 对样品、领用、报废、借用和借用归还是必填业务对象；对库存调整是可选来源说明。库存调整没有该事实时，页面不生成占位值，也不把缺失值投影为外部来源或外部去向。
- `OtherMovePositionProjection` 对库存调整只由 `{ warehouseCode, warehouse, location, direction }` 形成；对其他类型可以在实际仓库两侧补充 `targetWarehouse` 形成来源或去向说明。所有库存校验和过账仍只消费真实仓库、库位、物料、批次和数量。
- 用户在编辑态把业务类型切换为库存调整时，应清除上一业务类型残留的业务对象输入；历史库存调整若确有 `targetWarehouse` 快照则只读保留，不改写既有单据。
- `OtherMoveMaterialIdentity` 继续消费 `DocumentMaterialIdentitySnapshot`；“物料”只是字段名，成品库存仍属于可选择物料范围，不新增“成品”并行事实。

## 228. 其他出入库列表汇总与正式库位合同（2026-08-02）

- `OtherMoveListMaterialProjection = { title, identityMeta, quantitySummary, batchSummary }`。`title` 取首项名称并在多行时标明明细数；`identityMeta` 只包含首项物料编码、型号和规格；数量与批次为独立展示事实。
- `quantitySummary` 按 `uom` 分组汇总所有明细 `qty`，不同单位不得相加。`batchSummary` 对非空批次去重：一个批次显示批次号，多个批次显示数量，没有批次时不制造批次值。
- 列表数量排序的数值可以作为便捷粗排，但页面和导出必须保存分单位的真实数量汇总，不能用第一行数量代替单据总量。
- `isPlaceholderWarehouseLocation(location) = location === 默认库位 || /-AUTO$/i.test(location)`。该判断用于其他出入库展示与提交门禁；展示投影返回历史库位未登记，写命令返回 400 并要求正式库位。
- 历史已过账单据和库存流水中的占位库位继续作为不可变兼容键保留。页面清洗不得删除库存行、合并位置、重写流水或反向补造正式库位。

## 229. 库存调拨批次候选、正式库位与分单位影响合同（2026-08-02）

- `TransferListMaterialProjection = { title, identityMeta, quantitySummary, batchSummary }`。`identityMeta` 只包含物料编码、型号和规格；`quantitySummary` 按 `uom` 汇总整单明细；`batchSummary` 对非空批次去重。不同单位不得求和，第一行数量不得代表整单。
- `TransferSourceBatchCandidate` 仅从 `{ fromWarehouseCode, materialCode, available > 0, batch != '' }` 生成，并按批次聚合可用数量与真实库位数。客户端可以提交一个真实候选批次，或提交空批次表示确认调出时自动分配；其他自由文本批次在提交时拒绝。
- `TransferTargetLocation` 必须由用户明确提交、满足目标仓库的正式库位集合并通过 `!isPlaceholderWarehouseLocation(toLocation)`；目标仓只有一个正式库位时也不得由客户端或服务端静默补值。`默认库位` 与 `*-AUTO` 只属于兼容技术键，不得成为新调拨的目标库存键。
- `TransferCompanyInvariant` 要求调出仓公司、调入仓公司和调拨单公司相同。服务端按仓库主数据重新读取公司与仓库身份，客户端传入名称不能绕过跨公司门禁。
- `TransferImpactQuantitySummary` 优先从调出后冻结的 `transitLines` 按 `uom` 汇总；调出前读取单据行计划数量。`status = 已完成` 时当前 `inTransit = 0`，保存的 `transitLines` 只是历史分配证据，不能作为当前在途余额展示。
- `TransferLatestMilestoneProjection` 按状态读取 `{ submittedBy, submittedAt } / { dispatchedBy, dispatchedAt } / { receivedBy, receivedAt }`。最近动作人员和时间是执行事实；单据 `owner` 只是任务经办人。
- `WarehouseTransfer.owner` 未由客户端明确指定时取当前认证创建人；不得使用固定演示人员作为服务端兜底。后续动作人员仍只来自各动作命令的认证会话，不从 `owner` 推导。
- `TransferDispatchConfirmation` 与 `TransferReceiptConfirmation` 是命令执行前的交互闸门：前者说明调出扣减与目标在途，后者说明目标在途转正式可用库存，并展示仓库、目标库位和分单位数量。用户取消时不得调用调出或调入命令；确认后仍以服务端状态、库存守恒和幂等校验为准。
- `WarehouseTransfer.note` 只保存不会因阶段推进而失真的业务说明；“当前在途/尚未调入”等瞬时结论不属于备注事实，必须由状态、里程碑和库存影响投影。
- 完成调拨的独立冲销恢复原调出仓、扣回原调入仓并保持当前在途为零。页面允许用历史调拨数量说明原影响，但不得把原影响描述成仍在途或仍待过账。

## 230. 库存调拨取消终态与在途守恒合同（2026-08-02）

- `TransferCancellationAllowed = status in {草稿, 待出库}`。取消命令必须原子写入 `status = 已取消、cancellationReason、cancelledAt、cancelledBy` 与一条调拨流程记录；认证会话人员是动作人员的唯一权威来源，客户端 `actor` 不可信。
- `TransferCancellationInventoryDelta = 0`。取消不得创建或修改 `transitLines`，不得扣减调出仓，不得增加 `inTransitNumber` 或调入仓 `onHandNumber`，也不得写库存流水。
- `TransferInTransitInvariant`：状态为调拨中或待入库时，调出扣减与目标在途必须同时存在。任何取消、作废或中断命令都不得跳过在途结算；只能确认调入把本单在途归零并增加目标库存。
- `TransferCancelledLifecycleProjection = 已取消`，`TransferCancelledOperationStage = 已取消`，最近里程碑读取 `{ cancelledBy, cancelledAt }`；状态摘要的取消原因读取 `cancellationReason`。
- 兼容旧 `status = 已作废` 的调拨只进入 `TransferCancelledLifecycleProjection`，详情阶段、下一步和零库存影响必须与取消终态一致；不得为该兼容状态重新开放调出、调入或冲销动作。
- `TransferCancelledImpactProjection = { source: 未扣减, inTransit: 0·未形成, target: 未增加 }`。该终态不能继续提交、调出、调入或冲销；冲销只属于已完成且确实产生双仓库存事实的调拨。
- `IncompleteSubmittedTransferGuard` 只校验已提交待出库单的必需业务事实。缺少事实时客户端禁用调出并引导取消后重建；服务端 `assertTransferReady` 仍是库存动作前的最终权威门禁。

## 231. 库存调拨实际分配行读模型合同（2026-08-02）

- `TransferPlannedLineProjection` 在草稿和待出库阶段读取 `WarehouseTransfer.products[]`，表达拟调拨物料、计划数量与显式批次；空批次只表示调出命令尚未完成实际库存分配。
- `TransferActualAllocationProjection` 在存在 `transitLines[]` 后逐条输出 `lineId / materialCode / inventoryKey / targetInventoryKey / sourceLocation / batch / qty / uom`。`sourceLocation` 优先读取来源库存键对应的库存行，兼容数据可从稳定 `inventoryKey` 解析。
- 实际分配行的名称、型号、规格、批次管理方式和视觉标签从匹配的原调拨行补齐；该补齐只用于显示，不覆盖 `transitLines` 已冻结的库存键、批次、数量或单位。
- 同一计划行自动跨多个批次或来源库位分配时，读模型必须保留多行及各自行数量。不得把批次拼成逗号字符串后继续用计划总量冒充每批实际数量。
- 已完成调拨继续保存 `TransferActualAllocationProjection` 作为双仓流水和冲销的历史依据，但 `CurrentTransferInTransitQty = 0`；历史分配行不能被解释为仍在途。

## 232. 库存调拨冲销终态投影合同（2026-08-02）

- `TransferReversedLifecycleProjection = 已冲销`，`TransferReversedOperationStage = 已冲销`。一旦存在 `reversalCode`，冲销事实优先于原单 `status = 已完成` 的普通完成态展示；原主状态仍保留在业务实体中，不被冲销命令覆盖。
- `TransferReversalMilestoneProjection = { reversalCode, reversalReason, reversedBy, reversedAt }`。状态卡最近里程碑读取 `{ reversedBy, reversedAt }`，阶段说明读取 `reversalReason`，下一步读取冲销记录入口；原 `{ receivedBy, receivedAt }` 只属于被冲销调拨的历史动作。
- `TransferReversedImpactProjection = { source: 原扣减已恢复, inTransit: 0·已清零, target: 原入库已扣回 }`。`transitLines` 继续提供原调拨的逐库位、逐批次和逐数量证据，不等于当前库存仍受原单影响。
- 列表、详情和导出若同时消费生命周期、作业阶段与下一步，必须共同识别 `reversalCode`，不得出现生命周期已冲销但阶段仍已调入的矛盾投影。

## 233. 库存盘点执行投影、过账确认与冲销合同（2026-08-02）

- `StocktakeHeaderFrozen = status in {盘点中, 待复核, 已完成, 已取消} or reversalCode != ''`。开始盘点后，`date / owner / warehouseCode / warehouse / scopeMode / scope / materialCode` 均以开始时快照为准；后续编辑命令只能改变实盘数量、备注与附件等执行事实。
- `StocktakeQuantityProjection = groupBy(uom, sum(bookQty), sum(countedQty), sum(max(differenceQty, 0)), sum(abs(min(differenceQty, 0))))`。账面合格数、实盘合格数、盘盈数量和盘亏数量必须按单位分别输出，不同单位不得相加；项目数只用于进度投影。
- `StocktakeLatestMilestoneProjection` 按状态读取 `{ startedBy, startedAt } / { submittedBy, submittedAt } / { reviewReturnedBy, reviewReturnedAt } / { completedBy, completedAt } / { cancelledBy, cancelledAt } / { reversedBy, reversedAt }`。兼容历史字段缺失时允许读取匹配的不可变 `flow[]` 日志详情作为只读回退。
- `StocktakeCompletionConfirmation` 是完成命令前的交互闸门，必须展示仓库、盘点范围和 `StocktakeQuantityProjection` 的盘盈盘亏结果。用户取消时库存余额、冻结、流水和单据状态均保持不变；确认后的最终正确性仍由服务端状态、冻结与幂等门禁保证。
- `StocktakeReversedLifecycleProjection = 已冲销`，`StocktakeReversedOperationStage = 已冲销`，`StocktakeReversedPostingStage = 已冲销`。存在 `reversalCode` 时，冲销事实优先于原 `status = 已完成` 的普通完成投影，最近记录读取冲销人员与时间，下一步读取冲销号。
- `StocktakeReversedImpactProjection` 保留账面量、实盘量和原盘盈盘亏作为历史证据，同时明确原库存差异已由反向流水冲销且冻结保持解除。原盘点行、原完成状态和原流水不得被删除或改写。

## 234. 库存盘点范围候选、冻结预览与列表筛选合同（2026-08-02）

- `StocktakeScopeCandidates(warehouse, scopeMode)` 只读取所选启用仓库中 `qualifiedOnHand > 0` 的库存事实，并分别投影正式库位、物料编码或真实批次。`warehouse` 改变或清空时，非全仓模式的 `scope / scopeLabel` 必须同时清空后重新选择。
- `StocktakeStartPreview = { warehouse, scopeLabel, snapshotLineCount, availableQtyByUom }`。`snapshotLineCount` 使用与开始命令相同范围规则筛选当前库存行；`availableQtyByUom` 按单位汇总当前可用数量，不同单位不得相加。
- `StocktakeStartConfirmation` 是快照和冻结命令前的交互闸门。取消确认时 `CreateStocktakeCommand / StartStocktakeCommand / freezeSources / frozenNumber` 均不得发生；确认后仍由服务端重新读取库存、检查范围冲突并原子形成快照与冻结。
- `StocktakeFilterStatus = reversalCode ? 已冲销 : status`。该值用于盘点状态筛选；详情和列表生命周期仍可投影为草稿、执行中、已完成、已取消或已冲销。导出状态读取 `StocktakeLifecycleProjection`，避免原状态“已完成”覆盖冲销终态。
- `StocktakeUnstartedProgressProjection` 在待盘点时为“待生成账面快照 / 开始盘点后生成”，在开始前取消时为“未形成账面快照 / 取消前未开始”。`StocktakeCancelledBeforeStartImpact = { snapshot: 未形成, count: 未开始, difference: 未形成, freeze: 未形成 }`；只有 `plannedCount > 0` 才能展示已盘项数和差异项数。
- `WarehouseStocktake.owner` 未由客户端明确提交时取当前认证创建人；固定演示人员不得作为服务端业务兜底。动作人员继续分别来自各命令的认证会话。

## 235. 库存盘点负责人引用与开始前门禁合同（2026-08-02）

- `StocktakeOwnerIdentity = { ownerEmployeeCode, owner }`。`ownerEmployeeCode` 是稳定员工引用，`owner` 是盘点任务建立时的姓名快照；两者不等于各生命周期命令的实际操作人。
- `StocktakeOwnerCandidate` 仅包含满足 `employee.status = 启用 && linkedAccount.status = 启用 && linkedAccount.roles contains ROLE-WAREHOUSE` 的员工。创建或待盘点保存时服务端按编码重建姓名并再次校验候选资格；历史无效负责人必须重新选择后才能开始。
- `StocktakeHeaderFrozen` 同时覆盖 `ownerEmployeeCode / owner`。进入盘点中后，客户端提交不同编码、姓名、仓库或范围均不得改写已形成快照的任务头。
- `StocktakeStartPrecondition = dateIsValid && ownerIsValid && warehouseIsValid && scopeModeIsValid && scopeIsComplete`。客户端在显示 `StocktakeStartConfirmation` 前先执行同一组必填校验；清空盘点日期不得被服务端静默替换为当天，缺项也不能产生快照数量或冻结数量预览。服务端开始命令仍是最终权威门禁。
- `LegacySpecifiedScopeMatch(rowKey, scopeKey) = rowKey.includes(scopeKey) || scopeKey.includes(rowKey)`。客户端开始预览与服务端快照筛选共享该兼容语义；结构化新单继续优先使用按库位、按物料、按批次或全仓的精确匹配。

## 236. 库存查询完整分组筛选与历史库位展示合同（2026-08-02）

- `InventoryGroup(view, partyFilter) = groupBy(InventoryRows filtered by partyFilter, InventoryGroupKey(view))`。物料筛选可先限定来源行；库存判断、更新时间和关键字筛选不得先裁剪组内余额事实。
- `InventoryVisibleGroup = InventoryGroup where AggregateStatus(group.rows) matches statusFilter && LatestUpdatedAt(group.rows) in dateRange && SearchValues(group) matches keyword`。列表数量、仓库分布、批次明细、占用来源、详情和导出都消费该完整分组，不再各自重算另一套余额。
- `InventoryStatusFilterOptions = unique(AggregateStatus(each InventoryGroup)) ∪ ReplenishmentNonNormalStatus`。筛选候选与当前物料、库位或批次视角的状态优先级保持一致；单行状态不得冒充分组状态。
- `InventoryLocationDisplay(location) = 历史库位未登记` 当 `location` 为空、等于 `默认库位` 或匹配 `/-AUTO$/i`，否则返回真实库位。该函数只影响查询、流水和导出展示；`inventoryKey / warehouse / rawLocation / ledger` 保持不变。
- 补货关系编码继续作为稳定内部身份和搜索值，不属于补货预警卡的默认业务字段。当前库存查询未实现分页时只输出结果总数，不产生伪分页状态。

## 237. 库存查询主从工作台与独立预警投影合同（2026-08-02）

- `InventoryWorkbench = ReplenishmentSummary + InventoryViewTabs + InventoryMasterDetail`。`ReplenishmentSummary` 默认折叠，只投影非正常预警总数和各状态数量；展开动作只改变页面呈现，不改变任何库存或补货事实。
- `InventoryFilterDomain = InventoryGroupStatus × Material × LatestInventoryMovementRange × Keyword`。`InventoryGroupStatus` 仅来自当前视角 `AggregateStatus(InventoryGroup.rows)`；补货状态属于 `ReplenishmentProjection`，不得并入库存筛选候选。此合同覆盖第 236 节中把补货状态并入库存筛选候选的旧表述。
- `VisibleReplenishmentSignals = ReplenishmentSignals where status != 正常 order by ReplenishmentRiskRank, updatedAt desc`。它独立于 `InventoryFilterDomain`；库存查询无结果时仍可显示真实预警摘要，反之亦然。
- `InventoryViewTransition(view, keyword, sort) = replaceQuery(view, keyword) + retainLoadedSourceRows + retainSort`。物料、库位、批次切换只重新形成分组读模型，不重新请求相同库存、补货和流水来源；默认物料视角可省略 `view` 查询参数。
- `InventoryRiskRank = 不合格隔离 < 异常暂存 < 待检 < 待入库/在途 < 已占用 < 需关注 < 正常/充足`。风险排序只用于读模型优先级，不修改来源行状态，也不把存在占用的正常库存重新写成异常库存。
- `InventoryLocationListProjection = { itemCount, batchCount, attentionCount }`。`attentionCount` 统计状态非正常或存在锁定、待出库计划的明细行；不同计量单位的库存数量不合并为库位卡片主 KPI。
- `InventoryControlledQtyProjection = nonZero({ qcHold, pendingInbound, rejectedHold, exceptionHold, inTransit })`，分别用于分组判断、仓库汇总和逐批次/库位明细。字段为零时可以省略逐行文本，但分组总量区仍保留完整受控数量口径。
- `InventoryExportProjection` 与所选视角的完整分组读模型同源，并显式输出物理、合格、可用、各占用类别、各受控类别、计划出入库及结构化占用来源。导出不使用内部库存键或来源行标识替代业务字段。

## 238. 库存查询详情渐进披露与多单位受控数量合同（2026-08-02）

- `InventoryResultRowProjection = { identity, status, primaryMetrics[3], riskText? }`。`riskText` 在库存判断为可正常使用且不存在占用或计划时省略；省略仅影响展示密度，不改变分组状态、余额或导出事实。
- `InventoryCoreBalanceProjection = { physicalOnHand, qualifiedOnHand, available }`。`InventoryJudgementProjection = { aggregateStatus, riskSummary }` 是独立完整结论，不属于可截断的数量 KPI；列表状态、详情状态和判断结论继续来自同一完整分组。
- `InventoryControlledFactEntries(group) = nonZeroByUnit({ reserved, allocated, frozen, qcHold, pendingInbound, rejectedHold, exceptionHold, inTransit, inboundPlan, outboundPlan })`。每个数量字符串先按 `/` 拆分计量单位，仅保留数值大于零的单位片段，再决定整项是否显示；不得只解析第一个数字。
- `InventoryDetailSectionOrder = BatchTrace? → CoreBalance → Judgement → ControlledFacts? → Distribution? → DetailRows → OccupationSources? → Ledger`。`?` 表示按视角或事实存在性呈现；页面顺序不能改变来源事实的权威性。
- `InventoryPaneScrollReset`：视角变更后 `{ master.scrollTop, detail.scrollTop } = { 0, 0 }`；选择不同分组后 `detail.scrollTop = 0`。它是读取定位规则，不触发重载、重新排序或业务写入。
- `InventoryDetailTrackSizing = max-content per section`。外层详情容器承担滚动，批次追溯、余额、判断和明细区块不得因固定容器高度与自动网格压缩而获得近零可见高度。

## 239. 库存任务表、详情抽屉与独立预警工作台合同（2026-08-02）

- 本节覆盖第 237、238 节中 `InventoryMasterDetail` 的常驻双栏呈现，不覆盖库存分组、状态优先级、数量口径、补货阈值公式或导出事实。
- `InventoryQueryWorkbench = TaskViewPreset × GroupDimension × InventoryFullWidthTable + OnDemandDetailDrawer`。`TaskViewPreset ∈ {库存余额, 收货质检, 发货可用, 批次效期}` 定义列集合与工作范围；收货质检范围为存在待检、待正式入库、不合格隔离、异常暂存或在途事实的分组，发货可用范围为存在合格、占用或待出库计划的分组。`GroupDimension ∈ {物料, 库位, 批次}` 继续调用同一 `InventoryGroup`，预设不能重算另一套余额。
- `BatchExpiryViewInvariant = TaskViewPreset == 批次效期 => GroupDimension == 批次`。该不变量由路由解析、视图切换和维度控件共同保证；批次效期下选择非批次维度不触发状态变化，更不能隐式把 `TaskViewPreset` 改回库存余额。
- `InventoryDetailDrawer(groupKey)` 消费当前可见分组，按 `CoreBalance → Judgement → ControlledFacts → Distribution → DetailRows → OccupationSources → Ledger` 渐进披露。抽屉开关是本地呈现状态，不重载库存来源，不修改 URL 中的搜索、任务预设和分组状态；`groupKey` 改变时抽屉滚动容器回到顶部。`OccupationSources` 在当前库存分组内按 `{ type, sourceDoc, status, path }` 汇总数量，默认不输出内部 `sourceLineId / inventoryKey`。批次、占用和流水来源存在可解析仓库路由时继续下钻，不可解析来源只读展示。
- `InventoryAlertWorkbench = ReplenishmentQueue + ControlledInventoryQueue + ExpiryQueue + DataAnomalyQueue`，使用独立 `/warehouse/inventory-alerts` 路由和仓库侧栏同级菜单。库存查询与库存预警不互设跨页按钮；四类队列共享搜索、物料、状态和更新时间筛选，但不共享库存查询的 `InventoryGroupStatus` 筛选。
- `SidebarPathMatch(menuPath, currentPath) = currentPath == menuPath || currentPath startsWith (menuPath + '/')`，根路径只允许完全相同。该边界用于子菜单选中、模块展开和活动分组同步；字符串相似但没有 `/` 路径边界的同级功能不得同时命中。
- `ControlledInventoryQueue = rows where qcHold > 0 || pendingInbound > 0 || rejectedHold > 0 || exceptionHold > 0`；同一库存行可以汇总多项待处理数量，状态按不合格隔离、异常暂存、待检、待正式入库的优先级投影。
- `ExpiryQueue = rows where physicalOnHand > 0 && expiryDate <= today + 90 days`，状态分为已过期、30 天内到期、90 天内到期。`DataAnomalyQueue = rows where physicalOnHand < 0 || available < 0 || locationIdentity missing`；批次缺失只有在物料批次控制事实明确要求批次时才能视为异常。
- `ReplenishmentQueue` 继续消费 `WarehouseReplenishmentSignal`，必须展示当前可用、待正式入库、在途、预计可用、安全库存、补货点、最高库存、建议补货量、处理状态和关联单据。存在未结束关联单据时只下钻既有单据，不重复生成需求。
- `InventoryWorkbenchSort(mode)` 作用于当前筛选后的可见队列：`newest / oldest` 按最近更新，`amountDesc` 在补货队列按建议补货量、其他预警按涉及数量，在查询工作台按可用量或库位物料种数，`status` 按风险优先级后再按最近更新。工具栏不得显示不生效的排序项。
- `InventoryQueryLoad = PrimaryInventoryRows + SupplementaryStockLedger`。两项请求并行发起，`PrimaryInventoryRows` 成功后即可形成查询表；流水请求的等待或失败不得阻断、清空或伪装余额结果。`InventoryAlertLoad = InventoryRows + ReplenishmentSignals` 由独立预警工作台负责，库存查询不为页面入口或数量摘要额外请求补货信号。

## 240. 库存任务列集合与多单位可见性合同（2026-08-02）

- `ReceivingInventoryTaskScope(group) = anyPositiveByUnit({ inTransit, qcHold, pendingInbound, rejectedHold, exceptionHold })`；`ReceivingInventoryColumns = { physicalOnHand, inTransit, qcHold, pendingInbound, rejectedHold, exceptionHold, qualifiedOnHand }`。每个范围触发事实必须拥有独立可见列，不得把 `rejectedHold + exceptionHold` 重新合并为无来源的显示数量。
- `ShippingInventoryTaskScope(group) = anyPositiveByUnit({ qualifiedOnHand, locked, outboundPlan })`；`ShippingInventoryColumns = { qualifiedOnHand, reserved, allocated, frozen, outboundPlan, available }`。`outboundPlan` 是范围事实和独立业务事实，不得从默认表中省略。
- `BatchExpiryColumns = { batchIdentity, itemIdentity, batchDate, expiryDate, qcStatus, physicalOnHand, qualifiedOnHand, available }`，其中首列投影顺序固定为 `batchIdentity / itemIdentity`。批次效期视图的合格在库不可由物理在库或可用库存替代推断。
- `AnyPositiveByUnit(value) = split(value, '/') any parseQuantity(segment) > 0`。该布尔判断只用于存在性与视图范围，不把不同计量单位相加。`InventoryQueryAmountSort` 仅在 `GroupDimension == 库位` 时可用并按 `itemCount` 排序；离开库位维度后若当前排序为 `amountDesc`，必须回退到 `status`。

## 241. 库存查询上下文迁移与筛选域合同（2026-08-02）

- `InventoryStatusFilterDomain = unique(InventoryGroups filtered by AppliedMaterialFilter and InventoryTaskScope).aggregateStatus`。该域不消费当前状态筛选本身，避免循环裁剪；未进入当前任务范围的分组不得贡献状态候选。
- `ReconcileInventoryStatusFilter(selected, domain) = selected ∩ domain`。任务预设、汇总维度或路由历史改变后执行交集，保留仍有效状态并移除失效状态；不得保留不可见筛选值，也不得无条件清空仍然有效的选择。
- `InventoryQueryTransition(nextTask?, nextDimension?) = replaceQuery({ task, view, keyword: normalizedCurrentKeyword }) + retain({ materialFilter, dateRange, supportedSort }) + closeDetailDrawer`。查询过渡复用已加载余额；`keyword` 为空时从 URL 删除，非空时必须保留。
- `ClearInventoryConstraints = localSearch('') + AppliedFilters(empty) + removeQuery('keyword')`。清空后刷新、前进或后退不得从当前 URL 恢复已经清除的搜索词。

## 242. 库存物料身份与批次公共事实合同（2026-08-02）

- `InventoryMaterialKey(row) = row.materialCode ? code(row.materialCode) : legacy(row.item, row.itemType)`。`InventoryGroupKey(item/batch)`、库位内物料明细键和库存流水匹配共享该身份；当余额与流水两侧均有编码时必须编码相等，一侧缺少编码时才允许名称和类型兼容匹配。
- `BatchDate(group) = min(nonEmpty(row.batchDate)) ?? min(group.ledger.time) ?? min(group.updatedAt)`。`BatchExpiry(group) = unique(map(BatchExpiryDate, group.rows)).length == 1 ? value : 效期不一致`。批次公共元数据不得依赖来源数组顺序。
- `UnidentifiedBatchOrigin(group) = sourceDocuments.length > 1 ? count(sourceDocuments) + 个来源单据 : firstOrigin`；多来源的未记录批次不产生单一 `originPath`。已识别批次仍以最早可追溯流水作为来源事实。
- `InventoryQtyByUnit(field) = sumBy(uom, field) |> removeZeroUnitsWhenAnyNonZero`。多单位全部为零时投影为 `0`，单单位全零保留单位。`InventoryTaskQty(0) = —` 只改变任务表受控列呈现，不改变余额、搜索、状态、详情或导出值。
- `InventoryTableTransition = resetHorizontalScroll(0) + retainQueryContext`；首个身份列使用横向粘滞定位。该操作只改变阅读位置，不改变分组、余额、选中行或库存事实。

## 243. 库存物料筛选、库位流水与查询上下文合同（2026-08-02）

- `InventoryMaterialFilterOption = { value: InventoryMaterialKey(row), label: row.item + row.materialCode/itemType }`。`AppliedMaterialFilter(rows) = rows where InventoryMaterialKey(row) == selected.value`；同名不同编码不得共享一个筛选值。`LocationItemCount` 与 `LocationBatchCount` 同样以 `InventoryMaterialKey` 参与去重。
- `InventoryDetailLedger(row) = latest(ledger where materialMatch && batch == row.batch && warehouse == row.warehouse && location == row.location)`。明细入账日期与来源单据消费同一库位范围；批次分组整体流水仍可覆盖该批次全部仓库和库位。
- `InventoryKeywordContext(input) = replaceQuery(keyword = trim(input)) after debounce`；空值删除 `keyword`，查询参数变化只重组已加载库存，不产生重复 API 请求。任务和维度切换继续复用该参数。
- `UnidentifiedBatchListIdentity = displayBatchLabel + materialIdentity + originHint`。来源提示只用于区分未登记或历史技术批次，不替换底层批次键，也不改变来源下钻规则。
- `InventoryDetailFocus = open -> focus(dialog) + trap(Tab); close -> restore(trigger)`。该合同属于呈现层，不参与库存事实投影。

## 244. 库存可用性与受控事实分维合同（2026-08-02）

- `InventoryAvailabilityStatus ∈ {数据异常, 无可用库存, 待转可用, 全部占用, 部分可用, 可用}`。该状态只投影库存是否能够被领用或出库，不消费补货阈值状态，也不把质量与仓库作业事实改写成主状态。
- `BalanceAnomaly(row) = onHand < 0 || qualified < 0 || available < 0 || locked < 0 || qualified > onHand || available > qualified || locked > qualified || available + locked != qualified`。任一库存行命中时分组可用性为“数据异常”；库存查询与库存预警数据异常队列共享同一 `BalanceAnomalyReasons`，预警必须显示具体不等式原因。
- `ItemOrBatchAvailability(group) = any(available > 0) ? 可用 : none`。`LocationAvailability(group) = all(material.available > 0) ? 可用 : any(material.available > 0) ? 部分可用 : none`；库位按 `InventoryMaterialKey` 先聚合每种物料，不能让一种物料的可用量掩盖另一种物料完全不可用。
- 当分组没有可用量时：`any(qualified > 0 && locked > 0) -> 全部占用`；否则 `any(qcHold > 0 || pendingInbound > 0 || inTransit > 0) -> 待转可用`；否则为“无可用库存”。`rejectedHold / exceptionHold` 不进入待转可用计算。
- `InventoryControlFacts(group) = orderedNonZero({不合格隔离: rejectedHold, 异常暂存: exceptionHold, 待检: qcHold, 待正式入库: pendingInbound, 调拨在途: inTransit})`。它独立输出紧凑摘要、完整悬浮文本和数量构成；存在受控事实不改变已有可用库存的可用性结论。
- `InventoryAvailabilityFilterDomain = unique(group.availabilityStatus)`；补货状态、原始库存行状态和受控事实不进入该筛选域。`InventoryAvailabilitySort = controlSeverity asc, availabilityRisk asc, updatedAt desc`，兼顾受控库存优先核对和主状态语义一致性。
- `InventoryAvailabilityExport = { availabilitySummary, controlDetail, availabilityStatus }`。列表、详情、筛选、排序和导出共享同一分组投影；旧的 `需补货 / 需关注 / 正常 / 充足` 只可继续存在于来源兼容数据或库存预警，不得作为库存查询主状态。

## 245. 库存查询与库存预警交互一致性合同（2026-08-02）

- `InventoryAlertMaterialFilterOption = { value: InventoryMaterialKey({ materialCode, item }), label: item + materialCode }`。候选域取当前 `InventoryAlertTab` 的真实行；`AppliedInventoryAlertMaterialFilter` 必须按同一身份键匹配，不能按物料名称合并同名不同编码。
- `ReplenishmentGapRatio(signal) = suggestedQty / max(maxStock, reorderPoint)`，分母小于等于零时为零。`InventoryAlertAmountSort` 只在补货建议队列可用并按该比例降序；受控、效期和异常队列禁止把 kg、个、卷等不同计量单位的原始数量直接排序。
- `InventoryAlertStatusSortLabel(tab) = { replenishment: 补货紧迫度优先, controlled: 受控风险优先, expiry: 到期风险优先, anomaly: hidden }`。切换至不支持当前排序的队列时，`amountDesc -> status`；工具栏不能保留不可见或无意义的排序状态。
- `InventoryAlertInventoryQuery(alert)` 至少携带物料编码关键字；`controlled -> task=receiving`，`expiry -> task=batch`，存在真实批次时 `view=batch`。该下钻只迁移读取上下文，不改变库存、预警或补货事实。
- `InventoryAlertEmptyState = hasConstraints ? { title: 未找到匹配当前队列, clearAction: true } : { title: 当前没有当前队列, clearAction: false }`。`DataAnomalySummary` 同时覆盖负数、维度缺失和 `BalanceAnomalyReasons` 的数量关系异常。
- `OperationalAlertColumns = { materialAndBatch, warehouseAndLocation, quantityAndStatus, reason, updatedAt, action }`。原因优先于操作宽度；表格横向滚动时 `materialAndBatch` 粘滞。`ClickableInventoryRowHover` 复用仓库任务列表强调反馈，`ActionOnlyAlertRowHover` 只使用普通表格行反馈。
- `InventoryQtyByUnit(allZero, unitCount > 1) = —`；它只解决多单位零值没有公共单位的呈现歧义，不修改底层数值、筛选、状态判断或导出事实。

## 246. 库存流水列表投影与查询交互合同（2026-08-03）

- `StockLedgerListProjection = paginate(sort(filter(StockLedgerEvent), occurredAt), 30)`。搜索、业务类型、物料、经办人和发生时间条件先作用于不可变事件集合，再统一供桌面表格、移动卡片、分页和导出使用；翻页不得改变库存事实。页面不再额外派生库存流水概览，避免重复表达列表已有事实。`StockLedgerRenderState ∈ {loading, error, empty, rows}` 且四者互斥，只有 `rows` 状态渲染表格、移动卡片与分页。
- `StockLedgerBusinessTypeProjection = explicitStructuredMovement ?? classify(reason) ?? unclassified(direction)`。业务类型与 `movementDirection` 分维；“入库 / 出库”只能作为方向，不能进入业务类型筛选域。明确的其他出入库投影为“其他入库 / 其他出库”，无法归因的兼容事件投影为“未分类入库 / 未分类出库”；采购到货与质检冻结分别保持独立事件类型。
- `StockLedgerSearchProjection = { movementType, movementDirection, materialName, materialCode, category, batch, warehouse, warehouseCode, location, sourceDoc, publicSourceLine, actorDisplayName, balanceFact }`。关键字同步到 `keyword` 查询参数；筛选或排序变化后页码归一为第一页。
- `StockLedgerMaterialFilterKey = InventoryMaterialKey({ materialCode, materialName })`，标签为“物料名称 · 物料编码”。`StockLedgerActorFilterValue = actorDisplayName`；技术账号、内部参与人键和包含 `::` 的技术来源行不得暴露为筛选项或导出字段。
- `StockLedgerRowProjection = { occurredAt, movementType, movementDirection, materialName, materialCode, category, batch, warehouse, warehouseCode, location, signedQtyWithUom, balanceBefore, balanceAfter, balanceFact, sourceDoc, publicSourceLine, actorDisplayName, note }`。桌面端、移动端和导出必须消费同一行投影，不能在移动端丢失物料编码、分类、批次、仓库编码、变动方向或来源信息。兼容数据缺少 `movementDirection` 时只在列表投影中按数量符号补为入库、出库或状态变更，不回写历史流水。
- `StockLedgerNoteProjection = meaningful(reason - movementTypeAlias)`。说明字段只输出业务类型之外的增量事实；标准化前后的类型同义词不重复显示，冲销原因、异常、目标位置和数量判定等内容继续保留。
- `StockLedgerRenderKey = occurredAt + sourceDoc + documentLineId + sourceLineId + inventoryKey + balanceFact + movementDirection + signedQty + balanceBefore + balanceAfter`。它只用于稳定桌面行与移动卡片的渲染身份，不作为用户可见库存流水号，也不替代数据库阶段的事件主键。
- `LedgerReversalSource = { reversalVoucher: readOnly, originalSource: navigable }`。冲销凭证号与原单号不得共用错误链接；生产作业来源路由由来源编号与业务原因共同决定，使生产领料、退料和完工入库分别回到对应单据。
- 库存流水排序只允许发生时间正序或倒序。混合计量单位的原始变动数量不得参与跨行数值排序，业务类型也不构成状态风险顺序。流水行不是整行操作入口，只使用普通悬停反馈。

## 247. 非生产仓库历史位置投影与盘点认证合同（2026-08-03）

- `WarehouseLocationDisplay(rawLocation) = 历史库位未登记` 当 `rawLocation` 为空、等于 `默认库位` 或匹配 `/-AUTO$/i`，否则返回正式库位。该投影用于非生产仓库单据列表、详情记录、操作候选、库存查询、预警、流水和导出；`rawLocation / inventoryKey / ledger / allocation` 不因显示清洗而改写。
- `OtherMovePendingLocationDisplay(empty) = 库位未登记`；只有已存在的技术占位键投影为“历史库位未登记”。`TransferTargetLocationDisplay(empty or placeholder) = 目标库位未设置`，用于指出单据目标字段缺失而非历史库存位置。
- `PurchaseArrivalFormalLocation = ActiveLocations(PurchaseStagingWarehouse) - PlaceholderLocations`。保存或提交新的到货结果时，`Location ∈ PurchaseArrivalFormalLocation`；技术占位库位即使仍存在于仓库兼容配置中也不得进入候选或写命令。
- `StocktakeScopeSelection = { rawScopeKey, displayScopeLabel }`。按库位盘点使用原始位置键匹配库存与冻结快照，界面仅显示 `WarehouseLocationDisplay(rawScopeKey)`；不得用清洗文案替换底层匹配键，也不得在盘点表中输出技术位置。
- `StocktakeCancelActor / StocktakeReviewReturnActor = AuthenticatedBusinessActor(request)`。客户端只提交原因，不提交、覆盖或暗示操作人；服务端以认证账号映射的业务人员写入流程记录和终态字段。

## 248. 非生产仓库列表状态与冲销认证合同（2026-08-03）

- `WarehouseOperationListRenderState = loading | error | empty | populated`，四种状态互斥。只有 `populated` 可以投影桌面表格、移动卡片和结果总数；`empty` 只投影空状态及可选的条件清除动作。
- `WarehouseOperationPager = none` 适用于当前一次性返回全部结果的非生产仓库列表。没有后端页码、游标或前端切片能力时，不得显示伪分页控件；结果数量只表达当前搜索与筛选投影的行数。
- `SalesIssueMobilePrimaryValue = SalesIssueItemQuantityProjection`，与桌面物料列的数量事实同源。`SalesIssueDateProjection` 只进入日期字段，不得同时作为卡片主值造成字段重复。
- `WarehouseReversalActor = AuthenticatedBusinessActor(request)`。`ReverseWarehouseDocumentCommand = { reason, idempotencyKey }`，不包含 `actor`；原单 `owner` 仅是历史执行事实，不能被复用为当前冲销人的声明。
- 本合同不改变生产领料、生产退料和完工入库页面，也不改变任何打印投影。

## 249. 仓库实际日期与历史执行人投影合同（2026-08-03）

- `FirstSalesPickingActualDate = CurrentShanghaiBusinessDate`。该默认值只在任务尚未提交且不是复核退回时建立；`ReviewReturnedPickingActualDate = PreviousSubmittedActualDate`，修订时不得用任务生成日覆盖已有实际日期。
- `WarehouseExecutionActor = ExplicitRecordActor`。到货、入库和出库记录缺少各自动作人员字段时，投影为对应的“历史…人未登记”；`task.owner / document.owner / warehouse generic label` 不得参与执行人回退。
- `HistoricalWarehouseRecordLocation = WarehouseLocationDisplay(rawLocation)`。空值、`默认库位` 和 `*-AUTO` 统一投影为“历史库位未登记”，但不修改库存键、分配行、流水或原始单据。
- 本合同只覆盖非生产仓库登记与历史记录，不改变生产作业或打印投影。

## 250. 库存最近变动与历史执行日期投影合同（2026-08-03）

- `InventoryLastMovement = LedgerBusinessType(latestLedger) + sourceDoc`。列表行、分组读模型和导出共享该投影，详情最近流水继续直接消费 `LedgerBusinessType`；不得直接使用 `latestLedger.movement`，因为兼容流水中的该字段可能只保存“入库 / 出库”方向。
- `LedgerBusinessType` 与 `LedgerDirection` 是两个独立事实。库存查询的最近变动使用前者，库存流水的变动数量与前后余额使用后者；冲销、调拨、采购、销售、售后等业务身份不能被数量正负号替代。
- `HistoricalExecutionDateDisplay = explicitEventDate ?? 对应历史日期未登记`。采购入库过账是时间事实，使用 `postedAt ?? 历史入库时间未登记`；不得回退到到货日期。销售出库、到货和仓库售后也不得使用任务日期或其他里程碑伪造缺失的实际日期。
- `HistoricalAfterSalesActorDisplay = explicitRecordActor ?? 历史经办人未登记`。该投影不回写任务、库存或流水，也不改变生产作业与打印投影。

## 251. 入库批次语义与冲销来源导航投影合同（2026-08-03）

- `PurchasePostingTimeDisplay = postedAt ?? 历史入库时间未登记`，对应界面标签固定为“入库时间”。`postedAt` 是过账时刻，不得降格命名为日期，也不得借用到货、任务或订单日期补位。
- `PurchasePostingBatchDisplay = batch || (batchTracked === false ? 无需批次 : 历史批次未登记)`。真实批次、无需批次和历史缺失是三种不同事实，必须分别表达。
- `InventoryRecentLedgerSource` 复用库存流水来源导航合同：非冲销流水使用 `ledgerSourcePath(row)`；冲销凭证 `sourceDoc` 只读，原单以 `ledgerOriginalSourcePath(row)` 单独导航并明确标注“原单”。
- 该合同仅作用于读模型，不更改库存流水、历史入库记录或批次控制事实；生产作业与打印投影不变。

## 252. 销售出库来源与售后批次控制投影合同（2026-08-03）

- `SalesIssueSourceRequestPath = sourceDoc ? /sales/outbound-requests/{sourceDoc} : ''`；`SalesIssueSourceOrderPath = sourceOrder ? /sales/orders/{sourceOrder} : ''`。任务概览中的上游业务编号必须复用这两个路径，不得只显示不可追溯文本。
- `WarehouseOutboundResultLabel = 出库结果`。结果值继续读取是否待确认、有效过账或已由冲销凭证冲销，不把状态标签和库存方向混为一体。
- `WarehouseBatchDisplay = explicitBatch || (batchTracked === false ? 无需批次 : 历史批次未登记)`。采购入库、销售出库和仓库售后作业记录与登记候选共享这一合同。
- `AfterSalesProductBatchControl = FrozenAfterSalesProduct ?? SourceOrderLine ?? MaterialMaster`。售后任务投影补齐 `batchControl / batchTracked`，仅用于约束和展示，不修改历史执行批次或库存流水。
- 该合同不改变销售出库与售后执行状态机、库存过账及生产作业；打印投影保持不变。

## 253. 生产配方维护身份与单位权威合同（2026-08-03）

- `ProductionRecipeVersion.revision` 从 1 开始；内置可信版本也必须保存修订号、维护人、创建日期和更新日期，不得依赖页面占位值补齐。列表排序与筛选可消费更新日期，详情负责展示完整维护事实。
- `RecipeMaintenanceActor = AuthenticatedAccountEmployee`。创建、保存、启用和停用命令忽略客户端 `owner / actor`，以认证账号的员工投影写入 `owner / updatedBy`；创建时同时冻结 `createdBy`。流程记录和业务审计使用同一服务端人员事实。
- `RecipeEstimatedLoss.unit = RecipeMaterial.unit = MaterialMaster.uom`。损耗行只能引用当前配方物料，服务端不得接受客户端用其他单位覆盖；物料名称、基础单位和来料检验要求继续由物料主数据校验。
- `RecipeListProjection = versionIdentity + productIdentity + perUnitStandard + materialRuleSummary + lifecycleStatus`。维护信息不占正文列；`RecipeDetailProductIdentity` 使用统一物料身份投影，配方明细中的物料身份也共享名称、编码和补充标签语法。
- 本合同只收紧维护人与单位来源并调整读模型，不改变配方版本生命周期、单一启用版本约束、用料计算或工单冻结快照。

## 254. 生产配方版本血缘与投料计量合同（2026-08-03）

- `ProductionRecipeVersion.sourceRecipeCode` 保存直接来源版本；首次创建可为空，复制创建必须指向现存配方。`SourceRecipe.productCode = NewRecipe.productCode`，产出物料在版本链内不可改变；需要更换产出物料时必须另建新的配方版本链。
- `PercentRecipeMaterial.unit = kg`。当前 `PercentRequiredQty = productUnitWeightKg × percent / 100`，所以按占比行只有基础单位为 kg 时才具备可加总语义；非 kg 物料必须使用 `usageMode = fixed` 和自身基础单位。未来若引入跨单位换算，应先建立物料级换算快照，再扩展本合同。
- `RecipePercentTotal` 是维护核对指标，不是草稿保存门禁；系统可以提示是否等于 100%，但不得据此伪造或静默修正比例。物料身份、基础单位、重复行、正数量和损耗规则完整性仍由客户端提示与服务端校验共同保证。
- `CopiedRecipeHydration = TrustedRecipeCatalogReady + sourceRecipeCode`。可信目录未加载时新版本不可写；目录加载后必须重新生成来源草稿，直接刷新与从详情点击进入应得到相同内容。
- 服务端保留版本血缘与计量门禁的最终权威，客户端锁定和提示仅负责操作引导。本合同不改变启用、停用、单一启用版本、工单配方快照和打印投影。

## 255. 生产工艺版本血缘与标准路线合同（2026-08-03）

- `ProductionProcessTemplateVersion.sourceProcessTemplateCode` 保存直接来源版本；首次创建为空且版本必须为 `v1`。复制创建时 `New.name = Source.name`、`New.routeType = Source.routeType`，版本号按同名版本链的最大序号加一。来源不存在、版本跳号、改名或切换路线均由服务端拒绝。
- `ProcessRouteStages(直接收卷)` 固定为物料准备、开工确认、开机首检、成品收卷与报工、报工检验、包装记录、入库检验、完工入库共 8 阶段；`ProcessRouteStages(大盘复绕)` 在同一主链中增加大盘半成品报工、半成品质检，共 10 阶段。保存时阶段编码集合、唯一性和顺序必须完全等于标准路线。
- `ProcessTemperatureZones` 固定为 14 个具名区域，名称与顺序均不可变；每区温度必须为数值。`temperatureTolerance` 是必填版本事实，由服务端写回每个温区投影，并随工艺版本进入工单服务端冻结快照。
- `ProcessTemplateMaintenanceActor = AuthenticatedAccountEmployee`。客户端 `owner / actor` 不具权威；创建时写入 `owner / createdBy / updatedBy`，后续命令更新 `owner / updatedBy`。可信内置工艺同样必须具有 `revision / owner / createdBy / updatedBy / createdAt / updatedAt`。
- 草稿首次保存后版本号和路线不可修改；启用、停用与单一启用版本约束继续通过命令执行。页面的锁定、折叠与提示只负责操作引导，服务端校验才是版本血缘、路线骨架和温控结构的最终权威。本合同不改变工单快照消费方式和打印投影。

## 256. 生产工艺可选性与维护投影合同（2026-08-03）

- `ProcessTemplateSelectableForNewWorkOrder = ProcessTemplate.status === 启用`。草稿和停用版本只用于维护与历史追溯，不能被新生产工单选择；页面以“可选 / 草稿不可选 / 已停用”直接表达这一派生事实，不新增第二套可用状态。
- `EnabledProcessTemplatePerFamily(name) <= 1`。草稿启用前若同名版本族存在其他启用版本，客户端可以提前提示并导航当前启用版本，服务端必须以 409 拒绝并要求先停用原版本。历史工单已经冻结的旧版本不受停用影响。
- `ConfiguredTemperatureZoneCount` 只统计具有有效设定值的标准温区，不能直接取标准化数组长度。标准化数组负责保持 14 区位置和顺序，配置完整性仍由真实设定值与统一允差共同判断。
- 工艺详情的维护人、更新日期和新工单可选性属于版本维护投影；路线、温控、产线和阶段属于版本正文。两类投影可以同时消费同一版本事实，但不得在主区与摘要区重复展示同一内容。
- “质检阶段、仓库协同、现场操作、生产作业”是面向用户的阶段类型投影；底层节点类型和责任域编码保持不变，不因文案调整改写工单快照或阶段实例。

## 257. 生产系统动作目录与运行实例合同（2026-08-03）

- `ProductionSystemActionCatalog = shared/production-system-actions.json`。目录项至少包含 `code / sequence / name / category / executionMode / trigger / owner / requiredInputs / preconditions / result / failureRule / blockingPolicy / repeatPolicy / idempotencyScope / completionMode / description`；前端展示与服务端实例化只能消费该目录，不能再维护第二份动作事实。
- `executionMode ∈ {人工操作, 事件自动触发}`；`completionMode ∈ {系统立即完成, 等待外部结果}`。执行主体与完成等待是两个正交维度，不能把“等待外部结果”伪装成第三种执行方式。
- `BoundProcessActionCodes ⊆ ImplementedCommandOrResultFacts`。未形成独立命令、单据或结果事实的能力可以保留在目录中，但不得进入标准工艺阶段绑定；当前 `STAGE-MATERIAL` 只绑定 `SA2-CREATE-MATERIAL-ISSUE`，不绑定目录候选 `SA2-RECORD-MATERIAL-PREP`。
- `ProcessActionInstanceStatus = f(StageBoundary, SourceDocument, CompletionMode, ExecutionMode)`：阶段未开始为未开始，阶段异常为异常，阶段暂停为被阻断；存在来源结果时，外部完成方式为等待结果、系统立即完成方式为已完成；没有来源结果时，人工动作为可执行、自动动作为待触发。阶段完成可将仍存留的绑定实例收口为已完成，但执行中不得用阶段状态覆盖全部动作状态。
- `ProcessActionInstance` 必须保留 `blockingPolicy / repeatPolicy / resultDocument / idempotencyScope / completionSignal / occurredAt`。动作结果单据与完成信号是可恢复、可审计和防重的依据，页面状态标签不是事实来源。
- `SA2-CREATE-PRODUCTION-RECEIPT` 的结果是完工入库待办；目标仓库、库位和批次由仓库登记环节基于可选库存位置确定，不能作为生产侧系统动作的预置输入。

## 258. 生产系统动作有效目录与可见语义合同（2026-08-03）

- `LiveProductionSystemActionCatalog = CatalogAction ∩ ImplementedCommandOrResultFacts`。在线目录、详情与阶段绑定不得包含只有名称和设想字段、但没有命令或结果事实的候选能力；当前有效目录为 9 项，`SA2-RECORD-MATERIAL-PREP` 不属于在线目录。
- `ownerDomain` 的可见投影为“负责部门”；`executionMode ∈ {人工操作, 事件自动触发}`；`completionMode ∈ {提交成功即完成, 等待后续完成}`。人工动作的 `trigger` 投影为可执行条件，自动动作的 `trigger` 投影为自动触发条件，四个概念不得互相替代。
- `ProcessActionInstanceStatus ∈ {未开始, 待触发, 可执行, 等待结果, 被阻断, 异常, 不适用, 已完成}`。前端类型、服务端派生和页面状态映射必须覆盖同一集合；运行实例继续携带 `blockingPolicy / repeatPolicy / sourceDocument / resultDocument / idempotencyScope / completionSignal / occurredAt / completedAt`。
- `SystemActionVisibleFilter = Search + OwnerDomain + ExecutionMode`。状态、日期和通用列表排序不得参与系统动作结果计算，即使相同页面组件此前在其他生产列表中保存过这些值；系统动作顺序固定取目录 `sequence`。
- 固定目录的 `status` 可以作为内部兼容字段保留，但在全部有效能力均启用且用户不可维护时不形成状态列、筛选项、详情标签或悬停提示。

## 259. 生产阶段目录与动作绑定合同（2026-08-03）

- `ProductionProcessStageCatalog = shared/production-process-stages.json`。前端工艺版本、客户端工单提交快照和服务端冻结阶段只能消费该目录；阶段事实至少包含 `code / sequence / name / node / stepType / executionMode / owner / actionCodes / coreEquipment / workInstruction / completionRule / abnormalRule / status`。
- `Stage.actionCodes ⊆ LiveProductionSystemActionCatalog.code`，且当前每个标准阶段至少绑定一项真实动作。物料准备阶段满足 `actionCodes = [SA2-CREATE-MATERIAL-ISSUE]`，不得绑定或隐式要求已下线的物料准备确认能力。
- `ProcessStageGuidance = RouteGuidance ⊕ MaintainedVersionGuidance`。版本维护的设备、作业要求、完成条件和异常处理可以覆盖通用阶段说明；路线专属的收卷/复绕语义继续生效。历史值命中 `生产确认领料烘干 / 领料烘干确认` 时视为已废弃指导，回退共享完成条件，不进入新工艺或工单快照。
- `MaterialPreparationCompletion = ProductionMaterialIssuePosted`，完成证据包含实际发料数量和原料批次。烘干、预处理属于可维护作业要求；在没有独立命令、结果事实和审计凭证前，不构成第二个阶段完成动作。
- `ProcessTemplateSourceCode('-') = empty`。只有非空且非占位的真实版本编号才能形成来源版本链接。`StageDefaultEquipment` 优先取共享阶段事实，路线专属成品报工设备可以按直接收卷或大盘复绕覆盖。

## 260. 生产阶段责任语义与动作复用合同（2026-08-03）

- `Stage.executionMode ∈ {生产动作, 质检动作, 仓库动作, 工艺展示}`。该字段表示阶段责任与执行形态，不表示系统能力；开工确认、在制报工、成品报工和包装记录属于生产动作，不能因其通过系统登记而标记为“系统动作”。
- `LegacyProcessStepActionType -> LiveProductionSystemActionCode` 仅用于兼容历史快照。动作名称、负责部门、触发条件、结果、入口文案、完成信号、阻断策略和失败规则必须由共享在线动作目录按编码派生，不允许维护第二套契约。
- `Action.boundStageNames = ProductionProcessStageCatalog.filter(stage.actionCodes contains Action.code).map(stage.name)`。这是只读反向投影，不形成新的绑定事实；阶段目录仍是动作绑定的唯一主数据来源。
- 一个在线动作可以被多个标准阶段复用，例如报工质检动作可同时服务半成品质检与报工检验；未被阶段引用的在线能力仍可保留，但详情必须明确显示未绑定。

## 261. 生产工艺不可变版本与路线阶段投影合同（2026-08-03）

- `ProcessTemplateEditable = IsNewDocument OR ProcessTemplate.status = 草稿`。已启用与已停用版本在任何访问路径下均为只读；`save(enabled|disabled) = 409`，`activate(non-draft) = 409`，变更只能创建带 `sourceProcessTemplateCode` 的下一版本草稿。
- `ActionRouteStageUsage(actionCode) = Σ routeType × routeStepCodes(routeType)`，只保留绑定该动作的阶段，并使用 `ProcessTemplateStepName(stepCode, routeType)` 生成页面真实名称。动作目录继续是能力事实，路线阶段名称只是只读投影，不反向改写动作或阶段主数据。
- 系统动作目录没有新增、编辑或保存命令。`/production/process-steps/new` 返回目录，`/production/process-steps/:code/edit` 返回只读详情；任何旧草稿构造器都不属于有效业务合同。
- 冻结版本详情继续提供“创建新版本”和停用动作，并保留历史引用；直达编辑地址不得造成附件上传、草稿保存、重复启用或缺失版本状态侧栏。

## 262. 生产任务多成品数量向量与来源完整性合同（2026-08-03）

- `ProductionTask.products[]` 是计划数量的最小事实粒度；每行至少保存 `lineId / productCode / demandQty / unit / recipeCode`。工单优先以 `sourceLineId = lineId` 关联，只有兼容旧工单缺少来源行时才回退到 `productCode`。`PlannedQty(line) = Σ EffectiveWorkOrder.planQty`，`InboundQty(line) = Σ EffectiveWorkOrder.inboundQty`，`RemainingToPlan(line) = max(0, demandQty - PlannedQty(line))`。
- `TaskQuantitySummary(metric)` 只能在全部有效成品行单位一致时求和；单位不一致时返回逐行数量表达。`TaskProgress(mixedUnit)` 使用完成行数 / 有效行数，不得生成跨单位数量或百分比。多成品任务的物料可安排量属于各成品工单与冻结配方的结果，不生成任务级单一“可安排数量”。
- `TaskLifecycle ∈ {草稿, 已确认, 执行中, 已完成, 已作废}`，`TaskBuildStatus ∈ {待建工单, 部分建单, 已建单, 已完成}`，物料准备与入库进度继续独立。草稿不具备工单来源资格；物料短缺只限制工单可释放数量，不否定任务或工单计划事实。
- `WorkOrder.taskCode != empty => ProductionTask(code = taskCode) exists`。允许手工工单时其 `taskCode` 必须为空；删除任务前必须确认不存在下游工单，不能产生悬空引用。
- `TaskSourceIdentity = sourceType + sourceCode + sourceLineId`。来源类型必须优先读取结构化 `sourceType`，不能只根据编号前缀推断；安全库存补货等非销售来源也必须完整显示并可追溯。
- 任务成品与预估物料继续消费统一物料身份读模型；型号、规格和名称是展示快照，编码与物料主数据才是关联键。本合同不改变打印投影。

## 263. 生产任务来源路由与草稿/安排展示合同（2026-08-03）

- `TaskSourceRoute(销售订单缺口) = /sales/orders/{sourceCode}`；`TaskSourceRoute(安全库存补货) = /warehouse/inventory-alerts?tab=replenishment&keyword={sourceLineId || sourceCode}`；手工新建无伪来源链接。
- `SafetyStockTask.sourceReplenishmentCode` 必须引用有效 `WarehouseMaterialRelation.code`，并保存 `sourceWarehouseCode / sourceWarehouseName / replenishmentSnapshot`。`ReplenishmentLinkedDocument` 只按该结构化关系识别活动任务，展示字符串 `sourceCode` 不能替代关联键。
- `TaskBuildStatusDisplay(draft) = 未提交`，`TaskReleaseSummary(draft) = 提交后核定`；`TaskReleaseSummary(allProductLinesFullyReleased) = 已全部安排`。草稿数量只作为计划预览，不产生工单可创建或入库已开始的执行含义。
- `ImmediateMaterialGap = max(0, requiredQty - availableQty)`；`ProcurementGap = max(0, ImmediateMaterialGap - qcPendingQty - pendingInboundQty - inTransitQty - effectiveRequestedQty)`。页面必须同时表达即时缺口、补充覆盖与新增申请，不把三者合并成一个“缺口”。
- 空备料申请区域不是业务事实：只有有效申请存在或当前允许发起缺口申请时才投影。该合同不改变生产任务、工单、库存或采购数量事实，也不改变打印投影。

## 264. 生产任务交期风险投影与作业排序合同（2026-08-03）

- `TaskDueRisk(task, businessDate) = empty` 当任务生命周期为已完成或已作废，或交期不是有效业务日期；否则按 `deliveryDate - Asia/Shanghai businessDate` 派生：小于 0 为“逾期 N 天”，等于 0 为“今日到期”，1 至 3 为“N 天后到期”，其余为空。
- `TaskDueRisk` 是只读关注投影，不得回写 `TaskLifecycle / TaskBuildStatus / TaskReleaseProgress / TaskInboundProgress`，不得修改任务交期。列表有风险时以该值占用唯一关注提示位置，无风险时显示 `TaskNextAction`；详情将其作为独立“交期提醒”状态项。
- 默认任务作业顺序为：未完成且未作废任务在前，并按有效交期升序；无有效交期排在有交期的未完成任务之后；同交期按加急、生命周期作业优先级和任务编号稳定排序。已完成、已作废任务置后并按日期倒序。用户显式选择的其他排序不受该默认顺序覆盖。
- 交期风险允许参与搜索和风险扫描，但不是新的筛选状态或单据状态。本合同不改变生产任务、工单、库存、采购联动和打印投影。

## 265. 生产工单来源资格与初始带入合同（2026-08-03）

- `WorkOrderSourceCandidate(task) = TaskLifecycle(task) not in {草稿, 已作废}`。新建工单的来源任务及来源明细必须同时满足该资格；编辑既有工单时可以保留其已经冻结的当前来源，以便审计历史数据，但不得借此更换到其他无资格任务。
- `InitialWorkOrderLine = FirstEligibleTaskProductLine`，并原子带入 `taskCode / sourceLineId / productCode / remainingToPlan / recipeCode / plannedDate / deliveryDate / owner`。首屏带入与用户切换来源明细使用同一套计算，不允许首屏缺工艺、切换后才补齐的双重行为。
- `RecommendedProcessTemplate(productCode)` 只从该成品已有且 `processTemplateCode != empty` 的有效工单历史中派生；存在推荐时带入对应启用工艺，不存在时保持空值并要求用户选择。空工单、其他成品工艺和展示占位值不得参与推荐。
- `WorkOrderDemandSourceDisplay(无 | empty) = 手工新建` 只改变页面用语，不改变任务结构化来源事实。`returnTo` 仅保存任务到子单据的导航上下文，不属于生产、库存或审计事实，也不能绕过权限与生命周期门禁。
- 任务列表的“交期从早到晚 / 交期从晚到早”分别映射日期升序与降序；“交期优先”继续消费 `TaskDueRisk` 与默认作业排序合同。筛选字段只能读取需求来源、负责人和交期范围，不得复用不存在的产线字段。本合同不改变打印投影。

## 266. 生产工单来源模式、批次动作与历史快照合同（2026-08-03）

- `WorkOrderSourceMode ∈ {TaskDerived, Manual}`。`TaskDerived => taskCode != empty AND sourceLineId != empty AND ProductionTask(taskCode) exists AND SourceLine(sourceLineId) belongs to taskCode`，并执行来源行累计有效工单数量上限校验。`Manual => taskCode = empty AND sourceDocument = empty AND manualReason != empty`；新建手工工单不生成任务来源行，历史手工演示记录中的兼容行号只读保留，不作为生产任务外键。
- 从任务切换到手工新建时，必须清空任务、来源明细、成品、数量、版本绑定和任务带入的日期、负责人、备注，再由用户建立新的手工工单事实；不得在页面显示为手工工单却继续携带原任务的计划约束。服务端必须识别显式空 `sourceTask / sourceDocument / sourceLineId`，不能因 JavaScript 真值回退重新写回旧来源。
- `WorkOrderAttention = f(QualityDisposition, ProductionException, UnreleasedQty, ReleasableQty, ExecutionCardStages, InboundQty, Lifecycle)`，只用于列表筛选、默认作业排序和关注提示，不回写 `documentStatus / status / currentNode`。右侧生命周期与安排、生产、入库数量继续分别消费各自事实。
- `ActionableProductionCard(workOrder)` 逐批次排除未完成质量交接、生产异常、仓库入库和未领料阻断；提前结束处理、待包装及具备可执行现场作业的批次可以成为生产主动作。其他批次存在待质检或待仓库事实时，只阻断其自身，不得把整张多批次工单标记为不可操作。
- `WorkOrderMaterialIdentity` 以 `productCode / materialCode` 为关联键，以工单和来源任务保存的名称、型号、规格作为展示快照；工单基础、冻结配方、预计物料和物料储备必须消费同一身份投影，不得用名称字符串替代编码关联。
- 工单确认时仍冻结配方、工艺版本、设备、参数、作业要求和动作编码。读取历史快照时，合法冻结内容优先；只有动作编码已不属于在线有效目录、执行类型属于废弃“系统动作”，或完成条件命中已废弃领料烘干确认语义时，才按共享阶段目录回退。该兼容回退不得改写原快照、哈希或审计历史。本合同不改变打印投影。

## 267. 生产工单当前待办、备注必填与详情投影合同（2026-08-04）

- `WorkOrderManualReasonRequired = WorkOrderSourceMode = Manual`。`TaskDerived` 工单的 `note` 是可选排产说明；`Manual` 工单的 `note` 是必填手工建单原因。前端字段缺失判断、提交阻断和服务端 `normalizeWorkOrder` 必须共同遵守该条件。
- `ActiveExecutionStages = ExecutionCards(workOrder).filter(stage != 已完成)`。当前待办优先级为：单据关闭 → 质量处置 → 生产异常 → 批次异常 → 完工待关闭 → 多批次待办 → 唯一活动批次阶段 → 剩余数量缺料/待安排 → 原始下一步。`UnreleasedQty` 的阻断不得覆盖已经存在的活动批次阶段。
- `WorkOrderDueRisk` 与任务交期风险使用同一上海业务日期算法；生命周期为已关闭或已作废时为空。该值仅投影到列表次级提醒、搜索和详情右侧“交期提醒”，不得写回 `documentStatus / currentNode / nextAction`。
- `WorkOrderBasicFacts = SourceIdentity + PlannedDate + DueDate + Owner`，成品身份独立投影。计划日期和交期不得拼为一个多行字段；详情没有物料需求行时不生成空物料储备章节。
- 工单仍冻结 `ProcessTemplateSnapshot` 的设备、作业要求、完成条件和异常处理等完整事实；工单详情只投影版本摘要、温控矩阵和紧凑阶段路线，完整指导通过冻结版本关联的工艺详情读取。展示降噪不修改冻结载荷、哈希、审计或打印事实。

## 268. 生产工单列表物料身份与搜索投影合同（2026-08-04）

- `WorkOrderListProductIdentity = workOrderCode + productName + productCode`。桌面顺序为工单号、成品名称、物料编码；移动顺序为成品名称、工单号与物料编码。型号、规格、图片和编码派生缩略标识不属于列表必需事实。
- 统一物料身份组件支持 `textOnly` 展示变体。该变体只改变视觉密度，不改变 `productCode` 关联键、无障碍标题、详情物料身份或其他单据的图片展示。
- `WorkOrderFrozenRuleDisplay = RecipeLabel(recipeCode) + ProcessLabel(processTemplateCode)`，两类版本事实必须各自带业务标签，不生成未定义的综合“标准版本”。
- `WorkOrderListSearchFields = {code, taskCode, productName, productCode, owner, recipeCode, processTemplateCode, lifecycle, attention, dueRisk}`。占位提示只能声明该集合中用户可以实际命中的稳定字段；产线属于生产批次或安排事实，不在当前工单主列表检索合同中。
- 本合同不改变工单生命周期、批次动作、来源数量上限、冻结快照、详情或打印投影。

## 269. 生产工单列表状态概览密度合同（2026-08-04）

- `WorkOrderListStatusOverview = Lifecycle + Attention + ScheduleProgress + ProductionProgress + ReceiptProgress`。栏宽变化只属于桌面布局投影，不得删除、合并或改写其中任一状态与数量事实。
- 宽屏状态栏为 280px，中等桌面为 268px；三项进度继续按等宽事实位展示。左侧主表获得释放空间，工单列表的搜索、排序、悬停联动、行高及移动卡片事实不变。
- 生产批次状态栏拥有独立密度规则，不因工单栏宽调整而改变。本合同不修改工单生命周期、当前待办优先级、执行动作、冻结快照、详情或打印事实。

## 270. 生产工单任务初始化、计划日期与冻结物料需求合同（2026-08-04）

- `WorkOrderTaskInitialization = f(route.task, ProductionRuntimeReady, EligibleTask, SourceLine)`。只要 `route.task != empty`，运行数据由未就绪切换为就绪时必须重新计算新建草稿；初始化结果至少包含 `sourceTask / sourceLineId / productCode / planQty / unit / recipeCode / processTemplateCode / plannedDate / dueDate / owner`。
- `WorkOrderPlannedDate` 表示实际计划生产日期，`WorkOrderDueDate` 表示上游交付约束；允许 `plannedDate > dueDate`。`WorkOrderDueRisk = f(plannedDate, dueDate, lifecycle, ShanghaiBusinessDate)` 仅作为提醒和排序投影，不属于保存、提交或释放阻断条件。
- `CanonicalWorkOrderMaterialNeeds = f(FrozenRecipe.materials, FrozenRecipe.estimatedLosses, planQty)`。百分比物料先按成品单件重量计算基础需求，固定用量物料按单件用量计算；随后叠加固定损耗与比例损耗。提交工单时服务端重新生成并保存该集合，释放领料时继续从冻结快照重算，不信任客户端或生产任务中可能不完整的物料数组。
- `WorkOrderMaterialNeed` 至少包含 `materialCode / materialName / unit / basePerUnitQty / perUnitQty / estimatedQty / incomingQcRequired`；其中 `perUnitQty = estimatedQty / planQty`，确保分批释放时按含损耗的有效单位需求计算。历史工单缺少合法冻结配方时才允许回退已存物料需求。
- `WorkOrderDisplayNextAction = f(QualityDisposition, ProductionException, InboundCompletion, ActiveExecutionStages, UnreleasedQty, ReleasableQty, MaterialBlocker)`；当 `UnreleasedQty > 0 AND ReleasableQty = 0` 时，列表与详情统一投影 `MaterialBlocker`，不得回退持久化的旧 `nextAction`。
- `ReleaseBatchPrimaryRoute` 只用于生产仍可处置的执行卡；批次进入待领料、待质检或待仓库入库等责任交接后，工单记录保持只读状态投影，不生成回到当前工单的伪链接，也不提供跨模块执行路由。本合同不改变打印投影。

## 271. 生产工单物料控制与阻断提示合同（2026-08-04）

- `RecipeMaterialIncomingQcRequired = RequiresInspection(MaterialMaster.incomingQualityControl)`。生产工单绑定启用配方时，服务端必须用物料主数据统一规范化配方物料控制，随后再冻结配方、计算物料需求和执行释放校验；客户端或共享目录中的旧布尔值不能覆盖当前有效的主数据规则。
- `WorkOrderMaterialBlocker = f(UnreleasedQty, ReleasableQty, AvailableQty, QcHoldQty, PendingInboundQty, InTransitQty)`。当 `UnreleasedQty > 0 AND ReleasableQty = 0` 时，提示色固定为 `pending`；责任标题依次区分“等待质检放行 / 等待采购入库 / 等待物料到货 / 等待物料补齐”，说明文字只描述重新计算与恢复条件。
- 冻结快照中的 `incomingQcRequired` 与同一冻结配方派生的物料需求必须一致，不能在配方区显示“免来料检”而在库存事实中同时显示“待质检放行”。共享版本目录也必须满足这一约束。
- 仅限可重复生成的演示工单，启动补数可按当前有效版本修正已知错误的质检控制并重算 `payloadHash`；真实业务工单历史快照继续遵守不可变合同。本合同不改变打印投影。

## 272. 生产工单冻结工艺指导投影合同（2026-08-04）

- `WorkOrderProcessStepGuidance = { coreEquipment, workContent, abnormalRule }`，值域来自工单确认时冻结的 `ProcessTemplateSnapshot / processSteps`；仅当合法冻结字段缺失或命中已废弃指导时，才按共享阶段目录补足显示值。
- `WorkOrderProcessDetailProjection = StepIdentity + Responsibility + ExecutionMode + ActionSummary + WorkOrderProcessStepGuidance`。核心设备、作业要求和异常处理属于工单执行依据，必须逐工序可见；工艺版本链接负责维护和完整追溯，不能代替工单冻结值的直接展示。
- `completionRule` 继续保存在冻结快照并参与阶段合同，但不纳入本轮详情投影；系统动作摘要、执行阶段和结果事实仍是完成判定的主要可见依据。本合同不改写快照、哈希、执行实例或打印投影。

## 273. 生产工单详情章节顺序合同（2026-08-04）

- `WorkOrderDetailSectionOrder = [ExecutionProgress, MaterialReadiness?, FrozenRecipe, FrozenProcess]`。`MaterialReadiness` 只在存在有效物料需求行时进入投影，但一旦存在必须位于冻结配方之前。
- 章节顺序属于读取投影，不改变 `CanonicalWorkOrderMaterialNeeds`、实时库存事实、配方与工艺快照、释放数量或生命周期。本合同不改变打印投影。

## 274. 系统范围、权限归属与计划入口合同（2026-08-04）

- `EffectiveMenuAccess = RouteExists AND MenuEnabled AND PermissionSatisfied`。导航、直接路由和首页待办必须读取同一结果；任一条件不成立时均不得把入口或待办呈现为可执行。默认延期能力可以保留实现和数据，但必须以停用菜单表达，不得伪装成当前已交付模块。
- `PermissionOwnership = ExplicitPermission.module`。权限模块归属是权限事实的一部分，页面只能在缺少结构化值的历史兼容场景下回退推导；生产、质检和设备权限不得归入系统配置。
- `MaterialRequestOrigin ∈ {ProductionTaskGap, Temporary, Trial, LossSupplement, ReworkSupplement}`。`ProductionTaskGap` 必须从生产任务上下文发起；独立入口只能创建其余四类申请。备料申请属于生产计划事实，提交后根据库存快照生成采购缺口，不形成仓库受理动作或库存事实。
- `IncomingInspectionCounterparty = Supplier`，`IncomingInspectionStandard = InspectionStandard`。来料质检列表可在同一业务列分层投影两者，但字段标签必须同时表达供应商和检验标准，不能借用客户、来源或其他销售字段语义。
- 本合同只收口当前范围与读取投影，不删除延期模块、不改写历史业务记录，也不改变任何打印投影。

## 275. 采购需求来源与轻量计划追溯合同（2026-08-04）

- `PurchaseRequisitionSourceType ∈ {手工申请, 生产任务缺口, 临时备料缺口, 库存补货}`。来源类型是采购需求事实，不能从原因文本、编号前缀或申请部门临时猜测。
- `生产任务缺口 = sourceProductionTask + sourceMaterialRequest`；`临时备料缺口 = sourceMaterialRequest`；`库存补货 = sourceReplenishmentCode + sourceWarehouseCode + sourceWarehouseName + replenishmentSnapshot`；手工申请不得伪造系统来源编号。
- `PurchaseRequisitionSourceProjection = SourceType + SourceIdentifiers + SourceReadOnlyRoutes`。列表、搜索、导出和详情读取同一来源投影；跨模块链接只提供来源核对，不授予目标模块权限，也不形成执行命令。
- `ReplenishmentSourceRoute(WMR) = /warehouse/inventory-alerts?tab=replenishment&keyword={WMR}`，库存预警搜索必须包含 `WarehouseMaterialRelation.code`，保证来源编号可定位到唯一补货建议。
- 采购申请的生命周期、转采购数量守恒、采购订单承接和仓库/质检边界保持不变。本合同不新增 MRP 实体、库存占用、仓库受理或打印投影。

## 276. 采购申请逐行承接与采购入库来源合同（2026-08-04）

### 276.1 承接身份

- `PurchaseOrderLine.sourceRequisition + sourceLineId` 是采购申请需求被订单承接的唯一权威身份；`PurchaseOrder.sourceRequisition(s)` 是所有有效明细来源去重后的只读摘要。
- `PurchaseRequisitionConversionProjection` 只累计明确保存上述逐行身份、且采购订单未作废或取消的数量。禁止用“订单只有一张来源申请”推断所有无来源行均属于该申请。
- 直接采购行的两个来源字段都为空。订单头仍带有其他申请来源时，直接采购行也不得继承第一张申请；删除或替换来源行时，订单头摘要必须随有效明细重新派生。

### 276.2 写入校验与历史兼容

- 保存来源行前必须验证采购申请存在、来源行存在，并继续校验其他活动订单累计承接量不超过该申请行需求量。只有 `sourceLineId`、没有 `sourceRequisition` 的行属于无效身份。
- 历史订单仅有一个订单头来源时，可以按物料编码（缺编码时按名称）唯一匹配原申请行并回填；同物料多行或多来源无法唯一判断时不得猜测，保持该订单行无来源。
- 订单头来源数组不得接受客户端作为独立事实；服务端必须从归一化后的订单明细重新计算。

### 276.3 下游来源边界

- `PurchaseReceipt.sourceDoc` 指向采购订单，`PurchaseReceiptLine.sourceLineId` 指向采购订单行；到货、质检、入库、库存流水继续沿订单行数量链执行。
- 仓库页面只读展示来源采购订单，不重复采购申请、申请部门或采购决策字段。完整链路为“采购入库任务 → 采购订单/订单行 → 采购申请/申请行 → 原始需求来源”。
- 采购订单列表来源只投影“申请转单 / 直接采购”；精确申请编号和逐行身份只进入订单详情或维护页。本合同不改变打印快照与打印模板。

## 277. 销售订单供应承接与交付并行合同（2026-08-04）

### 277.1 行级供应分解

- `SalesOrderLineDemand = OrderedQty - ClosedDeliveryQty`；订单确认时的初始供应分解为 `ReservedQty + ProductionDemandQty = OrderedQty`。每一项均绑定 `SalesOrder.code + SalesOrderLine.lineId`，不同明细不得只按物料编码合并或互相抵扣。
- `ReservedQty = min(LineDemand, RemainingNetAvailableInventory)`，同一库存事实被前序订单行预留后必须立即减少后续行可用量。净可用继续使用 `QualifiedOnHand - SalesReserved - ProductionAllocated - Frozen`，待检、待入库和在途不进入预留基数。
- 每个实际库存分配形成 `InventoryReservationSource(type=销售预留, sourceDoc, sourceLineId, inventoryKey, qty, status)`；订单行只读聚合为一个库存预留链接。销售出库过账按来源订单和来源行消耗预留，短关闭按来源行释放剩余量。

### 277.2 生产需求与工单计划

- `ProductionTaskDemand = max(0, OrderedQty - ReservedQty)`。同一订单多个缺口行可由一张已确认生产任务承接；任务头保存 `sourceType=销售订单缺口 + sourceCode`，任务成品行同时保存自身稳定行号和 `sourceLineId=SalesOrderLine.lineId`。
- `ProductionDemandQty` 来自有效生产任务承接；`PlannedQty` 只累计有效生产工单。若需求大于零而工单计划为零，状态为“待建工单”；存在工单后才允许进入待释放、生产、质检和完工入库阶段。两个数量即使数值相同也属于不同事实。
- 同单位订单可在任务级汇总 `ProductionDemandQty`，但不得回退为 `PlannedQty`。销售订单和交付追踪中的用户可见名称分别为“生产需求”和“补充去向”，`AssignedDemandPercent = (ReservedQty + ProductionDemandQty) / RemainingDeliveryQty` 只表示需求去向已经分配，不表示成品已经备齐或工单已经排产。
- 生产工单沿 `sourceTask + sourceLineId + sourceDocument` 绑定生产任务明细和原销售订单；累计有效工单计划不得超过对应任务行生产数量。

### 277.3 交付并行

- `SalesOrderConfirmCommand -> InventoryReservations + ProductionTask? + OutboundRequest + SalesIssueTask`。交付追踪与缺口生产并行建立，不以生产完成作为建出库任务的前置条件。
- 出库任务的目标数量继续等于订单交付目标；仓库每次只能按本单预留与当前可拣事实登记，部分拣货后保留同一任务剩余量。完工入库改变可拣事实，不自动生成第二张销售出库任务。
- 确认命令响应必须返回订单投影、交付追踪以及可选生产任务；生产通知指向生产任务。主状态可以为兼容投影显示“生产中”，但订单生产进度必须读取任务、工单、批次、质检和入库事实，不以主状态代替。
- 本合同不新增 MRP、审批或打印事实，打印模板保持不变。

## 278. 销售驱动生产任务的配方绑定与物料需求合同（2026-08-04）

### 278.1 配方绑定

- `TaskProductRecipe = ExplicitEnabledRecipe OR UniqueEnabledRecipe(ProductCode)`。显式版本必须存在、启用且适用于任务成品；没有显式版本时只有唯一启用配方才允许自动绑定。
- `TaskMaterialPlanningStatus = 已展开物料需求 | 部分待配置配方 | 待配置配方`，它是物料计划维度，不替代生产任务生命周期。销售缺口任务即使待配置配方，仍保持已确认、待建工单以及原销售订单/订单行来源。
- 无唯一启用配方时保存 `MaterialPlanningBlocker(sourceLineId, productCode, productName, reason)`，禁止创建猜测配方、空壳物料行或虚假采购需求。
- `MaterialPlanningBlocker` 是创建生产工单的前置阻断：任务页主操作必须投影为“维护配方”而非“创建工单”。配方页可带入成品和来源任务作为编辑上下文，但不得因页面跳转自动生成、启用或猜测配方事实。

### 278.2 任务物料需求

- `TaskMaterialNeed = Σ RecipeMaterialNeed(TaskProduct.demandQty, RecipeVersion, EstimatedLosses)`，按 `materialCode + unit` 汇总；每个汇总项保存 `sourceLines[sourceLineId, productCode, recipeCode, estimatedQty, unit]`。
- `TaskMaterialNeed` 至少包含物料身份、单位、预计需求、来料质检要求、创建时库存快照、即时缺口、采购缺口和状态。配方物料的来料质检要求继续以物料主数据规范化结果为准。
- `TaskInventorySnapshot` 只用于计划说明，不预留、不占用；页面实时状态继续读取库存事实。`ProductionMaterialRequest` 只可承接任务当前 `procurementGapQty`，工单释放才产生原料分配与仓库领料事实。
- `CurrentTaskProcurementGap = max(0, EstimatedQty - OwnAllocatedQty - NetAvailableQty - QcPendingQty - PendingInboundQty - InTransitQty)`。任务来源备料申请由服务端按该公式重建明细；申请数量和采购数量均为净缺口，评估时不得再次扣减 `NetAvailableQty`。申请行另存任务预计量、已分配、可用和补充覆盖快照供只读解释。
- 客户端传入的任务备料行只能作为行标识和用途备注的提示，结构与数量仍以服务端当前净缺口为准。若夹带任务缺口之外的物料，或数量超过当前净缺口，必须显式拒绝而不得静默忽略。

### 278.3 兼容与边界

- 历史确认任务仅在 `materialNeeds` 为空时允许按唯一启用配方补齐；已有任务计划快照、工单冻结配方、工单物料需求和释放记录不得被迁移覆盖。
- 销售确认不得因配方缺失而取消库存预留、交付追踪或销售出库任务；生产端必须显式暴露配置阻断。该合同不引入独立 MRP 运算、仓库受理、额外审批或打印事实。

## 279. 生产工单释放、领料状态与产线引用合同（2026-08-04）

### 279.1 可用于生产释放的库存

```text
ProductionIssueEligibleInventoryRow
= Warehouse.status = 启用
  AND Warehouse.allowProductionIssue = true
  AND ActiveStocktakeFreeze = false

ProductionReleaseAvailableQty(material, unit)
= Σ Inventory.availableNumber
  WHERE materialCode、unit 匹配
    AND ProductionIssueEligibleInventoryRow
```

- 其他仓库的可用库存不是本次可领料库存，只能作为调拨依据；处于有效盘点冻结的库存不得参与页面可安排量、服务端分配或仓库过账。
- 同一物料可跨合格仓库、库位和批次分配；默认顺序为有效期优先、批次日期优先，再按仓库、库位、批次和库存键稳定排序。服务端是最终分配事实源，客户端不得指定或扩大分配范围。

### 279.2 领料状态与实际数量

```text
ProductionExecutionCard.materialStatus ∈ {待领料, 已领料}
ProductionExecutionCard.materialIssueCode -> WarehouseProductionIssue.code

MaterialIssued = WarehouseProductionIssue.status = 已完成
LineOccupied = OperationJob.status ∈ {执行中, 暂停, 异常}
MaterialIssued != LineOccupied
```

- `issuedQty` 不属于生产批次合同，因为多种原辅料可能使用 kg、个等不同单位，不能折算成成品卷数或件数。实际领料数量必须从生产领料单明细和对应库存流水读取。
- 领料过账完成物料准备阶段并开放开工动作，但不写入实际开工时间、不把工序任务标成执行中，也不产生设备占用事实。

### 279.3 产线主档与释放快照

```text
ProductionWorkOrderRelease.lineCode -> ProductionLine.code
ProductionWorkOrderRelease.line / lineType / lineWorkshop
= release time canonical snapshot
```

- 新释放只能引用启用产线主档；产线能力必须匹配工单冻结工艺的首段能力。产线名称和类型用于展示快照，稳定关联以 `lineCode` 为准。
- 停用或已不存在的历史文本产线仍可随尚未结束的历史执行事实展示，但不得出现在新安排候选中；没有当前在制、待领料或队列事实时不进入排产工作台。客户端提交的名称、类型和车间不能覆盖主档规范值。
- 本轮未修改打印模板。最新页面依据为蓝图第 305 节。

## 280. 生产后段包装批与处置数量守恒合同（2026-08-04）

- `ProductionBatchOutputReadModel` 在原数量链上补充稳定派生的 `inboundScrappedQty`。其来源仅为该批次所有“入库抽检”质量任务下 `action = scrap` 的已完成处置数量之和，不与报工全检的 `defectQty` 混用。
- 后段待办数量固定派生为：`pendingPackagingQty = max(0, qualifiedQty - packedQty)`、`pendingInboundInspectionQty = max(0, packedQty - releasedInboundQty - inboundHoldQty - inboundScrappedQty)`、`pendingInboundQty = max(0, releasedInboundQty - inboundQty)`。
- 每条 `PackagingFact` 至少保存 `executionCardCode / packageRef / quantity / unit / createdAt / createdBy`。同一生产批次内 `packageRef` 唯一；同一幂等键重试返回原结果，不同幂等键重复使用包装批号必须冲突，不能再次增加 `packedQty`。
- `PostProductionFinishedReceiptCommand` 完成后必须重新计算全部后段数量，而非只比较 `inboundQty` 与当前 `releasedInboundQty`。仍有待入库时保持仓库待办；仍有冻结时保持异常；仍有待检时等待入库检；仍有待包装时回到包装；只有这些数量均归零且报工完成或已接受短缺，批次才可派生完成。
- 报工全检处置满足：返工合格或让步放行使 `qualifiedQty += quantity` 且 `defectQty -= quantity`；报废不增加合格量并保留 `defectQty`。入库抽检处置满足：放行使 `releasedInboundQty += quantity` 且 `inboundHoldQty -= quantity`；报废使 `inboundScrappedQty += quantity` 且 `inboundHoldQty -= quantity`。
- `completedQty` 继续只是兼容旧字段且含义固定为质检合格量。新页面必须直接读取 `qualifiedQty` 与 `inboundQty`，不得因为本节引入分批入库而把兼容字段改称已完工或已入库。
- `PendingProductionReceiptProjection` 在生产批次详情加载成功后只聚合实时 `ProductionReceipt.status ∉ {已完成, 已作废, 已取消}`；实时集合为空就是“没有仓库待办”的有效事实。演示回退只允许用于接口不可用场景，不能与实时集合做并集。

## 281. 系统验收主体、可重复夹具与命令回放合同（2026-08-04）

- `AcceptancePrincipalByDomain = { sales: ACC-SALES, purchase: ACC-PURCHASE, warehouse: ACC-WAREHOUSE, system/masterData: ACC-ZHANGSAN }`。验收主体是权限合同的一部分；业务模块不能因管理员可访问而被判定为角色权限正确。
- `EffectiveMenuBaseline` 仅允许当前明确排除范围的电商父子菜单为停用。停用入口测试必须在回滚边界内改变 `Menu.status`，并验证 `NavigationVisible=false` 与 `DirectAccess=403`；测试夹具不得成为新的业务配置事实。
- `RegressionFixture` 必须拥有自身的前置状态、启用主档引用和时间边界。预计到货日期按 `expectedDate >= documentDate` 构造；负责人必须引用启用员工；部分执行测试不得依赖可能已被其他流程推进的固定演示单据。
- `IdempotentCommandReplay = SameCommandScope -> HTTP 200 AND repeated=true AND NoAdditionalBusinessFact`。其他出入库审核/过账、调拨完成等已经声明可回放的命令以此验收；`repeated=true` 不得伴随第二条库存扣减、第二张流水或第二次状态推进。
- `LegacyFinanceNotificationMigrationFixture` 固定包含可定位销售售后、可定位采购售后和无法定位三种历史记录。前两者迁移到相应责任模块，后者清空跳转并安全归档；全部清除 `ROLE-FINANCE/ACC-FINANCE`、标记 `historical=true`、对所有账号视为已读，重复迁移不得新增记录。

## 282. 生产计划人员身份与操作主体合同（2026-08-04）

```text
ProductionOwnerCandidate
= Employee.status = 启用
  AND LinkedAccount.status = 启用
  AND LinkedAccount.roles contains ROLE-PRODUCTION

MaterialRequestApplicant
= AuthenticatedAccount.linkedEmployee snapshot
```

- `ProductionTask.ownerEmployeeCode / owner` 与 `ProductionWorkOrder.ownerEmployeeCode / owner` 是业务责任人稳定编码和姓名快照。创建时默认当前生产账号关联员工，但允许改选其他 `ProductionOwnerCandidate`；客户端名称不能绕过服务端编码、员工状态和生产角色校验。
- `ProductionMaterialRequest.requesterEmployeeCode / requester / department / requestDate` 是申请建立时的认证身份快照。新建命令忽略客户端对这些字段的伪造值；后续草稿变更继续保留原快照，不因编辑者变化而改写。
- `AuthenticatedActor != BusinessOwner`。生产任务、备料申请、生产工单的流转日志、版本 `changedBy`、工单快照 `frozenBy` 与系统审计均读取认证账号；负责人和申请人只表达业务归属。
- 无真实分页参数、页码和服务端总数时，生产列表页脚的事实只有 `VisibleResultCount`。禁用的伪上一页、页码和下一页不属于业务事实。最新页面依据为蓝图第 308 节。

## 283. 生产工单剩余物料与负责人迁移合同（2026-08-04）

```text
ReleasedQty = sum(ConfirmedReleaseBatch.releasedQty)
UnreleasedQty = max(WorkOrder.planQty - ReleasedQty, 0)
RemainingMaterialNeed = FrozenRecipe.expand(UnreleasedQty)
CurrentReleasableQty
= min(UnreleasedQty, floor((OwnAllocatedQty + CurrentAvailableQty) / PerUnitQty))
```

- `CurrentAvailableQty` 是已经包含历史领料扣减的当前库存事实，因此 `CurrentReleasableQty` 不得再减 `ReleasedQty`。已安排数量的物料状态从释放批次和生产领料凭证读取；剩余数量的物料保障才读取当前库存、分配、待检、待入库和在途事实。
- `UnreleasedQty = 0` 时，工单详情不再生成库存规划章节，`WorkOrderMaterialPreparationProjection` 按有效释放批次投影 `待领料 / 部分已领料 / 已领齐`。`UnreleasedQty > 0` 时，详情只展示 `RemainingMaterialNeed`，避免用整单原始需求与已经消耗后的库存比较。
- `TaskWorkOrderProgressLabel` 在列表使用“工单”，详情摘要使用“已建工单”；底层仍是按任务成品来源行聚合的有效工单计划量，不改变 `TaskBuildStatus` 的待建、部分建单和已建单合同。
- 启动迁移逐张检查生产任务和生产工单负责人。无法匹配有效 `ProductionOwnerCandidate` 的历史演示记录改用默认有效生产负责人并补齐 `ownerEmployeeCode / owner`；工单冻结快照、操作日志和现场执行人员不因责任归属修复而重写。最新页面依据为蓝图第 309 节。

## 284. 备料申请净缺口、共享覆盖与物料身份合同（2026-08-05）

```text
EffectiveRequestedQty(task, material)
= sum(ConfirmedMaterialRequest.purchaseQty)
  where sourceTaskCode = task.code
  and lifecycle not in {草稿, 已作废, 已取消}

NewProcurementGap
= max(ImmediateShortageQty
      - QcPendingQty
      - PendingInboundQty
      - InTransitQty
      - EffectiveRequestedQty,
      0)
```

- `TaskMaterialRequest.requestType = 任务缺口补料` 且 `sourceTaskCode` 必须引用已确认生产任务；无任务来源申请的类型值域固定为临时备料、试产备料、损耗补料和返工补料。来源与类型必须由服务端共同校验。
- 同一任务物料已经提交的有效采购缺口是后续计算的覆盖来源。`NewProcurementGap = 0` 时不得建立第二张任务缺口申请；该约束与 `sourceMaterialRequest` 的采购申请幂等键共同防止重复采购。
- 独立申请中同一 `materialCode` 可以出现多行，各行用途独立。`RemainingAvailable(material)` 在同一提交事务内逐行递减，所有行的 `availableQty` 合计不得超过提交时统一库存事实的当前可用量。
- 备料申请明细的 `materialName / model / spec / unit` 由有效物料主档按 `materialCode` 归一并形成显示快照。未知物料和成品不得进入备料申请；客户端名称、型号、规格和单位不能覆盖主档事实。
- `MaterialRequestLifecycle(库存可满足 | 已转采购) = 已完成`。这只表示申请评估与交接完成；库存分配仍由工单释放生成，采购履约仍由采购申请、订单、收货、质检和入库事实推进。最新页面依据为蓝图第 310 节。

## 285. 备料申请草稿投影与独立申请校验合同（2026-08-05）

- `DraftMaterialRequest.availableQty / purchaseQty` 不是已经确认的零值。草稿读取时可以保留底层初始值，但页面投影必须是“待评估”；只有提交评估完成后才能显示数量守恒结果。
- 独立申请提交满足 `expectedDate >= requestDate`。`requestDate` 取认证申请人快照生成的上海业务日期，不信任客户端传入；任务来源申请不套用该限制，以保留来源任务真实逾期事实。
- `MaterialRequestLine.purpose` 在提交时必填，且与物料、申请数量一起冻结。重复 `materialCode` 行必须以独立用途保留行级证据，库存仍按第 284 节合同共享覆盖。
- 草稿的采购状态固定为“未提交”，待系统评估时为“评估中”，评估后再进入“无需采购、已生成采购申请或待系统重试”。最新页面依据为蓝图第 311 节。

## 286. 生产批次关联质量投影与执行记录合同（2026-08-05）

- `ProductionBatch = FrozenWorkOrderRelease + MaterialMovementFacts + ProductionReports + LinkedQualityTasks + PackagingFacts + ProductionReceipts`。生产批次的数量与状态必须由可追溯事件事实派生，不能只依靠批次头汇总字段形成历史。
- `ProductionRuntimeQualityProjection = QualityTasks where WorkOrderCode ∈ VisibleWorkOrders`。该投影只服务生产执行读取，继续受生产可见工单范围约束；它不等价于质量模块列表权限，也不授予检验、判定或处置写权。
- `ProductionBatchQualityHandoff = first Pending LinkedQualityTask`，用于表达当前跨部门交接；`ProductionBatchQualityHistory = all LinkedQualityTasks`，用于详情复核。待办和历史是两个投影，不得用“无当前待办”删除已完成质检记录。
- `BatchListStatus = Lifecycle + Attention + InboundProgress + {MaterialStatus, ReportProgress, QualityStage, PackagingProgress}`。生命周期值域继续限定为待开始、流转中、已完成、已关闭、已作废；质量、包装、物料和入库只是执行维度，不得平铺成互斥的批次生命周期。
- 生产当前节点优先级高于未来交接说明。批次处于待包装时，主动作必须保持“确认包装”；只有当前生产动作完成并进入质量责任边界后，才投影对应的等待质量文案。
- 历史数量守恒必须有行级证据：`ReportAcceptedQty + ReportDefectQty = ReportQty`；包装数量不得超过已放行且未包装数量；完工入库数量不得超过已抽检放行且未入库数量。不允许在页面运行时用汇总数临时伪造报工、质检或包装记录。最新页面依据为蓝图第 312 节。

## 287. 生产批次详情投影与零值可见性合同（2026-08-05）

- `BatchHeaderIdentity = ProductIdentity + BatchPlanQty + SourceWorkOrder + PlannedDate + TeamLeader`。产品身份读取批次、来源工单和来源任务行的可信快照补全名称、编码、型号与规格；计划数量只作为产品数量补充出现一次。
- `BatchProductionBasis = FrozenRecipe + FrozenProcess + RouteType + PlannedLines + Shift + FrozenAt/By + MeasurementBasis`。负责人和批次计划不在生产依据重复投影，来源工单、计划日期和班组负责人归属批次基础。
- `VisibleOutputFact(f) = IsBaseline(f) OR HasOccurred(f) OR IsCurrentQuantityDecision(f)`。报工进度与待报工属于基线；合格、不良、包装、入库检放行/冻结/报废和入库数量只有在事件已经发生或成为当前数量决策时出现，不使用一组零值证明流程尚未发生。`QualityBlocksNewPackaging = true` 且尚无包装事实时，包装进度不是当前数量决策。
- `BatchQualityHistory` 在详情顺序上位于现场产出之后；这只是读取优先级，不改变质量事实所有权。`BatchProcessTrace` 继续包含全部阶段实例，默认折叠不改变阶段、动作、凭证或状态数据，也不能阻止展开审计。
- `BatchStatusPanel` 继续稳定投影当前阶段、物料状态、报工进度、质量状态、包装状态和入库状态。详情正文的条件显示不得反向删除这些状态维度。最新页面依据为蓝图第 313 节。

## 288. 售后返修任务与复检交接投影合同（2026-08-05）

- `RepairTaskBasis = AfterSale(issueType, issueDescription, action, goodsDisposition) + PredecessorInspection(code, status, disposition, evidence, actualDate, completedBy)`。生产列表和详情可读取该只读投影，但不得因此取得质检判定写权或改写售后方案。
- `RepairTaskCompletion` 表示任务内全部 `products[].qty` 已完成返修并交给复检，不表示复检合格、库存解冻、返还客户、重新入库或售后关闭。当前不支持在生产完成动作中拆分部分数量；若未完成全部任务数量，任务必须继续保持处理中。
- `RepairTaskResultProjection = status = 已完成 ? 已返修待复检 : 结果未登记`。固定任务类型“售后返修或返工”不是列表的主要判断字段；生产列表优先投影 `caseIssueType / caseIssueDescription`。
- 返修执行记录保存 `actualDate / products / evidence / note / attachments / completedAt / completedBy`。`evidence` 对生产页面命名为返修记录号；记录号与处理说明至少填写一项。记录的物料数量继承任务冻结数量，不能由客户端缩减后仍关闭任务。
- 返修任务完成只使直接后继“返修品复检”从待前置进入待处理。`QualityDisposition` 仍由质检任务形成，库存状态继续保持原售后暂存或质检冻结，直至复检和最终仓库动作完成。最新页面依据为蓝图第 314 节。

## 289. 售后返修实物控制状态与列表下一步合同（2026-08-05）

- `RepairMaterialControlState` 由前置检验和返修任务状态派生：前置未完成为退货待检；前置已完成且任务待处理为质检冻结待返修；任务处理中为质检冻结返修中；任务已完成为质检冻结待复检。`SalesAfterSale.goodsDisposition` 仍是冻结的原始方案，不作为生产阶段当前实物状态。
- `RepairTaskStart` 只记录 `startedAt / startedBy`，不得改变售后暂存、质量冻结、合格、待入库或待出库数量。`RepairTaskCompletion` 只释放后继复检，实物仍保持质量控制直至复检形成结论。
- `RepairListNextStep = { 待前置: 等待前置, 待处理: 开始返修, 处理中: 登记返修结果, 已完成: 查看返修记录 }`。列表列头固定为“下一步”，不能把已完成行误称当前待办。
- 生产完成门禁继续满足 `trim(evidence || note) != ''`。页面使用“返修记录号或返修备注至少填写一项”解释该互斥必填关系，附件仍为可选。最新页面依据为蓝图第 315 节。
- `RepairTaskDetailLayout` 与销售售后详情共享 `after-sales-editor` 响应式骨架。布局变化只影响读取顺序和可见密度，不改变任务、前置检验、实物控制或执行记录的事实归属。

## 290. 售后执行状态迁移与数量比较合同（2026-08-05）

- 售后执行任务的 `待处理 -> 处理中 -> 已完成` 是两个独立命令：开始命令只固化 `startedAt / startedBy`，完成命令才固化 `actualDate / completedAt / completedBy / disposition / evidence / note` 及后续交接事实。客户端不得在开始命令成功后自动打开完成登记窗口。
- 多物料任务数量只能在相同 `uom` 内聚合。不同单位可以并列显示，但不能被转换为一个无量纲总数，也不能参与同一个数量排序；只有存在业务定义明确的统一基准单位或换算规则时，才允许跨单位比较。
- 返修完成仍表示“全部任务数量已返修并交由复检”，不代表复检合格或重新入库。开始返修不产生完成记录、库存流水或复检放行事实。

## 291. 售后执行日期与结果展示合同（2026-08-05）

- `ExecutionActualDate` 必须满足 `date(startedAt || createdAt) <= actualDate <= today`。客户端日期范围只提供即时反馈，服务端门禁才是权威；被拒绝的请求不得写入完成时间、执行记录、库存事实或后继任务。
- 生产返修完成凭证门禁为 `trim(evidence) != '' OR trim(note) != ''`。两字段同时为空时属于同一个跨字段错误，页面必须同时标记可修复输入并把焦点带到字段区；附件仍不参与该布尔条件。
- `ExecutionRecordOutcomeTone = statusPresentation(recordResult)`。任务完成状态与业务结果颜色分离：“已返修待复检”仍是待复检警示色，不能因为生产任务已完成而显示为最终成功；“报废、退回、不合格”也不能使用绿色。

## 292. 生产异常来源唯一性与处置所有权合同（2026-08-05）

- `ProductionExceptionIdentity = ExceptionCode + SourceType + SourceCode + ExecutionCardCode?`。同一生产批次可以先后或并行存在设备、工艺、质量等不同异常；质量处置只能查找 `source = QualityTaskCode`，兼容旧数据时也只能回退到同批次且 `type = 质检不合格` 的记录，禁止按批次命中任意异常。
- `RejectedProductionQualityDecision -> EX2(type=质检不合格, source=QC2, affectedQty=rejectedQty, uom=QualityTask.uom)`。质量异常不写 `outcome=异常停机`，不占用现场活动异常指针；其执行阻断由质量任务和生产批次质量节点表达。
- `QualityExceptionStatus = { unassignedDispositionQty > 0: 待处理, activeReworkQty > 0: 处理中, activeReinspectionQty > 0: 待复核, remainingDispositionQty = 0: 已关闭 }`。状态只是异常处置生命周期，返工、复检、让步、报废和数量仍由质量事实记录。
- `CanResolveOnsiteException = outcome = 异常停机 AND type != 质检不合格 AND ActiveExceptionCode = ExceptionCode AND ExecutionCard.status = 异常`。不满足该条件时，通用恢复命令返回冲突且不修改异常、批次、工单或流水。
- `ExceptionPrimaryAction` 按所有权路由：质量异常进入来源质检单，现场停机进入解除停机，缺料进入任务或工单物料条件，已关闭记录进入来源追溯。页面不得通过处置说明中的关键词推断质量阶段。最新页面依据为蓝图第 318 节。

## 293. 生产异常比较口径、操作者与现场类型门禁（2026-08-05）

- `ExceptionImpactQuantity = { value, uom }`。只有 `uom` 相同的异常数量才可比较；列表存在多单位时不得暴露统一数值排序。`ExceptionOperationalOrder = OpenFirst + Severity + Stage + OccurredAt`，其中关闭记录最后、未关闭记录按紧急/重大/一般和待处理/处理中/待复核排序。
- `ExceptionRecorder = createdBy || owner` 只表示记录或触发该异常的操作者；`responsibility` 表示业务责任分工。读模型分别投影“记录人”和“责任分工”，不得把质量检验员、现场登记人直接改称业务负责人。
- `ExceptionImpactProjection = affectedQty + uom + effect + estimatedLoss`。`effect` 是唯一完整影响说明；页面不得再从类型或文案生成第二个重叠影响字段。异常阶段说明按 `QualityOwned / MaterialCondition / OnsiteStop` 三类所有权投影，不反写异常状态。
- `AllowedOnsiteExceptionType = { 缺料, 设备异常, 工艺异常, 报工差异, 其他异常 }`。`质检不合格` 仅允许由质量判定命令生成；现场报告端点收到该类型返回冲突且不写 EX2、EC2、RB2、MO2 或日志。最新页面依据为蓝图第 319 节。

## 294. 生产异常事件日志合同（2026-08-05）

- `ProductionExceptionFlow[ExceptionCode] = append-only { time, actor, action, remark }[]`。日志身份以异常号为键，不以生产批次号为键；批次执行日志与异常处置日志可以引用同一动作，但不可互相替代。
- 现场异常事件集合至少包含 `登记生产异常 / 解除停机`；质量异常事件集合按实际发生包含 `质量异常生成 / 转返工 / 返工完成 / 返工复检判定 / 质量处置更新或关闭`。事件与业务命令共享真实时间和操作者。
- 幂等命令命中既有结果时不追加事件。历史数据迁移只允许补写一条基于 `createdAt / createdBy / type / cause` 的创建事件；未知阶段不得推定时间。最新页面依据为蓝图第 320 节。

## 295. 缺料异常实时状态与自动解除合同（2026-08-05）

- `ShortageNeed = TaskMaterialNeed(estimatedQty, uom) + LiveInventory(available, qcPending, pendingInbound, inTransit)`；`shortageQty = max(0, estimatedQty - available)`，`procurementGapQty = max(0, shortageQty - qcPending - pendingInbound - inTransit)`。待检、待入库和在途只覆盖采购缺口，不增加可用库存。
- `ShortageExceptionStatus = { procurementGapQty > 0: 待处理, shortageQty > 0 AND procurementGapQty = 0: 处理中, all shortageQty = 0: 已关闭 }`。关闭时追加 `物料齐套复核`，处理中阶段变化追加 `缺料条件更新`；状态未变化不得重复写事件。
- 若 `ActiveExceptionCode = ShortageExceptionCode`，齐套关闭同时按 `priorState` 恢复生产批次并清理活动异常指针；计划级缺料没有活动批次，只解除生产安排阻断。关闭后的历史异常不因库存后续被其他需求占用而自动重开，应由新的需求或分配冲突形成新异常。
- `ShortageExceptionDetail = SourceTask + LiveMaterialReadiness[]`。来源任务由异常来源号或关联工单的 `taskCode` 确定，服务端详情必须返回该任务；客户端不得依赖内置演示数据推断。最新页面依据为蓝图第 321 节。

## 296. 实际损耗服务端投影与单位换算合同（2026-08-05）

- `ProductionLossProjectionSource = ProductionReport(lossWeightKg > 0) | CompletedQualityScrap(action = scrap, status = 已完成)`。生产异常 `estimatedLoss`、配方 `estimatedLosses`、质检待处置数量和返工中数量均不是实际损耗来源。
- `ProductionLossIdentity = LossCode + SourceDocumentCode + SourceEvidenceCode? + WorkOrderCode + ProductionBatchCode + ProductCode`。`SourceDocumentCode` 承载报工或质检单，`SourceEvidenceCode` 承载质量报废凭证；生产批次必须单独保存，不能复用任意自由文本批号。
- `ScrapLossKg = ScrapQty` 当单位为 kg；其他单位仅在 `WorkOrderFrozenProductUnitWeightKg || EffectiveRecipe.productUnitWeightKg > 0` 时按 `ScrapQty × ProductUnitWeightKg` 换算。物料名称和规格文本不参与换算，缺少结构化净重时不得生成 kg 损耗记录。
- 大盘复绕报工的 `lossWeightKg` 是报工时显式保存、参与大盘重量守恒的工艺损耗，投影为 `plannedLossKg = totalLossKg / abnormalLossKg = 0 / unclassifiedLossKg = 0 / status = 已确认`。其他报工若只记录总损耗且尚未完成分类，投影为 `plannedLossKg = 0 / abnormalLossKg = 0 / unclassifiedLossKg = totalLossKg / status = 待确认`，不得自动认定为异常。质量已完成报废投影为 `plannedLossKg = 0 / abnormalLossKg = totalLossKg / unclassifiedLossKg = 0 / status = 已确认`。
- `LossQuantityConservation = plannedLossKg + abnormalLossKg + unclassifiedLossKg = totalLossKg`（允许计量精度误差）。列表和详情必须显式显示非零待分类量，禁止出现“总损耗大于 0，但工艺内和异常都为 0”却没有数量去向的记录。
- 记录状态与责任归属独立：来源事实完成即可为已确认；工艺内损耗在没有责任对象时显示“无需归责”，异常损耗缺少责任对象时显示“责任未判定”。责任筛选只提供真实责任人，不把占位语当作责任人选项。
- `ProductionLossLedgerReadModel` 只读、按 `occurredAt desc` 排列，并支持对物料编码、来源单据、来源凭证、生产工单和生产批次检索。最新页面依据为蓝图第 322 节。

## 297. 生产工作台产线集合与分域投影合同（2026-08-05）

- `SchedulableOperationLine = ActiveProductionLine AND capability ∈ {extrusion, rewind, trial}`。包装不属于设备作业产线集合；它由后段包装事实和操作承载。`LegacyTaskLine = NonSchedulableLine AND HasCurrentOperationOrQueueOrWaitingMaterial`，只用于完成既有任务。
- `SiteLineSet = SchedulableOperationLine OR HasCurrentOperation OR HasOperationQueue`。仅有待领料生产安排、尚无设备作业的历史产线不进入现场集合。`AvailableSiteLineCount = count(SchedulableOperationLine where no CurrentOperation and no OperationQueue)`，不得把历史线、包装线或待领料任务计为空闲产能。
- `SiteLineOrder = AbnormalCurrent + ActiveCurrent + Queued + Available`。显示状态满足：存在队列且无当前作业时为待开工；存在待领料安排且无当前作业时为待领料；不能同时显示“空闲”和“队列 1”。
- `WorkOrderSchedulingQuantities = { planQty, releasedQty, unreleasedQty, releasableNowQty }`，其中 `unreleasedQty = max(0, planQty - confirmedReleasedQty)`，待确认安排仍属于尚未确认的待安排量；`releasableNowQty` 继续受库存、冻结物料、待确认安排和并发版本门禁约束，两个数量不得在页面合并。
- `WorkbenchProductionIdentity = ExecutionCardCode || SourceWorkOrderCode`。内部 `ReleaseBatchCode` 不进入普通工作台标识；没有执行卡时显示来源工单并标注生产批次待生成，生成执行卡后显示 `EC2`。
- `PostprocessCurrentMetrics` 按阶段投影：成品检为已报工、已判定、待判定；质量处置为已报工、合格、待处置；包装为合格、已包装、待包装；入库检为已包装、已判定、待判定；仓库入库为已放行、已入库、待入库；短关和异常仅保留计划、已报工与剩余。最新页面依据为蓝图第 324 节。

## 298. 生产对象公开身份与跨页面数量投影合同（2026-08-05）

- `ProductionObjectHierarchy = ProductionTask(demand) -> WorkOrder(frozen plan) -> ProductionArrangement(pre-issue preparation) -> ExecutionCard(post-issue execution)`。`ReleaseBatchCode` 是内部技术身份，不属于普通用户公开身份；`PublicProductionIdentity = ExecutionCardCode || (WorkOrderCode + ArrangementOrdinal)`。
- `WorkOrderExecutionRow` 在没有 `ExecutionCardCode` 时投影 `生产安排 {ordinal}`、安排数量、领料状态和下一步；生成执行卡后投影正式生产批次号。异常来源链使用任务、工单、生产批次和质量对象，不追加内部释放批次节点。
- `WorkOrderQualitySummary = reportedQty > 0 ? qualifiedQty + 已报工 reportedQty : 尚未报工`。零值只表示尚未发生，不得派生成“0 合格”的检验结论。
- `QueuedWipOperationStage = { operation exists AND final reportedQty = 0: { stage: operationType + 任务待开工, quality: 大盘已放行 } }`。来源大盘的质量放行不等于复绕成品已经报工或最终成品合格。
- `PackagingProgress = qualifiedQty > 0 ? packedQty / qualifiedQty : 未触发`，并满足 `0 <= packedQty <= qualifiedQty <= reportedQty`。计划量只用于计划完成度，不进入包装分母；生产批次列表、详情和工作台共享该投影。最新页面依据为蓝图第 325 节。

## 299. 工作台队首作业与异常受影响对象投影合同（2026-08-05）

- `QueuedOperationSiteProjection = OperationJob(status in {队列中, 可开工}) + ExecutionCard + WorkOrderFrozenBasis + SourceWipBatch?`。队首作业尚未进入执行时，现场阶段固定为 `operationType + 任务待开工`，路线摘要使用 `已完成 N/M + 下一步 Stage`；开始命令成功后才允许改为当前执行阶段。
- `QueuedOperationBasis = { operationType, workOrderCode, executionCardCode, recipeCode, processCode, routeType, plannedQty, sourceWipBatchCode?, queueStatus }`。这些事实来自已有工单、执行卡和设备作业，不重复创建工单、领料或首检事实。
- `WorkbenchAffectedExecutionStage = PostprocessStageForCard || QueuedOperationStage || ProductionNodeDisplay`。待处置、返工和复检优先于旧批次节点；异常页、后段、批次列表与详情不得各自保存另一套阶段文字。
- `IdleLinePanelTitle = 产线状态`，`HasScheduledWorkPanelTitle = 现场执行`。`CrossDomainWaitingPresentation` 是中性状态文本而非禁用按钮。最新页面依据为蓝图第 326 节。

## 300. 生产批次关注项、工单汇总与备料多用途摘要合同（2026-08-05）

- `ExecutionCardAttentionProjection` 的优先级为：活动质量处置 → 活动生产异常 → 短关剩余数量决策 → 待完成质量任务 → 活动设备作业 → 待包装 → 待仓库入库 → 待入库检 → 待仓库领料 → 当前阶段。每个结果必须是可执行动作或明确等待，不得只返回内部节点名。
- `OperationStageProjection = queued(operationType + 任务待开工) | running(生产中) | pausedOrAbnormal(异常/返工)`。生产工单的阶段分组和生产批次的当前阶段必须先消费活动设备作业，再使用旧节点兜底；因此排队复绕不能被投影成通用“生产中”。
- `WorkOrderAttention = distinct(unfinished ExecutionCardAttentionProjection)`；唯一值直接显示，多于一个不同值显示“多批次待办”，没有未完成批次时再按物料可安排量和未安排数量判断。质量处置、生产异常和计划已全部入库继续拥有更高优先级。
- `MaterialRequestListGroupKey = materialCode + unit`。同一键的 `requestedQty` 在列表摘要合计，`purposeCount = distinct(non-empty purpose)`；用途数大于一时追加“（N 个用途）”。该聚合只属于列表读模型，申请明细、逐用途库存覆盖和采购缺口不得合并或改写。最新页面依据为蓝图第 327 节。

## 301. 生产列表可比维度与工艺设备能力事实（2026-08-05）

- `ComparableAmountSort = sameDimension && sameCanonicalUnit`。生产任务、备料申请、生产工单、生产批次、质检任务和生产异常的数量是带单位业务事实，列表间可能同时存在 kg、卷、个、件；这些对象不提供跨单据数量排序。配方按物料项数、工艺按阶段数、质检标准按检查项数、损耗台账按标准 kg 排序，属于同维度比较。
- `ProductionFilterSemantic = pageObject -> { partyLabel, ownerLabel }`。筛选值继续读取列表行的 `party / owner` 投影，但标签必须揭示实际事实：备料申请为需求部门/申请人，生产批次为来源工单/班组负责人，配方为产出物料/维护人，工艺为适用产品族/维护人，不得用通用标签改变用户对数据来源的理解。
- `ProcessTemplateSchedulableLineTypes = distinct(lineTypes excluding packaging workstations)`。适用产线表示可参与产能与排产判断的设备能力；包装工位属于 `P2-STEP-PACKAGING.coreEquipment`，不是 line type。历史版本若只剩无效包装口径，按路线回退为直接收卷的挤出设备或大盘复绕的拉丝/复绕设备；新保存版本发现包装工位时拒绝写入并要求在包装阶段维护。最新页面依据为蓝图第 328 节。

## 302. 设备作业规范身份、产线占用与交期风险合同（2026-08-05）

- `OperationJobIdentity = ExecutionCardCode + OperationJobCode`，在单个生产批次内唯一。读取历史事实时先执行 `CanonicalOperationJobs = mergeBy(OperationJobCode)`；重复项的状态优先级为 `已完成 > 已取消 > 异常 > 暂停 > 执行中 > 可开工 > 队列中 > 待排程`，数量取已记录最大值，时间与非空关联事实不得丢失。
- `CurrentLineOperation = OperationJob.status in {执行中, 暂停, 异常} AND ExecutionCardOccupiesEquipment = true`；`QueuedLineOperation = OperationJob.status in {可开工, 队列中}`。`ExecutionCardOccupiesEquipment` 只对设备执行阶段成立，质量、包装、入库检、仓库入库和计划已报满均返回 false。
- 产线主档的停用与改名引用检查必须消费 `CanonicalOperationJobs`。重复同号的旧活动快照不能阻断已结束设备作业，但不同作业号的真实未结束任务继续阻断停用或改名。
- `ScheduleDueRisk = dueDate - currentLocalDate`：小于零显示已逾期绝对天数，等于零显示今日交期，1 至 3 天显示距交期天数，其余不增加提示。该字段属于工作台读模型，不回写工单状态或交期。最新页面依据为蓝图第 329 节。

## 303. 复绕作业数量与班次交接快照合同（2026-08-05）

- `RewindWorkQuantities = { productPlanQty: ExecutionCard.planQty + ExecutionCard.unit, sourceProcessQty: OperationJob.plannedQty + OperationJob.plannedUnit }`。前者是最终成品卷数，后者是本次消耗或处理的大盘重量；单位与业务含义均不同，禁止相加、换名为同一个计划数量或互相作为完成率分母。
- `ShiftCarryoverSet = CurrentActiveEquipmentOperations UNION QueuedReadyOperations`。当前作业包括执行中、暂停和异常设备作业；待开工作业包括队列中或可开工的设备作业。仅有本班报工记录不是进入交接集合的前提。
- `ShiftCarryoverSnapshot = { executionCardCode, line, operationJobCode, operationType, operationStatus, sourceWipBatchCode?, nextAction }`。交班确认后该快照不可用后续现场实时值覆盖；接班展示消费冻结快照。
- `ShiftHandoverNoteRequired = ShiftCarryoverSet.length > 0 OR currentShiftExceptionCount > 0`。成立时 `trim(note).length >= 4`；否则备注可空。前端可提前反馈，但服务端是最终权威门禁。
- `ShiftReportSummary` 与 `ShiftCarryoverSet` 独立。报工汇总记录本班完成事实，现场事项记录跨班未完成责任；两者都可以为零，也可以只存在一个。最新页面依据为蓝图第 330 节。

## 304. 质检责任队列与判定事实投影合同（2026-08-05）

- `QualityWorkbenchActionableSet = OpenIncomingQuality UNION OpenProductionQuality UNION AfterSalesQualityTask(status in {待处理, 处理中}) UNION OpenPatrolClosure UNION OpenDefectClosure`。`待前置`售后任务不是质检岗位当前可执行项，不进入工作台数量；独立售后检验列表仍保留完整任务图。
- `QualityWorkbenchJudgementCount` 统计检验结论或处置阶段为待判定的可执行项；`QualityWorkbenchReviewCount` 只统计来料与生产质检中的待复判、待复检、待处置和返工中；`QualityWorkbenchClosureCount = OpenPatrolClosure + OpenDefectClosure`，展示名为“巡检与不良”。`QualityWorkbenchFreezeCount` 对来料按未关闭处置阶段判断，并包含未关闭入库检与已接收待检售后退回物，不读取仓库名称推断冻结。
- `IncomingInspector = valid(Source.inspector) ? Source.inspector : Decision.actor || Receipt.qualityInspector || 待分配`，其中占位值集合为 `{待分配, 待指定, 待确认}`。形成正式决定时同时写入 `Source.inspector = Decision.actor` 与 `Source.date = date(Decision.decidedAt)`；`IncomingInspectionDate` 对历史数据也优先取正式判定时间。
- `ProductionQualityDate = firstValidDate(decidedAt, createdAt, dueTime, dateFromCode)`；`RequirementText = dueTime`。只有符合 `YYYY-MM-DD` 的值可进入日期字段，触发要求文本不得参加日期筛选、滞留天数或日期控件赋值。
- `ClosureDetail = StaticSeedFacts <- RuntimeDraft <- RuntimeStatus`。静态种子提供原始检验依据，运行草稿覆盖已真实保存的字段，运行状态最终覆盖生命周期。阶段写入在服务端无旧草稿时以本次完整候选草稿为原始事实，之后只允许当前阶段字段增量变化。
- `ReleasedQuantitySummary = join(nonZero(qualifiedQty, concessionQty))`。零值不进入行动摘要。`QualitySourceRoute` 对 `QSTD / WR / MO / EC|EXE / WS / SO / SA|PA / IQC|PQC|QC2 / QPATROL / NCR` 使用对应责任页面，缺少真实页面的来源只显示文本。最新页面依据为蓝图第 331 节。

## 305. 质检行动可见性与处置语义投影合同（2026-08-05）

- `QualityListNextActionDisplay = lifecycle open ? CurrentAction : empty`。质量闭环后不显示“无待办”占位；单据状态、检验结论和处置阶段仍分别保留，隐藏展示不得改写原事实或删除详情入口。
- `IncomingQualityRoleProjection` 消费供应商主体、来源收货、检验员、判定日期和冻结位置，不消费供应商联系人。`IncomingQualityLocationLabel = 暂存位置` 只改变字段名称，底层仍读取任务冻结的 `warehouse`；`PendingUndecidedQty` 显示为“未判定 / 冻结”，与 `DispositionRemainingQty` 分开。
- `PendingProductionHandlingFacts` 在只有预设流转且尚未判定时为空；右侧状态和 `ProductionQualityImpactProjection` 继续保留预设流转。真实处置、结论说明或备注产生后，正文重新显示对应证据。
- `DefectImpactScope = project(disposition, sourceType)`：返工/返绕、供应商退货、补发、报废和让步分别生成对应影响说明，只有处置方式尚未确定时才按来源类型兜底。`DefectNextStepDescription` 与 `PatrolNextStepDescription` 同样读取本单处置方式和现场责任人，不参与命令校验。
- `LegacyPlaceholderLocation = {待处理区, -, empty}` 在来源事实锁定的只读不良记录中不显示；新建记录的真实处置区域字段与服务端校验保持不变。最新页面依据为蓝图第 332 节。

## 306. 质检摘要就绪与登记字段去重合同（2026-08-05）

- `QualitySummaryReady(scope)` 按统计依赖集合判断：`judgement = incoming + production + afterSales + patrol + defects`，`review = incoming + production`，`closure = patrol + defects`，`freeze = incoming + production + afterSales`。任一依赖尚未完成首轮读取时，摘要值为未知而不是零，且不得触发该范围筛选。
- `IncomingQualityLineEditor = IdentityHeader(batch, receivedQty) + Sampling(sampleQty, failedQty) + Decision(qualifiedQty, rejectedQty, concessionQty, pendingQty) + LineDisposition`。同一字段只允许在一个可编辑位置出现；去掉重复外壳不得改变数量守恒、检查项判定、处置凭证或复检任务事实。
- `ProductionProcessDisplay = empty(processStep) OR processStep != sourceType`。该表达只控制独立工序字段是否可见；`sourceType` 继续表示质检触发类型，`processStep` 继续作为生产工序事实保存和校验。
- `AfterSalesQualityDecision` 仍为任务级事实：销售退货检验取 `{可再次销售, 返修返工, 报废}`，返修品复检取 `{合格, 报废}`，采购售后检验取 `{合格, 让步接收, 不合格退回}`。单个任务对应的收货库存事实使用同一结论，不从物料卡视觉推导行级结论。最新页面依据为蓝图第 333 节。

## 307. 质检可比维度、双责任待办与售后证据合同（2026-08-05）

- `QualityAmountSortablePage = patrol | defects | standards`。对应可比量分别为点位数、不良明细行数和检查项数；`incoming | production` 的抽检数量是带单位事实，不进入纯数值排序。
- `QualityListStatusFacts = lifecycleStatus + inspectionConclusion + nonDuplicateActiveStage`。当 `stage == lifecycle`，或两者都属于 `{已完成, 已关闭, 已作废}` 终态集合时，阶段从展示投影省略；底层阶段事实不删除。滞留提示优先使用合法要求完成日期并标为逾期，缺少合法期限时才按业务日期显示滞留。
- `IncomingOpenResponsibilities = PendingUndecidedQty + DispositionRemainingQty`。两者可同时大于零：前者只能通过继续判定改变，后者只能通过退货转采购、让步审批或独立复检命令改变。详情主行动必须优先揭示未判定量，同时保留处置定位入口。
- `IncomingDocumentDispositionSummary = distinct(nonPending(lineDisposition))`；存在逐行处置事实时，详情状态区读取合格放行、不合格隔离、退货或让步等真实行级结果，不用“结论已执行”覆盖它。
- `AfterSalesQualityEvidenceRequired = nonEmpty(evidence) OR nonEmpty(note) OR attachments.length > 0`。该门禁先于 `applyAfterSalesQualityDecision` 执行，失败时不得改变任务状态、售后结论或库存冻结事实。最新页面依据为蓝图第 334 节。

## 308. 质检阶段可见性、检查项归属与导出投影合同（2026-08-05）

- `QualityActiveStageVisible = NOT(inspectionConclusion = 待判定 AND dispositionStage in {待判定, 未开始, 未进入处置})`。该规则只省略尚未发生的处置阶段展示，不改写阶段事实；`待处置 / 返工中 / 待复检` 等已发生责任仍必须显示。
- `QualityCheckpointOwnerVisible = qualityLines.length > 1`。检查项始终关联其物料行；单物料时可省略重复的物料名称，多物料时必须展示归属，保存和校验仍消费原始行级结构。
- `QualityListExportProjection` 使用页面语义映射生成单号、业务对方、对象、结论、活动阶段、处理方式、责任人和业务日期。巡检与不良不得导出为来料/生产语义；空处理方式导出为缺失值，不得伪造“待处置”。
- `QualityDefectConclusionLabel = 不良判定`。`QualityStandardCheckpointColumn = 项目名称`；静态版本说明不是标准详情事实，只能在维护版本时提供操作上下文。
- `AfterSalesQualityDisposition` 继续保持任务级事实。界面使用“本任务检验结果 / 本任务复检结果”明确作用域；物料确认区不创建行级结论。最新页面依据为蓝图第 335 节。

## 309. 质量冻结批次键与用户可见阶段投影合同（2026-08-05）

- `QualityFreezeBatchKey = MaterialIdentity + (ExplicitBatch || ProductionExecutionCard || SourceDocument + SourceLine)`。`QualityWorkbenchFreezeCount = count(distinct QualityFreezeBatchKey where frozen)`；冻结队列仍按质检任务下钻，但摘要数字不得由队列行数反推。
- `QualityUserVisibleStage = QualityActiveStageVisible ? normalize(dispositionStage) : 待检验判定`，其中 `normalize(未进入*) = 未开始`。该投影仅用于当前阶段筛选、搜索和状态优先排序，不写回 `inspectionConclusion`、`dispositionStage` 或生命周期。
- `QualityStageExport = QualityActiveStageVisible ? normalize(dispositionStage) : missing`。导出列仍表示处置/处理阶段，不得因为筛选使用“待检验判定”而伪造处置事实。
- `QualityStandardStatusRank = 启用 < 草稿 < 停用`；业务质检状态优先级继续把待检验判定和其他活动责任排在已完成、已关闭和已作废之前。最新页面依据为蓝图第 336 节。

## 310. 来料未判定责任集合与暂存批次投影合同（2026-08-05）

- `IncomingPendingJudgement = exists(line.pendingQty > 0) OR inspectionConclusion = 待判定`。`QualityOpenResponsibilitySet` 可同时包含 `待检验判定` 与真实 `dispositionStage`；工作台计数、责任卡筛选和列表当前阶段筛选按集合成员匹配，不再假设一张任务只能有一个责任阶段。
- `QualityPrimaryResponsibility = 待检验判定 if IncomingPendingJudgement else dispositionStage`，仅用于状态优先排序。`currentAction` 在未判定量与待处置量并存时合并为双责任提示；处置阶段字段和导出仍保存真实处置阶段，不改写为待检验判定。
- `IncomingQualityListQuantityFacts = received + stagingBatch + sample + sampleIssue + rejected + pending`，仅显示大于零或存在的事实。`sampleIssue` 表示抽样异常，`rejected` 表示整批判定的不合格数量，两者不得互相替代。
- `IncomingQualityBatchDisplay = task.batch || task.stagingBatch || decisionLine.batch || receiptLine.stagingBatch || receiptLine.batch`。该投影只恢复来源暂存批次的可见性；正式库存批次继续由仓库入库过账形成。最新页面依据为蓝图第 337 节。

## 311. 质检对象名称、责任联系人和暂存位置投影合同（2026-08-05）

- `ProductionQualityObjectLabel = 受检物料`。生产质检对象可以是原料、半成品、过程品或成品；列表列名、搜索提示和登记字段不得固定投影为“成品”。具体批次字段继续由 `QualityType` 决定。
- `QualityListDateDimension(incoming | production) = 任务日期`。列表的筛选、表头、移动卡片和 CSV 使用同一名称；底层值仍为既有 `QualityTaskDate`，实际判定时间由 `decidedAt` 单独投影，二者不得混写。`QualityDecisionDraftDate = decidedAt ?? ShanghaiToday`，仅作为登记上下文；提交后的正式日期仍由服务端 `decidedAt` 形成，`dueDate` 不得回填为检验日期。
- `DefectResponsibilityDisplay = responsibleParty + responsibilityProcess + productionContext`，不包含 `externalContact`。供应商或客户联系人可留在来源快照中，但不进入不良列表、详情基本信息或处置登记页；质量人员通过来源采购、销售或售后单据追溯外部联系方式。
- `HistoricalQualityHoldLocationDisplay = canonicalWarehouseName + location`。历史“质检仓 QC-*”兼容数据在当前页面投影为“采购暂存区 / QC-*”，仓库名称必须与仓库主数据保持一致，不能产生第二套仓库名称。最新页面依据为蓝图第 338 节。
- `QualitySourceLinkable = runtimeIncomingQualityCodes.has(sourceCode) || runtimeProductionQualityCodes.has(sourceCode)`。来源质检编号本身是审计文本，不因运行时单据缺失而消失；仅 `QualitySourceLinkable = true` 时提供详情链接，静态演示集合不得作为路由存在性的事实依据。

## 312. 设备巡检当前任务、只读记录与引用投影合同（2026-08-05）

- `CurrentInspectionTask(plan) = MinBy(scheduledDate, OpenTask(plan))`，其中 `OpenTask.status ∈ {待巡检, 巡检中, 异常处理中}`。`PlanTaskDate = CurrentInspectionTask.scheduledDate ?? plan.nextDueDate ?? plan.firstDueDate`；计划列表排序、筛选、导出和任务提示统一消费该日期，不再混用 `updatedAt`。
- `PlanCurrentTaskDisplay = CurrentInspectionTask(code, status, scheduledDate)`；仅 `CurrentInspectionTask = ∅` 时展示 `NextScheduleDate`。计划状态“启用/停用”与当前任务状态是两个事实，不允许用“下次任务”覆盖已经生成的未完成任务。
- `InspectionItemInputMode = editable` 当且仅当 `task.status = 巡检中 && actor.has(PERM-EQUIPMENT-OPERATE)`；其他状态投影为只读结果文本。只读投影不改变冻结检查项、实测、备注、异常概述或关闭结果。
- `StandardActivePlanReferences = plans.filter(status = 启用 && standardCode = standard.code)`，标准详情必须能下钻每个引用计划；任务与计划的 `equipmentCode` 下钻稳定设备主档。引用关系是读模型，不产生新的巡检或修订事件。
- `firstDueDate` 在计划建立后冻结。标准界面只有 `EditableSignature` 变化时才预告并形成下一修订；无变化保存继续返回 `unchanged = true`。最新页面依据为蓝图第 339 节。

## 313. 设备巡检标准空草稿与列表状态投影合同（2026-08-05）

- `InspectionStandardDraft.items` 允许为空；`InspectionStandardEnabled = nonEmpty(acceptance) AND count(complete(items)) >= 1 AND count(incomplete(items)) = 0`。草稿保存只记录已经填写的项目，空白占位行不构成正式检查项事实。
- `RemoveInspectionStandardItem` 对草稿和可维护修订允许删除任一项目，包括最后一项；该命令只改变当前编辑草稿，不修改已生成巡检任务冻结的项目快照。
- `EquipmentInspectionListStatusColumn(task) = lifecycle + nextStep`，`EquipmentInspectionListStatusColumn(plan) = planStatus + CurrentInspectionTask`，`EquipmentInspectionListStatusColumn(standard) = usageStatus + ActivePlanReferenceCount`。列表列名、筛选条件、状态排序名称和 CSV 表头必须使用同一投影维度。最新页面依据为蓝图第 340 节。

## 314. 巡检动作证据与计划当前任务影响投影合同（2026-08-05）

- `InspectionTaskEventDisplay(action) = LatestMatchingFlow(actor, time) ?? CompatibleTaskTimestamp`。开始巡检、提交异常、正常完成、异常关闭和取消任务分别读取对应动作日志；最终动作在旧数据缺少日志时可使用 `updatedBy + completedAt/cancelledAt` 兼容，但 `assignee` 仍只是分派快照，不能代替实际操作人。
- `PlanEditCurrentTaskImpact = CurrentInspectionTask(code, status, scheduledDate) + Frozen(equipmentSnapshot, standardSnapshot, dueAt)`。编辑计划时必须显式暴露该投影；设备、标准、频次和执行时间窗仅影响当前任务结束后生成的新任务，负责人变更仍只改派 `pending` 任务。
- `PlanStatus = inactive` 只停止后续任务生成，不消费或取消 `CurrentInspectionTask`。当前任务的取消继续使用独立命令、原因、操作人和时间事实。最新页面依据为蓝图第 341 节。

## 315. 巡检计划状态、当前任务与责任人投影合同（2026-08-05）

- `PlanListStatus = plan.status`，`PlanListCurrentTask = CurrentInspectionTask(code, status, scheduledDate, assigneeSnapshot)`，`PlanTaskAttention = overdue | today_pending | before_schedule | none`。三个投影不得互相覆盖；尤其 `plan.status = inactive` 时仍必须返回并展示现存未完成任务。
- `PlanOwnerDisplay = plan.owner`，列表字段名为计划负责人；`TaskAssigneeDisplay = task.assignee`，任务字段名为任务负责人。计划负责人变化只改派待巡检任务，已开始任务继续保留任务责任快照，列表不得通过改名或回填抹平差异。
- `PlanListCurrentTaskSummary = code + lifecycle + optional attention + scheduledDate`。界面将生命周期和提醒置于状态层，将编号和日期置于当前任务层；CSV 的当前任务列输出完整摘要。没有未完成任务时，启用计划显示待生成及下次任务日期，停用计划显示无未完成任务。最新页面依据为蓝图第 342 节。

## 316. 多来源需求承接与采购建议事实合同（2026-08-06）

```ts
type WorkOrderSourceAllocation = {
  taskCode: string;
  sourceLineId: string;
  sourceDocument: string;
  productCode: string;
  quantity: number;
  unit: string;
  dueDate: string;
};

type PurchaseOrderSourceAllocation = {
  requisitionCode: string;
  sourceLineId: string;
  quantity: number;
  unit: string;
  expectedDate: string;
};
```

- `TaskDerivedWorkOrder => count(sourceAllocations) >= 1`，且 `planQty = Σ sourceAllocations.quantity`。每条数量大于零，`taskCode + sourceLineId` 在本工单内唯一；来源任务及来源行必须存在且可建工单，所有来源行的 `productCode / unit / recipeCode` 必须与工单冻结事实兼容。`ManualWorkOrder => sourceAllocations = [] AND manualReason != empty`。
- `WorkOrderAllocatedQty(taskCode, sourceLineId) = Σ EffectiveWorkOrder.sourceAllocations.quantity`。兼容旧工单缺少集合时，把 `sourceTask + sourceLineId + planQty` 投影为一条分配。任一来源行的累计承接不得超过任务行需求；服务端在同一写事务内逐分配校验，前端汇总和禁用不能替代该门禁。
- `WorkOrderActualForAllocation(metric) = min(allocation.quantity, WorkOrderMetric × allocation.quantity / planQty)`，用于把工单报工、合格和入库实绩只读投影回任务；同一工单各来源投影之和不得超过工单实绩。该比例投影不改变工单/批次实际事实，人工改变归属需建立新的可审计分配事件。
- `OpenPurchaseDemandLine = SubmittedPurchaseRequisitionLine.requestedQty - Σ EffectivePurchaseOrderAllocation.quantity`。只有剩余量大于零的申请行进入采购建议；草稿、作废申请以及已完全承接行不进入建议。
- `PurchaseSuggestionKey = companyCode + materialCode + baseUom`。建议行汇总仍有开放数量的需求来源并保留逐需求数量事实；最早需求日期取来源最小值，全部启用物料—供应商关系作为候选参考，唯一优选关系只参与建议采购量计算。
- `DefaultSupplierCandidate(material) = exactlyOne(enabledRelation where isDefault)`。没有唯一默认关系时建议进入未分配组，禁止生成订单；系统不得按最近采购、供应商名称或数组首项猜测默认供应商。
- 采购订单同一物料行允许 `count(sourceAllocations) >= 1`，并要求 `line.qty >= Σ sourceAllocations.quantity`。所有分配必须指向真实采购申请行且物料、单位与订单行一致；差额为无申请来源的备库数量，每个申请行在所有未作废订单中的累计承接不得超过剩余需求。`sourceRequisition / sourceLineId` 只保留为首条分配的兼容摘要，不能再作为多来源权威事实。
- 采购建议是由采购申请、采购订单和物料—供应商关系实时生成的读模型，不保存生命周期、不占用需求。只有成功保存采购订单草稿才形成承接；删除或作废草稿释放承接并重新进入建议。最新页面依据为蓝图第 343 节。

## 317. 采购建议可见选择与来源规范化合同（2026-08-06）

- `SupplierMatchStatus = matched | missing-default | conflicting-defaults`。只有 `matched` 可以生成采购订单；缺失与冲突必须分别返回维护原因。`PurchaseSuggestionStatusSort = conflicting-defaults < missing-default < matched`，同状态内按最早需求日升序；“需求条数”排序使用来源行计数，禁止汇总不同单位数量。
- `VisibleSuggestionItems(query, dueRange, supplierFilter) = MaterialSuggestionItems.filter(matchesQuery AND dueInRange AND supplierCandidateMatches)`；筛选只改变读模型显示，不产生选择、占用或订单命令。
- `PurchaseSuggestionDueAttention = overdueDays | today | within3Days | none`，仅为当前责任提醒，不写回采购申请需求日期。页面的“待采购需求”仍等于开放需求，`minOrderQty` 只用于推导独立的建议下单量，`leadTimeDays` 用于交期决策。
- `CanonicalPurchaseAllocation.expectedDate = SourcePurchaseRequisition.expectedDate`；`CanonicalWorkOrderAllocation = { sourceDocument: SourceTask.sourceDocument, productCode: SourceTaskLine.productCode, productName: SourceTaskLine.productName, unit: SourceTaskLine.unit, dueDate: SourceTask.deliveryDate }`。前端提交的同名字段不得覆盖这些权威事实。
- `WorkOrderSourceTaskCount = count(distinct sourceAllocations.taskCode)`，`WorkOrderSourceLineCount = count(sourceAllocations)`。编辑和详情必须分别展示，不能把两条同任务需求误写成两个任务。最新页面依据为蓝图第 344 节。

## 318. 采购建议快照门禁与来源分配可读合同（2026-08-06）

- 采购建议不保存 `snapshotToken` 或选中项。`CreatePurchaseOrderFromSuggestion` 为停用命令并返回业务拒绝；所有实际采购决策由采购订单命令重新读取开放采购需求和供应商主数据。
- 采购建议的搜索、筛选和展开只影响可见读模型，不得形成隐藏选择、需求占用或订单草稿。
- `PurchaseOrderLineSourceDisplay = sourceAllocation.requisitionCode + allocatedQuantity`，来源行号与权威需求日作为下钻上下文；整单 `sourceRequisitions` 只用于去重摘要，不替代逐行分配。
- `CanonicalHistoricalPurchaseAllocation = { requisitionCode, sourceLineId, quantity, unit: SourceLine.uom, expectedDate: SourceRequisition.expectedDate }`。历史迁移只规范化来源身份、单位和日期，不改写已冻结承接数量。最新页面依据为蓝图第 345 节。

## 319. 生产工单版本预览与冻结事实合同（2026-08-06）

- `DraftWorkOrderVersionPreview = LiveRecipe(recipeCode) + LiveProcessTemplate(processTemplateCode)`，其显示状态固定为未冻结。配方或工艺运行时目录加载、刷新或替换后，草稿只读详情必须重新投影用料和工序。
- `SubmittedWorkOrderVersion = ServerFrozenSnapshot(recipeCode, processTemplateCode, submittedAt)`。一旦存在 `snapshotStatus = server_frozen`，工单详情、执行批次和未来打印只能消费冻结快照，不得用当前目录覆盖。
- 草稿预览为空只允许表示版本确实不存在或加载失败；异步加载完成但响应依赖未传播，不构成“未保存可读取明细”的业务事实。最新页面依据为蓝图第 346 节。

## 320. 采购建议起订量与备库差额合同（2026-08-06）

- `OpenDemandQty = Σ PurchaseSuggestionSource.quantity`；`SuggestedOrderQty = max(OpenDemandQty, minOrderQty)`；`StockSupplementQty = SuggestedOrderQty - OpenDemandQty >= 0`。三者使用同一物料基础单位，备库差额不属于任何申请来源。
- 采购建议不落单；采购订单保存后仍满足 `PurchaseOrderLineStockSupplement = line.qty - Σ sourceAllocations.quantity >= 0`，来源承接只按分配数量关闭采购需求。建议采购量与订单数量可以不同，采购员的订单事实具有最终权威性。
- 供应关系修改后建议实时重算 `minOrderQty / leadTimeDays / suggestedOrderQty`，不保存历史建议快照；订单保存时重新验证实际选中的供应商、需求来源与剩余数量。
- 页面与导出分别命名“需求数量、已下单、待采购、建议采购、备库参考”；订单详情显示“需求承接合计、逐来源数量、备库差额”。最新页面依据为蓝图第 348 节，打印模板不在本合同范围。

## 321. 采购需求界面术语与只读采购建议合同（2026-08-06）

- `PurchaseRequisition` 是内部兼容实体名；`PurchaseDemandUiLabel = 采购需求`，单据用户名称为“采购需求单”。路由、编号和持久化字段不因界面改名迁移，所有采购域页面、导航、引用抽屉和生产交接提示使用新用户术语。
- `PurchaseSuggestionItemKey = companyCode + materialCode + baseUom`；`DemandQty = Σ Source.requestedQty`，`OrderedQty = Σ Source.orderedQty`，`OpenQty = Σ Source.remainingQty = DemandQty - OrderedQty`。只保留 `OpenQty > 0` 的来源行进入建议。
- `SupplierOptions = enabled MaterialSupplierRelation × enabled Supplier`。`count(preferredSupplier) = 1` 时 `RecommendationStatus = recommended`；存在候选但没有唯一优选时为 `needs-review`；无候选时为 `no-supplier`。多个普通候选是正常供应事实，不得标记为冲突。
- `SuggestedOrderQty = max(OpenQty, PreferredSupplier.minOrderQty)`；没有唯一优选时等于 `OpenQty` 并标记尚未计入供应商起订量。该数量、备库差额和优选供应商均为实时参考，不占用需求、不冻结供应商、不创建订单。
- `POST /purchase/suggestions/create-order => 410`。采购订单从订单菜单新建，通过 `sourceAllocations` 选择和承接一条或多条开放采购需求；保存时继续执行来源存在、物料单位一致、累计承接不超需求和订单数量不小于承接合计门禁。最新页面依据为蓝图第 348 节。

## 322. 采购建议供应关系投影与优选冲突合同（2026-08-06）

- `PurchaseSuggestionLifecycle = none`；`PurchaseSuggestionRelationshipStatus ∈ {recommended, needs-review, preferred-conflict, no-supplier}`。界面只把它称为供应关系，不得把关系投影命名为建议状态或审批状态。
- `recommended ⇔ count(PreferredSupplier) = 1`；`needs-review ⇔ count(SupplierOptions) > 0 AND count(PreferredSupplier) = 0`；`preferred-conflict ⇔ count(PreferredSupplier) > 1`；`no-supplier ⇔ count(SupplierOptions) = 0`。多个普通候选不是冲突，多个优选关系才是主数据冲突。
- `preferred-conflict => RecommendedSupplier = null AND SuggestedOrderQty = OpenQty AND StockSupplementQty = 0`。系统不得按数组顺序、交期、起订量或名称选择一个优选关系；页面的备库参考显示待修正而非有效零值。
- `PurchaseSuggestionMetricProjection = DemandQty + OrderedQty + OpenQty + SuggestedOrderQty + StockSupplementDisplay + EarliestExpectedDate`，六项并列显示。`StockSupplementDisplay = quantity` 仅在唯一优选关系存在时成立，否则为未计算提示。
- `PurchaseSuggestionSourceDisplay = SourceType + Department + Requester + RequestedQty + OrderedQty + RemainingQty + ExpectedDate`；`SupplierOptionDisplay = SupplierCode + SupplierName + SupplierMaterialCode + PreferredFlag + MinOrderQty + LeadTimeDays`。最新页面依据为蓝图第 349 节，打印模板不在本合同范围。

## 323. 采购建议供应商中立参考合同（2026-08-06）

- `PurchaseSuggestionPreferredSupplier = none`。建议读模型不返回 `recommendedSupplierCode / recommendedSupplierName / recommendationStatus`，也不消费物料—供应商关系的默认标记来排序或计算物料级数量；多个启用供应商一律作为平等候选。

## 324. 采购建议显示口径与提醒投影合同（2026-08-06）

- `DemandTotalDisplay = demandQty`，`OrderedDisplay = orderedQty`，`OpenPurchaseDisplay = openQty`；来源行对应 `OriginalDemandDisplay = requestedQty`、`SourceOrderedDisplay = orderedQty`、`SourceOpenDisplay = remainingQty`。界面名称必须明确区分汇总总量与来源原需求，数量事实不因显示优化而重算。
- `SuggestionDueAttention = overdue(days) | today | within_three_days(days) | none`，仅由上海业务日与 `earliestExpectedDate` 推导，同时显示在左侧物料项和右侧最早需求指标；它是提醒投影，不是生命周期状态，也不参与需求占用。
- `SupplierAttention = referenceSupplementQty > 0`。只有供应商 MOQ 导致参考下单量高于开放需求时才强调该候选的超需求量；零超需求保持普通显示。正常供应商数量只在候选区域计数，顶部异常标识仅用于 `supplierStatus = no-supplier`。最新页面依据为蓝图第 351 节。

## 325. 物料身份列表与详情投影合同（2026-08-06）

- `MaterialListIdentity = name + code + discriminating(model, spec)`，默认不包含 `imageUrl`、字母缩略图或占位色块。列表投影服务于扫描和比较，必须为数量、日期、状态及责任字段保留空间。
- `MaterialDetailIdentity = realImage? + name + code + model + spec + contextualAttributes`。详情与编辑上下文应加载可用的真实图片和完整身份字段；真实图片缺失时允许使用一致的占位形态，但不能删减名称、编码和关键规格。
- `ListImageException = realImageExists && imageHasRecognitionValue && pageExplicitlyRequiresImage`。只有颜色、外观或包装辨识确有必要时，具体列表才可显式启用真实图片；默认合同仍为列表 `textOnly = true`、详情 `textOnly = false`。最新页面依据为蓝图第 352 节。

## 326. 采购建议主从可见性合同（2026-08-06）

- `DesktopSuggestionMasterScroll = page`：左侧物料集合不拥有独立滚动容器，其可见范围由页面滚动决定；筛选和排序仍只改变集合内容与顺序。
- `DesktopSuggestionDetailScroll = sticky(viewportTop, availableHeight) + internalY`：右侧选中物料详情在页面滚动期间保持可见，内容超过可用高度时只滚动详情内部，并通过滚动链隔离避免影响页面位置。
- `NarrowSuggestionScroll = page(master + detail)`：主从区上下排列后取消详情吸附及内部滚动。滚动方式属于界面状态，不写入业务数据，也不改变 `selectedSuggestionKey` 或任何需求、供应商事实。最新页面依据为蓝图第 353 节。

## 327. 采购建议列表交互状态投影合同（2026-08-06）

- `SuggestionMasterInteraction = idle | hover_focus | selected | selected_hover_focus`。`hover_focus` 使用系统可点击列表的浅绿反馈；`selected` 使用更明确的浅绿背景与绿色左侧强调线；组合状态在不改变语义的前提下略微增强。
- `selected = row.key === selectedSuggestionKey`，并通过 `aria-pressed = true` 暴露给辅助技术。视觉高亮仅投影当前详情上下文，不等于 `supplierStatus`、逾期提醒或业务生命周期状态。
- 交互状态不持久化、不导出，也不改变筛选、排序和需求占用。最新页面依据为蓝图第 354 节。

## 328. 采购建议主体辨识与候选顺序合同（2026-08-06）

- `SuggestionMasterIdentity = MaterialListIdentity + unitContext + MultiCompanyRange? companyDisplay : hidden`。`SuggestionKey = companyKey + materialCode + unit` 中的公司在当前范围存在多个公司值时必须进入左侧可见身份；单公司范围隐藏逐行重复值，右侧详情继续显示。单位随待采购数量显示，使不同汇总主体可直接区分。
- `SuggestionDateSortLabel = earliestExpectedDate`，升序显示为“最早需求日从早到晚”，降序显示为“最早需求日从晚到早”。供应关系优先排序仍为 `supplierStatusRank + earliestExpectedDate`，不产生新状态。
- `SupplierDisplayOrder = supplierName ASC + supplierCode ASC`。候选顺序不读取 `leadTimeDays`、`minOrderQty`、价格或默认关系标记；这些字段只作为每家候选的并列事实。稳定显示顺序不等于推荐排序。
- `CreatePurchaseOrderFromSuggestion = retired`。旧默认供应商分组及直接转单实现必须不存在；`POST /api/purchase/suggestions/create-order` 保持 `410` 只读拒绝，采购订单继续从订单域承接开放需求。最新页面依据为蓝图第 355 节。

## 329. 采购建议可见选择与来源顺序合同（2026-08-06）

- `VisibleSuggestionKeys = FilterAndSort(PurchaseSuggestionItems)`；当 `selectedSuggestionKey ∉ VisibleSuggestionKeys` 时，`selectedSuggestionKey = VisibleSuggestionKeys[0] ?? empty`。右侧详情和左侧 `aria-pressed` 必须读取同一选择，不保留不可见旧键等待条件清除后恢复。
- `SupplierFilterOptions = distinct(suppliers.supplierName)`，筛选执行供应商名称精确匹配；列表搜索继续读取供应商名称、编码和供方料号进行模糊匹配。无启用关系由 `supplierStatus = no-supplier` 表达，不伪造成供应商选项。
- `SuggestionSourcesDisplayOrder = expectedDate ASC + requisitionCode ASC + sourceLineId ASC`，空需求日排在有日期来源之后。排序不参与任何数量计算或承接门禁。最新页面依据为蓝图第 356 节。

## 330. 采购建议详情视口与响应式字段合同（2026-08-06）

- `DetailScrollTop(selectedSuggestionKey changed) = 0`。任何显式选择或可见范围同步导致的物料键变化，都在详情 DOM 更新后重置内部纵向滚动；滚动位置是瞬时界面状态，不持久化。
- `SuggestionSourceFields = requisitionIdentity + sourceContext + quantityProgress + expectedDate`。桌面、中等宽度和小屏只能改变网格位置，不得删除其中任一事实；尤其 `expectedDate` 不允许通过响应式 `display:none` 隐藏。
- `MasterAccessibleName = 待采购物料`，`DetailAccessibleName = materialName + 采购建议详情`。可访问名称随当前物料变化，不形成业务字段或导出列。最新页面依据为蓝图第 357 节。
- `SupplierStatus ∈ {available, no-supplier}`，仅表示是否存在启用候选关系，不是生命周期状态。`SupplierStatusLabel = 有可选供应商 | 未维护供应关系`；左侧物料列表可附加候选家数，但不得出现优选、推荐或系统已选语义。
- 对每个 `SupplierOption` 独立计算 `ReferenceOrderQty = max(OpenQty, Supplier.minOrderQty)` 与 `ReferenceSupplementQty = ReferenceOrderQty - OpenQty >= 0`。该参考不写回物料级建议、不占用需求、不冻结供应商；不同供应商的参考数量不得相加。
- `PurchaseSuggestionObjectiveMetrics = DemandQty + OrderedQty + OpenQty + EarliestExpectedDate`。主从布局仅改变同一读模型的投影方式：左侧选中键是瞬时界面状态，右侧读取相同物料项的来源与候选关系，不形成快照、命令或订单事实。最新页面依据为蓝图第 350 节。

## 331. 多来源生产工单下游权威关系合同（2026-08-06）

- `EffectiveWorkOrderSources(order) = order.sourceAllocations.length > 0 ? order.sourceAllocations : LegacySourceProjection(order.taskCode, order.sourceLineId, order.planQty)`；列表、任务关联、工作台、异常和历史快照统一消费该集合。`taskCode / sourceLineId / sourceTask` 仅为首条来源的兼容摘要，不是权威一对一关系。
- `WorkOrderSourceTaskCount = count(distinct EffectiveWorkOrderSources.taskCode)`；`WorkOrderSourceLineCount = count(EffectiveWorkOrderSources)`。列表和详情必须分别按去重任务数与来源行数表达，搜索字段为全部 `taskCode` 的集合。
- `TaskMetricProjection(order, taskCode, metric) = min(TaskAllocationQty, metric × TaskAllocationQty / order.planQty)`，其中 `TaskAllocationQty = Σ EffectiveWorkOrderSources.quantity where taskCode`。生产任务与工作台的已安排、报工、合格和入库不得把整单实绩重复计入每个来源任务。
- `ShortageExceptionMaterialOwner = relatedWorkOrder ?? explicitSourceTask`。存在关联工单时，物料齐套复核读取工单冻结 `materialNeeds`，异常关系返回全部来源任务 `tasks[]`，单数 `task` 只保留为旧客户端兼容；异常主操作优先下钻工单。
- `HistoricalWorkOrderSnapshot.sourceAllocations = Canonicalize(EffectiveWorkOrderSources)`。历史快照补齐、重新提交和版本修订均保存来源集合；新建与编辑继续满足 `planQty = Σ sourceAllocations.quantity`、同来源行唯一、同成品/单位/配方以及累计不超任务需求。最新页面依据为蓝图第 358 节。
- 已形成释放、生产批次、质检、异常、报工或入库事实的工单，结构冻结门禁必须先于来源合计等普通输入校验执行；任何来源、数量、单位、计划日期、配方或工艺变化统一返回 `409`，不得因为客户端同时提交了不匹配的来源合计而降级成可误解的 `400`。

## 332. 生产工单任务需求单一关系合同（2026-08-06）

- `WorkOrderTaskDemandRelation = { taskCode, sourceLineId, sourceDocument, productCode, quantity, unit, dueDate }`。其中任务与需求行回答追溯，本工单数量回答分配；两者属于同一关系对象，不建立独立的“来源明细”和“任务承接”界面实体。
- `AuthoritativeWorkOrderTaskDemands = sourceAllocations[]`；`taskCode / sourceTask / sourceLineId = first(AuthoritativeWorkOrderTaskDemands)` 只用于旧接口兼容。任何读取、计数、搜索、导航、任务进度回投和版本快照均不得只消费首条兼容值。
- `WorkOrder.planQty = Σ WorkOrderTaskDemandRelation.quantity`；任务模式的成品、单位与配方必须在全部关系间一致，工单交期默认取关系要求日期最早值。关系增删和数量调整只修改当前可编辑草稿，形成下游执行事实后继续受结构冻结门禁约束。
- `ManualWorkOrder = sourceAllocations.length = 0 + explicitReason`。手工工单不占用生产任务需求，成品与计划数量由工单直接维护；用户界面的“建单方式”只是对该事实的投影，不新增生命周期状态。最新页面依据为蓝图第 359 节。

## 333. 生产工单任务前置与逐需求日期合同（2026-08-06）

- `ValidWorkOrder = sourceAllocations.length >= 1`；不存在新的无任务工单。人工提出的临时、试产或备库需求必须先形成有效生产任务，再由工单承接其需求行。本节废止第 332 节中的 `ManualWorkOrder` 新建合同。
- `WorkOrderRequirementDate(allocation) = SourceTask.deliveryDate`，客户端不得覆盖。`WorkOrderEarliestRequirementDate = min(sourceAllocations[].dueDate)` 只作为列表排序、筛选、逾期提醒及旧接口 `dueDate` 的兼容投影，不是工单级可编辑事实；多需求日期必须逐行保留。
- 工单不拥有独立负责人和实际计划日期。需求责任读取生产任务负责人，现场责任读取生产批次或设备作业负责人，审计责任读取真实操作账号；工单历史 `owner* / plannedDate` 仅作兼容读取，不再参与新建、编辑、筛选或页面展示。
- 历史 `sourceAllocations.length = 0` 的记录标记为关系缺失，只读显示并在变更或重提时阻断，直至补齐任务需求；不得继续投影为“手工工单”。最新页面依据为蓝图第 360 节。

## 334. 生产工单任务优先编辑与状态去重合同（2026-08-06）

- `WorkOrderEditorStep1 = Edit(sourceAllocations[])`；`DerivedWorkOrderProduct = Unique(sourceAllocations[].productCode)`，`DerivedWorkOrderUnit = Unique(sourceAllocations[].unit)`，`DerivedWorkOrderPlanQty = Σ sourceAllocations[].quantity`。工单号、成品、计划数量和基础单位不是新建页可编辑输入，任务关系变化后统一重新投影。`WorkOrderTaskDemandOptions` 只在权威生产任务快照完成加载后开放选择；加载中、无可信快照或加载失败时不得从旧缓存建立承接关系。
- `WorkOrderEditorProductIdentity` 与每条 `WorkOrderTaskDemandIdentity` 均以任务需求行保存的物料编码关联物料身份，显示快照名称并补充可获得的型号规格。它们只改变读模型，不新增或改写任务需求、配方及工艺事实。
- `WorkOrderStatusPanel` 是计划、已安排、报工、质量、入库、要求日期风险、物料准备和批次总数的唯一整单汇总投影；主体执行区只投影逐条安排/批次记录，不再建立第二套整单数量事实格。
- `WorkOrderMaterialReserveSection = RemainingMaterialNeeds(unreleasedQty)`；章节名称为“物料储备”或“剩余物料储备”，行投影为物料身份、预计需求、库存判断以及本单分配/可领料/缺口/待检/待入库和在途数量。最新页面依据为蓝图第 361 节。

## 335. 生产工单任务选项响应式与派生区可见性合同（2026-08-06）

- `WorkOrderTaskDemandOptions = Project(ProductionRuntimeRevision, tasks, workOrders, sourceAllocations)`；任务需求选项必须显式消费生产运行数据修订号，使服务端刷新后的累计承接量、剩余可分配量和兼容候选在同一渲染周期重新投影。
- `WorkOrderDerivedSectionsVisible = Boolean(DerivedWorkOrderProduct)`；版本绑定和预计物料均依赖任务需求派生出的成品。成品为空时不生成禁用选择器或空材料表，成品确定后再读取适用配方、工艺与物料预览。
- `WorkOrderTaskDemandEligible = EffectiveTaskRecipe(sourceLine) exists`；有效配方读取显式启用版本，或同成品唯一启用版本。无有效配方的需求只形成 `RecipeBlocker`，不可写入 `sourceAllocations[]`。
- `WorkOrderProcessCandidates = EnabledProcessTemplates where Match(ProductMaterialFamily, ProcessTemplate.productFamily)`；历史同成品工单只产生常用排序，不扩大适用集合。当前原型以物料编码中的 PLA/PETG 材料族与工艺产品族匹配，后续主数据具备显式产品族字段后替换为主数据关联。
- 上述规则只改变编辑器读模型和可见性，不修改 `sourceAllocations[]`、冻结快照或任何下游执行事实。最新页面依据为蓝图第 362 节。

## 336. 生产工单汇总与批次记录分层合同（2026-08-06）

- `WorkOrderAggregateProgress = { planQty, releasedQty, reportedQty, qualifiedQty, defectQty, inboundQty, executionCardCount }`，仅由右侧 `WorkOrderStatusPanel` 投影。主体“生产安排与批次”不得再次投影相同整单总量。
- `WorkOrderArrangementRecord = { arrangementIdentity, releasedQty, executionStatus, exceptionalMaterialStatus?, nextAction }`；`WorkOrderBatchRecord = { executionCardCode, batchQty, stageStatus, reportedQty, qualifiedQty, inboundQty, pendingQualityFacts?, currentStage, nextAction }`。两类记录可以共处同一列表，但数量与状态必须属于该安排或批次自身。
- `VisibleMaterialStatus(record) = materialStatus not in { 已领料, 已领齐 }`；`VisiblePendingQuality(record)` 只包含数量大于零的待报工检、不良、待入库检和入库检冻结事实。正常状态和零数量不进入逐批明细。
- `WorkOrderEmptyDraftVisible = WorkOrderContent(taskDemandSelector)`；当 `sourceAllocations.length = 0` 时，成品身份、备注、版本绑定、预计物料和空附件入口均不投影。添加首条任务需求后恢复这些依赖区块；此可见性不写入业务数据。最新页面依据为蓝图第 363 节。

## 337. 生产工单来源选择工作区与建单检查投影（2026-08-06）

- `WorkOrderDemandPickerOption = { taskCode, sourceDocument, productIdentity, availableQty, unit, requirementDate, recipeReady }`。候选集合继续取自 `WorkOrderTaskDemandOptions`；选择窗口只改变比较与选择投影，不新建需求实体或占用数量。
- `SelectableDemand = compatibleWithCurrentDraft && availableQty > 0 && recipeReady`。`recipeReady = false` 的候选保留可见及搜索，但选择命令禁用；成功选择后直接调用既有承接命令写入 `sourceAllocations[]`，不保留额外临时“待添加”状态。
- `WorkOrderEditorSections = DemandRelations + DerivedContent + ProductionStandards + MaterialPreview`。`DemandRelations` 始终可见；其余三段依赖 `sourceAllocations.length > 0`。生产标准编辑投影只包含配方/工艺版本选择及摘要，逐项配方用量、完整温区和冻结工艺参数属于保存后的详情快照。
- `WorkOrderDraftCheck = { demandRelationStatus, productQuantityStatus, productionStandardStatus, materialPreviewStatus, firstBlocker }`，仅作为录入辅助读模型，不形成生命周期状态。`firstBlocker` 复用保存提交校验顺序；“可以提交”不绕过服务端校验。
- `WorkOrderOverview` 不渲染空 `BasicFacts`；`WorkOrderExecutionRecord` 统一承载安排与生产批次行。整单 `WorkOrderAggregateProgress` 合同仍按第 336 节执行。本节替代第 336 节中空草稿单卡投影，最新页面依据为蓝图第 364 节。

## 338. 生产工单建单状态渐进投影（2026-08-06）

- `WorkOrderEmptyEntry = sourceAllocations.length = 0`；该状态只投影任务需求说明、可信候选计数和选择命令。`WorkOrderDraftCheck`、附件、派生成品、生产标准与预计物料均不投影，避免把尚未发生的事实显示为四项错误。
- `WorkOrderConfiguredEntry = sourceAllocations.length > 0`；此时投影需求明细、派生工单内容、生产标准、预计物料、建单检查与附件。`WorkOrderDraftCheck` 的业务计算不变，只调整其可见条件。
- `DemandQuantityProjection = { demandTotal, currentlyAvailable, allocatedToThisWorkOrder }`；字段标签分别为“需求数量”“当前可分配”“本工单数量”。三者均来自既有任务与工单承接事实，不新增可编辑需求数量。
- `WorkOrderEntryLoading` 只改变选择命令可用性与读取提示，不切换页面骨架。最新页面依据为蓝图第 365 节。

## 339. 生产工单任务分配数量录入投影（2026-08-06）

- `WorkOrderAllocationQuantityInput = { numericValue, unitSuffix }`；`numericValue` 写入 `sourceAllocations[].quantity`，`unitSuffix` 只读投影 `sourceAllocations[].unit`。显示层的一体化不改变既有数量与单位字段结构。
- `OnAllocationQuantityChanged` 立即执行 `planQty = Σ sourceAllocations.quantity`，随后重新投影成品计划数量、配方预计用量和 `WorkOrderDraftCheck`。
- `AllocationQuantityInvalid = quantity <= 0 || quantity > CurrentAvailableQuantity`；无效时错误必须引用当前任务和可分配上限。`sourceLineId` 的存在性与数量合法性分别校验，不得把数量错误投影为缺少任务关系。
- `WorkOrderNote` 继续是可空工单级说明，不参与 `RequiredWorkOrderFacts`。最新页面依据为蓝图第 366 节。

## 340. 生产工单空草稿动作与详情语义投影（2026-08-06）

- WorkOrderEmptyDraftCommandState = sourceAllocations.length === 0；该状态下 SaveWorkOrder / SubmitWorkOrder 均不可执行，操作提示为“请先选择任务需求”。SelectTaskDemand 是唯一建单入口；加入首条有效关系后恢复保存与提交能力。
- WorkOrderDemandDetailColumns = { taskAndSource, demandQty, allocatedQty, requirementDate }。其中来源是任务关系的追溯属性，需求数量读取任务需求行总量，本工单数量读取 sourceAllocations[].quantity；列名不得把数量重新写成关系名称。
- WorkOrderBusinessNote = UserEnteredNote。任务号、来源单据和需求行由 sourceAllocations[] 权威表达，系统不得生成同义备注；历史“来源于生产任务……按选中明细建立工单”占位文本不进入可编辑备注投影。
- WorkOrderExecutionEmptyProjection 只投影一条“尚未形成生产安排”，标题区不重复相同状态。DraftVersionProjection = CurrentSelectedVersion + PendingSubmissionConfirmation，它仍读取当前启用配方与工艺，仅改变用户用语；SubmittedWorkOrderVersion 的服务端冻结合同不变。
- WorkOrderRequirementDateListText 允许最多两行受控换行并保留完整可访问标题，不修改日期排序、风险计算或导出值。最新页面依据为蓝图第 367 节。

## 341. 生产工单列表进度投影去重事实（2026-08-06）

- `WorkOrderListStatusOverview = Lifecycle + Attention + ScheduleProgress + ProductionProgress + ReceiptProgress`。其中三项进度分别消费已安排数量、已报工数量和仓库正式入库数量，并统一以工单计划数量为分母。
- `ReceiptProgress` 在同一工单列表行只投影一次；不得同时以“完工入库”进度条和“入库”数量格重复展示同一累计入库事实。该去重只影响列表读模型，不删除底层 `InboundQty`，也不影响详情状态区的完整数量链。
- 生产任务与生产批次的总体进度条仍由各自读模型决定；共用状态组件允许 `progress` 缺省，不能为了视觉统一伪造或重复数量。
- `RemoveLastWorkOrderDemand` 在无任务入口预填的空白新建页中，必须恢复 `InitialNewWorkOrderSnapshot` 的全部派生及兼容事实，而不只清空可见成品字段。执行“选择后移除”后的脏状态比较结果应与初始快照一致；任务入口预带来源被移除、以及已存在工单的结构变更，都属于真实修改并继续受未保存保护。

## 342. 生产模块加载信任、异常状态与交互反馈合同（2026-08-06）

- `TaskActionProjection` 的输入至少包含生产运行快照、库存事实和启用配方目录。任一首次快照仍在加载时不得输出缺配方、可建工单或物料齐套结论；刷新失败且存在旧快照时，页面可继续读取但所有写入保持锁定。
- `TaskListStatusOverview = Lifecycle + Attention + WorkOrderProgress + ReleaseProgress + ReceiptProgress + MaterialReadiness`。`ReceiptProgress` 只投影一次；任务列表不同时输出总体完工入库进度条与入库数量格。`ExecutionCardOverallProgress` 可以与物料、报工、质检、包装四维并存，因为两者消费的事实不同。
- `ShortageExceptionStage` 从实时物料行派生：`Any(procurementGapQty > 0) -> 待处理`；`No procurement gap AND Any(shortageQty > 0) -> 处理中`；`All shortageQty = 0 -> 已关闭`。下一步与当前处置必须读取同一派生阶段，历史 `disposition / nextAction` 只作审计证据，不得覆盖当前事实。
- `InvalidPlanningSubmission` 必须形成字段级反馈：设置校验尝试状态、标记所有当前无效字段、滚动并聚焦第一处错误，同时保留页面数据。该合同覆盖生产任务、独立备料申请、配方以及使用相同验证器的工单和工艺编辑器。
- `ProcessTemplateExpandedStage` 最多一个；展开新阶段原子地收起旧阶段，点击当前阶段允许回到空展开状态。该交互只影响编辑视图，不改变系统动作目录、工艺阶段顺序或冻结工艺快照。
- `ProductionHomeMaterialRequestTodo = count(status = 草稿)`。`库存可满足 / 已转采购 / 已关闭` 均为评估或交接完成事实，不属于生产待提交，也不产生仓库受理责任。最新页面依据为蓝图第 369 节。

## 343. 生产工艺脏状态投影合同（2026-08-06）

- `ProcessTemplateBusinessDraft` 只包含可持久化工艺字段；`ProcessTemplateExpandedStage` 是瞬时界面状态，不进入业务草稿、保存载荷或未保存快照。展开状态变化必须满足 `DirtyBefore = DirtyAfter`。
- 工艺持久化字段发生变化时继续满足 `Dirty = true`，并由离开保护阻止无确认跳转。脏状态投影只排除 `expanded`，不得排除阶段内容、温区、产线、版本关系或其他业务字段。
- 返修登记取消应丢弃本次未提交输入；生产批次搜索清空应恢复同一运行快照的完整可见集合。上述交互不生成生产、质量、库存或售后业务记录。最新页面依据为蓝图第 370 节。

## 344. 生产批次现场关注与计划偏差读模型（2026-08-06）

- `ExecutionCardOperationalRank` 只影响默认列表顺序：`异常/返工/提前结束待处理 -> 现场可执行 -> 待质检 -> 待仓库 -> 待领料 -> 其他 -> 已结束`。它读取批次生命周期、当前工序和例外事实，不写回 `status / node / nextAction`，用户显式选择日期或数量排序时继续服从所选排序。
- `ExecutionCardOperationalRank` 在界面中的名称为“现场关注优先”；“状态优先”保留给真正按生命周期状态权重排序的列表，不得混用名称。
- `ExecutionCardScheduleAttention = PlannedDate - Today`，仅在批次未完成、未关闭、未作废时投影。负值显示“超计划 n 天”，零显示“今日计划”，一至三天显示近期计划；该值不是客户交期、SLA 或新的流程状态。
- 缺料异常的外部显示词和新增流程记录统一投影为“物料储备 / 已备齐 / 物料储备复核”，内部兼容枚举保持不变。术语转换不改变 `required / available / inTransit / qcPending / pendingInbound / purchaseGap` 等物料事实，历史流程记录原文也不回写。最新页面依据为蓝图第 371 节。

## 345. 生产工单草稿生产标准预览合同（2026-08-07）

- `WorkOrderDraftRecipePreview = SelectedRecipeVersion × WorkOrderPlanQty`。预览逐项计算 `perUnitQty / plannedNet / plannedWithLoss`，算法必须复用工单详情冻结配方的计算函数；固定损耗和比例损耗均参与含损耗预计。该预览只读，不另存一份配方事实。
- `WorkOrderDraftProcessPreview = SelectedProcessTemplateVersion`。预览读取该版本的温控参数、阶段顺序、责任、执行方式、动作、核心设备、作业要求和异常处理；算法复用详情页工艺快照投影。提交后仍由服务端生成并冻结正式工单快照，草稿预览不得替代冻结事实。
- `WorkOrderProcessCandidate = EnabledProcessTemplate ∩ ProductFamilyMatch`，同时保留当前已绑定版本以支持历史草稿读取。候选按版本编号稳定排列，不以历史使用次数推导“常用、推荐或优先”状态，也不向用户投影这类无主数据依据的标签。
- `WorkOrderEditorSections` 仍为任务需求、工单内容、生产标准、预计物料；生产标准回答“采用什么配方和工艺”，预计物料回答“当前库存能否覆盖”，允许同页分别呈现。最新页面依据为蓝图第 372 节，本节替代第 337 节对生产标准只显示摘要的约束。

## 346. 生产工单配方数量只读投影合同（2026-08-07）

- `WorkOrderRecipePerUnitDisplay = format(perUnitQty, materialUnit) + "/" + outputUnit`。百分比投料先按每单位成品净重换算，固定用量直接读取配方；页面必须显式展示成品单位分母。
- `WorkOrderRecipePlannedNet = perUnitQty × WorkOrderPlanQty`；`WorkOrderRecipePlannedWithLoss = plannedNet × (1 + lossRatePercent / 100) + fixedLossQty`。前者投影为“本单理论用量（不含损耗）”，后者投影为“本单预计需求（含损耗）”。
- `WorkOrderMaterialOverride = none`。工单草稿、变更和详情均无逐物料覆盖字段；客户端保存载荷与服务端提交校验继续从所选配方版本和计划数量派生 `materialNeeds`。改变配比、物料或损耗必须产生新的配方版本，实际消耗由领料、退料、报工和损耗事实表达。
- 预计物料区可以再次消费 `plannedWithLoss` 进行库存覆盖判断，其单耗投影同样使用真实 `outputUnit`，不得使用泛化的“/成品”；库存、分配、待检、在途或缺口不得反写为配方标准。最新页面依据为蓝图第 373 节。

## 347. 生产工单配方精简读模型（2026-08-07）

- `WorkOrderRecipeSummary = recipeCode + productUnitWeight + workOrderPlanQty`。`snapshot.frozenAt / snapshot.frozenBy` 继续保留为冻结审计事实，但只进入日志和追溯，不进入工单配方正文摘要。
- `WorkOrderEditorMaterialPreview = hidden`。客户端与服务端仍执行 `materialNeeds = derive(selectedRecipe, planQty)` 并保存派生结果，但新建与变更页不再重复投影库存覆盖表；详情中的实时物料储备仍消费同一需求事实。
- `WorkOrderRecipeMaterialIdentity = image + materialName + materialCode + model + specification`。冻结明细存在身份字段时优先读取冻结值，缺少型号、规格或图片时按物料编码回填当前物料主数据；计量规则与数量不得拼入身份副标题。
- `incomingQcRequired` 仍是配方和物料质检控制事实，不因界面隐藏而删除，但不投影到工单配方物料身份。最新页面依据为蓝图第 374 节，本节替代第 345、346 节关于新建页继续展示预计物料区的约定。

## 348. 补充要求传播与单据备注隔离合同（2026-08-07）

- `SalesOrder.supplementaryRequirement` 是跨销售交付、生产计划、仓库执行及必要生产质检传播的补充要求；旧 `internalRemark` 仅作为读取迁移和旧消费者兼容别名，写入后必须与该规范字段同值。`SalesOrder.internalNote` 是销售内部备注，传播范围恒为销售订单本身。
- `SalesOutboundRequest.supplementaryRequirement = SalesOrder.supplementaryRequirement`，`SalesIssue.supplementaryRequirement = SalesOutboundRequest.supplementaryRequirement`。旧 `SalesOutboundRequest.remark / SalesIssue.sourceRemark` 仅作为兼容别名。`SalesIssue.note` 继续只表达仓库拣货与出库执行备注，任何创建或迁移都不得把补充要求预填到该字段。
- 销售缺口生成的 `ProductionTask.supplementaryRequirement = SalesOrder.supplementaryRequirement`，该字段对生产任务编辑器只读；`ProductionTask.note` 是人工任务备注。任务更新不得接受客户端覆盖来源补充要求，服务端按来源订单规范化；旧自动生成说明按已知固定文本迁移为空。
- `WorkOrderSourceAllocationRequirementContext = { taskCode, sourceDocument, supplementaryRequirement, taskNote }`。工单保存时服务端按生产任务重新规范化上下文；`WorkOrder.note` 是独立工单备注。上下文文本不属于工单结构冻结比较，任务关系、来源明细、物料、数量、单位、要求日期、配方和工艺仍按原合同冻结。
- `ProductionQualityContext = { sourceRequirements[], workOrderNote }`，由来源工单派生并只读投影。它不进入 `QualityStandardSnapshot / checkpointResults / inspectionConclusion / disposition` 的计算，不能代替检验标准、检验实测或处置原因。
- `SalesOrder.internalNote` 不得出现在交付追踪、生产任务、生产工单来源上下文、销售出库任务或生产质检响应中；对外 PDF 继续同时排除 `supplementaryRequirement / internalNote`。最新页面依据为蓝图第 375 节。

## 349. 补充要求关联单据与历史备注归一化合同（2026-08-07）

- `SalesAfterSale.sourceRemark = snapshot(SalesOrder.supplementaryRequirement)`。新建销售售后忽略客户端伪造的来源备注；旧记录仅在空值或等于旧订单 `remark / internalRemark` 时迁移为规范补充要求，独立形成的售后事实不被覆盖。采购售后来源备注合同不变。
- `ProductionTaskBusinessNote` 与 `ProductionWorkOrderBusinessNote` 只返回人工业务文本。已知自动建单/缺口说明归一为空，清理范围同时覆盖 `ProductionTask.note`、`WorkOrder.note`、`WorkOrder.sourceAllocations[].taskNote` 及由它们派生的质量上下文。
- `ExecutionCardRequirementContext = derive(WorkOrder.sourceAllocations[], WorkOrder.note)`；该读模型不持久化到生产批次，不成为工艺参数、报工说明、异常原因或质量判定。
- `ProductionQualityContextFacts = unique(requirement) + unique(taskCode, taskNote) + businessWorkOrderNote`。显示顺序稳定，同一任务因多条承接明细出现时不重复任务备注；任何上下文都只读。
- `SalesOrderExecutionNoteEditorHeight` 是界面投影，不改变字段长度、保存数据或传播范围。最新页面依据为蓝图第 376 节。

## 350. 销售出库实际仓库与只读交付要求合同（2026-08-07）

- `SalesOutboundRequest.warehouseCode / warehouse = empty`。旧值只属于已废弃的计划提示，迁移时清空；创建和变更接口忽略客户端提交的仓库值。交付追踪的可发判断按物料汇总所有符合公司及销售出库职能的库存，不以任务头仓库过滤。
- `SalesIssue.warehouseCode / warehouse` 不作为待拣货任务的选择条件。`SalesIssuePickingAllocation = { sourceLineId, inventoryKey, warehouseCode, warehouse, location, batch, qty, uom }` 是实际出库位置的最小事实；每条分配在提交和过账时重新校验仓库启用状态、销售出库职能、公司、库存身份及可供数量。
- `SalesIssue.actualWarehouses = unique(positive PickingAllocation.{warehouseCode, warehouse})`。销售交付记录优先读取该集合；历史记录缺少集合时可以从正数分配重建，只有无法重建的已执行旧记录才允许显示旧仓库文本。待拣货不得显示计划仓库。
- `SalesOutboundRequest.supplementaryRequirement = authoritative SalesOrder.supplementaryRequirement`。交付追踪保存接口忽略客户端对该字段及兼容 `remark` 的改写；历史交付追踪有来源订单时以订单规范值迁移。`SalesOrder.internalNote` 继续保持销售域私有。
- `SelectedSalesOrderProductCount = count(products where materialCode or name is non-empty)`，与数组占位行数量分离。最新页面依据为蓝图第 377 节。

## 351. 销售订单内部备注详情投影合同（2026-08-07）

- `SalesOrderContent.internalNoteDisplay = SalesOrder.internalNote || "—"`，投影位置为“订单内容 / 订单信息”的全宽事实行，字段名固定为“订单备注（销售内部）”。显示必须支持原文换行和长文本自然折行。
- `SalesOrderFollowUp.internalNoteDisplay = hidden`。订单跟进不消费销售内部备注；其发货依据继续读取 `logisticsMode / plannedShipDate / shipContact / shipPhone / shipAddress / supplementaryRequirement`。
- `SalesOrder.internalNote` 的权限与传播范围不变：销售订单保存接口可维护，交付追踪、生产、仓库、质检、售后和对外 PDF 均不得读取或复制。最新页面依据为蓝图第 378 节。

## 352. 销售文本规范化与补充要求权威同步合同（2026-08-07）

- `SalesOrder.supplementaryRequirement = trim(input.supplementaryRequirement ?? input.internalRemark ?? existing)`；`SalesOrder.internalRemark` 仅作为同值兼容别名。`SalesOrder.internalNote = trim(input.internalNote ?? existing.internalNote ?? "")`，纯空白结果归一为 `""`，详情投影为 `—`。
- 对存在来源销售订单的交付追踪和生产任务，`supplementaryRequirement = authoritative SalesOrder.supplementaryRequirement`。历史迁移、读取水合和生产任务后续保存均不得以已有下游旧值或客户端载荷覆盖权威订单值；订单进入生产中后的内容冻结门禁保持不变。
- 权威同步只更新补充要求及其兼容别名；`SalesOrder.internalNote` 不进入交付追踪、生产任务或其派生工单上下文。生产任务 `note`、生产工单 `note` 与仓库执行 `note` 继续各自独立。最新页面依据为蓝图第 379 节。

## 353. 销售出库预留消耗与库存扣减合同（2026-08-07）

- `SalesIssueDispatchableQty = min(QualifiedOnHandQty, AvailableQty + ActiveReservationQtyForIssue)`；确认出库前按每条复核分配校验该数量，并按库存事实键聚合多行需求，禁止多行合计超过同一库存行当前可供数量。
- `PostSalesIssue` 的写入顺序固定为：整单只读校验完成 → 将当前销售订单及来源明细的有效预留按本次出库数量转为部分消耗或已消耗 → 重新投影库存占用与可用量 → 按复核分配扣减合格在库 → 写入库存流水与单据状态。不得在本单预留仍有效时先扣减合格在库。
- `ReservationConsumptionScope = sourceOrder + compatible sourceLineId`。其他订单预留、生产分配和盘点冻结不参与本次预留消耗，过账后继续约束同一库存行；当前单据的多仓、多库位、多批次分配只改变各自真实库存行。
- 边界样例 `WS-20260804-002`：本次分配为成品仓 140 卷、样品成品仓 38 卷和 70 卷，共 248 卷；过账后当前订单 248 卷预留全部消耗，成品仓同批次仍保留另一订单 60 卷有效预留，三条库存流水合计 `-248 卷`。最新页面依据为蓝图第 380 节。
