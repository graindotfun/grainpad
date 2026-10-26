import {grainpetApi} from '@/lib/grainpet-server';
export const dynamic='force-dynamic';
/** Per-wallet grainpet save. Identity comes only from the signed session cookie. */
export const GET=(request:Request)=>grainpetApi().load(request);
export const PUT=(request:Request)=>grainpetApi().save(request);
