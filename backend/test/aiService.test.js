const test = require('node:test');
const assert = require('node:assert/strict');

const aiService = require('../src/services/aiService');
const activityService = require('../src/services/activityService');
const trainingReadinessService = require('../src/services/trainingReadinessService');
const config = require('../src/config');
const db = require('../src/db');
const { ApiError } = require('../src/errors');
const { localToday, mondayOf } = require('../src/services/trainingPlanInput');

function withActivityStubs(stubs, fn) {
  const originals = {};
  for (const [name, value] of Object.entries(stubs)) {
    originals[name] = activityService[name];
    activityService[name] = value;
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [name, value] of Object.entries(originals)) {
        activityService[name] = value;
      }
    });
}

function withAiEnvironment({ activityStubs = {}, dbQuery, aiConfig = {}, mlPredict, fetchImpl }, fn) {
  const originalDbQuery = db.query;
  const originalFetch = global.fetch;
  const originalAiConfig = { ...config.ai };
  const originalPredict = trainingReadinessService.predict;

  if (dbQuery) db.query = dbQuery;
  if (fetchImpl) global.fetch = fetchImpl;
  if (mlPredict) trainingReadinessService.predict = mlPredict;
  Object.assign(config.ai, aiConfig);

  return withActivityStubs(activityStubs, fn)
    .finally(() => {
      db.query = originalDbQuery;
      global.fetch = originalFetch;
      Object.assign(config.ai, originalAiConfig);
      trainingReadinessService.predict = originalPredict;
    });
}

function ragDbQuery(sql) {
  if (sql.includes('MAX(latest_date)')) {
    return [{ latestDate: '2026-06-29' }];
  }
  if (sql.includes('COUNT(*) AS activityCount')) {
    return [{
      activityCount: 3,
      totalDistanceKm: 18.2,
      totalDurationH: 2.4,
      totalTrainingLoad: 210,
      avgHeartRateBpm: 148,
      avgTemperatureC: 31,
      avgHumidityPercent: 72,
      weatherSamples: 2
    }];
  }
  if (sql.includes('FROM Activities a') && sql.includes('LEFT JOIN ActivitySummaries')) {
    return [{
      id: 1,
      localDate: '2026-06-29',
      activityName: '无锡市 跑步',
      activityType: 'running',
      distanceM: 5000,
      durationS: 1800,
      avgHeartRateBpm: 145,
      activityTrainingLoad: 80,
      weatherCondition: '多云',
      temperatureC: 31,
      humidityPercent: 72,
      feelsLikeC: 35
    }];
  }
  if (sql.includes('FROM DailyHealthSummaries')) {
    return [{
      summaryDate: '2026-06-29',
      steps: 9000,
      avgStressLevel: 52,
      restingHeartRateBpm: 55,
      bodyBatteryDrained: 65,
      minBodyBattery: 28,
      maxBodyBattery: 72
    }];
  }
  if (sql.includes('FROM SleepSummaries')) {
    return [{
      sleepDate: '2026-06-29',
      durationS: 19800,
      sleepScore: 58,
      avgHrv: 42,
      hrvStatus: 'unbalanced',
      avgSleepStress: 32
    }];
  }
  if (sql.includes('FROM TrainingStatusSnapshots')) {
    return [{
      snapshotDate: '2026-06-29',
      trainingStatus: 'MAINTAINING',
      acuteTrainingLoad: 720,
      chronicTrainingLoad: 540,
      acuteChronicWorkloadRatio: 1.33,
      optimalLoadMax: 650
    }];
  }
  return [];
}

