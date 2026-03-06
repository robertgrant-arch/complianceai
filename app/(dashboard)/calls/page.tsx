'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search, Filter, Download, Phone, ChevronLeft, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, X, SlidersHorizontal,
  PhoneIncoming, PhoneOutgoing, Clock, CheckCircle2, AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/status-badge';
import { FlagBadge } from '@/components/shared/flag-badge';
import { formatDateTime, formatDuration, getScoreBg, buildQueryString, debounce } from '@/lib/utils';

const CAMPAIGNS = ['Medicare Advantage', 'Part D', 'Supplement', 'Medicaid', 'ACA Plans'];
const STATUS_OPTIONS = ['pending', 'transcribing', 'analyzing', 'complete', 'error'];

/**
 * M-03: Memoized call row — only re-renders when the call object reference changes.
 * Prevents all 25 rows from re-rendering on sort/filter state changes.
 */
const CallRow = memo(function CallRow({ call }: { call: any }) {
  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="text-xs font-medium">{formatDateTime(call.startTime)}</p>
          <div className="flex items-center gap-1 mt-0.5">
            {call.callDirection === 'inbound' ? (
              <PhoneIncoming className="w-3 h-3 text-green-400" />
            ) : (
              <PhoneOutgoing className="w-3 h-3 text-blue-400" />
            )}
            <span className="text-xs text-muted-foreground capitalize">{call.callDirection}</span>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Link href={`/agents/${call.agentId}`} className="text-sm font-medium hover:text-primary transition-colors">
          {call.agentName}
        </Link>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <span className="text-xs text-muted-foreground">{call.campaignName}</span>
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className="text-xs text-muted-foreground">
          {call.duration ? formatDuration(call.duration) : '\u2014'}
        </span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={call.status} />
      </td>
      <td className="px-4 py-3">
        {call.auditResult ? (
          <span className={`text-sm font-bold px-2 py-0.5 rounded-md ${getScoreBg(call.auditResult.overallScore)}`}>
            {call.auditResult.overallScore}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">\u2014</span>
        )}
      </td>
      <td className="px-4 py-3 hidden xl:table-cell">
        {call.auditResult?._count?.auditFlags > 0 ? (
          <span className="text-xs text-muted-foreground">
            {call.auditResult._count.auditFlags} flag{call.auditResult._count.auditFlags !== 1 ? 's' : ''}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">\u2014</span>
        )}
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        {call.auditResult?.recommendedAction && call.auditResult.recommendedAction !== 'NONE' && (
          <Badge
            variant={call.auditResult.recommendedAction === 'ESCALATE' ? 'critical' : 'warning'}
            className="text-xs capitalize"
          >
            {call.auditResult.recommendedAction.toLowerCase()}
          </Badge>
        )}
      </td>
      <td className="px-4 py-3">
        <Link href={`/calls/${call.id}`}>
          <Button variant="ghost" size="xs" className="text-xs">Review</Button>
        </Link>
      </td>
    </tr>
  );
});

