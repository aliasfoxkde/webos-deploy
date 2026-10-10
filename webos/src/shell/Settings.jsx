import React, { useState } from 'react';
import Appearance from './settings/Appearance.jsx';
import {
  DesktopPanel, TaskbarPanel, WidgetsPanel, SoundPanel,
  NetworkPanel, StoragePanel, AppsPanel, AboutPanel,
} from './settings/Panels.jsx';

export const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: '🎨', body: Appearance },
  { id: 'desktop', label: 'Desktop', icon: '🖥', body: DesktopPanel },
  { id: 'taskbar', label: 'Taskbar', icon: '▭', body: TaskbarPanel },
  { id: 'widgets', label: 'Widgets', icon: '▦', body: WidgetsPanel },
  { id: 'sound', label: 'Sound', icon: '🔊', body: SoundPanel },
  { id: 'network', label: 'Network', icon: '📶', body: NetworkPanel },
  { id: 'apps', label: 'Apps', icon: '🧩', body: AppsPanel },
  { id: 'storage', label: 'Storage', icon: '💾', body: StoragePanel },
  { id: 'about', label: 'About', icon: 'ℹ', body: AboutPanel },
];

/* Settings is a full control center: left rail of sections, scrollable panel.
   It renders inside a VirtualWindow — movable and resizable like any window.
   Launch args deep-link a section: os.launch('settings', { initial: 'about' }). */
export default function Settings({ args = {} }) {
  const [sec, setSec] = useState(SECTIONS.some((s) => s.id === args.initial) ? args.initial : 'appearance');
  const Active = SECTIONS.find((s) => s.id === sec)?.body || Appearance;
  return (
    <div className="settings has-rail">
      <nav className="set-rail" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`set-nav ${sec === s.id ? 'on' : ''}`}
            onClick={() => setSec(s.id)}
            aria-current={sec === s.id ? 'page' : undefined}
          >
            <span className="set-nav-icon" aria-hidden="true">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </nav>
      <div className="set-pane">
        <h2>{SECTIONS.find((s) => s.id === sec)?.label}</h2>
        <Active />
      </div>
    </div>
  );
}
