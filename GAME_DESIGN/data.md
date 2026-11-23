# 구현 파일 안내

> 요약: 기획과 연결된 데이터·소스·에셋 위치
> 상태: 확정
> 연관: [[workflow]], [[validation]]


## 9. 데이터 관리와 검증

| 파일 | 관리 범위 |
| --- | --- |
| src/battle-test.js / src/battle-test-ui.js / tests/combat-integration.test.mjs | 4성계 시험 편성·지도·태세, 조선소 운용·자원 소모 집계와 격리 검증 |
| src/fleet-workspace.js / styles/command-ui.css | 함대 탭 공통 프레임, 편제·방어 막대, 함급 카드·군단 펼침 목록 |
| assets/ships/ / src/models.js / tools/build.mjs | 탐사선·개척선·전투함 5종 GLB와 로컬 HTML 실행용 패키징 |
| src/presentation.js / styles/command-ui.css | 성계 함급별 대형 배치, 군단 선택, 곡선 선회와 엔진 연출 |
| src/resource-ui.js / assets/icons/ | 상단 자원, 건조비·유지비·연구 비용의 공용 아이콘 표시 |
| src/retreat.js / src/battle-ui.js | 전투 일시정지, 함대별 후퇴, 워프 복귀와 진행 화면 |
| tools/combat-balance.mjs | `npm run balance`로 시드별 역할·조합 전투 재현, 임시 결과 파일 생성 없음 |
| src/shipyards.js / src/shipyard-ui.js / tests/shipyards.test.mjs | 궤도 조선소·생산·수리·증원·인수와 대기열·저장 검증 |
| src/fleets.js / src/fleet-ui.js / tests/fleets.test.mjs | 함대 정원·소유권·공동 경로·일괄 교전·편성 UI·저장과 회귀 검증 |
| src/ship-designs.js / src/ship-designer-ui.js | 모듈 합산·전력 검증·설계 저장과 기존 전투 함선 화면의 편집기 |
| data/combat.json / src/combat.js | 5종 전투 함체·임시 전술 수치·직렬화 상태·표적 선정·피해 처리 |
| tools/validate-combat.mjs / tests/combat.test.mjs | 함체 데이터 무결성과 전술 동작 검증 (`npm test`) |
| data/research.json | 가변 연구 노드·효과·선행·분야 색상·이전 저장 호환 정의 |
| src/research.js | 연구 진행·재고 투입·효과 계산·저장 이관 |
| src/research-ui.js / styles/research.css | 5분야 방사형 연구 화면·기원·미설계 슬롯 |
| tools/validate-research.mjs | 가변 개수·노드 종류·선행·순환·도달 가능성 검사 |
| data/habitableStories.json | ID로 연결하는 스토리 80개 원문과 행성 환경 목록 |
| data/habitableEvents.json | 거주 가능 이벤트 80개·효과 843행·확률 7행·자원 매핑 |
| src/habitable-events.js | 조사 단계·확률·복합 효과·영구 특성·이벤트 UI |
| tools/validate-habitable-events.mjs | ID 연결·효과 유형·확률·결과 누락 빌드 검사 |
| data/exploration.json | 탐사 이벤트 비율·성격·설명·선택지·효과 수치 |
| data/buildings.json | 건물·효과·이미지·비용·필요 생산력·유지비·업그레이드·구역 확장 |
| data/planets.json | 행성 유형·채굴 단계별 비용·고정 기간·유지비 |
| data/balance.json | 시작 자원·모행성/개척 인구·성장·소비·공사·항로 이동 비용·행성 크기·자전 주기 |
| src/command-ui.js / styles/command-ui.css | 상단·왼쪽 탐색·함선 패널, 명령 선택과 통합 팝업 스타일 |
| assets/icons/ | 자원·탐색 아이콘, 군단·함대 배지와 `hulls/`의 5종 함급 SVG |
| assets/stations/titanium_colony_station.glb | 티타늄 정거장과 링 회전 키프레임 |
| src/presentation.js | 성계 내부 조작·연출·카메라·지표 UI |
| src/models.js | GLB 해석·구체·함선 투영 및 렌더링 |
| assets/ships/exploration_ship_NX02.glb | 사용자 제공 탐사선 원본 |
| assets/celestial/ | 항성·4종 행성 원본 GLB 및 내장 텍스처 |
| assets/backgrounds/ | 메인 메뉴·은하·항성계 일러스트 |
| styles/main-menu.css / galaxy-background.css / celestial-models.css | 메뉴·고정 배경·행성 대기광과 호버 |
| styles/planet-landscape.svg | 현재 온대 지표 배경 |
| data/map.json | 성계·행성 분포·항로·특수 요소 |
| data/resources.json | 자원 ID·표시 이름 |

- 코드와 JSON 변경 후 빌드하여 실행용 game.js를 갱신한다. 브라우저 진입점은 index.html이다.
- `npm run check`는 문법·JSON·생성 파일 일치를 검사한다.
