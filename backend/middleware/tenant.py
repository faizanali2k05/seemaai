"""Tenant scoping helper for multi-tenant queries."""
from sqlalchemy import and_, select as sqlalchemy_select
from sqlalchemy.orm import Query


class TenantQuery:
    """Helper class to scope queries to a specific firm_id (tenant).

    Usage:
        tq = TenantQuery(firm_id)
        stmt = tq.select(Model, Model.name == "test")
        result = await db.execute(stmt)
    """

    def __init__(self, firm_id: str):
        self.firm_id = firm_id

    def select(self, model, *conditions):
        """Create a scoped select statement for a model and optional conditions.

        Args:
            model: The SQLAlchemy model class
            *conditions: Optional filter conditions

        Returns:
            A SQLAlchemy select statement scoped to firm_id
        """
        # Build the base condition for firm_id
        firm_condition = model.firm_id == self.firm_id

        if conditions:
            # Combine firm_id condition with provided conditions
            stmt = sqlalchemy_select(model).where(and_(firm_condition, *conditions))
        else:
            # Just the firm_id condition
            stmt = sqlalchemy_select(model).where(firm_condition)

        return stmt

    def filter_for_tenant(self, query, model):
        """Filter an existing query for the current tenant.

        Args:
            query: The SQLAlchemy query object
            model: The model being queried

        Returns:
            Filtered query
        """
        return query.where(model.firm_id == self.firm_id)
