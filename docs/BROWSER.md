# Browser analysis and free deployment

The GitHub Pages build now runs real YOLOX inference on the visitor's device using ONNX Runtime Web 1.23.2. It does not call Python or require a server/VM. Initial observations are the original reference replay; **Analyze video on this device** creates a new run.

## Use

1. Open the HTTPS site in current desktop Chrome or Edge. Other browsers need WebAssembly SIMD, Web Workers, OffscreenCanvas and native video decoding support. WebGPU is not required: this version uses single-threaded WASM so Pages does not need cross-origin-isolation headers.
2. Analyze the reference, or choose a local video of at most 30 seconds / 100 MB. The selected video is not uploaded.
3. For another video, click **Draw approach A**, then four corners of the incoming lane region in order around its perimeter; repeat for B. Use a stationary camera and two disjoint incoming approaches. Calibration is manual and unvalidated; turn movements and pedestrians remain outside the controller.
4. Start analysis. The pinned 36 MB model is SHA-256 checked before execution. A Web Worker processes full frames plus the two enlarged road crops at 500 ms intervals; progress and cancellation remain available.
5. Play the result, inspect phases and evidence, and export JSON. The latest completed run and optional selected video are stored in IndexedDB on this device. Browser storage can be cleared/evicted; export important results. **Reference demo** clears the saved session and restores the published original.

## Solana

Install Phantom or Solflare as a browser wallet extension and switch it to Devnet. Connect, obtain test SOL from https://faucet.solana.com/ if needed, then click **Publish / resume on Devnet**. The site checks the RPC genesis hash before requesting a signature and supports only Devnet. No private key is read, stored or shipped. Registration and each receipt require a wallet signature. Rejecting a request or an RPC failure leaves the local analysis intact. Retry the same run with the same wallet to resume existing receipts.

The public RPC endpoint may be rate-limited or refuse browser-origin requests. The RPC URL field accepts a browser-enabled Devnet endpoint; it is used for this session and is not intentionally persisted. A failed RPC read is reported as a failure, not a successful verification.

Anyone can register a run under their own authority in the existing program. A new run is **publisher-attested**, not approved by the original demo operator or a municipality. The pinned original authority is `dwimA2yrAdyXuJJb2nFZBshTXvgXBRKchQADXaBYW2v`. The UI discloses this distinction. The audit trail establishes who committed which bytes and in what order; it does not establish correct perception, approved traffic policy or real-world signal application.

**Verify bundle in browser** compares canonical SHA-256 against the saved receipt hash. **Check Devnet now** independently reads program-owned registry/receipt accounts, checks owner/discriminator, publisher, policy, sequence, evidence hashes, previous commitments and registry head. The last successful read has a timestamp. Cached flags from the initial demo are not a live verification.

## Differences from Python

YOLOX preprocessing preserves BGR values in 0..255, CHW layout, top-left 114 padding and official anchor-free decoding. Canvas resizing and video seeking can differ from OpenCV interpolation/frame selection, so detections need not be bit-identical. Browser runs have schema 2, source mode `browser_video`, separate source-code hashes and integer millionth coordinates in evidence. Controller parity against saved Python phases and timings is tested; model quality is not inferred from parity tests.

The current tracker is IoU-based; camera motion, occlusion and unseen traffic can distort queue estimates. This remains a two-phase recommendation demo, never physical traffic control. Timings are accelerated. Performance depends on visitor hardware; do not claim real-time processing or measured citywide benefit.

## Development and deployment

```sh
pnpm install --frozen-lockfile
node scripts/prepare-browser.mjs
pnpm dev
pnpm test:chain
pnpm build
```

Asset preparation verifies the pinned model/video and copies the matching WASM runtime, reference JSON and benchmarks into ignored `public/`. The Pages workflow runs tests, prepares assets, builds with `VITE_BASE_PATH=/CityLightAI/`, and deploys `dist/`. Model/video are downloaded in Actions rather than committed. This educational demonstration fits the existing public GitHub Pages deployment; future commercial SaaS needs hosting appropriate to its terms and resource use.

To retain the older local Python development UI, set `VITE_BROWSER_MODE=false` before `pnpm dev`/build and run the backend separately as described in README. The default frontend mode is browser analysis.
