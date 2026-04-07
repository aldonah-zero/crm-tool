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
    cena: float
    id: Optional[int] = None
    status: str
    nacin_placanja: str
    datum_uplate: date
    sesija_2: int  # N:1 Relationship (mandatory)
    klijent_1: int  # N:1 Relationship (mandatory)


class SesijaGrupaCreate(BaseModel):
    id: Optional[int] = None
    grupa: int  # N:1 Relationship (mandatory)
    sesija_1: int  # N:1 Relationship (mandatory)


class SesijaKlijentCreate(BaseModel):
    id: Optional[int] = None
    klijent: int  # N:1 Relationship (mandatory)
    sesija: int  # N:1 Relationship (mandatory)


class SesijaCreate(BaseModel):
    cena: float                                      # float column - price of session
    status: str
    id: Optional[int] = None
    pocetak: datetime
    klijent_id: Optional[int] = None                 # For individual sessions
    grupa_id: Optional[int] = None                   # For group sessions
    kraj: datetime
    uplate: Optional[List[int]] = None               # 1:N Relationship to Cena
    sesijaklijent_1: Optional[List[int]] = None      # 1:N Relationship
    sesijagrupa_1: Optional[List[int]] = None        # 1:N Relationship


class GrupaCreate(BaseModel):
    opis: Optional[str] = None
    id: Optional[int] = None
    cena: float
    naziv: str
    sesijagrupa: Optional[List[int]] = None          # 1:N Relationship
    clanovi: Optional[List[int]] = None              # List of klijent IDs who are members of this group


class KlijentCreate(BaseModel):
    ime: str
    email: Optional[str] = None                      # Optional - if provided, client gets email notifications
    id: Optional[int] = None                         # Optional - auto-increment
    prezime: str
    broj_telefona: Optional[str] = None              # Optional
    sesijaklijent: Optional[List[int]] = None        # 1:N Relationship
    cena_1: Optional[List[int]] = None               # 1:N Relationship


class GrupaKlijentCreate(BaseModel):
    grupa_id: Optional[int] = None
    klijent_id: Optional[int] = None