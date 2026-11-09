import { adminFetch, adminFetchResponse } from '../lib/admin-api.mjs';

export const departments = [
  { name: 'planning', title: 'Planning' },
  { name: 'public-works', title: 'Public Works' },
  { name: 'emergency-management', title: 'Emergency Management' },
  { name: 'service-requests', title: '311' },
];

export async function ensureDepartments(env) {
  const apiPath = '/api/v1/admin/folders';
  for (const department of departments) {
    const { json, headers } = await adminFetchResponse(env, { method: 'GET', apiPath });
    if (json.data.some((folder) => !folder.deleted && folder.metadata?.title === department.title)) continue;
    const etag = headers.get('etag');
    if (!etag) throw new Error('Folder listing did not supply its concurrency ETag');
    await adminFetch(env, { method: 'POST', apiPath,
      headers: { 'If-Match': etag }, body: department });
  }
}
