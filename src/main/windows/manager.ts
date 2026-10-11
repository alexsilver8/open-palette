import { type WindowBackend, WindowError } from './backend';
import { type Layout, layoutBounds, type Rect, sameBounds } from './layout';

export type WindowCommand = Layout | 'restore';

/** How many windows' original places are remembered for Restore. */
const REMEMBERED = 100;

/**
 * Applies layouts to the window in front, and remembers where each window was before Open
 * Palette first moved it, so Restore can put it back.
 */
export class WindowManager {
  private readonly original = new Map<string, Rect>();

  async apply(backend: WindowBackend, command: WindowCommand): Promise<void> {
    const snapshot = await backend.front();
    if (!snapshot) throw new WindowError('There is no window in front to move.');
    const { window, displays } = snapshot;

    if (command === 'restore') {
      const before = this.original.get(window.key);
      if (!before) throw new WindowError("Open Palette hasn't moved this window, so there's nothing to restore.");
      await backend.move(window, before);
      this.original.delete(window.key);
      return;
    }

    const target = layoutBounds(command, window.bounds, displays);
    if (!target) {
      throw new WindowError(
        command === 'next-display' || command === 'previous-display'
          ? 'There is only one display.'
          : "Couldn't find the display the window is on.",
      );
    }
    if (sameBounds(target, window.bounds)) return;

    if (!this.original.has(window.key)) {
      this.original.set(window.key, window.bounds);
      // Forget the oldest; a Map keeps insertion order.
      if (this.original.size > REMEMBERED) this.original.delete(this.original.keys().next().value as string);
    }
    await backend.move(window, target);
  }
}
