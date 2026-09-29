---
name: changelog-entry
description: Draft or update the CHANGELOG.md entry for the current release branch of tsp-toolkit, from this repo's committed and uncommitted changes plus the changelogs of any sub-projects whose version bumped in package.json. Use when asked to write, generate, update, or refresh a changelog entry or release notes for this branch or version.
---

# Changelog entry for tsp-toolkit

Produce one `## [X.Y.Z]` section for `CHANGELOG.md` covering everything on the current
branch: this repo's own commits and working-tree changes, plus the user-visible changes
that arrived via version bumps of the Tektronix sub-projects in `package.json`.

`CHANGELOG.md` is the authority on format. Read its top ~60 lines before drafting.
Ignore `CHANGELOG_*_GENERATED.md` files if present — those are one-off artifacts and do
**not** reflect the house style.

## 1. Establish the target version and merge target

```bash
node -p "require('./package.json').version"   # target version for the heading
git rev-parse --abbrev-ref HEAD
git merge-base origin/main HEAD                # BASE for every diff below
```

Fetch first if `origin/main` may be stale: `git fetch origin main --quiet`.

If `CHANGELOG.md` already has a `## [X.Y.Z]` section for this version, **update it in
place** — merge new bullets in and drop nothing. Do not add a second heading. Deduplicate
against the bullets already there (same change, different wording counts as a duplicate).

## 2. Collect this repo's changes

```bash
BASE=$(git merge-base origin/main HEAD)
git log --no-merges --format='%h %s' $BASE..HEAD
git diff --stat $BASE..HEAD
git status --porcelain                # uncommitted + untracked
git diff HEAD                         # unstaged + staged working-tree changes
```

Read the actual diff for any commit whose subject is vague (`fix info issue`,
`refactor`, ticket numbers only) — the subject line alone is not enough to write a
user-facing bullet. Untracked files matter too; `git diff HEAD` will not show them.

## 3. Collect sub-project changes

Sub-projects ship as `@tektronix/*` npm packages. Each has per-platform variants
(`-win32-x64`, `-linux-x64`, `-darwin-arm64`) and sometimes a `-types` package; they all
belong to one sub-project and bump together. Find what moved:

```bash
BASE=$(git merge-base origin/main HEAD)
git show $BASE:package.json > /tmp/pkg-base.json
node .agents/skills/changelog-entry/dep-diff.mjs /tmp/pkg-base.json package.json
```

The script prints each changed sub-project, its old and new version, its GitHub repo, and
whether the *base* version (the part before `-N`) changed. Package → repo → changelog
label:

| package family                    | repo / changelog label         |
| --------------------------------- | ------------------------------ |
| `kic-cli-*`                       | `tsp-toolkit-kic-cli`          |
| `script-gen-*`                    | `tsp-toolkit-script-gen`       |
| `trigger-flow-*`                  | `tsp-toolkit-trigger-flow`     |
| `tsp-language-interop-*`          | `tsp-toolkit-language-interop` |
| `keithley_instrument_libraries`   | `tsp-toolkit-webhelp-to-json`  |
| `web-help-documents`              | `tsp-toolkit-webhelp`          |

Sub-project sources are cloned as siblings of this repo (`../tsp-toolkit-kic-cli`, …).
Prefer those — `gh` is often unauthenticated here and several of these repos are not
publicly readable. Local clones go stale, so always fetch first:

```bash
cd ../<repo> && git fetch --tags --quiet
```

Then, per sub-project:

- **Base version changed** (e.g. `0.22.0` → `0.23.0-11`) and the repo has a
  `CHANGELOG.md`: read every section from the old base version (exclusive) up to the new
  base version (inclusive).

  ```bash
  cd ../tsp-toolkit-kic-cli && git show v0.23.0-11:CHANGELOG.md
  ```

  Reading at the tag, not on `main`, keeps unreleased entries out.

- **Build suffix only** (e.g. `0.23.0-8` → `0.23.0-11`), or the repo has no
  `CHANGELOG.md` (`tsp-toolkit-trigger-flow`, `tsp-toolkit-language-interop`): use the
  commit log between the two tags.

  ```bash
  cd ../tsp-toolkit-trigger-flow && git log --no-merges --oneline v0.2.1-12..v0.2.2-6
  ```

  Note that if the section for the new base version is already covered by the existing
  `CHANGELOG.md` entry for this version, only the delta is new.

- **New dependency**: the sub-project itself is the change — one `Added` bullet for the
  feature it brings, not a bullet per commit.

If a sibling clone is missing or a tag will not resolve after fetching, say so in your
summary and leave that sub-project's bullets out rather than guessing at them.

## 4. Write the entry

Format, as used by the `[1.5.2]` and `[1.5.1]` sections:

```markdown
## [X.Y.Z]

### Highlights
- \[Beta\] Name of the headline feature

### Added
- A change made in this repo
- **tsp-toolkit-kic-cli** - A change that came from a sub-project

### Changed
- ...

### Fixed
- ...

### Removed
- ...
```

Rules:

- Heading is `## [X.Y.Z]` — **no date**.
- Subsection order: `Highlights`, then `Added`, `Changed`, `Deprecated`, `Removed`,
  `Fixed`, `Security`. Omit any that are empty. (Older sections in the file vary in
  order; follow this one.)
- `Highlights` only for a genuinely headline-worthy feature; mark beta work as
  `\[Beta\]` with the backslashes, as existing entries do.
- Sub-project bullets are prefixed `- **<repo-name>** - `. Sections older than `[1.5.1]`
  use a `(**name**)` form — do not copy that.
- Bullets from this repo carry no prefix.
- One line per change, no nested bullets, no trailing period (some existing lines have
  one; new lines should not), no PR or issue numbers, no commit hashes.
- Write for a TSP Toolkit **user**, in terms of instruments, the extension UI, and
  commands — not in terms of files, functions, or tickets. "Fix issue where the
  instrument explorer showed a stale IDN string", not "Refactor `InstrumentProvider`".
- Leave out changes with no user-visible effect: CI and workflow edits, lint and
  formatting passes, test-only changes, version bumps themselves, `package-lock.json`
  churn, changelog edits, merge commits.
- Fold duplicates: several commits on one feature are one bullet.

## 5. Update the comparison links

The link definitions at the bottom of `CHANGELOG.md` are ordered newest-first. For a
version not yet listed, add its line and repoint `[Unreleased]`:

```markdown
[Unreleased]: https://github.com/tektronix/tsp-toolkit/compare/vX.Y.Z...HEAD
[X.Y.Z]: https://github.com/tektronix/tsp-toolkit/releases/tag/vX.Y.Z
```

## 6. Report

After editing `CHANGELOG.md`, tell the user:

- which commits/working-tree changes you deliberately left out, and why;
- which sub-projects bumped, and where each one's bullets came from (its changelog vs.
  its commit log);
- anything you could not verify — a vague commit, an unreachable sub-project tag, a
  change whose user-visible effect was unclear. Flag these for review rather than
  inventing a description.
