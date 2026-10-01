/** Launch pins, the rewards deployment and launch verification must name one official identity.
 * All unset is the closed production state. A caller's verifyLaunch override is not a pin. */
export function assertOfficialIdentityPins({pins,deployment,expected}){
 const pinMint=pins?.mint??null,deploymentMint=deployment?.officialGrainMint??null,expectedMint=expected?.officialMint??null;
 if([pinMint,deploymentMint,expectedMint].some(Boolean)&&!(pinMint&&deploymentMint&&expectedMint&&pinMint===deploymentMint&&deploymentMint===expectedMint))throw Error('Official mint pins disagree across the launch pins, rewards deployment and launch verification.');
 const pinTax=pins?.taxBps??null,expectedTax=expected?.taxBps??null;
 if((pinTax==null)!==(expectedTax==null)||(pinTax!=null&&pinTax!==expectedTax))throw Error('Official tax pins disagree.');
 const pinHash=pins?.metadataHash??null,expectedHash=expected?.metadataHash??null;
 if((pinHash==null)!==(expectedHash==null)||(pinHash!=null&&pinHash!==expectedHash))throw Error('Official metadata hash pins disagree.');
 if(deployment?.policyApproved===true&&(!deploymentMint||deploymentMint!==pinMint||deploymentMint!==expectedMint))throw Error('Approved rewards policy requires the matching official mint pin.');
}
