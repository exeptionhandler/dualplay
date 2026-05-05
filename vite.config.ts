import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'import.meta.env.VITE_DISCORD_CLIENT_ID': JSON.stringify(process.env.DISCORD_CLIENT_ID || '')
  }
});