function steadyRagDbQuery(sql) {
  const rows = ragDbQuery(sql);
  if (sql.includes('FROM DailyHealthSummaries')) return rows.map(row => ({ ...row, avgStressLevel: 20, bodyBatteryDrained: 20 }));
  if (sql.includes('FROM SleepSummaries')) return rows.map(row => ({ ...row, durationS: 27000, sleepScore: 82, hrvStatus: 'balanced' }));
  if (sql.includes('FROM TrainingStatusSnapshots')) {
    return rows.map(row => ({ ...row, acuteTrainingLoad: 500, chronicTrainingLoad: 500, acuteChronicWorkloadRatio: 1 }));
  }
  if (sql.includes('FROM Activities a') && sql.includes('LEFT JOIN ActivitySummaries') && !sql.includes('COUNT(*)')) {
    return rows.map(row => ({ ...row, temperatureC: 20, feelsLikeC: 20, humidityPercent: 45, activityTrainingLoad: 15 }));
  }
  return rows;
}

test('aiService reports DeepSeek provider with rule fallback', async () => {
  const health = await aiService.getHealth();

  assert.equal(health.provider, 'deepseek');
  assert.equal(health.activeProvider, health.deepseekConfigured ? 'deepseek' : 'rules');
  assert.equal(health.fallbackRules, true);
});

test('aiService stays serviceable through rules when DeepSeek is not configured', async () => {
  await withAiEnvironment({
    aiConfig: { deepseekApiKey: '', fallbackRules: true }
  }, async () => {
    const health = await aiService.getHealth();

    assert.equal(health.status, 'ok');
    assert.equal(health.activeProvider, 'rules');
    assert.equal(health.deepseekConfigured, false);
    assert.equal(health.rulesAvailable, true);
    assert.equal(health.readiness.status, 'ok');
  });
});

test('aiService daily brief summarizes only owned and recent activities', async () => {
  await withAiEnvironment({
    dbQuery: async (sql, args) => {
      if (sql.includes('FROM Activities a')) {
        assert.match(sql, /a\.owner_user_id = \?/);
        assert.doesNotMatch(sql, /owner_user_id IS NULL/);
        assert.equal(args[0], 7);
      }
      return ragDbQuery(sql);
    },
    aiConfig: { deepseekApiKey: '' },
    activityStubs: {
      getSummaryStats: async (filters) => {
        assert.equal(filters.owner, 'mine');
        assert.equal(filters.ownerUserId, 7);
        return { activityCount: 1, totalDistanceKm: 5 };
      },
      getLoadBalance: async (filters) => {
        assert.equal(filters.ownerUserId, 7);
        return [{ dailyTrainingLoad: 80, ctl: 20, atl: 24, tsb: -4 }];
      }
    }
  }, async () => {
    const brief = await aiService.getDailyBrief({ id: 7 });

    assert.equal(brief.meta.ai.provider, 'rules');
    assert.equal(brief.data.sections.length, 5);
    assert.equal(brief.data.metrics.length, 4);
    assert.equal(typeof brief.data.placements.trainingLoad.text, 'string');
    assert.match(brief.data.sections[0].text, /近期共有 1 次运动/);
  });
});

test('AI context uses calendar windows ending today and keeps an old record date separate', async () => {
  await withAiEnvironment({
    dbQuery: async (sql, args) => {
      if (sql.includes('MAX(latest_date)')) return [{ latestDate: '2026-08-17' }];
      if (sql.includes('FROM Activities a')) assert.deepEqual(args, [7, '2026-10-24', '2026-11-20']);
      else assert.deepEqual(args, [7, '2026-11-07', '2026-11-20']);
      return [];
    }
  }, async () => {
    const context = await aiService.__private.getRagContext({ id: 7 }, '2026-11-20');
    assert.equal(context.latestDate, '2026-08-17');
    assert.equal(context.asOf, '2026-11-20');
    assert.equal(context.signals.activityCount28d, 0);
    const prompt = aiService.__private.buildCoachSystemPrompt(context, { trainingLoad: [] });
    assert.match(prompt, /统计截至: 2026-11-20；最近有效记录: 2026-08-17/);
    assert.match(prompt, /综合风险等级: 数据不足，无法判断/);
    assert.doesNotMatch(prompt, /当前 TSB 0/);
  });
});

