import { execFileSync } from 'node:child_process';

/**
 * Thin wrappers around the git commands Hunch needs.
 *
 * Every call goes through `execFileSync` with an argument array rather than a shell string, so
 * branch names, paths and revision ranges can never be interpreted as shell syntax.
 */

/** Options shared by every git helper. */
export interface GitOptions {
  /** Directory to run git in. Defaults to the current working directory. */
  cwd?: string;
}

/**
 * Runs a git command and returns its trimmed stdout.
 *
 * @throws if git is missing, or exits non zero.
 */
function git(args: string[], options: GitOptions = {}): string {
  return execFileSync('git', args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Returns true when the directory is inside a git working tree. */
export function isGitRepository(options: GitOptions = {}): boolean {
  try {
    return git(['rev-parse', '--is-inside-work-tree'], options) === 'true';
  } catch {
    return false;
  }
}

/**
 * Absolute path to the top of the working tree, or an empty string outside a repository.
 *
 * Everything Hunch records is anchored here rather than at the current working directory or at
 * Playwright's own root. Git reports changed files relative to this directory, so test paths
 * have to be relative to it too, or the model would be comparing paths that do not share a
 * frame of reference.
 */
export function getRepositoryRoot(options: GitOptions = {}): string {
  try {
    return git(['rev-parse', '--show-toplevel'], options);
  } catch {
    return '';
  }
}

/** Full SHA of the current commit, or an empty string outside a repository. */
export function getCommitSha(options: GitOptions = {}): string {
  try {
    return git(['rev-parse', 'HEAD'], options);
  } catch {
    return '';
  }
}

/**
 * Name of the current branch.
 *
 * Returns an empty string on a detached HEAD, which is the normal state of a CI checkout, so
 * callers should treat the branch as optional context rather than a key.
 */
export function getBranch(options: GitOptions = {}): string {
  try {
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], options);
    return branch === 'HEAD' ? '' : branch;
  } catch {
    return '';
  }
}

/**
 * Files changed in the given revision range, relative to the repository root.
 *
 * The default range covers the current commit alone. On a shallow clone, or on the very first
 * commit of a repository, `HEAD~1` does not exist; in that case we fall back to listing every
 * file in the commit rather than failing the run, because a reporter must never break a test
 * suite.
 */
export function getChangedFiles(range = 'HEAD~1..HEAD', options: GitOptions = {}): string[] {
  try {
    return toLines(git(['diff', '--name-only', range], options));
  } catch {
    try {
      return toLines(git(['show', '--name-only', '--pretty=format:', 'HEAD'], options));
    } catch {
      return [];
    }
  }
}

/** Files currently modified in the working tree, staged or not, plus untracked files. */
export function getUncommittedFiles(options: GitOptions = {}): string[] {
  try {
    const tracked = toLines(git(['diff', '--name-only', 'HEAD'], options));
    const untracked = toLines(git(['ls-files', '--others', '--exclude-standard'], options));
    return [...new Set([...tracked, ...untracked])];
  } catch {
    return [];
  }
}

/** Splits git's newline separated output into a clean list, dropping blank lines. */
function toLines(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
