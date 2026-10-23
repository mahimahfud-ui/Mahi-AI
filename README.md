# Mahi AI

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env` and put your Anthropic API key in it.
3. Run `node server.js` and open http://localhost:3000

- No accounts: chat history lives in the browser (localStorage). File contents are not saved, only names and sizes.
- The model reads images (JPEG, PNG, GIF, WebP), PDFs and text/code files. Zip, audio, video and Office files are attached by name only; the model cannot open them.
- Voice input and read-aloud use the browser's built-in speech features (Chrome, Edge, Safari).
- The API key stays on the server. Do not put it in `public/`.
- To go public, add HTTPS and keep the built-in rate limit (or tighten it).
