import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npm, ['run', 'dev:client'], { stdio: 'inherit', env: process.env }),
  spawn(npm, ['run', 'dev:api'], { stdio: 'inherit', env: process.env }),
];

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}

for (const child of children) {
  child.on('error', () => shutdown(1));
  child.on('exit', (code, signal) => {
    if (!shuttingDown && (code ?? 1) !== 0 && signal !== 'SIGTERM') shutdown(code ?? 1);
  });
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
