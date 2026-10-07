# Implementation decisions and explanation guide

Date: October 7, 2026. Repository began empty. Implementation was AI-assisted under Amir's direction. Team members should describe their actual contribution; no historical development, survey authorship or deployed city infrastructure is attributed to this code.

1. **Camera first.** The old pitch's GPS-provider integration would depend on access/licensing not established by project sources. Video lets the MVP demonstrate observed intersection state directly.
2. **Pretrained detector.** No dataset/training sprint is necessary for an initial demo. YOLOX is openly licensed and CPU inference is reproducible. Viewpoint mattered more than a broad feature list: tested clips with weak detections were rejected.
3. **Explainable controller.** Queue demand and waiting bounds can be inspected and tested. LLM/reinforcement-learning timing would add training, verification and demonstration risk without established value.
4. **Off-chain control, on-chain audit.** RPC latency/failure must not halt a timing recommendation. Solana gives independent access to publisher authorization, approved policy commitments and append-only evidence records.
5. **Small source scope.** Two observed approaches demonstrate the chain end to end. Unseen approaches are excluded rather than invented. Short accelerated phase timers demonstrate transitions; they are not field-engineered timings.
6. **Honest evaluation.** Recorded traffic cannot respond to new timing. Effectiveness requires a closed-loop experiment. Current outputs are observations/recommendations, not measured city improvements.
7. **Reproducibility.** Pinned dependencies and asset hashes, deterministic evidence serialization, explicit run IDs, source commitments, test cases and readable Explorer receipts.

## Explain it in your own words

- What does the model detect, and which errors can it make?
- Why does detecting a vehicle not immediately mean it is queued?
- How do the region polygons affect counts?
- Why are yellow/all-red managed separately from demand allocation?
- Which decision makes B green in the reference clip, and what input supports it?
- What is a PDA and why is each receipt's sequence included in its address?
- Who signs registration and recording? What prevents another publisher from recording into our registry?
- What does an evidence hash prove, and what does it not prove?
- Why can recommendations continue during a Devnet outage?
- What must be tested before this could touch real infrastructure?

## Municipal path

Interview traffic-control operators; inventory available cameras and controllers; annotate representative clips; establish perception error/coverage; run matched SUMO baselines; shadow-test in a consented environment; obtain signal-engineer-approved plans; test actual controller protocols and fallback; perform a supervised single-intersection pilot. Multi-intersection optimization comes later.
