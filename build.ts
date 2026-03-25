import { execSync } from "child_process";

await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  format: "esm",
  target: "node",
  sourcemap: "linked",
  external: ["@elizaos/core", "node:*"],
});

execSync("tsc --emitDeclarationOnly --outDir dist", { stdio: "inherit" });
