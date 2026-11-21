const db = require('../db');
const { ApiError } = require('../errors');

const MEMORY_CATEGORIES = Object.freeze(['goal', 'injury', 'preference', 'schedule', 'gear', 'note']);
const CATEGORY_LABELS = Object.freeze({
  goal: '训练目标',
  injury: '伤病与体感',
  preference: '训练偏好',
  schedule: '作息与日程',
  gear: '装备与环境',
  note: '教练备忘'
});
const MAX_MEMORIES_PER_USER = 30;
const MAX_CONTENT_LENGTH = 300;

function normalizeCategory(category) {
  const value = typeof category === 'string' ? category.trim().toLowerCase() : 'note';
  return MEMORY_CATEGORIES.includes(value) ? value : 'note';
}

function normalizeContent(content) {
  if (typeof content !== 'string') {
    throw new ApiError(400, '记忆内容必须是文本。', 'INVALID_ATHLETE_MEMORY');
  }
  const trimmed = content.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed.length > MAX_CONTENT_LENGTH) {
    throw new ApiError(400, `记忆内容需在 1–${MAX_CONTENT_LENGTH} 字以内。`, 'INVALID_ATHLETE_MEMORY');
  }
  return trimmed;
}

function formatMemory(row) {
  return {
    id: Number(row.id),
    category: row.category,
    categoryLabel: CATEGORY_LABELS[row.category] || CATEGORY_LABELS.note,
    content: row.content,
    source: row.source,
    updatedAt: row.updatedAt
  };
}

async function listMemories(userId) {
  try {
    const rows = await db.query(
      `SELECT id, category, content, source,
         DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updatedAt
       FROM AthleteMemories
       WHERE user_id = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`,
      [userId, MAX_MEMORIES_PER_USER]
    );
    return rows.map(formatMemory);
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

async function saveMemory(userId, { category = 'note', content, source = 'agent' }) {
  const safeCategory = normalizeCategory(category);
  const safeContent = normalizeContent(content);
  const safeSource = source === 'user' ? 'user' : 'agent';

  const existing = await db.query(
    `SELECT id, category, content, source, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updatedAt
     FROM AthleteMemories
     WHERE user_id = ? AND content = ?
     LIMIT 1`,
    [userId, safeContent]
  );
  if (existing.length) {
    await db.query(
      'UPDATE AthleteMemories SET category = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND user_id = ?',
      [safeCategory, existing[0].id, userId]
    );
    return formatMemory({ ...existing[0], category: safeCategory });
  }

  const [{ total }] = await db.query('SELECT COUNT(*) AS total FROM AthleteMemories WHERE user_id = ?', [userId]);
  if (Number(total) >= MAX_MEMORIES_PER_USER) {
    // Prune the oldest memory when cap is reached so fresh coach context always fits.
    await db.query(
      `DELETE FROM AthleteMemories
       WHERE id IN (
         SELECT id FROM (
           SELECT id FROM AthleteMemories WHERE user_id = ? ORDER BY updated_at ASC, id ASC LIMIT 1
         ) AS oldest
       )`,
      [userId]
    );
  }

  const inserted = await db.query(
    'INSERT INTO AthleteMemories (user_id, category, content, source) VALUES (?, ?, ?, ?)',
    [userId, safeCategory, safeContent, safeSource]
  );
  const [row] = await db.query(
    `SELECT id, category, content, source, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updatedAt
     FROM AthleteMemories WHERE id = ? AND user_id = ?`,
    [inserted.insertId, userId]
  );
  return formatMemory(row);
}

async function deleteMemory(userId, memoryId) {
  const result = await db.query('DELETE FROM AthleteMemories WHERE id = ? AND user_id = ?', [memoryId, userId]);
  if (!result.affectedRows) {
    throw new ApiError(404, '未找到这条教练记忆。', 'ATHLETE_MEMORY_NOT_FOUND');
  }
  return { deleted: true, id: Number(memoryId) };
}

module.exports = {
  MEMORY_CATEGORIES,
  CATEGORY_LABELS,
  listMemories,
  saveMemory,
  deleteMemory
};
