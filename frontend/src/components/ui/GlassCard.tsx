import { cn } from '../../lib/utils';
import { ReactNode, KeyboardEvent } from 'react';

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
  const isInteractive = !!onClick;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={cn(
        'bg-cyber-elevated/80 backdrop-blur-md border border-white/10 rounded-xl',
        neonBorder && 'neon-border',
        hover && 'transition-all duration-300 hover:border-neon-cyan/50 hover:shadow-lg hover:shadow-neon-cyan/10 cursor-pointer',
        isInteractive && 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-neon-cyan/50',
        className
      )}
      onClick={onClick}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
    >
      {children}
    </div>
  );
}
