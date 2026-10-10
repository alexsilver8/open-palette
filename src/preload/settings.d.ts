import type { SettingsApi } from '../shared/settings-ipc';

declare global {
  interface Window {
    settings: SettingsApi;
  }
}
