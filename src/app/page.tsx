'use client';

import { useEffect, useState, useRef } from 'react';

const STORAGE_KEY = 'pt_trend_dashboard_v1';
const DEFAULT_HASHTAGS = ['gymtok', 'fittok', 'fitnesstips'];
const DEFAULT_PER_TAG = 10;

interface TikTokItem {
  id: string;
  webVideoUrl?: string;
  text?: string;
  hashtags?: any[];
  createTimeISO?: string;
  playCount?: number;
  diggCount?: number;
  shareCount?: number;
  commentCount?: number;
  collectCount?: number;
  'videoMeta.duration'?: number;
  'videoMeta.coverUrl'?: string;
  'videoMeta.originalCoverUrl'?: string;
  'authorMeta.name'?: string;
  'authorMeta.nickName'?: string;
  'authorMeta.fans'?: number;
  'authorMeta.verified'?: boolean;
  'musicMeta.musicName'?: string;
  'musicMeta.musicAuthor'?: string;
  'musicMeta.musicOriginal'?: boolean;
  _score?: number;
  _format?: 'tip' | 'pov' | 'demo';
}

interface DebugEntry {
  ts: string;
  level: 'info' | 'success' | 'warn' | 'error';
  msg: string;
  payload?: any;
}

interface BriefSection {
  key: string;
  title: string;
  sub?: string;
  lines: string[];
}

