export interface DiguroBridge {
  auth: {
    getToken: () => Promise<string | null>;
    setToken: (token: string | null) => Promise<boolean>;
  };
}

declare global {
  interface Window {
    diguro: DiguroBridge;
  }
}
