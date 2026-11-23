"""Click geometry for the in-game region artwork (owner decision 2026-11-23: ship the in-game maps).

Coordinates are in 8-px TILE units of each in-game image (x, y from the top-left; .5 = middle of a tile),
read off the images on a tile grid. Feature ids are the same as in regions.py, so every area opens the same
PokeMMO locations as on the Companion map. Layout follows the Synergy reference for which maps exist
(Kanto, Sevii pages, Johto, Hoenn, Sinnoh) — no Synergy coordinates or images were copied.
Shapes: ("rect", x, y, w, h) · ("line", [(x, y), ...], ...) · ("point", x, y)
"""


def R(x, y, w=1, h=1):
    return ("rect", x, y, w, h)


def L(*lines):
    return ("line",) + tuple(lines)


def P(x, y):
    return ("point", x, y)


KANTO = {"id": "kanto", "region": "kanto", "label": "Kanto", "file": "kanto.png", "source": "FireRed (BPRE rev 1)", "origin": (0, 0), "features": {
    "indigo": R(3, 5), "pewter": R(5, 6), "viridian": R(5, 10), "pallet": R(5, 13), "cinnabar": R(5, 16),
    "cerulean": R(15, 5), "celadon": R(12, 8), "saffron": R(15, 8), "lavender": R(19, 8), "vermilion": R(15, 11), "fuchsia": R(13, 14),
    "r1": L([(5.5, 11), (5.5, 13)]), "r2": L([(5.5, 7), (5.5, 10)]), "r22": L([(3.5, 10.5), (5, 10.5)]), "r23": L([(3.5, 6), (3.5, 10.3)]),
    "r3": L([(6, 6.5), (8.6, 6.5)]), "r4": L([(9.8, 5.5), (15, 5.5)]), "r24": L([(15.5, 5), (15.5, 3.5)]), "r25": L([(15.7, 3.5), (17.5, 3.5)]),
    "r5": L([(15.5, 6), (15.5, 8)]), "r6": L([(15.5, 9), (15.5, 11)]), "r7": L([(13, 8.5), (15, 8.5)]), "r8": L([(16, 8.5), (19, 8.5)]),
    "r9": L([(16, 5.5), (19.5, 5.5)]), "r10": L([(19.5, 5.7), (19.5, 8)]), "r11": L([(16, 11.5), (19, 11.5)]), "r12": L([(19.5, 9), (19.5, 13.5)]),
    "r13": L([(19.3, 13.5), (16.5, 13.5)]), "r14": L([(16.5, 13.6), (16.5, 14.5)]), "r15": L([(16.3, 14.5), (14, 14.5)]),
    "r16": L([(8.5, 8.5), (12, 8.5)]), "r17": L([(8.5, 9), (8.5, 14)]), "r18": L([(8.6, 14.5), (13, 14.5)]),
    "r19": L([(13.5, 15), (13.5, 16.5)]), "r20": L([(13.3, 16.5), (6, 16.5)]), "r21n": L([(5.5, 14), (5.5, 15)]), "r21s": L([(5.5, 15.1), (5.5, 16)]),
    "viridian-forest": P(5.5, 8.3), "mt-moon": P(9, 5.6), "cerulean-cave": P(14.2, 4.3), "rock-tunnel": P(19.5, 6.3), "power-plant": P(20.3, 7.2),
    "pokemon-tower": P(20.2, 8.4), "digletts-cave": P(17.8, 10.6), "safari-zone": P(13.5, 13.3), "seafoam": P(9, 16.5),
    "pokemon-mansion": P(4.4, 16.6), "victory-road": P(3.5, 7.5), "ss-anne": P(15.5, 12.4),
}}

