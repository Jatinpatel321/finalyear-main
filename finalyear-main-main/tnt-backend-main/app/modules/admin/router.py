from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from sqlalchemy import func

from app.core.deps import get_db
from app.core.emergency import set_emergency_shutdown
from app.core.faculty_policy import get_faculty_priority_policy, set_faculty_priority_policy
from app.core.security import require_role
from app.core.time_utils import utcnow_naive
from app.core.university_policy import get_university_policy, set_university_policy
from app.modules.ledger.model import Ledger
from app.modules.orders.model import Order, OrderStatus
from app.modules.payments.model import Payment, PaymentStatus
from app.modules.users.model import User, UserRole

from app.modules.admin.service import list_users, get_user_by_id, set_user_active
from app.modules.admin.schemas import (
    AdminUserListResponse,
    AdminUserDetailResponse,
    AdminUserStatusUpdate,
)
from app.modules.admin.conflict_service import get_conflict_summary
from app.modules.admin.conflict_schemas import ConflictSummaryResponse
from app.modules.admin import export_service
from app.modules.auditlog import service as audit_service
from app.modules.auditlog.service import AuditAction, AuditCategory

router = APIRouter(prefix="/admin", tags=["Admin"])


# 👀 VIEW ALL VENDORS
@router.get("/vendors")
def list_vendors(
    db: Session = Depends(get_db),
    user=Depends(require_role("admin"))
):
    return jsonable_encoder(db.query(User).filter(User.role == UserRole.VENDOR).all())


# ✅ APPROVE VENDOR
@router.post("/vendors/{vendor_id}/approve")
def approve_vendor(
    vendor_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin"))
) -> dict[str, Any]:
    vendor = db.query(User).filter(User.id == vendor_id).first()
    if not vendor or vendor.role != UserRole.VENDOR:
        raise HTTPException(status_code=404, detail="Vendor not found")

    before = {"is_approved": vendor.is_approved, "is_active": vendor.is_active}
    vendor.is_approved = True
    vendor.is_active = True
    db.commit()
    db.refresh(vendor)

    try:
        audit_service.write(
            db=db,
            action=AuditAction.VENDOR_APPROVED,
            action_category=AuditCategory.VENDOR,
            actor_id=user.get("id"),
            actor_role=user.get("role"),
            entity_type="Vendor",
            entity_id=str(vendor.id),
            before_state=before,
            after_state={"is_approved": True, "is_active": True},
        )
        db.commit()
    except Exception:
        db.rollback()

    return {"message": "Vendor approved", "vendor_id": vendor_id}


# 🚫 REJECT VENDOR
@router.post("/vendors/{vendor_id}/reject")
def reject_vendor(
    vendor_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin"))
) -> dict[str, Any]:
    vendor = db.query(User).filter(User.id == vendor_id).first()
    if not vendor or vendor.role != UserRole.VENDOR:
        raise HTTPException(status_code=404, detail="Vendor not found")

    before = {"is_approved": vendor.is_approved, "is_active": vendor.is_active}
    vendor.is_approved = False
    vendor.is_active = False
    db.commit()
    db.refresh(vendor)

    # Revoke all refresh tokens for rejected vendor
    try:
        from app.modules.auth.refresh_router import revoke_all_user_tokens
        revoke_all_user_tokens(vendor.id)
    except Exception:
        pass

    try:
        audit_service.write(
            db=db,
            action=AuditAction.VENDOR_REJECTED,
            action_category=AuditCategory.VENDOR,
            actor_id=user.get("id"),
            actor_role=user.get("role"),
            entity_type="Vendor",
            entity_id=str(vendor.id),
            before_state=before,
            after_state={"is_approved": False, "is_active": False},
        )
        db.commit()
    except Exception:
        db.rollback()

    try:
        from app.modules.notifications.service import notify_user
        notify_user(
            user_id=vendor.id,
            phone=vendor.phone,
            title="Application Status Update",
            message="Your vendor application has been rejected. Contact admin for details.",
            db=db,
        )
        db.commit()
    except Exception:
        pass

    return {"message": "Vendor rejected", "vendor_id": vendor_id}


