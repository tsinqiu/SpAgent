# SpAgent

SpAgent 是从 MotionCare 演进的个人跑步训练管理系统。当前为阶段 0，提供运动记录、训练统计、身体与训练状态、Garmin 接入和现有 AI 教练基线。四周计划持久化、审批和跑后反馈按 [PRD](docs/PRD.md) 分阶段实现。

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
   ```

   可用 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 生成本地 JWT 密钥。浏览器可以直接注册普通账号。需要管理员页面时，配置 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 后执行 `npm --prefix backend run seed:admin`。

3. 分别启动后端和前端。Windows 也可使用仓库根目录的 `start-services.ps1`。

   ```powershell
   npm --prefix backend start
   npm --prefix frontend run dev
   ```

   打开 [本地 Web](http://localhost:5173/) 注册并登录。后端 [健康检查](http://127.0.0.1:8080/api/health) 应返回 `data.database.ok: true`。如果修改后端端口，在 `frontend/.env` 配置 `VITE_API_BASE_URL`；使用 Vite 同源代理时同时设置 `VITE_DEV_PROXY_TARGET`。

## 验证基线

```powershell
npm --prefix backend test
npm --prefix frontend run build
npm --prefix frontend run check:course
```

新库从空数据开始。在「记录」手动添加一条名为「合成测试跑」的活动，例如 5000 米、1800 秒，然后在运动记录、详情和趋势页核对。无 DeepSeek 密钥时，现有教练使用规则建议。单次跑步预测需要单独训练本地模型，相关脚本见 [后端 API 文档](backend/docs/api.md#ml-models)。

原有前端静态检查和浏览器巡检存在上游遗留失败项，实际验收范围见 [阶段 0 验证结果](docs/architecture.md#阶段-0-验证结果)。

## Garmin、FIT 与本地文件

需要 Garmin 同步时，执行 `python -m pip install -r database/requirements.txt`，并让 `GARMIN_PYTHON_PATH` 指向同一解释器。将测试 FIT、生成 SQL 和本地令牌留在忽略目录，操作说明见 [数据库文档](database/README.md)。Android 构建需自行配置 SDK 和 `VITE_NATIVE_API_BASE_URL`；发布包需显式提供签名环境变量。

将 `.env`、Garmin 令牌、个人运动及健康文件、共享 SQL 转储、上传图片和训练模型留在本机。完整文档入口为 [产品需求](docs/PRD.md)、[架构与审计](docs/architecture.md) 和 [现有 API](backend/docs/api.md)。
