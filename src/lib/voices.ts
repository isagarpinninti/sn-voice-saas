/**
 * ZeVox Voice Catalog — Deepgram Aura voices.
 *
 * NOTE: This catalog is hand-maintained. Deepgram occasionally adds or
 * renames voices — when they do, update this file and ship a deploy.
 * v1 ships English-only voices because the STT pipeline defaults to en-US;
 * mixing a non-English voice with English STT produces nonsense.
 *
 * Reference: https://developers.deepgram.com/docs/tts-models
 */

export type Voice = {
  id: string                          // Deepgram model id
  name: string                        // Display name
  gender: 'female' | 'male'
  accent: 'US' | 'UK' | 'AU' | 'IE'
  description: string                 // One-line marketing description
  sampleText: string                  // What the preview endpoint speaks
}

export const VOICES: Voice[] = [
  {
    id: 'aura-asteria-en',
    name: 'Asteria',
    gender: 'female',
    accent: 'US',
    description: 'Warm, conversational. The default ZeVox voice.',
    sampleText: 'Hi, I\'m Asteria. I can help you check tickets, create incidents, or look up records — just ask.',
  },
  {
    id: 'aura-luna-en',
    name: 'Luna',
    gender: 'female',
    accent: 'US',
    description: 'Polished and friendly. Great for customer-facing widgets.',
    sampleText: 'Hi, I\'m Luna. I can help you check tickets, create incidents, or look up records — just ask.',
  },
  {
    id: 'aura-stella-en',
    name: 'Stella',
    gender: 'female',
    accent: 'US',
    description: 'Bright and energetic. A lively front-desk feel.',
    sampleText: 'Hi, I\'m Stella. I can help you check tickets, create incidents, or look up records — just ask.',
  },
  {
    id: 'aura-athena-en',
    name: 'Athena',
    gender: 'female',
    accent: 'UK',
    description: 'Calm British accent. Authoritative without being cold.',
    sampleText: 'Hello, I\'m Athena. I can help you check tickets, create incidents, or look up records — just ask.',
  },
  {
    id: 'aura-hera-en',
    name: 'Hera',
    gender: 'female',
    accent: 'US',
    description: 'Mature, composed. Suits enterprise IT support tone.',
    sampleText: 'Hello, I\'m Hera. I can help you check tickets, create incidents, or look up records — just ask.',
  },
  {
    id: 'aura-orion-en',
    name: 'Orion',
    gender: 'male',
    accent: 'US',
    description: 'Confident American baritone. The default male voice.',
    sampleText: 'Hi, I\'m Orion. I can help you check tickets, create incidents, or look up records — just ask.',
  },
  {
    id: 'aura-arcas-en',
    name: 'Arcas',
    gender: 'male',
    accent: 'US',
    description: 'Relaxed and natural. Conversational without being casual.',
    sampleText: 'Hi, I\'m Arcas. I can help you check tickets, create incidents, or look up records — just ask.',
  },
  {
    id: 'aura-perseus-en',
    name: 'Perseus',
    gender: 'male',
    accent: 'US',
    description: 'Smooth and articulate. A polished podcast feel.',
    sampleText: 'Hi, I\'m Perseus. I can help you check tickets, create incidents, or look up records — just ask.',
  },
  {
    id: 'aura-angus-en',
    name: 'Angus',
    gender: 'male',
    accent: 'IE',
    description: 'Irish accent. Friendly and distinctive.',
    sampleText: 'Hello, I\'m Angus. I can help you check tickets, create incidents, or look up records — just ask.',
  },
  {
    id: 'aura-helios-en',
    name: 'Helios',
    gender: 'male',
    accent: 'UK',
    description: 'British male. Crisp and professional.',
    sampleText: 'Hello, I\'m Helios. I can help you check tickets, create incidents, or look up records — just ask.',
  },
]

export function findVoice(id: string): Voice | undefined {
  return VOICES.find(v => v.id === id)
}
