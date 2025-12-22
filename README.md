# Jira Query MCP Server

一个用于查询 Jira 问题的 Model Context Protocol (MCP) 服务器，可以在 Kiro IDE 中直接查询 Jira 卡片信息。

## 功能特性

- 通过 Jira 问题 Key 查询详细信息
- 创建一个基础 Jira 工单（ticket），并在创建后自动查询详情
- 支持代理配置（可选）
- 返回结构化的 Jira 问题数据，包括：
  - 基本信息（标题、描述、状态、负责人等）
  - 优先级和问题类型
  - 创建和更新时间
  - 标签和评论
  - 附件信息

## 安装步骤

### 1. 克隆项目

```bash
git clone https://github.com/OneForCheng/jira-query-mcp.git
cd jira-query-mcp
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 MCP 服务器

在 Kiro IDE 中配置 MCP 服务器，有两种配置方式：

#### 方式一：用户级别配置（推荐）

编辑用户级别的 MCP 配置文件 `~/.kiro/settings/mcp.json`：

```json
{
  "mcpServers": {
    "jira-query": {
      "command": "node",
      "args": [
        "/path/to/your/jira-query-mcp/index.js"
      ],
      "cwd": "/path/to/your/jira-query-mcp",
      "env": {
        "NODE_TLS_REJECT_UNAUTHORIZED": "0",
        "JIRA_HOST": "https://your-jira-instance.com",
        "JIRA_API_TOKEN": "your-jira-api-token",
        "JIRA_API_VERSION": "2",
        "PROXY_AGENT": "socks5h://127.0.0.1:1080"
      },
      "disabled": false,
      "autoApprove": [
        "get_jira_issue",
        "create_jira_issue"
      ]
    }
  }
}
```

#### 方式二：工作区级别配置

在项目根目录创建 `.kiro/settings/mcp.json`：

```json
{
  "mcpServers": {
    "jira-query": {
      "command": "node",
      "args": [
        "/path/to/your/jira-query-mcp/index.js"
      ],
      "cwd": "/path/to/your/jira-query-mcp",
      "env": {
        "NODE_TLS_REJECT_UNAUTHORIZED": "0",
        "JIRA_HOST": "https://your-jira-instance.com",
        "JIRA_API_TOKEN": "your-jira-api-token",
        "JIRA_API_VERSION": "2",
        "PROXY_AGENT": "socks5h://127.0.0.1:1080"
      },
      "disabled": false,
      "autoApprove": [
        "get_jira_issue"
      ]
    }
  }
}
```

## 环境变量配置

### 必需的环境变量

| 变量名 | 描述 | 示例 |
|--------|------|------|
| `JIRA_HOST` | Jira 实例的 URL | `https://your-company.atlassian.net` |
| `JIRA_API_TOKEN` | Jira API Token | `your-api-token-here` |

### 可选的环境变量

| 变量名 | 描述 | 示例 | 默认值 |
|--------|------|------|--------|
| `JIRA_API_VERSION` | Jira REST API 版本 | `2` 或 `3` | `2` |
| `PROXY_AGENT` | 代理服务器地址 | `socks5h://127.0.0.1:1080` | 无（不使用代理） |
| `NODE_TLS_REJECT_UNAUTHORIZED` | 是否验证 TLS 证书 | `0` 或 `1` | `1` |

### 获取 Jira API Token

1. 登录到你的 Jira 实例
2. 进入 **用户信息** > **个人访问令牌**
3. 点击 **创建令牌**
4. 输入 Token 名称并创建
5. 复制生成的 Token（注意：Token 只显示一次）

### 代理配置说明

如果你的网络环境需要通过代理访问 Jira，可以设置 `PROXY_AGENT` 环境变量。本服务器支持多种代理协议：

#### SOCKS 代理
- **SOCKS5**：`socks5://127.0.0.1:1080`
- **SOCKS5 with hostname resolution**：`socks5h://127.0.0.1:1080`
- **SOCKS4**：`socks4://127.0.0.1:1080`
- **通用 SOCKS**：`socks://127.0.0.1:1080`

#### HTTP/HTTPS 代理
- **HTTP 代理**：`http://proxy.company.com:8080`
- **HTTPS 代理**：`https://proxy.company.com:8080`
- **带认证的代理**：`http://username:password@proxy.company.com:8080`

#### 代理配置示例

```json
{
  "env": {
    "PROXY_AGENT": "socks5h://127.0.0.1:1080"
  }
}
```

