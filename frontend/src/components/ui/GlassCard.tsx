import { cn } from '../../lib/utils';
import { ReactNode, KeyboardEvent } from 'react';

type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  neonBorder?: boolean;
  hover?: boolean;
  /** Standardized internal spacing. Omit to control padding via className (back-compat). */
  padding?: CardPadding;
  onClick?: () => void;
}

const paddingStyles: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function GlassCard({
  children,
  className,
  neonBorder = false,
  hover = false,
  padding,
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
        // Shared premium glass surface (gradient + hairline border + depth)
        'glass-card',
        padding && paddingStyles[padding],
        neonBorder && 'neon-border',
        (hover || isInteractive) &&
          'transition-all duration-300 hover:-translate-y-0.5 hover:border-neon-cyan/40 hover:shadow-glow-cyan',
        isInteractive && 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/50',
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
