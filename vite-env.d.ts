/// <reference types="vite/client" />
declare module '*.wasm?module' {const module: WebAssembly.Module; export default module;}
declare module 'grainpad-yoga-binary' {const load: (options?: Record<string, unknown>) => Promise<unknown>; export default load;}
declare module 'grainpad-yoga-wrap' {const wrap: (lib: unknown) => unknown; export default wrap;}
declare module 'grainpad-yoga-enums';
