function regionalWonder(star){return DATA.balance.regionalWonders.types[star?.wonderId]}
function ownedWonder(star,owner='player'){return systemOwner(star)===owner?regionalWonder(star):undefined}

function initializeRegionalWonders(game){
 if(game.wonders||game.stars.length<DATA.map.STAR_COUNT)return;
 const config=DATA.balance.regionalWonders;
 const starts=[...new Set([0,...(game.startingSystems??[])])];
 const protectedSites=new Set([...starts,game.neighbor,...(game.guaranteedColonies??[])]);
 const distances=starts.map(id=>retreatDistances(game,id));
 const eligible=game.stars.filter(star=>!protectedSites.has(star.id)&&
  distances.every(distance=>(distance.get(star.id)??0)>=config.minimumStartDistance));
 const contested=star=>{
  const ordered=distances.map(distance=>distance.get(star.id)).sort((a,b)=>a-b);
  return ordered.length>=2&&ordered[1]-ordered[0]<=1;
 };
 const clear=star=>!star.gatewaySite&&!star.ancient&&star.blackholeTo==null;
 const sizeRange=config.maximumSize-config.minimumSize+1;
 for(let attempt=0;attempt<24;attempt++){
  const random=rng(seedHash(game.seed+':regional-wonders:'+attempt));
  const reserved=new Set(),regions={},notes=[];
  let contestedCount=0;
  for(const [id,spec] of Object.entries(config.types)){
   const size=config.minimumSize+Math.floor(random()*sizeRange);
   const available=eventShuffle(eligible.filter(star=>!reserved.has(star.id)),random);
   let region;
   let relaxedOverlap=false;
   const search=(stars,needsContested)=>{
    const pool=new Map(stars.map(star=>[star.id,star]));
    const expanded=new Set();
    const grow=ids=>{
     const key=[...ids].sort((a,b)=>a-b).join(',');
     if(expanded.has(key))return null;
     expanded.add(key);
     if(ids.length===size){
      const members=ids.map(member=>pool.get(member));
      const matches=members.filter(star=>star.planets.some(planet=>planet.type===spec.planet)).length;
      return matches>=(spec.minimumSystems??0)&&(!needsContested||members.some(contested))?ids:null;
     }
     const adjacent=new Set(ids.flatMap(member=>pool.get(member).edges).filter(neighbor=>pool.has(neighbor)&&!ids.includes(neighbor)));
     for(const neighbor of adjacent){const result=grow([...ids,neighbor]);if(result)return result}
     return null;
    };
    for(const star of stars){const result=grow([star.id]);if(result)return result}
    return null;
   };
   const strict=available.filter(clear);
   if(starts.length>1&&contestedCount<2)region=search(strict,true);
   region??=search(strict,false);
   if(!region){
    if(starts.length>1&&contestedCount<2)region=search(available,true);
    region??=search(available,false);
    relaxedOverlap=!!region;
   }
   if(!region)break;
   if(region.some(member=>contested(game.stars[member])))contestedCount++;
   if(relaxedOverlap)notes.push(spec.name+' · 비중복 후보에서 지역 조건을 충족하지 못해 관문·유적·블랙홀 중복 허용');
   for(const member of region)reserved.add(member);
   regions[id]={systems:region};
  }
  if(Object.keys(regions).length!==Object.keys(config.types).length)continue;
  game.wonders=regions;
  game.wonderPlacementNotes=notes;
  for(const [id,region] of Object.entries(regions))for(const member of region.systems)game.stars[member].wonderId=id;
  return;
 }
 throw Error('우주의 경이 배치 실패 · 보호 성계와 항로·행성 조건을 만족하는 네 지역을 구성할 수 없습니다.');
}

