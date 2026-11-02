const $=id=>document.getElementById(id);
let state, gameActive=false, currentRace='기본 종족', modalKind=null, dirty=false,view='galaxy',activeShip=null,selected=0,sysId=0,scale=1,panX=0,panY=0,dragging=false,dragStart=null,moveMode=false,debugReveal=false,previousCamera=null;
const W=1050,H=790,types=Object.fromEntries(Object.entries(DATA.planets).map(([id,p])=>[id,p.name]));
const resourceNames=DATA.resources;
const HAB_BALANCE=DATA.balance.habitat;
const SPECIAL_BY_ID=new Map(DATA.buildings.special.map(b=>[b.id,b]));
