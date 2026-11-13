export function validateHabitableEvents(data,resourceIds){
 const fail=message=>{throw Error('Habitable events: '+message)};
 const ids=new Set();for(const e of data.events){if(!e.event_id||ids.has(e.event_id)||['title','discovery_text','route_a_label','route_b_label'].some(k=>!e[k]))fail('invalid event');ids.add(e.event_id)}
 if(!Number.isInteger(data.researchMaxLevel)||data.researchMaxLevel<0)fail('research cap');
 for(const value of Object.values(data.resourceMap))if(!resourceIds.includes(value))fail('resource mapping');
 const rows=new Map(),unique=new Set();
 for(const e of data.effects){
  const key=[e.event_id,e.route,e.outcome].join(':'),id=key+':'+e.effect_index;
  if(!ids.has(e.event_id)||!['A','B'].includes(e.route)||!['guaranteed','great','normal','failure'].includes(e.outcome)||!Number.isFinite(e.value)||!Number.isInteger(e.effect_index)||e.effect_index<1||unique.has(id))fail('invalid effect join');unique.add(id);
  const once=e.effect_kind==='empire_resource_once',resource=once||e.effect_kind==='planet_resource_production_pct';
  if(!['empire_resource_once','planet_resource_production_pct','planet_construction_pct','planet_growth_pct'].includes(e.effect_kind))fail('effect kind');
  if(e.scope!==(once?'empire':'planet')||e.duration!==(once?'instant':'permanent')||once!==(e.outcome==='guaranteed'))fail('scope/duration');
  if(resource?!data.resourceMap[e.target]:e.target!==(e.effect_kind==='planet_construction_pct'?'construction':'population_growth'))fail('effect target');
  if(once&&(!Number.isInteger(e.value)||e.value<0))fail('safe reward');
  rows.set(key,true);
 }
 for(const id of ids)for(const route of ['A','B'])for(const outcome of ['guaranteed','great','normal','failure'])if(!rows.has([id,route,outcome].join(':')))fail('missing result');
 for(const method of ['safe','normal','risky']){
  const group=data.probabilities.filter(r=>r.method===method),expected=method==='safe'?['guaranteed']:['failure','great','normal'];
  if(group.map(r=>r.outcome).sort().join(',')!==expected.join(','))fail('outcomes');
  for(const r of group)if(!Number.isFinite(r.base_probability)||!Number.isFinite(r.research_shift_per_tier)||!Number.isFinite(r.effect_multiplier)||r.effect_multiplier<=0)fail('probability fields');
  for(let level=0;level<=data.researchMaxLevel;level++){const ps=group.map(r=>r.base_probability+r.research_shift_per_tier*level);if(ps.some(p=>p<0||p>1)||Math.abs(ps.reduce((a,b)=>a+b,0)-1)>1e-9)fail('probability sum/range')}
 }
 if(data.probabilities.some(r=>!['safe','normal','risky'].includes(r.method)))fail('method');
}
