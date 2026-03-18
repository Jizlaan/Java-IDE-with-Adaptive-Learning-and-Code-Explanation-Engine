import { NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(req: Request) {
  try {
    const { code } = await req.json();
    if (!code) {
      return NextResponse.json({ success: false, error: "No code provided" });
    }

    // Try to find the public class name to name the file
    const match = code.match(/public\s+class\s+([A-Za-z0-9_]+)/);
    const className = match ? match[1] : "Main";
    const fileName = `${className}.java`;

    // Create a unique temporary directory
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "java-ide-"));
    const filePath = path.join(tempDir, fileName);

    await fs.writeFile(filePath, code);

    try {
      // 1. Compile
      await execAsync(`javac ${fileName}`, { cwd: tempDir, timeout: 5000 });
      
      // 2. Run
      const { stdout, stderr } = await execAsync(`java ${className}`, { cwd: tempDir, timeout: 5000 });
      
      // Clean up
      await fs.rm(tempDir, { recursive: true, force: true });
      
      return NextResponse.json({ 
        success: true, 
        output: stdout || "Program finished with no output.", 
        error: stderr 
      });
      
    } catch (err: any) {
      // Clean up on error
      await fs.rm(tempDir, { recursive: true, force: true });
      
      return NextResponse.json({
        success: false,
        output: err.stdout || "",
        error: err.stderr || err.message || "Compilation or runtime error"
      });
    }

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Internal server error" });
  }
}
