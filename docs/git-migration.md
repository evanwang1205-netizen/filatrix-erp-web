# Git 与跨电脑接续

仓库：`https://github.com/evanwang1205-netizen/filatrix-erp-web.git`

## 新电脑首次启动

安装 Git 与 Node.js，登录有仓库读取权限的 GitHub 账号。Codex 账号和 GitHub 身份相互独立；私有仓库需要 GitHub 授权才能克隆。

本次迁移前验证环境：Node.js `v24.16.0`、npm `11.13.0`。依赖锁文件使用 `registry.npmjs.org`，不依赖原电脑的私有包源。

```powershell
git clone https://github.com/evanwang1205-netizen/filatrix-erp-web.git
cd filatrix-erp-web
npm.cmd ci
```

在两个终端分别执行 `npm.cmd run api` 和 `npm.cmd run dev:5174`，打开 `http://127.0.0.1:5174`。保留 `server/data/erp-data.json`；它包含本次迁移的测试业务状态。打开仓库根目录作为 Codex 项目，先读 `AGENTS.md`、文档地图和当前交接。

## 测试数据的传递边界

- Git 会同步提交时的快照，不会实时同步两台机器的订单或库存操作。
- 只跟踪 `server/data/erp-data.json`，不跟踪旧备份、临时写入文件、日志或 `.env`。
- 同一时间以一台电脑为业务数据编辑端。切换电脑前暂停该端的业务操作并停止 API，检查 JSON 差异，提交推送；另一端停止 API、保存自身改动后再拉取并重启。
- 如果两边都已修改 JSON，先把各自文件复制到仓库之外备份；不要直接选择全部覆盖或把冲突文本当作有效 JSON 运行。
- 现有数据由用户确认为测试数据。将来使用真实客户、供应商、员工或认证数据前，重新制定隐私和备份策略；仅加入 `.gitignore` 不会删除已有 Git 历史。

## 日常同步

开工前检查工作区，干净时拉取：

```powershell
git status
git pull --ff-only
```

完成工作后先看差异并验证，再按本次实际修改选择文件暂存。不要强制推送，也不要用硬重置解决工作区或数据冲突。

```powershell
git diff --stat
git diff -- server/data/erp-data.json
git add <本次确认的文件路径>
git diff --cached --stat
git commit -m "描述本次修改"
git push
```

`git pull --ff-only` 拒绝合并时说明两端历史已分叉，应检查两边提交再处理。仓库访问失败则先检查 GitHub 登录和仓库协作者权限；不要把 Token 写进远程 URL、源码或聊天记录。

## 验证范围

常用检查为 `npm.cmd run audit:ui`、`npm.cmd run smoke:frontend` 和 `npm.cmd run build`。库存相关变更可运行已使用临时文件/端口的 `smoke:warehouse`；具体以脚本为准。

`smoke:api` 并非只读，默认使用主数据与 5175 API。运行前必须为它准备隔离 API 和数据，并同时设置 `FILATRIX_DATA_FILE` 与 `FILATRIX_SMOKE_API_BASE`。

2026-09-16 本机迁移前已通过：215 项 UI 一致性审计、前端烟测、类型检查与 Vite 构建、隔离仓库业务烟测。上述检查前后主测试数据 SHA-256 均为 `C701EEC5A7ACF5AB33C277191F32FD23AE785B2649448EA90263549CD7186B36`。本次未重跑全部历史业务场景，也未在另一台实体电脑验证。
