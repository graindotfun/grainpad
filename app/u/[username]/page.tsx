import {SiteFooter} from '@/components/site-footer';
import {notFound,redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {SiteHeader} from '@/components/site-header';
import {TokenImage} from '@/components/token-image';
import {CopyText} from '@/components/copy-text';
import {UserAvatar} from '@/components/user-identity';
import {IdentityName} from '@/components/identity-name';
import {database} from '@/lib/server-owner';
import {clientKey} from '@/lib/client-key.mjs';
import {consumeRequestBudget} from '@/lib/abuse-budget.mjs';
import {grainpadPlatformId} from '@/lib/platform-policy';
import {lookupUsername,readPublicIdentity,safeAvatarPath} from '@/lib/wallet-identity.mjs';
import {FamePanel} from '@/components/fame-panel';
import {fameSummary} from '@/lib/wallet-fame.mjs';
const eventLabels:Record<string,string>={launch:'Launched a token',need:'Posted a task',submission:'Submitted work',update:'Project update',credit:'Gave credit',approve:'Approved work',payment:'Recorded a payment',budget:'Set a budget',close:'Closed a task','declare-buy':'Declared a creator buy'};
type ProfileEvent={id:string;mint:string;title:string;kind:string;createdAt:number;tokenName?:string;symbol?:string;image?:string};
const dateLabel=(value:number|string)=>new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{username:string}>}){
 const name=lookupUsername((await params).username);
 return {title:name?`@${name} · grainpad`:'Profile · grainpad',robots:name?undefined:{index:false,follow:false}};
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
 if(limited)return <main className="shell product-page"><SiteHeader/><p className="feedback error" role="alert">Too many profile requests.</p><SiteFooter/></main>;
 if(!view)notFound();
 if(view.redirect)redirect(`/u/${view.redirect}`);
 const profile=view.profile;
 if(!profile)notFound();
 const avatar=safeAvatarPath(profile.avatar);
 const fame=await fameSummary(database(),profile.wallet).catch(()=>({target:profile.wallet,score:0,up:0,down:0,viewer:null}));
 return <main className="shell product-page profile-page"><SiteHeader/>
  <section className="profile-intro" aria-label="Public profile">
   <div className="profile-identity"><UserAvatar src={avatar} label={profile.displayName||profile.username} size={96}/><div className="profile-name"><div className="profile-name-line"><h1><IdentityName identity={profile} fallback={profile.displayName||profile.username}/></h1>{profile.xVerified&&profile.xUsername?<a className="profile-x" href={`https://x.com/${profile.xUsername}`} target="_blank" rel="noreferrer" aria-label={`Verified X account @${profile.xUsername}`}><span aria-hidden="true">𝕏</span> @{profile.xUsername}</a>:null}</div><p className="profile-handle">@{profile.username}</p><p className="profile-joined">Joined {dateLabel(profile.createdAt)}</p></div></div>
   {profile.bio?<p className="profile-bio">{profile.bio}</p>:null}
   <div className="profile-bottom"><div className="profile-wallet"><span className="address-line" title={profile.wallet}>{profile.wallet.slice(0,6)}…{profile.wallet.slice(-6)}</span><CopyText value={profile.wallet} label="Copy wallet"/><a className="profile-link" href={`/creator/${profile.wallet}`}>Creator record</a></div><FamePanel target={profile.wallet} initial={fame}/></div>
  </section>
  <section className="profile-section" aria-labelledby="profile-created"><div className="profile-section-heading"><h2 id="profile-created">created <span>{view.created.length}</span></h2></div>{view.created.length?<div className="profile-tokens">{view.created.map((token:{mint:string;name:string;symbol:string;image?:string;createdAt:string})=><article className="profile-token" key={token.mint}><a className="profile-token-main" href={`/token/${token.mint}`}><TokenImage src={token.image} symbol={token.symbol} size={88}/><div><h3>{token.name}</h3><p>${token.symbol}</p><span>Launched {dateLabel(token.createdAt)}</span></div></a><div className="profile-token-actions"><a href={`/token/${token.mint}`}>View market</a><a href={`/token/${token.mint}/room`}>Open room</a></div></article>)}</div>:<p className="profile-empty">No launches yet.</p>}</section>
  <div className="profile-columns"><section className="profile-section" aria-labelledby="profile-rooms"><div className="profile-section-heading"><h2 id="profile-rooms">rooms <span>{view.rooms.length}</span></h2></div>{view.rooms.length?<ul className="profile-rooms">{view.rooms.map((event:ProfileEvent)=><li key={event.mint}><a href={`/token/${event.mint}/room`}><TokenImage src={event.image} symbol={event.symbol||'?'} size={52}/><div><h3>{event.tokenName||'Project room'}</h3><p>{event.title||eventLabels[event.kind]||'Room activity'}</p><span>{eventLabels[event.kind]||'Participated'}</span></div></a></li>)}</ul>:<p className="profile-empty">No room activity yet.</p>}</section>
  <section className="profile-section" aria-labelledby="profile-activity"><div className="profile-section-heading"><h2 id="profile-activity">activity</h2></div>{view.activity.length?<ol className="profile-timeline">{view.activity.map((event:ProfileEvent)=><li key={event.id}><div className={`profile-event-dot${event.kind==='launch'?' is-launch':''}`}/><div><p className="profile-event-label">{eventLabels[event.kind]||'Room activity'}</p><a href={`/token/${event.mint}${event.kind==='launch'?'':'/room'}`}>{event.title||event.tokenName||'Project room'}</a>{event.tokenName&&event.title!==event.tokenName?<span className="profile-event-project">{event.tokenName}</span>:null}<time dateTime={new Date(event.createdAt).toISOString()}>{dateLabel(event.createdAt)}</time></div></li>)}</ol>:<p className="profile-empty">No activity yet.</p>}</section></div>
 <SiteFooter/></main>;
}
