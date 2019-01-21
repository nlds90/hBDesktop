const { ipcRenderer } = require('electron');

function init() {
    // add global variables to your web page
    window.isDesktopApp = true
    window.ipcRenderer = ipcRenderer
}

init();