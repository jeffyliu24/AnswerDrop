import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { isIP } from "node:net";
import {
  IMAGE_TIMEOUT_MS,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MAX_TOTAL_IMAGE_BYTES,
} from "../config.js";

export interface LocalImage {
  sourceUrl: string;
  hash: string;
  mime: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  bytes: Buffer;
}

function ipv4Public(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (
    a === 192 &&
    (b === 168 ||
      (b === 0 && c === 0) ||
      (b === 0 && c === 2) ||
      (b === 88 && c === 99))
  )
    return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function ipv6Number(ip: string): bigint | null {
  let value = ip.toLowerCase();
  if (value.includes("%")) return null;
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const v4 = value.slice(lastColon + 1);
    if (isIP(v4) !== 4) return null;
    const bytes = v4.split(".").map(Number);
    value = `${value.slice(0, lastColon)}:${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (
    missing < 0 ||
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1)
  )
    return null;
  const parts = [...left, ...Array(missing).fill("0"), ...right];
  if (parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.reduce((sum, part) => (sum << 16n) + BigInt(`0x${part}`), 0n);
}

export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return ipv4Public(ip);
  if (family !== 6) return false;
  const value = ipv6Number(ip);
  if (value === null || value >> 125n !== 1n) return false; // global unicast only
  const top32 = Number(value >> 96n);
  if (top32 <= 0x2001002f || top32 === 0x20010db8) return false; // transition, special-use, documentation
  if (Number(value >> 112n) === 0x2002) return false; // 6to4 can tunnel to IPv4
  return true;
}

export function validateRemoteUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid image URL");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Only http/https images are supported");
  if (url.username || url.password)
    throw new Error("Image URLs with credentials are not allowed");
  if (url.port && !["80", "443"].includes(url.port))
    throw new Error("Image URL port is not allowed");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Local hostnames are not allowed");
  }
  if (isIP(hostname) && !isPublicIp(hostname))
    throw new Error("Private or reserved IP address is not allowed");
  url.hash = "";
  return url;
}

async function resolvePublicIp(
  hostname: string,
): Promise<{ address: string; family: 4 | 6 }> {
  const clean = hostname.replace(/^\[|\]$/g, "");
  if (isIP(clean)) return { address: clean, family: isIP(clean) as 4 | 6 };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Image DNS lookup timed out")),
      IMAGE_TIMEOUT_MS,
    );
  });
  let records;
  try {
    records = await Promise.race([
      lookup(clean, { all: true, verbatim: true }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!records.length || records.some((record) => !isPublicIp(record.address)))
    throw new Error("Image host resolves to a private or reserved IP address");
  return records[0] as { address: string; family: 4 | 6 };
}

function sniffMime(bytes: Buffer): LocalImage["mime"] | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  )
    return "image/jpeg";
  if (
    bytes.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))
  )
    return "image/gif";
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}

export async function downloadImage(raw: string): Promise<LocalImage> {
  const url = validateRemoteUrl(raw);
  const { address, family } = await resolvePublicIp(url.hostname);
  const transport = url.protocol === "https:" ? https : http;
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method: "GET",
        lookup: (_host, _options, callback) => callback(null, address, family),
        headers: {
          Accept: "image/png, image/jpeg, image/gif, image/webp",
          "Accept-Encoding": "identity",
          "User-Agent": "AnswerDrop/0.1",
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error(
              `Image server returned ${response.statusCode ?? "unknown status"}`,
            ),
          );
          return;
        }
        const contentType = String(response.headers["content-type"] ?? "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        if (
          !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(
            contentType,
          )
        ) {
          response.resume();
          reject(new Error("Image content type is not supported"));
          return;
        }
        if (
          response.headers["content-encoding"] &&
          response.headers["content-encoding"] !== "identity"
        ) {
          response.resume();
          reject(new Error("Compressed image responses are not allowed"));
          return;
        }
        if (Number(response.headers["content-length"] ?? 0) > MAX_IMAGE_BYTES) {
          response.resume();
          reject(new Error("Image exceeds 2 MiB"));
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        response.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > MAX_IMAGE_BYTES) {
            request.destroy(new Error("Image exceeds 2 MiB"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const result = Buffer.concat(chunks);
          if (!result.length || sniffMime(result) !== contentType)
            reject(new Error("Image signature does not match content type"));
          else resolve(result);
        });
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    request.setTimeout(IMAGE_TIMEOUT_MS, () =>
      request.destroy(new Error("Image request timed out")),
    );
    const timer = setTimeout(
      () => request.destroy(new Error("Image request timed out")),
      IMAGE_TIMEOUT_MS,
    );
    request.on("close", () => clearTimeout(timer));
    request.end();
  });
  const mime = sniffMime(bytes);
  if (!mime) throw new Error("Image signature is not supported");
  return {
    sourceUrl: raw,
    hash: createHash("sha256").update(bytes).digest("hex"),
    mime,
    bytes,
  };
}

export async function localizeImages(
  urls: string[],
  downloader: (url: string) => Promise<LocalImage> = downloadImage,
): Promise<LocalImage[]> {
  if (urls.length > MAX_IMAGES)
    throw new Error(
      `Only ${MAX_IMAGES} remote images can be localized per document`,
    );
  const images: LocalImage[] = [];
  let total = 0;
  for (const url of urls) {
    const image = await downloader(url);
    total += image.bytes.length;
    if (total > MAX_TOTAL_IMAGE_BYTES)
      throw new Error("Localized images exceed the 8 MiB document limit");
    images.push(image);
  }
  return images;
}
