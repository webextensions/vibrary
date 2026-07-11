import cx from 'classnames';
import { type CSSProperties, type MouseEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Draggable from 'react-draggable';
import { useMediaQuery } from 'react-responsive';

import { CloseIcon } from './Icons.tsx';

import styles from './ResponsiveDialog.module.css';

// Below this width the dialog goes fullscreen, matching the web-app-template's ResponsiveDialog breakpoint.
const FULLSCREEN_MEDIA_QUERY = '(max-width: 599.95px)';

// Elements a keyboard user can land on, for both the initial auto-focus and the Tab trap below. Excludes anything with
// tabindex="-1" (programmatically focusable but deliberately skipped in tab order).
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const getFocusableElements = function (container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
};

// Confirm/prompt dialogs (confirmDialog.ts, promptDialog.ts) get focus-trapping and focus-restoration for free from the
// native <dialog> element they are built on. ResponsiveDialog predates that and renders its own portal instead, so it
// has to do both by hand: move focus into the panel when it opens, keep Tab/Shift+Tab cycling within it while open, and
// give focus back to whatever had it beforehand once it closes - otherwise a keyboard user can Tab straight through to
// background content while the dialog is supposedly modal.
const useFocusTrap = function (isOpen: boolean, panelReference: { current: HTMLDivElement | null }): void {
    useEffect(function () {
        if (!isOpen) {
            return undefined;
        }
        const previouslyFocused = document.activeElement;
        const frame = requestAnimationFrame(function () {
            const panel = panelReference.current;
            if (panel === null) {
                return;
            }
            // Land on the first field in the dialog BODY rather than the Close button in the header (which is first in
            // DOM order) - so a form dialog opens ready to type, and Enter does not immediately hit Close. Falls back to
            // the first focusable (e.g. a content-less dialog whose only control is Close), then the panel itself.
            const focusable = getFocusableElements(panel);
            const firstBodyField = focusable.find(function (element) { return element.closest('header') === null; });
            (firstBodyField ?? focusable[0] ?? panel).focus({ preventScroll: true });
        });
        return function () {
            cancelAnimationFrame(frame);
            if (previouslyFocused instanceof HTMLElement) {
                previouslyFocused.focus({ preventScroll: true });
            }
        };
    }, [isOpen, panelReference]);
};

// Lock body scroll while the dialog is open so the page behind it stays put, restoring the previous value on close.
const useBodyScrollLock = function (isLocked: boolean): void {
    useEffect(function () {
        if (!isLocked) {
            return undefined;
        }
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return function () {
            document.body.style.overflow = previousOverflow;
        };
    }, [isLocked]);
};

type ResponsiveDialogProperties = {
    contentStyleModal?: CSSProperties;
    contentStyleFullScreen?: CSSProperties;
    maxWidthWhenNotFullScreen?: number | string;
    draggable?: boolean;
    open: boolean;
    // false hides the close button; 'disabled' shows it disabled; true (default) shows it active.
    closable?: boolean | 'disabled';
    onClose: (...arguments_: unknown[]) => void;
    title?: string;
    classNameForTitle?: string;
    className?: string;
    align?: 'top' | 'center';
    noPrimaryButton?: boolean;
    primaryButtonOnClick?: VoidFunction;
    primaryButtonDisabled?: boolean;
    primaryButtonText?: string;
    children: ReactNode
};

const ResponsiveDialog = function ({
    contentStyleModal,
    contentStyleFullScreen,
    maxWidthWhenNotFullScreen,
    draggable,
    open,
    closable,
    onClose,
    title,
    classNameForTitle,
    className,
    align,
    noPrimaryButton,
    primaryButtonOnClick,
    primaryButtonDisabled,
    primaryButtonText,
    children
}: ResponsiveDialogProperties) {
    const fullScreen = useMediaQuery({ query: FULLSCREEN_MEDIA_QUERY });
    const panelReference = useRef<HTMLDivElement>(null);
    const titleId = useId();
    // closable is the single source of truth for EVERY dismissal path - the close button, Escape, and a backdrop
    // click - so a dialog rendered as not-closable (false or 'disabled') can never be dismissed out from under an
    // in-flight operation by a keyboard/mouse route the caller forgot to guard.
    const canDismiss = closable === undefined || closable === true;

    useBodyScrollLock(open);
    useFocusTrap(open, panelReference);

    useEffect(function () {
        if (!open) {
            return undefined;
        }
        const handleKeyDown = function (event: KeyboardEvent) {
            if (event.key === 'Escape') {
                if (canDismiss) {
                    onClose();
                }
                return;
            }
            // Keep Tab/Shift+Tab cycling within the panel instead of escaping to background content.
            if (event.key !== 'Tab') {
                return;
            }
            const panel = panelReference.current;
            if (panel === null) {
                return;
            }
            const focusable = getFocusableElements(panel);
            if (focusable.length === 0) {
                event.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable.at(-1) as HTMLElement;
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return function () {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, onClose, canDismiss]);

    if (!open) {
        return null;
    }

    let closableComputed: boolean | 'disabled' = true;
    if (closable === false) {
        closableComputed = false;
    } else if (closable === 'disabled') {
        closableComputed = 'disabled';
    }

    const shouldShowPrimaryButton = !noPrimaryButton;
    const isDraggable = Boolean(draggable && !fullScreen);

    const handleBackdropMouseDown = function (event: MouseEvent<HTMLDivElement>) {
        if (canDismiss && event.target === event.currentTarget) {
            onClose();
        }
    };

    const panelStyle: CSSProperties = (!fullScreen && maxWidthWhenNotFullScreen !== undefined) ?
        { maxWidth: maxWidthWhenNotFullScreen } :
        {};

    const panelInner = (
        <>
            <header
                id={isDraggable ? 'draggable-dialog-title' : undefined}
                className={cx(styles.header, { [styles.headerDraggable]: isDraggable })}
            >
                <div className={styles.headerRow}>
                    {closableComputed &&
                    <button
                        type="button"
                        className={styles.closeButton}
                        onClick={onClose}
                        disabled={closableComputed === 'disabled'}
                        aria-label="Close"
                    >
                        <CloseIcon />
                    </button>}
                    {title &&
                    <div id={titleId} className={cx(styles.title, classNameForTitle)}>
                        {title}
                    </div>}
                    {shouldShowPrimaryButton &&
                    <div className={styles.primaryButtonContainer}>
                        <button
                            type="button"
                            className={styles.primaryButton}
                            onClick={primaryButtonOnClick}
                            disabled={primaryButtonDisabled === true}
                        >
                            {primaryButtonText || 'OK'}
                        </button>
                    </div>}
                </div>
            </header>
            <div className={styles.content} style={fullScreen ? contentStyleFullScreen : contentStyleModal}>
                {children}
            </div>
        </>
    );

    const panelClassName = cx(styles.dialogPanel, { [styles.fullScreen]: fullScreen });

    const panel = isDraggable ?
        (
            <Draggable
                handle="#draggable-dialog-title"
                cancel={'[class*="content"]'}
                // nodeRef avoids react-draggable's deprecated ReactDOM.findDOMNode() path.
                nodeRef={panelReference}
            >
                <div
                    ref={panelReference}
                    className={panelClassName}
                    style={panelStyle}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={title ? titleId : undefined}
                    tabIndex={-1}
                >
                    {panelInner}
                </div>
            </Draggable>
        ) :
        (
            <div
                ref={panelReference}
                className={panelClassName}
                style={panelStyle}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                tabIndex={-1}
            >
                {panelInner}
            </div>
        );

    return createPortal(
        <div className={cx(styles.responsiveDialog, className)}>
            <div
                className={cx(styles.backdrop, { [styles.alignTop]: align === 'top' })}
                onMouseDown={handleBackdropMouseDown}
            >
                {panel}
            </div>
        </div>,
        document.body
    );
};

export { ResponsiveDialog };
