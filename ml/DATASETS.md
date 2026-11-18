# M7b training data: licence check

Checked on 2026-11-15 by ml-engineer (M7b task 1), from the official pages linked below.
**Nothing was downloaded** apart from metadata: the Hugging Face datasets-server `info` JSON for
THFOOD-50 (class names), the Wikimedia Commons category-count API, the Open Images V7
class-description CSV (label names only, no images or annotations) and the THFOOD-100 paper PDF.

This is not legal advice. When a licence is unclear, we treat it as the stricter reading.

## Verdict: **B**

No dataset we found allows both training **and** publishing the trained weights in this public
repo/site **and** has enough correctly labelled images of our dishes.

- The Thai food sets (THFOOD-50, THFOOD-100) are "non-commercial research and educational use
  only". Their images belong to third parties: search engines, Flickr and Wongnai users. Bundling a
  model trained on them in a public site is redistribution. Neither licence grants that.
- The sets that do allow it (Wikimedia Commons per-file free licences, Open Images CC BY 2.0) are
  too small or too noisy for our dishes to reach the target (top-3 ≥ 90%).

So, per M7b-q1:
- the pipeline is built and smoke-tested, and **stops before real training**;
- Wongsaton trains on his own Mac with THFOOD-50 (and THFOOD-100 if he wants), after reading and
  accepting their terms, plus his own photos;
- he imports the `.tflite` in Settings → Import. **The model is never committed and never
  bundled** (`ml/data/`, `ml/runs/`, `ml/models/`, `*.tflite` stay gitignored).

