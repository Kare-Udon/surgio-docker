FROM node:26-alpine

ARG SURGIO_VERSION=4.0.0

COPY docker-entrypoint.sh /

# 初始化 Surgio v4 配置和运行依赖
RUN  apk add --no-cache bash tzdata && \
     chmod +x /docker-entrypoint.sh && \
     npm init --yes surgio-store@4 surgio && \
     cd /surgio && npm install "surgio@${SURGIO_VERSION}" '@surgio/gateway@^3' && \
     npm prune --omit=dev && \
     mkdir defaults && mv surgio.project.ts template defaults/ && \
     npm cache clean --force

COPY gateway.mjs runtime.mjs /surgio/

WORKDIR /surgio
ENV NODE_USE_ENV_PROXY=1

# 挂载用户配置
VOLUME [ "/var/config"]
ENTRYPOINT [ "/docker-entrypoint.sh" ]
