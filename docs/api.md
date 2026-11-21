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

首页运动概览使用 `GET /dashboard/overview?view=today`，只读取最近运动和训练负荷。健康度使用 `GET /training/load-balance`。跑力、五力与训练指数使用 `GET /training/performance-profile`（纯规则与统计引擎，无外部 Python ML 依赖）。趋势页使用 `GET /stats/metric-trends`，返回各指标到有样本自然日 `{ date, value }` 的映射；既有单指标接口仍提供关联活动和样本数。

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

## AI 教练工作台

| 方法与路径 | 行为 |
| --- | --- |
| `GET /agent/conversations?before=...` | 返回本人的会话与 `nextBefore`，每页最多 20 条 |
| `POST /agent/conversations` | 创建一个会话，返回 201 |
| `GET /agent/conversations/:id/messages?before=...` | 返回本会话的消息与 `nextBefore`，每页最多 40 条，从旧到新排序 |
| `POST /agent/conversations/:id/messages` | 提交一轮消息，返回本轮用户和教练消息 |
| `POST /agent/actions/:id/confirm` | 确认待审批草案，返回动作的实际状态和已保存计划 ID |
| `POST /agent/actions/:id/reject` | 拒绝待审批草案，返回动作状态 |
| `POST /agent/conversations/:id/messages/stream` | SSE 流式发送消息（支持 JSON 与 multipart 附件），依次推送 `status`、`card`、`delta`、`followups`、`proposal_ready`、`done` / `error` 事件，支持客户端主动中止 |
| `GET /agent/context-pulse` | 读取当前登录用户的动态欢迎脉搏（分时段问候、实时生理指标胶囊与数据感知快捷提问，30 秒按账号 LRU 缓存） |
| `PATCH /agent/conversations/:id` | 重命名当前登录用户的指定对话 |
| `DELETE /agent/conversations/:id` | 删除当前登录用户的指定对话（级联清理消息与待审批动作） |
| `GET /agent/memories` | 读取当前登录用户的教练长期记忆列表 |
| `POST /agent/memories` | 手动添加一条教练长期记忆（`category`、`content`） |
| `DELETE /agent/memories/:id` | 删除当前登录用户指定的教练长期记忆 |

发送消息时，客户端填入 `message`（1–1000 字符）和 `clientMessageId`（UUID v4）。因网络问题重试时复用 UUID 和内容。相同消息会重放已保存结果，同一进程还会合并进行中的同键请求。复用 UUID 提交不同内容返回 409 `AGENT_MESSAGE_CONFLICT`。另一条消息先写入会话而当前请求还在生成时，服务端返回 409 `AGENT_CONVERSATION_UPDATED`。客户端应重新读取最新会话并允许重试。消息的 `cards` 可包含 `clarification`、`tool_status`、`evidence`、`plan_draft` 和 `plan_diff`。回复正文使用 `content`。教练会话创建与消息提交合并限制为每账号每分钟 20 次。

草案在会话中保存为待审批动作，有效期 30 分钟。动作状态可为 `proposed`、`applied`、`rejected`、`expired`、`failed`。确认和拒绝使用登录账号归属与数据库锁；重复处理返回已有状态。只有 `applied` 返回已创建计划的 `planId`。如果一个预定直接启用的草案遇到另一个已启用计划，服务端返回 `failed` 和 `ACTIVE_TRAINING_PLAN_EXISTS`，已有计划继续执行。已有执行中计划时生成的新草案，确认后保存为独立草稿。读取或操作他人会话、动作返回 404。

统一对话可查询个人运动记录、回答训练问题和提议调整计划。启用 DeepSeek 后，Vercel AI SDK 的 `ToolLoopAgent` 使用当前问题、至多四条允许的历史消息和本轮工具结果，最多调用模型四步，模型运行超时为 22 秒。可用工具覆盖本人运动、同距离水平、训练与恢复汇总、训练知识。个人水平、趋势和恢复在模型分析前读取相应数据，查询账号从服务端鉴权取得。外发摘要省略账号标识与 GPS 轨迹，消息中的常见凭证和邮箱格式会被遮盖。`meta.answerProvider` 标明正文来源，`meta.modelSteps` 和 `meta.model` 记录已完成的模型调用步数和实际模型标识。 [ToolLoopAgent 文档](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)

