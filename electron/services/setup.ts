// First-run flow: detect whether the `geniex` CLI is installed, and if not,
// download the Windows ARM64 installer and run it silently.
//
// Confirmed empirically: the installer (Inno Setup) supports
// /VERYSILENT /SUPPRESSMSGBOXES /NORESTART with no GUI popup.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { findGeniexPath, resetGeniexPathCache, getGeniexVersion } from './geniexCli';
import type { CliSetupState } from '@shared/types';

const INSTALLER_URL =
  'https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-geniex/geniex-cli.exe';
const INSTALLER_SHA256_URL = `${INSTALLER_URL}.sha256`;

export async function getCliSetupState(): Promise<CliSetupState> {
  const bin = await findGeniexPath();
  if (!bin) {
    return { installed: false, version: null, installing: false, progressMessage: null, error: null };
  }
  const version = await getGeniexVersion();
  return {
    installed: true,
    version: version?.cliVersion ?? null,
    installing: false,
    progressMessage: null,
    error: null,
  };
}

async function downloadFile(url: string, destPath: string, onProgress: (msg: string) => void): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  const total = Number(res.headers.get('content-length') ?? 0);
  let received = 0;
  const fileHandle = await fsp.open(destPath, 'w');
  const writer = fileHandle.createWriteStream();

  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (total > 0) {
      const pct = Math.round((received / total) * 100);
      onProgress(`Downloading GenieX CLI installer… ${pct}%`);
    }
    await new Promise<void>((resolve, reject) => {
      writer.write(value, (err) => (err ? reject(err) : resolve()));
    });
  }
  await new Promise<void>((resolve) => writer.end(resolve));
  await fileHandle.close();
}

async function verifySha256(filePath: string, expectedHex: string): Promise<boolean> {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  return hash.digest('hex').toLowerCase() === expectedHex.toLowerCase();
}

export async function installCli(onProgress: (state: CliSetupState) => void): Promise<CliSetupState> {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'geniex-install-'));
  const installerPath = path.join(tmpDir, 'geniex-cli.exe');

  const emit = (progressMessage: string) =>
    onProgress({ installed: false, version: null, installing: true, progressMessage, error: null });

  try {
    emit('Downloading GenieX CLI installer…');
    await downloadFile(INSTALLER_URL, installerPath, emit);

    emit('Verifying installer checksum…');
    try {
      const shaRes = await fetch(INSTALLER_SHA256_URL);
      if (shaRes.ok) {
        const shaText = (await shaRes.text()).trim();
        const expectedHex = shaText.split(/\s+/)[0];
        const ok = await verifySha256(installerPath, expectedHex);
        if (!ok) throw new Error('Installer checksum verification failed');
      }
    } catch (err) {
      // Checksum file may be unavailable; don't hard-fail the whole install
      // over a missing .sha256, but do surface a real mismatch.
      if (err instanceof Error && err.message.includes('checksum verification failed')) throw err;
    }

    emit('Installing GenieX CLI…');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(installerPath, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], {
        stdio: 'ignore',
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Installer exited with code ${code}`));
      });
    });

    resetGeniexPathCache();
    const version = await getGeniexVersion();
    const finalState: CliSetupState = {
      installed: true,
      version: version?.cliVersion ?? null,
      installing: false,
      progressMessage: null,
      error: null,
    };
    onProgress(finalState);
    return finalState;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finalState: CliSetupState = {
      installed: false,
      version: null,
      installing: false,
      progressMessage: null,
      error: message,
    };
    onProgress(finalState);
    return finalState;
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
