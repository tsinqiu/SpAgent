const chestDiscomfort = /胸(?:口|部|前区)?(?:发|有些|有点)?(?:疼(?:痛)?|痛|闷|紧|压迫(?:感)?|压榨(?:感)?|不适)/;
const acuteCompanion = /头晕|发晕|眩晕|眼前发黑|(?:要|快要|差点)?晕倒|晕厥|呼吸困难|气短|喘不(?:过|上)气/;
const symptom = `(?:${chestDiscomfort.source}|${acuteCompanion.source})`;
const deniedSymptoms = new RegExp(
  `(?:没有|并无|并未|未出现|从未有过|没(?:有)?|不|无)(?:任何|伴随|感觉到|出现|觉得)?\\s*${symptom}` +
  `(?:\\s*(?:、|和|或|及|以及)\\s*${symptom})*`,
  'g'
);

function urgentExerciseWarning(message) {
  const text = message.normalize('NFKC').replace(deniedSymptoms, '');
  if (!chestDiscomfort.test(text) || !acuteCompanion.test(text)) return null;
  return '请立即停止运动并联系当地急救服务。请身边的人协助，避免自行驾车或继续训练。';
}

const secretSubject = /数据库.{0,8}(?:密码|口令|凭据|连接串|连接字符串|访问令牌)|(?:系统|服务端|后台|管理员|开发者).{0,5}(?:密钥|密码|令牌)|\b(?:DB_PASSWORD|JWT_SECRET|DATABASE_URL|[A-Z]+_API_KEY)\b|(?:内部|隐藏|系统|开发者)(?:原始)?(?:提示词|指令|配置)/i;
const seekValue = /查|给|告诉|知道|显示|输出|打印|发来|提供|读取|查看|访问|导出|获取|取出|是什么|多少|列出|透露|复述|索要|show|print|reveal/i;
const foreignOwner = /(?:其他|其它|别的|另一个|另一位|隔壁|其他任意|未授权(?:的)?|他人)(?:的)?(?:账[号户]|用户|人|队员|选手)|(?:别人的|他人的)|(?:全站|所有|全部)用户|(?:账[号户]|用户)之外|跨账[号户]/;
const personalData = /记录|数据|课表|训练计划|跑量|里程|时长|距离|用时|配速|成绩|心率|睡眠|训练负荷|档案|资料|历史训练|运动历史/;

function coachAccessWarning(message) {
  const text = message.normalize('NFKC');
  if (secretSubject.test(text) && seekValue.test(text)) {
    return '我无法提供系统凭据、隐藏指令或内部配置。';
  }
  if (!foreignOwner.test(text) || !personalData.test(text)) return null;
  const clauses = text.split(/[，,；;。！？?!\n]/);
  const foreignRead = clauses.some(clause => {
    const owner = foreignOwner.exec(clause);
    if (!owner || !personalData.test(clause)) return false;
    if (/(?:没有|不用|不要|不看|不查|别查|不要查|只查本人|排除).{0,8}$/.test(clause.slice(0, owner.index))) return false;
    return seekValue.test(clause) || /看|浏览|核对|对照|放在一起|拿走|借用|同步|汇总|转发|切换|替换/.test(clause);
  });
  const proxyRead = /(?:授权|代理|代替|替.{0,10}(?:办理|操作))/.test(text) &&
    clauses.some(clause => /(?:他|她|对方|那位|该用户)(?:的|以前|之前|最近)/.test(clause) && personalData.test(clause) && seekValue.test(clause));
  if (!foreignRead && !proxyRead) return null;
  return '我只能查询当前登录账号的运动和恢复记录以及个人训练计划。';
}

module.exports = { urgentExerciseWarning, coachAccessWarning };
