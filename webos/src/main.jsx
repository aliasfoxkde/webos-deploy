import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { OSProvider } from './os/state.jsx';
import './styles.css';

// Dismiss the static boot splash once React mounts.
document.getElementById('boot')?.remove();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <OSProvider>
      <App />
    </OSProvider>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
