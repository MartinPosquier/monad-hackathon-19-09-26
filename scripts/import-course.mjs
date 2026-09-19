/** Conversion reproductible du modèle fourni ; aucune dépendance à Blender. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
const sourcePath=process.argv[2] || 'C:/Users/marti/Downloads/parcours-spermatozoides.obj';
const text=fs.readFileSync(sourcePath,'utf8');
const groups={}; let current;
for(const line of text.split(/\r?\n/)) {
 if(line.startsWith('o ')) { current={v:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}; groups[line.slice(2)]=current; }
 if(line.startsWith('v ') && current) { const v=line.slice(2).trim().split(/\s+/).map(Number); current.v.push(v); v.forEach((x,i)=>{current.min[i]=Math.min(current.min[i],x); current.max[i]=Math.max(current.max[i],x)}); }
}
const middle=(a,b)=>a.map((v,i)=>(v+b[i])/2);
const center=name=>middle(groups[name].min,groups[name].max);
const points=[]; const sections=[]; let distance=0;
function append(p,right=[0,0,1]) { const last=points.at(-1); if(last) { const ds=Math.hypot(...p.map((v,i)=>v-last.p[i])); if(ds<1e-5)return; distance+=ds; } points.push({s:distance,p,right}); }
function ring(v,i) { const a=v[i+7],b=v[i+8],len=Math.hypot(...b.map((x,k)=>x-a[k])); append(middle(a,b),b.map((x,k)=>(x-a[k])/len)); }
function lineTo(end,step=.25) { const start=points.at(-1).p; const n=Math.ceil(Math.hypot(...end.map((v,i)=>v-start[i]))/step); for(let i=1;i<=n;i++) append(start.map((v,k)=>v+(end[k]-v)*i/n)); }
const trough=groups.trough.v;
for(let i=0;i<trough.length;i+=16) ring(trough,i);
sections.push({name:'Lance & spirale',from:0,to:distance});
for(const [name,label] of [['galton_bed','Galton'],['bars_bed','Barres']]) { const from=distance,v=groups[name].v; lineTo(middle(v[7],v[8])); lineTo(middle(v[23],v[24])); sections.push({name:label,from,to:distance}); }
const mill=center('mill_axle'); const discTop=groups.disc_floor.max[1];
const millFrom=distance;
const discHeight=x=>discTop-(x-mill[0])*.035;
lineTo([groups.disc_floor.min[0]+1.2,discHeight(groups.disc_floor.min[0]+1.2),-9.5]);
lineTo([groups.disc_floor.max[0]-.8,discHeight(groups.disc_floor.max[0]-.8),-9.5]);
sections.push({name:'Moulinet',from:millFrom,to:distance});
const exitFrom=distance,exit=groups.exit_chute_bed.v;
lineTo(middle(exit[7],exit[8])); lineTo(middle(exit[23],exit[24]));
const trayOffset=exit[23][1]-groups.tray_floor.max[1];
lineTo([57,exit[23][1],-9.5]); sections.push({name:'Arrivée',from:exitFrom,to:distance});
function project(p,from=0,to=Infinity) { let best; for(const v of points) if(v.s>=from && v.s<=to) {const d=Math.hypot(p[0]-v.p[0],p[2]-v.p[2]); if(!best || d<best.d) best={d,s:v.s,lane:(p[0]-v.p[0])*v.right[0]+(p[2]-v.p[2])*v.right[2]}; } return best; }
const pins=Object.keys(groups).filter(n=>/^galton_peg_r\d+_\d+$/.test(n)).map(n=>{const c=center(n),v=project(c,sections[1].from,sections[1].to);return {x:v.lane,y:v.s,radius:.26};});
const bars=Object.keys(groups).filter(n=>/^bar_(full|half)_/.test(n)).map(n=>{const g=groups[n],c=center(n),v=project(c,sections[2].from,sections[2].to);return {s:v.s,min:g.min[2]+9.5,max:g.max[2]+9.5,top:g.max[1],radius:.28};});
const rotor={x:0,y:project(mill,millFrom,distance).s,radius:8.3,speed:.5,phase:.15,world:[mill[0],discTop,mill[2]]};
fs.mkdirSync('src/sim/generated',{recursive:true}); fs.mkdirSync('public/models',{recursive:true});
const data={version:'imported-course-v1',sha256:crypto.createHash('sha256').update(text).digest('hex'),points,sections,pins,bars,rotor,finish:distance,trayOffset};
fs.writeFileSync('src/sim/generated/course.json',JSON.stringify(data));
const model=new OBJLoader().parse(text), output=new THREE.Group(), spinning=new THREE.Group(); spinning.name='mill'; spinning.position.set(...rotor.world);
const mtl=fs.readFileSync(sourcePath.replace(/\.obj$/i,'.mtl'),'utf8');
const materials={}; let mat;
for(const line of mtl.split(/\r?\n/)) {const [key,...v]=line.trim().split(/\s+/); if(key==='newmtl'){mat=new THREE.MeshStandardMaterial({roughness:.38,metalness:.2});mat.name=v[0];materials[v[0]]=mat;} if(key==='Kd')mat.color.setRGB(...v.map(Number)); if(key==='d'){mat.opacity=Number(v[0]);mat.transparent=mat.opacity<1;mat.depthWrite=!mat.transparent;mat.side=THREE.DoubleSide;} }
const batches={}; let removed=0;
for(const mesh of model.children) {
 if(mesh.name.startsWith('marble_')) {removed++;continue;}
 if(mesh.name==='tray_wall_x1')continue; // Ouvrir l'entrée du bac, fermé dans le modèle statique.
 let geo=mesh.geometry.clone();
 if(mesh.name.startsWith('disc_')) {const p=geo.getAttribute('position');for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)-(p.getX(i)-mill[0])*.035);geo.computeVertexNormals();}
 if(mesh.name.startsWith('tray_'))geo.translate(0,trayOffset,0);
 const key=Array.isArray(mesh.material)?mesh.material[0].name:mesh.material.name;
 if(/^mill_(vane|spar|bumper)_/.test(mesh.name)){geo.translate(-rotor.world[0],-rotor.world[1],-rotor.world[2]);const item=new THREE.Mesh(mergeVertices(geo),materials[key]);item.name=mesh.name;spinning.add(item);continue;}
 batches[key]??=[]; batches[key].push(geo);
}
for(const [key,list] of Object.entries(batches)){const mesh=new THREE.Mesh(mergeVertices(mergeGeometries(list)),materials[key]);mesh.name=key;output.add(mesh);}
output.add(spinning);
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});} readAsDataURL(blob){blob.arrayBuffer().then(r=>{this.result=`data:${blob.type};base64,${Buffer.from(r).toString('base64')}`;this.onloadend?.();});}};
const glb=await new GLTFExporter().parseAsync(output,{binary:true}); fs.writeFileSync('public/models/course.glb',Buffer.from(glb));
fs.copyFileSync(sourcePath.replace(/\.obj$/i,'.mtl'),'public/models/parcours-spermatozoides.mtl');
console.log(JSON.stringify({bytes:glb.byteLength,removedStaticSwimmerParts:removed,sections,finish:distance,pins:pins.length,bars:bars.length,trayOffset},null,2));
