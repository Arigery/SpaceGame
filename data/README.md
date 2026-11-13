# 게임 데이터와 이벤트 JSON

| 파일 | 내용 |
| --- | --- |
| buildings.json | 건물 비용·필요 생산력·유지비·업그레이드, 부속, 공용 확장 계수 |
| planets.json | 행성/채굴 시설 정보, 목표 레벨별 비용·고정 소요 턴·유지비 |
| balance.json | 시작 자원, 모행성 initialPopulation=6, colonyPopulation=3, 성장·소비 |
| resources.json | 자원 ID·이름 |
| map.json | 지도 생성 수치 |
| exploration.json | 성계 이상현상 60%·희귀 3%·없음 37%, 일반 이벤트 17종, 거주 행성 독립 65% |
| habitableEvents.json | 이벤트 80개·효과 843행·확률 7행·연구 보정·자원 매핑 |
| habitableStories.json | ID별 스토리 원문 80개·환경 목록 |

`cost`는 착공 시 소모하는 자원 사전, `productionRequired`는 필요한 누적 생산력입니다.
채굴은 `levels`의 목표 단계에 있는 `constructionTurns`를 사용합니다.
`upkeep`은 가동 건물 1개당 총 유지비입니다. `null`은 미결정이며 화면에 미정으로 표시하고 차감하지 않습니다.
주거/의료 업그레이드에 있는 유지비는 해당 단계 총액입니다. 미정 광물액을 하위 레벨 값으로 임의 대체하지 않습니다.
특화 업그레이드는 기본 유지비를 그대로 사용합니다.
기존 진행 중 공사는 저장된 필요량/타이머를 유지하며 새 수치는 다음 착공부터 적용됩니다. 유지비는 현재 데이터를 참조합니다.

공용 구역 비용은 목표 레벨 L에 대해 mineralPerTargetLevel×L, alloyPerAddedLevel×(L−1), 필요 생산력은 목표 Lv.2에 firstExpansionProductionRequired=24, 그 이후 productionPerTargetLevel×L입니다.
기존 건물 ID는 저장 데이터와 연결되므로 변경하지 않습니다. 새 효과·자원 종류는 코드/저장 호환 검토가 필요합니다.

`image`에 assets/buildings/house.png 같은 경로를 넣으면 건설 선택 카드에 표시됩니다. null 또는 불러오기 실패 시 자리 표시자를 유지합니다.
공용 분류는 family가 행정/물류이면 해당 분류, 나머지는 일반입니다. 설명 문구도 수치에 맞춰 함께 수정합니다.

편집 후 `npm run build`, `npm run check`를 실행합니다. 또는 UPDATE_GAME.cmd로 빌드하고 게임을 엽니다.

## 거주 가능 행성 이벤트 구조

`events`는 표시 정보, `effects`는 `(event_id, route, outcome)`별 모든 효과 행, `probabilities`는 방식별 확률·연구 변화·효과 배율입니다. `stories`는 `event_id`에 연결하는 발견문과 A/B 방향 스토리입니다. 원본 TSV의 ID와 문구를 보존하며 효과 문자열은 파싱하지 않습니다.

자원 매핑은 minerals→mineral, consumer_goods→consumer, advanced_materials→alloy이며 energy/food/research는 동일합니다. 일회성 자원과 영구 생산·건설·성장 보정을 구분합니다. 복합 효과 행을 누락하지 마세요.

스토리 환경은 초원·사막·정글·빙하·화산 및 모든 환경에 허용되는 공통입니다. 행성 환경은 저장하며 환경별 효과는 별도로 부여하지 않습니다. 데이터 검사는 ID 연결, 전체 결과 조합, 효과 타입·범위, 연구 0~2레벨 확률 합계와 스토리 누락을 확인합니다.

기존 완료 이벤트의 효과와 진행 중 선택은 보존합니다. 새 이벤트 배정을 바꿀 때는 exploration.version과 저장 이관 로직을 함께 검토해야 하며, 단순 문구 수정만으로 버전을 올리지 않습니다.
