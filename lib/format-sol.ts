// Presentation-only formatting, safe to import without loading wallet SDKs.
export function formatSOL(value:bigint|number){const n=BigInt(value);return `${n/BigInt("1000000000")}.${(n%BigInt("1000000000")).toString().padStart(9,"0")}`.replace(/\.?0+$/,"");}
