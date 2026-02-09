import { cn } from '../../lib/utils';
import { ReactNode } from 'react';

type TextVariant = 'cyan' | 'magenta' | 'green' | 'gradient';
type TextSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';

interface NeonTextProps {
  children: ReactNode;
  variant?: TextVariant;
  size?: TextSize;
  className?: string;
  glow?: boolean;
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4';
}

const variantStyles: Record<TextVariant, string> = {
  cyan: 'text-neon-cyan',
  magenta: 'text-neon-magenta',
  green: 'text-neon-green',
  gradient: 'text-gradient animate-gradient',
};

const sizeStyles: Record<TextSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
};

const glowStyles: Record<TextVariant, string> = {
  cyan: 'drop-shadow-[0_0_10px_rgba(0,245,255,0.5)]',
  magenta: 'drop-shadow-[0_0_10px_rgba(255,0,255,0.5)]',
  green: 'drop-shadow-[0_0_10px_rgba(0,255,136,0.5)]',
  gradient: 'drop-shadow-[0_0_10px_rgba(0,245,255,0.5)]',
};

export function NeonText({
  children,
  variant = 'cyan',
  size = 'md',
  className,
  glow = false,
  as: Component = 'span'
}: NeonTextProps) {
  return (
    <Component
      className={cn(
        variantStyles[variant],
        sizeStyles[size],
        glow && glowStyles[variant],
        className
      )}
    >
      {children}
    </Component>
  );
}
