import { exec } from "child_process";

export function detectArtifacts(filePath) {
  return new Promise((resolve, reject) => {

    const cmd = `
      ffmpeg -i "${filePath}"
      -af astats=metadata=1:reset=1
      -f null -
    `;

    exec(cmd, (error, stdout, stderr) => {
      if (error && error.code !== 1) {
        return reject(error);
      }

      // Detectar picos extremos
      const peakMatches =
        stderr.match(/Peak level dB: ([\-\d\.]+)/g) || [];

      let suspicious = false;

      for (const match of peakMatches) {
        const value = parseFloat(
          match.split(":")[1]
        );

        // cerca de clipping
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
  });
}
