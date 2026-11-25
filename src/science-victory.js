const SCIENCE_PROJECT=DATA.balance.scienceProject;

function scienceProjectSurveyCount(game,owner){
 if(game.relicSites)return scienceSurveyCount(game,owner);
 // Earlier saves retain their ordinary survey records without acquiring new relic effects.
 return owner==='player'?game.stars.filter(star=>star.ancient&&
  (star.surveyed||star.objects?.some(object=>object.kind==='relic'&&object.scanned))).length:0;
}
function scienceProjectFor(game,owner){
 return game.scienceProjects?.find(project=>project.owner===owner);
}
function scienceProjectPlanet(game,project){
 const planet=game.stars[project.systemId]?.planets[project.planetIndex];
 return planet?.type==='hab'&&planet.label===project.planetName?planet:null;
}
function scienceProjectBlock(game,owner){
 if(game.scienceProjects?.some(project=>project.completedTurn!==undefined))return '과학 승리 달성';
 if(scienceProjectFor(game,owner))return '프로젝트 건설 중';
 if(scienceProjectSurveyCount(game,owner)<DATA.exploration.relics.scienceGoal)return '유적 조사 기록 부족';
 if(!relicResearchComplete(game,owner,SCIENCE_PROJECT.researchId))return '고대의 신호 해독 필요';
 const resources=owner==='player'?game.res:game.military?.resourcesByOwner?.[owner];
 if(!Object.entries(SCIENCE_PROJECT.cost).every(([id,amount])=>(resources?.[id]??0)>=amount))return '자원 부족';
 return '';
}
function scienceProjectSiteBlock(game,systemId,planetIndex,ship){
 const star=game.stars[systemId],planet=star?.planets[planetIndex];
 if(systemOwner(star)!=='player'||planet?.type!=='hab')return '소유한 거주 가능 행성을 선택하세요.';
 if(!isColonyShip(ship)||game.ships[ship]!==systemId)return '현지 개척선 필요';
 if(colonyBuildingGateway(game,ship))return '개척선 관문 건설 중';
 if(civilianOperationsBlocked(game,systemId))return '적대 군함 주둔';
 return scienceProjectBlock(game,'player');
}
function startScienceProject(game,systemId,planetIndex,ship){
 const owner='player';
 requireFleetOwnerTurn(game,owner);
 const blocked=scienceProjectSiteBlock(game,systemId,planetIndex,ship);
 if(blocked)throw Error(blocked);
 const planet=game.stars[systemId].planets[planetIndex],resources=game.res;
 for(const [id,amount] of Object.entries(SCIENCE_PROJECT.cost))resources[id]=Math.round((resources[id]-amount)*10000)/10000;
 const project={owner,systemId,planetIndex,planetName:planet.label,total:SCIENCE_PROJECT.turns,progress:0,
  startedTurn:game.turn,lastProcessedTurn:game.turn};
 (game.scienceProjects??=[]).push(project);
 return project;
}
function cancelCapturedScienceProject(game,systemId,owner){
 const project=scienceProjectFor(game,owner);
 if(!project||project.systemId!==systemId||project.completedTurn!==undefined)return false;
 game.scienceProjects=game.scienceProjects.filter(item=>item!==project);
 return true;
}
function settleScienceProjects(game){
 const projects=game.scienceProjects??[];
 const completed=[],canceled=[];
 if(!projects.length||projects.some(project=>project.completedTurn!==undefined))return {completed,canceled};
 game.scienceProjects=projects.filter(project=>{
  if(systemOwner(game.stars[project.systemId])!==project.owner||!scienceProjectPlanet(game,project)){
   canceled.push(project);return false;
  }
  if(project.lastProcessedTurn>=game.turn)return true;
  project.lastProcessedTurn=game.turn;
  if(++project.progress>=project.total){
   project.completedTurn=game.turn;completed.push(project);
  }
  return true;
 });
 return {completed,canceled};
}
