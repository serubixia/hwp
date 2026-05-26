import { spawn } from "child_process";
import { fft } from "fft-js";

// ======================================================
// HANN WINDOW
// ======================================================

function hannWindow(size) {
  const window = new Array(size);

  for (let i = 0; i < size; i++) {
    window[i] =
      0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }

  return window;
}

// ======================================================
// COSINE SIMILARITY
// ======================================================

function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }

  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

// ======================================================
// MEAN
// ======================================================

function mean(values) {
  if (!values.length) return 0;

  return (
    values.reduce((a, b) => a + b, 0) / values.length
  );
}

// ======================================================
// STANDARD DEVIATION
// ======================================================

function stddev(values, avg) {
  if (!values.length) return 0;

  const variance =
    values.reduce((sum, v) => {
      return sum + Math.pow(v - avg, 2);
    }, 0) / values.length;

  return Math.sqrt(variance);
}

// ======================================================
// MAIN DETECTOR
// ======================================================

export async function detectTtsArtifacts(filePath) {

  return new Promise((resolve, reject) => {

    // ==================================================
    // DECODE AUDIO
    // ==================================================

    const ffmpeg = spawn("ffmpeg", [
      "-i", filePath,

      // mono PCM 16khz
      "-f", "s16le",
      "-acodec", "pcm_s16le",
      "-ar", "16000",
      "-ac", "1",

      "-"
    ]);

    const chunks = [];

    ffmpeg.stdout.on("data", chunk => {
      chunks.push(chunk);
    });

    ffmpeg.stderr.on("data", () => {});

    ffmpeg.on("error", reject);

    ffmpeg.on("close", () => {

      try {

        const buffer = Buffer.concat(chunks);

        const samples = new Int16Array(
          buffer.buffer,
          buffer.byteOffset,
          buffer.length / 2
        );

        // ==============================================
        // ANALYSIS CONFIG
        // ==============================================

        const frameSize = 1024;
        const hopSize = 256;

        const window = hannWindow(frameSize);

        const spectralFluxValues = [];
        const rmsValues = [];

        let repetitionFrames = 0;
        let artifactFrames = 0;
        let silenceGlitches = 0;
        let clippingFrames = 0;

        let prevSpectrum = null;
        let prevFrame = null;

        // ==============================================
        // FRAME ANALYSIS
        // ==============================================

        for (
          let i = 0;
          i + frameSize < samples.length;
          i += hopSize
        ) {

          const frame = new Array(frameSize);

          // ============================================
          // WINDOW + NORMALIZE
          // ============================================

          for (let j = 0; j < frameSize; j++) {

            frame[j] =
              (samples[i + j] / 32768) * window[j];
          }

          // ============================================
          // RMS ENERGY
          // ============================================

          let rms = 0;

          for (let j = 0; j < frame.length; j++) {
            rms += frame[j] * frame[j];
          }

          rms = Math.sqrt(rms / frame.length);

          rmsValues.push(rms);

          // ============================================
          // FFT
          // ============================================

          const phasors = fft(frame);

          // ============================================
          // LOG SPECTRUM
          // ============================================

          const spectrum = phasors.map(([re, im]) => {

            const mag = Math.sqrt(re * re + im * im);

            return Math.log10(mag + 1e-8);
          });

          // ============================================
          // SPECTRAL FLUX
          // ============================================

          if (prevSpectrum) {

            let flux = 0;

            for (let k = 0; k < spectrum.length; k++) {

              const diff =
                spectrum[k] - prevSpectrum[k];

              // positive-only flux
              if (diff > 0) {
                flux += diff;
              }
            }

            spectralFluxValues.push(flux);
          }

          // ============================================
          // REPETITION DETECTION
          // ============================================

          if (prevFrame) {

            const similarity =
              cosineSimilarity(frame, prevFrame);

            if (similarity > 0.985) {
              repetitionFrames++;
            }
          }

          // ============================================
          // CLIPPING DETECTION
          // ============================================

          let clipped = 0;

          for (let j = 0; j < frame.length; j++) {

            if (Math.abs(frame[j]) > 0.98) {
              clipped++;
            }
          }

          // >10% clipped samples
          if (clipped > frame.length * 0.1) {
            clippingFrames++;
          }

          prevSpectrum = spectrum;
          prevFrame = frame;
        }

        // ==============================================
        // GLOBAL STATS
        // ==============================================

        const meanFlux = mean(spectralFluxValues);
        const stdFlux =
          stddev(spectralFluxValues, meanFlux);

        const fluxThreshold =
          meanFlux + stdFlux * 3;

        const avgRms = mean(rmsValues);

        // ==============================================
        // DETECT ARTIFACT FRAMES
        // ==============================================

        for (let i = 0; i < spectralFluxValues.length; i++) {

          const flux = spectralFluxValues[i];
          const rms = rmsValues[i] || 0;

          // spectral burst
          if (flux > fluxThreshold) {
            artifactFrames++;
          }

          // silence corruption
          if (
            rms < avgRms * 0.015 &&
            flux > meanFlux * 2
          ) {
            silenceGlitches++;
          }

          // huge burst
          if (rms > avgRms * 4) {
            artifactFrames++;
          }
        }

        // ==============================================
        // FINAL SCORING
        // ==============================================

        const totalProblems =
          artifactFrames +
          repetitionFrames +
          silenceGlitches +
          clippingFrames;

        // nonlinear penalty
        let qualityScore =
          1 - totalProblems * 0.015;

        qualityScore = Math.max(
          0,
          Math.min(1, qualityScore)
        );

        // ==============================================
        // FINAL DECISION
        // ==============================================

        const artifactDetected =
          artifactFrames > 3 ||
          repetitionFrames > 8 ||
          clippingFrames > 2 ||
          silenceGlitches > 2;

        resolve({

          artifactDetected,

          // ============================================
          // QUALITY
          // ============================================

          qualityScore,

          // ============================================
          // FLUX
          // ============================================

          meanFlux,
          stdFlux,
          fluxThreshold,

          // ============================================
          // COUNTERS
          // ============================================

          artifactFrames,
          repetitionFrames,
          silenceGlitches,
          clippingFrames,

          // ============================================
          // RMS
          // ============================================

          avgRms,

          // ============================================
          // EXTRA
          // ============================================

          analyzedFrames:
            spectralFluxValues.length
        });

      } catch (err) {
        reject(err);
      }
    });
  });
}
