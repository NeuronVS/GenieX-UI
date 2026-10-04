import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { applyStoredTheme } from './hooks/useTheme';
import 'preline';

// Set the theme attribute before the first paint so there's no flash of the
// wrong theme (CSP blocks inline <script> in index.html, so this runs here
// instead — still synchronous, still before React renders anything).
applyStoredTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
