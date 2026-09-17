# Basic example

The smallest possible Playwright project wired up to Hunch. Use it to check that the reporter
writes `.hunch/history.jsonl` the way you expect, without touching a real suite.

```bash
pnpm install
pnpm exec playwright test
cat .hunch/history.jsonl
```

The example depends on the local build of Hunch, so run `pnpm build` at the root of the
repository first.
