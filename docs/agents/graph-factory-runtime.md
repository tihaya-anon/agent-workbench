# Deprecated TypeScript Graph Factory Runtime

Status: deprecated after Python runtime parity work. Keep this document as an archive for tests,
compatibility, and old experiment notes; do not build new production Agent Run behavior on the
TypeScript Graph Factory runtime.

Python is now the runtime owner. The TypeScript workspace owns the API gateway, shared contracts,
Runtime Profile validation, Agent Run Stream stability, and telemetry vocabulary. The Python runtime
repository `tihaya-anon/agent-runtime-python` owns LangGraph execution and experiment performance.

ADR 0008 originally selected TypeScript Graph Factories as the near-term runtime artifact. The
Python runtime migration supersedes that runtime-ownership decision while preserving the ADR 0008
decision to defer a language-neutral Agent Graph Spec.

## Parity And Retirement Criteria

The TypeScript Graph Factory runtime can stay only as archived compatibility code until these
criteria remain true:

- API startup uses `createPythonWorkerAgentRunExecutor` when Agent Runs are enabled.
- Frontend tests continue to consume the same Agent Run Stream contract.
- Worker protocol schemas and telemetry names remain language-neutral in `packages/shared` and
  `packages/observability`.
- Python worker runs support start, cancellation, validation failure, progress suppression,
  terminal classification, and local experiment sweeps.
- No production application imports `createAgentGraph`, `createAgentGraphFactory`,
  `createPublishableGraphFactoryRuntime`, or `readGraphFactoryRuntimeRequestFromStdin`.

When a future cleanup removes the archived TS runtime helpers, keep the language-neutral
`AgentRunExecutor` contract in `packages/agent`; it is the gateway seam used by the Python worker
adapter.

## Archived Design

The rest of this document records the old TypeScript runtime model so archived tests and historical
experiment notes remain interpretable. Treat the examples as non-production migration history.

## Former Split Of Responsibility

The original design kept behavior definition in TypeScript:

- Defines Graph Factories as direct LangGraph code.
- Assigns each factory a stable `identity` and `version`.
- Registers publishable factory versions with Agent Behavior Version inputs and a Runtime Profile.
- Builds the factory catalog used by the runtime entry point.
- Creates and executes the selected graph.

Python originally owned experiment orchestration around the TypeScript runtime:

- Chooses trial matrices, parameter sweeps, seeds, and repetitions.
- Selects a TypeScript `graphFactoryIdentity` and `graphFactoryVersion`.
- Sends JSON `trialParameters` to the TypeScript runtime.
- Captures process output, telemetry references, and trial results.

That split is superseded. New behavior variants now belong in the Python runtime repository.

## Former TypeScript Definition

The archived runtime defined factories in a TypeScript module owned by the runtime or experiment
package. A factory was a small object with an identity, version, and `createGraph` function.

```ts
import {
  createAgentGraphFactory,
  createPublishableGraphFactoryCatalog,
  createPublishableGraphFactoryRuntime,
  readGraphFactoryRuntimeRequestFromStdin,
} from "@teach-everything/agent";

const baselineTutorFactory = createAgentGraphFactory<{ promptStyle: string }>({
  identity: "graph-factory:tutor",
  version: "v1",
  createGenerateNode: (trialParameters) => async (state) => ({
    answer: `${trialParameters.promptStyle}: ${state.prompt}`,
  }),
});

const catalog = createPublishableGraphFactoryCatalog([baselineTutorFactory]);
const runtime = createPublishableGraphFactoryRuntime(catalog);

const request = readGraphFactoryRuntimeRequestFromStdin();
const graph = runtime.createGraphForTrial(request);
const result = await graph.invoke({ prompt: "Explain lexical scope." });

process.stdout.write(`${JSON.stringify(result)}\n`);
```

The runtime request is validated by `graphFactoryRuntimeRequestSchema`. It carries only:

- `graphFactoryIdentity`
- `graphFactoryVersion`
- `trialParameters`

## Former Publishable Registration

When an archived Graph Factory version was promoted for comparable trials, registration captured
complete behavior identity inputs, the current Git Source Revision, the Runtime Profile source
policy, and a strict Agent Behavior Version tuple.

```ts
import { registerPublishableGraphFactoryVersion } from "@teach-everything/agent";
import publishedProfileDocument from "../../profiles/runtime-published.json";

const registration = registerPublishableGraphFactoryVersion({
  graphFactory: baselineTutorFactory,
  runtimeProfile: publishedProfileDocument,
  behaviorVersionInputs: {
    state: "state:lesson-session:v1",
    action: "action:tutor-response:v1",
    prompt: "prompt:socratic:v3",
    tool: "tool:retrieval:v2",
    model: "model:openai:gpt-5:2026-07-20",
    trialParameter: "trial-parameter:baseline:v1",
  },
});
```

Under `profiles/runtime-published.json`, dirty worktrees are rejected so the Source Revision is a
checkoutable commit. Under a development Runtime Profile, dirty source can be allowed for local
ad hoc work, but those runs are not comparable or promotable.

## Former Python Orchestration

In the archived model, Python sent a runtime request to a TypeScript process. The request selected a
pre-existing TypeScript factory and supplied JSON trial parameters.

```python
import json
import subprocess

request = {
    "graphFactoryIdentity": "graph-factory:tutor",
    "graphFactoryVersion": "v1",
    "trialParameters": {
        "promptStyle": "socratic",
    },
}

completed = subprocess.run(
    ["pnpm", "exec", "tsx", "experiments/tutor-runtime.ts"],
    input=json.dumps(request),
    text=True,
    capture_output=True,
    check=True,
)

result = json.loads(completed.stdout)
```

For parameter sweeps, Python repeated this call with different `trialParameters` or different
factory selectors. The TypeScript catalog decided whether the requested identity and version
existed.

```python
for prompt_style in ["socratic", "direct", "hint-first"]:
    request = {
        "graphFactoryIdentity": "graph-factory:tutor",
        "graphFactoryVersion": "v1",
        "trialParameters": {"promptStyle": prompt_style},
    }
    # historical: invoke the TypeScript runtime and record the result
```

## Current Runtime Profile Selection

The API server selects Runtime Profile content from reviewable JSON documents:

- `RUNTIME_PROFILE_PATH=/path/to/profile.json` selects an explicit profile document.
- `NODE_ENV=production` defaults to `profiles/runtime-published.json`.
- Other environments default to `profiles/runtime-development.json`.

Profile selection may come from environment or CLI wiring, but policy content belongs in the JSON
document. Do not encode policy inline in Python, shell scripts, or environment variables.

## Former Rejection Of Python-Defined Factories

The archived design rejected Python-defined factories because they would have required one of these
unsupported TypeScript-runtime designs:

- A graph schema or IDL that Python emits and TypeScript compiles.
- Loading Python code or Python graph objects inside the TypeScript runtime.
- A cross-language behavior serialization format for LangGraph objects.

Those options remain out of scope for the TypeScript workspace. Current LangGraph SDK usage belongs
inside the Python runtime repository instead.
