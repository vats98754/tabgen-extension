import { planTabs } from './llm.js';
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
        try {
            if (msg.type === 'GENERATE_TABS') {
                const plan = await planTabs(msg.payload);
                sendResponse({ ok: true, plan });
                return;
            }
            if (msg.type === 'OPEN_GROUP') {
                const groupId = await openTabsInGroup(msg.payload);
                sendResponse({ ok: true, groupId });
                return;
            }
            if (msg.type === 'CLOSE_GROUP') {
                await closeGroup(msg.payload.groupId);
                sendResponse({ ok: true });
                return;
            }
        }
        catch (e) {
            console.error(e);
            sendResponse({ ok: false, error: e.message });
        }
    })();
    // Return true to indicate async response
    return true;
});
async function openTabsInGroup(gen) {
    // Create tabs sequentially in current window
    const createdTabs = [];
    for (const t of gen.tabs) {
        const tab = await chrome.tabs.create({ url: t.url, active: false });
        createdTabs.push(tab);
    }
    const tabIds = createdTabs.map(t => t.id).filter(Boolean);
    const groupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(groupId, {
        title: gen.groupTitle,
        color: gen.color ?? 'blue',
        collapsed: false,
    });
    return groupId;
}
async function closeGroup(groupId) {
    const tabs = await chrome.tabs.query({ groupId });
    for (const t of tabs) {
        if (t.id != null)
            await chrome.tabs.remove(t.id);
    }
}
