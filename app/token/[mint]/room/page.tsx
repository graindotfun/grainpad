import {LaunchRoom} from '@/components/launch-room';
export default async function RoomPage({params}:{params:Promise<{mint:string}>}){return <LaunchRoom mint={(await params).mint}/>;}
