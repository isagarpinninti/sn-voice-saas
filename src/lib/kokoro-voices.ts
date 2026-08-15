/**
 * ZeVox Voice Catalog — Kokoro voices (self-hosted engine, LiveKit/WebRTC path).
 *
 * Distinct from src/lib/voices.ts (Deepgram Aura, legacy widget WS path).
 * Kokoro voice IDs are baked into the kokoro-onnx voice pack — no live API
 * to fetch names from, so this list is hand-maintained same as the Aura one.
 *
 * Reference: hexgrad/Kokoro-82M voice pack (kokoro-onnx voices-v1.0.bin).
 */

export type KokoroVoice = {
  id: string // Kokoro voice id, no "kokoro:" prefix — stored as-is on Agent.voiceId
  name: string
  gender: 'female' | 'male'
  accent: 'US' | 'UK'
  description: string
}

export const KOKORO_VOICES: KokoroVoice[] = [
  { id: 'af_heart', name: 'Heart', gender: 'female', accent: 'US', description: 'Warm, conversational. The default ZeVox voice.' },
  { id: 'af_bella', name: 'Bella', gender: 'female', accent: 'US', description: 'Bright and friendly.' },
  { id: 'af_nicole', name: 'Nicole', gender: 'female', accent: 'US', description: 'Calm and composed.' },
  { id: 'af_sarah', name: 'Sarah', gender: 'female', accent: 'US', description: 'Polished and clear.' },
  { id: 'af_sky', name: 'Sky', gender: 'female', accent: 'US', description: 'Light, energetic delivery.' },
  { id: 'am_adam', name: 'Adam', gender: 'male', accent: 'US', description: 'Confident American baritone.' },
  { id: 'am_michael', name: 'Michael', gender: 'male', accent: 'US', description: 'Relaxed and natural.' },
  { id: 'bf_emma', name: 'Emma', gender: 'female', accent: 'UK', description: 'Calm British accent.' },
  { id: 'bf_isabella', name: 'Isabella', gender: 'female', accent: 'UK', description: 'Crisp and professional.' },
  { id: 'bm_george', name: 'George', gender: 'male', accent: 'UK', description: 'British male, articulate.' },
]

export function findKokoroVoice(id: string): KokoroVoice | undefined {
  return KOKORO_VOICES.find(v => v.id === id)
}
