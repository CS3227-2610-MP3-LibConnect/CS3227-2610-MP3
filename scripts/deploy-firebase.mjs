import { spawnSync } from 'node:child_process';

const projectId = 'libconnect-78904';
process.env.VITE_API_ORIGIN = `https://${projectId}.web.app`;

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    // npm and Firebase CLI are commonly installed as .cmd launchers on Windows.
    shell: process.platform === 'win32',
    env: process.env,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.info(`Building the client for https://${projectId}.web.app...`);
run('npm', ['run', 'build']);

console.info(`Deploying Firebase Hosting for project ${projectId}...`);
run('firebase', ['deploy', '--only', 'hosting', '--project', projectId]);
