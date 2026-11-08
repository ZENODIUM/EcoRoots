<p align="center">
  <img src="app_icon.png" alt="EthnoHarvest logo" width="180">
</p>

<h1 align="center">EthnoHarvest</h1>

<p align="center">Evidence before extraction.<br>A working companion for people who harvest wild medicinal plants.</p>

<p align="center">It checks the name, shows what a published study can and cannot say about the population, refuses to invent a local quota, tells a small team what to measure next, and follows one batch from the hillside to the buyer.</p>

## The problem

Most of the world still uses herbal and traditional medicine. The World Health Organization reports that people in 88 percent of member states do. A large share of the plants in that trade are taken from the wild. TRAFFIC and IUCN, in Wild at Home (2018), describe about 3,000 medicinal and aromatic plants in international trade, with 60 to 90 percent harvested from the wild, and only 7 percent assessed for the IUCN Red List. The same sources say the value of that international trade tripled between 1999 and 2015, to more than 3 billion US dollars. Kew, in the State of the World's Plants and Fungi (2023), reports that 45 percent of flowering plants are threatened with extinction.

Three well known plants show what that looks like on the ground.

Jatamansi (*Nardostachys jatamansi*) is a Himalayan herb whose rhizome is the product. Digging it up kills the plant. TRAFFIC reports 100 to 500 tonnes of rhizomes traded in a year, collected by some of the more than 300,000 Nepali households who trade medicinal and aromatic plants.

African cherry (*Prunus africana*) is taken for its bark. CITES has listed it on Appendix II since 1995. CITES Plants Committee document PC25 Doc. 27 records a peak export of 3,225 tonnes of dried bark in 1997, and later trade suspensions by country. Wild harvest of the bark has been judged no longer sustainable.

Frankincense (*Boswellia papyrifera*) is taken by tapping the trunk for resin. Bongers and colleagues (2019, Nature Sustainability) followed 21,786 trees in 23 populations. In 18 of those 23, almost no young trees were growing. They projected that production could fall by half within 20 years.

A harvesting cooperative, before the season, has four plain questions. Is this the right plant? Will taking more shrink this population? What should we measure first, with only a few people and a few days? Can we show a buyer where this batch came from, and that the papers match the plants?

Today those questions are split across a botanist, a population ecologist, a map analyst, and a stack of paper forms. A calculator that is confident on thin data is worse than a tool that says "not yet" and shows the missing piece. That is the gap EthnoHarvest is built to fill.

The cooperative in Jumla, in western Nepal, is an illustration of that user. It is not a customer we already work with. Say "imagine" when you tell that story.

## What the product is

EthnoHarvest is one local application with a globe, a population studio, a field plan, a methods page, a literature agent, and a batch record called a Harvest Passport.

It will not print a safe harvest rate, a quota, a permit, or a medical claim. A local rate can be estimated only when six measurements from that place all exist, and even then a person has to approve it. Until then the screen says the study can describe a published scenario, and it cannot describe this hillside.

Unknown is never drawn as zero. If a satellite feed, a soil service, or a token is missing, the layer says pending or unavailable.

<p align="center">
  <img src="pitch_screenshots/s01_hero_globe_only.png" alt="The EthnoHarvest globe" width="860">
</p>

<p align="center">The globe is the front door. Pick a plant, or draw a region, and every layer has to say where it came from.</p>

## Who uses it

The people who run a harvest use the app. The people who need to trust that harvest later use the packet.

### Practical end users

These are the people who actually run a harvest. A cooperative or community manager decides whether the season should go ahead. Harvesters and local record keepers work with that manager. Together they are the people in the app.

They check the name, and they see when the catalogues disagree. They see whether this population can bear a harvest. A published study can describe what happened under a treatment somewhere else. The rate for this hillside stays unknown until the local facts are filled. They pass the local gate. A local rate can be discussed only when six measurements from this place all exist, and even then a person has to approve it. They plan the take, choosing what to measure with the people and the days the team has. They keep the Harvest Passport for the batch, and the evidence packet that stays with it from preparation to transfer.

Fewer harvests go ahead while a required measurement is still missing. If any of the six is missing, the screen says "not yet". That gap stays a gap. It is not stored as zero, and the app does not print a percentage to cover it. The passport and the packet are the record a buyer or a reviewer can inspect later.

### Secondary end users

Buyers and exporters need a provenance trail: where the batch was taken, which part was taken, and which papers belong to it. Permit and customs reviewers need the papers and the plants to agree, including the plant part and the weights. Scientists and extension workers check the numbers, the evidence tier, and whether a model was allowed to become advice. Community authorities confirm site rights and local knowledge, including collection rights and the community's consent.