# 🚫 BLOCK / UNBLOCK USER
@router.post("/users/{user_id}/toggle")
def toggle_user(
    user_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin"))
) -> dict[str, Any]:
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    before = {"is_active": db_user.is_active}
    was_just_blocked = db_user.is_active  # True before toggle means they're about to be blocked
    db_user.is_active = not db_user.is_active
    db.commit()
    db.refresh(db_user)

    # Revoke all refresh tokens when blocking a user (session revocation)
    if was_just_blocked and not db_user.is_active:
        try:
            from app.modules.auth.refresh_router import revoke_all_user_tokens
            revoke_all_user_tokens(user_id)
        except Exception:
            pass

    try:
        audit_service.write(
            db=db,
            action=AuditAction.USER_ACTIVATED if db_user.is_active else AuditAction.USER_BLOCKED,
            action_category=AuditCategory.USER,
            actor_id=user.get("id"),
            actor_role=user.get("role"),
            entity_type="User",
            entity_id=str(db_user.id),
            before_state=before,
            after_state={"is_active": db_user.is_active},
        )
        db.commit()
    except Exception:
        db.rollback()

    return {
        "user_id": user_id,
        "is_active": db_user.is_active
    }


# 📦 VIEW ALL ORDERS
@router.get("/orders")
def all_orders(
    db: Session = Depends(get_db),
    user=Depends(require_role("admin"))
):
    return jsonable_encoder(db.query(Order).order_by(Order.created_at.desc()).all())


# 📘 VIEW LEDGER
@router.get("/ledger")
def ledger_view(
    db: Session = Depends(get_db),
    user=Depends(require_role("admin"))
):
    return jsonable_encoder(db.query(Ledger).order_by(Ledger.created_at.desc()).all())


# 🚨 EMERGENCY SHUTDOWN
@router.post("/shutdown")
def emergency_shutdown(
    enabled: bool,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin"))
) -> dict[str, Any]:
    is_enabled = set_emergency_shutdown(enabled)
    return {
        "message": f"Emergency shutdown {'enabled' if is_enabled else 'disabled'}",
        "enabled": is_enabled,
    }


# 🚩 MARK ORDER AS FRAUD
@router.post("/orders/{order_id}/fraud")
def mark_order_fraud(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin"))
) -> dict[str, Any]:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.fraud_flag:
        raise HTTPException(status_code=400, detail="Order is already flagged as fraud")

    order.fraud_flag = True
    order.flagged_at = utcnow_naive()
    db.commit()
    db.refresh(order)

    try:
        audit_service.write(
            db=db,
            action=AuditAction.ORDER_OVERRIDE,
            action_category=AuditCategory.ORDER,
            actor_id=user.get("id"),
            actor_role=user.get("role"),
            entity_type="Order",
            entity_id=str(order.id),
            before_state={"fraud_flag": False},
            after_state={"fraud_flag": True, "flagged_at": order.flagged_at.isoformat()},
        )
        db.commit()
    except Exception:
        db.rollback()

    return {
        "message": "Order marked as fraud",
        "order_id": order.id,
        "flagged_at": order.flagged_at.isoformat(),
    }


