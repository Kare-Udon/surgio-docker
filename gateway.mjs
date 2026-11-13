import { startServer } from '@surgio/gateway/node';
import { loadSurgioProject } from 'surgio/project';
import { createNodeSurgioRuntime } from 'surgio/runtime/node';

// 在发送就绪通知前加载配置，启动失败时由管理进程恢复旧快照。
const project = await loadSurgioProject(process.cwd());
const runtime = createNodeSurgioRuntime(project);

const server = await startServer({
  runtime,
  hostname: '0.0.0.0',
  port: 3000,
});

process.send?.({ ready: true, port: server.address().port });
