# DustGrid™ Cargo Shorts: product page copy

Source: tech pack BR-M-DGCS-001, Rev U, 15/10/2026. Every claim below comes
from that pack. Supplier and factory names stay out of public copy on purpose.
Paste each value into Shopify admin → Products → DustGrid Cargo Shorts →
Metafields. Definitions live under Settings → Custom data → Products,
namespace `custom`.

Nothing in `docs/` ships. This is a copy sheet.

## What's wrong on the page today

| Live page says | Tech pack says |
|---|---|
| **REAR ZIP POCKET** | There is no zip and no rear pocket. There are two wide **open pockets in the liner**, one per side, reached through the side vents. |
| **118G** | The pack gives no garment weight. It gives only fabric weights: shell 104 gsm, liner 175 gsm. Weigh a finished M before you publish a number. |
| **NYLON SHELL** | Correct, but undersold: it's *washed nylon ripstop*. |
| Temperature range, roughly 15–30 °C | The pack makes no temperature claim. |
| Weather conditions: **Hot** | The pack makes no weather claim, and it specifies no waterproof finish. |

## New metafields (create these definitions once)

| Key | Type |
|---|---|
| `custom.style_code` | Single line text |
| `custom.pad_profile` | Single line text |
| `custom.pad_note` | Single line text |
| `custom.not_for` | Single line text |

`spec_pills`, `conditions`, `temp_min` and `temp_max` already exist.

## Field notes values

**custom.style_code**
```
BR-M-DGCS-001
```

**custom.spec_pills** (one entry per line, "Label: value")
```
Shell: Washed nylon ripstop, 104 gsm
Liner: 79% polyamide, 21% elastane
Pad: Triple-density foam
Waist: Hidden stretch mesh, drawcord
Pockets: Two, in the liner
Made: Melbourne, Australia
```
Once you've weighed a sample, add `Weight: ___ g (size M)` as the first row.
Change "Melbourne, Australia" to "Australia" if you'd rather not name the city.

**custom.pad_profile**
```
15, 13, 3
```

**custom.pad_note**
```
Deep under the sit bones, thin toward the front.
```

**custom.conditions** (one entry per line, "Word: note")
```
Scrub: the grid stops a snag becoming a tear.
Café stops: off the bike, they're just shorts.
Snacks: two wide liner pockets, through the side vents.
```

**custom.not_for**
```
Downpours. The shell has no waterproof finish.
```
Check this one first. The pack lists only the washer finish. If the fabric
does carry a DWR treatment, change or delete this line.

**custom.temp_min / custom.temp_max**: **clear both.** The tech pack gives no
basis for a range. Put them back only once you've ridden the shorts through
a season and can stand behind the numbers. "Wear it" stays hidden while
they're empty.

**custom.route**: the hang tag already carries a Bush Map QR. Put the route
it points to here so the "Ride-tested on" tile matches the tag.

## Statement (custom.statement)
```
For the days the gravel runs out and the scrub closes in, and the café at the end of it.
```

## Accordions

**custom.usage**
> Long gravel days, the café at the halfway point, the scrubby singletrack we
> didn't plan on. Two shorts in one: a loose ripstop outer over a compression
> liner with the pad built in. The ripstop never touches skin.

**custom.technology**
> **DustGrid™ ripstop.** Washed nylon with a woven grid that stops a snag
> becoming a tear. The crinkled washer finish is meant to be there. It looks
> lived-in from the first ride.
>
> **The pad.** Triple-density foam: 15 mm under the sit bones, 13 mm through
> the centre channel, 3 mm at the front. It holds when we're seated and stays
> out of the way when we're not.
>
> **The waist.** A stretch-mesh band hides under the gathered ripstop, so
> there's no elastic to dig in. The drawcord, with a reflective tracer, comes
> out on the inside: there when we need it, out of sight when we don't. The
> liner's soft mesh waistband is the only waistband that touches skin.

**custom.features**
> - Side vents open halfway up the leg, for room to move and a way into the
>   liner pockets
> - Two wide open pockets in the liner, one each side
> - Silicone gripper inside the liner leg, so it stays where we put it
> - Flatlock seams right through the liner
> - Back rise cut for full cover when leaning over the bars
> - Folded hem in white twin-needle stitch, curving round the vent
> - Mock fly in white J-stitch: the look, without a zip
> - Liner shows just below the outer hem
> - Size and care printed inside, with no scratchy labels
> - Sizes XS–XL

**custom.composition_care**
> Shell 100% nylon. Liner 79% polyamide, 21% elastane.
> Wash at 30 °C on gentle and line dry. Don't bleach, tumble dry, iron or dry
> clean. Don't press the shell flat, because the crinkle is the finish.
> Made in Australia.

**custom.warranty**: the tech pack doesn't cover warranty. Keep what you have.