# 📊 ANALYTICS ENDPOINT
@router.get("/analytics")
def get_analytics(
    db: Session = Depends(get_db),
    user=Depends(require_role("admin"))
) -> dict[str, Any]:
    from datetime import timedelta

    now = utcnow_naive()
    thirty_days_ago = now - timedelta(days=30)
    this_week_start = now - timedelta(days=7)
    last_week_start = now - timedelta(days=14)

    total_users = db.query(User).count()
    total_vendors = db.query(User).filter(User.role == UserRole.VENDOR).count()
    total_students = db.query(User).filter(User.role == UserRole.STUDENT).count()
    total_orders = db.query(Order).count()
    total_revenue_paise = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.status == PaymentStatus.SUCCESS
    ).scalar() or 0

    from sqlalchemy import cast, Date as SADate, text
    orders_by_day_rows = db.query(
        cast(Order.created_at, SADate).label("day"),
        func.count(Order.id).label("count"),
    ).filter(Order.created_at >= thirty_days_ago)\
     .group_by(cast(Order.created_at, SADate))\
     .order_by(cast(Order.created_at, SADate))\
     .all()
    orders_by_day = [{"date": str(r.day), "orders": r.count} for r in orders_by_day_rows]

    revenue_by_day_rows = db.query(
        cast(Payment.created_at, SADate).label("day"),
        func.coalesce(func.sum(Payment.amount), 0).label("revenue"),
    ).filter(
        Payment.status == PaymentStatus.SUCCESS,
        Payment.created_at >= thirty_days_ago,
    ).group_by(cast(Payment.created_at, SADate))\
     .order_by(cast(Payment.created_at, SADate))\
     .all()
    revenue_by_day = [{"date": str(r.day), "revenue_paise": int(r.revenue)} for r in revenue_by_day_rows]

    signups_by_day_rows = db.query(
        cast(User.created_at, SADate).label("day"),
        func.count(User.id).label("count"),
    ).filter(User.created_at >= thirty_days_ago)\
     .group_by(cast(User.created_at, SADate))\
     .order_by(cast(User.created_at, SADate))\
     .all()
    signups_by_day = [{"date": str(r.day), "signups": r.count} for r in signups_by_day_rows]

    status_rows = db.query(Order.status, func.count(Order.id)).group_by(Order.status).all()
    order_status = {row[0].value if row[0] else "unknown": row[1] for row in status_rows}

    pay_rows = db.query(Payment.status, func.count(Payment.id)).group_by(Payment.status).all()
    payment_status = {row[0].value if row[0] else "unknown": row[1] for row in pay_rows}

    top_vendor_rows = db.query(
        Order.vendor_id,
        func.count(Order.id).label("order_count"),
        func.coalesce(func.sum(Order.total_amount), 0).label("total_revenue"),
    ).group_by(Order.vendor_id)\
     .order_by(func.count(Order.id).desc())\
     .limit(10).all()
    top_vendors = [
        {
            "vendor_id": r.vendor_id,
            "order_count": r.order_count,
            "total_revenue_paise": int(r.total_revenue),
        }
        for r in top_vendor_rows
    ]

    from sqlalchemy import extract
    peak_rows = db.query(
        extract("hour", Order.created_at).label("hour"),
        func.count(Order.id).label("count"),
    ).group_by(extract("hour", Order.created_at))\
     .order_by(extract("hour", Order.created_at))\
     .all()
    peak_hours = {int(r.hour): r.count for r in peak_rows}

    this_week_orders = db.query(func.count(Order.id)).filter(
        Order.created_at >= this_week_start
    ).scalar() or 0
    last_week_orders = db.query(func.count(Order.id)).filter(
        Order.created_at >= last_week_start,
        Order.created_at < this_week_start,
    ).scalar() or 0

    this_week_revenue = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.status == PaymentStatus.SUCCESS,
        Payment.created_at >= this_week_start,
    ).scalar() or 0
    last_week_revenue = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.status == PaymentStatus.SUCCESS,
        Payment.created_at >= last_week_start,
        Payment.created_at < this_week_start,
    ).scalar() or 0

    total_flagged = db.query(func.count(Order.id)).filter(Order.fraud_flag == True).scalar() or 0
    fraud_rate_pct = round(total_flagged / total_orders * 100, 2) if total_orders else 0.0

    return {
        "totals": {
            "users": total_users,
            "vendors": total_vendors,
            "students": total_students,
            "orders": total_orders,
            "revenue_paise": int(total_revenue_paise),
        },
        "orders_by_day": orders_by_day,
        "revenue_by_day": revenue_by_day,
        "signups_by_day": signups_by_day,
        "order_status": order_status,
        "payment_status": payment_status,
        "top_vendors": top_vendors,
        "peak_hours": peak_hours,
        "week_comparison": {
            "this_week": {"orders": this_week_orders, "revenue_paise": int(this_week_revenue)},
            "last_week": {"orders": last_week_orders, "revenue_paise": int(last_week_revenue)},
            "order_delta": this_week_orders - last_week_orders,
            "revenue_delta_paise": int(this_week_revenue) - int(last_week_revenue),
        },
        "fraud_stats": {
            "total_flagged": total_flagged,
            "fraud_rate_pct": fraud_rate_pct,
        },
    }