export default function Page() {
  const [hashtags, setHashtags] = useState<string[]>(DEFAULT_HASHTAGS);
  const [perTag, setPerTag] = useState(DEFAULT_PER_TAG);
  const [results, setResults] = useState<TikTokItem[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [filters, setFilters] = useState({
    format: '',
    minPlays: 0,
    originalOnly: false,
    smallAuthorOnly: false,
    sort: 'score',
  });
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<TikTokItem | null>(null);
  const [drawerContent, setDrawerContent] = useState<string>('');
  const [lastBriefText, setLastBriefText] = useState('');
  const hashtagInputRef = useRef<HTMLInputElement>(null);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.hashtags) setHashtags(parsed.hashtags);
        if (parsed.perTag) setPerTag(parsed.perTag);
        if (parsed.results) setResults(parsed.results);
        if (parsed.lastRunAt) setLastRunAt(parsed.lastRunAt);
        if (parsed.filters) setFilters(parsed.filters);
      }
    } catch (e) {
      dbg('warn', 'loadState failed', (e as Error).message);
    }
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ hashtags, perTag, results, lastRunAt, filters })
      );
    } catch (e) {
      dbg('warn', 'saveState failed', (e as Error).message);
    }
  }, [hashtags, perTag, results, lastRunAt, filters]);

  function dbg(
    level: 'info' | 'success' | 'warn' | 'error',
    msg: string,
    payload?: any
  ) {
    const ts = new Date().toLocaleTimeString();
    const entry: DebugEntry = { ts, level, msg, payload };
    setDebugEntries((prev) => [...prev, entry]);
    console.log(`[${level}]`, msg, payload || '');
  }

  function score(item: TikTokItem): number {
    const plays = item.playCount || 0;
    if (!plays) return 0;
    const saves = item.collectCount || 0;
    const engage =
      (item.diggCount || 0) + (item.shareCount || 0) + (item.commentCount || 0);
    const fans = item['authorMeta.fans'] || 0;
    const saveRate = saves / plays;
    const savePts = Math.min(40, (saveRate / 0.05) * 40);
    const engageRate = engage / plays;
    const engagePts = Math.min(25, (engageRate / 0.12) * 25);
    const reachPts = plays > 100_000 ? 5 : 0;
    const smallAuthorPts = fans > 0 && fans < 100_000 ? 10 : 0;
    const replicabilityPts = 20;
    return Math.round(savePts + engagePts + reachPts + smallAuthorPts + replicabilityPts);
  }

  function guessFormat(item: TikTokItem): 'tip' | 'pov' | 'demo' {
    const dur = item['videoMeta.duration'] || 0;
    const text = (item.text || '').toLowerCase();
    if (
      dur <= 15 &&
      (text.includes('hack') ||
        text.includes('tip') ||
        text.includes('✍') ||
        text.includes('save'))
    )
      return 'tip';
    if (
      text.includes('pov') ||
      text.includes('when you') ||
      text.includes('me when') ||
      text.includes('relate')
    )
      return 'pov';
    if (dur > 30 || text.includes('how to') || text.includes('breakdown') || text.includes('tutorial'))
      return 'demo';
    return dur <= 20 ? 'tip' : 'demo';
  }

  function fmtNum(n: number | null | undefined): string {
    if (n == null || isNaN(n)) return '—';
    if (n < 1000) return n.toString();
    if (n < 1_000_000) return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'K';
    return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0) + 'M';
  }

  function fmtTime(seconds: number | undefined): string {
    if (!seconds) return '—';
    const s = Math.round(seconds);
    if (s < 60) return s + 's';
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function fmtRelative(iso: string | undefined): string {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function applyFilters(items: TikTokItem[]): TikTokItem[] {
    let out = items.slice();
    if (filters.format) out = out.filter((i) => i._format === filters.format);
    if (filters.minPlays > 0)
      out = out.filter((i) => (i.playCount || 0) >= filters.minPlays);
    if (filters.originalOnly)
      out = out.filter((i) => i['musicMeta.musicOriginal'] === true);
    if (filters.smallAuthorOnly)
      out = out.filter((i) => {
        const fans = i['authorMeta.fans'] || 0;
        return fans > 0 && fans < 100_000;
      });

    const sortFns: Record<string, (a: TikTokItem, b: TikTokItem) => number> = {
      score: (a, b) => (b._score || 0) - (a._score || 0),
      plays: (a, b) => (b.playCount || 0) - (a.playCount || 0),
      saves: (a, b) =>
        (b.collectCount || 0) / Math.max(1, b.playCount || 1) -
        ((a.collectCount || 0) / Math.max(1, a.playCount || 1)),
      recent: (a, b) =>
        new Date(b.createTimeISO || 0).getTime() -
        new Date(a.createTimeISO || 0).getTime(),
    };
    out.sort(sortFns[filters.sort] || sortFns.score);
    return out;
  }

  function parseBrief(rawText: string): BriefSection[] {
    if (!rawText) return [];
    let text = String(rawText)
      .replace(/^\s*"|"\s*$/g, '')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\r/g, '');

    const knownHeaders = [
      { match: /^HOOK\b/i, key: 'hook', title: 'Hook' },
      {
        match: /^(VOICE\s?OVER\s?SCRIPT|SCRIPT)\b/i,
        key: 'script',
        title: 'Voiceover script',
      },
      { match: /^SHOT\s?LIST\b/i, key: 'shots', title: 'Shot list' },
      { match: /^AUDIO\b/i, key: 'audio', title: 'Audio' },
      { match: /^CAPTION\b/i, key: 'caption', title: 'Caption' },
      { match: /^HASHTAGS\b/i, key: 'hashtags', title: 'Hashtags' },
    ];

    const lines = text.split('\n');
    const sections: BriefSection[] = [];
    let current: BriefSection | null = null;

    function startSection(
      key: string,
      title: string,
      sub: string,
      inline: string
    ) {
      current = { key, title, sub, lines: [] };
      sections.push(current);
      if (inline && inline.trim()) current.lines.push(inline.trim());
    }

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const stripped = line.replace(/^[#*\s]+/, '');
      const headerHit = knownHeaders.find((h) => h.match.test(stripped));
      if (headerHit) {
        const m = stripped.match(/^([A-Z][A-Z\s/]+?)(?:\s*\(([^)]+)\))?\s*:?\s*(.*)$/);
        const sub = m && m[2] ? m[2].trim() : '';
        const inline = m && m[3] ? m[3].trim() : '';
        startSection(headerHit.key, headerHit.title, sub, inline);
        continue;
      }
      if (current) {
        current.lines.push(line);
      } else if (line.trim()) {
        startSection('preamble', 'Notes', '', line);
      }
    }

    sections.forEach((s) => {
      while (s.lines.length && !s.lines[0].trim()) s.lines.shift();
      while (s.lines.length && !s.lines[s.lines.length - 1].trim())
        s.lines.pop();
    });

    return sections;
  }

  function renderSection(s: BriefSection) {
    const copyClick = async () => {
      try {
        await navigator.clipboard.writeText(s.lines.join('\n'));
      } catch {}
    };

    let content: React.ReactNode = null;

    if (s.key === 'hook' || s.lines.every((l) => /^[-•*]\s/.test(l) || !l.trim())) {
      content = (
        <ul className="brief-bullets">
          {s.lines.map((l, i) => {
            const t = l.replace(/^[-•*]\s*/, '').trim();
            if (t)
              return (
                <li key={i}>{t}</li>
              );
          })}
        </ul>
      );
    } else if (s.key === 'shots') {
      content = (
        <ol className="brief-numbered">
          {s.lines.map((l, i) => {
            const t = l.replace(/^\d+[.)]\s*/, '').trim();
            if (t)
              return (
                <li key={i}>{t}</li>
              );
          })}
        </ol>
      );
    } else if (s.key === 'script') {
      const joined = s.lines.join(' ').replace(/^"|"$/g, '');
      const parts = joined.split(/\[BEAT\]/i);
      content = (
        <div className="brief-script">
          {parts.map((part, i) => (
            <span key={i}>
              {part.trim() && <>{part.trim()} </>}
              {i < parts.length - 1 && (
                <span className="beat">BEAT</span>
              )}
            </span>
          ))}
        </div>
      );
    } else if (s.key === 'audio') {
      const text = s.lines.join(' ').trim();
      const isOriginal = /original/i.test(text) && !/trending/i.test(text);
      const isTrending = /trending/i.test(text);
      content = (
        <div className="brief-text">
          <p>
            {isOriginal && (
              <span className="brief-audio-tag original">ORIGINAL VOICEOVER</span>
            )}
            {isTrending && (
              <span className="brief-audio-tag trending">TRENDING SOUND</span>
            )}
            {text}
          </p>
        </div>
      );
    } else if (s.key === 'caption' || s.key === 'hashtags') {
      const all = s.lines.join('\n');
      const hashtags = all.match(/#[\w_]+/g) || [];
      const captionText = all
        .replace(/#[\w_]+/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
      content = (
        <>
          {captionText && (
            <div className="brief-text">
              {captionText.split(/\n+/).map((p, i) => (
                <p key={i}>{p.trim()}</p>
              ))}
            </div>
          )}
          {hashtags.length > 0 && (
            <div className="brief-hashtag-row">
              {hashtags.map((h, i) => (
                <span key={i} className="brief-hashtag">
                  {h}
                </span>
              ))}
            </div>
          )}
        </>
      );
    } else {
      content = (
        <div className="brief-text">
          {s.lines.map((l, i) => (
            l.trim() && <p key={i}>{l.trim()}</p>
          ))}
        </div>
      );
    }

    return (
      <div key={s.key} className="brief-section">
        <div className="brief-section-head">
          <div>
            <span className="brief-section-title">{s.title}</span>
            {s.sub && <span className="brief-section-sub">{s.sub}</span>}
          </div>
          <button className="brief-copy-btn" onClick={copyClick}>
            Copy
          </button>
        </div>
        {content}
      </div>
    );
  }

  async function runPull() {
    if (loading) return;
    if (!hashtags.length) {
      alert('Add at least one hashtag.');
      return;
    }
    setLoading(true);
    setLastError(null);
    setLoadingMsg('Starting Apify run…');
    setDebugEntries([]);
    setDebugOpen(true);
    dbg(
      'info',
      '▶ Run started — hashtags: ' + hashtags.join(', ') + ', perTag: ' + perTag
    );

    try {
      dbg('info', 'Calling /api/runs/pull');
      setLoadingMsg('Apify scraper running… 30–60s typically');

      const pullRes = await fetch('/api/runs/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashtags, perTag }),
      });

      if (!pullRes.ok) {
        const errData = await pullRes.json();
        throw new Error(errData.error || `HTTP ${pullRes.status}`);
      }

      const { items } = await pullRes.json();
      dbg('success', 'Got ' + items.length + ' items from Apify');

      // Score and format locally
      const scoredItems = items.map((it: TikTokItem) => ({
        ...it,
        _score: score(it),
        _format: guessFormat(it),
      }));
      dbg('info', 'Scored ' + scoredItems.length + ' items locally');

      setResults(scoredItems);
      setLastRunAt(new Date().toISOString());
      setLastError(null);
      dbg('success', '✅ Pull complete — ' + scoredItems.length + ' videos stored');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      dbg('error', '❌ ' + msg);
      setLastError(msg);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  async function generateBrief(item: TikTokItem) {
    setDrawerItem(item);
    setDrawerContent('');
    setDrawerOpen(true);
    setLastBriefText('');

    try {
      dbg('info', 'Generating brief for item: ' + item.id);
      const briefRes = await fetch('/api/briefs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item }),
      });

      if (!briefRes.ok) {
        const errData = await briefRes.json();
        throw new Error(errData.error || `HTTP ${briefRes.status}`);
      }

      const { text } = await briefRes.json();
      setLastBriefText(text);
      setDrawerContent(text);
      dbg('success', 'Generated brief (' + text.length + ' chars)');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      dbg('error', '❌ Brief failed: ' + msg);
      setDrawerContent('Error: ' + msg);
    }
  }

  function renderCard(item: TikTokItem) {
    const fmt = item._format || 'tip';
    const fmtClass = 'format-' + fmt;
    const cover = item['videoMeta.coverUrl'] || item['videoMeta.originalCoverUrl'] || '';
    const author = item['authorMeta.name'] || 'unknown';
    const fans = item['authorMeta.fans'] || 0;
    const verified = item['authorMeta.verified'];
    const musicName = item['musicMeta.musicName'] || '';
    const isOrig = item['musicMeta.musicOriginal'] === true;
    const dur = item['videoMeta.duration'] || 0;

    return (
      <div key={item.id} className="card">
        <div className="thumb">
          {cover ? (
            <img
              src={cover}
              alt="thumbnail"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : null}
          <span className={'format-badge ' + fmtClass}>{fmt}</span>
          <span className="score-badge">{(item._score || 0)} pts</span>
          <span className="duration-badge">{fmtTime(dur)}</span>
        </div>
        <div className="card-body">
          <div className="metrics">
            <div className="metric">
              <div className="v">{fmtNum(item.playCount)}</div>
              <div className="l">plays</div>
            </div>
            <div className="metric">
              <div className="v">{fmtNum(item.diggCount)}</div>
              <div className="l">likes</div>
            </div>
            <div className="metric">
              <div className="v">{fmtNum(item.collectCount)}</div>
              <div className="l">saves</div>
            </div>
            <div className="metric">
              <div className="v">{fmtNum(item.shareCount)}</div>
              <div className="l">shares</div>
            </div>
          </div>
          <div className="caption">{(item.text || '').slice(0, 180)}</div>
          <div className="author-row">
            <span className="author">
              @<strong>{author}</strong>
              {verified ? ' ✓' : ''}
            </span>
            <span className="followers">{fmtNum(fans)} fans</span>
          </div>
          {musicName && (
            <div className="audio-row">
              <span className={'audio-tag ' + (isOrig ? 'audio-orig' : 'audio-trend')}>
                {isOrig ? 'ORIGINAL' : 'TRENDING'}
              </span>
              <span>{musicName.slice(0, 32)}{musicName.length > 32 ? '…' : ''}</span>
            </div>
          )}
          <div className="actions">
            <a
              href={item.webVideoUrl || '#'}
              target="_blank"
              rel="noopener"
            >
              Open ↗
            </a>
            <button className="primary" onClick={() => generateBrief(item)}>
              Brief →
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filtered = applyFilters(results);
  const top3 = results.slice().sort((a, b) => (b._score || 0) - (a._score || 0)).slice(0, 3);

  return (
    <>
      <style jsx global>{`
        :root {
          color-scheme: light;
          --bg: transparent;
          --surface: #ffffff;
          --surface-2: #f7f8fa;
          --border: #e5e7eb;
          --border-strong: #d1d5db;
          --text: #111827;
          --text-2: #4b5563;
          --text-3: #9ca3af;
          --accent: #1E5C8B;
          --accent-2: #2d7ab1;
          --accent-soft: #E1ECF4;
          --good: #16a34a;
          --good-soft: #dcfce7;
          --warn: #d97706;
          --warn-soft: #fef3c7;
          --danger: #dc2626;
          --shadow-sm: 0 1px 2px rgba(17,24,39,0.06);
          --shadow-md: 0 4px 12px rgba(17,24,39,0.08);
          --radius: 10px;
          --radius-sm: 6px;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: var(--bg);
          color: var(--text);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Text", system-ui, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          -webkit-font-smoothing: antialiased;
        }
        h1, h2, h3, h4 { margin: 0; font-weight: 600; letter-spacing: -0.01em; }
        button { font: inherit; cursor: pointer; }
        a { color: var(--accent); text-decoration: none; }
        a:hover { text-decoration: underline; }

        .topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 20px; border-bottom: 1px solid var(--border);
          background: var(--surface);
        }
        .brand { display: flex; align-items: baseline; gap: 12px; }
        .brand h1 { font-size: 18px; color: var(--text); }
        .brand .sub { font-size: 12px; color: var(--text-3); }
        .last-run { font-size: 12px; color: var(--text-2); }
        .last-run .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--good); margin-right: 6px; vertical-align: middle; }

        .controls {
          display: grid; grid-template-columns: 1fr auto; gap: 16px;
          padding: 16px 20px; background: var(--surface-2);
          border-bottom: 1px solid var(--border);
        }
        .control-group { display: flex; flex-direction: column; gap: 6px; }
        .control-group label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-3); }
        .hashtag-input {
          display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
          padding: 6px 8px; background: var(--surface); border: 1px solid var(--border-strong);
          border-radius: var(--radius-sm); min-height: 38px;
        }
        .hashtag-input input {
          border: 0; outline: 0; flex: 1; min-width: 80px; padding: 4px;
          font: inherit; background: transparent;
        }
        .chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 8px; background: var(--accent-soft); color: var(--accent);
          border-radius: 999px; font-size: 12px; font-weight: 500;
        }
        .chip button {
          border: 0; background: transparent; color: var(--accent);
          padding: 0; line-height: 1; font-size: 14px; opacity: 0.6;
        }
        .chip button:hover { opacity: 1; }
        .control-row { display: flex; align-items: center; gap: 12px; }
        .number-input {
          padding: 8px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
          background: var(--surface); width: 70px; font: inherit;
        }
        .run-btn {
          padding: 10px 18px; background: var(--accent); color: #fff; border: 0;
          border-radius: var(--radius-sm); font-weight: 600;
          box-shadow: var(--shadow-sm); transition: background 0.15s;
          display: inline-flex; align-items: center; gap: 8px;
        }
        .run-btn:hover { background: var(--accent-2); }
        .run-btn:disabled { background: var(--text-3); cursor: not-allowed; }

        .filters { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 20px; border-bottom: 1px solid var(--border); background: var(--surface); }
        .filter-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 10px; background: var(--surface); border: 1px solid var(--border-strong);
          border-radius: 999px; font-size: 12px; color: var(--text-2);
          transition: all 0.15s;
        }
        .filter-pill input[type="checkbox"], .filter-pill input[type="range"] { margin: 0; }
        .filter-pill.active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); font-weight: 600; }
        .filter-pill select, .filter-pill input[type="number"] {
          border: 0; background: transparent; font: inherit; color: inherit;
          padding: 0; margin: 0; outline: 0;
        }

        main { padding: 20px; max-width: 1400px; margin: 0 auto; }
        .section-title {
          display: flex; align-items: baseline; justify-content: space-between;
          margin: 0 0 12px 0;
        }
        .section-title h2 { font-size: 15px; color: var(--text); }
        .section-title .count { font-size: 12px; color: var(--text-3); }

        .shortlist { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
        .shortlist .card { border: 2px solid var(--accent); position: relative; }
        .shortlist .card::before {
          content: "TOP PICK"; position: absolute; top: -10px; left: 12px;
          background: var(--accent); color: #fff; padding: 2px 8px; border-radius: 4px;
          font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
        }

        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
        .card {
          background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
          overflow: hidden; box-shadow: var(--shadow-sm); transition: box-shadow 0.15s, transform 0.15s;
          display: flex; flex-direction: column;
        }
        .card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
        .thumb { position: relative; aspect-ratio: 9/16; background: var(--surface-2); overflow: hidden; }
        .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .thumb .score-badge {
          position: absolute; top: 8px; right: 8px;
          background: rgba(17,24,39,0.85); color: #fff; padding: 4px 10px;
          border-radius: 999px; font-size: 11px; font-weight: 700;
          backdrop-filter: blur(8px);
        }
        .thumb .duration-badge {
          position: absolute; bottom: 8px; right: 8px;
          background: rgba(17,24,39,0.7); color: #fff; padding: 2px 6px;
          border-radius: 4px; font-size: 11px;
        }
        .thumb .format-badge {
          position: absolute; top: 8px; left: 8px;
          padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.04em;
          background: rgba(255,255,255,0.95); color: var(--text);
        }
        .format-tip { background: var(--good-soft) !important; color: #14532d !important; }
        .format-pov { background: var(--warn-soft) !important; color: #78350f !important; }
        .format-demo { background: var(--accent-soft) !important; color: var(--accent) !important; }

        .card-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
        .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
        .metric { text-align: center; }
        .metric .v { font-size: 13px; font-weight: 600; color: var(--text); }
        .metric .l { font-size: 10px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; }
        .caption { font-size: 12px; color: var(--text-2); line-height: 1.45; max-height: 4.2em; overflow: hidden; }
        .author-row { display: flex; align-items: center; justify-content: space-between; font-size: 12px; }
        .author { color: var(--text-2); }
        .author strong { color: var(--text); font-weight: 600; }
        .followers { color: var(--text-3); font-size: 11px; }
        .audio-row { font-size: 11px; color: var(--text-3); display: flex; gap: 6px; align-items: center; }
        .audio-tag { padding: 1px 6px; border-radius: 3px; font-weight: 600; font-size: 10px; }
        .audio-orig { background: #fef3c7; color: #78350f; }
        .audio-trend { background: #dbeafe; color: #1e3a8a; }
        .actions { display: flex; gap: 6px; margin-top: auto; padding-top: 8px; border-top: 1px solid var(--border); }
        .actions a, .actions button {
          flex: 1; padding: 7px 10px; border-radius: var(--radius-sm); font-size: 12px;
          font-weight: 600; text-align: center; border: 1px solid var(--border-strong);
          background: var(--surface); color: var(--text-2); transition: all 0.15s;
        }
        .actions a:hover, .actions button:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
        .actions .primary { background: var(--accent); color: #fff; border-color: var(--accent); }
        .actions .primary:hover { background: var(--accent-2); color: #fff; }

        .empty, .loading, .error {
          padding: 40px 20px; text-align: center; color: var(--text-2);
          background: var(--surface); border: 1px dashed var(--border-strong); border-radius: var(--radius);
        }
        .empty h3 { color: var(--text); margin-bottom: 6px; }
        .empty p { margin: 0; }
        .loading { display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .spinner {
          width: 28px; height: 28px; border: 3px solid var(--border);
          border-top-color: var(--accent); border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .error { color: var(--danger); border-color: var(--danger); background: #fef2f2; text-align: left; }
        .error pre { background: #fee; padding: 8px; border-radius: 4px; font-size: 11px; overflow: auto; max-height: 200px; }

        .drawer-backdrop { position: fixed; inset: 0; background: rgba(17,24,39,0.4); display: none; align-items: flex-end; justify-content: center; z-index: 50; }
        .drawer-backdrop.open { display: flex; }
        .drawer {
          background: var(--surface); width: 100%; max-width: 800px; max-height: 88vh;
          border-radius: var(--radius) var(--radius) 0 0; box-shadow: 0 -10px 40px rgba(17,24,39,0.2);
          display: flex; flex-direction: column;
        }
        .drawer-head {
          padding: 18px 20px 12px; border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .drawer-head h3 { font-size: 15px; }
        .drawer-head .meta { font-size: 12px; color: var(--text-3); }
        .drawer-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
        .drawer-foot { padding: 12px 20px; border-top: 1px solid var(--border); display: flex; gap: 8px; justify-content: flex-end; }
        .drawer-foot button { padding: 8px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong); background: var(--surface); }
        .drawer-foot button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }

        .brief-loading { padding: 40px 20px; text-align: center; color: var(--text-2); }
        .brief-loading .spinner { margin: 0 auto 12px; }

        .brief-section {
          background: var(--surface-2); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 14px 16px; margin-bottom: 12px;
          position: relative;
        }
        .brief-section-head {
          display: flex; align-items: baseline; justify-content: space-between;
          margin-bottom: 10px; gap: 8px;
        }
        .brief-section-title {
          font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: var(--accent);
        }
        .brief-section-sub {
          font-size: 11px; color: var(--text-3); font-style: italic; margin-left: 8px;
        }
        .brief-copy-btn {
          border: 1px solid var(--border-strong); background: var(--surface);
          color: var(--text-2); padding: 4px 10px; border-radius: 4px;
          font-size: 11px; font-weight: 600; flex-shrink: 0;
        }
        .brief-copy-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }

        .brief-text { font-size: 13px; line-height: 1.6; color: var(--text); }
        .brief-text p { margin: 0 0 8px; }
        .brief-text p:last-child { margin-bottom: 0; }

        .brief-bullets { margin: 0; padding-left: 0; list-style: none; }
        .brief-bullets li {
          position: relative; padding-left: 18px; margin-bottom: 6px;
          font-size: 13px; line-height: 1.5; color: var(--text);
        }
        .brief-bullets li::before {
          content: ""; position: absolute; left: 0; top: 9px;
          width: 6px; height: 6px; border-radius: 50%; background: var(--accent);
        }

        .brief-numbered { margin: 0; padding-left: 0; list-style: none; counter-reset: shot; }
        .brief-numbered li {
          counter-increment: shot; position: relative; padding-left: 28px;
          margin-bottom: 8px; font-size: 13px; line-height: 1.5; color: var(--text);
        }
        .brief-numbered li::before {
          content: counter(shot); position: absolute; left: 0; top: 0;
          width: 20px; height: 20px; border-radius: 50%;
          background: var(--accent); color: #fff;
          font-size: 11px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
        }

        .brief-script {
          background: #fff; border-left: 3px solid var(--accent);
          padding: 10px 12px; border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
          font-size: 13px; line-height: 1.7; color: var(--text);
          font-family: Georgia, "Times New Roman", serif; font-style: italic;
        }
        .brief-script .beat {
          display: inline-block; background: var(--accent-soft); color: var(--accent);
          padding: 0 6px; border-radius: 3px; font-size: 10px; font-weight: 700;
          font-family: -apple-system, system-ui, sans-serif; font-style: normal;
          letter-spacing: 0.04em; margin: 0 2px; vertical-align: middle;
        }

        .brief-hashtag-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
        .brief-hashtag {
          display: inline-block; padding: 3px 8px; background: var(--accent-soft);
          color: var(--accent); border-radius: 4px; font-size: 11px; font-weight: 500;
        }

        .brief-audio-tag {
          display: inline-block; padding: 2px 8px; border-radius: 4px;
          font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
          margin-right: 6px; text-transform: uppercase;
        }
        .brief-audio-tag.original { background: #fef3c7; color: #78350f; }
        .brief-audio-tag.trending { background: #dbeafe; color: #1e3a8a; }

        .status-bar {
          margin-top: 24px; padding: 12px 16px; background: var(--surface-2);
          border: 1px solid var(--border); border-radius: var(--radius);
          font-size: 12px; color: var(--text-2);
          display: flex; gap: 20px; flex-wrap: wrap; justify-content: space-between;
        }
        .status-bar .stat { display: flex; gap: 6px; }
        .status-bar .stat .l { color: var(--text-3); }
        .status-bar .stat .v { color: var(--text); font-weight: 600; }

        .debug-panel {
          margin: 20px; background: #0f172a; color: #e2e8f0;
          border-radius: var(--radius); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 12px; overflow: hidden;
        }
        .debug-header {
          padding: 10px 14px; background: #1e293b;
          display: flex; align-items: center; justify-content: space-between;
          cursor: pointer; user-select: none;
        }
        .debug-header h4 { font-size: 12px; color: #cbd5e1; font-weight: 600; }
        .debug-body { padding: 10px 14px; max-height: 300px; overflow-y: auto; display: none; }
        .debug-panel.open .debug-body { display: block; }
        .debug-line { padding: 2px 0; line-height: 1.4; word-break: break-word; }
        .debug-line.info { color: #cbd5e1; }
        .debug-line.success { color: #86efac; }
        .debug-line.warn { color: #fcd34d; }
        .debug-line.error { color: #fca5a5; }
        .debug-line .ts { color: #64748b; margin-right: 8px; }
        .debug-line pre { background: #1e293b; padding: 6px; border-radius: 4px; margin: 4px 0; max-height: 150px; overflow: auto; font-size: 11px; }

        @media (max-width: 768px) {
          .controls { grid-template-columns: 1fr; }
          .shortlist { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="topbar">
        <div className="brand">
          <h1>Weekly TikTok Trend Dashboard</h1>
          <span className="sub">PT Content Service · v2</span>
        </div>
        <div className="last-run" id="last-run-info">
          {lastError ? (
            <>
              <span className="dot" style={{ background: 'var(--danger)' }}></span>
              <span style={{ color: 'var(--danger)' }}>Last pull failed</span>
            </>
          ) : lastRunAt ? (
            <>
              <span className="dot"></span>
              Last pull: {fmtRelative(lastRunAt)} · {results.length} videos
            </>
          ) : (
            'Never run'
          )}
        </div>
      </div>

      <div className="controls">
        <div className="control-group">
          <label>Hashtags to scrape</label>
          <div className="hashtag-input">
            {hashtags.map((tag, i) => (
              <span key={i} className="chip">
                #{tag}
                <button onClick={() => setHashtags(hashtags.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
            <input
              ref={hashtagInputRef}
              type="text"
              placeholder="add hashtag + Enter"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  const v = (e.target as HTMLInputElement).value.trim().replace(/^#/, '');
                  if (v && !hashtags.includes(v)) {
                    setHashtags([...hashtags, v]);
                  }
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
          </div>
        </div>
        <div className="control-group">
          <label>&nbsp;</label>
          <div className="control-row">
            <div className="control-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '10px' }}>Per hashtag</label>
              <input
                type="number"
                className="number-input"
                min="3"
                max="40"
                value={perTag}
                onChange={(e) => setPerTag(parseInt(e.target.value) || 10)}
              />
            </div>
            <button className="run-btn" onClick={runPull} disabled={loading}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>{loading ? 'Pulling…' : 'Run pull'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="filters">
        <span className="filter-pill">
          Format:{' '}
          <select
            value={filters.format}
            onChange={(e) => setFilters({ ...filters, format: e.target.value })}
          >
            <option value="">all</option>
            <option value="tip">tip</option>
            <option value="pov">POV</option>
            <option value="demo">demo</option>
          </select>
        </span>
        <span className="filter-pill">
          Min plays:{' '}
          <input
            type="number"
            value={filters.minPlays}
            onChange={(e) => setFilters({ ...filters, minPlays: parseInt(e.target.value) || 0 })}
            step="100000"
            min="0"
            style={{ width: '90px' }}
          />
        </span>
        <span className="filter-pill">
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="checkbox"
              checked={filters.originalOnly}
              onChange={(e) => setFilters({ ...filters, originalOnly: e.target.checked })}
            />
            Original audio only
          </label>
        </span>
        <span className="filter-pill">
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="checkbox"
              checked={filters.smallAuthorOnly}
              onChange={(e) => setFilters({ ...filters, smallAuthorOnly: e.target.checked })}
            />
            Small accounts (&lt;100k)
          </label>
        </span>
        <span className="filter-pill">
          Sort:{' '}
          <select
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
          >
            <option value="score">Score</option>
            <option value="plays">Plays</option>
            <option value="saves">Save rate</option>
            <option value="recent">Most recent</option>
          </select>
        </span>
      </div>

      <main>
        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <div>{loadingMsg || 'Working…'}</div>
            <div style={{ color: 'var(--text-3)', fontSize: '12px' }}>
              Watch the debug log below for live progress.
            </div>
          </div>
        ) : lastError ? (
          <div className="error">
            <h3>Pull failed — open the debug log below for details</h3>
            <p>{lastError}</p>
          </div>
        ) : !results || !results.length ? (
          <div className="empty">
            <h3>{lastRunAt ? 'Pull returned no items' : 'No pull yet'}</h3>
            <p>
              {lastRunAt
                ? 'The Apify run completed but returned 0 videos. Try different hashtags or check the debug log.'
                : 'Set your hashtags above and hit Run pull. Default starter: gymtok, fittok, fitnesstips × 10 videos each.'}
            </p>
          </div>
        ) : (
          <>
            {top3.length === 3 && (
              <>
                <div className="section-title">
                  <h2>🏆 This week's top 3 picks</h2>
                  <span className="count">scored across all results</span>
                </div>
                <div className="shortlist">{top3.map((item) => renderCard(item))}</div>
              </>
            )}
            <div className="section-title">
              <h2>All results</h2>
              <span className="count">
                {filtered.length} of {results.length} after filters
              </span>
            </div>
            {filtered.length === 0 ? (
              <div className="empty">
                <p>No results match your filters.</p>
              </div>
            ) : (
              <div className="grid">{filtered.map((item) => renderCard(item))}</div>
            )}
            {results.length > 0 && (
              <div className="status-bar">
                <div className="stat">
                  <span className="l">Pulled:</span>
                  <span className="v">{results.length} videos</span>
                </div>
                <div className="stat">
                  <span className="l">Avg plays:</span>
                  <span className="v">
                    {fmtNum(results.reduce((s, i) => s + (i.playCount || 0), 0) / results.length)}
                  </span>
                </div>
                <div className="stat">
                  <span className="l">Avg save rate:</span>
                  <span className="v">
                    {(
                      (results.reduce(
                        (s, i) => s + ((i.collectCount || 0) / Math.max(1, i.playCount || 1)),
                        0
                      ) /
                        results.length) *
                      100
                    ).toFixed(2)}
                    %
                  </span>
                </div>
                <div className="stat">
                  <span className="l">Hashtags:</span>
                  <span className="v">{hashtags.map((t) => '#' + t).join(', ')}</span>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <div className="debug-panel" style={{ margin: '20px' }}>
        <div
          className="debug-header"
          onClick={() => setDebugOpen(!debugOpen)}
          style={{ cursor: 'pointer' }}
        >
          <h4>🔧 Debug log <span style={{ color: '#64748b', fontWeight: 400 }}>(click to toggle)</span></h4>
          <span style={{ color: '#64748b', fontSize: '10px' }}>{debugEntries.length} entries</span>
        </div>
        <div className="debug-body" style={{ display: debugOpen ? 'block' : 'none' }}>
          {debugEntries.map((e, i) => (
            <div key={i} className={`debug-line ${e.level}`}>
              <span className="ts">{e.ts}</span>
              {e.msg}
              {e.payload && (
                <pre>{JSON.stringify(e.payload, null, 2).slice(0, 4000)}</pre>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={`drawer-backdrop ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)}>
        <div className="drawer" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-head">
            <div>
              <h3>
                Brief —{' '}
                {drawerItem?._format ? drawerItem._format.toUpperCase() : 'GENERATING'}
              </h3>
              {drawerItem && (
                <div className="meta">
                  @{drawerItem['authorMeta.name'] || 'unknown'} ·{' '}
                  {fmtNum(drawerItem.playCount)} plays ·{' '}
                  {fmtTime(drawerItem['videoMeta.duration'])}
                </div>
              )}
            </div>
            <button
              className="brief-copy-btn"
              style={{ fontSize: '12px' }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(lastBriefText);
                } catch {}
              }}
            >
              Copy entire brief
            </button>
          </div>
          <div className="drawer-body">
            {!drawerContent ? (
              <div className="brief-loading">
                <div className="spinner"></div>
                <div>Drafting hook, script, and shot list…</div>
              </div>
            ) : (
              parseBrief(drawerContent).length > 0 ? (
                parseBrief(drawerContent).map((s) => renderSection(s))
              ) : (
                <div className="brief-text">
                  <p>Could not parse the brief. Raw response:</p>
                  <pre
                    style={{
                      background: 'var(--surface-2)',
                      padding: '12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '400px',
                      overflowY: 'auto',
                    }}
                  >
                    {drawerContent || '(empty)'}
                  </pre>
                </div>
              )
            )}
          </div>
          <div className="drawer-foot">
            <button className="primary" onClick={() => setDrawerOpen(false)}>
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
