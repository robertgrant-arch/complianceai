'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, SkipBack, SkipForward,
  Download, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/utils';

interface AudioPlayerProps {
  audioUrl: string | null;
  duration?: number;
  onTimeUpdate?: (time: number) => void;
  seekTo?: number;
}

export function AudioPlayer({ audioUrl, duration, onTimeUpdate, seekTo }: AudioPlayerProps) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [isLoading, setIsLoading] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!audioUrl || !waveformRef.current) return;

    let ws: any = null;

    const initWaveSurfer = async () => {
      try {
        // Dynamic import to avoid SSR issues
        const WaveSurfer = (await import('wavesurfer.js')).default;

        ws = WaveSurfer.create({
          container: waveformRef.current!,
          waveColor: 'hsl(217.2 32.6% 35%)',
          progressColor: 'hsl(221.2 83.2% 53.3%)',
          cursorColor: 'hsl(221.2 83.2% 70%)',
          height: 64,
          normalize: true,
          interact: true,
          barWidth: 2,
          barGap: 1,
          barRadius: 2,
        });

        wavesurferRef.current = ws;

        ws.on('ready', () => {
          setIsLoading(false);
          setTotalDuration(ws.getDuration());
        });

        ws.on('audioprocess', (time: number) => {
          setCurrentTime(time);
          onTimeUpdate?.(time);
        });

        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));
        ws.on('finish', () => {
          setIsPlaying(false);
          setCurrentTime(0);
        });

        ws.on('error', (err: any) => {
          console.error('WaveSurfer error:', err);
          setError('Failed to load audio');
          setIsLoading(false);
        });

        ws.setVolume(volume);
        await ws.load(audioUrl);
      } catch (err) {
        console.error('WaveSurfer init error:', err);
        setError('Audio player unavailable');
        setIsLoading(false);
      }
    };

    initWaveSurfer();

    return () => {
      if (ws) {
        ws.destroy();
        wavesurferRef.current = null;
      }
    };
  }, [audioUrl]);

  // Handle external seek
  useEffect(() => {
    if (seekTo !== undefined && wavesurferRef.current && totalDuration > 0) {
      const progress = seekTo / totalDuration;
      wavesurferRef.current.seekTo(Math.min(1, Math.max(0, progress)));
    }
  }, [seekTo, totalDuration]);

  const togglePlay = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  const toggleMute = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setMuted(!isMuted);
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(v);
    }
  };

  const skip = (seconds: number) => {
    if (wavesurferRef.current) {
      const current = wavesurferRef.current.getCurrentTime();
      const duration = wavesurferRef.current.getDuration();
      const newTime = Math.min(duration, Math.max(0, current + seconds));
      wavesurferRef.current.seekTo(newTime / duration);
    }
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (wavesurferRef.current) {
      wavesurferRef.current.setPlaybackRate(rate);
    }
  };

  if (!audioUrl) {
    return (
      <div className="flex items-center justify-center h-24 bg-muted/30 rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">No audio recording available</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      {/* Waveform */}
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded z-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error ? (
          <div className="h-16 flex items-center justify-center bg-muted/30 rounded border border-dashed border-border">
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div ref={waveformRef} className="waveform-container" />
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {/* Play controls */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => skip(-10)}>
            <SkipBack className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="default"
            size="icon"
            className="h-9 w-9"
            onClick={togglePlay}
            disabled={isLoading || !!error}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => skip(10)}>
            <SkipForward className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Time */}
        <div className="text-xs text-muted-foreground font-mono min-w-[80px]">
          {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(totalDuration))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Playback rate */}
        <div className="flex items-center gap-1">
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
            <button
              key={rate}
              onClick={() => handlePlaybackRateChange(rate)}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                playbackRate === rate
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleMute}>
            {isMuted || volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </Button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-20 h-1 accent-primary"
          />
        </div>

        {/* Download */}
        {audioUrl && (
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <a href={audioUrl} download>
              <Download className="w-3.5 h-3.5" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
