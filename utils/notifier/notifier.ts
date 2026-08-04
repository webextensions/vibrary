import path from 'node:path';

let nodeNotifier;
try {
    nodeNotifier = (await import('node-notifier')).default;
} catch (err) {
    console.log(
        'Could not load module "node-notifier".' +
        '\nWe need to run "$ npm install node-notifier" to be able to see desktop notifications.' +
        '\n'
    );
}

const __dirname = import.meta.dirname;

let muteNotifications = false;

const notify = function (options) {
    if (!muteNotifications) {
        if (nodeNotifier) {
            nodeNotifier.notify(options);
        }
    }
};

const notifier = {
    info: function (title, message) {
        message ||= title;
        notify({
            title,
            message,
            icon: path.join(__dirname, 'icons', 'info.png')
        });
    },
    warn: function (title, message) {
        message ||= title;
        notify({
            title,
            message,
            icon: path.join(__dirname, 'icons', 'warn.png')
        });
    },
    error: function (title, message) {
        message ||= title;
        notify({
            title,
            message,
            icon: path.join(__dirname, 'icons', 'error.png')
        });
    },
    mute: function (flag) {
        muteNotifications = flag;
    }
};

export { notifier };
