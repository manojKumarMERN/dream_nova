import { useEffect } from 'react';
import { Icon } from './Icons';
import type { IconName } from './Icons';

export type ContextAction = 'duplicate' | 'delete' | 'copy' | 'paste' | 'hide' | 'lock' | 'rename';

interface ContextMenuProps {
  x: number;
  y: number;
  hidden: boolean;
  locked: boolean;
  onAction: (action: ContextAction) => void;
  onClose: () => void;
}

const ITEMS: Array<{ action: ContextAction; label: string; icon: IconName }> = [
  { action: 'rename', label: 'Rename', icon: 'edit' },
  { action: 'duplicate', label: 'Duplicate', icon: 'duplicate' },
  { action: 'copy', label: 'Copy', icon: 'copy' },
  { action: 'paste', label: 'Paste', icon: 'paste' },
  { action: 'hide', label: 'Toggle visibility', icon: 'eye' },
  { action: 'lock', label: 'Toggle lock', icon: 'lock' },
  { action: 'delete', label: 'Delete', icon: 'trash' }
];

export function ContextMenu({ x, y, hidden, locked, onAction, onClose }: ContextMenuProps) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);

  return (
    <div
      className="context-menu"
      style={{ left: x, top: y }}
      role="menu"
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {ITEMS.map((item) => (
        <button
          type="button"
          role="menuitem"
          key={item.action}
          onClick={() => onAction(item.action)}
        >
          <Icon name={item.icon} size={14} />
          <span>
            {item.action === 'hide' ? (hidden ? 'Show' : 'Hide') : null}
            {item.action === 'lock' ? (locked ? 'Unlock' : 'Lock') : null}
            {item.action !== 'hide' && item.action !== 'lock' ? item.label : null}
          </span>
        </button>
      ))}
    </div>
  );
}
