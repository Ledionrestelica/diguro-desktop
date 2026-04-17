import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * OS-keychain-backed token storage for the Better-Auth bearer token.
 * We persist an encrypted blob next to the app's userData dir; safeStorage
 * handles the keychain binding for us (Keychain on macOS, DPAPI on Windows,
 * libsecret on Linux).
 */
const tokenFile = () => path.join(app.getPath('userData'), 'auth.token');

function readToken(): string | null {
  const file = tokenFile();
  if (!fs.existsSync(file)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buf = fs.readFileSync(file);
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  const file = tokenFile();
  if (token == null) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption is not available on this platform');
  }
  const encrypted = safeStorage.encryptString(token);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encrypted);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle('auth:get-token', () => readToken());
  ipcMain.handle('auth:set-token', (_e, token: string | null) => {
    writeToken(token);
    return true;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
