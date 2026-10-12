import LaunchProof from '@/components/launch-proof';
export default async function ProofPage({params}:{params:Promise<{mint:string}>}){const {mint}=await params;return <LaunchProof mint={mint}/>;}
