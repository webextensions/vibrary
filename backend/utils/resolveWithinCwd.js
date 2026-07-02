import path from 'node:path';

// Resolve a name/path against the served folder and confirm it stays inside it. The routers' name validation already
// blocks traversal; this is the shared defense-in-depth guard applied before any filesystem or git access. Returns the
// resolved absolute path, or null when the name escapes the folder.
const resolveWithinCwd = function (cwd, name) {
    const root = path.resolve(cwd);
    const target = path.resolve(root, name);
    return target === root || target.startsWith(root + path.sep) ? target : null;
};

export { resolveWithinCwd };
