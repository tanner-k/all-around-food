# 0002 — Video recipe import transcription

**Status:** Accepted
**Date:** 2026-05-23

## Context
Instagram and TikTok recipe import needs a way to turn short-form cooking videos into text that the recipe parser can structure. The importer also needs video/audio acquisition and normalization before transcription.

## Decision
- Use `yt-dlp` to fetch supported video media and metadata.
- Use `ffmpeg` to extract and normalize audio for transcription.
- Use the local external `whispr` FastAPI service over HTTP for speech-to-text.
- Do not vendor Whisper models, model weights, or Whisper runtime code into this repository.

## Rationale
Keeping transcription behind the `whispr` HTTP service gives the backend a small integration surface while avoiding large model files, GPU/runtime coupling, and package-management churn in the app repo. It also lets local development, CI, and deployed workers choose the appropriate transcription backend without changing recipe-import code.

## Consequences
- (positive) Repository stays lightweight and focused on import orchestration and recipe parsing.
- (positive) Transcription backend can be upgraded or hosted separately from app releases.
- (tradeoff) Runtime environments must install `yt-dlp` and `ffmpeg`, and run `whispr` at the configured `WHISPR_URL`.
- (tradeoff) Import behavior depends on external binary availability and version compatibility.
- (followup) Add a startup/runtime health check that reports missing binaries before a video import job starts.

## Alternatives considered
- Vendor Whisper directly: rejected because model weights and runtime dependencies would make the repo and deploys heavier than needed.
- Call a hosted transcription API directly: deferred until cost, privacy, and reliability needs are clearer.
- Skip transcription and parse captions only: rejected because many recipe videos rely on spoken steps that captions may omit.
