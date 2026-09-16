# Filatrix ERP Web 文档地图

更新时间：2026-09-16

本文只负责说明文档权威层级、阅读顺序和维护方式，不定义新的业务规则。

## 1. 权威顺序

发生冲突时按以下顺序处理：

1. 用户在当前任务中的最新明确决定。
2. `erp-web-prototype-blueprint.md`：产品范围、业务对象、页面职责和交互合同。
3. `erp-web-business-fact-model.md`：数据对象、状态、数量、来源承接、命令和一致性合同。
4. `erp-web-next-session-handoff.md`：当前实现、已验证结果、未完成事项和启动方式。
5. 模块设计、页面设计和数据库准备文档。
6. 历史审计、旧交接、方案池和阶段记录。

代码、当前页面和测试数据用于判断“现在实现成什么样”，但不能在冲突时自动覆盖前两份最高依据。

## 2. 新会话阅读路线

新电脑或新 Codex 账号开始工作时：

1. 让项目根目录成为当前工作目录，确认 `AGENTS.md` 已生效。
2. 阅读本文件和 `erp-web-next-session-handoff.md` 第 0 至 6 节。
3. 阅读蓝图第 0、0.1 节和事实模型第 0 节，确认当前范围和基础边界。
4. 根据本次任务搜索业务对象、页面、命令或单据号，并继续阅读两份最高依据中的相关增量章节。
5. 检查代码、`server/data/erp-data.json` 和真实运行页面，再决定是否修改。

蓝图和事实模型合计超过一万行，其中大量内容是可追溯的增量记录。交接入口已压缩，原交接全文保留在 `archive/erp-web-handoff-history-through-2026-08-07.md`。新会话不必为了一个局部问题机械重读全部历史，但涉及业务语义、跨模块写入、状态、数量或权限时，必须检索相关章节，不能只看摘要。

## 3. 当前核心文档

| 文档 | 状态 | 用途 |
| --- | --- | --- |
| `erp-web-prototype-blueprint.md` | 最高依据 | 产品范围、流程、页面和交互合同；最新记录到第 380 节 |
| `erp-web-business-fact-model.md` | 最高依据 | 事实对象、命令与数据一致性；最新记录到第 353 节 |
| `erp-web-next-session-handoff.md` | 当前交接 | 当前状态、验证命令、近期实现和下一步 |
| `erp-web-page-design-baseline.md` | 次级基线 | 系统级页面结构和视觉语法 |
| `erp-web-final-freeze-database-blueprint.md` | 实施准备参考 | 数据库迁移前的阶段性分析，不是建表脚本或当前唯一模型 |
| `aliyun-deployment.md` | 运维说明 | 阿里云 ECS、Docker 和 Nginx 部署 |
| `git-migration.md` | 开发说明 | 克隆、启动、测试数据与双机协作 |

销售、采购、仓库、生产、质检、基础资料及跨模块设计文档属于次级领域说明。使用前必须与两份最高依据中的最新章节核对，领域文档不能覆盖后续增量决定。

## 4. 历史与参考文档

以下材料保留用于追溯，不直接驱动当前开发：

- `erp-web-finance-module-design.md`：独立财务模块的旧设计；该模块已退出当前产品范围。
- `erp-web-optimization-backlog.md`：早期方案池。
- `erp-web-module-page-map.md`、`erp-web-system-design-master.md`：早期模块与系统规划。
- `production-quality-frontend-handoff.md`：2026-07-08 的专项交接，已被当前交接替代。
- `six-module-ui-consistency-audit.md`、`erp-web-seven-module-business-audit.md` 及带日期的审计文档：阶段验收证据。
- `erp-web-page-audit-ledger.md`、`erp-web-sales-purchase-closure-ledger.md`：历史验收台账。

历史文档中出现的独立财务、资产采购、资产台账、旧字段或旧页面入口，不得因仍有文字记录而恢复。

## 5. 文档维护规则

- 新业务决定优先写入蓝图或事实模型，并明确它替代、废止或补充哪一条旧规则。
- 实现并验证后再更新交接文档；未验证的设想只进入方案或待办，不写成“已完成”。
- 交接文档顶部快照必须同步最新有效章节号、近期修复和真实未完成事项。
- 文档使用仓库相对路径，不依赖某台电脑的绝对目录。
- 审计记录只保存证据，不自动升级为产品规则。
- 删除历史资料前先确认其信息已被当前文档吸收；首次 Git 快照前以保留并标记历史为主。
