# 📊 Leon Analytics

> 一个基于 Cloudflare Workers + D1 数据库构建的轻量级、隐私友好型网站流量统计分析系统。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange?logo=cloudflare)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-yellow?logo=cloudflare)
![Status](https://img.shields.io/badge/Status-Active-success)

**Leon Analytics** 是一个单文件的全栈统计解决方案。它无需购买服务器，利用 Cloudflare 的全球边缘网络处理请求，数据存储在 D1 SQL 数据库中。不仅部署成本极低（甚至免费），而且速度极快。

---

## 目录

- [📂 项目结构](#-项目结构)
- [✨ 功能特性](#-功能特性)
- [🛠️ 技术栈](#-技术栈)
- [🚀 部署指南](#-部署指南)
- [⚙️ 配置说明](#-配置说明)
- [💻 接入指南](#-接入指南)
- [📊 API 文档](#-api-文档)
- [📝 License](#-license)

---

## 📂 项目结构

本项目保持了极简的文件结构。

> **⚠️ 重要提示**：
> 1. 项目根目录下生成的 **`node_modules`** 文件夹（通常很大）是本地开发依赖，**请勿上传到 GitHub**。
> 2. `.gitignore` 文件已经默认配置了忽略该文件夹，请确保不要删除 `.gitignore`。
> 3. 新环境下只需运行 `npm install` 即可自动生成该文件夹。

```text
leon-analytics/
├── src/
│   └── index.js       # 核心代码：包含后端逻辑与前端 Dashboard UI (单文件全栈)
├── schema.sql         # 数据库：D1 数据库表结构初始化脚本
├── wrangler.toml      # 配置：Cloudflare Workers 项目配置文件
├── package.json       # 依赖清单：定义了项目所需的工具包
├── .gitignore         # Git配置：防止 node_modules 等垃圾文件被上传
└── README.md          # 文档：项目说明书

```

---

## ✨ 功能特性

* **🌍 全球即时统计**：利用 Cloudflare 边缘节点，毫秒级记录访问数据。
* **💾 D1 数据库驱动**：使用标准的 SQL 数据库，查询灵活，成本低廉。
* **🖥️ 单文件全栈**：后端逻辑与前端 Dashboard UI 全部集成在一个 `index.js` 文件中。
* **🎨 精美 Dashboard**：
* 支持 **暗黑/明亮模式** 自动切换。
* **多语言支持** (中文/English)。
* **交互式地图** (World Map Visualization)。
* 实时数据流与访问来源分析。


* **🔒 安全隐私**：
* 简单的密码鉴权机制。
* 不通过 Cookie 追踪个人隐私，仅记录 IP、地区、路径等基础信息。


* **📦 多站点支持**：同一个部署实例可同时统计多个网站 (`site_id`)。

---

## 🛠️ 技术栈

本项目采用极简的 Serverless 架构，追求高性能与低维护成本。

| 组件 | 技术选型 | 说明 |
| --- | --- | --- |
| **Runtime** | Cloudflare Workers | 基于 V8 Isolate 引擎，非 Node.js |
| **Database** | Cloudflare D1 | Serverless SQLite 数据库 |
| **Frontend** | HTML5 + Tailwind CSS | 通过 CDN 加载，无构建步骤 |
| **Charts** | Chart.js | 数据可视化图表 |
| **Map** | jsVectorMap | 全球访客地理分布可视化 |
| **Dev Tool** | Wrangler CLI + Node.js | 本地开发与部署工具 |

---

## 🚀 部署指南

本项目专为 Cloudflare 平台设计。

### 1. 环境准备

确保本地安装了 Node.js，并登录 Cloudflare：

```bash
npm install -g wrangler
wrangler login

```

### 2. 初始化项目与安装依赖

下载项目代码后，请务必先安装依赖（这会生成 `node_modules`）：

```bash
mkdir leon-analytics
cd leon-analytics
# 如果是克隆的代码，请运行：
npm install

```

### 3. 创建数据库

创建一个名为 `tj-db` 的 D1 数据库：

```bash
wrangler d1 create tj-db

```

> ⚠️ **注意**：命令执行成功后，请复制控制台输出的 `[[d1_databases]]` 配置块，稍后需要填入 `wrangler.toml`。

### 4. 初始化表结构

在项目根目录创建 `schema.sql`，内容如下：

```sql
DROP TABLE IF EXISTS visits;
CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT DEFAULT 'default',
    ip TEXT,
    country TEXT,
    path TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_site_id ON visits(site_id);
CREATE INDEX IF NOT EXISTS idx_timestamp ON visits(timestamp);
CREATE INDEX IF NOT EXISTS idx_country ON visits(country);

```

执行初始化命令：

```bash
npx wrangler d1 execute tj-db --remote --file=./schema.sql

```

### 5. 修改配置 (wrangler.toml)

编辑 `wrangler.toml` 文件：

```toml
name = "leon-analytics"
main = "src/index.js"
compatibility_date = "2024-01-01"

# 替换为第3步获取的数据库 ID
[[d1_databases]]
binding = "DB"
database_name = "tj-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

```

### 6. 部署上线

1. **覆盖代码**：将本项目提供的 `index.js` 内容复制到你的 `src/index.js`。
2. **设置密码**：
```bash
npx wrangler secret put ADMIN_PASSWORD
# 输入你的管理后台密码

```


3. **发布**：
```bash
npx wrangler deploy

```



---

## ⚙️ 配置说明

### 环境变量 (Secrets)

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | ✅ 是 | 访问 Dashboard 的唯一凭证。请通过 `wrangler secret put` 设置。 |

### 数据库绑定

| Binding 名称 | 说明 |
| --- | --- |
| `DB` | **不可修改**。代码逻辑通过 `env.DB` 访问数据库。 |

---

## 💻 接入指南

将以下代码添加到你网站 HTML 的 `</body>` 标签之前即可开始统计。

```html
<script>
fetch('[https://你的-worker-域名.workers.dev/api/track](https://你的-worker-域名.workers.dev/api/track)', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    site_id: 'my-blog',  // 你的站点标识
    path: window.location.pathname
  })
}).catch(e => console.error('Analytics init failed', e));
</script>

```

---

## 📊 API 文档

### 1. 上报数据

* **Endpoint**: `POST /api/track`
* **Content-Type**: `application/json`

| 参数 | 类型 | 说明 | 示例 |
| --- | --- | --- | --- |
| `site_id` | `string` | (可选) 站点标识，默认为 `default` | `"blog"` |
| `path` | `string` | (可选) 访问路径，默认为 `/` | `"/article/1"` |

### 2. 获取统计数据

* **Endpoint**: `GET /api/stats`
* **Headers**: `Authorization: <ADMIN_PASSWORD>`
* **Query Params**: `?site_id=all` 或 `?site_id=your-site-id`

---

## 📝 License

本项目基于 [MIT License](https://www.google.com/search?q=LICENSE) 开源。

Copyright (c) 2024 Leon Analytics
