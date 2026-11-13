# surgio-docker

使用 Docker 与 Docker Compose 部署 [Surgio](https://github.com/surgioproject/surgio) 于 Surgio API 网关。

[English Documentation](./README.md)

## 使用文档

### 如何启动 Surgio 服务

克隆这个仓库，或者只下载 `docker-compose.yml` 文件。

在 `docker-compose.yml` 文件所在的目录下，创建一个 `config` 文件夹。

将你的 Surgio 配置文件放在 `config` 目录下。

Surgio v4 的配置入口是 `surgio.project.ts`（也支持 `.mts`、`.mjs`、`.js`），并在 Project 中显式注册 Provider。将入口、导入的模块和 `template` 文件夹一起放入 `config`。配置目录只读挂载；依赖由镜像提供，容器不会执行配置仓库的安装或启动脚本。

然后运行以下命令启动服务。

```bash
docker-compose up -d
```

你提供的配置将会自动加载到容器中。

访问 `http://localhost:23000`，你应该可以看到 Surgio 的欢迎页面。

### 如何配置 Surgio 服务

#### 更新我的配置

修改 `config` 中的文件，或者在该目录中执行 `git pull`，即可自动更新，无需重启容器。容器每秒检查一次，连续两次检查内容一致后创建配置快照，先运行 `surgio generate`，通过后再重新启动容器内的网关进程。切换期间会有短暂中断。

生成失败时继续使用旧网关；新网关启动失败时恢复上一份快照。日志中会记录失败原因。源配置在验证期间再次变化时，会丢弃该快照并等待新配置稳定。`.git`、`node_modules`、`dist`、`.surgio` 和 `.cache` 不触发重载。运行快照和生成文件存放在容器内，不写回配置仓库；上一份配置仅在当前容器进程存活期间可恢复。

使用用户配置后，源目录临时为空或不可用时会保留旧配置；只有首次启动且没有用户配置时才使用镜像内的示例。文件符号链接会复制为实际文件，保持快照独立；不支持目录符号链接。

配置仓库中的 `gateway.js`、`server.js` 和 `package.json` 启动脚本不再作为容器入口执行，网关由镜像统一启动。需要的额外 npm 依赖应在自定义镜像中安装。首次迁移到本版本时，仍须重新创建一次容器：

```bash
docker compose up -d --build --force-recreate
```

#### 暴露的端口号

默认情况下，暴露的端口号为 `23000`。

你可以在 `docker-compose.yml` 文件中修改这个设置。

将 `ports` 部分修改为你想要暴露的端口号。（是前面的那个 XD）

#### 自动生成配置的时间间隔

示例 Compose 默认每小时重新生成一次配置，以刷新远程订阅和规则片段。文件变化自动重载独立于此设置。

你可以在 `docker-compose.yml` 文件中修改这个设置。

将 `environment` 部分中的 `AUTOGEN_INTERVAL` 变量修改为你想要的时间间隔。

变量的格式可以是 `xh`，表示每 `x` 小时，或者 `xm`，表示每 `x` 分钟。你也可以将它们组合起来，例如 `xhym`，表示每 `x` 小时 `y` 分钟。

举个例子，`1h30m` 表示每 1 小时 30 分钟更新一次配置。

如不需要定时生成配置，可以删除 `AUTOGEN_INTERVAL`。文件变化仍会自动重载。此变量不要包含字面量引号；示例为 `AUTOGEN_INTERVAL: 1h`。生成命令最多运行 120 秒，失败或超时会保留旧配置，等待下次定时生成或配置变化。

## 从 Surgio v3 升级

镜像使用 Node.js 26 LTS、Surgio 4 和 `@surgio/gateway` 3。Node 26 Alpine 镜像支持 `linux/amd64` 和 `linux/arm64`，不再提供 ARM v6/v7。

请先在自己的配置仓库完成迁移，保留旧配置和生成结果，再升级线上镜像。参见 [官方 v4 升级指南](https://surgio.js.org/guide/upgrade-guide-v4)。主要检查项：

- 使用 ESM 和 `defineSurgioProject`；显式注册 Provider，`output`、`cache`、`upload` 移至具名导出的 `nodeOptions()`。不要同时保留新旧入口。
- Gateway 的旧 `bootstrapServer()` 已移除，容器已改用 `@surgio/gateway/node`。
- 为 Gateway 配置带结尾 `/` 的绝对 `urlBase`，例如 `https://sub.example.com/`。
- Clash 默认核心改为 Mihomo；移除 `enableTuic`、`enableShadowTls`、`enableHysteria2`、`enableVless`。需要旧核心行为时显式设置 `clashCore: 'clash'`。
- 自定义 HTTP 客户端不再使用 Got API。镜像默认设置 `NODE_USE_ENV_PROXY=1`，传入代理变量时由 Node 处理。
- 对象存储凭据环境变量改为 `S3_BACKEND_ACCESS_KEY_ID` 和 `S3_BACKEND_ACCESS_KEY_SECRET`；上传和缓存配置改为严格校验，旧缓存不会迁移。
- SSD、Shadowsocks JSON、BlackSSL Provider、Surge SSR 输出及部分旧字段已删除；sing-box WireGuard 输出改为 `endpoints`，需要 sing-box 1.11+。

## 验证修改

```bash
node --test tests/runtime.test.mjs
docker build --pull -t surgio-docker:v4-local .
node tests/docker-smoke.mjs
```

冒烟测试使用临时配置和独立容器，验证真实 Surgio 生成、Gateway HTTP、自动重载及无效配置恢复，不访问用户订阅。

## Docker Image 更新的时间

每当 Surgio 版本更新时，Docker 镜像都会自动编译更新。（最长可能会迟一天发布）

## Surgio 官方文档

[https://surgio.js.org/guide/advance/api-gateway](https://surgio.js.org/guide/advance/api-gateway)


## 有任何问题？

[https://github.com/Kare-Udon/surgio-docker/issues](https://github.com/Kare-Udon/surgio-docker/issues)
