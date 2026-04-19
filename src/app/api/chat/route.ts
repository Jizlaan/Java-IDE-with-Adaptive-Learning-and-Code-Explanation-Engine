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

    const baseSystemPrompt = `You are a coding assistant integrated directly into a Java IDE. 
Your primary task is to review the Java code and compiler/runtime stack traces the student runs into.
If they encounter compiler errors:
1. Address ALL the specific errors present in the trace explicitly. Do not just generalize into one error.
2. **CRITICAL INSTRUCTION**: You MUST explain the error as if the student is a complete beginner. Use extremely simple English. NO complex jargon. Do NOT use analogies.
3. You MUST structure your response using exactly the following Markdown template for EVERY error and NOTHING ELSE. Do NOT add conversational fluff, greetings, or "encouraging" phrases like "Don't worry". Just output the template:

### ❌ Error: [Simple Name of Error]

**What does this error mean?**
[Your plain English explanation of the root concept]

**Why it happened:**
[Your basic logic explanation of why their code caused this]

**How to fix it:**
[Step-by-step instructions with a brief code snippet]

If they just ask follow-up questions, answer them intelligently, concisely, and directly without conversational fluff.`;

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
