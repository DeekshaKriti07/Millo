# Millo

Millo is an Indian grocery storefront with ten aisles, product detail pages, a transparent quality score and demo checkout. **Play intro** replays the opening grocery cartoon. Use the screen’s Back button or the browser’s Back button to retrace aisles, searches, product details and checkout.

## Run locally

Requires Node.js 22.13 or later. No dependencies or API keys are needed.

```bash
npm start
```

Open <http://localhost:3000>. To use another port, run `npm start -- --port 3005`. Choose **Use sample details** at checkout. The local server records demo receipts in SQLite. The hosted version uses D1. The cart, saved items, delivery PIN and visible order history are browser-specific.

`npm test` validates the catalogue, scoring, checkout and video. `npm run build` creates a deployment Worker.

## Catalogue and evidence

`public/catalog-data.js` is the reviewed catalogue. It is also available at `GET /api/catalog` and is the source for server-side prices. Product pages show nutrition with units, the full available label information, the photo source and the date the source record was checked.

- Packaged products were shortlisted from the supplied India CSV and matched by barcode to [Open Food Facts](https://world.openfoodfacts.org/data). CSV values are used only when the as-sold per-100 basis matches. Product data from Open Food Facts is available under the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The pack-label record is linked for traceability.
- Fresh produce uses generic reference values from [USDA SR Legacy](https://fdc.nal.usda.gov/download-datasets/) per 100 g of edible portion. Product images are sourced separately from manufacturers and retailers. Product pages link the listing used for each image.
- Unavailable ingredients, nutrients, label photos, MRP, FSSAI numbers and operational data stay null. Live stock, payments, dispatch and PIN serviceability require merchant integrations. Every product displays a demo price set by Millo. Only score-qualified products can be ordered through demo checkout.
- Millo’s opening cartoon is original to this project. The hero uses [Colorful Assortment of Fresh Vegetables](https://www.pexels.com/photo/colorful-assortment-of-fresh-vegetables-40491212/) under the [Pexels license](https://www.pexels.com/license/). Catalogue photos and pack artwork are attributed to the linked product listings.

## Healthy Product Score

| Criterion | Points |
| --- | ---: |
| Protein | 18 |
| Fibre | 15 |
| Added sugar | 20 |
| Saturated fat | 12 |
| Sodium | 12 |
| Ingredient quality | 13 |
| Degree of processing | 10 |

The thresholds appear in `public/scoring.js` and **How we score groceries**. Protein and fibre earn points linearly up to their category target. Added sugar, saturated fat and sodium lose points linearly from zero to their category cap. The app rounds each criterion individually. Dry teas have separate benchmarks. Total sugar never substitutes for added sugar.

Ingredient quality assigns 13 points to a recognised whole-food first ingredient or fresh whole produce, 10 if a recognised first ingredient is followed by a listed refined ingredient, 8 for other first ingredients and 3 for a listed refined first ingredient. NOVA groups 1 through 4 earn 10, 8, 5 and 1 point respectively. Missing inputs leave the score pending. A complete score of 65/100 qualifies for demo checkout. This is a Millo editorial method and has no independent health validation.

Recompute the catalogue with `node scripts/compile-catalog.mjs reviewed-snapshot.json`. The compiler checks available thumbnail files and applies score qualification to demo pricing. A missing or unverified photo remains pending.
