import { stripVTControlCharacters } from 'node:util';

// chalk and boxen are OPTIONAL dependencies, imported dynamically below. If they are not installed the
// dynamic import throws, the binding stays undefined, and logger falls back to plain text. We
// deliberately do NOT import these packages' types: logger's own type-checking must not depend on
// whether chalk / boxen (or their type declarations) are present. The minimal local shapes below cover
// only the surface we actually use.
type Colorize = (text: string) => string;

interface Chalk {
    [style: string]: Colorize | undefined;
    blue: Colorize;
    green: Colorize;
    red: Colorize;
    yellow: Colorize
}

type Boxen = (text: string, options?: unknown) => string;

let chalk: Chalk | undefined;
try {
    chalk = (await import('chalk')).default as unknown as Chalk;
} catch {
    // optional dependency - leave chalk undefined if it is not installed
}

let boxen: Boxen | undefined;
try {
    boxen = (await import('boxen')).default as unknown as Boxen;
} catch {
    // optional dependency - leave boxen undefined if it is not installed
}

const logger = {
    chalkProxy: function (fnName: string, msg: string): string {
        const style = chalk?.[fnName];
        if (style) {
            return style(msg);
        } else {
            return msg;
        }
    },
    stripAnsi: function (msg: string): string {
        return stripVTControlCharacters(msg);
    },
    boxen: function (msg: string, options?: unknown): string {
        if (boxen) {
            return boxen(msg, options);
        } else {
            return msg;
        }
    },
    log: function (msg: string): void {
        console.log(msg);
    },
    info: function (msg: string): void {
        if (chalk) {
            msg = chalk.blue(msg);
        }
        console.log(msg);
    },
    warn: function (msg: string): void {
        if (chalk) {
            msg = chalk.yellow(msg);
        }
        console.error(msg);
    },
    error: function (msg: string): void {
        if (chalk) {
            msg = chalk.red(msg);
        }
        console.error(msg);
    },
    success: function (msg: string): void {
        if (chalk) {
            msg = chalk.green(msg);
        }
        console.log(msg);
    }
};

export { logger };
