# 数据库与导入基线

## 初始化新库

按 [项目 README](../README.md#本地启动) 创建空 MySQL 数据库并配置后端 `DB_*`。然后运行 `npm --prefix backend run db:init`。脚本使用当前连接选择的库，检查已有表、视图、例程和事件，并拒绝在非空库中运行。建表定义只含结构，建立 37 张表及外键和索引。MySQL DDL 会逐条提交，若初始化中断，请检查出错原因，并为重试使用新的空开发库。

`npm --prefix backend run db:verify` 只读校验应用启动依赖。`npm --prefix backend run seed:admin` 按本地配置创建或更新指定管理员账号。阶段 0 不迁移旧库的业务数据。

## 离线 FIT 与健康文件

以下示例面向已经创建的独立测试库。解析器把合成 FIT 文件转换为 SQL，执行时由 MySQL 客户端指定目标库。对应目录及输出默认被 Git 忽略。

```powershell
python database/scripts/import_fit_files.py --fit-dir database/data/fit --no-json --out database/sql/02_import_data.sql
mysql --host=127.0.0.1 --user=spagent_local --password --default-character-set=utf8mb4 SpAgent
```

在 MySQL 客户端中，从仓库根目录执行 `source database/sql/02_import_data.sql`。离线 FIT SQL 不填应用用户归属，适用于解析与入库验证；普通用户的活动列表只显示其名下记录。重复执行同一生成文件可能触发唯一键，实验使用独立空库。

`import_garmin_health.py` 接收 `--health-dir`、`--user-id` 和 `--out`，目标库由 MySQL 连接决定。Garmin 在线同步由后端执行登录、下载及解析，对应 token、FIT、JSON 和 SQL 均写入本地目录。空库首次在线同步在缺少起始日时可直接结束，后续须补齐可控首轮导入入口及按用户去重。

## 旧库

阶段 0 建表快照来自上游结构回放。上游 `01_schema.sql` 会清理基础表，`import_shared_seed.ps1` 会重建整个库。历史 `09`、`10`、`16` 涉及删除表或列，`15` 含 MySQL 客户端 `DELIMITER`。已审计上游脚本，后续对既有数据库只交付并应用经过测试的增量迁移。
