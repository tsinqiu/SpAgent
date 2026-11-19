const fs = require('node:fs');
const mysql = require('mysql2/promise');
const config = require('../src/config');

async function main() {
  const filePaths = process.argv.slice(2);
  if (!filePaths.length) {
    throw new Error('Usage: node scripts/applyMigration.js <sql-file> [sql-file ...]');
  }

  const connection = await mysql.createConnection({
    ...config.db,
    multipleStatements: true
  });

  try {
    for (const filePath of filePaths) {
      await connection.query(fs.readFileSync(filePath, 'utf8'));
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
