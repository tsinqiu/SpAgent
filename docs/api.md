# SpAgent 计划与教练接口

基础地址为 `/api`。以下接口从 Bearer JWT 获取当前用户。返回形式为 `{ "data": ..., "meta": {} }`，错误为 `{ "error": { "code": "...", "message": "..." } }`。

## 训练计划与任务

| 方法与路径 | 行为 |
| --- | --- |
| `GET /training/today` | 按北京时间返回当前账号的启用计划和当天的训练任务 |
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

今日任务返回 `{ date, plan, session }`。账号停用或未认证的状态由鉴权处理；没有活动计划时 `plan` 与 `session` 均为 `null`，活动计划当天休息或尚未开始时只有 `session` 为 `null`。已完成任务可带对应的 `activityId`。服务端以当前账号与当天日期查询。

写入已有计划时请求体必填详情返回的整数 `version`。成功修改后应使用新版本。并发修改返回 409 `TRAINING_PLAN_VERSION_CONFLICT`。已有执行中计划时，再激活返回 409 `ACTIVE_TRAINING_PLAN_EXISTS`。任务状态有 `pending`、`completed`、`skipped`。已完成或跳过的任务在编辑课表时保留标题、日期和指标，可在任务入口主动撤销状态。归档计划只读，其他用户的计划或任务与缺失记录统一返回 404。

## 训练上下文

`GET /training/context` 返回 `asOf`、`timeZone` 与两个 `windows`。时间窗按 `Asia/Shanghai` 的本地日期向前数 7 和 28 天，包含当天。

- `running` 含跑步次数、跑步日数、总距离（米）、平均配速（秒每公里）、负荷、最近观测日期，以及各指标的样本数和合成记录数。配速是有效单次配速的算术平均。
- `recovery` 分别给出睡眠评分、睡眠时长（秒）、HRV 与静息心率的均值、样本数、最近观测日期和合成样本数。没有观测的指标返回 `null`。

首页运动概览使用 `GET /dashboard/overview?view=today`，只读取最近运动和训练负荷。健康度使用 `GET /training/load-balance`。趋势页使用 `GET /stats/metric-trends`，返回各指标到有样本自然日 `{ date, value }` 的映射；既有单指标接口仍提供关联活动和样本数。

## 训练周报

`GET /training/weekly-report` 返回当前账号的只读周报。可传 `week_start=YYYY-MM-DD` 指定往周的周一，省略时使用北京时间当前周。无效日期、周中日期和未来周返回 400 `INVALID_QUERY`。

- `startDate`、`endDate` 和 `asOf` 标记报告范围与统计日期。 `previousWeekStart`、`nextWeekStart` 和 `currentWeekStart` 用于切周，无法继续时相应方向返回 `null`。
- `actual` 返回运动次数、运动天数、时长（秒）、距离（米）、各指标样本数和合成运动数。`days` 固定返回周一至周日的 7 条汇总。当周实际运动只统计到 `asOf`。没有观测的时长与距离返回 `null`。
- `sessions` 返回启用中计划的安排，以及归档计划中已完成或跳过的记录。每项含计划和任务的归属信息、安排日期、状态，可用时附关联的 `activityId`。
- `trend` 从旧到新返回最多四个自然周，以所选周为终点。每周含日期范围、`isPartial`、运动汇总 `actual`，以及 `execution` 中的 `completed`、`skipped`、`overdue`、`upcoming` 和 `archivedResults` 计数。当日仍待完成及之后的任务归入 `upcoming`。归档计划按已完成和已跳过的记录计入。

`GET /training/weekly-guidance` 返回当前账号本周的规则建议，以及下周日期范围和证据。包括 `asOf`、`ruleVersion`、`execution`、近 7/28 天的 `windows`、近 7 天的 `recovery`。结果 `kind` 为 `maintain`、`needs_data`、`reduce` 或 `applied`。当天尚待完成及未来的任务暂不计入完成情况。

当 `previewAvailable` 为真时，教练可通过既有消息接口提交「预览 YYYY-MM-DD 周报的下周训练调整」，其中日期为 `weekStart`。服务端重新读取该账号最新数据。仍符合规则时生成 `plan_diff` 和待确认动作。确认时校验计划版本、任务状态及下周日期范围。同一账号的同一份计划，每周的周报调整只允许应用一次。

## 训练偏好

