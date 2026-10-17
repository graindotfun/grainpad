/** Configure an operated archive reader before serving image-proof claims. */
export async function GET(){return Response.json({verified:false,status:'unavailable',notice:'Original image verification requires configured launch observations and archival storage.'},{status:503,headers:{'Cache-Control':'no-store'}});}
