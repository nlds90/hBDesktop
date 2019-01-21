// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { exec, spawn } = require('child_process')

let dockerPath = '/usr/local/bin/docker'

function loadDockerPath () {
  exec('which docker', (err, stdout) => {
    if (err) return console.log(err)
    dockerPath = stdout.trim();
  })
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      allowRunningInsecureContent: true,
    }
  })

  mainWindow.loadURL('http://pin-staging.hasbrain.com')

  // Open the DevTools.
  mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
}

function runCommand({ messageId, type, cmd, transform = (c) => ({ text: c.trim() }), captureOutput = true }) {
  if (!messageId || !cmd) return

  let cb = null
  if (captureOutput) cb = (err, stdout) => {
    const result = { messageId, status: 'ok', type }

    if (err) {
      result.status = 'error'
      result.errMsg = err.message
    } else {
      result.payload = transform(stdout)
    }

    mainWindow.webContents.send('commandResult', JSON.stringify(result))
  }

  exec(cmd, cb)
}

function spawnCommand({ messageId, type, cmd, params, detached = false, stdio = 'pipe', unref = false }) {
  if (!messageId || !cmd) return

  const subprocess = spawn(cmd, params, { detached, stdio })

  subprocess.on('error', (err) => {
    mainWindow.webContents.send('commandResult', JSON.stringify({
      messageId, type, status: 'error', errMsg: err.message,
    }))
  })

  subprocess.on('close', (code) => {
    mainWindow.webContents.send('commandResult', JSON.stringify({
      messageId, type, status: 'exited',
    }))
  })

  if (stdio !== 'ignore') {
    subprocess.stdout.on('data', (data) => {
      mainWindow.webContents.send('commandResult', JSON.stringify({
        messageId, type, status: 'ok', payload: { text: data.toString() }, channel: 'stdout',
      }))
    })

    subprocess.stderr.on('data', (data) => {
      mainWindow.webContents.send('commandResult', JSON.stringify({
        messageId, type, status: 'ok', payload: { text: data.toString() }, channel: 'stderr',
      }))
    })
  }

  if (unref) subprocess.unref()
}

function formatStatus(status) {
  if (!status) return 'pending'

  if (status.includes('Up')) {
    return 'running'
  } else if (status.includes('Exit')) {
    return 'exited'
  } else {
    return 'pending'
  }
}

function formatPort(port) {
  if (!port) return null

  const regex = /:(\d+)->/
  const matches = regex.exec(port)
  if (!matches) return null

  return matches[1]
}

// commandResult { messageId, status, payload: { text, kernel: { id, status, image, port }, kernels: [kernel] } }
const eventHandler = {
  startKernel: () => {
    ipcMain.on('startKernel', (event, msg) => {
      const { messageId, image = 'asia.gcr.io/hasbrain-notes/base-notebook', port = 9999 } = JSON.parse(msg)
      const params = ['run', '-p', `${port}:8888`, image]
      spawnCommand({ messageId, type: 'startKernel', cmd: dockerPath, params, detached: true, unref: true })
    })
  },

  getKernel: () => {
    ipcMain.on('getKernel', (event, msg) => {
      const { messageId, image = 'asia.gcr.io/hasbrain-notes/base-notebook' } = JSON.parse(msg)
      runCommand({
        messageId,
        type: 'getKernel',
        cmd: `${dockerPath} ps -a -f "ancestor=${image}" -n 1 --format '{{.ID}}|{{.Status}}|{{.Ports}}'`,
        transform: (c) => {
          const [id, status, port] = c.split(/\|/)
          return { kernel: { id, status: formatStatus(status), image, port: formatPort(port) } }
        },
      })
    })
  },

  getKernels: () => {
    ipcMain.on('getKernels', (event, msg) => {
      const { messageId, status = 'running' } = JSON.parse(msg)
      runCommand({
        messageId,
        type: 'getKernels',
        cmd: `${dockerPath} ps -a -f "status=${status}" --format '{{.ID}}|{{.Status}}|{{.Image}}|{{.Ports}}'`,
        transform: (c) => {
          const kernels = c.split('\n')

          return kernels.reduce((rs, n) => {
            if (!n) return rs
            const [id, status, image, port] = n.split(/\|/)
            rs.kernels.push({ id, status: formatStatus(status), image, port: formatPort(port) })
            return rs
          }, { kernels: [] })
        },
      })
    })
  },

  stopKernel: () => {
    ipcMain.on('stopKernel', (event, msg) => {
      const { messageId, kernelId } = JSON.parse(msg)
      if (!kernelId) return

      const cmd = `${dockerPath} stop ${kernelId}`
      runCommand({ messageId, type: 'stopKernel', cmd })
    })
  },
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  loadDockerPath()
  createWindow()

  ipcMain.on('runCommand', (event, msg) => {
    runCommand(JSON.parse(msg))
  })

  const keys = Object.keys(eventHandler)
  keys.forEach(k => eventHandler[k]())
})

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
