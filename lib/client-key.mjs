/** Rate-limit identity for a caller address. One IPv6 subscriber usually holds a
 * whole /64, so keying on the full address lets a single host rotate through
 * unlimited buckets. IPv4 stays per address. Not used for session binding. */
export function clientKey(address){
 const value=String(address||'').trim().toLowerCase();
 if(!value)return 'local';
 if(!value.includes(':'))return value;
 const [head,tail='']=value.split('::');
 const left=head?head.split(':'):[],right=tail?tail.split(':'):[];
 if(value.includes('::')&&left.length+right.length<8)left.push(...Array(8-left.length-right.length).fill('0'),...right);
 else if(!value.includes('::'))left.push(...right);
 const groups=left.slice(0,4).map(g=>(g.replace(/^0+(?=.)/,'')||'0'));
 if(groups.length<4||groups.some(g=>!/^[0-9a-f]{1,4}$/.test(g)))return value;
 return groups.join(':')+'::/64';
}
export function requestClientKey(request){return clientKey(request.headers.get('cf-connecting-ip'));}
