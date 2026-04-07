from datetime import datetime, date, time
from typing import Any, List, Optional, Union, Set
from enum import Enum
from pydantic import BaseModel, field_validator


############################################
# Enumerations are defined here
############################################

############################################
# Classes are defined here
############################################
class CenaCreate(BaseModel):
    nacin_placanja: str
    datum_uplate: date
    id: int
    cena: float
    status: str
    sesija_2: int  # N:1 Relationship (mandatory)
    klijent_1: int  # N:1 Relationship (mandatory)


class SesijaGrupaCreate(BaseModel):
    id: int
    grupa: int  # N:1 Relationship (mandatory)
    sesija_1: int  # N:1 Relationship (mandatory)


class SesijaKlijentCreate(BaseModel):
    id: int
    sesija: int  # N:1 Relationship (mandatory)
    klijent: int  # N:1 Relationship (mandatory)


class SesijaCreate(BaseModel):
    id: int
    pocetak: datetime
    cena: float
    status: str
    kraj: datetime
    sesijaklijent_1: Optional[List[int]] = None  # 1:N Relationship
    cena: Optional[List[int]] = None  # 1:N Relationship
    sesijagrupa_1: Optional[List[int]] = None  # 1:N Relationship


class GrupaCreate(BaseModel):
    naziv: str
    cena: float
    opis: str
    id: int
    sesijagrupa: Optional[List[int]] = None  # 1:N Relationship


class KlijentCreate(BaseModel):
    id: int
    ime: str
    prezime: str
    email: str
    broj_telefona: str
    cena_1: Optional[List[int]] = None  # 1:N Relationship
    sesijaklijent: Optional[List[int]] = None  # 1:N Relationship


