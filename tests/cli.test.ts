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
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderr.mockRestore();
    // The stub commands mark themselves as failed; do not let that leak into the test run.
    process.exitCode = originalExitCode;
  });

  const parse = async (argv: string[]) => {
    const program = buildProgram();
    await program.parseAsync(['node', 'hunch', ...argv]);
    return program;
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

  it('applies the documented defaults to train', async () => {
    const program = await parse(['train']);
    const train = program.commands.find((command) => command.name() === 'train');
    expect(train?.opts()).toMatchObject({
      dir: DEFAULT_CONFIG.outputDir,
      minRuns: DEFAULT_CONFIG.minRunsToTrain,
    });
  });

  it('applies the documented defaults to run', async () => {
    const program = await parse(['run']);
    const run = program.commands.find((command) => command.name() === 'run');
    expect(run?.opts()).toMatchObject({
      dir: DEFAULT_CONFIG.outputDir,
      ratio: DEFAULT_CONFIG.selectionRatio,
      minTests: DEFAULT_CONFIG.minTests,
      diff: 'HEAD~1..HEAD',
    });
  });

  it('parses its own flags on run', async () => {
    const program = await parse(['run', '--ratio', '0.5', '--min-tests', '2', '--dry-run']);
    const run = program.commands.find((command) => command.name() === 'run');
    expect(run?.opts()).toMatchObject({ ratio: 0.5, minTests: 2, dryRun: true });
  });

  it('keeps everything after -- for Playwright instead of parsing it', async () => {
    const program = await parse(['run', '--ratio', '0.5', '--', '--project=chromium', '--headed']);
    const run = program.commands.find((command) => command.name() === 'run');
    expect(run?.opts()).toMatchObject({ ratio: 0.5 });
    expect(run?.processedArgs[0]).toEqual(['--project=chromium', '--headed']);
  });

  it('accepts forwarded flags without treating them as excess arguments', async () => {
    // commander 13 started rejecting undeclared positional arguments. `hunch run` declares a
    // variadic argument precisely so that forwarding to Playwright stays legal.
    await parse(['run', '--', '--grep', '@smoke']);
    expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining('too many arguments'));
  });

  it('tells the user the commands are not implemented yet', async () => {
    await parse(['train']);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('not implemented yet'));
    expect(process.exitCode).toBe(1);
  });
});
