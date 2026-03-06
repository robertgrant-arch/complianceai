'use client';

import { cn } from '@/lib/utils';

interface ScoreGaugeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showLabel?: boolean;
  className?: string;
}

export function ScoreGauge({ score, size = 'md', label, showLabel = true, className }: ScoreGaugeProps) {
  const getColor = (s: number) => {
    if (s >= 80) return { stroke: '#22c55e', text: 'text-green-500', bg: 'bg-green-500/10' };
    if (s >= 65) return { stroke: '#f59e0b', text: 'text-yellow-500', bg: 'bg-yellow-500/10' };
    return { stroke: '#ef4444', text: 'text-red-500', bg: 'bg-red-500/10' };
  };

  const colors = getColor(score);
  const sizes = {
    sm: { svg: 60, r: 22, stroke: 4, fontSize: 'text-sm' },
    md: { svg: 80, r: 30, stroke: 5, fontSize: 'text-lg' },
    lg: { svg: 120, r: 46, stroke: 7, fontSize: 'text-2xl' },
  };

  const { svg, r, stroke, fontSize } = sizes[size];
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const center = svg / 2;

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div className="relative">
        <svg width={svg} height={svg} className="-rotate-90">
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-muted/40"
          />
          {/* Score arc */}
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        {/* Score text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('font-bold', fontSize, colors.text)}>{score}</span>
        </div>
      </div>
      {showLabel && label && (
        <span className="text-xs text-muted-foreground text-center">{label}</span>
      )}
    </div>
  );
}
