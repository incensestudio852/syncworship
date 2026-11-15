/**
 * Cloudflare Workers can import WebAssembly as a module; wrangler's esbuild
 * pipeline turns it into a WebAssembly.Module at build time.
 */
declare module '*.wasm' {
  const mod: WebAssembly.Module;
  export default mod;
}
