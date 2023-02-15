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

# add cron job
if [ $AUTOGEN_INTERVAL ];then
    hour=$(echo "$AUTOGEN_INTERVAL" | grep -oP '\d+(?=h)')
    minute=$(echo "$AUTOGEN_INTERVAL" | grep -oP '\d+(?=m)')
    if [[ -n $hour ]] && [[ -n $minute ]]; then
        cron_time="*/$minute */$hour * * *"
    elif [[ -n $hour ]]; then
        cron_time="0 */$hour * * *"
    elif [[ -n $minute ]]; then
        cron_time="*/$minute * * * *"
    fi
    echo "$cron_time cd /surgio && npx surgio generate" >> /etc/crontabs/root
    crond
fi

# generate rules and run gateway
cd /surgio
npm run generage && node gateway.js
