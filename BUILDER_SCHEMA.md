# Storefront builder — schema, versions, links, publishing

Source of truth: `src/lib/builder/schema.ts` (shared by browser and server). Server
services: `src/server/storefront/{drafts,publish,public,profile,legacy-import}.ts`.

## 1. Document

One JSON document per business, with three separate concerns (no color is stored twice):

| Section | Contents | Notes |
|---|---|---|
| `brand` | 8 color tokens, heading/body font (allowlisted Google families), radius, button style, card style, density, logo asset, text wordmark | Mapped 1:1 to CSS variables `--sf-*` by `components/storefront/theme.ts` |
| `appearance` | nav style (`simple` / `pill` / `bottom`), service display (`list`/`cards`), product display (`grid`/`list`), `showPoweredBy` | `showPoweredBy` is forced `true` unless the plan has `branding.remove_powered_by` |
| `layout.pages[]` | `{ id, kind, slug, title{ar,en}, showInNav, showInFooter, blocks[] }` | exactly one `home`; kinds: home, services, products, team, about, contact, faq, policies, custom |

Business facts (tagline, intro, contact, WhatsApp, address, socials) live in `tenant_profiles`
and are *referenced* by blocks; catalog data (names, prices, durations, photos, stock) is read
live from the catalog. Blocks store IDs only, never copied prices.

Storage: `storefront_drafts` (one row, `version` for optimistic concurrency) and
`page_versions` (immutable snapshots, UPDATE rejected by trigger). `tenants.published_version_id`
points at the live snapshot.

## 2. Blocks

```ts
type PageBlock = {
  id: string; type: BlockType; schemaVersion: number;
  props: Record<string, unknown>;          // validated by BLOCK_PROPS[type]
  visibility: { enabled: boolean };
  action?: { type: 'start_booking'|'service'|'product'|'category'|'staff'|'page'|'section'|'external'; targetId?: string; url?: string };
  children?: PageBlock[];                  // containers only
};
```

| Category | Types |
|---|---|
| media | `hero` (1/page), `image_ad`, `image` (clickable when it has an action), `gallery` (keyboard lightbox) |
| content | `text` (sanitized rich text), `cta` (action required), `intro` (from profile), `welcome` (1/page) |
| catalog | `service_list`, `service`, `categories`, `product_grid`, `product`, `offers` (packages) |
| people | `team`, `staff` |
| trust | `reviews` (visit-linked reviews only, 1/page), `faq`, `policies` (1/page) |
| info | `map`, `hours`, `contact`, `social` (each 1/page) |
| layout | `columns` (container, 2–3 cols), `footer` (rendered once by the frame) |

Registry per type (`BLOCK_META`): category, action rule (`none`/`optional`/`required`), `maxPerPage`,
`container`, `childAllowed`, `schemaVersion`. Renderers: `components/storefront/Blocks.tsx`
(pure, used by public pages AND the builder canvas). Editors: `components/builder/fieldDefs.ts`
(declarative) + `Properties.tsx`. Migrations: `BLOCK_MIGRATIONS[type][fromVersion]`, applied by
`migrateDocument()` on load.

### Limits & nesting
15 pages · 60 blocks/page · containers hold ≤ 6 children · depth ≤ 2 · containers cannot nest ·
only `image`, `image_ad`, `text`, `cta`, `service`, `product`, `staff` may sit inside a container ·
gallery ≤ 40 images · FAQ ≤ 30 items. Enforced in the browser (`components/builder/ops.ts`) and
again by the server (`validateDocument`).

## 3. Actions & links

| Action | Resolves to | Missing / archived target |
|---|---|---|
| `start_booking` (+ optional service) | `/s/<slug>/booking[?service=…]` | plain booking start |
| `service` / `product` / `staff` | detail page | visible fallback "link unavailable" |
| `category` | `/services?category=` or `/products?category=` | fallback |
| `page` | page route by kind / `/pages/<slug>` | validation error (must exist) |
| `section` | `#<blockId>` on the same page | validation error |
| `external` | `https:`, `mailto:`, `tel:` only, no credentials in URL | rejected |

