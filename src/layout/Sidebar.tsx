import type { ActiveModelState, CatalogApp } from '@shared/types';
import { SystemMetricsPanel } from '../components/SystemMetricsPanel';
import { FILE_ORGANIZER_SECTIONS, type FileOrganizerSection } from '../apps/file-organizer/sections';

export type SystemScreen = 'my-models' | 'marketplace' | 'settings';
export type Screen = SystemScreen | `app:${string}`;

const SYSTEM_ITEMS: Array<{ id: SystemScreen; label: string; icon: string }> = [
  { id: 'my-models', label: 'My Models', icon: '📦' },
  { id: 'marketplace', label: 'Marketplace', icon: '🛒' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

/** Column 2: the menu items belonging to whichever module is active in Column 1. */
export function Sidebar({
  active,
  onSelect,
  installedApps,
  activeModel,
  fileOrganizerSection,
  onSelectFileOrganizerSection,
}: {
  active: Screen;
  onSelect: (s: Screen) => void;
  installedApps: CatalogApp[];
  activeModel: ActiveModelState;
  /** Current sub-section within the File Organizer app, if it's active. */
  fileOrganizerSection?: FileOrganizerSection;
  onSelectFileOrganizerSection?: (s: FileOrganizerSection) => void;
}) {
  const isMain = !active.startsWith('app:');
  const activeApp = isMain ? null : installedApps.find((a) => `app:${a.id}` === active) ?? null;

  return (
    <nav className="sidebar">
      {isMain ? (
        <>
          <div className="module-header">
            <span className="module-header-icon">🧠</span>
            <span>Main</span>
          </div>
          <div className="sidebar-nav">
            {SYSTEM_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`sidebar-nav-item${active === item.id ? ' active' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="module-header">
            <span className="module-header-icon">{activeApp?.icon ?? '🧩'}</span>
            <span>{activeApp?.name ?? 'App'}</span>
          </div>
          {activeApp?.id === 'file-organizer' && (
            <div className="sidebar-nav">
              {FILE_ORGANIZER_SECTIONS.map((item) => (
                <button
                  key={item.id}
                  className={`sidebar-nav-item${fileOrganizerSection === item.id ? ' active' : ''}`}
                  onClick={() => onSelectFileOrganizerSection?.(item.id)}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="sidebar-spacer" />
      <div className="sidebar-metrics">
        <SystemMetricsPanel activeModel={activeModel} />
      </div>
    </nav>
  );
}
