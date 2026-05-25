import { exec } from "child_process";

export function detectSilence(filePath) {
  return new Promise((resolve, reject) => {
    const cmd = `
      ffmpeg -i "${filePath}"
      -af silencedetect=noise=-30dB:d=1
      -f null -
    `;

    exec(cmd, (error, stdout, stderr) => {
      if (error && error.code !== 1) {
        return reject(error);
      }

      const hasSilenceOver1s =
        stderr.includes("silence_duration:") &&
        /silence_duration:\s*(1\.\d+|[2-9]\d*)/.test(stderr);

      resolve({
        hasSilenceOver1s,
        raw: stderr
      });
    });
  });
}
