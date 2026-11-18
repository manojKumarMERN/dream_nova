import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const POLL_INTERVAL_MS = 1000;
const READY_TIMEOUT_MS = 120_000;
const STATE_PATH = path.resolve(process.cwd(), 'e2e', '.stack-state.json');
const LOG_PATH = path.resolve(process.cwd(), 'e2e', 'dev-stack.log');

async function isReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function waitForUrls(urls: readonly string[], child: ChildProcess): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Dev stack exited with code ${String(child.exitCode)}`);
    }
    const results = await Promise.all(urls.map((url) => isReady(url)));
    if (results.every((result) => result)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Dev stack did not become ready within ${String(READY_TIMEOUT_MS)}ms`);
}

export default async function globalSetup(): Promise<void> {
  const child = spawn('pnpm', ['start_nova'], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    detached: process.platform !== 'win32'
  });
  child.stdout?.on('data', (chunk: Buffer) => appendFileSync(LOG_PATH, chunk));
  child.stderr?.on('data', (chunk: Buffer) => appendFileSync(LOG_PATH, chunk));
  writeFileSync(LOG_PATH, '');
  writeFileSync(
    STATE_PATH,
    JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString() })
  );
  await waitForUrls(
    ['http://localhost:3000/api/docs', 'http://localhost:5173', 'http://localhost:5174'],
    child
  );
}
