import Image from "next/image";
import {Wallet as WalletGlyph} from "lucide-react";

/** Local marks for the known injected wallets; Wallet Standard entries use the image the wallet reports. */
function PhantomMark(){
 return <svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#ab9ff2"/><path d="M10 28V19a10 10 0 0 1 20 0v9c0 1.4-1.2 1.9-2.2 1.1l-2.3-1.8-2.5 2-2.5-2-2.5 2-2.5-2-2.3 1.8c-1 .8-2.2.3-2.2-1.1Z" fill="#fff"/><ellipse cx="17.2" cy="19.4" rx="1.5" ry="2.2" fill="#3c315b"/><ellipse cx="23.2" cy="19.4" rx="1.5" ry="2.2" fill="#3c315b"/></svg>;
}
function SolflareMark(){
 const rays=[0,45,90,135,180,225,270,315];
 return <svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#ffef46"/><g fill="#141414"><circle cx="20" cy="20" r="5.5"/>{rays.map(r=><rect key={r} x="19" y="7.5" width="2" height="5" rx="1" transform={`rotate(${r} 20 20)`}/>)}</g></svg>;
}

export function WalletLogo({brand,icon,size=40}:{brand:string;icon?:string|null;size?:number}){
 const key=brand.trim().toLowerCase();
 const mark=icon?<Image unoptimized src={icon} alt="" width={size} height={size} draggable={false}/>:key==='phantom'?<PhantomMark/>:key==='solflare'?<SolflareMark/>:<span className="wallet-logo-generic"><WalletGlyph size={Math.round(size*.5)}/></span>;
 return <span className="wallet-logo" style={{width:size,height:size}} aria-hidden="true">{mark}</span>;
}
