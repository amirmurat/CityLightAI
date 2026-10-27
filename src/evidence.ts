// Evidence uses integer units and ASCII object keys, matching Python and the CLI.
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('Evidence requires safe integer units');
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const keys = Object.keys(object).sort();
    if (keys.some(key => /[^\x00-\x7f]/.test(key))) throw new Error('Evidence requires ASCII keys');
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  throw new Error('Unsupported evidence value');
}

export async function evidenceHash(bundle: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(bundle));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
