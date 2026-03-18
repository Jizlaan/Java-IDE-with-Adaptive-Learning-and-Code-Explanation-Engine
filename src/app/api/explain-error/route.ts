import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { error, code } = await req.json();
    if (!error) {
      return NextResponse.json({ success: false, message: "No error provided" });
    }

    // ==========================================
    // INTEGRATION POINT FOR YOUR LOCAL ML MODEL
    // ==========================================
    // To connect your own ML model, you could do something like:
    // const mlResponse = await fetch("http://localhost:5000/predict", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ error, code })
    // });
    // const insights = await mlResponse.json();
    // return NextResponse.json({ insights });
    // ==========================================

    // For now, we return a smart-looking mock response to demonstrate the UI:
    let explanation = "Your code has a syntax or compilation error.";
    let missingConcepts = ["Syntax Mechanics", "Basic Java Structure"];
    let resources = [
      { title: "Java Programming Basics", url: "https://docs.oracle.com/javase/tutorial/java/nutsandbolts/" }
    ];

    if (error.includes(";") || error.includes("expected")) {
      explanation = "You missed a semicolon ';' at the end of a statement. In Java, every statement must end with a semicolon to tell the compiler where the instruction ends.";
      missingConcepts = ["Java Syntax Rules", "Statement Termination"];
      resources = [
        { title: "Statements and Blocks in Java", url: "https://docs.oracle.com/javase/tutorial/java/nutsandbolts/expressions.html" }
      ];
    } else if (error.includes("cannot find symbol") || error.includes("undefined") || error.includes("not find symbol")) {
      explanation = "You are trying to use a variable or method that hasn't been declared, or you might have misspelled it. The Java compiler doesn't recognize the name you provided.";
      missingConcepts = ["Variable Declaration", "Scope"];
      resources = [
        { title: "Variables in Java", url: "https://docs.oracle.com/javase/tutorial/java/nutsandbolts/variables.html" }
      ];
    } else if (error.includes("ArrayIndexOutOfBoundsException")) {
      explanation = "You tried to access an item in an array using an index that is either negative or greater than or equal to the size of the array. Remember that Java array indices start at 0.";
      missingConcepts = ["Arrays", "Zero-based Indexing"];
      resources = [
        { title: "Arrays Tutorial", url: "https://docs.oracle.com/javase/tutorial/java/nutsandbolts/arrays.html" }
      ];
    } else {
        explanation = `The compiler threw an error: ${error.substring(0, 100)}... Once your ML model is integrated, it will analyze this raw output and translate it to plain English here.`;
    }

    // Simulated ML delay
    await new Promise(resolve => setTimeout(resolve, 800));

    return NextResponse.json({
      success: true,
      insights: {
        explanation,
        missingConcepts,
        resources
      }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Internal server error" });
  }
}
