import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDataFile = join(rootDir, 'server/data/erp-data.json');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The temporary API may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('temporary master-data API did not become healthy');
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`master-data smoke exited with ${signal || code}`));
    });
  });
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'filatrix-master-data-'));
  const dataFile = join(tempDir, 'erp-data.json');
  await copyFile(sourceDataFile, dataFile);
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const api = spawn(process.execPath, ['server/index.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
      FILATRIX_API_HOST: '127.0.0.1',
      FILATRIX_API_PORT: String(port),
      FILATRIX_DATA_FILE: dataFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let apiLogs = '';
  api.stdout.on('data', (chunk) => { apiLogs += chunk; });
  api.stderr.on('data', (chunk) => { apiLogs += chunk; });

  try {
    await waitForHealth(baseUrl, api);
    const smoke = spawn(process.execPath, ['scripts/smoke-master-data-boundaries.mjs'], {
      cwd: rootDir,
      env: {
        ...process.env,
        FILATRIX_DATA_FILE: dataFile,
        FILATRIX_SMOKE_API_BASE: baseUrl,
      },
      stdio: 'inherit',
    });
    await waitForExit(smoke);
  } catch (error) {
    if (apiLogs) process.stderr.write(apiLogs);
    throw error;
  } finally {
    api.kill('SIGTERM');
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
