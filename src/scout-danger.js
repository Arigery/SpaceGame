const CIVILIAN_SHIP_ROLES={explorer:'scout',explorer2:'scout',colony:'colony'};
const SCOUT_DANGER_LABELS={fauna:'적대 생명체',military:'적대 함대 접근',hazard:'탐사 위험'};
const civilianShipRole=id=>Object.hasOwn(CIVILIAN_SHIP_ROLES,id)?CIVILIAN_SHIP_ROLES[id]:null;
const pendingScoutDanger=game=>game?.scoutDangers?.[0]??null;
let encounterUILocked=false;
function lockEncounterUI(locked){
 encounterUILocked=locked;
 if(typeof document==='undefined')return;
 for(const element of document.querySelectorAll('body > .top, body > .layout, body > .turnDock, body > .screen'))element.inert=locked;
 if(locked){dragStart=null;closeSurveyMenu()}
}
function rememberEncounterView(){
 if(state.encounterView||typeof view==='undefined'||typeof systemCamera==='undefined')return;
 state.encounterView={view,sysId,selected,habIndex,scale,panX,panY,systemCamera:{...systemCamera},activeShip,fleets:[...selectedFleetIds]};
}
function restoreEncounterView(){
 const saved=state.encounterView;
 if(!saved)return;
 delete state.encounterView;
 if(!['galaxy','system','habitat'].includes(saved.view)||!state.stars[saved.sysId]||!state.stars[saved.selected])return;
 if(saved.view==='habitat'&&state.stars[saved.sysId].planets[saved.habIndex]?.type!=='hab')return;
 view=saved.view;sysId=saved.sysId;selected=saved.selected;habIndex=saved.habIndex;
 if([saved.scale,saved.panX,saved.panY].every(Number.isFinite)){scale=saved.scale;panX=saved.panX;panY=saved.panY}
 if(saved.systemCamera&&['zoom','x','y'].every(key=>Number.isFinite(saved.systemCamera[key])))systemCamera={...saved.systemCamera};
 activeShip=Object.hasOwn(state.ships,saved.activeShip)?saved.activeShip:null;
 const available=new Set(state.military.fleets.filter(f=>f.owner==='player'&&f.status!=='missing'&&f.shipIds.length).map(f=>f.id));
 selectedFleetIds=Array.isArray(saved.fleets)?saved.fleets.filter(id=>available.has(id)):[];
 moveMode=scanMode=colonizeMode=fleetMoveMode=false;
}

function civilianOperationsBlocked(game,systemId){
 return !!game.military&&militaryHostile(game,systemId,'player');
}
function canSurveyFromShip(game,shipId,systemId){
 return civilianShipRole(shipId)==='scout'&&game.ships[shipId]===systemId&&game.ap[shipId]>=1&&
  !pendingScoutDanger(game)&&!civilianOperationsBlocked(game,systemId);
}
function scoutDangerEvent(game,{systemId,eventSlot,planetIndex}){
 const system=game.stars[systemId];
 if(eventSlot==='system')return system?.explorationEvent;
 if(eventSlot==='planet')return system?.planets?.[planetIndex]?.habitableEvent;
 return undefined;
}
function validateScoutDangers(game){
 if(game.scoutDangers===undefined)return;
 if(!Array.isArray(game.scoutDangers))throw Error('탐사선 위험 결정 저장 오류');
 for(const danger of game.scoutDangers){
  if(civilianShipRole(danger.shipId)!=='scout'||!Object.hasOwn(game.ships,danger.shipId)||!game.stars[danger.systemId]||!Object.hasOwn(SCOUT_DANGER_LABELS,danger.kind)||typeof danger.description!=='string')throw Error('탐사선 위험 결정 저장 오류');
  if(danger.eventSlot&&!scoutDangerEvent(game,danger))throw Error('탐사 위험 이벤트 저장 오류');
 }
}
function queueScoutDanger(game,shipId,{kind,description='',eventSlot,planetIndex}={}){
 if(civilianShipRole(shipId)!=='scout'||!Object.hasOwn(game.ships,shipId))return false;
 const systemId=game.ships[shipId];
 if(!Object.hasOwn(SCOUT_DANGER_LABELS,kind)||typeof description!=='string'||!game.stars[systemId])return false;
 const danger={shipId,systemId,kind,description,eventSlot,planetIndex};
 if(eventSlot&&scoutDangerEvent(game,danger)?.status!=='pending')return false;
 game.scoutDangers??=[];
 if(game.scoutDangers.some(d=>d.shipId===shipId&&d.systemId===systemId&&d.kind===kind&&d.eventSlot===eventSlot&&d.planetIndex===planetIndex))return false;
 game.scoutDangers.push(danger);
 return true;
}
function queueMilitaryScoutDanger(game,systemId,shipId=null){
 if(!civilianOperationsBlocked(game,systemId))return;
 for(const [id,position] of Object.entries(game.ships))if(position===systemId&&(shipId===null||id===shipId))queueScoutDanger(game,id,{kind:'military'});
}
function presentScoutArrivalDanger(shipId,systemId,animation){
 const game=state;
 queueMilitaryScoutDanger(game,systemId,shipId);
 if(!pendingScoutDanger(game))return;
 const present=()=>{if(state===game&&pendingScoutDanger(game))showPendingEncounter()};
 Promise.resolve(animation).then(present,present);
}
function scoutRetreatDestinations(game,danger){
 return [...new Set(game.stars[danger.systemId].edges)].filter(id=>id!==danger.systemId&&isRetreatSystemSafe(game,id,'player')).sort((a,b)=>a-b);
}
function revealScoutArrival(game,systemId){
 const system=game.stars[systemId];
 system.nameRevealed=true;system.planetsObserved=true;system.explored=true;
}
function resolveScoutDanger(game,choice,destination=null){
 const danger=pendingScoutDanger(game);
 if(!danger||!['stay','retreat'].includes(choice))throw Error('선택할 위험 대응이 없습니다.');
 const present=game.ships[danger.shipId]===danger.systemId;
 if(choice==='retreat'&&(!present||!scoutRetreatDestinations(game,danger).includes(destination)))throw Error('후퇴할 수 있는 인접 성계를 선택하세요.');
 if(choice==='retreat'){
  game.ships[danger.shipId]=destination;
  revealScoutArrival(game,destination);
  if(game.shipPoints)delete game.shipPoints[danger.shipId];
 }
 // Other discoveries awaiting this scout at the same site are abandoned if it has left.
 game.scoutDangers.shift();
 if(choice==='retreat'||!present){
  const abandoned=[danger,...game.scoutDangers.filter(d=>d.shipId===danger.shipId&&d.systemId===danger.systemId)];
  for(const item of abandoned){
   const event=scoutDangerEvent(game,item);
   if(event?.status==='pending'){event.status='resolved';event.result='탐사선 후퇴 · 이벤트 조사 중단';event.awaitingAcknowledgement=false}
  }
  game.scoutDangers=game.scoutDangers.filter(d=>!abandoned.includes(d));
 }
 return danger;
}

