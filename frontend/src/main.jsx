import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { refreshSession } from './lib/auth';
import { initFlow } from './lib/flow';

// Drop a stored session the server no longer accepts (expired, signed out).
refreshSession();

// Flow tracking (lib/flow.js) starts only for an account that has activity recording switched on; looked at again on sign-in / sign-out.
initFlow();
window.addEventListener('lnv-auth', initFlow);

createRoot(document.getElementById('root')).render(
  
    <App />
  
);