# Link Protect JavaScript SDK

```bash
# drop index.js into your project (ESM, Node 18+, zero dependencies)
```

```js
import LinkProtect, { verifySignature } from './index.js';

const lp = new LinkProtect('lp_sandbox'); // your key from the Developer tab
console.log(await lp.stats());
console.log(await lp.check('https://discord-nltro.gift', { deep: true }));

// live events
const stop = lp.streamEvents((event, data) => console.log(event, data));

// webhook verification (Express: use express.raw() for the body!)
const ok = await verifySignature(process.env.WH_SECRET, rawBody, req.headers['x-linkprotect-signature']);
```

Docs: https://link-protect.com/developers
