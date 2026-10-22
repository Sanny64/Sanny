export {};

declare global {
  interface ViteTypeOptions {
    strictImportMetaEnv: unknown;
  }

  interface ImportMetaEnv {
    readonly VITE_API_URL: string;
  }
}
