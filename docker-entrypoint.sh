#!/bin/bash
set -euo pipefail

# 设置时区；配置快照和网关进程由运行时管理。
ln -sf "/usr/share/zoneinfo/${TZ:-Asia/Shanghai}" /etc/localtime
echo "${TZ:-Asia/Shanghai}" > /etc/timezone

exec node /surgio/runtime.mjs