| 方法与路径 | 行为 |
| --- | --- |
| `GET /training/preferences` | 读取登录账号的默认目标和训练日 |
| `PUT /training/preferences` | 用完整表单保存或替换偏好 |
| `DELETE /training/preferences` | 清除登录账号的偏好 |

响应及保存请求的字段为 `goalType` 和 `weekdays`。目标可填 `first_5k`、`regular_running` 或 `null`。训练日以周一为 1、周日为 7，填写 2 至 4 个不同的整数或空数组。空结果为 `{"goalType":null,"weekdays":[]}`。重复保存与清除可以安全重试。无效字段返回 400 `INVALID_TRAINING_PREFERENCES`。

## 训练提醒

| 方法与路径 | 行为 |
| --- | --- |
| `GET /training/reminders/preferences` | 读取登录账号的 `dailyTraining` 和 `weeklyReport` 开关，默认为 `false` |
| `PUT /training/reminders/preferences` | 保存两个布尔开关，缺少字段或类型无效返回 400 `INVALID_REMINDER_PREFERENCES` |
| `GET /training/reminders` | 返回 `{ asOf, reminders }`。今日待完成任务的 `kind` 为 `daily_training`，含 `planId`、`sessionId` 和 `sessionTitle`。上周回顾的 `kind` 为 `weekly_report`。两种提醒均包含 `id` 和 `periodStart` |
| `POST /training/reminders/:id/dismiss` | 关闭这一条提醒，同账号可重试，其他账号或不存在的 ID 返回 404 `REMINDER_NOT_FOUND` |

「今日」读取时根据北京时间计算当日及上一个完整自然周，只为开启的提醒保存一条对应周期记录。今日提醒只针对启用中计划里的待完成任务。上周复盘需要至少一条上周运动记录或已完成、已跳过的训练。跨天或跨周后自然过期，关闭开关和归档计划影响下一次读取。提醒在应用内展示。

## 教练计划助手

| 方法与路径 | 行为 |
| --- | --- |
| `GET /agent/conversations?before=...` | 返回本人的会话与 `nextBefore`，每页最多 20 条 |
| `POST /agent/conversations` | 创建一个会话，返回 201 |
| `GET /agent/conversations/:id/messages?before=...` | 返回本会话的消息与 `nextBefore`，每页最多 40 条，从旧到新排序 |
| `POST /agent/conversations/:id/messages` | 提交一轮消息，返回本轮用户和教练消息 |
| `POST /agent/actions/:id/confirm` | 确认待审批草案，返回动作的实际状态和已保存计划 ID |
| `POST /agent/actions/:id/reject` | 拒绝待审批草案，返回动作状态 |

发送消息时，客户端填入 `message`（1–1000 字符）和 `clientMessageId`（UUID v4）。因网络问题重试时复用 UUID 和内容。相同消息会重放已保存结果，同一进程还会合并进行中的同键请求。复用 UUID 提交不同内容返回 409 `AGENT_MESSAGE_CONFLICT`。另一条消息先写入会话而当前请求还在生成时，服务端返回 409 `AGENT_CONVERSATION_UPDATED`。客户端应重新读取最新会话并允许重试。消息的 `cards` 可包含 `clarification`、`tool_status`、`evidence`、`plan_draft` 和 `plan_diff`。回复正文使用 `content`。教练会话创建与消息提交合并限制为每账号每分钟 20 次。

草案在会话中保存为待审批动作，有效期 30 分钟。动作状态可为 `proposed`、`applied`、`rejected`、`expired`、`failed`。确认和拒绝使用登录账号归属与数据库锁；重复处理返回已有状态。只有 `applied` 返回已创建计划的 `planId`。如果一个预定直接启用的草案遇到另一个已启用计划，服务端返回 `failed` 和 `ACTIVE_TRAINING_PLAN_EXISTS`，已有计划继续执行。已有执行中计划时生成的新草案，确认后保存为独立草稿。读取或操作他人会话、动作返回 404。

默认执行本地规则。可选模型只接收本轮输入文本，最多一次结构化分类。模型输出经过字段校验和工具白名单检查。规则生成器生成四周候选，再通过训练计划校验。模型调用失败或返回无效输出时使用本地规则。

生成跑步计划时，本轮目标和训练日分别优先。缺少某项时，明确请求制定计划的消息可以复用该账号保存的对应偏好，草案依据标注来源。使用保存偏好的请求由本地规则处理。

