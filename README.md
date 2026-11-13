# surgio-docker

Deploy [Surgio](https://github.com/surgioproject/surgio) & API Gateway with Docker & Docker Compose.

[中文文档](./README_CN.md)

## Documentation

### How to start

Clone this repository or just download the `docker-compose.yml` file.

Create a `config` folder in the directory where the `docker-compose.yml` file is located.

Place your Surgio configuration file in the `config` directory.

For Surgio v4, include `surgio.project.ts`, its imported modules and the `template` folder. Register providers explicitly in the project. The config mount is read-only; runtime dependencies come from the image.

Then run the following command to start the service.

```bash
docker-compose up -d
```

The configuration you provided will automatically be loaded into the container.

Access `http://localhost:23000`, you should be able to see the welcome page of Surgio.

### How to configure

#### Update my configuration

Update files or run `git pull` in `config`. The container checks the contents every second and waits for two matching checks. It creates a snapshot, runs `surgio generate`, then restarts its gateway process. No manual container restart is needed; the gateway switch briefly interrupts requests.

Generation failures keep the old gateway running. Gateway startup failures restore the previous snapshot. Changes during validation discard the candidate. Git metadata, dependencies and generated directories (`dist`, `.surgio`, `.cache`) are ignored. Snapshots and generated files stay inside the container; rollback is available during the current process lifetime.

After selecting user configuration, an empty or missing source directory retains the old configuration. Image defaults are used only before any user configuration is selected. File symlinks are copied as regular files to isolate snapshots; directory symlinks are unsupported.

The image owns the gateway entrypoint: config repository `gateway.js`, `server.js` and package startup scripts are not executed. Install extra npm dependencies in a custom image. Recreate the container once when upgrading to this version:

```bash
docker compose up -d --build --force-recreate
```

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

Remove `AUTOGEN_INTERVAL` to disable scheduled generation; file changes still reload automatically. Use `AUTOGEN_INTERVAL: 1h` without literal quote characters. Generation is limited to 120 seconds; failures retain the old configuration until the next interval or file update.

## Upgrading from Surgio v3

The image uses Node.js 26 LTS, Surgio 4 and Gateway 3. Supported platforms are `linux/amd64` and `linux/arm64`; ARM v6/v7 are no longer available in the Node 26 Alpine image.

Migrate your configuration repository before updating production. Follow the [official v4 migration guide](https://surgio.js.org/guide/upgrade-guide-v4), keeping a backup and baseline output. Key changes include ESM projects with explicit providers; Node-only options in `nodeOptions()`; Gateway's new `@surgio/gateway/node` entrypoint; Mihomo as the default Clash core; removal of old protocol switches; Fetch-based HTTP clients; renamed S3 credentials; strict upload/cache validation; and removal of legacy providers and outputs. Existing v3 caches are not migrated.

The image sets `NODE_USE_ENV_PROXY=1` so Node handles supplied proxy variables. See the [Chinese documentation](./README_CN.md) for the detailed checklist.

## Validation

```bash
node --test tests/runtime.test.mjs
docker build --pull -t surgio-docker:v4-local .
node tests/docker-smoke.mjs
```

The smoke test uses temporary config and an isolated container to exercise real generation, HTTP, reload and invalid-config recovery without accessing user subscriptions.

## Docker Image Update Time

Each time the Surgio version is updated, the Docker image is automatically updated. (It may take up to a day to release.)

## Surgio Official Documentation

[https://surgio.js.org/guide/advance/api-gateway](https://surgio.js.org/guide/advance/api-gateway)


## Any Issues?

[https://github.com/Kare-Udon/surgio-docker/issues](https://github.com/Kare-Udon/surgio-docker/issues)
