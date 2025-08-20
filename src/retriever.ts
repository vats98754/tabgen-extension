import type { GeneratedTab, TabInstruction } from './types.js';

type Candidate = {
    title: string;
    url: string;
    score: number; // higher is better
    source: 'wikipedia' | 'hn' | 'so' | 'reddit' | 'arxiv' | 'github' | 'pubmed' | 'archive';
};

export async function retrieveTabs(input: TabInstruction): Promise<GeneratedTab[]> {
    const q = input.goal.trim();
    if (!q) return [];

    const [wiki, hn, so, reddit, arxiv, github, pubmed, archive] = await Promise.allSettled([
        searchWikipedia(q),
        searchHN(q),
        searchStackOverflow(q),
        searchReddit(q),
        searchArxiv(q),
        searchGithub(q),
        searchPubmed(q),
        searchInternetArchive(q),
    ]);

    const cand: Candidate[] = [];
    if (wiki.status === 'fulfilled') cand.push(...wiki.value);
    if (hn.status === 'fulfilled') cand.push(...hn.value);
    if (so.status === 'fulfilled') cand.push(...so.value);
    if (reddit.status === 'fulfilled') cand.push(...reddit.value);
    if (arxiv.status === 'fulfilled') cand.push(...arxiv.value);
    if (github.status === 'fulfilled') cand.push(...github.value);
    if (pubmed.status === 'fulfilled') cand.push(...pubmed.value);
    if (archive.status === 'fulfilled') cand.push(...archive.value);

    // Deduplicate by URL (ignoring tracking params)
    const seen = new Set<string>();
    const dedup = cand.filter(c => {
        const key = normalizeUrl(c.url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Style-based boost
    for (const c of dedup) {
        const u = c.url.toLowerCase();
        if (input.style === 'videos') {
            if (u.includes('youtube.com/watch') || u.includes('youtu.be/')) c.score += 5;
        } else if (input.style === 'research') {
            if (u.includes('arxiv.org') || u.endsWith('.pdf') || u.includes('.edu')) c.score += 4;
            if (u.includes('github.com') || u.includes('paper')) c.score += 1.5;
            if (u.includes('pubmed.ncbi.nlm.nih.gov')) c.score += 2.5;
        } else if (input.style === 'quick') {
            if (u.includes('docs.') || u.includes('developer.') || u.includes('dev.') || u.includes('readme')) c.score += 2.5;
            if (u.includes('medium.com') || u.includes('dev.to')) c.score += 1.5;
        }
    }

    // Sort by score desc
    dedup.sort((a, b) => b.score - a.score);

    // Map to tabs and cap by input.maxTabs or default 10 (higher than initial 6)
    const max = Math.max(3, Math.min(input.maxTabs ?? 10, 30));
    return dedup.slice(0, max).map(c => ({ title: c.title, url: c.url }));
}

function normalizeUrl(u: string): string {
    try {
        const url = new URL(u);
        url.search = '';
        url.hash = '';
        return url.toString();
    } catch {
        return u;
    }
}

async function searchWikipedia(query: string): Promise<Candidate[]> {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const pages: any[] = data?.query?.search || [];
    return pages.slice(0, 5).map(p => ({
        title: p.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/\s/g, '_'))}`,
        score: 7 + (p.size ? Math.min(p.size / 50000, 2) : 0),
        source: 'wikipedia' as const,
    }));
}

async function searchHN(query: string): Promise<Candidate[]> {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story`; 
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const hits: any[] = data?.hits || [];
    return hits.slice(0, 10).map(h => ({
        title: h.title || h.story_title || '(HN) result',
        url: h.url || (h.story_url ?? `https://news.ycombinator.com/item?id=${h.objectID}`),
        score: (h.points ?? 0) / 50 + (h.num_comments ?? 0) / 100,
        source: 'hn' as const,
    })).filter(c => !!c.url);
}

async function searchStackOverflow(query: string): Promise<Candidate[]> {
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&filter=default&pagesize=10`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const items: any[] = data?.items || [];
    return items.map(it => ({
        title: it.title,
        url: it.link,
        score: (it.score ?? 0) / 5 + (it.is_accepted ? 2 : 0),
        source: 'so' as const,
    }));
}

async function searchReddit(query: string): Promise<Candidate[]> {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&type=link&limit=10`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const posts: any[] = data?.data?.children || [];
    return posts.map(p => {
        const d = p.data || {};
        return {
            title: d.title || '(Reddit) result',
            url: d.url_overridden_by_dest || d.url,
            score: (d.ups ?? 0) / 100 + (d.num_comments ?? 0) / 200,
            source: 'reddit' as const,
        };
    }).filter(c => !!c.url);
}

// --- New data sources below ---

async function searchArxiv(query: string): Promise<Candidate[]> {
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=5`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    const entries = Array.from(text.matchAll(/<entry>([\s\S]*?)<\/entry>/g));
    return entries.map(e => {
        const title = (e[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim().replace(/\s+/g, ' ') ?? '(arXiv) result';
        const link = (e[1].match(/<id>(.*?)<\/id>/) || [])[1] ?? '';
        return {
            title,
            url: link,
            score: 8,
            source: 'arxiv' as const,
        };
    }).filter(c => !!c.url);
}

async function searchGithub(query: string): Promise<Candidate[]> {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=5`;
    const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const items: any[] = data?.items || [];
    return items.map(it => ({
        title: it.full_name,
        url: it.html_url,
        score: (it.stargazers_count ?? 0) / 1000 + 3,
        source: 'github' as const,
    }));
}

async function searchPubmed(query: string): Promise<Candidate[]> {
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=5&term=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const ids: string[] = data?.esearchresult?.idlist || [];
    return ids.map(id => ({
        title: `PubMed Article ${id}`,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        score: 7,
        source: 'pubmed' as const,
    }));
}

async function searchInternetArchive(query: string): Promise<Candidate[]> {
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier,title,downloads&rows=5&page=1&output=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const docs: any[] = data?.response?.docs || [];
    return docs.map(d => ({
        title: d.title || '(Archive.org) result',
        url: `https://archive.org/details/${d.identifier}`,
        score: (d.downloads ?? 0) / 1000 + 5,
        source: 'archive' as const,
    }));
}
