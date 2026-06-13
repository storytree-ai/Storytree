# Anti-slop inbound-signal gate — research breakdown + design

*Prepared for the founder, 2026-06-13. A discussion/design report — no code changed. Grounds the
design in storytree's real systems (ADRs, OQs, the library tier, comments, verdicts, users/roles).*

---

## Bottom line up front

- **Don't build "convince the AI" as a hard admission gate.** The prior research was right, and newer
  frontier models (Fable 5, Opus 4.8) do **not** rescue it. Stronger models fix the *one* objection
  that was model-dependent (they're harder to *sweet-talk past*) but leave the *fatal* objections
  untouched — they're structural, not capability-bound.
- **Your instinct is half-right, and the right half points at the librarian.** Newer models make
  AI-as-**assist** (interview, sharpen, dedupe, label) genuinely more reliable than it was. That is
  exactly the strength the librarian uses — and exactly the strength the bouncer *doesn't* depend on.
  So model recency strengthens the helpful librarian, not the gatekeeper.
- **Put friction on identity/reputation, not on a debate or an API key** — and storytree already has
  the scaffolding (IAP auth + invite-graph + users/roles + account timestamps).
- **The defensible, novel move is dedup against your decision corpus.** Almost no repo has a
  structured ADR/OQ/verdict corpus to dedupe against; you do. That's the unfair advantage, and it's
  what flips the cost asymmetry back onto the spammer.

---

## 1. The prior research, in plain language

### The core problem is an asymmetry
Submitting a "signal" — a concern, a comment, a "we should build this" — used to cost a human some
effort to write. With an LLM it now costs **one prompt and a fraction of a cent**. But *reviewing* a
signal still costs a scarce human their attention. Cheap to produce, expensive to judge. Every
anti-slop scheme is really an attempt to re-balance that scale. If a scheme doesn't make *producing*
cost more than *ignoring*, it doesn't work — it just relocates the cost.

### Someone already ran your experiment, and it failed
**curl** added friction, AI-usage rules, and bans to fight a flood of AI-generated security reports,
and in **January 2026 they shut the bug-bounty program down anyway.** At one point only ~5% of
submissions were genuine and ~20% were obvious AI slop; maintainer Daniel Stenberg described it as AI
"DDoSing" the project. Node.js tightened signal requirements; libxml2's maintainer stopped taking
embargoed reports entirely. The lesson: **friction-as-filter doesn't separate signal from noise** —
it just taxes everyone, and the honest are taxed hardest. (Sources at the end: socket.dev, hackaday,
arxiv "Endless Stream of AI Slop".)

### The industry deliberately uses AI as assist, never as a hard gate
This isn't an oversight nobody's gotten around to. GitHub's own `ai-moderator` **labels and minimizes**
spammy issues — it never auto-rejects. Reddit's AutoModerator + Perspective API is the same shape:
flag, route, downrank, and keep a human in the loop. GitHub is even discussing a PR "kill switch" for
maintainers — *more* human control, not less. The convergence is intentional: AI is good at
**triage** (sort, label, surface) and bad at **admission** (the final yes/no).

### "Convince the AI" is a known-broken security pattern
Persuasion gates leak. Lakera's **Gandalf** — a game whose entire job is "talk the AI into letting you
past" — has logged ~9M attempts, and even its hardened Level 7 is beaten by roughly 8% of players.
No production admission-control system anywhere is built on *persuading* an LLM, because persuasion is
precisely the attack surface. "Stop letting models grade their own homework" is the title of one of
Lakera's pieces for a reason.

### LLM-as-judge is measurably unreliable
Used as a judge, LLMs show **position bias** (favoring whichever answer is presented second/first —
in code-judging, just swapping order shifts accuracy >10%), **verbosity bias** (longer = better,
regardless of content), and **self-preference bias**. A 2026 audit found frontier models exceeding
**50% error rates on bias tests**, and verdicts that flip on trivial rephrasing. A gate that gives a
different answer when you reword your pitch is both gameable and unfair.

### Attacker economics defeat "bring your own API key"
The idea: make the spammer pay per attempt so spam costs them money. But in 2026 the cheap models are
**~$0.05–0.15 per *million* input tokens** (GPT-4.1 Nano at $0.10, $0.05 batched; Gemini Flash-Lite
$0.10; DeepSeek V3.2 $0.14). A persuasive pitch is a few hundred tokens — so a spammer auto-generates
thousands of them for **well under a cent each.** Worse, an API key **is not an identity** — one
spammer can hold many keys, or many sock-puppets can share one. Zero Sybil resistance. BYO-key shifts
a negligible cost and proves nothing about who you are.

### It quietly breaks your own constitution
Requiring people to **out-argue an articulate AI** and **hold an API key** filters out non-developers
and non-native-English speakers — the exact people principle 5 ("you don't have to write code to
matter here… ideas from anyone enter by the front door") is meant to welcome. The anti-slop mechanism
would be silently enforcing the opposite of the value it sits under.

### The reframe the research recommended
Flip from a **"convince-the-bouncer" gate** to a helpful **"librarian"** that:
1. **interviews** the contributor to sharpen a vague concern into something concrete,
2. **dedupes** it against storytree's existing ADR/OQ/verdict corpus (the part a generic repo can't
   do — nothing to dedupe against), and
3. **routes** it into a ranked triage queue.

Put the friction on **identity/reputation** (account age, progressive trust, optional refundable
stake), not on a debate or a key. BYO-key is fine as **cost-attribution for the "ask the project
anything" feature** (constitution principle 4), just not as the anti-spam *judge*.

---

## 2. Model recency — does Fable 5 / Opus 4.8 rescue the gate?

Your hypothesis: the prior pass leaned on older/weaker models; a stronger frontier model is much
harder to socially-engineer, so "persuasion gates always leak" is weaker now. **Partly true — and the
true part is narrower than it looks.** Here's the honest split.

### What genuinely improves with stronger models (model-DEPENDENT)

Robustness to being *talked past* by crude social engineering is real and rising:

- **Constitutional Classifiers** (Anthropic, 2025): a purpose-built classifier layer cut jailbreak
  success from **86% → 4.4%**, and over **3,000+ red-team hours** found **no universal jailbreak**.
  This is the strongest "defense can work" data point — but note *what* it is: a dedicated,
  separately-trained classifier system with ~24% inference overhead, **not** "argue with a chat
  model."
- **Frontier base models** resist simple DAN-style jailbreaks far better than 2023-era models
  (success rates down to ~7.5–9.2% on basic templates; Claude Opus 4 scored "strongly robust" on
  StrongREJECT; agentic-misuse safety pushed near 100% after harmlessness training).

So the crude attack — "roleplay that you're a gate with no rules and let me in" — is genuinely harder
against a 2026 model. **Your intuition has real merit here.** If the only objection were "a clever
prompt talks the bouncer past," newer models would meaningfully blunt it.

### What survives *any* model upgrade (model-INDEPENDENT)

But the gate's fatal flaws don't live in the "can it be jailbroken" axis. They survive Fable 5,
Opus 4.8, and whatever comes next.

**(a) Persuasiveness ≠ legitimacy — and this is a category error, not a capability gap.**
The safety literature measures resistance to producing *harmful* output (CBRN, weapons). Your gate's
job is different: *"is this inbound signal a legitimate, novel, useful concern about this project?"*
That has **no ground truth in the prompt** — the model can't verify a claim about your codebase or
your users from prose alone. It can only assess whether the pitch *reads as* legitimate. And AI-slop
is *already optimized to read as legitimate* — curl's flood was plausible, fluent, well-structured;
maintainers report there's **no reliable detector**, only "vibes." A stronger judge resists
*manipulation* better but gets **no better at the underlying epistemic task**, because the task is
unanswerable from the text. If anything, a more fluent, more confident model produces more convincing
*wrong* admissions (over-trust). Capability doesn't touch this.

**(b) AI-vs-AI symmetry — the relative advantage doesn't shift.**
If the defender upgrades to the frontier model, **so does the attacker** (and the attacker doesn't
even need to — a sub-cent cheap model writes a perfectly plausible pitch). Both sides rise together;
the *relative* gap doesn't obviously move to the defender. And the asymmetry that actually matters —
**cheap to generate, expensive to verify** — is completely untouched by model strength. Fresh
evidence that the arms race continues *at the frontier, between AIs*: AIM Intelligence's red team
**jailbroke Claude Opus 4.6 within 30 minutes of its February 2026 release** (its refusal rate on
safety-research queries had dropped ~60%→14%), and **Gemini 3 Pro in under 5 minutes.** "Models
achieving state-of-the-art on standard benchmarks can still be compromised within minutes, and
traditional safety approaches aren't scaling with capability." Newer ≠ unbreakable.

**(c) Inclusivity/onboarding — and it gets *worse*, not better.**
A stronger, more articulate, harder-to-budge gatekeeper *raises* the bar a non-native speaker or
non-dev must clear to "win the argument." Model recency makes this objection sharper. It directly
contradicts principle 5.

**(d) Judge consistency/bias — a property of the paradigm, not the model.**
Position bias, verbosity bias, self-preference, and rephrase-sensitivity are documented on *frontier*
models in 2026 (>50% error on bias tests; >10% accuracy swings from reordering in code-judging). Some
narrow with capability, but they don't vanish — they're inherent to using a generative model as a
scorer. A gate whose verdict you can flip by rewording is gameable and unfair regardless of how smart
the model is.

### Honest verdict

> **Newer-model strength makes the gate harder to *trivially fool*, but does not rescue it — because
> three of its four core problems (persuasiveness≠legitimacy, AI-vs-AI symmetry, inclusivity) and most
> of the fourth (judge bias) are model-independent.** Importing "models got more jailbreak-robust"
> into "models can now gate legitimacy" is a category error: safety-refusal and legitimacy-judgment
> are different tasks, and only the former is what improved.

The useful corollary: the *same* capability gains **do** make a model reliable enough to **assist** —
to interview, summarize, and surface near-duplicates. So model recency is a real argument *for the
librarian* and *against the bouncer*. Build the thing that uses the part that improved.

---

## 3. Additive mechanisms — design + adversarial pressure-test

You're right that bare "argue it out" is just a start. Let's stack everything you named — ranking,
human votes, turn limits, reputation, stake, rate limits, progressive trust — into the strongest
possible **gate** ("System A"), pressure-test it, and watch where it lands. Then compare to the
**librarian** ("System B", developed fully in §4).

### System A — "The Gauntlet" (argue-it-out as the spine, everything bolted on)

Pipeline: *account + age → refundable stake → turn-limited AI debate (must persuade) → ranked queue →
human votes to graduate.*

Pressure-testing each layer — **where it helps, and where it just moves the problem:**

- **Turn limit** (cap the back-and-forth, e.g. 5 turns).
  *Helps:* stops a prompt-injection attacker from grinding the model indefinitely in one session.
  *Moves the problem:* (1) it bites the **wrong party** — an honest, confused newcomer also runs out
  of turns, while a spammer with a pre-baked frontier-model pitch needs *one* turn; (2) it caps
  *depth* per attempt but not *breadth* — 1,000 sock-puppets each making one clean attempt sail
  through. Turn-limiting a *judge* gate mostly penalizes sincerity.

- **Refundable stake** (put up money, get it back if "legit").
  *Helps:* raises per-attempt cost *if* identity is costly to mint.
  *Moves the problem:* (1) "refunded if legit" requires a working legitimacy judge to decide the
  refund — so you've re-imported the **broken judge as a financial oracle**, now with money disputes
  attached; (2) a small stake is negligible to a funded spammer, a large stake excludes the
  honest-but-poor (violates principle 5); (3) needs payment rails, KYC-ish friction, and a refund
  mechanism — heavy, and exclusionary.

- **Reputation / progressive trust.**
  *Helps:* genuinely — this is the strongest layer. Past good behavior is a real, hard-to-fake signal.
  *Moves the problem:* it's an **identity** lever, not a **judge** lever — it works *despite* the AI
  debate, not *because* of it. And it has a cold-start: a young project's reputation graph is thin, so
  brand-new honest users look identical to spammers on day one.

- **Ranking + human votes.**
  *Helps:* a lot — but notice what just happened: **the decision moved from the AI back to humans.**
  *Moves the problem:* (1) votes are Sybil-able without identity cost; (2) they **reintroduce the
  human-attention cost** the whole scheme was trying to save — someone has to *read* to vote. Useful
  as *ordering*, not as *admission*.

**Verdict on System A:** every layer that actually helps (reputation, ranking, human votes) is doing
**identity/triage** work; the "argue-it-out" spine is the **weakest and most exclusionary** layer, and
the additions quietly route around it. Pressure-tested, System A *collapses toward* a
reputation-gated, ranked triage queue with AI assist — i.e. it collapses toward System B. That's the
tell: the debate isn't load-bearing.

### System B — "Librarian + reputation rails" (recommended; full build in §4)

Pipeline: *account + progressive-trust tier → turn-limited AI **interview (to sharpen, not judge)** →
**dedupe against the corpus** → ranked triage queue → human votes/cites to graduate → (proof gate only
for shipping).*

The same four mechanisms you asked about slot in — but onto a **dedup spine** instead of a debate:

- **Turn limit → the interview.** 3–6 turns to help a vague concern become a structured one. It caps
  grinding *and* stays humane (it's helping, not interrogating). The honest newcomer *benefits* from
  the turns; the spammer's pre-baked pitch gets deduped fast regardless.
- **Ranking → the triage-queue order** (novelty × reputation × corpus-fit).
- **Human votes → graduation** (using your existing cite-link signal-graph, ADR-0032), spent on the
  *top* of a deduped queue rather than the raw firehose.
- **Reputation/stake/rate-limits → identity rails**, where friction actually deters Sybils.

Crucially, **dedupe flips the asymmetry**: generating a pitch costs the spammer; *ignoring a
low-ranked, deduped item costs the maintainer nothing.* That's the first design here where producing
finally costs more than ignoring.

---

## 4. It's really a dedup problem — the librarian, grounded in storytree's real systems

This is the strongest synthesis, and storytree is unusually well-suited to it because **the corpus to
dedupe against already exists and is structured and queryable.** Below, every stage maps to real
tables, kinds, and commands.

### Your unfair advantage, concretely
- **46 ADRs** (`docs/decisions/0001–0046`), each with CI-validated YAML frontmatter (`status`,
  `decided`, `supersedes`/`supersedes_in_part`/`amends` edges — ADR-0037).
- **Open Questions** as first-class library artifacts (`kind: "open-question"`), with structured
  fields `stakes / statement / context / options / recommendation / references`
  (`packages/core/src/knowledge.ts`).
- **~80+ library units** across kinds `definition · principle · pattern · guardrail · techstack ·
  process · open-question · agent`, all carrying **typed cite-links** in `references` (`doc:<path>` or
  `asset:<id>`) — ADR-0032's signal-graph.
- **Signed verdicts** (`events.verdict`: `proof_mode`, `outcome`, `signer`, `commit_sha`) — proof that
  something was *already decided and built*.
- **Verified identities + roles** (`events."user"`: email, `role` admin/member, `status`
  invited/active, `invitedBy`, `createdAt`, `lastSeenAt` — ADR-0043) and an **invite-graph**.
- **A comment system** (`events.comment`: `topicKind` doc|asset, `topicId`, `anchor`, `author`
  [IAP-verified email], `resolved`) that already attaches inbound signal to ADRs/artifacts.

A generic repo dedupes a new issue against… past issues. storytree dedupes against a **structured
decision record**. That's the moat.

### The pipeline

**Intake → Interview → Dedupe → Route → Rank → Graduate → (Proof, only for shipping)**

**1. Intake.** A new inbound signal is a candidate that, if it survives, becomes an OQ or a
story/capability proposal. Model it either as a draft `open-question` in a `proposed` state, or a new
lightweight `signal` artifact kind that mirrors the existing event-sourced pattern
(`events.signal` + `events.signal_event`, like comments/users). Author is stamped from the IAP
identity (`events."user"`) — **no anonymous intake, but no API key either.**

**2. Interview (turn-limited — your "turn limit" lives here).** The AI's job is explicitly **not** to
decide legitimacy. It is to: (a) sharpen vague → specific; (b) elicit the **exact structured fields an
OQ needs** (`stakes`, `statement`, `context`, `options`) — the schema already tells the model what
"complete" looks like; (c) surface near-duplicates *live* ("this sounds close to ADR-0030 — is your
point new?"). Cap at 3–6 turns. This is the part newer models make *better* (§2) — sharpening and
summarizing is the assist task, not the judge task. Honest newcomers get help; spammers get deduped.

**3. Dedupe against the corpus — the core.** Search **ADRs + OQs + library artifacts + verdicts** for
overlap. Output, e.g.: *"Your concern overlaps **ADR-0030** (decided 2026-06-10, accepted) and the open
question `oq-…`. Here's what was decided. Is your point new, or a challenge to that decision?"* This
both **filters slop** (most slop is a rehash of something already decided) and **routes legit-but-known
signal** to the right existing thread.
   - **Build target / honest gap:** `library search` (semantic/embedding similarity over the corpus)
     is **not built yet** — the current surface is only `storytree library artifact list <category>`
     (exact-kind filter). **This is the concrete thing to build**, and it's the keystone of the whole
     design. Without it, dedupe is manual.

**4. Route.**
   - *Novel* → create the draft signal/OQ in a **triage** state (`status: proposed`) and enqueue it.
   - *Duplicate or challenge* → attach as a **comment** (`events.comment`) on the existing ADR/OQ
     topic with a **cite-link** (ADR-0032), feeding the existing **OQ-gate** (`classifyOpenQuestions`,
     `packages/cli/src/oq-gate.ts`) and signal-graph. Reuse what's built: verified author, `resolved`
     flag, anchors.
   - **Design rule: dedupe ROUTES, never SILENCES.** A challenge to a decided ADR must land as a
     visible comment/cite, not be dropped as a "duplicate." (This matches your own note: a librarian
     that dedupes, *not* a convince-the-AI gate.)

**5. Rank (your "ranking").** Order the triage queue by a composite:
`novelty (low corpus-overlap = higher) × submitter trust-tier × corpus-fit (does it cite real
units?)`. Trust-tier derives from data you already store: account age (`createdAt`),
active-vs-invited (`status`), and prior graduated signals.

**6. Graduate (your "human votes").** Members/admins (`events."user"` roles) **upvote or cite**.
Graduation reuses ADR-0032: cites are typed links forming a signal-graph; enough weight triggers a
synthesis step that promotes the signal into an OQ or a story/capability proposal (the "future
synthesis agent" of ADR-0014/0032). The key win: **humans spend attention on the top of a deduped,
ranked queue — not the raw firehose.** This is principle 5 done right: the idea is *heard and
visible and weighed in the open*, without an AI bouncer deciding.

**7. Proof gate — keep it where it is.** Principle 6's prove-it-gate (`events.verdict`, red-green)
gates **shipping code**, never **being heard**. The anti-slop mechanism lives entirely on the
*admission* side; do not let it leak into the *proof* side. Admission is cheap + assisted; shipping is
proven. Two different gates for two different things.

### Identity / reputation rails (the friction that actually works)
- **Account + age:** `createdAt` already exists; new accounts' signals enter lower-ranked and
  rate-limited.
- **Progressive trust:** `invited → active → trusted` tiers; a graduated signal raises your tier.
  Cheap, fair, and Sybil-resistant in a way a key never is.
- **Invite-graph:** `events."user".invitedBy` already records who vouched for whom — a real
  Sybil-defense primitive you can lean on.
- **Rate limits per identity**, not per attempt.
- **Refundable stake — optional, and only as anti-flood for un-vouched accounts**, never as the
  legitimacy oracle.
- **BYO-key — only as cost-attribution for the "ask the project anything" conversation** (constitution
  principle 4), so heavy interactive users bear inference cost. Not the anti-spam judge.

### Adversarial pressure-test of the librarian
- **Spam flood (1,000 AI pitches):** dedupe catches the rehashes (most slop). Novel-*sounding* slop
  still passes dedupe — but lands in a **low-ranked** slot (new/un-vouched identity, no cites) and is
  rate-limited. Human attention is spent top-down, so low-rank slop costs ≈0 to ignore. **Asymmetry
  finally favors the defender.**
- **Sybil farm (many accounts to farm votes/reputation):** the real residual risk — mitigated by
  **identity cost** (account age, optional stake for un-vouched, the existing invite-graph), *not* by
  the AI. storytree's IAP + admin-invite model (ADR-0043) is already a far better Sybil defense than
  an API key (a Google account + a human vouch beats a free key).
- **Legit dissent ("I want to challenge a decided ADR"):** must not be dedup-suppressed. Routed to the
  ADR as a comment/cite; the OQ-gate already surfaces unprocessed challenges. Dissent is *routed*, not
  *silenced*.
- **Cold-start (young project, thin user graph):** dedupe **works from day one** because the corpus
  (ADRs/OQs/verdicts) already exists even when the reputation graph is thin — the unfair advantage
  again. The early "inner-circle-first" phase (per the constitution) is exactly when a thin reputation
  graph is acceptable.

### Could be a story
This maps cleanly onto a `stories/inbound-signal` (or `stories/librarian`) story with capabilities like
`corpus-search` (build `library search`), `signal-intake` (interview + draft-signal state),
`triage-queue` (rank), and `signal-graduation` (votes/cites → OQ/proposal). It also deserves a recorded
**open question** of its own — "how does inbound signal enter the work hierarchy?" — which is itself a
nice dogfood of the mechanism.

---

## 5. Recommendation

1. **Don't ship "convince the AI" as a hard admission gate.** Confirmed by the prior research and
   *not* overturned by Fable 5 / Opus 4.8 — the gate's load-bearing flaws are model-independent.
2. **Build the librarian.** It uses the exact capability that newer models *did* improve (assist:
   interview, sharpen, dedupe, label) and avoids the part that didn't (judge legitimacy from prose).
3. **Put friction on identity/reputation** — you already have IAP + invite-graph + users/roles +
   account timestamps to build on.
4. **First concrete build = `library search` / corpus similarity.** It's the missing keystone; the
   whole dedup spine depends on it, and it's a clean, well-scoped capability.
5. **Keep the proof gate (principle 6) separate from admission.** Cheap+assisted to be *heard*;
   proven to *ship*.

**On "why isn't this done today?"** Two reasons, both fair: (a) the persuasion-gate's flaws are
structural, not capability-bound, so no amount of model progress makes it work; and (b) everyone who
tried friction-as-filter (curl) found it didn't separate signal from noise — so the industry
converged on assist + human-in-the-loop + identity friction. The genuinely **under-explored** move —
and the one storytree is uniquely positioned for — is **dedup against a rich, structured decision
corpus.** Most repos can't do it because they have nothing to dedupe against. You do.

---

## Sources

**AI-slop / the natural experiment (curl, OSS maintainers):**
- https://socket.dev/blog/curl-shuts-down-bug-bounty-program-after-flood-of-ai-slop-reports
- https://hackaday.com/2026/01/26/the-curl-project-drops-bug-bounties-due-to-ai-slop/
- https://thenewstack.io/curls-daniel-stenberg-ai-is-ddosing-open-source-and-fixing-its-bugs/
- https://arxiv.org/pdf/2603.27249  (“An Endless Stream of AI Slop”)
- https://github.com/ossf/wg-vulnerability-disclosures/issues/178

**Industry pattern (assist + human-in-the-loop, never hard gate):**
- https://github.com/github/ai-moderator
- https://github.blog/open-source/maintainers/how-github-models-can-help-open-source-maintainers-focus-on-what-matters/
- https://www.theregister.com/2026/02/03/github_kill_switch_pull_requests_ai/

**"Convince the AI" as anti-pattern (persuasion gates leak):**
- https://gandalf.lakera.ai/intro
- https://www.lakera.ai/blog/who-is-gandalf
- https://www.lakera.ai/blog/stop-letting-models-grade-their-own-homework-why-llm-as-a-judge-fails-at-prompt-injection-defense

**LLM-as-judge unreliability (position/verbosity/self-preference bias):**
- https://www.cip.org/blog/llm-judges-are-unreliable
- https://arxiv.org/html/2506.09443v1
- https://www.adaline.ai/blog/llm-as-a-judge-reliability-bias
- https://arxiv.org/abs/2406.07791  (position bias study)
- https://arxiv.org/html/2604.16790v1  (Bias in the Loop: LLM-as-Judge for SWE, 2026)

**Model-recency / robustness (the §2 analysis):**
- https://arxiv.org/pdf/2501.18837  (Constitutional Classifiers, 86%→4.4%)
- https://www.anthropic.com/research/next-generation-constitutional-classifiers
- https://www-cdn.anthropic.com/4263b940cabb546aa0e3283f35b686f4f3b2ff47.pdf  (Claude Opus 4 / Sonnet 4 system card, StrongREJECT)
- https://assets.anthropic.com/m/64823ba7485345a7/Claude-Opus-4-5-System-Card.pdf
- https://cioinfluence.com/machine-learning/leading-ai-model-claude-opus-4-6-bypassed-in-30-minutes-exposing-critical-security-gap-in-agentic-ai-systems/  (Opus 4.6 bypassed in 30 min; Gemini 3 Pro <5 min, Feb 2026)
- https://owasp.org/www-project-top-10-for-large-language-model-applications/  (prompt injection = #1 LLM risk, 2025)

**Attacker economics (BYO-key is cheap):**
- https://www.cloudzero.com/blog/llm-api-pricing-comparison/
- https://www.tldl.io/resources/llm-api-pricing-2026
- https://intuitionlabs.ai/articles/llm-api-pricing-comparison-2025  (from the prior pass)

**Dedup prior art:**
- https://github.com/Namchee/dupliket
- https://github.com/Elifterminal/pr-triage
