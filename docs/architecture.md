# SpAgent 阶段 0 架构与基线审计

## 来源与快照边界

以 [MotionCare main `673887bedb63460bbf966a703558ee1d5ac55e77`](https://github.com/tsinqiu/MotionCare/tree/673887bedb63460bbf966a703558ee1d5ac55e77) 的提交树为来源。本地 MotionCare 工作树有单独的前端锁文件修改，快照按提交中的内容提取。SpAgent 使用独立 Git 历史，保留原有包名、页面风格、业务路由、锁文件、测试及 Android 源码。上游提交树未找到仓库级许可证文件。

| 范围 | 处理方式 |
| --- | --- |
| 应用与工具 | 保留前端 Web/PWA、Capacitor/Android 源码和启动脚本，保留 Express API、Node 测试、Python Garmin/FIT 解析及模型训练源码 |
| 数据库 | 使用独立 MySQL 回放上游 `01、05、06、07、14、15、16、17、18、19`，提取 37 张表的最终 DDL，保留源表名大小写及外键、索引；初始化脚本只处理空库 |
| 个人数据和运行产物 | 排除已跟踪的 368 个 FIT/JSON 活动文件、共享 SQL 和图片压缩包、约 82 MB 的 SQL 转储、上传和用户资产目录、模型产物、含用户级条目的 FitRec 报告、凭证、日志及历史提交 |
| 历史部署 | 会清库的初始化及共享数据导入导出脚本不进入快照。移除 Android 工具链和签名对原项目绝对路径的依赖。Garmin 页面改用项目现有图标库中的图标 |

## 实际模块与复用决策

| 现有能力 | 源码与存储 | 决策 |
| --- | --- | --- |
| 登录、账号与风控 | Express middleware、`authService`、`securityService`；`Users`、`LoginAttempts`、`SecurityEvents` | 复用 bcrypt、JWT、限流、错误响应和服务端鉴权。开发管理员脚本只操作配置指定的账号 |
| 运动、轨迹、分段、统计 | `activityService`、`dashboardRoutes`、`statsRoutes`；`Activities`、`ActivitySummaries`、`TrackPoints`、`Laps`、`ActivityZones` | 复用用户范围的查询、运动负荷和原有视图。手工活动写入适配最终表结构，原表单快照存于汇总表 |
| 运动记录与扩展模块 | `workoutService`、跑鞋、社区、设置和探索；`WorkoutSessions`、`WorkoutTrackPoints` 等 | 保留原有实时记录和扩展 API，`WorkoutSessions` 表示实时采集过程 |
| Garmin 与 FIT | `syncService` 及 `database/scripts` 的下载、FIT 和健康转换；`SyncProviderConnections`、`SyncJobs`、`SyncLogs` | 复用下载和转换，生成 SQL 由调用方指定库。首次导入日期、活动归属及去重需要后续建设 |
| 健康与恢复 | `healthService`；日汇总、睡眠汇总、HRV/心率/压力/步数样本和训练状态表 | 复用按用户查询及可用性处理，下一阶段将来源、时间窗和缺失指标汇总为训练上下文 |
| AI 与训练评分 | `aiService`、`coachMlService`、`performanceProfileService`；`AiCoachFeedback`、`MorningReadinessFeedback` | 保留 DeepSeek 可选、规则回退和表现评分，活动解读复用活动归属校验。聊天和计划目前没有服务端持久化 |
| 训练计划与日历 | `TrainingPlans.vue`、`trainingPlanTemplates.js`、`localStorage`；`/api/training/load-balance` | 复用界面、训练模板和负荷查询。阶段 1 新建计划与任务存储及 API，阶段 2 再加入工具编排和审批 |

运行栈是 Vue 3、Vite、Vant、ECharts 和 Axios；后端是 Node.js 22+、Express 5、mysql2；可选 Python 环境包括 Garmin Connect/curl_cffi，以及 joblib、NumPy、scikit-learn 和 mysql-connector-python。依赖版本由各自 lockfile 和 requirements 管理。

## 数据流与权限

Garmin 下载端输出 FIT 和健康 JSON，Python 转换为结构化 SQL，后端按配置数据库执行并记录同步状态。活动距离以米、时长以秒，UTC 时间与设备本地开始时间分字段存储。运动列表、详情和统计按所属用户筛选；管理员在管理视图保留显式跨用户查询。健康查询使用登录用户的 ID。教练可从同一套数据获得训练与恢复摘要，配置 DeepSeek 密钥后，提示词中会带上近期摘要，启用云端前应明确展示处理范围。

已识别的后续工作：

- Garmin 首次同步在没有历史记录时可跳过下载。外部活动 ID 的查重是全局的，活动入库和补写归属分步执行。后续应使用用户与外部 ID（或导入指纹）构成幂等键，并在事务中写入归属。查询来源白名单也需要覆盖同步写入的 `garmin_sync`。
- 现有 AI/表现画像带有无归属旧记录的兼容分支。新计划和训练上下文查询要绑定显式用户 ID，移除对这些兼容分支的依赖。
- 保留原有单次跑步模型接口，未配置模型时报告不可用；现有日常建议和表现评分可使用规则。下一阶段需显式区分缺失数据、真实零值和演示数据。

## 阶段 1 数据模型与迁移建议

首个增量迁移增加 `TrainingPlans` 与 `TrainingSessions`。计划包含用户、目标模板、可训练日、周频率、本地起始日期、状态和版本。任务以计划为父级，记录计划本地日期、类型、目标距离或时长、强度及执行状态。外键类型与现有 `Users.id` 保持一致，采用有符号 `INT`。计划按用户与状态索引，任务按计划与日期索引，同一计划的一天最多一项任务。

计划创建、更新及激活统一检查归属，以事务写入计划与任务。激活时锁定同一用户或加数据库唯一约束，防止并发激活多个计划。读取侧通过现有活动和健康服务生成近 7/28 天汇总，给出数据范围、样本数和缺失指标。安排日期用本地 `DATE`，跨源活动时间按明确时区转换。

增量 SQL 在阶段 0 空库及合成数据副本各跑一遍，核对前后行数和现有接口行为。原浏览器计划如需升级，建议提供用户主动触发并可去重的一次性导入。会话、审批动作、活动匹配和修订表在后续对应阶段逐步引入。

## 阶段 0 验证结果

验证环境为 Windows、Node.js 24.13.0、npm 11.6.2、Python 3.12.15 和 MySQL 9.0.1。通过独立 MySQL 实例完成所有写入，未对本机既有 `motionanalysis` 进行写入或读取业务记录。该旧库有 37 张表，包含本快照省略的 `DailyStressSummaries` 和 `RestingHeartRates`，缺少本快照提供的 `AiCoachFeedback` 和 `MorningReadinessFeedback`。

| 检查 | 实际结果 |
| --- | --- |
| 依赖与启动 | 前后端 `npm ci` 成功，锁文件与上游一致；两个可选 Python requirements 在独立环境安装成功；空库初始化 37 张表，重复初始化被拒绝；管理员、后端及 Vite 正常启动 |
| 原有后端测试 | 在上游快照与 SpAgent 分别执行 `npm test`，均为 151/151 通过 |
| 前端构建与专项测试 | 上游和 SpAgent 构建通过；SpAgent 的 API 配置、Capacitor、Android 标识及记录格式专项检查 20/20 通过 |
| 原有 `check:course` | 上游 71/106 通过，SpAgent 73/106 通过。剩余 33 项与上游同名，涉及界面文案、组件结构和导航等静态断言；命令以失败退出 |
| 实际 HTTP | 注册、登录、个人活动列表与详情、手工活动增改查删、统计、仪表盘、负荷、健康趋势与样本、表现评分、Garmin 未连接状态和 AI 规则回退通过；普通账号只能读取自己的活动及解读 |
| 实际浏览器 | Chrome 手机宽度下通过注册、登录及今日、运动列表、运动详情、健康度、趋势、教练、训练计划 7 个页面。上游原巡检脚本仍因旧 `.server-health-badge` 选择器超时，另行用当前页面实际元素完成上述检查 |
| 合成数据导入 | Garmin 官方 SDK 生成的合成 FIT 经现有解析器落库，得到 1 条活动、1 个分段、3 个采样点；合成健康 JSON 连续导入两次，日汇总与睡眠汇总各保留 1 条。临时样本未进入 Git |

在线 Garmin 登录及下载、真实 DeepSeek 调用、Android APK 构建及本地模型训练本阶段未验证。进入阶段 1 前优先更新过时的前端断言，并以真实浏览器流程保护训练计划页面。
