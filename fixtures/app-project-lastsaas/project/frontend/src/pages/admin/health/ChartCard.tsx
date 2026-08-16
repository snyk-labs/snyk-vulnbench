interface ChartCardProps {
  title: string;
  children: React.ReactNode;
}

export default function ChartCard({ title, children }: ChartCardProps) {
  return (
    <div className="bg-dark-900/50 backdrop-blur-sm border border-dark-800 rounded-2xl p-5">
      <h3 className="text-sm font-medium text-dark-400 mb-4">{title}</h3>
      <div className="h-64">{children}</div>
    </div>
  );
}
