import type { RJSFSchema } from '@rjsf/utils';
import { lazy, Suspense, useMemo, useState } from 'react';

import { useActivityQueueActions, useActivityQueueState } from '../activityQueue.ts';
import { applySpec, runTask } from '../api.ts';
import { promptForCustomInstructions } from './customInstructions.ts';
import { type SchemaMap } from '../loadVibraryFile.ts';
import { useSettings } from '../settingsContext.ts';
import { type Spec } from '../vibraryXml.ts';

import { optionsToPrompt, schemaDefaults } from './taskOptions.ts';

import formStyles from './forms.module.css';
import styles from './SpecCard.module.css';

// Load the options form on demand: rjsf plus its ajv validator is a sizeable chunk that is only needed once a task
// card with an options schema is expanded. lazy() wants a default export, so wrap the module's named export.
const TaskOptionsForm = lazy(async function () {
    const { TaskOptionsForm: component } = await import('./TaskOptionsForm.tsx');
    return { default: component };
});

type RunActionSectionProperties = {
    value: Spec;
    // Resolved option-form schemas for this file's entries, keyed by formSchemaRef.
    schemas: SchemaMap
};

// The card's one headless-agent action, whose meaning depends on the entry type: a spec is "applied" (the codebase is
// made to conform to it), a task is "run" (the work it describes is carried out). Renders nothing for a review/idea
// entry - only spec and task entries have an action. A separate component from SpecCard because its state (per-run
// task options, seeded from remembered settings; the in-flight/custom-instructions flags) is entirely its own concern,
// never written back to the entry.
const RunActionSection = function ({ value, schemas }: RunActionSectionProperties) {
    const { enqueue } = useActivityQueueActions();
    // State subscription is deliberate here: the button mirrors this entry's live queue status (review the
    // activeJob derivation below), so re-rendering on queue transitions is exactly what it needs.
    const { jobs } = useActivityQueueState();
    const { loaded: settingsLoaded, getTaskOptions, setTaskOptions, resetTaskOptions } = useSettings();
    // True only while the custom-instructions prompt is open - NOT while the run itself executes (the card hands the
    // job to the activity monitor and returns); the button's queued/running state is derived from the queue below.
    const [prompting, setPrompting] = useState(false);
    const [useCustomInstructions, setUseCustomInstructions] = useState(false);

    // A task may declare a per-run options form via `formSchemaRef` ("<sibling-file>#<schemaId>"), resolved when the
    // file loads into the `schemas` map (keyed by that same ref). A missing/dangling ref simply means "no form". The
    // selected values are ephemeral (seeded from the schema defaults, sent only with the run), so they live in local
    // state and are never written back to the entry.
    const optionsSchema = useMemo<RJSFSchema | null>(function () {
        if (value.type !== 'task' || value.formSchemaRef === '') {
            return null;
        }
        return schemas[value.formSchemaRef] ?? null;
    }, [value.type, value.formSchemaRef, schemas]);
    // The task's options form is keyed by its stable formSchemaRef (entry ids are regenerated on every parse). The last
    // used values are remembered in the per-project settings and re-applied here; a "Reset to default options" button
    // drops them back to the schema defaults.
    const optionsReference = value.formSchemaRef;
    const [optionsData, setOptionsData] = useState<Record<string, unknown>>(function () {
        return optionsSchema ? schemaDefaults(optionsSchema) : {};
    });
    // Settings load asynchronously, so the initial state above is seeded from schema defaults. Once they arrive, apply
    // any remembered values by adjusting state during render (the React-recommended alternative to a setState effect),
    // guarded so it runs once and never clobbers edits the user already made this session (`optionsTouched`).
    const [optionsTouched, setOptionsTouched] = useState(false);
    const [optionsSeeded, setOptionsSeeded] = useState(false);
    if (!optionsSeeded && settingsLoaded && optionsSchema !== null && !optionsTouched) {
        setOptionsSeeded(true);
        const stored = getTaskOptions(optionsReference);
        if (stored !== null) {
            setOptionsData({ ...schemaDefaults(optionsSchema), ...stored });
        }
    }

    if (value.type !== 'spec' && value.type !== 'task') {
        return null;
    }

    const handleOptionsChange = function (next: Record<string, unknown>) {
        setOptionsTouched(true);
        setOptionsData(next);
        setTaskOptions(optionsReference, next);
    };

    const handleResetOptions = function () {
        if (optionsSchema === null) {
            return;
        }
        setOptionsTouched(true);
        setOptionsData(schemaDefaults(optionsSchema));
        resetTaskOptions(optionsReference);
    };

    const runAction = value.type === 'task' ?
        { label: 'Run this task', kind: 'run-task' as const, busyLabel: 'Running...', run: runTask } :
        { label: 'Apply this spec', kind: 'apply-spec' as const, busyLabel: 'Applying...', run: applySpec };

    // A queued or running job for this same entry (matched by kind plus label, which enqueue sets to the entry's
    // title). While one exists the button reports it and refuses to queue a duplicate - an impatient double-click
    // otherwise silently queued the same agent run twice, i.e. two agents editing the working tree back to back.
    // Untitled entries share the '' label, so two entries with no title can shadow each other; a rare state worth
    // that simplicity. Re-running AFTER a job finishes stays possible: finished statuses do not match here.
    const activeJob = jobs.find(function (job) {
        return job.kind === runAction.kind && job.label === value.title && (job.status === 'queued' || job.status === 'running');
    });

    // Queue the headless agent for this entry on the activity monitor (one job runs at a time). Uses the in-memory value
    // (current edits), so no save is needed first; the run's stream, result, and any failure render in the monitor.
    // When "Provide custom one time instructions" is ticked, prompt first and forward the entered text to this run;
    // cancelling aborts queuing rather than proceeding without the instructions the user opted to give (the prompt
    // itself refuses an empty submit). The card returns as soon as the job is enqueued - progress lives in the
    // activity monitor.
    const handleApply = async function () {
        if (prompting || activeJob !== undefined) {
            return;
        }
        let instructions = '';
        if (useCustomInstructions) {
            setPrompting(true);
            const entered = await promptForCustomInstructions(runAction.label);
            setPrompting(false);
            if (entered === null) {
                return;
            }
            instructions = entered;
        }
        const options = optionsSchema ? optionsToPrompt(optionsSchema, optionsData) : '';
        const runArguments = { title: value.title, content: value.content, notes: value.notes, instructions, options };
        // The concise bubble shown in the activity: the user-authored parts, minus the backend's boilerplate framing (the
        // exact prompt is available via the bubble's "Full" toggle).
        const promptParts = [value.content];
        if (options !== '') {
            promptParts.push('', 'Selected options:', options);
        }
        if (instructions !== '') {
            promptParts.push('', 'Instructions:', instructions);
        }
        // Enqueue and let the activity monitor own the run from here: it renders the stream, the result, and any
        // failure. The card only swallows the promise's rejection so a failed job (already recorded on the job row)
        // does not surface again as an unhandled rejection.
        try {
            await enqueue({
                kind: runAction.kind,
                label: value.title,
                prompt: promptParts.join('\n'),
                run: function (signal, onEvent) {
                    return runAction.run(runArguments, { signal, onEvent });
                }
            });
        } catch {
            // See above: the monitor already shows the failure.
        }
    };

    const fieldId = function (name: string) {
        return `spec-${value.id}-${name}`;
    };

    return (
        <div className={styles.applyRow}>
            {optionsSchema &&
            <div className={styles.optionsBlock}>
                <button type="button" className={styles.resetOptions} onClick={handleResetOptions}>
                    Reset to default options
                </button>
                {/* The fallback stays empty: the chunk loads once, near-instantly from the local
                  * server, so a spinner would only flash. */}
                <Suspense fallback={null}>
                    <TaskOptionsForm
                        schema={optionsSchema}
                        formData={optionsData}
                        onChange={handleOptionsChange}
                    />
                </Suspense>
            </div>}
            <button
                type="button"
                className={styles.apply}
                disabled={prompting || activeJob !== undefined}
                onClick={handleApply}
            >
                {activeJob !== undefined && <span className={styles.spinner} aria-hidden="true" />}
                {activeJob === undefined ? runAction.label : (activeJob.status === 'running' ? runAction.busyLabel : 'Queued...')}
            </button>
            <label className={formStyles.checkbox} htmlFor={fieldId('custom-instructions')}>
                <input
                    id={fieldId('custom-instructions')}
                    type="checkbox"
                    checked={useCustomInstructions}
                    onChange={function (changeEvent) {
                        setUseCustomInstructions(changeEvent.target.checked);
                    }}
                />
                Provide custom one time instructions
            </label>
        </div>
    );
};

export { RunActionSection };
