# Please read this before expecting the app to work

The GitHub repository is the application source. A clone will install and the pages will open, but several features stay empty or say "pending" until the files and keys below exist on that machine. They were built and used locally. They are not in git on purpose: some are secrets, some are large downloads, and the COMPADRE raw file is not allowed to be redistributed.

Nothing below is a harvest quota, permit, or medical claim.

## What a clone already has

- Backend, frontend, scripts, and tests.
- The 3D models the browser loads, in `frontend/public/plants/`.
- The simplified botanical-country map, `frontend/public/geo/wgsrpd_l3.json`.
- `.env.example`, which lists every setting and has no secret values.
- Small synthetic PDFs used by the tests, under `tests/fixtures/harvestops/pdfs/`.

## What you have to create locally

Copy the example file and fill in only the keys you want. The file `.env.local` is gitignored. The server reads it. The browser receives only `VITE_CESIUM_ION_TOKEN`.

```bash
cp .env.example .env.local
```

On Windows: `copy .env.example .env.local`

Then, from the project root, with Python 3.12 and Node 20:

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python scripts/acquire.py
.venv/Scripts/python -m backend.ethnoharvest.compadre
.venv/Scripts/python -m backend.ethnoharvest.taxonomy
.venv/Scripts/python scripts/checklists.py
.venv/Scripts/python -m backend.ethnoharvest.experiments
.venv/Scripts/python scripts/seed_demo_ops.py --reset
.venv/Scripts/uvicorn backend.ethnoharvest.api:app --port 8000
```

In another terminal: `cd frontend && npm install && npm run dev`, then open http://localhost:5173.

`scripts/acquire.py` downloads COMPADRE, PhenObs, the environmental-demography archive, and WorldClim. Duke and Herbolario are not given a public URL in that script. On the machine where this project was built, the script can copy them from `V:/projects/eco roots/data/raw` if that folder is present. On any other machine, download them yourself and place the files in the paths in the table below.

## Keys

Leave a key blank and that feature stays pending. The app does not invent a value.

| Name in `.env.local` | Required? | What it unlocks | Where to get it | Where the code reads it |
|---|---|---|---|---|
| `VITE_CESIUM_ION_TOKEN` | Optional. Without it the globe uses the offline Natural Earth basemap | 3D terrain and aerial imagery | https://ion.cesium.com/tokens (a free Cesium ion account). This token is public by design | `frontend/src/components/Globe.tsx` via Vite. `frontend/vite.config.ts` loads env from the project root |
| `CESIUM_API_KEY` | Optional | Same token, used only so the health check can say whether a token is set | Same Cesium ion token | `backend/ethnoharvest/providers.py` (`cesium` flag) |
| `GROQ_API_KEY` | Optional | Plain-language summaries and document-field guesses. Without it, a fixed template is used | https://console.groq.com/keys | `backend/ethnoharvest/providers.py` (`groq_json`) |
| `GROQ_MODEL` | Has a default | Model name. Default `openai/gpt-oss-20b` | Groq's model list | `providers.py` |
| `GEMINI_API_KEY` | Optional | Fallback when Groq fails, and the image model that draws harvest markers on plates | https://aistudio.google.com/apikey | `providers.py` (`gemini_json`, image call). The key is sent as a header, not in the URL |
| `GEMINI_MODEL` | Has a default | Text model. Default `gemini-2.5-flash-lite` | Google AI Studio | `providers.py` |
| `GEMINI_IMAGE_MODEL` | Has a default | Marker drawing. Default `gemini-3.1-flash-image` | Google AI Studio | `providers.py`, called from `backend/ethnoharvest/illustrations.py` and `scripts/annotate_illustrations.py` |
| `JEV_API_KEY` | Optional | TypeSafe System One routing. Without it, rules decide | https://www.typesafe.ai/ (API base used here: `https://api.typesafe.ai/v1/systemone`, model `jev-latest`) | `providers.py` (`jev`). Threshold 0.85 is in that file |
| `SPECIESPLUS_TOKEN` | Optional | CITES listing for a species. Without it the layer says the token is missing | Request a token at https://api.speciesplus.net/ | `backend/ethnoharvest/spatial.py` (Species+ request) |
| `NASA_FIRMS_MAP_KEY` | Optional | Active-fire points for the last 5 days. Without it the fire layer is pending | https://firms.modaps.eosdis.nasa.gov/api/map_key/ (a free NASA Earthdata login) | `spatial.py`. The key stays on the server and is not written into error text |
| `MEDIA_CONTACT_URL` | Optional | A page or mailto URL that Wikimedia can use as contact. Without it, Commons photos are skipped | Any URL you control. This is not a secret API key | `backend/ethnoharvest/media.py` (User-Agent) |
| `GOOGLE_CSE_KEY` and `GOOGLE_CSE_ID` | Optional, and not required for the demo | Extra image search after iNaturalist, GBIF, and Commons | https://programmablesearchengine.google.com/ and a Custom Search API key in Google Cloud | `media.py`. If either is missing the provider is reported pending |
| `GBIF_USERNAME` and `GBIF_PASSWORD` | Not used by the running app | Only for a GBIF bulk download, which this app does not do. Occurrence search is anonymous | https://www.gbif.org/user/profile | Listed in `.env.example` only |
| `TAVILY_API_KEY` | Not wired | Nothing yet | https://tavily.com | `providers.py` only reports whether the name is set |
| `OPS_LLM_EXTRACTION` | Default `1` | `0` stops sending extracted PDF text to Groq. Rules still read the PDF | Set it yourself | `backend/ethnoharvest/ops/documents.py`, `evidence_agent.py` |
| `OPS_WORKFLOW` | Default `1` | `0` turns off background HarvestOps research | Set it yourself | `backend/ethnoharvest/ops/workflow.py` |
| `OPS_LITERATURE` | Default `1` | `0` turns off the OpenAlex search inside cautions | Set it yourself | `ops/workflow.py`, `ops/cautions.py`, `evidence_agent.py` |
| `OPS_MASS_TOLERANCE_G` and `OPS_MASS_TOLERANCE_PCT` | Defaults 50 g and 2% | When a drying gap is flagged. An operational tolerance, not a legal standard | Set it yourself | `backend/ethnoharvest/ops/ledger.py` |
| `PLANT_GLB_DIRECTORY` | Optional | Folder of original `.glb` files for `scripts/plant_assets.py`. Default `Plants/` | Your own folder. The originals on this machine are gitignored because the web copies are already in `frontend/public/plants/` | `scripts/plant_assets.py` |

