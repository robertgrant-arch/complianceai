'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Phone, CheckCircle2, Clock, AlertCircle, TrendingUp,
  TrendingDown, AlertTriangle, Info, ArrowRight, RefreshCw,
  Shield, Mic, BarChart3, Users
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreGauge } from '@/components/shared/score-gauge';
import { FlagBadge } from '@/components/shared/flag-badge';
import { WithErrorBoundary } from '@/components/shared/error-boundary';
import { formatDateTime, formatDate, getScoreBg } from '@/lib/utils';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

const DAYS_OPTIONS = [7, 14, 30, 90];

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (selectedDays: number) => {
    try {
      const res = await fetch(`/api/dashboard?days=${selectedDays}`);
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error('Dashboard error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData(days);
  }, [days]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData(days);
  };

  const CAMPAIGN_COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4'];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  const { stats, charts, topAgents, recentFlags } = data || {};

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Compliance overview for the last {days} days
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === d
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Phone className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            <div className="text-2xl font-bold">{stats?.totalCalls?.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Calls ingested</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              </div>
              <span className="text-xs text-green-400 font-medium">{stats?.complianceRate}%</span>
            </div>
            <div className="text-2xl font-bold">{stats?.completedCalls?.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Audited calls</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Clock className="w-4 h-4 text-yellow-400" />
              </div>
              <span className="text-xs text-muted-foreground">Queue</span>
            </div>
            <div className="text-2xl font-bold">{stats?.pendingCalls?.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Pending audit</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <AlertCircle className="w-4 h-4 text-red-400" />
              </div>
              <span className="text-xs text-red-400 font-medium">
                {stats?.flagCounts?.CRITICAL} critical
              </span>
            </div>
            <div className="text-2xl font-bold">
              {(stats?.flagCounts?.CRITICAL + stats?.flagCounts?.WARNING + stats?.flagCounts?.INFO) || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total flags</p>
          </CardContent>
        </Card>
      </div>

      {/* Score Overview */}
      <WithErrorBoundary label="Score Overview">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score gauges */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Average Scores</CardTitle>
            <CardDescription>Last {days} days performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <ScoreGauge score={stats?.avgOverallScore || 0} label="Overall" size="md" />
              <ScoreGauge score={stats?.avgComplianceScore || 0} label="Compliance" size="md" />
              <ScoreGauge score={stats?.avgToneScore || 0} label="Tone" size="md" />
              <ScoreGauge score={stats?.avgQualityScore || 0} label="Quality" size="md" />
            </div>
          </CardContent>
        </Card>

        {/* Flag breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Flag Distribution</CardTitle>
            <CardDescription>Issues by severity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { type: 'CRITICAL', count: stats?.flagCounts?.CRITICAL || 0, color: 'bg-red-500' },
                { type: 'WARNING', count: stats?.flagCounts?.WARNING || 0, color: 'bg-yellow-500' },
                { type: 'INFO', count: stats?.flagCounts?.INFO || 0, color: 'bg-blue-500' },
              ].map(({ type, count, color }) => {
                const total = (stats?.flagCounts?.CRITICAL + stats?.flagCounts?.WARNING + stats?.flagCounts?.INFO) || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1">
                      <FlagBadge type={type as any} showIcon />
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Compliance Rate</span>
                <span className={`font-bold ${stats?.complianceRate >= 80 ? 'text-green-400' : stats?.complianceRate >= 65 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {stats?.complianceRate}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Campaign breakdown pie */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">By Campaign</CardTitle>
            <CardDescription>Call volume distribution</CardDescription>
          </CardHeader>
          <CardContent>
            {charts?.campaignBreakdown?.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={charts.campaignBreakdown}
                    dataKey="count"
                    nameKey="campaign"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {charts.campaignBreakdown.map((_: any, index: number) => (
                      <Cell key={index} fill={CAMPAIGN_COLORS[index % CAMPAIGN_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(value: any, name: any) => [value, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      </WithErrorBoundary>

      {/* Charts row */}
      <WithErrorBoundary label="Charts">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calls over time */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Call Volume</CardTitle>
            <CardDescription>Daily ingestion over {days} days</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={charts?.callsByDay || []}>
                <defs>
                  <linearGradient id="callGradient" x1="0" y1="0" x2="0" y2="1">
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
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                  labelFormatter={(v) => formatDate(v)}
                />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#callGradient)" strokeWidth={2} name="Calls" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Score trend */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Compliance Score Trend</CardTitle>
            <CardDescription>Daily average overall score</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={charts?.scoresByDay || []}>
                <defs>
                  <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
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
                  labelFormatter={(v) => formatDate(v)}
                />
                <Area type="monotone" dataKey="score" stroke="#22c55e" fill="url(#scoreGradient)" strokeWidth={2} name="Avg Score" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      </WithErrorBoundary>

      {/* Bottom row: Top agents + Recent flags */}
      <WithErrorBoundary label="Agents & Flags">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top agents */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Top Agents</CardTitle>
              <CardDescription>By average compliance score</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/agents" className="gap-1 text-xs">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(topAgents || []).slice(0, 5).map((agent: any, i: number) => (
                <div key={agent.agentId} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                  <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-blue-400">
                      {agent.agentName.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/agents/${agent.agentId}`} className="text-sm font-medium hover:text-primary truncate block">
                      {agent.agentName}
                    </Link>
                    <span className="text-xs text-muted-foreground">{agent.callCount} calls</span>
                  </div>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-md ${getScoreBg(agent.avgScore)}`}>
                    {agent.avgScore}
                  </span>
                </div>
              ))}
              {(!topAgents || topAgents.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent critical flags */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Recent Critical Flags</CardTitle>
              <CardDescription>Calls requiring immediate attention</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/calls?flagType=CRITICAL" className="gap-1 text-xs">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(recentFlags || []).map((flag: any) => (
                <Link
                  key={flag.id}
                  href={`/calls/${flag.callId}`}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="p-1.5 rounded-md bg-red-500/10 flex-shrink-0 mt-0.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{flag.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{flag.agentName}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(flag.startTime)}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0 mt-0.5" />
                </Link>
              ))}
              {(!recentFlags || recentFlags.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">No critical flags</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      </WithErrorBoundary>
    </div>
  );
}
