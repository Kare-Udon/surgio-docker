# surgio-docker
a docker image for surgio.

### 说明
使用docker快速搭建[surgio](https://github.com/surgioproject/surgio)托管API并启动web服务：

+ web网关监听HTTP端口为`3000`;
+ 使用[surgio-store](https://github.com/geekdada/create-surgio-store)的默认配置;
+ 挂载自定义配置到`/var/config`目录下，将覆盖默认配置中对应的文件;
+ 具体启动方式可参考`docker-compose.yml`;
+ DockerHub地址:[quericy/surgio-docker](https://hub.docker.com/r/quericy/surgio-docker/tags)

### 更新
由于DockerHub builds转收费，将不定期更新surgio对应的release版本，tag版本号与Surgio的版本对应。

### 官方文档
[https://surgio.royli.dev/guide/advance/api-gateway.html](https://surgio.royli.dev/guide/advance/api-gateway.html)


### 问题反馈
[https://github.com/quericy/surgio-docker/issues](https://github.com/quericy/surgio-docker/issues)
