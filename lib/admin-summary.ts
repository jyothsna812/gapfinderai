// Pure helpers: turn a student's saved study data into the numbers the admin dashboard shows.
// No I/O here, so it is easy to unit test.
import type { Level } from "./types";

export interface StudentSummary {
  subject: string;
  materials: { name: string; kind: string }[];
  topicCount: number;
  attempts: { at: number; questions: number; score: number }[];
  mastery: number | null;
  level: Level;
  coverage: { assessed: number; total: number } | null;
  weakTopics: string[];
  summary: string;
  hasPlan: boolean;
  planDays: number;
  studyMinutes: number;
  totalScheduledMinutes: number;
  completedBlocksCount: number;
  quizMinutes: number;
  totalTimeMinutes: number;
  avgScore: number | null;
}

export function levelOf(mastery: number | null | undefined): Level {
  if (mastery == null) return "untested";
  return mastery >= 0.8 ? "strong" : mastery >= 0.5 ? "medium" : "weak";
}

export function formatMinutes(mins: number): string {
  if (!mins || mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** `data` is the StudentData JSON saved in public.student_state (any shape is tolerated). */
export function summarizeStudent(data: any): StudentSummary {
  const d = data ?? {};
  const reports: any[] = Array.isArray(d.reports) ? d.reports : [];
  const last = reports[reports.length - 1];
  const mastery = typeof last?.overallMastery === "number" ? last.overallMastery : null;
  const attempts: any[] = Array.isArray(d.attempts) ? d.attempts : [];

  // Calculate study time from revision schedule
  const schedule: any[] = Array.isArray(d.plan?.schedule) ? d.plan.schedule : [];
  let studyMinutes = 0;
  let totalScheduledMinutes = 0;
  let completedBlocksCount = 0;

  for (const day of schedule) {
    if (Array.isArray(day?.blocks)) {
      for (const block of day.blocks) {
        const mins = Number(block.minutes) || 0;
        totalScheduledMinutes += mins;
        if (block.done) {
          studyMinutes += mins;
          completedBlocksCount++;
        }
      }
    }
  }

  // Calculate diagnostic quiz time (approx 1.5 minutes per question)
  const mappedAttempts = attempts.map((a) => {
    const ev: any[] = Array.isArray(a.evaluations) ? a.evaluations : [];
    return {
      at: Number(a.createdAt ?? 0),
      questions: Array.isArray(a.questions) ? a.questions.length : 0,
      score: ev.length ? ev.reduce((s, e) => s + (Number(e.score) || 0), 0) / ev.length : 0,
    };
  });

  const totalQuestions = mappedAttempts.reduce((acc, a) => acc + a.questions, 0);
  const quizMinutes = Math.round(totalQuestions * 1.5);
  const totalTimeMinutes = studyMinutes + quizMinutes;

  const validScores = mappedAttempts.filter((a) => a.questions > 0).map((a) => a.score);
  const avgScore = validScores.length ? validScores.reduce((a, b) => a + b, 0) / validScores.length : null;

  return {
    subject: String(d.subject ?? ""),
    materials: (Array.isArray(d.materials) ? d.materials : []).map((m: any) => ({ name: String(m.name ?? ""), kind: String(m.kind ?? "") })),
    topicCount: Array.isArray(d.topics) ? d.topics.length : 0,
    attempts: mappedAttempts,
    mastery,
    level: levelOf(mastery),
    coverage: last?.coverage ?? null,
    weakTopics: (Array.isArray(last?.topics) ? last.topics : []).filter((t: any) => t.level === "weak").map((t: any) => String(t.name)),
    summary: String(last?.summary ?? ""),
    hasPlan: !!d.plan,
    planDays: schedule.length,
    studyMinutes,
    totalScheduledMinutes,
    completedBlocksCount,
    quizMinutes,
    totalTimeMinutes,
    avgScore,
  };
}
