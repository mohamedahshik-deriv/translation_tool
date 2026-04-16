import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            // Prevent pdfjs-dist from trying to import its optional native canvas module
            canvas: path.resolve(__dirname, './src/lib/canvas-stub.js'),
        },
    },
    server: {
        port: 3000,
        headers: {
            // Required for SharedArrayBuffer used by @ffmpeg/ffmpeg (WASM)
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
        },
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
            },
        },
    },
    preview: {
        headers: {
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
        },
    },
    optimizeDeps: {
        // These use SharedArrayBuffer — must not be pre-bundled
        exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    build: {
        target: 'esnext',
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['react', 'react-dom'],
                    ui: ['framer-motion', 'lucide-react'],
                },
            },
        },
    },
});
