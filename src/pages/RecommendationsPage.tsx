import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ExposureBadge, TrendBadge } from "../components/features/target/OutlookBadges";
import { useJourney } from "../context/JourneyContext";
import { mockDelay } from "../lib/config";
import { generateRoleRecommendations } from "../lib/mock/roleOutlook";
import type { RoleRecommendation } from "../lib/types";

export function RecommendationsPage() {
  const navigate = useNavigate();
  const { profile, situation, setTargetRole } = useJourney();
  const [recommendations, setRecommendations] = useState<RoleRecommendation[] | null>(null);

  useEffect(() => {
    if (!profile?.confirmedAt) return;
    let cancelled = false;
    (async () => {
      await mockDelay(500, 1000);
      if (cancelled) return;
      setRecommendations(generateRoleRecommendations(profile.skills, situation));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount for this profile
  }, [profile?.id]);

  function handleChoose(role: string) {
    setTargetRole(role);
    navigate("/target");
  }

  if (!profile?.confirmedAt) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <p>Confirm your skills before getting role recommendations.</p>
        <Link to="/interests" className="text-primary-700 underline">
          Review your profile
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-neutral-900 sm:text-3xl">
          Not sure where to start?
        </h1>
        <Badge variant="demo" />
      </div>
      <p className="mt-2 max-w-xl text-neutral-600">
        Based on your confirmed skills, here are roles worth considering. These are signals, not
        a guarantee of fit or a chance of getting hired — use them to narrow down where to look.
      </p>

      {!recommendations && (
        <p role="status" className="mt-8 text-sm text-primary-700">
          Finding roles that fit your profile…
        </p>
      )}

      {recommendations && recommendations.length === 0 && (
        <p className="mt-8 text-sm text-neutral-600">
          We couldn't generate recommendations from your current skills. Try adding more skills on
          your profile, or search for a role directly.
        </p>
      )}

      {recommendations && recommendations.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {recommendations.map((rec) => (
            <Card key={rec.role}>
              <p className="text-base font-semibold text-neutral-900">{rec.role}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {rec.skillOverlap.matched} of {rec.skillOverlap.total} skills transfer
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ExposureBadge exposure={rec.outlook} />
                <TrendBadge trend={rec.demandTrend} />
              </div>

              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Why this role?
              </p>
              <p className="mt-1 text-sm text-neutral-700">{rec.why}</p>

              {rec.transferableSkills.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Transferable skills
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {rec.transferableSkills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-success-50 px-2 py-0.5 text-xs text-success-800"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {rec.skillsToLearn.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Skills to learn
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {rec.skillsToLearn.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <Button
                size="sm"
                className="mt-4"
                onClick={() => handleChoose(rec.role)}
              >
                Choose this role
              </Button>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-neutral-400">
        Sources: Bureau of Labor Statistics Occupational Outlook Handbook · World Economic Forum
        Future of Jobs Report · Demo signal — not a live labor-market feed.
      </p>
    </div>
  );
}
