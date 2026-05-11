import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)

if ("serviceWorker" in navigator) {
  const cleanupKey = "nextstep:sw-cache-cleanup:v1";
  const alreadyCleaned = (() => {
    try {
      return localStorage.getItem(cleanupKey) === "1";
    } catch {
      return false;
    }
  })();

  if (!alreadyCleaned) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      }).catch(() => {
        /* ignore */
      });

      if ("caches" in window) {
        caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {
          /* ignore */
        });
      }

      try {
        localStorage.setItem(cleanupKey, "1");
      } catch {
        /* ignore */
      }
    });
  }
}
