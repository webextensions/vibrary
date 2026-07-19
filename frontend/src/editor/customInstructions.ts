import { promptDialog } from '../shared/promptDialog.ts';
import { type PromptTemplate } from '../settings/settings.ts';

// The "Provide custom one time instructions" prompt, shared by the single-card run/apply flow (RunActionSection) and
// the batch Actions popup (SpecsEditor) so the two ask with the same wording. Resolves with the entered text, or null
// when the user cancels; the prompt itself refuses an empty submit. Saved prompt templates, when any exist, appear
// as the dialog's insert select - picking one fills the input, still editable before running.
const promptForCustomInstructions = function (confirmLabel: string, templates: PromptTemplate[] = []): Promise<string | null> {
    return promptDialog({
        message: 'Custom one-time instructions for this run:',
        placeholder: 'e.g. focus on the backend only, skip tests',
        confirmLabel,
        insertOptions: templates.map(function (template) {
            return { label: template.name, value: template.text };
        })
    });
};

export { promptForCustomInstructions };
