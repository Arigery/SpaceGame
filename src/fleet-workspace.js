function combatHullIcon(hullId){
 if(!COMBAT_HULLS.has(hullId))return '';
 return `<img class="combat-hull-icon" src="assets/icons/hulls/${hullId}.svg" width="144" height="88" alt="">`;
}
function militaryShipPortraitMarkup(hullId,heading=45){
 const image=militaryShipImage(hullId,heading);
 return image?`<img class="military-ship-model" src="${image}" alt="">`:combatHullIcon(hullId);
}

function fleetFormationIcon(kind){
 const file=kind==='corps'?'corps-badge':'squadron-badge';
 return `<img class="fleet-formation-icon" src="assets/icons/${file}.svg" alt="" width="40" height="40">`;
}

function fleetCompositionMarkup(entries,renderMember){
 const byHull=new Map();
 for(const entry of entries){
  if(!byHull.has(entry.hullId))byHull.set(entry.hullId,[]);
  byHull.get(entry.hullId).push(entry);
 }
 const cards=DATA.combat.hulls.map(hull=>{
  const members=byHull.get(hull.id);
  if(!members)return '';
  const count=members.reduce((sum,entry)=>sum+(entry.count??1),0);
  const size=count*DATA.combat.fleets.classCosts[hull.id];
  return `<article class="fleet-hull-card"><header class="fleet-hull-heading"><strong>${safeText(hull.name)}</strong><b>${count}척</b></header>
   <div class="fleet-hull-preview">${combatHullIcon(hull.id)}<small>규모 ${size}</small></div><div class="fleet-hull-roster">${members.map(entry=>renderMember(entry)).join('')}</div></article>`;
 }).join('');
 return cards?`<div class="fleet-composition">${cards}</div>`:'<p class="muted">편성된 함선 없음</p>';
}

const SHIP_DEFENSE_COLORS={shield:'#b48bf3',armor:'#f0a263'};

function defenseRatio(value,max){return max>0?Math.min(1,Math.max(0,value/max)):0}

function fleetDefenseMarkup(shield,armor,stats){
 const gauge=(kind,label,value,max)=>{
  const readout=`${value.toFixed(1)} / ${max.toFixed(1)}`;
  const percent=Number((100*defenseRatio(value,max)).toFixed(2));
  return `<div class="fleet-defense-gauge ${kind}"><small>${label}</small><b>${readout}</b><div class="fleet-defense-track" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-valuetext="${readout}"><span style="width:${percent}%;background:${SHIP_DEFENSE_COLORS[kind]}"></span></div></div>`;
 };
 return `<div class="fleet-defense">${gauge('shield','보호막',shield,stats.shield)}${gauge('armor','장갑',armor,stats.armor)}</div>`;
}

function fleetMemberStatusMarkup(ship,controls=''){
 return `<div class="fleet-card-member"><div class="fleet-member-line"><strong>${safeText(ship.name)}</strong>${controls}</div>${fleetDefenseMarkup(ship.shield,ship.hp,ship.assembly)}</div>`;
}

function fleetCapacity(game,fleet){
 return {points:fleetPoints(game,fleet),reserved:fleetReservedCapacity(game,fleet)};
}

function fleetCapacityText({points,reserved=0}){
 return `${points+reserved} / ${DATA.combat.fleets.maxCapacity}`;
}

function fleetCapacityBar({points,reserved=0}){
 const limit=DATA.combat.fleets.maxCapacity;
 const detail=`배치 ${points} · 증원 ${reserved} · 한도 ${limit}`;
 return `<div class="fleet-capacity-bar" role="meter" aria-label="편제 규모" aria-valuemin="0" aria-valuemax="${limit}" aria-valuenow="${points+reserved}" aria-valuetext="${detail}" title="${detail}"><span class="fleet-capacity-active" style="width:${100*points/limit}%"></span>${reserved?`<span class="fleet-capacity-reserved" style="width:${100*reserved/limit}%"></span>`:''}</div>`;
}

function fleetCapacityChip(capacity){
 const {points,reserved=0}=capacity;
 return `<span class="fleet-size-chip${reserved?' has-reinforcements':''}"${reserved?` title="배치 ${points} · 증원 ${reserved}"`:''}>${fleetCapacityText(capacity)}</span>`;
}

