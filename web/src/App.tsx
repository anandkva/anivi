import { useCallback, useEffect, useState } from 'react';
import { ConnectSheet } from './components/ConnectSheet';
import { HomeScreen } from './components/HomeScreen';
import { OnboardScreen } from './components/OnboardScreen';
import { SpaceScreen } from './components/SpaceScreen';
import { fetchMe, type Account, type Connection } from './lib/account';
import {
  clearAccount,
  dropLegacyPairing,
  loadAccount,
  loadLastConnectionId,
  markSeen,
  saveAccount,
  saveLastConnectionId,
} from './lib/storage';

/**
 * Three states: no account, home, and inside a connection.
 *
 * The account lives in localStorage; the connections list belongs to the
 * server, so a space someone opened on another device shows up here too.
 */
export default function App() {
  const [account, setAccount] = useState<Account | null>(() => loadAccount());
  const [hadLegacyPairing] = useState(() => dropLegacyPairing());
  const [connections, setConnections] = useState<Connection[]>([]);
  const [openId, setOpenId] = useState<string>(() => loadLastConnectionId());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);
  const [justConnected, setJustConnected] = useState<Connection | null>(null);

  const refresh = useCallback(
    async (userId: string) => {
      setLoading(true);
      setError('');
      try {
        const me = await fetchMe(userId);
        setConnections(me.connections);
        // The server is the authority on the name and code.
        setAccount(me.account);
        saveAccount(me.account);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load your connections");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (account) void refresh(account.userId);
  }, [account?.userId, refresh]);

  /**
   * Keeps Home current while it is on screen.
   *
   * Someone else can connect to you at any moment, and the first you'd know
   * about it is a new card appearing. Polling only while Home is visible keeps
   * that promise without a socket per account: the space itself is realtime,
   * this list only has to be timely.
   */
  useEffect(() => {
    if (!account || openId) return;

    const tick = () => {
      if (document.visibilityState === 'visible') void refresh(account.userId);
    };
    const timer = window.setInterval(tick, 15_000);
    // Coming back to the app should feel instant, not "up to 15 seconds".
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [account?.userId, openId, refresh]);

  // A tap on a notification asks the app to open that room.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; roomId?: string } | null;
      if (data?.type !== 'anivi:open-room' || !data.roomId) return;
      const match = connections.find((c) => c.roomId === data.roomId);
      if (match) handleOpen(match);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [connections]);

  useEffect(() => {
    if (!justConnected) return;
    const timer = window.setTimeout(() => setJustConnected(null), 1600);
    return () => window.clearTimeout(timer);
  }, [justConnected]);

  /**
   * Called both for a fresh account and for a sign-in on a new device. A brand
   * new account has nobody in it, so it goes straight to connecting; someone
   * signing back in already has connections waiting.
   */
  function handleReady(next: Account, isNew: boolean) {
    saveAccount(next);
    setAccount(next);
    if (isNew) setConnectOpen(true);
  }

  function handleOpen(connection: Connection) {
    // Opening a space is what clears its badge.
    markSeen(connection.roomId);
    setOpenId(connection.connectionId);
    saveLastConnectionId(connection.connectionId);
  }

  function handleLeaveSpace() {
    const leaving = connections.find((c) => c.connectionId === openId);
    if (leaving) markSeen(leaving.roomId);
    setOpenId('');
    saveLastConnectionId('');
    if (account) void refresh(account.userId);
  }

  function handleSignOut() {
    clearAccount();
    saveLastConnectionId('');
    setAccount(null);
    setConnections([]);
    setOpenId('');
  }

  if (!account) {
    return (
      <OnboardScreen
        onReady={(next) => handleReady(next, !loadLastConnectionId())}
        hadLegacyPairing={hadLegacyPairing}
      />
    );
  }

  const openConnection = connections.find((c) => c.connectionId === openId) ?? null;

  if (openConnection) {
    return (
      <SpaceScreen
        account={account}
        connection={openConnection}
        onBack={handleLeaveSpace}
        onDisconnected={() => {
          setConnections((prev) => prev.filter((c) => c.connectionId !== openConnection.connectionId));
          handleLeaveSpace();
        }}
      />
    );
  }

  return (
    <>
      <HomeScreen
        account={account}
        connections={connections}
        loading={loading}
        error={error}
        onOpen={handleOpen}
        onAddConnection={() => setConnectOpen(true)}
        onRefresh={() => void refresh(account.userId)}
        onDisconnected={(id) => setConnections((prev) => prev.filter((c) => c.connectionId !== id))}
        onSignOut={handleSignOut}
      />

      {connectOpen && (
        <ConnectSheet
          userId={account.userId}
          myCode={account.aniviCode}
          onClose={() => setConnectOpen(false)}
          onConnected={(connection, alreadyConnected) => {
            setConnectOpen(false);
            setConnections((prev) => {
              const without = prev.filter((c) => c.connectionId !== connection.connectionId);
              return [connection, ...without];
            });
            if (!alreadyConnected) setJustConnected(connection);
            handleOpen(connection);
          }}
        />
      )}

      {justConnected && (
        <div className="connected-toast" role="status">
          <p className="connected-title">❤️ You&rsquo;re connected</p>
          <p className="connected-sub">{justConnected.peerName} is in your space</p>
        </div>
      )}
    </>
  );
}