test('chat returns immediate local emergency guidance without database or model access', async () => {
  let unexpected = 0;
  await withAiEnvironment({
    dbQuery: () => { unexpected += 1; return []; },
    fetchImpl: () => { unexpected += 1; throw new Error('unexpected fetch'); }
  }, async () => {
    const result = await aiService.chat({ message: '跑步时胸口疼、头晕，可以继续吗？' }, { id: 7 });
    assert.equal(result.meta.ai.reason, 'urgent_safety');
    assert.match(result.data.content, /立即停止运动并联系当地急救服务/);
    assert.deepEqual(result.data.quickReplies, []);
    assert.equal(unexpected, 0);
  });
});

test('time-capped running arrangements move to the validated plan flow without free-text durations', async () => {
  let calls = 0;
  await withAiEnvironment({
    dbQuery: () => { calls += 1; return []; },
    fetchImpl: () => { calls += 1; throw new Error('unexpected fetch'); }
  }, async () => {
    const message = '想开始规律跑步，每周二、六能练，我只有 10 分钟，帮我安排走跑。';
    const result = await aiService.chat({ message }, { id: 7 });
    assert.equal(result.meta.ai.reason, 'structured_duration');
    assert.equal(result.data.nextStep, 'plan_assistant');
    assert.equal(require('../src/services/coachAgentRules').interpretWithRules(message).maxSessionMinutes, 10);
    assert.equal(calls, 0);
  });
});

test('aiService daily brief accepts a DeepSeek recommendation and retains local facts', async () => {
  let requestBody;
  await withAiEnvironment({
    dbQuery: steadyRagDbQuery,
    mlPredict: async () => ({ provider: 'rules', riskLevel: 'green', loadAction: 'maintain' }),
    aiConfig: {
      deepseekApiKey: 'test-key',
      deepseekModel: 'deepseek-chat',
      deepseekBaseUrl: 'https://api.deepseek.com',
      fallbackRules: true
    },
    activityStubs: {
      getDashboardOverview: async () => ({
        recentActivities: [{ id: 1, activityType: 'running', distanceM: 5000 }],
        monthlySummary: { activityCount: 1, totalDistanceKm: 5 },
        trainingLoad: [{ dailyTrainingLoad: 80, ctl: 20, atl: 35, tsb: -15 }]
      })
    },
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                headline: 'DeepSeek 恢复建议',
                riskLevel: 'orange',
                recommendation: '今天以恢复跑和拉伸为主，避开高温时段。',
                weatherAdvice: '体感温度较高，户外训练要降低目标配速。',
                loadAdvice: '负荷偏紧，避免继续堆强度。',
                sleepAdvice: '睡眠评分偏低，优先补睡。',
                recoveryAdvice: '恢复优先，保留轻松活动即可。',
                sections: [
                  { key: 'recent', title: '近期运动', tone: 'warning', text: '近期训练连续性较强。' },
                  { key: 'body', title: '负荷状态', tone: 'warning', text: '短期负荷偏高。' },
                  { key: 'sleep', title: '睡眠恢复', tone: 'warning', text: '睡眠和 HRV 提示恢复不足。' },
                  { key: 'weather', title: '天气影响', tone: 'warning', text: '高温高湿会放大体感强度。' },
                  { key: 'today', title: '今日安排', tone: 'warning', text: '安排恢复跑或休息。' }
                ],
                placements: {
                  today: { title: '今日智能建议', tone: 'warning', text: '恢复优先。' },
                  trainingLoad: { title: '负荷建议', tone: 'warning', text: '降低强度。' },
                  sleep: { title: '睡眠与恢复建议', tone: 'warning', text: '优先补睡。' },
                  weather: { title: '天气影响', tone: 'warning', text: '避开高温。' }
                }
              })
            }
          }]
        })
      };
    }
  }, async () => {
    const result = await aiService.getDailyBrief({ id: 7 });

    assert.equal(result.meta.ai.provider, 'deepseek');
    assert.equal(result.meta.ai.fallback, false);
    assert.equal(result.data.recommendation, '今天以恢复跑和拉伸为主，避开高温时段。');
    assert.notEqual(result.data.headline, 'DeepSeek 恢复建议');
    assert.notEqual(result.data.placements.trainingLoad.text, '降低强度。');
    assert.equal(result.data.ml.provider, 'rules');
    assert.equal(result.meta.ai.contextSignals.mlProvider, 'rules');
    assert.equal(result.data.metrics.length, 4);
    assert.equal(requestBody.messages[0].role, 'system');
    assert.equal(requestBody.messages[1].role, 'user');
    assert.match(requestBody.messages[0].content, /近期运动明细/);
    assert.match(requestBody.messages[0].content, /就绪度规则评估/);
    assert.match(requestBody.messages[1].content, /只返回一个 JSON 对象/);
    assert.doesNotMatch(JSON.stringify(result), /近期运动明细|system prompt|28天运动汇总/);
  });
});

