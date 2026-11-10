import { describe, it, expect } from "vitest";
import { formatMinutes, levelOf, summarizeStudent } from "../lib/admin-summary";

describe("admin summary", () => {
  it("maps mastery to a level", () => {
    expect(levelOf(null)).toBe("untested");
    expect(levelOf(0.49)).toBe("weak");
    expect(levelOf(0.5)).toBe("medium");
    expect(levelOf(0.8)).toBe("strong");
  });

  it("formats minutes into human-readable hours and minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(125)).toBe("2h 5m");
    expect(formatMinutes(180)).toBe("3h");
  });

  it("tolerates empty or malformed data", () => {
    const s = summarizeStudent(undefined);
    expect(s.mastery).toBeNull();
    expect(s.attempts).toEqual([]);
    expect(s.studyMinutes).toBe(0);
    expect(s.quizMinutes).toBe(0);
    expect(s.totalTimeMinutes).toBe(0);
    expect(summarizeStudent({ attempts: "oops", reports: 5 }).level).toBe("untested");
  });

  it("summarises attempts, latest report and weak topics", () => {
    const s = summarizeStudent({
      subject: "Biology",
      materials: [{ name: "Notes", kind: "notes" }],
      topics: [{}, {}],
      attempts: [{ createdAt: 1, questions: [{}, {}], evaluations: [{ score: 1 }, { score: 0 }] }],
      reports: [
        { overallMastery: 0.9, topics: [] },
        { overallMastery: 0.4, coverage: { assessed: 1, total: 2 }, summary: "x", topics: [{ name: "Excretion", level: "weak" }] },
      ],
      plan: {
        schedule: [
          {
            blocks: [
              { topicId: "t1", minutes: 30, task: "Review Excretion", done: true },
              { topicId: "t2", minutes: 20, task: "Practice questions", done: false },
            ],
          },
          {
            blocks: [
              { topicId: "t1", minutes: 40, task: "Deep dive Nephron", done: true },
            ],
          },
        ],
      },
    });
    expect(s.subject).toBe("Biology");
    expect(s.attempts[0].score).toBe(0.5);
    expect(s.mastery).toBe(0.4);
    expect(s.level).toBe("weak");
    expect(s.weakTopics).toEqual(["Excretion"]);
    expect(s.planDays).toBe(2);
    // 30 + 40 = 70 study minutes
    expect(s.studyMinutes).toBe(70);
    expect(s.totalScheduledMinutes).toBe(90);
    expect(s.completedBlocksCount).toBe(2);
    // 2 questions * 1.5 = 3 quiz minutes
    expect(s.quizMinutes).toBe(3);
    // 70 + 3 = 73 total time
    expect(s.totalTimeMinutes).toBe(73);
  });
});
