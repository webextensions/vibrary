# Customizing a new branch or project

> One-time customization checklist for a new branch or project forked from the
> `template-javascript-project` family

This folder holds the one-time steps to run right after creating a new branch or project in the
[template-javascript-project](https://github.com/webextensions/template-javascript-project) family
(vision and branching tree: [docs/template-project/README.md](../../template-project/README.md)).
Each step lives in its own `CUSTOMIZE-*.md` file.

Each step's "Applies to:" line names the flow(s) it belongs to - skip the steps that do not apply
to yours:

- **New layer branch** - creating the next template or abstract branch of this repository (forked
  from a base/abstract branch).
- **New project** - customizing a real project forked from a template branch.

The checklist is cumulative and shared by the whole family: a new branch edits these files in
place - and adds new `CUSTOMIZE-*.md` siblings for steps its layer introduces (merge conflicts
here are expected and accepted - keep your side; see
[docs/template-project/file-conventions.md](../../template-project/file-conventions.md)).

## The steps

Work through them in this order:

- [CUSTOMIZE-todo-backlog.md](./CUSTOMIZE-todo-backlog.md) - set up the fork's own task list.
- [CUSTOMIZE-package-json.md](./CUSTOMIZE-package-json.md) - project identity, publish fields,
  engines, and dependencies in `package.json.ts`.
- [CUSTOMIZE-source-code-and-tests.md](./CUSTOMIZE-source-code-and-tests.md) - add your layout and
  real tests.
- [CUSTOMIZE-readme.md](./CUSTOMIZE-readme.md) - title, badges, and intro of `README.md`.
- [CUSTOMIZE-license.md](./CUSTOMIZE-license.md) - license / copyright holder.
- [CUSTOMIZE-community-health-files.md](./CUSTOMIZE-community-health-files.md) - `SECURITY.md` and
  `CONTRIBUTING.md`.
- [CUSTOMIZE-ai-and-agent-documentation.md](./CUSTOMIZE-ai-and-agent-documentation.md) -
  `AGENTS.md`, `CLAUDE.md`, and the `.claude/` configuration.
- [CUSTOMIZE-template-link.md](./CUSTOMIZE-template-link.md) - keep the template remote/branch for
  future updates.
