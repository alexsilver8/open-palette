import { PanelLeft, Pin, PinOff, Search, SquarePen, Trash2 } from 'lucide-react';
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { countWords, type Note, notePreview, noteTitle } from '../../../shared/notes';
import { rankItems } from '../../../shared/search';
import { timeAgo } from '../../../shared/time';
import { isModKey } from '../keys';
import { NoteEditor } from './NoteEditor';

const api = window.notes;
const { platform } = api;
const SAVE_DELAY_MS = 400;
const mod = platform === 'darwin' ? '⌘' : 'Ctrl+';

function byRecent(a: Note, b: Note) {
  return b.updatedAt - a.updatedAt;
}

export function NotesApp() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState('');
  const [sidebar, setSidebar] = useState(true);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [, setTick] = useState(0);

  const search = useRef<HTMLInputElement>(null);
  const pending = useRef<{ id: string; text: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const ready = useRef(false);
  const openRequest = useRef<string | null>(null);
  // Latest values for callbacks that outlive a render (IPC listeners, timers).
  const latest = useRef({ notes, currentId, draft });
  latest.current = { notes, currentId, draft };

  const current = notes.find((note) => note.id === currentId);

  const upsert = useCallback((note: Note) => {
    setNotes((list) => [note, ...list.filter((n) => n.id !== note.id)].sort(byRecent));
  }, []);

  /** Writes the pending edit right away and returns the saved note. */
  const saveNow = useCallback(async (): Promise<Note | undefined> => {
    const edit = pending.current;
    if (!edit) return undefined;
    clearTimeout(edit.timer);
    pending.current = null;
    try {
      const saved = await api.update(edit.id, edit.text);
      upsert(saved);
      return saved;
    } catch (error) {
      console.error('Could not save the note', error);
      return undefined;
    }
  }, [upsert]);

  const scheduleSave = (id: string, text: string) => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { id, text, timer: setTimeout(() => void saveNow(), SAVE_DELAY_MS) };
  };

  // Focus after React has rendered the change: the editor may only just have become editable.
  const [focusRequest, setFocusRequest] = useState(0);
  const focusEditor = useCallback(() => setFocusRequest((n) => n + 1), []);

  /** Switches to a note, saving the current one and dropping it if you never wrote anything. */
  const select = useCallback(
    async (id: string, list?: Note[]) => {
      const saved = await saveNow();
      const { currentId: leaving, draft: leavingText } = latest.current;
      const discarded = leaving && leaving !== id && !leavingText.trim() ? await api.discardIfEmpty(leaving) : false;
      const next = saved?.id === id ? saved : (list ?? latest.current.notes).find((note) => note.id === id);
      setNotes((previous) => {
        let notesNow = list ?? previous;
        if (saved) notesNow = [saved, ...notesNow.filter((note) => note.id !== saved.id)].sort(byRecent);
        if (discarded) notesNow = notesNow.filter((note) => note.id !== leaving);
        return notesNow;
      });
      setCurrentId(next ? id : null);
      setDraft(next?.text ?? '');
      if (next) api.setCurrent(id);
      focusEditor();
    },
    [saveNow, focusEditor],
  );

  const createNote = useCallback(async () => {
    await saveNow();
    const { currentId: id, draft: text } = latest.current;
    // Already on a blank note: use it rather than piling up empty ones.
    if (id && !text.trim()) {
      focusEditor();
      return;
    }
    const note = await api.create();
    const list = [note, ...latest.current.notes];
    await select(note.id, list);
  }, [saveNow, select, focusEditor]);

  const trashCurrent = useCallback(async () => {
    const { currentId: id } = latest.current;
    if (!id) return;
    if (pending.current?.id === id) {
      clearTimeout(pending.current.timer);
      pending.current = null;
    }
    await api.trash(id);
    const remaining = latest.current.notes.filter((note) => note.id !== id);
    setCurrentId(null);
    setDraft('');
    latest.current = { ...latest.current, currentId: null, draft: '' };
    if (remaining[0]) await select(remaining[0].id, remaining);
    else {
      setNotes([]);
      await createNote();
    }
  }, [select, createNote]);

  // Initial load: the note main asked for, else the last one open, else the newest, else a new one.
  useEffect(() => {
    let cancelled = false;
    const offOpen = api.onOpen((id) => {
      if (!ready.current) {
        openRequest.current = id;
        return;
      }
      void api.list().then((list) => select(id, list));
    });
    const offChanged = api.onChanged(() => {
      void api.list().then((list) => {
        const { currentId: id } = latest.current;
        const fresh = list.find((note) => note.id === id);
        // Take edits made elsewhere, unless you're in the middle of typing.
        if (fresh && !pending.current && fresh.text !== latest.current.draft) setDraft(fresh.text);
        setNotes(list);
        if (id && !fresh && list[0]) void select(list[0].id, list);
      });
    });
    void (async () => {
      const [state, list] = await Promise.all([api.getState(), api.list()]);
      if (cancelled) return;
      setSidebar(state.sidebar);
      setAlwaysOnTop(state.alwaysOnTop);
      ready.current = true;
      const wanted = [openRequest.current, state.currentId, list[0]?.id].find(
        (id) => id && list.some((note) => note.id === id),
      );
      if (wanted) await select(wanted, list);
      else {
        setNotes(list);
        await createNote();
      }
    })();
    return () => {
      cancelled = true;
      offOpen();
      offChanged();
    };
  }, [select, createNote]);

  // Keep "Edited 2m ago" honest, and never lose the last keystrokes when the window closes.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    const flush = () => {
      const edit = pending.current;
      if (edit) {
        clearTimeout(edit.timer);
        api.flush(edit.id, edit.text);
        pending.current = null;
      }
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('blur', flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('blur', flush);
    };
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebar((open) => {
      api.setState({ sidebar: !open });
      return !open;
    });
  }, []);

  const findNote = useCallback(() => {
    setSidebar(true);
    api.setState({ sidebar: true });
    requestAnimationFrame(() => {
      search.current?.focus();
      search.current?.select();
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isModKey(event, platform)) return;
      const key = event.key.toLowerCase();
      if (key === 'n' && !event.shiftKey) {
        event.preventDefault();
        void createNote();
      } else if (key === 'p' && !event.shiftKey) {
        event.preventDefault();
        findNote();
      } else if (key === '\\') {
        event.preventDefault();
        toggleSidebar();
      } else if (key === 'backspace' && event.shiftKey) {
        event.preventDefault();
        void trashCurrent();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [createNote, findNote, toggleSidebar, trashCurrent]);

  const visible = useMemo(() => {
    if (!filter.trim()) return notes;
    const entries = notes.map((note) => ({ note, title: noteTitle(note.text), keywords: [note.text] }));
    return rankItems(entries, filter).map((ranked) => ranked.item.note);
  }, [notes, filter]);

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const index = visible.findIndex((note) => note.id === currentId);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = visible[Math.min(visible.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
      if (next) {
        void select(next.id).then(() => search.current?.focus());
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = index >= 0 ? visible[index] : visible[0];
      if (target) void select(target.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setFilter('');
      focusEditor();
    }
  };

  const togglePin = () => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    api.setState({ alwaysOnTop: next });
  };

  const words = countWords(draft);

  return (
    <div className="notes" data-sidebar={sidebar || undefined}>
      <header className="notes__header">
        <button
          type="button"
          className="notes__tool"
          onClick={toggleSidebar}
          aria-pressed={sidebar}
          title={`Show notes (${mod}\\)`}
        >
          <PanelLeft size={16} />
        </button>
        <div className="notes__heading">
          <h1 className="notes__title">{noteTitle(draft)}</h1>
          <p className="notes__subtitle">
            {words} {words === 1 ? 'word' : 'words'}
            {current && ` · Edited ${timeAgo(current.updatedAt)}`}
          </p>
        </div>
        <button
          type="button"
          className="notes__tool"
          onClick={togglePin}
          aria-pressed={alwaysOnTop}
          title={alwaysOnTop ? 'Stop keeping on top' : 'Keep on top of other windows'}
        >
          {alwaysOnTop ? <Pin size={16} /> : <PinOff size={16} />}
        </button>
        <button type="button" className="notes__tool" onClick={() => void createNote()} title={`New note (${mod}N)`}>
          <SquarePen size={16} />
        </button>
        <button
          type="button"
          className="notes__tool"
          onClick={() => void trashCurrent()}
          title={`Move to Trash (${mod}${platform === 'darwin' ? '⇧⌫' : 'Shift+Backspace'})`}
        >
          <Trash2 size={16} />
        </button>
      </header>

      {sidebar && (
        <aside className="notes__sidebar">
          <label className="notes__search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={search}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Find a note"
              aria-label="Find a note"
              spellCheck={false}
            />
          </label>
          <nav className="notes__list" aria-label="Notes">
            <ul>
              {visible.map((note) => {
                const text = note.id === currentId ? draft : note.text;
                const preview = notePreview(text);
                return (
                  <li key={note.id}>
                    <button
                      type="button"
                      className="notes__item"
                      aria-current={note.id === currentId || undefined}
                      onClick={() => void select(note.id)}
                    >
                      <span className="notes__item-title">{noteTitle(text)}</span>
                      <span className="notes__item-meta">
                        <span>{timeAgo(note.updatedAt)}</span>
                        {preview && <span className="notes__item-preview">{preview}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {visible.length === 0 && <p className="notes__none">No notes match “{filter}”.</p>}
          </nav>
          <div className="notes__count">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </div>
        </aside>
      )}

      <NoteEditor
        noteId={currentId}
        text={draft}
        focusRequest={focusRequest}
        onChange={(text) => {
          setDraft(text);
          if (currentId) scheduleSave(currentId, text);
        }}
      />
    </div>
  );
}
