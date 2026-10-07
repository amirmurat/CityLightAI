import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await mkdir('dist/api/evidence',{recursive:true});
const run=JSON.parse(await readFile('data/demo/latest.json','utf8'));
const chain=JSON.parse(await readFile('data/demo/chain.json','utf8'));
if(run.metadata.run_id!==chain.run_id)throw Error('Proof snapshot mismatch');
await copyFile('data/demo/latest.json','dist/api/run.json');
await copyFile('data/demo/chain.json','dist/api/chain.json');
await copyFile('data/calibration.json','dist/api/calibration.json');
for(const e of run.evidence)await writeFile(`dist/api/evidence/${e.bundle.sequence}.json`,JSON.stringify(e));
let video;
try{video=await readFile('data/intersection.mp4');}catch{const response=await fetch('https://videos.pexels.com/video-files/3052883/3052883-uhd_3840_2160_30fps.mp4');if(!response.ok)throw Error('Video download failed');video=Buffer.from(await response.arrayBuffer());}
if(createHash('sha256').update(video).digest('hex')!==run.metadata.video_sha256)throw Error('Video hash mismatch');
await writeFile('dist/intersection.mp4',video);
console.log('Portable read-only demo prepared. No keys or model weights included.');
