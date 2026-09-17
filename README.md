<h1 align="center">Hunch</h1>

<p align="center">
  <strong>Playwright's smart hunch about which tests to run.</strong><br>
  Predictive test selection with machine learning, to cut your CI time and your carbon footprint.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@fluxomize/hunch"><img alt="npm" src="https://img.shields.io/npm/v/@fluxomize/hunch.svg"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg">
  <img alt="status" src="https://img.shields.io/badge/status-pre--alpha-orange.svg">
</p>

> **Status: pre-alpha.** The reporter records history and `hunch train` builds a model from it.
> `hunch run`, which turns predictions into a shorter test run, is still being built. Collecting
> history now is worth doing regardless: training needs weeks of it before it can predict
> anything.

## The problem

Your Playwright suite takes twenty minutes. You changed one CSS file. You still pay for all
twenty minutes, on every push, on every pull request, and so does the planet: every minute of
runner time is energy burned and CO₂ emitted.

Playwright already ships two good answers to part of this. `--last-failed` reruns what broke
last time. `--only-changed` runs what statically depends on the files you touched. Both are
useful, and Hunch is built to sit next to them rather than replace them.

But static dependency analysis only knows what *could* break. It does not know what *usually*
breaks. A change to `styles/main.css` might statically touch 40 UI tests while, historically,
only 3 of those 40 ever fail because of it.

## The idea

Hunch learns that difference from your own history.

1. **Collect.** A Playwright reporter records every test run, with its result, its duration and
   the files that changed in that commit, into a plain `.hunch/history.jsonl` in your repo.
2. **Train.** `hunch train` builds a baseline logistic regression model that predicts which
   tests are likely to fail for a given set of changed files.
3. **Run.** `hunch run` scores your suite against the current diff and runs only the tests
   worth running.
4. **Report.** After each run you get the time, energy (kWh) and carbon (gCO₂eq) you saved.

No Python. No server. No dashboard. No network calls. Everything runs locally, on your machine
or on your runner, and the data stays in your repository where you can read it.

## Quickstart

```bash
pnpm add -D @fluxomize/hunch
```

Add the reporter to your Playwright config so Hunch starts learning from your normal runs:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [['list'], ['@fluxomize/hunch/reporter']],
});
```

That is the whole setup. Run your suite the way you always do, and Hunch writes one line per
test per run into `.hunch/history.jsonl` at the root of your repository:

```json
{
  "testId": "tests/login.spec.ts > login > signs in",
  "file": "tests/login.spec.ts",
  "project": "chromium",
  "duration": 1243,
  "status": "passed",
  "timestamp": "2026-09-17T05:11:47.998Z",
  "commitSha": "390f1c2e66160f62d0a8d75d56da77be15d38dde",
  "changedFiles": ["src/login.ts"],
  "branch": "main",
  "retry": 0
}
```

Commit that file. It is the training data, it is meant to be shared with your team, and it is
plain text you can read, grep and diff.

Once you have around 20 to 30 runs of history, train a model from it:

```bash
npx hunch train
```

It tells you what it learned and how well, measured on runs it never saw:

```
Trained on 40 runs, 195 examples.

Quality at the usual 50% cutoff, measured on the most recent runs the model never saw.
  precision  100.0%  of the tests it flags, this many really fail
  recall      53.3%  of the tests that fail, this many get flagged
  F1          69.6%

Weights, largest influence first:
  -5.751  recentFailureRate
  +5.032  coChangeFailureRate
  +2.739  changesetSize
  ...
```

The model lands in `.hunch/model.json` as a readable list of feature names and weights. If it
ever makes a choice you disagree with, that file is where you go to find out why.

`hunch run`, which uses the model to run a subset of your suite, is the next thing being built.

### What the model looks at

Twelve features, all of them plain numbers you can inspect:

| Feature | What it captures |
| --- | --- |
| `failureRate`, `recentFailureRate` | How often this test fails, overall and lately |
| `observationConfidence` | How much history stands behind those rates |
| `failureRecency` | How long ago it last failed |
| `flakyRate` | How often it fails and then passes on retry |
| `durationWeight` | How slow it is |
| `coChangeFailureRate`, `coChangeSupport` | **How often it failed when these exact files changed before** |
| `ownFileChanged` | Whether the test's own file is in the diff |
| `pathAffinity` | How close the test sits to the changed files in the tree |
| `changesetSize` | How big the change is |

The two in bold are the reason this project exists. They are what a dependency graph cannot
tell you: not what *could* break, but what *has* broken, for this change, before.

### Known limitations

The baseline model has no regularisation. With a dozen features and the twenty to thirty runs
this is designed for, features that measure similar things can end up with large opposing
weights. The model still ranks tests sensibly, but do not read a single weight as if it were
an independent finding. Quality is always reported on held out runs, so the numbers you see
are not the model grading its own homework.

### Reporter options

| Option | Default | What it does |
| --- | --- | --- |
| `outputDir` | `.hunch` | Where to write, relative to the repository root |
| `verbose` | `false` | Print what the reporter is doing. Off by default, so normal runs stay quiet |
| `diffRange` | `HEAD~1..HEAD` | Git revision range used to work out which files changed |

On CI you usually want `diffRange` to cover the whole pull request rather than the last commit:

```typescript
reporter: [['list'], ['@fluxomize/hunch/reporter', { diffRange: 'origin/main...HEAD' }]];
```

The reporter is built so it can never fail your suite. Outside a git repository, or if anything
it touches goes wrong, it prints a warning and records nothing.

## Why energy matters here

Test selection is usually sold as a speed feature. Speed is the side effect. The thing being
saved is compute, and compute is electricity.

Hunch reports its savings in kWh and gCO₂eq using a deliberately simple and fully documented
estimate, with configurable runner power draw and grid emission factor. It is an estimate, not
a measurement, and the docs will always say so.

## Design constraints

Things Hunch will deliberately not do in v1:

- Support test frameworks other than Playwright.
- Ship a dashboard, a web UI, a backend or an API.
- Require Python, at runtime or at build time.
- Use deep learning, code embeddings or anything you cannot inspect in a JSON file.

## Contributing

Contributions are welcome, including from people who have never contributed to open source
before. Start with [CONTRIBUTING.md](./CONTRIBUTING.md), and please read our
[Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[Apache 2.0](./LICENSE) © [Fluxomize](https://github.com/fluxomize)
