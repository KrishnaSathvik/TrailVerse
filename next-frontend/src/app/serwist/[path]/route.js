import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ??
  crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [{ url: "/offline", revision }],
    swSrc: "src/app/sw.ts",
    // Public media loads on demand. Precaching the whole library downloads
    // unused backgrounds, screenshots and social images on every fresh install.
    // Keep the default application-bundle manifest and explicit offline page.
    globIgnores: ["public/**"],
    useNativeEsbuild: true,
  });
