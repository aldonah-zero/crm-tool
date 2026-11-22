# Čišćenje git istorije od osetljivih fajlova

> **Ovo uputstvo NIJE izvršeno.** Commit „Stop tracking…" samo prestaje da prati fajlove od tog trenutka. Svi stari commitovi i dalje sadrže bazu, `.env` fajlove i `venv`, i svako ko ima kopiju repoa može ih izvući.
> Prepisivanje istorije je **nepovratno** i menja hash svakog commita. Pročitaj celo uputstvo pre nego što kreneš.

## Šta se uklanja iz istorije

| Putanja | Zašto |
|---|---|
| `backend/data/Class_Diagram.db` | SQLite baza sa redovima u `klijent` (moguće stvarni lični i zdravstveni podaci) |
| `backend/Class_Diagram.db` | stara SQLite baza |
| `frontend/.env`, `frontend/.env.production` | Supabase URL i anon ključ, API URL |
| `backend/venv/` | ~5.000 fajlova, nepotrebno |
| `**/__pycache__/`, `*.pyc` | generisani fajlovi |
| `backend/.idea/` | podešavanja IDE-a |
| `backend/3.1.0` | prazan fajl nastao greškom pri `pip install` |

## 0. Pre početka

1. **Proceni curenje podataka.** Repo je na GitHubu (`aldonah-zero/crm-tool`), a postoji i fork (`IgorPavlov00/...`) iz kog su stizali PR-ovi. Ako je `.db` sadržao stvarne podatke klijenata i repo je bio javan ili deljen, to je potencijalni incident sa ličnim podacima (ZZPL/GDPR). Čišćenje istorije **ne poništava** to što je neko možda već klonirao repo.
2. **Rotiraj ključeve.** Anon ključ je ionako javan (završava u frontend bundle-u), ali ako je ikad bilo commitovano nešto drugo (service role key, Resend ključ, lozinka baze), rotiraj ih u Supabase i Resend dashboardu **bez obzira na čišćenje istorije**.
3. **Dogovori se sa svima koji rade na repou.** Posle force-pusha svi moraju ponovo da kloniraju repo. Stari klonovi bi, ako se pushuju, vratili obrisane fajlove.
4. **Spoji ili zatvori otvorene PR-ove i grane**, uključujući `security-fixes`. Prepisana istorija se ne slaže sa starim granama.
5. **Napravi rezervnu kopiju** (mirror) na sigurnom, lokalnom mestu, ne na GitHubu:
   ```bash
   git clone --mirror https://github.com/aldonah-zero/crm-tool.git crm-tool-backup.git
   ```
   Ova kopija sadrži osetljive fajlove. Obriši je kad potvrdiš da je sve u redu.

## 1. Instaliraj git-filter-repo

```bash
pip install git-filter-repo
git filter-repo --version
```
(`git filter-branch` je zastareo i spor, pa ga ne koristi.)

## 2. Prepiši istoriju na svežem mirror klonu

```bash
git clone --mirror https://github.com/aldonah-zero/crm-tool.git crm-tool-clean.git
cd crm-tool-clean.git

git filter-repo --invert-paths \
  --path backend/data/Class_Diagram.db \
  --path backend/Class_Diagram.db \
  --path frontend/.env \
  --path frontend/.env.production \
  --path backend/venv/ \
  --path backend/.idea/ \
  --path backend/3.1.0 \
  --path-glob '*/__pycache__/*' \
  --path-glob '*.pyc'
```

## 3. Proveri rezultat pre pusha

```bash
# Mora biti prazno:
git log --all --oneline -- backend/data/Class_Diagram.db frontend/.env frontend/.env.production backend/venv
git rev-list --all --objects | grep -E '\.db$|\.env(\.|$)|/venv/|__pycache__|\.pyc$|3\.1\.0$'

# Veličina repoa bi trebalo osetno da padne:
git count-objects -vH
```

## 4. Force push

`filter-repo` uklanja `origin` iz bezbednosnih razloga, pa ga vrati i pushuj:

```bash
git remote add origin https://github.com/aldonah-zero/crm-tool.git
git push origin --force --mirror
```
Ako je `main` zaštićen (branch protection), privremeno dozvoli force push u GitHub → Settings → Branches, pa zaštitu vrati posle pusha.

## 5. Isto uradi na forku

Fork (`IgorPavlov00/crm-tool` ili kako se već zove) ima **sopstvenu kopiju cele istorije**. Ponovi korake 2–4 nad njim ili ga obriši i napravi novi fork od očišćenog repoa.

## 6. GitHub keš i PR referencije

- GitHub čuva referencije `refs/pull/*` za sve stare PR-ove (#1–#40), i one i dalje pokazuju na stare commitove sa osetljivim fajlovima. Njih ne možeš obrisati sam.
- Otvori zahtev za **GitHub Support** („Remove sensitive data", navedi repo i putanje fajlova). Oni brišu keširane poglede i PR referencije. Vidi: <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository>
- Ako su na Renderu ili u nekom CI-u keširani stari buildovi, očisti i njih.

## 7. Posle čišćenja (svi saradnici)

```bash
# Obriši stari klon i kloniraj ponovo - NE radi pull/merge u starom klonu
git clone https://github.com/aldonah-zero/crm-tool.git
```
Lokalne fajlove koji više nisu u gitu napravi ponovo:
- `frontend/.env` iz `frontend/.env.example`
- `backend/venv`: `python -m venv venv && venv/Scripts/pip install -r requirements.txt`
- lokalnu SQLite bazu backend pravi sam pri prvom pokretanju

Na kraju obriši rezervni mirror iz koraka 0.5 kad potvrdiš da sve radi.
