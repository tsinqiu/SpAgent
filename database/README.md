# 数据库与导入基线

## 初始化新库

按 [项目 README](../README.md#本地启动) 创建空 MySQL 数据库并配置后端 `DB_*`。依次运行 `npm --prefix backend run db:init` 和 `npm --prefix backend run db:migrate`。初始化脚本使用当前连接选择的库，检查已有表、视图、例程和事件，并拒绝在非空库中运行。阶段 0 基线包含 37 张表，应用目前全部迁移后共有 47 张。MySQL DDL 会逐条提交，若基线初始化中断，请检查出错原因，并为重试使用新的空开发库。

`npm --prefix backend run db:verify` 只读校验应用启动依赖。`npm --prefix backend run seed:admin` 按本地配置创建或更新指定管理员账号。阶段 0 不迁移旧库的业务数据。

## 增量升级

已初始化的 SpAgent 开发库运行 `npm --prefix backend run db:migrate`。迁移从 `02_training_plans.sql` 依次执行到 `08_garmin_sync_queue.sql`，可重新执行。阶段 3 新增训练关联和修订记录，并将 Garmin 外部 ID 唯一索引从全局改为按账号。阶段 4 新增训练偏好设置。迁移 06 给活动表添加训练时间虚拟生成列和账号、时间复合索引，保留统一的北京时间规则。迁移 07 新增训练提醒偏好和按账号、类型、周期去重的提醒记录。迁移 08 为 Garmin 同步任务添加进行中唯一索引、工作租约和尝试次数。

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
