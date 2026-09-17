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
    expect(names).toEqual(['run', 'stats', 'train']);
  });

  it('reports the package version', () => {
    expect(buildProgram().version()).toMatch(/^\d+\.\d+\.\d+/);
  });

  /** The help text for one option of one command. */
  const describeOption = (commandName: string, attribute: string): string => {
    const command = buildProgram().commands.find((each) => each.name() === commandName);
    return (
      command?.options.find((option) => option.attributeName() === attribute)?.description ?? ''
    );
  };

  /**
   * Every setting that `hunch.config.json` can supply has no commander default, because a
   * default here would always beat the file. The help text has to carry what the option object
   * therefore cannot, or `--help` would show no default at all.
   */
  it.each([
    ['run', 'ratio', String(DEFAULT_CONFIG.selectionRatio)],
    ['run', 'minTests', String(DEFAULT_CONFIG.minTests)],
    ['run', 'watts', String(DEFAULT_CONFIG.sustainability.runnerWatts)],
    ['run', 'gridIntensity', String(DEFAULT_CONFIG.sustainability.gridIntensity)],
    ['train', 'minRuns', String(DEFAULT_CONFIG.minRunsToTrain)],
  ])('documents the default for %s --%s in its help text', (command, attribute, expected) => {
    expect(describeOption(command, attribute)).toContain(expected);
    const option = buildProgram()
      .commands.find((each) => each.name() === command)
      ?.options.find((each) => each.attributeName() === attribute);
    expect(option?.defaultValue).toBeUndefined();
  });

  it('keeps a commander default for settings the config file does not cover', () => {
    const run = buildProgram().commands.find((each) => each.name() === 'run');
    const diff = run?.options.find((option) => option.attributeName() === 'diff');
    expect(diff?.defaultValue).toBe('HEAD~1..HEAD');
  });

  it('describes where its data lives by default, since there is no literal default', () => {
    // The directory is resolved against the repository root at run time, so the help text has
    // to carry what the option object cannot.
    expect(describeOption('run', 'dir')).toContain('repository root');
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
