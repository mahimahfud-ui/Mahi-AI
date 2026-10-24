import { isImageGenerationTask } from "./image-intent.ts";

Deno.test("pasted JavaScript and code-like input stay on the coding route", () => {
  const fence = String.fromCharCode(96).repeat(3);
  const inputs = [
    "const image = new Image();\nfunction generateImage(prompt) { return image; }",
    "function renderImage() {\n  const imagePrompt = 'create an image of a fox';\n  return fetch('/api/image');\n}",
    "<!doctype html><html><body><script>const image = new Image();</script></body></html>",
    fence + "js\nconst image = new Image();\nfunction generateImage() { return image; }\n" + fence,
    "Here is my code: " + String.fromCharCode(96) + "const image = new Image()" + String.fromCharCode(96),
    "image generation API is disabled by default",
    "How does the image generation API work?",
    "Write Python code to generate an image",
    "image generate korar code dao"
  ];
  for (const input of inputs) {
    if (isImageGenerationTask(input)) {
      throw new Error("Coding/status input was misclassified as image generation: " + input);
    }
  }
});

Deno.test("direct image creation requests still use image generation", () => {
  const inputs = [
    "Generate an image of a mountain at sunset",
    "Please draw a picture of a cat",
    "Make me a logo for a small bakery",
    "ছবি তৈরি করো",
    "চাঁদের একটি ছবি বানাও",
    "chobi bana deo",
    "এই ছবির ব্যাকগ্রাউন্ড পরিবর্তন করো",
    "Please remove the background from this photo"
  ];
  for (const input of inputs) {
    if (!isImageGenerationTask(input)) {
      throw new Error("Direct image request was not recognized: " + input);
    }
  }
});

Deno.test("mentions of image APIs or generated-code identifiers alone are not user intent", () => {
  const inputs = [
    "The ENABLE_PAID_IMAGE_GENERATION flag is disabled.",
    "I found a function named generateImage in this repository.",
    "This code calls createImage() to make a thumbnail.",
    "The image editor API needs a key."
  ];
  for (const input of inputs) {
    if (isImageGenerationTask(input)) {
      throw new Error("A mention was misclassified as an image request: " + input);
    }
  }
});
