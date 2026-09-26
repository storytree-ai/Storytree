/**
 * Capability 7 · Instructions, the habits card (stories/agent-link.md): one short text, a screen or
 * less, that teaches the agent storytree's habits. The tool server hands it to the agent at the
 * start of every session, as its instructions; Claude Code and Codex both read it from there.
 *
 * The card names each tool in backticks, and uses backticks for nothing else: its tests hold it to
 * naming exactly the tools the server has, within 60 lines.
 */
const HABITS_CARD = `storytree keeps the plan of this project and records what you do, so the user can watch it grow. Work with it like this.

Plan first.
- \`show_plan\` shows the plan: every story, capability and contract with its health, who holds what, and which sessions are about.
- Plan a story (something a user can do) with \`plan_story\`, the parts that make it work with \`plan_capability\`, and each testable promise with \`plan_contract\`. Group stories under an initiative with \`plan_arc\`. Correct any of them with \`edit_plan\`.

Claim, and open the knowledge you need.
- \`claim\` a capability, with a one-line reason, before you touch it. If another session holds it, pick other work: nobody queues.
- \`open\` the capability to see its shelf: the decisions that are its way into the project's knowledge, as spines. Start at the shelf, open what matches your task, and stop when you can act. \`search_notes\` finds notes by their words.

Red, then green, then landed.
- Write a contract's test first, run it, see it fail, and \`report\` it red.
- Make it pass, and \`report\` it green.
- When its contracts pass, \`land\` the capability: your claim on it ends. If you stop before then, \`release\` it.

Note what you learned.
- \`write_note\` a memory, a decision or a definition when you learn something worth keeping. With no place named, it goes onto the shelf of the capability you hold.

If storytree says it isn't running, carry on without it.`;

/** The habits card, as the tool server hands it to the agent. */
export function habitsCard(): string {
  return HABITS_CARD;
}
