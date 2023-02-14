#!/bin/bash

# timezone
ln -sf /usr/share/zoneinfo/${TZ:-"Asia/Shanghai"} /etc/localtime
echo ${TZ:-"Asia/Shanghai"} > /etc/timezone

# create gateway
\cp -rf /gateway.js /surgio/

# custom config
config_dir="/var/config"
if [ -d $config_dir ]&&[ "$(ls -A $config_dir)" ];then
    rm -rf /surgio/provider/* /surgio/template/*
    \cp -rf /var/config/* /surgio/
fi

if [ -f /surgio/package.json ];then
    sed -i '/"scripts": {/a "generage": "surgio generate",' /surgio/package.json
fi

# generate rules and run gateway
cd /surgio
npm run generage && node gateway.js
