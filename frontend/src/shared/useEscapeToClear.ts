import { useEffect, useRef } from 'react';

// The app's Escape-clears-selection convention (see "Keyboard and mouse shortcuts" in docs/editor.md), in one place:
// while `isActive` (a selection exists and no popup of the caller's own claims the key first), Escape clears it -
// EXCEPT while any dialog is open. Dialogs own their Escape, and their keydown bubbles to the document, so without
// the guard cancelling a bulk action's confirm would also wipe the selection that action was operating on. The check
// is structural (the native confirm/prompt <dialog>s match `dialog[open]`; the portal-rendered ResponsiveDialog
// carries role="dialog" only while open), so no per-dialog state wiring is needed. The clear callback is read through
// a ref so an inline arrow at the call site does not re-subscribe the listener every render - the same idiom as
// useDismissablePopup.
const useEscapeToClear = function (isActive: boolean, onClear: () => void): void {
    const onClearReference = useRef(onClear);
    useEffect(function () {
        onClearReference.current = onClear;
    });

    useEffect(function () {
        if (!isActive) {
            return undefined;
        }
        const handleKeyDown = function (event: KeyboardEvent) {
            if (event.key !== 'Escape') {
                return;
            }
            if (document.querySelector('dialog[open], [role="dialog"]') !== null) {
                return;
            }
            onClearReference.current();
        };
        document.addEventListener('keydown', handleKeyDown);
        return function () {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isActive]);
};

export { useEscapeToClear };