function showPendingEncounter(){
 if((pendingScoutDanger(state)||state.military?.battle)&&(state.military?.battle||state.military?.phase==='ai'))rememberEncounterView();
 if(pendingScoutDanger(state)){showScoutDanger();return true}
 if(state.military?.battle){showFleetBattle();return true}
 return false;
}
function showScoutDanger(error=''){
 const danger=pendingScoutDanger(state);
 if(!danger)return;
 const destinations=scoutRetreatDestinations(state,danger);
 const system=state.stars[danger.systemId];
 const detail=danger.kind==='military'?'남으면 적대 군함이 있는 동안 탐사할 수 없습니다.':danger.description;
 const options=destinations.map(id=>{
  const name=systemKnown(id)?state.stars[id].name:'미확인 성계 #'+(id+1);
  return '<button data-scout-retreat="'+id+'">'+safeText(name)+'으로 후퇴 · AP 0</button>';
 }).join('');
 openDialog(SCOUT_DANGER_LABELS[danger.kind],shipName(danger.shipId)+' · '+system.name,
  '<div class="stack"><p>'+safeText(detail)+'</p><button id="scoutStay">이 성계에 남기</button>'+
  (options||'<p>후퇴 가능한 인접 성계가 없습니다.</p>')+(error?'<p role="alert">'+safeText(error)+'</p>':'')+
  '<button id="saveScoutDanger">결정 저장</button></div>');
 modalKind='scout-danger';$('closeModal').hidden=true;
 lockEncounterUI(true);
 const choose=(choice,destination)=>{
  let response;
  try{response=resolveScoutDanger(state,choice,destination)}catch(e){showScoutDanger(e.message);return}
  if(choice==='retreat'){
   if(view==='system'&&sysId===response.systemId){sysId=destination;selected=destination}
   else if(view==='galaxy')selected=destination;
   clearShipSelection();
  }
  rec(shipName(response.shipId)+(choice==='retreat'?' · '+state.stars[destination].name+'으로 후퇴 (AP 0)':' · '+system.name+'에 남음'));
  if(showPendingEncounter())return;
  if(state.military?.phase==='ai'){
   if(resumeFleetTurn(state)===null){showPendingEncounter();return}
   finishStrategicTurn();
  }else{restoreEncounterView();render()}
  closeDialog();
 };
 $('scoutStay').onclick=()=>choose('stay');$('scoutStay').focus();
 $('modalBody').querySelectorAll('[data-scout-retreat]').forEach(button=>button.onclick=()=>choose('retreat',Number(button.dataset.scoutRetreat)));
 $('saveScoutDanger').onclick=()=>{showSlots('save');modalKind='scout-danger-save'};
}
