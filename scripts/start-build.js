import { parseArgs } from 'node:util';

import { build } from 'vite';

import { notify } from './notifier.js';

const { values } = parseArgs({ options: { watch: { type: 'boolean', default: false } } });

const configFile = 'frontend/vite.config.ts';

const announce = function () {
    console.log('Build complete');
    notify('truths', 'Build complete');
};

if (values.watch) {
    // In watch mode, build() resolves with a watcher; announce on each completed rebuild
    const watcher = await build({ configFile, build: { watch: {} } });
    watcher.on('event', function (watchEvent) {
        if (watchEvent.code === 'END') {
            announce();
        }
    });
} else {
    await build({ configFile });
    announce();
}
