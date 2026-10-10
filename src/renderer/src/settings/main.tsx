import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setUpDocument } from '../document';
import { SettingsApp } from './SettingsApp';
import './settings.css';

setUpDocument(window.settings.platform);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <SettingsApp />
  </StrictMode>,
);
