import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setUpDocument } from '../document';
import { NotesApp } from './NotesApp';
import './notes.css';

setUpDocument(window.notes.platform);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <NotesApp />
  </StrictMode>,
);
