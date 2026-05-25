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

      const peakMatches =
        stderr.match(/Peak level dB: ([\-\d\.]+)/g) || [];

      let suspicious = false;

      for (const match of peakMatches) {

        const value =
          parseFloat(match.split(":")[1]);

        if (value > -1) {
          suspicious = true;
          break;
        }
      }

      resolve({
        artifactDetected: suspicious,
        raw: stderr
      });
    });

    ffmpeg.on("error", reject);
  });
}
