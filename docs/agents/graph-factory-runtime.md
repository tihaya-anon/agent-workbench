# Graph Factory Runtime Handoff

Python trial tooling selects TypeScript Graph Factories by sending a JSON
`GraphFactoryRuntimeRequest` to a TypeScript runtime entry point. The request carries:

- `graphFactoryIdentity`
- `graphFactoryVersion`
- `trialParameters`

TypeScript entry points should parse the request with
`parseGraphFactoryRuntimeRequestJson` or `readGraphFactoryRuntimeRequestFromStdin`, then pass it to
`createPublishableGraphFactoryRuntime(...).createGraphForTrial(request)`.

Example process shape:

```bash
python make-trial-request.py | pnpm exec tsx path/to/trial-runtime.ts
```

The TypeScript entry point owns the direct LangGraph factory catalog. Python supplies selection and
parameters; it does not emit a graph schema, graph IDL, canonical graph bundle, or compiled graph.