SEVII_1 = {"id": "sevii-123", "region": "kanto", "label": "Sevii Islands 1–3", "file": "sevii-123.png", "source": "FireRed (BPRE rev 1)", "origin": (0, 0), "features": {
    "one-island": R(2, 10), "two-island": R(10, 11), "three-island": R(19, 14),
    "kindle-road": L([(3.5, 9.8), (3.5, 6.5)]), "mt-ember": P(3.5, 5.4), "treasure-beach": P(2.4, 12.8),
    "cape-brink": P(10.5, 9.6), "bond-bridge": L([(15.5, 14.5), (18.8, 14.5)]), "berry-forest": P(14.8, 14.2), "three-isle-port": P(20, 15.4),
}}
SEVII_2 = {"id": "sevii-45", "region": "kanto", "label": "Sevii Islands 4–5", "file": "sevii-45.png", "source": "FireRed (BPRE rev 1)", "origin": (0, 0), "features": {
    "four-island": R(4, 6), "icefall-cave": P(4.3, 5.2), "five-island": R(17, 13),
    "five-isle-meadow": P(18.6, 13.4), "water-labyrinth": P(18, 11.4), "memorial-pillar": P(19.6, 16.4),
    "resort-gorgeous": P(15.8, 12.4), "lost-cave": P(15.4, 11.9),
}}
SEVII_3 = {"id": "sevii-67", "region": "kanto", "label": "Sevii Islands 6–7", "file": "sevii-67.png", "source": "FireRed (BPRE rev 1)", "origin": (0, 0), "features": {
    "six-island": R(18, 7), "seven-island": R(6, 10),
    "water-path": L([(19.5, 6), (19.5, 8.3)]), "ruin-valley": P(18.6, 9.8), "green-path": L([(16.2, 5.5), (17.8, 5.5)]),
    "pattern-bush": P(18.6, 5.3), "outcast-island": P(16.3, 3.3), "altering-cave": P(16.6, 2.3),
    "trainer-tower": P(6.5, 8.5), "canyon-entrance": P(7.2, 11.6), "sevault-canyon": P(7.3, 12.9), "tanoby-ruins": P(7, 14.4),
}}

JOHTO = {"id": "johto", "region": "johto", "label": "Johto", "file": "johto.png", "source": "HeartGold/SoulSilver (IPKE/IPGE)", "origin": (0, 0), "features": {
    "cianwood": R(5, 12, 1, 2), "olivine": R(8, 9, 2, 2), "ecruteak": R(11, 6, 2, 2), "goldenrod": R(9, 12, 3, 2), "azalea": R(12, 16, 2, 1),
    "violet": R(14, 9, 2, 2), "cherrygrove": R(16, 14, 2, 1), "new-bark": R(21, 14), "mahogany": R(16, 7), "blackthorn": R(20, 6, 2, 2),
    "r29": L([(18, 14.5), (20.9, 14.5)]), "r30": L([(17.5, 10.6), (17.5, 13.9)]), "r31": L([(16, 10.5), (17.4, 10.5)]),
    "r32": L([(14.5, 11), (14.5, 15.3)]), "r33": L([(14.4, 16.4), (14, 16.5)]), "r34": L([(11.5, 13.9), (11.5, 15.9)]),
    "r35": L([(11.5, 9.9), (11.5, 11.9)]), "r36": L([(12, 9.5), (13.9, 9.5)]), "r37": L([(12.5, 8), (12.5, 8.9)]),
    "r38": L([(8.5, 7.5), (10.9, 7.5)]), "r39": L([(8.5, 7.6), (8.5, 8.9)]), "r40": L([(7.5, 10), (7.5, 12.7)]), "r41": L([(6.7, 12.9), (6.9, 14.4)]),
    "r42": L([(13.1, 7.5), (15.9, 7.5)]), "r43": L([(16.5, 5.1), (16.5, 6.9)]), "r44": L([(17.1, 7.5), (19.9, 7.5)]),
    "r45": L([(20.4, 8.1), (20.4, 12.3), (19.5, 12.4)]), "r46": L([(19.5, 12.6), (19.5, 13.8)]),
    "r27": L([(22, 14.5), (28.5, 14.5)]), "r26": L([(28.5, 14.3), (28.5, 9.8)]), "r28": L([(25.6, 10.5), (27.9, 10.5)]),
    "r47": L([(4.6, 13.6), (3.2, 13.8)]), "r48": L([(2.5, 12.4), (2.5, 11.2)]),
    "lake-of-rage": P(16.5, 3.8), "sprout-tower": P(15.5, 9.4), "ruins-of-alph": P(13.5, 10.9), "union-cave": P(14.5, 15.6),
    "slowpoke-well": P(13.5, 16.5), "ilex-forest": P(11.4, 15), "national-park": P(11, 9.1), "pokeathlon": P(10.4, 10.6),
    "burned-tower": P(11.5, 6.4), "bell-tower": P(12.5, 6.4), "whirl-islands": P(7.2, 14.4), "mt-mortar": P(14.5, 6.5),
    "rocket-hq": P(16.6, 8.2), "ice-path": P(19.6, 7.5), "dragons-den": P(21.6, 5.2), "dark-cave": P(19.1, 8.8),
    "tohjo-falls": P(23.5, 14.5), "victory-road-j": P(28.5, 9.4), "mt-silver": P(25, 10.1), "cliff-cave": P(4.5, 12.9),
    "cliff-edge-gate": P(2.5, 13.5), "safari-zone-j": P(2.6, 10.5),
}}

