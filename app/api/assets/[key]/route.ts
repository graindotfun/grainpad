import {bucket,fail} from "@/lib/server-utils";
export async function GET(request:Request,ctx:{params:Promise<{key:string}>}){
 try{const {key}=await ctx.params;if(!/^[a-f0-9]{64}$/.test(key))return new Response("Not found",{status:404});const object=await bucket().get(`assets/${key}`);if(!object)return new Response("Not found",{status:404});const headers=new Headers();object.writeHttpMetadata(headers);headers.set("X-Content-Type-Options","nosniff");headers.set("ETag",object.httpEtag);return new Response(object.body,{headers});}catch(error){return fail(error,503);}
}
