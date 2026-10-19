# AI 中转站（课程表小程序 · 最小可用版）

把小程序里「从文档中识别」粘贴的杂乱课表文本，先发给这里的中转站，由大模型整理成规整 CSV，再回填到小程序里做本地解析导入。

## 为什么需要它

小程序前端代码会被反编译，大模型 API 密钥放在前端等于公开，会被盗刷扣费。所以密钥必须放在服务端，由服务端代为请求大模型——这就是「中转站」。

链路：**小程序 → 中转站（Vercel 免费部署） → 大模型（智谱 GLM-4-Flash 免费）**

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `api/relay.js` | Vercel 部署入口，访问地址为 `https://你的域名/api/relay` |
| `lib/core.js` | 核心逻辑（校验、调大模型、清洗 CSV），与平台无关 |
| `server.js` | 本地或任意 Node 主机运行入口，不用 Vercel 也能跑 |
| `package.json` | 零第三方依赖（Node 18 以上自带 fetch），不需要 npm install |

## 第一步：申请免费大模型密钥（二选一）

### 方案 A：智谱 GLM-4-Flash（真免费，推荐）

1. 打开 https://open.bigmodel.cn ，注册登录；
2. 右上角头像 → 「用户中心」→ 左侧菜单 「API keys」→ 「添加 API key」；
3. 复制生成的 key（形如 `xxxxxxxx.xxxxxxxx`），妥善保存。

### 方案 B：DeepSeek（极便宜，非免费）

1. 打开 https://platform.deepseek.com ，注册登录；
2. 「API keys」→ 「创建 API key」→ 复制；
3. 部署时环境变量按表格填：`LLM_BASE_URL` = `https://api.deepseek.com/v1`，`LLM_MODEL` = `deepseek-chat`。

## 第二步：部署到 Vercel（免费，域名免备案）

### 方式一：网页部署（推荐，不用装任何东西）

1. 登录 https://github.com ，右上角 「+」→ **New repository**，仓库名随意（如 `nuaa-ai-relay`），勾选 Public，点 **Create repository**；
2. 在仓库页点 **Add file** → **Upload files**，把本文件夹（`ai中转站`）里的 `api`、`lib`、`server.js`、`package.json` 全部拖进去，点 **Commit changes**；
3. 打开 https://vercel.com ，用 GitHub 账号登录，点 **Add New** → **Project** → **Import** 刚建的仓库；
4. **Framework Preset** 选 **Other**，其余保持默认，点 **Deploy**；
5. 部署完进入项目 → **Settings** → **Environment Variables**，逐条添加（Name / Value）：

   | Name | Value | 说明 |
   | --- | --- | --- |
   | `LLM_API_KEY` | 第一步申请的密钥 | 必填 |
   | `RELAY_TOKEN` | 自己编一个口令，如 `a1b2c3d4` | 选填但强烈建议，防止别人蹭你的免费额度 |
   | `LLM_MODEL` | `glm-4-flash` | 选填，默认即此值 |
   | `LLM_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4` | 选填，默认即此值；用 DeepSeek 改为 `https://api.deepseek.com/v1` |

6. 添加后到 **Deployments** 页面，最新那条右侧 「···」→ **Redeploy**（让环境变量生效）；
7. 回到项目 **Overview**，看到域名，例如 `https://nuaa-ai-relay.vercel.app`。

**你的中转站地址就是：`https://nuaa-ai-relay.vercel.app/api/relay`**（换成你自己的域名）。

### 方式二：命令行部署

```bash
npm i -g vercel
cd ai中转站
vercel            # 按提示登录，一路回车
vercel env add LLM_API_KEY   # 粘贴你的密钥
vercel env add RELAY_TOKEN   # 粘贴你的口令
vercel --prod     # 重新部署使环境变量生效
```

跑完会打印域名，同样拼上 `/api/relay`。

## 第三步：小程序接入

1. 打开小程序 → 底部「设置」tab → 「AI 识别（可选）」卡片：
   - **中转站地址**：填 `https://你的域名/api/relay`；
   - **访问口令**：填部署时设置的 `RELAY_TOKEN`（没设就留空）；
   - 输入即自动保存，不用点额外按钮。
2. **开发者工具里测试**：右上角「详情」→「本地设置」→ 勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。
3. **真机预览 / 发布前**：登录微信公众平台 https://mp.weixin.qq.com → 「开发管理」→「开发设置」→「服务器域名」→ **request 合法域名** → 添加 `https://你的域名`（注意：只要域名，**不要带** `/api/relay`）。vercel.app 是境外域名，不需要 ICP 备案。
4. **使用**：导入页 → 「从文档中识别」→ 把杂乱课表文本粘贴进文本框 → 点「AI 整理为规整课表」→ 等几秒，AI 整理出的 CSV 会回填到文本框 → **人工核对一遍** → 点「解析粘贴的文本」→ 确认导入。

## 本地调试（可选）

```bash
cd ai中转站
# Linux / macOS：
LLM_API_KEY=你的密钥 RELAY_TOKEN=test node server.js
# Windows PowerShell：
$env:LLM_API_KEY="你的密钥"; $env:RELAY_TOKEN="test"; node server.js
```

另开一个终端测试：

```bash
curl -s http://localhost:8787/api/relay -H "Content-Type: application/json" -d "{\"text\":\"周一 高数 1-2节 教三201 张老师；周二 线代 3-4节 教四305\",\"token\":\"test\"}"
```

正常会返回：`{"ok":true,"csv":"高数,1,1-2,教三201,张老师,all\n线代,2,3-4,教四305,,all","model":"glm-4-flash"}`

## 常见问题

- **返回 401 口令不正确**：检查小程序设置页填的口令是否和部署时 `RELAY_TOKEN` 完全一致（区分大小写）。
- **返回「中转站未配置 LLM_API_KEY」**：环境变量没加，或加完没有 Redeploy。
- **返回 502 / 504**：大模型侧的问题（免费额度并发低、网络波动），稍等重试即可。
- **返回「AI 未返回有效课表」**：原文太乱 AI 没理出来，换一段更完整的文本重试。
- **小程序里提示连接失败**：① 地址多写了 `/api/relay` 以外的路径；② 域名没加进 request 合法域名白名单；③ 真机网络问题。
- **担心额度被用完**：`RELAY_TOKEN` 一定要设，且设长一点、复杂一点。

## 不想部署？

可以不搭中转站：把课表文档或截图发到手机上的任意 AI（元宝、豆包、Kimi、ChatGPT 都行），让它「整理成 CSV：课程名,星期,节次,地点,教师,周次」，把结果发到微信，用小程序的「从文档中识别」导入——同样零成本，只是多一步手动转发。
