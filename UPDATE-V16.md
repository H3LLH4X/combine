# Combine V16 — Runtime Stability Fix

- Fixed the client runtime crash reported as `f is not a function` by defensively normalizing server state and guarding challenge callbacks/data.
- Hardened the ATTEMPT/DHAPPA modal so malformed or temporarily missing room data cannot produce a blank screen.
- Added a recovery control to clear a stale saved room session directly from the error screen.
- Hardened lobby QR generation so a QR library/API failure cannot crash the lobby.
- Fixed Cloudflare expression-resolution code to preserve the challenge record before clearing it.
- Replaced `Array.prototype.at()` usage in expression evaluation with index access for broader runtime compatibility.
- Kept gameplay rules unchanged.
