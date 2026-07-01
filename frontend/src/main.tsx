import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastContainer } from 'react-toastify';

import { ActivityQueueProvider } from './ActivityQueueProvider.tsx';
import { App } from './App.tsx';
import { ActivityNotifier } from './components/ActivityNotifier.tsx';
import { SettingsProvider } from './SettingsProvider.tsx';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
    <StrictMode>
        <SettingsProvider>
            <ActivityQueueProvider>
                <App />
                <ActivityNotifier />
                <ToastContainer />
            </ActivityQueueProvider>
        </SettingsProvider>
    </StrictMode>
);
