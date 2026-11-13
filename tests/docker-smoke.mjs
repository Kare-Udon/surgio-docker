import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const docker = async (...args) => (await exec('docker', args, { timeout: 60000 })).stdout.trim();
const root = await mkdtemp(path.join(tmpdir(), 'surgio-docker-smoke-'));
const image = process.argv[2] || 'surgio-docker:v4-local';
let container;
let checks = 0;
const passed = (message) => { checks++; console.log(`通过：${message}`); };
async function until(check) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch {}
    await delay(300);
  }
  throw new Error('等待真实网关更新超时');
}

const project = (name) => `
import { defineCustomProvider, defineSurgioProject, NodeTypeEnum } from 'surgio/project';
export default defineSurgioProject({
  analytics: false,
  urlBase: 'https://example.com/',
  providers: { demo: defineCustomProvider({ nodeList: [{
    nodeName: '${name}', type: NodeTypeEnum.Shadowsocks,
    hostname: '127.0.0.1', port: 12345,
    method: 'aes-128-gcm', password: 'smoke-test-only',
  }] }) },
  artifacts: [{ name: 'smoke.txt', provider: 'demo', template: 'smoke' }],
  gateway: { auth: true, accessToken: 'smoke-admin', viewerToken: 'smoke-viewer' },
});
`;

try {
  await mkdir(path.join(root, 'template'));
  const projectFile = path.join(root, 'surgio.project.ts');
  const templateFile = path.join(root, 'template', 'smoke.tpl');
  await writeFile(projectFile, project('节点一'));
  await writeFile(templateFile, '模板一 {{ nodeList[0].nodeName }}');
  container = await docker('run', '-d', '-p', '127.0.0.1::3000',
    '-v', `${root}:/var/config:ro`, image);
  const port = (await docker('port', container, '3000/tcp')).split(':').at(-1);
  const base = `http://127.0.0.1:${port}`;
  const artifact = async () => {
    const response = await fetch(`${base}/get-artifact/smoke.txt?access_token=smoke-viewer`);
    assert.equal(response.status, 200);
    return response.text();
  };
  await until(async () => (await artifact()).includes('模板一 节点一'));
  passed('Surgio 4 生成结果可通过 Gateway 3 HTTP 读取');
  assert.match(await docker('exec', container, 'node', '--version'), /^v26\./);
  passed('容器运行 Node 26 LTS');
  assert.equal((await fetch(`${base}/get-artifact/smoke.txt`)).status, 401);
  assert.equal((await fetch(base)).status, 200);
  passed('鉴权及前端页面正常');

  await writeFile(projectFile, project('节点二'));
  await until(async () => (await artifact()).includes('节点二'));
  passed('Project 和 Provider 更新自动生效');
  await writeFile(templateFile, '模板二 {{ nodeList[0].nodeName }}');
  await until(async () => (await artifact()).includes('模板二 节点二'));
  passed('模板更新自动生效');

  await writeFile(projectFile, '这是一份无效的 TypeScript 配置');
  await until(async () => (await docker('logs', container)).includes('配置验证失败'));
  assert.ok((await artifact()).includes('模板二 节点二'));
  passed('无效配置保留旧网关');
  await writeFile(projectFile, project('节点三'));
  await until(async () => (await artifact()).includes('节点三'));
  assert.equal(await docker('inspect', container, '--format', '{{.RestartCount}}'), '0');
  assert.deepEqual((await readdir(root)).sort(), ['surgio.project.ts', 'template']);
  passed('修复后自动恢复，容器未重启且源目录未写入生成文件');

  await docker('stop', '--time', '10', container);
  assert.equal(await docker('inspect', container, '--format', '{{.State.ExitCode}}'), '0');
  passed('SIGTERM 正常停止');
  console.log(`真实容器冒烟验证：${checks}/${checks} 通过`);
} catch (error) {
  if (container) console.error(await docker('logs', container));
  throw error;
} finally {
  if (container) await docker('rm', '-f', container);
  await rm(root, { recursive: true, force: true });
}
