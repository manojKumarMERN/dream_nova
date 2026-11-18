import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const STATE_PATH = path.resolve(process.cwd(), 'e2e', '.stack-state.json');

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(STATE_PATH)) {
    return;
  }
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as { pid?: number };
  const pid = state.pid;
  if (typeof pid === 'number' && Number.isFinite(pid) && pid > 0) {
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(-pid, 'SIGTERM');
      }
    } catch {
      process.kill(pid, 'SIGTERM');
    }
  }
  rmSync(STATE_PATH, { force: true });
}
