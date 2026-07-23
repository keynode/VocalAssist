# Microphone Latency Compensation Design

Date: 2026-07-23

## Goal

Align detected microphone pitch with the musical moment that produced the analyzed audio. The vocal trace on the contour must be drawn in the past at the audio capture position, and scoring must compare the voice with the target note at that same historical position.

The feature also exposes a compact measurement of the effective capture-to-render delay and an optional persistent fine adjustment for device latency that the browser cannot report accurately.

## Approved Product Decisions

- The same compensated timestamp is used by both the vocal contour and hit scoring.
- MPM continues to publish an immediate result on every usable microphone chunk.
- SwiftF0 remains asynchronous and never blocks the immediate MPM result.
- A late SwiftF0 result retains the timestamp of its original audio instead of appearing at the current playback position.
- Compensation is automatic by default.
- A compact manual fine adjustment is available inside Settings and consumes no permanent page height.
- Existing raw microphone constraints remain unchanged: echo cancellation, noise suppression, and automatic gain control stay disabled.

## Current Problem

`processPitch()` currently creates a pitch sample with `q: nowQ()`. That value describes when pitch detection finished on the main thread, not when the analyzed samples entered the microphone graph.

The resulting horizontal error contains several components:

- microphone and driver input latency;
- accumulation of a 1024-sample AudioWorklet chunk;
- the age of the 2048- or 4096-sample analysis window;
- detector execution time;
- asynchronous SwiftF0 inference time;
- waiting for the next animation frame.

The current code assigns all these delayed results to the live playhead. Scoring also uses `curNotesG`, which represents the current target rather than the target at audio capture time.

## Timing Model

The AudioWorklet adds an exact `endFrame` value to every posted microphone chunk. `endFrame / sampleRate` places the end of that chunk on the `AudioContext` clock.

Each pitch analysis creates immutable timing metadata:

```js
{
  captureEndTime,
  analysisTime,
  captureQ,
  timelineRevision,
  detectedTime
}
```

`analysisTime` is calculated as:

```text
captureEndTime
  - max(0,
      half of the detector input window
      + reported microphone input latency
      + manual fine adjustment)
```

The midpoint of the trailing analysis window is used because a pitch estimate describes the samples across that window rather than only its newest sample. At 48 kHz this automatically places a 2048-sample result about 21 ms in the past and a 4096-sample result about 43 ms in the past before device latency is considered.

The implementation must not subtract detector or rendering time a second time. Because `captureQ` is fixed before detection completes, any later publication naturally appears behind the advancing playhead by the correct amount.

`MediaStreamTrack.getSettings().latency`, when present and finite, supplies the reported input-latency component. Missing or implausible values are treated as zero. `AudioContext.baseLatency` and `outputLatency` are not microphone input measurements and are not included.

The manual fine adjustment represents additional input latency. Positive values move samples farther into the past; negative values reduce the automatic correction. The total correction is clamped to zero, so a negative adjustment can never place a sample after the end of its captured audio block.

## Mapping Audio Time to Song Time

When a microphone chunk arrives during playback, its `analysisTime` is converted immediately with the active transport anchor:

```text
captureQ = startQ + (analysisTime - startAcTime) * qPerSec()
```

This conversion happens before starting asynchronous work. A SwiftF0 promise therefore retains the original `captureQ` even if inference completes after the playhead has advanced.

A monotonically increasing `timelineRevision` identifies the transport state. It changes whenever playback is started, paused, sought, restarted, a song or visualized MIDI selection is rebuilt, or another operation re-anchors the song clock. An asynchronous result whose revision no longer matches is discarded. This prevents a result captured before a seek or song change from being drawn or scored in the new position.

Samples captured while playback is stopped retain `q: null` and continue to support the existing live pitch indicator without participating in scoring.

## Detector Data Flow

### AudioWorklet Path

The worklet posts both the 1024 samples and the exact context frame at the end of the chunk. `onMicChunk()` stores the samples in the ring buffer and passes the chunk timing into `detectTick()`.

MPM/Pitchy selects its existing adaptive 2048- or 4096-sample window. Timing metadata is created for the actual selected window and passed to `processPitch()` together with the result.

If the 2048-sample attempt fails and the 4096-sample fallback succeeds, the metadata is recalculated for 4096 samples. It must never retain the shorter window's midpoint.

SwiftF0 captures separate immutable metadata for the exact buffer passed to `sfeDetect()`. Its promise uses that metadata on completion. A valid result updates the historical trace at that position and never receives a fresh `nowQ()`.

### Analyser Fallback

Browsers without AudioWorklet use `ac.currentTime` as the approximate buffer end time and subtract half of `analyser.fftSize`, the reported input latency, and manual adjustment. This path is less precise but follows the same `processPitch(f, timing)` contract.

