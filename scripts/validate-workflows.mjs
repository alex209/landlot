import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'workflows/manifest.json'),'utf8'));
const bundle=JSON.parse(fs.readFileSync(path.join(root,'workflows/all-workflows.json'),'utf8'));
assert.equal(bundle.length,6);assert.equal(manifest.workflows.length,6);
const ids=new Set(bundle.map(w=>w.id));assert.equal(ids.size,6);
let nodeCount=0,codeCount=0;
for(const w of bundle){
 assert(!/test|fixture/i.test(w.name),'Test workflow in production package');
 const entry=manifest.workflows.find(x=>x.id===w.id);assert(entry);
 const raw=fs.readFileSync(path.join(root,entry.file),'utf8');assert.deepEqual(JSON.parse(raw),w);
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),entry.sha256);
 assert.deepEqual(w.pinData,{});assert.equal(w.staticData,null);
 const names=new Set(w.nodes.map(n=>n.name));assert.equal(names.size,w.nodes.length);
 for(const[from,ports]of Object.entries(w.connections)){
  assert(names.has(from));for(const branches of Object.values(ports))for(const branch of branches)for(const edge of branch)assert(names.has(edge.node),'Missing target '+edge.node);
 }
 for(const n of w.nodes){
  const ref=n.parameters?.workflowId;const id=typeof ref==='string'?ref:ref?.value;if(id&&!id.startsWith('='))assert(ids.has(id),'Missing subworkflow '+id);
  for(const c of Object.values(n.credentials||{}))assert(Object.keys(c).every(k=>['id','name'].includes(k)),'Credential data detected');
  if(n.parameters?.jsCode){new Function(n.parameters.jsCode);codeCount++;}
  for(const p of n.parameters?.headerParameters?.parameters||[])if(/authorization|api.?key/i.test(p.name))assert(!p.value||p.value.startsWith('='),'Inline authorization header');
  for(const match of (n.parameters?.jsCode||'').matchAll(/(?:const|let|var)\s+\w*(?:SECRET|TOKEN|PASSWORD|API_KEY)\w*\s*=\s*(['"])([^'"\r\n]+)\1/g))assert(match[2].startsWith('YOUR_'),'Inline secret assignment');
 }
 assert(!/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|vk1\.[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}/.test(raw),'Possible secret');
 nodeCount+=w.nodes.length;
}
const main=bundle.find(w=>w.id==='nbisdQoYTU9QS6RC');
const code=main.nodes.find(n=>n.name==='Validate VK Event').parameters.jsCode;
for(const s of manifest.deploymentPlaceholders)assert(code.includes(s),'Missing placeholder '+s);
assert(main.nodes.some(n=>n.name==='get_batch_driving_routes'));
assert(main.nodes.some(n=>n.name==='get_landlot_card_sql'));
assert.equal(main.nodes.find(n=>n.name==='VK Conversation Memory').parameters.contextWindowLength,10);
const readme=fs.readFileSync(path.join(root,'ReadME.MD'),'utf8');
for(const w of bundle)for(const n of w.nodes)assert(readme.includes(n.name),'Undocumented node '+n.name);
console.log(`OK: ${bundle.length} workflows, ${nodeCount} nodes, ${codeCount} JavaScript nodes. JSON, hashes, connections, dependencies, documentation and secret checks passed.`);
