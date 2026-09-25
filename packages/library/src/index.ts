// @storytree/library: the project library every later storytree story reads and writes.
// Its public API grows capability by capability (stories/library.md); capability 7 fixes the list.
export { connect } from "./project/index.js";
export type { ConnectOptions, Project, Storytree } from "./project/index.js";
export { DependencyLoopError, MissingReferenceError } from "./references.js";
export { NewerSchemaError, SchemaError, UnknownTypeError } from "./schema/index.js";
export type {
  CreateOptions,
  FieldEdit,
  FieldProblem,
  FieldsOf,
  RecordType,
  SchemaRecord,
  SchemaRecords,
  WriteOptions,
} from "./schema/index.js";
export type {
  EditInput,
  HistoryEntry,
  HistoryFilter,
  RecordEnvelope,
  RetireInput,
  SaveInput,
  Transactions,
  Validate,
} from "./transactions/index.js";
export type {
  ArcNode,
  CapabilityEdit,
  CapabilityNode,
  ContractNode,
  NewArc,
  NewCapability,
  NewContract,
  NewStory,
  ProjectTree,
  StoryNode,
  WorkModel,
} from "./work/index.js";
