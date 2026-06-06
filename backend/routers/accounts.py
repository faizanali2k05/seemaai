"""Accounts router — client accounts, transactions, and reconciliations."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.client_accounts import ClientAccount, Transaction, Reconciliation

router = APIRouter()

# Pydantic schemas
class ClientAccountCreate(BaseModel):
    account_name: str
    account_type: str  # client, office, controlled, segregated
    bank_name: str
    account_number: str
    sort_code: str

class TransactionCreate(BaseModel):
    account_id: str
    date: datetime
    description: str
    amount: Decimal
    type: str  # debit, credit, transfer
    matter_ref: str | None = None

class ReconciliationCreate(BaseModel):
    period: str  # monthly, quarterly, annual
    discrepancies: str | None = None

class ReconciliationSignoff(BaseModel):
    pass

class ClientAccountResponse(BaseModel):
    id: str
    firm_id: str
    account_name: str
    account_type: str
    balance: Decimal
    status: str
    bank_name: str
    account_number: str
    sort_code: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

@router.get("/compliance/accounts/stats")
async def get_account_stats(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get aggregate account statistics."""
    stmt = select(
        func.count(ClientAccount.id).label("total_accounts"),
        func.sum(ClientAccount.balance).label("total_balance"),
        func.count(
            func.nullif(ClientAccount.status != "active", True)
        ).label("active_accounts"),
    ).where(ClientAccount.firm_id == current_user.firm_id)

    result = await db.execute(stmt)
    row = result.first()

    return {
        "total_accounts": row[0] or 0,
        "total_balance": float(row[1] or 0),
        "active_accounts": row[2] or 0,
    }

@router.get("/compliance/accounts")
async def list_accounts(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List all client accounts for the firm."""
    stmt = (
        select(ClientAccount)
        .where(ClientAccount.firm_id == current_user.firm_id)
        .order_by(ClientAccount.created_at.desc())
    )

    result = await db.execute(stmt)
    accounts = result.scalars().all()

    return [
        {
            "id": a.id,
            "firm_id": a.firm_id,
            "account_name": a.account_name,
            "account_type": a.account_type,
            "balance": float(a.balance),
            "status": a.status,
            "bank_name": a.bank_name,
            "account_number": a.account_number,
            "sort_code": a.sort_code,
            "created_at": a.created_at,
            "updated_at": a.updated_at,
        }
        for a in accounts
    ]

@router.post("/compliance/accounts")
async def create_account(
    account: ClientAccountCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create a new client account."""
    new_account = ClientAccount(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        account_name=account.account_name,
        account_type=account.account_type,
        bank_name=account.bank_name,
        account_number=account.account_number,
        sort_code=account.sort_code,
        balance=Decimal(0),
        status="active",
    )

    db.add(new_account)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="client_account",
        entity_id=new_account.id,
        user_id=current_user.user_id,
        details=f"Account: {account.account_name}",
    )

    return {
        "id": new_account.id,
        "firm_id": new_account.firm_id,
        "account_name": new_account.account_name,
        "account_type": new_account.account_type,
        "balance": float(new_account.balance),
        "status": new_account.status,
        "bank_name": new_account.bank_name,
        "account_number": new_account.account_number,
        "sort_code": new_account.sort_code,
        "created_at": new_account.created_at,
        "updated_at": new_account.updated_at,
    }

