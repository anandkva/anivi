import React, { useState } from 'react';
import { 
  MessageSquare, 
  CheckCheck, 
  Check, 
  Clock, 
  Mic, 
  Lock, 
  Sparkles, 
  ArrowRight, 
  Zap, 
  Volume2, 
  Fingerprint, 
  Play, 
  Pause,
  Copy
} from 'lucide-react';
import { soundEffects } from '../lib/chatStore';
import { ShaderDotCanvas } from './ui/ShaderDotCanvas';

interface LandingPageProps {
  onOpenApp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenApp }) => {
  // Interactive Simulator State
  const [simMessages, setSimMessages] = useState<Array<{
    id: string;
    text?: string;
    isVoice?: boolean;
    duration?: number;
    sender: 'me' | 'partner';
    status: 'pending' | 'sent' | 'delivered' | 'read';
    time: string;
  }>>([
    {
      id: '1',
      text: 'Hey! Check out the real-time tick marks and voice notes on Anivi ✨',
      sender: 'partner',
      status: 'read',
      time: '12:40 PM',
    },
    {
      id: '2',
      isVoice: true,
      duration: 14,
      sender: 'me',
      status: 'read',
      time: '12:41 PM',
    },
    {
      id: '3',
      text: 'The WebSocket delivery is instant! Ticks turn double blue right on read 🚀',
      sender: 'me',
      status: 'read',
      time: '12:42 PM',
    }
  ]);

  const [simInput, setSimInput] = useState('');
  const [simVoicePlaying, setSimVoicePlaying] = useState(false);
  const [demoCode] = useState('ANIVI-8X9P2');
  const [copiedCode, setCopiedCode] = useState(false);
  const [currentWallpaper, setCurrentWallpaper] = useState<'doodle' | 'emerald' | 'midnight'>('doodle');

  // Interactive message test sender
  const handleSimSend = (textToSend?: string) => {
    const text = textToSend || simInput.trim() || 'Testing instant WhatsApp ticks! 💬';
    soundEffects.playSend();

    const newId = Date.now().toString();
    const newMsg = {
      id: newId,
      text,
      sender: 'me' as const,
      status: 'pending' as const,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setSimMessages((prev) => [...prev, newMsg]);
    setSimInput('');

    // Step 1: Sent (Single Tick)
    setTimeout(() => {
      setSimMessages((prev) =>
        prev.map((m) => (m.id === newId ? { ...m, status: 'sent' } : m))
      );
    }, 400);

    // Step 2: Delivered (Double Grey Tick)
    setTimeout(() => {
      setSimMessages((prev) =>
        prev.map((m) => (m.id === newId ? { ...m, status: 'delivered' } : m))
      );
    }, 900);

    // Step 3: Read (Double Blue Tick)
    setTimeout(() => {
      soundEffects.playReceive();
      setSimMessages((prev) =>
        prev.map((m) => (m.id === newId ? { ...m, status: 'read' } : m))
      );
    }, 1700);
  };

  const handleSimVoiceToggle = () => {
    setSimVoicePlaying(!simVoicePlaying);
    if (!simVoicePlaying) {
      soundEffects.playSend();
    }
  };

  const handleCopyCode = () => {
    void navigator.clipboard.writeText(demoCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="cyber-mesh-bg" style={{ minHeight: '100vh', overflowY: 'auto', position: 'relative' }}>
      {/* 21st.dev WebGL Interactive Shader Dot Matrix */}
      <ShaderDotCanvas />

      {/* Background Aurora Orbs */}
      <div className="aurora-glow-sphere aurora-sphere-emerald" />
      <div className="aurora-glow-sphere aurora-sphere-cyan" />

      {/* Navigation Header */}
      <header style={{
        height: '76px',
        padding: '0 36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backdropFilter: 'blur(20px)',
        backgroundColor: 'rgba(8, 12, 16, 0.75)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }} onClick={onOpenApp}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #00a884 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 16px rgba(0, 168, 132, 0.4)'
          }}>
            <MessageSquare size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '20px', letterSpacing: '-0.4px', color: '#fff' }}>
              Anivi <span style={{ color: '#00a884', fontSize: '13px', fontWeight: 700, padding: '2px 6px', background: 'rgba(0,168,132,0.15)', borderRadius: '6px' }}>WEB</span>
            </div>
            <div style={{ fontSize: '11px', color: '#8b949e', letterSpacing: '0.2px' }}>anivi.anandkva.in</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={onOpenApp}
            className="btn-21st-primary"
          >
            <span>Launch Web App</span>
            <ArrowRight size={17} />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '70px 24px 40px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '52px',
        alignItems: 'center'
      }}>
        <div>
          {/* Badge */}
          <div className="badge-pill-21st" style={{ marginBottom: '24px' }}>
            <div className="pulse-dot-21st" />
            <span>21st Century WhatsApp-Grade Real-Time Engine</span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: '52px',
            lineHeight: 1.12,
            fontWeight: 800,
            color: '#ffffff',
            marginBottom: '24px',
            letterSpacing: '-1.2px'
          }}>
            Instant Chat.<br />
            <span className="text-shimmer">Zero Latency.</span><br />
            Real-Time Delivery.
          </h1>

          <p style={{
            fontSize: '17.5px',
            lineHeight: 1.65,
            color: '#8b949e',
            marginBottom: '36px',
            maxWidth: '540px'
          }}>
            Experience state-of-the-art real-time messaging with live delivery tick transitions (✔ → ✔✔ → ✔✔), audio waveforms, screen PIN locks, and customizable dark/doodle wallpapers.
          </p>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '40px' }}>
            <button
              onClick={onOpenApp}
              className="btn-21st-primary"
              style={{ fontSize: '16px', padding: '14px 36px' }}
            >
              <span>Get Started Now</span>
              <ArrowRight size={18} />
            </button>
            <button
              onClick={() => handleSimSend('Trying out the live demo! ⚡')}
              className="btn-21st-secondary"
            >
              <Zap size={18} color="#00a884" />
              <span>Test Real-Time Tick</span>
            </button>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'flex', gap: '32px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '24px' }}>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#00a884' }}>&lt; 50ms</div>
              <div style={{ fontSize: '12px', color: '#8b949e' }}>Delivery Latency</div>
            </div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#06b6d4' }}>100%</div>
              <div style={{ fontSize: '12px', color: '#8b949e' }}>End-to-End Privacy</div>
            </div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#a855f7' }}>4-6 PIN</div>
              <div style={{ fontSize: '12px', color: '#8b949e' }}>Screen Lock Security</div>
            </div>
          </div>
        </div>

        {/* 21st.dev Interactive Live Chat Simulator */}
        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
          {/* Mockup Header */}
          <div style={{
            padding: '14px 20px',
            backgroundColor: 'rgba(20, 30, 40, 0.85)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ position: 'relative' }}>
                <img
                  src="https://api.dicebear.com/7.x/bottts/svg?seed=Anivi"
                  alt="Partner"
                  style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#1a2530' }}
                />
                <div className="wa-online-dot" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: '#ffffff' }}>Anivi Partner</div>
                <div style={{ fontSize: '12px', color: '#00a884', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>online • live sync</span>
                </div>
              </div>
            </div>

            {/* Quick Wallpaper Switcher */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['doodle', 'emerald', 'midnight'] as const).map((wp) => (
                <button
                  key={wp}
                  onClick={() => setCurrentWallpaper(wp)}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: currentWallpaper === wp ? '2px solid #00a884' : '1px solid rgba(255,255,255,0.2)',
                    background: wp === 'doodle' ? '#0b141a' : wp === 'emerald' ? '#081c17' : '#060a10',
                    cursor: 'pointer'
                  }}
                  title={`Wallpaper: ${wp}`}
                />
              ))}
            </div>
          </div>

          {/* Simulator Message Stream */}
          <div
            className={`chat-wallpaper-${currentWallpaper}`}
            style={{
              padding: '24px 20px',
              height: '320px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            {simMessages.map((msg) => {
              const isMine = msg.sender === 'me';
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: isMine ? 'flex-end' : 'flex-start',
                    width: '100%'
                  }}
                >
                  <div style={{
                    maxWidth: '82%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    backgroundColor: isMine ? '#005c4b' : '#1b2631',
                    color: '#ffffff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                    fontSize: '14px',
                    position: 'relative'
                  }}>
                    {msg.isVoice ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '200px' }}>
                        <button
                          onClick={handleSimVoiceToggle}
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            backgroundColor: '#00a884',
                            border: 'none',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          {simVoicePlaying ? <Pause size={16} fill="#fff" /> : <Play size={16} fill="#fff" style={{ marginLeft: '2px' }} />}
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5px', flex: 1 }}>
                          {[8, 14, 22, 16, 26, 18, 24, 12, 20, 15, 28, 19, 10].map((h, i) => (
                            <div
                              key={i}
                              style={{
                                width: '3px',
                                height: `${simVoicePlaying ? Math.max(6, (h + (i % 3) * 6) % 28) : h}px`,
                                backgroundColor: simVoicePlaying ? '#53bdeb' : 'rgba(255,255,255,0.4)',
                                borderRadius: '2px',
                                transition: 'height 0.15s'
                              }}
                            />
                          ))}
                        </div>
                        <span style={{ fontSize: '11px', color: '#8696a0' }}>0:{msg.duration}</span>
                      </div>
                    ) : (
                      <div>{msg.text}</div>
                    )}

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '4px',
                      fontSize: '10.5px',
                      color: 'rgba(255,255,255,0.6)',
                      marginTop: '4px'
                    }}>
                      <span>{msg.time}</span>
                      {isMine && (
                        msg.status === 'pending' ? (
                          <Clock size={12} color="#8696a0" />
                        ) : msg.status === 'sent' ? (
                          <Check size={14} color="#8696a0" />
                        ) : msg.status === 'delivered' ? (
                          <CheckCheck size={15} color="#8696a0" />
                        ) : (
                          <CheckCheck size={15} color="#53bdeb" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Simulator Input Bar */}
          <div style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(20, 30, 40, 0.95)',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <input
              type="text"
              placeholder="Type message to test instant delivery..."
              value={simInput}
              onChange={(e) => setSimInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSimSend()}
              style={{
                flex: 1,
                padding: '10px 14px',
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                color: '#ffffff',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <button
              onClick={() => handleSimSend()}
              className="btn-21st-primary"
              style={{ padding: '10px 18px', fontSize: '13.5px' }}
            >
              <span>Send</span>
            </button>
          </div>
        </div>
      </section>

      {/* 21st.dev Bento Grid Feature Showcase */}
      <section style={{
        maxWidth: '1280px',
        margin: '60px auto',
        padding: '0 24px',
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '24px'
      }}>
        {/* Bento 1: Tick Delivery Engine (Span 7) */}
        <div className="glass-card" style={{ gridColumn: 'span 7', padding: '32px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: 'rgba(0, 168, 132, 0.15)',
            color: '#00a884',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px'
          }}>
            <CheckCheck size={26} />
          </div>
          <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', marginBottom: '10px' }}>
            Tri-State Real-Time Tick Pipeline
          </h3>
          <p style={{ fontSize: '15px', color: '#8b949e', lineHeight: 1.6, marginBottom: '24px' }}>
            Full WhatsApp acknowledgment protocol tracking every message lifecycle stage with millisecond precision and client-side privacy controls.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '14px',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', marginBottom: '8px' }}>
                <Check size={18} color="#8696a0" />
              </div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#ffffff' }}>Single Grey</div>
              <div style={{ fontSize: '11px', color: '#8b949e' }}>Sent from device</div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', marginBottom: '8px' }}>
                <CheckCheck size={18} color="#8696a0" />
              </div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#ffffff' }}>Double Grey</div>
              <div style={{ fontSize: '11px', color: '#8b949e' }}>Delivered to peer</div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(83, 189, 235, 0.15)', marginBottom: '8px' }}>
                <CheckCheck size={18} color="#53bdeb" />
              </div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#53bdeb' }}>Double Blue</div>
              <div style={{ fontSize: '11px', color: '#8b949e' }}>Read by peer</div>
            </div>
          </div>
        </div>

        {/* Bento 2: Screen PIN Security (Span 5) */}
        <div className="glass-card" style={{ gridColumn: 'span 5', padding: '32px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: 'rgba(83, 189, 235, 0.15)',
            color: '#53bdeb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px'
          }}>
            <Lock size={26} />
          </div>
          <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', marginBottom: '10px' }}>
            Biometric & PIN Lock
          </h3>
          <p style={{ fontSize: '15px', color: '#8b949e', lineHeight: 1.6, marginBottom: '20px' }}>
            Protect your messages with a 4–6 digit security screen lock, auto-lock timeouts (1m, 15m, 1h), and biometric unlock.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#53bdeb', fontSize: '13px', fontWeight: 600 }}>
            <Fingerprint size={20} />
            <span>Biometric Simulation Ready</span>
          </div>
        </div>

        {/* Bento 3: Voice Waveforms (Span 6) */}
        <div className="glass-card" style={{ gridColumn: 'span 6', padding: '32px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: 'rgba(236, 72, 153, 0.15)',
            color: '#ec4899',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px'
          }}>
            <Mic size={26} />
          </div>
          <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', marginBottom: '10px' }}>
            Voice Notes Studio
          </h3>
          <p style={{ fontSize: '15px', color: '#8b949e', lineHeight: 1.6, marginBottom: '16px' }}>
            Record high-fidelity audio notes with live waveform sampling, interactive bar scrubbing, and 1x/1.5x/2x playback speeds.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ec4899', fontSize: '13px', fontWeight: 600 }}>
            <Volume2 size={18} />
            <span>Web Audio API Equalizer</span>
          </div>
        </div>

        {/* Bento 4: Direct Code Pairing (Span 6) */}
        <div className="glass-card" style={{ gridColumn: 'span 6', padding: '32px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: 'rgba(168, 85, 247, 0.15)',
            color: '#a855f7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px'
          }}>
            <Sparkles size={26} />
          </div>
          <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', marginBottom: '10px' }}>
            Instant Code Pairing
          </h3>
          <p style={{ fontSize: '15px', color: '#8b949e', lineHeight: 1.6, marginBottom: '16px' }}>
            No complicated passwords. Share a memorable Anivi Code to connect directly across browsers or phones.
          </p>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            backgroundColor: 'rgba(0,0,0,0.3)',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <span style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: '#00a884' }}>
              {demoCode}
            </span>
            <button
              onClick={handleCopyCode}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px'
              }}
            >
              <Copy size={15} />
              <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        backgroundColor: 'rgba(8, 12, 16, 0.85)',
        backdropFilter: 'blur(20px)',
        padding: '36px 24px',
        textAlign: 'center',
        color: '#8b949e',
        fontSize: '13.5px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontWeight: 700, color: '#ffffff' }}>Anivi Web</span>
          <span>•</span>
          <span style={{ color: '#00a884' }}>anivi.anandkva.in</span>
        </div>
        <p>Production-Grade Real-Time Chat Web Application inspired by WhatsApp Web & 21st.dev</p>
      </footer>
    </div>
  );
};
