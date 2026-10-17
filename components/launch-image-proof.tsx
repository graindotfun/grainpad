'use client';
import {useEffect,useState} from 'react';
import {Button} from './ui/button';
type ImageProof={verified:boolean;notice:string;image?:{sha256:string;bytes:number};monero?:{expiresAt:number};archive?:{storage:string}};
type Identity={network:'mainnet-beta'|'robinhood:mainnet';token:string};
export function LaunchImageProof(props:Identity){return <ImageProofView key={props.network+':'+props.token} {...props}/>;}
function ImageProofView({network,token}:Identity){
 const [saved,setSaved]=useState<{query:string;value:ImageProof}|null>(null),[revision,setRevision]=useState(0),[expired,setExpired]=useState(false);
 const query=new URLSearchParams({network,token}).toString();
 useEffect(()=>{const controller=new AbortController();
  fetch('/api/launch-image?'+query,{cache:'no-store',signal:controller.signal}).then(r=>r.json()).then(value=>{if(!controller.signal.aborted){const result=value as ImageProof;setExpired(!!result.monero&&result.monero.expiresAt<=Date.now());setSaved({query,value:result});}}).catch(()=>{if(!controller.signal.aborted)setSaved({query,value:{verified:false,notice:'Image verification is unavailable. Retry later.'}});});
  return()=>controller.abort();
 },[query,revision]);
 const proof=saved?.query===query?saved.value:null;
 useEffect(()=>{if(!proof?.monero?.expiresAt)return;const timer=setTimeout(()=>setExpired(true),Math.max(0,proof.monero.expiresAt-Date.now()));return()=>clearTimeout(timer);},[proof]);
 const verified=proof?.verified&&!expired&&!!proof.monero;
 return <section className="panel product-panel" aria-label="Original launch image"><p className="eyebrow">IMAGE / LAUNCH RECORD</p><h2>{verified?'Original launch image verified':'Original launch image'}</h2><p role="status">{expired?'Refresh to check current Monero verification.':proof?.notice??'Checking the original image and its Monero commitment…'}</p>{verified&&<><p className="small muted">The image file matches the fingerprint in the launch metadata. Monero holds the commitment; the image bytes are stored separately.</p><p className="address-line">SHA-256: {proof?.image?.sha256}</p><p className="small muted">{proof?.archive?.storage}</p><a className="token-chip" href={'/api/launch-image?'+query+'&download=1'}>Download image + verification archive</a></>}<Button variant="outline" disabled={!proof} onClick={()=>{setSaved(null);setExpired(false);setRevision(n=>n+1);}}>Refresh image verification</Button></section>;
}
