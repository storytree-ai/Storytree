// RETIRED (ADR-0204 D4): the single local-operator model (ADR-0008) is gone — comment
// attribution now derives from the verified `/api/me` identity everywhere this module used to
// sit (see ReviewBlocks.tsx / InlineCommentThread.tsx). No export, no localStorage key remains
// here or anywhere else under apps/studio/src.
export {};
