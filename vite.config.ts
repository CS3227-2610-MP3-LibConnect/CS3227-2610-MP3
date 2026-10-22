import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const repositoryRoot = process.cwd();
const clientDirectory = resolve(repositoryRoot, 'apps/client');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repositoryRoot, '');
  const clientPort = Number(env.CLIENT_PORT ?? 5173);
  const clientOrigin = new URL(env.CLIENT_ORIGIN ?? `http://localhost:${clientPort}`);
  if (!Number.isSafeInteger(clientPort) || clientPort < 1 || clientPort > 65535) {
    throw new Error('CLIENT_PORT must be a valid TCP port.');
  }
  if (Number(clientOrigin.port || (clientOrigin.protocol === 'https:' ? 443 : 80)) !== clientPort) {
    throw new Error('CLIENT_ORIGIN port must match CLIENT_PORT.');
  }

  return {
    root: clientDirectory,
    envDir: repositoryRoot,
    plugins: [react()],
    server: {
      host: clientOrigin.hostname,
      port: clientPort,
      strictPort: true,
      cors: { origin: clientOrigin.origin },
    },
    build: {
      rollupOptions: {
        input: {
          app: resolve(clientDirectory, 'index.html'),
          login: resolve(clientDirectory, 'login.html'),
          register: resolve(clientDirectory, 'register.html'),
          loginRegisteredMember: resolve(clientDirectory, 'login-registered-member.html'),
          loginRegisteredLibrarian: resolve(clientDirectory, 'login-registered-librarian.html'),
          loginInvalid: resolve(clientDirectory, 'login-invalid.html'),
          loginDisabled: resolve(clientDirectory, 'login-disabled.html'),
          registerInvalid: resolve(clientDirectory, 'register-invalid.html'),
        },
      },
    },
  };
});
