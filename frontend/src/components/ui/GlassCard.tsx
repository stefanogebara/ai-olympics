import { cn } from '../../lib/utils';
import { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  neonBorder?: boolean;
  hover?: boolean;
  onClick?: () => void;
}

export function GlassCard({
  children,
  className,
  neonBorder = false,
  hover = false,
  onClick
}: GlassCardProps) {
  return (
    <div
      className={cn(
        'bg-cyber-elevated/80 backdrop-blur-md border border-white/10 rounded-xl',
        neonBorder && 'neon-border',
        hover && 'transition-all duration-300 hover:border-neon-cyan/50 hover:shadow-lg hover:shadow-neon-cyan/10 cursor-pointer',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
