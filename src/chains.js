function chainDefinition(id){return DATA.exploration.chains.events.find(event=>event.id===id)}

function initializeSurveyChains(game){
 if(game.surveyChains||game.stars.length<DATA.map.STAR_COUNT)return;
 const config=DATA.exploration.chains;
 const distances=game.stars.map(star=>retreatDistances(game,star.id));
 const inRange=(a,b)=>{
  const distance=distances[a].get(b);
  return distance>=config.minDistance&&distance<=config.maxDistance;
 };
 const indexOfPlanet=(star,type)=>star.planets.findIndex((planet,index)=>
  (type?planet.type===type:planet.type!=='hab')&&
  (game.explorationPlan[star.id].type!=='anomaly'||game.explorationPlan[star.id].planetIndex!==index));
 for(let attempt=0;attempt<24;attempt++){
  const random=rng(seedHash(game.seed+':survey-chain:'+attempt));
  const order=eventShuffle(game.stars.filter(star=>star.id!==0),random);
  const usedSystems=new Set(),chains=[];
  for(const definition of config.events){
   const available=order.filter(star=>!usedSystems.has(star.id));
   let chain;
   for(const start of available){
    const startPlanet=indexOfPlanet(start);
    if(startPlanet<0)continue;
    const middle=available.filter(star=>inRange(start.id,star.id));
    for(const end of available){
     if(end===start)continue;
     const endPlanet=definition.finalPlanet?indexOfPlanet(end,definition.finalPlanet):null;
     if(endPlanet===-1)continue;
     const branches=middle.filter(star=>inRange(star.id,end.id)).slice(0,definition.branchCount??1);
     if(branches.length!==(definition.branchCount??1))continue;
     chain={id:definition.id,start:start.id,startPlanet,middle:branches.map(star=>star.id),end:end.id,endPlanet};
     break;
    }
    if(chain)break;
   }
   if(!chain)break;
   for(const id of [chain.start,...chain.middle,chain.end])usedSystems.add(id);
   chains.push(chain);
  }
  if(chains.length===config.events.length){game.surveyChains=chains;return}
 }
 throw Error('연쇄 탐사 배치 실패 · 항로 거리와 대상 행성 조건을 만족하는 5개 경로가 없습니다.');
}
function surveyChainObjective(chain){
 if(chain.pending||chain.completed)return null;
 return chain.stage===1?chain.route:chain.stage===2?chain.end:null;
}
function claimSurveyChain(game,system,planet,owner='player'){
 const chain=game.surveyChains?.find(entry=>entry.start===system.id&&system.planets[entry.startPlanet]===planet);
 if(!chain||chain.owner)return null;
 chain.owner=owner;chain.stage=1;
 if(chain.middle.length===1)chain.route=chain.middle[0];
 else chain.pending='route';
 return chain;
}
function resolveSurveyChainReward(game,chain,reward){
 if(!game.surveyChains.includes(chain)||chain.stage!==2||chain.completed)return false;
 const definition=chainDefinition(chain.id);
 const resources=chain.owner==='player'?game.res:(game.military.resourcesByOwner??={})[chain.owner]??={};
 for(const [id,amount] of Object.entries(reward.resources??{}))resources[id]=(resources[id]??0)+amount;
 if(reward.production){
  const planet=game.stars[chain.end].planets[chain.endPlanet];
  if(planet.type==='hab'){
   const traits=habitat(planet).explorationTraits??=[];
   traits.push({id:chain.id,title:definition.title,effects:[{kind:'planet_resource_production_pct',target:'food',value:reward.production}]});
  }else{
   const effects=planet.explorationEffects??={};
   effects.productionBonus=(effects.productionBonus??0)+reward.production;
  }
 }
 chain.completed=true;delete chain.pending;
 return true;
}
function reportSurveyChain(chain,message){
 const title=chainDefinition(chain.id).title;
 rec(title+' · '+message);notifyExploration(message,'positive',title);
}
function surveyChainRewardLabel(reward){
 return Object.entries(reward.resources??{}).map(([id,amount])=>resourceNames[id]+' +'+amount)
  .concat(reward.production?'해당 행성 생산 영구 +'+Math.round(reward.production*100)+'%':[]).join(' · ');
}
function investigateSurveyChain(chain,ship=activeShip,owner='player'){
 const target=surveyChainObjective(chain);
 if(tutorial||motionBusy||target===null||chain.owner!==owner||!canSurveyFromShip(state,ship,target))return false;
 state.ap[ship]--;dirty=true;
 const definition=chainDefinition(chain.id);
 if(chain.stage===1){
  chain.stage=2;reportSurveyChain(chain,'단서 확보 · 2 / 3');
 }else if(definition.rewards.length>1){
  chain.pending='reward';
 }else{
  const reward=definition.rewards[0];
  const candidates=reward.clues?anomalyClueTargets(state.stars[chain.end],reward.clueDistance):[];
  if(candidates.length){chain.pending='clues';chain.clueIds=[];chain.clueOptions=candidates;chain.clueLimit=Math.min(reward.clues,candidates.length)}
  else{resolveSurveyChainReward(state,chain,reward);reportSurveyChain(chain,surveyChainRewardLabel(reward))}
 }
 render();pumpExploration();return true;
}
function chooseSurveyChain(chain,value,owner='player'){
 if(chain.owner!==owner||chain.completed||!Number.isInteger(value))return false;
 const definition=chainDefinition(chain.id);
 if(chain.pending==='route'&&chain.middle.includes(value)){
  chain.route=value;delete chain.pending;reportSurveyChain(chain,'관제소 선택 · 1 / 3');
 }else if(chain.pending==='reward'&&definition.rewards[value]){
  const reward=definition.rewards[value];
  resolveSurveyChainReward(state,chain,reward);reportSurveyChain(chain,surveyChainRewardLabel(reward));
 }else if(chain.pending==='clues'&&chain.clueOptions.includes(value)&&!chain.clueIds.includes(value)){
  chain.clueIds.push(value);revealAnomalyClue(value);
  if(chain.clueIds.length===chain.clueLimit){
   const reward=definition.rewards[0];
   resolveSurveyChainReward(state,chain,reward);reportSurveyChain(chain,surveyChainRewardLabel(reward)+' · 성계 정보 '+chain.clueIds.length+'곳');
  }
 }else return false;
 dirty=true;return true;
}
function showSurveyChainChoice(chain){
 const definition=chainDefinition(chain.id);
 let heading,choices;
 if(chain.pending==='route'){
  const distances=retreatDistances(state,chain.start);
  heading='관제소 선택';
  choices=chain.middle.map((id,index)=>[id,systemKnown(id)?state.stars[id].name:'관제소 '+(index?'B':'A'),distances.get(id)+'구간']);
 }else if(chain.pending==='reward'){
  heading='활용 방식 선택';
  choices=definition.rewards.map((reward,index)=>[index,reward.label,surveyChainRewardLabel(reward)]);
 }else{
  heading='관측 대상 · '+chain.clueIds.length+' / '+chain.clueLimit;
  choices=chain.clueOptions.filter(id=>!chain.clueIds.includes(id)).map(id=>[id,'미확인 성계 #'+(id+1),'']);
 }
 openDialog(definition.title,heading,'<div class="anomaly-options">'+choices.map(([key,label,detail])=>
  '<button class="anomaly-option" data-chain-choice="'+key+'"><span aria-hidden="true">◇</span><b>'+safeText(label)+'</b><small>'+safeText(detail)+'</small></button>').join('')+'</div><button class="chain-save" id="saveChainChoice">저장</button>');
 $('overlay').querySelector('.modal').classList.add('anomaly-modal');modalKind='exploration';
 $('saveChainChoice').onclick=()=>showSlots('save');
 $('modalBody').querySelectorAll('[data-chain-choice]').forEach(button=>button.onclick=()=>{
  if(!chooseSurveyChain(chain,Number(button.dataset.chainChoice)))return;
  if(chain.pending)showSurveyChainChoice(chain);
  else{closeDialog();render()}
 });
}
function playerSurveyChainTargets(game){
 return (game.surveyChains??[]).filter(chain=>chain.owner==='player'&&surveyChainObjective(chain)!==null);
}
function renderSurveyChainTarget(scene,system){
 for(const chain of playerSurveyChainTargets(state)){
  if(surveyChainObjective(chain)!==system.id)continue;
  const definition=chainDefinition(chain.id),button=document.createElement('button');
  button.type='button';button.className='chain-target';button.dataset.chainTarget=chain.id;
  button.textContent='◈ '+definition.steps[chain.stage];
  button.title=definition.title+' · 조사 행동력 1';
  button.disabled=!canSurveyFromShip(state,activeShip,system.id);
  const point=chain.stage===2&&chain.endPlanet!==null?systemPoint(chain.endPlanet):{x:50,y:23};
  placeNode(button,chain.stage===2&&chain.endPlanet!==null?{x:point.x,y:Math.max(8,point.y-10)}:point);
  button.onclick=()=>investigateSurveyChain(chain);
  button.oncontextmenu=event=>{event.preventDefault();event.stopPropagation();investigateSurveyChain(chain)};
  scene.append(button);
 }
}
