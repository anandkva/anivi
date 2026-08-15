import { useState } from 'react';
import type { Pairing } from '../lib/storage';

interface Props {
  pairing: Pairing;
  online: number;
  onClose: () => void;
  onLeave: () => void;
}

/** Settings: the Love Code, how to get the Home Screen widget, and Leave Space. */
export function SettingsSheet({ pairing, online, onClose, onLeave }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(pairing.loveCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* reading it out works too */
    }
  }

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
          <button className="chip" onClick={copyCode}>
            {copied ? 'Copied ❤️' : pairing.loveCode || '—'}
          </button>
        </div>

        <div className="sheet-row">
          <span className="sheet-label">Partner</span>
          <span className="sheet-value">
            {online > 1 ? '🟢 Together right now' : pairing.paired ? '💤 Away' : '⏳ Not joined yet'}
          </span>
        </div>

        <div className="widget-note">
          <p className="widget-note-title">❤️ Anivi on your Home Screen</p>
          <p>
            The Home Screen widget lives in the native Anivi apps — WidgetKit on iOS, Glance on
            Android. Install the app on your phone, open it once with this Love Code, then add the
            Anivi widget from the Home Screen.
          </p>
          <p>
            This web version can still be added to your Home Screen: <b>Share → Add to Home
            Screen</b> on iPhone, or <b>Install app</b> on Android.
          </p>
        </div>

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
