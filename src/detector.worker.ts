/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import {iou, type Zones} from './traffic';
const scope=self as unknown as DedicatedWorkerGlobalScope;
let session:ort.InferenceSession;
const classes:Record<number,string>={2:'car',3:'motorcycle',5:'bus',7:'truck'};
const surface=new OffscreenCanvas(640,640);
const ctx=surface.getContext('2d',{willReadFrequently:true})!;
async function detect(image:ImageBitmap,region:number[]){
 const [x,y,width,height]=region,ratio=Math.min(640/width,640/height);
 ctx.fillStyle='rgb(114,114,114)';ctx.fillRect(0,0,640,640);
 ctx.drawImage(image,x,y,width,height,0,0,Math.floor(width*ratio),Math.floor(height*ratio));
 const pixels=ctx.getImageData(0,0,640,640).data,plane=640*640,input=new Float32Array(plane*3);
 for(let i=0;i<plane;i++){input[i]=pixels[i*4+2];input[plane+i]=pixels[i*4+1];input[2*plane+i]=pixels[i*4];}
 const tensor=new ort.Tensor('float32',input,[1,3,640,640]);const outputs=await session.run({[session.inputNames[0]]:tensor});tensor.dispose();
 const output=outputs[session.outputNames[0]],values=output.data as Float32Array;
 if(output.dims.length!==3||output.dims[1]!==8400||output.dims[2]!==85)throw Error('Unsupported YOLOX output shape');
 const found:{box:number[];class:string;score_milli:number}[]=[];let row=0;
 for(const stride of [8,16,32])for(let gy=0;gy<640/stride;gy++)for(let gx=0;gx<640/stride;gx++,row++){
  const offset=row*85,objectness=values[offset+4];
  for(const [classId,label]of Object.entries(classes)){const score=objectness*values[offset+5+Number(classId)];if(score<.35)continue;
   const cx=(values[offset]+gx)*stride/ratio,cy=(values[offset+1]+gy)*stride/ratio,bw=Math.exp(values[offset+2])*stride/ratio,bh=Math.exp(values[offset+3])*stride/ratio;
   const box=[Math.max(0,cx-bw/2)+x,Math.max(0,cy-bh/2)+y,Math.min(width,cx+bw/2)+x,Math.min(height,cy+bh/2)+y];
   if(box[2]>box[0]&&box[3]>box[1])found.push({box:box.map(Math.trunc),class:label,score_milli:Math.trunc(score*1000)});
  }
 }
 for(const value of Object.values(outputs))value.dispose();
 const kept:typeof found=[];for(const d of found.sort((a,b)=>b.score_milli-a.score_milli))if(!kept.some(old=>iou(d.box,old.box)>.45))kept.push(d);return kept;
}
scope.onmessage=async(event:MessageEvent)=>{const message=event.data;try{
 if(message.type==='init'){
  ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=message.base+'ort/';ort.env.wasm.proxy=false;
  const response=await fetch(message.base+'yolox_s.onnx',{cache:'force-cache'});if(!response.ok)throw Error(`Model download failed (${response.status})`);
  const bytes=await response.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==message.hash)throw Error('Model integrity check failed');
  session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});scope.postMessage({type:'ready'});
 }else if(message.type==='frame'){
  const image=message.image as ImageBitmap;try{const begin=performance.now();const w=image.width,h=image.height;const found=await detect(image,[0,0,w,h]);
   for(const points of Object.values(message.zones as Zones)){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const x=Math.max(0,Math.trunc(Math.min(...xs)*w)-20),y=Math.max(0,Math.trunc(Math.min(...ys)*h)-20);const x1=Math.min(w,Math.trunc(Math.max(...xs)*w)+20),y1=Math.min(h,Math.trunc(Math.max(...ys)*h)+20);found.push(...await detect(image,[x,y,x1-x,y1-y]));}
   const merged:typeof found=[];for(const d of found.sort((a,b)=>b.score_milli-a.score_milli))if(!merged.some(old=>iou(d.box,old.box)>.4))merged.push(d);
   scope.postMessage({type:'frame',detections:merged,inference_ms:Math.round(performance.now()-begin)});
  }finally{image.close();}
 }
}catch(error){scope.postMessage({type:'error',error:error instanceof Error?error.message:String(error)});}};
