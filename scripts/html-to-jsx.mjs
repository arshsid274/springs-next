#!/usr/bin/env node
// Converts a Webflow-exported HTML body file (app/_html/<slug>.body.html)
// into a JSX/TSX React component that re-emits the exact same DOM. Goal is
// 100% fidelity with the source HTML so the bespoke animation runtime in
// shared.js (which selects on class names + data-* attributes) keeps working.
//
// Strategy: walk the HTML with htmlparser2's tokenizer and emit JSX. We do
// not try to be cute — every attribute is preserved, every void tag self-
// closes, every comment is dropped (JSX can't represent HTML comments inline
// without {/* ... */} wrappers and Webflow comments are pure noise).
//
// Tag-soup edge cases that matter for this project:
//   - <use xlink:href="...">  -> JSX attr name xlinkHref
//   - inline style="--icon-width: 82;" -> style={{ '--icon-width': '82' }}
//   - <script type="text/template">...</script> -> rendered as raw markup
//     via dangerouslySetInnerHTML so the template stays an inert string the
//     real scripts can read with .innerHTML
//   - boolean attrs (required, disabled, async, hidden) -> {true}
//   - data-* attrs are lower-case in HTML and JSX both, kept as-is
//   - aria-* attrs are lower-case in JSX, kept as-is
//   - tabindex -> tabIndex, for -> htmlFor, etc. (see ATTR_MAP)

import fs from 'node:fs';
import path from 'node:path';
import { Parser } from 'htmlparser2';

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
]);

// HTML attribute -> JSX attribute. SVG names that need camelCase are
// included. Anything not in this map is passed through unchanged (which is
// correct for data-*, aria-*, and most SVG presentation attrs).
const ATTR_MAP = new Map(Object.entries({
  'class': 'className',
  'for': 'htmlFor',
  'tabindex': 'tabIndex',
  'readonly': 'readOnly',
  'maxlength': 'maxLength',
  'minlength': 'minLength',
  'autocomplete': 'autoComplete',
  'autofocus': 'autoFocus',
  'autoplay': 'autoPlay',
  'autocapitalize': 'autoCapitalize',
  'autocorrect': 'autoCorrect',
  'spellcheck': 'spellCheck',
  'crossorigin': 'crossOrigin',
  'enctype': 'encType',
  'novalidate': 'noValidate',
  'formnovalidate': 'formNoValidate',
  'usemap': 'useMap',
  'colspan': 'colSpan',
  'rowspan': 'rowSpan',
  'datetime': 'dateTime',
  'inputmode': 'inputMode',
  'contenteditable': 'contentEditable',
  'srcset': 'srcSet',
  'srcdoc': 'srcDoc',
  'fetchpriority': 'fetchPriority',
  'allowfullscreen': 'allowFullScreen',
  'allowpaymentrequest': 'allowPaymentRequest',
  'accept-charset': 'acceptCharset',
  'accesskey': 'accessKey',
  'charset': 'charSet',
  'formaction': 'formAction',
  'formenctype': 'formEncType',
  'formmethod': 'formMethod',
  'formtarget': 'formTarget',
  'frameborder': 'frameBorder',
  'marginheight': 'marginHeight',
  'marginwidth': 'marginWidth',
  'referrerpolicy': 'referrerPolicy',
  'rowindex': 'rowIndex',
  'colindex': 'colIndex',
  'imagesrcset': 'imageSrcSet',
  'imagesizes': 'imageSizes',
  'srclang': 'srcLang',
  'itemprop': 'itemProp',
  'itemscope': 'itemScope',
  'itemtype': 'itemType',
  'itemref': 'itemRef',
  'itemid': 'itemID',
  // SVG
  'viewbox': 'viewBox',
  'xlink:href': 'xlinkHref',
  'xlink:title': 'xlinkTitle',
  'xlink:role': 'xlinkRole',
  'xlink:arcrole': 'xlinkArcrole',
  'xlink:show': 'xlinkShow',
  'xlink:actuate': 'xlinkActuate',
  'xlink:type': 'xlinkType',
  'xmlns:xlink': 'xmlnsXlink',
  'xml:lang': 'xmlLang',
  'xml:space': 'xmlSpace',
  'preserveaspectratio': 'preserveAspectRatio',
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-opacity': 'strokeOpacity',
  'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule',
  'clip-path': 'clipPath',
  'clip-rule': 'clipRule',
  'color-interpolation-filters': 'colorInterpolationFilters',
  'flood-color': 'floodColor',
  'flood-opacity': 'floodOpacity',
  'gradientunits': 'gradientUnits',
  'gradienttransform': 'gradientTransform',
  'patternunits': 'patternUnits',
  'patterntransform': 'patternTransform',
  'patterncontentunits': 'patternContentUnits',
  'maskunits': 'maskUnits',
  'maskcontentunits': 'maskContentUnits',
  'spreadmethod': 'spreadMethod',
  'stopcolor': 'stopColor',
  'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity',
  'textanchor': 'textAnchor',
  'text-anchor': 'textAnchor',
  'dominant-baseline': 'dominantBaseline',
  'alignment-baseline': 'alignmentBaseline',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  'font-style': 'fontStyle',
}));

