import { promptDialog } from '../promptDialog.ts';

// The "Provide custom one time instructions" prompt, shared by the single-card run/apply flow (RunActionSection) and
// the batch Actions popup (SpecsEditor) so the two ask with the same wording. Resolves with the entered text, or null
// when the user cancels; the prompt itself refuses an empty submit.
const promptForCustomInstructions = function (confirmLabel: string): Promise<string | null> {
    return promptDialog({
        message: 'Custom one-time instructions for this run:',
        placeholder: 'e.g. focus on the backend only, skip tests',
        confirmLabel
    });
};

export { promptForCustomInstructions };
