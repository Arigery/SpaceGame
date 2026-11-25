const GATEWAY_BALANCE=DATA.balance.gateways;

function initializeGatewaySites(game,legacy=false){
 if(game.gatewaySitesVersion===1||game.stars.length<GATEWAY_BALANCE.siteCount+1)return;
 // Existing saves keep all their planets and paid work.
 const candidates=game.stars.filter(s=>s.id!==0&&(!legacy||s.planets.some(p=>p.type==='hab')));
 const chosen=[game.stars[0]];
 for(let i=0;i<GATEWAY_BALANCE.siteCount&&candidates.length;i++){
  const score=s=>{
   const spacing=Math.min(...chosen.map(other=>Math.hypot(s.x-other.x,s.y-other.y)));
   const strategic=s.edges.length>=3||s.edges.some(id=>game.stars[id].blackholeTo!=null);
   return spacing*(strategic?1.12:1)*(s.planets.some(p=>p.type==='hab')?1.1:1);
  };
  candidates.sort((a,b)=>score(b)-score(a)||a.id-b.id);
  const star=candidates.shift();chosen.push(star);star.gatewaySite=true;
  if(!star.planets.some(p=>p.type==='hab')){
   const index=Math.min(star.planets.length,4);
   star.planets[index]={type:'hab',level:0,slots:6,sizeClass:generatedPlanetSize(game.seed,star.id,index),label:star.name+' '+['I','II','III','IV','V'][index]};
  }
 }
 game.gatewaySitesVersion=1;
}

function gatewayResearchComplete(game,owner){
 const research=owner==='player'?game.research:game.military?.researchByOwner?.[owner];
 return research?.completed?.includes(GATEWAY_BALANCE.researchId)??false;
}
function gatewayOperational(star,owner){
 return !!star?.gateway&&star.gateway.remaining===0&&systemOwner(star)===owner;
}
function gatewayDestinations(game,from,owner='player'){
 if(!gatewayOperational(game.stars[from],owner))return [];
 return game.stars.filter(star=>star.id!==from&&gatewayOperational(star,owner));
}
function colonyBuildingGateway(game,ship='colony'){
 return isColonyShip(ship)&&game.stars?.some(star=>star.gateway?.remaining>0&&star.gateway.builder==='player'&&(star.gateway.builderShip??'colony')===ship);
}
function gatewayConstructionBlock(game,id){
 const star=game.stars[id];
 if(!star?.gatewaySite||systemOwner(star)!=='player')return '소유 관문 후보지 필요';
 if(star.gateway?.remaining===0)return '관문 완공';
 if(!gatewayResearchComplete(game,'player'))return '관문 공학 연구 필요';
 if(star.gateway?.builder||!availableColonyShip(game,id))return '가용 개척선 필요';
 if(!gatewaySiteDeveloped(star))
  return '거주 행성 인구 '+GATEWAY_BALANCE.minimumPopulation+' · 공용 구역 Lv.'+GATEWAY_BALANCE.minimumCommonLevel+' 필요';
 if(civilianOperationsBlocked(game,id)||pendingScoutDanger(game)||game.military?.battle||game.military?.phase==='ai')return '현재 건설 불가';
 if(!star.gateway&&!canPayMilitaryCost(game,GATEWAY_BALANCE.constructionCost))return '자원 부족';
 return '';
}
function gatewaySiteDeveloped(star){
 return star.planets.some(planet=>planet.type==='hab'&&planet.habData?.pop>=GATEWAY_BALANCE.minimumPopulation&&
  planet.habData?.commonLevel>=GATEWAY_BALANCE.minimumCommonLevel);
}
function buildGateway(game,id){
 const blocked=gatewayConstructionBlock(game,id);
 if(blocked)throw Error(blocked);
 const star=game.stars[id];
 if(!star.gateway){
  payMilitaryCost(game,GATEWAY_BALANCE.constructionCost,'gateway');
  star.gateway={remaining:GATEWAY_BALANCE.constructionTurns,total:GATEWAY_BALANCE.constructionTurns};
 }
 star.gateway.builder='player';
 star.gateway.builderShip=availableColonyShip(game,id);
}
function settleGateways(game){
 const messages=[];
 for(const star of game.stars){
  const job=star.gateway;
  if(!job?.builder||systemOwner(star)!==job.builder||job.remaining<=0)continue;
  if(--job.remaining===0){delete job.builder;delete job.builderShip;messages.push(star.name+' · 관문 완공')}
 }
 return messages;
}
function gatewayProgress(game,owner){
 const count=game.stars.filter(star=>gatewayOperational(star,owner)).length;
 return {count,researched:gatewayResearchComplete(game,owner),turns:game.prosperity?.streaks?.[owner]??0};
}
function refreshGatewayVictory(game,advance=false){
 const progress=game.prosperity??={streaks:{},winner:null};
 if(progress.winner)return null;
 const countTurn=advance&&progress.lastCountedTurn!==game.turn;
 if(countTurn)progress.lastCountedTurn=game.turn;
 const owners=new Set([...Object.keys(progress.streaks),...game.stars.filter(star=>star.gateway).map(systemOwner)].filter(Boolean));
 for(const owner of owners){
  const {count,researched,turns}=gatewayProgress(game,owner);
  if(!researched||count<GATEWAY_BALANCE.victoryCount)delete progress.streaks[owner];
  else if(countTurn)progress.streaks[owner]=turns+1;
 }
 const winners=[...owners].filter(owner=>progress.streaks[owner]>=GATEWAY_BALANCE.victoryTurns);
 if(winners.length===1){progress.winner={owner:winners[0],turn:game.turn};return winners[0]}
 return null;
}

