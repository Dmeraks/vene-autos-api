/** Inserta o actualiza meta / link en <head> (SPA sin react-helmet). */

function upsertMetaByName(name: string, content: string) {
  const safe = name.replace(/"/g, '\\"')
  let el = document.querySelector(`meta[name="${safe}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertMetaByProperty(property: string, content: string) {
  const safe = property.replace(/"/g, '\\"')
  let el = document.querySelector(`meta[property="${safe}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('property', property)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLinkRel(rel: string, href: string) {
  const safe = rel.replace(/"/g, '\\"')
  let el = document.querySelector(`link[rel="${safe}"]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

const JSON_LD_ID = 'va-seo-jsonld'

export function removeJsonLdScript() {
  document.getElementById(JSON_LD_ID)?.remove()
}

export function setJsonLdScript(json: Record<string, unknown>) {
  removeJsonLdScript()
  const s = document.createElement('script')
  s.id = JSON_LD_ID
  s.type = 'application/ld+json'
  s.textContent = JSON.stringify(json)
  document.head.appendChild(s)
}

export type HeadTags = {
  title: string
  description: string
  canonicalUrl: string
  robots: string
  ogType: 'website' | 'article'
  ogImageUrl: string
  ogSiteName?: string
  locale?: string
  twitterCard?: 'summary' | 'summary_large_image'
}

export function applyHeadTags(tags: HeadTags) {
  document.title = tags.title
  upsertMetaByName('description', tags.description)
  upsertMetaByName('robots', tags.robots)
  upsertLinkRel('canonical', tags.canonicalUrl)

  upsertMetaByProperty('og:title', tags.title)
  upsertMetaByProperty('og:description', tags.description)
  upsertMetaByProperty('og:url', tags.canonicalUrl)
  upsertMetaByProperty('og:type', tags.ogType)
  upsertMetaByProperty('og:image', tags.ogImageUrl)
  upsertMetaByProperty('og:locale', tags.locale ?? 'es_CO')
  if (tags.ogSiteName) upsertMetaByProperty('og:site_name', tags.ogSiteName)

  const card = tags.twitterCard ?? 'summary_large_image'
  upsertMetaByName('twitter:card', card)
  upsertMetaByName('twitter:title', tags.title)
  upsertMetaByName('twitter:description', tags.description)
  upsertMetaByName('twitter:image', tags.ogImageUrl)
}
