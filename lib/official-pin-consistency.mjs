/** Launch pins, the rewards deployment and launch verification must name one official identity.
 * All unset is the closed production state. A caller's verifyLaunch override is not a pin. */
import {PublicKey} from '@solana/web3.js';
import {QUOTES} from './quote-assets.mjs';
import {OFFICIAL_ARTWORK} from './official-artwork.mjs';
import {isLaunchTaxBps} from './rewards-policy.mjs';
import {GRAINU_REHEARSAL_MINT} from './official-burn-evidence.mjs';
const ORIGIN='https://grainpad.fun';
export function assertOfficialIdentityPins({pins,deployment,expected}){
 if(expected?.name!=='Grainpad'||expected?.symbol!=='GRAIN'||expected?.origin!==ORIGIN)throw Error('Official identity name, symbol or origin changed.');
 if(expected?.imageHash!==OFFICIAL_ARTWORK.sha256)throw Error('Official artwork pin does not match the approved image.');
 if(expected?.twitter!=='https://x.com/GrainXMR')throw Error('Official X identity changed.');
 if(!deployment?.collector||deployment.collector!==expected?.collector)throw Error('Collector pins disagree.');
 const pinMint=pins?.mint??null,deploymentMint=deployment?.officialGrainMint??null,expectedMint=expected?.officialMint??null;
 if([pinMint,deploymentMint,expectedMint].some(Boolean)&&!(pinMint&&deploymentMint&&expectedMint&&pinMint===deploymentMint&&deploymentMint===expectedMint))throw Error('Official mint pins disagree across the launch pins, rewards deployment and launch verification.');
 if(pinMint){
  let key;try{key=new PublicKey(pinMint);}catch{throw Error('Official mint pin is not a public key.');}
  if(key.toBase58()!==pinMint||!PublicKey.isOnCurve(key.toBytes())||pinMint===GRAINU_REHEARSAL_MINT||pinMint===QUOTES.wXMR.mint)throw Error('Official mint pin is not a new GRAIN keypair.');
 }
 const pinTax=pins?.taxBps??null,expectedTax=expected?.taxBps??null;
 if((pinTax==null)!==(expectedTax==null)||(pinTax!=null&&pinTax!==expectedTax))throw Error('Official tax pins disagree.');
 if(pinTax!=null&&!isLaunchTaxBps(pinTax))throw Error('Official tax pin is outside the 1.0–3.0% launch grid.');
 const pinHash=pins?.metadataHash??null,expectedHash=expected?.metadataHash??null;
 if((pinHash==null)!==(expectedHash==null)||(pinHash!=null&&pinHash!==expectedHash))throw Error('Official metadata hash pins disagree.');
 if(pinHash!=null&&pins?.metadataUri!==`${ORIGIN}/api/assets/${pinHash}`)throw Error('Official metadata URI does not match the metadata hash pin.');
 if(deployment?.policyApproved===true&&(!deploymentMint||deploymentMint!==pinMint||deploymentMint!==expectedMint))throw Error('Approved rewards policy requires the matching official mint pin.');
}
