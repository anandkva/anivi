import { useState } from 'react';
import { disconnect, type Account, type Connection } from '../lib/account';
import { API_URL } from '../lib/config';

interface Props {
  account: Account;
  connection: Connection;
  online: number;
  onClose: () => void;
  onDisconnected: () => void;
}

/** Settings for one space: who it is, widget setup, and leaving it. */
export function SettingsSheet({ account, connection, online, onClose, onDisconnected }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState('');
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1600);
    } catch {
      // The value is on screen and selectable; no need for an error.
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await disconnect(account.userId, connection.connectionId);
      onDisconnected();
    } finally {
      setBusy(false);
    }
  }

  // Everything a widget host needs, ready to paste.
  const cardUrl = `${API_URL}/api/room/${connection.roomId}/card`;
  const widgetPageUrl = `${location.origin}/widget?room=${connection.roomId}&user=${account.userId}&actions=1`;
  const scriptUrl = `${location.origin}/anivi-widget.js`;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">{connection.peerName}</h2>

        <div className="sheet-row">
          <span className="sheet-label">Their Anivi Code</span>
          <button className="chip" onClick={() => copy('peer', connection.peerCode)}>
            {copied === 'peer' ? 'Copied ❤️' : connection.peerCode}
          </button>
        </div>

        <div className="sheet-row">
          <span className="sheet-label">My Anivi Code</span>
          <button className="chip" onClick={() => copy('mine', account.aniviCode)}>
            {copied === 'mine' ? 'Copied ❤️' : account.aniviCode}
          </button>
        </div>

        <div className="sheet-row">
          <span className="sheet-label">Right now</span>
          <span className="sheet-value">{online > 1 ? '🟢 Both here' : '💤 Away'}</span>
        </div>

        <button
          className="widget-toggle"
          onClick={() => setWidgetOpen((v) => !v)}
          aria-expanded={widgetOpen}
        >
          <span>❤️ Add the Home Screen widget</span>
          <span aria-hidden="true">{widgetOpen ? '▾' : '▸'}</span>
        </button>

        {widgetOpen && (
          <div className="widget-note">
            <p>
              iPhone and Android don&rsquo;t let a website install a widget on its own, so Anivi
              feeds one through a widget app. Copy what you need here.
            </p>

            <div className="copy-row">
              <span className="copy-label">Room ID</span>
              <button className="copy-value" onClick={() => copy('room', connection.roomId)}>
                {copied === 'room' ? 'Copied ❤️' : connection.roomId}
              </button>
            </div>

            <p className="widget-note-title">iPhone — Scriptable</p>
            <ol className="widget-steps">
              <li>Install <b>Scriptable</b> (free, App Store).</li>
              <li>
                Open{' '}
                <a href={scriptUrl} target="_blank" rel="noreferrer">
                  the widget script
                </a>{' '}
                → select all → copy → paste into a new Scriptable script named <b>Anivi</b>.
              </li>
              <li>Home Screen → long press → <b>+</b> → Scriptable → Small or Medium.</li>
              <li>
                Long press the widget → <b>Edit Widget</b> → Script: <b>Anivi</b>, When
                Interacting: <b>Run Script</b>, Parameter: the Room ID above.
              </li>
            </ol>

            <p className="widget-note-title">Android — image or web widget</p>
            <div className="copy-row">
              <span className="copy-label">Card image URL</span>
              <button className="copy-value" onClick={() => copy('card', cardUrl)}>
                {copied === 'card' ? 'Copied ❤️' : cardUrl}
              </button>
            </div>
            <div className="copy-row">
              <span className="copy-label">Widget page URL</span>
              <button className="copy-value" onClick={() => copy('page', widgetPageUrl)}>
                {copied === 'page' ? 'Copied ❤️' : widgetPageUrl}
              </button>
            </div>
            <p>
              Add an &ldquo;image from URL&rdquo; widget and paste the card image URL, or a web page
              widget and paste the widget page URL. Refresh every 15–30 minutes.
            </p>
          </div>
        )}

        {confirming ? (
          <div className="leave-confirm">
            <p>
              Removing {connection.peerName} closes this space for both of you, including the
              conversation.
            </p>
            <div className="leave-actions">
              <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
                Keep ❤️
              </button>
              <button className="btn btn-danger" onClick={handleDisconnect} disabled={busy}>
                {busy ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-ghost danger-text" onClick={() => setConfirming(true)}>
            Remove {connection.peerName}
          </button>
        )}
      </section>
    </div>
  );
}
