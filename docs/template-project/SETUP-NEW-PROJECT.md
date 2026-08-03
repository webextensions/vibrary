# Setting Up a New Project from a Template Branch

The step-by-step commands for forking a new project from this repository's template family. The vision and
the branching tree live in [README.md](./README.md); what a `-flat` branch is and why forks start from one
is covered in [flat-branches.md](./flat-branches.md).

The commands below use placeholders - substitute your own values:

- `<your-username>` / `<your-project>` - the GitHub owner and repository name of the new project.
- `template-<project-type>-flat` - the `-flat` mirror of the `template-` branch that fits the new project;
  pick it from the branching tree in [README.md](./README.md) (for example `template-web-app-flat`).

## Create a fresh repository

Create a new repository for the project (for example on GitHub: `https://github.com/new`). It may or may
not come with an initial commit - both cases work:

- Recommended: initialize it with an initial commit (GitHub's "Add a README" option), on a default branch
  named `main`.
- A completely empty repository (no commits) also works - see the callout in the merge section below.

If the default branch is not named `main`, either rename it or create `main` before merging.

## Clone it

```sh
git clone git@github.com:<your-username>/<your-project>.git
cd <your-project>
```

## Add the template remote

Add this repository as a second remote named `template-origin` and fetch its branches:

```sh
git remote add template-origin git@github.com:webextensions/template-javascript-project.git
git fetch template-origin
```

The project's own repository stays `origin`; `template-origin` only serves template updates.

## Check out the template branch as local `template`

Create a local `template` branch from the chosen `template-<project-type>-flat` branch (the checkout also
sets up tracking against `template-origin`):

```sh
git checkout -b template template-origin/template-<project-type>-flat
```

The `template` branch stays local-only: it tracks `template-origin` and is never pushed to `origin` (which
carries `main` and the project's own branches). Each collaborator who runs template merges adds
`template-origin` and creates the local `template` branch themselves, with the two commands above.

## Merge `template` into `main`

```sh
git checkout main
git merge template --allow-unrelated-histories
```

The `--allow-unrelated-histories` flag is required because the merge crosses repositories: the fresh
repository's initial commit and the template branch share no common ancestor, so a plain `git merge`
refuses with `fatal: refusing to merge unrelated histories`. This is a one-time need - every future
template merge shares this first merge's history and never needs the flag again.

If the repository was created with no commits at all, there is nothing unrelated to reconcile - create
`main` and the merge simply fast-forwards, no flag needed:

```sh
git checkout -b main
git merge template
```

If the merge reports conflicts (typically on files both sides created, such as `README.md`), resolve them
per the ownership rules in [file-conventions.md](./file-conventions.md), then `git commit`.

## Push

```sh
git push -u origin main
```

Push `main` only - the `template` branch stays local (see above).

## Next steps

- Customize the project's identity (name, README, license, and so on) via the checklist at
  [../init/CUSTOMIZE/](../init/CUSTOMIZE/).
- Pull future template updates with `node --run template:merge-to-main` - see
  [template-sync.md](./template-sync.md).
