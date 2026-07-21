// Account-authenticity layer - shared types. A ProfileSnapshot is a point-in-time
// capture of a PUBLIC account profile from an official platform API. It describes
// an ACCOUNT, never a person: no real-name resolution, no cross-platform identity
// linking, no location tracking. Fields the source didn't expose stay undefined - // "Not collected", never guessed (CLAUDE.md rules 1, 4, 5, 7).

export type SocialPlatform = "bluesky" | "x";

export interface ProfileSnapshot {
  platform: SocialPlatform;
  handle: string;
  /** Platform-native id (Bluesky DID / X numeric id). */
  accountId?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  /** SHA-256 of the avatar bytes - EXACT-file match (identical avatar reuse),
   * not perceptual similarity. undefined = not collected. */
  avatarHash?: string;
  createdAt?: string; // ISO
  followers?: number;
  follows?: number;
  posts?: number;
  collectedAt: string; // ISO - when this snapshot was taken
  /** false → rendered as a visible "source not connected" state, never faked. */
  connected: boolean;
  reason?: string;
}

/** Authenticity output is a BAND with reasons - never "fake", never a verdict. */
export type AuthenticityBand =
  | "Likely authentic"
  | "Mixed"
  | "Likely inauthentic"
  | "Unknown";
