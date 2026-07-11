// Copy text to the clipboard, degrading gracefully where the async Clipboard API is unavailable. navigator.clipboard
// is a secure-context-only API, so it is undefined on a plain-HTTP LAN origin - exactly the phone case vibrary
// supports (see the crypto guards in vibraryXmlCore.js for the same constraint). The fallback drives the legacy
// hidden-textarea + execCommand('copy') path, which still works over plain HTTP. Resolves true on success.
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
        const textarea = document.createElement('textarea');
        textarea.value = text;
        // Keep it out of view and out of the layout, but still focusable/selectable for execCommand.
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.opacity = '0';
        textarea.setAttribute('readonly', '');
        document.body.append(textarea);
        textarea.select();
        // execCommand is deprecated but is the only clipboard write available in a non-secure context.
        const succeeded = document.execCommand('copy');
        textarea.remove();
        return succeeded;
    } catch {
        return false;
    }
};

export { copyText };
