# surgio-docker

Deploy [Surgio](https://github.com/surgioproject/surgio) & API Gateway with Docker & Docker Compose.

[中文文档](./README_CN.md)

## Documentation

### How to start

Clone this repository or just download the `docker-compose.yml` file.

Create a `config` folder in the directory where the `docker-compose.yml` file is located.

Place your Surgio configuration file in the `config` directory.

Normally, it would be `surgio.conf.js`, `provider` folder and `template` folder.

Then run the following command to start the service.

```bash
docker-compose up -d
```

The configuration you provided will automatically be loaded into the container.

Access `http://localhost:23000`, you should be able to see the welcome page of Surgio.

### How to configure

#### Update my configuration

If you want to update your custom configuration, you can simply replace the configuration files in the `config` folder.

Then run the following command to restart the service.

```bash
docker-compose restart
```

Then, you can access `http://localhost:23000` to see the updated configuration.

#### Exposed Ports

By default, the port `23000` is exposed.

You can change this setting in the `docker-compose.yml` file.

Change the `ports` section to the port you want to expose. (the one in the front XD)

#### Auto Generate Artefacts Time Interval

By default, artefacts are generated and updated every hour.

You can change this setting in the `docker-compose.yml` file.

Change the `AUTOGEN_INTERVAL` variable in the `ENVIRONMENT` section to the desired time interval.

Change the `environment` section to the time interval you want.

The format would be `xh` for every `x` hour, or `xm` for every `x` minute. Or you can combine them, like `xhym` for every `x` hour and `y` minute.

For example, `1h30m` means update the artefacts every 1 hour and 30 minutes.

If you don't want to auto generate artefacts, you can just delete the `AUTOGEN_INTERVAL` variable.

## Docker Image Update Time

Each time the Surgio version is updated, the Docker image is automatically updated. (It may take up to a day to release.)

## Surgio Official Documentation

[https://surgio.royli.dev/guide/advance/api-gateway.html](https://surgio.royli.dev/guide/advance/api-gateway.html)


## Any Issues?

[https://github.com/Kare-Udon/surgio-docker/issues](https://github.com/Kare-Udon/surgio-docker/issues)
