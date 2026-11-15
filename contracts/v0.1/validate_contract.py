"""Offline schema/reference and semantic-fixture checks; no network or DB access."""
from pathlib import Path
import copy, json, re
import yaml
from jsonschema import Draft202012Validator, FormatChecker

ROOT=Path(__file__).resolve().parent
spec=json.loads((ROOT/'openapi.json').read_text())
checks=[]
def check(name,condition):
    if not condition: raise AssertionError(name)
    checks.append(name)
def resolve(pointer):
    assert pointer.startswith('#/'), pointer
    node=spec
    for part in pointer[2:].split('/'):
        node=node[part.replace('~1','/').replace('~0','~')]
    return node
def walk(node):
    if isinstance(node,dict):
        if '$ref' in node: resolve(node['$ref'])
        for v in node.values():walk(v)
    elif isinstance(node,list):
        for v in node:walk(v)
def validator(name):
    return Draft202012Validator({'$ref':'#/components/schemas/'+name,'components':spec['components']},format_checker=FormatChecker())
def invalid(name,value):return bool(list(validator(name).iter_errors(value)))
def ids(items):return [x['id'] for x in items]
def semantic_template(t):
    errors=[]
    for key in ['concepts','milestones','activities','criteria']:
        if len(ids(t[key]))!=len(set(ids(t[key]))):errors.append('duplicate '+key)
    cs={c['id'] for c in t['concepts']}; acts={a['id'] for a in t['activities']}
    graph={c['id']:c['prerequisite_concept_ids'] for c in t['concepts']}
    for c in t['concepts']:
        if not set(c['prerequisite_concept_ids'])<=cs:errors.append('unknown concept')
    def visit(n,active,done):
        if n in active: raise ValueError('cycle')
        if n in done:return
        active.add(n)
        for nxt in graph.get(n,[]):visit(nxt,active,done)
        active.remove(n);done.add(n)
    try:
        done=set()
        for n in graph:visit(n,set(),done)
    except ValueError:errors.append('cycle')
    for m in t['milestones']:
        if not set(m['concept_ids'])<=cs:errors.append('unknown milestone concept')
        if not set(m['activity_ids'])<=acts:errors.append('unknown milestone activity')
    if {x['component'] for x in t['criteria']}!={'knowledge','project'}:errors.append('both assessment components required')
    if not any(x['critical'] and x['component']=='project' for x in t['criteria']):errors.append('critical applied criterion required')
    return errors
def semantic_bundle(t,b):
    errors=[]
    if (t['template_key'],t['version'])!=(b['template_key'],b['template_version']):errors.append('template mismatch')
    if set(b['practice_asset_ids'])&set(b['assessment_asset_ids']):errors.append('practice/final overlap')
    tc={x['id']:x for x in t['criteria']}
    covered={cid for x in b['tests'] for cid in x['criterion_ids']}
    if covered!=set(tc):errors.append('criterion coverage mismatch')
    for key in ['knowledge_questions','project_tasks','tests']:
        if len(ids(b[key]))!=len(set(ids(b[key]))):errors.append('duplicate '+key)
    qs={q['id']:q for q in b['knowledge_questions']}; tasks={p['id']:p for p in b['project_tasks']}
    for q in qs.values():
        if len(ids(q['options']))!=len(set(ids(q['options']))):errors.append('duplicate options')
    for x in b['tests']:
        if any(cid not in tc or tc[cid]['component']!=x['component'] for cid in x['criterion_ids']):errors.append('criterion component mismatch')
        if x['component']=='knowledge':
            if x['grader']!='answer_key_v1' or x['id'] not in qs:errors.append('knowledge mapping')
            elif x['expected'].get('option_id') not in ids(qs[x['id']]['options']):errors.append('answer key invalid')
        else:
            if x['id'] not in tasks:errors.append('project mapping')
            elif {'table_transform_v1':'table_result_v1','evidence_selection_v1':'evidence_match_v1'}[tasks[x['id']]['kind']]!=x['grader']:errors.append('grader mismatch')
        if not set(x['input_asset_ids'])<=set(b['assessment_asset_ids']):errors.append('unregistered final asset')
    if {x['id'] for x in b['tests'] if x['component']=='knowledge'}!=set(qs):errors.append('ungraded knowledge question')
    if {x['id'] for x in b['tests'] if x['component']=='project'}!=set(tasks):errors.append('ungraded project task')
    return errors