They use the packet. They do not operate the harvest.

A buyer or a reviewer can open one batch and see the name check, the gate, the plan, the weights, and the human decision. They can see a rate left unknown because the local facts were never filled. The screen they read still says "not yet". A missing count is not drawn as zero. They can see a failed check, and a document that names a different plant part from the weigh slip. Scientists can see the tier, and that a model only result never became harvest advice. Community authorities can see that collection rights and consent were required, and that a blank answer stayed blank. The packet is the record they inspect. It is not a permit, a licence, or a certificate.

## How a harvest moves through the app

```mermaid
flowchart LR
  nameCheck[Check the name]
  demography[Model the population]
  tier[Say how strong the evidence is]
  gate[Ask if a local rate can be estimated]
  plan[Choose what to measure]
  operate[Follow the batch]
  nameCheck --> demography --> tier --> gate --> plan --> operate
```

Each box can stop the next one. A wrong name stops a confident model. A model from another valley does not become a quota. A quota is refused until the local measurements exist. The passport will not move forward while the weights do not add up, or while the papers name a different plant part.

```mermaid
flowchart TD
  question[Can we estimate a safe local harvest rate?]
  question --> counts[Life stage counts on permanent plots, at least two visits]
  question --> yield[Yield of the harvested part at this site]
  question --> recovery[Survival and regrowth after harvest, next to plants left alone]
  question --> voucher[A voucher that this is the species we think it is]
  question --> rights[Collection rights and the community's consent]
  question --> expert[An expert line for what would count as sustainable, and how often to look again]
  counts --> decision[Only if all six exist, and a person approves]
  yield --> decision
  recovery --> decision
  voucher --> decision
  rights --> decision
  expert --> decision
```

Evidence is also labelled in three tiers. Tier A means a published harvest study with matrices we re analysed. Tier B means a model only, and it can never become harvest advice. Tier C means we do not have a population model. Geography and literature can still run. The gap stays visible.

## The app, screen by screen

### Explore

<p align="center">
  <img src="pitch_screenshots/s01_hero_explore_prunus_native_range.png" alt="Native range of Prunus africana" width="860">
</p>

<p align="center">Native range of <em>Prunus africana</em>, drawn from Kew, on the globe.</p>

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/explore-01-landing.png" alt="Explore landing" width="100%">
      <br>Opening view, before a species is chosen.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/explore-02-jatamansi.png" alt="Jatamansi on the globe" width="100%">
      <br>Jatamansi opened on the Nepal case, with the dossier beside the map.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/slide8.png" alt="Jatamansi region with the honest rate answer" width="100%">
      <br>A drawn region in Nepal. The rate answer is study backed scenario only. None of the six local measurements are in.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/explore-05-drawn-region.png" alt="A region drawn by hand" width="100%">
      <br>Any land region can be drawn. The area is reported, and layers fill in only when a source answers.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/explore-03-arnica.png" alt="Arnica on the globe" width="100%">
      <br>Arnica in the Alps. There is a habitat model here, and no harvest matrix, so the tier stays honest.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/explore-04-khaya-precip.png" alt="Khaya with precipitation" width="100%">
      <br>Khaya in West Africa, with precipitation from WorldClim on the region.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/07-fire-khaya.png" alt="Active fire near Khaya" width="100%">
      <br>Active fire detections from NASA satellites, drawn only when the key is set and the service answers.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/journey-prunus.png" alt="Prunus journey" width="100%">
      <br>African cherry, from the map toward the rest of the workflow.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/s04_name_check_card_prunus.png" alt="Name check for Prunus" width="100%">
      <br>The name check. Kew and World Flora Online are both shown. Disagreement is displayed, never smoothed over.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/s02_photo_prunus.png" alt="Licensed photo of Prunus africana" width="100%">
      <br>A licensed photograph of <em>Prunus africana</em>, with the credit kept on the record.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/s02_photo_boswellia.png" alt="Licensed image of Boswellia" width="100%">
      <br>A licensed image of <em>Boswellia papyrifera</em>.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/mobile-explore.png" alt="Explore on a phone" width="60%">
      <br>The same Explore page on a phone.
    </td>
  </tr>
</table>

### Simulate

