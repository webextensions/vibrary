import { Component, type ErrorInfo, type ReactNode } from 'react';

import styles from './ErrorBoundary.module.css';

// Catches render/lifecycle errors from its subtree so one crashing component cannot white-screen the app - open tabs'
// unsaved edits live only in memory, so an unguarded crash would lose them all at once with no explanation. The
// fallback names the error and offers a reload; an extra boundary around a risky pane (the lazy markdown/highlighter
// views) keeps a pane-level crash from unmounting the editor around it. A class is unavoidable here:
// getDerivedStateFromError/componentDidCatch have no hook equivalent.
type ErrorBoundaryProperties = { children: ReactNode };
type ErrorBoundaryState = { error: Error | null };

class ErrorBoundary extends Component<ErrorBoundaryProperties, ErrorBoundaryState> {
    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    state: ErrorBoundaryState = { error: null };

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[vibrary] unhandled render error:', error, info.componentStack);
    }

    render() {
        if (this.state.error === null) {
            return this.props.children;
        }
        return (
            <div role="alert" className={styles.errorBoundary}>
                <p className={styles.message}>Something went wrong: {this.state.error.message}</p>
                <button
                    type="button"
                    onClick={function () {
                        window.location.reload();
                    }}
                >
                    Reload
                </button>
            </div>
        );
    }
}

export { ErrorBoundary };
