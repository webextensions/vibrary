import { useCallback, useSyncExternalStore } from 'react';

// Reactive media-query match: re-renders when the query starts or stops matching, so layout that depends on the
// breakpoint (for example the tab bar switching to a dropdown) follows live resizes rather than only the value read at
// mount. Built on useSyncExternalStore so matchMedia is the single source of truth, with no setState-in-effect.
const useMediaQuery = function (query: string) {
    const subscribe = useCallback(function (onStoreChange: () => void) {
        const mql = window.matchMedia(query);
        mql.addEventListener('change', onStoreChange);
        return function () {
            mql.removeEventListener('change', onStoreChange);
        };
    }, [query]);

    const getSnapshot = useCallback(function () {
        return window.matchMedia(query).matches;
    }, [query]);

    return useSyncExternalStore(subscribe, getSnapshot, function () {
        return false;
    });
};

export { useMediaQuery };
