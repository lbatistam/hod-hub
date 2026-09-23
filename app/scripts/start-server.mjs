import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(projectRoot, 'data');

function serverIsReady() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 8787 });
    const finish = (ready) => {
      socket.destroy();
      resolve(ready);
    };
    socket.setTimeout(600, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

if (!(await serverIsReady())) {
  mkdirSync(dataDir, { recursive: true });
  const output = openSync(path.join(dataDir, 'hod-hub.log'), 'a');
  const errors = openSync(path.join(dataDir, 'hod-hub-error.log'), 'a');
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: projectRoot,
    detached: true,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', output, errors]
  });
  child.unref();
  closeSync(output);
  closeSync(errors);
}
