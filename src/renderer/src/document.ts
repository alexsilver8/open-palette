/** Marks the page with its platform and the glass behind it, for the stylesheets. */
export function setUpDocument(platform: string): void {
  const glass = new URLSearchParams(window.location.search).get('glass');
  const root = document.documentElement;
  root.dataset.platform = platform;
  root.dataset.glass = glass === 'vibrancy' || glass === 'acrylic' ? glass : 'none';
}
