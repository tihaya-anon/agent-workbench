import {
  OpenInferenceSpanKind,
  SemanticConventions,
} from "@arizeai/openinference-semantic-conventions";

export const agentRunIdentifierVariableName = "agent_run_id";

const agentRunIdentifierTemplate = `$${agentRunIdentifierVariableName}`;

const traceQlAttribute = (name: string) => `span."${name}"`;

const agentRunOutcomeAttribute = `${SemanticConventions.METADATA}.agent_run.outcome`;

export const agentRunDiagnosisFields = {
  apiServiceName: "teach-everything-api",
  rootSpanName: "agent.run",
  runIdSpanAttribute: traceQlAttribute(SemanticConventions.SESSION_ID),
  runOutcomeSpanAttribute: traceQlAttribute(agentRunOutcomeAttribute),
  errorTypeSpanAttribute: traceQlAttribute("error.type"),
  operationKindSpanAttribute: traceQlAttribute(SemanticConventions.OPENINFERENCE_SPAN_KIND),
  graphNodeNameSpanAttribute: traceQlAttribute(SemanticConventions.GRAPH_NODE_NAME),
  toolNameSpanAttribute: traceQlAttribute(SemanticConventions.TOOL_NAME),
  providerNameSpanAttribute: traceQlAttribute(SemanticConventions.LLM_PROVIDER),
  modelNameSpanAttribute: traceQlAttribute(SemanticConventions.LLM_MODEL_NAME),
  inputTokensSpanAttribute: traceQlAttribute(SemanticConventions.LLM_TOKEN_COUNT_PROMPT),
  outputTokensSpanAttribute: traceQlAttribute(SemanticConventions.LLM_TOKEN_COUNT_COMPLETION),
  finishReasonSpanAttribute: traceQlAttribute(SemanticConventions.LLM_FINISH_REASON),
  logTraceIdField: "traceId",
  logAgentRunIdField: "attributes_session_id",
} as const;

export const expectedAgentRunDiagnosisDatasources = {
  tempo: {
    type: "tempo",
    uid: "tempo",
  },
  loki: {
    type: "loki",
    uid: "loki",
  },
} as const;

const selectedRunRootSpan = `{ span:name = "${agentRunDiagnosisFields.rootSpanName}" && ${agentRunDiagnosisFields.runIdSpanAttribute} = "${agentRunIdentifierTemplate}" }`;

const operationFields = [
  "span:name",
  "trace:id",
  "span:duration",
  "span:status",
  agentRunDiagnosisFields.operationKindSpanAttribute,
  agentRunDiagnosisFields.graphNodeNameSpanAttribute,
  agentRunDiagnosisFields.toolNameSpanAttribute,
  agentRunDiagnosisFields.providerNameSpanAttribute,
  agentRunDiagnosisFields.modelNameSpanAttribute,
  agentRunDiagnosisFields.inputTokensSpanAttribute,
  agentRunDiagnosisFields.outputTokensSpanAttribute,
  agentRunDiagnosisFields.finishReasonSpanAttribute,
];

const select = (fields: readonly string[]) => `select(${fields.join(", ")})`;

const childOperationQuery = (condition: string) =>
  `${selectedRunRootSpan} >> { ${agentRunDiagnosisFields.operationKindSpanAttribute} =~ "${OpenInferenceSpanKind.LLM}|${OpenInferenceSpanKind.TOOL}" && ${condition} } | ${select(operationFields)}`;

export const agentRunDiagnosisQueries = {
  selectedRunSummary: `${selectedRunRootSpan} | ${select([
    "span:name",
    "trace:id",
    "span:duration",
    agentRunDiagnosisFields.runOutcomeSpanAttribute,
    agentRunDiagnosisFields.errorTypeSpanAttribute,
  ])}`,
  completeTrace: selectedRunRootSpan,
  slowOperations: childOperationQuery("span:duration > 1s"),
  failedOperations: childOperationQuery("span:status = error"),
  correlatedLogs: `{service_name="${agentRunDiagnosisFields.apiServiceName}"} | json | __error__="" | ${agentRunDiagnosisFields.logTraceIdField} != "" | ${agentRunDiagnosisFields.logAgentRunIdField} != "" | ${agentRunDiagnosisFields.logAgentRunIdField}="${agentRunIdentifierTemplate}"`,
} as const;
