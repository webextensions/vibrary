import cx from 'classnames';
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';
import { toast } from 'react-toastify';

import { useActivityQueueActions } from '../activity/activityQueue.ts';
import { useSettingsState } from '../settings/settingsContext.ts';
import { announce } from '../shared/announcer.ts';
import { MenuPanel } from '../shared/MenuPanel.tsx';
import { useDismissablePopup } from '../shared/useDismissablePopup.ts';
import { useEscapeToClear } from '../shared/useEscapeToClear.ts';
import { applySpecs, type Backlinks, type BacklinkSource } from '../api.ts';
import { confirmDialog } from '../shared/confirmDialog.ts';
import { copyText } from '../shared/copyText.ts';
import { promptDialog } from '../shared/promptDialog.ts';
import { type SchemaMap } from './loadVibraryFile.ts';
import { promptForCustomInstructions } from './customInstructions.ts';
import { moveEntry } from './moveEntry.ts';
import { reinsertEntries } from './reinsertEntries.ts';
import { countReplaceable, replaceInEntries } from './replaceInEntries.ts';
import { labelOptions } from './labelOptions.ts';
import { restoreEntries } from './restoreEntries.ts';
import { useRatings } from '../rankings/useRatings.ts';
import { withPlan } from './planNotes.ts';
import { specToMarkdown } from './specMarkdown.ts';
import { uniqueTitle } from './uniqueTitle.ts';
import { approvalState, type ApprovalState, countApprovedSpecs, emptySpec, ENTRY_TYPES, type EntryType, hashContent, nowTimestamp, randomId, type Spec } from '../xml/vibraryXml.ts';

import { AiIcon, ClickIcon, CloseIcon, CopyIcon, EditIcon, ExplorerIcon, LabelIcon, PlusIcon, RemoveIcon, TypeIcon } from '../shared/Icons.tsx';
import { ChangeTypeDialog } from './ChangeTypeDialog.tsx';
import { CreateEntriesDialog } from './CreateEntriesDialog.tsx';
import { MoveEntriesDialog } from './MoveEntriesDialog.tsx';
import { FindReplaceDialog } from './FindReplaceDialog.tsx';
import { SpecCard } from './SpecCard.tsx';
import { SORT_OPTIONS, type SortMode } from './sortMode.ts';

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
    // The folder's saved label vocabulary (from the workspace summary); merged with this file's live labels for the
    // label input's suggestions (see labelOptions.ts).
    folderLabels: string[];
    // Titles used in OTHER files in the folder, so a card can flag a title that collides across files (not just
    // within this one) - relatesTo references resolve by exact title folder-wide.
    crossFileTitles: Set<string>;
    // Folder-wide reverse-reference map (saved state) backing each card's "Referenced by" section; the editor folds
    // this file's LIVE references over it so a just-added relation shows without a save.
    backlinks: Backlinks;
    // This file's path, to drop the open file's stale saved backlinks in favor of its live ones (see backlinksFor).
    currentFilePath: string | null;
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
    // Navigate to the entry a clicked "Relates to" chip points at (which may live in a different file). `fromTitle` is
    // the entry the chip was clicked from, recorded so a Back control can return there.
    onOpenRelated: (title: string, fromTitle: string) => void;
    // Navigate to a "Referenced by" source entry by its exact file AND title - unlike onOpenRelated, which resolves a
    // bare title folder-wide, this lands on the right file even when the source title is duplicated across files.
    // `fromTitle` is the entry the chip was clicked from (for Back).
    onOpenBacklink: (file: string, title: string, fromTitle: string) => void;
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
    onCreatorFilterChange: (next: Option[]) => void;
    // The free-text filter, owned by App like the four dropdowns so the toolbar Filter button's active-dot reflects it
    // too and it persists across tab switches with the rest.
    textFilter: string;
    onTextFilterChange: (next: string) => void;
    // The entry sort order, owned by App like the filters above: a fresh editor mounts per tab (keyed by path), so a
    // locally-held sort would reset to file order on every tab switch - lifting it keeps the chosen sort with the rest.
    sortMode: SortMode;
    onSortModeChange: (next: SortMode) => void;
    // Vibrary files other than this one, for the bulk "Move to file" destination picker.
    otherFiles: string[];
    // Whether the open file has unsaved edits - the move reads the saved version, so the dialog says to save first
    // rather than letting the user pick a destination and only then be refused.
    sourceDirty: boolean;
    // Move the entries at `indexes` (positions in this file) into `targetName`; App runs it on the server and reloads
    // both files, returning an outcome the dialog surfaces (a failure keeps the dialog open with the reason).
    onMoveEntries: (indexes: number[], targetName: string) => Promise<{ ok: boolean; message?: string }>;
    // Render each entry's content as Markdown in review mode (the toolbar's Markdown toggle, owned by App so it holds
    // across tab switches).
    renderMarkdown: boolean;
    onRenderMarkdownChange: (isEnabled: boolean) => void
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

