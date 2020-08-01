const { ipcRenderer } = require('electron')

async function loadMapsetFolder() {

  const data = await ipcRenderer.invoke('verify-mapset')
  console.log(data)
}