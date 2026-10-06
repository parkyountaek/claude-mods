# claude-mods

Claude Code mod 모음입니다. mod는 함수 훅으로 만든 플러그인입니다.

| mod | 하는 일 | 명령 |
| --- | --- | --- |
| `token-usage` | 입력창 위 한 줄에 컨텍스트(대화 기억) 사용량, 5시간·7일 사용 한도, 메인 모델과 effort를 보여줍니다. 실행 중인 서브에이전트는 ①②③ 번호와 색으로 구분해 한 줄씩 나오고, 각 줄에는 모델, 걸린 시간(⏱), ctx, 지금 보는 파일이 붙습니다. 이름을 누르면 그 서브에이전트의 작업 내용이 창으로 열립니다(👁 표시, Esc로 닫기). | `/token-usage` 펼치기/접기, `/token-usage theme` |
| `work-alerts` | 오래 걸린 작업이 끝났을 때, 테스트·검사가 실패했을 때, 한도가 찼을 때 알림 창과 소리로 알려줍니다. | `/task-alert` 소리 켜기/끄기, `/alerts` 현재 설정, `/alerts test` |
| `compact-handoff` | 할 일이 있을 때 진행 상황(▶ 2/5 …)을 보여줍니다. 대화가 압축돼도 작업을 이어가도록 메모도 남깁니다. | `/work`, `/handoff` |

## 설정: `/config`

세 mod의 설정은 모두 Claude Code의 `/config` 메뉴에 항목으로 나옵니다. 메뉴에서 바꾸면 그 자리에서 바로 적용됩니다.

- **token-usage**: 입력창 위 사용량 줄, 사용 한도 초기화 시간, 서브에이전트 줄 수(3/5/8/끄기), 서브에이전트가 지금 보는 것, 색 테마
- **work-alerts**: 작업 알림, 알림음, macOS 알림 창, 긴 작업 기준(30초/60초/2분/5분), 서브에이전트 완료 알림(알림 창만/알림 창과 소리/끄기)
- **compact-handoff**: 할 일 진행 줄, 압축 때 이어가기 메모

`/task-alert`, `/work band off` 같은 명령도 같은 항목을 바꿉니다. 그래서 메뉴와 명령의 설정이 어긋나지 않습니다.

## 설치

Claude Code 안에서 하나씩 설치합니다.

```
/plugin install token-usage --marketplace parkyountaek/claude-mods
/plugin install work-alerts --marketplace parkyountaek/claude-mods
/plugin install compact-handoff --marketplace parkyountaek/claude-mods
```

폴더를 직접 받아 쓰고 고치고 싶다면 다음처럼 합니다.

```
git clone https://github.com/parkyountaek/claude-mods ~/.claude/mods
```

그다음 `~/.claude/settings.json`의 `env`에 경로를 등록합니다.

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/token-usage:~/.claude/mods/work-alerts:~/.claude/mods/compact-handoff" } }
```

### root 계정에서도 쓰기

```
sudo sh ~/.claude/mods/install-root.sh
```

- root 설정에 이 폴더의 mod 경로를 추가합니다. 기존 설정은 먼저 백업하고, 이미 등록돼 있으면 아무것도 바꾸지 않습니다.
- 파일을 복사하지 않으므로 mod를 고치면 root에도 바로 적용됩니다.
- 테마는 `theme.json` 하나를 함께 씁니다.
- root 계정에서는 소리와 macOS 알림이 나오지 않을 수 있습니다. 알림 창은 그대로 뜹니다.

## 개발

```
claude plugin validate <mod>
claude plugin test <mod>
```
