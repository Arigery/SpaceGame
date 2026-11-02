# 우주 문명 시뮬레이션 — v13

기존 HTML v13의 동작을 유지하면서 코드, 디자인, 기준 데이터를 분리한 프로젝트입니다.

## 실행

**`D:\ChatGpt\SpaceGame\index.html`을 더블클릭하세요.**
인터넷 연결, 서버, 패키지 설치 없이 Edge/Chrome에서 실행할 수 있습니다.
HTML만 다른 곳으로 옮기지 말고 `game.js`, `styles/`와 함께 유지하세요.

- `space_exploration_v13.html`: 사용자가 제공한 변경하지 않은 원본, 비교·회귀 검사 기준
- `index.html`: 앞으로 테스트할 게임 진입점
- `src/`: 게임 규칙, 화면 처리, 입력, 저장 처리
- `styles/`: 테마 색상과 화면 디자인
- `data/`: 건물·행성·자원·지도·인구 등의 JSON 기준 데이터
- `assets/`: 향후 이미지·폰트·음원
- `game.js`: 소스와 JSON을 묶은 실행용 생성 파일. 직접 수정하지 않습니다.
- `tools/build.mjs`: 외부 패키지 없는 빌드 도구
- `tests/`: 원본 동작 비교 및 실제 브라우저 검사

## 변경 후 반영

`src/` 또는 `data/`를 수정한 뒤 `UPDATE_GAME.cmd`를 더블클릭하세요.
설치된 Node.js로 실행 파일을 갱신하고 게임을 엽니다. CSS는 새로고침만 하면 적용됩니다.

명령으로 실행하려면:

```powershell
Set-Location 'D:\ChatGpt\SpaceGame'
npm run build
npm test
npm run test:browser
```

## 관리

- 로컬: `D:\ChatGpt\SpaceGame`
- GitHub: https://github.com/Arigery/SpaceGame
- 기획: `GAME_DESIGN.md`, 변경 이유: `DECISIONS.md`, 다음 작업: `TODO.md`
- 데이터 편집: `data/README.md`, 실행·검증·저장: `USAGE.md`
- 일반 ChatGPT에서 기획하고 이 Work 채팅에서 같은 저장소의 구현·검증·반영을 계속합니다.
