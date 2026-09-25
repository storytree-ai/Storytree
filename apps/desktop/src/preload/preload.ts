/**
 * The preload script: exposes listProjects() and projectTree(name) to the page through the
 * context bridge, and nothing else. The page runs sandboxed, with no Node and no Electron.
 */
import { contextBridge, ipcRenderer } from "electron";

import { CHANNELS, type StorytreeBridge } from "../bridge.js";

const bridge: StorytreeBridge = {
  listProjects: () => ipcRenderer.invoke(CHANNELS.listProjects) as Promise<string[]>,
  projectTree: (name) => ipcRenderer.invoke(CHANNELS.projectTree, name) as ReturnType<StorytreeBridge["projectTree"]>,
};

contextBridge.exposeInMainWorld("storytree", bridge);
