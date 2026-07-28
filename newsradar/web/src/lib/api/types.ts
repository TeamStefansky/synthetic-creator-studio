/**
 * Convenient aliases for the generated OpenAPI schema component types.
 * These are the exact shapes the FastAPI serializers emit — render only these.
 */
import type { components } from "./schema";

type S = components["schemas"];

export type StoryOut = S["StoryOut"];
export type CoverageItemOut = S["CoverageItemOut"];
export type FullCoverageOut = S["FullCoverageOut"];
export type CoverageAngleOut = S["CoverageAngleOut"];
export type CountryCoverageOut = S["CountryCoverageOut"];
export type StanceSummaryOut = S["StanceSummaryOut"];
export type EditionOut = S["EditionOut"];
export type EditionItemOut = S["EditionItemOut"];
export type EditionSummaryOut = S["EditionSummaryOut"];
export type ShareLinkOut = S["ShareLinkOut"];
export type ShareLinkCreateIn = S["ShareLinkCreateIn"];

export type SourceOut = S["SourceOut"];
export type SourcePatchIn = S["SourcePatchIn"];
export type RightsPatchIn = S["RightsPatchIn"];
export type FeedOut = S["FeedOut"];
export type FeedPatchIn = S["FeedPatchIn"];
export type FeedHealthOut = S["FeedHealthOut"];
export type DiscoveredFeedOut = S["DiscoveredFeedOut"];
export type BatchJobOut = S["BatchJobOut"];
export type BatchJobDetailOut = S["BatchJobDetailOut"];
export type BatchResultOut = S["BatchResultOut"];
export type OpmlImportOut = S["OpmlImportOut"];
export type ApiSourceOut = S["ApiSourceOut"];
export type ApiSourcePatchIn = S["ApiSourcePatchIn"];

export type InterestOut = S["InterestOut"];
export type InterestCreateIn = S["InterestCreateIn"];
export type InterestPatchIn = S["InterestPatchIn"];
export type InterestPreviewItemOut = S["InterestPreviewItemOut"];

export type ReportSummaryOut = S["ReportSummaryOut"];
export type ReportDetailOut = S["ReportDetailOut"];
export type ReportScheduleOut = S["ReportScheduleOut"];
export type ReportScheduleIn = S["ReportScheduleIn"];
export type ReportSchedulePatch = S["ReportSchedulePatch"];
export type GenerateReportIn = S["GenerateReportIn"];

export type Page<T> = { items: T[]; total: number; limit: number; offset: number };

export type ContentRights = "link_only" | "extract_ok" | "full_ok";
export type CountryMatchMode = "source" | "subject" | "either";

/** The public /p/{token} interest-scope payload (not modelled in OpenAPI). */
export type PublicInterestScope = {
  scope: "interest";
  title: string;
  stories: StoryOut[];
};

/** The public /p/{token} digest-scope payload. */
export type PublicDigestScope = {
  scope: "digest";
  generated_at: string;
  markdown: string | null;
  html: string | null;
};
