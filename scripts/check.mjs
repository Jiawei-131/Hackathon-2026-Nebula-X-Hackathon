import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const files=['server.mjs'];
function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())visit(path);else if(/\.(js|mjs)$/.test(path))files.push(path);}}
for(const dir of ['dist','lib','scripts','tests'])visit(dir);
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log(`Syntax checked ${files.length} JavaScript files.`);
