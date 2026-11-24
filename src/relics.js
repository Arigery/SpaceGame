function initializeAncientRelics(game){
 if(game.relicSites)return;
 const sites=game.stars.filter(star=>star.ancient);
 const config=DATA.exploration.relics;
 if(sites.length!==config.types.length)return;
 const random=rng(seedHash(game.seed+':ancient-relics-v1'));
 const types=eventShuffle(config.types,random),order=eventShuffle(sites,random);
 for(const [index,star] of order.entries()){
  star.relic={
   type:types[index].id,requiredResearch:index<config.advancedCount?config.advancedResearch:config.standardResearch,
   surveyedBy:[],firstOwner:null
  };
 }
 game.relicSites=sites.map(star=>star.id);
}
function relicDefinition(star){
 return DATA.exploration.relics.types.find(type=>type.id===star.relic?.type);
}
function relicResearchComplete(game,owner,id){
 const research=owner==='player'?game.research:game.military?.researchByOwner?.[owner];
 return (research?.completed??[]).includes(id);
}
function relicSurveyBlock(game,star,owner='player'){
 if(!star.relic)return '';
 if(star.relic.surveyedBy.includes(owner))return '조사 완료';
 if(relicResearchComplete(game,owner,star.relic.requiredResearch))return '';
 return RESEARCH_BY_ID.get(star.relic.requiredResearch).name+' 필요';
}
function surveyAncientRelic(game,star,owner='player'){
 const relic=star.relic;
 if(!relic||relicSurveyBlock(game,star,owner))return null;
 relic.surveyedBy.push(owner);
 const first=!relic.firstOwner;
 if(first)relic.firstOwner=owner;
 return {first,definition:relicDefinition(star)};
}
function relicModifier(game,kind,target='',owner='player'){
 let bonus=0;
 for(const id of game.relicSites??[]){
  const star=game.stars[id];
  if(star.relic.firstOwner!==owner)continue;
  const effect=relicDefinition(star);
  if(effect.kind===kind&&effect.target===target)bonus+=effect.amount;
 }
 return bonus;
}
function scienceSurveyCount(game,owner){
 return (game.relicSites??[]).filter(id=>game.stars[id].relic.surveyedBy.includes(owner)).length;
}
function relicEffectText(definition){
 const label=definition.kind==='production'?resourceNames[definition.target]+' 생산':
  definition.kind==='growth'?'인구 성장':'함선 건조 진행량';
 return label+' +'+Math.round(definition.amount*100)+'%';
}