# 👥 USER MANAGEMENT
@router.get("/users", response_model=AdminUserListResponse)
def list_all_users(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search by name or phone"),
    role: Optional[str] = Query(None, description="Filter by role: student | faculty | vendor | staff | admin"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    db: Session = Depends(get_db),
    user=Depends(require_role("admin")),
):
    return list_users(
        db=db,
        page=page,
        page_size=page_size,
        search=search,
        role=role,
        is_active=is_active,
    )


@router.get("/users/{user_id}", response_model=AdminUserDetailResponse)
def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin")),
):
    db_user = get_user_by_id(db, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user


@router.patch("/users/{user_id}/status", response_model=AdminUserDetailResponse)
def update_user_status(
    user_id: int,
    payload: AdminUserStatusUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin")),
):
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    before = {"is_active": db_user.is_active}
    was_just_blocked = db_user.is_active  # True before means they're about to be blocked
    db_user.is_active = payload.is_active
    db.commit()
    db.refresh(db_user)

    # Revoke all refresh tokens when blocking a user (session revocation)
    if was_just_blocked and not db_user.is_active:
        try:
            from app.modules.auth.refresh_router import revoke_all_user_tokens
            revoke_all_user_tokens(user_id)
        except Exception:
            pass

    try:
        audit_service.write(
            db=db,
            action=AuditAction.USER_ACTIVATED if db_user.is_active else AuditAction.USER_BLOCKED,
            action_category=AuditCategory.USER,
            actor_id=user.get("id"),
            actor_role=user.get("role"),
            entity_type="User",
            entity_id=str(db_user.id),
            before_state=before,
            after_state={"is_active": db_user.is_active},
        )
        db.commit()
    except Exception:
        db.rollback()

    return db_user


# ⚠️ CONFLICT RESOLUTION
@router.get("/conflicts", response_model=ConflictSummaryResponse)
def get_conflicts(
    db: Session = Depends(get_db),
    user=Depends(require_role("admin")),
):
    return get_conflict_summary(db)


# 📥 EXPORT ENDPOINTS
@router.get("/export/orders", summary="Export orders as CSV")
def export_orders(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role("admin")),
):
    return export_service.export_orders_csv(db, date_from, date_to, status)


@router.get("/export/users", summary="Export users as CSV")
def export_users(
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role("admin")),
):
    return export_service.export_users_csv(db, role, is_active)


@router.get("/export/vendors", summary="Export vendors as CSV")
def export_vendors(
    db: Session = Depends(get_db),
    user=Depends(require_role("admin")),
):
    return export_service.export_vendors_csv(db)


@router.get("/export/complaints", summary="Export complaints as CSV")
def export_complaints(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role("admin")),
):
    return export_service.export_complaints_csv(db, status)


@router.get("/export/revenue", summary="Export daily revenue summary as CSV")
def export_revenue(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role("admin")),
):
    return export_service.export_revenue_csv(db, date_from, date_to)


