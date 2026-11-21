// One shared WebGL renderer avoids allocating a GPU context for every planet.
// GLB bytes are bundled locally so opening index.html needs no server or network.
let modelRenderer,shipGeometry,shipNormalization,colonyGeometry,colonyTexture,stationGeometry,stationRing;
const stationVertexData=new Map();
const modelFrames=new Map();
const celestialGeometry={},celestialTextures={},planetVertexData={};
// Shared illustration tuning; no metallic/specular highlights on planets.
const PLANET_LOOK={ambient:.025,diffuse:.92,saturation:.90,navyMix:.18};
function planetLightDirection(x,y){
 const dx=500-x,dy=310-y;
 const light=[dx,-dy,dy*.822/.57],length=Math.hypot(...light)||1;
 return light.map(n=>n/length);
}
function readShipGeometry(encoded=SHIP_GLB,celestialKind=null){
 const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer);
 const jsonSize=view.getUint32(12,true),gltf=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+jsonSize)));
 const binary=20+jsonSize+8;
 function accessor(id){
  const a=gltf.accessors[id],buffer=gltf.bufferViews[a.bufferView];
  const size={5123:2,5125:4,5126:4}[a.componentType],components=a.type==='VEC4'?4:a.type==='VEC3'?3:a.type==='VEC2'?2:1;
  const result=[];
  for(let i=0;i<a.count;i++)for(let k=0;k<components;k++){
   const offset=binary+(buffer.byteOffset||0)+(a.byteOffset||0)+i*(buffer.byteStride||size*components)+k*size;
   result.push(a.componentType===5126?view.getFloat32(offset,true):a.componentType===5123?view.getUint16(offset,true):view.getUint32(offset,true));
  }
  return result;
 }
 const triangles=[];
 // Accumulate parent transforms: station habitat ring is offset by its parent.
 const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 function localMatrix(node){
  if(node.matrix)return node.matrix;
  const [x,y,z,w]=node.rotation||[0,0,0,1],[sx,sy,sz]=node.scale||[1,1,1],t=node.translation||[0,0,0];
  return [(1-2*y*y-2*z*z)*sx,(2*x*y+2*z*w)*sx,(2*x*z-2*y*w)*sx,0,
   (2*x*y-2*z*w)*sy,(1-2*x*x-2*z*z)*sy,(2*y*z+2*x*w)*sy,0,
   (2*x*z+2*y*w)*sz,(2*y*z-2*x*w)*sz,(1-2*x*x-2*y*y)*sz,0,...t,1];
 }
 function multiply(a,b){
  const out=Array(16).fill(0);
  for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)out[col*4+row]+=a[k*4+row]*b[col*4+k];
  return out;
 }
 const ringChannel=encoded===STATION_GLB?gltf.animations?.flatMap(a=>a.channels.map(c=>({channel:c,animation:a}))).find(x=>x.channel.target.path==='rotation'&&gltf.nodes[x.channel.target.node].name?.startsWith('HabitatRing_Rotation')):null;
 const ringNode=ringChannel?.channel.target.node;
 let ringMatrix=null;
 const instances=[];
 function visit(id,parent,inRing=false){
  const node=gltf.nodes[id],matrix=multiply(parent,localMatrix(node));
  if(id===ringNode){inRing=true;ringMatrix=matrix}
  if(node.mesh!==undefined)instances.push({node,matrix,inRing});
  for(const child of node.children||[])visit(child,matrix,inRing);
 }
 const children=new Set(gltf.nodes.flatMap(n=>n.children||[]));
 const roots=gltf.scenes?.[gltf.scene||0]?.nodes||gltf.nodes.map((_,i)=>i).filter(i=>!children.has(i));
 for(const id of roots)visit(id,identity);
 for(const {node,matrix,inRing} of instances){
  for(const primitive of gltf.meshes[node.mesh].primitives){
   const positions=accessor(primitive.attributes.POSITION),indices=accessor(primitive.indices);
   const material=gltf.materials[primitive.material]||{},color=material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1];
   const uv=primitive.attributes.TEXCOORD_0===undefined?null:accessor(primitive.attributes.TEXCOORD_0);
   for(let i=0;i<indices.length;i+=3){
    const points=indices.slice(i,i+3).map(index=>{
     const [x,y,z]=positions.slice(index*3,index*3+3);
     return [matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]];
    });
    triangles.push({points,color,ring:inRing?1:0,uv:uv?indices.slice(i,i+3).map(index=>uv.slice(index*2,index*2+2)):null,emissive:encoded===STATION_GLB?Math.max(...(material.emissiveFactor||[0,0,0])):encoded===SHIP_GLB&&material.emissiveFactor? .45:0});
   }
  }
 }
 const flat=triangles.flatMap(t=>t.points);
 const min=[0,1,2].map(axis=>Math.min(...flat.map(p=>p[axis]))),max=[0,1,2].map(axis=>Math.max(...flat.map(p=>p[axis])));
 const scale=1.65/Math.max(...max.map((v,i)=>v-min[i]));
 if(ringMatrix){
  const sampler=ringChannel.animation.samplers[ringChannel.channel.sampler],times=accessor(sampler.input),rotations=accessor(sampler.output);
  stationRing={pivot:[12,13,14].map((index,i)=>(ringMatrix[index]-(min[i]+max[i])/2)*scale),axis:[ringMatrix[8],ringMatrix[9],ringMatrix[10]],times,angles:times.map((_,i)=>2*Math.atan2(rotations[i*4+2],rotations[i*4+3]))};
 }
 if(encoded===SHIP_GLB)shipNormalization={min,max,scale};
 for(const t of triangles)for(const p of t.points)for(let i=0;i<3;i++)p[i]=(p[i]-(min[i]+max[i])/2)*scale;
 if(encoded===COLONY_GLB&&!colonyTexture){
  const textureIndex=gltf.materials[0]?.pbrMetallicRoughness?.baseColorTexture?.index;
  const image=gltf.images?.[gltf.textures?.[textureIndex]?.source];
  if(image){
   const buffer=gltf.bufferViews[image.bufferView];
   colonyTexture={ready:false};
   createImageBitmap(new Blob([bytes.slice(binary+(buffer.byteOffset||0),binary+(buffer.byteOffset||0)+buffer.byteLength)],{type:image.mimeType}))
    .then(bitmap=>{colonyTexture.bitmap=bitmap;colonyTexture.ready=true;for(const key of modelFrames.keys())if(key.startsWith('colony:'))modelFrames.delete(key);if(combatTestSession?.systemId!=null)renderCombatTest();else if(gameActive&&!motionBusy)render()})
    .catch(()=>{colonyTexture.failed=true});
  }
 }
 if(celestialKind&&!celestialTextures[celestialKind]){
  const index=gltf.materials[0]?.pbrMetallicRoughness?.baseColorTexture?.index;
  const image=gltf.images?.[gltf.textures?.[index]?.source];
  if(image){
   const buffer=gltf.bufferViews[image.bufferView],texture=celestialTextures[celestialKind]={ready:false};
   createImageBitmap(new Blob([bytes.slice(binary+(buffer.byteOffset||0),binary+(buffer.byteOffset||0)+buffer.byteLength)],{type:image.mimeType}))
    .then(bitmap=>{
     texture.bitmap=bitmap;texture.ready=true;
     for(const key of modelFrames.keys())if(key.startsWith(celestialKind+':'))modelFrames.delete(key);
     // Refresh only these static meshes; do not interrupt a ship animation or menu.
     document.querySelectorAll('.model-canvas[data-celestial="'+celestialKind+'"]').forEach(old=>{
      const replacement=modelCanvas(celestialKind,0,JSON.parse(old.dataset.light||"[0,0,1]"),Number(old.dataset.spin||0),old);if(replacement&&replacement!==old)old.replaceWith(replacement);
     });
    }).catch(()=>{texture.failed=true});
  }
 }
 return triangles;
}
function stationRingAngle(seconds){
 if(!stationRing)return 0;
 const {times,angles}=stationRing,duration=times[times.length-1],t=((seconds%duration)+duration)%duration;
 let i=0;while(i<times.length-2&&t>=times[i+1])i++;
 const fraction=(t-times[i])/(times[i+1]-times[i]);
 return angles[i]+(angles[i+1]-angles[i])*fraction;
}
function sphereGeometry(color){
 const triangles=[],point=(lat,lon)=>[Math.cos(lat)*Math.cos(lon)*.85,Math.sin(lat)*.85,Math.cos(lat)*Math.sin(lon)*.85];
 for(let y=0;y<24;y++)for(let x=0;x<40;x++){
  const a=point(y/24*Math.PI-Math.PI/2,x/40*Math.PI*2),b=point((y+1)/24*Math.PI-Math.PI/2,x/40*Math.PI*2);
  const c=point((y+1)/24*Math.PI-Math.PI/2,(x+1)/40*Math.PI*2),d=point(y/24*Math.PI-Math.PI/2,(x+1)/40*Math.PI*2);
  triangles.push({points:[a,b,c],color},{points:[a,c,d],color});
 }
 return triangles;
}
function createModelRenderer(){
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true});
 if(!gl)return null;
 const program=gl.createProgram();
 for(const [type,source] of [[gl.VERTEX_SHADER,'attribute vec3 position;attribute vec3 color;attribute vec2 uv;attribute float ring;uniform float ringAngle;uniform vec3 ringPivot;uniform vec3 ringAxis;uniform float spin;varying vec3 surface;varying vec3 tint;varying vec2 texUV;void main(){vec3 p=vec3(position.xy,-position.z);if(ring>0.5){vec3 v=p-ringPivot,a=normalize(ringAxis);float c=cos(ringAngle),s=sin(ringAngle);p=ringPivot+v*c+cross(a,v)*s+a*dot(a,v)*(1.0-c);}float c=cos(spin),s=sin(spin);p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);gl_Position=vec4(p.xy,-p.z,1.0);tint=color;texUV=uv;surface=p;}'],[gl.FRAGMENT_SHADER,`precision mediump float;
varying vec3 tint;varying vec2 texUV;varying vec3 surface;
uniform sampler2D baseMap;uniform bool textured;uniform bool planet;uniform bool star;
uniform vec3 lightDirection;uniform vec3 atmosphere;uniform vec4 look;
void main(){
 vec4 sampleColor=vec4(tint,1.0)*(textured?texture2D(baseMap,texUV):vec4(1.0));
 if(planet){
  // These GLBs are centered spheres: radial normals give smooth, seam-free light.
  vec3 n=normalize(surface);
  float diffuse=smoothstep(-0.03,0.55,dot(n,lightDirection));
  vec3 base=sampleColor.rgb;
  float luma=dot(base,vec3(.2126,.7152,.0722));
  base=mix(vec3(luma),base,look.z);
  vec3 navy=vec3(13.0,21.0,38.0)/255.0;
  vec3 soft=base-(1.0-2.0*navy)*base*(1.0-base);
  base=mix(base,soft,look.w);
  // Light in linear space, then return to display space.
  vec3 lit=pow(pow(max(base,vec3(0.0)),vec3(2.2))*(look.x+look.y*diffuse),vec3(1.0/2.2));
  float rim=pow(1.0-max(n.z,0.0),3.0)*(.15+.85*diffuse);
  sampleColor.rgb=lit+atmosphere*rim*.22;
 }
 if(star){
  vec3 base=sampleColor.rgb,navy=vec3(13.0,21.0,38.0)/255.0;
  vec3 soft=base-(1.0-2.0*navy)*base*(1.0-base);
  sampleColor.rgb=mix(base,soft,look.w);
 }
 gl_FragColor=sampleColor;
}`]]){
  const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
  gl.attachShader(program,shader);gl.deleteShader(shader);
 }
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Model shader link failed');
 gl.useProgram(program);gl.enable(gl.DEPTH_TEST);
 const white=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,white);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 for(const [name,offset] of [['position',0],['color',12],['uv',24],['ring',32]]){
  const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,name==='ring'?1:name==='uv'?2:3,gl.FLOAT,false,36,offset);
 }
 return {canvas,gl,program};
}
// Oblique orthographic camera: yaw in the orbital plane, then camera elevation.
function projectShipPoint(point,heading=0){
 const angle=heading*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const x=point[0]*c-point[2]*s,z=point[0]*s+point[2]*c;
 return [x,point[1]*.822-z*.57,point[1]*.57+z*.822];
}
function modelCanvas(kind,heading=0,lightDirection=[0,0,1],spin=0,target=null){
 const isPlanet=['hab','gas','mineral','barren'].includes(kind);
 const frameKey=kind+':'+heading+(isPlanet?':'+lightDirection.map(n=>n.toFixed(4)).join(','):'');

 if(!isPlanet&&kind!=='station'&&modelFrames.has(frameKey)){const copy=document.createElement('canvas');copy.width=256;copy.height=256;copy.className='model-canvas';if(CELESTIAL_GLB[kind])copy.dataset.celestial=kind;copy.dataset.light=JSON.stringify(lightDirection);copy.setAttribute('aria-hidden','true');copy.getContext('2d').drawImage(modelFrames.get(frameKey),0,0);return copy}
 if(modelRenderer===undefined)modelRenderer=createModelRenderer();
 const canvas=target||document.createElement('canvas');if(!target){canvas.width=256;canvas.height=256;}canvas.className='model-canvas';if(CELESTIAL_GLB[kind])canvas.dataset.celestial=kind;canvas.dataset.light=JSON.stringify(lightDirection);canvas.dataset.spin=String(spin);canvas.setAttribute('aria-hidden','true');
 if(!modelRenderer)return null;
 const colors={sun:[1,.75,.16],hab:[.15,.5,.95],gas:[.6,.28,.85],mineral:[.85,.2,.18],barren:[.48,.5,.55]};
 const triangles=kind==='station'?(stationGeometry??=readShipGeometry(STATION_GLB)):kind==='colony'?(colonyGeometry??=readShipGeometry(COLONY_GLB)):kind==='ship'?(shipGeometry??=readShipGeometry()):CELESTIAL_GLB[kind]?(celestialGeometry[kind]??=readShipGeometry(CELESTIAL_GLB[kind],kind)):sphereGeometry(colors[kind]||colors.barren);
 const data=[];
 if(isPlanet?!planetVertexData[kind]:kind==='station'?!stationVertexData.has(heading):true){
 // Colony GLB faces +Z; rotate its mesh to the shared -Z forward convention.
 const rotate=p=>(kind==='ship'||kind==='colony'||kind==='station')?projectShipPoint(p,heading+(kind==='colony'?180:0)):p;
 for(const triangle of triangles){
  const points=triangle.points.map(rotate),[a,b,c]=points,u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
  const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal)||1;
  const light=isPlanet?1:kind==='sun'?.95:Math.min(1,.35+Math.abs((normal[0]*-.4+normal[1]*.6+normal[2]*.7)/length)*.6+(triangle.emissive||0));
  for(const [index,p] of points.entries())data.push(p[0],p[1],-p[2],...triangle.color.slice(0,3).map(n=>n*light),...(triangle.uv?.[index]||[0,0]),triangle.ring||0);
 }
 }
 if(kind==='station'&&!stationVertexData.has(heading))stationVertexData.set(heading,new Float32Array(data));
 const vertices=isPlanet?(planetVertexData[kind]??=new Float32Array(data)):kind==='station'?stationVertexData.get(heading):new Float32Array(data);
 const {gl,program}=modelRenderer;
 gl.uniform1f(gl.getUniformLocation(program,'ringAngle'),kind==='station'?stationRingAngle(spin):0);
 gl.uniform3fv(gl.getUniformLocation(program,'ringPivot'),kind==='station'&&stationRing?projectShipPoint(stationRing.pivot,heading):[0,0,0]);
 gl.uniform3fv(gl.getUniformLocation(program,'ringAxis'),kind==='station'&&stationRing?projectShipPoint(stationRing.axis,heading):[0,0,1]);
 gl.uniform1f(gl.getUniformLocation(program,'spin'),isPlanet?spin:0);
 gl.uniform1i(gl.getUniformLocation(program,'planet'),isPlanet?1:0);
 gl.uniform1i(gl.getUniformLocation(program,'star'),kind==='sun'?1:0);
 gl.uniform3fv(gl.getUniformLocation(program,'lightDirection'),lightDirection);
 gl.uniform3fv(gl.getUniformLocation(program,'atmosphere'),kind==='hab'?[.25,.55,1]:kind==='gas'?[.65,.35,.85]:kind==='mineral'?[1,.38,.25]:[0,0,0]);
 gl.uniform4f(gl.getUniformLocation(program,'look'),PLANET_LOOK.ambient,PLANET_LOOK.diffuse,PLANET_LOOK.saturation,PLANET_LOOK.navyMix);
 const texture=kind==='colony'?colonyTexture:celestialTextures[kind];
 const textured=texture?.ready;
 gl.uniform1i(gl.getUniformLocation(program,'textured'),textured?1:0);
 if(textured){
  if(!texture.gpu){texture.gpu=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture.gpu);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,texture.bitmap);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)}
  gl.bindTexture(gl.TEXTURE_2D,texture.gpu);
 }
gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices.length/9);
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,256,256);ctx.drawImage(modelRenderer.canvas,0,0);if(!isPlanet&&kind!=='station')modelFrames.set(frameKey,canvas);if(modelFrames.size>96)modelFrames.delete(modelFrames.keys().next().value);return canvas;
}