**Possible later path to A ("open set"):** a set built only from Commons (CC0 / CC BY / PD files)
plus Open Images (CC BY 2.0, human-verified labels only), with per-image author + licence kept
for an attribution file. This needs:
- a count of human-verified Open Images labels per dish (the label CSVs are large; this needs
  Wongsaton's OK to download);
- a check that each class reaches roughly ≥ 150 images.

Until then it stays B.

## Datasets

| Set | Official page | Licence (summary) | Train? | Publish weights? | Size | Overlap with our 47 dishes |
|---|---|---|---|---|---|---|
| **THFOOD-50** | [github.com/chakkritte/THFOOD-50](https://github.com/chakkritte/THFOOD-50) (download: Google Drive link in README). Mirror: [huggingface.co/datasets/thean/THFOOD-50](https://huggingface.co/datasets/thean/THFOOD-50) | README: "for **non-commercial research/educational** use". No LICENSE file. Images were collected from Google, Bing and Flickr, so third parties own them. The HF mirror's "afl-3.0" tag was set by the uploader ("I do not own this"), so it doesn't count. | Yes, for his private, non-commercial use (he must read the terms first: `--accept-licence thfood50`) | **No** | 15,770 images, 50 classes, about 3.1 GB (HF parquet). Splits 12,065 / 1,600 / 2,105 | **23 classes → 31 dishes** (see the class map below) |
| **THFOOD-100** | [github.com/NawanolT/THFOOD-100](https://github.com/NawanolT/THFOOD-100). Paper: IEEE Access 12 (2024), DOI 10.1109/ACCESS.2024.3503672 | README: "provided for non-commercial research and educational use only". No LICENSE file. Images come from Wongnai user uploads, so they belong to those users. (The paper itself is CC BY-NC-ND 4.0.) | Yes, for his private, non-commercial use (`--accept-licence thfood100`) | **No** | 53,459 images, 100 classes, 15.7 GB (sample zip 145 MB) | Unknown. The class list isn't published on the README or in the paper text. It probably covers more of our dishes (fried rice, pad see ew, khao soi …). Check after he downloads it. |
| **Food-101** (ETH Zurich) | [data.vision.ee.ethz.ch/cvl/datasets_extra/food-101](https://data.vision.ee.ethz.ch/cvl/datasets_extra/food-101/). The licence text ships in the archive (also on [HF ethz/food101](https://huggingface.co/datasets/ethz/food101)) | Images come from Foodspotting and "are not property of" ETHZ. Use beyond "scientific fair use" must be negotiated with each picture owner. | Research fair use only | **No** | 101,000 images, 101 classes, 5 GB | 1 exact match: `pad_thai`. Generic near-matches (`fried_rice`, `spring_rolls`, `chicken_curry`, `hot_and_sour_soup`) aren't Thai-specific. |
| **UEC-Food256** (UEC Tokyo) | [mm.cs.uec.ac.jp/uecfoodpix](https://mm.cs.uec.ac.jp/uecfoodpix/) links to foodcam.mobi/dataset (that host's TLS certificate is broken, so the official terms couldn't be read) | Sister sets on the same lab page: "can be used only for non-commercial research purpose". Third-party indexes list UEC-Food256 as "Research Only". | Research only (stricter reading) | **No** | 256 classes, about 31k images | Mostly Japanese and other Asian dishes. A few generic ones (fried rice, green curry, pad thai in some lists) are unconfirmed, since the official class list couldn't be read. |
| **Kaggle: FoodyDudy** | [kaggle.com/datasets/somboonthamgemmy/foodydudy](https://www.kaggle.com/datasets/somboonthamgemmy/foodydudy), [github.com/GemmyTheGeek/FoodyDudy](https://github.com/GemmyTheGeek/FoodyDudy) | Kaggle tag CC BY-SA 4.0. The image source isn't stated (the author mentions "three sources" without naming them). A tag the uploader sets doesn't give rights over web-scraped photos. | Unsafe | **No** (provenance unknown) | 852 MB, 48 Thai menus (about 1,000 images each) | Likely high, but the class list isn't published on the page |
| **Kaggle: Top 10 Best-rated Thai Food** | [kaggle.com/datasets/sorawitsinlapanurak/top-10-best-rated-thai-food](https://www.kaggle.com/datasets/sorawitsinlapanurak/top-10-best-rated-thai-food) | Kaggle tag Apache 2.0, but the description names iStockphoto and TasteAtlas as image sources. Stock photos can't be relicensed by an uploader. | Unsafe | **No** | 241 MB, 10 classes | khao soi, pad kra pao, tom kha gai, panang, massaman, pad thai, tom yum, green curry, khao pad |
| Other Kaggle "Thai food" hits | Kaggle search API, 2026-11-15 | Text or nutrition tables only (CC BY-SA / CC BY-NC-SA / unknown), not image sets | n/a | n/a | n/a | n/a |
| **Wikimedia Commons** | e.g. [Category:Cuisine of Thailand](https://commons.wikimedia.org/wiki/Category:Food_of_Thailand) | Licence is per file: PD / CC0 / CC BY / CC BY-SA. Training is fine. Publishing weights with an attribution list is fine for CC0 / CC BY / PD. **CC BY-SA**: whether ShareAlike reaches the weights is unsettled, so leave those files out. | Yes | Yes (CC0 / CC BY / PD files only, keep author + licence per file) | Category file counts (API, direct files only): Pad Thai 117, Tom yam 70, Som tam 60, Glutinous rice 40, Green curry 39, Khao phat 33, Mango sticky rice 32, Satay 32, Red curry 28, Phat si-io 27, Phat kaphrao 26, Massaman 25, Kai yang 24, Khao man kai 23, Mu krop 22, Tom kha kai 16, Khao soi 10, Spring rolls of Thailand 10, Larb 9, Khao mu krop 9, Khai chiao 9, Khao kha mu 7, Khao mu daeng 7, Yam wun sen 7, Nam tok 6, Pork satay 5, Cashew chicken 4, Khao tom 3 | About 28 of our dishes, but most have < 30 files, before removing CC BY-SA files. **Too small on its own.** |
| **Open Images V7** (Google) | [storage.googleapis.com/openimages/web](https://storage.googleapis.com/openimages/web/index.html), [github.com/openimages/dataset](https://github.com/openimages/dataset) | Annotations are CC BY 4.0 (Google). Images are listed as CC BY 2.0 (Flickr owners), but Google gives no warranty per image ("verify the license for each image yourself"). | Yes | Yes, with per-image attribution (CC BY 2.0) | About 9M images. Per-dish counts are unknown without the label CSVs. Most image-level labels are machine-generated. | The label vocabulary has: Pad thai, Green curry, Red curry, Massaman curry, Thai curry, Tom kha kai, Green papaya salad, Larb, Kai yang, Khao soi, Rat na, Drunken noodles, Thai fried rice, Hainanese chicken rice, Satay, Cashew chicken, Spring roll, Water spinach, Glutinous rice, Congee, Fried chicken, Char siu, Pork belly |

### Pretrained backbone

| Model | Page | Licence | Bundle-safe? |
|---|---|---|---|
| **EfficientNet-Lite0** (feature vector; the default backbone of MediaPipe Model Maker `image_classifier`) | [Kaggle Models: tensorflow/efficientnet](https://www.kaggle.com/models/tensorflow/efficientnet) (lite0-feature-vector, lite0-classification, TFLite lite0 variants) | **Apache 2.0** (every instance, per the Kaggle Models listing; provenance is the tfhub.dev TensorFlow docs) | Yes. 4.7M params, about 75% ImageNet top-1, about 4–5 MB as int8 / fp16 TFLite: well under 25 MB. It was pretrained on ImageNet; Google publishes these weights under Apache 2.0. |
| MediaPipe Model Maker / Tasks (code) | [ai.google.dev/edge/mediapipe](https://ai.google.dev/edge/mediapipe/solutions/vision/image_classifier) | Apache 2.0 (code), CC BY 4.0 (docs) | Yes |

Task 4 re-checks the training tooling itself (Model Maker vs Keras + metadata writer).

## THFOOD-50 classes → our labels

From the THFOOD-50 label names in the HF datasets-server `info` (same order as the dataset).
`src/food-vision/classMap.json` is the source of truth. Each of its classes lists the
THFOOD-50 names it takes (`datasets.thfood50`).

| THFOOD-50 | Our label | Dishes (first = default) |
|---|---|---|
| PhatKaphrao | `pad_kra_pao` | pad-kra-pao-moo-rice-egg, pad-kra-pao-gai-rice-egg, pad-kra-pao-moo-rice, pad-kra-pao-goong-rice-egg |
| KaoManGai | `khao_man_gai` | khao-man-gai, khao-man-gai-tod |
| PadThai | `pad_thai` | pad-thai-goong, pad-thai-gai |
| TomYumGoong | `tom_yum_goong` | tom-yum-goong |
| TomKhaGai | `tom_kha_gai` | tom-kha-gai |
| GaengKeawWan | `kaeng_khiao_wan` | kaeng-khiao-wan-gai-rice |
| MassamanGai | `massaman` | massaman-gai-rice |
| Somtam | `som_tum` | som-tum-thai, som-tum-gai-yang-khao-niao |
| GaiYang | `gai_yang` | gai-yang |
| LarbMoo | `larb_moo` | larb-moo |
| NamTokMoo | `nam_tok_moo` | nam-tok-moo |
| KuayTeowReua | `kuay_teow_ruea` | kuay-teow-ruea |
| Joke | `jok_moo` | jok-moo, khao-tom-moo |
| KaiJeowMooSaap | `khao_kai_jeow` | khao-kai-jeow |
| KaoMooDang | `khao_moo_daeng` | khao-moo-daeng, khao-moo-krob |
| StewedPorkLeg | `khao_kha_moo` | khao-kha-moo |
| KhaoMooTodGratiem | `moo_tod_kratiem` | moo-tod-kratiem-rice |
| PadPakBung | `pad_pak_bung` | pad-pak-bung-fai-daeng |
| YamWoonSen | `yum_woon_sen` | yum-woon-sen |
| GaengJued | `tom_jued` | tom-jued-tao-hoo-moo-sap |
| MooSatay | `moo_satay` | moo-satay |
| FriedChicken | `gai_tod` | gai-tod |
| KhaoNiewMaMuang | `khao_niao_mamuang` | khao-niao-mamuang |

The look-alike groupings follow the M7b-q2 default. The sheet offers the variants, and the first
one is preselected:
- jok and khao tom are both rice soups;
- moo daeng and moo krob are often on one plate;
- khao man gai tod is a variant of khao man gai.

### THFOOD-50 classes with no dish (dropped by `prepare.py`, M7b-q2)

BitterMelonSoup, BooPadPongali, CurriedFishCake, Dumpling, EggsStewed, FriedKale,
FriedMusselPancakes, GoongObWoonSen, GoongPao, GrilledQquid, HoyKraeng, HoyLaiPrikPao, KaiThoon,
KhanomJeenNamYaKati, KhaoMokGai, KkaoKlukKaphi, KorMooYang, KuaKling, KuayJab, PadPakRuamMit,
PadYordMala, PorkStickyNoodles, Roast_duck, Roast_fish, SonInLawEggs, Suki, Yentafo (27).

**Ask Wongsaton (via core-engineer):** which of these should become dishes? Each one needs a
reference recipe in `thaiDishes.src.json` first. Likely useful for him:
- PadPakRuamMit (stir-fried mixed vegetables)
- KorMooYang (grilled pork neck)
- KhaoMokGai (chicken biryani)
- Suki
- Yentafo
- KuayJab
- GoongPao (grilled prawns)

### Our dishes with no THFOOD-50 class (not in the camera yet)

khao-pad-moo / -goong / -gai (fried rice), pad-see-ew-moo / -gai, rad-na-moo, pad-kee-mao-gai,
kaeng-phet-moo-rice (red curry), panang-gai-rice, khao-soi-gai, khao-niao, khao-suay,
moo-ping-khao-niao, kuay-teow-moo-nam-sai, gai-pad-med-mamuang-rice, por-pia-tod (16).

These can be added to `classMap.json` when one of these has about 50+ images for the dish:
- THFOOD-100, once he has it and its class list is known;
- his own exported photos.

The next model version then learns them. Fried rice and pad see ew are the most likely gaps for
everyday use.
