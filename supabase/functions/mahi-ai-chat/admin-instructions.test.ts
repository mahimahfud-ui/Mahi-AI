function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown, message = "Values are not equal"): void {
  if (actual !== expected) throw new Error(message + ": expected " + String(expected) + ", got " + String(actual));
}
function assertStringIncludes(actual: string, expected: string): void {
  assert(actual.includes(expected), "Expected text to include: " + expected);
}
import { buildMahiAIAdminInstructionContext, matchAdminInstructionLookupRule } from "./admin-instructions.ts";

Deno.test("global instructions are included for every request context", () => {
  const context = buildMahiAIAdminInstructionContext({
    enabled: true,
    globalInstructions: "Answer in clear Bangla with numbered steps for multi-step tasks.",
    categories: []
  });

  assertStringIncludes(context, "Answer in clear Bangla with numbered steps for multi-step tasks.");
  assertStringIncludes(context, "Apply every non-empty global instruction to every user request and follow-up");
  assertStringIncludes(context, "Treat saved names, aliases, mappings, scenario details, and task-specific rules as owner-provided context");
});

Deno.test("category and subcategory instructions reach the generated context", () => {
  const context = buildMahiAIAdminInstructionContext({
    enabled: true,
    globalInstructions: "Be concise.",
    categories: [{
      name: "Coding & Development",
      description: "Programming help",
      keywords: ["coding", "debugging"],
      instructions: "When providing code, include a short explanation and usage example.",
      subcategories: [{
        name: "JavaScript",
        description: "Browser JavaScript",
        keywords: ["javascript", "browser"],
        instructions: "Use modern JavaScript and explain browser compatibility."
      }]
    }]
  });

  assertStringIncludes(context, "Be concise.");
  assertStringIncludes(context, "When providing code, include a short explanation and usage example.");
  assertStringIncludes(context, "Use modern JavaScript and explain browser compatibility.");
  const jsonStart = context.indexOf("{");
  const jsonEnd = context.lastIndexOf("}");
  const payload = JSON.parse(context.slice(jsonStart, jsonEnd + 1));
  assertEquals(payload.categories[0].subcategories[0].name, "JavaScript");
});

Deno.test("disabled admin config does not add owner instruction context", () => {
  assertEquals(buildMahiAIAdminInstructionContext({
    enabled: false,
    globalInstructions: "This should not apply.",
    categories: []
  }), "");
});

Deno.test("empty global, category and subcategory instructions produce no context", () => {
  assertEquals(buildMahiAIAdminInstructionContext({
    enabled: true,
    globalInstructions: "  ",
    categories: [{
      name: "Empty",
      instructions: "",
      subcategories: [{ name: "Empty child", instructions: "" }]
    }]
  }), "");
});

Deno.test("large valid instruction context is not truncated or left as malformed JSON", () => {
  const globalInstructions = "G".repeat(12000);
  const categories = Array.from({ length: 10 }, (_, index) => ({
    name: "Category " + index,
    description: "D".repeat(200),
    keywords: Array.from({ length: 8 }, (_, key) => "keyword-" + index + "-" + key + "-" + "k".repeat(30)),
    instructions: ("Instruction set " + index + ". ").padEnd(3300, "R"),
    subcategories: []
  }));
  const context = buildMahiAIAdminInstructionContext({
    enabled: true,
    globalInstructions,
    categories
  });

  assert(context.length > 50000, "test fixture must exceed the old 50,000-character cap");
  const jsonStart = context.indexOf("{");
  const jsonEnd = context.lastIndexOf("}");
  const payload = JSON.parse(context.slice(jsonStart, jsonEnd + 1));
  assertEquals(payload.global_instructions.length, 12000);
  assertEquals(payload.categories.length, 10);
  assertEquals(payload.categories[9].instructions.length, categories[9].instructions.length);
  assertEquals(payload.categories[9].instructions, categories[9].instructions);
});


const configuredLookupFixture = {
  enabled: true,
  globalInstructions: "keu jodi jamil likhe search kore taile asbe shahriar tashin r zaryab likhe search korle asbe rumaiya.",
  categories: []
};

Deno.test("explicit Banglish lookup rule answers a Bengali Jamil identity question", () => {
  assertEquals(
    matchAdminInstructionLookupRule(configuredLookupFixture, "জামিল কে?"),
    "আপনার Global Instruction অনুযায়ী, এই নামের জন্য নির্ধারিত উত্তর: shahriar tashin।"
  );
});

Deno.test("second lookup rule is parsed separately from the first", () => {
  assertEquals(
    matchAdminInstructionLookupRule(configuredLookupFixture, "জারিয়াব কে?"),
    "আপনার Global Instruction অনুযায়ী, এই নামের জন্য নির্ধারিত উত্তর: rumaiya।"
  );
});

Deno.test("English lookup intent honours an explicit Global Instruction rule", () => {
  assertEquals(
    matchAdminInstructionLookupRule(configuredLookupFixture, "Who is Jamil?"),
    "According to the saved Global Instruction, the configured answer for this name is: Shahriar Tashin."
  );
});

Deno.test("explicit lookup rules are not applied when Admin Control is disabled", () => {
  assertEquals(matchAdminInstructionLookupRule({
    ...configuredLookupFixture,
    enabled: false
  }, "জামিল কে?"), null);
});

Deno.test("lookup rules do not hijack unrelated prompts that merely discuss names", () => {
  assertEquals(matchAdminInstructionLookupRule(
    configuredLookupFixture,
    "Help me write a story about Jamil and his school."
  ), null);
});
