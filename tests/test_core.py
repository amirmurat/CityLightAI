import copy
import pytest
from backend.controller import Controller, Policy
from backend.evidence import canonical, digest
from backend.vision import Tracker


def state(a=0,b=0):
    return {"A":{"queued":a,"moving":0},"B":{"queued":b,"moving":0}}


def test_demand_changes_bounded_green_target():
    heavy=Controller().step(0,state(10,1),0)
    light=Controller().step(0,state(1,10),0)
    assert Policy().min_green_ms <= light['remaining_ms'] < heavy['remaining_ms'] <= Policy().max_green_ms


def test_clearance_and_service_wait_under_extreme_imbalance():
    c=Controller(); transitions=[]; last=None; service={"A":0,"B":0}; max_wait=0
    for t in range(0,180001,500):
        r=c.step(t,state(100,1),t)
        assert sum(v=='green' for v in r['lamps'].values()) <= 1
        for k in service:
            if r['lamps'][k]=='green':service[k]=t
            max_wait=max(max_wait,t-service[k])
        if r['phase']!=last:transitions.append((t,r['phase']));last=r['phase']
    assert max_wait<=c.p.max_red_ms
    for (t,phase),(next_t,next_phase) in zip(transitions,transitions[1:]):
        if phase.endswith('YELLOW'): assert next_phase.endswith('ALL_RED') and next_t-t>=c.p.yellow_ms
        if phase.endswith('ALL_RED'): assert next_phase.endswith('GREEN') and next_t-t>=c.p.all_red_ms


def test_invalid_observations_use_fixed_time_and_monotonic_clock():
    c=Controller();r=c.step(2500,state(100,0),0)
    assert r['fallback'] and r['remaining_ms']==500
    with pytest.raises(ValueError):c.step(2000,state(),2000)


def test_canonical_and_tamper():
    a={"z":1,"a":{"queued":2,"label":"traffic"}}
    assert canonical(a)==b'{"a":{"label":"traffic","queued":2},"z":1}'
    assert digest(a)==digest({"a":a['a'],"z":1})
    changed=copy.deepcopy(a);changed['a']['queued']=3
    assert digest(changed)!=digest(a)
    with pytest.raises(ValueError):canonical({"x":1.5})


def test_stopped_vehicle_requires_time_and_does_not_double_count():
    tracker=Tracker();zones={"A":[[0,0],[1,0],[1,1],[0,1]],"B":[[2,2],[3,2],[3,3]]}
    detection={"box":[10,10,30,30],"class":"car","score_milli":900}
    for t in (0,500,1000,1500):
        detections,counts=tracker.update([detection],t,zones,100,100)
    assert counts['A']=={'queued':1,'moving':0} and detections[0]['track_id']==1
    detections,counts=tracker.update([],3500,zones,100,100)
    assert counts['A']['queued']==0
