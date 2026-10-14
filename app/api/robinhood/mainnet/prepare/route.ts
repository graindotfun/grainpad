// Public builders must supply their own reviewed metadata and Monero admission operator.
export async function POST() {return Response.json({error:"Launch operator is not configured in this public source build."},{status:503});}
