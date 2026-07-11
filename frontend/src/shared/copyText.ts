// Legacy clipboard write, for contexts where the async Clipboard API is unavailable. Returns whether the copy actually
// happened. Two details are load-bearing on iOS Safari - the very browser this path exists for, since vibrary supports
// being opened over plain HTTP on a LAN address (a phone), where navigator.clipboard is undefined because it is a
// secure-context-only API:
// - iOS refuses to select a READONLY field, and ignores textarea.select() outright. Making the node contentEditable and
//   non-readonly, then selecting it with a Range AND setSelectionRange, is what actually lands the selection.
// - execCommand('copy') can return true having copied NOTHING when the selection is empty, which would show the caller
//   a "Copied" toast for a copy that never happened. So the selection is confirmed non-empty first.
const didCopyViaExecCommand = function (text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // Out of view and out of the layout, but still selectable.
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    textarea.contentEditable = 'true';
    textarea.readOnly = false;
    document.body.append(textarea);
    try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(textarea);
        selection?.removeAllRanges();
        selection?.addRange(range);
        textarea.setSelectionRange(0, text.length);
        if (text !== '' && textarea.selectionEnd === textarea.selectionStart) {
            return false; // the browser refused the selection, so a "success" here would be a lie
        }
        return document.execCommand('copy');
    } finally {
        textarea.remove();
    }
};

// Copy text to the clipboard, degrading to the legacy path where the async Clipboard API is unavailable (see above).
// Resolves true only when the copy actually happened, so callers can toast success or failure honestly.
const copyText = async function (text: string): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Permission denied or otherwise unavailable at call time - fall through to the legacy path.
        }
    }
    try {
        return didCopyViaExecCommand(text);
    } catch {
        return false;
    }
};

export { copyText };
