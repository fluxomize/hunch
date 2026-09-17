import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendRecords, readRecords } from '../src/storage/jsonl.js';
import type { TestRecord } from '../src/types.js';

const record = (overrides: Partial<TestRecord> = {}): TestRecord => ({
  testId: 'tests/login.spec.ts > signs in',
  file: 'tests/login.spec.ts',
  project: 'chromium',
  duration: 1200,
  status: 'passed',
  timestamp: '2026-09-17T00:00:00.000Z',
  commitSha: 'a'.repeat(40),
  changedFiles: ['src/login.ts'],
  branch: 'main',
  ...overrides,
});

describe('history file', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hunch-jsonl-'));
    file = join(dir, '.hunch', 'history.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the directory on the first write', () => {
    appendRecords(file, [record()]);
    expect(readRecords(file)).toHaveLength(1);
  });

  it('writes one line per record and keeps the file newline terminated', () => {
    appendRecords(file, [record(), record({ status: 'failed' })]);
    const raw = readFileSync(file, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.trimEnd().split('\n')).toHaveLength(2);
  });

  it('appends rather than replacing, so history accumulates across runs', () => {
    appendRecords(file, [record({ commitSha: 'a'.repeat(40) })]);
    appendRecords(file, [record({ commitSha: 'b'.repeat(40) })]);
    expect(readRecords(file).map((r) => r.commitSha[0])).toEqual(['a', 'b']);
  });

  it('writes nothing at all when given no records', () => {
    appendRecords(file, []);
    expect(readRecords(file)).toEqual([]);
  });

  it('round trips every field', () => {
    const original = record({ changedFiles: ['a.ts', 'b.ts'], retry: 2 });
    appendRecords(file, [original]);
    expect(readRecords(file)[0]).toEqual(original);
  });

  it('returns nothing for a file that does not exist', () => {
    expect(readRecords(join(dir, 'missing.jsonl'))).toEqual([]);
  });

  it('skips damaged lines instead of losing the whole history', () => {
    // A history file gets hand edited, concatenated across branches and truncated by crashes.
    // One bad line must cost one record, not the file.
    appendRecords(file, [record({ testId: 'first' })]);
    writeFileSync(file, readFileSync(file, 'utf8') + 'not json at all\n{"partial":\n', 'utf8');
    appendRecords(file, [record({ testId: 'second' })]);

    expect(readRecords(file).map((r) => r.testId)).toEqual(['first', 'second']);
  });

  it('skips lines that parse but are not records', () => {
    appendRecords(file, [record({ testId: 'real' })]);
    writeFileSync(file, readFileSync(file, 'utf8') + '{"testId":"incomplete"}\n42\nnull\n', 'utf8');

    expect(readRecords(file).map((r) => r.testId)).toEqual(['real']);
  });

  it('ignores blank lines', () => {
    appendRecords(file, [record()]);
    writeFileSync(file, readFileSync(file, 'utf8') + '\n\n   \n', 'utf8');
    expect(readRecords(file)).toHaveLength(1);
  });
});
