# Combine V17 — ATTEMPT runtime hardening

- Hardened the ATTEMPT/DHAPPA render path with a dedicated nested error boundary.
- Removed an unused expression helper that referenced stale round state.
- Hardened challenge card selection and event rendering against malformed/stale data.
- Hardened Web Audio cleanup so a non-callable close property cannot throw.
- Kept game rules unchanged.