HOENN = {"id": "hoenn", "region": "hoenn", "label": "Hoenn", "file": "hoenn.png", "source": "Emerald (BPEE)", "origin": (0, 0), "features": {
    "fallarbor": R(4, 2), "fortree": R(13, 2), "lavaridge": R(6, 5), "lilycove": R(19, 5, 2, 1), "rustboro": R(1, 7, 1, 2),
    "verdanturf": R(5, 8), "mauville": R(9, 8, 2, 1), "mossdeep": R(25, 7, 2, 1), "sootopolis": R(22, 9), "ever-grande": R(28, 10, 1, 2),
    "petalburg": R(2, 11), "oldale": R(5, 11), "littleroot": R(5, 13), "slateport": R(9, 12, 1, 2), "pacifidlog": R(18, 12), "dewford": R(3, 16),
    "r101": L([(5.5, 12), (5.5, 13)]), "r102": L([(3, 11.5), (5, 11.5)]), "r103": L([(5.5, 11), (5.5, 10.5), (9, 10.5)]),
    "r104": L([(2, 11.5), (1.5, 11.5), (1.5, 9)]), "r105": L([(1.5, 12), (1.5, 15)]), "r106": L([(1.6, 15.5), (3, 15.8)]),
    "r107": L([(4, 16.5), (6.5, 16.5)]), "r108": L([(6.6, 16.5), (8.4, 16.5)]), "r109": L([(9.5, 16.5), (9.5, 14)]),
    "r110": L([(9.5, 9), (9.5, 12)]), "r111": L([(9.5, 8), (9.5, 2.6)]), "r112": L([(7, 5.5), (9.3, 5.5)]), "r113": L([(5, 2.5), (9.3, 2.5)]),
    "r114": L([(4, 2.5), (2, 2.5), (2, 3.4)]), "r115": L([(1.2, 7), (1.2, 4.5)]), "r116": L([(2, 7.5), (4.6, 7.5)]),
    "r117": L([(6, 8.5), (9, 8.5)]), "r118": L([(11, 8.5), (12.9, 8.5)]), "r119": L([(13.5, 8.2), (13.5, 3)]),
    "r120": L([(14, 2.5), (14.5, 2.5), (14.5, 5.3)]), "r121": L([(14.7, 5.5), (19, 5.5)]), "r122": L([(17.5, 6), (17.5, 6.8)]),
    "r123": L([(13.2, 8.5), (17.8, 8.5)]), "r124": L([(21, 5.5), (24, 5.5)]), "r125": L([(24.3, 5.5), (26.5, 6.2)]),
    "r126": L([(21.3, 8.3), (24, 8.3)]), "r127": L([(24.5, 7.6), (24.5, 11.3)]), "r128": L([(24.8, 11.5), (27.8, 11.5)]),
    "r129": L([(26.5, 12.5), (24, 12.5)]), "r130": L([(23.8, 12.5), (20, 12.5)]), "r131": L([(19.8, 12.5), (19, 12.5)]),
    "r132": L([(17.8, 12.5), (15, 12.5)]), "r133": L([(14.8, 12.5), (12.5, 12.5)]), "r134": L([(12.3, 12.5), (10, 12.5)]),
    "petalburg-woods": P(1.5, 9.6), "rusturf-tunnel": P(5.2, 7.3), "granite-cave": P(2.3, 16.7), "abandoned-ship": P(7.5, 16.5),
    "new-mauville": P(10.6, 9.7), "mirage-tower": P(8.8, 3.6), "desert-underpass": P(8.4, 2.9), "fiery-path": P(8.2, 5.4),
    "jagged-pass": P(6.7, 4.6), "magma-hideout": P(7.1, 4.0), "meteor-falls": P(2, 3.8), "scorched-slab": P(15, 3.8),
    "mt-pyre": P(17.5, 7.1), "safari-zone-h": P(16.5, 4.8), "aqua-hideout": P(20.8, 4.8), "shoal-cave": P(27, 6.8),
    "cave-of-origin": P(23, 9.6), "seafloor-cavern": P(25.8, 11.1), "sky-pillar": P(28.3, 16.4), "victory-road-h": P(28.5, 9.4),
    "altering-cave-h": P(6.5, 9.8), "sealed-chamber": P(11.5, 13.2), "battle-frontier": P(9.8, 17.5), "artisan-cave": P(10.4, 17.2),
}}

