import type { ReactNode } from 'react';

type AlertVariant = 'error' | 'success' | 'info';

interface AlertProps {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<AlertVariant, string> = {
  error: 'bg-red-500/10 border-red-500/20 text-red-400',
  success: 'bg-accent-emerald/10 border-accent-emerald/20 text-accent-emerald',
  info: 'bg-primary-500/10 border-primary-500/20 text-primary-400',
};

export default function Alert({ variant = 'error', children, className = '' }: AlertProps) {
  return (
    <div className={`px-3 py-2 border rounded-lg text-sm ${variantClasses[variant]} ${className}`}>
      {children}
    </div>
  );
}
