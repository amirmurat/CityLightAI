export type Detection={box:number[];class:string;track_id:number;stopped:boolean;approach:string|null;score_milli:number};
export type Approaches=Record<string,{queued:number;moving:number}>;
export type Zones=Record<string,number[][]>;
export type Decision={phase:string;lamps:Record<string,string>;remaining_ms:number;reason:string;fallback:boolean;transition:boolean;mode:string};
export type Frame={time_ms:number;detections:Detection[];approaches:Approaches;inference_ms:number;decision:Decision};
export type Metadata={run_id:string;width:number;height:number;duration_ms:number;model_sha256:string;policy_hash:string;intersection:string;[key:string]:unknown};
export type Evidence={hash:string;bundle:{schema:number;sequence:number;run:Metadata;observation:Frame}};
export type Run={metadata:Metadata;frames:Frame[];evidence:Evidence[];processing_ms:number};
export type Chain={status:string;run_id?:string;program_id?:string;authority?:string;registry?:string;receipts:{sequence:number;signature:string;address:string;hash:string;status:string}[];verification?:{valid:boolean;tampered_rejected:boolean;verified_at?:string;scope?:string}};
export const policy={min_green_ms:2000,max_green_ms:5000,yellow_ms:1000,all_red_ms:1000,max_red_ms:8000,fixed_green_ms:3000,stale_ms:2000};
export class Controller{
 phase='A_GREEN';since=0;until=3000;last=-1;red:Record<string,number>={A:0,B:0};demand:Record<string,number>={A:0,B:0};
 step(now:number,approaches:Approaches,observed=now,valid=true):Decision{
  if(now<this.last)throw Error('Timestamps must be monotonic');this.last=now;
  const fresh=valid&&now-observed>=0&&now-observed<=policy.stale_ms;
  const demand:Record<string,number>={};for(const k of ['A','B']){demand[k]=Math.min(400,Math.max(0,approaches[k].queued*4+approaches[k].moving));if(fresh)demand[k]=now>0?Math.floor((this.demand[k]+demand[k])/2):demand[k];}if(fresh)this.demand={...demand};
  const target=(k:string)=>!fresh||demand.A+demand.B===0?3000:2000+Math.floor(3000*demand[k]/(demand.A+demand.B));
  let reason=fresh?'Minimum green and clearance rules preserved.':'Fixed-time fallback: observation unavailable or stale.';let transition=false;
  if(this.phase.endsWith('GREEN')){
   const active=this.phase[0],other=active==='A'?'B':'A';this.until=this.since+target(active);
   if(fresh)reason=`${active}: ${approaches[active].queued} queued, ${approaches[active].moving} moving; ${other}: ${approaches[other].queued} queued, ${approaches[other].moving} moving. Bounded green target ${target(active)/1000}s.`;
   const forced=now-this.red[other]>=6000;
   if(now-this.since>=2000&&(now>=this.until||forced)){this.phase=active+'_YELLOW';this.since=now;this.until=now+1000;this.red[active]=now;transition=true;reason+=' Switching through yellow and all-red.'+(forced?' Maximum service wait reached.':'');}
  }else if(now>=this.until){const active=this.phase[0];if(this.phase.endsWith('YELLOW')){this.phase=active+'_ALL_RED';this.until=now+1000;}else{const other=active==='A'?'B':'A';this.phase=other+'_GREEN';this.until=now+target(other);reason=`Serve approach ${other}: ${approaches[other].queued} estimated stopped, ${approaches[other].moving} moving. New bounded green target ${target(other)/1000}s after completed clearance.`;}this.since=now;transition=true;}
  const lamps:Record<string,string>={A:'red',B:'red'};if(this.phase.endsWith('GREEN'))lamps[this.phase[0]]='green';else if(this.phase.endsWith('YELLOW'))lamps[this.phase[0]]='yellow';
  return {phase:this.phase,lamps,remaining_ms:Math.max(0,this.until-now),reason,fallback:!fresh,transition,mode:'video_recommendation'};
 }
}
export const iou=(a:number[],b:number[])=>{const area=(c:number[])=>Math.max(0,c[2]-c[0])*Math.max(0,c[3]-c[1]);const intersection=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));return intersection/Math.max(area(a)+area(b)-intersection,1e-9);};
export function inside(point:number[],polygon:number[][]){let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;}
type Track={box:number[];seen:number;history:{time:number;center:number[]}[]};
export class Tracker{
 tracks=new Map<number,Track>();next=1;
 update(raw:Omit<Detection,'track_id'|'stopped'|'approach'>[],now:number,zones:Zones,width:number,height:number){
  for(const [id,t]of this.tracks)if(now-t.seen>1500)this.tracks.delete(id);const unmatched=new Set(this.tracks.keys());const detections:Detection[]=[];
  for(const d of [...raw].sort((a,b)=>b.score_milli-a.score_milli)){let id=-1,best=0;for(const candidate of unmatched){const score=iou(d.box,this.tracks.get(candidate)!.box);if(score>best){best=score;id=candidate;}}
   const center=[(d.box[0]+d.box[2])/2,(d.box[1]+d.box[3])/2];let track:Track;
   if(best>=.2){unmatched.delete(id);track=this.tracks.get(id)!;}else{id=this.next++;track={box:d.box,seen:now,history:[]};}
   track.history.push({time:now,center});track.history=track.history.filter(p=>now-p.time<=2500);track.box=d.box;track.seen=now;this.tracks.set(id,track);
   const first=track.history[0];const stopped=now-first.time>=1500&&Math.hypot(center[0]-first.center[0],center[1]-first.center[1])<=Math.max(4,(d.box[2]-d.box[0])*.2);
   const point=[center[0]/width,d.box[3]/height];const approach=Object.keys(zones).find(k=>inside(point,zones[k]))??null;detections.push({...d,track_id:id,stopped,approach});
  }
  const approaches:Approaches={};for(const k of Object.keys(zones))approaches[k]={queued:detections.filter(d=>d.approach===k&&d.stopped).length,moving:detections.filter(d=>d.approach===k&&!d.stopped).length};return {detections,approaches};
 }
}
