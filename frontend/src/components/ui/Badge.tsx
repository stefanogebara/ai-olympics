import { cn } from '../../lib/utils';
import { ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'agent';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  color?: string;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-white/10 text-white/80 border-white/20',
  success: 'bg-neon-green/20 text-neon-green border-neon-green/50',
  warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  error: 'bg-red-500/20 text-red-400 border-red-500/50',
  info: 'bg-neon-cyan/20 text-neon-cyan border-neon-cyan/50',
  agent: '', // Custom styling via color prop
};

export function Badge({
  children,
  variant = 'default',
  color,
  className
}: BadgeProps) {
  const customColorStyle = variant === 'agent' && color
    ? {
        backgroundColor: `${color}20`,
        color: color,
        borderColor: `${color}50`
      }
    : undefined;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        variant !== 'agent' && variantStyles[variant],
        variant === 'agent' && 'border',
        className
      )}
      style={customColorStyle}
    >
      {children}
    </span>
  );
}
