/**
 * backup-sqlite.js
 *
 * Creates a timestamped, consistent snapshot of the SQLite pilot database.
 *
 * Usage:
 *   node backend/scripts/backup-sqlite.js
 *
 * The script uses SQLite's VACUUM INTO command (requires SQLite >= 3.27.0,
 * available in all node sqlite3 packages from ~2019 onward) to write a
 * fully defragmented, consistent copy of the live database to a backup file
 * without requiring the server to be offline.
 *
 * Backup directory:
 *   Defaults to backend/backups/
 *   Override with SQLITE_BACKUP_DIR env var.
 *
 * Source database:
 *   Read from SQLITE_PATH env var (same as the server uses).
 *   Defaults to verification.db relative to backend/.
 *
 * Retention:
 *   The script keeps the last 30 backup files by default.
 *   Override with BACKUP_KEEP_COUNT env var.
 *
 * Restore procedure (see OPERATIONAL_RUNBOOK.md for full steps):
 *   1. Stop the backend server.
 *   2. cp backend/backups/backup-YYYY-MM-DDTHH-MM-SS.db <SQLITE_PATH>
 *   3. Restart the backend server and verify /api/v1/health.
 *
 * Exit codes:
 *   0 — backup created successfully
 *   1 — backup failed (error message printed to stderr)
 */

'use strict';

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const BACKEND_DIR = path.resolve(__dirname, '..');

// Source database — resolve relative to backend/ directory
const rawSqlitePath = process.env.SQLITE_PATH || 'verification.db';
const SOURCE_PATH = path.isAbsolute(rawSqlitePath)
  ? rawSqlitePath
  : path.resolve(BACKEND_DIR, rawSqlitePath);

// Backup directory
const rawBackupDir = process.env.SQLITE_BACKUP_DIR || path.join(BACKEND_DIR, 'backups');
const BACKUP_DIR = path.isAbsolute(rawBackupDir)
  ? rawBackupDir
  : path.resolve(BACKEND_DIR, rawBackupDir);

// Retention count
const KEEP_COUNT = Math.max(1, parseInt(process.env.BACKUP_KEEP_COUNT || '30', 10));

function timestamp() {
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
}

function pruneOldBackups(dir, keepCount) {
  const entries = fs.readdirSync(dir)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.db'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime); // newest first

  const toDelete = entries.slice(keepCount);
  for (const entry of toDelete) {
    try {
      fs.unlinkSync(path.join(dir, entry.name));
      console.log(`[BACKUP] Pruned old backup: ${entry.name}`);
    } catch (err) {
      console.error(`[BACKUP] Warning: could not prune ${entry.name}: ${err.message}`);
    }
  }
}

async function runBackup() {
  // Verify source exists
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`[BACKUP] Source database not found: ${SOURCE_PATH}`);
    console.error('[BACKUP] Is the backend running? Is SQLITE_PATH set correctly?');
    process.exit(1);
  }

  // Ensure backup directory exists
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const backupFile = `backup-${timestamp()}.db`;
  const DEST_PATH = path.join(BACKUP_DIR, backupFile);

  console.log(`[BACKUP] Source : ${SOURCE_PATH}`);
  console.log(`[BACKUP] Dest   : ${DEST_PATH}`);

  await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(SOURCE_PATH, sqlite3.OPEN_READONLY, (openErr) => {
      if (openErr) {
        reject(new Error(`Cannot open source database: ${openErr.message}`));
        return;
      }

      // VACUUM INTO creates a consistent copy without locking writes on the source.
      db.run(`VACUUM INTO ?`, [DEST_PATH], (vacuumErr) => {
        db.close();

        if (vacuumErr) {
          // VACUUM INTO not available (SQLite < 3.27). Fall back to file copy.
          // The server should be stopped before a file-copy backup to ensure
          // the WAL file is flushed; log a clear warning.
          console.warn(`[BACKUP] VACUUM INTO not available (${vacuumErr.message}), falling back to file copy.`);
          console.warn('[BACKUP] WARNING: File-copy backup may be inconsistent if the server is running.');
          console.warn('[BACKUP] Stop the backend before this backup for guaranteed consistency.');
          try {
            fs.copyFileSync(SOURCE_PATH, DEST_PATH);
            // Also copy WAL/SHM if they exist
            for (const suffix of ['-wal', '-shm']) {
              const walPath = SOURCE_PATH + suffix;
              if (fs.existsSync(walPath)) {
                fs.copyFileSync(walPath, DEST_PATH + suffix);
              }
            }
            resolve();
          } catch (copyErr) {
            reject(new Error(`File copy failed: ${copyErr.message}`));
          }
          return;
        }

        resolve();
      });
    });
  });

  // Verify the backup is non-empty
  const stat = fs.statSync(DEST_PATH);
  if (stat.size === 0) {
    fs.unlinkSync(DEST_PATH);
    throw new Error('Backup file is empty — aborting and removing it.');
  }

  console.log(`[BACKUP] Success: ${backupFile} (${(stat.size / 1024).toFixed(1)} KB)`);

  // Prune old backups
  pruneOldBackups(BACKUP_DIR, KEEP_COUNT);
  console.log(`[BACKUP] Keeping last ${KEEP_COUNT} backups in ${BACKUP_DIR}`);
}

runBackup().catch((err) => {
  console.error(`[BACKUP] FAILED: ${err.message}`);
  process.exit(1);
});
