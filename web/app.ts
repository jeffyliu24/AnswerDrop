interface Finding {
  id: string;
  ruleId: string;
  label: string;
  severity: string;
  start: number;
  end: number;
  match: string;
}
interface Preview {
  html: string;
  findings: Finding[];
  remoteImages: string[];
}
interface Publication {
  slug: string;
  url: string;
  exportUrl: string;
  localizedImages: number;
}

const get = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const markdownInput = get<HTMLTextAreaElement>("markdown");
const tokenInput = get<HTMLInputElement>("token");
const preview = get<HTMLDivElement>("preview");
const findingsArea = get<HTMLDivElement>("findings");
const message = get<HTMLParagraphElement>("message");
let findings: Finding[] = [];
let ignored = new Set<string>();
let publication: Publication | null = null;
let previewSerial = 0;
let previewTimer: ReturnType<typeof setTimeout> | undefined;

tokenInput.value = sessionStorage.getItem("answerdrop-publisher-token") ?? "";
tokenInput.addEventListener("input", () =>
  sessionStorage.setItem("answerdrop-publisher-token", tokenInput.value),
);

function setMessage(text: string, isError = false): void {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

async function api(
  path: string,
  body: Record<string, unknown>,
  authenticated = false,
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authenticated)
    headers.Authorization = `Bearer ${tokenInput.value.trim()}`;
  const response = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error ?? `Request failed (${response.status})`);
  return value;
}

function lineNumber(offset: number): number {
  return markdownInput.value.slice(0, offset).split("\n").length;
}

function renderFindings(): void {
  get<HTMLSpanElement>("finding-count").textContent = String(findings.length);
  findingsArea.replaceChildren();
  if (!markdownInput.value.trim()) {
    findingsArea.textContent = "Paste Markdown to run the scan.";
    findingsArea.classList.add("no-findings");
    return;
  }
  if (!findings.length) {
    findingsArea.textContent = "No rule-based findings in this document.";
    findingsArea.classList.add("no-findings");
    return;
  }
  findingsArea.classList.remove("no-findings");
  for (const finding of findings) {
    const card = document.createElement("div");
    card.className = `finding ${ignored.has(finding.id) ? "ignored" : ""}`;
    const top = document.createElement("div");
    top.className = "finding-top";
    const title = document.createElement("strong");
    title.textContent = finding.label;
    const line = document.createElement("span");
    line.textContent = `Line ${lineNumber(finding.start)}`;
    top.append(title, line);
    const match = document.createElement("code");
    match.textContent = finding.match;
    const buttons = document.createElement("div");
    buttons.className = "finding-buttons";
    const redact = document.createElement("button");
    redact.type = "button";
    redact.textContent = "Redact";
    redact.addEventListener("click", async () => {
      markdownInput.value =
        markdownInput.value.slice(0, finding.start) +
        "[REDACTED]" +
        markdownInput.value.slice(finding.end);
      ignored.clear();
      updateCount();
      await refreshPreview();
    });
    const ignore = document.createElement("button");
    ignore.type = "button";
    ignore.textContent = ignored.has(finding.id) ? "Undo ignore" : "Ignore";
    ignore.addEventListener("click", () => {
      if (ignored.has(finding.id)) ignored.delete(finding.id);
      else ignored.add(finding.id);
      renderFindings();
    });
    buttons.append(redact, ignore);
    card.append(top, match, buttons);
    findingsArea.append(card);
  }
}

function updateCount(): void {
  get<HTMLSpanElement>("input-count").textContent =
    `${markdownInput.value.length.toLocaleString()} characters`;
}

async function refreshPreview(): Promise<void> {
  const serial = ++previewSerial;
  if (!markdownInput.value.trim()) {
    preview.innerHTML =
      '<div class="empty-state">Your rendered document will appear here.</div>';
    findings = [];
    renderFindings();
    return;
  }
  try {
    const result = (await api("/api/preview", {
      markdown: markdownInput.value,
    })) as Preview;
    if (serial !== previewSerial) return;
    preview.innerHTML = result.html;
    findings = result.findings;
    ignored = new Set(
      [...ignored].filter((id) =>
        findings.some((finding) => finding.id === id),
      ),
    );
    renderFindings();
    if (result.remoteImages.length)
      setMessage(
        `${result.remoteImages.length} remote image(s) found. Localize them when publishing, or readers will see placeholders.`,
      );
    else setMessage("");
  } catch (error) {
    if (serial !== previewSerial) return;
    setMessage(error instanceof Error ? error.message : "Preview failed", true);
  }
}

markdownInput.addEventListener("input", () => {
  ignored.clear();
  updateCount();
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 650);
});
get<HTMLButtonElement>("preview-button").addEventListener(
  "click",
  refreshPreview,
);
get<HTMLInputElement>("upload").addEventListener("change", async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".md")) {
    setMessage("Choose a .md file.", true);
    return;
  }
  if (file.size > 512 * 1024) {
    setMessage("Markdown exceeds the 512 KiB limit.", true);
    return;
  }
  markdownInput.value = await file.text();
  ignored.clear();
  updateCount();
  await refreshPreview();
});

get<HTMLButtonElement>("publish").addEventListener("click", async () => {
  const button = get<HTMLButtonElement>("publish");
  button.disabled = true;
  try {
    await refreshPreview();
    if (!markdownInput.value.trim()) throw new Error("Paste Markdown first.");
    if (findings.some((finding) => !ignored.has(finding.id)))
      throw new Error(
        "Review each finding: redact or ignore it before publishing.",
      );
    if (!tokenInput.value.trim())
      throw new Error("Enter the publisher token from the server startup log.");
    const expiresIn = get<HTMLSelectElement>("expires").value || undefined;
    const maxViewsValue = get<HTMLSelectElement>("max-views").value;
    publication = (await api(
      "/api/publish",
      {
        markdown: markdownInput.value,
        acknowledgeFindings: findings.length > 0,
        localizeImages: get<HTMLInputElement>("localize").checked,
        expiresIn,
        maxViews: maxViewsValue ? Number(maxViewsValue) : undefined,
      },
      true,
    )) as Publication;
    const link = get<HTMLAnchorElement>("share-link");
    link.href = publication.url;
    link.textContent = publication.url;
    get<HTMLElement>("result").hidden = false;
    setMessage(
      publication.localizedImages
        ? `Published with ${publication.localizedImages} localized image(s).`
        : "Published successfully.",
    );
    get<HTMLElement>("result").scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Publish failed", true);
  } finally {
    button.disabled = false;
  }
});

get<HTMLButtonElement>("copy-link").addEventListener("click", async () => {
  if (!publication) return;
  try {
    await navigator.clipboard.writeText(publication.url);
    setMessage("Link copied.");
  } catch {
    setMessage("Copy the link above manually.", true);
  }
});

get<HTMLButtonElement>("download-html").addEventListener("click", async () => {
  if (!publication) return;
  try {
    const response = await fetch(
      `/api/documents/${publication.slug}/export.html`,
      { headers: { Authorization: `Bearer ${tokenInput.value.trim()}` } },
    );
    if (!response.ok) throw new Error("HTML export failed");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `answerdrop-${publication.slug}.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
  } catch (error) {
    setMessage(
      error instanceof Error ? error.message : "HTML export failed",
      true,
    );
  }
});

updateCount();
renderFindings();
