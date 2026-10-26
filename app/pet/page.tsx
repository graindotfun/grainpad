import type {Metadata} from 'next';
import {SiteHeader} from '@/components/site-header';
import {GrainpetEntry} from '@/components/grainpet-entry';
export const metadata:Metadata={title:'grainpet · grainpad',description:'your grain keeps your room. sign in with your wallet and it follows you.'};
export const dynamic='force-dynamic';
/** The room itself is a static page (public/pet/room.html) shown in a frame. This page owns the wallet, the one sign-in and the identity handshake. */
export default function PetPage(){return <main className="shell grainpet-page"><SiteHeader/><GrainpetEntry/></main>;}
