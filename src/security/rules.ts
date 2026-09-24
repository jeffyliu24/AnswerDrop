export interface Rule {
  id: string;
  label: string;
  severity: "high" | "medium" | "low";
  pattern: RegExp;
  validate?: (value: string) => boolean;
}

function isPrivateIpv4(value: string): boolean {
  const parts = value.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  return [...counts.values()].reduce((sum, count) => {
    const p = count / value.length;
    return sum - p * Math.log2(p);
  }, 0);
}

export const rules: readonly Rule[] = [
  {
    id: "openai-key",
    label: "OpenAI-style API key candidate",
    severity: "high",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: "github-token",
    label: "GitHub token candidate",
    severity: "high",
    pattern:
      /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  {
    id: "aws-key",
    label: "AWS access key candidate",
    severity: "high",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    id: "bearer-token",
    label: "Bearer token candidate",
    severity: "high",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*\b/gi,
  },
  {
    id: "secret-env",
    label: "Secret environment variable assignment",
    severity: "high",
    pattern:
      /\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|AWS_SECRET_ACCESS_KEY|GITHUB_TOKEN|DATABASE_URL|SECRET_KEY|API_TOKEN|PRIVATE_KEY|PASSWORD)\s*[:=]\s*['"]?[^\s'"`]{6,}/gi,
  },
  {
    id: "ssh-path",
    label: "SSH-related path",
    severity: "medium",
    pattern: /(?:~|\/Users\/[^\s/]+|\/home\/[^\s/]+)\/\.ssh\/[^\s)"']+/g,
  },
  {
    id: "unix-home",
    label: "Unix home path",
    severity: "medium",
    pattern: /\/(?:Users|home)\/[^\s/]+(?:\/[^\s)"'<>]*)?/g,
  },
  {
    id: "windows-path",
    label: "Windows local path",
    severity: "medium",
    pattern:
      /\b[A-Za-z]:\\(?:Users|Documents and Settings)\\[^\s\\]+(?:\\[^\s"'<>]*)?/g,
  },
  {
    id: "private-ip",
    label: "Private or loopback IP address",
    severity: "medium",
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    validate: isPrivateIpv4,
  },
  {
    id: "email",
    label: "Email address",
    severity: "low",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    id: "high-entropy",
    label: "High-entropy token candidate",
    severity: "medium",
    pattern: /\b[A-Za-z0-9_-]{32,}\b/g,
    validate: (value) =>
      /[A-Za-z]/.test(value) && /\d/.test(value) && entropy(value) >= 4.1,
  },
];
