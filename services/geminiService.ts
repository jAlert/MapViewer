import { GoogleGenAI } from "@google/genai";
import { MapFeatureProperties } from "../types";

// Get API key from Vite environment variables
const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY || '';

let ai: GoogleGenAI | null = null;

// Initialize Gemini AI client with error handling
try {
  if (apiKey) {
    ai = new GoogleGenAI({ apiKey });
  } else {
    console.warn('⚠ Gemini API key not set. AI features will be disabled. Set VITE_GEMINI_API_KEY in .env.local');
  }
} catch (error) {
  console.error('✗ Failed to initialize Gemini:', error);
}

export const generateLocationInsight = async (properties: MapFeatureProperties): Promise<string> => {
  if (!ai) {
    return `📍 ${properties.name || 'Location'}\n\nAI insights are currently disabled. Please configure your Gemini API key in .env.local file to enable this feature.`;
  }

  try {
    const EXCLUDED_KEYS = new Set(['Shape_Leng', 'Shape_Area', 'WDPAID', 'PA_CODE', 'PA_CODE2', 'LegStatCod', 'Reg']);
    const safeProps = Object.fromEntries(
      Object.entries(properties).filter(([key, value]) =>
        !EXCLUDED_KEYS.has(key) && (typeof value === 'string' || typeof value === 'number') && value !== null
      )
    );

    const prompt = `
      You are a geospatial analyst. I have selected a feature on a map with the following properties:
      ${JSON.stringify(safeProps, null, 2)}

      Please provide a concise, engaging 2-paragraph summary about this type of location,
      inferring potential uses, environmental importance, or urban planning implications based on its name and type.
      Keep it professional but accessible.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "No insights available for this location.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Unable to generate AI insights at this time. Please ensure your API key is configured correctly.";
  }
};