// HTML attributes that are pure-boolean (presence = true). Webflow output
// uses several of these.
const BOOLEAN_ATTRS = new Set([
  'allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'controls',
  'default', 'defer', 'disabled', 'formnovalidate', 'hidden', 'inert',
  'ismap', 'itemscope', 'loop', 'multiple', 'muted', 'nomodule', 'novalidate',
  'open', 'playsinline', 'readonly', 'required', 'reversed', 'selected',
]);

function escapeForJsxText(s) {
  // JSX text nodes need {, }, <, > escaped. We render special chars via the
  // braced unicode escape because JSX text won't pass them as-is in all cases.
  return s
    .replace(/\{/g, '{"{"}')
    .replace(/\}/g, '{"}"}');
}

function attrToJsx(rawName, rawValue, tagName) {
  const lower = rawName.toLowerCase();
  let name = ATTR_MAP.get(lower) ?? rawName;
  // data-* and aria-* always pass through with their original case (lower).
  if (lower.startsWith('data-') || lower.startsWith('aria-')) name = lower;

  // Webflow output occasionally uses non-standard camelCase HTML attributes
  // (isFlatPage, isFlatsPage, statusIndicator, ...) as feature flags read by
  // shared.js at runtime. React 18+ refuses to forward unknown camelCase
  // props to the DOM unless they're lowercase. Lowercasing them here keeps
  // them in the DOM where shared.js looks (HTML attribute names are ASCII-
  // case-insensitive via getAttribute, so the page logic still finds them).
  if (
    name !== lower &&
    !ATTR_MAP.has(lower) &&
    !lower.startsWith('data-') &&
    !lower.startsWith('aria-') &&
    !/^(viewBox|xlink|preserveAspect|stroke|fill|clip|stop|text|font|color|flood|gradient|pattern|mask|spread|dominant|alignment)/i.test(name)
  ) {
    name = lower;
  }

  // <input value="X" /> in HTML is a server-rendered default; in React the
  // same prop makes it a *controlled* input which then refuses user typing
  // without an onChange handler. Webflow output has many such inputs. Map
  // value → defaultValue for form fields so they behave as the original.
  if (
    lower === 'value' &&
    (tagName === 'input' || tagName === 'textarea' || tagName === 'select')
  ) {
    name = 'defaultValue';
  }
  if (lower === 'checked' && tagName === 'input') {
    name = 'defaultChecked';
  }
  // React refuses `selected` on <option> (wants defaultValue on <select>,
  // which requires structural buffering we don't do here). Stash the marker
  // in a data attribute and let PageBoot apply it after mount — the original
  // Webflow form runtime reads the live `selected` DOM property anyway.
  if (lower === 'selected' && tagName === 'option') {
    return ` data-default-selected={true}`;
  }

  // Style: parse to JS object.
  if (lower === 'style') {
    return ` style={${styleStringToJsObject(rawValue)}}`;
  }

  // Boolean attributes: render as {true} if value is empty/equal to name.
  if (BOOLEAN_ATTRS.has(lower)) {
    if (rawValue === '' || rawValue == null || rawValue.toLowerCase() === lower) {
      return ` ${name}={true}`;
    }
  }

  // Always-string attrs.
  if (rawValue == null) {
    // No value => boolean true.
    return ` ${name}={true}`;
  }
  // Always emit as a JSX expression (`={"..."}`) rather than a JSX string
  // attribute (`="..."`). Webflow attributes routinely contain literal `{`,
  // `}`, `<`, `>` (e.g. JSON in data-scroll-snap-point) which the JSX parser
  // misinterprets in string-attribute form but treats as plain text inside
  // an expression.
  return ` ${name}={${JSON.stringify(rawValue)}}`;
}

