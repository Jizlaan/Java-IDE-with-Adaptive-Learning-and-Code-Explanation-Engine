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

    const baseSystemPrompt = `You are a helpful and highly skilled conversational coding assistant integrated directly into a Java IDE. 
Your primary task is to review the Java code and compiler/runtime stack traces the user runs into.
If they encounter compiler errors:
1. Address ALL the specific errors present in the trace explicitly. Do not just generalize into one error.
2. Explain what each means in simple, beginner-friendly terms.
3. Suggest the exact lines to fix and how to fix them.
4. Keep a friendly, concise tone. Use Markdown text formatting. Show brief code snippets to clarify fixes where appropriate.

If they just ask follow-up questions, answer them intelligently based on the past conversation.`;

    // Query Local PyTorch ML Server for Context (If error occurred)
    let mlInsightsContext = "";
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
          if (mlData.explanation || mlData.smellDetails) {
            mlInsightsContext = `\n\n[INTERNAL ML TELEMETRY - DO NOT SHOW TO USER directly, use to inform your response]\nModel Explanation: ${mlData.explanation}\nDetected Code Smells: ${Object.keys(mlData.smellDetails || {}).join(", ")}.\n`;
          }
        }
      } catch (e) {
        console.warn("ML server unreachable on port 5000, using LLM-only mode.");
      }
    }

    const systemPromptMessage = {
      role: "system",
      content: baseSystemPrompt + mlInsightsContext
    };

    const sanitizedMessages = messages.map((m: any) => ({
      role: m.role,
      content: m.content
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
      reply: replyText
    });

  } catch (error: any) {
    console.error("Chat route exception:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal server error" });
  }
}
