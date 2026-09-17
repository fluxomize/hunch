import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TestRecord } from '../types.js';

/**
 * Reading and writing `.hunch/history.jsonl`.
 *
 * The file is newline delimited JSON, appended to and never rewritten. That choice is what
 * makes the history diffable in a pull request, greppable from a terminal, and safe to
 * truncate by hand: one line is one test in one run, and losing the last line costs one
 * record rather than the file.
 */

/** Appends records as one write, so a run can never interleave with another run's lines. */
export function appendRecords(filePath: string, records: TestRecord[]): void {
  if (records.length === 0) {
    return;
  }
  mkdirSync(dirname(filePath), { recursive: true });
  const payload = records.map((record) => JSON.stringify(record)).join('\n') + '\n';
  appendFileSync(filePath, payload, 'utf8');
}

/**
 * Reads every record from the history file.
 *
 * Lines that cannot be parsed are skipped rather than thrown on. A history file is edited by
 * humans, concatenated across branches and truncated by crashes, so one damaged line must not
 * cost the user their entire history.
 */
export function readRecords(filePath: string): TestRecord[] {
  let contents: string;
  try {
    contents = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const records: TestRecord[] = [];
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const record = parseRecord(trimmed);
    if (record) {
      records.push(record);
    }
  }
  return records;
}

/** Parses one line, returning null when it is not a record we can trust. */
function parseRecord(line: string): TestRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  return isTestRecord(value) ? value : null;
}

/**
 * Checks the fields the rest of Hunch depends on.
 *
 * This is a guard against a corrupt or hand edited file, not a schema validator: a record with
 * the required fields plus extra ones is accepted, because a newer version of Hunch writing
 * more fields should not break an older one reading them.
 */
function isTestRecord(value: unknown): value is TestRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['testId'] === 'string' &&
    typeof record['file'] === 'string' &&
    typeof record['status'] === 'string' &&
    typeof record['duration'] === 'number' &&
    typeof record['timestamp'] === 'string' &&
    Array.isArray(record['changedFiles'])
  );
}
