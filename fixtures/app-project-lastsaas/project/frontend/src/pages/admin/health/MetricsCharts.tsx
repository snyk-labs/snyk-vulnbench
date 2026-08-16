import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  AreaChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { SystemMetric, NodeFilterMode } from '../../../types';
import ChartCard from './ChartCard';
import { formatBytes, formatMs } from './formatters';

interface MetricsChartsProps {
  metrics: SystemMetric[];
  filterMode: NodeFilterMode;
}

const NODE_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444',
  '#10b981', '#ec4899', '#f97316',
];

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function tooltipStyle() {
  return {
    contentStyle: { backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' },
    labelStyle: { color: '#94a3b8' },
  };
}

function groupByNode(metrics: SystemMetric[]): Map<string, SystemMetric[]> {
  const map = new Map<string, SystemMetric[]>();
  for (const m of metrics) {
    const arr = map.get(m.nodeId) || [];
    arr.push(m);
    map.set(m.nodeId, arr);
  }
  return map;
}

function aggregateByTimestamp(metrics: SystemMetric[]): SystemMetric[] {
  const buckets = new Map<string, SystemMetric[]>();
  for (const m of metrics) {
    const key = m.timestamp;
    const arr = buckets.get(key) || [];
    arr.push(m);
    buckets.set(key, arr);
  }
  // For aggregate, average values across nodes at each timestamp.
  // If only one node, passthrough.
  const result: SystemMetric[] = [];
  for (const [, group] of buckets) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const avg = (fn: (m: SystemMetric) => number) =>
      group.reduce((s, m) => s + fn(m), 0) / group.length;
    const sum = (fn: (m: SystemMetric) => number) =>
      group.reduce((s, m) => s + fn(m), 0);
    result.push({
      ...group[0],
      cpu: { usagePercent: avg((m) => m.cpu.usagePercent), numCpu: group[0].cpu.numCpu },
      memory: { usedPercent: avg((m) => m.memory.usedPercent), usedBytes: avg((m) => m.memory.usedBytes), totalBytes: group[0].memory.totalBytes },
      disk: { usedPercent: avg((m) => m.disk.usedPercent), usedBytes: avg((m) => m.disk.usedBytes), totalBytes: group[0].disk.totalBytes },
      http: {
        requestCount: sum((m) => m.http.requestCount),
        latencyP50: avg((m) => m.http.latencyP50),
        latencyP95: avg((m) => m.http.latencyP95),
        latencyP99: avg((m) => m.http.latencyP99),
        statusCodes: group[0].http.statusCodes,
        errorRate4xx: avg((m) => m.http.errorRate4xx),
        errorRate5xx: avg((m) => m.http.errorRate5xx),
      },
      mongo: group[0].mongo,
      goRuntime: {
        numGoroutine: Math.round(avg((m) => m.goRuntime.numGoroutine)),
        heapAlloc: avg((m) => m.goRuntime.heapAlloc),
        heapSys: avg((m) => m.goRuntime.heapSys),
        gcPauseNs: avg((m) => m.goRuntime.gcPauseNs),
        numGC: sum((m) => m.goRuntime.numGC),
      },
      integrations: {
        stripeApiCalls: sum((m) => m.integrations?.stripeApiCalls ?? 0),
        resendEmails: sum((m) => m.integrations?.resendEmails ?? 0),
      },
    });
  }
  return result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

const gridStroke = '#1e293b';
const axisFill = '#64748b';

export default function MetricsCharts({ metrics, filterMode }: MetricsChartsProps) {
  if (metrics.length === 0) {
    return (
      <div className="bg-dark-900/50 border border-dark-800 rounded-2xl p-8 text-center text-dark-400">
        No historical metrics available for this time range.
      </div>
    );
  }

  const { data, nodeIds, isMultiNode } = useMemo(() => {
    const nodeGroups = groupByNode(metrics);
    const ids = Array.from(nodeGroups.keys());
    const multi = filterMode === 'all' && ids.length > 1;

    if (multi) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const timeMap = new Map<string, any>();
      for (const [nodeId, nodeMetrics] of nodeGroups) {
        for (const m of nodeMetrics) {
          if (!timeMap.has(m.timestamp)) {
            timeMap.set(m.timestamp, { time: formatTime(m.timestamp) });
          }
          const row = timeMap.get(m.timestamp)!;
          row[`cpu_${nodeId}`] = m.cpu.usagePercent;
          row[`mem_${nodeId}`] = m.memory.usedPercent;
          row[`disk_${nodeId}`] = m.disk.usedPercent;
          row[`req_${nodeId}`] = m.http.requestCount;
          row[`p50_${nodeId}`] = m.http.latencyP50;
          row[`p95_${nodeId}`] = m.http.latencyP95;
          row[`p99_${nodeId}`] = m.http.latencyP99;
          row[`err5xx_${nodeId}`] = m.http.errorRate5xx;
          row[`mongoCon_${nodeId}`] = m.mongo.currentConnections;
          row[`goroutines_${nodeId}`] = m.goRuntime.numGoroutine;
          row[`heapMB_${nodeId}`] = m.goRuntime.heapAlloc / (1024 * 1024);
          row[`stripeCalls_${nodeId}`] = m.integrations?.stripeApiCalls ?? 0;
          row[`resendEmails_${nodeId}`] = m.integrations?.resendEmails ?? 0;
        }
      }
      const merged = Array.from(timeMap.entries())
        .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
        .map(([, v]) => v);
      return { data: merged, nodeIds: ids, isMultiNode: true };
    }

    const flatData = aggregateByTimestamp(metrics);
    const single = flatData.map((m) => ({
      time: formatTime(m.timestamp),
      cpu: m.cpu.usagePercent,
      mem: m.memory.usedPercent,
      disk: m.disk.usedPercent,
      req: m.http.requestCount,
      p50: m.http.latencyP50,
      p95: m.http.latencyP95,
      p99: m.http.latencyP99,
      err5xx: m.http.errorRate5xx,
      mongoCon: m.mongo.currentConnections,
      goroutines: m.goRuntime.numGoroutine,
      heapMB: m.goRuntime.heapAlloc / (1024 * 1024),
      stripeCalls: m.integrations?.stripeApiCalls ?? 0,
      resendEmails: m.integrations?.resendEmails ?? 0,
    }));
    return { data: single, nodeIds: ids, isMultiNode: false };
  }, [metrics, filterMode]);
  const tt = tooltipStyle();

  function renderLines(prefix: string) {
    if (!isMultiNode) return <Line type="monotone" dataKey={prefix} stroke="#3b82f6" dot={false} strokeWidth={2} />;
    return nodeIds.map((id, i) => (
      <Line key={id} type="monotone" dataKey={`${prefix}_${id}`} stroke={NODE_COLORS[i % NODE_COLORS.length]} dot={false} strokeWidth={1.5} name={id.slice(0, 8)} />
    ));
  }

  function renderAreas(prefix: string, color: string) {
    if (!isMultiNode) return <Area type="monotone" dataKey={prefix} stroke={color} fill={color} fillOpacity={0.2} dot={false} strokeWidth={2} />;
    return nodeIds.map((id, i) => (
      <Area key={id} type="monotone" dataKey={`${prefix}_${id}`} stroke={NODE_COLORS[i % NODE_COLORS.length]} fill={NODE_COLORS[i % NODE_COLORS.length]} fillOpacity={0.1} dot={false} strokeWidth={1.5} name={id.slice(0, 8)} />
    ));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* CPU Usage */}
      <ChartCard title="CPU Usage %">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="time" tick={{ fill: axisFill, fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fill: axisFill, fontSize: 11 }} />
            <Tooltip {...tt} />
            {renderLines('cpu')}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Memory Usage */}
      <ChartCard title="Memory Usage %">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="time" tick={{ fill: axisFill, fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fill: axisFill, fontSize: 11 }} />
            <Tooltip {...tt} />
            {renderLines('mem')}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Disk Usage */}
      <ChartCard title="Disk Usage %">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="time" tick={{ fill: axisFill, fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fill: axisFill, fontSize: 11 }} />
            <Tooltip {...tt} />
            {renderLines('disk')}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Request Rate */}
      <ChartCard title="Request Count (per interval)">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="time" tick={{ fill: axisFill, fontSize: 11 }} />
            <YAxis tick={{ fill: axisFill, fontSize: 11 }} />
            <Tooltip {...tt} />
            {renderAreas('req', '#3b82f6')}
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Latency */}
      <ChartCard title="Latency (ms)">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="time" tick={{ fill: axisFill, fontSize: 11 }} />
            <YAxis tick={{ fill: axisFill, fontSize: 11 }} tickFormatter={(v) => formatMs(Number(v))} />
            <Tooltip {...tt} formatter={(value) => formatMs(Number(value))} />
            {isMultiNode ? (
              nodeIds.map((id, i) => (
                <Line key={id} type="monotone" dataKey={`p95_${id}`} stroke={NODE_COLORS[i % NODE_COLORS.length]} dot={false} strokeWidth={1.5} name={`p95 ${id.slice(0, 8)}`} />
              ))
            ) : (
              <>
                <Line type="monotone" dataKey="p50" stroke="#10b981" dot={false} strokeWidth={1.5} name="p50" />
                <Line type="monotone" dataKey="p95" stroke="#f59e0b" dot={false} strokeWidth={2} name="p95" />
                <Line type="monotone" dataKey="p99" stroke="#ef4444" dot={false} strokeWidth={1.5} name="p99" />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Error Rate */}
      <ChartCard title="Error Rate 5xx %">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="time" tick={{ fill: axisFill, fontSize: 11 }} />
            <YAxis tick={{ fill: axisFill, fontSize: 11 }} />
            <Tooltip {...tt} />
            {renderAreas('err5xx', '#ef4444')}
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* MongoDB Connections */}
      <ChartCard title="MongoDB Connections">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="time" tick={{ fill: axisFill, fontSize: 11 }} />
            <YAxis tick={{ fill: axisFill, fontSize: 11 }} />
            <Tooltip {...tt} />
            {renderLines('mongoCon')}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Go Runtime */}
      <ChartCard title="Go Runtime">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="time" tick={{ fill: axisFill, fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fill: axisFill, fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: axisFill, fontSize: 11 }} tickFormatter={(v) => `${Number(v).toFixed(0)} MB`} />
            <Tooltip {...tt} formatter={(value, name) => String(name).includes('heap') || String(name).includes('Heap') ? formatBytes(Number(value) * 1024 * 1024) : value} />
            {isMultiNode ? (
              nodeIds.map((id, i) => (
                <Line key={`gr_${id}`} yAxisId="left" type="monotone" dataKey={`goroutines_${id}`} stroke={NODE_COLORS[i % NODE_COLORS.length]} dot={false} strokeWidth={1.5} name={`goroutines ${id.slice(0, 8)}`} />
              ))
            ) : (
              <>
                <Line yAxisId="left" type="monotone" dataKey="goroutines" stroke="#8b5cf6" dot={false} strokeWidth={2} name="Goroutines" />
                <Line yAxisId="right" type="monotone" dataKey="heapMB" stroke="#06b6d4" dot={false} strokeWidth={2} name="Heap MB" />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Stripe API Calls */}
      <ChartCard title="Stripe API Calls (per interval)">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="time" tick={{ fill: axisFill, fontSize: 11 }} />
            <YAxis tick={{ fill: axisFill, fontSize: 11 }} allowDecimals={false} />
            <Tooltip {...tt} />
            {renderAreas('stripeCalls', '#8b5cf6')}
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Resend Emails */}
      <ChartCard title="Emails Sent (per interval)">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="time" tick={{ fill: axisFill, fontSize: 11 }} />
            <YAxis tick={{ fill: axisFill, fontSize: 11 }} allowDecimals={false} />
            <Tooltip {...tt} />
            {renderAreas('resendEmails', '#f59e0b')}
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
