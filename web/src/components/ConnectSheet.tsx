import { useState } from 'react';
import { connect, normalizeAniviCode, type Connection, type Relationship } from '../lib/account';

const RELATIONSHIPS: { id: Relationship; art: string; label: string; blurb: string }[] = [
  { id: 'partner', art: '❤️', label: 'Partner', blurb: 'Hug, Miss You, Love, Kiss' },
  { id: 'friend', art: '👥', label: 'Friend', blurb: 'Cheers, Good Job, LOL' },
  { id: 'family', art: '🏠', label: 'Family', blurb: 'Take Care, Blessings, Home' },
];

interface Props {
  userId: string;
  myCode: string;
  onClose: () => void;
  onConnected: (connection: Connection, alreadyConnected: boolean) => void;
}

/**
 * Connecting to someone: their code, then what they are to you.
 *
 * The relationship is asked for up front because it decides what the space
 * becomes — it is not a label, it is the set of things you can send.
 */
export function ConnectSheet({ userId, myCode, onClose, onConnected }: Props) {
  const [code, setCode] = useState('');
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const normalized = normalizeAniviCode(code);

  async function shareMyCode() {
    const text = `Connect with me on Anivi ❤️ My Anivi Code is ${myCode}`;
    // The share sheet is the natural way to send this from a phone; copying is
    // the fallback where it isn't available.
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Anivi', text });
        return;
      } catch {
        /* dismissed — fall through to copying */
      }
    }
    try {
      await navigator.clipboard.writeText(myCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copying failed — you can read the code out instead');
    }
  }

  async function handleConnect() {
    if (!normalized) {
      setError('An Anivi Code looks like ANV-8K29P');
      return;
    }
    if (!relationship) {
      setError('Pick how they’re connected to you');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await connect(userId, normalized, relationship);
      onConnected(result.connection, result.alreadyConnected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Connect with someone"
      >
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">Connect someone</h2>

        <button className="btn btn-secondary" onClick={shareMyCode}>
          {copied ? 'Copied ❤️' : `Share my code · ${myCode}`}
        </button>

        <p className="pair-or">or</p>

        <label className="field-label" htmlFor="anivi-code">
          Enter their Anivi Code
        </label>
        <input
          id="anivi-code"
          className="code-input"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError('');
          }}
          placeholder="ANV-8K29P"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
        />

        <p className="field-label">How are they connected to you?</p>
        <div className="relationship-grid" role="radiogroup" aria-label="Relationship">
          {RELATIONSHIPS.map((r) => (
            <button
              key={r.id}
              className={`relationship-tile ${relationship === r.id ? 'active' : ''}`}
              onClick={() => {
                setRelationship(r.id);
                setError('');
              }}
              role="radio"
              aria-checked={relationship === r.id}
            >
              <span className="relationship-art" aria-hidden="true">
                {r.art}
              </span>
              <span className="relationship-label">{r.label}</span>
              <span className="relationship-blurb">{r.blurb}</span>
            </button>
          ))}
        </div>

        <button
          className="btn btn-primary"
          onClick={handleConnect}
          disabled={busy || !normalized || !relationship}
        >
          {busy ? 'Connecting…' : 'Connect ❤️'}
        </button>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