The studio draws plants from the same numbers as the chart. Size on the plot is life stage. It is an illustration, not a botanical reconstruction, and it is not to scale.

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/s08_2_studio_3d_life_stages.png" alt="Living Ecosystem Studio" width="100%">
      <br>Jatamansi under a published harvest treatment. Small plants are seedlings, larger ones are adults.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/v2-studio.png" alt="Studio with the chart" width="100%">
      <br>The 3D plot and the count chart come from one simulation response.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/s08_2b_stage_size_key.png" alt="Stage size key" width="100%">
      <br>The key that ties model height to life stage.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/s06_science_life_cycle.png" alt="Life cycle board" width="100%">
      <br>The science view. Stages and arrows come from the published matrices.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/simulate-01-flagship.png" alt="Flagship Jatamansi simulation" width="100%">
      <br>The flagship Jatamansi comparison, the audited harvest study.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/simulate-02-rotation.png" alt="Rotation view" width="100%">
      <br>A rotation view. It is labelled as an extrapolation, not as a new field result.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/simulate-03-hypothetical.png" alt="Hypothetical removal" width="100%">
      <br>A hypothetical removal. Tier B. It carries a warning and cannot become advice.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/simulate-04-khaya.png" alt="Khaya simulation" width="100%">
      <br>Khaya, bark and foliage, from the observational studies in Benin.
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" colspan="2">
      <img src="docs/screenshots/mobile-simulate.png" alt="Simulate on a phone" width="280">
      <br>Simulate on a small screen, including the plain two dimensional fallback.
    </td>
  </tr>
</table>

### Plan

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/s08_3_plan_evidence_to_collect.png" alt="Evidence to collect" width="100%">
      <br>What to measure first, and why it matters for this species.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/plan-02-evidence.png" alt="Evidence plan" width="100%">
      <br>The evidence plan. Buying half the measurements unlocks nothing, so the planner treats the set as all or nothing.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/plan-01-survey.png" alt="Survey design" width="100%">
      <br>Where to put the next plots, compared with simpler shortcuts.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/mobile-plan-methods.png" alt="Methods on a phone" width="60%">
      <br>Harvest methods on a phone.
    </td>
  </tr>
</table>

### Harvest methods

The plate is an openly licensed picture. The yellow numbers are drawn by an image model and checked by eye. The words beside them come from our data, not from the model.

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/s08_4_methods_jatamansi_illustration.png" alt="Jatamansi methods plate" width="100%">
      <br>Jatamansi. The rhizome is the part that is taken, and the notes say what the study measured.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/s08_4b_methods_boswellia_resin.png" alt="Frankincense tapping methods" width="100%">
      <br>Frankincense. Tapping the trunk, and what that does to flowering and seed.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/methods-analysis.png" alt="Methods analysis" width="100%">
      <br>The analysis next to a method. Each claim points at a study.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/methods-resin.png" alt="Resin methods page" width="100%">
      <br>The resin page in the methods catalogue.
    </td>
  </tr>
</table>

### Evidence

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/s08_5_evidence_agent_run_graph.png" alt="Evidence agent graph" width="100%">
      <br>One agent run. Every claim has to quote its source in the source's own words.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/evidence-01-run.png" alt="Evidence run detail" width="100%">
      <br>The same run, with the steps written out.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/evidence-02-fault.png" alt="A failed check kept visible" width="100%">
      <br>A check that failed stays on the page. It is not hidden.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/slide7.png" alt="Tests written down before they were run" width="100%">
      <br>The test register. Held, repeated, unclear, and failed results are all listed.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/evidence-03-registry.png" alt="Experiment registry" width="100%">
      <br>Each hypothesis was time stamped before the run. The command that repeats it is stored with the result.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/evidence-builder.png" alt="Workflow builder" width="100%">
      <br>The workflow builder. The agent is assembled from named steps, not from a hidden prompt.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/evidence-builder-run.png" alt="A built workflow running" width="100%">
      <br>A built workflow, running.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/mobile-evidence.png" alt="Evidence on a phone" width="60%">
      <br>Evidence on a phone.
    </td>
  </tr>
</table>

### Harvest Passport

Everything in the demo workspace is synthetic and watermarked. A Harvest Passport is a batch record. It is not a government permit, a quota, or a certificate.

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/s09_harvestops_overview.png" alt="HarvestOps overview" width="100%">
      <br>The demo workspace. Four synthetic batches, from preparation to transfer.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/ops-yellow-overview.png" alt="HarvestOps in the field colours" width="100%">
      <br>The same desk in the field colours, so operations are visually distinct from the science pages.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/s08_6_harvestops_passport_prunus.png" alt="Prunus passport" width="100%">
      <br>A passport for African cherry bark. Cautions, weights, and the human decision are on one record.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/ops-yellow-passport.png" alt="Passport detail" width="100%">
      <br>Passport detail, including the step the batch is on.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="pitch_screenshots/slide8_document.png" alt="Wrong plant part caught in the papers" width="100%">
      <br>A synthetic packet where the authorisation says leaves and the weigh slip says bark. The mismatch is raised before anyone calls the batch ready.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/screenshots/v2-harvestops-documents.png" alt="Document checks" width="100%">
      <br>Extracted fields, each one pointing at a page in the PDF.
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" colspan="2">
      <img src="docs/screenshots/mobile-plan-ops.png" alt="HarvestOps on a phone" width="280">
      <br>HarvestOps on a phone.
    </td>
  </tr>
