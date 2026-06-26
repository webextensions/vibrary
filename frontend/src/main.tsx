import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ActivityQueueProvider } from './ActivityQueueProvider.tsx';
import { App } from './App.tsx';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
    <StrictMode>
        <ActivityQueueProvider>
            <App />
        </ActivityQueueProvider>
    </StrictMode>
);
