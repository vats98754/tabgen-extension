function qs(sel) {
    const el = document.querySelector(sel);
    if (!el)
        throw new Error(`Missing element: ${sel}`);
    return el;
}
const form = qs('#form');
const goalEl = qs('#goal');
const styleEl = qs('#style');
const maxTabsEl = qs('#maxTabs');
const planEl = qs('#plan');
const statusEl = qs('#status');
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status('Planning…');
    planEl.textContent = '';
    const payload = {
        goal: goalEl.value.trim(),
        style: styleEl.value,
        maxTabs: Number(maxTabsEl.value || '6')
    };
    if (!payload.goal)
        return status('Please enter your learning goal.');
    try {
        const plan = await sendMessage({
            type: 'GENERATE_TABS',
            payload
        });
        if (!plan.ok || !plan.plan)
            throw new Error(plan.error || 'Failed to plan');
        planEl.textContent = plan.plan.plan;
        // Offer to open now
        const openBtn = document.createElement('button');
        openBtn.textContent = 'Open Tabs in Group';
        openBtn.type = 'button';
        openBtn.onclick = async () => {
            openBtn.disabled = true;
            status('Opening tabs…');
            const res = await sendMessage({
                type: 'OPEN_GROUP',
                payload: plan.plan
            });
            if (!res.ok)
                status(res.error || 'Failed to open tabs');
            else {
                status(`Opened group #${res.groupId}`);
                if (res.groupId != null) {
                    const closeBtn = document.createElement('button');
                    closeBtn.textContent = 'Close Group';
                    closeBtn.type = 'button';
                    closeBtn.style.marginLeft = '8px';
                    closeBtn.onclick = async () => {
                        closeBtn.disabled = true;
                        const r = await sendMessage({
                            type: 'CLOSE_GROUP',
                            payload: { groupId: res.groupId }
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
    }
    catch (e) {
        status(e.message);
    }
});
function status(s) { statusEl.textContent = s; }
function sendMessage(msg) {
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage(msg, (res) => resolve(res));
        }
        catch (e) {
            reject(e);
        }
    });
}
export {};
