"""Catalog of what a therapist can list on their profile: the areas they
work with (clinical/professional terms) and the psychotherapy modalities
they practice. The backend is the single source of truth - the frontend
fetches this via GET /tenant/profile-options and only stored slugs from
these lists are accepted.

Slugs are stable identifiers stored in the database; labels can be
reworded freely. Never reuse a slug for a different meaning.
"""

# (slug, label)
THERAPIST_SPECIALTIES = [
    # Anxiety and related
    ("anksiozni-poremecaji", "Anksiozni poremećaji"),
    ("panicni-poremecaj", "Panični poremećaj"),
    ("socijalna-anksioznost", "Socijalna anksioznost"),
    ("fobije", "Specifične fobije"),
    ("okp", "Opsesivno-kompulzivni poremećaj (OKP)"),
    # Mood
    ("depresija", "Depresija"),
    ("bipolarni-poremecaj", "Bipolarni afektivni poremećaj"),
    # Trauma and loss
    ("ptsp-trauma", "PTSP i traumatska iskustva"),
    ("kompleksna-trauma", "Kompleksna trauma i zlostavljanje"),
    ("zalovanje", "Žalovanje i gubitak"),
    # Addiction, eating, body
    ("zavisnosti-supstance", "Bolesti zavisnosti (alkohol, psihoaktivne supstance)"),
    ("bihevioralne-zavisnosti", "Bihevioralne zavisnosti (kockanje, internet, igrice)"),
    ("poremecaji-ishrane", "Poremećaji ishrane"),
    ("psihosomatski", "Psihosomatske tegobe"),
    ("hronicne-bolesti", "Hronične bolesti i hroničan bol"),
    ("poremecaji-spavanja", "Poremećaji spavanja"),
    # Personality, neurodevelopmental, crisis
    ("poremecaji-licnosti", "Poremećaji ličnosti"),
    ("adhd-odrasli", "ADHD kod odraslih"),
    ("samopovredjivanje-suicidalnost", "Samopovređivanje i suicidalne ideje"),
    # Life situations
    ("stres-sagorevanje", "Stres i sagorevanje na poslu (burnout)"),
    ("zivotne-krize", "Životne krize i prelazni periodi"),
    ("samopouzdanje", "Samopouzdanje i samopoštovanje"),
    ("partnerski-odnosi", "Partnerski odnosi"),
    ("razvod-razdvajanje", "Razvod i razdvajanje"),
    ("porodicni-odnosi", "Porodični odnosi i sukobi"),
    ("roditeljstvo", "Roditeljstvo"),
    ("seksualnost", "Seksualnost i seksualne disfunkcije"),
    ("lgbtq", "Rodni i seksualni identitet (LGBTQ+)"),
    # Age groups
    ("rad-sa-decom", "Rad sa decom"),
    ("rad-sa-adolescentima", "Rad sa adolescentima"),
]

THERAPY_MODALITIES = [
    # Cognitive-behavioral family
    ("kbt", "Kognitivno-bihejvioralna terapija (KBT)"),
    ("rebt", "Racionalno-emotivna bihejvioralna terapija (REBT)"),
    ("act", "Terapija prihvatanjem i posvećenošću (ACT)"),
    ("dbt", "Dijalektičko-bihejvioralna terapija (DBT)"),
    ("shema-terapija", "Shema terapija"),
    ("mbct", "Kognitivna terapija zasnovana na usredsređenoj svesnosti (MBCT)"),
    ("emdr", "EMDR"),
    # Psychodynamic
    ("psihoanaliza", "Psihoanaliza"),
    ("psihodinamska", "Psihodinamska psihoterapija"),
    ("grupna-analiza", "Grupna analiza"),
    # Humanistic / experiential
    ("transakciona-analiza", "Transakciona analiza (TA)"),
    ("gestalt", "Geštalt terapija"),
    ("usmerena-na-klijenta", "Terapija usmerena na klijenta"),
    ("egzistencijalna", "Egzistencijalna psihoterapija i logoterapija"),
    ("psihodrama", "Psihodrama"),
    ("telesna", "Telesno orijentisana psihoterapija"),
    ("art-terapija", "Art terapija"),
    # Systemic / relational
    ("sistemska-porodicna", "Sistemska porodična terapija"),
    ("eft", "Emocionalno fokusirana terapija (EFT)"),
    ("realitetna", "Realitetna terapija (teorija izbora)"),
    ("sfbt", "Terapija usmerena na rešenja (SFBT)"),
    # Other
    ("integrativna", "Integrativna psihoterapija"),
    ("hipnoterapija", "Ericksonova hipnoterapija"),
]

SPECIALTY_SLUGS = {slug for slug, _ in THERAPIST_SPECIALTIES}
MODALITY_SLUGS = {slug for slug, _ in THERAPY_MODALITIES}

# Old lay-language categories -> closest professional area. Applied once
# to stored data on startup. "usamljenost" has no honest clinical
# equivalent, so it's dropped and the therapist re-picks.
LEGACY_SPECIALTY_MAP = {
    "slomljeno-srce": "partnerski-odnosi",
    "gubitak-smrt": "zalovanje",
    "razvod": "razvod-razdvajanje",
    "alkoholizam": "zavisnosti-supstance",
    "nevernost": "partnerski-odnosi",
    "anksioznost": "anksiozni-poremecaji",
    "trauma": "ptsp-trauma",
    "porodicni-sukobi": "porodicni-odnosi",
    "stres-na-poslu": "stres-sagorevanje",
    "problemi-u-vezi": "partnerski-odnosi",
    "panicni-napadi": "panicni-poremecaj",
    "nesanica": "poremecaji-spavanja",
    # unchanged slugs that exist in both lists:
    "depresija": "depresija",
    "samopouzdanje": "samopouzdanje",
    "roditeljstvo": "roditeljstvo",
}

BIO_MAX_LENGTH = 2000


def migrate_legacy_specialties(stored: str | None) -> str | None:
    """Maps a stored comma-separated slug list onto the current catalog,
    dropping duplicates and anything unknown. Idempotent."""
    if not stored:
        return stored
    result = []
    for slug in (s.strip() for s in stored.split(",")):
        if not slug:
            continue
        mapped = slug if slug in SPECIALTY_SLUGS else LEGACY_SPECIALTY_MAP.get(slug)
        if mapped and mapped not in result:
            result.append(mapped)
    return ",".join(result)


def options_payload() -> dict:
    return {
        "specialties": [{"slug": s, "label": l} for s, l in THERAPIST_SPECIALTIES],
        "modalities": [{"slug": s, "label": l} for s, l in THERAPY_MODALITIES],
        "bio_max_length": BIO_MAX_LENGTH,
    }
