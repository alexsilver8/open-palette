import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NotesApp } from './NotesApp';
import './notes.css';

document.documentElement.dataset.platform = window.notes.platform;

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <NotesApp />
  </StrictMode>,
);
