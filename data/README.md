# 2차 밸런싱 JSON

| 파일 | 내용 |
| --- | --- |
| buildings.json | 건물 비용·필요 생산력·유지비·업그레이드, 부속, 공용 확장 계수 |
| planets.json | 행성/채굴 시설 정보, 목표 레벨별 비용·고정 소요 턴·유지비 |
| balance.json | 시작 자원, 모행성 initialPopulation=6, colonyPopulation=3, 성장·소비 |
| resources.json | 자원 ID·이름 |
| map.json | 지도 생성 수치 |

`cost`는 착공 시 소모하는 자원 사전, `productionRequired`는 필요한 누적 생산력입니다.
채굴은 `levels`의 목표 단계에 있는 `constructionTurns`를 사용합니다.
`upkeep`은 가동 건물 1개당 총 유지비입니다. `null`은 미결정이며 화면에 미정으로 표시하고 차감하지 않습니다.
주거/의료 업그레이드에 있는 유지비는 해당 단계 총액입니다. 미정 광물액을 하위 레벨 값으로 임의 대체하지 않습니다.
특화 업그레이드는 기본 유지비를 그대로 사용합니다.
기존 진행 중 공사는 저장된 필요량/타이머를 유지하며 새 수치는 다음 착공부터 적용됩니다. 유지비는 현재 데이터를 참조합니다.

공용 구역 비용은 목표 레벨 L에 대해 mineralPerTargetLevel×L, alloyPerAddedLevel×(L−1), productionPerTargetLevel×L입니다.
기존 건물 ID는 저장 데이터와 연결되므로 변경하지 않습니다. 새 효과·자원 종류는 코드/저장 호환 검토가 필요합니다.

`image`에 assets/buildings/house.png 같은 경로를 넣으면 건설 선택 카드에 표시됩니다. null 또는 불러오기 실패 시 자리 표시자를 유지합니다.
공용 분류는 family가 행정/물류이면 해당 분류, 나머지는 일반입니다. 설명 문구도 수치에 맞춰 함께 수정합니다.

편집 후 `npm run build`, `npm run check`를 실행합니다. 또는 UPDATE_GAME.cmd로 빌드하고 게임을 엽니다.
