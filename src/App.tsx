import { useEffect, useMemo, useState } from 'react';
import { AppRail } from './layout/AppRail';
import { Sidebar, type Screen } from './layout/Sidebar';
import { MyModels } from './screens/MyModels';
import { AppsMarketplace } from './screens/AppsMarketplace';
import { Chat } from './screens/Chat';
import { Code } from './screens/Code';
import { Settings } from './screens/Settings';
import { AppPlaceholder } from './screens/AppPlaceholder';
import { ExplorerScreen } from './apps/file-organizer/ExplorerScreen';
import { IndexingSettingsPanel } from './apps/file-organizer/IndexingSettingsPanel';
import type { FileOrganizerSection } from './apps/file-organizer/sections';
import { FirstRunSetup } from './screens/FirstRunSetup';
import { DownloadProgressModal } from './components/DownloadProgressModal';
import { useCliSetup } from './hooks/useCliSetup';
import { useActiveModel } from './hooks/useActiveModel';
import { usePullProgress } from './hooks/usePull';
import { useApps } from './hooks/useApps';

export default function App() {
  const { state: cliState, checked } = useCliSetup();
  const [ready, setReady] = useState(false);

  if (!checked) return null;
  if (!cliState.installed && !ready) {
    return <FirstRunSetup onReady={() => setReady(true)} />;
  }

  return <MainApp />;
}

function MainApp() {
  const [screen, setScreen] = useState<Screen>('app:chat');
  const [foSection, setFoSection] = useState<FileOrganizerSection>('files');
  const { state: activeModel } = useActiveModel();
  const { pulls, dismiss } = usePullProgress();
  const apps = useApps();

  const handleCancel = (requestId: string) => window.geniex.pull.cancel(requestId);

  const activeAppId = screen.startsWith('app:') ? screen.slice(4) : null;
  const activeCatalogApp = useMemo(
    () => apps.catalog?.apps.find((a) => a.id === activeAppId) ?? null,
    [apps.catalog, activeAppId],
  );

  // If current app screen was uninstalled, fall back to Chat
  useEffect(() => {
    if (!activeAppId) return;
    const stillThere = apps.installed.some((i) => i.id === activeAppId);
    if (!stillThere && apps.installed.length) {
      setScreen('app:chat');
    }
  }, [activeAppId, apps.installed]);

  return (
    <div className="app-shell">
      <AppRail active={screen} onSelect={setScreen} installedApps={apps.installedApps} />
      <Sidebar
        active={screen}
        onSelect={setScreen}
        installedApps={apps.installedApps}
        activeModel={activeModel}
        fileOrganizerSection={foSection}
        onSelectFileOrganizerSection={setFoSection}
      />
      <div className="main-column">
        <div className="main-content">
          {screen === 'my-models' && <MyModels />}
          {screen === 'marketplace' && (
            <AppsMarketplace
              catalog={apps.catalog}
              installed={apps.installed}
              loading={apps.loading}
              error={apps.error}
              refreshCatalog={apps.refreshCatalog}
              install={apps.install}
              uninstall={apps.uninstall}
            />
          )}
          {screen === 'settings' && <Settings />}
          {screen === 'app:chat' && <Chat />}
          {screen === 'app:code' && <Code />}
          {screen === 'app:file-organizer' &&
            (foSection === 'settings' ? <IndexingSettingsPanel /> : <ExplorerScreen />)}
          {activeAppId &&
            activeAppId !== 'chat' &&
            activeAppId !== 'code' &&
            activeAppId !== 'file-organizer' &&
            (activeCatalogApp ? (
              <AppPlaceholder app={activeCatalogApp} />
            ) : (
              <div className="empty-state">App not found in catalog.</div>
            ))}
        </div>
      </div>
      <DownloadProgressModal pulls={pulls} onCancel={handleCancel} onDismiss={dismiss} />
    </div>
  );
}
