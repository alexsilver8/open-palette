import { describe, expect, it, vi } from 'vitest';
import { showOnEverySpace } from './spaces';

describe('showOnEverySpace', () => {
  it('joins every space, full-screen ones too, without bringing back the Dock icon', () => {
    const window = { setVisibleOnAllWorkspaces: vi.fn() };
    showOnEverySpace(window, 'darwin');
    expect(window.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
  });

  it('leaves windows alone on other systems', () => {
    const window = { setVisibleOnAllWorkspaces: vi.fn() };
    showOnEverySpace(window, 'win32');
    showOnEverySpace(window, 'linux');
    expect(window.setVisibleOnAllWorkspaces).not.toHaveBeenCalled();
  });
});
