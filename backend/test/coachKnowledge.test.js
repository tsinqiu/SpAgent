const test = require('node:test');
const assert = require('node:assert/strict');
const { searchTrainingKnowledge, answerTrainingKnowledge } = require('../src/services/coachKnowledgeService');
const { readCoachProfile } = require('../src/services/coachProfile');

test('training retrieval covers the four sports and respects explicit sport over role', () => {
  for (const [query, sport] of [
    ['跑步新手怎样用走跑交替开始？', 'running'],
    ['自由泳怎么练换气？', 'swimming'],
    ['如何安排无器械力量训练？', 'strength_training'],
    ['骑行长距离怎么补给和分配体力？', 'cycling']
  ]) {
    assert.equal(searchTrainingKnowledge(query, 'swimming')[0]?.sport, sport, query);
  }
  assert.deepEqual(searchTrainingKnowledge('坩埚陶瓷熔点'), []);
});

test('knowledge responses put server-verified links in the answer and constrain role and custom prompt', async () => {
  const result = await answerTrainingKnowledge('自由泳怎么换气？', {
    profile: readCoachProfile('swimming', '先给结论。'),
    redact: value => value,
    aiConfig: { agentUseDeepseek: true, deepseekApiKey: 'fixture' },
    completion: async messages => {
      assert.match(messages[0].content, /游泳教练|先给结论/);
      assert.match(messages[0].content, /\[1\].*换气/);
      return { content: '先练持续水下呼气，再练随身体转动换气 [1]。', model: 'deepseek-flash' };
    }
  });
  assert.equal(result.meta.answerProvider, 'deepseek');
  assert.equal(result.cards[0].tool, 'search_training_knowledge');
  assert.match(result.content, /https:\/\/www\.usms\.org\//);
  assert.throws(() => readCoachProfile('outside', 'x'), { code: 'AGENT_PROFILE_INVALID' });
  assert.throws(() => readCoachProfile('cycling', 'x'.repeat(1501)), { code: 'AGENT_PROFILE_INVALID' });
});

test('training knowledge ignores model-created links and returns local source text on provider failure', async () => {
  const result = await answerTrainingKnowledge('如何练自由泳换气？', {
    redact: value => value,
    aiConfig: { agentUseDeepseek: true, deepseekApiKey: 'fixture' },
    completion: async () => ({ content: '内容 https://example.invalid/fake' })
  });
  assert.equal(result.meta.answerProvider, 'knowledge');
  assert.equal(result.meta.fallback, true);
  assert.doesNotMatch(result.content, /example\.invalid/);
  assert.match(result.content, /参考资料/);
});
