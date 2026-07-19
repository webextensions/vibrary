import { useSettingsState } from './settingsContext.ts';

import styles from './PromptTemplatePicker.module.css';

// The saved-template dropdown offered beside the agent actions' instruction boxes. Picking a template hands its text
// to the caller (which replaces the box's content - still editable per run) and snaps back to the placeholder row,
// so the select acts as an "insert" button rather than holding a selection. Renders nothing while the library is
// empty: an empty dropdown would only advertise a feature the user has not set up, and the Settings popover is where
// templates are created.
const PromptTemplatePicker = function ({ onPick, disabled = false }: { onPick: (text: string) => void; disabled?: boolean }) {
    const { promptTemplates } = useSettingsState();
    if (promptTemplates.length === 0) {
        return null;
    }
    return (
        <select
            className={styles.templatePicker}
            aria-label="Insert a saved prompt template"
            value=""
            disabled={disabled}
            onChange={function (changeEvent) {
                const template = promptTemplates.find(function (candidate) {
                    return candidate.id === changeEvent.target.value;
                });
                if (template !== undefined) {
                    onPick(template.text);
                }
            }}
        >
            <option value="" disabled>Insert saved template...</option>
            {promptTemplates.map(function (template) {
                return <option key={template.id} value={template.id}>{template.name}</option>;
            })}
        </select>
    );
};

export { PromptTemplatePicker };
