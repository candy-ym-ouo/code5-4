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
    // 并发写：让后来的写事务等待最多 5s，而不是立刻抛 SQLITE_BUSY。
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(SCHEMA_SQL);
    this.migrate();
  }

  private migrate(): void {
    const columns = this.db.prepare('PRAGMA table_info(samples)').all() as unknown as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'slot')) {
      this.db.exec('ALTER TABLE samples ADD COLUMN slot INTEGER NOT NULL DEFAULT 1');
    }
  }

  transaction<T>(operation: () => T): T {
    let started = false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      started = true;
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      // 只有成功开启的事务才回滚；BEGIN 自身失败（如并发交错）时不能再 ROLLBACK，
      // 否则二次抛错会绕过 Express 错误处理并直接中断底层连接。
      if (started) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          // 连接可能已脱离事务状态；吞掉回滚错误以保留原始异常。
        }
      }
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
