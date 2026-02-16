
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY;

export const generateInsights = async (context: any) => {
  if (!API_KEY) return "AI insights are unavailable. API key not found.";
  
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const model = "gemini-3-flash-preview";

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          text: `You are an expert business analyst for a packaging company. 
          Given the current CRM data context: ${JSON.stringify(context)}, 
          provide 3 actionable insights or warnings for the manager. 
          Keep it professional, concise and bulleted.`
        }
      ],
      config: {
        temperature: 0.7,
        topP: 0.95,
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return "Unable to generate insights at this moment.";
  }
};
