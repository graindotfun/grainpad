/** Presentation only: these states never authorize publication or another launch. */
/** @param {{verified?:boolean,confirmations?:number,publicationState?:string|null,hasTransaction?:boolean}} options */
export function catalogListingStatus({verified=false,confirmations=0,publicationState=null,hasTransaction=false}={}){
 const count=Number.isSafeInteger(confirmations)&&confirmations>=0?confirmations:0;
 const base={listed:verified===true,confirmations:count,requiredConfirmations:10,canCreateAgain:false};
 if(verified)return {...base,state:'listed',title:'Listed on Grainpad',detail:'Your Monero launch record is verified with at least 10 confirmations.'};
 if(publicationState==='awaiting-budget')return {...base,state:'awaiting-budget',title:'Waiting for Monero publication capacity',detail:'Your token is created. Its record is queued for the publication fee budget. It stays out of the catalog until Monero verification and 10 confirmations. Do not launch again.'};
 if(publicationState==='awaiting-creator-signature')return {...base,state:'needs-authorization',title:'Monero authorization required',detail:'Your token is created. Complete its existing Monero record authorization step. Catalog listing follows publication and 10 confirmations; do not create the token again.'};
 if(['held','renewal-blocked','scope-recovery-required'].includes(publicationState))return {...base,state:'requires-review',title:'Monero publication needs review',detail:'Your token and its existing publication record are saved. The operator must reconcile that record before listing. Do not launch or submit it again.'};
 if(count>=10||publicationState==='unavailable')return {...base,state:'verification-unavailable',title:'Checking Monero verification',detail:'Catalog listing is paused until the matching record can be verified currently. Your token is saved; do not launch again.'};
 if(hasTransaction&&!['prepared','constructing'].includes(publicationState))return {...base,state:'awaiting-confirmations',title:`Waiting for Monero confirmations · ${Math.min(count,10)}/10`,detail:'Your token is created. Catalog listing opens only after its Monero record is verified with 10 confirmations. Do not launch again.'};
 return {...base,state:'awaiting-publication',title:'Waiting for the Monero launch record',detail:'Your token is created. Its Monero record has not yet been verified as published. Publication depends on fee capacity and publisher readiness; catalog listing follows verification and 10 confirmations. Do not launch again.'};
}
