# Link Protect Python SDK

```bash
pip install requests   # only dependency, then drop the linkprotect/ folder in
```

```python
from linkprotect import LinkProtect, verify_signature

lp = LinkProtect("lp_sandbox")  # your key from the Developer tab
print(lp.stats())
print(lp.check("https://discord-nltro.gift", deep=True))

# webhook verification (use the RAW request body bytes)
ok = verify_signature(WH_SECRET, raw_body, request.headers["X-LinkProtect-Signature"])
