// Task Manager-style NPU + RAM sampling for the renderer charts.
//
// RAM: Node os.totalmem/freemem.
// NPU: Windows "GPU Engine" Utilization Percentage for the adapter LUID whose
// only engtype is Compute (Hexagon NPU on Snapdragon shows up this way).
// ponytail: DXCore adapter classification would be more correct across vendors;
// Compute-only LUID heuristic is enough for Qualcomm Windows laptops.
//
// NPU is sampled via a long-lived PowerShell Get-Counter loop (not typeperf)
// so newly-started geniex processes show up without restarting the sampler.

import { spawn, execFile, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';
import type { SystemMetricsSnapshot } from '@shared/types';

const execFileAsync = promisify(execFile);

const HISTORY_LEN = 60;
const SAMPLE_MS = 1000;

let npuLuid: string | null | undefined; // undefined = not discovered yet
let npuName: string | null = null;
let sampler: ChildProcess | null = null;
let timer: NodeJS.Timeout | null = null;
let lastNpuPercent: number | null = null;
let npuAvailable = false;
let npuHistory: number[] = [];
let ramHistory: number[] = [];
let listeners: Array<(s: SystemMetricsSnapshot) => void> = [];
let started = false;

export function onSystemMetrics(cb: (s: SystemMetricsSnapshot) => void): () => void {
  listeners.push(cb);
  cb(getSnapshot());
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

export function getSnapshot(): SystemMetricsSnapshot {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const ramPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
  return {
    ts: Date.now(),
    npu: {
      available: npuAvailable,
      name: npuName,
      percent: npuAvailable ? (lastNpuPercent ?? 0) : null,
      history: npuHistory.slice(),
    },
    ram: {
      usedBytes,
      totalBytes,
      percent: ramPercent,
      history: ramHistory.slice(),
    },
  };
}

function emit() {
  const snap = getSnapshot();
  for (const l of listeners) l(snap);
}

function pushHistory(history: number[], value: number): number[] {
  const next =
    history.length >= HISTORY_LEN
      ? history.slice(history.length - HISTORY_LEN + 1)
      : history.slice();
  next.push(value);
  return next;
}

async function discoverNpu(): Promise<{ luid: string; name: string | null } | null> {
  const script = `
$ErrorActionPreference = 'Stop'
$gpu = Get-Counter -ListSet 'GPU Engine'
$byLuid = @{}
foreach ($p in $gpu.PathsWithInstances) {
  if ($p -match 'luid_([^_]+_[^_]+).*engtype_([^)\\\\]+)') {
    $luid = $Matches[1]
    $eng = $Matches[2]
    if (-not $byLuid.ContainsKey($luid)) { $byLuid[$luid] = New-Object System.Collections.Generic.HashSet[string] }
    [void]$byLuid[$luid].Add($eng)
  }
}
$npuLuid = $null
foreach ($k in $byLuid.Keys) {
  $types = @($byLuid[$k])
  if ($types.Count -eq 1 -and $types[0] -eq 'Compute') { $npuLuid = $k; break }
}
$name = $null
$dev = Get-PnpDevice -Class ComputeAccelerator -Status OK -ErrorAction SilentlyContinue |
  Where-Object { $_.FriendlyName -match 'NPU|Hexagon|Neural' } |
  Select-Object -First 1
if ($dev) { $name = $dev.FriendlyName }
if (-not $npuLuid) { Write-Output 'NONE'; exit 0 }
Write-Output ("LUID=$npuLuid")
Write-Output ("NAME=$name")
`;

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 20_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
    );
    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.includes('NONE') || lines.length === 0) return null;
    const luidLine = lines.find((l) => l.startsWith('LUID='));
    const nameLine = lines.find((l) => l.startsWith('NAME='));
    if (!luidLine) return null;
    return {
      luid: luidLine.slice('LUID='.length),
      name: nameLine && nameLine.length > 5 ? nameLine.slice('NAME='.length) : null,
    };
  } catch {
    return null;
  }
}

function startNpuSampler(luid: string) {
  // Long-lived sampler: re-expands wildcard instances each tick so a newly
  // started geniex process is included (typeperf freezes the instance list).
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$path = '\\GPU Engine(*luid_${luid}*)\\Utilization Percentage'
while ($true) {
  try {
    $c = Get-Counter -Counter $path -SampleInterval 1 -MaxSamples 1
    $vals = @($c.CounterSamples | ForEach-Object { $_.CookedValue } | Where-Object { $_ -ne $null })
    if ($vals.Count -eq 0) { Write-Output '0' }
    else {
      $max = ($vals | Measure-Object -Maximum).Maximum
      if ($max -lt 0) { $max = 0 }
      if ($max -gt 100) { $max = 100 }
      Write-Output ([string]([math]::Round($max, 2)))
    }
  } catch {
    Write-Output '0'
    Start-Sleep -Seconds 1
  }
}
`;

  sampler = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
  );

  let buffer = '';
  sampler.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      const n = Number.parseFloat(line.trim());
      if (!Number.isFinite(n)) continue;
      lastNpuPercent = Math.max(0, Math.min(100, n));
    }
  });

  sampler.on('exit', () => {
    sampler = null;
  });
}

function tick() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const ramPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
  ramHistory = pushHistory(ramHistory, ramPercent);

  if (npuAvailable) {
    const npuPercent = lastNpuPercent ?? 0;
    lastNpuPercent = npuPercent;
    npuHistory = pushHistory(npuHistory, npuPercent);
  }

  emit();
}

export async function startSystemMetrics(): Promise<void> {
  if (started) return;
  started = true;

  if (npuLuid === undefined) {
    const found = await discoverNpu();
    if (found) {
      npuLuid = found.luid;
      npuName = found.name;
      npuAvailable = true;
      startNpuSampler(found.luid);
    } else {
      npuLuid = null;
      npuAvailable = false;
      lastNpuPercent = null;
    }
  }

  tick();
  timer = setInterval(tick, SAMPLE_MS);
}

export function stopSystemMetrics(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (sampler) {
    spawn('taskkill', ['/pid', String(sampler.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    sampler = null;
  }
  started = false;
}
