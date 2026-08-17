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
    setOpenId(connection.connectionId);
    saveLastConnectionId(connection.connectionId);
  }

  function handleLeaveSpace() {
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
