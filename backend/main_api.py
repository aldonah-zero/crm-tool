import uvicorn
import os, json
import time as time_module
import hmac, hashlib, base64
import logging
from datetime import datetime, timedelta, time as dt_time, date
from collections import Counter
from fastapi import Depends, FastAPI, HTTPException, Request, status, Body, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import create_engine, text, or_, func
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.exc import SQLAlchemyError, IntegrityError, OperationalError, ProgrammingError
from pydantic_classes import *
from sql_alchemy import *
import io
import csv
import codecs
import jwt
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
import resend
import os

resend.api_key = os.getenv("RESEND_API_KEY")

# Secret used to sign team-invite tokens (set INVITE_SECRET in production envs)
INVITE_SECRET = os.getenv("INVITE_SECRET", "dev-insecure-invite-secret-change-me")
INVITE_TOKEN_TTL_SECONDS = 7 * 24 * 3600  # invite links are valid for 7 days

# Shared secret the external reminder cron (see .github/workflows) must send
# as X-Internal-Secret to trigger /internal/send-reminders. Unset in prod = disabled.
INTERNAL_CRON_SECRET = os.getenv("INTERNAL_CRON_SECRET")

# Where public "Find a Therapist" booking requests get emailed for manual
# review/assignment (see public_book_session below).
PUBLIC_INTAKE_NOTIFY_EMAIL = os.getenv("PUBLIC_INTAKE_NOTIFY_EMAIL", "czmzns@gmail.com")

############################################
#
#   Initialize the database
#
############################################
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://crm-tool-frontend-e885b1.onrender.com",
]
def get_tenant_id(request: Request) -> int:
    """
    Resolve the caller's practice (tenant) from their verified login token.
    Every practice-data endpoint uses this via Depends().

    The X-Tenant-ID header the frontend sends is deliberately NOT trusted:
    it is just a number anyone could change, so trusting it would let one
    practice (or an anonymous caller) read another practice's clients.
    """
    supabase_user_id = get_verified_supabase_user_id(request)

    database = SessionLocal()
    try:
        profile = database.query(UserProfile).filter(
            UserProfile.supabase_user_id == supabase_user_id
        ).first()
        if not profile:
            raise HTTPException(status_code=401, detail="No profile for this account")
        if not profile.is_approved:
            raise HTTPException(status_code=403, detail="Account pending approval")
        return profile.tenant_id
    finally:
        database.close()


def run_light_migrations(engine):
    """Add columns introduced after the initial deploy. create_all() only
    creates missing TABLES, not missing columns on tables that already
    exist, so new nullable columns are added here instead - idempotent,
    safe to run on every startup."""
    statements = [
        "ALTER TABLE tenant ADD COLUMN specialties TEXT",
        "ALTER TABLE tenant ADD COLUMN working_hours TEXT",
        "ALTER TABLE tenant ADD COLUMN default_price FLOAT",
        "ALTER TABLE sesija ADD COLUMN reminder_sent BOOLEAN DEFAULT FALSE",
        "ALTER TABLE tenant ADD COLUMN trial_ends_at TIMESTAMP",
        "ALTER TABLE tenant ADD COLUMN subscription_paid_until TIMESTAMP",
        "ALTER TABLE tenant ADD COLUMN photo_url TEXT",
        "ALTER TABLE client_account ADD COLUMN photo_url TEXT",
        # Admin area (Mental Health Center management)
        "ALTER TABLE user_profile ADD COLUMN active BOOLEAN DEFAULT TRUE",
        "ALTER TABLE user_profile ADD COLUMN is_admin BOOLEAN",
        "ALTER TABLE user_profile ADD COLUMN is_approved BOOLEAN",
        "ALTER TABLE klijent ADD COLUMN gender VARCHAR(20)",
        "ALTER TABLE klijent ADD COLUMN status VARCHAR(20)",
        "ALTER TABLE klijent ADD COLUMN therapist_id INTEGER",
        "ALTER TABLE klijent ADD COLUMN date_started DATE",
        "ALTER TABLE klijent ADD COLUMN date_completed DATE",
        "ALTER TABLE klijent ADD COLUMN created_at TIMESTAMP",
        "ALTER TABLE klijent ADD COLUMN updated_at TIMESTAMP",
        "ALTER TABLE sesija ADD COLUMN therapist_id INTEGER",
        "ALTER TABLE sesija ADD COLUMN is_free BOOLEAN",
        "CREATE INDEX IF NOT EXISTS ix_klijent_status ON klijent (status)",
        "CREATE INDEX IF NOT EXISTS ix_klijent_therapist_id ON klijent (therapist_id)",
        "CREATE INDEX IF NOT EXISTS ix_sesija_therapist_id ON sesija (therapist_id)",
        "CREATE INDEX IF NOT EXISTS ix_sesija_pocetak ON sesija (pocetak)",
    ]
    with engine.connect() as conn:
        for stmt in statements:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except (OperationalError, ProgrammingError):
                conn.rollback()

        # Grandfather every tenant that existed before billing was added -
        # give them a fresh 30-day trial from now instead of locking them
        # out immediately. Only touches rows still NULL, so it's a no-op
        # on every startup after the first.
        try:
            trial_end = datetime.utcnow() + timedelta(days=30)
            conn.execute(
                text("UPDATE tenant SET trial_ends_at = :end WHERE trial_ends_at IS NULL"),
                {"end": trial_end},
            )
            conn.commit()
        except (OperationalError, ProgrammingError):
            conn.rollback()

        # Backfill defaults for rows that existed before the admin area was
        # added, so old data behaves consistently with newly-created rows.
        # NOTE: is_admin is deliberately NOT backfilled from role == 'owner'
        # here - admin access must always be explicit (BOOTSTRAP_ADMIN_EMAIL
        # below, or an existing admin promoting someone in the admin area),
        # never inherited automatically by every tenant's owner.
        backfill_statements = [
            "UPDATE user_profile SET active = TRUE WHERE active IS NULL",
            "UPDATE user_profile SET is_admin = FALSE WHERE is_admin IS NULL",
            # Opposite direction from is_admin: existing accounts are already
            # in active use, so they're grandfathered as approved. Only rows
            # created after this migration default to False (pending) via
            # the ORM column default - see register_profile/login_profile/
            # join_tenant below, which never pass is_approved explicitly.
            "UPDATE user_profile SET is_approved = TRUE WHERE is_approved IS NULL",
            "UPDATE klijent SET status = 'active' WHERE status IS NULL",
            "UPDATE klijent SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL",
            "UPDATE klijent SET updated_at = created_at WHERE updated_at IS NULL",
        ]
        for stmt in backfill_statements:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except (OperationalError, ProgrammingError):
                conn.rollback()

        # One-time corrective reset: an earlier version of this migration
        # mistakenly granted is_admin=TRUE to every tenant's owner. Set
        # RESET_ALL_ADMIN_ACCESS=true once to wipe that out (BOOTSTRAP_ADMIN_EMAIL
        # below re-grants it to the one account that should have it, in the
        # same startup), then unset this env var again so a legitimate future
        # promotion via the admin area doesn't get wiped on the next restart.
        if os.getenv("RESET_ALL_ADMIN_ACCESS") == "true":
            try:
                conn.execute(text("UPDATE user_profile SET is_admin = FALSE"))
                conn.commit()
            except (OperationalError, ProgrammingError):
                conn.rollback()

        # Guaranteed-admin bootstrap: if set, this email is always forced
        # to is_admin = TRUE on every startup, regardless of what's in the
        # database - a "break glass" way to guarantee a specific person
        # has admin access without ever needing direct database access.
        # Runs unconditionally (not just when NULL), so as long as this
        # env var is set, nothing (a UI demote, a bad migration, a stale
        # backup) can lock that email out of the admin area. Unset it once
        # you no longer want that guarantee.
        bootstrap_admin_email = os.getenv("BOOTSTRAP_ADMIN_EMAIL")
        if bootstrap_admin_email:
            try:
                conn.execute(
                    text("UPDATE user_profile SET is_admin = TRUE WHERE LOWER(email) = LOWER(:email)"),
                    {"email": bootstrap_admin_email},
                )
                conn.commit()
            except (OperationalError, ProgrammingError):
                conn.rollback()

        # Historical clients/sessions predate the therapist_id column, so
        # they're unassigned by default - which starved the leaderboards
        # of any data. Where a tenant has exactly one team member, the
        # assignment is unambiguous, so backfill it automatically; tenants
        # with several members need a human to assign each client (no
        # historical record of who actually saw whom exists to infer it).
        solo_tenant_backfill_statements = [
            """
            UPDATE klijent SET therapist_id = (
                SELECT up.id FROM user_profile up WHERE up.tenant_id = klijent.tenant_id
            )
            WHERE therapist_id IS NULL
            AND (SELECT COUNT(*) FROM user_profile up2 WHERE up2.tenant_id = klijent.tenant_id) = 1
            """,
            """
            UPDATE sesija SET therapist_id = (
                SELECT up.id FROM user_profile up WHERE up.tenant_id = sesija.tenant_id
            )
            WHERE therapist_id IS NULL
            AND (SELECT COUNT(*) FROM user_profile up2 WHERE up2.tenant_id = sesija.tenant_id) = 1
            """,
        ]
        for stmt in solo_tenant_backfill_statements:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except (OperationalError, ProgrammingError):
                conn.rollback()


# First supervision dates every therapist should see. Only seeded while the
# table is still empty, so events the admin later edits/deletes stay that way.
DEFAULT_SUPERVISION_EVENTS = [
    (datetime(2026, 10, 30, 18, 0), "Prva grupa supervizije"),
    (datetime(2026, 11, 30, 18, 0), "Druga grupa supervizije"),
]


def seed_default_supervision_events(session_factory):
    db = session_factory()
    try:
        if db.query(SupervisionEvent).first() is None:
            for starts_at, title in DEFAULT_SUPERVISION_EVENTS:
                db.add(SupervisionEvent(title=title, type="supervizija", starts_at=starts_at))
        else:
            # Rename the default events if they were seeded under the old
            # generic "Supervizija" title (and the admin hasn't renamed them).
            for starts_at, title in DEFAULT_SUPERVISION_EVENTS:
                db.query(SupervisionEvent).filter(
                    SupervisionEvent.starts_at == starts_at,
                    SupervisionEvent.title == "Supervizija",
                ).update({"title": title})
        db.commit()
    except SQLAlchemyError:
        db.rollback()
    finally:
        db.close()


def init_db():
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/Class_Diagram.db")

    if DATABASE_URL.startswith("sqlite"):
        os.makedirs("data", exist_ok=True)
        engine = create_engine(
            DATABASE_URL,
            connect_args={"check_same_thread": False}
        )
    else:
        # SQLAlchemy 2.1 defaults plain postgresql:// URLs to psycopg (v3),
        # but we ship psycopg2 - name the driver explicitly.
        for prefix in ("postgres://", "postgresql://"):
            if DATABASE_URL.startswith(prefix):
                DATABASE_URL = "postgresql+psycopg2://" + DATABASE_URL[len(prefix):]
                break
        engine = create_engine(
            DATABASE_URL,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True
        )

    SessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine
    )

    Base.metadata.create_all(bind=engine)
    run_light_migrations(engine)
    seed_default_supervision_events(SessionLocal)

    return SessionLocal


app = FastAPI(
    title="Class_Diagram API",
    description="Auto-generated REST API with full CRUD operations, relationship management, and advanced features",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "System", "description": "System health and statistics"},
        {"name": "Cena", "description": "Operations for Cena entities"},
        {"name": "Cena Relationships", "description": "Manage Cena relationships"},
        {"name": "SesijaGrupa", "description": "Operations for SesijaGrupa entities"},
        {"name": "SesijaGrupa Relationships", "description": "Manage SesijaGrupa relationships"},
        {"name": "SesijaKlijent", "description": "Operations for SesijaKlijent entities"},
        {"name": "SesijaKlijent Relationships", "description": "Manage SesijaKlijent relationships"},
        {"name": "Sesija", "description": "Operations for Sesija entities"},
        {"name": "Sesija Relationships", "description": "Manage Sesija relationships"},
        {"name": "Grupa", "description": "Operations for Grupa entities"},
        {"name": "Grupa Relationships", "description": "Manage Grupa relationships"},
        {"name": "GrupaKlijent", "description": "Operations for GrupaKlijent (members of groups)"},
        {"name": "Klijent", "description": "Operations for Klijent entities"},
        {"name": "Klijent Relationships", "description": "Manage Klijent relationships"},
    ]
)


def format_datetime(dt):
    return dt.strftime("%d.%m.%Y %H:%M")


def format_date_long(dt):
    days = ["ponedeljak", "utorak", "sreda", "četvrtak", "petak", "subota", "nedelja"]
    months = ["januar", "februar", "mart", "april", "maj", "jun", "jul", "avgust", "septembar", "oktobar", "novembar", "decembar"]
    return f"{days[dt.weekday()]}, {dt.day}. {months[dt.month - 1]} {dt.year}."


def format_time(dt):
    return dt.strftime("%H:%M")


def resolve_therapist_email(tenant_id, therapist_id, database) -> Optional[str]:
    """Who the "session created/updated/deleted" notification copy should
    go to: the session's assigned therapist, falling back to the tenant
    owner if it has none assigned. Returns None if neither has an email on
    file, so callers can skip that send instead of mailing a hardcoded
    address."""
    therapist = None
    if therapist_id:
        therapist = database.query(UserProfile).filter(UserProfile.id == therapist_id).first()
    if not therapist:
        therapist = database.query(UserProfile).filter(
            UserProfile.tenant_id == tenant_id, UserProfile.role == "owner"
        ).first()
    return therapist.email if therapist else None


def send_session_email(action, client_name, pocetak, kraj, cena, client_email=None, therapist_email=None):

    config = {
        "created": {
            "title": "Sesija zakazana",
            "greeting": "Vaša sesija je potvrđena!",
            "color": "#4f46e5",
            "icon": "✅"
        },
        "updated": {
            "title": "Sesija izmenjena",
            "greeting": "Vaša sesija je ažurirana.",
            "color": "#f59e0b",
            "icon": "✏️"
        },
        "deleted": {
            "title": "Sesija otkazana",
            "greeting": "Vaša sesija je otkazana.",
            "color": "#ef4444",
            "icon": "🗑️"
        }
    }

    c = config[action]
    app_url = os.getenv("APP_URL", "https://hrio-frontend-5c8704.onrender.com/")

    html = f"""
<div style="background:#f2f2f7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#1a1a1a;">
<div style="max-width:520px;margin:auto;">

<div style="background:#fff;border-radius:16px;padding:28px 24px 24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="font-size:22px;margin-bottom:8px;">{c['icon']} {c['title']}</div>
<div style="font-size:15px;color:#1a1a1a;margin-bottom:4px;">Zdravo, <strong>Maja</strong>.</div>
<div style="font-size:15px;color:#1a1a1a;margin-bottom:4px;">{c['greeting']}</div>
<div style="font-size:14px;color:#555;line-height:1.5;">Evo nekoliko detalja koje biste trebali znati o svojoj sesiji:</div>
</div>

<div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="border:1.5px dashed #d1d5db;border-radius:12px;padding:20px;">

<div style="font-size:15px;color:#333;margin-bottom:14px;">📅 <strong>{format_date_long(pocetak)}</strong></div>

<div style="font-size:15px;font-weight:700;color:#111;margin-bottom:2px;">Individualna sesija</div>
<div style="font-size:15px;font-weight:600;color:#111;margin-bottom:4px;">{format_time(pocetak)} – {format_time(kraj)}</div>
<div style="font-size:14px;color:#555;margin-bottom:16px;">{client_name} · {cena:,.2f} RSD</div>

<div style="border-top:1.5px dashed #d1d5db;margin:0 0 16px;"></div>

<table cellpadding="0" cellspacing="0" width="100%">
<tr><td style="font-size:14px;color:#333;padding:3px 0;"><strong>Ukupno:</strong></td><td style="font-size:14px;color:#333;padding:3px 0;text-align:right;"><strong>{cena:,.2f} RSD</strong></td></tr>
<tr><td style="font-size:14px;color:#333;padding:3px 0;"><strong>Status:</strong></td><td style="font-size:14px;color:#333;padding:3px 0;text-align:right;">{c['title']}</td></tr>
</table>

</div>
</div>

<div style="background:#fff;border-radius:16px;padding:20px 24px;margin-bottom:8px;text-align:center;box-shadow:0 1px 6px rgba(0,0,0,0.04);">

<div style="font-size:13px;color:#777;margin-bottom:14px;line-height:1.5;"><strong>Pravila otkazivanja i kašnjenja</strong><br>Vaša sesija može biti otkazana do <strong>24 sata</strong> pre termina. Ako kasnite više od <strong>10 minuta</strong>, sesija će se smatrati propuštenom.</div>

<a href="{app_url}" style="display:inline-block;padding:14px 36px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">Otvori aplikaciju</a>
</div>

<div style="text-align:center;font-size:13px;color:#9ca3af;margin-top:14px;line-height:1.5;">
Hvala vam što ste odabrali <strong style="color:#6b7280;">PsihApp</strong>.
</div>

</div>
</div>
"""

    if therapist_email:
        resend.Emails.send({
            "from": "Hrio <noreply@hrioapp.com>",
            "to": [therapist_email],
            "subject": f"{c['icon']} {c['title']} - {client_name}",
            "html": html
        })

    if client_email:
        client_html = f"""
    <div style="background:#f2f2f7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#1a1a1a;">
    <div style="max-width:520px;margin:auto;">

    <div style="background:#fff;border-radius:16px;padding:28px 24px 24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
    <div style="font-size:22px;margin-bottom:8px;">✅ Potvrda zakazane sesije</div>
    <div style="font-size:15px;color:#1a1a1a;margin-bottom:4px;">Poštovani/a <strong>{client_name}</strong>,</div>
    <div style="font-size:15px;color:#1a1a1a;margin-bottom:4px;">Vaša sesija je uspešno zakazana.</div>
    </div>

    <div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
    <div style="border:1.5px dashed #d1d5db;border-radius:12px;padding:20px;">

    <div style="font-size:15px;color:#333;margin-bottom:14px;">📅 <strong>{format_date_long(pocetak)}</strong></div>
    <div style="font-size:15px;font-weight:600;color:#111;margin-bottom:4px;">{format_time(pocetak)} – {format_time(kraj)}</div>

    <div style="border-top:1.5px dashed #d1d5db;margin:16px 0;"></div>

    <div style="font-size:14px;color:#555;line-height:1.6;">
    Molimo Vas da dođete <strong>5 minuta</strong> pre zakazanog termina.
    </div>

    </div>
    </div>

    <div style="background:#fff;border-radius:16px;padding:20px 24px;margin-bottom:8px;text-align:center;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
    <div style="font-size:13px;color:#777;line-height:1.5;"><strong>Pravila otkazivanja</strong><br>Sesija se može otkazati najkasnije <strong>24 sata</strong> pre termina.<br>Kašnjenje duže od <strong>10 minuta</strong> smatra se propuštenom sesijom.</div>
    </div>

    <div style="text-align:center;font-size:13px;color:#9ca3af;margin-top:14px;line-height:1.5;">
    Hvala vam na poverenju. <strong style="color:#6b7280;">PsihApp</strong>
    </div>

    </div>
    </div>
    """
        resend.Emails.send({
            "from": "Hrio <noreply@hrioapp.com>",
            "to": [client_email],
            "subject": f"✅ Potvrda sesije - {format_date_long(pocetak)}",
            "html": client_html
        })


def send_session_email_to_group(action, grupa_naziv, pocetak, kraj, cena, client_emails, therapist_email=None):
    config = {
        "created": {
            "title": "Grupna sesija zakazana",
            "greeting": "Vaša grupna sesija je potvrđena!",
            "icon": "✅"
        },
        "updated": {
            "title": "Grupna sesija izmenjena",
            "greeting": "Vaša grupna sesija je ažurirana.",
            "icon": "✏️"
        },
        "deleted": {
            "title": "Grupna sesija otkazana",
            "greeting": "Vaša grupna sesija je otkazana.",
            "icon": "🗑️"
        }
    }

    c = config[action]
    app_url = os.getenv("APP_URL", "https://hrio-frontend-5c8704.onrender.com/")

    psiholog_html = f"""
<div style="background:#f2f2f7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#1a1a1a;">
<div style="max-width:520px;margin:auto;">

<div style="background:#fff;border-radius:16px;padding:28px 24px 24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="font-size:22px;margin-bottom:8px;">{c['icon']} {c['title']}</div>
<div style="font-size:15px;color:#1a1a1a;margin-bottom:4px;">Zdravo, <strong>Maja</strong>.</div>
<div style="font-size:15px;color:#1a1a1a;margin-bottom:4px;">{c['greeting']}</div>
</div>

<div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="border:1.5px dashed #d1d5db;border-radius:12px;padding:20px;">

<div style="font-size:15px;color:#333;margin-bottom:14px;">📅 <strong>{format_date_long(pocetak)}</strong></div>

<div style="font-size:15px;font-weight:700;color:#111;margin-bottom:2px;">Grupna sesija — {grupa_naziv}</div>
<div style="font-size:15px;font-weight:600;color:#111;margin-bottom:4px;">{format_time(pocetak)} – {format_time(kraj)}</div>
<div style="font-size:14px;color:#555;margin-bottom:16px;">{cena:,.2f} RSD</div>

<div style="border-top:1.5px dashed #d1d5db;margin:0 0 16px;"></div>

<table cellpadding="0" cellspacing="0" width="100%">
<tr><td style="font-size:14px;color:#333;padding:3px 0;"><strong>Ukupno:</strong></td><td style="font-size:14px;color:#333;padding:3px 0;text-align:right;"><strong>{cena:,.2f} RSD</strong></td></tr>
<tr><td style="font-size:14px;color:#333;padding:3px 0;"><strong>Status:</strong></td><td style="font-size:14px;color:#333;padding:3px 0;text-align:right;">{c['title']}</td></tr>
</table>

</div>
</div>

<div style="text-align:center;font-size:13px;color:#9ca3af;margin-top:14px;line-height:1.5;">
<strong style="color:#6b7280;">PsihApp</strong>
</div>

</div>
</div>
"""

    if therapist_email:
        resend.Emails.send({
            "from": "Hrio <noreply@hrioapp.com>",
            "to": [therapist_email],
            "subject": f"{c['icon']} {c['title']} - {grupa_naziv}",
            "html": psiholog_html
        })

    for member in client_emails:
        if not member.get("email"):
            continue

        member_name = member.get("name", "Poštovani/a")

        member_html = f"""
    <div style="background:#f2f2f7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#1a1a1a;">
    <div style="max-width:520px;margin:auto;">

    <div style="background:#fff;border-radius:16px;padding:28px 24px 24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
    <div style="font-size:22px;margin-bottom:8px;">{c['icon']} {c['title']}</div>
    <div style="font-size:15px;color:#1a1a1a;margin-bottom:4px;">Poštovani/a <strong>{member_name}</strong>,</div>
    <div style="font-size:15px;color:#1a1a1a;margin-bottom:4px;">{c['greeting']}</div>
    </div>

    <div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
    <div style="border:1.5px dashed #d1d5db;border-radius:12px;padding:20px;">

    <div style="font-size:15px;color:#333;margin-bottom:14px;">📅 <strong>{format_date_long(pocetak)}</strong></div>
    <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:2px;">Grupna sesija — {grupa_naziv}</div>
    <div style="font-size:15px;font-weight:600;color:#111;margin-bottom:4px;">{format_time(pocetak)} – {format_time(kraj)}</div>

    <div style="border-top:1.5px dashed #d1d5db;margin:16px 0;"></div>

    <div style="font-size:14px;color:#555;line-height:1.6;">
    Molimo Vas da dođete <strong>5 minuta</strong> pre zakazanog termina.
    </div>

    </div>
    </div>

    <div style="background:#fff;border-radius:16px;padding:20px 24px;margin-bottom:8px;text-align:center;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
    <div style="font-size:13px;color:#777;line-height:1.5;"><strong>Pravila otkazivanja</strong><br>Sesija se može otkazati najkasnije <strong>24 sata</strong> pre termina.<br>Kašnjenje duže od <strong>10 minuta</strong> smatra se propuštenom sesijom.</div>
    </div>

    <div style="text-align:center;font-size:13px;color:#9ca3af;margin-top:14px;line-height:1.5;">
    Hvala vam na poverenju. <strong style="color:#6b7280;">PsihApp</strong>
    </div>

    </div>
    </div>
    """
        resend.Emails.send({
            "from": "Hrio <noreply@hrioapp.com>",
            "to": [member["email"]],
            "subject": f"✅ Potvrda grupne sesije - {format_date_long(pocetak)}",
            "html": member_html
        })


# Enable CORS for all origins (for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

############################################
#
#   Middleware
#
############################################

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Incoming request: {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"Response status: {response.status_code}")
    return response


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time_module.time()
    response = await call_next(request)
    process_time = time_module.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response

############################################
#
#   Exception Handlers
#
############################################

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"error": "Bad Request", "message": str(exc), "detail": "Invalid input data provided"}
    )


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    logger.error(f"Database integrity error: {exc}")
    error_detail = str(exc.orig) if hasattr(exc, 'orig') else str(exc)
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"error": "Conflict", "message": "Data conflict occurred", "detail": error_detail}
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError):
    logger.error(f"Database error: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "Internal Server Error", "message": "Database operation failed", "detail": "An internal database error occurred"}
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail if isinstance(exc.detail, str) else "HTTP Error", "message": exc.detail, "detail": f"HTTP {exc.status_code} error occurred"}
    )


# Initialize database session
SessionLocal = init_db()


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        logger.error("Database session rollback due to exception")
        raise
    finally:
        db.close()


# Monthly subscription price shown on the paywall, and the manual bank
# transfer details a therapist pays into. No card processor yet - see
# /internal/mark-subscription-paid for how a payment actually gets applied.
SUBSCRIPTION_PRICE_RSD = int(os.getenv("SUBSCRIPTION_PRICE_RSD", "1500"))
SUBSCRIPTION_BANK_ACCOUNT = os.getenv("SUBSCRIPTION_BANK_ACCOUNT", "")
SUBSCRIPTION_BANK_RECIPIENT = os.getenv("SUBSCRIPTION_BANK_RECIPIENT", "PsihoApp")

# Secret for administrative billing actions (marking a tenant as paid).
# Set ADMIN_SECRET in production; unset = the endpoint always 401s.
ADMIN_SECRET = os.getenv("ADMIN_SECRET")


def has_active_subscription(tenant: "Tenant", now: datetime | None = None) -> bool:
    # Trial/paywall temporarily disabled - every tenant has full access until
    # billing is implemented. Restore the checks below to re-enable it.
    return True
    # now = now or datetime.utcnow()
    # if tenant.trial_ends_at and now < tenant.trial_ends_at:
    #     return True
    # if tenant.subscription_paid_until and now < tenant.subscription_paid_until:
    #     return True
    # return False


