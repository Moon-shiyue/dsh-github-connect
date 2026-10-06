# dsh-github-connect

便携式 GitHub 连接插件：在 DeepSeek Harness 对话框的**左下方**放一个 GitHub 按钮，
一键让 DeepSeek 等 AI 连接你的 GitHub 账号；连接后，AI 可以直接通过 `github_api`
工具读取和操作你的 GitHub（Issues、PR、仓库、Gist、Actions 等）。

> Portable：连接流程使用 GitHub **OAuth 设备流**（或粘贴 PAT），不需要自建回调
> 服务器，不经过任何第三方中转，令牌只保存在本机 DSH home 里。整个文件夹拷到
> 另一台机器装上就能用。

## 特性

- **左下角常驻按钮**：composer 工具行左端显示 GitHub 图标 + 连接状态（绿点 = 已连接）。
- **两种连接方式**：
  - OAuth 设备流（推荐）：填你自己的 GitHub OAuth App Client ID → 浏览器打开
    `github.com/login/device` → 输入验证码 → 自动轮询直到授权完成；
  - 粘贴 Personal Access Token（建议 fine-grained PAT）。
- **打开即校验**：按钮与面板打开时用真实令牌向 GitHub 校验一次，失效自动清除、
  显示「最近验证」时间；网络异常时保留令牌不误登出。
- **AI 侧 `github_api` 工具**：连接后，AI 可对 `api.github.com` 发 REST 请求，
  并自动附带 system prompt 引导。
- **凭据存于 DSH home**：`$DSH_HOME/.dsh-github-connect/auth.json`（不在插件目录里，
  所以插件更新不会丢失连接；同一 DSH home 下的所有 profile 共用一份连接）。
- **适配命令行版与官方桌面版**：host 半不依赖任何 `@deepseek-ai/*` 官方包的运行时导入，
  peer 只声明 `@deepseek-ai/cordis`；profile 安装（含桌面版内置插件管理器）开箱即用。
- 零构建、零运行时框架：host 半是纯 ESM，client 半是纯 `__ModuleLoader__` 模块。

## 安装

### 官方桌面版（DSH Desktop）

最省事的方式是**用它内置的插件管理器**：

1. 打开 DeepSeek Harness → **设置 → 插件 → 安装插件**；
2. 仓库地址填 `https://github.com/Moon-shiyue/dsh-github-connect`（或 git 源 `github:Moon-shiyue/dsh-github-connect`）；
3. 安装完成后**完全退出并重新打开应用**，对话框左下角出现 GitHub 按钮即成功。

命令行等价做法（需要机器上有独立安装的 `dsh` CLI）：

```powershell
# 直接按 git 源装进桌面版 profile（等价于插件管理器的做法）
dsh plugin --profile desktop add github:Moon-shiyue/dsh-github-connect

# 或先克隆源码再以本地路径安装（便于改代码）
git clone https://github.com/Moon-shiyue/dsh-github-connect.git
cd dsh-github-connect; pnpm install
dsh plugin --profile desktop add link:<本目录绝对路径>
```

> 桌面版的 profile 名是 **`desktop`**（见环境变量 `DSH_PROFILE`），与命令行版的 `web` 是两个独立 profile。
> 一次连接在本机是共享的：凭据在 DSH home 下，两个 profile 都能直接用。

### 命令行版（dsh web）

**在 DSH 对话里对 AI 说一句话**：

> 请你安装这个插件：https://github.com/Moon-shiyue/dsh-github-connect

**或复制下面这一行命令**（Windows，任选其一执行）：

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/Moon-shiyue/dsh-github-connect/master/install.ps1 | iex"
```

（macOS / Linux）：

```bash
curl -fsSL https://raw.githubusercontent.com/Moon-shiyue/dsh-github-connect/master/install.sh | bash
```

一键脚本会自动完成：**选定 profile（自动识别桌面版/命令行版）→ 克隆代码 →
pnpm 安装依赖 → 注册进 profile → 打印对应的重启方式**。重复执行是安全的（幂等，会自动更新代码）。

> 高级用法：`install.ps1 -Profile desktop -FromGit`、`install.ps1 -Dir <目录>` /
> `bash install.sh [profile] [dir] [--from-git]`
> 卸载：`dsh plugin --profile <profile> remove dsh-github-connect`

### 手动安装（命令行版）

```powershell
git clone https://github.com/Moon-shiyue/dsh-github-connect.git
cd dsh-github-connect
pnpm install
dsh plugin --profile web add link:<本目录绝对路径>
dsh web
```

验证 composition：

```powershell
dsh --dump-config --profile web   # 应包含 dsh-github-connect 行
```

卸载：

```powershell
dsh plugin --profile web remove dsh-github-connect
```

## 网络与代理（跨平台，开箱即用）

插件自带独立的受信网络层（`lib/net.js`，基于 undici），**默认自动走代理**，
无需设置任何环境变量：

- **代理解析顺序**（对每个 GitHub 请求）：
  1. 插件配置 `proxy`（见下）；
  2. 环境变量 `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY`（含小写形式，macOS/Linux 常见）；
  3. Windows 系统代理（注册表 WinINET 设置，自动读取）；
  4. 都没有 → 直连。
- **NO_PROXY**：环境变量 `NO_PROXY` 与配置项 `noProxy` 都会生效（支持 `*`、
  `host:port`、`.domain` 后缀），默认豁免 `localhost`/`127.0.0.1`。
- **系统 CA 信任**：Windows 从系统证书库导出根证书（缓存 30 天，自动刷新）；
  macOS/Linux 读取标准 CA 包路径（`/etc/ssl/certs/ca-certificates.crt` 等）。
  解决“unable to verify the first certificate”（本地 TLS 拦截代理的根证书
  不在 Node 内置证书库）以及直连被重置的问题。
- 所有步骤失败都优雅回退到 Node 默认 fetch，插件不会因此崩溃。

**手动指定代理**（在 profile 的 `cordis.patch.yml` 里给该行加配置）：

```yaml
- id: dsh-github-connect
  name: dsh-github-connect
  config:
    proxy: http://127.0.0.1:7890   # auto（默认）| direct | http(s)://host:port
    noProxy:                       # 可选：这些主机不走代理
      - localhost
      - 127.0.0.1
    authFile: D:\secrets\gh-auth.json   # 可选：把凭据放到别处
