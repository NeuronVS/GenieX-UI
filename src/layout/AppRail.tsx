import type { CatalogApp } from '@shared/types';
import type { Screen } from './Sidebar';
import { useTheme, type ThemePreference } from '../hooks/useTheme';
import logoCube from '../../media/logo_cube_noshadow.png';

const THEME_CYCLE: ThemePreference[] = ['dark', 'light', 'auto'];
const THEME_ICON: Record<ThemePreference, string> = { dark: '🌙', light: '☀️', auto: '🖥️' };
const THEME_LABEL: Record<ThemePreference, string> = { dark: 'Dark', light: 'Light', auto: 'System' };

/** Column 1: icon-only rail for installed apps + the Main (model management) module. */
export function AppRail({
  active,
  onSelect,
  installedApps,
}: {
  active: Screen;
  onSelect: (s: Screen) => void;
  installedApps: CatalogApp[];
}) {
  const { preference, setTheme } = useTheme();
  const isMainActive = !active.startsWith('app:');

  return (
    <nav className="app-rail">
      <div className="app-rail-icons">
        <button
          className={`app-rail-icon app-rail-icon-brand${isMainActive ? ' active' : ''}`}
          onClick={() => onSelect('my-models')}
          aria-label="Main"
        >
          <img className="app-rail-brand" src={logoCube} alt="" />
          <span className="app-rail-tooltip">Main</span>
        </button>

        {installedApps.map((app) => {
          const id = `app:${app.id}` as Screen;
          return (
            <button
              key={app.id}
              className={`app-rail-icon${active === id ? ' active' : ''}`}
              onClick={() => onSelect(id)}
              aria-label={app.name}
            >
              {app.icon}
              <span className="app-rail-tooltip">{app.name}</span>
            </button>
          );
        })}
      </div>

      <div className="app-rail-spacer" />

      <div className="app-rail-footer">
        <button
          className="app-rail-icon"
          onClick={() => setTheme(THEME_CYCLE[(THEME_CYCLE.indexOf(preference) + 1) % THEME_CYCLE.length])}
          aria-label="Theme"
        >
          {THEME_ICON[preference]}
          <span className="app-rail-tooltip">Theme: {THEME_LABEL[preference]}</span>
        </button>
      </div>
    </nav>
  );
}
