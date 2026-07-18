import { useSyncExternalStore } from 'react';

// The message store behind the app's single polite live region (Announcer.tsx renders it). Module-level rather than
// context so any call site can announce with a plain import, and so there is exactly one region by construction -
// two live regions racing each other is worse than none. Toasts are deliberately NOT routed through here:
// react-toastify already renders each toast with role="alert" (its own live region), so announcing toast text again
// would speak everything twice. This store exists for the changes that have no toast: a completed save, a filter's
// shown count, a search's result count, a keyboard approval.
//
// The two-step announce below is the classic hand-rolled-announcer bug fix: a live region only speaks on CHANGE, so
// announcing the same text twice in a row must pass through '' first - without that, "Saved specs.xml" right after
// "Saved specs.xml" is silently dropped, and save/save/save is precisely the repeat users perform most. The message
// also clears shortly after speaking so a screen reader arriving later does not find stale status text.

// Long enough for the '' -> text change to register as two mutations, far below human-noticeable.
const SPEAK_DELAY_MS = 50;
// How long the message stays in the DOM before clearing. Clearing is what re-arms an identical next announcement.
const CLEAR_DELAY_MS = 3000;

// One mutable state object (not separate top-level lets) so the functions below mutate properties rather than
// reassigning module bindings.
const state: { message: string; speakTimer: ReturnType<typeof setTimeout> | null; clearTimer: ReturnType<typeof setTimeout> | null } = {
    message: '',
    speakTimer: null,
    clearTimer: null
};
const listeners = new Set<() => void>();

const setMessage = function (next: string) {
    if (next === state.message) {
        return;
    }
    state.message = next;
    for (const listener of listeners) {
        listener();
    }
};

const announce = function (text: string) {
    if (state.speakTimer !== null) {
        clearTimeout(state.speakTimer);
    }
    if (state.clearTimer !== null) {
        clearTimeout(state.clearTimer);
    }
    setMessage('');
    state.speakTimer = setTimeout(function () {
        setMessage(text);
        state.clearTimer = setTimeout(function () {
            setMessage('');
        }, CLEAR_DELAY_MS);
    }, SPEAK_DELAY_MS);
};

const subscribeAnnouncement = function (listener: () => void) {
    listeners.add(listener);
    return function () {
        listeners.delete(listener);
    };
};

const getAnnouncement = function (): string {
    return state.message;
};

// The live region's current message, for Announcer.tsx.
const useAnnouncement = function (): string {
    return useSyncExternalStore(subscribeAnnouncement, getAnnouncement);
};

export { announce, getAnnouncement, subscribeAnnouncement, useAnnouncement };