</table>

## What each part does

**Name and range.** Every catalogue name is checked against Kew's World Checklist of Vascular Plants, which is the data behind Plants of the World Online, and against World Flora Online. On this build, 752 of 812 names agree. Seventeen disagree, and the card shows both. The green area on the globe is native range by botanical country. A species that was not checked is reported as not checked. It is never reported as absent.

**The living map.** For a region you draw, the server asks GBIF for occurrences, WorldClim and NASA POWER for climate, Open Meteo for elevation, SoilGrids for topsoil when it answers, NASA FIRMS for recent fire when a key is set, and CITES Species+ for the trade listing when a token is set. Tree cover loss and ESA WorldCover are pictures only. They are not analysed. Occurrence coordinates of sensitive species are generalised to a tenth of a degree before they leave the server.

**Population studio.** Published matrix models from COMPADRE drive the plant counts, the stage mix, and the chart. You can scrub years, change the starting number of plants, and compare a published harvest treatment with its control. If the browser has no 3D graphics, a flat plot is drawn from the same numbers.

**The gate.** Six local facts are required before a local rate can even be discussed. Life stage counts on permanent plots, from at least two visits. Yield of the harvested part at this site. Survival and regrowth of harvested plants, beside plants that were left alone. A voucher for the species. Documented collection rights and community consent. An expert line for what would count as sustainable, and how often to measure again. If any one is missing, the answer stays "not yet". If all six are declared, the result still needs a person to approve it.

**The field plan.** An integer linear program chooses which measurements to buy with a small budget of person days. A greedy shopping list can buy items that unlock nothing, because a quota needs the whole set. In our test the planner was at least as good as greedy in 24 of 24 budgets, and strictly better in 15.

**Methods.** Seven harvested parts: roots and rhizomes, bark, resin, leaves, flowers, fruit and seed, and the whole herb. For each part the page says which life process the method touches, what to measure in the field, and which paper that rests on. It never states a safe percentage.

**Evidence agent.** Literature is retrieved from Europe PMC and OpenAlex. An optional model can help triage papers. Every claim that is kept must quote the source word for word, and a second model checks the quote. A quote that does not match is dropped, and the drop is visible. On our own test, the model was not better than simple keyword rules at sorting papers (macro F1 0.768 against 0.773). Rules decide. The model advises.

**Harvest Passport.** One batch, from preparation to transfer. Cautions, collection, drying, a stock ledger, quality results, shipments, and the human decision are on the record. Uploaded PDFs are read on the server. Each extracted field points at a page. On 13 synthetic packets that we wrote ourselves, rules alone found 14 of 15 planted problems, with no false alarms. With the grounded model, 15 of 15. Treat that as a test we designed, not as a field result. A collector role cannot overwrite a check. Every export says it is not a permit, a licence, or a certificate.

**Medicinal use.** Shown only as documented use from published databases (USDA Dr. Duke, and Herbolario). It is not a claim that a preparation works. No traditional knowledge is collected or stored.

## What the science actually found

The heart of the science is a re analysis of published matrix population models in COMPADRE, version 6.26.3.0. On this machine that was 9,178 matrices, 812 taxa from 546 studies in 64 countries, of which 200 taxa have a documented medicinal use in the sources we linked. The raw COMPADRE file is not in this repository. The agreement asks us to cite it and not to redistribute it.

### Jatamansi, the study we can stand on

Ghimire and colleagues (2008) harvested rhizomes of *Nardostachys jatamansi* once, in September 1998, at 0, 10, 25, 50, and 75 percent, on rocky outcrops in Shey Phoksundo National Park, Nepal, with local amchi. COMPADRE stores the mean matrices for 1999 to 2002. The paper's column below is the 1999 to 2000 interval. The two series are not the same numbers. They are the same order.

Lambda below 1 means the population is projected to shrink.

