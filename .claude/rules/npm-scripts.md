---
description: How to discover and run this project's npm scripts - package.json.ts is the documented catalogue
globs: ["package.json", "package.json.ts"]
---

# NPM Scripts

- Run tooling through the documented npm scripts (`node --run <script>`) rather than invoking
  binaries directly - the scripts encode the intended flags and order.
- The scripts are defined and documented (via inline comments) in
  [package.json.ts](../../package.json.ts), which generates `package.json` - read that file to
  learn what a script does before running or adding one. Do not maintain a separate script
  catalogue; the inline comments are the single home.
- When adding or changing a script, edit `package.json.ts`, document it with an inline comment
  there, and regenerate (see [git-workflow.md](./git-workflow.md)).
