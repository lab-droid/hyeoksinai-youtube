import { GoogleGenAI, Type, Modality } from '@google/genai';

export type Ratio = '16:9' | '1:1' | '3:4' | '9:16';
export type Style = '실제 사진' | '귀여운 졸라맨' | '미니멀 인포그래픽' | '일본 애니메이션' | '영화 스틸컷' | '사이버펑크 네온' | '수채화 동화' | '레트로 픽셀아트' | '다크 판타지' | '3D 픽사 애니메이션' | '시네마틱 브이로그' | '빈티지 필름' | '참고이미지 톤앤매너';
export type Voice = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr' | 'Aoede' | 'Leda' | 'Orion' | 'Lyra';
export type CharacterEthnicity = '선택 안함' | '한국인' | '서양인(백인)' | '서양인(흑인)';
export type CharacterAge = '선택 안함' | '10세 미만' | '10대' | '20대' | '30대' | '40대' | '50대' | '60대' | '70대';
export type CharacterGender = '선택 안함' | '남자' | '여자';

export interface Cut {
  id: string;
  text: string;
  imagePrompt: string;
  videoPrompt: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  isGeneratingImage?: boolean;
  isGeneratingVideo?: boolean;
  isGeneratingAudio?: boolean;
}

let customApiKey = typeof window !== 'undefined' ? localStorage.getItem('GEMINI_API_KEY') || '' : '';

export const setCustomApiKey = (key: string) => {
  customApiKey = key;
  if (typeof window !== 'undefined') {
    localStorage.setItem('GEMINI_API_KEY', key);
  }
};

const getAi = () => new GoogleGenAI({ apiKey: customApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY });

async function withRetry<T>(operation: () => Promise<T>, maxRetries = 10, delayMs = 2000): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const statusCode = error?.status || (error?.response?.status);
      
      const isRetryable = 
        statusCode === 503 || 
        statusCode === 504 ||
        statusCode === 429 ||
        statusCode === 500 ||
        errorMessage.includes('503') || 
        errorMessage.includes('504') ||
        errorMessage.includes('429') ||
        errorMessage.includes('500') ||
        errorMessage.includes('high demand') ||
        errorMessage.includes('UNAVAILABLE') ||
        errorMessage.includes('quota') ||
        errorMessage.includes('Internal error') ||
        errorMessage.includes('deadline exceeded') ||
        errorMessage.includes('fetch');

      if (!isRetryable || attempt === maxRetries) {
        console.error(`Final attempt ${attempt} failed:`, errorMessage);
        throw error;
      }
      
      const waitTime = delayMs * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.warn(`Attempt ${attempt} failed. Retrying in ${Math.round(waitTime)}ms...`, errorMessage);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  throw new Error('Max retries reached');
}

export async function generateScript(topic: string, duration: number, ratio: string, style: string, characterEthnicity: CharacterEthnicity, characterAge: CharacterAge, characterGender: CharacterGender, referenceImages: string[] = []) {
  const ai = getAi();
  
  const parts: any[] = [];
  
  if (referenceImages.length > 0) {
    parts.push({ text: `Here are some reference images. Analyze their tone, color palette, character design, and overall style. The generated imagePrompt MUST 100% reflect this exact style and tone so the final video is perfectly consistent with these reference images.` });
    referenceImages.forEach(img => {
      const mimeType = img.split(';')[0].split(':')[1];
      const data = img.split(',')[1];
      parts.push({
        inlineData: { data, mimeType }
      });
    });
  }

  let characterInstruction = '';
  if (characterEthnicity !== '선택 안함' || characterAge !== '선택 안함' || characterGender !== '선택 안함') {
    const eth = characterEthnicity !== '선택 안함' ? characterEthnicity : 'any ethnicity';
    const age = characterAge !== '선택 안함' ? characterAge : 'any age';
    const gender = characterGender !== '선택 안함' ? characterGender : 'any gender';
    characterInstruction = `The main character(s) should be: ${eth}, ${age}, ${gender}. Ensure imagePrompt explicitly describes this character profile.`;
  }

  parts.push({ text: `Create a YouTube Shorts/Video script about "${topic}". Duration: ${duration}s. Style: "${style}". Ratio: ${ratio}.
  ${characterInstruction}
  Break into short cuts. For each cut, provide:
  1. text: Korean narration.
  2. imagePrompt: English prompt for image generation matching the style and the narration.
  3. videoPrompt: English prompt describing how to animate the generated image (e.g., "subtle camera pan", "character blinks", "leaves blowing in the wind").
  Return JSON array.` });

  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: [{ parts }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            imagePrompt: { type: Type.STRING },
            videoPrompt: { type: Type.STRING },
          },
          required: ['text', 'imagePrompt', 'videoPrompt'],
        },
      },
    },
  }), 5);

  return JSON.parse(response.text || '[]');
}

