import express from "express";
import multer from "multer";
import fs from "fs";

import { transcribeAudio } from "./services/whisper.js";
import { calculateScores } from "./services/scoring.js";
import { detectSilence } from "./services/silence.js";
import { detectArtifacts } from "./services/audioArtifacts.js";

const app = express();

const upload = multer({
  dest: "/tmp"
});

app.post("/evaluate", upload.single("audio"), async (req, res) => {
  try {
    const expectedText = req.body.text;

    if (!req.file) {
      return res.status(400).json({
        error: "audio file required"
      });
    }

    if (!expectedText) {
      return res.status(400).json({
        error: "text required"
      });
    }

    const silenceInfo = await detectSilence(req.file.path);
    const artifacts = await detectArtifacts(req.file.path);
    const transcription = await transcribeAudio(req.file.path);

    const scores = calculateScores(
      expectedText,
      transcription
    );

    fs.unlinkSync(req.file.path);

    return res.json({
      expectedText,
      transcription,
      ...scores,
      artifactDetected: artifacts.artifactDetected,
      silence: silenceInfo.hasSilenceOver1s
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: err.message
    });
  }
});

app.listen(3000, () => {
  console.log("API listening on :3000");
});
