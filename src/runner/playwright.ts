import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';

/**
 * Talking to the Playwright CLI.
 *
 * Playwright is invoked as `node <its cli.js>` rather than through `npx` or a `.bin` shim. That
 * resolves the same way on Linux, macOS and Windows, needs no shell, and cannot pick up a
 * different Playwright than the one the project actually depends on.
 */

/** Raised when the project does not have Playwright, or it cannot be run. */
export class PlaywrightNotFoundError extends Error {}

/** A test that exists in the suite right now, as opposed to one that exists in history. */
export interface DiscoveredTest {
  /** Matches the identifier the reporter writes, so history lines up with the current suite. */
  testId: string;
  /** Test file, relative to the repository root, with forward slashes. */
  file: string;
  /** Describe titles followed by the test title, which is what `--grep` matches against. */
  titlePath: string[];
}

/** Finds the Playwright CLI that this project depends on. */
export function resolvePlaywrightCli(cwd: string): string {
  try {
    return createRequire(resolve(cwd) + '/').resolve('@playwright/test/cli');
  } catch {
    throw new PlaywrightNotFoundError(
      'Could not find @playwright/test in this project. Install it, or run hunch from the ' +
        'directory that has it.',
    );
  }
}

/** Options shared by listing and running. */
export interface PlaywrightOptions {
  /** Directory to run Playwright from. */
  cwd: string;
  /** Top of the git working tree, which every recorded path is relative to. */
  repoRoot: string;
  /** Extra arguments to hand to Playwright untouched. */
  extraArgs?: string[];
}

/**
 * Lists every test in the suite without running any of them.
 *
 * Listing rather than reading history is what lets Hunch notice a test that has never run
 * before. Those tests get run unconditionally; a tool that silently skipped everything added
 * this week would be worse than useless.
 */
export function listTests(options: PlaywrightOptions): DiscoveredTest[] {
  const cli = resolvePlaywrightCli(options.cwd);
  let raw: string;
  try {
    raw = execFileSync(
      process.execPath,
      [cli, 'test', '--list', '--reporter=json', ...(options.extraArgs ?? [])],
      { cwd: options.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64e6 },
    );
  } catch (error) {
    throw new PlaywrightNotFoundError(
      `Playwright could not list the tests: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return parseTestList(raw, options.repoRoot);
}

/** Shape of the `--list --reporter=json` payload, limited to the parts Hunch reads. */
interface ListedSuite {
  title?: string;
  file?: string;
  specs?: { title?: string }[];
  suites?: ListedSuite[];
}

/**
 * Turns Playwright's listing into test identifiers that match the recorded history.
 *
 * Playwright reports file paths relative to its own `rootDir`, which is the resolved `testDir`.
 * History is relative to the top of the git working tree. Converting here is what keeps a test
 * recognisable as the same test in both places.
 */
export function parseTestList(raw: string, repoRoot: string): DiscoveredTest[] {
  const payload = JSON.parse(raw) as { config?: { rootDir?: string }; suites?: ListedSuite[] };
  const rootDir = payload.config?.rootDir ?? repoRoot;
  const tests: DiscoveredTest[] = [];

  const walk = (suite: ListedSuite, file: string, describes: string[]): void => {
    for (const spec of suite.specs ?? []) {
      if (!spec.title) {
        continue;
      }
      const titlePath = [...describes, spec.title];
      tests.push({
        testId: [file, ...titlePath].join(' > '),
        file,
        titlePath,
      });
    }
    for (const child of suite.suites ?? []) {
      walk(child, file, child.title ? [...describes, child.title] : describes);
    }
  };

  for (const fileSuite of payload.suites ?? []) {
    // The outermost suite is the file itself, so its title is a path rather than a describe.
    const file = toRepoRelative(fileSuite.file ?? fileSuite.title ?? '', rootDir, repoRoot);
    walk(fileSuite, file, []);
  }

  return tests;
}

/** Rebases a path Playwright reported onto the repository root, in posix form. */
function toRepoRelative(path: string, rootDir: string, repoRoot: string): string {
  const absolute = isAbsolute(path) ? path : resolve(rootDir, path);
  return relative(repoRoot, absolute).split('\\').join('/');
}

/** Options for actually running a selection of tests. */
export interface RunOptions extends PlaywrightOptions {
  /** Tests to run. */
  tests: DiscoveredTest[];
}

/**
 * Runs the selected tests and returns Playwright's exit code.
 *
 * The selection is expressed two ways at once, because Playwright has no flag for "run exactly
 * these tests": the files are passed as positional filters, and the titles as a `--grep`
 * alternation anchored at the end. A test in another file that happens to share a title will
 * also run. That is over-selection, which costs a little time; under-selection would cost a
 * missed failure, so the ambiguity is resolved in that direction deliberately.
 */
export function runTests(options: RunOptions): number {
  const cli = resolvePlaywrightCli(options.cwd);
  const files = [...new Set(options.tests.map((test) => test.file))];
  const args = [
    'test',
    ...files.map((file) => toCliPath(file, options)),
    ...grepArgs(options.tests),
  ];

  const result = spawnSync(process.execPath, [cli, ...args, ...(options.extraArgs ?? [])], {
    cwd: options.cwd,
    stdio: 'inherit',
  });

  /* c8 ignore next 3 */
  if (result.error) {
    throw new PlaywrightNotFoundError(`Playwright could not be started: ${result.error.message}`);
  }
  return result.status ?? 1;
}

/**
 * The `--grep` pattern, or nothing when it would be too long to pass safely.
 *
 * Windows caps a command line at around 32,000 characters. Rather than have a large suite fail
 * with an unreadable spawn error, an oversized pattern is dropped and the run falls back to
 * file level selection, which still skips whole files and is merely less precise.
 */
const MAX_GREP_LENGTH = 8000;

function grepArgs(tests: DiscoveredTest[]): string[] {
  const pattern = tests.map((test) => escapeRegex(test.titlePath.join(' ')) + '$').join('|');
  return pattern.length > MAX_GREP_LENGTH ? [] : ['--grep', pattern];
}

/** True when the title filter had to be dropped, so the caller can say so. */
export function grepWasDropped(tests: DiscoveredTest[]): boolean {
  return grepArgs(tests).length === 0;
}

/** Playwright matches positional filters against paths relative to its own working directory. */
function toCliPath(repoRelativeFile: string, options: PlaywrightOptions): string {
  const absolute = resolve(options.repoRoot, repoRelativeFile);
  return relative(resolve(options.cwd), absolute).split('\\').join('/');
}

/** Escapes a string so it matches itself when used inside a regular expression. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
