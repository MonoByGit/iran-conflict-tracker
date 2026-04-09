import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCES = [
  { id: 'bbc',       name: 'BBC World',      flag: '🇬🇧', region: 'europa',        rss: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'guardian',  name: 'The Guardian',   flag: '🇬🇧', region: 'europa',        rss: 'https://www.theguardian.com/world/rss' },
  { id: 'skynews',   name: 'Sky News',       flag: '🇬🇧', region: 'europa',        rss: 'https://feeds.skynews.com/feeds/rss/world.xml' },
  { id: 'dw',        name: 'DW',             flag: '🇩🇪', region: 'europa',        rss: 'https://rss.dw.com/xml/rss-en-world' },
  { id: 'euronews',  name: 'Euronews',       flag: '🇪🇺', region: 'europa',        rss: 'https://www.euronews.com/rss' },
  { id: 'spiegel',   name: 'Der Spiegel',    flag: '🇩🇪', region: 'europa',        rss: 'https://www.spiegel.de/international/index.rss' },
  { id: 'nos',       name: 'NOS Nieuws',     flag: '🇳🇱', region: 'nl',            rss: 'https://feeds.nos.nl/nosnieuwsalgemeen' },
  { id: 'aljazeera', name: 'Al Jazeera',     flag: '🇶🇦', region: 'mideast',       rss: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'reuters',   name: 'Reuters',        flag: '🌐', region: 'international',  rss: 'https://feeds.reuters.com/reuters/worldNews' },
  { id: 'cnn',       name: 'CNN',            flag: '🇺🇸', region: 'american',      rss: 'https://rss.cnn.com/rss/edition_world.rss' },
  { id: 'nyt',       name: 'New York Times', flag: '🇺🇸', region: 'american',      rss: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  { id: 'pbs',       name: 'PBS NewsHour',   flag: '🇺🇸', region: 'american',      rss: 'https://www.pbs.org/newshour/feeds/rss/world' },
]

const KEYWORDS = [
  'iran', 'tehran', 'hormuz', 'irgc', 'khamenei', 'iranian', 'centcom',
  'persian gulf', 'strait', 'hezbollah', 'nuclear', 'mojtaba', 'isfahan',
  'natanz', 'bushehr', 'trump iran', 'us strikes', 'israel iran', 'ceasefire',
  'strait of hormuz',
]

const STATS = [
  { label: 'Hormuz',     value: 'GEBLOKKEERD',  status: 'alert' },
  { label: 'Brent olie', value: '$109+/vat',    status: 'warning' },
  { label: 'Dag conflict', value: '38',          status: 'neutral' },
  { label: 'US deadline', value: 'VERSTREKEN',  status: 'alert' },
]

const REGION_TABS = [
  { id: 'all',           label: 'Alles' },
  { id: 'europa',        label: '🇪🇺 Europa' },
  { id: 'europa-gb',     label: '🇬🇧 VK' },
  { id: 'nl',            label: '🇳🇱 Nederland' },
  { id: 'mideast',       label: '🌍 Midden-Oosten' },
  { id: 'international', label: '🌐 Internationaal' },
  { id: 'american',      label: '🇺🇸 Amerikaans' },
]

const REFRESH_INTERVAL = 90 // seconds

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isIranRelated(text) {
  const lower = (text || '').toLowerCase()
  return KEYWORDS.some(kw => lower.includes(kw))
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date)) return ''
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}s geleden`
  if (diff < 3600) return `${Math.floor(diff / 60)}m geleden`
  if (diff < 86400) return `${Math.floor(diff / 3600)}u geleden`
  return `${Math.floor(diff / 86400)}d geleden`
}

function isNew(dateStr) {
  if (!dateStr) return false
  const date = new Date(dateStr)
  if (isNaN(date)) return false
  return Date.now() - date.getTime() < 30 * 60 * 1000 // 30 min
}

function isBreaking(article) {
  const text = (article.title + ' ' + (article.description || '')).toLowerCase()
  return text.includes('breaking') || text.includes('urgent') || text.includes('alert')
}

async function fetchFeed(source) {
  const proxyUrl = `/proxy?url=${encodeURIComponent(source.rss)}`
  const res = await fetch(proxyUrl)
  const text = await res.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'application/xml')
  const items = Array.from(doc.querySelectorAll('item'))
  return items.map(item => {
    const title = item.querySelector('title')?.textContent?.trim() || ''
    const link = item.querySelector('link')?.textContent?.trim() ||
                 item.querySelector('guid')?.textContent?.trim() || '#'
    const description = item.querySelector('description')?.textContent?.trim() || ''
    const pubDate = item.querySelector('pubDate')?.textContent?.trim() || ''
    return {
      id: link,
      title,
      link,
      description: description.replace(/<[^>]+>/g, '').slice(0, 180),
      pubDate,
      sourceId: source.id,
      sourceName: source.name,
      sourceFlag: source.flag,
      sourceRegion: source.region,
    }
  }).filter(a => isIranRelated(a.title + ' ' + a.description))
}

// ─── Markdown / Jina parser ───────────────────────────────────────────────────

function parseJinaMarkdown(raw) {
  if (!raw) return '<p>Geen inhoud beschikbaar.</p>'

  let lines = raw.split('\n')

  // Strip metadata header lines
  const metaKeys = ['Title:', 'URL:', 'Published Time:', 'Description:', 'Author:', 'Keywords:']
  lines = lines.filter(line => !metaKeys.some(k => line.trim().startsWith(k)))

  // Find content start (skip leading empty lines)
  let startIdx = 0
  while (startIdx < lines.length && lines[startIdx].trim() === '') startIdx++

  // Remove short nav-like lines surrounded by empty lines
  const cleaned = []
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    const prev = i > 0 ? lines[i - 1] : ''
    const next = i < lines.length - 1 ? lines[i + 1] : ''
    if (line.trim().length > 0 && line.trim().length < 50 &&
        prev.trim() === '' && next.trim() === '') {
      continue
    }
    cleaned.push(line)
  }

  // Truncate after "Related" / "More on" / "---" if we have substantial content
  const truncateAt = ['## Related', '## More on', '## See also', '---']
  let finalLines = cleaned
  for (const marker of truncateAt) {
    const idx = cleaned.findIndex(l => l.trim().startsWith(marker))
    if (idx > 30) {
      finalLines = cleaned.slice(0, idx)
      break
    }
  }

  // Convert markdown to HTML
  const html = finalLines
    .map(line => {
      if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`
      if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`
      if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`
      if (line.trim() === '') return '<br/>'
      // Inline formatting
      let l = line
      l = l.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      l = l.replace(/\*(.+?)\*/g, '<em>$1</em>')
      l = l.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip links
      return `<p>${l}</p>`
    })
    .join('\n')

  return html
}

