# Combine V30

## Fix
Cloudflare Durable Objects now export `CombineRoom` from `cloudflare/worker.js` so the `class_name: "CombineRoom"` binding in `wrangler.jsonc` can be resolved during deployment.

No gameplay or frontend behavior changed.
