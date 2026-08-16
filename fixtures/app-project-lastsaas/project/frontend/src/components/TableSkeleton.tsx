interface TableSkeletonProps {
  rows?: number;
  cols?: number;
}

export default function TableSkeleton({ rows = 5, cols = 4 }: TableSkeletonProps) {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex border-b border-dark-800 px-6 py-4 gap-6">
        {Array.from({ length: cols }, (_, i) => (
          <div key={i} className="flex-1 h-3 bg-dark-800 rounded" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex px-6 py-4 gap-6 border-b border-dark-800/50">
          {Array.from({ length: cols }, (_, c) => (
            <div
              key={c}
              className="flex-1 h-3 bg-dark-800/60 rounded"
              style={{ width: c === 0 ? '60%' : '40%' }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
