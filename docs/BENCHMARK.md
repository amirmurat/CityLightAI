# Simplified closed-loop comparison

Reproduce with `python -m backend.benchmark`. The committed `data/benchmark.json` contains every trial and the mean outputs. Tests verify reproducibility and vehicle conservation.

This is an ideal discrete queue model, not SUMO or calibrated municipal traffic. Every trial runs for 180 seconds with one-second steps. Both controllers receive the exact same seeded Bernoulli arrivals, initial state, saturation service (one vehicle per green second), clearance and maximum-service-wait constraints. Ten seeds are reported for each of three scenarios: balanced, a midpoint demand shift, and overload.

Compare against fixed green targets of 3 seconds and 5 seconds. The latter is nominal: the shared maximum-wait guard can shorten it. Adaptive timing uses the exact application controller, with its accelerated demonstration policy. No camera detector participates in this experiment.

Waiting is the integral of ALL queued vehicles across time, including vehicles still waiting at the horizon. Also report served vehicles, unfinished vehicles and peak queue. There is no censoring to only completed trips and no claim that these few scenarios establish general optimality.

Adaptive improves waiting in this particular model, especially when demand shifts. Under overload it has essentially the same served/unfinished totals as longer fixed timing, and its peak queue is slightly worse. This limitation must remain visible. Longer fixed cycles themselves reduce clearance overhead, so the 3-second comparison alone would overstate the value of adaptation.

Next validation: realistic SUMO networks and calibrated demand, additional seeds/scenarios, matched actuated baselines, confidence intervals, spillback, turns/pedestrians, and video-perception errors in the loop. Do not present the current numbers as field measurements or expected citywide savings.
