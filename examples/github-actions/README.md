# Hunch on GitHub Actions

Two workflows, because Hunch needs two different things from CI.

| File | When | What it does |
| --- | --- | --- |
| [`collect.yml`](./collect.yml) | push to `main` | Runs every test, retrains, commits the history |
| [`pull-request.yml`](./pull-request.yml) | pull request | Runs only the tests the model picks |

Copy them into `.github/workflows/` and rename them to taste.

## The two things people get wrong

**`fetch-depth: 0`.** GitHub checks out a single commit by default. Hunch works out what changed
by asking git, and a clone with no history has nothing to compare against, so every run records
an empty change set and the model learns nothing. Both workflows set it.

**`--diff origin/main...HEAD` on pull requests.** The default compares against the previous
commit, which on a pull request is whatever you pushed last, not the whole branch. Three dots,
not two: it compares against the point where your branch diverged.

## Start by watching, not trusting

For the first month, run Hunch's selection alongside your full suite and compare. Both example
workflows show how. Trust it once you have seen it not miss anything, not because a README told
you to.
