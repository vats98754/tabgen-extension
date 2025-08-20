import type { GenerateResponse, TabInstruction, GeneratedTab } from './types.js';
import { retrieveTabs } from './retriever.js';

// Storage keys
const KEY_HF_TOKEN = 'hf_token';
const KEY_HF_MODEL = 'hf_model';

const DEFAULT_MODEL = 'Qwen/Qwen2.5-0.5B-Instruct';

export async function planTabs(input: TabInstruction): Promise<GenerateResponse> {
  // Try Hugging Face first; if unavailable, fallback
  const [token, model] = await Promise.all([
    getSync<string>(KEY_HF_TOKEN),
    getSync<string>(KEY_HF_MODEL),
  ]);

  if (token) {
    try {
      const resp = await callHuggingFaceInference(
        token,
        model || DEFAULT_MODEL,
        input
      );
      if (resp) return resp;
    } catch (e) {
      console.warn('HF inference failed, using fallback:', e);
    }
  }

  // Try retrieval-based plan
  try {
    const tabs = await retrieveTabs({ ...input, maxTabs: input.maxTabs ?? 12 });
    if (tabs.length) {
      return makeResponseFromTabs(input, tabs);
    }
  } catch (e) {
    console.warn('Retrieval failed, falling back:', e);
  }

  return fallbackPlan(input);
}

async function callHuggingFaceInference(
  token: string,
  model: string,
  input: TabInstruction
): Promise<GenerateResponse | null> {
  const prompt = buildPrompt(input);
  const res = await fetch(
    `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 400,
          temperature: 0.7,
          return_full_text: false
        }
      })
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HF ${res.status}: ${text}`);
  }

  // HF returns array of {generated_text}
  const data = await res.json();
  const generated = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;
  if (!generated || typeof generated !== 'string') return null;

  // Extract JSON block
  const json = extractJson(generated);
  if (!json) return null;

  // Validate shape
  if (!Array.isArray(json.tabs)) return null;
  const tabs = (json.tabs as any[])
    .map(t => ({ title: String(t.title || ''), url: String(t.url || '') }))
    .filter(t => t.url);

  const groupTitle = String(json.groupTitle || makeGroupTitle(input));
  const plan = String(json.plan || '');
  const color = validColor(String(json.color || 'blue'));

  if (tabs.length === 0) return null;

  return { plan, tabs, groupTitle, color };
}

function buildPrompt(input: TabInstruction): string {
  const style = input.style ?? 'mix';
  const maxTabs = input.maxTabs ?? 6;
  return `You are a helpful assistant that plans browser tabs as JSON for a learning session.
User goal: ${input.goal}
Style: ${style}
Max tabs: ${maxTabs}
Return ONLY a compact JSON matching this TypeScript type:
{
  "groupTitle": string,
  "plan": string,
  "color": "grey"|"blue"|"red"|"yellow"|"green"|"pink"|"purple"|"cyan"|"orange",
  "tabs": Array<{"title": string, "url": string}>
}
Rules:
- Ensure all URLs are valid and directly useful. If unsure, use Google search URLs.
- Prefer diverse sources: docs, articles, videos depending on style.
- Keep tabs under the Max tabs limit.
- No extra commentary; respond with JSON only.`;
}

function extractJson(text: string): any | null {
  // naive extraction of a {...} block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function validColor(c: string): GenerateResponse['color'] {
  const allowed = ['grey','blue','red','yellow','green','pink','purple','cyan','orange'] as const;
  return (allowed as readonly string[]).includes(c) ? (c as any) : 'blue';
}

function fallbackPlan(input: TabInstruction): GenerateResponse {
  const topic = input.goal.trim();
  const q = encodeURIComponent(topic);
  const max = Math.max(3, Math.min(input.maxTabs ?? 12, 30));
  const tabs = [
    { title: `Google: ${topic}`, url: `https://www.google.com/search?q=${q}` },
    { title: `Wikipedia: ${topic}`, url: `https://en.wikipedia.org/wiki/Special:Search?search=${q}` },
    { title: `YouTube: ${topic}`, url: `https://www.youtube.com/results?search_query=${q}` },
    { title: `StackOverflow: ${topic}`, url: `https://stackoverflow.com/search?q=${q}` },
    { title: `GitHub: awesome ${topic}`, url: `https://github.com/search?q=awesome+${q}` },
  ].slice(0, max);

  let plan = `Start with a broad overview, then dive deeper:\n` +
    `1) Google results for quick breadth\n` +
    `2) Wikipedia for foundational background\n` +
    `3) Videos for intuition\n` +
    `4) Q&A problem-solving (StackOverflow)\n` +
    `5) Explore code/resources on GitHub`;

  const groupTitle = makeGroupTitle(input);
  return { plan, tabs, groupTitle, color: 'blue' };
}

function makeGroupTitle(input: TabInstruction): string {
  const style = input.style ?? 'mix';
  const base = input.goal.replace(/\s+/g, ' ').trim().slice(0, 40);
  return `${capitalize(style)}: ${base}`;
}

function makeResponseFromTabs(input: TabInstruction, tabs: GeneratedTab[]): GenerateResponse {
  const plan = `Curated results from Wikipedia, HN, StackOverflow, and Reddit based on: ${input.goal}`;
  return { plan, tabs: tabs.slice(0, Math.max(3, Math.min(input.maxTabs ?? 12, 30))), groupTitle: makeGroupTitle(input), color: 'blue' };
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

async function getSync<T = string>(key: string): Promise<T | undefined> {
  return new Promise(resolve => {
    chrome.storage.sync.get(key, res => resolve(res[key] as T | undefined));
  });
}
