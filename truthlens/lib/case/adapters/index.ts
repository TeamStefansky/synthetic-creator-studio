// Evidence adapters barrel (layer 03 · P1). One projector per source tool.
// Clues adapter deferred to P7 (operates on browser-local localStorage; wired
// where the browser can pass its index) — see NOTES-03-P0.md deferrals.

export { siteToEvidence } from "./site";
export { boardToEvidence } from "./board";
export { logsToEvidence } from "./logs";
export { emailToEvidence } from "./email";
export { postToEvidence } from "./post";
