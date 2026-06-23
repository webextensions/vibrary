import cx from 'classnames';
import { type CSSProperties, type MouseEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Draggable from 'react-draggable';
import { useMediaQuery } from 'react-responsive';

import { CloseIcon } from './Icons.tsx';

import styles from './ResponsiveDialog.module.css';

// Below this width the dialog goes fullscreen, matching the web-app-template's ResponsiveDialog breakpoint.
const FULLSCREEN_MEDIA_QUERY = '(max-width: 599.95px)';

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

    useBodyScrollLock(open);

    useEffect(function () {
        if (!open) {
            return undefined;
        }
        const handleKeyDown = function (event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return function () {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, onClose]);

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
        if (event.target === event.currentTarget) {
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
