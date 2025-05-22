import { build, emptyDir } from "@deno/dnt";

await emptyDir("./npm");

await build({
  entryPoints: ["./src/index.ts"],
  outDir: "./npm",
  shims: {
    // see JS docs for overview and more options
    deno: true,
  },
  importMap: "deno.json",

  // No tests for now.  Do we really need them?  Also need to fix:
  // error: Uncaught (in promise) "Error stripping prefix of
  // ~/discourse2/tests/docker/server.json with base ~/discourse2/src"
  test: false,

  package: {
    // package.json properties
    name: "discourse2-chat",
    version: Deno.args[0],
    description: "Type-safe Discourse API client with Chat endpoints baked in",
    license: "MIT",
    "keywords": [
      "discourse",
    ],
    "author": "Anirudh Sriram <hello@techwithanirudh.com>",
    "contributors": [
      "Anirudh Sriram <hello@techwithanirudh.com>",
      "Gadi Cohen <dragon@wastelands.net>"
    ],
    repository: {
      type: "git",
      url: "git+https://github.com/techwithanirudh/discourse2-chat.git",
    },
    bugs: {
      url: "https://github.com/techwithanirudh/discourse2-chat/issues",
    },
    "homepage": "https://github.com/techwithanirudh/discourse2-chat#readme",
    devDependencies: {
      "@types/debug": "^4.1.12",
    },
  },
  compilerOptions: {
    lib: ["ESNext"],
  },
  postBuild() {
    // steps to run after building and before running the tests
    Deno.copyFileSync("LICENSE.txt", "npm/LICENSE.txt");
    Deno.copyFileSync("README.md", "npm/README.md");
    Deno.copyFileSync("src/schema.d.ts", "npm/esm/schema.d.ts");
    Deno.copyFileSync("src/schema.d.ts", "npm/script/schema.d.ts");
  },
});