def require_active_subscription(
        tenant_id: int = Depends(get_tenant_id),
        database: Session = Depends(get_db),
) -> int:
    """Drop-in replacement for get_tenant_id on the core practice-management
    endpoints (clients/groups/sessions/payments) - same return value, but
    also 402s once the trial has ended and no payment has been confirmed.
    Deliberately not used on /tenant/settings, /auth/*, or the public
    client-facing endpoints, which stay reachable regardless of billing."""
    tenant = database.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if not has_active_subscription(tenant):
        raise HTTPException(
            status_code=402,
            detail="Vaš probni period ili pretplata je istekla. Obnovite pretplatu da nastavite.",
        )
    return tenant_id


############################################
#
#   Admin authorization
#
#   Every other endpoint in this file trusts the client-supplied
#   X-Tenant-ID header (see get_tenant_id above) - a pre-existing trust
#   model this change does not touch. The admin area below is more
#   sensitive (center-wide statistics, every therapist's clients), so it
#   is held to a stricter standard: the caller's Supabase session token is
#   verified server-side (signature + expiry), the tenant/role are read
#   from the verified profile in the database - never from a header - and
#   a non-owner or unauthenticated caller is rejected before any query runs.
#
############################################

# Modern Supabase projects sign session tokens with an asymmetric key
# (ES256) rather than a shared HS256 secret, published at this project's
# JWKS endpoint - the standard, rotation-safe way to verify them (each
# token names which key signed it via its "kid" header; PyJWKClient
# fetches/caches the matching public key and never needs a secret at all).
SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SUPABASE_ISSUER = f"{SUPABASE_URL}/auth/v1" if SUPABASE_URL else None
_jwks_client = jwt.PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json") if SUPABASE_URL else None

# Legacy HS256 shared secret - only used as a fallback for projects that
# haven't migrated to JWKS/asymmetric signing keys, or if SUPABASE_URL
# isn't configured. Prefer setting SUPABASE_URL instead.
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")


