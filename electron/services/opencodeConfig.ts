// Writes the project opencode.json that points OpenCode at GenieX.
// Kept separate from opencodeRuntime to avoid a circular import with inferenceRuntime.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GENIEX_OPENAI_BASE_URL } from '@shared/types';
import { getSettings } from './storageConfig';

export const OPENCODE_PORT = 4096;
export const OPENCODE_URL = `http://127.0.0.1:${OPENCODE_PORT}`;
const PROVIDER_ID = 'geniex';

export function writeOpenCodeConfig(modelName: string, projectDir: string): void {
  const configPath = path.join(projectDir, 'opencode.json');
  let existing: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    }
  } catch {
    existing = {};
  }

  const providerBlock = {
    npm: '@ai-sdk/openai-compatible',
    name: 'GenieX (local NPU)',
    options: {
      baseURL: GENIEX_OPENAI_BASE_URL,
      apiKey: 'geniex',
    },
    models: {
      [modelName]: {
        name: modelName,
      },
    },
  };

  const providers = {
    ...((existing.provider as Record<string, unknown> | undefined) ?? {}),
    [PROVIDER_ID]: providerBlock,
  };

  const next = {
    ...existing,
    $schema: 'https://opencode.ai/config.json',
    model: `${PROVIDER_ID}/${modelName}`,
    provider: providers,
    server: {
      ...((existing.server as Record<string, unknown> | undefined) ?? {}),
      port: OPENCODE_PORT,
      hostname: '127.0.0.1',
    },
  };

  fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  // Optional auth file some OpenCode versions look for.
  const authDir = path.join(os.homedir(), '.local', 'share', 'opencode');
  const authPath = path.join(authDir, 'auth.json');
  try {
    fs.mkdirSync(authDir, { recursive: true });
    let auth: Record<string, unknown> = {};
    if (fs.existsSync(authPath)) {
      auth = JSON.parse(fs.readFileSync(authPath, 'utf8')) as Record<string, unknown>;
    }
    auth[PROVIDER_ID] = { type: 'api', key: 'geniex' };
    fs.writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`, 'utf8');
  } catch {
    // ponytail: config apiKey is usually enough
  }
}

/** Keep opencode.json in sync when the active GenieX model changes. */
export function syncOpenCodeModel(modelName: string | null): void {
  const projectDir = getSettings().projectDir;
  if (!modelName || !projectDir || !fs.existsSync(projectDir)) return;
  try {
    writeOpenCodeConfig(modelName, projectDir);
  } catch {
    // non-fatal
  }
}
