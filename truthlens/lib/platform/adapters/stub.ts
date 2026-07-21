// Stub provider — deterministic fixtures for tests/dev. Enabled only via
// PLATFORM_PROVIDER=stub; never in normal production use. Exists so wiring a
// real vendor later is a drop-in (module spec constraint), and so phase-2
// signal behavior is testable without any network.

import type { AccountProfile } from "@/lib/authenticity/types";
import type { PlatformAccountProvider } from "../types";

/** A deliberately bot-shaped fixture: mass-follow, fresh account, no avatar,
 * numeric handle, low-quality followers, like-only engagement. */
export function botShapedFixture(handle: string): AccountProfile {
  return {
    platform: "stub",
    username: `${handle.replace(/[^a-z0-9]/gi, "")}84729153`,
    followers: 120,
    follows: 4800,
    posts: 3,
    createdAt: "2024-01-01T00:00:00Z",
    avatarUrl: undefined, // missing avatar
    bio: "",
    followersSample: Array.from({ length: 30 }, (_, i) => ({
      username: `follower${i}92831${i}`,
      hasAvatar: i % 5 === 0, // 80% avatar-less
      hasBio: false,
      posts: 0,
      followers: 0,
    })),
    recentPosts: Array.from({ length: 5 }, () => ({ likes: 400, comments: 0 })),
  };
}

/** An ordinary-account fixture for contrast. */
export function ordinaryFixture(handle: string): AccountProfile {
  return {
    platform: "stub",
    username: handle,
    followers: 3200,
    follows: 410,
    posts: 890,
    createdAt: "2019-05-10T00:00:00Z",
    avatarUrl: "https://cdn.example/real-avatar.jpg",
    bio: "Writes about local news and cycling.",
    followersSample: Array.from({ length: 30 }, (_, i) => ({
      username: `reader_${i}`,
      hasAvatar: i % 10 !== 0, // 90% have avatars
      hasBio: i % 3 !== 0,
      posts: 12 + i,
      followers: 40 + i,
    })),
    recentPosts: Array.from({ length: 5 }, (_, i) => ({ likes: 60 + i * 5, comments: 4 + i })),
  };
}

export function stubProvider(fixtures?: Record<string, AccountProfile>): PlatformAccountProvider {
  return {
    name: "stub",
    supports: () => true,
    async fetchAccount(_platform, handle) {
      if (fixtures) return fixtures[handle] ?? null;
      // Default: handles containing "bot" get the bot shape, others ordinary.
      return /bot/i.test(handle) ? botShapedFixture(handle) : ordinaryFixture(handle);
    },
  };
}
