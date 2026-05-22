export interface BlueprintMeta {
  id: string;
  title: string;
  username: string;
  is_public: 0 | 1;
  piece_count: number | null;
  file_size: number | null;
  tags: string[];
  download_count: number;
  rating_count: number;
  snapshot_url: string | null;
  created_at: string;
}

export interface BlueprintDetail extends BlueprintMeta {
  user_id: string;
  blueprint_data: {
    instances: { building_type: string; x: number; y: number; z: number; rotation: number }[];
    placeables: { building_type: string; x: number; y: number; z: number; rx?: number; ry?: number; rz?: number }[];
    pentashields?: { placeable_id: number; scale: [number, number, number] }[];
  } | null;
  rotation_overrides: Record<string, Record<number, number>> | null;
  user_rated: boolean;
}

async function authHeaders(getToken: () => Promise<string | null>): Promise<HeadersInit> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normaliseSnapshotUrl(id: string, url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('snapshots/')) return `/api/blueprints/${id}/snapshot`;
  return url;
}

export async function listBlueprints(
  params: { sort?: 'new' | 'popular' | 'top'; tag?: string; mine?: boolean },
  getToken?: () => Promise<string | null>
): Promise<BlueprintMeta[]> {
  const url = new URL('/api/blueprints', window.location.origin);
  if (params.sort) url.searchParams.set('sort', params.sort);
  if (params.tag) url.searchParams.set('tag', params.tag);
  if (params.mine) url.searchParams.set('mine', 'true');

  const headers = getToken ? await authHeaders(getToken) : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to list blueprints: ${res.status}`);
  const body = await res.json() as { blueprints: BlueprintMeta[] };
  return body.blueprints.map(b => ({ ...b, snapshot_url: normaliseSnapshotUrl(b.id, b.snapshot_url) }));
}

export async function getBlueprint(id: string, getToken?: () => Promise<string | null>): Promise<BlueprintDetail> {
  const headers = getToken ? await authHeaders(getToken) : {};
  const res = await fetch(`/api/blueprints/${id}`, { headers });
  if (!res.ok) throw new Error(`Blueprint not found: ${res.status}`);
  const bp = await res.json() as BlueprintDetail;
  return { ...bp, snapshot_url: normaliseSnapshotUrl(bp.id, bp.snapshot_url) };
}

export async function uploadBlueprint(
  data: { title: string; is_public: boolean; file: File },
  getToken: () => Promise<string | null>
): Promise<{ id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const form = new FormData();
  form.append('title', data.title);
  form.append('is_public', String(data.is_public));
  form.append('file', data.file);

  const res = await fetch('/api/blueprints', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json() as { error: string };
    throw new Error(body.error ?? `Upload failed: ${res.status}`);
  }
  return res.json() as Promise<{ id: string }>;
}

export async function updateBlueprint(
  id: string,
  data: { title?: string; is_public?: boolean; tags?: string[] },
  getToken: () => Promise<string | null>
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`/api/blueprints/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Update failed: ${res.status}`);
}

export async function saveRotationOverrides(
  id: string,
  overrides: Record<string, Record<number, number>> | null,
  getToken: () => Promise<string | null>
): Promise<void> {
  const headers = await authHeaders(getToken);
  const res = await fetch(`/api/blueprints/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rotation_overrides: overrides }),
  });
  if (!res.ok) throw new Error(`Failed to save rotation overrides: ${res.status}`);
}

export async function deleteBlueprint(
  id: string,
  getToken: () => Promise<string | null>
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`/api/blueprints/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export async function downloadBlueprint(
  id: string,
  getToken: () => Promise<string | null>
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`/api/blueprints/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `blueprint_${id}.json`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function uploadSnapshot(
  id: string,
  file: File,
  getToken: () => Promise<string | null>
): Promise<{ snapshot_url: string }> {
  const headers = await authHeaders(getToken);
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/blueprints/${id}/snapshot`, {
    method: 'PUT',
    headers,
    body: form,
  });
  if (!res.ok) throw new Error(`Snapshot upload failed: ${res.status}`);
  return res.json() as Promise<{ snapshot_url: string }>;
}

export async function rateBlueprint(
  id: string,
  getToken: () => Promise<string | null>
): Promise<{ rated: boolean; rating_count: number }> {
  const headers = await authHeaders(getToken);
  const res = await fetch(`/api/blueprints/${id}/rate`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) throw new Error(`Rate failed: ${res.status}`);
  return res.json() as Promise<{ rated: boolean; rating_count: number }>;
}
