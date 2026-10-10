# Attribution — ArtCraft WebOS

Third-party assets bundled with the WebOS shell (`webos/`). Every
non-original asset must have a row here; originals (all code-drawn SVG icons,
CSS wallpapers, canvas FX wallpapers) are excluded by definition.

## Craft app icons (`webos/public/icons/craft/`)

Original artwork by the respective ArtCraft project owner, licensed
Apache-2.0 OR MIT (each repo's `LICENSE.txt`), sourced from
`assets/app-icon/<app>-1024.png` in `github.com/aliasfoxkde/<app>` and
resized to 256 px. These are the projects' own marks, used to launch the
apps they identify.

| Path | Source | License |
|---|---|---|
| `webos/public/icons/craft/cadcraft.png` | aliasfoxkde/cadcraft `assets/app-icon/cadcraft-1024.png` | Apache-2.0 OR MIT |
| `webos/public/icons/craft/designcraft.png` | aliasfoxkde/designcraft `assets/app-icon/designcraft-1024.png` | Apache-2.0 OR MIT |
| `webos/public/icons/craft/gridcraft.png` | aliasfoxkde/gridcraft `assets/app-icon/gridcraft-1024.png` | Apache-2.0 OR MIT |
| `webos/public/icons/craft/lightcraft.png` | aliasfoxkde/lightcraft `assets/app-icon/lightcraft-1024.png` | Apache-2.0 OR MIT |
| `webos/public/icons/craft/pdfcraft.png` | aliasfoxkde/pdfcraft `assets/app-icon/pdfcraft-1024.png` | Apache-2.0 OR MIT |
| `webos/public/icons/craft/photocraft.png` | aliasfoxkde/photocraft `assets/app-icon/photocraft-1024.png` | Apache-2.0 OR MIT |
| `webos/public/icons/craft/vectorcraft.png` | aliasfoxkde/vectorcraft `assets/app-icon/vectorcraft-1024.png` | Apache-2.0 OR MIT |
| `webos/public/icons/craft/wordcraft.png` | aliasfoxkde/wordcraft `assets/app-icon/wordcraft-1024.png` | Apache-2.0 OR MIT |

## Wallpaper photos (`webos/public/wallpapers/photos/`)

Photographs from Wikimedia Commons, each under a Creative Commons license.
Files are served at 1920 px (Commons thumbnail); the aurora photo is a 1920
px crop. CC BY-SA photos are redistributed under the same share-alike terms
for this collection; keep this table with any redistribution.

| Path | File (Commons) | Author | Source | License |
|---|---|---|---|---|
| `webos/public/wallpapers/photos/dunes.jpg` | File:Desert Sand Dunes near sunset.jpg | FuriousYogi | https://commons.wikimedia.org/wiki/File:Desert_Sand_Dunes_near_sunset.jpg | CC BY-SA 4.0 |
| `webos/public/wallpapers/photos/peak.jpg` | File:Mountain Reflection on Alpine Lake.jpg | Sabrina Schreiber | https://commons.wikimedia.org/wiki/File:Mountain_Reflection_on_Alpine_Lake.jpg | CC BY-SA 4.0 |
| `webos/public/wallpapers/photos/aurora.jpg` | File:Aurora borealis above Storfjorden, Troms, Norway, 2012 April.jpg (1920 px crop) | Ximonic (Simo Räsänen) | https://commons.wikimedia.org/wiki/File:Aurora_borealis_above_Storfjorden,_Troms,_Norway,_2012_April.jpg | CC BY-SA 3.0 |
| `webos/public/wallpapers/photos/coast.jpg` | File:Starr-141025-2549-aerial view-Kalaupapa and coastline-Molokai.jpg | Forest and Kim Starr | https://commons.wikimedia.org/wiki/File:Starr-141025-2549-aerial_view-Kalaupapa_and_coastline-Molokai.jpg | CC BY 3.0 us |
| `webos/public/wallpapers/photos/forest.jpg` | File:(Explored) Misty Winter morning in Stonor Forest - Flickr - scotbot.jpg | Scott Wylie from UK | https://commons.wikimedia.org/wiki/File:(Explored)_Misty_Winter_morning_in_Stonor_Forest_-_Flickr_-_scotbot.jpg | CC BY 2.0 |
| `webos/public/wallpapers/photos/canyon.jpg` | File:Blyde River Canyon Nature Reserve (ZA), Blyde River, Bourke's Luck Potholes, Blyde River Canyon -- 2024 -- 0024.jpg | Dietmar Rabich | https://commons.wikimedia.org/wiki/File:Blyde_River_Canyon_Nature_Reserve_(ZA),_Blyde_River,_Bourke%27s_Luck_Potholes,_Blyde_River_Canyon_--_2024_--_0024.jpg | CC BY-SA 4.0 |
| `webos/public/wallpapers/photos/galaxy.jpg` | File:018 Human looking at the stars during Perseids with the Milky Way in the background Photo by Giles Laurent.jpg | Giles Laurent | https://commons.wikimedia.org/wiki/File:018_Human_looking_at_the_stars_during_Perseids_with_the_Milky_Way_in_the_background_Photo_by_Giles_Laurent.jpg | CC BY-SA 4.0 |
| `webos/public/wallpapers/photos/tropical.jpg` | File:111 Praia do Sancho 04.jpg | Adelano Lázaro | https://commons.wikimedia.org/wiki/File:111_Praia_do_Sancho_04.jpg | CC BY-SA 4.0 |

## App Store catalog (`webos/src/os/registry.js`)

Third-party web apps listed in the App Store are linked, not bundled: each
entry embeds the public site in an iframe and stores only its public name,
URL, tagline, and a WebOS-drawn icon (never the vendor's logo). Trademarks
belong to their owners; listing is referential.
