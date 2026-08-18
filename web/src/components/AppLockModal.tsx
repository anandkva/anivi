import React, { useState, useEffect } from 'react';
import { Lock, Delete, Fingerprint, ShieldCheck } from 'lucide-react';
import { loadSettings, setAppLocked, recordAppActivity } from '../lib/settingsStore';

interface AppLockModalProps {
  onUnlocked: () => void;
}

export const AppLockModal: React.FC<AppLockModalProps> = ({ onUnlocked }) => {
  const [pin, setPin] = useState<string>('');
  const [errorShake, setErrorShake] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const settings = loadSettings();
  const targetPin = settings.appLockPin || '1234';

  const handleKeyPress = (num: string) => {
    if (pin.length < 6) {
      const nextPin = pin + num;
      setPin(nextPin);
      setErrorMessage('');

      if (nextPin.length === targetPin.length) {
        verifyPin(nextPin);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMessage('');
  };

  const verifyPin = (inputPin: string) => {
    if (inputPin === targetPin) {
      setAppLocked(false);
      recordAppActivity();
      onUnlocked();
    } else {
      setErrorShake(true);
      setErrorMessage('Incorrect PIN. Try again.');
      setTimeout(() => {
        setPin('');
        setErrorShake(false);
      }, 500);
    }
  };

  const handleBiometricUnlock = () => {
    // Simulated instant biometric authentication
    setAppLocked(false);
    recordAppActivity();
    onUnlocked();
  };

  // Listen to physical keyboard numeric keys
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pin, targetPin]);

  return (
    <div className="wa-lock-screen">
      <div style={{
        maxWidth: '380px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: 'rgba(0, 168, 132, 0.15)',
          color: '#00a884',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px'
        }}>
          <Lock size={32} />
        </div>

        <h2 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
          Anivi Locked
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Enter your {targetPin.length}-digit PIN to unlock
        </p>

        {/* PIN Dot Indicators */}
        <div className={`wa-pin-dots ${errorShake ? 'wa-shake' : ''}`}>
          {Array.from({ length: targetPin.length }).map((_, index) => (
            <div
              key={index}
              className={`wa-pin-dot ${index < pin.length ? 'filled' : ''}`}
            />
          ))}
        </div>

        {errorMessage && (
          <div style={{ color: 'var(--danger-color)', fontSize: '13px', marginBottom: '16px' }}>
            {errorMessage}
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="wa-pin-keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              className="wa-pin-key"
              onClick={() => handleKeyPress(digit)}
            >
              {digit}
            </button>
          ))}
          <button
            className="wa-pin-key"
            style={{ fontSize: '14px', color: 'var(--accent-green)' }}
            onClick={handleBiometricUnlock}
            title="Biometric Unlock"
          >
            <Fingerprint size={28} />
          </button>
          <button
            className="wa-pin-key"
            onClick={() => handleKeyPress('0')}
          >
            0
          </button>
          <button
            className="wa-pin-key"
            onClick={handleDelete}
            title="Delete"
          >
            <Delete size={22} />
          </button>
        </div>

        <div style={{ marginTop: '28px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
          <ShieldCheck size={16} color="var(--accent-green)" />
          <span>Secured by Screen Lock</span>
        </div>
      </div>
    </div>
  );
};
