// Produce a title not already present in `existing` by appending -2, -3, ... to `base`. `base` is assumed to be the
// colliding title (so it is itself in `existing`); the first free "<base>-<n>" (n starting at 2) is returned. Kept
// hyphenated so the result still satisfies the title-format rule (base is already normalized). Falls back to base if
// it is somehow not taken.
const uniqueTitle = function (base: string, existing: string[]): string {
    const taken = new Set(existing);
    if (!taken.has(base)) {
        return base;
    }
    let suffix = 2;
    while (taken.has(`${base}-${suffix}`)) {
        suffix += 1;
    }
    return `${base}-${suffix}`;
};

export { uniqueTitle };
