import * as THREE from 'three';
// Every candidate is checked against its own source geometry and the opaque shell.
// A large hit region never authorizes a point on the hidden side of the body.
export class PointPicker{
 constructor(camera,body,points,metadata){
  this.camera=camera;this.body=body;this.points=points;this.metadata=metadata;this.ray=new THREE.Raycaster();this.screen=new THREE.Vector3();
  this.hit=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial(),metadata.length);
  this.ids=metadata.map(p=>p.id);this.updateHitRegions(600);
 }
 updateHitRegions(height){
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3();
  this.metadata.forEach((p,i)=>{position.fromArray(p.center);const distance=this.camera.position.distanceTo(position),worldPerPixel=2*distance*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))/Math.max(height,1);const radius=Math.max(p.radius,Math.min(.028,worldPerPixel*(matchMedia('(pointer:coarse)').matches?13:9)));scale.setScalar(radius);matrix.compose(position,new THREE.Quaternion(),scale);this.hit.setMatrixAt(i,matrix);});
  this.hit.instanceMatrix.needsUpdate=true;this.hit.computeBoundingSphere();this.hit.updateMatrixWorld(true);
 }
 project(id,rect){const p=this.metadata.find(p=>p.id===id);if(!p)return null;this.screen.fromArray(p.center).project(this.camera);if(this.screen.z<-1||this.screen.z>1)return null;return{x:(this.screen.x+1)*rect.width/2,y:(1-this.screen.y)*rect.height/2};}
 visible(id){
  const mesh=this.points.get(id);if(!mesh)return false;
  const center=new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).getCenter(new THREE.Vector3()),p=mesh.geometry.attributes.position;
  const targets=[center];for(let i=0;i<p.count;i++)targets.push(new THREE.Vector3().fromBufferAttribute(p,i));
  for(const target of targets){const direction=target.clone().sub(this.camera.position),distance=direction.length();this.ray.set(this.camera.position,direction.normalize());this.ray.near=0;this.ray.far=distance+.00002;const shell=this.ray.intersectObject(this.body,false)[0];if(!shell||shell.distance>=distance-.00001)return true;}
  this.ray.far=Infinity;return false;
 }
 pick(clientX,clientY,rect){
  this.updateHitRegions(rect.height);const xy=new THREE.Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);this.ray.setFromCamera(xy,this.camera);this.ray.far=Infinity;
  const hits=this.ray.intersectObject(this.hit,false),ids=new Set(hits.map(hit=>this.ids[hit.instanceId])),candidates=[];
  // Screen-space distance makes the result stable where adaptive regions overlap.
  for(const id of ids){const projected=this.project(id,rect);if(!projected||!this.visible(id))continue;const distance=Math.hypot(projected.x-(clientX-rect.left),projected.y-(clientY-rect.top));if(distance<=(matchMedia('(pointer:coarse)').matches?24:19))candidates.push({id,distance,projected});}
  candidates.sort((a,b)=>a.distance-b.distance);if(!candidates.length)return{kind:'empty'};
  if(candidates.length>1){const a=candidates[0],b=candidates[1],gap=Math.hypot(a.projected.x-b.projected.x,a.projected.y-b.projected.y);if(gap<11&&b.distance-a.distance<7)return{kind:'crowded',ids:[a.id,b.id]};}
  return{kind:'point',id:candidates[0].id};
 }
 dispose(){this.hit.geometry.dispose();this.hit.material.dispose();this.hit.dispose();}
}
