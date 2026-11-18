import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('quickNote', {
  save: (text: string) => ipcRenderer.invoke('quicknote:capture', text) as Promise<{ ok: true } | { ok: false; message: string }>,
  close: () => ipcRenderer.send('quicknote:close-self'),
})
