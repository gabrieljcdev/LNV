import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { refreshSession } from './lib/auth';

// Drop a stored session the server no longer accepts (expired, signed out).
refreshSession();

createRoot(document.getElementById('root')).render(
  
    <App />
  
);