import {isOfficialProfile} from '@/lib/official-profile.mjs';
/** The official account is identified by its exact wallet and reserved username. */
export function IdentityName({identity,fallback}:{identity?:{wallet:string;username:string}|null;fallback:string}){
 if(!isOfficialProfile(identity))return <>{fallback}</>;
 return <span className="official-profile-name">Grainpad<span className="official-profile-dot" aria-hidden="true"/></span>;
}
