function combatHullIcon(hullId){
 if(!COMBAT_HULLS.has(hullId))return '';
 return `<img class="combat-hull-icon" src="assets/icons/hulls/${hullId}.svg" width="64" height="64" alt="">`;
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
 return cards?`<div class="fleet-composition">${cards}</div>`:'<p class="muted">편성된 함선이 없습니다.</p>';
}

function fleetDefenseMarkup(shield,armor,stats){
 const gauge=(label,value,max,kind)=>`<div class="fleet-defense-gauge ${kind}"><small>${label}</small><b>${value.toFixed(1)} / ${max.toFixed(1)}</b><progress aria-label="${label}" max="${max||1}" value="${value}"></progress></div>`;
 return `<div class="fleet-defense">${gauge('보호막',shield,stats.shield,'shield')}${gauge('장갑',armor,stats.armor,'armor')}</div>`;
}

function fleetMemberStatusMarkup(ship,controls=''){
 return `<div class="fleet-card-member"><div class="fleet-member-line"><strong>${safeText(ship.name)}</strong>${controls}</div>${fleetDefenseMarkup(ship.shield,ship.hp,ship.assembly)}</div>`;
}

function fleetDetailHeader(name,subtitle,points,nameField=''){
 const limit=DATA.combat.fleets.maxCapacity;
 return `<header class="fleet-detail-heading"><div><h3>${fleetFormationIcon('fleet')}${nameField||safeText(name)}</h3><b>편제 규모 ${points} / ${limit}</b></div><progress aria-label="편제 규모" max="${limit}" value="${points}"></progress><small>${safeText(subtitle)}</small></header>`;
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
