'use client';
import Image from 'next/image';
import {IdentityName} from './identity-name';
import {isOfficialProfile} from '@/lib/official-profile.mjs';
import {shortAddress} from '@/lib/price-format';
import {safeAvatarPath} from '@/lib/wallet-identity.mjs';

export type IdentityCard={wallet:string;username:string;displayName:string;avatar:string|null;xVerified:boolean;xUsername:string|null};

export function UserAvatar({src,label,size=28}:{src?:string|null;label:string;size?:number}){
 const safe=safeAvatarPath(src||'');
 const letter=(label.replace(/^@/,'')||'?').slice(0,1).toUpperCase();
 if(safe)return <Image unoptimized className="user-avatar" src={safe} alt="" width={size} height={size}/>;
 return <span className="user-avatar is-fallback" style={{width:size,height:size}} aria-hidden="true">{letter}</span>;
}

/** One wallet renderer: a profile when one exists, otherwise the shortened address. */
export function UserIdentity({wallet,identity,creator=false,compact=false}:{wallet:string;identity?:IdentityCard|null;creator?:boolean;compact?:boolean}){
 const href=identity?`/u/${identity.username}`:`/creator/${wallet}`;
 const primary=identity?compact?`@${identity.username}`:identity.displayName||`@${identity.username}`:shortAddress(wallet);
 return <a className="user-identity" href={href} title={wallet}>
  <UserAvatar src={identity?.avatar} label={primary} size={compact?22:28}/>
  <span className="user-identity-name"><IdentityName identity={identity} fallback={primary}/></span>
  {identity&&!compact&&identity.displayName&&!isOfficialProfile(identity)?<span className="user-identity-handle">@{identity.username}</span>:null}
  {creator?<span className="user-identity-badge">Creator</span>:null}
  {identity?.xVerified?<span className="user-identity-badge" title={identity.xUsername?`Verified X @${identity.xUsername}`:'Verified X'}>𝕏{!compact&&identity.xUsername?` @${identity.xUsername}`:''}</span>:null}
 </a>;
}

export function UserProfileLink(props:{wallet:string;identity?:IdentityCard|null;creator?:boolean;compact?:boolean}){return <UserIdentity {...props}/>;}
