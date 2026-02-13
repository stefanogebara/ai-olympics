import { cn } from '../../lib/utils';
import { InputHTMLAttributes, forwardRef, useId } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className, id: propId, ...props }, ref) => {
    const autoId = useId();
    const id = propId || autoId;
    const errorId = error ? `${id}-error` : undefined;

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-white/70">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" aria-hidden="true">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            className={cn(
              'w-full px-4 py-2.5 bg-cyber-dark/50 border border-white/10 rounded-lg',
              'text-white placeholder:text-white/30',
              'focus:outline-none focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/30',
              'transition-all duration-200',
              icon && 'pl-10',
              error && 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30',
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p id={errorId} className="text-sm text-red-400" role="alert">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