// ─── Component: Header ────────────────────────────────────────────────────────

function Header({ onRefresh, countdown, loading }) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-3"
      style={{
        background: 'rgba(0,0,0,0.80)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(84,84,88,0.35)',
      }}
    >
      {/* Logo + Title */}
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 512 512" width="20" height="20">
          <circle cx="256" cy="256" r="220" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="18"/>
          <circle cx="256" cy="256" r="150" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="12"/>
          <circle cx="256" cy="256" r="80"  fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10"/>
          <path d="M256 256 L256 36" stroke="#30D158" strokeWidth="20" strokeLinecap="round" opacity="0.9"/>
          <circle cx="256" cy="36"  r="12" fill="#30D158"/>
          <circle cx="180" cy="195" r="8"  fill="rgba(255,255,255,0.4)"/>
          <circle cx="310" cy="160" r="6"  fill="rgba(255,255,255,0.3)"/>
          <circle cx="190" cy="310" r="5"  fill="rgba(255,255,255,0.2)"/>
        </svg>
        <div>
          <div
            className="text-white font-semibold tracking-tight"
            style={{ fontSize: '15px', letterSpacing: '-0.02em', lineHeight: 1.2 }}
          >
            IRAN TRACKER
          </div>
          <div
            className="font-medium"
            style={{ fontSize: '11px', color: 'rgba(235,235,245,0.4)', letterSpacing: '0.02em' }}
          >
            Conflict Monitor
          </div>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* LIVE indicator */}
        <div className="flex items-center gap-1.5">
          <div
            className="pulse-dot rounded-full"
            style={{ width: 7, height: 7, background: '#30D158' }}
          />
          <span
            className="font-semibold"
            style={{ fontSize: '12px', color: '#30D158', letterSpacing: '0.05em' }}
          >
            LIVE
          </span>
        </div>

        {/* Refresh button + countdown */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-all"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(84,84,88,0.4)',
            fontSize: '12px',
            color: loading ? 'rgba(235,235,245,0.3)' : 'rgba(235,235,245,0.7)',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <svg
              className="animate-spin"
              width="11" height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity="0.25"/>
              <path d="M21 12a9 9 0 00-9-9" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-5.77L1 10"/>
            </svg>
          )}
          {loading ? 'Laden...' : `${countdown}s`}
        </button>
      </div>
    </header>
  )
}

