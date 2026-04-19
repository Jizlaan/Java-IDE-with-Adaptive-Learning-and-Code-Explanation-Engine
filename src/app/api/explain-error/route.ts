import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { error, code } = await req.json();
    if (!error) {
      return NextResponse.json({ success: false, message: "No error provided" });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json({
        success: false,
        error: "GROQ_API_KEY is not configured on the server."
      });
    }

    // Call Local PyTorch ML Server for Context
    let mlInsightsContext = "";
    try {
      const mlResponse = await fetch("http://127.0.0.1:8000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, error_stack: error })
      });
      if (mlResponse.ok) {
        const mlData = await mlResponse.json();
        if (mlData.success && mlData.analysis) {
          mlInsightsContext = `\n\n[INTERNAL ML TELEMETRY - DO NOT SHOW TO USER directly, use to inform your response]\nPredicted Error Type: ${mlData.analysis.error_type}\nModel Root Cause Context: ${mlData.analysis.root_cause_context}\nDetected Code Smells: ${mlData.analysis.detected_smells}.\n`;
        }
      }
    } catch {
      console.warn("ML server unreachable, using LLM-only mode.");
    }

    const systemPrompt = `You are a coding assistant integrated into a Java IDE.
Your task is to analyze Java code and its compiler or runtime error, and explain it to a student who is just learning to code.
Use simple, student-friendly language. Avoid complex technical jargon unless you explain it simply. Do NOT use analogies. Be direct and concise. Do NOT add conversational fluff or "encouraging" phrases like "Don't worry". Focus purely on facts and making them understand *why* the error happened.
You MUST respond ONLY with a JSON object in the exact format shown below, with no surrounding markdown or explanation outside the JSON:

{
  "whatItMeans": "A simple, jargon-free explanation of the root concept behind this specific type of error (What does this error mean?).",
  "explanation": "A friendly step-by-step explanation of what went wrong in their specific code and exactly how to fix it.",
  "missingConcepts": ["Short Concept 1", "Short Concept 2"],
  "resources": [
    {"title": "Title of Java Article", "url": "https://docs.oracle.com/javase/tutorial/..."}
  ]
}
${mlInsightsContext}`;

    const userPrompt = `Code:\n\`\`\`java\n${code}\n\`\`\`\n\nError:\n\`\`\`\n${error}\n\`\`\``;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant", // Fast and reliable Open Source model for JSON structure
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq API Error:", errText);
      throw new Error(`Failed to fetch explanation from Groq API: ${response.statusText}`);
    }

    const data = await response.json();
    const insightsStr = data.choices[0].message.content;
    const insights = JSON.parse(insightsStr);

    return NextResponse.json({
      success: true,
      insights
    });

  } catch (error: unknown) {
    console.error("Explain error route exception:", error);
    const errorMsg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: errorMsg });
  }
}
