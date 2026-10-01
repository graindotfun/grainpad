import {notFound,redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {SiteHeader} from '@/components/site-header';
import {TokenImage} from '@/components/token-image';
import {CopyText} from '@/components/copy-text';
import {UserAvatar} from '@/components/user-identity';
import {database} from '@/lib/server-owner';
import {clientKey} from '@/lib/client-key.mjs';
import {consumeRequestBudget} from '@/lib/abuse-budget.mjs';
import {grainpadPlatformId} from '@/lib/platform-policy';
import {lookupUsername,readPublicIdentity,safeAvatarPath} from '@/lib/wallet-identity.mjs';
import {FamePanel} from '@/components/fame-panel';
import {fameSummary} from '@/lib/wallet-fame.mjs';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{username:string}>}){
 const name=lookupUsername((await params).username);
 return {title:name?`@${name} · Grainpad`:'Profile · Grainpad',robots:name?undefined:{index:false,follow:false}};
}
export default async function ProfilePage({params}:{params:Promise<{username:string}>}){
 const username=(await params).username;
 if(!lookupUsername(username))notFound();
 let view,limited=false;
 try{
  const db=database();
  const ip=clientKey((await headers()).get('cf-connecting-ip'));
  if(!await consumeRequestBudget(db,`identity:page:${ip}`,60))limited=true;
  else view=await readPublicIdentity(db,username,{platform:grainpadPlatformId().toBase58()});
 }catch{notFound();}
 if(limited)return <main className="shell product-page"><SiteHeader/><p className="feedback error" role="alert">Too many profile requests.</p></main>;
 if(!view)notFound();
 if(view.redirect)redirect(`/u/${view.redirect}`);
 const profile=view.profile;
 if(!profile)notFound();
 const avatar=safeAvatarPath(profile.avatar);
 const fame=await fameSummary(database(),profile.wallet).catch(()=>({target:profile.wallet,score:0,up:0,down:0,viewer:null}));
 return <main className="shell product-page"><SiteHeader/>
  <header className="product-title identity-header"><UserAvatar src={avatar} label={profile.displayName||profile.username} size={72}/><div><p className="eyebrow">GRAINPAD / PUBLIC IDENTITY</p><h1>{profile.displayName}</h1><p>@{profile.username}</p><p className="address-line">{profile.wallet}</p><p className="small muted">Joined {new Date(profile.createdAt).toLocaleDateString()}</p></div></header>
  <div className="product-actions"><CopyText value={profile.wallet} label="Copy wallet"/>{profile.xVerified&&profile.xUsername?<a className="token-chip" href={`https://x.com/${profile.xUsername}`} target="_blank" rel="noreferrer">Verified X @{profile.xUsername}</a>:null}<a className="token-chip" href={`/creator/${profile.wallet}`}>Creator record</a></div>
  <FamePanel target={profile.wallet} initial={fame}/>
  {profile.bio?<p className="identity-bio-text">{profile.bio}</p>:null}
  <p className="small muted">This page shows the public username and activity Grainpad already publishes: launches and public room records. It is not a social feed.</p>
  <section className="panel product-panel"><h2>Created</h2>{view.created.length?<div className="creator-projects">{view.created.map((token:{mint:string;name:string;symbol:string})=><article className="creator-project" key={token.mint}><TokenImage src="" symbol={token.symbol} size={42}/><h3>{token.name}</h3><p>${token.symbol}</p><a href={`/token/${token.mint}`}>Market</a></article>)}</div>:<p className="product-empty">No indexed Grainpad launches for this wallet.</p>}</section>
  <section className="panel product-panel"><h2>Rooms</h2>{view.rooms.length?<ul className="identity-activity">{view.rooms.map((event:{id:string;mint:string;title:string;kind:string})=><li key={event.id}><a href={`/token/${event.mint}/room`}>{event.title}</a><span>{event.kind}</span></li>)}</ul>:<p className="product-empty">No public room participation in the current record.</p>}</section>
  <section className="panel product-panel"><h2>Activity</h2>{view.activity.length?<ul className="identity-activity">{view.activity.map((event:{id:string;mint:string;title:string;kind:string;createdAt:number})=><li key={event.id}><a href={`/token/${event.mint}/room`}>{event.title||event.kind}</a><time>{new Date(event.createdAt).toLocaleString()}</time></li>)}</ul>:<p className="product-empty">No public room activity in the current record.</p>}</section>
 </main>;
}
