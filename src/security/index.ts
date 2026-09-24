import { rules, type Rule } from "./rules.js";

export interface Finding {
  id: string;
  ruleId: string;
  label: string;
  severity: Rule["severity"];
  start: number;
  end: number;
  match: string;
}

export function scanMarkdown(
  markdown: string,
  selectedRules: readonly Rule[] = rules,
): Finding[] {
  const found: Finding[] = [];
  for (const rule of selectedRules) {
    const pattern = new RegExp(
      rule.pattern.source,
      rule.pattern.flags.includes("g")
        ? rule.pattern.flags
        : `${rule.pattern.flags}g`,
    );
    for (const match of markdown.matchAll(pattern)) {
      const value = match[0];
      if (rule.validate && !rule.validate(value)) continue;
      const start = match.index;
      const end = start + value.length;
      found.push({
        id: `${rule.id}:${start}:${end}`,
        ruleId: rule.id,
        label: rule.label,
        severity: rule.severity,
        start,
        end,
        match: value,
      });
    }
  }
  const priority = { high: 0, medium: 1, low: 2 };
  found.sort(
    (a, b) =>
      priority[a.severity] - priority[b.severity] ||
      b.match.length - a.match.length ||
      a.start - b.start,
  );
  const accepted: Finding[] = [];
  for (const finding of found) {
    if (
      !accepted.some(
        (other) => finding.start < other.end && finding.end > other.start,
      )
    )
      accepted.push(finding);
  }
  return accepted.sort((a, b) => a.start - b.start);
}
