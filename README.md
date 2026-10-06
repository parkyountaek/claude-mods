# pyt-mods

Claude Code mods (plugins built from function hooks).

| mod | 하는 일 | 명령 |
| --- | --- | --- |
| `token-usage` | 입력창 위 한 줄에 컨텍스트 사용량, 5시간·7일 사용 한도, 메인 모델과 effort를 보여줍니다. 실행 중인 서브에이전트는 ①②③ 번호와 색으로 구분해 한 줄씩, 모델·ctx·지금 보는 파일과 함께 보여줍니다. 이름을 누르면 그 서브에이전트의 작업 내용이 옆 창에 열립니다(👁 표시). | `/token-usage` 펼치기/접기, `/token-usage theme` |
| `work-alerts` | 오래 걸린 작업이 끝났을 때, 테스트·검사가 실패했을 때, 한도가 찼을 때 알림 창과 소리로 알려줍니다. | `/task-alert` 소리 켜기/끄기, `/alerts` 세부 설정 |
| `compact-handoff` | 할 일이 있을 때 진행 상황(▶ 2/5 …)을 보여주고, 대화가 압축되어도 작업을 이어가도록 메모를 남깁니다. | `/work`, `/handoff` |

## 설치

Claude Code 안에서 하나씩 설치합니다:

```
/plugin install token-usage --marketplace parkyountaek/claude-mods
/plugin install work-alerts --marketplace parkyountaek/claude-mods
/plugin install compact-handoff --marketplace parkyountaek/claude-mods
```

이 폴더를 직접 받아 쓸 때는 `~/.claude/settings.json`의 `env`에 경로를 등록합니다:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/token-usage:~/.claude/mods/work-alerts:~/.claude/mods/compact-handoff" } }
```

### root 계정에서도 쓰기

```
sudo sh ~/.claude/mods/install-root.sh
```

root 설정에 이 폴더의 mod 경로를 추가합니다(기존 설정은 백업). 복사하지 않으므로 mod를 고치면 root에도 바로 적용됩니다. 테마는 `theme.json` 하나를 같이 씁니다.

## 개발

```
claude plugin validate <mod>
claude plugin test <mod>
```
