import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { getPlaybackEngine } from '@/playback/engine';
import '@/styles/global.css';

getPlaybackEngine();

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
