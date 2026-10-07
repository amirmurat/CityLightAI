# Model, media and validation provenance

## Model

YOLOX-S ONNX from the official Megvii YOLOX release:
https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx

SHA-256: `c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063`.
License: Apache-2.0 (https://github.com/Megvii-BaseDetection/YOLOX/blob/main/LICENSE).

OpenCV Zoo distributes the same model bytes. Runtime uses OpenCV DNN, BGR byte-scale input, 640-square letterboxing and anchor-free decoding. Actual reference-clip detection was checked visually. An earlier Shibuya clip and a high overhead daylight clip were rejected due camera movement/viewpoint and poor detector results; those files are not release inputs.

This is an existing COCO-trained detector. CityLightAI did not train the pretrained weights and does not claim a new detector architecture.

## Video

**Traffic Of Motor Vehicles In An Intersecting Roads**, by **Tom Fisk**, Pexels video 3052883:
https://www.pexels.com/video/traffic-of-motor-vehicles-in-an-intersecting-roads-3052883/

Pinned original: https://videos.pexels.com/video-files/3052883/3052883-uhd_3840_2160_30fps.mp4

SHA-256: `696e2ef56c16038ff4c94c84a046bf3fff2605d0bf049cbef7f1b5e1a81ad55e`.
3840x2160; 276 frames; nominal 29.97 fps; approximately 9.2 seconds.
License: https://www.pexels.com/license/ . Credit does not imply endorsement. The footage is reference footage; its location is not established as Almaty.

A observes the upper-left incoming lanes; B observes the upper-right incoming lanes. Other approaches, central crossing/turn traffic and pedestrians are not included in the queue inputs. Boxes elsewhere in the frame show additional detections but do not affect these approach estimates. The reference contains motorcycles and the detector includes them as vehicles.

## Observed demo results and limits

The current run contains 19 sampled observations at roughly 0.5-second video intervals. B estimates around ten stopped vehicles once tracks have sufficient history, while A is flowing. Recommendations transition from A-green through yellow/all-red to B-green. Actual sample output and measured processing latency are stored in each run; performance varies with concurrent CPU load.

Visual sanity checks are not a labeled accuracy benchmark. Occlusion, duplicate boxes, track fragmentation, motorcycle grouping, drone movement and truncated queues can affect estimates. No citywide effectiveness metric or statistically validated perception accuracy is claimed.

Survey charts in the historical pitch show 30 responses for closed questions. They support a small-sample problem hypothesis and do not validate camera inference, signal control, municipal purchasing or public-ledger demand. Raw survey responses are not distributed in this public codebase.