function styleStringToJsObject(styleStr) {
  // Convert "color: red; --x: 5; background-image: url('a.png');" into a JS
  // object literal. CSS custom properties (--*) must stay as quoted string
  // keys; standard kebab-case properties become camelCase keys.
  const obj = {};
  // Splitting on semicolons is safe in Webflow output (no semicolons inside
  // url() in this codebase). url() values without semicolons inside survive
  // this split.
  for (const part of styleStr.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const rawKey = part.slice(0, i).trim();
    const rawVal = part.slice(i + 1).trim();
    if (!rawKey) continue;
    if (rawKey.startsWith('--')) {
      obj[rawKey] = rawVal;
    } else {
      const camel = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      obj[camel] = rawVal;
    }
  }
  // JSON.stringify gives us a valid JS object literal that React accepts.
  return JSON.stringify(obj);
}

function convertHtmlToJsx(html) {
  // Output is the JSX *body* — a single fragment containing all children of
  // the input HTML. We always wrap in a Fragment because the input may have
  // multiple top-level nodes (which it does in the Webflow body files).
  let out = '';
  const tagStack = [];

  // Inside a <script type="text/template"> block we treat content as raw
  // string and emit a single dangerouslySetInnerHTML, otherwise React would
  // strip the inner markup.
  let inInertScript = false;
  let inertScriptBuf = '';
  let inertScriptAttrs = '';

  const parser = new Parser({
    onopentag(name, attrs) {
      // Skip <script>/<style> tags as live nodes — Webflow body files have
      // already had executable scripts stripped by extract-page.mjs. What's
      // left are inert template scripts (type="text/template") used as data
      // by shared.js, plus the occasional inline <style>. Both must be
      // preserved as raw markup.
      if (name === 'script' || name === 'style') {
        inInertScript = true;
        inertScriptBuf = '';
        // Build the attrs JSX for this tag.
        let attrJsx = '';
        for (const [k, v] of Object.entries(attrs)) attrJsx += attrToJsx(k, v, name);
        inertScriptAttrs = attrJsx;
        return;
      }

      let attrJsx = '';
      for (const [k, v] of Object.entries(attrs)) attrJsx += attrToJsx(k, v, name);

      if (VOID_TAGS.has(name)) {
        out += `<${name}${attrJsx} />`;
        return;
      }

      out += `<${name}${attrJsx}>`;
      tagStack.push(name);
    },
    ontext(text) {
      if (inInertScript) {
        inertScriptBuf += text;
        return;
      }
      out += escapeForJsxText(text);
    },
    onclosetag(name) {
      if ((name === 'script' || name === 'style') && inInertScript) {
        // Emit the script/style as a single node with dangerouslySetInnerHTML.
        // The original content is preserved byte-for-byte.
        const safe = JSON.stringify(inertScriptBuf);
        out += `<${name}${inertScriptAttrs} dangerouslySetInnerHTML={{ __html: ${safe} }} />`;
        inInertScript = false;
        inertScriptBuf = '';
        inertScriptAttrs = '';
        return;
      }
      if (VOID_TAGS.has(name)) return; // already self-closed
      out += `</${name}>`;
      tagStack.pop();
    },
    oncomment() {
      // Drop HTML comments. They have no animation hooks.
    },
  }, {
    // htmlparser2 lowercases tag names by default; we want lowercase JSX so
    // React treats them as host elements (lowercase = DOM tag).
    lowerCaseTags: true,
    lowerCaseAttributeNames: false, // preserve viewBox / xlink:href casing
    recognizeSelfClosing: true,
  });

  parser.write(html);
  parser.end();
  return out;
}

function writeComponent(jsx, outFile, componentName) {
  const file = `// AUTO-GENERATED by scripts/html-to-jsx.mjs. Do not edit by hand — re-run
// the converter to regenerate. The source HTML lives in app/_html/.
//
// @ts-nocheck — Webflow's HTML uses CSS custom properties in inline style,
// string-valued SVG width/height, and a handful of unknown camelCase
// attributes (isFlatPage, etc.) that shared.js reads at runtime. None of
// these are TypeScript-clean but all are correct at runtime. We disable the
// type checker on the generated file rather than scrub the source.
/* eslint-disable */

export default function ${componentName}() {
  return (
    <>
${jsx}
    </>
  );
}
`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, file, 'utf8');
}

function main() {
  const [, , slug, outArg] = process.argv;
  if (!slug) {
    console.error('usage: node scripts/html-to-jsx.mjs <slug> [outFile]');
    process.exit(2);
  }
  const htmlPath = path.join('app', '_html', `${slug}.body.html`);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const jsx = convertHtmlToJsx(html);
  const componentName = slug
    .split(/[-_]/)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('') + 'Body';
  const out = outArg ?? path.join('app', '_components', 'generated', `${componentName}.tsx`);
  writeComponent(jsx, out, componentName);
  console.log(`wrote ${out} (${jsx.length} chars of JSX)`);
}

main();
