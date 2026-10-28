# DSChats 复刻版

依据 `dschats.com` 公开页面与政策整理的功能复刻，覆盖「情感助手 + 流程助手」的核心链路。
**零 npm 依赖**，只需 Node.js ≥ 18 即可运行。非官方产品，与 dschats.com 无关联。

> 调研与安全评估见：`../docs/DSChats-调研与安全评估.md`

---

## 一、已实现功能

| 模块 | 原站表现 | 本复刻实现 | 状态 |
|---|---|---|---|
| 账号与工作区 | 邮箱注册、默认工作区、多租户隔离 | 邮箱注册/登录、scrypt 密码哈希、HttpOnly 会话、按 userId 隔离全部数据 | ✅ |
| 助手类型 | 情感 / 流程，首次选定不可改 | 首次进入强制选择，服务端锁定，不可更改 | ✅ |
| 联系人 | 每联系人独立资料 | 名称、账号、渠道、头像色、备注 | ✅ |
| 分级记忆 | 每位联系人独立记忆 | 记忆 CRUD、来源标注、关键词匹配注入、回复中展示命中记忆 | ✅ |
| 人设与边界 | 性格、语气、相处边界 | 称呼、4 种语气、边界文本，参与提示词 | ✅ |
| 回复模式 | 关闭 / 草稿 / 自动 | 三档逐联系人设置，默认「AI 草稿」 | ✅ |
| AI 回复 | 生成/审核/翻译/自动发送 | 上下文拼装（人设+记忆+近 20 条消息+知识库+流程），支持任意 OpenAI 兼容模型 | ✅ |
| 对话工作台 | 消息流与人工接管 | 三栏布局、消息留痕、草稿采用/改写/忽略、人工接管 | ✅ |
| 翻译 | 不限量 | 中英双向，配置模型走 LLM，未配置走内置词典 | ✅ |
| 流程助手 | 步骤、分支、未回复提醒、自述/核实分离 | 流程与步骤、联系人进度、`claimed` / `verified` 双状态、事件记录 | ✅ |
| 知识库 | 业务资料 | 资料 CRUD，按相关度注入提示词 | ✅ |
| 审计日志 | 操作留痕 | 9 类事件、按类型筛选、时间线 | ✅ |
| 用量限额 | 每账号每日 1000 条 | 每日计数、上限拦截、7 日柱状图 | ✅ |
| 安全控制 | 暂停、时段、范围 | 全局暂停、自动发送总开关、时段、日限额、禁止话题 | ✅ |
| Telegram 通道 | 已开放连接 | **Bot API** 长轮询接入，自动建联系人、收消息、按模式回复 | ✅（可选） |

已按需求移除套餐与付费墙：注册即用，不限制账号数量、不设档位。
未实现：真实个人号会话（MTProto）、WhatsApp Cloud API、邮件验证、多账号矩阵、媒体消息。原因见文末「边界与取舍」。

---

## 二、快速开始

```bash
cd dschats-clone
node server.js
```

打开 <http://127.0.0.1:5173>。

- 首次注册会自动载入演示数据：2 位联系人、7 条记忆、1 个四步流程、1 条知识库资料。
- 推荐路径：注册 → 选助手 → 进入「对话」→ 点「模拟对方消息」→ 观察草稿如何引用记忆 → 采用并发送。
- 数据保存在 `data/db.json`，删除该文件即可重置。

环境要求：Node.js ≥ 18（使用内置 `fetch`）。无需 `npm install`。

---

## 三、接入真实大模型

复制 `.env.example` 为 `.env`。当前默认接 **Groq**（OpenAI 兼容协议）：

```env
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_xxxxxxxx
LLM_MODEL=qwen/qwen3.8-27b
```

Groq 可用模型（以 `/openai/v1/models` 返回为准）：

| 模型 | 说明 |
|---|---|
| `qwen/qwen3.8-27b` | 中文最稳，默认 |
| `openai/gpt-oss-20b` | 轻量，速度快 |
| `openai/gpt-oss-120b` | 更强，但会消耗推理 token，需调大 `max_tokens` |

换其他厂商也只需改这三行（OpenAI、DeepSeek、通义、Kimi、本地 Ollama 均兼容）。
未配置时自动使用**本地规则引擎**：按意图与语气模板生成回复，并注入命中的记忆，保证离线可演示。

> 安全提示：`.env` 含密钥，已加入 `.gitignore`，不要提交或打包上传。

> ⚠️ 不要尝试调用 `dschats.com` 的接口来「借用算力」。
> `api.dschats.com` 是它自己的业务后端，没有公开文档、API Key 或按量计费，且条款禁止未授权访问。
> 需要其模型能力只能走官方商务渠道谈正式 API 合作。

---

## 四、接入 Telegram（可选）

