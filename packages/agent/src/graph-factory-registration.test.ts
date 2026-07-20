import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runtimeProfileSchema } from "@teach-everything/shared";
import { describe, expect, it } from "vitest";
import developmentProfileDocument from "../../../profiles/runtime-development.json";
import publishedProfileDocument from "../../../profiles/runtime-published.json";
import {
  createAgentGraphFactory,
  createPublishableGraphFactoryCatalog,
  createPublishableGraphFactoryRuntime,
  registerPublishableGraphFactoryVersion,
  type PublishableGraphFactory,
} from "./index";

const baselineBehaviorInputs = {
  state: "state:lesson-session:v1",
  action: "action:tutor-response:v1",
  prompt: "prompt:socratic:v3",
  tool: "tool:retrieval:v2",
  model: "model:openai:gpt-5:2026-07-20",
  trialParameter: "trial-parameter:baseline:v1",
} as const;

const developmentRuntimeProfile = runtimeProfileSchema.parse(developmentProfileDocument);
const publishedRuntimeProfile = runtimeProfileSchema.parse(publishedProfileDocument);

const createGraphFactory = (
  identity: string,
  version: string,
): PublishableGraphFactory<{ mode: string }, unknown> => ({
  identity,
  version,
  createGraph: (trialParameters) => ({ trialParameters }),
});

const createTemporaryGitRepository = () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), "agent-graph-factory-registration-"));

  execFileSync("git", ["init"], { cwd: repositoryPath });
  writeFileSync(join(repositoryPath, "tracked.txt"), "initial\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: repositoryPath });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Agent Workbench Tests",
      "-c",
      "user.email=agent-workbench-tests@example.invalid",
      "commit",
      "-m",
      "initial",
    ],
    { cwd: repositoryPath },
  );

  return repositoryPath;
};

const getCurrentCommitSha = (repositoryPath: string) =>
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryPath,
    encoding: "utf8",
  }).trim();

const registerInRepository = <TrialParameters, Graph>(
  repositoryPath: string,
  input: Parameters<typeof registerPublishableGraphFactoryVersion<TrialParameters, Graph>>[0],
) => {
  const previousCwd = process.cwd();

  try {
    process.chdir(repositoryPath);
    return registerPublishableGraphFactoryVersion(input);
  } finally {
    process.chdir(previousCwd);
  }
};

