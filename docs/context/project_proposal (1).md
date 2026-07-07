# Project Proposal: A Collaborative 3D Creation Tool with Peer-Distributed Rendering

## 1. Executive Summary

This project is a browser-based, real-time collaborative 3D design tool — conceptually "Figma for 3D scenes." Multiple users edit a shared 3D scene simultaneously (objects, materials, lights, cameras), seeing each other's changes live. The tool has two rendering tiers:

1. **A fast local rasterizer** for real-time interactive editing (always on, sub-16ms feedback).
2. **A physically-based path tracer** for high-fidelity final output — but instead of running on rented cloud GPUs, render tiles are distributed peer-to-peer across everyone currently connected to the session, using WebRTC data channels. Each connected browser tab contributes CPU compute (via WASM) to the shared render, and results stream back and composite live. If no peers are online, the tool degrades gracefully to local-only rendering at lower sample counts.

The architecture is deliberately **hybrid**, using a central server only where centralization is genuinely simpler, and peer-to-peer only where it's structurally necessary:

- **Scene editing is server-authoritative.** A lightweight server holds the real scene state, assigns each incoming edit a sequence number, and broadcasts ordered operations to all connected clients. Every client applies ops in the same order and stays consistent — no conflict-resolution logic needed, because there's never a conflict to resolve. This also gives the server a natural home for saving/loading projects and handling late joiners (they just ask for current state).
- **Final rendering is peer-to-peer**, because this is the one place centralization would cost real money: getting expensive path-traced final images without renting cloud GPUs requires spreading that compute across the people actually in the session, using WebRTC data channels to hand out render tiles. If no peers are online, rendering falls back to local-only at a lower sample count.

The core engine (rasterizer, path tracer, scene graph) is written in **C++**, compiled to **WebAssembly**, and driven through **WebGPU** in the browser for the rasterizer, with the path tracer running as pure CPU compute in WASM (GPU acceleration via WebGPU compute shaders is a stretch goal). This keeps the "hard" engineering — the part that's genuinely resume- and interview-worthy — entirely in C++, while the web layer is a thin shell around it.

**Total infrastructure cost target: under $50**, because the one always-on server component (scene-state authority + signaling + TURN relay) is a lightweight process that can run on a $5–$10/month VPS or a free tier for the life of the project — it never does any rendering or compute itself.

---

## 2. What Makes This Different

- **Figma-likes** (Figma, Excalidraw, tldraw) exist for 2D vector content. Real-time collaborative **3D** scene editing is a much thinner field (Spline is the closest commercial comparison), and almost none of them are open engineering write-ups you can point to.
- **Path tracers** are a common hobby project ("Ray Tracing in a Weekend" is a rite of passage), but productized **peer-to-peer distributed rendering** — using the people currently in your creative session as a volunteer compute cluster, the way BOINC/Folding@home crowdsource CPU cycles — is not something anyone has built into a design tool. It's a genuinely novel angle, and it directly solves the "I don't want to pay for cloud GPUs" constraint instead of working around it apologetically.
- The combination forces you to demonstrate breadth that's rare in a single project: **graphics engine work, ordered-broadcast collaborative state management, and real-time P2P networking for compute distribution**, all serving one coherent, demoable product — and choosing a hybrid architecture (rather than defaulting to "P2P everywhere" for its own sake) is itself a legitimate design decision worth explaining in an interview.

---

## 3. Language Boundary: What's C++ and What's JS/TS

