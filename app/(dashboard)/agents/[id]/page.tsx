'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Phone, AlertCircle, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreGauge } from '@/components/shared/score-gauge';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDateTime, formatDuration, getScoreBg } from '@/lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

export default function AgentDetailPage() {
  const params = useParams();
  const agentId = params.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    const fetchAgent = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/agents/${agentId}?days=${days}`);
        if (!res.ok) throw new Error('Agent not found');
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAgent();
  }, [agentId, days]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Agent not found</p>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/agents"><ArrowLeft className="w-4 h-4 mr-2" />Back to Agents</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href="/agents"><ArrowLeft className="w-3.5 h-3.5" />Agents</Link>
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{data.agentName}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-600/20 flex items-center justify-center">
            <span className="text-xl font-bold text-blue-400">{data.agentName.charAt(0)}</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">{data.agentName}</h1>
            <p className="text-sm text-muted-foreground font-mono">{data.agentId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                days === d ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex flex-col items-center">
            <ScoreGauge score={data.stats.avgScore ?? 0} label="Overall" size="md" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col items-center">
            <ScoreGauge score={data.stats.avgCompliance ?? 0} label="Compliance" size="md" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col items-center">
            <ScoreGauge score={data.stats.avgTone ?? 0} label="Tone" size="md" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col items-center">
            <ScoreGauge score={data.stats.avgQuality ?? 0} label="Quality" size="md" />
          </CardContent>
        </Card>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-3xl font-bold">{data.stats.totalCalls}</p>
            <p className="text-sm text-muted-foreground mt-1">Total Calls</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-3xl font-bold">{data.stats.auditedCalls}</p>
            <p className="text-sm text-muted-foreground mt-1">Audited</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-3xl font-bold text-muted-foreground">
              {data.stats.totalCalls > 0
                ? Math.round((data.stats.auditedCalls / data.stats.totalCalls) * 100)
                : 0}%
            </p>
            <p className="text-sm text-muted-foreground mt-1">Audit Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Score trend chart */}
      {data.scoreTrend.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Score Trend
            </CardTitle>
            <CardDescription>Daily average compliance score</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data.scoreTrend}>
                <defs>
                  <linearGradient id="agentScoreGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="score" stroke="#3b82f6" fill="url(#agentScoreGradient)" strokeWidth={2} name="Score" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent calls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Recent Calls
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Campaign</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Duration</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Score</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {data.recentCalls.map((call: any) => (
                  <tr key={call.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-3 text-xs">{formatDateTime(call.startTime)}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{call.campaignName}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">
                      {call.duration ? formatDuration(call.duration) : '—'}
                    </td>
                    <td className="py-2 px-3">
                      <StatusBadge status={call.status} />
                    </td>
                    <td className="py-2 px-3">
                      {call.auditResult ? (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${getScoreBg(call.auditResult.overallScore)}`}>
                          {call.auditResult.overallScore}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-2 px-3">
                      <Link href={`/calls/${call.id}`}>
                        <Button variant="ghost" size="xs" className="text-xs">View</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
