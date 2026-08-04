# Template Project

This document explains the git branching pattern used by this repository for the template/abstract projects. From these
`template-` branches, new projects/packages can be forked out.

Notes:
    * Branches with `template-` prefix can be directly used as a base template for a new project/package.
    * Branches with `abstract-` prefix are not directly usable as a base template for a new project/package. They are
      meant to be used as a base for creating further `template-` prefixed branches.

The recommended workflow for setting up a new project/package using a template from this repository is to:
    * Create a new repository for the new project/package
    * Clone that new repository into your local machine
    * Add this repository as a new git remote (`$ git remote add template-origin git@github.com:webextensions/template-javascript-project.git`)
    * Checkout the corresponding `template-` prefixed branch from this repository
    * Merge the `template-` prefixed branch (from this repository) into the corresponding branch of the new project/package

The step-by-step commands for that workflow are in [SETUP-NEW-PROJECT.md](./SETUP-NEW-PROJECT.md).

For pulling later template updates into an already-forked project, see [template-sync.md](./template-sync.md).

A fork that would rather start from a clean linear history can fork from a `-flat` mirror of a `template-` branch
instead, and keep merging updates as usual - see [flat-branches.md](./flat-branches.md).

## Vision

To maintain a family of ready-to-use JavaScript project templates as git branches, so that a new project can fork from
the closest-fitting template and keep receiving shared updates (code, tooling, config, conventions, etc.) by merging the
corresponding template branch back in - with minimal git conflicts and low maintenance overhead.

This document contains information that may not be directly applicable to the individual template/abstract project or
the actual project/package from where you are reading this document. But, it is described and maintained from the root
base branch (`abstract-javascript-project` branch) for the `template-javascript-project.git` repository, so that:
    * the vision for the git branching is clear
    * the folder structure and the contents are planned and maintained accordingly
    * the git merge conflicts are minimized when merging the template project(s) among themselves and into other projects

## Notes

* The following git branching tree is represented in top-to-down direction (rather than conventional bottom-to-top
  direction) to make it easier to understand the hierarchy of the template/abstract projects.
* The following git branching tree represents git branches which can be used as a template for a new project/package.
* When a project is forked out from a branch of this repository, that base branch can/should be regularly merged into
  that (forked out) project to receive the latest updates from the corresponding template project.
* Within this repository (`template-javascript-project.git`), the corresponding abstract/template base branches
  can/should be regularly merged into the other template/abstract branches to receive the latest updates from those base
  branches.

## Git Branching Tree

```
abstract-javascript-project
│
├── abstract-npm-package
│   Notes:
│       * Shared base for the npm-package templates below; fork projects from a
│         `template-npm-package-*` branch, not from this abstract branch.
│   │
│   └── template-npm-package-for-exports
│       Notes:
│           * ESM exports
│       │
│       └── template-npm-package-for-exports-cli
│           Notes:
│               * CLI ("bin" entry)
│           │
│           └── template-npm-package-for-exports-cli-tui
│               Notes:
│                   * TUI
│
└── abstract-frontend-build
    Notes:
        * Shared base for the frontend-build templates below; fork projects from a `template-`
          branch, not from this abstract branch.
        * Carries the config-driven Vite build (multi-bundle capable) with React + TypeScript
          under `frontend/`, stylelint, and a minimal Express server (opt-in HMR) under
          `backend/`.
    │
    └── abstract-ui-foundation
        Notes:
            * Carries the common frontend functionality shared by the templates below (UI elements, i18n, etc.)
        │
        ├── template-webextension
        │   Notes:
        │       * `template-webextension` has support for the following features which can be turned on/off with flags
        │         (and/or some manual customizations like adding/removing npm package dependencies):
        │           * WebExtension - React
        │           * WebExtension - React with Shadow DOM
        │       * We may need to create multiple templates for WebExtension if and when we get more use cases.
        │
        └── template-web-app
            Notes:
                * `template-web-app` has support for the following features which can be turned on/off with flags
                  (and/or some manual customizations like adding/removing npm package dependencies):
                    * Frontend build - React - app pages
                    * Frontend build - React - admin dashboard
                    * Backend
                        * Database
                            * User accounts

There are some more branches (which could not be easily represented in the above tree) which are:
    * template-npm-package-for-react (abstract-frontend-build + abstract-npm-package + "Code for the react package")
      Notes:
          * React component(s)
          * React hook(s)
    * template-npm-package-with-backend-and-frontend (template-npm-package-for-exports-cli + abstract-frontend-build +
      "Code for backend server")
    * template-widget (template-npm-package-for-react + "Code for widget")
      Notes:
          * `template-widget` has support for the following features which can be turned on/off with flags (and/or
            some manual customizations like adding/removing npm package dependencies):
              * Widget - Simple
              * Widget - React
              * Widget - React - with Shadow DOM
          * If for some reason, it is not possible to combine all these mentioned features, then we will split it into
            two or more branches providing those separate templates.
```

Every branch named in the tree above, alphabetically (some are still aspirational - see the notes in the tree):

* abstract-frontend-build
* abstract-javascript-project
* abstract-npm-package
* abstract-ui-foundation
* template-npm-package-for-exports
* template-npm-package-for-exports-cli
* template-npm-package-for-exports-cli-tui
* template-npm-package-for-react
* template-npm-package-with-backend-and-frontend
* template-web-app
* template-webextension
* template-widget

Keep this list in sync when the tree gains or loses a branch.

## File Conventions

See [file-conventions.md](./file-conventions.md) for how files are owned and shared across the template branches:
every file is a plain regular file - a small set of fork-owned files (`README.md` / `AGENTS.md` / `CLAUDE.md` /
the `docs/specs/todo/` TODO files / the `docs/init/CUSTOMIZE/` checklist / `package.json.ts` identity / `LICENSE`) is
expected to conflict when merging
template branches in (keep your side), and everything else is shared content that flows down the family by merge.

## PS

* In future, we may need to create more template projects (via more such branches) if and when we get more use cases.
* For now, we will continue with "template" branches which may cover a bit more than what a new limited project may
  require. We may/will add feature flags (and/or some manual customizations like adding/removing npm package
  dependencies) to the templates to work under limited scope if required by a new project.
