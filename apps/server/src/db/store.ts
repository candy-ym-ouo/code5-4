import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL } from './schema.ts';

export class Store {
  readonly db: DatabaseSync;

  constructor(databasePath: string) {
    if (databasePath !== ':memory:') {
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    }
    this.db = new DatabaseSync(databasePath);
    this.db.exec(SCHEMA_SQL);
    this.migrate();
  }

  private migrate(): void {
    const columns = this.db.prepare('PRAGMA table_info(samples)').all() as unknown as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'slot')) {
      this.db.exec('ALTER TABLE samples ADD COLUMN slot INTEGER NOT NULL DEFAULT 1');
    }
    if (!columns.some((column) => column.name === 'revoked')) {
      this.db.exec('ALTER TABLE samples ADD COLUMN revoked INTEGER NOT NULL DEFAULT 0');
    }
  }

  transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
