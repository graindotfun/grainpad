/* eslint-disable @next/next/no-img-element -- Immutable hash-addressed token artwork is served directly by grainpad. */
import {mainnetDisplayImage} from "@/lib/chain/robinhood-mainnet-display.ts";
import type {MainnetLaunchRecord} from "@/lib/chain/robinhood-mainnet-registration.ts";
export function RobinhoodMainnetIdentity({record}:{record:MainnetLaunchRecord}) {
  const display=record.display?.metadata;if(!display)return null;
  const image=mainnetDisplayImage(display);
  return <section className="panel rh-token-identity" aria-label="Creator-signed token identity">
    {image&&<img src={image} alt={record.name+" token artwork"} width={112} height={112}/>}
    <div>{display.description&&<p>{display.description}</p>}<div className="download-links">{display.website&&<a href={display.website} target="_blank" rel="noopener noreferrer">Website ↗</a>}{display.twitter&&<a href={display.twitter} target="_blank" rel="noopener noreferrer">X / Twitter ↗</a>}{display.telegram&&<a href={display.telegram} target="_blank" rel="noopener noreferrer">Telegram ↗</a>}</div><p className="small muted">Image and description signed by the creator. Stored by grainpad.</p></div>
  </section>;
}
