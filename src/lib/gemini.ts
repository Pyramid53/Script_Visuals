import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface Scene {
  sceneNumber: number;
  narration: string;
  englishPrompt: string;
}

export async function generateGeminiImage(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: prompt,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: '16:9',
      },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData && part.inlineData.data) {
      const base64EncodeString: string = part.inlineData.data;
      // It returns base64 string
      return `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${base64EncodeString}`;
    }
  }
  
  throw new Error("No image was successfully generated. Please try again.");
}

export async function generatePrompts(lines: string[]): Promise<Scene[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `You are an expert AI prompt engineer and YouTube strategist.
I will provide an array of ${lines.length} lines from an Arabic video script.

You MUST generate exactly ONE visual scene for EACH line provided. The output array MUST contain exactly ${lines.length} items, maintaining the exact same order.

For EACH SCENE, provide:
- sceneNumber: The index of the line (starting from 1).
- narration: The exact Arabic line provided.
- englishPrompt: A highly professional, detailed English prompt for an AI image generator. The prompt MUST specify the following strict visual style to mimic high-quality whiteboard animation b-roll: "High-quality 2D whiteboard animation b-roll style, flat vector artwork on a clean, pristine pure white background. Characters are expressive webcomic-style figures with thick, smooth black outlines and solid white bodies. Male characters: Large round heads, huge expressive eyes, thick eyebrows, simple sleek bodies. Female characters: Large round heads, huge expressive eyes with distinct eyelashes, rosy cheeks, and styled brown hair with volume. Default to using the male character as the primary subject. ONLY include a female figure if the narration explicitly requires one (e.g., mentions a girl, woman, or female partner). Characters MUST be highly emotive and expressive. Add subtle, soft glowing drop shadows behind the characters to make them pop off the whiteboard. Use a minimal color palette: mostly crisp black outlines and white fills, with occasional bright, bold accent colors. Cinematic, clean, uncluttered composition. The image MUST NOT contain any text, words, or letters."

Input Lines:
${JSON.stringify(lines, null, 2)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            sceneNumber: { type: Type.INTEGER },
            narration: { type: Type.STRING, description: "The Arabic narration for this scene" },
            englishPrompt: { type: Type.STRING, description: "The professional English prompt for image generation (NO TEXT)" }
          },
          required: ["sceneNumber", "narration", "englishPrompt"]
        }
      }
    }
  });

  if (!response.text) {
    throw new Error("No response from Gemini");
  }

  return JSON.parse(response.text);
}
