// Shared inline-SVG glyphs. Each inherits its container's `color` via `currentColor`, so a button styling its text color
// styles the icon to match. Sizes are baked in per icon to match where each is used, keeping call sites attribute-free.

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

// Right-pointing chevron used by the truth card's expand toggle; CSS rotates it when the card is expanded.
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

export {
    AiIcon,
    ApproveIcon,
    ChevronIcon,
    ClickIcon,
    CloseIcon,
    CodeIcon,
    EditIcon,
    FilterIcon,
    ListIcon,
    MenuIcon,
    MoreIcon,
    PlusIcon,
    RefreshIcon,
    RemoveIcon,
    SaveIcon
};
