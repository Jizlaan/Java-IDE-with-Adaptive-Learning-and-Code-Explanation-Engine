const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const net = require("net");

const isDev = !app.isPackaged;

let mainWindow;
let serverProcess;

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // Don't show until ready
  });

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open File',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [{ name: 'Java Files', extensions: ['java'] }, { name: 'All Files', extensions: ['*'] }]
            });
            if (!canceled && filePaths.length > 0) {
              const content = fs.readFileSync(filePaths[0], 'utf-8');
              mainWindow.webContents.send('file-opened', { content, filePath: filePaths[0] });
            }
          }
        },
        {
          label: 'Save File',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('request-save');
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Run',
      submenu: [
        {
          label: 'Run Code',
          accelerator: 'F5', // Using F5 for Run
          click: () => {
            mainWindow.webContents.send('trigger-run');
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  mainWindow.maximize();
  mainWindow.show();

  if (isDev) {
    // Development mode
    serverProcess = spawn("npm", ["run", "dev"], {
      shell: true,
      stdio: "inherit", 
    });

    // We wait a few seconds before trying to load, or use wait-on
    mainWindow.loadURL("http://localhost:3000");
  } else {
    // Production mode
    const port = await findOpenPort();
    console.log("Starting Next.js server on port:", port);
    
    // server.js is located in .next/standalone
    // Inside the packaged app, __dirname is resources/app.asar/electron
    const serverPath = path.join(__dirname, "..", ".next", "standalone", "server.js");
    
    serverProcess = spawn("node", [serverPath], {
      env: {
        ...process.env,
        PORT: port.toString(),
        NODE_ENV: "production",
      },
      stdio: "inherit",
    });

    // Give the server a moment to start
    setTimeout(() => {
      mainWindow.loadURL(`http://localhost:${port}`);
    }, 1000);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.handle('save-file', async (event, content) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'Java Files', extensions: ['java'] }, { name: 'All Files', extensions: ['*'] }]
  });
  if (!canceled && filePath) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
