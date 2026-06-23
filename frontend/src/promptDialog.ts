import { alertDialog } from 'helpmate/dist/dom/alertDialog.js';

import styles from './promptDialog.module.css';

// A single-line text prompt, built on helpmate's alert-only `alertDialog` the same way `confirmDialog` is: we hand it
// our own label + input + Cancel/Confirm buttons and resolve with the trimmed text, or null when the user cancels,
// submits nothing, or dismisses via the backdrop.
const promptDialog = function (
    { message, placeholder, confirmLabel }: { message: string; placeholder?: string; confirmLabel: string }
): Promise<string | null> {
    return new Promise(function (resolve) {
        const container = document.createElement('div');
        container.className = styles.promptDialog;

        const text = document.createElement('p');
        text.textContent = message;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = styles.promptInput;
        if (placeholder !== undefined) {
            input.placeholder = placeholder;
        }

        const actions = document.createElement('div');
        actions.className = styles.promptDialogActions;

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel';

        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = styles.promptOk;
        confirmButton.textContent = confirmLabel;

        actions.append(cancelButton, confirmButton);
        container.append(text, input, actions);

        let isSettled = false;
        const finish = function (value: string | null) {
            if (isSettled) {
                return;
            }
            isSettled = true;
            // helpmate only closes the <dialog> it appends, never removes it; drop the node so repeated prompts do not
            // accumulate dead dialogs in the DOM.
            const dialog = container.closest('dialog');
            dialog?.close();
            dialog?.remove();
            resolve(value);
        };

        const submit = function () {
            const trimmed = input.value.trim();
            finish(trimmed === '' ? null : trimmed);
        };

        cancelButton.addEventListener('click', function () {
            finish(null);
        });
        confirmButton.addEventListener('click', submit);
        input.addEventListener('keydown', function (keyEvent) {
            if (keyEvent.key !== 'Enter') {
                return;
            }
            keyEvent.preventDefault();
            submit();
        });

        alertDialog(container);

        // A backdrop click closes the dialog via helpmate; treat that dismissal as a cancel.
        container.closest('dialog')?.addEventListener('close', function () {
            finish(null);
        });

        input.focus();
    });
};

export { promptDialog };
