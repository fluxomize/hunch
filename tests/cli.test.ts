import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProgram } from '../src/cli/program.js';
import { DEFAULT_CONFIG } from '../src/config.js';

/**
 * The command tree is wired at construction time, and commander validates some of that wiring
 * eagerly. Building the program in a test is therefore worth more than it looks: it is what
 * catches an invalid combination of parsing options before it ships in a bin script.
 */
describe('hunch CLI', () => {
  let stderr: MockInstance<typeof process.stderr.write>;
  let emptyDir: string;
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    emptyDir = mkdtempSync(join(tmpdir(), 'hunch-cli-'));
  });

  afterEach(() => {
    stderr.mockRestore();
    rmSync(emptyDir, { recursive: true, force: true });
    // The commands here are expected to bail out; do not let that leak into the test run.
    process.exitCode = originalExitCode;
  });

  const parse = async (argv: string[]) => {
    const program = buildProgram();
    await program.parseAsync(['node', 'hunch', ...argv]);
    return program;
  };

  /**
   * Parses a command against an empty data directory.
   *
   * Without this, `run` finds whatever `.hunch` happens to sit in the working directory and
   * goes on to spawn Playwright, which makes a parsing test slow, and dependent on a directory
   * that is not supposed to matter to it.
   */
  const parseIsolated = async (argv: string[]) => {
    // The flag goes right after the subcommand name. Appending it would put it after any `--`,
    // where it would become an argument for Playwright instead of one for Hunch.
    const [command, ...rest] = argv;
    return parse([command as string, '--dir', emptyDir, ...rest]);
  };

  it('builds without throwing', () => {
    expect(() => buildProgram()).not.toThrow();
  });

  it('registers exactly the commands the MVP promises', () => {
    const names = buildProgram()
      .commands.map((command) => command.name())
      .sort();
    expect(names).toEqual(['run', 'train']);
  });

  it('reports the package version', () => {
    expect(buildProgram().version()).toMatch(/^\d+\.\d+\.\d+/);
  });

  /**
   * Reads the declared defaults without running the command.
   *
   * `train` now reads history and writes a model, so parsing it just to inspect its options
   * would let a unit test touch the repository's own `.hunch` directory.
   */
  const declaredDefaults = (commandName: string): Record<string, unknown> => {
    const command = buildProgram().commands.find((each) => each.name() === commandName);
    const defaults: Record<string, unknown> = {};
    for (const option of command?.options ?? []) {
      defaults[option.attributeName()] = option.defaultValue;
    }
    return defaults;
  };

  it('applies the documented defaults to train', () => {
    expect(declaredDefaults('train')).toMatchObject({
      minRuns: DEFAULT_CONFIG.minRunsToTrain,
    });
  });

  it('applies the documented defaults to run', () => {
    expect(declaredDefaults('run')).toMatchObject({
      ratio: DEFAULT_CONFIG.selectionRatio,
      minTests: DEFAULT_CONFIG.minTests,
      diff: 'HEAD~1..HEAD',
    });
  });

  it('describes where its data lives by default, since there is no literal default', () => {
    // The directory is resolved against the repository root at run time, so the help text has
    // to carry what the option object cannot.
    const run = buildProgram().commands.find((each) => each.name() === 'run');
    const dir = run?.options.find((option) => option.attributeName() === 'dir');
    expect(dir?.description).toContain('repository root');
  });

  it('parses its own flags on run', async () => {
    const program = await parseIsolated(['run', '--ratio', '0.5', '--min-tests', '2', '--dry-run']);
    const run = program.commands.find((command) => command.name() === 'run');
    expect(run?.opts()).toMatchObject({ ratio: 0.5, minTests: 2, dryRun: true });
  });

  it('keeps everything after -- for Playwright instead of parsing it', async () => {
    const program = await parseIsolated([
      'run',
      '--ratio',
      '0.5',
      '--',
      '--project=chromium',
      '--headed',
    ]);
    const run = program.commands.find((command) => command.name() === 'run');
    expect(run?.opts()).toMatchObject({ ratio: 0.5 });
    expect(run?.processedArgs[0]).toEqual(['--project=chromium', '--headed']);
  });

  it('accepts forwarded flags without treating them as excess arguments', async () => {
    // commander 13 started rejecting undeclared positional arguments. `hunch run` declares a
    // variadic argument precisely so that forwarding to Playwright stays legal.
    await parseIsolated(['run', '--', '--grep', '@smoke']);
    expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining('too many arguments'));
  });

  it('tells the user how to start collecting when there is no history to train on', async () => {
    await parseIsolated(['train']);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('No history at'));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('@fluxomize/hunch/reporter'));
    expect(process.exitCode).toBe(1);
  });

  it('sends the user to train when there is no model to run with', async () => {
    await parseIsolated(['run']);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('No model at'));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('hunch train'));
    expect(process.exitCode).toBe(1);
  });
});
