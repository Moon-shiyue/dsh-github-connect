# AGENTS.md — 给 AI 助手的工作指引

## 一键安装

用户说「**请你安装这个插件**」或粘贴仓库链接时，**先判断宿主是哪种**：

- **官方桌面版（DSH Desktop）**：profile 名是 `desktop`（环境变量 `DSH_PROFILE` 可确认）。
  推荐让用户走内置插件管理器：设置 → 插件 → 安装插件 → 填仓库地址；命令行等价做法：
  `dsh plugin --profile desktop add github:Moon-shiyue/dsh-github-connect`。
  装完**必须完全退出并重新打开应用**。
- **命令行版（dsh web，profile `web`）**：
  - Windows（一条命令，含克隆/依赖/注册）：
    ```powershell
    powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/Moon-shiyue/dsh-github-connect/master/install.ps1 | iex"
    ```
  - macOS / Linux：
    ```bash
    curl -fsSL https://raw.githubusercontent.com/Moon-shiyue/dsh-github-connect/master/install.sh | bash
    ```
  - 手动等价步骤：`git clone` → `pnpm install` → `dsh plugin --profile web add link:<绝对路径>`。

`install.ps1` / `install.sh` 会自动识别 profile（`-Profile` / `$DSH_PROFILE` / 已存在的
profile 推断，desktop 优先），并打印对应重启方式。

**重要**：安装完成后**不要自行重启宿主**（会中断当前会话）——明确告诉用户：
命令行版「重启 `dsh web` 并刷新页面」，桌面版「退出并重新打开应用」。

## 桌面版兼容性约束（别踩坑）

1. **host 半不要运行时 `import` 任何 `@deepseek-ai/*` 官方包**：profile 安装不会把官方包
   放进 `profiles/<name>/node_modules`（官方桌面版 profile 里一个 `@deepseek-ai/*` 都没有），
   运行时会解析失败。工具定义请手写 cordis `ToolDefinition`（JSON Schema + `execute`），
   见 `lib/index.js` 的 `createGithubTool()`。
2. **peer 只声明 `@deepseek-ai/cordis`**。桌面版有**版本兼容闸门**（`pluginManager` 的
   `incompatible-version`）：peer 范围必须覆盖运行时的实际版本（当前桌面版 = dsh 0.2.0-rc.2，
   cordis ~4.0.4）。要放宽范围时，按官方约定给每个 major.minor.patch 元组加带预发布标签的
   `||` 分支，否则预发布版本会被静默排除。
3. **凭据不要放在包目录内**：插件更新时 pnpm 会整体替换包目录，放在里面的令牌会被删掉。
   现在存 `$DSH_HOME/.dsh-github-connect/auth.json`（同 home 的多个 profile 共用一份连接），
   旧位置 `<插件>/.github-auth.json` 会被读取并自动迁移。
4. 客户端 bundle 契约不变：`window.__ModuleLoader__.load({ id, factory })`，`dsh.client`
   支持 `platform` / `inject` / `external` / `immediately`；slot 仍是
   `conversation.input.left` 与 `conversation.input.overlay`（list，`id`/`order`/`label`，
   标准属性含 `sessionId`）。

## 架构速览

| 文件 | 职责 |
| --- | --- |
| `lib/index.js` | host 半：`/dsh-github/*` 路由（status/verify/device/pat/disconnect）、OAuth 设备流、凭据存储、手写的 `github_api` 工具定义 |
| `lib/client.js` | 浏览器半：composer 左下角 GitHub 按钮 + 居中连接面板（`conversation.input.left` / `conversation.input.overlay`） |
| `lib/net.js` | 跨平台网络层：代理解析（环境变量 → Windows 系统代理 → 配置）与系统 CA（Windows 证书库 / macOS/Linux 标准路径） |
| `install.ps1` / `install.sh` | 一键安装脚本（幂等，自动识别 desktop/web profile） |
| `tests/smoke.mjs` | 冒烟测试：`node tests/smoke.mjs`（**绝不破坏已连接状态**，连接存在时自动跳过破坏性用例） |

## 使用与排障

- 连接流程：点左下角 GitHub 按钮 → 设备流（需用户自己的 OAuth App Client ID）或粘贴 fine-grained PAT。
- 面板打开时会调用 `POST /dsh-github/verify` 在线校验令牌：成功刷新「最近验证」，
  401 自动清除连接，网络异常则保留令牌并给出黄色提示。
- 连接后 AI 用 `github_api` 工具（method/path/body 调 `api.github.com`）替用户操作 GitHub；
  若返回「GitHub 未连接 / 401」，提示用户先点按钮授权，不要重试。
- 报错定位：`Bad credentials` = 令牌无效；`UNABLE_TO_VERIFY_LEAF_SIGNATURE` 等网络类错误 =
  代理/证书问题，先看 `lib/net.js` 的自动代理逻辑，仍失败再让用户按 README 配置 `proxy`。
- 令牌只存 `$DSH_HOME/.dsh-github-connect/auth.json`，排障时不要打印令牌内容。

## 改代码后如何生效

- 只改 client（`lib/client.js`）：刷新页面即可（host 会重扫 bundle）。
- 改了 host（`lib/index.js` / `lib/net.js`）：命令行版重启 `dsh web`；桌面版退出并重新打开应用。