check('YAML and JSON API specifications agree',yaml.safe_load((ROOT/'openapi.yaml').read_text())==spec)
walk(spec);check('All local OpenAPI references resolve',True)
for name,s in spec['components']['schemas'].items():Draft202012Validator.check_schema(s)
check('All OpenAPI component schemas pass Draft 2020-12 meta-validation',True)
for p in (ROOT/'schemas').glob('*.json'):Draft202012Validator.check_schema(json.loads(p.read_text()))
check('All standalone JSON schemas pass meta-validation',True)
ops=[]
for path,methods in spec['paths'].items():
    check('Versioned path '+path,path.startswith('/api/v1/'))
    for method,op in methods.items():
        ops.append(op['operationId'])
        check('Path parameters '+op['operationId'],set(re.findall(r'{(\w+)}',path))=={p['name'] for p in op['parameters'] if p['in']=='path'})
        if method!='get':check('Idempotency '+op['operationId'],any(p['name']=='Idempotency-Key' and p['required'] for p in op['parameters']))
        if '/admin/' in path:check('Reviewer role '+op['operationId'],op.get('x-required-role')=='template_reviewer')
        if path!='/api/v1/health':check('Auth '+op['operationId'],op.get('security',spec['security'])!=[])
        if '202' in op['responses']:
            check('Consistent async response '+op['operationId'],op['responses']['202']['content']['application/json']['schema']=={'$ref':'#/components/schemas/Accepted'})
            check('Async kind '+op['operationId'],op['x-workflow-kind'] in spec['components']['schemas']['Workflow']['properties']['kind']['enum'])
check('Unique operation IDs',len(ops)==len(set(ops)))
result_paths={'profile':'/profiles/{profile_id}','job_search':'/job-searches/{search_id}','gap_analysis':'/gap-analyses/{analysis_id}','learning_path':'/paths/{path_id}','lesson':'/lessons/{lesson_id}','tutor_message':'/tutor/messages/{message_id}','practice_run':'/practice-runs/{run_id}','assessment_attempt':'/assessment-attempts/{attempt_id}','resume':'/resumes/{resume_id}','resume_export':'/resume-exports/{export_id}','data_export':'/data-exports/{export_id}','deletion':'/deletions/{deletion_id}'}
check('Every workflow result has a GET endpoint',all('get' in spec['paths']['/api/v1'+p] for p in result_paths.values()))
check('Result discriminators match retrieval map',set(result_paths)==set(spec['components']['schemas']['ResourceRef']['properties']['type']['enum']))
for p in (ROOT/'examples/api').glob('*.json'):
    validator(p.stem).validate(json.loads(p.read_text()));check('Valid request/example '+p.stem,True)
templates=[]
for p in [ROOT/'examples/tabular-summary.draft.json',ROOT/'examples/source-evidence.draft.json']:
    t=json.loads(p.read_text());templates.append(t)
    validator('TemplateDefinition').validate(t);check('Template references/DAG '+p.name,not semantic_template(t))
    s=json.loads((ROOT/'schemas/competency-template.schema.json').read_text());Draft202012Validator(s,format_checker=FormatChecker()).validate(t)
bundle=json.loads((ROOT/'examples/tabular-summary.private-grading.draft.json').read_text())
validator('GradingBundle').validate(bundle)
check('Private bundle coverage, grader and key mappings',not semantic_bundle(templates[0],bundle))
Draft202012Validator(json.loads((ROOT/'schemas/private-grading-bundle.schema.json').read_text()),format_checker=FormatChecker()).validate(bundle)
config=yaml.safe_load((ROOT/'model-routing.example.yaml').read_text())
Draft202012Validator(json.loads((ROOT/'schemas/model-routing.schema.json').read_text()),format_checker=FormatChecker()).validate(config)
check('No implicit cross-provider fallback',not config['cross_provider_fallback']['enabled'] and not config['cross_provider_fallback']['allowed_profiles'])
check('Both provider profiles configured without keys',set(config['profiles'])=={'openai','nebius'} and all('api_key' not in p for p in config['profiles'].values()))

