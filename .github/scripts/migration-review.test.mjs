// Tests for the deterministic part of migration-review.mjs: node --test .github/scripts/migration-review.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminPing, checkChanges, destructiveFindings, listMigrations, parseVerdict, splitStatements } from "./migration-review.mjs";

const M = "supabase/migrations/";
const main = [
  "0001_shared.sql", "0007_shared_business_insights.sql",
  "20261021060114_judge_core.sql", "20261021075506_shared_enrichment_check_blank.sql",
];
const run = (changes, files = {}) =>
  checkChanges({ changes, mainMigrations: main, readNew: (p) => files[p] ?? "select 1;" });
const messages = (r) => r.findings.map((f) => f.message).join("\n");

test("a well-formed new migration passes and is queued for AI review", () => {
  const r = run([{ status: "A", path: `${M}20261022010101_judge_notes.sql` }]);
  assert.deepEqual(r.findings, []);
  assert.equal(r.newMigrations.length, 1);
});

test("app-only PRs are not relevant", () => {
  const r = run([{ status: "M", path: "app/page.tsx" }]);
  assert.deepEqual(r.findings, []);
  assert.equal(r.relevant, false);
});

test("editing, deleting or renaming a merged migration fails", () => {
  for (const ch of [
    { status: "M", path: `${M}20261021060114_judge_core.sql` },
    { status: "D", path: `${M}0001_shared.sql` },
    { status: "R", oldPath: `${M}20261021060114_judge_core.sql`, path: `${M}20261023000000_judge_core.sql` },
  ]) {
    assert.match(messages(run([ch])), /Never edit a merged migration/);
  }
});

test("versions compare like the Supabase CLI (as strings)", () => {
  // 0008 sorts before 2026… as a string, so it is out of order; so is an equal timestamp.
  assert.match(messages(run([{ status: "A", path: `${M}00000000000008_shared_x.sql` }])), /Out of order/);
  assert.match(messages(run([{ status: "A", path: `${M}20261021075506_judge_x.sql` }])), /Out of order/);
  assert.match(messages(run([{ status: "A", path: `${M}20261021060200_judge_x.sql` }])), /Out of order/);
  assert.doesNotMatch(messages(run([{ status: "A", path: `${M}20261021075507_judge_x.sql` }])), /Out of order/);
});

test("names need a 14-digit timestamp and an area prefix", () => {
  for (const name of ["0008_shared_x.sql", "20261022010101_notes.sql", "20261022010101_Judge_x.sql"]) {
    assert.match(messages(run([{ status: "A", path: M + name }])), /Name must be/);
  }
  for (const name of ["20261022010101_shared_x.sql", "20261022010101_teams_x.sql", "20261022010101_judge_x_y.sql"]) {
    assert.deepEqual(run([{ status: "A", path: M + name }]).findings, []);
  }
});

test("snippets, .github, config.toml and functions are flagged", () => {
  assert.match(messages(run([{ status: "A", path: "supabase/snippets/Untitled query 1.sql" }])), /snippets/);
  assert.deepEqual(run([{ status: "D", path: "supabase/snippets/Untitled query 1.sql" }]).findings, []);
  for (const path of [".github/workflows/x.yml", "supabase/config.toml", "supabase/functions/f/index.ts"]) {
    const r = run([{ status: "M", path }]);
    assert.equal(r.findings[0]?.needsAdam, true, path);
  }
});

test("destructive SQL needs Adam", () => {
  const bad = [
    "drop table judge_scores;",
    "alter table judge_entries drop column tagline;",
    "alter table judge_entries drop tagline;",
    "truncate judge_scores;",
    "delete from judge_scores where true;",
    "create function f() returns void language sql as $$ delete from judge_scores $$;",
    "alter table judge_entries disable row level security;",
    "drop type judge_round cascade;",
    "alter table profiles add column x text not null default '';",
    "alter table public.profiles rename column bio to about;",
    "alter table event_settings add column a text, alter column b type int;",
    "ALTER TABLE \"teams\" ADD CONSTRAINT x CHECK (true);",
  ];
  for (const sql of bad) assert.ok(destructiveFindings(sql).length > 0, sql);

  const ok = [
    "alter table profiles add column pronouns text;",
    "alter table profiles enable row level security;",
    "alter table event_settings add column if not exists a timestamptz, add column b text default 'x';",
    "alter table judge_entries add column x uuid references teams (id) on delete cascade;",
    "create table judge_x (id uuid primary key, team_id uuid references teams on delete cascade);",
    "drop policy if exists judge_x_read on judge_x;",
    "alter table judge_entries alter column tagline drop not null;",
    "alter table judge_entries drop constraint judge_entries_title_check;",
    "-- drop table judge_scores;\nselect 1;",
    "/* truncate judge_scores; */ select 1;",
  ];
  for (const sql of ok) assert.deepEqual(destructiveFindings(sql), [], sql);
});

test("statements report the line they start on, after comments", () => {
  const sql = "-- header\n\ncreate table a (id int);\n\n-- note\ndrop table a;\n";
  assert.deepEqual(splitStatements(sql).map((s) => s.line), [3, 6]);
  assert.equal(destructiveFindings(sql)[0].line, 6);
});

test("the verdict fails closed", () => {
  const v = (o) => parseVerdict(JSON.stringify(o));
  assert.equal(v({ verdict: "pass", summary: "", findings: [] }).verdict, "pass");
  assert.equal(v({ verdict: "pass", summary: "", findings: [{ severity: "blocker", file: "a", line: 1, title: "t", detail: "d" }] }).verdict, "block");
  assert.throws(() => parseVerdict("I approve."));
});

test("main's migrations: each timestamped one is in order relative to those before it", () => {
  const all = listMigrations("HEAD").sort();
  assert.ok(all.length > 0);
  all.forEach((name, i) => {
    if (!/^[0-9]{14}_/.test(name)) return;
    const r = checkChanges({
      changes: [{ status: "A", path: M + name }],
      mainMigrations: all.slice(0, i),
      readNew: () => "select 1;",
    });
    assert.deepEqual(r.findings, [], name);
  });
});

test("Adam is mentioned only for his items, and the key ignores line numbers", () => {
  const f = (file, message, needsAdam) => ({ file, message, needsAdam });
  assert.equal(adminPing({ findings: [f("a.sql", "Out of order", false)], ai: { status: "none" } }), null);
  const one = adminPing({ findings: [f("a.sql:3", "**Needs Adam.** drops a table: `drop table x`", true)], ai: { status: "none" } });
  const moved = adminPing({ findings: [f("a.sql:9", "**Needs Adam.** drops a table: `drop table  x`", true)], ai: { status: "none" } });
  assert.match(one.body, /^<!-- migration-review-ping \w+ -->\n@00Zero /);
  assert.equal(one.key, moved.key);
  const err = adminPing({ findings: [], ai: { status: "error", error: "HTTP 401" } });
  assert.match(err.body, /couldn't run/);
});
