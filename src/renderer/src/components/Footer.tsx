import { CircleAlert, CircleCheck } from 'lucide-react';
import type { Action, Platform } from '../../../shared/types';
import { actionTitle } from '../model';
import { Keycaps } from './Keycaps';
import { PaletteMark } from './PaletteMark';

export interface Toast {
  id: number;
  text: string;
  style: 'success' | 'failure';
}

interface FooterProps {
  platform: Platform;
  context: string;
  toast: Toast | null;
  primary: Action | undefined;
  hasActions: boolean;
  onPrimary(): void;
  onToggleActions(): void;
}

export function Footer({ platform, context, toast, primary, hasActions, onPrimary, onToggleActions }: FooterProps) {
  const mac = platform === 'darwin';
  return (
    <footer className="footer">
      <div className="footer__context" aria-live="polite">
        {toast ? (
          <span key={toast.id} className="toast" data-style={toast.style}>
            {toast.style === 'failure' ? <CircleAlert size={14} /> : <CircleCheck size={14} />}
            {toast.text}
          </span>
        ) : (
          <>
            <PaletteMark />
            <span>{context}</span>
          </>
        )}
      </div>
      <div className="footer__actions">
        {primary && (
          <button type="button" className="footer__button footer__button--primary" onClick={onPrimary}>
            {actionTitle(primary)}
            <Keycaps keys={[mac ? '↵' : 'Enter']} />
          </button>
        )}
        {hasActions && (
          <>
            <span className="footer__divider" aria-hidden="true" />
            <button type="button" className="footer__button" onClick={onToggleActions}>
              Actions
              <Keycaps keys={[mac ? '⌘' : 'Ctrl', 'K']} />
            </button>
          </>
        )}
      </div>
    </footer>
  );
}
