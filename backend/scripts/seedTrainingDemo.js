const db = require('../src/db');
const { addDays, localToday } = require('../src/services/trainingPlanInput');

const runs = [
  { ago: 20, distance: 2600, seconds: 1200, load: 25 },
  { ago: 11, distance: 3000, seconds: 1320, load: 33 },
  { ago: 5, distance: 3400, seconds: 1440, load: 39 },
  { ago: 2, distance: 3700, seconds: 1500, load: 44 }
];

async function main() {
  const email = process.argv[2]?.trim();
  if (!email) throw new Error('Usage: npm run seed:training-demo -- <local-demo-account-email>');
  const today = localToday();
  await db.transaction(async connection => {
    const [[user]] = await connection.execute('SELECT id FROM Users WHERE email = ? FOR UPDATE', [email]);
    if (!user) throw new Error('Register a dedicated local demo account before seeding');
    for (const [index, run] of runs.entries()) {
      const date = addDays(today, -run.ago);
      const [activity] = await connection.execute(`
        INSERT INTO Activities (activity_key, activity_name, activity_type, owner_user_id, data_source,
          match_status, local_start_time, start_time_utc)
        VALUES (?, ?, 'running', ?, 'demo_synthetic', 'demo_synthetic', ?, ?)
        ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [`demo-training:${user.id}:${date}`, `合成演示跑步 ${index + 1}`, user.id, `${date} 07:00:00`, `${addDays(date, -1)} 23:00:00`]);
      await connection.execute(`
        INSERT INTO ActivitySummaries (activity_id, distance_m, duration_s, activity_training_load)
        VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id`,
      [activity.insertId, run.distance, run.seconds, run.load]);
    }
    for (const [index, ago] of [10, 4, 1].entries()) {
      const date = addDays(today, -ago);
      await connection.execute(`
        INSERT INTO SleepSummaries (user_id, sleep_date, duration_s, sleep_score, avg_hrv, raw_json)
        VALUES (?, ?, ?, ?, ?, JSON_OBJECT('source', 'demo_synthetic'))
        ON DUPLICATE KEY UPDATE id = id`,
      [user.id, date, 24600 + index * 600, 76 + index * 3, 42 + index]);
      await connection.execute(`
        INSERT INTO DailyHealthSummaries (user_id, summary_date, resting_heart_rate_bpm, raw_json)
        VALUES (?, ?, ?, JSON_OBJECT('source', 'demo_synthetic'))
        ON DUPLICATE KEY UPDATE id = id`,
      [user.id, date, 61 - index]);
    }
  });
  console.log('Synthetic training and recovery records are ready for the selected demo account.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.closePool());
