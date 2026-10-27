import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Controller,Tracker,inside,iou} from '../src/traffic';
import {readFileSync} from 'node:fs';
const state=(a=0,b=0)=>({A:{queued:a,moving:0},B:{queued:b,moving:0}});
test('browser controller agrees with saved Python run phases and timing',()=>{
 const run=JSON.parse(readFileSync('data/demo/latest.json','utf8'));const controller=new Controller();
 for(const frame of run.frames){const actual=controller.step(frame.time_ms,frame.approaches);for(const key of ['phase','remaining_ms','lamps','fallback','transition'])assert.deepEqual(actual[key as keyof typeof actual],frame.decision[key]);}
});
test('browser controller preserves clearance, mutual exclusion and max service wait',()=>{
 const controller=new Controller();const transitions:{time:number;phase:string}[]=[];const service={A:0,B:0};let previous='';
 for(let t=0;t<=180000;t+=500){const decision=controller.step(t,state(100,1));assert(Object.values(decision.lamps).filter(x=>x==='green').length<=1);for(const k of ['A','B'] as const){if(decision.lamps[k]==='green')service[k]=t;assert(t-service[k]<=8000);}if(previous!==decision.phase){transitions.push({time:t,phase:decision.phase});previous=decision.phase;}}
 for(let i=0;i<transitions.length-1;i++){const a=transitions[i],b=transitions[i+1];if(a.phase.endsWith('YELLOW')){assert(b.phase.endsWith('ALL_RED'));assert(b.time-a.time>=1000);}if(a.phase.endsWith('ALL_RED')){assert(b.phase.endsWith('GREEN'));assert(b.time-a.time>=1000);}}
 assert(new Controller().step(2500,state(100,0),0).fallback);assert.throws(()=>controller.step(0,state()));
});
test('browser tracker needs stopped history and expires missing tracks',()=>{
 const tracker=new Tracker(),zones={A:[[0,0],[1,0],[1,1],[0,1]],B:[[2,2],[3,2],[3,3]]};const detection={box:[10,10,30,30],class:'car',score_milli:900};let result;
 for(const t of [0,500,1000,1500])result=tracker.update([detection],t,zones,100,100);
 assert.equal(result!.approaches.A.queued,1);assert.equal(result!.detections[0].track_id,1);assert.equal(tracker.update([],3500,zones,100,100).approaches.A.queued,0);
 assert.equal(iou([0,0,10,10],[0,0,10,10]),1);assert(inside([.5,.5],zones.A));assert(!inside([1.5,.5],zones.A));
});
