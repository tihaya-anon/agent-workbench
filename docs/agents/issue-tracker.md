# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- Create, read, update, comment on, label, and close issues using `gh issue`.
- Infer the repository from `git remote -v`.
- When a skill says "publish to the issue tracker", create a GitHub issue.
- When a skill says "fetch the relevant ticket", run `gh issue view <number> --comments`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding operations

`/wayfinder` uses a map issue with linked child issues. Child issues declare their
type, blockers, and ownership using GitHub labels, dependencies, and assignees.
Resolve a child by recording its answer, closing it, and linking the result from
the map issue.
