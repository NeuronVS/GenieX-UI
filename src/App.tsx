import { useState } from 'react';
import { Sidebar, type Screen } from './layout/Sidebar';
import { ActiveModelHeader } from './layout/ActiveModelHeader';
import { Marketplace } from './screens/Marketplace';
import { MyModels } from './screens/MyModels';
import { ImportLocal } from './screens/ImportLocal';
import { Chat } from './screens/Chat';
import { Code } from './screens/Code';
import { Settings } from './screens/Settings';
import { FirstRunSetup } from './screens/FirstRunSetup';
import { DownloadProgressModal } from './components/DownloadProgressModal';
import { useCliSetup } from './hooks/useCliSetup';
import { useActiveModel } from './hooks/useActiveModel';
import { usePullProgress } from './hooks/usePull';

export default function App() {
  const { state: cliState, checked } = useCliSetup();
  const [ready, setReady] = useState(false);

  if (!checked) return null; // avoid a flash of the install screen while checking
  if (!cliState.installed && !ready) {
    return <FirstRunSetup onReady={() => setReady(true)} />;
  }

  return <MainApp />;
}

function MainApp() {
  const [screen, setScreen] = useState<Screen>('marketplace');
  const { state: activeModel, unload } = useActiveModel();
  const { pulls, dismiss } = usePullProgress();

  const handleCancel = (requestId: string) => window.geniex.pull.cancel(requestId);

  return (
    <div className="app-shell">
      <Sidebar active={screen} onSelect={setScreen} />
      <div className="main-column">
        <ActiveModelHeader state={activeModel} onUnload={unload} />
        <div className="main-content">
          {screen === 'marketplace' && <Marketplace />}
          {screen === 'my-models' && <MyModels />}
          {screen === 'chat' && <Chat />}
          {screen === 'code' && <Code />}
          {screen === 'import' && <ImportLocal />}
          {screen === 'settings' && <Settings />}
        </div>
      </div>
      <DownloadProgressModal pulls={pulls} onCancel={handleCancel} onDismiss={dismiss} />
    </div>
  );
}