# 🏛 POLICIES
@router.get("/policies/faculty-priority")
def get_faculty_priority_policy_endpoint(user=Depends(require_role("admin"))) -> dict[str, Any]:
    return get_faculty_priority_policy()


@router.post("/policies/faculty-priority")
def set_faculty_priority_policy_endpoint(
    enabled: bool,
    start_hour: int = 12,
    end_hour: int = 14,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin")),
) -> dict[str, Any]:
    if start_hour < 0 or start_hour > 23 or end_hour < 1 or end_hour > 24:
        raise HTTPException(status_code=400, detail="Hours must be within 0-24")
    if end_hour <= start_hour:
        raise HTTPException(status_code=400, detail="end_hour must be greater than start_hour")

    before = get_faculty_priority_policy()
    result = set_faculty_priority_policy(enabled, start_hour, end_hour)

    try:
        audit_service.write(
            db=db,
            action=AuditAction.FACULTY_POLICY_UPDATED,
            action_category=AuditCategory.POLICY,
            actor_id=user.get("id"),
            actor_role=user.get("role"),
            entity_type="Policy",
            entity_id="faculty-priority",
            before_state=before,
            after_state=result,
        )
        db.commit()
    except Exception:
        db.rollback()

    return result


@router.get("/policies/university")
def get_university_policy_endpoint(user=Depends(require_role("admin"))) -> dict[str, Any]:
    return get_university_policy()


@router.post("/policies/university")
def set_university_policy_endpoint(
    enabled: bool,
    break_start_hour: int = 12,
    break_end_hour: int = 14,
    max_orders_per_user: int = 3,
    min_slot_duration_minutes: int = 15,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin")),
) -> dict[str, Any]:
    if break_start_hour < 0 or break_start_hour > 23:
        raise HTTPException(status_code=400, detail="break_start_hour must be in 0-23")
    if break_end_hour < 1 or break_end_hour > 24:
        raise HTTPException(status_code=400, detail="break_end_hour must be in 1-24")
    if break_end_hour <= break_start_hour:
        raise HTTPException(status_code=400, detail="break_end_hour must be greater than break_start_hour")
    if max_orders_per_user < 1:
        raise HTTPException(status_code=400, detail="max_orders_per_user must be at least 1")
    if min_slot_duration_minutes < 5:
        raise HTTPException(status_code=400, detail="min_slot_duration_minutes must be at least 5")

    before = get_university_policy()
    result = set_university_policy(
        enabled=enabled,
        break_start_hour=break_start_hour,
        break_end_hour=break_end_hour,
        max_orders_per_user=max_orders_per_user,
        min_slot_duration_minutes=min_slot_duration_minutes,
    )

    try:
        audit_service.write(
            db=db,
            action=AuditAction.POLICY_UPDATED,
            action_category=AuditCategory.POLICY,
            actor_id=user.get("id"),
            actor_role=user.get("role"),
            entity_type="Policy",
            entity_id="university",
            before_state=before,
            after_state=result,
        )
        db.commit()
    except Exception:
        db.rollback()

    return result


# 📢 GLOBAL ANNOUNCEMENT
@router.post("/announce")
def send_global_announcement(
    message: str,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin"))
) -> dict[str, Any]:
    from app.modules.notifications.service import notify_user

    users = db.query(User).all()
    for user_obj in users:
        notify_user(
            user_id=user_obj.id,
            phone=user_obj.phone,
            title="Admin Announcement",
            message=message,
            db=db
        )

    try:
        audit_service.write(
            db=db,
            action=AuditAction.ANNOUNCEMENT_SENT,
            action_category=AuditCategory.ANNOUNCEMENT,
            actor_id=user.get("id"),
            actor_role=user.get("role"),
            entity_type="Announcement",
            metadata={"message": message, "recipient_count": len(users)},
        )
        db.commit()
    except Exception:
        db.rollback()

    return {"message": "Announcement sent to all users"}
