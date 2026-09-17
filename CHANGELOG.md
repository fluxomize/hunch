# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `hunch run` completes the loop. It scores the current suite against the current diff, runs
  the tests worth running, and reports the time, energy and carbon that not running the rest
  is estimated to have saved.
- A test with no history is always run. Skipping a test because nothing is known about it would
  silently drop everything added this week.
- `hunch run --dry-run` prints the selection without running anything.
- Energy and carbon estimates, from a documented formula with configurable assumptions about
  runner power draw and grid carbon intensity. Reported at whatever scale keeps them legible,
  down to microwatt hours, because a real saving printed as `0.000000 kWh` reads as a bug.
- `hunch train` and `hunch run` find `.hunch` at the top of the git working tree, the same
  place the reporter writes it, rather than in whatever directory they happen to be run from.
  Running either from a workspace package used to report an empty history. An explicit
  `--dir` is still resolved against the working directory.
- `hunch train` builds a model from `.hunch/history.jsonl` and writes it to `.hunch/model.json`.
  It reports precision, recall, F1 and the confusion matrix, measured on the most recent runs
  the model never trained on, and lists every feature weight so the model can be argued with.
- Twelve features, including how often a test failed when these exact files changed before,
  which is the signal static dependency analysis cannot provide.
- Records carry a `runId`, so two runs of the same commit stay distinguishable. Grouping by
  commit alone hid exactly the case where flakiness shows up. Histories written before this
  field existed still group by commit.

### Notes

- The baseline regression has no regularisation, so features measuring similar things can take
  large opposing weights. Ranking is unaffected; reading one weight in isolation is not
  meaningful. This is documented in the README rather than hidden.

## [0.1.1] - 2026-09-17

### Fixed

- `hunch train` and `hunch run` said the release "only reserves the package name", which
  stopped being true in 0.1.0. Anyone who tried a command would reasonably have concluded the
  reporter did not work either. They now say what does work, and what collecting history is
  for while the model is being built.

### Changed

- Releases authenticate with npm over OIDC. No publish token is stored anywhere any more.

## [0.1.0] - 2026-09-17

The first release you can actually use. Hunch now collects the history that everything else
in the project will be built on.

### Added

- The Playwright reporter records history. Every finished test is written to
  `.hunch/history.jsonl` at the root of the repository, with its result, duration, project,
  commit, branch and the files that changed in that commit.
- Retries are recorded as separate attempts, so a test that fails and then passes is visible
  as the flaky test it is.
- `outputDir`, `verbose` and `diffRange` options on the reporter.
- A runnable example under `examples/basic`, wired to the reporter, covering a passing test,
  a failing one and a skipped one.

### Fixed

- The package ships a CommonJS build alongside the ESM one. Playwright resolves reporters
  through CommonJS, so `@fluxomize/hunch/reporter` could not be resolved at all before, which
  broke the first step of the setup in the README.
- Recorded test paths are relative to the top of the git working tree, matching the paths git
  reports for changed files. They were previously relative to Playwright's `rootDir`, which is
  the resolved `testDir`, so the two could not be compared with each other.
- `hunch run` declares the arguments it forwards to Playwright, so
  `hunch run -- --project=chromium` works and the forwarding is documented in
  `hunch run --help`. Previously the arguments were accepted by accident, and newer versions
  of the argument parser rejected them outright.

### Note on 0.0.2

Version 0.0.2 was tagged but never reached npm, so it is folded into this release rather than
listed separately. Nothing was ever installable under that number.

## [0.0.1] - 2026-09-17

### Added

- Initial project foundation: TypeScript build with tsup, vitest, ESLint, Prettier and CI.
- Public API surface declared as types, with no behaviour behind it yet.
- Package name reservation on npm.

[Unreleased]: https://github.com/fluxomize/hunch/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/fluxomize/hunch/releases/tag/v0.1.1
[0.1.0]: https://github.com/fluxomize/hunch/releases/tag/v0.1.0
[0.0.1]: https://github.com/fluxomize/hunch/releases/tag/v0.0.1
