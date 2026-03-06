'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Phone, Clock, User, Calendar, PhoneIncoming, PhoneOutgoing,
  RefreshCw, CheckCircle2, Edit3, Save, X, AlertCircle, Loader2,
  ExternalLink, Download
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/status-badge';
import { AudioPlayer } from '@/components/calls/audio-player';
import { TranscriptViewer } from '@/components/calls/transcript-viewer';
import { AuditResults } from '@/components/calls/audit-results';
import { formatDateTime, formatDuration, formatPhone, getScoreBg } from '@/lib/utils';
import { toast } from 'sonner';

export default function CallDetailPage() {
  const params = useParams();
  const router = useRouter();
  const callId = params.id as string;

  const [call, setCall] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | undefined>();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);

  const fetchCall = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/calls/${callId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Call not found');
        throw new Error('Failed to load call');
      }
      const data = await res.json();
      setCall(data);
      setNotes(data.notes || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useEffect(() => {
    fetchCall();
  }, [fetchCall]);

  const handleSeek = (seconds: number) => {
    setSeekTo(seconds);
    setTimeout(() => setSeekTo(undefined), 100);
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/calls/${callId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error('Failed to save notes');
      toast.success('Notes saved');
      setEditingNotes(false);
    } catch (err) {
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleMarkReviewed = async () => {
    setMarkingReviewed(true);
    try {
      const res = await fetch(`/api/calls/${callId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewed: true }),
      });
      if (!res.ok) throw new Error('Failed to mark as reviewed');
      await fetchCall();
      toast.success('Call marked as reviewed');
    } catch (err) {
      toast.error('Failed to mark as reviewed');
    } finally {
      setMarkingReviewed(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-96 rounded-lg" />
          </div>
          <Skeleton className="h-96 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <p className="text-lg font-medium">{error}</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  if (!call) return null;

  const segments = call.transcript?.segments || [];
  const keywordHits = call.auditResult?.keywordHits || [];

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href="/calls">
            <ArrowLeft className="w-3.5 h-3.5" />
            Call Explorer
          </Link>
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground font-mono">{call.five9CallId}</span>
      </div>

      {/* Call header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold">{call.agentName}</h1>
            <StatusBadge status={call.status} />
            {call.auditResult && (
              <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${getScoreBg(call.auditResult.overallScore)}`}>
                Score: {call.auditResult.overallScore}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDateTime(call.startTime)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {call.duration ? formatDuration(call.duration) : '—'}
            </span>
            <span className="flex items-center gap-1">
              {call.callDirection === 'inbound' ? (
                <PhoneIncoming className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <PhoneOutgoing className="w-3.5 h-3.5 text-blue-400" />
              )}
              <span className="capitalize">{call.callDirection}</span>
            </span>
            <span>{call.campaignName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!call.reviewedAt && call.status === 'complete' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkReviewed}
              disabled={markingReviewed}
              className="gap-2"
            >
              {markingReviewed ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              Mark Reviewed
            </Button>
          )}
          {call.reviewedAt && (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Reviewed
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={fetchCall} className="gap-2">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Left: Audio + Transcript */}
        <div className="xl:col-span-2 space-y-4">
          {/* Call metadata card */}
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Call ID</p>
                  <p className="text-sm font-mono font-medium truncate">{call.five9CallId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Agent ID</p>
                  <Link href={`/agents/${call.agentId}`} className="text-sm font-medium hover:text-primary">
                    {call.agentId}
                  </Link>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ANI (Caller)</p>
                  <p className="text-sm font-medium">{call.ani ? formatPhone(call.ani) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">DNIS (Dialed)</p>
                  <p className="text-sm font-medium">{call.dnis ? formatPhone(call.dnis) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Disposition</p>
                  <p className="text-sm font-medium">{call.disposition || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Campaign</p>
                  <p className="text-sm font-medium">{call.campaignName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Duration</p>
                  <p className="text-sm font-medium">{call.duration ? formatDuration(call.duration) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reviewed</p>
                  <p className="text-sm font-medium">
                    {call.reviewedAt ? formatDateTime(call.reviewedAt) : 'Not reviewed'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audio player */}
          <div>
            <h3 className="text-sm font-medium mb-2">Recording</h3>
            <AudioPlayer
              audioUrl={call.audioUrl}
              duration={call.duration}
              onTimeUpdate={setCurrentTime}
              seekTo={seekTo}
            />
          </div>

          {/* Transcript */}
          <Card className="h-[500px] flex flex-col overflow-hidden">
            <CardHeader className="pb-0 flex-shrink-0">
              <CardTitle className="text-sm font-medium">Transcript</CardTitle>
            </CardHeader>
            <div className="flex-1 overflow-hidden">
              {call.transcript ? (
                <TranscriptViewer
                  segments={segments}
                  keywordHits={keywordHits}
                  currentTime={currentTime}
                  onSeek={handleSeek}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <Loader2 className={`w-6 h-6 mx-auto mb-2 ${
                      call.status === 'transcribing' ? 'animate-spin' : 'opacity-30'
                    }`} />
                    <p className="text-sm">
                      {call.status === 'transcribing' ? 'Transcription in progress...' :
                       call.status === 'pending' ? 'Awaiting transcription' :
                       'No transcript available'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Reviewer Notes</CardTitle>
              {!editingNotes ? (
                <Button variant="ghost" size="xs" onClick={() => setEditingNotes(true)} className="gap-1.5">
                  <Edit3 className="w-3 h-3" />
                  Edit
                </Button>
              ) : (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="xs" onClick={() => { setEditingNotes(false); setNotes(call.notes || ''); }}>
                    <X className="w-3 h-3" />
                  </Button>
                  <Button size="xs" onClick={handleSaveNotes} disabled={savingNotes} className="gap-1">
                    {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {editingNotes ? (
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add reviewer notes..."
                  className="min-h-[100px] text-sm"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {call.notes || 'No notes added yet.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Audit results */}
        <div className="space-y-4">
          {call.auditResult ? (
            <AuditResults
              auditResult={call.auditResult}
              onSeek={handleSeek}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Loader2 className={`w-8 h-8 mx-auto mb-3 ${
                  ['transcribing', 'analyzing'].includes(call.status) ? 'animate-spin text-primary' : 'text-muted-foreground opacity-30'
                }`} />
                <p className="text-sm font-medium">
                  {call.status === 'transcribing' ? 'Transcribing audio...' :
                   call.status === 'analyzing' ? 'AI analysis in progress...' :
                   call.status === 'error' ? 'Processing failed' :
                   'Audit pending'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {call.status === 'pending' ? 'Call is queued for processing' :
                   call.status === 'error' ? 'Check worker logs for details' :
                   'This may take a few minutes'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
