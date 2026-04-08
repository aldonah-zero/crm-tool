import os
import enum
from typing import List, Optional
from sqlalchemy import (
    create_engine, ForeignKey, String, Date, DateTime,
    Float, Integer
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
    name: Mapped[str] = mapped_column(String(100))

    klijenti = relationship("Klijent", backref="tenant")
    grupe = relationship("Grupa", backref="tenant")
    sesije = relationship("Sesija", backref="tenant")
    cene = relationship("Cena", backref="tenant")


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

    sesijaklijent = relationship("SesijaKlijent", back_populates="klijent")
    cena_1 = relationship("Cena", back_populates="klijent_1")
    grupa_clanstva = relationship("GrupaKlijent", back_populates="klijent")


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

    pocetak: Mapped[dt_datetime] = mapped_column(DateTime)
    kraj: Mapped[dt_datetime] = mapped_column(DateTime)

    cena: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(100))

    uplate = relationship("Cena", back_populates="sesija_2")
    sesijaklijent_1 = relationship("SesijaKlijent", back_populates="sesija")
    sesijagrupa_1 = relationship("SesijaGrupa", back_populates="sesija_1")


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
    klijent_1_id: Mapped[int] = mapped_column(ForeignKey("klijent.id"))

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


# ############################################
# # Database Connection
# ############################################
#
# DATABASE_URL = os.getenv(
#     "DATABASE_URL",
#     "sqlite:///./Class_Diagram.db"
# )
#
# engine = create_engine(DATABASE_URL, echo=True)
#
# Base.metadata.create_all(engine)