// Success toast with an Undo affordance, shared by every lossy in-place operation (single remove, bulk delete,
// broken-reference cleanup, find & replace, bulk type change). The 8s window - longer than default - lives here
// because the toast carries the only recovery path; the onUndo callback must restore into the LIVE list via
// specsReference (see reinsertEntries/restoreEntries at the call sites) so edits made while the toast is up survive.
const showUndoToast = function (message: string, onUndo: () => void) {
    toast.success(function ({ closeToast }) {
        return (
            <span className={styles.undoToast}>
                {message}
                <button
                    type="button"
                    className={styles.undoButton}
                    onClick={function () {
                        onUndo();
                        closeToast();
                    }}
                >
                    Undo
                </button>
            </span>
        );
    }, { autoClose: 8000 });
};

// View-only orderings for the entry list. 'file' is the on-disk order (the default, and the only one in which the
// manual up/down reorder makes sense - so reorder is disabled under any other). The rest are derived, non-destructive
// sorts that never touch the saved order.

const SpecsEditor = function (
    { defaultEntryType, specs, schemas, allTitles, folderLabels, crossFileTitles, backlinks, currentFilePath, highlightQuery, highlightMatchIndex, highlightExactTitle, onChange, onGenerate, onOpenRelated, onOpenBacklink, showFilters, statusFilter, onStatusFilterChange, typeFilter, onTypeFilterChange, labelFilter, onLabelFilterChange, creatorFilter, onCreatorFilterChange, textFilter, onTextFilterChange, sortMode, onSortModeChange, otherFiles, sourceDirty, onMoveEntries, renderMarkdown, onRenderMarkdownChange }:
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

    const { enqueue } = useActivityQueueActions();
    // Saved prompt templates, offered as the insert select on the batch Apply's custom-instructions prompt.
    const { promptTemplates } = useSettingsState();
    // Elo ratings from the Rankings view's recorded matches, for the card badges and the rating sort; empty (and
    // both features dormant) until the folder has recorded results.
    const ratings = useRatings();

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
        // Match the SAME fields the backend search does - title, content, notes AND labels (searchVibrary's
        // SEARCH_FIELDS plus its labels pass) - so this staleness re-check validates a labels-only hit instead of
        // rejecting it and falling back to the wrong entry (or none), which silently broke the jump for such results.
        const matchesNeedle = function (spec: Spec) {
            return `${spec.title}\n${spec.content}\n${spec.notes}\n${spec.labels.join(' ')}`.toLowerCase().includes(needle);
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
            // Open the target's extra fields so a match in the notes (or another collapsed field) is actually visible,
            // not hidden behind the disclosure - the counterpart to the card un-clamping its content on the same jump.
            // It persists (unlike the 2s ring) so the reader can study the entry; Collapse all or the chevron re-hides.
            setExpandedIds(function (previous) { return new Set(previous).add(highlightMatchId); });
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
    const actionsPopupReference = useRef<HTMLDivElement>(null);

    // The "Operations" popup above the footer: bulk approve / remove-approval / delete over the selected entries.
    const [operationsOpen, setOperationsOpen] = useState(false);
    const operationsReference = useRef<HTMLDivElement>(null);
    // Find & replace across the selected entries; SpecsEditor owns whether the dialog is open (its form state lives in
    // the dialog, which is mounted only while open).
    const [findReplaceOpen, setFindReplaceOpen] = useState(false);
    // Bulk "Change type" over the selected entries; like Find & replace, only the open/closed flag lives here.
    const [changeTypeOpen, setChangeTypeOpen] = useState(false);
    // Bulk "Move to file" over the selected entries; the destination picker and the move run in the dialog.
    const [moveOpen, setMoveOpen] = useState(false);

    // The latest specs, read by the bulk-delete Undo toast so its restore re-inserts into the CURRENT list, not the
    // render-time snapshot the click handler closed over - an edit the user makes to another entry while the toast is
    // still up is then preserved rather than clobbered (the data-loss trap a whole-snapshot restore would fall into).
    const specsReference = useRef(specs);
    useEffect(function () {
        specsReference.current = specs;
    }, [specs]);

    // The "+" button expands into a speed-dial menu offering manual vs AI entry creation; the AI choice opens
    // CreateEntriesDialog, which owns its own form state.
    const [menuOpen, setMenuOpen] = useState(false);
    const [aiDialogOpen, setAiDialogOpen] = useState(false);
    const speedDialReference = useRef<HTMLDivElement>(null);

    // While the speed-dial menu / Actions popup / Operations popup is open, dismiss it on an outside press or Escape.
    // The menu popups get their focus handling from MenuPanel; the Actions popup is a small form, so move focus into it
    // when it opens (its content sits BEFORE its trigger in the DOM, so Tab alone would skip it) and hand focus back to
    // the trigger on close - unless the custom-instructions prompt it launches has already claimed focus.
    useDismissablePopup(menuOpen, function () { setMenuOpen(false); }, speedDialReference);
    useDismissablePopup(actionsOpen, function () { setActionsOpen(false); }, actionsReference);
    useDismissablePopup(operationsOpen, function () { setOperationsOpen(false); }, operationsReference);
    useEffect(function () {
        if (!actionsOpen) {
            return undefined;
        }
        const previouslyFocused = document.activeElement;
        const popup = actionsPopupReference.current;
        popup?.querySelector<HTMLElement>('input, button')?.focus();
        return function () {
            if (popup !== null && popup.contains(document.activeElement) && previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
                previouslyFocused.focus();
            }
        };
    }, [actionsOpen]);

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

    // Fold a Plan first run's drafted plan into its entry's notes. Minutes pass between queueing a plan and its
    // result, so the entry is addressed by ID against the LIVE specs (specsReference above, the same ref the
    // bulk-delete Undo reads for the same reason), never a click-time snapshot - and an entry removed in the
    // meantime makes this a silent no-op (the plan still sits in the activity's result view). Stamped AI: the agent
    // authored the notes change.
    const appendPlanToEntry = function (id: string, plan: string) {
        const current = specsReference.current;
        if (current.every(function (spec) { return spec.id !== id; })) {
            return;
        }
        onChange(current.map(function (spec) {
            return spec.id === id ? { ...spec, notes: withPlan(spec.notes, plan), updated: nowTimestamp(), updatedBy: 'AI' as const } : spec;
        }));
    };

    // Insert a confirmed split's parts right after their source entry: fresh unapproved entries of the source's own
    // type, each relating back to it (so the provenance survives even if the original is later trimmed away), AI as
    // creator. Addressed by id against the live specs like appendPlanToEntry, since the preview dialog may sit open
    // while the user edits elsewhere.
    const insertSplitParts = function (id: string, parts: { title: string; content: string; notes: string }[]) {
        const current = specsReference.current;
        const sourceIndex = current.findIndex(function (spec) { return spec.id === id; });
        if (sourceIndex === -1) {
            return;
        }
        const source = current[sourceIndex];
        const created = parts.map(function (part) {
            return {
                ...emptySpec(source.type),
                title: part.title,
                content: part.content,
                contentHash: hashContent(part.content),
                notes: part.notes,
                relatesTo: source.title === '' ? [] : [source.title],
                createdBy: 'AI' as const
            };
        });
        onChange([...current.slice(0, sourceIndex + 1), ...created, ...current.slice(sourceIndex + 1)]);
        announce(`Inserted ${created.length} split ${created.length === 1 ? 'entry' : 'entries'}`);
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
        const removed = specs[index];
        onChange(specs.filter(function (_spec, position) {
            return position !== index;
        }));
        if (removed === undefined) {
            return;
        }
        // The single-card counterpart of the bulk-delete Undo: the card's Remove button already confirms, but a confirm
        // only guards intent - this gives an actual recovery path. reinsertEntries puts the entry back at its original
        // position in the LIVE list, so an edit to another entry while the toast is up is preserved (see reinsertEntries).
        showUndoToast('Removed 1 entry', function () {
            onChange(reinsertEntries(specsReference.current, [{ index, spec: removed }]));
        });
    };

    // Every title a "Make unique" fix (and a Duplicate) must avoid: the saved cross-file titles PLUS this file's live,
    // possibly-unsaved ones. allTitles alone comes from the server's last-saved summary, so it cannot see two entries
    // the user just typed the same title into - exactly the case the fix exists for.
    const takenTitles = useMemo(function () {
        return [...allTitles, ...specs.map(function (spec) { return spec.title; })];
    }, [allTitles, specs]);

    // The label input's suggestion list: the folder's saved vocabulary merged with this file's LIVE labels - the same
    // live-over-saved treatment takenTitles gives titles, and the fix for label drift at the moment it is free (a user
    // typing "auth" sees that it exists instead of coining "authentication").
    const labelSuggestions = useMemo(function () {
        return labelOptions(folderLabels, specs);
    }, [folderLabels, specs]);

    // This file's LIVE reverse-reference map (target title -> the entries here pointing at it), so a relation the user
    // just added or removed shows in "Referenced by" immediately, without a save. Mirrors how crossFileTitles and the
    // broken-references badge treat the open file as live while other files stay on the saved summary. The source id is
    // kept so a card can drop itself (a self-reference is not a backlink) precisely, even under a duplicated title.
    const liveBacklinks = useMemo(function () {
        const map = new Map<string, { id: string; file: string; title: string }[]>();
        for (const spec of specs) {
            // Skip an untitled source: it has no chip label and cannot be navigated to, so it would only render a blank,
            // dead "Referenced by" entry (matches the backend map, which excludes untitled sources for the same reason).
            if (spec.title !== '') {
                for (const target of spec.relatesTo) {
                    const sources = map.get(target) ?? [];
                    sources.push({ id: spec.id, file: currentFilePath ?? '', title: spec.title });
                    map.set(target, sources);
                }
            }
        }
        return map;
    }, [specs, currentFilePath]);

    // The entries that reference `spec`: this file's live references to it (minus itself) plus the saved summary's
    // references from OTHER files. An untitled entry can be referenced by nobody (references resolve by title).
    const backlinksFor = function (spec: Spec): BacklinkSource[] {
        if (spec.title === '') {
            return [];
        }
        // Object.hasOwn, not a plain lookup: the map arrives as a JSON-parsed object (Object.prototype in its chain),
        // so backlinks['constructor'] would be the inherited method - a valid entry title must read as "no backlinks".
        const savedSources = Object.hasOwn(backlinks, spec.title) ? backlinks[spec.title] : [];
        const fromOtherFiles = savedSources.filter(function (source) { return source.file !== currentFilePath; });
        const fromThisFile = (liveBacklinks.get(spec.title) ?? [])
            .filter(function (source) { return source.id !== spec.id; })
            .map(function (source) { return { file: source.file, title: source.title }; });
        // Collapse duplicates (a repeated relatesTo, or a title shared by two same-file entries) to one chip per
        // file+title, which is also what makes the file+title a stable React key in the card.
        const seen = new Set<string>();
        const unique: BacklinkSource[] = [];
        for (const source of [...fromOtherFiles, ...fromThisFile]) {
            const key = `${source.file}::${source.title}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(source);
            }
        }
        return unique;
    };

    // Clone a source entry as a starting point for a similar one: same type/content/notes/labels/relatesTo, but a fresh
    // id and timestamps, an unapproved state (a copy has not itself been signed off), and a "-copy" title made unique
    // against `taken` up front (foo -> foo-copy, or foo-copy-2 if that already exists). Duplicate is meant for spinning
    // up variations, so duplicating a source twice - or one that already has a "-copy" - is routine; deriving a unique
    // title here keeps each copy from being born with a colliding title that instantly trips the duplicate warning.
    // Shared by the single-card Duplicate button and the bulk "Duplicate" operation below.
    const cloneSpec = function (source: Spec, now: string, taken: string[]): Spec {
        return {
            ...source,
            id: randomId(),
            title: source.title === '' ? '' : uniqueTitle(`${source.title}-copy`, taken),
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
        const duplicate = cloneSpec(specs[index], nowTimestamp(), takenTitles);
        onChange([...specs.slice(0, index + 1), duplicate, ...specs.slice(index + 1)]);
        setEditingIds(function (previous) {
            return new Set(previous).add(duplicate.id);
        });
        focusSpecContent(duplicate.id);
    };

    const addSpec = function () {
        // Seed the new entry with the file's own type family (specs.xml -> spec, tasks.xml -> task, ...), matching the
        // "Create with AI" dialog - rather than always a spec, which would drop a stray spec into a tasks/ideas file.
        // The type is editable afterward (the card's Type row), so this is just the sensible default.
        const spec = emptySpec(defaultEntryType);
        onChange([...specs, spec]);
        setEditingIds(function (previous) {
            return new Set(previous).add(spec.id); // a brand-new entry opens directly in edit mode
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
        onTextFilterChange('');
    };

    const textNeedle = textFilter.trim().toLowerCase();
    const isFilterMatch = function (spec: Spec): boolean {
        const isStatusMatch = selectedKeys.size === 0 || selectedKeys.has(approvalState(spec));
        const isTypeMatch = selectedTypeKeys.size === 0 || selectedTypeKeys.has(spec.type);
        const isLabelMatch = selectedLabelKeys.size === 0 || spec.labels.some(function (label) {
            return selectedLabelKeys.has(label);
        });
        const isCreatorMatch = selectedCreatorKeys.size === 0 || selectedCreatorKeys.has(spec.createdBy);
        // Labels join the text haystack so a typed term finds an entry by its label too, matching the global Search
        // (and complementing the exact-match label dropdown with a substring path).
        const isTextMatch = textNeedle === '' || `${spec.title}\n${spec.content}\n${spec.notes}\n${spec.labels.join(' ')}`.toLowerCase().includes(textNeedle);
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

    // The order the cards render in. 'file' keeps the map order above (the on-disk order); the others are view-only
    // re-orderings that leave each entry's original index untouched, so updateAt/removeAt and the selection still
    // address the right spec. Array#sort is stable, so ties keep their file order. Recency falls back to `created` for
    // an entry that was never updated. Rating sorts highest first with unrated entries after every rated one; in a
    // folder with no recorded matches the map is empty, every entry ties, and the sort is a stable no-op.
    const sortedShown = sortMode === 'file' ?
        shown :
        shown.toSorted(function (a, b) {
            if (sortMode === 'title') {
                return a.spec.title.localeCompare(b.spec.title);
            }
            if (sortMode === 'updated') {
                return (b.spec.updated || b.spec.created).localeCompare(a.spec.updated || a.spec.created);
            }
            if (sortMode === 'rating') {
                return (ratings.get(b.spec.title) ?? -Infinity) - (ratings.get(a.spec.title) ?? -Infinity);
            }
            return STATE_ORDER.indexOf(approvalState(a.spec)) - STATE_ORDER.indexOf(approvalState(b.spec));
        });

    // Speak the filter tally through the app's live region: the "X of Y shown" toolbar count is render-only, so
    // applying a filter is silent to a screen reader. Debounced so typing in the text filter announces the settled
    // count rather than one message per keystroke; nothing is announced while no filter constrains the list (the
    // full list is not news).
    const shownCount = shown.length;
    useEffect(function () {
        if (!hasActiveFilter) {
            return undefined;
        }
        const timer = setTimeout(function () {
            announce(`${shownCount} of ${specs.length} entries shown`);
        }, 400);
        return function () {
            clearTimeout(timer);
        };
    }, [hasActiveFilter, shownCount, specs.length]);

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
            const entered = await promptForCustomInstructions('Apply changes', promptTemplates);
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
        const isArrow = event.key === 'ArrowDown' || event.key === 'ArrowUp';
        const isStep = event.altKey && !event.shiftKey && isArrow;
        // Alt+Shift+Arrow MOVES the focused entry, the keyboard twin of a card's up/down buttons (which is why it is
        // gated on the same reorderable condition below). Distinct from Alt+Arrow, which merely steps focus between cards.
        const isMove = event.altKey && event.shiftKey && isArrow;
        const isJump = !event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 'Home' || event.key === 'End');
        // Bare "a" approves (or reapproves) the focused entry - a fast path for reviewing down a list with Alt+Arrow.
        // It only ever adds or refreshes a sign-off, never removes one (that needs the confirm the button enforces).
        const isApprove = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === 'a' || event.key === 'A');
        // Bare "e" toggles the focused entry between edit and review, the keyboard twin of its Edit button, so a
        // keyboard review can fix an entry in place. (To leave edit mode, focus the card - not one of its fields,
        // where "e" types normally - and press it again.)
        const isEdit = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === 'e' || event.key === 'E');
        // Bare "c" copies the focused entry to the clipboard as Markdown, the keyboard twin of its Copy button. (Not
        // Ctrl/Cmd+C, which stays the browser's copy of any selected text.)
        const isCopy = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === 'c' || event.key === 'C');
        // Bare "d" duplicates the focused entry, the keyboard twin of its Duplicate button - a fast path for authoring
        // variations. Like the button, the copy opens in edit mode with its content focused.
        const isDuplicate = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === 'd' || event.key === 'D');
        if (!isStep && !isMove && !isJump && !isApprove && !isEdit && !isCopy && !isDuplicate) {
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
        if (isApprove) {
            const activeCard = document.activeElement instanceof Element ? document.activeElement.closest('[data-spec-id]') : null;
            const cardId = activeCard instanceof HTMLElement ? activeCard.dataset.specId ?? '' : '';
            const index = specs.findIndex(function (spec) { return spec.id === cardId; });
            // No-op when no card is focused, or the entry is already approved against its current content (approving
            // again would only re-stamp its updated time). Otherwise approve/reapprove, mirroring the header button.
            if (index !== -1 && specs[index].approved !== hashContent(specs[index].content)) {
                event.preventDefault();
                updateAt(index, { ...specs[index], approved: hashContent(specs[index].content) });
                // The button turning green is the only feedback otherwise - silent to a screen reader, on the one
                // action (a bare keystroke sign-off) where misfiring matters most.
                announce(`Approved ${specs[index].title || 'the focused entry'}`);
            }
            return;
        }
        if (isEdit) {
            const activeCard = document.activeElement instanceof Element ? document.activeElement.closest('[data-spec-id]') : null;
            const cardId = activeCard instanceof HTMLElement ? activeCard.dataset.specId ?? '' : '';
            if (cardId !== '') {
                event.preventDefault();
                toggleMode(cardId);
            }
            return;
        }
        if (isCopy) {
            const activeCard = document.activeElement instanceof Element ? document.activeElement.closest('[data-spec-id]') : null;
            const cardId = activeCard instanceof HTMLElement ? activeCard.dataset.specId ?? '' : '';
            const spec = specs.find(function (candidate) { return candidate.id === cardId; });
            if (spec !== undefined) {
                event.preventDefault();
                void copyText(specToMarkdown(spec)).then(function (copied) {
                    if (copied) {
                        toast.success('Copied as Markdown');
                    } else {
                        toast.error('Could not copy to the clipboard');
                    }
                    return copied;
                });
            }
            return;
        }
        if (isDuplicate) {
            const activeCard = document.activeElement instanceof Element ? document.activeElement.closest('[data-spec-id]') : null;
            const cardId = activeCard instanceof HTMLElement ? activeCard.dataset.specId ?? '' : '';
            const index = specs.findIndex(function (candidate) { return candidate.id === cardId; });
            if (index !== -1) {
                event.preventDefault();
                duplicateAt(index);
            }
            return;
        }
        if (isMove) {
            // Only in true file order (no filter or sort), matching the up/down buttons: moving relative to a hidden or
            // re-ordered list would be ambiguous. moveEntry addresses the FULL list by file index.
            if (hasActiveFilter || sortMode !== 'file') {
                return;
            }
            const movingCard = document.activeElement instanceof Element ? document.activeElement.closest('[data-spec-id]') : null;
            const movingId = movingCard instanceof HTMLElement ? movingCard.dataset.specId ?? '' : '';
            const fromIndex = specs.findIndex(function (spec) { return spec.id === movingId; });
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            if (fromIndex === -1 || fromIndex + direction < 0 || fromIndex + direction >= specs.length) {
                return;
            }
            event.preventDefault();
            onChange(moveEntry(specs, fromIndex, direction));
            // The card keeps its id across the reorder, so refocus it at its new position once React has committed.
            requestAnimationFrame(function () {
                const movedCheckbox = document.querySelector(`[data-spec-id="${CSS.escape(movingId)}"] input[type="checkbox"]`);
                if (movedCheckbox instanceof HTMLElement) {
                    movedCheckbox.focus({ preventScroll: true });
                }
                document.getElementById(`spec-${movingId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            });
            return;
        }
        // Navigate in the order the cards are actually rendered (sortedShown), not file order, so Alt+Arrow steps and
        // Home/End land where the user sees the next/previous/first/last card under any active sort.
        const order = sortedShown.map(function ({ spec }) { return spec.id; });
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
            return { ...spec, approved: hashContent(spec.content) };
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

    // Drop every "Relates to" reference that resolves to no entry, across the selected entries - the bulk counterpart of
    // a single card's Remove-broken-references action, for cleaning up dead links after a rename. Unlike updateSelected,
    // only entries that actually had a broken reference are rewritten (and re-stamped); untouched entries keep their
    // exact state and timestamp. A no-op selection reports so rather than silently doing nothing.
    const handleBulkRemoveBrokenReferences = function () {
        const known = new Set(takenTitles);
        let removedCount = 0;
        const changes: { before: Spec; after: Spec }[] = [];
        const next = specs.map(function (spec) {
            if (!selectedIds.has(spec.id)) {
                return spec;
            }
            const kept = spec.relatesTo.filter(function (title) { return known.has(title); });
            if (kept.length === spec.relatesTo.length) {
                return spec;
            }
            removedCount += spec.relatesTo.length - kept.length;
            const after = { ...spec, relatesTo: kept, updated: nowTimestamp(), updatedBy: 'Human' as const };
            changes.push({ before: spec, after });
            return after;
        });
        setOperationsOpen(false);
        if (changes.length === 0) {
            toast.info('No broken references in the selected entries');
            return;
        }
        onChange(next);
        const touchedCount = changes.length;
        // The dropped refs were already dead links, but a user may have meant to CREATE those targets rather than cut
        // the links - so the same Undo the other bulk ops offer (restoring only entries untouched since) applies here.
        showUndoToast(`Removed ${removedCount} broken ${removedCount === 1 ? 'reference' : 'references'} from ${touchedCount} ${touchedCount === 1 ? 'entry' : 'entries'}`, function () {
            onChange(restoreEntries(specsReference.current, changes));
        });
    };

    // Apply the Find & replace dialog's terms across the selected entries' content and notes. replaceInEntries rewrites
    // (and re-stamps) only entries that actually contained the term; a toast reports the result.
    const handleReplaceAll = function (find: string, replace: string, isCaseSensitive: boolean) {
        const result = replaceInEntries(specs, find, replace, selectedIds, nowTimestamp(), isCaseSensitive);
        if (result.entriesChanged === 0) {
            return;
        }
        // Record each rewritten entry (replaceInEntries preserves order and returns the SAME object for entries it did
        // not touch, so a reference change pinpoints the changed ones) as a before/after pair - enough for the Undo to
        // revert only the entries the user has not edited since. See restoreEntries.
        const replaced = specs.flatMap(function (before, index) {
            const after = result.specs[index];
            return after === undefined || after === before ? [] : [{ before, after }];
        });
        onChange(result.specs);
        showUndoToast(`Replaced ${result.occurrences} ${result.occurrences === 1 ? 'occurrence' : 'occurrences'} across ${result.entriesChanged} ${result.entriesChanged === 1 ? 'entry' : 'entries'}`, function () {
            onChange(restoreEntries(specsReference.current, replaced));
        });
    };

    // Set the type of every selected entry to `type`, skipping (and never re-stamping) entries already of that type.
    // Types drive the Apply/Run actions, so reclassifying a batch is a real move; like the other lossy in-place bulk
    // ops it offers Undo, since the change discards each entry's original (possibly differing) type.
    const handleBulkChangeType = function (type: EntryType) {
        const changes: { before: Spec; after: Spec }[] = [];
        const next = specs.map(function (spec) {
            if (!selectedIds.has(spec.id) || spec.type === type) {
                return spec;
            }
            const after = { ...spec, type, updated: nowTimestamp(), updatedBy: 'Human' as const };
            changes.push({ before: spec, after });
            return after;
        });
        if (changes.length === 0) {
            toast.info(`All selected entries are already ${type}s`);
            return;
        }
        onChange(next);
        const count = changes.length;
        showUndoToast(`Changed ${count} ${count === 1 ? 'entry' : 'entries'} to ${type}`, function () {
            onChange(restoreEntries(specsReference.current, changes));
        });
    };

    // Move the selected entries into `targetName`. The server does the move and App reloads both files; pass the
    // entries' positions in THIS file (the source must be saved, so they match the on-disk order the server reads).
    // Clear the selection only on success (a failure keeps it, and the dialog, so the user can fix the cause).
    const handleMoveSelected = async function (targetName: string) {
        const indexes = specs.flatMap(function (spec, index) { return selectedIds.has(spec.id) ? [index] : []; });
        const outcome = await onMoveEntries(indexes, targetName);
        if (outcome.ok) {
            setSelectedIds(new Set());
        }
        return outcome;
    };

    // Duplicate every selected entry in place, each inserted right after its own source - the bulk counterpart to the
    // single-card Duplicate button. Unlike duplicateAt, no single card to scroll to or focus, so the new entries are
    // left in review mode and the selection is cleared (it described the originals, not the copies).
    const handleBulkDuplicate = function () {
        const now = nowTimestamp();
        // Grow the taken-titles set as copies are made, so several copies in one pass stay unique against each other too
        // (e.g. duplicating two entries that share a title yields foo-copy and foo-copy-2), not just against the file.
        const taken = new Set(takenTitles);
        const next: Spec[] = [];
        for (const spec of specs) {
            next.push(spec);
            if (selectedIds.has(spec.id)) {
                const copy = cloneSpec(spec, now, [...taken]);
                if (copy.title !== '') {
                    taken.add(copy.title);
                }
                next.push(copy);
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
        // Capture each removed entry with the position it held, so the Undo can put it back exactly where it was. The
        // restore re-inserts into the live specs ref rather than this snapshot, so it is surgical (see reinsertEntries).
        const removed = specs
            .map(function (spec, index) { return { index, spec }; })
            .filter(function (entry) { return selectedIds.has(entry.spec.id); });
        onChange(specs.filter(function (spec) {
            return !selectedIds.has(spec.id);
        }));
        setSelectedIds(new Set());
        setOperationsOpen(false);
        const removedCount = removed.length;
        showUndoToast(`Removed ${removedCount} ${removedCount === 1 ? 'entry' : 'entries'}`, function () {
            onChange(reinsertEntries(specsReference.current, removed));
        });
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
                            onTextFilterChange(changeEvent.target.value);
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

                {sortedShown.map(function ({ spec, index }) {
                    return (
                        <SpecCard
                            key={spec.id}
                            index={index}
                            mode={editingIds.has(spec.id) ? 'edit' : 'review'}
                            highlighted={spec.id === highlightId}
                            matchQuery={!highlightExactTitle && spec.id === highlightMatchId ? highlightQuery : undefined}
                            renderMarkdown={renderMarkdown}
                            hasDuplicateTitle={spec.title !== '' && (duplicateTitles.has(spec.title) || crossFileTitles.has(spec.title))}
                            value={spec}
                            currentFilePath={currentFilePath}
                            schemas={schemas}
                            rating={ratings.get(spec.title)}
                            onPlanReady={function (plan) {
                                appendPlanToEntry(spec.id, plan);
                            }}
                            onSplitParts={function (parts) {
                                insertSplitParts(spec.id, parts);
                            }}
                            allTitles={allTitles}
                            labelSuggestions={labelSuggestions}
                            takenTitles={takenTitles}
                            referencedBy={backlinksFor(spec)}
                            onOpenRelated={onOpenRelated}
                            onOpenBacklink={onOpenBacklink}
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
                            reorderable={!hasActiveFilter && sortMode === 'file'}
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
                <label className={styles.sortControl}>
                    <span>Sort</span>
                    <select
                        className={styles.sortSelect}
                        aria-label="Sort entries"
                        value={sortMode}
                        onChange={function (changeEvent) {
                            onSortModeChange(changeEvent.target.value as SortMode);
                        }}
                    >
                        {SORT_OPTIONS.map(function (option) {
                            return <option key={option.value} value={option.value}>{option.label}</option>;
                        })}
                    </select>
                </label>
                <label className={styles.sortControl} title="Render each entry's content as Markdown">
                    <input
                        type="checkbox"
                        checked={renderMarkdown}
                        onChange={function (changeEvent) { onRenderMarkdownChange(changeEvent.target.checked); }}
                    />
                    Markdown
                </label>
                <div className={styles.actionsAnchor} ref={operationsReference}>
                    {operationsOpen &&
                    <MenuPanel className={styles.actionsPopup}>
                        {/* role=presentation: a role=menu may only contain menuitems/groups/separators, so this count
                            line must not read as a menu child (MenuPanel already skips it when focusing the first item). */}
                        <p role="presentation" className={styles.actionsHeader}>{selectedSpecs.length} entries selected</p>
                        <button type="button" role="menuitem" className={styles.operationButton} onClick={handleBulkApprove}><ClickIcon /><span>Approve</span></button>
                        <button type="button" role="menuitem" className={styles.operationButton} onClick={handleBulkRemoveApproval}><CloseIcon /><span>Remove Approval</span></button>
                        <button type="button" role="menuitem" className={styles.operationButton} onClick={handleBulkAddLabel}><LabelIcon /><span>Add label</span></button>
                        <button type="button" role="menuitem" className={styles.operationButton} onClick={handleBulkRemoveLabel}><LabelIcon /><span>Remove label</span></button>
                        <button type="button" role="menuitem" className={styles.operationButton} onClick={handleBulkRemoveBrokenReferences}><CloseIcon /><span>Remove broken references</span></button>
                        <button type="button" role="menuitem" className={styles.operationButton} onClick={function () { setOperationsOpen(false); setChangeTypeOpen(true); }}><TypeIcon type="spec" /><span>Change type...</span></button>
                        <button type="button" role="menuitem" className={styles.operationButton} onClick={function () { setOperationsOpen(false); setMoveOpen(true); }}><ExplorerIcon /><span>Move to file...</span></button>
                        <button type="button" role="menuitem" className={styles.operationButton} onClick={function () { setOperationsOpen(false); setFindReplaceOpen(true); }}><EditIcon /><span>Find &amp; replace...</span></button>
                        <button type="button" role="menuitem" className={styles.operationButton} onClick={handleBulkCopyMarkdown}><CopyIcon /><span>Copy as Markdown</span></button>
                        <button type="button" role="menuitem" className={styles.operationButton} onClick={handleBulkDuplicate}><PlusIcon /><span>Duplicate</span></button>
                        <button type="button" role="menuitem" className={cx(styles.operationButton, styles.operationDanger)} onClick={handleBulkDelete}><RemoveIcon /><span>Delete</span></button>
                    </MenuPanel>}
                    <button
                        type="button"
                        className={styles.actionsButton}
                        disabled={selectedSpecs.length === 0}
                        aria-haspopup="menu"
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
                    <div ref={actionsPopupReference} className={styles.actionsPopup} role="group" aria-label="Apply changes to the selected specs">
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
                    <MenuPanel className={styles.speedDialActions}>
                        <button
                            type="button"
                            role="menuitem"
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
                            role="menuitem"
                            className={styles.speedDialAction}
                            onClick={function () {
                                setMenuOpen(false);
                                addSpec();
                            }}
                        >
                            <PlusIcon /><span>Create manually</span>
                        </button>
                    </MenuPanel>}

                    <button
                        type="button"
                        className={styles.fab}
                        aria-label={menuOpen ? 'Close menu' : 'Add entry'}
                        aria-haspopup="menu"
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

            {findReplaceOpen &&
            <FindReplaceDialog
                onClose={function () {
                    setFindReplaceOpen(false);
                }}
                selectedCount={selectedSpecs.length}
                countFor={function (find, isCaseSensitive) {
                    return countReplaceable(specs, find, selectedIds, isCaseSensitive);
                }}
                onReplace={handleReplaceAll}
            />}
            {changeTypeOpen &&
            <ChangeTypeDialog
                onClose={function () {
                    setChangeTypeOpen(false);
                }}
                selectedCount={selectedSpecs.length}
                onChangeType={handleBulkChangeType}
            />}
            {moveOpen &&
            <MoveEntriesDialog
                onClose={function () {
                    setMoveOpen(false);
                }}
                selectedCount={selectedSpecs.length}
                otherFiles={otherFiles}
                sourceDirty={sourceDirty}
                onMove={handleMoveSelected}
            />}
        </div>
    );
};

export { SpecsEditor };
export type { Option };
