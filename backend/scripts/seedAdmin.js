const authService = require('../src/services/authService');
const db = require('../src/db');
const config = require('../src/config');

async function main() {
  const admin = await authService.ensureAdminUser(config.auth.admin);
  console.log(`Admin user ready: ${admin.email} (id=${admin.id})`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.closePool();
    } catch (error) {
      console.error(`Failed to close database pool: ${error.message}`);
      process.exitCode = 1;
    }
  });
