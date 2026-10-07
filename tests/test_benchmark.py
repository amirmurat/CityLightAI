from backend.benchmark import arrivals,evaluate

def test_benchmark_conserves_vehicles_and_is_reproducible():
    schedule=arrivals(7,'demand_shift')
    assert schedule==arrivals(7,'demand_shift')
    total=sum(sum(s.values()) for s in schedule)
    for mode in (False,True):
        result=evaluate(schedule,mode)
        assert result['served']+result['unfinished']==total
        assert result==evaluate(schedule,mode)
        assert result['total_wait_vehicle_seconds']>=0
