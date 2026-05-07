import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { messages, code, error_stack } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ success: false, error: "Invalid messages array" });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json({
        success: false,
        error: "GROQ_API_KEY is not configured on the server."
      });
    }

    const baseSystemPrompt = `You are the CodeSense AI Mentor. Your goal is to explain Java errors clearly and concisely.

STRICT FORMATTING RULES:
1. GROUPING: If multiple errors have the same root cause (e.g., multiple "cannot find symbol"), combine them into ONE block.
2. SYMBOL LISTING: List all problematic symbols (e.g., Cart, User, Item) as a bulleted list within that block.
3. STRUCTURE: Use exactly this Markdown structure for each unique error type:
   ### ❌ Error: [Error Name] ([Number] instances)
   **What it means:** [Short, beginner-friendly definition]
   **Problematic Symbols:** 
   - [Symbol Name] (Line [Number])
   - [Symbol Name] (Line [Number])
   **Why it happened:** [Contextual explanation]
   **How to fix:** [Clear steps and code snippets]
   **Learn More:** [Official Documentation Links]

4. NO CONVERSATION: Do not say "Here is your analysis" or "I hope this helps." Return only the Markdown.

If the user asks follow-up questions instead of providing an error, answer them directly, concisely, and cleanly without the template.`;

    // Query Local PyTorch ML Server for Context (If error occurred)
    let mlInsightsContext = "";
    let detectedSmells: string[] = [];
    if (code && error_stack) {
      try {
        // NOTE: The ML server runs on port 5000 and uses the /predict endpoint, taking { code, error }
        const mlResponse = await fetch("http://127.0.0.1:5000/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: code, error: error_stack })
        });
        if (mlResponse.ok) {
          const mlData = await mlResponse.json();
          if (mlData.smellDetails) {
            detectedSmells = Object.keys(mlData.smellDetails);
          }
          if (mlData.explanation || mlData.smellDetails) {
            mlInsightsContext = `\n\n[INTERNAL ML TELEMETRY - DO NOT SHOW TO USER directly, use to inform your response]\nModel Explanation: ${mlData.explanation}\nDetected Code Smells: ${detectedSmells.join(", ")}.\n`;
          }
        }
      } catch {
        console.warn("ML server unreachable on port 5000, using LLM-only mode.");
      }
    }

    const systemPromptMessage = {
      role: "system",
      content: baseSystemPrompt + mlInsightsContext
    };

    // To prevent Payload Too Large or Context Window Exceeded, we only keep the last 5 messages
    const sanitizedMessages = messages.slice(-5).map((m: { role: string; content: string }) => ({
      role: m.role,
      // Additionally, forcibly truncate any single message content that might have bypassed frontend truncations
      content: (m.content || "").length > 4000 ? m.content.substring(0, 4000) + "\n...[CONTENT TRUNCATED]..." : m.content
    }));

    const conversation = [systemPromptMessage, ...sanitizedMessages];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: conversation,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq API Error:", errText);
      throw new Error(`Failed to fetch chat response from Groq API: ${response.statusText}`);
    }

    const data = await response.json();
    const replyText = data.choices[0].message.content;

    return NextResponse.json({
      success: true,
      reply: replyText,
      detectedSmells
    });

  } catch (error: unknown) {
    console.error("Chat route exception:", error);
    const errorMsg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: errorMsg });
  }
}
