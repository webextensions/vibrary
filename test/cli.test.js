import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    describe,
    expect,
    it
} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '..', 'cli.js');

/** @param {string[]} args */
const runCli = function (args) {
    return spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
};

describe('cli', function () {
    it('should greet the world by default', function () {
        const { status, stdout } = runCli([]);
        expect(status).toBe(0);
        expect(stdout.trim()).toBe('Hello, world!');
    });

    it('should greet the provided name', function () {
        const { status, stdout } = runCli(['Ada']);
        expect(status).toBe(0);
        expect(stdout.trim()).toBe('Hello, Ada!');
    });

    it('should support the --uppercase option', function () {
        const { status, stdout } = runCli(['Ada', '--uppercase']);
        expect(status).toBe(0);
        expect(stdout.trim()).toBe('HELLO, ADA!');
    });

    it('should print the version with --version', function () {
        const { status, stdout } = runCli(['--version']);
        expect(status).toBe(0);
        expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    });
});