或者使用 HTTP 代理：

```json
{
  "env": {
    "PROXY_AGENT": "http://proxy.company.com:8080"
  }
}
```

如果不需要代理，可以不设置此环境变量或将其留空。

## 使用方法

配置完成后，在 Kiro IDE 中可以使用以下工具：

### get_jira_issue

查询指定的 Jira 问题。

**参数：**
- `issueKey` (string): Jira 问题的 Key，例如 "PROJ-123"

**示例：**
```javascript
// 在 Kiro IDE 中使用
get_jira_issue({ issueKey: "PROJ-123" })
```

**返回数据包含：**
- 问题基本信息（Key、标题、描述）
- 状态和负责人
- 优先级和问题类型
- 时间信息（创建时间、更新时间）
- 标签和评论列表
- 附件信息（文件名、作者、创建时间、大小、MIME类型、下载链接）

### create_jira_issue

创建一个基础 Jira 工单（ticket），并在创建完成后自动调用 `get_jira_issue` 同样的接口拉取详情。

**参数：**
- `projectKey` (string): Jira 项目的 Key，例如 `"PROJ"`
- `summary` (string): 工单标题
- `description` (string, optional): 工单描述
- `issueType` (string, optional): 工单类型，例如 `"Task"` / `"Bug"`，默认 `"Task"`

**示例：**
```javascript
// 在 Kiro IDE 中使用
create_jira_issue({
  projectKey: "PROJ",
  summary: "Investigate login timeout",
  description: "Steps to reproduce: ...",
  issueType: "Task"
})
```

**返回：**
- `message`: 创建成功提示
- `created`: Jira 创建接口直接返回的 `key/id/self`
- `issue`: 创建后再次查询到的结构化 issue 数据（与 `get_jira_issue` 一致）

### create_jira_ticket_template

按固定模板创建工单，目标是生成类似：
- **Summary**：`【子应用】标题`
- **Description**：包含“提出日期 / 任务描述 / 解决方案（留空）”

**参数：**
- `projectKey` (string): Jira 项目的 Key，例如 `"MYSCHCN"`
- `appName` (string): 子应用名称（会被包裹在中文中括号 `【】` 中）
- `title` (string): 工单标题（拼接在 `【appName】` 后）
- `taskDescription` (string): 放到 “任务描述：” 下面的正文
- `submittedDate` (string, optional): 提出日期（`YYYY-MM-DD`），默认取本地当天日期
- `issueType` (string, optional): 工单类型，默认 `"Task"`

**示例：**
```javascript
create_jira_ticket_template({
  projectKey: "MYSCHCN",
  appName: "微信运营平台运维",
  title: "用户信息界面，需要将未关注的用户和关注后取消的用户区分开",
  taskDescription: "（这里填写详细任务描述，可多行）",
  submittedDate: "2025-11-27",
  issueType: "Task"
})
```

## 故障排除

### 常见问题

1. **连接超时或无法访问 Jira**
   - 检查 `JIRA_HOST` 是否正确
   - 如果在公司网络环境，确认是否需要配置代理

2. **认证失败**
   - 验证 `JIRA_API_TOKEN` 是否正确
   - 确认 Token 是否已过期

3. **TLS/SSL 证书错误**
   - 设置 `NODE_TLS_REJECT_UNAUTHORIZED=0` 来跳过证书验证（仅用于开发环境）

4. **MCP 服务器无法启动**
   - 检查 Node.js 版本是否兼容
   - 确认项目路径是否正确
   - 查看 Kiro IDE 的 MCP 服务器日志

### 调试模式

如需调试，可以在环境变量中添加：

```json
{
  "env": {
    "DEBUG": "mcp:*",
    "FASTMCP_LOG_LEVEL": "DEBUG"
  }
}
```

## 项目结构

```
jira-query-mcp/
├── index.js           # MCP 服务器主文件
├── package.json       # 项目依赖配置
├── package-lock.json  # 依赖锁定文件
└── README.md         # 本文档
```

## 依赖项

- `@modelcontextprotocol/sdk` - MCP SDK
- `node-fetch` - HTTP 请求库
- `socks-proxy-agent` - SOCKS 代理支持
- `https-proxy-agent` - HTTP/HTTPS 代理支持

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！

## 更新日志

### v1.0.0
- 初始版本
- 支持基本的 Jira 问题查询
- 支持多种代理协议（SOCKS4/5、HTTP/HTTPS）
- 智能代理协议检测
- 环境变量配置支持
