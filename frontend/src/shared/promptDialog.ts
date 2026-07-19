import { alertDialog } from 'helpmate/dist/dom/alertDialog.js';

import { closeAndRemoveDialog } from './dialogTeardown.ts';

import styles from './promptDialog.module.css';

// One choice a prompt can offer to insert into its input (e.g. a saved prompt template): picking it replaces the
// input's value with `value`, still editable before submitting.
type PromptInsertOption = { label: string; value: string };

// A single-line text prompt, built on helpmate's alert-only `alertDialog` the same way `confirmDialog` is: we hand it
// our own label + input + Cancel/Confirm buttons and resolve with the trimmed text, or null when the user cancels or
// dismisses via the backdrop - null unambiguously means "cancelled". Submitting a required prompt empty keeps the
// dialog open with a native validity message (the affirmative button must never silently behave as Cancel); with
// `allowEmpty`, an empty submit instead resolves with '' (e.g. a stash message). `initialValue` prefills and selects
// the input for edit-in-place prompts like rename. `insertOptions`, when non-empty, renders an insert-style select
// above the input (the PromptTemplatePicker behavior in imperative form): picking an option fills the input and the
// select snaps back to its placeholder row.
const promptDialog = function (
    { message, placeholder, confirmLabel, allowEmpty, initialValue, insertOptions }:
    { message: string; placeholder?: string; confirmLabel: string; allowEmpty?: boolean; initialValue?: string; insertOptions?: PromptInsertOption[] }
): Promise<string | null> {
    return new Promise(function (resolve) {
        const container = document.createElement('div');
        container.className = styles.promptDialog;

        const text = document.createElement('p');
        text.textContent = message;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = styles.promptInput;
        input.required = !allowEmpty;
        // The message <p> above is not programmatically associated with the input, so name the field with it -
        // focus lands here on open, and without this a screen reader announces an unnamed edit field.
        input.setAttribute('aria-label', message);
        if (placeholder !== undefined) {
            input.placeholder = placeholder;
        }
        if (initialValue !== undefined) {
            input.value = initialValue;
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
        if (insertOptions !== undefined && insertOptions.length > 0) {
            const insertSelect = document.createElement('select');
            insertSelect.className = styles.promptInsertSelect;
            insertSelect.setAttribute('aria-label', 'Insert a saved prompt template');
            const placeholderOption = document.createElement('option');
            placeholderOption.value = '';
            placeholderOption.disabled = true;
            placeholderOption.selected = true;
            placeholderOption.textContent = 'Insert saved template...';
            insertSelect.append(placeholderOption);
            for (const [index, option] of insertOptions.entries()) {
                const element = document.createElement('option');
                element.value = String(index);
                element.textContent = option.label;
                insertSelect.append(element);
            }
            insertSelect.addEventListener('change', function () {
                const chosen = insertOptions[Number(insertSelect.value)];
                if (chosen !== undefined) {
                    input.value = chosen.value;
                }
                // Snap back to the placeholder so the select reads as an insert action, not a held selection.
                insertSelect.value = '';
                input.focus();
            });
            container.append(text, insertSelect, input, actions);
        } else {
            container.append(text, input, actions);
        }

        let isSettled = false;
        const finish = function (value: string | null) {
            if (isSettled) {
                return;
            }
            isSettled = true;
            closeAndRemoveDialog(container);
            resolve(value);
        };

        const submit = function () {
            const trimmed = input.value.trim();
            if (trimmed === '' && !allowEmpty) {
                // Normalize a whitespace-only value to empty so the `required` constraint applies, then surface the
                // browser's native "please fill out this field" bubble and keep the dialog open awaiting input.
                input.value = '';
                input.reportValidity();
                return;
            }
            finish(trimmed);
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
        // Pre-select a prefilled value so typing replaces it outright, the way in-place rename fields behave.
        if (initialValue !== undefined) {
            input.select();
        }
    });
};

export { promptDialog };
