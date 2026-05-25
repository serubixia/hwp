import { spawn } from "child_process";

export function detectSilence(filePath) {
  return new Promise((resolve, reject) => {

    const ffmpeg = spawn("ffmpeg", [
      "-i", filePath,
      "-af", "silencedetect=noise=-30dB:d=1",
      "-f", "null",
      "-"
    ]);

    let stderr = "";

    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", () => {

      const hasSilenceOver1s =
        /silence_duration:\s*([1-9]\d*|\d+\.\d+)/.test(stderr);

      resolve({
        hasSilenceOver1s,
        raw: stderr
      });
    });

    ffmpeg.on("error", reject);
  });
}
