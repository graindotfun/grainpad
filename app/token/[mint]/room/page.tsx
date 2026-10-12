import {LaunchRoom} from '@/components/launch-room';
import {tokenMetadata} from '@/lib/share-metadata';
export async function generateMetadata({params}:{params:Promise<{mint:string}>}){return tokenMetadata('room',(await params).mint);}
export default async function RoomPage({params}:{params:Promise<{mint:string}>}){return <LaunchRoom mint={(await params).mint}/>;}
