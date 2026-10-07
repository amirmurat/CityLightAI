# CityLightAI

**Camera-based adaptive traffic recommendations with verifiable decision records on Solana Devnet.**

CityLightAI observes two visible approaches in a licensed intersection video, detects/tracks vehicles, estimates stopped queues, recommends bounded signal phases, and commits decision evidence to an authorization-enforcing Solana program. The dashboard explains the recommendation and links to actual receipt accounts.

This MVP processes prerecorded video and replays computed detections. It does not control physical traffic infrastructure. The signal timings are accelerated demonstration values. No citywide reduction in congestion, waiting time, fuel use or emissions is claimed.

## What works

- YOLOX-S inference on the source video using OpenCV DNN on CPU; enlarged road crops improve small-vehicle visibility.
- Timestamped IoU tracks, visible stopped-vehicle estimates, manually calibrated approach regions.
- A deterministic controller with bounded green, yellow/all-red transitions, maximum service wait, demand smoothing and stale-input fallback.
- React operator dashboard with synchronized video/detections, queues, recommendations and explanations.
- Rust/Anchor run registry and append-only receipt instructions. Program checks publisher authorization, sequence and previous commitment.
- Independent TypeScript verification from Devnet RPC, including evidence hash, account owner/discriminator, expected operator, approved policy and receipt chain.
- Local inference-to-publication job; RPC failure leaves recommendations available and publication explicitly pending. Publication can be retried without creating duplicate receipts.

## Run locally

For teammates recording the demonstration, the shared GitHub Pages version is a read-only replay of the real processed run and actual Devnet records. It needs no installation or wallet. It does not run new inference or publish transactions. See [team recording instructions](docs/TEAM-DEMO.md).

Requires Python 3.12, Node.js 22+ and pnpm. Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
pnpm install --frozen-lockfile
.\scripts\download-assets.ps1
.\scripts\restore-demo.ps1
pnpm build
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000 . For frontend development, run `pnpm dev` in a second terminal and open http://127.0.0.1:5173 . The Vite server proxies `/api` to the backend.

The local checkout includes the downloaded assets. They are excluded from Git; the downloader verifies SHA-256 against the pinned source files. Model and video details are in [data provenance](docs/DATA.md).

### Generate observations

```powershell
.\.venv\Scripts\python.exe -m backend.process
```

Or click **Run detection & publish**. CPU processing is substantially slower than video playback on the current machine. The dashboard labels output as computed replay; a 9.2-second clip is not a real-time camera deployment. Do not interpret missing detections as certainty that a road is empty.

### Solana

Program: `AbgBg2HV8yVGUmtuZKUpifxitbhWwQ1qgrH4m158LSUx` on Devnet. [Explorer](https://explorer.solana.com/address/AbgBg2HV8yVGUmtuZKUpifxitbhWwQ1qgrH4m158LSUx?cluster=devnet).

```powershell
pnpm chain wallet
pnpm chain balance
pnpm chain publish
pnpm chain verify
pnpm chain negative
```

The configured demo operator public key is in `data/program.json`. Publishing requires its development-only keypair in `.secrets/publisher.json` (or `CITYLIGHT_KEYPAIR`). The current local keypair is excluded from Git. A fresh clone must use its own operator key and explicitly update the trust configuration, or obtain the demo key through a private team handoff. Never publish private keys.

For another Devnet RPC, set `SOLANA_RPC_URL`. Mutation commands check the Devnet genesis hash and reject other networks. Only test SOL is needed; do not send mainnet assets. Account storage and deployment consume test SOL, so the operator needs faucet funds. For deployment with a local Linux/WSL toolchain, use Anchor 0.31.1 and `anchor build`/`anchor deploy`; the initial implementation was built/deployed through Solana Playground. After building in Playground, ensure the generated interface reflects `register_run` and `record_decision` before deployment. See [architecture](docs/ARCHITECTURE.md).

## Validate

```powershell
.\.venv\Scripts\python.exe -m pytest -q
pnpm test:chain
pnpm build
pnpm chain verify
pnpm chain negative
```

Controller tests exercise severe imbalance over time, clearance durations, conflicting-green prevention, stale data and monotonic timestamps. Serialization tests check Python/TypeScript compatibility and tamper detection. RPC verification reads actual program-owned accounts. Negative on-chain tests verify unauthorized publishers, wrong sequence and broken previous commitments using transaction simulation; they do not imply a real exploit was broadcast.

## Demo script (under three minutes)

1. Play the reference clip. Show actual vehicle boxes and the two approach regions.
2. Seek to about 2 seconds: the stopped queue at B becomes visible to the estimator.
3. Seek to about 4.5 seconds: explain the transition through yellow/all-red to a B-green recommendation and its bounded duration.
4. Open the corresponding finalized receipt in Explorer and the downloadable evidence bundle.
5. Run `pnpm chain verify` to read the chain independently; demonstrate rejection of an altered evidence bundle and unauthorized publisher.
6. Explain that video cannot respond to a recommended signal. Traffic-effectiveness comparison requires a separate closed-loop simulation or supervised pilot.

The model's class scores are detection scores, not probabilities that a traffic-control decision is correct. Camera truth, coverage, actual signal application, and municipal demand for a public ledger remain separate validation questions.

## Scope and next step

Two visible incoming regions, one video, one virtual two-phase controller, one Devnet audit trail. Pedestrian phases, turn movements, unseen approaches, bus priority, citywide coordination and proprietary GPS APIs are outside this MVP.

Next: annotate additional clips, improve tracking/camera-motion handling, benchmark perception, compare against fixed-time/actuated baselines in SUMO with identical demand and seeds, and interview municipal operators. Then shadow mode, signal-engineer-approved plans and supervised hardware integration. Survey responses describe reported pain in a small sample; they are not measured traffic improvements or purchase commitments.

## License

Project code: MIT. YOLOX model: Apache-2.0. Reference footage: Pexels License, credited separately. AI-assisted development is disclosed in [implementation notes](docs/IMPLEMENTATION.md).
