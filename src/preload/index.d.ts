import type { PaletteApi } from '../shared/ipc';

declare global {
  interface Window {
    palette: PaletteApi;
  }
}
