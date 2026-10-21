/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REPO?: string;
  readonly VITE_VERSION?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}
