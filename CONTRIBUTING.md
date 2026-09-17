# Contributing to Hunch

Thanks for taking the time to look at this. Hunch is a young project and help of every size is
welcome, from a typo fix in the README to a whole feature.

If you have never contributed to an open source project before, this is a fine place to start.
Open an issue and say so, and we will find you something scoped.

## Ground rules

- Be kind. The [Code of Conduct](./CODE_OF_CONDUCT.md) applies everywhere in this project.
- Everything in this repository is written in English: code, comments, commits, issues and docs.
- Open an issue before starting anything large, so you do not build something we cannot merge.

## Getting set up

You need [Node.js](https://nodejs.org) 20 or newer and [pnpm](https://pnpm.io) 9 or newer.

```bash
git clone https://github.com/fluxomize/hunch.git
cd hunch
pnpm install
pnpm build
pnpm test
```

Useful scripts:

| Script | What it does |
| --- | --- |
| `pnpm build` | Bundles the package into `dist/` with tsup |
| `pnpm dev` | Same, in watch mode |
| `pnpm test` | Runs the vitest suite once |
| `pnpm test:watch` | Runs vitest in watch mode |
| `pnpm test:coverage` | Runs the suite with coverage |
| `pnpm typecheck` | Type checks without emitting |
| `pnpm lint` | Runs ESLint over `src` and `tests` |
| `pnpm format` | Rewrites `src` and `tests` with Prettier |

## Making a change

1. Fork the repository and create a branch off `main`.
2. Make your change, with tests. Any pull request that touches production code needs tests.
3. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` locally before pushing. CI runs the same
   three things, so this saves you a round trip.
4. Open a pull request and fill in the template.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). The prefix
decides how the change shows up in the changelog, so pick it honestly.

```
feat: add carbon estimate to the run summary
fix: handle a history file with a trailing blank line
docs: explain the energy formula in the README
chore: bump tsup to 8.3
refactor: extract the git diff parser
test: cover the empty-history case in train
```

Breaking changes get a `!` after the type, for example `feat!: rename the model file`.

## Versioning

Hunch follows [Semantic Versioning](https://semver.org) strictly. Before 1.0 the minor version
is where breaking changes go, and the changelog will call them out.

## Reporting bugs

Open an issue with the version of Hunch, the version of Playwright, your Node version, your OS,
what you expected and what happened. If you can, include the relevant lines from
`.hunch/history.jsonl`. Please strip anything private before pasting.

For anything with a security impact, do not open a public issue. See [SECURITY.md](./SECURITY.md).
