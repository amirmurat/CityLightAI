"""YOLOX ONNX inference, simple IoU tracking, and visible stopped-vehicle estimates."""
import time
import cv2
import numpy as np

VEHICLES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}


def iou(a, b):
    lo = np.maximum(a[:2], b[:2]); hi = np.minimum(a[2:], b[2:])
    inter = float(np.prod(np.maximum(0, hi - lo)))
    aa = float(np.prod(np.maximum(0, a[2:] - a[:2])))
    bb = float(np.prod(np.maximum(0, b[2:] - b[:2])))
    return inter / max(aa + bb - inter, 1e-9)


class Detector:
    def __init__(self, model):
        cv2.setNumThreads(2)
        self.net = cv2.dnn.readNetFromONNX(str(model))
        self.size = 640

    def detect(self, frame, threshold=.35):
        begin = time.perf_counter()
        h, w = frame.shape[:2]; ratio = min(self.size / h, self.size / w)
        padded = np.full((self.size, self.size, 3), 114, dtype=np.uint8)
        padded[:int(h * ratio), :int(w * ratio)] = cv2.resize(frame, (int(w * ratio), int(h * ratio)))
        # Official YOLOX ONNX demo uses BGR 0..255, not normalized RGB.
        tensor = padded.transpose(2, 0, 1)[None].astype(np.float32)
        self.net.setInput(tensor)
        output = self.net.forward()[0].copy()
        # Official 0.1.1rc0 export leaves anchor-free coordinates undecoded.
        grids, strides = [], []
        for stride in (8, 16, 32):
            y, x = np.meshgrid(np.arange(self.size // stride), np.arange(self.size // stride), indexing="ij")
            grids.append(np.stack((x, y), axis=-1).reshape(-1, 2))
            strides.append(np.full((x.size, 1), stride))
        grid, stride = np.concatenate(grids), np.concatenate(strides)
        output[:, :2] = (output[:, :2] + grid) * stride
        output[:, 2:4] = np.exp(output[:, 2:4]) * stride
        scores = output[:, 4:5] * output[:, 5:]
        candidates = []
        for cls in VEHICLES:
            for row in np.where(scores[:, cls] >= threshold)[0]:
                cx, cy, bw, bh = output[row, :4] / ratio
                box = np.array([max(0, cx-bw/2), max(0, cy-bh/2), min(w, cx+bw/2), min(h, cy+bh/2)], dtype=np.float32)
                if box[2] > box[0] and box[3] > box[1]:
                    candidates.append((float(scores[row, cls]), cls, box))
        candidates.sort(key=lambda c: c[0], reverse=True)
        kept = []
        for score, cls, box in candidates:
            if not any(iou(box, previous[2]) > .45 for previous in kept):
                kept.append((score, cls, box))
        return [{"box": [int(x) for x in box], "class": VEHICLES[cls], "score_milli": int(score * 1000)} for score, cls, box in kept], int((time.perf_counter()-begin)*1000)

    def detect_regions(self, frame, zones):
        """Enlarge observed road regions before inference; merge overlaps by IoU."""
        start = time.perf_counter()
        height, width = frame.shape[:2]
        detected, _ = self.detect(frame)
        for polygon in zones.values():
            xs, ys = zip(*polygon)
            x0 = max(0, int(min(xs)*width)-20); y0 = max(0, int(min(ys)*height)-20)
            x1 = min(width, int(max(xs)*width)+20); y1 = min(height, int(max(ys)*height)+20)
            extra, _ = self.detect(frame[y0:y1, x0:x1])
            for d in extra:
                d['box'] = [d['box'][0]+x0,d['box'][1]+y0,d['box'][2]+x0,d['box'][3]+y0]
                detected.append(d)
        merged = []
        for d in sorted(detected,key=lambda d:-d['score_milli']):
            if not any(iou(np.array(d['box']), np.array(old['box']))>.4 for old in merged):
                merged.append(d)
        return merged, int((time.perf_counter()-start)*1000)


class Tracker:
    def __init__(self):
        self.tracks = {}; self.next_id = 1

    def update(self, detections, now_ms, zones, width, height):
        self.tracks = {k: v for k, v in self.tracks.items() if now_ms-v["seen"] <= 1500}
        unmatched = set(self.tracks)
        result = []
        for detection in sorted(detections, key=lambda d: -d["score_milli"]):
            box = np.array(detection["box"], dtype=float)
            choices = [(iou(box, self.tracks[k]["box"]), k) for k in unmatched]
            score, key = max(choices, default=(0, -1))
            center = [(box[0]+box[2])/2, (box[1]+box[3])/2]
            if score >= .2:
                unmatched.remove(key); track = self.tracks[key]
                track["history"].append((now_ms, center))
            else:
                key = self.next_id; self.next_id += 1
                track = {"history": [(now_ms, center)]}
            track.update(box=box, seen=now_ms)
            track["history"] = [v for v in track["history"] if now_ms-v[0] <= 2500]
            self.tracks[key] = track
            history = track["history"]
            span = now_ms-history[0][0]
            displacement = np.linalg.norm(np.array(center)-np.array(history[0][1]))
            stopped = span >= 1500 and displacement <= max(4, (box[2]-box[0])*.2)
            # Bottom-center approximates vehicle ground contact for zone assignment.
            point = ((box[0]+box[2])/2/width, box[3]/height)
            approach = next((name for name, poly in zones.items() if cv2.pointPolygonTest(np.array(poly, np.float32), point, False) >= 0), None)
            result.append({**detection, "track_id": key, "stopped": bool(stopped), "approach": approach, "track_age_ms": span})
        state = {k: {"queued": sum(d["approach"]==k and d["stopped"] for d in result), "moving": sum(d["approach"]==k and not d["stopped"] for d in result)} for k in zones}
        return result, state
