<#
.SYNOPSIS
  一键安装 dsh-github-connect 插件（DeepSeek Harness，命令行版 / 官方桌面版均可）。

  懒人用法（一行）：
    powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/Moon-shiyue/dsh-github-connect/master/install.ps1 | iex"

  高级用法：
    .\install.ps1 -Dir E:\dsh\dsh_my_plugin            # 指定源码目录
    .\install.ps1 -Profile desktop                     # 装进官方桌面版 profile
    .\install.ps1 -FromGit                             # 不克隆源码，直接按 git 源安装

  脚本自动：选定 profile -> 克隆/更新源码 -> pnpm 安装依赖 -> 注册进 profile
  -> 打印对应重启方式。不会自动重启（避免中断正在运行的会话）。
#>
param(
  [string]$Dir = '',
  [string]$Profile = '',
  [switch]$SkipPull,
  [switch]$FromGit
)

$ErrorActionPreference = 'Stop'
$Name = 'dsh-github-connect'
$RepoUrl = 'https://github.com/Moon-shiyue/dsh-github-connect.git'
$HomeDsh = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }

function Die([string]$msg) {
  Write-Host "`n[错误] $msg" -ForegroundColor Red
  Write-Host @"

如果这台机器上装的是【官方桌面版】，最省事的方式是不用命令行：
  打开 DeepSeek Harness -> 设置 -> 插件 -> 安装插件 -> 填入：
    github:$($Name) 的完整地址 https://github.com/Moon-shiyue/dsh-github-connect
（桌面版内置插件管理器，会自己处理 profile 与重启。）
"@ -ForegroundColor Yellow
  exit 1
}

# 0) 选定 profile：-Profile > $env:DSH_PROFILE > 已存在的 profile > web
if (-not $Profile) {
  if ($env:DSH_PROFILE) {
    $Profile = $env:DSH_PROFILE
  } else {
    $profilesDir = Join-Path $HomeDsh 'profiles'
    $existing = @()
    if (Test-Path $profilesDir) {
      $existing = Get-ChildItem $profilesDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName 'package.json') } | Select-Object -ExpandProperty Name
    }
    if ($existing.Count -eq 1) { $Profile = $existing[0] }
    elseif ($existing -contains 'desktop') { $Profile = 'desktop' }
    else { $Profile = 'web' }
    if ($existing.Count -gt 1) {
      Write-Host "==> 检测到多个 profile: $($existing -join ', ')（默认选 '$Profile'，可用 -Profile 指定）" -ForegroundColor DarkGray
    }
  }
}
$isDesktop = $Profile -eq 'desktop'
$targetLabel = if ($isDesktop) { "官方桌面版 profile '$Profile'" } else { "profile '$Profile'" }

Write-Host "==> 安装 $Name 插件 -> $targetLabel" -ForegroundColor Cyan

# 1) dsh CLI（仅注册步骤需要；桌面版可改用内置插件管理器）
$dshCmd = Get-Command dsh -ErrorAction SilentlyContinue

# 2) pnpm（corepack 兜底）
$pnpmCmd = $null
if (Get-Command pnpm -ErrorAction SilentlyContinue) { $pnpmCmd = 'pnpm' }
else {
  try {
    $null = & corepack pnpm --version 2>$null
    if ($LASTEXITCODE -eq 0) { $pnpmCmd = 'corepack pnpm' }
  } catch { $pnpmCmd = $null }
}

function Show-Restart {
  Write-Host ""
  Write-Host "  ✅ 安装完成！插件已加入 $targetLabel 的 bundles。" -ForegroundColor Green
  Write-Host "     最后一步：重启 DeepSeek Harness ——"
  if ($isDesktop) {
    Write-Host "       1. 完全退出 DeepSeek Harness 桌面应用（托盘图标也要退出）；"
    Write-Host "       2. 重新打开应用；"
    Write-Host "       3. 对话框左下角出现 GitHub 按钮即成功。"
  } else {
    Write-Host "       1. 完全退出当前 dsh web；"
    Write-Host "       2. 重新运行: dsh web"
    Write-Host "       3. 刷新页面，对话框左下角出现 GitHub 按钮即成功。"
  }
  Write-Host "     卸载：dsh plugin --profile $Profile remove $Name"
}

# 2.5) 不克隆源码：直接按 git 源注册（等价于桌面版插件管理器的做法）
if ($FromGit) {
  if (-not $dshCmd) { Die '未找到 dsh 命令，无法按 git 源注册。' }
  Write-Host "==> 按 git 源注册：github:Moon-shiyue/$Name"
  & dsh plugin --profile $Profile add "github:Moon-shiyue/$Name" 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Die "注册失败（profile '$Profile' 是否存在？）" }
  Show-Restart
  exit 0
}

# 3) git / pnpm / dsh 检查
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Die '未找到 git，请先安装 Git for Windows' }
if (-not $pnpmCmd) { Die '未找到 pnpm。请先安装：npm i -g pnpm' }
if (-not $dshCmd) {
  Die '未找到 dsh 命令（桌面版自带运行时，命令行注册需要独立安装的 dsh CLI）。'
}

# 4) 目标目录（默认 $DSH_HOME/plugins/<name>）
if (-not $Dir) { $Dir = Join-Path (Join-Path $HomeDsh 'plugins') $Name }
$Dir = [System.IO.Path]::GetFullPath($Dir)

# 5) 克隆 / 更新
if (Test-Path (Join-Path $Dir '.git')) {
  if (-not $SkipPull) {
    Write-Host "==> 更新已有代码: $Dir"
    Push-Location $Dir
    try { git pull --ff-only | Out-Host } catch { Write-Host "  (更新失败，继续使用现有代码)" -ForegroundColor Yellow }
    finally { Pop-Location }
  }
} else {
  Write-Host "==> 克隆仓库到 $Dir"
  New-Item -ItemType Directory -Force -Path (Split-Path $Dir -Parent) | Out-Null
  git clone --depth 1 $RepoUrl $Dir | Out-Host
  if ($LASTEXITCODE -ne 0) { Die "git clone 失败。若网络需要代理：git config --global http.proxy http://127.0.0.1:端口 后重试" }
}

# 6) 依赖
Write-Host "==> 安装依赖 (pnpm install)"
Push-Location $Dir
try {
  if ($pnpmCmd -eq 'pnpm') { & pnpm install --no-frozen-lockfile 2>&1 | Out-Host }
  else { & corepack pnpm install --no-frozen-lockfile 2>&1 | Out-Host }
  if ($LASTEXITCODE -ne 0) { Die 'pnpm install 失败，请检查网络后重试' }
} finally { Pop-Location }

# 7) 注册进 profile（重复执行是幂等的）
$linkSpec = 'link:' + ($Dir -replace '\\', '/')
Write-Host "==> 注册进 profile '$Profile'"
& dsh plugin --profile $Profile add $linkSpec 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Die "注册失败。profile '$Profile' 不存在？可指定其它：.\install.ps1 -Profile <名称>" }

Show-Restart
