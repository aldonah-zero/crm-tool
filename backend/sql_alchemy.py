import os
from typing import List, Optional
from sqlalchemy import (
    create_engine, ForeignKey, String, Date, DateTime,
    Float, Integer, Boolean, Text, UniqueConstraint
)
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship
)
from datetime import datetime as dt_datetime, date as dt_date


############################################
# Base
############################################

class Base(DeclarativeBase):
    pass


############################################
# Tenant
############################################

class Tenant(Base):
    __tablename__ = "tenant"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[Optional[dt_datetime]] = mapped_column(DateTime, default=dt_datetime.utcnow)

    # Client-facing "Find a Therapist" matching
    specialties: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # comma-separated slugs, see therapist_profile_options.py
    modalities: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # comma-separated psychotherapy modality slugs
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # therapist's own plain-text biography
    working_hours: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON, keyed by weekday "0"-"6"
    default_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # data: URL, shown to clients

    # Billing - free trial, then a manually-confirmed monthly subscription
    # (no card processor yet; see /internal/mark-subscription-paid).
    trial_ends_at: Mapped[Optional[dt_datetime]] = mapped_column(DateTime, nullable=True)
    subscription_paid_until: Mapped[Optional[dt_datetime]] = mapped_column(DateTime, nullable=True)

    klijenti = relationship("Klijent", backref="tenant")
    grupe = relationship("Grupa", backref="tenant")
    sesije = relationship("Sesija", backref="tenant")
    cene = relationship("Cena", backref="tenant")
    user_profiles = relationship("UserProfile", back_populates="tenant")


############################################
# User Profile (links Supabase Auth → Tenant)
############################################

class UserProfile(Base):
    __tablename__ = "user_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    supabase_user_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="owner")  # owner | member
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenant.id"), nullable=False)
    created_at: Mapped[Optional[dt_datetime]] = mapped_column(DateTime, default=dt_datetime.utcnow)

    # Admin-managed "is this therapist currently active" flag - independent of
    # role (owner/member). Deactivated therapists are hidden from active
    # rosters/assignment pickers but their historical clients/sessions stay intact.
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Center-administrator permission - deliberately NOT derived from role
    # (owner/member). "owner" is just whoever created the tenant and may
    # themselves be a practicing psychotherapist; is_admin is the one and
    # only gate for the admin area (see require_admin in main_api.py) so a
    # psychotherapist can never reach it just by being an owner or by
    # joining via an invite link (join_tenant never sets this True).
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    # New registrations (self-registered or joined via invite) start
    # unapproved and can't use the app until an admin approves them - see
    # require_approved_profile/POST .../approve in main_api.py. Existing
    # rows are grandfathered to True by a one-time backfill migration so
    # nobody already using the app gets locked out.
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)

    tenant = relationship("Tenant", back_populates="user_profiles")


############################################
# Client Account (links Supabase Auth → a client identity, not tied to
# any single tenant - a client's bookings are just Klijent rows across
# any number of practices matching this account's email)
############################################

class ClientAccount(Base):
    __tablename__ = "client_account"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    supabase_user_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # data: URL
    created_at: Mapped[Optional[dt_datetime]] = mapped_column(DateTime, default=dt_datetime.utcnow)


############################################
# Core Tables
############################################

