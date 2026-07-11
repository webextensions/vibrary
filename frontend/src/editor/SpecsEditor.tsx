import cx from 'classnames';
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';
import { toast } from 'react-toastify';

import { useActivityQueueActions } from '../activity/activityQueue.ts';
import { useDismissablePopup } from '../shared/useDismissablePopup.ts';
import { useEscapeToClear } from '../shared/useEscapeToClear.ts';
import { applySpecs } from '../api.ts';
import { confirmDialog } from '../shared/confirmDialog.ts';
import { copyText } from '../shared/copyText.ts';
import { promptDialog } from '../shared/promptDialog.ts';
import { type SchemaMap } from './loadVibraryFile.ts';
import { promptForCustomInstructions } from './customInstructions.ts';
import { moveEntry } from './moveEntry.ts';
import { specToMarkdown } from './specMarkdown.ts';
import { approvalState, type ApprovalState, countApprovedSpecs, emptySpec, ENTRY_TYPES, type EntryType, hashContent, nowTimestamp, randomId, type Spec } from '../xml/vibraryXml.ts';

import { AiIcon, ClickIcon, CloseIcon, CopyIcon, LabelIcon, PlusIcon, RemoveIcon } from '../shared/Icons.tsx';
import { CreateEntriesDialog } from './CreateEntriesDialog.tsx';
import { SpecCard } from './SpecCard.tsx';

import formStyles from './forms.module.css';
import styles from './SpecsEditor.module.css';

type Option = { value: string; label: string };

type SpecsEditorProperties = {
    // Seeds the "Create with AI" dialog's type dropdown, derived from the open file's name (only a default, not a
    // constraint - a file may hold any mix of entry types).
    defaultEntryType: EntryType;
    specs: Spec[];
    // Resolved option-form schemas for this file's entries, keyed by formSchemaRef; forwarded to each SpecCard.
    schemas: SchemaMap;
    allTitles: string[];
    // A Search query whose matching entry the editor scrolls to and briefly highlights. Set when this file was opened
    // from a Search result; undefined otherwise.
    highlightQuery?: string;
    // Which of the (possibly several) entries matching highlightQuery to land on: 0 for the first, 1 for the second,
    // and so on, matching the position of the clicked row within that file's Search results. Ignored when
    // highlightQuery is unset; defaults to 0 (the "Relates to" chip navigation path, whose title match is unique).
    highlightMatchIndex?: number;
    // When set, highlightQuery is an entry TITLE to match exactly (the "Relates to" chip path) rather than a
    // substring to search - an earlier entry merely mentioning the title must not win over the entry bearing it.
    highlightExactTitle?: boolean;
    onChange: (next: Spec[]) => void;
    // Generates the requested number of entries of the given type via the backend AI agent and refreshes the file.
    // `instructions` carries optional custom one-time guidance from the dialog's own field. Rejects on failure so the
    // dialog can surface the error.
    onGenerate: (type: EntryType, count: number, instructions: string) => Promise<void>;
    // Navigate to the entry a clicked "Relates to" chip points at (which may live in a different file).
    onOpenRelated: (title: string) => void;
    // Whether the filter dropdowns are open. Toggled by the Filter button in the toolbar (see App.tsx).
    showFilters: boolean;
    // Selected status filters, owned by App so the toolbar's Filter button can show an "active" badge.
    statusFilter: Option[];
    onStatusFilterChange: (next: Option[]) => void;
    // Selected entry-type filters, owned by App alongside statusFilter.
    typeFilter: Option[];
    onTypeFilterChange: (next: Option[]) => void;
    // Selected label filters, owned by App alongside statusFilter/typeFilter. Options are derived from whatever labels
    // are actually present on this file's entries (labels are freeform, unlike the fixed status/type enums).
    labelFilter: Option[];
    onLabelFilterChange: (next: Option[]) => void;
    // Selected "Created by" filters, owned by App alongside the others. Fixed options (Human / AI / Unspecified),
    // like the status and type enums.
    creatorFilter: Option[];
    onCreatorFilterChange: (next: Option[]) => void
};

// Human-readable label per approval state, shown as the filter option text.
const STATE_LABELS: Record<ApprovalState, string> = {
    current: 'Approved',
    stale: 'Needs re-approval',
    none: 'Not approved'
};

// Order the states most-approved-first.
const STATE_ORDER: ApprovalState[] = ['current', 'stale', 'none'];

// One filter option per approval state. The option value is the state itself, so a selection maps straight back to a
// state when matching.
const FILTER_OPTIONS: Option[] = STATE_ORDER.map(function (state) {
    return { value: state, label: STATE_LABELS[state] };
});

// Human-readable label per entry type, shown as the type-filter option text.
const TYPE_LABELS: Record<EntryType, string> = {
    spec: 'Spec',
    review: 'Review',
    task: 'Task',
    idea: 'Idea'
};

// One filter option per entry type. The option value is the type itself, so a selection maps straight back to a type
// when matching.
const TYPE_FILTER_OPTIONS: Option[] = ENTRY_TYPES.map(function (type) {
    return { value: type, label: TYPE_LABELS[type] };
});

