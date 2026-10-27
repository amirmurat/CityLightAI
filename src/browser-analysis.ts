import {Controller,Tracker,policy,type Zones,type Run,type Frame,type Evidence} from './traffic';
import {evidenceHash} from './evidence';
import trafficSource from './traffic.ts?raw';
import detectorSource from './detector.worker.ts?raw';
export const MODEL_HASH='c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063';
export const bytesHash=async(bytes:BufferSource)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const textHash=(text:string)=>bytesHash(new TextEncoder().encode(text));
export type Progress={status:string;processed_ms?:number;duration_ms?:number;frames?:number;message?:string};
function waitEvent(target:EventTarget,name:string,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>finish(Error('Video decoding timed out')),30000);const done=()=>finish();const fail=()=>finish(Error('Video decoding failed'));const abort=()=>finish(new DOMException('Analysis cancelled','AbortError'));function finish(error?:Error){clearTimeout(timeout);target.removeEventListener(name,done);target.removeEventListener('error',fail);signal.removeEventListener('abort',abort);error?reject(error):resolve();}target.addEventListener(name,done,{once:true});target.addEventListener('error',fail,{once:true});signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});}
export async function analyzeVideo(src:string,zones:Zones,intersection:string,progress:(value:Progress)=>void,signal:AbortSignal):Promise<Run>{
 if(!globalThis.Worker||!globalThis.OffscreenCanvas||!globalThis.crypto?.subtle)throw Error('Browser analysis needs a recent browser with WebAssembly, OffscreenCanvas and HTTPS. Try Chrome or Edge.');
 for(const key of ['A','B'])if(!zones[key]||zones[key].length<3)throw Error('Draw both approach regions before analysis');
 const base=new URL(import.meta.env.BASE_URL,location.href).href;const worker=new Worker(new URL('./detector.worker.ts',import.meta.url),{type:'module'});const video=document.createElement('video');video.muted=true;video.preload='auto';video.playsInline=true;
 let pending:((value:any)=>void)|undefined;let failed:((error:Error)=>void)|undefined;
 const abort=()=>{worker.terminate();failed?.(new DOMException('Analysis cancelled','AbortError'));};signal.addEventListener('abort',abort,{once:true});
 worker.onmessage=e=>{if(e.data.type==='error')failed?.(Error(e.data.error));else pending?.(e.data);pending=undefined;failed=undefined;};worker.onerror=e=>failed?.(Error(e.message||'Inference worker failed'));
 const request=(data:unknown,transfer:Transferable[]=[])=>new Promise<any>((resolve,reject)=>{if(signal.aborted)return reject(new DOMException('Analysis cancelled','AbortError'));pending=resolve;failed=reject;worker.postMessage(data,transfer);});
 const started=performance.now();
 try{
  progress({status:'loading',message:'Downloading verified model (36 MB) and preparing WebAssemblyвЂ¦'});
  const loaded=waitEvent(video,'loadeddata',signal);video.src=src;video.load();await loaded;
  if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>30)throw Error('Choose a decodable video up to 30 seconds.');
  const source=await fetch(src,{signal});if(!source.ok)throw Error('Video download failed');const videoHash=await bytesHash(await source.arrayBuffer());
  await request({type:'init',base,hash:MODEL_HASH});
  const duration=Math.round(video.duration*1000);const zones_millionths=Object.fromEntries(Object.entries(zones).map(([key,points])=>[key,points.map(p=>p.map(value=>Math.round(value*1000000)))]));const metadata={schema:2,run_id:Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),intersection,source_mode:'browser_video',video_sha256:videoHash,model_sha256:MODEL_HASH,calibration_sha256:await evidenceHash(zones_millionths),controller_sha256:await textHash(trafficSource),perception_sha256:await textHash(detectorSource),policy,width:video.videoWidth,height:video.videoHeight,duration_ms:duration,policy_hash:'',zones_millionths,engine:'onnxruntime-web-1.23.2-wasm',sample_interval_ms:500};
  metadata.policy_hash=await evidenceHash({policy,model_sha256:metadata.model_sha256,calibration_sha256:metadata.calibration_sha256,controller_sha256:metadata.controller_sha256,perception_sha256:metadata.perception_sha256});
  const tracker=new Tracker(),controller=new Controller(),frames:Frame[]=[],evidence:Evidence[]=[];
  for(let ms=0;ms<duration;ms+=500){if(signal.aborted)throw new DOMException('Analysis cancelled','AbortError');if(ms>0){const seeked=waitEvent(video,'seeked',signal);video.currentTime=ms/1000;await seeked;}
   const image=await createImageBitmap(video);const result=await request({type:'frame',image,zones},[image]);const tracked=tracker.update(result.detections,ms,zones,metadata.width,metadata.height);const decision=controller.step(ms,tracked.approaches);
   const frame:Frame={time_ms:ms,...tracked,decision,inference_ms:result.inference_ms};frames.push(frame);
   if(!evidence.length||decision.transition&&decision.phase.endsWith('GREEN')){const bundle={schema:2,sequence:evidence.length,run:metadata,observation:frame};evidence.push({bundle,hash:await evidenceHash(bundle)});}
   progress({status:'running',processed_ms:ms,duration_ms:duration,frames:frames.length,message:`Analyzing frame ${frames.length} on your deviceвЂ¦`});
  }
  return {metadata,frames,evidence,processing_ms:Math.round(performance.now()-started)};
 }finally{signal.removeEventListener('abort',abort);worker.terminate();video.removeAttribute('src');video.load();}
}
