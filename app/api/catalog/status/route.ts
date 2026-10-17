// Public builders supply their own verified Monero publication status operator.
export async function GET(){return Response.json({error:"Listing verification operator is not configured. Keep the original launch receipt."},{status:503,headers:{"Cache-Control":"no-store"}});}
