// Library entry point - the package's public API.
//
// This file is intentionally thin: the core logic lives in lib/ (see lib/template.js) and is simply
// re-exported here so consumers get it via `import { templateNpmPackage } from 'your-package-name';`.
// Widen the re-export as you add lib/ modules; consumers can also deep-import them via the
// "./lib/*" subpath in package.json.ts's "exports".

export { templateNpmPackage } from './lib/template.js';
