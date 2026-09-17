import { createRequire } from 'node:module';
import { Command } from 'commander';
import { registerTrainCommand } from './train.js';
import { registerRunCommand } from './run.js';
import { registerStatsCommand } from './stats.js';

const require = createRequire(import.meta.url);

/** Reads the version out of package.json, so the CLI can never disagree with the manifest. */
function readVersion(): string {
  const pkg = require('../../package.json') as { version: string };
  return pkg.version;
}

/**
 * Builds the `hunch` command tree.
 *
 * Kept separate from the bin entry point so tests can construct the program and parse
 * arguments against it without spawning a process.
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    // `hunch run -- --project=chromium` forwards trailing flags to Playwright, which means
    // subcommands must be allowed to own the options that come after their own name.
    .enablePositionalOptions()
    .name('hunch')
    .description(
      "Playwright's smart hunch about which tests to run. Predictive test selection with ML.",
    )
    .version(readVersion(), '-v, --version');

  registerTrainCommand(program);
  registerRunCommand(program);
  registerStatsCommand(program);

  return program;
}
