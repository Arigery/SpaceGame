// One shared WebGL renderer avoids allocating a GPU context for every planet.
// GLB bytes are bundled locally so opening index.html needs no server or network.
let modelRenderer,shipGeometry,shipNormalization;
const modelFrames=new Map();
function readShipGeometry(){
 const bytes=Uint8Array.from(atob(SHIP_GLB),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer);
 const jsonSize=view.getUint32(12,true),gltf=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+jsonSize)));
 const binary=20+jsonSize+8;
 function accessor(id){
  const a=gltf.accessors[id],buffer=gltf.bufferViews[a.bufferView];
  const size={5123:2,5125:4,5126:4}[a.componentType],components=a.type==='VEC3'?3:1;
  const result=[];
  for(let i=0;i<a.count;i++)for(let k=0;k<components;k++){
   const offset=binary+(buffer.byteOffset||0)+(a.byteOffset||0)+i*(buffer.byteStride||size*components)+k*size;
   result.push(a.componentType===5126?view.getFloat32(offset,true):a.componentType===5123?view.getUint16(offset,true):view.getUint32(offset,true));
  }
  return result;
 }
 const triangles=[];
 for(const node of gltf.nodes){
  if(node.mesh===undefined)continue;
  const matrix=node.matrix||[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  for(const primitive of gltf.meshes[node.mesh].primitives){
   const positions=accessor(primitive.attributes.POSITION),indices=accessor(primitive.indices);
   const material=gltf.materials[primitive.material],color=material.pbrMetallicRoughness.baseColorFactor;
   for(let i=0;i<indices.length;i+=3){
    const points=indices.slice(i,i+3).map(index=>{
     const [x,y,z]=positions.slice(index*3,index*3+3);
     return [matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]];
    });
    triangles.push({points,color,emissive:material.emissiveFactor? .45:0});
   }
  }
 }
 const flat=triangles.flatMap(t=>t.points);
 const min=[0,1,2].map(axis=>Math.min(...flat.map(p=>p[axis]))),max=[0,1,2].map(axis=>Math.max(...flat.map(p=>p[axis])));
 const scale=1.65/Math.max(...max.map((v,i)=>v-min[i]));
 shipNormalization={min,max,scale};
 for(const t of triangles)for(const p of t.points)for(let i=0;i<3;i++)p[i]=(p[i]-(min[i]+max[i])/2)*scale;
 return triangles;
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
 for(const [type,source] of [[gl.VERTEX_SHADER,'attribute vec3 position;attribute vec3 color;varying vec3 tint;void main(){gl_Position=vec4(position,1.0);tint=color;}'],[gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 tint;void main(){gl_FragColor=vec4(tint,1.0);}']]){
  const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
  gl.attachShader(program,shader);gl.deleteShader(shader);
 }
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Model shader link failed');
 gl.useProgram(program);gl.enable(gl.DEPTH_TEST);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 for(const [name,offset] of [['position',0],['color',12]]){
  const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,24,offset);
 }
 return {canvas,gl};
}
// Oblique orthographic camera: yaw in the orbital plane, then camera elevation.
function projectShipPoint(point,heading=0){
 const angle=heading*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const x=point[0]*c-point[2]*s,z=point[0]*s+point[2]*c;
 return [x,point[1]*.822-z*.57,point[1]*.57+z*.822];
}
function modelCanvas(kind,heading=0){
 const frameKey=kind+':'+heading;

 if(modelFrames.has(frameKey)){const copy=document.createElement('canvas');copy.width=256;copy.height=256;copy.className='model-canvas';copy.setAttribute('aria-hidden','true');copy.getContext('2d').drawImage(modelFrames.get(frameKey),0,0);return copy}
 if(modelRenderer===undefined)modelRenderer=createModelRenderer();
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;canvas.className='model-canvas';canvas.setAttribute('aria-hidden','true');
 if(!modelRenderer)return null;
 const colors={sun:[1,.75,.16],hab:[.15,.5,.95],gas:[.6,.28,.85],mineral:[.85,.2,.18],barren:[.48,.5,.55]};
 const triangles=kind==='ship'?(shipGeometry??=readShipGeometry()):sphereGeometry(colors[kind]||colors.barren);
 const data=[];
 const rotate=p=>kind==='ship'?projectShipPoint(p,heading):p;
 for(const triangle of triangles){
  const points=triangle.points.map(rotate),[a,b,c]=points,u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
  const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal)||1;
  const light=kind==='sun'?.95:Math.min(1,.35+Math.abs((normal[0]*-.4+normal[1]*.6+normal[2]*.7)/length)*.6+(triangle.emissive||0));
  for(const p of points)data.push(p[0],p[1],-p[2],...triangle.color.slice(0,3).map(n=>n*light));
 }
 const {gl}=modelRenderer;gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,data.length/6);
 canvas.getContext('2d').drawImage(modelRenderer.canvas,0,0);modelFrames.set(frameKey,canvas);if(modelFrames.size>96)modelFrames.delete(modelFrames.keys().next().value);return canvas;
}
