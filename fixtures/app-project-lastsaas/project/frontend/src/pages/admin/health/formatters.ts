export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function statusColor(value: number, warning: number, critical: number): string {
  if (value >= critical) return 'text-red-400';
  if (value >= warning) return 'text-yellow-400';
  return 'text-emerald-400';
}

export function statusBg(value: number, warning: number, critical: number): string {
  if (value >= critical) return 'bg-red-500/20';
  if (value >= warning) return 'bg-yellow-500/20';
  return 'bg-emerald-500/20';
}