test('aiService daily brief falls back to rules for invalid DeepSeek JSON', async () => {
  await withAiEnvironment({
    dbQuery: steadyRagDbQuery,
    mlPredict: async () => ({ provider: 'rules', riskLevel: 'green', loadAction: 'maintain' }),
    aiConfig: {
      deepseekApiKey: 'test-key',
      fallbackRules: true
    },
    activityStubs: {
      getDashboardOverview: async () => ({
        recentActivities: [{ id: 1, activityType: 'running', distanceM: 5000 }],
        monthlySummary: { activityCount: 1, totalDistanceKm: 5 },
        trainingLoad: [{ dailyTrainingLoad: 80, ctl: 20, atl: 35, tsb: -15 }]
      })
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '不是 JSON' } }] })
    })
  }, async () => {
    const result = await aiService.getDailyBrief({ id: 7 });

    assert.equal(result.meta.ai.provider, 'rules');
    assert.equal(result.meta.ai.fallback, true);
    assert.equal(result.meta.ai.contextSignals.activityCount28d, 3);
  });
});

test('aiService chat rejects empty messages and answers sports questions', async () => {
  await assert.rejects(
    () => aiService.chat({ message: '' }, { id: 2 }),
    (error) => error.code === 'INVALID_AI_INPUT'
  );

  await withAiEnvironment({
    dbQuery: async () => [],
    aiConfig: { deepseekApiKey: '' },
    activityStubs: {
      getDashboardOverview: async () => ({
      recentActivities: [],
      monthlySummary: {},
      trainingLoad: []
    })
    }
  }, async () => {
    const result = await aiService.chat({ message: '今天适合训练吗？' }, { id: 2 });

    assert.equal(result.data.role, 'assistant');
    assert.equal(result.meta.ai.provider, 'rules');
    assert.equal(result.meta.ai.contextWindowDays, 28);
    assert.match(result.data.content, /近期暂无运动记录/);
  });
});

test('aiService sends RAG context as DeepSeek system message only', async () => {
  let requestBody;
  await withAiEnvironment({
    dbQuery: ragDbQuery,
    aiConfig: {
      deepseekApiKey: 'test-key',
      deepseekModel: 'deepseek-chat',
      deepseekBaseUrl: 'https://api.deepseek.com',
      fallbackRules: true
    },
    activityStubs: {
      getDashboardOverview: async () => ({
        recentActivities: [{ id: 1, activityType: 'running', distanceM: 5000 }],
        monthlySummary: { activityCount: 1, totalDistanceKm: 5 },
        trainingLoad: [{ dailyTrainingLoad: 80, ctl: 20, atl: 35, tsb: -15 }]
      })
    },
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '今天建议恢复跑，并避开高温时段。' } }] })
      };
    }
  }, async () => {
    const result = await aiService.chat({ message: '今天适合训练吗？' }, { id: 7 });

    assert.equal(result.meta.ai.provider, 'deepseek');
    assert.equal(result.meta.ai.fallback, false);
    assert.equal(result.data.content, '今天建议恢复跑，并避开高温时段。');
    assert.equal(requestBody.model, 'deepseek-chat');
    assert.equal(requestBody.messages[0].role, 'system');
    assert.equal(requestBody.messages[1].role, 'user');
    assert.equal(requestBody.messages[1].content, '今天适合训练吗？');
    assert.match(requestBody.messages[0].content, /近期运动明细/);
    assert.match(requestBody.messages[0].content, /多云/);
    assert.match(requestBody.messages[0].content, /就绪度规则评估/);
    assert.doesNotMatch(requestBody.messages[1].content, /近期运动明细|28天运动汇总|system prompt/);
    assert.doesNotMatch(JSON.stringify(result), /近期运动明细|system prompt|28天运动汇总/);
  });
});

