/** Live regression through the real TypeScript onboarding client + authenticated API.
 * Usage: node scripts/check_profile_client.mjs PRIVATE_SESSION_JSON RESUME_DOCX OUTPUT_JSON
 * Session JSON: {access_token}; use a disposable development/test account only.
 * Only Supabase's browser session lookup is substituted; HTTP and API modules are real.
 */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const [sessionFile, resumeFile, outputFile] = process.argv.slice(2);
if (!outputFile) throw new Error("Provide a private session file, synthetic résumé and output path.");
const session = JSON.parse(await readFile(sessionFile, "utf8"));
process.env.CAREERBRIDGE_TEST_TOKEN = session.access_token;
const root = await mkdtemp(join(tmpdir(), "careerbridge-profile-client-"));
try {
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  for (const name of ["api/onboarding", "api/client", "api/endpoints", "api/realWorkflowCache"]) {
    const source = await readFile(resolve("src/lib", name + ".ts"), "utf8");
    const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText
      .replace(/from (["'])(\.[^"']+)\1/g, (_, quote, specifier) => `from ${quote}${specifier}.js${quote}`);
    const file = join(root, name + ".js");
    await mkdir(dirname(file), {recursive:true});
    await writeFile(file, compiled);
  }
  await mkdir(join(root, "mock"), {recursive:true});
  await writeFile(join(root,"mock/handlers.js"), 'const fail=()=>{throw Error("Unexpected mock call")}; export const mockBuildProfile=fail,mockConfirmProfile=fail,mockParseResume=fail;');
  await writeFile(join(root,"config.js"), `export const USE_MOCKS=false; export const API_BASE_URL=${JSON.stringify(process.env.TEST_API_BASE_URL || "http://127.0.0.1:8003")};`);
  await writeFile(join(root,"supabase.js"), 'export const supabase={auth:{getSession:async()=>({data:{session:{access_token:process.env.CAREERBRIDGE_TEST_TOKEN}}})}};');
  const api = await import(pathToFileURL(join(root,"api/onboarding.js")));
  const cache = await import(pathToFileURL(join(root,"api/realWorkflowCache.js")));
  const uploaded = await api.parseResume(new File([await readFile(resumeFile)], "synthetic-recovery.docx"));
  assert.ok(uploaded.profile, "Upload must return the saved profile immediately");
  assert.equal(uploaded.profile.hasFile, true);
  assert.ok(uploaded.profile.skills.length);
  const restored = await api.getSavedProfile(JSON.parse(JSON.stringify(uploaded.profile)).id);
  assert.equal(restored.id, uploaded.profile.id, "Refresh must reuse the same saved profile");
  const missingId = "00000000-0000-4000-8000-000000000001";
  await assert.rejects(api.getProfile(missingId), e => e.status === 404);
  const recovered = await api.getSavedProfile(missingId);
  assert.equal(recovered.id, restored.id, "Stale cache must recover the owned saved profile");
  const built = await api.buildProfile({profileId:missingId, skills:restored.skills,
    situation:"upskill", experienceLevel:"beginner", yearsOfExperience:0});
  const draft = cache.getLocalWorkflow(built.workflowId).result.profile;
  assert.equal(draft.id, restored.id);
  assert.equal(draft.hasFile, true);
  const confirmed = await api.confirmProfile(draft.id, draft.skills.map(s => ({skill:s.skill,
    status:s.source === "resume" ? "user_confirmed" : "self_reported", excerpt:s.sourceExcerpt})));
  assert.ok(confirmed.confirmedAt);
  assert.equal(confirmed.id, restored.id);
  assert.deepEqual(confirmed.skills.map(s=>s.sourceExcerpt), restored.skills.map(s=>s.sourceExcerpt));
  assert.deepEqual(await api.getSavedProfile(confirmed.id), confirmed);
  await writeFile(outputFile, JSON.stringify({passed:true, profile_id:confirmed.id, immediate_saved_identity:true,
    reload_same_profile:true, stale_id_recovered:true, confirmation_saved:true, evidence_preserved:true,
    evidence_count:confirmed.skills.length},null,2));
  console.log("PASS: actual onboarding client upload → reload → stale-ID recovery → build → confirmation → reload");
} finally {
  delete process.env.CAREERBRIDGE_TEST_TOKEN;
  await rm(root, {recursive:true,force:true});
}
