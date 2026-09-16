# 阿里云 ECS 部署说明

这一版部署目标是先让系统在阿里云 ECS 上可用：

- `filatrix-web`：Nginx 托管 Vite 构建产物，并把 `/api` 反向代理到 API。
- `filatrix-api`：Node.js 本地 API，数据写入 Docker volume `/data/erp-data.json`。
- 以后如果切换到 RDS 或正式后端，可以保留前端和 Nginx 入口，只替换 API 服务。

## 服务器准备

建议先用一台 Ubuntu 22.04 或 Alibaba Cloud Linux ECS。

安全组至少放行：

- `80/tcp`：Web 访问。
- `443/tcp`：后续配置 HTTPS 时使用。
- `22/tcp`：SSH 管理，建议限制来源 IP。

服务器安装 Docker 和 Docker Compose v2 后，把项目代码放到服务器，例如：

```bash
cd /opt
git clone <your-repo-url> filatrix-erp-web
cd filatrix-erp-web
cp .env.example .env
```

## 启动

```bash
docker compose -f docker-compose.aliyun.yml --env-file .env up -d --build
```

访问：

```text
http://<ECS 公网 IP>/
```

健康检查：

```bash
curl http://127.0.0.1/api/health
docker compose -f docker-compose.aliyun.yml ps
```

也可以在服务器项目目录运行只读冒烟检查：

```bash
FILATRIX_SMOKE_API_BASE=http://127.0.0.1/api npm run smoke:api
```

发布前建议再跑一次临时写入型流程检查，它会自建临时数据文件，不影响正在运行的业务数据：

```bash
npm run smoke:flow
```

前端路由、菜单、关联候选弹窗和部署骨架可用静态检查快速确认：

```bash
npm run smoke:frontend
```

## 数据持久化

业务数据保存在 Docker volume：

```text
filatrix_erp_data:/data/erp-data.json
```

备份：

```bash
docker run --rm -v filatrix_erp_data:/data -v "$PWD/backup:/backup" alpine \
  sh -c 'cp /data/erp-data.json /backup/erp-data-$(date +%Y%m%d-%H%M%S).json'
```

恢复前先停止服务：

```bash
docker compose -f docker-compose.aliyun.yml down
docker run --rm -v filatrix_erp_data:/data -v "$PWD/backup:/backup" alpine \
  cp /backup/erp-data.json /data/erp-data.json
docker compose -f docker-compose.aliyun.yml up -d
```

## 更新版本

```bash
git pull
docker compose -f docker-compose.aliyun.yml --env-file .env up -d --build
```

## HTTPS

第一版 compose 只开放 HTTP。正式使用建议在 ECS 上用其中一种方式加 HTTPS：

- 阿里云负载均衡 SLB/ALB 终止 HTTPS，再转发到 ECS 80 端口。
- 在 ECS 上运行 certbot，为域名签发证书后扩展 Nginx 配置。

## 当前边界

- 这是一版可用的轻量部署，API 使用 JSON 文件持久化，适合早期业务试用和流程验证。
- 生产、质检、报表模块仍按当前目标排除，不作为本轮部署验收范围。
- 后续多人并发、权限审计、数据库事务、对象存储附件等，需要在正式后端阶段继续加强。
