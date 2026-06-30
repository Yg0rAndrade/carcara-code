import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// base: './' -> caminhos relativos, pro Electron carregar via file://
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  // minify desligado: evita um bug do minificador que quebrava o mount do React.
  // Num app local de desktop o tamanho do bundle não importa.
  build: { outDir: 'dist', emptyOutDir: true, minify: false },
  server: { port: 5234, strictPort: true },
  test: {
    environment: 'node',
    exclude: ['node_modules/**', 'release/**', 'dist/**'],
  },
});
