import { useCallback, useEffect, useState } from 'react';
import { fetchMe, type Account, type Connection } from './lib/account';
import {
  clearAccount,
  dropLegacyPairing,
  loadAccount,
  loadLastConnectionId,
  saveAccount,
  saveLastConnectionId,
} from './lib/storage';
import { isAppLocked, recordAppActivity } from './lib/settingsStore';

import { LandingPage } from './components/LandingPage';
import { OnboardScreen } from './components/OnboardScreen';
import { WhatsAppLayout } from './components/WhatsAppLayout';
import { AppLockModal } from './components/AppLockModal';

export default function App() {
  const [account, setAccount] = useState<Account | null>(() => loadAccount());
  const [hadLegacyPairing] = useState(() => dropLegacyPairing());
  const [connections, setConnections] = useState<Connection[]>([]);
  const [initialConnectionId] = useState<string>(() => loadLastConnectionId());
  const [showLanding, setShowLanding] = useState<boolean>(() => !loadAccount());
  const [locked, setLocked] = useState<boolean>(() => isAppLocked());

  const refresh = useCallback(
    async (userId: string) => {
      try {
        const me = await fetchMe(userId);
        setConnections(
          [...me.connections].sort(
            (a, b) =>
              Math.max(b.lastActivityAt, b.createdAt) - Math.max(a.lastActivityAt, a.createdAt),
          ),
        );
        setAccount(me.account);
        saveAccount(me.account);
      } catch {
        // network retry later
      }
    },
    [],
  );

  useEffect(() => {
    if (account) void refresh(account.userId);
  }, [account?.userId, refresh]);

  // Periodic refresh & activity tracking
  useEffect(() => {
    if (!account) return;

    const onActivity = () => {
      recordAppActivity();
    };

    window.addEventListener('mousemove', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('touchstart', onActivity);

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh(account.userId);
        if (isAppLocked()) {
          setLocked(true);
        }
      }
    }, 15000);

    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('touchstart', onActivity);
      window.clearInterval(interval);
    };
  }, [account, refresh]);

  const handleReady = (next: Account) => {
    saveAccount(next);
    setAccount(next);
    setShowLanding(false);
    setLocked(false);
  };

  const handleSignOut = () => {
    clearAccount();
    saveLastConnectionId('');
    setAccount(null);
    setConnections([]);
    setShowLanding(true);
    setLocked(false);
  };

  const handleUpdateAccount = (name: string, aniviCode: string) => {
    if (account) {
      const updated = { ...account, name, aniviCode };
      setAccount(updated);
      saveAccount(updated);
    }
  };

  // Screen PIN Lock Screen
  if (locked) {
    return <AppLockModal onUnlocked={() => setLocked(false)} />;
  }

  // Public Landing Page
  if (showLanding && !account) {
    return <LandingPage onOpenApp={() => setShowLanding(false)} />;
  }

  // Onboard / Login / Sign up Screen
  if (!account) {
    return (
      <OnboardScreen
        onReady={handleReady}
        hadLegacyPairing={hadLegacyPairing}
      />
    );
  }

  // Main WhatsApp Application Shell
  return (
    <WhatsAppLayout
      account={account}
      connections={connections}
      initialConnectionId={initialConnectionId}
      onRefreshConnections={() => {
        if (account) void refresh(account.userId);
      }}
      onSignOut={handleSignOut}
      onUpdateAccount={handleUpdateAccount}
    />
  );
}
