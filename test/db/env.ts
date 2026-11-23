function assertSafeDatabaseUrl(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required for database verification`);
  }
  if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
    throw new Error('Database verification must never run with NODE_ENV=production');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid PostgreSQL URL`);
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(`${name} must use the postgres or postgresql protocol`);
  }
  if (parsed.hostname.length === 0 || parsed.username.length === 0) {
    throw new Error(`${name} must include a host and username`);
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (databaseName.length === 0 || !/test/i.test(databaseName)) {
    throw new Error(`${name} must point to a test database whose name contains "test"`);
  }
  if (/^(prod|production)$/i.test(databaseName)) {
    throw new Error(`${name} must not point to a production database`);
  }

  return value;
}

export function assertSafeTestDatabaseUrl(): string {
  return assertSafeDatabaseUrl(
    process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL,
    'DATABASE_URL_TEST'
  );
}

export function getOptionalAppDatabaseUrl(): string | undefined {
  const value = process.env.DATABASE_URL_TEST_APP;
  return value === undefined || value.trim() === ''
    ? undefined
    : assertSafeDatabaseUrl(value, 'DATABASE_URL_TEST_APP');
}
