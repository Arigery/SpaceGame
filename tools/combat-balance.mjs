// Reproducible test scenarios; no save files, browser or game-state changes.
import fs from 'node:fs';
import vm from 'node:vm';
import {readData} from './build.mjs';
const context=vm.createContext({DATA:readData()});
for(const file of ['ship-designs','combat'])vm.runInContext(fs.readFileSync(new URL('../src/'+file+'.js',import.meta.url),'utf8'),context);
const result=vm.runInContext(`(()=>{
 const scenarios=[
  ['초계함 10 / 전함 1',[['corvette',10]],[['battleship',1]]],
  ['초계함 10 / 호위함 5',[['corvette',10]],[['escort',5]]],
  ['초계함 10 / 구축함 3',[['corvette',10]],[['destroyer',3]]],
  ['초계함 10 / 전함 1+호위함 2',[['corvette',10]],[['battleship',1],['escort',2]]],
  ['초계함 10 / 초계함 10',[['corvette',10]],[['corvette',10]]],
  ['혼성 50점 대칭',[['battleship',1],['heavy_cruiser',3],['destroyer',3],['escort',4],['corvette',5]],[['battleship',1],['heavy_cruiser',3],['destroyer',3],['escort',4],['corvette',5]]]
 ];
 return scenarios.map(([name,left,right])=>{
  const counts={a:0,b:0,draw:0,timeout:0};let seconds=0;
  for(let seed=1;seed<=40;seed++){
   const units=[...left.flatMap(([h,n])=>Array.from({length:n},(_,i)=>createCombatUnit('a_'+h+'_'+i,h,'a',0))),...right.flatMap(([h,n])=>Array.from({length:n},(_,i)=>createCombatUnit('b_'+h+'_'+i,h,'b',DATA.combat.rules.initialSeparation)))];
   const b=createCombat(units,Math.imul(seed,2654435761)>>>0,[['a','b']],true);
   while(!b.winner&&b.tick<DATA.combat.fleets.maxCombatSteps)stepCombat(b);
   counts[b.winner||'timeout']++;seconds+=b.tick*DATA.combat.rules.stepSeconds;
  }
  return {scenario:name,...counts,meanSeconds:Math.round(seconds/40*100)/100};
 });
})()`,context);
console.table(result);
if(result.some(r=>r.timeout))throw Error('Simulation did not terminate');
