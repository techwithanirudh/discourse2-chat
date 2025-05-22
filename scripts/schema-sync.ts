// update-openapi.ts
import util from "node:util";
import child_process from "node:child_process";
import coreMeta from "../src/openapi-meta.json" with { type: "json" };
import { webcrypto } from "node:crypto";
import * as path from "node:path";

const OPENAPI_URL = "https://docs.discourse.org/openapi.json";
const OPENAPI_PATH = "./src/openapi.json";
const OPENAPI_META_PATH = "./src/openapi-meta.json"; // must match import above
const LOCAL_CHAT_SPEC_PATH = "./openapi/chat.json";  // <── NEW

const ENV_CI = Deno.env.get("CI");
const CI = ENV_CI && ENV_CI !== "false" && ENV_CI !== "0";

const { subtle } = webcrypto;
const exec = util.promisify(child_process.exec);

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

async function execAndLog(cmd: string) {
  const { stdout, stderr } = await exec(cmd);
  if (stdout) console.log(stdout.trim());
  if (stderr) console.error(stderr.trim());
}

async function sha256(text: string) {
  const data = new TextEncoder().encode(text);
  const hashBuf = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function mergeSpecs(core: any, chat: any) {
  // merge paths
  core.paths = { ...(core.paths ?? {}), ...(chat.paths ?? {}) };

  // merge components.*.*  (we only need schemas today, but do all keys defensively)
  if (chat.components) {
    core.components = core.components ?? {};
    for (const [k, v] of Object.entries(chat.components)) {
      core.components[k] = { ...(core.components[k] ?? {}), ...(v as any) };
    }
  }
  return core;
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

(async () => {
  console.log(`Fetching core OpenAPI schema from ${OPENAPI_URL} …`);
  const coreResp = await fetch(OPENAPI_URL);

  if (!coreResp.ok) {
    console.error(`Failed to download core spec (${coreResp.status})`);
    Deno.exit(1);
  }

  const coreJson = await coreResp.json();

  // ---------- load local Chat spec (optional) ----------
  let chatJson: Record<string, unknown> = {};
  try {
    const chatRaw = await Deno.readTextFile(LOCAL_CHAT_SPEC_PATH);
    chatJson = JSON.parse(chatRaw);
    console.log(
      `Loaded local Chat spec from ${path.relative(process.cwd(), LOCAL_CHAT_SPEC_PATH)}`,
    );
  } catch (_) {
    console.warn(
      `⚠️  Can't read ${LOCAL_CHAT_SPEC_PATH} – continuing with core spec only`,
    );
  }

  // ---------- merge & stringify ----------
  const merged = mergeSpecs(coreJson, chatJson);
  const mergedStr = JSON.stringify(merged, null, 2);

  // ---------- hash & compare ----------
  const newHash = await sha256(mergedStr);
  if (newHash === coreMeta.hash) {
    console.log("OpenAPI schema is up-to-date (hash match).");
    return;
  }

  console.log("Schema changed (hash mismatch). Writing updates …");
  const date = new Date();

  const newMeta = {
    retrievedAt: date.getTime(),
    retrievedAtDate: date.toISOString().split("T")[0],
    hash: newHash,
    hashShort: newHash.slice(0, 7),
  };

  // ---------- persist files ----------
  await Deno.writeTextFile(OPENAPI_PATH, mergedStr);
  await Deno.writeTextFile(
    OPENAPI_META_PATH,
    JSON.stringify(newMeta, null, 2),
  );

  // ---------- regenerate + commit ----------
  console.log();
  await execAndLog("deno task schema:ts");
  await execAndLog("deno task generate");

  const files = [
    "openapi.json",
    "openapi-meta.json",
    "schema.d.ts",
    "generated.ts",
  ]
    .map((f) => `src/${f}`)
    .join(" ");

  const msg = `fix(pkg): update OpenAPI schema (${newMeta.retrievedAtDate}; "${newMeta.hashShort}")`;
  await execAndLog(`git commit -m '${msg}' ${files}`);

  if (!CI) {
    console.log(
      "CI=false → skipping git push/cherry-pick/GH workflow trigger.",
    );
    return;
  }

  await execAndLog("git push");
  await execAndLog("git checkout dev");
  await execAndLog("git cherry-pick main");
  await execAndLog("git push");
  await execAndLog("gh workflow run release.yml --ref main");
})();
