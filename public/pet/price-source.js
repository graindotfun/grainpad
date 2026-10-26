/* the one place the page learns where the xmr price comes from: Grainpad's own server (which asks the provider, caches and bounds it).
   A test or a review build may define window.GrainpetPrice first. Contract: docs/product/GRAIN_PET_PRICE_PROVIDER.md. No provider is ever called from the browser and there is no key here. */
if (!window.GrainpetPrice) window.GrainpetPrice = { fetch() { return fetch('/api/xmr-price', { credentials: 'omit', cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('price unavailable'); return r.json(); }); } };
