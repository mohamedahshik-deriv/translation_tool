// Stub module to prevent pdfjs-dist from trying to import its optional
// native canvas module in the browser environment.
// Referenced in vite.config.ts resolve.alias: { canvas: './src/lib/canvas-stub.js' }
export default {};
