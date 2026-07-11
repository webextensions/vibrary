import cx from 'classnames';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import styles from './QuickOpen.module.css';

// A command-palette-style quick file switcher (Cmd/Ctrl+K): type to filter the file list, Up/Down to move the
// highlight, Enter to open, Esc or a backdrop click to close. The input keeps focus the whole time and an active
// index tracks the highlight (a controlled combobox) rather than roving DOM focus between rows, so typing and
// navigating never fight; focus is restored to whatever had it when the palette closes.
const QuickOpen = function ({ files, onOpen, onClose }: { files: string[]; onOpen: (name: string) => void; onClose: () => void }) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputReference = useRef<HTMLInputElement>(null);
    const listReference = useRef<HTMLUListElement>(null);
    const previouslyFocusedReference = useRef<Element | null>(null);

    // Case-insensitive substring match on the path, preserving listing order - the goal is fast keyboard reach, not
    // fuzzy scoring.
    const matches = useMemo(function () {
        const needle = query.trim().toLowerCase();
        if (needle === '') {
            return files;
        }
        return files.filter(function (name) {
            return name.toLowerCase().includes(needle);
        });
    }, [files, query]);

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

    const openAt = function (index: number) {
        const name = matches[index];
        if (name !== undefined) {
            onOpen(name);
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
            openAt(safeIndex);
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
                aria-label="Quick open file"
                onMouseDown={function (event) { event.stopPropagation(); }}
            >
                <input
                    ref={inputReference}
                    className={styles.input}
                    type="text"
                    placeholder="Go to file..."
                    aria-label="Go to file"
                    value={query}
                    onChange={function (event) {
                        setQuery(event.target.value);
                        setActiveIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                />
                {matches.length === 0 ?
                    <p className={styles.empty}>No matching files</p> :
                    <ul className={styles.list} ref={listReference}>
                        {matches.map(function (name, index) {
                            return (
                                <li key={name}>
                                    <button
                                        type="button"
                                        tabIndex={-1}
                                        className={cx(styles.row, index === safeIndex && styles.active)}
                                        onMouseMove={function () { setActiveIndex(index); }}
                                        onClick={function () { openAt(index); }}
                                    >
                                        {name}
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

export { QuickOpen };
