import fs from 'node:fs';
const source=fs.readFileSync('C:/Users/marti/Downloads/parcours-spermatozoides.obj','utf8');
const groups={}; let current;
for(const line of source.split(/\r?\n/)) {
 if(line.startsWith('o ')) { current={v:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}; groups[line.slice(2)]=current; }
 if(line.startsWith('v ') && current) { const v=line.slice(2).trim().split(/\s+/).map(Number); current.v.push(v); v.forEach((x,i)=>{current.min[i]=Math.min(current.min[i],x); current.max[i]=Math.max(current.max[i],x)}); }
}
for(const [name,g] of Object.entries(groups)) if(!/marble|peg|post|leg|railing|grip|cap/.test(name)) console.log(name,g.v.length,g.min.map(x=>+x.toFixed(2)),g.max.map(x=>+x.toFixed(2)));
const g=groups.trough; console.log('trough rings',g.v.length/16); for(let i=0;i<g.v.length;i+=Math.floor(g.v.length/16/25)*16) console.log(i,g.v[i+7],g.v[i+8]);
fs.writeFileSync('scripts/import-inspection.json',JSON.stringify(groups));
