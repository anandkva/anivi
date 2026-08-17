import { useState } from 'react';
import { createAccount, normalizeAniviCode, signIn, type Account, type NewAccount } from '../lib/account';
import { unlockSound } from '../lib/sound';

interface Props {
  onReady: (account: Account) => void;
  /** True when an old Love-Code pairing was found and cleared. */
  hadLegacyPairing?: boolean;
}

type Step = 'welcome' | 'created' | 'signin';

/**
 * First launch, on any device.
 *
 * A new person needs only a name. Someone who already has an account signs in
 * with their Anivi Code and PIN, so a second phone never means a second
 * account.
 */
export function OnboardScreen({ onReady, hadLegacyPairing = false }: Props) {
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
      /* both are on screen and selectable */
    }
  }

  async function handleCreate() {
    unlockSound();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('What should we call you?');
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

  async function handleSignIn() {
    unlockSound();
    const normalized = normalizeAniviCode(code);
    if (!normalized) {
      setError('An Anivi Code looks like ANV-8K29P');
      return;
    }
    if (!pin.trim()) {
      setError('Your sign-in PIN is the 6 characters shown when you created the account');
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

  // Both halves of the identity, shown once. The code is for sharing; the PIN
  // is not, and saying so here is the only chance we get.
  if (step === 'created' && created) {
    return (
      <main className="screen pair">
        <p className="pair-eyebrow">Welcome, {created.name} ❤️</p>

        <p className="code-card-label">My Anivi Code</p>
        <button className="love-code" onClick={() => copy('code', created.aniviCode)}>
          {copied === 'code' ? 'Copied ❤️' : created.aniviCode}
        </button>
        <p className="pair-sub">Share this with a partner, friend or family</p>

        {created.signInPin ? (
          <div className="pin-card">
            <p className="pin-label">Sign-in PIN — keep this private</p>
            <button className="pin-value" onClick={() => copy('pin', created.signInPin)}>
              {copied === 'pin' ? 'Copied ❤️' : created.signInPin}
            </button>
            <p className="pin-hint">
              You&rsquo;ll need it to sign in on another phone. It&rsquo;s shown only now — save it
              somewhere safe. Never share it: your Anivi Code is public, this isn&rsquo;t.
            </p>
          </div>
        ) : (
          // An older server didn't issue one. Say so rather than showing an
          // empty box; a PIN can be created later from Home.
          <p className="pair-hint legacy-note">
            No sign-in PIN yet — you can create one any time from Home, and you&rsquo;ll need it to
            sign in on another phone.
          </p>
        )}

        <button className="btn btn-primary" onClick={() => onReady(created)}>
          I&rsquo;ve saved it — continue →
        </button>
      </main>
    );
  }

  if (step === 'signin') {
    return (
      <main className="screen pair">
        <div className="pair-mark" aria-hidden="true">
          ❤️
        </div>
        <h1 className="wordmark">Welcome back</h1>
        <p className="tagline">Sign in with your Anivi Code</p>

        <label className="field-label" htmlFor="signin-code">
          My Anivi Code
        </label>
        <input
          id="signin-code"
          className="code-input"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError('');
          }}
          placeholder="ANV-8K29P"
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
        />

        <label className="field-label" htmlFor="signin-pin">
          Sign-in PIN
        </label>
        <input
          id="signin-pin"
          className="code-input"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.toUpperCase());
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSignIn();
          }}
          placeholder="K7M2QP"
          autoComplete="current-password"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={8}
        />

        <button className="btn btn-primary" onClick={handleSignIn} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in ❤️'}
        </button>
        <button className="btn btn-ghost" onClick={() => setStep('welcome')}>
          ← Create a new account instead
        </button>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
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

      {hadLegacyPairing && (
        <p className="pair-hint legacy-note">
          Anivi now works with Anivi Codes instead of Love Codes, so you&rsquo;ll need an account
          and to connect again.
        </p>
      )}

      <label className="field-label" htmlFor="name">
        Your name
      </label>
      <input
        id="name"
        className="name-input"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleCreate();
        }}
        placeholder="Anand"
        autoComplete="given-name"
        maxLength={40}
      />

      <button className="btn btn-primary" onClick={handleCreate} disabled={busy}>
        {busy ? 'Creating…' : 'Create Account ❤️'}
      </button>

      <p className="pair-or">or</p>

      <button className="btn btn-secondary" onClick={() => setStep('signin')}>
        I already have an Anivi Code
      </button>

      <p className="pair-hint">
        No phone number, no password. You&rsquo;ll get an Anivi Code to share, and a private PIN
        for signing in on another phone.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