export async function oneTouchPlan(images: string[]) {
  const ai = getAi();
  const parts: any[] = [];
  
  parts.push({ text: "Analyze these images and suggest a creative YouTube video topic and a full script (cuts). Return JSON with 'topic' and 'cuts' (array of {text, imagePrompt, videoPrompt}). The language should be Korean for 'topic' and 'text', and English for 'imagePrompt' and 'videoPrompt'." });
  
  images.forEach(img => {
    const mimeType = img.split(';')[0].split(':')[1];
    const data = img.split(',')[1];
    parts.push({
      inlineData: { data, mimeType }
    });
  });

  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ parts }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          cuts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                imagePrompt: { type: Type.STRING },
                videoPrompt: { type: Type.STRING },
              },
              required: ['text', 'imagePrompt', 'videoPrompt'],
            }
          }
        },
        required: ['topic', 'cuts']
      }
    }
  }), 5);

  return JSON.parse(response.text || '{}');
}

export async function generateAudio(text: string, voiceName: string) {
  const ai = getAi();
  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: [{ parts: [{ text: `Say in Korean: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  }), 7);

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (base64Audio) return pcmBase64ToWavUrl(base64Audio);
  throw new Error('Failed to generate audio');
}

export async function generateMusic(prompt: string) {
  const ai = getAi();
  const response = await withRetry(async () => {
    const stream = await ai.models.generateContentStream({
      model: "lyria-3-clip-preview",
      contents: `Generate a 30-second background music for a YouTube video: ${prompt}. The music should be loopable and suitable for background atmosphere.`,
      config: {
        responseModalities: [Modality.AUDIO],
      }
    });

    let audioBase64 = "";
    let mimeType = "audio/wav";

    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.inlineData?.data) {
          if (!audioBase64 && part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          audioBase64 += part.inlineData.data;
        }
      }
    }
    return { audioBase64, mimeType };
  }, 5, 3000);

  if (!response.audioBase64) throw new Error('Failed to generate music');
  
  const binary = atob(response.audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: response.mimeType });
  return URL.createObjectURL(blob);
}

export async function generateImage(prompt: string, ratio: string) {
  const ai = getAi();
  let aspectRatio = ratio;
  if (!["1:1", "3:4", "4:3", "9:16", "16:9", "1:4", "1:8", "4:1", "8:1"].includes(ratio)) aspectRatio = "16:9";

  const response = await withRetry(() => ai.models.generateContent({
    model: 'imagen-3.0-generate-001',
    contents: [{ parts: [{ text: prompt }] }],
    config: { imageConfig: { aspectRatio: aspectRatio as any, imageSize: "1K" } },
  }), 7);

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  throw new Error('Failed to generate image');
}

export async function generateVideo(imageUri: string, prompt: string, ratio: string, referenceImages: string[] = []) {
  const ai = getAi();
  const mimeType = imageUri.split(';')[0].split(':')[1] || 'image/png';
  const base64Data = imageUri.split(',')[1];
  let aspectRatio = ratio === '9:16' ? '9:16' : '16:9';
  let resolution = '720p';

  const safePrompt = prompt && prompt.trim() !== '' ? prompt : 'A beautiful scene with subtle motion';

  let operation = await withRetry(async () => {
    return await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: safePrompt,
      image: { imageBytes: base64Data, mimeType: mimeType },
      config: { 
        numberOfVideos: 1, 
        resolution: resolution as any, 
        aspectRatio: aspectRatio as any
      },
    });
  }, 10, 5000);

  const maxPollAttempts = 30; // Max 5 minutes (30 * 10 seconds)
  let pollCount = 0;

  while (!operation.done && pollCount < maxPollAttempts) {
    pollCount++;
    await new Promise(resolve => setTimeout(resolve, 10000));
    try {
      operation = await withRetry(() => ai.operations.getVideosOperation({ operation }), 3, 2000);
    } catch (e) {
      console.warn(`Polling attempt ${pollCount} failed:`, e);
      // Just continue polling unless it's a fatal error
    }
  }

  if (!operation.done) {
    throw new Error('Video generation timed out.');
  }

  if (operation.error) {
    console.error('Video generation operation error:', operation.error);
    throw new Error(`Video generation failed: ${operation.error.message || JSON.stringify(operation.error)}`);
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) {
    throw new Error('Failed to generate video: No download link in response');
  }

  const apiKey = customApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
  const response = await withRetry(async () => {
    const res = await fetch(downloadLink, { headers: { 'x-goog-api-key': apiKey! } });
    if (!res.ok) throw new Error(`Failed to fetch video: ${res.status} ${res.statusText}`);
    return res;
  }, 5, 3000);
  
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function pcmBase64ToWavUrl(base64: string, sampleRate: number = 24000): string {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  
  const buffer = bytes.buffer;
  const wavBuffer = encodeWAV(new Int16Array(buffer), sampleRate);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function encodeWAV(samples: Int16Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) view.setInt16(offset, samples[i], true);
  return view;
}
