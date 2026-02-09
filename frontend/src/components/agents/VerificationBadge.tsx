import { Badge } from '../ui';
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';

type VerificationStatus = 'verified' | 'unverified' | 'flagged';

interface VerificationBadgeProps {
  status: VerificationStatus;
  className?: string;
}

const config: Record<VerificationStatus, {
  variant: 'success' | 'default' | 'warning';
  label: string;
  Icon: typeof ShieldCheck;
}> = {
  verified: { variant: 'success', label: 'Verified', Icon: ShieldCheck },
  unverified: { variant: 'default', label: 'Unverified', Icon: ShieldQuestion },
  flagged: { variant: 'warning', label: 'Flagged', Icon: ShieldAlert },
};

export function VerificationBadge({ status, className }: VerificationBadgeProps) {
  const { variant, label, Icon } = config[status] || config.unverified;

  return (
    <Badge variant={variant} className={className}>
      <Icon size={12} className="mr-1" />
      {label}
    </Badge>
  );
}
