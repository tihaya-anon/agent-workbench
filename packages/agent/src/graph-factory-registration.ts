import { execFileSync } from "node:child_process";

import {
  graphFactoryRuntimeRequestSchema,
  runtimeProfileSchema,
  strictAgentBehaviorVersionSchema,
  type GraphFactoryRuntimeRequest,
  type RuntimeProfile,
  type StrictAgentBehaviorVersion,
} from "@teach-everything/shared";

export interface PublishableGraphFactory<TrialParameters, Graph> {
  readonly identity: string;
  readonly version: string;
  createGraph: (trialParameters: TrialParameters) => Graph;
}

export interface SourceRevisionState {
  readonly commitSha: string;
  readonly worktreeState: "clean" | "dirty";
}

export interface PublishableGraphFactoryVersionRegistrationInput<TrialParameters, Graph> {
  readonly graphFactory: PublishableGraphFactory<TrialParameters, Graph>;
  readonly behaviorVersionInputs: unknown;
  readonly runtimeProfile: unknown;
}

export interface PublishableGraphFactoryVersionRegistration<TrialParameters, Graph> {
  readonly graphFactory: PublishableGraphFactory<TrialParameters, Graph>;
  readonly graphFactoryIdentity: string;
  readonly graphFactoryVersion: string;
  readonly behaviorVersion: StrictAgentBehaviorVersion;
  readonly sourceRevision: SourceRevisionState;
}

export interface PublishableGraphFactoryCatalog<TrialParameters, Graph> {
  listGraphFactories: () => ReadonlyArray<PublishableGraphFactory<TrialParameters, Graph>>;
  selectGraphFactory: (
    identity: string,
    version: string,
  ) => PublishableGraphFactory<TrialParameters, Graph>;
  createGraph: (identity: string, version: string, trialParameters: TrialParameters) => Graph;
}

export interface PublishableGraphFactoryRuntime<Graph> {
  createGraphForTrial: (request: unknown) => Graph;
}

interface GraphFactoryVersionRef {
  readonly identity: string;
  readonly version: string;
}

const graphFactoryVersionKey = ({ identity, version }: GraphFactoryVersionRef) =>
  JSON.stringify([identity, version]);

const ensureConcreteGraphFactoryMetadata = <TrialParameters, Graph>(
  graphFactory: PublishableGraphFactory<TrialParameters, Graph>,
) => {
  const graphFactoryIdentity = graphFactory.identity.trim();
  const graphFactoryVersion = graphFactory.version.trim();

  if (graphFactoryIdentity.length === 0 || graphFactoryVersion.length === 0) {
    throw new RangeError("Graph Factory identity and version metadata must be present");
  }

  return {
    graphFactoryIdentity,
    graphFactoryVersion,
    graphBehaviorVersion: `graph-factory-version:${graphFactoryVersionKey({
      identity: graphFactoryIdentity,
      version: graphFactoryVersion,
    })}`,
  };
};

export const captureGitSourceRevision = (cwd = process.cwd()): SourceRevisionState => {
  try {
    const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
    }).trim();
    const statusOutput = execFileSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf8",
    });

    return {
      commitSha,
      worktreeState: statusOutput.trim().length === 0 ? "clean" : "dirty",
    };
  } catch (cause) {
    throw new RangeError("Could not capture Source Revision from Git", { cause });
  }
};

export const createPublishableGraphFactoryCatalog = <TrialParameters, Graph>(
  graphFactories: ReadonlyArray<PublishableGraphFactory<TrialParameters, Graph>>,
) => {
  const factoriesByVersionKey = new Map<string, PublishableGraphFactory<TrialParameters, Graph>>();

  for (const graphFactory of graphFactories) {
    const { graphFactoryIdentity, graphFactoryVersion } =
      ensureConcreteGraphFactoryMetadata(graphFactory);
    const factoryVersionKey = graphFactoryVersionKey({
      identity: graphFactoryIdentity,
      version: graphFactoryVersion,
    });

    if (factoriesByVersionKey.has(factoryVersionKey)) {
      throw new RangeError(
        `Duplicate Graph Factory version: ${graphFactoryIdentity} ${graphFactoryVersion}`,
      );
    }

    factoriesByVersionKey.set(factoryVersionKey, graphFactory);
  }

  const selectGraphFactory = (identity: string, version: string) => {
    const requestedIdentity = identity.trim();
    const requestedVersion = version.trim();
    const graphFactory = factoriesByVersionKey.get(
      graphFactoryVersionKey({
        identity: requestedIdentity,
        version: requestedVersion,
      }),
    );

    if (graphFactory === undefined) {
      throw new RangeError(
        `Unknown Graph Factory version: ${requestedIdentity} ${requestedVersion}`,
      );
    }

    return graphFactory;
  };

  return {
    listGraphFactories: () => [...factoriesByVersionKey.values()],
    selectGraphFactory,
    createGraph: (identity, version, trialParameters) =>
      selectGraphFactory(identity, version).createGraph(trialParameters),
  } satisfies PublishableGraphFactoryCatalog<TrialParameters, Graph>;
};

export const createPublishableGraphFactoryRuntime = <TrialParameters, Graph>(
  catalog: PublishableGraphFactoryCatalog<TrialParameters, Graph>,
) =>
  ({
    createGraphForTrial: (request) => {
      const parsedRequest = graphFactoryRuntimeRequestSchema.parse(
        request,
      ) as GraphFactoryRuntimeRequest & {
        readonly trialParameters: TrialParameters;
      };

      return catalog.createGraph(
        parsedRequest.graphFactoryIdentity,
        parsedRequest.graphFactoryVersion,
        parsedRequest.trialParameters,
      );
    },
  }) satisfies PublishableGraphFactoryRuntime<Graph>;

export const registerPublishableGraphFactoryVersion = <TrialParameters, Graph>({
  graphFactory,
  behaviorVersionInputs,
  runtimeProfile,
}: PublishableGraphFactoryVersionRegistrationInput<TrialParameters, Graph>) => {
  const parsedRuntimeProfile: RuntimeProfile = runtimeProfileSchema.parse(runtimeProfile);
  const sourceRevision = captureGitSourceRevision();

  if (
    parsedRuntimeProfile.runtimePolicy.sourceRevision.requireCleanForPublishedGraphVersions &&
    sourceRevision.worktreeState !== "clean"
  ) {
    throw new RangeError(
      "Cannot register a publishable Graph Factory version from a dirty worktree",
    );
  }

  const { graphFactoryIdentity, graphFactoryVersion, graphBehaviorVersion } =
    ensureConcreteGraphFactoryMetadata(graphFactory);
  const behaviorVersionResult = strictAgentBehaviorVersionSchema.safeParse({
    ...(typeof behaviorVersionInputs === "object" && behaviorVersionInputs !== null
      ? behaviorVersionInputs
      : {}),
    graph: graphBehaviorVersion,
    sourceRevision: sourceRevision.commitSha,
  });

  if (!behaviorVersionResult.success) {
    throw new RangeError("Agent Behavior Version inputs are incomplete", {
      cause: behaviorVersionResult.error,
    });
  }

  return {
    graphFactory,
    graphFactoryIdentity,
    graphFactoryVersion,
    behaviorVersion: behaviorVersionResult.data,
    sourceRevision,
  } satisfies PublishableGraphFactoryVersionRegistration<TrialParameters, Graph>;
};
