const uploadForm = document.querySelector('#upload-form');
const skillsForm = document.querySelector('#skills-form');
const uploadButton = document.querySelector('#upload-button');
const confirmButton = document.querySelector('#confirm-button');
const progress = document.querySelector('#progress');
const review = document.querySelector('#review');
const skillsList = document.querySelector('#skills');
let profileId;

function showStatus(message, error = false) {
  progress.hidden = false;
  progress.classList.toggle('error', error);
  progress.textContent = message;
}

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Something went wrong. Please try again.');
  return data;
}

async function waitForWorkflow(id) {
  const labels = {
    queued: 'Waiting for the background worker…',
    parsing_resume: 'Reading your resume…',
    extracting_skills: 'Finding skills and supporting excerpts…',
    confirming_profile: 'Saving your confirmed skills…',
  };
  while (true) {
    const workflow = await request(`/api/workflows/${encodeURIComponent(id)}`);
    if (workflow.status === 'failed') throw new Error(workflow.error || 'Processing failed.');
    if (workflow.status === 'completed') return workflow;
    showStatus(labels[workflow.stage] || 'Processing…');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}

function addSkill(skill = {}) {
  const row = document.createElement('div');
  row.className = 'skill';
  const fields = document.createElement('div');
  fields.className = 'skill-fields';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Skill';
  const name = document.createElement('input');
  name.required = true;
  name.maxLength = 120;
  name.value = skill.name || '';
  nameLabel.append(name);

  const categoryLabel = document.createElement('label');
  categoryLabel.textContent = 'Category';
  const category = document.createElement('select');
  for (const [value, label] of [['technical', 'Technical'], ['nontechnical', 'Nontechnical']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    category.append(option);
  }
  category.value = skill.category || 'technical';
  categoryLabel.append(category);
  fields.append(nameLabel, categoryLabel);
  row.append(fields);

  if (skill.evidence) {
    const evidence = document.createElement('p');
    evidence.className = 'evidence';
    evidence.textContent = `Resume excerpt: “${skill.evidence}”`;
    row.append(evidence);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove';
  remove.textContent = 'Remove skill';
  remove.setAttribute('aria-label', `Remove ${skill.name || 'skill'}`);
  remove.addEventListener('click', () => row.remove());
  row.append(remove);
  row.skillValues = () => ({ name: name.value.trim(), category: category.value, evidence: skill.evidence || null });
  skillsList.append(row);
}

uploadForm.addEventListener('submit', async event => {
  event.preventDefault();
  const file = document.querySelector('#resume').files[0];
  if (!file) return;
  uploadButton.disabled = true;
  confirmButton.disabled = true;
  review.hidden = true;
  skillsList.replaceChildren();
  try {
    showStatus('Uploading your resume…');
    const form = new FormData();
    form.append('file', file);
    const workflow = await request('/api/profiles/resume', { method: 'POST', body: form });
    profileId = workflow.profile_id;
    const completed = await waitForWorkflow(workflow.workflow_id);
    const profile = await request(`/api/profiles/${encodeURIComponent(profileId)}`);
    profile.skills.forEach(addSkill);
    review.hidden = false;
    const prefix = completed.stage === 'awaiting_profile_confirmation_mock' ? 'Mock extraction (Python, Java and SQL only). ' : '';
    showStatus(prefix + (profile.skills.length ? 'Your skills are ready to review.' : 'No skills were found. You can add them below.'));
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    uploadButton.disabled = false;
    confirmButton.disabled = false;
  }
});

document.querySelector('#add-skill').addEventListener('click', () => addSkill());

skillsForm.addEventListener('submit', async event => {
  event.preventDefault();
  const skills = Array.from(skillsList.children, row => row.skillValues());
  if (skills.some(skill => !skill.name)) {
    showStatus('Enter a name for each skill.', true);
    return;
  }
  confirmButton.disabled = true;
  uploadButton.disabled = true;
  try {
    showStatus('Submitting your profile…');
    const workflow = await request(`/api/profiles/${encodeURIComponent(profileId)}/confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skills }),
    });
    await waitForWorkflow(workflow.workflow_id);
    review.hidden = true;
    showStatus('Your skills have been confirmed. You can upload another resume to start again.');
  } catch (error) {
    showStatus(error.message, true);
    confirmButton.disabled = false;
  } finally {
    uploadButton.disabled = false;
  }
});
