'use client';
import {useEffect,useState} from 'react';
import {PREVIOUS_TOKEN_BANNER} from '@/lib/previous-official-mints.mjs';
export function PreviousTokenBanner(){
 const [href,setHref]=useState('');
 useEffect(()=>{let current=true;fetch('/api/token',{cache:'no-store'}).then(response=>response.json()).then(body=>{const token=(body as {token?:{mint?:string}}).token;if(current&&token?.mint)setHref(`/token/${token.mint}`);}).catch(()=>{});return ()=>{current=false;};},[]);
 return <p className="setup-note" role="status">{PREVIOUS_TOKEN_BANNER}{href?<> <a href={href}>Current official token</a></>:null}</p>;
}
