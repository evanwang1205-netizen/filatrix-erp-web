# Filatrix ERP Web

Filatrix ERP Web 是面向销售、采购、仓库、生产、质检、设备和基础资料等业务的 ERP 原型。当前使用 Vue/Vite 前端、本地 Node API 和 JSON 数据载体验证业务对象、流程、状态、权限与交互；正式运行前仍需迁移到关系型数据库和事务模型。

当前产品不设置独立财务模块、资产采购或资产台账。销售保留开票与回款商务跟进，采购保留收票与付款商务跟进；设备主档只表达生产资源身份，设备巡检位于独立设备模块。

## 项目权威文档

先阅读 [文档地图](./docs/README.md)，再按以下顺序读取核心文档：

1. [ERP Web 原型优化蓝图](./docs/erp-web-prototype-blueprint.md)
2. [ERP Web 业务事实模型](./docs/erp-web-business-fact-model.md)
3. [新对话交接](./docs/erp-web-next-session-handoff.md)

发生冲突时，用户最新明确决定优先，其次以前两份文档为最高项目依据；交接文档负责说明当前实现、验证结果和下一步。`docs/frontend-design.md` 只提供前端视觉与组件参考，不能覆盖业务蓝图或事实模型。

## 本地开发

先安装依赖：

```bash
npm ci
```

然后分别启动 API 和前端：

```bash
npm run api
```

```bash
npm run dev:5174
```

常用验证：

```bash
npm run audit:ui
npm run smoke:flow
npm run smoke:frontend
npm run build
```

其余按模块划分的烟测命令见 `package.json`。`smoke:flow` 使用隔离数据文件和临时端口。`smoke:api` 包含写入操作，默认指向主数据；只能在明确配置隔离 API 与数据后运行。其他脚本也应先核对其数据路径。

本地默认：

- 前端：`http://127.0.0.1:5174`
- API：`http://127.0.0.1:5175/api`
- 数据文件：`server/data/erp-data.json`

`server/data/erp-data.json` 是当前共享测试数据快照，会随私有 Git 仓库迁移，便于新电脑直接继承现有订单、库存、生产和质检状态。旧备份与临时文件不提交。除非明确要求，不要重置现有数据，也不要改动已经验收的 PDF 或打印模板；将来接入真实业务数据前必须重新评估版本控制与隐私策略。

## 换电脑或 Codex 账号继续

克隆仓库、安装依赖并把仓库根目录添加为 Codex 项目主文件夹。根目录 `AGENTS.md` 会提供稳定的阅读和验证约束；业务内容仍以前两份最高依据为准，不依赖旧账号聊天记录。

克隆、启动、同步代码与测试数据的步骤见 [Git 迁移说明](./docs/git-migration.md)。

## 构建

```bash
npm run build
```

构建产物在 `dist/`，后续可以部署到阿里云 ECS + Nginx、Docker 容器，或 OSS + CDN。

## 阿里云部署

项目内已提供 Docker/Nginx 部署骨架：

```bash
cp .env.example .env
docker compose -f docker-compose.aliyun.yml --env-file .env up -d --build
```

详细步骤见 [docs/aliyun-deployment.md](./docs/aliyun-deployment.md)。
