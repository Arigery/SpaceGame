import fs from 'node:fs';
import { validateHabitableEvents } from './validate-habitable-events.mjs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sourceFiles = ['state.js', 'galaxy.js', 'habitat.js', 'construction.js', 'exploration.js', 'habitable-events.js', 'habitat-ui.js', 'simulation.js', 'map-ui.js', 'input.js', 'models.js', 'presentation.js', 'tutorial.js', 'command-ui.js', 'saves-menu.js'];
export function readData() {
  const data = Object.fromEntries(['resources', 'planets', 'map', 'buildings', 'balance', 'exploration', 'habitableEvents', 'habitableStories'].map(name => [name, JSON.parse(fs.readFileSync(path.join(root, 'data', name + '.json'), 'utf8'))]));
  const ids = Object.keys(data.resources);
  if (ids.join(',') !== 'energy,mineral,food,consumer,alloy,research') throw Error('v13 resource IDs and order must be preserved for save compatibility.');
  const allIds = new Set();
  for (const b of data.buildings.common) {
    if (!b.id || !b.name || allIds.has(b.id)) throw Error('Missing/duplicate common building ID: ' + b.id);
    allIds.add(b.id);
  }
  for (const id of ['house', 'medical', ...['consumer','mineral','energy','food'].map(r=>'admin_'+r), ...ids.map(r=>'log_'+r)]) {
    if (!allIds.has(id)) throw Error('Missing v13 building: ' + id);
  }
  if (data.buildings.special.map(b=>b.id).join(',') !== ids.join(',')) throw Error('Special buildings must match resource IDs.');
  for (const b of data.buildings.special) {
    if (!Number.isFinite(b.productionPerWorker) || b.productionPerWorker < 0) throw Error('Invalid production: ' + b.id);
  }
  for (const id of ['hab','mineral','gas','barren']) if (!data.planets[id]?.name) throw Error('Missing planet type: '+id);
  for (const id of ['mineral','gas']) {
    const p=data.planets[id];
    if (!ids.includes(p.resource) || !Number.isInteger(p.maxLevel) || p.maxLevel<1 || !(p.productionPerLevel>=0)) throw Error('Invalid facility: '+id);
    for(let level=1;level<=p.maxLevel;level++)if(!Number.isInteger(p.levels?.[level]?.constructionTurns)||p.levels[level].constructionTurns<1)throw Error('Invalid facility timer: '+id+'/'+level);
  }
  for (const id of ids) if (!Number.isFinite(data.balance.initialResources[id]) || data.balance.initialResources[id]<0) throw Error('Invalid initial resource: '+id);
  const m=data.map;
  for (const key of ['STAR_COUNT','PLACEMENT_ATTEMPTS','MAX_EDGES','START_MIN_EDGES']) if (!Number.isInteger(m[key]) || m[key]<1) throw Error('Invalid map value: '+key);
  for (const key of ['HAB_CHANCES','GENERAL_CHANCES']) if (!Array.isArray(m[key]) || m[key].length!==3 || m[key].some(v=>!Number.isFinite(v)||v<0) || Math.abs(m[key].reduce((a,b)=>a+b,0)-1)>1e-9) throw Error('Probabilities must sum to 1: '+key);
  const amounts=(values,label,nullable=false)=>{
    if(!values||typeof values!=='object')throw Error('Missing '+label);
    for(const [r,n] of Object.entries(values))if(!ids.includes(r)||!(nullable&&n===null)&&(!Number.isFinite(n)||n<0))throw Error('Invalid '+label+': '+r);
  };
  const work=(spec,label)=>{amounts(spec.cost,label+' cost');if(!Number.isFinite(spec.productionRequired)||spec.productionRequired<=0)throw Error('Invalid work: '+label)};
  for(const b of [...data.buildings.common,...data.buildings.special]){
    work(b,b.id);amounts(b.upkeep,b.id+' upkeep',true);
    for(const [level,spec] of Object.entries(b.upgrades||{})){work(spec,b.id+'/'+level);amounts(spec.upkeep,b.id+'/'+level+' upkeep',true)}
  }
  amounts(data.buildings.center.upkeep,'center upkeep',true);
  for(const [level,spec] of Object.entries(data.buildings.specialUpgrades))work(spec,'special/'+level);
  work(data.buildings.subfacility,'subfacility');
  const subSlots=data.buildings.subfacility.slots;
  if(!Array.isArray(subSlots)||subSlots.length!==data.balance.habitat.subSlots)throw Error('Invalid subfacility slot count');
  for(const [index,slot] of subSlots.entries())if(slot.tier!==subSlots.length-index||!Number.isFinite(slot.productionBonus)||slot.productionBonus<0)throw Error('Invalid subfacility tier/bonus: '+index);
  for(const type of ['mineral','gas'])for(const spec of Object.values(data.planets[type].levels)){amounts(spec.cost,type+' cost');amounts(spec.upkeep,type+' upkeep',true)}
  for(const n of Object.values(data.buildings.commonExpansion))if(!Number.isFinite(n)||n<=0)throw Error('Invalid expansion factor');
  for(const key of ['initialPopulation','colonyPopulation'])if(!Number.isInteger(data.balance.habitat[key])||data.balance.habitat[key]<1)throw Error('Invalid population: '+key);
  const appearance=data.balance.planetAppearance;
  for(const size of ['small','medium','large']){
    if(!(appearance?.sizeScales[size]>0))throw Error('Invalid planet size: '+size);
    for(const type of ['hab','gas','mineral','barren'])if(!(appearance.rotationMinutes[type]?.[size]>0))throw Error('Invalid rotation period: '+type+'/'+size);
  }
  for(const key of ['orbitMinutes','orbitRadius','orbitFlattening'])if(!Number.isFinite(data.balance.stationAppearance?.[key])||data.balance.stationAppearance[key]<=0)throw Error('Invalid station orbit: '+key);
  const exploration=data.exploration;
  for(const rates of [exploration.rates,exploration.outcomeRates,exploration.barrenOutcomeRates])if(Object.values(rates).some(n=>!Number.isFinite(n)||n<0)||Math.abs(Object.values(rates).reduce((a,b)=>a+b,0)-1)>1e-9)throw Error('Invalid exploration ratios');
  if(!Number.isFinite(exploration.habitableChance)||exploration.habitableChance<0||exploration.habitableChance>1||Object.keys(exploration.rates).sort().join(',')!=='anomaly,normal,rare')throw Error('Invalid split exploration probabilities');
  if(!Number.isFinite(exploration.signalChance)||exploration.signalChance<0||exploration.signalChance>1)throw Error('Invalid signal chance');
  const eventIds=new Set();
  for(const e of exploration.events){
    if(eventIds.has(e.id)||!['mineral','gas','barren'].includes(e.planet)||!['positive','negative','choice'].includes(e.tone)||!e.title||!e.description||e.options.length!==(e.tone==='choice'?2:1))throw Error('Invalid exploration event: '+e.id);
    eventIds.add(e.id);
    for(const option of e.options)for(const effect of option.effects){
      if(!['resource','production','temporaryProduction','construction','actionPoints','clue'].includes(effect.kind))throw Error('Invalid exploration effect');
      if(effect.kind==='resource'&&(!ids.includes(effect.resource)||!Number.isFinite(effect.amount)||effect.amount<0))throw Error('Invalid event reward');
      if(['production','temporaryProduction','actionPoints'].includes(effect.kind)&&(!Number.isFinite(effect.amount)||effect.amount < (effect.kind==='temporaryProduction'?-1:0)))throw Error('Invalid event modifier');
      if(['construction','temporaryProduction'].includes(effect.kind)&&(!Number.isInteger(effect.turns)||effect.turns<1))throw Error('Invalid event duration');
    }
  }
  for(const planet of ['mineral','gas','barren'])for(const tone of (planet==='barren'?['positive','choice']:['positive','negative','choice']))if(!exploration.events.some(e=>!e.retired&&e.planet===planet&&e.tone===tone))throw Error('Missing exploration category');
  if(Object.keys(exploration.barrenOutcomeRates).sort().join(',')!=='choice,positive'||exploration.events.some(e=>!e.retired&&e.planet==='barren'&&e.tone==='negative'))throw Error('Barren events cannot be negative');
  validateHabitableEvents(data.habitableEvents,ids);
  const storyIds=new Set();
  for(const story of data.habitableStories.stories){
    if(storyIds.has(story.event_id)||!data.habitableEvents.events.some(e=>e.event_id===story.event_id)||['story_intro','route_a_story','route_b_story'].some(k=>typeof story[k]!=='string'||!story[k].trim()))throw Error('Invalid habitat story: '+story.event_id);
    storyIds.add(story.event_id);
  }
  if(storyIds.size!==data.habitableEvents.events.length)throw Error('Missing habitat story');
  if(data.habitableStories.biomes.length!==5||new Set(data.habitableStories.biomes).size!==5||data.habitableEvents.events.some(e=>e.biome!=='공통'&&!data.habitableStories.biomes.includes(e.biome)))throw Error('Invalid habitat biomes');
  return data;
}
export function bundle(data=readData()) {
  return '// GENERATED by npm run build. Edit src/, styles/ and data/ instead.\n' +
    "(()=>{'use strict';\nconst DATA="+JSON.stringify(data)+';\n'+
    '\nconst SHIP_GLB='+JSON.stringify(fs.readFileSync(path.join(root,'assets/ships/exploration_ship_NX02.glb')).toString('base64'))+';\n'+
    '\nconst COLONY_GLB='+JSON.stringify(fs.readFileSync(path.join(root,'assets/ships/space_colony_ship.glb')).toString('base64'))+';\n'+
    '\nconst STATION_GLB='+JSON.stringify(fs.readFileSync(path.join(root,'assets/stations/titanium_colony_station.glb')).toString('base64'))+';\n'+
    '\nconst CELESTIAL_GLB='+JSON.stringify(Object.fromEntries(Object.entries({sun:'golden_star',hab:'habitable_planet',gas:'gas_planet',mineral:'mineral_planet',barren:'barren_planet'}).map(([kind,name])=>[kind,fs.readFileSync(path.join(root,'assets/celestial',name+'.glb')).toString('base64')])))+';\n'+
    sourceFiles.map(name=>'\n// ---- src/'+name+' ----\n'+fs.readFileSync(path.join(root,'src',name),'utf8')).join('\n')+'\n})();\n';
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output=bundle();
  new vm.Script(output, {filename:'game.js'});
  if(process.argv.includes('--check')){
    for(const name of sourceFiles)new vm.Script(fs.readFileSync(path.join(root,'src',name),'utf8'),{filename:name});
    if(fs.readFileSync(path.join(root,'game.js'),'utf8')!==output)throw Error('game.js is stale. Run npm run build.');
    console.log('Source syntax, JSON data and generated game.js consistency checks passed.');
  }else{
    fs.writeFileSync(path.join(root,'game.js'),output);
    console.log('Built game.js from '+sourceFiles.length+' source files and 8 JSON files. Open index.html directly.');
  }
}