class Klijent(Base):
    __tablename__ = "klijent"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenant.id"), nullable=False)

    ime: Mapped[str] = mapped_column(String(100))
    prezime: Mapped[str] = mapped_column(String(100))
    broj_telefona: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Admin client-registry fields (Mental Health Center admin area)
    gender: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # female | male | other | unknown
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)  # active | completed | archived
    therapist_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user_profile.id"), nullable=True, index=True)
    date_started: Mapped[Optional[dt_date]] = mapped_column(Date, nullable=True)
    date_completed: Mapped[Optional[dt_date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[Optional[dt_datetime]] = mapped_column(DateTime, default=dt_datetime.utcnow)
    updated_at: Mapped[Optional[dt_datetime]] = mapped_column(DateTime, default=dt_datetime.utcnow, onupdate=dt_datetime.utcnow)

    sesijaklijent = relationship("SesijaKlijent", back_populates="klijent")
    cena_1 = relationship("Cena", back_populates="klijent_1")
    grupa_clanstva = relationship("GrupaKlijent", back_populates="klijent")
    therapist = relationship("UserProfile", foreign_keys=[therapist_id])


class KlijentNapomena(Base):
    """A therapist's freeform notes on a client's progress - a timestamped,
    optionally-categorized journal, separate from session records."""
    __tablename__ = "klijent_napomena"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenant.id"), nullable=False)
    klijent_id: Mapped[int] = mapped_column(ForeignKey("klijent.id"), nullable=False)

    tekst: Mapped[str] = mapped_column(Text)
    kategorija: Mapped[str] = mapped_column(String(50), default="opste")
    author_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[dt_datetime] = mapped_column(DateTime, default=dt_datetime.utcnow)


class Grupa(Base):
    __tablename__ = "grupa"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenant.id"), nullable=False)

    naziv: Mapped[str] = mapped_column(String(100))
    opis: Mapped[str] = mapped_column(String(255))
    cena: Mapped[float] = mapped_column(Float)

    sesijagrupa = relationship("SesijaGrupa", back_populates="grupa")
    grupa_clanovi = relationship("GrupaKlijent", back_populates="grupa")


class Sesija(Base):
    __tablename__ = "sesija"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenant.id"), nullable=False)

    pocetak: Mapped[dt_datetime] = mapped_column(DateTime, index=True)
    kraj: Mapped[dt_datetime] = mapped_column(DateTime)

    cena: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(100))
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False)

    # Which therapist ran the session, and whether it counts toward the
    # first-N-sessions-free policy (see FREE_SESSIONS_COUNT in main_api.py).
    therapist_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user_profile.id"), nullable=True, index=True)
    is_free: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)

    uplate = relationship("Cena", back_populates="sesija_2")
    sesijaklijent_1 = relationship("SesijaKlijent", back_populates="sesija")
    sesijagrupa_1 = relationship("SesijaGrupa", back_populates="sesija_1")
    therapist = relationship("UserProfile", foreign_keys=[therapist_id])


############################################
# Payments
############################################

class Cena(Base):
    __tablename__ = "cena"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenant.id"), nullable=False)

    cena: Mapped[float] = mapped_column(Float)
    datum_uplate: Mapped[dt_date] = mapped_column(Date)
    nacin_placanja: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(100))

    sesija_2_id: Mapped[int] = mapped_column(ForeignKey("sesija.id"))
    klijent_1_id: Mapped[Optional[int]] = mapped_column(ForeignKey("klijent.id"), nullable=True)

    sesija_2 = relationship("Sesija", back_populates="uplate")
    klijent_1 = relationship("Klijent", back_populates="cena_1")


############################################
# Relationship Tables
############################################

class SesijaKlijent(Base):
    __tablename__ = "sesijaklijent"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenant.id"), nullable=False)

    klijent_id: Mapped[int] = mapped_column(ForeignKey("klijent.id"))
    sesija_id: Mapped[int] = mapped_column(ForeignKey("sesija.id"))

    klijent = relationship("Klijent", back_populates="sesijaklijent")
    sesija = relationship("Sesija", back_populates="sesijaklijent_1")


class SesijaGrupa(Base):
    __tablename__ = "sesijagrupa"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenant.id"), nullable=False)

    grupa_id: Mapped[int] = mapped_column(ForeignKey("grupa.id"))
    sesija_1_id: Mapped[int] = mapped_column(ForeignKey("sesija.id"))

    grupa = relationship("Grupa", back_populates="sesijagrupa")
    sesija_1 = relationship("Sesija", back_populates="sesijagrupa_1")


