import stringSimilarity from "string-similarity";
import levenshtein from "fast-levenshtein";

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[.,!?]/g, "")
    .trim();
}

export function calculateScores(expected, actual) {

  const ref = normalize(expected);
  const hyp = normalize(actual);

  const similarity =
    stringSimilarity.compareTwoStrings(ref, hyp);

  const distance =
    levenshtein.get(ref, hyp);

  const maxLen =
    Math.max(ref.length, hyp.length);

  const cer =
    maxLen === 0
      ? 0
      : distance / maxLen;

  return {
    similarityScore: similarity,
    characterErrorRate: cer,
    hallucinationScore: 1 - similarity
  };
}
