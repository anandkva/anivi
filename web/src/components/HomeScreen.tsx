import { useState } from 'react';
import { disconnect, resetPin, type Account, type Connection, type Relationship } from '../lib/account';
import { lastSeenAt } from '../lib/storage';

const RELATIONSHIP_BADGE: Record<Relationship, { art: string; label: string }> = {
  partner: { art: '❤️', label: 'Partner' },
  friend: { art: '👥', label: 'Friend' },
  family: { art: '🏠', label: 'Family' },
};

interface Props {
  account: Account;
  connections: Connection[];
  loading: boolean;
  error: string;
  onOpen: (connection: Connection) => void;
  onAddConnection: () => void;
  onRefresh: () => void;
  onDisconnected: (connectionId: string) => void;
  onSignOut: () => void;
}

/** Home: your code to share, and everyone you already share a space with. */
export function HomeScreen({
  account,
  connections,
  loading,
  error,
  onOpen,
  onAddConnection,
  onRefresh,
  onDisconnected,
  onSignOut,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  // Shown exactly once, right after it is issued: the server keeps only a hash.
  const [pin, setPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(account.aniviCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the code is on screen and selectable */
    }
  }

  async function handleRemove(connection: Connection) {
    if (!window.confirm(`Remove ${connection.peerName}? Your shared space goes with them.`)) return;
    setRemoving(connection.connectionId);
    try {
      await disconnect(account.userId, connection.connectionId);
      onDisconnected(connection.connectionId);
    } finally {
      setRemoving(null);
    }
  }

  async function makePin() {
    setPinBusy(true);
    try {
      setPin(await resetPin(account.userId));
    } catch {
      /* the button can simply be pressed again */
    } finally {
      setPinBusy(false);
    }
  }

  return (
    <main className="screen home">
      <header className="home-head">
        <div>
          <p className="home-hello">Hi {account.name} ❤️</p>
          <p className="home-sub">Your little space for everyone</p>
        </div>
        <button className="icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out">
          ⎋
        </button>
      </header>

      <section className="code-card">
        <p className="code-card-label">My Anivi Code</p>
        <button className="code-card-value" onClick={copyCode}>
          {copied ? 'Copied ❤️' : account.aniviCode}
        </button>
        <p className="code-card-hint">Share this with a partner, friend or family</p>

        {pin ? (
          <div className="pin-card">
            <p className="pin-label">Sign-in PIN — keep this private</p>
            <button
              className="pin-value"
              onClick={() => void navigator.clipboard.writeText(pin).catch(() => {})}
            >
              {pin}
            </button>
            <p className="pin-hint">
              Save it now — it isn&rsquo;t shown again. You need it to sign in on another phone.
              Never share it: your Anivi Code is public, this isn&rsquo;t.
            </p>
          </div>
        ) : (
          <button className="btn-inline pin-link" onClick={makePin} disabled={pinBusy}>
            {pinBusy ? 'Creating…' : '🔑 Create a sign-in PIN (for another phone)'}
          </button>
        )}
      </section>

      <section className="connections">
        <div className="connections-head">
          <h2 className="connections-title">Connected</h2>
          {!loading && (
            <button className="btn-inline" onClick={onRefresh}>
              Refresh
            </button>
          )}
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {loading && connections.length === 0 && <p className="home-sub">Loading…</p>}

        {!loading && connections.length === 0 && !error && (
          <p className="connections-empty">
            Nobody yet.
            <br />
            <span>Share your code, or enter someone else&rsquo;s to start a space.</span>
          </p>
        )}

        <ul className="connection-list">
          {connections.map((c) => {
            const badge = RELATIONSHIP_BADGE[c.relationship] ?? RELATIONSHIP_BADGE.partner;
            // Unread is "newer than this device last looked", and never your
            // own message: you don't have unread messages from yourself.
            const unread =
              c.lastActivityAt > 0 &&
              c.lastActivityBy !== account.userId &&
              c.lastActivityAt > lastSeenAt(c.roomId);
            return (
              <li
                key={c.connectionId}
                className={`connection-card ${c.relationship} ${unread ? 'unread' : ''}`}
              >
                <button className="connection-open" onClick={() => onOpen(c)}>
                  <span className="connection-art" aria-hidden="true">
                    {badge.art}
                  </span>
                  <span className="connection-body">
                    <span className="connection-name">{c.peerName}</span>
                    <span className="connection-rel">
                      {unread ? 'New message 💬' : `${badge.art} ${badge.label}`}
                    </span>
                  </span>
                  {unread ? (
                    <span className="connection-badge" aria-label="New message">
                      ●
                    </span>
                  ) : (
                    <span className="connection-go" aria-hidden="true">
                      →
                    </span>
                  )}
                </button>
                <button
                  className="connection-remove"
                  onClick={() => void handleRemove(c)}
                  disabled={removing === c.connectionId}
                  aria-label={`Remove ${c.peerName}`}
                >
                  {removing === c.connectionId ? '…' : '✕'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <button className="btn btn-primary new-connection" onClick={onAddConnection}>
        + New Connection
      </button>
    </main>
  );
}
