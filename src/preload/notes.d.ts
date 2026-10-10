import type { NotesApi } from '../shared/notes';

declare global {
  interface Window {
    notes: NotesApi;
  }
}