class GrupaKlijent(Base):
    __tablename__ = "grupaklijent"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenant.id"), nullable=False)

    grupa_id: Mapped[int] = mapped_column(ForeignKey("grupa.id"))
    klijent_id: Mapped[int] = mapped_column(ForeignKey("klijent.id"))

    grupa = relationship("Grupa", back_populates="grupa_clanovi")
    klijent = relationship("Klijent", back_populates="grupa_clanstva")


############################################
# Admin: Team Attendance
############################################

class TeamMeeting(Base):
    __tablename__ = "team_meeting"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenant.id"), nullable=False, index=True)

    date: Mapped[dt_date] = mapped_column(Date, index=True)
    type: Mapped[str] = mapped_column(String(100), default="team_meeting")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user_profile.id"), nullable=True)
    created_at: Mapped[dt_datetime] = mapped_column(DateTime, default=dt_datetime.utcnow)

    attendance_records = relationship("AttendanceRecord", back_populates="meeting", cascade="all, delete-orphan")


class AttendanceRecord(Base):
    __tablename__ = "attendance_record"
    __table_args__ = (
        UniqueConstraint("meeting_id", "user_profile_id", name="uq_attendance_meeting_member"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenant.id"), nullable=False, index=True)

    meeting_id: Mapped[int] = mapped_column(ForeignKey("team_meeting.id"), index=True)
    user_profile_id: Mapped[int] = mapped_column(ForeignKey("user_profile.id"), index=True)
    status: Mapped[str] = mapped_column(String(20))  # present | absent | excused

    created_at: Mapped[dt_datetime] = mapped_column(DateTime, default=dt_datetime.utcnow)
    updated_at: Mapped[dt_datetime] = mapped_column(DateTime, default=dt_datetime.utcnow, onupdate=dt_datetime.utcnow)

    meeting = relationship("TeamMeeting", back_populates="attendance_records")
    user_profile = relationship("UserProfile", foreign_keys=[user_profile_id])


############################################
# Events / Supervision (Dešavanja/supervizije)
############################################

class SupervisionEvent(Base):
    """An event the admin creates once and every therapist sees on their
    "Dešavanja/supervizije" calendar - deliberately global (not filtered by
    tenant), same as the rest of the admin area."""
    __tablename__ = "supervision_event"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(50), default="supervizija")  # supervizija | desavanje
    starts_at: Mapped[dt_datetime] = mapped_column(DateTime, index=True)  # local (Serbia) wall-clock time
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user_profile.id"), nullable=True)
    created_at: Mapped[dt_datetime] = mapped_column(DateTime, default=dt_datetime.utcnow)

    signups = relationship("SupervisionSignup", back_populates="event", cascade="all, delete-orphan")


class SupervisionSignup(Base):
    __tablename__ = "supervision_signup"
    __table_args__ = (
        UniqueConstraint("event_id", "user_profile_id", name="uq_supervision_signup_event_member"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("supervision_event.id"), index=True)
    user_profile_id: Mapped[int] = mapped_column(ForeignKey("user_profile.id"), index=True)
    created_at: Mapped[dt_datetime] = mapped_column(DateTime, default=dt_datetime.utcnow)

    event = relationship("SupervisionEvent", back_populates="signups")
    user_profile = relationship("UserProfile", foreign_keys=[user_profile_id])


############################################
# Admin: Audit Log
############################################

class AdminAuditLog(Base):
    __tablename__ = "admin_audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenant.id"), nullable=False, index=True)

    actor_user_profile_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user_profile.id"), nullable=True)
    actor_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(50))  # e.g. CLIENT_CREATED, SESSION_DELETED
    entity_type: Mapped[str] = mapped_column(String(50))  # e.g. klijent, sesija, therapist, attendance
    entity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[dt_datetime] = mapped_column(DateTime, default=dt_datetime.utcnow, index=True)