export function displayUnits(n,decimals){n=BigInt(n);const scale=10n**BigInt(decimals);return `${n/scale}.${(n%scale).toString().padStart(decimals,'0')}`.replace(/\.?0+$/,'');}
