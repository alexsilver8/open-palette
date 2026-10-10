import { ChevronLeft } from 'lucide-react';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, ActionContext, ActionResult, CommandRef, RootItem, View } from '../../shared/types';
import { ActionPanel } from './components/ActionPanel';
import { Footer, type Toast } from './components/Footer';
import { optionId, ResultList } from './components/ResultList';
import { isModKey, matchesShortcut } from './keys';
import { type DisplayItem, type DisplaySection, filterView } from './model';
import { buildRootSections } from './root-search';

const palette = window.palette;
const { platform } = palette;
const TOAST_MS = 2500;
const SEARCH_DEBOUNCE_MS = 120;

/** One level of navigation: the root search, or a command's view pushed on top of it. */
interface Frame {
  /** Unique per pushed view, so late responses can tell whether their view is still showing. */
  id: number;
  ref?: CommandRef;
  view?: View;
  query: string;
  /** The query `view` was rendered for, for commands that filter by themselves. */
  viewQuery?: string;
  selectedId?: string;
}

const ROOT: Frame = { id: 0, query: '' };
let nextFrameId = 1;

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

function firstItem(view: View, query: string): DisplayItem | undefined {
  return filterView(view, query).flatMap((section) => section.items)[0];
}

export function App() {
  const [rootItems, setRootItems] = useState<RootItem[]>([]);
  const [stack, setStack] = useState<Frame[]>([ROOT]);
  const [loading, setLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const searchRequest = useRef(0);
  const busy = useRef(false);
  const inflight = useRef<{ key: string; promise: Promise<View | undefined> } | null>(null);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const frame = stack[stack.length - 1] ?? ROOT;
  const isRoot = stack.length === 1;

  const updateTop = useCallback((patch: Partial<Frame>) => {
    setStack((current) => [...current.slice(0, -1), { ...(current[current.length - 1] ?? ROOT), ...patch }]);
  }, []);

  const showToast = useCallback((text: string, style: Toast['style']) => {
    setToast({ id: Date.now(), text, style });
  }, []);

  const focusInput = useCallback((select = false) => {
    requestAnimationFrame(() => {
      input.current?.focus();
      if (select) input.current?.select();
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // Root items: on start, whenever apps or extensions change, and each time the window opens
  // (so usage-based ranking is fresh).
  useEffect(() => {
    const load = () => {
      palette.getRootItems().then(setRootItems, (error: unknown) => showToast(cleanError(error), 'failure'));
    };
    load();
    const offChanged = palette.onRootItemsChanged(load);
    const offToast = palette.onToast((message) => showToast(message.text, message.style));
    const offShown = palette.onShown(({ reset }) => {
      load();
      setPanelOpen(false);
      if (reset) {
        searchRequest.current++;
        setStack([ROOT]);
      }
      focusInput(true);
    });
    return () => {
      offChanged();
      offToast();
      offShown();
    };
  }, [focusInput, showToast]);

  const sections: DisplaySection[] = useMemo(() => {
    if (isRoot || !frame.view) return buildRootSections(rootItems, frame.query);
    return filterView(frame.view, frame.query);
  }, [isRoot, rootItems, frame.view, frame.query]);

  const items = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === frame.selectedId),
  );
  const selected: DisplayItem | undefined = items[selectedIndex];

  /**
   * Asks a self-filtering command for its view of `query`, and shows it if that view is
   * still on top and no newer request was made. Returns the view when it was applied.
   */
  const refreshView = useCallback(
    (frameId: number, ref: CommandRef, query: string): Promise<View | undefined> => {
      // ↵ and the debounce timer may ask for the same thing; share one request.
      const key = `${frameId}\u0000${query}`;
      if (inflight.current?.key === key) return inflight.current.promise;

      const request = ++searchRequest.current;
      const isCurrent = () =>
        request === searchRequest.current && stackRef.current[stackRef.current.length - 1]?.id === frameId;
      setLoading(true);
      const promise = (async () => {
        try {
          const view = await palette.searchView(ref, query);
          if (!isCurrent()) return undefined;
          updateTop({ view, viewQuery: query, selectedId: undefined });
          return view;
        } catch (error) {
          if (isCurrent()) showToast(cleanError(error), 'failure');
          return undefined;
        } finally {
          if (request === searchRequest.current) setLoading(false);
          if (inflight.current?.key === key) inflight.current = null;
        }
      })();
      inflight.current = { key, promise };
      return promise;
    },
    [updateTop, showToast],
  );

  // Commands that filter by themselves get asked again as the query changes.
  const selfFiltering = !isRoot && frame.view?.filtering === false;
  const stale = selfFiltering && frame.query !== frame.viewQuery;
  const { id: frameId, ref: frameRef, query: frameQuery } = frame;
  useEffect(() => {
    if (!stale || !frameRef) return;
    const timer = setTimeout(() => void refreshView(frameId, frameRef, frameQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [stale, frameId, frameRef, frameQuery, refreshView]);

  const applyResult = useCallback(
    (result: ActionResult, action: Action, callRef: CommandRef | undefined) => {
      if (result.hide) {
        // The main process already hid the window; open fresh next time.
        searchRequest.current++;
        setStack([ROOT]);
        setPanelOpen(false);
        return;
      }
      if (result.push || result.replace || result.clearSearch || result.pop) searchRequest.current++;
      setStack((current) => {
        let next = current;
        if (result.pop && next.length > 1) next = next.slice(0, -1);
        const top = next[next.length - 1] ?? ROOT;
        if (result.replace || result.clearSearch) {
          const query = result.clearSearch ? '' : top.query;
          next = [
            ...next.slice(0, -1),
            { ...top, query, ...(result.replace ? { view: result.replace, viewQuery: query } : {}) },
          ];
        }
        if (result.push) {
          const opened = action.type === 'open-command';
          const query = opened ? (action.argument ?? '') : '';
          const ref = opened ? action.ref : callRef;
          next = [...next, { id: nextFrameId++, ref, view: result.push, query, viewQuery: query }];
        }
        return next;
      });
      if (result.toast) showToast(result.toast, result.toastStyle ?? 'success');
    },
    [showToast],
  );

  const run = useCallback(
    async (item: DisplayItem | undefined, action: Action | undefined, from: Frame = frame) => {
      // One action at a time: a double ↵ must not push twice or delete twice.
      if (!item || !action || busy.current) return;
      busy.current = true;
      setPanelOpen(false);
      const context: ActionContext = { query: from.query };
      if (from.ref) context.ref = from.ref;
      if (item.rootItemId) context.rootItemId = item.rootItemId;
      setLoading(true);
      try {
        applyResult(await palette.runAction(action, context), action, from.ref);
      } catch (error) {
        showToast(cleanError(error), 'failure');
      } finally {
        busy.current = false;
        setLoading(false);
        focusInput();
      }
    },
    [frame, applyResult, showToast, focusInput],
  );

  /** ↵ / ⌘↵: if a self-filtering list hasn't caught up with the typing yet, wait for it first. */
  const activate = async (secondary: boolean) => {
    if (stale && frameRef) {
      if (busy.current) return;
      const from = frame;
      const view = await refreshView(from.id, frameRef, from.query);
      if (!view) return;
      const first = firstItem(view, from.query);
      void run(first, first?.actions[secondary ? 1 : 0], { ...from, view, viewQuery: from.query });
      return;
    }
    void run(selected, selected?.actions[secondary ? 1 : 0]);
  };

  const pop = useCallback(() => {
    searchRequest.current++;
    setLoading(false);
    setPanelOpen(false);
    setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
    focusInput();
  }, [focusInput]);

  const move = (delta: number) => {
    const next = items[Math.min(items.length - 1, Math.max(0, selectedIndex + delta))];
    if (next) updateTop({ selectedId: next.id });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const mod = isModKey(event, platform);
    const key = event.key;
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;

    // The selected item's own shortcuts win over the launcher's.
    const shortcutAction = selected?.actions.find((a) => a.shortcut && matchesShortcut(event, a.shortcut, platform));
    if (shortcutAction) {
      event.preventDefault();
      void run(selected, shortcutAction);
    } else if (key === 'ArrowDown' || (event.ctrlKey && key === 'n')) {
      event.preventDefault();
      move(1);
    } else if (key === 'ArrowUp' || (event.ctrlKey && key === 'p')) {
      event.preventDefault();
      move(-1);
    } else if (key === 'Enter' && (plain || (mod && !event.shiftKey && !event.altKey))) {
      event.preventDefault();
      void activate(mod);
    } else if (mod && key.toLowerCase() === 'k') {
      event.preventDefault();
      if (selected && selected.actions.length > 0) setPanelOpen((open) => !open);
    } else if (mod && key === ',') {
      event.preventDefault();
      void run(
        { id: 'settings', title: 'Settings', actions: [] },
        { type: 'open-command', ref: { extension: 'open-palette', command: 'settings' } },
      );
    } else if (key === 'Escape' && plain) {
      event.preventDefault();
      if (!isRoot) pop();
      else if (frame.query) updateTop({ query: '', selectedId: undefined });
      else palette.hide();
    } else if (key === 'Backspace' && plain && !isRoot && frame.query === '') {
      event.preventDefault();
      pop();
    }
  };

  const placeholder = isRoot ? 'Search apps and commands…' : (frame.view?.searchPlaceholder ?? 'Search…');
  const emptyText = isRoot
    ? frame.query
      ? `Nothing matches “${frame.query}”.`
      : 'Loading apps and commands…'
    : loading
      ? undefined
      : (frame.view?.emptyText ?? (frame.query ? `Nothing matches “${frame.query}”.` : 'Nothing here yet.'));

  return (
    <div className="launcher">
      <header className="search" data-loading={loading || undefined}>
        {!isRoot && (
          <button type="button" className="search__back" onClick={pop} aria-label="Back">
            <ChevronLeft size={16} strokeWidth={2.25} />
          </button>
        )}
        <input
          ref={input}
          className="search__input"
          value={frame.query}
          placeholder={placeholder}
          onChange={(event) => updateTop({ query: event.target.value, selectedId: undefined })}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-label={placeholder}
          aria-expanded="true"
          aria-controls="results"
          aria-activedescendant={selected ? optionId(selectedIndex) : undefined}
          aria-autocomplete="list"
          spellCheck={false}
          autoComplete="off"
          autoFocus
        />
        {!isRoot && frame.view?.title && <span className="search__crumb">{frame.view.title}</span>}
      </header>

      <main className="content">
        <ResultList
          sections={sections}
          selectedId={selected?.id}
          emptyText={emptyText}
          onSelect={(item) => updateTop({ selectedId: item.id })}
          onActivate={(item) => void run(item, item.actions[0])}
        />
      </main>

      <Footer
        platform={platform}
        context={isRoot ? 'Open Palette' : (frame.view?.title ?? 'Open Palette')}
        toast={toast}
        primary={selected?.actions[0]}
        hasActions={Boolean(selected && selected.actions.length > 0)}
        onPrimary={() => void run(selected, selected?.actions[0])}
        onToggleActions={() => setPanelOpen((open) => !open)}
      />

      {panelOpen && selected && (
        <ActionPanel
          item={selected}
          platform={platform}
          onRun={(action) => void run(selected, action)}
          onClose={() => {
            setPanelOpen(false);
            focusInput();
          }}
        />
      )}
    </div>
  );
}
