import { contextBridge, ipcRenderer, webUtils } from 'electron';

const invoke = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);
const on = (ch) => (cb) => ipcRenderer.on(ch, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('izsiz', {
  getSettings: invoke('settings:get'),
  setSettings: invoke('settings:set'),
  pickFiles: invoke('files:pick'),
  pickFolder: invoke('folder:pick'),
  pickOutDir: invoke('outdir:pick'),
  expand: invoke('files:expand'),
  clean: invoke('file:clean'),
  save: invoke('file:save'),
  show: invoke('file:show'),
  cleanText: invoke('text:clean'),
  readClipboard: invoke('clipboard:read'),
  writeClipboard: invoke('clipboard:write'),
  ready: invoke('renderer:ready'),
  contextMenuStatus: invoke('contextmenu:status'),
  setContextMenu: invoke('contextmenu:set'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onExternalPaths: on('external-paths'),
  onClipboardCleaned: on('clipboard-cleaned'),
  onSettings: on('settings'),
});
