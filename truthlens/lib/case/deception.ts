// Deception assessment (layer 03 · P5). Deception is SCORED, not asserted. It is
// a standing hypothesis, but it may outrank a simpler explanation only with
// positive MOM-POP indicators — otherwise it is unfalsifiable, absorbs every
// contradiction, and destroys the analysis it was meant to protect. Evidence that
// arrives unusually easily or points unusually neatly is weighted DOWN.

export const DECEPTION_VERSION = "case-deception-v1";

// Each axis is a checklist of positive indicators (booleans). MOM = motive /
// opportunity / means; POP = past practices; MOSES = vulnerability of OUR sources
// to being fed; EVE = accuracy / internal consistency / convenience / custody.
export interface DeceptionIndicators {
  mom?: { motive?: boolean; opportunity?: boolean; means?: boolean };
  pop?: { priorDeception?: boolean; patternConsistent?: boolean };
  moses?: { sourceManipulable?: boolean; sourceUncorroborated?: boolean };
  eve?: { evidenceTooConvenient?: boolean; custodyWeak?: boolean; internallyInconsistent?: boolean };
}

export interface DeceptionAssessment {
  version: string;
  momPositive: number;   // count of positive MOM indicators
  popPositive: number;   // count of positive POP indicators
  positiveMomPop: boolean; // >=1 MOM AND >=1 POP — the gate to outrank a simpler hypothesis
  convenienceWeightDown: boolean; // EVE convenience -> down-weight easy evidence
  custodyConcern: boolean;
  notes: string[];
}

export function assessDeception(ind: DeceptionIndicators = {}): DeceptionAssessment {
  const momPositive = [ind.mom?.motive, ind.mom?.opportunity, ind.mom?.means].filter(Boolean).length;
  const popPositive = [ind.pop?.priorDeception, ind.pop?.patternConsistent].filter(Boolean).length;
  const positiveMomPop = momPositive >= 1 && popPositive >= 1;
  const convenienceWeightDown = !!ind.eve?.evidenceTooConvenient;
  const custodyConcern = !!ind.eve?.custodyWeak;
  const notes: string[] = [];
  if (!positiveMomPop) notes.push("no positive MOM-POP — deception cannot outrank a simpler hypothesis (would be unfalsifiable).");
  if (convenienceWeightDown) notes.push("EVE: evidence arrived unusually conveniently — down-weighted.");
  if (ind.moses?.sourceManipulable) notes.push("MOSES: a source is manipulable/feedable — corroborate independently.");
  if (custodyConcern) notes.push("EVE: weak custody on a load-bearing item.");
  return { version: DECEPTION_VERSION, momPositive, popPositive, positiveMomPop, convenienceWeightDown, custodyConcern, notes };
}