```

> 注：`.github-ca-cache.pem` 是本机生成的 CA 缓存（已 gitignore），换机器后
> 会自动重新生成，无需手工处理。

## 使用

1. 点击对话框左下角的 **GitHub** 按钮。
2. 未连接时选择：
   - **设备流登录**：填入 GitHub OAuth App 的 Client ID（在
     [github.com/settings/developers](https://github.com/settings/developers)
     创建，无需回调地址），按需调整 scopes，点「开始连接」，在打开的页面输入验证码；
   - **粘贴 Token**：填入 fine-grained PAT（建议只授予需要的仓库与权限）。
3. 看到「✓ 已连接」后，直接对话即可，例如：
   - “把我账号里的 open issues 列出来”
   - “给 xxx/yyy 仓库提一个 issue，标题…内容…”
4. 想断开时，面板里点「断开连接」（需二次确认）。

## 安全说明

- 令牌只保存在本机 DSH home 下的 `$DSH_HOME/.dsh-github-connect/auth.json`
  （Windows 默认 `C:\Users\<你>\.dsh\.dsh-github-connect\auth.json`），除直接发送到
  `api.github.com` 外不经过任何其他服务器；请勿分享该文件。
- 0.1.x 曾把凭据放在插件目录（`<插件>/.github-auth.json`）；0.2.0 起会读取旧位置并
  自动迁移到 home，旧文件随后被清空——插件更新（pnpm 会替换整个包目录）因此不会
  再丢失连接。
- 本插件不会向任何第三方上传数据，client↔host 走本机同源路由（带 Origin 校验）。
- 断开连接仅删除本地凭据文件；为保险起见也可在 GitHub 的
  Settings → Applications / Tokens 里直接 revoke。
- PAT 请用最小权限（fine-grained）；OAuth 设备流的 scopes 默认
  `repo gist read:org workflow`，可在面板中修改。

## 目录结构

```
dsh_my_plugin/
├── package.json         # 包元数据 + dsh.bundle / dsh.client 声明（peer: @deepseek-ai/cordis）
├── cordis.patch.yml     # bundle patch 层（insert 一行）
├── install.ps1 / .sh    # 一键安装（自动识别桌面版 desktop / 命令行版 web profile）
├── lib/
│   ├── index.js         # host 半：设备流 / PAT / 凭据存储 / /dsh-github/* 路由 / github_api 工具
│   ├── net.js           # 跨平台受信网络层：代理解析 + 系统 CA（Windows/macOS/Linux）
│   └── client.js        # browser 半：左下角按钮 + 连接面板（conversation.input.left / overlay）
├── tests/smoke.mjs      # host 半冒烟测试：node tests/smoke.mjs
└── .github-ca-cache.pem # 运行时生成：系统 CA 缓存（gitignore，可随时删除）
```

## 常见问题

- **为什么设备流需要我自己的 Client ID？** 为了便携与隐私：插件不内置任何作者的
  OAuth App，授权完全发生在“你的 App ↔ 你的账号”之间。
- **AI 未连接时调用 github_api 会怎样？** 工具返回 401 结构错误，模型会提示你
  先点左下角 GitHub 按钮授权，不会卡死。
- **正确 Token 却报“Token 无效”？** 先看报错里的具体原因：
  - `Bad credentials` → 令牌确实被 GitHub 拒绝（过期/撤销/复制不完整）；
  - `无法连接 GitHub API：UNABLE_TO_VERIFY_LEAF_SIGNATURE` 或
    `ECONNRESET`/`ETIMEDOUT` → 本机有本地 TLS 拦截代理或需要走代理才能访问
    GitHub。插件自带的网络层（`lib/net.js`）会自动读取系统代理与系统证书库，
    重启宿主后一般无需任何设置即可用；仍失败时按上面的「网络与代理」章节手动配置 `proxy`。
- **桌面版装不上/装完没反应？** 桌面版 profile 名是 `desktop`；确认插件装进了
  `desktop` 而不是 `web`。桌面版内置插件管理器还会做一次**版本兼容检查**：本插件
  的 host 半不导入任何 `@deepseek-ai/*` 官方包（peer 只声明 `@deepseek-ai/cordis`），
  因此不会被版本闸门拦下。装完必须**完全退出并重新打开应用**才会加载。
- **改了代码怎么生效？** 改 client 代码刷新页面即可；改 host（lib/index.js、
  lib/net.js）代码需要重启宿主：命令行版重启 `dsh web`，桌面版退出并重新打开应用。
