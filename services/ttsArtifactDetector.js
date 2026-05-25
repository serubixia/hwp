import { spawn } from "child_process";

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

    ffmpeg.stdout.on("data", (chunk) => {
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

      let spikes = 0;
      let energySpikes = 0;
      let clipping = 0;
      let zeroCrossings = 0;

      const windowSize = 160; // 10ms @16kHz

      // =========================
      // 1. SPIKES + CLIPPING
      // =========================
      for (let i = 1; i < samples.length; i++) {

        const prev = samples[i - 1];
        const curr = samples[i];

        const diff = Math.abs(curr - prev);

        // ⚡ spikes más razonables (normalizado)
        if (diff > 12000) {
          spikes++;
        }

        // 🔴 clipping real
        if (Math.abs(curr) > 32000) {
          clipping++;
        }

        // 🔄 zero crossing (cambio de signo)
        if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
          zeroCrossings++;
        }
      }

      // =========================
      // 2. ENERGY POR VENTANA
      // =========================
      let maxEnergy = 0;
      const energies = [];

      for (let i = 0; i < samples.length; i += windowSize) {

        let energy = 0;

        for (let j = i; j < i + windowSize && j < samples.length; j++) {
          energy += Math.abs(samples[j]);
        }

        const avgEnergy = energy / windowSize;
        energies.push(avgEnergy);

        if (avgEnergy > maxEnergy) {
          maxEnergy = avgEnergy;
        }
      }

      const meanEnergy =
        energies.reduce((a, b) => a + b, 0) / (energies.length || 1);

      // detectar picos relativos (no absolutos)
      for (const e of energies) {
        if (e > meanEnergy * 2.5) {
          energySpikes++;
        }
      }

      // =========================
      // 3. QUALITY SCORE MEJORADO
      // =========================
      const artifactScore =
        spikes * 0.08 +
        energySpikes * 0.12 +
        clipping * 0.2;

      const qualityScore = Math.max(0, 1 - artifactScore);

      const artifactDetected =
        clipping > 5 ||
        spikes > 10 ||
        energySpikes > 6;

      resolve({
        artifactDetected,
        spikes,
        energySpikes,
        clipping,
        zeroCrossings,
        qualityScore
      });
    });

    ffmpeg.on("error", reject);
  });
}
