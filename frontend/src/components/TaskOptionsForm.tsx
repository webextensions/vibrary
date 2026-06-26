import Form from '@rjsf/core';
import type { RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';

import type { FormData } from './taskOptions.ts';

import styles from './TaskOptionsForm.module.css';

// The submit button is suppressed: running is driven by the card's existing "Run this task" button, and the form only
// collects values. Modeled on web-app-template's BuildForm (schema + formData + onChange + validator).
const uiSchema = {
    'ui:submitButtonOptions': { norender: true }
};

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
            className={styles.taskOptionsForm}
            onChange={function (result) {
                onChange((result.formData ?? {}) as FormData);
            }}
        />
    );
};

export { TaskOptionsForm };
