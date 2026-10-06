#!/bin/sh
# Register these mods in root's Claude Code settings. Run: sudo sh <this folder>/install-root.sh
# Mods stay in this folder, so later edits reach root sessions with no copy.
set -eu
MODS=$(cd "$(dirname "$0")" && pwd)
ROOT_HOME=${ROOT_HOME:-$(dscl . -read /Users/root NFSHomeDirectory | awk '{print $2}')}
SETTINGS="$ROOT_HOME/.claude/settings.json"
mkdir -p "$ROOT_HOME/.claude"
[ -f "$SETTINGS" ] && cp "$SETTINGS" "$SETTINGS.bak-$(date +%Y%m%d%H%M%S)"
/usr/bin/python3 - "$SETTINGS" "$MODS" <<'PY'
import json, os, sys
path, mods = sys.argv[1], sys.argv[2]
data = json.load(open(path)) if os.path.exists(path) and os.path.getsize(path) else {}
env = data.setdefault("env", {})
dirs = [d for d in env.get("CLAUDE_CODE_PLUGIN_DIRS", "").split(":") if d]
for m in ("token-usage", "work-alerts", "compact-handoff"):
    p = f"{mods}/{m}"
    if p not in dirs:
        dirs.append(p)
env["CLAUDE_CODE_PLUGIN_DIRS"] = ":".join(dirs)
env["CLAUDE_MODS_THEME_FILE"] = f"{mods}/theme.json"
json.dump(data, open(path, "w"), indent=2, ensure_ascii=False)
print(path, "->", env)
PY
