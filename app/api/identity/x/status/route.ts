import {env} from 'cloudflare:workers';
import {xOauthConfig} from '@/lib/x-oauth.mjs';
export const dynamic='force-dynamic';
export function GET(){
 let configured=false;
 try{configured=Boolean(xOauthConfig(env));}catch{configured=false;}
 return Response.json({configured},{headers:{'Cache-Control':'no-store'}});
}
