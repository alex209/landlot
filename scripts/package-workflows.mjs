// Package an already sanitized local export. Never reads n8n credentials or a live DB.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=process.argv[2];
if(!source)throw new Error('Usage: node scripts/package-workflows.mjs <sanitized-export-directory>');
const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
const mapping=[
 ['nbisdQoYTU9QS6RC','01-vk-landlots-bot.json'],
 ['llDrivingRoute26','02-driving-route.json'],
 ['llNearestMkad26','03-nearest-mkad-route.json'],
 ['llGeocodeAddress26','04-geocode-address.json'],
 ['llBatchDrivingRoutes26','05-batch-driving-routes.json'],
 ['xsPCVDWixBaCSHED','06-initial-rag-index.json'],
];
fs.mkdirSync(path.join(root,'workflows'),{recursive:true});
fs.mkdirSync(path.join(root,'docs'),{recursive:true});
const bundle=[],catalog=[];
for(const[id,file]of mapping){
 const entry=manifest.workflows.find(x=>x.id===id);if(!entry||entry.category==='test')throw new Error('Missing production workflow '+id);
 const variant=entry.publishedVersion?'published':'current';
 if(entry.category==='runtime'&&!entry.publishedVersion)throw new Error('Runtime workflow is unpublished '+id);
 const original=JSON.parse(fs.readFileSync(path.join(source,variant,id+'.json'),'utf8'))[0];
 const w=structuredClone(original);
 // workflow_history.name is a version label, not the workflow's actual name.
 w.name=entry.name;
 w.pinData={};w.staticData=null;
 if(id==='nbisdQoYTU9QS6RC'){
  const validation=w.nodes.find(n=>n.name==='Validate VK Event');
  if(!validation.parameters.jsCode.includes('__RESTORE_SECRET_0__'))throw new Error('Callback secret was not sanitized');
  validation.parameters.jsCode=validation.parameters.jsCode
   .replace(/const GROUP_ID = '[^']+';/,"const GROUP_ID = 'YOUR_VK_GROUP_ID';")
   .replace(/const CONFIRMATION_CODE = '[^']+';/,"const CONFIRMATION_CODE = 'YOUR_VK_CONFIRMATION_CODE';")
   .replaceAll('__RESTORE_SECRET_0__','YOUR_VK_CALLBACK_SECRET');
  const prompt=w.nodes.find(n=>n.name==='Landlots AI Agent').parameters.options.systemMessage;
  fs.writeFileSync(path.join(root,'docs','agent-system-prompt.txt'),prompt.trimEnd()+'\n');
 }
 const text=JSON.stringify(w,null,2)+'\n';
 fs.writeFileSync(path.join(root,'workflows',file),text);
 bundle.push(w);
 catalog.push({id,name:w.name,file:'workflows/'+file,source:variant,version:w.versionId,activeAtExport:w.active,nodeCount:w.nodes.length,dependencies:entry.dependencies,sha256:crypto.createHash('sha256').update(text).digest('hex')});
}
fs.writeFileSync(path.join(root,'workflows','all-workflows.json'),JSON.stringify(bundle,null,2)+'\n');
fs.writeFileSync(path.join(root,'workflows','manifest.json'),JSON.stringify({exportedAt:manifest.exportedAt,n8nVersion:'2.37.9',workflowCount:catalog.length,testWorkflowsIncluded:false,credentialsIncluded:false,executionDataIncluded:false,deploymentPlaceholders:['YOUR_VK_GROUP_ID','YOUR_VK_CALLBACK_SECRET','YOUR_VK_CONFIRMATION_CODE'],workflows:catalog},null,2)+'\n');
console.log(`Packaged ${bundle.length} workflows; tests excluded.`);
