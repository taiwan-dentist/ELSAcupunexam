import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {PointPicker} from './picking.js';
const zero=new THREE.Vector3(),identity=new THREE.Matrix4(),hiddenMatrix=new THREE.Matrix4().makeScale(0,0,0);
function canonicalFaces(index){const result=[];for(let i=0;i<index.count;i+=3){const f=[index.getX(i),index.getX(i+1),index.getX(i+2)],start=f.indexOf(Math.min(...f));result.push([...f.slice(start),...f.slice(0,start)].join(','));}return result.sort().join(';');}
export class AcupointScene{
 constructor(host,metadata,points,callbacks={}){
  this.host=host;this.metadata=metadata;this.pointData=new Map(points.map(p=>[p.id,p]));this.callbacks=callbacks;this.abort=new AbortController();this.frame=0;this.renderCount=0;this.disposed=false;this.lost=false;this.mode='home';this.selected=null;this.single=null;this.batches=[];this.instances=new Map();this.originals=new Map();this.meridians=[];this.theme=matchMedia('(prefers-color-scheme:dark)');this.motion=matchMedia('(prefers-reduced-motion:reduce)');
 }
 async init(){
  this.renderer=new THREE.WebGPURenderer({antialias:true,alpha:true,powerPreference:'high-performance',forceWebGL:new URLSearchParams(location.search).get('renderer')==='webgl'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));this.renderer.setClearColor(0,0);this.renderer.toneMapping=THREE.NeutralToneMapping;this.renderer.toneMappingExposure=1;
  await this.renderer.init();if(this.disposed){await this.renderer.dispose();return;}
  const canvas=this.renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','3D 人體：方向鍵旋轉，Shift 加方向鍵平移，加減鍵縮放，0 重設，位置題 Enter 選取畫面中央');canvas.setAttribute('role','img');this.host.replaceChildren(canvas);
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(34,1,.005,30);this.camera.position.set(0,.88,-3.35);
  this.controls=new OrbitControls(this.camera,canvas);this.controls.target.set(0,.88,0);this.controls.enableDamping=true;this.controls.dampingFactor=.12;this.controls.minDistance=.075;this.controls.maxDistance=8;this.controls.screenSpacePanning=true;this.controls.maxPolarAngle=Math.PI-.04;this.controls.minPolarAngle=.04;
  this.scene.add(new THREE.HemisphereLight(0xfffaf6,0x87776e,1.8));const key=new THREE.DirectionalLight(0xfffaf6,2.2);key.position.set(-2,3,-4);this.scene.add(key);const fill=new THREE.DirectionalLight(0xffffff,1.2);fill.position.set(2,1,2);this.scene.add(fill);
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);const gltf=await loader.loadAsync(new URL('../model/acupoint.glb',import.meta.url).href);
  this.source=gltf.scene;if(this.disposed){this.disposeSource();await this.renderer.dispose();return;}
  this.source.updateMatrixWorld(true);
  const eligibleNames=new Map([...this.pointData.values()].filter(p=>p.quizEligible).map(p=>[p.nodes[0],p.id]));
  this.source.traverse(mesh=>{
   if(!mesh.isMesh)return;mesh.updateMatrixWorld(true);
   if(mesh.name==='body_shell'){this.body=new THREE.Mesh(mesh.geometry,new THREE.MeshStandardMaterial({color:0xd7c4bb,roughness:.9,metalness:.02,side:THREE.DoubleSide}));this.scene.add(this.body);}
   else if(eligibleNames.has(mesh.name)){const id=eligibleNames.get(mesh.name);this.originals.set(id,mesh);mesh.visible=true;}
   else if(mesh.name.startsWith('mer_')){const line=new THREE.Mesh(mesh.geometry,new THREE.MeshStandardMaterial({color:0x946f60,roughness:.9,side:THREE.DoubleSide}));line.visible=false;this.meridians.push(line);this.scene.add(line);}
  });
  if(!this.body||this.originals.size!==396)throw new Error('模型與核准的 396 題資料不相符。');
  this.body.updateMatrixWorld(true);this.buildInstances();this.picker=new PointPicker(this.camera,this.body,this.originals,this.metadata);
  const change=()=>this.invalidate();this.controls.addEventListener('change',change);this.cleanupControls=()=>this.controls.removeEventListener('change',change);
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.host);
  this.themeObserver=new MutationObserver(()=>{this.updateTheme();this.invalidate();});this.themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  this.theme.addEventListener('change',()=>{this.updateTheme();this.invalidate();},{signal:this.abort.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(this.frame);this.frame=0;}else this.invalidate();},{signal:this.abort.signal});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.contextLost('WebGL 顯示中斷，測驗進度已保留。');},{signal:this.abort.signal});
  canvas.addEventListener('webglcontextrestored',()=>this.callbacks.onRestore?.(),{signal:this.abort.signal});
  const lost=this.renderer.onDeviceLost;this.renderer.onDeviceLost=info=>{lost.call(this.renderer,info);this.contextLost('3D 顯示裝置中斷，測驗進度已保留。');};
  this.bindPointers(canvas);this.resize();this.camera.position.z=-this.fullViewDistance();this.controls.update();this.updateTheme();this.setMode('home');this.callbacks.onReady?.(this.diagnostics());
 }
 buildInstances(){
  // Source markers have distinct baked shapes. Morph-instancing retains every original
  // Float32 vertex and normal, rather than replacing them with standardized spheres.
  const groups=new Map();
  for(const [id,mesh] of this.originals){const key=this.pointData.get(id).meridianCode+'|'+mesh.geometry.attributes.position.count+'|'+canonicalFaces(mesh.geometry.index);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({id,mesh});}
  for(const entries of groups.values()){
   const geometry=new THREE.BufferGeometry(),count=entries[0].mesh.geometry.attributes.position.count;
   geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(count*3),3));geometry.setIndex(entries[0].mesh.geometry.index.clone());
   geometry.morphTargetsRelative=true;geometry.morphAttributes.position=entries.map(e=>e.mesh.geometry.attributes.position.clone());geometry.morphAttributes.normal=entries.map(e=>e.mesh.geometry.attributes.normal.clone());
   const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.62,metalness:0,side:THREE.DoubleSide});
   const batch=new THREE.InstancedMesh(geometry,material,entries.length),dummy=new THREE.Mesh(geometry);batch.frustumCulled=false;
   // r187's node morph path uses ordinary influences for a one-instance batch.
   if(entries.length===1)batch.morphTargetInfluences=[1];
   entries.forEach(({id},index)=>{dummy.morphTargetInfluences.fill(0);dummy.morphTargetInfluences[index]=1;batch.setMorphAt(index,dummy);batch.setMatrixAt(index,identity);batch.setColorAt(index,new THREE.Color(0x805548));this.instances.set(id,{batch,index});});
   batch.morphTexture.needsUpdate=true;batch.instanceMatrix.needsUpdate=true;batch.instanceColor.needsUpdate=true;this.batches.push(batch);this.scene.add(batch);
  }
 }
 bindPointers(canvas){
  const active=new Set();let first=null,multiple=false;
  canvas.addEventListener('pointerdown',event=>{active.add(event.pointerId);if(active.size===1){first={id:event.pointerId,x:event.clientX,y:event.clientY,max:0};multiple=false;}else multiple=true;this.animation=null;},{capture:true,signal:this.abort.signal});
  canvas.addEventListener('pointermove',event=>{if(first&&event.pointerId===first.id)first.max=Math.max(first.max,Math.hypot(event.clientX-first.x,event.clientY-first.y));},{signal:this.abort.signal});
  canvas.addEventListener('pointerup',event=>{active.delete(event.pointerId);if(!multiple&&first?.id===event.pointerId&&first.max<8&&event.button===0&&this.mode==='location'&&!this.lost){const result=this.picker.pick(event.clientX,event.clientY,canvas.getBoundingClientRect());if(result.kind==='crowded'){this.zoomCluster(result.ids);this.callbacks.onPick?.(result);}else this.callbacks.onPick?.(result);}if(!active.size)first=null;},{signal:this.abort.signal});
  canvas.addEventListener('pointercancel',event=>{active.delete(event.pointerId);first=null;multiple=true;},{signal:this.abort.signal});
  canvas.addEventListener('keydown',event=>{const key=event.key;if(key==='Enter'&&this.mode==='location'){event.preventDefault();const rect=canvas.getBoundingClientRect(),result=this.picker.pick(rect.left+rect.width/2,rect.top+rect.height/2,rect);if(result.kind==='crowded')this.zoomCluster(result.ids);this.callbacks.onPick?.(result);return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','0'].includes(key)){event.preventDefault();this.animation=null;if(key==='0')this.view('reset');else if(key==='+'||key==='-')this.view(key==='+'?'zoom':'out');else if(event.shiftKey){const distance=this.camera.position.distanceTo(this.controls.target),right=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1),offset=new THREE.Vector3();if(key==='ArrowLeft')offset.addScaledVector(right,-distance*.035);if(key==='ArrowRight')offset.addScaledVector(right,distance*.035);if(key==='ArrowUp')offset.addScaledVector(up,distance*.035);if(key==='ArrowDown')offset.addScaledVector(up,-distance*.035);this.camera.position.add(offset);this.controls.target.add(offset);this.controls.update();this.invalidate();}else{const offset=this.camera.position.clone().sub(this.controls.target),s=new THREE.Spherical().setFromVector3(offset);if(key==='ArrowLeft')s.theta-=.15;if(key==='ArrowRight')s.theta+=.15;if(key==='ArrowUp')s.phi=Math.max(.05,s.phi-.15);if(key==='ArrowDown')s.phi=Math.min(Math.PI-.05,s.phi+.15);this.camera.position.copy(this.controls.target).add(offset.setFromSpherical(s));this.controls.update();this.invalidate();}}},{signal:this.abort.signal});
 }
 resize(){if(this.disposed||!this.camera)return;const {width,height}=this.host.getBoundingClientRect();if(width<2||height<2)return;this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));this.renderer.setSize(width,height,false);this.invalidate();}
 updateTheme(){if(!this.body)return;this.body.material.color.setHex(0xd7c4bb);this.paintSelection();}
 setMode(mode,target=null){this.mode=mode;this.single=mode==='name'?target:null;for(const [id,{batch,index}] of this.instances)batch.setMatrixAt(index,!this.single||id===this.single?identity:hiddenMatrix);for(const batch of this.batches)batch.instanceMatrix.needsUpdate=true;this.select(this.single);this.invalidate();}
 setMeridians(show){for(const line of this.meridians)line.visible=show;this.invalidate();}
 select(id,tone='selected'){this.selected=id;this.selectionTone=tone;this.paintSelection();this.invalidate();}
 paintSelection(){for(const [id,{batch,index}] of this.instances)batch.setColorAt(index,new THREE.Color(id===this.selected?(this.selectionTone==='wrong'?0xc14d37:0xb65e3e):0x805548));for(const batch of this.batches)if(batch.instanceColor)batch.instanceColor.needsUpdate=true;}
 focusPoint(id){const p=this.metadata.find(p=>p.id===id);if(!p)return;const target=new THREE.Vector3(...p.center),direction=new THREE.Vector3(...p.viewDirection);this.animateTo(target.clone().addScaledVector(direction,.45),target);}
 zoomCluster(ids){const target=new THREE.Vector3();ids.forEach(id=>target.add(new THREE.Vector3(...this.metadata.find(p=>p.id===id).center)));target.multiplyScalar(1/ids.length);const distance=Math.max(.085,this.camera.position.distanceTo(target)*.48),direction=this.camera.position.clone().sub(this.controls.target).normalize();this.animateTo(target.clone().addScaledVector(direction,distance),target);}
 fullViewDistance(){
  const rect=this.host.getBoundingClientRect();if(!this.body||!rect.width||!rect.height)return 3.85;
  const bounds=new THREE.Box3().setFromObject(this.body),header=document.querySelector('.app-header')?.getBoundingClientRect(),bar=this.host.closest('.scene-region')?.querySelector('.scene-toolbar')?.getBoundingClientRect();
  const top=Math.max(16,(header?.bottom??rect.top)-rect.top+16),bottom=Math.min(rect.height-16,(bar?.top??rect.bottom-72)-rect.top-16),tan=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));
  const above=(bounds.max.y-.88)*rect.height/(2*tan*Math.max(24,rect.height/2-top)),below=(.88-bounds.min.y)*rect.height/(2*tan*Math.max(24,bottom-rect.height/2)),across=Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))*rect.height/(2*tan*Math.max(24,rect.width/2-16));
  return Math.max(3.35,Math.max(above,below,across)+Math.max(Math.abs(bounds.min.z),Math.abs(bounds.max.z)));
 }
 view(kind){if(!this.controls)return;const target=this.controls.target.clone();if(kind==='zoom'||kind==='out'){const offset=this.camera.position.clone().sub(target);offset.multiplyScalar(kind==='zoom'?.65:1.5);offset.clampLength(this.controls.minDistance,this.controls.maxDistance);this.animateTo(target.clone().add(offset),target);return;}target.set(0,.88,0);const distance=this.fullViewDistance();this.animateTo(new THREE.Vector3(0,.88,kind==='back'?distance:-distance),target);}
 animateTo(position,target){if(this.motion.matches){this.camera.position.copy(position);this.controls.target.copy(target);this.controls.update();}else this.animation={fromPosition:this.camera.position.clone(),fromTarget:this.controls.target.clone(),position,target,start:performance.now(),duration:480};this.invalidate();}
 invalidate(){if(this.frame||this.disposed||this.lost||document.hidden)return;this.frame=requestAnimationFrame(time=>this.renderFrame(time));}
 renderFrame(time){
  this.frame=0;if(this.disposed||this.lost||document.hidden||!this.host.getClientRects().length)return;
  if(this.animation){const t=Math.min(1,(time-this.animation.start)/this.animation.duration),smooth=1-(1-t)**3;this.camera.position.lerpVectors(this.animation.fromPosition,this.animation.position,smooth);this.controls.target.lerpVectors(this.animation.fromTarget,this.animation.target,smooth);if(t===1)this.animation=null;}
  const moving=this.controls.update();this.camera.updateMatrixWorld();
  try{this.renderer.render(this.scene,this.camera);this.renderCount++;}catch(error){this.renderError=error.stack||String(error);console.error(error);this.contextLost('3D 顯示失敗，請重新載入模型。');return;}
  const rect=this.host.getBoundingClientRect(),position=this.selected?this.picker.project(this.selected,rect):null;
  if(position){const parent=this.host.parentElement.getBoundingClientRect();position.x+=rect.left-parent.left;position.y+=rect.top-parent.top;}
  this.callbacks.onFrame?.({position,visible:!!position&&this.picker.visible(this.selected),tone:this.selectionTone,direction:this.camera.position.z<this.controls.target.z?'正面':'背面'});
  if(moving||this.animation)this.invalidate();
 }
 contextLost(message){if(this.lost||this.disposed)return;this.lost=true;cancelAnimationFrame(this.frame);this.frame=0;this.callbacks.onLost?.(message);}
 diagnostics(){let gpu='瀏覽器未提供';const backend=this.renderer?.backend,isWebGPU=!!backend?.isWebGPUBackend;try{if(isWebGPU){const info=backend.adapter?.info;if(info)gpu=[info.vendor,info.architecture,info.device,info.description].filter(Boolean).join(' ')||gpu;}else if(backend){const gl=this.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');if(ext)gpu=gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)||gpu;}}catch{}return{backend:isWebGPU?'WebGPU':'WebGL2',gpu,three:'0.187.0',dpr:Math.min(devicePixelRatio||1,2),renderCount:this.renderCount,pointCount:this.instances.size,drawBatches:this.batches.length,mode:this.mode,lost:this.lost,renderCalls:this.renderer?.info?.render?.drawCalls??null,error:this.renderError??null};}
 disposeSource(){const geometries=new Set(),materials=new Set();this.source?.traverse(obj=>{if(obj.geometry)geometries.add(obj.geometry);for(const m of Array.isArray(obj.material)?obj.material:[obj.material])if(m)materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
 async dispose(){this.disposed=true;this.abort.abort();cancelAnimationFrame(this.frame);this.frame=0;this.resizeObserver?.disconnect();this.themeObserver?.disconnect();this.cleanupControls?.();this.controls?.dispose();this.picker?.dispose();for(const batch of this.batches){batch.geometry.dispose();batch.material.dispose();batch.dispose();}this.body?.material.dispose();for(const line of this.meridians)line.material.dispose();this.disposeSource();if(this.renderer)await this.renderer.dispose();this.host.replaceChildren();}
}
