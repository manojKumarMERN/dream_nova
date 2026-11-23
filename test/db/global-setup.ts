import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { assertSafeTestDatabaseUrl, getOptionalAppDatabaseUrl } from './env';

const ROOT = process.cwd();
const SCHEMA_PATH = path.join(ROOT, 'packages', 'db', 'prisma', 'schema.prisma');

function assertSafeRoleName(role: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(role)) {
    throw new Error('DATABASE_URL_TEST_APP username must be a simple PostgreSQL role name');
  }
}

export default async function globalSetup(): Promise<void> {
  const url = assertSafeTestDatabaseUrl();
  const appUrl = getOptionalAppDatabaseUrl();
  const env = {
    ...process.env,
    DATABASE_URL: url,
    DATABASE_URL_TEST: url,
    NOVA_PLATFORM_REPOSITORY: 'prisma'
  };
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const options = {
    cwd: ROOT,
    env,
    stdio: 'inherit' as const,
    shell: process.platform === 'win32'
  };

  execFileSync(pnpm, ['exec', 'prisma', 'generate', '--schema', SCHEMA_PATH], options);
  execFileSync(pnpm, ['exec', 'prisma', 'migrate', 'deploy', '--schema', SCHEMA_PATH], options);

  if (appUrl === undefined) {
    return;
  }

  const role = decodeURIComponent(new URL(appUrl).username);
  assertSafeRoleName(role);
  const { PrismaClient } = await import('@nova/db');
  const admin = new PrismaClient({ datasources: { db: { url } } });
  try {
    const roles = await admin.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ${role}
    `;
    if (roles.length === 0) {
      throw new Error(`DATABASE_URL_TEST_APP role ${role} does not exist`);
    }
    if (roles[0]?.rolsuper === true || roles[0]?.rolbypassrls === true) {
      throw new Error('DATABASE_URL_TEST_APP role must not be superuser or have BYPASSRLS');
    }
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await admin.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`
    );
    await admin.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${role}"`
    );
  } finally {
    await admin.$disconnect();
  }
}
