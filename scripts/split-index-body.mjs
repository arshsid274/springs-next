#!/usr/bin/env node
// Splits the index page into one TSX component per visual section. Works
// directly from the HTML source (app/_html/index.body.html) using
// htmlparser2 — which already knows how to balance HTML tags, skip
// attribute strings, etc. — rather than re-parsing the converted JSX.
//
// During the single parsing pass:
//   - Normal output streams into the root IndexBody buffer.
//   - When the parser opens an element whose tag + attributes match a
//     section definition, output switches to that section's own buffer.
//     The section's start byte is captured.
//   - When that element closes back to its original depth, the buffer is
//     finalized as a .tsx file and a `<SectionName />` marker is emitted
//     into the root buffer in its place.

import fs from 'node:fs';
import path from 'node:path';
import { Parser } from 'htmlparser2';

// --- Reuse the converter's attribute / style logic ---------------------

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
]);
const ATTR_MAP = new Map(Object.entries({
  'class': 'className', 'for': 'htmlFor', 'tabindex': 'tabIndex',
  'readonly': 'readOnly', 'maxlength': 'maxLength', 'minlength': 'minLength',
  'autocomplete': 'autoComplete', 'autofocus': 'autoFocus', 'autoplay': 'autoPlay',
  'autocapitalize': 'autoCapitalize', 'autocorrect': 'autoCorrect',
  'spellcheck': 'spellCheck', 'crossorigin': 'crossOrigin', 'enctype': 'encType',
  'novalidate': 'noValidate', 'formnovalidate': 'formNoValidate',
  'usemap': 'useMap', 'colspan': 'colSpan', 'rowspan': 'rowSpan',
  'datetime': 'dateTime', 'inputmode': 'inputMode',
  'contenteditable': 'contentEditable',
  'srcset': 'srcSet', 'srcdoc': 'srcDoc', 'fetchpriority': 'fetchPriority',
  'allowfullscreen': 'allowFullScreen', 'allowpaymentrequest': 'allowPaymentRequest',
  'accept-charset': 'acceptCharset', 'accesskey': 'accessKey', 'charset': 'charSet',
  'formaction': 'formAction', 'formenctype': 'formEncType',
  'formmethod': 'formMethod', 'formtarget': 'formTarget',
  'frameborder': 'frameBorder', 'marginheight': 'marginHeight',
  'marginwidth': 'marginWidth', 'referrerpolicy': 'referrerPolicy',
  'imagesrcset': 'imageSrcSet', 'imagesizes': 'imageSizes', 'srclang': 'srcLang',
  'itemprop': 'itemProp', 'itemscope': 'itemScope', 'itemtype': 'itemType',
  'itemref': 'itemRef', 'itemid': 'itemID',
  'viewbox': 'viewBox', 'xlink:href': 'xlinkHref', 'xlink:title': 'xlinkTitle',
  'xlink:role': 'xlinkRole', 'xlink:arcrole': 'xlinkArcrole',
  'xlink:show': 'xlinkShow', 'xlink:actuate': 'xlinkActuate',
  'xlink:type': 'xlinkType', 'xmlns:xlink': 'xmlnsXlink',
  'xml:lang': 'xmlLang', 'xml:space': 'xmlSpace',
  'preserveaspectratio': 'preserveAspectRatio',
  'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin', 'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-dasharray': 'strokeDasharray', 'stroke-dashoffset': 'strokeDashoffset',
  'stroke-opacity': 'strokeOpacity', 'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule', 'clip-path': 'clipPath', 'clip-rule': 'clipRule',
  'color-interpolation-filters': 'colorInterpolationFilters',
  'flood-color': 'floodColor', 'flood-opacity': 'floodOpacity',
  'gradientunits': 'gradientUnits', 'gradienttransform': 'gradientTransform',
  'patternunits': 'patternUnits', 'patterntransform': 'patternTransform',
  'patterncontentunits': 'patternContentUnits',
  'maskunits': 'maskUnits', 'maskcontentunits': 'maskContentUnits',
  'spreadmethod': 'spreadMethod', 'stopcolor': 'stopColor',
  'stop-color': 'stopColor', 'stop-opacity': 'stopOpacity',
  'textanchor': 'textAnchor', 'text-anchor': 'textAnchor',
  'dominant-baseline': 'dominantBaseline', 'alignment-baseline': 'alignmentBaseline',
  'font-family': 'fontFamily', 'font-size': 'fontSize',
  'font-weight': 'fontWeight', 'font-style': 'fontStyle',
}));
const BOOLEAN_ATTRS = new Set([
  'allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'controls',
  'default', 'defer', 'disabled', 'formnovalidate', 'hidden', 'inert',
  'ismap', 'itemscope', 'loop', 'multiple', 'muted', 'nomodule', 'novalidate',
  'open', 'playsinline', 'readonly', 'required', 'reversed', 'selected',
]);

