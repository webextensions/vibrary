// One-time, per-clone bootstrap for the truth-XML diff driver. git will not let a repo commit the command a diff driver
// runs (cloning would execute it), so the command lives in the committed .gitconfig fragment and each clone only needs
// to include that fragment. This wires `include.path = ../.gitconfig` into the local .git/config so `.gitattributes`'
// `diff=truths-canon` resolves to `node scripts/canonicalize-truths.js`.
//
// Run automatically via the `prepare` npm script. Guarded to a real checkout of this repo: when the package is
// installed as a dependency from the registry there is no .git here, so this is a no-op.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Relative to .git/config, so this resolves to the repo-root .gitconfig fragment.
const includeValue = '../.gitconfig';

const main = function () {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

    if (!existsSync(path.join(repoRoot, '.git'))) {
        return;
    }

    const git = function (arguments_) {
        return execFileSync('git', arguments_, { cwd: repoRoot, encoding: 'utf8' });
    };

    try {
        const existing = git(['config', '--local', '--get-all', 'include.path']);
        if (existing.split('\n').includes(includeValue)) {
            return;
        }
    } catch {
        // `--get-all` exits non-zero when include.path is unset; that just means we still need to add it.
    }

    git(['config', '--local', '--add', 'include.path', includeValue]);
    console.log(`Wired git diff for truth XML files via include.path ${includeValue}.`);
};

main();
