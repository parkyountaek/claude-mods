#!/bin/sh
# Register these mods in root's Claude Code settings. Run: sudo sh <this folder>/install-root.sh
# Mods stay in this folder, so later edits reach root sessions with no copy.
set -eu
MODS=$(cd "$(dirname "$0")" && pwd)
ROOT_HOME=${ROOT_HOME:-$(dscl . -read /Users/root NFSHomeDirectory | awk '{print $2}')}
SETTINGS="$ROOT_HOME/.claude/settings.json"
PY=/usr/bin/python3
[ -x "$PY" ] || PY=$(command -v python3 || true)
if [ -z "$PY" ]; then
  echo "python3 를 찾지 못했습니다. Xcode 명령줄 도구를 설치한 뒤 다시 실행하세요: xcode-select --install" >&2
  exit 1
fi
mkdir -p "$ROOT_HOME/.claude"
"$PY" - "$SETTINGS" "$MODS" <<'PY'
import json, os, shutil, sys, tempfile, time
path, mods = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(path) and os.path.getsize(path):
    try:
        data = json.load(open(path))
    except ValueError as err:
        sys.exit(f"{path} 이 올바른 JSON 이 아니라서 바꾸지 않았습니다 ({err}). 파일을 고친 뒤 다시 실행하세요.")
if not isinstance(data, dict) or not isinstance(data.get("env", {}), dict):
    sys.exit(f"{path} 의 모양이 예상과 달라(맨 바깥이나 env 가 객체가 아님) 바꾸지 않았습니다.")
env = data.setdefault("env", {})
dirs = [d for d in env.get("CLAUDE_CODE_PLUGIN_DIRS", "").split(":") if d]
wanted = [f"{mods}/{m}" for m in ("token-usage", "work-alerts", "compact-handoff")]
new_dirs = dirs + [p for p in wanted if p not in dirs]
theme = f"{mods}/theme.json"
if new_dirs == dirs and env.get("CLAUDE_MODS_THEME_FILE") == theme:
    print("이미 등록돼 있습니다. 바꾼 것이 없습니다.")
    sys.exit(0)
env["CLAUDE_CODE_PLUGIN_DIRS"] = ":".join(new_dirs)
env["CLAUDE_MODS_THEME_FILE"] = theme
if os.path.exists(path):
    backup = f"{path}.bak-{time.strftime('%Y%m%d%H%M%S')}"
    shutil.copy2(path, backup)
    print("기존 설정 백업:", backup)
# Write a temp file and swap it in, so a failure never leaves a half-written settings file.
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
with os.fdopen(fd, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
if os.path.exists(path):
    os.chmod(tmp, os.stat(path).st_mode & 0o777)
else:
    os.chmod(tmp, 0o644)
os.replace(tmp, path)
print("등록 완료:", path)
PY
# Root may later write the shared theme file: keep it owned by this folder's owner and writable.
THEME="$MODS/theme.json"
[ -f "$THEME" ] || printf '{\n  "preset": "default",\n  "overrides": {}\n}\n' > "$THEME"
chown "$(stat -f %u "$MODS")" "$THEME" 2>/dev/null || true
chmod 666 "$THEME" 2>/dev/null || true
echo "root 계정에서는 소리와 macOS 알림이 나오지 않을 수 있습니다 (알림 창은 그대로 뜹니다)."
