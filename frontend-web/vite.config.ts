import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// allowedHosts: permite abrir el sitio desde GitHub Codespaces / túneles
export default defineConfig({ plugins: [react()], server: { host: true, port: 5173, allowedHosts: true }, preview: { host: true, port: 5173, allowedHosts: true } });