These services need no key and are called live. Results are cached under `data/cache/`, which is gitignored:

| Service | Used for | Code |
|---|---|---|
| GBIF occurrence API and GBIF backbone | Occurrences and name resolution | `spatial.py`, `taxonomy.py`, `media.py` |
| NASA POWER | Monthly climate at a region | `spatial.py` |
| Open-Meteo elevation | Copernicus DEM elevation | `spatial.py` |
| ISRIC SoilGrids | Topsoil. Often unavailable; the app then says so | `spatial.py` |
| Europe PMC, then OpenAlex | Literature | `providers.py`, `evidence_agent.py` |
| World Flora Online name match | Second name check | `scripts/checklists.py` |
| Openverse | Harvest-method photos | `backend/ethnoharvest/methods.py` |

## Data files

All of `data/` and `wcvp/` are gitignored. So is `experiments/`. The first time you run the commands above, these folders appear on disk.

| Path on disk | What breaks if it is missing | How to get it | What reads it |
|---|---|---|---|
| `data/raw/compadre/COMPADRE_v.6.26.3.0.RData` | No population models, no Simulate science, no harvest comparisons | `scripts/acquire.py` from https://compadre-db.org/Data/Download/COMPADRE_v.6.26.3.0.RData. Do not commit this file | `backend/ethnoharvest/compadre.py` |
| `data/clean/compadre_metadata.parquet`, `compadre_matrices.npz`, `compadre_lambda.parquet` | Same features, even if the raw file exists | `python -m backend.ethnoharvest.compadre`, then `python -m backend.ethnoharvest.experiments` for the lambda table | `compadre.py`, `catalog.py`, `harvest.py` |
| `data/raw/duke/ETHNOBOT.csv` | "Documented medicinal use" is missing for Duke | USDA Dr. Duke database, https://doi.org/10.15482/USDA.ADC/1239279. Put `ETHNOBOT.csv` in `data/raw/duke/` | `backend/ethnoharvest/taxonomy.py` |
| `data/raw/herbolario/herbolario.csv` | Herbolario medicinal-use records are missing | GBIF dataset https://doi.org/10.15468/hj76g7 or Zenodo https://doi.org/10.5281/zenodo.10957763 | `taxonomy.py` |
| `data/clean/medicinal_crosswalk.parquet` and `.csv` | The catalogue cannot say which COMPADRE species have a documented use | `python -m backend.ethnoharvest.taxonomy` after Duke, Herbolario, and COMPADRE are in place | `eligibility.py`, `scripts/checklists.py` |
| `data/raw/worldclim/wc2.1_10m_bio/` (the `wc2.1_10m_bio_*.tif` files) | Region climate is unavailable | `scripts/acquire.py`, which fetches https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_10m_bio.zip and unzips it | `spatial.py` (`WC_DIR`) |
| `wcvp/wcvp_names.csv` and `wcvp/wcvp_distribution.csv` | Name check and native range cannot be rebuilt | Kew bulk download, https://sftp.kew.org/pub/data-repositories/WCVP/ (`wcvp.zip`, about 440 MB). Extract it so those two CSVs sit in `wcvp/`. CC BY 3.0. Do not commit the bulk file | `scripts/checklists.py` |
| `data/raw/wgsrpd/level3.geojson` | Rebuilding the region map | https://github.com/tdwg/wgsrpd. The simplified map already shipped in `frontend/public/geo/` is enough to draw ranges that are already in `checklists.json` | `scripts/checklists.py` |
| `data/clean/checklists.json` | Explore shows the species as "not checked" instead of a native range or a Kew/WFO comparison | `python scripts/checklists.py` after WCVP is extracted. This also refreshes `frontend/public/geo/wgsrpd_l3.json` | `backend/ethnoharvest/checklists.py` |
| `data/raw/phenobs/` | Flowering windows used by the experiments | `scripts/acquire.py` from Zenodo https://doi.org/10.5281/zenodo.15411418 | `eligibility.py`, `experiments.py` |
| `data/raw/envdemog/` | The environmental-demography replication only | `scripts/acquire.py` from Zenodo https://doi.org/10.5281/zenodo.18922678 | `experiments.py` |
| `data/derived/habitat/*.joblib` | Habitat suitability for the two species that have a model | Produced when the habitat experiment is run (`experiments.py` / `habitat.py`). Missing models are reported as unavailable, not as zero | `habitat.py`, `catalog.py` |
| `data/clean/citations_crossref.json` | Study cards keep the citation written in code instead of the Crossref string | Optional cache. The app still runs | `harvest.py` |
| `data/curated/illustrations/` and `data/curated/media/` | Pre-checked plates and photos. The app can still search live sources | Built on this machine by `scripts/curate_candidates.py`, `scripts/curate_apply.py`, and `scripts/annotate_illustrations.py` | `illustrations.py`, `media.py` |
| `data/cache/` | Nothing permanent. Live answers are fetched again | Created automatically | `spatial.py`, `media.py`, `providers.py`, `methods.py` |
| `data/app.sqlite3` | Saved runs and HarvestOps records. A new empty database is created on first use | `scripts/seed_demo_ops.py --reset` writes the synthetic demo passports | `store.py`, `ops/db.py` |
| `data/ops_documents/` | Uploaded PDFs. The synthetic test packets are already in the repo under `tests/fixtures/` | Created when someone uploads, or by `scripts/generate_demo_documents.py` | `ops/documents.py` |
| `experiments/registry.json` and `experiments/results/` | The Evidence page has no pre-registered results to show | `python -m backend.ethnoharvest.experiments` | `experiments.py` |
| `Plants/` and `Plants New/` | Nothing in the running site. Those are the large source models. The files the browser loads are already in `frontend/public/plants/` | Only needed if you rebuild the web models with `scripts/plant_assets.py` and `scripts/build_plant_models.py` | those two scripts |

`data/raw/manifest.json` is the checksum log written by `scripts/acquire.py`. The provenance endpoint in `backend/ethnoharvest/api.py` reads it and reports an empty list when the file is absent.

## What still will not appear, even after setup

IUCN Red List, WDPA / Protected Planet, and the TRY trait database have no token and no download in this project. Their slots stay pending. SoilGrids often times out and is then reported unavailable. That is the intended behaviour.