export default function CallExplorerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [calls, setCalls] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [campaign, setCampaign] = useState(searchParams.get('campaign') || '');
  const [direction, setDirection] = useState(searchParams.get('direction') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '');
  const [minScore, setMinScore] = useState(searchParams.get('minScore') || '');
  const [maxScore, setMaxScore] = useState(searchParams.get('maxScore') || '');
  const [flagType, setFlagType] = useState(searchParams.get('flagType') || '');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'));
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'startTime');
  const [sortOrder, setSortOrder] = useState(searchParams.get('sortOrder') || 'desc');

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildQueryString({
        search, status, campaign, direction, dateFrom, dateTo,
        minScore, maxScore, flagType, page, sortBy, sortOrder, limit: 25,
      });
      const res = await fetch(`/api/calls${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setCalls(data.calls);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Error fetching calls:', error);
    } finally {
      setLoading(false);
    }
  }, [search, status, campaign, direction, dateFrom, dateTo, minScore, maxScore, flagType, page, sortBy, sortOrder]);

  const debouncedFetch = useCallback(debounce(fetchCalls, 300), [fetchCalls]);

  useEffect(() => {
    debouncedFetch();
  }, [search]);

  useEffect(() => {
    fetchCalls();
  }, [status, campaign, direction, dateFrom, dateTo, minScore, maxScore, flagType, page, sortBy, sortOrder]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const clearFilters = () => {
    setSearch(''); setStatus(''); setCampaign(''); setDirection('');
    setDateFrom(''); setDateTo(''); setMinScore(''); setMaxScore(''); setFlagType('');
    setPage(1);
  };

  const hasActiveFilters = search || status || campaign || direction || dateFrom || dateTo || minScore || maxScore || flagType;

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />;
    return sortOrder === 'asc'
      ? <ArrowUp className="w-3.5 h-3.5 text-primary" />
      : <ArrowDown className="w-3.5 h-3.5 text-primary" />;
  };

  const handleExport = async () => {
    const params = buildQueryString({ search, status, campaign, direction, dateFrom, dateTo, format: 'csv' });
    window.open(`/api/export${params}`, '_blank');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Call Explorer</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pagination.total?.toLocaleString() || '...'} total calls
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {hasActiveFilters && (
              <Badge variant="info" className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-xs">
                !
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by agent name, call ID, campaign, phone number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-4"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {/* Filters panel */}
      {showFilters && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                <Select value={status} onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Campaign</label>
                <Select value={campaign} onValueChange={(v) => { setCampaign(v === 'all' ? '' : v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All campaigns" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All campaigns</SelectItem>
                    {CAMPAIGNS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Direction</label>
                <Select value={direction} onValueChange={(v) => { setDirection(v === 'all' ? '' : v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All directions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All directions</SelectItem>
                    <SelectItem value="inbound">Inbound</SelectItem>
                    <SelectItem value="outbound">Outbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Flag Type</label>
                <Select value={flagType} onValueChange={(v) => { setFlagType(v === 'all' ? '' : v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All flags" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All flags</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                    <SelectItem value="WARNING">Warning</SelectItem>
                    <SelectItem value="INFO">Info</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Date From</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Date To</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Min Score</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={minScore}
                  onChange={(e) => { setMinScore(e.target.value); setPage(1); }}
                  placeholder="0"
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Max Score</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={maxScore}
                  onChange={(e) => { setMaxScore(e.target.value); setPage(1); }}
                  placeholder="100"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {hasActiveFilters && (
              <div className="mt-3 flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-xs text-muted-foreground">
                  <X className="w-3 h-3" />
                  Clear all filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3">
                  <button
                    onClick={() => handleSort('startTime')}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Date/Time <SortIcon field="startTime" />
                  </button>
                </th>
                <th className="text-left px-4 py-3">
                  <button
                    onClick={() => handleSort('agentName')}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Agent <SortIcon field="agentName" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 hidden md:table-cell">
                  <span className="text-xs font-medium text-muted-foreground">Campaign</span>
                </th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">
                  <button
                    onClick={() => handleSort('duration')}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Duration <SortIcon field="duration" />
                  </button>
                </th>
                <th className="text-left px-4 py-3">
                  <span className="text-xs font-medium text-muted-foreground">Status</span>
                </th>
                <th className="text-left px-4 py-3">
                  <button
                    onClick={() => handleSort('score')}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Score <SortIcon field="score" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 hidden xl:table-cell">
                  <span className="text-xs font-medium text-muted-foreground">Flags</span>
                </th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">
                  <span className="text-xs font-medium text-muted-foreground">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : calls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <Phone className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No calls found matching your filters</p>
                  </td>
                </tr>
              ) : (
                /* M-03: Use memoized CallRow to prevent unnecessary re-renders */
                calls.map((call) => <CallRow key={call.id} call={call} />)
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Showing {((page - 1) * 25) + 1}–{Math.min(page * 25, pagination.total)} of {pagination.total?.toLocaleString()}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setPage(page - 1)}
                disabled={!pagination.hasPrev}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs px-2">
                Page {page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="xs"
                onClick={() => setPage(page + 1)}
                disabled={!pagination.hasNext}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
