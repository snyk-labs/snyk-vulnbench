import type { SystemMetric } from '../../../types';
import { formatPercent, formatMs, statusColor, statusBg } from './formatters';

interface CurrentStatusPanelProps {
  metrics: SystemMetric[];
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export default function CurrentStatusPanel({ metrics }: CurrentStatusPanelProps) {
  if (metrics.length === 0) {
    return (
      <div className="bg-dark-900/50 border border-dark-800 rounded-2xl p-6 text-center text-dark-400">
        Waiting for metrics...
      </div>
    );
  }

  const cpuAvg = avg(metrics.map((m) => m.cpu.usagePercent));
  const memAvg = avg(metrics.map((m) => m.memory.usedPercent));
  const diskAvg = avg(metrics.map((m) => m.disk.usedPercent));
  const totalRequests = metrics.reduce((sum, m) => sum + m.http.requestCount, 0);
  const p95Avg = avg(metrics.map((m) => m.http.latencyP95));
  const err5xxAvg = avg(metrics.map((m) => m.http.errorRate5xx));

  const cards = [
    { label: 'CPU', value: formatPercent(cpuAvg), color: statusColor(cpuAvg, 70, 90), bg: statusBg(cpuAvg, 70, 90) },
    { label: 'Memory', value: formatPercent(memAvg), color: statusColor(memAvg, 75, 90), bg: statusBg(memAvg, 75, 90) },
    { label: 'Disk', value: formatPercent(diskAvg), color: statusColor(diskAvg, 80, 95), bg: statusBg(diskAvg, 80, 95) },
    { label: 'Requests', value: `${totalRequests}`, color: 'text-primary-400', bg: 'bg-primary-500/20' },
    { label: 'Latency p95', value: formatMs(p95Avg), color: statusColor(p95Avg, 200, 1000), bg: statusBg(p95Avg, 200, 1000) },
    { label: 'Error 5xx', value: formatPercent(err5xxAvg), color: statusColor(err5xxAvg, 1, 5), bg: statusBg(err5xxAvg, 1, 5) },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`${card.bg} border border-dark-800 rounded-2xl p-4 text-center`}
        >
          <p className="text-xs text-dark-400 mb-1">{card.label}</p>
          <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}
