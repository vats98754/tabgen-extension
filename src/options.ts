const KEY_HF_TOKEN = 'hf_token';
const KEY_HF_MODEL = 'hf_model';

function qs<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el as T;
}

const tokenEl = qs<HTMLInputElement>('#hf_token');
const modelEl = qs<HTMLInputElement>('#hf_model');
const saveBtn = qs<HTMLButtonElement>('#save');
const statusEl = qs<HTMLDivElement>('#status');

chrome.storage.sync.get([KEY_HF_TOKEN, KEY_HF_MODEL], (res) => {
  tokenEl.value = res[KEY_HF_TOKEN] || '';
  modelEl.value = res[KEY_HF_MODEL] || '';
});

saveBtn.onclick = () => {
  chrome.storage.sync.set({
    [KEY_HF_TOKEN]: tokenEl.value.trim() || undefined,
    [KEY_HF_MODEL]: modelEl.value.trim() || undefined,
  }, () => {
    statusEl.textContent = 'Saved.';
    setTimeout(() => (statusEl.textContent = ''), 1500);
  });
};
