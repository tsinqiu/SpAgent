const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

async function main() {
  const schema = await fs.readFile(path.join(__dirname, '../../database/sql/01_schema.sql'), 'utf8');
  const connection = await mysql.createConnection({ ...config.db, multipleStatements: true });

  try {
    // MySQL releases the named lock when this connection closes.
    const lockName = createHash('sha256').update(config.db.database.toLowerCase()).digest('hex');
    const [[{ acquired }]] = await connection.execute('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
    if (acquired !== 1) throw new Error('Another database initialization is running.');

    const [[{ objects }]] = await connection.query(`
      SELECT
        (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE())
        + (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE())
        + (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA = DATABASE()) AS objects
    `);
    if (Number(objects) !== 0) {
      throw new Error(`Database ${config.db.database} already has objects. db:init requires an empty database.`);
    }

    await connection.query(schema);
    console.log(`Initialized database ${config.db.database}.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
