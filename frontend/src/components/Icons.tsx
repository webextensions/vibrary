// Shared inline-SVG glyphs. Each inherits its container's `color` via `currentColor`, so a button styling its text color
// styles the icon to match. Sizes are baked in per icon to match where each is used, keeping call sites attribute-free.

import type { ReactNode } from 'react';

import type { EntryType } from '../vibraryXml.ts';

// Sparkles glyph for the "Create with AI" action; a large four-point star with a small companion.
const AiIcon = function () {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
                d="M6 1.5l1.1 3.4L10.5 6 7.1 7.1 6 10.5 4.9 7.1 1.5 6l3.4-1.1z"
                fill="currentColor"
            />
            <path d="M12 9l.6 1.9L14.5 11.5l-1.9.6L12 14l-.6-1.9L9.5 11.5l1.9-.6z" fill="currentColor" />
        </svg>
    );
};

// Stacked-files glyph for the navigation rail's Explorer view.
const ExplorerIcon = function () {
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path
                d="M7 2.5h4.5L15 6v8a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z"
                stroke="currentColor"
                strokeWidth="1.4"
                fill="none"
                strokeLinejoin="round"
            />
            <path d="M11 2.5V6h4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
            <path
                d="M5 5.5H4a1 1 0 0 0-1 1V16a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-1"
                stroke="currentColor"
                strokeWidth="1.4"
                fill="none"
                strokeLinejoin="round"
            />
        </svg>
    );
};

// Magnifying-glass glyph for the navigation rail's Search view (larger than the entry-type ReviewIcon).
const SearchIcon = function () {
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M12.5 12.5l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
};

// Git-branch glyph for the navigation rail's Source Control view: two nodes on a line with a branch curving off.
const SourceControlIcon = function () {
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <g stroke="currentColor" strokeWidth="1.5" fill="none">
                <circle cx="6" cy="4.5" r="1.8" />
                <circle cx="6" cy="15.5" r="1.8" />
                <circle cx="14" cy="6.5" r="1.8" />
                <path d="M6 6.3v7.4" strokeLinecap="round" />
                <path d="M14 8.3c0 3-3 3.2-5 4" strokeLinecap="round" />
            </g>
        </svg>
    );
};

// Pulse/heartbeat glyph for the navigation rail's Activity monitor view.
const ActivityIcon = function () {
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path
                d="M2.5 10h3l2-5 3 10 2-5h5"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};

const MenuIcon = function () {
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
};

const ListIcon = function () {
    return (
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path
                d="M7 5h10M7 10h10M7 15h10M3 5h.01M3 10h.01M3 15h.01"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    );
};

const CodeIcon = function () {
    return (
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path
                d="M7 6l-4 4 4 4M13 6l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.8"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};

const SaveIcon = function () {
    return (
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path
                d="M4 3h9l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
                stroke="currentColor"
                strokeWidth="1.6"
                fill="none"
                strokeLinejoin="round"
            />
            <path d="M6 3v5h6V3M6 18v-5h8v5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
        </svg>
    );
};

// Right-pointing chevron used by the spec card's expand toggle; CSS rotates it when the card is expanded.
const ChevronIcon = function () {
    return (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
                d="M4 2l4 4-4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    );
};

const PlusIcon = function () {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
};

const RefreshIcon = function () {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
                d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
            />
            <path
                d="M13.5 2.5V5H11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    );
};

// Two upright bars for the "Pause queue" control (pause after the current job finishes).
const PauseIcon = function () {
    return (
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
};

// Right-pointing triangle for the "Resume queue" control.
const PlayIcon = function () {
    return (
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.5 3l8 5-8 5z" fill="currentColor" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
    );
};

// Filled square for the "Abort current job" control.
const StopIcon = function () {
    return (
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
        </svg>
    );
};

const RemoveIcon = function () {
    return (
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
                d="M3 4h10M6.5 4V2.5h3V4M4.5 4l.5 9h6l.5-9M6.5 6.5v4M9.5 6.5v4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    );
};

// Vertical three-dot "kebab" glyph for the per-row "More options" menu in the file tree.
const MoreIcon = function () {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="3" r="1.4" fill="currentColor" />
            <circle cx="8" cy="8" r="1.4" fill="currentColor" />
            <circle cx="8" cy="13" r="1.4" fill="currentColor" />
        </svg>
    );
};

const FilterIcon = function () {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
                d="M2 3.5h12L9.5 9v4l-3 1.5V9L2 3.5z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    );
};

const EditIcon = function () {
    return (
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
                d="M10.5 2.5l3 3M3 11l8-8 3 3-8 8H3z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    );
};

const ApproveIcon = function () {
    return (
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
                d="M3 8.5l3.5 3.5L13 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    );
};

// Pointing hand, used on the approve button when it invites a click ("Approve"/"Reapprove").
const ClickIcon = function () {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
                <path d="M22 14a8 8 0 0 1-8 8" />
                <path d="M18 11v-1a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
                <path d="M14 10V9a2 2 0 0 0-2-2 2 2 0 0 0-2 2v1" />
                <path d="M10 9.5V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v10" />
                <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </g>
        </svg>
    );
};

const CloseIcon = function () {
    return (
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
};

// Magnifying-glass glyph for the "review" entry type.
const ReviewIcon = function () {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
    );
};

// Clipboard glyph for the "spec" entry type.
const SpecIcon = function () {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 3h8v11H4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
            <path d="M6 3V2h4v1" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
            <path d="M6.5 7h3M6.5 10h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
    );
};

// Checked-box glyph for the "task" entry type.
const TaskIcon = function () {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <path
                d="M5 8l2 2 4-4.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    );
};

// Sparkle glyph for the "idea" entry type; kept distinct from the AI sparkles.
const IdeaIcon = function () {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
                d="M6 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
                fill="none"
            />
            <path
                d="M12.5 9.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    );
};

// Maps each entry kind to its glyph; falls back to the spec glyph for an unknown type.
const TYPE_ICONS: Record<EntryType, () => ReactNode> = {
    spec: SpecIcon,
    review: ReviewIcon,
    task: TaskIcon,
    idea: IdeaIcon
};

// Renders the glyph for an entry's `type`, used to mark each card with its kind.
const TypeIcon = function ({ type }: { type: EntryType }) {
    const Glyph = TYPE_ICONS[type] ?? SpecIcon;
    return <Glyph />;
};

// Gear glyph for the activity monitor's notification-settings popover toggle.
const SettingsIcon = function () {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="2.25" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path
                d="M8 1.5v1.7M8 12.8v1.7M1.5 8h1.7M12.8 8h1.7M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M12.6 3.4l-1.2 1.2M4.6 11.4l-1.2 1.2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
            />
        </svg>
    );
};

export {
    ActivityIcon,
    AiIcon,
    ApproveIcon,
    ChevronIcon,
    ClickIcon,
    CloseIcon,
    CodeIcon,
    EditIcon,
    ExplorerIcon,
    FilterIcon,
    ListIcon,
    MenuIcon,
    MoreIcon,
    PauseIcon,
    PlayIcon,
    PlusIcon,
    RefreshIcon,
    RemoveIcon,
    SaveIcon,
    SearchIcon,
    SettingsIcon,
    SourceControlIcon,
    SpecIcon,
    StopIcon,
    TaskIcon,
    TypeIcon
};
