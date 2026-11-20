function urgentExerciseWarning(message) {
  const text = message.normalize('NFKC').replace(/(?:没有|并无|未出现|从未有过|不|无)(?:任何)?\s*(?:胸(?:口|部)?(?:疼|痛|闷|压迫感)|头晕|发晕|眩晕|要晕倒|晕厥)/g, '');
  const chestSymptoms = /胸(?:口|部)?(?:疼|痛|闷|压迫感)/.test(text);
  const accompanyingSymptoms = /头晕|发晕|眩晕|要晕倒|晕厥|呼吸困难|气短|喘不过气/.test(text);
  if (!chestSymptoms || !accompanyingSymptoms) return null;
  return '请立即停止运动并联系当地急救服务。请身边的人协助，避免自行驾车或继续训练。';
}

module.exports = { urgentExerciseWarning };