def get_verified_supabase_claims(request: Request) -> dict:
    """Verifies the bearer token's signature, expiry, audience and issuer,
    and returns the verified `sub` claim (the Supabase auth user id).
    Never trusts an unverified/self-reported id. Tries Supabase's JWKS
    (ES256/RS256) first, then falls back to the legacy HS256 shared
    secret if configured."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header[len("Bearer "):].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = None

    if _jwks_client:
        try:
            signing_key = _jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience="authenticated",
                issuer=SUPABASE_ISSUER,
            )
        except jwt.PyJWTError:
            payload = None

    if payload is None and SUPABASE_JWT_SECRET:
        try:
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        except jwt.PyJWTError:
            payload = None

    if payload is None:
        if not _jwks_client and not SUPABASE_JWT_SECRET:
            # Misconfiguration, not an anonymous caller - fail closed rather
            # than silently trusting the token, but surface it distinctly
            # in logs. Set SUPABASE_URL (preferred) or SUPABASE_JWT_SECRET.
            logger.error("Neither SUPABASE_URL nor SUPABASE_JWT_SECRET is set - admin auth cannot verify tokens")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload


def get_verified_supabase_user_id(request: Request) -> str:
    return get_verified_supabase_claims(request)["sub"]


def require_admin(
        request: Request,
        database: Session = Depends(get_db),
) -> "UserProfile":
    """Admin-only dependency for the /admin/* routes. Resolves the caller
    from a verified bearer token (never a client-supplied header/body id),
    and requires is_admin == True within their own tenant. Deliberately
    NOT gated on role == 'owner': owner is just whoever created the
    tenant and may themselves be a practicing psychotherapist, so
    is_admin is tracked as its own independent permission (see
    UserProfile.is_admin in sql_alchemy.py) - a psychotherapist can never
    reach the admin area just by being an owner or by joining via an
    invite link. Returns the UserProfile row so endpoints read
    tenant_id/user id from it directly."""
    supabase_user_id = get_verified_supabase_user_id(request)

    profile = database.query(UserProfile).filter(
        UserProfile.supabase_user_id == supabase_user_id
    ).first()
    if not profile:
        raise HTTPException(status_code=401, detail="No profile for this account")

    if not profile.is_approved:
        raise HTTPException(status_code=403, detail="Account pending approval")

    if not profile.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    tenant = database.query(Tenant).filter(Tenant.id == profile.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if not has_active_subscription(tenant):
        raise HTTPException(
            status_code=402,
            detail="Vaš probni period ili pretplata je istekla. Obnovite pretplatu da nastavite.",
        )

    return profile


def get_current_member_soft(request: Request, tenant_id: int, database: Session) -> Optional["UserProfile"]:
    """Best-effort resolution of the team member actually making a regular
    (non-admin) request, from their verified bearer token - used to
    auto-attribute clients/sessions they create to themselves, so the
    admin area's per-therapist stats reflect real activity instead of
    everything staying unassigned. Never raises: a missing/invalid token,
    or one that doesn't match a profile in the given tenant, just means no
    attribution happens - callers must keep working exactly as before for
    anyone not sending a recognizable token."""
    try:
        supabase_user_id = get_verified_supabase_user_id(request)
    except HTTPException:
        return None
    return database.query(UserProfile).filter(
        UserProfile.supabase_user_id == supabase_user_id,
        UserProfile.tenant_id == tenant_id,
    ).first()


@app.get("/tenant/subscription", tags=["Tenant"])
def get_tenant_subscription(
        tenant_id: int = Depends(get_tenant_id),
        database: Session = Depends(get_db),
):
    """Reachable even when the subscription has lapsed - the frontend needs
    this to render the paywall and payment instructions."""
    tenant = database.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    now = datetime.utcnow()
    active = has_active_subscription(tenant, now)
    if tenant.subscription_paid_until and now < tenant.subscription_paid_until:
        current_status = "active"
    elif tenant.trial_ends_at and now < tenant.trial_ends_at:
        current_status = "trial"
    else:
        current_status = "expired"

    return {
        "status": current_status,
        "active": active,
        "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
        "subscription_paid_until": tenant.subscription_paid_until.isoformat() if tenant.subscription_paid_until else None,
        "payment_instructions": {
            "amount_rsd": SUBSCRIPTION_PRICE_RSD,
            "bank_account": SUBSCRIPTION_BANK_ACCOUNT,
            "recipient": SUBSCRIPTION_BANK_RECIPIENT,
            "reference": f"TENANT-{tenant_id}",
        },
    }


@app.post("/internal/mark-subscription-paid", tags=["System"])
def mark_subscription_paid(
        tenant_id: int = Body(...),
        months: int = Body(1),
        x_admin_secret: str = Header(None, alias="X-Admin-Secret"),
        database: Session = Depends(get_db),
):
    """Manually called by the app owner after confirming a bank transfer
    arrived. Extends from whichever is later - now, or the tenant's current
    paid-until date - so renewing early doesn't lose the remaining days."""
    if not ADMIN_SECRET or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    tenant = database.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    now = datetime.utcnow()
    base = tenant.subscription_paid_until if tenant.subscription_paid_until and tenant.subscription_paid_until > now else now
    tenant.subscription_paid_until = base + timedelta(days=30 * months)
    database.commit()

    return {
        "tenant_id": tenant_id,
        "subscription_paid_until": tenant.subscription_paid_until.isoformat(),
    }

############################################
#
#   Global API endpoints
#
############################################

@app.get("/", tags=["System"])
def root():
    return {"name": "Class_Diagram API", "version": "1.0.0", "status": "running"}


@app.get("/health", tags=["System"])
def health_check(database: Session = Depends(get_db)):
    """Also used as a keep-alive ping (see .github/workflows/keep-alive.yml) -
    runs a real query so it keeps the database connection warm too, not just
    the web process."""
    from datetime import datetime
    try:
        database.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        logger.error(f"Health check DB query failed: {e}")
        db_status = "error"
    return {"status": "healthy", "timestamp": datetime.now().isoformat(), "database": db_status}


@app.get("/statistics", tags=["System"])
def get_statistics(
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    stats = {}
    stats["cena_count"] = database.query(Cena).filter(Cena.tenant_id == tenant_id).count()
    stats["sesijagrupa_count"] = database.query(SesijaGrupa).filter(SesijaGrupa.tenant_id == tenant_id).count()
    stats["sesijaklijent_count"] = database.query(SesijaKlijent).filter(SesijaKlijent.tenant_id == tenant_id).count()
    stats["sesija_count"] = database.query(Sesija).filter(Sesija.tenant_id == tenant_id).count()
    stats["grupa_count"] = database.query(Grupa).filter(Grupa.tenant_id == tenant_id).count()
    stats["klijent_count"] = database.query(Klijent).filter(Klijent.tenant_id == tenant_id).count()
    stats["grupaklijent_count"] = database.query(GrupaKlijent).filter(GrupaKlijent.tenant_id == tenant_id).count()
    stats["total_entities"] = sum(stats.values())
    return stats


############################################
#
#   Cena functions
#
############################################

@app.get("/cena/", response_model=None, tags=["Cena"])
def get_all_cena(
    tenant_id: int = Depends(require_active_subscription),
    detailed: bool = False,
    database: Session = Depends(get_db)
) -> list:

    from sqlalchemy.orm import joinedload

    if detailed:
        query = database.query(Cena).filter(Cena.tenant_id == tenant_id)
        query = query.options(joinedload(Cena.sesija_2))
        query = query.options(joinedload(Cena.klijent_1))
        cena_list = query.all()

        result = []
        for cena_item in cena_list:
            item_dict = cena_item.__dict__.copy()
            item_dict.pop('_sa_instance_state', None)

            if cena_item.sesija_2 and cena_item.sesija_2.tenant_id == tenant_id:
                related_dict = cena_item.sesija_2.__dict__.copy()
                related_dict.pop('_sa_instance_state', None)
                item_dict['sesija_2'] = related_dict
            else:
                item_dict['sesija_2'] = None

            if cena_item.klijent_1 and cena_item.klijent_1.tenant_id == tenant_id:
                related_dict = cena_item.klijent_1.__dict__.copy()
                related_dict.pop('_sa_instance_state', None)
                item_dict['klijent_1'] = related_dict
            else:
                item_dict['klijent_1'] = None

            result.append(item_dict)
        return result

    else:
        return database.query(Cena).filter(Cena.tenant_id == tenant_id).all()


@app.get("/cena/count/", response_model=None, tags=["Cena"])
def get_count_cena(
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> dict:
    return {"count": database.query(Cena).filter(Cena.tenant_id == tenant_id).count()}


@app.get("/cena/paginated/", response_model=None, tags=["Cena"])
def get_paginated_cena(
    tenant_id: int = Depends(require_active_subscription),
    skip: int = 0,
    limit: int = 100,
    detailed: bool = False,
    database: Session = Depends(get_db)
) -> dict:
    total = database.query(Cena).filter(Cena.tenant_id == tenant_id).count()
    cena_list = database.query(Cena).filter(Cena.tenant_id == tenant_id).offset(skip).limit(limit).all()
    return {"total": total, "skip": skip, "limit": limit, "data": cena_list}


@app.get("/cena/search/", response_model=None, tags=["Cena"])
def search_cena(
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> list:
    return database.query(Cena).filter(Cena.tenant_id == tenant_id).all()


@app.get("/cena/{cena_id}/", response_model=None, tags=["Cena"])
async def get_cena(
    cena_id: int,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> Cena:
    db_cena = database.query(Cena).filter(Cena.id == cena_id, Cena.tenant_id == tenant_id).first()
    if db_cena is None:
        raise HTTPException(status_code=404, detail="Cena not found")
    return {"cena": db_cena}


@app.post("/cena/", response_model=None, tags=["Cena"])
async def create_cena(
    cena_data: CenaCreate,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> Cena:

    if cena_data.sesija_2 is not None:
        db_sesija_2 = database.query(Sesija).filter(Sesija.id == cena_data.sesija_2, Sesija.tenant_id == tenant_id).first()
        if not db_sesija_2:
            raise HTTPException(status_code=400, detail="Sesija not found")
    else:
        raise HTTPException(status_code=400, detail="Sesija ID is required")

    if cena_data.klijent_1 is not None:
        db_klijent_1 = database.query(Klijent).filter(Klijent.id == cena_data.klijent_1, Klijent.tenant_id == tenant_id).first()
        if not db_klijent_1:
            raise HTTPException(status_code=400, detail="Klijent not found")
    else:
        raise HTTPException(status_code=400, detail="Klijent ID is required")

    cena_kwargs = dict(
        tenant_id=tenant_id,
        cena=cena_data.cena,
        status=cena_data.status,
        nacin_placanja=cena_data.nacin_placanja,
        datum_uplate=cena_data.datum_uplate,
        sesija_2_id=cena_data.sesija_2,
        klijent_1_id=cena_data.klijent_1
    )
    if cena_data.id is not None:
        cena_kwargs["id"] = cena_data.id

    db_cena = Cena(**cena_kwargs)
    database.add(db_cena)
    database.commit()
    database.refresh(db_cena)
    return db_cena


@app.post("/cena/bulk/", response_model=None, tags=["Cena"])
async def bulk_create_cena(
    items: list[CenaCreate],
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> dict:
    created_items = []
    errors = []

    for idx, item_data in enumerate(items):
        try:
            if not item_data.sesija_2:
                raise ValueError("Sesija ID is required")
            if not item_data.klijent_1:
                raise ValueError("Klijent ID is required")

            db_cena = Cena(
                tenant_id=tenant_id,
                cena=item_data.cena,
                id=item_data.id,
                status=item_data.status,
                nacin_placanja=item_data.nacin_placanja,
                datum_uplate=item_data.datum_uplate,
                sesija_2_id=item_data.sesija_2,
                klijent_1_id=item_data.klijent_1
            )
            database.add(db_cena)
            database.flush()
            created_items.append(db_cena.id)
        except Exception as e:
            errors.append({"index": idx, "error": str(e)})

    if errors:
        database.rollback()
        raise HTTPException(status_code=400, detail={"message": "Bulk creation failed", "errors": errors})

    database.commit()
    return {"created_count": len(created_items), "created_ids": created_items, "message": f"Successfully created {len(created_items)} Cena entities"}


@app.delete("/cena/bulk/", response_model=None, tags=["Cena"])
async def bulk_delete_cena(
    ids: list[int],
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> dict:
    deleted_count = 0
    not_found = []

    for item_id in ids:
        db_cena = database.query(Cena).filter(Cena.id == item_id, Cena.tenant_id == tenant_id).first()
        if db_cena:
            database.delete(db_cena)
            deleted_count += 1
        else:
            not_found.append(item_id)

    database.commit()
    return {"deleted_count": deleted_count, "not_found": not_found, "message": f"Successfully deleted {deleted_count} Cena entities"}


@app.put("/cena/{cena_id}/", response_model=None, tags=["Cena"])
async def update_cena(
    cena_id: int,
    cena_data: CenaCreate,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> Cena:
    db_cena = database.query(Cena).filter(Cena.id == cena_id, Cena.tenant_id == tenant_id).first()
    if db_cena is None:
        raise HTTPException(status_code=404, detail="Cena not found")

    setattr(db_cena, 'cena', cena_data.cena)
    setattr(db_cena, 'status', cena_data.status)
    setattr(db_cena, 'nacin_placanja', cena_data.nacin_placanja)
    setattr(db_cena, 'datum_uplate', cena_data.datum_uplate)

    if cena_data.sesija_2 is not None:
        db_sesija_2 = database.query(Sesija).filter(Sesija.id == cena_data.sesija_2, Sesija.tenant_id == tenant_id).first()
        if not db_sesija_2:
            raise HTTPException(status_code=400, detail="Sesija not found")
        setattr(db_cena, 'sesija_2_id', cena_data.sesija_2)

    if cena_data.klijent_1 is not None:
        db_klijent_1 = database.query(Klijent).filter(Klijent.id == cena_data.klijent_1, Klijent.tenant_id == tenant_id).first()
        if not db_klijent_1:
            raise HTTPException(status_code=400, detail="Klijent not found")
        setattr(db_cena, 'klijent_1_id', cena_data.klijent_1)

    database.commit()
    database.refresh(db_cena)
    return db_cena


@app.delete("/cena/{cena_id}/", response_model=None, tags=["Cena"])
async def delete_cena(
    cena_id: int,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    db_cena = database.query(Cena).filter(Cena.id == cena_id, Cena.tenant_id == tenant_id).first()
    if db_cena is None:
        raise HTTPException(status_code=404, detail="Cena not found")
    database.delete(db_cena)
    database.commit()
    return {"message": "Deleted", "id": cena_id}


############################################
#
#   SesijaGrupa functions
#
############################################

@app.get("/sesijagrupa/", response_model=None, tags=["SesijaGrupa"])
def get_all_sesijagrupa(
    tenant_id: int = Depends(require_active_subscription),
    detailed: bool = False,
    database: Session = Depends(get_db)
) -> list:
    from sqlalchemy.orm import joinedload

    if detailed:
        query = database.query(SesijaGrupa).filter(SesijaGrupa.tenant_id == tenant_id)
        query = query.options(joinedload(SesijaGrupa.grupa))
        query = query.options(joinedload(SesijaGrupa.sesija_1))
        sesijagrupa_list = query.all()

        result = []
        for sesijagrupa_item in sesijagrupa_list:
            item_dict = sesijagrupa_item.__dict__.copy()
            item_dict.pop('_sa_instance_state', None)

            if sesijagrupa_item.grupa and sesijagrupa_item.grupa.tenant_id == tenant_id:
                related_dict = sesijagrupa_item.grupa.__dict__.copy()
                related_dict.pop('_sa_instance_state', None)
                item_dict['grupa'] = related_dict
            else:
                item_dict['grupa'] = None

            if sesijagrupa_item.sesija_1 and sesijagrupa_item.sesija_1.tenant_id == tenant_id:
                related_dict = sesijagrupa_item.sesija_1.__dict__.copy()
                related_dict.pop('_sa_instance_state', None)
                item_dict['sesija_1'] = related_dict
            else:
                item_dict['sesija_1'] = None

            result.append(item_dict)
        return result
    else:
        return database.query(SesijaGrupa).filter(SesijaGrupa.tenant_id == tenant_id).all()


@app.get("/sesijagrupa/count/", response_model=None, tags=["SesijaGrupa"])
def get_count_sesijagrupa(
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> dict:
    return {"count": database.query(SesijaGrupa).filter(SesijaGrupa.tenant_id == tenant_id).count()}


@app.get("/sesijagrupa/paginated/", response_model=None, tags=["SesijaGrupa"])
def get_paginated_sesijagrupa(
    tenant_id: int = Depends(require_active_subscription),
    skip: int = 0,
    limit: int = 100,
    detailed: bool = False,
    database: Session = Depends(get_db)
) -> dict:
    total = database.query(SesijaGrupa).filter(SesijaGrupa.tenant_id == tenant_id).count()
    sesijagrupa_list = database.query(SesijaGrupa).filter(SesijaGrupa.tenant_id == tenant_id).offset(skip).limit(limit).all()
    return {"total": total, "skip": skip, "limit": limit, "data": sesijagrupa_list}


@app.get("/sesijagrupa/search/", response_model=None, tags=["SesijaGrupa"])
def search_sesijagrupa(
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> list:
    return database.query(SesijaGrupa).filter(SesijaGrupa.tenant_id == tenant_id).all()


@app.get("/sesijagrupa/{sesijagrupa_id}/", response_model=None, tags=["SesijaGrupa"])
async def get_sesijagrupa(
    sesijagrupa_id: int,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> SesijaGrupa:
    db_sesijagrupa = database.query(SesijaGrupa).filter(SesijaGrupa.id == sesijagrupa_id, SesijaGrupa.tenant_id == tenant_id).first()
    if db_sesijagrupa is None:
        raise HTTPException(status_code=404, detail="SesijaGrupa not found")
    return {"sesijagrupa": db_sesijagrupa}


@app.post("/sesijagrupa/", response_model=None, tags=["SesijaGrupa"])
async def create_sesijagrupa(
    sesijagrupa_data: SesijaGrupaCreate,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> SesijaGrupa:

    if sesijagrupa_data.grupa is not None:
        db_grupa = database.query(Grupa).filter(Grupa.id == sesijagrupa_data.grupa, Grupa.tenant_id == tenant_id).first()
        if not db_grupa:
            raise HTTPException(status_code=400, detail="Grupa not found")
    else:
        raise HTTPException(status_code=400, detail="Grupa ID is required")

    if sesijagrupa_data.sesija_1 is not None:
        db_sesija_1 = database.query(Sesija).filter(Sesija.id == sesijagrupa_data.sesija_1, Sesija.tenant_id == tenant_id).first()
        if not db_sesija_1:
            raise HTTPException(status_code=400, detail="Sesija not found")
    else:
        raise HTTPException(status_code=400, detail="Sesija ID is required")

    sg_kwargs = dict(
        tenant_id=tenant_id,
        grupa_id=sesijagrupa_data.grupa,
        sesija_1_id=sesijagrupa_data.sesija_1
    )
    if sesijagrupa_data.id is not None:
        sg_kwargs["id"] = sesijagrupa_data.id

    db_sesijagrupa = SesijaGrupa(**sg_kwargs)
    database.add(db_sesijagrupa)
    database.commit()
    database.refresh(db_sesijagrupa)
    return db_sesijagrupa


@app.post("/sesijagrupa/bulk/", response_model=None, tags=["SesijaGrupa"])
async def bulk_create_sesijagrupa(
    items: list[SesijaGrupaCreate],
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> dict:
    created_items = []
    errors = []

    for idx, item_data in enumerate(items):
        try:
            if not item_data.grupa:
                raise ValueError("Grupa ID is required")
            if not item_data.sesija_1:
                raise ValueError("Sesija ID is required")

            db_sesijagrupa = SesijaGrupa(
                tenant_id=tenant_id,
                id=item_data.id,
                grupa_id=item_data.grupa,
                sesija_1_id=item_data.sesija_1
            )
            database.add(db_sesijagrupa)
            database.flush()
            created_items.append(db_sesijagrupa.id)
        except Exception as e:
            errors.append({"index": idx, "error": str(e)})

    if errors:
        database.rollback()
        raise HTTPException(status_code=400, detail={"message": "Bulk creation failed", "errors": errors})

    database.commit()
    return {"created_count": len(created_items), "created_ids": created_items, "message": f"Successfully created {len(created_items)} SesijaGrupa entities"}


@app.delete("/sesijagrupa/bulk/", response_model=None, tags=["SesijaGrupa"])
async def bulk_delete_sesijagrupa(
    ids: list[int],
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> dict:
    deleted_count = 0
    not_found = []

    for item_id in ids:
        db_sesijagrupa = database.query(SesijaGrupa).filter(SesijaGrupa.id == item_id, SesijaGrupa.tenant_id == tenant_id).first()
        if db_sesijagrupa:
            database.delete(db_sesijagrupa)
            deleted_count += 1
        else:
            not_found.append(item_id)

    database.commit()
    return {"deleted_count": deleted_count, "not_found": not_found, "message": f"Successfully deleted {deleted_count} SesijaGrupa entities"}


@app.put("/sesijagrupa/{sesijagrupa_id}/", response_model=None, tags=["SesijaGrupa"])
async def update_sesijagrupa(
    sesijagrupa_id: int,
    sesijagrupa_data: SesijaGrupaCreate,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> SesijaGrupa:
    db_sesijagrupa = database.query(SesijaGrupa).filter(SesijaGrupa.id == sesijagrupa_id, SesijaGrupa.tenant_id == tenant_id).first()
    if db_sesijagrupa is None:
        raise HTTPException(status_code=404, detail="SesijaGrupa not found")

    if sesijagrupa_data.grupa is not None:
        db_grupa = database.query(Grupa).filter(Grupa.id == sesijagrupa_data.grupa, Grupa.tenant_id == tenant_id).first()
        if not db_grupa:
            raise HTTPException(status_code=400, detail="Grupa not found")
        setattr(db_sesijagrupa, 'grupa_id', sesijagrupa_data.grupa)

    if sesijagrupa_data.sesija_1 is not None:
        db_sesija_1 = database.query(Sesija).filter(Sesija.id == sesijagrupa_data.sesija_1, Sesija.tenant_id == tenant_id).first()
        if not db_sesija_1:
            raise HTTPException(status_code=400, detail="Sesija not found")
        setattr(db_sesijagrupa, 'sesija_1_id', sesijagrupa_data.sesija_1)

    database.commit()
    database.refresh(db_sesijagrupa)
    return db_sesijagrupa


@app.delete("/sesijagrupa/{sesijagrupa_id}/", response_model=None, tags=["SesijaGrupa"])
async def delete_sesijagrupa(
    sesijagrupa_id: int,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    db_sesijagrupa = database.query(SesijaGrupa).filter(SesijaGrupa.id == sesijagrupa_id, SesijaGrupa.tenant_id == tenant_id).first()
    if db_sesijagrupa is None:
        raise HTTPException(status_code=404, detail="SesijaGrupa not found")
    database.delete(db_sesijagrupa)
    database.commit()
    return {"message": "Deleted", "id": sesijagrupa_id}


############################################
#
#   SesijaKlijent functions
#
############################################

@app.get("/sesijaklijent/", response_model=None, tags=["SesijaKlijent"])
def get_all_sesijaklijent(
    tenant_id: int = Depends(require_active_subscription),
    detailed: bool = False,
    database: Session = Depends(get_db)
) -> list:
    from sqlalchemy.orm import joinedload

    if detailed:
        query = database.query(SesijaKlijent).filter(SesijaKlijent.tenant_id == tenant_id)
        query = query.options(joinedload(SesijaKlijent.klijent))
        query = query.options(joinedload(SesijaKlijent.sesija))
        sesijaklijent_list = query.all()

        result = []
        for sesijaklijent_item in sesijaklijent_list:
            item_dict = sesijaklijent_item.__dict__.copy()
            item_dict.pop('_sa_instance_state', None)

            if sesijaklijent_item.klijent and sesijaklijent_item.klijent.tenant_id == tenant_id:
                related_dict = sesijaklijent_item.klijent.__dict__.copy()
                related_dict.pop('_sa_instance_state', None)
                item_dict['klijent'] = related_dict
            else:
                item_dict['klijent'] = None

            if sesijaklijent_item.sesija and sesijaklijent_item.sesija.tenant_id == tenant_id:
                related_dict = sesijaklijent_item.sesija.__dict__.copy()
                related_dict.pop('_sa_instance_state', None)
                item_dict['sesija'] = related_dict
            else:
                item_dict['sesija'] = None

            result.append(item_dict)
        return result
    else:
        return database.query(SesijaKlijent).filter(SesijaKlijent.tenant_id == tenant_id).all()


@app.get("/sesijaklijent/count/", response_model=None, tags=["SesijaKlijent"])
def get_count_sesijaklijent(
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> dict:
    return {"count": database.query(SesijaKlijent).filter(SesijaKlijent.tenant_id == tenant_id).count()}


@app.get("/sesijaklijent/paginated/", response_model=None, tags=["SesijaKlijent"])
def get_paginated_sesijaklijent(
    tenant_id: int = Depends(require_active_subscription),
    skip: int = 0,
    limit: int = 100,
    detailed: bool = False,
    database: Session = Depends(get_db)
) -> dict:
    total = database.query(SesijaKlijent).filter(SesijaKlijent.tenant_id == tenant_id).count()
    sesijaklijent_list = database.query(SesijaKlijent).filter(SesijaKlijent.tenant_id == tenant_id).offset(skip).limit(limit).all()
    return {"total": total, "skip": skip, "limit": limit, "data": sesijaklijent_list}


@app.get("/sesijaklijent/search/", response_model=None, tags=["SesijaKlijent"])
def search_sesijaklijent(
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> list:
    return database.query(SesijaKlijent).filter(SesijaKlijent.tenant_id == tenant_id).all()


@app.get("/sesijaklijent/{sesijaklijent_id}/", response_model=None, tags=["SesijaKlijent"])
async def get_sesijaklijent(
    sesijaklijent_id: int,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> SesijaKlijent:
    db_sesijaklijent = database.query(SesijaKlijent).filter(SesijaKlijent.id == sesijaklijent_id, SesijaKlijent.tenant_id == tenant_id).first()
    if db_sesijaklijent is None:
        raise HTTPException(status_code=404, detail="SesijaKlijent not found")
    return {"sesijaklijent": db_sesijaklijent}


@app.post("/sesijaklijent/", response_model=None, tags=["SesijaKlijent"])
async def create_sesijaklijent(
    sesijaklijent_data: SesijaKlijentCreate,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> SesijaKlijent:

    if sesijaklijent_data.klijent is not None:
        db_klijent = database.query(Klijent).filter(Klijent.id == sesijaklijent_data.klijent, Klijent.tenant_id == tenant_id).first()
        if not db_klijent:
            raise HTTPException(status_code=400, detail="Klijent not found")
    else:
        raise HTTPException(status_code=400, detail="Klijent ID is required")

    if sesijaklijent_data.sesija is not None:
        db_sesija = database.query(Sesija).filter(Sesija.id == sesijaklijent_data.sesija, Sesija.tenant_id == tenant_id).first()
        if not db_sesija:
            raise HTTPException(status_code=400, detail="Sesija not found")
    else:
        raise HTTPException(status_code=400, detail="Sesija ID is required")

    sk_kwargs = dict(
        tenant_id=tenant_id,
        klijent_id=sesijaklijent_data.klijent,
        sesija_id=sesijaklijent_data.sesija
    )
    if sesijaklijent_data.id is not None:
        sk_kwargs["id"] = sesijaklijent_data.id

    db_sesijaklijent = SesijaKlijent(**sk_kwargs)
    database.add(db_sesijaklijent)
    database.commit()
    database.refresh(db_sesijaklijent)
    return db_sesijaklijent


@app.post("/sesijaklijent/bulk/", response_model=None, tags=["SesijaKlijent"])
async def bulk_create_sesijaklijent(
    items: list[SesijaKlijentCreate],
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> dict:
    created_items = []
    errors = []

    for idx, item_data in enumerate(items):
        try:
            if not item_data.klijent:
                raise ValueError("Klijent ID is required")
            if not item_data.sesija:
                raise ValueError("Sesija ID is required")

            db_sesijaklijent = SesijaKlijent(
                tenant_id=tenant_id,
                id=item_data.id,
                klijent_id=item_data.klijent,
                sesija_id=item_data.sesija
            )
            database.add(db_sesijaklijent)
            database.flush()
            created_items.append(db_sesijaklijent.id)
        except Exception as e:
            errors.append({"index": idx, "error": str(e)})

    if errors:
        database.rollback()
        raise HTTPException(status_code=400, detail={"message": "Bulk creation failed", "errors": errors})

    database.commit()
    return {"created_count": len(created_items), "created_ids": created_items, "message": f"Successfully created {len(created_items)} SesijaKlijent entities"}


@app.delete("/sesijaklijent/bulk/", response_model=None, tags=["SesijaKlijent"])
async def bulk_delete_sesijaklijent(
    ids: list[int],
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> dict:
    deleted_count = 0
    not_found = []

    for item_id in ids:
        db_sesijaklijent = database.query(SesijaKlijent).filter(SesijaKlijent.id == item_id, SesijaKlijent.tenant_id == tenant_id).first()
        if db_sesijaklijent:
            database.delete(db_sesijaklijent)
            deleted_count += 1
        else:
            not_found.append(item_id)

    database.commit()
    return {"deleted_count": deleted_count, "not_found": not_found, "message": f"Successfully deleted {deleted_count} SesijaKlijent entities"}


@app.put("/sesijaklijent/{sesijaklijent_id}/", response_model=None, tags=["SesijaKlijent"])
async def update_sesijaklijent(
    sesijaklijent_id: int,
    sesijaklijent_data: SesijaKlijentCreate,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> SesijaKlijent:
    db_sesijaklijent = database.query(SesijaKlijent).filter(SesijaKlijent.id == sesijaklijent_id, SesijaKlijent.tenant_id == tenant_id).first()
    if db_sesijaklijent is None:
        raise HTTPException(status_code=404, detail="SesijaKlijent not found")

    if sesijaklijent_data.klijent is not None:
        db_klijent = database.query(Klijent).filter(Klijent.id == sesijaklijent_data.klijent, Klijent.tenant_id == tenant_id).first()
        if not db_klijent:
            raise HTTPException(status_code=400, detail="Klijent not found")
        setattr(db_sesijaklijent, 'klijent_id', sesijaklijent_data.klijent)

    if sesijaklijent_data.sesija is not None:
        db_sesija = database.query(Sesija).filter(Sesija.id == sesijaklijent_data.sesija, Sesija.tenant_id == tenant_id).first()
        if not db_sesija:
            raise HTTPException(status_code=400, detail="Sesija not found")
        setattr(db_sesijaklijent, 'sesija_id', sesijaklijent_data.sesija)

    database.commit()
    database.refresh(db_sesijaklijent)
    return db_sesijaklijent


@app.delete("/sesijaklijent/{sesijaklijent_id}/", response_model=None, tags=["SesijaKlijent"])
async def delete_sesijaklijent(
    sesijaklijent_id: int,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    db_sesijaklijent = database.query(SesijaKlijent).filter(SesijaKlijent.id == sesijaklijent_id, SesijaKlijent.tenant_id == tenant_id).first()
    if db_sesijaklijent is None:
        raise HTTPException(status_code=404, detail="SesijaKlijent not found")
    database.delete(db_sesijaklijent)
    database.commit()
    return {"message": "Deleted", "id": sesijaklijent_id}


############################################
#
#   GrupaKlijent functions
#
############################################

@app.get("/grupaklijent/", response_model=None, tags=["GrupaKlijent"])
def get_all_grupaklijent(
    tenant_id: int = Depends(require_active_subscription),
    detailed: bool = False,
    database: Session = Depends(get_db)
) -> list:
    from sqlalchemy.orm import joinedload

    if detailed:
        query = database.query(GrupaKlijent).filter(GrupaKlijent.tenant_id == tenant_id)
        query = query.options(joinedload(GrupaKlijent.grupa))
        query = query.options(joinedload(GrupaKlijent.klijent))
        gk_list = query.all()

        result = []
        for gk_item in gk_list:
            item_dict = gk_item.__dict__.copy()
            item_dict.pop('_sa_instance_state', None)

            if gk_item.grupa and gk_item.grupa.tenant_id == tenant_id:
                related_dict = gk_item.grupa.__dict__.copy()
                related_dict.pop('_sa_instance_state', None)
                item_dict['grupa'] = related_dict
            else:
                item_dict['grupa'] = None

            if gk_item.klijent and gk_item.klijent.tenant_id == tenant_id:
                related_dict = gk_item.klijent.__dict__.copy()
                related_dict.pop('_sa_instance_state', None)
                item_dict['klijent'] = related_dict
            else:
                item_dict['klijent'] = None

            result.append(item_dict)
        return result
    else:
        return database.query(GrupaKlijent).filter(GrupaKlijent.tenant_id == tenant_id).all()


@app.get("/grupaklijent/by-grupa/{grupa_id}/", response_model=None, tags=["GrupaKlijent"])
def get_grupaklijent_by_grupa(
    grupa_id: int,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> list:
    gk_list = database.query(GrupaKlijent).filter(GrupaKlijent.grupa_id == grupa_id, GrupaKlijent.tenant_id == tenant_id).all()

    result = []
    for gk in gk_list:
        item = gk.__dict__.copy()
        item.pop('_sa_instance_state', None)

        klijent = database.query(Klijent).filter(Klijent.id == gk.klijent_id, Klijent.tenant_id == tenant_id).first()
        if klijent:
            klijent_dict = klijent.__dict__.copy()
            klijent_dict.pop('_sa_instance_state', None)
            item['klijent'] = klijent_dict

        result.append(item)
    return result


@app.post("/grupaklijent/", response_model=None, tags=["GrupaKlijent"])
async def create_grupaklijent(
    data: GrupaKlijentCreate,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    if data.grupa_id is None:
        raise HTTPException(status_code=400, detail="Grupa ID is required")
    if data.klijent_id is None:
        raise HTTPException(status_code=400, detail="Klijent ID is required")

    db_grupa = database.query(Grupa).filter(Grupa.id == data.grupa_id, Grupa.tenant_id == tenant_id).first()
    if not db_grupa:
        raise HTTPException(status_code=400, detail="Grupa not found")

    db_klijent = database.query(Klijent).filter(Klijent.id == data.klijent_id, Klijent.tenant_id == tenant_id).first()
    if not db_klijent:
        raise HTTPException(status_code=400, detail="Klijent not found")

    existing = database.query(GrupaKlijent).filter(
        GrupaKlijent.grupa_id == data.grupa_id,
        GrupaKlijent.klijent_id == data.klijent_id,
        GrupaKlijent.tenant_id == tenant_id
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Klijent is already in this group")

    db_gk = GrupaKlijent(
        tenant_id=tenant_id,
        grupa_id=data.grupa_id,
        klijent_id=data.klijent_id
    )
    database.add(db_gk)
    database.commit()
    database.refresh(db_gk)
    return db_gk


@app.delete("/grupaklijent/{grupaklijent_id}/", response_model=None, tags=["GrupaKlijent"])
async def delete_grupaklijent(
    grupaklijent_id: int,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    db_gk = database.query(GrupaKlijent).filter(GrupaKlijent.id == grupaklijent_id, GrupaKlijent.tenant_id == tenant_id).first()
    if db_gk is None:
        raise HTTPException(status_code=404, detail="GrupaKlijent not found")
    database.delete(db_gk)
    database.commit()
    return {"message": "Deleted", "id": grupaklijent_id}


@app.put("/grupaklijent/sync/{grupa_id}/", response_model=None, tags=["GrupaKlijent"])
async def sync_grupa_members(
    grupa_id: int,
    klijent_ids: list[int] = Body(...),
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    db_grupa = database.query(Grupa).filter(Grupa.id == grupa_id, Grupa.tenant_id == tenant_id).first()
    if not db_grupa:
        raise HTTPException(status_code=404, detail="Grupa not found")

    database.query(GrupaKlijent).filter(GrupaKlijent.grupa_id == grupa_id, GrupaKlijent.tenant_id == tenant_id).delete()

    for klijent_id in klijent_ids:
        db_klijent = database.query(Klijent).filter(Klijent.id == klijent_id, Klijent.tenant_id == tenant_id).first()
        if not db_klijent:
            database.rollback()
            raise HTTPException(status_code=400, detail=f"Klijent with id {klijent_id} not found")

        db_gk = GrupaKlijent(tenant_id=tenant_id, grupa_id=grupa_id, klijent_id=klijent_id)
        database.add(db_gk)

    database.commit()

    members = database.query(GrupaKlijent).filter(GrupaKlijent.grupa_id == grupa_id, GrupaKlijent.tenant_id == tenant_id).all()
    return {"grupa_id": grupa_id, "member_count": len(members), "klijent_ids": [m.klijent_id for m in members]}


############################################
#
#   Sesija functions
#
############################################

@app.get("/sesija/", tags=["Sesija"])
def get_all_sesija(
    tenant_id: int = Depends(require_active_subscription),
    detailed: bool = False,
    database: Session = Depends(get_db)
):
    all_cene_paid = database.query(Cena).filter(Cena.status == "placeno", Cena.tenant_id == tenant_id).all()
    paid_sesija_ids = {c.sesija_2_id for c in all_cene_paid if c.sesija_2_id}

    if detailed:
        sesija_list = database.query(Sesija).filter(Sesija.tenant_id == tenant_id).all()
        result = []

        for sesija_item in sesija_list:
            item_dict = sesija_item.__dict__.copy()
            item_dict.pop("_sa_instance_state", None)

            cena_list = database.query(Cena).filter(Cena.sesija_2_id == sesija_item.id, Cena.tenant_id == tenant_id).all()
            item_dict["cena"] = [{k: v for k, v in c.__dict__.items() if k != "_sa_instance_state"} for c in cena_list]

            sesijaklijent_list = database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == sesija_item.id, SesijaKlijent.tenant_id == tenant_id).all()
            item_dict["sesijaklijent_1"] = [{k: v for k, v in x.__dict__.items() if k != "_sa_instance_state"} for x in sesijaklijent_list]

            sesijagrupa_list = database.query(SesijaGrupa).filter(SesijaGrupa.sesija_1_id == sesija_item.id, SesijaGrupa.tenant_id == tenant_id).all()
            item_dict["sesijagrupa_1"] = [{k: v for k, v in x.__dict__.items() if k != "_sa_instance_state"} for x in sesijagrupa_list]

            item_dict["placeno"] = sesija_item.id in paid_sesija_ids
            result.append(item_dict)

        return result
    else:
        sesija_list = database.query(Sesija).filter(Sesija.tenant_id == tenant_id).all()

        all_sk = database.query(SesijaKlijent).filter(SesijaKlijent.tenant_id == tenant_id).all()
        all_sg = database.query(SesijaGrupa).filter(SesijaGrupa.tenant_id == tenant_id).all()
        all_klijenti = database.query(Klijent).filter(Klijent.tenant_id == tenant_id).all()
        all_grupe = database.query(Grupa).filter(Grupa.tenant_id == tenant_id).all()

        klijent_map = {k.id: k for k in all_klijenti}
        grupa_map = {g.id: g for g in all_grupe}
        sk_map = {sk.sesija_id: sk.klijent_id for sk in all_sk}
        sg_map = {sg.sesija_1_id: sg.grupa_id for sg in all_sg}

        result = []
        for s in sesija_list:
            item = s.__dict__.copy()
            item.pop("_sa_instance_state", None)

            klijent_id = sk_map.get(s.id)
            if klijent_id:
                klijent = klijent_map.get(klijent_id)
                item["klijent_ime"] = f"{klijent.ime} {klijent.prezime}" if klijent else ""
            else:
                item["klijent_ime"] = ""

            grupa_id = sg_map.get(s.id)
            if grupa_id:
                grupa = grupa_map.get(grupa_id)
                if grupa:
                    item["grupa_naziv"] = grupa.naziv
                    item["grupa_id"] = grupa.id
                    if not item["klijent_ime"]:
                        item["klijent_ime"] = f"[Grupa] {grupa.naziv}"
                else:
                    item["grupa_naziv"] = ""
                    item["grupa_id"] = None
            else:
                item["grupa_naziv"] = ""
                item["grupa_id"] = None

            item["placeno"] = s.id in paid_sesija_ids
            result.append(item)

        return result


@app.get("/sesija/count/", tags=["Sesija"])
def get_count_sesija(
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    return {"count": database.query(Sesija).filter(Sesija.tenant_id == tenant_id).count()}


@app.get("/sesija/paginated/", tags=["Sesija"])
def get_paginated_sesija(
    tenant_id: int = Depends(require_active_subscription),
    skip: int = 0,
    limit: int = 100,
    detailed: bool = False,
    database: Session = Depends(get_db)
):
    query = database.query(Sesija).filter(Sesija.tenant_id == tenant_id)
    total = query.count()
    sesija_list = query.offset(skip).limit(limit).all()
    return {"total": total, "skip": skip, "limit": limit, "data": sesija_list}


@app.get("/sesija/search/", tags=["Sesija"])
def search_sesija(
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    return database.query(Sesija).filter(Sesija.tenant_id == tenant_id).all()


# ============================================
# EXPORT EXCEL — tenant-aware
# ============================================
@app.get("/sesija/export-excel/", response_model=None, tags=["Sesija"])
def export_sesija_excel(
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    from datetime import date as date_type

    # Fetch all data — FILTERED BY TENANT
    sesija_list = database.query(Sesija).filter(Sesija.tenant_id == tenant_id).all()
    all_sk = database.query(SesijaKlijent).filter(SesijaKlijent.tenant_id == tenant_id).all()
    all_sg = database.query(SesijaGrupa).filter(SesijaGrupa.tenant_id == tenant_id).all()
    all_klijenti = database.query(Klijent).filter(Klijent.tenant_id == tenant_id).all()
    all_grupe = database.query(Grupa).filter(Grupa.tenant_id == tenant_id).all()
    all_cene = database.query(Cena).filter(Cena.tenant_id == tenant_id).all()
    all_gk = database.query(GrupaKlijent).filter(GrupaKlijent.tenant_id == tenant_id).all()

    klijent_map = {k.id: k for k in all_klijenti}
    grupa_map = {g.id: g for g in all_grupe}
    sk_map = {sk.sesija_id: sk.klijent_id for sk in all_sk}
    sg_map = {sg.sesija_1_id: sg.grupa_id for sg in all_sg}

    grupa_members_map = {}
    for gk in all_gk:
        if gk.grupa_id not in grupa_members_map:
            grupa_members_map[gk.grupa_id] = []
        k = klijent_map.get(gk.klijent_id)
        if k:
            grupa_members_map[gk.grupa_id].append(f"{k.ime} {k.prezime}")

    payment_map = {}
    for c in all_cene:
        if c.status == "placeno" and c.sesija_2_id:
            if c.sesija_2_id not in payment_map:
                payment_map[c.sesija_2_id] = []
            payment_map[c.sesija_2_id].append(c)

    enriched = []
    for s in sesija_list:
        klijent_id = sk_map.get(s.id)
        grupa_id = sg_map.get(s.id)
        if klijent_id:
            klijent = klijent_map.get(klijent_id)
            ime = f"{klijent.ime} {klijent.prezime}" if klijent else "—"
            tip = "Individualna"
            grupa_naziv = "—"
        elif grupa_id:
            grupa = grupa_map.get(grupa_id)
            ime = f"{grupa.naziv}" if grupa else "—"
            tip = "Grupna"
            grupa_naziv = grupa.naziv if grupa else "—"
        else:
            ime = "—"
            tip = "—"
            grupa_naziv = "—"

        payments = payment_map.get(s.id, [])
        is_paid = len(payments) > 0
        nacin = payments[0].nacin_placanja if payments else "—"
        datum_uplate_val = "—"
        if payments and payments[0].datum_uplate:
            try:
                datum_uplate_val = payments[0].datum_uplate.strftime("%d.%m.%Y")
            except Exception:
                datum_uplate_val = str(payments[0].datum_uplate)

        session_cena = s.cena if s.cena else 0
        pocetak_datum = "—"
        pocetak_vreme = "—"
        kraj_vreme = "—"
        try:
            if s.pocetak:
                pocetak_datum = s.pocetak.strftime("%d.%m.%Y")
                pocetak_vreme = s.pocetak.strftime("%H:%M")
            if s.kraj:
                kraj_vreme = s.kraj.strftime("%H:%M")
        except Exception:
            pass

        clanovi = ""
        if grupa_id and grupa_id in grupa_members_map:
            clanovi = ", ".join(grupa_members_map[grupa_id])

        enriched.append({
            "ime": ime,
            "tip": tip,
            "grupa_naziv": grupa_naziv,
            "clanovi": clanovi,
            "datum": pocetak_datum,
            "pocetak": pocetak_vreme,
            "kraj": kraj_vreme,
            "cena": session_cena,
            "status": (s.status or "—").capitalize(),
            "placeno": is_paid,
            "nacin": (nacin or "—").capitalize() if nacin != "—" else "—",
            "datum_uplate": datum_uplate_val,
            "sesija_id": s.id,
            "klijent_id": klijent_id,
            "grupa_id": grupa_id,
        })

    # ===== STYLES =====
    header_font = Font(name="Arial", bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill("solid", fgColor="1E293B")
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell_font = Font(name="Arial", size=10)
    paid_fill = PatternFill("solid", fgColor="DCFCE7")
    unpaid_fill = PatternFill("solid", fgColor="FEF3C7")
    paid_row_fill = PatternFill("solid", fgColor="F0FDF4")
    unpaid_row_fill = PatternFill("solid", fgColor="FFFBEB")
    total_font = Font(name="Arial", bold=True, size=11)
    total_fill = PatternFill("solid", fgColor="EEF2FF")
    thin_border = Border(
        left=Side(style="thin", color="E2E8F0"),
        right=Side(style="thin", color="E2E8F0"),
        top=Side(style="thin", color="E2E8F0"),
        bottom=Side(style="thin", color="E2E8F0"),
    )

    wb = openpyxl.Workbook()

    def write_session_table(ws, title_text, sessions, show_payment_cols=True, show_group_members=False):
        headers = ["R.br.", "Klijent / Grupa", "Tip"]
        if show_group_members:
            headers.append("Clanovi grupe")
        headers += ["Datum", "Pocetak", "Kraj", "Cena (RSD)", "Status"]
        if show_payment_cols:
            headers += ["Placeno", "Nacin placanja", "Datum uplate"]

        last_col_letter = get_column_letter(len(headers))
        ws.merge_cells(f"A1:{last_col_letter}1")
        title_cell = ws["A1"]
        title_cell.value = title_text
        title_cell.font = Font(name="Arial", bold=True, size=14, color="1E293B")
        title_cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 35

        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=3, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align
            cell.border = thin_border
        ws.row_dimensions[3].height = 28

        base_widths = {"R.br.": 6, "Klijent / Grupa": 25, "Tip": 14, "Clanovi grupe": 35,
                       "Datum": 14, "Pocetak": 10, "Kraj": 10, "Cena (RSD)": 14,
                       "Status": 14, "Placeno": 12, "Nacin placanja": 16, "Datum uplate": 14}
        for col_idx, header in enumerate(headers, 1):
            ws.column_dimensions[get_column_letter(col_idx)].width = base_widths.get(header, 14)

        row_num = 4
        total_cena = 0

        for idx, s in enumerate(sessions, 1):
            row_data = [idx, s["ime"], s["tip"]]
            if show_group_members:
                row_data.append(s["clanovi"])
            row_data += [s["datum"], s["pocetak"], s["kraj"], s["cena"], s["status"]]
            if show_payment_cols:
                row_data += ["Da" if s["placeno"] else "Ne", s["nacin"], s["datum_uplate"]]

            total_cena += s["cena"]

            for col_idx, value in enumerate(row_data, 1):
                cell = ws.cell(row=row_num, column=col_idx, value=value)
                cell.font = cell_font
                cell.border = thin_border
                h = headers[col_idx - 1]
                cell.alignment = Alignment(
                    horizontal="left" if h in ("Klijent / Grupa", "Clanovi grupe") else "center",
                    vertical="center"
                )

            if show_payment_cols:
                placeno_col = headers.index("Placeno") + 1
                payment_cell = ws.cell(row=row_num, column=placeno_col)
                if s["placeno"]:
                    payment_cell.fill = paid_fill
                    payment_cell.font = Font(name="Arial", size=10, bold=True, color="166534")
                    for ci in range(1, len(headers) + 1):
                        if ci != placeno_col:
                            ws.cell(row=row_num, column=ci).fill = paid_row_fill
                else:
                    payment_cell.fill = unpaid_fill
                    payment_cell.font = Font(name="Arial", size=10, bold=True, color="92400E")
                    for ci in range(1, len(headers) + 1):
                        if ci != placeno_col:
                            ws.cell(row=row_num, column=ci).fill = unpaid_row_fill
            else:
                row_fill = paid_row_fill if sessions and sessions[0]["placeno"] else unpaid_row_fill
                for ci in range(1, len(headers) + 1):
                    ws.cell(row=row_num, column=ci).fill = row_fill

            row_num += 1

        cena_col = headers.index("Cena (RSD)") + 1
        row_num += 1
        summary_end = cena_col - 1
        ws.merge_cells(f"A{row_num}:{get_column_letter(summary_end)}{row_num}")
        ws.cell(row=row_num, column=1, value="UKUPNO").font = total_font
        ws.cell(row=row_num, column=1).fill = total_fill
        ws.cell(row=row_num, column=1).alignment = Alignment(horizontal="right")
        ws.cell(row=row_num, column=cena_col, value=total_cena).font = total_font
        ws.cell(row=row_num, column=cena_col).fill = total_fill
        ws.cell(row=row_num, column=cena_col).number_format = '#,##0'

        row_num += 1
        ws.merge_cells(f"A{row_num}:{get_column_letter(summary_end)}{row_num}")
        ws.cell(row=row_num, column=1, value="Broj sesija").font = Font(name="Arial", size=10)
        ws.cell(row=row_num, column=1).alignment = Alignment(horizontal="right")
        ws.cell(row=row_num, column=cena_col, value=len(sessions)).font = Font(name="Arial", bold=True, size=10)

        return total_cena

    # SHEET 1: Sve sesije
    ws1 = wb.active
    ws1.title = "Sve sesije"
    paid_sessions = [s for s in enriched if s["placeno"]]
    unpaid_sessions = [s for s in enriched if not s["placeno"]]
    total_all = sum(s["cena"] for s in enriched)
    total_paid = sum(s["cena"] for s in paid_sessions)
    total_unpaid = sum(s["cena"] for s in unpaid_sessions)

    write_session_table(ws1, f"Izvestaj sesija — {date_type.today().strftime('%d.%m.%Y')}", enriched, show_payment_cols=True, show_group_members=True)

    last_row = ws1.max_row
    r = last_row + 1
    cena_col = 8
    ws1.merge_cells(f"A{r}:G{r}")
    ws1.cell(row=r, column=1, value="Ukupno placeno").font = Font(name="Arial", bold=True, size=10, color="166534")
    ws1.cell(row=r, column=1).alignment = Alignment(horizontal="right")
    ws1.cell(row=r, column=cena_col, value=total_paid).font = Font(name="Arial", bold=True, size=10, color="166534")
    ws1.cell(row=r, column=cena_col).fill = paid_fill
    ws1.cell(row=r, column=cena_col).number_format = '#,##0'

    r += 1
    ws1.merge_cells(f"A{r}:G{r}")
    ws1.cell(row=r, column=1, value="Ukupno neplaceno").font = Font(name="Arial", bold=True, size=10, color="92400E")
    ws1.cell(row=r, column=1).alignment = Alignment(horizontal="right")
    ws1.cell(row=r, column=cena_col, value=total_unpaid).font = Font(name="Arial", bold=True, size=10, color="92400E")
    ws1.cell(row=r, column=cena_col).fill = unpaid_fill
    ws1.cell(row=r, column=cena_col).number_format = '#,##0'

    # SHEET 2: Placeno
    ws2 = wb.create_sheet("Placeno")
    write_session_table(ws2, f"Placene sesije — {date_type.today().strftime('%d.%m.%Y')}", paid_sessions, show_payment_cols=True, show_group_members=True)

    # SHEET 3: Neplaceno
    ws3 = wb.create_sheet("Neplaceno")
    write_session_table(ws3, f"Neplacene sesije — {date_type.today().strftime('%d.%m.%Y')}", unpaid_sessions, show_payment_cols=False, show_group_members=True)

    # SHEET 4: Po klijentu
    ws4 = wb.create_sheet("Po klijentu")
    ws4.merge_cells("A1:G1")
    ws4["A1"].value = "Statistika po klijentu / grupi"
    ws4["A1"].font = Font(name="Arial", bold=True, size=14, color="1E293B")
    ws4["A1"].alignment = Alignment(horizontal="center")
    ws4.row_dimensions[1].height = 35

    client_headers = ["Klijent / Grupa", "Tip", "Br. sesija", "Ukupno (RSD)", "Placeno (RSD)", "Neplaceno (RSD)", "% naplaceno"]
    for col_idx, h in enumerate(client_headers, 1):
        cell = ws4.cell(row=3, column=col_idx, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align
        cell.border = thin_border
    ws4.column_dimensions["A"].width = 28
    ws4.column_dimensions["B"].width = 14
    ws4.column_dimensions["C"].width = 12
    ws4.column_dimensions["D"].width = 16
    ws4.column_dimensions["E"].width = 16
    ws4.column_dimensions["F"].width = 16
    ws4.column_dimensions["G"].width = 14

    client_stats = {}
    for s in enriched:
        key = s["ime"]
        tip = s["tip"]
        if key not in client_stats:
            client_stats[key] = {"tip": tip, "sessions": 0, "total": 0, "paid": 0, "unpaid": 0}
        client_stats[key]["sessions"] += 1
        client_stats[key]["total"] += s["cena"]
        if s["placeno"]:
            client_stats[key]["paid"] += s["cena"]
        else:
            client_stats[key]["unpaid"] += s["cena"]

    row4 = 4
    grand_total = 0
    grand_paid = 0
    grand_unpaid = 0

    for name, stats in sorted(client_stats.items()):
        ws4.cell(row=row4, column=1, value=name).font = cell_font
        ws4.cell(row=row4, column=2, value=stats["tip"]).font = cell_font
        ws4.cell(row=row4, column=2).alignment = Alignment(horizontal="center")
        ws4.cell(row=row4, column=3, value=stats["sessions"]).font = cell_font
        ws4.cell(row=row4, column=3).alignment = Alignment(horizontal="center")
        ws4.cell(row=row4, column=4, value=stats["total"]).font = cell_font
        ws4.cell(row=row4, column=4).number_format = '#,##0'
        ws4.cell(row=row4, column=5, value=stats["paid"]).font = Font(name="Arial", size=10, color="166534")
        ws4.cell(row=row4, column=5).number_format = '#,##0'
        if stats["paid"] > 0:
            ws4.cell(row=row4, column=5).fill = paid_fill
        ws4.cell(row=row4, column=6, value=stats["unpaid"]).font = Font(name="Arial", size=10, color="92400E")
        ws4.cell(row=row4, column=6).number_format = '#,##0'
        if stats["unpaid"] > 0:
            ws4.cell(row=row4, column=6).fill = unpaid_fill

        pct = (stats["paid"] / stats["total"] * 100) if stats["total"] > 0 else 0
        pct_cell = ws4.cell(row=row4, column=7, value=round(pct, 1))
        pct_cell.number_format = '0.0"%"'
        pct_cell.font = cell_font
        pct_cell.alignment = Alignment(horizontal="center")
        if pct >= 100:
            pct_cell.fill = paid_fill
            pct_cell.font = Font(name="Arial", size=10, bold=True, color="166534")
        elif pct == 0:
            pct_cell.fill = unpaid_fill
            pct_cell.font = Font(name="Arial", size=10, color="92400E")

        for c in range(1, 8):
            ws4.cell(row=row4, column=c).border = thin_border

        grand_total += stats["total"]
        grand_paid += stats["paid"]
        grand_unpaid += stats["unpaid"]
        row4 += 1

    row4 += 1
    ws4.merge_cells(f"A{row4}:C{row4}")
    ws4.cell(row=row4, column=1, value="UKUPNO").font = total_font
    ws4.cell(row=row4, column=1).fill = total_fill
    ws4.cell(row=row4, column=1).alignment = Alignment(horizontal="right")
    ws4.cell(row=row4, column=4, value=grand_total).font = total_font
    ws4.cell(row=row4, column=4).fill = total_fill
    ws4.cell(row=row4, column=4).number_format = '#,##0'
    ws4.cell(row=row4, column=5, value=grand_paid).font = Font(name="Arial", bold=True, size=10, color="166534")
    ws4.cell(row=row4, column=5).fill = paid_fill
    ws4.cell(row=row4, column=5).number_format = '#,##0'
    ws4.cell(row=row4, column=6, value=grand_unpaid).font = Font(name="Arial", bold=True, size=10, color="92400E")
    ws4.cell(row=row4, column=6).fill = unpaid_fill
    ws4.cell(row=row4, column=6).number_format = '#,##0'
    grand_pct = (grand_paid / grand_total * 100) if grand_total > 0 else 0
    ws4.cell(row=row4, column=7, value=round(grand_pct, 1)).font = total_font
    ws4.cell(row=row4, column=7).number_format = '0.0"%"'
    for c in range(1, 8):
        ws4.cell(row=row4, column=c).border = thin_border

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    today_str = date_type.today().strftime("%Y-%m-%d")
    filename = f"izvestaj_sesije_{today_str}.xlsx"
    return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ============================================
# GET single sesija — MUST be AFTER export-excel
# ============================================
@app.get("/sesija/{sesija_id}/", tags=["Sesija"])
async def get_sesija(
    sesija_id: int,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    db_sesija = database.query(Sesija).filter(Sesija.id == sesija_id, Sesija.tenant_id == tenant_id).first()
    if db_sesija is None:
        raise HTTPException(status_code=404, detail="Sesija not found")

    cena_ids = database.query(Cena.id).filter(Cena.sesija_2_id == db_sesija.id, Cena.tenant_id == tenant_id).all()
    sesijaklijent_ids = database.query(SesijaKlijent.id).filter(SesijaKlijent.sesija_id == db_sesija.id, SesijaKlijent.tenant_id == tenant_id).all()
    sesijagrupa_ids = database.query(SesijaGrupa.id).filter(SesijaGrupa.sesija_1_id == db_sesija.id, SesijaGrupa.tenant_id == tenant_id).all()

    return {
        "sesija": db_sesija,
        "cena_ids": [x[0] for x in cena_ids],
        "sesijaklijent_1_ids": [x[0] for x in sesijaklijent_ids],
        "sesijagrupa_1_ids": [x[0] for x in sesijagrupa_ids]
    }


@app.post("/sesija/", tags=["Sesija"])
async def create_sesija(
    request: Request,
    sesija_data: SesijaCreate,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    member = get_current_member_soft(request, tenant_id, database)
    # A "besplatno" status is itself a declaration that the session is
    # free, matching the same rule the admin area uses.
    effective_is_free = True if sesija_data.status == "besplatno" else None

    db_sesija = Sesija(
        tenant_id=tenant_id,
        cena=sesija_data.cena,
        status=sesija_data.status,
        pocetak=sesija_data.pocetak,
        kraj=sesija_data.kraj,
        therapist_id=member.id if member else None,
        is_free=effective_is_free,
    )
    database.add(db_sesija)
    database.flush()  # get the ID before creating links

    # Create klijent link
    klijent = None
    if sesija_data.klijent_id:
        klijent = database.query(Klijent).filter(
            Klijent.id == sesija_data.klijent_id,
            Klijent.tenant_id == tenant_id
        ).first()
        if klijent:
            new_sk = SesijaKlijent(
                tenant_id=tenant_id,
                klijent_id=klijent.id,
                sesija_id=db_sesija.id
            )
            database.add(new_sk)
            # Whoever actually books this session is that client's therapist,
            # if the client doesn't already have one assigned.
            if member and klijent.therapist_id is None:
                klijent.therapist_id = member.id
            database.flush()
            if effective_is_free is None:
                _recompute_client_free_sessions(database, klijent.id)

    # Create grupa link
    grupa = None
    if sesija_data.grupa_id:
        grupa = database.query(Grupa).filter(
            Grupa.id == sesija_data.grupa_id,
            Grupa.tenant_id == tenant_id
        ).first()
        if grupa:
            new_sg = SesijaGrupa(
                tenant_id=tenant_id,
                grupa_id=grupa.id,
                sesija_1_id=db_sesija.id
            )
            database.add(new_sg)

    database.commit()
    database.refresh(db_sesija)

    # Send emails - mirrors the "updated" notification sent from
    # update_sesija, so scheduling a session notifies the same way editing
    # one already does.
    if grupa:
        group_members = database.query(GrupaKlijent).filter(GrupaKlijent.grupa_id == grupa.id, GrupaKlijent.tenant_id == tenant_id).all()
        member_emails = []
        for gk in group_members:
            gk_klijent = database.query(Klijent).filter(Klijent.id == gk.klijent_id, Klijent.tenant_id == tenant_id).first()
            if gk_klijent:
                member_emails.append({"name": f"{gk_klijent.ime} {gk_klijent.prezime}", "email": gk_klijent.email})
        try:
            send_session_email_to_group(action="created", grupa_naziv=grupa.naziv, pocetak=db_sesija.pocetak, kraj=db_sesija.kraj, cena=db_sesija.cena, client_emails=member_emails, therapist_email=resolve_therapist_email(tenant_id, db_sesija.therapist_id, database))
        except Exception as e:
            logger.error(f"Failed to send group email: {e}")
    elif klijent:
        try:
            send_session_email(action="created", client_name=f"{klijent.ime} {klijent.prezime}", pocetak=db_sesija.pocetak, kraj=db_sesija.kraj, cena=db_sesija.cena, client_email=klijent.email, therapist_email=resolve_therapist_email(tenant_id, db_sesija.therapist_id, database))
        except Exception as e:
            logger.error(f"Failed to send email: {e}")

    return db_sesija

@app.post("/sesija/bulk/", response_model=None, tags=["Sesija"])
async def bulk_create_sesija(
    items: list[SesijaCreate],
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> dict:
    created_items = []
    errors = []

    for idx, item_data in enumerate(items):
        try:
            db_sesija = Sesija(
                tenant_id=tenant_id,
                cena=item_data.cena,
                status=item_data.status,
                id=item_data.id,
                pocetak=item_data.pocetak,
                kraj=item_data.kraj
            )
            database.add(db_sesija)
            database.flush()
            created_items.append(db_sesija.id)
        except Exception as e:
            errors.append({"index": idx, "error": str(e)})

    if errors:
        database.rollback()
        raise HTTPException(status_code=400, detail={"message": "Bulk creation failed", "errors": errors})

    database.commit()
    return {"created_count": len(created_items), "created_ids": created_items, "message": f"Successfully created {len(created_items)} Sesija entities"}


@app.delete("/sesija/bulk/", response_model=None, tags=["Sesija"])
async def bulk_delete_sesija(
    ids: list[int],
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> dict:
    deleted_count = 0
    not_found = []

    for item_id in ids:
        db_sesija = database.query(Sesija).filter(Sesija.id == item_id, Sesija.tenant_id == tenant_id).first()
        if db_sesija:
            _delete_sesija_with_links(database, db_sesija)
            deleted_count += 1
        else:
            not_found.append(item_id)

    database.commit()
    return {"deleted_count": deleted_count, "not_found": not_found, "message": f"Successfully deleted {deleted_count} Sesija entities"}


# ============================================
# MARK PAID — tenant-aware
# ============================================
@app.post("/sesija/{sesija_id}/mark-paid/", response_model=None, tags=["Sesija"])
async def mark_sesija_paid(
    sesija_id: int,
    payment_data: dict = Body(...),
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    from datetime import date as date_type

    db_sesija = database.query(Sesija).filter(Sesija.id == sesija_id, Sesija.tenant_id == tenant_id).first()
    if db_sesija is None:
        raise HTTPException(status_code=404, detail="Sesija not found")

    existing_payment = database.query(Cena).filter(Cena.sesija_2_id == sesija_id, Cena.status == "placeno", Cena.tenant_id == tenant_id).first()
    if existing_payment:
        raise HTTPException(status_code=400, detail="Ova sesija je vec oznacena kao placena.")

    nacin_placanja = payment_data.get("nacin_placanja", "gotovina")
    datum_str = payment_data.get("datum_uplate")
    if datum_str:
        try:
            datum_uplate = date_type.fromisoformat(datum_str)
        except (ValueError, TypeError):
            datum_uplate = date_type.today()
    else:
        datum_uplate = date_type.today()

    sk = database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == sesija_id, SesijaKlijent.tenant_id == tenant_id).first()
    sg = database.query(SesijaGrupa).filter(SesijaGrupa.sesija_1_id == sesija_id, SesijaGrupa.tenant_id == tenant_id).first()

    if sk and sk.klijent_id:
        db_cena = Cena(tenant_id=tenant_id, cena=db_sesija.cena, status="placeno", nacin_placanja=nacin_placanja, datum_uplate=datum_uplate, sesija_2_id=sesija_id, klijent_1_id=sk.klijent_id)
        database.add(db_cena)
    elif sg and sg.grupa_id:
        group_members = database.query(GrupaKlijent).filter(GrupaKlijent.grupa_id == sg.grupa_id, GrupaKlijent.tenant_id == tenant_id).all()
        if not group_members:
            db_cena = Cena(tenant_id=tenant_id, cena=db_sesija.cena, status="placeno", nacin_placanja=nacin_placanja, datum_uplate=datum_uplate, sesija_2_id=sesija_id, klijent_1_id=None)
            database.add(db_cena)
        else:
            for gk in group_members:
                db_cena = Cena(tenant_id=tenant_id, cena=db_sesija.cena, status="placeno", nacin_placanja=nacin_placanja, datum_uplate=datum_uplate, sesija_2_id=sesija_id, klijent_1_id=gk.klijent_id)
                database.add(db_cena)
    else:
        db_cena = Cena(tenant_id=tenant_id, cena=db_sesija.cena, status="placeno", nacin_placanja=nacin_placanja, datum_uplate=datum_uplate, sesija_2_id=sesija_id, klijent_1_id=None)
        database.add(db_cena)

    database.commit()
    return {"message": "Sesija oznacena kao placena", "sesija_id": sesija_id}


# ============================================
# UPDATE SESIJA — tenant-aware
# ============================================
@app.put("/sesija/{sesija_id}/", response_model=None, tags=["Sesija"])
async def update_sesija(
    sesija_id: int,
    sesija_data: SesijaCreate,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
) -> Sesija:

    db_sesija = database.query(Sesija).filter(Sesija.id == sesija_id, Sesija.tenant_id == tenant_id).first()
    if db_sesija is None:
        raise HTTPException(status_code=404, detail="Sesija not found")

    setattr(db_sesija, 'cena', sesija_data.cena)
    setattr(db_sesija, 'status', sesija_data.status)
    setattr(db_sesija, 'pocetak', sesija_data.pocetak)
    setattr(db_sesija, 'kraj', sesija_data.kraj)

    if sesija_data.uplate is not None:
        database.query(Cena).filter(Cena.sesija_2_id == db_sesija.id, Cena.tenant_id == tenant_id).update({Cena.sesija_2_id: None}, synchronize_session=False)
        if sesija_data.uplate:
            for cena_id in sesija_data.uplate:
                db_cena = database.query(Cena).filter(Cena.id == cena_id, Cena.tenant_id == tenant_id).first()
                if not db_cena:
                    raise HTTPException(status_code=400, detail=f"Cena with id {cena_id} not found")
            database.query(Cena).filter(Cena.id.in_(sesija_data.uplate), Cena.tenant_id == tenant_id).update({Cena.sesija_2_id: db_sesija.id}, synchronize_session=False)

    if sesija_data.sesijaklijent_1 is not None:
        database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == db_sesija.id, SesijaKlijent.tenant_id == tenant_id).update({SesijaKlijent.sesija_id: None}, synchronize_session=False)
        if sesija_data.sesijaklijent_1:
            for sesijaklijent_id in sesija_data.sesijaklijent_1:
                db_sesijaklijent = database.query(SesijaKlijent).filter(SesijaKlijent.id == sesijaklijent_id, SesijaKlijent.tenant_id == tenant_id).first()
                if not db_sesijaklijent:
                    raise HTTPException(status_code=400, detail=f"SesijaKlijent with id {sesijaklijent_id} not found")
            database.query(SesijaKlijent).filter(SesijaKlijent.id.in_(sesija_data.sesijaklijent_1), SesijaKlijent.tenant_id == tenant_id).update({SesijaKlijent.sesija_id: db_sesija.id}, synchronize_session=False)

    if sesija_data.sesijagrupa_1 is not None:
        database.query(SesijaGrupa).filter(SesijaGrupa.sesija_1_id == db_sesija.id, SesijaGrupa.tenant_id == tenant_id).update({SesijaGrupa.sesija_1_id: None}, synchronize_session=False)
        if sesija_data.sesijagrupa_1:
            for sesijagrupa_id in sesija_data.sesijagrupa_1:
                db_sesijagrupa = database.query(SesijaGrupa).filter(SesijaGrupa.id == sesijagrupa_id, SesijaGrupa.tenant_id == tenant_id).first()
                if not db_sesijagrupa:
                    raise HTTPException(status_code=400, detail=f"SesijaGrupa with id {sesijagrupa_id} not found")
            database.query(SesijaGrupa).filter(SesijaGrupa.id.in_(sesija_data.sesijagrupa_1), SesijaGrupa.tenant_id == tenant_id).update({SesijaGrupa.sesija_1_id: db_sesija.id}, synchronize_session=False)

    is_group_session = False

    if sesija_data.klijent_id:
        database.query(SesijaGrupa).filter(SesijaGrupa.sesija_1_id == db_sesija.id, SesijaGrupa.tenant_id == tenant_id).delete()
        database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == db_sesija.id, SesijaKlijent.tenant_id == tenant_id).delete()
        klijent = database.query(Klijent).filter(Klijent.id == sesija_data.klijent_id, Klijent.tenant_id == tenant_id).first()
        if klijent:
            new_sk = SesijaKlijent(tenant_id=tenant_id, klijent_id=klijent.id, sesija_id=db_sesija.id)
            database.add(new_sk)
    elif sesija_data.grupa_id:
        is_group_session = True
        database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == db_sesija.id, SesijaKlijent.tenant_id == tenant_id).delete()
        database.query(SesijaGrupa).filter(SesijaGrupa.sesija_1_id == db_sesija.id, SesijaGrupa.tenant_id == tenant_id).delete()
        grupa = database.query(Grupa).filter(Grupa.id == sesija_data.grupa_id, Grupa.tenant_id == tenant_id).first()
        if grupa:
            new_sg = SesijaGrupa(tenant_id=tenant_id, grupa_id=grupa.id, sesija_1_id=db_sesija.id)
            database.add(new_sg)

    database.commit()
    database.refresh(db_sesija)

    # Send emails
    client_name = "Klijent"
    client_email = None

    if is_group_session and sesija_data.grupa_id:
        grupa = database.query(Grupa).filter(Grupa.id == sesija_data.grupa_id, Grupa.tenant_id == tenant_id).first()
        if grupa:
            group_members = database.query(GrupaKlijent).filter(GrupaKlijent.grupa_id == grupa.id, GrupaKlijent.tenant_id == tenant_id).all()
            member_emails = []
            for gk in group_members:
                member = database.query(Klijent).filter(Klijent.id == gk.klijent_id, Klijent.tenant_id == tenant_id).first()
                if member:
                    member_emails.append({"name": f"{member.ime} {member.prezime}", "email": member.email})
            try:
                send_session_email_to_group(action="updated", grupa_naziv=grupa.naziv, pocetak=db_sesija.pocetak, kraj=db_sesija.kraj, cena=db_sesija.cena, client_emails=member_emails, therapist_email=resolve_therapist_email(tenant_id, db_sesija.therapist_id, database))
            except Exception as e:
                logger.error(f"Failed to send group email: {e}")
    else:
        if sesija_data.klijent_id:
            klijent = database.query(Klijent).filter(Klijent.id == sesija_data.klijent_id, Klijent.tenant_id == tenant_id).first()
            if klijent:
                client_name = f"{klijent.ime} {klijent.prezime}"
                client_email = klijent.email
        else:
            sk = database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == db_sesija.id, SesijaKlijent.tenant_id == tenant_id).first()
            if sk and sk.klijent_id:
                klijent = database.query(Klijent).filter(Klijent.id == sk.klijent_id, Klijent.tenant_id == tenant_id).first()
                if klijent:
                    client_name = f"{klijent.ime} {klijent.prezime}"
                    client_email = klijent.email
        try:
            send_session_email(action="updated", client_name=client_name, pocetak=db_sesija.pocetak, kraj=db_sesija.kraj, cena=db_sesija.cena, client_email=client_email, therapist_email=resolve_therapist_email(tenant_id, db_sesija.therapist_id, database))
        except Exception as e:
            logger.error(f"Failed to send email: {e}")

    cena_ids = database.query(Cena.id).filter(Cena.sesija_2_id == db_sesija.id, Cena.tenant_id == tenant_id).all()
    sesijaklijent_1_ids = database.query(SesijaKlijent.id).filter(SesijaKlijent.sesija_id == db_sesija.id, SesijaKlijent.tenant_id == tenant_id).all()
    sesijagrupa_1_ids = database.query(SesijaGrupa.id).filter(SesijaGrupa.sesija_1_id == db_sesija.id, SesijaGrupa.tenant_id == tenant_id).all()

    return {
        "sesija": db_sesija,
        "cena_ids": [x[0] for x in cena_ids],
        "sesijaklijent_1_ids": [x[0] for x in sesijaklijent_1_ids],
        "sesijagrupa_1_ids": [x[0] for x in sesijagrupa_1_ids]
    }


def _delete_sesija_with_links(database: Session, sesija: "Sesija"):
    """Postgres enforces foreign keys, so a session's client/group links
    and payments have to go before the session itself."""
    database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == sesija.id).delete(synchronize_session=False)
    database.query(SesijaGrupa).filter(SesijaGrupa.sesija_1_id == sesija.id).delete(synchronize_session=False)
    database.query(Cena).filter(Cena.sesija_2_id == sesija.id).delete(synchronize_session=False)
    database.delete(sesija)


def _session_has_other_participants(database: Session, sesija_id: int) -> bool:
    return (
        database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == sesija_id).count() > 0
        or database.query(SesijaGrupa).filter(SesijaGrupa.sesija_1_id == sesija_id).count() > 0
    )


def _delete_klijent_with_links(database: Session, klijent: "Klijent"):
    """Deleting a client also deletes their individual sessions (and those
    sessions' payments) and their notes, and removes them from groups.
    Group sessions and sessions shared with other clients are kept - the
    client is only taken off them."""
    links = database.query(SesijaKlijent).filter(SesijaKlijent.klijent_id == klijent.id).all()
    session_ids = {l.sesija_id for l in links}
    for l in links:
        database.delete(l)
    database.flush()

    for sesija_id in session_ids:
        sesija = database.query(Sesija).filter(Sesija.id == sesija_id).first()
        if sesija and not _session_has_other_participants(database, sesija_id):
            _delete_sesija_with_links(database, sesija)

    database.query(Cena).filter(Cena.klijent_1_id == klijent.id).delete(synchronize_session=False)
    database.query(KlijentNapomena).filter(KlijentNapomena.klijent_id == klijent.id).delete(synchronize_session=False)
    database.query(GrupaKlijent).filter(GrupaKlijent.klijent_id == klijent.id).delete(synchronize_session=False)
    database.delete(klijent)


@app.delete("/sesija/{sesija_id}/", tags=["Sesija"])
async def delete_sesija(
    sesija_id: int,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    db_sesija = database.query(Sesija).filter(Sesija.id == sesija_id, Sesija.tenant_id == tenant_id).first()
    if db_sesija is None:
        raise HTTPException(status_code=404, detail="Sesija not found")
    affected_client_ids = [
        l.klijent_id for l in database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == sesija_id).all()
    ]
    _delete_sesija_with_links(database, db_sesija)
    database.flush()
    for cid in affected_client_ids:
        _recompute_client_free_sessions(database, cid)
    database.commit()
    return {"message": "Deleted", "id": sesija_id}


############################################
# Grupa endpoints
############################################

@app.get("/grupa/", tags=["Grupa"])
def get_all_grupa(
    tenant_id: int = Depends(require_active_subscription),
    detailed: bool = False,
    database: Session = Depends(get_db)
):
    grupa_list = database.query(Grupa).filter(Grupa.tenant_id == tenant_id).all()

    if not detailed:
        result = []
        for g in grupa_list:
            item = g.__dict__.copy()
            item.pop('_sa_instance_state', None)
            member_count = database.query(GrupaKlijent).filter(GrupaKlijent.grupa_id == g.id, GrupaKlijent.tenant_id == tenant_id).count()
            item["broj_clanova"] = member_count
            result.append(item)
        return result

    result = []
    for grupa_item in grupa_list:
        item_dict = grupa_item.__dict__.copy()
        item_dict.pop('_sa_instance_state', None)

        sesijagrupa_list = database.query(SesijaGrupa).filter(SesijaGrupa.grupa_id == grupa_item.id, SesijaGrupa.tenant_id == tenant_id).all()
        item_dict["sesijagrupa"] = [{k: v for k, v in x.__dict__.items() if k != "_sa_instance_state"} for x in sesijagrupa_list]

        gk_list = database.query(GrupaKlijent).filter(GrupaKlijent.grupa_id == grupa_item.id, GrupaKlijent.tenant_id == tenant_id).all()
        clanovi = []
        for gk in gk_list:
            klijent = database.query(Klijent).filter(Klijent.id == gk.klijent_id, Klijent.tenant_id == tenant_id).first()
            if klijent:
                kd = klijent.__dict__.copy()
                kd.pop("_sa_instance_state", None)
                clanovi.append(kd)

        item_dict["clanovi"] = clanovi
        result.append(item_dict)

    return result


@app.get("/grupa/count/", tags=["Grupa"])
def get_count_grupa(
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    return {"count": database.query(Grupa).filter(Grupa.tenant_id == tenant_id).count()}


@app.get("/grupa/paginated/", tags=["Grupa"])
def get_paginated_grupa(
    tenant_id: int = Depends(require_active_subscription),
    skip: int = 0,
    limit: int = 100,
    database: Session = Depends(get_db)
):
    query = database.query(Grupa).filter(Grupa.tenant_id == tenant_id)
    total = query.count()
    grupa_list = query.offset(skip).limit(limit).all()
    return {"total": total, "skip": skip, "limit": limit, "data": grupa_list}


@app.get("/grupa/search/", tags=["Grupa"])
def search_grupa(
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    return database.query(Grupa).filter(Grupa.tenant_id == tenant_id).all()


@app.get("/grupa/{grupa_id}/", tags=["Grupa"])
def get_grupa(
    grupa_id: int,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    db_grupa = database.query(Grupa).filter(Grupa.id == grupa_id, Grupa.tenant_id == tenant_id).first()
    if db_grupa is None:
        raise HTTPException(status_code=404, detail="Grupa not found")
    return db_grupa


@app.post("/grupa/", tags=["Grupa"])
def create_grupa(
    grupa_data: GrupaCreate,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    db_grupa = Grupa(
        tenant_id=tenant_id,
        opis=grupa_data.opis,
        cena=grupa_data.cena,
        naziv=grupa_data.naziv
    )
    database.add(db_grupa)
    database.commit()
    database.refresh(db_grupa)

    if grupa_data.clanovi:
        for klijent_id in grupa_data.clanovi:
            db_klijent = database.query(Klijent).filter(Klijent.id == klijent_id, Klijent.tenant_id == tenant_id).first()
            if not db_klijent:
                raise HTTPException(status_code=400, detail=f"Klijent {klijent_id} not found")
            database.add(GrupaKlijent(tenant_id=tenant_id, grupa_id=db_grupa.id, klijent_id=klijent_id))
        database.commit()

    return db_grupa


@app.delete("/grupa/{grupa_id}/", tags=["Grupa"])
def delete_grupa(
    grupa_id: int,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    db_grupa = database.query(Grupa).filter(Grupa.id == grupa_id, Grupa.tenant_id == tenant_id).first()
    if not db_grupa:
        raise HTTPException(status_code=404, detail="Grupa not found")

    # Sessions that belonged only to this group go with it; sessions that
    # also have individual clients just lose the group link.
    group_session_ids = [
        l.sesija_1_id for l in database.query(SesijaGrupa).filter(SesijaGrupa.grupa_id == grupa_id).all()
    ]
    database.query(SesijaGrupa).filter(SesijaGrupa.grupa_id == grupa_id).delete(synchronize_session=False)
    database.flush()
    for sid in group_session_ids:
        sesija = database.query(Sesija).filter(Sesija.id == sid, Sesija.tenant_id == tenant_id).first()
        if sesija and not _session_has_other_participants(database, sid):
            _delete_sesija_with_links(database, sesija)
    database.query(GrupaKlijent).filter(GrupaKlijent.grupa_id == grupa_id, GrupaKlijent.tenant_id == tenant_id).delete()
    database.delete(db_grupa)
    database.commit()
    return {"message": "Deleted", "id": grupa_id}


############################################
# Klijent endpoints
############################################

@app.get("/klijent/", tags=["Klijent"])
def get_all_klijent(
    tenant_id: int = Depends(require_active_subscription),
    detailed: bool = False,
    database: Session = Depends(get_db)
):
    klijent_list = database.query(Klijent).filter(Klijent.tenant_id == tenant_id).all()

    if not detailed:
        return klijent_list

    result = []
    for klijent_item in klijent_list:
        item_dict = klijent_item.__dict__.copy()
        item_dict.pop('_sa_instance_state', None)

        sesijaklijent_list = database.query(SesijaKlijent).filter(SesijaKlijent.klijent_id == klijent_item.id, SesijaKlijent.tenant_id == tenant_id).all()
        item_dict["sesijaklijent"] = [{k: v for k, v in x.__dict__.items() if k != "_sa_instance_state"} for x in sesijaklijent_list]

        cena_list = database.query(Cena).filter(Cena.klijent_1_id == klijent_item.id, Cena.tenant_id == tenant_id).all()
        item_dict["cena_1"] = [{k: v for k, v in x.__dict__.items() if k != "_sa_instance_state"} for x in cena_list]

        result.append(item_dict)

    return result


@app.get("/klijent/count/", tags=["Klijent"])
def get_count_klijent(
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    return {"count": database.query(Klijent).filter(Klijent.tenant_id == tenant_id).count()}


@app.get("/klijent/paginated/", tags=["Klijent"])
def get_paginated_klijent(
    tenant_id: int = Depends(require_active_subscription),
    skip: int = 0,
    limit: int = 100,
    database: Session = Depends(get_db)
):
    query = database.query(Klijent).filter(Klijent.tenant_id == tenant_id)
    total = query.count()
    klijent_list = query.offset(skip).limit(limit).all()
    return {"total": total, "skip": skip, "limit": limit, "data": klijent_list}


@app.get("/klijent/search/", tags=["Klijent"])
def search_klijent(
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    return database.query(Klijent).filter(Klijent.tenant_id == tenant_id).all()


@app.get("/klijent/{klijent_id}/", tags=["Klijent"])
def get_klijent(
    klijent_id: int,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    db_klijent = database.query(Klijent).filter(Klijent.id == klijent_id, Klijent.tenant_id == tenant_id).first()
    if db_klijent is None:
        raise HTTPException(status_code=404, detail="Klijent not found")
    return db_klijent


@app.post("/klijent/", tags=["Klijent"])
def create_klijent(
    request: Request,
    klijent_data: KlijentCreate,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    member = get_current_member_soft(request, tenant_id, database)
    db_klijent = Klijent(
        tenant_id=tenant_id,
        ime=klijent_data.ime,
        prezime=klijent_data.prezime,
        email=klijent_data.email,
        broj_telefona=klijent_data.broj_telefona,
        therapist_id=member.id if member else None,
    )
    database.add(db_klijent)
    database.commit()
    database.refresh(db_klijent)
    return db_klijent


@app.post("/klijent/bulk/", tags=["Klijent"])
def bulk_create_klijent(
    items: list[KlijentCreate],
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    created_ids = []
    try:
        for item in items:
            db_klijent = Klijent(
                tenant_id=tenant_id,
                ime=item.ime,
                prezime=item.prezime,
                email=item.email,
                broj_telefona=item.broj_telefona
            )
            database.add(db_klijent)
            database.flush()
            created_ids.append(db_klijent.id)
        database.commit()
    except Exception as e:
        database.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    return {"created_count": len(created_ids), "created_ids": created_ids}


@app.delete("/klijent/bulk/", tags=["Klijent"])
def bulk_delete_klijent(
    ids: list[int],
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    deleted = 0
    for item_id in ids:
        obj = database.query(Klijent).filter(Klijent.id == item_id, Klijent.tenant_id == tenant_id).first()
        if obj:
            _delete_klijent_with_links(database, obj)
            deleted += 1
    database.commit()
    return {"deleted_count": deleted}


@app.put("/klijent/{klijent_id}/", tags=["Klijent"])
def update_klijent(
    klijent_id: int,
    klijent_data: KlijentCreate,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    db_klijent = database.query(Klijent).filter(Klijent.id == klijent_id, Klijent.tenant_id == tenant_id).first()
    if not db_klijent:
        raise HTTPException(status_code=404, detail="Klijent not found")

    db_klijent.ime = klijent_data.ime
    db_klijent.prezime = klijent_data.prezime
    db_klijent.email = klijent_data.email
    db_klijent.broj_telefona = klijent_data.broj_telefona

    database.commit()
    database.refresh(db_klijent)
    return db_klijent


@app.delete("/klijent/{klijent_id}/", tags=["Klijent"])
def delete_klijent(
    klijent_id: int,
    tenant_id: int = Depends(require_active_subscription),
    database: Session = Depends(get_db)
):
    db_klijent = database.query(Klijent).filter(Klijent.id == klijent_id, Klijent.tenant_id == tenant_id).first()
    if not db_klijent:
        raise HTTPException(status_code=404, detail="Klijent not found")
    _delete_klijent_with_links(database, db_klijent)
    database.commit()
    return {"message": "Deleted", "id": klijent_id}


############################################
#
#   Client Notes & Progress
#
############################################

NAPOMENA_KATEGORIJE = {"opste", "napredak", "cilj", "upozorenje"}


class KlijentNapomenaCreate(BaseModel):
    tekst: str
    kategorija: str = "opste"
    author_name: str | None = None


def _napomena_payload(n: KlijentNapomena) -> dict:
    return {
        "id": n.id,
        "klijent_id": n.klijent_id,
        "tekst": n.tekst,
        "kategorija": n.kategorija,
        "author_name": n.author_name,
        "created_at": n.created_at.isoformat(),
    }


@app.get("/klijent/{klijent_id}/napomene", tags=["Klijent"])
def list_klijent_napomene(
        klijent_id: int,
        tenant_id: int = Depends(require_active_subscription),
        database: Session = Depends(get_db),
):
    klijent = database.query(Klijent).filter(
        Klijent.id == klijent_id, Klijent.tenant_id == tenant_id
    ).first()
    if not klijent:
        raise HTTPException(status_code=404, detail="Klijent not found")

    notes = database.query(KlijentNapomena).filter(
        KlijentNapomena.klijent_id == klijent_id, KlijentNapomena.tenant_id == tenant_id
    ).order_by(KlijentNapomena.created_at.desc()).all()
    return [_napomena_payload(n) for n in notes]


@app.post("/klijent/{klijent_id}/napomene", tags=["Klijent"])
def create_klijent_napomena(
        klijent_id: int,
        data: KlijentNapomenaCreate,
        tenant_id: int = Depends(require_active_subscription),
        database: Session = Depends(get_db),
):
    klijent = database.query(Klijent).filter(
        Klijent.id == klijent_id, Klijent.tenant_id == tenant_id
    ).first()
    if not klijent:
        raise HTTPException(status_code=404, detail="Klijent not found")
    if not data.tekst.strip():
        raise HTTPException(status_code=400, detail="Napomena ne može biti prazna")

    note = KlijentNapomena(
        tenant_id=tenant_id,
        klijent_id=klijent_id,
        tekst=data.tekst.strip(),
        kategorija=data.kategorija if data.kategorija in NAPOMENA_KATEGORIJE else "opste",
        author_name=data.author_name,
    )
    database.add(note)
    database.commit()
    database.refresh(note)
    return _napomena_payload(note)


@app.delete("/klijent/{klijent_id}/napomene/{napomena_id}", tags=["Klijent"])
def delete_klijent_napomena(
        klijent_id: int,
        napomena_id: int,
        tenant_id: int = Depends(require_active_subscription),
        database: Session = Depends(get_db),
):
    note = database.query(KlijentNapomena).filter(
        KlijentNapomena.id == napomena_id,
        KlijentNapomena.klijent_id == klijent_id,
        KlijentNapomena.tenant_id == tenant_id,
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Napomena not found")
    database.delete(note)
    database.commit()
    return {"message": "Deleted", "id": napomena_id}


@app.get("/klijent/{klijent_id}/sesije", tags=["Klijent"])
def list_klijent_sesije(
        klijent_id: int,
        tenant_id: int = Depends(require_active_subscription),
        database: Session = Depends(get_db),
):
    """A client's session history, for the progress view - reuses the
    SesijaKlijent links rather than trusting a client-supplied filter."""
    klijent = database.query(Klijent).filter(
        Klijent.id == klijent_id, Klijent.tenant_id == tenant_id
    ).first()
    if not klijent:
        raise HTTPException(status_code=404, detail="Klijent not found")

    sesija_ids = [
        row.sesija_id for row in database.query(SesijaKlijent).filter(
            SesijaKlijent.klijent_id == klijent_id, SesijaKlijent.tenant_id == tenant_id
        ).all()
    ]
    sessions = (
        database.query(Sesija)
        .filter(Sesija.id.in_(sesija_ids), Sesija.tenant_id == tenant_id)
        .order_by(Sesija.pocetak.desc())
        .all()
        if sesija_ids else []
    )
    return [
        {
            "id": s.id,
            "pocetak": s.pocetak.isoformat(),
            "kraj": s.kraj.isoformat(),
            "cena": s.cena,
            "status": s.status,
        }
        for s in sessions
    ]


############################################
#
#   Client-Facing Matching & Public Booking
#
############################################

SLOT_MINUTES = 60


def compute_available_slots(tenant_id: int, database: Session, days: int = 14):
    """Working hours minus already-booked sessions, as 1-hour blocks for the
    next `days` days. Naive local datetimes throughout, consistent with how
    Sesija.pocetak/kraj are already stored and used elsewhere in this app."""
    tenant = database.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant or not tenant.working_hours:
        return []

    try:
        hours_by_weekday = json.loads(tenant.working_hours)
    except (json.JSONDecodeError, TypeError):
        return []

    now = datetime.utcnow()
    range_end = now + timedelta(days=days)

    existing_sessions = database.query(Sesija).filter(
        Sesija.tenant_id == tenant_id,
        Sesija.status != "otkazano",
        Sesija.kraj >= now,
        Sesija.pocetak <= range_end,
    ).all()
    booked_ranges = [(s.pocetak, s.kraj) for s in existing_sessions]

    def overlaps(start, end):
        return any(start < b_end and end > b_start for b_start, b_end in booked_ranges)

    slots = []
    for i in range(days):
        day = (now + timedelta(days=i)).date()
        config = hours_by_weekday.get(str(day.weekday()))
        if not config or not config.get("active"):
            continue
        try:
            start_h, start_m = (int(x) for x in config["start"].split(":"))
            end_h, end_m = (int(x) for x in config["end"].split(":"))
        except (KeyError, ValueError, AttributeError):
            continue

        cursor = datetime.combine(day, dt_time(start_h, start_m))
        day_end = datetime.combine(day, dt_time(end_h, end_m))

        while cursor + timedelta(minutes=SLOT_MINUTES) <= day_end:
            slot_end = cursor + timedelta(minutes=SLOT_MINUTES)
            if cursor > now and not overlaps(cursor, slot_end):
                slots.append({"start": cursor, "end": slot_end})
            cursor = slot_end

    slots.sort(key=lambda s: s["start"])
    return slots


MAX_PHOTO_DATA_URL_LENGTH = 2_000_000  # ~1.4MB decoded - plenty for a resized avatar


def _validate_photo_url(photo_url: str | None) -> None:
    if photo_url and len(photo_url) > MAX_PHOTO_DATA_URL_LENGTH:
        raise HTTPException(status_code=400, detail="Slika je prevelika.")


class TenantSettingsUpdate(BaseModel):
    name: str | None = None
    specialties: list[str] | None = None
    working_hours: dict | None = None
    default_price: float | None = None
    photo_url: str | None = None


def _tenant_settings_payload(tenant: Tenant) -> dict:
    return {
        "tenant_id": tenant.id,
        "name": tenant.name,
        "specialties": tenant.specialties.split(",") if tenant.specialties else [],
        "working_hours": json.loads(tenant.working_hours) if tenant.working_hours else {},
        "default_price": tenant.default_price,
        "photo_url": tenant.photo_url,
    }


@app.get("/tenant/settings", tags=["Tenant"])
def get_tenant_settings(
        tenant_id: int = Depends(get_tenant_id),
        database: Session = Depends(get_db)
):
    tenant = database.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return _tenant_settings_payload(tenant)


@app.put("/tenant/settings", tags=["Tenant"])
def update_tenant_settings(
        data: TenantSettingsUpdate,
        tenant_id: int = Depends(get_tenant_id),
        database: Session = Depends(get_db)
):
    tenant = database.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if data.name is not None and data.name.strip():
        tenant.name = data.name.strip()
    if data.specialties is not None:
        tenant.specialties = ",".join(s.strip() for s in data.specialties if s.strip())
    if data.working_hours is not None:
        tenant.working_hours = json.dumps(data.working_hours)
    if data.default_price is not None:
        tenant.default_price = data.default_price
    if data.photo_url is not None:
        _validate_photo_url(data.photo_url)
        tenant.photo_url = data.photo_url or None

    database.commit()
    database.refresh(tenant)
    return _tenant_settings_payload(tenant)


def get_owner_name(tenant_id: int, database: Session) -> str:
    """The individual therapist's name to show clients, instead of the
    practice name - the tenant's owner. Falls back to their email, then to
    the practice name if somehow neither exists."""
    owner = database.query(UserProfile).filter(
        UserProfile.tenant_id == tenant_id, UserProfile.role == "owner"
    ).first()
    if owner:
        return owner.full_name or owner.email
    return ""


@app.get("/public/therapists", tags=["Public"])
def public_search_therapists(
        tags: str = "",
        database: Session = Depends(get_db)
):
    """Cross-tenant client-facing search. No tenant header - same public,
    read-only trust model as /auth/invite-info."""
    requested = {t.strip() for t in tags.split(",") if t.strip()}

    tenants = database.query(Tenant).filter(
        Tenant.specialties.isnot(None), Tenant.specialties != ""
    ).all()

    results = []
    for tenant in tenants:
        tenant_tags = {t.strip() for t in tenant.specialties.split(",") if t.strip()}
        matched = (tenant_tags & requested) if requested else tenant_tags
        if requested and not matched:
            continue

        slots = compute_available_slots(tenant.id, database)
        if not slots:
            continue

        results.append({
            "tenant_id": tenant.id,
            "name": tenant.name,
            "therapist_name": get_owner_name(tenant.id, database) or tenant.name,
            "photo_url": tenant.photo_url,
            "specialties": sorted(tenant_tags),
            "matched_tags": sorted(matched),
            "match_count": len(matched),
            "next_available": slots[0]["start"].isoformat(),
        })

    results.sort(key=lambda r: (-r["match_count"], r["next_available"]))
    return results


@app.get("/public/therapists/{tenant_id}/availability", tags=["Public"])
def public_therapist_availability(
        tenant_id: int,
        days: int = 14,
        database: Session = Depends(get_db)
):
    tenant = database.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    slots = compute_available_slots(tenant_id, database, days=min(days, 30))
    return {
        "tenant_id": tenant.id,
        "name": tenant.name,
        "therapist_name": get_owner_name(tenant_id, database) or tenant.name,
        "photo_url": tenant.photo_url,
        "slots": [
            {"start": s["start"].isoformat(), "end": s["end"].isoformat()}
            for s in slots
        ],
    }


############################################
#
#   Public support-request intake (current flow)
#
#   Per product decision, the public "Find a Therapist" page no longer
#   matches/lists therapists or lets a client pick a specific slot - it
#   just collects what's troubling them (categories + a free-text
#   description) plus contact info, and an admin manually assigns a
#   therapist afterward. Everything below public_search_therapists is the
#   PREVIOUS therapist-matching/self-booking flow, kept but no longer
#   wired to the frontend (see the comment near public_book_session).
#
############################################

PUBLIC_INTAKE_TENANT_NAME = "Javni zahtevi (sajt)"


def _get_or_create_public_intake_tenant(db: Session) -> "Tenant":
    """A single dedicated tenant that public website requests are filed
    under. There's no specific practice/therapist chosen by the client
    anymore (an admin assigns one manually afterward), so these records
    need somewhere to live that isn't tied to any real practice. The
    admin area reads across every tenant regardless, so which tenant
    this is doesn't affect what an admin sees."""
    tenant = db.query(Tenant).filter(Tenant.name == PUBLIC_INTAKE_TENANT_NAME).first()
    if not tenant:
        tenant = Tenant(
            name=PUBLIC_INTAKE_TENANT_NAME,
            trial_ends_at=datetime.utcnow() + timedelta(days=36500),
        )
        db.add(tenant)
        db.flush()
    return tenant


class PublicIntakeRequest(BaseModel):
    ime: str
    prezime: str
    email: str
    telefon: str | None = None
    tags: list[str] = []  # human-readable category labels, not slugs
    opis: str | None = None


def send_public_support_request_email(klijent: "Klijent", data: "PublicIntakeRequest"):
    """Notifies the center admin of a new support request so they can
    review it and assign the client to the appropriate therapist - a
    failure here must never block the client's submission, hence the
    wrapped try/except."""
    tags_label = ", ".join(data.tags) if data.tags else "—"
    opis_row = (
        f'<div style="font-size:14px;color:#555;margin-top:12px;"><strong>Opis situacije:</strong> {data.opis}</div>'
        if data.opis else ""
    )
    html = f"""
<div style="background:#f2f2f7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#1a1a1a;">
<div style="max-width:520px;margin:auto;">
<div style="background:#fff;border-radius:16px;padding:28px 24px 24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="font-size:22px;margin-bottom:8px;">📩 Novi zahtev za podršku</div>
<div style="font-size:15px;color:#1a1a1a;">Klijent je preko sajta poslao zahtev. Dodelite terapeuta ručno u Admin centru (Klijenti).</div>
</div>
<div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="border:1.5px dashed #d1d5db;border-radius:12px;padding:20px;">
<div style="font-size:15px;font-weight:600;color:#111;margin-bottom:6px;">{klijent.ime} {klijent.prezime}</div>
<div style="font-size:14px;color:#555;">{klijent.email}{" · " + klijent.broj_telefona if klijent.broj_telefona else ""}</div>
<div style="font-size:14px;color:#555;margin-top:10px;">🏷️ Oblasti: {tags_label}</div>
{opis_row}
</div>
</div>
<div style="text-align:center;font-size:13px;color:#9ca3af;margin-top:14px;line-height:1.5;">
<strong style="color:#6b7280;">PsihoApp</strong>
</div>
</div>
</div>
"""
    try:
        resend.Emails.send({
            "from": "PsihoApp <noreply@hrioapp.com>",
            "to": [PUBLIC_INTAKE_NOTIFY_EMAIL],
            "subject": f"📩 Novi zahtev za podršku - {klijent.ime} {klijent.prezime}",
            "html": html,
        })
    except Exception as e:
        logger.error(f"Failed to send public support-request email: {e}")


@app.post("/public/intake-request", tags=["Public"])
def public_intake_request(
        data: PublicIntakeRequest,
        database: Session = Depends(get_db),
):
    if not data.ime.strip() or not data.prezime.strip() or not data.email.strip():
        raise HTTPException(status_code=400, detail="Ime, prezime i email su obavezni")
    if not data.tags and not (data.opis and data.opis.strip()):
        raise HTTPException(status_code=400, detail="Izaberite bar jednu oblast ili opišite situaciju")

    tenant = _get_or_create_public_intake_tenant(database)

    klijent = database.query(Klijent).filter(
        Klijent.tenant_id == tenant.id, Klijent.email == data.email
    ).first()
    if not klijent:
        klijent = Klijent(
            tenant_id=tenant.id,
            ime=data.ime.strip(),
            prezime=data.prezime.strip(),
            email=data.email,
            broj_telefona=data.telefon or "",
        )
        database.add(klijent)

    database.commit()
    database.refresh(klijent)

    send_public_support_request_email(klijent, data)

    return {"klijent_ime": f"{klijent.ime} {klijent.prezime}"}


class PublicBookingRequest(BaseModel):
    ime: str
    prezime: str
    email: str
    telefon: str | None = None
    napomena: str | None = None
    pocetak: datetime
    kraj: datetime


def send_public_booking_emails(tenant_name, therapist_emails, klijent, sesija, napomena):
    """Best-effort notification emails for an online booking - a failure
    here must never block the booking itself, which is why every send is
    wrapped and only logged on error."""
    klijent_ime = f"{klijent.ime} {klijent.prezime}"

    try:
        client_html = f"""
<div style="background:#f2f2f7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#1a1a1a;">
<div style="max-width:520px;margin:auto;">
<div style="background:#fff;border-radius:16px;padding:28px 24px 24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="font-size:22px;margin-bottom:8px;">✅ Termin je zakazan</div>
<div style="font-size:15px;color:#1a1a1a;margin-bottom:4px;">Poštovani/a <strong>{klijent_ime}</strong>,</div>
<div style="font-size:15px;color:#1a1a1a;">Vaš termin kod <strong>{tenant_name}</strong> je uspešno zakazan.</div>
</div>
<div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="border:1.5px dashed #d1d5db;border-radius:12px;padding:20px;">
<div style="font-size:15px;color:#333;margin-bottom:10px;">📅 <strong>{format_date_long(sesija.pocetak)}</strong></div>
<div style="font-size:15px;font-weight:600;color:#111;">{format_time(sesija.pocetak)} – {format_time(sesija.kraj)}</div>
</div>
</div>
<div style="background:#fff;border-radius:16px;padding:20px 24px;margin-bottom:8px;text-align:center;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="font-size:13px;color:#777;line-height:1.5;"><strong>Pravila otkazivanja</strong><br>Termin se može otkazati najkasnije <strong>24 sata</strong> unapred.</div>
</div>
<div style="text-align:center;font-size:13px;color:#9ca3af;margin-top:14px;line-height:1.5;">
Hvala vam na poverenju. <strong style="color:#6b7280;">PsihoApp</strong>
</div>
</div>
</div>
"""
        resend.Emails.send({
            "from": "PsihoApp <noreply@hrioapp.com>",
            "to": [klijent.email],
            "subject": f"✅ Potvrda termina - {format_date_long(sesija.pocetak)}",
            "html": client_html,
        })
    except Exception as e:
        logger.error(f"Failed to send booking confirmation to client: {e}")

    if not therapist_emails:
        return

    try:
        napomena_row = (
            f'<div style="font-size:14px;color:#555;margin-top:12px;"><strong>Napomena klijenta:</strong> {napomena}</div>'
            if napomena else ""
        )
        therapist_html = f"""
<div style="background:#f2f2f7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#1a1a1a;">
<div style="max-width:520px;margin:auto;">
<div style="background:#fff;border-radius:16px;padding:28px 24px 24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="font-size:22px;margin-bottom:8px;">🔔 Novi termin zakazan online</div>
<div style="font-size:15px;color:#1a1a1a;">Klijent <strong>{klijent_ime}</strong> je preko "Pronađi terapeuta" zakazao termin.</div>
</div>
<div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="border:1.5px dashed #d1d5db;border-radius:12px;padding:20px;">
<div style="font-size:15px;color:#333;margin-bottom:10px;">📅 <strong>{format_date_long(sesija.pocetak)}</strong></div>
<div style="font-size:15px;font-weight:600;color:#111;margin-bottom:4px;">{format_time(sesija.pocetak)} – {format_time(sesija.kraj)}</div>
<div style="font-size:14px;color:#555;">{klijent_ime} · {klijent.email}{" · " + klijent.broj_telefona if klijent.broj_telefona else ""}</div>
{napomena_row}
</div>
</div>
<div style="text-align:center;font-size:13px;color:#9ca3af;margin-top:14px;line-height:1.5;">
<strong style="color:#6b7280;">PsihoApp</strong>
</div>
</div>
</div>
"""
        resend.Emails.send({
            "from": "PsihoApp <noreply@hrioapp.com>",
            "to": therapist_emails,
            "subject": f"🔔 Novo zakazivanje - {klijent_ime}",
            "html": therapist_html,
        })
    except Exception as e:
        logger.error(f"Failed to send booking notification to therapist: {e}")


def send_public_intake_request_email(tenant: "Tenant", klijent: "Klijent", data: "PublicBookingRequest"):
    """A client submitted a request through the public 'Find a Therapist'
    flow - notifies the center admin so a person assigns the client to
    the appropriate therapist, rather than the system auto-booking a
    confirmed session with whichever therapist happened to be matched."""
    napomena_row = (
        f'<div style="font-size:14px;color:#555;margin-top:12px;"><strong>Poruka klijenta:</strong> {data.napomena}</div>'
        if data.napomena else ""
    )
    html = f"""
<div style="background:#f2f2f7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#1a1a1a;">
<div style="max-width:520px;margin:auto;">
<div style="background:#fff;border-radius:16px;padding:28px 24px 24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="font-size:22px;margin-bottom:8px;">📩 Novi zahtev klijenta</div>
<div style="font-size:15px;color:#1a1a1a;">Klijent je preko stranice "Pronađi terapeuta" poslao zahtev za praksu <strong>{tenant.name}</strong>. Dodelite terapeuta ručno u Admin centru (Klijenti).</div>
</div>
<div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="border:1.5px dashed #d1d5db;border-radius:12px;padding:20px;">
<div style="font-size:15px;font-weight:600;color:#111;margin-bottom:6px;">{klijent.ime} {klijent.prezime}</div>
<div style="font-size:14px;color:#555;">{klijent.email}{" · " + klijent.broj_telefona if klijent.broj_telefona else ""}</div>
<div style="font-size:14px;color:#555;margin-top:10px;">📅 Traženi termin: <strong>{format_date_long(data.pocetak)}</strong>, {format_time(data.pocetak)}–{format_time(data.kraj)}</div>
<div style="font-size:14px;color:#555;margin-top:6px;">🏷️ Kategorije prakse: {tenant.specialties or "—"}</div>
{napomena_row}
</div>
</div>
<div style="text-align:center;font-size:13px;color:#9ca3af;margin-top:14px;line-height:1.5;">
<strong style="color:#6b7280;">PsihoApp</strong>
</div>
</div>
</div>
"""
    try:
        resend.Emails.send({
            "from": "PsihoApp <noreply@hrioapp.com>",
            "to": [PUBLIC_INTAKE_NOTIFY_EMAIL],
            "subject": f"📩 Novi zahtev klijenta - {klijent.ime} {klijent.prezime}",
            "html": html,
        })
    except Exception as e:
        logger.error(f"Failed to send public intake request email: {e}")


@app.post("/public/therapists/{tenant_id}/book", tags=["Public"])
def public_book_session(
        tenant_id: int,
        data: PublicBookingRequest,
        database: Session = Depends(get_db)
):
    tenant = database.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Re-validate server-side - the client only saw a snapshot of availability,
    # and this endpoint is unauthenticated so nothing about the request can be trusted.
    available = compute_available_slots(tenant_id, database)
    if not any(s["start"] == data.pocetak and s["end"] == data.kraj for s in available):
        raise HTTPException(status_code=409, detail="Traženi termin više nije dostupan")

    klijent = database.query(Klijent).filter(
        Klijent.tenant_id == tenant_id, Klijent.email == data.email
    ).first()
    if not klijent:
        klijent = Klijent(
            tenant_id=tenant_id,
            ime=data.ime,
            prezime=data.prezime,
            email=data.email,
            broj_telefona=data.telefon or "",
        )
        database.add(klijent)
        database.flush()

    # Disabled per product decision: the system no longer auto-books a
    # confirmed session with an automatically-matched therapist. An admin
    # now reviews each public request (emailed below) and assigns the
    # client to the appropriate therapist manually in the admin area.
    # Left here, commented out, in case this needs to be restored.
    #
    # sesija = Sesija(
    #     tenant_id=tenant_id,
    #     pocetak=data.pocetak,
    #     kraj=data.kraj,
    #     cena=tenant.default_price or 0,
    #     status="zakazano",
    # )
    # database.add(sesija)
    # database.flush()
    #
    # database.add(SesijaKlijent(
    #     tenant_id=tenant_id,
    #     klijent_id=klijent.id,
    #     sesija_id=sesija.id,
    # ))
    #
    # therapist_emails = [
    #     p.email for p in
    #     database.query(UserProfile).filter(UserProfile.tenant_id == tenant_id).all()
    # ]
    # send_public_booking_emails(tenant.name, therapist_emails, klijent, sesija, data.napomena)

    database.commit()
    database.refresh(klijent)

    send_public_intake_request_email(tenant, klijent, data)

    return {
        "tenant_name": tenant.name,
        "klijent_ime": f"{klijent.ime} {klijent.prezime}",
        "pocetak": data.pocetak.isoformat(),
        "kraj": data.kraj.isoformat(),
    }


def send_session_reminder_email(klijent, sesija, therapist_name):
    """Sends the 'day before' reminder to the client. Unlike the other
    email helpers here, this one is allowed to raise - the caller only
    marks reminder_sent once the send actually succeeds, so a transient
    failure gets retried on the next hourly cron run instead of being
    silently lost."""
    klijent_ime = f"{klijent.ime} {klijent.prezime}"
    html = f"""
<div style="background:#f2f2f7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#1a1a1a;">
<div style="max-width:520px;margin:auto;">
<div style="background:#fff;border-radius:16px;padding:28px 24px 24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="font-size:22px;margin-bottom:8px;">⏰ Podsetnik za sutra</div>
<div style="font-size:15px;color:#1a1a1a;margin-bottom:4px;">Poštovani/a <strong>{klijent_ime}</strong>,</div>
<div style="font-size:15px;color:#1a1a1a;">Podsećamo vas na termin kod <strong>{therapist_name}</strong> sutra.</div>
</div>
<div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="border:1.5px dashed #d1d5db;border-radius:12px;padding:20px;">
<div style="font-size:15px;color:#333;margin-bottom:10px;">📅 <strong>{format_date_long(sesija.pocetak)}</strong></div>
<div style="font-size:15px;font-weight:600;color:#111;">{format_time(sesija.pocetak)} – {format_time(sesija.kraj)}</div>
</div>
</div>
<div style="background:#fff;border-radius:16px;padding:20px 24px;margin-bottom:8px;text-align:center;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="font-size:13px;color:#777;line-height:1.5;"><strong>Pravila otkazivanja</strong><br>Termin se može otkazati najkasnije <strong>24 sata</strong> unapred.</div>
</div>
<div style="text-align:center;font-size:13px;color:#9ca3af;margin-top:14px;line-height:1.5;">
Vidimo se! <strong style="color:#6b7280;">PsihoApp</strong>
</div>
</div>
</div>
"""
    resend.Emails.send({
        "from": "PsihoApp <noreply@hrioapp.com>",
        "to": [klijent.email],
        "subject": f"⏰ Podsetnik: termin sutra u {format_time(sesija.pocetak)}",
        "html": html,
    })


@app.post("/internal/send-reminders", tags=["System"])
def send_session_reminders(
        x_internal_secret: str = Header(None, alias="X-Internal-Secret"),
        dry_run: bool = False,
        database: Session = Depends(get_db),
):
    """Triggered by an hourly external cron (see .github/workflows). Finds
    sessions starting 23-25h from now that haven't been reminded yet and
    emails the client. The 2-hour window means a session is covered by two
    consecutive hourly runs, so missing one run doesn't skip its reminder.

    dry_run=true reports exactly what would happen (matching sessions,
    whether Resend is configured) without sending any email or marking
    anything as reminded - safe to call to verify the pipeline is wired
    up correctly without risking a real send to a real client."""
    if not INTERNAL_CRON_SECRET or x_internal_secret != INTERNAL_CRON_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    now = datetime.utcnow()
    window_start = now + timedelta(hours=23)
    window_end = now + timedelta(hours=25)

    sessions = database.query(Sesija).filter(
        Sesija.status == "zakazano",
        Sesija.reminder_sent.is_(False),
        Sesija.pocetak >= window_start,
        Sesija.pocetak <= window_end,
    ).all()

    if dry_run:
        would_send = []
        would_skip = []
        for sesija in sessions:
            link = database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == sesija.id).first()
            klijent = database.query(Klijent).filter(Klijent.id == link.klijent_id).first() if link else None
            entry = {
                "sesija_id": sesija.id,
                "pocetak": sesija.pocetak.isoformat(),
                "klijent_name": f"{klijent.ime} {klijent.prezime}" if klijent else None,
                "has_email": bool(klijent and klijent.email),
            }
            (would_send if entry["has_email"] else would_skip).append(entry)
        return {
            "dry_run": True,
            "resend_api_key_configured": bool(resend.api_key),
            "checked": len(sessions),
            "would_send": would_send,
            "would_skip_no_email": would_skip,
        }

    sent = 0
    skipped = 0
    for sesija in sessions:
        link = database.query(SesijaKlijent).filter(
            SesijaKlijent.sesija_id == sesija.id
        ).first()
        klijent = (
            database.query(Klijent).filter(Klijent.id == link.klijent_id).first()
            if link else None
        )
        if not klijent or not klijent.email:
            skipped += 1
            continue

        therapist_name = get_owner_name(sesija.tenant_id, database)
        if not therapist_name:
            tenant = database.query(Tenant).filter(Tenant.id == sesija.tenant_id).first()
            therapist_name = tenant.name if tenant else "vašeg terapeuta"

        try:
            send_session_reminder_email(klijent, sesija, therapist_name)
        except Exception as e:
            logger.error(f"Failed to send reminder for session {sesija.id}: {e}")
            continue

        sesija.reminder_sent = True
        sent += 1

    database.commit()
    return {"checked": len(sessions), "sent": sent, "skipped": skipped}


############################################
#
#   Auth / User Profile endpoints
#   (paste this into main_api.py before `if __name__ == "__main__":`)
#
############################################

from pydantic import BaseModel as PydanticBaseModel


class RegisterProfileRequest(PydanticBaseModel):
    supabase_user_id: str
    email: str
    full_name: str | None = None
    practice_name: str


class LoginProfileRequest(PydanticBaseModel):
    supabase_user_id: str
    email: str | None = None
    full_name: str | None = None

class JoinTenantRequest(PydanticBaseModel):
    supabase_user_id: str
    email: str
    full_name: str | None = None
    invite_token: str


def create_invite_token(tenant_id: int) -> str:
    """Signed, expiring token that encodes a tenant_id for team-invite links."""
    payload = json.dumps({
        "tenant_id": tenant_id,
        "exp": int(time_module.time()) + INVITE_TOKEN_TTL_SECONDS,
    }).encode()
    payload_b64 = base64.urlsafe_b64encode(payload).rstrip(b"=").decode()
    sig = hmac.new(INVITE_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{payload_b64}.{sig}"


def verify_invite_token(token: str) -> int:
    """Validates a team-invite token and returns the tenant_id it encodes."""
    try:
        payload_b64, sig = token.split(".", 1)
        expected_sig = hmac.new(INVITE_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()[:32]
        if not hmac.compare_digest(sig, expected_sig):
            raise ValueError("bad signature")
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
        if payload["exp"] < time_module.time():
            raise HTTPException(status_code=400, detail="Link za pozivnicu je istekao")
        return int(payload["tenant_id"])
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Nevažeći link za pozivnicu")


@app.post("/auth/register-profile", tags=["Auth"])
def register_profile(
        data: RegisterProfileRequest,
        database: Session = Depends(get_db)
):
    """After Supabase signup, create a new tenant + user_profile."""
    existing = database.query(UserProfile).filter(
        UserProfile.supabase_user_id == data.supabase_user_id
    ).first()

    if existing:
        tenant = database.query(Tenant).filter(Tenant.id == existing.tenant_id).first()
        return {
            "user_id": existing.id,
            "supabase_user_id": existing.supabase_user_id,
            "email": existing.email,
            "full_name": existing.full_name,
            "role": existing.role,
            "is_admin": existing.is_admin,
            "is_approved": existing.is_approved,
            "tenant_id": existing.tenant_id,
            "tenant_name": tenant.name if tenant else ""
        }

    new_tenant = Tenant(
        name=data.practice_name,
        trial_ends_at=datetime.utcnow() + timedelta(days=30),
    )
    database.add(new_tenant)
    database.flush()

    # is_admin is NOT granted automatically here, even to a new tenant's
    # creator - it's a deliberate, separate permission (see
    # UserProfile.is_admin) granted only via BOOTSTRAP_ADMIN_EMAIL or by
    # an existing admin promoting someone through the admin area.
    new_profile = UserProfile(
        supabase_user_id=data.supabase_user_id,
        email=data.email,
        full_name=data.full_name,
        role="owner",
        tenant_id=new_tenant.id
    )
    database.add(new_profile)
    database.commit()
    database.refresh(new_profile)

    return {
        "user_id": new_profile.id,
        "supabase_user_id": new_profile.supabase_user_id,
        "email": new_profile.email,
        "full_name": new_profile.full_name,
        "role": new_profile.role,
        "is_admin": new_profile.is_admin,
        "is_approved": new_profile.is_approved,
        "tenant_id": new_tenant.id,
        "tenant_name": new_tenant.name
    }


@app.post("/auth/login-profile", tags=["Auth"])
def login_profile(
        data: LoginProfileRequest,
        database: Session = Depends(get_db)
):
    """After Supabase login, look up user_profile and return tenant_id."""
    profile = database.query(UserProfile).filter(
        UserProfile.supabase_user_id == data.supabase_user_id
    ).first()

    if not profile:
        tenant = Tenant(name="Default", trial_ends_at=datetime.utcnow() + timedelta(days=30))
        database.add(tenant)
        database.flush()

        # See register_profile above - is_admin is never granted automatically.
        profile = UserProfile(
            supabase_user_id=data.supabase_user_id,
            email=data.email,
            full_name=data.full_name,
            role="owner",
            tenant_id=tenant.id
        )

        database.add(profile)
        database.commit()
        database.refresh(profile)
    tenant = database.query(Tenant).filter(Tenant.id == profile.tenant_id).first()

    return {
        "user_id": profile.id,
        "supabase_user_id": profile.supabase_user_id,
        "email": profile.email,
        "full_name": profile.full_name,
        "role": profile.role,
        "is_admin": profile.is_admin,
        "is_approved": profile.is_approved,
        "tenant_id": profile.tenant_id,
        "tenant_name": tenant.name if tenant else ""
    }


@app.post("/auth/join-tenant", tags=["Auth"])
def join_tenant(
        data: JoinTenantRequest,
        database: Session = Depends(get_db)
):
    """New user joins an existing tenant via a signed team-invite link."""
    tenant_id = verify_invite_token(data.invite_token)

    existing = database.query(UserProfile).filter(
        UserProfile.supabase_user_id == data.supabase_user_id
    ).first()

    if existing:
        tenant = database.query(Tenant).filter(Tenant.id == existing.tenant_id).first()
        return {
            "user_id": existing.id,
            "supabase_user_id": existing.supabase_user_id,
            "email": existing.email,
            "full_name": existing.full_name,
            "role": existing.role,
            "is_admin": existing.is_admin,
            "is_approved": existing.is_approved,
            "tenant_id": existing.tenant_id,
            "tenant_name": tenant.name if tenant else ""
        }

    tenant = database.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Invited members are never admins by default (is_admin stays False) -
    # an existing admin has to promote them explicitly via the admin area.
    new_profile = UserProfile(
        supabase_user_id=data.supabase_user_id,
        email=data.email,
        full_name=data.full_name,
        role="member",
        tenant_id=tenant_id
    )
    database.add(new_profile)
    database.commit()
    database.refresh(new_profile)

    return {
        "user_id": new_profile.id,
        "supabase_user_id": new_profile.supabase_user_id,
        "email": new_profile.email,
        "full_name": new_profile.full_name,
        "role": new_profile.role,
        "is_admin": new_profile.is_admin,
        "is_approved": new_profile.is_approved,
        "tenant_id": new_profile.tenant_id,
        "tenant_name": tenant.name
    }


@app.get("/auth/invite-link", tags=["Auth"])
def get_invite_link(
        tenant_id: int = Depends(get_tenant_id),
        database: Session = Depends(get_db)
):
    """Generates a signed invite token for the caller's current tenant."""
    tenant = database.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    return {
        "invite_token": create_invite_token(tenant_id),
        "tenant_id": tenant_id,
        "tenant_name": tenant.name,
        "expires_in_seconds": INVITE_TOKEN_TTL_SECONDS,
    }


@app.get("/auth/invite-info", tags=["Auth"])
def get_invite_info(
        token: str,
        database: Session = Depends(get_db)
):
    """Public lookup so an invitee can see which practice they're joining before signing up."""
    tenant_id = verify_invite_token(token)
    tenant = database.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    return {"tenant_id": tenant.id, "tenant_name": tenant.name}


@app.get("/auth/team-members", tags=["Auth"])
def list_team_members(
        tenant_id: int = Depends(get_tenant_id),
        database: Session = Depends(get_db)
):
    """Lists everyone belonging to the caller's current tenant."""
    members = database.query(UserProfile).filter(
        UserProfile.tenant_id == tenant_id
    ).order_by(UserProfile.created_at).all()

    return [
        {
            "user_id": m.id,
            "email": m.email,
            "full_name": m.full_name,
            "role": m.role,
        }
        for m in members
    ]

############################################
#
#   Client Account endpoints (client-side login, separate from the
#   therapist Auth section above - a client isn't scoped to any one
#   tenant, so these use their own X-Client-ID header instead of
#   X-Tenant-ID)
#
############################################

def get_client_id(request: Request) -> int:
    """Resolve the calling client account from their verified login token.
    The X-Client-ID header is not trusted - it's just a number anyone
    could change to see or cancel someone else's appointments."""
    supabase_user_id = get_verified_supabase_user_id(request)
    database = SessionLocal()
    try:
        account = database.query(ClientAccount).filter(
            ClientAccount.supabase_user_id == supabase_user_id
        ).first()
        if not account:
            raise HTTPException(status_code=401, detail="No client account for this login")
        return account.id
    finally:
        database.close()


class ClientProfileRequest(PydanticBaseModel):
    supabase_user_id: str
    email: str
    full_name: str | None = None
    phone: str | None = None


@app.post("/client-auth/profile", tags=["ClientAuth"])
def get_or_create_client_profile(
        data: ClientProfileRequest,
        request: Request,
        database: Session = Depends(get_db)
):
    """Find-or-create a ClientAccount for the logged-in Supabase user -
    mirrors /auth/login-profile's shape for the therapist side. The
    account id and email come from the verified login token, never from
    the request body (the email decides whose appointments are shown)."""
    claims = get_verified_supabase_claims(request)
    data.supabase_user_id = claims["sub"]
    if not claims.get("email"):
        raise HTTPException(status_code=401, detail="Login has no email")
    data.email = claims["email"]
    account = database.query(ClientAccount).filter(
        ClientAccount.supabase_user_id == data.supabase_user_id
    ).first()

    if not account:
        account = ClientAccount(
            supabase_user_id=data.supabase_user_id,
            email=data.email,
            full_name=data.full_name,
            phone=data.phone,
        )
        database.add(account)
        database.commit()
        database.refresh(account)

    return {
        "client_id": account.id,
        "email": account.email,
        "full_name": account.full_name,
        "phone": account.phone,
        "photo_url": account.photo_url,
    }


class ClientProfileUpdate(PydanticBaseModel):
    full_name: str | None = None
    phone: str | None = None
    photo_url: str | None = None


@app.put("/client-auth/profile", tags=["ClientAuth"])
def update_client_profile(
        data: ClientProfileUpdate,
        client_id: int = Depends(get_client_id),
        database: Session = Depends(get_db)
):
    account = database.query(ClientAccount).filter(ClientAccount.id == client_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Client not found")

    if data.full_name is not None:
        account.full_name = data.full_name.strip() or account.full_name
    if data.phone is not None:
        account.phone = data.phone.strip() or None
    if data.photo_url is not None:
        _validate_photo_url(data.photo_url)
        account.photo_url = data.photo_url or None

    database.commit()
    database.refresh(account)

    return {
        "client_id": account.id,
        "email": account.email,
        "full_name": account.full_name,
        "phone": account.phone,
        "photo_url": account.photo_url,
    }


@app.get("/client/appointments", tags=["ClientAuth"])
def list_client_appointments(
        client_id: int = Depends(get_client_id),
        database: Session = Depends(get_db)
):
    """Every session booked under this client's email, across any number
    of practices - a client's bookings are just Klijent rows matched by
    email, the same join key the public guest-booking flow already uses."""
    account = database.query(ClientAccount).filter(ClientAccount.id == client_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Client not found")

    klijenti = database.query(Klijent).filter(Klijent.email == account.email).all()
    klijent_ids_by_tenant = {}
    for k in klijenti:
        klijent_ids_by_tenant[k.id] = k.tenant_id

    if not klijent_ids_by_tenant:
        return []

    tenant_rows = database.query(Tenant).filter(
        Tenant.id.in_(set(klijent_ids_by_tenant.values()))
    ).all()
    tenants = {t.id: t.name for t in tenant_rows}
    tenant_photos = {t.id: t.photo_url for t in tenant_rows}

    links = database.query(SesijaKlijent).filter(
        SesijaKlijent.klijent_id.in_(klijent_ids_by_tenant.keys())
    ).all()
    sesija_ids = [l.sesija_id for l in links]
    sesija_to_klijent = {l.sesija_id: l.klijent_id for l in links}

    sesije = database.query(Sesija).filter(Sesija.id.in_(sesija_ids)).all() if sesija_ids else []

    therapist_names = {t_id: get_owner_name(t_id, database) for t_id in tenants}

    result = [
        {
            "sesija_id": s.id,
            "tenant_id": s.tenant_id,
            "tenant_name": tenants.get(s.tenant_id, ""),
            "therapist_name": therapist_names.get(s.tenant_id) or tenants.get(s.tenant_id, ""),
            "photo_url": tenant_photos.get(s.tenant_id),
            "pocetak": s.pocetak.isoformat(),
            "kraj": s.kraj.isoformat(),
            "cena": s.cena,
            "status": s.status,
        }
        for s in sesije
        if sesija_to_klijent.get(s.id) in klijent_ids_by_tenant
    ]
    result.sort(key=lambda r: r["pocetak"])
    return result


@app.post("/client/appointments/{sesija_id}/cancel", tags=["ClientAuth"])
def cancel_client_appointment(
        sesija_id: int,
        client_id: int = Depends(get_client_id),
        database: Session = Depends(get_db)
):
    account = database.query(ClientAccount).filter(ClientAccount.id == client_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Client not found")

    sesija = database.query(Sesija).filter(Sesija.id == sesija_id).first()
    if not sesija:
        raise HTTPException(status_code=404, detail="Session not found")

    link = database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == sesija_id).first()
    klijent = database.query(Klijent).filter(Klijent.id == link.klijent_id).first() if link else None

    # Authorization check: this endpoint has no tenant header, so ownership
    # is verified by matching the session's client to the requesting account.
    if not klijent or klijent.email != account.email:
        raise HTTPException(status_code=403, detail="Not your appointment")

    sesija.status = "otkazano"
    database.commit()

    try:
        therapist_emails = [
            p.email for p in
            database.query(UserProfile).filter(UserProfile.tenant_id == sesija.tenant_id).all()
        ]
        if therapist_emails:
            resend.Emails.send({
                "from": "PsihoApp <noreply@hrioapp.com>",
                "to": therapist_emails,
                "subject": f"🗑️ Klijent je otkazao termin - {klijent.ime} {klijent.prezime}",
                "html": f"<p>{klijent.ime} {klijent.prezime} je otkazao/la termin zakazan za {format_date_long(sesija.pocetak)} u {format_time(sesija.pocetak)}.</p>",
            })
    except Exception as e:
        logger.error(f"Failed to send cancellation notice to therapist: {e}")

    return {"sesija_id": sesija.id, "status": sesija.status}


############################################
#
#   Admin Area (Mental Health Center management)
#
#   Everything below is gated by require_admin (see above) - a verified
#   Supabase bearer token whose owner is role == "owner" in the tenant
#   derived from THAT verified profile, never from a client-supplied
#   header. "Therapist" == a UserProfile row in the admin's own tenant;
#   "Client"/"Session" reuse the existing Klijent/Sesija tables with the
#   new therapist_id/status/gender columns added above.
#
############################################

CLIENT_GENDERS = {"female", "male", "other", "unknown"}
CLIENT_STATUSES = {"active", "completed", "archived"}
ATTENDANCE_STATUSES = {"present", "absent", "excused"}
SESSION_STATUSES = {"zakazano", "otkazano", "besplatno"}

# How many of a client's earliest sessions are free, per the center's
# paperwork ("prvih 5ečetiri seanse su besplatne"). Configurable rather than
# hardcoded, per the business-rule note in the admin spec.
FREE_SESSIONS_COUNT = int(os.getenv("ADMIN_FREE_SESSIONS_COUNT", "4"))


class AdminTherapistUpdate(BaseModel):
    full_name: Optional[str] = None
    active: Optional[bool] = None
    is_admin: Optional[bool] = None


class AdminClientCreate(BaseModel):
    ime: str
    prezime: str
    email: Optional[str] = None
    broj_telefona: Optional[str] = None
    gender: Optional[str] = None
    therapist_id: Optional[int] = None
    status: Optional[str] = "active"
    date_started: Optional[date] = None


class AdminClientUpdate(BaseModel):
    ime: str
    prezime: str
    email: Optional[str] = None
    broj_telefona: Optional[str] = None
    gender: Optional[str] = None
    therapist_id: Optional[int] = None
    status: str
    date_started: Optional[date] = None
    date_completed: Optional[date] = None


class AdminSessionCreate(BaseModel):
    klijent_id: int
    therapist_id: Optional[int] = None
    pocetak: datetime
    kraj: Optional[datetime] = None
    status: Optional[str] = "zakazano"
    is_free: Optional[bool] = None
    cena: Optional[float] = 0.0
    # Convenience: let the person scheduling the session set/correct the
    # client's gender right here, instead of a separate edit trip - mainly
    # useful for backfilling gender on older clients as they're seen again.
    client_gender: Optional[str] = None


class AdminSessionUpdate(BaseModel):
    therapist_id: Optional[int] = None  # 0 clears the assignment
    pocetak: Optional[datetime] = None
    kraj: Optional[datetime] = None
    status: Optional[str] = None
    is_free: Optional[bool] = None
    cena: Optional[float] = None
    client_gender: Optional[str] = None


class AdminMeetingCreate(BaseModel):
    date: date
    type: Optional[str] = "team_meeting"
    notes: Optional[str] = None


class AdminAttendanceEntry(BaseModel):
    user_profile_id: int
    status: str


class AdminAttendanceUpdate(BaseModel):
    records: List[AdminAttendanceEntry]


def _date_bounds(start_date: Optional[date], end_date: Optional[date]):
    start_dt = datetime.combine(start_date, dt_time.min) if start_date else None
    end_dt = datetime.combine(end_date, dt_time.max) if end_date else None
    return start_dt, end_dt


def _effective_client_date(k: "Klijent") -> Optional[date]:
    if k.date_started:
        return k.date_started
    if k.created_at:
        return k.created_at.date()
    return None


def _in_range(d: Optional[date], start_date: Optional[date], end_date: Optional[date]) -> bool:
    if d is None:
        return start_date is None and end_date is None
    if start_date and d < start_date:
        return False
    if end_date and d > end_date:
        return False
    return True


def _rank_map(pairs) -> dict:
    """Standard competition ranking (1,2,2,4) over a list of (id, count)."""
    ordered = sorted(pairs, key=lambda p: p[1], reverse=True)
    ranks, prev_count, rank = {}, None, 0
    for i, (item_id, count) in enumerate(ordered):
        if count != prev_count:
            rank = i + 1
        ranks[item_id] = rank
        prev_count = count
    return ranks


def _rank_list(pairs, names: dict) -> list:
    ordered = sorted(pairs, key=lambda p: p[1], reverse=True)
    result, prev_count, rank = [], None, 0
    for i, (uid, count) in enumerate(ordered):
        if count != prev_count:
            rank = i + 1
        result.append({"rank": rank, "user_id": uid, "name": names.get(uid, "—"), "count": count})
        prev_count = count
    return result


def _therapist_name(p: Optional["UserProfile"]) -> Optional[str]:
    if not p:
        return None
    return p.full_name or p.email


def _log_admin_action(db: Session, admin: "UserProfile", action: str, entity_type: str, entity_id: Optional[int] = None):
    db.add(AdminAuditLog(
        tenant_id=admin.tenant_id,
        actor_user_profile_id=admin.id,
        actor_email=admin.email,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
    ))


def _recompute_client_free_sessions(db: Session, klijent_id: int):
    """Recomputes which of a client's sessions fall in the free-sessions
    window, in chronological order, whenever a session tied to them is
    created/rescheduled/cancelled/deleted. Sessions with an explicit
    admin override (set on the individual session) are left untouched.
    Scoped only by klijent_id - a client's sessions are unambiguous
    regardless of which tenant either belongs to."""
    sesija_ids = [
        row.sesija_id for row in db.query(SesijaKlijent).filter(
            SesijaKlijent.klijent_id == klijent_id
        ).all()
    ]
    if not sesija_ids:
        return
    sessions = db.query(Sesija).filter(
        Sesija.id.in_(sesija_ids), Sesija.status != "otkazano"
    ).order_by(Sesija.pocetak.asc()).all()
    for idx, s in enumerate(sessions):
        s.is_free = idx < FREE_SESSIONS_COUNT


def _sesija_effective_therapist_id(s: "Sesija") -> Optional[int]:
    """A session's attributed therapist: its own therapist_id if set,
    otherwise inherited from its client's assigned therapist. Historical
    sessions recorded before therapist assignment existed have no
    therapist_id of their own, so without this fallback they'd never
    count toward any therapist's stats even after their client gets
    assigned to one."""
    if s.therapist_id:
        return s.therapist_id
    link = s.sesijaklijent_1[0] if s.sesijaklijent_1 else None
    return link.klijent.therapist_id if link and link.klijent else None


def _sesija_effective_therapist(s: "Sesija") -> Optional["UserProfile"]:
    if s.therapist:
        return s.therapist
    link = s.sesijaklijent_1[0] if s.sesijaklijent_1 else None
    return link.klijent.therapist if link and link.klijent else None


def _session_ids_via_therapist_clients(db: Session, therapist_id: int) -> list:
    """Session ids inherited from this therapist's assigned clients (see
    _sesija_effective_therapist_id) - for filtering sessions by therapist
    without missing sessions that only have the attribution via their
    client, not directly on the session itself."""
    klijent_ids = [r.id for r in db.query(Klijent.id).filter(Klijent.therapist_id == therapist_id).all()]
    if not klijent_ids:
        return []
    return [r.sesija_id for r in db.query(SesijaKlijent.sesija_id).filter(SesijaKlijent.klijent_id.in_(klijent_ids)).all()]


def _fetch_admin_base_data(db: Session):
    """The admin area is intentionally global/cross-tenant (by design -
    every client, therapist and session in the whole application, not
    just the calling admin's own tenant), so these are unfiltered."""
    clients = db.query(Klijent).all()
    sessions = db.query(Sesija).all()
    for s in sessions:
        s.effective_therapist_id = _sesija_effective_therapist_id(s)
    return clients, sessions


def _klijent_payload(k: "Klijent") -> dict:
    return {
        "id": k.id,
        "ime": k.ime,
        "prezime": k.prezime,
        "email": k.email,
        "broj_telefona": k.broj_telefona,
        "gender": k.gender,
        "status": k.status,
        "therapist_id": k.therapist_id,
        "therapist_name": _therapist_name(k.therapist),
        "date_started": k.date_started.isoformat() if k.date_started else None,
        "date_completed": k.date_completed.isoformat() if k.date_completed else None,
        "created_at": k.created_at.isoformat() if k.created_at else None,
        "updated_at": k.updated_at.isoformat() if k.updated_at else None,
    }


def _sesija_admin_payload(s: "Sesija", session_number: Optional[int] = None) -> dict:
    link = s.sesijaklijent_1[0] if s.sesijaklijent_1 else None
    klijent = link.klijent if link else None
    effective_therapist = s.therapist or (klijent.therapist if klijent else None)
    return {
        "id": s.id,
        "klijent_id": klijent.id if klijent else None,
        "klijent_name": f"{klijent.ime} {klijent.prezime}" if klijent else None,
        "therapist_id": effective_therapist.id if effective_therapist else None,
        "therapist_name": _therapist_name(effective_therapist),
        "therapist_assigned_directly": s.therapist_id is not None,
        "pocetak": s.pocetak.isoformat(),
        "kraj": s.kraj.isoformat() if s.kraj else None,
        "status": s.status,
        "cena": s.cena,
        "is_free": s.is_free,
        "session_number": session_number,
    }


def _therapist_stats_from(therapist: "UserProfile", clients_all, sessions_all, start_date, end_date) -> dict:
    my_clients = [c for c in clients_all if c.therapist_id == therapist.id]
    my_sessions = [s for s in sessions_all if s.effective_therapist_id == therapist.id]
    clients_in_range = [c for c in my_clients if _in_range(_effective_client_date(c), start_date, end_date)]
    sessions_in_range = [s for s in my_sessions if _in_range(s.pocetak.date(), start_date, end_date)]
    return {
        "user_id": therapist.id,
        "full_name": therapist.full_name,
        "email": therapist.email,
        "role": therapist.role,
        "active": therapist.active,
        "is_admin": therapist.is_admin,
        "is_approved": therapist.is_approved,
        "total_clients": len(my_clients),
        "active_clients": len([c for c in my_clients if c.status == "active"]),
        "completed_clients": len([c for c in my_clients if c.status == "completed"]),
        "clients_in_range": len(clients_in_range),
        "total_sessions": len(my_sessions),
        "sessions_in_range": len(sessions_in_range),
        "free_sessions_in_range": len([s for s in sessions_in_range if s.is_free]),
    }


def _build_admin_overview(database: Session, start_date: Optional[date], end_date: Optional[date]) -> dict:
    therapists = database.query(UserProfile).all()
    clients_all, sessions_all = _fetch_admin_base_data(database)

    clients = [c for c in clients_all if _in_range(_effective_client_date(c), start_date, end_date)]
    sessions = [s for s in sessions_all if _in_range(s.pocetak.date(), start_date, end_date)]

    gender_counts = Counter((c.gender or "unknown") for c in clients)
    status_counts = Counter(c.status for c in clients)
    names = {t.id: _therapist_name(t) for t in therapists}

    clients_by_therapist = Counter(c.therapist_id for c in clients if c.therapist_id)
    sessions_by_therapist = Counter(s.effective_therapist_id for s in sessions if s.effective_therapist_id)

    client_leaderboard = _rank_list(list(clients_by_therapist.items()), names)
    session_leaderboard = _rank_list(list(sessions_by_therapist.items()), names)

    monthly_sessions = Counter(s.pocetak.strftime("%Y-%m") for s in sessions)
    monthly_new_clients = Counter()
    for c in clients:
        d = _effective_client_date(c)
        if d:
            monthly_new_clients[d.strftime("%Y-%m")] += 1

    return {
        "period": {
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
        },
        "cards": {
            "total_therapists": len(therapists),
            "active_therapists": len([t for t in therapists if t.active]),
            "total_clients": len(clients),
            "active_clients": status_counts.get("active", 0),
            "completed_clients": status_counts.get("completed", 0),
            "archived_clients": status_counts.get("archived", 0),
            "total_sessions": len(sessions),
            "free_sessions": len([s for s in sessions if s.is_free]),
            "paid_sessions": len([s for s in sessions if s.is_free is False]),
            "female_clients": gender_counts.get("female", 0),
            "male_clients": gender_counts.get("male", 0),
            "other_clients": gender_counts.get("other", 0) + gender_counts.get("unknown", 0),
        },
        "gender_breakdown": [{"gender": g, "count": c} for g, c in gender_counts.items()],
        "monthly_sessions": [{"month": m, "count": c} for m, c in sorted(monthly_sessions.items())],
        "monthly_new_clients": [{"month": m, "count": c} for m, c in sorted(monthly_new_clients.items())],
        "clients_per_therapist": [{"user_id": uid, "name": names.get(uid, "—"), "count": c} for uid, c in clients_by_therapist.most_common()],
        "sessions_per_therapist": [{"user_id": uid, "name": names.get(uid, "—"), "count": c} for uid, c in sessions_by_therapist.most_common()],
        "top_clients_leaderboard": client_leaderboard[:5],
        "top_sessions_leaderboard": session_leaderboard[:5],
        "full_clients_leaderboard": client_leaderboard,
        "full_sessions_leaderboard": session_leaderboard,
    }


############################################
# Admin - Dashboard & Leaderboards
############################################

@app.get("/admin/dashboard", tags=["Admin"])
def admin_dashboard(
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    return _build_admin_overview(database, start_date, end_date)


@app.get("/admin/leaderboard", tags=["Admin"])
def admin_leaderboard(
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    overview = _build_admin_overview(database, start_date, end_date)
    return {
        "period": overview["period"],
        "most_clients": overview["full_clients_leaderboard"],
        "most_sessions": overview["full_sessions_leaderboard"],
    }


############################################
# Admin - Therapist Management
############################################

@app.get("/admin/therapists", tags=["Admin"])
def admin_list_therapists(
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    therapists = database.query(UserProfile).order_by(UserProfile.created_at).all()
    clients_all, sessions_all = _fetch_admin_base_data(database)
    rows = [_therapist_stats_from(t, clients_all, sessions_all, start_date, end_date) for t in therapists]

    client_ranks = _rank_map([(r["user_id"], r["clients_in_range"]) for r in rows])
    session_ranks = _rank_map([(r["user_id"], r["sessions_in_range"]) for r in rows])
    overall_client_ranks = _rank_map([(r["user_id"], r["total_clients"]) for r in rows])
    overall_session_ranks = _rank_map([(r["user_id"], r["total_sessions"]) for r in rows])
    for r in rows:
        r["clients_rank_in_range"] = client_ranks[r["user_id"]]
        r["sessions_rank_in_range"] = session_ranks[r["user_id"]]
        r["clients_rank_overall"] = overall_client_ranks[r["user_id"]]
        r["sessions_rank_overall"] = overall_session_ranks[r["user_id"]]
    return rows


@app.get("/admin/therapists/invite-link", tags=["Admin"])
def admin_therapist_invite_link(
        admin: UserProfile = Depends(require_admin),
):
    """'Add therapist' reuses the existing team-invite mechanism (Supabase
    handles signup/login) rather than an admin-set-password flow."""
    return {
        "invite_token": create_invite_token(admin.tenant_id),
        "tenant_id": admin.tenant_id,
        "expires_in_seconds": INVITE_TOKEN_TTL_SECONDS,
    }


@app.get("/admin/therapists/{user_id}", tags=["Admin"])
def admin_get_therapist(
        user_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    therapist = database.query(UserProfile).filter(UserProfile.id == user_id).first()
    if not therapist:
        raise HTTPException(status_code=404, detail="Therapist not found")

    all_therapists = database.query(UserProfile).all()
    clients_all, sessions_all = _fetch_admin_base_data(database)
    all_rows = [_therapist_stats_from(t, clients_all, sessions_all, start_date, end_date) for t in all_therapists]

    client_ranks = _rank_map([(r["user_id"], r["clients_in_range"]) for r in all_rows])
    session_ranks = _rank_map([(r["user_id"], r["sessions_in_range"]) for r in all_rows])
    overall_client_ranks = _rank_map([(r["user_id"], r["total_clients"]) for r in all_rows])
    overall_session_ranks = _rank_map([(r["user_id"], r["total_sessions"]) for r in all_rows])

    stats = next(r for r in all_rows if r["user_id"] == user_id)
    stats["clients_rank_in_range"] = client_ranks[user_id]
    stats["sessions_rank_in_range"] = session_ranks[user_id]
    stats["clients_rank_overall"] = overall_client_ranks[user_id]
    stats["sessions_rank_overall"] = overall_session_ranks[user_id]

    clients = database.query(Klijent).filter(Klijent.therapist_id == user_id).order_by(Klijent.created_at.desc()).all()
    inherited_session_ids = _session_ids_via_therapist_clients(database, user_id)
    sessions = (
        database.query(Sesija)
        .filter(or_(Sesija.therapist_id == user_id, Sesija.id.in_(inherited_session_ids or [-1])))
        .order_by(Sesija.pocetak.desc()).limit(200).all()
    )

    records = database.query(AttendanceRecord).filter(AttendanceRecord.user_profile_id == user_id).all()
    held = len(records)
    present = len([r for r in records if r.status == "present"])
    absent = len([r for r in records if r.status == "absent"])
    excused = len([r for r in records if r.status == "excused"])

    return {
        **stats,
        "clients": [_klijent_payload(c) for c in clients],
        "recent_sessions": [_sesija_admin_payload(s) for s in sessions],
        "attendance": {
            "meetings_held": held,
            "attended": present,
            "absent": absent,
            "excused": excused,
            "percentage": round(present / held * 100, 1) if held else None,
        },
    }


@app.patch("/admin/therapists/{user_id}", tags=["Admin"])
def admin_update_therapist(
        user_id: int,
        data: AdminTherapistUpdate,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    therapist = database.query(UserProfile).filter(UserProfile.id == user_id).first()
    if not therapist:
        raise HTTPException(status_code=404, detail="Therapist not found")

    if data.full_name is not None and data.full_name.strip():
        therapist.full_name = data.full_name.strip()
    if data.active is not None:
        if therapist.id == admin.id and not data.active:
            raise HTTPException(status_code=400, detail="Ne možete deaktivirati sopstveni nalog")
        therapist.active = data.active
    if data.is_admin is not None:
        if therapist.id == admin.id and not data.is_admin:
            raise HTTPException(status_code=400, detail="Ne možete sebi oduzeti admin ovlašćenja")
        therapist.is_admin = data.is_admin

    _log_admin_action(database, admin, "THERAPIST_UPDATED", "therapist", therapist.id)
    database.commit()
    database.refresh(therapist)
    return {
        "user_id": therapist.id,
        "full_name": therapist.full_name,
        "email": therapist.email,
        "role": therapist.role,
        "active": therapist.active,
        "is_admin": therapist.is_admin,
        "is_approved": therapist.is_approved,
    }


def send_therapist_approved_email(therapist: "UserProfile"):
    """Notifies a newly-approved therapist that their account is active -
    a best-effort send; a failure here must never block the approval
    action itself."""
    name = therapist.full_name or therapist.email
    html = f"""
<div style="background:#f2f2f7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#1a1a1a;">
<div style="max-width:520px;margin:auto;">
<div style="background:#fff;border-radius:16px;padding:28px 24px 24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="font-size:22px;margin-bottom:8px;">✅ Nalog je odobren</div>
<div style="font-size:15px;color:#1a1a1a;margin-bottom:4px;">Poštovani/a <strong>{name}</strong>,</div>
<div style="font-size:15px;color:#1a1a1a;">Vaš nalog je odobren od strane administratora. Sada možete da se prijavite (email/lozinka ili Google).</div>
</div>
<div style="text-align:center;font-size:13px;color:#9ca3af;margin-top:14px;line-height:1.5;">
<strong style="color:#6b7280;">PsihoApp</strong>
</div>
</div>
</div>
"""
    try:
        resend.Emails.send({
            "from": "PsihoApp <noreply@hrioapp.com>",
            "to": [therapist.email],
            "subject": "✅ Vaš nalog je odobren",
            "html": html,
        })
    except Exception as e:
        logger.error(f"Failed to send approval email to {therapist.email}: {e}")


@app.post("/admin/therapists/{user_id}/approve", tags=["Admin"])
def admin_approve_therapist(
        user_id: int,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    """Approves a pending registration so they can actually use the app -
    see UserProfile.is_approved. Sends a notification email on success."""
    therapist = database.query(UserProfile).filter(UserProfile.id == user_id).first()
    if not therapist:
        raise HTTPException(status_code=404, detail="Therapist not found")

    already_approved = therapist.is_approved
    therapist.is_approved = True
    _log_admin_action(database, admin, "THERAPIST_APPROVED", "therapist", therapist.id)
    database.commit()
    database.refresh(therapist)

    if not already_approved:
        send_therapist_approved_email(therapist)

    return {
        "user_id": therapist.id,
        "full_name": therapist.full_name,
        "email": therapist.email,
        "is_approved": therapist.is_approved,
    }


# Bulk-inviting therapists: creates their Supabase login (without a
# password), a ready-to-use approved profile with its own practice, and
# emails them a link that signs them straight into the app. Later logins
# use the passwordless email link on the login screen.
# Needs SUPABASE_SERVICE_ROLE_KEY (Supabase -> Project Settings -> API).
SUPABASE_SERVICE_ROLE_KEY = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip() or None
THERAPIST_APP_URL = os.getenv("THERAPIST_APP_URL", "https://crm-tool-frontend-e885b1.onrender.com/therapist")


class TherapistInviteEntry(BaseModel):
    email: str
    full_name: Optional[str] = None


class TherapistBulkInvite(BaseModel):
    invites: List[TherapistInviteEntry]


class SupabaseUserExists(Exception):
    pass


def _supabase_generate_invite_link(email: str, full_name: Optional[str]) -> tuple:
    """Creates the Supabase auth user and returns (supabase_user_id,
    action_link) without Supabase sending any email itself - we send it
    via Resend, which avoids Supabase's very low built-in email limits."""
    import httpx

    headers = {"apikey": SUPABASE_SERVICE_ROLE_KEY}
    # Legacy service_role keys are JWTs and also go in Authorization; the
    # newer "sb_secret_..." keys are rejected there and only work as apikey.
    if SUPABASE_SERVICE_ROLE_KEY.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"

    resp = httpx.post(
        f"{SUPABASE_URL}/auth/v1/admin/generate_link",
        headers=headers,
        json={
            "type": "invite",
            "email": email,
            "data": {"full_name": full_name} if full_name else {},
            "redirect_to": THERAPIST_APP_URL,
        },
        timeout=20,
    )
    if resp.status_code == 422 and "exist" in resp.text.lower():
        raise SupabaseUserExists()
    if resp.status_code >= 400:
        try:
            err = resp.json()
            message = err.get("msg") or err.get("message") or err.get("error_description") or err.get("error")
        except ValueError:
            message = None
        raise RuntimeError(f"Supabase {resp.status_code}: {message or resp.text[:200]}")
    body = resp.json()
    user_id = body.get("id") or (body.get("user") or {}).get("id")
    action_link = body.get("action_link") or (body.get("properties") or {}).get("action_link")
    if not user_id or not action_link:
        raise RuntimeError("Unexpected Supabase response")
    return user_id, action_link


def send_therapist_invite_email(email: str, full_name: Optional[str], action_link: str) -> bool:
    name = full_name or email
    html = f"""
<div style="background:#f2f2f7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#1a1a1a;">
<div style="max-width:520px;margin:auto;">
<div style="background:#fff;border-radius:16px;padding:28px 24px 24px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.04);">
<div style="font-size:22px;margin-bottom:8px;">👋 Dobrodošli u PsihoApp</div>
<div style="font-size:15px;color:#1a1a1a;margin-bottom:4px;">Poštovani/a <strong>{name}</strong>,</div>
<div style="font-size:15px;color:#1a1a1a;margin-bottom:10px;">Za Vas je otvoren nalog u PsihoApp aplikaciji. Kliknite na dugme ispod da potvrdite nalog - bićete automatski prijavljeni.</div>
<div style="font-size:14px;color:#4b5563;margin-bottom:20px;">Ubuduće se prijavljujete samo unosom svog email-a: na stranici za prijavu kliknite „Pošalji link za prijavu“ i otvorite link iz mejla. Lozinka nije potrebna.</div>
<a href="{action_link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">Potvrdi nalog i prijavi se</a>
<div style="font-size:12px;color:#9ca3af;margin-top:18px;">Ako dugme ne radi, kopirajte ovaj link u pregledač:<br>{action_link}</div>
</div>
<div style="text-align:center;font-size:13px;color:#9ca3af;margin-top:14px;line-height:1.5;">
<strong style="color:#6b7280;">PsihoApp</strong>
</div>
</div>
</div>
"""
    try:
        resend.Emails.send({
            "from": "PsihoApp <noreply@hrioapp.com>",
            "to": [email],
            "subject": "Vaš PsihoApp nalog je spreman - potvrdite i prijavite se",
            "html": html,
        })
        return True
    except Exception as e:
        logger.error(f"Failed to send invite email to {email}: {e}")
        return False


@app.post("/admin/therapists/invite", tags=["Admin"])
def admin_invite_therapists(
        data: TherapistBulkInvite,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    """Creates accounts for a pasted list of therapists. Per-person result
    statuses: invited | already_exists | already_has_login | email_failed |
    invalid | error. Safe to re-run with the same list."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Pozivanje nije podešeno: na serveru nedostaje SUPABASE_URL ili SUPABASE_SERVICE_ROLE_KEY.",
        )

    results = []
    seen = set()
    for entry in data.invites:
        email = (entry.email or "").strip().lower()
        full_name = (entry.full_name or "").strip() or None
        if not email or "@" not in email or email in seen:
            if email not in seen:
                results.append({"email": email, "full_name": full_name, "status": "invalid"})
            continue
        seen.add(email)

        existing = database.query(UserProfile).filter(func.lower(UserProfile.email) == email).first()
        if existing:
            results.append({"email": email, "full_name": full_name, "status": "already_exists"})
            continue

        try:
            supabase_user_id, action_link = _supabase_generate_invite_link(email, full_name)
        except SupabaseUserExists:
            results.append({"email": email, "full_name": full_name, "status": "already_has_login"})
            continue
        except Exception as e:
            logger.error(f"Supabase invite failed for {email}: {e}")
            results.append({"email": email, "full_name": full_name, "status": "error", "detail": str(e)[:300]})
            continue

        tenant = Tenant(name=full_name or email)
        database.add(tenant)
        database.flush()
        profile = UserProfile(
            supabase_user_id=supabase_user_id,
            email=email,
            full_name=full_name,
            role="owner",
            tenant_id=tenant.id,
            is_approved=True,
        )
        database.add(profile)
        database.flush()
        _log_admin_action(database, admin, "THERAPIST_INVITED", "therapist", profile.id)
        database.commit()

        sent = send_therapist_invite_email(email, full_name, action_link)
        results.append({
            "email": email,
            "full_name": full_name,
            "status": "invited" if sent else "email_failed",
            # Only handed back when the email failed, so the admin can pass it on manually.
            "link": None if sent else action_link,
        })

    return {"results": results}


############################################
# Admin - Client Registry
############################################

@app.get("/admin/clients", tags=["Admin"])
def admin_list_clients(
        search: Optional[str] = None,
        therapist_id: Optional[int] = None,
        status: Optional[str] = None,
        gender: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        sort: Optional[str] = None,  # name | sessions | recent (default)
        page: int = 1,
        page_size: int = 25,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    page = max(1, page)
    page_size = max(1, min(page_size, 200))

    query = database.query(Klijent)
    if therapist_id is not None:
        query = query.filter(Klijent.therapist_id == therapist_id)
    if status:
        query = query.filter(Klijent.status == status)
    if gender:
        query = query.filter(Klijent.gender == gender)
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(or_(Klijent.ime.ilike(like), Klijent.prezime.ilike(like)))

    clients = query.all()
    if start_date or end_date:
        clients = [c for c in clients if _in_range(_effective_client_date(c), start_date, end_date)]

    sk_rows = database.query(SesijaKlijent.klijent_id).all()
    counts = Counter(r.klijent_id for r in sk_rows)

    if sort == "name":
        clients.sort(key=lambda c: ((c.ime or "").lower(), (c.prezime or "").lower()))
    elif sort == "sessions":
        clients.sort(key=lambda c: counts.get(c.id, 0), reverse=True)
    else:
        clients.sort(key=lambda c: c.created_at or datetime.min, reverse=True)

    total = len(clients)
    start_idx = (page - 1) * page_size
    page_items = clients[start_idx:start_idx + page_size]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "data": [{**_klijent_payload(c), "session_count": counts.get(c.id, 0)} for c in page_items],
    }


@app.post("/admin/clients", tags=["Admin"])
def admin_create_client(
        data: AdminClientCreate,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    if not data.ime.strip() or not data.prezime.strip():
        raise HTTPException(status_code=400, detail="Ime i prezime su obavezni")
    if data.gender and data.gender not in CLIENT_GENDERS:
        raise HTTPException(status_code=400, detail="Nepoznat pol")
    status_value = data.status if data.status in CLIENT_STATUSES else "active"

    therapist = None
    if data.therapist_id is not None:
        therapist = database.query(UserProfile).filter(UserProfile.id == data.therapist_id).first()
        if not therapist:
            raise HTTPException(status_code=400, detail="Terapeut nije pronađen")

    # A client still has to belong to some tenant (schema requirement) -
    # new clients created from the admin area are filed under the
    # creating admin's own tenant; the admin area itself reads/lists
    # across every tenant regardless.
    client = Klijent(
        tenant_id=admin.tenant_id,
        ime=data.ime.strip(),
        prezime=data.prezime.strip(),
        email=data.email,
        broj_telefona=data.broj_telefona,
        gender=data.gender,
        status=status_value,
        therapist_id=therapist.id if therapist else None,
        date_started=data.date_started or date.today(),
    )
    database.add(client)
    database.flush()
    _log_admin_action(database, admin, "CLIENT_CREATED", "klijent", client.id)
    database.commit()
    database.refresh(client)
    return _klijent_payload(client)


@app.get("/admin/clients/{client_id}", tags=["Admin"])
def admin_get_client(
        client_id: int,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    client = database.query(Klijent).filter(Klijent.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Klijent not found")

    sesija_ids = [
        row.sesija_id for row in database.query(SesijaKlijent).filter(
            SesijaKlijent.klijent_id == client_id
        ).all()
    ]
    sessions = (
        database.query(Sesija).filter(Sesija.id.in_(sesija_ids))
        .order_by(Sesija.pocetak.asc()).all()
        if sesija_ids else []
    )

    timeline = []
    counted = 0
    for s in sessions:
        number = None
        if s.status != "otkazano":
            counted += 1
            number = counted
        timeline.append(_sesija_admin_payload(s, number))

    return {
        **_klijent_payload(client),
        "session_count": counted,
        "sessions": list(reversed(timeline)),
    }


@app.put("/admin/clients/{client_id}", tags=["Admin"])
def admin_update_client(
        client_id: int,
        data: AdminClientUpdate,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    client = database.query(Klijent).filter(Klijent.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Klijent not found")
    if not data.ime.strip() or not data.prezime.strip():
        raise HTTPException(status_code=400, detail="Ime i prezime su obavezni")
    if data.gender and data.gender not in CLIENT_GENDERS:
        raise HTTPException(status_code=400, detail="Nepoznat pol")
    if data.status not in CLIENT_STATUSES:
        raise HTTPException(status_code=400, detail="Nepoznat status")

    therapist = None
    if data.therapist_id is not None:
        therapist = database.query(UserProfile).filter(UserProfile.id == data.therapist_id).first()
        if not therapist:
            raise HTTPException(status_code=400, detail="Terapeut nije pronađen")

    was_archived = client.status == "archived"
    client.ime = data.ime.strip()
    client.prezime = data.prezime.strip()
    client.email = data.email
    client.broj_telefona = data.broj_telefona
    client.gender = data.gender
    client.therapist_id = therapist.id if therapist else None
    client.date_started = data.date_started
    if data.status == "completed":
        client.date_completed = data.date_completed or client.date_completed or date.today()
    else:
        client.date_completed = data.date_completed
    client.status = data.status

    action = "CLIENT_ARCHIVED" if (data.status == "archived" and not was_archived) else "CLIENT_UPDATED"
    _log_admin_action(database, admin, action, "klijent", client.id)
    database.commit()
    database.refresh(client)
    return _klijent_payload(client)


############################################
# Admin - Session Management
############################################

@app.get("/admin/sessions", tags=["Admin"])
def admin_list_sessions(
        therapist_id: Optional[int] = None,
        klijent_id: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        is_free: Optional[bool] = None,
        page: int = 1,
        page_size: int = 25,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    page = max(1, page)
    page_size = max(1, min(page_size, 200))

    query = database.query(Sesija)
    if therapist_id is not None:
        inherited_ids = _session_ids_via_therapist_clients(database, therapist_id)
        query = query.filter(or_(Sesija.therapist_id == therapist_id, Sesija.id.in_(inherited_ids or [-1])))
    if is_free is not None:
        query = query.filter(Sesija.is_free == is_free)
    start_dt, end_dt = _date_bounds(start_date, end_date)
    if start_dt:
        query = query.filter(Sesija.pocetak >= start_dt)
    if end_dt:
        query = query.filter(Sesija.pocetak <= end_dt)
    if klijent_id is not None:
        sesija_ids = [
            r.sesija_id for r in database.query(SesijaKlijent).filter(
                SesijaKlijent.klijent_id == klijent_id
            ).all()
        ]
        query = query.filter(Sesija.id.in_(sesija_ids or [-1]))

    query = query.order_by(Sesija.pocetak.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "data": [_sesija_admin_payload(s) for s in items],
    }


@app.post("/admin/sessions", tags=["Admin"])
def admin_create_session(
        data: AdminSessionCreate,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    client = database.query(Klijent).filter(Klijent.id == data.klijent_id).first()
    if not client:
        raise HTTPException(status_code=400, detail="Klijent nije pronađen")

    therapist_id = data.therapist_id if data.therapist_id is not None else client.therapist_id
    if therapist_id is not None:
        therapist = database.query(UserProfile).filter(UserProfile.id == therapist_id).first()
        if not therapist:
            raise HTTPException(status_code=400, detail="Terapeut nije pronađen")

    if data.status is not None and data.status not in SESSION_STATUSES:
        raise HTTPException(status_code=400, detail="Nepoznat status")
    if data.client_gender is not None:
        if data.client_gender not in CLIENT_GENDERS:
            raise HTTPException(status_code=400, detail="Nepoznat pol")
        client.gender = data.client_gender

    status_value = data.status or "zakazano"
    # A "besplatno" status is itself a declaration that the session is
    # free - it implies is_free unless an explicit is_free was also sent.
    effective_is_free = data.is_free if data.is_free is not None else (True if status_value == "besplatno" else None)

    # A session (and its client link) is filed under the CLIENT's own
    # tenant, not the acting admin's - keeps it consistent with the rest
    # of that practice's data even though the admin area itself reads
    # across every tenant regardless.
    session = Sesija(
        tenant_id=client.tenant_id,
        pocetak=data.pocetak,
        kraj=data.kraj or (data.pocetak + timedelta(hours=1)),
        cena=data.cena or 0.0,
        status=status_value,
        therapist_id=therapist_id,
        is_free=effective_is_free,
    )
    database.add(session)
    database.flush()

    database.add(SesijaKlijent(tenant_id=client.tenant_id, klijent_id=client.id, sesija_id=session.id))
    database.flush()

    if effective_is_free is None:
        _recompute_client_free_sessions(database, client.id)

    _log_admin_action(database, admin, "SESSION_CREATED", "sesija", session.id)
    database.commit()
    database.refresh(session)
    return _sesija_admin_payload(session)


@app.put("/admin/sessions/{session_id}", tags=["Admin"])
def admin_update_session(
        session_id: int,
        data: AdminSessionUpdate,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    session = database.query(Sesija).filter(Sesija.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesija not found")

    link = database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == session_id).first()
    affected_client_id = link.klijent_id if link else None

    if data.therapist_id is not None:
        if data.therapist_id == 0:
            session.therapist_id = None
        else:
            therapist = database.query(UserProfile).filter(UserProfile.id == data.therapist_id).first()
            if not therapist:
                raise HTTPException(status_code=400, detail="Terapeut nije pronađen")
            session.therapist_id = therapist.id
    if data.pocetak is not None:
        session.pocetak = data.pocetak
    if data.kraj is not None:
        session.kraj = data.kraj
    if data.status is not None:
        if data.status not in SESSION_STATUSES:
            raise HTTPException(status_code=400, detail="Nepoznat status")
        session.status = data.status
    if data.cena is not None:
        session.cena = data.cena
    if data.client_gender is not None:
        if data.client_gender not in CLIENT_GENDERS:
            raise HTTPException(status_code=400, detail="Nepoznat pol")
        if affected_client_id:
            client = database.query(Klijent).filter(Klijent.id == affected_client_id).first()
            if client:
                client.gender = data.client_gender

    # A "besplatno" status is itself a declaration that the session is
    # free - it implies is_free unless an explicit is_free was also sent.
    effective_is_free = data.is_free
    if effective_is_free is None and data.status == "besplatno":
        effective_is_free = True

    order_affecting_change = data.pocetak is not None or data.status is not None
    if effective_is_free is not None:
        session.is_free = effective_is_free
    elif order_affecting_change and affected_client_id:
        _recompute_client_free_sessions(database, affected_client_id)

    _log_admin_action(database, admin, "SESSION_UPDATED", "sesija", session.id)
    database.commit()
    database.refresh(session)
    return _sesija_admin_payload(session)


@app.delete("/admin/sessions/{session_id}", tags=["Admin"])
def admin_delete_session(
        session_id: int,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    session = database.query(Sesija).filter(Sesija.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesija not found")

    links = database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == session_id).all()
    affected_client_ids = [l.klijent_id for l in links]
    for l in links:
        database.delete(l)
    database.query(SesijaGrupa).filter(SesijaGrupa.sesija_1_id == session_id).delete()
    database.query(Cena).filter(Cena.sesija_2_id == session_id).delete()
    database.delete(session)
    database.flush()

    for cid in affected_client_ids:
        _recompute_client_free_sessions(database, cid)

    _log_admin_action(database, admin, "SESSION_DELETED", "sesija", session_id)
    database.commit()
    return {"message": "Deleted", "id": session_id}


############################################
# Admin - Team Attendance
############################################

@app.get("/admin/team-attendance/matrix", tags=["Admin"])
def admin_attendance_matrix(
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    query = database.query(TeamMeeting)
    if start_date:
        query = query.filter(TeamMeeting.date >= start_date)
    if end_date:
        query = query.filter(TeamMeeting.date <= end_date)
    meetings = query.order_by(TeamMeeting.date.asc()).all()
    meeting_ids = [m.id for m in meetings]

    therapists = database.query(UserProfile).order_by(UserProfile.created_at).all()
    records = database.query(AttendanceRecord).filter(
        AttendanceRecord.meeting_id.in_(meeting_ids or [-1])
    ).all()

    matrix: dict = {}
    for r in records:
        matrix.setdefault(r.user_profile_id, {})[r.meeting_id] = r.status

    stats = {}
    for t in therapists:
        rows = matrix.get(t.id, {})
        held = len(rows)
        present = len([s for s in rows.values() if s == "present"])
        absent = len([s for s in rows.values() if s == "absent"])
        excused = len([s for s in rows.values() if s == "excused"])
        stats[t.id] = {
            "meetings_held": held,
            "attended": present,
            "absent": absent,
            "excused": excused,
            "percentage": round(present / held * 100, 1) if held else None,
        }

    return {
        "meetings": [{"id": m.id, "date": m.date.isoformat(), "type": m.type} for m in meetings],
        "therapists": [{"user_profile_id": t.id, "name": _therapist_name(t), "active": t.active} for t in therapists],
        "matrix": {str(uid): rows for uid, rows in matrix.items()},
        "stats": {str(uid): s for uid, s in stats.items()},
    }


@app.get("/admin/team-attendance/meetings", tags=["Admin"])
def admin_list_meetings(
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    query = database.query(TeamMeeting)
    if start_date:
        query = query.filter(TeamMeeting.date >= start_date)
    if end_date:
        query = query.filter(TeamMeeting.date <= end_date)
    meetings = query.order_by(TeamMeeting.date.desc()).all()

    meeting_ids = [m.id for m in meetings]
    records = database.query(AttendanceRecord).filter(
        AttendanceRecord.meeting_id.in_(meeting_ids or [-1])
    ).all()
    counts_by_meeting: dict = {}
    for r in records:
        counts_by_meeting.setdefault(r.meeting_id, Counter())[r.status] += 1

    return [
        {
            "id": m.id,
            "date": m.date.isoformat(),
            "type": m.type,
            "notes": m.notes,
            "present": counts_by_meeting.get(m.id, Counter()).get("present", 0),
            "absent": counts_by_meeting.get(m.id, Counter()).get("absent", 0),
            "excused": counts_by_meeting.get(m.id, Counter()).get("excused", 0),
        }
        for m in meetings
    ]


@app.post("/admin/team-attendance/meetings", tags=["Admin"])
def admin_create_meeting(
        data: AdminMeetingCreate,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    meeting = TeamMeeting(
        tenant_id=admin.tenant_id,
        date=data.date,
        type=(data.type or "team_meeting").strip(),
        notes=data.notes,
        created_by_id=admin.id,
    )
    database.add(meeting)
    database.commit()
    database.refresh(meeting)
    return {"id": meeting.id, "date": meeting.date.isoformat(), "type": meeting.type, "notes": meeting.notes}


@app.get("/admin/team-attendance/meetings/{meeting_id}", tags=["Admin"])
def admin_get_meeting(
        meeting_id: int,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    meeting = database.query(TeamMeeting).filter(TeamMeeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    therapists = database.query(UserProfile).order_by(UserProfile.created_at).all()
    records = {
        r.user_profile_id: r.status
        for r in database.query(AttendanceRecord).filter(
            AttendanceRecord.meeting_id == meeting_id
        ).all()
    }

    return {
        "id": meeting.id,
        "date": meeting.date.isoformat(),
        "type": meeting.type,
        "notes": meeting.notes,
        "attendance": [
            {"user_profile_id": t.id, "name": _therapist_name(t), "active": t.active, "status": records.get(t.id)}
            for t in therapists
        ],
    }


@app.put("/admin/team-attendance/meetings/{meeting_id}/attendance", tags=["Admin"])
def admin_update_attendance(
        meeting_id: int,
        data: AdminAttendanceUpdate,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    meeting = database.query(TeamMeeting).filter(TeamMeeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    existing = {
        r.user_profile_id: r
        for r in database.query(AttendanceRecord).filter(
            AttendanceRecord.meeting_id == meeting_id
        ).all()
    }

    for entry in data.records:
        if entry.status not in ATTENDANCE_STATUSES:
            raise HTTPException(status_code=400, detail=f"Nepoznat status: {entry.status}")
        therapist = database.query(UserProfile).filter(
            UserProfile.id == entry.user_profile_id
        ).first()
        if not therapist:
            continue
        record = existing.get(entry.user_profile_id)
        if record:
            record.status = entry.status
        else:
            database.add(AttendanceRecord(
                tenant_id=admin.tenant_id,
                meeting_id=meeting_id,
                user_profile_id=entry.user_profile_id,
                status=entry.status,
            ))

    _log_admin_action(database, admin, "ATTENDANCE_UPDATED", "team_meeting", meeting_id)
    database.commit()
    return {"message": "Attendance updated", "meeting_id": meeting_id}


@app.delete("/admin/team-attendance/meetings/{meeting_id}", tags=["Admin"])
def admin_delete_meeting(
        meeting_id: int,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    meeting = database.query(TeamMeeting).filter(TeamMeeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    database.delete(meeting)
    database.commit()
    return {"message": "Deleted", "id": meeting_id}


############################################
# Admin - Reports
############################################

@app.get("/admin/reports", tags=["Admin"])
def admin_report(
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    overview = _build_admin_overview(database, start_date, end_date)

    meetings_q = database.query(TeamMeeting)
    if start_date:
        meetings_q = meetings_q.filter(TeamMeeting.date >= start_date)
    if end_date:
        meetings_q = meetings_q.filter(TeamMeeting.date <= end_date)
    meetings = meetings_q.all()
    meeting_ids = [m.id for m in meetings]
    records = database.query(AttendanceRecord).filter(
        AttendanceRecord.meeting_id.in_(meeting_ids or [-1])
    ).all()
    attendance_counts = Counter(r.status for r in records)

    return {
        **overview,
        "attendance_summary": {
            "meetings_held": len(meetings),
            "present": attendance_counts.get("present", 0),
            "absent": attendance_counts.get("absent", 0),
            "excused": attendance_counts.get("excused", 0),
        },
    }


_REPORT_CARD_LABELS_SR = {
    "total_therapists": "Ukupno terapeuta",
    "active_therapists": "Aktivni terapeuti",
    "total_clients": "Ukupno klijenata",
    "active_clients": "Aktivni klijenti",
    "completed_clients": "Završeni klijenti",
    "archived_clients": "Arhivirani klijenti",
    "total_sessions": "Ukupno sesija",
    "free_sessions": "Besplatne sesije",
    "paid_sessions": "Naplaćene sesije",
    "female_clients": "Ženski klijenti",
    "male_clients": "Muški klijenti",
    "other_clients": "Ostalo/nepoznato",
}

_GENDER_LABELS_SR = {"female": "Žensko", "male": "Muško", "other": "Drugo", "unknown": "Nepoznato"}


@app.get("/admin/reports/export.csv", tags=["Admin"])
def admin_report_export_csv(
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    report = admin_report(start_date=start_date, end_date=end_date, admin=admin, database=database)

    buf = io.StringIO()
    writer = csv.writer(buf)
    period_label = f"{report['period']['start_date'] or 'sve'} - {report['period']['end_date'] or 'sve'}"
    writer.writerow(["Statistika centra"])
    writer.writerow(["Period", period_label])
    writer.writerow(["Generisano", datetime.utcnow().strftime("%d.%m.%Y %H:%M UTC")])

    writer.writerow([])
    writer.writerow(["KLJUČNI POKAZATELJI"])
    writer.writerow(["Metrika", "Vrednost"])
    for key, value in report["cards"].items():
        writer.writerow([_REPORT_CARD_LABELS_SR.get(key, key), value])

    writer.writerow([])
    writer.writerow(["NAJVIŠE KLIJENATA"])
    writer.writerow(["Mesto", "Terapeut", "Broj klijenata"])
    for row in report["full_clients_leaderboard"]:
        writer.writerow([row["rank"], row["name"], row["count"]])

    writer.writerow([])
    writer.writerow(["NAJVIŠE SESIJA"])
    writer.writerow(["Mesto", "Terapeut", "Broj sesija"])
    for row in report["full_sessions_leaderboard"]:
        writer.writerow([row["rank"], row["name"], row["count"]])

    writer.writerow([])
    writer.writerow(["POLNA STRUKTURA KLIJENATA"])
    writer.writerow(["Pol", "Broj klijenata"])
    for row in report["gender_breakdown"]:
        writer.writerow([_GENDER_LABELS_SR.get(row["gender"], row["gender"]), row["count"]])

    writer.writerow([])
    writer.writerow(["PRISUSTVO TIMU"])
    writer.writerow(["Sastanaka održano", report["attendance_summary"]["meetings_held"]])
    writer.writerow(["Prisutan", report["attendance_summary"]["present"]])
    writer.writerow(["Odsutan", report["attendance_summary"]["absent"]])
    writer.writerow(["Opravdano odsutan", report["attendance_summary"]["excused"]])

    filename = f"izvestaj_{start_date or 'sve'}_{end_date or 'sve'}.csv"
    # Prepend UTF-8 BOM so Excel correctly renders Serbian diacritics instead of mangling them.
    csv_bytes = codecs.BOM_UTF8 + buf.getvalue().encode("utf-8")
    return StreamingResponse(
        iter([csv_bytes]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


############################################
# Admin - Audit Log
############################################

@app.get("/admin/audit-log", tags=["Admin"])
def admin_list_audit_log(
        limit: int = 50,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    limit = max(1, min(limit, 200))
    entries = database.query(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": e.id,
            "actor_email": e.actor_email,
            "action": e.action,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "created_at": e.created_at.isoformat(),
        }
        for e in entries
    ]


############################################
# Events / Supervision (Dešavanja/supervizije)
############################################

SUPERVISION_EVENT_TYPES = {"supervizija", "desavanje"}


class SupervisionEventCreate(BaseModel):
    title: str
    type: Optional[str] = "supervizija"
    starts_at: datetime
    location: Optional[str] = None
    description: Optional[str] = None


class SupervisionEventUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    starts_at: Optional[datetime] = None
    location: Optional[str] = None
    description: Optional[str] = None


def require_approved_member(
        request: Request,
        database: Session = Depends(get_db),
) -> "UserProfile":
    """Any approved therapist, resolved from the verified bearer token -
    used so a therapist can only ever sign themselves up/out."""
    supabase_user_id = get_verified_supabase_user_id(request)
    profile = database.query(UserProfile).filter(
        UserProfile.supabase_user_id == supabase_user_id
    ).first()
    if not profile:
        raise HTTPException(status_code=401, detail="No profile for this account")
    if not profile.is_approved:
        raise HTTPException(status_code=403, detail="Account pending approval")
    return profile


def _supervision_event_payload(e: "SupervisionEvent") -> dict:
    return {
        "id": e.id,
        "title": e.title,
        "type": e.type,
        "starts_at": e.starts_at.isoformat(),
        "location": e.location,
        "description": e.description,
    }


def _clean_event_type(value: Optional[str]) -> str:
    event_type = (value or "supervizija").strip().lower()
    if event_type not in SUPERVISION_EVENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Nepoznat tip događaja: {value}")
    return event_type


@app.get("/supervision/events", tags=["Supervision"])
def list_supervision_events(
        member: UserProfile = Depends(require_approved_member),
        database: Session = Depends(get_db),
):
    events = database.query(SupervisionEvent).order_by(SupervisionEvent.starts_at.asc()).all()
    signups = database.query(SupervisionSignup).all()
    counts = Counter(s.event_id for s in signups)
    mine = {s.event_id for s in signups if s.user_profile_id == member.id}
    return [
        {**_supervision_event_payload(e), "signup_count": counts.get(e.id, 0), "signed_up": e.id in mine}
        for e in events
    ]


@app.post("/supervision/events/{event_id}/signup", tags=["Supervision"])
def signup_for_supervision_event(
        event_id: int,
        member: UserProfile = Depends(require_approved_member),
        database: Session = Depends(get_db),
):
    event = database.query(SupervisionEvent).filter(SupervisionEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Događaj nije pronađen")
    if event.starts_at < datetime.now():
        raise HTTPException(status_code=400, detail="Prijave za ovaj događaj su zatvorene.")
    existing = database.query(SupervisionSignup).filter(
        SupervisionSignup.event_id == event_id,
        SupervisionSignup.user_profile_id == member.id,
    ).first()
    if not existing:
        database.add(SupervisionSignup(event_id=event_id, user_profile_id=member.id))
        try:
            database.commit()
        except IntegrityError:
            database.rollback()  # double click - already signed up
    return {"event_id": event_id, "signed_up": True}


@app.delete("/supervision/events/{event_id}/signup", tags=["Supervision"])
def cancel_supervision_signup(
        event_id: int,
        member: UserProfile = Depends(require_approved_member),
        database: Session = Depends(get_db),
):
    event = database.query(SupervisionEvent).filter(SupervisionEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Događaj nije pronađen")
    if event.starts_at < datetime.now():
        raise HTTPException(status_code=400, detail="Događaj je već prošao.")
    database.query(SupervisionSignup).filter(
        SupervisionSignup.event_id == event_id,
        SupervisionSignup.user_profile_id == member.id,
    ).delete()
    database.commit()
    return {"event_id": event_id, "signed_up": False}


@app.get("/admin/supervision", tags=["Admin"])
def admin_supervision_overview(
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    events = database.query(SupervisionEvent).order_by(SupervisionEvent.starts_at.asc()).all()
    signups = database.query(SupervisionSignup).order_by(SupervisionSignup.created_at.asc()).all()
    therapists = database.query(UserProfile).filter(
        UserProfile.is_approved == True  # noqa: E712
    ).order_by(UserProfile.created_at).all()
    names = {t.id: _therapist_name(t) for t in therapists}

    by_event: dict = {}
    per_therapist = Counter()
    for s in signups:
        by_event.setdefault(s.event_id, []).append({
            "user_profile_id": s.user_profile_id,
            "name": names.get(s.user_profile_id) or _therapist_name(s.user_profile) or "—",
            "signed_up_at": s.created_at.isoformat() if s.created_at else None,
        })
        per_therapist[s.user_profile_id] += 1

    return {
        "events": [
            {**_supervision_event_payload(e), "signups": by_event.get(e.id, [])}
            for e in events
        ],
        "therapists": [
            {
                "user_profile_id": t.id,
                "name": names[t.id],
                "active": t.active,
                "signup_count": per_therapist.get(t.id, 0),
            }
            for t in therapists
        ],
        "total_events": len(events),
        "total_signups": len(signups),
    }


@app.post("/admin/supervision/events", tags=["Admin"])
def admin_create_supervision_event(
        data: SupervisionEventCreate,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    title = (data.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Naziv je obavezan.")
    event = SupervisionEvent(
        title=title,
        type=_clean_event_type(data.type),
        starts_at=data.starts_at.replace(tzinfo=None),
        location=(data.location or "").strip() or None,
        description=(data.description or "").strip() or None,
        created_by_id=admin.id,
    )
    database.add(event)
    database.flush()
    _log_admin_action(database, admin, "SUPERVISION_EVENT_CREATED", "supervision_event", event.id)
    database.commit()
    database.refresh(event)
    return _supervision_event_payload(event)


@app.put("/admin/supervision/events/{event_id}", tags=["Admin"])
def admin_update_supervision_event(
        event_id: int,
        data: SupervisionEventUpdate,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    event = database.query(SupervisionEvent).filter(SupervisionEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Događaj nije pronađen")
    if data.title is not None:
        if not data.title.strip():
            raise HTTPException(status_code=400, detail="Naziv je obavezan.")
        event.title = data.title.strip()
    if data.type is not None:
        event.type = _clean_event_type(data.type)
    if data.starts_at is not None:
        event.starts_at = data.starts_at.replace(tzinfo=None)
    if data.location is not None:
        event.location = data.location.strip() or None
    if data.description is not None:
        event.description = data.description.strip() or None
    _log_admin_action(database, admin, "SUPERVISION_EVENT_UPDATED", "supervision_event", event.id)
    database.commit()
    database.refresh(event)
    return _supervision_event_payload(event)


@app.delete("/admin/supervision/events/{event_id}", tags=["Admin"])
def admin_delete_supervision_event(
        event_id: int,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    event = database.query(SupervisionEvent).filter(SupervisionEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Događaj nije pronađen")
    database.delete(event)
    _log_admin_action(database, admin, "SUPERVISION_EVENT_DELETED", "supervision_event", event_id)
    database.commit()
    return {"message": "Deleted", "id": event_id}


@app.delete("/admin/supervision/events/{event_id}/signups/{user_profile_id}", tags=["Admin"])
def admin_remove_supervision_signup(
        event_id: int,
        user_profile_id: int,
        admin: UserProfile = Depends(require_admin),
        database: Session = Depends(get_db),
):
    deleted = database.query(SupervisionSignup).filter(
        SupervisionSignup.event_id == event_id,
        SupervisionSignup.user_profile_id == user_profile_id,
    ).delete()
    if not deleted:
        raise HTTPException(status_code=404, detail="Prijava nije pronađena")
    _log_admin_action(database, admin, "SUPERVISION_SIGNUP_REMOVED", "supervision_event", event_id)
    database.commit()
    return {"message": "Removed", "event_id": event_id, "user_profile_id": user_profile_id}


############################################
# Maintaining the server
############################################
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)