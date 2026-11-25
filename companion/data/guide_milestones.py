"""Bundled storyline *milestone outline* — independently written, short objectives.

These are NOT copies of any walkthrough. They describe the well-known main
storyline milestones of each region. Gym order was cross-checked against the
user's private walkthroughs (gym sections appear in this order) on 2026-11-22.
Every step carries status "outline-unverified" until checked in the current
PokeMMO client. Defog steps come from the official 19 Nov 2026 changelog.

Step IDs are stable and must never be renumbered: progress is keyed by them.
"""
from __future__ import annotations

SOURCE = {
    "kind": "authored-outline",
    "label": "Companion milestone outline (bundled)",
    "checked_at": "2026-11-22",
    "status": "outline-unverified",
    "note": "Short independent objectives. Main-story order follows the region's storyline; "
            "PokeMMO-specific details still need in-game verification.",
}
DEFOG_SOURCE = "https://forums.pokemmo.com/index.php?/topic/201822-changelog-november-19th-2026/"

# (chapter, step-key, text, kind, mandatory)
_K = [
    ("Pallet Town", "starter", "Choose your starter Pokémon in Professor Oak's lab and battle your rival.", "story", True),
    ("Viridian City", "parcel", "Collect Oak's Parcel at the Viridian City Poké Mart and deliver it to receive the Pokédex.", "story", True),
    ("Viridian Forest", "forest", "Travel north through Viridian Forest to Pewter City.", "route", True),
    ("Pewter City", "gym1", "Defeat Brock at the Pewter City Gym — Boulder Badge.", "gym", True),
    ("Mt. Moon", "mtmoon", "Cross Mt. Moon (choose one fossil) and continue to Cerulean City.", "route", True),
    ("Cerulean City", "gym2", "Defeat Misty at the Cerulean City Gym — Cascade Badge.", "gym", True),
    ("Route 25", "bill", "Help Bill at the Sea Cottage on Route 25 and receive the S.S. Ticket.", "story", True),
    ("Vermilion City", "ssanne", "Board the S.S. Anne and receive HM Cut from the captain.", "story", True),
    ("Vermilion City", "gym3", "Defeat Lt. Surge at the Vermilion City Gym — Thunder Badge.", "gym", True),
    ("Rock Tunnel", "rocktunnel", "Pass through Rock Tunnel to Lavender Town.", "route", True),
    ("Celadon City", "gym4", "Defeat Erika at the Celadon City Gym — Rainbow Badge.", "gym", True),
    ("Celadon City", "hideout", "Clear the Team Rocket hideout under the Game Corner and obtain the Silph Scope.", "story", True),
    ("Lavender Town", "defog", "Pick up HM Defog on the first floor of Lavender Town's tower (added 19 Nov 2026).", "item", False),
    ("Lavender Town", "tower", "Climb the Pokémon Tower with the Silph Scope, rescue Mr. Fuji and receive the Poké Flute.", "story", True),
    ("Fuchsia City", "gym5", "Defeat Koga at the Fuchsia City Gym — Soul Badge.", "gym", True),
    ("Fuchsia City", "safari", "Visit the Safari Zone for HM Surf, and return the Warden's Gold Teeth for HM Strength.", "story", True),
    ("Saffron City", "silph", "Free Silph Co. from Team Rocket.", "story", True),
    ("Saffron City", "gym6", "Defeat Sabrina at the Saffron City Gym — Marsh Badge.", "gym", True),
    ("Cinnabar Island", "gym7", "Find the Secret Key in the Pokémon Mansion and defeat Blaine — Volcano Badge.", "gym", True),
    ("Viridian City", "gym8", "Defeat Giovanni at the Viridian City Gym — Earth Badge.", "gym", True),
    ("Victory Road", "vroad", "Pass through Victory Road to the Indigo Plateau.", "route", True),
    ("Indigo Plateau", "e4", "Defeat the Elite Four: Lorelei, Bruno, Agatha and Lance.", "league", True),
    ("Indigo Plateau", "champion", "Defeat the Champion (your rival).", "league", True),
]
_J = [
    ("New Bark Town", "starter", "Receive your starter from Professor Elm.", "story", True),
    ("Route 30", "mrpokemon", "Run Professor Elm's errand to Mr. Pokémon's house and return.", "story", True),
    ("Violet City", "gym1", "Defeat Falkner at the Violet City Gym — Zephyr Badge.", "gym", True),
    ("Azalea Town", "well", "Drive Team Rocket out of the Slowpoke Well.", "story", True),
    ("Azalea Town", "gym2", "Defeat Bugsy at the Azalea Town Gym — Hive Badge.", "gym", True),
    ("Ilex Forest", "cut", "Catch the Farfetch'd in Ilex Forest and receive HM Cut.", "story", True),
    ("Goldenrod City", "gym3", "Defeat Whitney at the Goldenrod City Gym — Plain Badge.", "gym", True),
    ("Ecruteak City", "burned", "Explore the Burned Tower.", "story", True),
    ("Ecruteak City", "gym4", "Defeat Morty at the Ecruteak City Gym — Fog Badge.", "gym", True),
    ("Olivine City", "lighthouse", "Visit the sick Pokémon at the top of the Olivine Lighthouse.", "story", True),
    ("Cianwood City", "gym5", "Defeat Chuck at the Cianwood City Gym — Storm Badge, and collect the medicine.", "gym", True),
    ("Olivine City", "gym6", "Deliver the medicine and defeat Jasmine — Mineral Badge.", "gym", True),
    ("Lake of Rage", "rage", "Investigate the Lake of Rage and the red Gyarados.", "story", True),
    ("Mahogany Town", "hideout", "Clear the Team Rocket hideout in Mahogany Town.", "story", True),
    ("Mahogany Town", "gym7", "Defeat Pryce at the Mahogany Town Gym — Glacier Badge.", "gym", True),
    ("Goldenrod City", "radio", "Free the Goldenrod Radio Tower from Team Rocket.", "story", True),
    ("Blackthorn City", "gym8", "Cross the Ice Path and defeat Clair — Rising Badge.", "gym", True),
    ("Blackthorn City", "den", "Complete the test in the Dragon's Den.", "story", True),
    ("Victory Road", "vroad", "Travel through Route 27 and Victory Road to the Indigo Plateau.", "route", True),
    ("Indigo Plateau", "e4", "Defeat the Elite Four: Will, Koga, Bruno and Karen.", "league", True),
    ("Indigo Plateau", "champion", "Defeat Champion Lance.", "league", True),
    ("Route 28", "defog", "Post-game: pick up HM Defog on Route 28 (added 19 Nov 2026).", "item", False),
]
_H = [
    ("Littleroot Town", "starter", "Rescue Professor Birch on Route 101 and choose your starter.", "story", True),
    ("Petalburg City", "wally", "Meet Norman in Petalburg and help Wally catch his first Pokémon.", "story", True),
    ("Rustboro City", "gym1", "Defeat Roxanne at the Rustboro City Gym — Stone Badge.", "gym", True),
    ("Rusturf Tunnel", "defog", "Pick up HM Defog in Rusturf Tunnel (added 19 Nov 2026).", "item", False),
    ("Rusturf Tunnel", "goods", "Recover the Devon Goods and receive Mr. Stone's letter for Steven.", "story", True),
    ("Dewford Town", "gym2", "Defeat Brawly at the Dewford Town Gym — Knuckle Badge.", "gym", True),
    ("Granite Cave", "steven", "Deliver the letter to Steven in Granite Cave.", "story", True),
    ("Slateport City", "slateport", "Deliver the Devon Goods to Captain Stern in Slateport City.", "story", True),
    ("Mauville City", "gym3", "Defeat Wattson at the Mauville City Gym — Dynamo Badge.", "gym", True),
    ("Mt. Chimney", "chimney", "Stop Team Magma at the summit of Mt. Chimney.", "story", True),
    ("Lavaridge Town", "gym4", "Defeat Flannery at the Lavaridge Town Gym — Heat Badge.", "gym", True),
    ("Petalburg City", "gym5", "Defeat Norman at the Petalburg City Gym — Balance Badge.", "gym", True),
    ("Fortree City", "gym6", "Defeat Winona at the Fortree City Gym — Feather Badge.", "gym", True),
    ("Mossdeep City", "gym7", "Defeat Tate & Liza at the Mossdeep City Gym — Mind Badge.", "gym", True),
    ("Seafloor Cavern", "seafloor", "Confront Team Aqua in the Seafloor Cavern.", "story", True),
    ("Sootopolis City", "weather", "Calm the legendary crisis in Sootopolis (Sky Pillar visit).", "story", True),
    ("Sootopolis City", "gym8", "Defeat Juan at the Sootopolis City Gym — Rain Badge.", "gym", True),
    ("Victory Road", "vroad", "Pass through Victory Road to the Pokémon League.", "route", True),
    ("Ever Grande City", "e4", "Defeat the Elite Four: Sidney, Phoebe, Glacia and Drake.", "league", True),
    ("Ever Grande City", "champion", "Defeat Champion Wallace.", "league", True),
]
_S = [
    ("Twinleaf Town", "starter", "Choose your starter at Lake Verity with Professor Rowan's briefcase.", "story", True),
    ("Sandgem Town", "dex", "Receive the Pokédex from Professor Rowan.", "story", True),
    ("Oreburgh City", "gym1", "Defeat Roark at the Oreburgh City Gym — Coal Badge.", "gym", True),
    ("Valley Windworks", "windworks", "Drive Team Galactic out of the Valley Windworks.", "story", True),
    ("Eterna City", "gym2", "Defeat Gardenia at the Eterna City Gym — Forest Badge.", "gym", True),
    ("Eterna City", "galactic", "Clear the Team Galactic building in Eterna City.", "story", True),
    ("Hearthome City", "gym3", "Defeat Fantina at the Hearthome City Gym — Relic Badge.", "gym", True),
    ("Veilstone City", "gym4", "Defeat Maylene at the Veilstone City Gym — Cobble Badge.", "gym", True),
    ("Pastoria City", "gym5", "Defeat Crasher Wake at the Pastoria City Gym — Fen Badge.", "gym", True),
    ("Celestic Town", "celestic", "Stop Team Galactic in Celestic Town.", "story", True),
    ("Canalave City", "gym6", "Defeat Byron at the Canalave City Gym — Mine Badge.", "gym", True),
    ("Lakes", "lakes", "Respond to Team Galactic's attacks on Lake Valor and Lake Verity.", "story", True),
    ("Snowpoint City", "gym7", "Defeat Candice at the Snowpoint City Gym — Icicle Badge.", "gym", True),
    ("Veilstone City", "hq", "Infiltrate the Team Galactic headquarters.", "story", True),
    ("Mt. Coronet", "spear", "Climb to Spear Pillar and stop Cyrus.", "story", True),
    ("Distortion World", "distortion", "Pass through the Distortion World.", "story", True),
    ("Sunyshore City", "gym8", "Defeat Volkner at the Sunyshore City Gym — Beacon Badge.", "gym", True),
    ("Victory Road", "vroad", "Pass through Victory Road to the Pokémon League.", "route", True),
    ("Pokémon League", "e4", "Defeat the Elite Four: Aaron, Bertha, Flint and Lucian.", "league", True),
    ("Pokémon League", "champion", "Defeat Champion Cynthia.", "league", True),
]
_U = [
    ("Nuvema Town", "starter", "Choose your starter from Professor Juniper's gift.", "story", True),
    ("Accumula Town", "plasma", "Watch Team Plasma's speech in Accumula Town.", "story", True),
    ("Striaton City", "gym1", "Defeat the Striaton City Gym leader — Trio Badge.", "gym", True),
    ("Nacrene City", "gym2", "Defeat Lenora at the Nacrene City Gym — Basic Badge.", "gym", True),
    ("Castelia City", "gym3", "Defeat Burgh at the Castelia City Gym — Insect Badge.", "gym", True),
    ("Nimbasa City", "gym4", "Defeat Elesa at the Nimbasa City Gym — Bolt Badge.", "gym", True),
    ("Driftveil City", "gym5", "Defeat Clay at the Driftveil City Gym — Quake Badge.", "gym", True),
    ("Celestial Tower", "defog", "Pick up HM Defog on the Celestial Tower rooftop (added 19 Nov 2026).", "item", False),
    ("Mistralton City", "gym6", "Defeat Skyla at the Mistralton City Gym — Jet Badge.", "gym", True),
    ("Icirrus City", "gym7", "Defeat Brycen at the Icirrus City Gym — Freeze Badge.", "gym", True),
    ("Dragonspiral Tower", "dragonspiral", "Climb Dragonspiral Tower and confront Team Plasma.", "story", True),
    ("Opelucid City", "gym8", "Defeat Drayden at the Opelucid City Gym — Legend Badge.", "gym", True),
    ("Victory Road", "vroad", "Pass through Victory Road to the Pokémon League.", "route", True),
    ("Pokémon League", "e4", "Defeat the Elite Four: Shauntal, Marshal, Grimsley and Caitlin.", "league", True),
    ("N's Castle", "finale", "Face N and Ghetsis in N's Castle (story legendary encounter is storyline-only).", "league", True),
]

_RAW = {"kanto": _K, "johto": _J, "hoenn": _H, "sinnoh": _S, "unova": _U}


def milestone_steps(region: str) -> list[dict]:
    steps = []
    for order, (chapter, key, text, kind, mandatory) in enumerate(_RAW[region]):
        steps.append({
            "id": f"{region}:m:{key}",
            "region": region,
            "order": order,
            "chapter": chapter,
            "text": text,
            "kind": kind,
            "mandatory": mandatory,
            "status": "outline-unverified",
            "source_url": DEFOG_SOURCE if key == "defog" else None,
        })
    return steps
