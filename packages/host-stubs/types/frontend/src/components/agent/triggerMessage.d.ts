/**
 * Reader for autonomous-trigger first messages.
 *
 * Raw format (`backend/src/modules/triggers/service.rs`):
 * "[Autonomous trigger task] <preamble>\n\n<action_prompt>\n\n--- Event context ---\n..."
 */
/**
 * Extract the readable action prompt from an autonomous trigger message, so
 * the transcript bubble shows the task rather than the boilerplate.
 *
 * The preamble is the FIRST paragraph, so the first blank line ends it. Do not
 * search for words from the preamble's prose: an action prompt is authored per
 * trigger and may contain the same phrase, which cuts at the wrong paragraph
 * and surfaces the event context as the task (tst_fe_agent_053). The backend
 * keeps the preamble to one paragraph for this reason
 * (tst_svc_triggers_preamble_002).
 */
export declare function extractTriggerPrompt(raw: string): string;
