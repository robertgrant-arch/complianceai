import { cn, getFlagBadgeClass } from '@/lib/utils';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

interface FlagBadgeProps {
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  className?: string;
  showIcon?: boolean;
}

export function FlagBadge({ type, className, showIcon = true }: FlagBadgeProps) {
  const icons = {
    CRITICAL: AlertCircle,
    WARNING: AlertTriangle,
    INFO: Info,
  };
  const Icon = icons[type];

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
      getFlagBadgeClass(type),
      className
    )}>
      {showIcon && <Icon className="w-3 h-3" />}
      {type}
    </span>
  );
}
