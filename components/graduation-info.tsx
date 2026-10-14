import {graduationTiming} from '@/lib/token-time';
import type {TradingVenue} from '@/lib/trading-venue';
/** Replaces the full progress bar once a token has graduated. Cards and the token page both render this.
 * Missing or unreliable timestamps drop only the value they feed; nothing is inferred from the 100% progress figure. */
export function GraduationInfo({launchedAt,graduatedAt,now,venue,linkVenue=false}:{launchedAt?:unknown;graduatedAt?:unknown;now:number;venue:TradingVenue|null;linkVenue?:boolean}){
 const timing=graduationTiming({launchedAt,graduatedAt,now});
 const destination=venue&&(linkVenue&&venue.href?<a href={venue.href} target="_blank" rel="noreferrer">Trading on {venue.label}</a>:<>Trading on {venue.label}</>);
 return <div className="gx-grad-info" aria-label={timing.exact?`Graduated ${timing.exact}`:'Graduated'}>
  <p className="gx-grad-title">{timing.duration?<>Graduated in <strong>{timing.duration}</strong></>:'Graduated'}</p>
  {(timing.ago||destination)&&<p className="gx-grad-sub gx-mono">{timing.ago&&<time dateTime={timing.iso??undefined} title={timing.exact??undefined}>{timing.ago}</time>}{timing.ago&&destination&&' · '}{destination}</p>}
 </div>;
}
