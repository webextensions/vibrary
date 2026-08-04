// Shared character table for the non-keyboard-character tooling. The guard (block-characters.ts) imports
// DETECTORS, and the census report (detect-all-characters.ts) imports both DETECTORS and ALLOWED_CHARACTERS,
// so they agree on a single source of truth instead of duplicating the lists.
//
// This file deliberately contains the literal non-keyboard glyphs it describes, so the tooling exempts it
// from its scan - it is listed in exempted-files.ts (the shared exempt-files source of truth). Do not add
// a suppressions entry for it.

interface NonKeyboardCharacter {
    char: string;
    name: string;
    replacement: string | null
}

const DETECTORS: readonly NonKeyboardCharacter[] = [
    /* eslint-disable @stylistic/no-multi-spaces */
    { char: '–', replacement: '-',   name: 'en dash' },
    { char: '—', replacement: '-',   name: 'em dash' },
    { char: '…', replacement: '...', name: 'ellipsis' },
    { char: '‘', replacement: "'",   name: 'left single quote' },
    { char: '’', replacement: "'",   name: 'right single quote' },
    { char: '“', replacement: '"',   name: 'left double quote' },
    { char: '”', replacement: '"',   name: 'right double quote' },
    { char: '•', replacement: '*',   name: 'bullet' },
    { char: '→', replacement: '>',   name: 'rightwards arrow' },
    { char: '─', replacement: '-',   name: 'box-drawing light horizontal' },
    { char: '✓', replacement: '✔',   name: 'check mark' },
    { char: '✗', replacement: '✘',   name: 'ballot x' }
    /* eslint-enable @stylistic/no-multi-spaces */
];

// The heavy ticks the guard replaces TO (the `replacement` targets of the light check / ballot detectors
// above). Intentionally NOT in DETECTORS, so the guard never flags them; the census
// (detect-all-characters.ts) still treats them as known.
const ALLOWED_CHARACTERS: readonly NonKeyboardCharacter[] = [
    { char: '✔', replacement: null, name: 'heavy check mark' },
    { char: '✘', replacement: null, name: 'heavy ballot x' }
];

export { ALLOWED_CHARACTERS, DETECTORS };
