function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}};
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function link(stars,a,b){if(!stars[a].edges.includes(b))stars[a].edges.push(b);if(!stars[b].edges.includes(a))stars[b].edges.push(a)}
// 맵 생성 밸런스 수치: 가상 지도 2100×1580, 최소 성계 간격 94. 확대/이동으로 탐색합니다.
// 이 객체의 값을 변경하면 랜덤 지도가 달라집니다.
const MAP_CONFIG=DATA.map;
function seedHash(v){let h=2166136261>>>0;for(let i=0;i<v.length;i++){h^=v.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function randomSeed(){try{const a=new Uint32Array(1);crypto.getRandomValues(a);return String(a[0])}catch(e){return String(Date.now())}}
function randomPoints(rand){
  let points=[];
  for(let a=0;a<MAP_CONFIG.PLACEMENT_ATTEMPTS&&points.length<MAP_CONFIG.STAR_COUNT;a++){
    let theta=2*Math.PI*rand(),r=Math.sqrt(rand());
    const p={x:MAP_CONFIG.CENTER_X+Math.cos(theta)*MAP_CONFIG.RADIUS_X*r,y:MAP_CONFIG.CENTER_Y+Math.sin(theta)*MAP_CONFIG.RADIUS_Y*r};
    if(points.every(q=>dist(p,q)>=MAP_CONFIG.MIN_STAR_DISTANCE))points.push(p);
  }
  if(points.length!==MAP_CONFIG.STAR_COUNT)throw Error('항성계 배치 실패: 최소 거리를 줄이세요.');
  return points;
}
// Bowyer-Watson 들로네 삼각분할로 가까운 점 사이의 항로 후보를 만든다.
function delaunayEdges(points){
  const n=points.length, all=[...points,{x:-4500,y:-4500},{x:6500,y:-4500},{x:1050,y:6500}];
  let tris=[[n,n+1,n+2]];
  function circum(a,b,c){
    const A=all[a],B=all[b],C=all[c], d=2*(A.x*(B.y-C.y)+B.x*(C.y-A.y)+C.x*(A.y-B.y));
    if(Math.abs(d)<1e-10)return null;
    const aa=A.x*A.x+A.y*A.y,bb=B.x*B.x+B.y*B.y,cc=C.x*C.x+C.y*C.y;
    const x=(aa*(B.y-C.y)+bb*(C.y-A.y)+cc*(A.y-B.y))/d;
    const y=(aa*(C.x-B.x)+bb*(A.x-C.x)+cc*(B.x-A.x))/d;
    return {x,y,r2:(x-A.x)**2+(y-A.y)**2};
  }
  for(let i=0;i<n;i++){
    let bad=[],boundary=new Map();
    for(let t=0;t<tris.length;t++){
      const tri=tris[t],circle=circum(...tri);
      if(circle&&((points[i].x-circle.x)**2+(points[i].y-circle.y)**2)<circle.r2-1e-7)bad.push(t);
    }
    for(let j of bad){let t=tris[j];for(let k=0;k<3;k++){
      const a=t[k],b=t[(k+1)%3],key=Math.min(a,b)+','+Math.max(a,b);
      if(boundary.has(key))boundary.delete(key);else boundary.set(key,[a,b]);
    }}
    const badset=new Set(bad);tris=tris.filter((_,j)=>!badset.has(j));
    for(let [a,b] of boundary.values())tris.push([a,b,i]);
  }
  const edges=new Map();
  for(let t of tris)if(t.every(i=>i<n))for(let j=0;j<3;j++){
    const a=Math.min(t[j],t[(j+1)%3]),b=Math.max(t[j],t[(j+1)%3]);
    edges.set(a+','+b,{a,b,d:dist(points[a],points[b])});
  }
  return [...edges.values()].sort((a,b)=>a.d-b.d||a.a-b.a||a.b-b.b);
}
function makeGraph(points,rand){
  const edges=delaunayEdges(points), n=points.length, parent=Array.from({length:n},(_,i)=>i), degree=Array(n).fill(0),chosen=[];
  function root(x){while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x]}return x}
  function use(e){chosen.push(e);degree[e.a]++;degree[e.b]++}
  for(let e of edges){let a=root(e.a),b=root(e.b);if(a!==b){parent[a]=b;use(e)}}
  // MST에 짧은 우회 항로를 일부 추가한다. 최대 연결 개수 제한.
  for(let e of edges){if(chosen.includes(e))continue;if(degree[e.a]>=MAP_CONFIG.MAX_EDGES||degree[e.b]>=MAP_CONFIG.MAX_EDGES)continue;
    if(rand()<MAP_CONFIG.EXTRA_EDGE_CHANCE)use(e)}
  return {chosen,degree};
}
function generate(seedText){
  const seed=String(seedText),rand=rng(seedHash(seed));
  let points=randomPoints(rand),graph=makeGraph(points,rand);
  const eligible=graph.degree.map((v,i)=>({v,i})).filter(x=>x.v>=MAP_CONFIG.START_MIN_EDGES).map(x=>x.i);
  if(!eligible.length)throw Error('시작 성계 후보가 없습니다.');
  const home=eligible[Math.floor(rand()*eligible.length)];
  // 시작 성계를 0번 ID로 재배치하여 기존 탐험/함선 시스템과 호환한다.
  const order=[home,...points.map((_,i)=>i).filter(i=>i!==home)],reverse=new Map(order.map((old,i)=>[old,i]));
  let stars=order.map((old,i)=>({id:i,name:i===0?'테라':`성계-${String(i+1).padStart(3,'0')}`,
    x:points[old].x,y:points[old].y,edges:[],surveyed:i===0,owned:i===0,planets:[],blackholeTo:null,ancient:null}));
  for(let e of graph.chosen)link(stars,reverse.get(e.a),reverse.get(e.b));
  for(let s of stars)s.edges.sort((a,b)=>a-b);
  const neighbor=stars[0].edges[Math.floor(rand()*stars[0].edges.length)];
  const pickUnique=(count,ban)=>{
    let available=stars.map(s=>s.id).filter(i=>!ban.has(i)),out=[];
    while(out.length<count&&available.length){let ix=Math.floor(rand()*available.length);out.push(available.splice(ix,1)[0])}return out;
  };
  const holes=pickUnique(MAP_CONFIG.BLACKHOLE_PAIRS*2,new Set([0,neighbor]));
  for(let i=0;i+1<holes.length;i+=2){stars[holes[i]].blackholeTo=holes[i+1];stars[holes[i+1]].blackholeTo=holes[i]}
  const relicSites=pickUnique(MAP_CONFIG.RELIC_COUNT,new Set([0,neighbor,...holes]));
  relicSites.forEach((id,i)=>stars[id].ancient=i%2===0?'고대 유적':'고대 잔해');
  for(let i=0;i<stars.length;i++){
    const total=3+Math.floor(rand()*3),r=rand();
    const hab=i===0||i===neighbor?1:r<MAP_CONFIG.HAB_CHANCES[0]?0:r<MAP_CONFIG.HAB_CHANCES[0]+MAP_CONFIG.HAB_CHANCES[1]?1:2;
    let arr=[];
    if(i===0)arr=[{type:'hab',level:0},{type:'mineral',level:1},{type:'gas',level:1},{type:'barren',level:0}];
    else{
      for(let k=0;k<hab;k++)arr.push({type:'hab',level:0});
      const slots=total-arr.length,ratios=[['mineral',MAP_CONFIG.GENERAL_CHANCES[0]],['gas',MAP_CONFIG.GENERAL_CHANCES[1]],['barren',MAP_CONFIG.GENERAL_CHANCES[2]]];
      let counts={mineral:0,gas:0,barren:0};
      for(let k=0;k<slots;k++){
        let maxSame=Math.max(2,Math.ceil(slots*.55)),options=ratios.filter(([t])=>counts[t]<maxSame);
        if(!options.length)options=ratios;
        let weights=options.map(([t,r])=>Math.max(.02,r*slots-counts[t]+.35));
        let pick=rand()*weights.reduce((a,b)=>a+b,0),chosen=options[options.length-1][0];
        for(let j=0;j<options.length;j++){pick-=weights[j];if(pick<=0){chosen=options[j][0];break}}
        counts[chosen]++;arr.push({type:chosen,level:0});
      }
      for(let k=arr.length-1;k>0;k--){let j=Math.floor(rand()*(k+1));[arr[k],arr[j]]=[arr[j],arr[k]]}
    }
    stars[i].planets=arr.map((p,k)=>({...p,...(i===0&&p.type==='hab'?{habData:newHabitat()}:{}),label:`${stars[i].name} ${['I','II','III','IV','V'][k]}`,slots:p.type==='hab'?6:0}));
  }
  return {seed,stars,neighbor,turn:1,ships:{explorer:0,explorer2:0,colony:0},ap:{explorer:2,explorer2:2,colony:2},records:['모행성 테라에서 출발했습니다.'],res:{...DATA.balance.initialResources}};
}
