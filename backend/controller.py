"""Deterministic recommendation state machine; never actuates physical signals."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Policy:
    min_green_ms: int = 2000
    max_green_ms: int = 5000
    yellow_ms: int = 1000
    all_red_ms: int = 1000
    max_red_ms: int = 8000
    fixed_green_ms: int = 3000
    stale_ms: int = 2000

    def __post_init__(self):
        assert 0 < self.min_green_ms <= self.fixed_green_ms <= self.max_green_ms
        assert self.yellow_ms > 0 and self.all_red_ms > 0
        assert self.max_red_ms >= self.max_green_ms + self.yellow_ms + self.all_red_ms


class Controller:
    def __init__(self, policy=Policy()):
        self.p = policy
        self.phase = "A_GREEN"
        self.since = 0
        self.until = policy.fixed_green_ms
        self.last_ms = -1
        self.red_since = {"A": 0, "B": 0}
        self.last_demand = {"A": 0, "B": 0}

    def step(self, now_ms: int, approaches: dict, observed_ms: int, valid=True):
        if now_ms < self.last_ms:
            raise ValueError("Timestamps must be monotonic; create a new controller for a new run")
        self.last_ms = now_ms
        fresh = valid and 0 <= now_ms - observed_ms <= self.p.stale_ms
        demand = {k: int(approaches[k]["queued"]) * 4 + int(approaches[k]["moving"]) for k in ("A", "B")}
        # Use integers and cap input influence. No numeric 'AI confidence' is invented.
        demand = {k: min(400, max(0, v)) for k, v in demand.items()}
        if fresh:
            demand = {k: (self.last_demand[k] + demand[k]) // 2 if self.last_ms > 0 else demand[k] for k in demand}
            self.last_demand = demand.copy()
        fallback = not fresh
        reason = "Fixed-time fallback: observation unavailable or stale." if fallback else "Minimum green and clearance rules preserved."
        changed = False
        # Transitions happen only at observed ticks; never skip a clearance phase.
        if self.phase.endswith("GREEN"):
            active = self.phase[0]
            other = "B" if active == "A" else "A"
            elapsed = now_ms - self.since
            if fallback:
                self.until = self.since + self.p.fixed_green_ms
            else:
                total = demand[active] + demand[other]
                target = self.p.fixed_green_ms if total == 0 else self.p.min_green_ms + (self.p.max_green_ms - self.p.min_green_ms) * demand[active] // total
                self.until = self.since + target
                reason = f"{active}: {approaches[active]['queued']} queued, {approaches[active]['moving']} moving; {other}: {approaches[other]['queued']} queued, {approaches[other]['moving']} moving. Bounded green target {target / 1000:g}s."
            forced = now_ms - self.red_since[other] >= self.p.max_red_ms - self.p.yellow_ms - self.p.all_red_ms
            if elapsed >= self.p.min_green_ms and (now_ms >= self.until or forced):
                self.phase = active + "_YELLOW"
                self.since = now_ms
                self.until = now_ms + self.p.yellow_ms
                self.red_since[active] = now_ms
                changed = True
                reason += " Switching through yellow and all-red." + (" Maximum service wait reached." if forced else "")
        elif now_ms >= self.until:
            active = self.phase[0]
            if self.phase.endswith("YELLOW"):
                self.phase = active + "_ALL_RED"
                self.until = now_ms + self.p.all_red_ms
            else:
                other = "B" if active == "A" else "A"
                self.phase = other + "_GREEN"
                total = demand[other] + demand[active]
                target = self.p.fixed_green_ms if fallback or total == 0 else self.p.min_green_ms + (self.p.max_green_ms-self.p.min_green_ms)*demand[other]//total
                self.until = now_ms + target
                reason = f"Serve approach {other}: {approaches[other]['queued']} estimated stopped, {approaches[other]['moving']} moving. New bounded green target {target/1000:g}s after completed clearance."
            self.since = now_ms
            changed = True
        lamps = {"A": "red", "B": "red"}
        if self.phase.endswith("GREEN"):
            lamps[self.phase[0]] = "green"
        elif self.phase.endswith("YELLOW"):
            lamps[self.phase[0]] = "yellow"
        assert sum(v == "green" for v in lamps.values()) <= 1
        return {"phase": self.phase, "lamps": lamps, "remaining_ms": max(0, self.until - now_ms), "reason": reason, "fallback": fallback, "transition": changed, "mode": "video_recommendation"}
