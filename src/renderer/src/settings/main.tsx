import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsApp } from './SettingsApp';
import './settings.css';

document.documentElement.dataset.platform = window.settings.platform;

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <SettingsApp />
  </StrictMode>,
);
