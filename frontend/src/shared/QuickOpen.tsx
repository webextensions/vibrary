import cx from 'classnames';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import styles from './QuickOpen.module.css';

// One row in the palette: a primary label plus an optional muted hint (e.g. the file an entry lives in). `key` is a
// stable identity for React and dedup; `select` runs when the row is chosen.
type QuickOpenItem = { key: string; label: string; hint?: string; select: () => void };

// A command-palette-style "go to anything" (Cmd/Ctrl+K): type to filter files and entries, Up/Down to move the
// highlight, Enter to choose, Esc or a backdrop click to close. The input keeps focus the whole time and an active
// index tracks the highlight (a controlled combobox) rather than roving DOM focus between rows, so typing and
// navigating never fight; focus is restored to whatever had it when the palette closes.
const QuickOpen = function ({ items, onClose }: { items: QuickOpenItem[]; onClose: () => void }) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    // Ids tying the query box to the highlighted row, so a screen reader announces the active option as the highlight
    // moves (the ARIA combobox/listbox pattern - focus stays in the input, aria-activedescendant points at the row).
    const listId = useId();
    const optionId = function (index: number) { return `${listId}-option-${index}`; };
    const inputReference = useRef<HTMLInputElement>(null);
    const listReference = useRef<HTMLUListElement>(null);
    const previouslyFocusedReference = useRef<Element | null>(null);

    // Case-insensitive substring match over the label AND hint (so typing a file name surfaces the file and its
    // entries), preserving the given order - the goal is fast keyboard reach, not fuzzy scoring.
    const matches = useMemo(function () {
        const needle = query.trim().toLowerCase();
        if (needle === '') {
            return items;
        }
        return items.filter(function (item) {
            return `${item.label} ${item.hint ?? ''}`.toLowerCase().includes(needle);
        });
    }, [items, query]);

    // Derive the in-range index rather than storing a clamped one: a narrower query can shrink the list past the raw
    // index, so clamp it here (typing also resets it to 0 in the input's onChange). Everything below reads this.
    const safeIndex = matches.length === 0 ? 0 : Math.min(activeIndex, matches.length - 1);

    // Focus the input on open; restore focus to the prior element on close.
    useEffect(function () {
        previouslyFocusedReference.current = document.activeElement;
        inputReference.current?.focus();
        return function () {
            if (previouslyFocusedReference.current instanceof HTMLElement) {
                previouslyFocusedReference.current.focus({ preventScroll: true });
            }
        };
    }, []);

    // Keep the highlighted row visible as the selection moves by keyboard.
    useEffect(function () {
        const active = listReference.current?.children[safeIndex];
        if (active instanceof HTMLElement) {
            active.scrollIntoView({ block: 'nearest' });
        }
    }, [safeIndex]);

    const chooseAt = function (index: number) {
        const item = matches[index];
        if (item !== undefined) {
            item.select();
            onClose();
        }
    };

    const handleKeyDown = function (event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex(matches.length === 0 ? 0 : (safeIndex + 1) % matches.length);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(matches.length === 0 ? 0 : (safeIndex <= 0 ? matches.length : safeIndex) - 1);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            chooseAt(safeIndex);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
        }
    };

    return createPortal(
        <div className={styles.backdrop} onMouseDown={onClose}>
            {/* Stop the palette's own mousedown from reaching the backdrop's close handler. */}
            <div
                className={styles.palette}
                role="dialog"
                aria-modal="true"
                aria-label="Go to file or entry"
                onMouseDown={function (event) { event.stopPropagation(); }}
            >
                <input
                    ref={inputReference}
                    className={styles.input}
                    type="text"
                    placeholder="Go to file or entry..."
                    aria-label="Go to file or entry"
                    role="combobox"
                    aria-expanded={matches.length > 0}
                    aria-controls={listId}
                    aria-activedescendant={matches.length > 0 ? optionId(safeIndex) : undefined}
                    aria-autocomplete="list"
                    value={query}
                    onChange={function (event) {
                        setQuery(event.target.value);
                        setActiveIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                />
                {matches.length === 0 ?
                    <p className={styles.empty}>No matches</p> :
                    <ul id={listId} role="listbox" aria-label="Go to file or entry" className={styles.list} ref={listReference}>
                        {matches.map(function (item, index) {
                            return (
                                <li key={item.key} role="presentation">
                                    <button
                                        type="button"
                                        tabIndex={-1}
                                        role="option"
                                        id={optionId(index)}
                                        aria-selected={index === safeIndex}
                                        className={cx(styles.row, index === safeIndex && styles.active)}
                                        onMouseMove={function () { setActiveIndex(index); }}
                                        onClick={function () { chooseAt(index); }}
                                    >
                                        <span className={styles.rowLabel}>{item.label}</span>
                                        {item.hint !== undefined && <span className={styles.rowHint}>{item.hint}</span>}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>}
            </div>
        </div>,
        document.body
    );
};

export { QuickOpen, type QuickOpenItem };
