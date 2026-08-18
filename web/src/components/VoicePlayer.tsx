import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface VoicePlayerProps {
  src?: string;
  duration?: number;
  waveform?: number[];
  isSent?: boolean;
}

export const VoicePlayer: React.FC<VoicePlayerProps> = ({
  src,
  duration = 0,
  waveform = [],
  isSent = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const defaultWaveform = [
    0.2, 0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.3, 0.5, 0.7, 0.9, 0.8, 0.4, 0.6,
    0.7, 0.9, 0.5, 0.3, 0.6, 0.8, 0.4, 0.7, 0.5, 0.8, 0.6, 0.4, 0.3, 0.5
  ];
  const bars = waveform.length > 0 ? waveform : defaultWaveform;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = playbackRate;
      void audio.play();
      setIsPlaying(true);
    }
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.5, 2];
    const nextSpeed = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const seekTo = (fraction: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const totalDuration = audio.duration || duration || 1;
    audio.currentTime = fraction * totalDuration;
    setCurrentTime(audio.currentTime);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const totalDuration = duration || (audioRef.current?.duration || 0);
  const progressFraction = totalDuration > 0 ? currentTime / totalDuration : 0;

  return (
    <div className="wa-voice-player">
      {src && <audio ref={audioRef} src={src} preload="metadata" />}

      <button className="wa-voice-play-btn" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? <Pause size={18} fill="#fff" /> : <Play size={18} fill="#fff" style={{ marginLeft: '2px' }} />}
      </button>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* Waveform Bar Track */}
        <div
          className="wa-voice-bars-container"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            seekTo(fraction);
          }}
        >
          {bars.map((level, i) => {
            const barFraction = i / bars.length;
            const isPlayed = barFraction <= progressFraction;
            const barHeight = Math.max(4, Math.round(level * 22));
            return (
              <div
                key={i}
                className={`wa-voice-bar ${isPlayed ? 'played' : ''}`}
                style={{
                  height: `${barHeight}px`,
                  backgroundColor: isPlayed
                    ? '#53bdeb'
                    : isSent
                    ? 'rgba(255,255,255,0.45)'
                    : 'rgba(134,150,160,0.5)',
                }}
              />
            );
          })}
        </div>

        {/* Time and Speed */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {isPlaying ? formatTime(currentTime) : formatTime(totalDuration)}
          </span>
          <button className="wa-voice-speed-pill" onClick={cycleSpeed} title="Change playback speed">
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
};
