import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';

/**
 * Object storage adapter. The 'local' driver writes under STORAGE_LOCAL_DIR
 * (development / private review). An S3-compatible driver can implement the
 * same three methods; keys are opaque and never derived from user filenames.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(prefix: string): Promise<void>;
}

const KEY_RE = /^[a-z0-9-]+(\/[a-z0-9._-]+)*$/i;

function localPath(key: string) {
  if (!KEY_RE.test(key) || key.includes('..')) throw new Error('invalid storage key');
  const root = path.resolve(env().STORAGE_LOCAL_DIR);
  const p = path.resolve(root, key);
  if (!p.startsWith(root + path.sep)) throw new Error('invalid storage key');
  return p;
}

const local: StorageDriver = {
  async put(key, data) {
    const p = localPath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data, { mode: 0o640 });
  },
  async get(key) {
    try {
      return await readFile(localPath(key));
    } catch {
      return null;
    }
  },
  async remove(prefix) {
    await rm(localPath(prefix), { recursive: true, force: true });
  },
};

export function storage(): StorageDriver {
  return local;
}
