'use strict';

const fs = require('fs');
const path = require('path');

const { projectArtifact, projectCorrectlySizedFirstAttempt, PROJECTION_BASIS } = require('../counterfactual');

const ARTIFACT_PATH = path.resolve(__dirname, '../../../../../artifacts/trailie-stage13_8b-targeted-four.json');

describe('Stage 13.9 §9 — counterfactual latency/cost projection', () => {
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
  const projection = projectArtifact({ artifact, atDate: artifact.generatedAt });
  const sevenDay = projection.perScenario.find((p) => p.scenarioId === 'basic-03-seven-day');

  it('is labeled a counterfactual, not a measurement', () => {
    expect(projection.basis).toBe(PROJECTION_BASIS);
    expect(projection.caveat).toMatch(/No provider call was made/);
  });

  describe('§3 — Stage 13.8B true cost reconstruction', () => {
    it('reproduces the reported $0.4804 and the true $0.5716', () => {
      expect(projection.costReconstruction.reportedRunCostUsd).toBeCloseTo(0.480448, 6);
      expect(projection.costReconstruction.trueRunCostUsd).toBeCloseTo(0.571552, 6);
    });

    it('attributes the entire $0.0911 gap to the discarded seven-day attempt', () => {
      expect(projection.costReconstruction.undercountedUsd).toBeCloseTo(0.091104, 6);
      expect(sevenDay.undercountedUsd).toBeCloseTo(0.091104, 6);
      const others = projection.perScenario.filter((p) => p.scenarioId !== 'basic-03-seven-day');
      expect(others.every((p) => Math.abs(p.undercountedUsd) < 1e-6)).toBe(true);
    });

    it('corrects the remaining budget against the $2 cap', () => {
      expect(projection.costReconstruction.configuredCapUsd).toBe(2);
      // The run reported $1.5196 remaining; the true figure is ~$1.4284.
      expect(projection.costReconstruction.correctedRemainingUsd).toBeCloseTo(1.428448, 6);
      expect(projection.costReconstruction.correctedRemainingUsd).toBeLessThan(1.519552);
    });
  });

  describe('§9 — seven-day latency counterfactual', () => {
    const p = () => sevenDay.projection;

    it('identifies the discarded 6,000-token attempt', () => {
      expect(p().recorded.structuredAttempts).toBe(2);
      expect(p().recorded.firstAttemptMaxTokens).toBe(6000);
      expect(p().recorded.succeedingAttemptMaxTokens).toBe(12000);
      expect(p().avoided.discardedAttempts).toBe(1);
    });

    it('reports the discarded latency, tokens and cost avoided', () => {
      expect(p().avoided.discardedLatencyMs).toBe(50310);
      expect(p().avoided.discardedOutputTokens).toBe(6000);
      expect(p().avoided.discardedInputTokens).toBe(15552);
      expect(p().avoided.discardedEstimatedCostUsd).toBeCloseTo(0.091104, 6);
    });

    it('projects Phase A from ~118.5s down to ~68.2s', () => {
      expect(p().recorded.phaseADurationMs).toBe(118470);
      expect(p().projected.phaseADurationMs).toBe(68160);
      expect(p().projected.structuredAttempts).toBe(1);
      expect(p().projected.firstAttemptMaxTokens).toBe(12000);
    });

    it('projects total response duration from ~151.4s down to ~101.1s', () => {
      expect(p().recorded.totalResponseDurationMs).toBe(151441);
      expect(p().projected.totalResponseDurationMs).toBe(101131);
      // Even corrected, a seven-day plan is still ~100s — early delivery is still needed.
      expect(p().projected.totalResponseDurationMs).toBeGreaterThan(90000);
    });

    it('projects the run cost net of the discarded attempt', () => {
      expect(p().projected.runEstimatedCostUsd).toBeCloseTo(0.17552, 5);
    });
  });

  it('single-attempt scenarios have nothing to project', () => {
    for (const id of ['basic-02-three-day', 'correction-08-exceeds-difficulty', 'prose-33-removed-active']) {
      expect(projection.perScenario.find((p) => p.scenarioId === id).projection).toBeNull();
    }
    expect(projection.latencyProjection.scenariosWithDiscardedAttempts).toBe(1);
  });

  it('returns null when a row has no failed attempt preceding success', () => {
    expect(projectCorrectlySizedFirstAttempt({
      row: { scenarioId: 'x', structuredAttempts: [{ attempt: 1, status: 'complete', durationMs: 10 }] },
      model: 'claude-sonnet-5',
    })).toBeNull();
  });
});
