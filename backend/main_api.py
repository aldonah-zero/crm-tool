import uvicorn
import os, json
import time as time_module
import logging
from fastapi import Depends, FastAPI, HTTPException, Request, status, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from pydantic_classes import *
from sql_alchemy import *

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

############################################
#
#   Initialize the database
#
############################################

def init_db():
    SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/Class_Diagram.db")
    # Ensure local SQLite directory exists (safe no-op for other DBs)
    os.makedirs("data", exist_ok=True)
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        echo=False
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
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
        {"name": "Klijent", "description": "Operations for Klijent entities"},
        {"name": "Klijent Relationships", "description": "Manage Klijent relationships"},
    ]
)

# Enable CORS for all origins (for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Or restrict to ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

############################################
#
#   Middleware
#
############################################

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests and responses."""
    logger.info(f"Incoming request: {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"Response status: {response.status_code}")
    return response

# Request timing middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Add processing time header to all responses."""
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

# Global exception handlers
@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """Handle ValueError exceptions."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "error": "Bad Request",
            "message": str(exc),
            "detail": "Invalid input data provided"
        }
    )


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    """Handle database integrity errors."""
    logger.error(f"Database integrity error: {exc}")

    # Extract more detailed error information
    error_detail = str(exc.orig) if hasattr(exc, 'orig') else str(exc)

    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={
            "error": "Conflict",
            "message": "Data conflict occurred",
            "detail": error_detail
        }
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError):
    """Handle general SQLAlchemy errors."""
    logger.error(f"Database error: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal Server Error",
            "message": "Database operation failed",
            "detail": "An internal database error occurred"
        }
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions with consistent format."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail if isinstance(exc.detail, str) else "HTTP Error",
            "message": exc.detail,
            "detail": f"HTTP {exc.status_code} error occurred"
        }
    )

# Initialize database session
SessionLocal = init_db()
# Dependency to get DB session
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

############################################
#
#   Global API endpoints
#
############################################

@app.get("/", tags=["System"])
def root():
    """Root endpoint - API information"""
    return {
        "name": "Class_Diagram API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health", tags=["System"])
def health_check():
    """Health check endpoint for monitoring"""
    from datetime import datetime
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "database": "connected"
    }


@app.get("/statistics", tags=["System"])
def get_statistics(database: Session = Depends(get_db)):
    """Get database statistics for all entities"""
    stats = {}
    stats["cena_count"] = database.query(Cena).count()
    stats["sesijagrupa_count"] = database.query(SesijaGrupa).count()
    stats["sesijaklijent_count"] = database.query(SesijaKlijent).count()
    stats["sesija_count"] = database.query(Sesija).count()
    stats["grupa_count"] = database.query(Grupa).count()
    stats["klijent_count"] = database.query(Klijent).count()
    stats["total_entities"] = sum(stats.values())
    return stats


############################################
#
#   BESSER Action Language standard lib
#
############################################


async def BAL_size(sequence:list) -> int:
    return len(sequence)

async def BAL_is_empty(sequence:list) -> bool:
    return len(sequence) == 0

async def BAL_add(sequence:list, elem) -> None:
    sequence.append(elem)

async def BAL_remove(sequence:list, elem) -> None:
    sequence.remove(elem)

async def BAL_contains(sequence:list, elem) -> bool:
    return elem in sequence

async def BAL_filter(sequence:list, predicate) -> list:
    return [elem for elem in sequence if predicate(elem)]

async def BAL_forall(sequence:list, predicate) -> bool:
    for elem in sequence:
        if not predicate(elem):
            return False
    return True

async def BAL_exists(sequence:list, predicate) -> bool:
    for elem in sequence:
        if predicate(elem):
            return True
    return False

async def BAL_one(sequence:list, predicate) -> bool:
    found = False
    for elem in sequence:
        if predicate(elem):
            if found:
                return False
            found = True
    return found

async def BAL_is_unique(sequence:list, mapping) -> bool:
    mapped = [mapping(elem) for elem in sequence]
    return len(set(mapped)) == len(mapped)

async def BAL_map(sequence:list, mapping) -> list:
    return [mapping(elem) for elem in sequence]

async def BAL_reduce(sequence:list, reduce_fn, aggregator) -> any:
    for elem in sequence:
        aggregator = reduce_fn(aggregator, elem)
    return aggregator


############################################
#
#   Cena functions
#
############################################

@app.get("/cena/", response_model=None, tags=["Cena"])
def get_all_cena(detailed: bool = False, database: Session = Depends(get_db)) -> list:
    from sqlalchemy.orm import joinedload

    # Use detailed=true to get entities with eagerly loaded relationships (for tables with lookup columns)
    if detailed:
        # Eagerly load all relationships to avoid N+1 queries
        query = database.query(Cena)
        query = query.options(joinedload(Cena.sesija_2))
        query = query.options(joinedload(Cena.klijent_1))
        cena_list = query.all()

        # Serialize with relationships included
        result = []
        for cena_item in cena_list:
            item_dict = cena_item.__dict__.copy()
            item_dict.pop('_sa_instance_state', None)

            # Add many-to-one relationships (foreign keys for lookup columns)
            if cena_item.sesija_2:
                related_obj = cena_item.sesija_2
                related_dict = related_obj.__dict__.copy()
                related_dict.pop('_sa_instance_state', None)
                item_dict['sesija_2'] = related_dict
            else:
                item_dict['sesija_2'] = None
            if cena_item.klijent_1:
                related_obj = cena_item.klijent_1
                related_dict = related_obj.__dict__.copy()
                related_dict.pop('_sa_instance_state', None)
                item_dict['klijent_1'] = related_dict
            else:
                item_dict['klijent_1'] = None


            result.append(item_dict)
        return result
    else:
        # Default: return flat entities (faster for charts/widgets without lookup columns)
        return database.query(Cena).all()


@app.get("/cena/count/", response_model=None, tags=["Cena"])
def get_count_cena(database: Session = Depends(get_db)) -> dict:
    """Get the total count of Cena entities"""
    count = database.query(Cena).count()
    return {"count": count}


@app.get("/cena/paginated/", response_model=None, tags=["Cena"])
def get_paginated_cena(skip: int = 0, limit: int = 100, detailed: bool = False, database: Session = Depends(get_db)) -> dict:
    """Get paginated list of Cena entities"""
    total = database.query(Cena).count()
    cena_list = database.query(Cena).offset(skip).limit(limit).all()
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": cena_list
    }


@app.get("/cena/search/", response_model=None, tags=["Cena"])
def search_cena(
    database: Session = Depends(get_db)
) -> list:
    """Search Cena entities by attributes"""
    query = database.query(Cena)


    results = query.all()
    return results


@app.get("/cena/{cena_id}/", response_model=None, tags=["Cena"])
async def get_cena(cena_id: int, database: Session = Depends(get_db)) -> Cena:
    db_cena = database.query(Cena).filter(Cena.id == cena_id).first()
    if db_cena is None:
        raise HTTPException(status_code=404, detail="Cena not found")

    response_data = {
        "cena": db_cena,
}
    return response_data



@app.post("/cena/", response_model=None, tags=["Cena"])
async def create_cena(cena_data: CenaCreate, database: Session = Depends(get_db)) -> Cena:

    if cena_data.sesija_2 is not None:
        db_sesija_2 = database.query(Sesija).filter(Sesija.id == cena_data.sesija_2).first()
        if not db_sesija_2:
            raise HTTPException(status_code=400, detail="Sesija not found")
    else:
        raise HTTPException(status_code=400, detail="Sesija ID is required")
    if cena_data.klijent_1 is not None:
        db_klijent_1 = database.query(Klijent).filter(Klijent.id == cena_data.klijent_1).first()
        if not db_klijent_1:
            raise HTTPException(status_code=400, detail="Klijent not found")
    else:
        raise HTTPException(status_code=400, detail="Klijent ID is required")

    db_cena = Cena(
        nacin_placanja=cena_data.nacin_placanja,        datum_uplate=cena_data.datum_uplate,        id=cena_data.id,        cena=cena_data.cena,        status=cena_data.status,        sesija_2_id=cena_data.sesija_2,        klijent_1_id=cena_data.klijent_1        )

    database.add(db_cena)
    database.commit()
    database.refresh(db_cena)




    return db_cena


@app.post("/cena/bulk/", response_model=None, tags=["Cena"])
async def bulk_create_cena(items: list[CenaCreate], database: Session = Depends(get_db)) -> dict:
    """Create multiple Cena entities at once"""
    created_items = []
    errors = []

    for idx, item_data in enumerate(items):
        try:
            # Basic validation for each item
            if not item_data.sesija_2:
                raise ValueError("Sesija ID is required")
            if not item_data.klijent_1:
                raise ValueError("Klijent ID is required")

            db_cena = Cena(
                nacin_placanja=item_data.nacin_placanja,                datum_uplate=item_data.datum_uplate,                id=item_data.id,                cena=item_data.cena,                status=item_data.status,                sesija_2_id=item_data.sesija_2,                klijent_1_id=item_data.klijent_1            )
            database.add(db_cena)
            database.flush()  # Get ID without committing
            created_items.append(db_cena.id)
        except Exception as e:
            errors.append({"index": idx, "error": str(e)})

    if errors:
        database.rollback()
        raise HTTPException(status_code=400, detail={"message": "Bulk creation failed", "errors": errors})

    database.commit()
    return {
        "created_count": len(created_items),
        "created_ids": created_items,
        "message": f"Successfully created {len(created_items)} Cena entities"
    }


@app.delete("/cena/bulk/", response_model=None, tags=["Cena"])
async def bulk_delete_cena(ids: list[int], database: Session = Depends(get_db)) -> dict:
    """Delete multiple Cena entities at once"""
    deleted_count = 0
    not_found = []

    for item_id in ids:
        db_cena = database.query(Cena).filter(Cena.id == item_id).first()
        if db_cena:
            database.delete(db_cena)
            deleted_count += 1
        else:
            not_found.append(item_id)

    database.commit()

    return {
        "deleted_count": deleted_count,
        "not_found": not_found,
        "message": f"Successfully deleted {deleted_count} Cena entities"
    }

@app.put("/cena/{cena_id}/", response_model=None, tags=["Cena"])
async def update_cena(cena_id: int, cena_data: CenaCreate, database: Session = Depends(get_db)) -> Cena:
    db_cena = database.query(Cena).filter(Cena.id == cena_id).first()
    if db_cena is None:
        raise HTTPException(status_code=404, detail="Cena not found")

    setattr(db_cena, 'nacin_placanja', cena_data.nacin_placanja)
    setattr(db_cena, 'datum_uplate', cena_data.datum_uplate)
    setattr(db_cena, 'id', cena_data.id)
    setattr(db_cena, 'cena', cena_data.cena)
    setattr(db_cena, 'status', cena_data.status)
    if cena_data.sesija_2 is not None:
        db_sesija_2 = database.query(Sesija).filter(Sesija.id == cena_data.sesija_2).first()
        if not db_sesija_2:
            raise HTTPException(status_code=400, detail="Sesija not found")
        setattr(db_cena, 'sesija_2_id', cena_data.sesija_2)
    if cena_data.klijent_1 is not None:
        db_klijent_1 = database.query(Klijent).filter(Klijent.id == cena_data.klijent_1).first()
        if not db_klijent_1:
            raise HTTPException(status_code=400, detail="Klijent not found")
        setattr(db_cena, 'klijent_1_id', cena_data.klijent_1)
    database.commit()
    database.refresh(db_cena)

    return db_cena


@app.delete("/cena/{cena_id}/", response_model=None, tags=["Cena"])
async def delete_cena(cena_id: int, database: Session = Depends(get_db)):
    db_cena = database.query(Cena).filter(Cena.id == cena_id).first()
    if db_cena is None:
        raise HTTPException(status_code=404, detail="Cena not found")
    database.delete(db_cena)
    database.commit()
    return db_cena





############################################
#
#   SesijaGrupa functions
#
############################################

@app.get("/sesijagrupa/", response_model=None, tags=["SesijaGrupa"])
def get_all_sesijagrupa(detailed: bool = False, database: Session = Depends(get_db)) -> list:
    from sqlalchemy.orm import joinedload

    # Use detailed=true to get entities with eagerly loaded relationships (for tables with lookup columns)
    if detailed:
        # Eagerly load all relationships to avoid N+1 queries
        query = database.query(SesijaGrupa)
        query = query.options(joinedload(SesijaGrupa.grupa))
        query = query.options(joinedload(SesijaGrupa.sesija_1))
        sesijagrupa_list = query.all()

        # Serialize with relationships included
        result = []
        for sesijagrupa_item in sesijagrupa_list:
            item_dict = sesijagrupa_item.__dict__.copy()
            item_dict.pop('_sa_instance_state', None)

            # Add many-to-one relationships (foreign keys for lookup columns)
            if sesijagrupa_item.grupa:
                related_obj = sesijagrupa_item.grupa
                related_dict = related_obj.__dict__.copy()
                related_dict.pop('_sa_instance_state', None)
                item_dict['grupa'] = related_dict
            else:
                item_dict['grupa'] = None
            if sesijagrupa_item.sesija_1:
                related_obj = sesijagrupa_item.sesija_1
                related_dict = related_obj.__dict__.copy()
                related_dict.pop('_sa_instance_state', None)
                item_dict['sesija_1'] = related_dict
            else:
                item_dict['sesija_1'] = None


            result.append(item_dict)
        return result
    else:
        # Default: return flat entities (faster for charts/widgets without lookup columns)
        return database.query(SesijaGrupa).all()


@app.get("/sesijagrupa/count/", response_model=None, tags=["SesijaGrupa"])
def get_count_sesijagrupa(database: Session = Depends(get_db)) -> dict:
    """Get the total count of SesijaGrupa entities"""
    count = database.query(SesijaGrupa).count()
    return {"count": count}


@app.get("/sesijagrupa/paginated/", response_model=None, tags=["SesijaGrupa"])
def get_paginated_sesijagrupa(skip: int = 0, limit: int = 100, detailed: bool = False, database: Session = Depends(get_db)) -> dict:
    """Get paginated list of SesijaGrupa entities"""
    total = database.query(SesijaGrupa).count()
    sesijagrupa_list = database.query(SesijaGrupa).offset(skip).limit(limit).all()
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": sesijagrupa_list
    }


@app.get("/sesijagrupa/search/", response_model=None, tags=["SesijaGrupa"])
def search_sesijagrupa(
    database: Session = Depends(get_db)
) -> list:
    """Search SesijaGrupa entities by attributes"""
    query = database.query(SesijaGrupa)


    results = query.all()
    return results


@app.get("/sesijagrupa/{sesijagrupa_id}/", response_model=None, tags=["SesijaGrupa"])
async def get_sesijagrupa(sesijagrupa_id: int, database: Session = Depends(get_db)) -> SesijaGrupa:
    db_sesijagrupa = database.query(SesijaGrupa).filter(SesijaGrupa.id == sesijagrupa_id).first()
    if db_sesijagrupa is None:
        raise HTTPException(status_code=404, detail="SesijaGrupa not found")

    response_data = {
        "sesijagrupa": db_sesijagrupa,
}
    return response_data



@app.post("/sesijagrupa/", response_model=None, tags=["SesijaGrupa"])
async def create_sesijagrupa(sesijagrupa_data: SesijaGrupaCreate, database: Session = Depends(get_db)) -> SesijaGrupa:

    if sesijagrupa_data.grupa is not None:
        db_grupa = database.query(Grupa).filter(Grupa.id == sesijagrupa_data.grupa).first()
        if not db_grupa:
            raise HTTPException(status_code=400, detail="Grupa not found")
    else:
        raise HTTPException(status_code=400, detail="Grupa ID is required")
    if sesijagrupa_data.sesija_1 is not None:
        db_sesija_1 = database.query(Sesija).filter(Sesija.id == sesijagrupa_data.sesija_1).first()
        if not db_sesija_1:
            raise HTTPException(status_code=400, detail="Sesija not found")
    else:
        raise HTTPException(status_code=400, detail="Sesija ID is required")

    db_sesijagrupa = SesijaGrupa(
        id=sesijagrupa_data.id,        grupa_id=sesijagrupa_data.grupa,        sesija_1_id=sesijagrupa_data.sesija_1        )

    database.add(db_sesijagrupa)
    database.commit()
    database.refresh(db_sesijagrupa)




    return db_sesijagrupa


@app.post("/sesijagrupa/bulk/", response_model=None, tags=["SesijaGrupa"])
async def bulk_create_sesijagrupa(items: list[SesijaGrupaCreate], database: Session = Depends(get_db)) -> dict:
    """Create multiple SesijaGrupa entities at once"""
    created_items = []
    errors = []

    for idx, item_data in enumerate(items):
        try:
            # Basic validation for each item
            if not item_data.grupa:
                raise ValueError("Grupa ID is required")
            if not item_data.sesija_1:
                raise ValueError("Sesija ID is required")

            db_sesijagrupa = SesijaGrupa(
                id=item_data.id,                grupa_id=item_data.grupa,                sesija_1_id=item_data.sesija_1            )
            database.add(db_sesijagrupa)
            database.flush()  # Get ID without committing
            created_items.append(db_sesijagrupa.id)
        except Exception as e:
            errors.append({"index": idx, "error": str(e)})

    if errors:
        database.rollback()
        raise HTTPException(status_code=400, detail={"message": "Bulk creation failed", "errors": errors})

    database.commit()
    return {
        "created_count": len(created_items),
        "created_ids": created_items,
        "message": f"Successfully created {len(created_items)} SesijaGrupa entities"
    }


@app.delete("/sesijagrupa/bulk/", response_model=None, tags=["SesijaGrupa"])
async def bulk_delete_sesijagrupa(ids: list[int], database: Session = Depends(get_db)) -> dict:
    """Delete multiple SesijaGrupa entities at once"""
    deleted_count = 0
    not_found = []

    for item_id in ids:
        db_sesijagrupa = database.query(SesijaGrupa).filter(SesijaGrupa.id == item_id).first()
        if db_sesijagrupa:
            database.delete(db_sesijagrupa)
            deleted_count += 1
        else:
            not_found.append(item_id)

    database.commit()

    return {
        "deleted_count": deleted_count,
        "not_found": not_found,
        "message": f"Successfully deleted {deleted_count} SesijaGrupa entities"
    }

@app.put("/sesijagrupa/{sesijagrupa_id}/", response_model=None, tags=["SesijaGrupa"])
async def update_sesijagrupa(sesijagrupa_id: int, sesijagrupa_data: SesijaGrupaCreate, database: Session = Depends(get_db)) -> SesijaGrupa:
    db_sesijagrupa = database.query(SesijaGrupa).filter(SesijaGrupa.id == sesijagrupa_id).first()
    if db_sesijagrupa is None:
        raise HTTPException(status_code=404, detail="SesijaGrupa not found")

    setattr(db_sesijagrupa, 'id', sesijagrupa_data.id)
    if sesijagrupa_data.grupa is not None:
        db_grupa = database.query(Grupa).filter(Grupa.id == sesijagrupa_data.grupa).first()
        if not db_grupa:
            raise HTTPException(status_code=400, detail="Grupa not found")
        setattr(db_sesijagrupa, 'grupa_id', sesijagrupa_data.grupa)
    if sesijagrupa_data.sesija_1 is not None:
        db_sesija_1 = database.query(Sesija).filter(Sesija.id == sesijagrupa_data.sesija_1).first()
        if not db_sesija_1:
            raise HTTPException(status_code=400, detail="Sesija not found")
        setattr(db_sesijagrupa, 'sesija_1_id', sesijagrupa_data.sesija_1)
    database.commit()
    database.refresh(db_sesijagrupa)

    return db_sesijagrupa


@app.delete("/sesijagrupa/{sesijagrupa_id}/", response_model=None, tags=["SesijaGrupa"])
async def delete_sesijagrupa(sesijagrupa_id: int, database: Session = Depends(get_db)):
    db_sesijagrupa = database.query(SesijaGrupa).filter(SesijaGrupa.id == sesijagrupa_id).first()
    if db_sesijagrupa is None:
        raise HTTPException(status_code=404, detail="SesijaGrupa not found")
    database.delete(db_sesijagrupa)
    database.commit()
    return db_sesijagrupa





############################################
#
#   SesijaKlijent functions
#
############################################

@app.get("/sesijaklijent/", response_model=None, tags=["SesijaKlijent"])
def get_all_sesijaklijent(detailed: bool = False, database: Session = Depends(get_db)) -> list:
    from sqlalchemy.orm import joinedload

    # Use detailed=true to get entities with eagerly loaded relationships (for tables with lookup columns)
    if detailed:
        # Eagerly load all relationships to avoid N+1 queries
        query = database.query(SesijaKlijent)
        query = query.options(joinedload(SesijaKlijent.sesija))
        query = query.options(joinedload(SesijaKlijent.klijent))
        sesijaklijent_list = query.all()

        # Serialize with relationships included
        result = []
        for sesijaklijent_item in sesijaklijent_list:
            item_dict = sesijaklijent_item.__dict__.copy()
            item_dict.pop('_sa_instance_state', None)

            # Add many-to-one relationships (foreign keys for lookup columns)
            if sesijaklijent_item.sesija:
                related_obj = sesijaklijent_item.sesija
                related_dict = related_obj.__dict__.copy()
                related_dict.pop('_sa_instance_state', None)
                item_dict['sesija'] = related_dict
            else:
                item_dict['sesija'] = None
            if sesijaklijent_item.klijent:
                related_obj = sesijaklijent_item.klijent
                related_dict = related_obj.__dict__.copy()
                related_dict.pop('_sa_instance_state', None)
                item_dict['klijent'] = related_dict
            else:
                item_dict['klijent'] = None


            result.append(item_dict)
        return result
    else:
        # Default: return flat entities (faster for charts/widgets without lookup columns)
        return database.query(SesijaKlijent).all()


@app.get("/sesijaklijent/count/", response_model=None, tags=["SesijaKlijent"])
def get_count_sesijaklijent(database: Session = Depends(get_db)) -> dict:
    """Get the total count of SesijaKlijent entities"""
    count = database.query(SesijaKlijent).count()
    return {"count": count}


@app.get("/sesijaklijent/paginated/", response_model=None, tags=["SesijaKlijent"])
def get_paginated_sesijaklijent(skip: int = 0, limit: int = 100, detailed: bool = False, database: Session = Depends(get_db)) -> dict:
    """Get paginated list of SesijaKlijent entities"""
    total = database.query(SesijaKlijent).count()
    sesijaklijent_list = database.query(SesijaKlijent).offset(skip).limit(limit).all()
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": sesijaklijent_list
    }


@app.get("/sesijaklijent/search/", response_model=None, tags=["SesijaKlijent"])
def search_sesijaklijent(
    database: Session = Depends(get_db)
) -> list:
    """Search SesijaKlijent entities by attributes"""
    query = database.query(SesijaKlijent)


    results = query.all()
    return results


@app.get("/sesijaklijent/{sesijaklijent_id}/", response_model=None, tags=["SesijaKlijent"])
async def get_sesijaklijent(sesijaklijent_id: int, database: Session = Depends(get_db)) -> SesijaKlijent:
    db_sesijaklijent = database.query(SesijaKlijent).filter(SesijaKlijent.id == sesijaklijent_id).first()
    if db_sesijaklijent is None:
        raise HTTPException(status_code=404, detail="SesijaKlijent not found")

    response_data = {
        "sesijaklijent": db_sesijaklijent,
}
    return response_data



@app.post("/sesijaklijent/", response_model=None, tags=["SesijaKlijent"])
async def create_sesijaklijent(sesijaklijent_data: SesijaKlijentCreate, database: Session = Depends(get_db)) -> SesijaKlijent:

    if sesijaklijent_data.sesija is not None:
        db_sesija = database.query(Sesija).filter(Sesija.id == sesijaklijent_data.sesija).first()
        if not db_sesija:
            raise HTTPException(status_code=400, detail="Sesija not found")
    else:
        raise HTTPException(status_code=400, detail="Sesija ID is required")
    if sesijaklijent_data.klijent is not None:
        db_klijent = database.query(Klijent).filter(Klijent.id == sesijaklijent_data.klijent).first()
        if not db_klijent:
            raise HTTPException(status_code=400, detail="Klijent not found")
    else:
        raise HTTPException(status_code=400, detail="Klijent ID is required")

    db_sesijaklijent = SesijaKlijent(
        id=sesijaklijent_data.id,        sesija_id=sesijaklijent_data.sesija,        klijent_id=sesijaklijent_data.klijent        )

    database.add(db_sesijaklijent)
    database.commit()
    database.refresh(db_sesijaklijent)




    return db_sesijaklijent


@app.post("/sesijaklijent/bulk/", response_model=None, tags=["SesijaKlijent"])
async def bulk_create_sesijaklijent(items: list[SesijaKlijentCreate], database: Session = Depends(get_db)) -> dict:
    """Create multiple SesijaKlijent entities at once"""
    created_items = []
    errors = []

    for idx, item_data in enumerate(items):
        try:
            # Basic validation for each item
            if not item_data.sesija:
                raise ValueError("Sesija ID is required")
            if not item_data.klijent:
                raise ValueError("Klijent ID is required")

            db_sesijaklijent = SesijaKlijent(
                id=item_data.id,                sesija_id=item_data.sesija,                klijent_id=item_data.klijent            )
            database.add(db_sesijaklijent)
            database.flush()  # Get ID without committing
            created_items.append(db_sesijaklijent.id)
        except Exception as e:
            errors.append({"index": idx, "error": str(e)})

    if errors:
        database.rollback()
        raise HTTPException(status_code=400, detail={"message": "Bulk creation failed", "errors": errors})

    database.commit()
    return {
        "created_count": len(created_items),
        "created_ids": created_items,
        "message": f"Successfully created {len(created_items)} SesijaKlijent entities"
    }


@app.delete("/sesijaklijent/bulk/", response_model=None, tags=["SesijaKlijent"])
async def bulk_delete_sesijaklijent(ids: list[int], database: Session = Depends(get_db)) -> dict:
    """Delete multiple SesijaKlijent entities at once"""
    deleted_count = 0
    not_found = []

    for item_id in ids:
        db_sesijaklijent = database.query(SesijaKlijent).filter(SesijaKlijent.id == item_id).first()
        if db_sesijaklijent:
            database.delete(db_sesijaklijent)
            deleted_count += 1
        else:
            not_found.append(item_id)

    database.commit()

    return {
        "deleted_count": deleted_count,
        "not_found": not_found,
        "message": f"Successfully deleted {deleted_count} SesijaKlijent entities"
    }

@app.put("/sesijaklijent/{sesijaklijent_id}/", response_model=None, tags=["SesijaKlijent"])
async def update_sesijaklijent(sesijaklijent_id: int, sesijaklijent_data: SesijaKlijentCreate, database: Session = Depends(get_db)) -> SesijaKlijent:
    db_sesijaklijent = database.query(SesijaKlijent).filter(SesijaKlijent.id == sesijaklijent_id).first()
    if db_sesijaklijent is None:
        raise HTTPException(status_code=404, detail="SesijaKlijent not found")

    setattr(db_sesijaklijent, 'id', sesijaklijent_data.id)
    if sesijaklijent_data.sesija is not None:
        db_sesija = database.query(Sesija).filter(Sesija.id == sesijaklijent_data.sesija).first()
        if not db_sesija:
            raise HTTPException(status_code=400, detail="Sesija not found")
        setattr(db_sesijaklijent, 'sesija_id', sesijaklijent_data.sesija)
    if sesijaklijent_data.klijent is not None:
        db_klijent = database.query(Klijent).filter(Klijent.id == sesijaklijent_data.klijent).first()
        if not db_klijent:
            raise HTTPException(status_code=400, detail="Klijent not found")
        setattr(db_sesijaklijent, 'klijent_id', sesijaklijent_data.klijent)
    database.commit()
    database.refresh(db_sesijaklijent)

    return db_sesijaklijent


@app.delete("/sesijaklijent/{sesijaklijent_id}/", response_model=None, tags=["SesijaKlijent"])
async def delete_sesijaklijent(sesijaklijent_id: int, database: Session = Depends(get_db)):
    db_sesijaklijent = database.query(SesijaKlijent).filter(SesijaKlijent.id == sesijaklijent_id).first()
    if db_sesijaklijent is None:
        raise HTTPException(status_code=404, detail="SesijaKlijent not found")
    database.delete(db_sesijaklijent)
    database.commit()
    return db_sesijaklijent





############################################
#
#   Sesija functions
#
############################################

@app.get("/sesija/", response_model=None, tags=["Sesija"])
def get_all_sesija(detailed: bool = False, database: Session = Depends(get_db)) -> list:
    from sqlalchemy.orm import joinedload

    # Use detailed=true to get entities with eagerly loaded relationships (for tables with lookup columns)
    if detailed:
        # Eagerly load all relationships to avoid N+1 queries
        query = database.query(Sesija)
        sesija_list = query.all()

        # Serialize with relationships included
        result = []
        for sesija_item in sesija_list:
            item_dict = sesija_item.__dict__.copy()
            item_dict.pop('_sa_instance_state', None)

            # Add many-to-one relationships (foreign keys for lookup columns)

            # Add many-to-many and one-to-many relationship objects (full details)
            sesijaklijent_list = database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == sesija_item.id).all()
            item_dict['sesijaklijent_1'] = []
            for sesijaklijent_obj in sesijaklijent_list:
                sesijaklijent_dict = sesijaklijent_obj.__dict__.copy()
                sesijaklijent_dict.pop('_sa_instance_state', None)
                item_dict['sesijaklijent_1'].append(sesijaklijent_dict)
            cena_list = database.query(Cena).filter(Cena.sesija_2_id == sesija_item.id).all()
            item_dict['cena'] = []
            for cena_obj in cena_list:
                cena_dict = cena_obj.__dict__.copy()
                cena_dict.pop('_sa_instance_state', None)
                item_dict['cena'].append(cena_dict)
            sesijagrupa_list = database.query(SesijaGrupa).filter(SesijaGrupa.sesija_1_id == sesija_item.id).all()
            item_dict['sesijagrupa_1'] = []
            for sesijagrupa_obj in sesijagrupa_list:
                sesijagrupa_dict = sesijagrupa_obj.__dict__.copy()
                sesijagrupa_dict.pop('_sa_instance_state', None)
                item_dict['sesijagrupa_1'].append(sesijagrupa_dict)

            result.append(item_dict)
        return result
    else:
        # Default: return flat entities (faster for charts/widgets without lookup columns)
        return database.query(Sesija).all()


@app.get("/sesija/count/", response_model=None, tags=["Sesija"])
def get_count_sesija(database: Session = Depends(get_db)) -> dict:
    """Get the total count of Sesija entities"""
    count = database.query(Sesija).count()
    return {"count": count}


@app.get("/sesija/paginated/", response_model=None, tags=["Sesija"])
def get_paginated_sesija(skip: int = 0, limit: int = 100, detailed: bool = False, database: Session = Depends(get_db)) -> dict:
    """Get paginated list of Sesija entities"""
    total = database.query(Sesija).count()
    sesija_list = database.query(Sesija).offset(skip).limit(limit).all()
    # By default, return flat entities (for charts/widgets)
    # Use detailed=true to get entities with relationships
    if not detailed:
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "data": sesija_list
        }

    result = []
    for sesija_item in sesija_list:
        sesijaklijent_1_ids = database.query(SesijaKlijent.id).filter(SesijaKlijent.sesija_id == sesija_item.id).all()
        cena_ids = database.query(Cena.id).filter(Cena.sesija_2_id == sesija_item.id).all()
        sesijagrupa_1_ids = database.query(SesijaGrupa.id).filter(SesijaGrupa.sesija_1_id == sesija_item.id).all()
        item_data = {
            "sesija": sesija_item,
            "sesijaklijent_1_ids": [x[0] for x in sesijaklijent_1_ids],            "cena_ids": [x[0] for x in cena_ids],            "sesijagrupa_1_ids": [x[0] for x in sesijagrupa_1_ids]        }
        result.append(item_data)
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": result
    }


@app.get("/sesija/search/", response_model=None, tags=["Sesija"])
def search_sesija(
    database: Session = Depends(get_db)
) -> list:
    """Search Sesija entities by attributes"""
    query = database.query(Sesija)


    results = query.all()
    return results


@app.get("/sesija/{sesija_id}/", response_model=None, tags=["Sesija"])
async def get_sesija(sesija_id: int, database: Session = Depends(get_db)) -> Sesija:
    db_sesija = database.query(Sesija).filter(Sesija.id == sesija_id).first()
    if db_sesija is None:
        raise HTTPException(status_code=404, detail="Sesija not found")

    sesijaklijent_1_ids = database.query(SesijaKlijent.id).filter(SesijaKlijent.sesija_id == db_sesija.id).all()
    cena_ids = database.query(Cena.id).filter(Cena.sesija_2_id == db_sesija.id).all()
    sesijagrupa_1_ids = database.query(SesijaGrupa.id).filter(SesijaGrupa.sesija_1_id == db_sesija.id).all()
    response_data = {
        "sesija": db_sesija,
        "sesijaklijent_1_ids": [x[0] for x in sesijaklijent_1_ids],        "cena_ids": [x[0] for x in cena_ids],        "sesijagrupa_1_ids": [x[0] for x in sesijagrupa_1_ids]}
    return response_data



@app.post("/sesija/", response_model=None, tags=["Sesija"])
async def create_sesija(sesija_data: SesijaCreate, database: Session = Depends(get_db)) -> Sesija:


    db_sesija = Sesija(
        id=sesija_data.id,        pocetak=sesija_data.pocetak,        cena=sesija_data.cena,        status=sesija_data.status,        kraj=sesija_data.kraj        )

    database.add(db_sesija)
    database.commit()
    database.refresh(db_sesija)

    if sesija_data.sesijaklijent_1:
        # Validate that all SesijaKlijent IDs exist
        for sesijaklijent_id in sesija_data.sesijaklijent_1:
            db_sesijaklijent = database.query(SesijaKlijent).filter(SesijaKlijent.id == sesijaklijent_id).first()
            if not db_sesijaklijent:
                raise HTTPException(status_code=400, detail=f"SesijaKlijent with id {sesijaklijent_id} not found")

        # Update the related entities with the new foreign key
        database.query(SesijaKlijent).filter(SesijaKlijent.id.in_(sesija_data.sesijaklijent_1)).update(
            {SesijaKlijent.sesija_id: db_sesija.id}, synchronize_session=False
        )
        database.commit()
    if sesija_data.cena:
        # Validate that all Cena IDs exist
        for cena_id in sesija_data.cena:
            db_cena = database.query(Cena).filter(Cena.id == cena_id).first()
            if not db_cena:
                raise HTTPException(status_code=400, detail=f"Cena with id {cena_id} not found")

        # Update the related entities with the new foreign key
        database.query(Cena).filter(Cena.id.in_(sesija_data.cena)).update(
            {Cena.sesija_2_id: db_sesija.id}, synchronize_session=False
        )
        database.commit()
    if sesija_data.sesijagrupa_1:
        # Validate that all SesijaGrupa IDs exist
        for sesijagrupa_id in sesija_data.sesijagrupa_1:
            db_sesijagrupa = database.query(SesijaGrupa).filter(SesijaGrupa.id == sesijagrupa_id).first()
            if not db_sesijagrupa:
                raise HTTPException(status_code=400, detail=f"SesijaGrupa with id {sesijagrupa_id} not found")

        # Update the related entities with the new foreign key
        database.query(SesijaGrupa).filter(SesijaGrupa.id.in_(sesija_data.sesijagrupa_1)).update(
            {SesijaGrupa.sesija_1_id: db_sesija.id}, synchronize_session=False
        )
        database.commit()



    sesijaklijent_1_ids = database.query(SesijaKlijent.id).filter(SesijaKlijent.sesija_id == db_sesija.id).all()
    cena_ids = database.query(Cena.id).filter(Cena.sesija_2_id == db_sesija.id).all()
    sesijagrupa_1_ids = database.query(SesijaGrupa.id).filter(SesijaGrupa.sesija_1_id == db_sesija.id).all()
    response_data = {
        "sesija": db_sesija,
        "sesijaklijent_1_ids": [x[0] for x in sesijaklijent_1_ids],        "cena_ids": [x[0] for x in cena_ids],        "sesijagrupa_1_ids": [x[0] for x in sesijagrupa_1_ids]    }
    return response_data


@app.post("/sesija/bulk/", response_model=None, tags=["Sesija"])
async def bulk_create_sesija(items: list[SesijaCreate], database: Session = Depends(get_db)) -> dict:
    """Create multiple Sesija entities at once"""
    created_items = []
    errors = []

    for idx, item_data in enumerate(items):
        try:
            # Basic validation for each item

            db_sesija = Sesija(
                id=item_data.id,                pocetak=item_data.pocetak,                cena=item_data.cena,                status=item_data.status,                kraj=item_data.kraj            )
            database.add(db_sesija)
            database.flush()  # Get ID without committing
            created_items.append(db_sesija.id)
        except Exception as e:
            errors.append({"index": idx, "error": str(e)})

    if errors:
        database.rollback()
        raise HTTPException(status_code=400, detail={"message": "Bulk creation failed", "errors": errors})

    database.commit()
    return {
        "created_count": len(created_items),
        "created_ids": created_items,
        "message": f"Successfully created {len(created_items)} Sesija entities"
    }


@app.delete("/sesija/bulk/", response_model=None, tags=["Sesija"])
async def bulk_delete_sesija(ids: list[int], database: Session = Depends(get_db)) -> dict:
    """Delete multiple Sesija entities at once"""
    deleted_count = 0
    not_found = []

    for item_id in ids:
        db_sesija = database.query(Sesija).filter(Sesija.id == item_id).first()
        if db_sesija:
            database.delete(db_sesija)
            deleted_count += 1
        else:
            not_found.append(item_id)

    database.commit()

    return {
        "deleted_count": deleted_count,
        "not_found": not_found,
        "message": f"Successfully deleted {deleted_count} Sesija entities"
    }

@app.put("/sesija/{sesija_id}/", response_model=None, tags=["Sesija"])
async def update_sesija(sesija_id: int, sesija_data: SesijaCreate, database: Session = Depends(get_db)) -> Sesija:
    db_sesija = database.query(Sesija).filter(Sesija.id == sesija_id).first()
    if db_sesija is None:
        raise HTTPException(status_code=404, detail="Sesija not found")

    setattr(db_sesija, 'id', sesija_data.id)
    setattr(db_sesija, 'pocetak', sesija_data.pocetak)
    setattr(db_sesija, 'cena', sesija_data.cena)
    setattr(db_sesija, 'status', sesija_data.status)
    setattr(db_sesija, 'kraj', sesija_data.kraj)
    if sesija_data.sesijaklijent_1 is not None:
        # Clear all existing relationships (set foreign key to NULL)
        database.query(SesijaKlijent).filter(SesijaKlijent.sesija_id == db_sesija.id).update(
            {SesijaKlijent.sesija_id: None}, synchronize_session=False
        )

        # Set new relationships if list is not empty
        if sesija_data.sesijaklijent_1:
            # Validate that all IDs exist
            for sesijaklijent_id in sesija_data.sesijaklijent_1:
                db_sesijaklijent = database.query(SesijaKlijent).filter(SesijaKlijent.id == sesijaklijent_id).first()
                if not db_sesijaklijent:
                    raise HTTPException(status_code=400, detail=f"SesijaKlijent with id {sesijaklijent_id} not found")

            # Update the related entities with the new foreign key
            database.query(SesijaKlijent).filter(SesijaKlijent.id.in_(sesija_data.sesijaklijent_1)).update(
                {SesijaKlijent.sesija_id: db_sesija.id}, synchronize_session=False
            )
    if sesija_data.cena is not None:
        # Clear all existing relationships (set foreign key to NULL)
        database.query(Cena).filter(Cena.sesija_2_id == db_sesija.id).update(
            {Cena.sesija_2_id: None}, synchronize_session=False
        )

        # Set new relationships if list is not empty
        if sesija_data.cena:
            # Validate that all IDs exist
            for cena_id in sesija_data.cena:
                db_cena = database.query(Cena).filter(Cena.id == cena_id).first()
                if not db_cena:
                    raise HTTPException(status_code=400, detail=f"Cena with id {cena_id} not found")

            # Update the related entities with the new foreign key
            database.query(Cena).filter(Cena.id.in_(sesija_data.cena)).update(
                {Cena.sesija_2_id: db_sesija.id}, synchronize_session=False
            )
    if sesija_data.sesijagrupa_1 is not None:
        # Clear all existing relationships (set foreign key to NULL)
        database.query(SesijaGrupa).filter(SesijaGrupa.sesija_1_id == db_sesija.id).update(
            {SesijaGrupa.sesija_1_id: None}, synchronize_session=False
        )

        # Set new relationships if list is not empty
        if sesija_data.sesijagrupa_1:
            # Validate that all IDs exist
            for sesijagrupa_id in sesija_data.sesijagrupa_1:
                db_sesijagrupa = database.query(SesijaGrupa).filter(SesijaGrupa.id == sesijagrupa_id).first()
                if not db_sesijagrupa:
                    raise HTTPException(status_code=400, detail=f"SesijaGrupa with id {sesijagrupa_id} not found")

            # Update the related entities with the new foreign key
            database.query(SesijaGrupa).filter(SesijaGrupa.id.in_(sesija_data.sesijagrupa_1)).update(
                {SesijaGrupa.sesija_1_id: db_sesija.id}, synchronize_session=False
            )
    database.commit()
    database.refresh(db_sesija)

    sesijaklijent_1_ids = database.query(SesijaKlijent.id).filter(SesijaKlijent.sesija_id == db_sesija.id).all()
    cena_ids = database.query(Cena.id).filter(Cena.sesija_2_id == db_sesija.id).all()
    sesijagrupa_1_ids = database.query(SesijaGrupa.id).filter(SesijaGrupa.sesija_1_id == db_sesija.id).all()
    response_data = {
        "sesija": db_sesija,
        "sesijaklijent_1_ids": [x[0] for x in sesijaklijent_1_ids],        "cena_ids": [x[0] for x in cena_ids],        "sesijagrupa_1_ids": [x[0] for x in sesijagrupa_1_ids]    }
    return response_data


@app.delete("/sesija/{sesija_id}/", response_model=None, tags=["Sesija"])
async def delete_sesija(sesija_id: int, database: Session = Depends(get_db)):
    db_sesija = database.query(Sesija).filter(Sesija.id == sesija_id).first()
    if db_sesija is None:
        raise HTTPException(status_code=404, detail="Sesija not found")
    database.delete(db_sesija)
    database.commit()
    return db_sesija





############################################
#
#   Grupa functions
#
############################################

@app.get("/grupa/", response_model=None, tags=["Grupa"])
def get_all_grupa(detailed: bool = False, database: Session = Depends(get_db)) -> list:
    from sqlalchemy.orm import joinedload

    # Use detailed=true to get entities with eagerly loaded relationships (for tables with lookup columns)
    if detailed:
        # Eagerly load all relationships to avoid N+1 queries
        query = database.query(Grupa)
        grupa_list = query.all()

        # Serialize with relationships included
        result = []
        for grupa_item in grupa_list:
            item_dict = grupa_item.__dict__.copy()
            item_dict.pop('_sa_instance_state', None)

            # Add many-to-one relationships (foreign keys for lookup columns)

            # Add many-to-many and one-to-many relationship objects (full details)
            sesijagrupa_list = database.query(SesijaGrupa).filter(SesijaGrupa.grupa_id == grupa_item.id).all()
            item_dict['sesijagrupa'] = []
            for sesijagrupa_obj in sesijagrupa_list:
                sesijagrupa_dict = sesijagrupa_obj.__dict__.copy()
                sesijagrupa_dict.pop('_sa_instance_state', None)
                item_dict['sesijagrupa'].append(sesijagrupa_dict)

            result.append(item_dict)
        return result
    else:
        # Default: return flat entities (faster for charts/widgets without lookup columns)
        return database.query(Grupa).all()


@app.get("/grupa/count/", response_model=None, tags=["Grupa"])
def get_count_grupa(database: Session = Depends(get_db)) -> dict:
    """Get the total count of Grupa entities"""
    count = database.query(Grupa).count()
    return {"count": count}


@app.get("/grupa/paginated/", response_model=None, tags=["Grupa"])
def get_paginated_grupa(skip: int = 0, limit: int = 100, detailed: bool = False, database: Session = Depends(get_db)) -> dict:
    """Get paginated list of Grupa entities"""
    total = database.query(Grupa).count()
    grupa_list = database.query(Grupa).offset(skip).limit(limit).all()
    # By default, return flat entities (for charts/widgets)
    # Use detailed=true to get entities with relationships
    if not detailed:
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "data": grupa_list
        }

    result = []
    for grupa_item in grupa_list:
        sesijagrupa_ids = database.query(SesijaGrupa.id).filter(SesijaGrupa.grupa_id == grupa_item.id).all()
        item_data = {
            "grupa": grupa_item,
            "sesijagrupa_ids": [x[0] for x in sesijagrupa_ids]        }
        result.append(item_data)
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": result
    }


@app.get("/grupa/search/", response_model=None, tags=["Grupa"])
def search_grupa(
    database: Session = Depends(get_db)
) -> list:
    """Search Grupa entities by attributes"""
    query = database.query(Grupa)


    results = query.all()
    return results


@app.get("/grupa/{grupa_id}/", response_model=None, tags=["Grupa"])
async def get_grupa(grupa_id: int, database: Session = Depends(get_db)) -> Grupa:
    db_grupa = database.query(Grupa).filter(Grupa.id == grupa_id).first()
    if db_grupa is None:
        raise HTTPException(status_code=404, detail="Grupa not found")

    sesijagrupa_ids = database.query(SesijaGrupa.id).filter(SesijaGrupa.grupa_id == db_grupa.id).all()
    response_data = {
        "grupa": db_grupa,
        "sesijagrupa_ids": [x[0] for x in sesijagrupa_ids]}
    return response_data



@app.post("/grupa/", response_model=None, tags=["Grupa"])
async def create_grupa(grupa_data: GrupaCreate, database: Session = Depends(get_db)) -> Grupa:


    db_grupa = Grupa(
        naziv=grupa_data.naziv,        cena=grupa_data.cena,        opis=grupa_data.opis,        id=grupa_data.id        )

    database.add(db_grupa)
    database.commit()
    database.refresh(db_grupa)

    if grupa_data.sesijagrupa:
        # Validate that all SesijaGrupa IDs exist
        for sesijagrupa_id in grupa_data.sesijagrupa:
            db_sesijagrupa = database.query(SesijaGrupa).filter(SesijaGrupa.id == sesijagrupa_id).first()
            if not db_sesijagrupa:
                raise HTTPException(status_code=400, detail=f"SesijaGrupa with id {sesijagrupa_id} not found")

        # Update the related entities with the new foreign key
        database.query(SesijaGrupa).filter(SesijaGrupa.id.in_(grupa_data.sesijagrupa)).update(
            {SesijaGrupa.grupa_id: db_grupa.id}, synchronize_session=False
        )
        database.commit()



    sesijagrupa_ids = database.query(SesijaGrupa.id).filter(SesijaGrupa.grupa_id == db_grupa.id).all()
    response_data = {
        "grupa": db_grupa,
        "sesijagrupa_ids": [x[0] for x in sesijagrupa_ids]    }
    return response_data


@app.post("/grupa/bulk/", response_model=None, tags=["Grupa"])
async def bulk_create_grupa(items: list[GrupaCreate], database: Session = Depends(get_db)) -> dict:
    """Create multiple Grupa entities at once"""
    created_items = []
    errors = []

    for idx, item_data in enumerate(items):
        try:
            # Basic validation for each item

            db_grupa = Grupa(
                naziv=item_data.naziv,                cena=item_data.cena,                opis=item_data.opis,                id=item_data.id            )
            database.add(db_grupa)
            database.flush()  # Get ID without committing
            created_items.append(db_grupa.id)
        except Exception as e:
            errors.append({"index": idx, "error": str(e)})

    if errors:
        database.rollback()
        raise HTTPException(status_code=400, detail={"message": "Bulk creation failed", "errors": errors})

    database.commit()
    return {
        "created_count": len(created_items),
        "created_ids": created_items,
        "message": f"Successfully created {len(created_items)} Grupa entities"
    }


@app.delete("/grupa/bulk/", response_model=None, tags=["Grupa"])
async def bulk_delete_grupa(ids: list[int], database: Session = Depends(get_db)) -> dict:
    """Delete multiple Grupa entities at once"""
    deleted_count = 0
    not_found = []

    for item_id in ids:
        db_grupa = database.query(Grupa).filter(Grupa.id == item_id).first()
        if db_grupa:
            database.delete(db_grupa)
            deleted_count += 1
        else:
            not_found.append(item_id)

    database.commit()

    return {
        "deleted_count": deleted_count,
        "not_found": not_found,
        "message": f"Successfully deleted {deleted_count} Grupa entities"
    }

@app.put("/grupa/{grupa_id}/", response_model=None, tags=["Grupa"])
async def update_grupa(grupa_id: int, grupa_data: GrupaCreate, database: Session = Depends(get_db)) -> Grupa:
    db_grupa = database.query(Grupa).filter(Grupa.id == grupa_id).first()
    if db_grupa is None:
        raise HTTPException(status_code=404, detail="Grupa not found")

    setattr(db_grupa, 'naziv', grupa_data.naziv)
    setattr(db_grupa, 'cena', grupa_data.cena)
    setattr(db_grupa, 'opis', grupa_data.opis)
    setattr(db_grupa, 'id', grupa_data.id)
    if grupa_data.sesijagrupa is not None:
        # Clear all existing relationships (set foreign key to NULL)
        database.query(SesijaGrupa).filter(SesijaGrupa.grupa_id == db_grupa.id).update(
            {SesijaGrupa.grupa_id: None}, synchronize_session=False
        )

        # Set new relationships if list is not empty
        if grupa_data.sesijagrupa:
            # Validate that all IDs exist
            for sesijagrupa_id in grupa_data.sesijagrupa:
                db_sesijagrupa = database.query(SesijaGrupa).filter(SesijaGrupa.id == sesijagrupa_id).first()
                if not db_sesijagrupa:
                    raise HTTPException(status_code=400, detail=f"SesijaGrupa with id {sesijagrupa_id} not found")

            # Update the related entities with the new foreign key
            database.query(SesijaGrupa).filter(SesijaGrupa.id.in_(grupa_data.sesijagrupa)).update(
                {SesijaGrupa.grupa_id: db_grupa.id}, synchronize_session=False
            )
    database.commit()
    database.refresh(db_grupa)

    sesijagrupa_ids = database.query(SesijaGrupa.id).filter(SesijaGrupa.grupa_id == db_grupa.id).all()
    response_data = {
        "grupa": db_grupa,
        "sesijagrupa_ids": [x[0] for x in sesijagrupa_ids]    }
    return response_data


@app.delete("/grupa/{grupa_id}/", response_model=None, tags=["Grupa"])
async def delete_grupa(grupa_id: int, database: Session = Depends(get_db)):
    db_grupa = database.query(Grupa).filter(Grupa.id == grupa_id).first()
    if db_grupa is None:
        raise HTTPException(status_code=404, detail="Grupa not found")
    database.delete(db_grupa)
    database.commit()
    return db_grupa





############################################
#
#   Klijent functions
#
############################################

@app.get("/klijent/", response_model=None, tags=["Klijent"])
def get_all_klijent(detailed: bool = False, database: Session = Depends(get_db)) -> list:
    from sqlalchemy.orm import joinedload

    # Use detailed=true to get entities with eagerly loaded relationships (for tables with lookup columns)
    if detailed:
        # Eagerly load all relationships to avoid N+1 queries
        query = database.query(Klijent)
        klijent_list = query.all()

        # Serialize with relationships included
        result = []
        for klijent_item in klijent_list:
            item_dict = klijent_item.__dict__.copy()
            item_dict.pop('_sa_instance_state', None)

            # Add many-to-one relationships (foreign keys for lookup columns)

            # Add many-to-many and one-to-many relationship objects (full details)
            cena_list = database.query(Cena).filter(Cena.klijent_1_id == klijent_item.id).all()
            item_dict['cena_1'] = []
            for cena_obj in cena_list:
                cena_dict = cena_obj.__dict__.copy()
                cena_dict.pop('_sa_instance_state', None)
                item_dict['cena_1'].append(cena_dict)
            sesijaklijent_list = database.query(SesijaKlijent).filter(SesijaKlijent.klijent_id == klijent_item.id).all()
            item_dict['sesijaklijent'] = []
            for sesijaklijent_obj in sesijaklijent_list:
                sesijaklijent_dict = sesijaklijent_obj.__dict__.copy()
                sesijaklijent_dict.pop('_sa_instance_state', None)
                item_dict['sesijaklijent'].append(sesijaklijent_dict)

            result.append(item_dict)
        return result
    else:
        # Default: return flat entities (faster for charts/widgets without lookup columns)
        return database.query(Klijent).all()


@app.get("/klijent/count/", response_model=None, tags=["Klijent"])
def get_count_klijent(database: Session = Depends(get_db)) -> dict:
    """Get the total count of Klijent entities"""
    count = database.query(Klijent).count()
    return {"count": count}


@app.get("/klijent/paginated/", response_model=None, tags=["Klijent"])
def get_paginated_klijent(skip: int = 0, limit: int = 100, detailed: bool = False, database: Session = Depends(get_db)) -> dict:
    """Get paginated list of Klijent entities"""
    total = database.query(Klijent).count()
    klijent_list = database.query(Klijent).offset(skip).limit(limit).all()
    # By default, return flat entities (for charts/widgets)
    # Use detailed=true to get entities with relationships
    if not detailed:
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "data": klijent_list
        }

    result = []
    for klijent_item in klijent_list:
        cena_1_ids = database.query(Cena.id).filter(Cena.klijent_1_id == klijent_item.id).all()
        sesijaklijent_ids = database.query(SesijaKlijent.id).filter(SesijaKlijent.klijent_id == klijent_item.id).all()
        item_data = {
            "klijent": klijent_item,
            "cena_1_ids": [x[0] for x in cena_1_ids],            "sesijaklijent_ids": [x[0] for x in sesijaklijent_ids]        }
        result.append(item_data)
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": result
    }


@app.get("/klijent/search/", response_model=None, tags=["Klijent"])
def search_klijent(
    database: Session = Depends(get_db)
) -> list:
    """Search Klijent entities by attributes"""
    query = database.query(Klijent)


    results = query.all()
    return results


@app.get("/klijent/{klijent_id}/", response_model=None, tags=["Klijent"])
async def get_klijent(klijent_id: int, database: Session = Depends(get_db)) -> Klijent:
    db_klijent = database.query(Klijent).filter(Klijent.id == klijent_id).first()
    if db_klijent is None:
        raise HTTPException(status_code=404, detail="Klijent not found")

    cena_1_ids = database.query(Cena.id).filter(Cena.klijent_1_id == db_klijent.id).all()
    sesijaklijent_ids = database.query(SesijaKlijent.id).filter(SesijaKlijent.klijent_id == db_klijent.id).all()
    response_data = {
        "klijent": db_klijent,
        "cena_1_ids": [x[0] for x in cena_1_ids],        "sesijaklijent_ids": [x[0] for x in sesijaklijent_ids]}
    return response_data



@app.post("/klijent/", response_model=None, tags=["Klijent"])
async def create_klijent(klijent_data: KlijentCreate, database: Session = Depends(get_db)) -> Klijent:


    db_klijent = Klijent(
        id=klijent_data.id,        ime=klijent_data.ime,        prezime=klijent_data.prezime,        email=klijent_data.email,        broj_telefona=klijent_data.broj_telefona        )

    database.add(db_klijent)
    database.commit()
    database.refresh(db_klijent)

    if klijent_data.cena_1:
        # Validate that all Cena IDs exist
        for cena_id in klijent_data.cena_1:
            db_cena = database.query(Cena).filter(Cena.id == cena_id).first()
            if not db_cena:
                raise HTTPException(status_code=400, detail=f"Cena with id {cena_id} not found")

        # Update the related entities with the new foreign key
        database.query(Cena).filter(Cena.id.in_(klijent_data.cena_1)).update(
            {Cena.klijent_1_id: db_klijent.id}, synchronize_session=False
        )
        database.commit()
    if klijent_data.sesijaklijent:
        # Validate that all SesijaKlijent IDs exist
        for sesijaklijent_id in klijent_data.sesijaklijent:
            db_sesijaklijent = database.query(SesijaKlijent).filter(SesijaKlijent.id == sesijaklijent_id).first()
            if not db_sesijaklijent:
                raise HTTPException(status_code=400, detail=f"SesijaKlijent with id {sesijaklijent_id} not found")

        # Update the related entities with the new foreign key
        database.query(SesijaKlijent).filter(SesijaKlijent.id.in_(klijent_data.sesijaklijent)).update(
            {SesijaKlijent.klijent_id: db_klijent.id}, synchronize_session=False
        )
        database.commit()



    cena_1_ids = database.query(Cena.id).filter(Cena.klijent_1_id == db_klijent.id).all()
    sesijaklijent_ids = database.query(SesijaKlijent.id).filter(SesijaKlijent.klijent_id == db_klijent.id).all()
    response_data = {
        "klijent": db_klijent,
        "cena_1_ids": [x[0] for x in cena_1_ids],        "sesijaklijent_ids": [x[0] for x in sesijaklijent_ids]    }
    return response_data


@app.post("/klijent/bulk/", response_model=None, tags=["Klijent"])
async def bulk_create_klijent(items: list[KlijentCreate], database: Session = Depends(get_db)) -> dict:
    """Create multiple Klijent entities at once"""
    created_items = []
    errors = []

    for idx, item_data in enumerate(items):
        try:
            # Basic validation for each item

            db_klijent = Klijent(
                id=item_data.id,                ime=item_data.ime,                prezime=item_data.prezime,                email=item_data.email,                broj_telefona=item_data.broj_telefona            )
            database.add(db_klijent)
            database.flush()  # Get ID without committing
            created_items.append(db_klijent.id)
        except Exception as e:
            errors.append({"index": idx, "error": str(e)})

    if errors:
        database.rollback()
        raise HTTPException(status_code=400, detail={"message": "Bulk creation failed", "errors": errors})

    database.commit()
    return {
        "created_count": len(created_items),
        "created_ids": created_items,
        "message": f"Successfully created {len(created_items)} Klijent entities"
    }


@app.delete("/klijent/bulk/", response_model=None, tags=["Klijent"])
async def bulk_delete_klijent(ids: list[int], database: Session = Depends(get_db)) -> dict:
    """Delete multiple Klijent entities at once"""
    deleted_count = 0
    not_found = []

    for item_id in ids:
        db_klijent = database.query(Klijent).filter(Klijent.id == item_id).first()
        if db_klijent:
            database.delete(db_klijent)
            deleted_count += 1
        else:
            not_found.append(item_id)

    database.commit()

    return {
        "deleted_count": deleted_count,
        "not_found": not_found,
        "message": f"Successfully deleted {deleted_count} Klijent entities"
    }

@app.put("/klijent/{klijent_id}/", response_model=None, tags=["Klijent"])
async def update_klijent(klijent_id: int, klijent_data: KlijentCreate, database: Session = Depends(get_db)) -> Klijent:
    db_klijent = database.query(Klijent).filter(Klijent.id == klijent_id).first()
    if db_klijent is None:
        raise HTTPException(status_code=404, detail="Klijent not found")

    setattr(db_klijent, 'id', klijent_data.id)
    setattr(db_klijent, 'ime', klijent_data.ime)
    setattr(db_klijent, 'prezime', klijent_data.prezime)
    setattr(db_klijent, 'email', klijent_data.email)
    setattr(db_klijent, 'broj_telefona', klijent_data.broj_telefona)
    if klijent_data.cena_1 is not None:
        # Clear all existing relationships (set foreign key to NULL)
        database.query(Cena).filter(Cena.klijent_1_id == db_klijent.id).update(
            {Cena.klijent_1_id: None}, synchronize_session=False
        )

        # Set new relationships if list is not empty
        if klijent_data.cena_1:
            # Validate that all IDs exist
            for cena_id in klijent_data.cena_1:
                db_cena = database.query(Cena).filter(Cena.id == cena_id).first()
                if not db_cena:
                    raise HTTPException(status_code=400, detail=f"Cena with id {cena_id} not found")

            # Update the related entities with the new foreign key
            database.query(Cena).filter(Cena.id.in_(klijent_data.cena_1)).update(
                {Cena.klijent_1_id: db_klijent.id}, synchronize_session=False
            )
    if klijent_data.sesijaklijent is not None:
        # Clear all existing relationships (set foreign key to NULL)
        database.query(SesijaKlijent).filter(SesijaKlijent.klijent_id == db_klijent.id).update(
            {SesijaKlijent.klijent_id: None}, synchronize_session=False
        )

        # Set new relationships if list is not empty
        if klijent_data.sesijaklijent:
            # Validate that all IDs exist
            for sesijaklijent_id in klijent_data.sesijaklijent:
                db_sesijaklijent = database.query(SesijaKlijent).filter(SesijaKlijent.id == sesijaklijent_id).first()
                if not db_sesijaklijent:
                    raise HTTPException(status_code=400, detail=f"SesijaKlijent with id {sesijaklijent_id} not found")

            # Update the related entities with the new foreign key
            database.query(SesijaKlijent).filter(SesijaKlijent.id.in_(klijent_data.sesijaklijent)).update(
                {SesijaKlijent.klijent_id: db_klijent.id}, synchronize_session=False
            )
    database.commit()
    database.refresh(db_klijent)

    cena_1_ids = database.query(Cena.id).filter(Cena.klijent_1_id == db_klijent.id).all()
    sesijaklijent_ids = database.query(SesijaKlijent.id).filter(SesijaKlijent.klijent_id == db_klijent.id).all()
    response_data = {
        "klijent": db_klijent,
        "cena_1_ids": [x[0] for x in cena_1_ids],        "sesijaklijent_ids": [x[0] for x in sesijaklijent_ids]    }
    return response_data


@app.delete("/klijent/{klijent_id}/", response_model=None, tags=["Klijent"])
async def delete_klijent(klijent_id: int, database: Session = Depends(get_db)):
    db_klijent = database.query(Klijent).filter(Klijent.id == klijent_id).first()
    if db_klijent is None:
        raise HTTPException(status_code=404, detail="Klijent not found")
    database.delete(db_klijent)
    database.commit()
    return db_klijent







############################################
# Maintaining the server
############################################
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)



