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
lib/secret.js
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

合计 16 个文件，约 260 KB。

**这个包里没有任何 API Key，也不需要配。** 模型 Key 由每个用户登录后在
「设置 → AI 模型」自己填写，加密存在 `data/db.json` 里。

**不要上传**：
- `data/db.json`（本地的账号、密码哈希、聊天记录，属于隐私数据）
- `data/.secret`（本地实例的加密主密钥，换服务器会重新生成）
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

# 2. 创建配置（只放启动参数，不含任何密钥）
cd /var/www/dschats
cp .env.example .env
vi .env

# 3. 启动（前台测试）
node server.js
# 看到 "DSchats 复刻版已启动" 即成功
```

`.env` 示例（就这么点内容）：

```env
PORT=5173
HOST=127.0.0.1

# 可选：Telegram Bot 通道
TELEGRAM_BOT_TOKEN=
```

- **不需要**在这里填大模型 Key。用户登录后各自在「设置 → AI 模型」里填。
- 用 Nginx 反代时保持 `HOST=127.0.0.1`；
- 直接对外暴露时改 `HOST=0.0.0.0`，并在防火墙放行端口。

启动日志会显示已配置 Key 的账号数：

```
  AI:     用户自填 Key（OpenAI 兼容）· 已配置 0/0 个账号
  降级:   未填 Key 的用户自动使用本地规则引擎
```

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
- [ ] `data/` 目录属主正确且可写（`chmod 700 data`，`chmod 600 data/db.json data/.secret`）
- [ ] Nginx 反代生效，HTTPS 证书有效
- [ ] `.env` 权限设为 600（虽然不含密钥，仍建议收紧）
- [ ] 登录后在「设置 → AI 模型」点「测试连接」，确认能连通模型
- [ ] 已配置 `data/` 的定期备份（**`db.json` 和 `.secret` 必须一起备份**）
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
限流是按 Key 算的，每个用户用自己的 Key，互不影响。触发限流时程序会自动重试一次，
仍失败则回退本地规则引擎并在草稿里标记 `engine: local`，稍后重试即可。

**为什么部署包里没有 API Key**
这是刻意的设计：Key 属于每个使用者自己的账号额度，不该由部署者垫付或代管。
用户登录后在「设置 → AI 模型」填自己的 Key，加密存进 `data/db.json`，
接口只返回掩码（`gsk_••••••••OfH2`），明文不会回传到浏览器。
不填也能用——自动走本地规则引擎，功能演示不受影响。

**用户说「测试连接失败」怎么排查**
按界面上的错误提示走：

| 提示 | 原因 |
|---|---|
| API Key 无效或没有权限（401/403） | Key 复制不全或已被删除 |
| 接口地址或模型名不存在（404） | Base URL 少了 `/v1`，或模型名拼错 |
| 触发限流（429） | Key 有效，只是额度到了 |
| 无法连接该地址 | 服务器出不了网，或被防火墙拦了 |

**用户丢了 Key 或者想换**
「设置 → AI 模型」里直接覆盖填写即可；点「清除 Key」会立刻退回本地引擎。

**备份怎么做**
`db.json` 和 `.secret` 必须一起备份——`.secret` 是加密主密钥，只恢复 db.json
会导致用户已保存的 Key 全部解不开（其它数据不受影响）。

```bash
tar czf /backup/dschats-$(date +%F).tar.gz -C /var/www/dschats data/db.json data/.secret
```

**能不能放到 Vercel / Netlify**
不行。它们是无状态/静态托管，本应用依赖本地文件写入（含 `data/.secret` 这个加密主密钥）。
需要 VPS、云服务器或带持久卷的容器平台。
