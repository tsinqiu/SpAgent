# 数据库与导入基线

## 初始化新库

按 [项目 README](../README.md#本地启动) 创建空 MySQL 数据库并配置后端 `DB_*`。依次运行 `npm --prefix backend run db:init` 和 `npm --prefix backend run db:migrate`。初始化脚本使用当前连接选择的库，检查已有表、视图、例程和事件，并拒绝在非空库中运行。阶段 0 基线包含 37 张表，应用全部增量迁移（`02`–`13`）后包含完整计划、教练记忆与赛事数据表。MySQL DDL 会逐条提交，若基线初始化中断，请检查出错原因，并为重试使用新的空开发库。

`npm --prefix backend run db:verify` 只读校验应用启动依赖（当前校验 26 张核心业务表）。`npm --prefix backend run seed:admin` 按本地配置创建或更新指定管理员账号。阶段 0 不迁移旧库的业务数据。

## 增量升级

已初始化的 SpAgent 开发库运行 `npm --prefix backend run db:migrate`。迁移从 `02_training_plans.sql` 依次执行到 `13_user_marathon_events.sql`，全部幂等可重复执行。迁移 11 新增按账号隔离的教练长期记忆表 `AthleteMemories`；迁移 12 新增国内半马/全马自动爬虫赛历表 `MarathonEvents`；迁移 13 新增用户云端目标赛事表 `UserMarathonEvents`（与 AI 教练备赛上下文联动）。

升级到迁移 08 前先停止旧后端，避免同步执行与迁移重叠。历史已结束任务保留，缺少续跑参数的旧排队或执行记录会标为已中断，可在新版页面重新提交。

在本地注册专用演示账号后，可运行 `npm --prefix backend run seed:training-demo -- demo@example.test`。脚本向指定账号添加最近 28 天的 4 次合成跑步和 3 天的合成恢复汇总，同一天重复执行不会新增重复记录，已有同日健康数据会保留。浏览器可在训练计划页查看两个时间窗的统计及合成标识。

## 离线 FIT 与健康文件

以下示例面向已经创建的独立测试库。解析器把合成 FIT 文件转换为 SQL，执行时由 MySQL 客户端指定目标库。对应目录及输出默认被 Git 忽略。

```powershell
python database/scripts/import_fit_files.py --fit-dir database/data/fit --no-json --out database/sql/02_import_data.sql
mysql --host=127.0.0.1 --user=spagent_local --password --default-character-set=utf8mb4 SpAgent
```

在 MySQL 客户端中，从仓库根目录执行 `source database/sql/02_import_data.sql`。离线 FIT SQL 不填应用用户归属，适用于解析与入库验证；普通用户的活动列表只显示其名下记录。重复执行同一生成文件可能触发唯一键，实验使用独立空库。

`import_garmin_health.py` 接收 `--health-dir`、`--user-id` 和 `--out`，目标库由 MySQL 连接决定。Garmin 在线同步由后端执行登录、下载及解析，对应 token、FIT、JSON 和 SQL 均写入本地目录。没有同步历史时首次查询最近 28 天。Git 忽略同步文件和 FIT 数据目录。

浏览器 FIT 导入走现有 Python 解析器，单次支持一个不超过 8 MB 的活动文件。服务端按当前账号和 FIT 字节指纹去重，并可匹配同日待训练任务。客户端无需知道数据库用户 ID。可选的演示生成器见 [演示流程](../docs/demo.md)。

## 旧库

阶段 0 建表快照来自上游结构回放。上游 `01_schema.sql` 会清理基础表，`import_shared_seed.ps1` 会重建整个库。历史 `09`、`10`、`16` 涉及删除表或列，`15` 含 MySQL 客户端 `DELIMITER`。已审计上游脚本，后续对既有数据库只交付并应用经过测试的增量迁移。

直接接入已有运动库时，用迁移账号运行 `db:migrate` 和 `db:verify`，再将服务进程的 `DB_NAME` 设为该库名，并使用仅获该库读写权限的运行账号启动。库里的账号、认证和活动归属沿用原有记录。打开 App 后以记录所属的原邮箱登录。

本机旧结构先在独立 MySQL 中仅复制表定义，使用合成记录连续运行两轮 02–09。原活动的归属和时间保持一致，新会话、反馈和跨账号隔离通过验证。实库只执行增量迁移、创建数据库运行账号及只读验证。