@router.get("/compliance/accounts/{account_id}/transactions")
async def list_account_transactions(
    account_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List transactions for a specific account."""
    # Verify account belongs to firm
    account_stmt = select(ClientAccount).where(
        (ClientAccount.id == account_id)
        & (ClientAccount.firm_id == current_user.firm_id)
    )
    account_result = await db.execute(account_stmt)
    if not account_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Account not found")

    # List transactions
    stmt = (
        select(Transaction)
        .where(
            (Transaction.account_id == account_id)
            & (Transaction.firm_id == current_user.firm_id)
        )
        .order_by(Transaction.date.desc())
    )

    result = await db.execute(stmt)
    transactions = result.scalars().all()

    return [
        {
            "id": t.id,
            "firm_id": t.firm_id,
            "account_id": t.account_id,
            "date": t.date,
            "description": t.description,
            "amount": float(t.amount),
            "type": t.type,
            "matter_ref": t.matter_ref,
            "created_at": t.created_at,
        }
        for t in transactions
    ]

@router.post("/compliance/accounts/transactions")
async def record_transaction(
    transaction: TransactionCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Record a new transaction."""
    # Verify account exists and belongs to firm
    account_stmt = select(ClientAccount).where(
        (ClientAccount.id == transaction.account_id)
        & (ClientAccount.firm_id == current_user.firm_id)
    )
    account_result = await db.execute(account_stmt)
    account = account_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Create transaction
    new_transaction = Transaction(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        account_id=transaction.account_id,
        date=transaction.date,
        description=transaction.description,
        amount=transaction.amount,
        type=transaction.type,
        matter_ref=transaction.matter_ref,
    )

    db.add(new_transaction)

    # Update account balance
    if transaction.type == "credit":
        new_balance = account.balance + transaction.amount
    else:  # debit or transfer
        new_balance = account.balance - transaction.amount

    await db.execute(
        update(ClientAccount)
        .where(ClientAccount.id == transaction.account_id)
        .values(balance=new_balance)
    )

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="transaction",
        entity_id=new_transaction.id,
        user_id=current_user.user_id,
        details=f"{transaction.type}: {transaction.description}",
    )

    return {
        "id": new_transaction.id,
        "firm_id": new_transaction.firm_id,
        "account_id": new_transaction.account_id,
        "date": new_transaction.date,
        "description": new_transaction.description,
        "amount": float(new_transaction.amount),
        "type": new_transaction.type,
        "matter_ref": new_transaction.matter_ref,
        "created_at": new_transaction.created_at,
    }

@router.get("/compliance/accounts/reconciliations")
async def list_reconciliations(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List account reconciliations."""
    stmt = (
        select(Reconciliation)
        .where(Reconciliation.firm_id == current_user.firm_id)
        .order_by(Reconciliation.created_at.desc())
    )

    result = await db.execute(stmt)
    reconciliations = result.scalars().all()

    return [
        {
            "id": r.id,
            "firm_id": r.firm_id,
            "period": r.period,
            "status": r.status,
            "reconciled_by": r.reconciled_by,
            "discrepancies": r.discrepancies,
            "completed_at": r.completed_at,
            "created_at": r.created_at,
        }
        for r in reconciliations
    ]

@router.post("/compliance/accounts/reconciliations")
async def create_reconciliation(
    reconciliation: ReconciliationCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create a new account reconciliation."""
    new_reconciliation = Reconciliation(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        period=reconciliation.period,
        status="pending",
        discrepancies=reconciliation.discrepancies,
    )

    db.add(new_reconciliation)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="reconciliation",
        entity_id=new_reconciliation.id,
        user_id=current_user.user_id,
        details=f"{reconciliation.period} reconciliation",
    )

    return {
        "id": new_reconciliation.id,
        "firm_id": new_reconciliation.firm_id,
        "period": new_reconciliation.period,
        "status": new_reconciliation.status,
        "reconciled_by": new_reconciliation.reconciled_by,
        "discrepancies": new_reconciliation.discrepancies,
        "completed_at": new_reconciliation.completed_at,
        "created_at": new_reconciliation.created_at,
    }

@router.post("/compliance/accounts/reconciliations/{reconciliation_id}/cofa-signoff")
async def sign_off_reconciliation(
    reconciliation_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Sign off a reconciliation as COFA."""
    current_user.require_role("admin")

    stmt = (
        update(Reconciliation)
        .where(
            (Reconciliation.id == reconciliation_id)
            & (Reconciliation.firm_id == current_user.firm_id)
        )
        .values(
            status="complete",
            reconciled_by=current_user.user_id,
            completed_at=datetime.now(timezone.utc),
        )
        .returning(Reconciliation)
    )

    result = await db.execute(stmt)
    reconciliation = result.scalar_one_or_none()

    if not reconciliation:
        raise HTTPException(status_code=404, detail="Reconciliation not found")

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="signed_off",
        entity_type="reconciliation",
        entity_id=reconciliation_id,
        user_id=current_user.user_id,
        details="COFA sign-off completed",
    )

    return {
        "id": reconciliation.id,
        "firm_id": reconciliation.firm_id,
        "period": reconciliation.period,
        "status": reconciliation.status,
        "reconciled_by": reconciliation.reconciled_by,
        "discrepancies": reconciliation.discrepancies,
        "completed_at": reconciliation.completed_at,
        "created_at": reconciliation.created_at,
    }
