// Thin wrapper around node-notifier (a devDependency, used only by the `npm start` launcher scripts). If the module is
// not installed, desktop notifications are silently skipped so the scripts still work.
let nodeNotifier;
try {
    nodeNotifier = (await import('node-notifier')).default;
} catch {
    console.log('Could not load "node-notifier"; run "npm install" to enable desktop notifications.');
}

const notify = function (title, message) {
    if (nodeNotifier) {
        nodeNotifier.notify({ title, message: message || title });
    }
};

export { notify };
