# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The Playwright reporter now records history. Every finished test is written to
  `.hunch/history.jsonl` at the root of the repository, with its result, duration, project,
  commit, branch and the files that changed in that commit.
- Retries are recorded as separate attempts, so a test that fails and then passes is visible
  as the flaky test it is.
- `outputDir`, `verbose` and `diffRange` options on the reporter.

### Fixed

- The package now ships a CommonJS build alongside the ESM one. Playwright resolves reporters
  through CommonJS, so `@fluxomize/hunch/reporter` could not be resolved at all before, which
  broke the first step of the setup in the README.
- Recorded test paths are relative to the top of the git working tree, matching the paths git
  reports for changed files. They were previously relative to Playwright's `rootDir`, which is
  the resolved `testDir`, so the two could not be compared with each other.

## [0.0.2] - 2026-09-17

### Fixed

- `hunch run` now declares the arguments it forwards to Playwright, so
  `hunch run -- --project=chromium` works and the forwarding is documented in
  `hunch run --help`. Previously the arguments were accepted by accident, and newer
  versions of the argument parser rejected them outright.

### Changed

- Releases are published with trusted publishing over OIDC. There is no longer a publish
  token stored anywhere, and provenance is generated automatically.

## [0.0.1] - 2026-09-17

### Added

- Initial project foundation: TypeScript build with tsup, vitest, ESLint, Prettier and CI.
- Public API surface declared as types, with no behaviour behind it yet.
- Package name reservation on npm.

[Unreleased]: https://github.com/fluxomize/hunch/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/fluxomize/hunch/releases/tag/v0.0.2
[0.0.1]: https://github.com/fluxomize/hunch/releases/tag/v0.0.1