function regionalLaneCost(from,to,owner){
 const rates=DATA.balance.ships;
 const owned=systemOwner(from)===owner&&systemOwner(to)===owner;
 const cost=owned?rates.ownedMovementCostPerEdge:rates.movementCostPerEdge;
 const corridor=owned&&from.wonderId&&from.wonderId===to.wonderId?regionalWonder(from):null;
 return corridor?.movementDiscount&&cost>corridor.movementFloor?Math.max(corridor.movementFloor,cost-corridor.movementDiscount):cost;
}
function discoverRegionalWonder(game,systemId,owner){
 const star=game.stars[systemId],region=game.wonders?.[star?.wonderId];
 if(!region||region.discoveredBy)return '';
 const bonus=DATA.balance.regionalWonders.discoveryResearch;
 const resources=owner==='player'?game.res:(game.military.resourcesByOwner??={})[owner]??={};
 resources.research=(resources.research??0)+bonus;
 region.discoveredBy=owner;region.discoveredTurn=game.turn;
 return regionalWonder(star).name+' 발견 · 연구력 +'+bonus;
}
function recordRegionalArrival(game,id,owner='player'){
 const message=discoverRegionalWonder(game,id,owner);
 if(message&&owner==='player'&&typeof state!=='undefined'&&game===state){
  rec(message);
  if(typeof gameActive!=='undefined'&&gameActive)notifyExploration(message);
 }
}
function writeExplorationClue(star){
 const counts=Object.fromEntries(Object.keys(DATA.planets).map(type=>[type,star.planets.filter(planet=>planet.type===type).length]));
 star.explorationClue={habitable:counts.hab>0,counts};
}
function observeWonderFrontier(game,canSee,hasVisited){
 for(const star of game.stars){
  const range=ownedWonder(star)?.observationDistance;
  if(!range)continue;
  let frontier=[star.id];
  const visited=new Set(frontier);
  for(let step=0;step<range;step++){
   const next=new Set(frontier.flatMap(id=>game.stars[id].edges).filter(id=>!visited.has(id)));
   frontier=[...next];
   for(const id of frontier){
    visited.add(id);
    if(canSee(id)&&!hasVisited(id)&&!game.stars[id].explorationClue?.counts)writeExplorationClue(game.stars[id]);
   }
  }
 }
}
function updatePlayerWonderObservation(){observeWonderFrontier(state,visible,systemExplored)}

function wonderEffectText(wonder){
 const percent=number=>Math.round(number*100)+'%';
 if(wonder.researchBonus)return '연구 생산 +'+percent(wonder.researchBonus)+' · 주변 성계 구성 관측';
 if(wonder.mineralBonus)return '광산 생산 +'+percent(wonder.mineralBonus)+' · 가동 광산 보유 시 신소재 +'+wonder.alloyWithMine+'/턴';
 if(wonder.movementDiscount)return '같은 문명이 소유한 지역 내 항로 행동력 −'+wonder.movementDiscount;
 return '에너지 +'+wonder.energyPerSystem+'/턴 · 건물 에너지 유지비 −'+percent(wonder.buildingEnergyDiscount);
}
function regionalWonderMarkup(game,canSee){
 let edges='',markers='';
 for(const [id,region] of Object.entries(game.wonders??{})){
  const visibleSites=new Set(region.systems.filter(canSee));
  for(const member of visibleSites){
   const star=game.stars[member];
   markers+='<circle class="wonder-halo '+id+'" cx="'+star.x+'" cy="'+star.y+'" r="26"/>';
   for(const neighbor of star.edges)if(neighbor>member&&visibleSites.has(neighbor)){
    const next=game.stars[neighbor];
    edges+='<line class="wonder-link '+id+'" x1="'+star.x+'" y1="'+star.y+'" x2="'+next.x+'" y2="'+next.y+'"/>';
   }
  }
 }
 return edges+markers;
}
function renderRegionalWonder(scene,star){
 const wonder=regionalWonder(star);
 if(!wonder)return;
 const status=document.createElement('span');status.className='regional-wonder-status';
 status.tabIndex=0;status.textContent='◈ '+wonder.name;
 status.title=(ownedWonder(star)?'적용 중':'소유 시 적용')+' · '+wonderEffectText(wonder);
 status.setAttribute('aria-label',wonder.name+' · '+status.title);
 scene.append(status);
}