A recurring question worth answering explicitly rather than leaving implicit: **why use C++/WASM at all if JS can do the same job?** The honest answer is that it's not a blanket win — it's a strong win in specific, sustained-computation places, a smaller win elsewhere, and in one spot (originally planned P2P networking) it turned out not to be worth it on inspection. The breakdown below reflects that, including two changes from earlier drafts: **libdatachannel (a C++ WebRTC library) has been dropped** (browsers already ship a native, highly-optimized WebRTC implementation), and the **tile scheduler has moved to TypeScript** (it needs direct access to WebRTC peer state and isn't compute-intensive enough to justify the WASM boundary crossing).

### C++ (compiled to WebAssembly)
- **Scene graph & transform math** — hierarchy, local-to-world matrix composition, camera math. Uses a custom lightweight math library (vec3/mat4/quat — ~500-800 lines, header-only) written to match WebGPU conventions directly (column-major storage, `[0, 1]` depth range), avoiding the convention friction that comes with OpenGL-era libraries like GLM.
- **Rasterizer** — triangle setup/rendering logic, picking/hit-testing (ray-AABB, ray-triangle), gizmo math. WebGPU is used here for GPU-accelerated shading via WGSL shaders.
- **Path tracer** — BVH construction/traversal, Monte Carlo sampling, BRDF shading, denoising. This runs as **CPU compute in a Dedicated Web Worker via WASM**, not on the GPU. Moving this to a Web Worker is critical to avoid the browser's aggressive background tab throttling (which clamps main-thread timers). The Page Visibility API is used to notify the scheduler if a peer is backgrounded so expectations are adjusted. This is the strongest, clearest case for C++ on pure performance grounds: sustained, tight-loop numeric work over large flat arrays, where JS's JIT warm-up and GC pauses would show up as real stutter. CPU path tracing also avoids the structural complexity of GPU wavefront architectures and WGSL's limitations (no recursion, limited control flow), and the distributed rendering design compensates for the speed difference by throwing more peers at the problem. GPU acceleration via WebGPU compute shaders is a stretch goal (see Phase 7).
- **Applying server-confirmed ops** to the local scene graph (Phase 3).
- **Render-tile pixel encode/decode** — the only piece of the P2P rendering path that stays in C++; it's pure data transformation, no networking code involved.
- **Tile compositing math** — per-tile sample-count tracking and weighted compositing of incoming tiles into the shared framebuffer. This is data-parallel work over typed arrays that benefits from WASM's predictable memory layout.

### JavaScript / TypeScript
- **UI shell** — toolbars, outliner, property inspector, all chrome. Built with **Preact** (~3KB) for lightweight reactivity — enough to keep the property panel in sync with WASM scene-graph changes without manual DOM diffing, without framework bloat.
- **WASM glue** — instantiating the WASM module, passing typed arrays in and out of its linear memory.
- **WebGPU context/device/canvas setup** — WASM cannot open a GPU context or touch a `<canvas>` directly; JS always initiates this and then hands control to the C++ engine via bindings.
- **WebSocket client** — sending local edits to, and receiving ordered ops from, the collaboration server.
- **WebRTC (native browser API)** — creating `RTCPeerConnection`/`RTCDataChannel` directly via the browser's built-in implementation (no libdatachannel), sending/receiving raw tile byte buffers, which are then handed to the C++/WASM engine only for decoding.
- **Tile scheduler** — deciding which peer gets which tile, tracking per-peer throughput, and reassigning on disconnect. This lives in TypeScript because it needs direct access to `RTCDataChannel` state and `RTCPeerConnection` events; serializing all that peer state across the WASM boundary would add complexity for a task that's coordination logic, not compute.
- **The collaboration server itself** — a Bun process (see Section 5).

### Why the Boundary Sits Where It Does
WASM cannot call browser Web APIs on its own — every entry point that touches the outside world (WebSockets, WebRTC, WebGPU context, the canvas) has to be opened from JS first, then handed to C++ as raw buffers or handles. That means a thin JS layer is unavoidable in *any* version of this architecture, not a compromise specific to this project. Given that, the right question isn't "how do we minimize JS," it's "where does C++ actually pay for itself." That's clearly true for the path tracer, moderately true for the rasterizer/scene graph (typed arrays get JS most of the way there, but C++'s memory layout control still helps), and — on reflection — not true for reimplementing WebRTC transport or tile scheduling, which is why those pieces live in native JS/TS.

---

## 4. Tech Stack

A flat reference of every library/technology in the project and where it lives.

