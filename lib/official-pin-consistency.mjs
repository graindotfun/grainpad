/** Launch pins, the rewards deployment and launch verification must name one official identity.
 * All unset is the closed production state. A caller's verifyLaunch override is not a pin. */
import {PublicKey} from '@solana/web3.js';
import {QUOTES} from './quote-assets.mjs';
import {OFFICIAL_ARTWORK} from './official-artwork.mjs';
import {isLaunchTaxBps} from './rewards-policy.mjs';
import {GRAINU_REHEARSAL_MINT} from './official-burn-evidence.mjs';
import {isPreviousOfficialMint} from './previous-official-mints.mjs';
const ORIGIN='https://grainpad.fun';
export function assertOfficialIdentityPins({pins,deployment,expected}){
 if(expected?.name!=='Grainpad'||expected?.symbol!=='GRAIN'||expected?.origin!==ORIGIN)throw Error('Official identity name, symbol or origin changed.');
 if(expected?.imageHash!==OFFICIAL_ARTWORK.sha256)throw Error('Official artwork pin does not match the approved image.');
 if(expected?.twitter!=='https://x.com/GrainXMR')throw Error('Official X identity changed.');
 if(!deployment?.collector||deployment.collector!==expected?.collector)throw Error('Collector pins disagree.');
 if(pins?.mint||pins?.metadataHash||pins?.metadataUri)throw Error('Official mint identity is not a browser pin.');
 const deploymentMint=deployment?.officialGrainMint??null,expectedMint=expected?.officialMint??null;
 if(isPreviousOfficialMint(deploymentMint)||isPreviousOfficialMint(expectedMint))throw Error('Previous official mint is not supported.');
 if((deploymentMint||expectedMint)&&deploymentMint!==expectedMint)throw Error('Official mint pins disagree across the launch pins, rewards deployment and launch verification.');
 if(deploymentMint){
  let key;try{key=new PublicKey(deploymentMint);}catch{throw Error('Official mint pin is not a public key.');}
  if(key.toBase58()!==deploymentMint||!PublicKey.isOnCurve(key.toBytes())||deploymentMint===GRAINU_REHEARSAL_MINT||deploymentMint===QUOTES.wXMR.mint)throw Error('Official mint pin is not a new GRAIN keypair.');
 }
 const pinTax=pins?.taxBps??null,expectedTax=expected?.taxBps??null;
 if((pinTax==null)!==(expectedTax==null)||(pinTax!=null&&pinTax!==expectedTax))throw Error('Official tax pins disagree.');
 if(pinTax!=null&&!isLaunchTaxBps(pinTax))throw Error('Official tax pin is outside the 1.0–3.0% launch grid.');
 if(expected?.metadataHash)throw Error('Official metadata hash is not a source pin.');
}