// The "Created by" filter's options, one per provenance value a spec's createdBy can hold: 'Human', 'AI', or '' (never
// set). The option value is the createdBy string itself, so a selection maps straight back to it when matching - the
// empty-string option catches entries whose creator was never recorded.
const CREATOR_FILTER_OPTIONS: Option[] = [
    { value: 'Human', label: 'Human' },
    { value: 'AI', label: 'AI' },
    { value: '', label: 'Unspecified' }
];

const SpecsEditor = function (
    { defaultEntryType, specs, schemas, allTitles, highlightQuery, highlightMatchIndex, highlightExactTitle, onChange, onGenerate, onOpenRelated, showFilters, statusFilter, onStatusFilterChange, typeFilter, onTypeFilterChange, labelFilter, onLabelFilterChange, creatorFilter, onCreatorFilterChange }:
    SpecsEditorProperties
) {
    // Ids of specs currently open in edit mode. Existing specs default to review mode; only newly added specs (or
    // ones the user explicitly clicks "Edit" on) appear here.
    const [editingIds, setEditingIds] = useState<Set<string>>(function () {
        return new Set();
    });

    // Ids of specs ticked in the footer's selection checkboxes; drives the count and the batch "Apply changes" action.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(function () {
        return new Set();
    });

    // Ids of specs whose extra-fields section is open. Lifted from the card (was local) so the footer's "Expand all /
    // Collapse all" can drive every visible card at once; a card still toggles its own via the chevron.
    const [expandedIds, setExpandedIds] = useState<Set<string>>(function () {
        return new Set();
    });

    // Free-text filter that narrows the visible entries to those whose title/content/notes contain it, composing (AND)
    // with the status/type/label filters. Local editor state like the sets above (reset on reload); distinct from the
    // global Search panel, which jumps ACROSS files to one entry rather than narrowing the open file's list.
    const [textFilter, setTextFilter] = useState('');

    const { enqueue } = useActivityQueueActions();

    // Id of the entry briefly ring-highlighted after the file was opened from a Search result; cleared on a timer.
    const [highlightId, setHighlightId] = useState<string | null>(null);

    // The id of the entry a clicked search result points at, or null when there is no query or no match. The index
    // addresses the file's entries DIRECTLY (the backend's search is entry-aware, and both sides parse the same
    // file), clamped for staleness; if the addressed entry no longer contains the query (edited since the search
    // ran), fall back to the first entry that does. Drives both the scroll-to target and keeping that entry visible
    // even under an active filter.
    const highlightMatchId = useMemo(function () {
        const needle = highlightQuery?.trim().toLowerCase();
        if (!needle || specs.length === 0) {
            return null;
        }
        if (highlightExactTitle) {
            const target = specs.find(function (spec) { return spec.title === highlightQuery; });
            return target === undefined ? null : target.id;
        }
        const matchesNeedle = function (spec: Spec) {
            return `${spec.title}\n${spec.content}\n${spec.notes}`.toLowerCase().includes(needle);
        };
        const indexed = specs[Math.min(highlightMatchIndex ?? 0, specs.length - 1)];
        if (matchesNeedle(indexed)) {
            return indexed.id;
        }
        const fallback = specs.find(function (spec) { return matchesNeedle(spec); });
        return fallback === undefined ? null : fallback.id;
    }, [highlightQuery, highlightMatchIndex, highlightExactTitle, specs]);

    // When a match is found, scroll its card into view and ring-highlight it for a couple of seconds so the user can
    // spot the entry the search result pointed at. The card's id is set in SpecCard.
    useEffect(function () {
        if (highlightMatchId === null) {
            return undefined;
        }
        // Set the highlight inside the animation frame (not synchronously in the effect body) and scroll the card into
        // view; clear the ring after a short delay.
        const frame = requestAnimationFrame(function () {
            setHighlightId(highlightMatchId);
            document.getElementById(`spec-${highlightMatchId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        const timer = setTimeout(function () {
            setHighlightId(null);
        }, 2000);
        return function () {
            cancelAnimationFrame(frame);
            clearTimeout(timer);
        };
    }, [highlightMatchId, highlightQuery]);

    // The "Actions" popup above the footer: whether it is open. A batch apply is queued on the activity monitor, which
    // owns its progress and errors once running; the popup's own state is just the optional custom-instructions
    // prompt, mirroring RunActionSection's single-card "Provide custom one time instructions" flow.
    const [actionsOpen, setActionsOpen] = useState(false);
    const [useCustomInstructions, setUseCustomInstructions] = useState(false);
    const [applyingBatch, setApplyingBatch] = useState(false);
    const actionsReference = useRef<HTMLDivElement>(null);

    // The "Operations" popup above the footer: bulk approve / remove-approval / delete over the selected entries.
    const [operationsOpen, setOperationsOpen] = useState(false);
    const operationsReference = useRef<HTMLDivElement>(null);

    // The "+" button expands into a speed-dial menu offering manual vs AI entry creation; the AI choice opens
    // CreateEntriesDialog, which owns its own form state.
    const [menuOpen, setMenuOpen] = useState(false);
    const [aiDialogOpen, setAiDialogOpen] = useState(false);
    const speedDialReference = useRef<HTMLDivElement>(null);

    // While the speed-dial menu / Actions popup / Operations popup is open, dismiss it on an outside press or Escape.
    useDismissablePopup(menuOpen, function () { setMenuOpen(false); }, speedDialReference);
    useDismissablePopup(actionsOpen, function () { setActionsOpen(false); }, actionsReference);
    useDismissablePopup(operationsOpen, function () { setOperationsOpen(false); }, operationsReference);

    // Escape clears the entry selection (the app-wide convention, shared with Sidebar's file selection via
    // useEscapeToClear, which also stands down while any dialog is open). Skipped while one of the popups above is
    // open, so its own Escape handler closes it first rather than also wiping the selection it operates on.
    useEscapeToClear(selectedIds.size > 0 && !menuOpen && !actionsOpen && !operationsOpen, function () {
        setSelectedIds(new Set());
    });

    const toggleSelect = function (id: string) {
        setSelectedIds(function (previous) {
            const next = new Set(previous);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleExpand = function (id: string) {
        setExpandedIds(function (previous) {
            const next = new Set(previous);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleMode = function (id: string) {
        setEditingIds(function (previous) {
            const next = new Set(previous);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const updateAt = function (index: number, next: Spec) {
        // Any edit to an existing spec flows through here, so stamp the update time and updater in one place. The
        // editor UI is only ever driven by a human, so the updater is Human; AI stamps itself when editing the file.
        const stamped = { ...next, updated: nowTimestamp(), updatedBy: 'Human' as const };
        onChange(specs.map(function (spec, position) {
            return position === index ? stamped : spec;
        }));
    };

    const removeAt = function (index: number) {
        onChange(specs.filter(function (_spec, position) {
            return position !== index;
        }));
    };

    // Clone a source entry as a starting point for a similar one: same type/content/notes/labels/relatesTo, but a fresh
    // id and timestamps, an unapproved state (a copy has not itself been signed off), and "-copy" appended to a
    // non-empty title so it does not collide with the source's. Shared by the single-card Duplicate button and the
    // bulk "Duplicate" operation below.
    const cloneSpec = function (source: Spec, now: string): Spec {
        return {
            ...source,
            id: randomId(),
            title: source.title === '' ? '' : `${source.title}-copy`,
            approved: '',
            created: now,
            updated: now,
            updatedBy: 'Human'
        };
    };

    // After React commits a newly added/duplicated card, bring the whole card into view and focus its content box so
    // the user can start typing right away. preventScroll keeps focus from fighting the smooth scrollIntoView
    // positioning; the rAF waits for the card to exist in the DOM.
    const focusSpecContent = function (id: string) {
        requestAnimationFrame(function () {
            const textarea = document.getElementById(`spec-${id}-content`);
            if (textarea instanceof HTMLTextAreaElement) {
                textarea.closest('fieldset')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                textarea.focus({ preventScroll: true });
            }
        });
    };

    // Duplicate one entry, inserted right after the source, opened in edit mode, scrolled into view and focused - same
    // finishing touches as addSpec.
    const duplicateAt = function (index: number) {
        const duplicate = cloneSpec(specs[index], nowTimestamp());
        onChange([...specs.slice(0, index + 1), duplicate, ...specs.slice(index + 1)]);
        setEditingIds(function (previous) {
            return new Set(previous).add(duplicate.id);
        });
        focusSpecContent(duplicate.id);
    };

    const addSpec = function () {
        const spec = emptySpec();
        onChange([...specs, spec]);
        setEditingIds(function (previous) {
            return new Set(previous).add(spec.id); // a brand-new spec opens directly in edit mode
        });
        focusSpecContent(spec.id);
    };

    // A spec matches when its approval state is among the selected statuses, its type is among the selected types, its
    // creator is among the selected creators, AND it carries at least one of the selected labels. An empty selection in
    // any dimension imposes no constraint there.
    const selectedKeys = new Set(statusFilter.map(function (option) {
        return option.value;
    }));
    const selectedTypeKeys = new Set(typeFilter.map(function (option) {
        return option.value;
    }));
    const selectedLabelKeys = new Set(labelFilter.map(function (option) {
        return option.value;
    }));
    const selectedCreatorKeys = new Set(creatorFilter.map(function (option) {
        return option.value;
    }));
    // Whether any of the filter dimensions is constraining the list, and a one-click reset of all of them (today
    // the user must clear each Select and the text box separately).
    const hasActiveFilter = statusFilter.length > 0 || typeFilter.length > 0 || labelFilter.length > 0 || creatorFilter.length > 0 || textFilter !== '';
    const clearAllFilters = function () {
        onStatusFilterChange([]);
        onTypeFilterChange([]);
        onLabelFilterChange([]);
        onCreatorFilterChange([]);
        setTextFilter('');
    };

    const textNeedle = textFilter.trim().toLowerCase();
    const isFilterMatch = function (spec: Spec): boolean {
        const isStatusMatch = selectedKeys.size === 0 || selectedKeys.has(approvalState(spec));
        const isTypeMatch = selectedTypeKeys.size === 0 || selectedTypeKeys.has(spec.type);
        const isLabelMatch = selectedLabelKeys.size === 0 || spec.labels.some(function (label) {
            return selectedLabelKeys.has(label);
        });
        const isCreatorMatch = selectedCreatorKeys.size === 0 || selectedCreatorKeys.has(spec.createdBy);
        const isTextMatch = textNeedle === '' || `${spec.title}\n${spec.content}\n${spec.notes}`.toLowerCase().includes(textNeedle);
        return isStatusMatch && isTypeMatch && isLabelMatch && isCreatorMatch && isTextMatch;
    };

    // Every distinct label currently used across this file's entries, alphabetized, as the label filter's option
    // list - labels are freeform (unlike the fixed status/type enums), so the options must come from the data itself.
    const labelFilterOptions: Option[] = useMemo(function () {
        const labels = new Set<string>();
        for (const spec of specs) {
            for (const label of spec.labels) {
                labels.add(label);
            }
        }
        return [...labels].toSorted(function (a, b) {
            return a.localeCompare(b);
        }).map(function (label) {
            return { value: label, label };
        });
    }, [specs]);

    // Every title a "Make unique" fix must avoid: the saved cross-file titles PLUS this file's live, possibly-unsaved
    // ones. allTitles alone comes from the server's last-saved summary, so it cannot see two entries the user just
    // typed the same title into - exactly the case the fix exists for.
    const takenTitles = useMemo(function () {
        return [...allTitles, ...specs.map(function (spec) { return spec.title; })];
    }, [allTitles, specs]);

    // Titles duplicated within the open file. Titles are cross-file identifiers - relatesTo references resolve by
    // exact title - so a duplicate silently makes references ambiguous; nothing else enforces the format doc's
    // uniqueness rule (the create paths avoid collisions, but manual edits can introduce them). Flagged per card,
    // styled after the stale-approval affordance.
    const duplicateTitles = useMemo(function () {
        const seen = new Set<string>();
        const duplicates = new Set<string>();
        for (const spec of specs) {
            if (spec.title === '') {
                continue;
            }
            if (seen.has(spec.title)) {
                duplicates.add(spec.title);
            }
            seen.add(spec.title);
        }
        return duplicates;
    }, [specs]);

    // A card's label chip toggles that label into (or out of) the active label filter - a quick "show me more/fewer
    // like this" shortcut, mirroring how a "Relates to" chip navigates instead. Symmetric with the dropdown: clicking
    // an already-selected label's chip again clears it.
    const handleLabelClick = function (label: string) {
        onLabelFilterChange(
            selectedLabelKeys.has(label) ?
                labelFilter.filter(function (option) { return option.value !== label; }) :
                [...labelFilter, { value: label, label }]
        );
    };

    // Keep each spec's original index so updateAt/removeAt still address the full list after filtering. A spec being
    // edited is always shown - otherwise a freshly added spec (none/none) or one whose status just changed would
    // vanish mid-edit.
    const shown = specs
        .map(function (spec, index) {
            return { spec, index };
        })
        .filter(function ({ spec }) {
            return editingIds.has(spec.id) || spec.id === highlightMatchId || isFilterMatch(spec);
        });

    // Selected specs in document order, ignoring any stale ids whose spec was removed. The footer count, and the
    // Approve/Remove Approval/Duplicate/Delete operations (which apply to any entry type), read from this.
    const selectedSpecs = specs.filter(function (spec) {
        return selectedIds.has(spec.id);
    });

    // How many entries are currently approved (human sign-off matching the current content). Drives the footer's
    // approval progress meter - an at-a-glance sense of how much of the file is signed off, live as edits change it.
    // Uses the shared counter (the same one the sidebar badges use) so the "approved = current" rule lives in one place.
    const approvedCount = countApprovedSpecs(specs);
    // Floor, not round: at 199/200 a rounded 100% would paint a FULL bar while the tally beside it still reads 199/200.
    const approvedPercent = specs.length === 0 ? 0 : Math.floor((approvedCount / specs.length) * 100);

    // The subset of the selection the batch "Apply changes" can faithfully run: SPEC entries only. The batch goes
    // through the apply prompt ("make the project conform to these specs"), which misrepresents every other type - a
    // review/idea has no run semantics at all, and a task's action is "carry out the work" with its own per-run
    // options form and Ralph opt-in that the batch path cannot carry. Ticked tasks are counted among the skipped
    // (the popup says so) and keep their richer single-card "Run this task" flow.
    const applicableSpecs = selectedSpecs.filter(function (spec) {
        return spec.type === 'spec';
    });

    // Queue the backend's headless agent over every applicable selected spec as one combined "claude -p" job on the
    // activity monitor. When "Provide custom one time
    // instructions" is ticked, prompt first (mirroring the single-card flow) and fold the entered text into the batch
    // prompt; cancelling aborts without enqueueing. The popup closes as soon as the job is enqueued; progress and any
    // error live in the activity monitor.
    const handleApplyChanges = async function () {
        if (applicableSpecs.length === 0 || applyingBatch) {
            return;
        }
        let instructions = '';
        if (useCustomInstructions) {
            setApplyingBatch(true);
            const entered = await promptForCustomInstructions('Apply changes');
            setApplyingBatch(false);
            if (entered === null) {
                return;
            }
            instructions = entered;
        }
        const entries = applicableSpecs.map(function (spec) {
            return { title: spec.title, content: spec.content, notes: spec.notes };
        });
        const count = entries.length;
        const promptParts = [`Apply ${count} ${count === 1 ? 'spec' : 'specs'}:`];
        for (const spec of applicableSpecs) {
            promptParts.push(`- ${spec.title}`);
        }
        if (instructions !== '') {
            promptParts.push('', 'Instructions:', instructions);
        }
        const label = `${count} ${count === 1 ? 'spec' : 'specs'}`;
        const promise = enqueue({
            kind: 'apply-batch',
            label,
            prompt: promptParts.join('\n'),
            run: function (signal, onEvent) {
                return applySpecs(entries, instructions, { signal, onEvent });
            }
        });
        // Close the popup right away (synchronously, before the await); progress, the result, and any failure live
        // in the activity monitor. The await only swallows the promise's rejection so a failed job (already recorded
        // on the job row) does not surface again as an unhandled rejection.
        setActionsOpen(false);
        try {
            await promise;
        } catch {
            // See above: the monitor already shows the failure.
        }
    };

    // Whether every currently-shown entry is already ticked; gates the "Select all" link.
    const allShownSelected = shown.length > 0 && shown.every(function ({ spec }) {
        return selectedIds.has(spec.id);
    });

    // "Select all" ticks only the entries currently visible (a status filter may hide others), never the hidden ones.
    const selectAllShown = function () {
        setSelectedIds(new Set(shown.map(function ({ spec }) {
            return spec.id;
        })));
    };

    const deselectAll = function () {
        setSelectedIds(new Set());
    };

    // Keyboard navigation between visible cards, so a keyboard user can traverse the list without Tabbing through every
    // control of each card: Alt+ArrowUp/Down steps to the previous/next card, Home/End jumps to the first/last. Each
    // lands on the target card's select checkbox and scrolls it into view. Alt guards the arrows (on macOS Option+Up/Down
    // is move-caret-by-paragraph); Home/End are bare but the text-entry guard below keeps them free for editing.
    const handleListKeyDown = function (event: ReactKeyboardEvent<HTMLDivElement>) {
        const isStep = event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp');
        const isJump = !event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 'Home' || event.key === 'End');
        if (!isStep && !isJump) {
            return;
        }
        // Never steal the key from text entry or a dropdown: the scroll area also holds the filter box, every
        // textarea/title input, and the react-select menus (whose own ArrowDown ignores altKey; Home/End move the
        // caret there). Checkboxes and buttons - where this navigation actually lands - are deliberately still eligible.
        const target = event.target;
        const isTextInput = target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'radio';
        const isEditable = target instanceof HTMLElement && target.isContentEditable;
        const isInDropdown = target instanceof Element && target.closest('[role="combobox"], [role="listbox"]') !== null;
        if (isTextInput || isEditable || isInDropdown || target instanceof HTMLTextAreaElement) {
            return;
        }
        const order = shown.map(function ({ spec }) { return spec.id; });
        if (order.length === 0) {
            return;
        }
        let nextIndex;
        if (isJump) {
            nextIndex = event.key === 'Home' ? 0 : order.length - 1;
        } else {
            const activeCard = document.activeElement instanceof Element ? document.activeElement.closest('[data-spec-id]') : null;
            const currentId = activeCard instanceof HTMLElement ? activeCard.dataset.specId ?? '' : '';
            const currentIndex = order.indexOf(currentId);
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            nextIndex = currentIndex === -1 ?
                (delta === 1 ? 0 : order.length - 1) :
                Math.min(order.length - 1, Math.max(0, currentIndex + delta));
        }
        event.preventDefault();
        const card = document.getElementById(`spec-${order[nextIndex]}`);
        card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const checkbox = card?.querySelector('input[type="checkbox"]');
        if (checkbox instanceof HTMLElement) {
            checkbox.focus({ preventScroll: true });
        }
    };

    // Whether every currently-shown entry is expanded; flips the footer toggle between Expand all and Collapse all.
    const allShownExpanded = shown.length > 0 && shown.every(function ({ spec }) {
        return expandedIds.has(spec.id);
    });

    // Expand or collapse the extra-fields section of every VISIBLE entry at once (a filter may hide others, which are
    // left as they were), mirroring how Select all operates only on the shown set.
    const toggleExpandAll = function () {
        const shownIds = shown.map(function ({ spec }) { return spec.id; });
        setExpandedIds(function (previous) {
            const next = new Set(previous);
            for (const id of shownIds) {
                if (allShownExpanded) {
                    next.delete(id);
                } else {
                    next.add(id);
                }
            }
            return next;
        });
    };

    // Apply a transform to every selected entry, stamping each as a fresh human edit - matching the single-card path
    // (SpecCard's onChange flows through updateAt, which stamps updated/updatedBy the same way).
    const updateSelected = function (transform: (spec: Spec) => Spec) {
        onChange(specs.map(function (spec) {
            if (!selectedIds.has(spec.id)) {
                return spec;
            }
            return { ...transform(spec), updated: nowTimestamp(), updatedBy: 'Human' as const };
        }));
    };

    const handleBulkApprove = function () {
        updateSelected(function (spec) {
            return { ...spec, approved: hashContent(spec) };
        });
        setOperationsOpen(false);
    };

    // Copy every selected entry as one Markdown document (each entry's specToMarkdown, separated by a horizontal rule),
    // for pasting a whole set into a PR or doc - the bulk counterpart of the single-card Copy. Select all first to copy
    // the entire file. copyText falls back to the legacy path on a plain-HTTP LAN origin (the phone case).
    const handleBulkCopyMarkdown = async function () {
        const copied = await copyText(selectedSpecs.map(function (spec) { return specToMarkdown(spec); }).join('\n---\n\n'));
        if (copied) {
            toast.success(`Copied ${selectedSpecs.length} ${selectedSpecs.length === 1 ? 'entry' : 'entries'} as Markdown`);
        } else {
            toast.error('Could not copy to the clipboard');
        }
        setOperationsOpen(false);
    };

    // Add a label to every selected entry at once (deduped per entry), for tagging a set in one go. Labels are freeform
    // (the per-card editor is a creatable select), so this just takes text; the prompt enforces a non-empty value.
    const handleBulkAddLabel = async function () {
        const label = await promptDialog({
            message: `Add a label to ${selectedSpecs.length} selected ${selectedSpecs.length === 1 ? 'entry' : 'entries'}:`,
            placeholder: 'label',
            confirmLabel: 'Add label'
        });
        if (label === null) {
            return;
        }
        const trimmed = label.trim();
        if (trimmed === '') {
            return;
        }
        updateSelected(function (spec) {
            return spec.labels.includes(trimmed) ? spec : { ...spec, labels: [...spec.labels, trimmed] };
        });
        setOperationsOpen(false);
    };

    // Remove a label from every selected entry that has it (the bulk counterpart of Add label; the per-card editor
    // removes labels one entry at a time). An entry that lacks the label is left unchanged.
    const handleBulkRemoveLabel = async function () {
        const label = await promptDialog({
            message: `Remove a label from ${selectedSpecs.length} selected ${selectedSpecs.length === 1 ? 'entry' : 'entries'}:`,
            placeholder: 'label',
            confirmLabel: 'Remove label'
        });
        if (label === null) {
            return;
        }
        const trimmed = label.trim();
        if (trimmed === '') {
            return;
        }
        updateSelected(function (spec) {
            return spec.labels.includes(trimmed) ?
                { ...spec, labels: spec.labels.filter(function (existing) { return existing !== trimmed; }) } :
                spec;
        });
        setOperationsOpen(false);
    };

    const handleBulkRemoveApproval = async function () {
        const confirmed = await confirmDialog(
            `Remove approval from ${selectedSpecs.length} ${selectedSpecs.length === 1 ? 'entry' : 'entries'}?`,
            'Remove approval'
        );
        if (!confirmed) {
            return;
        }
        updateSelected(function (spec) {
            return { ...spec, approved: '' };
        });
        setOperationsOpen(false);
    };

    // Duplicate every selected entry in place, each inserted right after its own source - the bulk counterpart to the
    // single-card Duplicate button. Unlike duplicateAt, no single card to scroll to or focus, so the new entries are
    // left in review mode and the selection is cleared (it described the originals, not the copies).
    const handleBulkDuplicate = function () {
        const now = nowTimestamp();
        const next: Spec[] = [];
        for (const spec of specs) {
            next.push(spec);
            if (selectedIds.has(spec.id)) {
                next.push(cloneSpec(spec, now));
            }
        }
        onChange(next);
        setSelectedIds(new Set());
        setOperationsOpen(false);
    };

    const handleBulkDelete = async function () {
        const confirmed = await confirmDialog(
            `Remove ${selectedSpecs.length} ${selectedSpecs.length === 1 ? 'entry' : 'entries'}?`,
            'Remove'
        );
        if (!confirmed) {
            return;
        }
        onChange(specs.filter(function (spec) {
            return !selectedIds.has(spec.id);
        }));
        setSelectedIds(new Set());
        setOperationsOpen(false);
    };

    return (
        <div className={styles.specsEditor}>
            <div className={styles.scrollArea} onKeyDown={handleListKeyDown}>
                {specs.length > 0 && (showFilters || hasActiveFilter) &&
                <div className={styles.specFilter}>
                    {hasActiveFilter &&
                    <span className={cx(styles.filterCount, styles.muted)}>{shown.length} of {specs.length} shown</span>}
                    {hasActiveFilter &&
                    <button type="button" className={styles.selectLink} onClick={clearAllFilters}>Clear filters</button>}
                    {showFilters &&
                    <input
                        type="text"
                        id="entry-text-filter"
                        className={styles.textFilter}
                        placeholder="Filter text..."
                        aria-label="Filter entries by text"
                        value={textFilter}
                        onChange={function (changeEvent) {
                            setTextFilter(changeEvent.target.value);
                        }}
                    />}
                    {showFilters &&
                    <Select<Option, true>
                        classNamePrefix="rs"
                        isMulti
                        placeholder="Approval status"
                        aria-label="Filter entries by approval status"
                        options={FILTER_OPTIONS}
                        value={statusFilter}
                        onChange={function (options: MultiValue<Option>) {
                            onStatusFilterChange([...options]);
                        }}
                    />}
                    {showFilters &&
                    <Select<Option, true>
                        classNamePrefix="rs"
                        isMulti
                        placeholder="Entry type"
                        aria-label="Filter entries by type"
                        options={TYPE_FILTER_OPTIONS}
                        value={typeFilter}
                        onChange={function (options: MultiValue<Option>) {
                            onTypeFilterChange([...options]);
                        }}
                    />}
                    {showFilters &&
                    <Select<Option, true>
                        classNamePrefix="rs"
                        isMulti
                        placeholder="Labels"
                        aria-label="Filter entries by label"
                        options={labelFilterOptions}
                        value={labelFilter}
                        onChange={function (options: MultiValue<Option>) {
                            onLabelFilterChange([...options]);
                        }}
                    />}
                    {showFilters &&
                    <Select<Option, true>
                        classNamePrefix="rs"
                        isMulti
                        placeholder="Created by"
                        aria-label="Filter entries by creator"
                        options={CREATOR_FILTER_OPTIONS}
                        value={creatorFilter}
                        onChange={function (options: MultiValue<Option>) {
                            onCreatorFilterChange([...options]);
                        }}
                    />}
                </div>}

                {specs.length === 0 && <p className={styles.placeholder}>No entries yet. Add one to get started.</p>}

                {specs.length > 0 && shown.length === 0 &&
                <p className={styles.placeholder}>No entries match the selected filters.</p>}

                {shown.map(function ({ spec, index }) {
                    return (
                        <SpecCard
                            key={spec.id}
                            index={index}
                            mode={editingIds.has(spec.id) ? 'edit' : 'review'}
                            highlighted={spec.id === highlightId}
                            hasDuplicateTitle={duplicateTitles.has(spec.title) && spec.title !== ''}
                            value={spec}
                            schemas={schemas}
                            allTitles={allTitles}
                            takenTitles={takenTitles}
                            onOpenRelated={onOpenRelated}
                            onLabelClick={handleLabelClick}
                            onChange={function (next) {
                                updateAt(index, next);
                            }}
                            onToggleMode={function () {
                                toggleMode(spec.id);
                            }}
                            onRemove={function () {
                                removeAt(index);
                            }}
                            onDuplicate={function () {
                                duplicateAt(index);
                            }}
                            selected={selectedIds.has(spec.id)}
                            onToggleSelect={function () {
                                toggleSelect(spec.id);
                            }}
                            expanded={expandedIds.has(spec.id)}
                            onToggleExpand={function () {
                                toggleExpand(spec.id);
                            }}
                            reorderable={!hasActiveFilter}
                            canMoveUp={index > 0}
                            canMoveDown={index < specs.length - 1}
                            onMoveUp={function () {
                                onChange(moveEntry(specs, index, -1));
                            }}
                            onMoveDown={function () {
                                onChange(moveEntry(specs, index, 1));
                            }}
                        />
                    );
                })}
            </div>

            {specs.length > 0 &&
            <div className={styles.footer}>
                <span className={styles.footerCount}>
                    {selectedSpecs.length > 0 ?
                        `${selectedSpecs.length}/${specs.length} entries selected` :
                        `${specs.length} entries`}
                </span>
                <span
                    className={styles.approval}
                    title={`${approvedCount} of ${specs.length} entries approved (${approvedPercent}%)`}
                    aria-label={`${approvedCount} of ${specs.length} entries approved`}
                >
                    <span className={styles.approvalTrack}>
                        <span className={styles.approvalFill} style={{ width: `${approvedPercent}%` }} />
                    </span>
                    <span className={styles.approvalCount}>{approvedCount}/{specs.length}</span>
                </span>
                <button
                    type="button"
                    className={styles.selectLink}
                    disabled={allShownSelected}
                    onClick={selectAllShown}
                >
                    Select all
                </button>
                <button
                    type="button"
                    className={styles.selectLink}
                    disabled={selectedSpecs.length === 0}
                    onClick={deselectAll}
                >
                    Deselect all
                </button>
                <button
                    type="button"
                    className={styles.selectLink}
                    disabled={shown.length === 0}
                    onClick={toggleExpandAll}
                >
                    {allShownExpanded ? 'Collapse all' : 'Expand all'}
                </button>
                <div className={styles.actionsAnchor} ref={operationsReference}>
                    {operationsOpen &&
                    <div className={styles.actionsPopup}>
                        <p className={styles.actionsHeader}>{selectedSpecs.length} entries selected</p>
                        <button type="button" className={styles.operationButton} onClick={handleBulkApprove}><ClickIcon /><span>Approve</span></button>
                        <button type="button" className={styles.operationButton} onClick={handleBulkRemoveApproval}><CloseIcon /><span>Remove Approval</span></button>
                        <button type="button" className={styles.operationButton} onClick={handleBulkAddLabel}><LabelIcon /><span>Add label</span></button>
                        <button type="button" className={styles.operationButton} onClick={handleBulkRemoveLabel}><LabelIcon /><span>Remove label</span></button>
                        <button type="button" className={styles.operationButton} onClick={handleBulkCopyMarkdown}><CopyIcon /><span>Copy as Markdown</span></button>
                        <button type="button" className={styles.operationButton} onClick={handleBulkDuplicate}><PlusIcon /><span>Duplicate</span></button>
                        <button type="button" className={cx(styles.operationButton, styles.operationDanger)} onClick={handleBulkDelete}><RemoveIcon /><span>Delete</span></button>
                    </div>}
                    <button
                        type="button"
                        className={styles.actionsButton}
                        disabled={selectedSpecs.length === 0}
                        aria-expanded={operationsOpen}
                        onClick={function () {
                            setActionsOpen(false);
                            setOperationsOpen(function (previous) {
                                return !previous;
                            });
                        }}
                    >
                        Operations
                    </button>
                </div>
                <div className={styles.actionsAnchor} ref={actionsReference}>
                    {actionsOpen &&
                    <div className={styles.actionsPopup}>
                        <p className={styles.actionsHeader}>
                            {applicableSpecs.length} {applicableSpecs.length === 1 ? 'entry' : 'entries'} selected
                            {selectedSpecs.length > applicableSpecs.length &&
                            ` (${selectedSpecs.length - applicableSpecs.length} skipped - only specs batch; run tasks from their own cards)`}
                        </p>
                        <ul className={styles.actionsTitleList}>
                            {applicableSpecs.map(function (spec) {
                                return <li key={spec.id}>{spec.title || '(untitled)'}</li>;
                            })}
                        </ul>
                        <label className={formStyles.checkbox}>
                            <input
                                type="checkbox"
                                checked={useCustomInstructions}
                                onChange={function (changeEvent) {
                                    setUseCustomInstructions(changeEvent.target.checked);
                                }}
                            />
                            Provide custom one time instructions
                        </label>
                        <button
                            type="button"
                            className={styles.aiSubmit}
                            disabled={applicableSpecs.length === 0 || applyingBatch}
                            onClick={handleApplyChanges}
                        >
                            Apply changes
                        </button>
                    </div>}
                    <button
                        type="button"
                        className={styles.actionsButton}
                        disabled={applicableSpecs.length === 0}
                        aria-expanded={actionsOpen}
                        onClick={function () {
                            setOperationsOpen(false);
                            setActionsOpen(function (previous) {
                                return !previous;
                            });
                        }}
                    >
                        Actions
                    </button>
                </div>
                <div ref={speedDialReference} className={styles.speedDial}>
                    {menuOpen &&
                    <div className={styles.speedDialActions}>
                        <button
                            type="button"
                            className={styles.speedDialAction}
                            onClick={function () {
                                setMenuOpen(false);
                                setAiDialogOpen(true);
                            }}
                        >
                            <AiIcon /><span>Create entries with AI</span>
                        </button>
                        <button
                            type="button"
                            className={styles.speedDialAction}
                            onClick={function () {
                                setMenuOpen(false);
                                addSpec();
                            }}
                        >
                            <PlusIcon /><span>Create manually</span>
                        </button>
                    </div>}

                    <button
                        type="button"
                        className={styles.fab}
                        aria-label={menuOpen ? 'Close menu' : 'Add entry'}
                        aria-expanded={menuOpen}
                        onClick={function () {
                            setMenuOpen(function (previous) {
                                return !previous;
                            });
                        }}
                    >
                        <span className={cx(styles.fabIcon, { [styles.fabIconOpen]: menuOpen })}>
                            <PlusIcon />
                        </span>
                    </button>
                </div>
            </div>}

            {aiDialogOpen &&
            <CreateEntriesDialog
                onClose={function () {
                    setAiDialogOpen(false);
                }}
                defaultEntryType={defaultEntryType}
                onGenerate={onGenerate}
            />}
        </div>
    );
};

export { SpecsEditor };
export type { Option };