### Publication and Scoring

`processPitch()` receives the timing metadata instead of creating a song position internally.

For a primary MPM result:

1. Smooth the pitch using the existing hysteresis.
2. Find target notes with `activeTargetNotes(MELODY, captureQ)`.
3. Calculate `diff` against those historical targets.
4. Count the scoring sample once.
5. Store the pitch point using `captureQ`.
6. Update the current pitch readout immediately.

For a SwiftF0 refinement:

- use the stored historical timestamp;
- do not increment scoring counters a second time;
- do not move the point to the current playhead;
- update the live readout only while the result still satisfies the existing freshness limit.

An out-of-range `captureQ`, stopped transport, stale timeline revision, silence, or invalid frequency does not affect scoring.

## Rendering

The waterfall and contour continue rendering against the current `nowQ()`. Pitch samples already contain their corrected historical `q`, so no global visual offset is applied inside `drawPitch()` or `drawHView()`.

This preserves a single source of timing truth:

- the contour uses `sample.q`;
- the waterfall trail uses `sample.q`;
- scoring uses targets at `sample.q`;
- the live pitch indicator uses the newest fresh detection.

The current playhead and MIDI notes are not delayed. Only microphone observations are assigned to their actual past position.

## Delay Measurement

The application maintains smoothed diagnostic values:

- capture-to-detect: `detectedTime - analysisTime`;
- detect-to-paint: first animation-frame time after publication minus `detectedTime`;
- capture-to-paint: first paint time minus `analysisTime`.

All calculations use the `AudioContext` clock where possible so `performance.now()` and audio-clock origins are not mixed. Diagnostics use an exponential moving average to avoid flickering.

The displayed automatic delay is the rounded capture-to-paint estimate, including the reported input latency and analysis-window age. It is informational; the actual placement always uses per-sample timestamps rather than applying that displayed average as a fixed offset.

## Settings

The existing Settings drawer gains one compact row:

```text
Синхронизация микрофона   Авто ~78 мс
Доп. поправка             [-250 … +400 мс]  [Сбросить]
```

The row is visible without opening another full-screen panel. English localization provides equivalent labels.

The fine adjustment:

- defaults to `0 ms`;
- persists in `localStorage`;
- applies to newly captured samples only;
- uses a bounded range of `-250` to `+400 ms`;
- returns to zero through Reset.

The automatic measurement remains active at every manual value. Reset does not change microphone processing constraints or detector selection.

## Error Handling and Fallbacks

- Missing `track.getSettings().latency`: use zero reported input latency and retain window/detector/render compensation.
- Invalid or extreme reported latency: ignore it instead of moving samples outside the song.
- AudioWorklet unavailable: use the approximate Analyser timing path.
- SwiftF0 completes after a transport revision: discard the result.
- SwiftF0 exceeds its freshness limit: it may update historical visualization only, but not the live indicator or scoring.
- Playback begins while an old stopped-state inference is pending: the revision mismatch prevents it from entering the new timeline.
- Fine-adjustment storage fails: continue with an in-memory zero/default value.

Microphone permission, unsupported-browser, silence, and detector failure behavior otherwise remains unchanged.

## Verification

Focused automated tests will verify:

- AudioWorklet messages contain an end-frame timestamp.
- A 2048-sample and 4096-sample window calculate different correct midpoint ages.
- the 4096 fallback uses its own window timestamp;
- delayed detector completion does not change `captureQ`;
- scoring selects targets at `captureQ`, not from `curNotesG`;
- SwiftF0 does not increment scoring twice;
- a seek or song change invalidates an outstanding SwiftF0 result;
- missing reported input latency falls back safely;
- the fine adjustment persists, resets, and has the documented sign;
- contour and waterfall consume the corrected stored sample position.

The complete existing Node test suite and JavaScript syntax check must still pass.

Manual browser acceptance will verify:

- a sung note appears behind the playhead at the matching MIDI note;
- the hit indication changes at the same compensated musical position;
- MPM remains responsive;
- SwiftF0 refinement does not jump to the live playhead;
- seeking while singing does not leak an old result into the new position;
- positive fine adjustment moves the trace farther into the past;
- microphone synchronization settings remain compact on narrow and wide layouts.

## Out of Scope

- Claiming sample-accurate acoustic latency when the browser or driver does not expose it.
- Automatically playing a calibration sound through speakers and recording it back.
- Delaying MIDI playback or the visual playhead to hide input latency.
- Re-enabling browser echo cancellation, noise suppression, or gain control.
- Replacing MPM, Pitchy, SwiftF0, or the existing score aggregation model.
