import { adminFetch } from './admin-api.mjs';

export async function ensureConnection(env, name) {
  const existing = await adminFetch(env, { method: 'GET', apiPath: '/api/v1/admin/connections' });
  if ((existing.data ?? []).some((connection) => connection.name === name)) return;
  await adminFetch(env, { method: 'POST', apiPath: '/api/v1/admin/connections', body: {
    name,
    host: process.env.HONUA_SAMPLE_DB_HOST ?? 'postgres',
    port: Number(process.env.HONUA_SAMPLE_DB_PORT ?? 5432),
    databaseName: process.env.HONUA_SAMPLE_DB_NAME ?? 'honua_dev',
    username: process.env.HONUA_SAMPLE_DB_USER ?? 'honua_user',
    password: process.env.HONUA_SAMPLE_DB_PASSWORD ?? 'honua_password',
    sslRequired: false,
    sslMode: 'Prefer',
  } });
}