`javascript:`, `data:`, `http:` and protocol-relative URLs are rejected everywhere (actions, rich
text links). Rich text allowlist: `p strong em ul ol li br a[href]`; links get
`rel="noopener noreferrer nofollow"`; unsafe links degrade to text. Sanitized on every save and
again when rendering.

The storefront frame always shows a **Book** entry and the generated `/services` page, so removing
catalog blocks never removes the ability to book. Booking policy text is always reachable at
`/policies` before payment.

## 4. Reference checks (tenant isolation)
Every id in a document (services, products, categories, staff, packages, assets, branches) is
checked inside the tenant's RLS scope. Another tenant's id is indistinguishable from a missing one
and is rejected (`errors.builder_ref_missing`) at save and at publish. Inactive/archived/hidden
targets produce warnings; visitors see a clear fallback.

## 5. Drafts, autosave, conflicts
- `GET /api/v1/t/<tenant>/storefront/draft` → `{ document, version }` (+ `ETag`).
- `PUT …/draft` `{ document, expectedVersion }` (or `If-Match`) → 409 `version_conflict` if stale.
- The builder autosaves 1.5 s after the last change, shows "saved HH:MM" / unsaved / conflict.
  On 409 it never overwrites silently: the owner chooses "load latest" or "keep mine".
- Undo/redo (Ctrl+Z / Ctrl+Shift+Z) with coalesced typing; delete is undoable.
- `applyDraftPatch(tx, ctx, transform, expectedVersion, meta)` is the only entry point for other
  modules (customization assistant): same validation, never publishes.

## 6. Publishing, versions, rollback
- `POST …/publish { expectedVersion }` (idempotent): re-validates, writes an immutable
  `page_versions` row and moves `published_version_id` in ONE transaction.
- `GET …/versions`; `POST …/versions/<id>/restore { expectedVersion, republish }`:
  restore copies the snapshot into the draft; `republish: true` (requires `storefront.publish`)
  publishes it as a NEW version (`restored_from_id`), audited as `storefront.rolled_back`.
  Rollback affects design only — bookings, orders and inventory are untouched.

## 7. Previews
`POST …/preview-token { hours ≤ 168 }` → `/preview/<token>`; tokens are stored hashed, revocable
(`DELETE …/preview-token`), expire, are bound to one tenant, render with a "private preview"
banner, `noindex` (meta + `X-Robots-Tag`), and emit no analytics. Visitors on `/s/<slug>` only
ever see the published snapshot; an unpublished store is a 404.

## 8. Builder UI
`/app/<tenant>/builder` (requires `storefront.edit`; publish needs `storefront.publish`):
component library (drag or **Add** button), canvas (desktop/mobile), properties panel, plus tabs for
pages (add/rename/slug/nav/footer/reorder/delete), brand (palettes, colors with contrast warnings,
fonts, radius/button/card/density, logo, wordmark, display options), business info (profile),
and versions. Every drag operation has a keyboard/touch alternative: per-block toolbar
(move up/down, duplicate, hide/show, delete), `Alt+↑/↓`, Enter to select. Images upload through
the asset pipeline (type sniffing, re-encode, alt text). Leaving with unsaved changes warns.

## 9. Legacy migration
`POST …/storefront/legacy-import { data: { luma_site, luma_page_cfg }, expectedVersion }` converts
the old browser settings into a DRAFT (never published). Color precedence:
`luma_page_cfg.themeCustom` > `luma_page_cfg.theme` preset > `luma_site.palette` > default.
Fonts: `luma_site.font` > `luma_page_cfg.font`. `luma_site.sections` decides home blocks;
FAQ/privacy/returns texts feed their pages; contact & socials go to `tenant_profiles`
(socials restricted to their own networks). Base64 images from localStorage are NOT imported —
they must be re-uploaded through the asset pipeline.
