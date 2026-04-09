"use client";

import { useState } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { Play, Loader2, BookOpen, Brain, TerminalSquare, Folder, Search, Settings, Sidebar, ChevronRight, FileCode, PlayCircle, X } from "lucide-react";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import ReactMarkdown from "react-markdown";

export default function Home() {
  const [code, setCode] = useState(
    'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, Java IDE!");\n    }\n}'
  );

  const [output, setOutput] = useState("Ready to compile and run.");
  const [isRunning, setIsRunning] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState("Run");
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);

  const [chatMessages, setChatMessages] = useState<{role: string, content: string, hidden?: boolean}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);

  const handleRunCode = async () => {
    setIsRunning(true);
    setOutput("Compiling...");
    setActiveBottomTab("Run");
    setIsTerminalOpen(true);

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
        
        // Auto trigger chat: explicitly truncate code to max 2500 chars to avoid payload explosion
        const safeCode = code.length > 2500 ? code.substring(0, 2500) + "\n...[CODE TRUNCATED]..." : code;
        const errDump = data.error || data.output || "";
        const safeErr = errDump.length > 2500 ? errDump.substring(errDump.length - 2500) : errDump; // keep tail end of logs
        
        const prompt = `I just ran my code and got the following compiler/runtime error. Please explain ALL the specific errors to me individually:\n\nMy Code:\n\`\`\`java\n${safeCode}\n\`\`\`\n\nError Output:\n\`\`\`\n${safeErr}\n\`\`\``;
        
        // Strip out old hidden system traces from previous runs to save context size!
        const cleanHistory = chatMessages.filter(msg => !msg.hidden);
        const updatedMessages = [...cleanHistory, { role: "user", content: prompt, hidden: true }];
        setChatMessages(updatedMessages);
        fetchChatResponse(updatedMessages, code, data.error || data.output);
      }
    } catch (err: any) {
      setOutput(`Failed to run code: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const fetchChatResponse = async (newMessages: {role: string, content: string, hidden?: boolean}[], codeContext?: string, errorContext?: string) => {
    setIsChatting(true);
    try {
      const payload: any = { messages: newMessages };
      if (codeContext && errorContext) {
        payload.code = codeContext;
        payload.error_stack = errorContext;
      }
      
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (data.success) {
        setChatMessages([...newMessages, { role: "assistant", content: data.reply }]);
      } else {
        setChatMessages([...newMessages, { role: "assistant", content: `Error: ${data.error}` }]);
      }
    } catch (err) {
      console.error("Failed to fetch chat response", err);
    } finally {
      setIsChatting(false);
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

        {/* Left: Project Info */}
        <div className="flex items-center space-x-4">
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

        {/* Right: Layout Spacer */}
        <div className="flex items-center space-x-4 w-[36px]">
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden bg-[#1A1A1A]">
        <PanelGroup orientation="horizontal">
          <Panel defaultSize={75} minSize={30}>
            <PanelGroup orientation="vertical">
              <Panel defaultSize={isTerminalOpen ? 70 : 100} minSize={20}>
                <div className="flex flex-col h-full overflow-hidden bg-[#0D0D0D]">
                  {/* Editor Tabs */}
                  <div className="flex items-center h-10 bg-[#121212] border-b border-[#333333] shrink-0 pl-[1px]">
                    <div className="flex items-center h-full px-5 border-x border-[#333333] bg-[#1A1A1A] text-[#E0E0E0] text-[13px] font-medium relative group cursor-pointer hover:bg-[#222222] transition-colors min-w-36">
                      <span className="text-[#4DAAFB] font-bold mr-2.5 text-sm drop-shadow-sm">{"{ }"}</span>
                      Main.java
                      <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#4DAAFB] shadow-[0_0_4px_rgba(77,170,251,0.5)]"></div>
                    </div>
                    <div className="flex flex-1 items-center justify-end px-3">
                      <button onClick={handleRunCode} className="hover:bg-[#2A2A2A] p-1.5 rounded-md transition-colors" title="Run File">
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
                </div>
              </Panel>

              {isTerminalOpen && (
                <>
                  <PanelResizeHandle className="h-1 bg-[#333333] hover:bg-[#4DAAFB] transition-colors cursor-ns-resize z-20" />
                  <Panel defaultSize={30} minSize={10}>
                    <div className="h-full bg-[#141414] flex flex-col relative group">
                      {/* Tool Window Header */}
                      <div className="h-9 flex items-center justify-between px-2 bg-[#0F0F0F] border-b border-[#333333]">
                        <div className="flex items-center h-full">
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
                        {/* Close Terminal Button */}
                        <button 
                          onClick={() => setIsTerminalOpen(false)}
                          className="p-1 hover:bg-[#2A2A2A] rounded text-[#888888] hover:text-[#E0E0E0] transition-colors"
                          title="Hide Terminal"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex-1 p-4 overflow-auto bg-[#141414]">
                        <pre className="font-mono text-[13px] whitespace-pre-wrap leading-relaxed text-[#D4D4D4]">
                          <span className="text-[#7CB165] font-semibold">{`C:\\Program Files\\Java\\jdk\\bin\\java.exe Main`}</span>{"\n"}
                          {output}
                        </pre>
                      </div>
                    </div>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="w-1 bg-[#333333] hover:bg-[#4DAAFB] transition-colors cursor-ew-resize z-20" />

          <Panel defaultSize={25} minSize={15}>
            {/* Right Sidebar: AI Chatbot */}
            <div className="h-full flex flex-col bg-[#141414] shrink-0 border-l mb-0 border-[#333333]">
              <div className="h-10 flex items-center justify-between px-4 bg-[#0F0F0F] border-b border-[#333333] shrink-0 shadow-sm">
                <span className="text-[13px] font-medium text-[#E0E0E0] flex items-center">
                  <Brain className="w-4 h-4 mr-2 text-[#c678dd] drop-shadow-sm" />
                  CodeSense
                </span>
                {!isTerminalOpen && (
                  <button 
                    onClick={() => setIsTerminalOpen(true)}
                    className="flex items-center text-[11px] text-[#A0A0A0] hover:text-[#E0E0E0] transition-colors px-2 py-1 rounded bg-[#2A2A2A] border border-[#404040]"
                    title="Show Terminal"
                  >
                    <TerminalSquare className="w-3 h-3 mr-1" /> Term
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-auto p-4 scrollbar-thin scrollbar-thumb-[#404040] text-[13px] bg-[#1A1A1A] space-y-4">
                {chatMessages.filter(msg => !msg.hidden).length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-[#777777] space-y-4">
                    <Brain className="w-12 h-12 opacity-20" />
                    <p className="text-center px-4 leading-relaxed font-medium">
                      Run your code or say hi. I will assist you with any errors!
                    </p>
                  </div>
                ) : (
                  chatMessages.filter(msg => !msg.hidden).map((msg, idx) => (
                    <div key={idx} className={`p-3.5 rounded-lg shadow-sm transition-all ${msg.role === 'user' ? 'bg-[#2A2A2A] border border-[#404040] ml-6' : 'bg-[#18181A] border border-[#c678dd]/30 mr-6'}`}>
                      <h4 className={`text-[10px] uppercase tracking-wider mb-2 font-bold ${msg.role === 'user' ? 'text-[#888888]' : 'text-[#c678dd]'}`}>
                        {msg.role === 'user' ? 'You' : ''}
                      </h4>
                      <div className="text-[#E0E0E0] leading-relaxed break-words font-sans text-[13px]">
                        <ReactMarkdown
                          components={{
                            h1: ({node, ...props}) => <h1 className="text-base font-bold my-2 text-white" {...props} />,
                            h2: ({node, ...props}) => <h2 className="text-[14px] font-bold mt-4 mb-2 text-[#4DAAFB]" {...props} />,
                            h3: ({node, ...props}) => <h3 className="text-[13px] font-bold mt-3 mb-1 text-[#c678dd]" {...props} />,
                            p: ({node, ...props}) => <p className="mb-2 last:mb-0 text-[#cccccc]" {...props} />,
                            ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-3 space-y-1" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-3 space-y-1" {...props} />,
                            li: ({node, ...props}) => <li className="mb-0 text-[#cccccc]" {...props} />,
                            a: ({node, ...props}) => <a className="text-[#599e5e] hover:text-[#7CB165] hover:underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />,
                            strong: ({node, ...props}) => <strong className="font-semibold text-[#eeeeee]" {...props} />,
                            code: ({node, inline, ...props}: any) => 
                              inline 
                                ? <code className="bg-[#000] text-[#4DAAFB] px-1 py-0.5 rounded text-[11.5px] font-mono border border-[#333]" {...props} /> 
                                : <pre className="bg-[#000] p-2.5 rounded-md text-[11.5px] font-mono border border-[#333] overflow-x-auto shadow-inner mb-3 mt-1 text-[#D4D4D4]"><code {...props} /></pre>
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))
                )}
                {isChatting && (
                   <div className="p-3 rounded-md bg-[#141414] border border-[#c678dd]/30 mr-6 shadow-sm animate-pulse">
                      <div className="text-[#A0A0A0] flex items-center">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Thinking...
                      </div>
                   </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="p-3 bg-[#0F0F0F] border-t border-[#333333]">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!chatInput.trim() || isChatting) return;
                    const newMsg = { role: "user", content: chatInput };
                    const updatedMessages = [...chatMessages, newMsg];
                    setChatMessages(updatedMessages);
                    setChatInput("");
                    fetchChatResponse(updatedMessages);
                  }}
                  className="flex items-center space-x-2"
                >
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about your code..."
                    className="flex-1 bg-[#1A1A1A] text-[13px] text-[#E0E0E0] px-3 py-2 border border-[#404040] rounded-[4px] focus:outline-none focus:border-[#4DAAFB] transition-colors placeholder-[#666666]"
                  />
                  <button 
                    type="submit"
                    disabled={isChatting || !chatInput.trim()}
                    className="bg-[#4DAAFB]/10 hover:bg-[#4DAAFB]/20 text-[#4DAAFB] p-2 rounded-[4px] transition-colors disabled:opacity-50 flex items-center justify-center border border-transparent hover:border-[#4DAAFB]/30"
                  >
                    <div className="w-[18px] h-[18px] flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </div>
                  </button>
                </form>
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
