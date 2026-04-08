from datetime import datetime, date
from typing import List, Optional
from pydantic import BaseModel


############################################
# Create Schemas
############################################

class CenaCreate(BaseModel):
    cena: float
    status: str
    nacin_placanja: str
    datum_uplate: date

    sesija_2: int
    klijent_1: int

    id: Optional[int] = None


class SesijaGrupaCreate(BaseModel):
    grupa: int
    sesija_1: int

    id: Optional[int] = None


class SesijaKlijentCreate(BaseModel):
    klijent: int
    sesija: int

    id: Optional[int] = None


class SesijaCreate(BaseModel):
    cena: float
    status: str
    pocetak: datetime
    kraj: datetime

    klijent_id: Optional[int] = None
    grupa_id: Optional[int] = None

    uplate: Optional[List[int]] = None
    sesijaklijent_1: Optional[List[int]] = None
    sesijagrupa_1: Optional[List[int]] = None

    id: Optional[int] = None


class GrupaCreate(BaseModel):
    naziv: str
    cena: float
    opis: Optional[str] = None

    sesijagrupa: Optional[List[int]] = None
    clanovi: Optional[List[int]] = None

    id: Optional[int] = None


class KlijentCreate(BaseModel):
    ime: str
    prezime: str

    email: Optional[str] = None
    broj_telefona: Optional[str] = None

    sesijaklijent: Optional[List[int]] = None
    cena_1: Optional[List[int]] = None

    id: Optional[int] = None


class GrupaKlijentCreate(BaseModel):
    grupa_id: int
    klijent_id: int