test('aiService falls back to rules when DeepSeek fails', async () => {
  await withAiEnvironment({
    dbQuery: ragDbQuery,
    aiConfig: {
      deepseekApiKey: 'test-key',
      fallbackRules: true
    },
    activityStubs: {
      getDashboardOverview: async () => ({
        recentActivities: [],
        monthlySummary: {},
        trainingLoad: []
      })
    },
    fetchImpl: async () => ({ ok: false, json: async () => ({}) })
  }, async () => {
    const result = await aiService.chat({ message: '最近训练负荷怎么样？' }, { id: 7 });

    assert.equal(result.meta.ai.provider, 'rules');
    assert.equal(result.meta.ai.fallback, true);
    assert.equal(result.meta.ai.contextSignals.activityCount28d, 3);
  });
});

test('aiService saves feedback without prompt content', async () => {
  const queries = [];
  await withAiEnvironment({
    dbQuery: async (sql, params = []) => {
      queries.push({ sql, params });
      if (sql.includes('INSERT INTO AiCoachFeedback')) {
        return { insertId: 42 };
      }
      return [];
    }
  }, async () => {
    const result = await aiService.submitFeedback({
      suggestionType: 'daily_brief',
      feedback: 'helpful',
      suggestionDate: '2026-06-29',
      modelVersion: 'coach-v1',
      ml: {
        provider: 'local_model',
        riskLevel: 'orange',
        loadAction: 'reduce',
        weatherRisk: 'high'
      },
      coachSystemPrompt: 'should not be stored'
    }, { id: 7 });

    assert.equal(result.data.saved, true);
    assert.equal(result.data.id, 42);
    const insert = queries.find((item) => item.sql.includes('INSERT INTO AiCoachFeedback'));
    assert.ok(insert);
    assert.equal(insert.params[0], 7);
    assert.equal(insert.params[2], 'daily_brief');
    assert.equal(insert.params[4], 'helpful');
    assert.doesNotMatch(JSON.stringify(insert.params), /should not be stored|system prompt/i);
  });
});

test('aiService feedback writes do not require CREATE privilege when tables exist', async () => {
  const queries = [];
  await withAiEnvironment({
    dbQuery: async (sql, params = []) => {
      queries.push({ sql, params });
      if (/SHOW TABLES LIKE/i.test(sql)) {
        return [{ tableName: params[0] }];
      }
      if (/CREATE TABLE/i.test(sql)) {
        const error = new Error('CREATE command denied');
        error.code = 'ER_TABLEACCESS_DENIED_ERROR';
        throw error;
      }
      if (sql.includes('INSERT INTO AiCoachFeedback')) {
        return { insertId: 43 };
      }
      if (sql.includes('INSERT INTO MorningReadinessFeedback')) {
        return { insertId: 53 };
      }
      return [];
    }
  }, async () => {
    const feedback = await aiService.submitFeedback({
      suggestionType: 'daily_brief',
      feedback: 'helpful',
      suggestionDate: '2026-06-29'
    }, { id: 7 });
    const readiness = await aiService.submitMorningReadiness({
      feedbackDate: '2026-06-30',
      readinessScore: 3,
      muscleSoreness: 'none',
      mentalState: 'normal',
      trainingWillingness: 'easy'
    }, { id: 7 });

    assert.equal(feedback.data.saved, true);
    assert.equal(readiness.data.saved, true);
    assert.ok(queries.some((item) => /SHOW TABLES LIKE/i.test(item.sql)));
    assert.equal(queries.some((item) => /CREATE TABLE/i.test(item.sql)), false);
  });
});