# Adversarial/negative schema and semantic fixtures.
submission=json.loads((ROOT/'examples/api/AssessmentSubmit.json').read_text())
bad=copy.deepcopy(submission);bad['passed']=True
check('Reject client-issued passing result',invalid('AssessmentSubmit',bad))
bad=copy.deepcopy(submission);bad['project_submissions'][0]['submission']={'kind':'python','code':'print(1)'}
check('Reject arbitrary executable submission',invalid('AssessmentSubmit',bad))
bad=copy.deepcopy(templates[0]);bad['provider']='nebius'
check('Reject provider coupling in public template',invalid('TemplateDefinition',bad))
bad=copy.deepcopy(templates[0]);bad['answer_key']={'q1':'a'}
check('Reject answer key in public template',invalid('TemplateDefinition',bad))
bad=copy.deepcopy(templates[0]);bad['thresholds']['knowledge_min_fraction']=80
check('Reject percentage instead of fraction',invalid('TemplateDefinition',bad))
bad=copy.deepcopy(templates[0]);bad['concepts'][0]['prerequisite_concept_ids']=['apply']
check('Reject cyclic concepts',bool(semantic_template(bad)))
bad=copy.deepcopy(bundle);bad['assessment_asset_ids']=bad['practice_asset_ids']
check('Reject practice/final asset overlap',bool(semantic_bundle(templates[0],bad)))
bad=copy.deepcopy(bundle);bad['tests'][0]['expected']['option_id']='missing'
check('Reject nonexistent correct option',bool(semantic_bundle(templates[0],bad)))
bad=copy.deepcopy(bundle);bad['tests'][1]['criterion_ids']=['concept']
check('Reject incorrect criterion/component coverage',bool(semantic_bundle(templates[0],bad)))
bad=copy.deepcopy(bundle);bad['tests'][1]['expected']={'score':1}
check('Reject malformed registered grader expectation',invalid('GradingBundle',bad))
check('Reject approval without explicit review',invalid('ResumeApprove',{'expected_revision':1,'content_sha256':'a'*64,'reviewed':False}))
bad=copy.deepcopy(config);bad['profiles']['nebius']['api_key']='secret'
check('Reject literal secret in routing contract',not Draft202012Validator(json.loads((ROOT/'schemas/model-routing.schema.json').read_text())).is_valid(bad))

def reachable(schema,seen=None):
    if seen is None:seen=set()
    if isinstance(schema,dict):
        if '$ref' in schema:
            r=schema['$ref']
            if r not in seen:seen.add(r);reachable(resolve(r),seen)
        for v in schema.values():reachable(v,seen)
    elif isinstance(schema,list):
        for v in schema:reachable(v,seen)
    return seen
private={'#/components/schemas/'+n for n in ['GradingBundle','PrivateTest','PrivateTestSet','TemplateAuthorRequest']}
for path,methods in spec['paths'].items():
    if '/admin/' in path:continue
    for op in methods.values():
        for response in op['responses'].values():
            for content in response.get('content',{}).values():
                check('No grading bundle in learner response '+op['operationId'],not(reachable(content['schema'])&private))
model=yaml.safe_load((ROOT/'data-model.yaml').read_text())
for table in model['tables'].values():
    for fk in table['foreign_keys']:
        target=fk.split(' -> ')[1].split('.')[0];check('DB FK target '+target,target in model['tables'])
report={'status':'passed','checks':len(checks),'operations':len(ops),'schemas':len(spec['components']['schemas']),'scope':'Offline JSON Schema, reference, structural and semantic-fixture checks only. No live API/provider/DB/browser tests; no full OpenAPI meta-schema validator installed.','checks_run':checks}
(ROOT/'validation-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='checks_run'},indent=2))
