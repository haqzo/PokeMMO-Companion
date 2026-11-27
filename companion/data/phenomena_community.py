"""Selected factual observations summarized from MaToRiuKo and yuisigamy's field notes."""

# (Area ID, category, localized landmark, possible species IDs, required moves, visibility note)
# These descriptions document community reports, independent of the exact-spot matching registry.
LOCATIONS = (
    (317, "grass", ("Central grass patch", "Hierba del centro de la ruta", "路线中段草丛"), (531, 559), (), True),
    (317, "grass", ("Grass approached from Accumula Town", "Hierba entrando desde Pueblo Terracota", "从唐草镇进入的草丛"), (531,), (), True),
    (317, "water", ("West river by the rocks", "Río occidental junto a las rocas", "西侧河道岩石旁"), (), ("surf",), True),
    (317, None, ("Hill across the river", "Colina al otro lado del río", "河对岸的小山丘"), (), ("surf",), True),
    (321, "shadow", ("Sandpit west of the Day Care", "Arenero al oeste de la guardería", "培育屋西侧沙地"), (580, 333), (), True),
    (321, "grass", ("Grass by the Day Care", "Hierba junto a la guardería", "培育屋旁草丛"), (531,), (), True),
    (321, "grass", ("Grass reached across the lake", "Hierba al otro lado del lago", "湖对岸草丛"), (531,), ("surf",), True),
    (321, "water", ("Northwest part of the lake", "Sector noroeste del lago", "湖面西北侧"), (550,), (), True),
    (324, "dust", ("First-floor dust", "Polvo en la planta baja", "一层扬尘"), (529, 528), (), False),
    (324, "dust", ("Dust past the first-floor river", "Polvo al cruzar el río en la planta baja", "一层河道对岸扬尘"), (529, 528), ("surf",), False),
    (324, "water", ("First-floor water", "Agua de la planta baja", "一层水面"), (), (), False),
    (325, "dust", ("Lower section", "Sector inferior", "地下层下侧"), (529, 528), ("surf", "flash"), False),
    (325, "dust", ("Upper section", "Sector superior", "地下层上侧"), (529, 528), ("surf", "flash"), False),
    (325, "water", ("Basement pool", "Agua del sótano", "地下层水池"), (), ("surf", "flash"), False),
    (365, "grass", ("Grass near the duck area", "Hierba junto a la zona de patos", "鸭场旁草丛"), (587,), (), False),
    (365, "grass", ("Grass left of the waterfall", "Hierba a la izquierda de la cascada", "瀑布左侧草丛"), (587,), (), False),
    (365, "water", None, (550,), (), False),
    (365, "shadow", ("High ground right of the waterfall", "Zona alta a la derecha de la cascada", "瀑布右侧高处"), (581,), (), False),
)

# Area-level sightings elsewhere in the source. Ambiguous submaps are listed by name.
AREA_TYPES = {
    319: ("grass", "shadow"), 387: ("grass", "shadow"), 423: ("water",), 238: ("grass",),
    152: ("grass", "shadow"), 154: ("grass", "shadow"), 155: ("grass", "water"),
    326: ("water", "shadow"), 158: ("shadow",), 329: ("grass",), 253: ("shadow",),
    96: ("water",), 191: ("grass", "shadow"), 331: ("grass", "water", "shadow"),
    195: ("dust", "shadow"), 196: ("dust",), 197: ("dust",), 333: ("dust",),
    334: ("dust",), 335: ("dust",), 342: ("shadow",), 337: ("shadow",),
    203: ("dust",), 113: ("grass", "water"), 213: ("shadow",), 345: ("water",),
    346: ("water", "shadow"), 348: ("grass",), 352: ("dust",), 353: ("dust",), 354: ("dust",),
    355: ("grass", "shadow"), 255: ("water", "shadow"), 368: ("grass", "shadow"),
    230: ("grass", "shadow"), 232: ("grass",), 370: ("grass", "water", "shadow"),
    412: ("water",), 240: ("water",), 374: ("grass", "water", "shadow"),
    376: ("grass", "water", "shadow"), 378: ("grass", "shadow"), 263: ("shadow",),
    383: ("grass",), 385: ("grass", "shadow"),
}
