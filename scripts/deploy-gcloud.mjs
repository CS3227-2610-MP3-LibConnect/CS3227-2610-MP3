import { spawnSync } from 'node:child_process';

const projectId = 'libconnect-78904';
const region = 'asia-southeast1';
const registryHost = `${region}-docker.pkg.dev`;
const imagePath = `${registryHost}/${projectId}/libconnect/junhongkan/libconnect`;
const version = '1.0';
// const version = new Date().toISOString().replace(/\D/gu, '').slice(0, 14);
const image = `${imagePath}:deploy-${version}`;

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    // gcloud and Docker are commonly installed as .cmd launchers on Windows.
    shell: process.platform === 'win32',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.info(`Deploying ${image} to Cloud Run service libconnect...`);
run('gcloud', ['auth', 'configure-docker', registryHost]);
run('docker', [
  'buildx',
  'build',
  '--platform',
  'linux/amd64',
  '--provenance=false',
  '--tag',
  image,
  '--push',
  '.',
]);
run('gcloud', [
  'run',
  'deploy',
  'libconnect',
  '--image',
  image,
  '--region',
  region,
  '--project',
  projectId,
]);
