// Variable-size research tree: validate semantics, not a fixed content count.
export function validateResearch(data,buildings){
 const ts=data.technologies,byId=new Map(ts.map(t=>[t.id,t]));
 const fail=message=>{throw Error('Research: '+message)};
 const fields=['sci','eco','exp','mil','dip'];
 if(byId.size!==ts.length||ts.some(t=>!t.id))fail('missing/duplicate IDs');
 if(fields.some(f=>!data.fields[f]||!/^#[0-9a-f]{6}$/i.test(data.fieldColors[f])))fail('fields/colors');
 for(const t of ts){
  if(!t.name||!t.description||!['origin','research','placeholder'].includes(t.nodeType)||!Array.isArray(t.prerequisites)||!Array.isArray(t.effects)||!Array.isArray(t.unlocks)||new Set(t.prerequisites).size!==t.prerequisites.length)fail(t.id+' fields');
  if(t.nodeType==='origin'){
   if(t.era!==0||t.field!=='origin'||t.cost!==0||t.prerequisites.length||t.effects.length||t.unlocks.length)fail(t.id+' origin');
  }else {
   if(!fields.includes(t.field)||!Number.isInteger(t.era)||t.era<1||t.era>5)fail(t.id+' field/stage');
   if(t.nodeType==='placeholder'){
    if(t.cost!==null||t.effects.length||t.unlocks.length||t.prerequisites.length)fail(t.id+' placeholder must be inert');
   }else if(!Number.isFinite(t.cost)||t.cost<=0||!['unlock','expansion','enhancement'].includes(t.researchType)||!['applied','deferred'].includes(t.classification))fail(t.id+' research');
  }
  if(t.classification==='deferred'&&t.effects.some(e=>e.kind!=='future'))fail(t.id+' deferred effect cannot apply');
  for(const id of t.prerequisites){const p=byId.get(id);if(!p||p.nodeType==='placeholder'||p.era>t.era)fail(t.id+' prerequisite: '+id)}
  for(const e of t.effects){if(!['strategicAP','future','production','surveyReward','explorationLevel','subTier','growth','construction','capacity','logistics','expansionDiscount','specialProduction'].includes(e.kind))fail(t.id+' effect kind');if(e.kind==='strategicAP'&&!['all','military','corvette','escort','destroyer','heavy_cruiser','battleship'].includes(e.target))fail(t.id+' AP target');if(e.kind!=='future'&&(!Number.isFinite(e.value)||e.value<0))fail(t.id+' effect');}
 }
 const visited=new Set(),visiting=new Set(),depth=new Map();
 function visit(id){if(visiting.has(id))fail('cycle '+id);if(visited.has(id))return depth.get(id);visiting.add(id);const d=1+Math.max(0,...byId.get(id).prerequisites.map(visit));visiting.delete(id);visited.add(id);depth.set(id,d);return d}
 ts.forEach(t=>visit(t.id));
 const active=ts.filter(t=>t.nodeType==='research'),reachable=new Set(ts.filter(t=>t.nodeType==='origin').map(t=>t.id));
 while(true){const before=reachable.size;for(const t of active)if(t.prerequisites.every(p=>reachable.has(p)))reachable.add(t.id);if(before===reachable.size)break}if(active.some(t=>!reachable.has(t.id)))fail('unreachable');
 for(const slot of buildings.subfacility.slots)if(byId.get(slot.researchId)?.nodeType!=='research')fail('subfacility research');
 for(const [id,t] of Object.entries(data.legacyDefinitions||{}))if(byId.has(id)||!t.name||!Array.isArray(t.effects)||!Array.isArray(t.unlocks)||!Number.isFinite(t.cost)||t.cost<=0)fail('legacy '+id);
 return {research:active.length,origins:ts.filter(t=>t.nodeType==='origin').length,placeholders:ts.filter(t=>t.nodeType==='placeholder').length,totalCost:active.reduce((a,t)=>a+t.cost,0)};
}
