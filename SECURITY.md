# Security Policy

## Supported versions

Hunch is pre-1.0. Only the latest published version receives security fixes.

| Version | Supported |
| --- | --- |
| latest `0.x` | yes |
| older `0.x` | no |

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Email **fluxomize@outlook.com** with a description of the issue, the version of Hunch you are
using, and steps to reproduce it. You can expect a first reply within 5 business days.

If the report is valid we will agree a disclosure timeline with you, fix the issue, publish a
patched version, and credit you in the release notes unless you prefer otherwise.

## Scope notes

Hunch runs entirely on your machine or your CI runner. It makes no network calls, ships no
server, and stores everything in your own repository under `.hunch/`. The areas most worth
scrutiny are therefore:

- Shell execution around `git` and the Playwright binary, and any path or argument that reaches
  a child process.
- Parsing of `.hunch/history.jsonl` and `.hunch/model.json`, which are files a repository can
  contain and a pull request can modify.
- Anything that could cause Hunch to write outside the project directory.
