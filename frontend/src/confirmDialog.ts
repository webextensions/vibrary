import { alertDialog } from 'helpmate/dist/dom/alertDialog.js';

import styles from './confirmDialog.module.css';

// helpmate's `alertDialog` is alert-only: it renders a modal <dialog> for whatever element it is handed and closes on a
// backdrop click. We layer confirm semantics on top by handing it our own message + Cancel/Confirm buttons and
// resolving a promise based on which one (or a backdrop dismissal) closes the dialog.
const confirmDialog = function (message: string, confirmLabel: string): Promise<boolean> {
    return new Promise(function (resolve) {
        const container = document.createElement('div');
        container.className = styles.confirmDialog;

        const text = document.createElement('p');
        text.textContent = message;

        const actions = document.createElement('div');
        actions.className = styles.confirmDialogActions;

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel';

        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = styles.confirmOk;
        confirmButton.textContent = confirmLabel;

        actions.append(cancelButton, confirmButton);
        container.append(text, actions);

        let isSettled = false;
        const finish = function (didConfirm: boolean) {
            if (isSettled) {
                return;
            }
            isSettled = true;
            // helpmate only closes the <dialog> it appends, never removes it; drop the node so repeated confirms do not
            // accumulate dead dialogs in the DOM.
            const dialog = container.closest('dialog');
            dialog?.close();
            dialog?.remove();
            resolve(didConfirm);
        };

        cancelButton.addEventListener('click', function () {
            finish(false);
        });
        confirmButton.addEventListener('click', function () {
            finish(true);
        });

        alertDialog(container);

        // A backdrop click closes the dialog via helpmate; treat that dismissal as a cancel.
        container.closest('dialog')?.addEventListener('close', function () {
            finish(false);
        });

        // Without an explicit focus, the native <dialog> focuses the first focusable descendant in tree order - the
        // Cancel button, since it is appended before Confirm - so Enter would cancel instead of confirm. Focusing
        // Confirm here matches promptDialog's own input-focus behavior and the platform's native confirm() dialog,
        // where Enter performs the affirmative action; pressing Enter on a focused <button> triggers its click by
        // default, so no separate keydown handler is needed.
        confirmButton.focus();
    });
};

export { confirmDialog };
