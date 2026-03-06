import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, Loader2, XCircle, Mic } from 'lucide-react';

type CallStatus = 'pending' | 'transcribing' | 'analyzing' | 'complete' | 'error';

interface StatusBadgeProps {
  status: CallStatus;
  className?: string;
}

const statusConfig: Record<CallStatus, { label: string; icon: React.ElementType; className: string }> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  },
  transcribing: {
    label: 'Transcribing',
    icon: Mic,
    className: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  analyzing: {
    label: 'Analyzing',
    icon: Loader2,
    className: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  },
  complete: {
    label: 'Complete',
    icon: CheckCircle2,
    className: 'bg-green-500/10 text-green-400 border-green-500/20',
  },
  error: {
    label: 'Error',
    icon: XCircle,
    className: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
      config.className,
      className
    )}>
      <Icon className={cn('w-3 h-3', status === 'analyzing' && 'animate-spin')} />
      {config.label}
    </span>
  );
}
