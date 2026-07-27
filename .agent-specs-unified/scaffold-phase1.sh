#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/Users/teamstefansky/Projects/newsradar}"
cd "$ROOT"

bash /Users/teamstefansky/Projects/truthlens/.agent-specs-unified/scaffold-phase1-skel.sh "$ROOT"

cp /Users/teamstefansky/Projects/truthlens/.agent-specs-unified/schema.prisma packages/db/prisma/schema.prisma

cat > packages/db/src/index.ts <<'EOF'
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
export * from "@prisma/client";
EOF

cat > packages/db/prisma/seed.ts <<'EOF'
import { createHash } from "node:crypto";
import { PrismaClient, SourceRights, WorkspaceRole, OrgRole, MemberStatus, MatchType, SentimentLabel, SentimentTargetType, Classification, ScheduleFrequency, SelectionMode, ScheduleRunStatus } from "@prisma/client";
import { EMBEDDING_DIM, embeddingToSql } from "../../core/src/db/vector.ts";

const prisma = new PrismaClient();

function hashEmbed(text: string, salt = ""): number[] {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = `${salt} ${text}`.toLowerCase().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const digest = createHash("sha256").update(token).digest();
    for (let i = 0; i < digest.length; i++) {
      const idx = (i * 31 + digest[i]!) % EMBEDDING_DIM;
      vec[idx]! += digest[i]! / 255 - 0.5;
    }
  }
  // topic centroid bias: shared tokens pull related docs together
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

async function setEmbedding(table: "Document" | "Topic", id: string, values: number[]) {
  const sql = embeddingToSql(values);
  if (table === "Document") {
    await prisma.$executeRawUnsafe(`UPDATE "Document" SET embedding = '${sql}'::vector WHERE id = '${id}'::uuid`);
  } else {
    await prisma.$executeRawUnsafe(`UPDATE "Topic" SET embedding = '${sql}'::vector WHERE id = '${id}'::uuid`);
  }
}

const LANGS = ["he", "en", "ar", "de", "fr"] as const;

