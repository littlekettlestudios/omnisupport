import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';

const shared = { '@shared': resolve(__dirname, 'src/shared') };

export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: {
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          bubble: resolve(__dirname, 'src/preload/bubble.ts'),
          picker: resolve(__dirname, 'src/preload/picker.ts'),
        },
      },
    },
  },
  renderer: {
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: {
          companion: resolve(__dirname, 'src/renderer/companion/index.html'),
          bubble: resolve(__dirname, 'src/renderer/bubble/index.html'),
          picker: resolve(__dirname, 'src/renderer/picker/index.html'),
        },
      },
    },
  },
});
