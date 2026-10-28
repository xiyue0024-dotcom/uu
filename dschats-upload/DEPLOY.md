# 部署说明（Node.js 服务器）

本应用**不是纯静态网站**：它需要 Node.js 进程提供 `/api/*` 接口，并需要一块可写磁盘保存 `data/db.json`。
如果你的主机只支持上传 HTML/PHP 静态文件，无法直接运行。

---

## 一、必须上传的文件

```
server.js
package.json
lib/db.js
lib/auth.js
lib/ai.js
lib/telegram.js
public/index.html
public/auth.html
public/workspace.html
public/favicon.svg
public/css/base.css
public/css/landing.css
public/css/app.css
public/js/auth.js
public/js/workspace.js
```

合计 15 个文件，约 250 KB。

**不要上传**：
- `data/db.json`（本地的账号、密码哈希、聊天记录，属于隐私数据）
- 本地 `.env`（如含 API Key / Bot Token，请在服务器上重新创建）
- `docs/`、`.workbuddy-ai/`、`node_modules/`（没有依赖，不需要）

`data/` 目录会在首次注册时自动创建，确保运行用户对该目录有写权限即可。

---

## 二、服务器要求

| 项目 | 要求 |
|---|---|
| Node.js | ≥ 18（用到内置 `fetch`） |
| 内存 | 128 MB 足够 |
| 磁盘 | 100 MB 起，按聊天量增长 |
| 进程 | **只能单进程运行**（JSON 文件存储，多进程会互相覆盖） |
| 持久化 | `data/` 必须在持久磁盘上，不能是临时文件系统 |

---

## 三、部署步骤

```bash
# 1. 上传并解压到 /var/www/dschats
sudo mkdir -p /var/www/dschats
sudo chown -R $USER:$USER /var/www/dschats
# 上传 zip 后解压
unzip dschats-clone-deploy.zip -d /var/www/dschats

# 2. 创建配置
cd /var/www/dschats
cp .env.example .env
vi .env

# 3. 启动（前台测试）
node server.js
# 看到 "DSchats 复刻版已启动" 即成功
```

`.env` 示例：

```env
PORT=5173
HOST=127.0.0.1

# 大模型：Groq（OpenAI 兼容，默认已接）
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_你的密钥
LLM_MODEL=qwen/qwen3.8-27b

# 可选：Telegram Bot
TELEGRAM_BOT_TOKEN=
```

- 用 Nginx 反代时保持 `HOST=127.0.0.1`；
- 直接对外暴露时改 `HOST=0.0.0.0`，并在防火墙放行端口。

---

## 四、Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

上线后务必配置 HTTPS（certbot / 云厂商证书）。

---

## 五、守护进程

### 方式 A：systemd（推荐）

`/etc/systemd/system/dschats.service`

```ini
[Unit]
Description=DSChats Clone
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/dschats
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dschats
sudo systemctl status dschats
```

### 方式 B：pm2

```bash
npm i -g pm2
pm2 start server.js --name dschats -i 1
pm2 save && pm2 startup
```

`-i 1` 很重要：不要用 cluster 模式。

---

## 六、上线检查清单

- [ ] `node server.js` 能正常启动，首页返回 200
- [ ] 注册一个账号，确认自动载入演示数据
- [ ] `data/` 目录属主正确且可写（`chmod 700 data`，`chmod 600 data/db.json`）
- [ ] Nginx 反代生效，HTTPS 证书有效
- [ ] `.env` 权限设为 600，不随代码仓库分发
- [ ] 已配置 `data/db.json` 的定期备份（这是唯一数据源）
- [ ] 只运行 1 个进程
- [ ] 如需 Telegram，确认服务器能访问 `api.telegram.org`

---

## 七、常见问题

**打不开 / 502**
Node 进程没起来，或 `HOST` 配错。先 `node server.js` 前台看日志。

**注册后数据重启就没了**
`data/` 放在了临时目录，或容器未挂载持久卷。把 `data/` 挂到持久磁盘。

**多个用户同时写入会不会冲突**
单进程内是内存操作 + 延迟落盘，正常量级没问题；但不要开多进程/多实例。

**模型报 429 / 回复退回本地引擎**
Groq 免费额度有每分钟请求限制。触发限流时程序会自动回退本地规则引擎并记录警告，稍后重试即可；量大时在 Groq 控制台升级额度。

**能不能放到 Vercel / Netlify**
不行。它们是无状态/静态托管，本应用依赖本地文件写入。需要 VPS、云服务器或带持久卷的容器平台。

**备份怎么做**
只需备份 `data/db.json`：

```bash
cp data/db.json /backup/db-$(date +%F).json
```
