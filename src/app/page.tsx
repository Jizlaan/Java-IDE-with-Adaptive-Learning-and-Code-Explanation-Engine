"use client";

import { useState } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { Play, Loader2, BookOpen, Brain, TerminalSquare, Folder, Search, Settings, Sidebar, ChevronRight, FileCode, PlayCircle } from "lucide-react";

export default function Home() {
  const [code, setCode] = useState(
    'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, Java IDE!");\n    }\n}'
  );

  const [output, setOutput] = useState("Ready to compile and run.");
  const [isRunning, setIsRunning] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState("Run");

  const [learningInsights, setLearningInsights] = useState<{
    explanation: string;
    missingConcepts: string[];
    resources: { title: string; url: string }[];
  } | null>(null);

  const handleRunCode = async () => {
    setIsRunning(true);
    setOutput("Compiling...");
    setActiveBottomTab("Run");
    setLearningInsights(null);

    try {
      const response = await fetch("/api/run-java", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (data.success) {
        setOutput(data.output || "Process finished with exit code 0");
      } else {
        setOutput(`Process finished with exit code 1\n\n${data.error}\n\n${data.output}`);
        fetchMLInsights(data.error || data.output, code);
      }
    } catch (err: any) {
      setOutput(`Failed to run code: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const fetchMLInsights = async (rawError: string, activeCode: string) => {
    try {
      const response = await fetch("/api/explain-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: rawError, code: activeCode }),
      });
      const data = await response.json();
      if (data.insights) setLearningInsights(data.insights);
    } catch (err) {
      console.error("Failed to fetch ML insights", err);
    }
  };

  // Define a custom high-contrast Monaco theme before it mounts if needed,
  // but vs-dark with our surrounding #1E1E1E blends perfectly.
  const handleEditorBeforeMount = (monaco: any) => {
    monaco.editor.defineTheme('high-contrast-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1A1A1A',
        'editor.lineHighlightBackground': '#2A2A2A',
      }
    });
  };

  return (
    <div className="flex flex-col h-screen text-[#E0E0E0] font-sans overflow-hidden bg-[#0D0D0D]">
      {/* High-Contrast Top Toolbar */}
      <header className="flex items-center justify-between px-4 h-11 shrink-0 bg-[#121212] border-b border-[#333333] shadow-sm z-10">

        {/* Left: Menu & Project Info */}
        <div className="flex items-center space-x-4">
          <Sidebar className="w-[18px] h-[18px] text-[#A0A0A0] cursor-pointer hover:text-white transition-colors" />
          <div className="flex items-center text-[13px] font-medium text-[#A0A0A0]">
            java-ide-project
            <ChevronRight className="w-4 h-4 mx-1 text-[#555555]" />
            src
            <ChevronRight className="w-4 h-4 mx-1 text-[#555555]" />
            <span className="text-white drop-shadow-sm">Main.java</span>
          </div>
        </div>

        {/* Center: Run Configuration Widget */}
        <div className="flex items-center bg-[#1A1A1A] rounded-[4px] border border-[#404040] mt-[2px] h-7 shadow-sm transition-colors hover:border-[#555555]">
          <div className="flex items-center space-x-2 px-3 text-[13px] font-medium border-r border-[#404040] hover:bg-[#2A2A2A] cursor-pointer rounded-l-[3px] h-full transition-colors">
            <span className="text-[#4DAAFB] font-bold drop-shadow-sm">{"{}"}</span>
            <span className="text-[#E0E0E0]">Current File</span>
          </div>
          <button
            onClick={handleRunCode}
            disabled={isRunning}
            className="flex items-center justify-center px-3 h-full hover:bg-[#2A2A2A] rounded-r-[3px] transition-colors disabled:opacity-50"
            title="Run 'Main.java'"
          >
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 text-[#E0E0E0] animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 text-[#599e5e] fill-[#599e5e]" />
            )}
          </button>
        </div>

        {/* Right: Settings/Profile */}
        <div className="flex items-center space-x-4">
          <Search className="w-[18px] h-[18px] text-[#A0A0A0] hover:text-white cursor-pointer transition-colors" />
          <Settings className="w-[18px] h-[18px] text-[#A0A0A0] hover:text-white cursor-pointer transition-colors" />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden bg-[#1A1A1A]">

        {/* Slim Left Sidebar (Toolbar) */}
        <div className="w-12 flex flex-col items-center py-3 space-y-4 border-r border-[#333333] bg-[#0F0F0F] shrink-0">
          <div className="p-2 rounded-md cursor-pointer text-[#A0A0A0] hover:text-white hover:bg-[#2A2A2A] transition-colors" title="Project">
            <Folder className="w-5 h-5" />
          </div>
        </div>

        {/* Editor Area & Bottom Panel */}
        <div className="flex flex-col flex-1 border-r border-[#333333] overflow-hidden min-w-0 bg-[#0D0D0D]">

          {/* Editor Tabs */}
          <div className="flex items-center h-10 bg-[#121212] border-b border-[#333333] shrink-0 pl-[1px]">
            <div className="flex items-center h-full px-5 border-x border-[#333333] bg-[#1A1A1A] text-[#E0E0E0] text-[13px] font-medium relative group cursor-pointer hover:bg-[#222222] transition-colors min-w-36">
              <span className="text-[#4DAAFB] font-bold mr-2.5 text-sm drop-shadow-sm">{"{ }"}</span>
              Main.java
              {/* IntelliJ active tab indicator line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#4DAAFB] shadow-[0_0_4px_rgba(77,170,251,0.5)]"></div>
            </div>

            <div className="flex flex-1 items-center justify-end px-3">
              <button
                onClick={handleRunCode}
                className="hover:bg-[#2A2A2A] p-1.5 rounded-md transition-colors"
                title="Run File"
              >
                <PlayCircle className="w-4 h-4 text-[#599e5e] fill-transparent" />
              </button>
            </div>
          </div>

          {/* Monaco Editor Section */}
          <div className="flex-1 relative bg-[#1A1A1A] overflow-hidden">
            <Editor
              height="100%"
              language="java"
              theme="high-contrast-dark"
              value={code}
              beforeMount={handleEditorBeforeMount}
              onChange={(value) => setCode(value || "")}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                padding: { top: 16 },
                scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12 },
                lineNumbersMinChars: 4,
                renderLineHighlight: "all",
                matchBrackets: "always",
                wordWrap: "on",
                cursorBlinking: "smooth",
                smoothScrolling: true,
              }}
            />
          </div>

          {/* Bottom Terminal / Output Panel */}
          <div className="h-64 shrink-0 bg-[#141414] border-t border-[#333333] flex flex-col relative group">
            {/* Drag Handle Mockup */}
            <div className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-[#4DAAFB] transition-colors z-10"></div>

            {/* Tool Window Header */}
            <div className="h-9 flex items-center px-2 bg-[#0F0F0F] border-b border-[#333333]">
              <div
                className={`flex items-center px-4 h-full text-[13px] cursor-pointer hover:bg-[#2A2A2A] transition-colors rounded-t-sm ${activeBottomTab === 'Run' ? 'font-medium text-[#E0E0E0] bg-[#1A1A1A] border-t-2 border-transparent border-t-[#4DAAFB]' : 'text-[#888888]'}`}
                onClick={() => setActiveBottomTab("Run")}
              >
                Run
              </div>
              <div
                className={`flex items-center px-4 h-full text-[13px] cursor-pointer hover:bg-[#2A2A2A] transition-colors rounded-t-sm ml-1 ${activeBottomTab === 'Terminal' ? 'font-medium text-[#E0E0E0] bg-[#1A1A1A] border-t-2 border-transparent border-t-[#4DAAFB]' : 'text-[#888888]'}`}
                onClick={() => setActiveBottomTab("Terminal")}
              >
                Terminal
              </div>
            </div>

            <div className="flex-1 p-4 overflow-auto bg-[#141414]">
              <pre className="font-mono text-[13px] whitespace-pre-wrap leading-relaxed text-[#D4D4D4]">
                <span className="text-[#7CB165] font-semibold">{`C:\\Program Files\\Java\\jdk\\bin\\java.exe Main`}</span>{"\n"}
                {output}
              </pre>
            </div>
          </div>
        </div>

        {/* Right Sidebar: AI/Dashboard (IntelliJ Tool Window Style) */}
        <div className="w-[340px] flex flex-col bg-[#141414] shrink-0 border-l border-[#333333]">
          <div className="h-10 flex items-center px-4 bg-[#0F0F0F] border-b border-[#333333] shrink-0 shadow-sm">
            <span className="text-[13px] font-medium text-[#E0E0E0] flex items-center">
              <Brain className="w-4 h-4 mr-2 text-[#c678dd] drop-shadow-sm" />
              Adaptive Learning
            </span>
          </div>

          <div className="flex-1 overflow-auto p-5 scrollbar-thin scrollbar-thumb-[#404040] text-[13px] bg-[#1A1A1A]">
            {!learningInsights ? (
              <div className="h-full flex flex-col items-center justify-center text-[#777777] space-y-4">
                <Brain className="w-12 h-12 opacity-20" />
                <p className="text-center px-4 leading-relaxed font-medium">
                  Run your code. If you make a mistake, I will assist you with it.
                </p>
              </div>
            ) : (
              <div className="space-y-5 animate-in fade-in duration-300">

                {/* Error Breakdown */}
                <div className="border border-[#e06c75]/50 bg-[#e06c75]/10 rounded-md p-3.5 hover:bg-[#e06c75]/15 transition-all shadow-sm">
                  <h3 className="text-[#e06c75] font-semibold mb-1.5 flex items-center text-[11px] uppercase tracking-wider drop-shadow-sm">
                    Error Breakdown
                  </h3>
                  <p className="text-[#E0E0E0] leading-relaxed">
                    {learningInsights.explanation}
                  </p>
                </div>

                {/* Missing Concepts */}
                {learningInsights.missingConcepts && learningInsights.missingConcepts.length > 0 && (
                  <div className="border border-[#4DAAFB]/50 bg-[#4DAAFB]/10 rounded-md p-3.5 hover:bg-[#4DAAFB]/15 transition-all shadow-sm">
                    <h3 className="text-[#4DAAFB] font-semibold mb-2.5 flex items-center text-[11px] uppercase tracking-wider drop-shadow-sm">
                      Concepts
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {learningInsights.missingConcepts.map((concept, idx) => (
                        <span key={idx} className="bg-[#141414] text-[#E0E0E0] px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#404040] shadow-sm">
                          {concept}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Study Resources */}
                {learningInsights.resources && learningInsights.resources.length > 0 && (
                  <div className="border border-[#c678dd]/50 bg-[#c678dd]/10 rounded-md p-3.5 hover:bg-[#c678dd]/15 transition-all shadow-sm">
                    <h3 className="text-[#c678dd] font-semibold mb-2.5 flex items-center text-[11px] uppercase tracking-wider drop-shadow-sm">
                      <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Recommended Reading
                    </h3>
                    <ul className="space-y-2.5">
                      {learningInsights.resources.map((res, idx) => (
                        <li key={idx}>
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block p-2.5 rounded-md bg-[#141414] border border-[#333333] hover:border-[#c678dd]/60 hover:bg-[#1C1C1C] transition-all shadow-sm group"
                          >
                            <span className="text-[#E0E0E0] font-medium block truncate text-[12px] group-hover:text-white">
                              {res.title}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
