#!/usr/bin/env node
// Verifies data/database.db meets the minimum invariants for image build.
// Exit 0 on pass; exit 1 with diagnostic on fail.

const path = require("node:path");
const Database = require("better-sqlite3");

const DB_PATH = path.resolve(__dirname, "../data/database.db");
const MIN_LEGAL_DOCUMENTS = 58000;
const FTS_PROBE_TERM = "dati personali";

function fail(msg) {
  console.error(`verify-db FAIL: ${msg}`);
  process.exit(1);
}

let db;
try {
  db = new Database(DB_PATH, { readonly: true });
} catch (e) {
  fail(`cannot open ${DB_PATH}: ${e.message}`);
}

const integrity = db.prepare("PRAGMA integrity_check").get();
if (integrity.integrity_check !== "ok") fail(`integrity_check returned ${JSON.stringify(integrity)}`);

const journal = db.prepare("PRAGMA journal_mode").get();
if (journal.journal_mode !== "delete") fail(`journal_mode is ${journal.journal_mode}; expected 'delete'`);

const docs = db.prepare("SELECT count(*) AS n FROM legal_documents").get().n;
if (docs < MIN_LEGAL_DOCUMENTS) fail(`legal_documents has ${docs} rows; minimum is ${MIN_LEGAL_DOCUMENTS}`);

const fts = db.prepare("SELECT count(*) AS n FROM provisions_fts WHERE provisions_fts MATCH ?").get(FTS_PROBE_TERM).n;
if (fts === 0) fail(`provisions_fts MATCH '${FTS_PROBE_TERM}' returned 0 hits; FTS index is empty or corrupt`);

console.log(`verify-db PASS: integrity=ok, journal=delete, legal_documents=${docs.toLocaleString()}, fts_hits=${fts}`);
process.exit(0);
