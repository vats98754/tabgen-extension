export async function retrieveTabs(input) {
    const q = input.goal.trim();
    if (!q)
        return [];
    const [wiki, hn, so, reddit] = await Promise.allSettled([
        searchWikipedia(q),
        searchHN(q),
        searchStackOverflow(q),
        searchReddit(q),
    ]);
    const cand = [];
    if (wiki.status === 'fulfilled')
        cand.push(...wiki.value);
    if (hn.status === 'fulfilled')
        cand.push(...hn.value);
    if (so.status === 'fulfilled')
        cand.push(...so.value);
    if (reddit.status === 'fulfilled')
        cand.push(...reddit.value);
    // Deduplicate by URL (ignoring tracking params)
    const seen = new Set();
    const dedup = cand.filter(c => {
        const key = normalizeUrl(c.url);
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
    // Style-based boost
    for (const c of dedup) {
        const u = c.url.toLowerCase();
        if (input.style === 'videos') {
            if (u.includes('youtube.com/watch') || u.includes('youtu.be/'))
                c.score += 5;
        }
        else if (input.style === 'research') {
            if (u.includes('arxiv.org') || u.endsWith('.pdf') || u.includes('.edu'))
                c.score += 4;
            if (u.includes('github.com') || u.includes('paper'))
                c.score += 1.5;
        }
        else if (input.style === 'quick') {
            if (u.includes('docs.') || u.includes('developer.') || u.includes('dev.') || u.includes('readme'))
                c.score += 2.5;
            if (u.includes('medium.com') || u.includes('dev.to'))
                c.score += 1.5;
        }
    }
    // Sort by score desc
    dedup.sort((a, b) => b.score - a.score);
    // Map to tabs and cap by input.maxTabs or default 10 (higher than initial 6)
    const max = Math.max(3, Math.min(input.maxTabs ?? 10, 30));
    return dedup.slice(0, max).map(c => ({ title: c.title, url: c.url }));
}
function normalizeUrl(u) {
    try {
        const url = new URL(u);
        url.search = '';
        url.hash = '';
        return url.toString();
    }
    catch {
        return u;
    }
}
async function searchWikipedia(query) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok)
        return [];
    const data = await res.json();
    const pages = data?.query?.search || [];
    return pages.slice(0, 5).map(p => ({
        title: p.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/\s/g, '_'))}`,
        score: 7 + (p.size ? Math.min(p.size / 50000, 2) : 0),
        source: 'wikipedia',
    }));
}
async function searchHN(query) {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story`;
    const res = await fetch(url);
    if (!res.ok)
        return [];
    const data = await res.json();
    const hits = data?.hits || [];
    return hits.slice(0, 10).map(h => ({
        title: h.title || h.story_title || '(HN) result',
        url: h.url || (h.story_url ?? `https://news.ycombinator.com/item?id=${h.objectID}`),
        score: (h.points ?? 0) / 50 + (h.num_comments ?? 0) / 100,
        source: 'hn',
    })).filter(c => !!c.url);
}
async function searchStackOverflow(query) {
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&filter=default&pagesize=10`;
    const res = await fetch(url);
    if (!res.ok)
        return [];
    const data = await res.json();
    const items = data?.items || [];
    return items.map(it => ({
        title: it.title,
        url: it.link,
        score: (it.score ?? 0) / 5 + (it.is_accepted ? 2 : 0),
        source: 'so',
    }));
}
async function searchReddit(query) {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&type=link&limit=10`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok)
        return [];
    const data = await res.json();
    const posts = data?.data?.children || [];
    return posts.map(p => {
        const d = p.data || {};
        return {
            title: d.title || '(Reddit) result',
            url: d.url_overridden_by_dest || d.url,
            score: (d.ups ?? 0) / 100 + (d.num_comments ?? 0) / 200,
            source: 'reddit',
        };
    }).filter(c => !!c.url);
}