<table>
  <tr>
    <th>Harvest</th>
    <th>Our reproduction, COMPADRE means 1999 to 2002</th>
    <th>Paper, 1999 to 2000</th>
  </tr>
  <tr><td>0 percent</td><td>1.028</td><td>1.014</td></tr>
  <tr><td>10 percent</td><td>0.958</td><td>0.928</td></tr>
  <tr><td>25 percent</td><td>0.891</td><td>0.838</td></tr>
  <tr><td>50 percent</td><td>0.831</td><td>0.779</td></tr>
  <tr><td>75 percent</td><td>0.737</td><td>0.637</td></tr>
</table>

The order matches the paper exactly (Spearman rho of negative 1). Each extra 10 percent of harvest lowers lambda by about 0.036 in our reproduction. Even 10 percent puts the outcrop population below 1.

The life cycle breakdown says why. About 38 percent of the effect is plants moving up in size, 31 percent is plants shrinking, 29 percent is staying in the same stage, and about 2 percent is seed. Harvest kills or shrinks the plant. It does not act by taking the seeds. "Leave the seeds" is the wrong advice for this species.

The unharvested meadow in the same paper is a different habitat. It is not the control for the outcrop harvest. We keep it out of that comparison.

### Tests that did not hold, and the rule each one changed

The hypotheses were written down before the runs, with a fixed seed. The Evidence page lists them in the open, including the ones that failed. These are the ones that changed the product.

**Across eight harvest studies, does harvest lower lambda?** Six of the eight point that way, and the probability that this is a real general effect is 0.29. We do not print a sentence like "harvest lowers growth by X percent" and carry it from one species to another.

**Can a generic removal model predict the real experiment?** No. The error was 0.068 in lambda. That is large enough to confuse a growing population with a shrinking one. Model only results stay in tier B, with a warning, and they cannot become harvest advice.

**Does the language model sort papers better than keyword rules?** No. Macro F1 was 0.768 for the model and 0.773 for the rules, on labels from a rubric rather than from an expert panel. The model stays an advisor.

**Does bark harvest of Khaya show a clear penalty in a stochastic model?** Not in this test. The result is shown as inconclusive. It is not used as a finding.

**Do weak matrices change the answer?** Yes. About 15 percent fail the quality checks, and for 9 species lambda moves by more than 0.05. Those matrices are left out of the presets.

A separate habitat test, for the species where we fit one, uses spatial blocks rather than random splits. Random cross validation would have flattered the score by as much as 0.19. We keep the spatial score. A suitability map is climatic similarity to known records. It is not abundance, and it is not a map of where harvest is safe.

## What it takes to become a product people rely on

The prototype already does the honest scientific job on a laptop. A cooperative cannot yet depend on it for a season. These are the gaps, in the order a real deployment needs them.

**A person, not a role in a menu.** The header role is a demo. A collector is blocked from overwriting a check only inside this demo. A real product needs accounts, so the person who weighed the sack is not the same login as the person who approves the batch.

**A record that survives the machine.** Passports, uploads, and the audit trail sit in a local database. A product needs that store on a server the cooperative controls, with backups, and with a clear answer to who can read a private place name. Sensitive species coordinates are already generalised. Private locality notes must stay private.

**A community that has agreed.** The next serious step is a pilot with one Jatamansi cooperative, designed with them, on their calendar, with their consent. We do not have that agreement yet. The pilot is a plan, not a partnership. Their knowledge stays with them. The app continues to use only published use records.

**Pictures a specialist has checked.** The photographs were accepted because the licence and the scientific name matched. A botanist has not confirmed every frame. The 3D models are illustrations. Before a field team trusts a plate, a pharmacognosist should review the markers and the part names.

**Papers from the real world.** The document test was written by us, on purpose, including a layout the rules had never seen. That held out packet was flagged as fields not found. It was not waved through. The next test is a cooperative's own authorisations, weigh slips, and lab sheets, with their permission, and with the result reported even if the rules miss.

**Country rules, reviewed by someone who can be accountable.** Cautions already mention CITES and a small set of published export notes, and they are marked when a human still has to confirm them. A product needs a named reviewer for each country, and a versioned rule set so a new country can be added without pretending the science changed. The screen must keep saying that a passport is not a permit.

**The missing data, still shown as missing.** IUCN Red List and the TRY trait database need access we do not have. Protected areas need a token we do not have. SoilGrids is often down. Those layers stay pending. Filling them with a guess would break the product.

**Hosting that can actually compute.** The website is a React app. The science is a Python server with matrix algebra, climate rasters, and a database. A static host can show the pages and cannot run the models. One machine with a few gigabytes of memory and a disk that keeps the downloaded files is enough for a pilot. The setup notes in [PLEASE_READ.md](PLEASE_READ.md) say which files and which keys that machine needs.

