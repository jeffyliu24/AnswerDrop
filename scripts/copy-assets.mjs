import { cp, mkdir } from "node:fs/promises";

await mkdir("dist/web", { recursive: true });
await cp("web/index.html", "dist/web/index.html");
await cp("web/style.css", "dist/web/style.css");
await mkdir("dist/src/render", { recursive: true });
await cp("src/render/reader.css", "dist/src/render/reader.css");
