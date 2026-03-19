# k8swebagent

基于 Docker Compose 部署的 Kubernetes 运维 Agent。

## 运行方式

项目默认采用容器化运行，核心服务包括：

- `k8s-agent-frontend`：前端，容器内由 Nginx 监听 `80`
- `k8s-agent-api`：后端 API，容器内监听 `8080`
- `postgres`：业务数据存储
- `redis`：缓存

## 端口说明

- 前端容器内固定监听 `80`
- 对外访问端口由 `APP_PORT` 决定
- 远端部署脚本 [deploy_remote.ps1](/E:/code/devops/k8s/k8sAgent/deploy/deploy_remote.ps1) 默认写入 `APP_PORT=80`
- 因此标准部署形态下，浏览器直接访问 `http://<host>:80`

`docker-compose.yml` 当前定义如下：

```yaml
ports:
  - "${APP_PORT:-3000}:80"
```

这表示：

- 未设置 `.env` 时，本地容器默认映射到宿主机 `3000`
- 远端部署时，脚本会将 `APP_PORT` 写成 `80`

## 容器化启动

在项目根目录执行：

```sh
docker-compose up -d --build
```

启动后访问：

- 本地未设置 `APP_PORT`：`http://localhost:3000`
- 已设置 `APP_PORT=80`：`http://localhost`

## 远端部署

使用仓库内脚本部署到目标主机：

```powershell
.\deploy\deploy_remote.ps1
```

该脚本默认：

- 将项目同步到远端目录 `/home/soft/k8s/k8sAgent`
- 写入 `.env`
- 设置 `APP_PORT=80`
- 执行 `docker-compose up -d --build k8s-agent-api k8s-agent-frontend`

## 可选前端开发模式

如果只调试前端界面，也可以单独启动 Vite：

```sh
pnpm install
pnpm run dev
```

该模式默认访问：

- `http://localhost:3000`

但这只是前端开发模式，不是项目的标准部署方式。