### How it grows after that

Any of the 200 medicinal taxa already linked to COMPADRE can be opened today. A plant with no matrix enters as tier C. The map, the name check, and the literature still work, and no fake matrix is inserted. Name and range checks are built from Kew's world checklist, on the order of 1.4 million names and about 366,000 accepted vascular plant species, mapped to 369 botanical countries.

The same passport, the same gate, and the same planner work for a root, a bark, and a resin. Jatamansi, African cherry, and frankincense are the three proofs. Adding a species is adding data and a citation, not adding a new app.

When more than one cooperative uses it, the split is ordinary. One shared science server, read only for the published models. One private workspace per cooperative, for passports and documents. The science does not get more confident because more batches were sold. It gets more confident only when someone goes back to the plots and counts.

## Run it on your machine

Python 3.12, Node 20, and the instructions in [PLEASE_READ.md](PLEASE_READ.md). That file is the list of keys and data files that are not in git, where to get each one, and which source file reads it.

The short version:

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
copy .env.example .env.local
.venv/Scripts/python scripts/acquire.py
.venv/Scripts/python -m backend.ethnoharvest.compadre
.venv/Scripts/python -m backend.ethnoharvest.taxonomy
.venv/Scripts/python scripts/checklists.py
.venv/Scripts/uvicorn backend.ethnoharvest.api:app --port 8000
```

Then `cd frontend && npm install && npm run dev` and open http://localhost:5173.

On macOS or Linux, use `.venv/bin/pip` and `.venv/bin/python`, and `cp .env.example .env.local`.

## Credits and licences

The application code in this repository does not yet carry an open source licence. Do not reuse it as if it did, until the authors add one.

Published data, pictures, models, and libraries do have licences. Use them under those terms. Cite the paper, not only this repository.

### Population models and medicinal use records

These files are downloaded onto the machine that runs the server. They are not in git.

*   COMPADRE Plant Matrix Database, version 6.26.3.0. Cite Salguero Gómez and colleagues (2015), Journal of Ecology 103:202 to 218. https://doi.org/10.1111/1365-2745.12334. The data user agreement asks for that citation and forbids redistributing the raw file. https://compadre-db.org/
*   PhenObs flowering data. CC BY 4.0. https://doi.org/10.5281/zenodo.15411418
*   Environmental demography archive, version 4. CC BY 4.0. https://doi.org/10.5281/zenodo.18922678
*   USDA Dr. Duke's Phytochemical and Ethnobotanical Databases. CC0 and United States public domain. https://doi.org/10.15482/USDA.ADC/1239279
*   Herbolario version 1, medicinal plants used by ethnolinguistic groups in the Philippines. Tanalgo and Plang (2024). CC BY 4.0 on the GBIF records. https://doi.org/10.15468/hj76g7 and https://doi.org/10.5281/zenodo.10957763
*   WorldClim 2.1, 10 arc minute bioclimatic variables, 1970 to 2000. Free for research if you cite Fick and Hijmans (2017), International Journal of Climatology 37:4302 to 4315. https://doi.org/10.1002/joc.5086

### Names, ranges, and live maps

*   World Checklist of Vascular Plants, Royal Botanic Gardens, Kew, the data behind Plants of the World Online. CC BY 3.0. Govaerts, Nic Lughadha, Black, Turner, and Paton (2021), Scientific Data 8:215. https://doi.org/10.1038/s41597-021-00997-6
*   World Flora Online Plant List. http://www.worldfloraonline.org/
*   TDWG World Geographical Scheme for Recording Plant Distributions, level 3. Brummitt (2001), edition 2. Boundaries simplified from https://github.com/tdwg/wgsrpd. That upstream repository has no licence file. The simplified copy used by the globe is `frontend/public/geo/wgsrpd_l3.json`.
*   GBIF occurrence API and backbone taxonomy. Licence is per record. https://www.gbif.org/
*   NASA POWER climatology. https://power.larc.nasa.gov/
*   Copernicus DEM GLO 90, through the Open Meteo elevation API. https://open-meteo.com/en/docs/elevation-api
*   ISRIC SoilGrids 2.0. Poggio and colleagues (2021), SOIL 7:217 to 240. https://doi.org/10.5194/soil-7-217-2021
*   CITES Species+, UNEP WCMC. https://speciesplus.net/
*   NASA FIRMS active fire, VIIRS 375 metre, near real time. https://doi.org/10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002
*   Europe PMC and OpenAlex, for literature search.
*   CesiumJS and Cesium ion, for the globe terrain. Bing aerial imagery is used under the ion token and is not stored here. Without a token the globe uses the Natural Earth basemap shipped with Cesium.
*   ESA WorldCover 2021, display only. Contains modified Copernicus Sentinel data (2021). Zanaga and colleagues (2022). https://doi.org/10.5281/zenodo.7254221
*   Hansen, University of Maryland, Google, USGS, and NASA tree cover loss, through Global Forest Watch tiles, display only. Hansen and colleagues (2013), Science 342:850 to 853. https://doi.org/10.1126/science.1244693

### The harvest studies inside the models

*   Ghimire, Gimenez, Pradel, McKey, and Aumeeruddy Thomas (2008), Journal of Applied Ecology 45:41 to 51. Jatamansi. https://doi.org/10.1111/j.1365-2664.2007.01375.x
*   Gaoue and Ticktin (2010), Conservation Biology 24:605 to 614. Khaya. https://doi.org/10.1111/j.1523-1739.2009.01345.x
*   Gaoue, Horvitz, Ticktin, Steiner, and Tuljapurkar (2013), Journal of Ecology 101:1065 to 1073. Khaya. https://doi.org/10.1111/1365-2745.12140
*   Stewart (2001), PhD thesis, commercial bark harvest of *Prunus africana* on Mount Oku, Cameroon. Matrices as archived in COMPADRE. No DOI.
*   Hurlburt (1999), thesis, University of Kansas, *Echinacea angustifolia*. Matrices as archived in COMPADRE. No DOI.
*   Ticktin, Ganesan, Paramesha, and Setty (2012), Journal of Applied Ecology 49:774 to 784. *Phyllanthus emblica*. https://doi.org/10.1111/j.1365-2664.2012.02156.x
*   Groenendijk, Eshete, Sterck, Zuidema, and Bongers (2012), Journal of Applied Ecology 49:164 to 173. *Boswellia papyrifera*. https://doi.org/10.1111/j.1365-2664.2011.02078.x
*   Pulido, Valverde, and Caballero (2007), Journal of Tropical Ecology 23:139 to 149. *Sabal yapa*. https://doi.org/10.1017/S0266467406003877
*   Van der Voort and McGraw (2006), Biological Conservation 130:505 to 516. *Panax quinquefolius*. https://doi.org/10.1016/j.biocon.2006.01.010
*   Winter, Jung, Eckstein, Otte, Donath, and Kriechbaum (2014), Journal of Applied Ecology 51:524 to 533. *Colchicum autumnale*. https://doi.org/10.1111/1365-2664.12217
*   Guedje, Zuidema, During, Foahom, and Lejoly (2007), Forest Ecology and Management 240:1 to 12. *Garcinia lucida*. https://doi.org/10.1016/j.foreco.2006.09.029

The methods pages also rest on Ticktin (2004), Journal of Applied Ecology 41:11 to 21; Rijkers and colleagues (2006), Journal of Applied Ecology 43:1188 to 1195; Martínez Ballesté and Martorell (2015), PLoS ONE 10:e0120666; CITES Plants Committee PC25 Doc. 27 on *Prunus africana*; and the FairWild Standard, version 3.0 (2023).

The wider problem figures come from the WHO Global Report on Traditional and Complementary Medicine (2019), Kew's State of the World's Plants and Fungi (2023), TRAFFIC and IUCN Wild at Home (2018), CITES PC25 Doc. 27, and Bongers and colleagues (2019) in Nature Sustainability. Market size estimates for herbal medicine vary widely by definition. We do not treat any single market number as a fact.

### Photographs and plates

Species photos are fetched when the app runs, from iNaturalist, GBIF, and Wikimedia Commons, and only when the licence is CC0, public domain, CC BY, or CC BY SA. The thumbnail is cached on our machine. The caption names the photographer, the licence, and the original page. These frames were not confirmed by a botanist.

Plates that were marked up by hand for the methods page, with the original creator and licence:

*   *Arnica montana*. Free Public Domain Illustrations by rawpixel. CC BY 2.0. https://www.flickr.com/photos/153584064@N07/27104977957
*   *Primula veris*. mikkeldybdal.md. Public domain. https://www.flickr.com/photos/203835554@N06/55388822505
*   *Nardostachys jatamansi*. Wang.QG. CC BY 4.0. https://www.gbif.org/occurrence/6470157396
*   *Panax quinquefolius*. uwdigitalcollections. CC BY 2.0. https://www.flickr.com/photos/23327394@N05/3543549600
*   *Echinacea angustifolia*. Matt Lavin. CC BY SA 2.0. https://www.flickr.com/photos/35478170@N08/36092550620
*   *Prunus africana*. robert njau. CC BY SA, version not stated by the source. https://www.gbif.org/occurrence/5110068445
*   *Khaya senegalensis*. Starr Environmental. CC BY 2.0. https://www.flickr.com/photos/97499887@N06/24557202344
*   *Boswellia papyrifera*. Naturalis Biodiversity Center. CC0. https://www.gbif.org/occurrence/2516200287
*   *Phyllanthus emblica*. lalithamba. CC BY 2.0. https://www.flickr.com/photos/45835639@N04/4327531563
*   *Colchicum autumnale*. Creator not named on the source page. CC0. https://www.rawpixel.com/image/13954448/image-flower-plant-art
*   *Sabal yapa*. wallygrom. CC BY SA 2.0. https://www.flickr.com/photos/33037982@N04/5434926514

Photos checked when the image cache was built:

*   *Nardostachys jatamansi*. GBIF occurrence 6469742361. CC0. tuirnee.
*   *Khaya senegalensis*. iNaturalist photo 1449333. CC BY 4.0. jayeshpatil912.
*   *Boswellia papyrifera*. iNaturalist photo 120237692. CC BY SA 4.0. Sjschen.
*   *Sabal yapa*. GBIF occurrence 6162944164. CC BY 4.0. Juan Cruzado Cortés.
*   *Echinacea angustifolia*. GBIF occurrence 6195446429. CC BY 4.0. Jeff Hansen.
*   *Prunus africana*. GBIF occurrence 5110351703. CC BY SA 4.0. ping sun.
*   *Arnica montana*. iNaturalist photo 183899357. CC BY, version not stated by the source. Jean Jacques Godon.

CC BY SA images are shown resized. A changed version would have to stay under the same licence.

### 3D models

The files the browser loads are in `frontend/public/plants/`. They are visual stand ins. Poly Pizza models were checked on each model page on 7 November 2026.

CC BY 3.0, https://creativecommons.org/licenses/by/3.0/

*   Aloe plant, Poly by Google. https://poly.pizza/m/6hYjnEpV-CC
*   Palm tree, Poly by Google. https://poly.pizza/m/2RUnO1Yi99P
*   Vines, Poly by Google. https://poly.pizza/m/cnimalnLIEA
*   Fern, Geoffrey Bell. https://poly.pizza/m/fQ9cPdkwvAY

CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/

*   Big Leaf Plant, reyshapes. https://poly.pizza/m/aKIm5k6l5F
*   Bush with Flowers, Quaternius. https://poly.pizza/m/U1ymDy8tbY
*   Dead Tree, Quaternius. https://poly.pizza/m/Mcd2zYqyww
*   Flower Single, Quaternius. https://poly.pizza/m/GvfHo0roi3
*   Flower Single, second file, Quaternius. https://poly.pizza/m/rHBoS64rRL
*   Flowers, CreativeTrio. https://poly.pizza/m/RP8p3h7JHJ
*   Plant, Quaternius. https://poly.pizza/m/VwXvoIpCHP
*   Small Plant, Quaternius. https://poly.pizza/m/MZdeiQApSb
*   Flower Group, Quaternius. https://poly.pizza/m/hfPzQAedOe

Flower Group was converted from the author's FBX zip with FBX2glTF 0.9.7. https://github.com/facebookincubator/FBX2glTF

The species models for American ginseng, *Colchicum*, *Echinacea*, frankincense, Indian gooseberry, jatamansi, *Khaya*, mountain arnica, *Primula*, *Prunus*, and *Sabal*, and the generic growth form models, are illustrations generated for this project. They are not botanical reconstructions.

### Fonts and software

IBM Plex Sans and IBM Plex Mono are copyright IBM. Newsreader is copyright Production Type. All three are used under the SIL Open Font License 1.1, through Fontsource.

The Python side uses FastAPI, Uvicorn, HTTPX, Pydantic, NumPy, SciPy, pandas, PyArrow, statsmodels, scikit learn, PuLP with the COIN OR CBC solver, Shapely, Rasterio, LangGraph, ReportLab, pdfplumber, Pillow, and pygltflib, among the packages pinned in `requirements.txt`. The browser side uses React, Vite, TypeScript, CesiumJS, three.js, React Three Fiber, and Zustand, pinned in `frontend/package.json`. Each package keeps its own licence.

Optional services, called only when a key is present, are TypeSafe System One, Groq, and Google Gemini. They are not included in this repository. Keys stay in `.env.local`.