个人跑步水平默认复盘账号的完整实际跑步历史。先根据代表成绩给出评估，再展示记录跨度、跑步天数、累计距离、长距离次数和各距离区间的依据。最近一条记录标记数据更新到哪天。指定距离时支持最多六项，每项使用目标距离 ±2% 内的整段运动。指定时段会约束最近一次、各距离参考和覆盖统计。用户可以跨话题明确回到原统计，服务端最多向前查找 12 条归属同一会话的消息，在线模型仍最多收到四条经过筛选和遮盖的文字记录。补充的比赛用时只绑定到明确的距离。用户询问人群排名时，按可比人群成绩数据的可用性说明排名边界。

趋势和恢复分析排除演示数据。跑步建议遇到近期无跑步记录时会查询本人完整跑步历史，明确显示历史跨度和最近实际跑步。趋势在所问窗口无记录时可补充历史，明确限定日期的统计仍按原时间范围展示。单独查询睡眠时长、睡眠评分、HRV 或静息心率时，按指定日期或时段读取相应指标。跨项目训练建议会先获取对应专项数据。通用技术问题只读取本地训练资料。

计划意图识别可调用一次结构化模型，并在 `meta.intentProvider` 中标明来源。服务端检查意图字段和允许的工具，通过本地规则生成并校验四周草案。在启用回退的配置下，在线模型失败会使用本地规则。

「最近 N 次」按指定运动类型查询最新历史，范围为 1–20 条。用户可附加日期、自然周或其他时间段。常规统计和活动列表由服务端生成，包含演示记录时标明条数。「只算真实记录」会过滤演示记录，连续追问可沿用该条件。查到零条记录与数据源暂不可用使用不同响应。教练可承接上一轮的范围、运动类型和条数，并重新查询。需要解读的记录请求通过同一框架，最多调用模型三步。个人分析的日期、次数、时间和里程由服务端计算。模型输出需要通过格式、证据工具和正文校验。

消息可选 `coachRole` 和 `coachInstructions`。角色包括 `general`、`running`、`swimming`、`strength_training`、`cycling`。自定义指令最多 1500 字，用于回答偏好。通用运动技术问题按提问和角色从本地资料库检索，参考链接由服务端提供。

附件消息沿用同路由，使用 `multipart/form-data`，单文件字段名为 `attachment`，最多 8 MB。支持 JPEG、PNG、GIF、WebP、UTF-8 Markdown/文本和 PDF，可省略消息正文。重复提交同一消息 ID 时，内容、偏好和附件应一致。文本 PDF 最多提取 30 页及 16,000 字，扫描或图表 PDF 每次最多分析 4 张页图。后端只保留文件名、问答和依据，不保存原始文件。附件内容只用于当轮解读，历史答案不会自动回传给模型。

## 本地 MCP 接入

官方 SDK 通过 stdio 提供 7 个鉴权只读工具：`list_my_activities`、`summarize_my_activities`、`get_my_performance_evidence`、`get_my_recovery_context`、`get_my_athlete_profile`、`analyze_my_activity_telemetry` 和 `get_my_training_plans`。MCP 客户端直接运行 `node <后端绝对路径>/scripts/spagentMcp.js`，通过进程环境变量 `SPAGENT_MCP_TOKEN` 传入有效的 SpAgent 登录令牌。可用 Node 的 `--env-file` 指定后端私有运行配置。每次调用校验账号，与 App 共享同一套只读业务服务，MCP 客户端无法提交计划审批。

## 马拉松赛事爬虫与用户目标赛事

