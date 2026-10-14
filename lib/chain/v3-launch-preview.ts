import type {CreatorBuyPreview} from './evm-one-approval-launch.ts';
const Q=1n<<96n, SUPPLY=1_000_000_000n*10n**18n;
const A=2510809139091789284100322n, FAR=1456195216270955103206513029158776779468408838535n;
const B=2500031419217008302293562112940196n, LOW=4310618292n;
const ceil=(a:bigint,b:bigint)=>(a+b-1n)/b;
/** Integer Uniswap V3 first-swap arithmetic for the two token-address orderings.
 * The smaller output is the conservative preview before the CREATE2 address is known.
 * The complete createAndLaunch call is simulated before the wallet submission.
 */
export function previewContinuousCreatorBuy(quoteIn:bigint,slippageBps:number):CreatorBuyPreview {
 if(quoteIn<=0n || quoteIn>(1n<<128n)-1n)throw new Error('Enter a positive creator buy within the supported amount.');
 if(!Number.isInteger(slippageBps)||slippageBps<0||slippageBps>500)throw new Error('Slippage must be 0 to 500 bps.');
 const net=quoteIn*990000n/1000000n;
 // At most 23 bitmap/range steps for the pinned 200-tick range. Reserve 64 quote wei
 // for per-step fee/price rounding; full launch simulation remains mandatory.
 const safeNet=net>64n?net-64n:0n;
 const la=SUPPLY*(A*FAR/Q)/(FAR-A),lb=SUPPLY*Q/(B-LOW);
 const nextA=A+safeNet*Q/la, nextB=ceil((lb*Q)*B,lb*Q+safeNet*B);
 if(nextA>=FAR || nextB<=LOW)throw new Error('Creator buy exceeds the pool range.');
 const outA=((la*Q)*(nextA-A)/nextA)/A,outB=lb*(B-nextB)/Q;
 const tokensOut=outA<outB?outA:outB;
 const minTokensOut=tokensOut*BigInt(10000-slippageBps)/10000n;
 if(minTokensOut<=0n)throw new Error('Amount is too small.');
 const totalFee=quoteIn-net,platformFee=totalFee*35n/100n;
 return {quoteIn,platformFee,creatorFee:totalFee-platformFee,totalFee,net,tokensOut,slippageBps,minTokensOut,effectiveFeeBps:100,transactionValue:quoteIn};
}
