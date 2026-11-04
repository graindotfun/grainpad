import {grainpetApi} from '@/lib/grainpet-server';
export const dynamic='force-dynamic';
export const POST=(request:Request)=>grainpetApi().challenge(request);
