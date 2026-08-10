import { SystemMetricsPanel } from '../components/SystemMetricsPanel';

export type Screen = 'marketplace' | 'my-models' | 'chat' | 'code' | 'import' | 'settings';

const NAV_ITEMS: Array<{ id: Screen; label: string; icon: string }> = [
  { id: 'marketplace', label: 'Marketplace', icon: '🛒' },
  { id: 'my-models', label: 'My Models', icon: '📦' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'code', label: 'Code', icon: '⌨️' },
  { id: 'import', label: 'Import Local', icon: '📂' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar({ active, onSelect }: { active: Screen; onSelect: (s: Screen) => void }) {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span>⚡</span>
        <span>GenieX</span>
      </div>
      <div className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
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
      <div className="sidebar-spacer" />
      <div className="sidebar-metrics">
        <SystemMetricsPanel />
      </div>
    </nav>
  );
}
