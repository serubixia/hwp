import { spawn } from "child_process";

export function detectArtifacts(filePath) {

  return new Promise((resolve, reject) => {

    const ffmpeg = spawn("ffmpeg", [
      "-i",
      filePath,
      "-af",
      "astats=metadata=1:reset=1",
      "-f",
      "null",
      "-"
    ]);

    let stderr = "";

    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", () => {

      // 👇 más robusto: capturar Peak_level con diferentes formatos
      const peaks = [...stderr.matchAll(/Peak[_ ]level.*?(-?\d+(\.\d+)?)/g)];

      let artifactDetected = false;

      for (const p of peaks) {

        const value = parseFloat(p[1]);

        // umbral más realista
        if (value > -1.5) {
          artifactDetected = true;
          break;
        }
      }

      resolve({
        artifactDetected,
        raw: stderr
      });
    });

    ffmpeg.on("error", reject);
  });
}
