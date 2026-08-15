import { useEffect, useState } from 'react';
import { PairScreen } from './components/PairScreen';
import { SpaceScreen } from './components/SpaceScreen';
import { normalizeLoveCode } from './lib/protocol';
import { clearPairing, loadPairing, savePairing, type Pairing } from './lib/storage';

/**
 * Anivi has two states: not paired yet, and in the space. The pairing lives in
 * localStorage, so a returning couple lands straight on their canvas.
 */
export default function App() {
  const [pairing, setPairing] = useState<Pairing | null>(() => loadPairing());
  const [justPaired, setJustPaired] = useState(false);

  // A shared link like https://anivi.app/?code=LOVE-7K3P9 prefills the code.
  const invitedCode = normalizeLoveCode(new URLSearchParams(location.search).get('code') ?? '');

  useEffect(() => {
    if (!justPaired) return;
    const timer = window.setTimeout(() => setJustPaired(false), 1800);
    return () => window.clearTimeout(timer);
  }, [justPaired]);

  function handlePaired(next: Pairing) {
    savePairing(next);
    setPairing(next);
    setJustPaired(true);
    // Don't leave the invite code sitting in the URL bar.
    if (invitedCode) history.replaceState(null, '', location.pathname);
  }

  function handleLeave() {
    clearPairing();
    setPairing(null);
  }

  if (!pairing) {
    return <PairScreen initialCode={invitedCode} onPaired={handlePaired} />;
  }

  return (
    <>
      <SpaceScreen
        pairing={pairing}
        onPairingChange={(next) => setPairing(next)}
        onLeave={handleLeave}
      />
      {justPaired && (
        <div className="connected-toast" role="status">
          <p className="connected-title">❤️ You&rsquo;re connected</p>
          <p className="connected-sub">Welcome to Anivi</p>
        </div>
      )}
    </>
  );
}