| Technology | Layer | Where It's Used |
|---|---|---|
| **C++20** | Core engine | Scene graph, rasterizer, path tracer (CPU), tile pixel encode/decode, tile compositing |
| **Custom math library** (header-only) | Core engine (C++) | vec3/mat4/quat math throughout the engine, written to WebGPU conventions (`[0, 1]` depth range, column-major) |
| **CMake** | Build tooling | Builds the native C++ engine (for dev/debug/profiling) and drives the Emscripten build (for deployment) |
| **Emscripten** | Build tooling | Compiles the C++ engine to WebAssembly; generates JS-callable bindings via Embind |
| **WebAssembly (WASM)** | Compiled output | The format the C++ engine ships as, runnable in the browser |
| **WebGPU (WGSL)** | GPU API | Fragment shaders for the rasterizer; compute shaders reserved as a stretch goal for GPU-accelerated path tracing |
| **Dawn** | Native tooling | Native WebGPU implementation used to build/test/profile the rasterizer outside the browser before porting to WASM |
| **Vite** | Build tooling | Frontend bundler: TypeScript compilation, HMR for dev, WASM asset serving |
| **Preact** | Frontend | Lightweight (~3KB) reactive UI framework for the editor shell (outliner, property inspector, toolbar) |
| **TypeScript** | Frontend | UI shell, WASM glue code, WebSocket/WebRTC client logic, tile scheduler |
| **WebSockets** | Networking | Client ↔ server transport carrying ordered scene-edit broadcasts |
| **Bun** | Server | Runs the collaboration server: holds scene state, assigns op sequence numbers, brokers WebRTC signaling. Zero-config WebSocket support, native TypeScript, no `node_modules` bloat |
| **WebRTC (native browser API)** | Networking | P2P data channels for render-tile transfer between browsers, driven directly from JS/TS (no third-party library) |
| **coturn** (self-hosted) | Networking | TURN relay for NAT traversal, co-hosted on the same VPS as the collaboration server. Backed by multiple STUN servers (`stun.l.google.com:19302`, `stun.cloudflare.com:3478`) and a third-party TURN fallback (Metered.ca free tier) for redundancy |
| **Cloudflare Pages** | Hosting | Serves the static frontend (compiled WASM + JS/TS shell) at no cost, with `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers configured via `_headers` file (required for `SharedArrayBuffer` and WASM threading) |
| **JSON files** *(optional, Phase 7 stretch)* | Server | Scene persistence via simple JSON serialization to disk — no database dependency |
| **glTF** *(optional, Phase 7 stretch)* | Data format | Optional scene export format |

**Infrastructure & cost summary**: the only always-on cost is the VPS running the Bun collaboration server and coturn TURN relay ($5/month VPS). Cloudflare Pages hosting and STUN are free. A domain name, if wanted for polish, is ~$12/year. Realistic total spend: **$0–$30** across the project's lifetime, comfortably under the $50 cap.

---

## 5. Networking Architecture — Two Distinct Layers

**Layer A — Scene collaboration (client-server, ordered broadcast):**
- **Transport**: plain WebSockets from each client to the Bun server (Bun has built-in WebSocket support — no libraries needed).
- **Server**: holds canonical scene state, assigns each incoming edit a monotonically increasing sequence number, and rebroadcasts ops to every connected client in that order.
- **Client logic**: apply incoming ops in sequence-number order to the local scene graph — this alone guarantees every client converges to identical state, no merge algorithm required.
- **Late joiners / persistence**: a new client requests current scene state from the server on connect; the server is also the natural place to persist projects to disk (see Phase 7).

**Layer B — Render-tile distribution (peer-to-peer, only where it must be):**
- **Transport**: the browser's native `RTCPeerConnection` / `RTCDataChannel` API, called directly from TypeScript — no bundled WebRTC library. This is a change from earlier drafts of this plan (which proposed compiling libdatachannel, a C++ WebRTC stack, into the WASM module); on reflection, the browser already ships a native, C++-implemented WebRTC stack internally, so reimplementing it added complexity without a performance win. Only the raw tile pixel buffers get handed into WASM, for C++-side decoding.
- **Signaling**: the same Bun server used for Layer A also brokers WebRTC offer/answer/ICE-candidate exchange for Layer B — one server process, two responsibilities. It never performs rendering or touches tile pixel data itself.
- **STUN/TURN**: Self-hosted `coturn` on the same VPS as the collaboration server provides the TURN relay for symmetric-NAT peers, eliminating dependency on third-party relay uptime for demos. Multiple STUN servers are configured for redundancy (`stun.l.google.com:19302` and `stun.cloudflare.com:3478`). A third-party TURN fallback (Metered.ca free tier — a few GB/month, more than enough for demo scale) is kept as a secondary option in case the self-hosted relay is unreachable. At demo scale (3–5 peers), bandwidth on the VPS is negligible.

**Why split it this way:**
- Scene edits need **agreement** among a small number of trusted collaborators — a single authoritative sequencer gets you that for a fraction of the engineering cost of a CRDT, with easier debugging, easier persistence, and none of the exotic edge cases (concurrent moves in a tree CRDT are a genuinely hard, research-adjacent problem — worth knowing about, not worth building from scratch here).
- Render tiles need **compute**, which a single small server can't provide without becoming the cloud-GPU cost you're trying to avoid — so that layer, and only that layer, goes P2P.

---

## 6. Graphics Concepts & Algorithms

This is organized by the two rendering tiers, plus the shared scene infrastructure underneath both.

### 6.1 Scene Representation & Transform Pipeline
- Hierarchical scene graph with parent-child transform inheritance (local-to-world matrix composition).
- Model / View / Projection matrix pipeline; perspective and orthographic projection, using a `[0, 1]` depth range to match WebGPU conventions natively (the custom math library is written for this from the start, avoiding the clip-space conversion issues that arise with OpenGL-convention libraries).
- Orbit/pan/zoom camera controls (arcball or turntable-style camera math).
- Quaternion-based rotation to avoid gimbal lock in object manipulation gizmos.

### 6.2 Real-Time Rasterization Pipeline (interactive preview tier)
- Triangle rasterization fundamentals: barycentric coordinate interpolation, depth (Z) buffering, backface culling.
- Real-time shading: simplified Cook-Torrance PBR (metallic/roughness model) from the start — this shares the same material parameter schema as the path tracer (albedo, roughness, metallic), so materials are defined once and render correctly in both tiers without a throwaway intermediate shader.
- Anti-aliasing via MSAA (hardware-supported in the rasterization pass).
- Gizmo rendering and object-space picking/hit-testing for selection and manipulation (ray-object intersection tests: ray-AABB, ray-triangle for precise picks).
- Instancing for repeated geometry (relevant once "components," described in Phase 7, are introduced).

### 6.3 Path Tracing Pipeline (high-fidelity tier — CPU in WASM)

The path tracer runs as **CPU compute inside the WASM module**, not as GPU compute shaders. This is a deliberate choice: CPU path tracing allows standard recursive BVH traversal, natural variable-length path handling (Russian roulette without warp divergence), and straightforward debugging via native builds (Dawn/desktop). The distributed rendering architecture compensates for the per-machine speed difference by spreading tiles across multiple peers. GPU acceleration via WebGPU compute shaders is a stretch goal (see Phase 7), but would require a fundamentally different architecture (wavefront path tracing with separate kernels for ray generation, material evaluation, and shadow rays; stackless BVH traversal; no recursion) — worth doing eventually, but not worth blocking the core product on.

- **Acceleration structure**: Bounding Volume Hierarchy (BVH) construction using the Surface Area Heuristic (SAH), and BVH traversal for ray-scene intersection — the single most important data structure for making path tracing tractable.
- **Monte Carlo integration** of the rendering equation.
- **Importance sampling**: cosine-weighted hemisphere sampling for diffuse surfaces; GGX importance sampling for specular/glossy materials.
- **Next Event Estimation (NEE)** — explicit light sampling to reduce noise versus pure random-walk path tracing.
- **Multiple Importance Sampling (MIS)** combining BSDF sampling and light sampling for faster convergence.
- **Materials**: Cook-Torrance microfacet BRDF (GGX distribution, Smith geometry term) for physically-based metals/dielectrics.
- **Russian roulette** path termination for unbiased variance reduction on long light paths.
- **Progressive rendering / sample accumulation**: each additional pass refines the image, which is exactly the mechanism that makes distributed rendering natural — different peers can contribute different sample counts to the same accumulating image.
- **Denoising**: an edge-avoiding À-Trous wavelet filter (an accessible, well-scoped SVGF-lite approach) to make low-sample-count previews look clean while full convergence continues in the background.
- **Tone mapping & gamma correction** for final display (e.g., ACES filmic tone mapping).

### 6.4 Distributed Rendering Layer (the novel piece)
- **Tile decomposition**: the final-quality render is split into a grid of tiles (e.g., 64x64 pixels). Tiles are encoded as 16-bit half-float RGBA (to preserve high dynamic range for compositing and denoising) and compressed with LZ4 before transmission. Because this exceeds WebRTC's safe 16 KiB message limit, tiles are chunked at the application layer over unreliable data channels (avoiding head-of-line blocking).
- **Scene versioning & Security**: Each tile request includes a scene version tag. If the scene changes during a render, the version bumps, stale in-flight tiles are discarded, and the render restarts. The compositor also performs basic sanity checks (NaN/Inf detection) on incoming tiles to mitigate faulty or malicious peers.
- **Work distribution**: a lightweight scheduler running in **TypeScript** (not WASM — it needs direct access to `RTCPeerConnection`/`RTCDataChannel` state) assigns tiles to connected peers based on reported capability/throughput, with re-assignment if a peer disconnects mid-tile (fault tolerance). The scheduler is coordination logic, not compute — the only pieces that stay in WASM are tile decomposition geometry (which pixels belong to which tile), per-tile sample-count tracking, and compositing math.
- **Progressive compositing**: tiles stream back at varying sample counts and get composited into the shared framebuffer live (compositing math runs in WASM for typed-array performance), so the viewer watches the image sharpen in real time as peers contribute.
- **Heterogeneous convergence handling**: since peers finish tiles at different rates/quality, the compositor needs to track per-tile sample counts and blend intelligently rather than assuming uniform convergence — a legitimately interesting scheduling/consistency problem worth writing about.

### 6.5 Scene Consistency Layer (server-ordered, not CRDT)
- Operation schema for scene edits (insert, delete, move/reparent, update-property), applied client-side as a simple **replay log**: the server stamps each op with a sequence number, and every client applies ops strictly in that order.
- Because ordering is centralized, there's no need for merge logic or vector clocks — the server's sequence number *is* the total order. 
- **Semantic Conflict Resolution**: While structural divergence is prevented by the server, semantic conflicts (e.g. Client B moves an object that Client A just deleted) are handled via **deterministic client drop**. Clients silently ignore invalid ops (moves on deleted objects, reparent cycles). For concurrent property writes, we use a simple "last writer wins" policy based on the server's sequence order.
- **Broadcast Throttling**: To prevent network saturation during continuous manipulations (e.g., a user dragging a gizmo at 60fps), the local client updates instantly at 60fps but only broadcasts its state to the server every ~100ms. Remote peers interpolate between these updates.
- **Optimistic local application with undo-and-replay reconciliation**: a client applies its own edit locally immediately (for zero perceived latency). If the server-confirmed order differs from the assumed order, the client **undoes** all unconfirmed local ops, applies the server-confirmed ops in order, then **re-applies** any remaining unconfirmed local ops on top. This requires every op to be invertible (each op must have a defined undo), which is already necessary for the undo/redo stack built in Phase 2 — so the reconciliation mechanism falls out of work that's being done anyway. This is the same pattern used by most real-time editors that aren't pure CRDTs (it's close to how Figma's own sync engine actually works, incidentally).

---

## 7. System Architecture Overview

```
                    ┌───────────────────────────────────┐
                    │     Server (Bun, single process)   │
                    │  - Authoritative scene state       │
                    │  - Assigns op sequence numbers     │
                    │  - Broadcasts ordered ops (WS)     │
                    │  - WebRTC signaling (offer/answer) │
                    │  + coturn TURN relay (same VPS)    │
                    └───────────────┬────────────────────┘
                        WebSocket   │   (scene ops, in both directions;
                     (scene state,  │    also brokers WebRTC handshakes
                      ordering)     │    for the P2P layer below)
              ┌────────────────────┼────────────────────┐
              │                    │                     │
      ┌───────▼───────┐   ┌────────▼────────┐   ┌────────▼────────┐
      │   Browser A    │   │   Browser B     │   │   Browser C     │
      │ ┌────────────┐ │   │ ┌─────────────┐ │   │ ┌─────────────┐ │
      │ │  TS Shell   │ │   │ │  TS Shell   │ │   │ │  TS Shell   │ │
      │ │ (Preact UI, │ │   │ │ (Preact UI, │ │   │ │ (Preact UI, │ │
      │ │  native     │◄┼───┼─┤  native     │◄┼───┼─┤  native     │ │
      │ │  WebRTC,    │ │ P2P │  WebRTC,    │ │P2P│  WebRTC,    │ │
      │ │  tile       │ │ (tile bytes only, via the browser's
      │ │  scheduler) │ │  native RTCDataChannel API — no bundled library)
      │ └──────┬──────┘ │   │ └──────┬──────┘ │   │ └──────┬──────┘ │
      │        │ WASM API│   │        │ WASM API│   │        │ WASM API│
      │ ┌──────▼──────┐ │   │ ┌──────▼──────┐ │   │ ┌──────▼──────┐ │
      │ │ C++ → WASM  │ │   │ │ C++ → WASM  │ │   │ │ C++ → WASM  │ │
      │ │  Engine:    │ │   │ │  Engine:    │ │   │ │  Engine:    │ │
      │ │ - Scene log │ │   │ │ - Scene log │ │   │ │ - Scene log │ │
      │ │ - Rasterizer│ │   │ │ - Rasterizer│ │   │ │ - Rasterizer│ │
      │ │ - PathTracer│ │   │ │ - PathTracer│ │   │ │ - PathTracer│ │
      │ │   (CPU)     │ │   │ │   (CPU)     │ │   │ │   (CPU)     │ │
      │ │ - Tile      │ │   │ │ - Tile      │ │   │ │ - Tile      │ │
      │ │   encode/   │ │   │ │   encode/   │ │   │ │   encode/   │ │
      │ │   decode/   │ │   │ │   decode/   │ │   │ │   decode/   │ │
      │ │   composite │ │   │ │   composite │ │   │ │   composite │ │
      │ └─────────────┘ │   │ └─────────────┘ │   │ └─────────────┘ │
      └─────────────────┘   └─────────────────┘   └─────────────────┘
```

Scene edits flow client → server → all clients (ordered broadcast, server is authoritative). Render tiles flow directly peer-to-peer between browsers over the browser's native WebRTC API — TS opens the data channel, runs the tile scheduler, and moves raw tile bytes; C++/WASM encodes/decodes those bytes and composites incoming tiles. The server brokers the initial WebRTC handshake but never sees tile data.

---

## 8. Milestone-by-Milestone Build Order

Estimated as a realistic part-time solo pace (10-15 hours/week); adjust freely. Each phase ends in something demoable, which matters both for motivation and for having incremental resume/portfolio checkpoints.

### Phase 0 — Foundations (Weeks 1–4)
- Set up CMake project with dual toolchains (native + Emscripten).
- Set up the Vite frontend project with Preact and TypeScript; configure WASM asset serving.
- Implement the custom math library (vec3, mat4, quat — header-only, `[0, 1]` depth range, column-major) with unit tests.
- Get a trivial C++ function compiled to WASM and callable from the Vite-served page (prove the pipeline end-to-end before building anything real).
- Stand up a minimal WebGPU context in the browser and render a single colored triangle from C++ code.
- **Deliverable**: "Hello triangle" running through the full C++ → WASM → WebGPU → Vite pipeline.

### Phase 1 — Core Rasterizer & Scene Graph (Weeks 5–12)
- Implement the scene graph (transform hierarchy, parent/child composition).
- Implement camera system (orbit/pan/zoom, projection matrices).
- Implement the rasterization pipeline: mesh loading (start with primitives — cube, sphere, plane), MVP transform pipeline, depth testing, simplified Cook-Torrance PBR shading (metallic/roughness) — skipping Blinn-Phong entirely, since the PBR material schema is shared with the path tracer and the WGSL shader is only marginally more complex.
- Implement object picking (ray-AABB / ray-triangle intersection) and transform gizmos (move/rotate/scale handles).
- **Deliverable**: A single-user local scene editor — add primitives, move/rotate/scale them, orbit the camera, see real-time PBR-shaded preview. This alone is already demoable.

### Phase 2 — Editor UX Layer (Weeks 13–18)
- Build out the Preact UI shell: object list/outliner, property inspector (position/rotation/scale/material fields), toolbar.
- Material system: PBR parameters (albedo, roughness, metallic) feeding the rasterizer shader — the same parameter schema that will feed the path tracer in Phase 4.
- Undo/redo stack (local operation log — this becomes the same op format that gets sent to the server in Phase 3, so the work isn't thrown away). **Every op must have a defined inverse** (this is required for both undo/redo and for the optimistic-application reconciliation strategy in Phase 3).
- **Deliverable**: A polished single-user 3D scene editor with a UX that doesn't need you standing next to it to explain.

### Phase 3 — Server-Authoritative Real-Time Collaboration (Weeks 19–26)
- Finalize the operation schema (insert/delete/move/update-property) from Phase 2's local undo/redo log.
- Build the collaboration server in Bun: holds canonical scene state, assigns sequence numbers to incoming ops, rebroadcasts to all connected clients over WebSocket. The server is ~600-1200 lines (handling session management, UUID-based rooms, and state sync) — Bun's built-in WebSocket support means no framework or library dependencies.
- Client-side: send local edits to the server, apply confirmed ops (in server-assigned order) to the local scene graph; add optimistic local application with **undo-and-replay reconciliation** — if the server-confirmed order differs from the locally-assumed order, undo unconfirmed local ops, apply server ops in order, re-apply remaining unconfirmed local ops. The undo infrastructure from Phase 2 makes this straightforward.
- Add live cursors/selection highlighting for connected peers (the "wow, it's really live" demo moment).
- Basic reconnect/resync handling: a client that drops and rejoins fetches current state from the server rather than replaying the full op history.
- **Deliverable**: Two or more browser tabs editing the same 3D scene simultaneously, live, over the open internet — the core "Figma for 3D" product is now real. Notably shorter than a hand-rolled CRDT would have taken, which is exactly the point of this design choice — more of your time budget is preserved for the rendering work in Phases 4–6.

### Phase 4 — Path Tracer Core + Distributed Rendering Prototype (Weeks 27–40)
- BVH construction (SAH-based) and traversal — standard recursive traversal, which works naturally in CPU/WASM code.
- Core path tracing loop: Monte Carlo integration, cosine-weighted hemisphere sampling, Russian roulette termination.
- Cook-Torrance BRDF (GGX + Smith) for physically-based materials — reusing the same material parameters already defined for the rasterizer.
- Next event estimation + multiple importance sampling for faster convergence.
- Progressive accumulation buffer (each frame adds samples, image refines over time).
- Tone mapping + gamma correction on output.
- **Tile decomposition and minimal distributed rendering prototype** (last 1–2 weeks of this phase): once the path tracer renders tiles locally, prototype P2P tile distribution with hardcoded tile assignments (simple round-robin, no fault tolerance, no adaptive scheduling). This de-risks the novel feature early — if basic tile transfer over WebRTC works, the remaining scheduling/compositing work in Phase 6 is refinement, not exploration.
- **Deliverable**: A "render final image" button that path-traces the current scene locally, watchable as it progressively converges — plus a rough but working proof-of-concept of tiles rendering across two browser tabs via WebRTC.

### Phase 5 — Denoising & Quality Pass (Weeks 41–46)
- Implement the À-Trous wavelet denoiser to make low-sample renders look clean quickly.
- Tune material/lighting defaults so scenes look good out of the box (an underrated but important step for demo quality).
- **Deliverable**: Fast, clean-looking previews even at low sample counts — makes the eventual distributed version feel snappy rather than noisy.

### Phase 6 — Distributed Peer Rendering (Weeks 47–58)
- Upgrade the Phase 4 prototype into a production-quality distributed renderer:
  - Adaptive work distribution scheduler (TypeScript): assign tiles to connected peers based on reported throughput (replacing Phase 4's hardcoded round-robin), reassign on disconnect (fault tolerance).
  - Live compositing of incoming tiles into the shared framebuffer as they arrive (compositing math in WASM), handling heterogeneous sample counts per tile.
  - Graceful solo fallback: if no peers are connected, render entirely locally at a reduced target sample count.
- Set up coturn on the VPS and configure the multi-provider STUN/TURN ICE configuration for reliable NAT traversal.
- **Deliverable**: The signature demo — open the scene in 3+ browser tabs/machines, hit "final render," and watch tiles complete and stream in from different peers simultaneously, converging to a clean final image with zero cloud spend.

### Phase 7 — Polish, Deployment, Demo Prep (Weeks 59–65)
- Deploy the Bun collaboration server + coturn to the VPS; deploy the static frontend to Cloudflare Pages with `_headers` file configuring `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (required for `SharedArrayBuffer` and WASM threading).
- Write a project README with architecture diagrams and a recorded demo video (critical for resume/portfolio linking — don't skip this).
- Optional stretch goals if time allows:
  - Scene export (glTF).
  - Basic component/instance reuse system.
  - Saved-project persistence (simple JSON file serialization to disk on the server — no database needed at this scale).
  - GPU-accelerated path tracing via WebGPU compute shaders (would require a wavefront path tracer architecture with separate kernels for ray generation, material evaluation, and shadow rays, plus stackless BVH traversal — a significant but well-scoped extension).
- **Deliverable**: A publicly reachable, working product with a polished write-up — the actual resume artifact.

---

## 9. Testing Strategy

Testing is lightweight but targeted — the goal is to catch regressions in the parts of the system where bugs are hardest to diagnose visually.

- **Math library**: Unit tests for vec3/mat4/quat operations, projection matrix construction, and transform composition. These run natively (no WASM) and are the first tests written (Phase 0). Edge cases: gimbal-lock-adjacent quaternion operations, near/far plane projection, `[0, 1]` depth range correctness.
- **Path tracer**: Golden-image comparison tests. Render a Cornell box scene at a fixed sample count and seed, compare against a reference image (pixel RMSE below a threshold). This catches BRDF bugs, BVH traversal errors, and importance sampling regressions that are nearly impossible to spot by eye at low sample counts. Run natively via Dawn for speed.
- **Scene sync**: Deterministic op-replay tests. Record a sequence of ops with known sequence numbers, replay them on two independent scene-graph instances, and assert that the resulting scene states are byte-identical. Also test the undo-and-replay reconciliation path: apply ops optimistically in one order, then reconcile to a different server-confirmed order, and verify the final state matches a direct application in the confirmed order.
- **Tile compositor**: Known-answer compositing tests. Provide tiles with known pixel values and sample counts, composite them, and verify the output matches the expected weighted average.
- **Integration**: Manual smoke tests — open two browser tabs, make edits, verify sync; trigger a distributed render across tabs. Automating browser-level integration tests (e.g., Playwright) is a stretch goal, not a blocker.

---

## 10. Risk & Scope Management

- **Biggest remaining risk**: distributed rendering (Phase 6) is still open-ended in difficulty — tile scheduling, fault tolerance, and heterogeneous-convergence compositing are all genuinely fiddly. Timebox it and accept a "good enough" scheduler (e.g., simple round-robin tile assignment before anything adaptive) rather than over-engineering before the rest of the product exists. The **Phase 4 prototype** (new in this revision) directly mitigates this risk by proving the basic WebRTC tile transfer path early — if it works there, Phase 6 is refinement, not exploration. Note that the server-authoritative choice for scene collaboration (Phase 3) already removed what would have been the *other* major risk (a hand-rolled CRDT) — that risk is deliberately designed out rather than just hoped away.
- **Fallback if WebRTC/NAT traversal proves painful**: the self-hosted coturn relay on the same VPS as the collaboration server should handle most NAT scenarios at demo scale. If even that fails for specific network configurations, relay tile data through the WebSocket server itself as a temporary measure — it becomes a relay for that layer too instead of pure P2P, which costs you the "zero cloud compute" framing if it stays that way, but keeps the project moving while you debug the P2P path.
- **Fallback if WebGPU browser support/tooling is rough during development**: build and test the compute-heavy path tracer natively first (via Dawn), validate correctness and performance there, and treat the WASM/browser port as an integration step rather than where you debug core algorithms. This is especially clean because the path tracer is CPU-only (no GPU compute shaders to port), so the native ↔ WASM gap is just a recompile.
- **Demo insurance**: Phase 1 and Phase 3 are each independently demoable milestones. Even if Phases 4–6 run long, you already have a real, live, collaborative 3D editor to show — the distributed path tracer is the differentiator, not the whole story.
- **Cross-origin isolation**: Cloudflare Pages (not GitHub Pages) is used for deployment specifically because it supports custom response headers. The `_headers` file configuring COOP/COEP is set up in Phase 7 but should be tested locally (Vite dev server with the `cross-origin-isolation` plugin) from Phase 0 to catch issues early.

---

## 11. Why This Reads Well on a Resume

A one-line resume bullet this project supports, essentially for free once it's built:

*"Built a real-time collaborative 3D scene editor in C++/WebAssembly/WebGPU, with a server-authoritative sync engine for live multi-user editing and a physically-based path tracer whose final renders are computed via peer-to-peer distributed compute over WebRTC — eliminating cloud rendering costs entirely."*

That sentence alone signals graphics engineering, real-time collaborative systems, and distributed/P2P networking — three distinct, valuable skill clusters — anchored to one coherent, demoable product rather than three disconnected toy projects. It also demonstrates architectural judgment: choosing centralization for the parts that benefit from it and P2P only where it's structurally required is a more sophisticated design story than "P2P everywhere," and it's the kind of tradeoff interviewers like hearing you reason through.