function gatewayVictoryWarnings(game){
 const progress=game.prosperity;
 if(!progress||progress.winner)return [];
 const alerts=progress.warnings??=[];
 const messages=[];
 for(const [owner,turns] of Object.entries(progress.streaks)){
  if(owner==='player'||turns!==1||alerts.some(alert=>alert.owner===owner&&alert.turn===game.turn))continue;
  alerts.push({owner,turn:game.turn});
  messages.push(owner+' · 번영 승리 카운트다운 시작');
 }
 return messages;
}

function canJumpCivilianGateway(game,ship,to){
 return !!civilianShipRole(ship)&&!colonyBuildingGateway(game,ship)&&!pendingScoutDanger(game)&&
  !game.military?.battle&&game.military?.phase!=='ai'&&game.ap[ship]>=GATEWAY_BALANCE.travelCost&&
  gatewayDestinations(game,game.ships[ship]).some(star=>star.id===to);
}
function jumpCivilianGateway(ship,to){
 if(motionBusy||!canJumpCivilianGateway(state,ship,to))return false;
 const from=state.ships[ship],wasInSystem=view==='system';
 state.ships[ship]=to;state.ap[ship]=Math.round((state.ap[ship]-GATEWAY_BALANCE.travelCost)*10000)/10000;
 selected=to;moveMode=scanMode=colonizeMode=false;
 if(civilianShipRole(ship)==='scout')revealScoutArrival(state,to);else recordRegionalArrival(state,to);
 if(wasInSystem&&$('quickMove').checked)sysId=to;
 rec(shipName(ship)+' · 관문 이동 → '+state.stars[to].name);
 presentScoutArrivalDanger(ship,to,playPortalTransit(ship,from,to,'gateway'));
 render();return true;
}

