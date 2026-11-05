# 우주 문명 시뮬레이션 — 2차 건설 밸런싱

## 실행

`D:\ChatGpt\SpaceGame\index.html`을 Edge/Chrome에서 열면 실행됩니다. 서버·인터넷·추가 패키지는 필요 없습니다.
이미 열려 있다면 새로고침하세요. HTML을 옮길 때 game.js와 styles/도 함께 유지하세요.

## 구현

- 모행성 인구 6명 / 새 개척 거주 행성 3명
- 거주 행성당 공사 1개, 자원 선지불 및 생산력 누적
- 광산·가스 채집소의 생산력과 무관한 5/8/12턴 공사
- 가동 건물 유지비, 비용·진행·예상 턴 표시
- 원래 탐험·개척·함선 AP·시드·저장 슬롯 유지

수치는 2차 밸런싱 테스트 값입니다. 현재 수치는 GAME_DESIGN.md 7절, 미결정 항목과 임시 처리는 10절을 참고합니다.

## 수정과 검증

- `data/`: 건물·행성·인구·생산력 등 JSON 기준 데이터
- `src/`: 게임·화면·저장 코드 (construction.js에 공사·유지비·저장 호환 처리)
- `styles/`: 디자인, `assets/`: 이미지 등
- `game.js`: 자동 생성 실행 파일. 직접 편집하지 않습니다.
- `space_exploration_v13.html`: 사용자 제공 원본, 비교·참고용

JSON/코드 수정 후 `UPDATE_GAME.cmd`를 실행하거나 `npm run build`를 실행합니다.
`npm run check`는 문법, JSON 구조·수치, 실행 파일과 소스의 일치를 검사합니다.
별도 테스트 코드·임시 결과물은 사용자 요청으로 정리했습니다.

기획은 GAME_DESIGN.md, 결정 기록은 DECISIONS.md, 사용법은 USAGE.md에서 관리합니다.
기존 저장소: https://github.com/Arigery/SpaceGame
