import { type ReactNode, useEffect, useRef } from 'react';

// A dropdown menu panel that implements the keyboard interaction its role="menu" promises (the ARIA APG menu
// pattern) - announcing "menu" to assistive tech switches users into arrow-key mode, so shipping the role without the
// behavior is worse than plain buttons. On mount, focus moves to the first item and every item leaves the Tab order
// (items are reached with arrows, not Tab); ArrowDown/ArrowUp cycle, Home/End jump. On unmount, focus returns to
// whatever had it before the menu opened (the trigger) - unless something else (a confirm dialog opened by the chosen
// action) has already claimed focus, which the contains-check leaves alone. Dismissal (outside press, Escape) stays
// with the caller's useDismissablePopup wiring.
const MenuPanel = function ({ className, children }: { className?: string; children: ReactNode }) {
    const panelReference = useRef<HTMLDivElement>(null);

    useEffect(function () {
        const panel = panelReference.current;
        if (panel === null) {
            return undefined;
        }
        const previouslyFocused = document.activeElement;
        const menuItems = function (): HTMLElement[] {
            return Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
        };
        for (const item of panel.querySelectorAll<HTMLElement>('[role="menuitem"]')) {
            item.tabIndex = -1;
        }
        menuItems()[0]?.focus();

        const handleKeyDown = function (event: KeyboardEvent) {
            const items = menuItems();
            if (items.length === 0) {
                return;
            }
            const currentIndex = items.indexOf(document.activeElement as HTMLElement);
            let nextIndex;
            if (event.key === 'ArrowDown') {
                nextIndex = (currentIndex + 1) % items.length;
            } else if (event.key === 'ArrowUp') {
                nextIndex = (currentIndex <= 0 ? items.length : currentIndex) - 1;
            } else if (event.key === 'Home') {
                nextIndex = 0;
            } else if (event.key === 'End') {
                nextIndex = items.length - 1;
            } else {
                return;
            }
            event.preventDefault();
            items[nextIndex].focus();
        };
        panel.addEventListener('keydown', handleKeyDown);

        return function () {
            panel.removeEventListener('keydown', handleKeyDown);
            // Restore focus only when it is still inside the menu (cleanup runs before the DOM node is detached): a
            // menu item's action may already have moved focus into a dialog, which must keep it.
            if (panel.contains(document.activeElement) && previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
                previouslyFocused.focus();
            }
        };
    }, []);

    return (
        <div ref={panelReference} className={className} role="menu">
            {children}
        </div>
    );
};

export { MenuPanel };