function fleetDetailHeader(name,subtitle,capacity,nameField=''){
 return `<header class="fleet-detail-heading"><div class="fleet-detail-title"><h3>${fleetFormationIcon('fleet')}${nameField||safeText(name)}</h3><b>편제 규모 ${fleetCapacityText(capacity)}</b></div>${fleetCapacityBar(capacity)}<small>${safeText(subtitle)}</small></header>`;
}

function fleetSelectionMarkup(game,fleets){
 const lead=fleets.length===1?game.military.ships.find(s=>s.id===fleets[0].shipIds[0]):null;
 const portrait=lead?'<div class="ship-portrait">'+militaryShipPortraitMarkup(lead.hullId)+'</div>':'';
 return portrait+'<div class="ship-readout"><b>함대 '+fleets.length+'개 선택</b><div>'+fleets.map(f=>safeText(f.name)+' · '+fleetCapacityChip(fleetCapacity(game,f))+' · 행동력 '+fleetAP(game,f)).join('<br>')+'</div><small>공동 이동 한도: '+Math.min(...fleets.map(f=>fleetAP(game,f)))+'</small></div>';
}

function extendFleetSelection(event){return !!(event?.shiftKey||event?.ctrlKey||event?.metaKey)}

function updateFleetSelection(current,ids,extend){
 if(!extend)return [...ids];
 if(ids.every(id=>current.includes(id)))return current.filter(id=>!ids.includes(id));
 return [...new Set([...current,...ids])];
}

function fleetReservationMarkup(game,fleet){
 const {production,incoming}=fleetReinforcementOrders(game,fleet);
 if(!production.length&&!incoming.length)return '';
 const builds=production.map(({star,job})=>`<li>${safeText(job.name)} · ${safeText(star.name)} 건조</li>`);
 const arrivals=incoming.map(({ship,arrivalTurn,waitingForFleet})=>{
  const status=waitingForFleet?game.stars[ship.systemId].name+' · 함대 복귀 대기':arrivalTurn+'턴 도착 예정';
  return `<li>${safeText(ship.name)} · ${safeText(status)}</li>`;
 });
 return `<details class="fleet-reinforcement-status"><summary>증원 현황</summary><ul>${builds.concat(arrivals).join('')}</ul></details>`;
}

function fleetWorkspaceMarkup(list,detail,creation=''){
 return `<div class="fleet-workspace"><div class="fleet-workspace-list"><h3>군단 및 독립 함대</h3><div class="fleet-workspace-items">${list}</div>${creation?`<div class="fleet-workspace-create">${creation}</div>`:''}</div><div class="fleet-workspace-detail">${detail}</div></div>`;
}

function widenFleetWorkspace(){
 $('overlay').querySelector?.('.modal')?.classList.add('fleet-workspace-modal');
}

function openFleetWorkspace(title,description,navigation,content,keepScroll=false){
 const body=$('modalBody');
 const selectors=['.fleet-dialog-content','.fleet-workspace-items','.fleet-workspace-detail'];
 const offsets=keepScroll?selectors.map(selector=>body.querySelector?.(selector)?.scrollTop??0):[];
 openDialog(title,description,`<div class="ship-designer fleet-dialog-shell">${navigation}<div class="fleet-dialog-content">${content}</div></div>`,true);
 widenFleetWorkspace();
 offsets.forEach((offset,index)=>{
  const area=body.querySelector?.(selectors[index]);
  if(area)area.scrollTop=offset;
 });
}

function campaignFleetTabs(active){
 const tabs=[['fleets','함대 리스트'],['designs','함선 설계'],['yards','조선소·생산']];
 return `<nav class="fleet-workspace-tabs" aria-label="함대 메뉴">${tabs.map(([id,label])=>`<button data-campaign-fleet-tab="${id}" aria-pressed="${id===active}">${label}</button>`).join('')}</nav>`;
}

function bindCampaignFleetTabs(active){
 const open={fleets:()=>showFleetManager(),designs:()=>showShipDesigner(),yards:()=>showShipyards(view==='system'?sysId:null)};
 $('modalBody').querySelectorAll('[data-campaign-fleet-tab]').forEach(el=>el.onclick=()=>{
  const tab=el.dataset.campaignFleetTab;
  if(tab!==active)open[tab]();
 });
}
