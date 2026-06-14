# Writing Style Guide: Technical Blog Posts

Instructions for AI coding agents producing technical blog posts in this style.

---

## Voice and personality

Write as a practitioner talking to a peer, not a professor lecturing students.

- **First person throughout.** Use "we", "I", "let me", "you". Not "the author" or "one should".
- **Direct address.** Talk to the reader as "you". "You want to add a new fixture." Not "Users can add new fixtures."
- **Acknowledge failures openly.** The reader trusts you more when you share what went wrong. "This took some debugging. Let me save you the pain." is better than silently presenting the polished solution.
- **No marketing tone.** Never say "powerful", "robust", "seamlessly", "effortlessly", "cutting-edge", "leverage". These words signal that you're selling something.
- **No academic hedging.** Don't say "it may be the case that" or "one potential consideration is". Say what you know.

---

## Formality level

Casual but precise. You can drop a contraction ("there's", "won't", "doesn't") anywhere. Short sentences are fine. Fragments are fine when they add emphasis. But technical precision is non-negotiable — approximate descriptions of how code works are worse than being blunt.

---

## Opening

Start with the reader's problem or question, not with what you're going to build.

**Good:** "So you're building with AI coding agents and you want to know: is Opus actually better than Sonnet for this task? ... You need a systematic harness."

**Bad:** "In this post we will build a benchmarking framework for AI coding agents."

The first paragraph should make the reader feel seen. What are they wondering? What's the gap between where they are and where they want to be?

---

## Structure

Use numbered steps for the main walkthrough. Each step title should name both the thing and its purpose:

- "Step 1: The fixtures — intentionally broken code" (not just "Step 1: Fixtures")
- "Step 5: Getting token counts right (there are gotchas)" (not "Step 5: Token counting")

Parentheticals in headings are fine — they're a quick signal to the reader about what to expect.

Reserve H2 (`##`) for major sections. Use H3 (`###`) for subsections within a step. Don't go deeper than H3.

### Required sections, in order:

1. **Opening** — reader's problem + the one-sentence framing of what you built
2. **What are we building / measuring** — high-level orientation, often a quick table
3. **Architecture overview** — mermaid flowchart + one-paragraph explanation
4. **Numbered implementation steps** — the main body
5. **Things that surprised us** — gotchas, non-obvious behaviors, things not documented anywhere
6. **Where to take it from here** — concrete extensions, listed with brief explanation of each

---

## Flowcharts

Use Mermaid for architecture diagrams. Label subgraphs with short numbered names ("① Setup", "② For each task × config pair"). Use decision nodes (`{question?}`) to show branching logic. Keep node labels to 2–3 lines max — break long text with `\n`.

---

## Code

Show real code, not pseudocode. The reader should be able to copy and adapt it.

- **Inline comments explain the *why*, not the what.** `// note: .message.usage, not .usage` is useful. `// increment token count` is not.
- **Show the wrong version when correcting a bug.** Label it explicitly: `// ✗ Wrong` and `// ✓ Correct`. Readers need to recognize the mistake in their own code.
- **Keep snippets tight.** Cut setup boilerplate unless it's essential. Show the interesting part. Use `// ...` to signal elided code.
- **Real output examples.** Show what the output actually looks like when run. Not mocked output — real output from a real run, formatted as a code block.

---

## Tables

Use tables for quick-reference material: metrics, field descriptions, comparisons. Keep them scannable.

- Left column: **bold** for the key concept
- Right column: one plain sentence explaining what it means or tells you

Don't use tables for information that reads better as prose or bullets.

---

## Calls out gotchas

"Things that surprised us" is a mandatory section. Each entry should:
- Start with the surprising fact in bold
- Follow with 2–4 sentences explaining what it means in practice
- Not end with "keep this in mind" or any similar filler

Example pattern:
> **The SDK fires multiple events per API response.** This wasn't documented anywhere we could find. A single API call that returns `[thinking, tool_use]` fires two events with identical usage. If you don't deduplicate, every metric is inflated by 2–6×.

---

## Prose rhythm

- Vary sentence length. Short. Then a longer sentence with a subordinate clause that gives context. Then short again.
- Avoid run-ons — break them at a comma or with a new sentence.
- Start explanation paragraphs with the conclusion, then explain. "Why F1? Precision alone rewards being conservative..." — conclusion first.
- Transition phrases to avoid: "In conclusion", "As we can see", "It's worth noting that", "Let's now turn to". Just go to the next point.

---

## What not to do

- Don't summarize what you just showed. If you showed code that reads a file, don't follow it with "This code reads the file and returns its contents." The reader has eyes.
- Don't restate the step title in the opening sentence of the step. If the heading is "Step 3: Open/closed task loading", don't start the section with "In this step, we'll implement open/closed task loading."
- Don't add "Happy [topic]!" style closers unless it flows naturally from the content (the one place it works: the final sign-off line after the source map).
- Don't use emojis unless the content specifically calls for them (e.g., showing ✓/✗ in judge output).
- Don't pad. If you've said what needs to be said, stop.

---

## Sign-off

End with the directory/file layout showing where everything lives, then one line. "Happy benchmarking." or equivalent. No summary paragraph. No "I hope this was helpful."
