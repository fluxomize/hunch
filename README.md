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

> **Status: pre-alpha.** The package name is reserved and the foundation is in place, but the
> reporter, the model and the runner are still being built. Nothing here is production ready yet.
> Watch the repo if you want to know when `0.1.0` lands.

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

> These commands will work once `0.1.0` is published. They are here so you know where this is going.

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

Run your suite normally for a few weeks. Once you have enough history (roughly 20 to 30 runs),
train the model and let Hunch pick:

```bash
npx hunch train
npx hunch run -- --project=chromium
```

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
