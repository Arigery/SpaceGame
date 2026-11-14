// Definitions are flexible; only real research participates in spending/prerequisites.
const RESEARCH_BY_ID=new Map(DATA.research.technologies.map(t=>[t.id,t]));
const RESEARCH_LEGACY=DATA.research.legacyDefinitions||{};
function isResearch(t){return t?.nodeType==='research'}
function initializeResearch(game){
 const oldLevel=Math.min(2,Math.max(0,Math.floor(Number(game.explorationResearchLevel)||0)));
 const raw=game.research||{},done=new Set(),legacy=new Set();
 for(const id of Array.isArray(raw.completed)?raw.completed:[]){
  if(isResearch(RESEARCH_BY_ID.get(id)))done.add(id);
  else if(Object.hasOwn(RESEARCH_LEGACY,id))legacy.add(id);
 }
 for(const id of Array.isArray(raw.legacyCompleted)?raw.legacyCompleted:[])if(Object.hasOwn(RESEARCH_LEGACY,id))legacy.add(id);
 // Preserve the old explicit survey level without granting unrelated new prerequisites.
 if(!game.research&&oldLevel){done.add('sci_2_2');if(oldLevel===2)done.add('sci_3_2')}
 const progress={};let refund=0;
 for(const [id,value] of Object.entries(raw.progress||{})){
  if(!Number.isFinite(value)||value<0)continue;
  const t=RESEARCH_BY_ID.get(id);
  if(isResearch(t)&&!done.has(id)){progress[id]=Math.min(t.cost,value);refund+=Math.max(0,value-t.cost)}
  else if(!done.has(id)&&!legacy.has(id)&&Object.hasOwn(RESEARCH_LEGACY,id))refund+=Math.min(value,RESEARCH_LEGACY[id].cost);
 }
 if(refund)game.res.research=Math.round(((Number(game.res.research)||0)+refund)*1e8)/1e8;
 // Already paid work may continue after prerequisite rearrangement. New starts use the new graph.
 const current=isResearch(RESEARCH_BY_ID.get(raw.current))&&!done.has(raw.current)&&Object.hasOwn(progress,raw.current)?raw.current:null;
 const untouchedCurrent=isResearch(RESEARCH_BY_ID.get(raw.current))&&!done.has(raw.current)&&RESEARCH_BY_ID.get(raw.current).prerequisites.every(id=>done.has(id)||RESEARCH_BY_ID.get(id)?.nodeType==='origin')?raw.current:null;
 game.research={version:2,completed:[...done],legacyCompleted:[...legacy],current:current||untouchedCurrent,progress};
 const level=Math.max(oldLevel,done.has('sci_3_2')?2:done.has('sci_2_2')?1:0);
 for(const s of game.stars||[])for(const p of s.planets||[]){const ev=p.habitableEvent;if(ev?.status==='pending')ev.researchLevelAtDiscovery??=ev.researchLevel??level}
 delete game.explorationResearchLevel;
 return game.research;
}
function researchState(){return state.research?.version===2?state.research:initializeResearch(state)}
function researchComplete(id){return RESEARCH_BY_ID.get(id)?.nodeType==='origin'||(isResearch(RESEARCH_BY_ID.get(id))&&researchState().completed.includes(id))}
function researchAvailable(id){const t=RESEARCH_BY_ID.get(id);return isResearch(t)&&!researchComplete(id)&&t.prerequisites.every(researchComplete)}
function researchEffectDefinitions(){const r=researchState();return [...r.completed.map(id=>RESEARCH_BY_ID.get(id)),...(r.legacyCompleted||[]).map(id=>RESEARCH_LEGACY[id])].filter(Boolean)}
function researchModifier(kind,target=''){if(typeof tutorial!=='undefined'&&tutorial)return 0;let result=0;for(const t of researchEffectDefinitions())for(const e of t.effects)if(e.kind===kind&&(e.target===target||e.target==='all'))result=kind==='explorationLevel'||kind==='subTier'?Math.max(result,e.value):result+e.value;return result}
function researchUnlocks(){return researchEffectDefinitions().flatMap(t=>t.unlocks)}
function startResearch(id){if(!researchAvailable(id))return false;researchState().current=id;dirty=true;return true}
function stopResearch(){researchState().current=null;dirty=true}
function researchEstimate(id,net=incomes().research){const r=researchState(),t=RESEARCH_BY_ID.get(id);if(!isResearch(t))return null;const remaining=Math.max(0,t.cost-(r.progress[id]||0)),stock=Math.max(0,state.res.research);const settled=Math.max(0,Math.round((stock+net)*10000)/10000),deposit=Math.min(remaining,settled),rate=Math.max(0,Math.round(net*10000)/10000);return {remaining,stock,net,deposit,turns:deposit+1e-8>=remaining?1:rate>0?1+Math.ceil((remaining-deposit)/rate-1e-8):Infinity}}
function settleResearch(){const r=researchState(),t=RESEARCH_BY_ID.get(r.current);if(!isResearch(t)||researchComplete(t.id)){r.current=null;return null}const paid=Math.min(Math.max(0,state.res.research),Math.max(0,t.cost-(r.progress[t.id]||0)));state.res.research=Math.round((state.res.research-paid)*1e8)/1e8;r.progress[t.id]=(r.progress[t.id]||0)+paid;if(r.progress[t.id]+1e-8<t.cost)return null;r.completed.push(t.id);delete r.progress[t.id];r.current=null;return t}
function researchSurveyReward(system,target){if(!system.planets.includes(target))return;const amount=researchModifier('surveyReward','research');if(amount){state.res.research+=amount;rec('행성 탐사 기록 · 연구력 +'+amount)}}
