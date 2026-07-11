import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastContainer } from 'react-toastify';

import { ActivityQueueProvider } from './activity/ActivityQueueProvider.tsx';
import { App } from './App.tsx';
import { ActivityNotifier } from './activity/ActivityNotifier.tsx';
import { ErrorBoundary } from './shared/ErrorBoundary.tsx';
import { SettingsProvider } from './settings/SettingsProvider.tsx';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
    <StrictMode>
        <ErrorBoundary>
            <SettingsProvider>
                <ActivityQueueProvider>
                    <App />
                    <ActivityNotifier />
                    <ToastContainer />
                </ActivityQueueProvider>
            </SettingsProvider>
        </ErrorBoundary>
    </StrictMode>
);
