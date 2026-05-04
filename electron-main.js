const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("fs/promises");
const path = require("path");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 760,
    minHeight: 540,
    backgroundColor: "#111015",
    title: "Radio Ghost",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile("index.html");
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("audio:save", async (_event, payload) => {
  const { bytes, extension } = payload;
  const safeExtension = extension === "mp3" ? "mp3" : "wav";

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export audio",
    defaultPath: `radio-ghost-export.${safeExtension}`,
    filters: [
      { name: safeExtension.toUpperCase(), extensions: [safeExtension] },
      { name: "All files", extensions: ["*"] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await fs.writeFile(result.filePath, Buffer.from(bytes));
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle("audio:open", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import audio to Radio Ghost",
    properties: ["openFile"],
    filters: [
      { name: "Audio files", extensions: ["wav", "mp3"] },
      { name: "WAV", extensions: ["wav"] },
      { name: "MP3", extensions: ["mp3"] },
      { name: "All files", extensions: ["*"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const bytes = await fs.readFile(filePath);
  const extension = path.extname(filePath).toLowerCase().replace(".", "");
  const mimeType = extension === "mp3" ? "audio/mpeg" : "audio/wav";

  return {
    canceled: false,
    filePath,
    fileName: path.basename(filePath),
    mimeType,
    bytes: Array.from(bytes)
  };
});
