import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

import { parseInterval, startSupervisor } from '../runtime.mjs';

async function until(check) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {}
    await delay(30);
  }
  assert.fail('等待配置重载超时');
}

test('自动重载与失败恢复', { timeout: 60000 }, async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'surgio-reload-test-'));
  const configDir = path.join(root, 'config');
  const workDir = path.join(root, 'runtime');
  const defaultDir = path.join(root, 'defaults');
  await mkdir(configDir);
  await mkdir(defaultDir);
  await writeFile(path.join(defaultDir, 'config.json'), '{"version":999}');
  await writeFile(path.join(defaultDir, 'template.tpl'), '示例模板');
  await writeFile(path.join(configDir, 'config.json'), '{"version":1}');
  await writeFile(path.join(configDir, 'template.tpl'), '模板一');
  const generator = path.join(root, 'generate.mjs');
  const gateway = path.join(root, 'gateway.mjs');
  await writeFile(generator, `
    import { mkdir, readFile, writeFile } from 'node:fs/promises';
    const config = JSON.parse(await readFile('config.json', 'utf8'));
    await new Promise((resolve) => setTimeout(resolve, config.delayMs || 0));
    if (config.files) {
      await mkdir('dist');
      await Promise.all(Array.from({ length: config.files }, (_, i) => writeFile('dist/' + i, 'test')));
    }
    await writeFile('output.txt', await readFile('template.tpl', 'utf8'));
  `);
  await writeFile(gateway, `
    import { readFile, writeFile } from 'node:fs/promises';
    import { createServer } from 'node:http';
    const config = JSON.parse(await readFile('config.json', 'utf8'));
    if (config.startFail) process.exit(1);
    const output = await readFile('output.txt', 'utf8');
    if (config.startDelayMs) {
      await writeFile(${JSON.stringify(path.join(root, 'pending-start'))}, 'starting');
      await new Promise((resolve) => setTimeout(resolve, config.startDelayMs));
    }
    const server = createServer((req, res) => res.end(JSON.stringify({ ...config, output })));
    server.listen(0, '127.0.0.1', () => {
      process.send({ ready: true, port: server.address().port, directory: process.cwd() });
      if (config.exitAfterReady) setTimeout(() => process.exit(7), 10);
    });
  `);
  const messages = [];
  const supervisor = await startSupervisor({
    configDir,
    defaultDir,
    workDir,
    generateCommand: [process.execPath, generator],
    gatewayCommand: [process.execPath, gateway],
    pollInterval: 40,
    generateInterval: 0,
    log: (message) => messages.push(message),
  });
  t.after(async () => {
    await supervisor.close();
    await rm(root, { recursive: true, force: true });
  });
  const response = async () => {
    const res = await fetch(`http://127.0.0.1:${supervisor.address.port}`);
    return res.json();
  };

  await t.test('首次生成后启动网关', async () => {
    assert.deepEqual(await response(), { version: 1, output: '模板一' });
  });
  await t.test('配置修改自动生效，不写回源目录', async () => {
    await writeFile(path.join(configDir, 'config.json'), '{"version":2}');
    await until(async () => (await response()).version === 2);
    await assert.rejects(readFile(path.join(configDir, 'output.txt')), { code: 'ENOENT' });
  });
  await t.test('模板修改也会重载', async () => {
    await writeFile(path.join(configDir, 'template.tpl'), '模板二');
    await until(async () => (await response()).output === '模板二');
  });
  await t.test('连续文件写入合并成一次重载', async () => {
    const count = messages.filter((message) => message.includes('网关已就绪')).length;
    await writeFile(path.join(configDir, 'config.json'), '{"version":20}');
    await writeFile(path.join(configDir, 'config.json'), '{"version":2}');
    await writeFile(path.join(configDir, 'template.tpl'), '合并更新');
    await until(async () => (await response()).output === '合并更新');
    await delay(150);
    assert.equal(messages.filter((message) => message.includes('网关已就绪')).length, count + 1);
  });
  await t.test('忽略 Git 元数据和生成目录', async () => {
    const count = messages.length;
    await mkdir(path.join(configDir, '.git'));
    await writeFile(path.join(configDir, '.git', 'index'), 'git 更新');
    await mkdir(path.join(configDir, 'dist'));
    await writeFile(path.join(configDir, 'dist', 'test'), '生成文件');
    await delay(250);
    assert.equal(messages.length, count);
  });
  await t.test('用户配置目录暂时缺失或为空时保留旧服务', async () => {
    const saved = path.join(root, 'saved-config');
    await rename(configDir, saved);
    try {
      await delay(500);
      assert.equal((await response()).version, 2);
      await mkdir(configDir);
      await delay(500);
      assert.equal((await response()).version, 2);
    } finally {
      await rm(configDir, { recursive: true, force: true });
      await rename(saved, configDir);
    }
  });
  await t.test('文件链接在快照中物化，源文件变化不污染旧快照', async () => {
    const count = messages.filter((message) => message.includes('网关已就绪')).length;
    await symlink('template.tpl', path.join(configDir, 'linked.tpl'));
    await until(() => messages.filter((message) => message.includes('网关已就绪')).length > count);
    const filename = path.join(supervisor.address.directory, 'linked.tpl');
    const content = await readFile(filename, 'utf8');
    const failures = messages.filter((message) => message.includes('配置验证失败')).length;
    await writeFile(path.join(configDir, 'config.json'), '无效 JSON');
    await writeFile(path.join(configDir, 'template.tpl'), '未通过验证的模板');
    await until(() => messages.filter((message) => message.includes('配置验证失败')).length > failures);
    assert.equal(await readFile(filename, 'utf8'), content);
    await writeFile(path.join(configDir, 'config.json'), '{"version":2}');
    await until(async () => (await response()).output === '未通过验证的模板');
  });
  await t.test('无效配置保留旧网关，修复后恢复', async () => {
    await writeFile(path.join(configDir, 'config.json'), '无效 JSON');
    await until(() => messages.some((message) => message.includes('配置验证失败')));
    assert.equal((await response()).version, 2);
    await writeFile(path.join(configDir, 'config.json'), '{"version":3}');
    await until(async () => (await response()).version === 3);
  });
  await t.test('新网关启动失败时恢复旧快照', async () => {
    await writeFile(path.join(configDir, 'config.json'), '{"version":4,"startFail":true}');
    await until(() => messages.some((message) => message.includes('已恢复上一份配置')));
    assert.equal((await response()).version, 3);
  });
  await t.test('验证期间再次更新不会启用过时快照', async () => {
    const count = messages.filter((message) => message.includes('正在验证')).length;
    await writeFile(path.join(configDir, 'config.json'), '{"version":5,"delayMs":400}');
    await until(() => messages.filter((message) => message.includes('正在验证')).length > count);
    assert.equal((await response()).version, 3);
    await writeFile(path.join(configDir, 'config.json'), '{"version":6}');
    await until(async () => (await response()).version === 6);
    assert.ok(messages.some((message) => message.includes('配置仍在变化')));
  });
  await t.test('停止时关闭网关', async () => {
    const port = supervisor.address.port;
    const count = messages.filter((message) => message.includes('正在验证')).length;
    await writeFile(path.join(configDir, 'config.json'), '{"version":7,"delayMs":3000}');
    await until(() => messages.filter((message) => message.includes('正在验证')).length > count);
    await supervisor.close();
    await assert.rejects(fetch(`http://127.0.0.1:${port}`));
  });
  await t.test('无文件变化时按间隔重新生成', async () => {
    await writeFile(path.join(configDir, 'config.json'), '{"version":8}');
    const logs = [];
    const scheduled = await startSupervisor({
      configDir, workDir,
      generateCommand: [process.execPath, generator],
      gatewayCommand: [process.execPath, gateway],
      pollInterval: 40,
      generateInterval: 200,
      log: (message) => logs.push(message),
    });
    try {
      await until(() => logs.filter((message) => message.includes('网关已就绪')).length >= 2);
    } finally { await scheduled.close(); }
  });
  await t.test('首次启动无有效配置时明确失败', async () => {
    await writeFile(path.join(configDir, 'config.json'), '无效 JSON');
    await assert.rejects(startSupervisor({
      configDir, workDir,
      generateCommand: [process.execPath, generator],
      gatewayCommand: [process.execPath, gateway],
      log: () => {},
    }), /配置生成命令失败/);
  });
  await t.test('网关启动过程中停止不等待启动超时', async () => {
    await writeFile(path.join(configDir, 'config.json'), '{"version":10}');
    const logs = [];
    const pending = await startSupervisor({
      configDir, workDir,
      generateCommand: [process.execPath, generator],
      gatewayCommand: [process.execPath, gateway],
      pollInterval: 40, generateInterval: 0,
      log: (message) => logs.push(message),
    });
    try {
      await writeFile(path.join(configDir, 'config.json'), '{"version":11,"startDelayMs":4000}');
      await until(async () => await readFile(path.join(root, 'pending-start'), 'utf8') === 'starting');
      const started = Date.now();
      await pending.close();
      assert.ok(Date.now() - started < 1500, '停止不应等待网关延迟启动');
    } finally { await pending.close(); }
  });
  await t.test('复制期间停止后不再启动生成命令', async () => {
    await writeFile(path.join(configDir, 'config.json'), '{"version":20}');
    const logs = [];
    const copying = await startSupervisor({
      configDir, workDir,
      generateCommand: [process.execPath, generator],
      gatewayCommand: [process.execPath, gateway],
      pollInterval: 40, generateInterval: 0,
      log: (message) => logs.push(message),
    });
    try {
      await Promise.all(Array.from({ length: 1500 }, (_, i) => writeFile(path.join(configDir, 'extra-' + i), 'test')));
      await writeFile(path.join(configDir, 'config.json'), '{"version":21,"delayMs":3000}');
      await until(async () => (await readdir(workDir)).length >= 2);
      const count = logs.filter((message) => message.includes('正在验证')).length;
      await copying.close();
      assert.equal(logs.filter((message) => message.includes('正在验证')).length, count,
        '停止不应继续启动生成');
    } finally {
      await copying.close();
      await Promise.all(Array.from({ length: 1500 }, (_, i) => rm(path.join(configDir, 'extra-' + i), { force: true })));
    }
  });
  await t.test('旧快照清理期间新网关退出也会报告致命错误', async () => {
    await writeFile(path.join(configDir, 'config.json'), '{"version":12,"files":3000}');
    const fatal = [];
    const shortLived = await startSupervisor({
      configDir, workDir,
      generateCommand: [process.execPath, generator],
      gatewayCommand: [process.execPath, gateway],
      pollInterval: 40, generateInterval: 0,
      log: () => {}, onFatal: (error) => fatal.push(error),
    });
    try {
      await writeFile(path.join(configDir, 'config.json'), '{"version":13,"exitAfterReady":true}');
      await until(() => fatal.length === 1);
      assert.match(fatal[0].message, /网关意外退出/);
    } finally { await shortLived.close(); }
  });
  await t.test('复制期间源内容变化后恢复也不能启用不一致快照', async () => {
    const filename = path.join(configDir, 'config.json');
    await writeFile(filename, '{"version":30}');
    let interrupt = true;
    const consistent = await startSupervisor({
      configDir, workDir,
      generateCommand: [process.execPath, generator],
      gatewayCommand: [process.execPath, gateway],
      pollInterval: 40, generateInterval: 0,
      log: () => {},
      copyConfig: async (source, destination, options) => {
        const content = await readFile(filename, 'utf8');
        if (interrupt && JSON.parse(content).version === 31) {
          interrupt = false;
          await writeFile(filename, '{"version":32}');
          await cp(source, destination, options);
          await writeFile(filename, content);
        } else await cp(source, destination, options);
      },
    });
    try {
      await writeFile(filename, '{"version":31}');
      await until(async () => {
        const result = await fetch(`http://127.0.0.1:${consistent.address.port}`);
        return (await result.json()).version === 31;
      });
      assert.equal(interrupt, false, '必须实际经过复制期间的源内容变动');
    } finally { await consistent.close(); }
  });
});

test('自动生成间隔按实际时长解析', () => {
  assert.equal(parseInterval('1h30m'), 5400000);
  assert.equal(parseInterval('15m'), 900000);
  assert.equal(parseInterval(undefined), 0);
  assert.throws(() => parseInterval('0m'));
  assert.throws(() => parseInterval('"1h"'));
});
