const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const readline = require('readline')

let goProcess = null
let mainWindow = null
let backendPort = null

// ─── Config & Key ─────────────────────────────────────────────────────────────

const configFile = () => path.join(app.getPath('userData'), 'config.json')
const keyFile    = () => path.join(app.getPath('userData'), 'db.key.enc')

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')) }
  catch { return {} }
}

function saveConfig(cfg) {
  fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2), 'utf8')
}

function loadKey() {
  try {
    return safeStorage.decryptString(fs.readFileSync(keyFile()))
  } catch {
    return null
  }
}

function saveKey(key) {
  fs.writeFileSync(keyFile(), safeStorage.encryptString(key))
}

function isConfigured() {
  const cfg = loadConfig()
  return !!(cfg.dbPath && fs.existsSync(keyFile()))
}

// ─── Go backend ───────────────────────────────────────────────────────────────

function goBinPath() {
  const bin = process.platform === 'win32' ? 'server.exe' : 'server'
  return app.isPackaged
    ? path.join(process.resourcesPath, bin)
    : path.join(__dirname, 'bin', bin)
}

// Path to the built React SPA — used for the setup flow (before Go starts).
function spaIndexPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'web', 'dist', 'index.html')
    : path.join(__dirname, '..', 'web', 'dist', 'index.html')
}

function startBackend(dbPath, dbKey) {
  // Kill any tracked backend from a previous attempt
  if (goProcess) { goProcess.kill(); goProcess = null }

  return new Promise((resolve, reject) => {
    const env = { ...process.env, DB_PATH: dbPath, DB_KEY: dbKey, PORT: '0' }
    goProcess = spawn(goBinPath(), [], { env, stdio: ['ignore', 'pipe', 'pipe'] })

    let stderr = ''
    let exitCode = null
    let exitSignal = null
    let resolved = false

    const rl = readline.createInterface({ input: goProcess.stdout })
    rl.on('line', line => {
      console.log('[go]', line)
      if (!resolved && line.includes('Server running on')) {
        const m = line.match(/:(\d+)/)
        resolved = true
        resolve(m ? parseInt(m[1], 10) : 8080)
      }
    })

    goProcess.stderr.on('data', d => { stderr += d.toString() })
    goProcess.on('error', reject)
    goProcess.on('exit', (code, signal) => { exitCode = code; exitSignal = signal })
    goProcess.on('close', () => {
      if (resolved) return
      const detail = stderr.trim() || (exitSignal ? `killed by signal ${exitSignal}` : `exited with code ${exitCode}`)
      reject(new Error(detail))
    })
  })
}

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow({ width, height, resizable, minWidth, minHeight } = {}) {
  mainWindow = new BrowserWindow({
    width:     width     ?? 1280,
    height:    height    ?? 800,
    resizable: resizable ?? true,
    minWidth:  minWidth  ?? undefined,
    minHeight: minHeight ?? undefined,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e2029',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
}

// ─── Startup ──────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  if (!isConfigured()) {
    // Load the React SPA directly from disk — Go is not running yet.
    // The SPA detects !configured via window.electronAPI.getConfig() and shows SetupView.
    createWindow({ width: 520, height: 640, resizable: false })
    mainWindow.loadFile(spaIndexPath())
  } else {
    try {
      const cfg = loadConfig()
      const key = loadKey()
      backendPort = await startBackend(cfg.dbPath, key)
      createWindow({ minWidth: 900, minHeight: 600 })
      mainWindow.loadURL(`http://localhost:${backendPort}`)
    } catch (err) {
      dialog.showErrorBox('Failed to start backend', err.message)
      app.quit()
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (isConfigured() && backendPort) {
        createWindow({ minWidth: 900, minHeight: 600 })
        mainWindow.loadURL(`http://localhost:${backendPort}`)
      } else {
        createWindow({ width: 520, height: 640, resizable: false })
        mainWindow.loadFile(spaIndexPath())
      }
    }
  })
})

app.on('window-all-closed', () => {
  goProcess?.kill()
  app.quit()
})

// ─── IPC ──────────────────────────────────────────────────────────────────────

// Native folder picker — used by SetupView (new db) and SettingsView
ipcMain.handle('pick-db-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a folder for the database',
    defaultPath: app.getPath('documents'),
    buttonLabel: 'Select Folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  return canceled ? null : filePaths[0]
})

// Native file picker — used by SetupView (open existing db)
ipcMain.handle('pick-db-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open existing database',
    defaultPath: app.getPath('documents'),
    buttonLabel: 'Open',
    filters: [{ name: 'SQLite database', extensions: ['db'] }],
    properties: ['openFile'],
  })
  return canceled ? null : filePaths[0]
})

// First-run setup: start Go first, then save config + key only on success.
// Accepts either dbFolder (new db) or dbPath (existing db).
ipcMain.handle('complete-setup', async (_e, { dbFolder, dbPath: existingPath, encryptionKey }) => {
  const dbPath = existingPath ?? path.join(dbFolder, 'blood_tests.db')

  try {
    backendPort = await startBackend(dbPath, encryptionKey)
  } catch (err) {
    return { ok: false, error: err.message }
  }

  // Backend started — now it's safe to persist credentials
  saveKey(encryptionKey)
  saveConfig({ dbPath })

  // Resize the setup window to main app dimensions and navigate in-place
  mainWindow.setResizable(true)
  mainWindow.setMinimumSize(900, 600)
  mainWindow.setSize(1280, 800)
  mainWindow.loadURL(`http://localhost:${backendPort}`)
  return { ok: true }
})

// Reset — delete saved config + key, kill Go, restart to setup screen
ipcMain.handle('reset-config', () => {
  goProcess?.kill()
  goProcess = null
  try { fs.unlinkSync(configFile()) } catch {}
  try { fs.unlinkSync(keyFile()) } catch {}
  mainWindow.setResizable(false)
  mainWindow.setSize(520, 640)
  mainWindow.loadFile(spaIndexPath())
})

// Config status — used by the React app to decide whether to show SetupView
ipcMain.handle('get-config', () => {
  const cfg = loadConfig()
  return {
    configured: isConfigured(),
    dbPath:     cfg.dbPath ?? null,
    keySet:     fs.existsSync(keyFile()),
  }
})

// Change encryption key — saves new key and restarts Go.
// Note: key rotation (re-encrypting existing data with a new key) must be
// handled inside Go before this call is reliable on an existing database.
ipcMain.handle('change-key', async (_e, { newKey }) => {
  const cfg = loadConfig()
  if (!cfg.dbPath) return { ok: false, error: 'No database configured' }

  saveKey(newKey)
  goProcess?.kill()
  try {
    await startBackend(cfg.dbPath, newKey)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})
