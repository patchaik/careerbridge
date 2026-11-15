const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env', JSON.stringify({
    VITE_USE_MOCKS: 'false', VITE_API_BASE_URL: 'http://127.0.0.1:8002',
    VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key'
  }));
  module._compile(ts.transpileModule(source, {compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  }}).outputText, filename);
};
const {supabase} = require(path.join(root, 'src/lib/supabase.ts'));
supabase.auth.getSession = async () => ({data: {session: {access_token: 'synthetic-token'}}});
const {createGoal} = require(path.join(root, 'src/lib/api/goals.ts'));
const {searchJobs, getJob} = require(path.join(root, 'src/lib/api/jobs.ts'));
const {analyzeSkills, getGapAnalysis} = require(path.join(root, 'src/lib/api/skills.ts'));
const calls = [];
const job = {id: 'job', title: 'Data Analyst', source: 'keenable', requirements: [{skill:'SQL', importance:'required',excerpt:'Required: SQL.'}]};
const gap = {id:'analysis',goal_id:'goal',profile_id:'profile',job_ids:['job'],existing_skills:['SQL'],gaps:[]};
global.fetch = async (url, options) => {
  calls.push({url,options});
  assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
  assert.equal(options.headers['X-User-Id'], undefined);
  const data = url.endsWith('/goals') ? {id:'goal'} : url.endsWith('/jobs/search') ? {jobs:[job],fallback_used:false,source:'keenable'} : url.includes('/jobs/job') ? job : gap;
  return {ok:true,status:200,json:async()=>data};
};
(async()=>{
  const {goalId}=await createGoal({targetRole:'Data Analyst',location:'London',level:'junior'});
  const result=await searchJobs(goalId);
  const report=await analyzeSkills(goalId,'profile',result.jobs.map(j=>j.id));
  assert.deepEqual(JSON.parse(calls[0].options.body),{target_role:'Data Analyst',location:'London',seniority:'junior'});
  assert.deepEqual(JSON.parse(calls[2].options.body),{goal_id:'goal',profile_id:'profile',job_ids:['job']});
  assert.deepEqual(await getGapAnalysis(report.id),gap);
  assert.deepEqual(await getJob(report.job_ids[0]),job);
  global.fetch=async()=>({ok:false,status:503,json:async()=>({error:{code:'provider_unavailable',message:'Search unavailable'}})});
  await assert.rejects(searchJobs('goal'),/Search unavailable/);
  console.log('Real UI API modules: bearer auth, goal/search/analyze payloads, saved report reload and failure propagation PASS');
  await supabase.auth.stopAutoRefresh();
})().catch(error=>{console.error(error.message);process.exitCode=1;});
