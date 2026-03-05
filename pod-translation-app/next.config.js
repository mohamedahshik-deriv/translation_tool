/** @type {import('next').NextConfig} */
const nextConfig = {
    // Enable cross-origin isolation for FFmpeg.wasm (SharedArrayBuffer)
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    {
                        key: 'Cross-Origin-Embedder-Policy',
                        value: 'require-corp',
                    },
                    {
                        key: 'Cross-Origin-Opener-Policy',
                        value: 'same-origin',
                    },
                ],
            },
        ];
    },
    // Allow video files from Supabase storage
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '*.supabase.co',
            },
        ],
    },
    // Turbopack config (Next.js 16+ default bundler)
    // Empty config silences the webpack/turbopack mismatch warning
    turbopack: {},
    webpack: (config, { isServer }) => {
        // pdfjs-dist: ignore canvas (optional native dependency not needed in browser)
        config.resolve.alias = {
            ...config.resolve.alias,
            canvas: false,
        };

        // pdfjs-dist: prevent bundling the worker on the server side
        if (isServer) {
            config.externals = [...(config.externals || []), 'pdfjs-dist'];
        }

        return config;
    },
};

module.exports = nextConfig;
