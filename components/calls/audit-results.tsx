'use client';

import { useState } from 'react';
import {
  AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp,
  MessageSquare, Tag, Shield, Mic, Star, Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScoreGauge } from '@/components/shared/score-gauge';
import { FlagBadge } from '@/components/shared/flag-badge';
import { formatDuration, getScoreBg, cn } from '@/lib/utils';

interface AuditFlag {
  id: string;
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  category: string;
  timestamp?: string;
  description: string;
  quote?: string;
}

interface KeywordHit {
  keyword: string;
  type: string;
  timestamp: string;
  context: string;
}

interface AuditResultsProps {
  auditResult: {
    overallScore: number;
    complianceScore: number;
    toneScore: number;
    qualityScore: number;
    summary: string;
    recommendedAction: string;
    auditFlags: AuditFlag[];
    keywordHits: KeywordHit[];
    aiModel: string;
    promptVersion: string;
    createdAt: string;
  };
  onSeek?: (seconds: number) => void;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  compliance: Shield,
  tone: Mic,
  keyword: Tag,
  quality: Star,
};

const ACTION_CONFIG: Record<string, { label: string; variant: any; icon: React.ElementType }> = {
  none: { label: 'No Action Required', variant: 'success', icon: Shield },
  coaching: { label: 'Coaching Recommended', variant: 'warning', icon: MessageSquare },
  review: { label: 'Supervisor Review', variant: 'warning', icon: AlertTriangle },
  escalation: { label: 'Escalation Required', variant: 'critical', icon: AlertCircle },
};

function parseTimestamp(ts: string): number {
  if (!ts) return 0;
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function AuditResults({ auditResult, onSeek }: AuditResultsProps) {
  const [expandedFlags, setExpandedFlags] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const toggleFlag = (id: string) => {
    setExpandedFlags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const actionConfig = ACTION_CONFIG[auditResult.recommendedAction] || ACTION_CONFIG.none;
  const ActionIcon = actionConfig.icon;

  const categorySet = auditResult.auditFlags.map((f) => f.category).filter((v, i, a) => a.indexOf(v) === i);
  const categories = ['all', ...categorySet];
  const filteredFlags = activeCategory === 'all'
    ? auditResult.auditFlags
    : auditResult.auditFlags.filter((f) => f.category === activeCategory);

  const criticalCount = auditResult.auditFlags.filter((f) => f.type === 'CRITICAL').length;
  const warningCount = auditResult.auditFlags.filter((f) => f.type === 'WARNING').length;
  const infoCount = auditResult.auditFlags.filter((f) => f.type === 'INFO').length;

  return (
    <div className="space-y-4">
      {/* Score overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            AI Audit Scores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="col-span-2 flex justify-center">
              <ScoreGauge score={auditResult.overallScore} label="Overall Score" size="lg" />
            </div>
            <ScoreGauge score={auditResult.complianceScore} label="Compliance" size="sm" />
            <ScoreGauge score={auditResult.toneScore} label="Tone" size="sm" />
            <ScoreGauge score={auditResult.qualityScore} label="Quality" size="sm" />
            <div className="flex flex-col items-center justify-center">
              <Badge variant={actionConfig.variant} className="gap-1 text-xs">
                <ActionIcon className="w-3 h-3" />
                {actionConfig.label}
              </Badge>
            </div>
          </div>

          {/* Summary */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground leading-relaxed">{auditResult.summary}</p>
          </div>

          {/* AI metadata */}
          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
            <span>Model: {auditResult.aiModel}</span>
            <span>·</span>
            <span>Prompt v{auditResult.promptVersion}</span>
          </div>
        </CardContent>
      </Card>

      {/* Flags */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              Compliance Flags
            </CardTitle>
            <div className="flex items-center gap-1.5">
              {criticalCount > 0 && (
                <Badge variant="critical" className="text-xs">{criticalCount} Critical</Badge>
              )}
              {warningCount > 0 && (
                <Badge variant="warning" className="text-xs">{warningCount} Warning</Badge>
              )}
              {infoCount > 0 && (
                <Badge variant="info" className="text-xs">{infoCount} Info</Badge>
              )}
            </div>
          </div>

          {/* Category filter */}
          {categories.length > 2 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full border transition-colors capitalize',
                    activeCategory === cat
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-foreground'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {filteredFlags.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No flags found</p>
          ) : (
            <div className="space-y-2">
              {filteredFlags.map((flag) => {
                const CategoryIcon = CATEGORY_ICONS[flag.category] || Shield;
                const isExpanded = expandedFlags.has(flag.id);
                const seconds = flag.timestamp ? parseTimestamp(flag.timestamp) : null;

                return (
                  <div
                    key={flag.id}
                    className={cn(
                      'rounded-lg border transition-colors',
                      flag.type === 'CRITICAL' && 'border-red-500/20 bg-red-500/5',
                      flag.type === 'WARNING' && 'border-yellow-500/20 bg-yellow-500/5',
                      flag.type === 'INFO' && 'border-blue-500/20 bg-blue-500/5',
                    )}
                  >
                    <button
                      className="w-full flex items-start gap-3 p-3 text-left"
                      onClick={() => toggleFlag(flag.id)}
                    >
                      <FlagBadge type={flag.type} className="mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-foreground">{flag.description}</span>
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground capitalize">
                            <CategoryIcon className="w-3 h-3" />
                            {flag.category}
                          </span>
                        </div>
                        {flag.timestamp && (
                          <button
                            className="text-xs text-primary hover:underline mt-0.5 font-mono"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (seconds !== null) onSeek?.(seconds);
                            }}
                          >
                            @ {flag.timestamp}
                          </button>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      )}
                    </button>

                    {isExpanded && flag.quote && (
                      <div className="px-3 pb-3">
                        <blockquote className="border-l-2 border-current pl-3 text-xs text-muted-foreground italic">
                          "{flag.quote}"
                        </blockquote>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Keyword hits */}
      {auditResult.keywordHits && auditResult.keywordHits.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Tag className="w-4 h-4 text-yellow-400" />
              Keyword Hits ({auditResult.keywordHits.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {auditResult.keywordHits.map((hit: KeywordHit, i: number) => (
                <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-muted/30">
                  <Badge
                    variant={
                      hit.type === 'prohibited' ? 'critical' :
                      hit.type === 'risk' ? 'warning' :
                      hit.type === 'competitor' ? 'info' : 'success'
                    }
                    className="text-xs capitalize flex-shrink-0"
                  >
                    {hit.type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">{hit.keyword}</span>
                    {hit.context && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">"{hit.context}"</p>
                    )}
                  </div>
                  {hit.timestamp && (
                    <button
                      className="text-xs text-primary hover:underline font-mono flex-shrink-0"
                      onClick={() => onSeek?.(parseTimestamp(hit.timestamp))}
                    >
                      {hit.timestamp}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