缺少关键计划参数时，教练返回 `clarification` 卡。卡片包含需要补充的 `fields`、ISO 8601 格式的 `expiresAt`，以及 `choices`（每项含 `label` 和 `message`）。点击选项通过同一个消息接口提交对应 `message`。澄清记录只对当前会话最新一轮生效，每次请求补充后保留 30 分钟，最多追问两轮。用户可以补充缺项、选「按默认安排」或取消；刷新后会恢复有效的澄清卡。补充时沿用本轮已明确的目标、训练日、频率、开始日和时长上限，澄清记录不会写入跨会话偏好或传给 DeepSeek。用户确认草案后才写入计划。

## 私有照片

`GET /activities/:id/photo` 校验运动读取权限，`GET /shoes/:id/photo` 只允许跑鞋所属账号读取。两者均使用 `Authorization: Bearer …`，成功时返回图片字节和 `Cache-Control: private, no-store`。缺少凭证返回 401，跨账号或图片不存在返回 404。上传接口和旧数据中的 `photoPath` 保留，客户端使用照片 API 读取本机上传文件。

`GET /community/posts/:id/image` 使用动态的可见范围。公开图片可匿名读取，关注者可见的图片仅供作者和关注者查看，私密图片仅供作者查看，其他情况返回 404。

`/uploads/activity-images/` 与 `/uploads/shoe-images/` 下的文件停止静态访问。已公开的社区图片保留兼容地址，读取时校验动态仍是公开状态。探索图片及视频继续通过静态路径提供。反向代理把 `/uploads/` 转发给 Express，由后端判断公开范围。使用仓库的单层本机 Nginx 配置时，后端设置 `HOST=127.0.0.1` 和 `TRUST_PROXY=true`，以使限流识别原始客户端 IP。

## 执行反馈与修订

| 方法与路径 | 行为 |
| --- | --- |
| `POST /sync/fit` | multipart 字段 `fit`，单个文件上限 8 MB。返回 201，包含 `importedCount`、`activityIds`、`matching`（自动关联、跳过、错误的数量） |
| `GET /activities/:id/plan-execution` | 查询自己的活动关联结果，或可手动选择的训练任务 |
| `GET /training-sessions/:id/activity-candidates` | 选取同账号、可关联、任务日前后 7 天内的跑步记录 |
| `POST /training-sessions/:id/link-activity` | 提交正整数 `activityId` 和计划 `version`。同一组合重试返回原结果 |
| `GET /training-plans/:id/revisions?before=...` | 返回计划的最新修订或更早分页，每页最多 20 条 |

活动与计划任务一对一。自动匹配使用同日唯一的有效跑步与执行中计划的同日待训练任务，要求实际距离及时长为正，且至少有一项可比目标。设置了距离和时长时，允许偏差分别为 30% 和 35%。在关联时保存计划/实际快照，正差表示实际值较大，缺少任一测量值的差返回 `null`。配速按时长与距离计算，单位为秒/公里。活动原记录删除后快照仍可查看。

教练的改期及减量使用本地规则，并可查询执行情况与可用恢复数据。调整方案通过 `plan_diff` 卡返回前后值、理由和待确认动作。改期限定在同一训练周的空闲日，减量范围为单次目标的 5% 至 30%。在同一事务内校验旧版本、更新待训练任务、记入 `PlanRevisions` 并完成审批。已有变更时返回动作 `failed`，`failureCode` 为 `TRAINING_PLAN_VERSION_CONFLICT`。所有读取和写入按登录账号限制。

## Garmin 后台同步

`POST /sync/jobs` 以 `{"provider":"garmin","jobType":"manual_sync"}` 提交任务，返回 202 和任务对象。同一账号正在排队或执行时，再次提交返回原任务。未绑定 Garmin 时返回 400 `GARMIN_ACCOUNT_NOT_CONNECTED`。任务进入 MySQL 后由后端进程执行。

`GET /sync/jobs/:jobId` 返回当前账号的任务状态，其他账号和缺失任务返回 404 `SYNC_JOB_NOT_FOUND`。状态包括 `queued`、`running`、`success`、`failed` 和历史记录使用的 `skipped`。返回 `activityCount`、`requestedAt`、`startedAt`、`finishedAt` 和 `errorMessage`。页面每两秒读取进行中的任务，离开后服务继续执行，再进入时从最近记录恢复。

工作进程每 15 秒续约 60 秒租约。进程中断后，后续运行实例可以接管过期任务，总尝试次数最多两次。活动按当前账号和 Garmin 外部 ID 或 FIT 指纹去重，健康摘要按账号和日期更新。
