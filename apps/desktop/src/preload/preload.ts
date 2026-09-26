/**
 * The preload script: exposes the bridge's functions (bridge.ts) to the page through the context
 * bridge, and nothing else. The page runs sandboxed, with no Node and no Electron.
 */
import { contextBridge, ipcRenderer } from "electron";

import { CHANNELS, type StorytreeBridge } from "../bridge.js";

const bridge: StorytreeBridge = {
  listProjects: () => ipcRenderer.invoke(CHANNELS.listProjects) as Promise<string[]>,
  projectTree: (name) => ipcRenderer.invoke(CHANNELS.projectTree, name) as ReturnType<StorytreeBridge["projectTree"]>,
  changesSince: (name, cursor) => ipcRenderer.invoke(CHANNELS.changesSince, name, cursor) as ReturnType<StorytreeBridge["changesSince"]>,
  linesSince: (name, cursor) => ipcRenderer.invoke(CHANNELS.linesSince, name, cursor) as ReturnType<StorytreeBridge["linesSince"]>,
};

contextBridge.exposeInMainWorld("storytree", bridge);