describe("registerPublishableGraphFactoryVersion", () => {
  it("registers a publishable Graph Factory version from complete behavior inputs and clean source", () => {
    // Given
    const repositoryPath = createTemporaryGitRepository();
    const graphFactory = createGraphFactory("graph-factory:teaching-assistant", "v1");
    const expectedCommitSha = getCurrentCommitSha(repositoryPath);

    // When
    const result = registerInRepository(repositoryPath, {
      graphFactory,
      behaviorVersionInputs: baselineBehaviorInputs,
      runtimeProfile: publishedRuntimeProfile,
    });

    // Then
    expect(result).toEqual({
      graphFactory,
      graphFactoryIdentity: "graph-factory:teaching-assistant",
      graphFactoryVersion: "v1",
      behaviorVersion: {
        graph: 'graph-factory-version:["graph-factory:teaching-assistant","v1"]',
        ...baselineBehaviorInputs,
        sourceRevision: expectedCommitSha,
      },
      sourceRevision: {
        commitSha: expectedCommitSha,
        worktreeState: "clean",
      },
    });
  });

  it("rejects a dirty worktree at the registration boundary", () => {
    // Given
    const repositoryPath = createTemporaryGitRepository();
    const graphFactory = createGraphFactory("graph-factory:teaching-assistant", "v1");
    writeFileSync(join(repositoryPath, "tracked.txt"), "modified\n");

    // When
    const registerDirtySourceRevision = () =>
      registerInRepository(repositoryPath, {
        graphFactory,
        behaviorVersionInputs: baselineBehaviorInputs,
        runtimeProfile: publishedRuntimeProfile,
      });

    // Then
    expect(registerDirtySourceRevision).toThrow(
      "Cannot register a publishable Graph Factory version from a dirty worktree",
    );
  });

  it("allows dirty source when the Runtime Profile does not require clean published registration", () => {
    // Given
    const repositoryPath = createTemporaryGitRepository();
    const graphFactory = createGraphFactory("graph-factory:teaching-assistant", "v1");
    const expectedCommitSha = getCurrentCommitSha(repositoryPath);
    writeFileSync(join(repositoryPath, "tracked.txt"), "modified\n");

    // When
    const result = registerInRepository(repositoryPath, {
      graphFactory,
      behaviorVersionInputs: baselineBehaviorInputs,
      runtimeProfile: developmentRuntimeProfile,
    });

    // Then
    expect(result.sourceRevision).toEqual({
      commitSha: expectedCommitSha,
      worktreeState: "dirty",
    });
    expect(result.behaviorVersion.sourceRevision).toBe(expectedCommitSha);
  });

  it("rejects incomplete behavior-version inputs", () => {
    // Given
    const repositoryPath = createTemporaryGitRepository();
    const graphFactory = createGraphFactory("graph-factory:teaching-assistant", "v1");
    const incompleteBehaviorInputs = {
      state: baselineBehaviorInputs.state,
      action: baselineBehaviorInputs.action,
      prompt: baselineBehaviorInputs.prompt,
      tool: baselineBehaviorInputs.tool,
      trialParameter: baselineBehaviorInputs.trialParameter,
    };

    // When
    const registerIncompleteBehaviorVersion = () =>
      registerInRepository(repositoryPath, {
        graphFactory,
        behaviorVersionInputs: incompleteBehaviorInputs,
        runtimeProfile: publishedRuntimeProfile,
      });

    // Then
    expect(registerIncompleteBehaviorVersion).toThrow(
      "Agent Behavior Version inputs are incomplete",
    );
  });

  it("allows one Source Revision to support many Graph Factory identities", () => {
    // Given
    const repositoryPath = createTemporaryGitRepository();
    const tutorGraphFactory = createGraphFactory("graph-factory:tutor", "v1");
    const assessorGraphFactory = createGraphFactory("graph-factory:assessor", "v1");
    const expectedCommitSha = getCurrentCommitSha(repositoryPath);

    // When
    const tutorRegistration = registerInRepository(repositoryPath, {
      graphFactory: tutorGraphFactory,
      behaviorVersionInputs: baselineBehaviorInputs,
      runtimeProfile: publishedRuntimeProfile,
    });
    const assessorRegistration = registerInRepository(repositoryPath, {
      graphFactory: assessorGraphFactory,
      behaviorVersionInputs: baselineBehaviorInputs,
      runtimeProfile: publishedRuntimeProfile,
    });

    // Then
    expect(tutorRegistration.behaviorVersion).toMatchObject({
      graph: 'graph-factory-version:["graph-factory:tutor","v1"]',
      sourceRevision: expectedCommitSha,
    });
    expect(assessorRegistration.behaviorVersion).toMatchObject({
      graph: 'graph-factory-version:["graph-factory:assessor","v1"]',
      sourceRevision: expectedCommitSha,
    });
  });

  it("allows one Graph Factory identity to support many trial parameter versions", () => {
    // Given
    const repositoryPath = createTemporaryGitRepository();
    const graphFactory = createGraphFactory("graph-factory:teaching-assistant", "v1");

    // When
    const baselineRegistration = registerInRepository(repositoryPath, {
      graphFactory,
      behaviorVersionInputs: {
        ...baselineBehaviorInputs,
        trialParameter: "trial-parameter:baseline:v1",
      },
      runtimeProfile: publishedRuntimeProfile,
    });
    const variantRegistration = registerInRepository(repositoryPath, {
      graphFactory,
      behaviorVersionInputs: {
        ...baselineBehaviorInputs,
        trialParameter: "trial-parameter:variant:v2",
      },
      runtimeProfile: publishedRuntimeProfile,
    });

    // Then
    expect(baselineRegistration.behaviorVersion).toMatchObject({
      graph: 'graph-factory-version:["graph-factory:teaching-assistant","v1"]',
      trialParameter: "trial-parameter:baseline:v1",
    });
    expect(variantRegistration.behaviorVersion).toMatchObject({
      graph: 'graph-factory-version:["graph-factory:teaching-assistant","v1"]',
      trialParameter: "trial-parameter:variant:v2",
    });
  });

  it("selects many versions of one stable Graph Factory identity", () => {
    // Given
    const catalog = createPublishableGraphFactoryCatalog([
      createGraphFactory("graph-factory:teaching-assistant", "v1"),
      createGraphFactory("graph-factory:teaching-assistant", "v2"),
    ]);

    // When
    const firstVersion = catalog.selectGraphFactory("graph-factory:teaching-assistant", "v1");
    const secondVersion = catalog.selectGraphFactory("graph-factory:teaching-assistant", "v2");

    // Then
    expect(firstVersion).toMatchObject({
      identity: "graph-factory:teaching-assistant",
      version: "v1",
    });
    expect(secondVersion).toMatchObject({
      identity: "graph-factory:teaching-assistant",
      version: "v2",
    });
  });

  it("keeps colon-delimited identities distinct from version delimiters", () => {
    // Given
    const identityWithColon = createGraphFactory("graph-factory:agent", "v1");
    const versionWithColon = createGraphFactory("graph-factory", "agent:v1");
    const catalog = createPublishableGraphFactoryCatalog([identityWithColon, versionWithColon]);

    // When
    const selectedIdentityWithColon = catalog.selectGraphFactory("graph-factory:agent", "v1");
    const selectedVersionWithColon = catalog.selectGraphFactory("graph-factory", "agent:v1");

    // Then
    expect(selectedIdentityWithColon).toBe(identityWithColon);
    expect(selectedVersionWithColon).toBe(versionWithColon);
  });

  it("captures a clean Git Source Revision as a checkout locator", () => {
    // Given
    const repositoryPath = createTemporaryGitRepository();
    const graphFactory = createGraphFactory("graph-factory:teaching-assistant", "v1");
    const expectedCommitSha = getCurrentCommitSha(repositoryPath);

    // When
    const result = registerInRepository(repositoryPath, {
      graphFactory,
      behaviorVersionInputs: baselineBehaviorInputs,
      runtimeProfile: publishedRuntimeProfile,
    });

    // Then
    expect(result.sourceRevision).toEqual({
      commitSha: expectedCommitSha,
      worktreeState: "clean",
    });
    expect(result.behaviorVersion.sourceRevision).toBe(expectedCommitSha);
  });

  it("creates a LangGraph graph from a stable identity and serializable trial parameters", async () => {
    // Given
    const graphFactory = createAgentGraphFactory<{ answer: string }>({
      identity: "graph-factory:agent",
      version: "v1",
      createGenerateNode: (trialParameters) => () => ({ answer: trialParameters.answer }),
    });
    const catalog = createPublishableGraphFactoryCatalog([graphFactory]);
    const runtime = createPublishableGraphFactoryRuntime(catalog);

    // When
    const graph = runtime.createGraphForTrial({
      graphFactoryIdentity: "graph-factory:agent",
      graphFactoryVersion: "v1",
      trialParameters: {
        answer: "Trial parameter answer",
      },
    });
    const result = await graph.invoke({ prompt: "Explain lexical scope." });

    // Then
    expect(catalog.selectGraphFactory("graph-factory:agent", "v1")).toBe(graphFactory);
    expect(result).toEqual({
      answer: "Trial parameter answer",
    });
  });
});
