# SpAgent 公网服务器部署与安全加固指南

本指南面向将 SpAgent（Vue 前端 + Express API + MySQL）部署到公网 Ubuntu 云服务器（如阿里云 ECS）时的安全防护，覆盖应用层、Nginx 反向代理、数据库与主机系统四层防御。

## 1. 应用层已内置的安全防护

| 防护项 | 实现位置 | 说明 |
| --- | --- | --- |
| 注册防滥用与 AI 额度保护 | `backend/src/routes/authRoutes.js` | 支持 `ALLOW_PUBLIC_REGISTRATION=false` 关闭公开注册，或设置 `REGISTRATION_INVITE_CODE`（服务端使用 SHA-256 + `crypto.timingSafeEqual` 常量时间校验邀请码），防止陌生人批量注册刷爆 DeepSeek API 额度 |
| 分层限流（Rate Limit） | `backend/src/app.js` | 对全局 `/api`、登录 `/api/auth/login`、注册 `/api/auth/register`、AI 教练 `/api/ai` + `/api/agent`、赛事刷新 `/api/explore/events/refresh` 分别设置独立窗口与阈值 |
| 登录暴力破解锁定 + 审计日志 | `backend/src/services/securityService.js` | 单账号连续失败达阈值后自动锁定并写入 `LoginAttempts` / `SecurityAuditLogs` |
| 生产启动强校验（Fail-Fast） | `backend/src/serverStartup.js` | `NODE_ENV=production` 下拒绝启动：弱/空 `JWT_SECRET`（< 32 字符）、空 `DB_PASSWORD`、通配符 `CORS_ORIGIN=*` |
| SSRF 白名单隔离 | `backend/src/services/coachOnlineService.js` | AI 教练联网天气与搜索严格限制 HTTPS 域名白名单、禁止跟随重定向（`redirect: 'error'`）、8 秒超时与 1.5MB 响应上限；搜索词自动脱敏邮箱/手机号/API Key |
| 安全响应头与权限边界 | `backend/src/app.js` | `helmet`（`X-Frame-Options: DENY`、`Referrer-Policy`、生产 HSTS）、`Permissions-Policy`、隐藏 `X-Powered-By`；全业务 SQL 参数化并按登录用户 `req.user.id` 隔离 |
| 高德安全密钥后端化 | `backend/src/routes/systemRoutes.js` | 配置 `AMAP_SERVICE_HOST` 后，浏览器端不暴露原始 `AMAP_SECURITY_CODE`，由 Nginx `/_AMapService/` 注入 |

---

## 2. 生产 `.env` 必配安全项

在服务器 `backend/.env` 中设置并执行 `chmod 600 backend/.env`：

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=8080
TRUST_PROXY=true

# 仅允许你的真实域名（不要使用 *）
CORS_ORIGIN=https://your-domain.example

# 至少 32 字节随机密钥：openssl rand -hex 32
JWT_SECRET=替换为64位随机十六进制字符串
JWT_EXPIRES_IN=7d

# 强烈建议：公网部署时二选一，防止路人注册并消耗 DeepSeek API 额度
# 方案 A（仅自用）：关闭公开注册
ALLOW_PUBLIC_REGISTRATION=false
# 方案 B（邀请同学/老师体验）：开启注册但要求邀请码
# ALLOW_PUBLIC_REGISTRATION=true
# REGISTRATION_INVITE_CODE=替换为你的邀请码

# 专用最小权限数据库账号（不要使用 root）
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=spagent
DB_USER=spagent_app
DB_PASSWORD=替换为高强度随机密码

# 生产更严格限流
GLOBAL_RATE_LIMIT_MAX=1200
AUTH_RATE_LIMIT_MAX=60
REGISTER_RATE_LIMIT_MAX=10
AI_RATE_LIMIT_MAX=45
CRAWLER_REFRESH_RATE_LIMIT_MAX=5

# 高德地图：走 Nginx 代理，避免前端暴露安全密钥
AMAP_JS_API_KEY=你的高德Web端Key
AMAP_SECURITY_CODE=
AMAP_SERVICE_HOST=https://your-domain.example/_AMapService
```

---

## 3. 云主机与防火墙加固（Ubuntu）

### 3.1 阿里云安全组 + UFW 最小端口暴露
- **仅放行**：`22`（SSH，最好限定常用来源 IP）、`80`（HTTP / Certbot 续签）、`443`（HTTPS）。
- **严禁公网放行**：`3306`（MySQL）、`8080`（Express）、`4173`/`5173`（前端开发端口）。

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

### 3.2 SSH 与防爆破（fail2ban）
确认 `/etc/ssh/sshd_config` 仅允许密钥登录（你当前已使用 `.pem` 私钥登录，保持并关闭密码登录）：

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl reload ssh

# 安装并启用 fail2ban（自动封禁 SSH 与 Nginx 暴力扫描 IP）
sudo apt-get update && sudo apt-get install -y fail2ban unattended-upgrades
sudo systemctl enable --now fail2ban
```

### 3.3 MySQL 绑定本机 + 最小权限账号
确认 `/etc/mysql/mysql.conf.d/mysqld.cnf` 中为：
```ini
bind-address = 127.0.0.1
```
并为 SpAgent 创建仅限 `spagent` 库的账号（不赋予 `SUPER`/`FILE`/`GRANT` 权限）：
```sql
CREATE USER 'spagent_app'@'127.0.0.1' IDENTIFIED BY '强随机密码';
GRANT SELECT, INSERT, UPDATE, DELETE ON spagent.* TO 'spagent_app'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 3.4 Nginx + HTTPS（Let's Encrypt）
1. 使用 [nginx-spagent.conf](file:///d:/AIsth/SprotAgent/backend/docs/nginx-spagent.conf) 作为站点模板：
   - 开启 `server_tokens off`
   - 拦截 `/.env`、`/.git`、`*.php`、`*.sql` 等扫描器请求（直接 `return 444` 断连）
   - 为 `/api/agent/coach/stream` 关闭 `proxy_buffering`，确保流式输出不卡顿
   - 取消注释 `/etc/nginx/conf.d/spagent-zones.conf` 中的 `limit_req_zone`
2. 绑定域名后一键签发免费 HTTPS 证书：
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

### 3.5 systemd 非 root 隔离运行后端
不要以 `root` 运行 Node.js，创建专用系统用户 `spagent` 并配置 `/etc/systemd/system/spagent.service`：

```ini
[Unit]
Description=SpAgent Backend API
After=network.target mysql.service

[Service]
Type=simple
User=spagent
Group=spagent
WorkingDirectory=/opt/spagent/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/spagent/backend/uploads /opt/spagent/database

[Install]
WantedBy=multi-user.target
```

### 3.6 定期备份与密钥轮换
- 每日 `mysqldump --single-transaction spagent | gzip > /var/backups/spagent-$(date +%F).sql.gz`（保留 7 天，`chmod 600`）。
- 若曾暴露过任何 API Key（DeepSeek、高德）或 `.env`，立即在对应控制台重置并重启服务。
- 定期在服务器查看登录与安全审计：`SELECT * FROM SecurityAuditLogs ORDER BY id DESC LIMIT 30;`。
