import axios from "axios";
import fs from "fs";
import FormData from "form-data";

const WHISPER_URL = process.env.WHISPER_URL;

export async function transcribeAudio(filePath) {

  const form = new FormData();

  form.append(
    "audio_file",
    fs.createReadStream(filePath)
  );

  form.append("task", "transcribe");
  form.append("language", "es");

  const response = await axios.post(
    WHISPER_URL,
    form,
    {
      headers: form.getHeaders()
    }
  );

  return response.data.text;
}
