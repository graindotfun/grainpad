import {grainpetApi} from '@/lib/grainpet-server';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>grainpetApi().session(request);
export const POST=(request:Request)=>grainpetApi().session(request);
export const DELETE=(request:Request)=>grainpetApi().session(request);
