const { coachProfilePrompt } = require('./coachProfile');

const sportTerms = {
  running: /跑步|慢跑|跑量|配速|马拉松|走跑/,
  swimming: /游泳|自由泳|蛙泳|仰泳|泳姿|泳池|换气|划水/,
  strength_training: /力量|深蹲|硬拉|卧推|抗阻|举重|负重|增肌/,
  cycling: /骑行|骑车|公路车|自行车|单车|踏频|爬坡|换挡|轻挡|低挡|降挡/
};
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
let knowledgeIndex;

function tokenize(text) {
  return Array.from(segmenter.segment(text), part => part.isWordLike ? part.segment.toLowerCase() : '').filter(Boolean);
}

function searchTrainingKnowledge(question, coachRole = 'general') {
  if (!knowledgeIndex) {
    const MiniSearch = require('minisearch');
    const documents = require('../knowledge/trainingKnowledge.json');
    knowledgeIndex = new MiniSearch({
      fields: ['title', 'tags', 'text'],
      storeFields: ['title', 'sport', 'text', 'source'],
      tokenize
    });
    knowledgeIndex.addAll(documents.map(document => ({ ...document, tags: document.keywords.join(' ') })));
  }
  const mentionedSports = Object.keys(sportTerms).filter(sport => sportTerms[sport].test(question));
  const sports = mentionedSports.length ? mentionedSports : Object.hasOwn(sportTerms, coachRole) ? [coachRole] : [];
  const matches = knowledgeIndex.search(question, {
    boost: { title: 2, tags: 3 },
    filter: result => !sports.length || sports.includes(result.sport) || result.sport === 'general'
  });
  const sameSport = matches.filter(result => mentionedSports.includes(result.sport));
  return (sameSport.length ? sameSport : matches).slice(0, 3);
}

function isTrainingKnowledgeQuestion(question) {
  const asksHow = /怎么|怎样|如何|介绍|讲讲|道理|是什么|什么意思|为什么|为何|区别|要领|技巧|原则|入门|注意|解释|练法|代表什么|了解|方法/.test(question);
  const personalEvidence = /我(?:最近|近期|现在|今天|昨天|上周|曾经)|我.{0,12}(?:跑过|骑过|练过|游过|完成过)|(?:我的|本人).{0,12}(?:记录|数据|水平|配速|心率|成绩|跑者画像)|(?:基于|根据|结合).{0,8}(?:我|记录)|适合我|状态|复盘|胸闷|晕厥|疼痛|受伤/.test(question);
  return asksHow && (!personalEvidence || /(?:不|无需|不用)(?:需要)?(?:查看|查询|查|用|使用).{0,8}(?:记录|数据)/.test(question));
}

async function answerTrainingKnowledge(question, { profile, completion, aiConfig, redact }) {
  if (!isTrainingKnowledgeQuestion(question)) return null;
  const references = searchTrainingKnowledge(question, profile?.role);
  if (!references.length) return null;
  const sources = references.map(({ title, source }, index) => '[' + (index + 1) + '. ' + title + ' · ' + source.title + '](' + source.url + ')');
  const summaries = references.map(({ title, text }) => '**' + title + '**\n\n' + text).join('\n\n');
  let response;
  const online = Boolean(aiConfig.agentUseDeepseek && aiConfig.deepseekApiKey);
  if (online) {
    try {
      response = await completion([
        { role: 'system', content: [
          '你是 SpAgent 的运动知识助手。根据以下检索片段回答原问题，解释适用范围，尽量给可实践的训练提示。',
          '每条核心主张使用 [1] 等标号指向片段。资料缺失时说明，不编造来源、链接、精确数字、伤病诊断或个性化处方。',
          coachProfilePrompt(profile, redact),
          ...references.map(({ title, text }, index) => '[' + (index + 1) + '] ' + title + '\n' + text)
        ].join('\n\n') },
        { role: 'user', content: redact(question) }
      ], { includeModel: true, maxTokens: 500, deadlineMs: 15000, disableThinking: true });
    } catch {
      response = null;
    }
  }
  const content = typeof response?.content === 'string' && !/https?:|www\./i.test(response.content)
    ? response.content.trim().slice(0, 2500) : '';
  return {
    content: (content || summaries) + '\n\n**参考资料**\n\n' + sources.map(source => '- ' + source).join('\n'),
    cards: [{ type: 'tool_status', tool: 'search_training_knowledge', status: 'completed', summary: '已检索 ' + references.length + ' 条可追溯的训练资料。' }],
    meta: { answerProvider: content ? 'deepseek' : 'knowledge', ...(content && { model: response.model }), fallback: Boolean(online && !content) }
  };
}

module.exports = { searchTrainingKnowledge, isTrainingKnowledgeQuestion, answerTrainingKnowledge };
