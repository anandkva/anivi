import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('anivi: #root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The service worker only caches the shell; realtime traffic never goes near it.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.info('[anivi:sw] registered', {
          scope: registration.scope,
          active: Boolean(registration.active),
        });
      })
      .catch((err) => {
        console.info('[anivi:sw] registration failed', err);
      });
  });
}
