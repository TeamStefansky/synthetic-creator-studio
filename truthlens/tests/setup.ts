// Every test starts with an empty cache: tests stub the network differently for
// the same query, and a cached result from a previous test would mask that.
import { beforeEach } from "vitest";
import { cacheReset } from "@/lib/cache";

beforeEach(() => cacheReset());
