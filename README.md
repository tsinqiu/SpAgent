# SpAgent

SpAgent 是从 MotionCare 演进的个人跑步训练管理系统。阶段 2 的计划助手可按训练目标和可训练日生成四周课表，展示训练依据，在用户确认后保存到 MySQL。运动记录、任务周历、健康、Garmin 接入和日常教练仍可使用。后续阶段见 [PRD](docs/PRD.md)。

源码基线为 [MotionCare `673887bedb63460bbf966a703558ee1d5ac55e77`](https://github.com/tsinqiu/MotionCare/tree/673887bedb63460bbf966a703558ee1d5ac55e77)。复用清单和验证结果见 [架构与基线审计](docs/architecture.md)。

## 本地启动

需要 MySQL 8.0 或更新版本、Node.js 22 或更新版本及 npm。运行完整后端测试还需要 PATH 中的 Python，Garmin 和本地 ML 的额外依赖可按需安装。

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

从「今日」进入「训练计划」。可选择「首次 5 公里」或「规律跑步」四周目标，选择每周 2–4 个训练日，预览后保存。也可导入原有模板，或逐日创建自定义计划。保存后的计划支持编辑、激活和归档。执行中的任务可标为完成或跳过。

已有阶段 0 开发库时，运行 `npm --prefix backend run db:migrate` 即可增量升级。要演示统计数据，先在本地注册专用于演示的账号，再运行 `npm --prefix backend run seed:training-demo -- demo@example.test`，把邮箱换成该账号。页面会标识合成数据，演示记录只归属所选账号。

## 使用教练计划助手

在「教练 → 计划助手」输入「我每周二、四、日有空，未来四周想为首次 5 公里做准备」。对话里会显示近 7/28 天的训练数据、缺失项和四周草案。确认后可跳转到已保存的计划。已有执行中计划时，新计划会另存为草稿。未确认的草案会在 30 分钟后失效。

默认使用本地规则，演示无需 API 密钥。若要启用在线意图识别，可在本机 `backend/.env` 设置 `AGENT_USE_DEEPSEEK=true`，并填写 `AI_DEEPSEEK_BASE_URL`、`AI_DEEPSEEK_MODEL` 和 `DEEPSEEK_API_KEY`。配置的服务需支持 Chat Completions 的 JSON 输出。启用后，计划助手会把当前输入的文本发送给配置的服务来识别目标，训练数据查询和课表生成仍在本地完成。[DeepSeek JSON 输出文档](https://api-docs.deepseek.com/guides/json_mode/)

## 验证

```powershell
npm --prefix backend test
npm --prefix frontend run build
npm --prefix frontend run check:course
```

新库从空数据开始。在「记录」手动添加一条名为「合成测试跑」的活动，例如 5000 米、1800 秒，然后在运动记录、详情和趋势页核对。无 DeepSeek 密钥时，现有教练使用规则建议。单次跑步预测需要单独训练本地模型，相关脚本见 [后端 API 文档](backend/docs/api.md#ml-models)。

原有前端静态检查和浏览器巡检存在上游遗留失败项，实际验收范围见 [架构与验证](docs/architecture.md)。计划、训练上下文和教练接口见 [API 文档](docs/api.md)。

## Garmin、FIT 与本地文件

需要 Garmin 同步时，执行 `python -m pip install -r database/requirements.txt`，并让 `GARMIN_PYTHON_PATH` 指向同一解释器。将测试 FIT、生成 SQL 和本地令牌留在忽略目录，操作说明见 [数据库文档](database/README.md)。Android 构建需自行配置 SDK 和 `VITE_NATIVE_API_BASE_URL`；发布包需显式提供签名环境变量。

将 `.env`、Garmin 令牌、个人运动及健康文件、共享 SQL 转储、上传图片和训练模型留在本机。完整文档入口为 [产品需求](docs/PRD.md)、[架构与审计](docs/architecture.md) 和 [现有 API](backend/docs/api.md)。