test('aiService rejects invalid feedback payloads', async () => {
  await assert.rejects(
    () => aiService.submitFeedback({ suggestionType: 'daily_brief', feedback: 'bad' }, { id: 7 }),
    (error) => error.code === 'INVALID_AI_FEEDBACK'
  );
});

test('aiService saves morning readiness feedback with upsert', async () => {
  const queries = [];
  await withAiEnvironment({
    dbQuery: async (sql, params = []) => {
      queries.push({ sql, params });
      if (sql.includes('INSERT INTO MorningReadinessFeedback')) {
        return { insertId: 52 };
      }
      return [];
    }
  }, async () => {
    const result = await aiService.submitMorningReadiness({
      feedbackDate: '2026-06-30',
      readinessScore: 3,
      muscleSoreness: 'mild',
      mentalState: 'normal',
      trainingWillingness: 'easy',
      note: '腿有点酸'
    }, { id: 7 });

    assert.equal(result.data.saved, true);
    assert.equal(result.data.id, 52);
    const insert = queries.find((item) => item.sql.includes('INSERT INTO MorningReadinessFeedback'));
    assert.ok(insert);
    assert.equal(insert.params[0], 7);
    assert.equal(insert.params[1], '2026-06-30');
    assert.equal(insert.params[2], 3);
    assert.equal(insert.params[3], 'mild');
    assert.equal(insert.params[4], 'normal');
    assert.equal(insert.params[5], 'easy');
  });
});

test('aiService rejects invalid morning readiness payloads', async () => {
  await assert.rejects(
    () => aiService.submitMorningReadiness({
      feedbackDate: '2026-06-30',
      readinessScore: 8,
      muscleSoreness: 'mild',
      mentalState: 'normal',
      trainingWillingness: 'easy'
    }, { id: 7 }),
    (error) => error.code === 'INVALID_MORNING_READINESS'
  );
  await assert.rejects(
    () => aiService.submitMorningReadiness({
      feedbackDate: '2026-06-30',
      readinessScore: 3,
      muscleSoreness: 'bad',
      mentalState: 'normal',
      trainingWillingness: 'easy'
    }, { id: 7 }),
    (error) => error.code === 'INVALID_MORNING_READINESS'
  );
});

test('aiService analyzes readable activities and returns 404 for missing or other users’ activities', async () => {
  await withActivityStubs({
    assertActivityReadable: async (user, id) => {
      if (user.id !== 2 || id !== 1) throw new ApiError(404, 'activity not found', 'ACTIVITY_NOT_FOUND');
    },
    getActivityById: async () => ({
      id: 1, activityType: 'running', distanceM: 5000, durationS: 1800, avgHeartRateBpm: 145
    })
  }, async () => {
    const analysis = await aiService.analyzeActivity({ activityId: 1 }, { id: 2 });

    assert.equal(analysis.meta.ai.provider, 'rules');
    assert.equal(analysis.data.headline, '跑步智能分析');
    assert.match(analysis.data.summary, /5 km/);

    await assert.rejects(
      () => aiService.analyzeActivity({ activityId: 999 }, { id: 2 }),
      (error) => error.code === 'ACTIVITY_NOT_FOUND'
    );
    await assert.rejects(
      () => aiService.analyzeActivity({ activityId: 1 }, { id: 3 }),
      (error) => error.code === 'ACTIVITY_NOT_FOUND'
    );
  });
});