SINNOH = {"id": "sinnoh", "region": "sinnoh", "label": "Sinnoh", "file": "sinnoh.png", "source": "Platinum (CPUE), bottom-screen map, brightened", "origin": (0, 10), "features": {
    "snowpoint": R(24, 13, 2, 3), "acuity": P(21.5, 14.2), "snowpoint-temple": P(25.6, 13.4),
    "r217": L([(20.5, 17), (20.5, 24.5)]), "r216": L([(20.6, 25.5), (25.5, 25.5)]), "mt-coronet": P(26.5, 30),
    "eterna": R(20, 33, 3, 2), "r211w": L([(23.2, 33.5), (25.8, 33.5)]), "r211e": L([(27.2, 33.5), (29.8, 33.5)]), "celestic": R(30, 33, 1, 1),
    "r210n": L([(32, 33.5), (37, 33.5), (36.5, 35)]), "r210s": L([(36.5, 35.2), (36.5, 41.5)]),
    "eterna-forest": P(15.5, 35.2), "old-chateau": P(14.8, 34.4), "r205n": L([(18.2, 33.6), (19.9, 33.6)]),
    "r205s": L([(12.8, 39.5), (14.5, 39.5), (14.5, 37)]), "floaroma": R(12, 39, 1, 3), "fuego": P(12.6, 37.6), "valley-windworks": P(16.6, 41.6),
    "r204n": L([(12.5, 42.2), (12.5, 44.2)]), "ravaged-path": P(12.5, 44.7), "r204s": L([(12.5, 45.2), (12.5, 46.8)]),
    "jubilife": R(10, 47, 4, 3), "canalave": R(4, 45, 2, 3), "r218": L([(6, 47.5), (9.8, 47.5)]), "iron-island": P(8.5, 31.5),
    "r203": L([(14.1, 47.5), (17.6, 47.5)]), "oreburgh-gate": P(17.6, 47.6), "oreburgh": R(18, 47, 4, 3), "oreburgh-mine": P(20.6, 50.6),
    "r207": L([(20.6, 46.6), (20.6, 45.5), (23.8, 45.5)]), "r206": L([(20.5, 36.2), (20.5, 44.5)]), "wayward-cave": P(22.5, 41),
    "r208": L([(26, 45.5), (29.8, 45.5)]), "hearthome": R(30, 43, 4, 4), "r209": L([(34.2, 45.5), (36.5, 45.5), (36.5, 43)]),
    "lost-tower": P(35.4, 44.4), "solaceon": R(36, 42, 4, 1), "solaceon-ruins": P(38.6, 43.1),
    "r215": L([(38.2, 37.5), (43.8, 37.5)]), "veilstone": R(44, 37, 4, 3), "r214": L([(46.5, 40.2), (46.5, 46.5)]), "ruin-maniac": P(47.6, 44),
    "sendoff-spring": P(50.6, 43.8), "turnback-cave": P(50.6, 45.1), "valor": P(45.5, 49), "r222": L([(48.2, 49.5), (53.8, 49.5)]),
    "sunyshore": R(54, 48, 4, 3), "r213": L([(42, 52.5), (47.5, 52.5), (47.5, 54.3), (42, 54.3)]), "pastoria": R(38, 51, 4, 4),
    "great-marsh": P(40, 50.2), "r212n": L([(30.5, 47), (30.5, 52.8)]), "r212s": L([(30.6, 53.5), (37.6, 53.5)]), "trophy-garden": P(32.6, 49.6),
    "r223": L([(54.5, 39), (54.5, 46.6)]), "league": R(54, 35, 1, 2), "victory-road-s": P(54.5, 37.6), "r224": L([(55.5, 35.8), (57.5, 33.5), (58.8, 31.5)]),
    "twinleaf": R(8, 55, 1, 2), "sandgem": R(12, 53, 1, 1), "lake-verity": P(5.5, 52.5), "r201": L([(8.5, 55), (8.5, 53.5), (11.8, 53.5)]),
    "r202": L([(12.5, 52.8), (12.5, 50)]), "r219": L([(12.5, 54.2), (12.5, 57.5), (15.4, 57.5)]), "r220": L([(16, 57.5), (19.2, 57.5)]),
    "r221": L([(19.4, 57.5), (21.8, 57.5)]),
    "stark-mountain": P(48.5, 15.6), "r227": L([(48.5, 16.6), (48.5, 21)]), "r225": L([(40.5, 21), (40.5, 27)]), "r226": L([(43.5, 21.5), (49.8, 21.5)]),
    "r228": L([(50.5, 21.2), (50.5, 27.4)]), "r229": L([(50.6, 27.6), (53.6, 27.6)]), "r230": L([(43.5, 27.6), (49.8, 27.6)]), "resort-area": P(52.6, 29.7),
}}

GAME_MAPS = [KANTO, SEVII_1, SEVII_2, SEVII_3, JOHTO, HOENN, SINNOH]
