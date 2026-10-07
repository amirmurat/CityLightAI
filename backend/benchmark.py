"""Reproducible simplified queue model. Not SUMO, camera validation or field results."""
import json
import random
from dataclasses import asdict
from .controller import Controller, Policy
from .process import DATA


def arrivals(seed, scenario, seconds=180):
    rng=random.Random(seed)
    result=[]
    for t in range(seconds):
        rates=(.20,.20) if scenario=='balanced' else ((.38,.04) if t<seconds//2 else (.04,.38)) if scenario=='demand_shift' else (.50,.50)
        result.append({k:int(rng.random()<p) for k,p in zip(('A','B'),rates)})
    return result


def evaluate(schedule, adaptive, fixed_green_ms=3000):
    controller=Controller(Policy(fixed_green_ms=fixed_green_ms)); queues={'A':[],'B':[]}; served=0; wait_total=0; queue_peak=0; history=[]
    for t, incoming in enumerate(schedule):
        for k in queues:queues[k].extend([t]*incoming[k])
        state={k:{'queued':len(q),'moving':0} for k,q in queues.items()}
        decision=controller.step(t*1000,state,t*1000,valid=adaptive)
        assert sum(v=='green' for v in decision['lamps'].values())<=1
        for k,q in queues.items():
            if decision['lamps'][k]=='green' and q:q.pop(0);served+=1
        # Integral waiting includes vehicles that have NOT finished at the horizon.
        waiting=sum(len(q) for q in queues.values());wait_total+=waiting;queue_peak=max(queue_peak,waiting)
        history.append({'second':t,'queue':waiting,'phase':decision['phase']})
    return {'total_wait_vehicle_seconds':wait_total,'served':served,'unfinished':sum(map(len,queues.values())),'peak_queue':queue_peak,'history':history}


def benchmark():
    scenarios=[]
    for scenario in ('balanced','demand_shift','overload'):
        trials=[]
        for seed in range(10):
            schedule=arrivals(seed,scenario)
            fixed=evaluate(schedule,False);fixed_long=evaluate(schedule,False,5000);adaptive=evaluate(schedule,True)
            trials.append({'seed':seed,**{mode:{k:v for k,v in value.items() if k!='history'} for mode,value in [('fixed',fixed),('fixed_long',fixed_long),('adaptive',adaptive)]}})
        mean=lambda mode,key:round(sum(t[mode][key] for t in trials)/len(trials),1)
        scenarios.append({'name':scenario,**{mode:{k:mean(mode,k) for k in trials[0][mode]} for mode in ('fixed','fixed_long','adaptive')},'trials':trials})
    return {'kind':'simplified_queue_simulation','seconds':180,'seeds':list(range(10)),'service_capacity':'One vehicle per green second; no discharge during clearance','policy':asdict(Policy()),'limitations':'Synthetic arrivals and ideal queues, not camera-derived inputs. No turns, pedestrians, spillback or municipal calibration. These results do not establish citywide benefits.','scenarios':scenarios}


if __name__=='__main__':
    result=benchmark();(DATA/'benchmark.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps([{k:v for k,v in s.items() if k!='trials'} for s in result['scenarios']],indent=2))
