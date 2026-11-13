import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ignored = new Set(['.git', 'node_modules', 'dist', '.surgio', '.cache', '.DS_Store']);

export function parseInterval(value) {
  if (!value) return 0;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?$/.exec(value);
  const milliseconds = match && (Number(match[1] || 0) * 60 + Number(match[2] || 0)) * 60000;
  if (!milliseconds || milliseconds > 2147483647) {
    throw new Error('AUTOGEN_INTERVAL 必须是正时长，例如 1h、30m 或 1h30m，且不超过 24 天');
  }
  return milliseconds;
}

async function fingerprint(directory) {
  const hash = createHash('sha256');
  async function visit(relative = '') {
    const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (ignored.has(entry.name)) continue;
      const filename = path.join(relative, entry.name);
      if (entry.isSymbolicLink() && (await stat(path.join(directory, filename))).isDirectory()) {
        throw new Error(`配置不支持目录符号链接：${filename}`);
      }
      if (entry.isDirectory()) await visit(filename);
      else {
        hash.update(filename).update('\0');
        hash.update(await readFile(path.join(directory, filename))).update('\0');
      }
    }
  }
  await visit();
  return hash.digest('hex');
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(timer); }
}

export async function startSupervisor({
  configDir = '/var/config',
  defaultDir = '/surgio/defaults',
  workDir = '/surgio/.runtime',
  generateCommand = [process.execPath, '/surgio/node_modules/surgio/bin/run', 'generate'],
  gatewayCommand = [process.execPath, '/surgio/gateway.mjs'],
  copyConfig = cp,
  pollInterval = 1000,
  generateInterval = parseInterval(process.env.AUTOGEN_INTERVAL),
  log = console.log,
  onFatal = (error) => { throw error; },
} = {}) {
  await mkdir(workDir, { recursive: true });
  let current;
  let gateway;
  let pendingGateway;
  let generator;
  let address;
  let observed;
  let attempted;
  let busy = false;
  let userConfigSelected = false;
  let closing = false;
  let operation;
  let timer;
  let nextGeneration = Date.now() + generateInterval;

  async function source() {
    const entries = await readdir(configDir).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    if (entries.some((name) => !ignored.has(name))) {
      userConfigSelected = true;
      return configDir;
    }
    if (userConfigSelected) throw new Error('用户配置目录为空或不可用');
    return defaultDir;
  }

  async function generate(directory) {
    generator = spawn(generateCommand[0], generateCommand.slice(1), {
      cwd: directory, stdio: 'inherit',
    });
    const timeout = setTimeout(() => generator?.kill('SIGKILL'), 120000);
    try {
      const [code] = await once(generator, 'exit');
      if (code !== 0) throw new Error('配置生成命令失败或超时');
    } finally {
      clearTimeout(timeout);
      generator = undefined;
    }
  }

  async function launch(directory) {
    if (closing) throw new Error('管理进程正在停止');
    const child = spawn(gatewayCommand[0], gatewayCommand.slice(1), {
      cwd: directory, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    pendingGateway = child;
    let timeout;
    try {
      await new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('网关启动超时')), 30000);
        child.once('error', reject);
        child.once('exit', (code) => reject(new Error(`网关启动失败：${code}`)));
        child.on('message', (message) => {
          if (message.ready) {
            address = message;
            resolve();
          }
        });
      });
    } catch (error) {
      await stopChild(child);
      throw error;
    } finally {
      clearTimeout(timeout);
      if (pendingGateway === child) pendingGateway = undefined;
    }
    child.once('exit', (code, signal) => {
      if (!closing && gateway === child) {
        onFatal(new Error(`网关意外退出：${code ?? signal}`));
      }
    });
    return child;
  }

  async function activate(directory, hash) {
    const candidate = await mkdtemp(path.join(workDir, 'config-'));
    try {
      await copyConfig(directory, candidate, {
        recursive: true,
        dereference: true,
        filter: (filename) => filename === directory || !ignored.has(path.basename(filename)),
      });
      if (closing) return;
      if (await fingerprint(candidate) !== hash) {
        attempted = undefined;
        log('配置快照与源内容不一致，等待稳定后重试');
        return;
      }
      if (closing) return;
      log('正在验证配置快照');
      await generate(candidate);
      const unchanged = await fingerprint(directory) === hash;
      if (closing || !unchanged) {
        log('配置仍在变化，等待稳定后再重载');
        attempted = undefined;
        return;
      }
      const previousGateway = gateway;
      gateway = undefined;
      await stopChild(previousGateway);
      if (closing) return;
      try {
        gateway = await launch(candidate);
      } catch (error) {
        if (current && !closing) {
          try { gateway = await launch(current); }
          catch (rollbackError) { onFatal(rollbackError); throw rollbackError; }
          log('新网关启动失败，已恢复上一份配置');
        }
        throw error;
      }
      const previous = current;
      current = candidate;
      nextGeneration = Date.now() + generateInterval;
      log('配置已加载，网关已就绪');
      if (previous) await rm(previous, { recursive: true, force: true });
    } finally {
      if (current !== candidate) await rm(candidate, { recursive: true, force: true });
    }
  }

  async function tick(initial = false) {
    if (busy || closing) return;
    busy = true;
    try {
      const directory = await source();
      const hash = await fingerprint(directory);
      if (!initial && observed !== hash) {
        observed = hash;
        return;
      }
      observed = hash;
      const scheduled = generateInterval && Date.now() >= nextGeneration;
      if (!initial && hash === attempted && !scheduled) return;
      attempted = hash;
      nextGeneration = Date.now() + generateInterval;
      await activate(directory, hash);
    } catch (error) {
      log(`配置验证失败，${current ? '继续使用上一份配置' : '尚无可用配置'}：${error.message}`);
      if (initial) throw error;
    } finally {
      busy = false;
    }
  }

  try {
    await tick(true);
  } catch (error) {
    await stopChild(gateway);
    throw error;
  }
  timer = setInterval(() => {
    if (!busy) operation = tick();
  }, pollInterval);

  return {
    get address() { return address; },
    async close() {
      if (closing) return;
      closing = true;
      clearInterval(timer);
      await stopChild(generator);
      await stopChild(pendingGateway);
      await operation;
      await stopChild(gateway);
      if (current) await rm(current, { recursive: true, force: true });
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const supervisor = await startSupervisor({
    onFatal: (error) => { console.error(error.message); process.exit(1); },
  });
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, async () => { await supervisor.close(); process.exit(0); });
  }
}
