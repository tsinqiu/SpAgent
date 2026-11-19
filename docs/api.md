# 阶段 1 接口

基础地址为 `/api`。以下接口从 Bearer JWT 获取当前用户。返回形式为 `{ "data": ..., "meta": {} }`，错误为 `{ "error": { "code": "...", "message": "..." } }`。

## 训练计划与任务

| 方法与路径 | 行为 |
| --- | --- |
| `GET /training-plans` | 返回本人的计划列表，含周次摘要、进度和版本 |
| `GET /training-plans/:id` | 返回计划和周历，每周含 7 天，包含休息日 |
| `POST /training-plans` | 保存草稿，返回 201 |
| `PUT /training-plans/:id` | 保存完整的计划和任务安排，含当前版本 |
| `POST /training-plans/:id/activate` | 激活草稿，每用户最多一个执行中计划 |
| `POST /training-plans/:id/archive` | 归档计划，保留任务状态供查看 |
| `DELETE /training-plans/:id` | 删除草稿及其任务 |
| `PATCH /training-plans/:id/sessions/:sessionId` | 提交 `version` 和 `status` 更新执行中计划的指定任务 |

创建示例使用一周自定义跑步。数组位置按 `startDate` 起算，每周七个本地自然日，空对象代表休息日。

```json
{
  "name": "本周轻松跑",
  "type": "running",
  "goalType": "custom",
  "goal": "建立规律",
  "startDate": "2026-11-23",
  "weeks": [
    {
      "phase": "基础周",
      "days": [
        {"title": "轻松跑", "type": "easy", "durationS": 1200},
        {},
        {"title": "常规有氧", "type": "aerobic", "distanceM": 2500},
        {}, {}, {}, {}
      ]
    }
  ]
}
```

`goalType` 支持 `first_5k`、`regular_running`、`custom`。前两者固定四周，每周使用相同的 2–4 个训练日。自定义及继承模板可包含 1–24 周，兼容跑步、骑行和游泳。任务支持可选的 `subtitle`、`note`、`distanceM`、`durationS`，类型为 `easy`、`aerobic`、`recovery` 或 `other`。服务端按起始日期和数组位置计算每项任务日期。详情包含 `availableWeekdays`（周一为 1）和 `weeklyFrequency`（周间次数不同时为 `null`）。

写入已有计划时请求体必填详情返回的整数 `version`。成功修改后应使用新版本。并发修改返回 409 `TRAINING_PLAN_VERSION_CONFLICT`。已有执行中计划时，再激活返回 409 `ACTIVE_TRAINING_PLAN_EXISTS`。任务状态有 `pending`、`completed`、`skipped`。已完成或跳过的任务在编辑课表时保留标题、日期和指标，可在任务入口主动撤销状态。归档计划只读，其他用户的计划或任务与缺失记录统一返回 404。

## 训练上下文

`GET /training/context` 返回 `asOf`、`timeZone` 与两个 `windows`。时间窗按 `Asia/Shanghai` 的本地日期向前数 7 和 28 天，包含当天。

- `running` 含跑步次数、跑步日数、总距离（米）、平均配速（秒每公里）、负荷、最近观测日期，以及各指标的样本数和合成记录数。配速是有效单次配速的算术平均。
- `recovery` 分别给出睡眠评分、睡眠时长（秒）、HRV 与静息心率的均值、样本数、最近观测日期和合成样本数。没有观测的指标返回 `null`。
