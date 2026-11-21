# SpAgent

SpAgent 是以对话式 Agent 为入口的跑步数据工作台。登录后可以直接问自己的运动记录、安排训练或提出改期。Agent 结合登录账号的真实运动数据回答，涉及保存计划或修改任务时会在对话中给出预览和确认。运动、计划、同步和设置都从左侧菜单进入。 [产品需求](docs/PRD.md)

上游源码快照为 [MotionCare `673887bedb63460bbf966a703558ee1d5ac55e77`](https://github.com/tsinqiu/MotionCare/tree/673887bedb63460bbf966a703558ee1d5ac55e77)。复用清单和验证结果见 [架构与基线审计](docs/architecture.md)。

| 目录 | 内容 |
| --- | --- |
| [`frontend`](frontend/) | Vue 网页、PWA 和 Capacitor Android 工程 |
| [`backend`](backend/) | Express API、业务服务及测试 |
| [`database`](database/) | MySQL 初始化、增量迁移、FIT 与 Garmin 处理脚本 |
| [`docs`](docs/) | 产品需求、接口、架构、演示和验收记录 |

## 本地启动

需要 MySQL 8.0 或更新版本、Node.js 22 或更新版本及 npm。仅在启用 Garmin 同步或 FIT 导入时需要安装 Python 依赖。

1. 用本机 MySQL 管理员打开客户端，创建空库及仅访问该库的账号。将示例口令改为自己的本地口令。

   ```sql
   CREATE DATABASE SpAgent CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER 'spagent_local'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-local-password';
   GRANT ALL PRIVILEGES ON SpAgent.* TO 'spagent_local'@'127.0.0.1';
   ```

2. 在仓库根目录执行以下命令。编辑 `backend/.env`，设置 `DB_PASSWORD` 和随机生成的 `JWT_SECRET`。如 MySQL 使用非默认端口，设置 `DB_PORT`。

   ```powershell
   Copy-Item backend/.env.example backend/.env
   npm --prefix backend ci
   npm --prefix frontend ci
   npm --prefix backend run db:init
   npm --prefix backend run db:migrate
   ```

   可用 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 生成本地 JWT 密钥。浏览器可以直接注册普通账号。需要管理员页面时，配置 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 后执行 `npm --prefix backend run seed:admin`。

3. 分别启动后端和前端。Windows 也可使用仓库根目录的 `start-services.ps1`。

   ```powershell
   npm --prefix backend start
   npm --prefix frontend run dev
   ```

   打开 [本地 Web](http://localhost:5173/) 注册并登录。后端 [健康检查](http://127.0.0.1:8080/api/health) 应返回 `data.database.ok: true`。如果修改后端端口，在 `frontend/.env` 配置 `VITE_API_BASE_URL`；使用 Vite 同源代理时同时设置 `VITE_DEV_PROXY_TARGET`。

## 使用训练计划

从左侧菜单的「训练 → 训练计划」查看计划，也可以对 AI 教练说出跑步目标和可训练日。可选择「首次 5 公里」或「规律跑步」四周目标，选择每周 2–4 个训练日，预览后保存。也可导入原有模板，或逐日创建自定义计划。保存后的计划支持编辑、激活和归档。执行中的任务可标为完成或跳过。

已有 SpAgent 开发库时，运行 `npm --prefix backend run db:migrate` 即可增量升级。要演示统计数据，先在本地注册专用于演示的账号，再运行 `npm --prefix backend run seed:training-demo -- demo@example.test`，把邮箱换成该账号。页面会标识合成数据，演示记录只归属所选账号。

新版的「今日」会展示当前课次。训练提醒可在「我的 → 训练偏好」开启，打开「今日」时计算并显示。Garmin 同步提交后可离开页面，后台继续处理，返回「数据同步」可查看进度。迁移 07、08 分别创建提醒表并升级同步任务队列。反向代理需要将 `/uploads/` 转发给后端，示例见 [媒体与反向代理](docs/api.md#私有照片)。

## 使用 AI 教练工作台

登录后直接在对话中输入「我最近一次跑步怎么样」或「我每周二、四、日有空，未来四周想为首次 5 公里做准备」。Agent 会回答数据问题，也可给出四周草案。确认后可查看已保存的计划。已有执行中计划时，新计划会另存为草稿。未确认的草案会在 30 分钟后失效。

问「放在全国跑友中我的水平如何」或「我的中长跑什么水平」时，教练会先查看个人跑量、实际距离覆盖和分段代表记录。也可以直接比较 800 米、1500 米、10 公里等指定项目。只报比赛用时并且距离不明确时，教练会追问对应的项目。全国排名需要可比的跑者成绩分布，当前系统提供有日期和样本范围的个人参考。

在 `backend/.env` 设置 `DEEPSEEK_API_KEY`（默认自动启用在线教练，也可显式配置 `AGENT_USE_DEEPSEEK=true`、`AI_DEEPSEEK_BASE_URL` 和 `AI_DEEPSEEK_MODEL`），重启后端即可启用 **SpAgent Coach Harness**（Vercel AI SDK v7 多步 ReAct 流式工具循环 + 12 个用户隔离工具 + 原生 SVG 遥测卡片 + 长期记忆 + 审批制课表）。模型服务不可用时，教练仍可通过本地规则安全回退。

在 `backend/.env` 配置高德 Web 端 `AMAP_JS_API_KEY` 和 `AMAP_SECURITY_CODE`（生产环境可改配 `AMAP_SERVICE_HOST` 经 Nginx 代理隐藏安全密钥），即可在运动详情与路线页叠加高德真实底图与火星坐标纠偏轨迹；未配置 Key 时自动降级为高精度 SVG 配速轨迹预览。后端启动后会自动定时爬取国内近期半马与全马赛历并展示在主页，收藏的「我的赛事」保存在 MySQL 并同步给 AI 教练用于备赛规划。

教练可以查最近几次运动、按时间汇总或结合资料解释训练技术。对话可上传图片、Markdown、PDF，单份最多 8 MB。右上角三个点打开角色和自定义指令。底部的历史和附件仅在 AI 教练工作区显示。已有库需应用迁移 10 后再运行新版后端。 [AI 教练 API 与本地 MCP 接入](docs/api.md#ai-教练工作台)

## 验证

```powershell
npm --prefix backend test
npm --prefix frontend run build
npm --prefix frontend run check:course
```

新库从空数据开始。在「记录」手动添加一条名为「合成测试跑」的活动，例如 5000 米、1800 秒，然后在运动记录、详情和趋势页核对。无 DeepSeek 密钥时，现有教练使用规则建议。

前端构建后运行 `npm --prefix frontend run preview`，再用 `npm --prefix frontend run ui:smoke` 验证下载页和登录错误提示。登录后的巡检命令为 `npm --prefix frontend run ui:smoke:auth -- --all-routes`。该命令会创建合成账号和运动记录，请将后端连接到独立测试库。实际结果见 [架构与验证](docs/architecture.md)。计划、训练上下文和教练接口见 [API 文档](docs/api.md)。

## 跑后复盘和计划调整

从「我的 → 同步」导入 FIT。符合唯一匹配条件的跑步会自动关联到待训练任务。其他跑步可从运动详情的「分析 → 训练任务复盘」或周历任务手动关联。在任一入口可查看距离、时长和配速差异。

在教练页可以说「把本周四的训练移到周五」或「下一次训练减量 20%」。同一训练周内的改期和适度减量可生成变更对比。确认后通过「修订历史」查看改动，已完成或已关联的任务保留原状。完整演示见 [执行反馈闭环](docs/demo.md)。

## 训练周报

从「探索 → 训练周报」查看本周或往周的运动时长、次数、距离和计划执行情况。周报按北京时间的周一至周日汇总。已关联的训练任务可打开对应运动详情。缺失的测量字段按可用记录标记，合成演示记录单独注明。

「训练执行趋势」比较当前查看的周和之前三周，可切换运动时长和任务完成情况。选择某一周即可打开该周明细。任务图把当日仍待完成和未来的任务单独标为未到期。

本周周报提供下周训练建议。展开「训练依据」可查看任务完成情况、近 7/28 天跑步量和可用恢复数据。若规则建议单次减量，可选择「去教练预览调整」，查看改前改后的目标，确认后保存。

## 训练偏好

在「我的 → 训练偏好」保存常用跑步目标和每周训练日，也可从教练的计划助手进入。比如保存「首次 5 公里」和周一、三、六后，在新对话输入「按我的训练偏好生成一份计划」。教练会在草案依据里标明使用的设置，本轮明确指定的目标或日期优先。可随时修改或清除偏好。

## Garmin、FIT 与本地文件

需要 Garmin 同步时，执行 `python -m pip install -r database/requirements.txt`，并让 `GARMIN_PYTHON_PATH` 指向同一解释器。将测试 FIT、生成 SQL 和本地令牌留在忽略目录，操作说明见 [数据库文档](database/README.md)。Android 构建需自行配置 SDK 和 `VITE_NATIVE_API_BASE_URL`；发布包需显式提供签名环境变量。

Android 应用 ID 为 `com.spagent.app`。安装新版时，Android 会把它作为独立应用，需重新登录。发布签名使用 `SPAGENT_RELEASE_STORE_FILE`、`SPAGENT_RELEASE_STORE_PASSWORD`、`SPAGENT_RELEASE_KEY_ALIAS` 和 `SPAGENT_RELEASE_KEY_PASSWORD`。将签名后的 APK 放到 `frontend/public/downloads/spagent-release.apk`，网页下载入口即可检测到发布包。

Web 同源升级会迁移已有登录、主题、运动员设置、路线收藏和运动复盘草稿。MySQL 保留 `DB_NAME` 指定的现有库。部署示例使用 `/var/www/spagent/frontend/dist`、PM2 进程 `spagent-api`，见 [Nginx 示例](frontend/deploy/nginx.spagent.example.conf) 和 [PM2 配置](backend/ecosystem.config.cjs)。

将 `.env`、Garmin 令牌、个人运动及健康文件、共享 SQL 转储、上传图片和训练模型留在本机。完整文档入口为 [产品需求](docs/PRD.md)、[架构与审计](docs/architecture.md) 和 [现有 API](backend/docs/api.md)。
