import { useState } from 'react';
import { createSpace, joinSpace } from '../lib/api';
import { normalizeLoveCode } from '../lib/protocol';
import type { Pairing } from '../lib/storage';
import { unlockSound } from '../lib/sound';

type Mode = 'welcome' | 'created' | 'joining';

interface Props {
  initialCode?: string;
  onPaired: (pairing: Pairing) => void;
}

/** First launch: create a space, or join the partner's with their Love Code. */
export function PairScreen({ initialCode = '', onPaired }: Props) {
  const [mode, setMode] = useState<Mode>(initialCode ? 'joining' : 'welcome');
  const [pending, setPending] = useState<Pairing | null>(null);
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    unlockSound();
    setBusy(true);
    setError('');
    try {
      const pairing = await createSpace();
      setPending(pairing);
      setMode('created');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    unlockSound();
    const normalized = normalizeLoveCode(code);
    if (!normalized) {
      setError('A Love Code looks like LOVE-7K3P9');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onPaired(await joinSpace(normalized));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!pending) return;
    try {
      await navigator.clipboard.writeText(pending.loveCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copying failed — you can read the code out instead');
    }
  }

  if (mode === 'created' && pending) {
    return (
      <main className="screen pair">
        <p className="pair-eyebrow">Your Love Code</p>
        <p className="love-code">{pending.loveCode}</p>
        <p className="pair-sub">Share this with your partner ❤️</p>

        <button className="btn btn-primary" onClick={copyCode}>
          {copied ? 'Copied ❤️' : 'Copy Code'}
        </button>
        <button className="btn btn-ghost" onClick={() => onPaired(pending)}>
          Enter our space →
        </button>
        <p className="pair-hint">
          Your space stays open. Your partner can join any time with this code.
        </p>
      </main>
    );
  }

  return (
    <main className="screen pair">
      <div className="pair-mark" aria-hidden="true">
        ❤️
      </div>
      <h1 className="wordmark">Anivi</h1>
      <p className="tagline">A little space for us</p>

      <button className="btn btn-primary" onClick={handleCreate} disabled={busy}>
        {busy && mode === 'welcome' ? 'Creating…' : 'Create Our Space ❤️'}
      </button>

      <p className="pair-or">or</p>

      <label className="field-label" htmlFor="love-code">
        Enter your partner&rsquo;s code
      </label>
      <input
        id="love-code"
        className="code-input"
        value={code}
        onChange={(e) => {
          setCode(e.target.value.toUpperCase());
          setError('');
        }}
        onFocus={() => setMode('joining')}
        placeholder="LOVE-7K3P9"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        maxLength={12}
      />
      <button className="btn btn-secondary" onClick={handleJoin} disabled={busy}>
        {busy && mode === 'joining' ? 'Joining…' : 'Join ❤️'}
      </button>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