async function main() {
  // Idempotent wipe of seed org by domain marker
  const existing = await prisma.organization.findFirst({ where: { name: "Stem Demo Org" } });
  if (existing) {
    await prisma.organization.delete({ where: { id: existing.id } });
  }

  const org = await prisma.organization.create({
    data: {
      name: "Stem Demo Org",
      logoUrl: "/brand/stem-logo-ink.png",
      defaultClassification: Classification.INTERNAL,
      verifiedDomains: ["stem.demo"],
      approvalRequiresExternalRecipient: true,
      personalAnalyticsEnabled: false,
    },
  });

  const wsA = await prisma.workspace.create({
    data: {
      orgId: org.id,
      name: "Intelligence Desk A",
      description: "Primary monitoring workspace",
      timezone: "Asia/Jerusalem",
      editionTimes: ["07:00", "17:00"],
    },
  });
  const wsB = await prisma.workspace.create({
    data: {
      orgId: org.id,
      name: "Regional Desk B",
      description: "Secondary workspace",
      timezone: "Asia/Jerusalem",
      editionTimes: ["08:00"],
    },
  });

  const members = await Promise.all(
    [
      { email: "owner@stem.demo", name: "Ora Owner", orgRole: OrgRole.OWNER },
      { email: "admin@stem.demo", name: "Avi Admin", orgRole: OrgRole.ADMIN },
      { email: "manager@stem.demo", name: "Maya Manager", orgRole: OrgRole.MEMBER },
      { email: "analyst@stem.demo", name: "Noa Analyst", orgRole: OrgRole.MEMBER },
      { email: "viewer@stem.demo", name: "Dan Viewer", orgRole: OrgRole.MEMBER },
    ].map((m) =>
      prisma.member.create({
        data: {
          orgId: org.id,
          email: m.email,
          name: m.name,
          orgRole: m.orgRole,
          status: MemberStatus.ACTIVE,
          invitedAt: new Date(),
        },
      }),
    ),
  );

  const [owner, admin, manager, analyst, viewer] = members;
  // Cross-role: manager is MANAGER in A, VIEWER in B
  await prisma.workspaceMember.createMany({
    data: [
      { workspaceId: wsA.id, memberId: owner!.id, role: WorkspaceRole.MANAGER },
      { workspaceId: wsA.id, memberId: admin!.id, role: WorkspaceRole.MANAGER },
      { workspaceId: wsA.id, memberId: manager!.id, role: WorkspaceRole.MANAGER },
      { workspaceId: wsA.id, memberId: analyst!.id, role: WorkspaceRole.ANALYST },
      { workspaceId: wsA.id, memberId: viewer!.id, role: WorkspaceRole.VIEWER },
      { workspaceId: wsB.id, memberId: manager!.id, role: WorkspaceRole.VIEWER },
      { workspaceId: wsB.id, memberId: analyst!.id, role: WorkspaceRole.ANALYST },
      { workspaceId: wsB.id, memberId: viewer!.id, role: WorkspaceRole.VIEWER },
    ],
  });

  const topicNames = [
    "Iran nuclear",
    "Gaza aid",
    "EU sanctions",
    "Red Sea shipping",
    "Cyber attacks",
    "Oil markets",
    "Lebanon border",
    "US elections",
    "AI regulation",
    "China trade",
    "Climate COP",
    "Refugee flows",
    "Defense budgets",
    "Tech layoffs",
    "Central banks",
  ];

  const topics = [];
  for (const [i, name] of topicNames.entries()) {
    const topic = await prisma.topic.create({
      data: {
        workspaceId: i % 2 === 0 ? wsA.id : wsB.id,
        name,
        createdById: analyst!.id,
        mustTerms: name.split(" "),
        shouldTerms: [name.toLowerCase()],
        entities: [name.split(" ")[0]!],
        languages: [...LANGS],
        precision: 0.6,
      },
    });
    await setEmbedding("Topic", topic.id, hashEmbed(name, "query:"));
    topics.push(topic);
  }

  const rightsCycle = [
    SourceRights.HEADLINE_LINK,
    SourceRights.SHORT_EXTRACT,
    SourceRights.FULL_TEXT_LICENSED,
  ];
  const sources = [];
  for (let i = 0; i < 40; i++) {
    const domain = `source${i}.example`;
    sources.push(
      await prisma.source.create({
        data: {
          name: `Source ${i}`,
          domain,
          feedUrl: `https://${domain}/rss`,
          country: ["IL", "US", "GB", "DE", "FR"][i % 5]!,
          language: LANGS[i % LANGS.length]!,
          tier: (i % 3) + 1,
          rights: rightsCycle[i % 3]!,
        },
      }),
    );
  }

  const documents = [];
  for (let i = 0; i < 600; i++) {
    const lang = LANGS[i % LANGS.length]!;
    const source = sources[i % sources.length]!;
    const topic = topics[i % topics.length]!;
    const headline =
      lang === "he"
        ? `כותרת ${topic.name} מספר ${i}`
        : lang === "ar"
          ? `عنوان ${topic.name} رقم ${i}`
          : lang === "de"
            ? `Überschrift ${topic.name} Nr. ${i}`
            : lang === "fr"
              ? `Titre ${topic.name} n° ${i}`
              : `Headline ${topic.name} #${i}`;
    const doc = await prisma.document.create({
      data: {
        sourceId: source.id,
        url: `https://${source.domain}/articles/${i}`,
        headline,
        headlineOriginal: headline,
        language: lang,
        summary: `Summary for ${topic.name} in ${lang}`,
        publishedAt: new Date(Date.now() - i * 3600_000),
        countriesMentioned: [source.country ?? "IL"],
        entities: topic.entities,
      },
    });
    await setEmbedding("Document", doc.id, hashEmbed(`${topic.name} ${headline}`, "passage:"));
    documents.push(doc);

    await prisma.topicMatch.create({
      data: {
        topicId: topic.id,
        documentId: doc.id,
        score: 0.7 + (i % 30) / 100,
        matchedOn: topic.mustTerms,
        matchType: MatchType.MIXED,
      },
    });
  }

  // Per-target opposite sentiment case on first three docs for two topics
  const t0 = topics[0]!;
  const t1 = topics[1]!;
  for (const doc of documents.slice(0, 3)) {
    await prisma.entitySentiment.create({
      data: {
        documentId: doc.id,
        targetType: SentimentTargetType.TOPIC,
        targetId: t0.id,
        score: 0.6,
        confidence: 0.9,
        label: SentimentLabel.POSITIVE,
        evidenceSpan: "supportive framing",
      },
    });
    await prisma.entitySentiment.create({
      data: {
        documentId: doc.id,
        targetType: SentimentTargetType.TOPIC,
        targetId: t1.id,
        score: -0.55,
        confidence: 0.88,
        label: SentimentLabel.NEGATIVE,
        evidenceSpan: "critical framing",
      },
    });
  }

  const edition = await prisma.edition.create({
    data: {
      workspaceId: wsA.id,
      issuedAt: new Date(),
      label: "Morning 07:00",
      itemCount: 10,
    },
  });
  await prisma.edition.create({
    data: {
      workspaceId: wsA.id,
      issuedAt: new Date(Date.now() - 86400_000),
      label: "Evening 17:00",
      itemCount: 8,
    },
  });

  const template = await prisma.reportTemplate.create({
    data: {
      workspaceId: wsA.id,
      name: "Daily briefing",
      title: "תדריך יומי",
      subtitle: "מהדורת בוקר",
      classification: Classification.INTERNAL,
      includeDashboard: true,
      sectionOrder: ["overview", "hot", "negative"],
      createdById: manager!.id,
    },
  });
  await prisma.reportTemplate.create({
    data: {
      workspaceId: wsB.id,
      name: "Weekly",
      title: "Weekly wrap",
      classification: Classification.RESTRICTED,
      includeDashboard: false,
      sectionOrder: ["overview"],
      createdById: analyst!.id,
    },
  });

  const report = await prisma.report.create({
    data: {
      workspaceId: wsA.id,
      editionId: edition.id,
      templateId: template.id,
      title: "תדריך יומי",
      createdById: analyst!.id,
    },
  });

  const firstDoc = documents[0]!;
  const snapshotHeadline = firstDoc.headline;
  await prisma.reportItem.create({
    data: {
      reportId: report.id,
      documentId: firstDoc.id,
      order: 1,
      angleLabel: "Lead",
      analysisPoints: ["a", "b", "c"],
      headlineSnapshot: snapshotHeadline,
      summarySnapshot: firstDoc.summary,
      sourceNameSnapshot: "Source 0",
      publishedAtSnapshot: firstDoc.publishedAt,
      rightsSnapshot: SourceRights.HEADLINE_LINK,
      sentimentLabelSnapshot: SentimentLabel.POSITIVE,
      sentimentScoreSnapshot: 0.6,
    },
  });

  // Mutate live headline — snapshot must remain
  await prisma.document.update({
    where: { id: firstDoc.id },
    data: { headline: "CHANGED LIVE HEADLINE" },
  });

  const schedule = await prisma.reportSchedule.create({
    data: {
      workspaceId: wsA.id,
      templateId: template.id,
      name: "Daily 07:00",
      ownerId: manager!.id,
      frequency: ScheduleFrequency.DAILY,
      timeOfDay: "07:00",
      timezone: "Asia/Jerusalem",
      selectionMode: SelectionMode.TOP_N_BY_HEAT,
      topN: 12,
    },
  });
  await prisma.reportSchedule.create({
    data: {
      workspaceId: wsB.id,
      templateId: template.id,
      name: "Weekdays 08:00",
      ownerId: analyst!.id,
      frequency: ScheduleFrequency.WEEKDAYS,
      timeOfDay: "08:00",
      timezone: "Asia/Jerusalem",
      selectionMode: SelectionMode.ALL_MATCHES,
    },
  });

  const scheduledFor = new Date("2026-07-27T04:00:00.000Z");
  await prisma.scheduleRun.create({
    data: {
      scheduleId: schedule.id,
      scheduledFor,
      status: ScheduleRunStatus.PENDING,
    },
  });

  const counts = {
    organizations: await prisma.organization.count(),
    workspaces: await prisma.workspace.count(),
    members: await prisma.member.count(),
    topics: await prisma.topic.count(),
    sources: await prisma.source.count(),
    documents: await prisma.document.count(),
    editions: await prisma.edition.count(),
    templates: await prisma.reportTemplate.count(),
    schedules: await prisma.reportSchedule.count(),
  };
  const langs = await prisma.document.groupBy({ by: ["language"], _count: true });
  console.log(JSON.stringify({ counts, langs }, null, 2));

  const item = await prisma.reportItem.findFirst({ where: { reportId: report.id } });
  if (item?.headlineSnapshot !== snapshotHeadline) {
    throw new Error("snapshot headline mutated unexpectedly");
  }
  const live = await prisma.document.findUniqueOrThrow({ where: { id: firstDoc.id } });
  if (live.headline === snapshotHeadline) {
    throw new Error("expected live headline to change");
  }

  // Unique schedule run constraint
  let rejected = false;
  try {
    await prisma.scheduleRun.create({
      data: { scheduleId: schedule.id, scheduledFor, status: ScheduleRunStatus.PENDING },
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("expected unique(scheduleId, scheduledFor) rejection");

  const cross = await prisma.workspaceMember.findMany({ where: { memberId: manager!.id } });
  const roles = Object.fromEntries(cross.map((r) => [r.workspaceId, r.role]));
  if (roles[wsA.id] !== "MANAGER" || roles[wsB.id] !== "VIEWER") {
    throw new Error("cross-role member roles incorrect");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
EOF

# DATABASE_URL for prisma (sync postgres protocol)
grep -q 'DATABASE_URL=' .env 2>/dev/null || cp .env.example .env
# Ensure postgresql:// not asyncpg
if grep -q 'postgresql+asyncpg' .env 2>/dev/null; then
  sed -i '' 's|postgresql+asyncpg://|postgresql://|' .env
fi
if ! grep -q '^DATABASE_URL=' .env; then
  echo 'DATABASE_URL=postgresql://newsradar:newsradar@localhost:5432/newsradar' >> .env
fi

# Symlink env for prisma package
ln -sfn ../../.env packages/db/.env

# Update gitignore for cache
grep -q '^\.cache$' .gitignore || echo '.cache' >> .gitignore

echo "phase1 files staged for install"
