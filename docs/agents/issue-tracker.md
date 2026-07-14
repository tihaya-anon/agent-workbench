# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Repository scripts wrap the mutation
commands that need stable REST payloads; use the `gh` CLI directly for read-only operations
and other issue updates.

## Conventions

- Create issues with `pnpm github:issue:create -- --title <title> --body-file <path>`.
  Repeat `--label <name>` to apply labels. The script creates through the REST API, repairs
  labels omitted from the create response, and verifies the stored labels before succeeding.
  If label finalization fails after creation, the error reports the created issue URL; do not
  rerun issue creation as though no issue exists.
- Ensure a label exists with
  `pnpm github:label:ensure -- --name <name> --color <RRGGBB> --description <text>`.
  The script creates a missing label or updates an existing label to match, then verifies its
  name, color, and description. The color must omit the leading `#`.
- For an issue or label owned by a sibling repository, run the same scripts from this repository
  with `--repo <owner/repo>`, for example
  `pnpm github:issue:create -- --repo example/platform --title <title> --body-file <path>`.
  Do not bypass the scripts with direct `gh issue create` or label mutation commands.
- Read, update, comment on, and close issues using `gh issue`.
- Infer the default repository from `git remote -v`; use `--repo` when the owning repository is not
  the current checkout.
- When a skill says "publish to the issue tracker", write the issue body to a temporary
  Markdown file and invoke `github:issue:create`. Remove the temporary file after verification.
- When a skill says "fetch the relevant ticket", run `gh issue view <number> --comments`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding operations

`/wayfinder` uses a map issue with linked child issues. Child issues declare their
type, blockers, and ownership using GitHub labels, dependencies, and assignees.
Resolve a child by recording its answer, closing it, and linking the result from
the map issue.
