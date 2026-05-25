import { spawn } from "child_process";
import { fft } from "fft-js";

export function detectTtsArtifacts(filePath) {

  return new Promise((resolve, reject) => {

    const ffmpeg = spawn("ffmpeg", [
      "-i", filePath,
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

    ffmpeg.on("close", () => {

      const buffer = Buffer.concat(chunks);

      const samples = new Int16Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.length / 2
      );

      const frameSize = 512;
      const hopSize = 256;

      let spectralFluxValues = [];

      let prevSpectrum = null;

      // =========================
      // FFT ANALYSIS
      // =========================

      for (let i = 0; i + frameSize < samples.length; i += hopSize) {

        const frame = [];

        for (let j = 0; j < frameSize; j++) {

          // normalizar -1..1
          frame.push(samples[i + j] / 32768);
        }

        // FFT
        const phasors = fft(frame);

        // magnitudes
        const spectrum = phasors.map(([re, im]) => {
          return Math.sqrt(re * re + im * im);
        });

        // =========================
        // SPECTRAL FLUX
        // =========================

        if (prevSpectrum) {

          let flux = 0;

          for (let k = 0; k < spectrum.length; k++) {

            const diff = spectrum[k] - prevSpectrum[k];

            // solo cambios positivos
            if (diff > 0) {
              flux += diff;
            }
          }

          spectralFluxValues.push(flux);
        }

        prevSpectrum = spectrum;
      }

      // =========================
      // ESTADÍSTICAS
      // =========================

      const meanFlux =
        spectralFluxValues.reduce((a, b) => a + b, 0) /
        (spectralFluxValues.length || 1);

      const maxFlux = Math.max(...spectralFluxValues);

      // detectar glitches extremos
      let artifactFrames = 0;

      for (const flux of spectralFluxValues) {

        if (flux > meanFlux * 3.5) {
          artifactFrames++;
        }
      }

      // score
      const qualityScore = Math.max(
        0,
        1 - artifactFrames * 0.03
      );

      const artifactDetected =
        artifactFrames > 4;

      resolve({
        artifactDetected,
        artifactFrames,
        meanFlux,
        maxFlux,
        qualityScore
      });
    });

    ffmpeg.on("error", reject);
  });
}
