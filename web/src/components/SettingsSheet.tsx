import { useState } from 'react';
import { API_URL } from '../lib/config';
import type { Pairing } from '../lib/storage';

interface Props {
  pairing: Pairing;
  online: number;
  onClose: () => void;
  onLeave: () => void;
}

/** Settings: the Love Code, Home Screen widget setup, and Leave Space. */
export function SettingsSheet({ pairing, online, onClose, onLeave }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState('');
  const [widgetOpen, setWidgetOpen] = useState(false);

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1600);
    } catch {
      // Clipboard is blocked outside a secure context; the value is on screen
      // and selectable, so this is not worth an error message.
    }
  }

  // Everything a widget host needs, ready to paste.
  const cardUrl = `${API_URL}/api/room/${pairing.roomId}/card`;
  const widgetPageUrl = `${location.origin}/widget?room=${pairing.roomId}&user=${pairing.userId}&actions=1`;
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
        <h2 className="sheet-title">Settings</h2>

        <div className="sheet-row">
          <span className="sheet-label">Your Love Code</span>
          <button className="chip" onClick={() => copy('code', pairing.loveCode)}>
            {copied === 'code' ? 'Copied ❤️' : pairing.loveCode || '—'}
          </button>
        </div>

        <div className="sheet-row">
          <span className="sheet-label">Partner</span>
          <span className="sheet-value">
            {online > 1 ? '🟢 Together right now' : pairing.paired ? '💤 Away' : '⏳ Not joined yet'}
          </span>
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
              <button className="copy-value" onClick={() => copy('room', pairing.roomId)}>
                {copied === 'room' ? 'Copied ❤️' : pairing.roomId}
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
                Interacting: <b>Run Script</b>, Parameter: your Room ID above.
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
              Add an &ldquo;image from URL&rdquo; widget and paste the card image URL, or a web
              page widget and paste the widget page URL. Refresh every 15–30 minutes.
            </p>

            <p>
              Want just the app icon? iPhone: <b>Share → Add to Home Screen</b>. Android:{' '}
              <b>⋮ → Install app</b>.
            </p>
          </div>
        )}

        {confirming ? (
          <div className="leave-confirm">
            <p>Leaving clears this device&rsquo;s pairing. Your partner keeps the space.</p>
            <div className="leave-actions">
              <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
                Stay ❤️
              </button>
              <button className="btn btn-danger" onClick={onLeave}>
                Leave Space
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-ghost danger-text" onClick={() => setConfirming(true)}>
            Leave Space
          </button>
        )}
      </section>
    </div>
  );
}