// ─── Component: BreakingTicker ────────────────────────────────────────────────

function BreakingTicker({ articles }) {
  if (!articles || articles.length === 0) return null

  const text = articles
    .slice(0, 8)
    .map(a => a.title)
    .join('   ·   ')

  return (
    <div
      className="overflow-hidden relative"
      style={{
        background: 'rgba(255,69,58,0.06)',
        borderBottom: '1px solid rgba(255,69,58,0.15)',
        height: '34px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {/* BREAKING label */}
      <div
        className="flex-shrink-0 flex items-center gap-1.5 px-3 z-10 relative h-full"
        style={{
          background: 'rgba(255,69,58,0.90)',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: '#fff',
        }}
      >
        BREAKING
      </div>

      {/* Scrolling text */}
      <div className="overflow-hidden flex-1 h-full flex items-center">
        <div
          className="ticker"
          style={{
            fontSize: '12px',
            color: 'rgba(235,235,245,0.7)',
            paddingLeft: '16px',
          }}
        >
          {text}
        </div>
      </div>
    </div>
  )
}

// ─── Component: StatsGrid ─────────────────────────────────────────────────────

function StatsGrid() {
  return (
    <div className="grid grid-cols-2 gap-2 px-4 pt-4">
      {STATS.map(stat => (
        <div
          key={stat.label}
          className="rounded-xl p-3.5"
          style={{
            background: '#1C1C1E',
            border: '1px solid rgba(84,84,88,0.5)',
          }}
        >
          <div
            className="font-medium mb-1"
            style={{ fontSize: '11px', color: 'rgba(235,235,245,0.4)', letterSpacing: '0.03em' }}
          >
            {stat.label.toUpperCase()}
          </div>
          <div
            className="font-bold"
            style={{
              fontSize: '16px',
              letterSpacing: '-0.01em',
              color:
                stat.status === 'alert'   ? '#FF453A' :
                stat.status === 'warning' ? '#FF9F0A' :
                'rgba(235,235,245,0.9)',
            }}
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Component: RegionTabs ────────────────────────────────────────────────────

function RegionTabs({ active, onChange }) {
  const scrollRef = useRef(null)

  return (
    <div
      ref={scrollRef}
      className="flex gap-1.5 px-4 py-3 overflow-x-auto"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {REGION_TABS.map(tab => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="flex-shrink-0 px-3.5 py-1.5 rounded-full transition-all"
            style={{
              fontSize: '13px',
              fontWeight: isActive ? 600 : 400,
              background: isActive ? '#fff' : 'transparent',
              color: isActive ? '#000' : 'rgba(235,235,245,0.5)',
              border: isActive ? 'none' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.color = 'rgba(235,235,245,0.8)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.color = 'rgba(235,235,245,0.5)'
                e.currentTarget.style.background = 'transparent'
              }
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Component: ArticleCard ───────────────────────────────────────────────────

function ArticleCard({ article, index, onRead }) {
  const articleIsNew = isNew(article.pubDate)
  const articleIsBreaking = isBreaking(article)
  const delay = index < 8 ? index * 35 : 0

  return (
    <div
      className="slide-in rounded-xl p-4 cursor-pointer"
      style={{
        background: '#1C1C1E',
        border: '1px solid rgba(84,84,88,0.5)',
        animationDelay: `${delay}ms`,
        opacity: 0,
        transition: 'background 0.2s cubic-bezier(0.4,0,0.2,1)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
      onMouseLeave={e => { e.currentTarget.style.background = '#1C1C1E' }}
    >
      {/* Top row: badges + time */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Source badge */}
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
            style={{
              fontSize: '11px',
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(235,235,245,0.7)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {article.sourceFlag} {article.sourceName}
          </span>

          {/* NIEUW badge */}
          {articleIsNew && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full font-semibold"
              style={{
                fontSize: '10px',
                background: 'rgba(10,132,255,0.15)',
                color: '#0A84FF',
                border: '1px solid rgba(10,132,255,0.25)',
                letterSpacing: '0.04em',
              }}
            >
              NIEUW
            </span>
          )}

          {/* BREAKING badge */}
          {articleIsBreaking && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full font-semibold"
              style={{
                fontSize: '10px',
                background: 'rgba(255,69,58,0.15)',
                color: '#FF453A',
                border: '1px solid rgba(255,69,58,0.25)',
                letterSpacing: '0.04em',
              }}
            >
              BREAKING
            </span>
          )}
        </div>

        {/* Time */}
        <span
          className="flex-shrink-0"
          style={{ fontSize: '11px', color: 'rgba(235,235,245,0.3)' }}
        >
          {timeAgo(article.pubDate)}
        </span>
      </div>

      {/* Title */}
      <h3
        className="font-semibold leading-snug mb-2"
        style={{
          fontSize: '14px',
          color: '#fff',
          letterSpacing: '-0.01em',
          margin: '0 0 6px 0',
        }}
      >
        {article.title}
      </h3>

      {/* Description */}
      {article.description && (
        <p
          className="leading-relaxed mb-3"
          style={{
            fontSize: '12px',
            color: 'rgba(235,235,245,0.5)',
            margin: '0 0 10px 0',
            lineHeight: 1.5,
          }}
        >
          {article.description}
        </p>
      )}

      {/* Links */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => onRead(article)}
          className="transition-colors"
          style={{
            fontSize: '12px',
            color: 'rgba(10,132,255,0.7)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#0A84FF' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(10,132,255,0.7)' }}
        >
          Volledig artikel →
        </button>

        <a
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 transition-colors"
          style={{ fontSize: '12px', color: 'rgba(48,209,88,0.7)', textDecoration: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#30D158' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(48,209,88,0.7)' }}
        >
          <span
            className="pulse-dot rounded-full inline-block"
            style={{ width: 5, height: 5, background: '#30D158' }}
          />
          Liveblog
        </a>
      </div>
    </div>
  )
}

// ─── Component: ArticleList ───────────────────────────────────────────────────

function ArticleList({ articles, activeRegion, onRead }) {
  const filtered = articles.filter(a => {
    if (activeRegion === 'all') return true
    if (activeRegion === 'europa-gb') return a.sourceRegion === 'europa' && (a.sourceId === 'bbc' || a.sourceId === 'guardian' || a.sourceId === 'skynews')
    return a.sourceRegion === activeRegion
  })

  const sorted = [...filtered].sort((a, b) => {
    const da = new Date(a.pubDate)
    const db = new Date(b.pubDate)
    return db - da
  })

  if (sorted.length === 0) {
    return (
      <div
        className="text-center py-16"
        style={{ color: 'rgba(235,235,245,0.3)', fontSize: '14px' }}
      >
        Geen artikelen gevonden voor deze regio.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 px-4 pb-8">
      {sorted.map((article, i) => (
        <ArticleCard
          key={article.id}
          article={article}
          index={i}
          onRead={onRead}
        />
      ))}
    </div>
  )
}

// ─── Component: ArticleReader ─────────────────────────────────────────────────

function ArticleReader({ article, onClose }) {
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!article) return
    setLoading(true)
    setError(null)
    setContent(null)

    const jinaUrl = `https://r.jina.ai/${article.link}`
    fetch(jinaUrl, {
      headers: {
        'X-Return-Format': 'markdown',
        'X-Target-Selector': 'article, [role="main"], main',
      },
    })
      .then(r => r.text())
      .then(md => {
        setContent(parseJinaMarkdown(md))
        setLoading(false)
      })
      .catch(() => {
        setError('Kon artikel niet laden.')
        setLoading(false)
      })
  }, [article])

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!article) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{
        background: '#000000',
      }}
    >
      {/* Reader header */}
      <div
        className="flex items-center justify-between px-5 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(84,84,88,0.4)' }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className="px-2 py-0.5 rounded-full flex-shrink-0"
            style={{
              fontSize: '11px',
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(235,235,245,0.7)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {article.sourceFlag} {article.sourceName}
          </span>
          <span
            className="truncate"
            style={{ fontSize: '13px', color: 'rgba(235,235,245,0.5)' }}
          >
            {article.title}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 ml-4 w-8 h-8 rounded-full flex items-center justify-center transition-all"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(84,84,88,0.4)',
            color: 'rgba(235,235,245,0.7)',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-6"
        style={{ maxWidth: '680px', width: '100%', margin: '0 auto' }}
      >
        {loading && (
          <div className="flex flex-col items-center gap-3 py-20">
            <svg
              className="animate-spin"
              width="24" height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(10,132,255,0.8)"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity="0.2"/>
              <path d="M21 12a9 9 0 00-9-9" strokeLinecap="round"/>
            </svg>
            <p style={{ fontSize: '13px', color: 'rgba(235,235,245,0.4)' }}>
              Artikel laden…
            </p>
          </div>
        )}

        {error && (
          <div
            className="rounded-xl p-5 text-center"
            style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)' }}
          >
            <p style={{ fontSize: '14px', color: '#FF453A' }}>{error}</p>
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block"
              style={{ fontSize: '13px', color: '#0A84FF' }}
            >
              Open origineel artikel →
            </a>
          </div>
        )}

        {content && (
          <>
            <h1
              className="mb-6"
              style={{
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#fff',
                lineHeight: 1.3,
              }}
            >
              {article.title}
            </h1>

            <div
              className="reader-content"
              style={{
                fontSize: '15px',
                lineHeight: 1.75,
                color: 'rgba(235,235,245,0.75)',
              }}
              dangerouslySetInnerHTML={{ __html: content }}
            />

            <div className="mt-8 pt-6" style={{ borderTop: '1px solid rgba(84,84,88,0.4)' }}>
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '13px', color: '#0A84FF' }}
              >
                Open op {article.sourceName} →
              </a>
            </div>
          </>
        )}
      </div>

      {/* Reader inline styles for dangerouslySetInnerHTML content */}
      <style>{`
        .reader-content h1 { font-size: 20px; font-weight: 700; color: #fff; margin: 24px 0 12px; letter-spacing: -0.01em; }
        .reader-content h2 { font-size: 17px; font-weight: 600; color: rgba(235,235,245,0.9); margin: 20px 0 10px; letter-spacing: -0.01em; }
        .reader-content h3 { font-size: 15px; font-weight: 600; color: rgba(235,235,245,0.8); margin: 16px 0 8px; }
        .reader-content p  { margin: 0 0 14px; }
        .reader-content strong { color: rgba(235,235,245,0.9); font-weight: 600; }
        .reader-content em { color: rgba(235,235,245,0.7); font-style: italic; }
        .reader-content br { display: block; margin: 6px 0; content: ''; }
      `}</style>
    </div>
  )
}

// ─── Component: App (root) ────────────────────────────────────────────────────

export default function App() {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeRegion, setActiveRegion] = useState('all')
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const [readerArticle, setReaderArticle] = useState(null)
  const countdownRef = useRef(null)
  const seenIds = useRef(new Set())

  const fetchAllFeeds = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled(SOURCES.map(fetchFeed))
    const all = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)

    setArticles(prev => {
      const combined = [...all]
      const seen = new Set(combined.map(a => a.id))
      // Keep old articles not duplicated
      const old = prev.filter(a => !seen.has(a.id))
      return [...combined, ...old].slice(0, 200)
    })
    setLoading(false)
    setCountdown(REFRESH_INTERVAL)
  }, [])

  // Initial load
  useEffect(() => {
    fetchAllFeeds()
  }, [fetchAllFeeds])

  // Countdown timer
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          fetchAllFeeds()
          return REFRESH_INTERVAL
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(countdownRef.current)
  }, [fetchAllFeeds])

  const breakingArticles = articles.filter(isBreaking).slice(0, 10)

  return (
    <div
      className="min-h-screen"
      style={{ background: '#000', fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <Header
        onRefresh={fetchAllFeeds}
        countdown={countdown}
        loading={loading}
      />

      {/* Spacer for fixed header */}
      <div style={{ height: '56px' }} />

      {/* Breaking Ticker */}
      {breakingArticles.length > 0 && (
        <BreakingTicker articles={breakingArticles} />
      )}

      {/* Stats */}
      <StatsGrid />

      {/* Count bar */}
      <div
        className="px-4 pt-4 pb-1 flex items-center justify-between"
      >
        <div style={{ fontSize: '12px', color: 'rgba(235,235,245,0.35)', letterSpacing: '0.02em' }}>
          {articles.length > 0
            ? `${articles.length} ARTIKELEN GEVONDEN`
            : loading ? 'FEEDS LADEN…' : 'GEEN ARTIKELEN'}
        </div>
        {loading && (
          <div style={{ fontSize: '11px', color: 'rgba(10,132,255,0.7)' }}>
            Vernieuwen…
          </div>
        )}
      </div>

      {/* Region Tabs */}
      <RegionTabs active={activeRegion} onChange={setActiveRegion} />

      {/* Separator */}
      <div
        className="mx-4 mb-3"
        style={{ height: '1px', background: 'rgba(84,84,88,0.35)' }}
      />

      {/* Article list */}
      {articles.length === 0 && !loading ? (
        <div className="flex flex-col items-center gap-3 py-24">
          <svg viewBox="0 0 512 512" width="40" height="40" style={{ opacity: 0.2 }}>
            <circle cx="256" cy="256" r="220" fill="none" stroke="#fff" strokeWidth="18"/>
            <circle cx="256" cy="256" r="150" fill="none" stroke="#fff" strokeWidth="12"/>
            <circle cx="256" cy="256" r="80"  fill="none" stroke="#fff" strokeWidth="10"/>
            <path d="M256 256 L256 36" stroke="#30D158" strokeWidth="20" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: '14px', color: 'rgba(235,235,245,0.3)' }}>
            Geen updates gevonden
          </p>
          <p style={{ fontSize: '12px', color: 'rgba(235,235,245,0.2)', marginTop: '-8px' }}>
            Controleer de proxyverbinding
          </p>
        </div>
      ) : (
        <ArticleList
          articles={articles}
          activeRegion={activeRegion}
          onRead={setReaderArticle}
        />
      )}

      {/* Article Reader Modal */}
      {readerArticle && (
        <ArticleReader
          article={readerArticle}
          onClose={() => setReaderArticle(null)}
        />
      )}
    </div>
  )
}
