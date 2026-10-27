import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const assets=[['yolox_s.onnx','https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx','c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063'],['intersection.mp4','https://videos.pexels.com/video-files/3052883/3052883-uhd_3840_2160_30fps.mp4','696e2ef56c16038ff4c94c84a046bf3fff2605d0bf049cbef7f1b5e1a81ad55e']];
await mkdir('public/api/evidence',{recursive:true});await mkdir('public/ort',{recursive:true});
for(const [name,url,expected]of assets){let bytes;try{bytes=await readFile('data/'+name);}catch{const response=await fetch(url);if(!response.ok)throw Error(`Asset download failed: ${name}`);bytes=Buffer.from(await response.arrayBuffer());}if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Asset hash mismatch: '+name);await writeFile('public/'+name,bytes);}
for(const name of ['ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.mjs'])await copyFile('node_modules/onnxruntime-web/dist/'+name,'public/ort/'+name);
for(const [from,to]of [['demo/latest','run'],['demo/chain','chain'],['calibration','calibration'],['benchmark','benchmark']])await copyFile(`data/${from}.json`,`public/api/${to}.json`);
const run=JSON.parse(await readFile('data/demo/latest.json','utf8'));for(const item of run.evidence)await writeFile(`public/api/evidence/${item.bundle.sequence}.json`,JSON.stringify(item));
await writeFile('public/.nojekyll','');console.log('Browser assets prepared with verified model and video.');
