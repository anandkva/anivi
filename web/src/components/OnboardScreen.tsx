import React, { useState } from 'react';
import { createAccount, normalizeAniviCode, signIn, type Account, type NewAccount } from '../lib/account';
import { unlockSound } from '../lib/sound';
import { ShaderDotCanvas } from './ui/ShaderDotCanvas';
import { MessageSquare, ArrowRight, Copy, Check, Lock, Shield, KeyRound, User } from 'lucide-react';

interface Props {
  onReady: (account: Account) => void;
  hadLegacyPairing?: boolean;
}

type Step = 'welcome' | 'created' | 'signin';

export function OnboardScreen({ onReady }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [created, setCreated] = useState<NewAccount | null>(null);
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1600);
    } catch {
      // ignore
    }
  }

  async function handleCreate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    unlockSound();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a display name');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const account = await createAccount(trimmed);
      setCreated(account);
      setStep('created');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handleSignIn(e?: React.FormEvent) {
    if (e) e.preventDefault();
    unlockSound();
    const normalized = normalizeAniviCode(code);
    if (!normalized) {
      setError('An Anivi Code looks like ANV-8K29P');
      return;
    }
    if (!pin.trim()) {
      setError('Enter your 6-character private PIN');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onReady(await signIn(normalized, pin));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in");
    } finally {
      setBusy(false);
    }
  }

  // Step 2: Account Created Celebration Card
  if (step === 'created' && created) {
    return (
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: '#080c10',
        color: '#fff',
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif"
      }}>
        <ShaderDotCanvas />
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          background: 'radial-gradient(circle at center, rgba(0,0,0,0.6) 0%, rgba(8,12,16,0.95) 100%)',
          pointerEvents: 'none'
        }} />

        <div className="glass-card" style={{
          position: 'relative',
          zIndex: 2,
          padding: '2.5rem 2rem',
          width: '100%',
          maxWidth: '440px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #00a884, #06b6d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            marginBottom: '1rem',
            boxShadow: '0 4px 20px rgba(0, 168, 132, 0.4)'
          }}>
            <Check size={28} />
          </div>

          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            Welcome, {created.name}! ✨
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#8b949e', marginBottom: '1.5rem' }}>
            Your private Anivi space is ready.
          </p>

          {/* Anivi Code Card */}
          <div style={{
            width: '100%',
            backgroundColor: 'rgba(0,0,0,0.4)',
            borderRadius: '12px',
            padding: '1rem',
            border: '1px solid rgba(255,255,255,0.08)',
            marginBottom: '1rem',
            textAlign: 'left'
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#00a884', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              My Anivi Code (Share this)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 700, color: '#fff', letterSpacing: '1px' }}>
                {created.aniviCode}
              </span>
              <button
                onClick={() => copy('code', created.aniviCode)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'rgba(0, 168, 132, 0.15)',
                  border: '1px solid rgba(0, 168, 132, 0.3)',
                  color: '#00a884',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {copied === 'code' ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied === 'code' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Sign-in PIN Card */}
          {created.signInPin && (
            <div style={{
              width: '100%',
              backgroundColor: 'rgba(0,0,0,0.4)',
              borderRadius: '12px',
              padding: '1rem',
              border: '1px solid rgba(255,255,255,0.08)',
              marginBottom: '1.5rem',
              textAlign: 'left'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ec4899', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Lock size={12} />
                <span>Private Sign-In PIN (Keep Secret)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 700, color: '#fff', letterSpacing: '2px' }}>
                  {created.signInPin}
                </span>
                <button
                  onClick={() => copy('pin', created.signInPin)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'rgba(236, 72, 153, 0.15)',
                    border: '1px solid rgba(236, 72, 153, 0.3)',
                    color: '#ec4899',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {copied === 'pin' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied === 'pin' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => onReady(created)}
            className="btn-21st-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '14px' }}
          >
            <span>Enter WhatsApp Web</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  // Step 1 & 3: Login / Sign-up Forms
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      background: '#080c10',
      color: '#fff',
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif"
    }}>
      {/* 21st.dev Interactive WebGL Three.js Dot Shader */}
      <ShaderDotCanvas />

      {/* Vignette */}
      <div style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        background: 'radial-gradient(circle at center, rgba(0,0,0,0.6) 0%, rgba(8,12,16,0.95) 100%)',
        pointerEvents: 'none'
      }} />

      {/* Glassmorphic Modal Card */}
      <div className="glass-card" style={{
        position: 'relative',
        zIndex: 2,
        padding: '2.5rem 2rem',
        width: '100%',
        maxWidth: '420px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        {/* Brand Logo */}
        <div style={{
          background: 'linear-gradient(135deg, #00a884 0%, #06b6d4 100%)',
          width: '52px',
          height: '52px',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          marginBottom: '1rem',
          boxShadow: '0 4px 20px rgba(0, 168, 132, 0.4)'
        }}>
          <MessageSquare size={26} />
        </div>

        {step === 'welcome' ? (
          <div style={{ width: '100%', textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem', letterSpacing: '-0.025em' }}>
              Create Your Space
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#8b949e', marginBottom: '1.25rem' }}>
              Enter a display name to get started on WhatsApp Anivi.
            </p>

            <form onSubmit={handleCreate} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Your display name (e.g. Anand)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.8rem 1rem 0.8rem 2.6rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    fontSize: '0.95rem',
                    outline: 'none'
                  }}
                />
                <User size={18} color="#8b949e" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>

              {error && (
                <div style={{ color: '#ef4444', fontSize: '0.85rem', textAlign: 'left' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="btn-21st-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '0.85rem' }}
              >
                <span>{busy ? 'Creating...' : 'Create Account'}</span>
                <ArrowRight size={17} />
              </button>
            </form>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', width: '100%', margin: '1.25rem 0' }} />

            <div style={{ fontSize: '0.875rem', color: '#8b949e' }}>
              Already have an Anivi Code?{' '}
              <button
                onClick={() => {
                  setError('');
                  setStep('signin');
                }}
                style={{
                  color: '#00a884',
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: 'inherit'
                }}
              >
                Sign In
              </button>
            </div>
          </div>
        ) : (
          <div style={{ width: '100%', textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem', letterSpacing: '-0.025em' }}>
              Sign In to Anivi
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#8b949e', marginBottom: '1.25rem' }}>
              Enter your Anivi Code and private PIN.
            </p>

            <form onSubmit={handleSignIn} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Anivi Code (e.g. ANV-8K29P)"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.8rem 1rem 0.8rem 2.6rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    fontSize: '0.95rem',
                    fontFamily: 'monospace',
                    outline: 'none'
                  }}
                />
                <Shield size={18} color="#8b949e" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  placeholder="6-character Sign-In PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  maxLength={10}
                  required
                  style={{
                    width: '100%',
                    padding: '0.8rem 1rem 0.8rem 2.6rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    fontSize: '0.95rem',
                    outline: 'none'
                  }}
                />
                <KeyRound size={18} color="#8b949e" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>

              {error && (
                <div style={{ color: '#ef4444', fontSize: '0.85rem', textAlign: 'left' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="btn-21st-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '0.85rem' }}
              >
                <span>{busy ? 'Signing In...' : 'Sign In'}</span>
                <ArrowRight size={17} />
              </button>
            </form>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', width: '100%', margin: '1.25rem 0' }} />

            <div style={{ fontSize: '0.875rem', color: '#8b949e' }}>
              Need a new account?{' '}
              <button
                onClick={() => {
                  setError('');
                  setStep('welcome');
                }}
                style={{
                  color: '#00a884',
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: 'inherit'
                }}
              >
                Create Account
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: '1.25rem', fontSize: '0.75rem', color: '#6e7681', textAlign: 'center' }}>
          End-to-end encrypted • anivi.anandkva.in
        </div>
      </div>
    </div>
  );
}
