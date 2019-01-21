window.isDesktopApp

window.ipcRenderer.send('startKernel', JSON.stringify({ messageId: '', image: '', port: 9999 }))
window.ipcRenderer.send('getKernel', JSON.stringify({ messageId: '', image: '' }))
window.ipcRenderer.send('getKernels', JSON.stringify({ messageId: '', status: 'running' }))
window.ipcRenderer.send('stopKernel', JSON.stringify({ messageId: '', kernelId: '' }))


window.ipcRenderer.on('commandResult', (event, msg) => {
  // status: ok, error, exited
  // type: startKernel, getKernel, getKernels, stopKernel

  // normal message
  const { messageId, type, status, payload: { text } } = JSON.parse(msg)

  // getKernel
  const { messageId, type, status, payload: { kernel: { id, status, image, port } } } = JSON.parse(msg)

  // getKernels
  const { messageId, type, status, payload: { kernels: [] } } = JSON.parse(msg)
})