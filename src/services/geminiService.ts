import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Scene {
  text: string;
  imagePrompt: string;
  imageUrl?: string;
}

export async function parseScriptToScenes(script: string, characterName: string = "the main stickman character"): Promise<Scene[]> {
  // Split the script by newlines and remove any empty lines
  const lines = script.split(/\n+/).map(l => l.trim()).filter(l => l.length > 0);
  
  if (lines.length === 0) return [];

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `I have a video script that is already pre-split into ${lines.length} distinct lines/paragraphs. 
    You MUST generate exactly ${lines.length} visual beats. Do NOT combine or split the lines further.
    
    For each line, provide a detailed image generation prompt for a stickman animation video.
    
    The video style is educational and psychological, similar to minimalist whiteboard animations.
    
    The image prompt MUST follow this specific style: 
    "Minimalist black line art on a clean white background, simple vector illustration, professional and clean, no shading, high contrast, using only black lines and occasional single-color accents if necessary. IMPORTANT: The main subject or icon must be perfectly centered in the frame with significant white space (padding) on all sides to create a clean, focused look."
    
    CRITICAL: The prompt MUST explicitly feature "${characterName}" as the main subject performing the action or reacting to the concept. Describe exactly what "${characterName}" is doing or interacting with in the scene.
    
    Here are the exact lines to use:
    ${lines.map((line, i) => `Line ${i + 1}: ${line}`).join('\n')}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            imagePrompt: { type: Type.STRING, description: "The detailed prompt for image generation in the specified style." },
          },
          required: ["imagePrompt"],
        },
      },
    },
  });

  try {
    const parsedScenes = JSON.parse(response.text || "[]");
    
    // Map over the ORIGINAL lines to guarantee a 1-to-1 mapping.
    // If the AI misses a line, we use a fallback prompt so the script structure is never lost.
    return lines.map((line, index) => {
      const aiPrompt = parsedScenes[index]?.imagePrompt || `Minimalist black line art of ${characterName} representing the concept of this scene.`;
      return {
        text: line,
        imagePrompt: `${aiPrompt} ( Centered composition, isolated icon-style illustration, pure white background, no unnecessary elements, clean negative space.)`
      };
    });
  } catch (e) {
    console.error("Failed to parse scenes", e);
    // Fallback if JSON parsing fails completely
    return lines.map(line => ({
      text: line,
      imagePrompt: `Minimalist black line art of ${characterName} representing the concept of this scene. ( Centered composition, isolated icon-style illustration, pure white background, no unnecessary elements, clean negative space.)`
    }));
  }
}

export async function generateImageForScene(prompt: string): Promise<string | undefined> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: {
      parts: [
        {
          text: prompt,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9",
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return undefined;
}
