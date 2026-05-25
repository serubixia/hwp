import { spawn } from "child_process";

export function detectTtsArtifacts(filePath) {
  return new Promise((resolve, reject) => {

    // 1. Convertimos a PCM crudo
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

    ffmpeg.stderr.on("data", () => {
      // ignoramos ruido de ffmpeg
    });

    ffmpeg.on("close", () => {

      const buffer = Buffer.concat(chunks);
      const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);

      let spikes = 0;
      let energySpikes = 0;

      const windowSize = 160; // 10ms a 16kHz

      for (let i = 1; i < samples.length; i++) {

        const diff = Math.abs(samples[i] - samples[i - 1]);

        // ⚡ DETECCIÓN DE CLICK / BUP
        if (diff > 18000) {
          spikes++;
        }
      }

      // 🔊 energía por ventana corta
      for (let i = 0; i < samples.length; i += windowSize) {

        let energy = 0;

        for (let j = i; j < i + windowSize && j < samples.length; j++) {
          energy += Math.abs(samples[j]);
        }

        const avgEnergy = energy / windowSize;

        // picos raros de energía local
        if (avgEnergy > 6000) {
          energySpikes++;
        }
      }

      const artifactDetected =
        spikes > 2 || energySpikes > 3;

      resolve({
        artifactDetected,
        spikes,
        energySpikes,
        qualityScore: Math.max(
          0,
          1 - (spikes * 0.15 + energySpikes * 0.1)
        )
      });
    });

    ffmpeg.on("error", reject);
  });
}
