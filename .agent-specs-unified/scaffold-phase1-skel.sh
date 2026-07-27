#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/Users/teamstefansky/Projects/newsradar}"
cd "$ROOT"

mkdir -p packages/db/prisma/fixtures packages/db/src prisma

# Workspace package for Prisma
cat > packages/db/package.json <<'EOF'
{
  "name": "@newsradar/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "generate": "prisma generate",
    "migrate": "prisma migrate deploy",
    "migrate:dev": "prisma migrate dev",
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.1.0"
  },
  "devDependencies": {
    "prisma": "^6.1.0",
    "tsx": "^4.19.0",
    "typescript": "~5.6.3",
    "@xenova/transformers": "^2.17.2"
  }
}
EOF

cat > packages/db/tsconfig.json <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["src", "prisma"]
}
EOF

# Vector helpers in core
mkdir -p packages/core/src/db
cat > packages/core/src/db/vector.ts <<'EOF'
/** Typed helpers for pgvector(384). No raw SQL outside this module. */

export const EMBEDDING_DIM = 384;

export type Embedding = number[] & { readonly __brand: "Embedding384" };

export function assertEmbedding(values: number[]): Embedding {
  if (values.length !== EMBEDDING_DIM) {
    throw new Error(`expected ${EMBEDDING_DIM}-dim embedding, got ${values.length}`);
  }
  return values as Embedding;
}

export function embeddingToSql(values: Embedding | number[]): string {
  const v = Array.isArray(values) ? values : [...values];
  if (v.length !== EMBEDDING_DIM) {
    throw new Error(`expected ${EMBEDDING_DIM}-dim embedding`);
  }
  return `[${v.map((n) => Number(n).toFixed(8)).join(",")}]`;
}

export function parseEmbedding(raw: unknown): Embedding | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return assertEmbedding(raw.map(Number));
  if (typeof raw === "string") {
    const trimmed = raw.replace(/^\[/, "").replace(/\]$/, "");
    if (!trimmed) return null;
    return assertEmbedding(trimmed.split(",").map((s) => Number(s.trim())));
  }
  throw new Error("unsupported embedding payload");
}
EOF

# Update core exports
cat > packages/core/src/index.ts <<'EOF'
export { composeMeta, wrapLatin } from "./bidi/index.js";
export {
  EMBEDDING_DIM,
  assertEmbedding,
  embeddingToSql,
  parseEmbedding,
  type Embedding,
} from "./db/vector.js";
EOF

# Root scripts update via node
node <<'NODE'
import fs from "node:fs";
const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
p.scripts["db:migrate"] = "pnpm --filter @newsradar/db migrate:dev --name init";
p.scripts["db:migrate:deploy"] = "pnpm --filter @newsradar/db migrate";
p.scripts["db:seed"] = "pnpm --filter @newsradar/db seed";
p.scripts["db:generate"] = "pnpm --filter @newsradar/db generate";
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");
NODE

# Add packages/db to workspace (already apps/* packages/*)
# pnpm-workspace already has packages/*

echo "phase1 package skeleton ready"
