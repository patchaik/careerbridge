import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getLearningCheck, startLearningCheck, submitLearningCheck, type LearningCheck as SavedCheck } from "../../../lib/api/learningChecks";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";

export function LearningCheck({ pathId, completed }: { pathId: string; completed: boolean }) {
  const [check, setCheck] = useState<SavedCheck | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function receive(saved: SavedCheck | null) {
    setCheck(saved);
    if (saved?.submission) {
      setAnswers(saved.submission.quiz_answers);
      setResponse(saved.submission.practice_response);
    }
  }
  useEffect(() => {
    let active = true;
    getLearningCheck(pathId).then(({ check: saved }) => {
      if (active) receive(saved);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : "Couldn't load your learning check.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [pathId]);
  async function act(action: "start" | "submit" | "reload") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = action === "start" ? await startLearningCheck(pathId)
        : action === "submit" && check ? await submitLearningCheck(check.id, check.submission ?? { quiz_answers: answers, practice_response: response.trim() })
        : (await getLearningCheck(pathId)).check;
      receive(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save the learning check. Please retry.");
      // Submission may have saved before a provider/network failure. Restore that state.
      try { receive((await getLearningCheck(pathId)).check); } catch { /* Preserve the form for retry. */ }
    } finally { setBusy(false); }
  }
  const submitted = Boolean(check?.submission);
  const result = check?.result;
  return <Card>
    <section id="learning-check" aria-label="Learning check" className="scroll-mt-20 space-y-4">
      <h2 className="text-lg font-semibold">Check what you learned</h2>
      <p className="text-sm text-neutral-600">Five quiz questions and one short written practice task based on your completed material. Quiz scoring uses the saved answer key; practice feedback is AI-generated. This does not independently verify your skill or certify mastery.</p>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <p role="status">Loading your saved learning check…</p> : <>
        {(!check || check.status === "new" || check.status === "generating") && <>
          <Button disabled={busy || !completed} onClick={() => act("start")}>
            {busy ? "Preparing check…" : check ? "Retry learning check" : "Start learning check"}
          </Button>
          {!completed && <p className="text-sm text-neutral-600">Complete all milestones to start.</p>}
          {check?.status === "generating" && <p role="status">Your check is being prepared. Reload shortly to continue.</p>}
        </>}
        {check && check.questions.length > 0 && !result && <form className="space-y-5" onSubmit={event => { event.preventDefault(); void act("submit"); }}>
          <p className="text-sm text-neutral-600">One saved check per plan. Answers are saved when you submit; they cannot be changed afterward. Unsubmitted answers are not saved.</p>
          {check.questions.map((question, index) => <fieldset key={question.id} disabled={busy || submitted} className="space-y-2">
            <legend className="mb-2 font-medium">{index + 1}. {question.prompt}</legend>
            {question.options.map((option, choice) => <label key={choice} className="flex items-start gap-2">
              <input className="mt-1" type="radio" name={`${check.id}-${question.id}`} required
                checked={answers[question.id] === choice} onChange={() => setAnswers(current => ({ ...current, [question.id]: choice }))} />
              <span>{option}</span>
            </label>)}
          </fieldset>)}
          <div className="space-y-2">
            <h3 className="font-medium">Written practice</h3>
            <p className="whitespace-pre-wrap">{check.practice_prompt}</p>
            <ul className="list-disc space-y-1 pl-5">{check.criteria.map(c => <li key={c.id}>{c.description}</li>)}</ul>
            <label className="block text-sm font-medium" htmlFor={`practice-${check.id}`}>Your practice response</label>
            <textarea id={`practice-${check.id}`} value={response} onChange={event => setResponse(event.target.value)}
              rows={7} required minLength={10} maxLength={8000} disabled={busy || submitted}
              className="w-full rounded-lg border border-neutral-300 p-3 text-sm" />
            <p className="text-xs text-neutral-600">Submit text or a code excerpt and explanation. Code is not executed, and links/files are not inspected.</p>
          </div>
          {submitted && <Alert variant="info">Your answers are saved. {check.status === "grading" ? "Feedback is being prepared; reload shortly." : "Retry feedback for the same saved answers."}</Alert>}
          <Button type="submit" disabled={busy || (!completed && !submitted) || Object.keys(answers).length !== 5 || response.trim().length < 10}>
            {busy ? "Preparing feedback…" : submitted ? "Retry feedback" : "Submit learning check"}
          </Button>
          {!completed && !submitted && <p>Complete all milestones before submitting.</p>}
        </form>}
        {result && check && <div className="space-y-5">
          <Alert variant="success">Results saved · Quiz: {result.quiz_score} / {result.quiz_total}</Alert>
          <Link className="text-primary-700 underline" to="/progress">View overall progress and next steps</Link>
          <h3 className="font-semibold">Quiz feedback</h3>
          {result.quiz.map(item => {
            const question = check.questions.find(q => q.id === item.question_id)!;
            return <div key={item.question_id} className="space-y-1">
              <h4 className="font-medium">{question.prompt}</h4>
              <p>{item.correct ? "Correct" : "Review this concept"} · Your answer: {question.options[item.selected_option]}</p>
              {!item.correct && <p>Expected answer: {question.options[item.correct_option]}</p>}
              <p>{item.explanation}</p>
              <a href={`#milestone-${item.milestone_id}`} className="text-primary-700 underline">Review milestone material</a>
            </div>;
          })}
          <h3 className="font-semibold">Written practice feedback</h3>
          <details><summary className="cursor-pointer text-primary-700">Your saved response</summary><p className="mt-2 whitespace-pre-wrap">{check.submission?.practice_response}</p></details>
          <p>{result.feedback.summary}</p>
          {result.feedback.criteria.map(item => {
            const criterion = check.criteria.find(c => c.id === item.criterion_id)!;
            return <div key={item.criterion_id} className="space-y-1 border-t border-neutral-200 pt-3">
              <h4 className="font-medium">{criterion.description}</h4>
              <p>{item.met ? "Shown in your response" : "Needs more practice"} — AI feedback</p>
              {item.evidence && <blockquote className="border-l-2 pl-3">{item.evidence}</blockquote>}
              <p>{item.feedback}</p>
              <p><strong>Next step: </strong>{item.next_step}</p>
              <a href={`#milestone-${criterion.milestone_id}`} className="text-primary-700 underline">Review milestone material</a>
            </div>;
          })}
        </div>}
        <Button variant="ghost" disabled={busy} onClick={() => act("reload")}>Reload saved check</Button>
      </>}
      {busy && <p role="status">Saving your learning check. This may take a moment…</p>}
    </section>
  </Card>;
}
