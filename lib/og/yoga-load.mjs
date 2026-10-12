/** Satori's yoga loader, without runtime WebAssembly compilation.
 * Workers refuse to compile wasm from bytes, so the binary arrives as a compiled module import.
 * lib/og/yoga.wasm is the exact binary embedded in the pinned yoga-layout (checked by tests). */
import loadYogaImpl from 'grainpad-yoga-binary';
import wrapAssembly from 'grainpad-yoga-wrap';
import yogaModule from './yoga.wasm?module';
export async function loadYoga(){
 return wrapAssembly(await loadYogaImpl({instantiateWasm(imports,receive){WebAssembly.instantiate(yogaModule,imports).then(instance=>receive(instance));return {};}}));
}
export * from 'grainpad-yoga-enums';
