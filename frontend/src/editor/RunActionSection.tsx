import type { RJSFSchema } from '@rjsf/utils';
import { lazy, Suspense, useMemo, useState } from 'react';

import { useActivityQueueActions, useActivityQueueState } from '../activity/activityQueue.ts';
import { applySpecs, planSpec, runTask } from '../api.ts';
import { promptForCustomInstructions } from './customInstructions.ts';
import { hasPlan } from './planNotes.ts';
import { type SchemaMap } from './loadVibraryFile.ts';
import { useSettingsActions, useSettingsState } from '../settings/settingsContext.ts';
import { type Spec } from '../xml/vibraryXml.ts';

import { isRalphLoopEnabled, optionsToPrompt, schemaDefaults } from './taskOptions.ts';

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
    // The file this entry lives in, recorded on the queued job as its entry target so the activity row can navigate
    // back here. Null for a not-yet-loaded file, in which case the job simply carries no target.
    filePath: string | null;
    // Resolved option-form schemas for this file's entries, keyed by formSchemaRef.
    schemas: SchemaMap;
    // Called with the drafted implementation plan when a Plan first run finishes; the editor folds it into THIS
    // entry's notes by id (reading its live state, since minutes pass between click and plan).
    onPlanReady: (plan: string) => void
};

// The card's one headless-agent action, whose meaning depends on the entry type: a spec is "applied" (the codebase is
// made to conform to it), a task is "run" (the work it describes is carried out). Renders nothing for a review/idea
// entry - only spec and task entries have an action. A separate component from SpecCard because its state (per-run
// task options, seeded from remembered settings; the in-flight/custom-instructions flags) is entirely its own concern,
// never written back to the entry.
const RunActionSection = function ({ value, filePath, schemas, onPlanReady }: RunActionSectionProperties) {
    const { enqueue } = useActivityQueueActions();
    // State subscription is deliberate here: the button mirrors this entry's live queue status (review the
    // activeJob derivation below), so re-rendering on queue transitions is exactly what it needs.
    const { jobs } = useActivityQueueState();
    // State supplies only `loaded` (whose identity holds through task-options keystrokes - see settingsContext.ts);
    // the option readers/writers come from the stable actions bundle, so typing in one card's form re-renders no
    // other card's run section.
    const { loaded: settingsLoaded, promptTemplates } = useSettingsState();
    const { getTaskOptions, setTaskOptions, resetTaskOptions } = useSettingsActions();
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
        // Object.hasOwn, not a plain lookup: a hand-written formSchemaRef of "constructor" (or another Object.prototype
        // key) would otherwise read the inherited method - a truthy non-schema that `?? null` lets through and rjsf then
        // chokes on. Real refs are "<file>#<id>", so they always shadow nothing anyway; this only guards the odd input.
        return Object.hasOwn(schemas, value.formSchemaRef) ? schemas[value.formSchemaRef] : null;
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

    // A single-card Apply is a batch of one: there is no separate single-spec route (the batch prompt goes singular
    // for one entry), so the card adapts its arguments to applySpecs. The 'apply-spec' job kind stays client-side
    // vocabulary for the monitor's label.
    const applyOne = function (spec: { title: string; content: string; notes: string; instructions: string }, streamOptions: Parameters<typeof applySpecs>[2]) {
        return applySpecs([{ title: spec.title, content: spec.content, notes: spec.notes }], spec.instructions, streamOptions);
    };
    // A spec whose notes already hold a drafted plan applies WITH it - the notes ride the apply prompt - so the
    // button says as much: the plan-review checkpoint's promise is visible at the moment of applying.
    const planReviewed = value.type === 'spec' && hasPlan(value.notes);
    const runAction = value.type === 'task' ?
        { label: 'Run this task', kind: 'run-task' as const, busyLabel: 'Running...', run: runTask } :
        { label: planReviewed ? 'Apply with plan' : 'Apply this spec', kind: 'apply-spec' as const, busyLabel: 'Applying...', run: applyOne };

    // A queued or running job for this same entry (matched by kind plus label, which enqueue sets to the entry's
    // title). While one exists the buttons report it and refuse to queue a duplicate - an impatient double-click
    // otherwise silently queued the same agent run twice, i.e. two agents editing the working tree back to back.
    // Untitled entries share the '' label, so two entries with no title can shadow each other; a rare state worth
    // that simplicity. Re-running AFTER a job finishes stays possible: finished statuses do not match here. The
    // plan job counts too: planning and applying the same entry concurrently would race the notes the plan lands in.
    const activeJob = jobs.find(function (job) {
        return (job.kind === runAction.kind || job.kind === 'plan-spec') && job.label === value.title && (job.status === 'queued' || job.status === 'running');
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
            const entered = await promptForCustomInstructions(runAction.label, promptTemplates);
            setPrompting(false);
            if (entered === null) {
                return;
            }
            instructions = entered;
        }
        const options = optionsSchema ? optionsToPrompt(optionsSchema, optionsData) : '';
        // The Ralph-loop opt-in travels as a structured flag keyed on the schema property, not as prompt text (see
        // isRalphLoopEnabled); the rendered options line stays in the prompt for the agent to read.
        const useRalphLoop = optionsSchema !== null && isRalphLoopEnabled(optionsSchema, optionsData);
        const runArguments = { title: value.title, content: value.content, notes: value.notes, instructions, options, useRalphLoop };
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
                // The entry this job runs on, so its activity row links back here. Untitled entries carry no target:
                // a title is the only address the editor can navigate to.
                target: filePath !== null && value.title !== '' ? { filePath, entryTitle: value.title } : undefined,
                run: function (signal, onEvent) {
                    return runAction.run(runArguments, { signal, onEvent });
                }
            });
        } catch {
            // See above: the monitor already shows the failure.
        }
    };

    // Queue the plan-only run (the plan-review checkpoint's first half): the agent researches the codebase without
    // editing and the plan resolves as the job's result text, which onPlanReady folds into this entry's notes for
    // review - and, once reviewed, into the apply prompt via the notes. Shares the custom-instructions checkbox
    // with Apply: guidance given here shapes the plan.
    const handlePlan = async function () {
        if (prompting || activeJob !== undefined) {
            return;
        }
        let instructions = '';
        if (useCustomInstructions) {
            setPrompting(true);
            const entered = await promptForCustomInstructions('Plan first', promptTemplates);
            setPrompting(false);
            if (entered === null) {
                return;
            }
            instructions = entered;
        }
        const promptParts = ['Draft an implementation plan for:', value.content];
        if (instructions !== '') {
            promptParts.push('', 'Instructions:', instructions);
        }
        try {
            const plan = await enqueue({
                kind: 'plan-spec',
                label: value.title,
                prompt: promptParts.join('\n'),
                target: filePath !== null && value.title !== '' ? { filePath, entryTitle: value.title } : undefined,
                run: function (signal, onEvent) {
                    return planSpec({ title: value.title, content: value.content, notes: value.notes, instructions }, { signal, onEvent });
                }
            });
            if (plan.trim() !== '') {
                onPlanReady(plan);
            }
        } catch {
            // The monitor already shows the failure.
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
                {(function () {
                    if (activeJob === undefined) {
                        return runAction.label;
                    }
                    if (activeJob.status !== 'running') {
                        return 'Queued...';
                    }
                    return activeJob.kind === 'plan-spec' ? 'Planning...' : runAction.busyLabel;
                })()}
            </button>
            {value.type === 'spec' &&
            <button
                type="button"
                className={styles.planFirst}
                disabled={prompting || activeJob !== undefined}
                title="Draft an implementation plan into this entry's notes for review - no code is changed"
                onClick={handlePlan}
            >
                {planReviewed ? 'Re-plan' : 'Plan first'}
            </button>}
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
