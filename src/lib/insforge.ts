import { createClient } from "@insforge/sdk";

const baseUrl = import.meta.env.VITE_INSFORGE_URL as string | undefined;
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY as string | undefined;

if (!baseUrl || !anonKey) {
  throw new Error(
    "Missing InsForge configuration. Set VITE_INSFORGE_URL and VITE_INSFORGE_ANON_KEY in .env.local."
  );
}

export const insforge = createClient({ baseUrl, anonKey });
