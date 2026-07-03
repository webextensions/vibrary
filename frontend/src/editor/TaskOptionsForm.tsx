import Form from '@rjsf/core';
import type { Experimental_DefaultFormStateBehavior, RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';

import type { FormData } from './taskOptions.ts';

import styles from './TaskOptionsForm.module.css';

// The submit button is suppressed: running is driven by the card's existing "Run this task" button, and the form only
// collects values. Modeled on web-app-template's BuildForm (schema + formData + onChange + validator).
const uiSchema = {
    'ui:submitButtonOptions': { norender: true }
};

// The card seeds and owns the option values (schema defaults + remembered settings), so the form must not re-inject
// schema defaults on change: with rjsf's default behavior, clearing a field whose schema declares a `default` gets the
// default merged straight back, making it impossible to backspace a value down to empty before retyping it. Module
// scope keeps the object's identity stable so rjsf does not rebuild its schema utils every render.
const defaultFormStateBehavior: Experimental_DefaultFormStateBehavior = { emptyObjectFields: 'skipDefaults' };

const TaskOptionsForm = function (
    { schema, formData, onChange }:
    { schema: RJSFSchema; formData: FormData; onChange: (next: FormData) => void }
) {
    return (
        <Form
            schema={schema}
            uiSchema={uiSchema}
            formData={formData}
            validator={validator}
            // There is no submit to trigger validation, so surface schema violations (e.g. below a `minimum`) when the
            // user leaves the field - onBlur avoids flagging half-typed values on every keystroke.
            liveValidate="onBlur"
            experimental_defaultFormStateBehavior={defaultFormStateBehavior}
            className={styles.taskOptionsForm}
            onChange={function (result) {
                onChange((result.formData ?? {}) as FormData);
            }}
        />
    );
};

export { TaskOptionsForm };
