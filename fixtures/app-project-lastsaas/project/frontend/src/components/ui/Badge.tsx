import type { ReactNode } from 'react';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-accent-emerald/10 text-accent-emerald',
  danger: 'bg-red-500/10 text-red-400',
  warning: 'bg-yellow-500/10 text-yellow-400',
  info: 'bg-primary-500/10 text-primary-400',
  neutral: 'bg-dark-700 text-dark-300',
};

export default function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}
