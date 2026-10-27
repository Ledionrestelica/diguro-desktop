import { createContext, useContext, type ReactNode } from 'react';

/** True inside SettingsFrame, which already pads and centres the page. */
export const SettingsFrameContext = createContext(false);

/** Page wrapper for admin screens: padded on its own (platform admin), flush
 *  inside the settings frame. */
export function AdminPageBody({ children }: { children: ReactNode }) {
  const inSettings = useContext(SettingsFrameContext);
  return <div className={inSettings ? undefined : 'px-8 py-6'}>{children}</div>;
}
