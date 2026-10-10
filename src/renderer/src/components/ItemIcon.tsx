import {
  AppWindow,
  Calculator,
  Clipboard,
  Copy,
  File,
  Folder,
  Globe,
  Link,
  Lock,
  type LucideIcon,
  Moon,
  Power,
  Puzzle,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  StickyNote,
  Terminal,
  TextAlignStart,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import type { BuiltinIconName, Icon } from '../../../shared/types';

const GLYPHS: Record<BuiltinIconName, LucideIcon> = {
  alert: TriangleAlert,
  app: AppWindow,
  calculator: Calculator,
  clipboard: Clipboard,
  copy: Copy,
  extension: Puzzle,
  file: File,
  folder: Folder,
  globe: Globe,
  link: Link,
  lock: Lock,
  moon: Moon,
  note: StickyNote,
  power: Power,
  refresh: RefreshCw,
  search: Search,
  settings: Settings,
  sparkles: Sparkles,
  terminal: Terminal,
  text: TextAlignStart,
  trash: Trash2,
};

function Tile({ name, tint }: { name: BuiltinIconName; tint?: string }) {
  const Glyph = GLYPHS[name];
  return (
    <span className="icon icon--tile" data-tint={tint ?? 'gray'} aria-hidden="true">
      <Glyph size={13} strokeWidth={2.25} />
    </span>
  );
}

function FileIcon({ path }: { path: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Tile name="app" />;
  return (
    <img
      className="icon icon--image"
      src={`palette-icon://icon?path=${encodeURIComponent(path)}`}
      alt=""
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function ItemIcon({ icon }: { icon?: Icon }) {
  if (!icon) return <span className="icon icon--blank" aria-hidden="true" />;
  if ('builtin' in icon) return <Tile name={icon.builtin} tint={icon.tint} />;
  if ('emoji' in icon) {
    return (
      <span className="icon icon--emoji" aria-hidden="true">
        {icon.emoji}
      </span>
    );
  }
  return <FileIcon path={icon.path} />;
}

/** The pigment a row's selection takes on, from its icon. */
export function tintOf(icon?: Icon): string | undefined {
  return icon && 'builtin' in icon ? (icon.tint ?? 'gray') : undefined;
}
