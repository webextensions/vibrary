import { type RefObject, useEffect, useRef } from 'react';

// The app's popup convention, in one place: while open, dismiss on a press outside the popup or on Escape. Two
// integration styles, matching the two kinds of call site:
// - Pass `containerReference` when the trigger and panel share one wrapper element: an outside press is detected
//   structurally (mousedown + contains), so clicks inside the popup need no stopPropagation.
// - Omit it for list-rendered menus (one open menu across many rows, with no single wrapper to ref): ANY document
//   click dismisses, and the menu's own buttons plus its trigger stop propagation so only clicks elsewhere reach the
//   document. 'click' (not mousedown) is load-bearing there - a mousedown listener would unmount the menu before its
//   buttons' click handlers could fire.
// The dismiss callback is read through a ref so an inline arrow at the call site does not re-subscribe the document
// listeners on every render while the popup is open.
const useDismissablePopup = function <E extends HTMLElement> (
    isOpen: boolean,
    onDismiss: () => void,
    containerReference?: RefObject<E | null>
): void {
    const onDismissReference = useRef(onDismiss);
    useEffect(function () {
        onDismissReference.current = onDismiss;
    });

    useEffect(function () {
        if (!isOpen) {
            return undefined;
        }
        const handlePress = function (event: Event) {
            if (containerReference === undefined || !containerReference.current?.contains(event.target as Node)) {
                onDismissReference.current();
            }
        };
        const handleKeyDown = function (event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onDismissReference.current();
            }
        };
        const pressEvent = containerReference === undefined ? 'click' : 'mousedown';
        document.addEventListener(pressEvent, handlePress);
        document.addEventListener('keydown', handleKeyDown);
        return function () {
            document.removeEventListener(pressEvent, handlePress);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, containerReference]);
};

export { useDismissablePopup };