| 方法与路径 | 行为 |
| --- | --- |
| `GET /explore/events` | 返回自动爬虫入库的国内未来半程/全程马拉松赛历，支持 `category=all\|full\|half`、`city`、`days`、`limit` 与 `featured=true`（主页按日期精选） |
| `POST /explore/events/refresh` | 需登录；手动触发一次爬虫同步（60 秒冷却防抖，解析为空或源站异常时保留现有 MySQL 缓存） |
| `GET /explore/my-events` | 需登录；读取当前账号保存在 MySQL `UserMarathonEvents` 的目标赛事列表 |
| `POST /explore/my-events` | 需登录；保存或更新一条目标赛事（按 `(user_id, event_key)` 幂等写入，自动同步至 AI 教练上下文） |
| `DELETE /explore/my-events/:id` | 需登录；删除当前账号指定的目标赛事 |

## 公共运行时配置与注册防护

`GET /system/public-config` 无需登录，返回：

```json
{
  "auth": { "allowPublicRegistration": true, "inviteCodeRequired": false },
  "maps": { "amap": { "key": "...", "serviceHost": "", "securityCode": "" } }
}
```

- 当 `ALLOW_PUBLIC_REGISTRATION=false` 时，`POST /auth/register` 返回 `403 REGISTRATION_DISABLED`；当配置 `REGISTRATION_INVITE_CODE` 时，须在请求体提供匹配的 `inviteCode`（服务端使用 SHA-256 + 常量时间比较），否则返回 `403 INVALID_INVITE_CODE`。
- 当生产环境配置了 `AMAP_SERVICE_HOST`（Nginx 反向代理高德 `/_AMapService/`）时，服务端自动省略原始 `securityCode` 下发；未配置 `AMAP_JS_API_KEY` 时前端自动降级为高精度 SVG 配速轨迹渲染。

## 运动贡献热力图

`GET /stats/heatmap` 需登录，严格按当前登录账号（`req.user.id`）聚合自然日运动汇总，支持参数 `year=rolling|YYYY`（默认 `rolling` 近 365 天）与 `activity_type`（可选）。返回 `{ range, availableYears, summary: { activeDays, totalCount, totalDistanceKm, totalDurationMin, totalCalories, totalLoad, longestStreak, currentStreak, latestActiveDate }, days: [{ date, count, distanceKm, durationMin, calories, load }] }`。

## AI 教练联网天气与公开检索工具

AI 教练内置两个 SSRF 白名单隔离的只读在线工具（`backend/src/services/coachOnlineService.js`）：

- `get_live_weather_and_aqi`：优先查询中国气象局（CMA）实时观测与预报并结合 Open-Meteo 空气质量（US AQI / PM2.5 / PM10），回退至 Open-Meteo 全球预报，输出跑步适宜度评估与穿衣/配速建议（15 分钟缓存）。
- `web_search`：受 `AGENT_WEB_SEARCH_ENABLED` 控制，自动脱敏邮箱、手机号与密钥格式，优先使用可选的 `TAVILY_API_KEY`，未配置时零密钥回退至公开搜索引擎检索（10 分钟缓存）。

生成跑步计划时，本轮目标和训练日分别优先。缺少某项时，明确请求制定计划的消息可以复用该账号保存的对应偏好，草案依据标注来源。使用保存偏好的请求由本地规则处理。

缺少关键计划参数时，教练返回 `clarification` 卡。卡片包含需要补充的 `fields`、ISO 8601 格式的 `expiresAt`，以及 `choices`（每项含 `label` 和 `message`）。点击选项通过同一个消息接口提交对应 `message`。澄清记录只对当前会话最新一轮生效，每次请求补充后保留 30 分钟，最多追问两轮。用户可以补充缺项、选「按默认安排」或取消。刷新后会恢复有效的澄清卡。补充时沿用本轮已明确的目标、训练日、频率、开始日和时长上限。结构化澄清状态留在服务端。用户确认草案后才写入计划。

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
