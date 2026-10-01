'use client';
import {useState} from 'react';
import {Button} from './ui/button';
export function CopyText({value,label}:{value:string;label:string}){
 const [copied,setCopied]=useState(false),[failed,setFailed]=useState(false);
 return <Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(value);setCopied(true);setFailed(false);setTimeout(()=>setCopied(false),1600);}catch{setFailed(true);}}}>{copied?'Copied':failed?'Copy unavailable':label}</Button>;
}
