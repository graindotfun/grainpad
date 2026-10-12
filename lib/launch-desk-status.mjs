/** Presentation only. These observations never authorize a launch or a payment. */
export function launchDeskStatus(platform, {error=false,now=Date.now()}={}) {
 if(error)return {state:'unavailable',label:'Status unavailable',note:'We could not verify launch availability. Check again shortly.'};
 if(!platform)return {state:'checking',label:'Checking availability',note:'Reading the current launch rules.'};
 const checked=Date.parse(platform.checkedAt??'');
 if(platform.stale!==false||!Number.isFinite(checked)||checked>now+5000||now-checked>60000)
  return {state:'unavailable',label:'Status needs a refresh',note:'The last observation is delayed. Opening is not confirmed.'};
 const rewards=platform.rewards;
 const open=platform.active===true&&platform.policyMatches===true&&platform.creationEnabled===true
  &&rewards?.policyApproved===true&&rewards.configurationReady===true&&rewards.operational===true
  &&rewards.setup?.publicAdmissionOpen===true;
 return open
  ?{state:'open',label:'Public launches open',note:'Create a wXMR pair. Review the cost and sign in your wallet.'}
  :{state:'closed',label:'Preparing for public launches',note:'You can draft your token. Creation opens after the launch checks pass.'};
}
