#!/usr/bin/env bash
# 一键安装 dsh-github-connect 插件（DeepSeek Harness，macOS / Linux）
#
# 懒人用法（一行）：
#   curl -fsSL https://raw.githubusercontent.com/Moon-shiyue/dsh-github-connect/master/install.sh | bash
#
# 高级用法：
#   bash install.sh [profile] [dir] [--from-git]
#     profile   目标 profile；省略时用 $DSH_PROFILE，再按已存在的 profile 推断（desktop 优先），否则 web
#     dir       源码目录；省略时为 $DSH_HOME/plugins/dsh-github-connect（--from-git 时忽略）
#     --from-git 不克隆源码，直接按 git 源注册（等价于桌面版插件管理器的做法）
set -euo pipefail

NAME="dsh-github-connect"
REPO="https://github.com/Moon-shiyue/dsh-github-connect.git"
HOME_DSH="${DSH_HOME:-$HOME/.dsh}"

PROFILE="${1:-}"
DIR_ARG="${2:-}"
FROM_GIT=0
for arg in "$@"; do
  [ "$arg" = "--from-git" ] && FROM_GIT=1
done

die() {
  printf '\n[错误] %s\n' "$*" >&2
  cat >&2 <<'HINT'

如果这台机器上装的是【官方桌面版】，最省事的方式是不用命令行：
  打开 DeepSeek Harness -> 设置 -> 插件 -> 安装插件 -> 填入仓库地址：
    https://github.com/Moon-shiyue/dsh-github-connect
（桌面版内置插件管理器，会自己处理 profile 与重启。）
HINT
  exit 1
}

# 选定 profile
if [ -z "$PROFILE" ]; then
  if [ -n "${DSH_PROFILE:-}" ]; then
    PROFILE="$DSH_PROFILE"
  else
    found=""
    for d in "$HOME_DSH"/profiles/*/; do
      [ -f "${d}package.json" ] && found="$found $(basename "$d")"
    done
    count=$(echo "$found" | wc -w | tr -d ' ')
    if [ "$count" = "1" ]; then
      PROFILE=$(echo "$found" | tr -d ' ')
    elif echo " $found " | grep -q ' desktop '; then
      PROFILE=desktop
      echo "==> 检测到多个 profile:$found（默认 desktop，可用第一个参数指定）"
    else
      PROFILE=web
    fi
  fi
fi

if [ "$PROFILE" = "desktop" ]; then
  TARGET_LABEL="官方桌面版 profile 'desktop'"
else
  TARGET_LABEL="profile '$PROFILE'"
fi

echo "==> 安装 ${NAME} 插件 -> ${TARGET_LABEL}"

command -v dsh >/dev/null 2>&1 || die "未找到 dsh 命令（桌面版自带运行时，命令行注册需要独立安装的 dsh CLI）"

restart_hint() {
  echo ""
  echo "  ✅ 安装完成！插件已加入 ${TARGET_LABEL} 的 bundles。"
  echo "     最后一步：重启 DeepSeek Harness ——"
  if [ "$PROFILE" = "desktop" ]; then
    echo "       1. 完全退出 DeepSeek Harness 桌面应用；"
    echo "       2. 重新打开应用；"
    echo "       3. 对话框左下角出现 GitHub 按钮即成功。"
  else
    echo "       1. 完全退出当前 dsh web；"
    echo "       2. 重新运行: dsh web"
    echo "       3. 刷新页面，对话框左下角出现 GitHub 按钮即成功。"
  fi
  echo "     卸载：dsh plugin --profile $PROFILE remove $NAME"
}

if [ "$FROM_GIT" = "1" ]; then
  echo "==> 按 git 源注册：github:Moon-shiyue/$NAME"
  dsh plugin --profile "$PROFILE" add "github:Moon-shiyue/$NAME"
  restart_hint
  exit 0
fi

command -v pnpm >/dev/null 2>&1 || die "未找到 pnpm。请先安装：npm i -g pnpm"
command -v git >/dev/null 2>&1 || die "未找到 git"

DIR="${DIR_ARG:-${HOME_DSH}/plugins/${NAME}}"
mkdir -p "$(dirname "$DIR")"
if [ -d "$DIR/.git" ]; then
  echo "==> 更新已有代码: $DIR"
  git -C "$DIR" pull --ff-only || echo "  (更新失败，继续使用现有代码)"
else
  echo "==> 克隆仓库到 $DIR"
  git clone --depth 1 "$REPO" "$DIR"
fi

echo "==> 安装依赖 (pnpm install)"
(cd "$DIR" && pnpm install --no-frozen-lockfile)

echo "==> 注册进 profile '$PROFILE'"
dsh plugin --profile "$PROFILE" add "link:${DIR}"

restart_hint
