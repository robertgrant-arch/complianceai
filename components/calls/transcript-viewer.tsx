'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Search, X, User, Headphones } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDuration, cn } from '@/lib/utils';

interface TranscriptSegment {
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
}

interface KeywordHit {
  keyword: string;
  type: 'prohibited' | 'required' | 'risk' | 'competitor';
  timestamp?: string;
  context?: string;
}

interface TranscriptViewerProps {
  segments: TranscriptSegment[];
  keywordHits?: KeywordHit[];
  currentTime?: number;
  onSeek?: (time: number) => void;
}

const KEYWORD_COLORS: Record<string, string> = {
  prohibited: 'bg-red-500/20 text-red-300 rounded px-0.5',
  required: 'bg-green-500/20 text-green-300 rounded px-0.5',
  risk: 'bg-yellow-500/20 text-yellow-300 rounded px-0.5',
  competitor: 'bg-blue-500/20 text-blue-300 rounded px-0.5',
};

function highlightKeywords(text: string, keywords: KeywordHit[]): React.ReactNode {
  if (!keywords || keywords.length === 0) return <>{text}</>;

  let result: React.ReactNode[] = [text];

  keywords.forEach((hit) => {
    const keyword = hit.keyword;
    const colorClass = KEYWORD_COLORS[hit.type] || '';

    const newResult: React.ReactNode[] = [];
    result.forEach((part) => {
      if (typeof part !== 'string') {
        newResult.push(part);
        return;
      }
      const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = part.split(regex);
      parts.forEach((p, i) => {
        if (p.toLowerCase() === keyword.toLowerCase()) {
          newResult.push(
            <span key={`kw-${keyword}-${i}`} className={colorClass} title={`${hit.type}: ${keyword}`}>
              {p}
            </span>
          );
        } else {
          newResult.push(p);
        }
      });
    });
    result = newResult;
  });

  return <>{result}</>;
}

export function TranscriptViewer({
  segments,
  keywordHits = [],
  currentTime = 0,
  onSeek,
}: TranscriptViewerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Find active segment based on current time
  useEffect(() => {
    const activeIndex = segments.findIndex(
      (seg) => currentTime >= seg.startTime && currentTime <= seg.endTime
    );
    if (activeIndex !== -1 && activeIndex !== activeSegmentIndex) {
      setActiveSegmentIndex(activeIndex);
      segmentRefs.current[activeIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentTime, segments, activeSegmentIndex]);

  const filteredSegments = searchQuery
    ? segments.filter((seg) =>
        seg.text.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : segments;

  // Build unique speaker list without Set spread
  const speakerSet: string[] = [];
  segments.forEach((s) => {
    if (!speakerSet.includes(s.speaker)) speakerSet.push(s.speaker);
  });

  const speakerColors: Record<string, string> = {};
  speakerSet.forEach((speaker, i) => {
    speakerColors[speaker] = i === 0 ? 'text-blue-400' : 'text-green-400';
  });

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Keyword legend */}
        {keywordHits.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {Object.entries(KEYWORD_COLORS).map(([type, cls]) => (
              <span key={type} className={`text-xs px-1.5 py-0.5 rounded ${cls}`}>
                {type}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Transcript segments */}
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {filteredSegments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {searchQuery ? 'No matches found' : 'No transcript available'}
            </p>
          ) : (
            filteredSegments.map((segment, index) => {
              const isActive = index === activeSegmentIndex && !searchQuery;
              const isAgent = segment.speaker.toLowerCase().includes('agent') ||
                segment.speaker === speakerSet[0];

              return (
                <div
                  key={index}
                  ref={(el: HTMLDivElement | null) => { segmentRefs.current[index] = el; }}
                  className={cn(
                    'flex gap-3 p-2 rounded-lg transition-colors cursor-pointer group',
                    isActive && 'bg-primary/10 border border-primary/20',
                    !isActive && 'hover:bg-muted/50'
                  )}
                  onClick={() => onSeek?.(segment.startTime)}
                >
                  {/* Speaker icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center',
                      isAgent ? 'bg-blue-500/20' : 'bg-green-500/20'
                    )}>
                      {isAgent ? (
                        <Headphones className="w-3 h-3 text-blue-400" />
                      ) : (
                        <User className="w-3 h-3 text-green-400" />
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn(
                        'text-xs font-semibold',
                        speakerColors[segment.speaker] || 'text-foreground'
                      )}>
                        {segment.speaker}
                      </span>
                      <button
                        className="text-xs text-muted-foreground hover:text-primary transition-colors font-mono"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSeek?.(segment.startTime);
                        }}
                      >
                        {formatDuration(Math.floor(segment.startTime))}
                      </button>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">
                      {searchQuery ? (
                        segment.text.split(new RegExp(`(${searchQuery})`, 'gi')).map((part, i) =>
                          part.toLowerCase() === searchQuery.toLowerCase() ? (
                            <mark key={i} className="bg-yellow-500/30 text-foreground rounded px-0.5">{part}</mark>
                          ) : (
                            <React.Fragment key={i}>{part}</React.Fragment>
                          )
                        )
                      ) : (
                        highlightKeywords(segment.text, keywordHits)
                      )}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Stats footer */}
      <div className="px-3 py-2 border-t border-border bg-muted/20">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{segments.length} segments</span>
          {keywordHits.length > 0 && (
            <span>{keywordHits.length} keyword hits</span>
          )}
          {searchQuery && (
            <span>{filteredSegments.length} matches</span>
          )}
        </div>
      </div>
    </div>
  );
}
