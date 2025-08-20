import type { TabInstruction } from './types.js';
import type { Msg } from './messages.js';

function qs<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el as T;
}

const form = qs<HTMLFormElement>('#form');
const goalEl = qs<HTMLTextAreaElement>('#goal');
const styleEl = qs<HTMLSelectElement>('#style');
const maxTabsEl = qs<HTMLInputElement>('#maxTabs');
const planEl = qs<HTMLDivElement>('#plan');
const statusEl = qs<HTMLDivElement>('#status');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  status('Planning…');
  planEl.textContent = '';

  const payload: TabInstruction = {
    goal: goalEl.value.trim(),
    style: styleEl.value as any,
    maxTabs: Number(maxTabsEl.value || '6')
  };

  if (!payload.goal) return status('Please enter your learning goal.');

  try {
    const plan = await sendMessage<Msg, { ok: boolean; plan?: any; error?: string }>({
      type: 'GENERATE_TABS',
      payload
    });
    if (!plan.ok || !plan.plan) throw new Error(plan.error || 'Failed to plan');

    planEl.textContent = plan.plan.plan;

    // Offer to open now
    const openBtn = document.createElement('button');
    openBtn.textContent = 'Open Tabs in Group';
    openBtn.type = 'button';
    openBtn.onclick = async () => {
      openBtn.disabled = true;
      status('Opening tabs…');
      const res = await sendMessage<Msg, { ok: boolean; groupId?: number; error?: string }>({
        type: 'OPEN_GROUP',
        payload: plan.plan
      });
      if (!res.ok) status(res.error || 'Failed to open tabs');
      else {
        status(`Opened group #${res.groupId}`);
        if (res.groupId != null) {
          const closeBtn = document.createElement('button');
          closeBtn.textContent = 'Close Group';
          closeBtn.type = 'button';
          closeBtn.style.marginLeft = '8px';
          closeBtn.onclick = async () => {
            closeBtn.disabled = true;
            const r = await sendMessage<Msg, { ok: boolean; error?: string }>({
              type: 'CLOSE_GROUP',
              payload: { groupId: res.groupId! }
            });
            status(r.ok ? 'Closed group.' : (r.error || 'Failed to close'));
          };
          planEl.appendChild(closeBtn);
        }
      }
    };
    planEl.appendChild(document.createElement('br'));
    planEl.appendChild(openBtn);
    status('Planned.');
  } catch (e) {
    status((e as Error).message);
  }
});

function status(s: string) { statusEl.textContent = s; }

function sendMessage<In, Out>(msg: In): Promise<Out> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(msg, (res: Out) => resolve(res));
    } catch (e) {
      reject(e);
    }
  });
}
