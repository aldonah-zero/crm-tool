import enum
from typing import List, Optional
from sqlalchemy import (
    create_engine, Column, ForeignKey, Table, Text, Boolean, String, Date, 
    Time, DateTime, Float, Integer, Enum
)
from sqlalchemy.orm import (
    column_property, DeclarativeBase, Mapped, mapped_column, relationship
)
from datetime import datetime as dt_datetime, time as dt_time, date as dt_date

class Base(DeclarativeBase):
    pass



# Tables definition for many-to-many relationships

# Tables definition
class Cena(Base):
    __tablename__ = "cena"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cena: Mapped[float] = mapped_column(Float)
    datum_uplate: Mapped[dt_date] = mapped_column(Date)
    nacin_placanja: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(100))
    sesija_2_id: Mapped[int] = mapped_column(ForeignKey("sesija.id"))
    klijent_1_id: Mapped[int] = mapped_column(ForeignKey("klijent.id"))

class SesijaGrupa(Base):
    __tablename__ = "sesijagrupa"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    grupa_id: Mapped[int] = mapped_column(ForeignKey("grupa.id"))
    sesija_1_id: Mapped[int] = mapped_column(ForeignKey("sesija.id"))

class SesijaKlijent(Base):
    __tablename__ = "sesijaklijent"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    klijent_id: Mapped[int] = mapped_column(ForeignKey("klijent.id"))
    sesija_id: Mapped[int] = mapped_column(ForeignKey("sesija.id"))

class Sesija(Base):
    __tablename__ = "sesija"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pocetak: Mapped[dt_datetime] = mapped_column(DateTime)
    kraj: Mapped[dt_datetime] = mapped_column(DateTime)
    cena: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(100))

class Grupa(Base):
    __tablename__ = "grupa"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    naziv: Mapped[str] = mapped_column(String(100))
    opis: Mapped[str] = mapped_column(String(100))
    cena: Mapped[float] = mapped_column(Float)

class Klijent(Base):
    __tablename__ = "klijent"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ime: Mapped[str] = mapped_column(String(100))
    prezime: Mapped[str] = mapped_column(String(100))
    broj_telefona: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

class GrupaKlijent(Base):
    __tablename__ = "grupaklijent"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    grupa_id: Mapped[int] = mapped_column(ForeignKey("grupa.id"), nullable=False)
    klijent_id: Mapped[int] = mapped_column(ForeignKey("klijent.id"), nullable=False)



#--- Relationships of the cena table
Cena.sesija_2: Mapped["Sesija"] = relationship("Sesija", back_populates="uplate", foreign_keys=[Cena.sesija_2_id])
Cena.klijent_1: Mapped["Klijent"] = relationship("Klijent", back_populates="cena_1", foreign_keys=[Cena.klijent_1_id])

#--- Relationships of the sesijagrupa table
SesijaGrupa.grupa: Mapped["Grupa"] = relationship("Grupa", back_populates="sesijagrupa", foreign_keys=[SesijaGrupa.grupa_id])
SesijaGrupa.sesija_1: Mapped["Sesija"] = relationship("Sesija", back_populates="sesijagrupa_1", foreign_keys=[SesijaGrupa.sesija_1_id])

#--- Relationships of the sesijaklijent table
SesijaKlijent.klijent: Mapped["Klijent"] = relationship("Klijent", back_populates="sesijaklijent", foreign_keys=[SesijaKlijent.klijent_id])
SesijaKlijent.sesija: Mapped["Sesija"] = relationship("Sesija", back_populates="sesijaklijent_1", foreign_keys=[SesijaKlijent.sesija_id])

#--- Relationships of the sesija table
Sesija.uplate: Mapped[List["Cena"]] = relationship("Cena", back_populates="sesija_2", foreign_keys=[Cena.sesija_2_id], cascade="all, delete-orphan")
Sesija.sesijaklijent_1: Mapped[List["SesijaKlijent"]] = relationship("SesijaKlijent", back_populates="sesija", foreign_keys=[SesijaKlijent.sesija_id], cascade="all, delete-orphan")
Sesija.sesijagrupa_1: Mapped[List["SesijaGrupa"]] = relationship("SesijaGrupa", back_populates="sesija_1", foreign_keys=[SesijaGrupa.sesija_1_id], cascade="all, delete-orphan")

#--- Relationships of the grupa table
Grupa.sesijagrupa: Mapped[List["SesijaGrupa"]] = relationship("SesijaGrupa", back_populates="grupa", foreign_keys=[SesijaGrupa.grupa_id], cascade="all, delete-orphan")
Grupa.grupa_clanovi: Mapped[List["GrupaKlijent"]] = relationship("GrupaKlijent", back_populates="grupa", foreign_keys=[GrupaKlijent.grupa_id], cascade="all, delete-orphan")

#--- Relationships of the klijent table
Klijent.sesijaklijent: Mapped[List["SesijaKlijent"]] = relationship("SesijaKlijent", back_populates="klijent", foreign_keys=[SesijaKlijent.klijent_id], cascade="all, delete-orphan")
Klijent.cena_1: Mapped[List["Cena"]] = relationship("Cena", back_populates="klijent_1", foreign_keys=[Cena.klijent_1_id], cascade="all, delete-orphan")
Klijent.grupa_clanstva: Mapped[List["GrupaKlijent"]] = relationship("GrupaKlijent", back_populates="klijent", foreign_keys=[GrupaKlijent.klijent_id], cascade="all, delete-orphan")

#--- Relationships of the grupaklijent table
GrupaKlijent.grupa: Mapped["Grupa"] = relationship("Grupa", back_populates="grupa_clanovi", foreign_keys=[GrupaKlijent.grupa_id])
GrupaKlijent.klijent: Mapped["Klijent"] = relationship("Klijent", back_populates="grupa_clanstva", foreign_keys=[GrupaKlijent.klijent_id])

# Database connection
DATABASE_URL = "sqlite:///Class_Diagram.db"  # SQLite connection
engine = create_engine(DATABASE_URL, echo=True)

# Create tables in the database
Base.metadata.create_all(engine, checkfirst=True)