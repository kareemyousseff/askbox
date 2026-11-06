import { describe, expect, it } from "vitest";
import { grade } from "../grade.js";
import { judge } from "../judge.js";

const reply = "He is eighteen";

function fakeJudge(contents) {
  const text = contents[0].parts[0].text;
  const [rubric, answer] = text.split("\n");
  if (rubric === "The word eighteen counts as 18.") {
    return { pass: answer.toLowerCase().includes("eighteen"), rule: rubric };
  }
  if (rubric === "The reply must contain the digits 18.") {
    return { pass: answer.includes("18"), rule: rubric };
  }
  return { pass: false, rule: rubric };
}

describe("judge", () => {
  it("passes when the rubric accepts the word eighteen", async () => {
    const rubric = "The word eighteen counts as 18.";
    const result = await judge(reply, rubric, fakeJudge);
    const exact = grade({ calls: [], text: "18" }, { calls: [], reply });

    expect(exact.ok).toBe(false);
    expect(result.pass).toBe(true);
    expect(result.rule).toBe(rubric);
  });

  it("fails when the rubric requires the digits 18", async () => {
    const rubric = "The reply must contain the digits 18.";
    const result = await judge(reply, rubric, fakeJudge);

    expect(result.pass).toBe(false);
    expect(result.rule).toBe(rubric);
  });
});
