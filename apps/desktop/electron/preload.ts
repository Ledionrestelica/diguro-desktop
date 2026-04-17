import { contextBridge, ipcRenderer } from 'electron';

/**
 * Bridge the minimum surface needed by the renderer — token get/set only.
 * The renderer never touches the filesystem or Node APIs directly.
 */
contextBridge.exposeInMainWorld('diguro', {
  auth: {
    getToken: (): Promise<string | null> => ipcRenderer.invoke('auth:get-token'),
    setToken: (token: string | null): Promise<boolean> =>
      ipcRenderer.invoke('auth:set-token', token),
  },
});
