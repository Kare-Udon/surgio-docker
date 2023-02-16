# surgio-docker

使用 Docker 与 Docker Compose 部署 [Surgio](https://github.com/surgioproject/surgio) 于 Surgio API 网关。

[English Documentation](./README.md)

## 使用文档

### 如何启动 Surgio 服务

克隆这个仓库，或者只下载 `docker-compose.yml` 文件。

在 `docker-compose.yml` 文件所在的目录下，创建一个 `config` 文件夹。

将你的 Surgio 配置文件放在 `config` 目录下。

通常来说，自定义的配置应该有 `surgio.conf.js`，`provider` 文件夹和 `template` 文件夹。

然后运行以下命令启动服务。

```bash
docker-compose up -d
```

你提供的配置将会自动加载到容器中。

访问 `http://localhost:23000`，你应该可以看到 Surgio 的欢迎页面。

### 如何配置 Surgio 服务

#### 更新我的配置

如果你想更新你的自定义配置，你可以替换 `config` 文件夹中的配置文件。

然后运行以下命令重启服务。

```bash
docker-compose restart
```

然后，你可以访问 `http://localhost:23000` 查看更新后的配置。

#### 暴露的端口号

默认情况下，暴露的端口号为 `23000`。

你可以在 `docker-compose.yml` 文件中修改这个设置。

将 `ports` 部分修改为你想要暴露的端口号。（是前面的那个 XD）

#### 自动生成配置的时间间隔

默认情况下，配置会每小时自动生成一次。

你可以在 `docker-compose.yml` 文件中修改这个设置。

将 `environment` 部分中的 `AUTOGEN_INTERVAL` 变量修改为你想要的时间间隔。

变量的格式可以是 `xh`，表示每 `x` 小时，或者 `xm`，表示每 `x` 分钟。你也可以将它们组合起来，例如 `xhym`，表示每 `x` 小时 `y` 分钟。

举个例子，`1h30m` 表示每 1 小时 30 分钟更新一次配置。

如不需要自动生成配置，可以将 `AUTOGEN_INTERVAL` 变量删除。

## Docker Image 更新的时间

每当 Surgio 版本更新时，Docker 镜像都会自动编译更新。（最长可能会迟一天发布）

## Surgio 官方文档

[https://surgio.royli.dev/guide/advance/api-gateway.html](https://surgio.royli.dev/guide/advance/api-gateway.html)


## 有任何问题？

[https://github.com/Kare-Udon/surgio-docker/issues](https://github.com/Kare-Udon/surgio-docker/issues)