function escapeForJsxText(s) {
  return s.replace(/\{/g, '{"{"}').replace(/\}/g, '{"}"}');
}
function styleStringToJsObject(styleStr) {
  const obj = {};
  for (const part of styleStr.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const rawKey = part.slice(0, i).trim();
    const rawVal = part.slice(i + 1).trim();
    if (!rawKey) continue;
    if (rawKey.startsWith('--')) obj[rawKey] = rawVal;
    else obj[rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = rawVal;
  }
  return JSON.stringify(obj);
}
function attrToJsx(rawName, rawValue, tagName) {
  const lower = rawName.toLowerCase();
  let name = ATTR_MAP.get(lower) ?? rawName;
  if (lower.startsWith('data-') || lower.startsWith('aria-')) name = lower;
  if (
    name !== lower &&
    !ATTR_MAP.has(lower) &&
    !lower.startsWith('data-') &&
    !lower.startsWith('aria-') &&
    !/^(viewBox|xlink|preserveAspect|stroke|fill|clip|stop|text|font|color|flood|gradient|pattern|mask|spread|dominant|alignment)/i.test(name)
  ) name = lower;
  if (lower === 'value' && (tagName === 'input' || tagName === 'textarea' || tagName === 'select')) name = 'defaultValue';
  if (lower === 'checked' && tagName === 'input') name = 'defaultChecked';
  if (lower === 'selected' && tagName === 'option') return ` data-default-selected={true}`;
  if (lower === 'style') return ` style={${styleStringToJsObject(rawValue)}}`;
  if (BOOLEAN_ATTRS.has(lower) && (rawValue === '' || rawValue == null || rawValue.toLowerCase() === lower)) {
    return ` ${name}={true}`;
  }
  if (rawValue == null) return ` ${name}={true}`;
  return ` ${name}={${JSON.stringify(rawValue)}}`;
}

// --- Section table ----------------------------------------------------
//
// matcher(name, attrs) -> true if this opening tag starts the section. We
// gate on tag name + a discriminating attribute (id or distinctive class).

const SECTIONS = [
  { name: 'Preloader',         file: 'Preloader.tsx',                   match: (n, a) => n === 'div' && a['data-plugin'] === 'preloader' },
  { name: 'PreloaderLanding',  file: 'PreloaderLanding.tsx',            match: (n, a) => n === 'div' && a['data-plugin'] === 'preloaderLanding' },
  { name: 'Header',            file: 'Header.tsx',                      match: (n, a) => n === 'header' && /\bheader--landing\b/.test(a.class || '') && !/header--sticky is-hidden--print ui-dark header--landing$/.test((a.class || '').trim()) },
  { name: 'HeroGallery',       file: 'sections/HeroGallery.tsx',        match: (n, a) => n === 'div' && a.id === 'l-gallery-sticky' },
  { name: 'AboutSection',      file: 'sections/AboutSection.tsx',       match: (n, a) => n === 'div' && a.id === 'about' },
  { name: 'AboutSectionMobile',file: 'sections/AboutSectionMobile.tsx', match: (n, a) => n === 'div' && a.id === 'about-mobile' },
  { name: 'AboutContent',      file: 'sections/AboutContent.tsx',       match: (n, a) => n === 'div' && /\bl-intro__content\b/.test(a.class || '') && /\bis-hidden--lg-up\b/.test(a.class || '') },
  { name: 'WellnessSection',   file: 'sections/WellnessSection.tsx',    match: (n, a) => n === 'div' && a.id === 'wellness' },
  { name: 'WellnessSectionMobile', file: 'sections/WellnessSectionMobile.tsx', match: (n, a) => n === 'div' && a.id === 'wellness-mobile' },
  { name: 'WellnessSlider',    file: 'sections/WellnessSlider.tsx',     match: (n, a) => n === 'div' && /\bl-wellness__slider-container\b/.test(a.class || '') },
  { name: 'NatureSection',     file: 'sections/NatureSection.tsx',      match: (n, a) => n === 'div' && a.id === 'nature' },
  { name: 'NatureSectionMobile', file: 'sections/NatureSectionMobile.tsx', match: (n, a) => n === 'div' && a.id === 'nature-mobile' },
  { name: 'PlaceMobile',       file: 'sections/PlaceMobile.tsx',        match: (n, a) => n === 'div' && /\bl-place-mobile\b/.test(a.class || '') },
  { name: 'PlaceVideo',        file: 'sections/PlaceVideo.tsx',         match: (n, a) => n === 'div' && a.id === 'l-place-content' },
  { name: 'PlaceSticky1',      file: 'sections/PlaceSticky1.tsx',       match: (n, a) => n === 'div' && a.id === 'l-place-sticky-1' },
  { name: 'PlaceSticky2',      file: 'sections/PlaceSticky2.tsx',       match: (n, a) => n === 'div' && a.id === 'l-place-sticky-2' },
  { name: 'PlaceSticky3',      file: 'sections/PlaceSticky3.tsx',       match: (n, a) => n === 'div' && a.id === 'l-place-sticky-3' },
  { name: 'PlaceDescription',  file: 'sections/PlaceDescription.tsx',   match: (n, a) => n === 'div' && /\bl-place-description\b/.test(a.class || '') },
  { name: 'MapSection',        file: 'sections/MapSection.tsx',         match: (n, a) => n === 'div' && a.id === 'l-map-sticky' },
  { name: 'MapSection2',       file: 'sections/MapSection2.tsx',        match: (n, a) => n === 'div' && a.id === 'l-map-sticky-2' },
  { name: 'DesignSlide1',      file: 'sections/DesignSlide1.tsx',       match: (n, a) => n === 'div' && a.id === 'design' },
  { name: 'DesignSlide2',      file: 'sections/DesignSlide2.tsx',       match: (n, a) => n === 'div' && a.id === 'l-design-sticky-2' },
  { name: 'DesignSlide3',      file: 'sections/DesignSlide3.tsx',       match: (n, a) => n === 'div' && a.id === 'l-design-sticky-3' },
  { name: 'DesignMobile1',     file: 'sections/DesignMobile1.tsx',      match: (n, a) => n === 'div' && a.id === 'design-mobile' },
  { name: 'DesignMobile2',     file: 'sections/DesignMobile2.tsx',      match: (n, a) => n === 'div' && /\bl-design__slide--2\b/.test(a.class || '') && /\bis-hidden--lg-up\b/.test(a.class || '') },
  { name: 'DesignMobile3',     file: 'sections/DesignMobile3.tsx',      match: (n, a) => n === 'div' && a.id === 'l-design-mobile-sticky-2' },
  { name: 'DesignMobile4',     file: 'sections/DesignMobile4.tsx',      match: (n, a) => n === 'div' && /\bl-design__slide--4\b/.test(a.class || '') },
  { name: 'Residences1',       file: 'sections/Residences1.tsx',        match: (n, a) => n === 'div' && a.id === 'l-residences-sticky-1' },
  { name: 'Residences2',       file: 'sections/Residences2.tsx',        match: (n, a) => n === 'div' && a.id === 'l-residences-sticky-2' },
  { name: 'ResidencesSlider',  file: 'sections/ResidencesSlider.tsx',   match: (n, a) => n === 'div' && /\bl-residences__slider-container\b/.test(a.class || '') },
  { name: 'Interiors1',        file: 'sections/Interiors1.tsx',         match: (n, a) => n === 'div' && a.id === 'interiors' },
  { name: 'Interiors2',        file: 'sections/Interiors2.tsx',         match: (n, a) => n === 'div' && a.id === 'interiors-2' },
  { name: 'InteriorsSlider',   file: 'sections/InteriorsSlider.tsx',    match: (n, a) => n === 'div' && /\bl-interiors__slider\b/.test(a.class || '') },
  { name: 'Footer',            file: 'Footer.tsx',                      match: (n, a) => n === 'footer' },
  { name: 'BottomHeader',      file: 'BottomHeader.tsx',                match: (n, a) => n === 'header' && /header header--sticky is-hidden--print ui-dark header--landing$/.test((a.class || '').trim()) },
  { name: 'CookieConsent',     file: 'CookieConsent.tsx',               match: (n, a) => n === 'dialog' && a.id === 'cookie-consent' },
  { name: 'TurnMessage',       file: 'TurnMessage.tsx',                 match: (n, a) => n === 'div' && /\bturn-message\b/.test(a.class || '') },
];

// --- The parser-driven splitter ---------------------------------------

function buildComponent(name, body) {
  return `// AUTO-SPLIT from app/_html/index.body.html by scripts/split-index-body.mjs
// Re-run the splitter to regenerate.
// @ts-nocheck
/* eslint-disable */

export default function ${name}() {
  return (
    <>
${body}
    </>
  );
}
`;
}

function main() {
  const htmlPath = path.join('app', '_html', 'index.body.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  let rootOut = '';
  // Each frame represents an active section capture: section descriptor +
  // buffer + depth at which it opened (so we can detect when it closes).
  const captures = [];
  // Tag-depth stack for non-section nodes too — used to know when a section's
  // root element finally closes.
  const tagStack = [];

  // Inert script handling (preserve raw content via dangerouslySetInnerHTML).
  let inInert = false;
  let inertBuf = '';
  let inertAttrs = '';
  let inertTag = '';

  // Sections completed during parsing (in encounter order).
  const completed = [];

  function emit(text) {
    if (captures.length > 0) captures[captures.length - 1].buf += text;
    else rootOut += text;
  }

  const parser = new Parser({
    onopentag(name, attrs) {
      if (name === 'script' || name === 'style') {
        inInert = true;
        inertBuf = '';
        inertTag = name;
        let a = '';
        for (const [k, v] of Object.entries(attrs)) a += attrToJsx(k, v, name);
        inertAttrs = a;
        return;
      }

      // Match against section definitions in order; the first matcher wins.
      // We allow at most one section to be active at a time (no nesting of
      // captures), so if we're already inside a capture and another section
      // matches, we treat the inner element as part of the outer section.
      let matched = null;
      if (captures.length === 0) {
        for (const s of SECTIONS) {
          if (s.match(name, attrs)) { matched = s; break; }
        }
      }

      let attrJsx = '';
      for (const [k, v] of Object.entries(attrs)) attrJsx += attrToJsx(k, v, name);

      if (matched) {
        // Start a new capture. The opening tag goes INTO the section's buffer,
        // not the root.
        captures.push({ section: matched, buf: '', startDepth: tagStack.length });
        captures[captures.length - 1].buf += `<${name}${attrJsx}>`;
        tagStack.push(name);
        return;
      }

      if (VOID_TAGS.has(name)) {
        emit(`<${name}${attrJsx} />`);
        return;
      }
      emit(`<${name}${attrJsx}>`);
      tagStack.push(name);
    },
    ontext(text) {
      if (inInert) { inertBuf += text; return; }
      emit(escapeForJsxText(text));
    },
    onclosetag(name) {
      if ((name === 'script' || name === 'style') && inInert) {
        const safe = JSON.stringify(inertBuf);
        emit(`<${inertTag}${inertAttrs} dangerouslySetInnerHTML={{ __html: ${safe} }} />`);
        inInert = false; inertBuf = ''; inertAttrs = ''; inertTag = '';
        return;
      }
      if (VOID_TAGS.has(name)) return;

      const current = captures[captures.length - 1];
      const closingDepth = tagStack.length - 1;
      // Append the close tag (it belongs to whoever the open belonged to).
      emit(`</${name}>`);
      tagStack.pop();

      // If this close brings us back to the depth at which the active
      // section opened, the section ends here. Finalize it.
      if (current && closingDepth === current.startDepth) {
        completed.push({ section: current.section, body: current.buf });
        captures.pop();
        // Emit the marker in the root (or in the enclosing capture, which
        // shouldn't normally happen since we disallow nested captures).
        rootOut += `<${current.section.name} />`;
      }
    },
    oncomment() {},
  }, {
    lowerCaseTags: true,
    lowerCaseAttributeNames: false,
    recognizeSelfClosing: true,
  });

  parser.write(html);
  parser.end();

  if (captures.length > 0) {
    throw new Error(`section did not close: ${captures.map((c) => c.section.name).join(', ')}`);
  }

  // Write everything.
  const OUT_DIR = path.join('app', '_components', 'index');
  fs.mkdirSync(path.join(OUT_DIR, 'sections'), { recursive: true });

  const importLines = [];
  for (const { section, body } of completed) {
    const outPath = path.join(OUT_DIR, section.file);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buildComponent(section.name, body), 'utf8');
    // Composed root lives at app/_components/IndexBodyComposed.tsx; section
    // files live at app/_components/index/... so imports need the `index/`
    // prefix.
    const importPath = `./index/${section.file.replace(/\.tsx$/, '')}`;
    importLines.push(`import ${section.name} from '${importPath}';`);
  }

  const composed = `// AUTO-COMPOSED by scripts/split-index-body.mjs from app/_html/index.body.html.
// Each <SectionName /> in the JSX below renders the matching component in
// app/_components/index/. Re-run the splitter after edits to the source HTML.
// @ts-nocheck
/* eslint-disable */

${importLines.join('\n')}

export default function IndexBody() {
  return (
    <>
${rootOut}
    </>
  );
}
`;

  fs.writeFileSync(path.join('app', '_components', 'IndexBodyComposed.tsx'), composed, 'utf8');

  console.log(`wrote ${completed.length} section files to ${OUT_DIR}/`);
  console.log(`wrote composed root at app/_components/IndexBodyComposed.tsx`);
  console.log('');
  for (const { section, body } of completed) {
    const bodyLines = body.split('\n').length;
    console.log(`  ${section.name.padEnd(24)} ${String(bodyLines).padStart(5)} lines`);
  }
  // Sections in the table that never matched (potentially typo'd / removed)
  const matchedNames = new Set(completed.map((c) => c.section.name));
  const missing = SECTIONS.filter((s) => !matchedNames.has(s.name));
  if (missing.length > 0) {
    console.log('');
    console.log('WARNING: these sections were declared but did not match any element:');
    for (const s of missing) console.log(`  - ${s.name}`);
  }
}

main();
