# Company CSV import (local review, not deployed)

## User flow

Sidebar **회사 데이터 → CSV 가져오기** accepts up to 10 CSVs per selection, 1 MB and 2,000 rows per file. Excel users save the relevant worksheet as **CSV UTF-8**. Direct XLSX/PDF import is not implemented.

- Product lists: named-column detection, editable column mapping, required product name, preview, omitted-column and missing-name notices. Unknown layouts never use the legacy positional fallback.
- Factory quotations: recognizes numbered 원료비 / 부자재비 / 가공비 / 분석비 blocks with header rows. Imports explicit package specification, quote date, set quantity, Loss addition, material ratios, usage, unit prices, cost rows and stated overhead amounts into a FormulaSheet. Original totals remain in the memo for comparison.
- The quotation parser targets the supplied block-based layout, not arbitrary Excel layouts. Numeric formulas, multiline numeric cells and malformed CSV are rejected. Functional declarations, packing fees, merged-note semantics and calculation/rounding rules require review. Fixed quantities are explicitly labeled for review before changing production quantity.
- Users preview and acknowledge values/omissions before adding. Files with failed reads can be removed from the selection. Partial batch failures preserve successful files and allow retry.
- Company references appear alongside public references, with a source badge and a company-only search scope. The existing quote creation action imports the stored FormulaSheet for quotation data.
- Exact repeated file content is idempotent. Different contents with the same filename remain separate. Identical products across active files display once. Excluding a file from search is reversible.

## Storage and boundaries

`oem_company_files` lives in the existing deployment's `APP_TENANT` schema via `withTenant`, never the shared MFDS product generation. The schema is provisioned lazily as with existing company tables. RLS is enabled; PUBLIC/anon/authenticated grants are revoked. Existing proxy authentication protects `/api/company-data`. Writes require same-origin JSON, bounded request bodies, validated columns and server-side CSV parsing. File IDs are UUIDs and reads/updates remain inside the selected company schema.

Capacity: 100 retained files / 50,000 source records. Each normalized file is limited to 2.5 MB. Files load in small concurrent groups instead of one potentially oversized Vercel response. File import is a single transaction; duplicate checks and capacity limits are serialized per company.

Company references are excluded from public ingredient-trace requests and official-product enrichment. Their names, recipes and prices are not sent to those services. Public MFDS sync updates only public reference state; company state remains separately loaded.

When NODE_ENV is development and no DB is configured, local review uses `tmp/company-data-local/files.json`, explicitly labeled in the UI. Production never falls back to this local storage. No production database or deployment was changed for this feature.

## Verification

- 185 unit/API/regression tests passed; includes malformed CSV, header mapping, quote calculations, source isolation, request limits and cross-site rejection.
- Four integration tests passed using disposable PGlite PostgreSQL: persistence, tenant separation, MFDS retention, duplicate import, changed recipe version, reversible exclusion, RLS and client-role denial.
- TypeScript, changed-file ESLint and Next production build passed.
- Browser: two-file upload (product list + synthetic quotation), preview, save, new-session persistence, company-only search, quote creation with source ratios/prices/costs, exclusion and restoration.
- Browser review data contains only clearly labeled synthetic examples, not the user's confidential factory prices. Source PDFs were read locally to understand their layout.

Before deployment, obtain the user's approval of the local review. Build a release from production commit `a6306792e9fcb334e3464a6ba685df12aa13e32c`; the root working tree also contains unrelated intro work and prior uncommitted release changes.
