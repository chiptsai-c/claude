import { MotionConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);

// Offline support when hosted (Azure Static Web Apps, SharePoint). Skipped inside frames and on plain http.
if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline mode unavailable */ });
}
