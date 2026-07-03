// helpmate's alertDialog only ever CLOSES the <dialog> it appended, never removes it; both promise-based dialogs
// (confirmDialog, promptDialog) must drop the node themselves or repeated dialogs accumulate dead <dialog> elements
// in the DOM. That teardown lives here so the helpmate quirk is encoded once.
const closeAndRemoveDialog = function (container: HTMLElement): void {
    const dialog = container.closest('dialog');
    dialog?.close();
    dialog?.remove();
};

export { closeAndRemoveDialog };
