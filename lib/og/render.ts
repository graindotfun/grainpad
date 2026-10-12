import satori from 'satori';
import {Resvg,initWasm} from '@resvg/resvg-wasm';
import resvgModule from '@resvg/resvg-wasm/index_bg.wasm?module';
import type {ReactNode} from 'react';
/** PNG share-card renderer for Workers: satori lays out, resvg rasterizes. Both wasm binaries are compiled modules. */
let ready:Promise<void>|null=null;
function init(){ready??=initWasm(resvgModule).catch(error=>{ready=null;throw error;});return ready;}
export async function renderPng(element:ReactNode,{width,height,fonts}:{width:number;height:number;fonts:Parameters<typeof satori>[1]['fonts']}){
 await init();
 const svg=await satori(element,{width,height,fonts});
 return new Resvg(svg,{fitTo:{mode:'width',value:width}}).render().asPng();
}