1. 在 Telegram 找 `@BotFather`，发送 `/newbot`，拿到 Bot Token；
2. 写入 `.env`：

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
```

3. 重启服务，控制台出现 `[telegram] 已连接 @your_bot`；
4. 用任意 Telegram 账号给这个 bot 发一条消息，工作台「对话」会出现该联系人，并按当前回复模式处理。

**为什么用 Bot API 而不是个人号**：Bot 只能收到主动与它对话的消息，无法读取你的私人聊天，也不违反平台条款。
原站宣称接管个人账号，那类方案需要托管用户会话凭证，属于高权限、高封号风险路径，本复刻不做。

---

## 五、目录结构

```
dschats-clone/
├── server.js              # HTTP 服务、路由、业务逻辑
├── lib/
│   ├── db.js              # JSON 存储 + 原子写入
│   ├── auth.js            # scrypt 哈希、会话令牌
│   ├── ai.js              # 提示词拼装、LLM 调用、本地规则引擎、翻译
│   └── telegram.js        # Bot API 长轮询
├── public/
│   ├── index.html         # 营销落地页
│   ├── auth.html          # 登录 / 注册
│   ├── workspace.html     # 工作台骨架
│   ├── css/{base,landing,app}.css
│   └── js/{auth,workspace}.js
├── data/db.json           # 运行时生成
├── .env.example
└── README.md
```

---

## 六、API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册并创建会话 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 退出 |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/bootstrap` | 工作区初始化数据 |
| PATCH | `/api/workspace` | 修改工作区名称 |
| POST | `/api/workspace/assistant` | 选定助手类型（仅一次） |
| GET/POST | `/api/contacts` | 联系人列表 / 新建 |
| PATCH/DELETE | `/api/contacts/:id` | 修改 / 删除联系人 |
| GET/POST | `/api/contacts/:id/memories` | 记忆列表 / 新增 |
| DELETE | `/api/memories/:id` | 删除记忆 |
| GET | `/api/contacts/:id/messages` | 消息 + 草稿 + 记忆 + 流程 |
| POST | `/api/contacts/:id/messages` | 写入对方消息并触发规则 |
| POST | `/api/contacts/:id/draft` | 生成草稿 |
| POST | `/api/contacts/:id/draft/clear` | 清空草稿 |
| POST | `/api/contacts/:id/send` | 发送（AI / 人工） |
| POST | `/api/contacts/:id/translate` | 翻译 |
| GET/POST | `/api/flows` | 流程列表 / 新建 |
| POST | `/api/flows/:id/select` | 联系人加入流程 |
| POST | `/api/flows/:id/advance` | 标记「对方自述 / 已核实」 |
| GET | `/api/flows/:id/events` | 流程事件 |
| GET/POST | `/api/knowledge` | 知识库 |
| GET | `/api/audit?type=` | 审计日志 |
| GET | `/api/usage` | 用量与 7 日趋势 |
| PATCH | `/api/settings` | 自动化与安全设置 |

---

## 七、权限模型

本复刻版是**单角色**设计，没有独立的管理员后台：

- **工作区用户**：对自己工作区拥有全部权限——联系人、记忆、流程、知识库、审计、自动化设置、删除数据。
- **部署者（你）**：拥有服务器、`data/db.json`、`.env` 的完全控制权，可查看/修改所有数据、重置实例、配置模型与通道。
- **没有**：跨用户管理、账号封禁、角色分配、全局公告等运营后台。

如果要多用户运营，建议补：`role` 字段（admin/user）、管理员路由守卫、用户列表与用量统计、账号禁用与配额管理。

---

## 七、安全设计

- **默认不自动发送**：`automationPaused=true`、`autoSendEnabled=false`、联系人默认 `draft`；
- **三重条件才自动发**：全局开关开 + 联系人设为 `auto` + 处于允许时段且未超限额；
- **禁止话题**：命中后既不生成也不发送，只记审计；
- **全量留痕**：AI 生成 / AI 发送 / 人工发送 / 流程状态 / 设置变更分别记录；
- **会话安全**：密码 scrypt + 随机盐，Cookie `HttpOnly` + `SameSite=Lax`，登录失败限流；
- **响应头**：CSP、`X-Frame-Options: DENY`、`nosniff`、`no-referrer`、`Permissions-Policy`；
- **数据本地**：仅写入 `data/db.json`，不上传任何第三方（除非你主动配置 LLM/Telegram）。

---

## 八、边界与取舍

1. **不做个人号接管**：需要 MTProto 会话凭证，违反 Telegram/WhatsApp 条款，且一旦泄露等同账号被接管。
2. **不做无标识代聊**：多地要求 AI 交互标识；产品内保留「AI 辅助声明」开关，建议对私密关系开启。
3. **不含支付**：已主动移除套餐与付费墙。若将来要商业化，再接 Stripe / 支付宝 / 微信支付，并补发票、退款、订阅生命周期。
4. **不含邮件验证**：生产环境需接 SMTP 或邮件服务商，并加验证码与频率限制。
5. **单工作区演示**：Telegram 入站默认归属最早创建的用户；生产环境需做 bot ↔ 工作区绑定。

---

## 九、可继续扩展

- WhatsApp Business Cloud API（需企业资质与模板消息审核）
- 分支流程可视化编辑器（当前用「每行一步」文本创建）
- 未回复提醒的定时任务（当前记录状态，未做定时器）
- 记忆自动抽取（从对话中提炼事实，当前为手动 + 演示数据）
- 多账号 / 团队协作 / 角色权限
- 数据导出与删除（GDPR / 个人信息保护法合规）