function selectedGatewayDestinations(){
 if(tutorial)return [];
 if(activeShip)return gatewayDestinations(state,state.ships[activeShip]).filter(star=>canJumpCivilianGateway(state,activeShip,star.id));
 if(!selectedFleetIds.length)return [];
 const first=state.military.fleets.find(f=>f.id===selectedFleetIds[0]);
 return gatewayDestinations(state,first?.systemId).filter(star=>{
  try{planFleetOrder(state,selectedFleetIds,star.id,'player',true);return true}catch{return false}
 });
}
function renderGatewayCommand(){
 const button=$('gatewayBtn');
 button.classList.toggle('hide',!selectedGatewayDestinations().length);
 if(isColonyShip(activeShip)&&colonyBuildingGateway(state,activeShip)){
  $('moveBtn').disabled=$('colonizeBtn').disabled=true;
  const hint=$('shipPanel').querySelector(':scope > p');
  const job=state.stars[state.ships[activeShip]].gateway;
  hint.textContent='관문 건설 · '+job.remaining+'턴';
  hint.style.display='block';
 }
}
function gatewayRequirementsMarkup(game,star){
 const {minimumPopulation,minimumCommonLevel,constructionCost}=GATEWAY_BALANCE;
 const safe=!civilianOperationsBlocked(game,star.id)&&!pendingScoutDanger(game)&&!game.military?.battle&&game.military?.phase!=='ai';
 return (star.gateway?'':orbitalResourceRequirements(game,constructionCost))+
  orbitalRequirement('관문 공학',gatewayResearchComplete(game,'player'))+
  orbitalRequirement(`같은 행성 · 인구 ${minimumPopulation} · 공용 구역 Lv.${minimumCommonLevel}`,gatewaySiteDeveloped(star))+
  (!availableColonyShip(game,star.id)?orbitalRequirement('가용 개척선',false):'')+
  (systemOwner(star)!=='player'?orbitalRequirement('소유 관문 후보지',false):'')+
  (!safe?orbitalRequirement('안전한 성계',false):'');
}
function renderGatewayStructure(scene,star,showConstruction=false){
 const node=document.createElement('button');
 node.type='button';node.className='orbital-gateway';
 const job=star.gateway,offer=showConstruction&&job?.remaining!==0&&!job?.builder;
 const ready=offer&&!gatewayConstructionBlock(state,star.id);
 const status=job?.remaining===0?'가동 중':job?.builder?`${job.remaining}턴 남음`:
  offer?(ready?(job?'재개 가능':'착공 가능'):(job?'재개 대기':'착공 대기')):job?'건설 중단':'후보지';
 if(offer)node.classList.add(ready?'construction-ready':'construction-blocked');
 node.title='관문 · '+status;node.setAttribute('aria-label',node.title);
 node.innerHTML='<span class="orbital-gateway-glyph" aria-hidden="true">◇</span><span>관문</span>'+
  (showConstruction?`<span class="orbital-site-preview" aria-hidden="true"><b>${status}</b></span>`:'');
 placeNode(node,gatewayPoint());
 node.onclick=()=>{if(!motionBusy)showGateway(star.id)};
 scene.append(node);
}
function showGateway(id=null){
 const star=state.stars[id],job=star?.gateway,owner=systemOwner(star);
 const spec=GATEWAY_BALANCE;
 const destinations=selectedGatewayDestinations();
 const canBuild=star?.gatewaySite&&owner==='player'&&job?.remaining!==0&&!job?.builder;
 const blocked=canBuild?gatewayConstructionBlock(state,id):'';
 const showRequirements=canBuild||star?.gatewaySite&&job?.remaining!==0&&!job?.builder&&isColonyShip(activeShip)&&state.ships[activeShip]===id;
 let body='';
 if(star){
  if(job)body+=job.remaining?'<p>'+ (job.builder?'건설 중':'건설 중단')+' · '+job.remaining+'턴</p><progress aria-label="관문 건설 진행률" max="'+job.total+'" value="'+(job.total-job.remaining)+'"></progress>':'<p>가동 중'+(owner==='player'?'':' · 다른 문명 소유')+'</p>';
  else body+='<p>관문 후보지</p>';
  if(owner==='player')body+='<p>유지비/턴 '+resourceAmountsMarkup(spec.upkeep)+'</p>';
  if(showRequirements){
   body+='<div class="orbital-requirements" aria-label="관문 건설 조건">'+gatewayRequirementsMarkup(state,star)+'</div>';
   if(!job)body+='<p>건설 '+spec.constructionTurns+'턴</p>';
  }
  if(canBuild)body+='<button id="buildGateway"'+(blocked?' disabled':'')+'>'+(job?'건설 재개':'착공')+'</button>';
 }
 if(destinations.length)body+='<h3>목적지 · 행동력 '+spec.travelCost+'</h3><div class="stack">'+destinations.map(target=>'<button data-gateway-destination="'+target.id+'">'+safeText(target.name)+'</button>').join('')+'</div>';
 else if(job?.remaining===0&&owner==='player')body+='<p class="muted">이동 가능한 함선 또는 목적지 없음</p>';
 openDialog(star?star.name+' · 관문':'관문 이동','',body);
 if(canBuild)$('buildGateway').onclick=()=>{
  if(gatewayConstructionBlock(state,id))return;
  buildGateway(state,id);
  moveMode=colonizeMode=false;rec(star.name+' · 관문 '+(job?'건설 재개':'착공'));
  render();showGateway(id);
 };
 $('modalBody').querySelectorAll('[data-gateway-destination]').forEach(button=>button.onclick=()=>{
  const to=Number(button.dataset.gatewayDestination);
  closeDialog();
  if(activeShip)jumpCivilianGateway(activeShip,to);
  else commandFleetMove(to,true);
 });
}
